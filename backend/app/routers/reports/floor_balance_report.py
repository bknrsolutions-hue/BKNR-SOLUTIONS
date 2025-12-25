from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.processing import (
    RawMaterialPurchasing,
    Grading,
    Peeling,
    Soaking,
)
from app.services.floor_balance import get_floor_balance

router = APIRouter(tags=["FLOOR BALANCE REPORT"])


@router.get("/floor_balance_report", response_class=HTMLResponse)
def floor_balance_report(
    request: Request,
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    email = request.session.get("email")

    if not company_id or not email:
        return RedirectResponse("/auth/login", status_code=303)

    # -------------------------------------------------
    # COLLECT UNIQUE COMBINATIONS
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

    # -------------------------------------------------
    # CALCULATE FLOOR BALANCE
    # -------------------------------------------------
    rows = []

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
            rows.append({
                "batch": batch,
                "variety": variety,
                "count": count,
                "available_qty": round(qty, 2),
            })

    # -------------------------------------------------
    # SORTED VIEWS
    # -------------------------------------------------
    rows_batch = sorted(rows, key=lambda x: (x["batch"] or "", x["variety"] or "", x["count"] or ""))
    rows_variety = sorted(rows, key=lambda x: (x["variety"] or "", x["batch"] or "", x["count"] or ""))
    rows_count = sorted(rows, key=lambda x: (x["count"] or "", x["batch"] or "", x["variety"] or ""))

    return request.app.state.templates.TemplateResponse(
        "reports/floor_balance_report.html",
        {
            "request": request,
            "rows_batch": rows_batch,
            "rows_variety": rows_variety,
            "rows_count": rows_count,
        }
    )
