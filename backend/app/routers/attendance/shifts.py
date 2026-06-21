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
from app.utils.global_filters import get_global_filters

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
    
    global_production_for, global_location = get_global_filters(request)
    session_locations = request.session.get("allowed_locations", [])
    user_allowed_locations = [loc.strip().upper() for loc in session_locations.split(",")] if isinstance(session_locations, str) else [str(loc).strip().upper() for loc in session_locations if str(loc).strip()]

    site_list = db.query(ProductionAtModel).filter(ProductionAtModel.company_id == comp).all()

    query = db.query(Shift).filter(
        Shift.company_id == comp,
        Shift.is_active == True
    )

    if global_location and global_location != "ALL":
        query = query.filter(func.upper(func.trim(Shift.production_at)) == global_location.strip().upper())
    elif user_allowed_locations:
        query = query.filter(func.upper(func.trim(Shift.production_at)).in_(user_allowed_locations))

    all_shifts = query.order_by(Shift.id.desc()).all()

    return templates.TemplateResponse(
        request=request,
        name="admin/shifts.html",
        context={
            "company": ctx["company_info"],
            "sites": site_list,          
            "shifts": all_shifts,
            "email": ctx["email"],
            "message": request.session.pop("message", None),
            "global_location": global_location or "",
            "global_production_for": global_production_for or ""
        }
    )

# =========================================================
# 2. SAVE & UPDATE SHIFT (POST) - 100% SAFE PARSING
# =========================================================
@router.post("/shifts/add")
async def save_or_update_shift(
    request: Request,
    shift_id: str = Form(default=""),          
    shift_name: str = Form(default=""),
    production_at: str = Form(default=""),     
    start_time: str = Form(default=""),
    end_time: str = Form(default=""),
    break_minutes: str = Form(default="0"),
    is_night_shift: str = Form(default="False"),
    db: Session = Depends(get_db)
):
    ctx = get_session_context(request, db)
    if not ctx: 
        return RedirectResponse("/auth/login", status_code=302)
    
    comp = ctx["comp_code"]
    comp_name = ctx["company_info"].company_name if ctx["company_info"] else "BKNR Enterprise"

    # 🟢 🔴 TERMINAL DEBUG: ఫారమ్ నుండి డేటా వస్తుందో లేదో ఇక్కడ ప్రింట్ అవుతుంది
    print(f"--- SHIFT FORM DATA ---")
    print(f"ID: '{shift_id}', Name: '{shift_name}', Plant: '{production_at}', Start: '{start_time}', End: '{end_time}', Break: '{break_minutes}', Night: '{is_night_shift}'")

    try:
        # 1. Safe ID Parsing
        parsed_id = None
        if shift_id and shift_id.strip().isdigit():
            parsed_id = int(shift_id.strip())

        # 2. Safe Break Minutes Parsing
        try:
            b_mins = int(break_minutes.strip())
        except ValueError:
            b_mins = 0

        # 3. Safe Boolean Parsing
        night_shift = is_night_shift.strip().lower() == "true"

        # 4. Safe Time Parsing (Only taking HH:MM to avoid HH:MM:SS errors)
        start_t = datetime.strptime(start_time[:5], "%H:%M").time()
        end_t = datetime.strptime(end_time[:5], "%H:%M").time()
        
        now = ist_now()

        safe_production_at = production_at.strip()
        safe_shift_name = shift_name.strip()

        # 🟢 🔴 UNIQUE CHECK
        duplicate_check = db.query(Shift).filter(
            Shift.company_id == comp,
            func.upper(func.trim(Shift.production_at)) == safe_production_at.upper(),
            func.upper(func.trim(Shift.shift_name)) == safe_shift_name.upper(),
            Shift.is_active == True
        ).first()

        if parsed_id:
            # 🟢 EDIT MODE
            if duplicate_check and duplicate_check.id != parsed_id:
                request.session["message"] = f"❌ Error: Shift '{safe_shift_name}' already exists at '{safe_production_at}'!"
                return RedirectResponse("/attendance/shifts", status_code=303)

            existing_shift = db.query(Shift).filter(Shift.id == parsed_id, Shift.company_id == comp).first()
            if existing_shift:
                existing_shift.production_at = safe_production_at
                existing_shift.shift_name = safe_shift_name
                existing_shift.start_time = start_t
                existing_shift.end_time = end_t
                existing_shift.break_minutes = b_mins
                existing_shift.is_night_shift = night_shift
                request.session["message"] = "✅ Shift Updated Successfully!"
            else:
                request.session["message"] = "❌ Error: Shift Record Not Found!"
        else:
            # 🟢 NEW MODE
            if duplicate_check:
                request.session["message"] = f"❌ Error: Shift '{safe_shift_name}' already exists at '{safe_production_at}'!"
                return RedirectResponse("/attendance/shifts", status_code=303)

            new_shift = Shift(
                company_id=comp,
                company_name=comp_name,
                production_at=safe_production_at, 
                shift_name=safe_shift_name,
                start_time=start_t,
                end_time=end_t,
                break_minutes=b_mins,
                is_night_shift=night_shift,
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
        print(f"--- DB ERROR ---: {str(e)}") # టెర్మినల్ లో ఎర్రర్ చూపిస్తుంది
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
            row.is_active = False 
            db.commit()
            request.session["message"] = "✅ Shift Deleted Successfully!"
        except Exception as e:
            db.rollback()
            request.session["message"] = f"❌ Error Deleting Shift: {str(e)}"
            
    return RedirectResponse("/attendance/shifts", status_code=303)