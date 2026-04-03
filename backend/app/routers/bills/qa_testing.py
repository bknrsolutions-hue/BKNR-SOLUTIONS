# app/routers/bills/qa_testing.py

from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import text, desc
from datetime import date
import logging

from app.database import get_db
from app.database.models.bills import QATestingLog
from app.database.models.criteria import production_at

router = APIRouter(
    prefix="/qa",
    tags=["QA Testing"]
)

templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)

# ==================================================
# 🧪 1. QA ENTRY PAGE
# ==================================================
@router.get("/entry", response_class=HTMLResponse)
def qa_entry_page(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    comp_code = request.session.get("company_code")

    if not email or not comp_code:
        return RedirectResponse("/", status_code=302)

    # 1. Products Fetch (Safely)
    products_list = []
    try:
        products_list = db.query(production_at).filter(production_at.company_id == comp_code).all()
    except Exception as e:
        db.rollback()
        logger.error(f"Products Table Error: {e}")

    # 2. Labs Fetch (Safely using Text query)
    labs_list = []
    try:
        labs_result = db.execute(
            text("SELECT id, name FROM labs WHERE company_id = :c"), 
            {"c": comp_code}
        ).fetchall()
        labs_list = [{"id": row[0], "name": row[1]} for row in labs_result]
    except Exception as e:
        db.rollback()
        logger.error(f"Labs Table Missing or Error: {e}")

    # 3. History (Company-wise safety filter needed)
    try:
        # Note: If QATestingLog has company_id, use it. 
        # Otherwise, join with production_at for security.
        qa_history = db.query(QATestingLog).join(
            production_at, QATestingLog.unit_id == production_at.id
        ).filter(
            production_at.company_id == comp_code
        ).order_by(desc(QATestingLog.id)).limit(50).all()
    except Exception as e:
        db.rollback()
        logger.error(f"History Fetch Error: {e}")
        qa_history = []

    # ✅ FIX: TemplateResponse arguments updated
    return templates.TemplateResponse(
        request=request,
        name="bills/qa_testing_entry.html",
        context={
            "products": products_list,
            "labs": labs_list,
            "qa_history": qa_history,
            "comp_code": comp_code,
            "email": email
        }
    )

# ==================================================
# 💾 2. SAVE QA TESTING RECORD
# ==================================================
@router.post("/save")
async def save_qa_testing(
    request: Request,
    test_date: date = Form(...),
    product_id: int = Form(...),
    batch_no: str = Form(...),
    lab_id: int = Form(...),
    report_ref: str = Form(...),
    test_cost: float = Form(...),
    grand_total: float = Form(...),
    db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")
    if not comp_code:
        return JSONResponse({"error": "Session Expired"}, status_code=401)

    try:
        # lookup lab name from labs table using lab_id
        lab_name = "External Lab"
        try:
            lab_row = db.execute(
                text("SELECT name FROM labs WHERE id = :l_id"), 
                {"l_id": lab_id}
            ).fetchone()
            if lab_row:
                lab_name = lab_row[0]
        except:
            db.rollback()

        # Create object matching QATestingLog Model
        new_entry = QATestingLog(
            unit_id = product_id, # Linking to the selected unit/product
            batch_no = batch_no.upper().strip(),
            lab_name = lab_name,
            test_cost = grand_total,
            report_ref = report_ref.upper().strip()
            # If your model has test_date, add it here: test_date=test_date
        )
        
        db.add(new_entry)
        db.commit()
        
        # Redirecting to QA entry page
        return RedirectResponse(url="/qa/entry", status_code=303)

    except Exception as e:
        db.rollback()
        logger.error(f"QA Save Error: {e}")
        return JSONResponse({"error": f"Database Error: {str(e)}"}, status_code=500)