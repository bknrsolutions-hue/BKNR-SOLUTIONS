# app/routers/criteria/chemicals.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.criteria import chemicals

router = APIRouter(tags=["CHEMICALS"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE – SHOW CHEMICALS
# ---------------------------------------------------------
@router.get("/chemicals")
def chemicals_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_code = request.session.get("company_code")   # STRING

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    today_data = (
        db.query(chemicals)
        .filter(chemicals.company_id == company_code)
        .order_by(chemicals.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/chemicals.html",
        {
            "request": request,
            "today_data": today_data,
            "email": email,
            "company_id": company_code,
            "message": ""
        }
    )


# ---------------------------------------------------------
# SAVE / UPDATE CHEMICAL
# ---------------------------------------------------------
@router.post("/chemicals")
def save_chemical(
    request: Request,
    chemical_name: str = Form(...),
    id: int = Form(None),
    date: str = Form(...),
    time: str = Form(...),
    db: Session = Depends(get_db)
):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    # DUPLICATE CHECK
    duplicate = db.query(chemicals).filter(
        chemicals.chemical_name == chemical_name,
        chemicals.company_id == company_code,
        chemicals.id != id
    ).first()

    if duplicate:
        data = db.query(chemicals).filter(
            chemicals.company_id == company_code
        ).order_by(chemicals.id.desc()).all()

        return templates.TemplateResponse(
            "criteria/chemicals.html",
            {
                "request": request,
                "today_data": data,
                "email": email,
                "company_id": company_code,
                "message": f"❌ Chemical '{chemical_name}' already exists!"
            }
        )

    # UPDATE
    if id:
        row = db.query(chemicals).filter(
            chemicals.id == id,
            chemicals.company_id == company_code
        ).first()

        if not row:
            return RedirectResponse("/chemicals?msg=Record+Not+Found", status_code=302)

        row.chemical_name = chemical_name
        row.date = date
        row.time = time
        row.email = email

    # INSERT
    else:
        new_row = chemicals(
            chemical_name=chemical_name,
            date=date,
            time=time,
            email=email,
            company_id=company_code
        )
        db.add(new_row)

    db.commit()

    updated = db.query(chemicals).filter(
        chemicals.company_id == company_code
    ).order_by(chemicals.id.desc()).all()

    return templates.TemplateResponse(
        "criteria/chemicals.html",
        {
            "request": request,
            "today_data": updated,
            "email": email,
            "company_id": company_code,
            "message": f"✔ Chemical '{chemical_name}' saved successfully!"
        }
    )


# ---------------------------------------------------------
# DELETE CHEMICAL
# ---------------------------------------------------------
@router.post("/chemicals/delete/{id}")
def delete_chemical(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    if not company_code:
        return RedirectResponse("/", status_code=302)

    db.query(chemicals).filter(
        chemicals.id == id,
        chemicals.company_id == company_code
    ).delete()

    db.commit()

    return RedirectResponse("/chemicals?msg=Deleted", status_code=302)
