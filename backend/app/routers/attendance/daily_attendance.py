from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from sqlalchemy.orm.attributes import flag_modified
from datetime import datetime, date, timedelta

from app.database import get_db
from app.database.models.attendance import DailyAttendance, EmployeeRegistration

router = APIRouter(tags=["ATTENDANCE"])

@router.get("/daily", response_class=HTMLResponse)
def daily_page(request: Request):
    return request.app.state.templates.TemplateResponse(
        "attendance/daily_attendance.html", {"request": request}
    )

@router.post("/entry")
async def attendance_entry(request: Request, db: Session = Depends(get_db)):
    payload = await request.json()
    input_id = str(payload.get("employee_id", "")).strip()
    action = payload.get("action") # IN, OUT, EXIT
    
    # 🔥 1. Company Wise Data Filter
    company_id = request.session.get("company_code")
    
    if not input_id or not action or not company_id:
        return JSONResponse({"error": "INVALID_INPUT_OR_SESSION"}, status_code=400)

    now = datetime.now()
    time_str = now.strftime("%H:%M")

    # 🔥 2. DYNAMIC ID SEARCH: Short codes logic (Example: '1' searches '%00001')
    search_pattern = f"%{input_id.zfill(5)}"

    emp = db.query(EmployeeRegistration).filter(
        EmployeeRegistration.employee_id.like(search_pattern),
        EmployeeRegistration.company_id == company_id,
        EmployeeRegistration.status == "ACTIVE"
    ).first()

    if not emp:
        return JSONResponse({"error": f"ID {input_id} Not Found"}, status_code=404)

    full_employee_id = emp.employee_id

    # Active duty check (OPEN or AWAY status unnavi - Night shifts cover avtayi ikkada)
    duty = db.query(DailyAttendance).filter(
        DailyAttendance.employee_id == full_employee_id,
        DailyAttendance.company_id == company_id,
        DailyAttendance.status != "CLOSED"
    ).first()

    # CLOSED duty count for the day (Daily limit check)
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
        
        # Max 2 duties per day allowed
        if duty_count >= 2 and not duty:
            return JSONResponse({"error": "DAILY_DUTY_LIMIT_REACHED"}, status_code=403)

        if duty: # Re-entry from Break (AWAY -> OPEN)
            duty.movements.append({"type": "IN", "time": time_str})
            duty.status = "OPEN"
            flag_modified(duty, "movements")
        else: # Fresh Entry for the day
            duty = DailyAttendance(
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
            db.add(duty)

    elif action == "OUT": # BREAK / LUNCH
        if not duty: return JSONResponse({"error": "NO_ACTIVE_DUTY"}, status_code=400)
        if duty.status == "AWAY": return JSONResponse({"error": "ALREADY_ON_BREAK"}, status_code=400)
        
        duty.movements.append({"type": "OUT", "time": time_str})
        duty.status = "AWAY"
        flag_modified(duty, "movements")

    elif action == "EXIT": # FINAL SHIFT END
        if not duty: return JSONResponse({"error": "NO_ACTIVE_DUTY"}, status_code=400)
        
        duty.movements.append({"type": "EXIT", "time": time_str})
        duty.exit_time = now
        duty.status = "CLOSED"
        
        # Working Hours Calculation (Auto-handles across midnight)
        diff = now - duty.first_in
        wh = round(diff.total_seconds() / 3600, 2)
        duty.working_hours = wh
        flag_modified(duty, "movements")

    db.commit()
    return {"success": True, "employee_name": emp.employee_name}


@router.get("/today_all")
def today_attendance(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id: return []

    # 🔥 FIX: Get Today's records OR anyone who is still ON-DUTY (Night Shift)
    # Status CLOSED kani records anni display avtayi, date edaina sare.
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
            DailyAttendance.duty_date == date.today(), # Today's full data
            DailyAttendance.status != "CLOSED"         # Anyone still inside (Night shifts)
        )
    ).order_by(DailyAttendance.first_in.desc()).all()

    results = []
    for da, dept, desg in rows:
        wh = float(da.working_hours or 0)
        
        # 🔥 PAYROLL COUNTING LOGIC
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