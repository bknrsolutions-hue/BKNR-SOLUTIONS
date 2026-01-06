from fastapi import APIRouter, Request, Depends, Form, HTTPException, Query
from fastapi.responses import RedirectResponse, HTMLResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from collections import defaultdict
from pydantic import BaseModel
import io
import re

# PDF & EXCEL libraries
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from openpyxl import Workbook

from app.database import get_db
# sales_dispatch model ni import chesukondi
from app.database.models.inventory_management import pending_orders, sales_dispatch 
from app.database.models.criteria import (
    buyers, buyer_agents, brands, countries,
    varieties, grades, glazes, packing_styles, freezers, species
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
# 1️⃣ PENDING ORDERS PAGE (Existing)
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

    # Next SL calculation
    max_sl = db.query(func.max(pending_orders.sl_no)).filter(pending_orders.company_id == company_code).scalar()
    next_sl = (max_sl or 0) + 1

    return templates.TemplateResponse("inventory_management/pending_orders.html", {
        "request": request, "po_groups": po_groups, "next_sl": next_sl,
        "buyers": [x.buyer_name for x in db.query(buyers).filter(buyers.company_id == company_code)],
        "brands": [x.brand_name for x in db.query(brands).filter(brands.company_id == company_code)],
        "countries": [x.country_name for x in db.query(countries).filter(countries.company_id == company_code)],
        "species": [x.species_name for x in db.query(species).filter(species.company_id == company_code)],
        "varieties": [x.variety_name for x in db.query(varieties).filter(varieties.company_id == company_code)],
        "grades": [x.grade_name for x in db.query(grades).filter(grades.company_id == company_code)],
        "glazes": [x.glaze_name for x in db.query(glazes).filter(glazes.company_id == company_code)],
        "packing": db.query(packing_styles).filter(packing_styles.company_id == company_code).all(),
        "freezers": [x.freezer_name for x in db.query(freezers).filter(freezers.company_id == company_code)],
        "message": request.session.pop("message", None)
    })

# -------------------------------------------------------------------------
# 2️⃣ MOVE TO SALES (The Logic to avoid 404)
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
    
    # Pending data ni fetch cheyadam
    items = db.query(pending_orders).filter(
        pending_orders.company_id == company_code, 
        pending_orders.po_number == po_number
    ).all()

    if not items:
        raise HTTPException(status_code=404, detail="PO Not Found")

    try:
        for item in items:
            # Sales Table ki move chesthunnam (12 Columns)
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
                price=item.selling_price
            )
            db.add(new_sale)
        
        # Pending nundi delete chestunnam
        db.query(pending_orders).filter(pending_orders.po_number == po_number).delete()
        db.commit()
        request.session["message"] = f"PO {po_number} moved to Sales Report Successfully!"
    except Exception as e:
        db.rollback()
        request.session["message"] = f"Error: {str(e)}"

    return RedirectResponse("/inventory/pending_orders", status_code=303)

# -------------------------------------------------------------------------
# 3️⃣ SALES REPORT PAGE (Company Filter logic)
# -------------------------------------------------------------------------
@router.get("/sales_report", response_class=HTMLResponse)
def sales_report_page(
    request: Request, 
    company: str = Query("all"), 
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/auth/login", status_code=303)

    # Base query
    query = db.query(sales_dispatch)

    # Company Filter (Mee saved info requirement)
    if company != "all":
        query = query.filter(sales_dispatch.company_id == company)
    else:
        query = query.filter(sales_dispatch.company_id == company_code)

    sales_data = query.order_by(sales_dispatch.invoice_date.desc()).all()

    return templates.TemplateResponse("inventory_management/sales_report.html", {
        "request": request,
        "sales_data": sales_data,
        "selected_company": company
    })

# -------------------------------------------------------------------------
# Existing Helper Routes (Update Status, Save PO, Delete, Export)
# -------------------------------------------------------------------------

@router.post("/update_po_status")
async def update_po_status(data: StatusUpdate, request: Request, db: Session = Depends(get_db)):
    db.query(pending_orders).filter(pending_orders.po_number == data.po_number).update({"progress_steps": data.status})
    db.commit()
    return {"success": True}

@router.post("/pending_orders")
def save_pending_orders(
    request: Request, sl_no: int = Form(...), company_name: str = Form(...),
    po_number: str = Form(...), buyer: str = Form(...), agent: str = Form(...),
    country: str = Form(...), shipment_date: str = Form(...), brand: list[str] = Form(...), 
    packing_style: list[str] = Form(...), freezer: list[str] = Form(...), 
    count_glaze: list[str] = Form(...), weight_glaze: list[str] = Form(...),
    species: list[str] = Form(...), variety: list[str] = Form(...), 
    grade: list[str] = Form(...), no_of_pieces: list[str] = Form(...), 
    no_of_mc: list[int] = Form(...), selling_price: list[float] = Form(...),
    exchange_rate: list[float] = Form(...), db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")
    email = request.session.get("email")
    db.query(pending_orders).filter(pending_orders.po_number == po_number).delete()
    
    for i in range(len(brand)):
        db.add(pending_orders(
            sl_no=sl_no, company_name=company_name, po_number=po_number, buyer=buyer, 
            agent_name=agent, country=country, shipment_date=shipment_date,
            brand=brand[i], packing_style=packing_style[i], freezer=freezer[i], 
            count_glaze=count_glaze[i], weight_glaze=weight_glaze[i], species=species[i], 
            variety=variety[i], grade=grade[i], no_of_pieces=calculate_pieces(grade[i], no_of_pieces[i]), 
            no_of_mc=no_of_mc[i], selling_price=selling_price[i], exchange_rate=exchange_rate[i],
            company_id=company_code, email=email, date=datetime.now().strftime("%Y-%m-%d")
        ))
    db.commit()
    return RedirectResponse("/inventory/pending_orders", status_code=303)

@router.post("/pending_orders/delete_po/{po}")
def delete_po(po: str, request: Request, db: Session = Depends(get_db)):
    db.query(pending_orders).filter(pending_orders.po_number == po).delete()
    db.commit()
    return RedirectResponse("/inventory/pending_orders", status_code=303)