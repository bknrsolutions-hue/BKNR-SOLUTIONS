# app/routers/attendance/salary_advance.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import date

from app.database import get_db
from app.database.models.attendance import EmployeeSalaryAdvance

router = APIRouter(
    tags=["SALARY ADVANCE"]
)

templates = Jinja2Templates(directory="app/templates")

# ==================================================
# 📄 SALARY ADVANCE PAGE (LIST + FORM)
# ==================================================
@router.get("/salary-advance", response_class=HTMLResponse)
def salary_advance_page(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    company_id = request.session.get("company_code")

    if not email or not company_id:
        return RedirectResponse("/", status_code=302)

    records = (
        db.query(EmployeeSalaryAdvance)
        .filter(EmployeeSalaryAdvance.company_id == company_id)
        .order_by(EmployeeSalaryAdvance.id.desc())
        .all()
    )

    # ✅ FIX: TemplateResponse arguments updated
    return templates.TemplateResponse(
        request=request,
        name="attendance/salary_advance.html",
        context={
            "records": records,
            "email": email,
            "company_id": company_id
        }
    )


# ==================================================
# 💾 SAVE SALARY ADVANCE
# ==================================================
@router.post("/salary-advance/save")
def save_salary_advance(
    request: Request,
    employee_id: str = Form(...),
    employee_name: str = Form(...),
    department: str = Form(...),
    advance_amount: float = Form(...),
    monthly_deduction: float = Form(...),
    deduct_from: str = Form(...),   # YYYY-MM
    deduct_to: str = Form(None),    # YYYY-MM (optional)
    reason: str = Form(None),
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    approved_by = request.session.get("email")

    if not company_id or not approved_by:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    # Creating new advance record
    new_advance = EmployeeSalaryAdvance(
        # Employee Details
        employee_id=employee_id,
        employee_name=employee_name,
        department=department,
        company_id=company_id,

        # Advance Details
        advance_date=date.today(),
        advance_amount=advance_amount,

        # Deduction Configuration
        deduction_mode="MONTHLY",
        monthly_deduction=monthly_deduction,

        # Initial Balances (Salary Sheet will update these)
        paid_amount=0,
        remaining_balance=advance_amount,

        deduct_from=deduct_from,
        deduct_to=deduct_to,

        # Approval Info
        status="APPROVED",
        approved_by=approved_by,
        approved_date=date.today(),
        reason=reason
    )

    try:
        db.add(new_advance)
        db.commit()
    except Exception as e:
        db.rollback()
        return JSONResponse({"error": str(e)}, status_code=500)

    return RedirectResponse(
        url="/attendance/salary-advance",
        status_code=303
    )

# ==================================================
# 🗑️ DELETE ADVANCE (Optional)
# ==================================================
@router.post("/salary-advance/delete/{id}")
def delete_salary_advance(id: int, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    
    if not company_id:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    db.query(EmployeeSalaryAdvance).filter(
        EmployeeSalaryAdvance.id == id,
        EmployeeSalaryAdvance.company_id == company_id
    ).delete()
    
    db.commit()
    return JSONResponse({"status": "ok"})