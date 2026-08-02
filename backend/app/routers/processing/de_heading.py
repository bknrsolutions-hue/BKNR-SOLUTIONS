import json
import re
import logging
from fastapi import APIRouter, Request, Form, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse, JSONResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct, cast, String, text, or_, and_
import datetime as dt
from datetime import datetime, date

from app.database import get_db
from app.database.models.processing import DeHeading, TableRegistration
from app.database.models.attendance import KgBasisWorker, KgBasisWorkerAttendance
from app.database.models.reprocess import Reprocess
from app.database.models.floor_balance import FloorBalance  # Live Running Stock Table
from app.database.models.criteria import (
    peeling_rates, contractors, species as SpeciesMaster, peeling_at, production_at, production_for as ProductionForMaster
)

# Centralized Hlso Grading Pool Sync Service
from app.services.hlso_grading_sync import add_deheading_to_grading_pool, remove_deheading_from_grading_pool
# Universal Global Filters Helper
from app.utils.global_filters import get_global_filters
from app.utils.timezone import ist_now
from app.services.floor_balance import get_floor_balance
from app.utils.edit_lock import is_edit_locked, edit_lock_message
from app.services.bill_accounting import ensure_bill_accounting_schema, post_contractor_source_charge
from app.services.operational_vouchers import deactivate_operational_charge

router = APIRouter(tags=["DE-HEADING"])
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
    c_q = db.query(contractors)
    if company_id:
        c_q = c_q.filter(func.upper(func.trim(contractors.company_id)) == company_id.strip().upper())
    c_list = [c.contractor_name for c in c_q.order_by(contractors.contractor_name).all() if c.contractor_name]
    if not c_list:
        c_list = [c.contractor_name for c in db.query(contractors).order_by(contractors.contractor_name).all() if c.contractor_name]

    s_q = db.query(SpeciesMaster)
    if company_id:
        s_q = s_q.filter(func.upper(func.trim(SpeciesMaster.company_id)) == company_id.strip().upper())
    s_list = [s.species_name for s in s_q.order_by(SpeciesMaster.species_name).all() if s.species_name]
    if not s_list:
        s_list = [s.species_name for s in db.query(SpeciesMaster).order_by(SpeciesMaster.species_name).all() if s.species_name]

    pf_q = db.query(distinct(ProductionForMaster.production_for))
    if company_id:
        pf_q = pf_q.filter(func.upper(func.trim(ProductionForMaster.company_id)) == company_id.strip().upper())
    raw_pf = [p[0] for p in pf_q.all() if p[0]]
    if not raw_pf:
        raw_pf = [p[0] for p in db.query(distinct(ProductionForMaster.production_for)).all() if p[0]]
    excluded_names = {"MAIN UNIT", "GENERAL STOCK", "N/A", "NONE", "NULL"}
    pf_list = [p for p in raw_pf if p.upper().strip() not in excluded_names]

    return {"contractors": c_list, "species": s_list, "prod_for_list": pf_list}


# =====================================================
# 🔥 CENTRALIZED ATOMIC INVENTORY HELPER ENGINE
# =====================================================
def update_floor_balance_row(
    db: Session, company_id: str, batch: str, count: str, species_val: str, 
    variety: str, location: str, production_for: str, qty_delta: float, email: str = None
):
    """
    1. with_for_update() Row Lock applied natively.
    2. Existing & Non-Existing Row Negative Stock Guards Activated.
    """
    now_ist = ist_now()
    
    row = db.query(FloorBalance).filter(
        FloorBalance.company_id == company_id,
        func.upper(func.trim(FloorBalance.location)) == location.strip().upper(),
        func.upper(func.trim(FloorBalance.batch_number)) == batch.strip().upper(),
        func.upper(func.trim(FloorBalance.count)) == count.strip().upper(),
        func.upper(func.trim(FloorBalance.species)) == species_val.strip().upper(),
        FloorBalance.variety == variety,
        func.upper(func.trim(FloorBalance.production_for)) == production_for.strip().upper()
    ).with_for_update().first()

    if row:
        # Existing Row Negative Guard Lock
        if qty_delta < 0 and (row.available_qty + qty_delta) < -0.01:
            raise HTTPException(
                status_code=400, 
                detail=f"Operation rejected. Insufficient balance on Live Row for {variety}. Available: {row.available_qty}, Needed: {abs(qty_delta)}"
            )
        row.available_qty += qty_delta
        row.last_updated = now_ist
        if email:
            row.email = email
    else:
        # Non-Existing Row Negative Guard Lock
        if qty_delta < 0:
            raise HTTPException(status_code=400, detail=f"Target live stock row not found for {variety} deduction.")
            
        new_row = FloorBalance(
            company_id=company_id, location=location.strip().upper(),
            production_for=production_for, batch_number=batch.strip(),
            source_type="RMP", species=species_val, variety=variety, count=count.strip(),
            available_qty=qty_delta, last_transaction="DE_HEADING_MUTATION",
            last_updated=now_ist, date=str(now_ist.date()), time=str(now_ist.time()), email=email
        )
        db.add(new_row)


# =====================================================
# MAIN VIEW: DE-HEADING PAGE (⚡ DIRECT LIVE READ)
# =====================================================
@router.get("/de_heading", response_class=HTMLResponse)
def show_de_heading(request: Request, db: Session = Depends(get_db)):
    global_production_for, global_location = get_global_filters(request)
    raw_company_code = str(request.session.get("company_code") or "").strip().upper()
    if not raw_company_code:
        return RedirectResponse("/auth/login", status_code=303)
    company_code = str(raw_company_code or "").strip().upper()

    session_locations = request.session.get("allowed_locations", [])
    user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()] if isinstance(session_locations, str) else [loc.strip().upper() for loc in session_locations if loc.strip()]

    masters = get_cached_masters(db, company_code)

    # 🟢 🔴 FIXED: STRICT GLOBAL LOCATION OVERRIDE FOR PEELING/PLANT DROPDOWN
    pa_q = db.query(production_at.production_at).filter(production_at.company_id == company_code)
    pe_q = db.query(peeling_at.peeling_at).filter(peeling_at.company_id == company_code)
    if global_location:
        pa_q = pa_q.filter(func.upper(func.trim(production_at.production_at)) == global_location.strip().upper())
        pe_q = pe_q.filter(func.upper(func.trim(peeling_at.peeling_at)) == global_location.strip().upper())
    elif user_allowed_locations:
        pa_q = pa_q.filter(func.upper(func.trim(production_at.production_at)).in_(user_allowed_locations))
        pe_q = pe_q.filter(func.upper(func.trim(peeling_at.peeling_at)).in_(user_allowed_locations))

    raw_locs = (
        [p[0] for p in pa_q.all() if p[0]] +
        [p[0] for p in pe_q.all() if p[0]]
    )
    peeling_locs = list(dict.fromkeys(raw_locs))

    # 🟢 🔴 FIXED: STRICT GLOBAL PRODUCTION FOR OVERRIDE
    final_prod_for_list = [global_production_for] if global_production_for else masters["prod_for_list"]

    today_q = db.query(DeHeading).filter(DeHeading.company_id == company_code, DeHeading.date == ist_now().date())
    if global_location:
        today_q = today_q.filter(func.upper(func.trim(DeHeading.peeling_at)) == global_location.strip().upper())
    elif user_allowed_locations:
        today_q = today_q.filter(func.upper(func.trim(DeHeading.peeling_at)).in_(user_allowed_locations))
    if global_production_for:
        today_q = today_q.filter(func.trim(DeHeading.production_for) == func.trim(global_production_for))
    today_data = today_q.order_by(DeHeading.id.desc()).limit(100).all()

    # Direct indexed fetch from Live FloorBalance
    live_q = db.query(FloorBalance).filter(
        FloorBalance.company_id == company_code,
        FloorBalance.variety == "HOSO"
    )

    if global_production_for:
        live_q = live_q.filter(func.trim(FloorBalance.production_for) == func.trim(global_production_for))
    if global_location:
        live_q = live_q.filter(func.upper(func.trim(FloorBalance.location)) == global_location.strip().upper())
    elif user_allowed_locations:
        live_q = live_q.filter(func.upper(func.trim(FloorBalance.location)).in_(user_allowed_locations))

    live_records = live_q.order_by(FloorBalance.production_for, FloorBalance.location, FloorBalance.batch_number).all()

    hoso_floor_balance_list = []
    for r in live_records:
        available_qty = get_floor_balance(
            db, company_code, r.location, r.batch_number, r.count, r.species,
            r.variety, r.production_for, r.source_type or "RMP"
        )
        if available_qty <= 0.01:
            continue
        hoso_floor_balance_list.append({
            "production_for": r.production_for or "General Stock",
            "peeling_at": r.location,
            "batch": r.batch_number,
            "count": r.count or "N/A",
            "species": r.species or "N/A",
            "available_qty": round(available_qty, 2)
        })

    if request.query_params.get("format") == "json":
        return JSONResponse({
            "contractors": masters["contractors"],
            "species": masters["species"],
            "peeling_locations": peeling_locs,
            "prod_for_list": final_prod_for_list,
            "today_data": [
                {
                    "id": r.id,
                    "date": r.date.isoformat() if r.date else None,
                    "time": r.time.strftime("%H:%M") if r.time else None,
                    "production_for": r.production_for,
                    "peeling_at": r.peeling_at,
                    "species": r.species,
                    "batch_number": r.batch_number,
                    "hoso_count": r.hoso_count,
                    "hoso_qty": r.hoso_qty,
                    "hlso_qty": r.hlso_qty,
                    "hlso_qty_expr": r.hlso_qty_expr,
                    "yield_percent": r.yield_percent,
                    "contractor": r.contractor,
                    "table_no": r.table_no,
                    "rate_per_kg": r.rate_per_kg,
                    "amount": r.amount,
                    "is_cancelled": r.is_cancelled,
                    "status": r.status,
                    "cancel_reason": r.cancel_reason,
                    "cancelled_by": r.cancelled_by,
                    "cancelled_at": r.cancelled_at.isoformat() if r.cancelled_at else None,
                    "email": r.email
                } for r in today_data
            ],
            "hoso_floor_balance": hoso_floor_balance_list
        })

    return templates.TemplateResponse(
        request=request, name="processing/de_heading.html",
        context={
            "contractors": masters["contractors"], 
            "species": masters["species"], 
            "peeling_locations": peeling_locs,         # 👈 Injecting Strictly Filtered Data
            "prod_for_list": final_prod_for_list,      # 👈 Injecting Strictly Filtered Data
            "today_data": today_data, 
            "hoso_floor_balance": hoso_floor_balance_list,
            "selected_production_for": global_production_for, 
            "selected_location": global_location              
        }
    )



@router.get("/get_valid_batches/{production_for}/{location}")
def get_valid_batches(production_for: str, location: str, request: Request, db: Session = Depends(get_db)):
    company_code = str(request.session.get("company_code") or "").strip().upper()
    if not company_code: return {"batches": []}

    global_p_for, global_loc = get_global_filters(request)
    if global_p_for: production_for = global_p_for
    if global_loc: location = global_loc

    session_locations = request.session.get("allowed_locations", [])
    user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()] if isinstance(session_locations, str) else [loc.strip().upper() for loc in session_locations if loc.strip()]

    if user_allowed_locations and location.strip().upper() not in user_allowed_locations:
        return {"batches": []}

    fb_query = db.query(FloorBalance).filter(
        FloorBalance.company_id == company_code,
        func.upper(func.trim(FloorBalance.location)) == location.strip().upper(),
        FloorBalance.variety == "HOSO"
    )
    
    prod_for_clean = production_for.strip() if production_for else ""
    if prod_for_clean in ("General Stock", "GENERAL STOCK", "N/A", ""):
        fb_query = fb_query.filter((FloorBalance.production_for == None) | (func.trim(FloorBalance.production_for) == "") | (func.upper(func.trim(FloorBalance.production_for)) == "GENERAL STOCK"))
    else:
        fb_query = fb_query.filter(func.upper(func.trim(FloorBalance.production_for)) == prod_for_clean.upper())

    rows = fb_query.order_by(FloorBalance.batch_number).all()
    batches = {
        r.batch_number for r in rows
        if r.batch_number and get_floor_balance(db, company_code, r.location, r.batch_number, r.count, r.species, r.variety, r.production_for, r.source_type or "RMP") > 0.01
    }
    return {"batches": sorted(batches)}

@router.get("/get_hoso/{production_for}/{location}/{batch}")
def get_hoso_counts(production_for: str, location: str, batch: str, request: Request, db: Session = Depends(get_db)):
    company_code = str(request.session.get("company_code") or "").strip().upper()
    if not company_code: return {"counts": []}

    global_p_for, global_loc = get_global_filters(request)
    if global_p_for: production_for = global_p_for
    if global_loc: location = global_loc

    session_locations = request.session.get("allowed_locations", [])
    user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()] if isinstance(session_locations, str) else [loc.strip().upper() for loc in session_locations if loc.strip()]

    if user_allowed_locations and location.strip().upper() not in user_allowed_locations:
        return {"counts": []}

    fb_query = db.query(FloorBalance).filter(
        FloorBalance.company_id == company_code,
        FloorBalance.batch_number == batch,
        func.upper(func.trim(FloorBalance.location)) == location.strip().upper(),
        FloorBalance.variety == "HOSO"
    )
    
    prod_for_clean = production_for.strip() if production_for else ""
    if prod_for_clean in ("General Stock", "GENERAL STOCK", "N/A", ""):
        fb_query = fb_query.filter((FloorBalance.production_for == None) | (func.trim(FloorBalance.production_for) == "") | (func.upper(func.trim(FloorBalance.production_for)) == "GENERAL STOCK"))
    else:
        fb_query = fb_query.filter(func.upper(func.trim(FloorBalance.production_for)) == prod_for_clean.upper())

    rows = fb_query.order_by(FloorBalance.count).all()
    counts = {
        r.count for r in rows
        if r.count and get_floor_balance(db, company_code, r.location, r.batch_number, r.count, r.species, r.variety, r.production_for, r.source_type or "RMP") > 0.01
    }
    return {"counts": sorted(counts)}

@router.get("/get_rate/{contractor}")
def get_contractor_rate(contractor: str, count: str = Query(None), request: Request = None, db: Session = Depends(get_db)):
    company_code = str(request.session.get("company_code") or "").strip().upper() if request else None
    c_clean = contractor.strip()
    query = db.query(peeling_rates).filter(
        or_(
            peeling_rates.company_id == company_code,
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
        func.lower(func.trim(peeling_rates.variety_name)) == "hoso"
    )
    if count:
        cnt_clean = count.strip()
        cnt_row = query.filter(peeling_rates.hlso_count == cnt_clean).order_by(peeling_rates.effective_from.desc()).first()
        if cnt_row:
            return {"rate": float(cnt_row.rate) if cnt_row.rate else 0.0}

    row = query.order_by(peeling_rates.effective_from.desc()).first()
    return {"rate": float(row.rate) if row and row.rate else 0.0}


def approved_deheading_rate(db: Session, company_id: str, contractor: str, count: str | None) -> float:
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
        func.lower(func.trim(peeling_rates.variety_name)) == "hoso",
    )
    if count:
        row = query.filter(peeling_rates.hlso_count == count.strip()).order_by(peeling_rates.effective_from.desc()).first()
        if row:
            return float(row.rate or 0.0)
    row = query.order_by(peeling_rates.effective_from.desc()).first()
    return float(row.rate or 0.0) if row else 0.0


def contractor_gst_percent(db: Session, company_id: str, contractor_name: str) -> float:
    row = db.query(contractors).filter(
        contractors.company_id == company_id,
        contractors.contractor_name == contractor_name,
    ).first()
    return float(row.gst_percent or 0) if row else 0.0


# =====================================================
# ACTION: SAVE DE-HEADING (⚡ ATOMIC DUAL MUTATION LOCK)
# =====================================================
@router.get("/get_available_qty")
def get_available_qty(
    location: str = Query(...), 
    production_for: str = Query(...), 
    batch: str = Query(...), 
    count: str = Query(...), 
    species_name: str = Query(...), 
    request: Request = None, 
    db: Session = Depends(get_db)
):
    company_code = str(request.session.get("company_code") or "").strip().upper()
    if not company_code: return {"available_qty": 0}

    global_p_for, global_loc = get_global_filters(request)
    if global_p_for:
        production_for = global_p_for
    if global_loc:
        location = global_loc

    session_locations = request.session.get("allowed_locations", [])
    user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",") if loc.strip()] if isinstance(session_locations, str) else [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]
    if user_allowed_locations and location.strip().upper() not in user_allowed_locations:
        return {"available_qty": 0}
    
    prod_for_clean = production_for.strip() if production_for else ""
    if prod_for_clean in ("General Stock", "GENERAL STOCK", "N/A", ""):
        prod_for_clean = None

    fb_query = db.query(FloorBalance.source_type).filter(
        FloorBalance.company_id == company_code,
        func.upper(func.trim(FloorBalance.location)) == location.strip().upper(),
        func.upper(func.trim(FloorBalance.batch_number)) == batch.strip().upper(),
        func.upper(func.trim(FloorBalance.count)) == count.strip().upper(),
        func.upper(func.trim(FloorBalance.species)) == species_name.strip().upper(),
        FloorBalance.variety == "HOSO"
    )

    if prod_for_clean:
        fb_query = fb_query.filter(func.upper(func.trim(FloorBalance.production_for)) == prod_for_clean.upper())
    else:
        fb_query = fb_query.filter((FloorBalance.production_for == None) | (func.trim(FloorBalance.production_for) == ""))

    source_row = fb_query.first()
    available_qty = get_floor_balance(
        db, company_code, location, batch, count, species_name, "HOSO",
        production_for, source_row[0] if source_row else "RMP"
    )
    
    return {"available_qty": round(available_qty, 2)}

@router.post("/de_heading")
def save_de_heading(
    request: Request, db: Session = Depends(get_db),
    production_for: str = Form(...), deheading_at: str = Form(...),
    species: str = Form(...), batch_number: str = Form(...),
    hoso_count: str = Form(...), hoso_qty: float = Form(...),
    hlso_qty: float = Form(...), yield_percent: str = Form(...),
    contractor: str = Form(...), rate_per_kg: float = Form(...),
    amount: float = Form(...), table_no: str = Form(None),
    hlso_qty_expr: str = Form(None)
):
    company_code = str(request.session.get("company_code") or "").strip().upper()
    email = request.session.get("email")
    if not company_code: return JSONResponse({"error": "Unauthorized"}, status_code=401)
    
    try:
        ensure_bill_accounting_schema(db)
        
        clean_batch = batch_number.strip()
        clean_count = hoso_count.strip()

        fb_query = db.query(FloorBalance.source_type).filter(
            FloorBalance.company_id == company_code,
            func.upper(func.trim(FloorBalance.location)) == deheading_at.strip().upper(),
            func.upper(func.trim(FloorBalance.batch_number)) == clean_batch.upper(),
            func.upper(func.trim(FloorBalance.count)) == clean_count.upper(),
            func.upper(func.trim(FloorBalance.species)) == species.strip().upper(),
            FloorBalance.variety == "HOSO"
        )
        prod_for_clean = production_for.strip() if production_for else ""
        if prod_for_clean in ("General Stock", "GENERAL STOCK", "N/A", ""):
            fb_query = fb_query.filter((FloorBalance.production_for == None) | (func.trim(FloorBalance.production_for) == "") | (func.upper(func.trim(FloorBalance.production_for)) == "GENERAL STOCK"))
        else:
            fb_query = fb_query.filter(func.upper(func.trim(FloorBalance.production_for)) == prod_for_clean.upper())

        source_row = fb_query.first()
        avail = get_floor_balance(
            db, company_code, deheading_at, clean_batch, clean_count, species, "HOSO",
            production_for, source_row[0] if source_row else "RMP"
        )
        
        if hoso_qty <= 0 or hlso_qty <= 0:
            return JSONResponse({"error": "HOSO and HLSO quantities must be greater than zero"}, status_code=400)
        if hoso_qty > (avail + 0.1):
            return JSONResponse({"error": f"Insufficient HOSO live balance. Available: {round(avail, 2)}"}, status_code=400)

        approved_rate = approved_deheading_rate(db, company_code, contractor, clean_count)
        if approved_rate <= 0:
            return JSONResponse({"error": "No approved De-Heading rate found for this contractor and count"}, status_code=400)
        clean_yield = round((float(hlso_qty) / float(hoso_qty)) * 100, 2)
        calculated_amount = round(float(hlso_qty) * approved_rate, 2)

        current_ist = ist_now()

        new_entry = DeHeading(
            production_for=production_for, peeling_at=deheading_at, batch_number=clean_batch, hoso_count=clean_count,
            species=species, hoso_qty=hoso_qty, hlso_qty=hlso_qty, hlso_qty_expr=hlso_qty_expr or None,
            yield_percent=clean_yield,
            contractor=contractor, table_no=table_no.strip() if table_no else None, rate_per_kg=approved_rate, amount=calculated_amount,
            date=current_ist.date(), time=current_ist.time(), email=email, company_id=company_code
        )
        db.add(new_entry)

        # 🟢 ⚡ 1. Deduct HOSO from running floor balance row cleanly
        update_floor_balance_row(
            db, company_code, clean_batch, clean_count, species, "HOSO", 
            deheading_at, production_for, qty_delta=-hoso_qty, email=email
        )

        # 🟢 ⚡ 2. Add newly generated HLSO stock cleanly to running balance row
        update_floor_balance_row(
            db, company_code, clean_batch, clean_count, species, "HLSO", 
            deheading_at, production_for, qty_delta=hlso_qty, email=email
        )

        # 🟢 ⚡ 3. Synchronize pool *after* successful floor balance state mutations
        add_deheading_to_grading_pool(db, new_entry)

        db.flush()
        voucher = post_contractor_source_charge(
            db=db,
            company_id=company_code,
            voucher_date=current_ist.date(),
            reference_no=f"DEH-{new_entry.id}",
            contractor_name=contractor,
            charge_type="Deheading",
            taxable_amount=calculated_amount,
            gst_percent=contractor_gst_percent(db, company_code, contractor),
            created_by=email,
            quantity=hlso_qty,
            rate=approved_rate,
        )
        if voucher:
            new_entry.journal_id = voucher.id

        db.commit()
        return JSONResponse({"status": "ok"})
    except HTTPException as exc:
        db.rollback()
        return JSONResponse({"error": str(exc.detail)}, status_code=exc.status_code)
    except Exception as e:
        db.rollback()
        logger.error(f"Error saving de-heading entry: {e}", exc_info=True)
        return JSONResponse({"error": str(e)}, status_code=500)


from app.utils.trace_lock import is_batch_used_downstream_from_deheading

@router.post("/de_heading/delete/{id}")
def delete_de_heading(
    id: int,
    request: Request,
    cancel_reason: str = Form(None),
    db: Session = Depends(get_db)
):
    company_code = str(request.session.get("company_code") or "").strip().upper()
    email = request.session.get("email")
    if not company_code:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)
    
    row = db.query(DeHeading).filter(DeHeading.id == id, DeHeading.company_id == company_code).with_for_update().first()
    if not row:
        return JSONResponse({"error": "Record not found"}, status_code=404)
        
    if row.is_cancelled:
        return JSONResponse({"error": "This entry is already cancelled!"}, status_code=400)

    if is_edit_locked(request, row.date):
        return JSONResponse({"error": edit_lock_message()}, status_code=403)

    # 🔒 Downstream Traceability Check
    is_used, stage = is_batch_used_downstream_from_deheading(db, row.batch_number, row.company_id)
    if is_used:
        return JSONResponse({
            "error": f"❌ Cannot cancel: Batch '{row.batch_number}' is already processed in {stage}!"
        }, status_code=400)

    # Synced grading pool removal
    remove_deheading_from_grading_pool(db, row)
    
    # 🟢 ⚡ Full Dual Inventory Stock Inverse Reversals Execution
    # 1. HOSO back (+ Delta)
    update_floor_balance_row(
        db, company_code, row.batch_number, row.hoso_count, row.species, "HOSO", 
        row.peeling_at, row.production_for, qty_delta=row.hoso_qty, email=email
    )

    # 2. Generated HLSO removed (- Delta)
    update_floor_balance_row(
        db, company_code, row.batch_number, row.hoso_count, row.species, "HLSO", 
        row.peeling_at, row.production_for, qty_delta=-row.hlso_qty, email=email
    )

    # Soft Delete / Cancel
    row.is_cancelled = True
    row.status = "Cancelled"
    row.cancel_reason = cancel_reason.strip() if cancel_reason else "Cancelled by user"
    row.cancelled_by = email
    row.cancelled_at = ist_now()
    deactivate_operational_charge(
        db, company_id=company_code, source_type="DEHEADING", source_table="deheading",
        source_record_id=row.id, changed_by=email,
    )

    db.commit()
    return JSONResponse({"status": "ok"})


# =====================================================
# TABLE REGISTRATION ENDPOINTS (De-Heading)
# =====================================================
def ensure_table_registrations_schema(db: Session):
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
    for stmt in statements:
        try:
            db.execute(text(stmt))
            db.commit()
        except Exception as e:
            db.rollback()

@router.get("/de_heading/table_registrations")
def get_de_heading_table_registrations(request: Request, date_val: str = Query(None), db: Session = Depends(get_db)):
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
        logger.error(f"Error in get_de_heading_table_registrations: {e}")
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

@router.post("/de_heading/table_registration")
def save_de_heading_table_registration(
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
            department="De-Heading",
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
        logger.error(f"Error in save_de_heading_table_registration: {e}", exc_info=True)
        return JSONResponse({"error": f"Error saving table registration: {str(e)}"}, status_code=500)

@router.post("/de_heading/table_registration/delete/{id}")
def delete_de_heading_table_registration(id: int, request: Request, db: Session = Depends(get_db)):
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
