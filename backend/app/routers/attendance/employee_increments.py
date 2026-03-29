from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
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

# ==================================================
# 📄 INCREMENT PAGE
# ==================================================
@router.get("", response_class=HTMLResponse)
def increment_page(request: Request):
    if not request.session.get("email"):
        return RedirectResponse("/", status_code=303)

    return request.app.state.templates.TemplateResponse(
        "attendance/employee_increments.html",
        {"request": request}
    )


# ==================================================
# 💾 SAVE INCREMENT
# ==================================================
@router.post("")
def save_increment(
    request: Request,
    db: Session = Depends(get_db),

    employee_id: str = Form(...),
    increment_type: str = Form(...),   # FIXED / PERCENTAGE
    increment_value: float = Form(...),
    effective_from: date = Form(...)
):
    company_id = request.session.get("company_code")
    approved_by = request.session.get("email")

    # 🔐 Safety check
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

    old_salary = emp.current_salary or 0

    # 🧮 Salary calculation
    if increment_type == "FIXED":
        new_salary = old_salary + increment_value
    else:  # PERCENTAGE
        new_salary = old_salary + (old_salary * increment_value / 100)

    # 📝 Save increment history
    inc = EmployeeIncrement(
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
    db.add(inc)

    # 🔥 Apply salary immediately ONLY if effective date <= today
    if effective_from <= date.today():
        emp.current_salary = new_salary

    db.commit()

    return RedirectResponse(
        "/attendance/employee-increment?success=1",
        status_code=303
    )
