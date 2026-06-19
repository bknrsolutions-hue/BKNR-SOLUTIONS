from fastapi import APIRouter, Request, Depends, Form, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, case, distinct
from datetime import datetime
from app.utils.timezone import ist_now
from collections import defaultdict
from pydantic import BaseModel
from typing import List, Optional
import re
import json
from app.services.inventory_summary_service import (
    InventorySummaryService
)
from app.services.production_requirements_service import (
    ProductionRequirementService
)

# Database and Models
from app.database import get_db
from app.database.models.inventory_management import pending_orders, sales_dispatch, stock_entry
from app.database.models.users import Company
from app.database.models.criteria import (
    buyers, buyer_agents, brands, countries,
    varieties, grades, glazes, packing_styles, freezers, species, 
    production_for, production_at as ProductionAtMaster
)
from app.database.models.bills import ContainerLog, PurchaseInvoice
from app.utils.global_filters import get_global_filters

# Standardizing Prefix and Tags from Code 2
router = APIRouter(prefix="/inventory", tags=["STOCK ENTRY"])
templates = Jinja2Templates(directory="app/templates")

# -----------------------------------
# Pydantic Schemas
# -----------------------------------
class StatusUpdate(BaseModel):
    po_number: str
    status: str
    invoice_no: Optional[str] = None

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
# 1️⃣ PENDING ORDERS PAGE (GET) - WITH STRICT FORM DROPDOWN FILTERING
# -------------------------------------------------------------------------
@router.get("/pending_orders", response_class=HTMLResponse)
def pending_orders_page(request: Request, edit: str | None = None, db: Session = Depends(get_db)):
    # FETCH UNIVERSAL GLOBAL FILTERS CONTEXT
    production_for_filter, location = get_global_filters(request)
    
    company_code = request.session.get("company_code")
    email = request.session.get("email")
    
    if not company_code or not email:
        return RedirectResponse("/auth/login", status_code=303)

    # FETCH USER PERMITTED LOCATIONS MULTI-PERMISSION CHECK
    session_locations = request.session.get("allowed_locations", [])
    if isinstance(session_locations, str):
        user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()]
    else:
        user_allowed_locations = [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]

    # 🟢 🔴 FIXED LOGIC: Form Dropdown Company Filter Sync
    # గ్లోబల్ హెడర్ లో కంపెనీ సెలెక్ట్ అయి ఉంటే, ఫారమ్ లో కూడా అదే రావాలి చిన్నా!
    if production_for_filter:
        unique_companies = [production_for_filter.strip()]
    else:
        prod_names = db.query(production_for.production_for).filter(
            production_for.company_id == company_code,
            production_for.production_for != None
        ).distinct().all()
        unique_companies = [c[0] for c in prod_names if c[0]]

    # Fetch pending orders rows
    query = db.query(pending_orders).filter(pending_orders.company_id == company_code)
    if production_for_filter:
        query = query.filter(func.trim(pending_orders.company_name) == func.trim(production_for_filter))
    rows = query.order_by(pending_orders.sl_no, pending_orders.id).all()

    # Grouping by PO Number for display logic
    po_groups = defaultdict(list)
    for r in rows:
        po_groups[r.po_number].append(r)

    # Logic for Editing an existing PO
    edit_rows = []
    if edit:
        edit_rows = db.query(pending_orders).filter(
            pending_orders.company_id == company_code, 
            pending_orders.po_number == edit
        ).all()

    # Calculate next serial number
    max_sl = db.query(func.max(pending_orders.sl_no)).filter(
        pending_orders.company_id == company_code
    ).scalar()

    next_sl = (max_sl or 0) + 1
    if edit_rows:
        next_sl = edit_rows[0].sl_no

    # Helper to fetch dropdown lists
    def get_lookup(model, field_name):
        return [getattr(x, field_name) for x in db.query(model).filter(model.company_id == company_code).all()]

    # 🟢 🔴 FIXED LOGIC: Form Dropdown Factory Location Filter Sync
    # గ్లోబల్ హెడర్ లో లొకేషన్ సెలెక్ట్ అయి ఉంటే, ఫారమ్ లో కూడా కేవలం ఆ ఒక్క ఆప్షన్ మాత్రమే రావాలి బ్రదర్
    if location:
        production_locations = [location.strip()]
    else:
        pa_q = db.query(ProductionAtMaster.production_at).filter(ProductionAtMaster.company_id == company_code)
        if user_allowed_locations:
            pa_q = pa_q.filter(func.upper(func.trim(ProductionAtMaster.production_at)).in_(user_allowed_locations))
        production_locations = [p.production_at for p in pa_q.order_by(ProductionAtMaster.production_at).all()]

    return templates.TemplateResponse(
        request=request,
        name="inventory_management/pending_orders.html",
        context={
            "po_groups": dict(po_groups),  
            "edit_rows": edit_rows,
            "next_sl": next_sl,
            "unique_companies": unique_companies,
            "production_locations": production_locations,
            "global_production_for": production_for_filter or "", 
            "global_location": location or "",                     
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
# 2️⃣ SAVE PENDING ORDERS (POST) - SECURED FOR 422 AND REFRESH EXCEPTION
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
    production_at: str = Form(...),    
    exchange_rate: float = Form(...),   
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
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")
    email = request.session.get("email")

    if not company_code:
        return RedirectResponse("/auth/login", status_code=303)

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
            production_at=production_at,     
            exchange_rate=exchange_rate,     
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
            company_id=company_code,
            email=email,
            date=ist_now().strftime("%Y-%m-%d"),
            progress_steps="pending"
        ))

    db.commit()

    try:
        print("PRODUCTION REQUIREMENTS REFRESH PIPELINE LAUNCH")
        rows = ProductionRequirementService.refresh_requirements(
            db=db,
            company_id=company_code
        )
        print("ROWS CREATED:", rows)
    except Exception as service_err:
        print(f"🛑 REFRESH SERVICE DEFERRED TEMPORARILY: {str(service_err)}")

    request.session["message"] = f"PO {po_number} saved successfully!"
    return RedirectResponse("/inventory/pending_orders", status_code=303)

# -------------------------------------------------------------------------
# 3️⃣ MOVE TO SALES (SALES DISPATCH) (POST) - ISOLATED ARCHITECTURE
# -------------------------------------------------------------------------
@router.post("/move_to_sales")
def move_to_sales(
    request: Request,
    po_number: str = Form(...),
    invoice_no: str = Form(...),
    invoice_date: str = Form(...),
    shipping_bill: str = Form(""),
    container_no: str = Form(""),
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")

    if not company_code:
        return RedirectResponse("/auth/login", status_code=303)

    items = db.query(pending_orders).filter(
        pending_orders.company_id == company_code,
        pending_orders.po_number == po_number
    ).all()

    if not items:
        raise HTTPException(status_code=404, detail="PO Number not found")

    for item in items:
        db.add(
            sales_dispatch(
                company_id=company_code,
                invoice_no=invoice_no,
                invoice_date=invoice_date,
                shipping_bill=shipping_bill,
                container_no=container_no,
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
                production_at=item.production_at, 
                exchange_rate=item.exchange_rate, 
                stock_value=0.0,
                profit_loss=0.0,
                freight_cost=0.0,
                packing_cost=0.0,
                status="Unpaid",
                created_at=ist_now().date()
            )
        )

    for item in items:
        item.progress_steps = "completed"

    db.commit()

    request.session["message"] = f"PO {po_number} moved to Sales Dispatch (Invoice: {invoice_no})"
    return RedirectResponse("/inventory/pending_orders", status_code=303)

# -------------------------------------------------------------------------
# 4️⃣ STATUS UPDATE ROUTES (AJAX)
# -------------------------------------------------------------------------
@router.post("/update_po_status")
async def update_po_status(data: StatusUpdate, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    orders = db.query(pending_orders).filter(
        pending_orders.company_id == company_code,
        pending_orders.po_number == data.po_number
    ).all()
    
    if not orders:
        raise HTTPException(status_code=404, detail="PO Not Found")
    for order in orders:
        order.progress_steps = data.status
    db.commit()
    return {"message": "Status Updated"}

@router.post("/pending_orders/delete_po/{po_number}")
def delete_po(
    po_number: str,
    request: Request,
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")

    db.query(pending_orders).filter(
        pending_orders.company_id == company_code,
        pending_orders.po_number == po_number
    ).delete()

    db.commit()

    request.session["message"] = f"PO {po_number} deleted successfully"

    return RedirectResponse(
        "/inventory/pending_orders",
        status_code=303
    )