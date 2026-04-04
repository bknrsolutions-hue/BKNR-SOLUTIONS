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
# Nee Centralized Service Function
from app.services.floor_balance import get_floor_balance

router = APIRouter(
    prefix="", 
    tags=["FLOOR BALANCE REPORT"]
)

@router.get("/floor_balance_report", response_class=HTMLResponse)
def floor_balance_report(request: Request, db: Session = Depends(get_db)):
    # 1. SESSION CHECK (Current Company Only)
    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/auth/login", status_code=303)

    # 2. COMBINATION BUILDING (Collect all possible batch-count-loc combos)
    # De-Heading, Soaking, Peeling routers lo use chese tables anni ikkada query cheyali
    combos = set()

    # RMP (HOSO Start)
    rmp_q = db.query(
        RawMaterialPurchasing.batch_number, RawMaterialPurchasing.count,
        RawMaterialPurchasing.species, RawMaterialPurchasing.variety_name,
        RawMaterialPurchasing.production_for, RawMaterialPurchasing.peeling_at
    ).filter(RawMaterialPurchasing.company_id == company_id).all()
    for r in rmp_q:
        if r.batch_number:
            combos.add((r.batch_number, r.count, r.species, r.variety_name, r.production_for, r.peeling_at))

    # Grading (HOSO & HLSO Start)
    grad_q = db.query(
        Grading.batch_number, Grading.graded_count,
        Grading.species, Grading.variety_name,
        Grading.production_for, Grading.peeling_at
    ).filter(Grading.company_id == company_id).all()
    for r in grad_q:
        if r.batch_number:
            combos.add((r.batch_number, r.graded_count, r.species, r.variety_name, r.production_for, r.peeling_at))

    # Peeling (PD, PDTO, PUD Start)
    peel_q = db.query(
        Peeling.batch_number, Peeling.hlso_count,
        Peeling.species, Peeling.variety_name,
        Peeling.production_for, Peeling.peeling_at
    ).filter(Peeling.company_id == company_id).all()
    for r in peel_q:
        if r.batch_number:
            combos.add((r.batch_number, r.hlso_count, r.species, r.variety_name, r.production_for, r.peeling_at))

    # 3. LIVE CALCULATION & FILTERING (Using Central Service)
    rows_batch = []

    for batch, count, species_val, variety, prod_for, location in combos:
        loc = location if location else "Floor"
        
        # Anni routers lo use chese ade central function call
        qty = get_floor_balance(
            db=db, 
            company_id=company_id, 
            location=loc, 
            batch=batch, 
            count=count, 
            species=species_val, 
            variety=variety
        )
        
        # Kevalam session lo balance unna data ni matrame list ki pampali
        if qty and qty > 0.01:
            rows_batch.append({
                "batch": batch or "N/A",
                "variety": variety or "N/A",
                "count": count or "N/A",
                "species": species_val or "N/A",
                "production_for": prod_for or "General Stock",
                "location": loc,
                "available_qty": round(qty, 2),
                "is_rejection": False # Regular floor data
            })

    # 4. REJECTION RECOVERY DISPLAY (Optional but helpful for visibility)
    # Soaking lo unna rejection items inka production loki vellakapothe ikkada chupinchali
    rejection_entries = db.query(Soaking).filter(
        Soaking.company_id == company_id,
        Soaking.rejection_qty > 0,
        Soaking.status != 'Completed'
    ).all()

    # Note: Service logic rejection ni variety ki add chestundi, 
    # but specific ga "Rejection" ani label kavalante idi use avtundi.

    # 5. FINAL SORTING (Corporate Order: Loc -> Prod For -> Batch)
    rows_batch.sort(key=lambda x: (str(x["location"]), str(x["production_for"]), str(x["batch"])))

    return request.app.state.templates.TemplateResponse(
        "reports/floor_balance_report.html",
        {
            "request": request,
            "rows_batch": rows_batch,
        }
    )