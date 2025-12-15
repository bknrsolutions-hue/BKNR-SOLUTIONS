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

    email = request.session.get("email")              # FIXED
    company_code = request.session.get("company_code")  # FIXED

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    rows = (
        db.query(suppliers)
        .filter(suppliers.company_id == company_code)
        .order_by(suppliers.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/suppliers.html",
        {
            "request": request,
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

    id: str = Form(""),
    date: str = Form(""),
    time: str = Form(""),

    db: Session = Depends(get_db)
):

    email = request.session.get("email")               # FIXED
    company_code = request.session.get("company_code")  # FIXED

    if not email or not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    # SAFE ID
    record_id = int(id) if id and id.isdigit() else None

    # AUTO DATE TIME
    now = datetime.now()
    if not date:
        date = now.strftime("%Y-%m-%d")
    if not time:
        time = now.strftime("%H:%M:%S")

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
        row.date = date
        row.time = time
        row.email = email

    # INSERT MODE
    else:
        new_row = suppliers(
            supplier_name=supplier_name,
            supplier_email=supplier_email,
            phone=phone,
            address=address,
            date=date,
            time=time,
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

    company_code = request.session.get("company_code")  # FIXED

    if not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    db.query(suppliers).filter(
        suppliers.id == id,
        suppliers.company_id == company_code
    ).delete()

    db.commit()

    return JSONResponse({"status": "ok"})
