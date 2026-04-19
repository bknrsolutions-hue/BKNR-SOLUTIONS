# ============================================================
# COLD STORAGE HOLDING REPORT ROUTER – ABSOLUTE FINAL
# ============================================================

from fastapi import APIRouter, Request, Depends, Body, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse, JSONResponse
from sqlalchemy.orm import Session
from datetime import datetime, date
import pytz
from io import BytesIO
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill

from app.database import get_db
from app.database.models.inventory_management import cold_storage_holding
from app.database.models.users import Company
from app.database.models.processing import AuditLog 
from app.database.models.criteria import (
    packing_styles, varieties, grades, brands, species as species_model
)

router = APIRouter(prefix="/cold_storage_holding_report", tags=["COLD STORAGE HOLDING REPORT"])

IST = pytz.timezone('Asia/Kolkata')

def get_company_info(db: Session, comp_code: str):
    c = db.query(Company).filter(Company.company_code == comp_code).first()
    return (c.company_name or "", c.address or "") if c else ("", "")

# ------------------------------------------------------------
# 1. MAIN REPORT PAGE (GET)
# ------------------------------------------------------------
@router.get("/", response_class=HTMLResponse)
async def cold_storage_report_page(
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

    q = db.query(cold_storage_holding).filter(cold_storage_holding.company_id == comp_code)
    
    if from_date: q = q.filter(cold_storage_holding.in_date >= date.fromisoformat(from_date))
    if to_date: q = q.filter(cold_storage_holding.in_date <= date.fromisoformat(to_date))

    rows = q.order_by(cold_storage_holding.in_date.desc()).all()

    def get_list(model, attr):
        return [getattr(x, attr) for x in db.query(model).filter(model.company_id == comp_code).all()]

    context = {
        "request": request, 
        "rows": rows, 
        "from_date": from_date, 
        "to_date": to_date,
        "species_list": get_list(species_model, "species_name"),
        "brands_list": get_list(brands, "brand_name"),
        "varieties_list": get_list(varieties, "variety_name"),
        "grades_list": get_list(grades, "grade_name"),
        "packing_styles_list": get_list(packing_styles, "packing_style"),
        "is_admin": role == "admin",
        "company_name": get_company_info(db, comp_code)[0]
    }
    
    return request.app.state.templates.TemplateResponse(
        "inventory_management/cold_storage_report.html", context
    )

# ------------------------------------------------------------
# 2. UPDATE RECORD (LOGIC: INV VALUE = QTY * KG VALUE)
# ------------------------------------------------------------
@router.post("/update")
async def update_cold_storage(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    user_email = request.session.get("email")
    
    if request.session.get("role") != "admin": 
        raise HTTPException(status_code=403, detail="Admin access required")

    row = db.query(cold_storage_holding).filter(
        cold_storage_holding.id == payload.get("id"), 
        cold_storage_holding.company_id == comp_code
    ).first()
    
    if not row: raise HTTPException(status_code=404, detail="Row not found")

    # Fields that are allowed to be edited from UI
    editable_fields = [
        "cold_storage_name", "species", "variety", "grade", "brand", 
        "packing_style", "no_of_mc", "loose", "storage_rate_per_mc", 
        "status", "remarks", "product_kg_value"
    ]

    for f in editable_fields:
        if f in payload:
            old_val = str(getattr(row, f) or "").strip()
            new_val = str(payload[f] or "").strip()
            
            if old_val != new_val:
                # Log the change
                db.add(AuditLog(
                    table_name="cold_storage_holding", record_id=row.id, company_id=comp_code,
                    field_name=f, old_value=old_val, new_value=new_val,
                    edited_by=user_email, edited_at=datetime.utcnow()
                ))
                # Set the new value (handling numeric types where necessary)
                if f in ["no_of_mc", "loose", "storage_rate_per_mc", "product_kg_value"]:
                    setattr(row, f, float(payload[f] or 0))
                else:
                    setattr(row, f, payload[f])

    # --- AUTO CALCULATIONS ---
    # 1. Recalculate Qty based on Packing Master
    pack = db.query(packing_styles).filter(
        packing_styles.company_id == comp_code, 
        packing_styles.packing_style == row.packing_style
    ).first()
    
    if pack:
        row.quantity = (float(row.no_of_mc or 0) * float(pack.mc_weight or 0)) + \
                       (float(row.loose or 0) * float(pack.slab_weight or 0))
    
    # 2. IMPORTANT: Inventory Value = Quantity * KG Value
    kg_val = float(row.product_kg_value or 0)
    qty = float(row.quantity or 0)
    row.inventory_value = round(qty * kg_val, 2)

    db.commit()
    return {
        "status": "success", 
        "new_qty": row.quantity, 
        "new_inv": row.inventory_value
    }

# ------------------------------------------------------------
# 3. FETCH AUDIT HISTORY (For 3-dot menu)
# ------------------------------------------------------------
@router.get("/audit_logs/{record_id}")
async def get_row_audit(record_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    logs = db.query(AuditLog).filter(
        AuditLog.table_name == "cold_storage_holding",
        AuditLog.record_id == record_id,
        AuditLog.company_id == comp_code
    ).order_by(AuditLog.edited_at.desc()).all()
    
    return [{
        "date": l.edited_at.replace(tzinfo=pytz.utc).astimezone(IST).strftime("%d-%m-%Y %H:%M"),
        "user": l.edited_by.split('@')[0],
        "field": l.field_name.replace('_', ' ').title(),
        "change": f"{l.old_value} -> {l.new_value}"
    } for l in logs]

# ------------------------------------------------------------
# 4. DELETE ENTRY (For 3-dot menu)
# ------------------------------------------------------------
@router.post("/delete")
async def delete_entry(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if request.session.get("role") != "admin": raise HTTPException(status_code=403)
    
    row = db.query(cold_storage_holding).filter(
        cold_storage_holding.id == payload.get("id"), 
        cold_storage_holding.company_id == comp_code
    ).first()
    
    if row:
        db.add(AuditLog(
            table_name="cold_storage_holding", record_id=row.id, company_id=comp_code, 
            field_name="DELETE", old_value=row.batch_number, new_value="DELETED", 
            edited_by=request.session.get("email"), edited_at=datetime.utcnow()
        ))
        db.delete(row)
        db.commit()
        return {"status": "success"}
    
    raise HTTPException(status_code=404, detail="Entry not found")

# ------------------------------------------------------------
# 5. EXCEL EXPORT
# ------------------------------------------------------------
@router.get("/export_xlsx")
def export_xlsx(request: Request, db: Session = Depends(get_db), from_date: str = "", to_date: str = ""):
    comp_code = request.session.get("company_code")
    q = db.query(cold_storage_holding).filter(cold_storage_holding.company_id == comp_code)
    
    if from_date: q = q.filter(cold_storage_holding.in_date >= date.fromisoformat(from_date))
    if to_date: q = q.filter(cold_storage_holding.in_date <= date.fromisoformat(to_date))
    
    rows = q.order_by(cold_storage_holding.in_date.asc()).all()
    
    wb = Workbook()
    ws = wb.active
    ws.title = "CS Holding"
    headers = ["In Date", "Facility", "Batch #", "Species", "Variety", "MC", "Loose", "Qty", "KG Val", "Inv Value", "Status"]
    ws.append(headers)
    
    for r in rows:
        ws.append([
            str(r.in_date), r.cold_storage_name, r.batch_number, r.species, 
            r.variety, r.no_of_mc, r.loose, r.quantity, r.product_kg_value, 
            r.inventory_value, r.status
        ])

    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)
    return StreamingResponse(
        stream, 
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
        headers={"Content-Disposition": "attachment; filename=CS_Holding_Report.xlsx"}
    )