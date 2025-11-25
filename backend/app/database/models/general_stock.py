from sqlalchemy import Column, Integer, String, Float, Date, Time
from app.database import Base

class GeneralStockEntry(Base):
    __tablename__ = "general_stock_entry"
    id = Column(Integer, primary_key=True)
    grn_number = Column(String)
    item_name = Column(String)
    unit_type = Column(String)
    movement_type = Column(String)
    size = Column(String)
    quantity = Column(Float)
    available_stock = Column(Float)
    opening_stock = Column(Float)
    minimum_stock = Column(Float)
    date = Column(Date)
    time = Column(Time)
    email = Column(String)
