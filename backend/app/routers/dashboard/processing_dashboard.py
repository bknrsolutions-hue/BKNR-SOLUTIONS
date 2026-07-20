import logging
import re
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Form, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import and_, distinct, extract, func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.attendance import DailyAttendance, EmployeeRegistration, Shift
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
from app.utils.hr_workforce import active_employee_on
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

        if global_location and global_location.upper() != "ALL" and loc_field is not None:
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
    # The staff summary is a comparison of the active employee master against
    # attendance recorded for the selected date. A CLOSED attendance row means
    # the employee completed the shift; it must still count as present.
    employee_q = db.query(
        EmployeeRegistration.employee_id,
        EmployeeRegistration.department,
        EmployeeRegistration.designation,
    ).filter(
        EmployeeRegistration.company_id == company_id,
        active_employee_on(EmployeeRegistration, to_date),
    )

    # Apply location isolation while ensuring employees with active punches at the location are included
    g_loc_clean = global_location.strip().upper() if global_location else None

    active_punched_emp_ids = [
        r[0] for r in db.query(DailyAttendance.employee_id).filter(
            DailyAttendance.company_id == company_id,
            or_(
                DailyAttendance.duty_date == to_date,
                DailyAttendance.status != "CLOSED"
            )
        ).all()
    ]

    if g_loc_clean and g_loc_clean != "ALL":
        employee_q = employee_q.filter(
            or_(
                func.upper(func.trim(EmployeeRegistration.production_at)) == g_loc_clean,
                EmployeeRegistration.employee_id.in_(active_punched_emp_ids)
            )
        )

    employee_rows = employee_q.order_by(
        EmployeeRegistration.department,
        EmployeeRegistration.designation,
        EmployeeRegistration.employee_id,
    ).all()
    employee_ids = [row.employee_id for row in employee_rows]

    att_rows_q = db.query(DailyAttendance).filter(
        DailyAttendance.company_id == company_id,
        DailyAttendance.employee_id.in_(employee_ids),
        or_(
            DailyAttendance.duty_date == to_date,
            DailyAttendance.status != "CLOSED"
        )
    )

    if g_loc_clean and g_loc_clean != "ALL":
        att_rows_q = att_rows_q.filter(
            or_(
                func.upper(func.trim(DailyAttendance.production_at)) == g_loc_clean,
                DailyAttendance.production_at == None,
                func.trim(DailyAttendance.production_at) == ""
            )
        )

    # Keep one selected-date record per employee if legacy data contains
    # duplicates. The latest punch record represents the current/final state.
    attendance_by_employee = {}
    for attendance in att_rows_q.order_by(DailyAttendance.first_in, DailyAttendance.id).all():
        attendance_by_employee[attendance.employee_id] = attendance

    att_stats = {"total": len(employee_ids), "inside": 0, "away": 0, "half": 0, "single": 0, "double": 0}
    dept_map, desg_map = {}, {}

    for da in attendance_by_employee.values():
        attendance_status = str(da.status or "").strip().upper()
        if attendance_status == "OPEN":
            att_stats["inside"] += 1
        elif attendance_status == "AWAY":
            att_stats["away"] += 1

        wh = float(da.working_hours or 0)
        if attendance_status == "CLOSED":
            if wh >= 14:
                att_stats["double"] += 1
            elif wh >= 6:
                att_stats["single"] += 1
            elif wh >= 4:
                att_stats["half"] += 1

    present_employee_ids = set(attendance_by_employee)
    for employee_id, department, designation in employee_rows:
        d_name = str(department or "GENERAL").strip() or "GENERAL"
        ds_name = str(designation or "STAFF").strip() or "STAFF"
        attendance_key = "present" if employee_id in present_employee_ids else "absent"
        for m, key in [(dept_map, d_name), (desg_map, ds_name)]:
            if key not in m:
                m[key] = {"present": 0, "absent": 0}
            m[key][attendance_key] += 1

    # =====================================================
    # 5.5 SHIFT-WISE KPI ENGINE & DOUBLE DUTIES / OT
    # =====================================================
    from datetime import timedelta, time
    
    # 1. Fetch active shifts for this tenant
    db_shifts = db.query(Shift).filter(
        Shift.company_id == company_id,
        Shift.is_active == True
    )
    if global_location and global_location.upper() != "ALL":
        db_shifts = db_shifts.filter(func.upper(func.trim(Shift.production_at)) == global_location.strip().upper())
    shifts_list = db_shifts.all()
    
    # Fallback to unique shifts from today/yesterday or default if no shifts registered
    if not shifts_list:
        class VirtualShift:
            def __init__(self, name):
                self.shift_name = name
                self.start_time = None
                self.end_time = None
                self.is_night_shift = False
        shifts_list = [VirtualShift("GENERAL"), VirtualShift("SHIFT A"), VirtualShift("SHIFT B"), VirtualShift("SHIFT C")]
        
    yesterday_date = to_date - timedelta(days=1)
    shift_kpis = []
    current_time_dt = ist_now()
    
    for s in shifts_list:
        s_name = s.shift_name
        
        # Today's present/active employees in this shift
        today_att_q = db.query(DailyAttendance).filter(
            DailyAttendance.company_id == company_id,
            DailyAttendance.shift_name == s_name,
            or_(
                DailyAttendance.duty_date == to_date,
                DailyAttendance.status != "CLOSED"
            )
        )
        if global_location and global_location.upper() != "ALL":
            today_att_q = today_att_q.filter(
                or_(
                    func.upper(func.trim(DailyAttendance.production_at)) == global_location.strip().upper(),
                    DailyAttendance.production_at == None,
                    func.trim(DailyAttendance.production_at) == ""
                )
            )
        today_rows = today_att_q.all()
        
        # Yesterday's present list (Expectations list)
        yesterday_att_q = db.query(DailyAttendance).filter(
            DailyAttendance.company_id == company_id,
            DailyAttendance.shift_name == s_name,
            DailyAttendance.duty_date == yesterday_date
        )
        if global_location and global_location.upper() != "ALL":
            yesterday_att_q = yesterday_att_q.filter(
                or_(
                    func.upper(func.trim(DailyAttendance.production_at)) == global_location.strip().upper(),
                    DailyAttendance.production_at == None,
                    func.trim(DailyAttendance.production_at) == ""
                )
            )
        yesterday_rows = yesterday_att_q.all()
        
        present_count = len(today_rows)
        yesterday_count = len(yesterday_rows)
        
        # Expected = yesterday's presence count
        expected_count = yesterday_count
                
        # Check if shift time is done
        start = getattr(s, "start_time", None)
        end = getattr(s, "end_time", None)
        if not start or not end:
            defaults = {
                "SHIFT A": (time(6, 0), time(14, 0)),
                "SHIFT B": (time(14, 0), time(22, 0)),
                "SHIFT C": (time(22, 0), time(6, 0)),
                "GENERAL": (time(9, 0), time(17, 30))
            }
            start, end = defaults.get(s_name.upper(), (time(9, 0), time(17, 0)))
            
        now_time = current_time_dt.time()
        is_night = getattr(s, "is_night_shift", False) or (end < start)
        shift_done = False
        if is_night:
            shift_done = now_time >= end and now_time < start
        else:
            shift_done = now_time >= end
            
        # If shift is done, clear/finalize active count based on actual In & Out punches
        if shift_done:
            # Shift is done, present is actual punches, absent is expected - present
            absent_count = max(0, expected_count - present_count)
        else:
            # Shift is active/running
            absent_count = max(0, expected_count - present_count)
            
        inside_count = sum(1 for d in today_rows if d.status == "OPEN")
        break_count = sum(1 for d in today_rows if d.status == "AWAY")
        out_count = sum(1 for d in today_rows if d.status == "CLOSED")
        
        diff = present_count - yesterday_count
        diff_str = f"+{diff}" if diff > 0 else str(diff)
        
        shift_kpis.append({
            "name": s_name,
            "expected": expected_count,
            "present": present_count,
            "absent": absent_count,
            "inside": inside_count,
            "break": break_count,
            "out": out_count,
            "diff": diff_str
        })
        
    # Calculate double duties & OT count
    double_ot_q = db.query(DailyAttendance).filter(
        DailyAttendance.company_id == company_id,
        or_(
            DailyAttendance.duty_date == to_date,
            DailyAttendance.status != "CLOSED"
        ),
        or_(
            DailyAttendance.duty_type == "DOUBLE",
            DailyAttendance.calculated_ot_hours > 0,
            DailyAttendance.approved_ot_hours > 0
        )
    )
    if global_location and global_location.upper() != "ALL":
        double_ot_q = double_ot_q.filter(
            or_(
                func.upper(func.trim(DailyAttendance.production_at)) == global_location.strip().upper(),
                DailyAttendance.production_at == None,
                func.trim(DailyAttendance.production_at) == ""
            )
        )
    double_ot_val = double_ot_q.count()

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
            "double_ot_val": double_ot_val,
            "shift_kpis": shift_kpis,
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
            "double_ot_val": double_ot_val,
            "shift_kpis": shift_kpis,
            "dept_summary": dept_map,
            "desg_summary": desg_map,
            "from_date": from_date,
            "to_date": to_date,
            "hour_date": hour_date,
            "global_location": global_location or "", 
            "global_production_for": global_production_for or ""
        },
    )
