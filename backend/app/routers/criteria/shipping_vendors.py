from app.utils.timezone import ist_now
# app/routers/criteria/shipping_vendors.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.criteria import shipping_vendors

router = APIRouter(tags=["SHIPPING VENDORS"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE LOAD (COMPANY-WISE)
# ---------------------------------------------------------
@router.get("/shipping_vendors")
def shipping_vendors_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    rows = (
        db.query(shipping_vendors)
        .filter(shipping_vendors.company_id == company_code)
        .order_by(shipping_vendors.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        request=request,
        name="criteria/shipping_vendors.html",
        context={
            "today_data": rows,
            "email": email,
            "company_id": company_code
        }
    )


# ---------------------------------------------------------
# SAVE / UPDATE
# ---------------------------------------------------------
@router.post("/shipping_vendors")
async def save_shipping_vendor(
    request: Request,

    vendor_name: str = Form(...),
    gst_number: str = Form(""),
    address: str = Form(""),
    bank_name: str = Form(""),
    account_no: str = Form(""),
    ifsc: str = Form(""),
    payment_cycle: str = Form(""),

    id: str = Form(""),
    date: str = Form(""),
    time: str = Form(""),

    db: Session = Depends(get_db)
):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    # SAFE ID
    record_id = int(id) if id and id.isdigit() else None

    # AUTO DATE TIME
    now = ist_now()
    date_val = date or now.strftime("%Y-%m-%d")
    time_val = time or now.strftime("%H:%M:%S")

    # DUPLICATE CHECK
    dup = (
        db.query(shipping_vendors)
        .filter(
            shipping_vendors.vendor_name == vendor_name,
            shipping_vendors.company_id == company_code,
            shipping_vendors.id != (record_id if record_id else 0)
        )
        .first()
    )

    if dup:
        return JSONResponse({"error": "Shipping Vendor already exists!"}, status_code=400)

    # UPDATE MODE
    if record_id:
        row = (
            db.query(shipping_vendors)
            .filter(
                shipping_vendors.id == record_id,
                shipping_vendors.company_id == company_code
            )
            .first()
        )

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        row.vendor_name = vendor_name
        row.gst_number = gst_number
        row.address = address
        row.bank_name = bank_name
        row.account_no = account_no
        row.ifsc = ifsc
        row.payment_cycle = payment_cycle or None
        
        row.date = date_val
        row.time = time_val
        row.email = email

    # INSERT MODE
    else:
        new_row = shipping_vendors(
            vendor_name=vendor_name,
            gst_number=gst_number,
            address=address,
            bank_name=bank_name,
            account_no=account_no,
            ifsc=ifsc,
            payment_cycle=payment_cycle or None,
            
            date=date_val,
            time=time_val,
            email=email,
            company_id=company_code
        )
        db.add(new_row)

    db.commit()
    return JSONResponse({"success": True})


# ---------------------------------------------------------
# DELETE
# ---------------------------------------------------------
@router.post("/shipping_vendors/delete/{id}")
def delete_shipping_vendor(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    if not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    db.query(shipping_vendors).filter(
        shipping_vendors.id == id,
        shipping_vendors.company_id == company_code
    ).delete()

    db.commit()

    return JSONResponse({"status": "ok"})
