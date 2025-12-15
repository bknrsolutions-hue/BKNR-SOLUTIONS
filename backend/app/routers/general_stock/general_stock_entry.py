from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import RedirectResponse, HTMLResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.general_stock import GeneralStock


router = APIRouter( tags=["GENERAL STOCK"])   # 🔥 FIXED


# ========================= PAGE LOAD ========================= #
@router.get("/entry", response_class=HTMLResponse)
def general_stock_entry_page(request: Request, db: Session = Depends(get_db)):

    grn_list = [x[0] for x in db.query(GeneralStock.grn_number).distinct().all() if x[0]]
    items    = [x[0] for x in db.query(GeneralStock.item_name).distinct().all() if x[0]]
    units    = [x[0] for x in db.query(GeneralStock.unit_name).distinct().all() if x[0]]

    today    = datetime.now().date()
    today_data = db.query(GeneralStock).filter(GeneralStock.date == today).all()

    return request.app.state.templates.TemplateResponse(
        "general_stock/general_stock_entry.html",
        {
            "request": request,
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
    opening_stock: float = Form(...),
    available_stock: float = Form(...),
    minimum_level: float = Form(None),
    db: Session = Depends(get_db)
):

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
        email="admin@bknr.com",     # later → request.session["email"]
        company_id=1                # later → session-based
    )

    db.add(new_row)
    db.commit()

    return RedirectResponse("/general_stock/entry", status_code=303)


# ========================= DELETE ========================= #
@router.post("/entry/delete/{id}")
def delete_stock(id: int, db: Session = Depends(get_db)):
    row = db.query(GeneralStock).filter(GeneralStock.id == id).first()
    if row:
        db.delete(row)
        db.commit()

    return RedirectResponse("/general_stock/entry", status_code=303)
