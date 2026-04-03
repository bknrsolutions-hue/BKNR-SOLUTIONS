# app/routers/dashboards/inventory.py

from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
import logging

from app.database import get_db
from app.database.models.inventory_management import stock_entry, pending_orders
from app.database.models.processing import RawMaterialPurchasing, DeHeading, Peeling, Production
from app.database.models.criteria import packing_styles

router = APIRouter(tags=["INVENTORY DASHBOARD"])
templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)

# ============================================================
# 📦 INVENTORY DASHBOARD
# ============================================================
@router.get("/inventory_dashboard", response_class=HTMLResponse)
def inventory_dashboard(
    request: Request,
    db: Session = Depends(get_db),
    prod_for: str = "ALL",
    prod_at: str = "ALL",
    from_date: str = "",
    to_date: str = ""
):
    # ---------------------------------------------------------
    # 1. SESSION SECURITY
    # ---------------------------------------------------------
    email = request.session.get("email")
    comp_code = request.session.get("company_code")

    if not email or not comp_code:
        return RedirectResponse("/auth/login", status_code=302)

    # ---------------------------------------------------------
    # 2. COSTING MAPS (Batch + Species wise rate calculation)
    # ---------------------------------------------------------
    # Raw Material Purchase Amount Map
    rm_rows = db.query(
        RawMaterialPurchasing.batch_number,
        RawMaterialPurchasing.species,
        func.coalesce(func.sum(RawMaterialPurchasing.amount), 0)
    ).filter(RawMaterialPurchasing.company_id == comp_code).group_by(
        RawMaterialPurchasing.batch_number, RawMaterialPurchasing.species
    ).all()

    rm_amt_map = {(str(b).strip(), str(s).strip().lower()): float(a) for b, s, a in rm_rows}

    # Total Stock In Quantity Map for Rate derivation
    stock_in_rows = db.query(
        stock_entry.batch_number,
        stock_entry.species,
        func.coalesce(func.sum(stock_entry.quantity), 0)
    ).filter(
        stock_entry.company_id == comp_code, 
        stock_entry.cargo_movement_type == "IN"
    ).group_by(stock_entry.batch_number, stock_entry.species).all()

    stock_qty_map = {(str(b).strip(), str(s).strip().lower()): float(q) for b, s, q in stock_in_rows}

    # ---------------------------------------------------------
    # 3. STOCK QUERY + FILTERS
    # ---------------------------------------------------------
    q = db.query(stock_entry).filter(stock_entry.company_id == comp_code)

    if prod_for != "ALL": q = q.filter(stock_entry.production_for == prod_for)
    if prod_at != "ALL": q = q.filter(stock_entry.production_at == prod_at)
    
    try:
        if from_date: q = q.filter(stock_entry.date >= date.fromisoformat(from_date))
        if to_date: q = q.filter(stock_entry.date <= date.fromisoformat(to_date))
    except Exception as e:
        logger.error(f"Date Filter Error: {e}")

    rows = q.all()

    # ---------------------------------------------------------
    # 4. DASHBOARD AGGREGATES & KPI LOGIC
    # ---------------------------------------------------------
    total_qty = total_value = 0.0
    production_qty = production_val = 0.0
    sales_qty = sales_val = 0.0
    store_out_qty = store_out_val = 0.0

    grade_cards = {}
    variety_chart = {}
    flow_chart = {}

    for r in rows:
        sign = 1 if r.cargo_movement_type == "IN" else -1
        qty = float(r.quantity or 0) * sign

        key = (str(r.batch_number).strip(), str(r.species or "").strip().lower())
        rm_amt = rm_amt_map.get(key, 0)
        in_qty = stock_qty_map.get(key, 0)

        # Derived Rate Logic
        rate = round(rm_amt / in_qty, 2) if in_qty > 0 else float(r.sales_reference_rate or 0)
        value = abs(qty) * rate

        # Aggregate Totals
        total_qty += qty
        total_value += (value * sign)

        prod_type = (r.type_of_production or "").upper()
        if prod_type == "PRODUCTION":
            production_qty += qty
            production_val += value
        elif prod_type in ["SALES", "STORE OUT"]:
            if prod_type == "SALES":
                sales_qty += abs(qty)
                sales_val += value
            store_out_qty += abs(qty)
            store_out_val += value

        # Grade-wise grouping
        g = r.grade or "N/A"
        if g not in grade_cards:
            grade_cards[g] = {"avail_qty": 0.0, "avail_val": 0.0, "sales_qty": 0.0, "sales_val": 0.0}
        
        grade_cards[g]["avail_qty"] += qty
        grade_cards[g]["avail_val"] += (value * sign)
        if prod_type == "SALES":
            grade_cards[g]["sales_qty"] += abs(qty)
            grade_cards[g]["sales_val"] += value

        # Charts Data
        v = r.variety or "N/A"
        variety_chart[v] = variety_chart.get(v, 0) + qty
        if r.date:
            dkey = r.date.strftime("%Y-%m-%d")
            flow_chart[dkey] = flow_chart.get(dkey, 0) + qty

    # ---------------------------------------------------------
    # 5. PROCESSING & PENDING ORDERS (Safe Totals)
    # ---------------------------------------------------------
    def get_sum(model, col):
        return db.query(func.coalesce(func.sum(col), 0)).filter(model.company_id == comp_code).scalar() or 0

    rm_total = get_sum(RawMaterialPurchasing, RawMaterialPurchasing.received_qty)
    dh_total = get_sum(DeHeading, DeHeading.hoso_qty)
    peeling_total = get_sum(Peeling, Peeling.peeled_qty)
    prod_total = get_sum(Production, Production.production_qty)

    # Pending Orders Logic
    pack_rows = db.query(packing_styles).filter(packing_styles.company_id == comp_code).all()
    PACK_WT = {p.packing_style: float(p.mc_weight or 0) for p in pack_rows}

    pending_qty = pending_val = 0.0
    pending_rows = db.query(pending_orders).filter(pending_orders.company_id == comp_code).all()
    
    for p in pending_rows:
        mc = float(p.no_of_mc or 0)
        wt = PACK_WT.get(p.packing_style, 0)
        pending_qty += (mc * wt)
        pending_val += (mc * float(p.selling_price or 0) * float(p.exchange_rate or 0))

    # ---------------------------------------------------------
    # 6. FINAL RESPONSE
    # ---------------------------------------------------------
    return templates.TemplateResponse(
        request=request,
        name="inventory_management/inventory_dashboard.html",
        context={
            "available_qty": round(total_qty, 2),
            "available_val": round(total_value, 2),
            "production_qty": round(production_qty, 2),
            "production_val": round(production_val, 2),
            "sales_qty": round(sales_qty, 2),
            "sales_val": round(sales_val, 2),
            "pending_orders_qty": round(pending_qty, 2),
            "pending_orders_val": round(pending_val, 2),
            "reprocess_qty": round(store_out_qty - sales_qty, 2),
            "grade_cards": grade_cards,
            "rm_total": round(rm_total, 2),
            "dh_total": round(dh_total, 2),
            "peeling_total": round(peeling_total, 2),
            "prod_total": round(prod_total, 2),
            "flow_labels": list(flow_chart.keys()),
            "flow_values": list(flow_chart.values()),
            "variety_labels": list(variety_chart.keys()),
            "variety_values": list(variety_chart.values()),
            "sel_prod_for": prod_for,
            "sel_prod_at": prod_at,
            "from_date": from_date,
            "to_date": to_date,
            "email": email,
            "comp_code": comp_code
        }
    )