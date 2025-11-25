from sqlalchemy import (
    Column,
    Integer,
    String,
    Float,
    Date,
    UniqueConstraint
)
from app.database import Base


# --------------------------------------------------------
# COMMON MIXIN FOR ALL TABLES
# --------------------------------------------------------
class metacolumns:
    date = Column(String(50))
    time = Column(String(50))
    email = Column(String(255))
    company_id = Column(String(50))


# --------------------------------------------------------
# BRAND MASTER
# --------------------------------------------------------
class brands(Base, metacolumns):
    __tablename__ = "brands"

    id = Column(Integer, primary_key=True)
    brand_name = Column(String(255), nullable=False, unique=True, index=True)


# --------------------------------------------------------
# GLAZES
# --------------------------------------------------------
class glazes(Base, metacolumns):
    __tablename__ = "glazes"

    id = Column(Integer, primary_key=True)
    glaze_name = Column(String(255), nullable=False, unique=True, index=True)


# --------------------------------------------------------
# GRADES
# --------------------------------------------------------
class grades(Base, metacolumns):
    __tablename__ = "grades"

    id = Column(Integer, primary_key=True)
    grade_name = Column(String(255), nullable=False, unique=True, index=True)


# --------------------------------------------------------
# VARIETIES
# --------------------------------------------------------
class varieties(Base, metacolumns):
    __tablename__ = "varieties"

    id = Column(Integer, primary_key=True)

    # unique per company (not global)
    variety_name = Column(String(255), nullable=False, index=True)

    peeling_yield = Column(String(50))
    soaking_yield = Column(String(50))
    hoso_to_finished_yield = Column(String(50))

    __table_args__ = (
        UniqueConstraint("company_id", "variety_name", name="uix_company_variety"),
    )


# --------------------------------------------------------
# COUNTRIES
# --------------------------------------------------------
class countries(Base, metacolumns):
    __tablename__ = "countries"

    id = Column(Integer, primary_key=True)
    country_name = Column(String(255), nullable=False, unique=True, index=True)
    production_cost_per_kg = Column(String(50))


# --------------------------------------------------------
# BUYERS
# --------------------------------------------------------
class buyers(Base, metacolumns):
    __tablename__ = "buyers"

    id = Column(Integer, primary_key=True)
    buyer_name = Column(String(255), nullable=False, unique=True, index=True)


# --------------------------------------------------------
# BUYER AGENTS
# --------------------------------------------------------
class buyer_agents(Base, metacolumns):
    __tablename__ = "buyer_agents"

    id = Column(Integer, primary_key=True)
    agent_name = Column(String(255), nullable=False, unique=True, index=True)


# --------------------------------------------------------
# PACKING STYLES
# --------------------------------------------------------
class packing_styles(Base, metacolumns):
    __tablename__ = "packing_styles"

    id = Column(Integer, primary_key=True)
    packing_style = Column(String(255), nullable=False, unique=True, index=True)
    mc_weight = Column(Float)
    slab_weight = Column(Float)


# --------------------------------------------------------
# PRODUCTION TYPES
# --------------------------------------------------------
class production_types(Base, metacolumns):
    __tablename__ = "production_types"

    id = Column(Integer, primary_key=True)
    production_type = Column(String(255), nullable=False, index=True)
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

# --------------------------------------------------------
# CHEMICALS
# --------------------------------------------------------
class chemicals(Base, metacolumns):
    __tablename__ = "chemicals"

    id = Column(Integer, primary_key=True)
    chemical_name = Column(String(255), nullable=False, unique=True, index=True)


# --------------------------------------------------------
# CONTRACTORS
# --------------------------------------------------------
class contractors(Base, metacolumns):
    __tablename__ = "contractors"

    id = Column(Integer, primary_key=True)
    contractor_name = Column(String(255), unique=True, index=True)
    phone = Column(String(50))
    address = Column(String(255))


# --------------------------------------------------------
# SUPPLIERS
# --------------------------------------------------------
class suppliers(Base, metacolumns):
    __tablename__ = "suppliers"

    id = Column(Integer, primary_key=True)
    supplier_name = Column(String(255), unique=True, index=True)
    supplier_email = Column(String(255))
    phone = Column(String(50))
    address = Column(String(255))


# --------------------------------------------------------
# PEELING RATES
# --------------------------------------------------------
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


# --------------------------------------------------------
# SPECIES
# --------------------------------------------------------
class species(Base, metacolumns):
    __tablename__ = "species"

    id = Column(Integer, primary_key=True)
    species_name = Column(String(255), nullable=False, unique=True, index=True)


# --------------------------------------------------------
# PURCHASING LOCATIONS
# --------------------------------------------------------
class purchasing_locations(Base, metacolumns):
    __tablename__ = "purchasing_locations"

    id = Column(Integer, primary_key=True)
    location_name = Column(String(255), nullable=False, unique=True, index=True)


# --------------------------------------------------------
# VEHICLE NUMBERS
# --------------------------------------------------------
class vehicle_numbers(Base, metacolumns):
    __tablename__ = "vehicle_numbers"

    id = Column(Integer, primary_key=True)
    vehicle_number = Column(String(255), nullable=False, unique=True, index=True)


# --------------------------------------------------------
# COLDSTORE LOCATIONS
# --------------------------------------------------------
class coldstore_locations(Base, metacolumns):
    __tablename__ = "coldstore_locations"

    id = Column(Integer, primary_key=True)
    coldstore_location = Column(String(255), nullable=False, unique=True, index=True)


# --------------------------------------------------------
# FREEZERS
# --------------------------------------------------------
class freezers(Base, metacolumns):
    __tablename__ = "freezers"

    id = Column(Integer, primary_key=True)
    freezer_name = Column(String(255), nullable=False, unique=True, index=True)
    capacity = Column(String(50))
    location = Column(String(255))


# GRADE → HOSO COUNTS MAPPING
class grade_to_hoso(Base, metacolumns):
    __tablename__ = "grade_to_hoso"

    id = Column(Integer, primary_key=True)

    grade_name = Column(String(255), nullable=False, index=True)
    glaze_name = Column(String(100), nullable=False, index=True)
    variety_name = Column(String(100), nullable=False, index=True)

    species = Column(String(255))
    nw_grade = Column(String(100))

    hoso_count = Column(String(50))   # DB lo varchar(50)
    hlso_count = Column(Integer)      # DB lo integer

    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "grade_name",
            "glaze_name",
            "variety_name",
            name="uix_company_grade_glaze_variety"
        ),
    )