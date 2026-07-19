from sqlalchemy import Column, Integer, String, Date, Time, Float, Boolean, DateTime, UniqueConstraint, ForeignKey, Text
from app.database import Base

class GateEntry(Base):
    __tablename__ = "gate_entry"

    id = Column(Integer, primary_key=True, index=True)

    batch_number = Column(String(100), index=True)
    challan_number = Column(String)
    gate_pass_number = Column(String)
    receiving_center = Column(String)   # 👈 NEW COLUMN
    supplier_name = Column(String)
    purchasing_location = Column(String(255))
    vehicle_number = Column(String)
    driver_name = Column(String(255))

    no_of_material_boxes = Column(Float)
    no_of_empty_boxes = Column(Float)
    no_of_ice_boxes = Column(Float)

    species = Column(String(100))

    date = Column(Date)
    time = Column(Time)
    email = Column(String)
    company_id = Column(String(50))
    production_for = Column(String(255))

    status = Column(String(50), default="Active")
    is_cancelled = Column(Boolean, default=False)
    cancel_reason = Column(String, nullable=True)
    cancelled_by = Column(String(255), nullable=True)
    cancelled_at = Column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "gate_pass_number",
            "challan_number",
            name="uix_company_gatepass_challan"
        ),
    )


# ---------------------------------------------------------
# NON-RMP GOODS GATE MOVEMENTS
# ---------------------------------------------------------
class GoodsGateMovement(Base):
    """Security gate register for all non-raw-material goods movements."""
    __tablename__ = "goods_gate_movements"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), nullable=False, index=True)
    movement_number = Column(String(100), nullable=False, index=True)
    movement_type = Column(String(10), nullable=False, index=True)  # IN / OUT
    movement_date = Column(Date, nullable=False, index=True)
    movement_time = Column(Time, nullable=False)
    production_for = Column(String(255), nullable=False, index=True)
    plant_location = Column(String(255), nullable=False, index=True)

    party_name = Column(String(255), nullable=False)
    source_destination = Column(String(255))
    po_number = Column(String(100))
    challan_number = Column(String(100))
    invoice_number = Column(String(100))
    vehicle_number = Column(String(100))
    driver_name = Column(String(255))
    department = Column(String(255))
    purpose = Column(String(255), nullable=False)
    authorized_received_by = Column(String(255))

    is_returnable = Column(Boolean, default=False, nullable=False)
    expected_return_date = Column(Date)
    linked_movement_id = Column(Integer, ForeignKey("goods_gate_movements.id"), nullable=True)
    return_status = Column(String(30), default="NOT_APPLICABLE", nullable=False)
    status = Column(String(30), default="ACTIVE", nullable=False)
    remarks = Column(Text)

    created_by = Column(String(255), nullable=False)
    created_at = Column(DateTime, nullable=False)
    is_cancelled = Column(Boolean, default=False, nullable=False)
    cancel_reason = Column(Text)
    cancelled_by = Column(String(255))
    cancelled_at = Column(DateTime)

    __table_args__ = (
        UniqueConstraint("company_id", "movement_number", name="uix_company_goods_gate_movement"),
    )


class GoodsGateMovementItem(Base):
    __tablename__ = "goods_gate_movement_items"

    id = Column(Integer, primary_key=True, index=True)
    movement_id = Column(
        Integer,
        ForeignKey("goods_gate_movements.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item_category = Column(String(150), nullable=False, index=True)
    item_name = Column(String(255), nullable=False)
    description = Column(Text)
    quantity = Column(Float, nullable=False)
    unit = Column(String(50), nullable=False)
    packages = Column(Float, default=0)
    returned_quantity = Column(Float, default=0)
    material_condition = Column(String(100))
    remarks = Column(Text)

# ---------------------------------------------------------
# RAW MATERIAL PURCHASING
# ---------------------------------------------------------
class RawMaterialPurchasing(Base):
    __tablename__ = "raw_material_purchasing"

    id = Column(Integer, primary_key=True, index=True)

    batch_number = Column(String(100), index=True)
    supplier_name = Column(String)

    variety_name = Column(String)
    species = Column(String)
    count = Column(String)  # VARCHAR(50)

    g1_qty = Column(Float)
    g2_qty = Column(Float)
    dc_qty = Column(Float)

    received_qty = Column(Float)

    rate_per_kg = Column(Float)
    amount = Column(Float)

    material_boxes = Column(Float)

    remarks = Column(String)

    email = Column(String)
    company_id = Column(String(50))

    date = Column(Date)
    time = Column(Time)
    hsn_code = Column(String(20))
    peeling_at = Column(String(255))
    production_for = Column(String(255))

    # Auto-posted when RM purchase is confirmed
    journal_id = Column(Integer, nullable=True)              # FK → voucher_headers.id
    inventory_ledger_id = Column(Integer, nullable=True)     # FK → ledger_masters.id (RM Inventory Dr)
    supplier_ledger_id = Column(Integer, nullable=True)      # FK → ledger_masters.id (Supplier Cr)
    cost_center_id = Column(Integer, nullable=True)          # FK → cost_centers.id (e.g. Production)

    status = Column(String(50), default="Active")
    is_cancelled = Column(Boolean, default=False)
    cancel_reason = Column(String, nullable=True)
    cancelled_by = Column(String(255), nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
# ---------------------------------------------------------
# DE-HEADING
# ---------------------------------------------------------
class DeHeading(Base):
    __tablename__ = "de_heading"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date)
    time = Column(Time)
    peeling_at = Column(String(255))
    production_for = Column(String(255))
    species = Column(String)
    batch_number = Column(String(100), index=True)
    hoso_count = Column(String(50))
    hoso_qty = Column(Float)
    hlso_qty = Column(Float)
    yield_percent = Column(Float)
    target_yield_percent = Column(Float)
    diff_qty = Column(Float)
    diff_percent = Column(Float)

    contractor = Column(String(255))
    rate_per_kg = Column(Float)
    amount = Column(Float)
    journal_id = Column(Integer, nullable=True)
    email = Column(String)
    company_id = Column(String(50))

    status = Column(String(50), default="Active")
    is_cancelled = Column(Boolean, default=False)
    cancel_reason = Column(String, nullable=True)
    cancelled_by = Column(String(255), nullable=True)
    cancelled_at = Column(DateTime, nullable=True)

# ---------------------------------------------------------
# GRADING (Matches PostgreSQL exactly)
# ---------------------------------------------------------
class Grading(Base):
    __tablename__ = "grading"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date)
    time = Column(Time)
    peeling_at = Column(String(255))
    production_for = Column(String(255))
    species = Column(String(100))
    batch_number = Column(String(100), index=True)
    hoso_count = Column(String(50))
    variety_name = Column(String(100))
    graded_count = Column(String(50))
    quantity = Column(Float)


    email = Column(String)
    company_id = Column(String(50))

    status = Column(String(50), default="Active")
    is_cancelled = Column(Boolean, default=False)
    cancel_reason = Column(String, nullable=True)
    cancelled_by = Column(String(255), nullable=True)
    cancelled_at = Column(DateTime, nullable=True)





# ---------------------------------------------------------
# PEELING
# ---------------------------------------------------------
class Peeling(Base):
    __tablename__ = "peeling"

    id = Column(Integer, primary_key=True, index=True)
    peeling_at = Column(String(255))
    production_for = Column(String(255))
    species = Column(String(100))
    batch_number = Column(String(100), index=True)
    hlso_count = Column(String(50))
    hlso_qty = Column(Float)

    variety_name = Column(String(100))
    peeled_qty = Column(Float)

    yield_percent = Column(Float)
    target_yield_percent = Column(Float)
    contractor_name = Column(String(100))      # ← MISSING FIELD (Added Now)
    rate = Column(Float)
    amount = Column(Float)
    journal_id = Column(Integer, nullable=True)

    diff_qty = Column(Float)
    diff_percent = Column(Float)
    date = Column(Date)
    time = Column(Time)

    # For multi-company access control
    email = Column(String(200))
    company_id = Column(String(50))

    status = Column(String(50), default="Active")
    is_cancelled = Column(Boolean, default=False)
    cancel_reason = Column(String, nullable=True)
    cancelled_by = Column(String(255), nullable=True)
    cancelled_at = Column(DateTime, nullable=True)



# ---------------------------------------------------------
# SOAKING
# ---------------------------------------------------------
class Soaking(Base):
    __tablename__ = "soaking"

    id = Column(Integer, primary_key=True, index=True)

    sintex_number = Column(String(100)) #
    batch_number = Column(String(100), index=True)
    variety_name = Column(String(100))
    in_count = Column(String(50))
    in_qty = Column(Float)

    chemical_name = Column(String(255))
    chemical_percent = Column(Float)
    chemical_qty = Column(Float)

    salt_percent = Column(Float)
    salt_qty = Column(Float)
    rejection_qty = Column(Float, default=0)
    rejection_for = Column(String(100)) #

    species = Column(String(100))
    company_id = Column(String(50))
    email = Column(String)

    date = Column(Date)
    time = Column(Time)
    production_at = Column(String(255))
    production_for = Column(String(255))
    status = Column(String, default="Pending")

    is_cancelled = Column(Boolean, default=False)
    cancel_reason = Column(String, nullable=True)
    cancelled_by = Column(String(255), nullable=True)
    cancelled_at = Column(DateTime, nullable=True)


# ---------------------------------------------------------
# PRODUCTION
# ---------------------------------------------------------
class Production(Base):
    __tablename__ = "production"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date)
    time = Column(Time)
    production_at = Column(String(255))
    production_for = Column(String(255))
    production_type = Column(String)
    species = Column(String(100))
    batch_number = Column(String(100), index=True)
    brand = Column(String(255))
    variety_name = Column(String(100))
    glaze = Column(String(50))
    freezer = Column(String(50))
    packing_style = Column(String(255))
    grade = Column(String(50))

    no_of_mc = Column(Integer)
    loose = Column(Integer)
    production_qty = Column(Float)

    target_yield_percent = Column(Float)
    diff_qty = Column(Float)
    diff_percent = Column(Float)

    company_id = Column(String(50))
    email = Column(String)

    status = Column(String(50), default="Active")
    is_cancelled = Column(Boolean, default=False)
    cancel_reason = Column(String, nullable=True)
    cancelled_by = Column(String(255), nullable=True)
    cancelled_at = Column(DateTime, nullable=True)



from sqlalchemy import Column, Integer, String, Text, DateTime
from datetime import datetime


class AuditLog(Base):
    __tablename__ = "audit_log"

    id = Column(Integer, primary_key=True, index=True)

    table_name = Column(String(100))
    record_id = Column(Integer)
    company_id = Column(String(50))

    field_name = Column(String(100))
    old_value = Column(Text)
    new_value = Column(Text)

    edited_by = Column(String(255))
    edited_at = Column(DateTime, default=datetime.utcnow)

from sqlalchemy import Column, Integer, String, Float, Date, Time
from app.database import Base  #   Base

class HlsoForGrading(Base):
    __tablename__ = "hlso_for_grading"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False)
    time = Column(Time, nullable=False)

    # Core Tracking Attributes
    batch_number = Column(String(100), index=True, nullable=False)
    production_for = Column(String(255), index=True, nullable=False) #
    peeling_at = Column(String(255), nullable=False)                 #
    species = Column(String(100), nullable=False)
    hoso_count = Column(String(50), nullable=False)                  # ‌

    # Live Balance Columns
    total_hlso_qty = Column(Float, default=0.0)  # DeHeading    ‌
    graded_qty = Column(Float, default=0.0)      #
    available_qty = Column(Float, default=0.0)   #     (total_hlso_qty - graded_qty)

    # State Control Engine
    status = Column(String(50), default="Pending") # Pending / Completed (Done)
    email = Column(String(255))
    company_id = Column(String(50), index=True, nullable=False)    # -
