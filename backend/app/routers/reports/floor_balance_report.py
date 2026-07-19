from datetime import date

from fastapi import APIRouter, Request, Depends, Query
from fastapi.encoders import jsonable_encoder
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from app.utils.timezone import ist_now
from app.database import get_db
from app.services.floor_balance import get_live_floor_balance_rows, get_floor_balance_snapshot_rows
from app.utils.global_filters import get_global_filters

router = APIRouter(tags=["FLOOR BALANCE REPORT"])
templates = Jinja2Templates(directory="app/templates")

@router.get("/floor_balance_report", response_class=HTMLResponse)
def floor_balance_report(
    request: Request,
    snapshot_date: date | None = Query(None),
    db: Session = Depends(get_db),
):
    # 🟢 1. FETCH ACTIVE UNIVERSAL FILTERS FROM CONTEXT LAYER
    production_for, location = get_global_filters(request)
    
    # 🔐 SESSION SECURE CHECK
    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/auth/login", status_code=303)

    session_locations = request.session.get("allowed_locations", [])
    if isinstance(session_locations, str):
        session_locations = [value.strip() for value in session_locations.split(",") if value.strip()]

    actual_snapshot_date = None
    if snapshot_date:
        rows_batch, actual_snapshot_date = get_floor_balance_snapshot_rows(
            db,
            company_id,
            snapshot_date,
            production_for=production_for,
            location=location,
            allowed_locations=session_locations,
        )
    else:
        rows_batch = get_live_floor_balance_rows(
            db,
            company_id,
            production_for=production_for,
            location=location,
            allowed_locations=session_locations,
        )

    report_date = actual_snapshot_date or ist_now().date()
    for row in rows_batch:
        row["date"] = report_date

    if request.query_params.get("format") == "json":
        return JSONResponse(content=jsonable_encoder({
            "rows_batch": rows_batch,
            "selected_production_for": production_for,
            "selected_location": location,
            "requested_snapshot_date": snapshot_date,
            "actual_snapshot_date": actual_snapshot_date,
            "snapshot_time": "09:00 IST" if snapshot_date else "LIVE",
        }))

    # --- 5. RETURN WITH SYNCHRONIZED DROPDOWN STATE CONTEXT ---
    return templates.TemplateResponse(
        request=request,
        name="reports/floor_balance_report.html",
        context={
            "rows_batch": rows_batch,
            "selected_production_for": production_for,
            "selected_location": location,
            "requested_snapshot_date": snapshot_date,
            "actual_snapshot_date": actual_snapshot_date,
            "snapshot_time": "09:00 IST" if snapshot_date else "LIVE",
        }
    )
