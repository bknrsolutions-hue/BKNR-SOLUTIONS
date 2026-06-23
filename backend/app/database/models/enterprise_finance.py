from datetime import date, datetime
from sqlalchemy import Column, Integer, String, Date, Float, Text, DateTime, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base

class BranchMaster(Base):
    __tablename__ = 'branch_masters'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)
    branch_code = Column(String(20), nullable=False)
    branch_name = Column(String(100), nullable=False)
    address = Column(String(255), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('company_id', 'branch_code', name='uix_company_branch_code'),
    )


class FinancialYearMaster(Base):
    __tablename__ = 'financial_year_masters'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)
    year_name = Column(String(50), nullable=False) # e.g., FY-2026-27
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    is_locked = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class CurrencyMaster(Base):
    __tablename__ = 'currency_masters'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)
    currency_code = Column(String(10), nullable=False) # USD, EUR, INR
    currency_symbol = Column(String(10), nullable=True)
    is_base_currency = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('company_id', 'currency_code', name='uix_company_currency_code'),
    )


class ExchangeRate(Base):
    __tablename__ = 'exchange_rates'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)
    currency_id = Column(Integer, ForeignKey('currency_masters.id'), nullable=False)
    rate_date = Column(Date, nullable=False)
    exchange_rate = Column(Float, nullable=False) # Rate against Base Currency
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('company_id', 'currency_id', 'rate_date', name='uix_company_exchange_rate_date'),
    )


class AccountGroup(Base):
    __tablename__ = 'account_groups'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)
    group_name = Column(String(100), nullable=False)
    parent_group_id = Column(Integer, ForeignKey('account_groups.id'), nullable=True)
    group_type = Column(String(20), nullable=False) # ASSET, LIABILITY, INCOME, EXPENSE, EQUITY, etc.
    created_at = Column(DateTime, default=datetime.utcnow)

    parent = relationship("AccountGroup", remote_side=[id], backref="children")
    
    __table_args__ = (
        UniqueConstraint('company_id', 'group_name', name='uix_company_group_name'),
    )


class LedgerMaster(Base):
    __tablename__ = 'ledger_masters'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)
    ledger_code = Column(String(50), nullable=True)
    ledger_name = Column(String(150), nullable=False)
    group_id = Column(Integer, ForeignKey('account_groups.id'), nullable=False)
    opening_balance = Column(Float, default=0.0)
    opening_balance_type = Column(String(2), default='DR')  # DR / CR

    gstin = Column(String(15), nullable=True)
    pan = Column(String(10), nullable=True)
    address = Column(String(255), nullable=True)
    phone = Column(String(20), nullable=True)
    email = Column(String(100), nullable=True)
    credit_days = Column(Integer, default=30)
    credit_limit = Column(Float, default=0.0)
    branch_id = Column(Integer, ForeignKey('branch_masters.id'), nullable=True)
    status = Column(String(20), default='ACTIVE')  # ACTIVE / INACTIVE

    # --- Accounting Behaviour Flags (Added) ---
    account_nature = Column(String(15), default='DR_NORMAL')   # DR_NORMAL / CR_NORMAL
    cost_center_required = Column(Boolean, default=False)       # Enforce cost center tagging
    gst_applicable = Column(Boolean, default=False)             # Trigger GST calculation
    tds_applicable = Column(Boolean, default=False)             # Trigger TDS deduction
    currency_code = Column(String(5), default='INR')            # Default transaction currency

    created_by = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    modified_by = Column(String(100), nullable=True)
    modified_at = Column(DateTime, nullable=True)

    group = relationship("AccountGroup")
    branch = relationship("BranchMaster")

    __table_args__ = (
        UniqueConstraint('company_id', 'ledger_name', name='uix_company_ledger_name'),
    )


class CostCenter(Base):
    __tablename__ = 'cost_centers'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)
    cost_center_code = Column(String(20), nullable=False)
    cost_center_name = Column(String(100), nullable=False)  # Production, Processing, Packing, Cold Storage, Export, Admin
    parent_id = Column(Integer, ForeignKey('cost_centers.id'), nullable=True)  # Hierarchical cost centers
    monthly_budget = Column(Float, default=0.0)              # Budget amount for this cost center
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    parent = relationship('CostCenter', remote_side=[id], backref='children')

    __table_args__ = (
        UniqueConstraint('company_id', 'cost_center_code', name='uix_company_cost_center_code'),
    )


class BudgetMaster(Base):
    __tablename__ = 'budget_masters'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)
    ledger_id = Column(Integer, ForeignKey('ledger_masters.id'), nullable=False)
    year_id = Column(Integer, ForeignKey('financial_year_masters.id'), nullable=False)
    budget_amount = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    ledger = relationship("LedgerMaster")
    year = relationship("FinancialYearMaster")

    __table_args__ = (
        UniqueConstraint('company_id', 'ledger_id', 'year_id', name='uix_company_budget_ledger_year'),
    )


class VoucherType(Base):
    __tablename__ = 'voucher_types'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)
    name = Column(String(50), nullable=False) # Payment, Receipt, Journal, Contra, Purchase, Sales, Credit Note, Debit Note, etc.
    prefix = Column(String(10), nullable=False) # PAY, RCT, JV, PUR, SAL
    is_auto_number = Column(Boolean, default=True)
    next_number = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('company_id', 'name', name='uix_company_voucher_type_name'),
    )


class VoucherHeader(Base):
    __tablename__ = 'voucher_headers'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)
    voucher_no = Column(String(50), nullable=False)
    voucher_date = Column(Date, nullable=False)
    voucher_type_id = Column(Integer, ForeignKey('voucher_types.id'), nullable=False)
    branch_id = Column(Integer, ForeignKey('branch_masters.id'), nullable=True)
    reference_no = Column(String(50), nullable=True)
    narration = Column(Text, nullable=True)
    status = Column(String(20), default='DRAFT') # DRAFT, SUBMITTED, APPROVED, REJECTED, POSTED
    
    approved_by = Column(String(100), nullable=True)
    approved_date = Column(DateTime, nullable=True)
    
    created_by = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    modified_by = Column(String(100), nullable=True)
    modified_at = Column(DateTime, nullable=True)

    voucher_type = relationship("VoucherType")
    branch = relationship("BranchMaster")
    details = relationship("VoucherDetail", back_populates="header", cascade="all, delete-orphan")

    __table_args__ = (
        UniqueConstraint('company_id', 'voucher_no', name='uix_company_voucher_no'),
    )


class VoucherDetail(Base):
    __tablename__ = 'voucher_details'

    id = Column(Integer, primary_key=True, index=True)
    voucher_id = Column(Integer, ForeignKey('voucher_headers.id', ondelete='CASCADE'), nullable=False)
    ledger_id = Column(Integer, ForeignKey('ledger_masters.id'), nullable=False)
    cost_center_id = Column(Integer, ForeignKey('cost_centers.id'), nullable=True)
    debit_amount = Column(Float, default=0.0)
    credit_amount = Column(Float, default=0.0)
    remarks = Column(String(255), nullable=True)

    header = relationship("VoucherHeader", back_populates="details")
    ledger = relationship("LedgerMaster")
    cost_center = relationship("CostCenter")


class BankReconciliation(Base):
    __tablename__ = 'bank_reconciliations'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)
    bank_ledger_id = Column(Integer, ForeignKey('ledger_masters.id'), nullable=False)
    statement_date = Column(Date, nullable=False)
    reference_no = Column(String(50), nullable=True)
    debit = Column(Float, default=0.0)
    credit = Column(Float, default=0.0)
    is_matched = Column(Boolean, default=False)
    matched_date = Column(Date, nullable=True)
    voucher_detail_id = Column(Integer, ForeignKey('voucher_details.id'), nullable=True)
    remarks = Column(String(255), nullable=True)

    bank_ledger = relationship("LedgerMaster")
    voucher_detail = relationship("VoucherDetail")


class FinanceAuditTrail(Base):
    __tablename__ = 'finance_audit_trails'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)
    table_name = Column(String(100), nullable=False)
    record_id = Column(Integer, nullable=False)
    action = Column(String(10), nullable=False) # INSERT, UPDATE, DELETE, APPROVE, REJECT
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    user_email = Column(String(100), nullable=False)
    timestamp = Column(DateTime, default=datetime.utcnow)


# =========================================================
# BANK MASTER
# =========================================================
class BankMaster(Base):
    """
    All company bank accounts — Current, EEFC, Export Packing Credit.
    Each bank account maps to a LedgerMaster entry for double-entry posting.
    """
    __tablename__ = 'bank_masters'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)

    bank_name = Column(String(100), nullable=False)
    account_number = Column(String(30), nullable=False)
    branch = Column(String(100), nullable=True)
    ifsc_code = Column(String(15), nullable=True)
    swift_code = Column(String(15), nullable=True)          # For international wire transfers
    micr_code = Column(String(15), nullable=True)

    # CURRENT / EEFC / EXPORT_CC / SAVINGS / OVERDRAFT
    account_type = Column(String(20), nullable=False, default='CURRENT')
    currency_code = Column(String(5), default='INR')

    is_export_account = Column(Boolean, default=False)      # For forex tracking
    is_eefc_account = Column(Boolean, default=False)        # Exchange Earner's Foreign Currency
    is_default = Column(Boolean, default=False)             # Default bank for payments

    opening_balance = Column(Float, default=0.0)
    opening_balance_date = Column(Date, nullable=True)

    # Linked to Chart of Accounts — CRITICAL for auto journals
    account_ledger_id = Column(Integer, ForeignKey('ledger_masters.id'), nullable=True)

    is_active = Column(Boolean, default=True)
    remarks = Column(String(255), nullable=True)
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    account_ledger = relationship('LedgerMaster', foreign_keys=[account_ledger_id])

    __table_args__ = (
        UniqueConstraint('company_id', 'account_number', name='uix_company_bank_account'),
    )


# =========================================================
# ITEM ACCOUNTING LINK
# =========================================================
class ItemAccountingLink(Base):
    """
    Maps each Item (species/product) to its GL account heads.
    Enables auto journal generation on Purchase, Sales, Production entries.
    One row per item per company.
    """
    __tablename__ = 'item_accounting_links'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)

    # Item identity (references species + grade + variety combination)
    item_name = Column(String(200), nullable=False, index=True)   # e.g. Vannamei PDTO
    species = Column(String(100), nullable=True)
    item_type = Column(String(30), default='FINISHED_GOOD')       # RAW_MATERIAL / PACKING / FINISHED_GOOD / CHEMICAL

    # HSN Code link
    hsn_code = Column(String(10), nullable=True)
    default_gst_percent = Column(Float, default=0.0)

    # GL Account Links — CRITICAL for auto-journal
    purchase_account_id = Column(Integer, ForeignKey('ledger_masters.id'), nullable=True)
    sales_account_id = Column(Integer, ForeignKey('ledger_masters.id'), nullable=True)
    inventory_account_id = Column(Integer, ForeignKey('ledger_masters.id'), nullable=True)
    cogs_account_id = Column(Integer, ForeignKey('ledger_masters.id'), nullable=True)
    wip_account_id = Column(Integer, ForeignKey('ledger_masters.id'), nullable=True)

    is_active = Column(Boolean, default=True)
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    purchase_account = relationship('LedgerMaster', foreign_keys=[purchase_account_id])
    sales_account = relationship('LedgerMaster', foreign_keys=[sales_account_id])
    inventory_account = relationship('LedgerMaster', foreign_keys=[inventory_account_id])
    cogs_account = relationship('LedgerMaster', foreign_keys=[cogs_account_id])
    wip_account = relationship('LedgerMaster', foreign_keys=[wip_account_id])

    __table_args__ = (
        UniqueConstraint('company_id', 'item_name', name='uix_company_item_acct'),
    )


# =========================================================
# EXPORT INCENTIVE REGISTER
# =========================================================
class ExportIncentiveRegister(Base):
    """
    Tracks RoDTEP, Duty Drawback, MEIS export incentive claims.
    Each row = one incentive entitlement per shipment.
    """
    __tablename__ = 'export_incentive_register'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)

    # RODTEP / DRAWBACK / MEIS / ROSCTL
    incentive_type = Column(String(20), nullable=False, index=True)

    # Source shipment
    shipment_id = Column(Integer, nullable=True, index=True)    # FK → export_shipments.id
    invoice_no = Column(String(50), nullable=False, index=True)
    shipping_bill_no = Column(String(50), nullable=True)
    shipping_bill_date = Column(Date, nullable=True)
    port = Column(String(100), nullable=True)

    # Calculation Basis
    fob_value_inr = Column(Float, nullable=False)               # FOB value in INR
    rate_percent = Column(Float, nullable=False)                # Incentive rate %
    incentive_amount = Column(Float, nullable=False)            # Computed = FOB * rate%

    # Instrument (for scrip-based incentives)  
    scrip_no = Column(String(50), nullable=True)               # MEIS/RoDTEP scrip number
    scrip_value = Column(Float, default=0.0)

    # Status lifecycle
    # PENDING → SANCTIONED → UTILIZED → EXPIRED / LAPSED
    status = Column(String(20), default='PENDING', index=True)
    sanction_date = Column(Date, nullable=True)
    utilization_date = Column(Date, nullable=True)
    expiry_date = Column(Date, nullable=True)

    # GL — Incentive receivable & income accounts
    receivable_ledger_id = Column(Integer, ForeignKey('ledger_masters.id'), nullable=True)
    income_ledger_id = Column(Integer, ForeignKey('ledger_masters.id'), nullable=True)
    journal_id = Column(Integer, ForeignKey('voucher_headers.id'), nullable=True)

    remarks = Column(String(255), nullable=True)
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    receivable_ledger = relationship('LedgerMaster', foreign_keys=[receivable_ledger_id])
    income_ledger = relationship('LedgerMaster', foreign_keys=[income_ledger_id])
    journal = relationship('VoucherHeader', foreign_keys=[journal_id])

    __table_args__ = (
        UniqueConstraint('company_id', 'invoice_no', 'incentive_type', name='uix_incentive_invoice_type'),
    )


# =========================================================
# LETTER OF CREDIT (LC) TRACKING
# =========================================================
class LCTracking(Base):
    """
    Full LC lifecycle management — from opening to closure.
    Linked to Export Invoices for payment reconciliation.
    """
    __tablename__ = 'lc_tracking'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)

    lc_number = Column(String(50), nullable=False, index=True)
    lc_reference = Column(String(50), nullable=True)            # Internal reference

    # Banks
    issuing_bank = Column(String(150), nullable=False)           # Foreign buyer's bank
    advising_bank = Column(String(150), nullable=False)          # Indian bank
    negotiating_bank = Column(String(150), nullable=True)

    # Amount & Currency
    lc_amount = Column(Float, nullable=False)
    currency_code = Column(String(5), default='USD')
    utilized_amount = Column(Float, default=0.0)                 # Amount drawn so far
    balance_amount = Column(Float, default=0.0)                  # Remaining drawable

    # Dates
    lc_issue_date = Column(Date, nullable=True)
    expiry_date = Column(Date, nullable=False)
    latest_shipment_date = Column(Date, nullable=False)
    presentation_period_days = Column(Integer, default=21)       # Days after BL date for docs

    # Type: SIGHT / USANCE_30 / USANCE_60 / USANCE_90 / USANCE_120
    lc_type = Column(String(20), nullable=False, default='SIGHT')

    # Documents required
    docs_required = Column(String(500), nullable=True)           # Comma-separated list

    # Customer link
    buyer_name = Column(String(200), nullable=True)
    customer_ledger_id = Column(Integer, ForeignKey('ledger_masters.id'), nullable=True)

    # Linked invoices (JSON array of invoice_nos)
    linked_invoice_nos = Column(String(500), nullable=True)

    # Negotiation
    negotiation_date = Column(Date, nullable=True)
    negotiation_amount = Column(Float, default=0.0)
    payment_expected_date = Column(Date, nullable=True)
    actual_payment_date = Column(Date, nullable=True)

    # Status: OPEN / PARTIAL / UTILIZED / CLOSED / EXPIRED / CANCELLED
    status = Column(String(20), default='OPEN', index=True)

    remarks = Column(Text, nullable=True)
    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    modified_at = Column(DateTime, nullable=True)

    customer_ledger = relationship('LedgerMaster', foreign_keys=[customer_ledger_id])

    __table_args__ = (
        UniqueConstraint('company_id', 'lc_number', name='uix_company_lc_number'),
    )


# =========================================================
# SALARY PROCESSING
# =========================================================
class SalaryProcessing(Base):
    """
    Monthly payroll computation per employee.
    One row = one employee's salary for one month.
    After approval → auto journal posted to accounts.
    """
    __tablename__ = 'salary_processing'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)

    # Period e.g. "2026-06"
    month_year = Column(String(7), nullable=False, index=True)

    employee_id = Column(String(50), nullable=False, index=True)
    employee_name = Column(String(100), nullable=False)
    designation = Column(String(100), nullable=True)
    department = Column(String(100), nullable=True)
    production_at = Column(String(255), nullable=True)           # Plant location

    # Attendance Summary (pulled from daily_attendance)
    present_days = Column(Float, default=0.0)
    absent_days = Column(Float, default=0.0)
    ot_hours = Column(Float, default=0.0)
    ot_amount = Column(Float, default=0.0)

    # Earnings
    basic_salary = Column(Float, default=0.0)
    hra = Column(Float, default=0.0)
    conveyance_allowance = Column(Float, default=0.0)
    special_allowance = Column(Float, default=0.0)
    other_earnings = Column(Float, default=0.0)
    gross_salary = Column(Float, default=0.0)                    # Sum of all earnings

    # Deductions
    pf_employee = Column(Float, default=0.0)                     # Employee PF 12%
    esi_employee = Column(Float, default=0.0)                    # Employee ESI 0.75%
    professional_tax = Column(Float, default=0.0)
    tds_salary = Column(Float, default=0.0)
    advance_deduction = Column(Float, default=0.0)               # From salary_advances
    lwf_employee = Column(Float, default=0.0)
    other_deductions = Column(Float, default=0.0)
    total_deductions = Column(Float, default=0.0)

    # Employer Contributions (Expense side)
    pf_employer = Column(Float, default=0.0)                     # Employer PF 12%
    esi_employer = Column(Float, default=0.0)                    # Employer ESI 3.25%
    lwf_employer = Column(Float, default=0.0)

    # Net Payable
    net_payable = Column(Float, default=0.0)                     # gross - deductions

    # Payment
    payment_mode = Column(String(20), default='BANK')            # BANK / CASH
    payment_date = Column(Date, nullable=True)
    utr_reference = Column(String(50), nullable=True)
    payment_status = Column(String(20), default='UNPAID')        # UNPAID / PAID

    # Workflow
    # DRAFT → APPROVED → PAID
    status = Column(String(20), default='DRAFT', index=True)
    approved_by = Column(String(100), nullable=True)
    approved_at = Column(DateTime, nullable=True)

    # GL Links — auto-journal on approval
    salary_journal_id = Column(Integer, ForeignKey('voucher_headers.id'), nullable=True)
    payment_journal_id = Column(Integer, ForeignKey('voucher_headers.id'), nullable=True)

    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    salary_journal = relationship('VoucherHeader', foreign_keys=[salary_journal_id])
    payment_journal = relationship('VoucherHeader', foreign_keys=[payment_journal_id])

    __table_args__ = (
        UniqueConstraint('company_id', 'employee_id', 'month_year', name='uix_salary_emp_month'),
    )


# =========================================================
# PRODUCTION COST ALLOCATION
# =========================================================
class ProductionCostAllocation(Base):
    """
    Aggregated cost sheet per production batch.
    Sums up Raw Material + Labour + Power + Ice + Water + Packing.
    Generates WIP journal and locks Cost-per-KG for profitability.
    """
    __tablename__ = 'production_cost_allocations'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)

    # Source batch
    batch_number = Column(String(100), nullable=False, index=True)
    production_date = Column(Date, nullable=False)
    production_at = Column(String(255), nullable=True)           # Plant
    species = Column(String(100), nullable=True)

    # Input Quantities
    input_qty_kg = Column(Float, default=0.0)                    # RM received (KG)
    output_qty_kg = Column(Float, default=0.0)                   # Finished output (KG)
    yield_percent = Column(Float, default=0.0)                   # output/input * 100
    process_loss_kg = Column(Float, default=0.0)

    # Cost Components (INR)
    raw_material_cost = Column(Float, default=0.0)
    labour_cost = Column(Float, default=0.0)                     # Peeling, de-heading, grading
    power_cost = Column(Float, default=0.0)                      # Electricity
    ice_cost = Column(Float, default=0.0)
    water_cost = Column(Float, default=0.0)
    packing_material_cost = Column(Float, default=0.0)           # Carton, polybag, master box
    chemical_cost = Column(Float, default=0.0)                   # Soaking chemicals
    cold_storage_cost = Column(Float, default=0.0)
    other_cost = Column(Float, default=0.0)

    total_cost = Column(Float, default=0.0)                      # Sum of all components
    cost_per_kg = Column(Float, default=0.0)                     # total_cost / output_qty_kg

    # GL Links
    wip_ledger_id = Column(Integer, ForeignKey('ledger_masters.id'), nullable=True)
    wip_journal_id = Column(Integer, ForeignKey('voucher_headers.id'), nullable=True)     # WIP Dr / Expense Cr
    fg_journal_id = Column(Integer, ForeignKey('voucher_headers.id'), nullable=True)      # FG Dr / WIP Cr
    cost_center_id = Column(Integer, ForeignKey('cost_centers.id'), nullable=True)

    # Status: OPEN / COST_ALLOCATED / FG_TRANSFERRED
    status = Column(String(30), default='OPEN', index=True)

    created_by = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    modified_at = Column(DateTime, nullable=True)

    wip_ledger = relationship('LedgerMaster', foreign_keys=[wip_ledger_id])
    wip_journal = relationship('VoucherHeader', foreign_keys=[wip_journal_id])
    fg_journal = relationship('VoucherHeader', foreign_keys=[fg_journal_id])
    cost_center = relationship('CostCenter', foreign_keys=[cost_center_id])

    __table_args__ = (
        UniqueConstraint('company_id', 'batch_number', name='uix_company_batch_cost'),
    )
