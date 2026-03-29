from fastapi import APIRouter, Request, Depends, Body
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import extract, and_
import calendar
from datetime import date
from collections import defaultdict

from app.database import get_db
from app.database.models.attendance import (
    EmployeeRegistration,
    DailyAttendance,
    EmployeeSalaryAdvance,
    EmployeeStatutoryMaster
)

router = APIRouter(tags=["SALARY_REPORTS"])

# ==================================================
# 1️⃣ PAGE RENDER
# ==================================================
@router.get("/attendance/salary/monthly-sheet", response_class=HTMLResponse)
def salary_sheet_page(request: Request):
    return request.app.state.templates.TemplateResponse(
        "attendance/salary_sheet.html",
        {"request": request}
    )

# ==================================================
# 2️⃣ DYNAMIC FILTERS (Location & Department)
# ==================================================
@router.get("/api/salary/get-locations")
def get_locations(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id: return []
    
    locations = db.query(EmployeeRegistration.location).filter(
        EmployeeRegistration.company_id == company_id,
        EmployeeRegistration.location != None
    ).distinct().all()
    
    return [loc[0] for loc in locations if loc[0]]

@router.get("/api/salary/get-departments")
def get_departments(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id: return []
    
    depts = db.query(EmployeeRegistration.department).filter(
        EmployeeRegistration.company_id == company_id,
        EmployeeRegistration.department != None
    ).distinct().all()
    
    return [d[0] for d in depts if d[0]]

# ==================================================
# 3️⃣ MAIN SALARY REPORT (The Ultimate Logic)
# ==================================================
@router.get("/api/salary/get-report")
def get_salary_report(
    month: str,
    dept: str,
    location: str,
    request: Request,
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    if not company_id:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    year, month_no = map(int, month.split("-"))
    days_in_month = calendar.monthrange(year, month_no)[1]

    # Employee Base Query with Company Filter
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

        daily_hours_sum = defaultdict(float)
        adjustment = 0.0

        for rec in attendance_records:
            if rec.salary_adjustment is not None:
                adjustment = float(rec.salary_adjustment)
            
            h = float(rec.working_hours or 0)
            if h > 0:
                daily_hours_sum[rec.duty_date.day] += h

        att_map = {}
        actual_present_count = 0.0
        worked_days_count = 0 

        for d in range(1, days_in_month + 1):
            total_wh = daily_hours_sum.get(d, 0)

            if total_wh >= 14: label, val = "2P", 2.0  
            elif total_wh >= 6: label, val = "P", 1.0
            elif total_wh >= 4: label, val = "HP", 0.5
            else: label, val = "A", 0.0
            
            att_map[d] = label
            actual_present_count += val
            if val > 0: worked_days_count += 1

        # Bonus Slabs
        extra_holidays = 4 if worked_days_count >= 25 else 3 if worked_days_count > 13 else 2 if worked_days_count == 13 else 1 if worked_days_count >= 7 else 0

        # Earnings Calculation
        total_payable_days = actual_present_count + extra_holidays + adjustment
        base_gross = emp.current_salary or 0
        per_day_rate = base_gross / 26
        earned_gross = total_payable_days * per_day_rate

        # TDS Calculation (As Percentage of Earned Gross)
        tds_percent = float(emp.tds or 0)
        tds_amount = (earned_gross * tds_percent / 100)

        # Statutory Deductions
        stat = db.query(EmployeeStatutoryMaster).filter(
            EmployeeStatutoryMaster.employee_id == emp.employee_id,
            EmployeeStatutoryMaster.status == "ACTIVE"
        ).first()

        pf = esi = pt = lwf = 0.0
        if stat:
            if stat.pf_applicable:
                pf = min(stat.pf_wage_limit, emp.basic_salary or 0) * (stat.pf_employee_percent / 100)
            if stat.esi_applicable and earned_gross <= stat.esi_wage_limit:
                esi = earned_gross * (stat.esi_employee_percent / 100)
            pt, lwf = (stat.pt_amount or 0), (stat.lwf_employee_amount or 0)

        # Advance Deductions
        adv_rec = db.query(EmployeeSalaryAdvance).filter(
            EmployeeSalaryAdvance.employee_id == emp.employee_id,
            EmployeeSalaryAdvance.status == "APPROVED",
            EmployeeSalaryAdvance.remaining_balance > 0,
            EmployeeSalaryAdvance.deduct_from <= month
        ).first()
        salary_advance = min(adv_rec.monthly_deduction, adv_rec.remaining_balance) if adv_rec else 0

        # Net Payout Calculation
        net_pay = earned_gross - (pf + esi + pt + lwf + tds_amount + salary_advance)

        result.append({
            "id": emp.employee_id,
            "name": emp.employee_name,
            "dept": emp.department or "GENERAL",
            "base_sal": round(base_gross, 2),
            "earned_gross": round(earned_gross, 2),
            "actual_duties": actual_present_count,
            "worked_days": worked_days_count,
            "extra_holidays": extra_holidays,
            "saved_adjustment": adjustment,
            "pf": round(pf, 2), 
            "esi": round(esi, 2), 
            "pt": pt, 
            "lwf": lwf, 
            "tds": round(tds_amount, 2), # TDS in Amount
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
    
    query = db.query(DailyAttendance).filter(
        DailyAttendance.employee_id == emp_id,
        DailyAttendance.company_id == company_id,
        extract("year", DailyAttendance.duty_date) == year,
        extract("month", DailyAttendance.duty_date) == month_no
    )
    
    if day:
        query = query.filter(extract("day", DailyAttendance.duty_date) == day)

    records = query.order_by(DailyAttendance.duty_date.asc()).all()

    grouped_data = defaultdict(lambda: {"hours": 0.0, "movements": []})
    
    for r in records:
        d_str = r.duty_date.strftime("%d-%m-%Y")
        grouped_data[d_str]["hours"] += float(r.working_hours or 0)
        
        m_list = getattr(r, 'movements', [])
        if m_list:
            grouped_data[d_str]["movements"].extend(m_list)

    data = []
    for dte, vals in grouped_data.items():
        wh = vals["hours"]
        status = "2P" if wh >= 14 else "P" if wh >= 6 else "HP" if wh >= 4 else "A"
        data.append({
            "date": dte,
            "hours": round(wh, 2),
            "status": status,
            "movements": vals["movements"]
        })
    return data

# ==================================================
# 5️⃣ SAVE ADJUSTMENT
# ==================================================
@router.post("/api/salary/save-adjustment")
def save_adjustment(payload: dict = Body(...), db: Session = Depends(get_db)):
    emp_id, month, value = payload["employee_id"], payload["month"], float(payload.get("adjustment", 0))
    year, month_no = map(int, month.split("-"))

    db.query(DailyAttendance).filter(
        DailyAttendance.employee_id == emp_id,
        extract("year", DailyAttendance.duty_date) == year,
        extract("month", DailyAttendance.duty_date) == month_no
    ).update({"salary_adjustment": value})
    
    db.commit()
    return {"status": "success"}