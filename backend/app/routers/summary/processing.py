from fastapi import APIRouter, Request, Depends, Query
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import distinct, func, and_
from typing import Optional
import re
from datetime import date
from app.utils.timezone import ist_now
from collections import defaultdict

from app.database import get_db
# Models Core Framework Imports
from app.database.models.processing import (
    GateEntry, RawMaterialPurchasing, DeHeading, 
    Peeling, Soaking, Grading, Production
)
from app.database.models.reprocess import Reprocess 
# 🔥 PRODUCTION DB SOURCE ENFORCED: stock_entry MODEL ACTIVE
from app.database.models.inventory_management import stock_entry
from app.database.models.criteria import varieties as VarietyTable, HOSO_HLSO_Yields

# Floor Balance Service Component
from app.services.floor_balance import get_floor_balance
from app.utils.cancel_math import active_number, signed_number

router = APIRouter(tags=["SUMMARY"])
templates = Jinja2Templates(directory="app/templates")


# ============================================================================
# 🟢 HELPER 1: CONVERT ANY SEMI-FINISHED PRODUCT QUANTITY TO HOSO EQUIVALENT
# ============================================================================
def get_hoso_equivalent_qty(db: Session, company_id: str, qty: float, variety: str, count: str, species: str, glaze: str = None):
    if not qty or qty <= 0:
        return 0.0

    qty = float(qty)
    variety_upper = str(variety or "").upper()

    # 1. REMOVE GLAZE (Applicable mainly for Reprocess Outputs with 10%, 20%, etc.)
    if glaze:
        try:
            g = str(glaze).replace("%", "").strip()
            if g.isdigit():
                glaze_pct = float(g)
                if glaze_pct > 0:
                    qty = qty * ((100 - glaze_pct) / 100)
        except:
            pass

    # 2. FETCH HLSO YIELD FROM DATABASE
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

    # 3. FETCH PEELING YIELD FROM VARIETY TABLE
    peeling_yield = 1.0
    var_obj = db.query(VarietyTable).filter(
        VarietyTable.company_id == company_id, 
        VarietyTable.variety_name == variety
    ).first()
    if var_obj and var_obj.peeling_yield:
        peeling_yield = float(var_obj.peeling_yield) / 100

    # 4. 🟢 FIXED REVERSED MATH SYSTEM (DIVIDE BY FRACTIONS TO SCALE UP TO HOSO)
    if "HOSO" in variety_upper:
        return round(qty, 4)
    elif "HLSO" in variety_upper:
        return round(qty / hlso_yield if hlso_yield > 0 else qty, 4)
    else:
        # PD, PUD, PTO values scaled up sequentially (e.g. 230 kg turns into ~400 kg)
        denominator = hlso_yield * peeling_yield
        return round(qty / denominator if denominator > 0 else qty, 4)


# ============================================================================
# 🟢 HELPER 2: VALUE CALCULATION USING REFERENCE AVG RATE SYSTEM
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
        
        # Batch context lookup elements aggregate calculation path
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

    # True weight multiplication logic setup
    fb_hoso_qty = get_hoso_equivalent_qty(db, company_id, qty, variety, count, species, glaze)
    final_value = round(fb_hoso_qty * avg_rate, 2)

    return final_value


# ============================================================================
# MAIN ROUTER ENDPOINT (PROCESSING SUMMARY)
# ============================================================================
@router.get("/summary/processing", response_class=HTMLResponse)
async def get_processing_summary(
    request: Request,
    fy: str = Query(None),
    production_for: str = Query(None),
    prod_type: str = Query(None),
    batch: str = Query(None),
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/auth/login", status_code=303)
    
    companies = []
    companies_query = db.query(distinct(GateEntry.production_for)).filter(GateEntry.company_id == company_code).all()
    companies = [c[0] for c in companies_query if c[0]]

    # Financial Years Generator Loop Logic
    all_dates = db.query(GateEntry.date).filter(GateEntry.company_id == company_code, GateEntry.date != None).all()
    fy_set = set()
    for d_tuple in all_dates:
        d = d_tuple[0]
        current_year = d.year
        if d.month >= 4:
            fy_str = f"{current_year}-{str(current_year + 1)[2:]}"
        else:
            fy_str = f"{current_year - 1}-{str(current_year)[2:]}"
        fy_set.add(fy_str)
    financial_years = sorted(list(fy_set), reverse=True)

    batches = []
    floor_balance_list = []
    
    card = {
        "supplier_name": "N/A", "purchasing_location": "N/A", "receiving_center": "N/A",
        "vehicle_number": "N/A", "total_boxes": 0, "challan_number": "N/A",
        "gate_pass_number": "N/A", "rmp_qty": 0, "rmp_amount": 0,
        "reprocess_qty": 0, "reprocess_amount": 0, "deheading_qty": 0,
        "deheading_amount": 0, "peeling_qty": 0, "peeling_amount": 0,
        "soaking_qty": 0, "chemical_qty": 0, "salt_qty": 0,
        "production_qty": 0, "stock_qty": 0, "stock_amount": 0,
        "floor_qty": 0, "floor_amount": 0, "grading_qty": 0
    }
    
    rows = {
        "gate": [], "rmp": [], "deheading": [], "peeling": [], 
        "soaking": [], "production": [], "stock": [], "reprocess": [],
        "grading_details": [], "grading_summary": []
    }
    subtotals = {}

    if fy and production_for and prod_type:
        try:
            start_year = int(fy.split('-')[0])
            start_date = date(start_year, 4, 1)
            end_date = date(start_year + 1, 3, 31)
        except ValueError:
            start_date, end_date = None, None

        if start_date and end_date:
            if prod_type == "RMP":
                batch_query = db.query(distinct(GateEntry.batch_number)).filter(
                    GateEntry.company_id == company_code,
                    func.trim(GateEntry.production_for) == func.trim(production_for),
                    GateEntry.date >= start_date,
                    GateEntry.date <= end_date
                ).all()
            else:
                batch_query = db.query(distinct(Reprocess.new_batch_id)).filter(
                    Reprocess.company_id == company_code,
                    func.trim(Reprocess.production_for) == func.trim(production_for),
                    Reprocess.date >= start_date,
                    Reprocess.date <= end_date
                ).all()
            batches = sorted([b[0] for b in batch_query if b[0]])

    if fy and production_for and prod_type and batch:
        # Core DB Pipeline Fetch Data Blocks
        rows["deheading"] = db.query(DeHeading).filter(DeHeading.batch_number==batch, DeHeading.company_id==company_code).all()
        rows["peeling"] = db.query(Peeling).filter(Peeling.batch_number==batch, Peeling.company_id==company_code).all()
        rows["soaking"] = db.query(Soaking).filter(Soaking.batch_number==batch, Soaking.company_id==company_code).all()
        rows["production"] = db.query(Production).filter(Production.batch_number==batch, Production.company_id==company_code).all()

        # Recalculate deheading and peeling rows on the fly to ensure diff_qty and diff_percent are populated correctly
        deh_targets = db.query(HOSO_HLSO_Yields).filter(HOSO_HLSO_Yields.company_id == company_code).all()
        deh_target_map = {(ty.species, str(ty.hoso_count)): float(ty.hlso_yield_pct or 0) for ty in deh_targets}

        for r in rows["deheading"]:
            hoso = float(r.hoso_qty or 0)
            hlso = float(r.hlso_qty or 0)
            target_y = deh_target_map.get((r.species, str(r.hoso_count)), 0.0)
            r.target_yield_percent = target_y
            r.yield_percent = round((hlso / hoso * 100), 2) if hoso > 0 else 0
            if target_y > 0:
                expected_hoso = hlso / (target_y / 100)
                r.diff_qty = round(expected_hoso - hoso, 2)
                r.diff_percent = round(r.yield_percent - target_y, 2)
            else:
                r.diff_qty = 0.0
                r.diff_percent = 0.0

        var_list = db.query(VarietyTable).filter(VarietyTable.company_id == company_code).all()
        peel_target_map = {v.variety_name: float(v.peeling_yield or 0) for v in var_list}
        var_map = {str(v.variety_name).strip().upper(): float(v.soaking_yield or 0) for v in var_list}

        for r in rows["peeling"]:
            h_qty = float(r.hlso_qty or 0)
            p_qty = float(r.peeled_qty or 0)
            target_y = peel_target_map.get(r.variety_name, 0.0)
            r.target_yield_percent = target_y
            r.yield_percent = round((p_qty / h_qty * 100), 2) if h_qty > 0 else 0
            if target_y > 0:
                expected_peeled = h_qty * (target_y / 100)
                r.diff_qty = round(p_qty - expected_peeled, 2)
                r.diff_percent = round(r.yield_percent - target_y, 2)
            else:
                r.diff_qty = 0.0
                r.diff_percent = 0.0
        
        grading_records = db.query(Grading).filter(Grading.batch_number == batch, Grading.company_id == company_code).all()
        rows["grading_details"] = grading_records
        card["grading_qty"] = sum(signed_number(g, g.quantity) for g in grading_records)

        if prod_type == "RMP":
            rows["gate"] = db.query(GateEntry).filter(GateEntry.batch_number==batch, GateEntry.company_id==company_code).all()
            rows["rmp"] = db.query(RawMaterialPurchasing).filter(RawMaterialPurchasing.batch_number==batch, RawMaterialPurchasing.company_id==company_code).all()
            
            if rows["gate"]:
                g = rows["gate"][0]
                card.update({"supplier_name": g.supplier_name, "purchasing_location": g.purchasing_location, "receiving_center": g.receiving_center, "vehicle_number": g.vehicle_number, "challan_number": g.challan_number, "gate_pass_number": g.gate_pass_number, "total_boxes": sum(int(row.no_of_material_boxes or 0) for row in rows["gate"])})
        else: 
            rows["reprocess"] = db.query(Reprocess).filter(Reprocess.new_batch_id==batch, Reprocess.company_id==company_code).all()
            if rows["reprocess"]:
                rep = rows["reprocess"][0]
                card.update({"supplier_name": "INTERNAL REPROCESS", "purchasing_location": rep.location, "receiving_center": rep.production_at, "total_boxes": sum(int(row.no_of_mc or 0) for row in rows["reprocess"])})

        # --- GRADING SUMMARY COMPUTE ENGINE ---
        yield_map = {
            (r.species, str(r.hoso_count)): float(r.hlso_yield_pct or 0) / 100
            for r in db.query(HOSO_HLSO_Yields).filter(HOSO_HLSO_Yields.company_id == company_code).all()
        }

        deheading_hoso_map = defaultdict(float)
        for r in rows["deheading"]:
            deheading_hoso_map[(r.batch_number, r.species, str(r.hoso_count))] += signed_number(r, r.hoso_qty)

        grouped = defaultdict(list)
        for r in grading_records:
            grouped[(r.batch_number, r.species, str(r.hoso_count), r.variety_name)].append(r)

        grading_summary = []
        for (batch_no, species, hoso_count, variety), items in grouped.items():
            graded_qty_sum = sum(signed_number(i, i.quantity) for i in items)
            base = sum(float(i.graded_count or 0) * signed_number(i, i.quantity) for i in items)
            yield_factor = yield_map.get((species, hoso_count), 0)

            if variety == "HOSO":
                actual_hoso_qty = graded_qty_sum
            elif variety == "HLSO":
                actual_hoso_qty = deheading_hoso_map.get((batch_no, species, hoso_count), 0)
            else:
                actual_hoso_qty = 0

            workout = (base / graded_qty_sum if graded_qty_sum > 0 else 0)
            if variety == "HLSO":
                workout = workout * 2.2 * yield_factor

            yield_pct = (graded_qty_sum / actual_hoso_qty * 100 if actual_hoso_qty > 0 else 0)
            grading_hoso_qty = (graded_qty_sum / yield_factor if variety == "HLSO" and yield_factor > 0 else graded_qty_sum)
            diff_kg = (grading_hoso_qty - actual_hoso_qty if variety == "HLSO" else 0)
            diff_pct = (diff_kg / actual_hoso_qty * 100 if actual_hoso_qty > 0 else 0)

            grading_summary.append({
                "species": species, "hoso_count": hoso_count, "variety": variety,
                "hoso_qty": round(actual_hoso_qty, 2), "graded_qty": round(graded_qty_sum, 2),
                "workout_count": round(workout, 2), "yield_pct": round(yield_pct, 2),
                "grading_hoso_qty": round(grading_hoso_qty, 2), "weight_diff_kg": round(diff_kg, 2),
                "weight_diff_pct": round(diff_pct, 2)
            })
        rows["grading_summary"] = grading_summary

        # --- PRODUCTION SUMMARY SUBTOTAL TRACKS ---
        for p in rows["production"]:
            v_name, s_name, b_num = str(p.variety_name or "").strip(), str(p.species or "").strip(), str(p.batch_number or "").strip()
            key = (str(p.production_for or "").strip(), str(p.production_at or "").strip(), s_name, v_name, b_num)
            
            if key not in subtotals:
                target_yield = var_map.get(v_name.upper(), 0.0)
                soaking_in = sum(
                    signed_number(s, s.in_qty)
                    for s in rows["soaking"]
                    if str(s.batch_number or "").strip() == b_num
                    and str(s.variety_name or "").strip() == v_name
                    and str(s.species or "").strip().upper() == s_name.upper()
                )
                subtotals[key] = {"prod_qty": 0.0, "target_yield": target_yield, "soaking_in": float(soaking_in), "actual_yield": 0.0, "diff_yield_perc": 0.0, "diff_qty": 0.0}
            subtotals[key]["prod_qty"] += signed_number(p, p.production_qty)

        for key in subtotals:
            s = subtotals[key]
            if s["soaking_in"] > 0:
                s["actual_yield"] = round((s["prod_qty"] / s["soaking_in"]) * 100, 2)
                s["diff_yield_perc"] = round(s["actual_yield"] - s["target_yield"], 2)
                expected_qty = (s["soaking_in"] * s["target_yield"]) / 100
                s["diff_qty"] = round(s["prod_qty"] - expected_qty, 2)

        # 🔥 DIRECT SELECTION FROM stock_entry WITH NO BACKEND RUNTIME CALCULATIONS
        rows["stock"] = db.query(stock_entry).filter(
            stock_entry.batch_number == batch, 
            stock_entry.company_id == company_code,
            stock_entry.cargo_movement_type == 'IN'
        ).all()
        
        for r in rows["stock"]:
            r.product_kg_value = float(r.product_kg_value or 0.0)
            r.inventory_value = float(r.inventory_value or 0.0)

        # ============================================================================
        # 🟢 CORRECTED DATA COMBOS GENERATOR (PREVENTS DATA LOSS ACROSS SPECIES)
        # ============================================================================
        combos = set()
        
        # 1. RMP Items Pool Lookups
        for r in rows["rmp"]:
            if r.batch_number:
                combos.add((r.batch_number, r.count, r.species, r.variety_name, r.production_for, r.peeling_at or "Floor", "RMP", None))

        # 2. De-heading output HLSO rows.
        for r in rows["deheading"]:
            if r.batch_number:
                combos.add((r.batch_number, r.hoso_count, r.species, "HLSO", r.production_for, r.peeling_at or "Floor", "RMP", None))

        # 3. Grading Record Items Lookups (Using exact reference layouts map)
        for r in grading_records:
            if r.batch_number:
                combos.add((r.batch_number, r.graded_count, r.species, r.variety_name, r.production_for, r.peeling_at or "Floor", "RMP", None))

        # 4. Peeling Items Lookups
        for r in rows["peeling"]:
            if r.batch_number:
                combos.add((r.batch_number, r.hlso_count, r.species, r.variety_name, r.production_for, r.peeling_at or "Floor", "RMP", None))

        # 5. Reprocess Items Lookups
        for r in rows["reprocess"]:
            if r.new_batch_id:
                glaze_val = getattr(r, 'glaze', None)
                combos.add((r.new_batch_id, r.grade, r.species, r.variety, r.production_for, r.production_at or "Floor", "REPROCESS", glaze_val))

        total_floor_val = 0.0
        for b_id, c_val, s_val, v_name, p_for, loc, s_type, glaze_info in combos:
            
            avail = get_floor_balance(
                db=db, company_id=company_code, location=loc or "Floor", batch=b_id, 
                count=str(c_val).strip() if c_val else None, species=s_val, 
                variety=v_name, production_for=p_for, source_type=s_type
            )
            
            avail = round(avail, 2) if avail else 0.0
            
            # SHOW ONLY VALID BALANCES (> 0.01)
            if avail > 0.01:
                val = calculate_balance_value(
                    db=db, company_id=company_code, batch=b_id, variety=v_name, 
                    count=c_val, species=s_val, qty=avail, source_type=s_type, glaze=glaze_info
                )
                total_floor_val += val
                
                floor_balance_list.append({
                    "peeling_at": loc, "count": c_val or "N/A", "species": s_val or "N/A", 
                    "variety": v_name, "available_qty": avail, "value": val,
                    "production_for": p_for if p_for and p_for != "N/A" else "General Stock"
                })

        # Final Summary Card Mapping Array Data
        card["rmp_qty"] = sum(active_number(r, r.received_qty) for r in rows["rmp"])
        card["rmp_amount"] = sum(active_number(r, r.amount) for r in rows["rmp"])
        card["reprocess_qty"] = sum(float(r.in_qty or 0) for r in rows["reprocess"])
        card["reprocess_amount"] = sum(float(r.inventory_value or 0) for r in rows["reprocess"])
        card["deheading_qty"] = sum(signed_number(d, d.hlso_qty) for d in rows["deheading"])
        card["deheading_amount"] = sum(signed_number(d, d.amount) for d in rows["deheading"])
        card["peeling_qty"] = sum(signed_number(p, p.peeled_qty) for p in rows["peeling"])
        card["peeling_amount"] = sum(signed_number(p, p.amount) for p in rows["peeling"])
        card["soaking_qty"] = sum(signed_number(s, s.in_qty) for s in rows["soaking"])
        card["chemical_qty"] = sum(signed_number(s, s.chemical_qty) for s in rows["soaking"])
        card["salt_qty"] = sum(signed_number(s, s.salt_qty) for s in rows["soaking"])
        card["production_qty"] = sum(signed_number(pr, pr.production_qty) for pr in rows["production"])
        card["stock_qty"] = sum(float(st.quantity or 0) for st in rows["stock"])
        card["stock_amount"] = sum(float(st.inventory_value or 0) for st in rows["stock"])
        card["floor_qty"] = round(sum(f["available_qty"] for f in floor_balance_list), 2)
        card["floor_amount"] = round(total_floor_val, 2)

    if request.query_params.get("format") == "json":
        from fastapi.responses import JSONResponse
        from fastapi.encoders import jsonable_encoder
        serialized_rows = {}
        for key, val in rows.items():
            if isinstance(val, list):
                serialized_list = []
                for item in val:
                    if hasattr(item, "__table__"):
                        d = {col.name: getattr(item, col.name) for col in item.__table__.columns}
                        for attr in ["target_yield_percent", "yield_percent", "diff_qty", "diff_percent", "product_kg_value", "inventory_value"]:
                            if hasattr(item, attr):
                                d[attr] = getattr(item, attr)
                        serialized_list.append(d)
                    else:
                        serialized_list.append(item)
                serialized_rows[key] = serialized_list
            else:
                serialized_rows[key] = val
                
        str_subtotals = {}
        for k, v in subtotals.items():
            str_key = "|".join(str(x) for x in k)
            str_subtotals[str_key] = v
            
        json_context = {
            "financial_years": financial_years,
            "selected_fy": fy,
            "companies": companies,
            "batches": batches,
            "selected_company": production_for,
            "selected_prod_type": prod_type,
            "selected_batch": batch,
            "rows": serialized_rows,
            "card": card,
            "hoso_floor_balance": floor_balance_list,
            "subtotals": str_subtotals
        }
        return JSONResponse(jsonable_encoder(json_context))

    return templates.TemplateResponse(
        request=request, name="summary/processing_summary.html", 
        context={
            "financial_years": financial_years,
            "selected_fy": fy,
            "companies": companies, 
            "batches": batches, 
            "selected_company": production_for, 
            "selected_prod_type": prod_type, 
            "selected_batch": batch, 
            "rows": rows, 
            "card": card, 
            "hoso_floor_balance": floor_balance_list, 
            "subtotals": subtotals
        }
    )
