from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from sqlalchemy.orm import Session
from datetime import datetime, date
from sqlalchemy import func

from app.database import get_db
from app.database.models.processing import Grading, Peeling
from app.database.models.criteria import varieties, contractors, peeling_rates

router = APIRouter(tags=["PEELING"])


# =====================================================
# SHOW PAGE
# =====================================================
@router.get("/peeling", response_class=HTMLResponse)
def show_peeling(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_id = request.session.get("company_code")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=303)

    batch_list = [
        b[0] for b in
        db.query(Grading.batch_number)
        .filter(Grading.company_id == company_id)
        .distinct()
        .all()
    ]

    variety_list = [
        v[0] for v in
        db.query(varieties.variety_name)
        .filter(varieties.company_id == company_id)
        .distinct()
        .all()
    ]

    contractor_list = [
        c[0] for c in
        db.query(contractors.contractor_name)
        .filter(contractors.company_id == company_id)
        .distinct()
        .all()
    ]

    today_data = (
        db.query(Peeling)
        .filter(
            Peeling.company_id == company_id,
            Peeling.date == date.today()
        )
        .order_by(Peeling.id.desc())
        .all()
    )

    return request.app.state.templates.TemplateResponse(
        "processing/peeling.html",
        {
            "request": request,
            "batches": batch_list,
            "hlso_counts": [],   # loaded by JS
            "varieties": variety_list,
            "contractors": contractor_list,
            "today_data": today_data,
            "edit_data": None
        }
    )


# =====================================================
# GET HLSO COUNTS (FROM GRADING)
# =====================================================
@router.get("/peeling/get_hlso/{batch}")
def get_hlso(batch: str, request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_code")

    rows = (
        db.query(Grading.graded_count)
        .filter(
            Grading.company_id == company_id,
            Grading.batch_number == batch
        )
        .distinct()
        .all()
    )

    return {"counts": [r[0] for r in rows if r[0]]}


# =====================================================
# RATE LOOKUP (CONTRACTOR + VARIETY)
# =====================================================
@router.get("/peeling/get_rate")
def get_rate(
    contractor: str,
    variety: str,
    request: Request,
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")

    row = (
        db.query(peeling_rates.rate)
        .filter(
            peeling_rates.company_id == company_id,
            peeling_rates.contractor_name == contractor,
            peeling_rates.variety_name == variety
        )
        .first()
    )

    return {"rate": row[0] if row else 0}


# =====================================================
# SAVE
# =====================================================
@router.post("/peeling")
def save_peeling(
    request: Request,
    batch_number: str = Form(...),
    hlso_count: str = Form(...),
    hlso_qty: float = Form(...),
    variety_name: str = Form(...),
    peeled_qty: float = Form(...),
    contractor_name: str = Form(...),
    rate: float = Form(...),
    amount: float = Form(...),
    yield_percent: float = Form(...),
    db: Session = Depends(get_db)
):

    email = request.session.get("email")
    company_id = request.session.get("company_code")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=303)

    obj = Peeling(
        batch_number=batch_number,
        hlso_count=hlso_count,
        hlso_qty=hlso_qty,
        variety_name=variety_name,
        peeled_qty=peeled_qty,
        contractor_name=contractor_name,
        rate=rate,
        amount=amount,
        yield_percent=yield_percent,
        date=date.today(),
        time=datetime.now().time(),
        email=email,
        company_id=company_id
    )

    db.add(obj)
    db.commit()

    return RedirectResponse("/processing/peeling", status_code=303)


# =====================================================
# EDIT PAGE
# =====================================================
@router.get("/peeling/edit/{id}", response_class=HTMLResponse)
def edit_peeling(id: int, request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_id = request.session.get("company_code")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=303)

    row = (
        db.query(Peeling)
        .filter(
            Peeling.company_id == company_id,
            Peeling.id == id
        )
        .first()
    )

    if not row:
        return RedirectResponse("/processing/peeling", status_code=303)

    page = show_peeling(request, db)
    page.context["edit_data"] = row
    page.context["today_data"] = None
    return page


# =====================================================
# GET AVAILABLE HLSO QTY (Grading - Peeling Used)
# =====================================================
@router.get("/peeling/get_available_qty/{batch}/{hlso_count}")
def get_available_qty(
    batch: str,
    hlso_count: str,
    request: Request,
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")

    # TOTAL FROM GRADING
    total_graded = (
        db.query(func.sum(Grading.quantity))
        .filter(
            Grading.company_id == company_id,
            Grading.batch_number == batch,
            Grading.graded_count == hlso_count
        )
        .scalar()
    ) or 0

    # TOTAL USED IN PEELING
    total_used = (
        db.query(func.sum(Peeling.hlso_qty))
        .filter(
            Peeling.company_id == company_id,
            Peeling.batch_number == batch,
            Peeling.hlso_count == hlso_count
        )
        .scalar()
    ) or 0

    available = round(total_graded - total_used, 2)

    return {"available_qty": available}


# =====================================================
# DELETE
# =====================================================
@router.post("/peeling/delete/{id}")
def delete_peeling(id: int, request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_code")

    row = (
        db.query(Peeling)
        .filter(
            Peeling.company_id == company_id,
            Peeling.id == id
        )
        .first()
    )

    if row:
        db.delete(row)
        db.commit()

    return JSONResponse({"status": "ok"})
