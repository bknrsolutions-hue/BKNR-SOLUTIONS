from fastapi import APIRouter, Request, Depends, Form, Query
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from datetime import date, datetime
import json

from app.database import get_db
from app.database.models.processing import (
    Soaking, RawMaterialPurchasing, Grading, DeHeading, Peeling
)
from app.database.models.criteria import (
    varieties, species, chemicals, production_at, production_for as ProductionForMaster
)
from app.services.floor_balance import get_floor_balance 

router = APIRouter(tags=["SOAKING"])

# =====================================================
# SHOW PAGE: FETCHING DATA & MASTER DATA
# =====================================================
@router.get("/soaking", response_class=HTMLResponse)
def show_soaking(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    email = request.session.get("email")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=303)

    # [2026-01-24] Fetching Data for Searchable Dropdowns
    variety_list = [v[0] for v in db.query(varieties.variety_name).filter(varieties.company_id == company_id).all() if v[0]]
    species_list = [s[0] for s in db.query(species.species_name).filter(species.company_id == company_id).all() if s[0]]
    chemical_list = [c[0] for c in db.query(chemicals.chemical_name).filter(chemicals.company_id == company_id).all() if c[0]]
    prod_locs = [p[0] for p in db.query(production_at.production_at).filter(production_at.company_id == company_id).all() if p[0]]
    prod_for_list = [pf[0] for pf in db.query(distinct(ProductionForMaster.production_for)).filter(ProductionForMaster.company_id == company_id).all() if pf[0]]

    # Today's Entries
    today_data = db.query(Soaking).filter(Soaking.company_id == company_id, Soaking.date == date.today()).order_by(Soaking.id.desc()).all()

    # Floor Balance Logic
    combos = set()
    # Collect all existing combinations from different stages
    for r in db.query(RawMaterialPurchasing.batch_number, RawMaterialPurchasing.count, RawMaterialPurchasing.species, RawMaterialPurchasing.variety_name, RawMaterialPurchasing.production_for, RawMaterialPurchasing.peeling_at).filter(RawMaterialPurchasing.company_id == company_id).all():
        combos.add((r.batch_number, r.count, r.species, r.variety_name, r.production_for, r.peeling_at))
    
    for r in db.query(Grading.batch_number, Grading.graded_count, Grading.species, Grading.variety_name, Grading.production_for, Grading.peeling_at).filter(Grading.company_id == company_id).all():
        combos.add((r.batch_number, r.graded_count, r.species, r.variety_name, r.production_for, r.peeling_at))
        
    for r in db.query(Peeling.batch_number, Peeling.hlso_count, Peeling.species, Peeling.variety_name, Peeling.production_for, Peeling.peeling_at).filter(Peeling.company_id == company_id).all():
        combos.add((r.batch_number, r.hlso_count, r.species, r.variety_name, r.production_for, r.peeling_at))

    rows_batch = []
    for batch, count, species_val, variety, prod_for, location in combos:
        loc = location if location else "Floor"
        qty = get_floor_balance(db=db, company_id=company_id, location=loc, batch=batch, count=count, species=species_val, variety=variety)
        
        rej_qty = 0.0
        if variety in ["HOSO", "HLSO"]:
            rej_qty = db.query(func.coalesce(func.sum(Soaking.rejection_qty), 0)).filter(
                Soaking.company_id == company_id, Soaking.production_at == loc,
                Soaking.batch_number == batch, Soaking.in_count == count, Soaking.variety_name == variety
            ).scalar()

        if qty and qty > 0.01:
            rows_batch.append({
                "batch": batch or "N/A", "variety": variety or "N/A", "count": count or "N/A",
                "species": species_val or "N/A", "production_for": prod_for or "N/A",
                "location": loc, "rejection_qty": round(rej_qty, 2), "available_qty": round(qty, 2),    
            })

    rows_batch = sorted(rows_batch, key=lambda x: (x["production_for"], x["location"], x["batch"]))

    # FIXED: Using request as first argument for TemplateResponse
    return request.app.state.templates.TemplateResponse(
        request, 
        "processing/soaking.html", 
        {
            "varieties": variety_list, "species": species_list, "chemicals": chemical_list,
            "production_locations": prod_locs, "prod_for_list": prod_for_list, 
            "today_data": today_data, "rows_batch": rows_batch
        }
    )

# ... API Endpoints (get_count, get_available_qty, etc.) remain the same ...

@router.post("/soaking")
def save_soaking(
    request: Request, db: Session = Depends(get_db),
    sintex_number: str = Form(None), batch_number: str = Form(...), 
    variety_name: str = Form(...), in_count: str = Form(...), 
    in_qty: float = Form(0), rejection_qty: float = Form(0),
    rejection_for: str = Form(None), chemical_name: str = Form(...), 
    chemical_percent: float = Form(0), salt_percent: float = Form(0), 
    species_name: str = Form(None), production_at: str = Form(...), 
    production_for: str = Form(...)
):
    email, company_id = request.session.get("email"), request.session.get("company_code")

    # Balance Validation
    avail = get_floor_balance(db, company_id, production_at, batch_number, in_count, species_name, variety_name)
    if in_qty > (avail + 0.05):
        return JSONResponse({"error": f"Insufficient balance at {production_at}. Available: {avail}"}, status_code=400)

    # Logic: If it's only a rejection entry (no 'in' qty), don't assign a sintex number
    final_sintex = sintex_number if not (rejection_qty > 0 and in_qty == 0) else None

    entry = Soaking(
        sintex_number=final_sintex, batch_number=batch_number, variety_name=variety_name, 
        in_count=in_count, in_qty=in_qty, rejection_qty=rejection_qty, 
        rejection_for=rejection_for, chemical_name=chemical_name, 
        chemical_percent=chemical_percent,
        chemical_qty=round(in_qty * chemical_percent / 100, 2),
        salt_percent=salt_percent, salt_qty=round(in_qty * salt_percent / 100, 2),
        species=species_name, production_at=production_at, production_for=production_for,
        company_id=company_id, email=email, date=date.today(), 
        time=datetime.now().time(), status="Pending"
    )
    db.add(entry)
    db.commit()
    return RedirectResponse("/processing/soaking", status_code=303)


# =====================================================
# SAVE / UPDATE / DELETE
# =====================================================

@router.post("/soaking")
def save_soaking(
    request: Request, db: Session = Depends(get_db),
    sintex_number: str = Form(None), batch_number: str = Form(...), 
    variety_name: str = Form(...), in_count: str = Form(...), 
    in_qty: float = Form(0), rejection_qty: float = Form(0),
    rejection_for: str = Form(None), chemical_name: str = Form(...), 
    chemical_percent: float = Form(0), salt_percent: float = Form(0), 
    species_name: str = Form(None), production_at: str = Form(...), 
    production_for: str = Form(...)
):
    email = request.session.get("email")
    company_id = request.session.get("company_code")

    avail = get_floor_balance(db, company_id, production_at, batch_number, in_count, species_name, variety_name)
    if in_qty > (avail + 0.05):
        return JSONResponse({"error": f"Insufficient balance at {production_at}. Available: {avail}"}, status_code=400)

    final_sintex = sintex_number if not (rejection_qty > 0 and in_qty == 0) else None

    entry = Soaking(
        sintex_number=final_sintex, batch_number=batch_number, variety_name=variety_name, 
        in_count=in_count, in_qty=in_qty, rejection_qty=rejection_qty, 
        rejection_for=rejection_for, chemical_name=chemical_name, 
        chemical_percent=chemical_percent,
        chemical_qty=round(in_qty * chemical_percent / 100, 2),
        salt_percent=salt_percent, salt_qty=round(in_qty * salt_percent / 100, 2),
        species=species_name, production_at=production_at, production_for=production_for,
        company_id=company_id, email=email, date=date.today(), 
        time=datetime.now().time(), status="Pending"
    )
    db.add(entry)
    db.commit()
    return RedirectResponse("/processing/soaking", status_code=303)

@router.post("/soaking/update/{id}")
def update_soaking(
    id: int, request: Request, db: Session = Depends(get_db),
    sintex_number: str = Form(None), batch_number: str = Form(...), 
    variety_name: str = Form(...), in_count: str = Form(...), 
    in_qty: float = Form(0), rejection_qty: float = Form(0),
    rejection_for: str = Form(None), chemical_name: str = Form(...), 
    chemical_percent: float = Form(0), salt_percent: float = Form(0), 
    species_name: str = Form(None), production_at: str = Form(...), 
    production_for: str = Form(...)
):
    company_id = request.session.get("company_code")
    row = db.query(Soaking).filter(Soaking.id == id, Soaking.company_id == company_id).first()
    if row:
        row.sintex_number = sintex_number if not (rejection_qty > 0 and in_qty == 0) else None
        row.batch_number = batch_number
        row.variety_name = variety_name
        row.in_count = in_count
        row.in_qty = in_qty
        row.rejection_qty = rejection_qty
        row.rejection_for = rejection_for
        row.chemical_name = chemical_name
        row.chemical_percent = chemical_percent
        row.chemical_qty = round(in_qty * chemical_percent / 100, 2)
        row.salt_percent = salt_percent
        row.salt_qty = round(in_qty * salt_percent / 100, 2)
        row.species = species_name
        row.production_at = production_at
        row.production_for = production_for
        db.commit()
    return RedirectResponse("/processing/soaking", status_code=303)

@router.post("/soaking/delete/{id}")
def delete_soaking(id: int, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    db.query(Soaking).filter(Soaking.id == id, Soaking.company_id == company_id).delete()
    db.commit()
    return JSONResponse({"status": "ok"})