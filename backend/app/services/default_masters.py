"""
Default Masters Seed Service
=============================
New company register   function call .
Existing data  skip  (idempotent).
"""
from sqlalchemy.orm import Session
from app.database.models.criteria import (
    species as SpeciesModel,
    glazes as GlazesModel,
    grades as GradesModel,
    countries as CountriesModel,
    freezers as FreezersModel,
    packing_styles as PackingStylesModel,
    brands as BrandsModel,
)

# -------------------------------------------------------
# DB   exact unique values (clean deduplicated)
# -------------------------------------------------------

DEFAULT_SPECIES = [
    "Vannamei",
    "Black Tiger",
    "HGB",
    "HGBU",
]

DEFAULT_GLAZES = [
    "NWNC",
    "10%",
    "12%",
    "15%",
    "20%",
    "22%",
    "23%",
    "24%",
    "25%",
    "26%",
    "27%",
    "28%",
    "30%",
    "32%",
    "33%",
    "35%",
    "37%",
    "40%",
]

DEFAULT_GRADES = [
    "8/12",
    "11/15",
    "13/15",
    "16/20",
    "20/40",
    "21/25",
    "26/30",
    "31/35",
    "31/40",
    "40/60",
    "41/45",
    "41/50",
    "51/60",
    "60/80",
    "61/70",
    "71/90",
    "80/120",
    "91/110",
    "100/200",
    "111/130",
    "131/150",
    "200/300",
    "300/500",
    "BKN",
]

DEFAULT_COUNTRIES = [
    {"country_name": "USA",    "production_cost_per_kg": "140"},
    {"country_name": "EU",     "production_cost_per_kg": "110"},
    {"country_name": "CANADA", "production_cost_per_kg": "130"},
    {"country_name": "CHINA",  "production_cost_per_kg": "80"},
]

DEFAULT_FREEZERS = [
    "IQF",
    "BLOCK",
]

DEFAULT_PACKING_STYLES = [
    {"packing_style": "10X1 KG",  "mc_weight": 10.0},
    {"packing_style": "6X2 KG",   "mc_weight": 12.0},
    {"packing_style": "10X2 LBS", "mc_weight": 9.08},
]

# Brands — only one dummy row (user request)
DEFAULT_BRANDS = [
    "DUMMY",
]


# -------------------------------------------------------
# SEED FUNCTION
# -------------------------------------------------------
def seed_default_masters(db: Session, company_code: str, email: str = "system@bknr.com"):
    """
    Insert default master rows for a new company.
    Safe to call multiple times — skips if already exists (idempotent).
    """
    from datetime import datetime
    now_date = datetime.now().date()
    now_time = str(datetime.now().time().strftime('%H:%M:%S'))

    def already_exists(model, unique_field, value):
        return db.query(model).filter(
            model.company_id == company_code,
            getattr(model, unique_field) == value
        ).first() is not None

    changed = False

    # 1. Species
    for name in DEFAULT_SPECIES:
        if not already_exists(SpeciesModel, "species_name", name):
            db.add(SpeciesModel(
                species_name=name, company_id=company_code, email=email,
                date=now_date, time=now_time
            ))
            changed = True

    # 2. Glazes
    for name in DEFAULT_GLAZES:
        if not already_exists(GlazesModel, "glaze_name", name):
            db.add(GlazesModel(
                glaze_name=name, company_id=company_code, email=email,
                date=now_date, time=now_time
            ))
            changed = True

    # 3. Grades
    for name in DEFAULT_GRADES:
        if not already_exists(GradesModel, "grade_name", name):
            db.add(GradesModel(
                grade_name=name, company_id=company_code, email=email,
                date=now_date, time=now_time
            ))
            changed = True

    # 4. Countries
    for c in DEFAULT_COUNTRIES:
        if not already_exists(CountriesModel, "country_name", c["country_name"]):
            db.add(CountriesModel(
                country_name=c["country_name"],
                production_cost_per_kg=c["production_cost_per_kg"],
                company_id=company_code, email=email,
                date=now_date, time=now_time
            ))
            changed = True

    # 5. Freezers
    for name in DEFAULT_FREEZERS:
        if not already_exists(FreezersModel, "freezer_name", name):
            db.add(FreezersModel(
                freezer_name=name, company_id=company_code, email=email,
                date=now_date, time=now_time
            ))
            changed = True

    # 6. Packing Styles
    for ps in DEFAULT_PACKING_STYLES:
        if not already_exists(PackingStylesModel, "packing_style", ps["packing_style"]):
            db.add(PackingStylesModel(
                packing_style=ps["packing_style"],
                mc_weight=ps["mc_weight"],
                company_id=company_code, email=email,
                date=now_date, time=now_time
            ))
            changed = True

    # 7. Brands — only one "DUMMY" row
    for name in DEFAULT_BRANDS:
        if not already_exists(BrandsModel, "brand_name", name):
            db.add(BrandsModel(
                brand_name=name, company_id=company_code, email=email,
                date=now_date, time=now_time
            ))
            changed = True

    if changed:
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise
        print(f"✅ Default masters seeded for company: {company_code}")
    else:
        print(f"ℹ️  Default masters already exist for: {company_code} — skipped.")
