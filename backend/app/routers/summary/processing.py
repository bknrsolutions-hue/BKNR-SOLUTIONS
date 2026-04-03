# ============================================================
# PROCESSING SUMMARY ROUTER - THE CONTROL TOWER
# ============================================================

from fastapi import APIRouter, Request, Depends
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional

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
def processing_summary(
    request: Request, 
    batch: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    db: Session = Depends(get_db)
):
    # 🔐 SESSION & SECURITY CHECK
    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    # ------------------ HELPER: DYNAMIC FILTERS ------------------
    def apply_filters(model):
        q = db.query(model).filter(model.company_id == company_id)
        if batch:
            q = q.filter(model.batch_number == batch)
        if from_date:
            q = q.filter(model.date >= from_date)
        if to_date:
            q = q.filter(model.date <= to_date)
        return q

    # ------------------ DATA FETCHING (ORDERED BY DATE) ------------------
    gate_rows = apply_filters(GateEntry).order_by(GateEntry.date).all()
    rmp_rows = apply_filters(RawMaterialPurchasing).order_by(RawMaterialPurchasing.date).all()
    de_rows = apply_filters(DeHeading).order_by(DeHeading.date).all()
    peeling_rows = apply_filters(Peeling).order_by(Peeling.date).all()
    soaking_rows = apply_filters(Soaking).order_by(Soaking.date).all()
    grading_rows = apply_filters(Grading).order_by(Grading.date).all()
    production_rows = apply_filters(Production).order_by(Production.date).all()

    # ------------------ KPI CALCULATIONS ------------------
    # Total distinct batches in the system for dropdown
    all_batches = [
        b[0] for b in db.query(GateEntry.batch_number)
        .filter(GateEntry.company_id == company_id)
        .distinct().order_by(GateEntry.batch_number).all() if b[0]
    ]

    total_gate_boxes = sum(r.no_of_material_boxes or 0 for r in gate_rows)
    total_rmp_qty = sum(r.received_qty or 0 for r in rmp_rows)
    total_de_hoso = sum(r.hoso_qty or 0 for r in de_rows)
    total_peeling_qty = sum(r.peeled_qty or 0 for r in peeling_rows)
    total_soaking_qty = sum(r.in_qty or 0 for r in soaking_rows)
    total_grading_qty = sum(r.quantity or 0 for r in grading_rows)
    total_production_qty = sum(r.production_qty or 0 for r in production_rows)

    # Calculate Overall Process Yield (%)
    overall_yield = round((total_production_qty / total_rmp_qty) * 100, 2) if total_rmp_qty else 0

    # ------------------ RENDER RESPONSE ------------------
    return templates.TemplateResponse(
        request,
        "summary/processing_summary.html",
        {
            "batches": all_batches,
            "selected_batch": batch or "",
            "from_date": from_date or "",
            "to_date": to_date or "",

            "total_batches": len(all_batches),
            "total_gate_boxes": total_gate_boxes,
            "total_rmp_qty": round(total_rmp_qty, 2),
            "total_de_hoso": round(total_de_hoso, 2),
            "total_peeling_qty": round(total_peeling_qty, 2),
            "total_soaking_qty": round(total_soaking_qty, 2),
            "total_grading_qty": round(total_grading_qty, 2),
            "total_production_qty": round(total_production_qty, 2),
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