from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import date

from app.database import get_db
from app.database.models.bills import DieselLog
from app.database.models.criteria import production_at
from app.main import templates

router = APIRouter(
    prefix="/diesel",
    tags=["Diesel"]
)

# ==================================================
# ⛽ DIESEL ENTRY PAGE
# URL: /api/diesel/entry
# ==================================================
@router.get("/entry", response_class=HTMLResponse)
def diesel_entry_page(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email:
        return RedirectResponse("/", status_code=303)

    locations = (
        db.query(production_at)
        .filter(production_at.company_id == company_code)
        .order_by(production_at.production_at)
        .all()
    )

    diesel_history = (
        db.query(
            DieselLog.log_date,
            DieselLog.type,
            DieselLog.grn_no,
            DieselLog.bill_no,
            DieselLog.vendor,
            DieselLog.purchase_qty,
            DieselLog.consumption,
            DieselLog.avg_price,
            DieselLog.tax_per,
            DieselLog.net_val,
            DieselLog.closing_stock,
            production_at.production_at.label("production_at_name")
        )
        .join(production_at, DieselLog.unit_id == production_at.id)
        .filter(production_at.company_id == company_code)
        .order_by(desc(DieselLog.log_date), desc(DieselLog.id))
        .limit(100)
        .all()
    )

    return templates.TemplateResponse(
        "bills/diesel_entry.html",
        {
            "request": request,
            "locations": locations,
            "diesel_history": diesel_history
        }
    )

# ==================================================
# 🔍 LOOKUP LAST STOCK
# URL: /api/diesel/lookup/{unit_id}
# ==================================================
@router.get("/lookup/{unit_id}")
def lookup_diesel_status(unit_id: int, request: Request, db: Session = Depends(get_db)):
    if not request.session.get("email"):
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    last = (
        db.query(DieselLog)
        .filter(DieselLog.unit_id == unit_id)
        .order_by(desc(DieselLog.id))
        .first()
    )

    return {
        "last_closing": float(last.closing_stock) if last else 0.0,
        "last_rate": float(last.avg_price) if last else 0.0
    }

# ==================================================
# 💾 SAVE STOCK IN (GRN)
# URL: /api/diesel/save_in
# ==================================================
@router.post("/save_in")
def save_diesel_in(
    request: Request,
    db: Session = Depends(get_db),

    entry_date: date = Form(...),
    in_unit_id: int = Form(...),
    bill_date: date = Form(...),
    grn_no: str = Form(...),
    bill_no: str = Form(...),
    vendor: str = Form(...),
    received_qty: float = Form(...),
    rate: float = Form(...),
    tax_per: float = Form(0),
    net_amount: float = Form(...),
    closing_stock: float = Form(...)
):
    email = request.session.get("email")
    if not email:
        return JSONResponse({"status": "error", "message": "Session Expired"}, status_code=401)

    last = db.query(DieselLog).filter(DieselLog.unit_id == in_unit_id).order_by(desc(DieselLog.id)).first()
    opening = last.closing_stock if last else 0.0

    log = DieselLog(
        unit_id=in_unit_id,
        log_date=entry_date,
        bill_date=bill_date,
        type="IN",
        grn_no=grn_no,
        bill_no=bill_no,
        vendor=vendor,
        opening_stock=opening,
        purchase_qty=received_qty,
        closing_stock=closing_stock,
        avg_price=rate,
        tax_per=tax_per,
        net_val=net_amount,
        email=email
    )

    db.add(log)
    db.commit()
    return JSONResponse({"status": "success"})

# ==================================================
# 💾 SAVE STOCK OUT
# URL: /api/diesel/save_out
# ==================================================
@router.post("/save_out")
def save_diesel_out(
    request: Request,
    db: Session = Depends(get_db),

    out_date: date = Form(...),
    unit_id: int = Form(...),
    out_qty: float = Form(...),
    out_closing: float = Form(...)
):
    email = request.session.get("email")
    if not email:
        return JSONResponse({"status": "error", "message": "Session Expired"}, status_code=401)

    last = db.query(DieselLog).filter(DieselLog.unit_id == unit_id).order_by(desc(DieselLog.id)).first()
    opening = last.closing_stock if last else 0.0
    rate = last.avg_price if last else 0.0

    log = DieselLog(
        unit_id=unit_id,
        log_date=out_date,
        type="OUT",
        opening_stock=opening,
        consumption=out_qty,
        closing_stock=out_closing,
        avg_price=rate,
        net_val=out_qty * rate,
        email=email
    )

    db.add(log)
    db.commit()
    return JSONResponse({"status": "success"})
