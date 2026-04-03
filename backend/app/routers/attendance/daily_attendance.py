# app/routers/attendance/daily_attendance.py

from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from sqlalchemy.orm.attributes import flag_modified
from datetime import datetime, date

from app.database import get_db
from app.database.models.attendance import DailyAttendance, EmployeeRegistration

router = APIRouter(tags=["ATTENDANCE"])
templates = Jinja2Templates(directory="app/templates")

# ---------------------------------------------------------
# PAGE LOAD
# ---------------------------------------------------------
@router.get("/daily", response_class=HTMLResponse)
def daily_attendance_page(request: Request):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    # ✅ FIX: TemplateResponse arguments updated
    return templates.TemplateResponse(
        request=request,
        name="attendance/daily_attendance.html",
        context={
            "email": email,
            "company_id": company_code
        }
    )

# ---------------------------------------------------------
# ATTENDANCE ENTRY (IN / OUT / EXIT)
# ---------------------------------------------------------
@router.post("/entry")
async def attendance_entry(request: Request, db: Session = Depends(get_db)):
    payload = await request.json()
    input_id = str(payload.get("employee_id", "")).strip()
    action = payload.get("action")  # IN, OUT, EXIT
    
    company_id = request.session.get("company_code")
    email = request.session.get("email")
    
    if not input_id or not action or not company_id:
        return JSONResponse({"error": "INVALID_INPUT_OR_SESSION"}, status_code=401)

    now = datetime.now()
    time_str = now.strftime("%H:%M")

    # DYNAMIC ID SEARCH (e.g., '1' -> '%00001')
    search_pattern = f"%{input_id.zfill(5)}"

    emp = db.query(EmployeeRegistration).filter(
        EmployeeRegistration.employee_id.like(search_pattern),
        EmployeeRegistration.company_id == company_id,
        EmployeeRegistration.status == "ACTIVE"
    ).first()

    if not emp:
        return JSONResponse({"error": f"ID {input_id} Not Found"}, status_code=404)

    full_employee_id = emp.employee_id

    # Active duty check (OPEN or AWAY)
    duty = db.query(DailyAttendance).filter(
        DailyAttendance.employee_id == full_employee_id,
        DailyAttendance.company_id == company_id,
        DailyAttendance.status != "CLOSED"
    ).first()

    # CLOSED duty count for the day
    duty_count = db.query(DailyAttendance).filter(
        DailyAttendance.employee_id == full_employee_id,
        DailyAttendance.company_id == company_id,
        DailyAttendance.duty_date == date.today(),
        DailyAttendance.status == "CLOSED"
    ).count()

    # --- LOGIC STARTS ---
    
    if action == "IN":
        if duty and duty.status == "OPEN":
            return JSONResponse({"error": "ALREADY_INSIDE"}, status_code=400)
        
        if duty_count >= 2 and not duty:
            return JSONResponse({"error": "DAILY_DUTY_LIMIT_REACHED"}, status_code=403)

        if duty: # Re-entry from Break (AWAY -> OPEN)
            movements = list(duty.movements) if duty.movements else []
            movements.append({"type": "IN", "time": time_str})
            duty.movements = movements
            duty.status = "OPEN"
            flag_modified(duty, "movements")
        else: # Fresh Entry
            new_duty = DailyAttendance(
                company_id=company_id,
                employee_id=full_employee_id,
                employee_name=emp.employee_name,
                designation=emp.designation, 
                employee_type=emp.employee_type,
                duty_date=date.today(),
                first_in=now,
                movements=[{"type": "IN", "time": time_str}],
                status="OPEN"
            )
            db.add(new_duty)

    elif action == "OUT": # BREAK
        if not duty: 
            return JSONResponse({"error": "NO_ACTIVE_DUTY"}, status_code=400)
        if duty.status == "AWAY": 
            return JSONResponse({"error": "ALREADY_ON_BREAK"}, status_code=400)
        
        movements = list(duty.movements) if duty.movements else []
        movements.append({"type": "OUT", "time": time_str})
        duty.movements = movements
        duty.status = "AWAY"
        flag_modified(duty, "movements")

    elif action == "EXIT": # FINAL EXIT
        if not duty: 
            return JSONResponse({"error": "NO_ACTIVE_DUTY"}, status_code=400)
        
        movements = list(duty.movements) if duty.movements else []
        movements.append({"type": "EXIT", "time": time_str})
        duty.movements = movements
        duty.exit_time = now
        duty.status = "CLOSED"
        
        # Working Hours Calculation
        diff = now - duty.first_in
        wh = round(diff.total_seconds() / 3600, 2)
        duty.working_hours = wh
        flag_modified(duty, "movements")

    db.commit()
    return {"success": True, "employee_name": emp.employee_name}


# ---------------------------------------------------------
# FETCH TODAY'S ATTENDANCE DATA
# ---------------------------------------------------------
@router.get("/today_all")
def today_attendance_list(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id: 
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    # Join with EmployeeRegistration to get latest Department/Designation
    rows = db.query(
        DailyAttendance, 
        EmployeeRegistration.department,
        EmployeeRegistration.designation
    ).join(
        EmployeeRegistration, 
        and_(
            DailyAttendance.employee_id == EmployeeRegistration.employee_id,
            DailyAttendance.company_id == EmployeeRegistration.company_id
        )
    ).filter(
        DailyAttendance.company_id == company_id,
        or_(
            DailyAttendance.duty_date == date.today(),
            DailyAttendance.status != "CLOSED"
        )
    ).order_by(DailyAttendance.first_in.desc()).all()

    results = []
    for da, dept, desg in rows:
        wh = float(da.working_hours or 0)
        
        # PAYROLL LOGIC (Based on Working Hours)
        if da.status != "CLOSED":
            duty_type = "ON-DUTY"
        else:
            if wh >= 14:
                duty_type = "DOUBLE"   
            elif wh >= 6:
                duty_type = "SINGLE"   
            elif wh >= 4:
                duty_type = "HALF"     
            else:
                duty_type = "ABSENT"   
        
        results.append({
            "employee_id": da.employee_id,
            "employee_name": da.employee_name,
            "department": dept or "GENERAL", 
            "designation": desg or "STAFF", 
            "working_hours": wh,
            "duty_type": duty_type,
            "status": da.status,
            "movements": da.movements or []
        })
    return results