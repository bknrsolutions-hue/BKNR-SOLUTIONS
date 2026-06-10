from sqlalchemy import Column, Integer, String, Float, Date, Time, Text
from app.database import Base
from datetime import datetime
from app.utils.timezone import ist_now

class Reprocess(Base):
    __tablename__ = "reprocess_entries"

    id = Column(Integer, primary_key=True, index=True)
    
    # --- Reprocess Specific ---
    date = Column(Date, default=lambda: ist_now().date())
    company_id = Column(String(100))
    reprocess_type = Column(String(50))    # Melting, Repacking, Reglaze
    original_batch = Column(String(255))   # Old Batch Number
    new_batch_id = Column(String(255))     # Generated New Batch ID
    status = Column(String(50), default="In-Progress")

    # --- Inherited from Stock Entry (Full Data) ---
    variety = Column(String(255))
    grade = Column(String(255))
    location = Column(String(255))
    species = Column(String(100))
    
    brand = Column(String(255))
    freezer = Column(String(255))
    packing_style = Column(String(255))
    glaze = Column(String(50))
    
    in_qty = Column(Float)                 # Input Weight (Quantity from Stock OUT)
    out_qty = Column(Float, default=0.0)   # Final Weight after process
    no_of_mc = Column(Integer)
    loose = Column(Integer)

    type_of_production = Column(String(255))
    production_at = Column(String(255))
    production_for = Column(String(255))
    
    # Costing Reference
    product_kg_value = Column(Float, default=0.0)
    inventory_value = Column(Float, default=0.0)