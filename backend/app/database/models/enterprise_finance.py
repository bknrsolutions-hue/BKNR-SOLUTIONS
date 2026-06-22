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
    opening_balance_type = Column(String(2), default='DR') # DR / CR
    
    gstin = Column(String(15), nullable=True)
    pan = Column(String(10), nullable=True)
    address = Column(String(255), nullable=True)
    phone = Column(String(20), nullable=True)
    email = Column(String(100), nullable=True)
    credit_days = Column(Integer, default=30)
    credit_limit = Column(Float, default=0.0)
    branch_id = Column(Integer, ForeignKey('branch_masters.id'), nullable=True)
    status = Column(String(20), default='ACTIVE') # ACTIVE / INACTIVE
    
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
    cost_center_name = Column(String(100), nullable=False) # Production, Processing, Packing, Cold Storage, Export, Administration
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

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
