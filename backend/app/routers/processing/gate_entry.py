from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import RedirectResponse, JSONResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime, date

from app.database import get_db
from app.database.models.processing import GateEntry
from app.database.models.criteria import suppliers, purchasing_locations, vehicle_numbers

router = APIRouter(
    tags=["GATE ENTRY"]
)

templates = Jinja2Templates(directory="app/templates")


# =========================================================
# LOAD PAGE
# =========================================================
@router.get("/gate_entry", response_class=HTMLResponse)
def gate_entry_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    comp  = request.session.get("company_code")

    if not email or not comp:
        return RedirectResponse("/auth/login", status_code=302)

    supplier_list = [
        x.supplier_name
        for x in db.query(suppliers)
        .filter(suppliers.company_id == comp)
        .order_by(suppliers.supplier_name)
        .all()
    ]

    location_list = [
        x.location_name
        for x in db.query(purchasing_locations)
        .filter(purchasing_locations.company_id == comp)
        .order_by(purchasing_locations.location_name)
        .all()
    ]

    vehicle_list = [
        x.vehicle_number
        for x in db.query(vehicle_numbers)
        .filter(vehicle_numbers.company_id == comp)
        .order_by(vehicle_numbers.vehicle_number)
        .all()
    ]

    today = date.today()

    today_rows = (
        db.query(GateEntry)
        .filter(
            GateEntry.company_id == comp,
            GateEntry.date == today
        )
        .order_by(GateEntry.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "processing/gate_entry.html",
        {
            "request": request,
            "suppliers": supplier_list,
            "locations": location_list,
            "vehicles": vehicle_list,
            "today_data": today_rows,
            "edit_data": None,
            "message": request.session.pop("message", None)
        }
    )


# =========================================================
# SAVE NEW ENTRY
# =========================================================
@router.post("/gate_entry")
def save_entry(
    request: Request,
    batch_number: str = Form(...),
    challan_number: str = Form(...),
    gate_pass_number: str = Form(...),
    supplier_name: str = Form(...),
    purchasing_location: str = Form(...),
    vehicle_number: str = Form(...),
    no_of_material_boxes: int = Form(0),
    no_of_empty_boxes: int = Form(0),
    no_of_ice_boxes: int = Form(0),
    db: Session = Depends(get_db)
):

    email = request.session.get("email")
    comp  = request.session.get("company_code")

    if not email or not comp:
        return RedirectResponse("/auth/login", status_code=302)

    # ---------------- COMPANY-WISE UNIQUE CHECKS ----------------
    if db.query(GateEntry).filter(
        GateEntry.company_id == comp,
        GateEntry.batch_number == batch_number
    ).first():
        request.session["message"] = "❌ Batch number already exists!"
        return RedirectResponse("/processing/gate_entry", status_code=303)

    if db.query(GateEntry).filter(
        GateEntry.company_id == comp,
        GateEntry.challan_number == challan_number
    ).first():
        request.session["message"] = "❌ Challan number already exists!"
        return RedirectResponse("/processing/gate_entry", status_code=303)

    # ---------------- INSERT ----------------
    row = GateEntry(
        batch_number=batch_number,
        challan_number=challan_number,
        gate_pass_number=gate_pass_number,
        supplier_name=supplier_name,
        purchasing_location=purchasing_location,
        vehicle_number=vehicle_number,
        no_of_material_boxes=no_of_material_boxes,
        no_of_empty_boxes=no_of_empty_boxes,
        no_of_ice_boxes=no_of_ice_boxes,
        date=date.today(),
        time=datetime.now().time(),
        email=email,
        company_id=comp
    )

    db.add(row)
    db.commit()

    request.session["message"] = "✅ Gate Entry Saved Successfully!"
    return RedirectResponse("/processing/gate_entry", status_code=303)


# =========================================================
# EDIT PAGE
# =========================================================
@router.get("/gate_entry/edit/{id}", response_class=HTMLResponse)
def edit_entry(id: int, request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    comp  = request.session.get("company_code")

    if not email or not comp:
        return RedirectResponse("/auth/login", status_code=302)

    row = (
        db.query(GateEntry)
        .filter(
            GateEntry.company_id == comp,
            GateEntry.id == id
        )
        .first()
    )

    if not row:
        request.session["message"] = "❌ Record not found!"
        return RedirectResponse("/processing/gate_entry", status_code=303)

    supplier_list = [x.supplier_name for x in db.query(suppliers).filter(suppliers.company_id == comp).all()]
    location_list = [x.location_name for x in db.query(purchasing_locations).filter(purchasing_locations.company_id == comp).all()]
    vehicle_list  = [x.vehicle_number for x in db.query(vehicle_numbers).filter(vehicle_numbers.company_id == comp).all()]

    return templates.TemplateResponse(
        "processing/gate_entry.html",
        {
            "request": request,
            "edit_data": row,
            "suppliers": supplier_list,
            "locations": location_list,
            "vehicles": vehicle_list,
            "today_data": [],
            "message": None
        }
    )


# =========================================================
# UPDATE ENTRY
# =========================================================
@router.post("/gate_entry/update/{id}")
def update_entry(
    id: int,
    request: Request,
    batch_number: str = Form(...),
    challan_number: str = Form(...),
    gate_pass_number: str = Form(...),
    supplier_name: str = Form(...),
    purchasing_location: str = Form(...),
    vehicle_number: str = Form(...),
    no_of_material_boxes: int = Form(0),
    no_of_empty_boxes: int = Form(0),
    no_of_ice_boxes: int = Form(0),
    db: Session = Depends(get_db)
):

    comp = request.session.get("company_code")
    if not comp:
        return RedirectResponse("/auth/login", status_code=302)

    row = db.query(GateEntry).filter(
        GateEntry.company_id == comp,
        GateEntry.id == id
    ).first()

    if not row:
        request.session["message"] = "❌ Record not found!"
        return RedirectResponse("/processing/gate_entry", status_code=303)

    row.batch_number = batch_number
    row.challan_number = challan_number
    row.gate_pass_number = gate_pass_number
    row.supplier_name = supplier_name
    row.purchasing_location = purchasing_location
    row.vehicle_number = vehicle_number
    row.no_of_material_boxes = no_of_material_boxes
    row.no_of_empty_boxes = no_of_empty_boxes
    row.no_of_ice_boxes = no_of_ice_boxes

    db.commit()

    request.session["message"] = "✅ Gate Entry Updated Successfully!"
    return RedirectResponse("/processing/gate_entry", status_code=303)


# =========================================================
# DELETE ENTRY
# =========================================================
@router.post("/gate_entry/delete/{id}")
def delete_entry(id: int, request: Request, db: Session = Depends(get_db)):

    comp = request.session.get("company_code")
    if not comp:
        return RedirectResponse("/auth/login", status_code=302)

    row = db.query(GateEntry).filter(
        GateEntry.company_id == comp,
        GateEntry.id == id
    ).first()

    if row:
        db.delete(row)
        db.commit()
        return JSONResponse({"status": "ok"})

    return JSONResponse({"status": "not_found"})
