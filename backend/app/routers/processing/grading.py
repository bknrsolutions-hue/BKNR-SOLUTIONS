import json
import re
from fastapi import APIRouter, Request, Form, Depends, HTTPException, Query
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from datetime import datetime, timedelta, date
from app.utils.timezone import ist_now
from app.services.floor_balance_sync import refresh_floor_balance
from app.utils.edit_lock import is_edit_locked, edit_lock_message

from app.database import get_db
from app.database.models.processing import Grading, RawMaterialPurchasing, DeHeading, HlsoForGrading
from app.database.models.reprocess import Reprocess
from app.database.models.criteria import (
    varieties, 
    species, 
    HOSO_HLSO_Yields, 
    packing_styles,
    peeling_at as PeelingAtMaster,
    production_for as ProductionForMaster
)
from app.database.models.inventory_management import pending_orders, stock_entry

# Centralized Hlso Grading Pool Sync Service Import
from app.services.hlso_grading_sync import consume_hlso_for_grading, rollback_grading_consumption

# Universal Global Filters Helper
from app.utils.global_filters import get_global_filters

router = APIRouter(tags=["GRADING"])
templates = Jinja2Templates(directory="app/templates")

# -----------------------------------------------------
# TODAY RANGE (9 AM → NEXT DAY 9 AM AUTOMATIC SHIFT)
# -----------------------------------------------------
def get_today_range():
    now = ist_now()
    start = now.replace(hour=9, minute=0, second=0, microsecond=0)
    if now < start:
        start -= timedelta(days=1)
    end = start + timedelta(days=1) - timedelta(seconds=1)
    return start, end

# -----------------------------------------------------
# MAIN VIEW: SHOW GRADING PAGE (STRICT MULTI-LAYER FILTER SYNC)
# -----------------------------------------------------
@router.get("/grading", response_class=HTMLResponse)
def show_grading(request: Request, db: Session = Depends(get_db)):
    # 1. 🟢 FETCH UNIVERSAL GLOBAL FILTERS CONTEXT
    global_production_for, global_location = get_global_filters(request)
    
    g_prod_clean = global_production_for.strip().upper() if global_production_for else None
    g_loc_clean = global_location.strip().upper() if global_location else None

    company_code = request.session.get("company_code")
    email = request.session.get("email")

    if not company_code or not email:
        return RedirectResponse("/auth/login", status_code=303)

    # 🟢 🔴 FETCH USER PERMITTED LOCATIONS FROM SESSION MULTIPLE CHECK
    session_locations = request.session.get("allowed_locations", [])
    if isinstance(session_locations, str):
        user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()]
    else:
        user_allowed_locations = [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]

    # Master Data for Dropdowns filtered securely
    species_list = [s.species_name for s in db.query(species).filter(species.company_id == company_code).all()]
    variety_list = [v.variety_name for v in db.query(varieties).filter(varieties.company_id == company_code).all()]
    
    # Peeling locations drop list protected with user permissions constraints (Form Independence)
    pa_q = db.query(PeelingAtMaster.peeling_at).filter(PeelingAtMaster.company_id == company_code)
    if user_allowed_locations:
        pa_q = pa_q.filter(func.upper(func.trim(PeelingAtMaster.peeling_at)).in_(user_allowed_locations))
    peeling_locations = [l.peeling_at for l in pa_q.order_by(PeelingAtMaster.peeling_at).all()]

    prod_for_list = [p[0] for p in db.query(distinct(ProductionForMaster.production_for)).filter(ProductionForMaster.company_id == company_code).order_by(ProductionForMaster.production_for).all() if p[0]]

    # 2. Today's Grading Data (Locked into 9 AM Shift Window & Filtered via Global & Permission Matrices)
    start, end = get_today_range()
    today_q = db.query(Grading).filter(
        Grading.company_id == company_code,
        Grading.date >= start.date(),
        Grading.date <= end.date()
    )
    
    # 🟢 Bypass "ALL" for Today's logic
    if g_prod_clean and g_prod_clean != "ALL":
        today_q = today_q.filter(func.upper(func.trim(Grading.production_for)) == g_prod_clean)
        
    if g_loc_clean and g_loc_clean != "ALL":
        today_q = today_q.filter(func.upper(func.trim(Grading.peeling_at)) == g_loc_clean)
    elif user_allowed_locations:
        today_q = today_q.filter(func.upper(func.trim(Grading.peeling_at)).in_(user_allowed_locations))

    today_data = today_q.order_by(Grading.id.desc()).all()

    # 3. 🟢 REQUIREMENT LOGIC - CRITICAL FIXED FILTER ENGINE 🟢
    p_orders_q = db.query(pending_orders).filter(pending_orders.company_id == company_code)
    stock_q = db.query(stock_entry).filter(stock_entry.company_id == company_code)
    
    # Production For Filter (Bypass "ALL")
    if g_prod_clean and g_prod_clean != "ALL":
        p_orders_q = p_orders_q.filter(func.upper(func.trim(pending_orders.company_name)) == g_prod_clean)
        stock_q = stock_q.filter(func.upper(func.trim(stock_entry.production_for)) == g_prod_clean)

    # Location / Production At Filter (Bypass "ALL")
    if g_loc_clean and g_loc_clean != "ALL":
        p_orders_q = p_orders_q.filter(func.upper(func.trim(pending_orders.production_at)) == g_loc_clean)
        stock_q = stock_q.filter(func.upper(func.trim(stock_entry.production_at)) == g_loc_clean)
    elif user_allowed_locations:
        p_orders_q = p_orders_q.filter(func.upper(func.trim(pending_orders.production_at)).in_(user_allowed_locations))
        stock_q = stock_q.filter(func.upper(func.trim(stock_entry.production_at)).in_(user_allowed_locations))
        
    p_orders = p_orders_q.all()
    all_stock = stock_q.all()
    
    yield_records = db.query(HOSO_HLSO_Yields).filter(HOSO_HLSO_Yields.company_id == company_code).all()
    p_styles = db.query(packing_styles).filter(packing_styles.company_id == company_code).all()
    v_records = db.query(varieties).filter(varieties.company_id == company_code).all()

    stock_pool = {}
    for s in all_stock:
        # 🟢 FIX: Use production_at instead of location
        s_loc_clean = str(s.production_at or "").strip().upper()
        
        # Permission and runtime filters check for requirements pool matching layouts
        if user_allowed_locations and s_loc_clean != "FLOOR" and s_loc_clean not in user_allowed_locations:
            continue
        if g_loc_clean and g_loc_clean != "ALL" and s_loc_clean != g_loc_clean:
            continue

        s_gl_match = re.search(r'(\d+)', str(s.glaze or "0"))
        s_gl_val = s_gl_match.group(1) if s_gl_match else "0"
        key = f"{str(s.production_for or '').strip().upper()}|{str(s.species).strip().lower()}|{str(s.variety).strip().lower()}|{str(s.grade).strip().lower()}|{str(s.packing_style).strip().lower()}|{s_gl_val}|{str(s.freezer or 'N/A').strip().lower()}"
        qty = float(s.quantity or 0)
        stock_pool[key] = stock_pool.get(key, 0.0) + (qty if str(s.cargo_movement_type).upper() == "IN" else -qty)

    hlso_summary, hoso_summary, drill_down_data = {}, {}, {"hlso": {}, "hoso": {}}

    for p in p_orders:
        p_spec, p_var, p_grad = str(p.species or "").strip().lower(), str(p.variety or "").strip().lower(), str(p.grade or "").strip().lower()
        p_pack, p_comp = str(p.packing_style or "").strip().lower(), str(p.company_name or "").strip().upper()

        c_gl_match = re.search(r'(\d+)', str(p.count_glaze or "0"))
        p_c_gl_val = float(c_gl_match.group(1)) if c_gl_match else 0.0
        c_gl_factor = (100 - p_c_gl_val) / 100 if p_c_gl_val < 100 else 1.0

        w_gl_match = re.search(r'(\d+)', str(p.weight_glaze or "0"))
        p_w_gl_val = float(w_gl_match.group(1)) if w_gl_match else 0.0
        w_gl_factor = (100 - p_w_gl_val) / 100 if p_w_gl_val < 100 else 1.0

        exact_key = f"{p_comp}|{p_spec}|{p_var}|{p_grad}|{p_pack}|{str(int(p_c_gl_val))}|{str(p.freezer or 'N/A').strip().lower()}"
        opening_bal = stock_pool.get(exact_key, 0.0)

        mc_wt = 1.0
        ps_match = next((ps for ps in p_styles if str(ps.packing_style).strip().lower() == p_pack), None)
        if ps_match: mc_wt = float(ps_match.mc_weight or 1.0)
        
        ordered_qty = round(mc_wt * float(p.no_of_mc or 0), 2)
        pending_prod = opening_bal - ordered_qty
        stock_pool[exact_key] = pending_prod

        if pending_prod < 0:
            abs_pending = abs(pending_prod)
            net_count = round((float(p.no_of_pieces or 0) / 2.20462) / c_gl_factor, 2) if p.no_of_pieces else 0
            v_data = next((v for v in v_records if str(v.variety_name).strip().lower() == p_var), None)
            peeling_y = float(v_data.peeling_yield or 100) / 100 if v_data else 1.0
            soaking_y = float(v_data.soaking_yield or 100) / 100 if v_data else 1.0
            hl_count_calc = round(net_count * peeling_y * soaking_y, 2)

            req_hlso_qty, req_hoso_qty, hoso_count_calc = 0, 0, 0

            if "HOSO" in p_var.upper():
                hoso_count_calc, req_hoso_qty = net_count, round(abs_pending * w_gl_factor, 2)
            else:
                sp_yields = [y for y in yield_records if str(y.species).strip().lower() == p_spec]
                if sp_yields and hl_count_calc > 0:
                    nearest_y = min(sp_yields, key=lambda x: abs(float(x.hlso_count or 0) - hl_count_calc))
                    hoso_count_calc = nearest_y.hoso_count
                    req_hlso_qty = round((abs_pending * w_gl_factor) / (peeling_y * soaking_y), 2)
                    h_yield_pct = float(nearest_y.hlso_yield_pct or 100) / 100
                    req_hoso_qty = round(req_hlso_qty / h_yield_pct, 2) if h_yield_pct > 0 else 0

            if req_hlso_qty > 0:
                key = f"{p.species}|{p.variety}|{hl_count_calc}"
                if key not in hlso_summary:
                    hlso_summary[key] = {"species": p.species, "variety": p.variety, "count": hl_count_calc, "total_kg": 0}
                    drill_down_data["hlso"][key] = []
                hlso_summary[key]["total_kg"] += req_hlso_qty
                drill_down_data["hlso"][key].append({"po_no": p.po_number, "buyer": getattr(p, 'buyer', 'N/A'), "grade": p.grade, "qty": req_hlso_qty})

            if req_hoso_qty > 0:
                key = f"{p.species}|{p.variety}|{hoso_count_calc}"
                if key not in hoso_summary:
                    hoso_summary[key] = {"species": p.species, "variety": p.variety, "count": hoso_count_calc, "total_kg": 0}
                    drill_down_data["hoso"][key] = []
                hoso_summary[key]["total_kg"] += req_hoso_qty
                drill_down_data["hoso"][key].append({"po_no": p.po_number, "buyer": getattr(p, 'buyer', 'N/A'), "grade": p.grade, "qty": req_hoso_qty})

    # 4. HIGH PERFORMANCE TABLE DATA CALL ENGINE
    pending_pool_q = db.query(HlsoForGrading).filter(HlsoForGrading.company_id == company_code)
    
    if g_prod_clean and g_prod_clean != "ALL":
        pending_pool_q = pending_pool_q.filter(func.upper(func.trim(HlsoForGrading.production_for)) == g_prod_clean)
        
    if g_loc_clean and g_loc_clean != "ALL":
        pending_pool_q = pending_pool_q.filter(func.upper(func.trim(HlsoForGrading.peeling_at)) == g_loc_clean)
    elif user_allowed_locations:
        pending_pool_q = pending_pool_q.filter(func.upper(func.trim(HlsoForGrading.peeling_at)).in_(user_allowed_locations))

    pending_pool_q = db.query(HlsoForGrading).filter(HlsoForGrading.company_id == company_code)
    
    if g_prod_clean and g_prod_clean != "ALL":
        pending_pool_q = pending_pool_q.filter(func.upper(func.trim(HlsoForGrading.production_for)) == g_prod_clean)
        
    if g_loc_clean and g_loc_clean != "ALL":
        pending_pool_q = pending_pool_q.filter(func.upper(func.trim(HlsoForGrading.peeling_at)) == g_loc_clean)
    elif user_allowed_locations:
        pending_pool_q = pending_pool_q.filter(func.upper(func.trim(HlsoForGrading.peeling_at)).in_(user_allowed_locations))

    deheading_pending = pending_pool_q.order_by(HlsoForGrading.date.asc(), HlsoForGrading.time.asc()).all()

    return templates.TemplateResponse(
        request=request, name="processing/grading.html",
        context={
            "species_list": species_list, "variety_list": variety_list, "peeling_locations": peeling_locations,
            "prod_for_list": prod_for_list, "today_data": today_data,
            "hlso_summary": list(hlso_summary.values()), "hoso_summary": list(hoso_summary.values()),
            "deheading_pending": deheading_pending,
            "global_production_for": global_production_for or "", 
            "global_location": global_location or "",              
            "drill_down_json": json.dumps(drill_down_data), "edit_data": None,
            "message": request.session.pop("message", None),
        }
    )

# -----------------------------------------------------
# API: GET BATCHES (RMP + REPROCESS) WITH PERMISSION HOOK
# -----------------------------------------------------
@router.get("/grading/get_batches/{company}/{location}")
def get_batches(company: str, location: str, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code: return {"batches": []}

    global_company, global_location = get_global_filters(request)
    if global_company:
        company = global_company
    if global_location:
        location = global_location

    session_locations = request.session.get("allowed_locations", [])
    user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()] if isinstance(session_locations, str) else [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]
    if user_allowed_locations and location != "ALL" and location.strip().upper() not in user_allowed_locations:
        return {"batches": []}

    thirty_days_ago = ist_now().date() - timedelta(days=30)

    r1_q = db.query(distinct(RawMaterialPurchasing.batch_number)).filter(
        RawMaterialPurchasing.company_id == company_code,
        func.upper(func.trim(RawMaterialPurchasing.production_for)) == func.upper(func.trim(company)),
        RawMaterialPurchasing.date >= thirty_days_ago
    )
    r2_q = db.query(distinct(Reprocess.new_batch_id)).filter(
        Reprocess.company_id == company_code,
        func.upper(func.trim(Reprocess.production_for)) == func.upper(func.trim(company)),
        Reprocess.date >= thirty_days_ago
    )

    if location != "ALL":
        r1_q = r1_q.filter(func.upper(func.trim(RawMaterialPurchasing.peeling_at)) == func.upper(func.trim(location)))
        r2_q = r2_q.filter(func.upper(func.trim(Reprocess.production_at)) == func.upper(func.trim(location)))

    r1 = r1_q.all()
    r2 = r2_q.all()
    
    all_batches = set([r[0] for r in r1 if r[0]]) | set([r[0] for r in r2 if r[0]])
    return {"batches": sorted(list(all_batches))}

# -----------------------------------------------------
# API: GET HOSO COUNTS (RMP + REPROCESS)
# -----------------------------------------------------
@router.get("/grading/get_hoso/{company}/{location}/{batch}")
def get_hoso(company: str, location: str, batch: str, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code: return {"counts": []}

    global_company, global_location = get_global_filters(request)
    if global_company:
        company = global_company
    if global_location:
        location = global_location

    session_locations = request.session.get("allowed_locations", [])
    user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()] if isinstance(session_locations, str) else [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]
    if user_allowed_locations and location != "ALL" and location.strip().upper() not in user_allowed_locations:
        return {"counts": []}

    c1_q = db.query(distinct(RawMaterialPurchasing.count)).filter(
        RawMaterialPurchasing.company_id == company_code,
        RawMaterialPurchasing.batch_number == batch,
        func.upper(func.trim(RawMaterialPurchasing.production_for)) == func.upper(func.trim(company))
    )
    c2_q = db.query(distinct(Reprocess.grade)).filter(
        Reprocess.company_id == company_code,
        Reprocess.new_batch_id == batch,
        func.upper(func.trim(Reprocess.production_for)) == func.upper(func.trim(company))
    )

    if location != "ALL":
        c1_q = c1_q.filter(func.upper(func.trim(RawMaterialPurchasing.peeling_at)) == func.upper(func.trim(location)))
        c2_q = c2_q.filter(func.upper(func.trim(Reprocess.production_at)) == func.upper(func.trim(location)))

    c1 = c1_q.all()
    c2 = c2_q.all()

    all_counts = set([r[0] for r in c1 if r[0]]) | set([r[0] for r in c2 if r[0]])
    return {"counts": sorted(list(all_counts))}

# -----------------------------------------------------
# POST: SAVE GRADING 
# -----------------------------------------------------
@router.post("/grading")
def save_grading(
    request: Request, batch_number: str = Form(...), hoso_count: str = Form(...),
    variety_name: str = Form(...), graded_count: str = Form(...), quantity: float = Form(...),
    species_val: str = Form(...), peeling_at: str = Form(...), production_for: str = Form(...),
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")
    email = request.session.get("email")

    if not company_code:
        return RedirectResponse("/auth/login", status_code=303)

    current_ist = ist_now()

    grading = Grading(
        batch_number=batch_number, hoso_count=hoso_count, variety_name=variety_name,
        graded_count=graded_count, quantity=quantity, species=species_val,
        peeling_at=peeling_at, production_for=production_for,
        date=current_ist.date(), time=current_ist.time(), email=email, company_id=company_code
    )
    db.add(grading)

    consume_hlso_for_grading(db, grading)

    db.commit()
    db.refresh(grading)
    refresh_floor_balance(db, company_code, batch_number=batch_number)
    request.session["message"] = "✔ Grading Saved Successfully!"
    return RedirectResponse("/processing/grading", status_code=303)

# -----------------------------------------------------
# POST: UPDATE GRADING
# -----------------------------------------------------
@router.post("/grading/update/{id}")
def update_grading(
    id: int, request: Request, batch_number: str = Form(...), hoso_count: str = Form(...),
    variety_name: str = Form(...), graded_count: str = Form(...), quantity: float = Form(...),
    species_val: str = Form(...), peeling_at: str = Form(...), production_for: str = Form(...),
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")
    entry = db.query(Grading).filter(Grading.id == id, Grading.company_id == company_code).first()
    if entry:
        if is_edit_locked(request, entry.date):
            request.session["message"] = f"❌ {edit_lock_message()}"
            return RedirectResponse("/processing/grading", status_code=303)
        old_batch_number = entry.batch_number
        entry.batch_number = batch_number
        entry.hoso_count = hoso_count
        entry.variety_name = variety_name
        entry.graded_count = graded_count
        entry.quantity = quantity
        entry.species = species_val
        entry.peeling_at = peeling_at
        entry.production_for = production_for
        db.commit()
        refresh_floor_balance(db, company_code, batch_number=batch_number)
        if old_batch_number != batch_number:
            refresh_floor_balance(db, company_code, batch_number=old_batch_number)
        request.session["message"] = "✔ Updated Successfully!"
    return RedirectResponse("/processing/grading", status_code=303)

# -----------------------------------------------------
# API: UPDATE LIVE STATUS FROM FRONTEND DROPDOWN
# -----------------------------------------------------
@router.post("/grading/update_pool_status")
def update_pool_status(
    request: Request, batch_number: str = Form(...), production_for: str = Form(...),
    hoso_count: str = Form(...), status: str = Form(...), db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")
    if not company_code:
        return JSONResponse({"status": "error", "message": "Unauthorized"}, status_code=401)

    pool_record = db.query(HlsoForGrading).filter(
        HlsoForGrading.company_id == company_code,
        HlsoForGrading.batch_number == batch_number,
        HlsoForGrading.production_for == production_for,
        HlsoForGrading.hoso_count == hoso_count
    ).first()

    if not pool_record:
        return JSONResponse({"status": "error", "message": "Record not found"}, status_code=404)

    pool_record.status = status
    db.commit()
    return {"status": "success", "message": f"Status updated to {status}"}

# -----------------------------------------------------
# API: SYNC HISTORICAL DATA
# -----------------------------------------------------
@router.get("/grading/sync_old_data")
def sync_old_data(request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code:
        return {"status": "error", "message": "Unauthorized"}

    db.query(HlsoForGrading).filter(HlsoForGrading.company_id == company_code).delete()
    
    dh_totals = db.query(
        DeHeading.batch_number, DeHeading.species, DeHeading.hoso_count, 
        DeHeading.peeling_at, DeHeading.production_for,
        func.sum(DeHeading.hlso_qty).label("total_hlso")
    ).filter(DeHeading.company_id == company_code).group_by(
        DeHeading.batch_number, DeHeading.species, DeHeading.hoso_count, 
        DeHeading.peeling_at, DeHeading.production_for
    ).all()

    grad_totals = db.query(
        Grading.batch_number, Grading.species, Grading.hoso_count, 
        Grading.peeling_at, Grading.production_for,
        func.sum(Grading.quantity).label("total_graded")
    ).filter(Grading.company_id == company_code).group_by(
        Grading.batch_number, Grading.species, Grading.hoso_count, 
        Grading.peeling_at, Grading.production_for
    ).all()

    grad_map = {}
    for g in grad_totals:
        k = (str(g.batch_number).upper(), str(g.species).upper(), str(g.hoso_count).upper(), str(g.peeling_at).upper(), str(g.production_for).upper())
        grad_map[k] = float(g.total_graded or 0)

    for d in dh_totals:
        k = (str(d.batch_number).upper(), str(d.species).upper(), str(d.hoso_count).upper(), str(d.peeling_at).upper(), str(d.production_for).upper())
        net = float(d.total_hlso or 0) - grad_map.get(k, 0.0)
        
        if net > 0.01:
            pool = HlsoForGrading(
                date=ist_now().date(), time=ist_now().time(),
                batch_number=d.batch_number, production_for=d.production_for,
                peeling_at=d.peeling_at, species=d.species, hoso_count=d.hoso_count,
                total_hlso_qty=d.total_hlso, graded_qty=grad_map.get(k, 0.0),
                available_qty=round(net, 2), status="Pending", company_id=company_code
            )
            db.add(pool)
            
    db.commit()
    return {"status": "success", "message": "All historical data synced successfully!"}

# -----------------------------------------------------
# POST: DELETE 
# -----------------------------------------------------
@router.post("/grading/delete/{id}")
def delete_grading(id: int, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    
    entry = db.query(Grading).filter(Grading.id == id, Grading.company_id == company_code).first()
    if entry:
        if is_edit_locked(request, entry.date):
            return JSONResponse({"status": "error", "message": edit_lock_message()}, status_code=403)
        batch_to_refresh = entry.batch_number
        rollback_grading_consumption(db, entry)
        db.delete(entry)
        db.commit()
        refresh_floor_balance(db, company_code, batch_number=batch_to_refresh)
    return JSONResponse({"status": "ok"})
