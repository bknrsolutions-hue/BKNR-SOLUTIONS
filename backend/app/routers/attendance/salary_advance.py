# app/routers/attendance/salary_advance.py

from fastapi import APIRouter, Request, Form, Depends, Query
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

def serialize_salary_advance(r):
    if not r: return None
    return {
        "id": r.id,
        "production_at": r.production_at,
        "employee_id": r.employee_id,
        "employee_name": r.employee_name,
        "department": r.department,
        "company_id": r.company_id,
        "advance_date": r.advance_date.isoformat() if r.advance_date else "",
        "advance_amount": r.advance_amount,
        "deduction_mode": r.deduction_mode,
        "monthly_deduction": r.monthly_deduction,
        "paid_amount": r.paid_amount,
        "remaining_balance": r.remaining_balance,
        "deduct_from": r.deduct_from,
        "deduct_to": r.deduct_to,
        "reason": r.reason,
        "status": r.status,
        "approved_by": r.approved_by,
        "approved_date": r.approved_date.isoformat() if r.approved_date else None,
    }

# ==================================================
# 📄 SALARY ADVANCE PAGE (LIST + FORM)
# ==================================================
@router.get("/salary-advance", response_class=HTMLResponse)
def salary_advance_page(request: Request, format: str = Query(default="html"), db: Session = Depends(get_db)):
    email = request.session.get("email")
    company_id = request.session.get("company_code")

    if not email or not company_id:
        if format.lower() == "json" or "application/json" in request.headers.get("accept", ""):
            return JSONResponse({"error": "Session expired"}, status_code=401)
        return RedirectResponse("/", status_code=302)

    records = (
        db.query(EmployeeSalaryAdvance)
        .filter(EmployeeSalaryAdvance.company_id == company_id)
        .order_by(EmployeeSalaryAdvance.id.desc())
        .all()
    )

    if format.lower() == "json" or "application/json" in request.headers.get("accept", ""):
        return JSONResponse({
            "status": "success",
            "records": [serialize_salary_advance(r) for r in records]
        })

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
    wants_json = request.query_params.get("format") == "json" or "application/json" in request.headers.get("accept", "")

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
        if wants_json:
            return JSONResponse({"status": "error", "message": str(e)}, status_code=500)
        return JSONResponse({"error": str(e)}, status_code=500)

    if wants_json:
        return JSONResponse({"status": "success", "message": "Salary advance successfully created!"})
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