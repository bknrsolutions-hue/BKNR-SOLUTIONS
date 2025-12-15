# app/routers/processing/gate_entry.py

from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import RedirectResponse, JSONResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import date, datetime

from app.database import get_db
from app.database.models.processing import GateEntry
from app.database.models.criteria import suppliers, purchasing_locations, vehicle_numbers

router = APIRouter(tags=["GATE ENTRY"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE LOAD
# ---------------------------------------------------------
@router.get("/gate_entry")
def page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/auth/login", status_code=302)

    supplier_list = [s.supplier_name for s in db.query(suppliers)
                     .filter(suppliers.company_id == company_code).all()]

    location_list = [l.location_name for l in db.query(purchasing_locations)
                     .filter(purchasing_locations.company_id == company_code).all()]

    vehicle_list = [v.vehicle_number for v in db.query(vehicle_numbers)
                    .filter(vehicle_numbers.company_id == company_code).all()]

    today = date.today()
    rows = (
        db.query(GateEntry)
        .filter(GateEntry.company_id == company_code)
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
            "today_data": rows,
            "email": email,
            "company_id": company_code,
        }
    )


# ---------------------------------------------------------
# SAVE / UPDATE
# ---------------------------------------------------------
@router.post("/gate_entry")
def save_gate_entry(
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

    id: str = Form(""),
    date_input: str = Form(""),
    time_input: str = Form(""),

    db: Session = Depends(get_db)
):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    record_id = int(id) if id.isdigit() else None

    now = datetime.now()
    date_value = date_input if date_input else now.strftime("%Y-%m-%d")
    time_value = time_input if time_input else now.strftime("%H:%M:%S")

    # ---------------- DUPLICATE CHECK ----------------
    duplicate = (
        db.query(GateEntry)
        .filter(
            GateEntry.batch_number == batch_number,
            GateEntry.company_id == company_code,
            GateEntry.id != (record_id if record_id else 0)
        )
        .first()
    )

    if duplicate:
        return JSONResponse({"error": "Batch Number already exists for this company!"}, status_code=400)

    # ---------------- UPDATE ----------------
    if record_id:
        row = (
            db.query(GateEntry)
            .filter(GateEntry.id == record_id, GateEntry.company_id == company_code)
            .first()
        )
        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        row.batch_number = batch_number
        row.challan_number = challan_number
        row.gate_pass_number = gate_pass_number
        row.supplier_name = supplier_name
        row.purchasing_location = purchasing_location
        row.vehicle_number = vehicle_number
        row.no_of_material_boxes = no_of_material_boxes
        row.no_of_empty_boxes = no_of_empty_boxes
        row.no_of_ice_boxes = no_of_ice_boxes
        row.date = date_value
        row.time = time_value
        row.email = email

    # ---------------- INSERT ----------------
    else:
        new_row = GateEntry(
            batch_number=batch_number,
            challan_number=challan_number,
            gate_pass_number=gate_pass_number,
            supplier_name=supplier_name,
            purchasing_location=purchasing_location,
            vehicle_number=vehicle_number,
            no_of_material_boxes=no_of_material_boxes,
            no_of_empty_boxes=no_of_empty_boxes,
            no_of_ice_boxes=no_of_ice_boxes,
            date=date_value,
            time=time_value,
            email=email,
            company_id=company_code
        )
        db.add(new_row)

    db.commit()
    return JSONResponse({"success": True})


# ---------------------------------------------------------
# DELETE
# ---------------------------------------------------------
@router.post("/gate_entry/delete/{id}")
def delete_gate_entry(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    if not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    db.query(GateEntry).filter(
        GateEntry.id == id,
        GateEntry.company_id == company_code
    ).delete()

    db.commit()
    return JSONResponse({"status": "ok"})
