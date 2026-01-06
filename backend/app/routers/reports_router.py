from fastapi import APIRouter
from fastapi.responses import RedirectResponse

# -------- IMPORT ALL REPORT ROUTERS --------
from app.routers.reports.raw_material_purchasing_report import router as rmp_router
from app.routers.reports.gate_entry_report import router as gate_entry_router
from app.routers.reports.de_heading_report import router as de_heading_router
from app.routers.reports.grading_report import router as grading_router
from app.routers.reports.peeling_report import router as peeling_router
from app.routers.reports.soaking_report import router as soaking_router
from app.routers.reports.production_report import router as production_router
from app.routers.reports.floor_balance_report import router as floor_balance_router
from app.routers.reports.storage_cost_report import router as storage_cost_router

# 🔥 PENDING ORDERS REPORT
from app.routers.reports.pending_orders_report import router as pending_orders_router


# -------- MASTER REPORTS ROUTER --------
router = APIRouter(
    prefix="/reports",
    tags=["REPORTS"]
)

# -------- INCLUDE ROUTERS --------
router.include_router(gate_entry_router)
router.include_router(rmp_router)
router.include_router(de_heading_router)
router.include_router(grading_router)
router.include_router(peeling_router)
router.include_router(soaking_router)
router.include_router(production_router)
router.include_router(floor_balance_router)
router.include_router(storage_cost_router)

# 🔥 MOST IMPORTANT
router.include_router(pending_orders_router)


# -------- ALIAS (BACKWARD COMPATIBILITY) --------
@router.get("/soaking_report", include_in_schema=False)
def soaking_report_alias():
    return RedirectResponse("/reports/soaking", status_code=302)
