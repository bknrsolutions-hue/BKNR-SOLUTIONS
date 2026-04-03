# app/routers/inventory/general_items.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
import logging

from app.database import get_db
from app.database.models.general_stock import GeneralStock

router = APIRouter(
    prefix="/items", 
    tags=["GENERAL STORE ITEMS"]
)

templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)

# ==================================================
# 📦 1. PAGE LOAD (GET)
# ==================================================
@router.get("/", response_class=HTMLResponse)
def general_items_page(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    company_id = request.session.get("company_code")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    # Fetching distinct items specific to this company
    items = db.query(
        GeneralStock.item_name,
        GeneralStock.unit_name,
        GeneralStock.minimum_level
    ).filter(
        GeneralStock.company_id == company_id
    ).distinct().all()

    return templates.TemplateResponse(
        request=request,
        name="general_stock/general_store_items.html",
        context={
            "items": items,
            "email": email,
            "company_id": company_id
        }
    )

# ==================================================
# 💾 2. ADD / UPDATE ITEM (POST)
# ==================================================
@router.post("/add")
def add_item(
    request: Request,
    item_name: str = Form(...),
    unit_name: str = Form(...),
    minimum_level: float = Form(...),
    db: Session = Depends(get_db)
):
    email = request.session.get("email")
    company_id = request.session.get("company_code")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    # Cleaning data inputs
    clean_item = item_name.strip().upper()
    clean_unit = unit_name.strip().upper()

    try:
        # Check if item exists for THIS company
        row = db.query(GeneralStock).filter(
            GeneralStock.item_name == clean_item,
            GeneralStock.unit_name == clean_unit,
            GeneralStock.company_id == company_id
        ).first()

        if row:
            # UPDATE existing master info
            row.minimum_level = minimum_level
        else:
            # CREATE new item master record
            new_item = GeneralStock(
                item_name=clean_item,
                unit_name=clean_unit,
                minimum_level=minimum_level,
                opening_stock=0,
                available_stock=0,
                movement_type="IN",
                company_id=company_id,
                email=email
            )
            db.add(new_item)

        db.commit()
        # Redirect back to the items list
        return RedirectResponse(url="/items/", status_code=303)

    except Exception as e:
        db.rollback()
        logger.error(f"General Item Save Error: {e}")
        return JSONResponse({"status": "error", "message": "Database Error"}, status_code=500)

# ==================================================
# 🗑️ 3. DELETE ITEM (POST)
# ==================================================
@router.post("/delete/{item}/{unit}")
def delete_item(item: str, unit: str, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")

    if not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    try:
        # Delete all records of this item/unit for THIS company only
        rows = db.query(GeneralStock).filter(
            GeneralStock.item_name == item,
            GeneralStock.unit_name == unit,
            GeneralStock.company_id == company_id
        ).all()

        for r in rows:
            db.delete(r)
        
        db.commit()
        return RedirectResponse(url="/items/", status_code=303)
        
    except Exception as e:
        db.rollback()
        logger.error(f"General Item Delete Error: {e}")
        return RedirectResponse(url="/items/", status_code=303)