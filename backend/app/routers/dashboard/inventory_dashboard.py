from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime
from collections import defaultdict

from app.database import get_db
from app.database.models.inventory_management import stock_entry, cold_storage_holding
from app.database.models.criteria import (
    varieties, grades, glazes, packing_styles, freezers, species, production_for
)

router = APIRouter(prefix="/inventory_dashboard", tags=["INVENTORY DASHBOARD"])

@router.get("", response_class=HTMLResponse)
@router.get("/", response_class=HTMLResponse)
async def get_inventory_dashboard(
    request: Request,
    sel_species: str = Query("ALL"),
    sel_variety: str = Query("ALL"),
    sel_grade: str = Query("ALL"),
    sel_prod_at: str = Query("ALL"),
    sel_prod_for: str = Query("ALL"),
    db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")
    if not comp_code: 
        return RedirectResponse("/auth/login")

    # 1. Fetch Raw Data
    stocks = db.query(stock_entry).filter(stock_entry.company_id == comp_code).all()
    cs_holds = db.query(cold_storage_holding).filter(cold_storage_holding.company_id == comp_code).all()

    # 2. Aggregators
    available_qty = 0.0
    total_sales_qty = 0.0
    reprocess_qty = 0.0
    live_stock_mc = 0
    storage_mc = 0

    plant_report = defaultdict(lambda: {"total": 0.0, "for_breakdown": defaultdict(float)})
    cs_report = defaultdict(lambda: {"total": 0.0, "for_breakdown": defaultdict(float)})
    
    # Table Grouping Key: (loc, fr, vr, pk, gl, gr, src) -> Total 7 values for unique rows
    table_grouping = defaultdict(lambda: {"qty": 0.0, "mc": 0})
    
    variety_stats = defaultdict(float)
    grade_stats = defaultdict(float)
    daily_flow = defaultdict(lambda: {"IN": 0.0, "OUT": 0.0})

    # A. Process Plant (Live Stock) Data
    for r in stocks:
        move = str(r.cargo_movement_type or "").strip().upper()
        qty = float(r.quantity or 0)
        sign = 1 if move == "IN" else -1
        net = qty * sign
        mc = (r.no_of_mc or 0) * sign

        available_qty += net
        live_stock_mc += mc
        
        if move == "OUT" and "SALE" in str(r.purpose or "").upper(): 
            total_sales_qty += qty
        if str(r.type_of_production or "").strip().upper() != "RAW": 
            reprocess_qty += net

        # Global Filters
        if sel_species != "ALL" and r.species != sel_species: continue
        if sel_variety != "ALL" and r.variety != sel_variety: continue
        if sel_grade != "ALL" and r.grade != sel_grade: continue
        if sel_prod_for != "ALL" and r.production_for != sel_prod_for: continue

        loc = r.production_at or "PLANT"
        if sel_prod_at != "ALL" and loc != sel_prod_at: continue

        plant_report[loc]["total"] += net
        plant_report[loc]["for_breakdown"][r.production_for or "N/A"] += net

        # t_key grouping (Unpack Error fix: using consistent 7 elements)
        t_key = (loc, r.freezer or "IQF", r.variety, r.packing_style or "N/A", r.glaze or "NW", r.grade, "PLANT")
        table_grouping[t_key]["qty"] += net
        table_grouping[t_key]["mc"] += mc
        
        variety_stats[r.variety or "N/A"] += net
        grade_stats[r.grade or "N/A"] += net
        d_str = r.date.strftime('%Y-%m-%d') if r.date else "N/A"
        daily_flow[d_str][move] += qty

    # B. Process Cold Storage Data
    for c in cs_holds:
        move = str(c.cargo_movement_type or "").strip().upper()
        qty = float(c.quantity or 0)
        sign = 1 if move == "IN" else -1
        net = qty * sign
        mc = (c.no_of_mc or 0) * sign

        available_qty += net
        storage_mc += mc
        if move == "OUT" and "SALE" in str(c.purpose or "").upper(): 
            total_sales_qty += qty

        if sel_species != "ALL" and c.species != sel_species: continue
        if sel_variety != "ALL" and c.variety != sel_variety: continue
        if sel_grade != "ALL" and c.grade != sel_grade: continue
        if sel_prod_for != "ALL" and c.production_for != sel_prod_for: continue

        loc = c.cold_storage_name or "CS"
        if sel_prod_at != "ALL" and loc != sel_prod_at: continue

        cs_report[loc]["total"] += net
        cs_report[loc]["for_breakdown"][c.production_for or "N/A"] += net

        # t_key grouping (Consistent with Plant)
        t_key = (loc, "CS", c.variety, c.packing_style or "N/A", c.glaze or "NW", c.grade, "CS")
        table_grouping[t_key]["qty"] += net
        table_grouping[t_key]["mc"] += mc
        
        variety_stats[c.variety or "N/A"] += net
        grade_stats[c.grade or "N/A"] += net
        d_str = c.in_date.strftime('%Y-%m-%d') if c.in_date else "N/A"
        daily_flow[d_str][move] += qty

    # 3. Final Formatting
    stock_table_data = []
    sub_totals = defaultdict(float)
    
    # Correct Unpacking: 7 values to match t_key precisely
    for (loc, fr, vr, pk, gl, gr, src), data in table_grouping.items():
        if abs(data["qty"]) > 0.01:
            stock_table_data.append({
                "loc": loc, "fr": fr, "vr": vr, "pk": pk, 
                "gl": gl, "gr": gr, "qty": data["qty"], "mc": data["mc"], "src": src
            })
            sub_totals[loc] += data["qty"]
    
    # Sorting by Location then Variety for clean Sub-totals in UI
    stock_table_data.sort(key=lambda x: (x['loc'], x['vr']))

    sorted_dates = sorted(daily_flow.keys())
    
    def get_list(model, field):
        return sorted(list(set([getattr(x, field) for x in db.query(model).filter(model.company_id == comp_code).all() if getattr(x, field)])))

    context = {
        "request": request,
        "available_qty": available_qty,
        "total_sales_qty": total_sales_qty,
        "reprocess_qty": reprocess_qty,
        "total_mc_count": live_stock_mc + storage_mc,
        "live_stock_mc": live_stock_mc,
        "storage_mc": storage_mc,
        "plant_report": dict(plant_report),
        "cs_report": dict(cs_report),
        "stock_table_data": stock_table_data,
        "sub_totals": dict(sub_totals),
        "variety_labels": list(variety_stats.keys()),
        "variety_values": list(variety_stats.values()),
        "grade_labels": list(grade_stats.keys())[:10],
        "grade_values": list(grade_stats.values())[:10],
        "daily_labels": sorted_dates,
        "daily_in": [daily_flow[d]["IN"] for d in sorted_dates],
        "daily_out": [daily_flow[d]["OUT"] for d in sorted_dates],
        "species_list": get_list(species, "species_name"),
        "varieties_list": get_list(varieties, "variety_name"),
        "grades_list": get_list(grades, "grade_name"),
        "prod_for_list": get_list(production_for, "production_for"),
        "sel_species": sel_species, 
        "sel_variety": sel_variety, 
        "sel_grade": sel_grade, 
        "sel_prod_for": sel_prod_for, 
        "sel_prod_at": sel_prod_at
    }

    # TemplateResponse call with correct Argument order: (TemplateName, Context)
    return request.app.state.templates.TemplateResponse(
        "inventory_management/inventory_dashboard.html", 
        context
    )