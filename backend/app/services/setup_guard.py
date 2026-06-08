# app/services/setup_guard.py
from fastapi.responses import RedirectResponse
from app.services.setup_service import SetupService

def setup_guard(request, db):

    company_code = request.session.get("company_code")

    if SetupService.is_completed(
        db,
        company_code
    ):
        return None

    next_page = SetupService.get_next_master(
        db,
        company_code
    )

    return RedirectResponse(
        next_page,
        status_code=303
    )