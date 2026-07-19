from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
import re
from datetime import datetime
from app.utils.global_filters import get_global_filters
from app.utils.cancel_math import active_number

from app.database import get_db
from app.database.models.processing import RawMaterialPurchasing, DeHeading, Grading, Peeling
from app.database.models.reprocess import Reprocess
from app.database.models.criteria import varieties as VarietyTable, HOSO_HLSO_Yields
from app.services.floor_balance import get_floor_balance
# Imported FloorBalance database model
from app.database.models.floor_balance import FloorBalance 

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

    if glaze:
        try:
            g = str(glaze).replace("%", "").strip()
            if g.isdigit():
                glaze_pct = float(g)
                if glaze_pct > 0:
                    qty = qty * ((100 - glaze_pct) / 100)
        except:
            pass

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

    peeling_yield = 1.0
    var_obj = db.query(VarietyTable).filter(
        VarietyTable.company_id == company_id, 
        VarietyTable.variety_name == variety
    ).first()
    if var_obj and var_obj.peeling_yield:
        peeling_yield = float(var_obj.peeling_yield) / 100

    if "HOSO" in variety_upper:
        return round(qty, 4)
    elif "HLSO" in variety_upper:
        return round(qty / hlso_yield if hlso_yield > 0 else qty, 4)
    else:
        denominator = hlso_yield * peeling_yield
        return round(qty / denominator if denominator > 0 else qty, 4)


# ============================================================================
# 🟢 HELPER 2: VALUE CALCULATION USING UNIFORM POOLED HOSO BASE COSTING
# ============================================================================
def calculate_balance_value(db: Session, company_id: str, batch: str, variety: str, count: str, species: str, qty: float, source_type: str, glaze: str = None):
    avg_rate = 0.0

    if source_type == "RMP":
        rmp_items = db.query(RawMaterialPurchasing).filter(
            RawMaterialPurchasing.company_id == company_id, 
            RawMaterialPurchasing.batch_number == batch
        ).all()
        
        total_batch_amount = sum(active_number(item, item.amount) for item in rmp_items)
        total_batch_hoso_qty = 0.0
        
        for item in rmp_items:
            total_batch_hoso_qty += get_hoso_equivalent_qty(
                db, company_id, active_number(item, item.received_qty),
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

    fb_hoso_qty = get_hoso_equivalent_qty(db, company_id, qty, variety, count, species, glaze)
    final_value = round(fb_hoso_qty * avg_rate, 2)

    return final_value


# ============================================================================
# 🟢 HELPER 3: SAVE OR UPDATE FLOOR BALANCE PERSISTENCE CORE ENGINE
# ============================================================================
def save_floor_balance(
    db: Session, company_id: str, location: str, production_for: str,
    batch: str, source: str, species: str, variety: str, count: str,
    qty: float, value: float, email: str
):
    now = datetime.utcnow()
    current_date = now.strftime("%Y-%m-%d")
    current_time = now.strftime("%H:%M:%S")

    # Composite Unique Core Parameters Filtering Matrix
    row = db.query(FloorBalance).filter(
        FloorBalance.company_id == company_id,
        FloorBalance.location == location,
        FloorBalance.production_for == production_for,
        FloorBalance.batch_number == batch,
        FloorBalance.source_type == source,
        FloorBalance.species == species,
        FloorBalance.variety == variety,
        FloorBalance.count == str(count)
    ).first()

    if row:
        row.available_qty = qty
        row.inventory_value = value
        row.last_transaction = "SNAPSHOT"
        row.last_updated = now
        row.date = current_date
        row.time = current_time
        row.email = email
    else:
        db.add(
            FloorBalance(
                company_id=company_id,
                location=location,
                production_for=production_for,
                batch_number=batch,
                source_type=source,
                species=species,
                variety=variety,
                count=str(count),
                available_qty=qty,
                inventory_value=value,
                last_transaction="SNAPSHOT",
                last_updated=now,
                date=current_date,
                time=current_time,
                email=email
            )
        )


# ============================================================================
# 🟢 STEP 4: MAIN REPORT & STORAGE ENGINE ENDPOINT
# ============================================================================
@router.get("/floor_balance_value", response_class=HTMLResponse)
def floor_balance_value_report(request: Request, db: Session = Depends(get_db)):
    production_for, location = get_global_filters(request)
    company_id = request.session.get("company_code")
    user_email = request.session.get("email") or request.session.get("user_email") or "System"
    
    if not company_id: 
        return RedirectResponse("/auth/login", status_code=303)

    combos = set()

    # 1. Collecting data from RMP, Grading, Peeling
    rmp_q = db.query(RawMaterialPurchasing).filter(RawMaterialPurchasing.company_id == company_id).all()
    for r in rmp_q:
        if r.batch_number: 
            combos.add((r.batch_number, r.count, r.species, r.variety_name, r.production_for, r.peeling_at or "Floor", "RMP", None))

    deh_q = db.query(DeHeading).filter(DeHeading.company_id == company_id).all()
    for r in deh_q:
        if r.batch_number:
            combos.add((r.batch_number, r.hoso_count, r.species, "HLSO", r.production_for, r.peeling_at or "Floor", "RMP", None))

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
    for batch, count, species_val, variety, prod_for, row_location, s_type, glaze in combos:
        if production_for and str(prod_for) != str(production_for):
            continue

        if location and str(row_location) != str(location):
            continue
        
        qty = get_floor_balance(
            db=db,
            company_id=company_id,
            location=row_location,
            batch=batch,
            count=count,
            species=species_val,
            variety=variety,
            production_for=prod_for,
            source_type=s_type
        )
        
        qty = round(qty, 2) if qty else 0.0
        
        # Strict dynamic save & display filter block logic
        if qty > 0.01:
            val = calculate_balance_value(db, company_id, batch, variety, count, species_val, qty, s_type, glaze)
            prod_for_clean = prod_for if prod_for and prod_for != "N/A" else "General Stock"

            # Execute Persistence Mapping directly into target table
            save_floor_balance(
                db=db,
                company_id=company_id,
                location=row_location,
                production_for=prod_for_clean,
                batch=batch,
                source=s_type,
                species=species_val,
                variety=variety,
                count=count,
                qty=qty,
                value=val,
                email=user_email
            )
            
            rows_batch.append({
                "batch": batch,
                "variety": variety,
                "count": count,
                "species": species_val,
                "production_for": prod_for_clean,
                "location": row_location,
                "available_qty": qty,
                "value": val,
                "source": s_type
            })

    # Single operational commit block execution for optimum performance
    db.commit()

    rows_batch.sort(key=lambda x: (str(x["location"]), str(x["production_for"]), str(x["batch"])))

    if request.query_params.get("format") == "json":
        from fastapi.responses import JSONResponse
        from fastapi.encoders import jsonable_encoder
        return JSONResponse(jsonable_encoder({
            "rows_batch": rows_batch,
            "company_id": company_id
        }))

    return templates.TemplateResponse(
        request=request,
        name="summary/floor_balance_value.html",
        context={"rows_batch": rows_batch, "company_id": company_id}
    )
