from fastapi import APIRouter

from .general_stock_entry import router as general_stock_entry_router  
from .general_stock_items import router as general_stock_items_router  
from .general_stock_report import router as general_stock_report_router

router = APIRouter(prefix="/general_stock", tags=["GENERAL STOCK"])

router.include_router(general_stock_entry_router)
router.include_router(general_stock_items_router)
router.include_router(general_stock_report_router)