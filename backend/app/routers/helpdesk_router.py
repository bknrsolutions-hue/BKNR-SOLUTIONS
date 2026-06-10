from fastapi import APIRouter

from .helpdesk.admin_helpdesk import router as admin_helpdesk_router
from .helpdesk.user_helpdesk import router as user_helpdesk_router
from .helpdesk.admin_dashboard import router as admin_dashboard_router
router = APIRouter()

router.include_router(admin_helpdesk_router)
router.include_router(user_helpdesk_router)
router.include_router(admin_dashboard_router)