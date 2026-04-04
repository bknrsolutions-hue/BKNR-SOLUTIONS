from fastapi import APIRouter, Request, Form, Depends, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from datetime import datetime, date
import json

from app.database import get_db
from app.database.models.processing import (
    DeHeading,
    RawMaterialPurchasing,
    Grading,
    Soaking,
    Peeling
)
from app.database.models.criteria import (
    peeling_rates, contractors, species as SpeciesMaster, peeling_at, production_for as ProductionForMaster
)

# FIXED IMPORT: Centralized Floor Balance Service
from app.services.floor_balance import get_floor_balance

router = APIRouter(tags=["DE-HEADING"])
templates = Jinja2Templates(directory="app/templates")

# =====================================================
# API: GET VALID BATCHES BASED ON COMPANY & LOCATION
# =====================================================
@router.get("/get_valid_batches/{production_for}/{location}")
def get_valid_batches(production_for: str, location: str, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code:
        return {"batches": []}

    # Floor balance list nundi batches extract cheyali
    rmp_q = db.query(RawMaterialPurchasing.batch_number, RawMaterialPurchasing.count, RawMaterialPurchasing.species)\
        .filter(
            RawMaterialPurchasing.company_id == company_code,
            RawMaterialPurchasing.production_for == production_for,
            RawMaterialPurchasing.peeling_at == location,
            RawMaterialPurchasing.variety_name == "HOSO"
        ).all()
    
    grad_q = db.query(Grading.batch_number, Grading.graded_count, Grading.species)\
        .filter(
            Grading.company_id == company_code,
            Grading.production_for == production_for,
            Grading.peeling_at == location,
            Grading.variety_name == "HOSO"
        ).all()

    valid_batches = set()
    for b_num, count, spec in rmp_q:
        if get_floor_balance(db, company_code, location, b_num, count, spec, "HOSO") > 0.01:
            valid_batches.add(b_num)
            
    for b_num, count, spec in grad_q:
        if get_floor_balance(db, company_code, location, b_num, count, spec, "HOSO") > 0.01:
            valid_batches.add(b_num)

    return {"batches": sorted(list(valid_batches))}

# =====================================================
# API: GET HOSO COUNTS BASED ON BATCH, COMPANY & LOCATION
# =====================================================
@router.get("/get_hoso/{production_for}/{location}/{batch}")
def get_hoso_counts(production_for: str, location: str, batch: str, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code:
        return {"counts": []}

    # Specific Batch, Location mariyu Company combination check
    rmp_c = db.query(RawMaterialPurchasing.count, RawMaterialPurchasing.species)\
        .filter(
            RawMaterialPurchasing.batch_number == batch,
            RawMaterialPurchasing.production_for == production_for,
            RawMaterialPurchasing.peeling_at == location,
            RawMaterialPurchasing.company_id == company_code,
            RawMaterialPurchasing.variety_name == "HOSO"
        ).distinct().all()
    
    grad_c = db.query(Grading.graded_count, Grading.species)\
        .filter(
            Grading.batch_number == batch,
            Grading.production_for == production_for,
            Grading.peeling_at == location,
            Grading.company_id == company_code,
            Grading.variety_name == "HOSO"
        ).distinct().all()

    stock_counts = set()
    
    for count_val, spec_val in rmp_c:
        if get_floor_balance(db, company_code, location, batch, count_val, spec_val, "HOSO") > 0.01:
            stock_counts.add(count_val)
            
    for count_val, spec_val in grad_c:
        if get_floor_balance(db, company_code, location, batch, count_val, spec_val, "HOSO") > 0.01:
            stock_counts.add(count_val)

    return {"counts": sorted(list(stock_counts))}

# =====================================================
# API: GET AVAILABLE QTY
# =====================================================
@router.get("/get_available_qty/{location}/{batch}/{count}/{species_name}")
def get_available_qty(location: str, batch: str, count: str, species_name: str, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code:
        return {"available_qty": 0}

    qty = get_floor_balance(db, company_code, location, batch, count, species_name, "HOSO")
    return {"available_qty": qty}

@router.get("/get_rate/{contractor}")
def get_contractor_rate(contractor: str, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    row = db.query(peeling_rates).filter(peeling_rates.contractor_name == contractor, peeling_rates.variety_name == "HOSO", peeling_rates.company_id == company_code).order_by(peeling_rates.effective_from.desc()).first()
    return {"rate": float(row.rate) if row else 0}

# =====================================================
# MAIN VIEW: SHOW DE-HEADING PAGE
# =====================================================
@router.get("/de_heading", response_class=HTMLResponse)
def show_de_heading(request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/auth/login", status_code=303)

    # MASTER DATA (Searchable Dropdowns [2026-01-24])
    contractor_list = [c.contractor_name for c in db.query(contractors).filter(contractors.company_id == company_code).order_by(contractors.contractor_name).all()]
    species_list = [s.species_name for s in db.query(SpeciesMaster).filter(SpeciesMaster.company_id == company_code).order_by(SpeciesMaster.species_name).all()]
    peeling_locs = [p.peeling_at for p in db.query(peeling_at).filter(peeling_at.company_id == company_code).all()]
    prod_for_list = [p[0] for p in db.query(distinct(ProductionForMaster.production_for)).filter(ProductionForMaster.company_id == company_code).all() if p[0]]

    today_data = db.query(DeHeading).filter(DeHeading.company_id == company_code, DeHeading.date == date.today()).order_by(DeHeading.id.desc()).all()

    # FLOOR BALANCE LIST Calculation
    rmp_q = db.query(RawMaterialPurchasing.batch_number, RawMaterialPurchasing.count, RawMaterialPurchasing.species, RawMaterialPurchasing.production_for, RawMaterialPurchasing.peeling_at)\
        .filter(RawMaterialPurchasing.company_id == company_code, RawMaterialPurchasing.variety_name == "HOSO").all()
    
    grad_q = db.query(Grading.batch_number, Grading.graded_count, Grading.species, Grading.production_for, Grading.peeling_at)\
        .filter(Grading.company_id == company_code, Grading.variety_name == "HOSO").all()

    unique_combos = set()
    for r in rmp_q: unique_combos.add((r[0], r[1], r[2], r[3], r[4]))
    for g in grad_q: unique_combos.add((g[0], g[1], g[2], g[3], g[4]))

    hoso_floor_balance_list = []
    for b_num, c_val, s_val, p_for, loc in unique_combos:
        if not b_num or not c_val or not loc: continue
        avail = get_floor_balance(db, company_code, loc, b_num, c_val, s_val, "HOSO")
        if avail > 0.01:
            hoso_floor_balance_list.append({
                "production_for": p_for or "General Stock",
                "peeling_at": loc,
                "batch": b_num,
                "count": c_val,
                "species": s_val or "N/A",
                "available_qty": avail
            })

    hoso_floor_balance_list.sort(key=lambda x: (x['production_for'], x['peeling_at']))

    return templates.TemplateResponse("processing/de_heading.html", {
        "request": request,
        "contractors": contractor_list,
        "species": species_list,
        "peeling_locations": peeling_locs,
        "prod_for_list": prod_for_list,
        "today_data": today_data,
        "hoso_floor_balance": hoso_floor_balance_list
    })

# =====================================================
# ACTION: SAVE DE-HEADING ENTRY
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

    if not company_code:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    avail = get_floor_balance(db, company_code, deheading_at, batch_number, hoso_count, species, "HOSO")
    if hoso_qty > (avail + 0.1):
        return JSONResponse({"error": f"Insufficient balance. Available: {avail}"}, status_code=400)

    try: clean_yield = float(str(yield_percent).replace('%', ''))
    except: clean_yield = 0.0

    new_entry = DeHeading(
        production_for=production_for, peeling_at=deheading_at, batch_number=batch_number, hoso_count=hoso_count,
        species=species, hoso_qty=hoso_qty, hlso_qty=hlso_qty, yield_percent=clean_yield,
        contractor=contractor, rate_per_kg=rate_per_kg, amount=amount, date=date.today(), time=datetime.now().time(),
        email=email, company_id=company_code
    )
    db.add(new_entry)
    db.commit()
    return RedirectResponse("/processing/de_heading", status_code=303)

# =====================================================
# ACTION: DELETE ENTRY
# =====================================================
@router.post("/de_heading/delete/{id}")
def delete_de_heading(id: int, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
        
    db.query(DeHeading).filter(DeHeading.id == id, DeHeading.company_id == company_code).delete()
    db.commit()
    return JSONResponse({"status": "ok"})