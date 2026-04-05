from fastapi import APIRouter, Request, Form, Depends, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.general_stock import GeneralStock

# రౌటర్ డెఫినిషన్
router = APIRouter(prefix="/general_stock", tags=["GENERAL STOCK"])

# ============================================================
# GENERAL STOCK ENTRY – FULL ROUTER (FIXED)
# ============================================================

# 1. PAGE LOAD (GET)
@router.get("/entry", response_class=HTMLResponse)
def general_stock_entry_page(request: Request, db: Session = Depends(get_db)):
    
    # 🔐 Session & Security Check
    user_email = request.session.get("email")
    comp_code = request.session.get("company_code")

    if not user_email or not comp_code:
        return RedirectResponse("/", status_code=302)

    # 🔍 Fetch Dropdowns (Filtered by Company)
    grn_list = [x[0] for x in db.query(GeneralStock.grn_number).filter(GeneralStock.company_id == comp_code).distinct().all() if x[0]]
    items    = [x[0] for x in db.query(GeneralStock.item_name).filter(GeneralStock.company_id == comp_code).distinct().all() if x[0]]
    units    = [x[0] for x in db.query(GeneralStock.unit_name).filter(GeneralStock.company_id == comp_code).distinct().all() if x[0]]

    # 📊 Fetch Today's Data
    today = datetime.now().date()
    today_data = db.query(GeneralStock).filter(
        GeneralStock.date == today, 
        GeneralStock.company_id == comp_code
    ).all()

    # ✅ FIXED TEMPLATE RESPONSE
    return request.app.state.templates.TemplateResponse(
        request=request, 
        name="general_stock/general_stock_entry.html",
        context={
            "request": request,  # టెంప్లేట్ లోపల వాడటానికి
            "grn_list": grn_list,
            "items": items,
            "units": units,
            "today_data": today_data
        }
    )


# 2. SAVE ENTRY (POST)
@router.post("/entry")
def save_stock_entry(
    request: Request,
    grn_number: str = Form(...),
    item_name: str = Form(...),
    unit_name: str = Form(...),
    movement_type: str = Form(...),     # IN / OUT
    quantity: float = Form(...),
    opening_stock: float = Form(...),
    available_stock: float = Form(...),
    minimum_level: float = Form(None),
    db: Session = Depends(get_db)
):
    # 🔐 Get Session Data
    user_email = request.session.get("email")
    comp_code = request.session.get("company_code")

    if not user_email:
        return RedirectResponse("/", status_code=302)

    new_row = GeneralStock(
        grn_number=grn_number,
        item_name=item_name,
        unit_name=unit_name,
        movement_type=movement_type,
        quantity=quantity,
        opening_stock=opening_stock,
        available_stock=available_stock,
        minimum_level=minimum_level,
        date=datetime.now().date(),
        time=datetime.now().time(),
        email=user_email,
        company_id=comp_code
    )

    db.add(new_row)
    db.commit()

    return RedirectResponse("/general_stock/entry", status_code=303)


# 3. DELETE ENTRY (POST)
@router.post("/entry/delete/{id}")
def delete_stock(request: Request, id: int, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    
    # కేవలం తన కంపెనీ రికార్డ్ మాత్రమే డిలీట్ చేసేలా సెక్యూరిటీ
    row = db.query(GeneralStock).filter(
        GeneralStock.id == id, 
        GeneralStock.company_id == comp_code
    ).first()
    
    if row:
        db.delete(row)
        db.commit()

    return RedirectResponse("/general_stock/entry", status_code=303)