# app/routers/processing/production.py

from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime, date

from app.database import get_db
from app.database.models.processing import Production, GateEntry
from app.database.models.criteria import (
    brands, varieties, glazes, freezers,
    packing_styles, grades, species
)

router = APIRouter(tags=["PRODUCTION"])


# --------------------------------------------------------------
# PAGE (LOAD FORM + TODAY TABLE)
# --------------------------------------------------------------
@router.get("/production", response_class=HTMLResponse)
def production_page(request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_id")
    user_email = request.session.get("user_email")

    if not user_email:
        return RedirectResponse("/", 302)

    ctx = {
        "request": request,

        # LOOKUPS
        "batches": [b[0] for b in db.query(GateEntry.batch_number)
                    .filter(GateEntry.company_id == company_id).distinct()],

        "brands": [b.brand_name for b in db.query(brands)
                    .filter(brands.company_id == company_id).all()],

        "varieties": [v.variety_name for v in db.query(varieties)
                      .filter(varieties.company_id == company_id).all()],

        "glazes": [g.glaze_name for g in db.query(glazes)
                    .filter(glazes.company_id == company_id).all()],

        "freezers": [f.freezer_name for f in db.query(freezers)
                      .filter(freezers.company_id == company_id).all()],

        "packing_styles": [
            {"packing_style": p.packing_style,
             "mc_weight": p.mc_weight,
             "slab_weight": p.slab_weight}
            for p in db.query(packing_styles)
                       .filter(packing_styles.company_id == company_id).all()
        ],

        "grades": [g.grade_name for g in db.query(grades)
                   .filter(grades.company_id == company_id).all()],

        "species": [s.species_name for s in db.query(species)
                    .filter(species.company_id == company_id).all()],

        # SHOW TODAY ENTRIES
        "today_data": db.query(Production)
                        .filter(Production.company_id == company_id)
                        .filter(Production.date == date.today())
                        .order_by(Production.id.desc()).all()
    }

    return request.app.state.templates.TemplateResponse("processing/production.html", ctx)


# --------------------------------------------------------------
# SAVE PRODUCTION ENTRY
# --------------------------------------------------------------
@router.post("/production")
def save_production(
    request: Request,
    batch_number: str = Form(...),
    brand: str = Form(...),
    variety: str = Form(...),
    glaze: str = Form(...),
    freezer: str = Form(...),
    packing_style: str = Form(...),
    grade: str = Form(...),
    species_name: str = Form(...),
    no_of_mc: int = Form(...),
    loose: int = Form(...),
    production_qty: float = Form(...),
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_id")
    user_email = request.session.get("user_email")

    obj = Production(
        batch_number=batch_number,
        brand=brand,
        variety_name=variety,
        glaze=glaze,
        freezer=freezer,
        packing_style=packing_style,
        grade=grade,
        species=species_name,
        no_of_mc=no_of_mc,
        loose=loose,
        production_qty=production_qty,
        company_id=company_id,
        email=user_email,
        date=date.today(),
        time=datetime.now().time()
    )

    db.add(obj)
    db.commit()

    return RedirectResponse("/processing/production", 302)
