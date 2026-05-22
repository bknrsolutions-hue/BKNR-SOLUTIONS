# app/routers/dashboard_router.py

from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import date, timedelta

from app.database import get_db
from app.database.models.attendance import DailyAttendance, EmployeeRegistration, EmployeeIncrement, EmployeeSalaryAdvance
from app.database.models.processing import AuditLog

# 1️⃣ ఇక్కడ మనం మెయిన్ డ్యాష్‌బోర్డ్ రూటర్‌ను డిఫైన్ చేస్తున్నాం
router = APIRouter(
    prefix="/dashboard",
    tags=["DASHBOARDS"]
)

templates = Jinja2Templates(directory="app/templates")

# 2️⃣ వేరే ఫైల్ నుండి ఇంపోర్ట్ చేసే తలకాయనొప్పి లేకుండా, ఫంక్షన్‌ను నేరుగా ఇక్కడే రాసేసాం భాయ్!
# దీనివల్ల ఆ 'ImportError: cannot import name router' అనే ఎర్రర్ వచ్చే ఛాన్సే లేదు.
@router.get("/hr_dashboard", response_class=HTMLResponse)
def hr_dashboard_page(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    today = date.today()

    # 🧮 TOP LEVEL METRICS
    total_staff = db.query(EmployeeRegistration).filter(
        EmployeeRegistration.company_id == company_code,
        EmployeeRegistration.status == "ACTIVE"
    ).count()

    today_present = db.query(DailyAttendance.employee_id).distinct().join(
        EmployeeRegistration, 
        and_(
            DailyAttendance.employee_id == EmployeeRegistration.employee_id,
            DailyAttendance.company_id == EmployeeRegistration.company_id
        )
    ).filter(
        EmployeeRegistration.company_id == company_code,
        DailyAttendance.duty_date == today,
        DailyAttendance.status != "ABSENT"
    ).count()

    inside_gate = db.query(DailyAttendance.employee_id).distinct().join(
        EmployeeRegistration,
        and_(
            DailyAttendance.employee_id == EmployeeRegistration.employee_id,
            DailyAttendance.company_id == EmployeeRegistration.company_id
        )
    ).filter(
        EmployeeRegistration.company_id == company_code,
        DailyAttendance.duty_date == today,
        DailyAttendance.status == "OPEN"
    ).count()

    double_duty_alerts = db.query(DailyAttendance).join(
        EmployeeRegistration,
        and_(
            DailyAttendance.employee_id == EmployeeRegistration.employee_id,
            DailyAttendance.company_id == EmployeeRegistration.company_id
        )
    ).filter(
        EmployeeRegistration.company_id == company_code,
        DailyAttendance.duty_date == today,
        DailyAttendance.working_hours >= 14.0
    ).count()

    # 💵 FINANCIAL COUNTERS
    total_payroll_gross = db.query(func.sum(EmployeeRegistration.current_salary)).filter(
        EmployeeRegistration.company_id == company_code,
        EmployeeRegistration.status == "ACTIVE"
    ).scalar() or 0.0

    total_advance_running = db.query(func.sum(EmployeeSalaryAdvance.remaining_balance)).filter(
        EmployeeSalaryAdvance.company_id == company_code,
        EmployeeSalaryAdvance.status == "APPROVED"
    ).scalar() or 0.0

    # 📊 DATA MATRICES & PANELS
    dept_rows = db.query(
        EmployeeRegistration.department,
        func.count(DailyAttendance.id).label("on_floor_count")
    ).join(
        DailyAttendance, 
        and_(
            EmployeeRegistration.employee_id == DailyAttendance.employee_id,
            EmployeeRegistration.company_id == DailyAttendance.company_id
        )
    ).filter(
        EmployeeRegistration.company_id == company_code,
        DailyAttendance.duty_date == today,
        DailyAttendance.status == "OPEN"
    ).group_by(EmployeeRegistration.department).all()

    live_feed_rows = db.query(DailyAttendance).join(
        EmployeeRegistration,
        and_(
            DailyAttendance.employee_id == EmployeeRegistration.employee_id,
            DailyAttendance.company_id == EmployeeRegistration.company_id
        )
    ).filter(
        EmployeeRegistration.company_id == company_code,
        DailyAttendance.duty_date == today
    ).order_by(DailyAttendance.first_in.desc()).limit(10).all()

    audit_logs_rows = db.query(AuditLog).filter(
        AuditLog.table_name == "daily_attendance",
        AuditLog.company_id == company_code
    ).order_by(AuditLog.edited_at.desc()).limit(10).all()

    audit_list = [{
        "timestamp": l.edited_at.strftime("%d-%b %H:%M"),
        "invoice_no": l.field_name,
        "details": l.new_value
    } for l in audit_logs_rows]

    recent_increments = db.query(EmployeeIncrement).join(
        EmployeeRegistration, EmployeeIncrement.employee_id == EmployeeRegistration.employee_id
    ).filter(
        EmployeeRegistration.company_id == company_code
    ).order_by(EmployeeIncrement.id.desc()).limit(5).all()

    active_loans = db.query(EmployeeSalaryAdvance).filter(
        EmployeeSalaryAdvance.company_id == company_code,
        EmployeeSalaryAdvance.remaining_balance > 0
    ).order_by(EmployeeSalaryAdvance.id.desc()).limit(5).all()

    all_employees = db.query(EmployeeRegistration).filter(
        EmployeeRegistration.company_id == company_code,
        EmployeeRegistration.status == "ACTIVE"
    ).order_by(EmployeeRegistration.employee_id.asc()).all()

    # 📈 CHART DATA (Last 6 Days Attendance Trend)
    trend_labels = []
    trend_values = []
    for i in range(5, -1, -1):
        target_date = today - timedelta(days=i)
        trend_labels.append(target_date.strftime("%d-%b"))
        
        count = db.query(DailyAttendance.employee_id).distinct().join(
            EmployeeRegistration,
            and_(
                DailyAttendance.employee_id == EmployeeRegistration.employee_id,
                DailyAttendance.company_id == EmployeeRegistration.company_id
            )
        ).filter(
            EmployeeRegistration.company_id == company_code,
            DailyAttendance.duty_date == target_date,
            DailyAttendance.status != "ABSENT"
        ).count()
        trend_values.append(count)

    dept_labels = [d.department if d.department else "GENERAL" for d in dept_rows]
    dept_values = [d.on_floor_count for d in dept_rows]

    # మనం లాస్ట్ టర్న్ లో రీనేమ్ చేసిన 'hr_command_center.html' కి కనెక్ట్ చేసాం భాయ్
    return templates.TemplateResponse(
        request=request,
        name="attendance/hr_command_center.html",  
        context={
            "email": email,
            "company_id": company_code,
            "total_staff": total_staff,
            "today_present": today_present,
            "inside_gate": inside_gate,
            "double_duty_alerts": double_duty_alerts,
            "total_payroll": total_payroll_gross,
            "total_advance": total_advance_running,
            "dept_matrix": dept_rows,
            "live_feed": live_feed_rows,
            "audit_logs": audit_list,
            "increments": recent_increments,
            "loans": active_loans,
            "employees": all_employees,
            "dept_labels": dept_labels,
            "dept_values": dept_values,
            "attendance_labels": trend_labels,
            "attendance_values": trend_values
        }
    )