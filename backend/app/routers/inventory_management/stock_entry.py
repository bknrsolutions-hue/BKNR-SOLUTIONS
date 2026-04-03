# app/routers/inventory/stock_management.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, case, desc
from datetime import datetime, date
import logging

from app.database import get_db
from app.database.models.inventory_management import stock_entry, pending_orders
from app.database.models.processing import GateEntry
from app.database.models.criteria import (
    brands, glazes, varieties, grades, packing_styles, 
    freezers, production_types, purposes, production_at, 
    production_for, coldstore_locations, species as species_model
)

router = APIRouter(prefix="/inventory", tags=["STOCK ENTRY"])
templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)

# ==================================================
# 📦 1. LOAD STOCK ENTRY PAGE
# ==================================================
@router.get("/stock_entry", response_class=HTMLResponse)
def stock_entry_page(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/auth/login", status_code=302)

    # Fetching today's transactions for this company
    table_data = (
        db.query(stock_entry)
        .filter(stock_entry.company_id == company_code, stock_entry.date == date.today())
        .order_by(desc(stock_entry.id)).all()
    )

    # Dynamic Batch Data for Frontend Filters
    batches_raw = (
        db.query(GateEntry.batch_number, GateEntry.production_for, GateEntry.receiving_center)
        .filter(GateEntry.company_id == company_code).distinct().all()
    )
    
    batch_data_list = [
        {
            "batch_number": b.batch_number,
            "production_for": b.production_for,
            "production_at": b.receiving_center # Mapping for UI consistency
        } for b in batches_raw if b.batch_number
    ]

    # Helper to fetch dropdowns
    def get_list(model, attr):
        return [getattr(x, attr) for x in db.query(model).filter(model.company_id == company_code).all()]

    return templates.TemplateResponse(
        request=request,
        name="inventory_management/stock_entry.html",
        context={
            "table_data": table_data,
            "batch_data_list": batch_data_list,
            "species": get_list(species_model, "species_name"),
            "brands": get_list(brands, "brand_name"),
            "production_for_list": sorted(list(set(get_list(production_for, "production_for")))),
            "glazes": get_list(glazes, "glaze_name"),
            "varieties": get_list(varieties, "variety_name"),
            "grades": get_list(grades, "grade_name"),
            "freezers": get_list(freezers, "freezer_name"),
            "production_types": get_list(production_types, "production_type"),
            "purposes": get_list(purposes, "purpose_name"),
            "production_places": get_list(production_at, "production_at"),
            "locations": get_list(coldstore_locations, "coldstore_location"),
            "packing_styles": db.query(packing_styles).filter(packing_styles.company_id == company_code).all(),
            "po_numbers": [p[0] for p in db.query(pending_orders.po_number).filter(pending_orders.company_id == company_code).distinct().all()],
            "email": email, "company_id": company_code
        }
    )

# ==================================================
# 📥 2. SAVE STOCK IN
# ==================================================
@router.post("/stock_entry")
def save_stock_in(
    request: Request,
    db: Session = Depends(get_db),
    batch_number: str = Form(...),
    type_of_production: str = Form(...),
    location: str = Form(...),
    brand: str = Form(...),
    production_for: str = Form(""),
    freezer: str = Form(...),
    packing_style: str = Form(...),
    glaze: str = Form(...),
    species: str = Form(...),
    variety: str = Form(...),
    grade: str = Form(...),
    no_of_mc: int = Form(...),
    loose: int = Form(...),
    production_at: str = Form(...),
    purpose: str = Form(""),
    po_number: str = Form(""),
):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/auth/login", status_code=302)

    try:
        # Weight Calculation Logic
        pack = db.query(packing_styles).filter(
            packing_styles.company_id == company_code,
            packing_styles.packing_style == packing_style
        ).first()

        mc_weight = float(pack.mc_weight or 0) if pack else 0
        slab_weight = float(pack.slab_weight or 0) if pack else 0
        total_quantity = (no_of_mc * mc_weight) + (loose * slab_weight)

        new_entry = stock_entry(
            batch_number=batch_number.strip().upper(),
            type_of_production=type_of_production,
            cargo_movement_type="IN",
            location=location,
            brand=brand,
            freezer=freezer,
            packing_style=packing_style,
            glaze=glaze,
            species=species,
            variety=variety,
            grade=grade,
            no_of_mc=no_of_mc,
            loose=loose,
            quantity=round(total_quantity, 2),
            purpose=purpose or None,
            po_number=po_number or None,
            production_at=production_at,
            production_for=production_for or None,
            email=email,
            company_id=company_code,
            date=date.today(),
            time=datetime.now().time()
        )
        db.add(new_entry)
        db.commit()
        return RedirectResponse("/inventory/stock_entry", status_code=303)
    except Exception as e:
        db.rollback()
        logger.error(f"Stock In Save Error: {e}")
        return JSONResponse({"error": "Failed to save entry"}, status_code=500)

# ==================================================
# 📤 3. SAVE STOCK OUT
# ==================================================
@router.post("/stock_out_save")
def stock_out_save(
    request: Request,
    db: Session = Depends(get_db),
    brand: str = Form(...),
    packing_style: str = Form(...),
    out_batch: list[str] = Form([]),
    out_location: list[str] = Form([]),
    out_mc: list[str] = Form([]), # Taking as list of strings to handle empty inputs
    out_loose: list[str] = Form([]),
    # ... other forms ...
    production_at: str = Form(...),
    species: str = Form(...),
    variety: str = Form(...),
    grade: str = Form(...),
):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    pack = db.query(packing_styles).filter(packing_styles.company_id == company_code, packing_styles.packing_style == packing_style).first()
    mc_weight = float(pack.mc_weight or 0) if pack else 0
    slab_weight = float(pack.slab_weight or 0) if pack else 0

    try:
        for i in range(len(out_batch)):
            mc_val = int(out_mc[i]) if out_mc[i] and int(out_mc[i]) > 0 else 0
            ls_val = int(out_loose[i]) if out_loose[i] and int(out_loose[i]) > 0 else 0
            
            if mc_val == 0 and ls_val == 0: continue

            calculated_qty = (mc_val * mc_weight) + (ls_val * slab_weight)

            entry = stock_entry(
                batch_number=out_batch[i],
                cargo_movement_type="OUT",
                location=out_location[i],
                brand=brand,
                packing_style=packing_style,
                no_of_mc=mc_val,
                loose=ls_val,
                quantity=round(calculated_qty, 2),
                # ... mapping other fields ...
                production_at=production_at,
                species=species,
                variety=variety,
                grade=grade,
                email=email,
                company_id=company_code,
                date=date.today(),
                time=datetime.now().time()
            )
            db.add(entry)
        
        db.commit()
        return RedirectResponse("/inventory/stock_entry", status_code=303)
    except Exception as e:
        db.rollback()
        logger.error(f"Stock Out Error: {e}")
        return RedirectResponse("/inventory/stock_entry", status_code=303)