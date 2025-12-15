# app/routers/criteria/buyers.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.criteria import buyers

router = APIRouter(tags=["BUYERS"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE – SHOW BUYERS
# ---------------------------------------------------------
@router.get("/buyers")
def buyers_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_code = request.session.get("company_code")   # STRING like BKNR5647

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    today_data = (
        db.query(buyers)
        .filter(buyers.company_id == company_code)     # match STRING
        .order_by(buyers.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/buyers.html",
        {
            "request": request,
            "today_data": today_data,
            "email": email,
            "company_id": company_code,
            "message": ""
        }
    )


# ---------------------------------------------------------
# SAVE / UPDATE BUYER
# ---------------------------------------------------------
@router.post("/buyers")
def save_buyer(
    request: Request,
    buyer_name: str = Form(...),
    id: int = Form(None),
    date: str = Form(...),
    time: str = Form(...),
    db: Session = Depends(get_db)
):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    # Duplicate Validation
    duplicate = db.query(buyers).filter(
        buyers.buyer_name == buyer_name,
        buyers.company_id == company_code,
        buyers.id != id
    ).first()

    if duplicate:
        data = db.query(buyers).filter(
            buyers.company_id == company_code
        ).order_by(buyers.id.desc()).all()

        return templates.TemplateResponse(
            "criteria/buyers.html",
            {
                "request": request,
                "today_data": data,
                "email": email,
                "company_id": company_code,
                "message": f"❌ Buyer '{buyer_name}' already exists!"
            }
        )

    # UPDATE
    if id:
        row = db.query(buyers).filter(
            buyers.id == id,
            buyers.company_id == company_code
        ).first()

        if not row:
            return RedirectResponse("/buyers?msg=Record+Not+Found", status_code=302)

        row.buyer_name = buyer_name
        row.date = date
        row.time = time
        row.email = email

    # INSERT
    else:
        new_row = buyers(
            buyer_name=buyer_name,
            date=date,
            time=time,
            email=email,
            company_id=company_code  # STRING stored
        )
        db.add(new_row)

    db.commit()

    # Fetch updated list
    data = db.query(buyers).filter(
        buyers.company_id == company_code
    ).order_by(buyers.id.desc()).all()

    return templates.TemplateResponse(
        "criteria/buyers.html",
        {
            "request": request,
            "today_data": data,
            "email": email,
            "company_id": company_code,
            "message": f"✔ Buyer '{buyer_name}' saved successfully!"
        }
    )


# ---------------------------------------------------------
# DELETE BUYER
# ---------------------------------------------------------
@router.post("/buyers/delete/{id}")
def delete_buyer(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    if not company_code:
        return RedirectResponse("/", status_code=302)

    db.query(buyers).filter(
        buyers.id == id,
        buyers.company_id == company_code
    ).delete()

    db.commit()

    return RedirectResponse("/buyers?msg=Deleted", status_code=302)
