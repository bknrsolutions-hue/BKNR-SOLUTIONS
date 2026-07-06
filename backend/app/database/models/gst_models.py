from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Date, DateTime,
    ForeignKey, Boolean, Text, UniqueConstraint
)
from sqlalchemy.orm import relationship
from app.database import Base


# =========================================================
# GST TRANSACTION REGISTER
# =========================================================
class GSTRegister(Base):
    """
    Central GST register — auto-populated whenever a Purchase Invoice,
    Sales Invoice, or Export Invoice is posted.
    Feeds GSTR-1 and GSTR-3B auto-generation.
    """
    __tablename__ = 'gst_register'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)
    is_cancelled = Column(Boolean, default=False)

    # PURCHASE / SALES / EXPORT / RCM / CREDIT_NOTE / DEBIT_NOTE
    transaction_type = Column(String(20), nullable=False, index=True)

    # Source document reference (polymorphic)
    source_table = Column(String(50), nullable=True)  # e.g. purchase_invoices
    source_id = Column(Integer, nullable=True)

    invoice_no = Column(String(50), nullable=False, index=True)
    invoice_date = Column(Date, nullable=False, index=True)

    # Party details
    party_name = Column(String(200), nullable=True)
    gstin = Column(String(15), nullable=True, index=True)
    state_code = Column(String(5), nullable=True)

    # HSN / SAC
    hsn_code = Column(String(10), nullable=True)
    description = Column(String(255), nullable=True)

    # Values
    taxable_value = Column(Float, default=0.0)
    igst_rate = Column(Float, default=0.0)
    cgst_rate = Column(Float, default=0.0)
    sgst_rate = Column(Float, default=0.0)
    igst_amount = Column(Float, default=0.0)
    cgst_amount = Column(Float, default=0.0)
    sgst_amount = Column(Float, default=0.0)
    total_tax = Column(Float, default=0.0)
    invoice_total = Column(Float, default=0.0)

    # Flags
    is_export = Column(Boolean, default=False)        # Zero-rated export
    is_rcm = Column(Boolean, default=False)           # Reverse charge
    is_igst_applicable = Column(Boolean, default=False)
    lut_number = Column(String(50), nullable=True)    # Letter of Undertaking for zero-rated

    # Filing period  e.g. "2026-06"
    period_month = Column(String(7), nullable=False, index=True)

    # Filing Status
    gstr1_applicable = Column(Boolean, default=True)
    gstr1_filed = Column(Boolean, default=False)
    gstr3b_applicable = Column(Boolean, default=True)
    gstr3b_filed = Column(Boolean, default=False)

    # Linked Journal
    journal_id = Column(Integer, ForeignKey('voucher_headers.id'), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    created_by = Column(String(100), nullable=True)

    journal = relationship('VoucherHeader', foreign_keys=[journal_id])

    __table_args__ = (
        UniqueConstraint('company_id', 'invoice_no', 'transaction_type', name='uix_gst_invoice_type'),
    )


# =========================================================
# GSTR FILING STATUS
# =========================================================
class GSTRFilingStatus(Base):
    """
    Tracks monthly GSTR-1, GSTR-3B filing status.
    One row per return per month.
    """
    __tablename__ = 'gstr_filing_status'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)

    # GSTR-1 / GSTR-3B / GSTR-9 / GSTR-9C
    return_type = Column(String(20), nullable=False)

    # e.g. "2026-06"
    period_month = Column(String(7), nullable=False, index=True)

    # Computed totals for this period
    total_output_tax = Column(Float, default=0.0)
    total_input_credit = Column(Float, default=0.0)
    net_gst_payable = Column(Float, default=0.0)
    gst_paid_amount = Column(Float, default=0.0)

    # Filing Details
    # PENDING / PREPARED / FILED / LATE_FILED
    status = Column(String(20), default='PENDING', index=True)
    filing_date = Column(Date, nullable=True)
    arn_number = Column(String(50), nullable=True)   # GST Portal Acknowledgement Ref No
    filed_by = Column(String(100), nullable=True)
    remarks = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('company_id', 'return_type', 'period_month', name='uix_gstr_period'),
    )


# =========================================================
# INPUT TAX CREDIT (ITC) UTILIZATION LEDGER
# =========================================================
class ITCUtilization(Base):
    """
    Tracks ITC opening balance, utilized amount, and closing balance
    per period and per GST type (IGST/CGST/SGST).
    """
    __tablename__ = 'itc_utilization'

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)

    period_month = Column(String(7), nullable=False, index=True)

    # IGST / CGST / SGST
    gst_type = Column(String(5), nullable=False)

    opening_itc = Column(Float, default=0.0)
    itc_earned = Column(Float, default=0.0)       # From purchase invoices
    itc_reversed = Column(Float, default=0.0)      # Reversal entries
    itc_utilized = Column(Float, default=0.0)      # Set off against output tax
    closing_itc = Column(Float, default=0.0)       # Carry forward to next month

    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint('company_id', 'period_month', 'gst_type', name='uix_itc_period_type'),
    )
