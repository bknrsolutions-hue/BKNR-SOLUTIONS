from fastapi import APIRouter, Request, Depends, Body, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from io import BytesIO

from openpyxl import Workbook
# Weasyprint removed if not used to keep it clean, but you can keep it if needed for PDF

from app.database import get_db
# Models ni mee project structure batti import cheskondi
from app.database.models.processing import Soaking, AuditLog 

router = APIRouter(
    prefix="/soaking_report",
    tags=["SOAKING REPORT"]
)

templates = Jinja2Templates(directory="app/templates")

# ============================================================
# 1. MAIN REPORT VIEW
# ============================================================
@router.get("", response_class=HTMLResponse)
async def soaking_main_report(
    request: Request,
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    role = request.session.get("role")
    if not company_id:
        return RedirectResponse("/", status_code=302)

    # Fetching only company specific data
    rows = (
        db.query(Soaking)
        .filter(Soaking.company_id == company_id)
        .order_by(Soaking.date.desc())
        .all()
    )

    # Searchable dropdowns list build cheyali
    varieties = sorted(list({r.variety_name for r in rows if r.variety_name}))
    locations = sorted(list({r.production_at for r in rows if r.production_at}))

    return templates.TemplateResponse(
        "reports/soaking_report.html",
        {
            "request": request,
            "rows": rows,
            "varieties": varieties,
            "locations": locations,
            "is_admin": role == "admin"
        }
    )

# ============================================================
# 2. UPDATE LOGIC (WITH AUTOMATED CALCS & AUDIT)
# ============================================================
@router.post("/update")
async def update_soaking_row(
    request: Request, 
    payload: dict = Body(...), 
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    role = request.session.get("role")
    edited_by = request.session.get("email")

    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    row = db.query(Soaking).filter(
        Soaking.id == payload.get("id"), 
        Soaking.company_id == company_id
    ).first()
    
    if not row:
        raise HTTPException(status_code=404, detail="Record not found")

    update_fields = [
        "sintex_number", "batch_number", "variety_name", "in_qty", "rejection_qty", "rejection_for",
        "chemical_name", "chemical_percent", "salt_percent", 
        "production_at", "status", "production_for"
    ]

    for field in update_fields:
        if field in payload:
            old_val = getattr(row, field)
            new_val = payload[field]

            # Numeric handling for calculations
            if field in ["in_qty", "chemical_percent", "salt_percent"]:
                try:
                    new_val = float(new_val or 0)
                except ValueError:
                    new_val = 0.0

            if str(old_val) != str(new_val):
                # Save Audit Log - FIXED TABLE NAME TO 'soaking'
                db.add(AuditLog(
                    table_name="soaking",
                    record_id=row.id,
                    company_id=company_id,
                    field_name=field,
                    old_value=str(old_val),
                    new_value=str(new_val),
                    edited_by=edited_by,
                    edited_at=datetime.utcnow()
                ))
                setattr(row, field, new_val)

    # Automated Chemical & Salt Kg Calculations
    # Formula: (In Qty * Percent) / 100
    qty = float(row.in_qty or 0)
    c_per = float(row.chemical_percent or 0)
    s_per = float(row.salt_percent or 0)
    
    row.chemical_qty = round((qty * c_per) / 100, 2)
    row.salt_qty = round((qty * s_per) / 100, 2)

    db.commit()
    return {"status": "success", "message": "Soaking record updated"}

# ============================================================
# 3. FETCH FULL AUDIT HISTORY (Company Wise)
# ============================================================
@router.get("/audit_all")
async def get_all_soaking_audit(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    
    # Joining with Soaking table to get the batch number for the log
    logs = (
        db.query(AuditLog, Soaking.batch_number)
        .join(Soaking, AuditLog.record_id == Soaking.id)
        .filter(
            AuditLog.table_name == "soaking", # Matches the update logic name
            AuditLog.company_id == comp_code
        )
        .order_by(AuditLog.edited_at.desc())
        .limit(100)
        .all()
    )
    
    return [
        {
            "timestamp": log.AuditLog.edited_at.strftime("%d-%m-%Y %H:%M:%S"),
            "user": log.AuditLog.edited_by.split('@')[0] if log.AuditLog.edited_by else "System",
            "batch": log.batch_number,
            "action": f"Changed {log.AuditLog.field_name.replace('_', ' ').title()}",
            "details": f"{log.AuditLog.old_value} ➔ {log.AuditLog.new_value}",
            "type": "UPDATE"
        } for log in logs
    ]

# ============================================================
# 4. EXPORT EXCEL (Filtered Data)
# ============================================================
@router.get("/export_excel")
def soaking_export_excel(request: Request, ids: str = Query(None), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    query = db.query(Soaking).filter(Soaking.company_id == company_id)
    
    if ids and ids.strip():
        id_list = [int(x) for x in ids.split(",") if x.strip()]
        query = query.filter(Soaking.id.in_(id_list))
    
    rows = query.order_by(Soaking.date.asc()).all()
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Soaking Report"
    ws.append(["Date", "Sintex No", "Batch", "Variety", "In Qty", "Rejection Qty", "Rejection For", "Chem Name", "Chem Kg", "Salt Kg", "Status", "At"])
    
    for r in rows:
        ws.append([
            str(r.date), r.sintex_number, r.batch_number, r.variety_name, 
            r.in_qty, r.rejection_qty, r.rejection_for, r.chemical_name, r.chemical_qty, r.salt_qty, r.status, r.production_at
        ])
    
    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)
    return StreamingResponse(
        stream, 
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
        headers={"Content-Disposition": "attachment; filename=Soaking_Report.xlsx"}
    )

# ============================================================
# 5. DELETE ACTION
# ============================================================
@router.post("/delete")
async def delete_soaking_row(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    row_id = payload.get("id")
    
    row = db.query(Soaking).filter(
        Soaking.id == row_id, 
        Soaking.company_id == company_id
    ).first()
    
    if row:
        db.delete(row)
        db.commit()
        return {"status": "success"}
    return {"status": "error", "message": "Not found"}