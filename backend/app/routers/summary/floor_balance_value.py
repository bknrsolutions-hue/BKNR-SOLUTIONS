# ============================================================
# FLOOR BALANCE VALUE ROUTER (FINAL UPDATED VERSION)
# ============================================================

from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List

from app.database import get_db
from app.database.models.processing import RawMaterialPurchasing, Grading, Peeling
from app.database.models.criteria import varieties as VarietyTable, HOSO_HLSO_Yields
from app.services.floor_balance import get_floor_balance

router = APIRouter(prefix="/summary", tags=["SUMMARY"])
templates = Jinja2Templates(directory="app/templates")

# -----------------------------------------------------------
# HELPER: CALCULATE VALUE BASED ON WEIGHTED AVG RATE & YIELDS
# -----------------------------------------------------------
def calculate_balance_value(db: Session, company_id: str, batch: str, variety: str, count: str, species: str, qty: float):
    # 1. Weighted Average Rate Calculation (Total Amount / Total Qty)
    # RMP నుండి ఆ బ్యాచ్ కి సంబంధించిన అక్యూరేట్ రేట్ తీసుకుంటున్నాము
    rmp_stats = db.query(
        func.sum(RawMaterialPurchasing.received_qty).label("total_qty"),
        func.sum(RawMaterialPurchasing.amount).label("total_amt")
    ).filter(
        RawMaterialPurchasing.company_id == company_id,
        RawMaterialPurchasing.batch_number == batch
    ).first()

    # Rate calculation: Total Value / Total Quantity
    if rmp_stats and rmp_stats.total_qty and rmp_stats.total_qty > 0:
        avg_rate = float(rmp_stats.total_amt / rmp_stats.total_qty)
    else:
        avg_rate = 0.0

    # 2. HOSO లాజిక్: నేరుగా రేట్ తో గుణించాలి
    if variety and "HOSO" in variety.upper():
        return round(qty * avg_rate, 2)

    # 3. PD, HLSO, PUD etc. లాజిక్: Yields ని బట్టి రివర్స్ క్యాలిక్యులేషన్
    # A. Get HLSO Yield from HOSO_HLSO_Yields (HOSO Count Match అవ్వాలి)
    hlso_yield_obj = db.query(HOSO_HLSO_Yields).filter(
        HOSO_HLSO_Yields.company_id == company_id,
        HOSO_HLSO_Yields.species == species,
        HOSO_HLSO_Yields.hoso_count == count 
    ).first()
    
    # ఒకవేళ మ్యాచ్ దొరకకపోతే 100% (అంటే వాల్యూలో మార్పు ఉండదు)
    hlso_yield_pct = hlso_yield_obj.hlso_yield_pct if hlso_yield_obj else 100

    # B. Get Peeling Yield from varieties table
    var_obj = db.query(VarietyTable).filter(
        VarietyTable.company_id == company_id,
        VarietyTable.variety_name == variety
    ).first()
    
    # String నుండి Float కి మార్చుకుంటున్నాం (String nullable కాబట్టి check అవసరం)
    try:
        peel_yield_pct = float(var_obj.peeling_yield) if var_obj and var_obj.peeling_yield else 100
    except (ValueError, TypeError):
        peel_yield_pct = 100

    # Value Calculation Formula:
    # Finished Qty ని Raw Material Qty గా మార్చి అప్పుడు రేట్ అప్లై చేస్తున్నాం
    try:
        # Effective Raw Qty = Current Qty / Peeling Yield % / HLSO Yield %
        effective_raw_qty = qty / (peel_yield_pct / 100) / (hlso_yield_pct / 100)
        return round(effective_raw_qty * avg_rate, 2)
    except ZeroDivisionError:
        return round(qty * avg_rate, 2)

@router.get("/floor_balance_value", response_class=HTMLResponse)
def floor_balance_value_report(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/auth/login", status_code=303)

    # COMBINATION BUILDING
    combos = set()

    # RMP Queries
    rmp_q = db.query(
        RawMaterialPurchasing.batch_number, RawMaterialPurchasing.count,
        RawMaterialPurchasing.species, RawMaterialPurchasing.variety_name,
        RawMaterialPurchasing.production_for, RawMaterialPurchasing.peeling_at
    ).filter(RawMaterialPurchasing.company_id == company_id).all()
    for r in rmp_q:
        if r.batch_number:
            combos.add((r.batch_number, r.count, r.species, r.variety_name, r.production_for, r.peeling_at))

    # Grading Queries
    grad_q = db.query(
        Grading.batch_number, Grading.graded_count,
        Grading.species, Grading.variety_name,
        Grading.production_for, Grading.peeling_at
    ).filter(Grading.company_id == company_id).all()
    for r in grad_q:
        if r.batch_number:
            combos.add((r.batch_number, r.graded_count, r.species, r.variety_name, r.production_for, r.peeling_at))

    # Peeling Queries
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
        
        # Live Quantity Calculation from Service
        qty = get_floor_balance(
            db=db, 
            company_id=company_id, 
            location=loc, 
            batch=batch, 
            count=count, 
            species=species_val, 
            variety=variety
        )
        
        # బ్యాలెన్స్ ఉన్నవాటినే రిపోర్ట్ లో చూపించాలి
        if qty and qty > 0.01:
            # Weighted Rate & Yield Logic అప్లై చేస్తున్నాం
            calculated_val = calculate_balance_value(
                db, company_id, batch, variety, count, species_val, qty
            )

            rows_batch.append({
                "batch": batch or "N/A",
                "variety": variety or "N/A",
                "count": count or "N/A",
                "species": species_val or "N/A",
                "production_for": prod_for or "General Stock",
                "location": loc,
                "available_qty": round(qty, 2),
                "value": calculated_val
            })

    # Sorting: Location -> Production -> Batch
    rows_batch.sort(key=lambda x: (str(x["location"]), str(x["production_for"]), str(x["batch"])))

    return templates.TemplateResponse(
        request=request,
        name="summary/floor_balance_value.html",
        context={
            "rows_batch": rows_batch,
            "company_id": company_id
        }
    )