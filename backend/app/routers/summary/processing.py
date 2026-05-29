from fastapi import APIRouter, Request, Depends, Query
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import distinct, func, and_
from typing import Optional
import re
from datetime import date
from collections import defaultdict

from app.database import get_db
# Models Imports
from app.database.models.processing import (
    GateEntry, RawMaterialPurchasing, DeHeading, 
    Peeling, Soaking, Grading, Production
)
from app.database.models.reprocess import Reprocess 
from app.database.models.inventory_management import stock_entry
from app.database.models.criteria import varieties as VarietyTable, HOSO_HLSO_Yields

# Floor Balance Service
from app.services.floor_balance import get_floor_balance

router = APIRouter(tags=["SUMMARY"])
templates = Jinja2Templates(directory="app/templates")

# --- Helper Functions for Costing ---
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
    v, f, p = str(variety).upper(), str(freezer).upper(), str(purpose).upper()
    if "REGLAZE" in p: return 15
    if any(x in f for x in ["IQF", "BRINE"]):
        return 75 if "COOK" in v else 60
    if any(x in f for x in ["BLOCK", "BLAST"]):
        return 65 if "COOK" in v else 50
    return 5

# ============================================================
# HELPER: CALCULATE VALUE BASED ON REVERSE YIELDS (DIVISION)
# ============================================================
def calculate_balance_value(db: Session, company_id: str, batch: str, variety: str, count: str, species: str, qty: float, avg_rate: float):
    if not variety or "HOSO" in variety.upper():
        return round(qty * avg_rate, 2)

    var_obj = db.query(VarietyTable).filter(
        VarietyTable.company_id == company_id,
        VarietyTable.variety_name == variety
    ).first()
    
    p_y = (float(var_obj.peeling_yield) / 100) if var_obj and var_obj.peeling_yield else 1.0
    s_y = (float(var_obj.soaking_yield) / 100) if var_obj and var_obj.soaking_yield else 1.0

    h_y = 1.0
    if count:
        try:
            nums = re.findall(r'\d+', str(count))
            if nums:
                last_num = int(nums[-1])
                match_count = last_num - 1 
                hlso_m = db.query(HOSO_HLSO_Yields).filter(
                    HOSO_HLSO_Yields.company_id == company_code,
                    HOSO_HLSO_Yields.hoso_count == match_count,
                    HOSO_HLSO_Yields.species == species
                ).first()
                if hlso_m:
                    h_y = float(hlso_m.hlso_yield_pct or 100) / 100
        except:
            h_y = 1.0

    denominator = p_y * s_y * h_y
    effective_raw_qty = qty / denominator if denominator > 0 else qty
    
    return round(effective_raw_qty * avg_rate, 2)

@router.get("/summary/processing", response_class=HTMLResponse)
async def get_processing_summary(
    request: Request,
    fy: str = Query(None),  # FY Filter Param
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

    # --- DYNAMIC FINANCIAL YEARS GENERATION FROM DATABASE ---
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

    # Strict Rule: FY మరియు మిగతా ప్రైమరీ ఫిల్టర్స్ సెలెక్ట్ చేస్తేనే బాచ్ డ్రాప్‌డౌన్ లోడ్ అవుతుంది
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

    # ఒకవేళ బాచ్ కూడా సెలెక్ట్ అయ్యి ఉంటేనే పూర్తి నివేదిక టేబుల్స్ లోడ్ అవుతాయి
    if fy and production_for and prod_type and batch:
        # Load Tables
        rows["deheading"] = db.query(DeHeading).filter(DeHeading.batch_number==batch, DeHeading.company_id==company_code).all()
        rows["peeling"] = db.query(Peeling).filter(Peeling.batch_number==batch, Peeling.company_id==company_code).all()
        rows["soaking"] = db.query(Soaking).filter(Soaking.batch_number==batch, Soaking.company_id==company_code).all()
        rows["production"] = db.query(Production).filter(Production.batch_number==batch, Production.company_id==company_code).all()
        
        # --- GRADING DETAILS DATA FETCH ---
        grading_records = db.query(Grading).filter(
            Grading.batch_number == batch, 
            Grading.company_id == company_code
        ).all()
        rows["grading_details"] = grading_records
        card["grading_qty"] = sum(float(g.quantity or 0) for g in grading_records)

        # Pre-fetch Base tables depending on type to use in aggregation
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

        # ============================================================
        # GRADING REPORT LOGIC (YIELD MAP & DEHEADING MAP)
        # ============================================================
        yield_map = {
            (r.species, str(r.hoso_count)): float(r.hlso_yield_pct or 0) / 100
            for r in db.query(HOSO_HLSO_Yields)
            .filter(HOSO_HLSO_Yields.company_id == company_code)
            .all()
        }

        deheading_hoso_map = defaultdict(float)
        for r in rows["deheading"]:
            deheading_hoso_map[
                (r.batch_number, r.species, str(r.hoso_count))
            ] += float(r.hoso_qty or 0)

        grouped = defaultdict(list)
        for r in grading_records:
            grouped[
                (
                    r.batch_number,
                    r.species,
                    str(r.hoso_count),
                    r.variety_name
                )
            ].append(r)

        grading_summary = []
        for (batch_no, species, hoso_count, variety), items in grouped.items():
            graded_qty_sum = sum(float(i.quantity or 0) for i in items)
            base = sum(float(i.graded_count or 0) * float(i.quantity or 0) for i in items)

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

            grading_hoso_qty = (
                graded_qty_sum / yield_factor
                if variety == "HLSO" and yield_factor > 0
                else graded_qty_sum
            )

            diff_kg = (grading_hoso_qty - actual_hoso_qty if variety == "HLSO" else 0)
            diff_pct = (diff_kg / actual_hoso_qty * 100 if actual_hoso_qty > 0 else 0)

            grading_summary.append({
                "species": species,
                "hoso_count": hoso_count,
                "variety": variety,
                "hoso_qty": round(actual_hoso_qty, 2),
                "graded_qty": round(graded_qty_sum, 2),
                "workout_count": round(workout, 2),
                "yield_pct": round(yield_pct, 2),
                "grading_hoso_qty": round(grading_hoso_qty, 2),
                "weight_diff_kg": round(diff_kg, 2),
                "weight_diff_pct": round(diff_pct, 2)
            })

        rows["grading_summary"] = grading_summary

        # --- PRODUCTION SUBTOTALS ---
        for p in rows["production"]:
            v_name, s_name, b_num = str(p.variety_name or "").strip(), str(p.species or "").strip(), str(p.batch_number or "").strip()
            key = (str(p.production_for or "").strip(), str(p.production_at or "").strip(), s_name, v_name, b_num)
            
            if key not in subtotals:
                var_data = db.query(VarietyTable).filter(VarietyTable.company_id == company_code, func.trim(VarietyTable.variety_name) == v_name).first()
                target_yield = float(var_data.soaking_yield or 0) if var_data else 0.0
                soaking_in = db.query(func.sum(Soaking.in_qty - Soaking.rejection_qty)).filter(Soaking.company_id == company_code, Soaking.batch_number == b_num, func.trim(Soaking.variety_name) == v_name, func.trim(Soaking.species) == s_name).scalar() or 0.0
                subtotals[key] = {"prod_qty": 0.0, "target_yield": target_yield, "soaking_in": float(soaking_in), "actual_yield": 0.0, "diff_yield_perc": 0.0, "diff_qty": 0.0}
            subtotals[key]["prod_qty"] += float(p.production_qty or 0)

        for key in subtotals:
            s = subtotals[key]
            if s["soaking_in"] > 0:
                s["actual_yield"] = round((s["prod_qty"] / s["soaking_in"]) * 100, 2)
                s["diff_yield_perc"] = round(s["actual_yield"] - s["target_yield"], 2)
                expected_qty = (s["soaking_in"] * s["target_yield"]) / 100
                s["diff_qty"] = round(s["prod_qty"] - expected_qty, 2)

        rows["stock"] = db.query(stock_entry).filter(stock_entry.batch_number==batch, stock_entry.company_id==company_code, stock_entry.cargo_movement_type == 'IN').all()
        
        # --- FLOOR BALANCE COMBOS ---
        combos = set()
        v_records = {v.variety_name.lower(): v for v in db.query(VarietyTable).filter(VarietyTable.company_id == company_code).all()}

        if prod_type == "RMP":
            for r in rows["rmp"]: 
                combos.add((r.batch_number, r.count, r.species, r.variety_name, production_for, r.peeling_at or "Floor", "RMP"))
            for g in grading_records: 
                combos.add((g.batch_number, g.hoso_count, g.species, g.variety_name, production_for, g.peeling_at or "Floor", "RMP"))
            for p in rows["peeling"]:
                combos.add((p.batch_number, p.hlso_count, p.species, p.variety_name, production_for, p.peeling_at or "Floor", "RMP"))
        else: 
            for r in rows["reprocess"]: 
                combos.add((r.new_batch_id, r.grade, r.species, r.variety, production_for, r.production_at or "Floor", "REPROCESS"))

        # --- FLOOR VALUE & RMP AVG ---
        rmp_stats = db.query(func.sum(RawMaterialPurchasing.received_qty), func.sum(RawMaterialPurchasing.amount)).filter(RawMaterialPurchasing.batch_number == batch, RawMaterialPurchasing.company_id == company_code).first()
        rmp_avg = float(rmp_stats[1] / rmp_stats[0]) if rmp_stats and rmp_stats[0] and rmp_stats[0] > 0 else 0.0
        
        total_floor_val = 0
        for b_id, c_val, s_val, v_name, p_for, loc, s_type in combos:
            avail = get_floor_balance(db, company_code, loc or "Floor", b_id, str(c_val).strip() if c_val else None, s_val, v_name, production_for=p_for, source_type=s_type)
            if avail > 0.01:
                val = calculate_balance_value(db, company_code, b_id, v_name, c_val, s_val, avail, rmp_avg)
                total_floor_val += val
                floor_balance_list.append({
                    "peeling_at": loc, "count": c_val or "N/A", "species": s_val or "N/A", 
                    "variety": v_name, "available_qty": round(avail, 2), "value": val
                })

        # --- LIVE INVENTORY COSTING ---
        total_rmp_amt = sum(float(r.amount or 0) for r in rows["rmp"])
        residual_amt = float(total_rmp_amt) - float(total_floor_val)
        total_hoso_weight = 0

        for r in rows["stock"]:
            if any(x in str(r.grade).upper() for x in ["BKN", "DC"]):
                r.product_kg_value, r.inventory_value = 280.0, round(float(r.quantity or 0) * 280.0, 2)
                residual_amt -= r.inventory_value
                continue
            
            v_m = v_records.get(str(r.variety or "").lower())
            p_y, s_y = (float(v_m.peeling_yield or 100)/100 if v_m else 1.0), (float(v_m.soaking_yield or 100)/100 if v_m else 1.0)
            
            try:
                l_num = float(re.findall(r'\d+', str(r.grade).split('/')[-1])[0])
                h_count = l_num / p_y / s_y
            except: h_count = 0
                
            hlso_m = db.query(HOSO_HLSO_Yields).filter(HOSO_HLSO_Yields.company_id == company_code, HOSO_HLSO_Yields.hoso_count == round(h_count)).first()
            h_h_y = (hlso_m.hlso_yield_pct / 100) if hlso_m else 1.0
            item_yield = (p_y * s_y * h_h_y) if "HOSO" not in str(r.variety).upper() else 0.98
            
            r._final_norm_factor = item_yield * get_glaze_factor(r.glaze) * (0.85 if "G2" in str(r.grade).upper() else 1.0)
            r.rm_eq_weight = float(r.quantity or 0) / r._final_norm_factor if r._final_norm_factor > 0 else 0
            total_hoso_weight += r.rm_eq_weight

        avg_rm_rate = residual_amt / total_hoso_weight if total_hoso_weight > 0 else 0
        for r in rows["stock"]:
            if not any(x in str(r.grade).upper() for x in ["BKN", "DC"]):
                base_rate = avg_rm_rate / r._final_norm_factor if r._final_norm_factor > 0 else 0
                r.product_kg_value = round(base_rate + get_process_addon(r.variety, r.freezer, r.purpose or "N/A"), 2)
                r.inventory_value = round(float(r.quantity or 0) * r.product_kg_value, 2)

        # Final Card Totals
        card["rmp_qty"] = sum(float(r.received_qty or 0) for r in rows["rmp"])
        card["rmp_amount"] = sum(float(r.amount or 0) for r in rows["rmp"])
        card["reprocess_qty"] = sum(float(r.in_qty or 0) for r in rows["reprocess"])
        card["reprocess_amount"] = sum(float(r.inventory_value or 0) for r in rows["reprocess"])
        card["deheading_qty"] = sum(float(d.hlso_qty or 0) for d in rows["deheading"])
        card["deheading_amount"] = sum(float(d.amount or 0) for d in rows["deheading"])
        card["peeling_qty"] = sum(float(p.peeled_qty or 0) for p in rows["peeling"])
        card["peeling_amount"] = sum(float(p.amount or 0) for p in rows["peeling"])
        card["soaking_qty"] = sum(float(s.in_qty or 0) for s in rows["soaking"])
        card["chemical_qty"] = sum(float(s.chemical_qty or 0) for s in rows["soaking"])
        card["salt_qty"] = sum(float(s.salt_qty or 0) for s in rows["soaking"])
        card["production_qty"] = sum(float(pr.production_qty or 0) for pr in rows["production"])
        card["stock_qty"] = sum(float(st.quantity or 0) for st in rows["stock"])
        card["stock_amount"] = sum(float(st.inventory_value or 0) for st in rows["stock"])
        card["floor_qty"] = round(sum(f["available_qty"] for f in floor_balance_list), 2)
        card["floor_amount"] = round(total_floor_val, 2)

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