from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import date
import logging

from app.database import get_db
from app.database.models.attendance import (
    EmployeeStatutoryMaster,
    EmployeeRegistration
)

# Logger setup
logger = logging.getLogger(__name__)

# Prefix unna lekapoyina relative paths tho handle chestundi
router = APIRouter(tags=["PAYROLL STATUTORY"])

# ==================================================
# 📡 1. EMPLOYEE DROPDOWN LOOKUP API
# ==================================================
@router.get("/api/employees")
def employee_dropdown(request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code:
        return []

    employees = (
        db.query(EmployeeRegistration)
        .filter(
            EmployeeRegistration.company_id == str(company_code),
            EmployeeRegistration.status == "ACTIVE"
        )
        .order_by(EmployeeRegistration.employee_id.asc())
        .all()
    )

    return [
        {
            "employee_id": e.employee_id,
            "employee_name": e.employee_name,
            "department": e.department or "N/A",
            "uan_number": e.uan_number or ""
        }
        for e in employees
    ]

# ==================================================
# 📄 2. LIST PAGE
# ==================================================
@router.get("/tax-master", response_class=HTMLResponse)
def tax_master_page(request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse(url="/login")

    records = (
        db.query(EmployeeStatutoryMaster)
        .filter(EmployeeStatutoryMaster.company_id == str(company_code))
        .order_by(EmployeeStatutoryMaster.applicable_from.desc())
        .all()
    )

    return request.app.state.templates.TemplateResponse(
        "attendance/tax_master.html",
        {
            "request": request,
            "records": records,
            "edit_data": None
        }
    )

# ==================================================
# 💾 3. SAVE NEW CONFIG
# ==================================================
@router.post("/payroll/statutory/save")
def save_tax_master(
    request: Request,
    employee_id: str = Form(...),
    employee_name: str = Form(...),
    department: str = Form(None),
    applicable_from: str = Form(...),
    pf_applicable: str = Form(...),
    uan_number: str = Form(None),
    pf_employee_percent: float = Form(12.0),
    pf_employer_percent: float = Form(12.0),
    esi_applicable: str = Form(...),
    esi_number: str = Form(None),
    esi_employee_percent: float = Form(0.75),
    esi_employer_percent: float = Form(3.25),
    pt_applicable: str = Form(...),
    pt_amount: float = Form(0),
    lwf_applicable: str = Form(...),
    lwf_amount: float = Form(0),
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")

    try:
        y, m = applicable_from.split("-")
        app_date = date(int(y), int(m), 1)
    except:
        app_date = date.today().replace(day=1)

    new_record = EmployeeStatutoryMaster(
        employee_id=employee_id,
        employee_name=employee_name,
        department=department,
        company_id=str(company_code),
        applicable_from=app_date,
        pf_applicable=(pf_applicable == "YES"),
        uan_number=uan_number,
        pf_employee_percent=pf_employee_percent,
        pf_employer_percent=pf_employer_percent,
        esi_applicable=(esi_applicable == "YES"),
        esi_number=esi_number,
        esi_employee_percent=esi_employee_percent,
        esi_employer_percent=esi_employer_percent,
        pt_applicable=(pt_applicable == "YES"),
        pt_amount=pt_amount,
        lwf_applicable=(lwf_applicable == "YES"),
        lwf_employee_amount=lwf_amount,
        lwf_employer_amount=0,
        status="ACTIVE"
    )

    try:
        db.add(new_record)
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Save Error: {str(e)}")

    # Pop-up nundi direct list ki vellali
    return RedirectResponse(url="/attendance/tax-master", status_code=303)

# ==================================================
# ✏️ 4. EDIT - LOAD DATA
# ==================================================
@router.get("/tax-master/edit/{record_id}", response_class=HTMLResponse)
def edit_tax_master(record_id: int, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")

    edit_data = db.query(EmployeeStatutoryMaster).filter(
        EmployeeStatutoryMaster.id == record_id,
        EmployeeStatutoryMaster.company_id == str(company_code)
    ).first()

    records = db.query(EmployeeStatutoryMaster).filter(
        EmployeeStatutoryMaster.company_id == str(company_code)
    ).order_by(EmployeeStatutoryMaster.applicable_from.desc()).all()

    return request.app.state.templates.TemplateResponse(
        "attendance/tax_master.html",
        {
            "request": request,
            "records": records,
            "edit_data": edit_data
        }
    )

# ==================================================
# 🔄 5. UPDATE EXISTING
# ==================================================
@router.post("/payroll/statutory/update/{record_id}")
def update_tax_master(
    record_id: int,
    request: Request,
    pf_applicable: str = Form(...),
    uan_number: str = Form(None),
    pf_employee_percent: float = Form(12.0),
    pf_employer_percent: float = Form(12.0),
    esi_applicable: str = Form(...),
    esi_number: str = Form(None),
    esi_employee_percent: float = Form(0.75),
    esi_employer_percent: float = Form(3.25),
    pt_applicable: str = Form(...),
    pt_amount: float = Form(0),
    lwf_applicable: str = Form(...),
    lwf_amount: float = Form(0),
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")

    record = db.query(EmployeeStatutoryMaster).filter(
        EmployeeStatutoryMaster.id == record_id,
        EmployeeStatutoryMaster.company_id == str(company_code)
    ).first()

    if record:
        try:
            record.pf_applicable = (pf_applicable == "YES")
            record.uan_number = uan_number
            record.pf_employee_percent = pf_employee_percent
            record.pf_employer_percent = pf_employer_percent
            record.esi_applicable = (esi_applicable == "YES")
            record.esi_number = esi_number
            record.esi_employee_percent = esi_employee_percent
            record.esi_employer_percent = esi_employer_percent
            record.pt_applicable = (pt_applicable == "YES")
            record.pt_amount = pt_amount
            record.lwf_applicable = (lwf_applicable == "YES")
            record.lwf_employee_amount = lwf_amount
            db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"Update Error: {str(e)}")

    return RedirectResponse(url="/attendance/tax-master", status_code=303)