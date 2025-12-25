from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Date,
    UniqueConstraint
)
from app.database import Base


# COMMON COLUMNS
class metacolumns:
    date = Column(String(50))
    time = Column(String(50))
    email = Column(String(255))
    company_id = Column(String(50))  # always company_code value like BKNR9879


# --------------------------------------------------------
# BRAND MASTER
# --------------------------------------------------------
class brands(Base, metacolumns):
    __tablename__ = "brands"
    id = Column(Integer, primary_key=True)
    brand_name = Column(String(255), nullable=False, index=True)

    __table_args__ = (
        UniqueConstraint("company_id", "brand_name", name="uix_company_brand"),
    )


# PURPOSES MASTER
class purposes(Base, metacolumns):
    __tablename__ = "purposes"

    id = Column(Integer, primary_key=True)
    purpose_name = Column(String(255), nullable=False, index=True)

    # company_id is coming from metacolumns (inherited)
    # so no need to re-declare it here

    __table_args__ = (
        UniqueConstraint(
            "company_id", 
            "purpose_name", 
            name="uix_company_purpose"
        ),
    )


# PRODUCTION AT MASTER
class production_at(Base, metacolumns):
    __tablename__ = "production_at"
    id = Column(Integer, primary_key=True)
    production_at = Column(String(255), nullable=False, index=True)

    __table_args__ = (
        UniqueConstraint("company_id", "production_at", name="uix_company_prod_at"),
    )


# GLAZES
class glazes(Base, metacolumns):
    __tablename__ = "glazes"
    id = Column(Integer, primary_key=True)
    glaze_name = Column(String(255), nullable=False, index=True)

    __table_args__ = (
        UniqueConstraint("company_id", "glaze_name", name="uix_company_glaze"),
    )


# GRADES
class grades(Base, metacolumns):
    __tablename__ = "grades"
    id = Column(Integer, primary_key=True)
    grade_name = Column(String(255), nullable=False, index=True)

    __table_args__ = (
        UniqueConstraint("company_id", "grade_name", name="uix_company_grade"),
    )


# VARIETIES
class varieties(Base, metacolumns):
    __tablename__ = "varieties"
    id = Column(Integer, primary_key=True)
    variety_name = Column(String(255), nullable=False, index=True)
    peeling_yield = Column(String(50))
    soaking_yield = Column(String(50))
    hoso_to_finished_yield = Column(String(50))

    __table_args__ = (
        UniqueConstraint("company_id", "variety_name", name="uix_company_variety"),
    )


# COUNTRIES
class countries(Base, metacolumns):
    __tablename__ = "countries"
    id = Column(Integer, primary_key=True)
    country_name = Column(String(255), nullable=False, index=True)
    production_cost_per_kg = Column(String(50))

    __table_args__ = (
        UniqueConstraint("company_id", "country_name", name="uix_company_country"),
    )


# BUYERS
class buyers(Base, metacolumns):
    __tablename__ = "buyers"
    id = Column(Integer, primary_key=True)
    buyer_name = Column(String(255), nullable=False, index=True)

    __table_args__ = (
        UniqueConstraint("company_id", "buyer_name", name="uix_company_buyer"),
    )


# BUYER AGENTS
class buyer_agents(Base, metacolumns):
    __tablename__ = "buyer_agents"
    id = Column(Integer, primary_key=True)
    agent_name = Column(String(255), nullable=False, index=True)

    __table_args__ = (
        UniqueConstraint("company_id", "agent_name", name="uix_company_agent"),
    )


# PACKING STYLES
class packing_styles(Base, metacolumns):
    __tablename__ = "packing_styles"
    id = Column(Integer, primary_key=True)
    packing_style = Column(String(255), nullable=False, index=True)
    mc_weight = Column(Float)
    slab_weight = Column(Float)

    __table_args__ = (
        UniqueConstraint("company_id", "packing_style", name="uix_company_packing"),
    )


# PRODUCTION TYPES
class production_types(Base, metacolumns):
    __tablename__ = "production_types"
    id = Column(Integer, primary_key=True)
    production_type = Column(String(255), nullable=False)
    glaze_name = Column(String(255))
    freezer_name = Column(String(255))
    production_charge_per_kg = Column(Float)

    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "production_type",
            "glaze_name",
            "freezer_name",
            name="uix_company_prodtype"
        ),
    )


# CHEMICALS
class chemicals(Base, metacolumns):
    __tablename__ = "chemicals"
    id = Column(Integer, primary_key=True)
    chemical_name = Column(String(255), nullable=False, index=True)

    __table_args__ = (
        UniqueConstraint("company_id", "chemical_name", name="uix_company_chemical"),
    )

# ---------------------------------------------------------
# CONTRACTORS
# ---------------------------------------------------------
class contractors(Base, metacolumns):
    __tablename__ = "contractors"

    id = Column(Integer, primary_key=True, index=True)

    # ================= BASIC DETAILS =================
    contractor_name = Column(String(255), nullable=False, index=True)
    phone = Column(String(50))
    contractor_email = Column(String(255))
    address = Column(String(255))

    # ================= GST DETAILS =================
    gst_number = Column(String(50))
    gst_percent = Column(Float)            # 5 / 12 / 18
    gst_applicable_from = Column(Date)     # date picker

    # ================= BANK DETAILS =================
    bank_name = Column(String(100))
    account_no = Column(String(100))
    ifsc = Column(String(20))

    # ================= UNIQUE =================
    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "contractor_name",
            name="uix_company_contractor"
        ),
    )

# SUPPLIERS
class suppliers(Base, metacolumns):
    __tablename__ = "suppliers"
    id = Column(Integer, primary_key=True)
    supplier_name = Column(String(255), nullable=False, index=True)
    supplier_email = Column(String(255))
    phone = Column(String(50))
    address = Column(String(255))

    __table_args__ = (
        UniqueConstraint("company_id", "supplier_name", name="uix_company_supplier"),
    )

#PEELING RATES
from sqlalchemy import Date, Time

class peeling_rates(Base, metacolumns):
    __tablename__ = "peeling_rates"

    id = Column(Integer, primary_key=True)

    species = Column(String(255))
    variety_name = Column(String(255))
    hlso_count = Column(String(50))
    contractor_name = Column(String(255))
    rate = Column(Float)

    effective_from = Column(Date)
    status = Column(String(50), default="Active")

    # 🔥 OVERRIDE METACOLUMNS
    date = Column(Date)
    time = Column(Time)


# SPECIES
class species(Base, metacolumns):
    __tablename__ = "species"
    id = Column(Integer, primary_key=True)
    species_name = Column(String(255), nullable=False, index=True)

    __table_args__ = (
        UniqueConstraint("company_id", "species_name", name="uix_company_species"),
    )


# PURCHASING LOCATIONS
class purchasing_locations(Base, metacolumns):
    __tablename__ = "purchasing_locations"
    id = Column(Integer, primary_key=True)
    location_name = Column(String(255), nullable=False, index=True)

    __table_args__ = (
        UniqueConstraint("company_id", "location_name", name="uix_company_location"),
    )


# VEHICLE NUMBERS MASTER
class vehicle_numbers(Base, metacolumns):
    __tablename__ = "vehicle_numbers"

    id = Column(Integer, primary_key=True)
    vehicle_number = Column(String(100), nullable=False)

    __table_args__ = (
        UniqueConstraint("company_id", "vehicle_number", name="uix_company_vehicle"),
    )



# COLDSTORE LOCATIONS
class coldstore_locations(Base, metacolumns):
    __tablename__ = "coldstore_locations"
    id = Column(Integer, primary_key=True)
    coldstore_location = Column(String(255), nullable=False, index=True)

    __table_args__ = (
        UniqueConstraint("company_id", "coldstore_location", name="uix_company_cold"),
    )


# FREEZERS
class freezers(Base, metacolumns):
    __tablename__ = "freezers"
    id = Column(Integer, primary_key=True)
    freezer_name = Column(String(255), nullable=False, index=True)
    capacity = Column(String(50))
    location = Column(String(255))

    __table_args__ = (
        UniqueConstraint("company_id", "freezer_name", name="uix_company_freezer"),
    )


# ---------------------------------------------------------
# GRADE + VARIETY + GLAZE → HOSO / HLSO MAP
# ---------------------------------------------------------
from sqlalchemy import Column, Integer, String, Float, UniqueConstraint
from app.database import Base

class grade_to_hoso(Base):
    __tablename__ = "grade_to_hoso"

    id = Column(Integer, primary_key=True)

    # COMBINATION
    species = Column(String(100), nullable=False)
    grade_name = Column(String(50), nullable=False)      # 16/20, 21/25, BKN, DC
    variety_name = Column(String(100), nullable=False)
    glaze_name = Column(String(50), nullable=False)

    # CALCULATED
    hlso_count = Column(Integer)
    hoso_count = Column(Integer)
    nw_grade = Column(String(50))

    email = Column(String(255))
    company_id = Column(String(50))

    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "species",
            "grade_name",
            "variety_name",
            "glaze_name",
            name="uix_grade_variety_glaze_species"
        ),
    )


# ---------------------------------------------------------
# HOSO → HLSO YIELDS MODEL
# ---------------------------------------------------------





class HOSO_HLSO_Yields(Base):
    __tablename__ = "hoso_hlso_yields"

    id = Column(Integer, primary_key=True, index=True)

    species = Column(String(100), nullable=False)         # Species name
    hoso_count = Column(Integer, nullable=False)          # HOSO count number
    hlso_yield_pct = Column(Float, nullable=False)        # % yield

    date = Column(String(20))                             # Auto date
    time = Column(String(20))                             # Auto time
    email = Column(String(200))                           # Created/Updated by

    company_id = Column(String(50), index=True)


    # PEELING AT MASTER
class peeling_at(Base, metacolumns):
    __tablename__ = "peeling_at"
    id = Column(Integer, primary_key=True)
    peeling_at = Column(String(255), nullable=False, index=True)

    __table_args__ = (
        UniqueConstraint("company_id", "peeling_at", name="uix_company_peeling_at"),
    )
