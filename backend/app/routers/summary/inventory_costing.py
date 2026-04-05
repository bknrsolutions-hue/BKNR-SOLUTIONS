# ============================================================
# INVENTORY COSTING & YIELD NORMALIZATION ROUTER
# ============================================================

from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date

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
    # 🔐 SESSION SECURITY CHECK
    comp_code = request.session.get("company_code")
    if not comp_code:
        return RedirectResponse("/auth/login", status_code=302)

    # 🔹 1. FETCH STOCK DATA (STRICTLY FOR THIS COMPANY)
    q = db.query(stock_entry).filter(stock_entry.company_id == comp_code)
    
    if from_date: 
        try: q = q.filter(stock_entry.date >= date.fromisoformat(from_date))
        except: pass
    if to_date: 
        try: q = q.filter(stock_entry.date <= date.fromisoformat(to_date))
        except: pass
        
    rows = q.order_by(stock_entry.date.desc()).all()

    # 🔹 2. RM TOTAL AMOUNT CALCULATION (BATCH & SPECIES WISE)
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

    # 🔹 3. STOCK IN QTY AGGREGATION
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

    # Yields & Varieties Master Lookup
    v_records = {str(v.variety_name).strip().lower(): v for v in db.query(varieties).filter(varieties.company_id == comp_code).all()}

    # 🔹 4. CORE COSTING & YIELD LOGIC
    for r in rows:
        b_key = str(r.batch_number).strip()
        s_key = str(r.species or "").strip().lower()
        lookup = (b_key, s_key)

        # 💡 COSTING FORMULA: (Total RM Purchase Amount / Total Stock Received Qty)
        total_amt = rm_amt_map.get(lookup, 0)
        total_qty = stock_qty_map.get(lookup, 0)

        # Cost per KG calculation
        r.product_kg_value = round(total_amt / total_qty, 2) if total_qty > 0 else (r.sales_reference_rate or 0)
        r.inventory_value = round((float(r.quantity or 0)) * r.product_kg_value, 2)

        # 💡 YIELD NORMALIZATION (HOSO EQUIVALENT)
        p_var = str(r.variety or "").strip().lower()
        v_master = v_records.get(p_var)
        
        # Taking yields from Master, defaulting to 100% (1.0)
        peeling_y = float(v_master.peeling_yield or 100) / 100 if v_master else 1.0
        soaking_y = float(v_master.soaking_yield or 100) / 100 if v_master else 1.0
        
        # Recalculating weight back to raw material level (HOSO)
        try:
            # Formula: Current Qty / (Peeling Yield % * Soaking Yield %)
            r.hoso_equivalent_weight = round(float(r.quantity or 0) / (peeling_y * soaking_y), 2)
        except ZeroDivisionError:
            r.hoso_equivalent_weight = r.quantity

    # ✅ FIXED TEMPLATE RESPONSE: Added request=request to avoid TypeError
    return request.app.state.templates.TemplateResponse(
        request=request,
        name="inventory_management/inventory_costing.html",
        context={
            "rows": rows, 
            "from_date": from_date,
            "to_date": to_date
        }
    )