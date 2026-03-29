from fastapi import APIRouter

from .electricity import router as electricity_router
from .diesel import router as diesel_router
from .purchase import router as purchase_router
from .container import router as container_router
from .qa_testing import router as qa_router
from .expenses import router as expenses_router

router = APIRouter()

router.include_router(electricity_router)
router.include_router(diesel_router)
router.include_router(purchase_router)
router.include_router(container_router)
router.include_router(qa_router)
router.include_router(expenses_router)
