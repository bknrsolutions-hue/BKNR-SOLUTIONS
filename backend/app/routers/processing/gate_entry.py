# app/routers/processing/gate_entry.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime, timedelta

from app.database import get_db
from app.database.models.processing import GateEntry
from app.database.models.criteria import suppliers, purchasing_locations, vehicle_numbers
from app.utils.email_service import send_mail

router = APIRouter(tags=["Gate Entry"])
templates = Jinja2Templates(directory="app/templates")


# -------------------------------------------------------
# TODAY RANGE (9AM → next day 8:59AM)
# -------------------------------------------------------
def get_today_range():
    now = datetime.now()
    today_9am = now.replace(hour=9, minute=0, second=0, microsecond=0)

    if now < today_9am:
        today_9am -= timedelta(days=1)

    tomorrow_859 = today_9am + timedelta(days=1) - timedelta(seconds=1)
    return today_9am, tomorrow_859


# -------------------------------------------------------
# SHOW PAGE
# -------------------------------------------------------
@router.get("/gate_entry")
def show_gate_entry(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_id", "BKNR001")

    supplier_list = [s.supplier_name for s in db.query(suppliers)
                     .filter_by(company_id=company_id).all()]

    location_list = [l.location_name for l in db.query(purchasing_locations)
                     .filter_by(company_id=company_id).all()]

    vehicle_list = [v.vehicle_number for v in db.query(vehicle_numbers)
                    .filter_by(company_id=company_id).all()]

    start, end = get_today_range()

    today_data = (
        db.query(GateEntry)
        .filter(GateEntry.company_id == company_id)
        .filter(GateEntry.date >= start.date(), GateEntry.date <= end.date())
        .all()
    )

    return templates.TemplateResponse("processing/gate_entry.html", {
        "request": request,
        "suppliers": supplier_list,
        "locations": location_list,
        "vehicles": vehicle_list,
        "today_data": today_data,
        "edit_data": None,
        "message": request.session.pop("message", None)
    })


# -------------------------------------------------------
# EDIT PAGE
# -------------------------------------------------------
@router.get("/gate_entry/edit/{id}")
def edit_gate_entry(id: int, request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_id", "BKNR001")

    entry = db.query(GateEntry).filter(
        GateEntry.id == id,
        GateEntry.company_id == company_id
    ).first()

    if not entry:
        return RedirectResponse("/processing/gate_entry", status_code=303)

    supplier_list = [s.supplier_name for s in db.query(suppliers)
                     .filter_by(company_id=company_id).all()]
    location_list = [l.location_name for l in db.query(purchasing_locations)
                     .filter_by(company_id=company_id).all()]
    vehicle_list = [v.vehicle_number for v in db.query(vehicle_numbers)
                    .filter_by(company_id=company_id).all()]

    return templates.TemplateResponse("processing/gate_entry.html", {
        "request": request,
        "suppliers": supplier_list,
        "locations": location_list,
        "vehicles": vehicle_list,
        "today_data": [],
        "edit_data": entry
    })


# -------------------------------------------------------
# SAVE NEW ENTRY
# -------------------------------------------------------
@router.post("/gate_entry")
def save_gate_entry(
    request: Request,
    batch_number: str = Form(...),
    challan_number: str = Form(...),
    gate_pass_number: str = Form(...),
    supplier_name: str = Form(...),
    purchasing_location: str = Form(...),
    vehicle_number: str = Form(...),
    no_of_material_boxes: float = Form(0.0),
    no_of_empty_boxes: float = Form(0.0),
    no_of_ice_boxes: float = Form(0.0),
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_id", "BKNR001")

    dup = db.query(GateEntry).filter(
        GateEntry.company_id == company_id,
        (
            (GateEntry.batch_number == batch_number) |
            (GateEntry.challan_number == challan_number) |
            (GateEntry.gate_pass_number == gate_pass_number)
        )
    ).first()

    if dup:
        request.session["message"] = "❌ Duplicate found!"
        return RedirectResponse("/processing/gate_entry", status_code=303)

    now = datetime.now()

    entry = GateEntry(
        batch_number=batch_number,
        challan_number=challan_number,
        gate_pass_number=gate_pass_number,
        supplier_name=supplier_name,
        purchasing_location=purchasing_location,
        vehicle_number=vehicle_number,
        no_of_material_boxes=no_of_material_boxes,
        no_of_empty_boxes=no_of_empty_boxes,
        no_of_ice_boxes=no_of_ice_boxes,
        date=now.date(),
        time=now.time(),
        email="bknr.solutions@gmail.com",
        company_id=company_id
    )

    db.add(entry)
    db.commit()
    db.refresh(entry)

    # Email Content
    email_html = f"""
    <div style='padding:15px;font-family:Arial;background:#eef3ff;border-radius:10px;'>
      <h3 style='text-align:center;color:#003366;'>Gate Entry Record</h3>

      <p><b>Date:</b> {entry.date}</p>
      <p><b>Time:</b> {str(entry.time)[:8]}</p>

      <hr>

      <p><b>Batch No:</b> {entry.batch_number}</p>
      <p><b>Challan No:</b> {entry.challan_number}</p>
      <p><b>Gate Pass No:</b> {entry.gate_pass_number}</p>

      <hr>

      <p><b>Supplier:</b> {entry.supplier_name}</p>
      <p><b>Location:</b> {entry.purchasing_location}</p>
      <p><b>Vehicle:</b> {entry.vehicle_number}</p>

      <hr>

      <p><b>Material Boxes:</b> {entry.no_of_material_boxes}</p>
      <p><b>Empty Boxes:</b> {entry.no_of_empty_boxes}</p>
      <p><b>Ice Boxes:</b> {entry.no_of_ice_boxes}</p>
    </div>
    """

    try:
        send_mail(
            to_email="gchrao143@gmail.com",
            subject="New Gate Entry Submitted",
            body=email_html
        )
    except Exception:
        pass  # Ignore email error

    request.session["message"] = "✔ Saved Successfully!"
    return RedirectResponse("/processing/gate_entry", status_code=303)


# -------------------------------------------------------
# UPDATE ENTRY
# -------------------------------------------------------
@router.post("/gate_entry/update/{id}")
def update_gate_entry(
    id: int,
    request: Request,
    supplier_name: str = Form(...),
    purchasing_location: str = Form(...),
    vehicle_number: str = Form(...),
    no_of_material_boxes: float = Form(...),
    no_of_empty_boxes: float = Form(...),
    no_of_ice_boxes: float = Form(...),
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_id", "BKNR001")

    entry = db.query(GateEntry).filter_by(id=id, company_id=company_id).first()
    if not entry:
        request.session["message"] = "❌ Record Not Found!"
        return RedirectResponse("/processing/gate_entry", status_code=303)

    entry.supplier_name = supplier_name
    entry.purchasing_location = purchasing_location
    entry.vehicle_number = vehicle_number
    entry.no_of_material_boxes = no_of_material_boxes
    entry.no_of_empty_boxes = no_of_empty_boxes
    entry.no_of_ice_boxes = no_of_ice_boxes

    db.commit()

    request.session["message"] = "✔ Updated Successfully!"
    return RedirectResponse("/processing/gate_entry", status_code=303)


# -------------------------------------------------------
# DELETE ENTRY
# -------------------------------------------------------
@router.post("/gate_entry/delete/{id}")
def delete_gate_entry(id: int, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_id", "BKNR001")

    entry = db.query(GateEntry).filter_by(id=id, company_id=company_id).first()

    if entry:
        db.delete(entry)
        db.commit()
        request.session["message"] = "🗑 Deleted Successfully!"
    else:
        request.session["message"] = "❌ Record Not Found!"

    return RedirectResponse("/processing/gate_entry", status_code=303)
