# app/routers/criteria/brands.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.criteria import brands   # <-- lowercase model name

router = APIRouter(tags=["BRANDS"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# BRAND PAGE (COMPANY-WISE)
# ---------------------------------------------------------
@router.get("/brands")
def brand_form(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("user_email")
    company_id = request.session.get("company_id")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    today_data = (
        db.query(brands)                       # <-- lowercase usage
        .filter(brands.company_id == company_id)
        .order_by(brands.id.desc())
        .all()
    )

    return templates.TemplateResponse("criteria/brands.html", {
        "request": request,
        "today_data": today_data,
        "email": email,
        "company_id": company_id,
        "message": ""
    })


# ---------------------------------------------------------
# SAVE / UPDATE BRAND
# ---------------------------------------------------------
@router.post("/brands")
def save_brand(
    request: Request,
    brand_name: str = Form(...),
    id: int = Form(None),
    date: str = Form(...),
    time: str = Form(...),
    email: str = Form(""),
    company_id: str = Form(""),
    db: Session = Depends(get_db)
):

    session_email = request.session.get("user_email")
    session_company_id = request.session.get("company_id")

    email = session_email
    company_id = session_company_id

    # Duplicate Check
    duplicate = db.query(brands).filter(
        brands.brand_name == brand_name,
        brands.company_id == company_id,
        brands.id != id
    ).first()

    if duplicate:
        today_data = (
            db.query(brands)
            .filter(brands.company_id == company_id)
            .order_by(brands.id.desc())
            .all()
        )

        return templates.TemplateResponse("criteria/brands.html", {
            "request": request,
            "today_data": today_data,
            "email": email,
            "company_id": company_id,
            "message": f"❌ Brand '{brand_name}' already exists!"
        })

    # UPDATE
    if id:
        row = (
            db.query(brands)
            .filter(brands.id == id, brands.company_id == company_id)
            .first()
        )

        if not row:
            return {"error": "Record not found"}

        row.brand_name = brand_name
        row.date = date
        row.time = time
        row.email = email

    # INSERT
    else:
        new_row = brands(
            brand_name=brand_name,
            date=date,
            time=time,
            email=email,
            company_id=company_id
        )
        db.add(new_row)

    db.commit()

    today_data = (
        db.query(brands)
        .filter(brands.company_id == company_id)
        .order_by(brands.id.desc())
        .all()
    )

    return templates.TemplateResponse("criteria/brands.html", {
        "request": request,
        "today_data": today_data,
        "email": email,
        "company_id": company_id,
        "message": f"✔️ Brand '{brand_name}' saved successfully!"
    })


# ---------------------------------------------------------
# DELETE BRAND (COMPANY-WISE SAFE DELETE)
# ---------------------------------------------------------
@router.post("/brands/delete/{id}")
def delete_brand(id: int, request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_id")

    db.query(brands).filter(            # <-- lowercase usage
        brands.id == id,
        brands.company_id == company_id
    ).delete()

    db.commit()

    return {"status": "ok"}
