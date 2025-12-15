from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, JSONResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.inventory_management import stock_entry as StockEntry   # ✅ FIXED IMPORT

router = APIRouter( tags=["Inventory Report"])


# ----------------------------------------------------------
# PAGE LOAD SUMMARY
# ----------------------------------------------------------
@router.get("/inventory_report", response_class=HTMLResponse)
def inventory_report(request: Request, db: Session = Depends(get_db)):

    rows = db.query(
        StockEntry.batch_number,
        StockEntry.brand,
        StockEntry.variety,
        StockEntry.grade,
        StockEntry.glaze,
        StockEntry.freezer,
        StockEntry.packing_style,
        StockEntry.quantity
    ).all()

    summary = {}

    for r in rows:
        key = (r.batch_number, r.brand, r.variety, r.grade, r.glaze, r.freezer, r.packing_style)
        summary[key] = summary.get(key, 0) + float(r.quantity or 0)

    return request.app.state.templates.TemplateResponse(
        "inventory_management/inventory_report.html",
        {"request": request, "summary": summary}
    )


# ----------------------------------------------------------
# LOCATIONS SUMMARY (ROW EXPAND)
# ----------------------------------------------------------
@router.post("/inventory_report/location")
def inventory_location(
    batch: str = Form(...),
    brand: str = Form(...),
    variety: str = Form(...),
    grade: str = Form(...),
    glaze: str = Form(...),
    freezer: str = Form(...),
    packing_style: str = Form(...),
    db: Session = Depends(get_db)
):
    q = db.query(StockEntry.location, StockEntry.quantity).filter(
        StockEntry.batch_number == batch,
        StockEntry.brand == brand,
        StockEntry.variety == variety,
        StockEntry.grade == grade,
        StockEntry.glaze == glaze,
        StockEntry.freezer == freezer,
        StockEntry.packing_style == packing_style
    ).all()

    result = {}
    for loc, qty in q:
        if loc:
            result[loc] = result.get(loc, 0) + float(qty or 0)

    return JSONResponse(result)


# ----------------------------------------------------------
# FULL TRANSACTIONS (EXPAND LOCATION)
# ----------------------------------------------------------
@router.post("/inventory_report/transactions")
def inventory_transactions(
    batch: str = Form(...),
    brand: str = Form(...),
    variety: str = Form(...),
    grade: str = Form(...),
    glaze: str = Form(...),
    freezer: str = Form(...),
    packing_style: str = Form(...),
    location: str = Form(...),
    db: Session = Depends(get_db)
):
    q = db.query(
        StockEntry.date,
        StockEntry.cargo_movement_type,
        StockEntry.no_of_mc,
        StockEntry.loose,
        StockEntry.quantity,
        StockEntry.po_number,
        StockEntry.purpose,
        StockEntry.production_at
    ).filter(
        StockEntry.batch_number == batch,
        StockEntry.brand == brand,
        StockEntry.variety == variety,
        StockEntry.grade == grade,
        StockEntry.glaze == glaze,
        StockEntry.freezer == freezer,
        StockEntry.packing_style == packing_style,
        StockEntry.location == location
    ).all()

    res = []
    for r in q:
        res.append({
            "date": r.date.strftime("%d-%m-%Y") if hasattr(r.date, "strftime") else str(r.date),
            "move": r.cargo_movement_type,
            "mc": r.no_of_mc,
            "loose": r.loose,
            "qty": float(r.quantity or 0),
            "po": r.po_number,
            "purpose": r.purpose,
            "prod": r.production_at
        })

    return JSONResponse(res)
