# app/routers/dashboards/inventory.py

from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta, date
import logging
from collections import defaultdict

from app.database import get_db
from app.database.models.inventory_management import stock_entry, cold_storage_holding, pending_orders, sales_dispatch
from app.database.models.reprocess import Reprocess
from app.database.models.criteria import (
    buyers, buyer_agents, brands, countries,
    varieties, grades, glazes, packing_styles, freezers, species, 
    production_for
)

router = APIRouter(prefix="/inventory_dashboard", tags=["INVENTORY DASHBOARD"])
logger = logging.getLogger(__name__)

@router.get("/", response_class=HTMLResponse)
async def get_inventory_dashboard(
    request: Request,
    from_date: str = Query(None),
    to_date: str = Query(None),
    sel_species: str = Query("ALL"),
    sel_variety: str = Query("ALL"),
    sel_grade: str = Query("ALL"),
    sel_packing: str = Query("ALL"),
    sel_prod_for: str = Query("ALL"),
    sel_prod_at: str = Query("ALL"),
    sel_glaze: str = Query("ALL"),
    sel_freezer: str = Query("ALL"),
    db: Session = Depends(get_db)
):
    # 1. Session & Security
    email = request.session.get("email")
    comp_code = request.session.get("company_code")
    if not email or not comp_code:
        return RedirectResponse("/auth/login", status_code=302)

    # 2. Date Logic
    if not from_date:
        from_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')
    if not to_date:
        to_date = datetime.now().strftime('%Y-%m-%d')

    # 3. Filter Logic
    def apply_filters(query, model):
        if sel_species != "ALL": query = query.filter(model.species == sel_species)
        if sel_variety != "ALL": query = query.filter(model.variety == sel_variety)
        if sel_grade != "ALL": query = query.filter(model.grade == sel_grade)
        if sel_packing != "ALL": query = query.filter(model.packing_style == sel_packing)
        if hasattr(model, 'glaze') and sel_glaze != "ALL": query = query.filter(model.glaze == sel_glaze)
        if hasattr(model, 'freezer_type') and sel_freezer != "ALL": query = query.filter(model.freezer_type == sel_freezer)
        if hasattr(model, 'production_for') and sel_prod_for != "ALL": query = query.filter(model.production_for == sel_prod_for)
        if hasattr(model, 'production_at') and sel_prod_at != "ALL": query = query.filter(model.production_at == sel_prod_at)
        
        d_field = 'date' if hasattr(model, 'date') else 'in_date'
        try:
            if from_date: query = query.filter(getattr(model, d_field) >= date.fromisoformat(from_date))
            if to_date: query = query.filter(getattr(model, d_field) <= date.fromisoformat(to_date))
        except: pass
        return query

    stock_rows = apply_filters(db.query(stock_entry).filter(stock_entry.company_id == comp_code), stock_entry).all()
    cs_rows = apply_filters(db.query(cold_storage_holding).filter(cold_storage_holding.company_id == comp_code), cold_storage_holding).all()

    # 4. Data Aggregation
    inventory_sum = 0.0
    inventory_val = 0.0
    total_sales_qty = 0.0
    cs_net = 0.0
    reprocess_qty = 0.0
    
    # Tables & Charts
    production_at_totals = defaultdict(float)
    production_for_breakdown = defaultdict(lambda: defaultdict(float))
    storage_wise_totals = defaultdict(float)
    storage_prod_for_breakdown = defaultdict(lambda: defaultdict(float))
    
    variety_chart = defaultdict(float)
    grade_data = defaultdict(float)
    daily_flow = defaultdict(lambda: {"IN": 0.0, "OUT": 0.0})
    table_grouping = defaultdict(float)

    # Process Stock Entry
    for r in stock_rows:
        sign = 1 if r.cargo_movement_type == "IN" else -1
        qty = float(r.quantity or 0) * sign
        rate = float(r.product_kg_value or r.sales_reference_rate or 0)
        
        inventory_sum += qty
        inventory_val += (abs(qty) * rate * sign)

        # Sales logic: Stock Entry Sales
        if r.purpose == "SALES" or r.type_of_production == "SALES":
            total_sales_qty += abs(qty)

        # Reprocess logic: Non-Raw types
        if r.type_of_production and r.type_of_production.upper() != "RAW":
            reprocess_qty += qty # Net sum of non-raw (In minus Out)

        # Breakdowns
        pa = r.production_at or "OTHERS"
        pf = r.production_for or "STOCK"
        production_at_totals[pa] += qty
        production_for_breakdown[pa][pf] += qty
        
        variety_chart[r.variety or "N/A"] += qty
        grade_data[r.grade or "N/A"] += qty
        
        # Table Ledger
        t_key = (pa, r.species, r.variety, r.grade, getattr(r, 'freezer_type', 'N/A'), r.packing_style)
        table_grouping[t_key] += qty
        
        d_str = r.date.strftime('%d %b') if r.date else "N/A"
        daily_flow[d_str][r.cargo_movement_type] += abs(qty)

    # Process Cold Storage
    for c in cs_rows:
        sign = 1 if c.cargo_movement_type == "IN" else -1
        qty = float(c.quantity or 0) * sign
        cs_net += qty
        
        # Sales logic: CS Out for Sales
        if c.cargo_movement_type == "OUT" and c.purpose == "SALES":
            total_sales_qty += abs(qty)

        storage = c.cold_storage_name or "EXTERNAL CS"
        pf_cs = c.production_for or "STOCK"
        storage_wise_totals[storage] += qty
        storage_prod_for_breakdown[storage][pf_cs] += qty
        
        # Add to table grouping under CS
        t_key_cs = (storage, c.species, c.variety, c.grade, "CS-STK", c.packing_style)
        table_grouping[t_key_cs] += qty

        d_str = c.in_date.strftime('%d %b') if hasattr(c, 'in_date') and c.in_date else "N/A"
        daily_flow[d_str][c.cargo_movement_type] += abs(qty)

    # 5. Final Formatting
    stock_table_data = []
    sub_totals = defaultdict(float)
    for (pa, sp, vr, gr, fr, pk), q in table_grouping.items():
        if abs(q) > 0.01: # Filter zero stocks
            stock_table_data.append({"prod_at": pa, "species": sp, "variety": vr, "grade": gr, "freezer": fr, "packing": pk, "qty": q})
            sub_totals[pa] += q
    
    stock_table_data.sort(key=lambda x: x['prod_at'])

    def get_list(model, field):
        return [getattr(x, field) for x in db.query(model).all()]

    context = {
        "request": request,
        "from_date": from_date, "to_date": to_date,
        "available_qty": round(inventory_sum + cs_net, 2),
        "available_val": round(inventory_val, 2),
        "inventory_sum": round(inventory_sum, 2),
        "cs_net": round(cs_net, 2),
        "total_sales_qty": round(total_sales_qty, 2),
        "reprocess_qty": round(reprocess_qty, 2),
        "production_at_totals": dict(production_at_totals),
        "production_for_breakdown": {k: dict(v) for k, v in production_for_breakdown.items()},
        "storage_wise_totals": dict(storage_wise_totals),
        "storage_prod_for_breakdown": {k: dict(v) for k, v in storage_prod_for_breakdown.items()},
        "variety_labels": list(variety_chart.keys()),
        "variety_values": list(variety_chart.values()),
        "grade_labels": list(grade_data.keys())[:10],
        "grade_values": list(grade_data.values())[:10],
        "daily_labels": list(daily_flow.keys()),
        "daily_in": [v["IN"] for v in daily_flow.values()],
        "daily_out": [v["OUT"] for v in daily_flow.values()],
        "stock_table_data": stock_table_data,
        "sub_totals": dict(sub_totals),
        "species_list": get_list(species, "species_name"),
        "varieties_list": get_list(varieties, "variety_name"),
        "grades_list": get_list(grades, "grade_name"),
        "packing_list": get_list(packing_styles, "packing_style"),
        "glaze_list": get_list(glazes, "glaze_name"),
        "freezer_list": get_list(freezers, "freezer_name"),
        "prod_for_list": get_list(production_for, "production_for"),
        "sel_species": sel_species, "sel_variety": sel_variety, "sel_grade": sel_grade,
        "sel_packing": sel_packing, "sel_prod_for": sel_prod_for, "sel_prod_at": sel_prod_at,
        "sel_glaze": sel_glaze, "sel_freezer": sel_freezer
    }

    return request.app.state.templates.TemplateResponse("inventory_management/inventory_dashboard.html", context)