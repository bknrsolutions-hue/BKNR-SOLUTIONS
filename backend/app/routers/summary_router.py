from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from typing import List

from app.database import get_db
from app.database.models.processing import (
    Production,
    RawMaterialPurchasing,
    Grading,
    Peeling,
    GateEntry
)
from app.services.floor_balance import get_floor_balance

router = APIRouter(
    prefix="/summary",
    tags=["SUMMARY"]
)

templates = Jinja2Templates(directory="app/templates")

@router.get("/processing", response_class=HTMLResponse)
def processing_summary(request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/auth/login", status_code=303)
    rows = db.query(Production).filter(Production.company_id == company_code).all()
    return templates.TemplateResponse("summary/processing_summary.html", {"request": request, "rows": rows})

@router.get("/floor_balance_value", response_class=HTMLResponse)
def floor_balance_value_report(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/auth/login", status_code=303)
    # Your floor balance logic here...
    return templates.TemplateResponse("summary/floor_balance_value.html", {"request": request, "rows_batch": [], "company_id": company_id})

#
@router.get("/periodic-report", response_class=HTMLResponse)
async def get_periodic_summary_report(
    request: Request,
    view_type: str = Query("day"),
    production_for: str = Query(None),
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/auth/login", status_code=303)

    companies = [c[0] for c in db.query(distinct(GateEntry.production_for)).filter(GateEntry.company_id == company_code).all() if c[0]]

    if view_type == "month":
        date_label = func.to_char(GateEntry.gate_entry_date, 'YYYY-MM').label("period")
    else:
        date_label = func.cast(GateEntry.gate_entry_date, func.Date).label("period")

    query = db.query(
        date_label,
        func.sum(RawMaterialPurchasing.received_qty).label("rmp_qty"),
        func.sum(RawMaterialPurchasing.amount).label("rmp_amt"),
        func.count(distinct(GateEntry.batch_number)).label("batch_count")
    ).join(
        RawMaterialPurchasing, GateEntry.batch_number == RawMaterialPurchasing.batch_number
    ).filter(
        GateEntry.company_id == company_code
    )

    if production_for:
        query = query.filter(GateEntry.production_for == production_for)

    summary_results = query.group_by("period").order_by(date_label.desc()).all()

    periodic_data = []
    for row in summary_results:
        periodic_data.append({
            "period": row.period,
            "rmp_qty": float(row.rmp_qty or 0),
            "rmp_amt": float(row.rmp_amt or 0),
            "batch_count": row.batch_count
        })

    return templates.TemplateResponse(
        "summary/periodic_summary.html",
        {
            "request": request,
            "companies": companies,
            "selected_company": production_for,
            "view_type": view_type,
            "periodic_data": periodic_data
        }
    )