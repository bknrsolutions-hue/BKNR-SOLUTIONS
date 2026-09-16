# app/routers/attendance/salary_reports.py

from fastapi import APIRouter, Request, Depends, Body, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import extract, and_, or_, func
import calendar
from datetime import date, datetime, timedelta
from collections import defaultdict
import re

from app.database import get_db
from app.database.models.attendance import (
    EmployeeRegistration,
    DailyAttendance,
    EmployeeSalaryAdvance,
    EmployeeStatutoryMaster,
    Shift,
    KgBasisWorker,
    KgBasisWorkerAttendance,
    DailyTemporaryWorker,
    KgBasisCompanyLabour
)
from app.database.models.processing import DeHeading, Peeling, TableRegistration

from app.database.models.criteria import contractors
from app.database.models.enterprise_finance import VoucherHeader
from app.database.models.users import Company
from app.services.bill_accounting import amount_line, cancel_linked_bill_voucher, ensure_bill_accounting_schema, post_contractor_source_charge
from app.services.posting_engine import PostingEngineService
from app.services.payroll_statutory import calculate_duty_credit, calculate_pf_esi, effective_statutory_record
from app.services.salary_advance_recovery import preview_monthly_advance_recovery
from app.utils.timezone import ist_now

router = APIRouter(tags=["SALARY_REPORTS"])
templates = Jinja2Templates(directory="app/templates")


def monthly_adjustment_window(year: int, month_no: int) -> tuple[date, date]:
    if month_no == 12:
        return date(year + 1, 1, 1), date(year + 1, 1, 10)
    return date(year, month_no + 1, 1), date(year, month_no + 1, 10)


def contractor_gst_percent(db: Session, company_id: str, contractor_name: str) -> float:
    row = db.query(contractors).filter(
        contractors.company_id == company_id,
        contractors.contractor_name == contractor_name,
    ).first()
    return float(row.gst_percent or 0) if row else 0.0


def replace_contract_salary_adjustment_voucher(db: Session, company_id: str, emp: EmployeeRegistration, month: str, adjustment_days: float, email: str):
    if str(emp.employee_type or "").strip().upper() not in {"CONTRACT", "CONTRACTOR"} or not emp.contractor_name:
        return

    reference_no = f"ATT-ADJ-{emp.employee_id}-{month}"[:50]
    existing = db.query(VoucherHeader).filter(
        VoucherHeader.company_id == company_id,
        VoucherHeader.reference_no == reference_no,
        VoucherHeader.status == "POSTED",
    ).first()
    if existing:
        cancel_linked_bill_voucher(db, company_id, existing.id, email)

    per_day_rate = float(emp.current_salary or 0.0) / 26.0 if emp.current_salary else 0.0
    taxable_amount = round(abs(float(adjustment_days or 0.0)) * per_day_rate, 2)
    if taxable_amount <= 0:
        return

    if adjustment_days > 0:
        post_contractor_source_charge(
            db=db,
            company_id=company_id,
            voucher_date=date.today(),
            reference_no=reference_no,
            contractor_name=emp.contractor_name,
            charge_type="Processing Adjustment",
            taxable_amount=taxable_amount,
            gst_percent=contractor_gst_percent(db, company_id, emp.contractor_name),
            created_by=email,
            quantity=adjustment_days,
            rate=per_day_rate,
        )
        return

    gst_percent = contractor_gst_percent(db, company_id, emp.contractor_name)
    gst_amount = round(taxable_amount * gst_percent / 100.0, 2)
    total_amount = round(taxable_amount + gst_amount, 2)
    contractor_ledger = f"{emp.contractor_name} - Contractor A/c"
    details = [
        amount_line(contractor_ledger, "Sundry Creditors", "LIABILITY", debit=total_amount, remarks=reference_no, parent_group_name="Current Liabilities"),
        amount_line("Processing Adjustment Contractor Charges A/c", "Direct Expenses", "EXPENSE", credit=taxable_amount, remarks=reference_no),
    ]
    if gst_amount:
        details.append(amount_line("Input GST A/c", "Duties & Taxes", "LIABILITY", credit=gst_amount, remarks=reference_no, parent_group_name="Current Liabilities"))
    PostingEngineService.create_voucher(
        db,
        company_id,
        "Journal",
        date.today(),
        f"Contract salary negative adjustment {reference_no} for {emp.employee_name}",
        details,
        reference_no=reference_no,
        created_by=email or "SYSTEM",
        status="POSTED",
    )

# ==================================================
# ⚡ HELPER: CALCULATE SHIFT DURATIONS
# ==================================================
def get_company_shift_map(db: Session, company_id: str):
    shifts = db.query(Shift).filter(Shift.company_id == company_id).all()
    shift_map = {}
    for s in shifts:
        if s.start_time and s.end_time:
            dt_start = datetime.combine(date.today(), s.start_time)
            dt_end = datetime.combine(date.today(), s.end_time)
            if dt_end < dt_start:
                dt_end += timedelta(days=1) 
            
            diff_hours = (dt_end - dt_start).total_seconds() / 3600.0
            break_hrs = (s.break_minutes or 0) / 60.0
            shift_map[s.shift_name] = max(1.0, diff_hours - break_hrs)
        else:
            shift_map[s.shift_name] = 8.0 
    return shift_map

@router.get("/attendance/salary/monthly-sheet")
def salary_sheet_page(request: Request):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    return RedirectResponse("/app/#/p/hr_ss", status_code=303)

@router.get("/api/salary/get-locations")
def get_locations(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        return JSONResponse({"error": "Session expired"}, status_code=401)
    production_locations = db.query(EmployeeRegistration.production_at).filter(
        EmployeeRegistration.company_id == company_id,
        EmployeeRegistration.production_at != None,
    ).distinct().all()
    work_locations = db.query(EmployeeRegistration.location).filter(
        EmployeeRegistration.company_id == company_id,
        EmployeeRegistration.location != None,
    ).distinct().all()
    return sorted({
        str(loc[0]).strip()
        for loc in [*production_locations, *work_locations]
        if loc[0] and str(loc[0]).strip()
    })

@router.get("/api/salary/get-departments")
def get_departments(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        return JSONResponse({"error": "Session expired"}, status_code=401)
    depts = db.query(EmployeeRegistration.department).filter(
        EmployeeRegistration.company_id == company_id, EmployeeRegistration.department != None
    ).distinct().all()
    return [d[0] for d in depts if d[0]]

# ==================================================
# 3️⃣ MAIN SALARY REPORT (PROFESSIONAL PAYROLL LOGIC)
# ==================================================
@router.get("/api/salary/get-report")
def get_salary_report(
    month: str, dept: str, location: str,
    request: Request, db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    if not company_id: return JSONResponse({"error": "Unauthorized"}, status_code=401)
    company = db.query(Company).filter(
        or_(
            func.upper(func.trim(Company.company_code)) == str(company_id or "").strip().upper(),
            func.lower(func.trim(Company.company_name)) == str(company_id or "").strip().lower()
        )
    ).first()
    if not company:
        company = db.query(Company).first()

    year, month_no = map(int, month.split("-"))
    days_in_month = calendar.monthrange(year, month_no)[1]
    adjustment_start, adjustment_deadline = monthly_adjustment_window(year, month_no)
    today = ist_now().date()
    adjustment_open = adjustment_start <= today <= adjustment_deadline
    adjustment_window_status = "OPEN" if adjustment_open else ("NOT_OPEN" if today < adjustment_start else "CLOSED")

    shift_map = get_company_shift_map(db, company_id)

    emp_query = db.query(EmployeeRegistration).filter(
        EmployeeRegistration.company_id == company_id,
        EmployeeRegistration.status == "ACTIVE"
    )

    if dept != "ALL": emp_query = emp_query.filter(EmployeeRegistration.department == dept)
    if location != "ALL":
        emp_query = emp_query.filter(or_(
            EmployeeRegistration.production_at == location,
            EmployeeRegistration.location == location,
        ))

    employees = sorted(
        emp_query.all(),
        key=lambda e: [int(t) if t.isdigit() else t.lower() for t in re.split(r'(\d+)', str(e.employee_id or ""))]
    )
    result = []

    for emp in employees:
        attendance_records = db.query(DailyAttendance).filter(
            DailyAttendance.employee_id == emp.employee_id,
            DailyAttendance.company_id == company_id,
            extract("year", DailyAttendance.duty_date) == year,
            extract("month", DailyAttendance.duty_date) == month_no
        ).all()

        daily_att_values = defaultdict(float)
        adjustment = 0.0
        adjustment_reason = ""
        adjustment_locked = False
        total_approved_ot = 0.0
        ot_earnings = 0.0

        # Base Rates for Salary
        base_gross = float(emp.current_salary or 0)
        per_day_rate = base_gross / 26.0

        for rec in attendance_records:
            is_adjustment_row = str(rec.status or "").strip().upper() == "ADJUSTMENT"
            if is_adjustment_row:
                adjustment = float(rec.salary_adjustment or 0.0)
                adjustment_locked = True
                adjustment_reason = str(rec.salary_adjustment_reason or "").strip()
                if not adjustment_reason:
                    for movement in list(rec.movements or []):
                        if isinstance(movement, dict) and movement.get("type") == "SALARY_ADJUSTMENT":
                            adjustment_reason = str(movement.get("reason") or "").strip()
                            break
                continue
            elif rec.salary_adjustment is not None and float(rec.salary_adjustment or 0.0) != 0.0:
                adjustment = float(rec.salary_adjustment or 0.0)
                adjustment_locked = True
            
            shift_name = rec.shift_name or "GENERAL"
            req_hours = shift_map.get(shift_name, 8.0)
            wh = float(rec.working_hours or 0)
            duty_credit = calculate_duty_credit(wh, req_hours)

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

            # 🟢 OT HOURLY RATE (Correct Shift Formula)
            if getattr(rec, 'ot_status', None) == 'APPROVED' and getattr(rec, 'approved_ot_hours', None):
                approved_ot_hrs = float(rec.approved_ot_hours)
                total_approved_ot += approved_ot_hrs
                hourly_rate = per_day_rate / req_hours if req_hours > 0 else (per_day_rate / 8.0)
                ot_earnings += (approved_ot_hrs * hourly_rate)

        att_map = {}
        duty_counts = {"HP": 0, "1P": 0, "1.5P": 0, "2P": 0, "2.5P": 0, "3P": 0}
        actual_present_count = 0.0
        worked_days_count = 0 

        for d in range(1, days_in_month + 1):
            val = daily_att_values.get(d, 0.0)
            
            if val == 0: label = "A"
            elif val == 0.5: 
                label = "HP"
                duty_counts["HP"] += 1
            elif val == 1.0: 
                label = "P"
                duty_counts["1P"] += 1
            elif val == 1.5: 
                label = "1.5P"
                duty_counts["1.5P"] += 1
            elif val == 2.0: 
                label = "2P"
                duty_counts["2P"] += 1
            elif val == 2.5: 
                label = "2.5P"
                duty_counts["2.5P"] += 1
            elif val >= 3.0: 
                label = "3P"
                duty_counts["3P"] += 1
            else: label = f"{val}P" # Fallback, but shouldn't hit with fixed slabs
            
            att_map[d] = label
            actual_present_count += val
            if val > 0: worked_days_count += 1

        # Bonus Holidays
        extra_holidays = 0
        if worked_days_count >= 25: extra_holidays = 4
        elif worked_days_count > 13: extra_holidays = 3
        elif worked_days_count == 13: extra_holidays = 2
        elif worked_days_count >= 7: extra_holidays = 1

        # Total Earned Gross
        total_payable_days = actual_present_count + extra_holidays + adjustment
        earned_salary_before_ot = total_payable_days * per_day_rate
        earned_gross = earned_salary_before_ot + ot_earnings

        monthly_components = {
            "basic": float(emp.basic_salary or 0),
            "hra": float(emp.hra or 0),
            "conveyance": float(emp.conveyance_allowance or 0),
            "other": float(emp.other_expenses or 0),
        }
        component_total = sum(monthly_components.values())
        component_factor = (earned_salary_before_ot / component_total) if component_total > 0 else 0.0
        earned_components = {
            key: round(value * component_factor, 2)
            for key, value in monthly_components.items()
        }
        if component_total <= 0:
            earned_components["basic"] = round(earned_salary_before_ot, 2)

        # TDS
        tds_percent = float(emp.tds or 0)
        tds_amount = (earned_gross * tds_percent / 100)

        # Statutory
        stat = effective_statutory_record(
            db,
            company_id,
            emp.employee_id,
            date(year, month_no, days_in_month),
        )

        pf = esi = pt = lwf = 0.0
        employer_pf = employer_epf = employer_eps = employer_edli = employer_esi = 0.0
        
        if stat:
            statutory_values = calculate_pf_esi(
                stat,
                monthly_pf_wages=float(emp.basic_salary or 0.0),
                earned_pf_wages=earned_components["basic"],
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
            pt, lwf = (stat.pt_amount or 0), (stat.lwf_employee_amount or 0)

        salary_advance, _ = preview_monthly_advance_recovery(
            db, company_id, emp.employee_id, month
        )

        net_pay = earned_gross - (pf + esi + pt + lwf + tds_amount + salary_advance)

        result.append({
            "id": emp.employee_id,
            "name": emp.employee_name,
            "dept": emp.department or "GENERAL",
            "designation": emp.designation or "—",
            "employee_type": emp.employee_type or "REGULAR",
            "location": emp.production_at or emp.location or "—",
            "joining_date": emp.joining_date.isoformat() if emp.joining_date else None,
            "bank_name": emp.bank_name or "—",
            "account_number": emp.account_number or "—",
            "uan_number": (stat.uan_number if stat and stat.uan_number else emp.uan_number) or "—",
            "pay_mode": "BANK" if emp.account_number else "CASH",
            "base_sal": round(base_gross, 2),
            "basic_earned": earned_components["basic"],
            "hra_earned": earned_components["hra"],
            "conveyance_earned": earned_components["conveyance"],
            "other_earned": earned_components["other"],
            "earned_gross": round(earned_gross, 2),
            "actual_duties": actual_present_count,
            "duty_counts": duty_counts,
            "worked_days": worked_days_count,
            "extra_holidays": extra_holidays,
            "saved_adjustment": adjustment,
            "adjustment_reason": adjustment_reason or ("Legacy monthly adjustment" if adjustment_locked else ""),
            "adjustment_locked": adjustment_locked,
            "ot_hours": round(total_approved_ot, 2),
            "ot_earnings": round(ot_earnings, 2), 
            "pf": round(pf, 2), "esi": round(esi, 2), "pt": pt, "lwf": lwf, "tds": round(tds_amount, 2),
            "employer_pf": round(employer_pf, 2), "employer_esi": round(employer_esi, 2),
            "employer_epf": round(employer_epf, 2),
            "employer_eps": round(employer_eps, 2),
            "employer_edli": round(employer_edli, 2),
            "salary_advance": round(salary_advance, 2),
            "net_pay": round(net_pay, 2),
            "att_map": att_map
        })

    return {
        "days_in_month": days_in_month,
        "month_name": calendar.month_name[month_no],
        "company_name": company.company_name if company else (request.session.get("company_name") or company_id),
        "company_address": company.address if company else "",
        "company_code": company_id,
        "mpeda_registration_code": (
            company.mpeda_registration_code
            if company and company.mpeda_registration_code
            else ""
        ),
        "adjustment_start": adjustment_start.isoformat(),
        "adjustment_deadline": adjustment_deadline.isoformat(),
        "adjustment_open": adjustment_open,
        "adjustment_closed": not adjustment_open,
        "adjustment_window_status": adjustment_window_status,
        "employees": result,
    }


# ==================================================
# 4️⃣ ATTENDANCE DETAILS POPUP
# ==================================================
@router.get("/api/salary/get-attendance-logs")
def attendance_popup(emp_id: str, month: str, day: int = None, request: Request = None, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    year, month_no = map(int, month.split("-"))
    
    shift_map = get_company_shift_map(db, company_id)
    
    query = db.query(DailyAttendance).filter(
        DailyAttendance.employee_id == emp_id,
        DailyAttendance.company_id == company_id,
        extract("year", DailyAttendance.duty_date) == year,
        extract("month", DailyAttendance.duty_date) == month_no
    )
    if day: query = query.filter(extract("day", DailyAttendance.duty_date) == day)

    records = query.order_by(DailyAttendance.duty_date.asc(), DailyAttendance.first_in.asc()).all()
    
    data = []
    for r in records:
        shift_name = r.shift_name or "GENERAL"
        req_hours = shift_map.get(shift_name, 8.0)
        wh = float(r.working_hours or 0)
        duty_credit = calculate_duty_credit(wh, req_hours)

        d_status = str(getattr(r, "duty_status", "") or "APPROVED").strip().upper()
        d_type = str(getattr(r, "duty_type", "") or "").strip().upper()
        approved_credit = float(getattr(r, "approved_duty_credit", 0.0) or 0.0)

        if d_status == "REJECTED" or d_type == "ABSENT":
            effective_credit = 0.0
            status = "A"
        elif approved_credit > 0:
            effective_credit = approved_credit
            if approved_credit == 0.5: status = "HP"
            elif approved_credit == 1.0: status = "P"
            elif approved_credit == 1.5: status = "1.5P"
            elif approved_credit == 2.0: status = "2P"
            elif approved_credit == 2.5: status = "2.5P"
            elif approved_credit >= 3.0: status = "3P"
            else: status = f"{approved_credit}P"
        elif d_status == "APPROVED":
            effective_credit = 1.0 if duty_credit > 1.0 else duty_credit
            if effective_credit == 1.0: status = "P"
            elif effective_credit == 0.5: status = "HP"
            else: status = "A"
        else:
            effective_credit = 1.0 if duty_credit >= 1.0 else duty_credit
            if effective_credit == 1.0: status = "P"
            elif effective_credit == 0.5: status = "HP"
            else: status = "A"

        # OT Info
        ot_status = str(getattr(r, "ot_status", "") or "—").upper()
        ot_hours = float(r.approved_ot_hours if ot_status == "APPROVED" and r.approved_ot_hours else (r.calculated_ot_hours or 0.0))

        # Punch Missed Detection
        punch_missed = False
        punch_missed_reason = ""
        if r.first_in and not r.exit_time:
            punch_missed = True
            punch_missed_reason = "Missing OUT Punch"
        elif r.exit_time and not r.first_in:
            punch_missed = True
            punch_missed_reason = "Missing IN Punch"

        movement_rows = []
        movement_date = r.duty_date
        previous_minutes = None
        for movement in list(r.movements) if r.movements else []:
            movement_copy = dict(movement) if isinstance(movement, dict) else {"type": "LOG", "time": str(movement)}
            time_value = str(movement_copy.get("time") or "")
            try:
                hour, minute = [int(part) for part in time_value.split(":")[:2]]
                current_minutes = (hour * 60) + minute
            except (TypeError, ValueError):
                current_minutes = None

            explicit_date = movement_copy.get("date")
            if explicit_date:
                parsed_date = None
                for date_format in ("%Y-%m-%d", "%d-%m-%Y"):
                    try:
                        parsed_date = datetime.strptime(str(explicit_date), date_format).date()
                        break
                    except ValueError:
                        continue
                if parsed_date:
                    movement_date = parsed_date
            elif current_minutes is not None and previous_minutes is not None and current_minutes < previous_minutes:
                movement_date += timedelta(days=1)

            movement_copy["display_date"] = movement_date.strftime("%d-%m-%Y") if movement_date else ""
            movement_rows.append(movement_copy)
            if current_minutes is not None:
                previous_minutes = current_minutes

        if movement_rows:
            in_count = sum(1 for m in movement_rows if m.get("type") == "IN")
            out_count = sum(1 for m in movement_rows if m.get("type") == "OUT")
            if in_count != out_count:
                punch_missed = True
                if not punch_missed_reason:
                    punch_missed_reason = "Incomplete Punch Pair"

        data.append({
            "date": r.duty_date.strftime("%d-%m-%Y"),
            "shift": shift_name,
            "hours": round(wh, 2),
            "status": status,
            "duty_status": d_status,
            "ot_hours": round(ot_hours, 2),
            "ot_status": ot_status,
            "punch_missed": punch_missed,
            "punch_missed_reason": punch_missed_reason,
            "movements": movement_rows
        })

    return data

@router.post("/api/salary/save-adjustment")
def save_adjustment(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    email = request.session.get("email")
    if not company_id or not email:
        return JSONResponse({"status": "error", "message": "Session expired. Please login again."}, status_code=401)

    emp_id = payload.get("employee_id")
    month = payload.get("month")
    reason = str(payload.get("reason") or "").strip()
    if not reason:
        return JSONResponse({"status": "error", "message": "Adjustment reason is compulsory."}, status_code=400)
    try:
        value = float(payload.get("adjustment", 0) or 0)
        year, month_no = map(int, str(month or "").split("-"))
    except Exception:
        return JSONResponse({"status": "error", "message": "Invalid adjustment/month"}, status_code=400)
    window_start, deadline = monthly_adjustment_window(year, month_no)
    today = ist_now().date()
    if today < window_start:
        return JSONResponse({
            "status": "error",
            "message": f"Adjustment window opens on {window_start.strftime('%d-%m-%Y')}.",
        }, status_code=403)
    if today > deadline:
        return JSONResponse({
            "status": "error",
            "message": f"Adjustment window closed on {deadline.strftime('%d-%m-%Y')}.",
        }, status_code=403)
    ensure_bill_accounting_schema(db)

    emp = db.query(EmployeeRegistration).filter(
        EmployeeRegistration.employee_id == emp_id,
        EmployeeRegistration.company_id == company_id,
    ).with_for_update().first()
    if not emp:
        return JSONResponse({"status": "error", "message": "Employee not found"}, status_code=404)

    existing_adjustment = db.query(DailyAttendance).filter(
        DailyAttendance.employee_id == emp_id, DailyAttendance.company_id == company_id,
        extract("year", DailyAttendance.duty_date) == year,
        extract("month", DailyAttendance.duty_date) == month_no,
        or_(
            DailyAttendance.status == "ADJUSTMENT",
            DailyAttendance.salary_adjustment != 0,
        ),
    ).first()
    if existing_adjustment:
        return JSONResponse({
            "status": "error",
            "message": "This employee's monthly adjustment is already saved and locked.",
        }, status_code=409)

    db.add(DailyAttendance(
        company_id=company_id,
        employee_id=emp.employee_id,
        employee_name=emp.employee_name,
        designation=emp.designation,
        employee_type=emp.employee_type,
        production_at=emp.production_at or emp.location,
        duty_date=date(year, month_no, 1),
        shift_name="ADJUSTMENT",
        working_hours=0.0,
        salary_adjustment=value,
        salary_adjustment_reason=reason,
        duty_status="APPROVED",
        duty_approved_by=email,
        status="ADJUSTMENT",
        movements=[{
            "type": "SALARY_ADJUSTMENT",
            "month": month,
            "value": value,
            "reason": reason,
            "approved_by": email,
            "locked": True,
            "saved_at": datetime.utcnow().isoformat(),
        }],
    ))

    replace_contract_salary_adjustment_voucher(db, company_id, emp, month, value, email)
    
    db.commit()
    return {"status": "success", "adjustment": value, "reason": reason, "locked": True}

# ==================================================
# 5️⃣ 24-HOUR AUTO-EXIT PUNCH LOGIC
# ==================================================
@router.post("/api/attendance/punch")
def register_punch(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    emp_id = payload.get("employee_id")
    punch_type = payload.get("punch_type")  # "IN" or "OUT"
    
    raw_time = payload.get("punch_time")
    if raw_time:
        punch_time = datetime.fromisoformat(raw_time)
    else:
        punch_time = datetime.now()

    # Find the active open shift (where out_time is None)
    last_record = db.query(DailyAttendance).filter(
        DailyAttendance.employee_id == emp_id,
        DailyAttendance.company_id == company_id,
        DailyAttendance.out_time == None
    ).order_by(DailyAttendance.in_time.desc()).first()

    if punch_type == "IN":
        if last_record:
            time_diff_hours = (punch_time - last_record.in_time).total_seconds() / 3600.0
            
            if time_diff_hours > 24.0:
                # 🟢 RULE 1: If > 24 hours, Force Auto-Exit for previous duty
                last_record.out_time = last_record.in_time + timedelta(hours=24)
                last_record.working_hours = 24.0
                last_record.remarks = "System Auto-Exit (24hr Max Limit Crossed)"
                db.commit()
                # Proceeds to create a NEW IN punch below
            else:
                # Shift is still within 24 hours. Reject double IN punch.
                raise HTTPException(status_code=400, detail="Already Punched IN. Please punch OUT first.")
        
        # Create fresh IN punch for the next duty
        new_in_record = DailyAttendance(
            employee_id=emp_id,
            company_id=company_id,
            duty_date=punch_time.date(),
            in_time=punch_time,
            shift_name=payload.get("shift_name", "GENERAL")
        )
        db.add(new_in_record)
        db.commit()
        return {"message": "Punched IN Successfully."}

    elif punch_type == "OUT":
        if not last_record:
            raise HTTPException(status_code=400, detail="No active IN punch found.")

        time_diff_hours = (punch_time - last_record.in_time).total_seconds() / 3600.0
        
        if time_diff_hours > 24.0:
            # 🟢 RULE 2: If OUT punch is pressed after 24 hours, cap the limit.
            last_record.out_time = last_record.in_time + timedelta(hours=24)
            last_record.working_hours = 24.0
            last_record.remarks = "Forced Exit (Capped at 24 hours)"
            db.commit()
            return {"message": "Shift capped at 24 hours. Please punch IN again for the new duty."}
        # Normal OUT punch (< 24 hours)
        last_record.out_time = punch_time
        last_record.working_hours = round(time_diff_hours, 2)
        db.commit()
        return {"message": "Punched OUT Successfully."}
    else:
        raise HTTPException(status_code=400, detail="Invalid punch type. Must be IN or OUT.")


# ==================================================
# 6️⃣ DAY BASIS WORKERS MONTHLY SALARY & OT APPROVAL REPORT (FROM KG / DAY WORKERS TABLES)
# ======# ==================================================
# 6️⃣ DAY BASIS WORKERS MONTHLY SALARY & OT APPROVAL REPORT
# ==================================================
@router.get("/api/salary/get-day-basis-report")
def get_day_basis_salary_report(
    month: str, dept: str = "ALL", location: str = "ALL",
    request: Request = None, db: Session = Depends(get_db)
):
    try:
        company_id = request.session.get("company_code") or request.session.get("company_id")
        if not company_id:
            return JSONResponse({"error": "Unauthorized"}, status_code=401)

        year, month_no = map(int, month.split("-"))
        days_in_month = calendar.monthrange(year, month_no)[1]
        company = db.query(Company).filter(
            or_(
                Company.company_code == company_id,
                func.lower(Company.company_name) == func.lower(company_id)
            )
        ).first()

        cid_clean = str(company_id).strip().lower()

        # 1. Query Day Basis Workers from KgBasisWorker table
        kg_day_query = db.query(KgBasisWorker).filter(
            or_(
                KgBasisWorker.company_id == None,
                KgBasisWorker.company_id == '',
                func.lower(KgBasisWorker.company_id) == cid_clean
            ),
            or_(
                func.lower(KgBasisWorker.worker_type).contains("day"),
                func.lower(KgBasisWorker.worker_type).contains("daily"),
                func.lower(KgBasisWorker.worker_category).contains("day"),
                func.lower(KgBasisWorker.worker_category).contains("daily"),
            )
        )
        if dept != "ALL":
            kg_day_query = kg_day_query.filter(KgBasisWorker.department == dept)
        if location != "ALL":
            kg_day_query = kg_day_query.filter(KgBasisWorker.production_at == location)

        kg_day_workers = kg_day_query.order_by(KgBasisWorker.worker_name.asc()).all()

        # 2. Query Day Basis Employees from EmployeeRegistration
        emp_day_query = db.query(EmployeeRegistration).filter(
            or_(
                EmployeeRegistration.company_id == None,
                EmployeeRegistration.company_id == '',
                func.lower(EmployeeRegistration.company_id) == cid_clean
            ),
            or_(
                EmployeeRegistration.current_salary <= 2500,
                func.lower(EmployeeRegistration.employee_type).contains("day"),
                func.lower(EmployeeRegistration.employee_type).contains("daily"),
            )
        )
        if dept != "ALL":
            emp_day_query = emp_day_query.filter(EmployeeRegistration.department == dept)
        if location != "ALL":
            emp_day_query = emp_day_query.filter(or_(
                EmployeeRegistration.production_at == location,
                EmployeeRegistration.location == location,
            ))

        emp_day_workers = emp_day_query.all()

        result = []
        pending_ot_list = []
        processed_ids = set()
        processed_names = set()

        def get_worker_adj(w_id):
            rec = db.query(DailyAttendance).filter(
                DailyAttendance.employee_id == w_id,
                extract("year", DailyAttendance.duty_date) == year,
                extract("month", DailyAttendance.duty_date) == month_no,
                or_(
                    DailyAttendance.status == "ADJUSTMENT",
                    and_(DailyAttendance.salary_adjustment != None, DailyAttendance.salary_adjustment != 0)
                )
            ).first()
            if rec:
                return float(rec.salary_adjustment or 0.0), str(rec.salary_adjustment_reason or "")
            return 0.0, ""

        # Process KgBasisWorker list (Day Basis category)
        for w in kg_day_workers:
            w_name = (w.worker_name or f"Worker #{w.worker_id or w.id}").strip()
            w_id = str(w.worker_id or f"KG-{w.id}")
            processed_ids.add(w_id)
            processed_names.add(w_name.lower())

            kg_att_records = db.query(KgBasisWorkerAttendance).filter(
                KgBasisWorkerAttendance.worker_id == w_id,
                extract("year", KgBasisWorkerAttendance.attendance_date) == year,
                extract("month", KgBasisWorkerAttendance.attendance_date) == month_no
            ).all()

            daily_att_records = db.query(DailyAttendance).filter(
                DailyAttendance.employee_id == w_id,
                extract("year", DailyAttendance.duty_date) == year,
                extract("month", DailyAttendance.duty_date) == month_no
            ).all()

            raw_sal = float(w.daily_salary or 0)
            per_day_rate = raw_sal if raw_sal > 0 else 500.0
            ot_hourly_rate = per_day_rate / 8.0 if per_day_rate > 0 else 0.0

            daily_att_values = {}
            daily_ot_hours = {}
            total_worked_duties = 0.0
            worked_days_count = 0
            total_approved_ot_hrs = 0.0

            for rec in daily_att_records:
                wh = float(rec.working_hours or 0.0)
                if wh >= 7.0: duty_val = 1.0
                elif wh >= 4.0: duty_val = 0.5
                else: duty_val = 0.0

                calc_ot = max(0.0, min(16.0, wh) - 8.0) if wh > 8.0 else 0.0
                ot_status = str(getattr(rec, "ot_status", "") or "PENDING").upper()

                if wh >= 9.0 and calc_ot > 0:
                    if ot_status in ["PENDING", "OPEN", ""]:
                        pending_ot_list.append({
                            "att_id": rec.id,
                            "worker_id": w_id,
                            "worker_name": w_name,
                            "department": w.department or "DAY WORKER",
                            "duty_date": rec.duty_date.strftime("%d-%m-%Y"),
                            "working_hours": round(wh, 2),
                            "standard_duty": 1.0,
                            "requested_ot_hours": round(calc_ot, 2),
                            "is_double_duty": wh >= 14.0,
                            "ot_status": "PENDING"
                        })
                    elif ot_status == "APPROVED":
                        approved_ot = float(rec.approved_ot_hours if rec.approved_ot_hours is not None else calc_ot)
                        total_approved_ot_hrs += approved_ot
                        daily_ot_hours[rec.duty_date.day] = approved_ot
                    elif ot_status == "REJECTED":
                        daily_ot_hours[rec.duty_date.day] = 0.0

                day_no = rec.duty_date.day
                if duty_val > 0:
                    daily_att_values[day_no] = duty_val

            for k_att in kg_att_records:
                day_no = k_att.attendance_date.day
                if day_no not in daily_att_values:
                    wh = 8.0
                    if k_att.in_time and k_att.out_time:
                        wh = (k_att.out_time - k_att.in_time).total_seconds() / 3600.0
                    duty_val = 1.0 if wh >= 7.0 else (0.5 if wh >= 4.0 else 0.0)

                    calc_ot = max(0.0, min(16.0, wh) - 8.0) if wh > 8.0 else 0.0
                    if wh >= 9.0 and calc_ot > 0:
                        pending_ot_list.append({
                            "att_id": k_att.id,
                            "worker_id": w_id,
                            "worker_name": w_name,
                            "department": w.department or "DAY WORKER",
                            "duty_date": k_att.attendance_date.strftime("%d-%m-%Y"),
                            "working_hours": round(wh, 2),
                            "standard_duty": 1.0,
                            "requested_ot_hours": round(calc_ot, 2),
                            "is_double_duty": wh >= 14.0,
                            "ot_status": "PENDING"
                        })

                    if duty_val > 0:
                        daily_att_values[day_no] = duty_val

            for d in range(1, days_in_month + 1):
                v = daily_att_values.get(d, 0.0)
                if v > 0:
                    total_worked_duties += v
                    worked_days_count += 1

            att_map = {}
            for d in range(1, days_in_month + 1):
                val = daily_att_values.get(d, 0.0)
                ot_h = daily_ot_hours.get(d, 0.0)
                if val == 1.0:
                    att_map[d] = f"P+{ot_h}h" if ot_h > 0 else "P"
                elif val == 0.5:
                    att_map[d] = "HP"
                else:
                    att_map[d] = "A"

            base_earnings = total_worked_duties * per_day_rate
            ot_pay = total_approved_ot_hrs * ot_hourly_rate
            gross_pay = base_earnings + ot_pay
            salary_adj, adj_reason = get_worker_adj(w_id)
            net_pay = max(0.0, gross_pay + salary_adj)

            result.append({
                "id": w_id,
                "name": w_name,
                "dept": w.department or "DAY WORKER",
                "contractor": w.worker_category or w.worker_type or "DAY WORKER",
                "per_day_rate": round(per_day_rate, 2),
                "worked_duties": total_worked_duties,
                "worked_days": worked_days_count,
                "base_earnings": round(base_earnings, 2),
                "approved_ot_hours": round(total_approved_ot_hrs, 2),
                "ot_hourly_rate": round(ot_hourly_rate, 2),
                "ot_pay": round(ot_pay, 2),
                "gross_pay": round(gross_pay, 2),
                "salary_advance": 0.0,
                "salary_adjustment": round(salary_adj, 2),
                "salary_adjustment_reason": adj_reason,
                "net_pay": round(net_pay, 2),
                "att_map": att_map
            })

        # Process Day-Basis EmployeeRegistration list
        for emp in emp_day_workers:
            emp_id = str(emp.employee_id or f"EMP-{emp.id}")
            emp_name = (emp.employee_name or f"Employee #{emp_id}").strip()
            if emp_id in processed_ids or emp_name.lower() in processed_names:
                continue
            processed_ids.add(emp_id)
            processed_names.add(emp_name.lower())

            daily_att_records = db.query(DailyAttendance).filter(
                DailyAttendance.employee_id == emp_id,
                extract("year", DailyAttendance.duty_date) == year,
                extract("month", DailyAttendance.duty_date) == month_no
            ).all()

            raw_sal = float(emp.current_salary or 0)
            per_day_rate = raw_sal if (0 < raw_sal <= 2500) else (raw_sal / 26.0 if raw_sal > 2500 else 500.0)
            ot_hourly_rate = per_day_rate / 8.0 if per_day_rate > 0 else 0.0

            daily_att_values = {}
            daily_ot_hours = {}
            total_worked_duties = 0.0
            worked_days_count = 0
            total_approved_ot_hrs = 0.0

            for rec in daily_att_records:
                wh = float(rec.working_hours or 0.0)
                if wh >= 7.0: duty_val = 1.0
                elif wh >= 4.0: duty_val = 0.5
                else: duty_val = 0.0

                calc_ot = max(0.0, min(16.0, wh) - 8.0) if wh > 8.0 else 0.0
                ot_status = str(getattr(rec, "ot_status", "") or "PENDING").upper()

                if wh >= 9.0 and calc_ot > 0:
                    if ot_status in ["PENDING", "OPEN", ""]:
                        pending_ot_list.append({
                            "att_id": rec.id,
                            "worker_id": emp_id,
                            "worker_name": emp_name,
                            "department": emp.department or "DAY WORKER",
                            "duty_date": rec.duty_date.strftime("%d-%m-%Y"),
                            "working_hours": round(wh, 2),
                            "standard_duty": 1.0,
                            "requested_ot_hours": round(calc_ot, 2),
                            "is_double_duty": wh >= 14.0,
                            "ot_status": "PENDING"
                        })
                    elif ot_status == "APPROVED":
                        approved_ot = float(rec.approved_ot_hours if rec.approved_ot_hours is not None else calc_ot)
                        total_approved_ot_hrs += approved_ot
                        daily_ot_hours[rec.duty_date.day] = approved_ot
                    elif ot_status == "REJECTED":
                        daily_ot_hours[rec.duty_date.day] = 0.0

                day_no = rec.duty_date.day
                if duty_val > 0:
                    daily_att_values[day_no] = duty_val
                    total_worked_duties += duty_val
                    worked_days_count += 1

            att_map = {}
            for d in range(1, days_in_month + 1):
                val = daily_att_values.get(d, 0.0)
                ot_h = daily_ot_hours.get(d, 0.0)
                if val == 1.0:
                    att_map[d] = f"P+{ot_h}h" if ot_h > 0 else "P"
                elif val == 0.5:
                    att_map[d] = "HP"
                else:
                    att_map[d] = "A"

            base_earnings = total_worked_duties * per_day_rate
            ot_pay = total_approved_ot_hrs * ot_hourly_rate
            gross_pay = base_earnings + ot_pay

            salary_advance = 0.0
            try:
                salary_advance, _ = preview_monthly_advance_recovery(
                    db, company_id, emp_id, month
                )
            except Exception:
                salary_advance = 0.0

            salary_adj, adj_reason = get_worker_adj(emp_id)
            net_pay = max(0.0, gross_pay - salary_advance + salary_adj)

            result.append({
                "id": emp_id,
                "name": emp_name,
                "dept": emp.department or "DAY WORKER",
                "contractor": emp.contractor_name or "DAY BASIS",
                "per_day_rate": round(per_day_rate, 2),
                "worked_duties": total_worked_duties,
                "worked_days": worked_days_count,
                "base_earnings": round(base_earnings, 2),
                "approved_ot_hours": round(total_approved_ot_hrs, 2),
                "ot_hourly_rate": round(ot_hourly_rate, 2),
                "ot_pay": round(ot_pay, 2),
                "gross_pay": round(gross_pay, 2),
                "salary_advance": round(salary_advance, 2),
                "salary_adjustment": round(salary_adj, 2),
                "salary_adjustment_reason": adj_reason,
                "net_pay": round(net_pay, 2),
                "att_map": att_map
            })

        return {
            "days_in_month": days_in_month,
            "month_name": calendar.month_name[month_no],
            "company_name": company.company_name if company else company_id,
            "workers": result,
            "pending_ot_list": pending_ot_list
        }
    except Exception as exc:
        print(f"❌ Error in get_day_basis_salary_report: {exc}")
        return JSONResponse({"days_in_month": 31, "month_name": "", "company_name": "", "workers": [], "pending_ot_list": [], "error": str(exc)}, status_code=200)



@router.post("/api/salary/approve-day-basis-ot")

def approve_day_basis_ot(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    email = request.session.get("email")
    if not company_id:
        return JSONResponse({"status": "error", "message": "Session expired"}, status_code=401)

    att_id = payload.get("att_id")
    action = str(payload.get("action") or "").upper()

    # Check DailyAttendance first
    att_record = db.query(DailyAttendance).filter(
        DailyAttendance.id == att_id,
        DailyAttendance.company_id == company_id
    ).first()

    if att_record:
        wh = float(att_record.working_hours or 0.0)
        calc_ot = max(0.0, min(16.0, wh) - 8.0) if wh > 8.0 else 0.0

        if action == "APPROVE":
            att_record.ot_status = "APPROVED"
            requested_ot = payload.get("approved_ot_hours")
            att_record.approved_ot_hours = float(requested_ot) if requested_ot is not None else calc_ot
            att_record.ot_approved_by = email
            message = f"✅ Approved {att_record.approved_ot_hours} OT hours for {att_record.employee_name}"
        elif action == "REJECT":
            att_record.ot_status = "REJECTED"
            att_record.approved_ot_hours = 0.0
            att_record.ot_approved_by = email
            message = f"❌ Rejected OT hours for {att_record.employee_name}. Saved 8h Duty (P)."
        else:
            return JSONResponse({"status": "error", "message": "Invalid action"}, status_code=400)

        db.commit()
        return {"status": "success", "message": message}

    # Check DailyTemporaryWorker
    temp_record = db.query(DailyTemporaryWorker).filter(
        DailyTemporaryWorker.id == att_id,
        DailyTemporaryWorker.company_id == company_id
    ).first()

    if temp_record:
        if action == "APPROVE":
            temp_record.approval_status = "APPROVED"
            temp_record.approved_by_email = email
            message = f"✅ Approved OT for {temp_record.worker_name}"
        else:
            temp_record.approval_status = "REJECTED"
            temp_record.approved_by_email = email
            message = f"❌ Rejected OT for {temp_record.worker_name}"
        db.commit()
        return {"status": "success", "message": message}

    return JSONResponse({"status": "error", "message": "Attendance record not found"}, status_code=404)


# ==================================================
# 7️⃣ KG BASIS WORKERS MONTHLY SALARY SHEET (NO OT, WITH DE-HEADING & PEELING COMBINED, WITH ADJUSTMENT)
# ==================================================
@router.get("/api/salary/get-kg-basis-report")
def get_kg_basis_salary_report(
    month: str, dept: str = "ALL", location: str = "ALL",
    request: Request = None, db: Session = Depends(get_db)
):
    try:
        company_id = request.session.get("company_code") or request.session.get("company_id")
        if not company_id:
            return JSONResponse({"error": "Unauthorized"}, status_code=401)

        year, month_no = map(int, month.split("-"))
        days_in_month = calendar.monthrange(year, month_no)[1]
        company = db.query(Company).filter(
            or_(
                Company.company_code == company_id,
                func.lower(Company.company_name) == func.lower(company_id)
            )
        ).first()

        cid_clean = str(company_id).strip().lower()

        # 1. Pre-fetch De-heading, Peeling, KgBasisCompanyLabour, TableRegistrations for month
        dh_records = db.query(DeHeading).filter(
            DeHeading.company_id == company_id,
            extract("year", DeHeading.date) == year,
            extract("month", DeHeading.date) == month_no,
            or_(DeHeading.is_cancelled == False, DeHeading.is_cancelled == None)
        ).all()

        peel_records = db.query(Peeling).filter(
            Peeling.company_id == company_id,
            extract("year", Peeling.date) == year,
            extract("month", Peeling.date) == month_no,
            or_(Peeling.is_cancelled == False, Peeling.is_cancelled == None)
        ).all()

        kg_labour_records = db.query(KgBasisCompanyLabour).filter(
            KgBasisCompanyLabour.company_id == company_id,
            extract("year", KgBasisCompanyLabour.work_date) == year,
            extract("month", KgBasisCompanyLabour.work_date) == month_no
        ).all()

        table_regs = db.query(TableRegistration).filter(
            TableRegistration.company_id == company_id,
            extract("year", TableRegistration.date) == year,
            extract("month", TableRegistration.date) == month_no,
            or_(TableRegistration.status == None, func.lower(TableRegistration.status) != "cancelled")
        ).all()

        # Query registered KG Basis Workers from KgBasisWorker table (Filter STRICTLY for ONLY KG Basis workers)
        all_workers = db.query(KgBasisWorker).filter(
            KgBasisWorker.company_id == company_id,
            KgBasisWorker.status == "ACTIVE",
        ).all()
        kg_workers = [
            w for w in all_workers
            if "kg" in str(w.worker_type or "").lower() or "kg" in str(w.worker_category or "").lower()
        ]
        if dept != "ALL":
            kg_workers = [w for w in kg_workers if (w.department or "").strip().lower() == dept.strip().lower()]
        if location != "ALL":
            kg_workers = [w for w in kg_workers if (w.production_at or "").strip().lower() == location.strip().lower()]

        # A table allocation is authoritative for that production row.  Do not
        # also pay the same row again through a direct contractor-name match.
        table_dh_ids = {
            row.id for row in dh_records
            if any(
                reg.department == "De-Heading"
                and reg.date == row.date
                and str(reg.table_no or "").strip().lower() == str(row.table_no or "").strip().lower()
                for reg in table_regs
            )
        }
        table_peel_ids = {
            row.id for row in peel_records
            if any(
                reg.department == "Peeling"
                and reg.date == row.date
                and str(reg.table_no or "").strip().lower() == str(row.table_no or "").strip().lower()
                for reg in table_regs
            )
        }

        result = []
        processed_ids = set()
        processed_names = set()

        def get_worker_adj(w_id):
            rec = db.query(DailyAttendance).filter(
                DailyAttendance.company_id == company_id,
                DailyAttendance.employee_id == w_id,
                extract("year", DailyAttendance.duty_date) == year,
                extract("month", DailyAttendance.duty_date) == month_no,
                or_(
                    DailyAttendance.status == "ADJUSTMENT",
                    and_(DailyAttendance.salary_adjustment != None, DailyAttendance.salary_adjustment != 0)
                )
            ).first()
            if rec:
                return float(rec.salary_adjustment or 0.0), str(rec.salary_adjustment_reason or "")
            return 0.0, ""

        for w in kg_workers:
            w_name = (w.worker_name or f"Worker #{w.worker_id or w.id}").strip()
            w_id = str(w.worker_id or f"KG-{w.id}")
            processed_ids.add(w_id)
            processed_names.add(w_name.lower())

            kg_att_records = db.query(KgBasisWorkerAttendance).filter(
                KgBasisWorkerAttendance.company_id == company_id,
                KgBasisWorkerAttendance.worker_id == w_id,
                extract("year", KgBasisWorkerAttendance.attendance_date) == year,
                extract("month", KgBasisWorkerAttendance.attendance_date) == month_no
            ).all()

            daily_att_records = db.query(DailyAttendance).filter(
                DailyAttendance.company_id == company_id,
                DailyAttendance.employee_id == w_id,
                extract("year", DailyAttendance.duty_date) == year,
                extract("month", DailyAttendance.duty_date) == month_no
            ).all()

            # Day-wise Deheading & Peeling KG & Amount tracking
            daily_kg = defaultdict(float)
            daily_amt = defaultdict(float)
            daily_dh_kg = defaultdict(float)
            daily_peel_kg = defaultdict(float)

            # A. From KgBasisCompanyLabour
            for kl in kg_labour_records:
                if (kl.labour_name or "").strip().lower() == w_name.lower():
                    d_no = kl.work_date.day
                    qty = float(kl.quantity_kg or 0.0)
                    amt = float(kl.amount or 0.0)
                    daily_kg[d_no] += qty
                    daily_amt[d_no] += amt
                    w_type = str(kl.work_type or "").lower()
                    if "de" in w_type or "head" in w_type:
                        daily_dh_kg[d_no] += qty
                    else:
                        daily_peel_kg[d_no] += qty

            # B. Direct DeHeading rows matching worker name / ID / contractor
            for dh in dh_records:
                if dh.id not in table_dh_ids and (dh.contractor or "").strip().lower() in {w_name.lower(), w_id.lower()}:
                    d_no = dh.date.day
                    qty = float(dh.hlso_qty or 0.0)
                    amt = float(dh.amount or 0.0)
                    daily_kg[d_no] += qty
                    daily_dh_kg[d_no] += qty
                    daily_amt[d_no] += amt

            # C. Direct Peeling rows matching worker name / ID / contractor
            for peel in peel_records:
                if peel.id not in table_peel_ids and (peel.contractor_name or "").strip().lower() in {w_name.lower(), w_id.lower()}:
                    d_no = peel.date.day
                    qty = float(peel.peeled_qty or 0.0)
                    amt = float(peel.amount or 0.0)
                    daily_kg[d_no] += qty
                    daily_peel_kg[d_no] += qty
                    daily_amt[d_no] += amt

            # D. TableRegistrations assigned tables
            for t_reg in table_regs:
                w_list = str(t_reg.worker_ids or "").lower()
                if w_id.lower() in w_list or w_name.lower() in w_list:
                    d_no = t_reg.date.day
                    num_workers = max(1, t_reg.no_of_workers or 1)
                    if t_reg.department == "De-Heading":
                        matched_dh = [r for r in dh_records if r.date.day == d_no and str(r.table_no or "").strip().lower() == str(t_reg.table_no or "").strip().lower()]
                        for m_dh in matched_dh:
                            split_qty = float(m_dh.hlso_qty or 0.0) / num_workers
                            split_amt = float(m_dh.amount or 0.0) / num_workers
                            daily_kg[d_no] += split_qty
                            daily_dh_kg[d_no] += split_qty
                            daily_amt[d_no] += split_amt
                    elif t_reg.department == "Peeling":
                        matched_peel = [r for r in peel_records if r.date.day == d_no and str(r.table_no or "").strip().lower() == str(t_reg.table_no or "").strip().lower()]
                        for m_peel in matched_peel:
                            split_qty = float(m_peel.peeled_qty or 0.0) / num_workers
                            split_amt = float(m_peel.amount or 0.0) / num_workers
                            daily_kg[d_no] += split_qty
                            daily_peel_kg[d_no] += split_qty
                            daily_amt[d_no] += split_amt

            per_day_rate = float(w.daily_salary or 0)

            daily_att_values = {}
            total_worked_duties = 0.0
            worked_days_count = 0

            for rec in daily_att_records:
                wh = float(rec.working_hours or 0.0)
                duty_val = 1.0 if wh >= 7.0 else (0.5 if wh >= 4.0 else 0.0)
                if duty_val > 0:
                    daily_att_values[rec.duty_date.day] = duty_val

            for k_att in kg_att_records:
                day_no = k_att.attendance_date.day
                if day_no not in daily_att_values:
                    wh = 8.0
                    if k_att.in_time and k_att.out_time:
                        wh = (k_att.out_time - k_att.in_time).total_seconds() / 3600.0
                    duty_val = 1.0 if wh >= 7.0 else (0.5 if wh >= 4.0 else 0.0)
                    if duty_val > 0:
                        daily_att_values[day_no] = duty_val

            for d in range(1, days_in_month + 1):
                if daily_kg[d] > 0 and d not in daily_att_values:
                    daily_att_values[d] = 1.0

            for d in range(1, days_in_month + 1):
                v = daily_att_values.get(d, 0.0)
                if v > 0:
                    total_worked_duties += v
                    worked_days_count += 1

            att_map = {}
            att_details = {}
            for d in range(1, days_in_month + 1):
                amt = round(daily_amt.get(d, 0.0), 2)
                t_kg = round(daily_kg.get(d, 0.0), 2)
                dh_kg = round(daily_dh_kg.get(d, 0.0), 2)
                peel_kg = round(daily_peel_kg.get(d, 0.0), 2)

                # KG-basis payroll must come from a saved source amount. Attendance
                # alone and an unset rate are not a financial liability.
                cell_amt = amt

                if cell_amt > 0:
                    att_map[d] = f"₹{cell_amt:.0f}"
                else:
                    att_map[d] = "-"

                att_details[d] = {
                    "day": d,
                    "total_kg": t_kg,
                    "deheading_kg": dh_kg,
                    "peeling_kg": peel_kg,
                    "amount": cell_amt
                }

            total_kg_produced = sum(daily_kg.values())
            total_dh_kg = sum(daily_dh_kg.values())
            total_peel_kg = sum(daily_peel_kg.values())
            total_kg_amount = sum(daily_amt.values())

            base_earnings = total_kg_amount
            salary_adj, adj_reason = get_worker_adj(w_id)
            net_pay = max(0.0, base_earnings + salary_adj)

            result.append({
                "id": w_id,
                "name": w_name,
                "dept": w.department or "KG WORKER",
                "contractor": w.worker_category or w.worker_type or "KG BASIS",
                "per_day_rate": round(per_day_rate, 2),
                "total_kg": round(total_kg_produced, 2),
                "total_deheading_kg": round(total_dh_kg, 2),
                "total_peeling_kg": round(total_peel_kg, 2),
                "worked_duties": total_worked_duties,
                "worked_days": worked_days_count,
                "base_earnings": round(base_earnings, 2),
                "approved_ot_hours": 0.0,
                "ot_pay": 0.0,
                "gross_pay": round(base_earnings, 2),
                "salary_advance": 0.0,
                "salary_adjustment": round(salary_adj, 2),
                "salary_adjustment_reason": adj_reason,
                "net_pay": round(net_pay, 2),
                "att_map": att_map,
                "att_details": att_details
            })

        # Process any extra KgBasisCompanyLabour workers not in KgBasisWorker table
        labour_grouped = defaultdict(list)
        for kl in kg_labour_records:
            l_name = (kl.labour_name or "KG Worker").strip()
            labour_grouped[l_name].append(kl)

        for l_name, kl_list in labour_grouped.items():
            if l_name.lower() in processed_names:
                continue
            processed_names.add(l_name.lower())

            total_kg_produced = sum([float(r.quantity_kg or 0.0) for r in kl_list])
            total_kg_amount = sum([float(r.amount or 0.0) for r in kl_list])

            daily_att_values = {}
            daily_kg = defaultdict(float)
            for r in kl_list:
                d_no = r.work_date.day
                daily_att_values[d_no] = 1.0
                daily_kg[d_no] += float(r.quantity_kg or 0.0)

            total_worked_duties = float(len(daily_att_values))
            worked_days_count = len(daily_att_values)

            att_map = {}
            for d in range(1, days_in_month + 1):
                val = daily_att_values.get(d, 0.0)
                kg_val = round(daily_kg.get(d, 0.0), 1)
                if kg_val > 0:
                    att_map[d] = f"P ({kg_val}kg)"
                elif val == 1.0:
                    att_map[d] = "P"
                elif val == 0.5:
                    att_map[d] = "HP"
                else:
                    att_map[d] = "A"

            w_id = f"KG-{kl_list[0].id}"
            per_day_rate = 0.0
            base_earnings = total_kg_amount
            salary_adj, adj_reason = get_worker_adj(w_id)
            net_pay = max(0.0, base_earnings + salary_adj)

            result.append({
                "id": w_id,
                "name": l_name,
                "dept": "KG WORKER",
                "contractor": "KG BASIS",
                "per_day_rate": round(per_day_rate, 2),
                "total_kg": round(total_kg_produced, 2),
                "total_deheading_kg": round(total_kg_produced, 2),
                "total_peeling_kg": 0.0,
                "worked_duties": total_worked_duties,
                "worked_days": worked_days_count,
                "base_earnings": round(base_earnings, 2),
                "approved_ot_hours": 0.0,
                "ot_pay": 0.0,
                "gross_pay": round(base_earnings, 2),
                "salary_advance": 0.0,
                "salary_adjustment": round(salary_adj, 2),
                "salary_adjustment_reason": adj_reason,
                "net_pay": round(net_pay, 2),
                "att_map": att_map
            })

        return {
            "days_in_month": days_in_month,
            "month_name": calendar.month_name[month_no],
            "company_name": company.company_name if company else company_id,
            "workers": result
        }
    except Exception as exc:
        print(f"❌ Error in get_kg_basis_salary_report: {exc}")
        return JSONResponse({"days_in_month": 31, "month_name": "", "company_name": "", "workers": [], "error": str(exc)}, status_code=200)


# ==================================================
# 8️⃣ SAVE SALARY ADJUSTMENT FOR WORKERS (DAY & KG BASIS)
# ==================================================
@router.post("/api/salary/save-worker-adjustment")
def save_worker_adjustment(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    try:
        company_id = request.session.get("company_code") or request.session.get("company_id")
        if not company_id:
            return JSONResponse({"status": "error", "message": "Session expired"}, status_code=401)

        current_day = ist_now().day
        if not (1 <= current_day <= 10):
            return JSONResponse({
                "status": "error",
                "message": f"🔒 Adjustments locked! Adjustments are allowed only between the 1st and 10th of the month. (Today is Day {current_day})"
            }, status_code=400)

        worker_id = str(payload.get("worker_id") or "").strip()
        worker_name = str(payload.get("worker_name") or worker_id).strip()
        month = str(payload.get("month") or "").strip()
        adjustment_amount = float(payload.get("adjustment_amount") or 0.0)
        reason = str(payload.get("reason") or "Salary Adjustment").strip()

        if not worker_id or not month:
            return JSONResponse({"status": "error", "message": "Worker ID and month are required"}, status_code=400)

        year, month_no = map(int, month.split("-"))
        adj_date = date(year, month_no, 1)

        adj_rec = db.query(DailyAttendance).filter(
            DailyAttendance.employee_id == worker_id,
            extract("year", DailyAttendance.duty_date) == year,
            extract("month", DailyAttendance.duty_date) == month_no,
            DailyAttendance.status == "ADJUSTMENT"
        ).first()

        if not adj_rec:
            adj_rec = db.query(DailyAttendance).filter(
                DailyAttendance.employee_id == worker_id,
                extract("year", DailyAttendance.duty_date) == year,
                extract("month", DailyAttendance.duty_date) == month_no
            ).first()

        if adj_rec:
            adj_rec.salary_adjustment = adjustment_amount
            adj_rec.salary_adjustment_reason = reason
        else:
            adj_rec = DailyAttendance(
                company_id=company_id,
                employee_id=worker_id,
                employee_name=worker_name,
                duty_date=adj_date,
                status="ADJUSTMENT",
                salary_adjustment=adjustment_amount,
                salary_adjustment_reason=reason,
                created_at=datetime.utcnow()
            )
            db.add(adj_rec)

        db.commit()
        return {"status": "success", "message": f"✅ Saved adjustment ₹{adjustment_amount} for {worker_name}"}
    except Exception as exc:
        db.rollback()
        return JSONResponse({"status": "error", "message": str(exc)}, status_code=500)


# ==================================================
# 9️⃣ DAILY TEMPORARY WORKERS SALARY REPORT (4TH TAB)
# ==================================================
@router.get("/api/salary/get-temp-day-workers-report")
def get_temp_day_workers_report(
    month: str, dept: str = "ALL", location: str = "ALL",
    request: Request = None, db: Session = Depends(get_db)
):
    try:
        company_id = request.session.get("company_code") or request.session.get("company_id")
        if not company_id:
            return JSONResponse({"error": "Unauthorized"}, status_code=401)

        year, month_no = map(int, month.split("-"))
        days_in_month = calendar.monthrange(year, month_no)[1]
        company = db.query(Company).filter(
            or_(
                Company.company_code == company_id,
                func.lower(Company.company_name) == func.lower(company_id)
            )
        ).first()

        cid_clean = str(company_id).strip().lower()

        # Query Temporary / Visitor Day Workers from DailyTemporaryWorker table ONLY
        temp_workers = db.query(DailyTemporaryWorker).filter(
            func.lower(DailyTemporaryWorker.company_id) == cid_clean,
            extract("year", DailyTemporaryWorker.work_date) == year,
            extract("month", DailyTemporaryWorker.work_date) == month_no
        ).all()

        result = []
        pending_ot_list = []
        processed_names = set()

        def get_worker_adj(w_id):
            rec = db.query(DailyAttendance).filter(
                DailyAttendance.employee_id == w_id,
                extract("year", DailyAttendance.duty_date) == year,
                extract("month", DailyAttendance.duty_date) == month_no,
                or_(
                    DailyAttendance.status == "ADJUSTMENT",
                    and_(DailyAttendance.salary_adjustment != None, DailyAttendance.salary_adjustment != 0)
                )
            ).first()
            if rec:
                return float(rec.salary_adjustment or 0.0), str(rec.salary_adjustment_reason or "")
            return 0.0, ""

        temp_grouped = defaultdict(list)
        for tw in temp_workers:
            w_key = (tw.worker_name or f"Temp #{tw.id}").strip()
            temp_grouped[w_key].append(tw)

        for tw_name, tw_list in temp_grouped.items():
            if tw_name.lower() in processed_names:
                continue
            processed_names.add(tw_name.lower())

            daily_att_values = {}
            per_day_rate = float(getattr(tw_list[0], "day_charge", 0.0) or getattr(tw_list[0], "amount", 0.0) or 500.0)
            ot_hourly_rate = per_day_rate / 8.0

            for tw in tw_list:
                daily_att_values[tw.work_date.day] = 1.0

            total_worked_duties = float(len(daily_att_values))
            worked_days_count = len(daily_att_values)

            att_map = {}
            for d in range(1, days_in_month + 1):
                val = daily_att_values.get(d, 0.0)
                att_map[d] = "P" if val == 1.0 else "A"

            base_earnings = total_worked_duties * per_day_rate
            w_id = f"TMP-{tw_list[0].id}"
            salary_adj, adj_reason = get_worker_adj(w_id)
            net_pay = max(0.0, base_earnings + salary_adj)

            result.append({
                "id": w_id,
                "name": tw_name,
                "dept": getattr(tw_list[0], "purpose", "TEMPORARY WORKER") or "TEMPORARY WORKER",
                "contractor": "DAILY TEMP / VISITOR",
                "per_day_rate": round(per_day_rate, 2),
                "worked_duties": total_worked_duties,
                "worked_days": worked_days_count,
                "base_earnings": round(base_earnings, 2),
                "approved_ot_hours": 0.0,
                "ot_hourly_rate": round(ot_hourly_rate, 2),
                "ot_pay": 0.0,
                "gross_pay": round(base_earnings, 2),
                "salary_advance": 0.0,
                "salary_adjustment": round(salary_adj, 2),
                "salary_adjustment_reason": adj_reason,
                "net_pay": round(net_pay, 2),
                "att_map": att_map
            })

        return {
            "days_in_month": days_in_month,
            "month_name": calendar.month_name[month_no],
            "company_name": company.company_name if company else company_id,
            "workers": result,
            "pending_ot_list": pending_ot_list
        }
    except Exception as exc:
        print(f"❌ Error in get_temp_day_workers_report: {exc}")
        return JSONResponse({"days_in_month": 31, "month_name": "", "company_name": "", "workers": [], "pending_ot_list": [], "error": str(exc)}, status_code=200)


