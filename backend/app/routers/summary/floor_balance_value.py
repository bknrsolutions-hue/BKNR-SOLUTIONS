# ============================================================
# FLOOR BALANCE VALUE ROUTER (DEBUG & REPROCESS IN_QTY FIX)
# ============================================================

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

# -----------------------------------------------------------
# HELPER: CALCULATE VALUE BASED ON SOURCE (RMP VS REPROCESS)
# -----------------------------------------------------------
def calculate_balance_value(db: Session, company_id: str, batch: str, variety: str, count: str, species: str, qty: float, source_type: str):
    avg_rate = 0.0

    # 1. SOURCE BASED RATE CALCULATION
    if source_type == "RMP":
        rmp_stats = db.query(
            func.sum(RawMaterialPurchasing.received_qty).label("tq"),
            func.sum(RawMaterialPurchasing.amount).label("ta")
        ).filter(
            RawMaterialPurchasing.company_id == company_id, 
            RawMaterialPurchasing.batch_number == batch
        ).first()
        avg_rate = float(rmp_stats.ta / rmp_stats.tq) if rmp_stats and rmp_stats.tq and rmp_stats.tq > 0 else 0.0
    
    elif source_type == "REPROCESS":
        # 🟢 CHANGED: out_qty to in_qty as per your logical fix
        rep_stats = db.query(
            func.sum(Reprocess.in_qty).label("tq"),
            func.sum(Reprocess.inventory_value).label("ta")
        ).filter(
            Reprocess.company_id == company_id,
            Reprocess.new_batch_id == batch
        ).first()

        # 🔍 DEBUG 1: Reprocess Stats Check
        print(
            "REPROCESS LOG:",
            batch,
            float(rep_stats.tq) if rep_stats and rep_stats.tq else 0.0,
            float(rep_stats.ta) if rep_stats and rep_stats.ta else 0.0
        )

        avg_rate = (
            float(rep_stats.ta / rep_stats.tq)
            if rep_stats and rep_stats.tq and rep_stats.tq > 0
            else 0.0
        )

    # 2. HOSO Case (Direct Value)
    if variety and "HOSO" in variety.upper():
        final_val = round(qty * avg_rate, 2)
        # HOSO Debug
        print("FINAL VALUE (HOSO):", batch, qty, avg_rate, final_val)
        return final_val

    # 3. YIELD CALCULATION
    var_obj = db.query(VarietyTable).filter(
        VarietyTable.company_id == company_id, 
        VarietyTable.variety_name == variety
    ).first()
    
    p_y = (float(var_obj.peeling_yield) / 100) if var_obj and var_obj.peeling_yield else 1.0

    h_y = 1.0
    if count:
        try:
            nums = re.findall(r'\d+', str(count))
            if nums:
                last_num = int(nums[-1])
                match_count = last_num - 1
                hlso_m = db.query(HOSO_HLSO_Yields).filter(
                    HOSO_HLSO_Yields.company_id == company_id,
                    HOSO_HLSO_Yields.hoso_count == match_count,
                    HOSO_HLSO_Yields.species == species
                ).first()
                if hlso_m: h_y = float(hlso_m.hlso_yield_pct or 100) / 100
        except: 
            h_y = 1.0

    # 4. FINAL CALCULATION
    denominator = p_y * h_y
    effective_raw_qty = qty / denominator if denominator > 0 else qty
    
    final_calculated_value = round(effective_raw_qty * avg_rate, 2)

    # 🔍 DEBUG 2: Final Calculation Breakdown
    print(
        "FINAL VALUE",
        batch,
        qty,
        avg_rate,
        final_calculated_value
    )
    
    return final_calculated_value

@router.get("/floor_balance_value", response_class=HTMLResponse)
def floor_balance_value_report(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id: 
        return RedirectResponse("/auth/login", status_code=303)

    combos = set()

    # Collecting data from all modules
    rmp_q = db.query(RawMaterialPurchasing).filter(RawMaterialPurchasing.company_id == company_id).all()
    for r in rmp_q:
        if r.batch_number: combos.add((r.batch_number, r.count, r.species, r.variety_name, r.production_for, r.peeling_at or "Floor", "RMP"))

    grad_q = db.query(Grading).filter(Grading.company_id == company_id).all()
    for r in grad_q:
        if r.batch_number: combos.add((r.batch_number, r.graded_count, r.species, r.variety_name, r.production_for, r.peeling_at or "Floor", "RMP"))

    peel_q = db.query(Peeling).filter(Peeling.company_id == company_id).all()
    for r in peel_q:
        if r.batch_number: combos.add((r.batch_number, r.hlso_count, r.species, r.variety_name, r.production_for, r.peeling_at or "Floor", "RMP"))

    repro_q = db.query(Reprocess).filter(Reprocess.company_id == company_id, Reprocess.reprocess_type != 'SALES').all()
    for r in repro_q:
        if r.new_batch_id: combos.add((r.new_batch_id, r.grade, r.species, r.variety, r.production_for, r.production_at or "Floor", "REPROCESS"))

    rows_batch = []
    for batch, count, species_val, variety, prod_for, location, s_type in combos:
        qty = get_floor_balance(db, company_id, location, batch, count, species_val, variety, prod_for, s_type)
        qty = round(qty, 2) if qty else 0.0
        
        val = 0.0
        if qty > 0.01:
            val = calculate_balance_value(db, company_id, batch, variety, count, species_val, qty, s_type)
        
        elif s_type == "REPROCESS":
            # Fallback for 0 qty reprocess records if they have inventory value
            rep_stats = db.query(func.sum(Reprocess.inventory_value).label("ta")).filter(
                Reprocess.company_id == company_id, 
                Reprocess.new_batch_id == batch
            ).first()
            val = round(float(rep_stats.ta), 2) if rep_stats and rep_stats.ta else 0.0

        if qty > 0.01 or val > 0.01:
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

    rows_batch.sort(key=lambda x: (str(x["location"]), str(x["production_for"]), str(x["batch"])))

    return templates.TemplateResponse(
        request=request,
        name="summary/floor_balance_value.html",
        context={"rows_batch": rows_batch, "company_id": company_id}
    )