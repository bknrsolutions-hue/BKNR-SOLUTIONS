from app.utils.timezone import ist_now
# app/routers/attendance/employees.py

from fastapi import APIRouter, Request, Form, Depends, HTTPException, Response
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import date, datetime
from typing import Optional
import io
import pandas as pd
from xhtml2pdf import pisa

from app.database import get_db
from app.database.models.attendance import EmployeeRegistration
from app.database.models.criteria import contractors, production_at
from app.database.models.users import Company

router = APIRouter(tags=["EMPLOYEE REGISTRATION"])
templates = Jinja2Templates(directory="app/templates")

# =========================================================
# HELPER: SESSION CHECK & COMPANY DATA
# =========================================================
def get_session_context(request: Request, db: Session):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code:
        return None
    
    # Company Code base cheskuni Company details techుకుంటున్నాం
    company_info = db.query(Company).filter(Company.company_code == comp_code).first()
    return {
        "comp_code": comp_code,
        "email": email,
        "company_info": company_info
    }

# =========================================================
# 1. MAIN ROUTER (GET) - REGISTER & EDIT
# =========================================================
@router.get("/employee/register", response_class=HTMLResponse)
@router.get("/employee/edit/{emp_id}", response_class=HTMLResponse)
def employee_master_page(request: Request, emp_id: Optional[str] = None, db: Session = Depends(get_db)):
    ctx = get_session_context(request, db)
    if not ctx:
        return RedirectResponse("/auth/login", status_code=302)

    comp = ctx["comp_code"]
    
    # Dynamic Lists for Dropdowns
    contractor_list = db.query(contractors).filter(contractors.company_id == comp).all()
    site_list = db.query(production_at).filter(production_at.company_id == comp).all()
    
    # Filter Employees by Company
    all_employees = db.query(EmployeeRegistration).filter(
        EmployeeRegistration.company_id == comp
    ).order_by(EmployeeRegistration.id.desc()).all()

    # Next ID Generation logic
    last_emp = db.query(EmployeeRegistration).filter(
        EmployeeRegistration.company_id == comp
    ).order_by(EmployeeRegistration.id.desc()).first()
    next_id_val = (last_emp.id + 1) if last_emp else 1
    next_employee_id = f"{comp}{next_id_val:05d}"

    edit_row = None
    if emp_id:
        edit_row = db.query(EmployeeRegistration).filter(
            EmployeeRegistration.company_id == comp,
            EmployeeRegistration.employee_id == emp_id
        ).first()

    # ✅ FIX: TemplateResponse arguments updated for FastAPI latest
    return templates.TemplateResponse(
        request=request,
        name="attendance/employees.html", 
        context={
            "company": ctx["company_info"], 
            "contractors": contractor_list,
            "sites": site_list,
            "next_employee_id": next_employee_id,
            "employees": all_employees,
            "edit_data": edit_row,
            "email": ctx["email"],
            "message": request.session.pop("message", None)
        }
    )

# =========================================================
# 2. SAVE & UPDATE LOGIC (POST)
# =========================================================
@router.post("/employee/save")
@router.post("/employee/update/{db_id}")
async def save_or_update_employee(
    request: Request,
    db_id: Optional[int] = None,
    employee_id: str = Form(...),
    employee_name: str = Form(...),
    designation: Optional[str] = Form(None),
    department: Optional[str] = Form(None),
    employee_type: Optional[str] = Form(None),
    contractor_name: Optional[str] = Form(None),
    joining_date: Optional[str] = Form(None),
    resignation_date: Optional[str] = Form(None),
    current_salary: float = Form(0.0),
    basic_salary: float = Form(0.0),
    hra: float = Form(0.0),
    conveyance_allowance: float = Form(0.0),
    other_expenses: float = Form(0.0),
    tds: float = Form(0.0),
    bank_name: Optional[str] = Form(None),
    account_number: Optional[str] = Form(None),
    ifsc_code: Optional[str] = Form(None),
    branch_name: Optional[str] = Form(None),
    account_holder_name: Optional[str] = Form(None),
    pan_number: Optional[str] = Form(None),
    aadhar_number: Optional[str] = Form(None),
    uan_number: Optional[str] = Form(None),
    mobile: Optional[str] = Form(None),
    status: str = Form("ACTIVE"),
    gender: Optional[str] = Form(None),
    personal_email: Optional[str] = Form(None),
    dob: Optional[str] = Form(None),
    blood_group: Optional[str] = Form(None),
    marital_status: Optional[str] = Form(None),
    emergency_name: Optional[str] = Form(None),
    emergency_mobile: Optional[str] = Form(None),
    official_email: Optional[str] = Form(None),
    about: Optional[str] = Form(None),
    skills: Optional[str] = Form(None),
    present_address: Optional[str] = Form(None),
    permanent_address: Optional[str] = Form(None),
    reporting_to: Optional[str] = Form(None),
    location: Optional[str] = Form(None),
    db: Session = Depends(get_db)
):
    ctx = get_session_context(request, db)
    if not ctx: 
        return RedirectResponse("/auth/login", status_code=302)
    
    comp = ctx["comp_code"]

    def parse_dt(d): 
        return date.fromisoformat(d) if d and d.strip() else None

    if db_id:
        row = db.query(EmployeeRegistration).filter(
            EmployeeRegistration.id == db_id, 
            EmployeeRegistration.company_id == comp
        ).first()
        msg = "Updated"
    else:
        # Fresh Registration
        row = EmployeeRegistration(company_id=comp, employee_id=employee_id)
        db.add(row)
        msg = "Saved"

    if not row:
        request.session["message"] = "❌ Record not found!"
        return RedirectResponse("/attendance/employee/register", status_code=303)

    try:
        row.employee_name = employee_name
        row.designation = designation
        row.department = department
        row.employee_type = employee_type
        row.contractor_name = contractor_name if employee_type == "CONTRACT" else None
        row.joining_date = parse_dt(joining_date)
        row.resignation_date = parse_dt(resignation_date)
        row.current_salary = current_salary
        row.basic_salary = basic_salary
        row.hra = hra
        row.conveyance_allowance = conveyance_allowance
        row.other_expenses = other_expenses
        row.tds = tds
        row.bank_name = bank_name
        row.account_number = account_number
        row.ifsc_code = ifsc_code
        row.branch_name = branch_name
        row.account_holder_name = account_holder_name
        row.pan_number = pan_number
        row.aadhar_number = aadhar_number
        row.uan_number = uan_number
        row.mobile = mobile
        row.email = ctx["email"] 
        row.status = status
        row.gender = gender
        row.personal_email = personal_email
        row.dob = parse_dt(dob)
        row.blood_group = blood_group
        row.marital_status = marital_status
        row.emergency_name = emergency_name
        row.emergency_mobile = emergency_mobile
        row.official_email = official_email
        row.about = about
        row.skills = skills
        row.present_address = present_address
        row.permanent_address = permanent_address
        row.reporting_to = reporting_to
        row.location = location
        row.date = date.today()
        row.time = ist_now().time()

        db.commit()
        request.session["message"] = f"✅ Employee {msg} Successfully!"
    except Exception as e:
        db.rollback()
        request.session["message"] = f"❌ Error: {str(e)}"

    return RedirectResponse("/attendance/employee/register", status_code=303)

# =========================================================
# 3. DELETE (POST)
# =========================================================
@router.post("/employee/delete/{db_id}")
def delete_employee(db_id: int, request: Request, db: Session = Depends(get_db)):
    comp = request.session.get("company_code")
    if not comp:
        return JSONResponse({"status": "error", "message": "Unauthorized"}, status_code=401)

    row = db.query(EmployeeRegistration).filter(
        EmployeeRegistration.id == db_id, 
        EmployeeRegistration.company_id == comp
    ).first()
    
    if row:
        db.delete(row)
        db.commit()
        return JSONResponse({"status": "ok"})
    return JSONResponse({"status": "error", "message": "Record not found"}, status_code=404)

# =========================================================
# 4. PRINT VIEW & PDF EXPORT
# =========================================================
@router.get("/employee/print/{emp_id}")
@router.get("/employee/export/pdf/{emp_id}")
def export_employee_details(emp_id: str, request: Request, db: Session = Depends(get_db)):
    ctx = get_session_context(request, db)
    if not ctx: 
        return HTMLResponse(content="Session Expired", status_code=401)
    
    emp = db.query(EmployeeRegistration).filter(
        EmployeeRegistration.employee_id == emp_id, 
        EmployeeRegistration.company_id == ctx["comp_code"]
    ).first()
    
    if not emp: 
        return HTMLResponse(content="Employee Not Found", status_code=404)
    
    context = {
        "request": request, 
        "e": emp, 
        "company": ctx["company_info"],
        "printed_on": ist_now().strftime("%d-%m-%Y %H:%M")
    }
    
    # PDF vs HTML Print logic
    if "pdf" in request.url.path:
        html_content = templates.get_template("attendance/print_employee.html").render(context)
        pdf_output = io.BytesIO()
        pisa.CreatePDF(io.StringIO(html_content), dest=pdf_output)
        return Response(
            pdf_output.getvalue(), 
            media_type="application/pdf", 
            headers={"Content-Disposition": f"attachment; filename={emp_id}_Profile.pdf"}
        )

    return templates.TemplateResponse(
        request=request,
        name="attendance/print_employee.html", 
        context=context
    )

# =========================================================
# 5. EXCEL EXPORT
# =========================================================
@router.get("/employee/export/excel")
def export_employees_excel(request: Request, db: Session = Depends(get_db)):
    comp = request.session.get("company_code")
    if not comp:
        return RedirectResponse("/auth/login")

    data = db.query(EmployeeRegistration).filter(EmployeeRegistration.company_id == comp).all()
    
    df_data = []
    for e in data:
        df_data.append({
            "Emp ID": e.employee_id, 
            "Name": e.employee_name, 
            "Designation": e.designation,
            "Department": e.department,
            "Mobile": e.mobile, 
            "Gross Salary": e.current_salary,
            "Bank": e.bank_name, 
            "A/C No": e.account_number, 
            "Status": e.status
        })
    
    df = pd.DataFrame(df_data)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='EmployeeMaster')
    
    output.seek(0)
    return StreamingResponse(
        output, 
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=Master_{comp}.xlsx"}
    )