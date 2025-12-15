# app/routers/dashboard_router.py

from fastapi import APIRouter

# Import individual dashboard modules here
from app.routers.dashboard.processing_dashboard import router as processing_dashboard_router
from app.routers.dashboard.inventory_dashboard import router as inventory_dashboard_router
from app.routers.dashboard.costing_dashboard import router as costing_dashboard_router


router = APIRouter(prefix="/dashboard", tags=["Dashboards"])

# Register each dashboard route into main router
router.include_router(processing_dashboard_router)
router.include_router(inventory_dashboard_router)
router.include_router(costing_dashboard_router)
