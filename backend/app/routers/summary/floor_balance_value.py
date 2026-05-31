# ============================================================================
# 🟢 FIXED: FLOOR BALANCE VALUE ROUTER (WITH REVERSED MATH SCALING ENGINE)
# ============================================================================

from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
import re

from app.database import get_db
from app.database.models.processing import RawMaterialPurchasing, Grading, Peeling
from app.database.models.reprocess import Reprocess
from app.database.models.criteria import varieties as VarietyTable, HOSO_HLSO_Yields
from app.services.floor_balance import get_floor_balance

router = APIRouter(prefix="/summary", tags=["SUMMARY"])
templates = Jinja2Templates(directory="app/templates")

# ============================================================================
# 🟢 HELPER 1: CONVERT ANY SEMI-FINISHED PRODUCT QUANTITY TO HOSO EQUIVALENT
# ============================================================================
def get_hoso_equivalent_qty(db: Session, company_id: str, qty: float, variety: str, count: str, species: str, glaze: str = None):
    if not qty or qty <= 0:
        return 0.0

    qty = float(qty)
    variety_upper = str(variety or "").upper()

    # 1. REMOVE GLAZE TRACKERS
    if glaze:
        try:
            g = str(glaze).replace("%", "").strip()
            if g.isdigit():
                glaze_pct = float(g)
                if glaze_pct > 0:
                    qty = qty * ((100 - glaze_pct) / 100)
        except:
            pass

    # 2. FETCH MASTER HLSO YIELD PERCENTAGE FROM CRITERIA DB
    hlso_yield = 1.0
    if count:
        try:
            nums = re.findall(r'\d+', str(count))
            if nums:
                last_num = int(nums[-1])
                match_count = last_num - 1
                hlso = db.query(HOSO_HLSO_Yields).filter(
                    HOSO_HLSO_Yields.company_id == company_id,
                    HOSO_HLSO_Yields.hoso_count == match_count,
                    HOSO_HLSO_Yields.species == species
                ).first()
                if hlso and hlso.hlso_yield_pct:
                    hlso_yield = float(hlso.hlso_yield_pct) / 100
        except:
            hlso_yield = 1.0

    # 3. FETCH PEELING YIELD PERCENTAGE FROM VARIETY TABLE
    peeling_yield = 1.0
    var_obj = db.query(VarietyTable).filter(
        VarietyTable.company_id == company_id, 
        VarietyTable.variety_name == variety
    ).first()
    if var_obj and var_obj.peeling_yield:
        peeling_yield = float(var_obj.peeling_yield) / 100

    # 4. 🟢 THE MATH FIX: DIVIDE BY FRACTIONAL YIELDS TO ACCURATELY SCALE UP WEIGHTS
    if "HOSO" in variety_upper:
        return round(qty, 4)
    elif "HLSO" in variety_upper:
        return round(qty / hlso_yield if hlso_yield > 0 else qty, 4)
    else:
        # PD, PUD, PTO values correctly scaled upwards (e.g., 230kg raw input converts into ~400kg HOSO base)
        denominator = hlso_yield * peeling_yield
        return round(qty / denominator if denominator > 0 else qty, 4)


# ============================================================================
# 🟢 HELPER 2: VALUE CALCULATION USING UNIFORM POOLED HOSO BASE COSTING
# ============================================================================
def calculate_balance_value(db: Session, company_id: str, batch: str, variety: str, count: str, species: str, qty: float, source_type: str, glaze: str = None):
    avg_rate = 0.0

    # 🟢 FIX: Loop through each item inside pool to avoid fractional breakdown distortion
    if source_type == "RMP":
        rmp_items = db.query(RawMaterialPurchasing).filter(
            RawMaterialPurchasing.company_id == company_id, 
            RawMaterialPurchasing.batch_number == batch
        ).all()
        
        total_batch_amount = sum(float(item.amount or 0) for item in rmp_items)
        total_batch_hoso_qty = 0.0
        
        for item in rmp_items:
            total_batch_hoso_qty += get_hoso_equivalent_qty(
                db, company_id, float(item.received_qty or 0), 
                item.variety_name, item.count, item.species
            )
            
        if total_batch_hoso_qty > 0:
            avg_rate = total_batch_amount / total_batch_hoso_qty

    elif source_type == "REPROCESS":
        rep_items = db.query(Reprocess).filter(
            Reprocess.company_id == company_id, 
            Reprocess.new_batch_id == batch
        ).all()
        
        total_batch_amount = sum(float(item.inventory_value or 0) for item in rep_items)
        total_batch_hoso_qty = 0.0
        
        for item in rep_items:
            glaze_item = getattr(item, 'glaze', None)
            total_batch_hoso_qty += get_hoso_equivalent_qty(
                db, company_id, float(item.in_qty or 0), 
                item.variety, item.grade, item.species, glaze_item
            )
            
        if total_batch_hoso_qty > 0:
            avg_rate = total_batch_amount / total_batch_hoso_qty

    # Calculate actual floor value context balance based on its raw scaled dynamic weight
    fb_hoso_qty = get_hoso_equivalent_qty(db, company_id, qty, variety, count, species, glaze)
    final_value = round(fb_hoso_qty * avg_rate, 2)

    return final_value


# ============================================================================
# 🟢 STEP 3: MAIN REPORT ENDPOINT (STRICT FILTER ON QTY > 0.01)
# ============================================================================
@router.get("/floor_balance_value", response_class=HTMLResponse)
def floor_balance_value_report(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id: 
        return RedirectResponse("/auth/login", status_code=303)

    combos = set()

    # 1. Collecting data from RMP, Grading, Peeling
    rmp_q = db.query(RawMaterialPurchasing).filter(RawMaterialPurchasing.company_id == company_id).all()
    for r in rmp_q:
        if r.batch_number: 
            combos.add((r.batch_number, r.count, r.species, r.variety_name, r.production_for, r.peeling_at or "Floor", "RMP", None))

    grad_q = db.query(Grading).filter(Grading.company_id == company_id).all()
    for r in grad_q:
        if r.batch_number: 
            combos.add((r.batch_number, r.graded_count, r.species, r.variety_name, r.production_for, r.peeling_at or "Floor", "RMP", None))

    peel_q = db.query(Peeling).filter(Peeling.company_id == company_id).all()
    for r in peel_q:
        if r.batch_number: 
            combos.add((r.batch_number, r.hlso_count, r.species, r.variety_name, r.production_for, r.peeling_at or "Floor", "RMP", None))

    # 2. Collecting data from Reprocess Module
    repro_q = db.query(Reprocess).filter(Reprocess.company_id == company_id, Reprocess.reprocess_type != 'SALES').all()
    for r in repro_q:
        if r.new_batch_id: 
            glaze_val = getattr(r, 'glaze', None)
            combos.add((r.new_batch_id, r.grade, r.species, r.variety, r.production_for, r.production_at or "Floor", "REPROCESS", glaze_val))

    rows_batch = []
    for batch, count, species_val, variety, prod_for, location, s_type, glaze in combos:
        
        # Fetch current stock balance from floor balance engine
        qty = get_floor_balance(
            db=db,
            company_id=company_id,
            location=location,
            batch=batch,
            count=count,
            species=species_val,
            variety=variety,
            production_for=prod_for,
            source_type=s_type
        )
        
        qty = round(qty, 2) if qty else 0.0
        
        # Strict dynamic display visibility block logic filter
        if qty > 0.01:
            val = calculate_balance_value(db, company_id, batch, variety, count, species_val, qty, s_type, glaze)
            
            rows_batch.append({
                "batch": batch,
                "variety": variety,
                "count": count,
                "species": species_val,
                "production_for": prod_for if prod_for and prod_for != "N/A" else "General Stock",
                "location": location,
                "available_qty": qty,
                "value": val,
                "source": s_type
            })

    # Sorting Hierarchy: Location -> Production For -> Batch Number
    rows_batch.sort(key=lambda x: (str(x["location"]), str(x["production_for"]), str(x["batch"])))

    return templates.TemplateResponse(
        request=request,
        name="summary/floor_balance_value.html",
        context={"rows_batch": rows_batch, "company_id": company_id}
    )