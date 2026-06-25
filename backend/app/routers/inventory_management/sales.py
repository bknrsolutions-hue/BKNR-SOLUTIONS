from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
import re
from datetime import datetime
from app.utils.timezone import ist_now

# Database and Models
from app.database import get_db
from app.database.models.inventory_management import sales_dispatch, stock_entry
from app.database.models.criteria import packing_styles, production_for
from app.database.models.bills import ContainerLog, PurchaseInvoice
from app.utils.global_filters import get_global_filters

# Router setup
router = APIRouter(prefix="/inventory", tags=["SALES DISPATCH"])
templates = Jinja2Templates(directory="app/templates")

def clean_po(val):
    if not val:
        return ""
    return re.sub(r'[^a-zA-Z0-9]', '', str(val)).lower().strip()

# -------------------------------------------------------------------------
# 1️⃣ SALES REPORT PAGE (WITH PO WISE GROUPING & PRORATED COSTS)
# -------------------------------------------------------------------------
@router.get("/sales_report", response_class=HTMLResponse)
def sales_report(request: Request, db: Session = Depends(get_db)):
    production_for_filter, location = get_global_filters(request)
    
    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/auth/login", status_code=303)

    session_locations = request.session.get("allowed_locations", [])
    if isinstance(session_locations, str):
        user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()]
    else:
        user_allowed_locations = [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]

    prod_names = db.query(production_for).filter(production_for.company_id == company_code).all()
    unique_companies = [c.production_for for c in prod_names if c.production_for]

    # 🟢 FIX: Order by PO Number first, then Invoice Date
    sales_q = db.query(sales_dispatch).filter(sales_dispatch.company_id == company_code)
    if production_for_filter:
        sales_q = sales_q.filter(func.trim(sales_dispatch.company_name) == func.trim(production_for_filter))
    sales_data = sales_q.order_by(sales_dispatch.po_number, sales_dispatch.invoice_date.desc()).all()

    packing_data = db.query(packing_styles).filter(packing_styles.company_id == company_code).all()
    weight_map = {str(p.packing_style).strip(): float(p.mc_weight or 1.0) for p in packing_data}

    # Calculate Total KG per PO (to prorate costs if a PO is split across multiple invoices)
    po_total_kg = {}
    for s in sales_data:
        sale_po = clean_po(s.po_number)
        qty = float(s.no_of_mc or 0) * weight_map.get(str(s.packing_style).strip(), 1.0)
        po_total_kg[sale_po] = po_total_kg.get(sale_po, 0) + qty

    # Stock Map
    stock_q = db.query(stock_entry).filter(stock_entry.company_id == company_code)
    if location:
        stock_q = stock_q.filter(func.trim(stock_entry.production_at) == func.trim(location))
    elif user_allowed_locations:
        stock_q = stock_q.filter(func.upper(func.trim(stock_entry.production_at)).in_(user_allowed_locations))
        
    raw_stock = stock_q.all()
    stock_map = {}
    for row in raw_stock:
        po = clean_po(row.po_number)
        if po:
            val = float(row.inventory_value or 0)
            if val == 0: 
                val = float(row.quantity or 0) * float(row.product_kg_value or 0)
            stock_map[po] = stock_map.get(po, 0) + val

    # Freight & Packing Maps
    freight_rows = db.query(ContainerLog.po_number, ContainerLog.lended_total).filter(
        ContainerLog.company_id == company_code
    ).all()
    freight_map = {
        clean_po(po_number): float(lended_total or 0)
        for po_number, lended_total in freight_rows
        if clean_po(po_number)
    }

    packing_rows = db.query(PurchaseInvoice.po_number, PurchaseInvoice.grand_total).filter(
        PurchaseInvoice.company_id == company_code
    ).all()
    packing_map = {
        clean_po(po_number): float(grand_total or 0)
        for po_number, grand_total in packing_rows
        if clean_po(po_number)
    }

    processed = []
    current_po, sl_no = None, 0

    for s in sales_data:
        # 🟢 FIX: Group SL_NO by PO Number instead of Invoice Number
        if s.po_number != current_po:
            sl_no += 1
            current_po = s.po_number

        qty = float(s.no_of_mc or 0) * weight_map.get(str(s.packing_style).strip(), 1.0)
        usd = qty * float(s.price or 0)
        inr = usd * float(s.exchange_rate or 83.5)
        
        sale_po = clean_po(s.po_number)
        
        # 🟢 FIX: Cost Proration (పలు ఇన్వాయిస్లు ఉంటే ఖర్చులను KGల ఆధారంగా విభజించడం)
        total_qty_for_po = po_total_kg.get(sale_po, 1) or 1
        qty_ratio = qty / total_qty_for_po

        stock_val = stock_map.get(sale_po, 0) * qty_ratio
        f_cost = freight_map.get(sale_po, 0) * qty_ratio
        p_cost = packing_map.get(sale_po, 0) * qty_ratio
        
        pl = inr - (stock_val + f_cost + p_cost)

        s.stock_value, s.freight_cost, s.packing_cost, s.profit_loss = stock_val, f_cost, p_cost, pl

        processed.append({
            "sl_no": sl_no, "obj": s, "total_qty_kg": qty, "total_usd": usd, "total_inr": inr,
            "stock_value": stock_val, "freight_cost": f_cost, "packing_cost": p_cost, "profit_loss": pl
        })

    db.commit()
    return templates.TemplateResponse(
        request=request, 
        name="inventory_management/sales_report.html", 
        context={
            "sales_data": processed, 
            "unique_companies": unique_companies,
            "global_production_for": production_for_filter or "", 
            "global_location": location or ""                     
        }
    )

# -------------------------------------------------------------------------
# 2️⃣ EDITABLE EXCHANGE RATE UPDATE (AJAX)
# -------------------------------------------------------------------------
@router.post("/update_exchange_rate")
async def update_exchange_rate(request: Request, db: Session = Depends(get_db)):
    data = await request.json()
    sale_id = data.get("id")
    new_rate = float(data.get("exchange_rate", 83.50))
    
    sale_item = db.query(sales_dispatch).filter(sales_dispatch.id == sale_id).first()
    if not sale_item:
        return {"status": "error", "message": "Record not found"}
    
    p_style = db.query(packing_styles).filter(
        packing_styles.company_id == sale_item.company_id,
        packing_styles.packing_style == sale_item.packing_style
    ).first()
    mc_weight = float(p_style.mc_weight or 1.0) if p_style else 1.0
    
    sale_item.exchange_rate = new_rate
    qty_kg = float(sale_item.no_of_mc or 0) * mc_weight
    total_inr = (qty_kg * float(sale_item.price or 0)) * new_rate
    sale_item.profit_loss = total_inr - (float(sale_item.stock_value or 0) + 
                                         float(sale_item.freight_cost or 0) + 
                                         float(sale_item.packing_cost or 0))
    
    db.commit()
    return {
        "status": "success", 
        "new_inr": round(total_inr, 2), 
        "new_pl": round(sale_item.profit_loss, 2)
    }

# -------------------------------------------------------------------------
# 3️⃣ STATUS UPDATE ROUTES (AJAX)
# -------------------------------------------------------------------------
@router.post("/update_status")
async def update_status(request: Request, db: Session = Depends(get_db)):
    data = await request.json()
    sale_id = data.get("id")
    new_status = data.get("status")
    
    sale_item = db.query(sales_dispatch).filter(sales_dispatch.id == sale_id).first()
    if not sale_item:
        return {"status": "error", "message": "Record not found"}
    
    sale_item.status = new_status
    db.commit()
    return {"status": "success"}
