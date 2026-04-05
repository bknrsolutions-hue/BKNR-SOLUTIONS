from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.database.models.general_stock import GeneralStock

router = APIRouter(prefix="/general_stock", tags=["General Stock"])


# ================== REPORT PAGE LOAD ================== #
@router.get("/report", response_class=HTMLResponse)
def general_stock_report(request: Request, db: Session = Depends(get_db)):
    
    # 🔐 Session Check
    email = request.session.get("email")
    comp_code = request.session.get("company_code")

    if not email or not comp_code:
        return RedirectResponse("/", status_code=302)

    # 📊 Fetch records for this specific company only
    records = (
        db.query(GeneralStock)
        .filter(GeneralStock.company_id == comp_code)
        .order_by(GeneralStock.id.desc())
        .all()
    )

    # 🔍 Dropdown logic (filtered by company)
    dropdown_grn = [
        x[0] for x in db.query(GeneralStock.grn_number)
        .filter(GeneralStock.company_id == comp_code)
        .distinct().all() if x[0]
    ]
    dropdown_items = [
        x[0] for x in db.query(GeneralStock.item_name)
        .filter(GeneralStock.company_id == comp_code)
        .distinct().all() if x[0]
    ]
    dropdown_unit = [
        x[0] for x in db.query(GeneralStock.unit_name)
        .filter(GeneralStock.company_id == comp_code)
        .distinct().all() if x[0]
    ]

    # ✅ FIXED TEMPLATE RESPONSE
    return request.app.state.templates.TemplateResponse(
        request=request,  # Request explicitly passed
        name="general_stock/general_stock_report.html",
        context={
            "records": records,
            "dropdown_grn": dropdown_grn,
            "dropdown_items": dropdown_items,
            "dropdown_unit": dropdown_unit
        }
    )