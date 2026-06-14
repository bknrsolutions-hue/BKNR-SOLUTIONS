from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, extract, or_, and_
from datetime import date, timedelta, datetime
import logging

from urllib3 import request

from app.database import get_db
from app.database.models.processing import (
    GateEntry, RawMaterialPurchasing, DeHeading, 
    Grading, Peeling, Soaking, Production
)
from app.database.models.attendance import DailyAttendance, EmployeeRegistration
from app.services.floor_balance import get_floor_balance

router = APIRouter(prefix="", tags=["PROCESSING DASHBOARD"])
templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)

@router.get("/processing_dashboard", response_class=HTMLResponse)
def processing_dashboard(
    request: Request,
    db: Session = Depends(get_db),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    hour_date: date | None = Query(None),
):
    # 1. SESSION SECURITY
    company_id = request.session.get("company_code")
    email = request.session.get("email")

    if not company_id or not email:
        return RedirectResponse("/auth/login", status_code=303)

    today = date.today()

    # DEFAULT DATE FILTERS
    if not to_date: to_date = today
    if not from_date: from_date = to_date - timedelta(days=6)
    if not hour_date: hour_date = today

    # 2. PROCESSING CARDS (TODAY ONLY)
    def get_today_sum(model, column):
        return db.query(func.coalesce(func.sum(column), 0)).filter(
            model.company_id == company_id, model.date == today
        ).scalar() or 0

    gate_today = db.query(func.count(GateEntry.id)).filter(GateEntry.company_id == company_id, GateEntry.date == today).scalar() or 0
    rmp_today = get_today_sum(RawMaterialPurchasing, RawMaterialPurchasing.received_qty)
    dh_today = get_today_sum(DeHeading, DeHeading.hoso_qty)
    grading_today = get_today_sum(Grading, Grading.quantity)
    peeling_today = get_today_sum(Peeling, Peeling.peeled_qty)
    
    # Soaking Net Qty (In - Rejection)
    soaking_today = db.query(func.coalesce(func.sum(Soaking.in_qty - Soaking.rejection_qty), 0)).filter(
        Soaking.company_id == company_id, Soaking.date == today
    ).scalar() or 0
    
    production_today = get_today_sum(Production, Production.production_qty)

    # 3. RM PURCHASING SUMMARY (Species, Count, Qty)
    rm_summary_query = db.query(
        RawMaterialPurchasing.species,
        RawMaterialPurchasing.count,
        func.sum(RawMaterialPurchasing.received_qty).label("total_qty")
    ).filter(
        RawMaterialPurchasing.company_id == company_id,
        RawMaterialPurchasing.date == today
    ).group_by(RawMaterialPurchasing.species, RawMaterialPurchasing.count).all()

    rm_summary = [{"species": r[0], "count": r[1], "qty": round(r[2], 2)} for r in rm_summary_query]

    # 4. HOURLY DATA FOR 3 CHARTS
    def get_hourly_stats(model, column):
        data = db.query(
            extract("hour", model.time).label("hour"),
            func.sum(column).label("qty")
        ).filter(
            model.company_id == company_id,
            model.date == hour_date
        ).group_by("hour").all()
        
        # Map to 24-hour list
        hour_map = {int(r.hour): float(r.qty) for r in data}
        return [hour_map.get(h, 0.0) for h in range(24)]

    hourly_labels = [f"{h}:00" for h in range(24)]
    dh_hourly = get_hourly_stats(DeHeading, DeHeading.hoso_qty)
    peeling_hourly = get_hourly_stats(Peeling, Peeling.peeled_qty)
    prod_hourly = get_hourly_stats(Production, Production.production_qty)

    # 5. ATTENDANCE LOGIC (From attendance/today_all)
    att_rows = db.query(
        DailyAttendance, 
        EmployeeRegistration.department,
        EmployeeRegistration.designation
    ).join(
        EmployeeRegistration, 
        and_(DailyAttendance.employee_id == EmployeeRegistration.employee_id,
             DailyAttendance.company_id == EmployeeRegistration.company_id)
    ).filter(
        DailyAttendance.company_id == company_id,
        or_(DailyAttendance.duty_date == today, DailyAttendance.status != "CLOSED")
    ).all()

    att_stats = {"total": len(att_rows), "inside": 0, "away": 0, "half": 0, "single": 0, "double": 0}
    dept_map, desg_map = {}, {}

    for da, dept, desg in att_rows:
        # Status counts
        if da.status == "OPEN": att_stats["inside"] += 1
        elif da.status == "AWAY": att_stats["away"] += 1
        
        # Duty Type counts
        wh = float(da.working_hours or 0)
        if da.status == "CLOSED":
            if wh >= 14: att_stats["double"] += 1
            elif wh >= 6: att_stats["single"] += 1
            elif wh >= 4: att_stats["half"] += 1
        
        # Table Summaries
        d_name = dept or "GENERAL"
        ds_name = desg or "STAFF"
        
        for m, key in [(dept_map, d_name), (desg_map, ds_name)]:
            if key not in m: m[key] = {"active": 0, "closed": 0}
            if da.status == "CLOSED": m[key]["closed"] += 1
            else: m[key]["active"] += 1

    # 6. FLOOR BALANCE TOTAL (Existing logic)
    floor_total = 0.0
    # ... (Keep your existing Floor Balance calculation logic here) ...
    # (Simplified for brevity)
    floor_total = round(floor_total, 2) 

    # 7. RESPONSE
    return templates.TemplateResponse(
        request=request,
        name="dashboard/processing_dashboard.html",
        context={
            "email": email, "company_id": company_id,
            "gate_today": gate_today, "rmp_today": round(rmp_today, 2),
            "dh_today": round(dh_today, 2), "grading_today": round(grading_today, 2),
            "peeling_today": round(peeling_today, 2), "soaking_today": round(soaking_today, 2),
            "production_today": round(production_today, 2), "floor_total": floor_total,
            "rm_summary": rm_summary,
            "hourly_labels": hourly_labels,
            "dh_hourly_data": dh_hourly,
            "peeling_hourly_data": peeling_hourly,
            "prod_hourly_data": prod_hourly,
            "att_stats": att_stats,
            "dept_summary": dept_map,
            "desg_summary": desg_map
        }
    )