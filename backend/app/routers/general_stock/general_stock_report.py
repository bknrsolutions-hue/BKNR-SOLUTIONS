# ============================================================
# GENERAL STOCK REPORT ROUTER (BKNR ERP) - FULL CODE
# ============================================================

from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime, date

from app.database import get_db
from app.database.models.general_stock import GeneralStock

router = APIRouter(
    prefix="/general_stock", 
    tags=["GENERAL STOCK"]
)

templates = Jinja2Templates(directory="app/templates")

# ================== REPORT PAGE LOAD ================== #
@router.get("/report", response_class=HTMLResponse)
def general_stock_report(request: Request, db: Session = Depends(get_db)):
    # 🔐 SESSION SECURITY CHECK
    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    # Fetching all records for this company, ordered by latest first
    records = db.query(GeneralStock).filter(
        GeneralStock.company_id == company_id
    ).order_by(GeneralStock.id.desc()).all()

    # Generating lookup lists for searchable dropdowns (Strictly by Company)
    dropdown_grn   = [x[0] for x in db.query(GeneralStock.grn_number).filter(GeneralStock.company_id == company_id).distinct().all() if x[0]]
    dropdown_items = [x[0] for x in db.query(GeneralStock.item_name).filter(GeneralStock.company_id == company_id).distinct().all() if x[0]]
    dropdown_unit  = [x[0] for x in db.query(GeneralStock.unit_name).filter(GeneralStock.company_id == company_id).distinct().all() if x[0]]

    return templates.TemplateResponse(
        request,
        "general_stock/general_stock_report.html",
        {
            "records": records,
            "dropdown_grn": dropdown_grn,
            "dropdown_items": dropdown_items,
            "dropdown_unit": dropdown_unit
        }
    )