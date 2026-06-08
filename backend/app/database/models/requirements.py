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
from app.database.models.criteria import metacolumns


class ProductionRequirement(Base, metacolumns):
    __tablename__ = "production_requirements"

    id = Column(Integer, primary_key=True, index=True)

    # =====================================================
    # COMPANY
    # =====================================================

    company_id = Column(String(50), index=True)

    # =====================================================
    # ORDER INFORMATION
    # =====================================================

    po_number = Column(String(100), index=True)
    po_date = Column(Date)

    customer_name = Column(String(255))

    # =====================================================
    # PRODUCT DETAILS
    # =====================================================

    species = Column(String(100))
    variety = Column(String(100))
    grade = Column(String(100))

    packing_style = Column(String(100))
    freezer = Column(String(100))

    count_glaze = Column(String(50))
    weight_glaze = Column(String(50))

    production_for = Column(String(255))

    # =====================================================
    # ORDER QUANTITY
    # =====================================================

    no_of_mc = Column(Float, default=0)

    ordered_qty = Column(Float, default=0)

    # =====================================================
    # SNAPSHOT STOCK
    # =====================================================

    snapshot_stock = Column(Float, default=0)

    snapshot_date = Column(Date)

    # =====================================================
    # CURRENT AVAILABLE STOCK
    # =====================================================

    available_stock = Column(Float, default=0)

    stock_mc = Column(Float, default=0)

    existed_stock_util = Column(Float, default=0)

    # =====================================================
    # PRODUCTION REQUIREMENT
    # =====================================================

    pending_production = Column(Float, default=0)

    prod_pending_mc = Column(Float, default=0)

    pending_percentage = Column(Float, default=0)

    # =====================================================
    # COUNT CALCULATIONS
    # =====================================================

    net_count_calc = Column(Float, default=0)

    nw_grade = Column(String(100))

    hl_count_calc = Column(Float, default=0)

    hoso_count_calc = Column(Float, default=0)

    # =====================================================
    # RAW MATERIAL REQUIREMENTS
    # =====================================================

    req_hlso_qty = Column(Float, default=0)

    req_hoso_qty = Column(Float, default=0)

    # =====================================================
    # REFERRAL / OPTIONAL STOCK
    # =====================================================

    referral_stock = Column(Float, default=0)

    # =====================================================
    # STATUS
    # =====================================================

    status = Column(
        String(30),
        default="PENDING"
    )
    # PENDING
    # PARTIALLY_COVERED
    # FULLY_COVERED
    # IN_PRODUCTION
    # COMPLETED

    # =====================================================
    # SNAPSHOT CONTROL
    # =====================================================

    calculation_date = Column(Date)

    # =====================================================
    # AUDIT
    # =====================================================

    created_at = Column(
        DateTime,
        default=datetime.utcnow
    )