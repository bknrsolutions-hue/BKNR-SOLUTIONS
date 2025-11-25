from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.processing import Peeling, GateEntry
from app.database.models.criteria import grade_to_hoso, varieties, contractors, peeling_rates

router = APIRouter(tags=["PEELING"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE LOAD
# ---------------------------------------------------------
@router.get("/peeling")
def page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("user_email")
    company_id = request.session.get("company_id")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    # Batch lookup
    batches = (
        db.query(gate_entry.batch_number)
        .filter(gate_entry.company_id == company_id)
        .order_by(gate_entry.batch_number)
        .all()
    )

    # HLSO count lookup
    hlso_list = (
        db.query(grade_to_hoso.hlso_count)
        .filter(grade_to_hoso.company_id == company_id)
        .order_by(grade_to_hoso.hlso_count)
        .all()
    )

    # Variety lookup
    variety_list = (
        db.query(varieties.variety_name)
        .filter(varieties.company_id == company_id)
        .order_by(varieties.variety_name)
        .all()
    )

    # Contractor lookup
    contractor_list = (
        db.query(contractors.contractor_name)
        .filter(contractors.company_id == company_id)
        .order_by(contractors.contractor_name)
        .all()
    )

    # Rates lookup
    rate_list = (
        db.query(peeling_rates.rate)
        .filter(peeling_rates.company_id == company_id)
        .order_by(peeling_rates.rate)
        .all()
    )

    return templates.TemplateResponse(
        "processing/peeling.html",
        {
            "request": request,
            "batches": [b[0] for b in batches],
            "hlso_counts": [h[0] for h in hlso_list],
            "varieties": [v[0] for v in variety_list],
            "contractors": [c[0] for c in contractor_list],
            "rates": [r[0] for r in rate_list],
            "email": email,
            "company_id": company_id,
        }
    )


# ---------------------------------------------------------
# SAVE PEELING ENTRY
# ---------------------------------------------------------
@router.post("/peeling")
def save(
    request: Request,

    batch_number: str = Form(...),
    hlso_count: str = Form(...),
    hlso_qty: float = Form(0),

    variety: str = Form(...),
    peeled_qty: float = Form(0),
    yield_percent: str = Form(""),

    contractor: str = Form(...),
    rate: float = Form(...),
    amount: str = Form(""),

    date: str = Form(""),
    time: str = Form(""),
    email: str = Form(""),
    company_id: str = Form(""),

    db: Session = Depends(get_db)
):

    session_email = request.session.get("user_email")
    session_company_id = request.session.get("company_id")

    if not session_email or not session_company_id:
        return RedirectResponse("/auth/login", status_code=302)

    email = session_email
    company_id = session_company_id

    now = datetime.now()
    if not date:
        date = now.strftime("%Y-%m-%d")
    if not time:
        time = now.strftime("%H:%M:%S")

    # -------- DUPLICATE CHECK --------
    dup = db.query(peeling).filter(
        peeling.batch_number == batch_number,
        peeling.hlso_count == hlso_count,
        peeling.variety == variety,
        peeling.date == date,
        peeling.company_id == company_id,
    ).first()

    if dup:
        return RedirectResponse("/processing/peeling?error=exists", status_code=302)

    # -------- INSERT --------
    new_row = peeling(
        batch_number=batch_number,
        hlso_count=hlso_count,
        hlso_qty=hlso_qty,
        variety=variety,
        peeled_qty=peeled_qty,
        yield_percent=yield_percent,
        contractor=contractor,
        rate=rate,
        amount=amount,
        date=date,
        time=time,
        email=email,
        company_id=company_id,
    )

    db.add(new_row)
    db.commit()

    return RedirectResponse("/processing/peeling?success=1", status_code=302)
