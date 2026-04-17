from fastapi import APIRouter, Request, Depends, Query
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import distinct, func
from typing import Optional
from app.database import get_db

# Models Imports
from app.database.models.processing import (
    GateEntry, RawMaterialPurchasing, DeHeading, 
    Peeling, Soaking, Grading, Production
)
from app.database.models.reprocess import Reprocess 
from app.database.models.inventory_management import stock_entry

# Floor Balance Service
from app.services.floor_balance import get_floor_balance

router = APIRouter(tags=["SUMMARY"])
templates = Jinja2Templates(directory="app/templates")

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
        
        # Stock Entry - Cargo Movement 'IN' represents current stock from this batch
        rows["stock"] = db.query(stock_entry).filter(
            stock_entry.batch_number==batch, 
            stock_entry.company_id==company_code,
            stock_entry.cargo_movement_type == 'IN'
        ).all()

        combos = set() # To calculate floor balance for each unique combo

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
            
            # Grading Quantity (Part of RMP flow)
            grad_items = db.query(
                Grading.graded_count, Grading.species, Grading.peeling_at, 
                Grading.variety_name, Grading.quantity 
            ).filter(Grading.batch_number==batch, Grading.company_id==company_code).all()
            
            card["grading_qty"] = sum(float(g[4] or 0) for g in grad_items)
            for g in grad_items: 
                combos.add((g[0], g[1], g[2], g[3], "RMP"))
        
        # Flow B: Reprocessing
        else: 
            rows["reprocess"] = db.query(Reprocess).filter(Reprocess.new_batch_id==batch, Reprocess.company_id==company_code).all()
            
            if rows["reprocess"]:
                rep = rows["reprocess"][0]
                card.update({
                    "supplier_name": "INTERNAL REPROCESS",
                    "purchasing_location": rep.location,
                    "receiving_center": rep.production_at,
                    "total_boxes": sum(int(row.no_of_mc or 0) for row in rows["reprocess"])
                })
            
            card["reprocess_qty"] = sum(float(r.in_qty or 0) for r in rows["reprocess"])
            card["reprocess_amount"] = sum(float(r.inventory_value or 0) for r in rows["reprocess"])
            
            for r in rows["reprocess"]: 
                combos.add((r.grade, r.species, r.production_at, r.variety, "REPROCESS"))

        # Common Calculations for Card
        card["deheading_qty"] = sum(float(d.hlso_qty or 0) for d in rows["deheading"])
        card["deheading_amount"] = sum(float(d.amount or 0) for d in rows["deheading"])
        card["peeling_qty"] = sum(float(p.peeled_qty or 0) for p in rows["peeling"])
        card["peeling_amount"] = sum(float(p.amount or 0) for p in rows["peeling"])
        card["soaking_qty"] = sum(float(s.in_qty or 0) for s in rows["soaking"])
        card["chemical_qty"] = sum(float(s.chemical_qty or 0) for s in rows["soaking"])
        card["salt_qty"] = sum(float(s.salt_qty or 0) for s in rows["soaking"])
        card["production_qty"] = sum(float(pr.production_qty or 0) for pr in rows["production"])
        
        # Stock Summary Calculation
        card["stock_qty"] = sum(float(st.quantity or 0) for st in rows["stock"])
        card["stock_amount"] = sum(float(st.inventory_value or 0) for st in rows["stock"])

        # Floor Balance Logic
        total_floor = 0
        for c_val, s_val, loc, v_name, s_type in combos:
            if not loc or not v_name: continue
            avail = get_floor_balance(db, company_code, loc, batch, str(c_val).strip(), s_val, v_name, source_type=s_type)
            if avail > 0.01:
                total_floor += avail
                floor_balance_list.append({
                    "peeling_at": loc, "count": c_val or "N/A", "species": s_val or "N/A",
                    "variety": v_name, "available_qty": round(avail, 2)
                })
        card["floor_qty"] = round(total_floor, 2)

    # 4. Return Template with Context
 # 4. Return Template with Context
    return templates.TemplateResponse(
        "summary/processing_summary.html",  # ఇక్కడ name= తీసేయండి
        {
            "request": request,             # ఇక్కడ context= తీసేసి డైరెక్ట్ డిక్షనరీ ఇవ్వండి
            "companies": companies,
            "batches": batches,
            "selected_company": production_for,
            "selected_prod_type": prod_type,
            "selected_batch": batch,
            "rows": rows,
            "card": card,
            "hoso_floor_balance": floor_balance_list
        }
    )