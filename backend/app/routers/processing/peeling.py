import json
import re
import logging
from fastapi import APIRouter, Request, Depends, Form, Query, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime, date
from app.utils.timezone import ist_now
from sqlalchemy import func, distinct, or_, and_, text
import datetime as dt

from app.database import get_db
from app.database.models.processing import Peeling, TableRegistration
from app.database.models.attendance import KgBasisWorker, KgBasisWorkerAttendance
from app.database.models.floor_balance import FloorBalance  # Single Point of Live Truth
from app.database.models.criteria import (
    varieties, 
    contractors, 
    peeling_rates, 
    species, 
    peeling_at,
    production_at,
    packing_styles,
    production_for as ProductionForMaster
)
from app.database.models.inventory_management import stock_entry, pending_orders
from app.utils.global_filters import get_global_filters
from app.services.floor_balance import get_floor_balance
from app.utils.edit_lock import is_edit_locked, edit_lock_message
from app.utils.cancel_math import signed_sum
from app.services.bill_accounting import ensure_bill_accounting_schema, post_contractor_source_charge
from app.services.operational_vouchers import deactivate_operational_charge

router = APIRouter(tags=["PEELING"])
templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)

def validate_kg_worker_table_registration(db: Session, company_code: str, worker_type: str, no_of_workers: int, worker_ids: str, production_at: str = None):
    if worker_type.strip() == "Contractor":
        if no_of_workers <= 0:
            return "Number of Workers must be greater than 0."
        return None

    ids_list = list(dict.fromkeys(w.strip() for w in (worker_ids or "").split(",") if w.strip()))
    if len(ids_list) != no_of_workers:
        return f"Selected worker count ({len(ids_list)}) must match Number of Workers ({no_of_workers})."
    if not ids_list:
        return "Select at least one punched-in KG Basis worker."

    query = db.query(KgBasisWorkerAttendance.worker_id).join(
        KgBasisWorker,
        (KgBasisWorker.company_id == KgBasisWorkerAttendance.company_id)
        & (KgBasisWorker.worker_id == KgBasisWorkerAttendance.worker_id)
    ).filter(
        KgBasisWorkerAttendance.company_id == company_code,
        KgBasisWorkerAttendance.attendance_date == ist_now().date(),
        KgBasisWorkerAttendance.status == "INSIDE",
        KgBasisWorker.status == "ACTIVE",
        KgBasisWorkerAttendance.worker_id.in_(ids_list),
    )
    clean_location = (production_at or "").strip()
    if clean_location:
        query = query.filter(func.upper(func.trim(KgBasisWorkerAttendance.production_at)) == clean_location.upper())

    inside_ids = {worker_id for (worker_id,) in query.all()}
    missing_ids = [worker_id for worker_id in ids_list if worker_id not in inside_ids]
    if missing_ids:
        return f"Only punched-in KG Basis workers can be registered. Not currently IN: {', '.join(missing_ids)}"
    return None

def get_cached_masters(db: Session, company_id: str, force_refresh: bool = False):
    v_q = db.query(varieties.variety_name)
    if company_id:
        v_q = v_q.filter(func.upper(func.trim(varieties.company_id)) == company_id.strip().upper())
    v_list = [v[0] for v in v_q.order_by(varieties.variety_name).all() if v[0]]
    if not v_list:
        v_list = [v[0] for v in db.query(varieties.variety_name).order_by(varieties.variety_name).all() if v[0]]

    c_q = db.query(contractors.contractor_name)
    if company_id:
        c_q = c_q.filter(func.upper(func.trim(contractors.company_id)) == company_id.strip().upper())
    c_list = [c[0] for c in c_q.order_by(contractors.contractor_name).all() if c[0]]
    if not c_list:
        c_list = [c[0] for c in db.query(contractors.contractor_name).order_by(contractors.contractor_name).all() if c[0]]

    s_q = db.query(species.species_name)
    if company_id:
        s_q = s_q.filter(func.upper(func.trim(species.company_id)) == company_id.strip().upper())
    s_list = [s[0] for s in s_q.order_by(species.species_name).all() if s[0]]
    if not s_list:
        s_list = [s[0] for s in db.query(species.species_name).order_by(species.species_name).all() if s[0]]

    pf_q = db.query(distinct(ProductionForMaster.production_for))
    if company_id:
        pf_q = pf_q.filter(func.upper(func.trim(ProductionForMaster.company_id)) == company_id.strip().upper())
    raw_pf = [p[0] for p in pf_q.all() if p[0]]
    if not raw_pf:
        raw_pf = [p[0] for p in db.query(distinct(ProductionForMaster.production_for)).all() if p[0]]
    excluded_names = {"MAIN UNIT", "GENERAL STOCK", "N/A", "NONE", "NULL"}
    pf_list = [p for p in raw_pf if p.upper().strip() not in excluded_names]

    return {"varieties": v_list, "contractors": c_list, "species": s_list, "prod_for_list": pf_list}


def contractor_gst_percent(db: Session, company_id: str, contractor_name: str) -> float:
    row = db.query(contractors).filter(
        contractors.company_id == company_id,
        contractors.contractor_name == contractor_name,
    ).first()
    return float(row.gst_percent or 0) if row else 0.0


# =====================================================
# 🔥 CENTRALIZED ATOMIC INVENTORY ENGINE (WITH NEGATIVE GUARD)
# =====================================================
def update_floor_balance_row(
    db: Session, company_id: str, batch: str, count: str, species_val: str, 
    variety: str, location: str, production_for: str, qty_delta: float, email: str = None
):
    now_ist = ist_now()
    clean_loc = "FLOOR" if not location or location.strip() == "" else location.strip().upper()
    
    row = db.query(FloorBalance).filter(
        FloorBalance.company_id == company_id,
        or_(
            func.upper(func.trim(FloorBalance.location)) == clean_loc,
            func.upper(func.trim(FloorBalance.location)) == "OTHER FLOOR" if clean_loc == "FLOOR" else False
        ),
        FloorBalance.batch_number == batch.strip(),
        FloorBalance.count == count.strip(),
        FloorBalance.species == species_val,
        FloorBalance.variety == variety,
        func.upper(func.trim(FloorBalance.production_for)) == production_for.strip().upper()
    ).with_for_update().first()

    if row:
        if qty_delta < 0 and (row.available_qty + qty_delta) < -0.01:
            raise HTTPException(
                status_code=400, 
                detail=f"Operation rejected. Insufficient balance for {variety}. Available: {row.available_qty}, Needed: {abs(qty_delta)}"
            )
        row.available_qty += qty_delta
        row.last_updated = now_ist
        if email: row.email = email
    else:
        if qty_delta < 0:
            raise HTTPException(status_code=400, detail=f"Target stock row not found for {variety} deduction.")
            
        new_row = FloorBalance(
            company_id=company_id, location=clean_loc, production_for=production_for, 
            batch_number=batch.strip(), source_type="RMP", species=species_val, variety=variety, count=count.strip(),
            available_qty=qty_delta, last_transaction="PEELING_MUTATION",
            last_updated=now_ist, date=str(now_ist.date()), time=str(now_ist.time()), email=email
        )
        db.add(new_row)


# =====================================================
# DASHBOARD PAGE - 100% LIVE SNAPSHOT ENGINE (⚡ ~20ms)
# =====================================================
@router.get("/peeling", response_class=HTMLResponse)
def show_peeling(request: Request, db: Session = Depends(get_db)):
    global_production_for, global_location = get_global_filters(request)
    
    g_prod_clean = global_production_for.strip().upper() if global_production_for else None
    g_loc_clean = global_location.strip().upper() if global_location else None

    email = request.session.get("email")
    raw_company_id = request.session.get("company_code")

    if not email or raw_company_id is None:
        return RedirectResponse("/auth/login", status_code=303)
    
    company_id = str(raw_company_id)

    session_locations = request.session.get("allowed_locations", [])
    if isinstance(session_locations, str):
        user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()]
    else:
        user_allowed_locations = [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]
    
    # 1st TABLE: DIRECT FAST INVENTORY READ
    live_q = db.query(FloorBalance).filter(
        FloorBalance.company_id == company_id,
        FloorBalance.variety.ilike("%HLSO%")
    )

    if g_prod_clean and g_prod_clean != "ALL":
        live_q = live_q.filter(func.upper(func.trim(FloorBalance.production_for)) == g_prod_clean)
    
    if g_loc_clean and g_loc_clean != "ALL":
        if g_loc_clean in ["FLOOR", "OTHER FLOOR"]:
            live_q = live_q.filter(or_(
                func.upper(func.trim(FloorBalance.location)) == "FLOOR",
                func.upper(func.trim(FloorBalance.location)) == "OTHER FLOOR",
                FloorBalance.location == None,
                func.trim(FloorBalance.location) == ""
            ))
        else:
            live_q = live_q.filter(func.upper(func.trim(FloorBalance.location)) == g_loc_clean)
    elif user_allowed_locations:
        live_q = live_q.filter(func.upper(func.trim(FloorBalance.location)).in_(user_allowed_locations))

    live_records = live_q.order_by(FloorBalance.production_for, FloorBalance.location, FloorBalance.batch_number).all()
    hlso_floor_balance = []
    for r in live_records:
        available_qty = get_floor_balance(
            db, company_id, r.location, r.batch_number, r.count, r.species,
            r.variety, r.production_for, r.source_type or "RMP"
        )
        if available_qty <= 0.01:
            continue
        hlso_floor_balance.append({
            "batch": r.batch_number or "N/A",
            "variety": r.variety or "N/A",
            "count": r.count or "N/A",
            "species": r.species or "N/A",
            "production_for": r.production_for or "General Stock",
            "location": r.location or "Floor",
            "available_qty": round(available_qty, 2)
        })
    
    # =====================================================
    # 🟢 2nd TABLE: REQUIRED HLSO REQUIREMENTS SYNC LAYER (FIXED LOCATION FILTERS)
    # =====================================================
    po_q = db.query(pending_orders).filter(
        pending_orders.company_id == company_id,
        (pending_orders.progress_steps != 'completed') | (pending_orders.progress_steps.is_(None))
    )
    stock_q = db.query(stock_entry).filter(stock_entry.company_id == company_id)

    # Production For Filter
    if g_prod_clean and g_prod_clean != "ALL":
        po_q = po_q.filter(func.upper(func.trim(pending_orders.company_name)) == g_prod_clean)
        stock_q = stock_q.filter(func.upper(func.trim(stock_entry.production_for)) == g_prod_clean)

    # Strict Location / Production At Filter
    if g_loc_clean and g_loc_clean != "ALL":
        po_q = po_q.filter(func.upper(func.trim(pending_orders.production_at)) == g_loc_clean)
        stock_q = stock_q.filter(func.upper(func.trim(stock_entry.production_at)) == g_loc_clean)
    elif user_allowed_locations:
        po_q = po_q.filter(func.upper(func.trim(pending_orders.production_at)).in_(user_allowed_locations))
        stock_q = stock_q.filter(func.upper(func.trim(stock_entry.production_at)).in_(user_allowed_locations))
        
    p_orders = po_q.all()
    all_stock = stock_q.all()
    masters = get_cached_masters(db, company_id)
    
    # PERFORMANCE OPTIMIZATION LOCK
    variety_master_map = {
        v.variety_name.lower().strip(): v
        for v in db.query(varieties).filter(varieties.company_id == company_id).all()
    }
    packing_style_map = {
        p.packing_style.lower().strip(): float(p.mc_weight or 1.0)
        for p in db.query(packing_styles).filter(packing_styles.company_id == company_id).all()
        if p.packing_style
    }
    
    stock_pool = {}
    for s in all_stock:
        # 🟢 FIX: Location check in python loop (Using production_at)
        s_loc_clean = str(s.production_at or "").strip().upper()
        
        if user_allowed_locations and s_loc_clean != "FLOOR" and s_loc_clean not in user_allowed_locations:
            continue
        if g_loc_clean and g_loc_clean != "ALL" and s_loc_clean != g_loc_clean:
            continue

        gl_match = re.search(r'(\d+)', str(s.glaze or "0"))
        gl_val = gl_match.group(1) if gl_match else "0"
        s_frz = str(s.freezer or "N/A").strip().lower()
        key = f"{str(s.production_for or '').strip().upper()}|{str(s.species).strip().lower()}|{str(s.variety).strip().lower()}|{str(s.grade).strip().lower()}|{str(s.packing_style).strip().lower()}|{gl_val}|{s_frz}"
        qty = float(s.quantity or 0)
        stock_pool[key] = stock_pool.get(key, 0.0) + (qty if str(s.cargo_movement_type).upper() == "IN" else -qty)

    hlso_summary, drill_down_data = {}, {"hlso": {}}

    for p in p_orders:
        p_var = str(p.variety or "").strip().lower()
        if "hoso" in p_var: continue 

        p_spec, p_grad = str(p.species or "").strip().lower(), str(p.grade or "").strip().lower()
        p_pack = str(p.packing_style or "").strip().lower()
        p_frz = str(p.freezer or "N/A").strip().lower()
        p_comp = str(p.company_name or "").strip().upper()

        c_gl_match = re.search(r'(\d+)', str(p.count_glaze or "0"))
        c_gl_factor = (100 - float(c_gl_match.group(1))) / 100 if c_gl_match else 1.0
        w_gl_match = re.search(r'(\d+)', str(p.weight_glaze or "0"))
        w_gl_factor = (100 - float(w_gl_match.group(1))) / 100 if w_gl_match else 1.0

        gl_key_val = str(int(float(c_gl_match.group(1)) if c_gl_match else 0))
        exact_key = f"{p_comp}|{p_spec}|{p_var}|{p_grad}|{p_pack}|{gl_key_val}|{p_frz}"
        opening_bal = stock_pool.get(exact_key, 0.0)

        mc_wt = packing_style_map.get(p_pack, 1.0)
        ordered_qty = round(mc_wt * float(p.no_of_mc or 0), 2)
        pending_prod = opening_bal - ordered_qty
        stock_pool[exact_key] = pending_prod

        if pending_prod < 0:
            abs_pending = abs(pending_prod)
            
            # O(1) Fast Memory Lookup
            v_data = variety_master_map.get(p_var)
            peeling_y = float(v_data.peeling_yield or 100) / 100 if v_data else 1.0
            soaking_y = float(v_data.soaking_yield or 100) / 100 if v_data else 1.0
            
            net_count = round((float(p.no_of_pieces or 0) / 2.20462) / c_gl_factor, 2) if p.no_of_pieces else 0
            hl_count_calc = round(net_count * peeling_y * soaking_y, 2)
            req_hlso_qty = round((abs_pending * w_gl_factor) / (peeling_y * soaking_y), 2)

            if req_hlso_qty > 0:
                summary_key = f"{p_comp}|{p.species}|{p.variety}|{hl_count_calc}"
                if summary_key not in hlso_summary:
                    hlso_summary[summary_key] = {
                        "production_for": p.company_name or "General Stock",
                        "location": "FLOOR",
                        "species": p.species,
                        "variety": p.variety,
                        "count": hl_count_calc,
                        "total_kg": 0
                    }
                    drill_down_data["hlso"][summary_key] = []
                
                hlso_summary[summary_key]["total_kg"] += req_hlso_qty
                drill_down_data["hlso"][summary_key].append({"po_no": p.po_number, "buyer": getattr(p, 'buyer', 'N/A'), "grade": p.grade, "qty": req_hlso_qty})

    # =====================================================
    # 3rd TABLE TABS SYSTEM ALIGNMENT
    # =====================================================
    # Tab 1: Today's Raw Log Logs 
    today_q = db.query(Peeling).filter(Peeling.company_id == company_id, Peeling.date == ist_now().date())
    if g_prod_clean and g_prod_clean != "ALL":
        today_q = today_q.filter(func.upper(func.trim(Peeling.production_for)) == g_prod_clean)
    if g_loc_clean and g_loc_clean != "ALL":
        if g_loc_clean in ["FLOOR", "OTHER FLOOR"]:
            today_q = today_q.filter(or_(func.upper(func.trim(Peeling.peeling_at)) == "FLOOR", func.upper(func.trim(Peeling.peeling_at)) == "OTHER FLOOR", Peeling.peeling_at == None, func.trim(Peeling.peeling_at) == ""))
        else:
            today_q = today_q.filter(func.upper(func.trim(Peeling.peeling_at)) == g_loc_clean)
    elif user_allowed_locations:
        today_q = today_q.filter(func.upper(func.trim(Peeling.peeling_at)).in_(user_allowed_locations))
        
    today_data = today_q.order_by(Peeling.id.desc()).all()

    # Tab 2: Contractor-wise Aggregation Summary Query
    contractor_q = db.query(
        Peeling.contractor_name,
        signed_sum(Peeling, Peeling.hlso_qty).label("total_hlso"),
        signed_sum(Peeling, Peeling.peeled_qty).label("total_peeled"),
        signed_sum(Peeling, Peeling.amount).label("total_amount")
    ).filter(Peeling.company_id == company_id, Peeling.date == ist_now().date())
    
    if g_prod_clean and g_prod_clean != "ALL":
        contractor_q = contractor_q.filter(func.upper(func.trim(Peeling.production_for)) == g_prod_clean)
    if g_loc_clean and g_loc_clean != "ALL":
        contractor_q = contractor_q.filter(func.upper(func.trim(Peeling.peeling_at)) == g_loc_clean)
    elif user_allowed_locations:
        contractor_q = contractor_q.filter(func.upper(func.trim(Peeling.peeling_at)).in_(user_allowed_locations))
        
    contractor_summary_q = contractor_q.group_by(Peeling.contractor_name).all()
    contractor_summary = [{"contractor_name": r[0], "total_hlso": round(r[1] or 0, 2), "total_peeled": round(r[2] or 0, 2), "total_amount": round(r[3] or 0, 2)} for r in contractor_summary_q]

    # =====================================================
    # Tab 3 : Variety Summary (Live Inventory Direct Read)
    # =====================================================
    variety_summary_q = db.query(
        FloorBalance.production_for.label("production_for"),
        FloorBalance.location.label("location"),
        FloorBalance.batch_number.label("batch_number"),
        FloorBalance.species.label("species"),
        FloorBalance.variety.label("variety_name"),
        FloorBalance.count.label("count"),
        func.sum(FloorBalance.available_qty).label("qty")
    ).filter(
        FloorBalance.company_id == company_id,
        FloorBalance.available_qty > 0.01,
        func.upper(func.trim(FloorBalance.variety)).notin_(["HOSO", "HLSO"])
    )

    if g_prod_clean and g_prod_clean != "ALL":
        variety_summary_q = variety_summary_q.filter(func.upper(func.trim(FloorBalance.production_for)) == g_prod_clean)

    if g_loc_clean and g_loc_clean != "ALL":
        if g_loc_clean in ["FLOOR", "OTHER FLOOR"]:
            variety_summary_q = variety_summary_q.filter(or_(
                func.upper(func.trim(FloorBalance.location)) == "FLOOR",
                func.upper(func.trim(FloorBalance.location)) == "OTHER FLOOR",
                FloorBalance.location == None,
                func.trim(FloorBalance.location) == ""
            ))
        else:
            variety_summary_q = variety_summary_q.filter(func.upper(func.trim(FloorBalance.location)) == g_loc_clean)
    elif user_allowed_locations:
        variety_summary_q = variety_summary_q.filter(func.upper(func.trim(FloorBalance.location)).in_(user_allowed_locations))

    variety_summary_q = (
        variety_summary_q
        .group_by(
            FloorBalance.production_for,
            FloorBalance.location,
            FloorBalance.batch_number,
            FloorBalance.species,
            FloorBalance.variety,
            FloorBalance.count
        )
        .order_by(
            FloorBalance.production_for,
            FloorBalance.location,
            FloorBalance.batch_number,
            FloorBalance.species,
            FloorBalance.variety,
            FloorBalance.count
        )
        .all()
    )

    variety_summary = [
        {
            "production_for": r.production_for or "General Stock",
            "location": r.location or "Purchased Stock",
            "batch_number": r.batch_number or "-",
            "species": r.species or "-",
            "variety_name": r.variety_name,
            "count": r.count or "-",
            "total_hlso": round(r.qty or 0, 2),   
            "total_peeled": 0,
            "avg_yield": 0
        }
        for r in variety_summary_q
    ]

    pa_q = db.query(production_at.production_at).filter(production_at.company_id == company_id)
    pe_q = db.query(peeling_at.peeling_at).filter(peeling_at.company_id == company_id)
    pa_list = list(dict.fromkeys(
        [p[0] for p in pa_q.all() if p[0]] +
        [p[0] for p in pe_q.all() if p[0]]
    ))
    success_msg = request.session.pop("success_msg", None)

    if request.query_params.get("format") == "json":
        return JSONResponse({
            "varieties": masters["varieties"],
            "contractors": masters["contractors"],
            "peeling_locations": pa_list,
            "prod_for_list": masters["prod_for_list"],
            "today_data": [
                {
                    "id": r.id,
                    "date": r.date.isoformat() if r.date else None,
                    "time": r.time.strftime("%H:%M") if r.time else None,
                    "production_for": r.production_for,
                    "peeling_at": r.peeling_at,
                    "batch_number": r.batch_number,
                    "hlso_count": r.hlso_count,
                    "species": r.species,
                    "variety_name": r.variety_name,
                    "hlso_qty": r.hlso_qty,
                    "peeled_qty": r.peeled_qty,
                    "peeled_qty_expr": r.peeled_qty_expr,
                    "yield_percent": r.yield_percent,
                    "contractor_name": r.contractor_name,
                    "table_no": r.table_no,
                    "rate": r.rate,
                    "amount": r.amount,
                    "is_cancelled": r.is_cancelled,
                    "status": r.status,
                    "cancel_reason": r.cancel_reason,
                    "cancelled_by": r.cancelled_by,
                    "cancelled_at": r.cancelled_at.isoformat() if r.cancelled_at else None,
                    "email": r.email
                } for r in today_data
            ],
            "hlso_floor_balance": hlso_floor_balance,
            "hlso_summary": list(hlso_summary.values()),
            "variety_summary": variety_summary,
            "drill_down_json": drill_down_data,
            "selected_production_for": global_production_for or "",
            "selected_location": global_location or ""
        })

    return templates.TemplateResponse(
        request=request, name="processing/peeling.html",
        context={
            "success_msg": success_msg, 
            "varieties": masters["varieties"], 
            "contractors": masters["contractors"], 
            "species": masters["species"], 
            "peeling_locations": pa_list, 
            "prod_for_list": masters["prod_for_list"],
            "today_data": today_data,                    
            "contractor_summary": contractor_summary,    
            "variety_summary": variety_summary,          
            "hlso_floor_balance": hlso_floor_balance, 
            "hlso_summary": list(hlso_summary.values()), 
            "drill_down_json": json.dumps(drill_down_data)
        }
    )


# =====================================================
# SEARCHABLE DROPDOWNS: DIRECT SNAPSHOT READS
# =====================================================
@router.get("/peeling/get_batches_by_company")
def get_batches_by_company(prod_for: str, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id or not prod_for: return {"batches": []}
    global_p_for, global_loc = get_global_filters(request)
    prod_for = global_p_for or prod_for
    
    session_locations = request.session.get("allowed_locations", [])
    user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()] if isinstance(session_locations, str) else [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]

    batch_q = db.query(FloorBalance).filter(
        FloorBalance.company_id == company_id,
        func.upper(func.trim(FloorBalance.production_for)) == prod_for.strip().upper(),
        FloorBalance.variety.ilike("%HLSO%")
    )
    if global_loc:
        batch_q = batch_q.filter(func.upper(func.trim(FloorBalance.location)) == global_loc.strip().upper())
    if user_allowed_locations:
        batch_q = batch_q.filter(func.upper(func.trim(FloorBalance.location)).in_(user_allowed_locations))

    rows = batch_q.order_by(FloorBalance.batch_number).all()
    batches = {
        r.batch_number for r in rows
        if r.batch_number and get_floor_balance(db, company_id, r.location, r.batch_number, r.count, r.species, r.variety, r.production_for, r.source_type or "RMP") > 0.01
    }
    return {"batches": sorted(batches)}


@router.get("/peeling/get_hlso/{batch}")
def get_hlso_counts_by_batch(batch: str, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id: return {"counts": [], "species_map": {}, "variety_map": {}}
    
    global_p_for, global_loc = get_global_filters(request)
    g_prod_clean = global_p_for.strip().upper() if global_p_for else None
    g_loc_clean = global_loc.strip().upper() if global_loc else None

    records_q = db.query(FloorBalance).filter(
        FloorBalance.company_id == company_id,
        FloorBalance.batch_number == batch.strip(),
        FloorBalance.variety.ilike("%HLSO%")
    )
    if g_prod_clean:
        records_q = records_q.filter(func.upper(func.trim(FloorBalance.production_for)) == g_prod_clean)
    
    if g_loc_clean and g_loc_clean != "ALL":
        records_q = records_q.filter(func.upper(func.trim(FloorBalance.location)) == g_loc_clean)

    records = records_q.all()
    
    valid_counts, species_map, variety_map = set(), {}, {}
    for r in records:
        if get_floor_balance(db, company_id, r.location, r.batch_number, r.count, r.species, r.variety, r.production_for, r.source_type or "RMP") <= 0.01:
            continue
        count, spc, var = r.count, r.species, r.variety
        if not count or str(count).upper() == "N/A": continue
        count_str = str(count).strip()
        valid_counts.add(count_str)
        species_map[count_str] = spc or "N/A"
        variety_map[count_str] = var

    return {"counts": sorted(list(valid_counts)), "species_map": species_map, "variety_map": variety_map}


# =====================================================
# API: GET AVAILABLE QTY
# =====================================================
@router.get("/peeling/get_available_qty")
def get_available_qty(
    location: str = Query(...), batch: str = Query(...), count: str = Query(...), 
    species_name: str = Query(...), variety_name: str = Query(...),
    production_for: str = Query(...), request: Request = None, db: Session = Depends(get_db)
):
    company_code = str(request.session.get("company_code") or "").strip().upper()
    if not company_code: return {"available_qty": 0}

    global_p_for, global_loc = get_global_filters(request)
    if global_p_for:
        production_for = global_p_for
    if global_loc:
        location = global_loc
    
    clean_loc = "FLOOR" if not location or location.strip() == "" else location.strip().upper()
    session_locations = request.session.get("allowed_locations", [])
    user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()] if isinstance(session_locations, str) else [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]
    if user_allowed_locations and clean_loc not in user_allowed_locations:
        return {"available_qty": 0}

    prod_for_clean = production_for.strip() if production_for else ""
    if prod_for_clean in ("General Stock", "GENERAL STOCK", "N/A", ""):
        prod_for_clean = None

    fb_query = db.query(FloorBalance.source_type, FloorBalance.location).filter(
        FloorBalance.company_id == company_code, 
        or_(
            func.upper(func.trim(FloorBalance.location)) == clean_loc,
            func.upper(func.trim(FloorBalance.location)) == "OTHER FLOOR" if clean_loc == "FLOOR" else False
        ),
        FloorBalance.batch_number == batch.strip(), 
        FloorBalance.count == count.strip(),
        FloorBalance.species == species_name, 
        FloorBalance.variety == variety_name
    )

    if prod_for_clean:
        fb_query = fb_query.filter(func.upper(func.trim(FloorBalance.production_for)) == prod_for_clean.upper())
    else:
        fb_query = fb_query.filter((FloorBalance.production_for == None) | (func.trim(FloorBalance.production_for) == ""))

    source_row = fb_query.first()
    service_location = source_row[1] if source_row and source_row[1] else clean_loc
    available_qty = get_floor_balance(
        db, company_code, service_location, batch, count, species_name, variety_name,
        production_for, source_row[0] if source_row else "RMP"
    )
    return {"available_qty": round(available_qty, 2)}


@router.get("/peeling/get_rate")
def get_rate(request: Request, contractor: str = Query(...), variety: str = Query(...), count: str = Query(None), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    c_clean = contractor.strip()
    v_clean = variety.strip()

    query = db.query(peeling_rates).filter(
        or_(
            peeling_rates.company_id == company_id,
            peeling_rates.company_id == None,
            peeling_rates.company_id == ''
        ),
        or_(
            peeling_rates.contractor_name == c_clean,
            func.lower(func.trim(peeling_rates.contractor_name)) == c_clean.lower(),
            and_(
                c_clean.upper() in ["KG BASIS", "KG BASIS COMPANY WORKER", "DAILY BASIS"],
                func.lower(peeling_rates.contractor_name).contains("kg")
            )
        ),
        func.lower(func.trim(peeling_rates.variety_name)) == v_clean.lower()
    )

    if count:
        cnt_clean = count.strip()
        cnt_row = query.filter(peeling_rates.hlso_count == cnt_clean).order_by(peeling_rates.effective_from.desc()).first()
        if cnt_row:
            return {"rate": float(cnt_row.rate) if cnt_row.rate else 0.0}

    row = query.order_by(peeling_rates.effective_from.desc()).first()
    return {"rate": float(row.rate) if row and row.rate else 0.0}


def approved_peeling_rate(db: Session, company_id: str, contractor: str, variety: str, count: str | None) -> float:
    clean_contractor = (contractor or "").strip()
    query = db.query(peeling_rates).filter(
        or_(peeling_rates.company_id == company_id, peeling_rates.company_id == None, peeling_rates.company_id == ''),
        or_(
            peeling_rates.contractor_name == clean_contractor,
            func.lower(func.trim(peeling_rates.contractor_name)) == clean_contractor.lower(),
            and_(
                clean_contractor.upper() in ["KG BASIS", "KG BASIS COMPANY WORKER", "DAILY BASIS"],
                func.lower(peeling_rates.contractor_name).contains("kg"),
            ),
        ),
        func.lower(func.trim(peeling_rates.variety_name)) == (variety or "").strip().lower(),
    )
    if count:
        row = query.filter(peeling_rates.hlso_count == count.strip()).order_by(peeling_rates.effective_from.desc()).first()
        if row:
            return float(row.rate or 0.0)
    row = query.order_by(peeling_rates.effective_from.desc()).first()
    return float(row.rate or 0.0) if row else 0.0


# =====================================================
# ACTION: SAVE PEELING (⚡ ZEPTO STYLE MUTATION)
# =====================================================
@router.post("/peeling")
def save_peeling(
    request: Request, db: Session = Depends(get_db), production_for: str = Form(...), location: str = Form(...), 
    batch_number: str = Form(...), in_count: str = Form(...), species: str = Form(...), variety: str = Form(...),
    hlso_qty: float = Form(...), peeled_qty: float = Form(...), yield_percent: str = Form(...), 
    contractor_name: str = Form(...), rate: float = Form(...), amount: float = Form(...),
    table_no: str = Form(None), peeled_qty_expr: str = Form(None)
):
    company_code = str(request.session.get("company_code") or "").strip().upper()
    email = request.session.get("email")
    if not company_code: return JSONResponse({"error": "Unauthorized"}, status_code=401)
    
    try:
        ensure_bill_accounting_schema(db)

        clean_batch = str(batch_number).strip()
        clean_count = str(in_count).strip()
        clean_loc = "FLOOR" if not location or location.strip() == "" else location.strip().upper()

        live_record = db.query(FloorBalance).filter(
            FloorBalance.company_id == company_code, 
            or_(
                func.upper(func.trim(FloorBalance.location)) == clean_loc,
                func.upper(func.trim(FloorBalance.location)) == "OTHER FLOOR" if clean_loc == "FLOOR" else False
            ),
            FloorBalance.batch_number == clean_batch, 
            FloorBalance.count == clean_count,
            FloorBalance.species == species, 
            FloorBalance.variety.ilike("%HLSO%"),
            func.upper(func.trim(FloorBalance.production_for)) == production_for.strip().upper()
        ).with_for_update().first()
        
        input_variety = live_record.variety if live_record else "HLSO"
        service_location = live_record.location if live_record and live_record.location else clean_loc
        avail = get_floor_balance(
            db, company_code, service_location, clean_batch, clean_count, species,
            input_variety, production_for, live_record.source_type if live_record else "RMP"
        )
        if hlso_qty <= 0 or peeled_qty <= 0:
            return JSONResponse({"error": "HLSO and peeled quantities must be greater than zero"}, status_code=400)
        if hlso_qty > (avail + 0.05):
            return JSONResponse({"error": f"Insufficient live balance. Available: {round(avail, 2)} KG"}, status_code=400)

        approved_rate = approved_peeling_rate(db, company_code, contractor_name, variety, clean_count)
        if approved_rate <= 0:
            return JSONResponse({"error": "No approved Peeling rate found for this contractor, variety, and count"}, status_code=400)
        clean_yield = round((float(peeled_qty) / float(hlso_qty)) * 100, 2)
        calculated_amount = round(float(peeled_qty) * approved_rate, 2)

        current_ist = ist_now()

        new_entry = Peeling(
            peeling_at=location, production_for=production_for, batch_number=batch_number.strip(), hlso_count=in_count.strip(),
            species=species, variety_name=variety, hlso_qty=hlso_qty, peeled_qty=peeled_qty, peeled_qty_expr=peeled_qty_expr or None,
            yield_percent=clean_yield,
            contractor_name=contractor_name, table_no=table_no.strip() if table_no else None, rate=approved_rate, amount=calculated_amount,
            date=current_ist.date(), time=current_ist.time(), email=email, company_id=company_code
        )
        db.add(new_entry)
        
        # ⚡ 1. Deduct input HLSO stock atomically
        update_floor_balance_row(
            db, company_code, clean_batch, clean_count, species, input_variety, 
            location, production_for, qty_delta=-hlso_qty, email=email
        )

        # ⚡ 2. Add output peeled stock directly
        update_floor_balance_row(
            db, company_code, clean_batch, clean_count, species, variety, 
            location, production_for, qty_delta=peeled_qty, email=email
        )

        db.flush()
        voucher = post_contractor_source_charge(
            db=db,
            company_id=company_code,
            voucher_date=current_ist.date(),
            reference_no=f"PEL-{new_entry.id}",
            contractor_name=contractor_name,
            charge_type="Peeling",
            taxable_amount=calculated_amount,
            gst_percent=contractor_gst_percent(db, company_code, contractor_name),
            created_by=email,
            quantity=peeled_qty,
            rate=approved_rate,
        )
        if voucher:
            new_entry.journal_id = voucher.id

        db.commit()
        return JSONResponse({"message": "Saved successfully"})
    except HTTPException as exc:
        db.rollback()
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code)
    except Exception as e:
        db.rollback()
        logger.error(f"Error saving peeling entry: {e}", exc_info=True)
        return JSONResponse({"error": str(e)}, status_code=500) 


from app.utils.trace_lock import is_batch_used_downstream_from_peeling

@router.post("/peeling/delete/{id}")
def delete_peeling(
    id: int,
    request: Request,
    cancel_reason: str = Form(None),
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    email = request.session.get("email")
    if not company_id:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    
    row = db.query(Peeling).filter(Peeling.company_id == company_id, Peeling.id == id).with_for_update().first()
    if not row:
        return JSONResponse({"error": "Record not found"}, status_code=404)

    if row.is_cancelled:
        return JSONResponse({"error": "This entry is already cancelled!"}, status_code=400)

    if is_edit_locked(request, row.date):
        return JSONResponse({"error": edit_lock_message()}, status_code=403)

    # 🔒 Downstream Traceability Check
    is_used, stage = is_batch_used_downstream_from_peeling(db, row.batch_number, row.company_id)
    if is_used:
        return JSONResponse({
            "error": f"❌ Cannot cancel: Batch '{row.batch_number}' is already processed in {stage}!"
        }, status_code=400)

    clean_loc = "FLOOR" if not row.peeling_at or row.peeling_at.strip() == "" else row.peeling_at.strip().upper()

    input_record = db.query(FloorBalance.variety).filter(
        FloorBalance.company_id == company_id, 
        or_(
            func.upper(func.trim(FloorBalance.location)) == clean_loc,
            func.upper(func.trim(FloorBalance.location)) == "OTHER FLOOR" if clean_loc == "FLOOR" else False
        ),
        FloorBalance.batch_number == row.batch_number, 
        FloorBalance.count == row.hlso_count,
        FloorBalance.species == row.species, 
        FloorBalance.variety.ilike("%HLSO%"),
        func.upper(func.trim(FloorBalance.production_for)) == row.production_for.strip().upper()
    ).first()
    
    resolved_input_var = input_record[0] if input_record else "HLSO"

    # ⚡ Inverse Stock Mutation Rollbacks (100% Accurate Recovery)
    update_floor_balance_row(
        db, company_id, row.batch_number, row.hlso_count, row.species, resolved_input_var, 
        row.peeling_at, row.production_for, qty_delta=row.hlso_qty, email=email
    )

    update_floor_balance_row(
        db, company_id, row.batch_number, row.hlso_count, row.species, row.variety_name, 
        row.peeling_at, row.production_for, qty_delta=-row.peeled_qty, email=email
    )

    # Soft Delete / Cancel
    row.is_cancelled = True
    row.status = "Cancelled"
    row.cancel_reason = cancel_reason.strip() if cancel_reason else "Cancelled by user"
    row.cancelled_by = email
    row.cancelled_at = ist_now()
    deactivate_operational_charge(
        db, company_id=company_id, source_type="PEELING", source_table="peeling",
        source_record_id=row.id, changed_by=email,
    )

    db.commit()
    return JSONResponse({"status": "ok"})


# =====================================================
# TABLE REGISTRATION ENDPOINTS (Peeling)
# =====================================================
import threading

_TABLE_REGISTRATIONS_SCHEMA_ENSURED = False
_TABLE_REGISTRATIONS_SCHEMA_LOCK = threading.Lock()


def ensure_table_registrations_schema(db: Session):
    global _TABLE_REGISTRATIONS_SCHEMA_ENSURED
    if _TABLE_REGISTRATIONS_SCHEMA_ENSURED:
        return

    with _TABLE_REGISTRATIONS_SCHEMA_LOCK:
        if _TABLE_REGISTRATIONS_SCHEMA_ENSURED:
            return

        statements = [
            """
            CREATE TABLE IF NOT EXISTS table_registrations (
                id SERIAL PRIMARY KEY,
                company_id VARCHAR(50) NOT NULL,
                date DATE NOT NULL,
                department VARCHAR(50) NOT NULL,
                table_no VARCHAR(50) NOT NULL,
                worker_type VARCHAR(100) NOT NULL,
                contractor_name VARCHAR(255),
                no_of_workers INTEGER DEFAULT 0,
                worker_ids TEXT,
                production_at VARCHAR(255),
                production_for VARCHAR(255),
                status VARCHAR(50) DEFAULT 'Active',
                created_by VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """,
            "ALTER TABLE table_registrations ADD COLUMN IF NOT EXISTS company_id VARCHAR(50)",
            "ALTER TABLE table_registrations ADD COLUMN IF NOT EXISTS date DATE",
            "ALTER TABLE table_registrations ADD COLUMN IF NOT EXISTS department VARCHAR(50)",
            "ALTER TABLE table_registrations ADD COLUMN IF NOT EXISTS table_no VARCHAR(50)",
            "ALTER TABLE table_registrations ADD COLUMN IF NOT EXISTS worker_type VARCHAR(100)",
            "ALTER TABLE table_registrations ADD COLUMN IF NOT EXISTS contractor_name VARCHAR(255)",
            "ALTER TABLE table_registrations ADD COLUMN IF NOT EXISTS no_of_workers INTEGER DEFAULT 0",
            "ALTER TABLE table_registrations ADD COLUMN IF NOT EXISTS worker_ids TEXT",
            "ALTER TABLE table_registrations ADD COLUMN IF NOT EXISTS production_at VARCHAR(255)",
            "ALTER TABLE table_registrations ADD COLUMN IF NOT EXISTS production_for VARCHAR(255)",
            "ALTER TABLE table_registrations ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Active'",
            "ALTER TABLE table_registrations ADD COLUMN IF NOT EXISTS created_by VARCHAR(255)",
            "ALTER TABLE table_registrations ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
        ]
        try:
            for stmt in statements:
                db.execute(text(stmt))
            db.commit()
            _TABLE_REGISTRATIONS_SCHEMA_ENSURED = True
        except Exception as e:
            db.rollback()

@router.get("/peeling/table_registrations")
def get_peeling_table_registrations(request: Request, date_val: str = Query(None), db: Session = Depends(get_db)):
    company_code = str(request.session.get("company_code") or "").strip().upper()
    if not company_code:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    
    try:
        target_date = datetime.strptime(date_val, "%Y-%m-%d").date() if date_val else ist_now().date()
        rows = db.query(TableRegistration).filter(
            func.trim(TableRegistration.company_id) == company_code,
            TableRegistration.date == target_date,
            TableRegistration.department.in_(["De-Heading", "Peeling"]),
            TableRegistration.status == "Active"
        ).order_by(TableRegistration.id.desc()).all()

        
        return JSONResponse({
            "table_registrations": [
                {
                    "id": r.id,
                    "date": r.date.isoformat(),
                    "department": r.department,
                    "table_no": r.table_no,
                    "worker_type": r.worker_type,
                    "contractor_name": r.contractor_name,
                    "no_of_workers": r.no_of_workers,
                    "worker_ids": r.worker_ids,
                    "production_at": r.production_at,
                    "production_for": r.production_for,
                    "created_by": r.created_by,
                    "created_at": r.created_at.isoformat() if r.created_at else None
                } for r in rows
            ]
        })
    except Exception as e:
        db.rollback()
        logger.error(f"Error in get_peeling_table_registrations: {e}")
        return JSONResponse({"table_registrations": []})

def get_ordinal_suffix(n: int) -> str:
    if 11 <= (n % 100) <= 13:
        return f"{n}th"
    return f"{n}" + {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')

def get_base_table_name(raw_name: str) -> str:
    cleaned = re.sub(r'\s*\(\d+(st|nd|rd|th)\)\s*$', '', (raw_name or '').strip(), flags=re.IGNORECASE)
    if cleaned.isdigit():
        return f"Table {cleaned}"
    return cleaned

@router.post("/peeling/table_registration")
def save_peeling_table_registration(
    request: Request, db: Session = Depends(get_db),
    table_no: str = Form(...), worker_type: str = Form(...),
    contractor_name: str = Form(None), no_of_workers: str = Form("0"),
    worker_ids: str = Form(None), production_at: str = Form(...),
    production_for: str = Form(None), overwrite: str = Form("false"),
    confirm_shift: str = Form("false")
):
    company_code = str(request.session.get("company_code") or "").strip().upper()
    email = request.session.get("email")
    if not company_code:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
        
    try:
        ensure_table_registrations_schema(db)
        parsed_no_workers = int(no_of_workers or 0)
        current_ist = ist_now()
        today_date = current_ist.date()
        now_naive = current_ist.replace(tzinfo=None) if hasattr(current_ist, 'tzinfo') and current_ist.tzinfo else current_ist
        clean_peeling_at = (production_at or "").strip()
        if not clean_peeling_at:
            return JSONResponse({"error": "Peeling At / Location is required"}, status_code=400)
        
        base_name = get_base_table_name(table_no)

        validation_error = validate_kg_worker_table_registration(
            db, company_code, worker_type, parsed_no_workers, worker_ids, clean_peeling_at
        )
        if validation_error:
            return JSONResponse({"error": validation_error}, status_code=400)

        # Query all existing active table registrations today for this base table name
        today_regs = db.query(TableRegistration).filter(
            func.trim(TableRegistration.company_id) == company_code,
            TableRegistration.date == today_date,
            TableRegistration.status == 'Active'
        ).all()

        matching_regs = [r for r in today_regs if get_base_table_name(r.table_no).lower() == base_name.lower()]
        existing_count = len(matching_regs)

        is_confirmed = str(confirm_shift).lower() in ['true', '1', 'yes'] or str(overwrite).lower() in ['true', '1', 'yes']

        if existing_count > 0 and not is_confirmed:
            next_shift = existing_count + 1
            next_table_name = f"{base_name} ({get_ordinal_suffix(next_shift)})"
            last_reg = matching_regs[-1]
            last_info = f"contractor '{last_reg.contractor_name}'" if last_reg.contractor_name else f"'{last_reg.worker_type}'"
            return JSONResponse({
                "already_exists": True,
                "existing_count": existing_count,
                "next_table_name": next_table_name,
                "error": f"'{base_name}' is already registered today ({existing_count} time(s), last registered under {last_info}). Do you want to register Shift {next_shift} as '{next_table_name}'?"
            }, status_code=409)

        # Determine exact table name to register
        if "(" in table_no and ")" in table_no:
            clean_table_no = table_no.strip()
        elif existing_count > 0:
            clean_table_no = f"{base_name} ({get_ordinal_suffix(existing_count + 1)})"
        else:
            clean_table_no = base_name

        new_reg = TableRegistration(
            company_id=company_code,
            date=today_date,
            department="Peeling",
            table_no=clean_table_no,
            worker_type=worker_type.strip(),
            contractor_name=contractor_name.strip() if contractor_name else None,
            no_of_workers=parsed_no_workers,
            worker_ids=worker_ids.strip() if worker_ids else None,
            production_at=clean_peeling_at,
            production_for=production_for.strip() if production_for else None,
            created_by=email,
            created_at=now_naive
        )
        db.add(new_reg)
        db.commit()
        return JSONResponse({"status": "ok", "table_no": clean_table_no, "id": new_reg.id})
    except Exception as e:
        db.rollback()
        logger.error(f"Error in save_peeling_table_registration: {e}", exc_info=True)
        return JSONResponse({"error": f"Error saving table registration: {str(e)}"}, status_code=500)

@router.post("/peeling/table_registration/delete/{id}")
def delete_peeling_table_registration(id: int, request: Request, db: Session = Depends(get_db)):
    company_code = str(request.session.get("company_code") or "").strip().upper()
    if not company_code:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    
    ensure_table_registrations_schema(db)
    row = db.query(TableRegistration).filter(
        TableRegistration.id == id,
        TableRegistration.company_id == company_code
    ).first()

    if row:
        row.status = "Cancelled"
        db.commit()
    return JSONResponse({"status": "ok"})
