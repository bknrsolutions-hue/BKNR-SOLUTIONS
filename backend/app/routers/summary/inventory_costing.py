from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date
import re

from app.database import get_db
from app.database.models.inventory_management import stock_entry
from app.database.models.processing import RawMaterialPurchasing
from app.database.models.users import Company
from app.database.models.criteria import varieties, HOSO_HLSO_Yields

router = APIRouter(prefix="/summary", tags=["INVENTORY COSTING"])

@router.get("/inventory_costing", response_class=HTMLResponse)
def inventory_costing_page(
    request: Request,
    db: Session = Depends(get_db),
    from_date: str = "",
    to_date: str = ""
):
    # 🔹 1. SESSION NUNDI COMPANY CODE TEESUKUNTUNNAM
    comp_code = request.session.get("company_code")
    if not comp_code:
        return RedirectResponse("/auth/login", status_code=302)

    # 🔹 2. STOCK DATA (STRICTLY FILTERED BY COMPANY)
    q = db.query(stock_entry).filter(stock_entry.company_id == comp_code)
    if from_date: q = q.filter(stock_entry.date >= date.fromisoformat(from_date))
    if to_date: q = q.filter(stock_entry.date <= date.fromisoformat(to_date))
    rows = q.order_by(stock_entry.date.desc()).all()

    # 🔹 3. RM TOTAL AMOUNT (ONLY FOR THIS COMPANY)
    rm_totals = db.query(
        RawMaterialPurchasing.batch_number,
        RawMaterialPurchasing.species,
        func.sum(RawMaterialPurchasing.amount).label("total_rm_amount")
    ).filter(RawMaterialPurchasing.company_id == comp_code).group_by(
        RawMaterialPurchasing.batch_number, RawMaterialPurchasing.species
    ).all()

    rm_amt_map = {
        (str(r.batch_number).strip(), str(r.species).strip().lower()): float(r.total_rm_amount or 0)
        for r in rm_totals
    }

    # 🔹 4. STOCK IN TOTAL QTY (ONLY FOR THIS COMPANY)
    stock_sums = db.query(
        stock_entry.batch_number,
        stock_entry.species,
        func.sum(stock_entry.quantity).label("sum_qty")
    ).filter(
        stock_entry.company_id == comp_code,
        stock_entry.cargo_movement_type == "IN"
    ).group_by(
        stock_entry.batch_number, stock_entry.species
    ).all()

    stock_qty_map = {
        (str(s.batch_number).strip(), str(s.species).strip().lower()): float(s.sum_qty or 0)
        for s in stock_sums
    }

    # Yields for costing logic
    yield_records = db.query(HOSO_HLSO_Yields).filter(HOSO_HLSO_Yields.company_id == comp_code).all()
    v_records = db.query(varieties).filter(varieties.company_id == comp_code).all()

    # 🔹 5. COSTING CALCULATIONS
    for r in rows:
        b_key, s_key = str(r.batch_number).strip(), str(r.species or "").strip().lower()
        lookup = (b_key, s_key)

        # Formula: Total RM Amount / Total Stock In Qty
        total_amt = rm_amt_map.get(lookup, 0)
        total_qty = stock_qty_map.get(lookup, 0)

        r.product_kg_value = round(total_amt / total_qty, 2) if total_qty > 0 else (r.sales_reference_rate or 0)
        r.inventory_value = round((r.quantity or 0) * r.product_kg_value, 2)

        # Yield normalization (Shortened for brevity)
        p_var = str(r.variety or "").strip().lower()
        v_data = next((v for v in v_records if str(v.variety_name).strip().lower() == p_var), None)
        peeling_y = float(v_data.peeling_yield or 100) / 100 if v_data else 1.0
        soaking_y = float(v_data.soaking_yield or 100) / 100 if v_data else 1.0
        
        try: net_count_calc = (float(r.quantity or 0) / (peeling_y * soaking_y))
        except: net_count_calc = 0
        r.hoso_count = round(net_count_calc, 2) # Simplify for now

    return request.app.state.templates.TemplateResponse(
        "inventory_management/inventory_costing.html",
        {"request": request, "rows": rows, "comp_code": comp_code}
    )