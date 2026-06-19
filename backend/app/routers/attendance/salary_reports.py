# app/routers/attendance/salary_reports.py

from fastapi import APIRouter, Request, Depends, Body
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import extract, and_
import calendar
from datetime import date, datetime, timedelta
from collections import defaultdict

from app.database import get_db
from app.database.models.attendance import (
    EmployeeRegistration,
    DailyAttendance,
    EmployeeSalaryAdvance,
    EmployeeStatutoryMaster,
    Shift  
)

router = APIRouter(tags=["SALARY_REPORTS"])
templates = Jinja2Templates(directory="app/templates")

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
    if not company_id: return []
    locations = db.query(EmployeeRegistration.location).filter(
        EmployeeRegistration.company_id == company_id, EmployeeRegistration.location != None
    ).distinct().all()
    return [loc[0] for loc in locations if loc[0]]

@router.get("/api/salary/get-departments")
def get_departments(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id: return []
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

    year, month_no = map(int, month.split("-"))
    days_in_month = calendar.monthrange(year, month_no)[1]

    shift_map = get_company_shift_map(db, company_id)

    emp_query = db.query(EmployeeRegistration).filter(
        EmployeeRegistration.company_id == company_id,
        EmployeeRegistration.status == "ACTIVE"
    )

    if dept != "ALL": emp_query = emp_query.filter(EmployeeRegistration.department == dept)
    if location != "ALL": emp_query = emp_query.filter(EmployeeRegistration.location == location)

    employees = emp_query.all()
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
        total_approved_ot = 0.0
        ot_earnings = 0.0

        # Base Rates for Salary
        base_gross = float(emp.current_salary or 0)
        per_day_rate = base_gross / 26.0

        for rec in attendance_records:
            # 🟢 BUG FIX: Use max() to prevent loop overwrite
            if rec.salary_adjustment:
                adjustment = max(adjustment, float(rec.salary_adjustment))
            
            shift_name = rec.shift_name or "GENERAL"
            req_hours = shift_map.get(shift_name, 8.0)
            wh = float(rec.working_hours or 0)
            
            # 🟢 SIMPLIFIED DUTY CREDIT FORMULA
            duty_credit = round(wh / req_hours, 1) if req_hours > 0 else 0
            
            if duty_credit < 0.5:
                val = 0.0
            else:
                # 🟢 DOUBLE DUTY APPROVAL SAFETY
                if duty_credit > 1.0:
                    d_status = getattr(rec, 'duty_status', 'APPROVED') # Needs link to DutyApproval table
                    if d_status == 'APPROVED':
                        val = duty_credit
                    else:
                        val = 1.0 # Capped at single duty until HR approves
                else:
                    val = duty_credit

            daily_att_values[rec.duty_date.day] += val

            # 🟢 OT HOURLY RATE (Correct Shift Formula)
            if getattr(rec, 'ot_status', None) == 'APPROVED' and getattr(rec, 'approved_ot_hours', None):
                approved_ot_hrs = float(rec.approved_ot_hours)
                total_approved_ot += approved_ot_hrs
                hourly_rate = per_day_rate / req_hours if req_hours > 0 else (per_day_rate / 8.0)
                ot_earnings += (approved_ot_hrs * hourly_rate)

        att_map = {}
        # 🟢 ADDED 2.5P COUNT
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
            else: label = f"{val}P"
            
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
        earned_gross = (total_payable_days * per_day_rate) + ot_earnings

        # TDS
        tds_percent = float(emp.tds or 0)
        tds_amount = (earned_gross * tds_percent / 100)

        # Statutory
        stat = db.query(EmployeeStatutoryMaster).filter(
            EmployeeStatutoryMaster.employee_id == emp.employee_id, EmployeeStatutoryMaster.company_id == company_id, EmployeeStatutoryMaster.status == "ACTIVE"
        ).first()

        pf = esi = pt = lwf = 0.0
        employer_pf = employer_esi = 0.0 # 🟢 8. EMPLOYER CONTRIBUTION VARS
        
        if stat:
            if stat.pf_applicable:
                pf_wage = min(stat.pf_wage_limit, float(emp.basic_salary or 0))
                pf = pf_wage * (stat.pf_employee_percent / 100)
                employer_pf = pf_wage * (getattr(stat, 'pf_employer_percent', 13.0) / 100) # Defaults to 13% (12% EPF + 1% Admin)
                
            if stat.esi_applicable and earned_gross <= stat.esi_wage_limit:
                esi = earned_gross * (stat.esi_employee_percent / 100)
                employer_esi = earned_gross * (getattr(stat, 'esi_employer_percent', 3.25) / 100) # Standard 3.25%
                
            pt, lwf = (stat.pt_amount or 0), (stat.lwf_employee_amount or 0)

        # 🟢 3. ADVANCE DEDUCT RANGE FIX
        adv_rec = db.query(EmployeeSalaryAdvance).filter(
            EmployeeSalaryAdvance.employee_id == emp.employee_id, 
            EmployeeSalaryAdvance.company_id == company_id, 
            EmployeeSalaryAdvance.status == "APPROVED",
            EmployeeSalaryAdvance.remaining_balance > 0,
            EmployeeSalaryAdvance.deduct_from <= month,
            getattr(EmployeeSalaryAdvance, 'deduct_to', month) >= month # Safe check if 'deduct_to' doesn't exist yet
        ).first()
        
        salary_advance = min(adv_rec.monthly_deduction, adv_rec.remaining_balance) if adv_rec else 0

        net_pay = earned_gross - (pf + esi + pt + lwf + tds_amount + salary_advance)

        result.append({
            "id": emp.employee_id,
            "name": emp.employee_name,
            "dept": emp.department or "GENERAL",
            "base_sal": round(base_gross, 2),
            "earned_gross": round(earned_gross, 2),
            "actual_duties": actual_present_count,
            "duty_counts": duty_counts,
            "worked_days": worked_days_count,
            "extra_holidays": extra_holidays,
            "saved_adjustment": adjustment,
            "ot_hours": round(total_approved_ot, 2),
            "ot_earnings": round(ot_earnings, 2), 
            "pf": round(pf, 2), "esi": round(esi, 2), "pt": pt, "lwf": lwf, "tds": round(tds_amount, 2),
            "employer_pf": round(employer_pf, 2), "employer_esi": round(employer_esi, 2),
            "salary_advance": round(salary_advance, 2),
            "net_pay": round(net_pay, 2),
            "att_map": att_map
        })

    return {"days_in_month": days_in_month, "month_name": calendar.month_name[month_no], "employees": result}


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
        
        duty_credit = round(wh / req_hours, 1) if req_hours > 0 else 0
        if duty_credit >= 3.0: status = "3P"
        elif duty_credit >= 2.5: status = "2.5P"
        elif duty_credit >= 2.0: status = "2P"
        elif duty_credit >= 1.5: status = "1.5P"
        elif duty_credit >= 1.0: status = "P"
        elif duty_credit >= 0.5: status = "HP"
        else: status = "A"

        data.append({
            "date": r.duty_date.strftime("%d-%m-%Y"),
            "shift": shift_name,
            "hours": round(wh, 2),
            "status": status,
            "movements": list(r.movements) if r.movements else []
        })

    return data

@router.post("/api/salary/save-adjustment")
def save_adjustment(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    emp_id = payload.get("employee_id")
    month = payload.get("month")
    value = float(payload.get("adjustment", 0))
    year, month_no = map(int, month.split("-"))

    db.query(DailyAttendance).filter(
        DailyAttendance.employee_id == emp_id, DailyAttendance.company_id == company_id,
        extract("year", DailyAttendance.duty_date) == year, extract("month", DailyAttendance.duty_date) == month_no
    ).update({"salary_adjustment": value})
    
    db.commit()
    return {"status": "success"}