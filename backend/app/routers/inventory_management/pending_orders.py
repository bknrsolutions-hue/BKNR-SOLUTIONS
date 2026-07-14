from fastapi import APIRouter, Request, Depends, Form, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, case, distinct
from datetime import date, datetime
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
from app.services.cache import cache_get_or_set
from app.utils.edit_lock import is_edit_locked, edit_lock_message
from app.services.bill_accounting import (
    cancel_linked_bill_voucher,
    ensure_bill_accounting_schema,
    post_export_sales_invoice,
)

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


def parse_form_date(value: str | None) -> date:
    if not value:
        return ist_now().date()
    try:
        return datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        return ist_now().date()


def get_mc_weight_map(db: Session, company_code: str) -> dict[str, float]:
    rows = db.query(packing_styles).filter(packing_styles.company_id == company_code).all()
    return {str(row.packing_style or "").strip(): float(row.mc_weight or 1.0) for row in rows}


def calculate_sales_values(item: pending_orders, weight_map: dict[str, float]) -> tuple[float, float, float]:
    mc_weight = weight_map.get(str(item.packing_style or "").strip(), 1.0)
    qty_kg = round(float(item.no_of_mc or 0) * mc_weight, 3)
    amount_usd = round(qty_kg * float(item.selling_price or 0), 2)
    amount_inr = round(amount_usd * float(item.exchange_rate or 83.5), 2)
    return qty_kg, amount_usd, amount_inr


def get_pending_order_masters(db: Session, company_code: str, user_allowed_locations: list, production_for_filter: str | None, location: str | None):
    allowed_key = ",".join(sorted(user_allowed_locations or []))
    cache_key = f"bknr:inventory_report:{company_code}:pending_order_masters:{allowed_key}:{production_for_filter or 'ALL'}:{location or 'ALL'}"

    def get_lookup(model, field_name):
        return [getattr(x, field_name) for x in db.query(model).filter(model.company_id == company_code).all()]

    def build():
        if production_for_filter:
            unique_companies = [production_for_filter.strip()]
        else:
            prod_names = db.query(production_for.production_for).filter(
                production_for.company_id == company_code,
                production_for.production_for != None
            ).distinct().all()
            unique_companies = [c[0] for c in prod_names if c[0]]

        if location:
            production_locations = [location.strip()]
        else:
            pa_q = db.query(ProductionAtMaster.production_at).filter(ProductionAtMaster.company_id == company_code)
            if user_allowed_locations:
                pa_q = pa_q.filter(func.upper(func.trim(ProductionAtMaster.production_at)).in_(user_allowed_locations))
            production_locations = [p.production_at for p in pa_q.order_by(ProductionAtMaster.production_at).all()]

        return {
            "unique_companies": unique_companies,
            "production_locations": production_locations,
            "buyers": get_lookup(buyers, "buyer_name"),
            "agents": get_lookup(buyer_agents, "agent_name"),
            "brands": get_lookup(brands, "brand_name"),
            "countries": get_lookup(countries, "country_name"),
            "species": get_lookup(species, "species_name"),
            "varieties": get_lookup(varieties, "variety_name"),
            "grades": get_lookup(grades, "grade_name"),
            "glazes": get_lookup(glazes, "glaze_name"),
            "freezers": get_lookup(freezers, "freezer_name"),
            "packing": [
                {
                    "packing_style": p.packing_style,
                    "mc_weight": p.mc_weight,
                    "slab_weight": p.slab_weight,
                }
                for p in db.query(packing_styles).filter(packing_styles.company_id == company_code).all()
            ],
        }

    return cache_get_or_set(cache_key, build, ttl=300)

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

    # Fetch pending orders rows
    query = db.query(pending_orders).filter(pending_orders.company_id == company_code)
    if production_for_filter:
        query = query.filter(func.trim(pending_orders.company_name) == func.trim(production_for_filter))
    rows = query.order_by(pending_orders.sl_no, pending_orders.id).all()
    active_rows = [
        row for row in rows
        if str(row.progress_steps or "pending").strip().lower() != "completed"
    ]
    completed_rows = [
        row for row in rows
        if str(row.progress_steps or "").strip().lower() == "completed"
    ]

    # Grouping by PO Number for display logic
    po_groups = defaultdict(list)
    for r in active_rows:
        po_groups[r.po_number].append(r)
    completed_po_groups = defaultdict(list)
    for r in completed_rows:
        completed_po_groups[r.po_number].append(r)

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

    master_context = get_pending_order_masters(db, company_code, user_allowed_locations, production_for_filter, location)

    # JSON API for React
    if request.query_params.get("format") == "json":
        import datetime as dt_mod
        def ser(v):
            if isinstance(v, (dt_mod.datetime, dt_mod.date)): return v.isoformat()
            return v
        def row_to_dict(r):
            d = {}
            for col in r.__table__.columns:
                d[col.name] = ser(getattr(r, col.name))
            return d
        return JSONResponse({
            "active_rows": [row_to_dict(r) for r in active_rows],
            "completed_rows": [row_to_dict(r) for r in completed_rows],
            "next_sl": next_sl,
            "global_production_for": production_for_filter or "",
            "global_location": location or "",
            **master_context,
        })

    return templates.TemplateResponse(
        request=request,
        name="inventory_management/pending_orders.html",
        context={
            "po_groups": dict(po_groups),  
            "completed_po_groups": dict(completed_po_groups),
            "edit_rows": edit_rows,
            "next_sl": next_sl,
            "global_production_for": production_for_filter or "", 
            "global_location": location or "",                     
            **master_context,
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

    existing_rows = db.query(pending_orders).filter(
        pending_orders.company_id == company_code,
        pending_orders.po_number == po_number
    ).all()
    if existing_rows and any(is_edit_locked(request, row.date) for row in existing_rows):
        request.session["message"] = f"❌ {edit_lock_message()}"
        return RedirectResponse("/inventory/pending_orders", status_code=303)

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
    if any(is_edit_locked(request, item.date) for item in items):
        request.session["message"] = f"❌ {edit_lock_message()}"
        return RedirectResponse("/inventory/pending_orders", status_code=303)

    try:
        ensure_bill_accounting_schema(db)
        invoice_dt = parse_form_date(invoice_date)
        weight_map = get_mc_weight_map(db, company_code)
        email = request.session.get("email") or "SYSTEM"

        existing_sales = db.query(sales_dispatch).filter(
            sales_dispatch.company_id == company_code,
            sales_dispatch.po_number == po_number,
            sales_dispatch.invoice_no == invoice_no,
        ).all()
        old_journal_ids = {row.journal_id for row in existing_sales if row.journal_id}
        for journal_id in old_journal_ids:
            cancel_linked_bill_voucher(db, company_code, journal_id, email)

        for old_row in existing_sales:
            db.delete(old_row)
        db.flush()

        saved_rows = []
        invoice_total_inr = 0.0
        buyer_name = items[0].buyer or "Export Buyer"

        for item in items:
            qty_kg, amount_usd, amount_inr = calculate_sales_values(item, weight_map)
            invoice_total_inr += amount_inr
            sale_row = sales_dispatch(company_id=company_code)
            sale_row.invoice_no = invoice_no
            sale_row.invoice_date = invoice_date
            sale_row.shipping_bill = shipping_bill
            sale_row.container_no = container_no
            sale_row.po_number = item.po_number
            sale_row.buyer_name = item.buyer
            sale_row.brand = item.brand
            sale_row.country = item.country
            sale_row.count_glaze = item.count_glaze
            sale_row.weight_glaze = item.weight_glaze
            sale_row.packing_style = item.packing_style
            sale_row.no_of_mc = item.no_of_mc
            sale_row.price = item.selling_price
            sale_row.variety = item.variety
            sale_row.grade = item.grade
            sale_row.company_name = item.company_name
            sale_row.production_at = item.production_at
            sale_row.exchange_rate = item.exchange_rate
            sale_row.stock_value = float(sale_row.stock_value or 0.0)
            sale_row.profit_loss = float(sale_row.profit_loss or 0.0)
            sale_row.freight_cost = float(sale_row.freight_cost or 0.0)
            sale_row.packing_cost = float(sale_row.packing_cost or 0.0)
            sale_row.status = sale_row.status or "Unpaid"
            sale_row.sales_quantity = qty_kg
            sale_row.amount_usd = amount_usd
            sale_row.amount_inr = amount_inr
            sale_row.journal_id = None
            sale_row.created_at = sale_row.created_at or ist_now().date()
            db.add(sale_row)
            saved_rows.append(sale_row)

        voucher = None
        if invoice_total_inr > 0:
            voucher = post_export_sales_invoice(
                db=db,
                company_id=company_code,
                voucher_date=invoice_dt,
                reference_no=invoice_no,
                buyer_name=buyer_name,
                invoice_value_inr=invoice_total_inr,
                created_by=email,
            )
            for sale_row in saved_rows:
                sale_row.journal_id = voucher.id

        for item in items:
            item.progress_steps = "completed"

        db.commit()
    except Exception as exc:
        db.rollback()
        request.session["message"] = f"❌ Sales dispatch failed: {str(exc)}"
        return RedirectResponse("/inventory/pending_orders", status_code=303)

    request.session["message"] = f"PO {po_number} moved to Sales Dispatch and Accounts (Invoice: {invoice_no})"
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
    if any(is_edit_locked(request, order.date) for order in orders):
        raise HTTPException(status_code=403, detail=edit_lock_message())
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

    rows = db.query(pending_orders).filter(
        pending_orders.company_id == company_code,
        pending_orders.po_number == po_number
    ).all()

    if rows and any(is_edit_locked(request, row.date) for row in rows):
        request.session["message"] = f"❌ {edit_lock_message()}"
        return RedirectResponse("/inventory/pending_orders", status_code=303)

    for row in rows:
        db.delete(row)

    db.commit()

    request.session["message"] = f"PO {po_number} cancelled successfully"

    return RedirectResponse(
        "/inventory/pending_orders",
        status_code=303
    )
