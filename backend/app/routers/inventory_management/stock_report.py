# app/routers/inventory/stock_report.py

from fastapi import APIRouter, Request, Depends, Body, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, case, desc
from datetime import datetime, date
import pytz
from io import BytesIO
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill
# from weasyprint import HTML  # Ensure weasyprint is installed for PDF

from app.database import get_db
from app.database.models.inventory_management import stock_entry
from app.database.models.users import Company
from app.database.models.processing import AuditLog 
from app.database.models.criteria import (
    production_for, production_at, freezers, packing_styles,
    glazes, varieties, grades, brands, species as species_model
)

router = APIRouter(prefix="/stock_report", tags=["STOCK REPORT"])
templates = Jinja2Templates(directory="app/templates")

# Indian Timezone setup
IST = pytz.timezone('Asia/Kolkata')

# -------------------------------------------------------------------------
# 1️⃣ PAGE LOAD (With Multi-Tenant Security)
# -------------------------------------------------------------------------
@router.get("", response_class=HTMLResponse)
async def stock_report_page(
    request: Request,
    db: Session = Depends(get_db),
    from_date: str = "",
    to_date: str = ""
):
    email = request.session.get("email")
    comp_code = request.session.get("company_code")
    role = request.session.get("role")

    if not email or not comp_code:
        return RedirectResponse("/auth/login", status_code=302)

    # Base Query with strict company filter
    q = db.query(stock_entry).filter(stock_entry.company_id == comp_code)
    
    if from_date: q = q.filter(stock_entry.date >= date.fromisoformat(from_date))
    if to_date: q = q.filter(stock_entry.date <= date.fromisoformat(to_date))

    rows = q.order_by(desc(stock_entry.date), desc(stock_entry.time)).all()

    # Helper for dropdowns
    def get_list(model, attr):
        return [getattr(x, attr) for x in db.query(model).filter(model.company_id == comp_code).all()]

    # Fetching Company Branding
    company = db.query(Company).filter(Company.company_code == comp_code).first()

    return templates.TemplateResponse(
        request=request,
        name="inventory_management/stock_report.html",
        context={
            "rows": rows, "from_date": from_date, "to_date": to_date,
            "species_list": get_list(species_model, "species_name"),
            "brands_list": get_list(brands, "brand_name"),
            "production_at_list": get_list(production_at, "production_at"),
            "grades_list": get_list(grades, "grade_name"),
            "is_admin": role == "admin",
            "company_name": company.company_name if company else "BKNR ERP",
            "email": email
        }
    )

# -------------------------------------------------------------------------
# 2️⃣ SECURE EXCEL EXPORT (Professional Formatting)
# -------------------------------------------------------------------------
@router.get("/export_xlsx")
def export_xlsx(request: Request, db: Session = Depends(get_db), from_date: str = "", to_date: str = ""):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/auth/login")

    q = db.query(stock_entry).filter(stock_entry.company_id == comp_code)
    if from_date: q = q.filter(stock_entry.date >= date.fromisoformat(from_date))
    if to_date: q = q.filter(stock_entry.date <= date.fromisoformat(to_date))
    
    rows = q.order_by(stock_entry.date.asc()).all()
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Stock Ledger"
    
    headers = ["Date", "Batch #", "Type", "Brand", "Species", "Variety", "Grade", "Location", "MC", "Lse", "Qty (Kg)", "Value"]
    ws.append(headers)
    
    # Corporate Styling
    header_fill = PatternFill(start_color="1E293B", end_color="1E293B", fill_type="solid")
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")

    for r in rows:
        sign = -1 if r.cargo_movement_type == "OUT" else 1
        ws.append([
            str(r.date), r.batch_number, r.cargo_movement_type, r.brand, r.species, 
            r.variety, r.grade, r.location, sign * (r.no_of_mc or 0), sign * (r.loose or 0),
            sign * (r.quantity or 0), (r.inventory_value or 0)
        ])

    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)
    
    filename = f"Stock_Ledger_{date.today()}.xlsx"
    return StreamingResponse(
        stream, 
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# -------------------------------------------------------------------------
# 3️⃣ AUDIT LOGS (AJAX Fetch)
# -------------------------------------------------------------------------
@router.get("/audit_all")
async def get_stock_audits(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    
    # Joining with stock_entry to show Batch Number in logs
    logs = (db.query(AuditLog, stock_entry.batch_number)
            .join(stock_entry, AuditLog.record_id == stock_entry.id)
            .filter(AuditLog.table_name == "stock_entry", AuditLog.company_id == comp_code)
            .order_by(desc(AuditLog.edited_at)).limit(50).all())

    audit_data = []
    for l in logs:
        # Convert UTC to IST for display
        local_time = l.AuditLog.edited_at.replace(tzinfo=pytz.utc).astimezone(IST)
        audit_data.append({
            "timestamp": local_time.strftime("%d-%m-%Y %I:%M %p"),
            "user": l.AuditLog.edited_by.split('@')[0],
            "batch": l.batch_number,
            "field": l.AuditLog.field_name.replace('_', ' ').title(),
            "details": f"{l.AuditLog.old_value} ➔ {l.AuditLog.new_value}"
        })
    
    return JSONResponse(audit_data)