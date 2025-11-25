# app/routers/reports_router.py
from fastapi import APIRouter
from app.routers.reports.raw_material_purchasing_report import router as rmp_report_router
from app.routers.reports.gate_entry_report import router as gate_entry_report

router = APIRouter(prefix="/reports", tags=["Reports"])
router.include_router(gate_entry_report)
router.include_router(rmp_report_router)   # <-- this will expose /reports/raw_material_purchasing_report
