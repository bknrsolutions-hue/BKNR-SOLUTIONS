from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, datetime

from app.database import get_db
from app.database.models.processing import (
    Soaking,
    RawMaterialPurchasing,
    Grading,
    DeHeading,
    Peeling
)
from app.database.models.criteria import varieties, species, chemicals

router = APIRouter(tags=["SOAKING"])


# =====================================================
# SHOW PAGE
# =====================================================
@router.get("/soaking", response_class=HTMLResponse)
def show_soaking(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_id = request.session.get("company_code")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=303)

    batches = [
        b[0] for b in
        db.query(RawMaterialPurchasing.batch_number)
        .filter(RawMaterialPurchasing.company_id == company_id)
        .distinct().all()
    ]

    variety_list = [
        v[0] for v in
        db.query(varieties.variety_name)
        .filter(varieties.company_id == company_id)
        .distinct().all()
    ]

    species_list = [
        s[0] for s in
        db.query(species.species_name)
        .filter(species.company_id == company_id)
        .distinct().all()
    ]

    chemical_list = [
        c[0] for c in
        db.query(chemicals.chemical_name)
        .filter(chemicals.company_id == company_id)
        .distinct().all()
    ]

    today_data = (
        db.query(Soaking)
        .filter(
            Soaking.company_id == company_id,
            Soaking.date == date.today()
        )
        .order_by(Soaking.id.desc())
        .all()
    )

    return request.app.state.templates.TemplateResponse(
        "processing/soaking.html",
        {
            "request": request,
            "batches": batches,
            "varieties": variety_list,
            "species": species_list,
            "chemicals": chemical_list,
            "today_data": today_data,
            "edit_data": None
        }
    )


# =====================================================
# GET COUNTS (RMP + GRADING)
# =====================================================
@router.get("/soaking/get_count/{batch}")
def get_count(batch: str, request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_code")
    if not company_id:
        return {"counts": []}

    rmp = db.query(RawMaterialPurchasing.count).filter(
        RawMaterialPurchasing.company_id == company_id,
        RawMaterialPurchasing.batch_number == batch
    ).distinct().all()

    grading = db.query(Grading.graded_count).filter(
        Grading.company_id == company_id,
        Grading.batch_number == batch
    ).distinct().all()

    counts = sorted(set(
        [c[0] for c in rmp if c[0]] +
        [c[0] for c in grading if c[0]]
    ))

    return {"counts": counts}


# =====================================================
# GET AVAILABLE QTY (ALL VARIETIES – FINAL MASTER LOGIC)
# =====================================================
@router.get("/soaking/get_available_qty")
def get_available_qty(
    batch: str,
    count: str,
    species: str,
    variety: str,
    request: Request,
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    if not company_id:
        return {"available_qty": 0}

    # ===========================
    # 🔵 HOSO LOGIC
    # ===========================
    if variety == "HOSO":

        rmp_qty = db.query(
            func.coalesce(func.sum(RawMaterialPurchasing.received_qty), 0)
        ).filter(
            RawMaterialPurchasing.company_id == company_id,
            RawMaterialPurchasing.batch_number == batch,
            RawMaterialPurchasing.count == count,
            RawMaterialPurchasing.species == species,
            RawMaterialPurchasing.variety_name == "HOSO"
        ).scalar()

        grading_add = db.query(
            func.coalesce(func.sum(Grading.quantity), 0)
        ).filter(
            Grading.company_id == company_id,
            Grading.batch_number == batch,
            Grading.graded_count == count,
            Grading.species == species,
            Grading.variety_name == "HOSO"
        ).scalar()

        grading_out = db.query(
            func.coalesce(func.sum(Grading.quantity), 0)
        ).filter(
            Grading.company_id == company_id,
            Grading.batch_number == batch,
            Grading.hoso_count == count,
            Grading.species == species,
            Grading.variety_name == "HOSO"
        ).scalar()

        deheading_qty = db.query(
            func.coalesce(func.sum(DeHeading.hoso_qty), 0)
        ).filter(
            DeHeading.company_id == company_id,
            DeHeading.batch_number == batch,
            DeHeading.hoso_count == count,
            DeHeading.species == species
        ).scalar()

        soaking_qty = db.query(
            func.coalesce(func.sum(Soaking.in_qty), 0)
        ).filter(
            Soaking.company_id == company_id,
            Soaking.batch_number == batch,
            Soaking.in_count == count,
            Soaking.species == species,
            Soaking.variety_name == "HOSO"
        ).scalar()

        available = (
            rmp_qty
            + grading_add
            - grading_out
            - deheading_qty
            - soaking_qty
        )

    # ===========================
    # 🟢 HLSO LOGIC
    # ===========================
    elif variety == "HLSO":

        grading_hlso = db.query(
            func.coalesce(func.sum(DeHeading.hlso_qty), 0)
        ).filter(
            DeHeading.company_id == company_id,
            DeHeading.batch_number == batch,
            DeHeading.hoso_count == count,
            DeHeading.species == species
        ).scalar()

        peeling_qty = db.query(
            func.coalesce(func.sum(Peeling.hlso_qty), 0)
        ).filter(
            Peeling.company_id == company_id,
            Peeling.batch_number == batch,
            Peeling.hlso_count == count
        ).scalar()

        soaking_qty = db.query(
            func.coalesce(func.sum(Soaking.in_qty), 0)
        ).filter(
            Soaking.company_id == company_id,
            Soaking.batch_number == batch,
            Soaking.in_count == count,
            Soaking.species == species,
            Soaking.variety_name == "HLSO"
        ).scalar()

        available = grading_hlso - peeling_qty - soaking_qty

    # ===========================
    # 🟡 OTHER VARIETIES (PD / PDTO etc.)
    # ===========================
    else:

        peeled_qty = db.query(
            func.coalesce(func.sum(Peeling.peeled_qty), 0)
        ).filter(
            Peeling.company_id == company_id,
            Peeling.batch_number == batch,
            Peeling.hlso_count == count,
            Peeling.variety_name == variety,
            Peeling.species == species
        ).scalar()

        soaking_qty = db.query(
            func.coalesce(func.sum(Soaking.in_qty), 0)
        ).filter(
            Soaking.company_id == company_id,
            Soaking.batch_number == batch,
            Soaking.in_count == count,
            Soaking.variety_name == variety,
            Soaking.species == species
        ).scalar()

        available = peeled_qty - soaking_qty

    return {"available_qty": round(max(available, 0), 2)}


# =====================================================
# SAVE
# =====================================================
@router.post("/soaking")
def save_soaking(
    request: Request,
    batch_number: str = Form(...),
    variety_name: str = Form(...),
    in_count: str = Form(...),
    in_qty: float = Form(...),
    chemical_name: str = Form(...),
    chemical_percent: float = Form(...),
    salt_percent: float = Form(...),
    species_name: str = Form(...),
    db: Session = Depends(get_db)
):

    email = request.session.get("email")
    company_id = request.session.get("company_code")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=303)

    entry = Soaking(
        batch_number=batch_number,
        variety_name=variety_name,
        in_count=in_count,
        in_qty=in_qty,
        chemical_name=chemical_name,
        chemical_percent=chemical_percent,
        chemical_qty=round(in_qty * chemical_percent / 100, 2),
        salt_percent=salt_percent,
        salt_qty=round(in_qty * salt_percent / 100, 2),
        species=species_name,
        company_id=company_id,
        email=email,
        date=date.today(),
        time=datetime.now().time()
    )

    db.add(entry)
    db.commit()

    return RedirectResponse("/processing/soaking", status_code=303)


# =====================================================
# DELETE
# =====================================================
@router.post("/soaking/delete/{id}")
def delete_soaking(id: int, request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_code")

    row = db.query(Soaking).filter(
        Soaking.id == id,
        Soaking.company_id == company_id
    ).first()

    if row:
        db.delete(row)
        db.commit()

    return JSONResponse({"status": "ok"})
