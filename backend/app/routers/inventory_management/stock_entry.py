from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from datetime import datetime, date

from app.database import get_db
from app.database.models.inventory_management import stock_entry
from app.database.models.inventory_management import pending_orders
from app.database.models.processing import GateEntry
from app.database.models.criteria import (
    brands, glazes, varieties, grades, packing_styles,
    freezers, production_types, purposes,
    production_at,
    production_for,           
    coldstore_locations,
    species as species_model  # ✅ Species మోడల్‌ని ఇక్కడ ఇంపోర్ట్ చేశాను
)

router = APIRouter(prefix="/inventory", tags=["STOCK ENTRY"])


# ==================================================
# LOAD PAGE (GET)
# ==================================================
@router.get("/stock_entry", response_class=HTMLResponse)
def stock_entry_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_code = request.session.get("company_code")
    if not email or not company_code:
        return RedirectResponse("/auth/login", status_code=302)

    table_data = (
        db.query(stock_entry)
        .filter(stock_entry.company_id == company_code)
        .order_by(stock_entry.id.desc())
        .limit(50)
        .all()
    )

    # ✅ FIXED: species టేబుల్ నుండి lookup డేటా తెస్తున్నాను
    species_list = [
        x.species_name for x in db.query(species_model)
        .filter(species_model.company_id == company_code)
        .order_by(species_model.species_name)
        .all()
    ]

    return request.app.state.templates.TemplateResponse(
        "inventory_management/stock_entry.html",
        {
            "request": request,
            "table_data": table_data,
            "species": species_list, 

            "batches": sorted({
                g.batch_number for g in db.query(GateEntry)
                .filter(GateEntry.company_id == company_code)
                if g.batch_number
            }),

            "brands": [x.brand_name for x in db.query(brands)
                       .filter(brands.company_id == company_code)],

            "production_for_list": sorted({
                x.production_for for x in db.query(production_for)
                .filter(production_for.company_id == company_code)
                if x.production_for
            }),

            "glazes": [x.glaze_name for x in db.query(glazes)
                       .filter(glazes.company_id == company_code)],

            "varieties": [x.variety_name for x in db.query(varieties)
                          .filter(varieties.company_id == company_code)],

            "grades": [x.grade_name for x in db.query(grades)
                       .filter(grades.company_id == company_code)],

            "freezers": [x.freezer_name for x in db.query(freezers)
                         .filter(freezers.company_id == company_code)],

            "production_types": [x.production_type for x in db.query(production_types)
                                 .filter(production_types.company_id == company_code)],

            "purposes": [x.purpose_name for x in db.query(purposes)
                         .filter(purposes.company_id == company_code)],

            "production_places": [x.production_at for x in db.query(production_at)
                                  .filter(production_at.company_id == company_code)],

            "locations": [x.coldstore_location for x in db.query(coldstore_locations)
                          .filter(coldstore_locations.company_id == company_code)],

            "packing_styles": db.query(packing_styles)
                                .filter(packing_styles.company_id == company_code)
                                .all(),
            "po_numbers": [
                x.po_number for x in
                db.query(pending_orders.po_number)
                .filter(pending_orders.company_id == company_code)
                .order_by(pending_orders.po_number)
                .distinct()
            ],
        }
    )


# ==================================================
# SAVE IN STOCK (POST)
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
    quantity: float = Form(...),

    production_at: str = Form(...),
    purpose: str = Form(""),
    po_number: str = Form(""),
):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/auth/login", status_code=302)

    now = datetime.now()

    entry = stock_entry(
        batch_number=batch_number,
        location=location,
        cargo_movement_type="IN",

        type_of_production=type_of_production,
        brand=brand,
        production_for=production_for or None,   
        freezer=freezer,
        packing_style=packing_style,
        glaze=glaze,
        species=species,
        variety=variety,
        grade=grade,

        no_of_mc=no_of_mc,
        loose=loose,
        quantity=quantity,

        production_at=production_at,
        purpose=purpose or None,
        po_number=po_number or None,

        email=email,
        company_id=company_code,
        date=date.today(),
        time=now.time()
    )

    db.add(entry)
    db.commit()

    return RedirectResponse("/inventory/stock_entry", status_code=303)


# ==================================================
# SEARCH AVAILABLE STOCK (REPORT)
# ==================================================
@router.get("/stock_out_report")
def stock_out_report(
    request: Request,
    db: Session = Depends(get_db),

    production_at: str = "",
    production_for: str = "",          
    freezer: str = "",
    packing_style: str = "",
    glaze: str = "",
    species: str = "",
    variety: str = "",
    grade: str = "",
    brand: str = ""
):
    company_code = request.session.get("company_code")

    rows = (
        db.query(
            stock_entry.location,
            stock_entry.batch_number,

            func.sum(
                case(
                    (stock_entry.cargo_movement_type == "IN", stock_entry.no_of_mc),
                    else_=-stock_entry.no_of_mc
                )
            ).label("available_mc"),

            func.sum(
                case(
                    (stock_entry.cargo_movement_type == "IN", stock_entry.loose),
                    else_=-stock_entry.loose
                )
            ).label("available_loose"),
        )
        .filter(
            stock_entry.company_id == company_code,
            stock_entry.production_at == production_at,
            stock_entry.production_for == (production_for if production_for else None),   
            stock_entry.freezer == freezer,
            stock_entry.packing_style == packing_style,
            stock_entry.glaze == glaze,
            stock_entry.species == species,
            stock_entry.variety == variety,
            stock_entry.grade == grade,
            stock_entry.brand == brand,
        )
        .group_by(stock_entry.location, stock_entry.batch_number)
        .having(
            (func.sum(
                case((stock_entry.cargo_movement_type == "IN", stock_entry.no_of_mc),
                     else_=-stock_entry.no_of_mc)
            ) > 0)
            |
            (func.sum(
                case((stock_entry.cargo_movement_type == "IN", stock_entry.loose),
                     else_=-stock_entry.loose)
            ) > 0)
        )
        .all()
    )

    return JSONResponse([
        {
            "location": r.location,
            "batch": r.batch_number,
            "mc": int(r.available_mc or 0),
            "loose": int(r.available_loose or 0)
        } for r in rows
    ])


# ==================================================
# SAVE OUT (FROM REPORT)
# ==================================================
@router.post("/stock_out_save")
def stock_out_save(
    request: Request,
    db: Session = Depends(get_db),

    production_at: str = Form(...),
    production_for: str = Form(""),        
    freezer: str = Form(...),
    packing_style: str = Form(...),
    glaze: str = Form(...),
    species: str = Form(...),
    variety: str = Form(...),
    grade: str = Form(...),
    brand: str = Form(...),

    purpose: str = Form(""),
    po_number: str = Form(""),

    out_batch: list[str] = Form([]),
    out_location: list[str] = Form([]),
    out_mc: list[int] = Form([]),
    out_loose: list[int] = Form([]),
):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    now = datetime.now()

    for i in range(len(out_batch)):
        if (out_mc[i] or 0) <= 0 and (out_loose[i] or 0) <= 0:
            continue

        entry = stock_entry(
            batch_number=out_batch[i],
            location=out_location[i],
            cargo_movement_type="OUT",

            production_at=production_at,
            production_for=production_for or None,   
            freezer=freezer,
            packing_style=packing_style,
            glaze=glaze,
            species=species,
            variety=variety,
            grade=grade,
            brand=brand,

            no_of_mc=out_mc[i],
            loose=out_loose[i],
            quantity=0,

            purpose=purpose or None,
            po_number=po_number or None,

            email=email,
            company_id=company_code,
            date=date.today(),
            time=now.time()
        )
        db.add(entry)

    db.commit()
    return RedirectResponse("/inventory/stock_entry", status_code=303)