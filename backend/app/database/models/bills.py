from sqlalchemy import Column, Integer, String, Float, Date, ForeignKey, Text
from app.database import Base
from datetime import datetime

# 1. Electricity Table
class ElectricityLog(Base):
    __tablename__ = "electricity_logs"
    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, index=True)  # Filter ki idi important
    reading_date = Column(Date, default=datetime.utcnow)
    opening_kwh = Column(Float)
    closing_kwh = Column(Float)
    unit_rate = Column(Float)
    total_cost = Column(Float)



# 3. Purchase & Packaging
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
# 4. Logistics / Container
class ContainerLog(Base):
    __tablename__ = "container_logs"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), index=True) # 🏢 Company wise filter kosam
    unit_id = Column(Integer, index=True)
    
    # 🆕 Added Columns
    po_number = Column(String(100), index=True) 
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
# 5. QA Testing
class QATestingLog(Base):
    __tablename__ = "qa_testing_logs"
    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, index=True)
    batch_no = Column(String(50))
    lab_name = Column(String(100))
    test_cost = Column(Float)
    report_ref = Column(String(50))

# 6. Other Expenses
class OtherExpense(Base):
    __tablename__ = "other_expenses"
    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(Integer, index=True)
    category = Column(String(50)) # Canteen, Security, etc.
    amount = Column(Float)
    remarks = Column(Text)