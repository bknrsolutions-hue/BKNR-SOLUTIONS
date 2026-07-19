from fastapi import APIRouter, Request, Form, Depends, HTTPException
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
# 2 ‌ ‌
from app.database.models.general_stock import GeneralStock, GeneralStoreItems

#  : /general_stock/items
router = APIRouter(prefix="/items", tags=["GENERAL STORE ITEMS"])
templates = Jinja2Templates(directory="app/templates")


# ==================== PAGE LOAD (GET) ==================== #
@router.get("", response_class=HTMLResponse)
@router.get("/", response_class=HTMLResponse)
def general_items_page(request: Request, db: Session = Depends(get_db)):

    # 🔐 Session Check
    comp_code = request.session.get("company_code")
    session_email = request.session.get("email")
    if not comp_code or not session_email:
        return RedirectResponse("/", status_code=302)

    # ✅ FIX:    (GeneralStoreItems)
    items = (
        db.query(GeneralStoreItems)
        .filter(GeneralStoreItems.company_id == comp_code)
        .order_by(GeneralStoreItems.id.desc())
        .all()
    )

    if request.query_params.get("format") == "json":
        return JSONResponse({
            "items": [
                {
                    "id": item.id,
                    "item_name": item.item_name,
                    "unit_name": item.unit_name,
                    "minimum_level": float(item.minimum_level or 0),
                }
                for item in items
            ]
        })

    return templates.TemplateResponse(
        request=request,
        name="general_stock/general_store_items.html",
        context={
            "request": request,
            "items": items,
            "email": session_email,
            "company_id": comp_code
        }
    )


# ==================== ADD / UPDATE ITEM (POST) ==================== #
@router.post("/add")
def add_item(
    request: Request,
    item_name: str = Form(...),
    unit_name: str = Form(...),
    minimum_level: float = Form(...),
    db: Session = Depends(get_db)
):
    comp_code = request.session.get("company_code")
    user_email = request.session.get("email")

    if not comp_code:
        return {"error": "Unauthorized session"}, 401

    # ✅ FIX: GeneralStoreItems  ‌
    row = db.query(GeneralStoreItems).filter(
        GeneralStoreItems.item_name == item_name,
        GeneralStoreItems.unit_name == unit_name,
        GeneralStoreItems.company_id == comp_code
    ).first()

    if row:
        #     ‌
        row.minimum_level = minimum_level
    else:
        #
        new_item = GeneralStoreItems(
            item_name=item_name,
            unit_name=unit_name,
            minimum_level=minimum_level,
            company_id=comp_code,
            email=user_email
        )
        db.add(new_item)

    db.commit()

    # HTML  popup modal  `fetch`
    #  JSON   `res.ok`  ,    !
    return {"status": "success", "message": f"Item '{item_name}' saved successfully!"}


# ==================== DELETE ITEM (POST) ==================== #
@router.post("/delete/{item}/{unit}")
def delete_item(request: Request, item: str, unit: str, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")

    if not comp_code:
        return RedirectResponse("/", status_code=302)

    #
    db.query(GeneralStoreItems).filter(
        GeneralStoreItems.item_name == item,
        GeneralStoreItems.unit_name == unit,
        GeneralStoreItems.company_id == comp_code
    ).delete()

    db.commit()

    return RedirectResponse(url="/general_stock/items/", status_code=303)
