from app.utils.timezone import ist_now
# ============================================================
# DE-HEADING REPORT ROUTER – FINAL (SPECIES + FY LOCK + DB SYNC)
# ============================================================

from fastapi import APIRouter, Request, Depends, Body, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from datetime import datetime
import datetime as dt
from io import BytesIO

from openpyxl import Workbook
from weasyprint import HTML

from app.database import get_db
from app.database.models.processing import DeHeading, AuditLog
from app.database.models.criteria import HOSO_HLSO_Yields

router = APIRouter(
    prefix="/de_heading",
    tags=["DE-HEADING REPORT"]
)

templates = Jinja2Templates(directory="app/templates")

# --- Helper: Get Financial Year (April to March) ---
def get_fin_year(date_val):
    if not date_val: return None
    return date_val.year if date_val.month >= 4 else date_val.year - 1

# ============================================================
# 1. MAIN REPORT (GET) - AUTO REFRESH ON OPEN WITH FY FILTER
# ============================================================
@router.get("", response_class=HTMLResponse)
async def de_heading_report(
    request: Request,
    fy: str = Query(None), # Financial Year Filter
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    role = request.session.get("role")
    if not company_id:
        return RedirectResponse("/", status_code=302)

    # 1. Fetch Current FY and Criteria Map (Species, Count)
    current_date = dt.date.today()
    current_fy_val = get_fin_year(current_date)
    
    target_yields = db.query(HOSO_HLSO_Yields).filter(HOSO_HLSO_Yields.company_id == company_id).all()
    
    # Matching Key: (Species, HOSO_Count)
    target_map = {
        (ty.species, str(ty.hoso_count)): float(ty.hlso_yield_pct)
        for ty in target_yields
    }

    # 2. Fetch Rows based on selected FY
    rows = []
    if fy:
        selected_year = int(fy)
        # Financial Year Logic: April (Selected Year) to March (Next Year)
        start_date = dt.date(selected_year, 4, 1)
        end_date = dt.date(selected_year + 1, 3, 31)
        
        rows = (
            db.query(DeHeading)
            .filter(
                DeHeading.company_id == company_id,
                DeHeading.date >= start_date,
                DeHeading.date <= end_date
            )
            .order_by(DeHeading.date.desc(), DeHeading.time.desc())
            .all()
        )

    # 3. Auto-Refresh Logic (Current FY only)
    needs_commit = False
    for r in rows:
        record_fy = get_fin_year(r.date)
        fresh_yield = target_map.get((r.species, str(r.hoso_count)), 0.0)

        # Refresh Target Yield only for Current FY records
        if record_fy == current_fy_val:
            if r.target_yield_percent != fresh_yield:
                r.target_yield_percent = fresh_yield
                needs_commit = True
        
        # Recalculate everything to ensure accuracy
        hoso = float(r.hoso_qty or 0)
        hlso = float(r.hlso_qty or 0)
        rate = float(r.rate_per_kg or 0)
        target_y = float(r.target_yield_percent or 0)

        r.yield_percent = round((hlso / hoso * 100), 2) if hoso > 0 else 0
        r.amount = round(hlso * rate, 2)

        if target_y > 0:
            expected_hoso = hlso / (target_y / 100)
            r.diff_qty = round(expected_hoso - hoso, 2)
            r.diff_percent = round(r.yield_percent - target_y, 2)
        else:
            r.diff_qty = 0.0
            r.diff_percent = 0.0

    if needs_commit:
        db.commit()

    def get_unique(field_attr):
        return sorted(list({getattr(r, field_attr) for r in rows if getattr(r, field_attr)}))

    return templates.TemplateResponse(
        request=request,
        name="reports/de_heading_report.html",
        context={
            "rows": rows,
            "batches": get_unique("batch_number"),
            "contractors": get_unique("contractor"),
            "species_list": get_unique("species"),
            "peeling_locations": get_unique("peeling_at"),
            "production_for_list": get_unique("production_for"),
            "is_admin": role == "admin",
            "selected_fy": fy,
            "datetime": datetime
        }
    )

# ============================================================
# 2. UPDATE ACTION (POST) - WITH AUDIT LOG
# ============================================================
@router.post("/update")
async def update_deheading_row(
    request: Request, 
    payload: dict = Body(...), 
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    user_email = request.session.get("email")

    row = db.query(DeHeading).filter(DeHeading.id == payload.get("id"), DeHeading.company_id == company_id).first()
    if not row: raise HTTPException(status_code=404, detail="Record not found")

    current_fy = get_fin_year(dt.date.today())
    record_fy = get_fin_year(row.date)

    # Basic fields update & Audit
    fields = ["batch_number", "contractor", "species", "hoso_count", "hoso_qty", "hlso_qty", "rate_per_kg", "peeling_at", "production_for"]
    for f in fields:
        if f in payload:
            old_val = str(getattr(row, f))
            new_val = payload[f]
            if old_val != str(new_val):
                # Add Audit Log
                db.add(AuditLog(
                    table_name="de_heading", record_id=row.id, company_id=company_id,
                    field_name=f, old_value=old_val, new_value=str(new_val),
                    edited_by=user_email, edited_at=dt.datetime.now(dt.timezone.utc)
                ))
                setattr(row, f, new_val)

    # Sync Target Yield (Species + Count Match)
    if record_fy == current_fy:
        target_obj = db.query(HOSO_HLSO_Yields).filter(
            HOSO_HLSO_Yields.company_id == company_id,
            HOSO_HLSO_Yields.species == row.species,
            HOSO_HLSO_Yields.hoso_count == str(row.hoso_count)
        ).first()
        row.target_yield_percent = float(target_obj.hlso_yield_pct) if target_obj else 0.0

    # Recalculate
    hoso, hlso = float(row.hoso_qty or 0), float(row.hlso_qty or 0)
    target_y = float(row.target_yield_percent or 0)
    row.yield_percent = round((hlso / hoso * 100), 2) if hoso > 0 else 0
    row.amount = round(hlso * float(row.rate_per_kg or 0), 2)
    
    if target_y > 0:
        row.diff_qty = round((hlso / (target_y / 100)) - hoso, 2)
        row.diff_percent = round(row.yield_percent - target_y, 2)

    db.commit()
    return {"status": "success", "target_yield_percent": row.target_yield_percent, "diff_qty": row.diff_qty, "diff_percent": row.diff_percent}

# ============================================================
# 3. AUDIT HISTORY, BILLING, EXPORTS & DELETE (STAY SAME)
# ============================================================
@router.get("/audit_all")
async def get_all_deheading_audit(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    logs = (
        db.query(AuditLog, DeHeading.batch_number)
        .join(DeHeading, AuditLog.record_id == DeHeading.id)
        .filter(AuditLog.table_name == "de_heading", AuditLog.company_id == comp_code)
        .order_by(AuditLog.edited_at.desc()).limit(100).all()
    )
    return [{
        "timestamp": l.AuditLog.edited_at.strftime("%d-%m-%Y %H:%M:%S"),
        "user": l.AuditLog.edited_by.split('@')[0],
        "batch": l.batch_number,
        "action": f"Changed {l.AuditLog.field_name.replace('_', ' ').title()}",
        "details": f"{l.AuditLog.old_value} ➔ {l.AuditLog.new_value}"
    } for l in logs]

@router.get("/contractor_monthly_bill")
def de_heading_monthly_bill(request: Request, month: str = Query(...), contractor: str = Query(...), ids: str = Query(None), download: bool = Query(False), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    query = db.query(DeHeading).filter(DeHeading.company_id == company_id, DeHeading.contractor == contractor)
    if ids: query = query.filter(DeHeading.id.in_([int(x) for x in ids.split(",") if x.strip()]))
    else: query = query.filter(func.to_char(DeHeading.date, 'YYYY-MM') == month)
    rows = query.order_by(DeHeading.date.asc()).all()
    
    t_hoso = sum(r.hoso_qty or 0 for r in rows)
    t_hlso = sum(r.hlso_qty or 0 for r in rows)
    data = {
        "request": request, "rows": rows, "contractor_name": contractor, "month_year": month,
        "total_hoso": round(t_hoso, 2), "total_hlso": round(t_hlso, 2),
        "grand_total": round(sum(r.amount or 0 for r in rows), 2),
        "avg_yield": round((t_hlso / t_hoso * 100) if t_hoso > 0 else 0, 2), "bill_date": ist_now()
    }
    if download:
        pdf = HTML(string=templates.get_template("reports/de_heading_monthly_bill.html").render(data)).write_pdf()
        return StreamingResponse(BytesIO(pdf), media_type="application/pdf", headers={"Content-Disposition": f"attachment; filename=Bill_{contractor}.pdf"})
    return templates.TemplateResponse(request=request, name="reports/de_heading_monthly_bill.html", context=data)

@router.get("/export_pdf")
def de_heading_export_pdf(request: Request, ids: str = Query(None), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    query = db.query(DeHeading).filter(DeHeading.company_id == company_id)
    if ids: query = query.filter(DeHeading.id.in_([int(x) for x in ids.split(",") if x.strip()]))
    pdf = HTML(string=templates.get_template("reports/de_heading_print.html").render({"request": request, "rows": query.all(), "printed_on": ist_now()})).write_pdf()
    return StreamingResponse(BytesIO(pdf), media_type="application/pdf", headers={"Content-Disposition": "attachment; filename=DE_HEADING.pdf"})

@router.get("/export_excel")
def de_heading_export_excel(request: Request, ids: str = Query(None), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    query = db.query(DeHeading).filter(DeHeading.company_id == company_id)
    if ids: query = query.filter(DeHeading.id.in_([int(x) for x in ids.split(",") if x.strip()]))
    wb = Workbook()
    ws = wb.active
    ws.append(["Date", "Batch No", "Contractor", "Species", "H-Count", "HOSO Qty", "HLSO Qty", "Yield %", "Rate", "Amount"])
    for r in query.all(): ws.append([str(r.date), r.batch_number, r.contractor, r.species, r.hoso_count, r.hoso_qty, r.hlso_qty, r.yield_percent, r.rate_per_kg, r.amount])
    stream = BytesIO(); wb.save(stream); stream.seek(0)
    return StreamingResponse(stream, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": "attachment; filename=DE_HEADING.xlsx"})

@router.post("/delete")
async def delete_row(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    row = db.query(DeHeading).filter(DeHeading.id == payload.get("id"), DeHeading.company_id == company_id).first()
    if row:
        db.add(AuditLog(table_name="de_heading", record_id=row.id, company_id=company_id, field_name="DELETE", old_value="DeHeading Record", new_value="DELETED", edited_by=request.session.get("email"), edited_at=dt.datetime.now(dt.timezone.utc)))
        db.delete(row); db.commit()
        return {"status": "success"}
    return {"status": "error"}