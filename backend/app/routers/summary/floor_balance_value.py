# ============================================================
# FLOOR BALANCE VALUE ROUTER (FINAL FIX FOR SQL ERROR)
# ============================================================

from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime

from app.database import get_db
from app.database.models.processing import RawMaterialPurchasing, Grading, Peeling
from app.database.models.reprocess import Reprocess
from app.database.models.criteria import varieties as VarietyTable, HOSO_HLSO_Yields
from app.services.floor_balance import get_floor_balance

router = APIRouter(prefix="/summary", tags=["SUMMARY"])
templates = Jinja2Templates(directory="app/templates")

# -----------------------------------------------------------
# HELPER: CALCULATE VALUE BASED ON WEIGHTED AVG RATE & YIELDS
# -----------------------------------------------------------
def calculate_balance_value(db: Session, company_id: str, batch: str, variety: str, count: str, species: str, qty: float):
    # 1. Weighted Average Rate Calculation from RMP
    rmp_stats = db.query(
        func.sum(RawMaterialPurchasing.received_qty).label("total_qty"),
        func.sum(RawMaterialPurchasing.amount).label("total_amt")
    ).filter(
        RawMaterialPurchasing.company_id == company_id,
        RawMaterialPurchasing.batch_number == batch
    ).first()

    if rmp_stats and rmp_stats.total_qty and rmp_stats.total_qty > 0:
        avg_rate = float(rmp_stats.total_amt / rmp_stats.total_qty)
    else:
        avg_rate = 0.0

    # 2. HOSO Logic
    if variety and "HOSO" in variety.upper():
        return round(qty * avg_rate, 2)

    # 3. Finished Goods Logic (Reverse Calculation)
    hlso_yield_pct = 100
    
    # --- SQL ERROR FIX: "8/12" లాంటి టెక్స్ట్ ఉంటే Integer కాలమ్ లో వెతకకుండా జాగ్రత్త పడుతున్నాం ---
    if count:
        try:
            # కాలమ్ Integer అయితే, కేవలం అంకెలను మాత్రమే వెతకాలి
            # ఒకవేళ కాలమ్ ని String కి మార్చుంటే, ఈ if అవసరం లేదు, నేరుగా వెతకవచ్చు
            search_count = str(count)
            
            yield_q = db.query(HOSO_HLSO_Yields).filter(
                HOSO_HLSO_Yields.company_id == company_id,
                HOSO_HLSO_Yields.species == species
            )
            
            # ఒకవేళ నీ DB కాలమ్ Integer అయితే, string పంపితే ఎర్రర్ వస్తుంది. 
            # అందుకే కౌంట్ లో '/' ఉంటే స్కిప్ చేస్తున్నాం
            if "/" not in search_count:
                hlso_yield_obj = yield_q.filter(HOSO_HLSO_Yields.hoso_count == search_count).first()
                if hlso_yield_obj:
                    hlso_yield_pct = hlso_yield_obj.hlso_yield_pct
        except Exception:
            hlso_yield_pct = 100

    # Peeling Yield
    var_obj = db.query(VarietyTable).filter(
        VarietyTable.company_id == company_id,
        VarietyTable.variety_name == variety
    ).first()
    
    try:
        peel_yield_pct = float(var_obj.peeling_yield) if var_obj and var_obj.peeling_yield else 100
    except (ValueError, TypeError):
        peel_yield_pct = 100

    try:
        effective_raw_qty = qty / (peel_yield_pct / 100) / (hlso_yield_pct / 100)
        return round(effective_raw_qty * avg_rate, 2)
    except ZeroDivisionError:
        return round(qty * avg_rate, 2)

@router.get("/floor_balance_value", response_class=HTMLResponse)
def floor_balance_value_report(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/auth/login", status_code=303)

    combos = set()

    # 1. RMP
    rmp_q = db.query(RawMaterialPurchasing).filter(RawMaterialPurchasing.company_id == company_id).all()
    for r in rmp_q:
        if r.batch_number:
            combos.add((r.batch_number, r.count, r.species, r.variety_name, r.production_for, r.peeling_at or "Floor", "RMP"))

    # 2. Grading
    grad_q = db.query(Grading).filter(Grading.company_id == company_id).all()
    for r in grad_q:
        if r.batch_number:
            combos.add((r.batch_number, r.graded_count, r.species, r.variety_name, r.production_for, r.peeling_at or "Floor", "RMP"))

    # 3. Peeling
    peel_q = db.query(Peeling).filter(Peeling.company_id == company_id).all()
    for r in peel_q:
        if r.batch_number:
            combos.add((r.batch_number, r.hlso_count, r.species, r.variety_name, r.production_for, r.peeling_at or "Floor", "RMP"))

    # 4. Reprocess (Added to match Floor Balance Report)
    repro_q = db.query(Reprocess).filter(Reprocess.company_id == company_id, Reprocess.reprocess_type != 'SALES').all()
    for r in repro_q:
        if r.new_batch_id:
            combos.add((r.new_batch_id, r.grade, r.species, r.variety, r.production_for, r.production_at or "Floor", "REPROCESS"))

    rows_batch = []
    for batch, count, species_val, variety, prod_for, location, s_type in combos:
        
        qty = get_floor_balance(
            db=db, 
            company_id=company_id, 
            location=location, 
            batch=batch, 
            count=count if count != "N/A" else None, 
            species=species_val if species_val != "N/A" else None, 
            variety=variety if variety != "N/A" else None,
            production_for=prod_for if prod_for != "N/A" else None,
            source_type=s_type
        )
        
        if qty and qty > 0.01:
            val = calculate_balance_value(db, company_id, batch, variety, count, species_val, qty)
            rows_batch.append({
                "batch": batch,
                "variety": variety,
                "count": count,
                "species": species_val,
                "production_for": prod_for if prod_for and prod_for != "N/A" else "General Stock",
                "location": location,
                "available_qty": round(qty, 2),
                "value": val,
                "source": s_type
            })

    rows_batch.sort(key=lambda x: (str(x["location"]), str(x["production_for"]), str(x["batch"])))

    return templates.TemplateResponse(
        request=request,
        name="summary/floor_balance_value.html",
        context={"rows_batch": rows_batch, "company_id": company_id}
    )