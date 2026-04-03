# ============================================================
# GENERAL STOCK ENTRY ROUTER (BKNR ERP) - FULL CODE
# ============================================================

from fastapi import APIRouter, Request, Form, Depends, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.general_stock import GeneralStock

router = APIRouter(
    prefix="/general_stock",
    tags=["GENERAL STOCK"]
)

templates = Jinja2Templates(directory="app/templates")

# ========================= PAGE LOAD ========================= #
@router.get("/entry", response_class=HTMLResponse)
def general_stock_entry_page(request: Request, db: Session = Depends(get_db)):
    # 🔐 SESSION SECURITY CHECK
    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    # Fetching distinct lists for searchable dropdowns (Strictly by Company)
    grn_list = [x[0] for x in db.query(GeneralStock.grn_number).filter(GeneralStock.company_id == company_id).distinct().all() if x[0]]
    items    = [x[0] for x in db.query(GeneralStock.item_name).filter(GeneralStock.company_id == company_id).distinct().all() if x[0]]
    units    = [x[0] for x in db.query(GeneralStock.unit_name).filter(GeneralStock.company_id == company_id).distinct().all() if x[0]]

    today    = datetime.now().date()
    # Fetching today's entries for the quick view table
    today_data = db.query(GeneralStock).filter(
        GeneralStock.date == today,
        GeneralStock.company_id == company_id
    ).order_by(GeneralStock.id.desc()).all()

    return templates.TemplateResponse(
        request,
        "general_stock/general_stock_entry.html",
        {
            "grn_list": grn_list,
            "items": items,
            "units": units,
            "today_data": today_data
        }
    )


# ========================= SAVE ========================= #
@router.post("/entry")
def save_stock_entry(
    request: Request,
    grn_number: str = Form(...),
    item_name: str = Form(...),
    unit_name: str = Form(...),
    movement_type: str = Form(...),     # IN / OUT
    quantity: float = Form(...),
    opening_stock: float = Form(0),
    available_stock: float = Form(0),
    minimum_level: float = Form(None),
    db: Session = Depends(get_db)
):
    # 🔐 SESSION DATA
    company_id = request.session.get("company_code")
    user_email = request.session.get("email")

    if not company_id:
        return RedirectResponse("/auth/login", status_code=302)

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
        company_id=company_id
    )

    db.add(new_row)
    db.commit()

    # Redirecting back to the entry page with a 303 See Other status
    return RedirectResponse("/general_stock/entry", status_code=303)


# ========================= DELETE ========================= #
@router.post("/entry/delete/{id}")
def delete_stock(request: Request, id: int, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    
    if not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    # Finding row with both ID and Company ID for safety
    row = db.query(GeneralStock).filter(
        GeneralStock.id == id,
        GeneralStock.company_id == company_id
    ).first()

    if row:
        db.delete(row)
        db.commit()

    return RedirectResponse("/general_stock/entry", status_code=303)