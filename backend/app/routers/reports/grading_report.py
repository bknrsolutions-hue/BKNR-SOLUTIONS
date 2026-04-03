# ============================================================
# GRADING SUMMARY REPORT – FULL ROUTER (UPDATED & SEARCH READY)
# ============================================================

from fastapi import APIRouter, Request, Depends, Query, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import desc
from collections import defaultdict
from io import BytesIO
import json
from datetime import datetime

from openpyxl import Workbook

from app.database import get_db
from app.database.models.processing import Grading, DeHeading, AuditLog
from app.database.models.criteria import HOSO_HLSO_Yields

router = APIRouter(
    prefix="/grading_report",
    tags=["GRADING SUMMARY REPORT"]
)

templates = Jinja2Templates(directory="app/templates")

# ============================================================
# MAIN REPORT VIEW
# ============================================================
@router.get("", response_class=HTMLResponse)
def grading_report(
    request: Request,
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    role = request.session.get("role")
    if not company_id:
        return RedirectResponse("/auth/login", status_code=303)

    # 1. Yield Map Preparation
    yield_map = {
        (r.species, str(r.hoso_count)): float(r.hlso_yield_pct or 0) / 100
        for r in db.query(HOSO_HLSO_Yields)
        .filter(HOSO_HLSO_Yields.company_id == company_id)
        .all()
    }

    # 2. De-Heading Data (Actual HOSO Source)
    deheading_hoso_map = defaultdict(float)
    for r in db.query(DeHeading).filter(DeHeading.company_id == company_id).all():
        deheading_hoso_map[(r.batch_number, r.species, str(r.hoso_count))] += float(r.hoso_qty or 0)

    # 3. Grading Raw Data Grouping
    grading_rows = db.query(Grading).filter(Grading.company_id == company_id).all()
    grouped = defaultdict(list)

    # Dropdown Filter Data
    batches_list = sorted(list({r.batch_number for r in grading_rows if r.batch_number}))
    species_list = sorted(list({r.species for r in grading_rows if r.species}))

    for r in grading_rows:
        grouped[(r.batch_number, r.species, str(r.hoso_count), r.variety_name)].append(r)

    rows = []
    idx = 1
    summary_group = defaultdict(list)

    # 4. Calculation Logic
    for (batch, species, hoso_count, variety), items in grouped.items():
        graded_qty_sum = sum(float(i.quantity or 0) for i in items)
        base = sum(float(i.graded_count or 0) * float(i.quantity or 0) for i in items)
        
        yield_factor = yield_map.get((species, hoso_count), 0)

        # Actual HOSO Logic
        if variety == "HOSO":
            actual_hoso_qty = graded_qty_sum
        elif variety == "HLSO":
            actual_hoso_qty = deheading_hoso_map.get((batch, species, hoso_count), 0)
        else:
            actual_hoso_qty = 0

        # Workout & Yield Calculations
        workout = (base / graded_qty_sum) if graded_qty_sum > 0 else 0
        if variety == "HLSO":
            workout = workout * 2.2 * yield_factor

        yield_pct = (graded_qty_sum / actual_hoso_qty * 100) if actual_hoso_qty > 0 else 0
        grading_hoso_qty = (graded_qty_sum / yield_factor) if variety == "HLSO" and yield_factor > 0 else graded_qty_sum
        
        diff_kg = grading_hoso_qty - actual_hoso_qty if variety == "HLSO" else 0
        diff_pct = (diff_kg / actual_hoso_qty * 100) if actual_hoso_qty > 0 else 0

        summary_group[(batch, species)].append({
            "batch": batch, "species": species, "hoso_count": hoso_count, "variety": variety,
            "hoso_qty": round(actual_hoso_qty, 2), "graded_qty": round(graded_qty_sum, 2),
            "workout_count": round(workout, 2), "yield_pct": round(yield_pct, 2),
            "grading_hoso_qty": round(grading_hoso_qty, 2), "weight_diff_kg": round(diff_kg, 2),
            "weight_diff_pct": round(diff_pct, 2)
        })

    # 5. Final Rows with Subtotals
    for (batch, species), items in summary_group.items():
        sh = sg = sw = sgh = sdiff = 0
        for r in items:
            r["id"] = idx
            rows.append(r)
            idx += 1
            sh += r["hoso_qty"]
            sg += r["graded_qty"]
            sw += r["workout_count"]
            sgh += r["grading_hoso_qty"]
            sdiff += r["weight_diff_kg"]

        rows.append({
            "id": "", "batch": batch, "species": species, "hoso_count": "", "variety": "SUB TOTAL",
            "hoso_qty": round(sh, 2), "graded_qty": round(sg, 2), "workout_count": round(sw, 2),
            "yield_pct": round((sg / sh * 100), 2) if sh > 0 else 0,
            "grading_hoso_qty": round(sgh, 2), "weight_diff_kg": round(sdiff, 2), "weight_diff_pct": 0,
            "is_subtotal": True
        })

    # FIXED: Using request as first argument for TemplateResponse
    return templates.TemplateResponse(
        request, 
        "reports/grading_report.html", 
        {
            "rows": rows, 
            "batches_list": batches_list, 
            "species_list": species_list,
            "is_admin": role == "admin"
        }
    )


# ------------------------------------------------------------
# 3. FETCH FULL AUDIT HISTORY (Company Wise)
# ------------------------------------------------------------
@router.get("/audit_all")
async def get_all_peeling_audit(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    
    # Prathi row change ni latest nundi fetch chestundi
    logs = (
        db.query(AuditLog, DeHeading.batch_number)
        .join(DeHeading, AuditLog.record_id == DeHeading.id)
        .filter(AuditLog.table_name == "de_heading", AuditLog.company_id == comp_code)
        .order_by(AuditLog.edited_at.desc())
        .limit(100) # Latest 100 changes chusthunnam
        .all()
    )
    
    return [
        {
            "timestamp": log.AuditLog.edited_at.strftime("%d-%m-%Y %H:%M:%S"),
            "user": log.AuditLog.edited_by.split('@')[0], # Email short form kosam
            "batch": log.batch_number,
            "action": f"Changed {log.AuditLog.field_name.replace('_', ' ').title()}",
            "details": f"{log.AuditLog.old_value} ➔ {log.AuditLog.new_value}",
            "type": "UPDATE"
        } for log in logs
    ]
# ============================================================
# GRADING SUMMARY REPORT – FULL ROUTER (LOCKED & UPDATED)
# ============================================================

from fastapi import APIRouter, Request, Depends, Query, HTTPException
from fastapi.responses import (
    HTMLResponse,
    RedirectResponse,
    JSONResponse,
    StreamingResponse
)
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import desc, update
from collections import defaultdict
from io import BytesIO
import json
from datetime import datetime

from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill

from app.database import get_db
from app.database.models.processing import Grading, DeHeading, AuditLog
from app.database.models.criteria import HOSO_HLSO_Yields

router = APIRouter(
    prefix="/grading_report",
    tags=["GRADING SUMMARY REPORT"]
)

templates = Jinja2Templates(directory="app/templates")

# ============================================================
# PERMISSION CHECK
# ============================================================
def allow_grading(request: Request):
    role = request.session.get("role", "admin")
    if role not in ("admin", "viewer"):
        raise HTTPException(status_code=403, detail="Access Denied")

# ============================================================
# MAIN REPORT VIEW
# ============================================================
@router.get("", response_class=HTMLResponse)
def grading_report(
    request: Request,
    db: Session = Depends(get_db),
    _ = Depends(allow_grading)
):
    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/auth/login", status_code=303)

    # 1. Yield Map Preparation
    yield_map = {
        (r.species, str(r.hoso_count)): float(r.hlso_yield_pct or 0) / 100
        for r in db.query(HOSO_HLSO_Yields)
        .filter(HOSO_HLSO_Yields.company_id == company_id)
        .all()
    }

    # 2. De-Heading Data (Actual HOSO Source)
    deheading_hoso_map = defaultdict(float)
    for r in db.query(DeHeading).filter(DeHeading.company_id == company_id).all():
        deheading_hoso_map[(r.batch_number, r.species, str(r.hoso_count))] += float(r.hoso_qty or 0)

    # 3. Grading Raw Data Grouping
    grading_rows = db.query(Grading).filter(Grading.company_id == company_id).all()
    grouped = defaultdict(list)

    for r in grading_rows:
        grouped[(r.batch_number, r.species, str(r.hoso_count), r.variety_name)].append(r)

    rows = []
    idx = 1
    summary_group = defaultdict(list)

    # 4. Calculation Logic
    for (batch, species, hoso_count, variety), items in grouped.items():
        graded_qty_sum = sum(float(i.quantity or 0) for i in items)
        base = sum(float(i.graded_count or 0) * float(i.quantity or 0) for i in items)
        
        yield_factor = yield_map.get((species, hoso_count), 0)

        # Actual HOSO Logic
        if variety == "HOSO":
            actual_hoso_qty = graded_qty_sum
        elif variety == "HLSO":
            actual_hoso_qty = deheading_hoso_map.get((batch, species, hoso_count), 0)
        else:
            actual_hoso_qty = 0

        # Workout & Yield Calculations
        workout = (base / graded_qty_sum) if graded_qty_sum > 0 else 0
        if variety == "HLSO":
            workout = workout * 2.2 * yield_factor

        yield_pct = (graded_qty_sum / actual_hoso_qty * 100) if actual_hoso_qty > 0 else 0
        grading_hoso_qty = (graded_qty_sum / yield_factor) if variety == "HLSO" and yield_factor > 0 else graded_qty_sum
        
        diff_kg = grading_hoso_qty - actual_hoso_qty if variety == "HLSO" else 0
        diff_pct = (diff_kg / actual_hoso_qty * 100) if actual_hoso_qty > 0 else 0

        summary_group[(batch, species)].append({
            "batch": batch,
            "species": species,
            "hoso_count": hoso_count,
            "variety": variety,
            "hoso_qty": round(actual_hoso_qty, 2),
            "graded_qty": round(graded_qty_sum, 2),
            "workout_count": round(workout, 2),
            "yield_pct": round(yield_pct, 2),
            "grading_hoso_qty": round(grading_hoso_qty, 2),
            "weight_diff_kg": round(diff_kg, 2),
            "weight_diff_pct": round(diff_pct, 2)
        })

    # 5. Final Rows with Subtotals
    for (batch, species), items in summary_group.items():
        sh = sg = sw = sgh = sdiff = 0
        for r in items:
            r["id"] = idx
            rows.append(r)
            idx += 1
            sh += r["hoso_qty"]
            sg += r["graded_qty"]
            sw += r["workout_count"]
            sgh += r["grading_hoso_qty"]
            sdiff += r["weight_diff_kg"]

        rows.append({
            "id": "", "batch": batch, "species": species, "hoso_count": "", "variety": "SUB TOTAL",
            "hoso_qty": round(sh, 2), "graded_qty": round(sg, 2), "workout_count": round(sw, 2),
            "yield_pct": round((sg / sh * 100), 2) if sh > 0 else 0,
            "grading_hoso_qty": round(sgh, 2), "weight_diff_kg": round(sdiff, 2), "weight_diff_pct": 0,
            "is_subtotal": True
        })

    return templates.TemplateResponse("reports/grading_report.html", {"request": request, "rows": rows})

# ============================================================
# DETAILED VIEW API – (ALL COLUMNS INCLUDED)
# ============================================================
@router.get("/details")
def grading_details(
    request: Request,
    source: str = Query(...),
    batch: str = Query(None),
    species: str = Query(None),
    hoso_count: str = Query(None),
    variety: str = Query(None),
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    if not company_id: return []

    if source == "all":
        data = db.query(Grading).filter(Grading.company_id == company_id).order_by(desc(Grading.date), desc(Grading.time)).all()
    elif source == "hoso":
        data = db.query(DeHeading).filter(
            DeHeading.company_id == company_id, DeHeading.batch_number == batch,
            DeHeading.species == species, DeHeading.hoso_count == hoso_count
        ).all()
    else:
        data = db.query(Grading).filter(
            Grading.company_id == company_id, Grading.batch_number == batch,
            Grading.species == species, Grading.hoso_count == hoso_count, Grading.variety_name == variety
        ).all()

    result = []
    for r in data:
        d = {k: v for k, v in r.__dict__.items() if not k.startswith('_')}
        if 'date' in d and d['date']: d['date'] = str(d['date'])
        if 'time' in d and d['time']: d['time'] = str(d['time'])
        result.append(d)
    return result

# ============================================================
# UPDATE RECORD (INLINE EDIT)
# ============================================================
@router.post("/update")
async def update_grading(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    user_email = request.session.get("email")
    data = await request.json()
    record_id = data.get("id")

    if not record_id:
        return JSONResponse({"status": "error", "message": "Missing ID"}, status_code=400)

    original = db.query(Grading).filter(Grading.id == record_id, Grading.company_id == company_id).first()
    if not original:
        return JSONResponse({"status": "error", "message": "Record not found"}, status_code=404)

    # Tracking changes for Audit Log
    for field, new_val in data.items():
        if field in ("id", "company_id"): continue
        old_val = getattr(original, field, None)
        
        if str(old_val) != str(new_val):
            # Create Audit Log
            log = AuditLog(
                table_name="grading",
                record_id=record_id,
                field_name=field,
                old_value=str(old_val),
                new_value=str(new_val),
                edited_by=user_email,
                edited_at=datetime.now(),
                company_id=company_id
            )
            db.add(log)
            setattr(original, field, new_val)

    db.commit()
    return {"status": "success"}

# ============================================================
# DELETE RECORD
# ============================================================
@router.post("/delete")
async def delete_grading(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    data = await request.json()
    record_id = data.get("id")

    db.query(Grading).filter(Grading.id == record_id, Grading.company_id == company_id).delete()
    db.commit()
    return {"status": "success"}

# ============================================================
# AUDIT LOGS (FETCH)
# ============================================================
@router.get("/audit")
def get_grading_audits(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    logs = db.query(AuditLog).filter(
        AuditLog.company_id == company_id,
        AuditLog.table_name == "grading"
    ).order_by(desc(AuditLog.edited_at)).limit(100).all()
    
    return [{
        "record_id": l.record_id,
        "field_name": l.field_name,
        "old_value": l.old_value,
        "new_value": l.new_value,
        "edited_by": l.edited_by,
        "edited_at": l.edited_at.strftime("%Y-%m-%d %H:%M")
    } for l in logs]

# ============================================================
# EXPORT EXCEL
# ============================================================
@router.get("/export_excel")
def export_excel(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    rows = db.query(Grading).filter(Grading.company_id == company_id).all()

    wb = Workbook()
    ws = wb.active
    ws.title = "Detailed Grading Report"

    headers = ["Date", "Time", "Batch", "Species", "Variety", "Count", "Quantity", "Graded Count"]
    ws.append(headers)
    
    for r in rows:
        ws.append([str(r.date), str(r.time), r.batch_number, r.species, r.variety_name, r.hoso_count, r.quantity, r.graded_count])

    output = BytesIO()
    wb.save(output)
    output.seek(0)
    return StreamingResponse(
        output, 
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 
        headers={"Content-Disposition": "attachment; filename=Grading_Detailed_Report.xlsx"}
    )