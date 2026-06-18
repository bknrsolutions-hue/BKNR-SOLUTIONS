import json
import re
from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database.models.inventory_management import pending_orders, stock_entry
from app.database.models.requirements import ProductionRequirement
from app.database.models.criteria import (
    varieties, 
    HOSO_HLSO_Yields,
    packing_styles,
    grade_to_hoso
)

class ProductionRequirementService:

    @staticmethod
    def refresh_requirements(db: Session, company_id: str, production_for_filter: str = None):
        """
        BKNR CENTRALIZED PRODUCTION REQUIREMENTS ENGINE [2026]
        Processes exact row allocations and builds variety-wise summarized structures.
        """
        # ==========================================
        # 1. OLD SNAPSHOT CLEANUP
        # ==========================================
        delete_q = db.query(ProductionRequirement).filter(ProductionRequirement.company_id == company_id)
        if production_for_filter:
            delete_q = delete_q.filter(func.trim(ProductionRequirement.production_for) == func.trim(production_for_filter))
        
        delete_q.delete(synchronize_session=False)
        db.commit()

        # ==========================================
        # 2. DATA EXTRACTION WITH SECURITY LOCKS
        # ==========================================
        orders_q = db.query(pending_orders).filter(pending_orders.company_id == company_id)
        stock_q = db.query(stock_entry).filter(stock_entry.company_id == company_id)

        if production_for_filter:
            orders_q = orders_q.filter(func.trim(pending_orders.company_name) == func.trim(production_for_filter))
            stock_q = stock_q.filter(func.trim(stock_entry.production_for) == func.trim(production_for_filter))

        orders = orders_q.order_by(pending_orders.sl_no.asc()).all()
        all_stock = stock_q.all()

        yield_records = db.query(HOSO_HLSO_Yields).filter(HOSO_HLSO_Yields.company_id == company_id).all()
        p_styles = db.query(packing_styles).filter(packing_styles.company_id == company_id).all()
        v_records = db.query(varieties).filter(varieties.company_id == company_id).all()
        grade_map_list = db.query(grade_to_hoso).filter(grade_to_hoso.company_id == company_id).all()

        # ==========================================
        # 3. GLOBAL STOCK POOL GENERATION
        # ==========================================
        stock_pool = {}
        for s in all_stock:
            s_gl_match = re.search(r'(\d+)', str(s.glaze or "0"))
            s_gl_val = s_gl_match.group(1) if s_gl_match else "0"
            s_frz = str(s.freezer or "N/A").strip().lower()
            s_prod_for = str(s.production_for or "").strip().upper()
            
            key = f"{s_prod_for}|{str(s.species).strip().lower()}|{str(s.variety).strip().lower()}|{str(s.grade).strip().lower()}|{str(s.packing_style).strip().lower()}|{s_gl_val}|{s_frz}"
            
            qty = float(s.quantity or 0)
            net_qty = qty if str(s.cargo_movement_type).upper() == "IN" else -qty
            stock_pool[key] = stock_pool.get(key, 0.0) + net_qty

        usage_history = {}
        requirement_rows = []

        # ==========================================
        # 4. PROCESSING MATRIX LOOP (FIFO DRIVEN)
        # ==========================================
        for r in orders:
            current_row_comp = str(r.company_name or "").strip().upper()
            p_spec = str(r.species or "").strip().lower()
            p_var = str(r.variety or "").strip().lower()
            p_grad = str(r.grade or "").strip().lower()
            p_pack = str(r.packing_style or "").strip().lower()
            p_frz = str(r.freezer or "N/A").strip().lower()
            
            c_gl_match = re.search(r'(\d+)', str(r.count_glaze or "0"))
            p_c_gl_val = float(c_gl_match.group(1)) if c_gl_match else 0.0
            c_gl_factor = (100 - p_c_gl_val) / 100 if p_c_gl_val < 100 else 1.0
            
            w_gl_match = re.search(r'(\d+)', str(r.weight_glaze or "0"))
            p_w_gl_val = float(w_gl_match.group(1)) if w_gl_match else 0.0
            w_gl_factor = (100 - p_w_gl_val) / 100 if p_w_gl_val < 100 else 1.0

            exact_key = f"{current_row_comp}|{p_spec}|{p_var}|{p_grad}|{p_pack}|{str(int(p_c_gl_val))}|{p_frz}"
            opening_bal = round(stock_pool.get(exact_key, 0.0), 2)

            mc_wt = 1.0
            p_match = next((ps for ps in p_styles if str(ps.packing_style).strip().lower() == p_pack), None)
            ordered_qty = round(float(p_match.mc_weight or 1.0) * float(r.no_of_mc or 0), 2) if p_match else 0.0

            utilized_stock = min(opening_bal, ordered_qty) if opening_bal > 0 else 0.0
            remaining_bal = round(opening_bal - ordered_qty, 2)
            
            if exact_key not in usage_history: usage_history[exact_key] = []
            usage_history[exact_key].append({
                "po_no": r.po_number or "N/A", 
                "available": opening_bal,
                "utilized": round(utilized_stock, 2), 
                "balance": remaining_bal
            })
            stock_pool[exact_key] = remaining_bal

            try: net_count_calc = round((float(r.no_of_pieces or 0) / 2.20462) / c_gl_factor, 2) if r.no_of_pieces else 0
            except: net_count_calc = 0

            nw_grade = "-" 
            rel_grades = [gm for gm in grade_map_list if str(gm.species).strip().lower() == p_spec]
            if rel_grades and net_count_calc > 0:
                nearest_gm = min(rel_grades, key=lambda x: abs(float(x.hlso_count or 0) - net_count_calc))
                nw_grade = nearest_gm.nw_grade if nearest_gm.nw_grade else "-"

            # 🟢 🔴 FIXED: Changed from ref_opt_stock to referral_stock
            referral_stock = 0.0
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
                        if nw_grade != "-" and str(s.grade).strip().lower() == str(nw_grade).strip().lower() and s_gl_num == "0": 
                            match_ref = True
                
                if match_ref:
                    s_qty = float(s.quantity or 0) if str(s.cargo_movement_type).upper() == "IN" else -float(s.quantity or 0)
                    if s_qty > 0:
                        # 🟢 🔴 FIXED
                        referral_stock += s_qty
                        ref_details.append({
                            "po_no": f"LOC: {str(s.location or 'N/A').upper()}", 
                            "available": round(s_qty, 2), 
                            "utilized": f"AT: {str(s.production_at or 'N/A').upper()}", 
                            "balance": round(s_qty, 2)
                        })

            pending_production = round(utilized_stock - ordered_qty, 2)
            stock_mc = int(opening_bal / mc_wt) if mc_wt > 0 else 0
            prod_pending_mc = int(abs(pending_production) / mc_wt) if mc_wt > 0 and pending_production < 0 else 0

            v_data = next((v for v in v_records if str(v.variety_name).strip().lower() == p_var), None)
            peeling_y = float(v_data.peeling_yield or 100) / 100 if v_data else 1.0
            soaking_y = float(v_data.soaking_yield or 100) / 100 if v_data else 1.0
            hl_count_calc = round(net_count_calc * peeling_y * soaking_y, 2) if net_count_calc > 0 else 0
            
            hoso_count_calc, req_hlso_qty, req_hoso_qty = 0, 0, 0
            
            if "HOSO" in p_var.upper():
                hoso_count_calc = net_count_calc
                if pending_production < 0: 
                    req_hoso_qty = round(abs(pending_production) * w_gl_factor, 2)
            else:
                sp_yields = [y for y in yield_records if str(y.species).strip().lower() == p_spec]
                if sp_yields and hl_count_calc > 0:
                    nearest_y = min(sp_yields, key=lambda x: abs(float(x.hlso_count or 0) - hl_count_calc))
                    hoso_count_calc = nearest_y.hoso_count
                    if pending_production < 0 and peeling_y > 0 and soaking_y > 0:
                        req_hlso_qty = round((abs(pending_production) * w_gl_factor) / (peeling_y * soaking_y), 2)
                        h_yield_pct = float(nearest_y.hlso_yield_pct or 100) / 100
                        req_hoso_qty = round(req_hlso_qty / h_yield_pct, 2) if h_yield_pct > 0 else 0

            pending_percentage = 0.0
            if ordered_qty > 0:
                pending_percentage = round((abs(pending_production) / ordered_qty) * 100, 2) if pending_production < 0 else 0.0

            requirement_rows.append(
                ProductionRequirement(
                    company_id=company_id,
                    po_number=r.po_number,
                    po_date=r.date,
                    customer_name=r.buyer,
                    species=r.species,
                    variety=r.variety.strip().upper(), 
                    grade=r.grade,
                    packing_style=r.packing_style,
                    freezer=r.freezer,
                    count_glaze=r.count_glaze,
                    weight_glaze=r.weight_glaze,
                    no_of_mc=float(r.no_of_mc or 0),
                    ordered_qty=ordered_qty,
                    available_stock=opening_bal,
                    existed_stock_util=utilized_stock,
                    pending_production=abs(pending_production) if pending_production < 0 else 0.0,
                    pending_percentage=pending_percentage,
                    production_for=r.company_name,
                    net_count_calc=net_count_calc,
                    nw_grade=nw_grade,
                    hl_count_calc=hl_count_calc,
                    hoso_count_calc=hoso_count_calc,
                    req_hlso_qty=req_hlso_qty,
                    req_hoso_qty=req_hoso_qty,
                    stock_mc=stock_mc,
                    prod_pending_mc=prod_pending_mc,
                    # 🟢 🔴 FIXED: Changed keyword to match your actual DB Model
                    referral_stock=round(referral_stock, 2),
                    snapshot_date=date.today(),
                    calculation_date=date.today(),
                    status="READY" if pending_production >= 0 else "PENDING"
                )
            )

        if requirement_rows:
            db.bulk_save_objects(requirement_rows)
        db.commit()
        return len(requirement_rows)