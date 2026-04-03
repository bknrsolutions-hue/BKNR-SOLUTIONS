# app/routers/inventory/sales_orders.py

from fastapi import APIRouter, Request, Depends, Form, HTTPException, Query
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import datetime
from collections import defaultdict
from pydantic import BaseModel
from typing import List
import re
import logging

from app.database import get_db
from app.database.models.inventory_management import pending_orders, sales_dispatch 
from app.database.models.criteria import (
    buyers, buyer_agents, brands, countries,
    varieties, grades, glazes, packing_styles, freezers, species
)

router = APIRouter(prefix="/inventory", tags=["PENDING ORDERS & SALES"])
templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)

class StatusUpdate(BaseModel):
    po_number: str
    status: str

# Helper for automation
def calculate_pieces(grade_str: str, manual_pcs: str):
    try:
        if manual_pcs and str(manual_pcs).strip() and int(manual_pcs) > 0:
            return int(manual_pcs)
        nums = re.findall(r'\d+', str(grade_str))
        if nums:
            last_num = int(nums[-1])
            return round(last_num * 2.2)
    except: pass
    return 0

# -------------------------------------------------------------------------
# 1️⃣ PENDING ORDERS PAGE
# -------------------------------------------------------------------------
@router.get("/pending_orders", response_class=HTMLResponse)
def pending_orders_page(request: Request, edit: str | None = None, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code or not email:
        return RedirectResponse("/auth/login", status_code=302)

    # Grouping logic
    rows = db.query(pending_orders).filter(pending_orders.company_id == comp_code).order_by(pending_orders.sl_no).all()
    po_groups = defaultdict(list)
    for r in rows: po_groups[r.po_number].append(r)

    edit_rows = []
    if edit:
        edit_rows = db.query(pending_orders).filter(
            pending_orders.company_id == comp_code, 
            pending_orders.po_number == edit
        ).all()

    max_sl = db.query(func.max(pending_orders.sl_no)).filter(pending_orders.company_id == comp_code).scalar() or 0
    next_sl = edit_rows[0].sl_no if edit_rows else max_sl + 1

    def get_lookup(model, field_name):
        return [getattr(x, field_name) for x in db.query(model).filter(model.company_id == comp_code).all()]

    return templates.TemplateResponse(
        request=request,
        name="inventory_management/pending_orders.html",
        context={
            "po_groups": po_groups, 
            "edit_rows": edit_rows,
            "next_sl": next_sl,
            "buyers": get_lookup(buyers, "buyer_name"),
            "agents": get_lookup(buyer_agents, "agent_name"),
            "brands": get_lookup(brands, "brand_name"),
            "countries": get_lookup(countries, "country_name"),
            "species": get_lookup(species, "species_name"),
            "varieties": get_lookup(varieties, "variety_name"),
            "grades": get_lookup(grades, "grade_name"),
            "glazes": get_lookup(glazes, "glaze_name"),
            "freezers": get_lookup(freezers, "freezer_name"),
            "packing": db.query(packing_styles).filter(packing_styles.company_id == comp_code).all(),
            "message": request.session.pop("message", None),
            "email": email, "comp_code": comp_code
        }
    )

# -------------------------------------------------------------------------
# 2️⃣ MOVE TO SALES (Secure Transfer)
# -------------------------------------------------------------------------
@router.post("/move_to_sales")
def move_to_sales(
    request: Request,
    po_number: str = Form(...),
    invoice_no: str = Form(...),
    invoice_date: str = Form(...),
    shipping_bill: str = Form(None),
    container_no: str = Form(None),
    db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")
    items = db.query(pending_orders).filter(pending_orders.company_id == comp_code, pending_orders.po_number == po_number).all()

    if not items:
        raise HTTPException(status_code=404, detail="PO Not Found")

    try:
        for item in items:
            new_sale = sales_dispatch(
                company_id=comp_code,
                invoice_no=invoice_no.strip().upper(),
                invoice_date=invoice_date,
                shipping_bill=shipping_bill.upper() if shipping_bill else None,
                container_no=container_no.upper() if container_no else None,
                buyer_name=item.buyer,
                brand=item.brand,
                country=item.country,
                count_glaze=item.count_glaze,
                weight_glaze=item.weight_glaze,
                packing_style=item.packing_style,
                no_of_mc=item.no_of_mc,
                price=item.selling_price,
                variety=item.variety,  
                grade=item.grade      
            )
            db.add(new_sale)
        
        # Cleanup Pending
        db.query(pending_orders).filter(pending_orders.company_id == comp_code, pending_orders.po_number == po_number).delete()
        db.commit()
        request.session["message"] = f"PO {po_number} moved to Sales Report Successfully!"
    except Exception as e:
        db.rollback()
        logger.error(f"Sales Dispatch Error: {e}")
        request.session["message"] = f"Error: {str(e)}"

    return RedirectResponse("/inventory/pending_orders", status_code=303)

# -------------------------------------------------------------------------
# 3️⃣ SALES REPORT (Calculated Values)
# -------------------------------------------------------------------------
@router.get("/sales_report", response_class=HTMLResponse)
def sales_report_page(request: Request, company: str = Query("all"), db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code:
        return RedirectResponse("/auth/login", status_code=302)

    # Master Packing Map for Calculations
    packing_data = db.query(packing_styles).filter(packing_styles.company_id == comp_code).all()
    weight_map = {p.packing_style: float(p.mc_weight or 1.0) for p in packing_data}

    # Query Filter logic
    target_comp = comp_code if company == "all" else company
    sales_raw = db.query(sales_dispatch).filter(sales_dispatch.company_id == target_comp).order_by(desc(sales_dispatch.invoice_date)).all()

    processed_sales = []
    current_inv = None
    sl_counter = 0

    for s in sales_raw:
        if s.invoice_no != current_inv:
            sl_counter += 1
            current_inv = s.invoice_no
        
        mc_w = weight_map.get(s.packing_style, 1.0)
        q_kg = float(s.no_of_mc or 0) * mc_w
        t_usd = q_kg * float(s.price or 0)
        
        processed_sales.append({
            "sl_no": sl_counter,
            "obj": s,
            "total_qty_kg": round(q_kg, 2),
            "total_usd": round(t_usd, 2),
            "total_inr": round(t_usd * 83.5, 2) # Example Fixed rate
        })

    return templates.TemplateResponse(
        request=request,
        name="inventory_management/sales_report.html", 
        context={
            "sales_data": processed_sales,
            "selected_company": company,
            "message": request.session.pop("message", None),
            "email": request.session.get("email")
        }
    )