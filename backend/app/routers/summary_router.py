from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.database.models.processing import (
    Production,
    RawMaterialPurchasing,
    Grading,
    Peeling
)
# మీ సెంట్రలైజ్డ్ సర్వీస్ ఫంక్షన్
from app.services.floor_balance import get_floor_balance

router = APIRouter(
    prefix="/summary",
    tags=["SUMMARY"]
)

templates = Jinja2Templates(directory="app/templates")

# 1. PROCESSING SUMMARY
@router.get("/processing")
def processing_summary(request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/auth/login", status_code=303)

    rows = db.query(Production).filter(Production.company_id == company_code).all()
    return templates.TemplateResponse(
        "summary/processing_summary.html",
        {"request": request, "rows": rows}
    )

# 2. INVENTORY COSTING
@router.get("/inventory_costing")
def inventory_costing_summary(request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/auth/login", status_code=303)

    rows = db.query(Production).filter(Production.company_id == company_code).all()
    return templates.TemplateResponse(
        "summary/inventory_costing.html",
        {"request": request, "rows": rows}
    )

# 3. 🔥🔥🔥 FLOOR BALANCE VALUE ROUTE 🔥🔥🔥
@router.get("/floor_balance_value", response_class=HTMLResponse)
def floor_balance_value_report(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/auth/login", status_code=303)

    # COMBINATION BUILDING
    combos = set()

    rmp_q = db.query(
        RawMaterialPurchasing.batch_number, RawMaterialPurchasing.count,
        RawMaterialPurchasing.species, RawMaterialPurchasing.variety_name,
        RawMaterialPurchasing.production_for, RawMaterialPurchasing.peeling_at
    ).filter(RawMaterialPurchasing.company_id == company_id).all()
    for r in rmp_q:
        if r.batch_number:
            combos.add((r.batch_number, r.count, r.species, r.variety_name, r.production_for, r.peeling_at))

    grad_q = db.query(
        Grading.batch_number, Grading.graded_count,
        Grading.species, Grading.variety_name,
        Grading.production_for, Grading.peeling_at
    ).filter(Grading.company_id == company_id).all()
    for r in grad_q:
        if r.batch_number:
            combos.add((r.batch_number, r.graded_count, r.species, r.variety_name, r.production_for, r.peeling_at))

    peel_q = db.query(
        Peeling.batch_number, Peeling.hlso_count,
        Peeling.species, Peeling.variety_name,
        Peeling.production_for, Peeling.peeling_at
    ).filter(Peeling.company_id == company_id).all()
    for r in peel_q:
        if r.batch_number:
            combos.add((r.batch_number, r.hlso_count, r.species, r.variety_name, r.production_for, r.peeling_at))

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
                "batch": batch,
                "variety": variety,
                "count": count,
                "species": species_val,
                "production_for": prod_for or "General Stock",
                "location": loc,
                "available_qty": round(qty, 2)
            })

    rows_batch.sort(key=lambda x: (str(x["location"]), str(x["batch"])))

    return templates.TemplateResponse(
        request=request,
        name="summary/floor_balance_value.html",
        context={
            "rows_batch": rows_batch,
            "company_id": company_id
        }
    )