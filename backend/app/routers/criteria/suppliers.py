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
# PAGE LOAD
# ---------------------------------------------------------
@router.get("/suppliers")
def page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("user_email")
    company_id = request.session.get("company_id")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    rows = (
        db.query(suppliers)
        .filter(suppliers.company_id == company_id)
        .order_by(suppliers.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/suppliers.html",
        {
            "request": request,
            "today_data": rows,
            "email": email,
            "company_id": company_id
        }
    )


# ---------------------------------------------------------
# SAVE / UPDATE
# ---------------------------------------------------------
@router.post("/suppliers")
async def save(
    request: Request,

    supplier_name: str = Form(...),
    supplier_email: str = Form(""),
    phone: str = Form(""),
    address: str = Form(""),

    id: str = Form(""),   # <-- FIX (STRING)
    date: str = Form(""),
    time: str = Form(""),
    email: str = Form(""),
    company_id: str = Form(""),

    db: Session = Depends(get_db)
):

    # SESSION VALIDATION
    session_email = request.session.get("user_email")
    session_company_id = request.session.get("company_id")

    if not session_email or not session_company_id:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    email = session_email
    company_id = session_company_id

    # SAFE ID CONVERSION
    record_id = int(id) if id and id.isdigit() else None

    # AUTO DATE/TIME
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
            suppliers.company_id == company_id,
            suppliers.id != record_id
        )
        .first()
    )

    if dup:
        return JSONResponse({"error": "Supplier already exists!"}, status_code=400)

    # UPDATE
    if record_id:
        row = (
            db.query(suppliers)
            .filter(
                suppliers.id == record_id,
                suppliers.company_id == company_id
            )
            .first()
        )

        if not row:
            return JSONResponse({"error": "Not found"}, status_code=404)

        row.supplier_name = supplier_name
        row.supplier_email = supplier_email
        row.phone = phone
        row.address = address
        row.date = date
        row.time = time
        row.email = email

    # INSERT
    else:
        new_row = suppliers(
            supplier_name=supplier_name,
            supplier_email=supplier_email,
            phone=phone,
            address=address,
            date=date,
            time=time,
            email=email,
            company_id=company_id
        )
        db.add(new_row)

    db.commit()
    return JSONResponse({"success": True})


# ---------------------------------------------------------
# DELETE
# ---------------------------------------------------------
@router.post("/suppliers/delete/{id}")
def delete(id: int, request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_id")

    if not company_id:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    db.query(suppliers).filter(
        suppliers.id == id,
        suppliers.company_id == company_id
    ).delete()

    db.commit()
    return JSONResponse({"status": "ok"})
