from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.database.models.general_stock import GeneralStock

# రౌటర్ డెఫినిషన్
router = APIRouter(prefix="/general_stock", tags=["General Stock"])

# ============================================================
# GENERAL STOCK REPORT – FULL ROUTER (FIXED)
# ============================================================

@router.get("/report", response_class=HTMLResponse)
def general_stock_report(request: Request, db: Session = Depends(get_db)):
    
    # 🔐 1. SESSION & SECURITY CHECK
    # సెషన్ లో ఇమెయిల్ లేదా కంపెనీ కోడ్ లేకపోతే లాగిన్ కి రిడైరెక్ట్ చేస్తుంది
    email = request.session.get("email")
    comp_code = request.session.get("company_code")

    if not email or not comp_code:
        return RedirectResponse("/", status_code=302)

    # 📊 2. FETCH DATA (FILTERED BY COMPANY)
    # కేవలం లాగిన్ అయిన కంపెనీ డేటా మాత్రమే కనిపిస్తుంది
    records = (
        db.query(GeneralStock)
        .filter(GeneralStock.company_id == comp_code)
        .order_by(GeneralStock.id.desc())
        .all()
    )

    # 🔍 3. DROPDOWN LOGIC (FOR SEARCHABLE COLUMNS)
    # డ్రాప్‌డౌన్లలో డూప్లికేట్స్ లేకుండా డేటా ఫిల్టర్ చేస్తుంది
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

    # 🚀 4. TEMPLATE RESPONSE (FIXED FOR FASTAPI 0.110+ / STARLETTE)
    # ఇక్కడ 'request' ని విడిగా పంపడం వల్ల 'unhashable type: dict' ఎర్రర్ రాదు.
    return request.app.state.templates.TemplateResponse(
        request=request,  # తప్పనిసరిగా ఉండాలి
        name="general_stock/general_stock_report.html",
        context={
            "request": request,  # టెంప్లేట్ లోపల సెషన్ డేటా కోసం
            "records": records,
            "dropdown_grn": dropdown_grn,
            "dropdown_items": dropdown_items,
            "dropdown_unit": dropdown_unit
        }
    )

# ============================================================
# NOTE: ఇతర ఫంక్షన్లు (Export Excel/PDF) కావాలంటే ఇక్కడ యాడ్ చేసుకోవచ్చు
# ============================================================