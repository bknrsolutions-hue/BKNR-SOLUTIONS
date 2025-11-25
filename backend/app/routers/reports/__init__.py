from fastapi import APIRouter
from .gate_entry_report import router as gate_entry_router

router = APIRouter()

router.include_router(gate_entry_router)
