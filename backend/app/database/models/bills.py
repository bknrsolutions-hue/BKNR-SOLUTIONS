from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Text, Boolean
from app.database import Base
from sqlalchemy.sql import func
from datetime import datetime

# =========================================================================
# ⚡ 1. ELECTRICITY LOGS SCHEMA
# =========================================================================
class ElectricityLog(Base):
    __tablename__ = "electricity_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, index=True)  # Filter ki idi important
    reading_date = Column(Date, default=datetime.utcnow)
    opening_kwh = Column(Float)
    closing_kwh = Column(Float)
    unit_rate = Column(Float)
    total_cost = Column(Float)
    is_cancelled = Column(Boolean, default=False)


# =========================================================================
# ⛽ 2. DIESEL LOGS SCHEMA
# =========================================================================
class DieselLog(Base):
    __tablename__ = "diesel_logs"
    __table_args__ = {"extend_existing": True}

    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, ForeignKey("production_at.id"), index=True) # Linked to Unit Master
    
    # --- 📅 Date Columns ---
    log_date = Column(Date, default=datetime.utcnow, index=True) # Entry Date
    bill_date = Column(Date, nullable=True) # Invoice Date (for Stock In)
    
    # --- 🏷️ Type & Reference ---
    type = Column(String(10), index=True) # "IN" (GRN) or "OUT" (Consumption)
    grn_no = Column(String(50), nullable=True)
    bill_no = Column(String(50), nullable=True)
    vendor = Column(String(100), nullable=True)
    
    # --- ⛽ Stock Columns ---
    opening_stock = Column(Float, default=0.0)
    purchase_qty = Column(Float, default=0.0) # Received Qty (Stock In)
    consumption = Column(Float, default=0.0)  # Consumed Qty (Stock Out)
    closing_stock = Column(Float, default=0.0)
    
    # --- 💰 Financial Columns ---
    avg_price = Column(Float, default=0.0) # Rate per Liter
    tax_per = Column(Float, default=0.0)   # GST/VAT %
    net_val = Column(Float, default=0.0)    # Total Amount (Including Tax)

    email = Column(String(150), index=True)
    status = Column(String(20), default='DRAFT', index=True)
    journal_id = Column(Integer, nullable=True)
    is_cancelled = Column(Boolean, default=False)


# =========================================================================
# 📦 3. PURCHASE & PACKAGING INVOICES
# =========================================================================
class PurchaseInvoice(Base):
    __tablename__ = "purchase_invoices"

    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, index=True)
    production_at_id = Column(Integer)
    invoice_no = Column(String(50), unique=True, index=True)
    vendor_id = Column(Integer)
    product_id = Column(Integer)
    product_name = Column(String(100))
    hsn_code = Column(String(20))
    po_number = Column(String(100), index=True) 
    qty = Column(Float)
    base_price = Column(Float)
    gst_percent = Column(Float)
    tax_amount = Column(Float)
    grand_total = Column(Float)
    
    invoice_date = Column(Date)
    company_id = Column(String(50), index=True)
    email = Column(String(150))

    # Schema lo unna additional columns
    date = Column(String(50)) # character varying(50)
    time = Column(String(50)) # character varying(50)

    # --- Accounting Integration (Added) ---
    # DRAFT / POSTED / CANCELLED
    status = Column(String(20), default='DRAFT', index=True)
    cost_center_id = Column(Integer, nullable=True)          # FK → cost_centers.id
    journal_id = Column(Integer, nullable=True)               # FK → voucher_headers.id (auto journal)
    purchase_ledger_id = Column(Integer, nullable=True)       # FK → ledger_masters.id (Purchase A/c)
    supplier_ledger_id = Column(Integer, nullable=True)       # FK → ledger_masters.id (Supplier A/c)
    input_gst_ledger_id = Column(Integer, nullable=True)      # FK → ledger_masters.id (Input GST A/c)
    gst_register_id = Column(Integer, nullable=True)          # FK → gst_register.id (auto-populated)
    is_cancelled = Column(Boolean, default=False)


# =========================================================================
# 🚢 4. LOGISTICS / CONTAINER LOGS (Fixed AttributeError: Missing Date)
# =========================================================================
class ContainerLog(Base):
    __tablename__ = "container_logs"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True) # 🏢 Company wise filter kosam
    unit_id = Column(Integer, index=True)
    
    # 🆕 Added Columns
    po_number = Column(String(100), index=True) 
    production_at = Column(String(100), index=True)
    container_no = Column(String(50), unique=True)
    size = Column(String(20)) # 20ft / 40ft
    
    # 🚢 Logistics Details
    vendor_id = Column(Integer, ForeignKey("shipping_vendors.id"))
    vessel_name = Column(String(100))
    
    # 💰 Cost Breakdown
    ocean_cost = Column(Float, default=0.0)
    local_cost = Column(Float, default=0.0)
    handling = Column(Float, default=0.0)
    detention = Column(Float, default=0.0)
    lended_total = Column(Float, default=0.0) # Grand Total (incl. GST)

    # 📅 Added tracking field to resolve costing dashboard query crash
    date = Column(Date, default=func.now() if 'func' in globals() else datetime.utcnow, index=True)

    # --- Accounting Integration (Added) ---
    status = Column(String(20), default='DRAFT', index=True)
    cost_center_id = Column(Integer, nullable=True)
    journal_id = Column(Integer, nullable=True)
    freight_ledger_id = Column(Integer, nullable=True)
    vendor_ledger_id = Column(Integer, nullable=True)
    input_gst_ledger_id = Column(Integer, nullable=True)
    gst_register_id = Column(Integer, nullable=True)
    is_cancelled = Column(Boolean, default=False)


# =========================================================================
# 🔬 5. QA TESTING LOGS (Fixed Architectural Mismatch)
# =========================================================================
class QATestingLog(Base):
    __tablename__ = "qa_testing_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, index=True)
    product_name = Column(String(150), nullable=True)
    batch_no = Column(String(50))
    lab_name = Column(String(100))
    test_cost = Column(Float)
    report_ref = Column(String(50))
    po_number = Column(String(100), index=True) 
    parameters = Column(Text, nullable=True)

    # 📅 Added native tracking date column referenced in router as test_date
    test_date = Column(Date, default=func.now() if 'func' in globals() else datetime.utcnow, index=True)

    # --- Accounting Integration (Added) ---
    status = Column(String(20), default='DRAFT', index=True)
    cost_center_id = Column(Integer, nullable=True)
    journal_id = Column(Integer, nullable=True)
    qa_expense_ledger_id = Column(Integer, nullable=True)
    lab_ledger_id = Column(Integer, nullable=True) # Assuming lab is a vendor
    input_gst_ledger_id = Column(Integer, nullable=True)
    gst_register_id = Column(Integer, nullable=True)
    is_cancelled = Column(Boolean, default=False)


# =========================================================================
# 💼 6. OTHER EXPENSES (With Added Meta Data Column)
# =========================================================================
class OtherExpense(Base):
    __tablename__ = "other_expenses"
    
    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, index=True)
    category = Column(String(50)) # Canteen, Security, etc.
    amount = Column(Float)
    remarks = Column(Text)
    
    # 📝 Added meta details tracking column
    meta = Column(String(255), nullable=True) 

    # 📅 Date tracking column for router compliance
    date = Column(Date, default=func.now() if 'func' in globals() else datetime.utcnow, index=True)

    # --- Accounting Integration (Added) ---
    status = Column(String(20), default='DRAFT', index=True)
    cost_center_id = Column(Integer, nullable=True)
    journal_id = Column(Integer, nullable=True)
    expense_ledger_id = Column(Integer, nullable=True)
    cash_or_bank_ledger_id = Column(Integer, nullable=True)
    gst_register_id = Column(Integer, nullable=True)
    is_cancelled = Column(Boolean, default=False)


class ContractorBillPayment(Base):
    __tablename__ = "contractor_bill_payments"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True, nullable=False)
    contractor_name = Column(String(150), index=True, nullable=False)
    month_year = Column(String(7), index=True, nullable=False)
    bill_total = Column(Float, default=0.0)
    paid_amount = Column(Float, default=0.0)
    payment_mode = Column(String(20), default="BANK")
    payment_date = Column(Date, nullable=True)
    utr_reference = Column(String(50), nullable=True)
    payment_status = Column(String(20), default="UNPAID")
    journal_id = Column(Integer, nullable=True)
    bank_cash_ledger_id = Column(Integer, nullable=True)
    is_cancelled = Column(Boolean, default=False)
    created_by = Column(String(150), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
