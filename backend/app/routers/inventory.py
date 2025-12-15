from fastapi import APIRouter

# 🔥 IMPORT ROUTERS
from app.routers.inventory_management.stock_entry import router as stock_entry_router
from app.routers.inventory_management.inventory_report import router as inventory_report_router  # <-- MUST ADD

# PARENT GROUP
router = APIRouter(prefix="/inventory", tags=["Inventory"])

# ===================== REGISTER ROUTES =====================
router.include_router(stock_entry_router)
router.include_router(inventory_report_router)  # <-- This enables /inventory/inventory_report 👍
