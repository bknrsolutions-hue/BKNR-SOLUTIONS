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


def _periodic_date_key(value):
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if value:
        try:
            return date.fromisoformat(str(value)[:10]).isoformat()
        except Exception:
            return None
    return None


def _add_flow_point(bucket, raw_date, value):
    key = _periodic_date_key(raw_date)
    if not key:
        return
    try:
        bucket[key] += float(value or 0)
    except (TypeError, ValueError):
        return


def _flow_chart_payload(title, unit, day_bucket):
    month_bucket = defaultdict(float)
    for day_key, value in day_bucket.items():
        month_bucket[day_key[:7]] += float(value or 0)

    return {
        "title": title,
        "unit": unit,
        "day": [{"label": key, "value": round(day_bucket[key], 2)} for key in sorted(day_bucket)],
        "month": [{"label": key, "value": round(month_bucket[key], 2)} for key in sorted(month_bucket)],
    }


def _multi_flow_chart_payload(title, unit, series_buckets):
    series_payload = []
    combined_day_bucket = defaultdict(float)
    combined_month_bucket = defaultdict(float)

    for name, day_bucket in series_buckets.items():
        month_bucket = defaultdict(float)
        for day_key, value in day_bucket.items():
            amount = float(value or 0)
            combined_day_bucket[day_key] += amount
            month_bucket[day_key[:7]] += amount
            combined_month_bucket[day_key[:7]] += amount
        series_payload.append({
            "name": name,
            "day": [{"label": key, "value": round(day_bucket[key], 2)} for key in sorted(day_bucket)],
            "month": [{"label": key, "value": round(month_bucket[key], 2)} for key in sorted(month_bucket)],
        })

    return {
        "title": title,
        "unit": unit,
        "series": series_payload,
        "day": [{"label": key, "value": round(combined_day_bucket[key], 2)} for key in sorted(combined_day_bucket)],
        "month": [{"label": key, "value": round(combined_month_bucket[key], 2)} for key in sorted(combined_month_bucket)],
    }


def _current_fy_string(today_value=None):
    today_value = today_value or date.today()
    if today_value.month >= 4:
        return f"{today_value.year}-{str(today_value.year + 1)[2:]}"
    return f"{today_value.year - 1}-{str(today_value.year)[2:]}"


def _fy_date_bounds(fy_value):
    try:
        start_year = int(str(fy_value).split("-")[0])
    except (TypeError, ValueError):
        start_year = date.today().year if date.today().month >= 4 else date.today().year - 1
    return date(start_year, 4, 1), date(start_year + 1, 3, 31)


def _summary_items_from_bucket(bucket, unit="KG", limit=6):
    items = sorted(bucket.items(), key=lambda item: float(item[1].get("qty", 0)), reverse=True)
    summary = []
    for label, metrics in items[:limit]:
        qty = round(float(metrics.get("qty", 0) or 0), 2)
        extra = metrics.get("extra")
        if extra is None and metrics.get("yield_count"):
            extra = f"Avg Yield {round(float(metrics.get('yield_sum', 0)) / float(metrics.get('yield_count', 1)), 2)}%"
        summary.append({"label": label or "N/A", "value": qty, "unit": unit, "extra": extra})
    return summary

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
        dh_o = apply_filters(db.query(func.coalesce(func.sum(DeHeading.hlso_qty), 0)), DeHeading).filter(func.trim(cast(DeHeading.hoso_count, sa_String)) == clean_count).scalar() or 0

        p_q = db.query(func.coalesce(func.sum(Peeling.hlso_qty), 0)).filter(
            Peeling.company_id == company_id, Peeling.batch_number == batch, Peeling.peeling_at == location, Peeling.species == species,
            func.trim(cast(Peeling.hlso_count, sa_String)) == clean_count
        )
        p_q = p_q.filter(or_(Peeling.date < cutoff_date_str, and_(Peeling.date == cutoff_date_str, Peeling.time <= cutoff_time_str)))
        if production_for and production_for != "N/A":
            p_q = p_q.filter(Peeling.production_for == production_for)
        elif production_for == "N/A":
            p_q = p_q.filter((Peeling.production_for == None) | (func.trim(Peeling.production_for) == ""))
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
    production_at: str = Query(None),
    prod_type: str = Query("RMP"),
    batch: str = Query(None),
    search: str = Query(None),
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

    company_values = []
    for model in [GateEntry, RawMaterialPurchasing, Reprocess, DeHeading, Peeling, Soaking, Production, Grading, stock_entry]:
        if hasattr(model, "production_for"):
            company_values.extend([c[0] for c in db.query(distinct(model.production_for)).filter(model.company_id == company_code).all() if c[0]])
    companies = sorted(set(company_values))

    production_at_values = []
    for model, field_name in [
        (GateEntry, "receiving_center"), (GateEntry, "purchasing_location"),
        (RawMaterialPurchasing, "peeling_at"), (Reprocess, "production_at"),
        (DeHeading, "peeling_at"), (Peeling, "peeling_at"), (Soaking, "production_at"),
        (Production, "production_at"), (Grading, "peeling_at"), (stock_entry, "production_at")
    ]:
        production_at_values.extend([
            item[0] for item in db.query(distinct(getattr(model, field_name))).filter(model.company_id == company_code).all() if item[0]
        ])
    production_ats = sorted(set(production_at_values))

    # Financial Years Generation
    all_dates = []
    for model in [GateEntry, RawMaterialPurchasing, Reprocess, DeHeading, Peeling, Soaking, Production, Grading, stock_entry]:
        all_dates.extend(db.query(model.date).filter(model.company_id == company_code, model.date != None).all())
    fy_set = set()
    for d_tuple in all_dates:
        d = d_tuple[0]
        current_year = d.year
        if d.month >= 4: fy_str = f"{current_year}-{str(current_year + 1)[2:]}"
        else: fy_str = f"{current_year - 1}-{str(current_year)[2:]}"
        fy_set.add(fy_str)
    financial_years = sorted(list(fy_set), reverse=True)
    fy_was_selected = bool(fy)
    selected_fy = fy or _current_fy_string(today_dt)
    if selected_fy not in financial_years:
        financial_years.insert(0, selected_fy)
    fy_start_dt, fy_end_dt = _fy_date_bounds(selected_fy)
    fy_start_date = fy_start_dt.strftime("%Y-%m-%d")
    fy_end_date = fy_end_dt.strftime("%Y-%m-%d")
    if fy_was_selected and date_filter_type == "today" and not selected_month and not start_date and not end_date:
        res_start_dt, res_end_dt = fy_start_dt, fy_end_dt
        db_start_date = fy_start_date
        db_end_date = fy_end_date
        opening_cutoff_dt = datetime.combine(res_start_dt, time(8, 59, 59))
        closing_cutoff_dt = datetime.combine(res_end_dt + timedelta(days=1), time(8, 59, 59))

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
    stk_q = db.query(stock_entry).filter(stock_entry.company_id == company_code, stock_entry.date >= db_start_date, stock_entry.date <= db_end_date)

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

    def apply_production_at_filter(query, model, field_names):
        if not production_at:
            return query
        clauses = []
        for field_name in field_names:
            if hasattr(model, field_name):
                clauses.append(func.trim(getattr(model, field_name)) == func.trim(production_at))
        return query.filter(or_(*clauses)) if clauses else query

    gate_at_fields = ["receiving_center", "purchasing_location"]
    rmp_at_fields = ["peeling_at"]
    rep_at_fields = ["production_at", "location"]
    deh_at_fields = ["peeling_at"]
    pel_at_fields = ["peeling_at"]
    soak_at_fields = ["production_at"]
    prod_at_fields = ["production_at"]
    grd_at_fields = ["peeling_at"]
    stk_at_fields = ["production_at", "location"]

    gate_q = apply_production_at_filter(gate_q, GateEntry, gate_at_fields)
    rmp_q = apply_production_at_filter(rmp_q, RawMaterialPurchasing, rmp_at_fields)
    rep_q = apply_production_at_filter(rep_q, Reprocess, rep_at_fields)
    deh_q = apply_production_at_filter(deh_q, DeHeading, deh_at_fields)
    pel_q = apply_production_at_filter(pel_q, Peeling, pel_at_fields)
    soak_q = apply_production_at_filter(soak_q, Soaking, soak_at_fields)
    prod_q = apply_production_at_filter(prod_q, Production, prod_at_fields)
    grd_q = apply_production_at_filter(grd_q, Grading, grd_at_fields)
    stk_q = apply_production_at_filter(stk_q, stock_entry, stk_at_fields)

    def apply_global_search(query, model, field_names):
        term = str(search or "").strip()
        if not term:
            return query
        pattern = f"%{term}%"
        clauses = []
        for field_name in field_names:
            if hasattr(model, field_name):
                clauses.append(cast(getattr(model, field_name), sa_String).ilike(pattern))
        return query.filter(or_(*clauses)) if clauses else query

    gate_fields = ["batch_number", "supplier_name", "vehicle_number", "gate_pass_number", "challan_number", "receiving_center", "purchasing_location", "species", "production_for"]
    rmp_fields = ["batch_number", "supplier_name", "species", "variety_name", "count", "peeling_at", "production_for", "remarks", "hsn_code"]
    rep_fields = ["new_batch_id", "original_batch", "reprocess_type", "variety", "grade", "location", "species", "brand", "freezer", "packing_style", "glaze", "production_at", "production_for"]
    deh_fields = ["batch_number", "contractor", "species", "hoso_count", "peeling_at", "production_for"]
    pel_fields = ["batch_number", "contractor_name", "species", "hlso_count", "variety_name", "peeling_at", "production_for"]
    soak_fields = ["batch_number", "variety_name", "in_count", "sintex_number", "chemical_name", "species", "production_at", "production_for", "status", "rejection_for"]
    prod_fields = ["batch_number", "production_at", "production_for", "production_type", "species", "brand", "variety_name", "glaze", "freezer", "packing_style", "grade"]
    grd_fields = ["batch_number", "peeling_at", "production_for", "species", "hoso_count", "variety_name", "graded_count"]
    stk_fields = ["batch_number", "type_of_production", "location", "brand", "freezer", "packing_style", "glaze", "variety", "grade", "purpose", "po_number", "production_at", "production_for", "species"]

    gate_q = apply_global_search(gate_q, GateEntry, gate_fields)
    rmp_q = apply_global_search(rmp_q, RawMaterialPurchasing, rmp_fields)
    rep_q = apply_global_search(rep_q, Reprocess, rep_fields)
    deh_q = apply_global_search(deh_q, DeHeading, deh_fields)
    pel_q = apply_global_search(pel_q, Peeling, pel_fields)
    soak_q = apply_global_search(soak_q, Soaking, soak_fields)
    prod_q = apply_global_search(prod_q, Production, prod_fields)
    grd_q = apply_global_search(grd_q, Grading, grd_fields)
    stk_q = apply_global_search(stk_q, stock_entry, stk_fields)

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
    rows["stock_in"] = [row for row in rows["stock"] if str(row.cargo_movement_type or "").upper() == "IN"]
    rows["stock_out"] = [row for row in rows["stock"] if str(row.cargo_movement_type or "").upper() == "OUT"]
    # chart_rows now mirrors rows — same date/filter range, charts reflect selected filters
    chart_rows = rows

    # Recalculate deheading and peeling rows on the fly to ensure diff_qty and diff_percent are populated correctly
    deh_targets = db.query(HOSO_HLSO_Yields).filter(HOSO_HLSO_Yields.company_id == company_code).all()
    deh_target_map = {(ty.species, str(ty.hoso_count)): float(ty.hlso_yield_pct or 0) for ty in deh_targets}

    for r in rows["deheading"]:
        hoso = float(r.hoso_qty or 0)
        hlso = float(r.hlso_qty or 0)
        target_y = deh_target_map.get((r.species, str(r.hoso_count)), 0.0)
        r.target_yield_percent = target_y
        r.yield_percent = round((hlso / hoso * 100), 2) if hoso > 0 else 0
        if target_y > 0:
            expected_hoso = hlso / (target_y / 100)
            r.diff_qty = round(expected_hoso - hoso, 2)
            r.diff_percent = round(r.yield_percent - target_y, 2)
        else:
            r.diff_qty = 0.0
            r.diff_percent = 0.0

    var_list = db.query(VarietyTable).filter(VarietyTable.company_id == company_code).all()
    peel_target_map = {v.variety_name: float(v.peeling_yield or 0) for v in var_list}

    for r in rows["peeling"]:
        h_qty = float(r.hlso_qty or 0)
        p_qty = float(r.peeled_qty or 0)
        target_y = peel_target_map.get(r.variety_name, 0.0)
        r.target_yield_percent = target_y
        r.yield_percent = round((p_qty / h_qty * 100), 2) if h_qty > 0 else 0
        if target_y > 0:
            expected_peeled = h_qty * (target_y / 100)
            r.diff_qty = round(p_qty - expected_peeled, 2)
            r.diff_percent = round(r.yield_percent - target_y, 2)
        else:
            r.diff_qty = 0.0
            r.diff_percent = 0.0

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
            soaking_in = sum(float(s.in_qty or 0) for s in rows["soaking"] if str(s.batch_number or "").strip() == b_num and str(s.variety_name or "").strip() == v_name and str(s.species or "").strip().upper() == s_name.upper())
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

    def apply_floor_snapshot_filters(query):
        if production_for:
            query = query.filter(func.trim(FloorBalanceSnapshot.production_for) == func.trim(production_for))
        if production_at:
            query = query.filter(func.trim(FloorBalanceSnapshot.location) == func.trim(production_at))
        if batch:
            query = query.filter(FloorBalanceSnapshot.batch_number == batch)
        return query

    def get_snapshot_rows_for_date(target_date):
        base_query = db.query(FloorBalanceSnapshot).filter(FloorBalanceSnapshot.company_id == company_code)
        base_query = apply_floor_snapshot_filters(base_query)
        rows_for_date = base_query.filter(FloorBalanceSnapshot.snapshot_date == target_date).all()
        if rows_for_date:
            return rows_for_date

        previous_date = base_query.with_entities(func.max(FloorBalanceSnapshot.snapshot_date)).filter(
            FloorBalanceSnapshot.snapshot_date <= target_date
        ).scalar()
        if previous_date:
            return base_query.filter(FloorBalanceSnapshot.snapshot_date == previous_date).all()

        next_date = base_query.with_entities(func.min(FloorBalanceSnapshot.snapshot_date)).filter(
            FloorBalanceSnapshot.snapshot_date >= target_date
        ).scalar()
        if next_date:
            return base_query.filter(FloorBalanceSnapshot.snapshot_date == next_date).all()

        return []

    def append_snapshot_floor_rows(source_rows, target_list):
        total_value = 0.0
        for r in source_rows:
            if r.opening_qty and float(r.opening_qty) > 0.01:
                val = float(r.inventory_value or 0.0)
                total_value += val
                target_list.append({
                    "batch_number": r.batch_number, "peeling_at": r.location, "count": r.count or "N/A", "species": r.species or "N/A",
                    "variety": r.variety, "available_qty": float(r.opening_qty or 0.0), "value": val, "production_for": r.production_for
                })
        return total_value

    def append_live_floor_rows(target_list):
        live_query = db.query(FloorBalance).filter(FloorBalance.company_id == company_code)
        if production_for:
            live_query = live_query.filter(func.trim(FloorBalance.production_for) == func.trim(production_for))
        if production_at:
            live_query = live_query.filter(func.trim(FloorBalance.location) == func.trim(production_at))
        if batch:
            live_query = live_query.filter(FloorBalance.batch_number == batch)

        total_value = 0.0
        latest_map = {}
        for r in live_query.all():
            key = (r.batch_number, r.location, r.species, r.variety, r.count, r.production_for)
            r_dt = f"{r.date} {r.time}" if r.date and r.time else "0000-00-00 00:00:00"
            if key not in latest_map or r_dt > latest_map[key]["dt"]:
                latest_map[key] = {"record": r, "dt": r_dt}

        for item in latest_map.values():
            r = item["record"]
            if r.available_qty and float(r.available_qty) > 0.01:
                val = float(r.inventory_value or 0.0)
                total_value += val
                target_list.append({
                    "batch_number": r.batch_number, "peeling_at": r.location, "count": r.count or "N/A", "species": r.species or "N/A",
                    "variety": r.variety, "available_qty": float(r.available_qty or 0.0), "value": val, "production_for": r.production_for
                })
        return total_value

    # 1. Opening layer: exact snapshot first, then nearest available snapshot fallback.
    total_open_floor_val = append_snapshot_floor_rows(
        get_snapshot_rows_for_date(res_start_dt),
        opening_floor_balance_list
    )
    if not opening_floor_balance_list:
        total_open_floor_val = append_live_floor_rows(opening_floor_balance_list)

    # 2. 🟢 CONDITIONAL CLOSING LAYER: Live Table vs Snapshot Table (res_end_dt + 1 Day)
    if is_today_active:
        # If End Date is Upto Today: Extract live balance states from FloorBalance table
        close_date_str = closing_cutoff_dt.strftime("%Y-%m-%d")
        close_time_str = closing_cutoff_dt.strftime("%H:%M:%S")

        closing_query = db.query(FloorBalance).filter(FloorBalance.company_id == company_code)
        if production_for: closing_query = closing_query.filter(func.trim(FloorBalance.production_for) == func.trim(production_for))
        if production_at: closing_query = closing_query.filter(func.trim(FloorBalance.location) == func.trim(production_at))
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
        total_floor_val = append_snapshot_floor_rows(
            get_snapshot_rows_for_date(target_snap_close_date),
            closing_floor_balance_list
        )
        if not closing_floor_balance_list:
            total_floor_val = append_live_floor_rows(closing_floor_balance_list)

    if not closing_floor_balance_list:
        total_floor_val = append_live_floor_rows(closing_floor_balance_list)

    # KPI cards always use the selected date filter rows (not FY override)
    kpi_rows = rows
    card["gate_boxes"] = sum(int(r.no_of_material_boxes or 0) for r in kpi_rows["gate"])
    card["rmp_qty"] = sum(float(r.received_qty or 0) for r in kpi_rows["rmp"])
    card["rmp_amount"] = sum(float(r.amount or 0) for r in kpi_rows["rmp"])
    card["reprocess_qty"] = sum(float(r.in_qty or 0) for r in kpi_rows["reprocess"])
    card["reprocess_amount"] = sum(float(r.inventory_value or 0) for r in kpi_rows["reprocess"])
    
    card["deh_hoso"] = sum(float(d.hoso_qty or 0) for d in kpi_rows["deheading"])
    card["deh_hlso"] = sum(float(d.hlso_qty or 0) for d in kpi_rows["deheading"])
    card["grd_qty"] = sum(float(g.quantity or 0) for g in kpi_rows["grading_details"])
    card["pel_hlso"] = sum(float(p.hlso_qty or 0) for p in kpi_rows["peeling"])
    card["pel_peeled"] = sum(float(p.peeled_qty or 0) for p in kpi_rows["peeling"])
    
    card["soaking_qty"] = sum(float(s.in_qty or 0) for s in kpi_rows["soaking"])
    card["chemical_qty"] = sum(float(s.chemical_qty or 0) for s in kpi_rows["soaking"])
    card["salt_qty"] = sum(float(s.salt_qty or 0) for s in kpi_rows["soaking"])
    card["production_qty"] = sum(float(pr.production_qty or 0) for pr in kpi_rows["production"])
    card["stock_qty"] = sum(float(st.quantity or 0) for st in kpi_rows["stock"] if str(st.cargo_movement_type or "").upper() == "IN")
    card["stock_amount"] = sum(float(st.inventory_value or 0) for st in kpi_rows["stock"] if str(st.cargo_movement_type or "").upper() == "IN")
    card["stock_out_qty"] = sum(float(st.quantity or 0) for st in kpi_rows["stock"] if str(st.cargo_movement_type or "").upper() == "OUT")
    card["stock_out_amount"] = sum(float(st.inventory_value or 0) for st in kpi_rows["stock"] if str(st.cargo_movement_type or "").upper() == "OUT")
    
    card["floor_qty"] = round(total_open_floor_val, 2)
    card["floor_amount"] = round(total_open_floor_val, 2)
    card["floor_closing_qty"] = round(sum(f["available_qty"] for f in closing_floor_balance_list), 2)
    card["floor_closing_val"] = round(total_floor_val, 2)
    card["floor_opening_qty"] = round(sum(f["available_qty"] for f in opening_floor_balance_list), 2)
    card["floor_opening_val"] = round(total_open_floor_val, 2)

    chart_buckets = {section_id: defaultdict(float) for section_id in [
        "sec-open-floor", "sec-close-floor", "sec-gate", "sec-rmp", "sec-rep",
        "sec-rmp-sum1", "sec-rmp-sum2", "sec-recon", "sec-grading-cards-wrapper",
        "sec-deh", "sec-grd", "sec-pel", "sec-soak", "sec-prod", "sec-stk", "sec-stk-out"
    ]}
    summary_buckets = {section_id: defaultdict(lambda: {"qty": 0.0}) for section_id in chart_buckets}
    gate_entry_count_by_day = defaultdict(int)
    gate_production_for_summary = defaultdict(int)
    stock_out_series_buckets = {
        "Sales": defaultdict(float),
        "Storing": defaultdict(float),
        "Reprocess": defaultdict(float),
    }
    production_for_series_buckets = {
        section_id: defaultdict(lambda: defaultdict(float)) for section_id in chart_buckets
    }

    def add_production_for_series(section_id, row, raw_date, value):
        key = getattr(row, "production_for", None) or "N/A"
        date_key = _periodic_date_key(raw_date)
        if not date_key:
            return
        production_for_series_buckets[section_id][key][date_key] += float(value or 0)

    fy_snap_q = db.query(FloorBalanceSnapshot).filter(
        FloorBalanceSnapshot.company_id == company_code,
        FloorBalanceSnapshot.snapshot_date >= fy_start_dt,
        FloorBalanceSnapshot.snapshot_date <= fy_end_dt
    )
    if production_for:
        fy_snap_q = fy_snap_q.filter(func.trim(FloorBalanceSnapshot.production_for) == func.trim(production_for))
    if production_at:
        fy_snap_q = fy_snap_q.filter(func.trim(FloorBalanceSnapshot.location) == func.trim(production_at))
    if batch:
        fy_snap_q = fy_snap_q.filter(FloorBalanceSnapshot.batch_number == batch)

    for row in fy_snap_q.all():
        qty = float(row.opening_qty or 0)
        if qty <= 0:
            continue
        _add_flow_point(chart_buckets["sec-open-floor"], row.snapshot_date, qty)
        _add_flow_point(chart_buckets["sec-close-floor"], row.snapshot_date, qty)
        floor_key = f"{row.variety or 'N/A'} / {row.count or 'N/A'}"
        summary_buckets["sec-open-floor"][floor_key]["qty"] += qty
        summary_buckets["sec-close-floor"][floor_key]["qty"] += qty
        add_production_for_series("sec-open-floor", row, row.snapshot_date, qty)
        add_production_for_series("sec-close-floor", row, row.snapshot_date, qty)

    for row in chart_rows["gate"]:
        gate_entry_count_by_day[_periodic_date_key(row.date)] += 1
        gate_production_for_summary[row.production_for or "N/A"] += 1
        add_production_for_series("sec-gate", row, row.date, 1)
    for day_key, entry_count in gate_entry_count_by_day.items():
        _add_flow_point(chart_buckets["sec-gate"], day_key, entry_count)
    summary_buckets["sec-gate"]["Vehicle Entries"]["qty"] = len(chart_rows["gate"])
    summary_buckets["sec-gate"]["Boxes"]["qty"] = sum(float(r.no_of_material_boxes or 0) for r in chart_rows["gate"])

    for row in chart_rows["rmp"]:
        _add_flow_point(chart_buckets["sec-rmp"], row.date, row.received_qty)
        _add_flow_point(chart_buckets["sec-rmp-sum1"], row.date, row.received_qty)
        _add_flow_point(chart_buckets["sec-rmp-sum2"], row.date, row.received_qty)
        count_key = f"Count {row.count or 'N/A'}"
        variety_key = f"{row.variety_name or 'N/A'} / {row.count or 'N/A'}"
        supplier_key = row.supplier_name or "N/A"
        summary_buckets["sec-rmp"][count_key]["qty"] += float(row.received_qty or 0)
        summary_buckets["sec-rmp-sum1"][variety_key]["qty"] += float(row.received_qty or 0)
        summary_buckets["sec-rmp-sum2"][supplier_key]["qty"] += float(row.received_qty or 0)
        add_production_for_series("sec-rmp", row, row.date, row.received_qty)
        add_production_for_series("sec-rmp-sum1", row, row.date, row.received_qty)
        add_production_for_series("sec-rmp-sum2", row, row.date, row.received_qty)

    for row in chart_rows["reprocess"]:
        _add_flow_point(chart_buckets["sec-rep"], row.date, row.in_qty)
        summary_buckets["sec-rep"][row.variety or "N/A"]["qty"] += float(row.in_qty or 0)
        add_production_for_series("sec-rep", row, row.date, row.in_qty)

    for row in chart_rows["deheading"]:
        _add_flow_point(chart_buckets["sec-deh"], row.date, row.hoso_qty)
        _add_flow_point(chart_buckets["sec-recon"], row.date, row.hlso_qty)
        deh_key = row.contractor or "N/A"
        summary_buckets["sec-deh"][deh_key]["qty"] += float(row.hoso_qty or 0)
        summary_buckets["sec-deh"][deh_key]["yield_sum"] = summary_buckets["sec-deh"][deh_key].get("yield_sum", 0.0) + float(row.yield_percent or 0)
        summary_buckets["sec-deh"][deh_key]["yield_count"] = summary_buckets["sec-deh"][deh_key].get("yield_count", 0) + 1
        summary_buckets["sec-recon"]["Deheading"]["qty"] += float(row.hlso_qty or 0)
        add_production_for_series("sec-deh", row, row.date, row.hoso_qty)
        add_production_for_series("sec-recon", row, row.date, row.hlso_qty)

    for row in chart_rows["grading_details"]:
        _add_flow_point(chart_buckets["sec-grd"], row.date, row.quantity)
        _add_flow_point(chart_buckets["sec-grading-cards-wrapper"], row.date, row.quantity)
        grade_key = f"{row.variety_name or 'N/A'} / {row.graded_count or 'N/A'}"
        summary_buckets["sec-grd"][grade_key]["qty"] += float(row.quantity or 0)
        summary_buckets["sec-grading-cards-wrapper"][grade_key]["qty"] += float(row.quantity or 0)
        add_production_for_series("sec-grd", row, row.date, row.quantity)
        add_production_for_series("sec-grading-cards-wrapper", row, row.date, row.quantity)

    for row in chart_rows["peeling"]:
        _add_flow_point(chart_buckets["sec-pel"], row.date, row.hlso_qty)
        _add_flow_point(chart_buckets["sec-recon"], row.date, row.peeled_qty)
        summary_buckets["sec-pel"][row.contractor_name or "N/A"]["qty"] += float(row.hlso_qty or 0)
        summary_buckets["sec-recon"]["Peeling"]["qty"] += float(row.peeled_qty or 0)
        add_production_for_series("sec-pel", row, row.date, row.hlso_qty)
        add_production_for_series("sec-recon", row, row.date, row.peeled_qty)

    for row in chart_rows["soaking"]:
        net_qty = float(row.in_qty or 0) - float(row.rejection_qty or 0)
        _add_flow_point(chart_buckets["sec-soak"], row.date, row.in_qty)
        _add_flow_point(chart_buckets["sec-recon"], row.date, float(row.in_qty or 0) - float(row.rejection_qty or 0))
        summary_buckets["sec-soak"][row.variety_name or "N/A"]["qty"] += float(row.in_qty or 0)
        summary_buckets["sec-recon"]["Soaking"]["qty"] += net_qty
        add_production_for_series("sec-soak", row, row.date, row.in_qty)
        add_production_for_series("sec-recon", row, row.date, net_qty)

    for row in chart_rows["production"]:
        _add_flow_point(chart_buckets["sec-prod"], row.date, row.production_qty)
        _add_flow_point(chart_buckets["sec-recon"], row.date, row.production_qty)
        summary_buckets["sec-prod"][row.glaze or "N/A"]["qty"] += float(row.production_qty or 0)
        summary_buckets["sec-recon"]["Production"]["qty"] += float(row.production_qty or 0)
        add_production_for_series("sec-prod", row, row.date, row.production_qty)
        add_production_for_series("sec-recon", row, row.date, row.production_qty)

    def stock_out_group(row):
        raw = f"{getattr(row, 'purpose', '') or ''} {getattr(row, 'type_of_production', '') or ''} {getattr(row, 'cargo_movement_type', '') or ''}".upper()
        if "SALES" in raw or "SALE" in raw:
            return "Sales"
        if "STORING" in raw or "STORE" in raw or "STORAGE" in raw:
            return "Storing"
        return "Reprocess"

    for row in chart_rows["stock"]:
        movement = str(row.cargo_movement_type or "").upper()
        qty = float(row.quantity or 0)
        if movement == "OUT":
            group = stock_out_group(row)
            _add_flow_point(chart_buckets["sec-stk-out"], row.date, qty)
            _add_flow_point(stock_out_series_buckets[group], row.date, qty)
            summary_buckets["sec-stk-out"][group]["qty"] += qty
        else:
            _add_flow_point(chart_buckets["sec-stk"], row.date, qty)
            movement_key = f"Movement: {movement or 'N/A'}"
            summary_buckets["sec-stk"][movement_key]["qty"] += qty
            add_production_for_series("sec-stk", row, row.date, qty)

    flow_charts = {
        "sec-open-floor": _flow_chart_payload("Opening Floor Balance", "KG", chart_buckets["sec-open-floor"]),
        "sec-close-floor": _flow_chart_payload("Closing Floor Balance", "KG", chart_buckets["sec-close-floor"]),
        "sec-gate": _flow_chart_payload("Gate Entry Vehicle Flow", "Vehicles", chart_buckets["sec-gate"]),
        "sec-rmp": _flow_chart_payload("Raw Material Purchasing Flow", "KG", chart_buckets["sec-rmp"]),
        "sec-rep": _flow_chart_payload("Reprocess Input Flow", "KG", chart_buckets["sec-rep"]),
        "sec-rmp-sum1": _flow_chart_payload("RM Variety Summary Flow", "KG", chart_buckets["sec-rmp-sum1"]),
        "sec-rmp-sum2": _flow_chart_payload("Supplier Summary Flow", "KG", chart_buckets["sec-rmp-sum2"]),
        "sec-recon": _flow_chart_payload("Reconciliation Process Flow", "KG", chart_buckets["sec-recon"]),
        "sec-grading-cards-wrapper": _flow_chart_payload("Grading Card Flow", "KG", chart_buckets["sec-grading-cards-wrapper"]),
        "sec-deh": _flow_chart_payload("Deheading HOSO Flow", "KG", chart_buckets["sec-deh"]),
        "sec-grd": _flow_chart_payload("Grading Output Flow", "KG", chart_buckets["sec-grd"]),
        "sec-pel": _flow_chart_payload("Peeling Input Flow", "KG", chart_buckets["sec-pel"]),
        "sec-soak": _flow_chart_payload("Soaking Input Flow", "KG", chart_buckets["sec-soak"]),
        "sec-prod": _flow_chart_payload("Production Packing Flow", "KG", chart_buckets["sec-prod"]),
        "sec-stk": _flow_chart_payload("Stock IN Flow", "KG", chart_buckets["sec-stk"]),
        "sec-stk-out": _multi_flow_chart_payload("Stock OUT Flow", "KG", stock_out_series_buckets),
    }
    for section_id, payload in flow_charts.items():
        payload["summary"] = _summary_items_from_bucket(summary_buckets[section_id], payload.get("unit", "KG"))
        payload["fy"] = selected_fy
        if section_id != "sec-stk-out":
            payload["series"] = _multi_flow_chart_payload(
                payload.get("title", "Flow Chart"),
                payload.get("unit", "KG"),
                production_for_series_buckets[section_id],
            )["series"]
    flow_charts["sec-gate"]["summary"] = [
        {"label": "Vehicle Entries", "value": len(chart_rows["gate"]), "unit": "Entries", "extra": None},
        {"label": "Boxes", "value": round(sum(float(r.no_of_material_boxes or 0) for r in chart_rows["gate"]), 2), "unit": "Boxes", "extra": None},
    ] + [
        {"label": f"Production For: {key}", "value": value, "unit": "Entries", "extra": None}
        for key, value in sorted(gate_production_for_summary.items(), key=lambda item: item[1], reverse=True)
    ]
    soak_summary = defaultdict(lambda: {"in_qty": 0.0, "chemical_qty": 0.0, "salt_qty": 0.0})
    for row in chart_rows["soaking"]:
        key = row.variety_name or "N/A"
        soak_summary[key]["in_qty"] += float(row.in_qty or 0)
        soak_summary[key]["chemical_qty"] += float(row.chemical_qty or 0)
        soak_summary[key]["salt_qty"] += float(row.salt_qty or 0)
    flow_charts["sec-soak"]["summary"] = [
        {
            "label": key,
            "value": round(values["in_qty"], 2),
            "unit": "KG",
            "extra": f"Chem {round(values['chemical_qty'], 2)} KG | Salt {round(values['salt_qty'], 2)} KG"
        }
        for key, values in sorted(soak_summary.items(), key=lambda item: item[1]["in_qty"], reverse=True)
    ]

    deh_variety_summary = defaultdict(float)
    deh_contractor_summary = defaultdict(float)
    for row in chart_rows["deheading"]:
        deh_variety_summary["HOSO"] += float(row.hoso_qty or 0)
        deh_contractor_summary[row.contractor or "N/A"] += float(row.hoso_qty or 0)
    flow_charts["sec-deh"]["summary"] = (
        [{"label": f"Variety: {key}", "value": round(value, 2), "unit": "KG", "extra": None}
         for key, value in sorted(deh_variety_summary.items(), key=lambda item: item[1], reverse=True)] +
        [{"label": f"Contractor: {key}", "value": round(value, 2), "unit": "KG", "extra": None}
         for key, value in sorted(deh_contractor_summary.items(), key=lambda item: item[1], reverse=True)]
    )

    pel_variety_summary = defaultdict(float)
    pel_contractor_summary = defaultdict(float)
    for row in chart_rows["peeling"]:
        pel_variety_summary[row.variety_name or "N/A"] += float(row.hlso_qty or 0)
        pel_contractor_summary[row.contractor_name or "N/A"] += float(row.hlso_qty or 0)
    flow_charts["sec-pel"]["summary"] = (
        [{"label": f"Variety: {key}", "value": round(value, 2), "unit": "KG", "extra": None}
         for key, value in sorted(pel_variety_summary.items(), key=lambda item: item[1], reverse=True)] +
        [{"label": f"Contractor: {key}", "value": round(value, 2), "unit": "KG", "extra": None}
         for key, value in sorted(pel_contractor_summary.items(), key=lambda item: item[1], reverse=True)]
    )

    prod_summary = defaultdict(lambda: {"qty": 0.0, "glaze": defaultdict(float)})
    for row in chart_rows["production"]:
        key = row.variety_name or "N/A"
        glaze_key = row.glaze or "N/A"
        qty = float(row.production_qty or 0)
        prod_summary[key]["qty"] += qty
        prod_summary[key]["glaze"][glaze_key] += qty
    flow_charts["sec-prod"]["summary"] = [
        {
            "label": key,
            "value": round(values["qty"], 2),
            "unit": "KG",
            "extra": " | ".join(f"{glaze}: {round(qty, 2)} KG" for glaze, qty in sorted(values["glaze"].items(), key=lambda item: item[1], reverse=True)[:3])
        }
        for key, values in sorted(prod_summary.items(), key=lambda item: item[1]["qty"], reverse=True)
    ]

    stock_summary = defaultdict(lambda: {"qty": 0.0, "glaze": defaultdict(float)})
    stock_out_summary = defaultdict(lambda: {"qty": 0.0, "glaze": defaultdict(float)})
    stock_purpose_summary = defaultdict(float)
    stock_for_summary = defaultdict(float)
    stock_at_summary = defaultdict(float)
    stock_movement_summary = defaultdict(float)
    stock_out_purpose_summary = defaultdict(float)
    stock_out_for_summary = defaultdict(float)
    stock_out_at_summary = defaultdict(float)
    for row in chart_rows["stock"]:
        movement = str(row.cargo_movement_type or "").upper()
        key = row.variety or "N/A"
        glaze_key = row.glaze or "N/A"
        qty = float(row.quantity or 0)
        if movement == "OUT":
            stock_out_summary[key]["qty"] += qty
            stock_out_summary[key]["glaze"][glaze_key] += qty
            stock_out_purpose_summary[row.purpose or "N/A"] += qty
            stock_out_for_summary[row.production_for or "N/A"] += qty
            stock_out_at_summary[row.production_at or row.location or "N/A"] += qty
        else:
            stock_summary[key]["qty"] += qty
            stock_summary[key]["glaze"][glaze_key] += qty
            stock_purpose_summary[row.purpose or "N/A"] += qty
            stock_for_summary[row.production_for or "N/A"] += qty
            stock_at_summary[row.production_at or row.location or "N/A"] += qty
            stock_movement_summary[movement or "N/A"] += qty
    flow_charts["sec-stk"]["summary"] = (
        [{"label": f"Movement: {key}", "value": round(value, 2), "unit": "KG", "extra": None}
         for key, value in sorted(stock_movement_summary.items(), key=lambda item: item[1], reverse=True)] +
        [{"label": f"Purpose: {key}", "value": round(value, 2), "unit": "KG", "extra": None}
         for key, value in sorted(stock_purpose_summary.items(), key=lambda item: item[1], reverse=True)] +
        [
        {
            "label": f"Variety: {key}",
            "value": round(values["qty"], 2),
            "unit": "KG",
            "extra": " | ".join(f"{glaze}: {round(qty, 2)} KG" for glaze, qty in sorted(values["glaze"].items(), key=lambda item: item[1], reverse=True)[:3])
        }
        for key, values in sorted(stock_summary.items(), key=lambda item: item[1]["qty"], reverse=True)
        ] +
        [{"label": f"Production For: {key}", "value": round(value, 2), "unit": "KG", "extra": None}
         for key, value in sorted(stock_for_summary.items(), key=lambda item: item[1], reverse=True)] +
        [{"label": f"Production At: {key}", "value": round(value, 2), "unit": "KG", "extra": None}
         for key, value in sorted(stock_at_summary.items(), key=lambda item: item[1], reverse=True)]
    )
    flow_charts["sec-stk-out"]["summary"] = (
        [{"label": f"Purpose: {key}", "value": round(value, 2), "unit": "KG", "extra": None}
         for key, value in sorted(stock_out_purpose_summary.items(), key=lambda item: item[1], reverse=True)] +
        [
        {
            "label": f"Variety: {key}",
            "value": round(values["qty"], 2),
            "unit": "KG",
            "extra": " | ".join(f"{glaze}: {round(qty, 2)} KG" for glaze, qty in sorted(values["glaze"].items(), key=lambda item: item[1], reverse=True)[:3])
        }
        for key, values in sorted(stock_out_summary.items(), key=lambda item: item[1]["qty"], reverse=True)
        ] +
        [{"label": f"Production For: {key}", "value": round(value, 2), "unit": "KG", "extra": None}
         for key, value in sorted(stock_out_for_summary.items(), key=lambda item: item[1], reverse=True)] +
        [{"label": f"Production At: {key}", "value": round(value, 2), "unit": "KG", "extra": None}
         for key, value in sorted(stock_out_at_summary.items(), key=lambda item: item[1], reverse=True)]
    )

    def append_production_for_summary(section_ids, source_rows, value_getter, label_getter=lambda row: getattr(row, "production_for", None), unit="KG"):
        buckets = defaultdict(float)
        for item in source_rows:
            buckets[label_getter(item) or "N/A"] += float(value_getter(item) or 0)
        summary_items = [
            {"label": f"Production For: {key}", "value": round(value, 2), "unit": unit, "extra": None}
            for key, value in sorted(buckets.items(), key=lambda entry: entry[1], reverse=True)
        ]
        for section_id in section_ids:
            flow_charts[section_id]["summary"].extend(summary_items)

    fy_floor_rows = fy_snap_q.all()
    append_production_for_summary(["sec-open-floor", "sec-close-floor"], fy_floor_rows, lambda row: row.opening_qty)
    append_production_for_summary(["sec-rmp", "sec-rmp-sum1", "sec-rmp-sum2"], chart_rows["rmp"], lambda row: row.received_qty)
    append_production_for_summary(["sec-rep"], chart_rows["reprocess"], lambda row: row.in_qty)
    append_production_for_summary(["sec-deh"], chart_rows["deheading"], lambda row: row.hoso_qty)
    append_production_for_summary(["sec-grd", "sec-grading-cards-wrapper"], chart_rows["grading_details"], lambda row: row.quantity)
    append_production_for_summary(["sec-pel"], chart_rows["peeling"], lambda row: row.hlso_qty)
    append_production_for_summary(["sec-soak"], chart_rows["soaking"], lambda row: row.in_qty)
    append_production_for_summary(["sec-prod", "sec-recon"], chart_rows["production"], lambda row: row.production_qty)

    return templates.TemplateResponse(
        request=request, name="summary/periodic_summary.html", 
        context={
            "financial_years": financial_years,
            "selected_fy": selected_fy,
            "selected_date_filter": date_filter_type,
            "selected_month": selected_month,
            "selected_start_date": start_date,
            "selected_end_date": end_date,
            "companies": companies,
            "production_ats": production_ats,
            "batches": batches, 
            "selected_company": production_for,
            "selected_production_at": production_at,
            "selected_prod_type": prod_type, 
            "selected_batch": batch, 
            "rows": rows, 
            "card": card, 
            "subtotals": subtotals,
            "opening_floor_balance": opening_floor_balance_list,
            "closing_floor_balance": closing_floor_balance_list,
            "hoso_floor_balance": closing_floor_balance_list,
            "flow_charts": flow_charts
        }
    )
