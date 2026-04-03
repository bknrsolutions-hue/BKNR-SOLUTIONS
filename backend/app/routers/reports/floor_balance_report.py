from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.database.models.processing import (
    RawMaterialPurchasing,
    Grading,
    Peeling,
    Soaking
)
# Centralized Service Function
from app.services.floor_balance import get_floor_balance

router = APIRouter(
    prefix="", 
    tags=["FLOOR BALANCE REPORT"]
)

@router.get("/floor_balance_report", response_class=HTMLResponse)
def floor_balance_report(request: Request, db: Session = Depends(get_db)):
    # 1. SESSION CHECK
    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/auth/login", status_code=303)

    # 2. COMBINATION BUILDING
    combos = set()

    # RMP (HOSO)
    rmp_data = db.query(
        RawMaterialPurchasing.batch_number, RawMaterialPurchasing.count,
        RawMaterialPurchasing.species, RawMaterialPurchasing.variety_name,
        RawMaterialPurchasing.production_for, RawMaterialPurchasing.peeling_at
    ).filter(RawMaterialPurchasing.company_id == company_id).all()
    
    for r in rmp_data:
        if r.batch_number:
            combos.add((r.batch_number, r.count, r.species, r.variety_name, r.production_for, r.peeling_at))

    # Grading (HOSO & HLSO)
    grad_data = db.query(
        Grading.batch_number, Grading.graded_count,
        Grading.species, Grading.variety_name,
        Grading.production_for, Grading.peeling_at
    ).filter(Grading.company_id == company_id).all()
    
    for r in grad_data:
        if r.batch_number:
            combos.add((r.batch_number, r.graded_count, r.species, r.variety_name, r.production_for, r.peeling_at))

    # Peeling (PD, PDTO, PUD)
    peel_data = db.query(
        Peeling.batch_number, Peeling.hlso_count,
        Peeling.species, Peeling.variety_name,
        Peeling.production_for, Peeling.peeling_at
    ).filter(Peeling.company_id == company_id).all()
    
    for r in peel_data:
        if r.batch_number:
            combos.add((r.batch_number, r.hlso_count, r.species, r.variety_name, r.production_for, r.peeling_at))

    # 3. LIVE CALCULATION & FILTERING
    rows_batch = []
    for batch, count, species_val, variety, prod_for, location in combos:
        loc = location if location else "Floor"
        
        qty = get_floor_balance(
            db=db, 
            company_id=company_id, 
            location=loc, 
            batch=batch, 
            count=count, 
            species=species_val, 
            variety=variety
        )
        
        if qty and qty > 0.01:
            rows_batch.append({
                "batch": batch or "N/A",
                "variety": variety or "N/A",
                "count": count or "N/A",
                "species": species_val or "N/A",
                "production_for": prod_for or "General Stock",
                "location": loc,
                "available_qty": round(qty, 2)
            })

    # 4. DATA FOR SEARCHABLE FILTERS (Dropdowns)
    # రిపోర్ట్ లో పైన సెర్చ్ బాక్స్ ల కోసం యూనిక్ వాల్యూస్
    filter_data = {
        "batches": sorted(list({r["batch"] for r in rows_batch})),
        "varieties": sorted(list({r["variety"] for r in rows_batch})),
        "locations": sorted(list({r["location"] for r in rows_batch})),
        "prod_for_list": sorted(list({r["production_for"] for r in rows_batch}))
    }

    # 5. FINAL SORTING (Location -> Prod For -> Batch)
    rows_batch.sort(key=lambda x: (str(x["location"]), str(x["production_for"]), str(x["batch"])))

    # FIXED: TemplateResponse with correct request argument
    return request.app.state.templates.TemplateResponse(
        request,
        "reports/floor_balance_report.html",
        {
            "rows_batch": rows_batch,
            **filter_data
        }
    )