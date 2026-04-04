from fastapi import APIRouter, Request, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional
import re
import json

from app.database import get_db
from app.database.models.inventory_management import pending_orders, stock_entry
from app.database.models.criteria import ( 
    varieties, 
    HOSO_HLSO_Yields,
    packing_styles,
    grade_to_hoso 
)

router = APIRouter(
    prefix="/pending_orders_report",
    tags=["PENDING ORDERS REPORT"]
)

@router.get("", response_class=HTMLResponse)
def pending_orders_report_page(
    request: Request,
    db: Session = Depends(get_db),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
):
    # 1. Session check for company security
    comp_code = request.session.get("company_code")
    if not comp_code:
        return RedirectResponse("/auth/login", status_code=302)

    # 2. Pending Orders Base Query
    q = db.query(pending_orders).filter(pending_orders.company_id == comp_code)
    if from_date:
        try: q = q.filter(pending_orders.date >= datetime.strptime(from_date, "%Y-%m-%d").date())
        except: pass
    if to_date:
        try: q = q.filter(pending_orders.date <= datetime.strptime(to_date, "%Y-%m-%d").date())
        except: pass

    rows = q.order_by(pending_orders.sl_no.asc()).all()
    
    # 3. Load Master Data
    all_stock = db.query(stock_entry).filter(stock_entry.company_id == comp_code).all()
    yield_records = db.query(HOSO_HLSO_Yields).filter(HOSO_HLSO_Yields.company_id == comp_code).all()
    p_styles = db.query(packing_styles).filter(packing_styles.company_id == comp_code).all()
    v_records = db.query(varieties).filter(varieties.company_id == comp_code).all()
    grade_map_list = db.query(grade_to_hoso).filter(grade_to_hoso.company_id == comp_code).all()

    # 4. Global Stock Pool Calculation (Grouped by Specs)
    stock_pool = {}
    for s in all_stock:
        s_gl_match = re.search(r'(\d+)', str(s.glaze or "0"))
        s_gl_val = s_gl_match.group(1) if s_gl_match else "0"
        s_frz = str(s.freezer or "N/A").strip().lower()
        s_prod_for = str(s.production_for or "").strip().upper()
        
        # Unique Key for matching: Comp|Species|Variety|Grade|Packing|Glaze|Freezer
        key = f"{s_prod_for}|{str(s.species).strip().lower()}|{str(s.variety).strip().lower()}|{str(s.grade).strip().lower()}|{str(s.packing_style).strip().lower()}|{s_gl_val}|{s_frz}"
        
        qty = float(s.quantity or 0)
        net_qty = qty if str(s.cargo_movement_type).upper() == "IN" else -qty
        stock_pool[key] = stock_pool.get(key, 0.0) + net_qty

    usage_history = {} 

    # 5. Processing Main Loop
    for r in rows:
        current_row_comp = str(r.company_name or "").strip().upper() 
        
        p_spec = str(r.species or "").strip().lower()
        p_var = str(r.variety or "").strip().lower()
        p_grad = str(r.grade or "").strip().lower()
        p_pack = str(r.packing_style or "").strip().lower()
        p_frz = str(r.freezer or "N/A").strip().lower()
        
        # --- Glaze Extraction Logic ---
        # 1. Count Glaze (for Net Count)
        c_gl_match = re.search(r'(\d+)', str(r.count_glaze or "0"))
        p_c_gl_val = float(c_gl_match.group(1)) if c_gl_match else 0.0
        c_gl_factor = (100 - p_c_gl_val) / 100 if p_c_gl_val < 100 else 1.0
        
        # 2. Weight Glaze (for HL/HOSO Qty) - NEW IMPLEMENTATION
        w_gl_match = re.search(r'(\d+)', str(r.weight_glaze or "0"))
        p_w_gl_val = float(w_gl_match.group(1)) if w_gl_match else 0.0
        w_gl_factor = (100 - p_w_gl_val) / 100 if p_w_gl_val < 100 else 1.0

        # Match Key with Stock Pool
        exact_key = f"{current_row_comp}|{p_spec}|{p_var}|{p_grad}|{p_pack}|{str(int(p_c_gl_val))}|{p_frz}"

        opening_bal = round(stock_pool.get(exact_key, 0.0), 2)
        r.available_stock = opening_bal

        # Packing Style Weight Lookup
        mc_wt = 1.0
        p_match = next((ps for ps in p_styles if str(ps.packing_style).strip().lower() == p_pack), None)
        if p_match:
            mc_wt = float(p_match.mc_weight or 1.0)
            r.ordered_qty = round(mc_wt * float(r.no_of_mc or 0), 2)
        else:
            r.ordered_qty = 0.0

        # Stock Utilization
        r.existed_stock_util = min(opening_bal, r.ordered_qty) if opening_bal > 0 else 0.0
        
        # Usage History Tracking for UI
        if exact_key not in usage_history: usage_history[exact_key] = []
        remaining_bal = round(opening_bal - r.ordered_qty, 2)
        usage_history[exact_key].append({
            "po_no": r.po_number or "N/A", 
            "available": opening_bal,
            "utilized": round(r.existed_stock_util, 2), 
            "balance": remaining_bal
        })
        r.util_json = json.dumps(usage_history[exact_key])
        stock_pool[exact_key] = remaining_bal

        # Net Count Calc (Using Count Glaze)
        try: r.net_count_calc = round((float(r.no_of_pieces or 0) / 2.20462) / c_gl_factor, 2) if r.no_of_pieces else 0
        except: r.net_count_calc = 0

        # NW Grade Mapping
        r.nw_grade = "-" 
        rel_grades = [gm for gm in grade_map_list if str(gm.species).strip().lower() == p_spec]
        if rel_grades and r.net_count_calc > 0:
            nearest_gm = min(rel_grades, key=lambda x: abs(float(x.hlso_count or 0) - r.net_count_calc))
            r.nw_grade = nearest_gm.nw_grade if nearest_gm.nw_grade else "-"

        # Referral Stock Logic (Cross-Packing Stock Check)
        r.ref_opt_stock = 0.0
        ref_details = []
        p_gl_full_text = str(r.count_glaze or "").strip().upper()
        is_order_nwnc = "NWNC" in p_gl_full_text or p_c_gl_val == 0
        
        for s in all_stock:
            if str(s.production_for or "").strip().upper() != current_row_comp: continue
            
            s_gl_match = re.search(r'(\d+)', str(s.glaze or "0"))
            s_gl_num = s_gl_match.group(1) if s_gl_match else "0"
            
            match_ref = False
            if str(s.species).strip().lower() == p_spec and str(s.variety).strip().lower() == p_var and str(s.freezer or "N/A").strip().lower() == p_frz:
                if is_order_nwnc:
                    if str(s.grade).strip().lower() == p_grad and s_gl_num == "0" and str(s.packing_style).strip().lower() != p_pack: 
                        match_ref = True
                else:
                    if r.nw_grade != "-" and str(s.grade).strip().lower() == str(r.nw_grade).strip().lower() and s_gl_num == "0": 
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

        # Core Calculation Metrics
        r.stock_mc = int(opening_bal / mc_wt) if mc_wt > 0 else 0
        # Pending Production is Ordered - Available (Represented as negative if production needed)
        r.pending_production = round(r.existed_stock_util - r.ordered_qty, 2)
        r.prod_pending_mc = int(abs(r.pending_production) / mc_wt) if mc_wt > 0 and r.pending_production < 0 else 0
        
        # Variety Data for Yields
        v_data = next((v for v in v_records if str(v.variety_name).strip().lower() == p_var), None)
        peeling_y = float(v_data.peeling_yield or 100) / 100 if v_data else 1.0
        soaking_y = float(v_data.soaking_yield or 100) / 100 if v_data else 1.0
        r.hl_count_calc = round(r.net_count_calc * peeling_y * soaking_y, 2) if r.net_count_calc > 0 else 0
        
        r.hoso_count_calc = 0
        r.req_hlso_qty = 0
        r.req_hoso_qty = 0
        
        # HOSO Specific Logic
        if "HOSO" in p_var.upper():
            r.hoso_count_calc = r.net_count_calc
            if abs(r.pending_production) > 0: 
                # ✅ Applying Weight Glaze Factor
                r.req_hoso_qty = round(abs(r.pending_production) * w_gl_factor, 2)
        else:
            # HLSO/PD Specific Logic
            sp_yields = [y for y in yield_records if str(y.species).strip().lower() == p_spec]
            if sp_yields and r.hl_count_calc > 0:
                nearest_y = min(sp_yields, key=lambda x: abs(float(x.hlso_count or 0) - r.hl_count_calc))
                r.hoso_count_calc = nearest_y.hoso_count
                if abs(r.pending_production) > 0 and peeling_y > 0 and soaking_y > 0:
                    # ✅ Applying Weight Glaze Factor for HLSO and HOSO Raw Material Requirement
                    r.req_hlso_qty = round((abs(r.pending_production) * w_gl_factor) / (peeling_y * soaking_y), 2)
                    h_yield_pct = float(nearest_y.hlso_yield_pct or 100) / 100
                    r.req_hoso_qty = round(r.req_hlso_qty / h_yield_pct, 2) if h_yield_pct > 0 else 0

    return request.app.state.templates.TemplateResponse(
        "reports/pending_orders_report.html",
        {
            "request": request, 
            "rows": rows, 
            "from_date": from_date or "", 
            "to_date": to_date or "",
            "f_po": sorted({r.po_number for r in rows if r.po_number}),
            "f_grades": sorted({r.grade for r in rows if r.grade}),
            "f_nw_grades": sorted({r.nw_grade for r in rows if r.nw_grade and r.nw_grade != '-'}),
            "f_varieties": sorted({r.variety for r in rows if r.variety}),
            "f_glazes": sorted({r.count_glaze for r in rows if r.count_glaze}),
            "f_species": sorted({r.species for r in rows if r.species})
        }
    )