from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.database.models.general_stock import GeneralStock

# రౌటర్ డెఫినిషన్ - Prefix మరియు Tags సెట్ చేశాను
router = APIRouter(prefix="/general_stock", tags=["General Stock"])

# ============================================================
# GENERAL STOCK REPORT – FULL ROUTER (STABLE VERSION)
# ============================================================

@router.get("/report", response_class=HTMLResponse)
def general_stock_report(request: Request, db: Session = Depends(get_db)):
    
    # 🔐 1. SESSION & SECURITY CHECK
    # సెషన్ నుండి డేటా తీసుకోవడం
    user_email = request.session.get("email")
    comp_code = request.session.get("company_code")

    # లాగిన్ అవ్వకపోతే హోమ్ పేజీకి రిడైరెక్ట్
    if not user_email or not comp_code:
        return RedirectResponse("/", status_code=302)

    # 📊 2. FETCH DATA (MULTI-TENANT FILTERING)
    # కంపెనీ వైజ్ డేటా ఫిల్టర్ చేయడం (Company wise data filter cheyyali - Requirement fulfilled)
    records = (
        db.query(GeneralStock)
        .filter(GeneralStock.company_id == comp_code)
        .order_by(GeneralStock.id.desc())
        .all()
    )

    # 🔍 3. SEARCHABLE DROPDOWNS LOGIC
    # రిపోర్ట్ పేజీలో సెర్చ్ కాలమ్స్ కోసం డ్రాప్‌డౌన్ డేటా సిద్ధం చేయడం
    def get_distinct_list(column):
        return [
            x[0] for x in db.query(column)
            .filter(GeneralStock.company_id == comp_code)
            .distinct().all() if x[0]
        ]

    dropdown_grn   = get_distinct_list(GeneralStock.grn_number)
    dropdown_items = get_distinct_list(GeneralStock.item_name)
    dropdown_unit  = get_distinct_list(GeneralStock.unit_name)

    # 🚀 4. TEMPLATE RESPONSE (FIXED FOR PYTHON 3.13 / FASTAPI)
    # 'TypeError: unhashable type: dict' రాకుండా 'request=request' అని స్పష్టంగా ఇచ్చాను
    return request.app.state.templates.TemplateResponse(
        request=request, 
        name="general_stock/general_stock_report.html",
        context={
            "request": request,  # టెంప్లేట్ లోపల {{ request }} వాడుకోవడానికి
            "records": records,
            "dropdown_grn": dropdown_grn,
            "dropdown_items": dropdown_items,
            "dropdown_unit": dropdown_unit,
            "user_email": user_email,
            "comp_code": comp_code
        }
    )

# ============================================================
# FUTURE SCALABILITY: EXPORT OPTIONS (EXCEL / PDF)
# ============================================================
# @router.get("/report/export/excel")
# def export_report_excel(request: Request, db: Session = Depends(get_db)):
#     pass