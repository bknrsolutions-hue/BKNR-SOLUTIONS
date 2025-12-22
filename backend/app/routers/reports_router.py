# =============================================
# 🔥 REPORTS MASTER ROUTER (FINAL - WORKING)
# =============================================

from fastapi import APIRouter
from fastapi.responses import RedirectResponse

from app.routers.reports.raw_material_purchasing_report import router as rmp_router
from app.routers.reports.gate_entry_report import router as gate_entry_router
from app.routers.reports.de_heading_report import router as de_heading_router
from app.routers.reports.grading_report import router as grading_router
from app.routers.reports.peeling_report import router as peeling_router
from app.routers.reports.soaking_report import router as soaking_router
from app.routers.reports.production_report import router as production_router
from app.routers.reports.floor_balance_report import router as floor_balance_router

router = APIRouter(
    prefix="/reports",
    tags=["REPORTS"]
)

# ---------------- NORMAL REPORT ROUTES ----------------
router.include_router(gate_entry_router)
router.include_router(rmp_router)
router.include_router(de_heading_router)
router.include_router(grading_router)
router.include_router(peeling_router)
router.include_router(soaking_router)      # /reports/soaking
router.include_router(production_router)
router.include_router(floor_balance_router)

# ---------------- 🔥 ALIAS FIX (MENU COMPATIBILITY) ----------------
@router.get("/soaking_report", include_in_schema=False)
def soaking_report_alias():
    """
    Backward compatibility for old menu URL
    /reports/soaking_report  -->  /reports/soaking
    """
    return RedirectResponse("/reports/soaking", status_code=302)
