from fastapi import APIRouter

# 🔥 IMPORT ROUTERS
from app.routers.inventory_management.stock_entry import router as stock_entry_router
from app.routers.inventory_management.stock_report import router as stock_report_router

# PARENT GROUP
router = APIRouter(prefix="/inventory", tags=["Inventory"])

# ===================== REGISTER ROUTES =====================
router.include_router(stock_entry_router)
router.include_router(stock_report_router)
