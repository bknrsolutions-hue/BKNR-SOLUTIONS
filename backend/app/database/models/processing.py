from sqlalchemy import Column, Integer, String, Date, Time, Float
from app.database import Base


# ---------------------------------------------------------
# GATE ENTRY
# ---------------------------------------------------------
class GateEntry(Base):
    __tablename__ = "gate_entry"

    id = Column(Integer, primary_key=True, index=True)

    batch_number = Column(String(100))
    challan_number = Column(String)
    gate_pass_number = Column(String)

    supplier_name = Column(String)
    purchasing_location = Column(String(255))
    vehicle_number = Column(String)

    no_of_material_boxes = Column(Float)
    no_of_empty_boxes = Column(Float)
    no_of_ice_boxes = Column(Float)

    species = Column(String(100))  # optional species lookup

    date = Column(Date)
    time = Column(Time)
    email = Column(String)
    company_id = Column(String(50))


# ---------------------------------------------------------
# RAW MATERIAL PURCHASING
# ---------------------------------------------------------
class RawMaterialPurchasing(Base):
    __tablename__ = "raw_material_purchasing"

    id = Column(Integer, primary_key=True, index=True)

    batch_number = Column(String(100))
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

# ---------------------------------------------------------
# DE-HEADING
# ---------------------------------------------------------
class DeHeading(Base):
    __tablename__ = "de_heading"

    id = Column(Integer, primary_key=True, index=True)

    batch_number = Column(String(100))
    hoso_count = Column(String(50))
    hoso_qty = Column(Float)
    hlso_qty = Column(Float)
    yield_percent = Column(Float)

    contractor = Column(String(255))
    rate_per_kg = Column(Float)
    amount = Column(Float)

    species = Column(String)
    company_id = Column(String(50))
    email = Column(String)

    date = Column(Date)
    time = Column(Time)


# ---------------------------------------------------------
# GRADING
# ---------------------------------------------------------
class Grading(Base):
    __tablename__ = "grading"

    id = Column(Integer, primary_key=True, index=True)

    batch_number = Column(String(100))
    variety_name = Column(String(100))
    graded_count = Column(String(50))
    quantity = Column(Float)

    species = Column(String(100))
    grade_name = Column(String(100))  # from lookup grade to hoso

    company_id = Column(String(50))
    email = Column(String)

    date = Column(Date)
    time = Column(Time)


# ---------------------------------------------------------
# PEELING
# ---------------------------------------------------------
class Peeling(Base):
    __tablename__ = "peeling"

    id = Column(Integer, primary_key=True, index=True)

    batch_number = Column(String(100))
    hlso_count = Column(String(50))
    hlso_qty = Column(Float)
    peeled_qty = Column(Float)
    yield_percent = Column(Float)

    variety_name = Column(String(100))
    contractor = Column(String(255))
    rate_per_kg = Column(Float)
    amount = Column(Float)

    species = Column(String(100))
    company_id = Column(String(50))
    email = Column(String)

    date = Column(Date)
    time = Column(Time)


# ---------------------------------------------------------
# SOAKING
# ---------------------------------------------------------
class Soaking(Base):
    __tablename__ = "soaking"

    id = Column(Integer, primary_key=True, index=True)

    batch_number = Column(String(100))
    variety_name = Column(String(100))
    in_count = Column(String(50))
    in_qty = Column(Float)

    chemical_name = Column(String(255))
    chemical_percent = Column(Float)
    chemical_qty = Column(Float)

    salt_percent = Column(Float)
    salt_qty = Column(Float)

    species = Column(String(100))
    company_id = Column(String(50))
    email = Column(String)

    date = Column(Date)
    time = Column(Time)


# ---------------------------------------------------------
# PRODUCTION
# ---------------------------------------------------------
class Production(Base):
    __tablename__ = "production"

    id = Column(Integer, primary_key=True, index=True)

    batch_number = Column(String(100))
    brand = Column(String(255))
    variety_name = Column(String(100))
    glaze = Column(String(50))
    freezer = Column(String(50))
    packing_style = Column(String(255))
    grade = Column(String(50))

    no_of_mc = Column(Integer)
    loose = Column(Integer)
    production_qty = Column(Float)

    product_name = Column(String)
    production_type = Column(String)
    total_weight = Column(Float)

    species = Column(String(100))
    company_id = Column(String(50))
    email = Column(String)

    date = Column(Date)
    time = Column(Time)
