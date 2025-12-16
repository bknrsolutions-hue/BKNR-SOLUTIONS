from fastapi import APIRouter

# ===================== IMPORT ROUTERS =====================
from .menu import router as menu
from .auth import router as auth
from .admin import router as admin_router
from .criteria_router import router as criteria_router
from .dashboard_router import router as dashboard_router
from .processing_router import router as processing_router
from .inventory import router as inventory_router

# ⭐ GENERAL STOCK
from .general_stock.general_stock_entry import router as general_stock_entry_router

# ❌ REPORTS TEMPORARILY DISABLED (WeasyPrint issue)
# from .reports_router import router as reports_router


# ===================== MAIN ROUTER AGGREGATOR =====================
router = APIRouter()

router.include_router(menu)
router.include_router(auth)
router.include_router(admin_router)
router.include_router(criteria_router)
router.include_router(dashboard_router)
router.include_router(processing_router)
router.include_router(inventory_router)

# ⭐ GENERAL STOCK
router.include_router(
    general_stock_entry_router,
    prefix="/general_stock",
    tags=["General Stock"]
)

# ❌ REPORTS NOT INCLUDED
# router.include_router(reports_router)
