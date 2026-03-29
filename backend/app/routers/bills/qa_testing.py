from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date

from app.database import get_db
from app.database.models.bills import QATestingLog
from app.database.models.criteria import production_at
from app.main import templates

router = APIRouter(
    prefix="/qa",
    tags=["QA Testing"]
)

@router.get("/entry", response_class=HTMLResponse)
def qa_entry_page(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    comp_code = request.session.get("company_code")

    if not email:
        return RedirectResponse("/", status_code=303)

    # 1. Products Fetch (Safely)
    products_list = []
    try:
        # production_at table unte products vasthayi
        products_list = db.query(production_at).filter(production_at.company_id == comp_code).all()
    except Exception as e:
        db.rollback() # 👈 Very Important: Fail ayithe rollback cheyali
        print(f"Products Table Missing or Error: {e}")

    # 2. Labs Fetch (Safely)
    labs_list = []
    try:
        labs_list = db.execute(text("SELECT id, name FROM labs WHERE company_id = :c"), {"c": comp_code}).fetchall()
    except Exception as e:
        db.rollback() # 👈 Rollback to keep transaction alive
        print(f"Labs Table Missing: {e}")

    # 3. History (Ippudu transaction clean ga untundi kabatti idi work avthundi)
    try:
        qa_history = db.query(QATestingLog).order_by(QATestingLog.id.desc()).limit(50).all()
    except Exception as e:
        db.rollback()
        print(f"History Fetch Error: {e}")
        qa_history = []

    return templates.TemplateResponse(
        "bills/qa_testing_entry.html",
        {
            "request": request,
            "products": products_list,
            "labs": labs_list,
            "qa_history": qa_history,
            "comp_code": comp_code
        }
    )

@router.post("/save")
def save_qa_testing(
    request: Request,
    db: Session = Depends(get_db),
    test_date: date = Form(...),
    product_id: int = Form(...),
    batch_no: str = Form(...),
    lab_id: int = Form(...),
    report_ref: str = Form(...),
    test_cost: float = Form(...),
    grand_total: float = Form(...)
):
    try:
        # Create object matching your QATestingLog Model
        new_entry = QATestingLog(
            unit_id = request.session.get("unit_id", 0),
            batch_no = batch_no.upper(),
            lab_name = "External Lab", # Ikkada lab ID lookup logic pettocchu
            test_cost = grand_total,
            report_ref = report_ref.upper()
        )
        db.add(new_entry)
        db.commit()
        return RedirectResponse(url="/api/qa/entry", status_code=303)
    except Exception as e:
        db.rollback() # 👈 Database block avvakunda rollback
        print(f"QA Save Error: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)