import json
import re
from fastapi import APIRouter, Request, Depends, Form, Query, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime, date
from app.utils.timezone import ist_now
from sqlalchemy import func, distinct, or_

from app.database import get_db
from app.database.models.processing import Peeling
from app.database.models.floor_balance import FloorBalance  # Single Point of Live Truth
from app.database.models.criteria import (
    varieties, 
    contractors, 
    peeling_rates, 
    species, 
    peeling_at,
    packing_styles,
    production_for as ProductionForMaster
)
from app.database.models.inventory_management import stock_entry, pending_orders
from app.utils.global_filters import get_global_filters
from app.services.floor_balance import get_floor_balance
from app.utils.edit_lock import is_edit_locked, edit_lock_message

router = APIRouter(tags=["PEELING"])
templates = Jinja2Templates(directory="app/templates")

def get_cached_masters(db: Session, company_id: str, force_refresh: bool = False):
    v_list = [v[0] for v in db.query(varieties.variety_name).filter(varieties.company_id == company_id).order_by(varieties.variety_name).all() if v[0]]
    c_list = [c[0] for c in db.query(contractors.contractor_name).filter(contractors.company_id == company_id).order_by(contractors.contractor_name).all() if c[0]]
    s_list = [s[0] for s in db.query(species.species_name).filter(species.company_id == company_id).order_by(species.species_name).all() if s[0]]
    pf_list = [p[0] for p in db.query(distinct(ProductionForMaster.production_for)).filter(ProductionForMaster.company_id == company_id).all() if p[0]]
    return {"varieties": v_list, "contractors": c_list, "species": s_list, "prod_for_list": pf_list}


# =====================================================
# 🔥 CENTRALIZED ATOMIC INVENTORY ENGINE (WITH NEGATIVE GUARD)
# =====================================================
def update_floor_balance_row(
    db: Session, company_id: str, batch: str, count: str, species_val: str, 
    variety: str, location: str, production_for: str, qty_delta: float, email: str = None
):
    now_ist = ist_now()
    clean_loc = "FLOOR" if not location or location.strip() == "" else location.strip().upper()
    
    row = db.query(FloorBalance).filter(
        FloorBalance.company_id == company_id,
        or_(
            func.upper(func.trim(FloorBalance.location)) == clean_loc,
            func.upper(func.trim(FloorBalance.location)) == "OTHER FLOOR" if clean_loc == "FLOOR" else False
        ),
        FloorBalance.batch_number == batch.strip(),
        FloorBalance.count == count.strip(),
        FloorBalance.species == species_val,
        FloorBalance.variety == variety,
        func.upper(func.trim(FloorBalance.production_for)) == production_for.strip().upper()
    ).with_for_update().first()

    if row:
        if qty_delta < 0 and (row.available_qty + qty_delta) < -0.01:
            raise HTTPException(
                status_code=400, 
                detail=f"Operation rejected. Insufficient balance for {variety}. Available: {row.available_qty}, Needed: {abs(qty_delta)}"
            )
        row.available_qty += qty_delta
        row.last_updated = now_ist
        if email: row.email = email
    else:
        if qty_delta < 0:
            raise HTTPException(status_code=400, detail=f"Target stock row not found for {variety} deduction.")
            
        new_row = FloorBalance(
            company_id=company_id, location=clean_loc, production_for=production_for, 
            batch_number=batch.strip(), source_type="RMP", species=species_val, variety=variety, count=count.strip(),
            available_qty=qty_delta, last_transaction="PEELING_MUTATION",
            last_updated=now_ist, date=str(now_ist.date()), time=str(now_ist.time()), email=email
        )
        db.add(new_row)


# =====================================================
# DASHBOARD PAGE - 100% LIVE SNAPSHOT ENGINE (⚡ ~20ms)
# =====================================================
@router.get("/peeling", response_class=HTMLResponse)
def show_peeling(request: Request, db: Session = Depends(get_db)):
    global_production_for, global_location = get_global_filters(request)
    
    g_prod_clean = global_production_for.strip().upper() if global_production_for else None
    g_loc_clean = global_location.strip().upper() if global_location else None

    email = request.session.get("email")
    company_id = request.session.get("company_code")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=303)
    
    session_locations = request.session.get("allowed_locations", [])
    if isinstance(session_locations, str):
        user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()]
    else:
        user_allowed_locations = [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]
    
    # 1st TABLE: DIRECT FAST INVENTORY READ
    live_q = db.query(FloorBalance).filter(
        FloorBalance.company_id == company_id,
        FloorBalance.variety.ilike("%HLSO%")
    )

    if g_prod_clean and g_prod_clean != "ALL":
        live_q = live_q.filter(func.upper(func.trim(FloorBalance.production_for)) == g_prod_clean)
    
    if g_loc_clean and g_loc_clean != "ALL":
        if g_loc_clean in ["FLOOR", "OTHER FLOOR"]:
            live_q = live_q.filter(or_(
                func.upper(func.trim(FloorBalance.location)) == "FLOOR",
                func.upper(func.trim(FloorBalance.location)) == "OTHER FLOOR",
                FloorBalance.location == None,
                func.trim(FloorBalance.location) == ""
            ))
        else:
            live_q = live_q.filter(func.upper(func.trim(FloorBalance.location)) == g_loc_clean)
    elif user_allowed_locations:
        live_q = live_q.filter(func.upper(func.trim(FloorBalance.location)).in_(user_allowed_locations))

    live_records = live_q.order_by(FloorBalance.production_for, FloorBalance.location, FloorBalance.batch_number).all()
    hlso_floor_balance = []
    for r in live_records:
        available_qty = get_floor_balance(
            db, company_id, r.location, r.batch_number, r.count, r.species,
            r.variety, r.production_for, r.source_type or "RMP"
        )
        if available_qty <= 0.01:
            continue
        hlso_floor_balance.append({
            "batch": r.batch_number or "N/A",
            "variety": r.variety or "N/A",
            "count": r.count or "N/A",
            "species": r.species or "N/A",
            "production_for": r.production_for or "General Stock",
            "location": r.location or "Floor",
            "available_qty": round(available_qty, 2)
        })
    
    # =====================================================
    # 🟢 2nd TABLE: REQUIRED HLSO REQUIREMENTS SYNC LAYER (FIXED LOCATION FILTERS)
    # =====================================================
    po_q = db.query(pending_orders).filter(pending_orders.company_id == company_id)
    stock_q = db.query(stock_entry).filter(stock_entry.company_id == company_id)

    # Production For Filter
    if g_prod_clean and g_prod_clean != "ALL":
        po_q = po_q.filter(func.upper(func.trim(pending_orders.company_name)) == g_prod_clean)
        stock_q = stock_q.filter(func.upper(func.trim(stock_entry.production_for)) == g_prod_clean)

    # Strict Location / Production At Filter
    if g_loc_clean and g_loc_clean != "ALL":
        po_q = po_q.filter(func.upper(func.trim(pending_orders.production_at)) == g_loc_clean)
        stock_q = stock_q.filter(func.upper(func.trim(stock_entry.production_at)) == g_loc_clean)
    elif user_allowed_locations:
        po_q = po_q.filter(func.upper(func.trim(pending_orders.production_at)).in_(user_allowed_locations))
        stock_q = stock_q.filter(func.upper(func.trim(stock_entry.production_at)).in_(user_allowed_locations))
        
    p_orders = po_q.all()
    all_stock = stock_q.all()
    masters = get_cached_masters(db, company_id)
    
    # PERFORMANCE OPTIMIZATION LOCK
    variety_master_map = {
        v.variety_name.lower().strip(): v
        for v in db.query(varieties).filter(varieties.company_id == company_id).all()
    }
    
    stock_pool = {}
    for s in all_stock:
        # 🟢 FIX: Location check in python loop (Using production_at)
        s_loc_clean = str(s.production_at or "").strip().upper()
        
        if user_allowed_locations and s_loc_clean != "FLOOR" and s_loc_clean not in user_allowed_locations:
            continue
        if g_loc_clean and g_loc_clean != "ALL" and s_loc_clean != g_loc_clean:
            continue

        gl_match = re.search(r'(\d+)', str(s.glaze or "0"))
        gl_val = gl_match.group(1) if gl_match else "0"
        key = f"{str(s.production_for or '').strip().upper()}|{str(s.species).strip().lower()}|{str(s.variety).strip().lower()}|{str(s.grade).strip().lower()}|{str(s.packing_style).strip().lower()}|{gl_val}"
        qty = float(s.quantity or 0)
        stock_pool[key] = stock_pool.get(key, 0.0) + (qty if str(s.cargo_movement_type).upper() == "IN" else -qty)

    hlso_summary, drill_down_data = {}, {"hlso": {}}

    for p in p_orders:
        p_var = str(p.variety or "").strip().lower()
        if "hoso" in p_var: continue 

        p_spec, p_grad = str(p.species or "").strip().lower(), str(p.grade or "").strip().lower()
        p_pack = str(p.packing_style or "").strip().lower()
        p_comp = str(p.company_name or "").strip().upper()

        c_gl_match = re.search(r'(\d+)', str(p.count_glaze or "0"))
        c_gl_factor = (100 - float(c_gl_match.group(1))) / 100 if c_gl_match else 1.0
        w_gl_match = re.search(r'(\d+)', str(p.weight_glaze or "0"))
        w_gl_factor = (100 - float(w_gl_match.group(1))) / 100 if w_gl_match else 1.0

        gl_key_val = str(int(float(c_gl_match.group(1)) if c_gl_match else 0))
        exact_key = f"{p_comp}|{p_spec}|{p_var}|{p_grad}|{p_pack}|{gl_key_val}"
        opening_bal = stock_pool.get(exact_key, 0.0)

        mc_wt = 1.0
        ordered_qty = round(mc_wt * float(p.no_of_mc or 0), 2)
        pending_prod = opening_bal - ordered_qty
        stock_pool[exact_key] = pending_prod

        if pending_prod < 0:
            abs_pending = abs(pending_prod)
            
            # O(1) Fast Memory Lookup
            v_data = variety_master_map.get(p_var)
            peeling_y = float(v_data.peeling_yield or 100) / 100 if v_data else 1.0
            soaking_y = float(v_data.soaking_yield or 100) / 100 if v_data else 1.0
            
            net_count = round((float(p.no_of_pieces or 0) / 2.20462) / c_gl_factor, 2) if p.no_of_pieces else 0
            hl_count_calc = round(net_count * peeling_y * soaking_y, 2)
            req_hlso_qty = round((abs_pending * w_gl_factor) / (peeling_y * soaking_y), 2)

            if req_hlso_qty > 0:
                summary_key = f"{p.species}|{p.variety}|{hl_count_calc}"
                if summary_key not in hlso_summary:
                    hlso_summary[summary_key] = {"species": p.species, "variety": p.variety, "count": hl_count_calc, "total_kg": 0}
                    drill_down_data["hlso"][summary_key] = []
                
                hlso_summary[summary_key]["total_kg"] += req_hlso_qty
                drill_down_data["hlso"][summary_key].append({"po_no": p.po_number, "buyer": getattr(p, 'buyer', 'N/A'), "grade": p.grade, "qty": req_hlso_qty})

    # =====================================================
    # 3rd TABLE TABS SYSTEM ALIGNMENT
    # =====================================================
    # Tab 1: Today's Raw Log Logs 
    today_q = db.query(Peeling).filter(Peeling.company_id == company_id, Peeling.date == ist_now().date())
    if g_prod_clean and g_prod_clean != "ALL":
        today_q = today_q.filter(func.upper(func.trim(Peeling.production_for)) == g_prod_clean)
    if g_loc_clean and g_loc_clean != "ALL":
        if g_loc_clean in ["FLOOR", "OTHER FLOOR"]:
            today_q = today_q.filter(or_(func.upper(func.trim(Peeling.peeling_at)) == "FLOOR", func.upper(func.trim(Peeling.peeling_at)) == "OTHER FLOOR", Peeling.peeling_at == None, func.trim(Peeling.peeling_at) == ""))
        else:
            today_q = today_q.filter(func.upper(func.trim(Peeling.peeling_at)) == g_loc_clean)
    elif user_allowed_locations:
        today_q = today_q.filter(func.upper(func.trim(Peeling.peeling_at)).in_(user_allowed_locations))
        
    today_data = today_q.order_by(Peeling.id.desc()).all()

    # Tab 2: Contractor-wise Aggregation Summary Query
    contractor_q = db.query(
        Peeling.contractor_name, 
        func.sum(Peeling.hlso_qty).label("total_hlso"), 
        func.sum(Peeling.peeled_qty).label("total_peeled"), 
        func.sum(Peeling.amount).label("total_amount")
    ).filter(Peeling.company_id == company_id, Peeling.date == ist_now().date())
    
    if g_prod_clean and g_prod_clean != "ALL":
        contractor_q = contractor_q.filter(func.upper(func.trim(Peeling.production_for)) == g_prod_clean)
    if g_loc_clean and g_loc_clean != "ALL":
        contractor_q = contractor_q.filter(func.upper(func.trim(Peeling.peeling_at)) == g_loc_clean)
    elif user_allowed_locations:
        contractor_q = contractor_q.filter(func.upper(func.trim(Peeling.peeling_at)).in_(user_allowed_locations))
        
    contractor_summary_q = contractor_q.group_by(Peeling.contractor_name).all()
    contractor_summary = [{"contractor_name": r[0], "total_hlso": round(r[1] or 0, 2), "total_peeled": round(r[2] or 0, 2), "total_amount": round(r[3] or 0, 2)} for r in contractor_summary_q]

    # =====================================================
    # Tab 3 : Variety Summary (Live Inventory Direct Read)
    # =====================================================
    variety_summary_q = db.query(
        FloorBalance.variety.label("variety_name"),
        func.sum(FloorBalance.available_qty).label("qty")
    ).filter(
        FloorBalance.company_id == company_id,
        FloorBalance.available_qty > 0.01,
        func.upper(func.trim(FloorBalance.variety)).notin_(["HOSO", "HLSO"])
    )

    if g_prod_clean and g_prod_clean != "ALL":
        variety_summary_q = variety_summary_q.filter(func.upper(func.trim(FloorBalance.production_for)) == g_prod_clean)

    if g_loc_clean and g_loc_clean != "ALL":
        if g_loc_clean in ["FLOOR", "OTHER FLOOR"]:
            variety_summary_q = variety_summary_q.filter(or_(
                func.upper(func.trim(FloorBalance.location)) == "FLOOR",
                func.upper(func.trim(FloorBalance.location)) == "OTHER FLOOR",
                FloorBalance.location == None,
                func.trim(FloorBalance.location) == ""
            ))
        else:
            variety_summary_q = variety_summary_q.filter(func.upper(func.trim(FloorBalance.location)) == g_loc_clean)
    elif user_allowed_locations:
        variety_summary_q = variety_summary_q.filter(func.upper(func.trim(FloorBalance.location)).in_(user_allowed_locations))

    variety_summary_q = (
        variety_summary_q
        .group_by(FloorBalance.variety)
        .order_by(FloorBalance.variety)
        .all()
    )

    variety_summary = [
        {
            "variety_name": r.variety_name,
            "total_hlso": round(r.qty or 0, 2),   
            "total_peeled": 0,
            "avg_yield": 0
        }
        for r in variety_summary_q
    ]

    pa_list = [pa[0] for pa in db.query(peeling_at.peeling_at).filter(peeling_at.company_id == company_id).all() if pa[0]]
    success_msg = request.session.pop("success_msg", None)

    return templates.TemplateResponse(
        request=request, name="processing/peeling.html",
        context={
            "success_msg": success_msg, 
            "varieties": masters["varieties"], 
            "contractors": masters["contractors"], 
            "species": masters["species"], 
            "peeling_locations": pa_list, 
            "prod_for_list": masters["prod_for_list"],
            "today_data": today_data,                    
            "contractor_summary": contractor_summary,    
            "variety_summary": variety_summary,          
            "hlso_floor_balance": hlso_floor_balance, 
            "hlso_summary": list(hlso_summary.values()), 
            "drill_down_json": json.dumps(drill_down_data)
        }
    )


# =====================================================
# SEARCHABLE DROPDOWNS: DIRECT SNAPSHOT READS
# =====================================================
@router.get("/peeling/get_batches_by_company")
def get_batches_by_company(prod_for: str, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id or not prod_for: return {"batches": []}
    global_p_for, global_loc = get_global_filters(request)
    prod_for = global_p_for or prod_for
    
    session_locations = request.session.get("allowed_locations", [])
    user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()] if isinstance(session_locations, str) else [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]

    batch_q = db.query(FloorBalance).filter(
        FloorBalance.company_id == company_id,
        func.upper(func.trim(FloorBalance.production_for)) == prod_for.strip().upper(),
        FloorBalance.variety.ilike("%HLSO%")
    )
    if global_loc:
        batch_q = batch_q.filter(func.upper(func.trim(FloorBalance.location)) == global_loc.strip().upper())
    if user_allowed_locations:
        batch_q = batch_q.filter(func.upper(func.trim(FloorBalance.location)).in_(user_allowed_locations))

    rows = batch_q.order_by(FloorBalance.batch_number).all()
    batches = {
        r.batch_number for r in rows
        if r.batch_number and get_floor_balance(db, company_id, r.location, r.batch_number, r.count, r.species, r.variety, r.production_for, r.source_type or "RMP") > 0.01
    }
    return {"batches": sorted(batches)}


@router.get("/peeling/get_hlso/{batch}")
def get_hlso_counts_by_batch(batch: str, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id: return {"counts": [], "species_map": {}, "variety_map": {}}
    
    global_p_for, global_loc = get_global_filters(request)
    g_prod_clean = global_p_for.strip().upper() if global_p_for else None
    g_loc_clean = global_loc.strip().upper() if global_loc else None

    records_q = db.query(FloorBalance).filter(
        FloorBalance.company_id == company_id,
        FloorBalance.batch_number == batch.strip(),
        FloorBalance.variety.ilike("%HLSO%")
    )
    if g_prod_clean:
        records_q = records_q.filter(func.upper(func.trim(FloorBalance.production_for)) == g_prod_clean)
    
    if g_loc_clean and g_loc_clean != "ALL":
        records_q = records_q.filter(func.upper(func.trim(FloorBalance.location)) == g_loc_clean)

    records = records_q.all()
    
    valid_counts, species_map, variety_map = set(), {}, {}
    for r in records:
        if get_floor_balance(db, company_id, r.location, r.batch_number, r.count, r.species, r.variety, r.production_for, r.source_type or "RMP") <= 0.01:
            continue
        count, spc, var = r.count, r.species, r.variety
        if not count or str(count).upper() == "N/A": continue
        count_str = str(count).strip()
        valid_counts.add(count_str)
        species_map[count_str] = spc or "N/A"
        variety_map[count_str] = var

    return {"counts": sorted(list(valid_counts)), "species_map": species_map, "variety_map": variety_map}


# =====================================================
# API: GET AVAILABLE QTY
# =====================================================
@router.get("/peeling/get_available_qty")
def get_available_qty(
    location: str = Query(...), batch: str = Query(...), count: str = Query(...), 
    species_name: str = Query(...), variety_name: str = Query(...),
    production_for: str = Query(...), request: Request = None, db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")
    if not company_code: return {"available_qty": 0}

    global_p_for, global_loc = get_global_filters(request)
    if global_p_for:
        production_for = global_p_for
    if global_loc:
        location = global_loc
    
    clean_loc = "FLOOR" if not location or location.strip() == "" else location.strip().upper()
    session_locations = request.session.get("allowed_locations", [])
    user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()] if isinstance(session_locations, str) else [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]
    if user_allowed_locations and clean_loc not in user_allowed_locations:
        return {"available_qty": 0}

    prod_for_clean = production_for.strip() if production_for else ""
    if prod_for_clean in ("General Stock", "GENERAL STOCK", "N/A", ""):
        prod_for_clean = None

    fb_query = db.query(FloorBalance.source_type, FloorBalance.location).filter(
        FloorBalance.company_id == company_code, 
        or_(
            func.upper(func.trim(FloorBalance.location)) == clean_loc,
            func.upper(func.trim(FloorBalance.location)) == "OTHER FLOOR" if clean_loc == "FLOOR" else False
        ),
        FloorBalance.batch_number == batch.strip(), 
        FloorBalance.count == count.strip(),
        FloorBalance.species == species_name, 
        FloorBalance.variety == variety_name
    )

    if prod_for_clean:
        fb_query = fb_query.filter(func.upper(func.trim(FloorBalance.production_for)) == prod_for_clean.upper())
    else:
        fb_query = fb_query.filter((FloorBalance.production_for == None) | (func.trim(FloorBalance.production_for) == ""))

    source_row = fb_query.first()
    service_location = source_row[1] if source_row and source_row[1] else clean_loc
    available_qty = get_floor_balance(
        db, company_code, service_location, batch, count, species_name, variety_name,
        production_for, source_row[0] if source_row else "RMP"
    )
    return {"available_qty": round(available_qty, 2)}


@router.get("/peeling/get_rate")
def get_rate(request: Request, contractor: str = Query(...), variety: str = Query(...), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    row = db.query(peeling_rates.rate).filter(
        peeling_rates.company_id == company_id, peeling_rates.contractor_name == contractor, peeling_rates.variety_name == variety
    ).order_by(peeling_rates.effective_from.desc()).first()
    return {"rate": float(row[0]) if row else 0}


# =====================================================
# ACTION: SAVE PEELING (⚡ ZEPTO STYLE MUTATION)
# =====================================================
@router.post("/peeling")
def save_peeling(
    request: Request, db: Session = Depends(get_db), production_for: str = Form(...), location: str = Form(...), 
    batch_number: str = Form(...), in_count: str = Form(...), species: str = Form(...), variety: str = Form(...),
    hlso_qty: float = Form(...), peeled_qty: float = Form(...), yield_percent: str = Form(...), 
    contractor_name: str = Form(...), rate: float = Form(...), amount: float = Form(...)
):
    company_code = request.session.get("company_code")
    email = request.session.get("email")
    if not company_code: return JSONResponse({"error": "Unauthorized"}, status_code=401)

    clean_batch = str(batch_number).strip()
    clean_count = str(in_count).strip()
    clean_loc = "FLOOR" if not location or location.strip() == "" else location.strip().upper()

    live_record = db.query(FloorBalance).filter(
        FloorBalance.company_id == company_code, 
        or_(
            func.upper(func.trim(FloorBalance.location)) == clean_loc,
            func.upper(func.trim(FloorBalance.location)) == "OTHER FLOOR" if clean_loc == "FLOOR" else False
        ),
        FloorBalance.batch_number == clean_batch, 
        FloorBalance.count == clean_count,
        FloorBalance.species == species, 
        FloorBalance.variety.ilike("%HLSO%"),
        func.upper(func.trim(FloorBalance.production_for)) == production_for.strip().upper()
    ).with_for_update().first()
    
    input_variety = live_record.variety if live_record else "HLSO"
    service_location = live_record.location if live_record and live_record.location else clean_loc
    avail = get_floor_balance(
        db, company_code, service_location, clean_batch, clean_count, species,
        input_variety, production_for, live_record.source_type if live_record else "RMP"
    )
    if hlso_qty > (avail + 0.05):
        return JSONResponse({"error": f"Insufficient live balance. Available: {round(avail, 2)} KG"}, status_code=400)

    try: clean_yield = float(str(yield_percent).replace('%', ''))
    except: clean_yield = 0.0

    current_ist = ist_now()

    new_entry = Peeling(
        production_for=production_for, peeling_at=location, batch_number=clean_batch, hlso_count=clean_count,
        species=species, variety_name=variety, hlso_qty=hlso_qty, peeled_qty=peeled_qty, yield_percent=clean_yield,
        contractor_name=contractor_name, rate=rate, amount=amount, 
        date=current_ist.date(), time=current_ist.time(), email=email, company_id=company_code
    )
    db.add(new_entry)
    
    # ⚡ 1. Deduct input HLSO stock atomically
    update_floor_balance_row(
        db, company_code, clean_batch, clean_count, species, input_variety, 
        location, production_for, qty_delta=-hlso_qty, email=email
    )

    # ⚡ 2. Add output peeled stock directly
    update_floor_balance_row(
        db, company_code, clean_batch, clean_count, species, variety, 
        location, production_for, qty_delta=peeled_qty, email=email
    )

    db.commit()
    return JSONResponse({"message": "Saved successfully"}) 


from app.utils.trace_lock import is_batch_used_downstream_from_peeling

@router.post("/peeling/delete/{id}")
def delete_peeling(
    id: int,
    request: Request,
    cancel_reason: str = Form(None),
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    email = request.session.get("email")
    if not company_id:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    
    row = db.query(Peeling).filter(Peeling.company_id == company_id, Peeling.id == id).with_for_update().first()
    if not row:
        return JSONResponse({"error": "Record not found"}, status_code=404)

    if row.is_cancelled:
        return JSONResponse({"error": "This entry is already cancelled!"}, status_code=400)

    if is_edit_locked(request, row.date):
        return JSONResponse({"error": edit_lock_message()}, status_code=403)

    # 🔒 Downstream Traceability Check
    is_used, stage = is_batch_used_downstream_from_peeling(db, row.batch_number, row.company_id)
    if is_used:
        return JSONResponse({
            "error": f"❌ Cannot cancel: Batch '{row.batch_number}' is already processed in {stage}!"
        }, status_code=400)

    clean_loc = "FLOOR" if not row.peeling_at or row.peeling_at.strip() == "" else row.peeling_at.strip().upper()

    input_record = db.query(FloorBalance.variety).filter(
        FloorBalance.company_id == company_id, 
        or_(
            func.upper(func.trim(FloorBalance.location)) == clean_loc,
            func.upper(func.trim(FloorBalance.location)) == "OTHER FLOOR" if clean_loc == "FLOOR" else False
        ),
        FloorBalance.batch_number == row.batch_number, 
        FloorBalance.count == row.hlso_count,
        FloorBalance.species == row.species, 
        FloorBalance.variety.ilike("%HLSO%"),
        func.upper(func.trim(FloorBalance.production_for)) == row.production_for.strip().upper()
    ).first()
    
    resolved_input_var = input_record[0] if input_record else "HLSO"

    # ⚡ Inverse Stock Mutation Rollbacks (100% Accurate Recovery)
    update_floor_balance_row(
        db, company_id, row.batch_number, row.hlso_count, row.species, resolved_input_var, 
        row.peeling_at, row.production_for, qty_delta=row.hlso_qty, email=email
    )

    update_floor_balance_row(
        db, company_id, row.batch_number, row.hlso_count, row.species, row.variety_name, 
        row.peeling_at, row.production_for, qty_delta=-row.peeled_qty, email=email
    )

    # Soft Delete / Cancel
    row.is_cancelled = True
    row.status = "Cancelled"
    row.cancel_reason = cancel_reason.strip() if cancel_reason else "Cancelled by user"
    row.cancelled_by = email
    row.cancelled_at = ist_now()

    db.commit()
    return JSONResponse({"status": "ok"})
