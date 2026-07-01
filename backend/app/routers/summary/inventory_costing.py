# ============================================================================
# FINAL INVENTORY & REPROCESS COSTING ROUTER
# (UPDATED: ALL DATA BY DEFAULT & CONDITIONAL CARD VIEW WITH GLOBAL FILTERS)
# ============================================================================

from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from sqlalchemy.orm import Session
from sqlalchemy import func, and_, case

import re
from datetime import datetime, date
from app.utils.timezone import ist_now
from app.utils.global_filters import get_global_filters

from app.database import get_db
from app.database.models.reprocess import Reprocess
from app.database.models.inventory_management import (
    stock_entry,
    cold_storage_holding
)
from app.database.models.processing import (
    RawMaterialPurchasing,
    DeHeading,
    Grading,
    Peeling,
    GateEntry
)
from app.database.models.criteria import (
    varieties as VarietyTable,
    HOSO_HLSO_Yields,
    production_for as ProductionForTable,
    brands, species as species_model, grades, glazes, freezers, packing_styles, production_at, production_types
)
from app.database.models.floor_balance import FloorBalance

router = APIRouter(
    prefix="/summary",
    tags=["FINAL COSTING"]
)

templates = Jinja2Templates(directory="app/templates")

# ============================================================================
# HELPERS
# ============================================================================

SPECIAL_GRADES = ["BKN", "DC", "BLACK SPOT"]

def is_special_grade(grade: str) -> bool:
    g = str(grade or "").upper()
    return any(x in g for x in SPECIAL_GRADES)

def get_glaze_factor(glaze_str: str) -> float:
    glaze_str = str(glaze_str or "").upper().strip()
    if "NWNC" in glaze_str: return 1.0
    digits = re.findall(r"\d+", glaze_str)
    return ((100 - int(digits[0])) / 100 if digits else 1.0)

def calculate_hoso_equivalent_weight(db: Session, comp_code: str, row, v_records: dict) -> float:
    glaze_factor = get_glaze_factor(row.glaze)
    net_qty = (float(row.quantity or 0) * glaze_factor)
    
    if "HOSO" in str(row.variety or "").upper(): return net_qty
    
    v_m = v_records.get(str(row.variety or "").lower().strip())
    peeling_yield = (float(v_m.peeling_yield or 100) / 100 if v_m else 1.0)
    soaking_yield = (float(v_m.soaking_yield or 100) / 100 if v_m else 1.0)
    
    hlso_yield = 1.0
    try:
        nums = re.findall(r"\d+", str(row.grade or ""))
        if nums:
            raw_grade_num = int(nums[-1])
            adjusted_count = round(raw_grade_num / glaze_factor)
            match_count = adjusted_count - 1
            
            hlso_obj = db.query(HOSO_HLSO_Yields).filter(
                HOSO_HLSO_Yields.company_id == comp_code,
                HOSO_HLSO_Yields.hlso_count == match_count,
                HOSO_HLSO_Yields.species == row.species
            ).first()
            if hlso_obj: hlso_yield = (float(hlso_obj.hlso_yield_pct or 100) / 100)
    except Exception: pass
    
    denominator = (peeling_yield * soaking_yield * hlso_yield)
    return (net_qty / denominator if denominator > 0 else net_qty)

def get_dynamic_process_addon(
    db: Session,
    comp_code: str,
    row,
    master_map: dict | None = None,
    rmp_source_map: dict | None = None,
    reprocess_source_map: dict | None = None,
) -> float:
    prod_for = str(row.production_for or "").strip()
    freezer = str(getattr(row, "freezer", "") or "").strip()
    glaze = str(row.glaze or "").strip()
    prod_type = str(getattr(row, "type_of_production", "") or "").upper()
    
    finish_variety = str(row.variety or "").upper()
    is_finish_hoso = "HOSO" in finish_variety
    is_finish_hlso = "HLSO" in finish_variety
    is_finish_va = not (is_finish_hoso or is_finish_hlso)

    master = None
    if master_map is not None:
        master = master_map.get((prod_for, freezer, glaze))
    else:
        master = db.query(ProductionForTable).filter(
            ProductionForTable.company_id == comp_code,
            ProductionForTable.production_for == prod_for,
            ProductionForTable.freezer_name == freezer,
            ProductionForTable.glaze_percent == glaze,
            ProductionForTable.status == "Active"
        ).order_by(ProductionForTable.apply_from.desc()).first()

    if not master: return 5.0

    if rmp_source_map is not None or reprocess_source_map is not None:
        source_variety = str((rmp_source_map or {}).get(row.batch_number) or "").upper()
        is_source_rmp = bool(source_variety)
        if not source_variety:
            source_variety = str((reprocess_source_map or {}).get(row.batch_number) or "").upper()
    else:
        is_source_rmp = db.query(RawMaterialPurchasing).filter(
            RawMaterialPurchasing.company_id == comp_code,
            RawMaterialPurchasing.batch_number == row.batch_number
        ).first() is not None

        source_variety = ""
        if is_source_rmp:
            rmp_rec = db.query(RawMaterialPurchasing.variety_name).filter(
                RawMaterialPurchasing.company_id == comp_code,
                RawMaterialPurchasing.batch_number == row.batch_number
            ).first()
            source_variety = str(rmp_rec[0] or "").upper() if rmp_rec else ""
        else:
            rep_rec = db.query(Reprocess.variety).filter(
                Reprocess.company_id == comp_code,
                Reprocess.new_batch_id == row.batch_number
            ).first()
            source_variety = str(rep_rec[0] or "").upper() if rep_rec else ""

    is_source_hoso = "HOSO" in source_variety
    is_source_hlso = "HLSO" in source_variety

    if any(x in prod_type for x in ["RAW", "MELTING", "PRODUCTION"]):
        cost = float(master.production_cost_per_kg or 0) + float(master.ice_rate_per_kg or 0)
        if is_source_hoso:
            if is_finish_hlso:
                cost += (float(master.deheading_rate_per_kg or 0) + float(master.grading_rate_per_kg or 0))
            elif is_finish_va:
                cost += (float(master.deheading_rate_per_kg or 0) + float(master.grading_rate_per_kg or 0) + float(master.peeling_rate_per_kg or 0))
        elif is_source_hlso:
            if is_finish_hlso and is_source_rmp:
                cost += float(master.grading_rate_per_kg or 0)
            elif is_finish_va:
                if is_source_rmp: cost += float(master.grading_rate_per_kg or 0)
                cost += float(master.peeling_rate_per_kg or 0)
        return round(cost, 2)

    elif any(x in prod_type for x in ["REGLAZE", "REFREEZING"]):
        return float(master.production_cost_per_kg or 0)

    elif any(x in prod_type for x in ["REPACKING", "REWEIGHMENT"]):
        return float(master.repacking_cost_per_kg or 0)

    return 5.0

# ============================================================================
# MAIN ROUTER WITH UPDATED FILTER FLOW & GLOBAL ENGINE INJECTION
# ============================================================================

@router.get("/inventory_costing", response_class=HTMLResponse)
def inventory_costing_page(
    request: Request,
    db: Session = Depends(get_db),
    from_date: str = "",
    to_date: str = "",
    fy: str = Query(None),
    production_for_filter: str = Query("", alias="production_for") 
):
    # 🟢 1. FETCH ACTIVE UNIVERSAL GLOBAL FILTERS CONTEXT
    production_for, location = get_global_filters(request)
    
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/auth/login", status_code=302)

    # 🟢 DUAL MODE FALLBACK LAYER: గ్లోబల్ హెడర్ సెలెక్షన్ ఉంటే అది లోకల్ స్క్రీన్ ఫిల్టర్ ని ఓవర్‌రైడ్ చేస్తుంది
    if production_for:
        production_for_filter = production_for

    # 2. Dynamic Financial Years Generation from Gate Entry
    all_dates = db.query(GateEntry.date).filter(GateEntry.company_id == comp_code, GateEntry.date != None).all()
    fy_set = set()
    for d_tuple in all_dates:
        d = d_tuple[0]
        if d.month >= 4:
            fy_str = f"{d.year}"
        else:
            fy_str = f"{d.year - 1}"
        fy_set.add(fy_str)
    financial_years = sorted(list(fy_set), reverse=True)

    show_all_years = fy == "all"
    selected_fy = "" if show_all_years else fy
    if not show_all_years and not selected_fy and not from_date and not to_date:
        today = ist_now().date()
        selected_fy = str(today.year if today.month >= 4 else today.year - 1)

    # 3. Base Queries Formulation
    q_stock = db.query(stock_entry).outerjoin(GateEntry, stock_entry.batch_number == GateEntry.batch_number).filter(
        stock_entry.company_id == comp_code
    )
    
    q_cs = db.query(cold_storage_holding).outerjoin(GateEntry, cold_storage_holding.batch_number == GateEntry.batch_number).filter(
        cold_storage_holding.company_id == comp_code
    )

    # 🟢 Active Company Filter Injection
    if production_for_filter:
        q_stock = q_stock.filter(func.trim(stock_entry.production_for) == func.trim(production_for_filter))
        q_cs = q_cs.filter(func.trim(cold_storage_holding.production_for) == func.trim(production_for_filter))

    # 🟢 Active Location Filter Injection (Brings strict matching context onto location rule)
    if location:
        q_stock = q_stock.filter(func.trim(stock_entry.production_at) == func.trim(location))
        q_cs = q_cs.filter(func.trim(cold_storage_holding.production_at) == func.trim(location))

    # FY & Date Range Logic
    if selected_fy:
        start_year = int(selected_fy)
        fy_start = date(start_year, 4, 1)
        fy_end = date(start_year + 1, 3, 31)
        
        q_stock = q_stock.filter(
            case(
                (GateEntry.date != None, and_(GateEntry.date >= fy_start, GateEntry.date <= fy_end)),
                else_=and_(stock_entry.date >= fy_start, stock_entry.date <= fy_end)
            )
        )
        q_cs = q_cs.filter(
            case(
                (GateEntry.date != None, and_(GateEntry.date >= fy_start, GateEntry.date <= fy_end)),
                else_=and_(cold_storage_holding.date >= fy_start, cold_storage_holding.date <= fy_end)
            )
        )
        if not from_date: from_date = fy_start.isoformat()
        if not to_date: to_date = fy_end.isoformat()
    else:
        if from_date:
            q_stock = q_stock.filter(stock_entry.date >= date.fromisoformat(from_date))
            q_cs = q_cs.filter(cold_storage_holding.date >= date.fromisoformat(from_date))
        if to_date:
            q_stock = q_stock.filter(stock_entry.date <= date.fromisoformat(to_date))
            q_cs = q_cs.filter(cold_storage_holding.date <= date.fromisoformat(to_date))

    plant_rows = q_stock.order_by(stock_entry.date.desc()).all()
    cs_rows = q_cs.order_by(cold_storage_holding.date.desc()).all()

    # Context Mapping Reference Assets
    reprocess_rows = db.query(Reprocess).filter(Reprocess.company_id == comp_code).all()
    v_records = {v.variety_name.lower().strip(): v for v in db.query(VarietyTable).filter(VarietyTable.company_id == comp_code).all()}
    
    batch_numbers = list(set([r.batch_number for r in (plant_rows + cs_rows) if r.batch_number]))
    batch_residual_map = {}
    batch_total_hoso_weight_pool = {}
    rmp_stats_map = {}
    rep_stats_map = {}
    rmp_source_variety_map = {}
    reprocess_source_variety_map = {}
    floor_rows_by_batch = {}
    master_map = {}

    if batch_numbers:
        rmp_stats_map = {
            row.batch_number: row
            for row in db.query(
                RawMaterialPurchasing.batch_number.label("batch_number"),
                func.sum(RawMaterialPurchasing.received_qty).label("tq"),
                func.sum(RawMaterialPurchasing.amount).label("ta")
            ).filter(
                RawMaterialPurchasing.company_id == comp_code,
                RawMaterialPurchasing.batch_number.in_(batch_numbers)
            ).group_by(RawMaterialPurchasing.batch_number).all()
        }

        rep_stats_map = {
            row.new_batch_id: row
            for row in db.query(
                Reprocess.new_batch_id.label("new_batch_id"),
                func.sum(Reprocess.out_qty).label("tq"),
                func.sum(Reprocess.inventory_value).label("ta")
            ).filter(
                Reprocess.company_id == comp_code,
                Reprocess.new_batch_id.in_(batch_numbers)
            ).group_by(Reprocess.new_batch_id).all()
        }

        rmp_source_variety_map = {
            batch: variety
            for batch, variety in db.query(
                RawMaterialPurchasing.batch_number,
                func.max(RawMaterialPurchasing.variety_name)
            ).filter(
                RawMaterialPurchasing.company_id == comp_code,
                RawMaterialPurchasing.batch_number.in_(batch_numbers)
            ).group_by(RawMaterialPurchasing.batch_number).all()
        }

        reprocess_source_variety_map = {
            batch: variety
            for batch, variety in db.query(
                Reprocess.new_batch_id,
                func.max(Reprocess.variety)
            ).filter(
                Reprocess.company_id == comp_code,
                Reprocess.new_batch_id.in_(batch_numbers)
            ).group_by(Reprocess.new_batch_id).all()
        }

        floor_rows = db.query(
            FloorBalance.batch_number,
            FloorBalance.count,
            FloorBalance.species,
            FloorBalance.variety,
            FloorBalance.production_for,
            FloorBalance.location,
            FloorBalance.source_type,
            func.coalesce(func.sum(FloorBalance.available_qty), 0).label("available_qty")
        ).filter(
            FloorBalance.company_id == comp_code,
            FloorBalance.batch_number.in_(batch_numbers)
        ).group_by(
            FloorBalance.batch_number,
            FloorBalance.count,
            FloorBalance.species,
            FloorBalance.variety,
            FloorBalance.production_for,
            FloorBalance.location,
            FloorBalance.source_type
        ).having(func.sum(FloorBalance.available_qty) > 0.01).all()

        for row in floor_rows:
            floor_rows_by_batch.setdefault(row.batch_number, []).append(row)

    for master in db.query(ProductionForTable).filter(
        ProductionForTable.company_id == comp_code,
        ProductionForTable.status == "Active"
    ).order_by(ProductionForTable.apply_from.desc()).all():
        key = (
            str(master.production_for or "").strip(),
            str(master.freezer_name or "").strip(),
            str(master.glaze_percent or "").strip()
        )
        master_map.setdefault(key, master)

    # 4. Calculation Processing Pool Matrices
    for batch in batch_numbers:
        rmp_stats = rmp_stats_map.get(batch)
        raw_val = float(rmp_stats.ta or 0) if rmp_stats else 0.0
        raw_rate = (raw_val / rmp_stats.tq if rmp_stats and rmp_stats.tq and rmp_stats.tq > 0 else 0)
        
        rep_stats = rep_stats_map.get(batch)
        non_raw_val = float(rep_stats.ta or 0) if rep_stats else 0.0
        non_raw_rate = (non_raw_val / rep_stats.tq if rep_stats and rep_stats.tq and rep_stats.tq > 0 else 0)
        
        total_batch_value = raw_val if raw_val > 0 else non_raw_val
        batch_avg_rate = raw_rate if raw_val > 0 else non_raw_rate

        total_floor_value = 0
        for floor_row in floor_rows_by_batch.get(batch, []):
            floor_qty = float(floor_row.available_qty or 0)
            if floor_qty and float(floor_qty) > 0.01:
                class Obj: pass
                o = Obj()
                o.quantity = floor_qty
                o.glaze = "NWNC"
                o.variety = floor_row.variety
                o.grade = floor_row.count
                o.species = floor_row.species
                hoso_weight = calculate_hoso_equivalent_weight(db, comp_code, o, v_records)
                total_floor_value += (hoso_weight * batch_avg_rate)

        batch_residual_map[batch] = (total_batch_value - total_floor_value)

    for r in plant_rows:
        m_type = str(getattr(r, "cargo_movement_type", "IN")).upper()
        if is_special_grade(r.grade):
            r.rm_eq_weight = 0
            continue
        
        if m_type == "IN":
            actual_hoso = calculate_hoso_equivalent_weight(db, comp_code, r, v_records)
            variety_str = str(r.variety or "").upper().replace(" ","")
            alloc_weight = (actual_hoso * 0.85) if "G2" in variety_str else actual_hoso
            r.rm_eq_weight = alloc_weight
            batch_total_hoso_weight_pool[r.batch_number] = batch_total_hoso_weight_pool.get(r.batch_number, 0) + alloc_weight
        else:
            r.rm_eq_weight = 0

    for r in (plant_rows + cs_rows):
        m_type = str(getattr(r, "cargo_movement_type", "IN")).upper()
        
        if is_special_grade(r.grade):
            r.product_kg_value = 280.0
        elif m_type == "IN":
            if hasattr(r, 'batch_number') and r.batch_number in batch_total_hoso_weight_pool:
                res_amt = batch_residual_map.get(r.batch_number, 0)
                total_pool = batch_total_hoso_weight_pool.get(r.batch_number, 0)
                pool_rate = (res_amt / total_pool if total_pool > 0 else 0)
                base_rate = ((pool_rate * r.rm_eq_weight) / float(r.quantity or 1)) if float(r.quantity or 0) > 0 else 0
                
                addon = get_dynamic_process_addon(
                    db,
                    comp_code,
                    r,
                    master_map=master_map,
                    rmp_source_map=rmp_source_variety_map,
                    reprocess_source_map=reprocess_source_variety_map
                )
                r.product_kg_value = round(base_rate + addon, 2)
            else:
                match = next((x for x in reprocess_rows if x.new_batch_id == r.batch_number and x.variety == r.variety and x.grade == r.grade), None)
                r.product_kg_value = match.product_kg_value if match else 0.0
        else:
            match = next((x for x in (plant_rows + cs_rows) if str(getattr(x, "cargo_movement_type", "IN")).upper() == "IN" and 
                x.batch_number == r.batch_number and x.variety == r.variety and x.grade == r.grade and x.glaze == r.glaze), None)
            r.product_kg_value = match.product_kg_value if match else 0.0

        val = round(float(r.quantity or 0) * float(r.product_kg_value or 0), 2)
        new_inventory_value = -val if m_type == "OUT" else val
        if round(float(r.inventory_value or 0), 2) != new_inventory_value:
            r.inventory_value = new_inventory_value
            db.add(r)

    if db.dirty:
        db.commit()
    db.expire_all()

    # 5. Fetch Structured Output Records Set
    all_rows = plant_rows + cs_rows

    total_qty_in = sum(float(r.quantity or 0) for r in all_rows if str(getattr(r, "cargo_movement_type", "IN")).upper() == "IN")
    total_qty_out = sum(float(r.quantity or 0) for r in all_rows if str(getattr(r, "cargo_movement_type", "IN")).upper() == "OUT")
    total_val_in = sum(float(r.inventory_value or 0) for r in all_rows if str(getattr(r, "cargo_movement_type", "IN")).upper() == "IN")
    total_val_out_abs = abs(sum(float(r.inventory_value or 0) for r in all_rows if str(getattr(r, "cargo_movement_type", "IN")).upper() == "OUT"))
    available_qty = total_qty_in + total_qty_out
    balance_value = total_val_in + (sum(float(r.inventory_value or 0) for r in all_rows if str(getattr(r, "cargo_movement_type", "IN")).upper() == "OUT"))
    avg_rate = (balance_value / available_qty) if available_qty > 0 else 0

    # Safe Fetch Helper Method
    def get_list(model, attr):
        return [getattr(x, attr) for x in db.query(model).filter(model.company_id == comp_code).all()]

    try:
        p_types_data = db.query(production_types).filter(production_types.company_id == comp_code).all()
    except Exception:
        p_types_data = db.query(production_types).all()

    prod_types_list = []
    for x in p_types_data:
        val = getattr(x, "type_name", None) or getattr(x, "production_type", None) or getattr(x, "type_of_production", None)
        if val: prod_types_list.append(val)
    prod_types_list = sorted(list(set(prod_types_list)))

    if not prod_types_list:
        prod_types_list = ["RAW", "MELTING", "PRODUCTION", "REGLAZE", "REFREEZING", "REPACKING", "REWEIGHMENT"]

    return templates.TemplateResponse(
        request=request, 
        name="inventory_management/inventory_costing.html", 
        context={
            "rows": all_rows, 
            "from_date": from_date, 
            "to_date": to_date,
            "financial_years": financial_years,
            "selected_fy": selected_fy,
            "selected_production_for": production_for_filter, # 🟢 Sync dropdown lock memory state
            "selected_location": location,             # 🟢 Sync dropdown lock memory state
            "company_name": request.session.get("company_name", "BKNR"),
            "is_admin": request.session.get("role") == "admin",
            "brands_list": get_list(brands, "brand_name"),
            "species_list": get_list(species_model, "species_name"),
            "varieties_list": [v.variety_name for v in v_records.values()],
            "grades_list": get_list(grades, "grade_name"),
            "glazes_list": get_list(glazes, "glaze_name"),
            "freezers_list": get_list(freezers, "freezer_name"),
            "packing_styles_list": get_list(packing_styles, "packing_style"),
            "production_for_list": sorted({x.production_for for x in db.query(ProductionForTable).filter(ProductionForTable.company_id == comp_code).all() if x.production_for}),
            "production_at_list": get_list(production_at, "production_at"),
            "type_of_production_list": prod_types_list,
            "summary": {
                "total_items": len(all_rows), "qty_in": total_qty_in, "qty_out": total_qty_out,
                "net_qty": available_qty, "val_in": total_val_in, "val_out": total_val_out_abs,
                "net_val": balance_value, "avg_rate": round(avg_rate, 2)
            }
        }
    )
