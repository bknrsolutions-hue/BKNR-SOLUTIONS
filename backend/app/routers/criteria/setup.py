from fastapi import APIRouter, Request, Depends
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.setup_service import SetupService

router = APIRouter()

@router.get("/setup/next")
def setup_next(
    request: Request,
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")

    next_page = SetupService.get_next_master(
        db,
        company_code
    )

    return RedirectResponse(
        next_page,
        status_code=303
    )