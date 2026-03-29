from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import date

from app.database import get_db
from app.database.models.attendance import EmployeeSalaryAdvance

router = APIRouter(
    tags=["SALARY ADVANCE"]
)

# ==================================================
# 📄 SALARY ADVANCE PAGE (LIST + FORM)
# ==================================================
@router.get("/salary-advance", response_class=HTMLResponse)
def salary_advance_page(
    request: Request,
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")

    records = (
        db.query(EmployeeSalaryAdvance)
        .filter(EmployeeSalaryAdvance.company_id == company_id)
        .order_by(EmployeeSalaryAdvance.created_at.desc())
        .all()
    )

    return request.app.state.templates.TemplateResponse(
        "attendance/salary_advance.html",
        {
            "request": request,
            "records": records
        }
    )


# ==================================================
# 💾 SAVE SALARY ADVANCE (OFFLINE APPROVED CONFIG)
# ==================================================
@router.post("/salary-advance/save")
def save_salary_advance(
    request: Request,

    # -------- EMPLOYEE --------
    employee_id: str = Form(...),
    employee_name: str = Form(...),
    department: str = Form(...),

    # -------- ADVANCE CONFIG --------
    advance_amount: float = Form(...),
    monthly_deduction: float = Form(...),

    deduct_from: str = Form(...),   # YYYY-MM
    deduct_to: str = Form(None),    # YYYY-MM (optional)

    reason: str = Form(None),

    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    approved_by = request.session.get("email")

    advance = EmployeeSalaryAdvance(
        # Employee
        employee_id=employee_id,
        employee_name=employee_name,
        department=department,
        company_id=company_id,

        # Advance
        advance_date=date.today(),
        advance_amount=advance_amount,

        # Deduction (ONLY CONFIG)
        deduction_mode="MONTHLY",
        monthly_deduction=monthly_deduction,

        # 🔒 Salary Sheet will update these later
        paid_amount=0,
        remaining_balance=advance_amount,

        deduct_from=deduct_from,
        deduct_to=deduct_to,

        # Approval
        status="APPROVED",
        approved_by=approved_by,
        approved_date=date.today(),

        reason=reason
    )

    db.add(advance)
    db.commit()

    return RedirectResponse(
        url="/attendance/salary-advance",
        status_code=303
    )
