"""
HRMS Automations Router — All 15 Missing HRMS Features Endpoints
================================================================
H1 Leave, H2 TDS Slab, H3 F&F, H4 Salary Approval, H5 PF ECR + Form 16,
H6 Bonus, H7 Gratuity Provision, H8 Reimbursements, H9 Arrears, H10 ESI CSV,
H11 Payslip, H12 Bulk NEFT CSV, H13 Contractor Bill Lines, H14 12BB Proof,
H15 Cost Center Report.
"""
import logging
from datetime import date
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.hrms_automations import (
    run_monthly_leave_accrual, calculate_lwp_days_for_employee_month,
    approve_leave_application, seed_default_tds_slabs, compute_hra_exemption,
    compute_annual_tds, calculate_employee_monthly_tds, compute_full_and_final,
    post_ff_settlement_jv, approve_salary_row, bulk_approve_salaries,
    generate_pf_ecr_text, compute_bonus_for_fy, run_gratuity_monthly_provision,
    post_reimbursement_bill_jv, compute_arrears_for_increment,
    generate_esi_return_csv, generate_payslip_data, generate_bulk_salary_neft_csv,
    generate_contractor_bill_lines_for_month, verify_12bb_recompute_tds,
    cost_center_salary_report, compute_form_16_ytd, month_key, fy_label,
)
from app.database.models.attendance import (
    LeaveTypeConfig, EmployeeLeaveBalance, LeaveApplication, LeaveEncashment,
    TDSConfigMaster, EmployeeITDDeclaration, EmployeeITReceiptUpload,
    EmployeeFullAndFinal, EmployeeBonus, EmployeeGratuityProvision,
    EmployeeReimbursement, EmployeeSalaryArrears, StatutoryFilingLog,
    EmployeeForm16Record,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/hrms-automations", tags=["HRMS Automations"])


# ========================================================
# COMMON HELPERS
# ========================================================
def ok(data, **extra):
    r = {"status": "OK"}
    r.update(extra)
    r["data"] = data
    return r


def parse_month(mm: str) -> date:
    y, m = map(int, mm.split("-"))
    return date(y, m, 1)


# ========================================================
# H1. LEAVE MANAGEMENT
# ========================================================

class LeaveTypeIn(BaseModel):
    company_id: str; leave_code: str; leave_name: str; annual_entitlement: float = 0.0
    carry_forward_days: float = 0.0; max_carry_forward_balance: float = 30.0
    accrual_monthly: float = 0.0; is_paid: bool = True; requires_approval: bool = True
    min_service_months: int = 0; applicable_gender: str = "ALL"
    effective_from: date; status: str = "ACTIVE"

@router.post("/leave/types")
def create_leave_type(p: LeaveTypeIn, db: Session = Depends(get_db)):
    existing = db.query(LeaveTypeConfig).filter(
        LeaveTypeConfig.company_id == p.company_id, LeaveTypeConfig.leave_code == p.leave_code
    ).first()
    if existing:
        raise HTTPException(400, "Leave code exists")
    lt = LeaveTypeConfig(**p.dict())
    db.add(lt); db.commit(); db.refresh(lt)
    return ok(lt)

@router.get("/leave/types/{company_id}")
def list_leave_types(company_id: str, db: Session = Depends(get_db)):
    return ok(db.query(LeaveTypeConfig).filter(LeaveTypeConfig.company_id == company_id).all())

@router.post("/leave/accrue")
def post_accrue_leave(company_id: str, accrual_month: str, created_by: str = "SYSTEM", db: Session = Depends(get_db)):
    return run_monthly_leave_accrual(db, company_id, accrual_month, created_by)

@router.get("/leave/balance/{company_id}/{employee_id}")
def get_leave_balance(company_id: str, employee_id: str, financial_year: Optional[str] = None,
                      db: Session = Depends(get_db)):
    fy = financial_year or fy_label(date.today())
    rows = db.query(EmployeeLeaveBalance).filter(
        EmployeeLeaveBalance.company_id == company_id, EmployeeLeaveBalance.employee_id == employee_id,
        EmployeeLeaveBalance.financial_year == fy,
    ).all()
    return ok(rows, financial_year=fy)

class LeaveAppIn(BaseModel):
    company_id: str; employee_id: str; leave_code: str
    leave_from: date; leave_to: date; total_days: float
    half_day_flag: str = "FULL"; reason: Optional[str] = None
    contact_during_leave: Optional[str] = None; applied_by: Optional[str] = None
    reporting_manager: Optional[str] = None

@router.post("/leave/apply")
def apply_leave(p: LeaveAppIn, db: Session = Depends(get_db)):
    lapp = LeaveApplication(**p.dict(), applied_at=None, manager_remark=None,
                            hr_remark=None, status="PENDING")
    db.add(lapp); db.commit(); db.refresh(lapp)
    return ok(lapp)

@router.patch("/leave/{application_id}/approve")
def leave_approve(application_id: int, stage: str = "HR", approve: bool = True,
                  approver: str = "HR", remark: Optional[str] = None, db: Session = Depends(get_db)):
    lapp = approve_leave_application(db, application_id, approver, stage, approve, remark)
    if not lapp:
        raise HTTPException(404, "Leave application not found or already decided")
    return ok(lapp)

@router.get("/leave/lwp/{company_id}/{employee_id}/{month_year}")
def get_lwp(company_id: str, employee_id: str, month_year: str, db: Session = Depends(get_db)):
    days = calculate_lwp_days_for_employee_month(db, company_id, employee_id, month_year)
    return ok({"lwp_days": days})


# ========================================================
# H2. TDS / INCOME TAX DECLARATION
# ========================================================

@router.post("/tds/seed-default-slabs")
def seed_slabs(financial_year: str = "2026-2027", db: Session = Depends(get_db)):
    rows = seed_default_tds_slabs(db, financial_year)
    return {"status": "OK", "rows_inserted": rows, "financial_year": financial_year}

@router.get("/tds/slabs/{financial_year}")
def list_slabs(financial_year: str, regime: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(TDSConfigMaster).filter(TDSConfigMaster.financial_year == financial_year)
    if regime:
        q = q.filter(TDSConfigMaster.tax_regime == regime.upper())
    return ok(q.order_by(TDSConfigMaster.tax_regime, TDSConfigMaster.slab_from).all())

class HraIn(BaseModel):
    basic_da: float; hra_received: float; monthly_rent: float; is_metro: bool = True

@router.post("/tds/hra-exemption")
def calc_hra(p: HraIn):
    return {"exempt": compute_hra_exemption(p.basic_da, p.hra_received, p.monthly_rent, p.is_metro)}

class AnnualTdsIn(BaseModel):
    company_id: str; employee_id: str; projected_annual_gross: float; financial_year: str

@router.post("/tds/annual")
def annual_tds(p: AnnualTdsIn, db: Session = Depends(get_db)):
    return compute_annual_tds(db, p.company_id, p.employee_id, p.projected_annual_gross, p.financial_year)

class MonthlyTdsIn(BaseModel):
    company_id: str; employee_id: str; monthly_gross: float; month_year: str
    tds_deducted_so_far_ytd: float = 0.0

@router.post("/tds/monthly")
def monthly_tds(p: MonthlyTdsIn, db: Session = Depends(get_db)):
    return {"tds_monthly": calculate_employee_monthly_tds(
        db, p.company_id, p.employee_id, p.monthly_gross, p.month_year, p.tds_deducted_so_far_ytd)}


class ITDecIn(BaseModel):
    company_id: str; employee_id: str; employee_name: Optional[str] = None
    financial_year: str; tax_regime_opted: str = "NEW"
    standard_deduction: float = 50000.0; hra_received: float = 0.0
    hra_rent_paid_monthly: float = 0.0; hra_is_metro: bool = True
    hra_exempt: float = 0.0; chapter_vi_a_total: float = 0.0
    section_80c: float = 0.0; section_80ccd1b_nps: float = 0.0
    section_80d_health: float = 0.0; section_80e_education_loan: float = 0.0
    section_80eea_housing: float = 0.0; section_80g_donation: float = 0.0
    lta_claimed: float = 0.0; food_coupons_monthly: float = 0.0
    any_other_exemption: float = 0.0; submitted_by: Optional[str] = None
    declaration_status: str = "DRAFT"; proof_status: str = "PENDING"

@router.post("/tds/12bb/declaration")
def upsert_declaration(p: ITDecIn, db: Session = Depends(get_db)):
    existing = db.query(EmployeeITDDeclaration).filter(
        EmployeeITDDeclaration.company_id == p.company_id,
        EmployeeITDDeclaration.employee_id == p.employee_id,
        EmployeeITDDeclaration.financial_year == p.financial_year,
    ).first()
    if existing:
        for k, v in p.dict(exclude_unset=False).items():
            setattr(existing, k, v)
        obj = existing
    else:
        obj = EmployeeITDDeclaration(**p.dict())
        db.add(obj)
    db.commit(); db.refresh(obj)
    return ok(obj)


class ITReceiptIn(BaseModel):
    declaration_id: Optional[int] = None; employee_id: str; financial_year: str
    section_code: str; receipt_number: Optional[str] = None; receipt_date: Optional[date] = None
    amount: float = 0.0; document_file_path: Optional[str] = None
    verified_amount: float = 0.0; verified_by: Optional[str] = None
    status: str = "PENDING"

@router.post("/tds/12bb/receipt")
def add_receipt(p: ITReceiptIn, db: Session = Depends(get_db)):
    obj = EmployeeITReceiptUpload(**p.dict())
    db.add(obj); db.commit(); db.refresh(obj)
    return ok(obj)


# ========================================================
# H3. F&F SETTLEMENT
# ========================================================

@router.post("/ff/compute")
def compute_ff(company_id: str, employee_id: str, last_working_date: date,
               notice_period_months: int = 1, created_by: str = "SYSTEM", db: Session = Depends(get_db)):
    ff = compute_full_and_final(db, company_id, employee_id, last_working_date,
                                notice_period_months, created_by)
    return ok(ff)

@router.post("/ff/{ff_id}/post-jv")
def post_ff_jv(ff_id: int, voucher_date: date,
               salary_expense_ledger: str = "Salaries & Wages Expense A/c",
               leave_encash_exp: str = "Leave Encashment Expense A/c",
               gratuity_exp: str = "Gratuity Expense A/c",
               salaries_payable: str = "Salaries Payable A/c",
               tds_ledger: str = "TDS Payable on Salary A/c",
               adv_recovery_cr: str = "Salary Advance Recoverable A/c",
               bank_ledger: str = "HDFC Bank Salary A/c",
               created_by: str = "SYSTEM",
               db: Session = Depends(get_db)):
    return post_ff_settlement_jv(db, ff_id, voucher_date, salary_expense_ledger,
                                 leave_encash_exp, gratuity_exp, salaries_payable,
                                 tds_ledger, adv_recovery_cr, bank_ledger, created_by)

@router.get("/ff/{company_id}")
def list_ff(company_id: str, db: Session = Depends(get_db)):
    return ok(db.query(EmployeeFullAndFinal).filter(EmployeeFullAndFinal.company_id == company_id).all())


# ========================================================
# H4. EXPLICIT SALARY APPROVAL WORKFLOW
# ========================================================

@router.post("/salary/approve/{salary_id}")
def approve_one(salary_id: int, approved_by: str = "SYSTEM", narration: Optional[str] = None,
                db: Session = Depends(get_db)):
    return approve_salary_row(db, salary_id, approved_by, narration)

@router.post("/salary/approve-bulk")
def approve_all(company_id: str, month_year: str, approved_by: str = "SYSTEM",
                db: Session = Depends(get_db)):
    return bulk_approve_salaries(db, company_id, month_year, approved_by)


# ========================================================
# H5. PF ECR + FORM 16
# ========================================================

@router.post("/statutory/pf-ecr/generate")
def gen_ecr(company_id: str, month_year: str, created_by: str = "SYSTEM",
            db: Session = Depends(get_db)):
    return generate_pf_ecr_text(db, company_id, month_year, created_by=created_by)

@router.post("/form16/compute")
def gen_form16(company_id: str, employee_id: str, financial_year: str,
               created_by: str = "SYSTEM", db: Session = Depends(get_db)):
    f16 = compute_form_16_ytd(db, company_id, employee_id, financial_year, created_by)
    return ok(f16)

@router.get("/form16/{company_id}/{financial_year}")
def list_form16(company_id: str, financial_year: str, db: Session = Depends(get_db)):
    rows = db.query(EmployeeForm16Record).filter(
        EmployeeForm16Record.company_id == company_id, EmployeeForm16Record.financial_year == financial_year
    ).all()
    return ok(rows)


# ========================================================
# H6. BONUS
# ========================================================

@router.post("/bonus/compute-fy")
def bonus_compute(company_id: str, financial_year: str, bonus_type: str = "STATUTORY",
                  bonus_percent: float = 8.33, payable_basic_cap: float = 7000.0, months: int = 12,
                  created_by: str = "SYSTEM", db: Session = Depends(get_db)):
    return compute_bonus_for_fy(db, company_id, financial_year, bonus_type, bonus_percent,
                                payable_basic_cap, months, created_by)

@router.get("/bonus/{company_id}/{financial_year}")
def list_bonus(company_id: str, financial_year: str, db: Session = Depends(get_db)):
    rows = db.query(EmployeeBonus).filter(
        EmployeeBonus.company_id == company_id, EmployeeBonus.financial_year == financial_year
    ).all()
    return ok(rows)


# ========================================================
# H7. GRATUITY MONTHLY PROVISION
# ========================================================

@router.post("/gratuity/provision")
def gratuity_provision(company_id: str, month_year: str,
                       gratuity_exp_ledger: str = "Gratuity Expense A/c",
                       gratuity_provision_ledger: str = "Gratuity Provision A/c",
                       created_by: str = "SYSTEM", db: Session = Depends(get_db)):
    return run_gratuity_monthly_provision(db, company_id, month_year,
                                          gratuity_exp_ledger, gratuity_provision_ledger, created_by)

@router.get("/gratuity/provision/{company_id}/{month_year}")
def list_grat(company_id: str, month_year: str, db: Session = Depends(get_db)):
    return ok(db.query(EmployeeGratuityProvision).filter(
        EmployeeGratuityProvision.company_id == company_id,
        EmployeeGratuityProvision.month_year == month_year).all())


# ========================================================
# H8. REIMBURSEMENTS
# ========================================================

class ReimbIn(BaseModel):
    company_id: str; employee_id: str; employee_name: Optional[str] = None
    department: Optional[str] = None; bill_number: str; bill_date: date
    category: str; purpose: Optional[str] = None; total_bill_amount: float = 0.0
    taxable_non_taxable_flag: str = "NON_TAXABLE"; exemption_limit_applicable: float = 0.0
    claimed_amount: float = 0.0; approved_amount: float = 0.0
    tds_on_perquisites: float = 0.0; net_payable: float = 0.0
    approved_by: Optional[str] = None; approval_date: Optional[date] = None
    status: str = "DRAFT"; payment_month_year: Optional[str] = None

@router.post("/reimbursements")
def upsert_reimb(p: ReimbIn, db: Session = Depends(get_db)):
    existing = db.query(EmployeeReimbursement).filter(
        EmployeeReimbursement.company_id == p.company_id, EmployeeReimbursement.bill_number == p.bill_number
    ).first()
    if existing:
        for k, v in p.dict().items():
            setattr(existing, k, v)
        obj = existing
    else:
        obj = EmployeeReimbursement(**p.dict())
        db.add(obj)
    db.commit(); db.refresh(obj)
    return ok(obj)

@router.post("/reimbursements/{rid}/post-jv")
def reimburse_post_jv(rid: int, voucher_date: date, created_by: str = "SYSTEM",
                      db: Session = Depends(get_db)):
    return post_reimbursement_bill_jv(db, rid, voucher_date, created_by=created_by)


# ========================================================
# H9. ARREARS FROM INCREMENT
# ========================================================

@router.post("/arrears/compute-from-increment/{increment_id}")
def compute_arrears(increment_id: int, company_id: str, pay_in_month_year: str,
                    created_by: str = "SYSTEM", db: Session = Depends(get_db)):
    return compute_arrears_for_increment(db, company_id, increment_id, pay_in_month_year, created_by)


# ========================================================
# H10. ESI MONTHLY RETURN CSV
# ========================================================

@router.post("/statutory/esi-csv/generate")
def gen_esi(company_id: str, month_year: str, created_by: str = "SYSTEM", db: Session = Depends(get_db)):
    return generate_esi_return_csv(db, company_id, month_year, created_by)


# ========================================================
# H11. PAYSLIP
# ========================================================

@router.get("/payslip/{salary_id}")
def get_payslip(salary_id: int, db: Session = Depends(get_db)):
    return generate_payslip_data(db, salary_id)


# ========================================================
# H12. BULK SALARY NEFT CSV
# ========================================================

@router.post("/salary/bulk-neft-csv")
def neft_csv(company_id: str, month_year: str, bank_format: str = "HDFC",
             company_account_no: str = "", company_ifsc: str = "",
             transaction_narration: Optional[str] = None, db: Session = Depends(get_db)):
    return generate_bulk_salary_neft_csv(db, company_id, month_year, bank_format,
                                         company_account_no, company_ifsc, transaction_narration)


# ========================================================
# H13. CONTRACTOR LABOUR BILL LINES
# ========================================================

@router.get("/contractor/bill-lines")
def contractor_lines(contractor_name: str, month_year: str, company_id: str = "C001",
                     db: Session = Depends(get_db)):
    return generate_contractor_bill_lines_for_month(db, contractor_name, month_year, company_id)


# ========================================================
# H14. 12BB PROOF VERIFICATION
# ========================================================

@router.post("/tds/12bb/verify/{declaration_id}")
def vfy_12bb(declaration_id: int, verified_by: str = "HR", verify_status: str = "VERIFIED",
             db: Session = Depends(get_db)):
    return verify_12bb_recompute_tds(db, declaration_id, verified_by, verify_status)


# ========================================================
# H15. COST CENTER REPORT
# ========================================================

@router.get("/reports/cost-center-salary")
def cost_center(company_id: str, financial_year: str, group_by: str = "department",
                db: Session = Depends(get_db)):
    return cost_center_salary_report(db, company_id, financial_year, group_by)


# ========================================================
# STATUTORY FILING LOGS
# ========================================================

@router.get("/statutory/filings/{company_id}/{month_year}")
def list_filings(company_id: str, month_year: str, db: Session = Depends(get_db)):
    return ok(db.query(StatutoryFilingLog).filter(
        StatutoryFilingLog.company_id == company_id,
        StatutoryFilingLog.month_year == month_year).all())
