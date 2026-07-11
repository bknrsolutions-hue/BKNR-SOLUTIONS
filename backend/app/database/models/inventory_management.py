from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Date,
    Time,
    Text,
    DateTime,
    Boolean,
    UniqueConstraint
)
from datetime import datetime  # ✅ Idhi kachithanga undali
from app.utils.timezone import ist_now
from app.database import Base
from app.database.models.criteria import metacolumns

# --------------------------------------------------------
# STOCK ENTRY
# --------------------------------------------------------

class stock_entry(Base, metacolumns):
    __tablename__ = "stock_entry"

    id = Column(Integer, primary_key=True, index=True)

    batch_number = Column(String(255))
    type_of_production = Column(String(255))
    cargo_movement_type = Column(String(50))   # IN / OUT
    location = Column(String(255))
    brand = Column(String(255))
    freezer = Column(String(255))
    packing_style = Column(String(255))

    glaze = Column(String(50))
    variety = Column(String(255))
    grade = Column(String(255))

    no_of_mc = Column(Integer)
    loose = Column(Integer)
    quantity = Column(Float)

    purpose = Column(String(255), nullable=True)
    po_number = Column(String(255), nullable=True)

    production_at = Column(String(255))
    production_for = Column(String(255))
    species = Column(String(100))

    # Cancellation attributes
    status = Column(String(50), default="Active")
    is_cancelled = Column(Boolean, default=False)
    cancel_reason = Column(Text, nullable=True)
    cancelled_by = Column(String(255), nullable=True)
    cancelled_at = Column(DateTime, nullable=True)

    # ======================================
    # 🔥 INVENTORY COSTING COLUMNS (NEW)
    # ======================================
    product_kg_value = Column(Float, default=0.0)          # Cost per KG
    inventory_value = Column(Float, default=0.0)           # Qty * product_kg_value
    hlso_count = Column(Float, default=0.0)                # HLSO Count
    hoso_count = Column(Float, default=0.0)                # HOSO Count
    sales_reference_rate = Column(Float, default=0.0)      # Sales Benchmark Rate

# --------------------------------------------------------
# PENDING ORDERS
# --------------------------------------------------------
class pending_orders(Base):
    __tablename__ = "pending_orders"

    id = Column(Integer, primary_key=True)
    company_name = Column(String(255)) 
    production_at = Column(String(255), nullable=True)
    po_number = Column(String)
    buyer = Column(String)
    agent_name = Column(String)
    brand = Column(String)
    country = Column(String)
    packing_style = Column(String)
    freezer = Column(String)
    count_glaze = Column(String)
    weight_glaze = Column(String)
    variety = Column(String)
    grade = Column(String)
    no_of_mc = Column(Integer)
    selling_price = Column(Float, default=0.0)
    exchange_rate = Column(Float, default=0.0)
    shipment_date = Column(Date)
    progress_steps = Column(Text)
    email = Column(String)
    company_id = Column(String)
    date = Column(Date)
    time = Column(Time)
    sl_no = Column(Integer)
    species = Column(String(100))
    no_of_pieces = Column(Integer, default=0)

# --------------------------------------------------------
# SALES DISPATCH (SALES REPORT TABLE)
# --------------------------------------------------------
class sales_dispatch(Base):
    __tablename__ = "sales_dispatch"

    id = Column(Integer, primary_key=True, index=True)
    
    company_id = Column(String(100))
    invoice_no = Column(String(100))
    invoice_date = Column(String(50))
    shipping_bill = Column(String(100), nullable=True)
    container_no = Column(String(100), nullable=True)
    buyer_name = Column(String(255))
    brand = Column(String(255))
    country = Column(String(100))
    count_glaze = Column(String(50))
    weight_glaze = Column(String(50))
    packing_style = Column(String(255))
    no_of_mc = Column(Integer)
    price = Column(Float)
    variety = Column(String, nullable=True)
    grade = Column(String, nullable=True)
    po_number = Column(String(255), nullable=True)
    company_name = Column(String(255)) 
    production_at = Column(String(255), nullable=True)
    exchange_rate = Column(Float, default=83.50)
    stock_value = Column(Float, default=0.0)
    profit_loss = Column(Float, default=0.0)
    freight_cost = Column(Float, default=0.0)
    packing_cost = Column(Float, default=0.0)
    status = Column(String(50), default="Unpaid") 
    sales_quantity = Column(Float, default=0.0, nullable=True)  
    amount_usd = Column(Float, default=0.0, nullable=True)      
    amount_inr = Column(Float, default=0.0, nullable=True)
    journal_id = Column(Integer, nullable=True)
    created_at = Column(Date, default=lambda: ist_now().date()
)
  
    
# --------------------------------------------------------
# COLD STORAGE HOLDING (FINAL MODEL)
# --------------------------------------------------------
class cold_storage_holding(Base, metacolumns):
    __tablename__ = "cold_storage_holding"

    id = Column(Integer, primary_key=True, index=True)
    
    # Storage Location Details
    cold_storage_name = Column(String(255))    # Name of the Storage Facility
    address = Column(String(255), nullable=True)
    
    # Stock Identity & Movement
    batch_number = Column(String(255), index=True)
    cargo_movement_type = Column(String(50))     # IN / OUT
    species = Column(String(100))
    variety = Column(String(255))
    grade = Column(String(255))
    brand = Column(String(255))
    freezer = Column(String(255))
    packing_style = Column(String(255))
    glaze = Column(String(50))

    # Inventory Details
    no_of_mc = Column(Integer)
    loose = Column(Integer, default=0)
    quantity = Column(Float)                     # Total Weight in KG

    # References & Purpose
    purpose = Column(String(255), nullable=True)
    po_number = Column(String(255), nullable=True)
    production_at = Column(String(255))
    production_for = Column(String(255))
    product_kg_value = Column(Float, default=0.0)
    inventory_value = Column(Float, default=0.0) 
    # Rent & Date Tracking
    in_date = Column(Date, default=lambda: ist_now().date())
    storage_rate_per_mc = Column(Float, default=0.0)  # Rate per Master Carton
    rent_start_date = Column(Date, nullable=True)
    last_billed_date = Column(Date, nullable=True)
    rent_type = Column(String(20))
    handling_rate = Column(Float, default=0.0)
    loading_unloading_cost = Column(Float, default=0.0)
    paid_amount = Column(Float, default=0.0)
    
    # Status Management
    status = Column(String(50), default="HOLDING")    # HOLDING / DISPATCHED / TRANSFERRED
    remarks = Column(Text, nullable=True)
 
  # --------------------------------------------------------
# COLD STORAGE MASTER
# --------------------------------------------------------
class cold_storage(Base, metacolumns):
    __tablename__ = "cold_storage"

    id = Column(Integer, primary_key=True, index=True)
    
    # Facility Details
    storage_name = Column(String(255), unique=True, index=True) # Ex: "Vizag Main Cold Storage"
    storage_type = Column(String(100)) # Internal / External / Third-party
    address = Column(String(500), nullable=True)
    contact_person = Column(String(255), nullable=True)
    contact_number = Column(String(50), nullable=True)
    
    # Capacity Management
    total_capacity_mc = Column(Integer, default=0) # Total Master Cartons capacity
    no_of_chambers = Column(Integer, default=1)
    
    # Commercial Terms (Contract)
    rate_per_mc_per_month = Column(Float, default=0.0)
    loading_unloading_charges = Column(Float, default=0.0) # Per MC charge
    handling_charges = Column(Float, default=0.0)
    rent_type = Column(String(20))
    # Status
    is_active = Column(String(20), default="ACTIVE") # ACTIVE / INACTIVE
    remarks = Column(Text, nullable=True)

    # --------------------------------------------------------
   # INVENTORY SUMMARY
   # --------------------------------------------------------
class InventorySummary(Base):
    __tablename__ = "inventory_summary"

    id = Column(Integer, primary_key=True, index=True)

    company_id = Column(String(50), index=True)

    species = Column(String(100))
    variety = Column(String(100))
    grade = Column(String(100))

    packing_style = Column(String(100))
    glaze = Column(String(50))

    production_for = Column(String(255))
    production_at = Column(String(255))

    freezer = Column(String(100))

    available_qty = Column(Float, default=0)
    available_mc = Column(Float, default=0)
    available_loose = Column(Float, default=0)

    avg_rate = Column(Float, default=0)
    inventory_value = Column(Float, default=0)

    reserved_qty = Column(Float, default=0)
    pending_prod_qty = Column(Float, default=0)

    last_transaction_date = Column(Date)

    updated_at = Column(
        DateTime,
        default=datetime.utcnow
    )

    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "species",
            "variety",
            "grade",
            "packing_style",
            "glaze",
            "production_for",
            "production_at",
            "freezer",
            name="uq_inventory_summary"
        ),
    )
    # --------------------------------------------------------
   # INVENTORY SUMMARY scheduler
   # --------------------------------------------------------
class InventoryDailySnapshot(Base):
    __tablename__ = "inventory_daily_snapshot"

    id = Column(Integer, primary_key=True)

    snapshot_date = Column(Date, index=True)

    company_id = Column(String(50))

    species = Column(String(100))
    variety = Column(String(100))
    grade = Column(String(100))

    packing_style = Column(String(100))
    glaze = Column(String(50))

    production_for = Column(String(255))
    production_at = Column(String(255))

    freezer = Column(String(100))

    opening_qty = Column(Float, default=0)
    opening_mc = Column(Float, default=0)
    opening_loose = Column(Float, default=0)
    
    avg_rate = Column(Float, default=0)
    inventory_value = Column(Float, default=0) 

    created_at = Column(DateTime)
