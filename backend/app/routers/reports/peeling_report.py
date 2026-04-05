# ============================================================
# PEELING REPORT ROUTER (BKNR ERP) - FULLY UPDATED
# ============================================================

from fastapi import APIRouter, Request, Depends, Body, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
import datetime as dt
from datetime import datetime
import json
from io import BytesIO
from openpyxl import Workbook

from app.database import get_db
from app.database.models.processing import Peeling, AuditLog

router = APIRouter(
    prefix="/peeling_report",
    tags=["PEELING REPORT"]
)

templates = Jinja2Templates(directory="app/templates")

# ------------------------------------------------------------
# 1. MAIN REPORT PAGE
# ------------------------------------------------------------
@router.get("", response_class=HTMLResponse)
async def peeling_report(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    role = request.session.get("role")

    if not comp_code:
        return RedirectResponse("/", status_code=302)

    rows = (
        db.query(Peeling)
        .filter(Peeling.company_id == comp_code)
        .order_by(Peeling.date.desc(), Peeling.time.desc())
        .all()
    )

    # Unique filter options for dropdowns
    batches = sorted({r.batch_number for r in rows if r.batch_number})
    contractors = sorted({r.contractor_name for r in rows if r.contractor_name})
    varieties = sorted({r.variety_name for r in rows if r.variety_name})
    locations = sorted({r.peeling_at for r in rows if r.peeling_at})
    production_for_list = sorted({r.production_for for r in rows if r.production_for})

    # ✅ FIXED TemplateResponse: Latest FastAPI format
    return templates.TemplateResponse(
        request=request,
        name="reports/peeling_report.html",
        context={
            "rows": rows,
            "batches": batches,
            "contractors": contractors,
            "varieties": varieties,
            "locations": locations,
            "production_for_list": production_for_list,
            "is_admin": role == "admin"
        }
    )

# ------------------------------------------------------------
# 2. INLINE UPDATE WITH AUDIT LOGGING
# ------------------------------------------------------------
@router.post("/update")
async def update_peeling(
    request: Request, 
    payload: dict = Body(...), 
    db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")
    user_email = request.session.get("email")
    
    if request.session.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")

    record_id = payload.get("id")
    row = db.query(Peeling).filter(Peeling.id == record_id, Peeling.company_id == comp_code).first()
    
    if not row:
        raise HTTPException(status_code=404, detail="Record not found")

    # Fields to monitor for Audit Logs
    updatable_fields = [
        "batch_number", "contractor_name", "variety_name", "hlso_count",
        "hlso_qty", "peeled_qty", "rate", "peeling_at", "production_for"
    ]

    for field in updatable_fields:
        if field in payload:
            new_val = str(payload[field]).strip()
            old_val = str(getattr(row, field) or "").strip()

            if old_val != new_val:
                # Add Audit Entry
                audit = AuditLog(
                    table_name="peeling",
                    record_id=record_id,
                    company_id=comp_code,
                    field_name=field,
                    old_value=old_val,
                    new_value=new_val,
                    edited_by=user_email,
                    edited_at=dt.datetime.utcnow() # Using dt for clarity
                )
                db.add(audit)
                setattr(row, field, payload[field])

    # Recalculate Logic
    try:
        h_qty = float(row.hlso_qty or 0)
        p_qty = float(row.peeled_qty or 0)
        rt = float(row.rate or 0)

        row.yield_percent = round((p_qty / h_qty * 100), 2) if h_qty > 0 else 0
        row.amount = round(p_qty * rt, 2)
    except Exception as e:
        print(f"Recalculation Error: {row.batch_number}: {e}")

    db.commit()
    return {"status": "success", "message": "Record updated & Audit Log saved"}

# ------------------------------------------------------------
# 3. FETCH FULL AUDIT HISTORY (Company Wise)
# ------------------------------------------------------------
@router.get("/audit_all")
async def get_all_peeling_audit(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    
    logs = (
        db.query(AuditLog, Peeling.batch_number)
        .join(Peeling, AuditLog.record_id == Peeling.id)
        .filter(AuditLog.table_name == "peeling", AuditLog.company_id == comp_code)
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

# ------------------------------------------------------------
# 4. DELETE RECORD
# ------------------------------------------------------------
@router.post("/delete")
async def delete_peeling(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    user_email = request.session.get("email")
    
    if request.session.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized")

    row = db.query(Peeling).filter(Peeling.id == payload.get("id"), Peeling.company_id == comp_code).first()
    if row:
        # Audit Delete Action
        db.add(AuditLog(
            table_name="peeling", record_id=row.id, company_id=comp_code,
            field_name="DELETE", old_value="Record", new_value="Deleted",
            edited_by=user_email, edited_at=dt.datetime.utcnow()
        ))
        db.delete(row)
        db.commit()
        return {"status": "success"}
    return {"status": "error", "message": "Record not found"}

# ------------------------------------------------------------
# 5. EXPORT EXCEL
# ------------------------------------------------------------
@router.get("/export_excel")
def peeling_export_excel(request: Request, ids: str = Query(None), db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    q = db.query(Peeling).filter(Peeling.company_id == comp_code)

    if ids:
        id_list = [int(i) for i in ids.split(",") if i.isdigit()]
        q = q.filter(Peeling.id.in_(id_list))

    rows = q.order_by(Peeling.date.asc()).all()
    
    wb = Workbook()
    ws = wb.active
    ws.title = "Peeling Report"
    ws.append(["Date", "Batch", "Contractor", "Variety", "HLSO Qty", "Peeled Qty", "Yield %", "Rate", "Amount", "Location", "Production For"])

    for r in rows:
        ws.append([str(r.date), r.batch_number, r.contractor_name, r.variety_name, r.hlso_qty, r.peeled_qty, r.yield_percent, r.rate, r.amount, r.peeling_at, r.production_for])

    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)
    return StreamingResponse(
        stream, 
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
        headers={"Content-Disposition": "attachment; filename=PEELING_REPORT.xlsx"}
    )

# ------------------------------------------------------------
# 6. MONTHLY BILLING
# ------------------------------------------------------------
@router.get("/contractor_monthly_bill")
def peeling_monthly_bill(
    request: Request, 
    month: str, 
    contractor: str, 
    ids: str = None, 
    db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")
    
    q = db.query(Peeling).filter(Peeling.company_id == comp_code, Peeling.contractor_name == contractor)
    
    if ids:
        id_list = [int(i) for i in ids.split(",") if i.isdigit()]
        q = q.filter(Peeling.id.in_(id_list))
    else:
        # month is YYYY-MM
        q = q.filter(func.to_char(Peeling.date, "YYYY-MM") == month)

    rows = q.order_by(Peeling.date.asc()).all()
    
    total_hlso = sum(r.hlso_qty or 0 for r in rows)
    total_peeled = sum(r.peeled_qty or 0 for r in rows)
    grand_total = sum(r.amount or 0 for r in rows)
    
    return templates.TemplateResponse(
        request=request,
        name="reports/peeling_monthly_bill.html",
        context={
            "rows": rows, 
            "total_hlso": round(total_hlso, 2), 
            "total_peeled": round(total_peeled, 2), 
            "grand_total": round(grand_total, 2),
            "contractor_name": contractor, 
            "month_year": month,
            "bill_date": datetime.now() 
        }
    )