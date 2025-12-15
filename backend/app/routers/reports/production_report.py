from fastapi import APIRouter, Request, Depends
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from collections import defaultdict

from app.database import get_db
from app.database.models.processing import Production

router = APIRouter(tags=["Production Report"])
templates = Jinja2Templates(directory="app/templates/reports")


@router.get("/production_report")
def production_report(
    request: Request,
    batch: str = "",
    variety: str = "",
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_id", "BKNR001")

    q = db.query(Production).filter(Production.company_id == company_id)

    if batch:
        q = q.filter(Production.batch_number == batch)

    if variety:
        q = q.filter(Production.variety_name == variety)

    records = q.order_by(Production.batch_number.desc(), Production.variety_name).all()

    # -----------------------
    # GROUP → BATCH → VARIETY
    # -----------------------
    final_total = 0
    grouped = {}  # {batch : {variety : rows , variety_total , batch_total}}

    for r in records:
        b = r.batch_number
        v = r.variety_name

        if b not in grouped:
            grouped[b] = {"varieties": defaultdict(list), "batch_total": 0}

        grouped[b]["varieties"][v].append(r)
        grouped[b]["batch_total"] += r.production_qty or 0
        final_total += r.production_qty or 0

    # Dropdown filter options
    batches = sorted({r.batch_number for r in records})
    varieties = sorted({r.variety_name for r in records})

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
