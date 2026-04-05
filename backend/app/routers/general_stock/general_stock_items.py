from fastapi import APIRouter, Request, Form, Depends, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.database.models.general_stock import GeneralStock

# MAIN ROUTER - ప్రిఫిక్స్ సరిగ్గా చెక్ చేసుకో భాయ్
router = APIRouter(prefix="/general_stock/items", tags=["GENERAL STORE ITEMS"])


# ==================== PAGE LOAD (GET) ==================== #
@router.get("/", response_class=HTMLResponse)
def general_items_page(request: Request, db: Session = Depends(get_db)):
    
    # 🔐 Session Check
    comp_code = request.session.get("company_code")
    if not comp_code:
        return RedirectResponse("/", status_code=302)

    # కేవలం ఈ కంపెనీ ఐటమ్స్ మాత్రమే
    items = db.query(
        GeneralStock.item_name,
        GeneralStock.unit_name,
        GeneralStock.minimum_level
    ).filter(GeneralStock.company_id == comp_code).distinct().all()

    # ✅ FIXED TEMPLATE RESPONSE
    return request.app.state.templates.TemplateResponse(
        request=request,
        name="general_stock/general_store_items.html",
        context={
            "request": request,
            "items": items
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
        return RedirectResponse("/", status_code=302)

    # ఇప్పటికే ఉన్న ఐటమ్ ని వెతకడం
    row = db.query(GeneralStock).filter(
        GeneralStock.item_name == item_name,
        GeneralStock.unit_name == unit_name,
        GeneralStock.company_id == comp_code
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
            movement_type="IN",
            company_id=comp_code,
            email=user_email
        ))

    db.commit()
    # ✅ Redirect Path ని రౌటర్ ప్రిఫిక్స్ కి తగ్గట్టు మార్చాను
    return RedirectResponse(url="/general_stock/items/", status_code=303)


# ==================== DELETE ITEM (POST) ==================== #
@router.post("/delete/{item}/{unit}")
def delete_item(request: Request, item: str, unit: str, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")

    if not comp_code:
        return RedirectResponse("/", status_code=302)

    # ఈ కంపెనీకి చెందిన ఐటమ్స్ అన్నింటినీ డిలీట్ చేయడం
    rows = db.query(GeneralStock).filter(
        GeneralStock.item_name == item,
        GeneralStock.unit_name == unit,
        GeneralStock.company_id == comp_code
    ).all()

    for r in rows: 
        db.delete(r)
    
    db.commit()

    return RedirectResponse(url="/general_stock/items/", status_code=303)