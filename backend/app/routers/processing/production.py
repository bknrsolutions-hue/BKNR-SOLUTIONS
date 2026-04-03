# ============================================================
# 🔥 PRODUCTION ROUTER - CORRECTED VERSION
# ============================================================

from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import distinct, func, and_
from datetime import datetime, timedelta
from typing import Optional
import re
import json

from app.database import get_db
from app.database.models.processing import Production, GateEntry, Soaking
from app.database.models.inventory_management import pending_orders, stock_entry
from app.database.models.criteria import (
    brands, varieties, glazes, freezers,
    packing_styles, grades, species, production_at,
    production_for as ProductionForMaster,
    production_types, HOSO_HLSO_Yields, grade_to_hoso
)

router = APIRouter(tags=["PRODUCTION"])
templates = Jinja2Templates(directory="app/templates")


# -----------------------------------------------------
# HELPER: TODAY RANGE (9 AM TO NEXT DAY 9 AM)
# -----------------------------------------------------
def get_today_range():
    now = datetime.now()
    start = now.replace(hour=9, minute=0, second=0, microsecond=0)
    if now < start:
        start -= timedelta(days=1)
    end = start + timedelta(days=1) - timedelta(seconds=1)
    return start, end


# -----------------------------------------------------
# HELPER: EXTRACT NUMERIC VALUE FROM STRING
# -----------------------------------------------------
def extract_number(value, default=0):
    """Safely extract number from string like '10%' or 'NWNC'"""
    if not value:
        return default
    match = re.search(r'(\d+\.?\d*)', str(value))
    return float(match.group(1)) if match else default


# -----------------------------------------------------
# HELPER: BUILD STOCK KEY
# -----------------------------------------------------
def build_stock_key(prod_for, species, variety, grade, packing_style, glaze, freezer):
    """Consistent stock key generation"""
    return "|".join([
        str(prod_for or "").strip().upper(),
        str(species or "").strip().lower(),
        str(variety or "").strip().lower(),
        str(grade or "").strip().lower(),
        str(packing_style or "").strip().lower(),
        str(int(extract_number(glaze, 0))),
        str(freezer or "N/A").strip().lower()
    ])


# -----------------------------------------------------
# HELPER: GET COMMON TEMPLATE DATA
# -----------------------------------------------------
def get_common_data(db: Session, company_code: str):
    """Fetch all dropdown data for template"""
    return {
        "brands": [b.brand_name for b in db.query(brands).filter(brands.company_id == company_code).all()],
        "varieties": [v.variety_name for v in db.query(varieties).filter(varieties.company_id == company_code).all()],
        "glazes": [g.glaze_name for g in db.query(glazes).filter(glazes.company_id == company_code).all()],
        "freezers": [f.freezer_name for f in db.query(freezers).filter(freezers.company_id == company_code).all()],
        "packing_styles": db.query(packing_styles).filter(packing_styles.company_id == company_code).all(),
        "grades": [g.grade_name for g in db.query(grades).filter(grades.company_id == company_code).all()],
        "species": [s.species_name for s in db.query(species).filter(species.company_id == company_code).all()],
        "prod_at_list": [p.production_at for p in db.query(production_at).filter(production_at.company_id == company_code).all()],
        "prod_for_list": [pf[0] for pf in db.query(distinct(ProductionForMaster.production_for)).filter(ProductionForMaster.company_id == company_code).all() if pf[0]],
        "prod_types_list": [pt.production_type for pt in db.query(production_types).filter(production_types.company_id == company_code).all()],
    }


# -----------------------------------------------------
# MAIN PRODUCTION PAGE
# -----------------------------------------------------
@router.get("/production", response_class=HTMLResponse)
def production_page(
    request: Request, 
    db: Session = Depends(get_db),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    edit_id: Optional[int] = None
):
    company_code = request.session.get("company_code")
    email = request.session.get("email")

    if not company_code or not email:
        return RedirectResponse("/auth/login", status_code=302)

    # ========== 1. LOAD MASTER DATA ==========
    all_stock = db.query(stock_entry).filter(stock_entry.company_id == company_code).all()
    yield_records = db.query(HOSO_HLSO_Yields).filter(HOSO_HLSO_Yields.company_id == company_code).all()
    p_styles = db.query(packing_styles).filter(packing_styles.company_id == company_code).all()
    v_records = db.query(varieties).filter(varieties.company_id == company_code).all()
    grade_map_list = db.query(grade_to_hoso).filter(grade_to_hoso.company_id == company_code).all()

    # ========== 2. BUILD STOCK POOL ==========
    stock_pool = {}
    for s in all_stock:
        key = build_stock_key(
            s.production_for, s.species, s.variety, 
            s.grade, s.packing_style, s.glaze, s.freezer
        )
        qty = float(s.quantity or 0)
        net_qty = qty if str(s.cargo_movement_type).upper() == "IN" else -qty
        stock_pool[key] = stock_pool.get(key, 0.0) + net_qty

    # ========== 3. PRODUCTION AGGREGATION SUBQUERY ==========
    produced_sub = (
        db.query(
            Production.batch_number,
            Production.brand,
            Production.variety_name,
            Production.grade,
            Production.packing_style,
            func.sum(Production.no_of_mc).label("total_produced")
        )
        .filter(Production.company_id == company_code)
        .group_by(
            Production.batch_number, 
            Production.brand, 
            Production.variety_name, 
            Production.grade, 
            Production.packing_style
        )
        .subquery()
    )

    # ========== 4. PENDING ORDERS QUERY ==========
    q_req = (
        db.query(
            pending_orders,
            func.coalesce(produced_sub.c.total_produced, 0).label("produced_mc_count")
        )
        .outerjoin(
            produced_sub, 
            and_(
                pending_orders.po_number == produced_sub.c.batch_number,
                pending_orders.brand == produced_sub.c.brand,
                pending_orders.variety == produced_sub.c.variety_name,
                pending_orders.grade == produced_sub.c.grade,
                pending_orders.packing_style == produced_sub.c.packing_style
            )
        )
        .filter(pending_orders.company_id == company_code)
    )
    
    # Date Filters
    if from_date:
        try:
            q_req = q_req.filter(pending_orders.date >= datetime.strptime(from_date, "%Y-%m-%d").date())
        except ValueError:
            pass
    if to_date:
        try:
            q_req = q_req.filter(pending_orders.date <= datetime.strptime(to_date, "%Y-%m-%d").date())
        except ValueError:
            pass

    requirements_data = q_req.order_by(pending_orders.sl_no.asc()).all()

    # ========== 5. PROCESS REQUIREMENTS ==========
    usage_history = {}
    final_pending_list = []

    for row in requirements_data:
        r = row.pending_orders
        r.actual_produced_mc = float(row.produced_mc_count or 0)
        
        # Extract Values
        current_row_comp = str(r.company_name or "").strip().upper()
        p_spec = str(r.species or "").strip().lower()
        p_var = str(r.variety or "").strip().lower()
        p_grad = str(r.grade or "").strip().lower()
        p_pack = str(r.packing_style or "").strip().lower()
        p_frz = str(r.freezer or "N/A").strip().lower()
        
        # Glaze Calculations
        p_c_gl_val = extract_number(r.count_glaze, 0)
        c_gl_factor = (100 - p_c_gl_val) / 100 if p_c_gl_val < 100 else 1.0
        
        p_w_gl_val = extract_number(r.weight_glaze, 0)
        w_gl_factor = (100 - p_w_gl_val) / 100 if p_w_gl_val < 100 else 1.0

        # Stock Key & Available Stock
        exact_key = build_stock_key(current_row_comp, p_spec, p_var, p_grad, p_pack, r.count_glaze, r.freezer)
        opening_bal = round(stock_pool.get(exact_key, 0.0), 2)
        r.available_stock = opening_bal

        # MC Weight & Ordered Qty
        mc_wt = 1.0
        slab_wt = 0.0
        p_match = next((ps for ps in p_styles if str(ps.packing_style).strip().lower() == p_pack), None)
        if p_match:
            mc_wt = float(p_match.mc_weight or 1.0)
            slab_wt = float(p_match.slab_weight or 0.0)
            r.ordered_qty = round(mc_wt * float(r.no_of_mc or 0), 2)
        else:
            r.ordered_qty = 0.0

        # Stock Utilization
        r.existed_stock_util = min(opening_bal, r.ordered_qty) if opening_bal > 0 else 0.0
        
        if exact_key not in usage_history:
            usage_history[exact_key] = []
        
        remaining_bal = round(opening_bal - r.ordered_qty, 2)
        usage_history[exact_key].append({
            "po_no": r.po_number or "N/A", 
            "available": opening_bal,
            "utilized": round(r.existed_stock_util, 2), 
            "balance": remaining_bal
        })
        r.util_json = json.dumps(usage_history[exact_key])
        stock_pool[exact_key] = remaining_bal

        # Net Count Calculation
        try:
            r.net_count_calc = round((float(r.no_of_pieces or 0) / 2.20462) / c_gl_factor, 2) if r.no_of_pieces else 0
        except (ZeroDivisionError, TypeError):
            r.net_count_calc = 0

        # NW Grade Mapping
        r.nw_grade = "-"
        rel_grades = [gm for gm in grade_map_list if str(gm.species).strip().lower() == p_spec]
        if rel_grades and r.net_count_calc > 0:
            nearest_gm = min(rel_grades, key=lambda x: abs(float(x.hlso_count or 0) - r.net_count_calc))
            r.nw_grade = nearest_gm.nw_grade if nearest_gm.nw_grade else "-"

        # Referral Stock Calculation
        r.ref_opt_stock = 0.0
        ref_details = []
        p_gl_full_text = str(r.count_glaze or "").strip().upper()
        is_order_nwnc = "NWNC" in p_gl_full_text or p_c_gl_val == 0
        
        for s in all_stock:
            if str(s.production_for or "").strip().upper() != current_row_comp:
                continue
            
            s_gl_num = str(int(extract_number(s.glaze, 0)))
            match_ref = False
            
            if (str(s.species).strip().lower() == p_spec and 
                str(s.variety).strip().lower() == p_var and 
                str(s.freezer or "N/A").strip().lower() == p_frz):
                
                if is_order_nwnc:
                    if (str(s.grade).strip().lower() == p_grad and 
                        s_gl_num == "0" and 
                        str(s.packing_style).strip().lower() != p_pack):
                        match_ref = True
                else:
                    if (r.nw_grade != "-" and 
                        str(s.grade).strip().lower() == str(r.nw_grade).strip().lower() and 
                        s_gl_num == "0"):
                        match_ref = True
            
            if match_ref:
                s_qty = float(s.quantity or 0) if str(s.cargo_movement_type).upper() == "IN" else -float(s.quantity or 0)
                if s_qty > 0:
                    r.ref_opt_stock += s_qty
                    ref_details.append({
                        "po_no": f"LOC: {str(s.location or 'N/A').upper()}", 
                        "available": round(s_qty, 2), 
                        "utilized": f"AT: {str(s.production_at or 'N/A').upper()}", 
                        "balance": round(s_qty, 2)
                    })

        r.ref_opt_stock = round(r.ref_opt_stock, 2)
        r.ref_json = json.dumps(ref_details)

        # Stock MC & Pending Calculations
        r.stock_mc = int(opening_bal / mc_wt) if mc_wt > 0 else 0
        r.pending_production = round(r.existed_stock_util - r.ordered_qty, 2)
        r.prod_pending_mc = int(float(r.no_of_mc or 0) - r.actual_produced_mc)
        
        # Yield Calculations
        v_data = next((v for v in v_records if str(v.variety_name).strip().lower() == p_var), None)
        peeling_y = float(v_data.peeling_yield or 100) / 100 if v_data else 1.0
        soaking_y = float(v_data.soaking_yield or 100) / 100 if v_data else 1.0
        
        r.hl_count_calc = round(r.net_count_calc * peeling_y * soaking_y, 2) if r.net_count_calc > 0 else 0
        
        # HOSO/HLSO Requirements
        r.hoso_count_calc = 0
        r.req_hlso_qty = 0
        r.req_hoso_qty = 0
        
        if "HOSO" in p_var.upper():
            r.hoso_count_calc = r.net_count_calc
            if abs(r.pending_production) > 0:
                r.req_hoso_qty = round(abs(r.pending_production) * w_gl_factor, 2)
        else:
            sp_yields = [y for y in yield_records if str(y.species).strip().lower() == p_spec]
            if sp_yields and r.hl_count_calc > 0:
                nearest_y = min(sp_yields, key=lambda x: abs(float(x.hlso_count or 0) - r.hl_count_calc))
                r.hoso_count_calc = nearest_y.hoso_count
                
                if abs(r.pending_production) > 0 and peeling_y > 0 and soaking_y > 0:
                    r.req_hlso_qty = round((abs(r.pending_production) * w_gl_factor) / (peeling_y * soaking_y), 2)
                    h_yield_pct = float(nearest_y.hlso_yield_pct or 100) / 100
                    r.req_hoso_qty = round(r.req_hlso_qty / h_yield_pct, 2) if h_yield_pct > 0 else 0
        
        final_pending_list.append(r)

    # ========== 6. SOAKING & REJECTION DATA ==========
    rejection_data = db.query(Soaking).filter(
        Soaking.company_id == company_code, 
        Soaking.rejection_qty > 0, 
        Soaking.status != 'Completed'
    ).all()
    
    soaking_monitor = db.query(Soaking).filter(
        Soaking.company_id == company_code, 
        Soaking.status != 'Completed', 
        Soaking.in_qty > 0
    ).order_by(Soaking.date.asc(), Soaking.sintex_number.asc()).all()

    # ========== 7. BATCH DATA FOR DROPDOWN ==========
    batches_with_company = [
        {"batch_number": g.batch_number, "production_for": g.production_for} 
        for g in db.query(GateEntry).filter(GateEntry.company_id == company_code).order_by(GateEntry.id.desc()).all() 
        if g.batch_number
    ]

    # ========== 8. TODAY'S LOGS ==========
    start, end = get_today_range()
    today_data = db.query(Production).filter(
        Production.company_id == company_code, 
        Production.date >= start.date(), 
        Production.date <= end.date()
    ).order_by(Production.id.desc()).all()

    # ========== 9. EDIT DATA (if editing) ==========
    edit_data = None
    if edit_id:
        edit_data = db.query(Production).filter(
            Production.id == edit_id, 
            Production.company_id == company_code
        ).first()

    # ========== 10. BUILD RESPONSE ==========
    common_data = get_common_data(db, company_code)
    
    return templates.TemplateResponse(
        "processing/production.html",
        {
            "request": request,
            "batches_with_company": batches_with_company,
            **common_data,
            "today_data": today_data,
            "rejection_data": rejection_data,
            "soaking_data": soaking_monitor,
            "pending_orders": final_pending_list,
            "from_date": from_date or "",
            "to_date": to_date or "",
            "edit_data": edit_data,
            "message": request.session.pop("message", None)
        }
    )


# -----------------------------------------------------
# API: UPDATE SOAKING STATUS (AJAX)
# -----------------------------------------------------
@router.post("/production/update_soaking_status/{id}")
async def update_soaking_status(id: int, request: Request, db: Session = Depends(get_db)):
    try:
        data = await request.json()
        new_status = data.get("status")
        company_code = request.session.get("company_code")
        
        if not company_code:
            return JSONResponse({"status": "error", "message": "Unauthorized"}, status_code=401)
        
        entry = db.query(Soaking).filter(
            Soaking.id == id, 
            Soaking.company_id == company_code
        ).first()
        
        if entry:
            entry.status = new_status
            db.commit()
            return JSONResponse({"status": "ok", "message": "Status updated"})
        
        return JSONResponse({"status": "error", "message": "Entry not found"}, status_code=404)
    
    except Exception as e:
        db.rollback()
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


# -----------------------------------------------------
# API: MARK REJECTION AS COMPLETED
# -----------------------------------------------------
@router.post("/production/complete_rejection/{soaking_id}")
def complete_rejection(soaking_id: int, request: Request, db: Session = Depends(get_db)):
    try:
        company_code = request.session.get("company_code")
        
        if not company_code:
            return JSONResponse({"status": "error", "message": "Unauthorized"}, status_code=401)
        
        entry = db.query(Soaking).filter(
            Soaking.id == soaking_id, 
            Soaking.company_id == company_code
        ).first()

        if entry:
            entry.status = "Completed"
            db.commit()
            return JSONResponse({"status": "ok", "message": "Marked as completed"})
        
        return JSONResponse({"status": "error", "message": "Entry not found"}, status_code=404)
    
    except Exception as e:
        db.rollback()
        return JSONResponse({"status": "error", "message": str(e)}, status_code=500)


# -----------------------------------------------------
# SAVE PRODUCTION
# -----------------------------------------------------
@router.post("/production")
def save_production(
    request: Request,
    batch_number: str = Form(...),
    brand: str = Form(...),
    variety_name: str = Form(...),
    glaze: str = Form(""),
    freezer: str = Form(""),
    packing_style: str = Form(...),
    grade: str = Form(""),
    species: str = Form(...),
    no_of_mc: int = Form(0),
    loose: int = Form(0),
    production_qty: float = Form(0.0),
    production_type: str = Form(""),
    production_at: str = Form(""),
    production_for: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        company_code = request.session.get("company_code")
        email = request.session.get("email")

        if not company_code or not email:
            return RedirectResponse("/auth/login", status_code=302)

        obj = Production(
            batch_number=batch_number,
            brand=brand,
            variety_name=variety_name,
            glaze=glaze,
            freezer=freezer,
            packing_style=packing_style,
            grade=grade,
            species=species,
            no_of_mc=no_of_mc,
            loose=loose,
            production_qty=production_qty,
            production_type=production_type,
            production_at=production_at,
            production_for=production_for,
            company_id=company_code,
            email=email,
            date=datetime.now().date(),
            time=datetime.now().time()
        )
        db.add(obj)
        db.commit()

        request.session["message"] = "✔ Production Saved Successfully!"
        return RedirectResponse("/processing/production", status_code=303)
    
    except Exception as e:
        db.rollback()
        request.session["message"] = f"❌ Error: {str(e)}"
        return RedirectResponse("/processing/production", status_code=303)


# -----------------------------------------------------
# EDIT PRODUCTION (Redirect with edit_id)
# -----------------------------------------------------
@router.get("/production/edit/{id}", response_class=HTMLResponse)
def edit_production(id: int, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/auth/login", status_code=303)
    
    # Redirect to main page with edit_id parameter
    return RedirectResponse(f"/processing/production?edit_id={id}", status_code=303)


# -----------------------------------------------------
# UPDATE PRODUCTION
# -----------------------------------------------------
@router.post("/production/update/{id}")
def update_production(
    id: int,
    request: Request,
    batch_number: str = Form(...),
    brand: str = Form(...),
    variety_name: str = Form(...),
    glaze: str = Form(""),
    freezer: str = Form(""),
    packing_style: str = Form(...),
    grade: str = Form(""),
    species: str = Form(...),
    no_of_mc: int = Form(0),
    loose: int = Form(0),
    production_qty: float = Form(0.0),
    production_type: str = Form(""),
    production_at: str = Form(""),
    production_for: str = Form(...),
    db: Session = Depends(get_db)
):
    try:
        company_code = request.session.get("company_code")
        
        if not company_code:
            return RedirectResponse("/auth/login", status_code=302)
        
        entry = db.query(Production).filter(
            Production.id == id, 
            Production.company_id == company_code
        ).first()

        if entry:
            entry.batch_number = batch_number
            entry.brand = brand
            entry.variety_name = variety_name
            entry.glaze = glaze
            entry.freezer = freezer
            entry.packing_style = packing_style
            entry.grade = grade
            entry.species = species
            entry.no_of_mc = no_of_mc
            entry.loose = loose
            entry.production_qty = production_qty
            entry.production_type = production_type
            entry.production_at = production_at
            entry.production_for = production_for
            db.commit()
            request.session["message"] = "✔ Production Updated Successfully!"
        else:
            request.session["message"] = "❌ Entry not found!"

        return RedirectResponse("/processing/production", status_code=303)
    
    except Exception as e:
        db.rollback()
        request.session["message"] = f"❌ Error: {str(e)}"
        return RedirectResponse("/processing/production", status_code=303)


# -----------------------------------------------------
# DELETE PRODUCTION
# -----------------------------------------------------
@router.post("/production/delete/{id}")
def delete_production(id: int, request: Request, db: Session = Depends(get_db)):
    try:
        company_code = request.session.get("company_code")
        
        if not company_code:
            return RedirectResponse("/auth/login", status_code=302)
        
        entry = db.query(Production).filter(
            Production.id == id, 
            Production.company_id == company_code
        ).first()
        
        if entry:
            db.delete(entry)
            db.commit()
            request.session["message"] = "🗑 Production Deleted Successfully!"
        else:
            request.session["message"] = "❌ Entry not found!"
        
        return RedirectResponse("/processing/production", status_code=303)
    
    except Exception as e:
        db.rollback()
        request.session["message"] = f"❌ Error: {str(e)}"
        return RedirectResponse("/processing/production", status_code=303)