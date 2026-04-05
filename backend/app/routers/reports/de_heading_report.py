# ============================================================
# DE-HEADING REPORT ROUTER – FINAL (COMPLETE + AUDIT + FETCH)
# ============================================================

from fastapi import APIRouter, Request, Depends, Body, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date
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

# Template configuration
templates = Jinja2Templates(directory="app/templates")

# ============================================================
# 1. MAIN REPORT (SEARCHABLE FILTERS)
# ============================================================
@router.get("", response_class=HTMLResponse)
async def de_heading_report(
    request: Request,
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    role = request.session.get("role")
    if not company_id:
        return RedirectResponse("/", status_code=302)

    # ---------------- TARGET YIELD LOOKUP ----------------
    target_yield_map = {
        str(r.hoso_count): round(float(r.hlso_yield_pct), 2)
        for r in db.query(HOSO_HLSO_Yields)
        .filter(HOSO_HLSO_Yields.company_id == company_id)
        .all()
    }

    # ---------------- DE-HEADING DATA ----------------
    rows = (
        db.query(DeHeading)
        .filter(DeHeading.company_id == company_id)
        .order_by(DeHeading.date.desc(), DeHeading.time.desc())
        .all()
    )

    # Inject Target Yield into each row object
    for r in rows:
        r.target_yield = target_yield_map.get(str(r.hoso_count), 0)

    # Unique values for searchable dropdown filters
    batches = sorted(list({r.batch_number for r in rows if r.batch_number}))
    contractors = sorted(list({r.contractor for r in rows if r.contractor}))
    species_list = sorted(list({r.species for r in rows if r.species}))
    peeling_locations = sorted(list({r.peeling_at for r in rows if r.peeling_at}))
    production_for_list = sorted(list({r.production_for for r in rows if r.production_for}))

    return templates.TemplateResponse(
        request=request,
        name="reports/de_heading_report.html",
        context={
            "rows": rows,
            "batches": batches,
            "contractors": contractors,
            "species_list": species_list,
            "peeling_locations": peeling_locations,
            "production_for_list": production_for_list,
            "is_admin": role == "admin"
        }
    )

# ============================================================
# 2. INLINE UPDATE LOGIC (WITH GATE-ENTRY STYLE AUDIT)
# ============================================================
@router.post("/update")
async def update_deheading_row(
    request: Request, 
    payload: dict = Body(...), 
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    role = request.session.get("role")
    edited_by = request.session.get("email")

    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    row = db.query(DeHeading).filter(
        DeHeading.id == payload.get("id"), 
        DeHeading.company_id == company_id
    ).first()
    
    if not row:
        raise HTTPException(status_code=404, detail="Record not found")

    update_fields = [
        "batch_number", "contractor", "species", "hoso_count", 
        "hoso_qty", "hlso_qty", "rate_per_kg", "peeling_at", "production_for"
    ]

    for field in update_fields:
        if field in payload and payload[field] is not None:
            old_value = getattr(row, field)
            new_value = payload[field]

            # Float conversion for numeric fields
            if field in ["hoso_qty", "hlso_qty", "rate_per_kg"]:
                try:
                    new_value = float(new_value or 0)
                except ValueError:
                    new_value = 0.0

            if str(old_value) != str(new_value):
                # Save to AuditLog (Reference Style)
                db.add(AuditLog(
                    table_name="de_heading",
                    record_id=row.id,
                    company_id=company_id,
                    field_name=field,
                    old_value=str(old_value),
                    new_value=str(new_value),
                    edited_by=edited_by,
                    edited_at=dt.datetime.utcnow()
                ))
                setattr(row, field, new_value)

    # Auto Calculations
    if row.hoso_qty > 0:
        row.yield_percent = round((row.hlso_qty / row.hoso_qty) * 100, 2)
    else:
        row.yield_percent = 0
    row.amount = round(row.hlso_qty * row.rate_per_kg, 2)

    db.commit()
    return {"status": "success", "message": "Record updated"}

# ------------------------------------------------------------
# 3. FETCH FULL AUDIT HISTORY (Company Wise)
# ------------------------------------------------------------
@router.get("/audit_all")
async def get_all_deheading_audit(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    
    logs = (
        db.query(AuditLog, DeHeading.batch_number)
        .join(DeHeading, AuditLog.record_id == DeHeading.id)
        .filter(AuditLog.table_name == "de_heading", AuditLog.company_id == comp_code)
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
# 4. CONTRACTOR MONTHLY BILL (PDF/HTML)
# ============================================================
@router.get("/contractor_monthly_bill")
def de_heading_monthly_bill(
    request: Request,
    month: str = Query(...),        
    contractor: str = Query(...),
    ids: str = Query(None),         
    download: bool = Query(False),
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    query = db.query(DeHeading).filter(
        DeHeading.company_id == company_id,
        DeHeading.contractor == contractor
    )

    if ids and ids.strip():
        id_list = [int(x) for x in ids.split(",") if x.strip()]
        query = query.filter(DeHeading.id.in_(id_list))
    else:
        # month is 'YYYY-MM'
        query = query.filter(func.to_char(DeHeading.date, 'YYYY-MM') == month)

    rows = query.order_by(DeHeading.date.asc()).all()

    total_hoso = sum(r.hoso_qty or 0 for r in rows)
    total_hlso = sum(r.hlso_qty or 0 for r in rows)
    total_amount = sum(r.amount or 0 for r in rows)
    avg_yield = round((total_hlso / total_hoso * 100) if total_hoso > 0 else 0, 2)

    data = {
        "request": request,
        "rows": rows,
        "contractor_name": contractor,
        "month_year": month,
        "total_hoso": round(total_hoso, 2),
        "total_hlso": round(total_hlso, 2),
        "grand_total": round(total_amount, 2),
        "avg_yield": avg_yield,
        "bill_date": datetime.now()
    }

    if download:
        html_content = templates.get_template("reports/de_heading_monthly_bill.html").render(data)
        pdf = HTML(string=html_content).write_pdf()
        return StreamingResponse(
            BytesIO(pdf), media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=Bill_{contractor}.pdf"}
        )

    return templates.TemplateResponse(
        request=request,
        name="reports/de_heading_monthly_bill.html",
        context=data
    )

# ============================================================
# 5. EXPORT PDF & EXCEL
# ============================================================
@router.get("/export_pdf")
def de_heading_export_pdf(request: Request, ids: str = Query(None), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    query = db.query(DeHeading).filter(DeHeading.company_id == company_id)
    if ids and ids.strip():
        id_list = [int(x) for x in ids.split(",") if x.strip()]
        query = query.filter(DeHeading.id.in_(id_list))
    rows = query.order_by(DeHeading.date.asc()).all()
    
    html = templates.get_template("reports/de_heading_print.html").render({
        "request": request, 
        "rows": rows, 
        "printed_on": datetime.now()
    })
    pdf = HTML(string=html).write_pdf()
    return StreamingResponse(
        BytesIO(pdf), 
        media_type="application/pdf", 
        headers={"Content-Disposition": "attachment; filename=DE_HEADING.pdf"}
    )

@router.get("/export_excel")
def de_heading_export_excel(request: Request, ids: str = Query(None), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    query = db.query(DeHeading).filter(DeHeading.company_id == company_id)
    if ids and ids.strip():
        id_list = [int(x) for x in ids.split(",") if x.strip()]
        query = query.filter(DeHeading.id.in_(id_list))
    rows = query.order_by(DeHeading.date.asc()).all()
    
    wb = Workbook()
    ws = wb.active
    ws.append(["Date", "Batch No", "Contractor", "Species", "H-Count", "HOSO Qty", "HLSO Qty", "Yield %", "Rate", "Amount", "Peeling At", "Production For"])
    
    for r in rows:
        ws.append([
            str(r.date), r.batch_number, r.contractor, r.species, r.hoso_count, 
            r.hoso_qty, r.hlso_qty, r.yield_percent, r.rate_per_kg, r.amount, 
            r.peeling_at, r.production_for
        ])
    
    stream = BytesIO()
    wb.save(stream)
    stream.seek(0)
    return StreamingResponse(
        stream, 
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
        headers={"Content-Disposition": "attachment; filename=DE_HEADING.xlsx"}
    )

# ============================================================
# 6. DELETE ROW ACTION
# ============================================================
@router.post("/delete")
async def delete_row(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    edited_by = request.session.get("email")
    row_id = payload.get("id")
    
    row = db.query(DeHeading).filter(DeHeading.id == row_id, DeHeading.company_id == company_id).first()
    if row:
        db.add(AuditLog(
            table_name="de_heading", record_id=row.id, company_id=company_id,
            field_name="DELETE", old_value="Record", new_value="Deleted",
            edited_by=edited_by, edited_at=dt.datetime.utcnow()
        ))
        db.delete(row)
        db.commit()
        return {"status": "success", "message": "Deleted successfully"}
    
    return {"status": "error", "message": "Record not found"}