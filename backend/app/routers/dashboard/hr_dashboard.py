from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date

from app.database import get_db
from app.database.models.attendance import EmployeeRegistration, DailyAttendance, EmployeeIncrement, EmployeeStatutoryMaster, EmployeeSalaryAdvance

router = APIRouter(prefix="", tags=["HR Dashboard"])
templates = Jinja2Templates(directory="app/templates")

@router.get("/hr_dashboard", response_class=HTMLResponse)
def hr_dashboard_page(request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    email = request.session.get("email")

    if not company_code or not email:
        return RedirectResponse("/auth/login", status_code=303)

    return templates.TemplateResponse(
        request=request,
        name="dashboard/hr_dashboard.html",
        context={"company_id": company_code}
    )

@router.get("/hr/dashboard_data")
def get_hr_data(db: Session = Depends(get_db), company_code: str = Query(None)):
    emp_q = db.query(EmployeeRegistration).filter(EmployeeRegistration.company_id == company_code)
    
    # 16 KPI Calculations
    total = emp_q.count()
    active = emp_q.filter(EmployeeRegistration.status == "ACTIVE").count()
    
    # Statutory & Payroll
    payroll = db.query(func.sum(EmployeeRegistration.current_salary)).filter(EmployeeRegistration.company_id == company_code).scalar() or 0
    adv = db.query(func.sum(EmployeeSalaryAdvance.remaining_balance)).scalar() or 0
    
    return {
        "kpis": {
            "k1": total, "k2": active, "k3": total - active,
            "k4": emp_q.filter(EmployeeRegistration.employee_type == "PERMANENT").count(),
            "k5": emp_q.filter(EmployeeRegistration.employee_type == "CONTRACT").count(),
            "k6": 0, "k7": 0, "k8": 0,
            "k9": f"₹{float(payroll):,.0f}", "k10": f"₹{float(payroll/total if total else 0):,.0f}",
            "k11": db.query(EmployeeStatutoryMaster).filter(EmployeeStatutoryMaster.pf_applicable == True).count(),
            "k12": db.query(EmployeeStatutoryMaster).filter(EmployeeStatutoryMaster.esi_applicable == True).count(),
            "k13": f"₹{float(adv):,.0f}", "k14": 0, "k15": 0, "k16": "0%"
        },
        "directory": [
            {
                "id": e.employee_id, "name": e.employee_name, "dept": e.department,
                "desg": e.designation, "type": e.employee_type, "sal": e.current_salary, "status": e.status
            } for e in emp_q.limit(50).all()
        ]
    }