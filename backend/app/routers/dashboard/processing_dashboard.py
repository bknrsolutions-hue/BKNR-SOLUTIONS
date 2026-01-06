from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta

from app.database import get_db
from app.database.models.processing import (
    GateEntry,
    RawMaterialPurchasing,
    DeHeading,
    Grading,
    Peeling,
    Soaking,
    Production
)

from app.services.floor_balance import get_floor_balance

router = APIRouter(tags=["PROCESSING DASHBOARD"])


@router.get("/processing_dashboard", response_class=HTMLResponse)
def processing_dashboard(
    request: Request,
    db: Session = Depends(get_db),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    hour_date: date | None = Query(None),
):

    # -------------------------------------------------
    # SESSION CHECK
    # -------------------------------------------------
    company_id = request.session.get("company_code")
    email = request.session.get("email")

    if not company_id or not email:
        return RedirectResponse("/auth/login", status_code=303)

    today = date.today()

    # -------------------------------------------------
    # DEFAULT DATE FILTERS
    # -------------------------------------------------
    if not to_date:
        to_date = today
    if not from_date:
        from_date = to_date - timedelta(days=6)
    if not hour_date:
        hour_date = today

    # -------------------------------------------------
    # SUMMARY CARDS
    # -------------------------------------------------
    gate_total = db.query(func.count(GateEntry.id)) \
        .filter(GateEntry.company_id == company_id).scalar() or 0

    gate_today = db.query(func.count(GateEntry.id)) \
        .filter(
            GateEntry.company_id == company_id,
            GateEntry.date == today
        ).scalar() or 0

    rmp_total = db.query(func.coalesce(func.sum(
        RawMaterialPurchasing.received_qty), 0)) \
        .filter(RawMaterialPurchasing.company_id == company_id).scalar()

    rmp_today = db.query(func.coalesce(func.sum(
        RawMaterialPurchasing.received_qty), 0)) \
        .filter(
            RawMaterialPurchasing.company_id == company_id,
            RawMaterialPurchasing.date == today
        ).scalar()

    dh_total = db.query(func.coalesce(func.sum(
        DeHeading.hoso_qty), 0)) \
        .filter(DeHeading.company_id == company_id).scalar()

    dh_today = db.query(func.coalesce(func.sum(
        DeHeading.hoso_qty), 0)) \
        .filter(
            DeHeading.company_id == company_id,
            DeHeading.date == today
        ).scalar()

    grading_total = db.query(func.coalesce(func.sum(
        Grading.quantity), 0)) \
        .filter(Grading.company_id == company_id).scalar()

    grading_today = db.query(func.coalesce(func.sum(
        Grading.quantity), 0)) \
        .filter(
            Grading.company_id == company_id,
            Grading.date == today
        ).scalar()

    peeling_total = db.query(func.coalesce(func.sum(
        Peeling.peeled_qty), 0)) \
        .filter(Peeling.company_id == company_id).scalar()

    peeling_today = db.query(func.coalesce(func.sum(
        Peeling.peeled_qty), 0)) \
        .filter(
            Peeling.company_id == company_id,
            Peeling.date == today
        ).scalar()

    soaking_total = db.query(func.coalesce(func.sum(
        Soaking.in_qty - Soaking.rejection_qty), 0)) \
        .filter(Soaking.company_id == company_id).scalar()

    soaking_today = db.query(func.coalesce(func.sum(
        Soaking.in_qty - Soaking.rejection_qty), 0)) \
        .filter(
            Soaking.company_id == company_id,
            Soaking.date == today
        ).scalar()

    production_total = db.query(func.coalesce(func.sum(
        Production.production_qty), 0)) \
        .filter(Production.company_id == company_id).scalar()

    production_today = db.query(func.coalesce(func.sum(
        Production.production_qty), 0)) \
        .filter(
            Production.company_id == company_id,
            Production.date == today
        ).scalar()

    # -------------------------------------------------
    # DAY WISE FLOW
    # -------------------------------------------------
    days = []
    cur = from_date
    while cur <= to_date:
        days.append(cur)
        cur += timedelta(days=1)

    flow_dates = [d.strftime("%Y-%m-%d") for d in days]

    def sum_for_date(model, column, d):
        return float(
            db.query(func.coalesce(func.sum(column), 0))
            .filter(
                model.company_id == company_id,
                model.date == d
            )
            .scalar()
        )

    flow_data = {
        "gate": [
            db.query(func.count(GateEntry.id))
              .filter(
                  GateEntry.company_id == company_id,
                  GateEntry.date == d
              )
              .scalar() or 0
            for d in days
        ],
        "rmp":        [sum_for_date(RawMaterialPurchasing, RawMaterialPurchasing.received_qty, d) for d in days],
        "dh":         [sum_for_date(DeHeading, DeHeading.hoso_qty, d) for d in days],
        "grading":    [sum_for_date(Grading, Grading.quantity, d) for d in days],
        "peeling":    [sum_for_date(Peeling, Peeling.peeled_qty, d) for d in days],
        "soaking":    [sum_for_date(Soaking, Soaking.in_qty - Soaking.rejection_qty, d) for d in days],
        "production": [sum_for_date(Production, Production.production_qty, d) for d in days],
    }

    # -------------------------------------------------
    # HOURLY FLOW
    # -------------------------------------------------
    hours = [f"{h}:00" for h in range(24)]

    def hourly_sum(model, column):
        return [
            float(
                db.query(func.coalesce(func.sum(column), 0))
                .filter(
                    model.company_id == company_id,
                    model.date == hour_date,
                    func.extract("hour", model.time) == h
                )
                .scalar()
            )
            for h in range(24)
        ]

    hourly_data = {
        "hours": hours,
        "production": hourly_sum(Production, Production.production_qty),
        "peeling": hourly_sum(Peeling, Peeling.peeled_qty),
        "grading": hourly_sum(Grading, Grading.quantity),
        "dh": hourly_sum(DeHeading, DeHeading.hoso_qty),
        "rmp": hourly_sum(RawMaterialPurchasing, RawMaterialPurchasing.received_qty),
        "soaking": hourly_sum(Soaking, Soaking.in_qty - Soaking.rejection_qty),
        "gate": [
            db.query(func.count(GateEntry.id))
              .filter(
                  GateEntry.company_id == company_id,
                  GateEntry.date == hour_date,
                  func.extract("hour", GateEntry.time) == h
              )
              .scalar() or 0
            for h in range(24)
        ],
    }

    # -------------------------------------------------
    # FLOOR BALANCE
    # -------------------------------------------------
    combos = set()

    for r in db.query(
        RawMaterialPurchasing.batch_number,
        RawMaterialPurchasing.count,
        RawMaterialPurchasing.species,
        RawMaterialPurchasing.variety_name,
    ).filter(RawMaterialPurchasing.company_id == company_id):
        combos.add((r.batch_number, r.count, r.species, r.variety_name))

    for r in db.query(
        Grading.batch_number,
        Grading.graded_count,
        Grading.species,
        Grading.variety_name,
    ).filter(Grading.company_id == company_id):
        combos.add((r.batch_number, r.graded_count, r.species, r.variety_name))

    for r in db.query(
        Peeling.batch_number,
        Peeling.hlso_count,
        Peeling.species,
        Peeling.variety_name,
    ).filter(Peeling.company_id == company_id):
        combos.add((r.batch_number, r.hlso_count, r.species, r.variety_name))

    for r in db.query(
        Soaking.batch_number,
        Soaking.in_count,
        Soaking.species,
        Soaking.variety_name,
    ).filter(Soaking.company_id == company_id):
        combos.add((r.batch_number, r.in_count, r.species, r.variety_name))

    floor_total = 0.0
    for batch, count, species, variety in combos:
        qty = get_floor_balance(
            db=db,
            company_id=company_id,
            batch=batch,
            count=count,
            species=species,
            variety=variety,
        )
        if qty and qty > 0:
            floor_total += qty

    floor_total = round(floor_total, 2)

    # -------------------------------------------------
    # TEMPLATE
    # -------------------------------------------------
    return request.app.state.templates.TemplateResponse(
        "dashboard/processing_dashboard.html",
        {
            "request": request,

            "gate_total": gate_total,
            "gate_today": gate_today,
            "rmp_total": rmp_total,
            "rmp_today": rmp_today,
            "dh_total": dh_total,
            "dh_today": dh_today,
            "grading_total": grading_total,
            "grading_today": grading_today,
            "peeling_total": peeling_total,
            "peeling_today": peeling_today,
            "soaking_total": soaking_total,
            "soaking_today": soaking_today,
            "production_total": production_total,
            "production_today": production_today,

            "selected_from": from_date,
            "selected_to": to_date,
            "selected_hour_date": hour_date,

            "flow_dates": flow_dates,
            "flow_data": flow_data,
            "hourly_data": hourly_data,

            "floor_total": floor_total,
        }
    )
