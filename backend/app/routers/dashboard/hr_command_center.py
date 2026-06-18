# app/routers/dashboard/hr_command_center.py

from fastapi import APIRouter, Request, Depends, Query, status
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, case, extract, cast, Date
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
# 🟢 Global Filters
from app.utils.global_filters import get_global_filters

router = APIRouter(tags=["ENTERPRISE HR COMMAND CENTER"])
templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)


# ============================================================
# ⚡ HELPER: LOCATION SCOPE BOUNDING UTILITY
# ============================================================
def get_secure_hr_scope(db: Session, comp_code: str, global_location: str | None, user_allowed_locations: list):
    g_loc_clean = global_location.strip().upper() if global_location else None
    emp_loc_col = getattr(EmployeeRegistration, 'production_at', getattr(EmployeeRegistration, 'location', getattr(EmployeeRegistration, 'branch', None)))
    
    emp_base_q = db.query(EmployeeRegistration.employee_id).filter(EmployeeRegistration.company_id == comp_code)
    
    if emp_loc_col is not None:
        if g_loc_clean and g_loc_clean != "ALL":
            emp_base_q = emp_base_q.filter(func.upper(func.trim(emp_loc_col)) == g_loc_clean)
        elif user_allowed_locations:
            emp_base_q = emp_base_q.filter(func.upper(func.trim(emp_loc_col)).in_(user_allowed_locations))
            
    return emp_base_q.subquery(), g_loc_clean, emp_loc_col


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

    _, cookie_loc = get_global_filters(request)
    global_location = location if location is not None else cookie_loc

    session_locations = request.session.get("allowed_locations", [])
    user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()] if isinstance(session_locations, str) else [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]

    today = date.today()
    start_of_month = today.replace(day=1)
    current_year = today.year

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

        # ---------------------------------------------------------
        # 🌟 1. EXECUTIVE WORKFORCE SUMMARY (12 PREMIUM KPIs)
        # ---------------------------------------------------------
        total_employees = base_emp.count()
        active_employees = base_emp.filter(EmployeeRegistration.status == "ACTIVE").count()
        present_today = base_att.filter(DailyAttendance.duty_date == today).count()
        absent_today = max(0, active_employees - present_today)
        present_pct = (present_today / active_employees * 100) if active_employees > 0 else 0.0

        contract_count = base_emp.filter(and_(EmployeeRegistration.status == "ACTIVE", func.upper(EmployeeRegistration.employee_type) == "CONTRACTOR")).count()
        perm_count = active_employees - contract_count
        contract_pct = (contract_count / active_employees * 100) if active_employees > 0 else 0.0
        perm_pct = (perm_count / active_employees * 100) if active_employees > 0 else 0.0

        ot_hours_today = base_att.filter(DailyAttendance.duty_date == today).with_entities(func.coalesce(func.sum(DailyAttendance.calculated_ot_hours), 0.0)).scalar()

        # Labor Cost Today & Productivity
        present_emps = db.query(EmployeeRegistration.current_salary).join(
            DailyAttendance, DailyAttendance.employee_id == EmployeeRegistration.employee_id
        ).filter(and_(DailyAttendance.company_id == comp_code, DailyAttendance.duty_date == today, DailyAttendance.employee_id.in_(allowed_emp_ids))).all()
        
        labor_cost_today = sum([(emp[0] or 0) / 30 for emp in present_emps])
        avg_salary = base_emp.filter(EmployeeRegistration.status == "ACTIVE").with_entities(func.coalesce(func.avg(EmployeeRegistration.current_salary), 0.0)).scalar()

        total_working_hours = base_att.filter(DailyAttendance.duty_date == today).with_entities(func.coalesce(func.sum(DailyAttendance.working_hours), 0.0)).scalar()
        employee_productivity = (total_working_hours / (present_today * 8) * 100) if present_today > 0 else 0.0

        resigned_this_year = base_emp.filter(and_(EmployeeRegistration.resignation_date >= date(current_year, 1, 1), EmployeeRegistration.status == "INACTIVE")).count()
        attrition_rate = (resigned_this_year / total_employees * 100) if total_employees > 0 else 0.0

        # Production KG Fetch for Cost/KG
        def get_prod_kg(model, field):
            q = db.query(func.coalesce(func.sum(field), 0.0)).filter(and_(model.company_id == comp_code, model.date == today))
            if hasattr(model, 'production_at') and g_loc_clean and g_loc_clean != "ALL":
                q = q.filter(func.upper(func.trim(model.production_at)) == g_loc_clean)
            elif hasattr(model, 'peeling_at') and g_loc_clean and g_loc_clean != "ALL":
                q = q.filter(func.upper(func.trim(model.peeling_at)) == g_loc_clean)
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
                c = db.query(func.count(DailyAttendance.id)).join(EmployeeRegistration, DailyAttendance.employee_id == EmployeeRegistration.employee_id).filter(
                    and_(DailyAttendance.company_id == comp_code, DailyAttendance.duty_date == day, EmployeeRegistration.department == d_name, DailyAttendance.employee_id.in_(allowed_emp_ids))
                ).scalar()
                heatmap_data[d_name].append(c)

        # ---------------------------------------------------------
        # 🌟 3. SHIFT PERFORMANCE DASHBOARD
        # ---------------------------------------------------------
        shift_aggs = base_att.filter(DailyAttendance.duty_date == today).with_entities(
            DailyAttendance.shift_name,
            func.count(DailyAttendance.id).label("emp_count"),
            func.sum(DailyAttendance.working_hours).label("total_hrs"),
            func.sum(DailyAttendance.calculated_ot_hours).label("ot_hrs")
        ).group_by(DailyAttendance.shift_name).all()

        shift_performance = []
        for s in shift_aggs:
            s_name = s.shift_name or "GENERAL"
            emp_c = s.emp_count or 0
            eff = ((s.total_hrs or 0) / (emp_c * 8) * 100) if emp_c > 0 else 0.0
            shift_performance.append({
                "shift": s_name, "employees": emp_c, "ot_hrs": round(s.ot_hrs or 0, 1), "efficiency": round(eff, 1)
            })

        # ---------------------------------------------------------
        # 🌟 4. DEPARTMENT COST CENTER
        # ---------------------------------------------------------
        dept_cost_data = base_emp.filter(EmployeeRegistration.status == "ACTIVE").with_entities(
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
        contractor_data = base_emp.filter(and_(EmployeeRegistration.status == "ACTIVE", func.upper(EmployeeRegistration.employee_type) == "CONTRACTOR")).with_entities(
            EmployeeRegistration.contractor_name,
            func.count(EmployeeRegistration.id).label("manpower"),
            func.sum(EmployeeRegistration.current_salary).label("salary")
        ).group_by(EmployeeRegistration.contractor_name).all()

        contractor_analytics = []
        for c in contractor_data:
            c_name = c.contractor_name or "DIRECT/UNKNOWN"
            c_present = db.query(func.count(DailyAttendance.id)).join(EmployeeRegistration, DailyAttendance.employee_id == EmployeeRegistration.employee_id).filter(
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
        pf_covered = base_stat.filter(and_(EmployeeStatutoryMaster.pf_applicable == True, EmployeeStatutoryMaster.status == "ACTIVE")).count()
        esi_covered = base_stat.filter(and_(EmployeeStatutoryMaster.esi_applicable == True, EmployeeStatutoryMaster.status == "ACTIVE")).count()
        stat_missing_uan = base_stat.filter(and_(EmployeeStatutoryMaster.pf_applicable == True, or_(EmployeeStatutoryMaster.uan_number == None, EmployeeStatutoryMaster.uan_number == ""))).count()
        stat_missing_esi = base_stat.filter(and_(EmployeeStatutoryMaster.esi_applicable == True, or_(EmployeeStatutoryMaster.esi_number == None, EmployeeStatutoryMaster.esi_number == ""))).count()
        
        pf_coverage_pct = (pf_covered / active_employees * 100) if active_employees > 0 else 0.0
        esi_coverage_pct = (esi_covered / active_employees * 100) if active_employees > 0 else 0.0

        risk_no_pan = base_emp.filter(or_(EmployeeRegistration.pan_number == None, EmployeeRegistration.pan_number == "")).count()
        risk_no_aadhar = base_emp.filter(or_(EmployeeRegistration.aadhar_number == None, EmployeeRegistration.aadhar_number == "")).count()
        risk_no_bank = base_emp.filter(or_(EmployeeRegistration.account_number == None, EmployeeRegistration.account_number == "")).count()
        risk_no_photo = base_emp.filter(or_(EmployeeRegistration.photo_path == None, EmployeeRegistration.photo_path == "")).count()
        risk_no_mobile = base_emp.filter(or_(EmployeeRegistration.mobile == None, EmployeeRegistration.mobile == "")).count()
        
        stat_emp_ids = secure_hr(db.query(EmployeeStatutoryMaster.employee_id), EmployeeStatutoryMaster).subquery()
        risk_missing_statutory = base_emp.filter(~EmployeeRegistration.employee_id.in_(stat_emp_ids)).count()

        # ---------------------------------------------------------
        # 🌟 8. BIRTHDAY / ANNIVERSARY (Upcoming 7 & 30 Days)
        # ---------------------------------------------------------
        def get_upcoming(date_col, days):
            end_date = today + timedelta(days=days)
            return base_emp.filter(EmployeeRegistration.status == "ACTIVE",
                or_(
                    and_(extract('month', date_col) == today.month, extract('day', date_col) >= today.day, extract('day', date_col) <= end_date.day),
                    and_(today.month != end_date.month, extract('month', date_col) == end_date.month, extract('day', date_col) <= end_date.day)
                )
            ).all()

        bday_7 = get_upcoming(EmployeeRegistration.dob, 7)
        bday_30 = get_upcoming(EmployeeRegistration.dob, 30)
        anniv_7 = get_upcoming(EmployeeRegistration.joining_date, 7)

        # ---------------------------------------------------------
        # 🌟 9. SALARY ADVANCE CONTROL TOWER
        # ---------------------------------------------------------
        base_adv = secure_hr(db.query(EmployeeSalaryAdvance), EmployeeSalaryAdvance)
        adv_agg = base_adv.with_entities(
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
        # 🌟 10. ARRAYS FOR CHARTING (Missing variables fixed here)
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
        ).filter(EmployeeRegistration.status == "ACTIVE"), EmployeeRegistration).first()
        salary_tiers = [int(salary_histogram.tier_1 or 0), int(salary_histogram.tier_2 or 0), int(salary_histogram.tier_3 or 0), int(salary_histogram.tier_4 or 0)]

        gender_data = secure_hr(db.query(EmployeeRegistration.gender, func.count(EmployeeRegistration.id)), EmployeeRegistration).group_by(EmployeeRegistration.gender).all()
        gender_labels = [g[0] if g[0] else "Not Specified" for g in gender_data]
        gender_values = [g[1] for g in gender_data]

        blood_group_rows = secure_hr(db.query(EmployeeRegistration.blood_group, func.count(EmployeeRegistration.id)).filter(EmployeeRegistration.blood_group != None), EmployeeRegistration).group_by(EmployeeRegistration.blood_group).all()
        blood_groups = [{"group": b[0], "count": b[1]} for b in blood_group_rows]

        attendance_trend_labels = []
        attendance_trend_data = []
        for i in range(29, -1, -1):
            loop_date = today - timedelta(days=i)
            loop_day_present = base_att.filter(DailyAttendance.duty_date == loop_date).count()
            day_pct = (loop_day_present / active_employees * 100) if active_employees > 0 else 0.0
            attendance_trend_labels.append(loop_date.strftime('%d-%b'))
            attendance_trend_data.append(round(day_pct, 1))

        # ---------------------------------------------------------
        # Directory List
        # ---------------------------------------------------------
        dir_query = base_emp
        if dept_filter: dir_query = dir_query.filter(EmployeeRegistration.department == dept_filter)
        if type_filter: dir_query = dir_query.filter(EmployeeRegistration.employee_type == type_filter)
        if status_filter: dir_query = dir_query.filter(EmployeeRegistration.status == status_filter)
        directory_list = dir_query.order_by(EmployeeRegistration.employee_id).all()

    except Exception as router_err:
        logger.critical(f"Premium HR Dashboard Pipeline Crash: {str(router_err)}")
        raise router_err

    # MOCK LEAVES (Since Leave Module is pending)
    leave_module = {"cl": 145, "sl": 67, "el": 312, "pending_approvals": 12}

    return templates.TemplateResponse(
        request=request, name="dashboard/hr_command_center.html",
        context={
            "company_id": comp_code, "production_for": f"Enterprise HR Suite ({today.strftime('%d-%b-%Y')})",
            "actual_location": global_location,
            # Exec Summary
            "total_employees": total_employees, "active_employees": active_employees, "present_pct": round(present_pct, 1),
            "absent_today": absent_today,
            "ot_hours_today": round(ot_hours_today, 1), "labor_cost_today": round(labor_cost_today, 0), "cost_per_kg": round(cost_per_kg, 2),
            "contract_pct": round(contract_pct, 1), "perm_pct": round(perm_pct, 1), "avg_salary": round(avg_salary, 0),
            "employee_productivity": round(employee_productivity, 1), "attrition_rate": round(attrition_rate, 1), "enps_score": 88, 
            # Arrays for charts (Fixes the Undefined error)
            "productivity_data": productivity_data,
            "salary_tiers": salary_tiers,
            "gender_labels": gender_labels,
            "gender_values": gender_values,
            "blood_groups": blood_groups,
            "attendance_trend_labels": attendance_trend_labels,
            "attendance_trend_data": attendance_trend_data,
            # Heatmap & Shifts
            "heatmap_days": [d.strftime('%a %d') for d in past_7_days], "heatmap_data": heatmap_data,
            "shift_performance": shift_performance,
            # Cost Center & Contractors
            "dept_cost_center": dept_cost_center, "contractor_analytics": contractor_analytics,
            # OT & Payroll
            "ot_center": ot_center,
            # Compliance & Risk
            "pf_coverage_pct": round(pf_coverage_pct, 1), "esi_coverage_pct": round(esi_coverage_pct, 1),
            "stat_missing_uan": stat_missing_uan, "stat_missing_esi": stat_missing_esi,
            "risk_no_pan": risk_no_pan, "risk_no_aadhar": risk_no_aadhar, "risk_no_bank": risk_no_bank, 
            "risk_no_photo": risk_no_photo, "risk_no_mobile": risk_no_mobile,
            "risk_missing_statutory": risk_missing_statutory,
            # Calendar
            "bday_7": bday_7, "bday_30": bday_30, "anniv_7": anniv_7,
            # Advances & Leaves
            "adv_issued": round(adv_issued, 0), "adv_balance": round(adv_balance, 0), "adv_recovery_pct": round(adv_recovery_pct, 1),
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
    db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")
    if not comp_code:
        return JSONResponse({"status": "error", "message": "Session Dropped"}, status_code=401)

    _, cookie_loc = get_global_filters(request)
    global_location = location if location is not None else cookie_loc
    
    session_locations = request.session.get("allowed_locations", [])
    user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()] if isinstance(session_locations, str) else [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]

    today = date.today()
    start_of_month = today.replace(day=1)
    
    allowed_emp_ids, g_loc_clean, emp_loc_col = get_secure_hr_scope(db, comp_code, global_location, user_allowed_locations)

    result_data = []

    # 📋 A. MASTER EMPLOYEE REGISTER STREAM
    if kpi_type.upper() in ["TOTAL_STAFF", "ACTIVE_STAFF", "CONTRACT", "PERMANENT", "ABSENT"]:
        emp_q = db.query(EmployeeRegistration).filter(EmployeeRegistration.company_id == comp_code)
        
        if emp_loc_col is not None:
            if g_loc_clean and g_loc_clean != "ALL": emp_q = emp_q.filter(func.upper(func.trim(emp_loc_col)) == g_loc_clean)
            elif user_allowed_locations: emp_q = emp_q.filter(func.upper(func.trim(emp_loc_col)).in_(user_allowed_locations))

        if kpi_type.upper() == "ACTIVE_STAFF": emp_q = emp_q.filter(EmployeeRegistration.status == "ACTIVE")
        elif kpi_type.upper() == "CONTRACT": emp_q = emp_q.filter(and_(EmployeeRegistration.status == "ACTIVE", func.upper(EmployeeRegistration.employee_type) == "CONTRACTOR"))
        elif kpi_type.upper() == "PERMANENT": emp_q = emp_q.filter(and_(EmployeeRegistration.status == "ACTIVE", func.upper(EmployeeRegistration.employee_type) != "CONTRACTOR"))
        elif kpi_type.upper() == "ABSENT":
            today_punched_in = db.query(DailyAttendance.employee_id).filter(and_(DailyAttendance.company_id == comp_code, DailyAttendance.duty_date == today)).subquery()
            emp_q = emp_q.filter(and_(EmployeeRegistration.status == "ACTIVE", ~EmployeeRegistration.employee_id.in_(today_punched_in)))

        rows = emp_q.order_by(EmployeeRegistration.employee_id).all()
        for r in rows:
            result_data.append({
                "id": r.employee_id, "name": r.employee_name, "department": r.department or "GENERAL", "designation": r.designation or "STAFF",
                "contact": r.mobile or "N/A", "manager": r.reporting_to or "N/A", "status": r.status,
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