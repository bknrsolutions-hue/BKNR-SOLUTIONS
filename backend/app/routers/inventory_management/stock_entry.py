# ========================================================
# 📌 STOCK ENTRY ROUTER — FINAL WORKING (NO ERRORS)
# ========================================================

from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db

# ===================== MODELS =====================
from app.database.models.inventory_management import stock_entry, pending_orders
from app.database.models.criteria import (
    brands, glazes, varieties, grades, packing_styles,
    freezers, production_types, purposes, production_at, coldstore_locations
)
from app.database.models.processing import GateEntry     # 🔥 Batch lookup from GATE ENTRY


router = APIRouter(prefix="/inventory", tags=["STOCK ENTRY"])


# ===================== LOAD PAGE =====================
@router.get("/stock_entry", response_class=HTMLResponse)
def stock_entry_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("user_email")
    company_id = request.session.get("company_id")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    table = (
        db.query(stock_entry)
        .filter(stock_entry.company_id == company_id)
        .order_by(stock_entry.id.desc())
        .all()
    )

    return request.app.state.templates.TemplateResponse(
        "inventory_management/stock_entry.html",
        {
            "request": request,
            "table_data": table,

            # =================== LOOKUPS ===================
            "batches": [x.batch_number for x in db.query(GateEntry)
                        .filter(GateEntry.company_id == company_id)],

            "brands": [x.brand_name for x in db.query(brands)
                       .filter(brands.company_id == company_id)],

            "glazes": [x.glaze_name for x in db.query(glazes)
                       .filter(glazes.company_id == company_id)],

            "varieties": [x.variety_name for x in db.query(varieties)
                          .filter(varieties.company_id == company_id)],

            "grades": [x.grade_name for x in db.query(grades)
                       .filter(grades.company_id == company_id)],

            "freezers": [x.freezer_name for x in db.query(freezers)
                         .filter(freezers.company_id == company_id)],

            "production_types": [x.production_type for x in db.query(production_types)
                                 .filter(production_types.company_id == company_id)],

            "purposes": [x.purpose_name for x in db.query(purposes)
                         .filter(purposes.company_id == company_id)],

            "production_places": [x.production_at for x in db.query(production_at)
                                  .filter(production_at.company_id == company_id)],

            "locations": [x.coldstore_location for x in db.query(coldstore_locations)  # 🔥 FIXED
                          .filter(coldstore_locations.company_id == company_id)],

            "packing_styles": db.query(packing_styles)
                                .filter(packing_styles.company_id == company_id).all(),

            "po_numbers": [x.po_number for x in db.query(pending_orders)
                           .filter(pending_orders.company_id == company_id)],
        }
    )


# ===================== SAVE / INSERT =====================
@router.post("/stock_entry")
def save_stock_entry(
    request: Request, db: Session = Depends(get_db),

    batch_number: str = Form(...),
    type_of_production: str = Form(...),
    cargo_movement_type: str = Form(...),

    brand: str = Form(...),
    freezer: str = Form(...),
    packing_style: str = Form(...),

    glaze: str = Form(...),
    variety: str = Form(...),
    grade: str = Form(...),

    location: str = Form(...),                         # 🔥 NEW column saved

    no_of_mc: float = Form(...),
    loose: float = Form(...),
    quantity: float = Form(...),

    purpose: str = Form(""),
    po_number: str = Form(""),
    production_at: str = Form(...)
):

    now = datetime.now()

    new = stock_entry(
        batch_number=batch_number,
        type_of_production=type_of_production,
        cargo_movement_type=cargo_movement_type,

        brand=brand,
        freezer=freezer,
        packing_style=packing_style,

        glaze=glaze,
        variety=variety,
        grade=grade,

        location=location,                           # <-- Saved correctly

        no_of_mc=no_of_mc,
        loose=loose,
        quantity=quantity,

        purpose=purpose,
        po_number=po_number,
        production_at=production_at,

        email=request.session.get("user_email"),
        company_id=request.session.get("company_id"),
        date=str(now.date()),
        time=now.strftime("%H:%M:%S")
    )

    db.add(new)
    db.commit()

    return RedirectResponse("/inventory/stock_entry", status_code=303)
