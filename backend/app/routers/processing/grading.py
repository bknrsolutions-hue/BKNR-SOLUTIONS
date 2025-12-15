from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, date
import json

from app.database import get_db
from app.database.models.processing import Grading, RawMaterialPurchasing
from app.database.models.criteria import varieties, species

router = APIRouter(tags=["GRADING"])
templates = Jinja2Templates(directory="app/templates")


# -----------------------------------------------------
# TODAY RANGE (9 AM → NEXT DAY 9 AM)  ✅ SAME AS RMP
# -----------------------------------------------------
def get_today_range():
    now = datetime.now()
    start = now.replace(hour=9, minute=0, second=0, microsecond=0)
    if now < start:
        start -= timedelta(days=1)
    end = start + timedelta(days=1) - timedelta(seconds=1)
    return start, end


# -----------------------------------------------------
# SHOW PAGE
# -----------------------------------------------------
@router.get("/grading", response_class=HTMLResponse)
def show_grading(request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")
    email = request.session.get("email")

    if not company_code or not email:
        return RedirectResponse("/auth/login", status_code=303)

    # ---------- BATCH LIST (FROM RMP) ----------
    batch_list = [
        b[0] for b in
        db.query(RawMaterialPurchasing.batch_number)
        .filter(RawMaterialPurchasing.company_id == company_code)
        .distinct()
        .order_by(RawMaterialPurchasing.batch_number)
        .all()
        if b[0]
    ]

    # ---------- SPECIES LIST (FROM SPECIES MASTER) ----------
    species_list = [
        s.species_name for s in
        db.query(species)
        .filter(species.company_id == company_code)
        .order_by(species.species_name)
        .all()
    ]

    # ---------- VARIETIES (FROM VARIETIES MASTER) ----------
    variety_list = [
        v.variety_name for v in
        db.query(varieties)
        .filter(varieties.company_id == company_code)
        .order_by(varieties.variety_name)
        .all()
    ]

    # ---------- TODAY DATA ----------
    start, end = get_today_range()
    today_data = (
        db.query(Grading)
        .filter(
            Grading.company_id == company_code,
            Grading.date >= start.date(),
            Grading.date <= end.date()
        )
        .order_by(Grading.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "processing/grading.html",
        {
            "request": request,
            "batches": batch_list,
            "species_list": species_list,
            "variety_list": variety_list,
            "today_data": today_data,
            "edit_data": None,
            "message": request.session.pop("message", None)
        }
    )


# -----------------------------------------------------
# GET HOSO COUNTS (FROM RMP)
# -----------------------------------------------------
@router.get("/grading/get_hoso/{batch}")
def get_hoso(batch: str, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    rows = (
        db.query(RawMaterialPurchasing.count)
        .filter(
            RawMaterialPurchasing.company_id == company_code,
            RawMaterialPurchasing.batch_number == batch
        )
        .distinct()
        .order_by(RawMaterialPurchasing.count)
        .all()
    )

    return {"counts": [r[0] for r in rows if r[0]]}


# -----------------------------------------------------
# SAVE NEW
# -----------------------------------------------------
@router.post("/grading")
def save_grading(
    request: Request,
    batch_number: str = Form(...),
    hoso_count: str = Form(...),
    variety_name: str = Form(...),
    graded_count: str = Form(...),
    quantity: float = Form(...),
    species_val: str = Form(...),
    db: Session = Depends(get_db)
):

    company_code = request.session.get("company_code")
    email = request.session.get("email")

    if not company_code or not email:
        return RedirectResponse("/auth/login", status_code=303)

    now = datetime.now()

    entry = Grading(
        batch_number=batch_number,
        hoso_count=hoso_count,
        variety_name=variety_name,
        graded_count=graded_count,
        quantity=quantity,
        species=species_val,
        date=now.date(),
        time=now.time(),
        email=email,
        company_id=company_code
    )

    db.add(entry)
    db.commit()

    request.session["message"] = "✔ Grading Saved Successfully!"
    return RedirectResponse("/processing/grading", status_code=303)


# -----------------------------------------------------
# EDIT PAGE
# -----------------------------------------------------
@router.get("/grading/edit/{id}", response_class=HTMLResponse)
def edit_grading(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")
    email = request.session.get("email")

    if not company_code or not email:
        return RedirectResponse("/auth/login", status_code=303)

    row = (
        db.query(Grading)
        .filter(
            Grading.id == id,
            Grading.company_id == company_code
        )
        .first()
    )

    if not row:
        return RedirectResponse("/processing/grading", status_code=303)

    response = show_grading(request, db)
    response.context["edit_data"] = row
    response.context["today_data"] = []
    return response


# -----------------------------------------------------
# UPDATE
# -----------------------------------------------------
@router.post("/grading/update/{id}")
def update_grading(
    id: int,
    request: Request,
    batch_number: str = Form(...),
    hoso_count: str = Form(...),
    variety_name: str = Form(...),
    graded_count: str = Form(...),
    quantity: float = Form(...),
    species_val: str = Form(...),
    db: Session = Depends(get_db)
):

    company_code = request.session.get("company_code")

    entry = (
        db.query(Grading)
        .filter(
            Grading.id == id,
            Grading.company_id == company_code
        )
        .first()
    )

    if not entry:
        request.session["message"] = "❌ Record Not Found!"
        return RedirectResponse("/processing/grading", status_code=303)

    entry.batch_number = batch_number
    entry.hoso_count = hoso_count
    entry.variety_name = variety_name
    entry.graded_count = graded_count
    entry.quantity = quantity
    entry.species = species_val

    db.commit()

    request.session["message"] = "✔ Grading Updated Successfully!"
    return RedirectResponse("/processing/grading", status_code=303)


# -----------------------------------------------------
# DELETE
# -----------------------------------------------------
@router.post("/grading/delete/{id}")
def delete_grading(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    entry = (
        db.query(Grading)
        .filter(
            Grading.id == id,
            Grading.company_id == company_code
        )
        .first()
    )

    if entry:
        db.delete(entry)
        db.commit()

    request.session["message"] = "🗑 Deleted Successfully!"
    return JSONResponse({"status": "ok"})
