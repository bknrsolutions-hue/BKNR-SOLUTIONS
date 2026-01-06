from fastapi import APIRouter

from app.routers.criteria.brands import router as brands_router
from app.routers.criteria.species import router as species_router
from app.routers.criteria.suppliers import router as suppliers_router
from app.routers.criteria.varieties import router as varieties_router
from app.routers.criteria.packing_styles import router as packing_styles_router
from app.routers.criteria.vehicle_numbers import router as vehicle_numbers_router
from app.routers.criteria.grades import router as grades_router
from app.routers.criteria.glazes import router as glazes_router
from app.routers.criteria.contractors import router as contractors_router
from app.routers.criteria.peeling_rates import router as peeling_rates_router
from app.routers.criteria.purchasing_locations import router as purchasing_locations_router
from app.routers.criteria.chemicals import router as chemicals_router
from app.routers.criteria.buyers import router as buyers_router
from app.routers.criteria.buyer_agents import router as buyer_agents_router
from app.routers.criteria.countries import router as countries_router
from app.routers.criteria.freezers import router as freezers_router
from app.routers.criteria.production_types import router as production_types_router
from app.routers.criteria.coldstore_locations import router as coldstore_locations_router
from app.routers.criteria.grade_to_hoso import router as grade_to_hoso_router
from app.routers.criteria.production_at import router as production_at_router
from app.routers.criteria.peeling_at import router as peeling_at_router
from app.routers.criteria.purposes import router as purposes_router
from app.routers.criteria.production_for import router as production_for_router
# ⭐ NEW IMPORT – THIS WAS MISSING
from app.routers.criteria.hoso_hlso import router as hoso_hlso_router


router = APIRouter(prefix="/criteria", tags=["Criteria"])

router.include_router(brands_router)
router.include_router(species_router)
router.include_router(suppliers_router)
router.include_router(varieties_router)
router.include_router(packing_styles_router)
router.include_router(vehicle_numbers_router)
router.include_router(grades_router)
router.include_router(glazes_router)
router.include_router(contractors_router)
router.include_router(peeling_rates_router)
router.include_router(purchasing_locations_router)
router.include_router(chemicals_router)
router.include_router(buyers_router)
router.include_router(buyer_agents_router)
router.include_router(countries_router)
router.include_router(freezers_router)
router.include_router(production_types_router)
router.include_router(coldstore_locations_router)
router.include_router(grade_to_hoso_router)
router.include_router(production_at_router)
router.include_router(peeling_at_router)
router.include_router(purposes_router)
router.include_router(production_for_router)
# ⭐ ADD THIS — FIXES YOUR 404 PROBLEM
router.include_router(hoso_hlso_router)
