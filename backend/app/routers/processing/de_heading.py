import json
import re
from fastapi import APIRouter, Request, Form, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse, JSONResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct, cast, String
from datetime import datetime, date

from app.database import get_db
from app.database.models.processing import DeHeading
from app.database.models.reprocess import Reprocess
from app.database.models.floor_balance import FloorBalance  # Live Running Stock Table
from app.database.models.criteria import (
    peeling_rates, contractors, species as SpeciesMaster, peeling_at, production_for as ProductionForMaster
)

# Centralized Hlso Grading Pool Sync Service
from app.services.hlso_grading_sync import add_deheading_to_grading_pool, remove_deheading_from_grading_pool
# Universal Global Filters Helper
from app.utils.global_filters import get_global_filters
from app.utils.timezone import ist_now

router = APIRouter(tags=["DE-HEADING"])
templates = Jinja2Templates(directory="app/templates")

# Masters Memory Caching Framework Context Lock
MASTERS_CACHE = {}

def get_cached_masters(db: Session, company_id: str, force_refresh: bool = False):
    global MASTERS_CACHE
    if company_id not in MASTERS_CACHE or force_refresh:
        c_list = [c.contractor_name for c in db.query(contractors).filter(contractors.company_id == company_id).order_by(contractors.contractor_name).all()]
        s_list = [s.species_name for s in db.query(SpeciesMaster).filter(SpeciesMaster.company_id == company_id).order_by(SpeciesMaster.species_name).all()]
        pf_list = [p[0] for p in db.query(distinct(ProductionForMaster.production_for)).filter(ProductionForMaster.company_id == company_id).all() if p[0]]
        
        MASTERS_CACHE[company_id] = {
            "contractors": c_list, "species": s_list, "prod_for_list": pf_list
        }
    return MASTERS_CACHE[company_id]


# =====================================================
# 🔥 CENTRALIZED ATOMIC INVENTORY HELPER ENGINE
# =====================================================
def update_floor_balance_row(
    db: Session, company_id: str, batch: str, count: str, species_val: str, 
    variety: str, location: str, production_for: str, qty_delta: float, email: str = None
):
    """
    1. with_for_update() Row Lock applied natively.
    2. Existing & Non-Existing Row Negative Stock Guards Activated.
    """
    now_ist = ist_now()
    
    row = db.query(FloorBalance).filter(
        FloorBalance.company_id == company_id,
        func.upper(func.trim(FloorBalance.location)) == location.strip().upper(),
        FloorBalance.batch_number == batch.strip(),
        FloorBalance.count == count.strip(),
        FloorBalance.species == species_val,
        FloorBalance.variety == variety,
        func.trim(FloorBalance.production_for) == func.trim(production_for)
    ).with_for_update().first()

    if row:
        # Existing Row Negative Guard Lock
        if qty_delta < 0 and (row.available_qty + qty_delta) < -0.01:
            raise HTTPException(
                status_code=400, 
                detail=f"Operation rejected. Insufficient balance on Live Row for {variety}. Available: {row.available_qty}, Needed: {abs(qty_delta)}"
            )
        row.available_qty += qty_delta
        row.last_updated = now_ist
        if email:
            row.email = email
    else:
        # Non-Existing Row Negative Guard Lock
        if qty_delta < 0:
            raise HTTPException(status_code=400, detail=f"Target live stock row not found for {variety} deduction.")
            
        new_row = FloorBalance(
            company_id=company_id, location=location.strip().upper(),
            production_for=production_for, batch_number=batch.strip(),
            source_type="RMP", species=species_val, variety=variety, count=count.strip(),
            available_qty=qty_delta, last_transaction="DE_HEADING_MUTATION",
            last_updated=now_ist, date=str(now_ist.date()), time=str(now_ist.time()), email=email
        )
        db.add(new_row)


# =====================================================
# MAIN VIEW: DE-HEADING PAGE (⚡ DIRECT LIVE READ)
# =====================================================
@router.get("/de_heading", response_class=HTMLResponse)
def show_de_heading(request: Request, db: Session = Depends(get_db)):
    global_production_for, global_location = get_global_filters(request)
    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/auth/login", status_code=303)

    session_locations = request.session.get("allowed_locations", [])
    user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()] if isinstance(session_locations, str) else [loc.strip().upper() for loc in session_locations if loc.strip()]

    masters = get_cached_masters(db, company_code)

    # 🟢 🔴 FIXED: STRICT GLOBAL LOCATION OVERRIDE FOR PEELING DROPDOWN
    peeling_q = db.query(peeling_at).filter(peeling_at.company_id == company_code)
    if global_location:
        peeling_q = peeling_q.filter(func.upper(func.trim(peeling_at.peeling_at)) == global_location.strip().upper())
    elif user_allowed_locations:
        peeling_q = peeling_q.filter(func.upper(func.trim(peeling_at.peeling_at)).in_(user_allowed_locations))
    peeling_locs = [p.peeling_at for p in peeling_q.all()]

    # 🟢 🔴 FIXED: STRICT GLOBAL PRODUCTION FOR OVERRIDE
    final_prod_for_list = [global_production_for] if global_production_for else masters["prod_for_list"]

    today_q = db.query(DeHeading).filter(DeHeading.company_id == company_code, DeHeading.date == ist_now().date())
    if global_location:
        today_q = today_q.filter(func.upper(func.trim(DeHeading.peeling_at)) == global_location.strip().upper())
    elif user_allowed_locations:
        today_q = today_q.filter(func.upper(func.trim(DeHeading.peeling_at)).in_(user_allowed_locations))
    if global_production_for:
        today_q = today_q.filter(func.trim(DeHeading.production_for) == func.trim(global_production_for))
    today_data = today_q.order_by(DeHeading.id.desc()).limit(100).all()

    # Direct indexed fetch from Live FloorBalance
    live_q = db.query(FloorBalance).filter(
        FloorBalance.company_id == company_code,
        FloorBalance.variety == "HOSO",
        FloorBalance.available_qty > 0.01
    )

    if global_production_for:
        live_q = live_q.filter(func.trim(FloorBalance.production_for) == func.trim(global_production_for))
    if global_location:
        live_q = live_q.filter(func.upper(func.trim(FloorBalance.location)) == global_location.strip().upper())
    elif user_allowed_locations:
        live_q = live_q.filter(func.upper(func.trim(FloorBalance.location)).in_(user_allowed_locations))

    live_records = live_q.order_by(FloorBalance.production_for, FloorBalance.location, FloorBalance.batch_number).all()

    hoso_floor_balance_list = []
    for r in live_records:
        hoso_floor_balance_list.append({
            "production_for": r.production_for or "General Stock",
            "peeling_at": r.location,
            "batch": r.batch_number,
            "count": r.count or "N/A",
            "species": r.species or "N/A",
            "available_qty": round(r.available_qty, 2)
        })

    return templates.TemplateResponse(
        request=request, name="processing/de_heading.html",
        context={
            "contractors": masters["contractors"], 
            "species": masters["species"], 
            "peeling_locations": peeling_locs,         # 👈 Injecting Strictly Filtered Data
            "prod_for_list": final_prod_for_list,      # 👈 Injecting Strictly Filtered Data
            "today_data": today_data, 
            "hoso_floor_balance": hoso_floor_balance_list,
            "selected_production_for": global_production_for, 
            "selected_location": global_location              
        }
    )


# =====================================================
# API LOOKUPS (⚡ SAFE NO LOCK GETS)
# =====================================================
@router.get("/get_available_qty")
def get_available_qty(
    location: str = Query(...), batch: str = Query(...), count: str = Query(...), 
    species_name: str = Query(...), request: Request = None, db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")
    if not company_code: return {"available_qty": 0}
    
    record = db.query(FloorBalance.available_qty).filter(
        FloorBalance.company_id == company_code, FloorBalance.location == location,
        FloorBalance.batch_number == batch.strip(), FloorBalance.count == count.strip(),
        FloorBalance.species == species_name, FloorBalance.variety == "HOSO"
    ).first()
    return {"available_qty": round(record[0], 2) if record else 0.0}

@router.get("/get_valid_batches/{production_for}/{location}")
def get_valid_batches(production_for: str, location: str, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code: return {"batches": []}

    global_p_for, global_loc = get_global_filters(request)
    if global_p_for: production_for = global_p_for
    if global_loc: location = global_loc

    session_locations = request.session.get("allowed_locations", [])
    user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()] if isinstance(session_locations, str) else [loc.strip().upper() for loc in session_locations if loc.strip()]

    if user_allowed_locations and location.strip().upper() not in user_allowed_locations:
        return {"batches": []}

    batches = db.query(distinct(FloorBalance.batch_number)).filter(
        FloorBalance.company_id == company_code,
        func.trim(FloorBalance.production_for) == func.trim(production_for),
        func.upper(func.trim(FloorBalance.location)) == location.strip().upper(),
        FloorBalance.variety == "HOSO",
        FloorBalance.available_qty > 0.01
    ).order_by(FloorBalance.batch_number).all()
    return {"batches": [b[0] for b in batches if b[0]]}

@router.get("/get_hoso/{production_for}/{location}/{batch}")
def get_hoso_counts(production_for: str, location: str, batch: str, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code: return {"counts": []}

    global_p_for, global_loc = get_global_filters(request)
    if global_p_for: production_for = global_p_for
    if global_loc: location = global_loc

    session_locations = request.session.get("allowed_locations", [])
    user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()] if isinstance(session_locations, str) else [loc.strip().upper() for loc in session_locations if loc.strip()]

    if user_allowed_locations and location.strip().upper() not in user_allowed_locations:
        return {"counts": []}

    counts = db.query(distinct(FloorBalance.count)).filter(
        FloorBalance.company_id == company_code,
        FloorBalance.batch_number == batch,
        func.trim(FloorBalance.production_for) == func.trim(production_for),
        func.upper(func.trim(FloorBalance.location)) == location.strip().upper(),
        FloorBalance.variety == "HOSO",
        FloorBalance.available_qty > 0.01
    ).order_by(FloorBalance.count).all()
    return {"counts": [c[0] for c in counts if c[0]]}

@router.get("/get_rate/{contractor}")
def get_contractor_rate(contractor: str, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    row = db.query(peeling_rates).filter(
        peeling_rates.contractor_name == contractor, peeling_rates.variety_name == "HOSO", peeling_rates.company_id == company_code
    ).order_by(peeling_rates.effective_from.desc()).first()
    return {"rate": float(row.rate) if row else 0}


# =====================================================
# ACTION: SAVE DE-HEADING (⚡ ATOMIC DUAL MUTATION LOCK)
# =====================================================
@router.post("/de_heading")
def save_de_heading(
    request: Request, db: Session = Depends(get_db), 
    production_for: str = Form(...), deheading_at: str = Form(...), 
    batch_number: str = Form(...), hoso_count: str = Form(...), 
    species: str = Form(...), hoso_qty: float = Form(...), 
    hlso_qty: float = Form(...), yield_percent: str = Form(...), 
    contractor: str = Form(...), rate_per_kg: float = Form(...), 
    amount: float = Form(...)
):
    company_code = request.session.get("company_code")
    email = request.session.get("email")
    if not company_code: return JSONResponse({"error": "Unauthorized"}, status_code=401)

    clean_batch = str(batch_number).strip()
    clean_count = str(hoso_count).strip()

    # Lock HOSO row for accurate availability validation bounds
    live_record = db.query(FloorBalance.available_qty).filter(
        FloorBalance.company_id == company_code, FloorBalance.location == deheading_at,
        FloorBalance.batch_number == clean_batch, FloorBalance.count == clean_count,
        FloorBalance.species == species, FloorBalance.variety == "HOSO",
        FloorBalance.production_for == production_for
    ).with_for_update().first()
    
    avail = live_record[0] if live_record else 0.0
    if hoso_qty > (avail + 0.1):
        return JSONResponse({"error": f"Insufficient HOSO live balance. Available: {round(avail, 2)}"}, status_code=400)

    try: clean_yield = float(str(yield_percent).replace('%', ''))
    except: clean_yield = 0.0

    current_ist = ist_now()

    new_entry = DeHeading(
        production_for=production_for, peeling_at=deheading_at, batch_number=clean_batch, hoso_count=clean_count,
        species=species, hoso_qty=hoso_qty, hlso_qty=hlso_qty, yield_percent=clean_yield,
        contractor=contractor, rate_per_kg=rate_per_kg, amount=amount, 
        date=current_ist.date(), time=current_ist.time(), email=email, company_id=company_code
    )
    db.add(new_entry)

    # 🟢 ⚡ 1. Deduct HOSO from running floor balance row cleanly
    update_floor_balance_row(
        db, company_code, clean_batch, clean_count, species, "HOSO", 
        deheading_at, production_for, qty_delta=-hoso_qty, email=email
    )

    # 🟢 ⚡ 2. Add newly generated HLSO stock cleanly to running balance row
    update_floor_balance_row(
        db, company_code, clean_batch, clean_count, species, "HLSO", 
        deheading_at, production_for, qty_delta=hlso_qty, email=email
    )

    # 🟢 ⚡ 3. Synchronize pool *after* successful floor balance state mutations
    add_deheading_to_grading_pool(db, new_entry)

    db.commit()
    return RedirectResponse("/processing/de_heading", status_code=303)


# =====================================================
# ACTION: DELETE DE-HEADING (⚡ ATOMIC REVERSE CONVERSIONS)
# =====================================================
@router.post("/de_heading/delete/{id}")
def delete_de_heading(id: int, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    email = request.session.get("email")
    if not company_code: return JSONResponse({"error": "Unauthorized"}, status_code=401)
    
    row = db.query(DeHeading).filter(DeHeading.id == id, DeHeading.company_id == company_code).with_for_update().first()
    if not row:
        return JSONResponse({"error": "Record not found"}, status_code=404)
        
    remove_deheading_from_grading_pool(db, row)
    
    # 🟢 ⚡ Full Dual Inventory Stock Inverse Reversals Execution
    # 1. HOSO back (+ Delta)
    update_floor_balance_row(
        db, company_code, row.batch_number, row.hoso_count, row.species, "HOSO", 
        row.peeling_at, row.production_for, qty_delta=row.hoso_qty, email=email
    )

    # 2. Generated HLSO removed (- Delta)
    update_floor_balance_row(
        db, company_code, row.batch_number, row.hoso_count, row.species, "HLSO", 
        row.peeling_at, row.production_for, qty_delta=-row.hlso_qty, email=email
    )

    db.delete(row)
    db.commit()
    return JSONResponse({"status": "ok"})