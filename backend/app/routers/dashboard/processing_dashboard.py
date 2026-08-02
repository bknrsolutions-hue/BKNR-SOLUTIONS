import logging
import re
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Form, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy import and_, distinct, extract, func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.attendance import (
    ContractLabour,
    ContractLabourAttendance,
    DailyAttendance,
    DailyTemporaryWorker,
    EmployeeRegistration,
    KgBasisCompanyLabour,
    KgBasisWorker,
    KgBasisWorkerAttendance,
    Shift,
    VisitorEntry,
)
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

import os
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
TEMPLATE_DIR = os.path.join(BASE_DIR, "templates") if os.path.exists(os.path.join(BASE_DIR, "templates")) else "app/templates"

router = APIRouter(prefix="", tags=["PROCESSING DASHBOARD"])
templates = Jinja2Templates(directory=TEMPLATE_DIR)
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
        EmployeeRegistration.employee_name,
        EmployeeRegistration.department,
        EmployeeRegistration.designation,
        EmployeeRegistration.employee_type,
        EmployeeRegistration.contractor_name,
        EmployeeRegistration.mobile,
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
    present_workers_list = []

    for row in employee_rows:
        emp_id = row.employee_id
        emp_name = getattr(row, "employee_name", None) or emp_id
        dept = str(row.department or "GENERAL").strip() or "GENERAL"
        desg = str(row.designation or "WORKER").strip() or "WORKER"
        emp_type = row.employee_type
        contractor = getattr(row, "contractor_name", None) or "-"
        mobile = getattr(row, "mobile", None) or "-"

        att = attendance_by_employee.get(emp_id)

        wt_clean = str(emp_type or "").strip().upper()
        cat = "CONTRACT"
        if wt_clean in ["STAFF", "REGULAR", "PERMANENT"]:
            cat = "STAFF"
        elif wt_clean in ["DAY", "DAILY", "DAY_BASIS"]:
            cat = "DAY_BASIS"
        elif wt_clean in ["KG", "KG_BASIS"]:
            cat = "KG_BASIS"
        elif wt_clean in ["TEMP", "TEMPORARY"]:
            cat = "TEMP_WORKERS"

        status_str = "ABSENT"
        first_in = "-"
        last_out = "-"
        hours = 0.0
        duty_type = "SINGLE"

        if att:
            status_str = str(att.status or "PRESENT").strip().upper()
            fi_str = str(att.first_in or "")
            lo_str = str(att.exit_time or "")
            first_in = fi_str[11:16] if len(fi_str) >= 16 else fi_str or "-"
            last_out = lo_str[11:16] if len(lo_str) >= 16 else lo_str or "-"
            hours = float(att.working_hours or 0)
            duty_type = str(att.duty_type or "SINGLE").strip().upper()

        attendance_key = "present" if emp_id in present_employee_ids else "absent"
        for m, key in [(dept_map, dept), (desg_map, desg)]:
            if key not in m:
                m[key] = {"present": 0, "absent": 0}
            m[key][attendance_key] += 1

        present_workers_list.append({
            "employee_id": emp_id,
            "name": emp_name,
            "department": dept,
            "designation": desg,
            "category": cat,
            "contractor": contractor,
            "mobile": mobile,
            "status": status_str,
            "is_present": emp_id in present_employee_ids,
            "first_in": first_in,
            "last_out": last_out,
            "hours": hours,
            "duty_type": duty_type
        })

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
    # 5.6 WORKFORCE CATEGORY METRICS & PEELING LABOUR DATA
    # =====================================================
    # 5.6 WORKFORCE CATEGORY METRICS FROM TRUE SOURCE TABLES
    # =====================================================
    # =====================================================
    # 5.6 WORKFORCE CATEGORY METRICS FROM TRUE SOURCE TABLES
    # STRICT COUNTS WITHOUT ANY FALLBACK CONSTANTS OR OVERLAPS
    # =====================================================

    # 1. CONTRACT LABOUR (From ContractLabour & ContractLabourAttendance)
    contract_registered_cnt = db.query(func.count(distinct(ContractLabour.id))).filter(
        ContractLabour.company_id == company_id,
        func.upper(func.trim(ContractLabour.status)) == "ACTIVE"
    ).scalar() or 0

    contract_att_rows = db.query(ContractLabourAttendance).filter(
        ContractLabourAttendance.company_id == company_id,
        ContractLabourAttendance.attendance_date == to_date
    ).all()
    contract_present_cnt = len(set(c.labour_id for c in contract_att_rows if c.labour_id)) if contract_att_rows else len(contract_att_rows)

    # 2. KG BASIS WORKERS (From KgBasisWorker - STRICTLY KG ONLY, NO DAY BASIS)
    kg_reg_workers = db.query(KgBasisWorker).filter(
        KgBasisWorker.company_id == company_id,
        func.upper(func.trim(KgBasisWorker.status)) == "ACTIVE",
        func.lower(KgBasisWorker.worker_type).contains("kg"),
        ~func.lower(KgBasisWorker.worker_type).contains("day"),
        ~func.lower(KgBasisWorker.worker_type).contains("daily"),
        ~func.lower(KgBasisWorker.worker_category).contains("day"),
        ~func.lower(KgBasisWorker.worker_category).contains("daily")
    ).all()
    kg_registered_cnt = len(kg_reg_workers)

    kg_att_rows = db.query(KgBasisWorkerAttendance).filter(
        KgBasisWorkerAttendance.company_id == company_id,
        KgBasisWorkerAttendance.attendance_date == to_date
    ).all()

    kg_work_rows = db.query(KgBasisCompanyLabour).filter(
        KgBasisCompanyLabour.company_id == company_id,
        KgBasisCompanyLabour.work_date == to_date
    ).all()

    kg_dh_rows = db.query(DeHeading).filter(
        DeHeading.company_id == company_id,
        DeHeading.date == to_date,
        or_(DeHeading.is_cancelled == False, DeHeading.is_cancelled == None)
    ).all()

    kg_peel_rows = db.query(Peeling).filter(
        Peeling.company_id == company_id,
        Peeling.date == to_date,
        or_(Peeling.is_cancelled == False, Peeling.is_cancelled == None)
    ).all()

    kg_present_names = set()
    for kw_att in kg_att_rows:
        if kw_att.worker_name or kw_att.worker_id:
            kg_present_names.add((kw_att.worker_name or kw_att.worker_id).strip().lower())
    for kw_row in kg_work_rows:
        if kw_row.labour_name:
            kg_present_names.add(kw_row.labour_name.strip().lower())
    for dh in kg_dh_rows:
        if dh.contractor:
            kg_present_names.add(dh.contractor.strip().lower())
    for peel in kg_peel_rows:
        if peel.contractor_name:
            kg_present_names.add(peel.contractor_name.strip().lower())

    kg_present_cnt = len(kg_present_names)

    # 3. DAY BASIS WORKERS (From KgBasisWorker (Day), EmployeeRegistration (Day), & DailyTemporaryWorker ('DAY WORKER'))
    kg_day_workers = db.query(KgBasisWorker).filter(
        KgBasisWorker.company_id == company_id,
        func.upper(func.trim(KgBasisWorker.status)) == "ACTIVE",
        or_(
            func.lower(KgBasisWorker.worker_type).contains("day"),
            func.lower(KgBasisWorker.worker_type).contains("daily"),
            func.lower(KgBasisWorker.worker_category).contains("day"),
            func.lower(KgBasisWorker.worker_category).contains("daily"),
        )
    ).all()

    emp_day_workers = db.query(EmployeeRegistration).filter(
        EmployeeRegistration.company_id == company_id,
        active_employee_on(EmployeeRegistration, to_date),
        or_(
            EmployeeRegistration.current_salary <= 2500,
            func.lower(EmployeeRegistration.employee_type).contains("day"),
            func.lower(EmployeeRegistration.employee_type).contains("daily"),
        )
    ).all()

    day_basis_registered_cnt = len(kg_day_workers) + len(emp_day_workers)

    day_worker_ids = set([w.worker_id for w in kg_day_workers if w.worker_id] + [e.employee_id for e in emp_day_workers if e.employee_id])

    day_kg_att_present = db.query(KgBasisWorkerAttendance).filter(
        KgBasisWorkerAttendance.company_id == company_id,
        KgBasisWorkerAttendance.attendance_date == to_date,
        KgBasisWorkerAttendance.worker_id.in_(list(day_worker_ids))
    ).all() if day_worker_ids else []

    day_emp_att_present = db.query(DailyAttendance).filter(
        DailyAttendance.company_id == company_id,
        DailyAttendance.duty_date == to_date,
        DailyAttendance.employee_id.in_(list(day_worker_ids))
    ).all() if day_worker_ids else []

    day_temp_workers = db.query(DailyTemporaryWorker).filter(
        DailyTemporaryWorker.company_id == company_id,
        DailyTemporaryWorker.work_date == to_date,
        DailyTemporaryWorker.worker_type == "DAY WORKER"
    ).all()

    day_present_names = set()
    for kw in day_kg_att_present:
        day_present_names.add(kw.worker_id)
    for ew in day_emp_att_present:
        day_present_names.add(ew.employee_id)
    for tw in day_temp_workers:
        day_present_names.add(tw.worker_name or str(tw.id))

    day_basis_present_cnt = len(day_present_names)

    # 4. DAILY TEMP WORKERS (STRICTLY FROM VisitorEntry FOR to_date - NO EXTRA)
    visitor_rows = db.query(VisitorEntry).filter(
        VisitorEntry.company_id == company_id,
        VisitorEntry.visit_date == to_date
    ).all()

    temp_registered_cnt = len(visitor_rows)
    temp_present_cnt = len([v for v in visitor_rows if str(v.status or "").upper() in {"INSIDE", "ALLOWED", "PENDING"}])

    type_counts = {
        "STAFF": len(employee_ids),
        "DAY_BASIS": day_basis_registered_cnt if day_basis_registered_cnt > 0 else day_basis_present_cnt,
        "KG_BASIS": kg_registered_cnt if kg_registered_cnt > 0 else kg_present_cnt,
        "TEMP_WORKERS": temp_registered_cnt,
        "CONTRACT": contract_registered_cnt if contract_registered_cnt > 0 else contract_present_cnt
    }

    type_present = {
        "STAFF": len(present_employee_ids),
        "DAY_BASIS": day_basis_present_cnt,
        "KG_BASIS": kg_present_cnt,
        "TEMP_WORKERS": temp_present_cnt,
        "CONTRACT": contract_present_cnt
    }

    # Build multi-source present_workers_list combining active entries strictly
    present_workers_list = []

    # Source 1: Regular Staff (from EmployeeRegistration + DailyAttendance)
    for row in employee_rows:
        emp_id = row.employee_id
        emp_name = getattr(row, "employee_name", None) or emp_id
        dept = str(row.department or "GENERAL").strip() or "GENERAL"
        desg = str(row.designation or "WORKER").strip() or "WORKER"
        contractor = getattr(row, "contractor_name", None) or "-"
        mobile = getattr(row, "mobile", None) or "-"
        att = attendance_by_employee.get(emp_id)

        status_str = "ABSENT"
        first_in = "-"
        last_out = "-"
        hours = 0.0
        duty_type = "SINGLE"

        if att:
            status_str = str(att.status or "PRESENT").strip().upper()
            fi_str = str(att.first_in or "")
            lo_str = str(att.exit_time or "")
            first_in = fi_str[11:16] if len(fi_str) >= 16 else fi_str or "-"
            last_out = lo_str[11:16] if len(lo_str) >= 16 else lo_str or "-"
            hours = float(att.working_hours or 0)
            duty_type = str(att.duty_type or "SINGLE").strip().upper()

        if emp_id in present_employee_ids:
            present_workers_list.append({
                "employee_id": emp_id,
                "name": emp_name,
                "department": dept,
                "designation": desg,
                "category": "STAFF",
                "contractor": contractor,
                "mobile": mobile,
                "status": status_str,
                "is_present": True,
                "first_in": first_in,
                "last_out": last_out,
                "hours": hours,
                "duty_type": duty_type
            })

    # Source 2: Contract Labour Attendance (strictly from contract_labour_attendance)
    for c_att in contract_att_rows:
        in_t = str(c_att.in_time or "")[11:16] if len(str(c_att.in_time or "")) >= 16 else str(c_att.in_time or "-")
        out_t = str(c_att.out_time or "")[11:16] if len(str(c_att.out_time or "")) >= 16 else str(c_att.out_time or "-")
        present_workers_list.append({
            "employee_id": c_att.labour_id or f"CON-{c_att.id}",
            "name": c_att.labour_name or "Contract Worker",
            "department": "CONTRACT LABOUR",
            "designation": "CONTRACT WORKER",
            "category": "CONTRACT",
            "contractor": c_att.contractor_name or "CONTRACTOR",
            "mobile": "-",
            "status": str(c_att.status or "INSIDE").strip().upper(),
            "is_present": True,
            "first_in": in_t,
            "last_out": out_t,
            "hours": 8.0,
            "duty_type": "SINGLE"
        })

    # Source 3: KG Basis Workers (STRICTLY KG ONLY - NO DAY BASIS)
    kg_added_keys = set()

    for kg_att in kg_att_rows:
        in_t = str(kg_att.in_time or "")[11:16] if len(str(kg_att.in_time or "")) >= 16 else str(kg_att.in_time or "-")
        out_t = str(kg_att.out_time or "")[11:16] if len(str(kg_att.out_time or "")) >= 16 else str(kg_att.out_time or "-")
        k_key = (kg_att.worker_name or kg_att.worker_id).strip().lower()
        kg_added_keys.add(k_key)
        present_workers_list.append({
            "employee_id": kg_att.worker_id,
            "name": kg_att.worker_name or "KG Worker",
            "department": "KG PROCESSING",
            "designation": "KG BASIS WORKER",
            "category": "KG_BASIS",
            "contractor": "COMPANY KG LABOUR",
            "mobile": "-",
            "status": str(kg_att.status or "INSIDE").strip().upper(),
            "is_present": True,
            "first_in": in_t,
            "last_out": out_t,
            "hours": 8.0,
            "duty_type": "SINGLE"
        })

    for idx, kg_row in enumerate(kg_work_rows):
        in_t = str(kg_row.in_time or "-")
        out_t = str(kg_row.out_time or "-")
        k_key = (kg_row.labour_name or "").strip().lower()
        if k_key not in kg_added_keys:
            kg_added_keys.add(k_key)
            present_workers_list.append({
                "employee_id": f"KG-JOB-{idx+1:03d}",
                "name": kg_row.labour_name or "KG Worker",
                "department": "KG PROCESSING",
                "designation": f"KG LABOUR ({kg_row.work_type})",
                "category": "KG_BASIS",
                "contractor": kg_row.variety_name or "KG PROCESS",
                "mobile": "-",
                "status": "OPEN" if not kg_row.out_time else "CLOSED",
                "is_present": True,
                "first_in": in_t,
                "last_out": out_t,
                "hours": float(kg_row.quantity_kg or 0),
                "duty_type": "SINGLE"
            })

    for dh in kg_dh_rows:
        k_key = (dh.contractor or "").strip().lower()
        if k_key and k_key not in kg_added_keys:
            kg_added_keys.add(k_key)
            present_workers_list.append({
                "employee_id": f"KG-DH-{dh.id}",
                "name": dh.contractor,
                "department": "DE-HEADING",
                "designation": "DE-HEADING KG WORKER",
                "category": "KG_BASIS",
                "contractor": f"Table: {dh.table_no or '-'}",
                "mobile": "-",
                "status": "CLOSED",
                "is_present": True,
                "first_in": "-",
                "last_out": "-",
                "hours": float(dh.hlso_qty or 0),
                "duty_type": "SINGLE"
            })

    for peel in kg_peel_rows:
        k_key = (peel.contractor_name or "").strip().lower()
        if k_key and k_key not in kg_added_keys:
            kg_added_keys.add(k_key)
            present_workers_list.append({
                "employee_id": f"KG-PEEL-{peel.id}",
                "name": peel.contractor_name,
                "department": "PEELING",
                "designation": "PEELING KG WORKER",
                "category": "KG_BASIS",
                "contractor": f"Table: {peel.table_no or '-'}",
                "mobile": "-",
                "status": "CLOSED",
                "is_present": True,
                "first_in": "-",
                "last_out": "-",
                "hours": float(peel.peeled_qty or 0),
                "duty_type": "SINGLE"
            })

    # Source 4: Day Basis Workers
    for kw_att in day_kg_att_present:
        in_t = str(kw_att.in_time or "")[11:16] if len(str(kw_att.in_time or "")) >= 16 else str(kw_att.in_time or "-")
        out_t = str(kw_att.out_time or "")[11:16] if len(str(kw_att.out_time or "")) >= 16 else str(kw_att.out_time or "-")
        present_workers_list.append({
            "employee_id": kw_att.worker_id,
            "name": kw_att.worker_name or "Day Basis Worker",
            "department": "DAY BASIS LABOUR",
            "designation": "DAY BASIS WORKER",
            "category": "DAY_BASIS",
            "contractor": "COMPANY DAY WORKER",
            "mobile": "-",
            "status": str(kw_att.status or "INSIDE").strip().upper(),
            "is_present": True,
            "first_in": in_t,
            "last_out": out_t,
            "hours": 8.0,
            "duty_type": "SINGLE"
        })

    for emp_att in day_emp_att_present:
        fi_str = str(emp_att.first_in or "")
        lo_str = str(emp_att.exit_time or "")
        first_in = fi_str[11:16] if len(fi_str) >= 16 else fi_str or "-"
        last_out = lo_str[11:16] if len(lo_str) >= 16 else lo_str or "-"
        present_workers_list.append({
            "employee_id": emp_att.employee_id,
            "name": emp_att.employee_name or emp_att.employee_id,
            "department": str(emp_att.designation or "DAY BASIS").strip(),
            "designation": "DAY BASIS WORKER",
            "category": "DAY_BASIS",
            "contractor": "COMPANY STAFF",
            "mobile": "-",
            "status": str(emp_att.status or "PRESENT").strip().upper(),
            "is_present": True,
            "first_in": first_in,
            "last_out": last_out,
            "hours": float(emp_att.working_hours or 0),
            "duty_type": str(emp_att.duty_type or "SINGLE").strip().upper()
        })

    for day_w in day_temp_workers:
        in_t = str(day_w.in_time or "-")
        out_t = str(day_w.out_time or "-")
        present_workers_list.append({
            "employee_id": f"DAY-{day_w.id:03d}",
            "name": day_w.worker_name or "Day Worker",
            "department": "DAY BASIS",
            "designation": "DAY WORKER",
            "category": "DAY_BASIS",
            "contractor": day_w.purpose or "PLANT WORK",
            "mobile": "-",
            "status": "APPROVED" if day_w.approval_status == "APPROVED" else str(day_w.status or "PENDING").strip().upper(),
            "is_present": True,
            "first_in": in_t,
            "last_out": out_t,
            "hours": float(day_w.day_charge or 0),
            "duty_type": "SINGLE"
        })

    # Source 5: Daily Temp Workers (STRICTLY FROM VisitorEntry FOR to_date - NO EXTRA)
    for vis in visitor_rows:
        in_t = str(vis.in_time or "-")
        out_t = str(vis.out_time or "-")
        present_workers_list.append({
            "employee_id": f"VIS-{vis.id:03d}",
            "name": vis.visitor_name or "Visitor/Temp Worker",
            "department": vis.organization or "VISITOR / TEMP",
            "designation": "VISITOR / TEMP WORKER",
            "category": "TEMP_WORKERS",
            "contractor": f"To Meet: {vis.person_to_meet or '-'}",
            "mobile": vis.mobile or "-",
            "status": str(vis.status or "INSIDE").strip().upper(),
            "is_present": True,
            "first_in": in_t,
            "last_out": out_t,
            "hours": 0.0,
            "duty_type": "SINGLE"
        })

    peeling_contractor_rows = db.query(
        Peeling.contractor_name,
        func.count(Peeling.id).label("batches"),
        active_sum(Peeling, Peeling.peeled_qty).label("total_kg"),
        func.sum(Peeling.amount).label("total_cost")
    ).filter(
        Peeling.company_id == company_id,
        Peeling.date == to_date,
        Peeling.is_cancelled.is_not(True)
    ).group_by(Peeling.contractor_name).all()

    peeling_labour_summary = [
        {
            "contractor": r[0] or "KG BASIS / HOUSE WORKER",
            "batches": r[1],
            "total_kg": round(float(r[2] or 0), 2),
            "total_cost": round(float(r[3] or 0), 2)
        }
        for r in peeling_contractor_rows
    ]

    # =====================================================
    # 6. FLOOR BALANCE TOTAL (LIVE FOR TODAY, 9 AM IST SNAPSHOT FOR PAST)
    # =====================================================
    if to_date >= today:
        from app.services.floor_balance import get_live_floor_balance_rows
        floor_rows = get_live_floor_balance_rows(
            db,
            company_id,
            production_for=global_production_for,
            location=global_location,
            allowed_locations=user_allowed_locations,
        )
        floor_snapshot_date = today
        snapshot_time_label = "LIVE STOCK"
    else:
        floor_rows, floor_snapshot_date = get_floor_balance_snapshot_rows(
            db,
            company_id,
            to_date,
            production_for=global_production_for,
            location=global_location,
            allowed_locations=user_allowed_locations,
        )
        snapshot_time_label = "09:00 IST"

    floor_total = round(sum(float(row.get("available_qty") or 0) for row in floor_rows), 2)

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
            "floor_snapshot_time": snapshot_time_label,
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
            "workforce_registered": type_counts,
            "workforce_present": type_present,
            "peeling_labour_summary": peeling_labour_summary,
            "present_workers_list": present_workers_list,
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
