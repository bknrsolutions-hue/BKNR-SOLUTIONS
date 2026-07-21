# app/routers/attendance/salary_reports.py

from fastapi import APIRouter, Request, Depends, Body, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import extract, and_, or_
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
    Shift  
)
from app.database.models.criteria import contractors
from app.database.models.enterprise_finance import VoucherHeader
from app.database.models.users import Company
from app.services.bill_accounting import amount_line, cancel_linked_bill_voucher, ensure_bill_accounting_schema, post_contractor_source_charge
from app.services.posting_engine import PostingEngineService
from app.services.payroll_statutory import calculate_pf_esi, effective_statutory_record
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

@router.get("/attendance/salary/monthly-sheet", response_class=HTMLResponse)
def salary_sheet_page(request: Request):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    return templates.TemplateResponse(
        request=request,
        name="attendance/salary_sheet.html",
        context={"email": email, "company_id": company_code}
    )

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
    ensure_bill_accounting_schema(db)
    company = db.query(Company).filter(Company.company_code == company_id).first()

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
            
            # 🟢 CORPORATE FIXED SLAB DUTY CREDIT
            raw_credit = wh / req_hours if req_hours > 0 else 0
            
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
        
        # 🟢 SYNCHRONIZED FIXED SLAB DUTY CREDIT FOR POPUP
        raw_credit = wh / req_hours if req_hours > 0 else 0
        if raw_credit < 0.5: duty_credit = 0.0
        elif raw_credit < 1.0: duty_credit = 0.5
        elif raw_credit < 1.5: duty_credit = 1.0
        elif raw_credit < 2.0: duty_credit = 1.5
        elif raw_credit < 2.5: duty_credit = 2.0
        elif raw_credit < 3.0: duty_credit = 2.5
        else: duty_credit = 3.0

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
        else:
            # Normal OUT punch (< 24 hours)
            last_record.out_time = punch_time
            last_record.working_hours = round(time_diff_hours, 2)
            db.commit()
            return {"message": "Punched OUT Successfully."}
    else:
        raise HTTPException(status_code=400, detail="Invalid punch type. Must be IN or OUT.")
