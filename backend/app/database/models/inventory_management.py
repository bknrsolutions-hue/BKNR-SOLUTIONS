from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Date,
    Time,
    Text,
)
from datetime import datetime  # ✅ Idhi kachithanga undali
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

# --------------------------------------------------------
# PENDING ORDERS
# --------------------------------------------------------
class pending_orders(Base):
    __tablename__ = "pending_orders"

    id = Column(Integer, primary_key=True)
    company_name = Column(String(255)) 
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
    
    status = Column(String(50), default="Unpaid") 
    created_at = Column(Date, default=func.now() if 'func' in globals() else datetime.now().date())