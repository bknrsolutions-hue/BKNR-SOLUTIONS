# app/routers/processing/raw_material_purchasing.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse, HTMLResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import json

from app.database import get_db
from app.database.models.processing import RawMaterialPurchasing, GateEntry
from app.database.models.criteria import varieties, species, suppliers

router = APIRouter(tags=["RAW MATERIAL PURCHASING"])
templates = Jinja2Templates(directory="app/templates")


# -----------------------------------------------------
# TODAY RANGE (9 AM TO NEXT DAY 9 AM)
# -----------------------------------------------------
def get_today_range():
    now = datetime.now()
    start = now.replace(hour=9, minute=0, second=0, microsecond=0)
    if now < start:
        start -= timedelta(days=1)
    end = start + timedelta(days=1) - timedelta(seconds=1)
    return start, end


# -----------------------------------------------------
# SHOW PAGE
# -----------------------------------------------------
@router.get("/raw_material_purchasing", response_class=HTMLResponse)
def show_rmp(request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/auth/login", status_code=303)

    gate_entries = (
        db.query(GateEntry)
        .filter(GateEntry.company_id == company_code)
        .order_by(GateEntry.id.desc())
        .all()
    )

    batch_list = [g.batch_number for g in gate_entries if g.batch_number]
    batch_supplier_map = {g.batch_number: g.supplier_name for g in gate_entries}

    supplier_list = [
        s.supplier_name for s in db.query(suppliers)
        .filter(suppliers.company_id == company_code).all()
    ]

    variety_list = [
        v.variety_name for v in db.query(varieties)
        .filter(varieties.company_id == company_code).all()
    ]

    species_list = [
        s.species_name for s in db.query(species)
        .filter(species.company_id == company_code).all()
    ]

    start, end = get_today_range()
    today_data = (
        db.query(RawMaterialPurchasing)
        .filter(RawMaterialPurchasing.company_id == company_code)
        .filter(RawMaterialPurchasing.date >= start.date())
        .filter(RawMaterialPurchasing.date <= end.date())
        .order_by(RawMaterialPurchasing.id.desc())
        .all()
    )

    return templates.TemplateResponse("processing/raw_material_purchasing.html", {
        "request": request,
        "today_data": today_data,
        "edit_data": None,
        "batch_list": batch_list,
        "supplier_list": supplier_list,
        "variety_list": variety_list,
        "species_list": species_list,
        "batch_supplier_map_json": json.dumps(batch_supplier_map),
        "message": request.session.pop("message", None)
    })


# -----------------------------------------------------
# EDIT PAGE
# -----------------------------------------------------
@router.get("/raw_material_purchasing/edit/{id}")
def edit_rmp(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")
    if not company_code:
        return RedirectResponse("/auth/login", status_code=303)

    entry = (
        db.query(RawMaterialPurchasing)
        .filter(RawMaterialPurchasing.id == id,
                RawMaterialPurchasing.company_id == company_code)
        .first()
    )

    if not entry:
        return RedirectResponse("/processing/raw_material_purchasing", status_code=303)

    gate_entries = (
        db.query(GateEntry)
        .filter(GateEntry.company_id == company_code)
        .order_by(GateEntry.id.desc())
        .all()
    )

    batch_list = [g.batch_number for g in gate_entries]
    batch_supplier_map = {g.batch_number: g.supplier_name for g in gate_entries}

    supplier_list = [
        s.supplier_name for s in db.query(suppliers)
        .filter(suppliers.company_id == company_code).all()
    ]

    variety_list = [
        v.variety_name for v in db.query(varieties)
        .filter(varieties.company_id == company_code).all()
    ]

    species_list = [
        s.species_name for s in db.query(species)
        .filter(species.company_id == company_code).all()
    ]

    return templates.TemplateResponse("processing/raw_material_purchasing.html", {
        "request": request,
        "today_data": [],
        "edit_data": entry,
        "batch_list": batch_list,
        "supplier_list": supplier_list,
        "variety_list": variety_list,
        "species_list": species_list,
        "batch_supplier_map_json": json.dumps(batch_supplier_map),
    })


# -----------------------------------------------------
# SAVE NEW
# -----------------------------------------------------
@router.post("/raw_material_purchasing")
def save_rmp(
    request: Request,
    batch_number: str = Form(...),
    supplier_name: str = Form(""),
    variety_name: str = Form(""),
    species: str = Form(""),
    count: str = Form(""),
    g1_qty: float = Form(0.0),
    g2_qty: float = Form(0.0),
    dc_qty: float = Form(0.0),
    rate_per_kg: float = Form(0.0),
    material_boxes: float = Form(0.0),
    remarks: str = Form(""),
    db: Session = Depends(get_db)
):

    company_code = request.session.get("company_code")
    now = datetime.now()

    received = (g1_qty or 0) + (g2_qty or 0) + (dc_qty or 0)
    amount = (g1_qty + (g2_qty / 2)) * (rate_per_kg or 0)

    entry = RawMaterialPurchasing(
        batch_number=batch_number,
        supplier_name=supplier_name,
        variety_name=variety_name,
        species=species,
        count=count,
        g1_qty=g1_qty,
        g2_qty=g2_qty,
        dc_qty=dc_qty,
        received_qty=received,
        rate_per_kg=rate_per_kg,
        amount=amount,
        material_boxes=material_boxes,
        remarks=remarks,
        email=request.session.get("email"),
        date=now.date(),
        time=now.time(),
        company_id=company_code
    )

    db.add(entry)
    db.commit()

    request.session["message"] = "✔ Saved Successfully!"
    return RedirectResponse("/processing/raw_material_purchasing", status_code=303)


# -----------------------------------------------------
# UPDATE RECORD
# -----------------------------------------------------
@router.post("/raw_material_purchasing/update/{id}")
def update_rmp(
    id: int,
    request: Request,
    batch_number: str = Form(...),
    supplier_name: str = Form(""),
    variety_name: str = Form(""),
    species: str = Form(""),
    count: str = Form(""),
    g1_qty: float = Form(0.0),
    g2_qty: float = Form(0.0),
    dc_qty: float = Form(0.0),
    rate_per_kg: float = Form(0.0),
    material_boxes: float = Form(0.0),
    remarks: str = Form(""),
    db: Session = Depends(get_db)
):

    company_code = request.session.get("company_code")

    entry = (
        db.query(RawMaterialPurchasing)
        .filter(RawMaterialPurchasing.id == id,
                RawMaterialPurchasing.company_id == company_code)
        .first()
    )

    if not entry:
        request.session["message"] = "❌ Record Not Found!"
        return RedirectResponse("/processing/raw_material_purchasing", status_code=303)

    received = (g1_qty or 0) + (g2_qty or 0) + (dc_qty or 0)
    amount = (g1_qty + (g2_qty / 2)) * (rate_per_kg or 0)

    entry.batch_number = batch_number
    entry.supplier_name = supplier_name
    entry.variety_name = variety_name
    entry.species = species
    entry.count = count
    entry.g1_qty = g1_qty
    entry.g2_qty = g2_qty
    entry.dc_qty = dc_qty
    entry.received_qty = received
    entry.rate_per_kg = rate_per_kg
    entry.amount = amount
    entry.material_boxes = material_boxes
    entry.remarks = remarks

    db.commit()

    request.session["message"] = "✔ Updated Successfully!"
    return RedirectResponse("/processing/raw_material_purchasing", status_code=303)


# -----------------------------------------------------
# DELETE
# -----------------------------------------------------
@router.post("/raw_material_purchasing/delete/{id}")
def delete_rmp(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    entry = (
        db.query(RawMaterialPurchasing)
        .filter(RawMaterialPurchasing.id == id,
                RawMaterialPurchasing.company_id == company_code)
        .first()
    )

    if entry:
        db.delete(entry)
        db.commit()

    request.session["message"] = "🗑 Deleted Successfully!"
    return RedirectResponse("/processing/raw_material_purchasing", status_code=303)
