from sqlalchemy import (
    Column, Integer, String, Float, Date, Time, 
    UniqueConstraint, ForeignKey, DateTime
)
from datetime import date as date_type, datetime
from sqlalchemy.types import TypeDecorator
from app.database import Base


class ISODate(TypeDecorator):
    impl = Date
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value in (None, ""):
            return None
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date_type):
            return value
        return date_type.fromisoformat(str(value))

# =========================================================
# COMMON COLUMNS (META DATA)
# =========================================================
class metacolumns:
    date = Column(ISODate)
    time = Column(String(50))
    email = Column(String(255))
    company_id = Column(String(50), index=True)  # Example: BKNR9879



# --------------------------------------------------------
# MASTERS
# --------------------------------------------------------

class brands(Base, metacolumns):
    __tablename__ = "brands"
    id = Column(Integer, primary_key=True)
    brand_name = Column(String(255), nullable=False, index=True)
    __table_args__ = (UniqueConstraint("company_id", "brand_name", name="uix_company_brand"),)

class purposes(Base, metacolumns):
    __tablename__ = "purposes"
    id = Column(Integer, primary_key=True)
    purpose_name = Column(String(255), nullable=False, index=True)
    __table_args__ = (UniqueConstraint("company_id", "purpose_name", name="uix_company_purpose"),)

class production_at(Base, metacolumns):
    __tablename__ = "production_at"
    id = Column(Integer, primary_key=True)
    production_at = Column(String(255), nullable=False, index=True)
    meter_number = Column(String(100), nullable=True)
    unit_rate = Column(Float, nullable=True)
    __table_args__ = (UniqueConstraint("company_id", "production_at", name="uix_company_prod_at"),)

class production_for(Base, metacolumns):
    __tablename__ = "production_for"
    id = Column(Integer, primary_key=True, index=True)
    production_for = Column(String(255), nullable=False)
    apply_from = Column(Date, nullable=False)
    free_days = Column(Integer, nullable=False, default=0)
    freezer_name = Column(String(255), nullable=True)
    glaze_percent = Column(String(50), nullable=True)
    production_cost_per_kg = Column(Float, nullable=False, default=0)
    repacking_cost_per_kg = Column(Float, nullable=False, default=0)
    rate_per_mc_day = Column(Float, nullable=False, default=0)
    ice_rate_per_kg = Column(Float, nullable=False, default=0)
    grading_rate_per_kg = Column(Float, nullable=False, default=0)
    peeling_rate_per_kg = Column(Float, nullable=False, default=0)
    deheading_rate_per_kg = Column(Float, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="Active")
    __table_args__ = (UniqueConstraint("company_id", "production_for", "apply_from", "freezer_name", "glaze_percent", name="uix_company_production_for_costing"),)

class glazes(Base, metacolumns):
    __tablename__ = "glazes"
    id = Column(Integer, primary_key=True)
    glaze_name = Column(String(255), nullable=False, index=True)
    __table_args__ = (UniqueConstraint("company_id", "glaze_name", name="uix_company_glaze"),)

class grades(Base, metacolumns):
    __tablename__ = "grades"
    id = Column(Integer, primary_key=True)
    grade_name = Column(String(255), nullable=False, index=True)
    __table_args__ = (UniqueConstraint("company_id", "grade_name", name="uix_company_grade"),)

class varieties(Base, metacolumns):
    __tablename__ = "varieties"
    id = Column(Integer, primary_key=True)
    variety_name = Column(String(255), nullable=False, index=True)
    peeling_yield = Column(String(50))
    soaking_yield = Column(String(50))
    hoso_to_finished_yield = Column(String(50))
    __table_args__ = (UniqueConstraint("company_id", "variety_name", name="uix_company_variety"),)

class countries(Base, metacolumns):
    __tablename__ = "countries"
    id = Column(Integer, primary_key=True)
    country_name = Column(String(255), nullable=False, index=True)
    production_cost_per_kg = Column(String(50))
    __table_args__ = (UniqueConstraint("company_id", "country_name", name="uix_company_country"),)

class buyers(Base, metacolumns):
    __tablename__ = "buyers"
    id = Column(Integer, primary_key=True)
    buyer_name = Column(String(255), nullable=False, index=True)

    # --- Extended Accounting & Export Fields (Added) ---
    # EXPORT / DOMESTIC / BOTH
    buyer_type = Column(String(20), nullable=True, default='EXPORT')
    country = Column(String(100), nullable=True)                     # Country name
    currency_code = Column(String(5), nullable=True, default='USD')  # Default billing currency
    iec_code = Column(String(20), nullable=True)                     # Import Export Code
    credit_limit = Column(Float, default=0.0)                        # Warning threshold
    credit_insurance = Column(Integer, default=0)                    # 0=No, 1=ECGC covered
    payment_terms_days = Column(Integer, default=30)                 # Payment due days
    gst_number = Column(String(15), nullable=True)                   # For domestic buyers
    contact_person = Column(String(100), nullable=True)
    buyer_email = Column(String(100), nullable=True)                 # Auto invoice email

    # CRITICAL: Links buyer to Chart of Accounts for auto journal
    account_ledger_id = Column(Integer, nullable=True)               # FK → ledger_masters.id

    address = Column(String(255))
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("company_id", "buyer_name", name="uix_company_buyer"),)

class buyer_agents(Base, metacolumns):
    __tablename__ = "buyer_agents"
    id = Column(Integer, primary_key=True)
    agent_name = Column(String(255), nullable=False, index=True)
    phone = Column(String(50))
    address = Column(String(255))
    service_for = Column(String(150), default="Buyer Agent")
    agent_email = Column(String(255), nullable=True)
    
    # ఒరిజినల్ కాలమ్స్ ఇక్కడ యాడ్ చేసాను
    gst_number = Column(String(50))
    bank_name = Column(String(100))
    account_no = Column(String(100))
    ifsc = Column(String(20))
    created_at = Column(DateTime, default=datetime.utcnow)
    
    __table_args__ = (UniqueConstraint("company_id", "agent_name", name="uix_company_agent"),)

class packing_styles(Base, metacolumns):
    __tablename__ = "packing_styles"
    id = Column(Integer, primary_key=True)
    packing_style = Column(String(255), nullable=False, index=True)
    mc_weight = Column(Float); slab_weight = Column(Float)
    __table_args__ = (UniqueConstraint("company_id", "packing_style", name="uix_company_packing"),)

class production_types(Base, metacolumns):
    __tablename__ = "production_types"
    id = Column(Integer, primary_key=True)
    production_type = Column(String(255), nullable=False); glaze_name = Column(String(255))
    freezer_name = Column(String(255)); production_charge_per_kg = Column(Float)
    __table_args__ = (UniqueConstraint("company_id", "production_type", "glaze_name", "freezer_name", name="uix_company_prodtype"),)

class chemicals(Base, metacolumns):
    __tablename__ = "chemicals"
    id = Column(Integer, primary_key=True)
    chemical_name = Column(String(255), nullable=False, index=True)
    __table_args__ = (UniqueConstraint("company_id", "chemical_name", name="uix_company_chemical"),)

class contractors(Base, metacolumns):
    __tablename__ = "contractors"
    id = Column(Integer, primary_key=True, index=True)
    contractor_name = Column(String(255), nullable=False, index=True)
    phone = Column(String(50)); contractor_email = Column(String(255)); address = Column(String(255))
    gst_number = Column(String(50)); gst_percent = Column(Float); gst_applicable_from = Column(Date)
    bank_name = Column(String(100)); account_no = Column(String(100)); ifsc = Column(String(20))
    
    # ఒరిజినల్ కాలమ్స్ ఇక్కడ యాడ్ చేసాను
    payment_cycle = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    __table_args__ = (UniqueConstraint("company_id", "contractor_name", name="uix_company_contractor"),)

class suppliers(Base, metacolumns):
    __tablename__ = "suppliers"
    id = Column(Integer, primary_key=True, index=True)
    supplier_name = Column(String(255), nullable=False, index=True)
    supplier_email = Column(String(255))
    phone = Column(String(50))
    address = Column(String(255))

    # --- Extended Accounting & Compliance Fields (Added) ---
    # RAW_MATERIAL / PACKING_MATERIAL / TRANSPORT / CHA / COLD_STORAGE / UTILITIES / OTHER
    supplier_category = Column(String(30), nullable=True, default='RAW_MATERIAL')
    pan_number = Column(String(10), nullable=True)                   # TDS deduction
    msme_registration = Column(String(50), nullable=True)            # Priority payment tracking

    # CRITICAL: Links supplier to Chart of Accounts for auto journal
    account_ledger_id = Column(Integer, nullable=True)               # FK → ledger_masters.id

    # Existing columns
    gst_number = Column(String(50))
    bank_name = Column(String(150))
    account_no = Column(String(100))
    ifsc = Column(String(20))
    payment_cycle = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("company_id", "supplier_name", name="uix_company_supplier"),)

class peeling_rates(Base, metacolumns):
    __tablename__ = "peeling_rates"
    id = Column(Integer, primary_key=True)
    species = Column(String(255)); variety_name = Column(String(255)); hlso_count = Column(String(50))
    contractor_name = Column(String(255)); rate = Column(Float); effective_from = Column(Date)
    status = Column(String(50), default="Active"); date = Column(Date); time = Column(Time)

class species(Base, metacolumns):
    __tablename__ = "species"
    id = Column(Integer, primary_key=True)
    species_name = Column(String(255), nullable=False, index=True)
    __table_args__ = (UniqueConstraint("company_id", "species_name", name="uix_company_species"),)

class purchasing_locations(Base, metacolumns):
    __tablename__ = "purchasing_locations"
    id = Column(Integer, primary_key=True)
    location_name = Column(String(255), nullable=False, index=True)
    __table_args__ = (UniqueConstraint("company_id", "location_name", name="uix_company_location"),)

class vehicle_numbers(Base, metacolumns):
    __tablename__ = "vehicle_numbers"
    id = Column(Integer, primary_key=True)
    vehicle_number = Column(String(100), nullable=False)
    __table_args__ = (UniqueConstraint("company_id", "vehicle_number", name="uix_company_vehicle"),)

class coldstore_locations(Base, metacolumns):
    __tablename__ = "coldstore_locations"
    id = Column(Integer, primary_key=True)
    coldstore_location = Column(String(255), nullable=False, index=True)
    production_for = Column(String(255), nullable=True, index=True)
    production_at = Column(String(255), nullable=True, index=True)
    __table_args__ = (UniqueConstraint("company_id", "coldstore_location","production_at","production_for", name="uix_company_cold"),)

class freezers(Base, metacolumns):
    __tablename__ = "freezers"
    id = Column(Integer, primary_key=True)
    freezer_name = Column(String(255), nullable=False, index=True)
    capacity = Column(String(50)); location = Column(String(255))
    __table_args__ = (UniqueConstraint("company_id", "freezer_name", name="uix_company_freezer"),)

class grade_to_hoso(Base):
    __tablename__ = "grade_to_hoso"
    id = Column(Integer, primary_key=True)
    species = Column(String(100), nullable=False); grade_name = Column(String(50), nullable=False)
    variety_name = Column(String(100), nullable=False); glaze_name = Column(String(50), nullable=False)
    hlso_count = Column(Integer); hoso_count = Column(Integer); nw_grade = Column(String(50))
    email = Column(String(255)); company_id = Column(String(50))
    __table_args__ = (UniqueConstraint("company_id", "species", "grade_name", "variety_name", "glaze_name", name="uix_grade_variety_glaze_species"),)

class HOSO_HLSO_Yields(Base):
    __tablename__ = "hoso_hlso_yields"
    id = Column(Integer, primary_key=True, index=True)
    species = Column(String(100), nullable=False); hoso_count = Column(Integer, nullable=False)
    hlso_yield_pct = Column(Float, nullable=False); hlso_count = Column(Integer, nullable=False)
    date = Column(String(20)); time = Column(String(20)); email = Column(String(200))
    company_id = Column(String(50), index=True)

class peeling_at(Base, metacolumns):
    __tablename__ = "peeling_at"
    id = Column(Integer, primary_key=True)
    peeling_at = Column(String(255), nullable=False, index=True)
    __table_args__ = (UniqueConstraint("company_id", "peeling_at", name="uix_company_peeling_at"),)

class shipping_vendors(Base, metacolumns):
    __tablename__ = "shipping_vendors"
    id = Column(Integer, primary_key=True)
    vendor_name = Column(String(255), nullable=False, index=True)
    
    # ఒరిజినల్ కాలమ్స్ ఇక్కడ యాడ్ చేసాను
    gst_number = Column(String(50))
    address = Column(String(255))
    bank_name = Column(String(150))
    account_no = Column(String(100))
    ifsc = Column(String(20))
    payment_cycle = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    __table_args__ = (UniqueConstraint("company_id", "vendor_name", name="uix_company_shipping_vendor"),)

class vendors(Base):
    __tablename__ = "vendors"

    # =========================
    # PRIMARY KEY
    # =========================
    id = Column(Integer, primary_key=True, index=True)

    # =========================
    # BASIC DETAILS
    # =========================
    name = Column(String(150), nullable=False, index=True)
    email = Column(String(150))

    # What service vendor provides
    # Examples: Transport / Diesel / Ice / Packing / Misc
    service_for = Column(String(150))
    payment_cycle = Column(String(100), nullable=True)
    # =========================
    # GST & ADDRESS
    # =========================
    gst_number = Column(String(50))
    address = Column(String(255))

    # =========================
    # BANK DETAILS
    # =========================
    bank_name = Column(String(150))
    account_no = Column(String(100))
    ifsc = Column(String(20))

    # =========================
    # COMPANY META
    # =========================
    company_id = Column(String(50), index=True, nullable=False)

    # =========================
    # AUDIT / SYSTEM
    # =========================
    date = Column(String(20), nullable=True)             # HTML నుండి వచ్చే 'YYYY-MM-DD' డేట్ కోసం
    time = Column(String(20), nullable=True)             # HTML నుండి వచ్చే 'HH:MM:SS' టైమ్ కోసం
    created_by_email = Column(String(255), nullable=True) # లాగిన్ అయిన యూజర్ ఈమెయిల్ కోసం
    created_at = Column(DateTime, default=datetime.utcnow)
class hsn_codes(Base):
    __tablename__ = "hsn_codes"

    id = Column(Integer, primary_key=True, index=True)

    hsn_code = Column(String(20), nullable=False)
    description = Column(String(255), nullable=False)
    gst_percent = Column(Float, nullable=False)

    applicable_from = Column(Date)

    date = Column(String(20))
    time = Column(String(20))

    company_id = Column(String(50), index=True, nullable=False)
    email = Column(String(150))

    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "hsn_code",
            name="uix_company_hsn"
        ),
    )
