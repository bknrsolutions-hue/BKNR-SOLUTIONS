from sqlalchemy import Column, Integer, String, Float, Date   # ← Date added
from app.database import Base
from app.database.models.criteria import metacolumns  # using same meta fields


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

    no_of_mc = Column(Integer)                 # Number of Boxes
    loose = Column(Integer)                    # Loose slabs
    quantity = Column(Float)                   # TOTAL KG AUTO CALCULATED

    purpose = Column(String(255), nullable=True)
    po_number = Column(String(255), nullable=True)

    production_at = Column(String(255))        # New Added Field


# --------------------------------------------------------
# PENDING ORDERS  (for Sales → Stock Entry PO lookup)
# --------------------------------------------------------
class pending_orders(Base, metacolumns):
    __tablename__ = "pending_orders"

    id = Column(Integer, primary_key=True)
    po_number = Column(String(255), nullable=False, index=True)

    buyer = Column(String(255))
    agent_name = Column(String(255))
    brand = Column(String(255))
    country = Column(String(255))
    packing_style = Column(String(255))

    count_glaze = Column(String(50))      # Glaze for count
    weight_glaze = Column(String(50))     # Glaze for weight

    variety = Column(String(255))
    grade = Column(String(255))

    no_of_mc = Column(Integer)            # Ordered slabs / MC
    shipment_date = Column(Date)          # Estimated shipment date
