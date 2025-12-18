# app/routers/summary_router.py

from fastapi import APIRouter, Request, Depends
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.processing import Production

router = APIRouter(
    prefix="/summary",
    tags=["SUMMARY"]
)

# 🔥 VERY IMPORTANT
templates = Jinja2Templates(directory="app/templates")

@router.get("/processing")
def processing_summary(request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")
    if not company_code:
        return templates.TemplateResponse(
            "login.html",
            {"request": request}
        )

    rows = (
        db.query(Production)
        .filter(Production.company_id == company_code)
        .order_by(
            Production.batch_number,
            Production.variety_name
        )
        .all()
    )

    return templates.TemplateResponse(
        "summary/processing_summary.html",   # ✅ EXACT PATH
        {
            "request": request,
            "rows": rows
        }
    )
