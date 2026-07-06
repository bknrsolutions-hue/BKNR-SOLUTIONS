from datetime import date, datetime
from sqlalchemy import Column, Integer, String, Date, Float, Text, DateTime, ForeignKey, Boolean, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base  # Fixed: use central Base (was declarative_base())

class CustomerReceivable(Base):
    __tablename__ = 'customer_receivables'
    __table_args__ = (UniqueConstraint("company_id", "invoice_no", name="uq_customer_receivables_company_invoice_no"),)

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, index=True, nullable=False)
    
    # Standardized Cross-Linking Block
    invoice_no = Column(String, index=True, nullable=False)
    po_number = Column(String, index=True, nullable=True)
    container_no = Column(String, index=True, nullable=True)
    buyer_name = Column(String, index=True, nullable=False)
    buyer_type = Column(String, nullable=True)       # Direct Buyer / Broker / Distributor
    country = Column(String, nullable=False)
    invoice_date = Column(Date, nullable=False)
    
    # Multi-Currency Realized Gain/Loss Systems
    currency = Column(String, default="USD")
    exchange_rate = Column(Float, default=1.0)          # Booking Ex-Rate
    invoice_value_foreign = Column(Float, default=0.0)   # Total USD Value
    invoice_value_inr = Column(Float, default=0.0)       # Auto Calculation on save
    
    # Realized Settlement Metrics
    actual_received_rate = Column(Float, default=0.0)    # Ex-rate during actual banking entry
    currency_gain_loss = Column(Float, default=0.0)      # Auto Computed Forex P&L
    bank_charges = Column(Float, default=0.0)
    tds_deduction = Column(Float, default=0.0)
    received_amount = Column(Float, default=0.0)         # Received in INR
    balance_amount = Column(Float, default=0.0)          # Outstanding INR
    received_date = Column(Date, nullable=True)
    
    # Buyer Credit Control Architecture
    credit_days = Column(Integer, default=30)
    due_date = Column(Date, nullable=False)
    aging_days = Column(Integer, default=0)
    credit_limit = Column(Float, nullable=True)          # Limit configured in INR/USD
    # Risk Status: CLEAN / OVERDUE / CREDIT_LIMIT_EXCEEDED / HIGH_RISK
    risk_status = Column(String, default="CLEAN", index=True)
    
    payment_status = Column(String, default="PENDING")   # PENDING / PARTIAL / PAID
    status = Column(String, default="OPEN")              # OPEN / CLOSED
    document_path = Column(String, nullable=True)        # Bank Advice / FIRC Copy Path
    remarks = Column(Text, nullable=True)
    
    created_by = Column(String, nullable=False)
    updated_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    approved_by = Column(String, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    journal_id = Column(Integer, ForeignKey("voucher_headers.id"), nullable=True, index=True)
    is_cancelled = Column(Boolean, default=False)


class VendorPayment(Base):
    __tablename__ = 'vendor_payments'
    __table_args__ = (UniqueConstraint("company_id", "bill_no", name="uq_vendor_payments_company_bill_no"),)

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, index=True, nullable=False)
    vendor_name = Column(String, index=True, nullable=False)
    vendor_type = Column(String, nullable=False)       # Ice, Packing, Logistics, Contractor
    gst_no = Column(String, nullable=True)             # ITC Eligibility Audit
    vendor_invoice_no = Column(String, index=True, nullable=True)
    bill_no = Column(String, index=True, nullable=False) # Internal Voucher ID
    bill_date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=False)
    
    # Taxation Breakups
    total_amount = Column(Float, default=0.0)          # Net Gross Payable
    gst_amount = Column(Float, default=0.0)
    tds_amount = Column(Float, default=0.0)
    paid_amount = Column(Float, default=0.0)
    balance = Column(Float, default=0.0)
    
    payment_mode = Column(String, nullable=True)       # RTGS / NEFT / CHEQUE
    transaction_no = Column(String, nullable=True)
    payment_date = Column(Date, nullable=True)
    status = Column(String, default="Unpaid")          # Unpaid / Partially Paid / Paid
    document_path = Column(String, nullable=True)        # Vendor Invoice Scan Attachment
    remarks = Column(Text, nullable=True)

    # --- Accounting Integration (Added) ---
    bank_master_id = Column(Integer, nullable=True)     # FK → bank_masters.id (which bank account)
    journal_id = Column(Integer, nullable=True)          # FK → voucher_headers.id (Supplier Dr / Bank Cr)

    created_by = Column(String, nullable=False)
    updated_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)
    approved_by = Column(String, nullable=True)
    approved_date = Column(Date, nullable=True)
    is_cancelled = Column(Boolean, default=False)


class BankTransaction(Base):
    __tablename__ = 'bank_transactions'
    __table_args__ = (UniqueConstraint("company_id", "reference_no", name="uq_bank_transactions_company_reference_no"),)

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, index=True, nullable=False)
    bank_name = Column(String, index=True, nullable=False)
    transaction_date = Column(Date, nullable=False)
    voucher_type = Column(String, nullable=False)      # RECEIPT / PAYMENT / CONTRA
    reference_no = Column(String, index=True) # UTR / Cheque Ref Number
    
    # Audit Trail Linking
    linked_invoice_no = Column(String, index=True, nullable=True)
    linked_vendor = Column(String, index=True, nullable=True)
    
    debit = Column(Float, default=0.0)
    credit = Column(Float, default=0.0)
    closing_balance = Column(Float, nullable=False)    # Confirmed ledger book balance
    narration = Column(Text, nullable=True)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    journal_id = Column(Integer, ForeignKey("voucher_headers.id"), nullable=True, index=True)
    is_cancelled = Column(Boolean, default=False)


class ExpenseVoucher(Base):
    __tablename__ = 'expense_vouchers'
    __table_args__ = (UniqueConstraint("company_id", "voucher_no", name="uq_expense_vouchers_company_voucher_no"),)

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, index=True, nullable=False)
    voucher_no = Column(String, index=True, nullable=False) # EV-2026-0001
    voucher_date = Column(Date, nullable=False)
    expense_type = Column(String, index=True, nullable=False)            # Fuel, Admin, Welfare
    department = Column(String, nullable=False)                          # Production, Admin, QA
    vendor_name = Column(String, nullable=True)
    
    # Financial & Tax Components
    gst_percentage = Column(Float, default=0.0)                         # e.g., 18.0
    gst_amount = Column(Float, default=0.0)
    amount = Column(Float, default=0.0)                                  # Base Value
    total_amount = Column(Float, default=0.0)                            # Base + GST Amount
    
    approved_by = Column(String, nullable=False)
    payment_mode = Column(String, default="Cash")
    bill_attachment = Column(String, nullable=True)                      # Path to scanned voucher receipt
    status = Column(String, default="APPROVED")                          # PENDING / APPROVED / REJECTED
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    journal_id = Column(Integer, ForeignKey("voucher_headers.id"), nullable=True, index=True)
    is_cancelled = Column(Boolean, default=False)


# ─── JOURNAL ENTRY DOUBLE ENTRY HEADER-LINE ARCHITECTURE ───

class JournalEntry(Base):
    __tablename__ = "journal_entries"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, index=True, nullable=False)
    # Kept globally unique because journal_entry_lines references this natural key.
    entry_no = Column(String, unique=True, index=True, nullable=False)   # JV-2026-0001
    entry_date = Column(Date, nullable=False)
    narration = Column(Text, nullable=False)
    
    total_debit = Column(Float, default=0.0)
    total_credit = Column(Float, default=0.0)                            # Validated strictly at engine level (Dr=Cr)
    
    created_by = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    journal_id = Column(Integer, ForeignKey("voucher_headers.id"), nullable=True, index=True)
    is_cancelled = Column(Boolean, default=False)

    lines = relationship("JournalEntryLine", back_populates="header", cascade="all, delete-orphan")


class JournalEntryLine(Base):
    __tablename__ = "journal_entry_lines"

    id = Column(Integer, primary_key=True, index=True)
    entry_no = Column(String, ForeignKey('journal_entries.entry_no'), nullable=False)
    ledger_name = Column(String, index=True, nullable=False)             # Linked to LedgerMaster
    
    debit = Column(Float, default=0.0)
    credit = Column(Float, default=0.0)

    header = relationship("JournalEntry", back_populates="lines")


# ─── MASTER ACCOUNTING AND REMITTANCE LEDGERS ───

# ─── LEGACY LEDGER MASTER (Simple version — kept for backward compatibility) ───
# NOTE: The full-featured LedgerMaster is in enterprise_finance.py (table: ledger_masters)
# This table (ledger_master) is the older simple version used by PaymentReceipt.
# New code should reference enterprise_finance.LedgerMaster instead.
class LedgerMasterLegacy(Base):
    __tablename__ = "ledger_master"
    __table_args__ = {'extend_existing': True}

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, index=True, nullable=False)
    ledger_name = Column(String, unique=True, index=True, nullable=False)
    ledger_group = Column(String, index=True, nullable=False)            # e.g., Sundry Debtors
    ledger_type = Column(String, nullable=True)                          # ASSET / LIABILITY / INCOME / EXPENSE

    # Statutory Compliance Registrations
    gst_no = Column(String, nullable=True)
    pan_no = Column(String, nullable=True)
    state = Column(String, nullable=True)

    opening_balance = Column(Float, default=0.0)
    balance_type = Column(String, default="DR")                          # DR / CR
    address = Column(Text, nullable=True)
    phone = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class PaymentReceipt(Base):
    __tablename__ = "payment_receipts"
    __table_args__ = (UniqueConstraint("company_id", "receipt_no", name="uq_payment_receipts_company_receipt_no"),)

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, index=True, nullable=False)
    receipt_no = Column(String, index=True, nullable=False) # RCT-2026-0001
    entry_date = Column(Date, nullable=False)
    transaction_type = Column(String, nullable=False)                    # CUSTOMER_RECEIPT / VENDOR_PAYMENT / ADVANCE
    
    party_ledger = Column(String, index=True, nullable=False)            # Links to LedgerMaster Account
    bank_cash_ledger = Column(String, nullable=False)                    # Ledger Name of target asset
    
    # Audit Remittance Linking Standardizations
    invoice_no = Column(String, index=True, nullable=True)              # Populated if Customer Receipt
    vendor_bill_no = Column(String, index=True, nullable=True)          # Populated if Vendor Payment
    
    amount = Column(Float, default=0.0)
    exchange_rate = Column(Float, default=1.0)
    amount_inr = Column(Float, default=0.0)
    bank_charges = Column(Float, default=0.0)
    adjustment_amount = Column(Float, default=0.0)                       # Short-payments / Roundoffs
    
    reference_no = Column(String, nullable=True)                         # Swift Ref / UTR / Cheque Number
    payment_mode = Column(String, nullable=False)
    document_path = Column(String, nullable=True)                        # Uploaded Slip scan path
    narration = Column(Text, nullable=True)
    
    created_by = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    approved_by = Column(String, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    journal_id = Column(Integer, ForeignKey("voucher_headers.id"), nullable=True, index=True)
    is_cancelled = Column(Boolean, default=False)


class BuyerAgingSummary(Base):
    """
    Database View Model for high-performance aging calculations.
    Maps to a dynamic SQL View built via migrations.
    """
    __tablename__ = "v_buyer_aging_summary"

    buyer_name = Column(String, primary_key=True)
    company_id = Column(String, primary_key=True)
    total_outstanding_inr = Column(Float)
    not_due = Column(Float)
    bucket_1_30_days = Column(Float)
    bucket_31_60_days = Column(Float)
    bucket_61_90_days = Column(Float)
    bucket_above_90 = Column(Float)


class ERPAlertEngine(Base):
    """
    Central Exception engine logging structural flags.
    Types: OVERDUE_RECEIVABLE / BL_PENDING / CONTAINER_DELAYED / CERTIFICATE_MISSING / CREDIT_EXCEEDED
    """
    __tablename__ = "erp_alert_engine"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String, index=True, nullable=False)
    alert_type = Column(String, index=True, nullable=False)
    severity = Column(String, default="WARNING")                         # INFO / WARNING / CRITICAL
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    
    # Traceability Context Connection
    linked_reference_no = Column(String, index=True, nullable=True)       # Maps directly to Invoice / Container / Shipment No
    
    is_resolved = Column(Boolean, default=False, index=True)
    resolved_by = Column(String, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
