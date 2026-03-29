from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import date, datetime

from app.database import get_db
from app.database.models.bills import PurchaseInvoice
from app.database.models.criteria import (
    production_at,
    vendors,
    hsn_codes
)
from app.main import templates

# ==================================================
# ROUTER CONFIG
# ==================================================
router = APIRouter(
    prefix="/purchase",
    tags=["Purchase"]
)

# ==================================================
# 🧾 PURCHASE ENTRY PAGE
# URL : /purchase/entry
# ==================================================
@router.get("/entry", response_class=HTMLResponse)
def purchase_entry_page(
    request: Request,
    db: Session = Depends(get_db)
):
    email = request.session.get("email")
    company_id = request.session.get("company_code")

    if not email or not company_id:
        return RedirectResponse("/", status_code=303)

    # 🔹 Production At (Unit Master)
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

    # 🔹 Vendor Map for Table Display (ID to Name conversion)
    vendor_map = {v.id: v.name for v in all_vendors}

    # 🔹 Products / HSN Master
    hsn_list = (
        db.query(hsn_codes)
        .filter(hsn_codes.company_id == company_id)
        .order_by(hsn_codes.description)
        .all()
    )

    # 🔹 Purchase Invoice History (Company-wise)
    invoice_history = (
        db.query(PurchaseInvoice)
        .filter(PurchaseInvoice.company_id == company_id)
        .order_by(desc(PurchaseInvoice.id))
        .limit(50)
        .all()
    )

    return templates.TemplateResponse(
        "bills/purchase_entry.html",
        {
            "request": request,
            "locations": locations,
            "vendors": all_vendors,
            "vendor_map": vendor_map, # 👈 Table display kosam idi pampistunnam
            "hsn_list": hsn_list,
            "invoice_history": invoice_history
        }
    )

# ==================================================
# 💾 SAVE PURCHASE INVOICE
# URL : /purchase/save
# ==================================================
@router.post("/save")
def save_purchase_invoice(
    request: Request,
    db: Session = Depends(get_db),

    # 🔗 LINKS
    unit_id: int = Form(...),          # production_at.id
    vendor_id: int = Form(...),

    # 📄 INVOICE INFO
    invoice_date: date = Form(...),
    invoice_no: str = Form(...),

    # 📦 PRODUCT INFO
    product_name: str = Form(...),
    hsn_code: str = Form(...),

    # 💰 VALUES
    qty: float = Form(...),
    base_price: float = Form(...),
    gst_percent: float = Form(...)
):
    email = request.session.get("email")
    company_id = request.session.get("company_code")

    if not email or not company_id:
        return JSONResponse(
            {"status": "error", "message": "Session Expired"},
            status_code=401
        )

    try:
        # --------------------------------------------------
        # 🔴 DUPLICATE INVOICE CHECK (Company-wise)
        # --------------------------------------------------
        duplicate = (
            db.query(PurchaseInvoice)
            .filter(
                PurchaseInvoice.invoice_no == invoice_no,
                PurchaseInvoice.company_id == company_id
            )
            .first()
        )

        if duplicate:
            return JSONResponse(
                {"status": "error", "message": "Invoice number already exists"},
                status_code=400
            )

        # --------------------------------------------------
        # 🧮 CALCULATIONS
        # --------------------------------------------------
        taxable_value = round(qty * base_price, 2)
        tax_amount = round((taxable_value * gst_percent) / 100, 2)
        grand_total = round(taxable_value + tax_amount, 2)

        # --------------------------------------------------
        # ⏱ META DATE & TIME (STRING COLUMNS)
        # --------------------------------------------------
        now = datetime.now()
        str_date = now.strftime("%Y-%m-%d")
        str_time = now.strftime("%H:%M:%S")

        # --------------------------------------------------
        # 💾 INSERT PURCHASE INVOICE
        # --------------------------------------------------
        invoice = PurchaseInvoice(
            unit_id=unit_id,
            production_at_id=unit_id,   # DB lo rendu columns unnai
            vendor_id=vendor_id,

            invoice_date=invoice_date,
            invoice_no=invoice_no,

            product_name=product_name,
            hsn_code=hsn_code,

            qty=qty,
            base_price=base_price,
            gst_percent=gst_percent,
            tax_amount=tax_amount,
            grand_total=grand_total,

            company_id=company_id,
            email=email,
            date=str_date,
            time=str_time
        )

        db.add(invoice)
        db.commit()

        return JSONResponse({
            "status": "success",
            "message": f"Invoice {invoice_no} saved successfully!"
        })

    except Exception as e:
        db.rollback()
        print("❌ PURCHASE SAVE ERROR:", e)

        return JSONResponse(
            {
                "status": "error",
                "message": "Database error while saving invoice"
            },
            status_code=500
        )