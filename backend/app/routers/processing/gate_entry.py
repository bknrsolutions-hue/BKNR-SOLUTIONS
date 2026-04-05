import json
from fastapi import APIRouter, Request, Depends, Form, BackgroundTasks
from fastapi.responses import RedirectResponse, JSONResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime, date

from app.services.brevo_email import send_bulk_email
from app.utils.company_service import get_gate_entry_report_emails

from app.database import get_db
from app.database.models.processing import GateEntry
from app.database.models.criteria import (
    suppliers,
    purchasing_locations,
    vehicle_numbers,
    production_for,
    peeling_at
)

router = APIRouter(tags=["GATE ENTRY"])
templates = Jinja2Templates(directory="app/templates")


# =========================================================
# COMMON DROPDOWNS & SEQUENCE LOGIC
# =========================================================
def load_dropdowns(db: Session, comp: str):
    # Fetching master data company-wise [2026-01-03]
    supplier_list = [
        x.supplier_name for x in db.query(suppliers)
        .filter(suppliers.company_id == comp)
        .order_by(suppliers.supplier_name).all()
    ]

    location_list = [
        x.location_name for x in db.query(purchasing_locations)
        .filter(purchasing_locations.company_id == comp)
        .order_by(purchasing_locations.location_name).all()
    ]

    vehicle_list = [
        x.vehicle_number for x in db.query(vehicle_numbers)
        .filter(vehicle_numbers.company_id == comp)
        .order_by(vehicle_numbers.vehicle_number).all()
    ]

    peeling_list = [
        x.peeling_at for x in db.query(peeling_at)
        .filter(peeling_at.company_id == comp)
        .order_by(peeling_at.peeling_at).all()
    ]

    prod_for_data = db.query(production_for.production_for).filter(
        production_for.company_id == comp
    ).distinct().all()
    
    prod_for_list = [p[0] for p in prod_for_data]

    # --- AUTO-INCREMENT LOGIC (For Suggestions only) ---
    last_batch_map = {}
    last_challan_map = {}
    
    for p_name in prod_for_list:
        last_entry = (
            db.query(GateEntry)
            .filter(GateEntry.company_id == comp, GateEntry.production_for == p_name)
            .order_by(GateEntry.id.desc())
            .first()
        )
        if last_entry:
            last_batch_map[p_name] = last_entry.batch_number
            last_challan_map[p_name] = last_entry.challan_number

    last_gp_entry = (
        db.query(GateEntry)
        .filter(GateEntry.company_id == comp)
        .order_by(GateEntry.id.desc())
        .first()
    )
    last_gp_val = last_gp_entry.gate_pass_number if last_gp_entry else ""

    return (
        supplier_list, 
        location_list, 
        vehicle_list, 
        peeling_list, 
        prod_for_list,
        json.dumps(last_batch_map),
        json.dumps(last_challan_map),
        last_gp_val
    )


# =========================================================
# LOAD PAGE
# =========================================================
@router.get("/gate_entry", response_class=HTMLResponse)
def gate_entry_page(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    comp  = request.session.get("company_code")

    if not email or not comp:
        return RedirectResponse("/auth/login", status_code=302)

    (suppliers_dd, locations_dd, vehicles_dd, peeling_dd, prod_for_list, 
     lb_json, lc_json, last_gp) = load_dropdowns(db, comp)

    # Filter data company wise [2026-01-03]
    today_rows = (
        db.query(GateEntry)
        .filter(GateEntry.company_id == comp, GateEntry.date == date.today())
        .order_by(GateEntry.id.desc())
        .all()
    )

    # ✅ FIXED: TemplateResponse for new FastAPI versions (request separately passed)
    return templates.TemplateResponse(
        request=request,
        name="processing/gate_entry.html",
        context={
            "suppliers": suppliers_dd,
            "locations": locations_dd,
            "vehicles": vehicles_dd,
            "peeling_ats": peeling_dd,
            "prod_for_list": prod_for_list,
            "last_batch_map_json": lb_json,
            "last_challan_map_json": lc_json,
            "last_gp_value": last_gp,
            "today_data": today_rows,
            "edit_data": None
        }
    )


# =========================================================
# EMAIL BACKGROUND TASK (Speed Optimization)
# =========================================================
def send_gate_notification(db: Session, comp: str, row_id: int):
    try:
        row = db.query(GateEntry).filter(GateEntry.id == row_id).first()
        if not row: return
        
        emails = get_gate_entry_report_emails(db, comp)
        if emails:
            # Note: Background task uses templates via its global definition
            html = templates.get_template("emails/gate_entry_notification.html").render(
                batch_number=row.batch_number, challan_number=row.challan_number,
                gate_pass_number=row.gate_pass_number, receiving_center=row.receiving_center,
                supplier_name=row.supplier_name, purchasing_location=row.purchasing_location,
                vehicle_number=row.vehicle_number, production_for=row.production_for,
                no_of_material_boxes=row.no_of_material_boxes, no_of_empty_boxes=row.no_of_empty_boxes,
                no_of_ice_boxes=row.no_of_ice_boxes, date=row.date, time=row.time,
                email=row.email, company_id=row.company_id
            )
            send_bulk_email(emails, f"Vehicle Arrived: Batch {row.batch_number}", html)
    except Exception as e:
        print(f"Mail error ignored: {e}")


# =========================================================
# SAVE NEW ENTRY (Optimized for Immediate Saving)
# =========================================================
@router.post("/gate_entry")
async def save_entry(
    background_tasks: BackgroundTasks,
    request: Request,
    batch_number: str = Form(...),
    challan_number: str = Form(...),
    gate_pass_number: str = Form(...),
    receiving_center: str = Form(...),
    supplier_name: str = Form(...),
    purchasing_location: str = Form(...),
    vehicle_number: str = Form(...),
    production_for: str = Form(...),
    no_of_material_boxes: float = Form(0),
    no_of_empty_boxes: float = Form(0),
    no_of_ice_boxes: float = Form(0),
    db: Session = Depends(get_db)
):
    email = request.session.get("email")
    comp  = request.session.get("company_code")

    if not email or not comp:
        return JSONResponse({"error": "Unauthorized. Please login again."}, status_code=401)

    # Check for Unique Batch/Challan
    dup = db.query(GateEntry).filter(
        GateEntry.company_id == comp,
        (GateEntry.batch_number == batch_number) |
        (GateEntry.challan_number == challan_number)
    ).first()

    if dup:
        return JSONResponse({"error": f"❌ Batch '{batch_number}' or Challan '{challan_number}' already exists!"}, status_code=400)

    row = GateEntry(
        batch_number=batch_number,
        challan_number=challan_number,
        gate_pass_number=gate_pass_number,
        receiving_center=receiving_center,
        supplier_name=supplier_name,
        purchasing_location=purchasing_location,
        vehicle_number=vehicle_number,
        production_for=production_for,
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
    db.refresh(row)

    # Run Email in Background so response is immediate
    background_tasks.add_task(send_gate_notification, db, comp, row.id)

    return JSONResponse({"status": "success", "message": "Gate Entry Saved Successfully!"})


# =========================================================
# UPDATE ENTRY
# =========================================================
@router.post("/gate_entry/update/{id}")
async def update_entry(
    id: int,
    request: Request,
    batch_number: str = Form(...),
    challan_number: str = Form(...),
    gate_pass_number: str = Form(...),
    receiving_center: str = Form(...),
    supplier_name: str = Form(...),
    purchasing_location: str = Form(...),
    vehicle_number: str = Form(...),
    production_for: str = Form(...),
    no_of_material_boxes: float = Form(0),
    no_of_empty_boxes: float = Form(0),
    no_of_ice_boxes: float = Form(0),
    db: Session = Depends(get_db)
):
    comp = request.session.get("company_code")
    if not comp:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    row = db.query(GateEntry).filter(GateEntry.company_id == comp, GateEntry.id == id).first()
    if not row:
        return JSONResponse({"error": "Record not found"}, status_code=404)

    dup = db.query(GateEntry).filter(
        GateEntry.company_id == comp,
        GateEntry.id != id,
        (GateEntry.batch_number == batch_number) | (GateEntry.challan_number == challan_number)
    ).first()

    if dup:
        return JSONResponse({"error": "❌ Batch/Challan already exists!"}, status_code=400)

    row.batch_number = batch_number
    row.challan_number = challan_number
    row.gate_pass_number = gate_pass_number
    row.receiving_center = receiving_center
    row.supplier_name = supplier_name
    row.purchasing_location = purchasing_location
    row.vehicle_number = vehicle_number
    row.production_for = production_for
    row.no_of_material_boxes = no_of_material_boxes
    row.no_of_empty_boxes = no_of_empty_boxes
    row.no_of_ice_boxes = no_of_ice_boxes

    db.commit()
    return JSONResponse({"status": "success", "message": "Gate Entry Updated Successfully!"})


# =========================================================
# DELETE ENTRY
# =========================================================
@router.post("/gate_entry/delete/{id}")
def delete_entry(id: int, request: Request, db: Session = Depends(get_db)):
    comp = request.session.get("company_code")
    if not comp:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    row = db.query(GateEntry).filter(GateEntry.company_id == comp, GateEntry.id == id).first()
    if row:
        db.delete(row)
        db.commit()
        return JSONResponse({"status": "success", "message": "Entry Deleted Successfully"})

    return JSONResponse({"status": "error", "message": "Record not found"}, status_code=404)