from app.utils.timezone import ist_now
from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.attendance import Shift 
from app.database.models.users import Company

router = APIRouter(tags=["SHIFT MASTER"])
templates = Jinja2Templates(directory="app/templates")

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
# 1. VIEW SHIFTS (GET)
# =========================================================
@router.get("/shifts", response_class=HTMLResponse)
def shift_master_page(request: Request, db: Session = Depends(get_db)):
    ctx = get_session_context(request, db)
    if not ctx:
        return RedirectResponse("/auth/login", status_code=302)

    comp = ctx["comp_code"]
    
    # Active shifts మాత్రమే తెచ్చుకుంటున్నాము
    all_shifts = db.query(Shift).filter(
        Shift.company_id == comp,
        Shift.is_active == True
    ).order_by(Shift.id.desc()).all()

    return templates.TemplateResponse(
        "admin/shifts.html",
        {
            "request": request,
            "company": ctx["company_info"],
            "shifts": all_shifts,
            "email": ctx["email"],
            "message": request.session.pop("message", None)
        }
    )

# =========================================================
# 2. SAVE SHIFT (POST)
# =========================================================
@router.post("/shifts/add")
async def save_shift(
    request: Request,
    shift_name: str = Form(...),
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

        new_shift = Shift(
            company_id=comp,
            company_name=comp_name,
            shift_name=shift_name,
            start_time=start_t,
            end_time=end_t,
            break_minutes=break_minutes,
            is_night_shift=is_night_shift,
            is_active=True,
            date=now.date(),
            time=now.time(),
            email=ctx["email"]
        )
        
        db.add(new_shift)
        db.commit()
        request.session["message"] = "✅ Shift Added Successfully!"
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
            # హార్డ్ డిలీట్ బదులు Soft Delete (is_active=False) చేయడం సేఫ్, లేదా నేరుగా db.delete(row) వాడొచ్చు
            row.is_active = False 
            db.commit()
            request.session["message"] = "✅ Shift Deleted Successfully!"
        except Exception as e:
            db.rollback()
            request.session["message"] = f"❌ Error Deleting Shift: {str(e)}"
            
    return RedirectResponse("/attendance/shifts", status_code=303)