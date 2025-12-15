# app/routers/criteria/countries.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.criteria import countries   # model

router = APIRouter(tags=["COUNTRIES"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE – SHOW COUNTRIES
# ---------------------------------------------------------
@router.get("/countries")
def countries_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    rows = (
        db.query(countries)
        .filter(countries.company_id == company_code)
        .order_by(countries.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/countries.html",
        {
            "request": request,
            "today_data": rows,
            "email": email,
            "company_id": company_code,
            "message": ""
        }
    )


# ---------------------------------------------------------
# SAVE / UPDATE COUNTRY
# ---------------------------------------------------------
@router.post("/countries")
def save_country(
    request: Request,
    country_name: str = Form(...),
    production_cost_per_kg: float = Form(0.0),
    id: str = Form(""),      # safe string ID
    date: str = Form(...),
    time: str = Form(...),
    db: Session = Depends(get_db)
):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    # Convert ID safely
    record_id = int(id) if id and id.isdigit() else None

    # Duplicate check
    duplicate = (
        db.query(countries)
        .filter(
            countries.country_name == country_name,
            countries.company_id == company_code,
            countries.id != record_id,
        )
        .first()
    )

    if duplicate:
        return JSONResponse(
            {"error": f"Country '{country_name}' already exists!"}, status_code=400
        )

    # UPDATE
    if record_id:
        row = (
            db.query(countries)
            .filter(countries.id == record_id, countries.company_id == company_code)
            .first()
        )

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        row.country_name = country_name
        row.production_cost_per_kg = production_cost_per_kg
        row.date = date
        row.time = time
        row.email = email

    # INSERT
    else:
        new_row = countries(
            country_name=country_name,
            production_cost_per_kg=production_cost_per_kg,
            date=date,
            time=time,
            email=email,
            company_id=company_code,
        )
        db.add(new_row)

    db.commit()
    return JSONResponse({"success": True})


# ---------------------------------------------------------
# DELETE
# ---------------------------------------------------------
@router.post("/countries/delete/{id}")
def delete_country(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    if not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    db.query(countries).filter(
        countries.id == id,
        countries.company_id == company_code
    ).delete()

    db.commit()

    return JSONResponse({"status": "ok"})
