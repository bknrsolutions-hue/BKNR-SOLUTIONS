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
from app.database.models.inventory_management import pending_orders, sales_dispatch 
from app.database.models.users import Company
from app.database.models.criteria import (
    buyers, buyer_agents, brands, countries,
    varieties, grades, glazes, packing_styles, freezers, species, 
    production_for
)

router = APIRouter(prefix="/inventory", tags=["PENDING ORDERS & SALES"])
templates = Jinja2Templates(directory="app/templates")

class StatusUpdate(BaseModel):
    po_number: str
    status: str
    invoice_no: Optional[str] = None

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

    # Delete existing PO items to avoid duplicates on update
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
# 3️⃣ MOVE TO SALES (SALES DISPATCH)
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

    # Fetch items from Pending Orders
    items = db.query(pending_orders).filter(
        pending_orders.company_id == company_code,
        pending_orders.po_number == po_number
    ).all()

    if not items:
        raise HTTPException(status_code=404, detail="PO Number not found")

    for item in items:
        # Transfer data from Pending Orders to Sales Dispatch
        # All extra columns from your model are included here
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
            exchange_rate=item.exchange_rate, # Saving exchange rate as requested
            shipping_bill=None,  # Manual input later in report
            container_no=None,   # Manual input later in report
            stock_value=0.0,     # Calculation or manual update
            profit_loss=0.0,     # Calculation or manual update
            freight_cost=0.0,    # Manual input
            packing_cost=0.0,    # Manual input
            status="Unpaid",     # Default status
            created_at=datetime.now().date()
        ))

    # After moving to sales, delete from pending orders
    db.query(pending_orders).filter(
        pending_orders.company_id == company_code,
        pending_orders.po_number == po_number
    ).delete()

    db.commit()
    return RedirectResponse("/inventory/pending_orders", status_code=303)