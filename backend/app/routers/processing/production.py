# ============================================================
# 🔥 PRODUCTION ROUTER - BULLETPROOF IST PROTECTED VERSION
# ============================================================

from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import distinct, func, and_
from datetime import datetime, timedelta
from app.utils.timezone import ist_now
from typing import Optional
import re
import json

from app.database import get_db
from app.database.models.processing import Production, GateEntry, Soaking
from app.database.models.inventory_management import pending_orders, stock_entry
from app.database.models.criteria import (
    brands, varieties, glazes, freezers,
    packing_styles, grades, species, production_at,
    production_for as ProductionForMaster,
    production_types, HOSO_HLSO_Yields, grade_to_hoso
)
from app.utils.global_filters import get_global_filters
from app.utils.edit_lock import is_edit_locked, edit_lock_message

router = APIRouter(tags=["PRODUCTION"]) 
templates = Jinja2Templates(directory="app/templates")


# -----------------------------------------------------
# HELPER: TODAY RANGE (9 AM TO NEXT DAY 9 AM)
# -----------------------------------------------------
def get_today_range():
    now = ist_now()
    start = now.replace(hour=9, minute=0, second=0, microsecond=0)
    if now < start:
        start -= timedelta(days=1)
    end = start + timedelta(days=1) - timedelta(seconds=1)
    return start, end


# -----------------------------------------------------
# HELPER: EXTRACT NUMERIC VALUE FROM STRING
# -----------------------------------------------------
def extract_number(value, default=0):
    if not value:
        return default
    match = re.search(r'(\d+\.?\d*)', str(value))
    return float(match.group(1)) if match else default


# -----------------------------------------------------
# HELPER: BUILD STOCK KEY
# -----------------------------------------------------
def build_stock_key(prod_for, species, variety, grade, packing_style, glaze, freezer):
    return "|".join([
        str(prod_for or "").strip().upper(),
        str(species or "").strip().lower(),
        str(variety or "").strip().lower(),
        str(grade or "").strip().lower(),
        str(packing_style or "").strip().lower(),
        str(int(extract_number(glaze, 0))),
        str(freezer or "N/A").strip().lower()
    ])


# -----------------------------------------------------
# HELPER: GET COMMON TEMPLATE DATA
# -----------------------------------------------------
def get_common_data(db: Session, company_code: str, user_allowed_locations: list):
    """Fetch dropdown master data aligned securely with user permissions"""
    pl_q = db.query(production_at).filter(production_at.company_id == company_code)
    if user_allowed_locations:
        pl_q = pl_q.filter(func.upper(func.trim(production_at.production_at)).in_(user_allowed_locations))
        
    return {
        "brands": [b.brand_name for b in db.query(brands).filter(brands.company_id == company_code).all()],
        "varieties": [v.variety_name for v in db.query(varieties).filter(varieties.company_id == company_code).all()],
        "glazes": [g.glaze_name for g in db.query(glazes).filter(glazes.company_id == company_code).all()],
        "freezers": [f.freezer_name for f in db.query(freezers).filter(freezers.company_id == company_code).all()],
        "packing_styles": [
            {
                "packing_style": p.packing_style,
                "mc_weight": p.mc_weight,
                "slab_weight": p.slab_weight,
            }
            for p in db.query(packing_styles).filter(packing_styles.company_id == company_code).all()
        ],
        "grades": [g.grade_name for g in db.query(grades).filter(grades.company_id == company_code).all()],
        "species": [s.species_name for s in db.query(species).filter(species.company_id == company_code).all()],
        "prod_at_list": [p.production_at for p in pl_q.order_by(production_at.production_at).all()],
        "prod_for_list": sorted(list(set([pf[0] for pf in db.query(distinct(ProductionForMaster.production_for)).filter(ProductionForMaster.company_id == company_code).all() if pf[0]] + ["General Stock"]))),
        "prod_types_list": [pt.production_type for pt in db.query(production_types).filter(production_types.company_id == company_code).all()],
    }


def get_production_calc_masters(db: Session, company_code: str):
    return {
        "yields": db.query(HOSO_HLSO_Yields).filter(HOSO_HLSO_Yields.company_id == company_code).all(),
        "packing": db.query(packing_styles).filter(packing_styles.company_id == company_code).all(),
        "varieties": db.query(varieties).filter(varieties.company_id == company_code).all(),
        "grade_map": db.query(grade_to_hoso).filter(grade_to_hoso.company_id == company_code).all(),
    }


# -----------------------------------------------------
# MAIN PRODUCTION PAGE
# -----------------------------------------------------
def _unused_incomplete_production_page(
    request: Request, 
    db: Session = Depends(get_db),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    edit_id: Optional[int] = None
):
    # 🟢 FETCH UNIVERSAL GLOBAL FILTERS FROM RUNTIME CONTEXT
    global_production_for, global_location = get_global_filters(request)
    
    g_prod_clean = global_production_for.strip().upper() if global_production_for else None
    g_loc_clean = global_location.strip().upper() if global_location else None

    company_code = request.session.get("company_code")
    email = request.session.get("email")

    if not company_code or not email:
        return RedirectResponse("/auth/login", status_code=302)

    # 🟢 FETCH USER PERMITTED LOCATIONS MULTI-PERMISSION CHECK
    session_locations = request.session.get("allowed_locations", [])
    if isinstance(session_locations, str):
        user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()]
    else:
        user_allowed_locations = [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]

    # ========== 1. LOAD MASTER DATA ==========
    all_stock = db.query(stock_entry).filter(
        stock_entry.company_id == company_code,
        stock_entry.is_cancelled.is_not(True),
    ).all()
    calc_masters = get_production_calc_masters(db, company_code)
    yield_records = calc_masters["yields"]
    p_styles = calc_masters["packing"]
    v_records = calc_masters["varieties"]
    grade_map_list = calc_masters["grade_map"]

    # ========== 2. BUILD STOCK POOL (User Allowed Locations & Global Lockdown) ==========
    stock_pool = {}
    for s in all_stock:
        # 🟢 FIX: checking production_at instead of location
        s_loc_clean = str(s.production_at or "").strip().upper()
        
        if user_allowed_locations and s_loc_clean != "FLOOR" and s_loc_clean not in user_allowed_locations:
            continue
        if g_loc_clean and g_loc_clean != "ALL" and s_loc_clean != g_loc_clean:
            continue
        if g_prod_clean and g_prod_clean != "ALL" and str(s.production_for or "").strip().upper() != g_prod_clean:
            continue

        key = build_stock_key(
            s.production_for, s.species, s.variety, 
            s.grade, s.packing_style, s.glaze, s.freezer
        )
        qty = float(s.quantity or 0)
        net_qty = qty if str(s.cargo_movement_type).upper() == "IN" else -qty
        stock_pool[key] = stock_pool.get(key, 0.0) + net_qty

    # ========== 3. PRODUCTION AGGREGATION SUBQUERY ==========
    prod_sub_q = db.query(
        Production.batch_number, Production.brand, Production.variety_name,
        Production.grade, Production.packing_style, func.sum(Production.no_of_mc).label("total_produced")
    ).filter(Production.company_id == company_code)
    
    # 🟢 FIX: "ALL" bypass for Production Subquery
    if g_loc_clean and g_loc_clean != "ALL":
        prod_sub_q = prod_sub_q.filter(func.upper(func.trim(Production.production_at)) == g_loc_clean)
    elif user_allowed_locations:
        prod_sub_q = prod_sub_q.filter(func.upper(func.trim(Production.production_at)).in_(user_allowed_locations))
        
    produced_sub = prod_sub_q.group_by(
        Production.batch_number, Production.brand, Production.variety_name, Production.grade, Production.packing_style
    ).subquery()

    # ========== 4. PENDING ORDERS QUERY (Global Sync) ==========
    q_req = db.query(
        pending_orders, func.coalesce(produced_sub.c.total_produced, 0).label("produced_mc_count")
    ).outerjoin(
        produced_sub, 
        and_(
            pending_orders.po_number == produced_sub.c.batch_number,
            pending_orders.brand == produced_sub.c.brand,
            pending_orders.variety == produced_sub.c.variety_name,
            pending_orders.grade == produced_sub.c.grade,
            pending_orders.packing_style == produced_sub.c.packing_style
        )
    ).filter(pending_orders.company_id == company_code)
    
    # 🟢 FIX: "ALL" bypass for Pending Orders
    if g_prod_clean and g_prod_clean != "ALL":
        q_req = q_req.filter(func.upper(func.trim(pending_orders.company_name)) == g_prod_clean)
    if g_loc_clean and g_loc_clean != "ALL":
        q_req = q_req.filter(func.upper(func.trim(pending_orders.production_at)) == g_loc_clean)
    elif user_allowed_locations:
        q_req = q_req.filter(func.upper(func.trim(pending_orders.production_at)).in_(user_allowed_locations))
        
    if from_date:
        try: q_req = q_req.filter(pending_orders.date >= datetime.strptime(from_date, "%Y-%m-%d").date())
        except ValueError: pass
    if to_date:
        try: q_req = q_req.filter(pending_orders.date <= datetime.strptime(to_date, "%Y-%m-%d").date())
        except ValueError: pass

    requirements_data = q_req.order_by(pending_orders.sl_no.asc()).all()

    # ========== 5. PROCESS REQUIREMENTS ==========
    usage_history = {}
    final_pending_list = []

    for row in requirements_data:
        r = row.pending_orders
        r.actual_produced_mc = float(row.produced_mc_count or 0)
        
        current_row_comp = str(r.company_name or "").strip().upper()
        p_spec = str(r.species or "").strip().lower()
        p_var = str(r.variety or "").strip().lower()
        p_grad = str(r.grade or "").strip().lower()
        p_pack = str(r.packing_style or "").strip().lower()
        p_frz = str(r.freezer or "N/A").strip().lower()
        
        p_c_gl_val = extract_number(r.count_glaze, 0)
        c_gl_factor = (100 - p_c_gl_val) / 100 if p_c_gl_val < 100 else 1.0
        p_w_gl_val = extract_number(r.weight_glaze, 0)
        w_gl_factor = (100 - p_w_gl_val) / 100 if p_w_gl_val < 100 else 1.0

        exact_key = build_stock_key(current_row_comp, p_spec, p_var, p_grad, p_pack, r.count_glaze, r.freezer)
        opening_bal = round(stock_pool.get(exact_key, 0.0), 2)
        r.available_stock = opening_bal

        mc_wt = 1.0
        slab_wt = 0.0
        p_match = next((ps for ps in p_styles if str(ps.packing_style).strip().lower() == p_pack), None)
        if p_match:
            mc_wt = float(p_match.mc_weight or 1.0)
            slab_wt = float(p_match.slab_weight or 0.0)
            r.ordered_qty = round(mc_wt * float(r.no_of_mc or 0), 2)
        else:
            r.ordered_qty = 0.0

        r.existed_stock_util = min(opening_bal, r.ordered_qty) if opening_bal > 0 else 0.0
        if exact_key not in usage_history:
            usage_history[exact_key] = []
        
        remaining_bal = round(opening_bal - r.ordered_qty, 2)
        usage_history[exact_key].append({
            "po_no": r.po_number or "N/A", "available": opening_bal,
            "utilized": round(r.existed_stock_util, 2), "balance": remaining_bal
        })
        r.util_json = json.dumps(usage_history[exact_key])
        stock_pool[exact_key] = remaining_bal

        try: r.net_count_calc = round((float(r.no_of_pieces or 0) / 2.20462) / c_gl_factor, 2) if r.no_of_pieces else 0
        except (ZeroDivisionError, TypeError): r.net_count_calc = 0

        r.nw_grade = "-"
        rel_grades = [gm for gm in grade_map_list if str(gm.species).strip().lower() == p_spec]
        if rel_grades and r.net_count_calc > 0:
            nearest_gm = min(rel_grades, key=lambda x: abs(float(x.hlso_count or 0) - r.net_count_calc))
            r.nw_grade = nearest_gm.nw_grade if nearest_gm.nw_grade else "-"

        r.ref_opt_stock = 0.0
        ref_details = []
        p_gl_full_text = str(r.count_glaze or "").strip().upper()
        is_order_nwnc = "NWNC" in p_gl_full_text or p_c_gl_val == 0
        
        for s in all_stock:
            # 🟢 FIX: Ensure ref_opt_stock loop respects filters
            if str(s.production_for or "").strip().upper() != current_row_comp: continue
            
            s_loc_clean = str(s.production_at or "").strip().upper()
            if user_allowed_locations and s_loc_clean != "FLOOR" and s_loc_clean not in user_allowed_locations: continue
            if g_loc_clean and g_loc_clean != "ALL" and s_loc_clean != g_loc_clean: continue

            s_gl_num = str(int(extract_number(s.glaze, 0)))
            match_ref = False
            
            if (str(s.species).strip().lower() == p_spec and str(s.variety).strip().lower() == p_var and str(s.freezer or "N/A").strip().lower() == p_frz):
                if is_order_nwnc:
                    if (str(s.grade).strip().lower() == p_grad and s_gl_num == "0" and str(s.packing_style).strip().lower() != p_pack):
                        match_ref = True
                else:
                    if (r.nw_grade != "-" and str(s.grade).strip().lower() == str(r.nw_grade).strip().lower() and s_gl_num == "0"):
                        match_ref = True
            
            if match_ref:
                s_qty = float(s.quantity or 0) if str(s.cargo_movement_type).upper() == "IN" else -float(s.quantity or 0)
                if s_qty > 0:
                    r.ref_opt_stock += s_qty
                    ref_details.append({
                        "po_no": f"LOC: {str(s.location or 'N/A').upper()}", "available": round(s_qty, 2), 
                        "utilized": f"AT: {str(s.production_at or 'N/A').upper()}", "balance": round(s_qty, 2)
                    })

        r.ref_opt_stock = round(r.ref_opt_stock, 2)
        r.ref_json = json.dumps(ref_details)

        r.stock_mc = int(opening_bal / mc_wt) if mc_wt > 0 else 0
        r.pending_production = round(r.existed_stock_util - r.ordered_qty, 2)
        r.prod_pending_mc = int(float(r.no_of_mc or 0) - r.actual_produced_mc)
        
        v_data = next((v for v in v_records if str(v.variety_name).strip().lower() == p_var), None)
        peeling_y = float(v_data.peeling_yield or 100) / 100 if v_data else 1.0
        soaking_y = float(v_data.soaking_yield or 100) / 100 if v_data else 1.0
        
        r.hl_count_calc = round(r.net_count_calc * peeling_y * soaking_y, 2) if r.net_count_calc > 0 else 0
        
        r.hoso_count_calc = 0
        r.req_hlso_qty = 0
        r.req_hoso_qty = 0
        
        if "HOSO" in p_var.upper():
            r.hoso_count_calc = r.net_count_calc
            if abs(r.pending_production) > 0:
                r.req_hoso_qty = round(abs(r.pending_production) * w_gl_factor, 2)
        else:
            sp_yields = [y for y in yield_records if str(y.species).strip().lower() == p_spec]
            if sp_yields and r.hl_count_calc > 0:
                nearest_y = min(sp_yields, key=lambda x: abs(float(x.hlso_count or 0) - r.hl_count_calc))
                r.hoso_count_calc = nearest_y.hoso_count
                
                if abs(r.pending_production) > 0 and peeling_y > 0 and soaking_y > 0:
                    r.req_hlso_qty = round((abs(r.pending_production) * w_gl_factor) / (peeling_y * soaking_y), 2)
                    h_yield_pct = float(nearest_y.hlso_yield_pct or 100) / 100
                    r.req_hoso_qty = round(r.req_hlso_qty / h_yield_pct, 2) if h_yield_pct > 0 else 0
        
        final_pending_list.append(r)

    # ========== 6. SOAKING & REJECTION DATA QUEUE (User Scope Filters Locked) ==========
    soak_rej_q = db.query(Soaking).filter(Soaking.company_id == company_code, Soaking.rejection_qty > 0, Soaking.status != 'Completed')
    soak_mon_q = db.query(Soaking).filter(Soaking.company_id == company_code, Soaking.status != 'Completed', Soaking.in_qty > 0)
    
    if g_prod_clean and g_prod_clean != "ALL":
        soak_rej_q = soak_rej_q.filter(func.upper(func.trim(Soaking.production_for)) == g_prod_clean)
        soak_mon_q = soak_mon_q.filter(func.upper(func.trim(Soaking.production_for)) == g_prod_clean)
    if g_loc_clean and g_loc_clean != "ALL":
        soak_rej_q = soak_rej_q.filter(func.upper(func.trim(Soaking.production_at)) == g_loc_clean)
        soak_mon_q = soak_mon_q.filter(func.upper(func.trim(Soaking.production_at)) == g_loc_clean)
    elif user_allowed_locations:
        soak_rej_q = soak_rej_q.filter(func.upper(func.trim(Soaking.production_at)).in_(user_allowed_locations))
        soak_mon_q = soak_mon_q.filter(func.upper(func.trim(Soaking.production_at)).in_(user_allowed_locations))

    rejection_data = soak_rej_q.all()
    soaking_monitor = soak_mon_q.order_by(Soaking.date.asc(), Soaking.sintex_number.asc()).all()

    # ========== 7. BATCH DATA FOR DROPDOWN ==========
    batches_with_company = [
        {"batch_number": g.batch_number, "production_for": g.production_for} 
        for g in db.query(GateEntry).filter(GateEntry.company_id == company_code).order_by(GateEntry.id.desc()).all() if g.batch_number
    ]

    # ========== 8. TODAY'S TRANSACTION LOGS ==========
    start, end = get_today_range()
    today_q = db.query(Production).filter(Production.company_id == company_code, Production.date >= start.date(), Production.date <= end.date())
    
    # 🟢 FIX: "ALL" bypass for Today's logs
    if g_prod_clean and g_prod_clean != "ALL":
        today_q = today_q.filter(func.upper(func.trim(Production.production_for)) == g_prod_clean)
    if g_loc_clean and g_loc_clean != "ALL":
        today_q = today_q.filter(func.upper(func.trim(Production.production_at)) == g_loc_clean)
    elif user_allowed_locations:
        today_q = today_q.filter(func.upper(func.trim(Production.production_at)).in_(user_allowed_locations))
        
    today_data = today_q.order_by(Production.id.desc()).all()

    # ========== 9. EDIT DATA ==========
    edit_data = None
    if edit_id:
        edit_data = db.query(Production).filter(Production.id == edit_id, Production.company_id == company_code).first()

    # ========== 10. POP SESSION MESSAGE ==========
    session_msg = request.session.pop("message", None)
    success_msg = session_msg if session_msg and ("✔" in session_msg or "Successfully" in session_msg or "ok" in session_msg) else None
    error_msg = session_msg if session_msg and not success_msg else None

def safe_isoformat(val):
    if not val:
        return None
    if hasattr(val, 'isoformat'):
        return val.isoformat()
    return str(val)


def safe_strftime(val, fmt="%H:%M"):
    if not val:
        return None
    if hasattr(val, 'strftime'):
        return val.strftime(fmt)
    return str(val)


# -----------------------------------------------------
# HELPER: GET COMMON TEMPLATE DATA
# -----------------------------------------------------
def get_common_data(db: Session, company_code: str, user_allowed_locations: list):
    """Fetch dropdown master data aligned securely with user permissions"""
    pl_q = db.query(production_at).filter(production_at.company_id == company_code)
    if user_allowed_locations:
        pl_q = pl_q.filter(func.upper(func.trim(production_at.production_at)).in_(user_allowed_locations))
        
    return {
        "brands": [b.brand_name for b in db.query(brands).filter(brands.company_id == company_code).all()],
        "varieties": [v.variety_name for v in db.query(varieties).filter(varieties.company_id == company_code).all()],
        "glazes": [g.glaze_name for g in db.query(glazes).filter(glazes.company_id == company_code).all()],
        "freezers": [f.freezer_name for f in db.query(freezers).filter(freezers.company_id == company_code).all()],
        "packing_styles": [
            {
                "packing_style": p.packing_style,
                "mc_weight": p.mc_weight,
                "slab_weight": p.slab_weight,
            }
            for p in db.query(packing_styles).filter(packing_styles.company_id == company_code).all()
        ],
        "grades": [g.grade_name for g in db.query(grades).filter(grades.company_id == company_code).all()],
        "species": [s.species_name for s in db.query(species).filter(species.company_id == company_code).all()],
        "prod_at_list": [p.production_at for p in pl_q.order_by(production_at.production_at).all()],
        "prod_for_list": sorted(list(set([pf[0] for pf in db.query(distinct(ProductionForMaster.production_for)).filter(ProductionForMaster.company_id == company_code).all() if pf[0]] + ["General Stock"]))),
        "prod_types_list": [pt.production_type for pt in db.query(production_types).filter(production_types.company_id == company_code).all()],
    }


def get_production_calc_masters(db: Session, company_code: str):
    return {
        "yields": db.query(HOSO_HLSO_Yields).filter(HOSO_HLSO_Yields.company_id == company_code).all(),
        "packing": db.query(packing_styles).filter(packing_styles.company_id == company_code).all(),
        "varieties": db.query(varieties).filter(varieties.company_id == company_code).all(),
        "grade_map": db.query(grade_to_hoso).filter(grade_to_hoso.company_id == company_code).all(),
    }


# -----------------------------------------------------
# MAIN PRODUCTION PAGE
# -----------------------------------------------------
@router.get("/production", response_class=HTMLResponse)
def production_page(
    request: Request, 
    db: Session = Depends(get_db),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    edit_id: Optional[int] = None
):
    # 🟢 FETCH UNIVERSAL GLOBAL FILTERS FROM RUNTIME CONTEXT
    global_production_for, global_location = get_global_filters(request)
    
    g_prod_clean = global_production_for.strip().upper() if global_production_for else None
    g_loc_clean = global_location.strip().upper() if global_location else None

    company_code = request.session.get("company_code")
    email = request.session.get("email")

    if not company_code or not email:
        return RedirectResponse("/auth/login", status_code=302)

    # 🟢 FETCH USER PERMITTED LOCATIONS MULTI-PERMISSION CHECK
    session_locations = request.session.get("allowed_locations", [])
    if isinstance(session_locations, str):
        user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()]
    else:
        user_allowed_locations = [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]

    # ========== 1. LOAD MASTER DATA ==========
    all_stock = db.query(stock_entry).filter(
        stock_entry.company_id == company_code,
        stock_entry.is_cancelled.is_not(True),
    ).all()
    calc_masters = get_production_calc_masters(db, company_code)
    yield_records = calc_masters["yields"]
    p_styles = calc_masters["packing"]
    v_records = calc_masters["varieties"]
    grade_map_list = calc_masters["grade_map"]

    # ========== 2. BUILD STOCK POOL (User Allowed Locations & Global Lockdown) ==========
    stock_pool = {}
    for s in all_stock:
        # 🟢 FIX: checking production_at instead of location
        s_loc_clean = str(s.production_at or "").strip().upper()
        
        if user_allowed_locations and s_loc_clean != "FLOOR" and s_loc_clean not in user_allowed_locations:
            continue
        if g_loc_clean and g_loc_clean != "ALL" and s_loc_clean != g_loc_clean:
            continue
        if g_prod_clean and g_prod_clean != "ALL" and str(s.production_for or "").strip().upper() != g_prod_clean:
            continue

        key = build_stock_key(
            s.production_for, s.species, s.variety, 
            s.grade, s.packing_style, s.glaze, s.freezer
        )
        qty = float(s.quantity or 0)
        net_qty = qty if str(s.cargo_movement_type).upper() == "IN" else -qty
        stock_pool[key] = stock_pool.get(key, 0.0) + net_qty

    # ========== 3. PRODUCTION AGGREGATION SUBQUERY ==========
    prod_sub_q = db.query(
        Production.batch_number, Production.brand, Production.variety_name,
        Production.grade, Production.packing_style, func.sum(Production.no_of_mc).label("total_produced")
    ).filter(Production.company_id == company_code)
    
    # 🟢 FIX: "ALL" bypass for Production Subquery
    if g_loc_clean and g_loc_clean != "ALL":
        prod_sub_q = prod_sub_q.filter(func.upper(func.trim(Production.production_at)) == g_loc_clean)
    elif user_allowed_locations:
        prod_sub_q = prod_sub_q.filter(func.upper(func.trim(Production.production_at)).in_(user_allowed_locations))
        
    produced_sub = prod_sub_q.group_by(
        Production.batch_number, Production.brand, Production.variety_name, Production.grade, Production.packing_style
    ).subquery()

    # ========== 4. PENDING ORDERS QUERY (Global Sync) ==========
    q_req = db.query(
        pending_orders, func.coalesce(produced_sub.c.total_produced, 0).label("produced_mc_count")
    ).outerjoin(
        produced_sub, 
        and_(
            pending_orders.po_number == produced_sub.c.batch_number,
            pending_orders.brand == produced_sub.c.brand,
            pending_orders.variety == produced_sub.c.variety_name,
            pending_orders.grade == produced_sub.c.grade,
            pending_orders.packing_style == produced_sub.c.packing_style
        )
    ).filter(pending_orders.company_id == company_code)
    
    # 🟢 FIX: "ALL" bypass for Pending Orders
    if g_prod_clean and g_prod_clean != "ALL":
        q_req = q_req.filter(func.upper(func.trim(pending_orders.company_name)) == g_prod_clean)
    if g_loc_clean and g_loc_clean != "ALL":
        q_req = q_req.filter(func.upper(func.trim(pending_orders.production_at)) == g_loc_clean)
    elif user_allowed_locations:
        q_req = q_req.filter(func.upper(func.trim(pending_orders.production_at)).in_(user_allowed_locations))
        
    if from_date:
        try: q_req = q_req.filter(pending_orders.date >= datetime.strptime(from_date, "%Y-%m-%d").date())
        except ValueError: pass
    if to_date:
        try: q_req = q_req.filter(pending_orders.date <= datetime.strptime(to_date, "%Y-%m-%d").date())
        except ValueError: pass

    requirements_data = q_req.order_by(pending_orders.sl_no.asc()).all()

    # ========== 5. PROCESS REQUIREMENTS ==========
    usage_history = {}
    final_pending_list = []

    for row in requirements_data:
        r = row.pending_orders
        r.actual_produced_mc = float(row.produced_mc_count or 0)
        
        current_row_comp = str(r.company_name or "").strip().upper()
        p_spec = str(r.species or "").strip().lower()
        p_var = str(r.variety or "").strip().lower()
        p_grad = str(r.grade or "").strip().lower()
        p_pack = str(r.packing_style or "").strip().lower()
        p_frz = str(r.freezer or "N/A").strip().lower()
        
        p_c_gl_val = extract_number(r.count_glaze, 0)
        c_gl_factor = (100 - p_c_gl_val) / 100 if p_c_gl_val < 100 else 1.0
        p_w_gl_val = extract_number(r.weight_glaze, 0)
        w_gl_factor = (100 - p_w_gl_val) / 100 if p_w_gl_val < 100 else 1.0

        exact_key = build_stock_key(current_row_comp, p_spec, p_var, p_grad, p_pack, r.count_glaze, r.freezer)
        opening_bal = round(stock_pool.get(exact_key, 0.0), 2)
        r.available_stock = opening_bal

        mc_wt = 1.0
        slab_wt = 0.0
        p_match = next((ps for ps in p_styles if str(ps.packing_style).strip().lower() == p_pack), None)
        if p_match:
            mc_wt = float(p_match.mc_weight or 1.0)
            slab_wt = float(p_match.slab_weight or 0.0)
            r.ordered_qty = round(mc_wt * float(r.no_of_mc or 0), 2)
        else:
            r.ordered_qty = 0.0

        r.existed_stock_util = min(opening_bal, r.ordered_qty) if opening_bal > 0 else 0.0
        if exact_key not in usage_history:
            usage_history[exact_key] = []
        
        remaining_bal = round(opening_bal - r.ordered_qty, 2)
        usage_history[exact_key].append({
            "po_no": r.po_number or "N/A", "available": opening_bal,
            "utilized": round(r.existed_stock_util, 2), "balance": remaining_bal
        })
        r.util_json = json.dumps(usage_history[exact_key])
        stock_pool[exact_key] = remaining_bal

        try: r.net_count_calc = round((float(r.no_of_pieces or 0) / 2.20462) / c_gl_factor, 2) if r.no_of_pieces else 0
        except (ZeroDivisionError, TypeError): r.net_count_calc = 0

        r.nw_grade = "-"
        rel_grades = [gm for gm in grade_map_list if str(gm.species).strip().lower() == p_spec]
        if rel_grades and r.net_count_calc > 0:
            nearest_gm = min(rel_grades, key=lambda x: abs(float(x.hlso_count or 0) - r.net_count_calc))
            r.nw_grade = nearest_gm.nw_grade if nearest_gm.nw_grade else "-"

        r.ref_opt_stock = 0.0
        ref_details = []
        p_gl_full_text = str(r.count_glaze or "").strip().upper()
        is_order_nwnc = "NWNC" in p_gl_full_text or p_c_gl_val == 0
        
        for s in all_stock:
            # 🟢 FIX: Ensure ref_opt_stock loop respects filters
            if str(s.production_for or "").strip().upper() != current_row_comp: continue
            
            s_loc_clean = str(s.production_at or "").strip().upper()
            if user_allowed_locations and s_loc_clean != "FLOOR" and s_loc_clean not in user_allowed_locations: continue
            if g_loc_clean and g_loc_clean != "ALL" and s_loc_clean != g_loc_clean: continue

            s_gl_num = str(int(extract_number(s.glaze, 0)))
            match_ref = False
            
            if (str(s.species).strip().lower() == p_spec and str(s.variety).strip().lower() == p_var and str(s.freezer or "N/A").strip().lower() == p_frz):
                if is_order_nwnc:
                    if (str(s.grade).strip().lower() == p_grad and s_gl_num == "0" and str(s.packing_style).strip().lower() != p_pack):
                        match_ref = True
                else:
                    if (r.nw_grade != "-" and str(s.grade).strip().lower() == str(r.nw_grade).strip().lower() and s_gl_num == "0"):
                        match_ref = True
            
            if match_ref:
                s_qty = float(s.quantity or 0) if str(s.cargo_movement_type).upper() == "IN" else -float(s.quantity or 0)
                if s_qty > 0:
                    r.ref_opt_stock += s_qty
                    ref_details.append({
                        "po_no": f"LOC: {str(s.location or 'N/A').upper()}", "available": round(s_qty, 2), 
                        "utilized": f"AT: {str(s.production_at or 'N/A').upper()}", "balance": round(s_qty, 2)
                    })

        r.ref_opt_stock = round(r.ref_opt_stock, 2)
        r.ref_json = json.dumps(ref_details)

        r.stock_mc = int(opening_bal / mc_wt) if mc_wt > 0 else 0
        r.pending_production = round(r.existed_stock_util - r.ordered_qty, 2)
        r.prod_pending_mc = int(float(r.no_of_mc or 0) - r.actual_produced_mc)
        
        v_data = next((v for v in v_records if str(v.variety_name).strip().lower() == p_var), None)
        peeling_y = float(v_data.peeling_yield or 100) / 100 if v_data else 1.0
        soaking_y = float(v_data.soaking_yield or 100) / 100 if v_data else 1.0
        
        r.hl_count_calc = round(r.net_count_calc * peeling_y * soaking_y, 2) if r.net_count_calc > 0 else 0
        
        r.hoso_count_calc = 0
        r.req_hlso_qty = 0
        r.req_hoso_qty = 0
        
        if "HOSO" in p_var.upper():
            r.hoso_count_calc = r.net_count_calc
            if abs(r.pending_production) > 0:
                r.req_hoso_qty = round(abs(r.pending_production) * w_gl_factor, 2)
        else:
            sp_yields = [y for y in yield_records if str(y.species).strip().lower() == p_spec]
            if sp_yields and r.hl_count_calc > 0:
                nearest_y = min(sp_yields, key=lambda x: abs(float(x.hlso_count or 0) - r.hl_count_calc))
                r.hoso_count_calc = nearest_y.hoso_count
                
                if abs(r.pending_production) > 0 and peeling_y > 0 and soaking_y > 0:
                    r.req_hlso_qty = round((abs(r.pending_production) * w_gl_factor) / (peeling_y * soaking_y), 2)
                    h_yield_pct = float(nearest_y.hlso_yield_pct or 100) / 100
                    r.req_hoso_qty = round(r.req_hlso_qty / h_yield_pct, 2) if h_yield_pct > 0 else 0
        
        final_pending_list.append(r)

    # ========== 6. SOAKING & REJECTION DATA QUEUE (User Scope Filters Locked) ==========
    soak_rej_q = db.query(Soaking).filter(Soaking.company_id == company_code, Soaking.rejection_qty > 0, Soaking.status != 'Completed')
    soak_mon_q = db.query(Soaking).filter(Soaking.company_id == company_code, Soaking.status != 'Completed', Soaking.in_qty > 0)
    
    if g_prod_clean and g_prod_clean != "ALL":
        soak_rej_q = soak_rej_q.filter(func.upper(func.trim(Soaking.production_for)) == g_prod_clean)
        soak_mon_q = soak_mon_q.filter(func.upper(func.trim(Soaking.production_for)) == g_prod_clean)
    if g_loc_clean and g_loc_clean != "ALL":
        soak_rej_q = soak_rej_q.filter(func.upper(func.trim(Soaking.production_at)) == g_loc_clean)
        soak_mon_q = soak_mon_q.filter(func.upper(func.trim(Soaking.production_at)) == g_loc_clean)
    elif user_allowed_locations:
        soak_rej_q = soak_rej_q.filter(func.upper(func.trim(Soaking.production_at)).in_(user_allowed_locations))
        soak_mon_q = soak_mon_q.filter(func.upper(func.trim(Soaking.production_at)).in_(user_allowed_locations))

    rejection_data = soak_rej_q.all()
    soaking_monitor = soak_mon_q.order_by(Soaking.date.asc(), Soaking.sintex_number.asc()).all()

    # ========== 7. BATCH DATA FOR DROPDOWN ==========
    batches_with_company = [
        {"batch_number": g.batch_number, "production_for": g.production_for} 
        for g in db.query(GateEntry).filter(GateEntry.company_id == company_code).order_by(GateEntry.id.desc()).all() if g.batch_number
    ]

    # ========== 8. TODAY'S TRANSACTION LOGS ==========
    start, end = get_today_range()
    today_q = db.query(Production).filter(Production.company_id == company_code, Production.date >= start.date(), Production.date <= end.date())
    
    # 🟢 FIX: "ALL" bypass for Today's logs
    if g_prod_clean and g_prod_clean != "ALL":
        today_q = today_q.filter(func.upper(func.trim(Production.production_for)) == g_prod_clean)
    if g_loc_clean and g_loc_clean != "ALL":
        today_q = today_q.filter(func.upper(func.trim(Production.production_at)) == g_loc_clean)
    elif user_allowed_locations:
        today_q = today_q.filter(func.upper(func.trim(Production.production_at)).in_(user_allowed_locations))
        
    today_data = today_q.order_by(Production.id.desc()).all()

    # ========== 9. EDIT DATA ==========
    edit_data = None
    if edit_id:
        edit_data = db.query(Production).filter(Production.id == edit_id, Production.company_id == company_code).first()

    # ========== 10. POP SESSION MESSAGE ==========
    session_msg = request.session.pop("message", None)
    success_msg = session_msg if session_msg and ("✔" in session_msg or "Successfully" in session_msg or "ok" in session_msg) else None
    error_msg = session_msg if session_msg and not success_msg else None

    # ========== 11. BUILD RESPONSE ==========
    common_data = get_common_data(db, company_code, user_allowed_locations)
    
    if request.query_params.get("format") == "json":
        return JSONResponse({
            "batches_with_company": batches_with_company,
            **common_data,
            "today_data": [
                {
                    "id": r.id,
                    "batch_number": r.batch_number,
                    "brand": r.brand,
                    "variety_name": r.variety_name,
                    "glaze": r.glaze,
                    "freezer": r.freezer,
                    "packing_style": r.packing_style,
                    "grade": r.grade,
                    "species": r.species,
                    "no_of_mc": r.no_of_mc,
                    "loose": r.loose,
                    "production_qty": r.production_qty,
                    "production_type": r.production_type,
                    "production_at": r.production_at,
                    "production_for": r.production_for,
                    "is_cancelled": r.is_cancelled,
                    "status": r.status,
                    "cancel_reason": r.cancel_reason,
                    "cancelled_by": r.cancelled_by,
                    "cancelled_at": safe_isoformat(r.cancelled_at),
                    "date": safe_isoformat(r.date),
                    "time": safe_strftime(r.time),
                    "email": r.email
                } for r in today_data
            ],
            "rejection_data": [
                {
                    "id": r.id,
                    "sintex_number": r.sintex_number,
                    "batch_number": r.batch_number,
                    "variety_name": r.variety_name,
                    "in_count": r.in_count,
                    "in_qty": r.in_qty,
                    "rejection_qty": r.rejection_qty,
                    "rejection_for": r.rejection_for,
                    "chemical_name": r.chemical_name,
                    "chemical_percent": r.chemical_percent,
                    "chemical_qty": r.chemical_qty,
                    "salt_percent": r.salt_percent,
                    "salt_qty": r.salt_qty,
                    "species": r.species,
                    "production_at": r.production_at,
                    "production_for": r.production_for,
                    "is_cancelled": r.is_cancelled,
                    "status": r.status,
                    "date": safe_isoformat(r.date),
                    "time": safe_strftime(r.time),
                    "email": r.email
                } for r in rejection_data
            ],
            "soaking_data": [
                {
                    "id": r.id,
                    "sintex_number": r.sintex_number,
                    "batch_number": r.batch_number,
                    "variety_name": r.variety_name,
                    "in_count": r.in_count,
                    "in_qty": r.in_qty,
                    "rejection_qty": r.rejection_qty,
                    "rejection_for": r.rejection_for,
                    "chemical_name": r.chemical_name,
                    "chemical_percent": r.chemical_percent,
                    "chemical_qty": r.chemical_qty,
                    "salt_percent": r.salt_percent,
                    "salt_qty": r.salt_qty,
                    "species": r.species,
                    "production_at": r.production_at,
                    "production_for": r.production_for,
                    "is_cancelled": r.is_cancelled,
                    "status": r.status,
                    "date": safe_isoformat(r.date),
                    "time": safe_strftime(r.time),
                    "email": r.email
                } for r in soaking_monitor
            ],
            "pending_orders": [
                {
                    "sl_no": r.sl_no,
                    "po_number": r.po_number,
                    "buyer": r.buyer,
                    "date": safe_isoformat(r.date),
                    "shipment_date": safe_isoformat(r.shipment_date),
                    "company_name": r.company_name,
                    "production_at": r.production_at,
                    "brand": r.brand,
                    "species": r.species,
                    "variety": r.variety,
                    "packing_style": r.packing_style,
                    "no_of_mc": r.no_of_mc,
                    "grade": r.grade,
                    "weight_glaze": r.weight_glaze,
                    "count_glaze": r.count_glaze,
                    "freezer": r.freezer,
                    "no_of_pieces": r.no_of_pieces,
                    "actual_produced_mc": getattr(r, 'actual_produced_mc', 0),
                    "available_stock": getattr(r, 'available_stock', 0),
                    "ordered_qty": getattr(r, 'ordered_qty', 0),
                    "existed_stock_util": getattr(r, 'existed_stock_util', 0),
                    "util_json": getattr(r, 'util_json', '[]'),
                    "net_count_calc": getattr(r, 'net_count_calc', 0),
                    "nw_grade": getattr(r, 'nw_grade', '-'),
                    "ref_opt_stock": getattr(r, 'ref_opt_stock', 0),
                    "ref_json": getattr(r, 'ref_json', '[]'),
                    "stock_mc": getattr(r, 'stock_mc', 0),
                    "pending_production": getattr(r, 'pending_production', 0),
                    "prod_pending_mc": getattr(r, 'prod_pending_mc', 0),
                    "hl_count_calc": getattr(r, 'hl_count_calc', 0),
                    "hoso_count_calc": getattr(r, 'hoso_count_calc', 0),
                    "req_hlso_qty": getattr(r, 'req_hlso_qty', 0),
                    "req_hoso_qty": getattr(r, 'req_hoso_qty', 0),
                } for r in final_pending_list
            ],
            "global_production_for": global_production_for or "",
            "global_location": global_location or ""
        })

    return templates.TemplateResponse(
        request=request,
        name="processing/production.html",
        context={
            "batches_with_company": batches_with_company,
            **common_data,
            "today_data": today_data,
            "rejection_data": rejection_data,
            "soaking_data": soaking_monitor,
            "pending_orders": final_pending_list,
            "from_date": from_date or "",
            "to_date": to_date or "",
            "edit_data": edit_data,
            "message": session_msg,
            "success_msg": success_msg,
            "error_msg": error_msg,
            "global_production_for": global_production_for or "",
            "global_location": global_location or ""
        }
    )


# -----------------------------------------------------
# API: UPDATE SOAKING STATUS (AJAX)
# -----------------------------------------------------
@router.post("/production/update_soaking_status/{id}")
async def update_soaking_status(id: int, request: Request, db: Session = Depends(get_db)):
    try:
        data = await request.json()
        new_status = data.get("status")
        company_code = request.session.get("company_code")
        
        if not company_code:
            return JSONResponse({"status": "error", "message": "Unauthorized"}, status_code=401)
        
        entry = db.query(Soaking).filter(Soaking.id == id, Soaking.company_id == company_code).first()
        if entry:
            entry.status = new_status
            db.commit()
            return JSONResponse({"status": "ok", "message": "Status updated"})
        return JSONResponse({"status": "error", "message": "Entry not found"}, status_code=404)
    except Exception as e:
        db.rollback()
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


# -----------------------------------------------------
# API: COMPLETE REJECTION & AUTO-ADD SOAKING OFFSET
# -----------------------------------------------------
@router.post("/production/complete_rejection/{soaking_id}")
def complete_rejection(soaking_id: int, request: Request, db: Session = Depends(get_db)):
    try:
        company_code = request.session.get("company_code")
        email = request.session.get("email")
        
        if not company_code:
            return JSONResponse({"status": "error", "message": "Unauthorized"}, status_code=401)
        
        old_entry = db.query(Soaking).filter(Soaking.id == soaking_id, Soaking.company_id == company_code).first()
        if not old_entry:
            return JSONResponse({"status": "error", "message": "Entry not found"}, status_code=404)

        old_entry.status = "Completed"
        offset_qty = abs(old_entry.rejection_qty)
        current_ist = ist_now()
        
        new_soaking_record = Soaking(
            date=current_ist.date(), time=current_ist.time(), batch_number=old_entry.batch_number,
            production_at=old_entry.production_at, production_for=getattr(old_entry, 'production_for', None), 
            variety_name=old_entry.variety_name, species=old_entry.species, in_count=old_entry.in_count,
            sintex_number=f"AUTO-CLR-{old_entry.sintex_number}", rejection_qty=-offset_qty, 
            in_qty=0, status="Completed", company_id=company_code, email=email
        )
        db.add(new_soaking_record)
        db.commit()
        return JSONResponse({"status": "ok", "message": "Successfully completed and offset entry added."})
    except Exception as e:
        db.rollback()
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


# -----------------------------------------------------
# SAVE PRODUCTION
# -----------------------------------------------------
@router.post("/production")
def save_production(
    request: Request, batch_number: str = Form(...), brand: str = Form(...), variety_name: str = Form(...),
    glaze: str = Form(""), freezer: str = Form(""), packing_style: str = Form(...), grade: str = Form(""),
    species: str = Form(...), no_of_mc: int = Form(0), loose: int = Form(0), production_qty: float = Form(0.0),
    production_type: str = Form(""), production_at: str = Form(""), production_for: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        company_code = request.session.get("company_code")
        email = request.session.get("email")

        if not company_code or not email:
            return RedirectResponse("/auth/login", status_code=302)

        final_production_qty = float(production_qty or 0)
        glaze_text = str(glaze or "").strip().upper()

        if "NWNC" not in glaze_text:
            glaze_percent = extract_number(glaze_text, 0)
            if glaze_percent > 0:
                final_production_qty = round(final_production_qty * ((100 - glaze_percent) / 100), 3)

        current_ist = ist_now()
        obj = Production(
            batch_number=batch_number, brand=brand, variety_name=variety_name, glaze=glaze, freezer=freezer,
            packing_style=packing_style, grade=grade, species=species, no_of_mc=no_of_mc, loose=loose,
            production_qty=final_production_qty, production_type=production_type, production_at=production_at,
            production_for=production_for, company_id=company_code, email=email, date=current_ist.date(), time=current_ist.time()
        )
        db.add(obj)
        db.commit()
        request.session["message"] = "✔ Production Saved Successfully!"
        return RedirectResponse("/processing/production", status_code=303)
    except Exception as e:
        db.rollback()
        request.session["message"] = f"❌ Error: {str(e)}"
        return RedirectResponse("/processing/production", status_code=303)


# -----------------------------------------------------
# EDIT PRODUCTION
# -----------------------------------------------------
@router.get("/production/edit/{id}", response_class=HTMLResponse)
def edit_production(id: int, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/auth/login", status_code=303)
    entry = db.query(Production).filter(Production.id == id, Production.company_id == company_code).first()
    if entry and is_edit_locked(request, entry.date):
        request.session["message"] = f"❌ {edit_lock_message()}"
        return RedirectResponse("/processing/production", status_code=303)
    return RedirectResponse(f"/processing/production?edit_id={id}", status_code=303)


# -----------------------------------------------------
# UPDATE PRODUCTION
# -----------------------------------------------------
@router.post("/production/update/{id}")
def update_production(
    id: int, request: Request, batch_number: str = Form(...), brand: str = Form(...), variety_name: str = Form(...),
    glaze: str = Form(""), freezer: str = Form(""), packing_style: str = Form(...), grade: str = Form(""),
    species: str = Form(...), no_of_mc: int = Form(0), loose: int = Form(0), production_qty: float = Form(0.0),
    production_type: str = Form(""), production_at: str = Form(""), production_for: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        company_code = request.session.get("company_code")
        if not company_code:
            return RedirectResponse("/auth/login", status_code=302)
        
        entry = db.query(Production).filter(Production.id == id, Production.company_id == company_code).first()
        if entry:
            if is_edit_locked(request, entry.date):
                request.session["message"] = f"❌ {edit_lock_message()}"
                return RedirectResponse("/processing/production", status_code=303)
            final_production_qty = float(production_qty or 0)
            glaze_text = str(glaze or "").strip().upper()

            if "NWNC" not in glaze_text:
                glaze_percent = extract_number(glaze_text, 0)
                if glaze_percent > 0:
                    final_production_qty = round(final_production_qty * ((100 - glaze_percent) / 100), 3)

            entry.batch_number = batch_number
            entry.brand = brand
            entry.variety_name = variety_name
            entry.glaze = glaze
            entry.freezer = freezer
            entry.packing_style = packing_style
            entry.grade = grade
            entry.species = species
            entry.no_of_mc = no_of_mc
            entry.loose = loose
            entry.production_qty = final_production_qty
            entry.production_type = production_type
            entry.production_at = production_at
            entry.production_for = production_for
            db.commit()
            request.session["message"] = "✔ Production Updated Successfully!"
        else:
            request.session["message"] = "❌ Entry not found!"
        return RedirectResponse("/processing/production", status_code=303)
    except Exception as e:
        db.rollback()
        request.session["message"] = f"❌ Error: {str(e)}"
        return RedirectResponse("/processing/production", status_code=303)


@router.post("/production/delete/{id}")
def delete_production(
    id: int,
    request: Request,
    cancel_reason: str = Form(None),
    db: Session = Depends(get_db)
):
    try:
        company_code = request.session.get("company_code")
        email = request.session.get("email")
        if not company_code:
            return RedirectResponse("/auth/login", status_code=302)
        
        entry = db.query(Production).filter(Production.id == id, Production.company_id == company_code).first()
        if entry:
            if entry.is_cancelled:
                request.session["message"] = "❌ Already cancelled!"
                return RedirectResponse("/processing/production", status_code=303)

            if is_edit_locked(request, entry.date):
                request.session["message"] = f"❌ {edit_lock_message()}"
                return RedirectResponse("/processing/production", status_code=303)

            # Soft Delete / Cancel
            entry.is_cancelled = True
            entry.status = "Cancelled"
            entry.cancel_reason = cancel_reason.strip() if cancel_reason else "Cancelled by user"
            entry.cancelled_by = email
            entry.cancelled_at = ist_now()

            db.commit()
            request.session["message"] = "✔ Production Cancelled Successfully!"
        else:
            request.session["message"] = "❌ Entry not found!"
        return RedirectResponse("/processing/production", status_code=303)
    except Exception as e:
        db.rollback()
        request.session["message"] = f"❌ Error: {str(e)}"
        return RedirectResponse("/processing/production", status_code=303)
