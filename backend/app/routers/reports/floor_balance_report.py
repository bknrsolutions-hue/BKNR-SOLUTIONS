from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from app.utils.timezone import ist_now
from app.database import get_db
from app.services.floor_balance import get_live_floor_balance_rows
from app.utils.global_filters import get_global_filters

router = APIRouter(tags=["FLOOR BALANCE REPORT"])
templates = Jinja2Templates(directory="app/templates")

@router.get("/floor_balance_report", response_class=HTMLResponse)
def floor_balance_report(request: Request, db: Session = Depends(get_db)):
    # 🟢 1. FETCH ACTIVE UNIVERSAL FILTERS FROM CONTEXT LAYER
    production_for, location = get_global_filters(request)
    
    # 🔐 SESSION SECURE CHECK
    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/auth/login", status_code=303)

    report_date = ist_now().date()
    session_locations = request.session.get("allowed_locations", [])
    if isinstance(session_locations, str):
        session_locations = [value.strip() for value in session_locations.split(",") if value.strip()]

    rows_batch = get_live_floor_balance_rows(
        db,
        company_id,
        production_for=production_for,
        location=location,
        allowed_locations=session_locations,
    )
    for row in rows_batch:
        row["date"] = report_date

    # --- 5. RETURN WITH SYNCHRONIZED DROPDOWN STATE CONTEXT ---
    return templates.TemplateResponse(
        request=request,
        name="reports/floor_balance_report.html",
        context={
            "rows_batch": rows_batch,
            "selected_production_for": production_for, # 🟢 Passed for dropdown memory lock
            "selected_location": location              # 🟢 Passed for dropdown memory lock
        }
    )
