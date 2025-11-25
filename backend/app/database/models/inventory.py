from sqlalchemy import Column, Integer, String, Float, Date, Time
from app.database import Base

class InventoryStock(Base):
    __tablename__ = "inventory_stock"
    id = Column(Integer, primary_key=True)
    item_name = Column(String)
    movement_type = Column(String)  # IN or OUT
    size = Column(String)
    quantity = Column(Float)
    available_stock = Column(Float)
    opening_stock = Column(Float)
    minimum_stock = Column(Float)
    date = Column(Date)
    time = Column(Time)
    email = Column(String)
