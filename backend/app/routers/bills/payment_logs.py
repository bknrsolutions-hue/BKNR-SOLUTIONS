from datetime import date

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.bills import ContractorBillPayment
from app.database.models.enterprise_finance import SalaryProcessing
from app.database.models.payments import PaymentReceipt
from app.services.bill_accounting import cancel_linked_bill_voucher
from app.utils.timezone import ist_now
from .contractor_bills import ensure_contractor_payment_schema
from .salaries import ensure_salary_payment_log_schema

router = APIRouter(prefix="/payment_logs", tags=["Payment Logs"])
templates = Jinja2Templates(directory="app/templates")


def current_month_key() -> str:
    return ist_now().date().strftime("%Y-%m")


def salary_payment_rows(db: Session, company_id: str, month: str):
    ensure_salary_payment_log_schema(db)
    log_rows = db.execute(text("""
        SELECT
            'salary' AS source_type,
            spl.id AS payment_id,
            spl.month_year,
            spl.employee_name AS party_name,
            spl.employee_id AS party_code,
            spl.paid_amount,
            spl.payment_mode,
            spl.payment_date,
            spl.utr_reference,
            spl.payment_status,
            spl.is_cancelled,
            spl.created_at,
            vh.voucher_no,
            vh.status AS voucher_status,
            lm.ledger_name AS bank_cash_account
        FROM salary_payment_logs spl
        LEFT JOIN voucher_headers vh
          ON vh.id = spl.journal_id AND vh.company_id = spl.company_id
        LEFT JOIN ledger_masters lm
          ON lm.id = spl.bank_cash_ledger_id AND lm.company_id = spl.company_id
        WHERE spl.company_id = :company_id
          AND (:month = '' OR spl.month_year = :month)
        ORDER BY spl.payment_date DESC NULLS LAST, spl.id DESC
    """), {"company_id": company_id, "month": month or ""}).mappings().all()
    legacy_rows = db.execute(text("""
        SELECT
            'salary_legacy' AS source_type,
            sp.id AS payment_id,
            sp.month_year,
            sp.employee_name AS party_name,
            sp.employee_id AS party_code,
            sp.paid_amount,
            sp.payment_mode,
            sp.payment_date,
            sp.utr_reference,
            sp.payment_status,
            sp.is_cancelled,
            sp.created_at,
            vh.voucher_no,
            vh.status AS voucher_status,
            '' AS bank_cash_account
        FROM salary_processing sp
        LEFT JOIN voucher_headers vh
          ON vh.id = sp.payment_journal_id AND vh.company_id = sp.company_id
        WHERE sp.company_id = :company_id
          AND (:month = '' OR sp.month_year = :month)
          AND COALESCE(sp.paid_amount, 0) > 0
          AND NOT EXISTS (
              SELECT 1
              FROM salary_payment_logs spl
              WHERE spl.company_id = sp.company_id
                AND spl.salary_id = sp.id
          )
        ORDER BY sp.payment_date DESC NULLS LAST, sp.id DESC
    """), {"company_id": company_id, "month": month or ""}).mappings().all()
    return list(log_rows) + list(legacy_rows)


def contractor_payment_rows(db: Session, company_id: str, month: str):
    ensure_contractor_payment_schema(db)
    return db.execute(text("""
        SELECT
            'contractor' AS source_type,
            cbp.id AS payment_id,
            cbp.month_year,
            cbp.contractor_name AS party_name,
            '' AS party_code,
            cbp.paid_amount,
            cbp.payment_mode,
            cbp.payment_date,
            cbp.utr_reference,
            cbp.payment_status,
            cbp.is_cancelled,
            cbp.created_at,
            vh.voucher_no,
            vh.status AS voucher_status,
            lm.ledger_name AS bank_cash_account
        FROM contractor_bill_payments cbp
        LEFT JOIN voucher_headers vh
          ON vh.id = cbp.journal_id AND vh.company_id = cbp.company_id
        LEFT JOIN ledger_masters lm
          ON lm.id = cbp.bank_cash_ledger_id AND lm.company_id = cbp.company_id
        WHERE cbp.company_id = :company_id
          AND (:month = '' OR cbp.month_year = :month)
        ORDER BY cbp.payment_date DESC NULLS LAST, cbp.id DESC
    """), {"company_id": company_id, "month": month or ""}).mappings().all()


def vendor_payment_rows(db: Session, company_id: str, month: str):
    return db.execute(text("""
        SELECT
            CASE WHEN pr.transaction_type = 'SUPPLIER_PAYMENT' THEN 'supplier' ELSE 'vendor' END AS source_type,
            pr.id AS payment_id,
            TO_CHAR(pr.entry_date, 'YYYY-MM') AS month_year,
            pr.party_ledger AS party_name,
            pr.vendor_bill_no AS party_code,
            pr.amount_inr AS paid_amount,
            pr.payment_mode,
            pr.entry_date AS payment_date,
            pr.reference_no AS utr_reference,
            CASE WHEN COALESCE(pr.is_cancelled, FALSE) THEN 'CANCELLED' ELSE 'POSTED' END AS payment_status,
            pr.is_cancelled,
            pr.created_at,
            vh.voucher_no,
            vh.status AS voucher_status,
            pr.bank_cash_ledger AS bank_cash_account
        FROM payment_receipts pr
        LEFT JOIN voucher_headers vh
          ON vh.id = pr.journal_id AND vh.company_id = pr.company_id
        WHERE pr.company_id = :company_id
          AND pr.transaction_type IN ('VENDOR_PAYMENT', 'SUPPLIER_PAYMENT')
          AND (:month = '' OR TO_CHAR(pr.entry_date, 'YYYY-MM') = :month)
        ORDER BY pr.entry_date DESC NULLS LAST, pr.id DESC
    """), {"company_id": company_id, "month": month or ""}).mappings().all()


def normalize_rows(rows):
    result = []
    for row in rows:
        result.append({
            "source_type": row["source_type"],
            "payment_id": row["payment_id"],
            "month_year": row["month_year"] or "",
            "party_name": row["party_name"] or "",
            "party_code": row["party_code"] or "",
            "paid_amount": round(float(row["paid_amount"] or 0.0), 2),
            "payment_mode": row["payment_mode"] or "",
            "payment_date": row["payment_date"].isoformat() if row["payment_date"] else "",
            "utr_reference": row["utr_reference"] or "",
            "payment_status": row["payment_status"] or "",
            "is_cancelled": bool(row["is_cancelled"]),
            "created_at": row["created_at"].isoformat() if row["created_at"] else "",
            "voucher_no": row["voucher_no"] or "",
            "voucher_status": row["voucher_status"] or "",
            "bank_cash_account": row["bank_cash_account"] or "",
        })
    return result


def recompute_salary_after_payment_cancel(db: Session, company_id: str, salary_id: int):
    salary = db.query(SalaryProcessing).filter(
        SalaryProcessing.company_id == company_id,
        SalaryProcessing.id == salary_id,
    ).first()
    if not salary:
        return

    rows = db.execute(text("""
        SELECT paid_amount, payment_mode, payment_date, utr_reference, journal_id
        FROM salary_payment_logs
        WHERE company_id = :company_id
          AND salary_id = :salary_id
          AND COALESCE(is_cancelled, FALSE) = FALSE
        ORDER BY id ASC
    """), {"company_id": company_id, "salary_id": salary_id}).mappings().all()
    paid_amount = round(sum(float(row["paid_amount"] or 0.0) for row in rows), 2)
    net_payable = round(float(salary.net_payable or 0.0), 2)
    latest = rows[-1] if rows else None

    salary.paid_amount = paid_amount
    salary.payment_status = "PAID" if paid_amount > 0 and abs(paid_amount - net_payable) <= 0.01 else ("PARTIAL" if paid_amount > 0 else "UNPAID")
    salary.payment_journal_id = latest["journal_id"] if latest else None
    salary.payment_mode = latest["payment_mode"] if latest else None
    salary.payment_date = latest["payment_date"] if latest else None
    salary.utr_reference = latest["utr_reference"] if latest else None
    if salary.payment_status == "PAID":
        salary.status = "PAID"
    elif salary.status == "PAID":
        salary.status = "APPROVED"


@router.get("/entry", response_class=HTMLResponse)
def payment_logs_page(request: Request):
    if not request.session.get("email") or not request.session.get("company_code"):
        return RedirectResponse("/", status_code=302)
    today = ist_now().date()
    selected_fy = today.year if today.month >= 4 else today.year - 1
    return templates.TemplateResponse(
        request=request,
        name="bills/payment_logs.html",
        context={
            "selected_month": "",
            "selected_fy": selected_fy,
        },
    )


@router.get("/data")
def payment_logs_data(
    request: Request,
    month: str = Query(default=""),
    source: str = Query(default="all"),
    include_cancelled: bool = Query(default=False),
    db: Session = Depends(get_db),
):
    company_id = request.session.get("company_code")
    if not company_id:
        return JSONResponse({"success": False, "message": "Session expired"}, status_code=401)
    rows = []
    if source in {"all", "salary"}:
        rows.extend(normalize_rows(salary_payment_rows(db, company_id, month)))
    if source in {"all", "contractor"}:
        rows.extend(normalize_rows(contractor_payment_rows(db, company_id, month)))
    if source in {"all", "vendor", "supplier"}:
        rows.extend(normalize_rows(vendor_payment_rows(db, company_id, month)))
    if not include_cancelled:
        rows = [row for row in rows if not row["is_cancelled"]]
    rows.sort(key=lambda item: (item["payment_date"] or "", item["created_at"] or "", item["payment_id"]), reverse=True)
    total = round(sum(row["paid_amount"] for row in rows if not row["is_cancelled"]), 2)
    cancelled_total = round(sum(row["paid_amount"] for row in rows if row["is_cancelled"]), 2)
    return {"success": True, "rows": rows, "total": total, "cancelled_total": cancelled_total}


@router.post("/cancel/{source_type}/{payment_id}")
def cancel_payment_log(source_type: str, payment_id: int, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    email = request.session.get("email") or "SYSTEM"
    if not company_id:
        return JSONResponse({"success": False, "message": "Session expired"}, status_code=401)

    try:
        if source_type == "salary":
            ensure_salary_payment_log_schema(db)
            row = db.execute(text("""
                SELECT id, salary_id, journal_id, is_cancelled
                FROM salary_payment_logs
                WHERE company_id = :company_id AND id = :payment_id
            """), {"company_id": company_id, "payment_id": payment_id}).mappings().first()
            if not row:
                return JSONResponse({"success": False, "message": "Salary payment log not found"}, status_code=404)
            if row["is_cancelled"]:
                return JSONResponse({"success": False, "message": "Payment already cancelled"}, status_code=400)
            cancel_linked_bill_voucher(db, company_id, row["journal_id"], email)
            db.execute(text("""
                UPDATE salary_payment_logs
                SET is_cancelled = TRUE
                WHERE company_id = :company_id AND id = :payment_id
            """), {"company_id": company_id, "payment_id": payment_id})
            recompute_salary_after_payment_cancel(db, company_id, row["salary_id"])

        elif source_type == "salary_legacy":
            ensure_salary_payment_log_schema(db)
            salary = db.query(SalaryProcessing).filter(
                SalaryProcessing.company_id == company_id,
                SalaryProcessing.id == payment_id,
            ).first()
            if not salary:
                return JSONResponse({"success": False, "message": "Legacy salary payment not found"}, status_code=404)
            if salary.is_cancelled or float(salary.paid_amount or 0.0) <= 0:
                return JSONResponse({"success": False, "message": "Payment already cancelled"}, status_code=400)
            paid_amount = round(float(salary.paid_amount or 0.0), 2)
            payment_mode = salary.payment_mode
            payment_date = salary.payment_date
            utr_reference = salary.utr_reference
            journal_id = salary.payment_journal_id
            cancel_linked_bill_voucher(db, company_id, salary.payment_journal_id, email)
            db.execute(text("""
                INSERT INTO salary_payment_logs (
                    company_id, salary_id, employee_id, employee_name, month_year,
                    paid_amount, payment_mode, payment_date, utr_reference,
                    payment_status, journal_id, is_cancelled, created_by
                ) VALUES (
                    :company_id, :salary_id, :employee_id, :employee_name, :month_year,
                    :paid_amount, :payment_mode, :payment_date, :utr_reference,
                    'CANCELLED', :journal_id, TRUE, :created_by
                )
            """), {
                "company_id": company_id,
                "salary_id": salary.id,
                "employee_id": salary.employee_id,
                "employee_name": salary.employee_name,
                "month_year": salary.month_year,
                "paid_amount": paid_amount,
                "payment_mode": payment_mode,
                "payment_date": payment_date,
                "utr_reference": utr_reference,
                "journal_id": journal_id,
                "created_by": email,
            })
            salary.paid_amount = 0.0
            salary.payment_status = "UNPAID"
            salary.payment_journal_id = None
            salary.payment_mode = None
            salary.payment_date = None
            salary.utr_reference = None
            if salary.status == "PAID":
                salary.status = "APPROVED"

        elif source_type == "contractor":
            ensure_contractor_payment_schema(db)
            payment = db.query(ContractorBillPayment).filter(
                ContractorBillPayment.company_id == company_id,
                ContractorBillPayment.id == payment_id,
            ).first()
            if not payment:
                return JSONResponse({"success": False, "message": "Contractor payment log not found"}, status_code=404)
            if payment.is_cancelled:
                return JSONResponse({"success": False, "message": "Payment already cancelled"}, status_code=400)
            cancel_linked_bill_voucher(db, company_id, payment.journal_id, email)
            payment.is_cancelled = True
            payment.payment_status = "CANCELLED"
        elif source_type in {"vendor", "supplier"}:
            payment = db.query(PaymentReceipt).filter(
                PaymentReceipt.company_id == company_id,
                PaymentReceipt.id == payment_id,
                PaymentReceipt.transaction_type == ("SUPPLIER_PAYMENT" if source_type == "supplier" else "VENDOR_PAYMENT"),
            ).first()
            if not payment:
                return JSONResponse({"success": False, "message": "Vendor payment log not found"}, status_code=404)
            if payment.is_cancelled:
                return JSONResponse({"success": False, "message": "Payment already cancelled"}, status_code=400)
            cancel_linked_bill_voucher(db, company_id, payment.journal_id, email)
            payment.is_cancelled = True
        else:
            return JSONResponse({"success": False, "message": "Invalid payment source"}, status_code=400)

        db.commit()
        return {"success": True, "message": "Payment cancelled. Amount moved back to outstanding."}
    except Exception as exc:
        db.rollback()
        return JSONResponse({"success": False, "message": f"Cancel failed: {str(exc)}"}, status_code=400)
