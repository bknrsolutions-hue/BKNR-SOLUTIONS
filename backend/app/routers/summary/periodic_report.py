from fastapi import APIRouter, Request, Depends, Query
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse
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
from app.database.models.floor_balance import FloorBalance

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
# 🟢 HELPER 3: DYNAMIC DATE + TIME COMBINED BOUNDARY ENGINE
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
            q = q.filter(
                or_(
                    model_obj.date < cutoff_date_str,
                    and_(model_obj.date == cutoff_date_str, model_obj.time <= cutoff_time_str)
                )
            )
        elif hasattr(model_obj, 'date'):
            q = q.filter(model_obj.date <= cutoff_date_str)
        
        if is_repro:
            q = q.filter(
                model_obj.production_at == location,
                model_obj.new_batch_id == batch,
                func.trim(cast(model_obj.grade, sa_String)) == clean_count,
                model_obj.species == species,
                model_obj.variety == variety
            )
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

    # STEP 1: MAIN INWARD
    main_inward_qty = 0.0
    if source_type == "REPROCESS":
        in_q = apply_filters(db.query(func.coalesce(func.sum(Reprocess.in_qty), 0)), Reprocess, True)
        main_inward_qty = float(in_q.filter(~Reprocess.reprocess_type.in_(['SALES', 'STORING'])).scalar() or 0)
    else:
        rmp_q = apply_filters(db.query(func.coalesce(func.sum(RawMaterialPurchasing.received_qty), 0)), RawMaterialPurchasing)
        main_inward_qty = float(rmp_q.filter(func.trim(cast(RawMaterialPurchasing.count, sa_String)) == clean_count).scalar() or 0)

    # STEP 2: COMMON IMPACTS (SOAKING)
    s_in = apply_filters(db.query(func.coalesce(func.sum(Soaking.in_qty), 0)), Soaking)
    soaking_in = float(s_in.filter(func.trim(cast(Soaking.in_count, sa_String)) == clean_count).scalar() or 0)

    s_rej = apply_filters(db.query(func.coalesce(func.sum(Soaking.rejection_qty), 0)), Soaking)
    soaking_rejection = float(s_rej.filter(func.trim(cast(Soaking.in_count, sa_String)) == clean_count).scalar() or 0)

    base_stock = main_inward_qty + soaking_rejection - soaking_in
    available = 0.0

    # STEP 3: VARIETY SPECIFIC LOGIC
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
        if production_for and production_for != "N/A": p_q = p_q.filter(Peeling.production_for == production_for)
        elif production_for == "N/A": p_q = p_q.filter((Peeling.production_for == None) | (Peeling.production_for == ""))
        p_u = p_q.scalar() or 0
        available = base_stock + float(g_h) - float(p_u)
    else:
        p_q = apply_filters(db.query(func.coalesce(func.sum(Peeling.peeled_qty), 0)), Peeling).filter(func.trim(cast(Peeling.hlso_count, sa_String)) == clean_count).scalar() or 0
        available = base_stock + float(p_q)

    return round(max(available, 0.0), 2)


# ============================================================================
# 🟢 MAIN PERIODIC REPORT ROUTER ENDPOINT
# ============================================================================
@router.get("/periodic-report", response_class=HTMLResponse)
async def get_periodic_summary_report(
    request: Request,
    date_filter_type: Optional[str] = Query("today"),
    selected_month: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    production_for: Optional[str] = Query(None),
    supplier_name: Optional[str] = Query(None),
    contractor_name: Optional[str] = Query(None),
    batch: Optional[str] = Query(None),
    prod_type: Optional[str] = Query("RMP"),
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
    # 🕒 RESOLVE EXACT TIME-BOUND CUTOFF BOUNDARIES (09:00:00 AM Constraint)
    # ------------------------------------------------------------------------
    # Opening Balance Layer: Up to First Filtering Day at 08:59:59 AM
    opening_cutoff_dt = datetime.combine(res_start_dt, time(8, 59, 59))
    
    # Closing Balance Layer: Up to Next Day after End Date at 08:59:59 AM
    closing_cutoff_dt = datetime.combine(res_end_dt + timedelta(days=1), time(8, 59, 59))

    # Dropdowns Loader
    companies = [c[0] for c in db.query(distinct(GateEntry.production_for)).filter(GateEntry.company_id == company_code).all() if c[0]]
    suppliers = [s[0] for s in db.query(distinct(GateEntry.supplier_name)).filter(GateEntry.company_id == company_code).all() if s[0]]
    contractors = [c[0] for c in db.query(distinct(DeHeading.contractor)).filter(DeHeading.company_id == company_code).all() if c[0]]
    batches = sorted([b[0] for b in db.query(distinct(GateEntry.batch_number)).filter(GateEntry.company_id == company_code, GateEntry.date >= res_start_dt, GateEntry.date <= res_end_dt).all() if b[0]])

    # Data logs container
    gate_q = db.query(GateEntry).filter(GateEntry.company_id == company_code, GateEntry.date >= res_start_dt, GateEntry.date <= res_end_dt).order_by(GateEntry.supplier_name)
    rmp_q = db.query(RawMaterialPurchasing).filter(RawMaterialPurchasing.company_id == company_code, RawMaterialPurchasing.date >= res_start_dt, RawMaterialPurchasing.date <= res_end_dt).order_by(RawMaterialPurchasing.supplier_name)
    rep_q = db.query(Reprocess).filter(Reprocess.company_id == company_code, Reprocess.date >= res_start_dt, Reprocess.date <= res_end_dt)
    deh_q = db.query(DeHeading).filter(DeHeading.company_id == company_code, DeHeading.date >= res_start_dt, DeHeading.date <= res_end_dt).order_by(DeHeading.contractor)
    pel_q = db.query(Peeling).filter(Peeling.company_id == company_code, Peeling.date >= res_start_dt, Peeling.date <= res_end_dt).order_by(Peeling.contractor_name)
    soak_q = db.query(Soaking).filter(Soaking.company_id == company_code, Soaking.date >= res_start_dt, Soaking.date <= res_end_dt).order_by(Soaking.batch_number)
    prod_q = db.query(Production).filter(Production.company_id == company_code, Production.date >= res_start_dt, Production.date <= res_end_dt).order_by(Production.batch_number)
    grd_q = db.query(Grading).filter(Grading.company_id == company_code, Grading.date >= res_start_dt, Grading.date <= res_end_dt).order_by(Grading.batch_number)
    stk_q = db.query(stock_entry).filter(stock_entry.company_id == company_code, stock_entry.date >= res_start_dt, stock_entry.date <= res_end_dt).order_by(stock_entry.variety)

    if production_for:
        gate_q, rmp_q, rep_q, deh_q, pel_q, prod_q, stk_q = [q.filter(func.trim(m.production_for) == func.trim(production_for)) for q, m in [(gate_q, GateEntry), (rmp_q, RawMaterialPurchasing), (rep_q, Reprocess), (deh_q, DeHeading), (pel_q, Peeling), (prod_q, Production), (stk_q, stock_entry)]]
    if supplier_name:
        gate_q = gate_q.filter(func.trim(GateEntry.supplier_name) == func.trim(supplier_name))
        rmp_q = rmp_q.filter(func.trim(RawMaterialPurchasing.supplier_name) == func.trim(supplier_name))
    if contractor_name:
        deh_q = deh_q.filter(func.trim(DeHeading.contractor) == func.trim(contractor_name))
        pel_q = pel_q.filter(func.trim(Peeling.contractor_name) == func.trim(contractor_name))
    if batch:
        gate_q, rmp_q, deh_q, pel_q, soak_q, prod_q, grd_q, stk_q = [q.filter(m.batch_number == batch) if m != Reprocess else q.filter(m.new_batch_id == batch) for q, m in [(gate_q, GateEntry), (rmp_q, RawMaterialPurchasing), (deh_q, DeHeading), (pel_q, Peeling), (soak_q, Soaking), (prod_q, Production), (grd_q, Grading), (stk_q, stock_entry)]]

    rows = {
        "gate": gate_q.all(), "rmp": rmp_q.all(), "deheading": deh_q.all(), "peeling": pel_q.all(), 
        "soaking": soak_q.all(), "production": prod_q.all(), "stock": stk_q.all(), "reprocess": rep_q.all(), 
        "grading_details": grd_q.all(), "grading_summary": []
    }

    # Extract historical matrix combinations across records safely
    all_historic_rmp = db.query(RawMaterialPurchasing).filter(RawMaterialPurchasing.company_id == company_code).all()
    all_historic_grd = db.query(Grading).filter(Grading.company_id == company_code).all()
    all_historic_pel = db.query(Peeling).filter(Peeling.company_id == company_code).all()
    all_historic_rep = db.query(Reprocess).filter(Reprocess.company_id == company_code).all()

    combos = set()
    for r in all_historic_rmp:
        if r.batch_number: combos.add((r.batch_number, r.count, r.species, r.variety_name, r.production_for, r.peeling_at or "Floor", "RMP", None))
    for r in all_historic_grd:
        if r.batch_number: combos.add((r.batch_number, r.graded_count, r.species, r.variety_name, r.production_for, r.peeling_at or "Floor", "RMP", None))
    for r in all_historic_pel:
        if r.batch_number: combos.add((r.batch_number, r.hlso_count, r.species, r.variety_name, r.production_for, r.peeling_at or "Floor", "RMP", None))
    for r in all_historic_rep:
        if r.new_batch_id: combos.add((r.new_batch_id, r.grade, r.species, r.variety, r.production_for, r.production_at or "Floor", "REPROCESS", getattr(r, 'glaze', None)))

    closing_floor_balance_list, opening_floor_balance_list = [], []
    total_opening_val, total_closing_val = 0.0, 0.0

    for b_id, c_val, s_val, v_name, p_for, loc, s_type, glaze_info in combos:
        # 🟢 CLOSING BALANCE SYSTEM (Evaluates up to Next Day 08:59:59 AM)
        closing_avail = calculate_time_bound_floor_balance(db, company_code, loc or "Floor", b_id, c_val, s_val, v_name, p_for, s_type, closing_cutoff_dt)
        if closing_avail > 0.01:
            val = calculate_balance_value(db, company_code, b_id, v_name, c_val, s_val, closing_avail, s_type, glaze_info)
            total_closing_val += val
            closing_floor_balance_list.append({"batch_number": b_id, "peeling_at": loc, "count": c_val or "N/A", "species": s_val or "N/A", "variety": v_name, "available_qty": closing_avail, "value": val})

        # 🟢 OPENING BALANCE SYSTEM (Evaluates up to Filter Start Day 08:59:59 AM)
        opening_avail = calculate_time_bound_floor_balance(db, company_code, loc or "Floor", b_id, c_val, s_val, v_name, p_for, s_type, opening_cutoff_dt)
        if opening_avail > 0.01:
            val = calculate_balance_value(db, company_code, b_id, v_name, c_val, s_val, opening_avail, s_type, glaze_info)
            total_opening_val += val
            opening_floor_balance_list.append({"batch_number": b_id, "peeling_at": loc, "count": c_val or "N/A", "species": s_val or "N/A", "variety": v_name, "available_qty": opening_avail, "value": val})
            
    rows["closing_floor_balance"] = closing_floor_balance_list
    rows["opening_floor_balance"] = opening_floor_balance_list

    # Grading summary & Production subtotals engine loops execution
    yield_map = {(r.species, str(r.hoso_count)): float(r.hlso_yield_pct or 0) / 100 for r in db.query(HOSO_HLSO_Yields).filter(HOSO_HLSO_Yields.company_id == company_code).all()}
    deheading_hoso_map = defaultdict(float)
    for r in rows["deheading"]: deheading_hoso_map[(r.batch_number, r.species, str(r.hoso_count))] += float(r.hoso_qty or 0)

    grouped_grading = defaultdict(list)
    for r in rows["grading_details"]: grouped_grading[(r.batch_number, r.species, str(r.hoso_count), r.variety_name)].append(r)

    grading_summary = []
    for (b_num, species, hoso_count, variety), items in grouped_grading.items():
        graded_qty_sum = sum(float(i.quantity or 0) for i in items)
        base = sum(float(i.graded_count or 0) * float(i.quantity or 0) for i in items)
        yield_factor = yield_map.get((species, hoso_count), 0)
        actual_hoso_qty = graded_qty_sum if variety == "HOSO" else deheading_hoso_map.get((b_num, species, hoso_count), 0)
        workout = (base / graded_qty_sum if graded_qty_sum > 0 else 0)
        if variety == "HLSO": workout = workout * 2.2 * yield_factor
        yield_pct = (graded_qty_sum / actual_hoso_qty * 100 if actual_hoso_qty > 0 else 0)
        grading_hoso_qty = (graded_qty_sum / yield_factor if variety == "HLSO" and yield_factor > 0 else graded_qty_sum)
        diff_kg = (grading_hoso_qty - actual_hoso_qty if variety == "HLSO" else 0)
        diff_pct = (diff_kg / actual_hoso_qty * 100 if actual_hoso_qty > 0 else 0)

        grading_summary.append({
            "batch_number": b_num, "species": species, "hoso_count": hoso_count, "variety": variety,
            "hoso_qty": round(actual_hoso_qty, 2), "graded_qty": round(graded_qty_sum, 2),
            "workout_count": round(workout, 2), "yield_pct": round(yield_pct, 2),
            "grading_hoso_qty": round(grading_hoso_qty, 2), "weight_diff_kg": round(diff_kg, 2),
            "weight_diff_pct": round(diff_pct, 2)
        })
    rows["grading_summary"] = grading_summary

    subtotals = {}
    for p in rows["production"]:
        v_name, s_name, b_num = str(p.variety_name or "").strip(), str(p.species or "").strip(), str(p.batch_number or "").strip()
        key = (str(p.production_for or "").strip(), str(p.production_at or "").strip(), s_name, v_name, b_num)
        
        if key not in subtotals:
            var_data = db.query(VarietyTable).filter(VarietyTable.company_id == company_code, func.trim(VarietyTable.variety_name) == v_name).first()
            target_yield = float(var_data.soaking_yield or 0) if var_data else 0.0
            soaking_in = db.query(func.sum(Soaking.in_qty - Soaking.rejection_qty)).filter(Soaking.company_id == company_code, Soaking.batch_number == b_num, func.trim(Soaking.variety_name) == v_name, func.trim(Soaking.species) == s_name).scalar() or 0.0
            subtotals[key] = {"prod_qty": 0.0, "target_yield": target_yield, "soaking_in": float(soaking_in), "actual_yield": 0.0, "diff_yield_perc": 0.0, "diff_qty": 0.0}
        subtotals[key]["prod_qty"] += float(p.production_qty or 0)

    for key in subtotals:
        s = subtotals[key]
        if s["soaking_in"] > 0:
            s["actual_yield"] = round((s["prod_qty"] / s["soaking_in"]) * 100, 2)
            s["diff_yield_perc"] = round(s["actual_yield"] - s["target_yield"], 2)
            expected_qty = (s["soaking_in"] * s["target_yield"]) / 100
            s["diff_qty"] = round(s["prod_qty"] - expected_qty, 2)

    # KPI Sync Map updates
    card = defaultdict(float)
    card["floor_opening_qty"] = round(sum(f["available_qty"] for f in opening_floor_balance_list), 2)
    card["floor_opening_val"] = round(total_opening_val, 2)
    card["floor_closing_qty"] = round(sum(f["available_qty"] for f in closing_floor_balance_list), 2)
    card["floor_closing_val"] = round(total_closing_val, 2)
    
    card["gate_boxes"] = sum(int(r.no_of_material_boxes or 0) for r in rows["gate"])
    card["rmp_qty"] = sum(float(r.received_qty or 0) for r in rows["rmp"])
    card["rmp_amount"] = sum(float(r.amount or 0) for r in rows["rmp"])
    card["deh_hoso"] = sum(float(d.hoso_qty or 0) for d in rows["deheading"])
    card["deh_hlso"] = sum(float(d.hlso_qty or 0) for d in rows["deheading"])
    card["grd_qty"] = sum(float(g.quantity or 0) for g in rows["grading_details"])
    card["pel_peeled"] = sum(float(p.peeled_qty or 0) for p in rows["peeling"])
    card["soak_in"] = sum(float(s.in_qty or 0) for s in rows["soaking"])
    card["soak_rej"] = sum(float(s.rejection_qty or 0) for s in rows["soaking"])
    card["production_qty"] = sum(float(pr.production_qty or 0) for pr in rows["production"])
    
    gross_total = 0.0
    for pr in rows["production"]:
        g_val = float(pr.production_qty or 0)
        glz = str(pr.glaze or "").upper().strip()
        if "NWNC" not in glz and "%" in glz:
            dg = glz.replace("%", "").strip()
            if dg.isdigit() and int(dg) < 100: g_val = g_val / ((100 - int(dg)) / 100)
        gross_total += g_val
    card["prod_gross"] = gross_total
    
    card["stock_qty"] = sum(float(st.quantity or 0) for st in rows["stock"])
    card["stock_amount"] = sum(float(st.inventory_value or 0) for st in rows["stock"])
    card["stock_mc"] = sum(int(st.no_of_mc or 0) for st in rows["stock"])
    card["stock_loose"] = sum(int(st.loose or 0) for st in rows["stock"])

    return templates.TemplateResponse(
        request=request, name="summary/periodic_summary.html",
        context={
            "companies": companies, "suppliers": suppliers, "contractors": contractors, "batches": batches,
            "selected_date_filter": date_filter_type, "selected_month": selected_month,
            "selected_start_date": start_date, "selected_end_date": end_date,
            "selected_company": production_for, "selected_supplier": supplier_name,
            "selected_contractor": contractor_name, "selected_batch": batch, "selected_prod_type": prod_type,
            "rows": rows, "card": card, "subtotals": subtotals
        }
    )