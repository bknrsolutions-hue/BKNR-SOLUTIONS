from fastapi import APIRouter, Request, Depends, Query
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import distinct, func, and_, or_, cast, String as sa_String
from typing import Optional
from datetime import date, datetime, time, timedelta
import re
from collections import defaultdict

from app.database import get_db

# Models Core Framework Imports
from app.database.models.processing import (
    GateEntry, RawMaterialPurchasing, DeHeading, 
    Peeling, Soaking, Grading, Production
)
from app.database.models.reprocess import Reprocess 
from app.database.models.inventory_management import stock_entry
from app.database.models.criteria import varieties as VarietyTable, HOSO_HLSO_Yields
from app.database.models.floor_balance import FloorBalance, FloorBalanceSnapshot 
from app.database.models.users import Company, User, OTPTable, UserLoginActivity

router = APIRouter(prefix="/summary", tags=["SUMMARY"])
templates = Jinja2Templates(directory="app/templates")

# ============================================================================
# 🟢 HELPER 1: CONVERT ANY SEMI-FINISHED PRODUCT QUANTITY TO HOSO EQUIVALENT
# ============================================================================
def get_hoso_equivalent_qty(db: Session, company_id: str, qty: float, variety: str, count: str, species: str, glaze: str = None):
    if not qty or qty <= 0: return 0.0
    qty = float(qty)
    variety_upper = str(variety or "").upper()

    if glaze:
        try:
            g = str(glaze).replace("%", "").strip()
            if g.isdigit() and float(g) > 0: qty = qty * ((100 - float(g)) / 100)
        except: pass

    hlso_yield = 1.0
    if count:
        try:
            nums = re.findall(r'\d+', str(count))
            if nums:
                last_num = int(nums[-1])
                match_count = last_num - 1
                hlso = db.query(HOSO_HLSO_Yields).filter(HOSO_HLSO_Yields.company_id == company_id, HOSO_HLSO_Yields.hoso_count == match_count, HOSO_HLSO_Yields.species == species).first()
                if hlso and hlso.hlso_yield_pct: hlso_yield = float(hlso.hlso_yield_pct) / 100
        except: pass

    peeling_yield = 1.0
    var_obj = db.query(VarietyTable).filter(VarietyTable.company_id == company_id, VarietyTable.variety_name == variety).first()
    if var_obj and var_obj.peeling_yield: peeling_yield = float(var_obj.peeling_yield) / 100

    if "HOSO" in variety_upper: return round(qty, 4)
    elif "HLSO" in variety_upper: return round(qty / hlso_yield if hlso_yield > 0 else qty, 4)
    else: return round(qty / (hlso_yield * peeling_yield) if (hlso_yield * peeling_yield) > 0 else qty, 4)

# ============================================================================
# 🟢 HELPER 2: VALUE CALCULATION USING REFERENCE AVG RATE SYSTEM
# ============================================================================
def calculate_balance_value(db: Session, company_id: str, batch: str, variety: str, count: str, species: str, qty: float, source_type: str, glaze: str = None):
    avg_rate = 0.0
    if source_type == "RMP":
        rmp_items = db.query(RawMaterialPurchasing).filter(RawMaterialPurchasing.company_id == company_id, RawMaterialPurchasing.batch_number == batch).all()
        tot_amt = sum(float(item.amount or 0) for item in rmp_items)
        tot_qty = sum(get_hoso_equivalent_qty(db, company_id, float(item.received_qty or 0), item.variety_name, item.count, item.species) for item in rmp_items)
        if tot_qty > 0: avg_rate = tot_amt / tot_qty
    elif source_type == "REPROCESS":
        rep_items = db.query(Reprocess).filter(Reprocess.company_id == company_id, Reprocess.new_batch_id == batch).all()
        tot_amt = sum(float(item.inventory_value or 0) for item in rep_items)
        tot_qty = sum(get_hoso_equivalent_qty(db, company_id, float(item.in_qty or 0), item.variety, item.grade, item.species, getattr(item, 'glaze', None)) for item in rep_items)
        if tot_qty > 0: avg_rate = tot_amt / tot_qty
    return round(get_hoso_equivalent_qty(db, company_id, qty, variety, count, species, glaze) * avg_rate, 2)

# ============================================================================
# 🟢 HELPER 3: DYNAMIC DATE + TIME COMBINED BOUNDARY ENGINE (FALLBACK)
# ============================================================================
def calculate_time_bound_floor_balance(
    db: Session, company_id: str, location: str, batch: str, count: str, 
    species: str, variety: str, production_for: str, source_type: str, cutoff_dt: datetime
) -> float:
    variety_upper = variety.strip().upper() if variety else ""
    clean_count = str(count).strip() if count else ""
    cutoff_date_str = cutoff_dt.strftime("%Y-%m-%d")
    cutoff_time_str = cutoff_dt.strftime("%H:%M:%S")

    def apply_filters(query_obj, model_obj, is_repro=False):
        q = query_obj.filter(model_obj.company_id == company_id)
        if hasattr(model_obj, 'date') and hasattr(model_obj, 'time'):
            q = q.filter(or_(model_obj.date < cutoff_date_str, and_(model_obj.date == cutoff_date_str, model_obj.time <= cutoff_time_str)))
        elif hasattr(model_obj, 'date'):
            q = q.filter(model_obj.date <= cutoff_date_str)
        if is_repro: q = q.filter(model_obj.production_at == location, model_obj.new_batch_id == batch, func.trim(cast(model_obj.grade, sa_String)) == clean_count, model_obj.species == species, model_obj.variety == variety)
        else:
            if hasattr(model_obj, 'peeling_at'): q = q.filter(model_obj.peeling_at == location)
            elif hasattr(model_obj, 'production_at'): q = q.filter(model_obj.production_at == location)
            q = q.filter(model_obj.batch_number == batch, model_obj.species == species)
            if hasattr(model_obj, 'variety_name'): q = q.filter(model_obj.variety_name == variety_upper)
            elif hasattr(model_obj, 'variety'): q = q.filter(model_obj.variety == variety_upper)
        if hasattr(model_obj, 'production_for'):
            if production_for and production_for != "N/A": q = q.filter(model_obj.production_for == production_for)
            elif production_for == "N/A": q = q.filter((model_obj.production_for == None) | (model_obj.production_for == ""))
        return q

    main_inward_qty = 0.0
    if source_type == "REPROCESS":
        in_q = apply_filters(db.query(func.coalesce(func.sum(Reprocess.in_qty), 0)), Reprocess, True)
        main_inward_qty = float(in_q.filter(~Reprocess.reprocess_type.in_(['SALES', 'STORING'])).scalar() or 0)
    else:
        rmp_q = apply_filters(db.query(func.coalesce(func.sum(RawMaterialPurchasing.received_qty), 0)), RawMaterialPurchasing)
        main_inward_qty = float(rmp_q.filter(func.trim(cast(RawMaterialPurchasing.count, sa_String)) == clean_count).scalar() or 0)

    s_in = apply_filters(db.query(func.coalesce(func.sum(Soaking.in_qty), 0)), Soaking)
    soaking_in = float(s_in.filter(func.trim(cast(Soaking.in_count, sa_String)) == clean_count).scalar() or 0)

    s_rej = apply_filters(db.query(func.coalesce(func.sum(Soaking.rejection_qty), 0)), Soaking)
    soaking_rejection = float(s_rej.filter(func.trim(cast(Soaking.in_count, sa_String)) == clean_count).scalar() or 0)

    base_stock = main_inward_qty + soaking_rejection - soaking_in
    available = 0.0

    if variety_upper == "HOSO":
        g_p = apply_filters(db.query(func.coalesce(func.sum(Grading.quantity), 0)), Grading).filter(func.trim(cast(Grading.graded_count, sa_String)) == clean_count).scalar() or 0
        g_m = apply_filters(db.query(func.coalesce(func.sum(Grading.quantity), 0)), Grading).filter(func.trim(cast(Grading.hoso_count, sa_String)) == clean_count).scalar() or 0
        dh_u = apply_filters(db.query(func.coalesce(func.sum(DeHeading.hoso_qty), 0)), DeHeading).filter(func.trim(cast(DeHeading.hoso_count, sa_String)) == clean_count).scalar() or 0
        available = base_stock + float(g_p) - float(g_m) - float(dh_u)
    elif variety_upper == "HLSO":
        g_h = apply_filters(db.query(func.coalesce(func.sum(Grading.quantity), 0)), Grading).filter(func.trim(cast(Grading.graded_count, sa_String)) == clean_count).scalar() or 0
        p_q = db.query(func.coalesce(func.sum(Peeling.hlso_qty), 0)).filter(
            Peeling.company_id == company_id, Peeling.batch_number == batch, Peeling.peeling_at == location, Peeling.species == species,
            func.trim(cast(Peeling.hlso_count, sa_String)) == clean_count
        )
        p_q = p_q.filter(or_(Peeling.date < cutoff_date_str, and_(Peeling.date == cutoff_date_str, Peeling.time <= cutoff_time_str)))
        p_u = p_q.scalar() or 0
        available = base_stock + float(g_h) - float(p_u)
    else:
        p_q = apply_filters(db.query(func.coalesce(func.sum(Peeling.peeled_qty), 0)), Peeling).filter(func.trim(cast(Peeling.hlso_count, sa_String)) == clean_count).scalar() or 0
        available = base_stock + float(p_q)

    return round(max(available, 0.0), 2)


# ============================================================================
# 🟢 MAIN PERIODIC REPORT ROUTER ENDPOINT (OPTIMIZED ⚡)
# ============================================================================
@router.get("/periodic-report", response_class=HTMLResponse)
async def get_periodic_summary_report(
    request: Request,
    date_filter_type: str = Query("today"),
    selected_month: str = Query(None),
    start_date: str = Query(None),
    end_date: str = Query(None),
    fy: str = Query(None),
    production_for: str = Query(None),
    prod_type: str = Query("RMP"),
    batch: str = Query(None),
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")
    if not company_code: return RedirectResponse("/auth/login", status_code=303)
        
    today_dt = date.today()
    if date_filter_type == "yesterday":
        res_start_dt = today_dt - timedelta(days=1)
        res_end_dt = today_dt - timedelta(days=1)
    elif date_filter_type == "month" and selected_month:
        try:
            yr, mn = map(int, selected_month.split("-"))
            res_start_dt = date(yr, mn, 1)
            res_end_dt = date(yr + 1, 1, 1) - timedelta(days=1) if mn == 12 else date(yr, mn + 1, 1) - timedelta(days=1)
        except:
            res_start_dt = date(today_dt.year, today_dt.month, 1)
            res_end_dt = today_dt
    elif date_filter_type == "between" and start_date and end_date:
        try:
            res_start_dt = date.fromisoformat(start_date)
            res_end_dt = date.fromisoformat(end_date)
        except:
            res_start_dt, res_end_dt = today_dt, today_dt
    else:
        res_start_dt, res_end_dt = today_dt, today_dt

    # ------------------------------------------------------------------------
    # 🕒 TIME-BOUND CUTOFF BOUNDARIES (08:59:59 AM)
    # ------------------------------------------------------------------------
    opening_cutoff_dt = datetime.combine(res_start_dt, time(8, 59, 59))
    closing_cutoff_dt = datetime.combine(res_end_dt + timedelta(days=1), time(8, 59, 59))
    
    db_start_date = res_start_dt.strftime("%Y-%m-%d")
    db_end_date = res_end_dt.strftime("%Y-%m-%d")

    companies = [c[0] for c in db.query(distinct(GateEntry.production_for)).filter(GateEntry.company_id == company_code).all() if c[0]]

    # Financial Years Generation
    all_dates = db.query(GateEntry.date).filter(GateEntry.company_id == company_code, GateEntry.date != None).all()
    fy_set = set()
    for d_tuple in all_dates:
        d = d_tuple[0]
        current_year = d.year
        if d.month >= 4: fy_str = f"{current_year}-{str(current_year + 1)[2:]}"
        else: fy_str = f"{current_year - 1}-{str(current_year)[2:]}"
        fy_set.add(fy_str)
    financial_years = sorted(list(fy_set), reverse=True)

    batches = []
    card = defaultdict(float)
    card["supplier_name"] = "N/A"
    card["purchasing_location"] = "N/A"
    card["receiving_center"] = "N/A"
    card["vehicle_number"] = "N/A"
    card["challan_number"] = "N/A"
    card["gate_pass_number"] = "N/A"
    
    rows = {
        "gate": [], "rmp": [], "deheading": [], "peeling": [], 
        "soaking": [], "production": [], "stock": [], "reprocess": [],
        "grading_details": [], "grading_summary": [], "opening_floor_balance": [], "closing_floor_balance": []
    }
    subtotals = {}

    # DYNAMIC DATE RANGE QUERIES (Applies to all tables)
    gate_q = db.query(GateEntry).filter(GateEntry.company_id == company_code, GateEntry.date >= db_start_date, GateEntry.date <= db_end_date)
    rmp_q = db.query(RawMaterialPurchasing).filter(RawMaterialPurchasing.company_id == company_code, RawMaterialPurchasing.date >= db_start_date, RawMaterialPurchasing.date <= db_end_date)
    rep_q = db.query(Reprocess).filter(Reprocess.company_id == company_code, Reprocess.date >= db_start_date, Reprocess.date <= db_end_date)
    deh_q = db.query(DeHeading).filter(DeHeading.company_id == company_code, DeHeading.date >= db_start_date, DeHeading.date <= db_end_date)
    pel_q = db.query(Peeling).filter(Peeling.company_id == company_code, Peeling.date >= db_start_date, Peeling.date <= db_end_date)
    soak_q = db.query(Soaking).filter(Soaking.company_id == company_code, Soaking.date >= db_start_date, Soaking.date <= db_end_date)
    prod_q = db.query(Production).filter(Production.company_id == company_code, Production.date >= db_start_date, Production.date <= db_end_date)
    grd_q = db.query(Grading).filter(Grading.company_id == company_code, Grading.date >= db_start_date, Grading.date <= db_end_date)
    stk_q = db.query(stock_entry).filter(stock_entry.company_id == company_code, stock_entry.cargo_movement_type == 'IN', stock_entry.date >= db_start_date, stock_entry.date <= db_end_date)

    # Apply 'Production For' Filter
    if production_for:
        gate_q = gate_q.filter(func.trim(GateEntry.production_for) == func.trim(production_for))
        rmp_q = rmp_q.filter(func.trim(RawMaterialPurchasing.production_for) == func.trim(production_for))
        rep_q = rep_q.filter(func.trim(Reprocess.production_for) == func.trim(production_for))
        deh_q = deh_q.filter(func.trim(DeHeading.production_for) == func.trim(production_for))
        pel_q = pel_q.filter(func.trim(Peeling.production_for) == func.trim(production_for))
        soak_q = soak_q.filter(func.trim(Soaking.production_for) == func.trim(production_for))
        prod_q = prod_q.filter(func.trim(Production.production_for) == func.trim(production_for))
        grd_q = grd_q.filter(func.trim(Grading.production_for) == func.trim(production_for))
        stk_q = stk_q.filter(func.trim(stock_entry.production_for) == func.trim(production_for))

    # Fetch Batches Dropdown List (After Date & Production For Filters)
    if prod_type == "RMP":
        batches = sorted([b[0] for b in rmp_q.with_entities(distinct(RawMaterialPurchasing.batch_number)).all() if b[0]])
        if not batches:
            batches = sorted([b[0] for b in gate_q.with_entities(distinct(GateEntry.batch_number)).all() if b[0]])
    else:
        batches = sorted([b[0] for b in rep_q.with_entities(distinct(Reprocess.new_batch_id)).all() if b[0]])

    # Apply 'Batch' Filter if User Selected One
    if batch:
        gate_q = gate_q.filter(GateEntry.batch_number == batch)
        rmp_q = rmp_q.filter(RawMaterialPurchasing.batch_number == batch)
        rep_q = rep_q.filter(Reprocess.new_batch_id == batch)
        deh_q = deh_q.filter(DeHeading.batch_number == batch)
        pel_q = pel_q.filter(Peeling.batch_number == batch)
        soak_q = soak_q.filter(Soaking.batch_number == batch)
        prod_q = prod_q.filter(Production.batch_number == batch)
        grd_q = grd_q.filter(Grading.batch_number == batch)
        stk_q = stk_q.filter(stock_entry.batch_number == batch)

    # Execute the Final Queries to Fetch the Rows
    rows["gate"] = gate_q.all()
    rows["rmp"] = rmp_q.all()
    rows["reprocess"] = rep_q.all()
    rows["deheading"] = deh_q.all()
    rows["peeling"] = pel_q.all()
    rows["soaking"] = soak_q.all()
    rows["production"] = prod_q.all()
    rows["grading_details"] = grd_q.all()
    rows["stock"] = stk_q.all()

    # Calculate Data Tracking Defaults for Supplier Details
    if rows["gate"]:
        card["supplier_name"] = rows["gate"][0].supplier_name
        card["purchasing_location"] = rows["gate"][0].purchasing_location
        card["receiving_center"] = rows["gate"][0].receiving_center
        card["vehicle_number"] = rows["gate"][0].vehicle_number
        card["challan_number"] = rows["gate"][0].challan_number
        card["gate_pass_number"] = rows["gate"][0].gate_pass_number
    elif rows["rmp"]:
        card["supplier_name"] = rows["rmp"][0].supplier_name
    elif prod_type == "REPROCESS" and rows["reprocess"]:
        rep = rows["reprocess"][0]
        card.update({"supplier_name": "INTERNAL REPROCESS", "purchasing_location": rep.location, "receiving_center": rep.production_at})

    # IN-MEMORY OPTIMIZED LOOKUPS
    yield_map = {(r.species, str(r.hoso_count)): float(r.hlso_yield_pct or 0) / 100 for r in db.query(HOSO_HLSO_Yields).filter(HOSO_HLSO_Yields.company_id == company_code).all()}
    var_records = db.query(VarietyTable).filter(VarietyTable.company_id == company_code).all()
    var_map = {str(v.variety_name).strip().upper(): float(v.soaking_yield or 0) for v in var_records}

    deheading_hoso_map = defaultdict(float)
    for r in rows["deheading"]: 
        deheading_hoso_map[(r.batch_number, r.species, str(r.hoso_count))] += float(r.hoso_qty or 0)

    soaking_map = defaultdict(float)
    for s in rows["soaking"]:
        k = (str(s.batch_number or "").strip(), str(s.variety_name or "").strip(), str(s.species or "").strip())
        soaking_map[k] += float(s.in_qty or 0) - float(s.rejection_qty or 0)

    # --- GRADING SUMMARY LOGIC ---
    grouped = defaultdict(list)
    for r in rows["grading_details"]: 
        grouped[(r.batch_number, r.species, str(r.hoso_count), r.variety_name)].append(r)

    grading_summary = []
    for (batch_no, species, hoso_count, variety), items in grouped.items():
        graded_qty_sum = sum(float(i.quantity or 0) for i in items)
        base = sum(float(i.graded_count or 0) * float(i.quantity or 0) for i in items)
        yield_factor = yield_map.get((species, hoso_count), 0)

        actual_hoso_qty = graded_qty_sum if variety == "HOSO" else deheading_hoso_map.get((batch_no, species, hoso_count), 0)

        workout = (base / graded_qty_sum if graded_qty_sum > 0 else 0)
        if variety == "HLSO": workout = workout * 2.2 * yield_factor

        yield_pct = (graded_qty_sum / actual_hoso_qty * 100 if actual_hoso_qty > 0 else 0)
        grading_hoso_qty = (graded_qty_sum / yield_factor if variety == "HLSO" and yield_factor > 0 else graded_qty_sum)
        diff_kg = (grading_hoso_qty - actual_hoso_qty if variety == "HLSO" else 0)
        diff_pct = (diff_kg / actual_hoso_qty * 100 if actual_hoso_qty > 0 else 0)

        grading_summary.append({
            "batch_number": batch_no, "species": species, "hoso_count": hoso_count, "variety": variety,
            "hoso_qty": round(actual_hoso_qty, 2), "graded_qty": round(graded_qty_sum, 2),
            "workout_count": round(workout, 2), "yield_pct": round(yield_pct, 2),
            "grading_hoso_qty": round(grading_hoso_qty, 2), "weight_diff_kg": round(diff_kg, 2),
            "weight_diff_pct": round(diff_pct, 2)
        })
    rows["grading_summary"] = grading_summary

    # --- PRODUCTION SUBTOTALS & YIELD DIFF LOGIC ---
    subtotals = {}
    for p in rows["production"]:
        v_name, s_name, b_num = str(p.variety_name or "").strip(), str(p.species or "").strip(), str(p.batch_number or "").strip()
        key = (str(p.production_for or "").strip(), str(p.production_at or "").strip(), s_name, v_name, b_num)
        
        if key not in subtotals:
            target_yield = var_map.get(v_name.upper(), 0.0)
            soaking_in = soaking_map.get((b_num, v_name, s_name), 0.0)
            subtotals[key] = {"prod_qty": 0.0, "target_yield": target_yield, "soaking_in": float(soaking_in), "actual_yield": 0.0, "diff_yield_perc": 0.0, "diff_qty": 0.0}
        subtotals[key]["prod_qty"] += float(p.production_qty or 0)

    for p in rows["production"]:
        v_name, s_name, b_num = str(p.variety_name or "").strip(), str(p.species or "").strip(), str(p.batch_number or "").strip()
        key = (str(p.production_for or "").strip(), str(p.production_at or "").strip(), s_name, v_name, b_num)
        s = subtotals[key]
        p.target_yield_percent = s["target_yield"]
        
        if s["soaking_in"] > 0:
            s["actual_yield"] = round((s["prod_qty"] / s["soaking_in"]) * 100, 2)
            s["diff_yield_perc"] = round(s["actual_yield"] - s["target_yield"], 2)
            expected_qty = (s["soaking_in"] * s["target_yield"]) / 100
            s["diff_qty"] = round(s["prod_qty"] - expected_qty, 2)
            
            if s["prod_qty"] > 0:
                row_ratio = float(p.production_qty or 0) / s["prod_qty"]
                p.diff_qty = round(s["diff_qty"] * row_ratio, 2)
                p.diff_percent = s["diff_yield_perc"]
            else:
                p.diff_qty = 0.0; p.diff_percent = 0.0
        else:
            s["actual_yield"] = 0.0; s["diff_yield_perc"] = 0.0; s["diff_qty"] = 0.0
            p.diff_qty = 0.0; p.diff_percent = 0.0

    for r in rows["stock"]: 
        r.product_kg_value = float(r.product_kg_value or 0.0)
        r.inventory_value = float(r.inventory_value or 0.0)

    # ============================================================================
    # 🚀 REAL LAYER SWITCH: SNAPSHOT SPECIFIC DATE MATCHING ENGINE (STRICT)
    # ============================================================================
    opening_floor_balance_list = []
    closing_floor_balance_list = []
    total_open_floor_val = 0.0
    total_floor_val = 0.0

    is_today_active = (res_end_dt == date.today()) # 🟢 Mapped directly onto active live target dates

    # 1. 🟢 STRICT OPENING LAYER: Always derived from Snapshot on res_start_dt. If empty, defaults to 0.
    opening_snap_q = db.query(FloorBalanceSnapshot).filter(
        FloorBalanceSnapshot.company_id == company_code,
        FloorBalanceSnapshot.snapshot_date == res_start_dt
    )
    if production_for: opening_snap_q = opening_snap_q.filter(func.trim(FloorBalanceSnapshot.production_for) == func.trim(production_for))
    if batch: opening_snap_q = opening_snap_q.filter(FloorBalanceSnapshot.batch_number == batch)
    
    for r in opening_snap_q.all():
        if r.opening_qty and float(r.opening_qty) > 0.01:
            val = float(r.inventory_value or 0.0)
            total_open_floor_val += val
            opening_floor_balance_list.append({
                "batch_number": r.batch_number, "peeling_at": r.location, "count": r.count or "N/A", "species": r.species or "N/A", 
                "variety": r.variety, "available_qty": float(r.opening_qty or 0.0), "value": val, "production_for": r.production_for
            })

    # 2. 🟢 CONDITIONAL CLOSING LAYER: Live Table vs Snapshot Table (res_end_dt + 1 Day)
    if is_today_active:
        # If End Date is Upto Today: Extract live balance states from FloorBalance table
        close_date_str = closing_cutoff_dt.strftime("%Y-%m-%d")
        close_time_str = closing_cutoff_dt.strftime("%H:%M:%S")

        closing_query = db.query(FloorBalance).filter(FloorBalance.company_id == company_code)
        if production_for: closing_query = closing_query.filter(func.trim(FloorBalance.production_for) == func.trim(production_for))
        if batch: closing_query = closing_query.filter(FloorBalance.batch_number == batch)
        
        raw_closing_records = closing_query.filter(
            or_(
                FloorBalance.date < close_date_str,
                and_(FloorBalance.date == close_date_str, FloorBalance.time <= close_time_str)
            )
        ).all()

        latest_close_map = {}
        for r in raw_closing_records:
            key = (r.batch_number, r.location, r.species, r.variety, r.count)
            r_dt = f"{r.date} {r.time}" if r.date and r.time else "0000-00-00 00:00:00"
            if key not in latest_close_map or r_dt > latest_close_map[key]['dt']:
                latest_close_map[key] = {'record': r, 'dt': r_dt}

        for item in latest_close_map.values():
            r = item['record']
            if r.available_qty and float(r.available_qty) > 0.01:
                val = float(r.inventory_value or 0.0)
                total_floor_val += val
                closing_floor_balance_list.append({
                    "batch_number": r.batch_number, "peeling_at": r.location, "count": r.count or "N/A", "species": r.species or "N/A", 
                    "variety": r.variety, "available_qty": float(r.available_qty or 0.0), "value": val, "production_for": r.production_for
                })
    else:
        # If End Date is a Past Frame: Query Snapshot Table strictly on target_close_date (res_end_dt + 1)
        target_snap_close_date = res_end_dt + timedelta(days=1)
        closing_snap_q = db.query(FloorBalanceSnapshot).filter(
            FloorBalanceSnapshot.company_id == company_code,
            FloorBalanceSnapshot.snapshot_date == target_snap_close_date
        )
        if production_for: closing_snap_q = closing_snap_q.filter(func.trim(FloorBalanceSnapshot.production_for) == func.trim(production_for))
        if batch: closing_snap_q = closing_snap_q.filter(FloorBalanceSnapshot.batch_number == batch)
        
        for r in closing_snap_q.all():
            if r.opening_qty and float(r.opening_qty) > 0.01:
                val = float(r.inventory_value or 0.0)
                total_floor_val += val
                closing_floor_balance_list.append({
                    "batch_number": r.batch_number, "peeling_at": r.location, "count": r.count or "N/A", "species": r.species or "N/A", 
                    "variety": r.variety, "available_qty": float(r.opening_qty or 0.0), "value": val, "production_for": r.production_for
                })

    # Assign KPI metrics dynamically
    card["gate_boxes"] = sum(int(r.no_of_material_boxes or 0) for r in rows["gate"])
    card["rmp_qty"] = sum(float(r.received_qty or 0) for r in rows["rmp"])
    card["rmp_amount"] = sum(float(r.amount or 0) for r in rows["rmp"])
    card["reprocess_qty"] = sum(float(r.in_qty or 0) for r in rows["reprocess"])
    card["reprocess_amount"] = sum(float(r.inventory_value or 0) for r in rows["reprocess"])
    
    card["deh_hoso"] = sum(float(d.hoso_qty or 0) for d in rows["deheading"])
    card["deh_hlso"] = sum(float(d.hlso_qty or 0) for d in rows["deheading"])
    card["grd_qty"] = sum(float(g.quantity or 0) for g in rows["grading_details"])
    card["pel_peeled"] = sum(float(p.peeled_qty or 0) for p in rows["peeling"])
    
    card["soaking_qty"] = sum(float(s.in_qty or 0) for s in rows["soaking"])
    card["chemical_qty"] = sum(float(s.chemical_qty or 0) for s in rows["soaking"])
    card["salt_qty"] = sum(float(s.salt_qty or 0) for s in rows["soaking"])
    card["production_qty"] = sum(float(pr.production_qty or 0) for pr in rows["production"])
    card["stock_qty"] = sum(float(st.quantity or 0) for st in rows["stock"])
    card["stock_amount"] = sum(float(st.inventory_value or 0) for st in rows["stock"])
    
    card["floor_qty"] = round(total_open_floor_val, 2)
    card["floor_amount"] = round(total_open_floor_val, 2)
    card["floor_closing_qty"] = round(sum(f["available_qty"] for f in closing_floor_balance_list), 2)
    card["floor_closing_val"] = round(total_floor_val, 2)
    card["floor_opening_qty"] = round(sum(f["available_qty"] for f in opening_floor_balance_list), 2)
    card["floor_opening_val"] = round(total_open_floor_val, 2)

    return templates.TemplateResponse(
        request=request, name="summary/periodic_summary.html", 
        context={
            "financial_years": financial_years,
            "selected_fy": fy,
            "selected_date_filter": date_filter_type,
            "selected_month": selected_month,
            "selected_start_date": start_date,
            "selected_end_date": end_date,
            "companies": companies, 
            "batches": batches, 
            "selected_company": production_for, 
            "selected_prod_type": prod_type, 
            "selected_batch": batch, 
            "rows": rows, 
            "card": card, 
            "subtotals": subtotals,
            "opening_floor_balance": opening_floor_balance_list,
            "closing_floor_balance": closing_floor_balance_list,
            "hoso_floor_balance": closing_floor_balance_list
        }
    )