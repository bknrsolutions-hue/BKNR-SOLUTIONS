from collections import defaultdict
import re
import calendar
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sqlalchemy import extract, func, text
from sqlalchemy.orm import Session, aliased

from app.database import get_db
from app.database.models.attendance import (
    DailyAttendance,
    EmployeeRegistration,
    EmployeeSalaryAdvance,
    EmployeeStatutoryMaster,
    Shift,
)
from app.database.models.enterprise_finance import AccountGroup, LedgerMaster, SalaryProcessing, VoucherHeader
from app.database.models.users import Company
from app.services.bill_accounting import cancel_linked_bill_voucher, ensure_bill_accounting_schema
from app.services.posting_engine import PostingEngineService
from app.services.payroll_statutory import calculate_pf_esi, effective_statutory_record
from app.services.salary_advance_recovery import preview_monthly_advance_recovery, sync_monthly_advance_recovery
from app.utils.timezone import ist_now

router = APIRouter(prefix="/salaries", tags=["Salaries"])
templates = Jinja2Templates(directory="app/templates")


class SalaryPaymentPayload(BaseModel):
    amount: float
    payment_mode: str = "BANK"
    payment_date: date | None = None
    utr_reference: str | None = None
    bank_cash_ledger_id: int | None = None


def ensure_salary_payment_log_schema(db: Session) -> None:
    ensure_bill_accounting_schema(db)
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS salary_payment_logs (
            id SERIAL PRIMARY KEY,
            company_id VARCHAR(50) NOT NULL,
            salary_id INTEGER NOT NULL,
            employee_id VARCHAR(50),
            employee_name VARCHAR(150),
            month_year VARCHAR(7) NOT NULL,
            paid_amount DOUBLE PRECISION DEFAULT 0,
            payment_mode VARCHAR(20) DEFAULT 'BANK',
            payment_date DATE,
            utr_reference VARCHAR(50),
            payment_status VARCHAR(20) DEFAULT 'PARTIAL',
            journal_id INTEGER,
            bank_cash_ledger_id INTEGER,
            is_cancelled BOOLEAN DEFAULT FALSE,
            created_by VARCHAR(150),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """))
    db.execute(text("ALTER TABLE salary_payment_logs ADD COLUMN IF NOT EXISTS bank_cash_ledger_id INTEGER"))
    db.execute(text("ALTER TABLE salary_payment_logs ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT FALSE"))
    db.execute(text("CREATE INDEX IF NOT EXISTS ix_salary_payment_logs_company_month ON salary_payment_logs(company_id, month_year)"))
    db.execute(text("CREATE INDEX IF NOT EXISTS ix_salary_payment_logs_salary ON salary_payment_logs(company_id, salary_id)"))
    db.flush()


def salary_payment_history(db: Session, company_id: str, salary_id: int):
    ensure_salary_payment_log_schema(db)
    rows = db.execute(text("""
        SELECT spl.id, spl.paid_amount, spl.payment_mode, spl.payment_date, spl.utr_reference,
               spl.payment_status, spl.journal_id, vh.voucher_no, lm.ledger_name AS bank_cash_ledger_name
        FROM salary_payment_logs spl
        LEFT JOIN voucher_headers vh
          ON vh.id = spl.journal_id AND vh.company_id = spl.company_id
        LEFT JOIN ledger_masters lm
          ON lm.id = spl.bank_cash_ledger_id AND lm.company_id = spl.company_id
        WHERE spl.company_id = :company_id
          AND spl.salary_id = :salary_id
          AND COALESCE(spl.is_cancelled, FALSE) = FALSE
        ORDER BY spl.id ASC
    """), {"company_id": company_id, "salary_id": salary_id}).mappings().all()
    return [
        {
            "date": row["payment_date"].isoformat() if row["payment_date"] else "",
            "amount": round(float(row["paid_amount"] or 0.0), 2),
            "mode": row["payment_mode"] or "",
            "utr": row["utr_reference"] or "",
            "account": row["bank_cash_ledger_name"] or "",
            "status": row["payment_status"] or "",
            "voucher_no": row["voucher_no"] or "",
        }
        for row in rows
    ]


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


def is_contract_type(value: str) -> bool:
    return str(value or "").strip().upper() in {"CONTRACT", "CONTRACTOR"}


def company_context(db: Session, company_code: str):
    company = db.query(Company).filter(Company.company_code == company_code).first()
    return {
        "name": company.company_name if company else company_code,
        "address": company.address if company else "",
        "email": company.email if company else "",
        "mpeda_registration_code": company.mpeda_registration_code if company else "",
    }


def get_salary_shift_map(db: Session, company_id: str):
    shift_map = {}
    for shift in db.query(Shift).filter(Shift.company_id == company_id).all():
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


def monthly_salary_sheet_rows(db: Session, company_id: str, month: str):
    year, month_no = map(int, month.split("-"))
    days_in_month = calendar.monthrange(year, month_no)[1]
    shift_map = get_salary_shift_map(db, company_id)
    employees = sorted(
        db.query(EmployeeRegistration).filter(
            EmployeeRegistration.company_id == company_id,
            EmployeeRegistration.status == "ACTIVE",
        ).all(),
        key=lambda e: [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)', str(e.employee_id or ""))]
    )
    result = []

    for emp in employees:
        attendance_records = db.query(DailyAttendance).filter(
            DailyAttendance.employee_id == emp.employee_id,
            DailyAttendance.company_id == company_id,
            extract("year", DailyAttendance.duty_date) == year,
            extract("month", DailyAttendance.duty_date) == month_no,
        ).all()
        daily_att_values = defaultdict(float)
        adjustment = 0.0
        total_approved_ot = 0.0
        ot_earnings = 0.0
        base_gross = float(emp.current_salary or 0.0)
        per_day_rate = base_gross / 26.0 if base_gross else 0.0

        for rec in attendance_records:
            if rec.salary_adjustment:
                adjustment = max(adjustment, float(rec.salary_adjustment))
            shift_name = rec.shift_name or "GENERAL"
            req_hours = shift_map.get(shift_name, 8.0)
            raw_credit = float(rec.working_hours or 0.0) / req_hours if req_hours > 0 else 0.0
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
            d_status = str(getattr(rec, "duty_status", "APPROVED") or "APPROVED").strip().upper()
            d_type = str(getattr(rec, "duty_type", "") or "").strip().upper()
            approved_credit = float(getattr(rec, "approved_duty_credit", 0.0) or 0.0)

            if d_status == "REJECTED" or d_type == "ABSENT":
                val = 0.0
            elif approved_credit > 0:
                val = approved_credit
            elif d_status == "APPROVED":
                val = 1.0 if duty_credit > 1.0 else duty_credit
            elif d_status == "PENDING":
                val = 1.0 if duty_credit >= 1.0 else duty_credit
            else:
                val = duty_credit if duty_credit <= 1.0 else 1.0

            daily_att_values[rec.duty_date.day] += val

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
        tds_amount = earned_gross * float(emp.tds or 0.0) / 100
        stat = effective_statutory_record(
            db,
            company_id,
            emp.employee_id,
            date(year, month_no, days_in_month),
        )

        pf = esi = pt = lwf = employer_pf = employer_epf = employer_eps = employer_edli = employer_esi = 0.0
        if stat:
            earned_salary_before_ot = total_payable_days * per_day_rate
            earned_basic = (
                earned_salary_before_ot * float(emp.basic_salary or 0.0) / base_gross
                if base_gross > 0 else earned_salary_before_ot
            )
            statutory_values = calculate_pf_esi(
                stat,
                monthly_pf_wages=float(emp.basic_salary or 0.0),
                earned_pf_wages=earned_basic,
                monthly_esi_wages=base_gross,
                earned_esi_wages=earned_gross,
                employee_dob=emp.dob,
                effective_date=date(year, month_no, 1),
            )
            pf = statutory_values["pf_employee"]
            employer_pf = statutory_values["pf_employer"]
            employer_epf = statutory_values["epf_employer"]
            employer_eps = statutory_values["eps_employer"]
            employer_edli = statutory_values["edli_employer"]
            esi = statutory_values["esi_employee"]
            employer_esi = statutory_values["esi_employer"]
            pt = stat.pt_amount or 0.0
            lwf = stat.lwf_employee_amount or 0.0

        salary_advance, _ = preview_monthly_advance_recovery(
            db, company_id, emp.employee_id, month
        )
        net_pay = earned_gross - (pf + esi + pt + lwf + tds_amount + salary_advance)
        result.append({
            "id": emp.employee_id,
            "dept": emp.department or "GENERAL",
            "earned_gross": round(earned_gross, 2),
            "actual_duties": actual_present_count,
            "saved_adjustment": adjustment,
            "ot_hours": round(total_approved_ot, 2),
            "ot_earnings": round(ot_earnings, 2),
            "pf": round(pf, 2),
            "esi": round(esi, 2),
            "pt": pt,
            "lwf": lwf,
            "tds": round(tds_amount, 2),
            "employer_pf": round(employer_pf, 2),
            "employer_epf": round(employer_epf, 2),
            "employer_eps": round(employer_eps, 2),
            "employer_edli": round(employer_edli, 2),
            "employer_esi": round(employer_esi, 2),
            "salary_advance": round(salary_advance, 2),
            "net_pay": round(net_pay, 2),
        })
    return result


def previous_month_key(month: str) -> str:
    year, month_no = map(int, month.split("-"))
    first_day = date(year, month_no, 1)
    previous_day = first_day - timedelta(days=1)
    return previous_day.strftime("%Y-%m")


def _sync_monthly_sheet_salary(db: Session, company_id: str, month: str, emp: EmployeeRegistration, row: dict) -> SalaryProcessing:
    salary = db.query(SalaryProcessing).filter(
        SalaryProcessing.company_id == company_id,
        SalaryProcessing.employee_id == emp.employee_id,
        SalaryProcessing.month_year == month,
    ).first()

    values = {
        "employee_name": emp.employee_name,
        "designation": emp.designation or "",
        "department": emp.department or row.get("dept") or "",
        "production_at": emp.production_at or emp.location or "",
        "present_days": float(row.get("actual_duties") or 0.0),
        "absent_days": 0.0,
        "ot_hours": float(row.get("ot_hours") or 0.0),
        "ot_amount": float(row.get("ot_earnings") or 0.0),
        "salary_adjustment": float(row.get("saved_adjustment") or 0.0),
        "basic_salary": float(emp.basic_salary or 0.0),
        "hra": float(emp.hra or 0.0),
        "conveyance_allowance": float(emp.conveyance_allowance or 0.0),
        "special_allowance": 0.0,
        "other_earnings": float(emp.other_expenses or 0.0),
        "gross_salary": float(row.get("earned_gross") or 0.0),
        "pf_employee": float(row.get("pf") or 0.0),
        "esi_employee": float(row.get("esi") or 0.0),
        "professional_tax": float(row.get("pt") or 0.0),
        "tds_salary": float(row.get("tds") or 0.0),
        "advance_deduction": float(row.get("salary_advance") or 0.0),
        "lwf_employee": float(row.get("lwf") or 0.0),
        "other_deductions": 0.0,
        "total_deductions": round(
            float(row.get("pf") or 0.0)
            + float(row.get("esi") or 0.0)
            + float(row.get("pt") or 0.0)
            + float(row.get("lwf") or 0.0)
            + float(row.get("tds") or 0.0)
            + float(row.get("salary_advance") or 0.0),
            2,
        ),
        "pf_employer": float(row.get("employer_pf") or 0.0),
        "epf_employer": float(row.get("employer_epf") or 0.0),
        "eps_employer": float(row.get("employer_eps") or 0.0),
        "edli_employer": float(row.get("employer_edli") or 0.0),
        "esi_employer": float(row.get("employer_esi") or 0.0),
        "lwf_employer": 0.0,
        "net_payable": float(row.get("net_pay") or 0.0),
    }

    if not salary:
        salary = SalaryProcessing(
            company_id=company_id,
            month_year=month,
            employee_id=emp.employee_id,
            status="DRAFT",
            payment_status="UNPAID",
            created_by="MONTHLY-SHEET",
            **values,
        )
        db.add(salary)
        db.flush()
        return salary

    if not salary.salary_journal_id and not salary.payment_journal_id:
        for key, value in values.items():
            setattr(salary, key, value)
    return salary


def salary_rows(db: Session, company_id: str, month: str, request: Request):
    ensure_salary_payment_log_schema(db)
    report_rows = monthly_salary_sheet_rows(db, company_id, month)

    employees = {
        emp.employee_id: emp
        for emp in db.query(EmployeeRegistration).filter(EmployeeRegistration.company_id == company_id).all()
    }

    synced_ids = []
    for sheet_row in report_rows:
        emp = employees.get(sheet_row.get("id"))
        if not emp or is_contract_type(emp.employee_type):
            continue
        salary = _sync_monthly_sheet_salary(db, company_id, month, emp, sheet_row)
        synced_ids.append(salary.id)
    db.commit()

    salary_voucher = aliased(VoucherHeader)
    payment_voucher = aliased(VoucherHeader)
    rows = (
        db.query(
            SalaryProcessing,
            EmployeeRegistration.employee_type,
            salary_voucher.voucher_no.label("salary_voucher_no"),
            payment_voucher.voucher_no.label("payment_voucher_no"),
        )
        .outerjoin(
            EmployeeRegistration,
            (SalaryProcessing.company_id == EmployeeRegistration.company_id)
            & (SalaryProcessing.employee_id == EmployeeRegistration.employee_id),
        )
        .outerjoin(
            salary_voucher,
            (SalaryProcessing.salary_journal_id == salary_voucher.id)
            & (salary_voucher.company_id == SalaryProcessing.company_id),
        )
        .outerjoin(
            payment_voucher,
            (SalaryProcessing.payment_journal_id == payment_voucher.id)
            & (payment_voucher.company_id == SalaryProcessing.company_id),
        )
        .filter(
            SalaryProcessing.company_id == company_id,
            SalaryProcessing.month_year == month,
            SalaryProcessing.is_cancelled != True,
            SalaryProcessing.id.in_(synced_ids or [0]),
        )
        .order_by(SalaryProcessing.employee_name)
        .all()
    )
    result = []
    for salary, employee_type, salary_voucher_no, payment_voucher_no in rows:
        if is_contract_type(employee_type):
            continue
        status = (salary.status or "DRAFT").strip().upper()
        posted = bool(salary.salary_journal_id and salary_voucher_no)
        net_payable = round(float(salary.net_payable or 0.0), 2)
        history = salary_payment_history(db, company_id, salary.id)
        legacy_paid = round(float(salary.paid_amount or 0.0), 2)
        if not history and legacy_paid > 0:
            history = [{
                "date": salary.payment_date.isoformat() if salary.payment_date else "",
                "amount": legacy_paid,
                "mode": salary.payment_mode or "BANK",
                "utr": salary.utr_reference or "",
                "account": "",
                "status": salary.payment_status or "PAID",
                "voucher_no": payment_voucher_no or "",
            }]
        paid_amount = round(sum(float(item["amount"] or 0.0) for item in history), 2)
        latest_payment = history[-1] if history else {}
        outstanding = max(round(net_payable - paid_amount, 2), 0.0)
        previous_salary = db.query(SalaryProcessing).filter(
            SalaryProcessing.company_id == company_id,
            SalaryProcessing.employee_id == salary.employee_id,
            SalaryProcessing.month_year == previous_month_key(month),
            SalaryProcessing.is_cancelled != True,
        ).first()
        previous_outstanding = 0.0
        if previous_salary:
            previous_history = salary_payment_history(db, company_id, previous_salary.id)
            legacy_previous_paid = round(float(previous_salary.paid_amount or 0.0), 2)
            if not previous_history and legacy_previous_paid > 0:
                previous_history = [{"amount": legacy_previous_paid}]
            previous_paid = sum(float(item["amount"] or 0.0) for item in previous_history)
            previous_outstanding = max(round(float(previous_salary.net_payable or 0.0) - previous_paid, 2), 0.0)
        payment_status = "PAID" if outstanding <= 0.01 and net_payable > 0 else ("PARTIAL" if paid_amount > 0 else "UNPAID")
        if paid_amount != round(float(salary.paid_amount or 0.0), 2) or salary.payment_status != payment_status:
            salary.paid_amount = paid_amount
            salary.payment_status = payment_status
            salary.payment_mode = latest_payment.get("mode") or salary.payment_mode
            salary.payment_date = date.fromisoformat(latest_payment["date"]) if latest_payment.get("date") else salary.payment_date
            salary.utr_reference = latest_payment.get("utr") or salary.utr_reference
        if posted:
            accounts_label = salary_voucher_no
        elif status == "DRAFT":
            accounts_label = "Draft - Not Posted"
        else:
            accounts_label = "Posting Pending"
        result.append(
            {
                "id": salary.id,
                "month_year": salary.month_year,
                "employee_id": salary.employee_id,
                "employee_name": salary.employee_name,
                "department": salary.department or "-",
                "production_at": salary.production_at or "-",
                "present_days": round(float(salary.present_days or 0.0), 2),
                "gross_salary": round(float(salary.gross_salary or 0.0), 2),
                "deductions": round(float(salary.total_deductions or 0.0), 2),
                "net_payable": net_payable,
                "paid_amount": paid_amount,
                "previous_outstanding": previous_outstanding,
                "outstanding": outstanding,
                "total_outstanding": max(round(previous_outstanding + outstanding, 2), 0.0),
                "payment_mode": latest_payment.get("mode") or salary.payment_mode or "BANK",
                "payment_date": latest_payment.get("date") or (salary.payment_date.isoformat() if salary.payment_date else ""),
                "utr_reference": latest_payment.get("utr") or salary.utr_reference or "",
                "payment_status": payment_status,
                "status": status,
                "voucher_no": salary_voucher_no or "",
                "payment_voucher_no": payment_voucher_no or "",
                "payment_history": history,
                "posted": posted,
                "accounts_label": accounts_label,
            }
        )
    db.commit()
    return result


@router.get("/entry", response_class=HTMLResponse)
def salaries_page(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    company_code = request.session.get("company_code")
    if not email or not company_code:
        return RedirectResponse("/", status_code=302)
    today = ist_now().date()
    selected_fy = today.year if today.month >= 4 else today.year - 1
    return templates.TemplateResponse(
        request=request,
        name="bills/salaries.html",
        context={
            "email": email,
            "company_id": company_code,
            "selected_fy": selected_fy,
            "selected_month": today.strftime("%Y-%m"),
            "bank_cash_ledgers": bank_cash_ledgers(db, company_code),
        },
    )


@router.get("/data")
def salaries_data(request: Request, month: str = Query(...), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        return JSONResponse({"success": False, "message": "Session expired"}, status_code=401)
    try:
        rows = salary_rows(db, company_id, month, request)
        return {"success": True, "rows": rows}
    except Exception as exc:
        db.rollback()
        return JSONResponse({"success": False, "message": f"Unable to load salaries: {str(exc)}"}, status_code=400)


@router.post("/payment/{salary_id}")
def salary_payment_entry(salary_id: int, payload: SalaryPaymentPayload, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    email = request.session.get("email") or "SYSTEM"
    if not company_id:
        return JSONResponse({"success": False, "message": "Session expired"}, status_code=401)
    ensure_salary_payment_log_schema(db)

    row = (
        db.query(SalaryProcessing, EmployeeRegistration.employee_type)
        .outerjoin(
            EmployeeRegistration,
            (SalaryProcessing.company_id == EmployeeRegistration.company_id)
            & (SalaryProcessing.employee_id == EmployeeRegistration.employee_id),
        )
        .filter(SalaryProcessing.company_id == company_id, SalaryProcessing.id == salary_id)
        .first()
    )
    if not row or is_contract_type(row.employee_type):
        return JSONResponse({"success": False, "message": "Salary record not found"}, status_code=404)

    salary = row.SalaryProcessing
    status = (salary.status or "DRAFT").strip().upper()
    if salary.is_cancelled:
        return JSONResponse({"success": False, "message": "Cancelled salary cannot be paid"}, status_code=400)
    if status == "DRAFT":
        salary.status = "APPROVED"

    net_payable = round(float(salary.net_payable or 0.0), 2)
    amount = round(float(payload.amount or 0.0), 2)
    if net_payable <= 0:
        return JSONResponse({"success": False, "message": "Net payable is zero. Payment voucher is not required."}, status_code=400)
    if amount <= 0:
        return JSONResponse({"success": False, "message": "Payment amount must be greater than zero"}, status_code=400)
    bank_cash_ledger = selected_bank_cash_ledger(db, company_id, payload.bank_cash_ledger_id)
    if not bank_cash_ledger:
        return JSONResponse({"success": False, "message": "Select a valid bank/cash account"}, status_code=400)
    clean_utr = (payload.utr_reference or "").strip()
    if clean_utr:
        duplicate_utr = db.execute(text("""
            SELECT 1
            FROM salary_payment_logs
            WHERE company_id = :company_id
              AND salary_id = :salary_id
              AND COALESCE(is_cancelled, FALSE) = FALSE
              AND UPPER(TRIM(COALESCE(utr_reference, ''))) = :utr_reference
            LIMIT 1
        """), {
            "company_id": company_id,
            "salary_id": salary.id,
            "utr_reference": clean_utr.upper(),
        }).first()
        if duplicate_utr:
            return JSONResponse({"success": False, "message": "This UTR / reference is already posted for this salary."}, status_code=400)
    existing_paid = db.execute(text("""
        SELECT COALESCE(SUM(paid_amount), 0) AS paid
        FROM salary_payment_logs
        WHERE company_id = :company_id
          AND salary_id = :salary_id
          AND COALESCE(is_cancelled, FALSE) = FALSE
    """), {"company_id": company_id, "salary_id": salary.id}).scalar() or 0.0
    legacy_paid = round(float(salary.paid_amount or 0.0), 2)
    if float(existing_paid or 0.0) <= 0 and legacy_paid > 0:
        existing_paid = legacy_paid
    remaining = max(round(net_payable - float(existing_paid or 0.0), 2), 0.0)
    if amount - remaining > 0.01:
        return JSONResponse({"success": False, "message": f"Payment amount cannot exceed outstanding amount ₹{remaining:,.2f}"}, status_code=400)

    try:
        if not salary.salary_journal_id:
            salary_voucher = PostingEngineService.post_salary_approval(db, company_id, salary)
            salary.salary_journal_id = salary_voucher.id

        salary.payment_mode = (payload.payment_mode or "BANK").strip().upper()
        salary.payment_date = payload.payment_date or ist_now().date()
        salary.utr_reference = clean_utr or None
        total_paid = round(float(existing_paid or 0.0) + amount, 2)
        salary.paid_amount = total_paid
        salary.payment_status = "PAID" if abs(total_paid - net_payable) <= 0.01 else "PARTIAL"
        if salary.payment_status == "PAID":
            salary.status = "PAID"
        elif status == "PAID":
            salary.status = "APPROVED"

        sync_monthly_advance_recovery(
            db,
            company_id,
            salary.employee_id,
            salary.month_year,
            salary.id,
            True,
        )

        payment_voucher = PostingEngineService.post_salary_payment(db, company_id, salary, amount=amount, bank_cash_ledger=bank_cash_ledger)
        salary.payment_journal_id = payment_voucher.id
        db.execute(text("""
            INSERT INTO salary_payment_logs (
                company_id, salary_id, employee_id, employee_name, month_year,
                paid_amount, payment_mode, payment_date, utr_reference,
                payment_status, journal_id, bank_cash_ledger_id, created_by
            ) VALUES (
                :company_id, :salary_id, :employee_id, :employee_name, :month_year,
                :paid_amount, :payment_mode, :payment_date, :utr_reference,
                :payment_status, :journal_id, :bank_cash_ledger_id, :created_by
            )
        """), {
            "company_id": company_id,
            "salary_id": salary.id,
            "employee_id": salary.employee_id,
            "employee_name": salary.employee_name,
            "month_year": salary.month_year,
            "paid_amount": amount,
            "payment_mode": salary.payment_mode,
            "payment_date": salary.payment_date,
            "utr_reference": salary.utr_reference,
            "payment_status": salary.payment_status,
            "journal_id": payment_voucher.id,
            "bank_cash_ledger_id": bank_cash_ledger.id,
            "created_by": email,
        })
        db.commit()
        return {
            "success": True,
            "message": f"Salary payment posted: {payment_voucher.voucher_no}",
            "voucher_no": payment_voucher.voucher_no,
            "payment_status": salary.payment_status,
            "paid_amount": total_paid,
            "outstanding": max(round(net_payable - total_paid, 2), 0.0),
        }
    except Exception as exc:
        db.rollback()
        return JSONResponse({"success": False, "message": f"Payment posting failed: {str(exc)}"}, status_code=400)


@router.get("/print/{salary_id}", response_class=HTMLResponse)
def salary_print(salary_id: int, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/", status_code=302)
    row = (
        db.query(SalaryProcessing, EmployeeRegistration.employee_type, VoucherHeader.voucher_no)
        .outerjoin(
            EmployeeRegistration,
            (SalaryProcessing.company_id == EmployeeRegistration.company_id)
            & (SalaryProcessing.employee_id == EmployeeRegistration.employee_id),
        )
        .outerjoin(
            VoucherHeader,
            (SalaryProcessing.salary_journal_id == VoucherHeader.id)
            & (VoucherHeader.company_id == SalaryProcessing.company_id),
        )
        .filter(SalaryProcessing.company_id == company_id, SalaryProcessing.id == salary_id)
        .first()
    )
    if not row or is_contract_type(row.employee_type):
        return JSONResponse({"success": False, "message": "Salary record not found"}, status_code=404)
    return templates.TemplateResponse(
        request=request,
        name="bills/salary_print.html",
        context={
            "company": company_context(db, company_id),
            "salary": row.SalaryProcessing,
            "voucher_no": row.voucher_no or "",
            "printed_on": ist_now(),
        },
    )
