from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.database.models.processing import Soaking

router = APIRouter(tags=["FLOOR BALANCE REPORT"])


# =====================================================
# FLOOR BALANCE REPORT (VARIETY WISE – LIVE)
# Source = SOAKING AVAILABLE QTY
# available = in_qty - rejection_qty
# =====================================================
@router.get("/floor_balance_report", response_class=HTMLResponse)
def floor_balance_report(
    request: Request,
    variety: str | None = None,   # ✅ SAFE
    db: Session = Depends(get_db)
):

    company_id = request.session.get("company_code")
    email = request.session.get("email")

    if not company_id or not email:
        return RedirectResponse("/auth/login", status_code=303)

    if not variety:
        return RedirectResponse(
            "/dashboard/processing_dashboard",
            status_code=303
        )

    # -------------------------------------------------
    # FLOOR BALANCE CALCULATION
    # -------------------------------------------------
    rows = (
        db.query(
            Soaking.batch_number.label("batch"),
            Soaking.species.label("species"),
            Soaking.in_count.label("count"),
            func.coalesce(
                func.sum(Soaking.in_qty - Soaking.rejection_qty),
                0
            ).label("available_qty")
        )
        .filter(
            Soaking.company_id == company_id,
            Soaking.variety_name == variety
        )
        .group_by(
            Soaking.batch_number,
            Soaking.species,
            Soaking.in_count
        )
        .having(
            func.coalesce(
                func.sum(Soaking.in_qty - Soaking.rejection_qty),
                0
            ) > 0
        )
        .order_by(
            Soaking.batch_number,
            Soaking.in_count
        )
        .all()
    )

    return request.app.state.templates.TemplateResponse(
        "reports/floor_balance_report.html",
        {
            "request": request,
            "variety": variety,
            "rows": rows
        }
    )
