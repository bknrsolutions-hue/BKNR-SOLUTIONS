# app/routers/attendance/shifts.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from typing import Optional

from app.database import get_db
from app.database.models.attendance import Shift 
from app.database.models.users import Company
from app.database.models.criteria import production_at as ProductionAtModel

from app.utils.timezone import ist_now
from app.utils.global_filters import get_global_filters  # 🌐 Global Filters Helper

router = APIRouter(tags=["SHIFT MASTER"])
templates = Jinja2Templates(directory="app/templates")

# =========================================================
# HELPER: SESSION CHECK & COMPANY DATA
# =========================================================
def get_session_context(request: Request, db: Session):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code:
        return None
    
    company_info = db.query(Company).filter(Company.company_code == comp_code).first()
    return {
        "comp_code": comp_code,
        "email": email,
        "company_info": company_info
    }

# =========================================================
# 1. VIEW SHIFTS (GET) WITH GLOBAL FILTERS
# =========================================================
@router.get("/shifts", response_class=HTMLResponse)
def shift_master_page(request: Request, db: Session = Depends(get_db)):
    ctx = get_session_context(request, db)
    if not ctx:
        return RedirectResponse("/auth/login", status_code=302)

    comp = ctx["comp_code"]
    
    # 🟢 🔴 GRAB GLOBAL FILTERS & PERMISSIONS
    global_production_for, global_location = get_global_filters(request)
    session_locations = request.session.get("allowed_locations", [])
    user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",")] if isinstance(session_locations, str) else [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]

    # ఫారమ్ లో డ్రాప్‌డౌన్ కోసం ప్లాంట్స్ (Production At) లిస్ట్
    site_list = db.query(ProductionAtModel).filter(ProductionAtModel.company_id == comp).all()

    # యాక్టివ్ షిఫ్ట్స్ క్వెరీ 
    query = db.query(Shift).filter(
        Shift.company_id == comp,
        Shift.is_active == True
    )

    # 🟢 🔴 APPLY GLOBAL FILTERS (ప్లాంట్ వైజ్ ఫిల్టరింగ్)
    if global_location:
        query = query.filter(func.upper(func.trim(Shift.production_at)) == global_location.strip().upper())
    elif user_allowed_locations:
        query = query.filter(func.upper(func.trim(Shift.production_at)).in_(user_allowed_locations))

    all_shifts = query.order_by(Shift.id.desc()).all()

    return templates.TemplateResponse(
        "admin/shifts.html",
        {
            "request": request,
            "company": ctx["company_info"],
            "sites": site_list,          
            "shifts": all_shifts,
            "email": ctx["email"],
            "message": request.session.pop("message", None)
        }
    )

# =========================================================
# 2. SAVE & UPDATE SHIFT (POST)
# =========================================================
@router.post("/shifts/add")
async def save_or_update_shift(
    request: Request,
    shift_id: Optional[int] = Form(None),          # 👈 ID వస్తే Edit, లేకపోతే New
    shift_name: str = Form(...),
    production_at: str = Form(None),     
    start_time: str = Form(...),
    end_time: str = Form(...),
    break_minutes: int = Form(0),
    is_night_shift: bool = Form(False),
    db: Session = Depends(get_db)
):
    ctx = get_session_context(request, db)
    if not ctx: 
        return RedirectResponse("/auth/login", status_code=302)
    
    comp = ctx["comp_code"]
    comp_name = ctx["company_info"].company_name if ctx["company_info"] else "BKNR Enterprise"

    try:
        # HTML time string (HH:MM) ని Python time object లోకి మారుస్తున్నాము
        start_t = datetime.strptime(start_time, "%H:%M").time()
        end_t = datetime.strptime(end_time, "%H:%M").time()
        now = ist_now()

        if shift_id:
            # 🟢 🔴 EDIT MODE: ఎగ్జిస్టింగ్ రికార్డ్‌ను అప్‌డేట్ చేస్తున్నాము
            existing_shift = db.query(Shift).filter(Shift.id == shift_id, Shift.company_id == comp).first()
            if existing_shift:
                existing_shift.production_at = production_at
                existing_shift.shift_name = shift_name.strip()
                existing_shift.start_time = start_t
                existing_shift.end_time = end_t
                existing_shift.break_minutes = break_minutes
                existing_shift.is_night_shift = is_night_shift
                existing_shift.last_updated = now  # ట్రాకింగ్ కోసం ఉంటే మంచిది
                request.session["message"] = "✅ Shift Updated Successfully!"
            else:
                request.session["message"] = "❌ Error: Shift Record Not Found!"
        else:
            # 🟢 🔴 NEW MODE: కొత్త రికార్డ్‌ క్రియేట్ చేస్తున్నాము
            new_shift = Shift(
                company_id=comp,
                company_name=comp_name,
                production_at=production_at, 
                shift_name=shift_name.strip(),
                start_time=start_t,
                end_time=end_time,
                break_minutes=break_minutes,
                is_night_shift=is_night_shift,
                is_active=True,
                date=now.date(),
                time=now.time(),
                email=ctx["email"]
            )
            db.add(new_shift)
            request.session["message"] = "✅ Shift Added Successfully!"

        db.commit()

    except Exception as e:
        db.rollback()
        request.session["message"] = f"❌ Error: {str(e)}"

    return RedirectResponse("/attendance/shifts", status_code=303)

# =========================================================
# 3. DELETE SHIFT (POST)
# =========================================================
@router.post("/shifts/delete/{shift_id}")
def delete_shift(shift_id: int, request: Request, db: Session = Depends(get_db)):
    comp = request.session.get("company_code")
    if not comp:
        return RedirectResponse("/auth/login", status_code=302)

    row = db.query(Shift).filter(
        Shift.id == shift_id, 
        Shift.company_id == comp
    ).first()
    
    if row:
        try:
            # హార్డ్ డిలీట్ బదులు Soft Delete (is_active=False) చేయడం సేఫ్
            row.is_active = False 
            db.commit()
            request.session["message"] = "✅ Shift Deleted Successfully!"
        except Exception as e:
            db.rollback()
            request.session["message"] = f"❌ Error Deleting Shift: {str(e)}"
            
    return RedirectResponse("/attendance/shifts", status_code=303)