from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from datetime import datetime, date

from app.database import get_db
from app.database.models.general_stock import GeneralStock

router = APIRouter(prefix="/general_stock", tags=["General Stock"])


# ================== REPORT PAGE LOAD ================== #
@router.get("/report", response_class=HTMLResponse)
def general_stock_report(request: Request, db: Session = Depends(get_db)):

    records = db.query(GeneralStock).order_by(GeneralStock.id.desc()).all()

    dropdown_grn   = [x[0] for x in db.query(GeneralStock.grn_number).distinct().all() if x[0]]
    dropdown_items = [x[0] for x in db.query(GeneralStock.item_name).distinct().all() if x[0]]
    dropdown_unit  = [x[0] for x in db.query(GeneralStock.unit_name).distinct().all() if x[0]]

    return request.app.state.templates.TemplateResponse(
        "general_stock/general_stock_report.html",
        {
            "request": request,
            "records": records,
            "dropdown_grn": dropdown_grn,
            "dropdown_items": dropdown_items,
            "dropdown_unit": dropdown_unit
        }
    )
