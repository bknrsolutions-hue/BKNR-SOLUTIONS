# ============================================================
# FINAL INVENTORY & REPROCESS COSTING ROUTER
# ============================================================

from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date
import re

from app.database import get_db
from app.database.models.reprocess import Reprocess
from app.database.models.inventory_management import stock_entry
from app.database.models.processing import RawMaterialPurchasing
from app.database.models.criteria import varieties as VarietyTable, HOSO_HLSO_Yields
from app.services.floor_balance import get_floor_balance

router = APIRouter(prefix="/summary", tags=["FINAL COSTING"])
templates = Jinja2Templates(directory="app/templates")


def get_glaze_factor(glaze_str: str) -> float:
    glaze_str = str(glaze_str).upper().strip()
    if "NWNC" in glaze_str:
        return 1.0
    
    digits = re.findall(r'\d+', glaze_str)
    if digits:
        glaze_pct = int(digits[0])
        return (100 - glaze_pct) / 100
    return 1.0


def get_process_addon(variety: str, freezer: str, purpose: str) -> int:
    v = str(variety).upper()
    f = str(freezer).upper()
    p = str(purpose).upper()

    if "REGLAZE" in p:
        return 15
    
    if any(x in f for x in ["IQF", "BRINE"]):
        return 75 if "COOK" in v else 60
    
    if any(x in f for x in ["BLOCK", "BLAST"]):
        return 65 if "COOK" in v else 50
    
    return 5


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

    # --------------------------------------------------
    # 1. FETCH DATA
    # --------------------------------------------------
    inventory_rows = db.query(stock_entry).filter(
        stock_entry.company_id == comp_code
    )

    if from_date:
        inventory_rows = inventory_rows.filter(
            stock_entry.date >= date.fromisoformat(from_date)
        )

    if to_date:
        inventory_rows = inventory_rows.filter(
            stock_entry.date <= date.fromisoformat(to_date)
        )

    inventory_rows = inventory_rows.all()

    v_records = {
        v.variety_name.lower(): v
        for v in db.query(VarietyTable).filter(
            VarietyTable.company_id == comp_code
        ).all()
    }

    # --------------------------------------------------
    # 2. BATCH RESIDUAL
    # --------------------------------------------------
    batch_numbers = list(set([r.batch_number for r in inventory_rows if r.batch_number]))
    batch_residual_map = {}
    batch_total_hoso_weight = {}

    for batch in batch_numbers:

        total_rmp_amt = db.query(func.sum(RawMaterialPurchasing.amount)).filter(
            RawMaterialPurchasing.company_id == comp_code,
            RawMaterialPurchasing.batch_number == batch
        ).scalar() or 0

        total_floor_val = 0

        combos = db.query(
            RawMaterialPurchasing.species,
            RawMaterialPurchasing.variety_name,
            RawMaterialPurchasing.count,
            RawMaterialPurchasing.peeling_at
        ).filter(
            RawMaterialPurchasing.batch_number == batch,
            RawMaterialPurchasing.company_id == comp_code
        ).distinct().all()

        rmp_avg = db.query(func.avg(RawMaterialPurchasing.rate_per_kg)).filter(
            RawMaterialPurchasing.batch_number == batch,
            RawMaterialPurchasing.company_id == comp_code
        ).scalar() or 0

        for sp, vr, ct, loc in combos:
            f_qty = get_floor_balance(
                db, comp_code, loc or "Floor", batch, ct, sp, vr
            )
            total_floor_val += (float(f_qty) * float(rmp_avg))

        batch_residual_map[batch] = float(total_rmp_amt) - float(total_floor_val)

    # --------------------------------------------------
    # 3. NORMALIZATION
    # --------------------------------------------------
    for r in inventory_rows:

        if any(x in str(r.grade).upper() for x in ["BKN", "DC"]):
            r.product_kg_value = 280.0
            r.inventory_value = round(float(r.quantity or 0) * 280.0, 2)

            if r.batch_number in batch_residual_map:
                batch_residual_map[r.batch_number] -= r.inventory_value
            continue

        v_m = v_records.get(str(r.variety or "").lower())

        p_y = float(v_m.peeling_yield or 100) / 100 if v_m else 1.0
        s_y = float(v_m.soaking_yield or 100) / 100 if v_m else 1.0

        try:
            l_num = float(re.findall(r'\d+', str(r.grade).split('/')[-1])[0])
            h_count = l_num / p_y / s_y
        except:
            h_count = 0

        hlso_m = db.query(HOSO_HLSO_Yields).filter(
            HOSO_HLSO_Yields.company_id == comp_code,
            HOSO_HLSO_Yields.hlso_count == round(h_count)
        ).first()

        h_h_y = (hlso_m.hlso_yield_pct / 100) if hlso_m else 1.0

        item_yield = (
            (p_y * s_y * h_h_y)
            if "HOSO" not in str(r.variety).upper()
            else 0.98
        )

        glaze_f = get_glaze_factor(r.glaze)
        g2_f = 0.85 if "G2" in str(r.grade).upper() else 1.0

        r._final_norm_factor = item_yield * glaze_f * g2_f

        r.rm_eq_weight = float(r.quantity or 0) / r._final_norm_factor

        batch_total_hoso_weight[r.batch_number] = (
            batch_total_hoso_weight.get(r.batch_number, 0)
            + r.rm_eq_weight
        )

    # --------------------------------------------------
    # 4. FINAL CALCULATION
    # --------------------------------------------------
    for r in inventory_rows:

        if any(x in str(r.grade).upper() for x in ["BKN", "DC"]):
            continue

        res_amt = batch_residual_map.get(r.batch_number, 0)
        tot_rm_w = batch_total_hoso_weight.get(r.batch_number, 0)

        avg_rm_rate = res_amt / tot_rm_w if tot_rm_w > 0 else 0

        base_rate = (
            avg_rm_rate / r._final_norm_factor
            if r._final_norm_factor > 0 else 0
        )

        addon_cost = get_process_addon(
            r.variety,
            r.freezer,
            r.purpose or "N/A"
        )

        r.product_kg_value = round(base_rate + addon_cost, 2)
        r.inventory_value = round(
            float(r.quantity or 0) * r.product_kg_value, 2
        )

    # --------------------------------------------------
    # 🔥 SAVE TO DATABASE (CRITICAL FIX)
    # --------------------------------------------------
    for r in inventory_rows:
        db.add(r)

    db.commit()

    # --------------------------------------------------
    # RESPONSE
    # --------------------------------------------------
    return templates.TemplateResponse(
        request=request,
        name="inventory_management/inventory_costing.html",
        context={
            "rows": inventory_rows,
            "from_date": from_date,
            "to_date": to_date
        }
    )