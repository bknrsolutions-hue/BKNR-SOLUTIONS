from fastapi import APIRouter, Request, Form, Depends, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime

from app.database import get_db
from app.database.models.general_stock import GeneralStock

router = APIRouter(prefix="/general_stock", tags=["GENERAL STOCK"])

# ========================= PAGE LOAD ========================= #
@router.get("/entry", response_class=HTMLResponse)
def general_stock_entry_page(request: Request, db: Session = Depends(get_db)):
    
    user_email = request.session.get("email")
    comp_code = request.session.get("company_code")

    if not user_email or not comp_code:
        return RedirectResponse("/", status_code=302)

    # Filtered Dropdowns
    grn_list = [x[0] for x in db.query(GeneralStock.grn_number).filter(GeneralStock.company_id == comp_code).distinct().all() if x[0]]
    items    = [x[0] for x in db.query(GeneralStock.item_name).filter(GeneralStock.company_id == comp_code).distinct().all() if x[0]]
    units    = [x[0] for x in db.query(GeneralStock.unit_name).filter(GeneralStock.company_id == comp_code).distinct().all() if x[0]]

    # Today's Data
    today = datetime.now().date()
    today_data = db.query(GeneralStock).filter(
        GeneralStock.date == today, 
        GeneralStock.company_id == comp_code
    ).order_by(GeneralStock.id.desc()).all()

    return request.app.state.templates.TemplateResponse(
        request=request,
        name="general_stock/general_stock_entry.html",
        context={
            "request": request,
            "grn_list": grn_list,
            "items": items,
            "units": units,
            "today_data": today_data
        }
    )

# ========================= SAVE (With Auto Balance Logic) ========================= #
@router.post("/entry")
def save_stock_entry(
    request: Request,
    grn_number: str = Form(...),
    item_name: str = Form(...),
    unit_name: str = Form(...),
    movement_type: str = Form(...),
    quantity: float = Form(...),
    minimum_level: float = Form(None),
    db: Session = Depends(get_db)
):
    user_email = request.session.get("email")
    comp_code = request.session.get("company_code")

    if not user_email or not comp_code:
        return RedirectResponse("/", status_code=302)

    # 1. Get Current Available Stock for this Item
    # పాత రికార్డుల నుండి ఆ ఐటమ్ యొక్క ప్రస్తుత స్టాక్ ఎంత ఉందో లెక్కించడం
    last_entry = db.query(GeneralStock).filter(
        GeneralStock.item_name == item_name,
        GeneralStock.company_id == comp_code
    ).order_by(GeneralStock.id.desc()).first()

    current_bal = last_entry.available_stock if last_entry else 0

    # 2. Calculate New Balance
    # IN అయితే ప్లస్, OUT అయితే మైనస్
    if movement_type == "IN":
        new_bal = current_bal + quantity
    else:
        new_bal = current_bal - quantity
        # స్టాక్ మైనస్ లోకి వెళ్లకుండా చెక్ (Optional)
        if new_bal < 0:
            # ఇక్కడ కావాలంటే ఎర్రర్ పంపవచ్చు
            pass

    # 3. Save New Row
    new_row = GeneralStock(
        grn_number=grn_number,
        item_name=item_name,
        unit_name=unit_name,
        movement_type=movement_type,
        quantity=quantity,
        opening_stock=current_bal,
        available_stock=new_bal,
        minimum_level=minimum_level,
        date=datetime.now().date(),
        time=datetime.now().time(),
        email=user_email,
        company_id=comp_code
    )

    db.add(new_row)
    db.commit()

    return RedirectResponse("/general_stock/entry", status_code=303)

# ========================= DELETE ========================= #
@router.post("/entry/delete/{id}")
def delete_stock(request: Request, id: int, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    
    row = db.query(GeneralStock).filter(
        GeneralStock.id == id, 
        GeneralStock.company_id == comp_code
    ).first()
    
    if row:
        db.delete(row)
        db.commit()

    return RedirectResponse("/general_stock/entry", status_code=303)