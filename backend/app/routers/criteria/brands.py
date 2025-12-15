from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.criteria import brands

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# BRAND PAGE
# ---------------------------------------------------------
@router.get("/brands")
def brand_form(request: Request, db: Session = Depends(get_db)):

    session_email = request.session.get("email")
    company_code = request.session.get("company_code")   # ✔ USE STRING (BKNR9876)

    if not session_email or not company_code:
        return RedirectResponse("/", status_code=302)

    data = (
        db.query(brands)
        .filter(brands.company_id == company_code)   # ✔ MATCH STRING
        .order_by(brands.id.desc())
        .all()
    )

    return templates.TemplateResponse("criteria/brands.html", {
        "request": request,
        "today_data": data,
        "email": session_email,
        "company_id": company_code,
        "message": ""
    })


# ---------------------------------------------------------
# SAVE BRAND
# ---------------------------------------------------------
@router.post("/brands")
def save_brand(
    request: Request,
    brand_name: str = Form(...),
    id: int = Form(None),
    date: str = Form(...),
    time: str = Form(...),
    db: Session = Depends(get_db)
):

    session_email = request.session.get("email")
    company_code = request.session.get("company_code")   # ✔ FIX

    # Duplicate
    exists = db.query(brands).filter(
        brands.brand_name == brand_name,
        brands.company_id == company_code,
        brands.id != id
    ).first()

    if exists:
        data = db.query(brands).filter(
            brands.company_id == company_code
        ).order_by(brands.id.desc()).all()

        return templates.TemplateResponse("criteria/brands.html", {
            "request": request,
            "today_data": data,
            "email": session_email,
            "company_id": company_code,
            "message": f"❌ Brand '{brand_name}' already exists!"
        })

    if id:
        row = db.query(brands).filter(
            brands.id == id,
            brands.company_id == company_code
        ).first()
        if not row:
            return {"error": "Record not found"}

        row.brand_name = brand_name
        row.date = date
        row.time = time
        row.email = session_email

    else:
        new_row = brands(
            brand_name=brand_name,
            date=date,
            time=time,
            email=session_email,
            company_id=company_code    # ✔ STRING SAVED
        )
        db.add(new_row)

    db.commit()

    data = db.query(brands).filter(
        brands.company_id == company_code
    ).order_by(brands.id.desc()).all()

    return templates.TemplateResponse("criteria/brands.html", {
        "request": request,
        "today_data": data,
        "email": session_email,
        "company_id": company_code,
        "message": f"✔️ Brand '{brand_name}' saved successfully!"
    })


# ---------------------------------------------------------
# DELETE BRAND
# ---------------------------------------------------------
@router.post("/brands/delete/{id}")
def delete_brand(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")  # ✔ FIX

    db.query(brands).filter(
        brands.id == id,
        brands.company_id == company_code
    ).delete()

    db.commit()

    return {"status": "ok"}
