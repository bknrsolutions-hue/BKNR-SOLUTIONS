from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db

# Lookup models
from app.database.models.criteria import (
    brands,
    varieties,
    glazes,
    freezers,
    packing_styles,
    grade_to_hoso,
)

# Gate entry for batch lookup
from app.database.models.processing import GateEntry

# Production Model
from app.database.models.processing import Production


router = APIRouter(tags=["PRODUCTION"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE LOAD
# ---------------------------------------------------------
@router.get("/production")
def page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("user_email")
    company_id = request.session.get("company_id")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    # Batch lookup
    batches = (
        db.query(gate_entry.batch_number)
        .filter(gate_entry.company_id == company_id)
        .order_by(gate_entry.batch_number)
        .all()
    )

    # Other lookups
    brands_list = (
        db.query(brands.brand_name)
        .filter(brands.company_id == company_id)
        .order_by(brands.brand_name)
        .all()
    )

    varieties_list = (
        db.query(varieties.variety_name)
        .filter(varieties.company_id == company_id)
        .order_by(varieties.variety_name)
        .all()
    )

    glazes_list = (
        db.query(glazes.glaze_name)
        .filter(glazes.company_id == company_id)
        .order_by(glazes.glaze_name)
        .all()
    )

    freezers_list = (
        db.query(freezers.freezer_name)
        .filter(freezers.company_id == company_id)
        .order_by(freezers.freezer_name)
        .all()
    )

    packing_list = (
        db.query(packing_styles)
        .filter(packing_styles.company_id == company_id)
        .order_by(packing_styles.name)
        .all()
    )

    grades_list = (
        db.query(grade_to_hoso.grade_name)
        .filter(grade_to_hoso.company_id == company_id)
        .order_by(grade_to_hoso.grade_name)
        .all()
    )

    return templates.TemplateResponse(
        "processing/production.html",
        {
            "request": request,
            "email": email,
            "company_id": company_id,

            "batches": [b[0] for b in batches],
            "brands": [b[0] for b in brands_list],
            "varieties": [v[0] for v in varieties_list],
            "glazes": [g[0] for g in glazes_list],
            "freezers": [f[0] for f in freezers_list],
            "packing_styles": packing_list,
            "grades": [g[0] for g in grades_list],
        }
    )


# ---------------------------------------------------------
# SAVE PRODUCTION ENTRY
# ---------------------------------------------------------
@router.post("/production")
def save(
    request: Request,

    batch_number: str = Form(...),
    brand: str = Form(...),
    variety: str = Form(...),
    glaze: str = Form(...),
    freezer: str = Form(...),
    packing_style: str = Form(...),
    grade: str = Form(...),

    no_of_mc: float = Form(0),
    loose: float = Form(0),
    production_qty: float = Form(0),

    date: str = Form(""),
    time: str = Form(""),
    email: str = Form(""),
    company_id: str = Form(""),

    db: Session = Depends(get_db)
):

    # session security
    session_email = request.session.get("user_email")
    session_company_id = request.session.get("company_id")

    if not session_email or not session_company_id:
        return RedirectResponse("/auth/login", status_code=302)

    email = session_email
    company_id = session_company_id

    # Auto date/time
    now = datetime.now()
    if not date:
        date = now.strftime("%Y-%m-%d")
    if not time:
        time = now.strftime("%H:%M:%S")

    # Duplicate Check (same batch + grade + date)
    dup = db.query(production).filter(
        production.batch_number == batch_number,
        production.grade == grade,
        production.date == date,
        production.company_id == company_id
    ).first()

    if dup:
        return RedirectResponse("/processing/production?error=exists", status_code=302)

    # Insert
    row = production(
        batch_number=batch_number,
        brand=brand,
        variety=variety,
        glaze=glaze,
        freezer=freezer,
        packing_style=packing_style,
        grade=grade,
        no_of_mc=no_of_mc,
        loose=loose,
        production_qty=production_qty,
        date=date,
        time=time,
        email=email,
        company_id=company_id,
    )

    db.add(row)
    db.commit()

    return RedirectResponse("/processing/production?success=1", status_code=302)
