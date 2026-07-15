from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
import re
from datetime import date, datetime
from app.utils.timezone import ist_now

# Database and Models
from app.database import get_db
from app.database.models.inventory_management import sales_dispatch, stock_entry
from app.database.models.criteria import packing_styles, production_for
from app.database.models.bills import ContainerLog, PurchaseInvoice
from app.utils.global_filters import get_global_filters
from app.services.bill_accounting import (
    cancel_linked_bill_voucher,
    ensure_bill_accounting_schema,
    post_export_sales_invoice,
)

# Router setup
router = APIRouter(prefix="/inventory", tags=["SALES DISPATCH"])
templates = Jinja2Templates(directory="app/templates")

def clean_po(val):
    if not val:
        return ""
    return re.sub(r'[^a-zA-Z0-9]', '', str(val)).lower().strip()


def parse_invoice_date(value: str | None) -> date:
    if not value:
        return ist_now().date()
    try:
        return datetime.strptime(str(value), "%Y-%m-%d").date()
    except ValueError:
        return ist_now().date()


def refresh_sales_amounts(sale_item: sales_dispatch, weight_map: dict[str, float]) -> float:
    qty_kg = round(
        float(sale_item.no_of_mc or 0)
        * weight_map.get(str(sale_item.packing_style or "").strip(), 1.0),
        3,
    )
    amount_usd = round(qty_kg * float(sale_item.price or 0), 2)
    amount_inr = round(amount_usd * float(sale_item.exchange_rate or 83.5), 2)
    sale_item.sales_quantity = qty_kg
    sale_item.amount_usd = amount_usd
    sale_item.amount_inr = amount_inr
    return amount_inr


def repost_sales_invoice_accounts(
    db: Session,
    company_code: str,
    invoice_no: str,
    weight_map: dict[str, float],
    email: str,
    cancel_existing: bool = True,
) -> None:
    invoice_rows = db.query(sales_dispatch).filter(
        sales_dispatch.company_id == company_code,
        sales_dispatch.invoice_no == invoice_no,
    ).all()
    if not invoice_rows:
        return

    if cancel_existing:
        for journal_id in {row.journal_id for row in invoice_rows if row.journal_id}:
            cancel_linked_bill_voucher(db, company_code, journal_id, email)

    invoice_total_inr = 0.0
    for row in invoice_rows:
        invoice_total_inr += refresh_sales_amounts(row, weight_map)
        row.journal_id = None

    if invoice_total_inr <= 0:
        return

    first_row = invoice_rows[0]
    voucher = post_export_sales_invoice(
        db=db,
        company_id=company_code,
        voucher_date=parse_invoice_date(first_row.invoice_date),
        reference_no=invoice_no,
        buyer_name=first_row.buyer_name or "Export Buyer",
        invoice_value_inr=invoice_total_inr,
        created_by=email or "SYSTEM",
    )
    for row in invoice_rows:
        row.journal_id = voucher.id


def sync_unposted_sales_accounts(
    db: Session,
    company_code: str,
    sales_rows: list[sales_dispatch],
    weight_map: dict[str, float],
    email: str,
) -> None:
    invoice_numbers = {
        row.invoice_no
        for row in sales_rows
        if row.invoice_no and (not row.journal_id or not row.amount_inr)
    }
    for invoice_no in invoice_numbers:
        repost_sales_invoice_accounts(db, company_code, invoice_no, weight_map, email, cancel_existing=True)

# -------------------------------------------------------------------------
# 1️⃣ SALES REPORT PAGE (WITH PO WISE GROUPING & PRORATED COSTS)
# -------------------------------------------------------------------------
@router.get("/sales_report", response_class=HTMLResponse)
def sales_report(request: Request, db: Session = Depends(get_db)):
    production_for_filter, location = get_global_filters(request)
    
    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/auth/login", status_code=303)
    ensure_bill_accounting_schema(db)

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
    if location:
        sales_q = sales_q.filter(func.trim(sales_dispatch.production_at) == func.trim(location))
    elif user_allowed_locations:
        sales_q = sales_q.filter(
            func.upper(func.trim(sales_dispatch.production_at)).in_(user_allowed_locations)
        )
    sales_data = sales_q.order_by(sales_dispatch.po_number, sales_dispatch.invoice_date.desc()).all()

    packing_data = db.query(packing_styles).filter(packing_styles.company_id == company_code).all()
    weight_map = {str(p.packing_style).strip(): float(p.mc_weight or 1.0) for p in packing_data}
    sync_unposted_sales_accounts(
        db,
        company_code,
        sales_data,
        weight_map,
        request.session.get("email") or "SYSTEM",
    )

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
    stock_in_map = {}
    stock_out_map = {}
    for row in raw_stock:
        po = clean_po(row.po_number)
        if po:
            val = float(row.inventory_value or 0)
            if val == 0: 
                val = float(row.quantity or 0) * float(row.product_kg_value or 0)
            movement = str(row.cargo_movement_type or "IN").strip().upper()
            if movement == "OUT":
                stock_out_map[po] = stock_out_map.get(po, 0.0) + abs(val)
            else:
                stock_in_map[po] = stock_in_map.get(po, 0.0) + abs(val)

    # Dispatched OUT value is the actual COGS. Fall back to produced IN value
    # for older records that were created before OUT valuation was available.
    stock_map = {
        po: stock_out_map.get(po) or stock_in_map.get(po, 0.0)
        for po in set(stock_in_map) | set(stock_out_map)
    }

    # Freight & Packing Maps
    freight_rows = db.query(ContainerLog.po_number, ContainerLog.lended_total).filter(
        ContainerLog.company_id == company_code
    ).all()
    freight_map = {}
    for po_number, lended_total in freight_rows:
        po = clean_po(po_number)
        if po:
            freight_map[po] = freight_map.get(po, 0.0) + float(lended_total or 0)

    packing_rows = db.query(PurchaseInvoice.po_number, PurchaseInvoice.grand_total).filter(
        PurchaseInvoice.company_id == company_code
    ).all()
    packing_map = {}
    for po_number, grand_total in packing_rows:
        po = clean_po(po_number)
        if po:
            packing_map[po] = packing_map.get(po, 0.0) + float(grand_total or 0)

    processed = []
    current_po, sl_no = None, 0

    for s in sales_data:
        # 🟢 FIX: Group SL_NO by PO Number instead of Invoice Number
        if s.po_number != current_po:
            sl_no += 1
            current_po = s.po_number

        qty = float(s.no_of_mc or 0) * weight_map.get(str(s.packing_style).strip(), 1.0)
        usd = round(qty * float(s.price or 0), 2)
        inr = round(usd * float(s.exchange_rate or 83.5), 2)
        
        sale_po = clean_po(s.po_number)
        
        # 🟢 FIX: Cost Proration (పలు ఇన్వాయిస్లు ఉంటే ఖర్చులను KGల ఆధారంగా విభజించడం)
        total_qty_for_po = po_total_kg.get(sale_po, 1) or 1
        qty_ratio = qty / total_qty_for_po

        stock_val = round(stock_map.get(sale_po, 0) * qty_ratio, 2)
        f_cost = round(freight_map.get(sale_po, 0) * qty_ratio, 2)
        p_cost = round(packing_map.get(sale_po, 0) * qty_ratio, 2)
        
        pl = round(inr - (stock_val + f_cost + p_cost), 2)

        s.sales_quantity = qty
        s.amount_usd = usd
        s.amount_inr = inr
        s.stock_value, s.freight_cost, s.packing_cost, s.profit_loss = stock_val, f_cost, p_cost, pl

        processed.append({
            "sl_no": sl_no, "obj": s, "total_qty_kg": qty, "total_usd": usd, "total_inr": inr,
            "stock_value": stock_val, "freight_cost": f_cost, "packing_cost": p_cost, "profit_loss": pl
        })

    db.commit()
    if request.query_params.get("format") == "json":
        from fastapi.responses import JSONResponse
        from fastapi.encoders import jsonable_encoder
        serialized_processed = []
        for item in processed:
            serialized_item = dict(item)
            obj_dict = {col.name: getattr(item["obj"], col.name) for col in item["obj"].__table__.columns}
            obj_dict["stock_value"] = getattr(item["obj"], "stock_value", 0.0)
            obj_dict["freight_cost"] = getattr(item["obj"], "freight_cost", 0.0)
            obj_dict["packing_cost"] = getattr(item["obj"], "packing_cost", 0.0)
            obj_dict["profit_loss"] = getattr(item["obj"], "profit_loss", 0.0)
            serialized_item["obj"] = obj_dict
            serialized_processed.append(serialized_item)
            
        json_context = {
            "sales_data": serialized_processed,
            "unique_companies": unique_companies,
            "global_production_for": production_for_filter or "",
            "global_location": location or ""
        }
        return JSONResponse(jsonable_encoder(json_context))

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
    company_code = request.session.get("company_code")
    if not company_code:
        raise HTTPException(status_code=401, detail="Session expired")
    try:
        new_rate = float(data.get("exchange_rate"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Enter a valid exchange rate")
    if new_rate <= 0 or new_rate > 1000:
        raise HTTPException(status_code=400, detail="Exchange rate must be between 0 and 1000")
    ensure_bill_accounting_schema(db)
    
    sale_item = db.query(sales_dispatch).filter(
        sales_dispatch.id == sale_id,
        sales_dispatch.company_id == company_code,
    ).first()
    if not sale_item:
        raise HTTPException(status_code=404, detail="Sales record not found")
    
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
    sale_item.sales_quantity = qty_kg
    sale_item.amount_usd = round(qty_kg * float(sale_item.price or 0), 2)
    sale_item.amount_inr = round(total_inr, 2)

    if sale_item.invoice_no:
        weight_rows = db.query(packing_styles).filter(packing_styles.company_id == sale_item.company_id).all()
        weight_map = {str(p.packing_style).strip(): float(p.mc_weight or 1.0) for p in weight_rows}
        repost_sales_invoice_accounts(
            db,
            sale_item.company_id,
            sale_item.invoice_no,
            weight_map,
            request.session.get("email") or "SYSTEM",
            cancel_existing=True,
        )
    
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
    company_code = request.session.get("company_code")
    if not company_code:
        raise HTTPException(status_code=401, detail="Session expired")
    raw_status = str(data.get("status") or "").strip().title()
    new_status = "Received" if raw_status == "Paid" else raw_status
    if new_status not in {"Unpaid", "Received"}:
        raise HTTPException(status_code=400, detail="Status must be Unpaid or Received")
    ensure_bill_accounting_schema(db)
    
    sale_item = db.query(sales_dispatch).filter(
        sales_dispatch.id == sale_id,
        sales_dispatch.company_id == company_code,
    ).first()
    if not sale_item:
        raise HTTPException(status_code=404, detail="Sales record not found")
    
    invoice_rows = [sale_item]
    if sale_item.invoice_no:
        invoice_rows = db.query(sales_dispatch).filter(
            sales_dispatch.company_id == company_code,
            sales_dispatch.invoice_no == sale_item.invoice_no,
        ).all()
    for row in invoice_rows:
        row.status = new_status
    db.commit()
    return {
        "status": "success",
        "invoice_no": sale_item.invoice_no,
        "new_status": new_status,
        "updated_ids": [row.id for row in invoice_rows],
    }
