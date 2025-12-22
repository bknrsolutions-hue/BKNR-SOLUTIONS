from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import RedirectResponse, JSONResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, date

from app.database import get_db
from app.database.models.processing import (
    DeHeading,
    RawMaterialPurchasing,
    Grading,
    Soaking
)
from app.database.models.criteria import peeling_rates, contractors, species

# =====================================================
# ROUTER
# =====================================================
router = APIRouter(tags=["DE-HEADING"])
templates = Jinja2Templates(directory="app/templates")

# =====================================================
# SHOW PAGE
# =====================================================
@router.get("/de_heading", response_class=HTMLResponse)
def show_de_heading(request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")
    email = request.session.get("email")

    if not company_code or not email:
        return RedirectResponse("/auth/login", status_code=303)

    # ---------- BATCH LIST ----------
    batches = [
        x[0] for x in
        db.query(RawMaterialPurchasing.batch_number)
        .filter(RawMaterialPurchasing.company_id == company_code)
        .distinct()
        .order_by(RawMaterialPurchasing.batch_number)
        .all()
        if x[0]
    ]

    # ---------- CONTRACTORS ----------
    contractor_list = [
        c.contractor_name for c in
        db.query(contractors)
        .filter(contractors.company_id == company_code)
        .order_by(contractors.contractor_name)
        .all()
    ]

    # ---------- SPECIES ----------
    species_list = [
        s.species_name for s in
        db.query(species)
        .filter(species.company_id == company_code)
        .order_by(species.species_name)
        .all()
    ]

    # ---------- TODAY DATA ----------
    today_data = (
        db.query(DeHeading)
        .filter(
            DeHeading.company_id == company_code,
            DeHeading.date == date.today()
        )
        .order_by(DeHeading.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "processing/de_heading.html",
        {
            "request": request,
            "batches": batches,
            "contractors": contractor_list,
            "species": species_list,
            "today_data": today_data,
            "edit_data": None
        }
    )

# =====================================================
# GET HOSO COUNTS
# =====================================================
@router.get("/get_hoso/{batch}")
def get_hoso(batch: str, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    counts = [
        r[0] for r in
        db.query(RawMaterialPurchasing.count)
        .filter(
            RawMaterialPurchasing.batch_number == batch,
            RawMaterialPurchasing.company_id == company_code
        )
        .distinct()
        .order_by(RawMaterialPurchasing.count)
        .all()
        if r[0]
    ]

    return {"counts": counts}

# =====================================================
# GET AVAILABLE QTY (FINAL LOGIC)
# =====================================================
@router.get("/get_available_qty/{batch}/{count}")
def get_available_qty(
    batch: str,
    count: str,
    request: Request,
    db: Session = Depends(get_db)
):

    company_code = request.session.get("company_code")
    if not company_code:
        return {"available_qty": 0}

    # ===========================
    # RMP RECEIVED (HOSO)
    # ===========================
    received = (
        db.query(func.coalesce(func.sum(RawMaterialPurchasing.received_qty), 0))
        .filter(
            RawMaterialPurchasing.batch_number == batch,
            RawMaterialPurchasing.count == count,
            RawMaterialPurchasing.company_id == company_code
        )
        .scalar()
    )

    # ===========================
    # DE-HEADING USED
    # ===========================
    deheading_used = (
        db.query(func.coalesce(func.sum(DeHeading.hoso_qty), 0))
        .filter(
            DeHeading.batch_number == batch,
            DeHeading.hoso_count == count,
            DeHeading.company_id == company_code
        )
        .scalar()
    )

    # ===========================
    # GRADING PLUS (OTHER → THIS COUNT)
    # ===========================
    grading_plus = (
        db.query(func.coalesce(func.sum(Grading.quantity), 0))
        .filter(
            Grading.batch_number == batch,
            Grading.graded_count == count,
            Grading.variety_name == "HOSO",
            Grading.company_id == company_code,
            Grading.hoso_count != Grading.graded_count
        )
        .scalar()
    )

    # ===========================
    # SOAKING USED
    # ===========================
    soaking_used = (
        db.query(func.coalesce(func.sum(Soaking.in_qty), 0))
        .filter(
            Soaking.batch_number == batch,
            Soaking.in_count == count,
            Soaking.variety_name == "HOSO",
            Soaking.company_id == company_code
        )
        .scalar()
    )

    # ===========================
    # SOAKING REJECTION (ADD BACK)
    # ===========================
    soaking_rejection = (
        db.query(func.coalesce(func.sum(Soaking.rejection_qty), 0))
        .filter(
            Soaking.batch_number == batch,
            Soaking.in_count == count,
            Soaking.variety_name == "HOSO",
            Soaking.company_id == company_code
        )
        .scalar()
    )

    available_qty = (
        received
        + grading_plus
        - deheading_used
        - soaking_used
        + soaking_rejection
    )

    return {"available_qty": round(max(available_qty, 0), 2)}


# =====================================================
# GET RATE
# =====================================================
@router.get("/get_rate/{contractor}")
def get_rate(contractor: str, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    row = (
        db.query(peeling_rates)
        .filter(
            peeling_rates.contractor_name == contractor,
            peeling_rates.variety_name == "HOSO",
            peeling_rates.company_id == company_code
        )
        .order_by(peeling_rates.effective_from.desc())
        .first()
    )

    return {"rate": float(row.rate) if row else 0}



# =====================================================
# SAVE NEW
# =====================================================
@router.post("/de_heading")
def save_de_heading(
    request: Request,
    batch_number: str = Form(...),
    hoso_count: str = Form(...),
    species: str = Form(...),
    hoso_qty: float = Form(...),
    hlso_qty: float = Form(...),
    yield_percent: float = Form(...),
    contractor: str = Form(...),
    rate_per_kg: float = Form(...),
    amount: float = Form(...),
    db: Session = Depends(get_db)
):

    company_code = request.session.get("company_code")
    email = request.session.get("email")

    avail = get_available_qty(batch_number, hoso_count, request, db)["available_qty"]
    if hoso_qty > avail:
        return JSONResponse({"error": "Qty exceeded"}, status_code=400)

    now = datetime.now()

    row = DeHeading(
        batch_number=batch_number,
        hoso_count=hoso_count,
        species=species,
        hoso_qty=hoso_qty,
        hlso_qty=hlso_qty,
        yield_percent=yield_percent,
        contractor=contractor,
        rate_per_kg=rate_per_kg,
        amount=amount,
        date=now.date(),
        time=now.time(),
        email=email,
        company_id=company_code
    )

    db.add(row)
    db.commit()

    return RedirectResponse("/processing/de_heading", status_code=303)

# =====================================================
# UPDATE (EDIT SAVE)
# =====================================================
@router.post("/de_heading/update/{id}")
def update_de_heading(
    id: int,
    request: Request,
    batch_number: str = Form(...),
    hoso_count: str = Form(...),
    species: str = Form(...),
    hoso_qty: float = Form(...),
    hlso_qty: float = Form(...),
    yield_percent: float = Form(...),
    contractor: str = Form(...),
    rate_per_kg: float = Form(...),
    amount: float = Form(...),
    db: Session = Depends(get_db)
):

    company_code = request.session.get("company_code")

    row = (
        db.query(DeHeading)
        .filter(
            DeHeading.id == id,
            DeHeading.company_id == company_code
        )
        .first()
    )

    if not row:
        return RedirectResponse("/processing/de_heading", status_code=303)

    avail = get_available_qty(batch_number, hoso_count, request, db)["available_qty"]
    if hoso_qty > avail:
        return JSONResponse({"error": "Qty exceeded"}, status_code=400)

    row.batch_number = batch_number
    row.hoso_count = hoso_count
    row.species = species
    row.hoso_qty = hoso_qty
    row.hlso_qty = hlso_qty
    row.yield_percent = yield_percent
    row.contractor = contractor
    row.rate_per_kg = rate_per_kg
    row.amount = amount

    db.commit()

    return RedirectResponse("/processing/de_heading", status_code=303)

# =====================================================
# EDIT (OPEN SAME PAGE WITH DATA)
# =====================================================
@router.get("/de_heading/edit/{id}", response_class=HTMLResponse)
def edit_de_heading(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")
    email = request.session.get("email")

    if not company_code or not email:
        return RedirectResponse("/auth/login", status_code=303)

    edit_row = (
        db.query(DeHeading)
        .filter(
            DeHeading.id == id,
            DeHeading.company_id == company_code
        )
        .first()
    )

    if not edit_row:
        return RedirectResponse("/processing/de_heading", status_code=303)

    # reuse show logic
    response = show_de_heading(request, db)
    response.context["edit_data"] = edit_row
    return response

# =====================================================
# DELETE
# =====================================================
@router.post("/de_heading/delete/{id}")
def delete_de_heading(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    row = (
        db.query(DeHeading)
        .filter(
            DeHeading.id == id,
            DeHeading.company_id == company_code
        )
        .first()
    )

    if row:
        db.delete(row)
        db.commit()

    return JSONResponse({"status": "ok"})
