# app/routers/dashboards/processing.py

from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, extract
from datetime import date, timedelta
import logging

from app.database import get_db
from app.database.models.processing import (
    GateEntry, RawMaterialPurchasing, DeHeading, 
    Grading, Peeling, Soaking, Production
)
from app.services.floor_balance import get_floor_balance

# ✅ Master router handle chestundi kabatti prefix empty
router = APIRouter(prefix="", tags=["PROCESSING DASHBOARD"])
templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)

@router.get("/processing_dashboard", response_class=HTMLResponse)
def processing_dashboard(
    request: Request,
    db: Session = Depends(get_db),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    hour_date: date | None = Query(None),
):
    # 1. SESSION SECURITY
    company_id = request.session.get("company_code")
    email = request.session.get("email")

    if not company_id or not email:
        return RedirectResponse("/auth/login", status_code=303)

    today = date.today()

    # 2. DEFAULT DATE FILTERS
    if not to_date: to_date = today
    if not from_date: from_date = to_date - timedelta(days=6)
    if not hour_date: hour_date = today

    # 3. SUMMARY CARDS LOGIC (Helper Function)
    def get_summary(model, column, filter_today=False):
        try:
            query = db.query(func.coalesce(func.sum(column), 0)).filter(model.company_id == company_id)
            if filter_today:
                query = query.filter(model.date == today)
            return query.scalar() or 0
        except Exception as e:
            logger.error(f"Summary Fetch Error ({model.__tablename__}): {e}")
            return 0

    # Counts and Sums
    gate_total = db.query(func.count(GateEntry.id)).filter(GateEntry.company_id == company_id).scalar() or 0
    gate_today = db.query(func.count(GateEntry.id)).filter(GateEntry.company_id == company_id, GateEntry.date == today).scalar() or 0

    rmp_total = get_summary(RawMaterialPurchasing, RawMaterialPurchasing.received_qty)
    rmp_today = get_summary(RawMaterialPurchasing, RawMaterialPurchasing.received_qty, True)

    dh_total = get_summary(DeHeading, DeHeading.hoso_qty)
    dh_today = get_summary(DeHeading, DeHeading.hoso_qty, True)

    grading_total = get_summary(Grading, Grading.quantity)
    grading_today = get_summary(Grading, Grading.quantity, True)

    peeling_total = get_summary(Peeling, Peeling.peeled_qty)
    peeling_today = get_summary(Peeling, Peeling.peeled_qty, True)

    soaking_total = db.query(func.coalesce(func.sum(Soaking.in_qty - Soaking.rejection_qty), 0)).filter(Soaking.company_id == company_id).scalar() or 0
    soaking_today = db.query(func.coalesce(func.sum(Soaking.in_qty - Soaking.rejection_qty), 0)).filter(Soaking.company_id == company_id, Soaking.date == today).scalar() or 0

    production_total = get_summary(Production, Production.production_qty)
    production_today = get_summary(Production, Production.production_qty, True)

    # 4. DAY WISE FLOW (For Line Chart)
    days = []
    curr = from_date
    while curr <= to_date:
        days.append(curr)
        curr += timedelta(days=1)

    flow_dates = [d.strftime("%Y-%m-%d") for d in days]

    def sum_for_date(model, column, d):
        return float(db.query(func.coalesce(func.sum(column), 0)).filter(model.company_id == company_id, model.date == d).scalar() or 0)

    flow_data = {
        "gate": [db.query(func.count(GateEntry.id)).filter(GateEntry.company_id == company_id, GateEntry.date == d).scalar() or 0 for d in days],
        "rmp": [sum_for_date(RawMaterialPurchasing, RawMaterialPurchasing.received_qty, d) for d in days],
        "dh": [sum_for_date(DeHeading, DeHeading.hoso_qty, d) for d in days],
        "grading": [sum_for_date(Grading, Grading.quantity, d) for d in days],
        "peeling": [sum_for_date(Peeling, Peeling.peeled_qty, d) for d in days],
        "soaking": [sum_for_date(Soaking, Soaking.in_qty - Soaking.rejection_qty, d) for d in days],
        "production": [sum_for_date(Production, Production.production_qty, d) for d in days],
    }

    # 5. HOURLY FLOW (For Bar Chart)
    def hourly_sum(model, column):
        return [
            float(db.query(func.coalesce(func.sum(column), 0))
            .filter(model.company_id == company_id, model.date == hour_date, extract("hour", model.time) == h)
            .scalar() or 0)
            for h in range(24)
        ]

    hourly_data = {
        "hours": [f"{h}:00" for h in range(24)],
        "production": hourly_sum(Production, Production.production_qty),
        "peeling": hourly_sum(Peeling, Peeling.peeled_qty),
        "grading": hourly_sum(Grading, Grading.quantity),
        "gate": [db.query(func.count(GateEntry.id)).filter(GateEntry.company_id == company_id, GateEntry.date == hour_date, extract("hour", GateEntry.time) == h).scalar() or 0 for h in range(24)],
    }

    # 6. FLOOR BALANCE TOTAL (Safe Estimation)
    floor_total = 0.0
    try:
        combos = set()
        stages = [
            (RawMaterialPurchasing, RawMaterialPurchasing.batch_number, RawMaterialPurchasing.count, RawMaterialPurchasing.peeling_at),
            (Grading, Grading.batch_number, Grading.graded_count, Grading.peeling_at),
            (Peeling, Peeling.batch_number, Peeling.hlso_count, Peeling.peeling_at),
            (Soaking, Soaking.batch_number, Soaking.in_count, Soaking.production_at)
        ]

        for model, batch_col, count_col, loc_col in stages:
            res = db.query(batch_col, count_col, model.species, model.variety_name, loc_col).filter(model.company_id == company_id).all()
            for r in res:
                if r[0]: combos.add(r)

        for batch, count, species, variety, location in combos:
            qty = get_floor_balance(db=db, company_id=company_id, batch=batch, count=count, species=species, variety=variety, location=location)
            if qty and qty > 0: floor_total += qty
    except Exception as e:
        logger.error(f"Floor Balance Calculation Error: {e}")

    # 7. RESPONSE
    return templates.TemplateResponse(
        request=request,
        name="dashboard/processing_dashboard.html",
        context={
            "gate_total": gate_total, "gate_today": gate_today,
            "rmp_total": round(rmp_total, 2), "rmp_today": round(rmp_today, 2),
            "dh_total": round(dh_total, 2), "dh_today": round(dh_today, 2),
            "grading_total": round(grading_total, 2), "grading_today": round(grading_today, 2),
            "peeling_total": round(peeling_total, 2), "peeling_today": round(peeling_today, 2),
            "soaking_total": round(soaking_total, 2), "soaking_today": round(soaking_today, 2),
            "production_total": round(production_total, 2), "production_today": round(production_today, 2),
            "selected_from": from_date, "selected_to": to_date, "selected_hour_date": hour_date,
            "flow_dates": flow_dates, "flow_data": flow_data, "hourly_data": hourly_data,
            "floor_total": round(floor_total, 2),
            "email": email, "company_id": company_id
        }
    )