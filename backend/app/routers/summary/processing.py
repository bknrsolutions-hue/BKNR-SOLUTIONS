# app/routers/summary/processing.py

from fastapi import APIRouter, Request, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.database.models.processing import (
    GateEntry,
    RawMaterialPurchasing,
    DeHeading,
    Peeling,
    Soaking,
    Grading,
    Production
)

router = APIRouter(prefix="/summary", tags=["SUMMARY"])
templates = Jinja2Templates(directory="app/templates")


@router.get("/processing")
def processing_summary(request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/", status_code=302)

    # =========================
    # FETCH DATA (REAL TABLES)
    # =========================
    gate_rows = db.query(GateEntry)\
        .filter(GateEntry.company_id == company_id)\
        .order_by(GateEntry.date.desc())\
        .all()

    rmp_rows = db.query(RawMaterialPurchasing)\
        .filter(RawMaterialPurchasing.company_id == company_id)\
        .order_by(RawMaterialPurchasing.date.desc())\
        .all()

    de_rows = db.query(DeHeading)\
        .filter(DeHeading.company_id == company_id)\
        .order_by(DeHeading.date.desc())\
        .all()

    peeling_rows = db.query(Peeling)\
        .filter(Peeling.company_id == company_id)\
        .order_by(Peeling.date.desc())\
        .all()

    soaking_rows = db.query(Soaking)\
        .filter(Soaking.company_id == company_id)\
        .order_by(Soaking.date.desc())\
        .all()

    grading_rows = db.query(Grading)\
        .filter(Grading.company_id == company_id)\
        .order_by(Grading.date.desc())\
        .all()

    production_rows = db.query(Production)\
        .filter(Production.company_id == company_id)\
        .order_by(Production.date.desc())\
        .all()

    # =========================
    # KPI TOTALS
    # =========================
    total_batches = db.query(func.count(func.distinct(GateEntry.batch_number)))\
        .filter(GateEntry.company_id == company_id)\
        .scalar() or 0

    total_rmp = db.query(func.coalesce(func.sum(RawMaterialPurchasing.received_qty), 0))\
        .filter(RawMaterialPurchasing.company_id == company_id)\
        .scalar()

    total_production = db.query(func.coalesce(func.sum(Production.production_qty), 0))\
        .filter(Production.company_id == company_id)\
        .scalar()

    yield_percent = (total_production / total_rmp * 100) if total_rmp else 0

    # =========================
    # SEND EVERYTHING TO HTML
    # =========================
    return templates.TemplateResponse(
        "summary/processing_summary.html",
        {
            "request": request,

            # KPI
            "total_batches": total_batches,
            "total_rmp": total_rmp,
            "total_production": total_production,
            "yield_percent": round(yield_percent, 2),

            # TABLE DATA
            "gate_rows": gate_rows,
            "rmp_rows": rmp_rows,
            "de_rows": de_rows,
            "peeling_rows": peeling_rows,
            "soaking_rows": soaking_rows,
            "grading_rows": grading_rows,
            "production_rows": production_rows,
        }
    )
