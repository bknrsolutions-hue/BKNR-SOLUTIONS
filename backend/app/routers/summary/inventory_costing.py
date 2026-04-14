# ============================================================
# INVENTORY COSTING & YIELD NORMALIZATION ROUTER (UPDATED)
# ============================================================

from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
import re

from app.database import get_db
from app.database.models.inventory_management import stock_entry
from app.database.models.processing import RawMaterialPurchasing, Grading, Peeling
from app.database.models.criteria import varieties as VarietyTable, HOSO_HLSO_Yields
from app.services.floor_balance import get_floor_balance

router = APIRouter(prefix="/summary", tags=["INVENTORY COSTING"])

@router.get("/inventory_costing", response_class=HTMLResponse)
def inventory_costing_page(
    request: Request,
    db: Session = Depends(get_db),
    from_date: str = "",
    to_date: str = ""
):
    comp_code = request.session.get("company_code")
    if not comp_code:
        return RedirectResponse("/auth/login", status_code=302)

    # 🔹 1. FETCH INVENTORY ROWS
    q = db.query(stock_entry).filter(stock_entry.company_id == comp_code)
    if from_date: q = q.filter(stock_entry.date >= date.fromisoformat(from_date))
    if to_date: q = q.filter(stock_entry.date <= date.fromisoformat(to_date))
    inventory_rows = q.order_by(stock_entry.date.desc()).all()

    # 🔹 2. MASTER DATA
    v_records = {v.variety_name.lower(): v for v in db.query(VarietyTable).filter(VarietyTable.company_id == comp_code).all()}
    
    # 🔹 3. BATCH WISE RESIDUAL CALCULATION (RMP - FLOOR)
    batch_numbers = list(set([r.batch_number for r in inventory_rows if r.batch_number]))
    batch_residual_map = {}

    for batch in batch_numbers:
        # A. Total RMP Purchase Amount for this batch
        total_rmp_amt = db.query(func.sum(RawMaterialPurchasing.amount)).filter(
            RawMaterialPurchasing.company_id == comp_code,
            RawMaterialPurchasing.batch_number == batch
        ).scalar() or 0

        # B. Calculate Total Floor Balance Value for this batch
        # ఫ్లోర్ మీద ఉన్న అన్ని కాంబినేషన్స్ (Species, Variety, Count) ని చెక్ చేయాలి
        total_floor_val = 0
        
        # RMP, Grading, Peeling టేబుల్స్ నుండి ఈ బ్యాచ్ కాంబినేషన్స్ తీయాలి
        combos = db.query(
            RawMaterialPurchasing.species, RawMaterialPurchasing.variety_name, 
            RawMaterialPurchasing.count, RawMaterialPurchasing.peeling_at
        ).filter(RawMaterialPurchasing.batch_number == batch, RawMaterialPurchasing.company_id == comp_code).distinct().all()

        for sp, vr, ct, loc in combos:
            f_qty = get_floor_balance(db, comp_code, loc or "Floor", batch, ct, sp, vr)
            if f_qty > 0.01:
                # ఫ్లోర్ వాల్యూ క్యాలిక్యులేషన్ (Weighted Avg Rate * RM Qty equivalent)
                # ఇక్కడ సింపుల్ గా RM Rate తో మల్టిప్లై చేస్తున్నాం (Floor logic ప్రకారం)
                rmp_avg = db.query(func.avg(RawMaterialPurchasing.rate_per_kg)).filter(
                    RawMaterialPurchasing.batch_number == batch, RawMaterialPurchasing.company_id == comp_code
                ).scalar() or 0
                
                # Floor items ని RM equivalent లోకి మార్చి వాల్యూ కట్టాలి
                total_floor_val += (float(f_qty) * float(rmp_avg))

        # C. Residual = Total Purchase - Total Floor Value
        batch_residual_map[batch] = float(total_rmp_amt) - float(total_floor_val)

    # 🔹 4. CORE CALCULATION FOR INVENTORY ROWS
    batch_total_hoso_weight = {}
    
    for r in inventory_rows:
        # Fixed Rate Check (BKN/DC)
        if any(x in str(r.grade).upper() for x in ["BKN", "DC"]):
            r.product_kg_value = 280.0
            r.inventory_value = round(float(r.quantity or 0) * 280.0, 2)
            if r.batch_number in batch_residual_map:
                batch_residual_map[r.batch_number] -= r.inventory_value
            continue

        # Normal Yield Logic
        v_m = v_records.get(str(r.variety or "").lower())
        p_y = float(v_m.peeling_yield or 100) / 100 if v_m else 1.0
        s_y = float(v_m.soaking_yield or 100) / 100 if v_m else 1.0
        
        # HOSO Count derivation
        try:
            l_num = float(re.findall(r'\d+', str(r.grade).split('/')[-1])[0])
            h_count = l_num / p_y / s_y
        except: h_count = 0

        hlso_m = db.query(HOSO_HLSO_Yields).filter(
            HOSO_HLSO_Yields.company_id == comp_code,
            HOSO_HLSO_Yields.species == r.species,
            HOSO_HLSO_Yields.hlso_count == round(h_count)
        ).first()
        h_h_y = (hlso_m.hlso_yield_pct / 100) if hlso_m else 1.0

        # Raw Weight Equivalent
        item_yield = (p_y * s_y * h_h_y) if "HOSO" not in str(r.variety).upper() else 0.98
        r.rm_eq_weight = float(r.quantity or 0) / item_yield
        r._item_yield = item_yield # Temporarily store for next loop

        batch_total_hoso_weight[r.batch_number] = batch_total_hoso_weight.get(r.batch_number, 0) + r.rm_eq_weight

    # 🔹 5. FINAL ASSIGNMENT
    for r in inventory_rows:
        if any(x in str(r.grade).upper() for x in ["BKN", "DC"]): continue
        
        res_amt = batch_residual_map.get(r.batch_number, 0)
        tot_rm_w = batch_total_hoso_weight.get(r.batch_number, 0)
        
        # Weighted Average RM Rate
        avg_rm_rate = res_amt / tot_rm_w if tot_rm_w > 0 else 0
        
        # Final Finished Rate = RM Rate / Yields
        r.product_kg_value = round(avg_rm_rate / r._item_yield, 2) if getattr(r, '_item_yield', 0) > 0 else 0
        r.inventory_value = round(float(r.quantity or 0) * r.product_kg_value, 2)

    return request.app.state.templates.TemplateResponse(
        request=request,
        name="inventory_management/inventory_costing.html",
        context={"rows": inventory_rows, "from_date": from_date, "to_date": to_date}
    )