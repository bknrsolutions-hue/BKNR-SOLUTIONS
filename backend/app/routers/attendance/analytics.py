from fastapi import APIRouter, Request, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
from app.database import get_db
from app.database.models.attendance import EmployeeRegistration, DailyAttendance

router = APIRouter() # Prefix ikkada ivvadu

@router.get("/dashboard/hr_dashboard")
def get_hr_dashboard(request: Request):
    return request.app.state.templates.TemplateResponse(
        "attendance/ceo_dashboard.html", {"request": request}
    )

# Ippudu nee log lo vachina exact path ikkada register chesam
@router.get("/api/ceo-metrics")
def get_ceo_metrics(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    today = date.today()

    if not company_id:
        return {"error": "No Company Session"}

    # Company wise master count
    total_staff = db.query(EmployeeRegistration).filter(
        EmployeeRegistration.company_id == company_id,
        EmployeeRegistration.status == "ACTIVE"
    ).count()

    # Today's live data with Company Filter
    attendance_rows = db.query(DailyAttendance).join(
        EmployeeRegistration, DailyAttendance.employee_id == EmployeeRegistration.employee_id
    ).filter(
        EmployeeRegistration.company_id == company_id,
        DailyAttendance.duty_date == today
    ).all()

    return {
        "summary": {
            "total_master": total_staff,
            "present_today": len(attendance_rows),
            "attendance_rate": round((len(attendance_rows)/total_staff*100),1) if total_staff > 0 else 0,
            "inside_now": len([r for r in attendance_rows if r.status == "OPEN"]),
            "double_duty_alerts": len([r for r in attendance_rows if (r.working_hours or 0) >= 14])
        },
        "departmental_deployment": [
            {"dept": d[0] if d[0] else "GEN", "count": d[1]} for d in 
            db.query(EmployeeRegistration.department, func.count(DailyAttendance.id))
            .join(DailyAttendance, EmployeeRegistration.employee_id == DailyAttendance.employee_id)
            .filter(EmployeeRegistration.company_id == company_id, DailyAttendance.duty_date == today)
            .group_by(EmployeeRegistration.department).all()
        ]
    }