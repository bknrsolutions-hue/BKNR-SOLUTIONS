# ============================================================
# 🔥 PRODUCTION ENTRY – COMPANY WISE (FINAL STABLE)
# ============================================================

from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from app.database import get_db
from app.database.models.processing import Production, GateEntry
from app.database.models.criteria import (
    brands, varieties, glazes, freezers,
    packing_styles, grades, species
)

router = APIRouter(tags=["PRODUCTION"])
templates = Jinja2Templates(directory="app/templates")

# -----------------------------------------------------
# TODAY RANGE (9 AM TO NEXT DAY 9 AM)
# -----------------------------------------------------
def get_today_range():
    now = datetime.now()
    start = now.replace(hour=9, minute=0, second=0, microsecond=0)
    if now < start:
        start -= timedelta(days=1)
    end = start + timedelta(days=1) - timedelta(seconds=1)
    return start, end


# -----------------------------------------------------
# SHOW PAGE
# -----------------------------------------------------
@router.get("/production", response_class=HTMLResponse)
def production_page(request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")
    email = request.session.get("email")

    if not company_code or not email:
        return RedirectResponse("/auth/login", status_code=303)

    # ---------------- BATCH LIST ----------------
    batches = [
        g.batch_number for g in
        db.query(GateEntry)
        .filter(GateEntry.company_id == company_code)
        .order_by(GateEntry.id.desc())
        .all()
        if g.batch_number
    ]

    # ---------------- LOOKUPS ----------------
    brands_list = [b.brand_name for b in db.query(brands)
                   .filter(brands.company_id == company_code).all()]

    varieties_list = [v.variety_name for v in db.query(varieties)
                      .filter(varieties.company_id == company_code).all()]

    glazes_list = [g.glaze_name for g in db.query(glazes)
                   .filter(glazes.company_id == company_code).all()]

    freezers_list = [f.freezer_name for f in db.query(freezers)
                     .filter(freezers.company_id == company_code).all()]

    packing_styles_list = [
        {
            "packing_style": p.packing_style,
            "mc_weight": p.mc_weight,
            "slab_weight": p.slab_weight
        }
        for p in db.query(packing_styles)
        .filter(packing_styles.company_id == company_code).all()
    ]

    grades_list = [g.grade_name for g in db.query(grades)
                   .filter(grades.company_id == company_code).all()]

    species_list = [s.species_name for s in db.query(species)
                    .filter(species.company_id == company_code).all()]

    # ---------------- TODAY DATA ----------------
    start, end = get_today_range()
    today_data = (
        db.query(Production)
        .filter(Production.company_id == company_code)
        .filter(Production.date >= start.date())
        .filter(Production.date <= end.date())
        .order_by(Production.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "processing/production.html",
        {
            "request": request,
            "batches": batches,
            "brands": brands_list,
            "varieties": varieties_list,
            "glazes": glazes_list,
            "freezers": freezers_list,
            "packing_styles": packing_styles_list,
            "grades": grades_list,
            "species": species_list,
            "today_data": today_data,
            "edit_data": None,
            "message": request.session.pop("message", None)
        }
    )


# -----------------------------------------------------
# SAVE
# -----------------------------------------------------
@router.post("/production")
def save_production(
    request: Request,
    batch_number: str = Form(...),
    brand: str = Form(...),
    variety_name: str = Form(...),
    glaze: str = Form(""),
    freezer: str = Form(""),
    packing_style: str = Form(...),
    grade: str = Form(""),
    species: str = Form(...),
    no_of_mc: int = Form(0),
    loose: int = Form(0),
    production_qty: float = Form(0.0),
    db: Session = Depends(get_db)
):

    company_code = request.session.get("company_code")
    email = request.session.get("email")

    obj = Production(
        batch_number=batch_number,
        brand=brand,
        variety_name=variety_name,
        glaze=glaze,
        freezer=freezer,
        packing_style=packing_style,
        grade=grade,
        species=species,
        no_of_mc=no_of_mc,
        loose=loose,
        production_qty=production_qty,
        company_id=company_code,
        email=email,
        date=datetime.now().date(),
        time=datetime.now().time()
    )

    db.add(obj)
    db.commit()

    request.session["message"] = "✔ Production Saved Successfully!"
    return RedirectResponse("/processing/production", status_code=303)


# -----------------------------------------------------
# EDIT PAGE
# -----------------------------------------------------
@router.get("/production/edit/{id}", response_class=HTMLResponse)
def edit_production(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/auth/login", status_code=303)

    entry = db.query(Production).filter(
        Production.id == id,
        Production.company_id == company_code
    ).first()

    if not entry:
        return RedirectResponse("/processing/production", status_code=303)

    response = production_page(request, db)
    response.context["edit_data"] = entry
    response.context["today_data"] = []
    return response


# -----------------------------------------------------
# UPDATE
# -----------------------------------------------------
@router.post("/production/update/{id}")
def update_production(
    id: int,
    request: Request,
    batch_number: str = Form(...),
    brand: str = Form(...),
    variety_name: str = Form(...),
    glaze: str = Form(""),
    freezer: str = Form(""),
    packing_style: str = Form(...),
    grade: str = Form(""),
    species: str = Form(...),
    no_of_mc: int = Form(0),
    loose: int = Form(0),
    production_qty: float = Form(0.0),
    db: Session = Depends(get_db)
):

    company_code = request.session.get("company_code")

    entry = db.query(Production).filter(
        Production.id == id,
        Production.company_id == company_code
    ).first()

    if not entry:
        request.session["message"] = "❌ Record not found"
        return RedirectResponse("/processing/production", status_code=303)

    entry.batch_number = batch_number
    entry.brand = brand
    entry.variety_name = variety_name
    entry.glaze = glaze
    entry.freezer = freezer
    entry.packing_style = packing_style
    entry.grade = grade
    entry.species = species
    entry.no_of_mc = no_of_mc
    entry.loose = loose
    entry.production_qty = production_qty

    db.commit()

    request.session["message"] = "✔ Production Updated Successfully!"
    return RedirectResponse("/processing/production", status_code=303)


# -----------------------------------------------------
# DELETE
# -----------------------------------------------------
@router.post("/production/delete/{id}")
def delete_production(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    entry = db.query(Production).filter(
        Production.id == id,
        Production.company_id == company_code
    ).first()

    if entry:
        db.delete(entry)
        db.commit()

    request.session["message"] = "🗑 Production Deleted Successfully!"
    return RedirectResponse("/processing/production", status_code=303)
