# ============================================================
# PEELING REPORT ROUTER (BKNR ERP) - FY LOCK + BATCH SYNC
# ============================================================

from fastapi import APIRouter, Request, Depends, Body, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
import datetime as dt
from datetime import datetime
from io import BytesIO
from openpyxl import Workbook

from app.database import get_db
from app.database.models.processing import Peeling, AuditLog
from app.database.models.criteria import varieties as Varieties

router = APIRouter(
    prefix="/peeling_report",
    tags=["PEELING REPORT"]
)

templates = Jinja2Templates(directory="app/templates")

# --- Helper: Get Financial Year (April to March) ---
def get_fin_year(date_val):
    if not date_val: return None
    # Entry date 2026-03-25 ayithe adi 2025 FY kindaku vasthundi
    return date_val.year if date_val.month >= 4 else date_val.year - 1

# ------------------------------------------------------------
# 1. MAIN REPORT PAGE (GET) - FY FILTERED & AUTO REFRESH
# ------------------------------------------------------------
@router.get("", response_class=HTMLResponse)
async def peeling_report(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    role = request.session.get("role")
    
    # Financial Year from Query Params (e.g., ?fy=2025)
    selected_fy = request.query_params.get("fy")

    if not comp_code:
        return RedirectResponse("/", status_code=302)

    # 1. Current System FY & Variety Criteria
    current_system_fy = get_fin_year(dt.date.today())
    var_list = db.query(Varieties).filter(Varieties.company_id == comp_code).all()
    yield_map = {v.variety_name: float(v.peeling_yield or 0) for v in var_list}

    # 2. Fetch Rows based on Selected FY
    rows = []
    if selected_fy:
        try:
            fy_start_int = int(selected_fy)
            start_date = dt.date(fy_start_int, 4, 1)
            end_date = dt.date(fy_start_int + 1, 3, 31)
            
            # Filter rows specifically for the selected Financial Year range
            rows = (
                db.query(Peeling)
                .filter(Peeling.company_id == comp_code)
                .filter(Peeling.date >= start_date)
                .filter(Peeling.date <= end_date)
                .order_by(Peeling.date.desc(), Peeling.time.desc())
                .all()
            )
        except ValueError:
            rows = []

    # 3. Auto-Refresh Logic (Only if viewing CURRENT FY)
    needs_commit = False
    if selected_fy and int(selected_fy) == current_system_fy:
        for r in rows:
            fresh_target = yield_map.get(r.variety_name, 0.0)
            
            # Sync target_yield_percent if different
            if float(r.target_yield_percent or 0) != fresh_target:
                r.target_yield_percent = fresh_target
                needs_commit = True
            
            # Always recalculate display fields for consistency
            h_qty = float(r.hlso_qty or 0)
            p_qty = float(r.peeled_qty or 0)
            target_y = float(r.target_yield_percent or 0)

            r.yield_percent = round((p_qty / h_qty * 100), 2) if h_qty > 0 else 0
            r.diff_percent = round(r.yield_percent - target_y, 2)
            
            if target_y > 0:
                expected_hlso = p_qty / (target_y / 100)
                r.diff_qty = round(expected_hlso - h_qty, 2)
            else:
                r.diff_qty = 0.0

    if needs_commit:
        db.commit()

    # Unique filter options for the UI
    def get_unique(field):
        return sorted({getattr(r, field) for r in rows if getattr(r, field)})

    return templates.TemplateResponse(
        request=request,
        name="reports/peeling_report.html",
        context={
            "rows": rows,
            "selected_fy": selected_fy,
            "batches": get_unique("batch_number"),
            "contractors": get_unique("contractor_name"),
            "varieties_dropdown": sorted(list(yield_map.keys())),
            "locations": get_unique("peeling_at"),
            "production_for_list": get_unique("production_for"),
            "is_admin": role == "admin",
            "datetime": datetime
        }
    )

# ------------------------------------------------------------
# 2. INLINE UPDATE (POST) - WITH FY LOCK & AUDIT
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

    row = db.query(Peeling).filter(Peeling.id == payload.get("id"), Peeling.company_id == comp_code).first()
    if not row:
        raise HTTPException(status_code=404, detail="Record not found")

    current_fy = get_fin_year(dt.date.today())
    record_fy = get_fin_year(row.date)

    # Basic fields update & Audit logging
    updatable_fields = [
        "batch_number", "contractor_name", "variety_name", "hlso_count",
        "hlso_qty", "peeled_qty", "rate", "peeling_at", "production_for"
    ]

    for field in updatable_fields:
        if field in payload:
            new_val = payload[field]
            old_val = getattr(row, field)

            if field in ["hlso_qty", "peeled_qty", "rate"]:
                try: new_val = float(new_val or 0)
                except: new_val = 0.0

            if str(old_val) != str(new_val):
                db.add(AuditLog(
                    table_name="peeling", record_id=row.id, company_id=comp_code,
                    field_name=field, old_value=str(old_val), new_value=str(new_val),
                    edited_by=user_email, edited_at=dt.datetime.now(dt.timezone.utc)
                ))
                setattr(row, field, new_val)

    # --- RECALCULATION & TARGET SYNC (Only sync target if record is in Current FY) ---
    if record_fy == current_fy:
        var_obj = db.query(Varieties).filter(
            Varieties.company_id == comp_code, 
            Varieties.variety_name == row.variety_name
        ).first()
        row.target_yield_percent = float(var_obj.peeling_yield or 0) if var_obj else 0.0

    # Final Calculations
    h_qty = float(row.hlso_qty or 0)
    p_qty = float(row.peeled_qty or 0)
    rt = float(row.rate or 0)
    target_y = float(row.target_yield_percent or 0)

    row.yield_percent = round((p_qty / h_qty * 100), 2) if h_qty > 0 else 0
    row.amount = round(p_qty * rt, 2)
    row.diff_percent = round(row.yield_percent - target_y, 2)

    if target_y > 0:
        row.diff_qty = round((p_qty / (target_y / 100)) - h_qty, 2)
    else:
        row.diff_qty = 0.0

    db.commit()
    return {"status": "success", "target_yield": row.target_yield_percent}

# ------------------------------------------------------------
# 3. AUDIT, DELETE, EXCEL & BILLING
# ------------------------------------------------------------
@router.get("/audit_all")
async def get_all_peeling_audit(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    logs = (
        db.query(AuditLog, Peeling.batch_number)
        .join(Peeling, AuditLog.record_id == Peeling.id)
        .filter(AuditLog.table_name == "peeling", AuditLog.company_id == comp_code)
        .order_by(AuditLog.edited_at.desc()).limit(100).all()
    )
    return [{
        "timestamp": l.AuditLog.edited_at.strftime("%d-%m-%Y %H:%M:%S"),
        "user": l.AuditLog.edited_by.split('@')[0],
        "batch": l.batch_number,
        "action": f"Changed {l.AuditLog.field_name.replace('_', ' ').title()}",
        "details": f"{l.AuditLog.old_value} ➔ {l.AuditLog.new_value}"
    } for l in logs]

@router.post("/delete")
async def delete_peeling(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    row = db.query(Peeling).filter(Peeling.id == payload.get("id"), Peeling.company_id == comp_code).first()
    if row:
        db.add(AuditLog(
            table_name="peeling", record_id=row.id, company_id=comp_code, 
            field_name="DELETE", old_value="Peeling Record", new_value="DELETED", 
            edited_by=request.session.get("email"), edited_at=dt.datetime.now(dt.timezone.utc)
        ))
        db.delete(row); db.commit()
        return {"status": "success"}
    return {"status": "error"}

@router.get("/export_excel")
def peeling_export_excel(request: Request, ids: str = Query(None), db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    q = db.query(Peeling).filter(Peeling.company_id == comp_code)
    if ids: q = q.filter(Peeling.id.in_([int(i) for i in ids.split(",") if i.isdigit()]))
    
    wb = Workbook(); ws = wb.active
    ws.append(["Date", "Batch", "Contractor", "Variety", "HLSO Qty", "Peeled Qty", "Yield %", "Rate", "Amount"])
    for r in q.order_by(Peeling.date.asc()).all():
        ws.append([str(r.date), r.batch_number, r.contractor_name, r.variety_name, r.hlso_qty, r.peeled_qty, r.yield_percent, r.rate, r.amount])
    
    stream = BytesIO(); wb.save(stream); stream.seek(0)
    return StreamingResponse(
        stream, 
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
        headers={"Content-Disposition": "attachment; filename=PEELING_REPORT.xlsx"}
    )

@router.get("/contractor_monthly_bill")
def peeling_monthly_bill(request: Request, month: str, contractor: str, ids: str = None, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    q = db.query(Peeling).filter(Peeling.company_id == comp_code, Peeling.contractor_name == contractor)
    
    if ids: 
        q = q.filter(Peeling.id.in_([int(i) for i in ids.split(",") if i.isdigit()]))
    else: 
        q = q.filter(func.to_char(Peeling.date, "YYYY-MM") == month)
        
    rows = q.order_by(Peeling.date.asc()).all()

    # --- Calculations ---
    t_hlso = sum(r.hlso_qty or 0 for r in rows)
    t_peeled = sum(r.peeled_qty or 0 for r in rows)
    
    # Calculate Average Yield (Error fix ikkada undi)
    avg_yield = (t_peeled / t_hlso * 100) if t_hlso > 0 else 0

    data = {
        "request": request, 
        "rows": rows, 
        "contractor_name": contractor, 
        "month_year": month,
        "total_hlso": round(t_hlso, 2),
        "total_peeled": round(t_peeled, 2),
        "avg_yield": avg_yield, # <--- Ikkada pampithe HTML lo error podhi
        "grand_total": round(sum(r.amount or 0 for r in rows), 2),
        "bill_date": datetime.now()
    }
    return templates.TemplateResponse(name="reports/peeling_monthly_bill.html", request=request, context=data)