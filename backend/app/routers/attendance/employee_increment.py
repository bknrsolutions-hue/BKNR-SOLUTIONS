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
# 🧮 UTILITY FUNCTION: SALARY BREAK-UP AUTOMATION
# ==================================================
def calculate_and_apply_salary_breakup(emp: EmployeeRegistration, gross_salary: float):
    """
    కొత్త Gross Salary ఆధారంగా అన్ని శాలరీ కంపోనెంట్స్ ని 
    ఆటోమేటిక్‌గా క్యాలిక్యులేట్ చేసి మోడల్‌కి అసైన్ చేసే యుటిలిటీ ఫంక్షన్.
    """
    emp.current_salary = float(gross_salary)
    emp.basic_salary = round(gross_salary * 0.50, 2)              # 50% Basic Salary
    emp.hra = round(gross_salary * 0.20, 2)                       # 20% HRA
    emp.conveyance_allowance = round(gross_salary * 0.15, 2)      # 15% Conveyance
    emp.other_expenses = round(gross_salary * 0.15, 2)            # 15% Other Expenses


# ==================================================
# 1️⃣ 📄 INCREMENT PAGE
# ==================================================
@router.get("/employee-increment", response_class=HTMLResponse)
def increment_page(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=303)

    error_param = request.query_params.get("error")
    success_param = request.query_params.get("success")
    system_message = None
    
    if error_param == "employee_not_found":
        system_message = "❌ Active Employee Number Not Found in Database!"
    elif error_param == "record_not_found":
        system_message = "❌ Transaction Record Not Found!"
    elif success_param == "1":
        system_message = "✅ Salary Increment Logged & Applied Successfully!"
    elif success_param == "deleted":
        system_message = "🗑️ Increment Transaction Rolled Back & Purged!"

    increment_records = db.query(EmployeeIncrement).filter(
        EmployeeIncrement.company_id == company_code
    ).order_by(EmployeeIncrement.id.desc()).all()

    return templates.TemplateResponse(
        request=request,
        name="attendance/employee_increments.html",
        context={
            "email": email,
            "company_id": company_code,
            "message": system_message,
            "records": increment_records
        }
    )


# ==================================================
# 2️⃣ 💾 SAVE NEW INCREMENT (POST VOUCHER)
# ==================================================
@router.post("/employee-increment")
def save_increment(
    request: Request,
    employee_id: str = Form(...),
    increment_type: str = Form(...),   
    increment_value: float = Form(...),
    effective_from: date = Form(...),
    reason: str = Form(None),          
    approved_by: str = Form(None),     
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    session_user = request.session.get("email")

    if not company_id or not session_user:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    emp = db.query(EmployeeRegistration).filter(
        EmployeeRegistration.employee_id == employee_id,
        EmployeeRegistration.company_id == company_id,
        EmployeeRegistration.status == "ACTIVE"
    ).first()

    if not emp:
        return RedirectResponse("/attendance/employee-increment?error=employee_not_found", status_code=303)

    old_salary = float(emp.current_salary or 0)

    if increment_type == "FIXED":
        new_salary = old_salary + increment_value
    else:  
        new_salary = old_salary + (old_salary * increment_value / 100)

    final_approver = approved_by if approved_by and approved_by.strip() else session_user

    new_inc_record = EmployeeIncrement(
        employee_id=employee_id,
        old_salary=old_salary,
        increment_type=increment_type,
        increment_value=increment_value,
        new_salary=new_salary,
        effective_from=effective_from,
        reason=reason,                 
        approved_by=final_approver,     
        status="ACTIVE",
        company_id=company_id
    )
    db.add(new_inc_record)

    # 🔥 ఎఫెక్టివ్ డేట్ ఈరోజు లేదా అంతకంటే ముందైతే బ్రేక్-అప్స్ అప్లై చేయడం
    if effective_from <= date.today():
        calculate_and_apply_salary_breakup(emp, new_salary)

    db.commit()
    return RedirectResponse("/attendance/employee-increment?success=1", status_code=303)


# ==================================================
# 3️⃣ ✏️ EDIT FETCH CONTEXT API
# ==================================================
@router.get("/employee-increment/edit/{record_id}")
def get_increment_for_edit(request: Request, record_id: int, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    record = db.query(EmployeeIncrement).filter(
        EmployeeIncrement.id == record_id,
        EmployeeIncrement.company_id == company_id
    ).first()

    if not record:
        return JSONResponse({"error": "Record not found"}, status_code=404)

    return {
        "id": record.id,
        "employee_id": record.employee_id,
        "increment_type": record.increment_type,
        "increment_value": record.increment_value,
        "effective_from": record.effective_from.isoformat() if record.effective_from else "",
        "reason": record.reason,
        "approved_by": record.approved_by
    }


# ==================================================
# 4️⃣ 💾 SAVE UPDATED MODIFICATION (WITH FIXED NameError & BREAK-UP)
# ==================================================
@router.post("/employee-increment/save-update/{record_id}")
def save_update_increment(
    request: Request,
    record_id: int,
    employee_id: str = Form(...),
    increment_type: str = Form(...),
    increment_value: float = Form(...),
    effective_from: date = Form(...),
    reason: str = Form(None),
    approved_by: str = Form(None),
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    if not company_id:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    # 🛠️ FIX: 'Company_id' టైపోని 'EmployeeIncrement.company_id' గా మార్చడం జరిగింది
    record = db.query(EmployeeIncrement).filter(
        EmployeeIncrement.id == record_id,
        EmployeeIncrement.company_id == company_id
    ).first()

    if not record:
        return RedirectResponse("/attendance/employee-increment?error=record_not_found", status_code=303)

    emp = db.query(EmployeeRegistration).filter(
        EmployeeRegistration.employee_id == employee_id,
        EmployeeRegistration.company_id == company_id
    ).first()

    # ఎడిట్ చేసేటప్పుడు పాత రికార్డును రోల్‌బ్యాక్ చేయడానికి బేస్ గ్రాస్ తెచ్చాం
    if emp and record.effective_from <= date.today():
        calculate_and_apply_salary_breakup(emp, record.old_salary)

    record.increment_type = increment_type
    record.increment_value = increment_value
    record.effective_from = effective_from
    record.reason = reason
    record.approved_by = approved_by if approved_by else request.session.get("email")

    if increment_type == "FIXED":
        record.new_salary = record.old_salary + increment_value
    else:
        record.new_salary = record.old_salary + (record.old_salary * increment_value / 100)

    # కొత్త మార్పులను శాలరీ బ్రేక్-అప్ కాలమ్స్ కి సింక్ చేయడం
    if effective_from <= date.today() and emp:
        calculate_and_apply_salary_breakup(emp, record.new_salary)

    db.commit()
    return RedirectResponse("/attendance/employee-increment?success=1", status_code=303)


# ==================================================
# 5️⃣ 🖨️ PRINT VIEW
# ==================================================
@router.get("/employee-increment/print/{record_id}", response_class=HTMLResponse)
def print_increment_voucher(request: Request, record_id: int, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/", status_code=303)

    record = db.query(EmployeeIncrement).filter(
        EmployeeIncrement.id == record_id,
        EmployeeIncrement.company_id == company_id
    ).first()

    if not record:
        return RedirectResponse("/attendance/employee-increment?error=record_not_found", status_code=303)

    return f"""
    <html>
    <head>
        <title>Increment Voucher #{record.id}</title>
        <style>
            body {{ font-family: sans-serif; padding: 40px; color: #333; }}
            .voucher {{ border: 2px solid #333; padding: 20px; max-width: 600px; margin: 0 auto; }}
            .title {{ text-align: center; font-size: 20px; font-weight: bold; color: #143465; border-bottom: 2px solid #143465; padding-bottom: 10px; }}
            table {{ width: 100%; margin-top: 20px; border-collapse: collapse; }}
            td {{ padding: 10px; border-bottom: 1px solid #ddd; font-size: 14px; }}
            .bold {{ font-weight: bold; }}
        </style>
    <link rel="stylesheet" href="/static/css/global-loader.css">
</head>
    <body onload="window.print()">
        <div class="voucher">
            <div class="title">BKNR ERP - SALARY INCREMENT VOUCHER</div>
            <table>
                <tr><td class="bold">Voucher ID:</td><td>INC-{record.id}</td></tr>
                <tr><td class="bold">Employee ID:</td><td>{record.employee_id}</td></tr>
                <tr><td class="bold">Increment Type:</td><td>{record.increment_type}</td></tr>
                <tr><td class="bold">Value Assigned:</td><td>{record.increment_value}</td></tr>
                <tr><td class="bold">Old Gross Salary:</td><td>₹{record.old_salary:,.2f}</td></tr>
                <tr><td class="bold">New Gross Salary:</td><td>₹{record.new_salary:,.2f}</td></tr>
                <tr><td class="bold">Effective From:</td><td>{record.effective_from}</td></tr>
                <tr><td class="bold">Remarks:</td><td>{record.reason or '-'}</td></tr>
                <tr><td class="bold">Approved By:</td><td>{record.approved_by}</td></tr>
            </table>
        </div>
    <script src="/static/js/global-loader.js"></script>
</body>
    </html>
    """


# ==================================================
# 6️⃣ 🗑️ DELETE & ROLLBACK TRANSACTION
# ==================================================
@router.post("/employee-increment/delete/{record_id}")
def delete_increment(request: Request, record_id: int, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        return JSONResponse({"status": "error", "message": "Unauthorized"}, status_code=401)

    record = db.query(EmployeeIncrement).filter(
        EmployeeIncrement.id == record_id,
        EmployeeIncrement.company_id == company_id
    ).first()

    if not record:
        return JSONResponse({"status": "error", "message": "Record not found"}, status_code=404)

    emp = db.query(EmployeeRegistration).filter(
        EmployeeRegistration.employee_id == record.employee_id,
        EmployeeRegistration.company_id == company_id
    ).first()

    # ట్రాన్సాక్షన్ డిలీట్ చేస్తే పాత శాలరీ అలవెన్స్ బ్రేక్-అప్స్ రీ-అప్లై అవుతాయి
    if emp and record.effective_from <= date.today():
        calculate_and_apply_salary_breakup(emp, record.old_salary)

    db.delete(record)
    db.commit()

    return JSONResponse({"status": "ok", "message": "Purged successfully"})