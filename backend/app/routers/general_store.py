from fastapi import APIRouter

from .general_stock_entry import router as general_stock_entry_router
from .general_stock_items import router as general_stock_items_router   # FIXED NAME

router = APIRouter(prefix="/general_stock", tags=["GENERAL STOCK"])

router.include_router(general_stock_entry_router)
router.include_router(general_stock_items_router)
