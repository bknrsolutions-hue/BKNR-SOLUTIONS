# app/routers/__init__.py

from fastapi import APIRouter

# ✅ Correct relative imports
from .menu import router as menu
from .auth import router as auth
from .admin import router as admin_router
from .criteria_router import router as criteria_router
from .dashboard_router import router as dashboard_router
from .processing_router import router as processing_router
from .inventory import router as inventory_router
from .bills import router as bills_router 
from .general_stock.general_stock_entry import router as general_stock_entry_router

router = APIRouter()

# Aggregating all routers
router.include_router(menu)
router.include_router(auth)
router.include_router(admin_router)
router.include_router(criteria_router)
router.include_router(dashboard_router)
router.include_router(processing_router) # Idhi /processing/ tho start avthundhi
router.include_router(inventory_router)

# 🔥 IKADA PREFIX ADD CHEYANDI
# Deeni valla bills_router lo unna anni routes ki mundu /api vasthundhi
router.include_router(bills_router, prefix="/api") 

router.include_router(general_stock_entry_router, prefix="/general_stock", tags=["General Stock"])