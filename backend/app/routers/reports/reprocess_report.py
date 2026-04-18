from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
import re
from datetime import datetime

from app.database import get_db
from app.database.models.reprocess import Reprocess
from app.database.models.inventory_management import stock_entry
from app.database.models.processing import RawMaterialPurchasing
from app.database.models.criteria import varieties as VarietyTable, HOSO_HLSO_Yields
from app.services.floor_balance import get_floor_balance

router = APIRouter(tags=["REPROCESS"])
templates = Jinja2Templates(directory="app/templates")

@router.get("/re-process", response_class=HTMLResponse)
async def reprocess_report_page(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code:
        return RedirectResponse("/auth/login", status_code=302)

    # 1. 🔹 DATA REGENERATION (Open ainappudu matrame)
    try:
        db.query(Reprocess).filter(Reprocess.company_id == comp_code).delete()
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Cleanup Error: {e}")

    # 2. MASTER DATA CACHING (Optimization)
    v_records = {v.variety_name.lower(): v for v in db.query(VarietyTable).filter(VarietyTable.company_id == comp_code).all()}
    yield_master = {y.hlso_count: y.hlso_yield_pct for y in db.query(HOSO_HLSO_Yields).filter(HOSO_HLSO_Yields.company_id == comp_code).all()}

    # 3. GET INVENTORY 'OUT' DATA
    inventory_out_data = db.query(stock_entry).filter(
        stock_entry.company_id == comp_code,
        stock_entry.cargo_movement_type.ilike("OUT")
    ).order_by(stock_entry.date.asc(), stock_entry.id.asc()).all()

    batch_calculated_rates = {}
    unique_batches = list(set([r.batch_number for r in inventory_out_data if r.batch_number]))

    # 4. COSTING LOGIC
    for b_num in unique_batches:
        total_rmp_amt = db.query(func.sum(RawMaterialPurchasing.amount)).filter(
            RawMaterialPurchasing.company_id == comp_code, RawMaterialPurchasing.batch_number == b_num
        ).scalar() or 0
        rmp_avg_rate = db.query(func.avg(RawMaterialPurchasing.rate_per_kg)).filter(
            RawMaterialPurchasing.batch_number == b_num, RawMaterialPurchasing.company_id == comp_code
        ).scalar() or 0
        
        total_floor_val = 0
        combos = db.query(RawMaterialPurchasing.species, RawMaterialPurchasing.variety_name, 
                          RawMaterialPurchasing.count, RawMaterialPurchasing.peeling_at).filter(
                              RawMaterialPurchasing.batch_number == b_num, RawMaterialPurchasing.company_id == comp_code
                          ).distinct().all()

        for sp, vr, ct, loc in combos:
            f_qty = get_floor_balance(db, comp_code, loc or "Floor", b_num, ct, sp, vr)
            if f_qty > 0.01:
                total_floor_val += (float(f_qty) * float(rmp_avg_rate))

        residual_amt = float(total_rmp_amt) - float(total_floor_val)
        
        batch_items = [r for r in inventory_out_data if r.batch_number == b_num]
        total_rm_eq_w = 0
        for r in batch_items:
            v_m = v_records.get(str(r.variety or "").lower())
            p_y, s_y = (float(v_m.peeling_yield or 100)/100, float(v_m.soaking_yield or 100)/100) if v_m else (1.0, 1.0)
            
            try:
                l_num = float(re.findall(r'\d+', str(r.grade).split('/')[-1])[0])
                h_count = round(l_num / p_y / s_y)
            except: h_count = 0
            
            h_h_y = (yield_master.get(h_count, 100) / 100) if h_count > 0 else 1.0
            r._y = (p_y * s_y * h_h_y) if "HOSO" not in str(r.variety).upper() else 0.98
            total_rm_eq_w += float(r.quantity or 0) / r._y

        batch_calculated_rates[b_num] = residual_amt / total_rm_eq_w if total_rm_eq_w > 0 else 0

    # 5. GENERATE NEW BATCH IDS
    generated_batches = {} 
    daily_counter = 0

    for item in inventory_out_data:
        p_val = str(item.purpose or "GENERAL OUT").upper()
        d_str = item.date.strftime('%y%m%d') if item.date else datetime.now().strftime('%y%m%d')
        
        # Production For Logic
        p_for_name = item.production_for
        if not p_for_name or str(p_for_name).strip().upper() in ["N/A", "NONE", ""]:
            orig_row = db.query(RawMaterialPurchasing.production_for).filter(
                RawMaterialPurchasing.batch_number == item.batch_number,
                RawMaterialPurchasing.company_id == comp_code
            ).first()
            p_for_name = orig_row[0] if orig_row else "General Stock"

        match_key = (d_str, p_val, str(item.grade).strip().upper(), str(item.variety).strip().upper(), 
                     str(item.glaze).strip(), str(p_for_name).strip().upper(), str(item.production_at).strip().upper())

        if match_key in generated_batches:
            b_id = generated_batches[match_key]
        else:
            daily_counter += 1
            prefix = str(p_for_name).strip().upper()[:2]
            p_tag_map = {"SALES": "SL", "MELTING": "ML", "REPACKING": "RP", "REGLAZE": "RZ", "STORING": "ST"}
            tag = p_tag_map.get(p_val, "RE")
            b_id = f"{prefix}-{tag}-{d_str}-{daily_counter:03d}"
            generated_batches[match_key] = b_id

        y_val = getattr(item, '_y', 1.0)
        b_rate = batch_calculated_rates.get(item.batch_number, 0)
        final_rate = 280.0 if any(x in str(item.grade).upper() for x in ["BKN", "DC"]) else round(b_rate / y_val, 2)
        final_val = round(float(item.quantity or 0) * final_rate, 2)

        db.add(Reprocess(
            date=item.date, company_id=comp_code, reprocess_type=p_val, original_batch=item.batch_number,
            new_batch_id=b_id, variety=item.variety, grade=item.grade, location=item.location,
            species=item.species, freezer=item.freezer, glaze=item.glaze, in_qty=item.quantity,
            production_at=item.production_at, production_for=p_for_name, product_kg_value=final_rate,
            inventory_value=final_val, status="In-Progress"
        ))

    db.commit()
    rows = db.query(Reprocess).filter(Reprocess.company_id == comp_code).order_by(Reprocess.date.desc(), Reprocess.new_batch_id.desc()).all()
    
    return templates.TemplateResponse(request=request, name="reports/re-process.html", context={"rows": rows})