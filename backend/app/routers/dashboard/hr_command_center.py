# app/routers/dashboard/hr_command_center.py

from fastapi import APIRouter, Request, Depends, Query, status
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_, case, extract
from datetime import date, datetime, timedelta
import logging

from app.database import get_db
# Master models import based on standard structure
from app.database.models.attendance import (
    EmployeeRegistration, 
    DailyAttendance, 
    EmployeeIncrement, 
    EmployeeStatutoryMaster, 
    EmployeeSalaryAdvance
)

router = APIRouter(tags=["ENTERPRISE HR COMMAND CENTER"])
templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)

@router.get("/hr_command_center", response_class=HTMLResponse)
def hr_command_center(
    request: Request,
    db: Session = Depends(get_db),
    dept_filter: str = Query("", description="Filter by Department"),
    type_filter: str = Query("", description="Filter by Employee Type"),
    status_filter: str = Query("", description="Filter by Status")
):
    # 1. SECURITY & SESSION PROFILE EXTRACTIONS (Anti-405 HTTP Method Slabs)
    email = request.session.get("email")
    comp_code = request.session.get("company_code")

    if not email or not comp_code:
        return RedirectResponse(url="/auth/login", status_code=status.HTTP_303_SEE_OTHER)

    today = date.today()
    start_of_month = today.replace(day=1)

    try:
        # Base Sub-Queries Linked via Corporate Token Slabs
        base_emp = db.query(EmployeeRegistration).filter(EmployeeRegistration.company_id == comp_code)
        base_att = db.query(DailyAttendance).filter(DailyAttendance.company_id == comp_code)
        base_stat = db.query(EmployeeStatutoryMaster).filter(EmployeeStatutoryMaster.company_id == comp_code)
        base_adv = db.query(EmployeeSalaryAdvance).filter(EmployeeSalaryAdvance.company_id == comp_code)
        base_inc = db.query(EmployeeIncrement).filter(EmployeeIncrement.company_id == comp_code)

        # 2. EXECUTIVE 12 KPI CARD DATA ALIGNMENTS
        total_employees = base_emp.count()
        active_employees = base_emp.filter(EmployeeRegistration.status == "ACTIVE").count()
        present_today = base_att.filter(DailyAttendance.duty_date == today).count()
        absent_today = max(0, active_employees - present_today)

        overtime_count = base_att.filter(
            and_(DailyAttendance.duty_date == today, DailyAttendance.working_hours > 8)
        ).count()
        
        double_duty_count = base_att.filter(
            and_(DailyAttendance.duty_date == today, DailyAttendance.working_hours > 14)
        ).count()

        new_joiners_month = base_emp.filter(EmployeeRegistration.joining_date >= start_of_month).count()
        advances_outstanding = db.query(func.coalesce(func.sum(EmployeeSalaryAdvance.remaining_balance), 0.0)).filter(
            EmployeeSalaryAdvance.company_id == comp_code
        ).scalar()

        pf_covered = base_stat.filter(and_(EmployeeStatutoryMaster.pf_applicable == True, EmployeeStatutoryMaster.status == "ACTIVE")).count()
        esi_covered = base_stat.filter(and_(EmployeeStatutoryMaster.esi_applicable == True, EmployeeStatutoryMaster.status == "ACTIVE")).count()
        monthly_payroll = db.query(func.coalesce(func.sum(EmployeeRegistration.current_salary), 0.0)).filter(
            and_(EmployeeRegistration.company_id == comp_code, EmployeeRegistration.status == "ACTIVE")
        ).scalar()

        open_shifts = db.query(func.count(DailyAttendance.id)).filter(
            and_(DailyAttendance.company_id == comp_code, DailyAttendance.duty_date == today, DailyAttendance.status == "OPEN")
        ).scalar() or 0

        # 3. WORKFORCE WORKPLACE DEMOGRAPHICS DISTRIBUTIONS
        gender_data = db.query(EmployeeRegistration.gender, func.count(EmployeeRegistration.id)).filter(
            EmployeeRegistration.company_id == comp_code
        ).group_by(EmployeeRegistration.gender).all()
        
        gender_labels = [g[0] if g[0] else "Not Specified" for g in gender_data]
        gender_values = [g[1] for g in gender_data]

        blood_group_rows = db.query(EmployeeRegistration.blood_group, func.count(EmployeeRegistration.id)).filter(
            and_(EmployeeRegistration.company_id == comp_code, EmployeeRegistration.blood_group != None)
        ).group_by(EmployeeRegistration.blood_group).all()
        blood_groups = [{"group": b[0], "count": b[1]} for b in blood_group_rows]

        # 4. RECONCILED DEPARTMENT STRENGTH MATRIX (Fixed AttributeError via Join)
        dept_rows = db.query(
            EmployeeRegistration.department,
            func.count(EmployeeRegistration.id).label("total_staff"),
            func.coalesce(func.avg(EmployeeRegistration.current_salary), 0.0).label("avg_sal")
        ).filter(and_(EmployeeRegistration.company_id == comp_code, EmployeeRegistration.department != None)).group_by(
            EmployeeRegistration.department
        ).all()

        dept_matrix = []
        dept_names_chart = []
        dept_cost_chart = []

        for row in dept_rows:
            # ✅ Fixed: Joining DailyAttendance with Master to pull Department alignment
            p_count = db.query(DailyAttendance).join(
                EmployeeRegistration, DailyAttendance.employee_id == EmployeeRegistration.employee_id
            ).filter(
                and_(
                    DailyAttendance.company_id == comp_code,
                    DailyAttendance.duty_date == today,
                    EmployeeRegistration.department == row.department
                )
            ).count()
            
            dept_matrix.append({
                "department": row.department,
                "total_staff": row.total_staff,
                "present": p_count,
                "absent": max(0, row.total_staff - p_count),
                "avg_salary": float(row.avg_sal)
            })
            dept_names_chart.append(row.department)
            dept_cost_chart.append(float(row.avg_sal) * row.total_staff)

        # 5. INDUSTRIAL FLOOR PRODUCTIVITY PILLARS RANGE
        work_hours_ranges = db.query(
            func.count(case((DailyAttendance.working_hours < 4, DailyAttendance.id))).label("under_4"),
            func.count(case((and_(DailyAttendance.working_hours >= 4, DailyAttendance.working_hours <= 8), DailyAttendance.id))).label("mid_4_8"),
            func.count(case((and_(DailyAttendance.working_hours > 8, DailyAttendance.working_hours <= 12), DailyAttendance.id))).label("high_8_12"),
            func.count(case((DailyAttendance.working_hours > 12, DailyAttendance.id))).label("over_12")
        ).filter(and_(DailyAttendance.company_id == comp_code, DailyAttendance.duty_date == today)).first()

        productivity_data = [
            int(work_hours_ranges.under_4 or 0),
            int(work_hours_ranges.mid_4_8 or 0),
            int(work_hours_ranges.high_8_12 or 0),
            int(work_hours_ranges.over_12 or 0)
        ]

        # 6. PAYROLL TIERS HISTOGRAM ANALYSIS
        salary_histogram = db.query(
            func.count(case((EmployeeRegistration.current_salary < 10000, EmployeeRegistration.id))).label("tier_1"),
            func.count(case((and_(EmployeeRegistration.current_salary >= 10000, EmployeeRegistration.current_salary < 20000), EmployeeRegistration.id))).label("tier_2"),
            func.count(case((and_(EmployeeRegistration.current_salary >= 20000, EmployeeRegistration.current_salary < 30000), EmployeeRegistration.id))).label("tier_3"),
            func.count(case((EmployeeRegistration.current_salary >= 30000, EmployeeRegistration.id))).label("tier_4")
        ).filter(and_(EmployeeRegistration.company_id == comp_code, EmployeeRegistration.status == "ACTIVE")).first()

        salary_tiers = [
            int(salary_histogram.tier_1 or 0),
            int(salary_histogram.tier_2 or 0),
            int(salary_histogram.tier_3 or 0),
            int(salary_histogram.tier_4 or 0)
        ]

        payroll_stats = db.query(
            func.coalesce(func.sum(EmployeeRegistration.basic_salary + EmployeeRegistration.hra + EmployeeRegistration.conveyance_allowance + EmployeeRegistration.other_expenses), 0.0).label("gross"),
            func.coalesce(func.sum(EmployeeRegistration.current_salary), 0.0).label("net"),
            func.coalesce(func.avg(EmployeeRegistration.current_salary), 0.0).label("avg_sal"),
            func.coalesce(func.max(EmployeeRegistration.current_salary), 0.0).label("max_sal"),
            func.coalesce(func.min(EmployeeRegistration.current_salary), 0.0).label("min_sal")
        ).filter(and_(EmployeeRegistration.company_id == comp_code, EmployeeRegistration.status == "ACTIVE")).first()

        # 7. INCREMENT MODIFICATION REGISTER
        current_year = today.year
        inc_stats = db.query(
            func.count(EmployeeIncrement.id).label("total_inc"),
            func.coalesce(func.avg(EmployeeIncrement.increment_value), 0.0).label("avg_inc_val"),
            func.coalesce(func.max(EmployeeIncrement.increment_value), 0.0).label("max_inc_val")
        ).filter(and_(EmployeeIncrement.company_id == comp_code, extract('year', EmployeeIncrement.effective_from) == current_year)).first()

        increment_ledger_rows = db.query(
            EmployeeIncrement.employee_id,
            EmployeeIncrement.old_salary,
            EmployeeIncrement.new_salary,
            EmployeeIncrement.increment_value,
            EmployeeIncrement.effective_from
        ).filter(EmployeeIncrement.company_id == comp_code).order_by(EmployeeIncrement.effective_from.desc()).limit(5).all()

        increment_table = []
        for r in increment_ledger_rows:
            emp_name = db.query(EmployeeRegistration.employee_name).filter(EmployeeRegistration.employee_id == r.employee_id).scalar() or "Unknown Staff"
            increment_table.append({
                "name": emp_name,
                "old": r.old_salary,
                "new": r.new_salary,
                "increase": r.increment_value,
                "date": r.effective_from.strftime('%d-%b-%Y')
            })

        # 8. STATUTORY COMPLIANCE MARGINS
        pf_coverage_pct = (pf_covered / total_employees * 100) if total_employees > 0 else 0.0
        esi_coverage_pct = (esi_covered / total_employees * 100) if total_employees > 0 else 0.0

        # 9. SALARY ADVANCE CORPORATE ACCOUNTING
        adv_aggregates = db.query(
            func.coalesce(func.sum(EmployeeSalaryAdvance.advance_amount), 0.0).label("issued"),
            func.coalesce(func.sum(EmployeeSalaryAdvance.remaining_balance), 0.0).label("balance"),
            func.coalesce(func.sum(EmployeeSalaryAdvance.paid_amount), 0.0).label("recovered")
        ).filter(EmployeeSalaryAdvance.company_id == comp_code).first()

        adv_outstanding_list = db.query(
            EmployeeSalaryAdvance.employee_name,
            EmployeeSalaryAdvance.advance_amount,
            EmployeeSalaryAdvance.remaining_balance
        ).filter(and_(EmployeeSalaryAdvance.company_id == comp_code, EmployeeSalaryAdvance.remaining_balance > 0)).order_by(
            EmployeeSalaryAdvance.remaining_balance.desc()
        ).limit(5).all()

        # 10. LIFECYCLE ATTRITION METRICS
        new_joiners_90 = base_emp.filter(EmployeeRegistration.joining_date >= today - timedelta(days=90)).count()
        resigned_this_year = base_emp.filter(
            and_(EmployeeRegistration.resignation_date >= date(current_year, 1, 1), EmployeeRegistration.status == "INACTIVE")
        ).count()
        attrition_rate = (resigned_this_year / total_employees * 100) if total_employees > 0 else 0.0

        # 11. CORPORATE CALENDAR EVENTS WIDGET LOGS
        birthday_actives = base_emp.filter(
            and_(extract('month', EmployeeRegistration.dob) == today.month, extract('day', EmployeeRegistration.dob) == today.day)
        ).all()
        anniversary_actives = base_emp.filter(
            and_(extract('month', EmployeeRegistration.joining_date) == today.month, extract('day', EmployeeRegistration.joining_date) == today.day)
        ).all()

        # 12. DYNAMIC REGISTRATION DIRECTORY QUERY LAYERS
        dir_query = db.query(EmployeeRegistration).filter(EmployeeRegistration.company_id == comp_code)
        if dept_filter: dir_query = dir_query.filter(EmployeeRegistration.department == dept_filter)
        if type_filter: dir_query = dir_query.filter(EmployeeRegistration.employee_type == type_filter)
        if status_filter: dir_query = dir_query.filter(EmployeeRegistration.status == status_filter)
        directory_list = dir_query.order_by(EmployeeRegistration.employee_id).all()

        # 13. HR AUDIT RED RISK ALERTS CONTROL CENTER (Fixed `or_` Scope NameError)
        risk_no_pan = base_emp.filter(or_(EmployeeRegistration.pan_number == None, EmployeeRegistration.pan_number == "")).count()
        risk_no_aadhar = base_emp.filter(or_(EmployeeRegistration.aadhar_number == None, EmployeeRegistration.aadhar_number == "")).count()
        risk_no_bank = base_emp.filter(or_(EmployeeRegistration.account_number == None, EmployeeRegistration.account_number == "")).count()
        
        stat_emp_ids = db.query(EmployeeStatutoryMaster.employee_id).filter(EmployeeStatutoryMaster.company_id == comp_code).subquery()
        risk_missing_statutory = base_emp.filter(~EmployeeRegistration.employee_id.in_(stat_emp_ids)).count()

        # 14. LAST 30 DAYS HISTORICAL TIMELINE VELOCITY ARRAYS
        attendance_trend_labels = []
        attendance_trend_data = []
        for i in range(29, -1, -1):
            loop_date = today - timedelta(days=i)
            loop_day_present = base_att.filter(DailyAttendance.duty_date == loop_date).count()
            day_pct = (loop_day_present / active_employees * 100) if active_employees > 0 else 0.0
            attendance_trend_labels.append(loop_date.strftime('%d-%b'))
            attendance_trend_data.append(round(day_pct, 1))

    except Exception as router_err:
        logger.critical(f"HR Operational CommandCenter Grid Pipeline Crash: {str(router_err)}")
        raise router_err

    return templates.TemplateResponse(
        request=request,
        name="dashboard/hr_command_center.html",
        context={
            "company_id": comp_code,
            "production_for": f"HR Capital Run Module ({today.strftime('%d-%b-%Y')})",
            "total_employees": total_employees,
            "active_employees": active_employees,
            "present_today": present_today,
            "absent_today": absent_today,
            "open_shifts": open_shifts,
            "overtime_count": overtime_count,
            "double_duty_count": double_duty_count,
            "new_joiners_month": new_joiners_month,
            "advances_outstanding": advances_outstanding,
            "pf_covered": pf_covered,
            "esi_covered": esi_covered,
            "monthly_payroll": monthly_payroll,
            "gender_labels": gender_labels,
            "gender_values": gender_values,
            "blood_groups": blood_groups,
            "dept_matrix": dept_matrix,
            "dept_names_chart": dept_names_chart,
            "dept_cost_chart": dept_cost_chart,
            "productivity_data": productivity_data,
            "salary_tiers": salary_tiers,
            "payroll_stats": payroll_stats,
            "inc_stats": inc_stats,
            "increment_table": increment_table,
            "pf_coverage_pct": round(pf_coverage_pct, 1),
            "esi_coverage_pct": round(esi_coverage_pct, 1),
            "adv_aggregates": adv_aggregates,
            "adv_outstanding_list": adv_outstanding_list,
            "new_joiners_90": new_joiners_90,
            "attrition_rate": round(attrition_rate, 1),
            "birthday_actives": birthday_actives,
            "anniversary_actives": anniversary_actives,
            "directory_list": directory_list,
            "risk_no_pan": risk_no_pan,
            "risk_no_aadhar": risk_no_aadhar,
            "risk_no_bank": risk_no_bank,
            "risk_missing_statutory": risk_missing_statutory,
            "attendance_trend_labels": attendance_trend_labels,
            "attendance_trend_data": attendance_trend_data,
            "dept_filter": dept_filter,
            "type_filter": type_filter,
            "status_filter": status_filter
        }
    )