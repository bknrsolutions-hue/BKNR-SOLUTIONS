from app.database.models.criteria import *

SETUP_SEQUENCE = [
    (buyers, "/criteria/buyers"),
    (buyer_agents, "/criteria/buyer_agents"),
    (suppliers, "/criteria/suppliers"),
    (vendors, "/criteria/vendors"),
    (countries, "/criteria/countries"),
    (brands, "/criteria/brands"),

    (species, "/criteria/species"),
    (varieties, "/criteria/varieties"),
    (grades, "/criteria/grades"),
    (glazes, "/criteria/glazes"),
    (packing_styles, "/criteria/packing_styles"),
    (contractors, "/criteria/contractors"),
    (peeling_at, "/criteria/peeling_at"),
    (peeling_rates, "/criteria/peeling_rates"),
    (production_at, "/criteria/production_at"),
    (production_for, "/criteria/production_for"),
    (freezers, "/criteria/freezers"),
    (production_types, "/criteria/production_types"),
    (chemicals, "/criteria/chemicals"),
    (purposes, "/criteria/purposes"),
    (grade_to_hoso, "/criteria/grade_to_hoso"),
    (HOSO_HLSO_Yields, "/criteria/hoso_hlso"),

    (coldstore_locations, "/criteria/coldstore_locations"),
    (vehicle_numbers, "/criteria/vehicle_numbers"),
    (hsn_codes, "/criteria/hsn_codes"),
]

class SetupService:

    @staticmethod
    def is_completed(db, company_code):

        for model, _ in SETUP_SEQUENCE:

            count = db.query(model).filter(
                model.company_id == company_code
            ).count()

            if count == 0:
                return False

        return True

    @staticmethod
    def get_next_master(db, company_code):

        for model, url in SETUP_SEQUENCE:

            count = db.query(model).filter(
                model.company_id == company_code
            ).count()

            if count == 0:
                return url

        return "/home"