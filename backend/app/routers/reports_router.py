from fastapi import APIRouter

# Correct Import
from app.routers.reports.raw_material_purchasing_report import router as rmp_router

from app.routers.reports.gate_entry_report import router as gate_entry_report
from app.routers.reports.de_heading_report import router as de_heading_report
from app.routers.reports.grading_report import router as grading_report_router
from app.routers.reports.peeling_report import router as peeling_report_router
from app.routers.reports.soaking_report import router as soaking_report_router
from app.routers.reports.production_report import router as production_report_router

router = APIRouter(prefix="/reports", tags=["Reports"])

router.include_router(gate_entry_report)
router.include_router(rmp_router)                   # ✔ FIXED
router.include_router(de_heading_report)
router.include_router(grading_report_router)
router.include_router(peeling_report_router)
router.include_router(soaking_report_router)
router.include_router(production_report_router)
