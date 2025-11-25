# app/routers/processing/raw_material_purchasing.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse, HTMLResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import json

from app.database import get_db
from app.database.models.processing import RawMaterialPurchasing, GateEntry
from app.database.models.criteria import varieties, species

# No prefix here; processing_router.py should include this router under prefix="/processing"
router = APIRouter(tags=["Raw Material Purchasing"])
templates = Jinja2Templates(directory="app/templates")


def get_today_range():
    now = datetime.now()
    start = now.replace(hour=9, minute=0, second=0, microsecond=0)
    if now < start:
        start -= timedelta(days=1)
    end = start + timedelta(days=1) - timedelta(seconds=1)
    return start, end


# SHOW
@router.get("/raw_material_purchasing", response_class=HTMLResponse, name="show_rmp")
def show_rmp(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_id")
    if not company_id:
        return RedirectResponse("/auth/login", status_code=303)

    gate_entries = db.query(GateEntry).filter_by(company_id=company_id).order_by(GateEntry.id.desc()).all()
    batch_list = [g.batch_number for g in gate_entries if g.batch_number]
    batch_supplier_map = {g.batch_number: g.supplier_name for g in gate_entries if g.batch_number}

    variety_list = [v.variety_name for v in db.query(varieties).filter_by(company_id=company_id).all()]
    species_list = [s.species_name for s in db.query(species).filter_by(company_id=company_id).all()]

    start, end = get_today_range()
    today_data = (
        db.query(RawMaterialPurchasing)
        .filter_by(company_id=company_id)
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
        "variety_list": variety_list,
        "species_list": species_list,
        "batch_supplier_map_json": json.dumps(batch_supplier_map),
        "message": request.session.pop("message", None)
    })


# EDIT
@router.get("/raw_material_purchasing/edit/{id}", name="edit_rmp")
def edit_rmp(id: int, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_id")
    if not company_id:
        return RedirectResponse("/auth/login", status_code=303)

    entry = db.query(RawMaterialPurchasing).filter_by(id=id, company_id=company_id).first()
    if not entry:
        return RedirectResponse("/processing/raw_material_purchasing", status_code=303)

    gate_entries = db.query(GateEntry).filter_by(company_id=company_id).order_by(GateEntry.id.desc()).all()
    batch_list = [g.batch_number for g in gate_entries if g.batch_number]
    batch_supplier_map = {g.batch_number: g.supplier_name for g in gate_entries if g.batch_number}

    variety_list = [v.variety_name for v in db.query(varieties).filter_by(company_id=company_id).all()]
    species_list = [s.species_name for s in db.query(species).filter_by(company_id=company_id).all()]

    return templates.TemplateResponse("processing/raw_material_purchasing.html", {
        "request": request,
        "today_data": [],
        "edit_data": entry,
        "batch_list": batch_list,
        "variety_list": variety_list,
        "species_list": species_list,
        "batch_supplier_map_json": json.dumps(batch_supplier_map),
        "message": None
    })


# SAVE (create)
@router.post("/raw_material_purchasing", name="save_rmp")
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
    company_id = request.session.get("company_id")
    if not company_id:
        return RedirectResponse("/auth/login", status_code=303)

    now = datetime.now()
    received = (g1_qty or 0.0) + (g2_qty or 0.0) + (dc_qty or 0.0)
    amount = ((g1_qty or 0.0) + ((g2_qty or 0.0) / 2.0)) * (rate_per_kg or 0.0)

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
        company_id=company_id
    )

    db.add(entry)
    db.commit()

    request.session["message"] = "✔ Saved Successfully!"
    return RedirectResponse("/processing/raw_material_purchasing", status_code=303)


# UPDATE (no new row)
@router.post("/raw_material_purchasing/update/{id}", name="update_rmp")
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
    company_id = request.session.get("company_id")
    if not company_id:
        return RedirectResponse("/auth/login", status_code=303)

    entry = db.query(RawMaterialPurchasing).filter_by(id=id, company_id=company_id).first()
    if not entry:
        request.session["message"] = "❌ Record Not Found!"
        return RedirectResponse("/processing/raw_material_purchasing", status_code=303)

    received = (g1_qty or 0.0) + (g2_qty or 0.0) + (dc_qty or 0.0)
    amount = ((g1_qty or 0.0) + ((g2_qty or 0.0) / 2.0)) * (rate_per_kg or 0.0)

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


# DELETE
@router.post("/raw_material_purchasing/delete/{id}", name="delete_rmp")
def delete_rmp(id: int, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_id")
    if not company_id:
        return RedirectResponse("/auth/login", status_code=303)

    entry = db.query(RawMaterialPurchasing).filter_by(id=id, company_id=company_id).first()
    if entry:
        db.delete(entry)
        db.commit()

    request.session["message"] = "🗑 Deleted Successfully!"
    return RedirectResponse("/processing/raw_material_purchasing", status_code=303)
