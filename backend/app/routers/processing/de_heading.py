# app/routers/processing/de_heading.py

from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import RedirectResponse, JSONResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime, date

from app.database import get_db
from app.database.models.processing import DeHeading, RawMaterialPurchasing
from app.database.models.criteria import peeling_rates, contractors

router = APIRouter(tags=["DE-HEADING"])
templates = Jinja2Templates(directory="app/templates")


# ------------------------------------------------------------
# PAGE
# ------------------------------------------------------------
@router.get("/de_heading", response_class=HTMLResponse)
def page(request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_id")

    # ---- BATCH LIST ----
    q = db.query(RawMaterialPurchasing.batch_number).distinct()
    if hasattr(RawMaterialPurchasing, "company_id"):
        q = q.filter(RawMaterialPurchasing.company_id == company_id)
    batches = [b[0] for b in q.all()]

    # ---- CONTRACTORS ----
    cq = db.query(contractors.contractor_name)
    if hasattr(contractors, "company_id"):
        cq = cq.filter(contractors.company_id == company_id)
    contractor_list = [c[0] for c in cq.order_by(contractors.contractor_name).all()]

    # ---- TODAY DATA ----
    today = date.today()
    dq = db.query(DeHeading).filter(DeHeading.date == today)
    if hasattr(DeHeading, "company_id"):
        dq = dq.filter(DeHeading.company_id == company_id)
    today_data = dq.order_by(DeHeading.id.desc()).all()

    return templates.TemplateResponse(
        "processing/de_heading.html",
        {
            "request": request,
            "batches": batches,
            "contractors": contractor_list,
            "today_data": today_data,
            "edit_data": None,
            "message": None,
            "today": today,
            "now": datetime.now(),
        }
    )


# ------------------------------------------------------------
# GET HOSO COUNT (AJAX)
# ------------------------------------------------------------
@router.get("/get_hoso/{batch}")
def get_hoso(batch: str, request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_id")

    q = db.query(RawMaterialPurchasing.count).distinct()
    q = q.filter(RawMaterialPurchasing.batch_number == batch)

    if hasattr(RawMaterialPurchasing, "company_id"):
        q = q.filter(RawMaterialPurchasing.company_id == company_id)

    counts = [c[0] for c in q.all() if c[0]]

    return {"counts": counts}


# ------------------------------------------------------------
# GET RATE (AJAX)
# ------------------------------------------------------------
@router.get("/get_rate/{contractor}")
def get_rate(contractor: str, request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_id")
    VARIETY = "HLSO"

    q = db.query(peeling_rates)
    q = q.filter(peeling_rates.contractor_name == contractor)
    q = q.filter(peeling_rates.variety_name == VARIETY)

    if hasattr(peeling_rates, "company_id"):
        q = q.filter(peeling_rates.company_id == company_id)

    if hasattr(peeling_rates, "status"):
        q = q.filter(peeling_rates.status == "Active")

    if hasattr(peeling_rates, "effective_from"):
        q = q.filter(peeling_rates.effective_from <= date.today())

    rate_row = q.order_by(peeling_rates.effective_from.desc()).first()

    return {"rate": float(rate_row.rate) if rate_row else 0}


# ------------------------------------------------------------
# SAVE NEW ENTRY
# ------------------------------------------------------------
@router.post("/de_heading")
def save(
    request: Request,
    batch_number: str = Form(...),
    hoso_count: str = Form(...),
    hoso_qty: float = Form(0.0),
    hlso_qty: float = Form(0.0),
    yield_percent: float = Form(0.0),
    contractor: str = Form(...),
    rate_per_kg: float = Form(0.0),
    amount: float = Form(0.0),
    remarks: str = Form(""),
    date_value: str = Form(...),
    time_value: str = Form(...),
    db: Session = Depends(get_db)
):

    company_id = request.session.get("company_id")
    email = request.session.get("user_email")

    d = date.fromisoformat(date_value)
    t = datetime.strptime(time_value, "%H:%M").time()

    entry = DeHeading(
        batch_number=batch_number,
        hoso_count=hoso_count,
        hoso_qty=hoso_qty,
        hlso_qty=hlso_qty,
        yield_percent=yield_percent,
        contractor=contractor,
        rate_per_kg=rate_per_kg,
        amount=amount,
        remarks=remarks,
        date=d,
        time=t,
        email=email,
        company_id=company_id
    )

    db.add(entry)
    db.commit()

    return RedirectResponse("/processing/de_heading", status_code=303)


# ------------------------------------------------------------
# EDIT PAGE
# ------------------------------------------------------------
@router.get("/de_heading/edit/{id}", response_class=HTMLResponse)
def edit_page(id: int, request: Request, db: Session = Depends(get_db)):

    row = db.query(DeHeading).filter(DeHeading.id == id).first()
    if not row:
        return RedirectResponse("/processing/de_heading", status_code=303)

    company_id = request.session.get("company_id")

    # batch list
    q = db.query(RawMaterialPurchasing.batch_number).distinct()
    if hasattr(RawMaterialPurchasing, "company_id"):
        q = q.filter(RawMaterialPurchasing.company_id == company_id)
    batches = [b[0] for b in q.all()]

    # contractors
    cq = db.query(contractors.contractor_name)
    if hasattr(contractors, "company_id"):
        cq = cq.filter(contractors.company_id == company_id)
    contractor_list = [c[0] for c in cq.all()]

    return templates.TemplateResponse(
        "processing/de_heading.html",
        {
            "request": request,
            "edit_data": row,
            "batches": batches,
            "contractors": contractor_list,
            "today_data": None,
            "message": None,
            "today": date.today(),
            "now": datetime.now(),
        }
    )


# ------------------------------------------------------------
# UPDATE
# ------------------------------------------------------------
@router.post("/de_heading/update/{id}")
def update(
    id: int,
    batch_number: str = Form(...),
    hoso_count: str = Form(...),
    hoso_qty: float = Form(0.0),
    hlso_qty: float = Form(0.0),
    yield_percent: float = Form(0.0),
    contractor: str = Form(...),
    rate_per_kg: float = Form(0.0),
    amount: float = Form(0.0),
    remarks: str = Form(""),
    db: Session = Depends(get_db)
):

    row = db.query(DeHeading).filter(DeHeading.id == id).first()
    if not row:
        return RedirectResponse("/processing/de_heading", status_code=303)

    row.batch_number = batch_number
    row.hoso_count = hoso_count
    row.hoso_qty = hoso_qty
    row.hlso_qty = hlso_qty
    row.yield_percent = yield_percent
    row.contractor = contractor
    row.rate_per_kg = rate_per_kg
    row.amount = amount
    row.remarks = remarks

    db.commit()

    return RedirectResponse("/processing/de_heading", status_code=303)


# ------------------------------------------------------------
# DELETE
# ------------------------------------------------------------
@router.post("/de_heading/delete/{id}")
def delete(id: int, db: Session = Depends(get_db)):
    row = db.query(DeHeading).filter(DeHeading.id == id).first()
    if row:
        db.delete(row)
        db.commit()
    return JSONResponse({"status": "ok"})
