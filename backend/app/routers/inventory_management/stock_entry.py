from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import func, case, distinct
from datetime import datetime, date

from app.database import get_db
from app.database.models.inventory_management import stock_entry, pending_orders
from app.database.models.processing import GateEntry
from app.database.models.criteria import (
    brands,
    glazes,
    varieties,
    grades,
    packing_styles,
    freezers,
    production_types,
    purposes,
    production_at,
    production_for,
    coldstore_locations,
    species as species_model
)

router = APIRouter(prefix="/inventory", tags=["STOCK ENTRY"])


# ==================================================
# LOAD STOCK ENTRY PAGE (TODAY DATA ONLY)
# ==================================================
@router.get("/stock_entry", response_class=HTMLResponse)
def stock_entry_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/auth/login", status_code=302)

    table_data = (
        db.query(stock_entry)
        .filter(
            stock_entry.company_id == company_code,
            stock_entry.date == date.today()
        )
        .order_by(stock_entry.id.desc())
        .all()
    )

    batches_raw = (
        db.query(
            GateEntry.batch_number,
            GateEntry.production_for,
            GateEntry.receiving_center 
        )
        .filter(GateEntry.company_id == company_code)
        .distinct()
        .all()
    )
    
    batch_data_list = [
        {
            "batch_number": b.batch_number,
            "production_for": b.production_for,
            "production_at": b.receiving_center 
        } for b in batches_raw if b.batch_number
    ]

    production_for_unique = sorted({
        p.production_for for p in
        db.query(production_for.production_for)
        .filter(production_for.company_id == company_code)
        .distinct()
        .all() if p.production_for
    })

    species_list = [
        s.species_name
        for s in db.query(species_model)
        .filter(species_model.company_id == company_code)
        .order_by(species_model.species_name)
        .all()
    ]

    # ✅ FIXED: context dict నుంచి request తీసేసి, విడిగా ఆర్గ్యుమెంట్ గా పంపాను.
    context = {
        "table_data": table_data,
        "batch_data_list": batch_data_list,
        "species": species_list,
        "brands": [b.brand_name for b in db.query(brands).filter(brands.company_id == company_code)],
        "production_for_list": production_for_unique,
        "glazes": [g.glaze_name for g in db.query(glazes).filter(glazes.company_id == company_code)],
        "varieties": [v.variety_name for v in db.query(varieties).filter(varieties.company_id == company_code)],
        "grades": [g.grade_name for g in db.query(grades).filter(grades.company_id == company_code)],
        "freezers": [f.freezer_name for f in db.query(freezers).filter(freezers.company_id == company_code)],
        "production_types": [p.production_type for p in db.query(production_types).filter(production_types.company_id == company_code)],
        "purposes": [p.purpose_name for p in db.query(purposes).filter(purposes.company_id == company_code)],
        "production_places": [p.production_at for p in db.query(production_at).filter(production_at.company_id == company_code)],
        "locations": [l.coldstore_location for l in db.query(coldstore_locations).filter(coldstore_locations.company_id == company_code)],
        "packing_styles": db.query(packing_styles).filter(packing_styles.company_id == company_code).all(),
        "po_numbers": [p.po_number for p in db.query(pending_orders.po_number).filter(pending_orders.company_id == company_code).distinct().order_by(pending_orders.po_number)],
    }

    return request.app.state.templates.TemplateResponse(
        request=request, 
        name="inventory_management/stock_entry.html", 
        context=context
    )


# ==================================================
# SAVE STOCK IN
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

    pack = db.query(packing_styles).filter(
        packing_styles.company_id == company_code,
        packing_styles.packing_style == packing_style
    ).first()

    mc_weight = pack.mc_weight if pack else 0
    slab_weight = pack.slab_weight if pack else 0
    quantity = (no_of_mc * mc_weight) + (loose * slab_weight)

    entry = stock_entry(
        batch_number=batch_number,
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
        quantity=quantity,
        purpose=purpose or None,
        po_number=po_number or None,
        production_at=production_at,
        production_for=production_for or None,
        email=email,
        company_id=company_code,
        date=date.today(),
        time=datetime.now().time()
    )
    db.add(entry)
    db.commit()
    return RedirectResponse("/inventory/stock_entry", status_code=303)


# ==================================================
# AVAILABLE STOCK REPORT (AJAX)
# ==================================================
@router.get("/stock_out_report")
def stock_out_report(
    request: Request,
    db: Session = Depends(get_db),
    production_for: str = "",
    brand: str = "",
    production_at: str = "",
    freezer: str = "",
    packing_style: str = "",
    glaze: str = "",
    species: str = "",
    variety: str = "",
    grade: str = "",
):
    company_code = request.session.get("company_code")

    query = db.query(
        stock_entry.location,
        stock_entry.batch_number,
        func.sum(case((stock_entry.cargo_movement_type == "IN", stock_entry.no_of_mc), else_=-stock_entry.no_of_mc)).label("available_mc"),
        func.sum(case((stock_entry.cargo_movement_type == "IN", stock_entry.loose), else_=-stock_entry.loose)).label("available_loose"),
    ).filter(stock_entry.company_id == company_code)

    if production_for: query = query.filter(stock_entry.production_for == production_for)
    if brand: query = query.filter(stock_entry.brand == brand)
    if production_at: query = query.filter(stock_entry.production_at == production_at)
    if freezer: query = query.filter(stock_entry.freezer == freezer)
    if packing_style: query = query.filter(stock_entry.packing_style == packing_style)
    if glaze: query = query.filter(stock_entry.glaze == glaze)
    if species: query = query.filter(stock_entry.species == species)
    if variety: query = query.filter(stock_entry.variety == variety)
    if grade: query = query.filter(stock_entry.grade == grade)

    rows = query.group_by(stock_entry.location, stock_entry.batch_number).having(
        (func.sum(case((stock_entry.cargo_movement_type == "IN", stock_entry.no_of_mc), else_=-stock_entry.no_of_mc)) > 0) |
        (func.sum(case((stock_entry.cargo_movement_type == "IN", stock_entry.loose), else_=-stock_entry.loose)) > 0)
    ).all()

    return JSONResponse([
        {"location": r.location, "batch": r.batch_number, "mc": int(r.available_mc or 0), "loose": int(r.available_loose or 0)}
        for r in rows
    ])


# ==================================================
# SAVE STOCK OUT (WITH QUANTITY CALCULATION)
# ==================================================
@router.post("/stock_out_save")
def stock_out_save(
    request: Request,
    db: Session = Depends(get_db),
    production_for: str = Form(""),
    brand: str = Form(...),
    production_at: str = Form(...),
    freezer: str = Form(...),
    packing_style: str = Form(...),
    glaze: str = Form(...),
    species: str = Form(...),
    variety: str = Form(...),
    grade: str = Form(...),
    purpose: str = Form(""),
    po_number: str = Form(""),
    out_batch: list[str] = Form([]),
    out_location: list[str] = Form([]),
    out_mc: list[int] = Form([]),
    out_loose: list[int] = Form([]),
):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/auth/login", status_code=302)

    pack = db.query(packing_styles).filter(
        packing_styles.company_id == company_code,
        packing_styles.packing_style == packing_style
    ).first()
    
    mc_weight = pack.mc_weight if pack else 0
    slab_weight = pack.slab_weight if pack else 0
    now = datetime.now()

    for i in range(len(out_batch)):
        mc_val = int(out_mc[i]) if out_mc[i] else 0
        ls_val = int(out_loose[i]) if out_loose[i] else 0
        
        if mc_val <= 0 and ls_val <= 0:
            continue

        calculated_qty = (mc_val * mc_weight) + (ls_val * slab_weight)

        entry = stock_entry(
            batch_number=out_batch[i],
            cargo_movement_type="OUT",
            location=out_location[i],
            brand=brand,
            freezer=freezer,
            packing_style=packing_style,
            glaze=glaze,
            species=species,
            variety=variety,
            grade=grade,
            no_of_mc=mc_val,
            loose=ls_val,
            quantity=calculated_qty,
            production_at=production_at,
            production_for=production_for or None,
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