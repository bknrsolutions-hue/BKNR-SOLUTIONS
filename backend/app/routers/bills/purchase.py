# app/routers/bills/purchase_invoice.py

from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import date, datetime
import logging

from app.database import get_db
from app.database.models.bills import PurchaseInvoice
from app.database.models.criteria import (
    production_at,
    vendors,
    hsn_codes
)

router = APIRouter(
    prefix="/purchase",
    tags=["Purchase"]
)

templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)

# ==================================================
# 🧾 1. PURCHASE ENTRY PAGE
# ==================================================
@router.get("/entry", response_class=HTMLResponse)
def purchase_entry_page(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    company_id = request.session.get("company_code")

    if not email or not company_id:
        return RedirectResponse("/", status_code=302)

    # 🔹 Production Units (Unit Master)
    locations = (
        db.query(production_at)
        .filter(production_at.company_id == company_id)
        .order_by(production_at.production_at)
        .all()
    )

    # 🔹 Vendors Master
    all_vendors = (
        db.query(vendors)
        .filter(vendors.company_id == company_id)
        .order_by(vendors.name)
        .all()
    )

    # 🔹 Products / HSN Master
    hsn_list = (
        db.query(hsn_codes)
        .filter(hsn_codes.company_id == company_id)
        .order_by(hsn_codes.description)
        .all()
    )

    # 🔹 Purchase Invoice History with Join for safety
    invoice_history = (
        db.query(PurchaseInvoice)
        .filter(PurchaseInvoice.company_id == company_id)
        .order_by(desc(PurchaseInvoice.id))
        .limit(50)
        .all()
    )

    # Vendor Map for Table Display (ID to Name)
    vendor_map = {v.id: v.name for v in all_vendors}

    # ✅ FIX: TemplateResponse arguments updated
    return templates.TemplateResponse(
        request=request,
        name="bills/purchase_entry.html",
        context={
            "locations": locations,
            "vendors": all_vendors,
            "vendor_map": vendor_map,
            "hsn_list": hsn_list,
            "invoice_history": invoice_history,
            "email": email,
            "company_id": company_id
        }
    )

# ==================================================
# 💾 2. SAVE PURCHASE INVOICE
# ==================================================
@router.post("/save")
async def save_purchase_invoice(
    request: Request,
    unit_id: int = Form(...),
    vendor_id: int = Form(...),
    invoice_date: date = Form(...),
    invoice_no: str = Form(...),
    product_name: str = Form(...),
    hsn_code: str = Form(...),
    qty: float = Form(...),
    base_price: float = Form(...),
    gst_percent: float = Form(...),
    db: Session = Depends(get_db)
):
    email = request.session.get("email")
    company_id = request.session.get("company_code")

    if not email or not company_id:
        return JSONResponse({"status": "error", "message": "Session Expired"}, status_code=401)

    try:
        # 🔴 DUPLICATE INVOICE CHECK
        duplicate = db.query(PurchaseInvoice).filter(
            PurchaseInvoice.invoice_no == invoice_no.strip(),
            PurchaseInvoice.company_id == company_id
        ).first()

        if duplicate:
            return JSONResponse(
                {"status": "error", "message": f"Invoice {invoice_no} already exists for your company"},
                status_code=400
            )

        # 🧮 CALCULATIONS
        taxable_value = round(qty * base_price, 2)
        tax_amount = round((taxable_value * gst_percent) / 100, 2)
        grand_total = round(taxable_value + tax_amount, 2)

        # ⏱ Meta Info
        now = datetime.now()

        # 💾 INSERT RECORD
        new_invoice = PurchaseInvoice(
            unit_id=unit_id,
            production_at_id=unit_id, # Syncing both columns
            vendor_id=vendor_id,
            invoice_date=invoice_date,
            invoice_no=invoice_no.upper().strip(),
            product_name=product_name.upper().strip(),
            hsn_code=hsn_code,
            qty=qty,
            base_price=base_price,
            gst_percent=gst_percent,
            tax_amount=tax_amount,
            grand_total=grand_total,
            company_id=company_id,
            email=email,
            date=now.strftime("%Y-%m-%d"),
            time=now.strftime("%H:%M:%S")
        )

        db.add(new_invoice)
        db.commit()

        return JSONResponse({
            "status": "success",
            "message": f"Invoice {invoice_no} saved successfully!"
        })

    except Exception as e:
        db.rollback()
        logger.error(f"PURCHASE SAVE ERROR: {str(e)}")
        return JSONResponse({"status": "error", "message": "Internal Server Error"}, status_code=500)

# ==================================================
# 🗑️ 3. DELETE INVOICE
# ==================================================
@router.post("/delete/{inv_id}")
def delete_invoice(inv_id: int, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    
    invoice = db.query(PurchaseInvoice).filter(
        PurchaseInvoice.id == inv_id,
        PurchaseInvoice.company_id == company_id
    ).first()

    if invoice:
        db.delete(invoice)
        db.commit()
        return {"status": "success"}
    
    return JSONResponse({"error": "Invoice not found or unauthorized"}, status_code=404)