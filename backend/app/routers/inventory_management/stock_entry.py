import json
import re
from fastapi import APIRouter, Request, Form, Depends, HTTPException, Query
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, case, distinct, and_
from datetime import datetime, timedelta, date
from app.utils.timezone import ist_now
from typing import Optional
from app.services.floor_balance_sync import refresh_floor_balance

from app.database import get_db
from app.database.models.inventory_management import stock_entry, pending_orders
from app.database.models.processing import GateEntry
from app.database.models.reprocess import Reprocess
from app.database.models.criteria import (
    brands, glazes, varieties, grades, packing_styles, freezers,
    production_types, purposes, production_at, production_for,
    coldstore_locations, species as species_model
)

from app.services.inventory_summary_service import InventorySummaryService
from app.services.production_requirements_service import ProductionRequirementService
from app.utils.global_filters import get_global_filters
from app.services.cache import invalidate_company_cache

router = APIRouter(prefix="/inventory", tags=["STOCK ENTRY"])
templates = Jinja2Templates(directory="app/templates")


# -----------------------------------------------------
# HELPER: EXTRACT NUMERIC VALUE FROM STRING
# -----------------------------------------------------
def extract_number(value, default=0):
    if not value:
        return default
    match = re.search(r'(\d+\.?\d*)', str(value))
    return float(match.group(1)) if match else default


# -----------------------------------------------------
# LOAD STOCK ENTRY PAGE (STRICT MULTI-LAYER FILTER SYNC)
# -----------------------------------------------------
@router.get("/stock_entry", response_class=HTMLResponse)
def stock_entry_page(request: Request, db: Session = Depends(get_db)):
    # 1. FETCH UNIVERSAL GLOBAL FILTERS FROM RUNTIME CONTEXT
    global_production_for, global_location = get_global_filters(request)

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/auth/login", status_code=302)
    
    # FETCH USER PERMITTED COLDSTORE LOCATIONS MULTI-PERMISSION CHECK
    session_locations = request.session.get("allowed_locations", [])
    if isinstance(session_locations, str):
        user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()]
    else:
        user_allowed_locations = [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]

    # 2. Today's entries layered with global filters scope controls
    table_q = db.query(stock_entry).filter(
        stock_entry.company_id == company_code,
        stock_entry.date == date.today()
    )
    if global_production_for:
        table_q = table_q.filter(func.trim(stock_entry.production_for) == func.trim(global_production_for))
    if global_location:
        table_q = table_q.filter(func.upper(func.trim(stock_entry.production_at)) == global_location.strip().upper())
    elif user_allowed_locations:
        table_q = table_q.filter(func.upper(func.trim(stock_entry.production_at)).in_(user_allowed_locations))
        
    table_data = table_q.order_by(stock_entry.id.desc()).all()

    # 3. Fetching Regular Batches from Gate Entry
    batches_raw = db.query(
        GateEntry.batch_number, GateEntry.production_for, GateEntry.receiving_center 
    ).filter(GateEntry.company_id == company_code).distinct().all()
    
    batch_data_list = [
        {
            "batch_number": b.batch_number,
            "production_for": b.production_for,
            "production_at": b.receiving_center 
        } for b in batches_raw if b.batch_number
    ]

    # 4. Adding Reprocess Batches
    repro_batches = db.query(
        Reprocess.new_batch_id, Reprocess.production_for, Reprocess.production_at
    ).filter(Reprocess.company_id == company_code).distinct().all()

    for rb in repro_batches:
        if rb.new_batch_id:
            batch_data_list.append({
                "batch_number": rb.new_batch_id,
                "production_for": rb.production_for,
                "production_at": rb.production_at
            })

    # Company dropdown filters bound correctly
    pf_q = db.query(production_for.production_for).filter(production_for.company_id == company_code)
    if global_production_for:
        pf_q = pf_q.filter(func.trim(production_for.production_for) == func.trim(global_production_for))
    
    production_for_unique = sorted({
        p.production_for for p in pf_q.distinct().all() if p.production_for
    })

    species_list = [
        s.species_name for s in db.query(species_model)
        .filter(species_model.company_id == company_code).order_by(species_model.species_name).all()
    ]

    # "Production At" (Second Column Dropdown) layout control synced with Global Location
    pa_q = db.query(production_at.production_at).filter(production_at.company_id == company_code)
    if global_location:
        pa_q = pa_q.filter(func.upper(func.trim(production_at.production_at)) == global_location.strip().upper())
    elif user_allowed_locations:
        pa_q = pa_q.filter(func.upper(func.trim(production_at.production_at)).in_(user_allowed_locations))
    production_places_list = [p.production_at for p in pa_q.order_by(production_at.production_at).all()]

    # Initial Coldstore Locations dropdown loading by selected/global Production At.
    cl_q = db.query(coldstore_locations.coldstore_location).filter(coldstore_locations.company_id == company_code)
    if global_location:
        cl_q = cl_q.filter(func.upper(func.trim(coldstore_locations.production_at)) == global_location.strip().upper())
        
    coldstore_list = [l.coldstore_location for l in cl_q.order_by(coldstore_locations.coldstore_location).all()]

    success_msg = request.session.pop("success_msg", None)

    context = {
        "success_msg": success_msg,
        "table_data": table_data,
        "batch_data_list": batch_data_list,
        "species": species_list,
        "brands": [b.brand_name for b in db.query(brands).filter(brands.company_id == company_code)],
        "production_for_list": production_for_unique,
        "glazes": [g.glaze_name for g in db.query(glazes).filter(glazes.company_id == company_code)],
        "varieties": [v.variety_name for v in db.query(varieties).filter(varieties.company_id == company_code)],
        "grades": [g.grade_name for g in db.query(grades).filter(grades.company_id == company_code)],
        "freezers": [f.freezer_name for f in db.query(freezers).filter(freezers.company_id == company_code)],
        "production_types": [p.production_type for p in db.query(production_types).filter(production_types.company_id == company_code)],
        "purposes": [p.purpose_name for p in db.query(purposes).filter(purposes.company_id == company_code)],
        "production_places": production_places_list,
        "locations": coldstore_list,
        "packing_styles": db.query(packing_styles).filter(packing_styles.company_id == company_code).all(),
        "po_numbers": [p.po_number for p in db.query(pending_orders.po_number).filter(pending_orders.company_id == company_code).distinct().order_by(pending_orders.po_number)],
        "global_production_for": global_production_for or "",
        "global_location": global_location or ""
    }

    return templates.TemplateResponse(
        request=request, name="inventory_management/stock_entry.html", context=context
    )


# -----------------------------------------------------
# 🟢 🔴 NEW: DYNAMIC COLDSTORE LOOKUP BY PLANT (PRODUCTION AT) ONLY
# -----------------------------------------------------
@router.get("/get_matched_coldstores")
def get_matched_coldstores(
    request: Request, 
    production_at: str = Query(...), 
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")
    if not company_code:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    # Multi-permission applies to plant/production_at, not coldstore location names.
    session_locations = request.session.get("allowed_locations", [])
    if isinstance(session_locations, str):
        user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()]
    else:
        user_allowed_locations = [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]

    if user_allowed_locations and production_at.strip().upper() not in user_allowed_locations:
        return JSONResponse({"locations": []})

    # Coldstore names are looked up only by the selected plant / production_at.
    query = db.query(coldstore_locations.coldstore_location).filter(
        coldstore_locations.company_id == company_code,
        func.upper(func.trim(coldstore_locations.production_at)) == production_at.strip().upper()
    )

    matched_rows = query.order_by(coldstore_locations.coldstore_location).all()
    loc_list = [r.coldstore_location for r in matched_rows]

    return JSONResponse({"locations": loc_list})
# -----------------------------------------------------
# SAVE STOCK IN
# -----------------------------------------------------
@router.post("/stock_entry")
def save_stock_in(
    request: Request, db: Session = Depends(get_db), batch_number: str = Form(...),
    type_of_production: str = Form(...), location: str = Form(...), brand: str = Form(...),
    production_for: str = Form(""), freezer: str = Form(...), packing_style: str = Form(...),
    glaze: str = Form(...), species: str = Form(...), variety: str = Form(...),
    grade: str = Form(...), no_of_mc: int = Form(...), loose: int = Form(...),
    production_at: str = Form(...), purpose: str = Form(""), po_number: str = Form(""),
):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/auth/login", status_code=302)

    coldstore_exists = db.query(coldstore_locations.id).filter(
        coldstore_locations.company_id == company_code,
        func.upper(func.trim(coldstore_locations.coldstore_location)) == location.strip().upper(),
        func.upper(func.trim(coldstore_locations.production_at)) == production_at.strip().upper(),
    ).first()
    if not coldstore_exists:
        request.session["success_msg"] = "Invalid coldstore location for selected Production At."
        return RedirectResponse("/inventory/stock_entry", status_code=303)

    pack = db.query(packing_styles).filter(
        packing_styles.company_id == company_code,
        packing_styles.packing_style == packing_style
    ).first()

    mc_weight = pack.mc_weight if pack else 0
    slab_weight = pack.slab_weight if pack else 0
    quantity = (no_of_mc * mc_weight) + (loose * slab_weight)

    entry = stock_entry(
        batch_number=batch_number, type_of_production=type_of_production, cargo_movement_type="IN",
        location=location, brand=brand, freezer=freezer, packing_style=packing_style, glaze=glaze,
        species=species, variety=variety, grade=grade, no_of_mc=no_of_mc, loose=loose, quantity=quantity,
        purpose=purpose or None, po_number=po_number or None, production_at=production_at,
        production_for=production_for or None, email=email, company_id=company_code,
        date=date.today(), time=ist_now().time()
    )
    db.add(entry)
    db.commit()
    
    InventorySummaryService.refresh_inventory_summary(db=db, company_id=company_code)
    ProductionRequirementService.refresh_requirements(db=db, company_id=company_code)
    invalidate_company_cache(company_code, "inventory_report")
    invalidate_company_cache(company_code, "inventory_dashboard")
    invalidate_company_cache(company_code, "costing_dashboard")

    request.session["success_msg"] = f"Stock In Entry for Batch {batch_number} Saved Successfully!"
    return RedirectResponse("/inventory/stock_entry", status_code=303)


# -----------------------------------------------------
# AVAILABLE STOCK REPORT (AJAX WITH SECURITY HOOK)
# -----------------------------------------------------
@router.get("/stock_out_report")
def stock_out_report(
    request: Request, db: Session = Depends(get_db), production_for: str = "", brand: str = "",
    production_at: str = "", freezer: str = "", packing_style: str = "", glaze: str = "",
    species: str = "", variety: str = "", grade: str = "",
):
    company_code = request.session.get("company_code")

    session_locations = request.session.get("allowed_locations", [])
    user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()] if isinstance(session_locations, str) else [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]

    query = db.query(
        stock_entry.location, stock_entry.batch_number,
        func.sum(case((stock_entry.cargo_movement_type == "IN", stock_entry.no_of_mc), else_=-stock_entry.no_of_mc)).label("available_mc"),
        func.sum(case((stock_entry.cargo_movement_type == "IN", stock_entry.loose), else_=-stock_entry.loose)).label("available_loose"),
    ).filter(stock_entry.company_id == company_code)

    if user_allowed_locations:
        query = query.filter(func.upper(func.trim(stock_entry.production_at)).in_(user_allowed_locations))

    if production_for: query = query.filter(stock_entry.production_for == production_for)
    if brand: query = query.filter(stock_entry.brand == brand)
    if production_at: query = query.filter(stock_entry.production_at == production_at)
    if freezer: query = query.filter(stock_entry.freezer == freezer)
    if packing_style: query = query.filter(stock_entry.packing_style == packing_style)
    if glaze: query = query.filter(stock_entry.glaze == glaze)
    if species: query = query.filter(stock_entry.species == species)
    if variety: query = query.filter(stock_entry.variety == variety)
    if grade: query = query.filter(stock_entry.grade == grade)

    rows = query.group_by(stock_entry.location, stock_entry.batch_number).having(
        (func.sum(case((stock_entry.cargo_movement_type == "IN", stock_entry.no_of_mc), else_=-stock_entry.no_of_mc)) > 0) |
        (func.sum(case((stock_entry.cargo_movement_type == "IN", stock_entry.loose), else_=-stock_entry.loose)) > 0)
    ).all()

    return JSONResponse([
        {"location": r.location, "batch": r.batch_number, "mc": int(r.available_mc or 0), "loose": int(r.available_loose or 0)}
        for r in rows
    ])


# -----------------------------------------------------
# SAVE STOCK OUT
# -----------------------------------------------------
@router.post("/stock_out_save")
def stock_out_save(
    request: Request, db: Session = Depends(get_db), production_for: str = Form(""),
    brand: str = Form(...), production_at: str = Form(...), freezer: str = Form(...),
    packing_style: str = Form(...), glaze: str = Form(...), species: str = Form(...),
    variety: str = Form(...), grade: str = Form(...), purpose: str = Form(""), po_number: str = Form(""),
    out_batch: list[str] = Form([]), out_location: list[str] = Form([]),
    out_mc: list[int] = Form([]), out_loose: list[int] = Form([]),
):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/auth/login", status_code=302)

    pack = db.query(packing_styles).filter(
        packing_styles.company_id == company_code,
        packing_styles.packing_style == packing_style
    ).first()
    
    mc_weight = pack.mc_weight if pack else 0
    slab_weight = pack.slab_weight if pack else 0
    now = ist_now()

    for i in range(len(out_batch)):
        mc_val = int(out_mc[i]) if out_mc[i] else 0
        ls_val = int(out_loose[i]) if out_loose[i] else 0
        
        if mc_val <= 0 and ls_val <= 0:
            continue

        calculated_qty = (mc_val * mc_weight) + (ls_val * slab_weight)

        entry = stock_entry(
            batch_number=out_batch[i], cargo_movement_type="OUT", location=out_location[i],
            brand=brand, freezer=freezer, packing_style=packing_style, glaze=glaze, species=species,
            variety=variety, grade=grade, no_of_mc=mc_val, loose=ls_val, quantity=calculated_qty,
            production_at=production_at, production_for=production_for or None, purpose=purpose or None,
            po_number=po_number or None, email=email, company_id=company_code,
            date=date.today(), time=now.time()
        )
        db.add(entry)

    db.commit()
    
    InventorySummaryService.refresh_inventory_summary(db=db, company_id=company_code)
    ProductionRequirementService.refresh_requirements(db=db, company_id=company_code)
    invalidate_company_cache(company_code, "inventory_report")
    invalidate_company_cache(company_code, "inventory_dashboard")
    invalidate_company_cache(company_code, "costing_dashboard")
    
    request.session["success_msg"] = "Stock Out Entry Saved Successfully!"
    return RedirectResponse("/inventory/stock_entry", status_code=303)
