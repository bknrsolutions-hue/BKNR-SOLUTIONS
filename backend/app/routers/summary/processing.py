from fastapi import APIRouter, Request, Depends, Query
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import distinct, func
from typing import Optional
import re
import logging

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

@router.get("/summary/processing", response_class=HTMLResponse)
async def get_processing_summary(
    request: Request,
    production_for: str = Query(None),
    prod_type: str = Query(None),
    batch: str = Query(None),
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")
    
    # 1. Company List for Filter
    companies = []
    if company_code:
        companies_query = db.query(distinct(GateEntry.production_for)).filter(
            GateEntry.company_id == company_code
        ).all()
        companies = [c[0] for c in companies_query if c[0]]

    batches = []
    floor_balance_list = []
    
    # Card Data with Default Values
    card = {
        "supplier_name": "N/A", "purchasing_location": "N/A", "receiving_center": "N/A",
        "vehicle_number": "N/A", "total_boxes": 0, "challan_number": "N/A",
        "gate_pass_number": "N/A", "rmp_qty": 0, "rmp_amount": 0,
        "reprocess_qty": 0, "reprocess_amount": 0, "deheading_qty": 0,
        "deheading_amount": 0, "peeling_qty": 0, "peeling_amount": 0,
        "soaking_qty": 0, "chemical_qty": 0, "salt_qty": 0,
        "production_qty": 0, "stock_qty": 0, "stock_amount": 0,
        "floor_qty": 0, "grading_qty": 0
    }
    
    rows = {
        "gate":[], "rmp":[], "deheading":[], "peeling":[], 
        "soaking":[], "production":[], "stock":[], "reprocess":[]
    }

    # 2. Load Batches based on Company & Production For
    if production_for and prod_type and company_code:
        if prod_type == "RMP":
            batch_query = db.query(distinct(GateEntry.batch_number)).filter(
                GateEntry.company_id == company_code,
                func.trim(GateEntry.production_for) == func.trim(production_for)
            ).all()
            batches = sorted([b[0] for b in batch_query if b[0]])
        else:
            batch_query = db.query(distinct(Reprocess.new_batch_id)).filter(
                Reprocess.company_id == company_code,
                func.trim(Reprocess.production_for) == func.trim(production_for)
            ).all()
            batches = sorted([b[0] for b in batch_query if b[0]])

    # 3. Fetch Full Data & Calculate Card Totals
    if batch and company_code:
        # Fetch All Core Process Tables
        rows["deheading"] = db.query(DeHeading).filter(DeHeading.batch_number==batch, DeHeading.company_id==company_code).all()
        rows["peeling"] = db.query(Peeling).filter(Peeling.batch_number==batch, Peeling.company_id==company_code).all()
        rows["soaking"] = db.query(Soaking).filter(Soaking.batch_number==batch, Soaking.company_id==company_code).all()
        rows["production"] = db.query(Production).filter(Production.batch_number==batch, Production.company_id==company_code).all()
        
        # Stock Entry
        rows["stock"] = db.query(stock_entry).filter(
            stock_entry.batch_number==batch, 
            stock_entry.company_id==company_code,
            stock_entry.cargo_movement_type == 'IN'
        ).all()

        combos = set()
        v_records = {v.variety_name.lower(): v for v in db.query(VarietyTable).filter(VarietyTable.company_id == company_code).all()}

        # Flow A: Raw Material (Fresh)
        if prod_type == "RMP":
            rows["gate"] = db.query(GateEntry).filter(GateEntry.batch_number==batch, GateEntry.company_id==company_code).all()
            rows["rmp"] = db.query(RawMaterialPurchasing).filter(RawMaterialPurchasing.batch_number==batch, RawMaterialPurchasing.company_id==company_code).all()
            
            if rows["gate"]:
                g = rows["gate"][0]
                card.update({
                    "supplier_name": g.supplier_name, "purchasing_location": g.purchasing_location,
                    "receiving_center": g.receiving_center, "vehicle_number": g.vehicle_number,
                    "challan_number": g.challan_number, "gate_pass_number": g.gate_pass_number,
                    "total_boxes": sum(int(row.no_of_material_boxes or 0) for row in rows["gate"])
                })

            card["rmp_qty"] = sum(float(r.received_qty or 0) for r in rows["rmp"])
            card["rmp_amount"] = sum(float(r.amount or 0) for r in rows["rmp"])
            
            for r in rows["rmp"]: 
                combos.add((r.count, r.species, r.peeling_at, r.variety_name, "RMP"))
            
            grad_items = db.query(Grading.graded_count, Grading.species, Grading.peeling_at, Grading.variety_name, Grading.quantity).filter(Grading.batch_number==batch, Grading.company_id==company_code).all()
            card["grading_qty"] = sum(float(g[4] or 0) for g in grad_items)
            for g in grad_items: 
                combos.add((g[0], g[1], g[2], g[3], "RMP"))
        
        # Flow B: Reprocessing
        else: 
            rows["reprocess"] = db.query(Reprocess).filter(Reprocess.new_batch_id==batch, Reprocess.company_id==company_code).all()
            if rows["reprocess"]:
                rep = rows["reprocess"][0]
                card.update({
                    "supplier_name": "INTERNAL REPROCESS", "purchasing_location": rep.location,
                    "receiving_center": rep.production_at,
                    "total_boxes": sum(int(row.no_of_mc or 0) for row in rows["reprocess"])
                })
            card["reprocess_qty"] = sum(float(r.in_qty or 0) for r in rows["reprocess"])
            card["reprocess_amount"] = sum(float(r.inventory_value or 0) for r in rows["reprocess"])
            for r in rows["reprocess"]: 
                combos.add((r.grade, r.species, r.production_at, r.variety, "REPROCESS"))

        # --- LIVE INVENTORY COSTING CALCULATION ---
        total_rmp_amt = sum(float(r.amount or 0) for r in rows["rmp"])
        total_floor_val = 0
        rmp_avg = db.query(func.avg(RawMaterialPurchasing.rate_per_kg)).filter(RawMaterialPurchasing.batch_number == batch, RawMaterialPurchasing.company_id == company_code).scalar() or 0

        for c_val, s_val, loc, v_name, s_type in combos:
            avail = get_floor_balance(db, company_code, loc or "Floor", batch, str(c_val).strip(), s_val, v_name, source_type=s_type)
            if avail > 0.01:
                total_floor_val += (float(avail) * float(rmp_avg))
                floor_balance_list.append({"peeling_at": loc, "count": c_val or "N/A", "species": s_val or "N/A", "variety": v_name, "available_qty": round(avail, 2)})

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
            hlso_m = db.query(HOSO_HLSO_Yields).filter(HOSO_HLSO_Yields.company_id == company_code, HOSO_HLSO_Yields.hlso_count == round(h_count)).first()
            h_h_y = (hlso_m.hlso_yield_pct / 100) if hlso_m else 1.0
            item_yield = (p_y * s_y * h_h_y) if "HOSO" not in str(r.variety).upper() else 0.98
            r._final_norm_factor = item_yield * get_glaze_factor(r.glaze) * (0.85 if "G2" in str(r.grade).upper() else 1.0)
            r.rm_eq_weight = float(r.quantity or 0) / r._final_norm_factor if r._final_norm_factor > 0 else 0
            total_hoso_weight += r.rm_eq_weight

        avg_rm_rate = residual_amt / total_hoso_weight if total_hoso_weight > 0 else 0
        for r in rows["stock"]:
            if not any(x in str(r.grade).upper() for x in ["BKN", "DC"]):
                base_rate = avg_rm_rate / r._final_norm_factor if r._final_norm_factor > 0 else 0
                addon = get_process_addon(r.variety, r.freezer, r.purpose or "N/A")
                r.product_kg_value = round(base_rate + addon, 2)
                r.inventory_value = round(float(r.quantity or 0) * r.product_kg_value, 2)

        # Common Calculations for Card
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

    return templates.TemplateResponse(
        name="summary/processing_summary.html", 
        context={
            "request": request, "companies": companies, "batches": batches,
            "selected_company": production_for, "selected_prod_type": prod_type, "selected_batch": batch,
            "rows": rows, "card": card, "hoso_floor_balance": floor_balance_list
        }
    )