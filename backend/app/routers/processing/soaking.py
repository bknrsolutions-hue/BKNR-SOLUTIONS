import json
import re
from fastapi import APIRouter, Request, Form, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct, cast, String, Integer
from datetime import date, datetime

from app.database import get_db
from app.database.models.processing import Soaking
from app.database.models.reprocess import Reprocess
from app.database.models.floor_balance import FloorBalance  # Live Running Stock Table
from app.database.models.criteria import (
    varieties, species, chemicals, production_at, production_for as ProductionForMaster
)

from app.utils.timezone import ist_now 
from app.utils.global_filters import get_global_filters
from app.services.floor_balance import get_floor_balance
from app.utils.edit_lock import is_edit_locked, edit_lock_message

router = APIRouter(tags=["SOAKING"]) 
templates = Jinja2Templates(directory="app/templates")

def get_cached_masters(db: Session, company_id: str, force_refresh: bool = False):
    v_list = [v[0] for v in db.query(varieties.variety_name).filter(varieties.company_id == company_id).all() if v[0]]
    s_list = [s[0] for s in db.query(species.species_name).filter(species.company_id == company_id).all() if s[0]]
    c_list = [c[0] for c in db.query(chemicals.chemical_name).filter(chemicals.company_id == company_id).all() if c[0]]
    pf_list = [pf[0] for pf in db.query(distinct(ProductionForMaster.production_for)).filter(ProductionForMaster.company_id == company_id).order_by(ProductionForMaster.production_for).all() if pf[0]]
    return {"varieties": v_list, "species": s_list, "chemicals": c_list, "prod_for_list": pf_list}


# =====================================================
# 🔥 CENTRALIZED ATOMIC INVENTORY ENGINE (⚡ WITH REJECTION TRACKING)
# =====================================================
def update_floor_balance_row(
    db: Session, company_id: str, batch: str, count: str, species_val: str, 
    variety: str, location: str, production_for: str, qty_delta: float, 
    rejection_delta: float = 0.0, email: str = None
):
    """
    1. with_for_update() Row Lock applied natively.
    2. ⚡ Issue 2 Fix: Available Qty తో పాటు Rejection Qty ని కూడా ఇక్కడే అటామిక్ గా ట్రాక్ చేస్తున్నాం.
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
        row.available_qty += qty_delta
        # టేబుల్ లో నువ్వు యాడ్ చేయమన్న rejection_qty_total ని ఇక్కడే అప్‌డేట్ చేస్తున్నాం అన్నా
        if hasattr(row, 'rejection_qty_total'):
            row.rejection_qty_total += rejection_delta
        row.last_updated = now_ist
        if email:
            row.email = email
    else:
        if qty_delta < 0:
            raise HTTPException(status_code=400, detail="Target live stock record row not found for deduction.")
            
        new_row = FloorBalance(
            company_id=company_id, location=location.strip().upper(),
            production_for=production_for, batch_number=batch.strip(),
            source_type="RMP", species=species_val, variety=variety, count=count.strip(),
            available_qty=qty_delta, 
            rejection_qty_total=rejection_delta,  # Initialize Rejection Qty Column
            last_transaction="SOAKING_MUTATION",
            last_updated=now_ist, date=str(now_ist.date()), time=str(now_ist.time()), email=email
        )
        db.add(new_row)


# =====================================================
# SHOW PAGE: 100% BLIND DIRECT READ FROM LIVE STOCK (⚡ ~20ms)
# =====================================================
@router.get("/soaking", response_class=HTMLResponse)
def show_soaking(request: Request, db: Session = Depends(get_db)):
    global_production_for, global_location = get_global_filters(request)
    company_id = request.session.get("company_code")
    email = request.session.get("email")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=303)

    now_ist = ist_now()
    current_date = now_ist.date()

    session_locations = request.session.get("allowed_locations", [])
    if isinstance(session_locations, str):
        user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()]
    else:
        user_allowed_locations = [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]

    masters = get_cached_masters(db, company_id)
    
    pl_q = db.query(production_at.production_at).filter(production_at.company_id == company_id)
    if user_allowed_locations:
        pl_q = pl_q.filter(func.upper(func.trim(production_at.production_at)).in_(user_allowed_locations))
    prod_locs = [p[0] for p in pl_q.order_by(production_at.production_at).all() if p[0]]

    # Recent Log Table limited to 100 rows
    today_q = db.query(Soaking).filter(Soaking.company_id == company_id, Soaking.date == current_date)
    if global_production_for:
        today_q = today_q.filter(func.trim(Soaking.production_for) == func.trim(global_production_for))
    if global_location:
        today_q = today_q.filter(func.trim(Soaking.production_at) == func.trim(global_location))
    elif user_allowed_locations:
        today_q = today_q.filter(func.upper(func.trim(Soaking.production_at)).in_(user_allowed_locations))
        
    today_data = today_q.order_by(Soaking.id.desc()).limit(100).all()

    # ⚡ PURE INDEX DRIVE: No Full Table Scans of Soaking Table
    live_q = db.query(FloorBalance).filter(FloorBalance.company_id == company_id)

    if global_production_for:
        live_q = live_q.filter(func.trim(FloorBalance.production_for) == func.trim(global_production_for))
    if global_location:
        live_q = live_q.filter(func.upper(func.trim(FloorBalance.location)) == global_location.strip().upper())
    elif user_allowed_locations:
        live_q = live_q.filter(func.upper(func.trim(FloorBalance.location)).in_(user_allowed_locations))

    live_records = live_q.order_by(FloorBalance.production_for, FloorBalance.location, FloorBalance.batch_number).all()

    # 🟢 ⚡ 100% REMOVED THE HEAVY GROUP_BY SOAKING QUERY. 
    # ఇప్పుడు ఇన్ఫర్మేషన్ మొత్తం డైరెక్ట్ గా FloorBalance లోని కాలమ్ నుంచే వస్తుంది!
    rows_batch = []
    for r in live_records:
        rej_qty = getattr(r, 'rejection_qty_total', 0.0) or 0.0
        available_qty = get_floor_balance(
            db, company_id, r.location, r.batch_number, r.count, r.species,
            r.variety, r.production_for, r.source_type or "RMP"
        )
        if available_qty <= 0.01:
            continue

        rows_batch.append({
            "batch": r.batch_number or "N/A",
            "variety": r.variety or "N/A",
            "count": r.count or "N/A",
            "species": r.species or "N/A",
            "production_for": r.production_for or "General Stock",
            "location": r.location or "Floor",
            "rejection_qty": round(rej_qty, 2),
            "available_qty": round(available_qty, 2),
        })

    return templates.TemplateResponse(
        request=request, name="processing/soaking.html",
        context={
            "varieties": masters["varieties"], "species": masters["species"], "chemicals": masters["chemicals"],
            "production_locations": prod_locs, "prod_for_list": masters["prod_for_list"], "today_data": today_data,
            "rows_batch": rows_batch, "global_production_for": global_production_for or "", "global_location": global_location or ""
        }
    )


# =====================================================
# API LOOKUPS
# =====================================================
@router.get("/soaking/get_count/{batch}")
def get_count(batch: str, production_for: str = Query(None), location: str = Query(None), request: Request = None, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id: return {"counts": []}
    global_production_for, global_location = get_global_filters(request)
    production_for = global_production_for or production_for
    location = global_location or location

    counts_q = db.query(FloorBalance).filter(
        FloorBalance.company_id == company_id,
        func.upper(func.trim(FloorBalance.batch_number)) == batch.strip().upper(),
        FloorBalance.count.isnot(None),
        cast(FloorBalance.count, String) != "N/A"
    )
    if production_for:
        counts_q = counts_q.filter(func.upper(func.trim(FloorBalance.production_for)) == production_for.strip().upper())
    if location:
        counts_q = counts_q.filter(func.upper(func.trim(FloorBalance.location)) == location.strip().upper())

    rows = counts_q.order_by(FloorBalance.count).all()
    counts = {
        r.count for r in rows
        if r.count and get_floor_balance(db, company_id, r.location, r.batch_number, r.count, r.species, r.variety, r.production_for, r.source_type or "RMP") > 0.01
    }
    return {"counts": sorted(counts)}

@router.get("/soaking/get_available_qty")
def get_available_qty_api(location: str, batch: str, count: str, species: str, variety: str, production_for: str = Query(None), request: Request = None, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    global_production_for, global_location = get_global_filters(request)
    production_for = global_production_for or production_for
    location = global_location or location

    query = db.query(FloorBalance.source_type).filter(
        FloorBalance.company_id == company_id,
        func.upper(func.trim(FloorBalance.location)) == location.strip().upper(),
        func.upper(func.trim(FloorBalance.batch_number)) == batch.strip().upper(),
        func.upper(func.trim(FloorBalance.count)) == count.strip().upper(),
        func.upper(func.trim(FloorBalance.species)) == species.strip().upper(),
        func.upper(func.trim(FloorBalance.variety)) == variety.strip().upper()
    )
    if production_for:
        query = query.filter(func.upper(func.trim(FloorBalance.production_for)) == production_for.strip().upper())
    source_row = query.first()
    available_qty = get_floor_balance(
        db, company_id, location, batch, count, species, variety,
        production_for, source_row[0] if source_row else "RMP"
    )
    return {"available_qty": round(available_qty, 2)}

@router.get("/soaking/get_batches_by_company")
def get_batches_by_company(prod_for: str, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id or not prod_for: return {"batches": []}
    global_production_for, global_location = get_global_filters(request)
    prod_for = global_production_for or prod_for

    session_locations = request.session.get("allowed_locations", [])
    user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()] if isinstance(session_locations, str) else [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]
    batch_q = db.query(FloorBalance).filter(FloorBalance.company_id == company_id, FloorBalance.production_for == prod_for)
    if global_location:
        batch_q = batch_q.filter(func.upper(func.trim(FloorBalance.location)) == global_location.strip().upper())
    if user_allowed_locations:
        batch_q = batch_q.filter(func.upper(func.trim(FloorBalance.location)).in_(user_allowed_locations))
    rows = batch_q.order_by(FloorBalance.batch_number).all()
    batches = {
        r.batch_number for r in rows
        if r.batch_number and get_floor_balance(db, company_id, r.location, r.batch_number, r.count, r.species, r.variety, r.production_for, r.source_type or "RMP") > 0.01
    }
    return {"batches": sorted(batches)}


# =====================================================
# SAVE / UPDATE / DELETE
# =====================================================
@router.post("/soaking")
def save_soaking(
    request: Request, db: Session = Depends(get_db),
    sintex_number: str = Form(None), batch_number: str = Form(...), 
    variety_name: str = Form(...), in_count: str = Form(...), 
    in_qty: float = Form(0), rejection_qty: float = Form(0),
    rejection_for: str = Form(None), chemical_name: str = Form(...), 
    chemical_percent: float = Form(0), salt_percent: float = Form(0), 
    species_name: str = Form(None), production_at: str = Form(...), 
    production_for: str = Form(...)
):
    email = request.session.get("email")
    company_id = request.session.get("company_code")
    
    clean_count = in_count.strip()
    clean_batch = batch_number.strip()

    # Row Lock Row on Validation Base
    live_record = db.query(FloorBalance.source_type).filter(
        FloorBalance.company_id == company_id, FloorBalance.location == production_at,
        FloorBalance.batch_number == clean_batch, FloorBalance.count == clean_count,
        FloorBalance.species == species_name, FloorBalance.variety == variety_name,
        FloorBalance.production_for == production_for
    ).with_for_update().first()
    
    avail = get_floor_balance(
        db, company_id, production_at, clean_batch, clean_count, species_name,
        variety_name, production_for, live_record[0] if live_record else "RMP"
    )

    if in_qty > (avail + 0.05):
        return JSONResponse({"error": f"Insufficient live balance. Available: {avail}"}, status_code=400)

    current_ist = ist_now()
    today_dt = current_ist.date()

    if rejection_qty > 0 and in_qty == 0:
        final_sintex = None
    else:
        last_entry = db.query(Soaking).filter(Soaking.company_id == company_id, Soaking.date == today_dt, Soaking.sintex_number.isnot(None)).order_by(Soaking.id.desc()).first()
        final_sintex = str(int(last_entry.sintex_number) + 1) if last_entry and str(last_entry.sintex_number).isdigit() else "1"

    entry = Soaking(
        sintex_number=final_sintex, batch_number=clean_batch, variety_name=variety_name, 
        in_count=clean_count, in_qty=in_qty, rejection_qty=rejection_qty, 
        rejection_for=rejection_for, chemical_name=chemical_name, chemical_percent=chemical_percent,
        chemical_qty=round(in_qty * chemical_percent / 100, 2), salt_percent=salt_percent, 
        salt_qty=round(in_qty * salt_percent / 100, 2), species=species_name, 
        production_at=production_at, production_for=production_for, company_id=company_id, 
        email=email, date=today_dt, time=current_ist.time(), status="Pending"
    )
    db.add(entry)

    # ⚡ Atomic Update Engine Trigger (Deduct Stock & Accumulate Rejection)
    update_floor_balance_row(
        db, company_id, clean_batch, clean_count, species_name, variety_name, 
        production_at, production_for, qty_delta=-in_qty, rejection_delta=rejection_qty, email=email
    )

    db.commit()
    return RedirectResponse("/processing/soaking", status_code=303)


@router.post("/soaking/update/{id}")
def update_soaking(
    id: int, request: Request, db: Session = Depends(get_db),
    sintex_number: str = Form(None), batch_number: str = Form(...), 
    variety_name: str = Form(...), in_count: str = Form(...), 
    in_qty: float = Form(0), rejection_qty: float = Form(0),
    rejection_for: str = Form(None), chemical_name: str = Form(...), 
    chemical_percent: float = Form(0), salt_percent: float = Form(0), 
    species_name: str = Form(None), production_at: str = Form(...), 
    production_for: str = Form(...)
):
    email = request.session.get("email")
    company_id = request.session.get("company_code")
    
    row = db.query(Soaking).filter(Soaking.id == id, Soaking.company_id == company_id).with_for_update().first()
    if not row:
        return JSONResponse({"error": "Log record data stream not found"}, status_code=404)
    if is_edit_locked(request, row.date):
        return JSONResponse({"error": edit_lock_message()}, status_code=403)

    # ⚡ Issue 1 Fix: species & variety పక్కాగా యాడ్ చేసి Row Mismatch బగ్‌ను పూర్తిగా క్లియర్ చేశాం అన్నా!
    is_same_row = (
        row.batch_number == batch_number.strip() and 
        row.in_count == in_count.strip() and 
        row.species == species_name and 
        row.variety_name == variety_name and 
        row.production_at == production_at and 
        row.production_for == production_for
    )

    # Target Validation lookup safely
    target_record = db.query(FloorBalance.source_type).filter(
        FloorBalance.company_id == company_id, FloorBalance.location == production_at,
        FloorBalance.batch_number == batch_number.strip(), FloorBalance.count == in_count.strip(),
        FloorBalance.species == species_name, FloorBalance.variety == variety_name,
        FloorBalance.production_for == production_for
    ).with_for_update().first()
    
    current_bal = get_floor_balance(
        db, company_id, production_at, batch_number.strip(), in_count.strip(), species_name,
        variety_name, production_for, target_record[0] if target_record else "RMP"
    )
    virtual_avail = (current_bal + row.in_qty) if is_same_row else current_bal

    if in_qty > (virtual_avail + 0.05):
        return JSONResponse({"error": f"Insufficient live balance for updated values. Available: {virtual_avail}"}, status_code=400)

    # Step 1: Refund Old State safely (Reverse stock & Rejection)
    update_floor_balance_row(
        db, company_id, row.batch_number, row.in_count, row.species, row.variety_name,
        row.production_at, row.production_for, qty_delta=row.in_qty, rejection_delta=-row.rejection_qty, email=email
    )

    # Step 2: Apply changes to transaction row log
    row.sintex_number = sintex_number if not (rejection_qty > 0 and in_qty == 0) else None
    row.batch_number = str(batch_number).strip()
    row.variety_name = variety_name
    row.in_count = str(in_count).strip()
    row.in_qty = in_qty
    row.rejection_qty = rejection_qty
    row.rejection_for = rejection_for
    row.chemical_name = chemical_name
    row.chemical_percent = chemical_percent
    row.chemical_qty = round(in_qty * chemical_percent / 100, 2)
    row.salt_percent = salt_percent
    row.salt_qty = round(in_qty * salt_percent / 100, 2)
    row.species = species_name
    row.production_at = production_at
    row.production_for = production_for  

    # Step 3: Deduct New State
    update_floor_balance_row(
        db, company_id, row.batch_number, row.in_count, row.species, row.variety_name,
        row.production_at, row.production_for, qty_delta=-in_qty, rejection_delta=rejection_qty, email=email
    )

    db.commit()
    return RedirectResponse("/processing/soaking", status_code=303)


@router.post("/soaking/delete/{id}")
def delete_soaking(id: int, request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    company_id = request.session.get("company_code")
    
    row = db.query(Soaking).filter(Soaking.id == id, Soaking.company_id == company_id).with_for_update().first()
    if row:
        if is_edit_locked(request, row.date):
            return JSONResponse({"error": edit_lock_message()}, status_code=403)
        # Full stack reverse automation refund processing
        update_floor_balance_row(
            db, company_id, row.batch_number, row.in_count, row.species, row.variety_name,
            row.production_at, row.production_for, qty_delta=row.in_qty, rejection_delta=-row.rejection_qty, email=email
        )
        db.delete(row)
        db.commit()
    return JSONResponse({"status": "ok"})
