from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Date, DateTime,
    ForeignKey, Boolean, Text, UniqueConstraint
)
from sqlalchemy.orm import relationship
from app.database import Base


# =========================================================
# FIXED ASSET MASTER
# =========================================================
class FixedAssetMaster(Base):
    """
    Tracks all fixed assets — machinery, buildings, vehicles, computers, furniture.
    Each asset is linked to its GL ledger accounts for automatic depreciation journals.
    """
    __tablename__ = 'fixed_asset_masters'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)
    is_cancelled = Column(Boolean, default=False)

    # --- Identity ---
    asset_code = Column(String(20), nullable=False, index=True)
    asset_name = Column(String(200), nullable=False)

    # BUILDING / PLANT_MACHINERY / IQF_FREEZER / VEHICLE / COMPUTER / FURNITURE / OTHER
    asset_category = Column(String(50), nullable=False)

    # --- Purchase Details ---
    purchase_date = Column(Date, nullable=False)
    purchase_cost = Column(Float, nullable=False)
    supplier_id = Column(Integer, ForeignKey('suppliers.id'), nullable=True)
    purchase_invoice_no = Column(String(50), nullable=True)

    # --- Location ---
    location = Column(String(100), nullable=True)   # e.g. Plant A, Admin Block
    department = Column(String(100), nullable=True)

    # --- Depreciation Configuration ---
    # SLM = Straight Line Method | WDV = Written Down Value
    depreciation_method = Column(String(5), default='WDV')
    dep_rate_percent = Column(Float, nullable=False)       # Annual rate e.g. 15.0 for 15%
    useful_life_years = Column(Integer, nullable=True)     # For SLM calculation
    salvage_value = Column(Float, default=0.0)             # Residual value at end of life

    # --- Current Book Value ---
    accumulated_depreciation = Column(Float, default=0.0)  # Total dep charged so far
    current_wdv = Column(Float, nullable=False)             # Updated each month after dep run

    # --- GL Account Links ---
    asset_ledger_id = Column(Integer, ForeignKey('ledger_masters.id'), nullable=True)
    acc_dep_ledger_id = Column(Integer, ForeignKey('ledger_masters.id'), nullable=True)
    dep_expense_ledger_id = Column(Integer, ForeignKey('ledger_masters.id'), nullable=True)

    # --- Purchase Journal ---
    purchase_journal_id = Column(Integer, ForeignKey('voucher_headers.id'), nullable=True)

    # ACTIVE / DISPOSED / SOLD / FULLY_DEPRECIATED
    status = Column(String(30), default='ACTIVE', index=True)

    # Disposal Details (if status = DISPOSED or SOLD)
    disposal_date = Column(Date, nullable=True)
    disposal_amount = Column(Float, default=0.0)
    disposal_journal_id = Column(Integer, ForeignKey('voucher_headers.id'), nullable=True)

    remarks = Column(Text, nullable=True)
    created_by = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    modified_by = Column(String(100), nullable=True)
    modified_at = Column(DateTime, nullable=True)

    # --- Relationships ---
    asset_ledger = relationship('LedgerMaster', foreign_keys=[asset_ledger_id])
    acc_dep_ledger = relationship('LedgerMaster', foreign_keys=[acc_dep_ledger_id])
    dep_expense_ledger = relationship('LedgerMaster', foreign_keys=[dep_expense_ledger_id])
    depreciation_runs = relationship('DepreciationSchedule', back_populates='asset')

    __table_args__ = (
        UniqueConstraint('company_id', 'asset_code', name='uix_company_asset_code'),
    )


# =========================================================
# DEPRECIATION SCHEDULE (Monthly Run Record)
# =========================================================
class DepreciationSchedule(Base):
    """
    Monthly depreciation run record per asset.
    Auto-created by the Depreciation Run batch job.
    Each row = one month's depreciation for one asset.
    """
    __tablename__ = 'depreciation_schedules'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)

    asset_id = Column(Integer, ForeignKey('fixed_asset_masters.id'), nullable=False)

    # Period e.g. "2026-06"
    period_month = Column(String(7), nullable=False, index=True)

    # Book Values for this period
    opening_wdv = Column(Float, nullable=False)
    dep_rate_percent = Column(Float, nullable=False)
    dep_amount = Column(Float, nullable=False)       # Depreciation charged this month
    closing_wdv = Column(Float, nullable=False)

    # Linked double-entry journal
    journal_id = Column(Integer, ForeignKey('voucher_headers.id'), nullable=True)

    run_date = Column(Date, nullable=False)
    run_by = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # --- Relationships ---
    asset = relationship('FixedAssetMaster', back_populates='depreciation_runs')
    journal = relationship('VoucherHeader', foreign_keys=[journal_id])

    __table_args__ = (
        UniqueConstraint('company_id', 'asset_id', 'period_month', name='uix_asset_dep_period'),
    )
