import json
import re
from fastapi import APIRouter, Request, Depends, Form, Query
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime, date
from sqlalchemy import func, distinct

from app.database import get_db
from app.database.models.processing import Grading, Peeling
from app.database.models.criteria import (
    varieties, 
    contractors, 
    peeling_rates, 
    species, 
    peeling_at,
    packing_styles,
    production_for as ProductionForMaster
)
from app.database.models.inventory_management import pending_orders, stock_entry
from app.services.floor_balance import get_floor_balance 

router = APIRouter(tags=["PEELING"])
templates = Jinja2Templates(directory="app/templates")

# =====================================================
# DASHBOARD PAGE - [2026-01-03] COMPANY FILTERING
# =====================================================
@router.get("/peeling", response_class=HTMLResponse)
def show_peeling(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    company_id = request.session.get("company_code")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=303)

    # 1. HLSO FLOOR BALANCE CALCULATION
    combos = set()
    # Grading (In) records - Only Non-HOSO (HLSO)
    grading_data = db.query(
        Grading.batch_number, Grading.graded_count, Grading.species, 
        Grading.variety_name, Grading.production_for, Grading.peeling_at
    ).filter(Grading.company_id == company_id, ~Grading.variety_name.ilike("%HOSO%")).all()
    
    for g in grading_data:
        combos.add((g.batch_number, g.graded_count, g.species, g.variety_name, g.production_for, g.peeling_at))

    # Peeling (Out) records
    peeling_data = db.query(
        Peeling.batch_number, Peeling.hlso_count, Peeling.species, 
        Peeling.variety_name, Peeling.production_for, Peeling.peeling_at
    ).filter(Peeling.company_id == company_id, ~Peeling.variety_name.ilike("%HOSO%")).all()

    for p in peeling_data:
        combos.add((p.batch_number, p.hlso_count, p.species, p.variety_name, p.production_for, p.peeling_at))

    hlso_floor_balance = []
    for batch, count, spc, variety, prod_for, location in combos:
        if not location: continue
        
        qty = get_floor_balance(db, company_id, location, batch, count, spc, variety)
        
        if qty and qty > 0.01:
            hlso_floor_balance.append({
                "batch": batch or "N/A", 
                "variety": variety or "N/A", 
                "count": count or "N/A",
                "species": spc or "N/A", 
                "production_for": prod_for or "N/A", 
                "location": location or "N/A",
                "available_qty": round(qty, 2)
            })
    
    hlso_floor_balance = sorted(hlso_floor_balance, key=lambda x: (x["production_for"], x["location"], x["batch"]))

    # 2. REQUIRED HLSO (DRILL DOWN LOGIC)
    p_orders = db.query(pending_orders).filter(pending_orders.company_id == company_id).all()
    all_stock = db.query(stock_entry).filter(stock_entry.company_id == company_id).all()
    v_records = db.query(varieties).filter(varieties.company_id == company_id).all()
    p_styles = db.query(packing_styles).filter(packing_styles.company_id == company_id).all()
    
    stock_pool = {}
    for s in all_stock:
        gl_match = re.search(r'(\d+)', str(s.glaze or "0"))
        gl_val = gl_match.group(1) if gl_match else "0"
        key = f"{str(s.production_for or '').strip().upper()}|{str(s.species).strip().lower()}|{str(s.variety).strip().lower()}|{str(s.grade).strip().lower()}|{str(s.packing_style).strip().lower()}|{gl_val}"
        qty = float(s.quantity or 0)
        stock_pool[key] = stock_pool.get(key, 0.0) + (qty if str(s.cargo_movement_type).upper() == "IN" else -qty)

    hlso_summary, drill_down_data = {}, {"hlso": {}}

    for p in p_orders:
        p_var = str(p.variety or "").strip().lower()
        if "hoso" in p_var: continue 

        p_spec, p_grad = str(p.species or "").strip().lower(), str(p.grade or "").strip().lower()
        p_pack = str(p.packing_style or "").strip().lower()
        p_comp = str(p.company_name or "").strip().upper()

        c_gl_match = re.search(r'(\d+)', str(p.count_glaze or "0"))
        c_gl_factor = (100 - float(c_gl_match.group(1))) / 100 if c_gl_match else 1.0
        w_gl_match = re.search(r'(\d+)', str(p.weight_glaze or "0"))
        w_gl_factor = (100 - float(w_gl_match.group(1))) / 100 if w_gl_match else 1.0

        gl_key_val = str(int(float(c_gl_match.group(1)) if c_gl_match else 0))
        exact_key = f"{p_comp}|{p_spec}|{p_var}|{p_grad}|{p_pack}|{gl_key_val}"
        opening_bal = stock_pool.get(exact_key, 0.0)

        mc_wt = 1.0
        ps_match = next((ps for ps in p_styles if str(ps.packing_style).strip().lower() == p_pack), None)
        if ps_match: mc_wt = float(ps_match.mc_weight or 1.0)
        
        ordered_qty = round(mc_wt * float(p.no_of_mc or 0), 2)
        pending_prod = opening_bal - ordered_qty
        stock_pool[exact_key] = pending_prod

        if pending_prod < 0:
            abs_pending = abs(pending_prod)
            v_data = next((v for v in v_records if str(v.variety_name).strip().lower() == p_var), None)
            peeling_y = float(v_data.peeling_yield or 100) / 100 if v_data else 1.0
            soaking_y = float(v_data.soaking_yield or 100) / 100 if v_data else 1.0
            
            net_count = round((float(p.no_of_pieces or 0) / 2.20462) / c_gl_factor, 2) if p.no_of_pieces else 0
            hl_count_calc = round(net_count * peeling_y * soaking_y, 2)
            req_hlso_qty = round((abs_pending * w_gl_factor) / (peeling_y * soaking_y), 2)

            if req_hlso_qty > 0:
                summary_key = f"{p.species}|{p.variety}|{hl_count_calc}"
                if summary_key not in hlso_summary:
                    hlso_summary[summary_key] = {"species": p.species, "variety": p.variety, "count": hl_count_calc, "total_kg": 0}
                    drill_down_data["hlso"][summary_key] = []
                
                hlso_summary[summary_key]["total_kg"] += req_hlso_qty
                drill_down_data["hlso"][summary_key].append({"po_no": p.po_number, "buyer": getattr(p, 'buyer', 'N/A'), "grade": p.grade, "qty": req_hlso_qty})

    # 3. SEARCHABLE MASTER LISTS [2026-01-24]
    variety_list = [v[0] for v in db.query(varieties.variety_name).filter(varieties.company_id == company_id).order_by(varieties.variety_name).all() if v[0]]
    contractor_list = [c[0] for c in db.query(contractors.contractor_name).filter(contractors.company_id == company_id).order_by(contractors.contractor_name).all() if c[0]]
    species_list = [s[0] for s in db.query(species.species_name).filter(species.company_id == company_id).order_by(species.species_name).all() if s[0]]
    peeling_at_list = [pa[0] for pa in db.query(peeling_at.peeling_at).filter(peeling_at.company_id == company_id).order_by(peeling_at.peeling_at).all() if pa[0]]
    prod_for_list = [pf[0] for pf in db.query(distinct(ProductionForMaster.production_for)).filter(ProductionForMaster.company_id == company_id).order_by(ProductionForMaster.production_for).all() if pf[0]]

    today_data = db.query(Peeling).filter(Peeling.company_id == company_id, Peeling.date == date.today()).order_by(Peeling.id.desc()).all()

    # FIXED: request as first argument for TemplateResponse
    return templates.TemplateResponse(
        request,
        "processing/peeling.html",
        {
            "varieties": variety_list, "contractors": contractor_list,
            "species": species_list, "peeling_locations": peeling_at_list,
            "prod_for_list": prod_for_list, "today_data": today_data,
            "hlso_floor_balance": hlso_floor_balance, "hlso_summary": list(hlso_summary.values()), 
            "drill_down_json": json.dumps(drill_down_data)
        }
    )

# =====================================================
# SEARCHABLE DROPDOWN HELPERS
# =====================================================

@router.get("/peeling/get_batches/{production_for}")
def get_batches_by_company(production_for: str, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    
    batches = db.query(Grading.batch_number).\
        filter(
            Grading.company_id == company_id, 
            Grading.production_for == production_for,
            ~Grading.variety_name.ilike("%HOSO%")
        ).distinct().all()
    
    valid_batches = []
    for (b_no,) in batches:
        if not b_no: continue
        total_bal = get_floor_balance(db, company_id, None, b_no, None, None, None)
        if total_bal > 0.05:
            valid_batches.append(b_no)
            
    return {"batches": sorted(valid_batches)}

@router.get("/peeling/get_hlso/{batch}")
def get_hlso_counts_by_batch(batch: str, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    rows = db.query(Grading.graded_count, Grading.species, Grading.variety_name).\
        filter(Grading.company_id == company_id, Grading.batch_number == batch, ~Grading.variety_name.ilike("%HOSO%")).\
        distinct().all()
    
    return {
        "counts": [r[0] for r in rows if r[0]],
        "species_map": {r[0]: r[1] for r in rows if r[0]},
        "variety_map": {r[0]: r[2] for r in rows if r[0]}
    }

@router.get("/peeling/get_available_qty")
def get_available_qty(
    request: Request, 
    location: str = Query(...), 
    batch: str = Query(...), 
    hlso_count: str = Query(...), 
    species_name: str = Query(...), 
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    qty = get_floor_balance(db, company_id, location, batch, hlso_count, species_name, "HLSO")
    return {"available_qty": round(max(qty, 0), 2)}

@router.get("/peeling/get_rate")
def get_rate(contractor: str, variety: str, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    row = db.query(peeling_rates.rate).filter(
        peeling_rates.company_id == company_id, 
        peeling_rates.contractor_name == contractor, 
        peeling_rates.variety_name == variety
    ).order_by(peeling_rates.effective_from.desc()).first()
    return {"rate": float(row[0]) if row else 0}

# =====================================================
# CRUD OPERATIONS
# =====================================================

@router.post("/peeling")
def save_peeling(
    request: Request,
    batch_number: str = Form(...), hlso_count: str = Form(...), hlso_qty: float = Form(...),
    variety_name: str = Form(...), peeled_qty: float = Form(...), contractor_name: str = Form(...),
    rate: float = Form(...), amount: float = Form(...), yield_percent: float = Form(...),
    species_name: str = Form(...), peeling_at: str = Form(...), production_for: str = Form(...),
    db: Session = Depends(get_db)
):
    email = request.session.get("email")
    company_id = request.session.get("company_code")
    if not email or not company_id: return RedirectResponse("/auth/login", status_code=303)

    avail = get_floor_balance(db, company_id, peeling_at, batch_number, hlso_count, species_name, variety_name)
    if hlso_qty > (avail + 0.05):
         return JSONResponse({"error": f"Stock limited! Only {avail} KG available at {peeling_at}"}, status_code=400)

    obj = Peeling(
        batch_number=batch_number, hlso_count=hlso_count, hlso_qty=hlso_qty,
        variety_name=variety_name, peeled_qty=peeled_qty, contractor_name=contractor_name,
        rate=rate, amount=amount, yield_percent=yield_percent, species=species_name,
        peeling_at=peeling_at, production_for=production_for,
        date=date.today(), time=datetime.now().time(), email=email, company_id=company_id
    )
    db.add(obj)
    db.commit()
    return RedirectResponse("/processing/peeling", status_code=303)

@router.post("/peeling/delete/{id}")
def delete_peeling(id: int, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    row = db.query(Peeling).filter(Peeling.company_id == company_id, Peeling.id == id).first()
    if row:
        db.delete(row)
        db.commit()
        return JSONResponse({"status": "ok"})
    return JSONResponse({"error": "Record not found"}, status_code=404)