import json
import re
from fastapi import APIRouter, Request, Form, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct, cast, String, Integer
from datetime import date, datetime

from app.database import get_db
from app.database.models.processing import Soaking
from app.database.models.reprocess import Reprocess
from app.database.models.floor_balance import FloorBalance  # Live Running Stock Table
from app.database.models.criteria import (
    varieties, species, chemicals, production_at, production_for as ProductionForMaster
)

from app.utils.timezone import ist_now 
from app.utils.global_filters import get_global_filters
from app.services.floor_balance import get_live_floor_balance_rows
from app.utils.edit_lock import is_edit_locked, edit_lock_message

router = APIRouter(tags=["SOAKING"]) 
templates = Jinja2Templates(directory="app/templates")


def resolve_session_scope(request: Request, production_for: str | None = None, location: str | None = None):
    session_production_for, session_location = get_global_filters(request)
    effective_production_for = session_production_for or production_for
    effective_location = session_location or location

    raw_locations = request.session.get("allowed_locations", [])
    if isinstance(raw_locations, str):
        allowed_locations = [value.strip().upper() for value in raw_locations.split(",") if value.strip()]
    else:
        allowed_locations = [str(value).strip().upper() for value in raw_locations if str(value).strip()]

    if effective_location and allowed_locations and effective_location.strip().upper() not in allowed_locations:
        raise HTTPException(status_code=403, detail="Selected location is outside your session access")

    return effective_production_for, effective_location, allowed_locations

def get_cached_masters(db: Session, company_id: str, force_refresh: bool = False):
    v_list = [v[0] for v in db.query(varieties.variety_name).filter(varieties.company_id == company_id).all() if v[0]]
    s_list = [s[0] for s in db.query(species.species_name).filter(species.company_id == company_id).all() if s[0]]
    c_list = [c[0] for c in db.query(chemicals.chemical_name).filter(chemicals.company_id == company_id).all() if c[0]]
    pf_list = [pf[0] for pf in db.query(distinct(ProductionForMaster.production_for)).filter(ProductionForMaster.company_id == company_id).order_by(ProductionForMaster.production_for).all() if pf[0]]
    if "General Stock" not in pf_list:
        pf_list.append("General Stock")
    return {"varieties": v_list, "species": s_list, "chemicals": c_list, "prod_for_list": pf_list}


# =====================================================
# 🔥 CENTRALIZED ATOMIC INVENTORY ENGINE (⚡ WITH REJECTION TRACKING)
# =====================================================
def update_floor_balance_row(
    db: Session, company_id: str, batch: str, count: str, species_val: str, 
    variety: str, location: str, production_for: str, qty_delta: float,
    email: str = None
):
    """Apply one locked movement to the canonical floor-balance row."""
    now_ist = ist_now()
    
    row = db.query(FloorBalance).filter(
        FloorBalance.company_id == company_id,
        func.upper(func.trim(FloorBalance.location)) == str(location or "").strip().upper(),
        func.upper(func.trim(FloorBalance.batch_number)) == str(batch or "").strip().upper(),
        func.upper(func.trim(FloorBalance.count)) == str(count or "").strip().upper(),
        func.upper(func.trim(FloorBalance.species)) == str(species_val or "").strip().upper(),
        func.upper(func.trim(FloorBalance.variety)) == str(variety or "").strip().upper(),
        func.upper(func.trim(FloorBalance.production_for)) == str(production_for or "").strip().upper(),
    ).with_for_update().first()

    if row:
        row.available_qty = round(float(row.available_qty or 0) + qty_delta, 2)
        row.last_updated = now_ist
        if email:
            row.email = email
    else:
        if qty_delta < 0:
            raise HTTPException(status_code=400, detail="Target live stock record row not found for deduction.")
            
        new_row = FloorBalance(
            company_id=company_id, location=location.strip().upper(),
            production_for=production_for, batch_number=batch.strip(),
            source_type="RMP", species=species_val, variety=variety, count=count.strip(),
            available_qty=round(qty_delta, 2),
            last_transaction="SOAKING_MUTATION",
            last_updated=now_ist, date=str(now_ist.date()), time=str(now_ist.time()), email=email
        )
        db.add(new_row)


# =====================================================
# SHOW PAGE: 100% BLIND DIRECT READ FROM LIVE STOCK (⚡ ~20ms)
# =====================================================
@router.get("/soaking", response_class=HTMLResponse)
def show_soaking(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    email = request.session.get("email")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=303)

    now_ist = ist_now()
    current_date = now_ist.date()

    global_production_for, global_location, user_allowed_locations = resolve_session_scope(request)

    masters = get_cached_masters(db, company_id)
    
    pl_q = db.query(production_at.production_at).filter(production_at.company_id == company_id)
    if user_allowed_locations:
        pl_q = pl_q.filter(func.upper(func.trim(production_at.production_at)).in_(user_allowed_locations))
    prod_locs = [p[0] for p in pl_q.order_by(production_at.production_at).all() if p[0]]

    # Recent Log Table limited to 100 rows
    today_q = db.query(Soaking).filter(Soaking.company_id == company_id, Soaking.date == current_date)
    if global_production_for:
        today_q = today_q.filter(func.trim(Soaking.production_for) == func.trim(global_production_for))
    if global_location:
        today_q = today_q.filter(func.trim(Soaking.production_at) == func.trim(global_location))
    elif user_allowed_locations:
        today_q = today_q.filter(func.upper(func.trim(Soaking.production_at)).in_(user_allowed_locations))
        
    today_data = today_q.order_by(Soaking.id.desc()).limit(100).all()

    rows_batch = get_live_floor_balance_rows(
        db,
        company_id,
        production_for=global_production_for,
        location=global_location,
        allowed_locations=user_allowed_locations,
    )

    if request.query_params.get("format") == "json":
        return JSONResponse({
            "prod_for_list": masters["prod_for_list"],
            "peeling_locations": prod_locs,
            "varieties": masters["varieties"],
            "chemicals": masters["chemicals"],
            "species": masters["species"],
            "rows_batch": rows_batch,
            "today_data": [
                {
                    "id": r.id,
                    "date": r.date.isoformat() if r.date else None,
                    "time": r.time.strftime("%H:%M") if r.time else None,
                    "sintex_number": r.sintex_number,
                    "batch_number": r.batch_number,
                    "variety_name": r.variety_name,
                    "in_count": r.in_count,
                    "in_qty": r.in_qty,
                    "rejection_qty": r.rejection_qty,
                    "rejection_for": r.rejection_for,
                    "chemical_name": r.chemical_name,
                    "chemical_percent": r.chemical_percent,
                    "chemical_qty": r.chemical_qty,
                    "salt_percent": r.salt_percent,
                    "salt_qty": r.salt_qty,
                    "species": r.species,
                    "production_at": r.production_at,
                    "production_for": r.production_for,
                    "is_cancelled": r.is_cancelled,
                    "status": r.status,
                    "cancel_reason": r.cancel_reason,
                    "cancelled_by": r.cancelled_by,
                    "cancelled_at": r.cancelled_at.isoformat() if r.cancelled_at else None,
                    "email": r.email
                } for r in today_data
            ],
            "selected_production_for": global_production_for or "",
            "selected_location": global_location or ""
        })

    return templates.TemplateResponse(
        request=request, name="processing/soaking.html",
        context={
            "varieties": masters["varieties"], "species": masters["species"], "chemicals": masters["chemicals"],
            "production_locations": prod_locs, "prod_for_list": masters["prod_for_list"], "today_data": today_data,
            "rows_batch": rows_batch, "global_production_for": global_production_for or "", "global_location": global_location or ""
        }
    )


# =====================================================
# API LOOKUPS
# =====================================================
@router.get("/soaking/get_count/{batch}")
def get_count(batch: str, production_for: str = Query(None), location: str = Query(None), request: Request = None, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id: return {"counts": []}
    production_for, location, _ = resolve_session_scope(request, production_for, location)

    counts_q = db.query(FloorBalance).filter(
        FloorBalance.company_id == company_id,
        func.upper(func.trim(FloorBalance.batch_number)) == batch.strip().upper(),
        FloorBalance.count.isnot(None),
        cast(FloorBalance.count, String) != "N/A"
    )
    if production_for:
        counts_q = counts_q.filter(func.upper(func.trim(FloorBalance.production_for)) == production_for.strip().upper())
    if location:
        counts_q = counts_q.filter(func.upper(func.trim(FloorBalance.location)) == location.strip().upper())

    rows = counts_q.order_by(FloorBalance.count).all()
    counts = {
        r.count for r in rows
        if r.count and float(r.available_qty or 0) > 0.01
    }
    return {"counts": sorted(counts)}

@router.get("/soaking/get_available_qty")
def get_available_qty_api(location: str, batch: str, count: str, species: str, variety: str, production_for: str = Query(None), request: Request = None, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        raise HTTPException(status_code=401, detail="Session expired")
    production_for, location, _ = resolve_session_scope(request, production_for, location)

    prod_for_clean = production_for.strip() if production_for else ""
    if prod_for_clean in ("General Stock", "GENERAL STOCK", "N/A", ""):
        prod_for_clean = None

    query = db.query(func.coalesce(func.sum(FloorBalance.available_qty), 0)).filter(
        FloorBalance.company_id == company_id,
        func.upper(func.trim(FloorBalance.location)) == location.strip().upper(),
        func.upper(func.trim(FloorBalance.batch_number)) == batch.strip().upper(),
        func.upper(func.trim(FloorBalance.count)) == count.strip().upper(),
        func.upper(func.trim(FloorBalance.species)) == species.strip().upper(),
        func.upper(func.trim(FloorBalance.variety)) == variety.strip().upper()
    )
    if prod_for_clean:
        query = query.filter(func.upper(func.trim(FloorBalance.production_for)) == prod_for_clean.upper())
    else:
        query = query.filter((FloorBalance.production_for == None) | (func.trim(FloorBalance.production_for) == ""))
        
    available_qty = float(query.scalar() or 0)
    return {"available_qty": round(available_qty, 2)}

@router.get("/soaking/get_batches_by_company")
def get_batches_by_company(prod_for: str, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id or not prod_for: return {"batches": []}
    prod_for, global_location, user_allowed_locations = resolve_session_scope(request, prod_for)
    batch_q = db.query(FloorBalance).filter(FloorBalance.company_id == company_id, FloorBalance.production_for == prod_for)
    if global_location:
        batch_q = batch_q.filter(func.upper(func.trim(FloorBalance.location)) == global_location.strip().upper())
    if user_allowed_locations:
        batch_q = batch_q.filter(func.upper(func.trim(FloorBalance.location)).in_(user_allowed_locations))
    rows = batch_q.order_by(FloorBalance.batch_number).all()
    batches = {
        r.batch_number for r in rows
        if r.batch_number and float(r.available_qty or 0) > 0.01
    }
    return {"batches": sorted(batches)}


# =====================================================
# SAVE / UPDATE / DELETE
# =====================================================
@router.post("/soaking")
def save_soaking(
    request: Request, db: Session = Depends(get_db),
    sintex_number: str = Form(None), batch_number: str = Form(...), 
    variety_name: str = Form(...), in_count: str = Form(...), 
    in_qty: float = Form(0), rejection_qty: float = Form(0),
    rejection_for: str = Form(None), chemical_name: str = Form(...), 
    chemical_percent: float = Form(0), salt_percent: float = Form(0), 
    species_name: str = Form(None), production_at: str = Form(...), 
    production_for: str = Form(...)
):
    email = request.session.get("email")
    company_id = request.session.get("company_code")
    if not email or not company_id:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    production_for, production_at, _ = resolve_session_scope(request, production_for, production_at)
    clean_count = in_count.strip()
    clean_batch = batch_number.strip()

    # Row Lock Row on Validation Base
    live_record = db.query(FloorBalance).filter(
        FloorBalance.company_id == company_id,
        func.upper(func.trim(FloorBalance.location)) == str(production_at).strip().upper(),
        func.upper(func.trim(FloorBalance.batch_number)) == clean_batch.upper(),
        func.upper(func.trim(FloorBalance.count)) == clean_count.upper(),
        func.upper(func.trim(FloorBalance.species)) == str(species_name or "").strip().upper(),
        func.upper(func.trim(FloorBalance.variety)) == str(variety_name).strip().upper(),
        func.upper(func.trim(FloorBalance.production_for)) == str(production_for).strip().upper(),
    ).with_for_update().first()

    avail = float(live_record.available_qty or 0) if live_record else 0.0

    if in_qty > (avail + 0.05):
        return JSONResponse({"error": f"Insufficient live balance. Available: {avail}"}, status_code=400)

    current_ist = ist_now()
    today_dt = current_ist.date()

    if rejection_qty > 0 and in_qty == 0:
        final_sintex = None
    else:
        last_entry = db.query(Soaking).filter(Soaking.company_id == company_id, Soaking.date == today_dt, Soaking.sintex_number.isnot(None)).order_by(Soaking.id.desc()).first()
        final_sintex = str(int(last_entry.sintex_number) + 1) if last_entry and str(last_entry.sintex_number).isdigit() else "1"

    entry = Soaking(
        sintex_number=final_sintex, batch_number=clean_batch, variety_name=variety_name, 
        in_count=clean_count, in_qty=in_qty, rejection_qty=rejection_qty, 
        rejection_for=rejection_for, chemical_name=chemical_name, chemical_percent=chemical_percent,
        chemical_qty=round(in_qty * chemical_percent / 100, 2), salt_percent=salt_percent, 
        salt_qty=round(in_qty * salt_percent / 100, 2), species=species_name, 
        production_at=production_at, production_for=production_for, company_id=company_id, 
        email=email, date=today_dt, time=current_ist.time(), status="Pending"
    )
    db.add(entry)

    # ⚡ Atomic Update Engine Trigger (Deduct Stock & Accumulate Rejection)
    update_floor_balance_row(
        db, company_id, clean_batch, clean_count, species_name, variety_name, 
        production_at, production_for, qty_delta=rejection_qty - in_qty, email=email
    )

    db.commit()
    return RedirectResponse("/processing/soaking", status_code=303)


@router.post("/soaking/update/{id}")
def update_soaking(
    id: int, request: Request, db: Session = Depends(get_db),
    sintex_number: str = Form(None), batch_number: str = Form(...), 
    variety_name: str = Form(...), in_count: str = Form(...), 
    in_qty: float = Form(0), rejection_qty: float = Form(0),
    rejection_for: str = Form(None), chemical_name: str = Form(...), 
    chemical_percent: float = Form(0), salt_percent: float = Form(0), 
    species_name: str = Form(None), production_at: str = Form(...), 
    production_for: str = Form(...)
):
    email = request.session.get("email")
    company_id = request.session.get("company_code")
    if not email or not company_id:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    production_for, production_at, _ = resolve_session_scope(request, production_for, production_at)
    row = db.query(Soaking).filter(Soaking.id == id, Soaking.company_id == company_id).with_for_update().first()
    if not row:
        return JSONResponse({"error": "Log record data stream not found"}, status_code=404)
    if is_edit_locked(request, row.date):
        return JSONResponse({"error": edit_lock_message()}, status_code=403)

    # ⚡ Issue 1 Fix: species & variety    Row Mismatch ‌    !
    is_same_row = (
        row.batch_number == batch_number.strip() and 
        row.in_count == in_count.strip() and 
        row.species == species_name and 
        row.variety_name == variety_name and 
        row.production_at == production_at and 
        row.production_for == production_for
    )

    # Target Validation lookup safely
    target_record = db.query(FloorBalance).filter(
        FloorBalance.company_id == company_id,
        func.upper(func.trim(FloorBalance.location)) == str(production_at).strip().upper(),
        func.upper(func.trim(FloorBalance.batch_number)) == batch_number.strip().upper(),
        func.upper(func.trim(FloorBalance.count)) == in_count.strip().upper(),
        func.upper(func.trim(FloorBalance.species)) == str(species_name or "").strip().upper(),
        func.upper(func.trim(FloorBalance.variety)) == str(variety_name).strip().upper(),
        func.upper(func.trim(FloorBalance.production_for)) == str(production_for).strip().upper(),
    ).with_for_update().first()

    current_bal = float(target_record.available_qty or 0) if target_record else 0.0
    old_net_movement = float(row.in_qty or 0) - float(row.rejection_qty or 0)
    virtual_avail = current_bal + old_net_movement if is_same_row else current_bal

    if in_qty > (virtual_avail + 0.05):
        return JSONResponse({"error": f"Insufficient live balance for updated values. Available: {virtual_avail}"}, status_code=400)

    # Step 1: Refund Old State safely (Reverse stock & Rejection)
    update_floor_balance_row(
        db, company_id, row.batch_number, row.in_count, row.species, row.variety_name,
        row.production_at, row.production_for,
        qty_delta=float(row.in_qty or 0) - float(row.rejection_qty or 0), email=email
    )

    # Step 2: Apply changes to transaction row log
    row.sintex_number = sintex_number if not (rejection_qty > 0 and in_qty == 0) else None
    row.batch_number = str(batch_number).strip()
    row.variety_name = variety_name
    row.in_count = str(in_count).strip()
    row.in_qty = in_qty
    row.rejection_qty = rejection_qty
    row.rejection_for = rejection_for
    row.chemical_name = chemical_name
    row.chemical_percent = chemical_percent
    row.chemical_qty = round(in_qty * chemical_percent / 100, 2)
    row.salt_percent = salt_percent
    row.salt_qty = round(in_qty * salt_percent / 100, 2)
    row.species = species_name
    row.production_at = production_at
    row.production_for = production_for  

    # Step 3: Deduct New State
    update_floor_balance_row(
        db, company_id, row.batch_number, row.in_count, row.species, row.variety_name,
        row.production_at, row.production_for, qty_delta=rejection_qty - in_qty, email=email
    )

    db.commit()
    return RedirectResponse("/processing/soaking", status_code=303)


from app.utils.trace_lock import is_batch_used_downstream_from_soaking

@router.post("/soaking/delete/{id}")
def delete_soaking(
    id: int,
    request: Request,
    cancel_reason: str = Form(None),
    db: Session = Depends(get_db)
):
    email = request.session.get("email")
    company_id = request.session.get("company_code")
    if not email or not company_id:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    row = db.query(Soaking).filter(Soaking.id == id, Soaking.company_id == company_id).with_for_update().first()
    if not row:
        return JSONResponse({"error": "Record not found"}, status_code=404)

    if row.is_cancelled:
        return JSONResponse({"error": "This entry is already cancelled!"}, status_code=400)

    scoped_production_for, scoped_location, _ = resolve_session_scope(
        request, row.production_for, row.production_at
    )
    if (
        scoped_production_for
        and str(scoped_production_for).strip().upper() != str(row.production_for or "").strip().upper()
    ) or (
        scoped_location
        and str(scoped_location).strip().upper() != str(row.production_at or "").strip().upper()
    ):
        return JSONResponse({"error": "Record is outside the active session scope"}, status_code=403)
        
    if is_edit_locked(request, row.date):
        return JSONResponse({"error": edit_lock_message()}, status_code=403)

    # 🔒 Downstream Traceability Check
    is_used, stage = is_batch_used_downstream_from_soaking(db, row.batch_number, row.company_id)
    if is_used:
        return JSONResponse({
            "error": f"❌ Cannot cancel: Batch '{row.batch_number}' is already processed in {stage}!"
        }, status_code=400)

    # Full stack reverse automation refund processing
    update_floor_balance_row(
        db, company_id, row.batch_number, row.in_count, row.species, row.variety_name,
        row.production_at, row.production_for,
        qty_delta=float(row.in_qty or 0) - float(row.rejection_qty or 0), email=email
    )

    # Soft Delete / Cancel
    row.is_cancelled = True
    row.status = "Cancelled"
    row.cancel_reason = cancel_reason.strip() if cancel_reason else "Cancelled by user"
    row.cancelled_by = email
    row.cancelled_at = ist_now()

    db.commit()
    return JSONResponse({"status": "ok"})
