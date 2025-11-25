# app/routers/criteria/species.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.criteria import species

router = APIRouter(tags=["SPECIES"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE LOAD
# ---------------------------------------------------------
@router.get("/species")
def page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("user_email")
    company_id = request.session.get("company_id")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    rows = (
        db.query(species)
        .filter(species.company_id == company_id)
        .order_by(species.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/species.html",
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
@router.post("/species")
async def save(
    request: Request,

    species_name: str = Form(...),

    # ❌ NEVER USE int HERE
    # id: int = Form(None)

    id: str = Form(""),   # <-- FIXED (string input safe)

    date: str = Form(""),
    time: str = Form(""),
    email: str = Form(""),
    company_id: str = Form(""),

    db: Session = Depends(get_db)
):

    session_email = request.session.get("user_email")
    session_company_id = request.session.get("company_id")

    if not session_email or not session_company_id:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    email = session_email
    company_id = session_company_id

    # Convert ID safely
    record_id = int(id) if id and id.isdigit() else None

    # Auto date/time
    now = datetime.now()
    if not date:
        date = now.strftime("%Y-%m-%d")
    if not time:
        time = now.strftime("%H:%M:%S")

    # Duplicate
    dup = (
        db.query(species)
        .filter(
            species.species_name == species_name,
            species.company_id == company_id,
            species.id != record_id
        )
        .first()
    )

    if dup:
        return JSONResponse({"error": "Species Already Exists!"}, status_code=400)

    # UPDATE
    if record_id:
        row = (
            db.query(species)
            .filter(species.id == record_id, species.company_id == company_id)
            .first()
        )

        if not row:
            return JSONResponse({"error": "Not found"}, status_code=404)

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
            company_id=company_id
        )
        db.add(new_row)

    db.commit()
    return JSONResponse({"success": True})


# ---------------------------------------------------------
# DELETE
# ---------------------------------------------------------
@router.post("/species/delete/{id}")
def delete(id: int, request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_id")

    if not company_id:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    db.query(species).filter(
        species.id == id,
        species.company_id == company_id
    ).delete()

    db.commit()
    return JSONResponse({"status": "ok"})
