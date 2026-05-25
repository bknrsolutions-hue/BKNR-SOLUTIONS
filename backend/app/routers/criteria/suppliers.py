# app/routers/criteria/suppliers.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.criteria import suppliers

router = APIRouter(tags=["SUPPLIERS"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE LOAD (COMPANY-WISE)
# ---------------------------------------------------------
@router.get("/suppliers")
def suppliers_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    rows = (
        db.query(suppliers)
        .filter(suppliers.company_id == company_code)
        .order_by(suppliers.id.desc())
        .all()
    )

    # ✅ TemplateResponse arguments updated for FastAPI latest
    return templates.TemplateResponse(
        request=request,
        name="criteria/suppliers.html",
        context={
            "today_data": rows,
            "email": email,
            "company_id": company_code
        }
    )


# ---------------------------------------------------------
# SAVE / UPDATE SUPPLIER
# ---------------------------------------------------------
@router.post("/suppliers")
async def save_supplier(
    request: Request,

    supplier_name: str = Form(...),
    supplier_email: str = Form(""),
    phone: str = Form(""),
    address: str = Form(""),
    
    # ఒరిజినల్ కాలమ్స్ ఇక్కడ ఫారమ్ పారామీటర్లుగా యాడ్ చేయబడ్డాయి
    gst_number: str = Form(""),
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
    now = datetime.now()
    date_val = date or now.strftime("%Y-%m-%d")
    time_val = time or now.strftime("%H:%M:%S")

    # DUPLICATE CHECK
    dup = (
        db.query(suppliers)
        .filter(
            suppliers.supplier_name == supplier_name,
            suppliers.company_id == company_code,
            suppliers.id != (record_id if record_id else 0)
        )
        .first()
    )

    if dup:
        return JSONResponse({"error": "Supplier already exists!"}, status_code=400)

    # UPDATE MODE
    if record_id:
        row = (
            db.query(suppliers)
            .filter(
                suppliers.id == record_id,
                suppliers.company_id == company_code
            )
            .first()
        )

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        row.supplier_name = supplier_name
        row.supplier_email = supplier_email
        row.phone = phone
        row.address = address
        
        # అప్‌డేట్ మ్యాపింగ్
        row.gst_number = gst_number
        row.bank_name = bank_name
        row.account_no = account_no
        row.ifsc = ifsc
        row.payment_cycle = payment_cycle or None
        
        row.date = date_val
        row.time = time_val
        row.email = email

    # INSERT MODE
    else:
        new_row = suppliers(
            supplier_name=supplier_name,
            supplier_email=supplier_email,
            phone=phone,
            address=address,
            
            # ఇన్సర్ట్ మ్యాపింగ్
            gst_number=gst_number,
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
@router.post("/suppliers/delete/{id}")
def delete_supplier(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    if not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    db.query(suppliers).filter(
        suppliers.id == id,
        suppliers.company_id == company_code
    ).delete()

    db.commit()

    return JSONResponse({"status": "ok"})