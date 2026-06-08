import pytz
from fastapi import APIRouter, Request, Form, Depends, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime

from app.database import get_db
from app.database.models.general_stock import GeneralStock, GeneralStoreItems

# 🔥 URL లో Duplicate రాకుండా prefix తీసేశాం, కేవలం tags మాత్రమే ఉంచాం
router = APIRouter(tags=["GENERAL STOCK"])

# =============================================================
# 1. PAGE LOAD (GET) - సెషన్ వైజ్ డ్రాప్‌డౌన్స్ & ఈరోజు డేటా
# =============================================================
@router.get("/entry", response_class=HTMLResponse)
def general_stock_entry_page(request: Request, db: Session = Depends(get_db)):
    user_email = request.session.get("email")
    comp_code = (request.session.get("company_code") or "").strip().upper() 

    if not user_email or not comp_code:
        return RedirectResponse("/", status_code=302)

    # GRN నంబర్లు (డిఫాల్ట్ గా చూపించడానికి)
    grn_list = [x[0] for x in db.query(GeneralStock.grn_number).filter(
        func.upper(func.trim(GeneralStock.company_id)) == comp_code
    ).distinct().all() if x[0]]
    
    # మాస్టర్ ఐటమ్స్ ఫిల్టరింగ్
    all_master_records = db.query(GeneralStoreItems).all()
    
    items_set = set()
    units_set = set()
    
    for record in all_master_records:
        record_comp_id = str(record.company_id or "").strip().upper()
        is_global = record_comp_id in ["", "NULL", "NONE"]
        
        if record_comp_id == comp_code or is_global:
            if record.item_name:
                items_set.add(str(record.item_name).strip().upper())
            if record.unit_name:
                units_set.add(str(record.unit_name).strip())
                
    items = sorted(list(items_set))
    units = sorted(list(units_set))

    # ఈరోజు ఎంటర్ చేసిన డేటా
    today = datetime.now().date()
    today_data = db.query(GeneralStock).filter(
        GeneralStock.date == today, 
        func.upper(func.trim(GeneralStock.company_id)) == comp_code
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

# =============================================================
# 2. AUTO-FILL ITEM DETAILS API (AJAX)
# =============================================================
@router.get("/api/item_details")
def get_item_details(request: Request, item_name: str, db: Session = Depends(get_db)):
    comp_code = (request.session.get("company_code") or "").strip().upper()
    req_item_name = item_name.strip().upper()
    
    all_items = db.query(GeneralStoreItems).all()
    master_item = None
    
    for m in all_items:
        db_item_name = str(m.item_name or "").strip().upper()
        c_id = str(m.company_id or "").strip().upper()
        is_global = c_id in ["", "NULL", "NONE"]
        
        if db_item_name == req_item_name and (c_id == comp_code or is_global):
            master_item = m
            break

    if not master_item:
        return JSONResponse({"error": "Item not found in master"}, status_code=404)

    last_stock = db.query(GeneralStock).filter(
        func.upper(func.trim(GeneralStock.item_name)) == req_item_name,
        func.upper(func.trim(GeneralStock.company_id)) == comp_code
    ).order_by(GeneralStock.id.desc()).first()

    opening_stock = last_stock.available_stock if (last_stock and last_stock.available_stock) else 0.0

    return JSONResponse({
        "unit_name": master_item.unit_name,
        "minimum_level": master_item.minimum_level,
        "opening_stock": opening_stock
    })

# =============================================================
# 3. 🔥 NEW: GET GRN NUMBERS FOR 'OUT' MOVEMENT (AJAX)
# =============================================================
@router.get("/api/get_item_grns")
def get_item_grns(request: Request, item_name: str, db: Session = Depends(get_db)):
    comp_code = (request.session.get("company_code") or "").strip().upper()
    req_item_name = item_name.strip().upper()
    
    # ఆ ఐటమ్ కి సంబంధించిన పాత GRN నంబర్లు (కేవలం IN అయినవి మాత్రమే) లాగుతున్నాం
    grns = db.query(GeneralStock.grn_number).filter(
        func.upper(func.trim(GeneralStock.company_id)) == comp_code,
        func.upper(func.trim(GeneralStock.item_name)) == req_item_name,
        GeneralStock.movement_type == "IN"
    ).distinct().all()
    
    grn_list = [g[0] for g in grns if g[0]]
    
    return JSONResponse({"grns": grn_list})

# =============================================================
# 4. SAVE / UPDATE STOCK ENTRY (POST)
# =============================================================
@router.post("/entry")
def save_stock_entry(
    request: Request,
    id: str = Form(None),
    grn_number: str = Form(...),
    item_name: str = Form(...),
    unit_name: str = Form(...),
    movement_type: str = Form(...),
    quantity: float = Form(...),
    minimum_level: float = Form(0.0),
    db: Session = Depends(get_db)
):
    user_email = request.session.get("email")
    comp_code = (request.session.get("company_code") or "").strip().upper()

    if not user_email or not comp_code:
        return RedirectResponse("/", status_code=302)

    # --- EDIT MODE ---
    if id and id.strip() != "":
        existing_row = db.query(GeneralStock).filter(
            GeneralStock.id == int(id), 
            func.upper(func.trim(GeneralStock.company_id)) == comp_code
        ).first()
        if existing_row:
            existing_row.grn_number = grn_number
            existing_row.item_name = item_name.strip().upper()
            existing_row.unit_name = unit_name.strip()
            existing_row.movement_type = movement_type
            existing_row.quantity = quantity
            existing_row.minimum_level = minimum_level
            db.commit()
            return RedirectResponse("/general_stock/entry", status_code=303)

    # --- NEW ENTRY MODE ---
    last_entry = db.query(GeneralStock).filter(
        func.upper(func.trim(GeneralStock.item_name)) == item_name.strip().upper(),
        func.upper(func.trim(GeneralStock.company_id)) == comp_code
    ).order_by(GeneralStock.id.desc()).first()

    current_bal = last_entry.available_stock if last_entry and last_entry.available_stock else 0

    if movement_type == "IN":
        new_bal = current_bal + quantity
    else:
        new_bal = current_bal - quantity

    new_row = GeneralStock(
        grn_number=grn_number,
        item_name=item_name.strip().upper(),
        unit_name=unit_name.strip(),
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

# =============================================================
# 5. DELETE ENTRY (POST)
# =============================================================
@router.post("/entry/delete/{id}")
def delete_stock(request: Request, id: int, db: Session = Depends(get_db)):
    comp_code = (request.session.get("company_code") or "").strip().upper()
    row = db.query(GeneralStock).filter(
        GeneralStock.id == id, 
        func.upper(func.trim(GeneralStock.company_id)) == comp_code
    ).first()
    if row:
        db.delete(row)
        db.commit()
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Record not found")

# =============================================================
# 6. ASYNC MODAL POPUP SAVE (ADD NEW ITEM TO MASTER)
# =============================================================
@router.post("/items/add")
def add_master_item_via_popup(
    request: Request,
    item_name: str = Form(...),
    unit_name: str = Form(...),
    minimum_level: float = Form(0.0),
    db: Session = Depends(get_db)
):
    user_email = request.session.get("email")
    comp_code = (request.session.get("company_code") or "").strip().upper()

    new_item = GeneralStoreItems(
        item_name=item_name.upper().strip(),
        unit_name=unit_name.strip(),
        minimum_level=minimum_level,
        created_date=datetime.now().date(),
        created_time=datetime.now().time(),
        email=user_email,
        company_id=comp_code
    )
    db.add(new_item)
    db.commit()
    return {"status": "success"}