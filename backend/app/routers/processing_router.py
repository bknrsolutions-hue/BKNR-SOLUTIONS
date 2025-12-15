# app/routers/processing_router.py

from fastapi import APIRouter

# ------------------ IMPORT ALL PROCESSING ROUTERS ------------------
from app.routers.processing.gate_entry import router as gate_entry_router
from app.routers.processing.raw_material_purchasing import router as raw_material_purchasing_router
from app.routers.processing.de_heading import router as de_heading_router
from app.routers.processing.grading import router as grading_router
from app.routers.processing.peeling import router as peeling_router
from app.routers.processing.soaking import router as soaking_router
from app.routers.processing.production import router as production_router

# ------------------ MAIN PROCESSING ROUTER ------------------
router = APIRouter(prefix="/processing", tags=["processing"])

# ------------------ INCLUDE ROUTERS (ORDER IMPORTANT) ------------------
router.include_router(gate_entry_router)
router.include_router(raw_material_purchasing_router)
router.include_router(de_heading_router)
router.include_router(grading_router)
router.include_router(peeling_router)
router.include_router(soaking_router)
router.include_router(production_router)

