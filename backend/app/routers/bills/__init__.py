from fastapi import APIRouter

from .electricity import router as electricity_router
from .diesel import router as diesel_router
from .purchase import router as purchase_router
from .container import router as container_router
from .qa_testing import router as qa_router
from .expenses import router as expenses_router
from .contractor_bills import router as contractor_bills_router
from .salaries import router as salaries_router
from .payment_logs import router as payment_logs_router
from .payable_bills import router as payable_bills_router

router = APIRouter()

router.include_router(electricity_router)
router.include_router(diesel_router)
router.include_router(purchase_router)
router.include_router(container_router)
router.include_router(qa_router)
router.include_router(expenses_router)
router.include_router(contractor_bills_router)
router.include_router(salaries_router)
router.include_router(payment_logs_router)
router.include_router(payable_bills_router)
