from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse, HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from datetime import datetime, timedelta
from app.utils.timezone import ist_now
import json
import re
from app.services.floor_balance_sync import refresh_floor_balance
from app.services.posting_engine import PostingEngineService
from app.database.models.enterprise_finance import VoucherHeader, VoucherDetail

from app.database import get_db
# Models import
from app.database.models.processing import RawMaterialPurchasing, GateEntry
from app.database.models.criteria import (
    varieties, species, suppliers, hsn_codes, 
    HOSO_HLSO_Yields, packing_styles, peeling_at
)
from app.database.models.inventory_management import pending_orders, stock_entry
from app.utils.global_filters import get_global_filters
from app.utils.edit_lock import is_edit_locked, edit_lock_message

router = APIRouter(tags=["RAW MATERIAL PURCHASING"])
templates = Jinja2Templates(directory="app/templates")

# -----------------------------------------------------
# TODAY RANGE (9 AM TO NEXT DAY 9 AM)
# -----------------------------------------------------
def get_today_range():
    now = ist_now()
    start = now.replace(hour=9, minute=0, second=0, microsecond=0)
    if now < start:
        start -= timedelta(days=1)
    end = start + timedelta(days=1) - timedelta(seconds=1)
    return start, end


# --- Helper: Cancel Linked Finance Voucher ---
def cancel_linked_voucher(db: Session, company_id: str, journal_id: int | None, email: str) -> None:
    if not journal_id:
        return
    voucher = db.query(VoucherHeader).filter(
        VoucherHeader.id == journal_id,
        VoucherHeader.company_id == company_id,
    ).first()
    if voucher and voucher.status != "CANCELLED":
        old_status = voucher.status
        voucher.status = "CANCELLED"
        PostingEngineService.write_finance_audit(
            db,
            company_id,
            "voucher_headers",
            voucher.id,
            "CANCEL",
            {"status": old_status},
            {"status": "CANCELLED"},
            email or "SYSTEM",
        )


# --- Helper: Post Raw Material Purchase Entry to Ledger ---
def post_rm_purchase_to_ledger(db: Session, company_id: str, entry: RawMaterialPurchasing, email: str) -> int:
    try:
        # Determine gst_rate from HSN code description or code
        gst_rate = 0.0
        if entry.hsn_code:
            hsn_obj = db.query(hsn_codes).filter(
                hsn_codes.company_id == company_id,
                ((hsn_codes.description == entry.hsn_code) | (hsn_codes.hsn_code == entry.hsn_code))
            ).first()
            if hsn_obj:
                gst_rate = hsn_obj.gst_percent

        # Determine tds_rate based on supplier PAN presence
        supplier_obj = db.query(suppliers).filter(
            suppliers.supplier_name == entry.supplier_name,
            suppliers.company_id == company_id
        ).first()
        tds_rate = 1.0 if (supplier_obj and supplier_obj.pan_number) else 0.0

        # Post using Seafood ERP auto-posting rule
        voucher = PostingEngineService.post_shrimp_purchase(
            db=db,
            company_id=company_id,
            supplier_name=entry.supplier_name,
            total_amount=entry.amount,
            gst_rate=gst_rate,
            tds_rate=tds_rate,
            batch_number=entry.batch_number,
            invoice_date=entry.date
        )

        # Populate ledger IDs
        inventory_ledger = PostingEngineService.get_or_create_ledger(
            db, company_id, "Raw Shrimp Purchase A/c", "Purchase Accounts", "EXPENSE"
        )
        supplier_ledger = PostingEngineService.get_or_create_ledger(
            db, company_id, f"{entry.supplier_name} - Supplier A/c", "Sundry Creditors", "LIABILITY", "Current Liabilities"
        )
        
        entry.inventory_ledger_id = inventory_ledger.id
        entry.supplier_ledger_id = supplier_ledger.id
        entry.status = "POSTED"

        return voucher.id
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Failed to post raw material purchase to ledger: {str(e)}")
        raise e

# -----------------------------------------------------
# HOSO SUMMARY CALCULATION (🟢 🔴 FIXED: NOW WITH USER PERMISSIONS & GLOBAL FILTERS WORKING)
# -----------------------------------------------------
def get_hoso_summary_data(db: Session, company_code: str, user_allowed_locations: list = None, global_p_for: str = None, global_loc: str = None):
    start, _ = get_today_range()
    
    purch_q = db.query(
        RawMaterialPurchasing.species,
        RawMaterialPurchasing.count,
        func.sum(RawMaterialPurchasing.received_qty).label("total_rec")
    ).filter(
        RawMaterialPurchasing.company_id == company_code,
        RawMaterialPurchasing.date >= start.date(),
        func.upper(RawMaterialPurchasing.variety_name) == 'HOSO',
        RawMaterialPurchasing.is_cancelled == False
    )
    
    # Apply Global Filter layer on received today calculations
    if global_p_for:
        purch_q = purch_q.filter(func.trim(RawMaterialPurchasing.production_for) == func.trim(global_p_for))
    if global_loc:
        purch_q = purch_q.filter(func.trim(RawMaterialPurchasing.peeling_at) == func.trim(global_loc))
    elif user_allowed_locations:
        allowed_clean = [loc.strip().upper() for loc in user_allowed_locations if loc.strip()]
        if allowed_clean:
            purch_q = purch_q.filter(func.upper(func.trim(RawMaterialPurchasing.peeling_at)).in_(allowed_clean))
            
    purchased = purch_q.group_by(RawMaterialPurchasing.species, RawMaterialPurchasing.count).all()
    rec_map = {f"{str(p.species).strip().upper()}|{str(p.count).strip().upper()}": float(p.total_rec or 0) for p in purchased}

    # Stock Entry Base formulation
    stock_q = db.query(stock_entry).filter(stock_entry.company_id == company_code)
    if global_p_for:
        stock_q = stock_q.filter(func.trim(stock_entry.production_for) == func.trim(global_p_for))
        
    all_stock = stock_q.all()
    stock_pool = {}
    for s in all_stock:
        s_gl = re.search(r'(\d+)', str(s.glaze or "0"))
        s_gl_val = s_gl.group(1) if s_gl else "0"
        key = f"{str(s.production_for or '').strip().upper()}|{str(s.species).strip().lower()}|{str(s.variety).strip().lower()}|{str(s.grade).strip().lower()}|{str(s.packing_style).strip().lower()}|{s_gl_val}|{str(s.freezer or 'N/A').strip().lower()}"
        qty = float(s.quantity or 0)
        stock_pool[key] = stock_pool.get(key, 0.0) + (qty if str(s.cargo_movement_type).upper() == "IN" else -qty)

    # Pending Orders Base Query Layered dynamically with target filters
    po_q = db.query(pending_orders).filter(pending_orders.company_id == company_code)
    
    # 🟢 🔴 REQUIREMENT TABLE SECURITY SYNC: Global company & Allowed allocations filter lock
    if global_p_for:
        po_q = po_q.filter(func.trim(pending_orders.company_name) == func.trim(global_p_for))
    if global_loc:
        po_q = po_q.filter(
           func.trim(pending_orders.production_at)
           == func.trim(global_loc)
    )
    
    rows = po_q.all()
    yield_records = db.query(HOSO_HLSO_Yields).filter(HOSO_HLSO_Yields.company_id == company_code).all()
    p_styles = db.query(packing_styles).filter(packing_styles.company_id == company_code).all()
    v_records = db.query(varieties).filter(varieties.company_id == company_code).all()

    summary_agg = {}
    drill_down_dict = {}

    for r in rows:
        p_spec = str(r.species or "").strip().upper()
        p_var = str(r.variety or "").strip().upper()
        if not p_spec: continue

        p_grad, p_pack = str(r.grade or "").strip().lower(), str(r.packing_style or "").strip().lower()
        p_frz = str(r.freezer or "N/A").strip().lower()
        c_gl_match = re.search(r'(\d+)', str(r.count_glaze or "0"))
        p_c_gl_val = float(c_gl_match.group(1)) if c_gl_match else 0.0
        c_gl_factor = (100 - p_c_gl_val) / 100 if p_c_gl_val < 100 else 1.0
        w_gl_match = re.search(r'(\d+)', str(r.weight_glaze or "0"))
        w_gl_factor = (100 - float(w_gl_match.group(1) if w_gl_match else 0)) / 100

        exact_key = f"{str(r.company_name or '').strip().upper()}|{p_spec.lower()}|{p_var.lower()}|{p_grad}|{p_pack}|{str(int(p_c_gl_val))}|{p_frz}"
        opening_bal = round(stock_pool.get(exact_key, 0.0), 2)
        
        p_match = next((ps for ps in p_styles if str(ps.packing_style).strip().lower() == p_pack), None)
        mc_wt = float(p_match.mc_weight or 1.0) if p_match else 1.0
        ordered_qty = round(mc_wt * float(r.no_of_mc or 0), 2)
        pending_to_produce = ordered_qty - min(opening_bal, ordered_qty) if opening_bal > 0 else ordered_qty
        stock_pool[exact_key] = opening_bal - ordered_qty

        net_cnt = round((float(r.no_of_pieces or 0) / 2.20462) / c_gl_factor, 2) if r.no_of_pieces else 0
        hoso_req_qty, hoso_count_str = 0, "0"

        if "HOSO" in p_var:
            hoso_count_str = str(round(net_cnt))
            hoso_req_qty = pending_to_produce * w_gl_factor
        else:
            v_data = next((v for v in v_records if str(v.variety_name).strip().upper() == p_var), None)
            peeling_y = float(v_data.peeling_yield or 100) / 100 if v_data else 1.0
            soaking_y = float(v_data.soaking_yield or 100) / 100 if v_data else 1.0
            hl_cnt = round(net_cnt * peeling_y * soaking_y, 2)
            sp_yields = [y for y in yield_records if str(y.species).strip().upper() == p_spec]
            if sp_yields:
                nearest_y = min(sp_yields, key=lambda x: abs(float(x.hlso_count or 0) - hl_cnt))
                hoso_count_str = str(round(nearest_y.hoso_count))
                h_yield_pct = float(nearest_y.hlso_yield_pct or 100) / 100
                req_hlso = (pending_to_produce * w_gl_factor) / (peeling_y * soaking_y) if (peeling_y * soaking_y) > 0 else 0
                hoso_req_qty = req_hlso / h_yield_pct if h_yield_pct > 0 else 0

        agg_key = f"{p_spec}|{p_var}|{hoso_count_str}"
        if agg_key not in summary_agg:
            summary_agg[agg_key] = {"species": p_spec, "variety": p_var, "hoso_count": hoso_count_str, "total_req": 0}
        summary_agg[agg_key]["total_req"] += hoso_req_qty

        if agg_key not in drill_down_dict: drill_down_dict[agg_key] = []
        drill_down_dict[agg_key].append({
            "po_no": r.po_number, "buyer": r.buyer, "grade": r.grade,
            "ordered": ordered_qty, "pending": round(pending_to_produce, 2), "req": round(hoso_req_qty, 2)
        })

    return [
        {
            "species": v["species"], "variety": v["variety"], "hoso_count": v["hoso_count"],
            "total_hoso_req": round(v["total_req"], 2),
            "received_today": round(rec_map.get(f"{v['species']}|{v['hoso_count']}", 0.0), 2),
            "balance": round(v["total_req"] - rec_map.get(f"{v['species']}|{v['hoso_count']}", 0.0), 2)
        } for v in summary_agg.values()
    ], drill_down_dict


def get_cached_hoso_summary_data(db: Session, company_code: str, user_allowed_locations: list = None, global_p_for: str = None, global_loc: str = None):
    return get_hoso_summary_data(db, company_code, user_allowed_locations, global_p_for, global_loc)


def get_cached_rmp_page_masters(db: Session, company_code: str, user_allowed_locations: list = None, global_p_for: str = None, global_loc: str = None):
    def build():
        gate_q = db.query(GateEntry).filter(
            GateEntry.company_id == company_code,
            GateEntry.is_cancelled == False
        )
        if user_allowed_locations:
            allowed_clean = [loc.strip().upper() for loc in user_allowed_locations if loc.strip()]
            if allowed_clean:
                gate_q = gate_q.filter(func.upper(func.trim(GateEntry.receiving_center)).in_(allowed_clean))
        if global_loc:
            gate_q = gate_q.filter(func.trim(GateEntry.receiving_center) == func.trim(global_loc))
        if global_p_for:
            gate_q = gate_q.filter(func.trim(GateEntry.production_for) == func.trim(global_p_for))

        gate_entries = gate_q.order_by(GateEntry.id.desc()).all()
        prod_for_list = sorted(list(set([g.production_for for g in gate_entries if g.production_for])))
        prod_batch_map = {}
        batch_supplier_map = {}
        batch_list = []
        for g in gate_entries:
            if g.batch_number:
                batch_list.append(g.batch_number)
                batch_supplier_map[g.batch_number] = {
                    "supplier": g.supplier_name if g.supplier_name else "",
                    "prod_for": g.production_for if g.production_for else "",
                    "receiving_center": g.receiving_center if g.receiving_center else ""
                }
            if g.production_for:
                prod_batch_map.setdefault(g.production_for, [])
                if g.batch_number and g.batch_number not in prod_batch_map[g.production_for]:
                    prod_batch_map[g.production_for].append(g.batch_number)

        peeling_q = db.query(peeling_at).filter(peeling_at.company_id == company_code)
        if user_allowed_locations:
            allowed_clean = [loc.strip().upper() for loc in user_allowed_locations if loc.strip()]
            if allowed_clean:
                peeling_q = peeling_q.filter(func.upper(func.trim(peeling_at.peeling_at)).in_(allowed_clean))
        if global_loc:
            peeling_q = peeling_q.filter(func.trim(peeling_at.peeling_at) == func.trim(global_loc))

        hsn_records = db.query(hsn_codes).filter(hsn_codes.company_id == company_code).all()
        return {
            "batch_list": batch_list,
            "supplier_list": [s.supplier_name for s in db.query(suppliers).filter(suppliers.company_id == company_code).all()],
            "variety_list": [v.variety_name for v in db.query(varieties).filter(varieties.company_id == company_code).all()],
            "species_list": [s.species_name for s in db.query(species).filter(species.species_name != None, species.company_id == company_code).all()],
            "peeling_locations": [p.peeling_at for p in peeling_q.order_by(peeling_at.peeling_at).all()],
            "prod_for_list": prod_for_list,
            "hsn_list": [h.description for h in hsn_records],
            "hsn_map_json": json.dumps({h.description: h.hsn_code for h in hsn_records}),
            "prod_batch_map_json": json.dumps(prod_batch_map),
            "batch_supplier_map_json": json.dumps(batch_supplier_map),
        }

    return build()

# -----------------------------------------------------
# REUSABLE PAGE RENDERER 
# -----------------------------------------------------
def render_rmp_page(request: Request, db: Session, company_code: str, edit_data=None):
    # Fetch universal filters layer first
    global_production_for, global_location = get_global_filters(request)
    
    # FETCH USER ALLOWED PERMISSIONS LIST
    session_locations = request.session.get("allowed_locations", [])
    if isinstance(session_locations, str):
        user_allowed_locations = [loc.strip() for loc in session_locations.split(",") if loc.strip()]
    else:
        user_allowed_locations = session_locations

    # 🟢 🔴 REFACTOR: ఇప్పుడు సమ్మరీ క్యాలిక్యులేషన్ కూడా యూజర్ పర్మిషన్స్ మరియు గ్లోబల్ ఫిల్టర్స్ కి మ్యాచ్ అయి మారుతుంది!
    hoso_summary, drill_down = get_cached_hoso_summary_data(
        db=db, 
        company_code=company_code, 
        user_allowed_locations=user_allowed_locations,
        global_p_for=global_production_for,
        global_loc=global_location
    )
    master_context = get_cached_rmp_page_masters(
        db=db,
        company_code=company_code,
        user_allowed_locations=user_allowed_locations,
        global_p_for=global_production_for,
        global_loc=global_location,
    )

    start, end = get_today_range()
    today_q = db.query(RawMaterialPurchasing).filter(
        RawMaterialPurchasing.company_id == company_code,
        and_(
            RawMaterialPurchasing.date >= start.date(), 
            RawMaterialPurchasing.date <= end.date()
        )
    )
    
    if global_production_for:
        today_q = today_q.filter(func.trim(RawMaterialPurchasing.production_for) == func.trim(global_production_for))
    if global_location:
        today_q = today_q.filter(func.trim(RawMaterialPurchasing.peeling_at) == func.trim(global_location))
        
    today_data = today_q.order_by(RawMaterialPurchasing.id.desc()).all()

    context = {
        **master_context,
        "today_data": today_data, "edit_data": edit_data,
        "hoso_summary": hoso_summary, "drill_down_json": json.dumps(drill_down),
        "message": request.session.pop("message", None)
    }

    return templates.TemplateResponse(
        request=request,
        name="processing/raw_material_purchasing.html",
        context=context
    )

# -----------------------------------------------------
# ROUTES
# -----------------------------------------------------
@router.get("/raw_material_purchasing", response_class=HTMLResponse)
def show_rmp(request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code: return RedirectResponse("/auth/login", status_code=303)
    return render_rmp_page(request, db, company_code)

@router.get("/raw_material_purchasing/edit/{id}", response_class=HTMLResponse)
def edit_rmp(id: int, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    if not company_code: return RedirectResponse("/auth/login", status_code=303)
    
    entry = db.query(RawMaterialPurchasing).filter(RawMaterialPurchasing.id == id, RawMaterialPurchasing.company_id == company_code).first()
    if not entry: return RedirectResponse("/processing/raw_material_purchasing", status_code=303)
    if is_edit_locked(request, entry.date):
        request.session["message"] = f"❌ {edit_lock_message()}"
        return RedirectResponse("/processing/raw_material_purchasing", status_code=303)
    
    return render_rmp_page(request, db, company_code, edit_data=entry)

@router.post("/raw_material_purchasing")
def save_rmp(
    request: Request, batch_number: str = Form(...), supplier_name: str = Form(""),
    production_for: str = Form(""), 
    peeling_at: str = Form(""), variety_name: str = Form(""), species: str = Form(""), 
    hsn_code: str = Form(""), count: str = Form(""), g1_qty: float = Form(0.0), 
    g2_qty: float = Form(0.0), dc_qty: float = Form(0.0), rate_per_kg: float = Form(0.0), 
    material_boxes: float = Form(0.0), remarks: str = Form(""), db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")
    now = ist_now()
    received = g1_qty + g2_qty + dc_qty
    total_billable_qty = g1_qty + (g2_qty / 2)
    amount = round(total_billable_qty * rate_per_kg, 2)

    entry = RawMaterialPurchasing(
        batch_number=batch_number, supplier_name=supplier_name, 
        production_for=production_for, 
        peeling_at=peeling_at, variety_name=variety_name,
        species=species, hsn_code=hsn_code, count=count, g1_qty=g1_qty, g2_qty=g2_qty,
        dc_qty=dc_qty, received_qty=received, rate_per_kg=rate_per_kg, amount=amount,
        material_boxes=material_boxes, remarks=remarks, email=request.session.get("email"),
        date=now.date(), time=now.time(), company_id=comp_code
    )
    
    try:
        db.add(entry)
        db.flush()

        # Auto-post to accounting ledger
        email = request.session.get("email")
        journal_id = post_rm_purchase_to_ledger(db, comp_code, entry, email)
        entry.journal_id = journal_id

        db.commit()
    except Exception as e:
        db.rollback()
        request.session["message"] = f"❌ Save Failed: {str(e)}"
        return RedirectResponse("/processing/raw_material_purchasing", status_code=303)

    refresh_floor_balance(db, comp_code, batch_number=batch_number)
    request.session["message"] = "✔ Saved Successfully!"
    return RedirectResponse("/processing/raw_material_purchasing", status_code=303)

@router.post("/raw_material_purchasing/update/{id}")
def update_rmp(
    id: int, request: Request, batch_number: str = Form(...), supplier_name: str = Form(""),
    production_for: str = Form(""), 
    peeling_at: str = Form(""), variety_name: str = Form(""), species: str = Form(""), 
    hsn_code: str = Form(""), count: str = Form(""), g1_qty: float = Form(0.0), 
    g2_qty: float = Form(0.0), dc_qty: float = Form(0.0), rate_per_kg: float = Form(0.0), 
    material_boxes: float = Form(0.0), remarks: str = Form(""), db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")
    entry = db.query(RawMaterialPurchasing).filter(RawMaterialPurchasing.id == id, RawMaterialPurchasing.company_id == comp_code).first()
    if not entry: return RedirectResponse("/processing/raw_material_purchasing", status_code=303)
    if is_edit_locked(request, entry.date):
        request.session["message"] = f"❌ {edit_lock_message()}"
        return RedirectResponse("/processing/raw_material_purchasing", status_code=303)

    old_batch_number = entry.batch_number
    total_billable_qty = g1_qty + (g2_qty / 2)
    
    try:
        entry.batch_number, entry.supplier_name = batch_number, supplier_name
        entry.production_for = production_for 
        entry.peeling_at = peeling_at
        entry.variety_name, entry.species, entry.hsn_code = variety_name, species, hsn_code
        entry.count, entry.g1_qty, entry.g2_qty, entry.dc_qty = count, g1_qty, g2_qty, dc_qty
        entry.received_qty = g1_qty + g2_qty + dc_qty
        entry.amount = round(total_billable_qty * rate_per_kg, 2)
        entry.rate_per_kg = rate_per_kg
        entry.material_boxes, entry.remarks = material_boxes, remarks
        
        email = request.session.get("email")
        # Cancel old linked voucher
        if entry.journal_id:
            cancel_linked_voucher(db, comp_code, entry.journal_id, email)
            
        # Post new voucher
        journal_id = post_rm_purchase_to_ledger(db, comp_code, entry, email)
        entry.journal_id = journal_id

        db.commit()
    except Exception as e:
        db.rollback()
        request.session["message"] = f"❌ Update Failed: {str(e)}"
        return RedirectResponse("/processing/raw_material_purchasing", status_code=303)
    refresh_floor_balance(db, comp_code, batch_number=batch_number)
    if old_batch_number != batch_number:
        refresh_floor_balance(db, comp_code, batch_number=old_batch_number)
    request.session["message"] = "✔ Updated Successfully!"
    return RedirectResponse("/processing/raw_material_purchasing", status_code=303)

from app.utils.trace_lock import is_batch_used_downstream_from_rmp

@router.post("/raw_material_purchasing/delete/{id}")
def delete_rmp(
    id: int,
    request: Request,
    cancel_reason: str = Form(None),
    db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")
    if not comp_code:
        return RedirectResponse("/auth/login", status_code=303)

    entry = db.query(RawMaterialPurchasing).filter(
        RawMaterialPurchasing.id == id,
        RawMaterialPurchasing.company_id == comp_code
    ).first()

    if entry:
        if entry.is_cancelled:
            request.session["message"] = "❌ Already cancelled!"
            return RedirectResponse("/processing/raw_material_purchasing", status_code=303)

        if is_edit_locked(request, entry.date):
            request.session["message"] = f"❌ {edit_lock_message()}"
            return RedirectResponse("/processing/raw_material_purchasing", status_code=303)

        # 🔒 Downstream Traceability Check
        is_used, stage = is_batch_used_downstream_from_rmp(db, entry.batch_number, entry.company_id)
        if is_used:
            request.session["message"] = f"❌ Cannot cancel: Batch '{entry.batch_number}' is already processed in {stage}!"
            return RedirectResponse("/processing/raw_material_purchasing", status_code=303)

        batch_to_refresh = entry.batch_number
        
        try:
            # Soft delete / Cancel
            entry.is_cancelled = True
            entry.status = "Cancelled"
            entry.cancel_reason = cancel_reason.strip() if cancel_reason else "Cancelled by user"
            entry.cancelled_by = request.session.get("email")
            entry.cancelled_at = ist_now()

            # Cancel linked voucher
            if entry.journal_id:
                cancel_linked_voucher(db, comp_code, entry.journal_id, entry.cancelled_by)

            db.commit()
        except Exception as e:
            db.rollback()
            request.session["message"] = f"❌ Cancellation Failed: {str(e)}"
            return RedirectResponse("/processing/raw_material_purchasing", status_code=303)
        refresh_floor_balance(db, comp_code, batch_number=batch_to_refresh)
        request.session["message"] = "✔ Cancelled Successfully!"
    else:
        request.session["message"] = "❌ Record not found!"

    return RedirectResponse("/processing/raw_material_purchasing", status_code=303)
