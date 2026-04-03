# app/routers/inventory/general_reports.py

from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import desc
import logging

from app.database import get_db
from app.database.models.general_stock import GeneralStock

router = APIRouter(
    prefix="/general_stock", 
    tags=["General Stock Reports"]
)

templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)

# ==================================================
# 📊 GENERAL STOCK REPORT (GET)
# ==================================================
@router.get("/report", response_class=HTMLResponse)
def general_stock_report(request: Request, db: Session = Depends(get_db)):
    # 1. Session Security Check
    email = request.session.get("email")
    company_id = request.session.get("company_code")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    try:
        # 2. Fetch Records (Only for the logged-in company)
        records = (
            db.query(GeneralStock)
            .filter(GeneralStock.company_id == company_id)
            .order_by(desc(GeneralStock.id))
            .all()
        )

        # 3. Searchable Dropdown Masters (Company-wise filtering)
        # We need these for the filters in the report UI
        dropdown_grn = [
            x[0] for x in db.query(GeneralStock.grn_number)
            .filter(GeneralStock.company_id == company_id)
            .distinct().all() if x[0]
        ]
        
        dropdown_items = [
            x[0] for x in db.query(GeneralStock.item_name)
            .filter(GeneralStock.company_id == company_id)
            .distinct().all() if x[0]
        ]
        
        dropdown_unit = [
            x[0] for x in db.query(GeneralStock.unit_name)
            .filter(GeneralStock.company_id == company_id)
            .distinct().all() if x[0]
        ]

        # 4. Final Response
        return templates.TemplateResponse(
            request=request,
            name="general_stock/general_stock_report.html",
            context={
                "records": records,
                "dropdown_grn": sorted(dropdown_grn),
                "dropdown_items": sorted(dropdown_items),
                "dropdown_unit": sorted(dropdown_unit),
                "email": email,
                "company_id": company_id
            }
        )

    except Exception as e:
        logger.error(f"General Stock Report Error: {e}")
        # Return empty lists or redirect to a safe page on error
        return templates.TemplateResponse(
            request=request,
            name="general_stock/general_stock_report.html",
            context={
                "records": [],
                "dropdown_grn": [],
                "dropdown_items": [],
                "dropdown_unit": [],
                "error": "Failed to load report data"
            }
        )