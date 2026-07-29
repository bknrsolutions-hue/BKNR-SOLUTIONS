"""
HRMS Automations Service — All 15 Missing HRMS Flows
=====================================================
H1. Leave Management (Types, Balances, Applications, LWP in Payroll, Encashment)
H2. TDS on Salary (Old/New Regime, HRA Exempt, Std Ded, Chapter VI-A, 80C/80D/80CCD1B)
H3. Full & Final (F&F) Settlement (Leave Encashment, Gratuity, Notice Pay, Auto JV)
H4. Explicit Salary Approval Workflow (Before Payment)
H5. PF ECR Text File (EPFO format) + Form 16 YTD Computation + PDF data
H6. Bonus (Statutory 8.33% / Festival / Performance)
H7. Gratuity Monthly Provision (15/26 Formula)
H8. Reimbursements (Medical / Fuel / LTA / Telephone) Perquisites + Auto JV
H9. Salary Arrears Retro Diff (Basic/HR/Conv/Special) + Statutory catch-up
H10. ESI Monthly Return CSV
H11. Payslip Generator
H12. Bulk Salary Payment NEFT CSV (Bank Upload)
H13. Contractor Labour Attendance → Contractor Bill JV Link
H14. 12BB Proof Submission + TDS Recompute Hook
H15. Headcount & Cost-Center P&L Salary Report (YTD)

Double-Entry Tally Rules Reused from PostingEngine:
  Dr. Salary/Wages/Bonus/Gratuity/Reimbursement Expense
  Cr. Salaries Payable / Statutory Payables (PF/EPF/EPS/EDLI/ESI/PT/LWF/TDS) / Bank
"""
import logging
import hashlib
import csv
import io
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP, ROUND_UP
from dateutil.relativedelta import relativedelta
from typing import Optional

from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, func, or_

from app.database.models.enterprise_finance import (
    LedgerMaster,
    VoucherHeader,
    SalaryProcessing,
)
from app.database.models.attendance import (
    EmployeeRegistration,
    DailyAttendance,
    EmployeeStatutoryMaster,
    EmployeeSalaryAdvance,
    EmployeeIncrement,
    ContractLabour,
    ContractLabourAttendance,
    LeaveTypeConfig,
    EmployeeLeaveBalance,
    LeaveApplication,
    LeaveEncashment,
    TDSConfigMaster,
    EmployeeITDDeclaration,
    EmployeeITReceiptUpload,
    EmployeeFullAndFinal,
    EmployeeBonus,
    EmployeeGratuityProvision,
    EmployeeReimbursement,
    EmployeeSalaryArrears,
    StatutoryFilingLog,
    EmployeeForm16Record,
)
from app.services.posting_engine import PostingEngineService
from app.services.payroll_statutory import calculate_pf_esi, nearest_rupee, next_higher_rupee

logger = logging.getLogger(__name__)

Q = Decimal("0.01")
Q0 = Decimal("1.0")


def q2(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(Q, rounding=ROUND_HALF_UP)


def q0(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(Q0, rounding=ROUND_HALF_UP)


def fy_label(d: date) -> str:
    """April–March FY, e.g. 2026-04-01 → 2026-2027"""
    if d.month >= 4:
        return f"{d.year}-{d.year + 1}"
    return f"{d.year - 1}-{d.year}"


def month_key(d: date) -> str:
    return f"{d.year:04d}-{d.month:02d}"


def month_days(mk: str) -> int:
    """Return 26-day month for payroll; keep consistent with existing 26-day logic in salaries.py"""
    return 26


# =====================================================================
# H1. LEAVE MANAGEMENT
# =====================================================================
def run_monthly_leave_accrual(
    db: Session,
    company_id: str,
    accrual_month: str,  # YYYY-MM
    created_by: str = "SYSTEM",
) -> dict:
    """
    Each LeaveTypeConfig's `accrual_monthly` days are added to every ACTIVE employee's
    LeaveBalance row (opening+accrued−closed = closing).  Creates FY balance row if missing.
    """
    year_int, month_int = map(int, accrual_month.split("-"))
    fy = fy_label(date(year_int, month_int, 1))
    leave_types = db.query(LeaveTypeConfig).filter(
        LeaveTypeConfig.company_id == company_id, LeaveTypeConfig.status == "ACTIVE"
    ).all()
    if not leave_types:
        return {"status": "SKIPPED", "reason": "No leave types configured"}
    emps = db.query(EmployeeRegistration).filter(
        EmployeeRegistration.company_id == company_id, EmployeeRegistration.status == "ACTIVE"
    ).all()
    rows_updated = 0
    for emp in emps:
        jd = emp.joining_date or date(year_int, month_int, 1)
        if jd.year == year_int and jd.month > month_int:
            continue
        for lt in leave_types:
            if lt.min_service_months:
                svc = relativedelta(date(year_int, month_int, 1), jd)
                months = svc.years * 12 + svc.months
                if months < lt.min_service_months:
                    continue
            bal = (
                db.query(EmployeeLeaveBalance)
                .filter(
                    EmployeeLeaveBalance.company_id == company_id,
                    EmployeeLeaveBalance.employee_id == emp.employee_id,
                    EmployeeLeaveBalance.leave_code == lt.leave_code,
                    EmployeeLeaveBalance.financial_year == fy,
                )
                .first()
            )
            if bal is None:
                bal = EmployeeLeaveBalance(
                    company_id=company_id, employee_id=emp.employee_id,
                    employee_name=emp.employee_name, leave_code=lt.leave_code,
                    financial_year=fy, opening_balance=0.0, accrued_days=0.0,
                    approved_days=0.0, lwp_days=0.0, encashed_days=0.0,
                    closing_balance=0.0,
                )
                db.add(bal)
                db.flush()
            if bal.last_accrual_month == accrual_month:
                continue
            bal.accrued_days = float(q2(bal.accrued_days + lt.accrual_monthly))
            bal.closing_balance = float(q2(
                bal.opening_balance + bal.accrued_days - bal.approved_days - bal.encashed_days
            ))
            if bal.closing_balance > lt.max_carry_forward_balance and lt.leave_code == "EL":
                # auto encash excess over max
                excess = bal.closing_balance - lt.max_carry_forward_balance
                bal.encashed_days = float(q2(bal.encashed_days + excess))
                bal.closing_balance = float(lt.max_carry_forward_balance)
            bal.last_accrual_month = accrual_month
            rows_updated += 1
    db.commit()
    return {"status": "OK", "accrued_rows": rows_updated, "leave_types": len(leave_types),
            "active_employees": len(emps)}


def calculate_lwp_days_for_employee_month(
    db: Session,
    company_id: str,
    employee_id: str,
    month_year: str,
) -> float:
    """
    Count LeaveApplication rows for this employee in month:
      - LWP leave_code → full days count
      - Other APPROVED leave → only days that exceed balance count as LWP
    Returns total_lwp_days (float, half-day allowed)
    """
    y, m = map(int, month_year.split("-"))
    m_start = date(y, m, 1)
    m_end = (m_start + relativedelta(months=1)) - timedelta(days=1)
    apps = db.query(LeaveApplication).filter(
        LeaveApplication.company_id == company_id,
        LeaveApplication.employee_id == employee_id,
        LeaveApplication.status == "APPROVED",
        LeaveApplication.leave_from <= m_end,
        LeaveApplication.leave_to >= m_start,
    ).all()
    total_lwp = 0.0
    fy = fy_label(m_start)
    for lapp in apps:
        d1 = max(lapp.leave_from, m_start)
        d2 = min(lapp.leave_to, m_end)
        days_in_month = (d2 - d1).days + 1
        if lapp.half_day_flag in ("FIRST_HALF", "SECOND_HALF"):
            days_in_month = days_in_month * 0.5
        if lapp.leave_code == "LWP":
            total_lwp += days_in_month
            continue
        bal = db.query(EmployeeLeaveBalance).filter(
            EmployeeLeaveBalance.company_id == company_id,
            EmployeeLeaveBalance.employee_id == employee_id,
            EmployeeLeaveBalance.leave_code == lapp.leave_code,
            EmployeeLeaveBalance.financial_year == fy,
        ).first()
        available = float(bal.closing_balance) + float(lapp.total_days) if bal else 0.0
        if available < lapp.total_days:
            shortfall = lapp.total_days - available
            ratio = min(1.0, shortfall / max(lapp.total_days, 1e-6))
            total_lwp += days_in_month * ratio
    return float(q2(total_lwp))


def approve_leave_application(
    db: Session,
    application_id: int,
    approver: str,
    stage: str = "MANAGER",
    approve: bool = True,
    remark: Optional[str] = None,
) -> LeaveApplication | None:
    lapp = db.query(LeaveApplication).get(application_id)
    if not lapp or lapp.status in ("APPROVED", "REJECTED", "CANCELLED"):
        return None
    now = datetime.utcnow()
    if stage == "MANAGER":
        lapp.manager_remark = remark
        lapp.manager_decision_at = now
        if approve is False:
            lapp.status = "REJECTED"
    elif stage == "HR":
        lapp.hr_remark = remark
        lapp.hr_decision_at = now
        if approve:
            lapp.status = "APPROVED"
            bal = db.query(EmployeeLeaveBalance).filter(
                EmployeeLeaveBalance.company_id == lapp.company_id,
                EmployeeLeaveBalance.employee_id == lapp.employee_id,
                EmployeeLeaveBalance.leave_code == lapp.leave_code,
                EmployeeLeaveBalance.financial_year == fy_label(lapp.leave_from),
            ).first()
            if bal:
                if lapp.leave_code == "LWP":
                    bal.lwp_days = float(q2(bal.lwp_days + lapp.total_days))
                else:
                    bal.approved_days = float(q2(bal.approved_days + lapp.total_days))
                bal.closing_balance = float(q2(
                    bal.opening_balance + bal.accrued_days - bal.approved_days - bal.encashed_days
                ))
        else:
            lapp.status = "REJECTED"
    db.commit()
    db.refresh(lapp)
    return lapp


# =====================================================================
# H2. INCOME TAX (TDS ON SALARY) — SLAB BASED + HRA + CHAPTER 6A
# =====================================================================

def seed_default_tds_slabs(db: Session, fy: str = "2026-2027") -> int:
    """
    Seed NEW Regime FY2026-27 slabs (default India Budget 2024):
      0-3L        nil
      3L-6L       5%
      6L-9L       10%
      9L-12L      15%
      12L-15L     20%
      15L+        30%
    + OLD regime slabs for legacy
    + CESS 4%, Surcharge if income >= 50L (10%) etc
    """
    existing = db.query(TDSConfigMaster).filter(TDSConfigMaster.financial_year == fy).first()
    if existing:
        return 0
    slabs_new = [
        (0, 300000, 0.0), (300001, 600000, 5.0), (600001, 900000, 10.0),
        (900001, 1200000, 15.0), (1200001, 1500000, 20.0), (1500001, 999999999, 30.0),
    ]
    slabs_old = [
        (0, 250000, 0.0), (250001, 500000, 5.0), (500001, 1000000, 20.0),
        (1000001, 999999999, 30.0),
    ]
    rows = 0
    for s in slabs_new:
        db.add(TDSConfigMaster(
            financial_year=fy, tax_regime="NEW", slab_from=s[0], slab_to=s[1],
            tax_percent=s[2], cess_percent=4.0, rebate_115bac_amount=25000 if s[1] >= 1200000 else 0,
        ))
        rows += 1
    for s in slabs_old:
        db.add(TDSConfigMaster(
            financial_year=fy, tax_regime="OLD", slab_from=s[0], slab_to=s[1],
            tax_percent=s[2], cess_percent=4.0,
        ))
        rows += 1
    db.commit()
    return rows


def compute_hra_exemption(basic_da: float, hra_received: float, monthly_rent: float, is_metro: bool) -> float:
    """
    HRA exempt = MIN(
        1. Actual HRA received (annual)
        2. 50% (metro) / 40% (non-metro) of (Basic + DA) — ANNUALIZED
        3. Rent paid annual − 10% of (Basic + DA) — ANNUALIZED
    )
    Negative treated as 0. All inputs monthly-based for consistency, internal annualize.
    """
    pct = 0.50 if is_metro else 0.40
    a = float(hra_received)
    basic_annual = float(basic_da) * 12
    b = basic_annual * pct
    rent_annual = float(monthly_rent) * 12
    tenpct = basic_annual * 0.10
    c = max(0.0, rent_annual - tenpct)
    return float(q2(max(0.0, min(a, b, c))))


def compute_slab_tax(taxable_income: float, slabs: list) -> float:
    taxable = float(taxable_income)
    tax = 0.0
    for s in slabs:
        slab_w = max(0.0, min(float(s.slab_to), taxable) - float(s.slab_from) + 1)
        if slab_w <= 1:
            continue
        tax += slab_w * (float(s.tax_percent) / 100.0)
    return tax


def compute_annual_tds(
    db: Session,
    company_id: str,
    employee_id: str,
    projected_annual_gross: float,
    financial_year: str,
) -> dict:
    """
    Returns dict: { taxable, tax_before_cess, cess, surcharge, rebate_115bac, total_annual_tax, monthly_tds }
    """
    dec = (
        db.query(EmployeeITDDeclaration)
        .filter(
            EmployeeITDDeclaration.company_id == company_id,
            EmployeeITDDeclaration.employee_id == employee_id,
            EmployeeITDDeclaration.financial_year == financial_year,
        )
        .first()
    )
    if dec is None:
        regime = "NEW"
        std_ded = 50000.0
        hra_exempt = 0.0
        chap6a = 0.0
        std_allow_exempt = 0.0
    else:
        regime = dec.tax_regime_opted or "NEW"
        std_ded = float(dec.standard_deduction) if regime == "NEW" else 50000.0
        hra_exempt = float(dec.hra_exempt) or 0.0
        chap6a = 0.0 if regime == "NEW" else float(dec.chapter_vi_a_total or 0)
        food = float(dec.food_coupons_monthly or 0) * 12
        if food > 2200 * 12:
            food = 2200 * 12
        std_allow_exempt = food + float(dec.lta_claimed or 0) + float(dec.any_other_exemption or 0)

    gross_income = float(projected_annual_gross)
    # Standard deduction 50k
    step1 = max(0.0, gross_income - std_ded)
    # HRA exempt (Old regime, NEW for FY26 onwards also partial)
    step2 = max(0.0, step1 - hra_exempt)
    # Allowances: food 2200/month, LTA, other
    step3 = max(0.0, step2 - std_allow_exempt)
    # Chapter VI-A (Old regime only, NEW removed most)
    taxable = max(0.0, step3 - chap6a)

    slabs = (
        db.query(TDSConfigMaster)
        .filter(TDSConfigMaster.financial_year == financial_year, TDSConfigMaster.tax_regime == regime)
        .order_by(TDSConfigMaster.slab_from)
        .all()
    )
    if not slabs:
        seed_default_tds_slabs(db, financial_year)
        slabs = db.query(TDSConfigMaster).filter(
            TDSConfigMaster.financial_year == financial_year, TDSConfigMaster.tax_regime == regime
        ).order_by(TDSConfigMaster.slab_from).all()

    tax_before = compute_slab_tax(taxable, slabs)
    # Rebate u/s 87A (NEW Regime FY26: taxable <=12L → rebate up to 25000)
    rebate = 0.0
    if regime == "NEW" and taxable <= 1200000 and tax_before > 0:
        rebate = min(tax_before, 25000.0)
    after_rebate = max(0.0, tax_before - rebate)
    # Surcharge: if taxable >= 50L then 10%, >=1Cr 15%, etc (simplified 10%)
    surcharge = 0.0
    if taxable >= 5000000:
        surcharge = after_rebate * 0.10
    cess = (after_rebate + surcharge) * 0.04
    total = after_rebate + surcharge + cess
    monthly = float(q2(total / 12))
    return {
        "gross_income": gross_income, "taxable": float(q2(taxable)),
        "tax_before_cess": float(q2(after_rebate)), "surcharge": float(q2(surcharge)),
        "cess": float(q2(cess)), "rebate_87a": float(q2(rebate)),
        "total_annual_tax": float(q2(total)), "monthly_tds": monthly,
        "regime": regime, "std_ded": std_ded, "hra_exempt": hra_exempt,
        "chapter_via": chap6a, "allowances_exempt": std_allow_exempt,
    }


def calculate_employee_monthly_tds(
    db: Session,
    company_id: str,
    employee_id: str,
    monthly_gross: float,
    month_year: str,
    tds_deducted_so_far_ytd: float = 0.0,
) -> float:
    """
    Project annual, compute annual tax, monthly = (remaining_months × monthly_tds − excess_ytd) ÷ remaining
    """
    y, m = map(int, month_year.split("-"))
    fy = fy_label(date(y, m, 1))
    months_remaining = max(1, 12 - m + 1 if m >= 4 else (4 - m))
    projected = float(monthly_gross) * 12
    annual = compute_annual_tds(db, company_id, employee_id, projected, fy)
    total_left = max(0.0, annual["total_annual_tax"] - float(tds_deducted_so_far_ytd))
    return float(q2(total_left / months_remaining))


# =====================================================================
# H3. FULL & FINAL (F&F) SETTLEMENT
# =====================================================================

def compute_full_and_final(
    db: Session,
    company_id: str,
    employee_id: str,
    last_working_date: date,
    notice_period_months: int = 1,
    created_by: str = "SYSTEM",
) -> EmployeeFullAndFinal:
    emp = db.query(EmployeeRegistration).filter(
        EmployeeRegistration.company_id == company_id, EmployeeRegistration.employee_id == employee_id
    ).first()
    if not emp:
        raise ValueError(f"Employee {employee_id} not found")
    jd = emp.joining_date or last_working_date
    yos_days = (last_working_date - jd).days
    years_of_service = float(q2(yos_days / 365.0))
    # Last month pro-rate salary
    lw = last_working_date
    last_month = date(lw.year, lw.month, 1)
    day_in_month = (lw - last_month).days + 1
    pro_rate = float(q2(float(emp.current_salary or 0) * day_in_month / 26))
    # Leave Encashment (EL)
    fy = fy_label(lw)
    el_bal = (
        db.query(EmployeeLeaveBalance)
        .filter(
            EmployeeLeaveBalance.company_id == company_id,
            EmployeeLeaveBalance.employee_id == employee_id,
            EmployeeLeaveBalance.leave_code == "EL",
            EmployeeLeaveBalance.financial_year == fy,
        )
        .first()
    )
    el_days = float(el_bal.closing_balance) if el_bal else 0.0
    basic_per_day = float(emp.basic_salary or 0) / 26
    leave_encash = float(q2(el_days * basic_per_day))
    # Gratuity: 4+ years + 240 days in 5th year → eligible; formula (basic*15/26) × completed years; max 20L
    gratuity = 0.0
    completed_yrs = int(years_of_service)
    if completed_yrs >= 5 or (yos_days >= (365 * 4 + 240)):
        gratuity_per_year = float(emp.basic_salary or 0) * 15 / 26
        gratuity = float(q2(gratuity_per_year * completed_yrs))
        if gratuity > 2000000.0:
            gratuity = 2000000.0
    # Outstanding advance
    adv_q = (
        db.query(func.coalesce(func.sum(EmployeeSalaryAdvance.remaining_balance), 0.0))
        .filter(
            EmployeeSalaryAdvance.employee_id == employee_id,
            EmployeeSalaryAdvance.status != "CLOSED",
        )
        .scalar()
    ) or 0.0
    # Salary arrears (unpaid): sum DRAFT net payable
    arr_q = (
        db.query(func.coalesce(func.sum(SalaryProcessing.net_payable), 0.0))
        .filter(
            SalaryProcessing.company_id == company_id, SalaryProcessing.employee_id == employee_id,
            SalaryProcessing.status != "PAID",
        )
        .scalar()
    ) or 0.0
    # Notice Pay Deduction
    notice_pay = 0.0
    rd = emp.resignation_date or lw
    notice_served_months = max(0, (relativedelta(lw, rd).years * 12 + relativedelta(lw, rd).months))
    if notice_served_months < notice_period_months:
        shortfall = notice_period_months - notice_served_months
        notice_pay = float(q2(float(emp.current_salary or 0) * shortfall))
    gross = pro_rate + leave_encash + gratuity + float(arr_q) + 0 + 0  # +bonus +others later
    # TDS on total: LW month → fy; projection use total as gross
    fytds = fy_label(lw)
    # simplified tds on settlement: lump sum (tax slab treat)
    ytd_gross = float(
        db.query(func.coalesce(func.sum(SalaryProcessing.earned_gross), 0.0)).filter(
            SalaryProcessing.company_id == company_id, SalaryProcessing.employee_id == employee_id,
            SalaryProcessing.month_year.between(f"{fytds[:4]}-04", f"{int(fytds[:4])+1}-03") if len(fytds)==9 or True else True,
        ).scalar() or 0.0
    )
    tds_yearly = compute_annual_tds(db, company_id, employee_id, max(ytd_gross, gross) * 1.0, fytds)
    gross_settle = float(q2(gross))
    tds_on_grat = 0.0 if gratuity <= 2000000 else (gratuity - 2000000) * 0.30 * 1.04
    tds_on_le = leave_encash * 0.10 * 1.04
    total_tds = float(q2(tds_on_grat + tds_on_le))
    net = float(q2(gross_settle - notice_pay - float(adv_q) - total_tds))
    existing = db.query(EmployeeFullAndFinal).filter(
        EmployeeFullAndFinal.company_id == company_id, EmployeeFullAndFinal.employee_id == employee_id
    ).first()
    if existing:
        ff = existing
    else:
        ff = EmployeeFullAndFinal(
            company_id=company_id, employee_id=employee_id, employee_name=emp.employee_name,
            resignation_date=emp.resignation_date,
        )
        db.add(ff)
    ff.last_working_date = last_working_date
    ff.relieving_date = last_working_date
    ff.years_of_service = years_of_service
    ff.notice_period_months = notice_period_months
    ff.notice_pay_deduction = notice_pay
    ff.last_month_pro_rate_salary = pro_rate
    ff.leave_encashment_amount = leave_encash
    ff.salary_arrears = float(arr_q)
    ff.gratuity_payable = gratuity
    ff.outstanding_advance_recovery = float(adv_q)
    ff.gross_settlement = gross_settle
    ff.total_tds_deducted = total_tds
    ff.net_settlement = net
    ff.prepared_by = created_by
    db.commit()
    db.refresh(ff)
    return ff


def post_ff_settlement_jv(db: Session, ff_id: int, voucher_date: date,
                          salary_expense_ledger: str, leave_encash_exp: str,
                          gratuity_exp: str, salaries_payable: str,
                          tds_ledger: str, adv_recovery_cr: str,
                          bank_ledger: str, created_by: str = "SYSTEM",
                          ) -> dict:
    ff = db.query(EmployeeFullAndFinal).get(ff_id)
    if not ff:
        return {"status": "ERROR", "reason": "FF not found"}
    dr_cr = []
    # DR side
    dr_cr.append(("DR", salary_expense_ledger, ff.last_month_pro_rate_salary))
    dr_cr.append(("DR", leave_encash_exp, ff.leave_encashment_amount))
    dr_cr.append(("DR", gratuity_exp, ff.gratuity_payable))
    if ff.salary_arrears > 0:
        dr_cr.append(("DR", salary_expense_ledger, ff.salary_arrears))
    # CR side
    total_dr = sum(x[2] for x in dr_cr)
    cr_cr = []
    cr_cr.append(("CR", salaries_payable, ff.net_settlement))
    cr_cr.append(("CR", tds_ledger, ff.total_tds_deducted))
    if ff.outstanding_advance_recovery > 0:
        cr_cr.append(("CR", adv_recovery_cr, ff.outstanding_advance_recovery))
    if ff.notice_pay_deduction > 0:
        cr_cr.append(("CR", salary_expense_ledger, ff.notice_pay_deduction))
    total_cr = sum(x[2] for x in cr_cr)
    diff = float(q2(total_dr - total_cr))
    if abs(diff) > 0.01:
        # round to payable
        cr_cr.append(("CR", salaries_payable, diff))
    company = ff.company_id
    narr = f"F&F Settlement: {ff.employee_name} LWD {ff.last_working_date}"
    lines = dr_cr + cr_cr
    try:
        vh = PostingEngineService.create_voucher(
            db, voucher_type="JV", company_id=company,
            voucher_date=voucher_date, narration=narr,
            lines=lines, created_by=created_by, status="POSTED",
        )
        ff.ff_journal_id = vh.id
        db.commit()
    except Exception as ex:
        logger.exception(ex)
        return {"status": "ERROR", "reason": str(ex)}
    return {"status": "OK", "jv_id": vh.id, "jv_no": vh.voucher_no,
            "total_dr": float(q2(total_dr)), "total_cr": float(q2(total_cr + diff))}


# =====================================================================
# H4. EXPLICIT SALARY APPROVAL WORKFLOW
# =====================================================================

def approve_salary_row(db: Session, salary_id: int, approved_by: str = "SYSTEM",
                       narration: Optional[str] = None, **_unused_ledgers,
                       ) -> dict:
    sp = db.query(SalaryProcessing).get(salary_id)
    if sp is None:
        return {"status": "ERROR", "reason": "SalaryProcessing row not found"}
    status = (sp.status or "DRAFT").strip().upper()
    if status in ("APPROVED", "PAID"):
        return {"status": "SKIPPED", "reason": f"Already {status}", "id": sp.id}
    try:
        vh = PostingEngineService.post_salary_approval(
            db, company_id=sp.company_id or "C001", entry=sp,
        )
    except TypeError:
        # older positional-only signature
        vh = PostingEngineService.post_salary_approval(
            db, sp.company_id or "C001", sp,
        )
    sp.status = "APPROVED"
    sp.salary_journal_id = vh.id
    if hasattr(sp, "approved_by"):
        sp.approved_by = approved_by
    db.commit()
    db.refresh(sp)
    return {"status": "OK", "salary_id": sp.id, "journal_id": vh.id, "voucher_no": getattr(vh, "voucher_no", None) or f"JV-{sp.id}"}


def bulk_approve_salaries(db: Session, company_id: str, month_year: str, approved_by: str = "SYSTEM", **ledgers) -> dict:
    rows = db.query(SalaryProcessing).filter(
        SalaryProcessing.company_id == company_id, SalaryProcessing.month_year == month_year,
        SalaryProcessing.status.in_(["DRAFT", "APPROVED"])
    ).all()
    approved = 0
    skipped = 0
    jv_ids = []
    for r in rows:
        res = approve_salary_row(db, r.id, approved_by=approved_by, **ledgers)
        if res.get("status") == "OK":
            approved += 1
            jv_ids.append(res["journal_id"])
        else:
            skipped += 1
    return {"status": "OK", "approved": approved, "skipped": skipped,
            "month_year": month_year, "journal_ids": jv_ids}


# =====================================================================
# H5. PF ECR (Electronic Challan Cum Return) TEXT FILE GENERATOR
# =====================================================================

def generate_pf_ecr_text(
    db: Session, company_id: str, month_year: str,
    epf_wage_ledger: Optional[str] = None, eps_wage_ledger: Optional[str] = None,
    created_by: str = "SYSTEM",
) -> dict:
    """
    Standard PF ECR line format (v2.0 ~12 columns pipe-separated):
      UAN | MemberName | EPF_Wages | EPS_Wages | EDLI_Wages | EPF_Contri_Refund |
      EPS_Contri_Refund | EPF_EE_Contribution | EPF_ER_Contribution | EPS_ER_Contribution |
      EDLI_ER_Contribution | NCP_Days

    Returns { file_content (str), hash, totals (dict), employees (n), filing_log_id }
    """
    y, m = map(int, month_year.split("-"))
    mn = f"{y:04d}-{m:02d}"
    salary_rows = (
        db.query(SalaryProcessing)
        .join(EmployeeRegistration, SalaryProcessing.employee_id == EmployeeRegistration.employee_id)
        .join(EmployeeStatutoryMaster,
              SalaryProcessing.employee_id == EmployeeStatutoryMaster.employee_id,
              isouter=True)
        .filter(
            SalaryProcessing.company_id == company_id,
            SalaryProcessing.month_year == month_year,
            EmployeeStatutoryMaster.pf_applicable == True,  # noqa: E712
        )
        .all()
    )
    lines = []
    totals = {"epf_wages": 0.0, "eps_wages": 0.0, "edli_wages": 0.0,
              "ee_epf": 0.0, "er_epf": 0.0, "er_eps": 0.0, "er_edli": 0.0, "ncp": 0}
    for sp in salary_rows:
        uan = "UAN-XXXX"  # fallback
        emp = db.query(EmployeeRegistration).filter(EmployeeRegistration.employee_id == sp.employee_id).first()
        if emp and emp.uan_number:
            uan = emp.uan_number
        ncp = 0
        present = float(sp.present_days or 0)
        if present < 26:
            ncp = 26 - int(present)
        epf_wages = float(sp.pf_wages_employee or sp.earned_basic or 0)
        eps_wages = float(sp.pf_wages_employee or 0)
        if eps_wages > 15000:
            eps_wages = 15000
        edli_wages = eps_wages
        ee_epf = float(sp.pf_employee or 0)
        er_epf = float(sp.epf_employer or 0)
        er_eps = float(sp.eps_employer or 0)
        er_edli = float(sp.edli_employer or 0)
        totals["epf_wages"] += epf_wages
        totals["eps_wages"] += eps_wages
        totals["edli_wages"] += edli_wages
        totals["ee_epf"] += ee_epf
        totals["er_epf"] += er_epf
        totals["er_eps"] += er_eps
        totals["er_edli"] += er_edli
        totals["ncp"] += ncp
        name = (emp.employee_name or "").replace("|", " ") if emp else (sp.employee_name or "")
        row = "|".join([
            uan, name[:90],
            f"{q0(epf_wages):.0f}", f"{q0(eps_wages):.0f}", f"{q0(edli_wages):.0f}",
            "0", "0",
            f"{q0(ee_epf):.0f}", f"{q0(er_epf):.0f}", f"{q0(er_eps):.0f}", f"{q0(er_edli):.0f}",
            str(ncp),
        ])
        lines.append(row)
    # ECR header line (@[company][month_year][rates]...)
    header = f"@PC0015030{y:04d}{m:02d}010000001{len(lines):010d}{q0(sum(totals.values())-totals['ncp']):015.0f}".replace(" ", "0")
    ecr = "\n".join([header] + lines)
    h = hashlib.sha256(ecr.encode("utf-8")).hexdigest()
    log = StatutoryFilingLog(
        company_id=company_id, month_year=month_year, filing_type="PF_ECR",
        number_of_records=len(lines),
        total_employee_contribution=float(q2(totals["ee_epf"])),
        total_employer_contribution=float(q2(totals["er_epf"] + totals["er_eps"] + totals["er_edli"])),
        total_challan_amount=float(q2(totals["ee_epf"] + totals["er_epf"] + totals["er_eps"] + totals["er_edli"])),
        generated_text_hash=h, filing_status="GENERATED", created_by=created_by,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return {
        "status": "OK", "month_year": mn, "employees": len(lines),
        "file_content": ecr, "sha256": h, "totals": {k: float(q2(v)) for k, v in totals.items()},
        "filing_log_id": log.id,
    }


# =====================================================================
# H6. BONUS
# =====================================================================

def compute_bonus_for_fy(db: Session, company_id: str, financial_year: str,
                         bonus_type: str = "STATUTORY", bonus_percent: float = 8.33,
                         payable_basic_cap: float = 7000.0, months: int = 12,
                         created_by: str = "SYSTEM",
                         ) -> dict:
    emps = db.query(EmployeeRegistration).filter(
        EmployeeRegistration.company_id == company_id, EmployeeRegistration.status == "ACTIVE"
    ).all()
    created = 0
    for emp in emps:
        basic = float(emp.basic_salary or 0)
        payable = min(basic, payable_basic_cap)
        gross = float(q2(payable * (bonus_percent / 100.0) * months))
        tds = 0.0
        if gross > 5000:
            tds = float(q2(gross * 0.10 * 1.04))
        net = float(q2(gross - tds))
        existing = db.query(EmployeeBonus).filter(
            EmployeeBonus.company_id == company_id, EmployeeBonus.employee_id == emp.employee_id,
            EmployeeBonus.bonus_type == bonus_type, EmployeeBonus.financial_year == financial_year,
        ).first()
        if existing:
            continue
        b = EmployeeBonus(
            company_id=company_id, employee_id=emp.employee_id, employee_name=emp.employee_name,
            department=emp.department, financial_year=financial_year, bonus_type=bonus_type,
            bonus_percent=bonus_percent, payable_basic=payable, payable_months=months,
            gross_bonus=gross, tds_deducted=tds, net_bonus_payable=net,
        )
        db.add(b)
        created += 1
    db.commit()
    return {"status": "OK", "bonus_rows_created": created, "type": bonus_type,
            "percent": bonus_percent, "financial_year": financial_year}


# =====================================================================
# H7. GRATUITY MONTHLY PROVISION
# =====================================================================

def run_gratuity_monthly_provision(
    db: Session, company_id: str, month_year: str,
    gratuity_exp_ledger: str = "Gratuity Expense A/c",
    gratuity_provision_ledger: str = "Gratuity Provision A/c",
    created_by: str = "SYSTEM",
) -> dict:
    y, m = map(int, month_year.split("-"))
    md = date(y, m, 1)
    emps = db.query(EmployeeRegistration).filter(
        EmployeeRegistration.company_id == company_id, EmployeeRegistration.status == "ACTIVE"
    ).all()
    rows = 0
    for emp in emps:
        jd = emp.joining_date or md
        yos = (md - jd).days / 365.0
        prov = 0.0
        if yos >= 1.0:
            basic = float(emp.basic_salary or 0)
            per_year = basic * 15.0 / 26.0
            full_liability = per_year * int(yos)
            prov = float(q2(full_liability / 12.0))
        existing = db.query(EmployeeGratuityProvision).filter(
            EmployeeGratuityProvision.company_id == company_id,
            EmployeeGratuityProvision.employee_id == emp.employee_id,
            EmployeeGratuityProvision.month_year == month_year,
        ).first()
        if existing:
            continue
        g = EmployeeGratuityProvision(
            company_id=company_id, employee_id=emp.employee_id, employee_name=emp.employee_name,
            department=emp.department, month_year=month_year, years_of_service=float(q2(yos)),
            last_drawn_basic_da=float(emp.basic_salary or 0),
            monthly_provision_amount=prov,
        )
        db.add(g)
        rows += 1
    db.commit()
    # POST aggregate JV for month
    total_prov = float(db.query(func.coalesce(func.sum(EmployeeGratuityProvision.monthly_provision_amount), 0.0)).filter(
        EmployeeGratuityProvision.company_id == company_id,
        EmployeeGratuityProvision.month_year == month_year,
    ).scalar() or 0.0)
    vh = None
    if total_prov > 0:
        lines = [("DR", gratuity_exp_ledger, total_prov), ("CR", gratuity_provision_ledger, total_prov)]
        vh = PostingEngineService.create_voucher(
            db, "JV", company_id, md,
            narration=f"Gratuity Provision {month_year}",
            lines=lines, created_by=created_by, status="POSTED",
        )
        # store back log
    return {"status": "OK", "rows": rows, "monthly_total_provision": float(q2(total_prov)),
            "jv_id": vh.id if vh else None, "voucher_no": vh.voucher_no if vh else None}


# =====================================================================
# H8. REIMBURSEMENTS AUTO JV
# =====================================================================

def post_reimbursement_bill_jv(
    db: Session, reimbursement_id: int, voucher_date: date,
    expense_ledger_map: Optional[dict] = None,
    payable_ledger: str = "Employee Reimbursement Payable A/c",
    tds_perquisite_ledger: str = "TDS Payable on Perquisites A/c",
    created_by: str = "SYSTEM",
) -> dict:
    r = db.query(EmployeeReimbursement).get(reimbursement_id)
    if not r or r.status == "PAID":
        return {"status": "ERROR", "reason": "Invalid reimbursement"}
    exp_map = expense_ledger_map or {
        "MEDICAL": "Staff Medical Expenses A/c",
        "FUEL": "Staff Fuel / Conveyance Reimbursement A/c",
        "LTA": "LTA / Leave Travel Allowance Expense A/c",
        "TELEPHONE": "Telephone Expense Staff A/c",
        "FOOD": "Staff Food Expense A/c",
        "OTHER": "Staff Welfare Expenses A/c",
    }
    dr_ledger = exp_map.get(r.category, "Staff Welfare Expenses A/c")
    lines = [("DR", dr_ledger, r.approved_amount)]
    cr_pay = max(0.0, float(r.approved_amount) - float(r.tds_on_perquisites))
    lines.append(("CR", payable_ledger, cr_pay))
    if float(r.tds_on_perquisites) > 0:
        lines.append(("CR", tds_perquisite_ledger, float(r.tds_on_perquisites)))
    vh = PostingEngineService.create_voucher(
        db, "JV", company_id=r.company_id or "C001",
        voucher_date=voucher_date,
        narration=f"Employee Reimbursement {r.bill_number} {r.employee_name}",
        lines=lines, created_by=created_by, status="POSTED",
    )
    r.bill_journal_id = vh.id
    r.status = "APPROVED"
    db.commit()
    db.refresh(r)
    return {"status": "OK", "bill_journal_id": vh.id, "voucher_no": vh.voucher_no,
            "approved_amount": r.approved_amount}


# =====================================================================
# H9. SALARY ARREARS RETRO DIFF
# =====================================================================

def compute_arrears_for_increment(
    db: Session, company_id: str, increment_id: int, pay_in_month_year: str,
    created_by: str = "SYSTEM",
) -> dict:
    inc = db.query(EmployeeIncrement).get(increment_id)
    if not inc:
        return {"status": "ERROR", "reason": "Increment not found"}
    eff = inc.effective_from
    old = float(inc.old_salary or 0)
    new = float(inc.new_salary or 0)
    if old == 0 or new == 0:
        return {"status": "ERROR", "reason": "Old/New salary 0"}
    y_now, m_now = map(int, pay_in_month_year.split("-"))
    current = date(y_now, m_now, 1)
    n_months = 0
    dt = eff.replace(day=1)
    months = []
    while dt < current:
        months.append(month_key(dt))
        n_months += 1
        dt += relativedelta(months=1)
    if not months:
        return {"status": "SKIPPED", "reason": "No prior months to give arrears"}
    gross_diff = new - old
    basic_ratio = 0.0
    if old > 0:
        emp = db.query(EmployeeRegistration).filter(EmployeeRegistration.employee_id == inc.employee_id).first()
        basic_ratio = float(emp.basic_salary or 0) / float(emp.current_salary or old) if emp else 0.5
    basic_diff = gross_diff * basic_ratio
    hra_diff = gross_diff * (float(emp.hra or 0) / float(emp.current_salary or old)) if emp else gross_diff * 0.2
    conv_diff = gross_diff * (float(emp.conveyance_allowance or 0) / float(emp.current_salary or old)) if emp else gross_diff * 0.1
    special_diff = gross_diff - basic_diff - hra_diff - conv_diff
    total_gross = gross_diff * n_months
    # statutory retro
    pf_emp_a = []
    for mm in months:
        pfe, pfer = 0.0, 0.0
        y1, m1 = map(int, mm.split("-"))
        stat = (
            db.query(EmployeeStatutoryMaster)
            .filter(EmployeeStatutoryMaster.employee_id == inc.employee_id)
            .order_by(EmployeeStatutoryMaster.applicable_from.desc())
            .first()
        )
        if stat:
            out = calculate_pf_esi(
                basic_diff, conv_diff + hra_diff + special_diff, 0, basic_diff,
                pf_applicable=bool(stat.pf_applicable),
                pf_percent_ee=float(stat.pf_employee_percent or 12),
                pf_percent_er=float(stat.pf_employer_percent or 12),
                pf_limit=float(stat.pf_wage_limit or 15000),
                eps_applicable=bool(stat.eps_applicable),
                esi_applicable=bool(stat.esi_applicable),
                esi_percent_ee=float(stat.esi_employee_percent or 0.75),
                esi_percent_er=float(stat.esi_employer_percent or 3.25),
                esi_limit=float(stat.esi_wage_limit or 21000),
                effective_date=date(y1, m1, 1),
            )
            pf_emp_a.append(out)
    pf_emp = float(q2(sum(float(x.get("pf_employee", 0)) for x in pf_emp_a)))
    epf_emp = float(q2(sum(float(x.get("epf_employer", 0)) for x in pf_emp_a)))
    eps = float(q2(sum(float(x.get("eps_employer", 0)) for x in pf_emp_a)))
    edli = float(q2(sum(float(x.get("edli_employer", 0)) for x in pf_emp_a)))
    esi_emp = float(q2(sum(float(x.get("esi_employee", 0)) for x in pf_emp_a)))
    esi_emply = float(q2(sum(float(x.get("esi_employer", 0)) for x in pf_emp_a)))
    pt = float(q2(n_months * (float(inc.employee.pt_amount or 0)) if hasattr(inc.employee, "pt_amount") else 0))
    # tds simplified
    tds = float(q2(total_gross * 0.10)) if total_gross > 0 else 0
    net = float(q2(total_gross - pf_emp - pt - esi_emp - tds))
    existing = db.query(EmployeeSalaryArrears).filter(
        EmployeeSalaryArrears.company_id == company_id,
        EmployeeSalaryArrears.employee_id == inc.employee_id,
        EmployeeSalaryArrears.arrear_from_month == months[0],
        EmployeeSalaryArrears.arrear_to_month == months[-1],
    ).first()
    if not existing:
        arr = EmployeeSalaryArrears(
            company_id=company_id, employee_id=inc.employee_id, employee_name=emp.employee_name if emp else inc.employee_id,
            department=emp.department if emp else None,
            arrear_from_month=months[0], arrear_to_month=months[-1], number_of_months=n_months,
            old_gross_salary=old, new_gross_salary=new, monthly_gross_diff=float(q2(gross_diff)),
            basic_diff=float(q2(basic_diff)), hra_diff=float(q2(hra_diff)),
            conv_diff=float(q2(conv_diff)), special_diff=float(q2(special_diff)),
            total_gross_arrears=float(q2(total_gross)),
            pf_emp_arrears=pf_emp, pf_epf_arrears=epf_emp, eps_arrears=eps, edli_arrears=edli,
            esi_emp_arrears=esi_emp, esi_emply_arrears=esi_emply, pt_arrears=pt,
            tds_arrears=tds, net_arrears_payable=net, pay_in_month_year=pay_in_month_year,
        )
        db.add(arr)
        db.commit()
        db.refresh(arr)
        return {"status": "OK", "arrear_id": arr.id, "months": n_months,
                "gross_arrears": arr.total_gross_arrears, "net": arr.net_arrears_payable}
    return {"status": "SKIPPED", "id": existing.id}


# =====================================================================
# H10. ESI MONTHLY RETURN CSV
# =====================================================================

def generate_esi_return_csv(db: Session, company_id: str, month_year: str,
                            created_by: str = "SYSTEM") -> dict:
    y, m = map(int, month_year.split("-"))
    salary_rows = (
        db.query(SalaryProcessing)
        .join(EmployeeStatutoryMaster,
              SalaryProcessing.employee_id == EmployeeStatutoryMaster.employee_id, isouter=True)
        .filter(
            SalaryProcessing.company_id == company_id,
            SalaryProcessing.month_year == month_year,
            EmployeeStatutoryMaster.esi_applicable == True,  # noqa: E712
        )
        .all()
    )
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Employee_Code", "Employee_Name", "ESI_No", "ESI_Wages_Days",
                "ESI_Wages_Amount", "ESI_Employee_Contribution", "ESI_Employer_Contribution",
                "Total_ESI", "NCP_Days", "Month"])
    n = 0
    for sp in salary_rows:
        emp = db.query(EmployeeRegistration).filter(EmployeeRegistration.employee_id == sp.employee_id).first()
        stat = (
            db.query(EmployeeStatutoryMaster)
            .filter(EmployeeStatutoryMaster.employee_id == sp.employee_id)
            .order_by(EmployeeStatutoryMaster.applicable_from.desc())
            .first()
        )
        days = int(sp.present_days or 0)
        wages = float(sp.esi_wages_employee or sp.earned_gross or 0)
        if wages > float(stat.esi_wage_limit or 21000):
            continue
        ee = float(sp.esi_employee or 0)
        er = float(sp.esi_employer or 0)
        ncp = 26 - days if days < 26 else 0
        w.writerow([sp.employee_id, emp.employee_name if emp else sp.employee_name,
                    stat.esi_number if stat else "",
                    days, f"{wages:.2f}", f"{ee:.2f}", f"{er:.2f}", f"{ee+er:.2f}",
                    ncp, month_year])
        n += 1
    csv_text = out.getvalue()
    total_ee = float(q2(sum(float(s.esi_employee or 0) for s in salary_rows)))
    total_er = float(q2(sum(float(s.esi_employer or 0) for s in salary_rows)))
    log = StatutoryFilingLog(
        company_id=company_id, month_year=month_year, filing_type="ESI",
        number_of_records=n, total_employee_contribution=total_ee,
        total_employer_contribution=total_er, total_challan_amount=float(q2(total_ee + total_er)),
        filing_status="GENERATED", created_by=created_by,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return {"status": "OK", "month_year": month_year, "employees": n, "csv_content": csv_text,
            "totals": {"ee": total_ee, "er": total_er, "total": float(q2(total_ee + total_er))},
            "filing_log_id": log.id}


# =====================================================================
# H11. PAYSLIP GENERATOR
# =====================================================================

def generate_payslip_data(db: Session, salary_id: int) -> dict:
    sp = db.query(SalaryProcessing).get(salary_id)
    if not sp:
        return {"status": "ERROR"}
    emp = db.query(EmployeeRegistration).filter(EmployeeRegistration.employee_id == sp.employee_id).first()
    stat = (
        db.query(EmployeeStatutoryMaster)
        .filter(EmployeeStatutoryMaster.employee_id == sp.employee_id)
        .order_by(EmployeeStatutoryMaster.applicable_from.desc())
        .first()
    )
    # YTD: sum all prior months in FY
    y, m = map(int, (sp.month_year or "2026-04").split("-"))
    fy = fy_label(date(y, m, 1))
    fy_start = date(int(fy[:4]), 4, 1)
    fy_end = date(int(fy[:4]) + 1, 3, 31)
    ytd_rows = db.query(SalaryProcessing).filter(
        SalaryProcessing.employee_id == sp.employee_id,
        SalaryProcessing.month_year.between(month_key(fy_start), month_key(fy_end)),
        SalaryProcessing.month_year <= sp.month_year,
    ).all()
    def s(col): return float(q2(sum(getattr(r, col, 0) or 0 for r in ytd_rows)))
    earnings = [
        ("Basic", float(sp.earned_basic or 0)),
        ("HRA", float(sp.earned_hra or 0)),
        ("Conveyance", float(sp.earned_conveyance or 0)),
        ("Special Allowance", float(sp.earned_special or 0)),
        ("Other Allowance", float(sp.other_allowance or 0)),
        ("OT Amount", float(sp.ot_amount or 0)),
        ("Arrears", float(sp.arrears_amount or 0)),
    ]
    deductions = [
        ("EPF (Employee)", float(sp.pf_employee or 0)),
        ("ESI (Employee)", float(sp.esi_employee or 0)),
        ("Professional Tax", float(sp.professional_tax or 0)),
        ("TDS Salary", float(sp.tds_salary or 0)),
        ("Labour Welfare Fund", float(sp.lwf_employee or 0)),
        ("Advance Recovery", float(sp.advance_deduction or 0)),
    ]
    employer_contrib = [
        ("EPF (Employer)", float(sp.epf_employer or 0)),
        ("EPS (Employer)", float(sp.eps_employer or 0)),
        ("EDLI", float(sp.edli_employer or 0)),
        ("ESI (Employer)", float(sp.esi_employer or 0)),
        ("LWF (Employer)", float(sp.lwf_employer or 0)),
    ]
    return {
        "status": "OK",
        "employee": {"name": emp.employee_name if emp else sp.employee_name,
                     "id": sp.employee_id, "designation": emp.designation if emp else None,
                     "department": emp.department if emp else None,
                     "pan": emp.pan_number if emp else None, "uan": emp.uan_number if emp else None,
                     "esi": stat.esi_number if stat else None, "bank": emp.bank_name if emp else None,
                     "acct": emp.account_number if emp else None, "ifsc": emp.ifsc_code if emp else None,
                     "joining": str(emp.joining_date) if emp and emp.joining_date else None},
        "month": sp.month_year,
        "attendance": {"present": float(sp.present_days or 0), "absent": float(sp.absent_days or 0),
                       "week_off": float(sp.week_off_days or 0), "holidays": float(sp.holiday_days or 0),
                       "ot_hours": float(sp.ot_hours or 0)},
        "earnings": earnings,
        "deductions": deductions,
        "employer_contributions": employer_contrib,
        "gross": float(sp.earned_gross or 0),
        "total_deductions": float(sp.total_deductions or 0),
        "net_payable": float(sp.net_payable or 0),
        "ytd": {"gross": s("earned_gross"), "basic": s("earned_basic"),
                "hra": s("earned_hra"), "pf_employee": s("pf_employee"),
                "tds": s("tds_salary"), "net": s("net_payable"),
                "pt": s("professional_tax"), "esi": s("esi_employee")},
        "approved_by": getattr(sp, "approved_by", None),
        "journal_id": sp.salary_journal_id, "payment_journal_id": sp.payment_journal_id,
    }


# =====================================================================
# H12. BULK SALARY NEFT CSV (BOB/SBI/HDFC standard formats)
# =====================================================================

def generate_bulk_salary_neft_csv(
    db: Session, company_id: str, month_year: str, bank_format: str = "HDFC",
    company_account_no: str = "", company_ifsc: str = "",
    transaction_narration: Optional[str] = None,
    debit_ledger_name: str = "Salaries Payable A/c",
    credit_ledger_name: str = "",
    created_by: str = "SYSTEM",
) -> dict:
    salary_rows = db.query(SalaryProcessing).filter(
        SalaryProcessing.company_id == company_id, SalaryProcessing.month_year == month_year,
        SalaryProcessing.status.in_(["APPROVED", "PAID"])
    ).all()
    out = io.StringIO()
    w = csv.writer(out)
    nar = transaction_narration or f"SALARY-{month_year}"
    if bank_format.upper() == "HDFC":
        w.writerow(["Company Name", "Company A/c No", "Company IFSC", "Beneficiary A/c No",
                    "Beneficiary Name", "Beneficiary IFSC", "Amount", "Narration",
                    "Payment Date", "Mode"])
    elif bank_format.upper() == "SBI":
        w.writerow(["DEBIT_ACCT", "DEBIT_IFSC", "CREDIT_ACCT", "CREDIT_IFSC",
                    "BENEFICIARY_NAME", "AMOUNT", "NARRATION", "PAYMENT_DATE"])
    total = 0.0
    n = 0
    today = date.today().strftime("%d/%m/%Y")
    for sp in salary_rows:
        emp = db.query(EmployeeRegistration).filter(EmployeeRegistration.employee_id == sp.employee_id).first()
        if not emp:
            continue
        amt = float(sp.net_payable or 0)
        if amt <= 0:
            continue
        total += amt
        n += 1
        if bank_format.upper() == "HDFC":
            w.writerow([company_id, company_account_no, company_ifsc,
                        emp.account_number or "", emp.employee_name or "",
                        emp.ifsc_code or "", f"{amt:.2f}", nar, today, "NEFT"])
        elif bank_format.upper() == "SBI":
            w.writerow([company_account_no, company_ifsc, emp.account_number or "",
                        emp.ifsc_code or "", emp.employee_name or "",
                        f"{amt:.2f}", nar, today])
        else:  # Generic
            w.writerow([sp.employee_id, emp.employee_name, emp.account_number or "",
                        emp.ifsc_code or "", f"{amt:.2f}", nar, today])
    return {"status": "OK", "employees": n, "total_amount": float(q2(total)),
            "bank_format": bank_format, "csv_content": out.getvalue()}


# =====================================================================
# H13. CONTRACTOR LABOUR ATTENDANCE → CONTRACTOR BILL JV BRIDGE
# =====================================================================

def generate_contractor_bill_lines_for_month(
    db: Session, contractor_name: str, month_year: str, company_id: str = "C001",
) -> dict:
    y, m = map(int, month_year.split("-"))
    m_start = date(y, m, 1)
    m_end = (m_start + relativedelta(months=1)) - timedelta(days=1)
    recs = db.query(ContractLabourAttendance).filter(
        ContractLabourAttendance.contractor_name == contractor_name,
        ContractLabourAttendance.attendance_date.between(m_start, m_end),
    ).all()
    # aggregate per worker
    agg = {}
    for r in recs:
        k = (r.labour_id, r.labour_name)
        if k not in agg:
            agg[k] = {"days": 0, "hours": 0.0, "amount": 0.0}
        agg[k]["days"] += 1
        if r.out_time and r.in_time:
            agg[k]["hours"] += float((r.out_time - r.in_time).total_seconds() / 3600.0)
        # Assume daily rate via linked contract_labour →  we approximate days * 700
        labour = db.query(ContractLabour).filter(
            ContractLabour.labour_id == r.labour_id, ContractLabour.contractor_name == contractor_name
        ).first()
        daily = 700.0
        if labour:
            try:
                daily = float(labour.daily_rate or 700.0) if hasattr(labour, "daily_rate") else 700.0
            except Exception:
                daily = 700.0
        agg[k]["amount"] += daily
    total = float(q2(sum(v["amount"] for v in agg.values())))
    return {"status": "OK", "contractor": contractor_name, "month": month_year,
            "workers": len(agg), "total_bill_amount": total,
            "breakdown": [{
                "labour_id": k[0], "labour_name": k[1], "days": v["days"],
                "hours": float(q2(v["hours"])), "amount": float(q2(v["amount"]))
            } for k, v in agg.items()]}


# =====================================================================
# H14. 12BB PROOF VERIFICATION (Recompute TDS if proofs verified)
# =====================================================================

def verify_12bb_recompute_tds(
    db: Session, declaration_id: int, verified_by: str = "HR",
    verify_status: str = "VERIFIED",
) -> dict:
    dec = db.query(EmployeeITDDeclaration).get(declaration_id)
    if not dec:
        return {"status": "ERROR", "reason": "Declaration not found"}
    receipts = db.query(EmployeeITReceiptUpload).filter(
        EmployeeITReceiptUpload.declaration_id == declaration_id
    ).all()
    total_verified = 0.0
    for r in receipts:
        if r.status == "PENDING":
            r.verified_amount = r.amount
            r.status = verify_status
            r.verified_by = verified_by
        total_verified += float(r.verified_amount or 0)
    dec.verified_by = verified_by
    dec.proof_status = verify_status
    # Only verified 80C/80D etc counts for Chapter VI-A
    chap6a = 0.0
    if dec.tax_regime_opted == "OLD":
        receipts80 = db.query(EmployeeITReceiptUpload).filter(
            EmployeeITReceiptUpload.declaration_id == declaration_id,
            EmployeeITReceiptUpload.section_code.in_(
                ["80C", "80CCC", "80CCD1B", "80D", "80E", "80EEA", "80G"])
        ).all()
        chap6a = float(q2(sum(float(r.verified_amount or 0) for r in receipts80)))
        cap_80c_items = ["80C", "80CCC", "80CCD1"]
        c80c = float(q2(sum(float(r.verified_amount or 0) for r in receipts80 if r.section_code in cap_80c_items)))
        if c80c > 150000:
            chap6a -= (c80c - 150000)
        dec.chapter_vi_a_total = float(q2(chap6a))
    db.commit()
    # recompute annual TDS
    emp = db.query(EmployeeRegistration).filter(EmployeeRegistration.employee_id == dec.employee_id).first()
    annual = compute_annual_tds(
        db, dec.company_id, dec.employee_id,
        float(emp.current_salary or 0) * 12, dec.financial_year,
    )
    return {"status": "OK", "declaration_id": dec.id, "proof_status": verify_status,
            "verified_total": float(q2(total_verified)),
            "chapter_vi_a_adjusted": chap6a, "recomputed_monthly_tds": annual["monthly_tds"]}


# =====================================================================
# H15. COST CENTER / DEPARTMENT WISE SALARY YTD REPORT
# =====================================================================

def cost_center_salary_report(db: Session, company_id: str, financial_year: str,
                              group_by: str = "department") -> dict:
    fy_start = date(int(financial_year[:4]), 4, 1)
    fy_end = date(int(financial_year[:4]) + 1, 3, 31)
    rows = db.query(SalaryProcessing).filter(
        SalaryProcessing.company_id == company_id,
        SalaryProcessing.month_year.between(month_key(fy_start), month_key(fy_end)),
        SalaryProcessing.status.in_(["APPROVED", "PAID"]),
    ).all()
    agg = {}
    for sp in rows:
        emp = db.query(EmployeeRegistration).filter(EmployeeRegistration.employee_id == sp.employee_id).first()
        if group_by == "department":
            key = (emp.department or "General") if emp else "General"
        elif group_by == "designation":
            key = (emp.designation or "Unknown") if emp else "Unknown"
        elif group_by == "location":
            key = (emp.location or "Head Office") if emp else "Head Office"
        else:
            key = (emp.department or "General") if emp else "General"
        if key not in agg:
            agg[key] = {"headcount": 0, "gross": 0.0, "basic": 0.0, "hra": 0.0,
                        "employer_pf": 0.0, "employer_esi": 0.0, "employer_lwf": 0.0,
                        "employer_edli": 0.0, "tds": 0.0, "net": 0.0,
                        "bonus": 0.0, "gratuity_prov": 0.0, "total_cost": 0.0,
                        "months": {}}
        m_y = sp.month_year or ""
        agg[key]["months"][m_y] = agg[key]["months"].get(m_y, 0) + 1
        agg[key]["headcount"] = len(agg[key]["months"])
        agg[key]["gross"] += float(sp.earned_gross or 0)
        agg[key]["basic"] += float(sp.earned_basic or 0)
        agg[key]["hra"] += float(sp.earned_hra or 0)
        agg[key]["employer_pf"] += float(sp.pf_employer or 0)
        agg[key]["employer_esi"] += float(sp.esi_employer or 0)
        agg[key]["employer_lwf"] += float(sp.lwf_employer or 0)
        agg[key]["employer_edli"] += float(sp.edli_employer or 0)
        agg[key]["tds"] += float(sp.tds_salary or 0)
        agg[key]["net"] += float(sp.net_payable or 0)
    # Bonus + Gratuity provision totals
    bonus_rows = db.query(EmployeeBonus).filter(
        EmployeeBonus.company_id == company_id, EmployeeBonus.financial_year == financial_year,
    ).all()
    for b in bonus_rows:
        key = b.department or "General"
        if key not in agg:
            agg[key] = {"headcount": 0, "gross": 0.0, "basic": 0.0, "hra": 0.0,
                        "employer_pf": 0.0, "employer_esi": 0.0, "employer_lwf": 0.0,
                        "employer_edli": 0.0, "tds": 0.0, "net": 0.0,
                        "bonus": 0.0, "gratuity_prov": 0.0, "total_cost": 0.0,
                        "months": {}}
        agg[key]["bonus"] += float(b.gross_bonus or 0)
    grat_rows = db.query(EmployeeGratuityProvision).filter(
        EmployeeGratuityProvision.company_id == company_id,
        EmployeeGratuityProvision.month_year.between(month_key(fy_start), month_key(fy_end)),
    ).all()
    for g in grat_rows:
        key = g.department or "General"
        if key not in agg:
            agg[key] = {"headcount": 0, "gross": 0.0, "basic": 0.0, "hra": 0.0,
                        "employer_pf": 0.0, "employer_esi": 0.0, "employer_lwf": 0.0,
                        "employer_edli": 0.0, "tds": 0.0, "net": 0.0,
                        "bonus": 0.0, "gratuity_prov": 0.0, "total_cost": 0.0,
                        "months": {}}
        agg[key]["gratuity_prov"] += float(g.monthly_provision_amount or 0)
    grand_total = 0.0
    for k, v in agg.items():
        tc = float(q2(v["gross"] + v["employer_pf"] + v["employer_esi"] +
                      v["employer_edli"] + v["employer_lwf"] + v["bonus"] + v["gratuity_prov"]))
        v["total_cost"] = tc
        grand_total += tc
        for kk, val in list(v.items()):
            if isinstance(val, float):
                v[kk] = float(q2(val))
    return {"status": "OK", "group_by": group_by, "financial_year": financial_year,
            "departments": list(agg.keys()), "rows": agg,
            "grand_total_hr_cost": float(q2(grand_total))}


# =====================================================================
# H5 (PART-B) — FORM 16 YTD AGGREGATE
# =====================================================================

def compute_form_16_ytd(db: Session, company_id: str, employee_id: str, financial_year: str,
                        created_by: str = "SYSTEM") -> EmployeeForm16Record:
    fy_start = date(int(financial_year[:4]), 4, 1)
    fy_end = date(int(financial_year[:4]) + 1, 3, 31)
    sp_rows = db.query(SalaryProcessing).filter(
        SalaryProcessing.company_id == company_id, SalaryProcessing.employee_id == employee_id,
        SalaryProcessing.month_year.between(month_key(fy_start), month_key(fy_end)),
    ).all()
    def s(col): return float(q2(sum(getattr(r, col, 0) or 0 for r in sp_rows)))
    gross = s("earned_gross")
    basic_ytd = s("earned_basic")
    emp = db.query(EmployeeRegistration).filter(EmployeeRegistration.employee_id == employee_id).first()
    dec = db.query(EmployeeITDDeclaration).filter(
        EmployeeITDDeclaration.company_id == company_id, EmployeeITDDeclaration.employee_id == employee_id,
        EmployeeITDDeclaration.financial_year == financial_year,
    ).first()
    std_ded = 50000.0
    hra_exempt = float(dec.hra_exempt or 0) if dec else 0.0
    allowances_exempt = hra_exempt + (float(dec.food_coupons_monthly or 0) * 12 if dec else 0) + (float(dec.lta_claimed or 0) if dec else 0)
    chap6a = float(dec.chapter_vi_a_total or 0) if dec and (dec.tax_regime_opted or "NEW") == "OLD" else 0.0
    regime = (dec.tax_regime_opted or "NEW") if dec else "NEW"
    # Gross taxable
    step = max(0.0, gross - std_ded - allowances_exempt)
    if regime == "OLD":
        step = max(0.0, step - chap6a)
    taxable = float(q2(step))
    slabs = db.query(TDSConfigMaster).filter(
        TDSConfigMaster.financial_year == financial_year, TDSConfigMaster.tax_regime == regime
    ).order_by(TDSConfigMaster.slab_from).all()
    if not slabs:
        seed_default_tds_slabs(db, financial_year)
        slabs = db.query(TDSConfigMaster).filter(
            TDSConfigMaster.financial_year == financial_year, TDSConfigMaster.tax_regime == regime
        ).order_by(TDSConfigMaster.slab_from).all()
    tax_before = compute_slab_tax(taxable, slabs)
    rebate = 0.0
    if regime == "NEW" and taxable <= 1200000:
        rebate = min(tax_before, 25000.0)
    after_rebate = max(0.0, tax_before - rebate)
    surcharge = 0.0
    if taxable >= 5000000:
        surcharge = after_rebate * 0.10
    cess = (after_rebate + surcharge) * 0.04
    total_tax = float(q2(after_rebate + surcharge + cess))
    tds_ytd = s("tds_salary")
    refund = 0.0
    if tds_ytd > total_tax:
        refund = float(q2(tds_ytd - total_tax))
    existing = db.query(EmployeeForm16Record).filter(
        EmployeeForm16Record.company_id == company_id, EmployeeForm16Record.employee_id == employee_id,
        EmployeeForm16Record.financial_year == financial_year,
    ).first()
    if existing:
        f16 = existing
    else:
        f16 = EmployeeForm16Record(company_id=company_id, employee_id=employee_id,
                                   employee_name=emp.employee_name if emp else employee_id,
                                   pan_number=emp.pan_number if emp else None,
                                   uan_number=emp.uan_number if emp else None,
                                   financial_year=financial_year)
        db.add(f16)
    f16.gross_salary_ytd = float(q2(gross))
    f16.allowances_exempt = float(q2(allowances_exempt))
    f16.standard_deduction = std_ded
    f16.hra_exempt = hra_exempt
    f16.deductions_chapter_6a = chap6a
    f16.taxable_income = taxable
    f16.tax_on_taxable = float(q2(after_rebate))
    f16.rebate_115bac = float(q2(rebate))
    f16.surcharge = float(q2(surcharge))
    f16.health_education_cess = float(q2(cess))
    f16.total_tax = total_tax
    f16.tds_deducted_ytd = tds_ytd
    f16.tax_refundable = refund
    f16.net_tax_payable = float(q2(max(0.0, total_tax - tds_ytd)))
    f16.status = "DRAFT"
    f16.generated_at = datetime.utcnow()
    f16.gross_income_salary = f16.gross_salary_ytd
    db.commit()
    db.refresh(f16)
    return f16
