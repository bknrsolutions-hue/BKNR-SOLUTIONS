from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.database import get_db
from app.database.models.processing import (
    RawMaterialPurchasing,
    Grading,
    Peeling,
    Soaking,
    Deheading  # 👈 Deheading మోడల్‌ని యాడ్ చేశాం
)
# Nee Centralized Service Function
from app.services.floor_balance import get_floor_balance

router = APIRouter(
    prefix="/reports", 
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

    # RMP (HOSO/HLSO Start)
    rmp_q = db.query(RawMaterialPurchasing).filter(RawMaterialPurchasing.company_id == company_id).all()
    for r in rmp_q:
        if r.batch_number:
            combos.add((r.batch_number, r.count, r.species, r.variety_name, r.production_for, r.peeling_at))

    # Grading (HOSO & HLSO Graded Items)
    grad_q = db.query(Grading).filter(Grading.company_id == company_id).all()
    for r in grad_q:
        if r.batch_number:
            combos.add((r.batch_number, r.graded_count, r.species, r.variety_name, r.production_for, r.peeling_at))

    # 🆕 Deheading (HLSO generated from HOSO)
    # Deheading ద్వారా వచ్చిన HLSO స్టాక్ కోసం ఈ కాంబినేషన్స్ అవసరం
    dehead_q = db.query(Deheading).filter(Deheading.company_id == company_id).all()
    for r in dehead_q:
        if r.batch_number:
            # Note: Deheading లో 'HLSO' వెరైటీ కాంబినేషన్ యాడ్ చేస్తున్నాం
            combos.add((r.batch_number, r.hlso_count, r.species, "HLSO", r.production_for, r.peeling_at))

    # Peeling (PD, PDTO, PUD etc.)
    peel_q = db.query(Peeling).filter(Peeling.company_id == company_id).all()
    for r in peel_q:
        if r.batch_number:
            combos.add((r.batch_number, r.hlso_count, r.species, r.variety_name, r.production_for, r.peeling_at))

    # 3. LIVE CALCULATION & FILTERING
    rows_batch = []

    for batch, count, species_val, variety, prod_for, location in combos:
        loc = location if location else "Floor"
        
        # Centralized service call (ఇందులో ఇప్పుడు Deheading లాజిక్ కూడా ఉంది)
        qty = get_floor_balance(
            db=db, 
            company_id=company_id, 
            location=loc, 
            batch=batch, 
            count=count, 
            species=species_val, 
            variety=variety
        )
        
        # 0.01 కంటే ఎక్కువ ఉన్న స్టాక్ ని మాత్రమే చూపిస్తాం
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

    # 4. FINAL SORTING
    rows_batch.sort(key=lambda x: (str(x["location"]), str(x["production_for"]), str(x["batch"])))

    # ✅ FIXED: TemplateResponse for new FastAPI versions
    return request.app.state.templates.TemplateResponse(
        request=request,
        name="reports/floor_balance_report.html",
        context={
            "rows_batch": rows_batch,
        }
    )