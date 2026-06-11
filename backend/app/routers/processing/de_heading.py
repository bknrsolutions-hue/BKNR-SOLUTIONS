from fastapi import APIRouter, Request, Form, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse, JSONResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from datetime import datetime, date
from app.utils.timezone import ist_now
import json

from app.database import get_db
from app.database.models.processing import (
    DeHeading,
    RawMaterialPurchasing,
    Grading,
    Soaking,
    Peeling
)
from app.database.models.reprocess import Reprocess
from app.database.models.criteria import (
    peeling_rates, contractors, species as SpeciesMaster, peeling_at, production_for as ProductionForMaster
)

# Centralized Floor Balance Service
from app.services.floor_balance import get_floor_balance

# 🟢 Centralized Hlso Grading Pool Sync Service
from app.services.hlso_grading_sync import add_deheading_to_grading_pool, remove_deheading_from_grading_pool

# 🟢 FIXED: Added prefix to perfectly match your JavaScript frontend calls (/processing/...)
router = APIRouter( tags=["DE-HEADING"])
templates = Jinja2Templates(directory="app/templates")


# =====================================================
# API: GET AVAILABLE QTY (Direct Service Link)
# =====================================================
@router.get("/get_available_qty")
def get_available_qty(
    location: str = Query(...), 
    batch: str = Query(...), 
    count: str = Query(...), 
    species_name: str = Query(...), 
    request: Request = None, 
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")
    if not company_code:
        return {"available_qty": 0}
    
    clean_batch = str(batch).strip()
    clean_count = str(count).strip()

    is_repro = db.query(Reprocess).filter(Reprocess.new_batch_id == clean_batch, Reprocess.company_id == company_code).first()
    s_type = "REPROCESS" if is_repro else "RMP"

    # De-heading is always HOSO variety -> Directly calling centralized service engine
    qty = get_floor_balance(db, company_code, location, clean_batch, clean_count, species_name, "HOSO", source_type=s_type)
    return {"available_qty": round(qty, 2) if qty else 0}


# =====================================================
# API: GET VALID BATCHES
# =====================================================
@router.get("/get_valid_batches/{production_for}/{location}")
def get_valid_batches(production_for: str, location: str, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code:
        return {"batches": []}

    rmp_q = db.query(RawMaterialPurchasing.batch_number, RawMaterialPurchasing.count, RawMaterialPurchasing.species)\
        .filter(RawMaterialPurchasing.company_id == company_code, RawMaterialPurchasing.production_for == production_for,
                RawMaterialPurchasing.peeling_at == location, RawMaterialPurchasing.variety_name == "HOSO").all()
    
    grad_q = db.query(Grading.batch_number, Grading.graded_count, Grading.species)\
        .filter(Grading.company_id == company_code, Grading.production_for == production_for,
                Grading.peeling_at == location, Grading.variety_name == "HOSO").all()
    
    repro_q = db.query(Reprocess.new_batch_id, Reprocess.grade, Reprocess.species)\
        .filter(Reprocess.company_id == company_code, Reprocess.production_for == production_for,
                Reprocess.production_at == location, Reprocess.variety == "HOSO").all()

    valid_batches = set()
    for b_num, count, spec in rmp_q:
        if b_num and get_floor_balance(db, company_code, location, b_num, count, spec, "HOSO", source_type="RMP") > 0.01:
            valid_batches.add(b_num)
            
    for b_num, count, spec in grad_q:
        if b_num and get_floor_balance(db, company_code, location, b_num, count, spec, "HOSO", source_type="RMP") > 0.01:
            valid_batches.add(b_num)

    for b_num, count, spec in repro_q:
        if b_num and get_floor_balance(db, company_code, location, b_num, count, spec, "HOSO", source_type="REPROCESS") > 0.01:
            valid_batches.add(b_num)

    return {"batches": sorted(list(valid_batches))}


# =====================================================
# API: GET HOSO COUNTS
# =====================================================
@router.get("/get_hoso/{production_for}/{location}/{batch}")
def get_hoso_counts(production_for: str, location: str, batch: str, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code:
        return {"counts": []}

    rmp_c = db.query(RawMaterialPurchasing.count, RawMaterialPurchasing.species).filter(
        RawMaterialPurchasing.batch_number == batch, RawMaterialPurchasing.company_id == company_code, RawMaterialPurchasing.variety_name == "HOSO").all()
    
    grad_c = db.query(Grading.graded_count, Grading.species).filter(
        Grading.batch_number == batch, Grading.company_id == company_code, Grading.variety_name == "HOSO").all()
    
    repro_c = db.query(Reprocess.grade, Reprocess.species).filter(
        Reprocess.new_batch_id == batch, Reprocess.company_id == company_code, Reprocess.variety == "HOSO").all()

    stock_counts = set()
    for c, s in rmp_c:
        if get_floor_balance(db, company_code, location, batch, c, s, "HOSO", source_type="RMP") > 0.01: stock_counts.add(str(c).strip())
    for c, s in grad_c:
        if get_floor_balance(db, company_code, location, batch, c, s, "HOSO", source_type="RMP") > 0.01: stock_counts.add(str(c).strip())
    for c, s in repro_c:
        if get_floor_balance(db, company_code, location, batch, c, s, "HOSO", source_type="REPROCESS") > 0.01: stock_counts.add(str(c).strip())

    return {"counts": sorted(list(stock_counts))}


# =====================================================
# API: GET CONTRACTOR RATE
# =====================================================
@router.get("/get_rate/{contractor}")
def get_contractor_rate(contractor: str, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    row = db.query(peeling_rates).filter(
        peeling_rates.contractor_name == contractor, 
        peeling_rates.variety_name == "HOSO", 
        peeling_rates.company_id == company_code
    ).order_by(peeling_rates.effective_from.desc()).first()
    return {"rate": float(row.rate) if row else 0}


# =====================================================
# MAIN VIEW: DE-HEADING PAGE
# =====================================================
@router.get("/de_heading", response_class=HTMLResponse)
def show_de_heading(request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/auth/login", status_code=303)

    contractor_list = [c.contractor_name for c in db.query(contractors).filter(contractors.company_id == company_code).order_by(contractors.contractor_name).all()]
    species_list = [s.species_name for s in db.query(SpeciesMaster).filter(SpeciesMaster.company_id == company_code).order_by(SpeciesMaster.species_name).all()]
    peeling_locs = [p.peeling_at for p in db.query(peeling_at).filter(peeling_at.company_id == company_code).all()]
    prod_for_list = [p[0] for p in db.query(distinct(ProductionForMaster.production_for)).filter(ProductionForMaster.company_id == company_code).all() if p[0]]

    # Today's local data tracking
    today_data = db.query(DeHeading).filter(
        DeHeading.company_id == company_code,
        DeHeading.date == ist_now().date()
    ).order_by(DeHeading.id.desc()).all()

    combos = set()
    r_q = db.query(RawMaterialPurchasing.batch_number, RawMaterialPurchasing.count, RawMaterialPurchasing.species, RawMaterialPurchasing.production_for, RawMaterialPurchasing.peeling_at).filter(RawMaterialPurchasing.company_id == company_code, RawMaterialPurchasing.variety_name == "HOSO").all()
    for r in r_q: combos.add((r[0], r[1], r[2], r[3], r[4], "RMP"))
    
    g_q = db.query(Grading.batch_number, Grading.graded_count, Grading.species, Grading.production_for, Grading.peeling_at).filter(Grading.company_id == company_code, Grading.variety_name == "HOSO").all()
    for g in g_q: combos.add((g[0], g[1], g[2], g[3], g[4], "RMP"))

    rep_q = db.query(Reprocess.new_batch_id, Reprocess.grade, Reprocess.species, Reprocess.production_for, Reprocess.production_at).filter(Reprocess.company_id == company_code, Reprocess.variety == "HOSO").all()
    for r in rep_q: combos.add((r[0], r[1], r[2], r[3], r[4], "REPROCESS"))

    hoso_floor_balance_list = []
    for b_num, c_val, s_val, p_for, loc, s_type in combos:
        if not b_num or not loc: continue
        avail = get_floor_balance(db, company_code, loc, b_num, c_val, s_val, "HOSO", source_type=s_type)
        if avail > 0.01:
            hoso_floor_balance_list.append({
                "production_for": p_for or "General Stock",
                "peeling_at": loc,
                "batch": b_num,
                "count": c_val or "N/A",
                "species": s_val or "N/A",
                "available_qty": round(avail, 2)
            })

    hoso_floor_balance_list.sort(key=lambda x: (str(x['production_for']), str(x['peeling_at'])))

    return templates.TemplateResponse(
        request=request, name="processing/de_heading.html",
        context={
            "contractors": contractor_list, "species": species_list, "peeling_locations": peeling_locs,
            "prod_for_list": prod_for_list, "today_data": today_data, "hoso_floor_balance": hoso_floor_balance_list
        }
    )


# =====================================================
# ACTION: SAVE DE-HEADING (IST Calibrated & Sync Enabled)
# =====================================================
@router.post("/de_heading")
def save_de_heading(request: Request, db: Session = Depends(get_db), 
                    production_for: str = Form(...), deheading_at: str = Form(...), 
                    batch_number: str = Form(...), hoso_count: str = Form(...), 
                    species: str = Form(...), hoso_qty: float = Form(...), 
                    hlso_qty: float = Form(...), yield_percent: str = Form(...), 
                    contractor: str = Form(...), rate_per_kg: float = Form(...), 
                    amount: float = Form(...)):
    
    company_code = request.session.get("company_code")
    email = request.session.get("email")
    if not company_code: return JSONResponse({"error": "Unauthorized"}, status_code=401)

    clean_batch = str(batch_number).strip()
    clean_count = str(hoso_count).strip()

    is_repro = db.query(Reprocess).filter(Reprocess.new_batch_id == clean_batch, Reprocess.company_id == company_code).first()
    s_type = "REPROCESS" if is_repro else "RMP"

    avail = get_floor_balance(db, company_code, deheading_at, clean_batch, clean_count, species, "HOSO", source_type=s_type)
    
    if hoso_qty > (avail + 0.1):
        return JSONResponse({"error": f"Insufficient balance. Available: {round(avail, 2)}"}, status_code=400)

    try: clean_yield = float(str(yield_percent).replace('%', ''))
    except: clean_yield = 0.0

    # 🛠️ Midnight Rollover Date & Time Protection using ist_now helper
    current_ist = ist_now()

    new_entry = DeHeading(
        production_for=production_for, peeling_at=deheading_at, batch_number=clean_batch, hoso_count=clean_count,
        species=species, hoso_qty=hoso_qty, hlso_qty=hlso_qty, yield_percent=clean_yield,
        contractor=contractor, rate_per_kg=rate_per_kg, amount=amount, 
        date=current_ist.date(),  # 🟢 Synchronized to IST date
        time=current_ist.time(),  # 🟢 Synchronized to IST time
        email=email, company_id=company_code
    )
    db.add(new_entry)
    
    # 🟢 AUTO-DATA STORING GATEWAY: Adds HLSO stock straight to grading pool table
    add_deheading_to_grading_pool(db, new_entry)
    
    db.commit()
    return RedirectResponse("/processing/de_heading", status_code=303)


# =====================================================
# ACTION: DELETE (Sync and Pipeline Rollback Enabled)
# =====================================================
@router.post("/de_heading/delete/{id}")
def delete_de_heading(id: int, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code: return JSONResponse({"error": "Unauthorized"}, status_code=401)
    
    # 🟢 Fetch row instance first to allow properties synchronization mapping
    row = db.query(DeHeading).filter(DeHeading.id == id, DeHeading.company_id == company_code).first()
    if not row:
        return JSONResponse({"error": "Record not found"}, status_code=404)
        
    # 🟢 AUTO-DATA STORING GATEWAY: Rollback and subtract weight from grading pool
    remove_deheading_from_grading_pool(db, row)
    
    db.delete(row)
    db.commit()
    return JSONResponse({"status": "ok"})