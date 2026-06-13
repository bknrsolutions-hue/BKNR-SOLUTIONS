from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Date,
    DateTime
)
from datetime import datetime
from app.database import Base


class FloorBalance(Base):
    __tablename__ = "floor_balance"

    id = Column(Integer, primary_key=True, index=True)

    # Company
    company_id = Column(String(50), index=True)

    # Location Details
    location = Column(String(100), index=True)
    production_for = Column(String(100), index=True)

    # Batch Details
    batch_number = Column(String(100), index=True)

    # Product Details
    source_type = Column(String(30), index=True)   # RMP / REPROCESS

    species = Column(String(100), index=True)
    variety = Column(String(100), index=True)
    count = Column(String(50), index=True)

    # Balance
    available_qty = Column(Float, default=0.0)

    # Valuation
    inventory_value = Column(Float, default=0.0)

    # Audit
    last_transaction = Column(String(50))
    last_updated = Column(DateTime, default=datetime.utcnow)

    date = Column(String(20))
    time = Column(String(20))

    email = Column(String(150))

#scheduler snapshot table
class FloorBalanceSnapshot(Base):
    __tablename__ = "floor_balance_snapshot"

    id = Column(Integer, primary_key=True)

    snapshot_date = Column(Date, index=True)

    company_id = Column(String(50))

    location = Column(String(100))
    production_for = Column(String(100))

    batch_number = Column(String(100))

    source_type = Column(String(30))

    species = Column(String(100))
    variety = Column(String(100))
    count = Column(String(50))

    opening_qty = Column(Float, default=0.0)

    inventory_value = Column(Float, default=0.0)

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )