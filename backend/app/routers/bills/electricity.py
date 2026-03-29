from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from sqlalchemy.orm import Session
from datetime import date
from sqlalchemy import desc

from app.database import get_db
from app.database.models.bills import ElectricityLog
from app.database.models.criteria import production_at
from app.main import templates

router = APIRouter(
    prefix="/electricity",
    tags=["Electricity"]
)

# ==================================================
# 🔌 ELECTRICITY ENTRY PAGE
# ==================================================
@router.get("/entry", response_class=HTMLResponse)
def electricity_entry_page(
    request: Request,
    db: Session = Depends(get_db)
):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email:
        return RedirectResponse("/", status_code=303)

    units = (
        db.query(production_at)
        .filter(production_at.company_id == company_code)
        .order_by(production_at.production_at)
        .all()
    )

    history = (
        db.query(ElectricityLog)
        .join(production_at, ElectricityLog.unit_id == production_at.id)
        .filter(production_at.company_id == company_code)
        .order_by(desc(ElectricityLog.reading_date))
        .limit(50)
        .all()
    )

    return templates.TemplateResponse(
        "bills/electricity_entry.html",
        {
            "request": request,
            "units": units,
            "history": history
        }
    )

# ==================================================
# 🔍 LOOKUP LAST READING & AUTO-FILL RATE (FIXED)
# ==================================================
@router.get("/lookup/{unit_id}")
def lookup_last_reading(
    unit_id: int,
    request: Request,
    db: Session = Depends(get_db)
):
    if not request.session.get("email"):
        return JSONResponse({"error": "Session expired"}, status_code=401)

    # 1. Master Info nundi Meter Number & Default Rate fetch cheyalii
    unit_info = db.query(production_at).filter(production_at.id == unit_id).first()

    # 2. Last Log nundi Closing Reading & actual Current Rate fetch cheyali
    last_log = (
        db.query(ElectricityLog)
        .filter(ElectricityLog.unit_id == unit_id)
        .order_by(desc(ElectricityLog.reading_date), desc(ElectricityLog.id))
        .first()
    )

    # Rate Logic: Priority 1: Last Entry Rate | Priority 2: Master Table Rate | Priority 3: 0.0
    current_rate = 0.0
    if last_log and last_log.unit_rate:
        current_rate = last_log.unit_rate
    elif unit_info and unit_info.unit_rate:
        current_rate = unit_info.unit_rate

    return JSONResponse({
        "last_closing": float(last_log.closing_kwh) if last_log else 0.0,
        "unit_rate": float(current_rate),
        "meter_number": unit_info.meter_number if unit_info else "N/A"
    })

# ==================================================
# 💾 SAVE ELECTRICITY ENTRY
# ==================================================
@router.post("/save")
def save_electricity_entry(
    request: Request,
    db: Session = Depends(get_db),

    unit_id: int = Form(...),
    reading_date: date = Form(...),
    opening_kwh: float = Form(...),
    closing_kwh: float = Form(...),
    unit_rate: float = Form(...)
):
    email = request.session.get("email")
    if not email:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    exists = (
        db.query(ElectricityLog)
        .filter(
            ElectricityLog.unit_id == unit_id,
            ElectricityLog.reading_date == reading_date
        )
        .first()
    )
    if exists:
        return JSONResponse(
            {"status": "error", "message": "Entry already exists for this unit & date"},
            status_code=400
        )

    units_consumed = closing_kwh - opening_kwh
    if units_consumed < 0:
        return JSONResponse(
            {"status": "error", "message": "Closing reading cannot be less than opening"},
            status_code=400
        )

    total_cost = round(units_consumed * unit_rate, 2)

    entry = ElectricityLog(
        unit_id=unit_id,
        reading_date=reading_date,
        opening_kwh=opening_kwh,
        closing_kwh=closing_kwh,
        unit_rate=unit_rate,
        total_cost=total_cost
    )

    try:
        db.add(entry)
        db.commit()
        return JSONResponse({
            "status": "success",
            "message": "Data saved successfully",
            "units_consumed": units_consumed,
            "total_cost": total_cost
        })
    except Exception as e:
        db.rollback()
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)

# ==================================================
# 📊 MONTHLY SUMMARY
# ==================================================
@router.get("/summary/{year}/{month}")
def electricity_monthly_summary(
    year: int,
    month: int,
    request: Request,
    db: Session = Depends(get_db)
):
    if not request.session.get("email"):
        return JSONResponse({"error": "Session expired"}, status_code=401)

    import calendar
    last_day = calendar.monthrange(year, month)[1]
    
    start_date = date(year, month, 1)
    end_date = date(year, month, last_day)

    rows = (
        db.query(ElectricityLog)
        .filter(ElectricityLog.reading_date.between(start_date, end_date))
        .all()
    )

    summary = {}
    for r in rows:
        if r.unit_id not in summary:
            summary[r.unit_id] = {"units": 0, "cost": 0}
        summary[r.unit_id]["units"] += (r.closing_kwh - r.opening_kwh)
        summary[r.unit_id]["cost"] += r.total_cost

    return JSONResponse(summary)