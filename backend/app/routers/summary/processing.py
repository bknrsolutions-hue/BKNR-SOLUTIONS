# app/routers/summary/processing.py

from fastapi import APIRouter, Request, Depends
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
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

    # ------------------ FILTERS ------------------
    batch = request.query_params.get("batch")
    from_date = request.query_params.get("from_date")
    to_date = request.query_params.get("to_date")

    def apply_filters(q, model):
        q = q.filter(model.company_id == company_id)
        if batch:
            q = q.filter(model.batch_number == batch)
        if from_date:
            q = q.filter(model.date >= from_date)
        if to_date:
            q = q.filter(model.date <= to_date)
        return q

    # ------------------ DATA ------------------
    gate_rows = apply_filters(db.query(GateEntry), GateEntry).order_by(GateEntry.date).all()
    rmp_rows = apply_filters(db.query(RawMaterialPurchasing), RawMaterialPurchasing).order_by(RawMaterialPurchasing.date).all()
    de_rows = apply_filters(db.query(DeHeading), DeHeading).order_by(DeHeading.date).all()
    peeling_rows = apply_filters(db.query(Peeling), Peeling).order_by(Peeling.date).all()
    soaking_rows = apply_filters(db.query(Soaking), Soaking).order_by(Soaking.date).all()
    grading_rows = apply_filters(db.query(Grading), Grading).order_by(Grading.date).all()
    production_rows = apply_filters(db.query(Production), Production).order_by(Production.date).all()

    # ------------------ KPI ------------------
    total_batches = db.query(func.count(func.distinct(GateEntry.batch_number)))\
        .filter(GateEntry.company_id == company_id).scalar() or 0

    total_gate_boxes = sum(r.no_of_material_boxes or 0 for r in gate_rows)
    total_rmp_qty = sum(r.received_qty or 0 for r in rmp_rows)
    total_de_hoso = sum(r.hoso_qty or 0 for r in de_rows)
    total_peeling_qty = sum(r.peeled_qty or 0 for r in peeling_rows)
    total_soaking_qty = sum(r.in_qty or 0 for r in soaking_rows)
    total_grading_qty = sum(r.quantity or 0 for r in grading_rows)
    total_production_qty = sum(r.production_qty or 0 for r in production_rows)

    overall_yield = round((total_production_qty / total_rmp_qty) * 100, 2) if total_rmp_qty else 0

    batches = [
        b[0] for b in
        db.query(GateEntry.batch_number)
        .filter(GateEntry.company_id == company_id)
        .distinct().order_by(GateEntry.batch_number).all()
        if b[0]
    ]

    return templates.TemplateResponse(
        "summary/processing_summary.html",
        {
            "request": request,
            "batches": batches,
            "selected_batch": batch or "",
            "from_date": from_date or "",
            "to_date": to_date or "",

            "total_batches": total_batches,
            "total_gate_boxes": total_gate_boxes,
            "total_rmp_qty": total_rmp_qty,
            "total_de_hoso": total_de_hoso,
            "total_peeling_qty": total_peeling_qty,
            "total_soaking_qty": total_soaking_qty,
            "total_grading_qty": total_grading_qty,
            "total_production_qty": total_production_qty,
            "overall_yield": overall_yield,

            "gate_rows": gate_rows,
            "rmp_rows": rmp_rows,
            "de_rows": de_rows,
            "peeling_rows": peeling_rows,
            "soaking_rows": soaking_rows,
            "grading_rows": grading_rows,
            "production_rows": production_rows,
        }
    )
