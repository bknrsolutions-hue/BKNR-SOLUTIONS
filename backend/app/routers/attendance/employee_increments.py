# app/routers/attendance/employee_increment.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import date

from app.database import get_db
from app.database.models.attendance import (
    EmployeeRegistration,
    EmployeeIncrement
)

router = APIRouter(
    tags=["EMPLOYEE INCREMENT"]
)

templates = Jinja2Templates(directory="app/templates")

# ==================================================
# 📄 INCREMENT PAGE
# ==================================================
@router.get("", response_class=HTMLResponse)
def increment_page(request: Request):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=303)

    # ✅ FIX: TemplateResponse arguments updated
    return templates.TemplateResponse(
        request=request,
        name="attendance/employee_increments.html",
        context={
            "email": email,
            "company_id": company_code
        }
    )


# ==================================================
# 💾 SAVE INCREMENT
# ==================================================
@router.post("")
def save_increment(
    request: Request,
    employee_id: str = Form(...),
    increment_type: str = Form(...),   # FIXED / PERCENTAGE
    increment_value: float = Form(...),
    effective_from: date = Form(...),
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    approved_by = request.session.get("email")

    if not company_id or not approved_by:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    # 🔐 Safety check: Find Active Employee in the same company
    emp = db.query(EmployeeRegistration).filter(
        EmployeeRegistration.employee_id == employee_id,
        EmployeeRegistration.company_id == company_id,
        EmployeeRegistration.status == "ACTIVE"
    ).first()

    if not emp:
        return RedirectResponse(
            "/attendance/employee-increment?error=employee_not_found",
            status_code=303
        )

    old_salary = float(emp.current_salary or 0)

    # 🧮 Salary calculation
    if increment_type == "FIXED":
        new_salary = old_salary + increment_value
    else:  # PERCENTAGE
        new_salary = old_salary + (old_salary * increment_value / 100)

    # 📝 Save increment history
    new_inc_record = EmployeeIncrement(
        employee_id=employee_id,
        old_salary=old_salary,
        increment_type=increment_type,
        increment_value=increment_value,
        new_salary=new_salary,
        effective_from=effective_from,
        approved_by=approved_by,
        status="ACTIVE",
        company_id=company_id
    )
    db.add(new_inc_record)

    # 🔥 Apply salary immediately ONLY if effective date is today or past
    if effective_from <= date.today():
        emp.current_salary = new_salary

    db.commit()

    return RedirectResponse(
        "/attendance/employee-increment?success=1",
        status_code=303
    )