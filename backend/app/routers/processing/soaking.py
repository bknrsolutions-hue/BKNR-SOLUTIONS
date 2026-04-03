from fastapi import APIRouter, Request, Depends, Form, Query
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct
from datetime import date, datetime

from app.database import get_db
from app.database.models.processing import (
    Soaking, RawMaterialPurchasing, Grading, DeHeading, Peeling
)
from app.database.models.criteria import (
    varieties, species, chemicals, production_at, production_for as ProductionForMaster
)
# Centralized calculation service
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

    # [2026-01-24] Searchable Dropdowns Data
    variety_list = [v[0] for v in db.query(varieties.variety_name).filter(varieties.company_id == company_id).all() if v[0]]
    species_list = [s[0] for s in db.query(species.species_name).filter(species.company_id == company_id).all() if s[0]]
    chemical_list = [c[0] for c in db.query(chemicals.chemical_name).filter(chemicals.company_id == company_id).all() if c[0]]
    prod_locs = [p[0] for p in db.query(production_at.production_at).filter(production_at.company_id == company_id).all() if p[0]]
    prod_for_list = [pf[0] for pf in db.query(distinct(ProductionForMaster.production_for)).filter(ProductionForMaster.company_id == company_id).all() if pf[0]]

    # 1. Today's Entries
    today_data = db.query(Soaking).filter(Soaking.company_id == company_id, Soaking.date == date.today()).order_by(Soaking.id.desc()).all()

    # 2. Main Floor Balance Logic with Integrated Rejection Details
    combos = set()
    # RMP
    rmp_q = db.query(RawMaterialPurchasing.batch_number, RawMaterialPurchasing.count, RawMaterialPurchasing.species, RawMaterialPurchasing.variety_name, RawMaterialPurchasing.production_for, RawMaterialPurchasing.peeling_at).filter(RawMaterialPurchasing.company_id == company_id).all()
    for r in rmp_q: combos.add((r.batch_number, r.count, r.species, r.variety_name, r.production_for, r.peeling_at))
    # Grading
    grad_q = db.query(Grading.batch_number, Grading.graded_count, Grading.species, Grading.variety_name, Grading.production_for, Grading.peeling_at).filter(Grading.company_id == company_id).all()
    for r in grad_q: combos.add((r.batch_number, r.graded_count, r.species, r.variety_name, r.production_for, r.peeling_at))
    # Peeling
    peel_q = db.query(Peeling.batch_number, Peeling.hlso_count, Peeling.species, Peeling.variety_name, Peeling.production_for, Peeling.peeling_at).filter(Peeling.company_id == company_id).all()
    for r in peel_q: combos.add((r.batch_number, r.hlso_count, r.species, r.variety_name, r.production_for, r.peeling_at))

    rows_batch = []
    for batch, count, species_val, variety, prod_for, location in combos:
        loc = location if location else "Floor"
        
        # Central balance (Fresh + Rejection Recovery)
        qty = get_floor_balance(db=db, company_id=company_id, location=loc, batch=batch, count=count, species=species_val, variety=variety)
        
        # HOSO/HLSO Rejection detailed data
        rej_qty = 0.0
        if variety in ["HOSO", "HLSO"]:
            rej_qty = db.query(func.coalesce(func.sum(Soaking.rejection_qty), 0)).filter(
                Soaking.company_id == company_id,
                Soaking.production_at == loc,
                Soaking.batch_number == batch,
                Soaking.in_count == count,
                Soaking.variety_name == variety
            ).scalar()

        if qty and qty > 0.01:
            rows_batch.append({
                "batch": batch or "N/A", 
                "variety": variety or "N/A", 
                "count": count or "N/A",
                "species": species_val or "N/A", 
                "production_for": prod_for or "N/A",
                "location": loc, 
                "rejection_qty": round(rej_qty, 2), 
                "available_qty": round(qty, 2),    
            })

    # Sorting Data Company-Wise & Location Wise
    rows_batch = sorted(rows_batch, key=lambda x: (x["production_for"], x["location"], x["batch"]))

    return request.app.state.templates.TemplateResponse("processing/soaking.html", {
        "request": request, "varieties": variety_list, "species": species_list, "chemicals": chemical_list,
        "production_locations": prod_locs, "prod_for_list": prod_for_list, "today_data": today_data,
        "rows_batch": rows_batch
    })


# =====================================================
# API ENDPOINTS: DYNAMIC DATA FETCHING
# =====================================================

@router.get("/soaking/get_count/{batch}")
def get_count(batch: str, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id: return {"counts": []}
    c1 = db.query(distinct(RawMaterialPurchasing.count)).filter(RawMaterialPurchasing.company_id == company_id, RawMaterialPurchasing.batch_number == batch).all()
    c2 = db.query(distinct(Grading.graded_count)).filter(Grading.company_id == company_id, Grading.batch_number == batch).all()
    c3 = db.query(distinct(Peeling.hlso_count)).filter(Peeling.company_id == company_id, Peeling.batch_number == batch).all()
    all_counts = set([x[0] for x in c1 if x[0]]) | set([x[0] for x in c2 if x[0]]) | set([x[0] for x in c3 if x[0]])
    return {"counts": sorted(list(all_counts))}

@router.get("/soaking/get_available_qty")
def get_available_qty_api(location: str, batch: str, count: str, species: str, variety: str, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    qty = get_floor_balance(db=db, company_id=company_id, location=location, batch=batch, count=count, species=species, variety=variety)
    return {"available_qty": round(qty, 2) if qty else 0}

@router.get("/soaking/get_batches_by_company")
def get_batches_by_company(prod_for: str, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id or not prod_for: return {"batches": []}
    r1 = db.query(distinct(RawMaterialPurchasing.batch_number)).filter(RawMaterialPurchasing.company_id == company_id, RawMaterialPurchasing.production_for == prod_for).all()
    r2 = db.query(distinct(Grading.batch_number)).filter(Grading.company_id == company_id, Grading.production_for == prod_for).all()
    r3 = db.query(distinct(Peeling.batch_number)).filter(Peeling.company_id == company_id, Peeling.production_for == prod_for).all()
    all_batches = set([b[0] for b in r1 if b[0]]) | set([b[0] for b in r2 if b[0]]) | set([b[0] for b in r3 if b[0]])
    return {"batches": sorted(list(all_batches))}

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