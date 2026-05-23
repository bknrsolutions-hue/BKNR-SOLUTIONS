from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime, date
from collections import defaultdict

from app.database import get_db

from app.database.models.inventory_management import (
    stock_entry,
    cold_storage_holding
)

from app.database.models.criteria import (
    varieties,
    grades,
    species,
    production_for
)

router = APIRouter(
    prefix="/inventory_dashboard",
    tags=["INVENTORY DASHBOARD"]
)

# ============================================================
# GENERATE BATCH CODE
# ============================================================
def generate_batch_code(company_name: str):
    if not company_name:
        return "N/A"
    prefix = company_name[:2].upper()
    year_suffix = str(datetime.now().year)[2:]
    return f"{prefix}-{year_suffix}-000"

# ============================================================
# INVENTORY DASHBOARD
# ============================================================
@router.get("", response_class=HTMLResponse)
@router.get("/", response_class=HTMLResponse)
async def get_inventory_dashboard(
    request: Request,
    sel_species: str = Query("ALL"),
    sel_variety: str = Query("ALL"),
    sel_grade: str = Query("ALL"),
    sel_prod_at: str = Query("ALL"),
    sel_prod_for: str = Query("ALL"),
    sel_fy: str = Query("CURRENT"),
    db: Session = Depends(get_db)
):
    # SESSION & COMPANY CHECK
    comp_code = request.session.get("company_code")
    if not comp_code:
        return RedirectResponse("/auth/login")

    # TODAY & FY CALCULATION
    today = datetime.now().date()
    current_year = today.year
    current_fy_start_year = current_year if today.month >= 4 else current_year - 1
    current_fy_name = f"{current_fy_start_year}-{str(current_fy_start_year + 1)[2:]}"

    if sel_fy == "CURRENT":
        fy_start_year = current_fy_start_year
    else:
        try:
            fy_start_year = int(sel_fy.split("-")[0])
        except:
            fy_start_year = current_fy_start_year

    fy_start = date(fy_start_year, 4, 1)
    fy_end = date(fy_start_year + 1, 3, 31)

    # FETCH DATA
    stocks = db.query(stock_entry).filter(stock_entry.company_id == comp_code).all()
    cs_holds = db.query(cold_storage_holding).filter(cold_storage_holding.company_id == comp_code).all()

    # KPI Counters initialized to 0.0
    opening_stock_qty = 0.0
    opening_stock_mc = 0
    grand_opening_loose = 0
    closing_stock_qty = 0.0
    closing_stock_mc = 0
    grand_loose = 0
    total_sales_qty = 0.0
    reprocess_qty = 0.0
    current_fy_stock_qty = 0.0
    total_in_qty = 0.0
    total_out_qty = 0.0
    age_30, age_90, age_700, dead_stock_qty = 0.0, 0.0, 0.0, 0.0

    # KPI Value Counters (Added for complete KPI integration)
    total_opening_value = 0.0
    total_out_value = 0.0
    reprocess_value = 0.0
    total_in_value = 0.0
    dead_stock_value = 0.0

    table_grouping = defaultdict(lambda: {
        "opening_qty": 0.0, "opening_mc": 0, "opening_loose": 0,
        "in_qty": 0.0, "out_qty": 0.0, "qty": 0.0, "mc": 0, "loose": 0,
        "total_val_sum": 0.0, "ageing_days": 0, "production_for": "", "sp": ""
    })
    
    # Value helper grouping for global/specific item rate mappings
    kpi_rates_helper = defaultdict(lambda: {"sum_val": 0.0, "sum_qty": 0.0})
    
    variety_stats = defaultdict(float)
    grade_stats = defaultdict(float)
    daily_flow = defaultdict(lambda: {"IN": 0.0, "OUT": 0.0})

    def is_filtered(item, loc_val):
        if sel_species != "ALL" and item.species != sel_species: return True
        if sel_variety != "ALL" and item.variety != sel_variety: return True
        if sel_grade != "ALL" and item.grade != sel_grade: return True
        if sel_prod_for != "ALL" and item.production_for != sel_prod_for: return True
        if sel_prod_at != "ALL" and loc_val != sel_prod_at: return True
        return False

    # Combined Processing
    all_raw_data = []
    for s in stocks: all_raw_data.append((s, s.production_at or "PLANT", s.date))
    for c in cs_holds: all_raw_data.append((c, c.cold_storage_name or "CS", c.in_date))

    # First Pass: Compute average items mapping for value estimations
    for item, loc, s_date in all_raw_data:
        if not s_date or is_filtered(item, loc): continue
        move = str(getattr(item, "cargo_movement_type", "") or "").strip().upper()
        qty = float(getattr(item, "quantity", 0) or 0)
        rate = float(getattr(item, "rate_per_kg", 0) or getattr(item, "product_kg_value", 0) or 0)
        
        if qty > 0 and rate > 0:
            g_key = (item.species or "N/A", item.variety or "N/A", getattr(item, "packing_style", "N/A") or "N/A", item.glaze or "NW", item.grade or "N/A", item.production_for or "N/A")
            kpi_rates_helper[g_key]["sum_val"] += (qty * rate)
            kpi_rates_helper[g_key]["sum_qty"] += qty

    # Rate map extraction
    global_rates = {gk: (v["sum_val"] / v["sum_qty"] if v["sum_qty"] > 0.01 else 0.0) for gk, v in kpi_rates_helper.items()}

    # Second Pass: Main processing with accurate values
    for item, loc, s_date in all_raw_data:
        if not s_date or is_filtered(item, loc): continue

        # KPI Fix: Ensure all values are handled even if they are None
        move = str(getattr(item, "cargo_movement_type", "") or "").strip().upper()
        qty = float(getattr(item, "quantity", 0) or 0)
        rate = float(getattr(item, "rate_per_kg", 0) or getattr(item, "product_kg_value", 0) or 0)
        mc = int(getattr(item, "no_of_mc", 0) or 0)
        loose = int(getattr(item, "loose", 0) or 0)
        
        g_key = (item.species or "N/A", item.variety or "N/A", getattr(item, "packing_style", "N/A") or "N/A", item.glaze or "NW", item.grade or "N/A", item.production_for or "N/A")
        fallback_rate = global_rates.get(g_key, 0.0)
        actual_item_rate = rate if rate > 0 else fallback_rate
        calculated_row_value = qty * actual_item_rate

        sign = 1 if move == "IN" else -1
        net = qty * sign
        mc_net = mc * sign
        loose_net = loose * sign
        net_value = calculated_row_value * sign

        ageing_days = (today - s_date).days

        # Opening Stock Logic (Before FY Start)
        if s_date < fy_start:
            opening_stock_qty += net
            opening_stock_mc += mc_net
            grand_opening_loose += loose_net
            total_opening_value += net_value
        
        # Current FY Transactions
        if fy_start <= s_date <= fy_end:
            current_fy_stock_qty += net
            if move == "IN": 
                total_in_qty += qty
                total_in_value += calculated_row_value
            elif move == "OUT":
                total_out_qty += qty
                total_out_value += calculated_row_value

        # Closing Stock Logic (Up to FY End)
        if s_date <= fy_end:
            closing_stock_qty += net
            closing_stock_mc += mc_net
            grand_loose += loose_net
            
            # Aging only for 'IN' movements that are still in stock (Logic approximation)
            if move == "IN":
                if ageing_days <= 30: age_30 += qty
                elif ageing_days <= 90: age_90 += qty
                elif ageing_days <= 700: age_700 += qty
                else: 
                    dead_stock_qty += qty
                    dead_stock_value += calculated_row_value

        # Sales & Reprocess KPI Fix
        purpose = str(getattr(item, "purpose", "") or "").upper()
        if move == "OUT" and "SALE" in purpose:
            total_sales_qty += qty

        prod_type = str(getattr(item, "type_of_production", "") or "").upper()
        if move == "IN" and prod_type != "RAW":
            reprocess_qty += qty
            reprocess_value += calculated_row_value

        # Table Grouping
        fr = getattr(item, "freezer", "IQF") if hasattr(item, "freezer") else "CS"
        t_key = (loc, fr, item.variety or "N/A", item.packing_style or "N/A", item.glaze or "NW", item.grade or "N/A", item.production_for or "N/A")

        if s_date < fy_start:
            table_grouping[t_key]["opening_qty"] += net
            table_grouping[t_key]["opening_mc"] += mc_net
            table_grouping[t_key]["opening_loose"] += loose_net
        
        if fy_start <= s_date <= fy_end:
            if move == "IN": table_grouping[t_key]["in_qty"] += qty
            else: table_grouping[t_key]["out_qty"] += qty
            
        if s_date <= fy_end:
            table_grouping[t_key]["qty"] += net
            table_grouping[t_key]["mc"] += mc_net
            table_grouping[t_key]["loose"] += loose_net
            table_grouping[t_key]["total_val_sum"] += net_value

        table_grouping[t_key].update({"ageing_days": ageing_days, "production_for": item.production_for or "N/A", "sp": item.species or "N/A"})
        variety_stats[item.variety or "N/A"] += net
        grade_stats[item.grade or "N/A"] += net
        daily_flow[s_date.strftime("%Y-%m-%d")][move] += qty

    # Global Weighted Average Rate Calculation
    global_item_rates = defaultdict(lambda: {"sum_val": 0.0, "sum_qty": 0.0})
    for (loc, fr, vr, pk, gl, gr, p_for), data in table_grouping.items():
        g_key = (data["sp"], vr, pk, gl, gr, p_for)
        global_item_rates[g_key]["sum_val"] += data["total_val_sum"]
        global_item_rates[g_key]["sum_qty"] += data["qty"]

    rate_map = {gk: (v["sum_val"] / v["sum_qty"] if abs(v["sum_qty"]) > 0.01 else 0.0) for gk, v in global_item_rates.items()}

    # Final Table Data
    stock_table_data = []
    total_inventory_value = 0.0
    for (loc, fr, vr, pk, gl, gr, p_for), data in table_grouping.items():
        if abs(data["qty"]) > 0.01 or abs(data["opening_qty"]) > 0.01:
            g_key = (data["sp"], vr, pk, gl, gr, p_for)
            avg_rate = rate_map.get(g_key, 0.0)
            inv_value = data["qty"] * avg_rate
            total_inventory_value += inv_value

            stock_table_data.append({
                "loc": loc, "fr": fr, "sp": data["sp"], "vr": vr, "pk": pk, "gl": gl, "gr": gr,
                "production_for": p_for, "opening_qty": round(data["opening_qty"], 2),
                "opening_mc": data["opening_mc"], "opening_loose": data["opening_loose"],
                "in_qty": round(data["in_qty"], 2), "out_qty": round(data["out_qty"], 2),
                "qty": round(data["qty"], 2), "mc": data["mc"], "loose": data["loose"],
                "avg_rate": round(abs(avg_rate), 2), "value": round(inv_value, 2),
                "ageing_days": data["ageing_days"]
            })

    stock_table_data.sort(key=lambda x: (x["loc"], x["sp"], x["vr"], x["gr"]))

    # FY Comparison Chart
    fy_labels, fy_opening, fy_closing = [], [], []
    start_year = 2023
    for yr in range(start_year, today.year + 1):
        fy_name = f"{yr}-{str(yr + 1)[2:]}"
        f_s, f_e = date(yr, 4, 1), date(yr + 1, 3, 31)
        o_v, c_v = 0.0, 0.0
        for item, loc, s_date in all_raw_data:
            if is_filtered(item, loc): continue
            n = float(getattr(item, "quantity", 0) or 0) * (1 if str(getattr(item, "cargo_movement_type", "")).upper() == "IN" else -1)
            if s_date < f_s: o_v += n
            if s_date <= f_e: c_v += n
        fy_labels.append(fy_name); fy_opening.append(round(o_v, 2)); fy_closing.append(round(c_v, 2))

    def get_list(model, field):
        return sorted(list(set([getattr(x, field) for x in db.query(model).filter(model.company_id == comp_code).all() if getattr(x, field)])))

    fy_options = [f"{yr}-{str(yr+1)[2:]}" for yr in range(start_year, today.year + 1)][::-1]

    context = {
        "request": request,
        "total_sales_qty": round(total_sales_qty, 2),
        "reprocess_qty": round(reprocess_qty, 2),
        "total_mc_count": closing_stock_mc,
        "opening_stock_qty": round(opening_stock_qty, 2),
        "current_fy_stock_qty": round(current_fy_stock_qty, 2),
        "closing_stock_qty": round(closing_stock_qty, 2),
        "grand_opening_mc": opening_stock_mc,
        "grand_opening_loose": grand_opening_loose,
        "closing_stock_mc": closing_stock_mc,
        "grand_loose": grand_loose,
        "total_in_qty": round(total_in_qty, 2),
        "total_out_qty": round(total_out_qty, 2),
        
        # Mapping values key to HTML Template variables
        "total_opening_value": round(total_opening_value, 2),
        "total_inventory_value": round(total_inventory_value, 2),
        "total_out_value": round(total_out_value, 2),
        "reprocess_value": round(reprocess_value, 2),
        "total_in_value": round(total_in_value, 2),
        "dead_stock_value": round(dead_stock_value, 2),
        
        "dead_stock_qty": round(dead_stock_qty, 2),
        "age_30": round(age_30, 2), "age_90": round(age_90, 2), "age_700": round(age_700, 2),
        "stock_table_data": stock_table_data,
        "variety_labels": list(variety_stats.keys()), "variety_values": list(variety_stats.values()),
        "grade_labels": list(grade_stats.keys())[:10], "grade_values": list(grade_stats.values())[:10],
        "fy_labels": fy_labels, "fy_opening": fy_opening, "fy_closing": fy_closing, "fy_options": fy_options,
        "species_list": get_list(species, "species_name"), "varieties_list": get_list(varieties, "variety_name"),
        "grades_list": get_list(grades, "grade_name"), "prod_for_list": get_list(production_for, "production_for"),
        "sel_species": sel_species, "sel_variety": sel_variety, "sel_grade": sel_grade,
        "sel_prod_for": sel_prod_for, "sel_fy": sel_fy, "current_fy_name": current_fy_name
    }

    return request.app.state.templates.TemplateResponse(
        request=request, name="inventory_management/inventory_dashboard.html", context=context
    )