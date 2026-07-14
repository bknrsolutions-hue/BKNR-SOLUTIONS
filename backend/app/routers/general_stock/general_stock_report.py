from fastapi import APIRouter, Request, Depends, Form, Query
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from sqlalchemy.orm import Session
from datetime import datetime, date
from app.utils.timezone import ist_now
from app.database import get_db
from app.database.models.general_stock import GeneralStock, GeneralStoreItems

# Prefix and tags configuration
router = APIRouter(tags=["GENERAL STOCK"])

# ============================================================
# 1. ITEMS MASTER LOGIC
# ============================================================

@router.get("/items", response_class=HTMLResponse)
async def items_master_page(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/", status_code=302)

    db_items = db.query(GeneralStoreItems).filter(GeneralStoreItems.company_id == company_id).all()
    items_list = [[i.item_name, i.unit_name, i.minimum_level] for i in db_items]

    return request.app.state.templates.TemplateResponse(
        request=request, 
        name="general_stock/items_master.html",
        context={"request": request, "items": items_list}
    )

@router.post("/items/add")
async def add_item_master(
    request: Request,
    item_name: str = Form(...),
    unit_name: str = Form(...),
    minimum_level: float = Form(0.0),
    db: Session = Depends(get_db)
):
    user_email = request.session.get("email")
    company_id = request.session.get("company_code")
    if not company_id:
        return JSONResponse(status_code=401, content={"message": "Unauthorized"})

    item_name = item_name.strip().upper()
    unit_name = unit_name.strip()

    existing_item = db.query(GeneralStoreItems).filter(
        GeneralStoreItems.company_id == company_id,
        GeneralStoreItems.item_name == item_name
    ).first()

    if existing_item:
        existing_item.unit_name = unit_name
        existing_item.minimum_level = minimum_level
    else:
        new_item = GeneralStoreItems(
            item_name=item_name,
            unit_name=unit_name,
            minimum_level=minimum_level,
            email=user_email,
            company_id=company_id
        )
        db.add(new_item)

    db.commit()
    return JSONResponse(status_code=200, content={"message": "Success"})

@router.post("/items/delete/{item_name}/{unit_name}")
async def delete_item_master(request: Request, item_name: str, unit_name: str, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    item = db.query(GeneralStoreItems).filter(
        GeneralStoreItems.company_id == company_id,
        GeneralStoreItems.item_name == item_name,
        GeneralStoreItems.unit_name == unit_name
    ).first()
    
    if item:
        db.delete(item)
        db.commit()
        return JSONResponse(status_code=200, content={"message": "Deleted"})
    return JSONResponse(status_code=404, content={"message": "Not Found"})


# ============================================================
# 2. GENERAL STOCK ENTRY LOGIC
# ============================================================

@router.get("/entry", response_class=HTMLResponse)
async def stock_entry_page(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/", status_code=302)

    items_master = db.query(GeneralStoreItems.item_name).filter(GeneralStoreItems.company_id == company_id).all()
    items_list = [i[0] for i in items_master]

    grn_list = [
        x[0] for x in db.query(GeneralStock.grn_number)
        .filter(GeneralStock.company_id == company_id)
        .filter(GeneralStock.movement_type == "IN")
        .distinct().all() if x[0]
    ]

    today = ist_now().date()
    today_data = db.query(GeneralStock).filter(
        GeneralStock.company_id == company_id,
        GeneralStock.is_cancelled != True,
        GeneralStock.date == today
    ).order_by(GeneralStock.id.desc()).all()

    return request.app.state.templates.TemplateResponse(
        request=request, 
        name="general_stock/general_stock_entry.html",
        context={
            "request": request, 
            "items": items_list,
            "grn_list": grn_list,
            "today_data": today_data
        }
    )

@router.post("/entry")
async def save_stock_entry(
    request: Request,
    id: str = Form(None),
    grn_number: str = Form(...),
    item_name: str = Form(...),
    unit_name: str = Form(...),
    movement_type: str = Form(...),
    quantity: float = Form(...),
    opening_stock: float = Form(...),
    available_stock: float = Form(...),
    minimum_level: float = Form(0.0),
    db: Session = Depends(get_db)
):
    user_email = request.session.get("email")
    company_id = request.session.get("company_code")
    
    if not company_id:
        return RedirectResponse("/", status_code=302)

    if id:
        entry = db.query(GeneralStock).filter(GeneralStock.id == id, GeneralStock.company_id == company_id).first()
        if entry:
            entry.movement_type = movement_type
            entry.grn_number = grn_number
            entry.item_name = item_name
            entry.unit_name = unit_name
            entry.quantity = quantity
            entry.opening_stock = opening_stock
            entry.available_stock = available_stock
            entry.minimum_level = minimum_level
    else:
        entry = GeneralStock(
            grn_number=grn_number,
            item_name=item_name,
            unit_name=unit_name,
            movement_type=movement_type,
            quantity=quantity,
            opening_stock=opening_stock,
            available_stock=available_stock,
            minimum_level=minimum_level,
            email=user_email,
            company_id=company_id,
            date=ist_now().date(),
            time=ist_now().time()
        )
        db.add(entry)

    db.commit()
    return RedirectResponse("/general_stock/entry", status_code=303)

@router.post("/entry/delete/{entry_id}")
async def delete_stock_entry(request: Request, entry_id: int, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    entry = db.query(GeneralStock).filter(GeneralStock.id == entry_id, GeneralStock.company_id == company_id).first()
    
    if entry:
        entry.is_cancelled = True
        db.commit()
        return JSONResponse(status_code=200, content={"message": "Cancelled"})
    return JSONResponse(status_code=404, content={"message": "Not Found"})

@router.get("/api/item_details")
async def get_item_details(item_name: str, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    
    master = db.query(GeneralStoreItems).filter(
        GeneralStoreItems.company_id == company_id,
        GeneralStoreItems.item_name == item_name
    ).first()

    if not master:
        return JSONResponse(status_code=404, content={"message": "Item not found"})

    last_entry = db.query(GeneralStock).filter(
        GeneralStock.company_id == company_id,
        GeneralStock.item_name == item_name
    ).order_by(GeneralStock.id.desc()).first()

    opening_stock = last_entry.available_stock if last_entry else 0.0

    return JSONResponse({
        "unit_name": master.unit_name,
        "minimum_level": master.minimum_level,
        "opening_stock": opening_stock
    })

@router.get("/api/get_item_grns")
async def get_item_grns(request: Request, item_name: str, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    req_item_name = item_name.strip().upper()
    
    grns = db.query(GeneralStock.grn_number).filter(
        GeneralStock.company_id == company_id,
        GeneralStock.item_name == req_item_name,
        GeneralStock.movement_type == "IN"
    ).distinct().all()
    
    grn_list = [g[0] for g in grns if g[0]]
    return JSONResponse({"grns": grn_list})


# ============================================================
# 3. GENERAL STOCK REPORT LOGIC
# ============================================================

@router.get("/report", response_class=HTMLResponse)
async def general_stock_report(
    request: Request,
    fy: str = "",
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/", status_code=302)
    if "fy" not in request.query_params:
        today = ist_now().date()
        fy = str(today.year if today.month >= 4 else today.year - 1)

    query = db.query(GeneralStock).filter(GeneralStock.is_cancelled != True)

    # Company Filter
    if company_id:
        query = query.filter(GeneralStock.company_id == company_id)

    # Financial Year Filter
    if fy == "":
        query = query.filter(GeneralStock.id == -1)
    elif fy:
        try:
            fy_year = int(fy)
            fy_start = date(fy_year, 4, 1)
            fy_end = date(fy_year + 1, 3, 31)

            query = query.filter(
                GeneralStock.date >= fy_start,
                GeneralStock.date <= fy_end
            )
        except Exception as e:
            print("FY FILTER ERROR :", e)

    records = query.order_by(
        GeneralStock.date.desc(),
        GeneralStock.id.desc()
    ).all()

    # Terminal Logs for debugging
    print("====================================")
    print("GENERAL STOCK REPORT")
    print("COMPANY ID :", company_id)
    print("FY :", fy)
    print("TOTAL RECORDS :", len(records))
    print("====================================")

    dropdown_grn = sorted(list({r.grn_number for r in records if r.grn_number}))
    dropdown_items = sorted(list({r.item_name for r in records if r.item_name}))
    dropdown_unit = sorted(list({r.unit_name for r in records if r.unit_name}))

    if request.query_params.get("format") == "json":
        from fastapi.responses import JSONResponse
        from fastapi.encoders import jsonable_encoder
        serialized_records = [{col.name: getattr(r, col.name) for col in r.__table__.columns} for r in records]
        return JSONResponse(jsonable_encoder({
            "records": serialized_records,
            "dropdown_grn": dropdown_grn,
            "dropdown_items": dropdown_items,
            "dropdown_unit": dropdown_unit,
            "selected_fy": fy
        }))

    return request.app.state.templates.TemplateResponse(
        request=request,
        name="general_stock/general_stock_report.html",
        context={
            "request": request,
            "records": records,
            "dropdown_grn": dropdown_grn,
            "dropdown_items": dropdown_items,
            "dropdown_unit": dropdown_unit,
            "selected_fy": fy,
            "datetime": datetime
        }
    )
