# backend/app/routers/dashboard/processing_dashboard.py

from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date

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

router = APIRouter(tags=["PROCESSING DASHBOARD"])


# =====================================================
# PROCESSING DASHBOARD (LIVE + TODAY)
# =====================================================
@router.get("/processing_dashboard", response_class=HTMLResponse)
def processing_dashboard(
    request: Request,
    db: Session = Depends(get_db)
):

    company_id = request.session.get("company_code")
    email = request.session.get("email")

    if not company_id or not email:
        return RedirectResponse("/auth/login", status_code=303)

    today = date.today()

    # =================================================
    # 🔵 TOP 8 SUMMARY CARDS
    # (TOTAL + TODAY BOTH)
    # =================================================

    # -------- GATE ENTRY --------
    gate_total = (
        db.query(func.count(GateEntry.id))
        .filter(GateEntry.company_id == company_id)
        .scalar()
    ) or 0

    gate_today = (
        db.query(func.count(GateEntry.id))
        .filter(
            GateEntry.company_id == company_id,
            GateEntry.date == today
        )
        .scalar()
    ) or 0

    # -------- RAW MATERIAL --------
    rmp_total = (
        db.query(func.coalesce(func.sum(RawMaterialPurchasing.received_qty), 0))
        .filter(RawMaterialPurchasing.company_id == company_id)
        .scalar()
    )

    rmp_today = (
        db.query(func.coalesce(func.sum(RawMaterialPurchasing.received_qty), 0))
        .filter(
            RawMaterialPurchasing.company_id == company_id,
            RawMaterialPurchasing.date == today
        )
        .scalar()
    )

    # -------- DE HEADING --------
    dh_total = (
        db.query(func.coalesce(func.sum(DeHeading.hoso_qty), 0))
        .filter(DeHeading.company_id == company_id)
        .scalar()
    )

    dh_today = (
        db.query(func.coalesce(func.sum(DeHeading.hoso_qty), 0))
        .filter(
            DeHeading.company_id == company_id,
            DeHeading.date == today
        )
        .scalar()
    )

    # -------- GRADING --------
    grading_total = (
        db.query(func.coalesce(func.sum(Grading.quantity), 0))
        .filter(Grading.company_id == company_id)
        .scalar()
    )

    grading_today = (
        db.query(func.coalesce(func.sum(Grading.quantity), 0))
        .filter(
            Grading.company_id == company_id,
            Grading.date == today
        )
        .scalar()
    )

    # -------- PEELING --------
    peeling_total = (
        db.query(func.coalesce(func.sum(Peeling.peeled_qty), 0))
        .filter(Peeling.company_id == company_id)
        .scalar()
    )

    peeling_today = (
        db.query(func.coalesce(func.sum(Peeling.peeled_qty), 0))
        .filter(
            Peeling.company_id == company_id,
            Peeling.date == today
        )
        .scalar()
    )

    # -------- SOAKING --------
    soaking_total = (
        db.query(
            func.coalesce(
                func.sum(Soaking.in_qty - Soaking.rejection_qty),
                0
            )
        )
        .filter(Soaking.company_id == company_id)
        .scalar()
    )

    soaking_today = (
        db.query(
            func.coalesce(
                func.sum(Soaking.in_qty - Soaking.rejection_qty),
                0
            )
        )
        .filter(
            Soaking.company_id == company_id,
            Soaking.date == today
        )
        .scalar()
    )

    # -------- PRODUCTION --------
    production_total = (
        db.query(func.coalesce(func.sum(Production.production_qty), 0))
        .filter(Production.company_id == company_id)
        .scalar()
    )

    production_today = (
        db.query(func.coalesce(func.sum(Production.production_qty), 0))
        .filter(
            Production.company_id == company_id,
            Production.date == today
        )
        .scalar()
    )

    # =================================================
    # 🟣 FLOOR BALANCE (VARIETY WISE – LIVE)
    # Source = SOAKING AVAILABLE QTY
    # =================================================

    floor_rows = (
        db.query(
            Soaking.variety_name.label("variety"),
            func.coalesce(
                func.sum(Soaking.in_qty - Soaking.rejection_qty),
                0
            ).label("available_qty")
        )
        .filter(Soaking.company_id == company_id)
        .group_by(Soaking.variety_name)
        .all()
    )

    floor_balances = [
        {
            "variety": row.variety,
            "available_qty": round(row.available_qty, 2)
        }
        for row in floor_rows
        if row.available_qty and row.available_qty > 0
    ]

    floor_total = round(
        sum(x["available_qty"] for x in floor_balances),
        2
    )

    # =================================================
    # TEMPLATE RESPONSE
    # =================================================
    return request.app.state.templates.TemplateResponse(
        "dashboard/processing_dashboard.html",
        {
            "request": request,

            # gate
            "gate_total": gate_total,
            "gate_today": gate_today,

            # rmp
            "rmp_total": rmp_total,
            "rmp_today": rmp_today,

            # de heading
            "dh_total": dh_total,
            "dh_today": dh_today,

            # grading
            "grading_total": grading_total,
            "grading_today": grading_today,

            # peeling
            "peeling_total": peeling_total,
            "peeling_today": peeling_today,

            # soaking
            "soaking_total": soaking_total,
            "soaking_today": soaking_today,

            # production
            "production_total": production_total,
            "production_today": production_today,

            # floor balance
            "floor_total": floor_total,
            "floor_balances": floor_balances
        }
    )
