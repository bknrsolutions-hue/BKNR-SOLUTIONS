from fastapi import APIRouter

# 🔥 IMPORT ROUTERS
from app.routers.inventory_management.stock_entry import router as stock_entry_router
from app.routers.inventory_management.stock_report import router as stock_report_router
from app.routers.inventory_management.sales_report import router as sales_report_router
from app.routers.inventory_management.cold_storage import router as cold_storage_router
from app.routers.inventory_management.cold_storage_holding import router as cold_storage_holding_router
from app.routers.inventory_management.cold_storage_holding_report import router as cold_storage_holding_report_router
# PARENT GROUP
router = APIRouter(prefix="/inventory", tags=["Inventory"])

# ===================== REGISTER ROUTES =====================
router.include_router(stock_entry_router)
router.include_router(stock_report_router)
router.include_router(sales_report_router)
router.include_router(cold_storage_router)
router.include_router(cold_storage_holding_router)
router.include_router(cold_storage_holding_report_router)