# app/routers/attendance/daily_attendance.py

from fastapi import APIRouter, Request, Depends, Body, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, desc
from sqlalchemy.orm.attributes import flag_modified
from datetime import datetime, date
import datetime as dt
import logging
import io
import openpyxl
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side

from app.database import get_db
from app.database.models.attendance import DailyAttendance, EmployeeRegistration
from app.database.models.processing import AuditLog  # మాస్టర్ ఆడిట్ ట్రాక్ మోడల్ సింక్

router = APIRouter(tags=["ATTENDANCE"])
templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)


# ============================================================
# 📋 PYDANTIC SCHEMAS FOR JSON PAYLOADS
# ============================================================
class AttendanceEntrySchema(BaseModel):
    employee_id: str
    action: str  # IN, OUT, EXIT


# ============================================================
# 📅 1. PAGE LOAD (GET)
# ============================================================
@router.get("/daily", response_class=HTMLResponse)
def daily_attendance_page(request: Request):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    return templates.TemplateResponse(
        request=request,
        name="attendance/daily_attendance.html",
        context={
            "email": email,
            "company_id": company_code
        }
    )


# ============================================================
# ⏱️ 2. ATTENDANCE ENTRY (IN / OUT / EXIT - POST JSON Payload)
# ============================================================
@router.post("/entry")
async def attendance_entry(
    request: Request, 
    payload: AttendanceEntrySchema,
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    email = request.session.get("email")
    
    if not company_id or not email:
        return JSONResponse({"success": False, "error": "INVALID_SESSION"}, status_code=401)

    input_id = payload.employee_id.strip()
    action = payload.action.upper().strip() # IN, OUT, EXIT

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
        return JSONResponse({"success": False, "error": f"ID {input_id} Not Found"}, status_code=404)

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

    # --- LOGIC STREAM MANAGEMENT ---
    try:
        audit_details = ""
        
        if action == "IN":
            if duty and duty.status == "OPEN":
                return JSONResponse({"success": False, "error": "ALREADY_INSIDE"}, status_code=400)
            
            if duty_count >= 2 and not duty:
                return JSONResponse({"success": False, "error": "DAILY_DUTY_LIMIT_REACHED"}, status_code=403)

            if duty: # Re-entry from Break (AWAY -> OPEN)
                movements = list(duty.movements) if duty.movements else []
                movements.append({"type": "IN", "time": time_str})
                duty.movements = movements
                duty.status = "OPEN"
                flag_modified(duty, "movements")
                audit_details = f"Re-entry In at {time_str}"
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
                audit_details = f"Fresh Shift Punch In at {time_str}"

        elif action == "OUT": # BREAK
            if not duty: 
                return JSONResponse({"success": False, "error": "NO_ACTIVE_DUTY"}, status_code=400)
            if duty.status == "AWAY": 
                return JSONResponse({"success": False, "error": "ALREADY_ON_BREAK"}, status_code=400)
            
            movements = list(duty.movements) if duty.movements else []
            movements.append({"type": "OUT", "time": time_str})
            duty.movements = movements
            duty.status = "AWAY"
            flag_modified(duty, "movements")
            audit_details = f"Break Out at {time_str}"

        elif action == "EXIT": # FINAL EXIT
            if not duty: 
                return JSONResponse({"success": False, "error": "NO_ACTIVE_DUTY"}, status_code=400)
            
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
            audit_details = f"Final Shift Close at {time_str} ({wh} Hrs Worked)"

        # 📜 Operational Audit Log Trace Injection
        db.add(AuditLog(
            table_name="daily_attendance", record_id=emp.id, company_id=company_id,
            field_name=f"PUNCH_{action}", old_value="ATTENDANCE_STREAM", 
            new_value=f"Emp: {emp.employee_name} ({full_employee_id}) | {audit_details}",
            edited_by=email, edited_at=datetime.now(dt.timezone.utc)
        ))

        db.commit()
        return {"success": True, "employee_name": emp.employee_name, "message": "Punch committed successfully"}

    except Exception as e:
        db.rollback()
        logger.error(f"ATTENDANCE POST ERROR: {str(e)}")
        return JSONResponse({"success": False, "error": f"Database processing fault: {str(e)}"}, status_code=500)


# ============================================================
# 📊 3. FETCH TODAY'S ATTENDANCE DATA (GET AJAX)
# ============================================================
@router.get("/today_all")
def today_attendance_list(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id: 
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

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


# ============================================================
# 📜 4. MASTER AUDIT HISTORY LOG ENGINE (GET)
# ============================================================
@router.get("/audit_all")
async def get_all_attendance_audit(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)

    logs = (
        db.query(AuditLog)
        .filter(AuditLog.table_name == "daily_attendance", AuditLog.company_id == comp_code)
        .order_by(AuditLog.edited_at.desc()).limit(100).all()
    )

    return [{
        "timestamp": l.edited_at.strftime("%d-%m-%Y %H:%M:%S"),
        "user": l.edited_by.split('@')[0],
        "invoice_no": l.field_name, # Event string mapping token redirection 
        "action": "PUNCH TRANSACTION",
        "details": l.new_value
    } for l in logs]


# ============================================================
# 📈 5. GLOBAL MASTER EXCEL EXPORT LEDGER (GET)
# ============================================================
@router.get("/export/excel")
def export_attendance_excel(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/", status_code=302)

    rows = db.query(
        DailyAttendance, 
        EmployeeRegistration.department
    ).join(
        EmployeeRegistration, 
        and_(
            DailyAttendance.employee_id == EmployeeRegistration.employee_id,
            DailyAttendance.company_id == EmployeeRegistration.company_id
        )
    ).filter(
        DailyAttendance.company_id == company_id,
        DailyAttendance.duty_date == date.today()
    ).order_by(DailyAttendance.first_in.desc()).all()

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Today Attendance"
    ws.views.sheetView[0].showGridLines = True

    header_fill = PatternFill(start_color="143465", end_color="143465", fill_type="solid")
    header_font = Font(name="Arial", size=11, bold=True, color="FFFFFF")
    data_font = Font(name="Arial", size=10)
    
    thin_border = Border(
        left=Side(style='thin', color='CBD5E1'), right=Side(style='thin', color='CBD5E1'),
        top=Side(style='thin', color='CBD5E1'), bottom=Side(style='thin', color='CBD5E1')
    )

    headers = ["Sl No", "Employee ID", "Employee Name", "Department", "Designation", "First In", "Status", "Working Hours", "Duty Allocation"]
    ws.append(headers)

    for col_num, header in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col_num)
        cell.fill = header_fill
        cell.font = header_font
        cell.alignment = Alignment(horizontal="center", vertical="center")

    for idx, (da, dept) in enumerate(rows, 1):
        wh = float(da.working_hours or 0)
        duty_type = "ON-DUTY" if da.status != "CLOSED" else ("DOUBLE" if wh >= 14 else ("SINGLE" if wh >= 6 else ("HALF" if wh >= 4 else "ABSENT")))
        
        row_data = [
            idx,
            da.employee_id,
            da.employee_name,
            dept or "GENERAL",
            da.designation or "STAFF",
            da.first_in.strftime("%H:%M:%S") if da.first_in else "-",
            da.status,
            wh,
            duty_type
        ]
        ws.append(row_data)
        
        curr_row = ws.max_row
        for col_idx in range(1, len(headers) + 1):
            cell = ws.cell(row=curr_row, column=col_idx)
            cell.font = data_font
            cell.border = thin_border
            if col_idx == 8:
                cell.number_format = '#,##0.00'
                cell.alignment = Alignment(horizontal="right")
            elif col_idx in [1, 2, 6, 7, 9]:
                cell.alignment = Alignment(horizontal="center")

    for col in ws.columns:
        max_len = max(len(str(cell.value or '')) for cell in col)
        col_letter = openpyxl.utils.get_column_letter(col[0].column)
        ws.column_dimensions[col_letter].width = max(max_len + 3, 11)

    stream = io.BytesIO()
    wb.save(stream)
    stream.seek(0)

    filename = f"Attendance_Ledger_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
    return StreamingResponse(
        stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )