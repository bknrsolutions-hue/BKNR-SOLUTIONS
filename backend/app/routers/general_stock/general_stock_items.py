from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.database.models.general_stock import GeneralStock

# MAIN ROUTER
router = APIRouter(prefix="/items", tags=["GENERAL STORE ITEMS"])


# ==================== PAGE LOAD ==================== #
@router.get("/", response_class=HTMLResponse)
def general_items_page(request: Request, db: Session = Depends(get_db)):
    items = db.query(
        GeneralStock.item_name,
        GeneralStock.unit_name,
        GeneralStock.minimum_level
    ).distinct().all()

    return request.app.state.templates.TemplateResponse(
        "general_stock/general_store_items.html",
        {"request": request, "items": items}
    )


# ==================== ADD / UPDATE ITEM ==================== #
@router.post("/add")
def add_item(
    item_name: str = Form(...),
    unit_name: str = Form(...),
    minimum_level: float = Form(...),
    db: Session = Depends(get_db)
):

    row = db.query(GeneralStock).filter(
        GeneralStock.item_name == item_name,
        GeneralStock.unit_name == unit_name
    ).first()

    if row:                                   # UPDATE
        row.minimum_level = minimum_level
    else:                                     # CREATE
        db.add(GeneralStock(
            item_name=item_name,
            unit_name=unit_name,
            minimum_level=minimum_level,
            opening_stock=0,
            available_stock=0,
            movement_type="IN"
        ))

    db.commit()
    return RedirectResponse(url="/general_stock/items", status_code=303)


# ==================== DELETE ITEM ==================== #
@router.post("/delete/{item}/{unit}")
def delete_item(item: str, unit: str, db: Session = Depends(get_db)):

    rows = db.query(GeneralStock).filter(
        GeneralStock.item_name == item,
        GeneralStock.unit_name == unit
    ).all()

    for r in rows: db.delete(r)
    db.commit()

    return RedirectResponse(url="/general_stock/items", status_code=303)
