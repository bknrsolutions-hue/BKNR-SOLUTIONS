# ============================================================
# FINAL INVENTORY & REPROCESS COSTING ROUTER
# (UPDATED: ALL DATA BY DEFAULT & CONDITIONAL CARD VIEW)
# ============================================================

from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates

from sqlalchemy.orm import Session
from sqlalchemy import func, and_, case

import re
from datetime import datetime, date

from app.database import get_db
from app.database.models.reprocess import Reprocess
from app.database.models.inventory_management import (
    stock_entry,
    cold_storage_holding
)
from app.database.models.processing import (
    RawMaterialPurchasing,
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
from app.services.floor_balance import (
    get_floor_balance
)

router = APIRouter(
    prefix="/summary",
    tags=["FINAL COSTING"]
)

templates = Jinja2Templates(directory="app/templates")

# ============================================================
# HELPERS
# ============================================================

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

def get_dynamic_process_addon(db: Session, comp_code: str, row) -> float:
    prod_for = str(row.production_for or "").strip()
    freezer = str(getattr(row, "freezer", "") or "").strip()
    glaze = str(row.glaze or "").strip()
    prod_type = str(getattr(row, "type_of_production", "") or "").upper()
    
    finish_variety = str(row.variety or "").upper()
    is_finish_hoso = "HOSO" in finish_variety
    is_finish_hlso = "HLSO" in finish_variety
    is_finish_va = not (is_finish_hoso or is_finish_hlso)

    master = db.query(ProductionForTable).filter(
        ProductionForTable.company_id == comp_code,
        ProductionForTable.production_for == prod_for,
        ProductionForTable.freezer_name == freezer,
        ProductionForTable.glaze_percent == glaze,
        ProductionForTable.status == "Active"
    ).order_by(ProductionForTable.apply_from.desc()).first()

    if not master: return 5.0

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

# ============================================================
# MAIN ROUTER WITH UPDATED FILTER FLOW
# ============================================================

@router.get("/inventory_costing", response_class=HTMLResponse)
def inventory_costing_page(
    request: Request,
    db: Session = Depends(get_db),
    from_date: str = "",
    to_date: str = "",
    fy: str = Query(None),
    production_for_filter: str = Query("", alias="production_for") # UI డ్రాప్‌డౌన్ ఫిల్టర్ మ్యాచ్
):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/auth/login", status_code=302)

    # 1. Dynamic Financial Years Generation from Gate Entry
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

    selected_fy = fy

    # 2. Base Queries Formulation
    q_stock = db.query(stock_entry).outerjoin(GateEntry, stock_entry.batch_number == GateEntry.batch_number).filter(
        stock_entry.company_id == comp_code
    )
    
    q_cs = db.query(cold_storage_holding).outerjoin(GateEntry, cold_storage_holding.batch_number == GateEntry.batch_number).filter(
        cold_storage_holding.company_id == comp_code
    )

    # UI నుండి కంపెనీ (production_for) ఫిల్టర్ అప్లై చేస్తే:
    if production_for_filter:
        q_stock = q_stock.filter(stock_entry.production_for == production_for_filter)
        q_cs = q_cs.filter(cold_storage_holding.production_for == production_for_filter)

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

    # 🌟 మార్పు: FY సెలెక్ట్ చేయకపోయినా ఖాళీగా ఉంచకుండా, టేబుల్ లోని మొత్తం డేటా (All Data) లోడ్ అవుతుంది
    plant_rows = q_stock.order_by(stock_entry.date.desc()).all()
    cs_rows = q_cs.order_by(cold_storage_holding.date.desc()).all()

    # Context Mapping Reference Assets
    reprocess_rows = db.query(Reprocess).filter(Reprocess.company_id == comp_code).all()
    v_records = {v.variety_name.lower().strip(): v for v in db.query(VarietyTable).filter(VarietyTable.company_id == comp_code).all()}
    
    batch_numbers = list(set([r.batch_number for r in (plant_rows + cs_rows) if r.batch_number]))
    batch_residual_map = {}
    batch_total_hoso_weight_pool = {}

    # 3. Calculation Processing Pool Matrices
    for batch in batch_numbers:
        rmp_stats = db.query(func.sum(RawMaterialPurchasing.received_qty).label("tq"), func.sum(RawMaterialPurchasing.amount).label("ta")).filter(RawMaterialPurchasing.company_id == comp_code, RawMaterialPurchasing.batch_number == batch).first()
        raw_val = float(rmp_stats.ta or 0); raw_rate = (raw_val / rmp_stats.tq if rmp_stats and rmp_stats.tq and rmp_stats.tq > 0 else 0)
        
        rep_stats = db.query(func.sum(Reprocess.out_qty).label("tq"), func.sum(Reprocess.inventory_value).label("ta")).filter(Reprocess.company_id == comp_code, Reprocess.new_batch_id == batch).first()
        non_raw_val = float(rep_stats.ta or 0); non_raw_rate = (non_raw_val / rep_stats.tq if rep_stats and rep_stats.tq and rep_stats.tq > 0 else 0)
        
        total_batch_value = raw_val if raw_val > 0 else non_raw_val
        batch_avg_rate = raw_rate if raw_val > 0 else non_raw_rate

        floor_combos = set()
        for r in db.query(RawMaterialPurchasing).filter(RawMaterialPurchasing.batch_number == batch, RawMaterialPurchasing.company_id == comp_code).all():
            floor_combos.add((r.batch_number, r.count, r.species, r.variety_name, r.production_for, r.peeling_at or "Floor", "RMP"))
        for r in db.query(Grading).filter(Grading.batch_number == batch, Grading.company_id == comp_code).all():
            floor_combos.add((r.batch_number, r.graded_count, r.species, r.variety_name, r.production_for, r.peeling_at or "Floor", "RMP"))
        for r in db.query(Peeling).filter(Peeling.batch_number == batch, Peeling.company_id == comp_code).all():
            floor_combos.add((r.batch_number, r.hlso_count, r.species, r.variety_name, r.production_for, r.peeling_at or "Floor", "RMP"))
        for r in db.query(Reprocess).filter(Reprocess.new_batch_id == batch, Reprocess.company_id == comp_code).all():
            floor_combos.add((r.new_batch_id, r.grade, r.species, r.variety, r.production_for, r.production_at or "Floor", "REPROCESS"))

        total_floor_value = 0
        for b, cnt, sp, vr, pfor, loc, stype in floor_combos:
            floor_qty = get_floor_balance(db, comp_code, loc, b, cnt, sp, vr, pfor, stype)
            if floor_qty and float(floor_qty) > 0.01:
                class Obj: pass
                o = Obj(); o.quantity = floor_qty; o.glaze = "NWNC"; o.variety = vr; o.grade = cnt; o.species = sp
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
                
                addon = get_dynamic_process_addon(db, comp_code, r)
                r.product_kg_value = round(base_rate + addon, 2)
            else:
                match = next((x for x in reprocess_rows if x.new_batch_id == r.batch_number and x.variety == r.variety and x.grade == r.grade), None)
                r.product_kg_value = match.product_kg_value if match else 0.0
        else:
            match = next((x for x in (plant_rows + cs_rows) if str(getattr(x, "cargo_movement_type", "IN")).upper() == "IN" and 
                x.batch_number == r.batch_number and x.variety == r.variety and x.grade == r.grade and x.glaze == r.glaze), None)
            r.product_kg_value = match.product_kg_value if match else 0.0

        val = round(float(r.quantity or 0) * float(r.product_kg_value or 0), 2)
        r.inventory_value = -val if m_type == "OUT" else val
        db.add(r)

    db.commit()
    db.expire_all()

    # 4. Fetch Structured Output Records Set
    all_rows = plant_rows + cs_rows

    total_qty_in = sum(float(r.quantity or 0) for r in all_rows if str(getattr(r, "cargo_movement_type", "IN")).upper() == "IN")
    total_qty_out = sum(float(r.quantity or 0) for r in all_rows if str(getattr(r, "cargo_movement_type", "IN")).upper() == "OUT")
    total_val_in = sum(float(r.inventory_value or 0) for r in all_rows if str(getattr(r, "cargo_movement_type", "IN")).upper() == "IN")
    total_val_out_abs = abs(sum(float(r.inventory_value or 0) for r in all_rows if str(getattr(r, "cargo_movement_type", "IN")).upper() == "OUT"))
    available_qty = total_qty_in + total_qty_out
    balance_value = total_val_in + (sum(float(r.inventory_value or 0) for r in all_rows if str(getattr(r, "cargo_movement_type", "IN")).upper() == "OUT"))
    avg_rate = (balance_value / available_qty) if available_qty > 0 else 0

    # 5. Safe Fetch Helper Method
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
            "selected_production_for": production_for_filter, # UI లో చెక్ చేసుకోవడానికి
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