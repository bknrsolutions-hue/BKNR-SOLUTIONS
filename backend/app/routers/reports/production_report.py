# ============================================================
# 🔥 PRODUCTION REPORT – FINAL WORKING ROUTER
# ============================================================

from fastapi import APIRouter, Request, Depends, Query
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from collections import defaultdict
from datetime import date

from app.database import get_db
from app.database.models.processing import Production

router = APIRouter(tags=["PRODUCTION REPORT"])
templates = Jinja2Templates(directory="app/templates/reports")

# ------------------------------------------------------------
# PRODUCTION REPORT
# URL : /reports/production_report
# ------------------------------------------------------------
@router.get("/production_report")
def production_report(
    request: Request,

    # 🔥 FILTER PARAMS (HTML MATCHED)
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    batch: str | None = Query(None),
    variety: str | None = Query(None),
    grade: str | None = Query(None),

    db: Session = Depends(get_db)
):

    # ---------------- SESSION ----------------
    company_code = request.session.get("company_code")
    email = request.session.get("email")

    if not company_code or not email:
        return RedirectResponse("/auth/login", status_code=302)

    company_code = str(company_code)

    # ---------------- BASE QUERY ----------------
    q = db.query(Production).filter(
        Production.company_id == company_code
    )

    # ---------------- APPLY FILTERS ----------------
    if from_date:
        q = q.filter(Production.date >= from_date)

    if to_date:
        q = q.filter(Production.date <= to_date)

    if batch:
        q = q.filter(Production.batch_number == batch)

    if variety:
        q = q.filter(Production.variety_name == variety)

    if grade:
        q = q.filter(Production.grade == grade)

    records = (
        q.order_by(
            Production.batch_number.desc(),
            Production.variety_name,
            Production.id
        )
        .all()
    )

    # ---------------- GROUPING ----------------
    grouped = {}
    final_total = 0.0

    for r in records:
        b = (r.batch_number or "UNKNOWN").strip()
        v = (r.variety_name or "UNKNOWN").strip()
        qty = float(r.production_qty or 0)

        if b not in grouped:
            grouped[b] = {
                "varieties": defaultdict(list),
                "batch_total": 0.0
            }

        grouped[b]["varieties"][v].append(r)
        grouped[b]["batch_total"] += qty
        final_total += qty

    # ---------------- FILTER DROPDOWNS ----------------
    batches = [
        x[0] for x in
        db.query(Production.batch_number)
        .filter(Production.company_id == company_code)
        .distinct()
        .order_by(Production.batch_number.desc())
        .all()
        if x[0]
    ]

    varieties = [
        x[0] for x in
        db.query(Production.variety_name)
        .filter(Production.company_id == company_code)
        .distinct()
        .order_by(Production.variety_name)
        .all()
        if x[0]
    ]

    grades = [
        x[0] for x in
        db.query(Production.grade)
        .filter(Production.company_id == company_code)
        .distinct()
        .order_by(Production.grade)
        .all()
        if x[0]
    ]

    # ---------------- RESPONSE ----------------
    return templates.TemplateResponse(
        "production_report.html",
        {
            "request": request,

            # table data
            "grouped": grouped,
            "final_total": round(final_total, 2),

            # dropdown data
            "batches": batches,
            "varieties": varieties,
            "grades": grades,

            # 🔥 KEEP FILTER SELECTIONS
            "selected_batch": batch,
            "selected_variety": variety,
            "selected_grade": grade,
            "from_date": from_date,
            "to_date": to_date,
        }
    )
