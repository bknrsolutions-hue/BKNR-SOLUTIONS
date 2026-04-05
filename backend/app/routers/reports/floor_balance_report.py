from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from app.database import get_db
from app.database.models.processing import (
    RawMaterialPurchasing,
    Grading,
    DeHeading,  # ✅ Added DeHeading
    Peeling,
    Soaking
)
# Nee Centralized Service Function
from app.services.floor_balance import get_floor_balance

router = APIRouter(
    tags=["FLOOR BALANCE REPORT"]
)

# templates directory definition (Main.py lo unna logic ni batti idi check chesko)
templates = Jinja2Templates(directory="app/templates")

@router.get("/floor_balance_report", response_class=HTMLResponse)
def floor_balance_report(request: Request, db: Session = Depends(get_db)):
    # 1. SESSION CHECK (Current Company Only)
    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/auth/login", status_code=303)

    # 2. COMBINATION BUILDING (Collect all possible batch-count-loc combos)
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

    # 🆕 DeHeading (Adding HLSO variety generated from DeHeading)
    dehead_q = db.query(
        DeHeading.batch_number, DeHeading.hoso_count,
        DeHeading.species, DeHeading.production_for, DeHeading.peeling_at
    ).filter(DeHeading.company_id == company_id).all()
    for r in dehead_q:
        if r.batch_number:
            # HLSO variety add chestunnam
            combos.add((r.batch_number, r.hoso_count, r.species, "HLSO", r.production_for, r.peeling_at))

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
        
        # Central service call (Indulo DeHeading logic undali)
        qty = get_floor_balance(
            db=db, 
            company_id=company_id, 
            location=loc, 
            batch=batch, 
            count=count, 
            species=species_val, 
            variety=variety
        )
        
        # 0.01 kante ekkuva unna data ni matrame list ki pampali
        if qty and qty > 0.01:
            rows_batch.append({
                "batch": batch or "N/A",
                "variety": variety or "N/A",
                "count": count or "N/A",
                "species": species_val or "N/A",
                "production_for": prod_for or "General Stock",
                "location": loc,
                "available_qty": round(qty, 2),
                "is_rejection": False 
            })

    # 4. FINAL SORTING (Loc -> Prod For -> Batch)
    rows_batch.sort(key=lambda x: (str(x["location"]), str(x["production_for"]), str(x["batch"])))

    # ✅ FIXED TemplateResponse: Latest FastAPI format
    return templates.TemplateResponse(
        request=request,
        name="reports/floor_balance_report.html",
        context={
            "rows_batch": rows_batch,
        }
    )