import json
import re
from fastapi import APIRouter, Request, Depends, Query, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, not_, and_, case, or_
from datetime import datetime, date, timedelta
from app.utils.timezone import ist_now
from collections import defaultdict
import logging

from app.database import get_db
# Models and Context Mapping
from app.database.models.inventory_management import stock_entry, cold_storage_holding, sales_dispatch
from app.database.models.processing import GateEntry
from app.database.models.reprocess import Reprocess  

from app.database.models.criteria import (
    varieties, grades, species, production_for
)
from app.utils.global_filters import get_global_filters

router = APIRouter(
    prefix="/inventory_dashboard",
    tags=["INVENTORY DASHBOARD"]
)

# ============================================================
# INVENTORY DASHBOARD (MAIN ROUTE WITH GLOBAL FILTERS SYNC)
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
    sel_fy: str = Query("ALL"),  
    db: Session = Depends(get_db)
):
    # SESSION & COMPANY CHECK
    comp_code = request.session.get("company_code")
    if not comp_code:
        return RedirectResponse("/auth/login")

    # 🟢 🔴 FETCH BKNR GLOBAL FILTERS CONTEXT
    global_production_for, global_location = get_global_filters(request)

    today = ist_now().date()
    current_year = today.year
    current_fy_start_year = current_year if today.month >= 4 else current_year - 1
    current_fy_string = f"{current_fy_start_year}-{str(current_fy_start_year + 1)[2:]}"

    # --- Financial Year Boundary Mapping ---
    use_fy_filter = True  
    if sel_fy == "ALL":
        start_year = current_fy_start_year
        sel_fy = current_fy_string 
    else:
        try:
            start_year = int(sel_fy.split("-")[0])
        except:
            start_year = current_fy_start_year

    fy_start = date(start_year, 4, 1)
    fy_end = date(start_year + 1, 3, 31)

    session_locations = request.session.get("allowed_locations", [])
    if isinstance(session_locations, str):
        user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()]
    else:
        user_allowed_locations = [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]

    # ============================================================
    # 🌟 1. FRESH PRODUCTION LOGIC (FILTER BOUND)
    # ============================================================
    gate_q = db.query(GateEntry.batch_number).filter(
        GateEntry.company_id == comp_code, 
        GateEntry.batch_number != None,
        GateEntry.date >= fy_start,
        GateEntry.date <= fy_end
    )
    
    # Apply Global Filter Constraints on Gate Processing Source
    if global_location:
        g_loc_clean = global_location.strip().upper()
        if g_loc_clean in ["FLOOR", "OTHER FLOOR"]:
            gate_q = gate_q.filter(or_(func.upper(func.trim(GateEntry.peeling_at)) == "FLOOR", func.upper(func.trim(GateEntry.peeling_at)) == "OTHER FLOOR", GateEntry.peeling_at == None, func.trim(GateEntry.peeling_at) == ""))
        else:
            gate_q = gate_q.filter(func.upper(func.trim(GateEntry.peeling_at)) == g_loc_clean)
            
    gate_records = gate_q.all()
    soaking_batches_in_fy = {str(r[0]).strip() for r in gate_records if r[0]}

    fresh_q = db.query(stock_entry).filter(
        stock_entry.company_id == comp_code,
        stock_entry.cargo_movement_type == "IN",
        stock_entry.batch_number.in_(list(soaking_batches_in_fy))
    )
    
    # Enforce Global Filters on Fresh Stock Query
    if global_production_for:
        fresh_q = fresh_q.filter(func.upper(func.trim(stock_entry.production_for)) == global_production_for.strip().upper())
    if global_location:
        g_loc_clean = global_location.strip().upper()
        if g_loc_clean in ["FLOOR", "OTHER FLOOR"]:
            fresh_q = fresh_q.filter(or_(func.upper(func.trim(stock_entry.production_at)) == "FLOOR", func.upper(func.trim(stock_entry.production_at)) == "OTHER FLOOR", stock_entry.production_at == None, func.trim(stock_entry.production_at) == ""))
        else:
            fresh_q = fresh_q.filter(func.upper(func.trim(stock_entry.production_at)) == g_loc_clean)

    if sel_species != "ALL": fresh_q = fresh_q.filter(stock_entry.species == sel_species)
    if sel_variety != "ALL": fresh_q = fresh_q.filter(stock_entry.variety == sel_variety)
    if sel_grade != "ALL": fresh_q = fresh_q.filter(stock_entry.grade == sel_grade)
    if sel_prod_for != "ALL": fresh_q = fresh_q.filter(stock_entry.production_for == sel_prod_for)
    if sel_prod_at != "ALL": fresh_q = fresh_q.filter(stock_entry.production_at == sel_prod_at)

    fresh_rows = fresh_q.all()
    total_in_qty = 0.0
    total_in_value = 0.0

    for r in fresh_rows:
        qty = float(r.quantity or 0)
        inv_val = float(r.inventory_value or 0) if getattr(r, "inventory_value", 0) else (qty * float(r.product_kg_value or 0))
        total_in_qty += qty
        total_in_value += inv_val

    # ============================================================
    # 🌟 2. GENERAL DASHBOARD LOOP
    # ============================================================
    stocks = db.query(stock_entry).filter(stock_entry.company_id == comp_code).all()
    cs_holds = db.query(cold_storage_holding).filter(cold_storage_holding.company_id == comp_code).all()

    opening_stock_qty, opening_stock_mc, grand_opening_loose = 0.0, 0, 0
    closing_stock_qty, closing_stock_mc, grand_loose = 0.0, 0, 0
    current_fy_stock_qty = 0.0
    total_opening_value = 0.0
    age_30, age_90, age_700, dead_stock_qty, dead_stock_value = 0.0, 0.0, 0.0, 0.0, 0.0

    table_grouping = defaultdict(lambda: {
        "opening_qty": 0.0, "opening_mc": 0, "opening_loose": 0,
        "in_qty": 0.0, "out_qty": 0.0, "qty": 0.0, "mc": 0, "loose": 0,
        "total_val_sum": 0.0, "ageing_days": 0, "production_for": "", "sp": ""
    })
    
    kpi_rates_helper = defaultdict(lambda: {"sum_val": 0.0, "sum_qty": 0.0})
    variety_stats = defaultdict(float)
    grade_stats = defaultdict(float)

    # 🟢 🔴 UPDATED IS_FILTERED: Integrated Global Header Controls
    def is_filtered(item, loc_val):
        if global_production_for and getattr(item, "production_for", None):
            if str(item.production_for).strip().upper() != global_production_for.strip().upper(): return True
        if global_location and loc_val:
            g_loc_clean = global_location.strip().upper()
            if g_loc_clean in ["FLOOR", "OTHER FLOOR"]:
                if loc_val not in ["FLOOR", "OTHER FLOOR", "PLANT", "CS", "N/A", ""]: pass
            elif str(loc_val).strip().upper() != g_loc_clean: return True
        elif user_allowed_locations and loc_val:
            if str(loc_val).strip().upper() not in user_allowed_locations: return True

        if sel_species != "ALL" and item.species != sel_species: return True
        if sel_variety != "ALL" and item.variety != sel_variety: return True
        if sel_grade != "ALL" and item.grade != sel_grade: return True
        if sel_prod_for != "ALL" and item.production_for != sel_prod_for: return True
        if sel_prod_at != "ALL" and loc_val != sel_prod_at: return True
        return False

    all_raw_data = []
    for s in stocks: 
        prod_val = getattr(s, "production_at", "PLANT") or "PLANT"
        all_raw_data.append((s, str(prod_val).strip().upper(), s.date))
        
    for c in cs_holds: 
        cs_val = getattr(c, "cold_storage_name", "CS") or "CS"
        item_date = c.in_date if c.in_date else today
        all_raw_data.append((c, str(cs_val).strip().upper(), item_date))

    # Rate calculation pass
    for item, loc, s_date in all_raw_data:
        if not s_date or is_filtered(item, loc): continue
        qty = float(getattr(item, "quantity", 0) or 0)
        rate = float(getattr(item, "product_kg_value", 0) or getattr(item, "rate_per_kg", 0) or 0)
        if qty > 0 and rate > 0:
            g_key = (item.species or "N/A", item.variety or "N/A", getattr(item, "packing_style", "N/A") or "N/A", item.glaze or "NW", item.grade or "N/A", item.production_for or "N/A")
            kpi_rates_helper[g_key]["sum_val"] += (qty * rate)
            kpi_rates_helper[g_key]["sum_qty"] += qty

    global_rates = {gk: (v["sum_val"] / v["sum_qty"] if v["sum_qty"] > 0.01 else 0.0) for gk, v in kpi_rates_helper.items()}

    # Main Metrics processing
    for item, loc, s_date in all_raw_data:
        if not s_date or is_filtered(item, loc): continue

        move = str(getattr(item, "cargo_movement_type", "") or "").strip().upper()
        if not move: move = "IN" 
            
        qty = float(getattr(item, "quantity", 0) or 0)
        rate = float(getattr(item, "product_kg_value", 0) or getattr(item, "rate_per_kg", 0) or 0)
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

        # Opening Stock Calculation
        if use_fy_filter and s_date < fy_start:
            opening_stock_qty += net
            opening_stock_mc += mc_net
            grand_opening_loose += loose_net
            total_opening_value += net_value
        
        if fy_start <= s_date <= fy_end:
            current_fy_stock_qty += net

        # Closing Stock Calculation
        if s_date <= fy_end:
            closing_stock_qty += net
            closing_stock_mc += mc_net
            grand_loose += loose_net
            if move == "IN":
                if ageing_days <= 30: age_30 += qty
                elif ageing_days <= 90: age_90 += qty
                elif ageing_days <= 700: age_700 += qty
                else: 
                    dead_stock_qty += qty
                    dead_stock_value += calculated_row_value

        fr = getattr(item, "freezer", "IQF") if hasattr(item, "freezer") else "CS"
        t_key = (loc, fr, item.variety or "N/A", item.packing_style or "N/A", item.glaze or "NW", item.grade or "N/A", item.production_for or "N/A")

        if use_fy_filter and s_date < fy_start:
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

    # ============================================================
    # 🌟 3. REGLAZE KPI LOGIC (FILTER BOUND)
    # ============================================================
    reglaze_q = db.query(stock_entry).filter(
        stock_entry.company_id == comp_code,
        func.upper(stock_entry.type_of_production) == "REGLAZE"
    )

    if use_fy_filter:
        reglaze_q = reglaze_q.filter(stock_entry.date >= fy_start, stock_entry.date <= fy_end)
    if global_production_for:
        reglaze_q = reglaze_q.filter(func.upper(func.trim(stock_entry.production_for)) == global_production_for.strip().upper())
    if global_location:
        g_loc_clean = global_location.strip().upper()
        if g_loc_clean in ["FLOOR", "OTHER FLOOR"]:
            reglaze_q = reglaze_q.filter(or_(func.upper(func.trim(stock_entry.production_at)) == "FLOOR", func.upper(func.trim(stock_entry.production_at)) == "OTHER FLOOR", stock_entry.production_at == None, func.trim(stock_entry.production_at) == ""))
        else:
            reglaze_q = reglaze_q.filter(func.upper(func.trim(stock_entry.production_at)) == g_loc_clean)

    if sel_species != "ALL": reglaze_q = reglaze_q.filter(stock_entry.species == sel_species)
    if sel_variety != "ALL": reglaze_q = reglaze_q.filter(stock_entry.variety == sel_variety)
    if sel_grade != "ALL": reglaze_q = reglaze_q.filter(stock_entry.grade == sel_grade)
    if sel_prod_for != "ALL": reglaze_q = reglaze_q.filter(stock_entry.production_for == sel_prod_for)
    if sel_prod_at != "ALL": reglaze_q = reglaze_q.filter(stock_entry.production_at == sel_prod_at)

    reglaze_rows = reglaze_q.all()
    reglaze_qty = 0.0
    reglaze_value = 0.0

    for r in reglaze_rows:
        r_move = str(getattr(r, "cargo_movement_type", "") or "").strip().upper()
        if not r_move: r_move = "IN"
        r_sign = 1 if r_move == "IN" else -1

        qty = float(r.quantity or 0)
        rate = float(getattr(r, "product_kg_value", 0) or getattr(r, "rate_per_kg", 0) or 0)
        if rate <= 0:
            g_key = (r.species or "N/A", r.variety or "N/A", getattr(r, "packing_style", "N/A") or "N/A", r.glaze or "NW", r.grade or "N/A", r.production_for or "N/A")
            rate = global_rates.get(g_key, 0.0)
        
        row_val = qty * rate
        reglaze_qty += (qty * r_sign)
        reglaze_value += (row_val * r_sign)

    # ============================================================
    # OVERRIDES FOR EXTERNAL TABLES (SALES & REPROCESS - FILTERS SYNCED)
    # ============================================================
    sales_db_query = db.query(
        func.sum(sales_dispatch.sales_quantity).label("sales_qty_kg"),  
        func.sum(sales_dispatch.amount_inr).label("sales_total_inr_value")  
    ).filter(sales_dispatch.company_id == comp_code)

    if use_fy_filter:
        sales_db_query = sales_db_query.filter(
            func.to_date(sales_dispatch.invoice_date, 'YYYY-MM-DD') >= fy_start,
            func.to_date(sales_dispatch.invoice_date, 'YYYY-MM-DD') <= fy_end
        )
    if global_production_for:
        sales_db_query = sales_db_query.filter(func.upper(func.trim(sales_dispatch.buyer_name)) == global_production_for.strip().upper())
        
    if sel_variety != "ALL": sales_db_query = sales_db_query.filter(sales_dispatch.variety == sel_variety)
    if sel_grade != "ALL": sales_db_query = sales_db_query.filter(sales_dispatch.grade == sel_grade)
    if sel_prod_for != "ALL": sales_db_query = sales_db_query.filter(sales_dispatch.buyer_name == sel_prod_for)
        
    sales_metrics_result = sales_db_query.first()
    total_out_qty = float(getattr(sales_metrics_result, "sales_qty_kg", 0) or 0)
    total_out_value = float(getattr(sales_metrics_result, "sales_total_inr_value", 0) or 0)

    # Reprocess Metrics
    reprocess_db_query = db.query(
        func.sum(Reprocess.in_qty).label("reproc_total_qty"),
        func.sum(Reprocess.inventory_value).label("reproc_total_value")
    ).filter(Reprocess.company_id == comp_code, not_(Reprocess.reprocess_type.ilike("%sales%")))

    if use_fy_filter:
        reprocess_db_query = reprocess_db_query.filter(Reprocess.date >= fy_start, Reprocess.date <= fy_end)
    if global_production_for:
        reprocess_db_query = reprocess_db_query.filter(func.upper(func.trim(Reprocess.production_for)) == global_production_for.strip().upper())

    if sel_species != "ALL": reprocess_db_query = reprocess_db_query.filter(Reprocess.species == sel_species)
    if sel_variety != "ALL": reprocess_db_query = reprocess_db_query.filter(Reprocess.variety == sel_variety)
    if sel_grade != "ALL": reprocess_db_query = reprocess_db_query.filter(Reprocess.grade == sel_grade)
    if sel_prod_for != "ALL": reprocess_db_query = reprocess_db_query.filter(Reprocess.production_for == sel_prod_for)

    reprocess_metrics_result = reprocess_db_query.first()
    reprocess_qty = float(getattr(reprocess_metrics_result, "reproc_total_qty", 0) or 0)
    reprocess_value = float(getattr(reprocess_metrics_result, "reproc_total_value", 0) or 0)

    # Grid Formatting Matrix
    global_item_rates = defaultdict(lambda: {"sum_val": 0.0, "sum_qty": 0.0})
    for (loc, fr, vr, pk, gl, gr, p_for), data in table_grouping.items():
        g_key = (data["sp"], vr, pk, gl, gr, p_for)
        global_item_rates[g_key]["sum_val"] += data["total_val_sum"]
        global_item_rates[g_key]["sum_qty"] += data["qty"]

    rate_map = {gk: (v["sum_val"] / v["sum_qty"] if abs(v["sum_qty"]) > 0.01 else 0.0) for gk, v in global_item_rates.items()}

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

    # Dynamic FY Options Generation from Gate Entry
    all_gate_dates = db.query(GateEntry.date).filter(GateEntry.company_id == comp_code, GateEntry.date != None).all()
    fy_set = set()
    for d_tuple in all_gate_dates:
        d = d_tuple[0]
        if d:
            y_val = int(d.year)
            fy_set.add(y_val if d.month >= 4 else y_val - 1)
            
    fy_years_ints = sorted(list(fy_set), reverse=True)
    if not fy_years_ints:
        fy_years_ints = [current_fy_start_year]

    fy_options = [f"{yr}-{str(yr+1)[2:]}" for yr in fy_years_ints]

    def get_list(model, field):
        return sorted(list(set([getattr(x, field) for x in db.query(model).filter(model.company_id == comp_code).all() if getattr(x, field)])))

    context = {
        "request": request,
        "total_sales_qty": round(total_out_qty, 2), 
        "reprocess_qty": round(reprocess_qty, 2),
        "opening_stock_qty": round(opening_stock_qty, 2),
        "current_fy_stock_qty": round(current_fy_stock_qty, 2),
        "closing_stock_qty": round(closing_stock_qty, 2),
        "grand_opening_mc": opening_stock_mc,
        "grand_opening_loose": grand_opening_loose,
        "closing_stock_mc": closing_stock_mc,
        "grand_loose": grand_loose,
        "total_in_qty": round(total_in_qty, 2),          
        "total_in_value": round(total_in_value, 2),      
        "total_out_qty": round(total_out_qty, 2),
        "total_opening_value": round(total_opening_value, 2),
        "total_inventory_value": round(total_inventory_value, 2),
        "total_out_value": round(total_out_value, 2),
        "reprocess_value": round(reprocess_value, 2),
        "dead_stock_value": round(dead_stock_value, 2),
        "dead_stock_qty": round(dead_stock_qty, 2),
        "age_30": round(age_30, 2), "age_90": round(age_90, 2), "age_700": round(age_700, 2),
        "stock_table_data": stock_table_data,
        "variety_labels": list(variety_stats.keys()), "variety_values": list(variety_stats.values()),
        "grade_labels": list(grade_stats.keys())[:10], "grade_values": list(grade_stats.values())[:10],
        
        "reglaze_qty": round(reglaze_qty, 2),
        "reglaze_value": round(reglaze_value, 2),
        
        "fy_options": fy_options,
        "financial_years": fy_years_ints,
        "species_list": get_list(species, "species_name"), 
        "varieties_list": get_list(varieties, "variety_name"),
        "grades_list": get_list(grades, "grade_name"), 
        "prod_for_list": get_list(production_for, "production_for"),
        
        "sel_species": sel_species, 
        "sel_variety": sel_variety, 
        "sel_grade": sel_grade,
        "sel_prod_for": sel_prod_for, 
        "sel_fy": sel_fy, 
        "selected_fy": str(start_year),
        "current_fy_name": current_fy_string
    }

    return request.app.state.templates.TemplateResponse(
        request=request, name="inventory_management/inventory_dashboard.html", context=context
    )


# ============================================================
# 🌟 KPI DRILL-DOWN DETAILS (GLOBAL FILTER SYNCED POP-UP ENDPOINT)
# ============================================================
@router.get("/kpi_details")
async def get_kpi_details(
    request: Request,
    kpi_type: str = Query(...),  # FRESH, REGLAZE, REPROCESS
    sel_species: str = Query("ALL"),
    sel_variety: str = Query("ALL"),
    sel_grade: str = Query("ALL"),
    sel_fy: str = Query("ALL"),
    db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")
    if not comp_code:
        return {"status": "error", "message": "Unauthorized"}, 401

    # 🟢 🔴 FETCH BKNR GLOBAL FILTERS CONTEXT FOR POP-UP DRILL DOWN
    global_production_for, global_location = get_global_filters(request)

    today = ist_now().date()
    current_year = today.year
    current_fy_start_year = current_year if today.month >= 4 else current_year - 1
    
    if sel_fy == "ALL":
        start_year = current_fy_start_year
    else:
        try:
            start_year = int(sel_fy.split("-")[0])
        except:
            start_year = current_fy_start_year

    fy_start = date(start_year, 4, 1)
    fy_end = date(start_year + 1, 3, 31)

    result_data = []

    # 1. FRESH PRODUCTION DRILL DOWN (FILTER SYNCED)
    if kpi_type.upper() == "FRESH":
        gate_q = db.query(GateEntry.batch_number).filter(
            GateEntry.company_id == comp_code, 
            GateEntry.date >= fy_start, 
            GateEntry.date <= fy_end
        )
        if global_location:
            g_loc_clean = global_location.strip().upper()
            if g_loc_clean in ["FLOOR", "OTHER FLOOR"]:
                gate_q = gate_q.filter(or_(func.upper(func.trim(GateEntry.peeling_at)) == "FLOOR", func.upper(func.trim(GateEntry.peeling_at)) == "OTHER FLOOR", GateEntry.peeling_at == None, func.trim(GateEntry.peeling_at) == ""))
            else:
                gate_q = gate_q.filter(func.upper(func.trim(GateEntry.peeling_at)) == g_loc_clean)

        gate_records = gate_q.all()
        soaking_batches = {str(r[0]).strip() for r in gate_records if r[0]}

        query = db.query(stock_entry).filter(
            stock_entry.company_id == comp_code,
            stock_entry.cargo_movement_type == "IN",
            stock_entry.batch_number.in_(list(soaking_batches))
        )
        if global_production_for:
            query = query.filter(func.upper(func.trim(stock_entry.production_for)) == global_production_for.strip().upper())
        if global_location:
            g_loc_clean = global_location.strip().upper()
            if g_loc_clean in ["FLOOR", "OTHER FLOOR"]:
                query = query.filter(or_(func.upper(func.trim(stock_entry.production_at)) == "FLOOR", func.upper(func.trim(stock_entry.production_at)) == "OTHER FLOOR", stock_entry.production_at == None, func.trim(stock_entry.production_at) == ""))
            else:
                query = query.filter(func.upper(func.trim(stock_entry.production_at)) == g_loc_clean)

        if sel_species != "ALL": query = query.filter(stock_entry.species == sel_species)
        if sel_variety != "ALL": query = query.filter(stock_entry.variety == sel_variety)
        if sel_grade != "ALL": query = query.filter(stock_entry.grade == sel_grade)
        
        rows = query.all()
        for r in rows:
            result_data.append({
                "date": str(r.date) if r.date else "N/A", 
                "batch": r.batch_number or "N/A", 
                "species": r.species or "N/A",
                "variety": r.variety or "N/A", 
                "grade": r.grade or "N/A", 
                "packing": r.packing_style or "N/A",
                "mc": r.no_of_mc or 0, 
                "loose": r.loose or 0, 
                "qty": round(r.quantity or 0.0, 2),
                "value": round((r.quantity or 0) * (r.product_kg_value or 0), 2)
            })

    # 2. REGLAZE DRILL DOWN (FILTER SYNCED)
    elif kpi_type.upper() == "REGLAZE":
        query = db.query(stock_entry).filter(
            stock_entry.company_id == comp_code,
            func.upper(stock_entry.type_of_production) == "REGLAZE",
            stock_entry.date >= fy_start, 
            stock_entry.date <= fy_end
        )
        if global_production_for:
            query = query.filter(func.upper(func.trim(stock_entry.production_for)) == global_production_for.strip().upper())
        if global_location:
            g_loc_clean = global_location.strip().upper()
            if g_loc_clean in ["FLOOR", "OTHER FLOOR"]:
                query = query.filter(or_(func.upper(func.trim(stock_entry.production_at)) == "FLOOR", func.upper(func.trim(stock_entry.production_at)) == "OTHER FLOOR", stock_entry.production_at == None, func.trim(stock_entry.production_at) == ""))
            else:
                query = query.filter(func.upper(func.trim(stock_entry.production_at)) == g_loc_clean)

        if sel_species != "ALL": query = query.filter(stock_entry.species == sel_species)
        if sel_variety != "ALL": query = query.filter(stock_entry.variety == sel_variety)
        if sel_grade != "ALL": query = query.filter(stock_entry.grade == sel_grade)

        rows = query.all()
        for r in rows:
            move_sign = 1 if (r.cargo_movement_type or "IN").upper() == "IN" else -1
            result_data.append({
                "date": str(r.date) if r.date else "N/A", 
                "batch": r.batch_number or "N/A", 
                "species": r.species or "N/A",
                "variety": r.variety or "N/A", 
                "grade": r.grade or "N/A", 
                "packing": r.packing_style or "N/A",
                "mc": (r.no_of_mc or 0) * move_sign, 
                "loose": (r.loose or 0) * move_sign, 
                "qty": round((r.quantity or 0.0) * move_sign, 2),
                "value": round((r.quantity or 0) * (r.product_kg_value or 0) * move_sign, 2)
            })

    # 3. REPROCESS DRILL DOWN (FILTER SYNCED)
    elif kpi_type.upper() == "REPROCESS":
        query = db.query(Reprocess).filter(
            Reprocess.company_id == comp_code,
            not_(Reprocess.reprocess_type.ilike("%sales%")),
            Reprocess.date >= fy_start, 
            Reprocess.date <= fy_end
        )
        if global_production_for:
            query = query.filter(func.upper(func.trim(Reprocess.production_for)) == global_production_for.strip().upper())

        if sel_species != "ALL": query = query.filter(Reprocess.species == sel_species)
        if sel_variety != "ALL": query = query.filter(Reprocess.variety == sel_variety)
        if sel_grade != "ALL": query = query.filter(Reprocess.grade == sel_grade)

        rows = query.all()
        for r in rows:
            result_data.append({
                "date": str(r.date) if r.date else "N/A", 
                "batch": r.batch_no or "N/A", 
                "species": r.species or "N/A",
                "variety": r.variety or "N/A", 
                "grade": r.grade or "N/A", 
                "packing": "N/A",
                "mc": 0, 
                "loose": 0, 
                "qty": round(r.in_qty or 0.0, 2),
                "value": round(r.inventory_value or 0.0, 2)
            })

    return {"status": "success", "data": result_data}