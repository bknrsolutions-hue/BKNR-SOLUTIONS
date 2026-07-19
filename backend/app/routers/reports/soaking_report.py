# ============================================================
# SOAKING REPORT ROUTER (BKNR ERP - UPDATED WITH FY)
# ============================================================

from fastapi import APIRouter, Request, Depends, Body, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import desc, extract
from datetime import date, datetime
import datetime as dt
from app.utils.timezone import ist_now
from app.services.floor_balance_sync import refresh_floor_balance
from app.utils.global_filters import get_global_filters

from io import BytesIO
from openpyxl import Workbook
from openpyxl.styles import Font

from app.database import get_db
from app.database.models.processing import Soaking, AuditLog 

router = APIRouter(
    prefix="/soaking_report",
    tags=["SOAKING REPORT"]
)

templates = Jinja2Templates(directory="app/templates")

def row_to_dict(row):
    return {col.name: getattr(row, col.name) for col in row.__table__.columns}


# ------------------------------------------------------------
# 1. MAIN REPORT VIEW (WITH FY FILTER & UNIVERSAL FILTERS)
# ------------------------------------------------------------
@router.get("", response_class=HTMLResponse)
async def soaking_main_report(
    request: Request,
    fy: str = Query(None),
    db: Session = Depends(get_db)
):
    production_for, location = get_global_filters(request)
    company_id = request.session.get("company_code")
    role = request.session.get("role")
    if not company_id:
        return RedirectResponse("/auth/login", status_code=302)
    is_json = request.query_params.get("format") == "json"
    if fy is None:
        today = ist_now().date()
        fy = "" if is_json else str(today.year if today.month >= 4 else today.year - 1)

    # Fetch unique financial years from database
    all_dates = db.query(Soaking.date).filter(Soaking.company_id == company_id, Soaking.date != None).all()
    fy_set = set()
    for d_tuple in all_dates:
        d = d_tuple[0]
        fy_set.add(f"{d.year}" if d.month >= 4 else f"{d.year - 1}")
    financial_years = sorted(list(fy_set), reverse=True)

    query = db.query(Soaking).filter(
        Soaking.company_id == company_id
    )

    if fy:
        start_year = int(fy)
        end_year = start_year + 1
        query = query.filter(
            Soaking.date >= f"{start_year}-04-01",
            Soaking.date <= f"{end_year}-03-31"
        )

    if production_for:
        query = query.filter(Soaking.production_for == production_for)

    if location:
        query = query.filter(Soaking.production_at == location)

    rows = query.order_by(desc(Soaking.date), desc(Soaking.id)).all()

    # Searchable dropdowns logic based on filtered rows
    varieties = sorted(list({r.variety_name for r in rows if r.variety_name}))
    locations = sorted(list({r.production_at for r in rows if r.production_at}))
    batches = sorted(list({r.batch_number for r in rows if r.batch_number}))

    serialized_rows = []
    for r in rows:
        d = row_to_dict(r)
        if isinstance(d.get("date"), (date, datetime)):
            d["date"] = d["date"].isoformat()
        if isinstance(d.get("time"), (dt.time, datetime)):
            d["time"] = d["time"].strftime("%H:%M")
        serialized_rows.append(d)

    from app.utils.report_permissions import check_report_permission
    context = {
        "rows": serialized_rows if is_json else rows,
        "selected_fy": fy,
        "financial_years": financial_years,
        "selected_production_for": production_for,
        "selected_location": location,
        "varieties": varieties,
        "locations": locations,
        "batches": batches,
        "is_admin": role == "admin",
        "can_edit": check_report_permission(request, "report_edit"),
        "can_delete": check_report_permission(request, "report_delete"),
        "can_print": check_report_permission(request, "report_print"),
        "can_export": check_report_permission(request, "report_export"),
        "datetime": datetime 
    }

    if is_json:
        from fastapi.responses import JSONResponse
        context.pop("datetime", None)
        import datetime as dt_mod
        def serialize_val(v):
            if isinstance(v, (dt_mod.datetime, dt_mod.date)):
                return v.isoformat()
            if isinstance(v, dt_mod.time):
                return v.strftime("%H:%M")
            if isinstance(v, list):
                return [serialize_val(item) for item in v]
            if isinstance(v, dict):
                return {key: serialize_val(val) for key, val in v.items()}
            return v
        return JSONResponse(serialize_val(context))

    return templates.TemplateResponse(
        request=request,
        name="reports/soaking_report.html",
        context=context
    )

# ------------------------------------------------------------
# 2. UPDATE LOGIC (WITH AUTO-CALCS & AUDIT) - TRANSACTIONAL
# ------------------------------------------------------------
@router.post("/update")
async def update_soaking_row(
    request: Request, 
    payload: dict = Body(...), 
    db: Session = Depends(get_db)
):
    company_id = str(request.session.get("company_code"))
    edited_by = request.session.get("email")

    from app.utils.report_permissions import enforce_report_permission
    enforce_report_permission(request, "report_edit")

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

    has_changes = False
    for field in update_fields:
        if field in payload:
            old_val = str(getattr(row, field) or "")
            new_val = str(payload[field])

            if old_val != new_val:
                db.add(AuditLog(
                    table_name="soaking",
                    record_id=row.id,
                    company_id=company_id,
                    field_name=field,
                    old_value=old_val,
                    new_value=new_val,
                    edited_by=edited_by,
                    edited_at=datetime.utcnow()
                ))
                
                if field in ["in_qty", "chemical_percent", "salt_percent", "rejection_qty"]:
                    try:
                        setattr(row, field, float(payload[field] or 0))
                    except ValueError:
                        setattr(row, field, 0.0)
                else:
                    setattr(row, field, payload[field])
                has_changes = True

    if has_changes:
        qty = float(row.in_qty or 0)
        c_per = float(row.chemical_percent or 0)
        s_per = float(row.salt_percent or 0)
        
        row.chemical_qty = round((qty * c_per) / 100, 2)
        row.salt_qty = round((qty * s_per) / 100, 2)

        try:
            db.commit()
            refresh_floor_balance(db, company_id)
            return {"status": "success", "chemical_qty": row.chemical_qty, "salt_qty": row.salt_qty}
        except Exception as e:
            db.rollback()
            raise HTTPException(status_code=500, detail=str(e))

    return {"status": "no_changes"}

# ============================================================
# 3. AUDIT HISTORY & TRANSACTION DELETION
# ============================================================
@router.get("/audit_all")
async def get_all_soaking_audit(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    logs = (
        db.query(AuditLog, Soaking.batch_number)
        .join(Soaking, AuditLog.record_id == Soaking.id)
        .filter(AuditLog.table_name == "soaking", AuditLog.company_id == comp_code)
        .order_by(AuditLog.edited_at.desc()).limit(100).all()
    )
    return [{
        "record_id": l.AuditLog.record_id,
        "timestamp": l.AuditLog.edited_at.strftime("%d-%m-%Y %H:%M:%S"),
        "user": l.AuditLog.edited_by.split('@')[0] if l.AuditLog.edited_by else "System",
        "email": l.AuditLog.edited_by if l.AuditLog.edited_by else "System",
        "batch": f"Row ID #{l.AuditLog.record_id} • Batch: {l.batch_number}" if l.batch_number else f"Row ID #{l.AuditLog.record_id}",
        "action": f"Changed {l.AuditLog.field_name.replace('_', ' ').title()}" if l.AuditLog.field_name != "DELETE" else "Deleted Record",
        "details": f"{l.AuditLog.old_value} ➔ {l.AuditLog.new_value}"
    } for l in logs]

# ------------------------------------------------------------
# 4. EXPORT EXCEL (WITH UNIVERSAL FILTERS LAYER)
# ------------------------------------------------------------
@router.get("/export_excel")
def soaking_export_excel(request: Request, ids: str = Query(None), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    from app.utils.report_permissions import enforce_report_permission
    enforce_report_permission(request, "report_export")
    
    # 🟢 Force evaluate global contextual filter arrays inside Excel Compiler
    production_for, location = get_global_filters(request)
    
    query = db.query(Soaking).filter(
        Soaking.company_id == company_id
    )
    
    if production_for:
        query = query.filter(Soaking.production_for == production_for)

    if location:
        query = query.filter(Soaking.production_at == location)
    
    if ids and ids.strip():
        id_list = [int(x) for x in ids.split(",") if x.strip().isdigit()]
        query = query.filter(Soaking.id.in_(id_list))
    
    rows = query.order_by(Soaking.date.asc()).all()
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Soaking Report"
    
    headers = [
        "Date", "Sintex No", "Batch", "Variety", "In Qty", "Rej Qty", 
        "Chem Name", "Chem %", "Chem Kg", "Salt %", "Salt Kg", "Status", "At"
    ]
    ws.append(headers)
    for cell in ws[1]: cell.font = Font(bold=True)
    
    for r in rows:
        ws.append([
            str(r.date), r.sintex_number, r.batch_number, r.variety_name, 
            r.in_qty, r.rejection_qty, r.chemical_name, r.chemical_percent,
            r.chemical_qty, r.salt_percent, r.salt_qty, r.status, r.production_at
        ])
    
    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)
    return StreamingResponse(
        stream, 
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
        headers={"Content-Disposition": f"attachment; filename=Soaking_Report_{ist_now().date()}.xlsx"}
    )

# ------------------------------------------------------------
# 5. DELETE ACTION
# ------------------------------------------------------------
@router.post("/delete")
async def delete_soaking_row(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    from app.utils.report_permissions import enforce_report_permission
    enforce_report_permission(request, "report_delete")
        
    row = db.query(Soaking).filter(
        Soaking.id == payload.get("id"), 
        Soaking.company_id == company_id
    ).first()
    
    if row:
        row.is_cancelled = True
        db.commit()
        refresh_floor_balance(db, company_id)
        return {"status": "success"}
        
    return {"status": "error", "message": "Record not found"}
