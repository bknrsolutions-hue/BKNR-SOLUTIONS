from .auth import router as auth
from .menu import router as menu
from .criteria_router import router as criteria_router
from .inventory import router as inventory
from .general_stock import router as general_stock
from .admin import router as admin
from .processing_router import router as processing_router

__all__ = [
    "auth",
    "menu",
    "criteria_router",
    "inventory",
    "general_stock",
    "admin",
    "processing_router",
]
