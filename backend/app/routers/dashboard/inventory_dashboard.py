from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date

from app.database import get_db
from app.database.models.inventory_management import stock_entry, pending_orders
from app.database.models.processing import (
    RawMaterialPurchasing,
    DeHeading,
    Peeling,
    Production
)
from app.database.models.criteria import packing_styles

router = APIRouter(tags=["INVENTORY DASHBOARD"])


# ============================================================
# INVENTORY DASHBOARD
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
    # 2. RAW MATERIAL COST MAP (Batch + Species)
    # ---------------------------------------------------------
    rm_rows = db.query(
        RawMaterialPurchasing.batch_number,
        RawMaterialPurchasing.species,
        func.coalesce(func.sum(RawMaterialPurchasing.amount), 0)
    ).filter(
        RawMaterialPurchasing.company_id == comp_code
    ).group_by(
        RawMaterialPurchasing.batch_number,
        RawMaterialPurchasing.species
    ).all()

    rm_amt_map = {
        (str(b).strip(), str(s).strip().lower()): float(a or 0)
        for b, s, a in rm_rows
    }

    stock_in_rows = db.query(
        stock_entry.batch_number,
        stock_entry.species,
        func.coalesce(func.sum(stock_entry.quantity), 0)
    ).filter(
        stock_entry.company_id == comp_code,
        stock_entry.cargo_movement_type == "IN"
    ).group_by(
        stock_entry.batch_number,
        stock_entry.species
    ).all()

    stock_qty_map = {
        (str(b).strip(), str(s).strip().lower()): float(q or 0)
        for b, s, q in stock_in_rows
    }

    # ---------------------------------------------------------
    # 3. STOCK QUERY + FILTERS
    # ---------------------------------------------------------
    q = db.query(stock_entry).filter(stock_entry.company_id == comp_code)

    if prod_for != "ALL":
        q = q.filter(stock_entry.production_for == prod_for)
    if prod_at != "ALL":
        q = q.filter(stock_entry.production_at == prod_at)
    if from_date:
        q = q.filter(stock_entry.date >= date.fromisoformat(from_date))
    if to_date:
        q = q.filter(stock_entry.date <= date.fromisoformat(to_date))

    rows = q.all()

    # ---------------------------------------------------------
    # 4. DASHBOARD AGGREGATES
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

        rate = round(rm_amt / in_qty, 2) if in_qty > 0 else float(r.sales_reference_rate or 0)
        value = abs(qty) * rate

        # Overall
        total_qty += qty
        total_value += value * (1 if qty > 0 else -1)

        prod_type = (r.type_of_production or "").upper()

        if prod_type == "PRODUCTION":
            production_qty += qty
            production_val += value
        elif prod_type == "SALES":
            sales_qty += abs(qty)
            sales_val += value
        elif prod_type == "STORE OUT":
            store_out_qty += abs(qty)
            store_out_val += value

        # Grade cards
        g = r.grade or "N/A"
        if g not in grade_cards:
            grade_cards[g] = {
                "avail_qty": 0.0,
                "avail_val": 0.0,
                "sales_qty": 0.0,
                "sales_val": 0.0
            }

        grade_cards[g]["avail_qty"] += qty
        grade_cards[g]["avail_val"] += value * (1 if qty > 0 else -1)

        if prod_type == "SALES":
            grade_cards[g]["sales_qty"] += abs(qty)
            grade_cards[g]["sales_val"] += value

        # Variety pie
        v = r.variety or "N/A"
        variety_chart[v] = variety_chart.get(v, 0) + qty

        # Flow chart
        if r.date:
            dkey = r.date.strftime("%Y-%m-%d")
            flow_chart[dkey] = flow_chart.get(dkey, 0) + qty

    # ---------------------------------------------------------
    # 5. PROCESSING TOTALS
    # ---------------------------------------------------------
    rm_total = db.query(func.coalesce(func.sum(RawMaterialPurchasing.received_qty), 0))\
        .filter(RawMaterialPurchasing.company_id == comp_code).scalar() or 0

    dh_total = db.query(func.coalesce(func.sum(DeHeading.hoso_qty), 0))\
        .filter(DeHeading.company_id == comp_code).scalar() or 0

    peeling_total = db.query(func.coalesce(func.sum(Peeling.peeled_qty), 0))\
        .filter(Peeling.company_id == comp_code).scalar() or 0

    prod_total = db.query(func.coalesce(func.sum(Production.production_qty), 0))\
        .filter(Production.company_id == comp_code).scalar() or 0

    # ---------------------------------------------------------
    # 6. PENDING ORDERS SUMMARY (SAFE)
    # ---------------------------------------------------------
    pending_rows = db.query(pending_orders)\
        .filter(pending_orders.company_id == comp_code).all()

    pack_rows = db.query(packing_styles)\
        .filter(packing_styles.company_id == comp_code).all()

    PACK_WT = {p.packing_style: float(p.mc_weight or 0) for p in pack_rows}

    pending_qty = pending_val = 0.0

    for p in pending_rows:
        mc = float(p.no_of_mc or 0)
        wt = PACK_WT.get(p.packing_style, 0)
        pending_qty += mc * wt
        pending_val += mc * float(p.selling_price or 0) * float(p.exchange_rate or 0)

    # ---------------------------------------------------------
    # 7. RESPONSE
    # ---------------------------------------------------------
    return request.app.state.templates.TemplateResponse(
        "inventory_management/inventory_dashboard.html",
        {
            "request": request,
            "comp_code": comp_code,

            # KPI
            "available_qty": round(total_qty, 2),
            "available_val": round(total_value, 2),
            "production_qty": round(production_qty, 2),
            "production_val": round(production_val, 2),
            "sales_qty": round(sales_qty, 2),
            "sales_val": round(sales_val, 2),
            "store_out_qty": round(store_out_qty, 2),
            "store_out_val": round(store_out_val, 2),
            "reprocess_qty": round(store_out_qty - sales_qty, 2),

            # Pending
            "pending_orders_qty": round(pending_qty, 2),
            "pending_orders_val": round(pending_val, 2),

            # Grade cards
            "grade_cards": grade_cards,

            # Processing
            "rm_total": round(rm_total, 2),
            "dh_total": round(dh_total, 2),
            "peeling_total": round(peeling_total, 2),
            "prod_total": round(prod_total, 2),

            # Charts
            "flow_labels": list(flow_chart.keys()),
            "flow_values": list(flow_chart.values()),
            "variety_labels": list(variety_chart.keys()),
            "variety_values": list(variety_chart.values()),

            # Filters
            "sel_prod_for": prod_for,
            "sel_prod_at": prod_at,
            "from_date": from_date,
            "to_date": to_date
        }
    )
