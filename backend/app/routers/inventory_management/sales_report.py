from fastapi import APIRouter, Request, Depends, Form, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from collections import defaultdict
from pydantic import BaseModel
from typing import List, Optional
import re
import json

# Database and Models
from app.database import get_db
from app.database.models.inventory_management import pending_orders, sales_dispatch, stock_entry
from app.database.models.users import Company
from app.database.models.criteria import (
    buyers, buyer_agents, brands, countries,
    varieties, grades, glazes, packing_styles, freezers, species, 
    production_for
)
from app.database.models.bills import ContainerLog, PurchaseInvoice

router = APIRouter(tags=["SALES REPORT & PENDING ORDERS"])
templates = Jinja2Templates(directory="app/templates")

# -----------------------------------
# HELPER FUNCTIONS
# -----------------------------------
def clean_po(val):
    if not val:
        return ""
    return re.sub(r'[^a-zA-Z0-9]', '', str(val)).lower().strip()

def calculate_pieces(grade_str, manual_pcs):
    try:
        if manual_pcs and str(manual_pcs).strip() and int(manual_pcs) > 0:
            return int(manual_pcs)
        nums = re.findall(r'\d+', str(grade_str))
        if nums:
            last_num = int(nums[-1])
            return round(last_num * 2.2)
    except:
        pass
    return 0

# -------------------------------------------------------------------------
# 1️⃣ PENDING ORDERS PAGE
# -------------------------------------------------------------------------
@router.get("/pending_orders", response_class=HTMLResponse)
def pending_orders_page(request: Request, edit: str | None = None, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    email = request.session.get("email")
    if not company_code or not email:
        return RedirectResponse("/auth/login", status_code=303)

    prod_names = db.query(production_for.production_for).filter(
        production_for.company_id == company_code,
        production_for.production_for != None
    ).distinct().all()

    unique_companies = [c[0] for c in prod_names if c[0]]

    rows = db.query(pending_orders).filter(
        pending_orders.company_id == company_code
    ).order_by(pending_orders.sl_no, pending_orders.id).all()

    po_groups = defaultdict(list)
    for r in rows:
        po_groups[r.po_number].append(r)

    edit_rows = []
    if edit:
        edit_rows = db.query(pending_orders).filter(
            pending_orders.company_id == company_code, 
            pending_orders.po_number == edit
        ).all()

    max_sl = db.query(func.max(pending_orders.sl_no)).filter(
        pending_orders.company_id == company_code
    ).scalar()

    next_sl = (max_sl or 0) + 1
    if edit_rows:
        next_sl = edit_rows[0].sl_no

    def get_lookup(model, field_name):
        return [getattr(x, field_name) for x in db.query(model).filter(model.company_id == company_code).all()]

    return templates.TemplateResponse(
        request=request,
        name="inventory_management/pending_orders.html",
        context={
            "po_groups": po_groups,
            "edit_rows": edit_rows,
            "next_sl": next_sl,
            "unique_companies": unique_companies,
            "buyers": get_lookup(buyers, "buyer_name"),
            "agents": get_lookup(buyer_agents, "agent_name"),
            "brands": get_lookup(brands, "brand_name"),
            "countries": get_lookup(countries, "country_name"),
            "species": get_lookup(species, "species_name"),
            "varieties": get_lookup(varieties, "variety_name"),
            "grades": get_lookup(grades, "grade_name"),
            "glazes": get_lookup(glazes, "glaze_name"),
            "freezers": get_lookup(freezers, "freezer_name"),
            "packing": db.query(packing_styles).filter(packing_styles.company_id == company_code).all(),
            "message": request.session.pop("message", None)
        }
    )

# -------------------------------------------------------------------------
# 2️⃣ SAVE PENDING ORDERS
# -------------------------------------------------------------------------
@router.post("/pending_orders")
def save_pending_orders(
    request: Request,
    sl_no: int = Form(...),
    company_name: str = Form(...),
    po_number: str = Form(...),
    buyer: str = Form(...),
    agent: str = Form(...),
    country: str = Form(...),
    shipment_date: str = Form(...),
    brand: List[str] = Form(...),
    packing_style: List[str] = Form(...),
    freezer: List[str] = Form(...),
    count_glaze: List[str] = Form(...),
    weight_glaze: List[str] = Form(...),
    species: List[str] = Form(...),
    variety: List[str] = Form(...),
    grade: List[str] = Form(...),
    no_of_pieces: List[str] = Form(...),
    no_of_mc: List[int] = Form(...),
    selling_price: List[float] = Form(...),
    exchange_rate: List[float] = Form(...),
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")
    email = request.session.get("email")

    db.query(pending_orders).filter(
        pending_orders.company_id == company_code,
        pending_orders.po_number == po_number
    ).delete()

    for i in range(len(brand)):
        db.add(pending_orders(
            sl_no=sl_no,
            company_name=company_name,
            po_number=po_number,
            buyer=buyer,
            agent_name=agent,
            country=country,
            shipment_date=shipment_date,
            brand=brand[i],
            packing_style=packing_style[i],
            freezer=freezer[i],
            count_glaze=count_glaze[i],
            weight_glaze=weight_glaze[i],
            species=species[i],
            variety=variety[i],
            grade=grade[i],
            no_of_pieces=calculate_pieces(grade[i], no_of_pieces[i]),
            no_of_mc=no_of_mc[i],
            selling_price=selling_price[i],
            exchange_rate=exchange_rate[i],
            company_id=company_code,
            email=email,
            date=datetime.now().strftime("%Y-%m-%d"),
            progress_steps="pending"
        ))

    db.commit()
    return RedirectResponse("/inventory/pending_orders", status_code=303)

# -------------------------------------------------------------------------
# 3️⃣ MOVE TO SALES (TRANSFER WITH EXCHANGE RATE)
# -------------------------------------------------------------------------
@router.post("/move_to_sales")
def move_to_sales(
    request: Request,
    po_number: str = Form(...),
    invoice_no: str = Form(...),
    invoice_date: str = Form(...),
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")

    items = db.query(pending_orders).filter(
        pending_orders.company_id == company_code,
        pending_orders.po_number == po_number
    ).all()

    for item in items:
        db.add(sales_dispatch(
            company_id=company_code,
            invoice_no=invoice_no,
            invoice_date=invoice_date,
            po_number=item.po_number,
            buyer_name=item.buyer,
            brand=item.brand,
            country=item.country,
            count_glaze=item.count_glaze,
            weight_glaze=item.weight_glaze,
            packing_style=item.packing_style,
            no_of_mc=item.no_of_mc,
            price=item.selling_price,
            variety=item.variety,
            grade=item.grade,
            company_name=item.company_name,
            exchange_rate=item.exchange_rate, # Exchange Rate transferred here
            status="Unpaid",
            created_at=datetime.now().date()
        ))

    db.query(pending_orders).filter(
        pending_orders.company_id == company_code,
        pending_orders.po_number == po_number
    ).delete()

    db.commit()
    return RedirectResponse("/inventory/pending_orders", status_code=303)

# -------------------------------------------------------------------------
# 4️⃣ SALES REPORT PAGE (DYNAMIC CALCULATIONS)
# -------------------------------------------------------------------------
@router.get("/sales_report", response_class=HTMLResponse)
def sales_report(request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/auth/login", status_code=303)

    prod_names = db.query(production_for).filter(production_for.company_id == company_code).all()
    unique_companies = [c.production_for for c in prod_names if c.production_for]

    sales_data = db.query(sales_dispatch).filter(sales_dispatch.company_id == company_code).order_by(
        sales_dispatch.invoice_date.desc(), sales_dispatch.invoice_no
    ).all()

    packing_data = db.query(packing_styles).filter(packing_styles.company_id == company_code).all()
    weight_map = {str(p.packing_style).strip(): float(p.mc_weight or 1.0) for p in packing_data}

    # Load Stocks, Freight, and Packing costs into maps
    raw_stock = db.query(stock_entry).filter(stock_entry.company_id == company_code).all()
    stock_map = {}
    for row in raw_stock:
        po = clean_po(row.po_number)
        if po:
            val = float(row.inventory_value or 0)
            if val == 0: val = float(row.quantity or 0) * float(row.product_kg_value or 0)
            stock_map[po] = stock_map.get(po, 0) + val

    freight_map = {clean_po(c.po_number): float(c.lended_total or 0) for c in db.query(ContainerLog).filter(ContainerLog.company_id == company_code).all() if clean_po(c.po_number)}
    packing_map = {clean_po(p.po_number): float(p.grand_total or 0) for p in db.query(PurchaseInvoice).filter(PurchaseInvoice.company_id == company_code).all() if clean_po(p.po_number)}

    processed = []
    current_invoice, sl_no = None, 0

    for s in sales_data:
        if s.invoice_no != current_invoice:
            sl_no += 1
            current_invoice = s.invoice_no

        qty = float(s.no_of_mc or 0) * weight_map.get(str(s.packing_style).strip(), 1.0)
        usd = qty * float(s.price or 0)
        inr = usd * float(s.exchange_rate or 83.5)
        
        sale_po = clean_po(s.po_number)
        stock_val = stock_map.get(sale_po, 0)
        f_cost = freight_map.get(sale_po, 0)
        p_cost = packing_map.get(sale_po, 0)
        pl = inr - (stock_val + f_cost + p_cost)

        # Update DB fields
        s.stock_value, s.freight_cost, s.packing_cost, s.profit_loss = stock_val, f_cost, p_cost, pl

        processed.append({
            "sl_no": sl_no, "obj": s, "total_qty_kg": qty, "total_usd": usd, "total_inr": inr,
            "stock_value": stock_val, "freight_cost": f_cost, "packing_cost": p_cost, "profit_loss": pl
        })

    db.commit()
    return templates.TemplateResponse("inventory_management/sales_report.html", {
        "request": request, "sales_data": processed, "unique_companies": unique_companies
    })

# -------------------------------------------------------------------------
# 5️⃣ EDITABLE EXCHANGE RATE UPDATE (AJAX)
# -------------------------------------------------------------------------
@router.post("/update_exchange_rate")
async def update_exchange_rate(request: Request, db: Session = Depends(get_db)):
    data = await request.json()
    sale_id = data.get("id")
    new_rate = float(data.get("exchange_rate", 83.50))
    
    sale_item = db.query(sales_dispatch).filter(sales_dispatch.id == sale_id).first()
    if not sale_item:
        return {"status": "error", "message": "Record not found"}
    
    # Get MC Weight for re-calc
    p_style = db.query(packing_styles).filter(
        packing_styles.company_id == sale_item.company_id,
        packing_styles.packing_style == sale_item.packing_style
    ).first()
    mc_weight = float(p_style.mc_weight or 1.0) if p_style else 1.0
    
    # Re-calculate
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
# 6️⃣ STATUS UPDATE ROUTE (AJAX)
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