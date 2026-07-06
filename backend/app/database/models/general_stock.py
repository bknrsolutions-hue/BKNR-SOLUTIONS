from sqlalchemy import Column, Integer, String, Float, Date, Time, Boolean
from app.database import Base
from datetime import datetime
from app.utils.timezone import ist_now

class GeneralStock(Base):
    __tablename__ = "general_stock"

    id = Column(Integer, primary_key=True, index=True)

    grn_number = Column(String)
    item_name = Column(String)
    unit_name = Column(String)

    movement_type = Column(String)   # IN / OUT
    quantity = Column(Float)

    opening_stock = Column(Float)
    available_stock = Column(Float)
    minimum_level = Column(Float)

    date = Column(Date, default=lambda: ist_now().date())
    time = Column(Time, default=ist_now().time)

    email = Column(String)
    company_id = Column(String(50), index=True)
    is_cancelled = Column(Boolean, default=False)
# ================ 2) GENERAL STORE ITEMS MASTER (SEPARATE TABLE) ================
class GeneralStoreItems(Base):
    __tablename__ = "general_store_items"

    id = Column(Integer, primary_key=True, index=True)

    item_name = Column(String, nullable=False)
    unit_name = Column(String, nullable=False)
    minimum_level = Column(Float, default=0)

    created_date = Column(Date, default=lambda: ist_now().date())
    created_time = Column(Time, default=ist_now().time)
    
    email = Column(String)
    company_id = Column(String(50), index=True)