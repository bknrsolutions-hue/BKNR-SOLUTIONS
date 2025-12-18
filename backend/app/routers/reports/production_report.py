# ============================================================
# 🔥 PRODUCTION REPORT – FINAL CORRECT ROUTER
# ============================================================

from fastapi import APIRouter, Request, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from collections import defaultdict

from app.database import get_db
from app.database.models.processing import Production

router = APIRouter(tags=["PRODUCTION REPORT"])
templates = Jinja2Templates(directory="app/templates/reports")


# ------------------------------------------------------------
# PRODUCTION REPORT
# ------------------------------------------------------------
@router.get("/production_report")
def production_report(
    request: Request,
    batch: str = "",
    variety: str = "",
    db: Session = Depends(get_db)
):

    # ✅ SESSION (RMP STYLE)
    company_code = request.session.get("company_code")
    email = request.session.get("email")

    if not company_code or not email:
        return RedirectResponse("/auth/login", status_code=302)

    # ------------------------------------------------
    # BASE QUERY (COMPANY WISE)
    # ------------------------------------------------
    q = db.query(Production).filter(
        Production.company_id == company_code
    )

    if batch:
        q = q.filter(Production.batch_number == batch)

    if variety:
        q = q.filter(Production.variety_name == variety)

    records = (
        q.order_by(
            Production.batch_number,
            Production.variety_name,
            Production.id
        )
        .all()
    )

    # ------------------------------------------------
    # GROUP → BATCH → VARIETY
    # ------------------------------------------------
    final_total = 0
    grouped = {}  
    # {
    #   batch: {
    #     "varieties": { variety: [rows] },
    #     "batch_total": float
    #   }
    # }

    for r in records:
        b = r.batch_number
        v = r.variety_name

        if b not in grouped:
            grouped[b] = {
                "varieties": defaultdict(list),
                "batch_total": 0
            }

        grouped[b]["varieties"][v].append(r)
        grouped[b]["batch_total"] += (r.production_qty or 0)
        final_total += (r.production_qty or 0)

    # ------------------------------------------------
    # FILTER DROPDOWNS
    # ------------------------------------------------
    batches = sorted({
        r.batch_number for r in
        db.query(Production.batch_number)
        .filter(Production.company_id == company_code)
        .distinct()
        .all()
        if r.batch_number
    })

    varieties = sorted({
        r.variety_name for r in
        db.query(Production.variety_name)
        .filter(Production.company_id == company_code)
        .distinct()
        .all()
        if r.variety_name
    })

    # ------------------------------------------------
    # RESPONSE
    # ------------------------------------------------
    return templates.TemplateResponse(
        "production_report.html",
        {
            "request": request,
            "grouped": grouped,
            "final_total": final_total,

            "batches": batches,
            "varieties": varieties,

            "selected_batch": batch,
            "selected_variety": variety,
        }
    )
