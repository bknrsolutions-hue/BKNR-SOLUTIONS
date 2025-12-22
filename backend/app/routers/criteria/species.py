from app.services.grade_to_hoso_sync import sync_grade_to_hoso

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.criteria import species

router = APIRouter(tags=["SPECIES"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE – LOAD SPECIES LIST
# ---------------------------------------------------------
@router.get("/species")
def species_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    rows = (
        db.query(species)
        .filter(species.company_id == company_code)
        .order_by(species.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/species.html",
        {
            "request": request,
            "today_data": rows,
            "email": email,
            "company_id": company_code,
            "message": ""
        }
    )


# ---------------------------------------------------------
# SAVE / UPDATE SPECIES
# ---------------------------------------------------------
@router.post("/species")
def save_species(
    request: Request,
    species_name: str = Form(...),
    id: str = Form(""),
    date: str = Form(""),
    time: str = Form(""),
    db: Session = Depends(get_db)
):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    record_id = int(id) if id and id.isdigit() else None

    now = datetime.now()
    date = date or now.strftime("%Y-%m-%d")
    time = time or now.strftime("%H:%M:%S")

    # DUPLICATE CHECK
    duplicate = (
        db.query(species)
        .filter(
            species.species_name == species_name,
            species.company_id == company_code,
            species.id != record_id
        )
        .first()
    )

    if duplicate:
        rows = db.query(species).filter(
            species.company_id == company_code
        ).order_by(species.id.desc()).all()

        return templates.TemplateResponse(
            "criteria/species.html",
            {
                "request": request,
                "today_data": rows,
                "email": email,
                "company_id": company_code,
                "message": f"❌ Species '{species_name}' already exists!"
            }
        )

    # UPDATE
    if record_id:
        row = (
            db.query(species)
            .filter(species.id == record_id, species.company_id == company_code)
            .first()
        )
        if not row:
            return RedirectResponse("/criteria/species", status_code=302)

        row.species_name = species_name
        row.date = date
        row.time = time
        row.email = email

    # INSERT
    else:
        new_row = species(
            species_name=species_name,
            date=date,
            time=time,
            email=email,
            company_id=company_code
        )
        db.add(new_row)

    db.commit()

    # 🔥 AUTO GENERATE / SYNC GRADE → HOSO COMBINATIONS
    sync_grade_to_hoso(db, company_code, email)

    return RedirectResponse("/criteria/species", status_code=302)


# ---------------------------------------------------------
# DELETE SPECIES
# ---------------------------------------------------------
@router.post("/species/delete/{id}")
def delete_species(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    if not company_code:
        return RedirectResponse("/", status_code=302)

    db.query(species).filter(
        species.id == id,
        species.company_id == company_code
    ).delete()

    db.commit()

    # 🔥 RE-SYNC AFTER DELETE ALSO
    email = request.session.get("email")
    sync_grade_to_hoso(db, company_code, email)

    return RedirectResponse("/criteria/species", status_code=302)
