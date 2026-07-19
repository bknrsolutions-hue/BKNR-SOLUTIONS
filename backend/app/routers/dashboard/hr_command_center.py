# app/routers/dashboard/hr_command_center.py

from fastapi import APIRouter, Request, Depends, Form, Query, status
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, case, cast, Date, text
from datetime import date, datetime, timedelta
import logging
from collections import defaultdict

from app.database import get_db
# 🟢 HR Master Models
from app.database.models.attendance import (
    EmployeeRegistration, 
    DailyAttendance, 
    EmployeeIncrement, 
    EmployeeStatutoryMaster, 
    EmployeeSalaryAdvance
)
# 🟢 Production Models for "Labour Cost vs Production" Logic
from app.database.models.processing import Peeling, Production, Grading, Soaking, DeHeading
from app.services.bill_accounting import ensure_bill_accounting_schema
from app.database.models.criteria import contractors
from app.database.models.processing import AuditLog
from app.services.bill_accounting import post_contractor_source_charge
# 🟢 Global Filters
from app.utils.global_filters import get_global_filters
from app.utils.hr_workforce import active_employee_on
from app.utils.timezone import ist_now

router = APIRouter(tags=["ENTERPRISE HR COMMAND CENTER"])
templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)

# Official Andhra Pradesh / Central Government holiday calendar dates used by
# the dashboard. Keep dated entries here so movable festivals are never
# calculated approximately.
FESTIVAL_CALENDAR = (
    ("2026-08-15", "Independence Day", "fa-flag", "saffron", "independence-day.png"),
    ("2026-08-26", "Milad-un-Nabi", "fa-mosque", "emerald", "milad-un-nabi.png"),
    ("2026-09-14", "Ganesh Chaturthi", "fa-om", "rose", "ganesh-chaturthi.png"),
    ("2026-10-02", "Mahatma Gandhi Jayanti", "fa-glasses", "sky", "gandhi-jayanti.png"),
    ("2026-10-20", "Dussehra", "fa-shield-halved", "violet", "dussehra.png"),
    ("2026-11-08", "Diwali", "fa-fire-flame-curved", "amber", "diwali.png"),
    ("2026-11-24", "Guru Nanak Jayanti", "fa-khanda", "indigo", "guru-nanak-jayanti.png"),
    ("2026-12-25", "Christmas Day", "fa-tree", "green", "christmas-day.png"),
)


def get_upcoming_festivals(today: date, limit: int = 6) -> list[dict]:
    upcoming = []
    for date_text, name, icon, tone, image_name in FESTIVAL_CALENDAR:
        festival_date = date.fromisoformat(date_text)
        if festival_date >= today:
            upcoming.append({
                "name": name,
                "date": festival_date,
                "day": festival_date.strftime("%A"),
                "days_remaining": (festival_date - today).days,
                "icon": icon,
                "tone": tone,
                "image_url": f"/static/images/festivals/{image_name}",
            })
    return upcoming[:limit]


def clean_filter_value(value):
    if value is None:
        return None
    value = str(value).strip()
    if not value or value.upper() == "ALL" or value.startswith("annotation="):
        return None
    return value


def ensure_hr_dashboard_schema(db: Session) -> None:
    db.execute(text(
        "ALTER TABLE daily_attendance "
        "ADD COLUMN IF NOT EXISTS approved_duty_credit DOUBLE PRECISION DEFAULT 0"
    ))
    db.flush()


def get_shift_required_hours(db: Session, company_id: str, shift_name: str) -> float:
    from app.database.models.attendance import Shift

    shift = db.query(Shift).filter(
        Shift.company_id == company_id,
        Shift.shift_name == (shift_name or "GENERAL"),
    ).first()
    if not shift or not shift.start_time or not shift.end_time:
        return 8.0
    start_dt = datetime.combine(date.today(), shift.start_time)
    end_dt = datetime.combine(date.today(), shift.end_time)
    if end_dt < start_dt:
        end_dt += timedelta(days=1)
    hours = (end_dt - start_dt).total_seconds() / 3600.0
    break_hours = (shift.break_minutes or 0) / 60.0
    return max(1.0, hours - break_hours)


def attendance_payable_credit(working_hours: float, required_hours: float) -> float:
    raw_credit = float(working_hours or 0.0) / required_hours if required_hours > 0 else 0.0
    if raw_credit < 0.5:
        return 0.0
    if raw_credit < 1.0:
        return 0.5
    if raw_credit < 1.5:
        return 1.0
    if raw_credit < 2.0:
        return 1.5
    if raw_credit < 2.5:
        return 2.0
    if raw_credit < 3.0:
        return 2.5
    return 3.0


def contractor_gst_percent(db: Session, company_id: str, contractor_name: str) -> float:
    row = db.query(contractors).filter(
        contractors.company_id == company_id,
        contractors.contractor_name == contractor_name,
    ).first()
    return float(row.gst_percent or 0) if row else 0.0


def auto_close_stale_attendance(
    db: Session,
    company_id: str,
    email: str,
    location: str | None = None,
    allowed_locations: list[str] | None = None,
) -> None:
    now = ist_now()
    cutoff = now.replace(tzinfo=None) - timedelta(hours=24)
    query = db.query(DailyAttendance).filter(
        DailyAttendance.company_id == company_id,
        DailyAttendance.status != "CLOSED",
        DailyAttendance.first_in != None,
        DailyAttendance.first_in <= cutoff,
    )
    if location and location != "ALL":
        query = query.filter(func.upper(func.trim(DailyAttendance.production_at)) == location)
    elif allowed_locations:
        query = query.filter(func.upper(func.trim(DailyAttendance.production_at)).in_(allowed_locations))

    for duty in query.all():
        close_time = duty.first_in + timedelta(hours=24)
        safe_close = close_time.replace(tzinfo=None)
        safe_first_in = duty.first_in.replace(tzinfo=None) if duty.first_in else safe_close
        wh = round(min(24.0, max(0.0, (safe_close - safe_first_in).total_seconds() / 3600)), 2)
        duty.working_hours = wh
        duty.exit_time = close_time
        duty.status = "CLOSED"
        duty.duty_type = "DOUBLE"
        duty.calculated_ot_hours = 8.0
        duty.ot_status = "PENDING"
        duty.approved_ot_hours = 0.0
        duty.duty_status = "PENDING"
        duty.duty_approved_by = None
        movements = list(duty.movements) if duty.movements else []
        movements.append({"type": "AUTO OUT", "time": close_time.strftime("%H:%M"), "date": close_time.strftime("%Y-%m-%d")})
        duty.movements = movements
        db.add(AuditLog(
            table_name="daily_attendance",
            record_id=duty.id,
            company_id=company_id,
            field_name="AUTO_OUT_24H",
            old_value="OPEN",
            new_value=f"Emp: {duty.employee_name} ({duty.employee_id}) | Auto closed after 24 hours | Duty approval pending",
            edited_by=email or "SYSTEM",
            edited_at=datetime.now(),
        ))


# ============================================================
# ⚡ HELPER: LOCATION SCOPE BOUNDING UTILITY
# ============================================================
def get_secure_hr_scope(db: Session, comp_code: str, global_location: str | None, user_allowed_locations: list):
    clean_location = clean_filter_value(global_location)
    g_loc_clean = clean_location.upper() if clean_location else None
    emp_loc_col = getattr(EmployeeRegistration, 'production_at', getattr(EmployeeRegistration, 'location', getattr(EmployeeRegistration, 'branch', None)))
    
    emp_base_q = db.query(EmployeeRegistration.employee_id).filter(EmployeeRegistration.company_id == comp_code)
    
    if emp_loc_col is not None:
        if g_loc_clean and g_loc_clean != "ALL":
            emp_base_q = emp_base_q.filter(func.upper(func.trim(emp_loc_col)) == g_loc_clean)
        elif user_allowed_locations:
            emp_base_q = emp_base_q.filter(func.upper(func.trim(emp_loc_col)).in_(user_allowed_locations))
            
    return emp_base_q, g_loc_clean, emp_loc_col


# ============================================================
# 🖥️ 1. MAIN HR COMMAND CENTER ROUTE
# ============================================================
@router.get("/hr_command_center", response_class=HTMLResponse)
def hr_command_center(
    request: Request,
    db: Session = Depends(get_db),
    dept_filter: str = Query("", description="Filter by Department"),
    type_filter: str = Query("", description="Filter by Employee Type"),
    status_filter: str = Query("", description="Filter by Status"),
    location: str | None = Query(None)  
):
    email = request.session.get("email")
    comp_code = request.session.get("company_code")

    if not email or not comp_code:
        return RedirectResponse(url="/auth/login", status_code=status.HTTP_303_SEE_OTHER)

    ensure_hr_dashboard_schema(db)
    db.commit()

    dept_filter = clean_filter_value(dept_filter) or ""
    type_filter = clean_filter_value(type_filter) or ""
    status_filter = clean_filter_value(status_filter) or ""

    _, cookie_loc = get_global_filters(request)
    global_location = clean_filter_value(location if location is not None else cookie_loc)

    session_locations = request.session.get("allowed_locations", [])
    user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()] if isinstance(session_locations, str) else [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]

    today = ist_now().date()
    start_of_month = today.replace(day=1)
    current_year = today.year
    upcoming_festivals = get_upcoming_festivals(today)

    try:
        allowed_emp_ids, g_loc_clean, emp_loc_col = get_secure_hr_scope(db, comp_code, global_location, user_allowed_locations)

        def secure_hr(query, model):
            query = query.filter(model.company_id == comp_code)
            if model == EmployeeRegistration:
                if emp_loc_col is not None:
                    if g_loc_clean and g_loc_clean != "ALL": query = query.filter(func.upper(func.trim(emp_loc_col)) == g_loc_clean)
                    elif user_allowed_locations: query = query.filter(func.upper(func.trim(emp_loc_col)).in_(user_allowed_locations))
            else:
                query = query.filter(model.employee_id.in_(allowed_emp_ids))
            return query

        base_emp = secure_hr(db.query(EmployeeRegistration), EmployeeRegistration)
        base_att = secure_hr(db.query(DailyAttendance), DailyAttendance)
        base_stat = secure_hr(db.query(EmployeeStatutoryMaster), EmployeeStatutoryMaster)
        active_status = active_employee_on(EmployeeRegistration, today)
        inactive_status = func.upper(func.trim(EmployeeRegistration.status)) == "INACTIVE"

        # ---------------------------------------------------------
        # 🌟 1. EXECUTIVE WORKFORCE SUMMARY (12 PREMIUM KPIs)
        # ---------------------------------------------------------
        total_employees = base_emp.count()
        active_employees = base_emp.filter(active_status).count()
        present_today = base_att.filter(DailyAttendance.duty_date == today).with_entities(
            func.count(func.distinct(DailyAttendance.employee_id))
        ).scalar() or 0
        half_day_today = base_att.filter(
            DailyAttendance.duty_date == today,
            or_(
                func.upper(func.trim(DailyAttendance.duty_type)) == "HALF",
                and_(
                    func.upper(func.trim(DailyAttendance.status)) == "CLOSED",
                    DailyAttendance.working_hours >= 4,
                    DailyAttendance.working_hours < 8,
                ),
            ),
        ).with_entities(func.count(func.distinct(DailyAttendance.employee_id))).scalar() or 0
        ot_workers_today = base_att.filter(
            DailyAttendance.duty_date == today,
            DailyAttendance.calculated_ot_hours > 0,
        ).with_entities(func.count(func.distinct(DailyAttendance.employee_id))).scalar() or 0
        absent_today = max(0, active_employees - present_today)
        present_pct = (present_today / active_employees * 100) if active_employees > 0 else 0.0

        contract_count = base_emp.filter(and_(
            active_status,
            func.upper(func.trim(EmployeeRegistration.employee_type)).in_(["CONTRACT", "CONTRACTOR"]),
        )).count()
        perm_count = active_employees - contract_count
        contract_pct = (contract_count / active_employees * 100) if active_employees > 0 else 0.0
        perm_pct = (perm_count / active_employees * 100) if active_employees > 0 else 0.0

        ot_hours_today = base_att.filter(DailyAttendance.duty_date == today).with_entities(func.coalesce(func.sum(DailyAttendance.calculated_ot_hours), 0.0)).scalar()

        # Labor Cost Today & Productivity
        present_emps = db.query(EmployeeRegistration.employee_id, EmployeeRegistration.current_salary).join(
            DailyAttendance, DailyAttendance.employee_id == EmployeeRegistration.employee_id
        ).filter(and_(
            EmployeeRegistration.company_id == comp_code,
            DailyAttendance.company_id == comp_code,
            DailyAttendance.duty_date == today,
            DailyAttendance.employee_id.in_(allowed_emp_ids),
        )).group_by(EmployeeRegistration.employee_id, EmployeeRegistration.current_salary).all()
        
        labor_cost_today = sum([(emp.current_salary or 0) / 30 for emp in present_emps])
        avg_salary = base_emp.filter(active_status).with_entities(func.coalesce(func.avg(EmployeeRegistration.current_salary), 0.0)).scalar()

        total_working_hours = base_att.filter(DailyAttendance.duty_date == today).with_entities(func.coalesce(func.sum(DailyAttendance.working_hours), 0.0)).scalar()
        employee_productivity = (total_working_hours / (present_today * 8) * 100) if present_today > 0 else 0.0

        resigned_this_year = base_emp.filter(and_(EmployeeRegistration.resignation_date >= date(current_year, 1, 1), inactive_status)).count()
        attrition_rate = (resigned_this_year / total_employees * 100) if total_employees > 0 else 0.0

        # Production KG Fetch for Cost/KG
        def get_prod_kg(model, field):
            q = db.query(func.coalesce(func.sum(field), 0.0)).filter(and_(model.company_id == comp_code, model.date == today))
            location_col = getattr(model, 'production_at', None)
            if location_col is None:
                location_col = getattr(model, 'peeling_at', None)
            if location_col is not None:
                if g_loc_clean and g_loc_clean != "ALL":
                    q = q.filter(func.upper(func.trim(location_col)) == g_loc_clean)
                elif user_allowed_locations:
                    q = q.filter(func.upper(func.trim(location_col)).in_(user_allowed_locations))
            return q.scalar()

        total_prod_kg = get_prod_kg(Production, Production.production_qty) + get_prod_kg(Peeling, Peeling.peeled_qty)
        cost_per_kg = (labor_cost_today / total_prod_kg) if total_prod_kg > 0 else 0.0

        # ---------------------------------------------------------
        # 🌟 2. ATTENDANCE HEAT MAP (Last 7 Days by Dept)
        # ---------------------------------------------------------
        past_7_days = [today - timedelta(days=i) for i in range(6, -1, -1)]
        heatmap_data = {}
        depts = base_emp.with_entities(EmployeeRegistration.department).distinct().all()
        dept_names = [d[0] for d in depts if d[0]]

        for d_name in dept_names:
            heatmap_data[d_name] = []
            for day in past_7_days:
                c = db.query(func.count(func.distinct(DailyAttendance.employee_id))).join(EmployeeRegistration, DailyAttendance.employee_id == EmployeeRegistration.employee_id).filter(
                    and_(DailyAttendance.company_id == comp_code, DailyAttendance.duty_date == day, EmployeeRegistration.department == d_name, DailyAttendance.employee_id.in_(allowed_emp_ids))
                ).scalar()
                heatmap_data[d_name].append(c)

        # ---------------------------------------------------------
        # 🌟 3. SHIFT PERFORMANCE DASHBOARD
        # ---------------------------------------------------------
        shift_aggs = base_att.filter(DailyAttendance.duty_date == today).with_entities(
            DailyAttendance.shift_name,
            func.count(func.distinct(DailyAttendance.employee_id)).label("emp_count"),
            func.sum(DailyAttendance.working_hours).label("total_hrs"),
            func.sum(DailyAttendance.calculated_ot_hours).label("ot_hrs")
        ).group_by(DailyAttendance.shift_name).all()

        shift_performance = []
        for s in shift_aggs:
            s_name = s.shift_name or "GENERAL"
            emp_c = s.emp_count or 0
            eff = ((s.total_hrs or 0) / (emp_c * 8) * 100) if emp_c > 0 else 0.0
            shift_performance.append({
                "shift": s_name,
                "employees": emp_c,
                "ot_hrs": round(s.ot_hrs or 0, 1),
                "avg_hrs": round((s.total_hrs or 0) / emp_c, 1) if emp_c > 0 else 0.0,
                "efficiency": round(eff, 1),
            })

        # ---------------------------------------------------------
        # 🌟 4. DEPARTMENT COST CENTER
        # ---------------------------------------------------------
        dept_cost_data = base_emp.filter(active_status).with_entities(
            EmployeeRegistration.department,
            func.count(EmployeeRegistration.id).label("emps"),
            func.sum(EmployeeRegistration.current_salary).label("total_sal"),
            func.avg(EmployeeRegistration.current_salary).label("avg_sal")
        ).group_by(EmployeeRegistration.department).all()

        total_comp_sal = sum([d.total_sal or 0 for d in dept_cost_data])
        dept_cost_center = []
        for d in dept_cost_data:
            pct = ((d.total_sal or 0) / total_comp_sal * 100) if total_comp_sal > 0 else 0.0
            dept_cost_center.append({
                "dept": d.department or "N/A", "emps": d.emps, "total_sal": d.total_sal or 0, "avg_sal": d.avg_sal or 0, "cost_pct": round(pct, 1)
            })

        # ---------------------------------------------------------
        # 🌟 5. CONTRACTOR ANALYTICS
        # ---------------------------------------------------------
        contractor_data = base_emp.filter(and_(
            active_status,
            func.upper(func.trim(EmployeeRegistration.employee_type)).in_(["CONTRACT", "CONTRACTOR"]),
        )).with_entities(
            EmployeeRegistration.contractor_name,
            func.count(EmployeeRegistration.id).label("manpower"),
            func.sum(EmployeeRegistration.current_salary).label("salary")
        ).group_by(EmployeeRegistration.contractor_name).all()

        contractor_analytics = []
        for c in contractor_data:
            c_name = c.contractor_name or "DIRECT/UNKNOWN"
            c_present = db.query(func.count(func.distinct(DailyAttendance.employee_id))).join(EmployeeRegistration, DailyAttendance.employee_id == EmployeeRegistration.employee_id).filter(
                and_(DailyAttendance.company_id == comp_code, DailyAttendance.duty_date == today, EmployeeRegistration.contractor_name == c.contractor_name, DailyAttendance.employee_id.in_(allowed_emp_ids))
            ).scalar() or 0
            
            prod_score = (c_present / c.manpower * 100) if c.manpower > 0 else 0.0
            contractor_analytics.append({
                "name": c_name, "manpower": c.manpower, "present": c_present, "salary": c.salary or 0, "productivity": round(prod_score, 1)
            })

        # ---------------------------------------------------------
        # 🌟 6. OT APPROVAL CENTER
        # ---------------------------------------------------------
        ot_data = base_att.with_entities(
            DailyAttendance.ot_status,
            func.sum(DailyAttendance.calculated_ot_hours).label("calc_ot"),
            func.sum(DailyAttendance.approved_ot_hours).label("appr_ot")
        ).group_by(DailyAttendance.ot_status).all()

        ot_center = {"PENDING": 0, "APPROVED": 0, "REJECTED": 0, "TOTAL_COST": 0}
        for o in ot_data:
            st = str(o.ot_status).upper() if o.ot_status else "PENDING"
            val = o.calc_ot if st == "PENDING" else o.appr_ot
            if st in ot_center: ot_center[st] = val or 0
            ot_center["TOTAL_COST"] += (val or 0) * (avg_salary / 240 * 1.5)

        # ---------------------------------------------------------
        # 🌟 7. STATUTORY COMPLIANCE & RISK CENTER
        # ---------------------------------------------------------
        def distinct_stat_count(query):
            return query.with_entities(func.count(func.distinct(EmployeeStatutoryMaster.employee_id))).scalar() or 0

        active_stat = func.upper(func.trim(EmployeeStatutoryMaster.status)) == "ACTIVE"
        pf_covered = distinct_stat_count(base_stat.filter(EmployeeStatutoryMaster.pf_applicable == True, active_stat))
        esi_covered = distinct_stat_count(base_stat.filter(EmployeeStatutoryMaster.esi_applicable == True, active_stat))
        pt_covered = distinct_stat_count(base_stat.filter(EmployeeStatutoryMaster.pt_applicable == True, active_stat))
        stat_pf_na = distinct_stat_count(base_stat.filter(EmployeeStatutoryMaster.pf_applicable == False, active_stat))
        stat_missing_uan = distinct_stat_count(base_stat.filter(EmployeeStatutoryMaster.pf_applicable == True, or_(EmployeeStatutoryMaster.uan_number == None, EmployeeStatutoryMaster.uan_number == "")))
        stat_missing_esi = distinct_stat_count(base_stat.filter(EmployeeStatutoryMaster.esi_applicable == True, or_(EmployeeStatutoryMaster.esi_number == None, EmployeeStatutoryMaster.esi_number == "")))
        
        pf_coverage_pct = (pf_covered / active_employees * 100) if active_employees > 0 else 0.0
        esi_coverage_pct = (esi_covered / active_employees * 100) if active_employees > 0 else 0.0
        pt_coverage_pct = (pt_covered / active_employees * 100) if active_employees > 0 else 0.0

        risk_no_pan = base_emp.filter(or_(EmployeeRegistration.pan_number == None, EmployeeRegistration.pan_number == "")).count()
        risk_no_aadhar = base_emp.filter(or_(EmployeeRegistration.aadhar_number == None, EmployeeRegistration.aadhar_number == "")).count()
        risk_no_bank = base_emp.filter(or_(EmployeeRegistration.account_number == None, EmployeeRegistration.account_number == "")).count()
        risk_no_photo = base_emp.filter(or_(EmployeeRegistration.photo_path == None, EmployeeRegistration.photo_path == "")).count()
        risk_no_mobile = base_emp.filter(or_(EmployeeRegistration.mobile == None, EmployeeRegistration.mobile == "")).count()
        risk_no_email = base_emp.filter(and_(
            or_(EmployeeRegistration.email == None, EmployeeRegistration.email == ""),
            or_(EmployeeRegistration.personal_email == None, EmployeeRegistration.personal_email == ""),
            or_(EmployeeRegistration.official_email == None, EmployeeRegistration.official_email == ""),
        )).count()
        
        stat_emp_ids = secure_hr(db.query(EmployeeStatutoryMaster.employee_id), EmployeeStatutoryMaster)
        risk_missing_statutory = base_emp.filter(~EmployeeRegistration.employee_id.in_(stat_emp_ids)).count()

        # ---------------------------------------------------------
        # 🌟 8. BIRTHDAY / ANNIVERSARY (Upcoming 7 & 30 Days)
        # ---------------------------------------------------------
        active_employee_rows = base_emp.filter(active_status).all()

        def next_annual_date(source_date):
            if not source_date:
                return None
            try:
                candidate = source_date.replace(year=today.year)
            except ValueError:  # 29-Feb in a non-leap year
                candidate = date(today.year, 2, 28)
            if candidate < today:
                try:
                    candidate = source_date.replace(year=today.year + 1)
                except ValueError:
                    candidate = date(today.year + 1, 2, 28)
            return candidate

        def get_upcoming(attribute_name, days):
            end_date = today + timedelta(days=days)
            matches = []
            for employee in active_employee_rows:
                candidate = next_annual_date(getattr(employee, attribute_name, None))
                if candidate and today <= candidate <= end_date:
                    matches.append(employee)
            return matches

        bday_7 = get_upcoming("dob", 7)
        bday_30 = get_upcoming("dob", 30)
        anniv_7 = get_upcoming("joining_date", 7)

        # ---------------------------------------------------------
        # 🌟 9. SALARY ADVANCE CONTROL TOWER
        # ---------------------------------------------------------
        base_adv = secure_hr(db.query(EmployeeSalaryAdvance), EmployeeSalaryAdvance)
        adv_ytd = base_adv.filter(
            EmployeeSalaryAdvance.advance_date >= date(current_year, 1, 1),
            EmployeeSalaryAdvance.advance_date <= today,
        )
        adv_agg = adv_ytd.with_entities(
            func.sum(EmployeeSalaryAdvance.advance_amount).label("issued"),
            func.sum(EmployeeSalaryAdvance.remaining_balance).label("balance"),
            func.sum(EmployeeSalaryAdvance.paid_amount).label("recovered")
        ).first()

        adv_issued = adv_agg.issued or 0
        adv_balance = adv_agg.balance or 0
        adv_recovered = adv_agg.recovered or 0
        adv_recovery_pct = (adv_recovered / adv_issued * 100) if adv_issued > 0 else 0.0

        top_10_advances = base_adv.filter(EmployeeSalaryAdvance.remaining_balance > 0).order_by(EmployeeSalaryAdvance.remaining_balance.desc()).limit(10).all()

        # ---------------------------------------------------------
        # 🌟 10. ARRAYS FOR CHARTING 
        # ---------------------------------------------------------
        work_hours_ranges = secure_hr(db.query(
            func.count(case((DailyAttendance.working_hours < 4, DailyAttendance.id))).label("under_4"),
            func.count(case((and_(DailyAttendance.working_hours >= 4, DailyAttendance.working_hours <= 8), DailyAttendance.id))).label("mid_4_8"),
            func.count(case((and_(DailyAttendance.working_hours > 8, DailyAttendance.working_hours <= 12), DailyAttendance.id))).label("high_8_12"),
            func.count(case((DailyAttendance.working_hours > 12, DailyAttendance.id))).label("over_12")
        ).filter(DailyAttendance.duty_date == today), DailyAttendance).first()
        productivity_data = [int(work_hours_ranges.under_4 or 0), int(work_hours_ranges.mid_4_8 or 0), int(work_hours_ranges.high_8_12 or 0), int(work_hours_ranges.over_12 or 0)]

        salary_histogram = secure_hr(db.query(
            func.count(case((EmployeeRegistration.current_salary < 10000, EmployeeRegistration.id))).label("tier_1"),
            func.count(case((and_(EmployeeRegistration.current_salary >= 10000, EmployeeRegistration.current_salary < 20000), EmployeeRegistration.id))).label("tier_2"),
            func.count(case((and_(EmployeeRegistration.current_salary >= 20000, EmployeeRegistration.current_salary < 30000), EmployeeRegistration.id))).label("tier_3"),
            func.count(case((EmployeeRegistration.current_salary >= 30000, EmployeeRegistration.id))).label("tier_4")
        ).filter(active_status), EmployeeRegistration).first()
        salary_tiers = [int(salary_histogram.tier_1 or 0), int(salary_histogram.tier_2 or 0), int(salary_histogram.tier_3 or 0), int(salary_histogram.tier_4 or 0)]

        gender_data = secure_hr(db.query(EmployeeRegistration.gender, func.count(EmployeeRegistration.id)), EmployeeRegistration).group_by(EmployeeRegistration.gender).all()
        gender_labels = [g[0] if g[0] else "Not Specified" for g in gender_data]
        gender_values = [g[1] for g in gender_data]

        blood_group_rows = secure_hr(db.query(EmployeeRegistration.blood_group, func.count(EmployeeRegistration.id)).filter(EmployeeRegistration.blood_group != None), EmployeeRegistration).group_by(EmployeeRegistration.blood_group).all()
        blood_groups = [{"group": b[0], "count": b[1]} for b in blood_group_rows]

        attendance_trend_labels = []
        attendance_trend_data = []
        attendance_trend_counts = []
        for i in range(29, -1, -1):
            loop_date = today - timedelta(days=i)
            loop_day_present = base_att.filter(DailyAttendance.duty_date == loop_date).with_entities(
                func.count(func.distinct(DailyAttendance.employee_id))
            ).scalar() or 0
            day_pct = (loop_day_present / active_employees * 100) if active_employees > 0 else 0.0
            attendance_trend_labels.append(loop_date.strftime('%d-%b'))
            attendance_trend_data.append(round(day_pct, 1))
            attendance_trend_counts.append(int(loop_day_present))

        # ---------------------------------------------------------
        # 🌟 ANALYTICS GROWTH METRICS
        # ---------------------------------------------------------
        new_joinings_month = base_emp.filter(
            EmployeeRegistration.joining_date >= start_of_month,
            EmployeeRegistration.joining_date <= today,
        ).count()
        resignations_month = base_emp.filter(
            EmployeeRegistration.resignation_date >= start_of_month,
            EmployeeRegistration.resignation_date <= today,
        ).count()
        increments_ytd = secure_hr(db.query(EmployeeIncrement), EmployeeIncrement).filter(
            EmployeeIncrement.effective_from >= date(current_year, 1, 1),
            EmployeeIncrement.effective_from <= today,
            func.upper(func.trim(EmployeeIncrement.status)) == "ACTIVE",
        ).count()

        # ---------------------------------------------------------
        # Directory List
        # ---------------------------------------------------------
        dir_query = base_emp
        if dept_filter: dir_query = dir_query.filter(func.upper(func.trim(EmployeeRegistration.department)) == dept_filter.upper())
        if type_filter:
            normalized_type = type_filter.upper()
            if normalized_type in {"CONTRACT", "CONTRACTOR"}:
                dir_query = dir_query.filter(func.upper(func.trim(EmployeeRegistration.employee_type)).in_(["CONTRACT", "CONTRACTOR"]))
            else:
                dir_query = dir_query.filter(func.upper(func.trim(EmployeeRegistration.employee_type)) == normalized_type)
        if status_filter: dir_query = dir_query.filter(func.upper(func.trim(EmployeeRegistration.status)) == status_filter.upper())
        directory_list = dir_query.order_by(EmployeeRegistration.employee_id).all()

        # ---------------------------------------------------------
        # 🌟 11. APPROVALS QUEUE (OT & DUTY)
        # ---------------------------------------------------------
        pending_ot_count = base_att.filter(
            DailyAttendance.ot_status == "PENDING",
            DailyAttendance.calculated_ot_hours > 0
        ).count()

        pending_ot_rows = base_att.filter(
            DailyAttendance.ot_status == "PENDING",
            DailyAttendance.calculated_ot_hours > 0
        ).all()

        # Safe fallback in case duty_status isn't in DB yet
        if hasattr(DailyAttendance, 'duty_status'):
            pending_duty_rows = base_att.filter(
                DailyAttendance.status == "CLOSED",
                DailyAttendance.duty_status == "PENDING",
            ).all()
            for duty_row in pending_duty_rows:
                required_hours = get_shift_required_hours(db, comp_code, duty_row.shift_name)
                suggested_credit = attendance_payable_credit(duty_row.working_hours, required_hours)
                movements = list(duty_row.movements) if duty_row.movements else []
                is_punch_missing = any(str(m.get("type", "")).upper() == "AUTO OUT" for m in movements if isinstance(m, dict))
                setattr(duty_row, "suggested_duty_credit", suggested_credit)
                setattr(duty_row, "extra_hours", max(0.0, round(float(duty_row.working_hours or 0.0) - required_hours, 2)))
                setattr(duty_row, "is_punch_missing", is_punch_missing)
            pending_duty_count = len(pending_duty_rows)
        else:
            pending_duty_count = 0
            pending_duty_rows = []

    except Exception as router_err:
        logger.critical(f"Premium HR Dashboard Pipeline Crash: {str(router_err)}")
        raise router_err

    # Leave masters are not connected to this dashboard yet; never show mock data.
    leave_module = {"cl": 0, "sl": 0, "el": 0, "pending_approvals": 0}

    if request.query_params.get("format") == "json":
        return JSONResponse({
            "company_id": comp_code,
            "production_for": f"Enterprise HR Suite ({today.strftime('%d-%b-%Y')})",
            "actual_location": global_location,
            "total_employees": total_employees,
            "active_employees": active_employees,
            "present_today": present_today,
            "present_pct": round(present_pct, 1),
            "absent_today": absent_today,
            "half_day_today": half_day_today,
            "ot_workers_today": ot_workers_today,
            "ot_hours_today": round(ot_hours_today, 1),
            "labor_cost_today": round(labor_cost_today, 0),
            "cost_per_kg": round(cost_per_kg, 2),
            "contract_pct": round(contract_pct, 1),
            "perm_pct": round(perm_pct, 1),
            "avg_salary": round(avg_salary, 0),
            "employee_productivity": round(employee_productivity, 1),
            "attrition_rate": round(attrition_rate, 1),
            "productivity_data": productivity_data,
            "salary_tiers": salary_tiers,
            "gender_labels": gender_labels,
            "gender_values": gender_values,
            "blood_groups": blood_groups,
            "attendance_trend_labels": attendance_trend_labels,
            "attendance_trend_data": attendance_trend_data,
            "attendance_trend_counts": attendance_trend_counts,
            "new_joinings_month": new_joinings_month,
            "resignations_month": resignations_month,
            "increments_ytd": increments_ytd,
            "heatmap_days": [d.strftime('%a %d') for d in past_7_days],
            "heatmap_data": heatmap_data,
            "shift_performance": shift_performance,
            "dept_cost_center": dept_cost_center,
            "contractor_analytics": contractor_analytics,
            "ot_center": ot_center,
            "pending_ot_count": pending_ot_count,
            "pending_duty_count": pending_duty_count,
            "pf_coverage_pct": round(pf_coverage_pct, 1),
            "esi_coverage_pct": round(esi_coverage_pct, 1),
            "pt_coverage_pct": round(pt_coverage_pct, 1),
            "risk_no_pan": risk_no_pan,
            "risk_no_aadhar": risk_no_aadhar,
            "risk_no_bank": risk_no_bank,
            "risk_no_photo": risk_no_photo,
            "risk_no_mobile": risk_no_mobile,
            "risk_no_email": risk_no_email,
            "risk_missing_statutory": risk_missing_statutory,
            "stat_pf_na": stat_pf_na,
            "stat_missing_uan": stat_missing_uan,
            "stat_missing_esi": stat_missing_esi,
            "adv_issued": round(adv_issued, 0),
            "adv_recovered": round(adv_recovered, 0),
            "adv_balance": round(adv_balance, 0),
            "adv_recovery_pct": round(adv_recovery_pct, 1),
            "leave_module": leave_module,
            "upcoming_festivals": [{
                **row,
                "date": row["date"].isoformat(),
            } for row in upcoming_festivals],
            "bday_7": [{
                "employee_id": row.employee_id,
                "employee_name": row.employee_name,
                "date": row.dob.isoformat() if row.dob else None,
            } for row in bday_7],
            "bday_30": [{
                "employee_id": row.employee_id,
                "employee_name": row.employee_name,
                "date": row.dob.isoformat() if row.dob else None,
            } for row in bday_30],
            "anniv_7": [{
                "employee_id": row.employee_id,
                "employee_name": row.employee_name,
                "date": row.joining_date.isoformat() if row.joining_date else None,
            } for row in anniv_7],
            "top_10_advances": [{
                "id": row.id,
                "employee_id": row.employee_id,
                "employee_name": row.employee_name,
                "department": row.department,
                "remaining_balance": round(float(row.remaining_balance or 0), 2),
            } for row in top_10_advances],
            "pending_ot_rows": [{
                "id": row.id,
                "employee_id": row.employee_id,
                "employee_name": row.employee_name,
                "department": row.designation or "—",
                "duty_date": row.duty_date.isoformat() if row.duty_date else None,
                "shift_name": row.shift_name or "GENERAL",
                "calculated_ot_hours": round(float(row.calculated_ot_hours or 0), 2),
            } for row in pending_ot_rows],
            "pending_duty_rows": [{
                "id": row.id,
                "employee_id": row.employee_id,
                "employee_name": row.employee_name,
                "duty_date": row.duty_date.isoformat() if row.duty_date else None,
                "shift_name": row.shift_name or "GENERAL",
                "duty_status": row.duty_status or "PENDING",
                "working_hours": round(float(row.working_hours or 0), 2),
                "extra_hours": round(float(getattr(row, "extra_hours", 0) or 0), 2),
                "suggested_duty_credit": float(getattr(row, "suggested_duty_credit", 1) or 1),
                "calculated_ot_hours": round(float(row.calculated_ot_hours or 0), 2),
                "is_punch_missing": bool(getattr(row, "is_punch_missing", False)),
            } for row in pending_duty_rows],
            "directory_list": [{
                "employee_id": row.employee_id,
                "employee_name": row.employee_name,
                "department": row.department or "N/A",
                "designation": row.designation or "N/A",
                "employee_type": row.employee_type or "REGULAR",
                "reporting_to": row.reporting_to or "—",
                "mobile": row.mobile or "—",
                "current_salary": round(float(row.current_salary or 0), 2),
                "joining_date": row.joining_date.isoformat() if row.joining_date else None,
                "status": row.status or "INACTIVE",
            } for row in directory_list],
        })

    return templates.TemplateResponse(
        request=request, name="dashboard/hr_command_center.html",
        context={
            "company_id": comp_code, "production_for": f"Enterprise HR Suite ({today.strftime('%d-%b-%Y')})",
            "actual_location": global_location,
            # Exec Summary
            "total_employees": total_employees, "active_employees": active_employees, "present_today": present_today,
            "present_pct": round(present_pct, 1), "absent_today": absent_today,
            "half_day_today": half_day_today, "ot_workers_today": ot_workers_today,
            "ot_hours_today": round(ot_hours_today, 1), "labor_cost_today": round(labor_cost_today, 0), "cost_per_kg": round(cost_per_kg, 2),
            "contract_pct": round(contract_pct, 1), "perm_pct": round(perm_pct, 1), "avg_salary": round(avg_salary, 0),
            "employee_productivity": round(employee_productivity, 1), "attrition_rate": round(attrition_rate, 1), "enps_score": 0,
            # Arrays for charts 
            "productivity_data": productivity_data,
            "salary_tiers": salary_tiers,
            "gender_labels": gender_labels,
            "gender_values": gender_values,
            "blood_groups": blood_groups,
            "attendance_trend_labels": attendance_trend_labels,
            "attendance_trend_data": attendance_trend_data,
            "attendance_trend_counts": attendance_trend_counts,
            "new_joinings_month": new_joinings_month,
            "resignations_month": resignations_month,
            "increments_ytd": increments_ytd,
            # Heatmap & Shifts
            "heatmap_days": [d.strftime('%a %d') for d in past_7_days], "heatmap_data": heatmap_data,
            "shift_performance": shift_performance,
            # Cost Center & Contractors
            "dept_cost_center": dept_cost_center, "contractor_analytics": contractor_analytics,
            # OT & Payroll
            "ot_center": ot_center,
            "pending_ot_count": pending_ot_count, "pending_duty_count": pending_duty_count,
            "pending_ot_rows": pending_ot_rows, "pending_duty_rows": pending_duty_rows,
            # Compliance & Risk
            "pf_coverage_pct": round(pf_coverage_pct, 1), "esi_coverage_pct": round(esi_coverage_pct, 1),
            "pt_coverage_pct": round(pt_coverage_pct, 1), "stat_pf_na": stat_pf_na,
            "stat_missing_uan": stat_missing_uan, "stat_missing_esi": stat_missing_esi,
            "risk_no_pan": risk_no_pan, "risk_no_aadhar": risk_no_aadhar, "risk_no_bank": risk_no_bank, 
            "risk_no_photo": risk_no_photo, "risk_no_mobile": risk_no_mobile, "risk_no_email": risk_no_email,
            "risk_missing_statutory": risk_missing_statutory,
            # Calendar & Leaves
            "bday_7": bday_7, "bday_30": bday_30, "anniv_7": anniv_7,
            "upcoming_festivals": upcoming_festivals,
            "adv_issued": round(adv_issued, 0), "adv_recovered": round(adv_recovered, 0),
            "adv_balance": round(adv_balance, 0), "adv_recovery_pct": round(adv_recovery_pct, 1),
            "top_10_advances": top_10_advances, "leave_module": leave_module,
            # General
            "directory_list": directory_list,
            "dept_filter": dept_filter, "type_filter": type_filter, "status_filter": status_filter
        }
    )


# ============================================================
# 🟢 🔴 2. KPI DRILL-DOWN POPUP DATA STREAM ENDPOINT (WITH REDACTION)
# ============================================================
@router.get("/hr_kpi_details")
async def get_hr_kpi_details(
    request: Request,
    kpi_type: str = Query(...),
    location: str | None = Query(None),
    dept_filter: str = Query(""),
    type_filter: str = Query(""),
    status_filter: str = Query(""),
    db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")
    if not comp_code:
        return JSONResponse({"status": "error", "message": "Session Dropped"}, status_code=401)

    ensure_hr_dashboard_schema(db)
    db.commit()

    _, cookie_loc = get_global_filters(request)
    global_location = clean_filter_value(location if location is not None else cookie_loc)
    
    session_locations = request.session.get("allowed_locations", [])
    user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()] if isinstance(session_locations, str) else [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]

    today = ist_now().date()
    
    allowed_emp_ids, g_loc_clean, emp_loc_col = get_secure_hr_scope(db, comp_code, global_location, user_allowed_locations)
    dept_filter = clean_filter_value(dept_filter)
    type_filter = clean_filter_value(type_filter)
    status_filter = clean_filter_value(status_filter)

    result_data = []

    # 📋 A. MASTER EMPLOYEE REGISTER STREAM
    if kpi_type.upper() in ["TOTAL_STAFF", "ACTIVE_STAFF", "CONTRACT", "PERMANENT", "ABSENT"]:
        emp_q = db.query(EmployeeRegistration).filter(EmployeeRegistration.company_id == comp_code)
        
        if emp_loc_col is not None:
            if g_loc_clean and g_loc_clean != "ALL": emp_q = emp_q.filter(func.upper(func.trim(emp_loc_col)) == g_loc_clean)
            elif user_allowed_locations: emp_q = emp_q.filter(func.upper(func.trim(emp_loc_col)).in_(user_allowed_locations))

        if dept_filter:
            emp_q = emp_q.filter(func.upper(func.trim(EmployeeRegistration.department)) == dept_filter.upper())
        if type_filter:
            normalized_type = type_filter.upper()
            if normalized_type in {"CONTRACT", "CONTRACTOR"}:
                emp_q = emp_q.filter(func.upper(func.trim(EmployeeRegistration.employee_type)).in_(["CONTRACT", "CONTRACTOR"]))
            else:
                emp_q = emp_q.filter(func.upper(func.trim(EmployeeRegistration.employee_type)) == normalized_type)
        if status_filter:
            emp_q = emp_q.filter(func.upper(func.trim(EmployeeRegistration.status)) == status_filter.upper())

        if kpi_type.upper() == "ACTIVE_STAFF": emp_q = emp_q.filter(func.upper(func.trim(EmployeeRegistration.status)) == "ACTIVE")
        elif kpi_type.upper() == "CONTRACT": emp_q = emp_q.filter(and_(func.upper(func.trim(EmployeeRegistration.status)) == "ACTIVE", func.upper(func.trim(EmployeeRegistration.employee_type)).in_(["CONTRACT", "CONTRACTOR"])))
        elif kpi_type.upper() == "PERMANENT": emp_q = emp_q.filter(and_(func.upper(func.trim(EmployeeRegistration.status)) == "ACTIVE", ~func.upper(func.trim(EmployeeRegistration.employee_type)).in_(["CONTRACT", "CONTRACTOR"])))
        elif kpi_type.upper() == "ABSENT":
            today_punched_in = db.query(DailyAttendance.employee_id).filter(and_(DailyAttendance.company_id == comp_code, DailyAttendance.duty_date == today)).subquery()
            emp_q = emp_q.filter(and_(EmployeeRegistration.status == "ACTIVE", ~EmployeeRegistration.employee_id.in_(today_punched_in)))

        rows = emp_q.order_by(EmployeeRegistration.employee_id).all()
        for r in rows:
            result_data.append({
                "id": r.employee_id, "name": r.employee_name, "department": r.department or "GENERAL", "designation": r.designation or "STAFF",
                "employee_type": r.employee_type or "REGULAR", "contact": r.mobile or "N/A", "manager": r.reporting_to or "N/A", "status": r.status,
                # 🛡️ MANDATORY STRICT REDACTION FOR AADHAAR
                "aadhar": "[Aadhaar Redacted]" if r.aadhar_number else "N/A"
            })
        return {"status": "success", "mode": "EMPLOYEE", "data": result_data}

    # ⏱️ B. ATTENDANCE DRILL DOWNS
    elif kpi_type.upper() in ["PRESENT", "OT_TODAY"]:
        att_q = db.query(DailyAttendance).filter(and_(DailyAttendance.company_id == comp_code, DailyAttendance.duty_date == today, DailyAttendance.employee_id.in_(allowed_emp_ids)))

        if kpi_type.upper() == "OT_TODAY": att_q = att_q.filter(DailyAttendance.calculated_ot_hours > 0)

        rows = att_q.order_by(DailyAttendance.first_in.desc()).all()
        for r in rows:
            movements_markup = " -> ".join([f"{m['type']} {m['time']}" for m in (r.movements or [])])
            result_data.append({
                "id": r.employee_id, "name": r.employee_name, "shift": r.shift_name or "GENERAL",
                "movements": movements_markup or "No Punch Track", "hours": float(r.working_hours or 0.0), "ot_hours": float(r.calculated_ot_hours or 0.0), "status": r.status
            })
        return {"status": "success", "mode": "ATTENDANCE", "data": result_data}

    return JSONResponse({"status": "error", "message": "Unknown drilldown vector criteria"}, status_code=400)


# ============================================================
# 🟢 🔴 3. POST ROUTES FOR APPROVAL WORKFLOWS (ACTION HANDLERS)
# ============================================================

@router.post("/approve_ot/{att_id}")
def approve_ot_action(att_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return RedirectResponse(url="/auth/login", status_code=303)
    
    att_record = db.query(DailyAttendance).filter(DailyAttendance.id == att_id, DailyAttendance.company_id == comp_code).first()
    if att_record:
        att_record.ot_status = "APPROVED"
        att_record.approved_ot_hours = att_record.calculated_ot_hours
        att_record.ot_approved_by = email
        db.commit()
        
    return RedirectResponse(url="/dashboard/hr_command_center", status_code=303)


@router.post("/reject_ot/{att_id}")
def reject_ot_action(att_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return RedirectResponse(url="/auth/login", status_code=303)
    
    att_record = db.query(DailyAttendance).filter(DailyAttendance.id == att_id, DailyAttendance.company_id == comp_code).first()
    if att_record:
        att_record.ot_status = "REJECTED"
        att_record.approved_ot_hours = 0.0
        att_record.ot_approved_by = email
        db.commit()
        
    return RedirectResponse(url="/dashboard/hr_command_center", status_code=303)


@router.post("/approve_duty/{att_id}")
def approve_duty_action(
    att_id: int,
    request: Request,
    approved_duty_credit: str = Form("1.0"),
    approved_ot_hours: float = Form(0.0),
    mark_absent: bool = Form(False),
    db: Session = Depends(get_db),
):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return RedirectResponse(url="/auth/login", status_code=303)
    
    # Needs duty_status field in DB
    if hasattr(DailyAttendance, 'duty_status'):
        att_record = db.query(DailyAttendance).filter(DailyAttendance.id == att_id, DailyAttendance.company_id == comp_code).first()
        if att_record:
            allowed_credits = {1.0, 1.5, 2.0, 2.5, 3.0}
            absent_selected = mark_absent or str(approved_duty_credit or "").strip().upper() == "A"
            if absent_selected:
                duty_credit = 0.0
                ot_hours = 0.0
            else:
                try:
                    duty_credit = float(approved_duty_credit or 1.0)
                except (TypeError, ValueError):
                    duty_credit = 1.0
                if duty_credit not in allowed_credits:
                    duty_credit = 1.0
                ot_hours = max(0.0, min(float(approved_ot_hours or 0.0), 16.0))

            att_record.duty_status = "APPROVED"
            att_record.duty_approved_by = email
            att_record.approved_duty_credit = duty_credit
            att_record.approved_ot_hours = ot_hours
            att_record.ot_status = "APPROVED" if ot_hours > 0 else "REJECTED"
            att_record.ot_approved_by = email
            if absent_selected:
                att_record.duty_type = "ABSENT"
            employee = db.query(EmployeeRegistration).filter(
                EmployeeRegistration.employee_id == att_record.employee_id,
                EmployeeRegistration.company_id == comp_code,
            ).first()
            if (
                employee
                and str(employee.employee_type or "").strip().upper() in {"CONTRACT", "CONTRACTOR"}
                and employee.contractor_name
                and not att_record.journal_id
            ):
                payable_days = duty_credit
                per_day_rate = float(employee.current_salary or 0.0) / 26.0 if employee.current_salary else 0.0
                payable_amount = round(payable_days * per_day_rate, 2)
                if payable_amount > 0:
                    from app.services.bill_accounting import post_contractor_source_charge
                    voucher = post_contractor_source_charge(
                        db=db,
                        company_id=comp_code,
                        voucher_date=att_record.duty_date or date.today(),
                        reference_no=f"ATT-{att_record.id}",
                        contractor_name=employee.contractor_name,
                        charge_type="Processing",
                        taxable_amount=payable_amount,
                        gst_percent=contractor_gst_percent(db, comp_code, employee.contractor_name),
                        created_by=email,
                        quantity=payable_days,
                        rate=per_day_rate,
                    )
                    att_record.journal_id = voucher.id
            db.commit()
            
    return RedirectResponse(url="/dashboard/hr_command_center", status_code=303)


@router.post("/reject_duty/{att_id}")
def reject_duty_action(att_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return RedirectResponse(url="/auth/login", status_code=303)
    
    if hasattr(DailyAttendance, 'duty_status'):
        att_record = db.query(DailyAttendance).filter(DailyAttendance.id == att_id, DailyAttendance.company_id == comp_code).first()
        if att_record:
            att_record.duty_status = "REJECTED"
            att_record.duty_approved_by = email
            att_record.approved_duty_credit = 1.0
            att_record.approved_ot_hours = 0.0
            att_record.ot_status = "REJECTED"
            att_record.ot_approved_by = email
            db.commit()
            
    return RedirectResponse(url="/dashboard/hr_command_center", status_code=303)
