# app/routers/criteria/countries.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.criteria import countries   # <-- FIXED

router = APIRouter(tags=["COUNTRIES"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE LOAD (COMPANY-WISE)
# ---------------------------------------------------------
@router.get("/countries")
def countries_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("user_email")
    company_id = request.session.get("company_id")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    today_data = (
        db.query(countries)
        .filter(countries.company_id == company_id)
        .order_by(countries.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/countries.html",
        {
            "request": request,
            "today_data": today_data,
            "email": email,
            "company_id": company_id,
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
    id: int = Form(None),
    date: str = Form(...),
    time: str = Form(...),
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

    duplicate = (
        db.query(countries)
        .filter(
            countries.country_name == country_name,
            countries.company_id == company_id,
            countries.id != id,
        )
        .first()
    )

    if duplicate:
        return JSONResponse(
            {"error": f"Country '{country_name}' already exists!"},
            status_code=400,
        )

    if id:
        row = (
            db.query(countries)
            .filter(countries.id == id, countries.company_id == company_id)
            .first()
        )

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        row.country_name = country_name
        row.production_cost_per_kg = production_cost_per_kg
        row.date = date
        row.time = time
        row.email = email

    else:
        new_row = countries(
            country_name=country_name,
            production_cost_per_kg=production_cost_per_kg,
            date=date,
            time=time,
            email=email,
            company_id=company_id,
        )
        db.add(new_row)

    db.commit()
    return JSONResponse({"success": True})


# ---------------------------------------------------------
# DELETE
# ---------------------------------------------------------
@router.post("/countries/delete/{id}")
def delete_country(id: int, request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_id")
    if not company_id:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    db.query(countries).filter(
        countries.id == id, countries.company_id == company_id
    ).delete()

    db.commit()
    return JSONResponse({"status": "ok"})
