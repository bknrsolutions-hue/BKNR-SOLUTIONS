from fastapi import APIRouter, Request, Depends, Form, HTTPException, Query
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
from app.database.models.inventory_management import pending_orders, sales_dispatch 
from app.database.models.users import Company
from app.database.models.criteria import (
    buyers, buyer_agents, brands, countries,
    varieties, grades, glazes, packing_styles, freezers, species,
)

router = APIRouter(prefix="/inventory", tags=["PENDING ORDERS & SALES"])
templates = Jinja2Templates(directory="app/templates")

class StatusUpdate(BaseModel):
    po_number: str
    status: str

def calculate_pieces(grade_str, manual_pcs):
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
    company_code = request.session.get("company_code")
    email = request.session.get("email")
    if not company_code or not email:
        return RedirectResponse("/auth/login", status_code=303)

    rows = db.query(pending_orders).filter(pending_orders.company_id == company_code).order_by(pending_orders.sl_no, pending_orders.id).all()
    po_groups = defaultdict(list)
    for r in rows: po_groups[r.po_number].append(r)

    edit_rows = []
    if edit:
        edit_rows = db.query(pending_orders).filter(
            pending_orders.company_id == company_code, 
            pending_orders.po_number == edit
        ).all()

    max_sl = db.query(func.max(pending_orders.sl_no)).filter(pending_orders.company_id == company_code).scalar()
    next_sl = (max_sl or 0) + 1
    if edit_rows:
        next_sl = edit_rows[0].sl_no

    def get_lookup(model, field_name):
        return [getattr(x, field_name) for x in db.query(model).filter(model.company_id == company_code).all()]

    # ✅ FIXED: TemplateResponse for new FastAPI versions
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
    company_name = request.session.get("company_name")
    email = request.session.get("email")
    
    existing_status = db.query(pending_orders.progress_steps).filter(
        pending_orders.company_id == company_code, 
        pending_orders.po_number == po_number
    ).first()
    status = existing_status[0] if existing_status else "pending"

    db.query(pending_orders).filter(pending_orders.company_id == company_code, pending_orders.po_number == po_number).delete()
    
    for i in range(len(brand)):
        new_row = pending_orders(
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
            progress_steps=status
        )
        db.add(new_row)
    
    db.commit()
    request.session["message"] = f"PO {po_number} Updated Successfully!"
    return RedirectResponse("/inventory/pending_orders", status_code=303)

# -------------------------------------------------------------------------
# 3️⃣ MOVE TO SALES
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
    company_code = request.session.get("company_code")
    items = db.query(pending_orders).filter(pending_orders.company_id == company_code, pending_orders.po_number == po_number).all()

    if not items:
        raise HTTPException(status_code=404, detail="PO Not Found")

    try:
        for item in items:
            new_sale = sales_dispatch(
                company_id=company_code,
                invoice_no=invoice_no,
                invoice_date=invoice_date,
                shipping_bill=shipping_bill,
                container_no=container_no,
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
        
        db.query(pending_orders).filter(pending_orders.company_id == company_code, pending_orders.po_number == po_number).delete()
        db.commit()
        request.session["message"] = f"PO {po_number} moved to Sales Report!"
    except Exception as e:
        db.rollback()
        request.session["message"] = f"Error: {str(e)}"

    return RedirectResponse("/inventory/pending_orders", status_code=303)

# -------------------------------------------------------------------------
# 4️⃣ SALES REPORT (With Company Filter & Calculations)
# -------------------------------------------------------------------------
@router.get("/sales_report", response_class=HTMLResponse)
def sales_report_page(request: Request, company: str = Query("all"), db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/auth/login", status_code=303)

    query = db.query(sales_dispatch)
    
    # [2026-01-03] Company wise data filter logic
    if company != "all":
        query = query.filter(sales_dispatch.company_id == company)
    else:
        query = query.filter(sales_dispatch.company_id == company_code)

    sales_raw = query.order_by(sales_dispatch.invoice_date.desc(), sales_dispatch.invoice_no).all()

    packing_data = db.query(packing_styles).filter(packing_styles.company_id == company_code).all()
    weight_map = {p.packing_style: float(p.mc_weight or 1.0) for p in packing_data}

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
        ex_r = 83.5 
        
        processed_sales.append({
            "sl_no": sl_counter,
            "obj": s,
            "variety": s.variety if s.variety else "",
            "grade": s.grade if s.grade else "",
            "mc_weight": mc_w,
            "total_qty_kg": q_kg,
            "total_usd": t_usd,
            "total_inr": t_usd * ex_r
        })

    return templates.TemplateResponse(
        request=request,
        name="inventory_management/sales_report.html",
        context={
            "sales_data": processed_sales,
            "selected_company": company,
            "message": request.session.pop("message", None)
        }
    )

# -------------------------------------------------------------------------
# 5️⃣ REVERT & DELETE HELPERS
# -------------------------------------------------------------------------
@router.post("/delete_sales_invoice/{invoice_no}")
def delete_sales_invoice(invoice_no: str, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    db.query(sales_dispatch).filter(
        sales_dispatch.company_id == company_code, 
        sales_dispatch.invoice_no == invoice_no
    ).delete()
    db.commit()
    request.session["message"] = f"Invoice {invoice_no} Deleted Successfully"
    return RedirectResponse("/inventory/sales_report", status_code=303)

@router.post("/revert_to_pending/{id}")
def revert_to_pending(id: int, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    email = request.session.get("email")
    
    sale = db.query(sales_dispatch).filter(sales_dispatch.id == id, sales_dispatch.company_id == company_code).first()
    if not sale:
        return RedirectResponse("/inventory/sales_report", status_code=303)

    new_pending = pending_orders(
        sl_no=1,
        company_name=sale.buyer_name,
        po_number=f"REV-{sale.invoice_no}",
        buyer=sale.buyer_name,
        brand=sale.brand,
        country=sale.country,
        variety=sale.variety,
        grade=sale.grade,
        packing_style=sale.packing_style,
        no_of_mc=sale.no_of_mc,
        selling_price=sale.price,
        company_id=company_code,
        email=email,
        date=datetime.now().strftime("%Y-%m-%d"),
        progress_steps="pending"
    )
    db.add(new_pending)
    db.delete(sale)
    db.commit()
    return RedirectResponse("/inventory/sales_report", status_code=303)

@router.post("/pending_orders/delete_po/{po}")
def delete_po(po: str, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    db.query(pending_orders).filter(pending_orders.company_id == company_code, pending_orders.po_number == po).delete()
    db.commit()
    return RedirectResponse("/inventory/pending_orders", status_code=303)

@router.post("/update_po_status")
async def update_po_status(data: StatusUpdate, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    db.query(pending_orders).filter(pending_orders.company_id == company_code, pending_orders.po_number == data.po_number).update({"progress_steps": data.status})
    db.commit()
    return {"success": True}