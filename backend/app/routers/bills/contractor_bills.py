from collections import defaultdict
import calendar
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sqlalchemy import extract, func, text
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.attendance import (
    DailyAttendance,
    EmployeeRegistration,
    EmployeeSalaryAdvance,
    EmployeeStatutoryMaster,
    Shift,
)
from app.database.models.criteria import contractors
from app.database.models.bills import ContractorBillPayment
from app.database.models.enterprise_finance import AccountGroup, LedgerMaster, VoucherHeader
from app.database.models.processing import DeHeading, Peeling
from app.database.models.users import Company
from app.services.bill_accounting import cancel_linked_bill_voucher, ensure_bill_accounting_schema
from app.services.posting_engine import PostingEngineService
from app.utils.cancel_math import signed_number
from app.utils.timezone import ist_now

router = APIRouter(prefix="/contractor_bills", tags=["Contractor Bills"])
templates = Jinja2Templates(directory="app/templates")


class ContractorPaymentPayload(BaseModel):
    amount: float
    bill_total: float = 0.0
    payment_mode: str = "BANK"
    payment_date: date | None = None
    utr_reference: str | None = None
    bank_cash_ledger_id: int | None = None


def ensure_contractor_payment_schema(db: Session) -> None:
    ContractorBillPayment.__table__.create(bind=db.get_bind(), checkfirst=True)
    ensure_bill_accounting_schema(db)
    db.execute(text("ALTER TABLE contractor_bill_payments ADD COLUMN IF NOT EXISTS bank_cash_ledger_id INTEGER"))
    db.flush()


def bank_cash_ledgers(db: Session, company_id: str):
    return (
        db.query(LedgerMaster)
        .join(AccountGroup, LedgerMaster.group_id == AccountGroup.id)
        .filter(
            LedgerMaster.company_id == company_id,
            LedgerMaster.status == "ACTIVE",
            AccountGroup.group_name.in_(["Bank Accounts", "Cash-in-hand"]),
        )
        .order_by(AccountGroup.group_name, LedgerMaster.ledger_name)
        .all()
    )


def selected_bank_cash_ledger(db: Session, company_id: str, ledger_id: int | None):
    if not ledger_id:
        return None
    return (
        db.query(LedgerMaster)
        .join(AccountGroup, LedgerMaster.group_id == AccountGroup.id)
        .filter(
            LedgerMaster.company_id == company_id,
            LedgerMaster.id == ledger_id,
            LedgerMaster.status == "ACTIVE",
            AccountGroup.group_name.in_(["Bank Accounts", "Cash-in-hand"]),
        )
        .first()
    )


def get_company_shift_map(db: Session, company_id: str):
    shifts = db.query(Shift).filter(Shift.company_id == company_id).all()
    shift_map = {}
    for shift in shifts:
        if shift.start_time and shift.end_time:
            start_dt = datetime.combine(date.today(), shift.start_time)
            end_dt = datetime.combine(date.today(), shift.end_time)
            if end_dt < start_dt:
                end_dt += timedelta(days=1)
            hours = (end_dt - start_dt).total_seconds() / 3600.0
            break_hours = (shift.break_minutes or 0) / 60.0
            shift_map[shift.shift_name] = max(1.0, hours - break_hours)
        else:
            shift_map[shift.shift_name] = 8.0
    return shift_map


def parse_month(month: str):
    year, month_no = map(int, month.split("-"))
    return year, month_no, calendar.monthrange(year, month_no)[1]


def company_context(db: Session, company_code: str):
    company = db.query(Company).filter(Company.company_code == company_code).first()
    return {
        "name": company.company_name if company else company_code,
        "address": company.address if company else "",
        "email": company.email if company else "",
        "gst_number": getattr(company, "gst_number", None) if company else None,
    }


def contractor_context(db: Session, company_id: str, contractor_name: str):
    row = (
        db.query(contractors)
        .filter(contractors.company_id == company_id, contractors.contractor_name == contractor_name)
        .first()
    )
    return {
        "name": contractor_name,
        "address": row.address if row else "",
        "phone": row.phone if row else "",
        "email": row.contractor_email if row else "",
        "gst_number": row.gst_number if row else "",
        "gst_percent": float(row.gst_percent or 0) if row else 0.0,
        "bank_name": row.bank_name if row else "",
        "account_no": row.account_no if row else "",
        "ifsc": row.ifsc if row else "",
    }


def tax_breakup(subtotal: float, contractor_info: dict, company_info: dict):
    percent = float(contractor_info.get("gst_percent") or 0)
    if percent <= 0:
        return [], round(subtotal, 2)

    contractor_gst = str(contractor_info.get("gst_number") or "").strip()
    company_gst = str(company_info.get("gst_number") or "").strip()
    tax_total = round(subtotal * percent / 100, 2)

    rows = []
    if len(contractor_gst) >= 2 and len(company_gst) >= 2:
        if contractor_gst[:2] == company_gst[:2]:
            half_percent = percent / 2
            half_tax = round(tax_total / 2, 2)
            rows = [
                {"label": f"CGST @ {half_percent:g}%", "amount": half_tax},
                {"label": f"SGST @ {half_percent:g}%", "amount": round(tax_total - half_tax, 2)},
            ]
        else:
            rows = [{"label": f"IGST @ {percent:g}%", "amount": tax_total}]
    else:
        rows = [{"label": f"GST @ {percent:g}%", "amount": tax_total}]

    return rows, round(subtotal + tax_total, 2)


def processing_salary_rows(db: Session, company_id: str, month: str, contractor_name: str):
    year, month_no, days_in_month = parse_month(month)
    shift_map = get_company_shift_map(db, company_id)

    employees = (
        db.query(EmployeeRegistration)
        .filter(
            EmployeeRegistration.company_id == company_id,
            EmployeeRegistration.status == "ACTIVE",
            EmployeeRegistration.employee_type == "CONTRACT",
            EmployeeRegistration.contractor_name == contractor_name,
        )
        .order_by(EmployeeRegistration.employee_name)
        .all()
    )

    result = []
    for emp in employees:
        attendance_records = (
            db.query(DailyAttendance)
            .filter(
                DailyAttendance.employee_id == emp.employee_id,
                DailyAttendance.company_id == company_id,
                extract("year", DailyAttendance.duty_date) == year,
                extract("month", DailyAttendance.duty_date) == month_no,
            )
            .all()
        )

        daily_att_values = defaultdict(float)
        adjustment = 0.0
        total_approved_ot = 0.0
        ot_earnings = 0.0
        base_gross = float(emp.current_salary or 0)
        per_day_rate = base_gross / 26.0 if base_gross else 0.0

        for rec in attendance_records:
            if rec.salary_adjustment:
                adjustment = max(adjustment, float(rec.salary_adjustment))

            req_hours = shift_map.get(rec.shift_name or "GENERAL", 8.0)
            raw_credit = float(rec.working_hours or 0) / req_hours if req_hours > 0 else 0
            if raw_credit < 0.5:
                duty_credit = 0.0
            elif raw_credit < 1.0:
                duty_credit = 0.5
            elif raw_credit < 1.5:
                duty_credit = 1.0
            elif raw_credit < 2.0:
                duty_credit = 1.5
            elif raw_credit < 2.5:
                duty_credit = 2.0
            elif raw_credit < 3.0:
                duty_credit = 2.5
            else:
                duty_credit = 3.0

            if duty_credit > 1.0 and getattr(rec, "duty_status", "APPROVED") != "APPROVED":
                duty_credit = 1.0

            daily_att_values[rec.duty_date.day] += duty_credit if duty_credit >= 0.5 else 0.0

            if getattr(rec, "ot_status", None) == "APPROVED" and getattr(rec, "approved_ot_hours", None):
                approved_ot_hrs = float(rec.approved_ot_hours)
                total_approved_ot += approved_ot_hrs
                hourly_rate = per_day_rate / req_hours if req_hours > 0 else per_day_rate / 8.0
                ot_earnings += approved_ot_hrs * hourly_rate

        actual_present_count = sum(daily_att_values.get(day, 0.0) for day in range(1, days_in_month + 1))
        worked_days_count = sum(1 for day in range(1, days_in_month + 1) if daily_att_values.get(day, 0.0) > 0)

        if worked_days_count >= 25:
            extra_holidays = 4
        elif worked_days_count > 13:
            extra_holidays = 3
        elif worked_days_count == 13:
            extra_holidays = 2
        elif worked_days_count >= 7:
            extra_holidays = 1
        else:
            extra_holidays = 0

        total_payable_days = actual_present_count + extra_holidays + adjustment
        earned_gross = (total_payable_days * per_day_rate) + ot_earnings
        tds_amount = earned_gross * float(emp.tds or 0) / 100

        stat = (
            db.query(EmployeeStatutoryMaster)
            .filter(
                EmployeeStatutoryMaster.employee_id == emp.employee_id,
                EmployeeStatutoryMaster.company_id == company_id,
                EmployeeStatutoryMaster.status == "ACTIVE",
            )
            .first()
        )

        pf = esi = pt = lwf = 0.0
        if stat:
            if stat.pf_applicable:
                pf_wage = min(stat.pf_wage_limit, float(emp.basic_salary or 0))
                pf = pf_wage * (stat.pf_employee_percent / 100)
            if stat.esi_applicable and earned_gross <= stat.esi_wage_limit:
                esi = earned_gross * (stat.esi_employee_percent / 100)
            pt = stat.pt_amount or 0
            lwf = stat.lwf_employee_amount or 0

        adv_rec = (
            db.query(EmployeeSalaryAdvance)
            .filter(
                EmployeeSalaryAdvance.employee_id == emp.employee_id,
                EmployeeSalaryAdvance.company_id == company_id,
                EmployeeSalaryAdvance.status == "APPROVED",
                EmployeeSalaryAdvance.remaining_balance > 0,
                EmployeeSalaryAdvance.deduct_from <= month,
                getattr(EmployeeSalaryAdvance, "deduct_to", month) >= month,
            )
            .first()
        )
        salary_advance = min(adv_rec.monthly_deduction, adv_rec.remaining_balance) if adv_rec else 0
        net_pay = earned_gross - (pf + esi + pt + lwf + tds_amount + salary_advance)

        result.append(
            {
                "employee_name": emp.employee_name,
                "working_days": round(actual_present_count, 2),
                "payable": round(net_pay, 2),
            }
        )

    return result


def previous_month_key(month: str) -> str:
    year, month_no, _ = parse_month(month)
    first_day = date(year, month_no, 1)
    previous_day = first_day - timedelta(days=1)
    return previous_day.strftime("%Y-%m")


def contractor_month_grand_total(db: Session, company_id: str, month: str, contractor_name: str, company_info: dict) -> float:
    year, month_no, _ = parse_month(month)
    deheading_total = db.query(func.coalesce(func.sum(DeHeading.amount), 0.0)).filter(
        DeHeading.company_id == company_id,
        DeHeading.contractor == contractor_name,
        DeHeading.is_cancelled != True,
        extract("year", DeHeading.date) == year,
        extract("month", DeHeading.date) == month_no,
    ).scalar() or 0.0
    peeling_total = db.query(func.coalesce(func.sum(Peeling.amount), 0.0)).filter(
        Peeling.company_id == company_id,
        Peeling.contractor_name == contractor_name,
        Peeling.is_cancelled != True,
        extract("year", Peeling.date) == year,
        extract("month", Peeling.date) == month_no,
    ).scalar() or 0.0
    processing_total = sum(row["payable"] for row in processing_salary_rows(db, company_id, month, contractor_name))
    subtotal = round(float(deheading_total or 0.0) + float(peeling_total or 0.0) + processing_total, 2)
    _, grand_total = tax_breakup(subtotal, contractor_context(db, company_id, contractor_name), company_info)
    return grand_total


def operation_summary(db: Session, company_id: str, month: str):
    company_info = company_context(db, company_id)
    deheading_rows = (
        db.query(DeHeading)
        .filter(DeHeading.company_id == company_id, extract("year", DeHeading.date) == int(month[:4]), extract("month", DeHeading.date) == int(month[5:7]))
        .all()
    )
    peeling_rows = (
        db.query(Peeling)
        .filter(Peeling.company_id == company_id, extract("year", Peeling.date) == int(month[:4]), extract("month", Peeling.date) == int(month[5:7]))
        .all()
    )

    summary = defaultdict(lambda: {"deheading": 0.0, "peeling": 0.0, "processing": 0.0})
    for row in deheading_rows:
        if row.contractor:
            summary[row.contractor]["deheading"] += signed_number(row, row.amount)
    for row in peeling_rows:
        if row.contractor_name:
            summary[row.contractor_name]["peeling"] += signed_number(row, row.amount)

    contractor_names = {
        row.contractor_name
        for row in db.query(contractors).filter(contractors.company_id == company_id).all()
        if row.contractor_name
    }
    contractor_names.update(summary.keys())

    for name in contractor_names:
        salary_rows = processing_salary_rows(db, company_id, month, name)
        summary[name]["processing"] = sum(row["payable"] for row in salary_rows)

    rows = []
    for name, values in sorted(summary.items()):
        contractor_info = contractor_context(db, company_id, name)
        subtotal = round(values["deheading"] + values["peeling"] + values["processing"], 2)
        _, grand_total = tax_breakup(subtotal, contractor_info, company_info)
        payments = db.query(ContractorBillPayment).filter(
            ContractorBillPayment.company_id == company_id,
            ContractorBillPayment.contractor_name == name,
            ContractorBillPayment.month_year == month,
            ContractorBillPayment.is_cancelled != True,
        ).order_by(ContractorBillPayment.id.asc()).all()
        paid_amount = round(sum(float(payment.paid_amount or 0.0) for payment in payments), 2)
        latest_payment = payments[-1] if payments else None
        voucher_ids = [payment.journal_id for payment in payments if payment.journal_id]
        voucher_no = ""
        voucher_map = {}
        if voucher_ids:
            vouchers = db.query(VoucherHeader).filter(
                VoucherHeader.company_id == company_id,
                VoucherHeader.id.in_(voucher_ids),
            ).order_by(VoucherHeader.id.asc()).all()
            voucher_map = {voucher.id: voucher.voucher_no for voucher in vouchers}
            voucher_no = ", ".join(voucher.voucher_no for voucher in vouchers if voucher.voucher_no)
        current_outstanding = max(round(grand_total - paid_amount, 2), 0.0)
        prev_month = previous_month_key(month)
        previous_bill_total = contractor_month_grand_total(db, company_id, prev_month, name, company_info)
        previous_paid = db.query(func.coalesce(func.sum(ContractorBillPayment.paid_amount), 0.0)).filter(
            ContractorBillPayment.company_id == company_id,
            ContractorBillPayment.contractor_name == name,
            ContractorBillPayment.month_year == prev_month,
            ContractorBillPayment.is_cancelled != True,
        ).scalar() or 0.0
        previous_outstanding = max(round(previous_bill_total - float(previous_paid or 0.0), 2), 0.0)
        if current_outstanding <= 0.01 and grand_total > 0:
            payment_status = "PAID"
        elif paid_amount > 0:
            payment_status = "PARTIAL"
        else:
            payment_status = "UNPAID"
        paid_count = len(payments)
        if paid_count > 1 and voucher_no:
            voucher_no = f"{paid_count} Payments"
        bank_ledger_ids = [payment.bank_cash_ledger_id for payment in payments if payment.bank_cash_ledger_id]
        bank_ledger_map = {}
        if bank_ledger_ids:
            bank_ledgers = db.query(LedgerMaster).filter(
                LedgerMaster.company_id == company_id,
                LedgerMaster.id.in_(bank_ledger_ids),
            ).all()
            bank_ledger_map = {ledger.id: ledger.ledger_name for ledger in bank_ledgers}
        payment_history = [
            {
                "date": payment.payment_date.isoformat() if payment.payment_date else "",
                "amount": round(float(payment.paid_amount or 0.0), 2),
                "mode": payment.payment_mode or "",
                "utr": payment.utr_reference or "",
                "account": bank_ledger_map.get(payment.bank_cash_ledger_id, ""),
                "voucher_no": voucher_map.get(payment.journal_id, ""),
                "status": payment.payment_status or "",
            }
            for payment in payments
        ]
        rows.append({
            "contractor_name": name,
            "deheading": round(values["deheading"], 2),
            "peeling": round(values["peeling"], 2),
            "processing": round(values["processing"], 2),
            "subtotal": subtotal,
            "grand_total": grand_total,
            "paid_amount": paid_amount,
            "previous_outstanding": previous_outstanding,
            "current_outstanding": current_outstanding,
            "total_outstanding": max(round(previous_outstanding + current_outstanding, 2), 0.0),
            "payment_status": payment_status,
            "payment_mode": latest_payment.payment_mode if latest_payment else "BANK",
            "payment_date": latest_payment.payment_date.isoformat() if latest_payment and latest_payment.payment_date else "",
            "utr_reference": latest_payment.utr_reference if latest_payment else "",
            "payment_voucher_no": voucher_no,
            "payment_history": payment_history,
        })
    return rows


@router.get("/entry", response_class=HTMLResponse)
def contractor_bills_page(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    company_code = request.session.get("company_code")
    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    today = ist_now().date()
    selected_fy = today.year if today.month >= 4 else today.year - 1
    return templates.TemplateResponse(
        request=request,
        name="bills/contractor_bills.html",
            context={
                "email": email,
                "company_id": company_code,
                "selected_fy": selected_fy,
                "selected_month": today.strftime("%Y-%m"),
                "bank_cash_ledgers": bank_cash_ledgers(db, company_code),
            },
        )


@router.get("/data")
def contractor_bills_data(request: Request, month: str = Query(...), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        return JSONResponse({"success": False, "message": "Session expired"}, status_code=401)

    ensure_contractor_payment_schema(db)
    rows = operation_summary(db, company_id, month)
    return {"success": True, "rows": rows}


@router.post("/payment")
def contractor_payment_entry(payload: ContractorPaymentPayload, request: Request, contractor: str = Query(...), month: str = Query(...), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    email = request.session.get("email") or "SYSTEM"
    if not company_id:
        return JSONResponse({"success": False, "message": "Session expired"}, status_code=401)
    ensure_contractor_payment_schema(db)

    bill_total = round(float(payload.bill_total or 0.0), 2)
    amount = round(float(payload.amount or 0.0), 2)
    if bill_total <= 0:
        return JSONResponse({"success": False, "message": "Bill total must be greater than zero"}, status_code=400)
    if amount <= 0:
        return JSONResponse({"success": False, "message": "Paid amount must be greater than zero"}, status_code=400)
    bank_cash_ledger = selected_bank_cash_ledger(db, company_id, payload.bank_cash_ledger_id)
    if not bank_cash_ledger:
        return JSONResponse({"success": False, "message": "Select a valid bank/cash account"}, status_code=400)
    clean_utr = (payload.utr_reference or "").strip()
    if clean_utr:
        duplicate_utr = db.query(ContractorBillPayment.id).filter(
            ContractorBillPayment.company_id == company_id,
            ContractorBillPayment.contractor_name == contractor,
            ContractorBillPayment.month_year == month,
            ContractorBillPayment.is_cancelled != True,
            func.upper(func.trim(func.coalesce(ContractorBillPayment.utr_reference, ""))) == clean_utr.upper(),
        ).first()
        if duplicate_utr:
            return JSONResponse({"success": False, "message": "This UTR / reference is already posted for this contractor bill."}, status_code=400)
    existing_paid = db.query(func.coalesce(func.sum(ContractorBillPayment.paid_amount), 0.0)).filter(
        ContractorBillPayment.company_id == company_id,
        ContractorBillPayment.contractor_name == contractor,
        ContractorBillPayment.month_year == month,
        ContractorBillPayment.is_cancelled != True,
    ).scalar() or 0.0
    remaining = max(round(bill_total - float(existing_paid or 0.0), 2), 0.0)
    if amount - remaining > 0.01:
        return JSONResponse({"success": False, "message": f"Paid amount cannot exceed outstanding amount ₹{remaining:,.2f}"}, status_code=400)

    try:
        mode = (payload.payment_mode or "BANK").strip().upper()
        credit_ledger = bank_cash_ledger.ledger_name
        credit_group = bank_cash_ledger.group.group_name if bank_cash_ledger.group else ("Cash-in-hand" if mode == "CASH" else "Bank Accounts")
        credit_group_type = bank_cash_ledger.group.group_type if bank_cash_ledger.group else "ASSET"
        contractor_ledger = contractor if contractor.lower().endswith("a/c") else f"{contractor} - Contractor A/c"
        ref_no = clean_utr or f"CONPAY-{contractor[:12]}-{month}"
        voucher = PostingEngineService.create_voucher(
            db=db,
            company_id=company_id,
            voucher_type_name="Payment",
            voucher_date=payload.payment_date or ist_now().date(),
            narration=f"Contractor payment for {contractor} - {month}",
            details=[
                {
                    "ledger_name": contractor_ledger,
                    "group_name": "Sundry Creditors",
                    "group_type": "LIABILITY",
                    "parent_group_name": "Current Liabilities",
                    "debit_amount": amount,
                    "credit_amount": 0.0,
                    "remarks": ref_no,
                },
                {
                    "ledger_name": credit_ledger,
                    "group_name": credit_group,
                    "group_type": credit_group_type,
                    "parent_group_name": "Current Assets",
                    "debit_amount": 0.0,
                    "credit_amount": amount,
                    "remarks": ref_no,
                },
            ],
            reference_no=ref_no,
            created_by=email,
            status="POSTED",
        )
        total_paid = round(float(existing_paid or 0.0) + amount, 2)
        payment_status = "PAID" if abs(total_paid - bill_total) <= 0.01 else "PARTIAL"
        payment = ContractorBillPayment(
            company_id=company_id,
            contractor_name=contractor,
            month_year=month,
            created_by=email,
        )
        payment.bill_total = bill_total
        payment.paid_amount = amount
        payment.payment_mode = mode
        payment.payment_date = payload.payment_date or ist_now().date()
        payment.utr_reference = clean_utr or None
        payment.payment_status = payment_status
        payment.journal_id = voucher.id
        payment.bank_cash_ledger_id = bank_cash_ledger.id
        db.add(payment)
        db.commit()
        return {
            "success": True,
            "message": f"Contractor payment posted: {voucher.voucher_no}",
            "voucher_no": voucher.voucher_no,
            "payment_status": payment.payment_status,
            "paid_amount": total_paid,
            "outstanding": max(round(bill_total - total_paid, 2), 0.0),
        }
    except Exception as exc:
        db.rollback()
        return JSONResponse({"success": False, "message": f"Payment posting failed: {str(exc)}"}, status_code=400)


@router.get("/bill/{bill_type}", response_class=HTMLResponse)
def contractor_bill_print(
    bill_type: str,
    request: Request,
    month: str = Query(...),
    contractor: str = Query(...),
    db: Session = Depends(get_db),
):
    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/", status_code=302)

    company_info = company_context(db, company_id)
    contractor_info = contractor_context(db, company_id, contractor)
    bill_type = bill_type.lower()

    rows = []
    title = "Contractor Bill"
    subtotal = 0.0
    totals = {}

    year, month_no, _ = parse_month(month)
    if bill_type == "deheading":
        title = "Deheading Monthly Contractor Bill"
        records = (
            db.query(DeHeading)
            .filter(
                DeHeading.company_id == company_id,
                DeHeading.contractor == contractor,
                extract("year", DeHeading.date) == year,
                extract("month", DeHeading.date) == month_no,
            )
            .order_by(DeHeading.date.asc(), DeHeading.id.asc())
            .all()
        )
        for rec in records:
            rows.append(
                {
                    "date": rec.date,
                    "batch": rec.batch_number,
                    "description": f"{rec.species or '-'} / {rec.hoso_count or '-'}",
                    "qty_in": signed_number(rec, rec.hoso_qty),
                    "qty_out": signed_number(rec, rec.hlso_qty),
                    "rate": rec.rate_per_kg or 0,
                    "amount": signed_number(rec, rec.amount),
                }
            )
        totals = {
            "qty_in_label": "HOSO Qty",
            "qty_out_label": "HLSO Qty",
            "qty_in": round(sum(row["qty_in"] for row in rows), 2),
            "qty_out": round(sum(row["qty_out"] for row in rows), 2),
        }
        subtotal = round(sum(row["amount"] for row in rows), 2)
    elif bill_type == "peeling":
        title = "Peeling Monthly Contractor Bill"
        records = (
            db.query(Peeling)
            .filter(
                Peeling.company_id == company_id,
                Peeling.contractor_name == contractor,
                extract("year", Peeling.date) == year,
                extract("month", Peeling.date) == month_no,
            )
            .order_by(Peeling.date.asc(), Peeling.id.asc())
            .all()
        )
        for rec in records:
            rows.append(
                {
                    "date": rec.date,
                    "batch": rec.batch_number,
                    "description": f"{rec.variety_name or '-'} / {rec.hlso_count or '-'}",
                    "qty_in": signed_number(rec, rec.hlso_qty),
                    "qty_out": signed_number(rec, rec.peeled_qty),
                    "rate": rec.rate or 0,
                    "amount": signed_number(rec, rec.amount),
                }
            )
        totals = {
            "qty_in_label": "HLSO Qty",
            "qty_out_label": "Peeled Qty",
            "qty_in": round(sum(row["qty_in"] for row in rows), 2),
            "qty_out": round(sum(row["qty_out"] for row in rows), 2),
        }
        subtotal = round(sum(row["amount"] for row in rows), 2)
    else:
        title = "Processing Monthly Salary Contractor Bill"
        rows = processing_salary_rows(db, company_id, month, contractor)
        subtotal = round(sum(row["payable"] for row in rows), 2)
        totals = {"commission": 0.0}

    tax_rows, grand_total = tax_breakup(subtotal, contractor_info, company_info)
    return templates.TemplateResponse(
        request=request,
        name="bills/contractor_bill_print.html",
        context={
            "title": title,
            "bill_type": bill_type,
            "company": company_info,
            "contractor": contractor_info,
            "month_year": month,
            "bill_date": ist_now(),
            "rows": rows,
            "totals": totals,
            "subtotal": subtotal,
            "tax_rows": tax_rows,
            "grand_total": grand_total,
        },
    )
