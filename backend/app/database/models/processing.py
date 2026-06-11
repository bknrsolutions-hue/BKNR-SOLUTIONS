from sqlalchemy import Column, Integer, String, Date, Time, Float
from app.database import Base


# ---------------------------------------------------------
# GATE ENTRY
# ---------------------------------------------------------
from sqlalchemy import Column, Integer, String, Float, Date, Time, UniqueConstraint
from app.database import Base

class GateEntry(Base):
    __tablename__ = "gate_entry"

    id = Column(Integer, primary_key=True, index=True)

    batch_number = Column(String(100))
    challan_number = Column(String)
    gate_pass_number = Column(String)
    receiving_center = Column(String)   # 👈 NEW COLUMN
    supplier_name = Column(String)
    purchasing_location = Column(String(255))
    vehicle_number = Column(String)

    no_of_material_boxes = Column(Float)
    no_of_empty_boxes = Column(Float)
    no_of_ice_boxes = Column(Float)

    species = Column(String(100))

    date = Column(Date)
    time = Column(Time)
    email = Column(String)
    company_id = Column(String(50))
    production_for = Column(String(255))

    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "gate_pass_number",
            "challan_number",
            name="uix_company_gatepass_challan"
        ),
    )

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
    hsn_code = Column(String(20))
    peeling_at = Column(String(255))
    production_for = Column(String(255))
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
    batch_number = Column(String(100))
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
    email = Column(String)
    company_id = Column(String(50))

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
    batch_number = Column(String(100))
    hoso_count = Column(String(50))
    variety_name = Column(String(100))
    graded_count = Column(String(50))
    quantity = Column(Float)
    

    email = Column(String)
    company_id = Column(String(50))


    


# ---------------------------------------------------------
# PEELING
# ---------------------------------------------------------
class Peeling(Base):
    __tablename__ = "peeling"

    id = Column(Integer, primary_key=True, index=True)
    peeling_at = Column(String(255))
    production_for = Column(String(255))
    species = Column(String(100))
    batch_number = Column(String(100))
    hlso_count = Column(String(50))
    hlso_qty = Column(Float)

    variety_name = Column(String(100))
    peeled_qty = Column(Float)

    yield_percent = Column(Float)
    target_yield_percent = Column(Float)
    contractor_name = Column(String(100))      # ← MISSING FIELD (Added Now)
    rate = Column(Float)
    amount = Column(Float)
 
    diff_qty = Column(Float)        
    diff_percent = Column(Float)
    date = Column(Date)
    time = Column(Time)

    # For multi-company access control
    email = Column(String(200))
    company_id = Column(String(50))



# ---------------------------------------------------------
# SOAKING
# ---------------------------------------------------------
class Soaking(Base):
    __tablename__ = "soaking"

    id = Column(Integer, primary_key=True, index=True)

    sintex_number = Column(String(100)) # కొత్తగా యాడ్ చేసిన కాలమ్
    batch_number = Column(String(100))
    variety_name = Column(String(100))
    in_count = Column(String(50))
    in_qty = Column(Float)

    chemical_name = Column(String(255))
    chemical_percent = Column(Float)
    chemical_qty = Column(Float)

    salt_percent = Column(Float)
    salt_qty = Column(Float)
    rejection_qty = Column(Float, default=0)
    rejection_for = Column(String(100)) # కొత్తగా యాడ్ చేసిన కాలమ్

    species = Column(String(100))
    company_id = Column(String(50))
    email = Column(String)

    date = Column(Date)
    time = Column(Time)
    production_at = Column(String(255))
    production_for = Column(String(255))
    status = Column(String, default="Pending")


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

    target_yield_percent = Column(Float)
    diff_qty = Column(Float)        
    diff_percent = Column(Float)

    company_id = Column(String(50))
    email = Column(String)



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
from app.database import Base  # నీ ప్రాజెక్ట్ Base మోడల్ ఇంపోర్ట్ పాత్ ఇక్కడ ఇవ్వు

class HlsoForGrading(Base):
    __tablename__ = "hlso_for_grading"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False)
    time = Column(Time, nullable=False)
    
    # Core Tracking Attributes
    batch_number = Column(String(100), index=True, nullable=False)
    production_for = Column(String(255), index=True, nullable=False) # ఏ కంపెనీ మెటీరియల్
    peeling_at = Column(String(255), nullable=False)                 # ఏ లొకేషన్ లో ఉంది
    species = Column(String(100), nullable=False)
    hoso_count = Column(String(50), nullable=False)                  # ఇన్‌పుట్ హ్యాండ్లింగ్ కౌంట్
    
    # Live Balance Columns
    total_hlso_qty = Column(Float, default=0.0)  # DeHeading నుండి వచ్చిన టోటల్ ఇన్‌పుట్ బరువు
    graded_qty = Column(Float, default=0.0)      # ఇప్పటివరకు గ్రేడింగ్ చేసిన నికర బరువు
    available_qty = Column(Float, default=0.0)   # నిల్వ ఉన్న కరెంట్ స్టాక్ (total_hlso_qty - graded_qty)
    
    # State Control Engine
    status = Column(String(50), default="Pending") # Pending / Completed (Done) గా మారినప్పుడు హైడ్ అవుతుంది
    email = Column(String(255))
    company_id = Column(String(50), index=True, nullable=False)    # మల్టీ-టెనెంట్ ఐడి
