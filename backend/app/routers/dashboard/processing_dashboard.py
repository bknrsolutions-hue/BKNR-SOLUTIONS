import logging
import re
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Form, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import and_, distinct, extract, func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.attendance import DailyAttendance, EmployeeRegistration
from app.database.models.processing import (
    DeHeading,
    GateEntry,
    Grading,
    Peeling,
    Production,
    RawMaterialPurchasing,
    Soaking,
)
from app.services.bill_accounting import ensure_bill_accounting_schema
from app.services.floor_balance import get_floor_balance_snapshot_rows
from app.utils.global_filters import get_global_filters
from app.utils.cancel_math import active_sum
from app.utils.timezone import ist_now

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
    location: str | None = Query(None),             # 🟢 🔴 ADDED: Direct Location Query Param
    production_for: str | None = Query(None),       # 🟢 🔴 ADDED: Direct Company Query Param
):
    # 1. SESSION SECURITY & GLOBAL FILTERS
    company_id = request.session.get("company_code")
    email = request.session.get("email")

    if not company_id or not email:
        if request.query_params.get("format") == "json":
            return JSONResponse({"status": "error", "message": "Session expired"}, status_code=401)
        return RedirectResponse("/auth/login", status_code=303)

    ensure_bill_accounting_schema(db)

    cookie_prod, cookie_loc = get_global_filters(request)

    def clean_filter_value(value):
        if value is None:
            return None
        value = str(value).strip()
        if not value or value.upper() == "ALL" or value.startswith("annotation="):
            return None
        return value
    
    # 🟢 🔴 FORCE OVERRIDE: URL Parameters > Cookies
    global_production_for = clean_filter_value(production_for if production_for is not None else cookie_prod)
    global_location = clean_filter_value(location if location is not None else cookie_loc)

    # Render servers commonly run in UTC. Dashboard business dates are IST.
    today = ist_now().date()

    from_date = from_date if isinstance(from_date, date) else None
    to_date = to_date if isinstance(to_date, date) else None
    hour_date = hour_date if isinstance(hour_date, date) else None

    if not to_date: to_date = today
    # With no explicit range, KPI cards represent one selected business date.
    if not from_date: from_date = to_date
    # One dashboard date controls both KPI totals and hourly charts.
    if not hour_date: hour_date = to_date

    session_locations = request.session.get("allowed_locations", [])
    if isinstance(session_locations, str):
        user_allowed_locations = [
            loc.strip().upper() for loc in session_locations.split(",") if loc.strip()
        ]
    else:
        user_allowed_locations = [
            str(loc).strip().upper() for loc in session_locations if str(loc).strip()
        ]

    # =====================================================
    # ⚡ HELPER FUNCTION FOR REUSABLE GLOBAL FILTER COUPLING
    # =====================================================
    def apply_dashboard_filters(query, model, date_col=None, use_today_only=False, is_hourly=False, target_date=None, is_floor_balance=False):
        # 1. Date Constraints Selection
        if not is_floor_balance and date_col is not None:
            if use_today_only:
                query = query.filter(date_col == today)
            elif is_hourly and target_date:
                query = query.filter(date_col == target_date)
            else:
                query = query.filter(date_col.between(from_date, to_date))

        # 2. Global Company Code Isolation
        query = query.filter(model.company_id == company_id)

        # 3. Global Production For Context Filter
        if global_production_for:
            if hasattr(model, "production_for"):
                query = query.filter(
                    func.upper(func.trim(model.production_for))
                    == global_production_for.strip().upper()
                )
            elif hasattr(model, "company_name"):
                query = query.filter(
                    func.upper(func.trim(model.company_name))
                    == global_production_for.strip().upper()
                )

        # 4. Global Location Context Filter
        loc_field = None
        if hasattr(model, "peeling_at"):
            loc_field = model.peeling_at
        elif hasattr(model, "processing_at"):
            loc_field = model.processing_at
        elif hasattr(model, "location"):
            loc_field = model.location

        if global_location and loc_field is not None:
            g_loc_clean = global_location.strip().upper()
            if g_loc_clean in ["FLOOR", "OTHER FLOOR"]:
                query = query.filter(
                    or_(
                        func.upper(func.trim(loc_field)) == "FLOOR",
                        func.upper(func.trim(loc_field)) == "OTHER FLOOR",
                        loc_field == None,
                        func.trim(loc_field) == "",
                    )
                )
            else:
                query = query.filter(func.upper(func.trim(loc_field)) == g_loc_clean)
        elif user_allowed_locations and loc_field is not None:
            query = query.filter(func.upper(func.trim(loc_field)).in_(user_allowed_locations))

        return query

    # =====================================================
    # 2. PROCESSING CARDS (SELECTED DATE / RANGE)
    # =====================================================
    def get_period_filtered_sum(model, column, date_col):
        # Dashboard KPIs represent active operational output. A cancelled row is
        # removed from the total; it is not a new negative production movement.
        q = db.query(active_sum(model, column))
        q = apply_dashboard_filters(q, model, date_col)
        return q.scalar() or 0

    # Gate Entry Count (selected date/range)
    gate_q = db.query(func.count(GateEntry.id)).filter(GateEntry.is_cancelled.is_not(True))
    gate_today = apply_dashboard_filters(gate_q, GateEntry, GateEntry.date).scalar() or 0

    # Metrics Cumulative Quantities (selected date/range)
    rmp_q = db.query(active_sum(RawMaterialPurchasing, RawMaterialPurchasing.received_qty))
    rmp_q = apply_dashboard_filters(rmp_q, RawMaterialPurchasing, RawMaterialPurchasing.date)
    rmp_today = rmp_q.scalar() or 0
    dh_today = get_period_filtered_sum(DeHeading, DeHeading.hoso_qty, DeHeading.date)
    grading_today = get_period_filtered_sum(Grading, Grading.quantity, Grading.date)
    peeling_today = get_period_filtered_sum(Peeling, Peeling.peeled_qty, Peeling.date)

    # Soaking Net Qty (In - Rejection, selected date/range)
    soak_base_q = db.query(active_sum(Soaking, Soaking.in_qty - Soaking.rejection_qty))
    soaking_today = apply_dashboard_filters(soak_base_q, Soaking, Soaking.date).scalar() or 0

    production_today = get_period_filtered_sum(Production, Production.production_qty, Production.date)

    # =====================================================
    # 3. RM PURCHASING SUMMARY (SELECTED DATE / RANGE)
    # =====================================================
    rm_summary_q = db.query(
        RawMaterialPurchasing.species,
        RawMaterialPurchasing.variety_name,
        RawMaterialPurchasing.count,
        active_sum(RawMaterialPurchasing, RawMaterialPurchasing.received_qty).label("total_qty"),
    )
    rm_summary_q = apply_dashboard_filters(rm_summary_q, RawMaterialPurchasing, RawMaterialPurchasing.date)
    rm_summary_query = rm_summary_q.group_by(
        RawMaterialPurchasing.species,
        RawMaterialPurchasing.variety_name,
        RawMaterialPurchasing.count,
    ).all()

    rm_summary = [
        {"species": r[0], "variety": r[1], "count": r[2], "qty": round(r[3], 2)}
        for r in rm_summary_query
    ]

    # =====================================================
    # 4. HOURLY DATA FOR 3 CHARTS (Hour Date Wise)
    # =====================================================
    def get_hourly_stats(model, column, date_col):
        data_q = db.query(extract("hour", model.time).label("hour"), active_sum(model, column).label("qty"))
        data_q = apply_dashboard_filters(data_q, model, date_col, use_today_only=False, is_hourly=True, target_date=hour_date)
        data = data_q.group_by("hour").all()

        hour_map = {int(r.hour): float(r.qty) for r in data}
        return [hour_map.get(h, 0.0) for h in range(24)]

    hourly_labels = [f"{h}:00" for h in range(24)]
    dh_hourly = get_hourly_stats(DeHeading, DeHeading.hoso_qty, DeHeading.date)
    peeling_hourly = get_hourly_stats(Peeling, Peeling.peeled_qty, Peeling.date)
    prod_hourly = get_hourly_stats(Production, Production.production_qty, Production.date)

    # =====================================================
    # 5. ATTENDANCE LOGIC
    # =====================================================
    att_rows_q = db.query(
        DailyAttendance, EmployeeRegistration.department, EmployeeRegistration.designation
    ).join(
        EmployeeRegistration,
        and_(
            DailyAttendance.employee_id == EmployeeRegistration.employee_id,
            DailyAttendance.company_id == EmployeeRegistration.company_id,
        ),
    )

    att_rows_q = att_rows_q.filter(
        DailyAttendance.company_id == company_id,
        or_(DailyAttendance.duty_date == to_date, DailyAttendance.status != "CLOSED"),
    )

    # 🟢 🔴 FIX: Apply Strict Location Isolation for Attendance
    g_loc_clean = global_location.strip().upper() if global_location else None
    
    if g_loc_clean and g_loc_clean != "ALL":
        att_rows_q = att_rows_q.filter(func.upper(func.trim(DailyAttendance.production_at)) == g_loc_clean)
    elif user_allowed_locations:
        att_rows_q = att_rows_q.filter(func.upper(func.trim(DailyAttendance.production_at)).in_(user_allowed_locations))

    att_rows = att_rows_q.all()

    att_stats = {"total": len(att_rows), "inside": 0, "away": 0, "half": 0, "single": 0, "double": 0}
    dept_map, desg_map = {}, {}

    for da, dept, desg in att_rows:
        if da.status == "OPEN":
            att_stats["inside"] += 1
        elif da.status == "AWAY":
            att_stats["away"] += 1

        wh = float(da.working_hours or 0)
        if da.status == "CLOSED":
            if wh >= 14:
                att_stats["double"] += 1
            elif wh >= 6:
                att_stats["single"] += 1
            elif wh >= 4:
                att_stats["half"] += 1

        d_name = dept or "GENERAL"
        ds_name = desg or "STAFF"

        for m, key in [(dept_map, d_name), (desg_map, ds_name)]:
            if key not in m:
                m[key] = {"active": 0, "closed": 0}
            if da.status == "CLOSED":
                m[key]["closed"] += 1
            else:
                m[key]["active"] += 1

    # =====================================================
    # 6. FLOOR BALANCE TOTAL (SELECTED DATE, 9 AM IST SNAPSHOT)
    # =====================================================
    floor_snapshot_rows, floor_snapshot_date = get_floor_balance_snapshot_rows(
        db,
        company_id,
        to_date,
        production_for=global_production_for,
        location=global_location,
        allowed_locations=user_allowed_locations,
    )
    floor_total = round(sum(float(row.get("available_qty") or 0) for row in floor_snapshot_rows), 2)

    # 7. RESPONSE PAYLOAD
    if request.query_params.get("format") == "json":
        return JSONResponse({
            "status": "success",
            "gate_today": gate_today,
            "rmp_today": round(rmp_today, 2),
            "dh_today": round(dh_today, 2),
            "grading_today": round(grading_today, 2),
            "peeling_today": round(peeling_today, 2),
            "soaking_today": round(soaking_today, 2),
            "production_today": round(production_today, 2),
            "floor_total": floor_total,
            "floor_snapshot_date": str(floor_snapshot_date) if floor_snapshot_date else "",
            "floor_snapshot_time": "09:00 IST",
            "rm_summary": rm_summary,
            "hourly_labels": hourly_labels,
            "dh_hourly_data": dh_hourly,
            "peeling_hourly_data": peeling_hourly,
            "prod_hourly_data": prod_hourly,
            "att_stats": att_stats,
            "dept_summary": dept_map,
            "desg_summary": desg_map,
            "from_date": str(from_date),
            "to_date": str(to_date),
            "hour_date": str(hour_date),
            "global_location": global_location or "",
            "global_production_for": global_production_for or ""
        })

    return templates.TemplateResponse(
        request=request,
        name="dashboard/processing_dashboard.html",
        context={
            "email": email,
            "company_id": company_id,
            "gate_today": gate_today,
            "rmp_today": round(rmp_today, 2),
            "dh_today": round(dh_today, 2),
            "grading_today": round(grading_today, 2),
            "peeling_today": round(peeling_today, 2),
            "soaking_today": round(soaking_today, 2),
            "production_today": round(production_today, 2),
            "floor_total": floor_total,
            "floor_snapshot_date": floor_snapshot_date,
            "floor_snapshot_time": "09:00 IST",
            "rm_summary": rm_summary,
            "hourly_labels": hourly_labels,
            "dh_hourly_data": dh_hourly,
            "peeling_hourly_data": peeling_hourly,
            "prod_hourly_data": prod_hourly,
            "att_stats": att_stats,
            "dept_summary": dept_map,
            "desg_summary": desg_map,
            "from_date": from_date,
            "to_date": to_date,
            "hour_date": hour_date,
            "global_location": global_location or "", 
            "global_production_for": global_production_for or ""
        },
    )
