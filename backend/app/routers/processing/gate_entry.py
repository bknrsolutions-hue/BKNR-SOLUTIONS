import json
from fastapi import APIRouter, Request, Depends, Form, BackgroundTasks
from fastapi.responses import RedirectResponse, JSONResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct 
from datetime import datetime, date
from app.utils.timezone import ist_now

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
from app.utils.global_filters import get_global_filters
from app.utils.edit_lock import is_edit_locked, edit_lock_message

router = APIRouter(tags=["GATE ENTRY"])
templates = Jinja2Templates(directory="app/templates")


# =========================================================
# COMMON DROPDOWNS & SEQUENCE LOGIC (STRICT USER PERMISSION & FILTER LOCK)
# =========================================================
def load_dropdowns(db: Session, comp: str, user_allowed_locations: list = None, global_p_for: str = None, global_loc: str = None):
    # Fetching master data company-wise
    supplier_list = [
        x.supplier_name for x in db.query(suppliers)
        .filter(suppliers.company_id == comp)
        .order_by(suppliers.supplier_name).all()
    ]

    # 🟢 🔴 FIXED: USER PERMISSION & GLOBAL LOCATION DROPDOWN STRICT LOCK
    loc_q = db.query(purchasing_locations).filter(purchasing_locations.company_id == comp)
    
    # 1. యూజర్ పర్మిషన్ లో ఉన్న లొకేషన్స్ ని మాత్రమే ఫిల్టర్ చేస్తాం (Multiple allowed locations support)
    if user_allowed_locations:
        # ట్రిమ్ మరియు కేస్ సెన్సిటివిటీ ఇష్యూస్ లేకుండా క్లీన్ గా లాక్ చేయడానికి
        allowed_clean = [loc.strip().upper() for loc in user_allowed_locations if loc.strip()]
        if allowed_clean:
            loc_q = loc_q.filter(func.upper(func.trim(purchasing_locations.location_name)).in_(allowed_clean))
            
    # 2. ఒకవేళ గ్లోబల్ హెడర్ ఫిల్టర్ లో కూడా లొకేషన్ సెలెక్ట్ చేసి ఉంటే దాన్ని కూడా లాక్ చేస్తాం
    if global_loc:
        loc_q = loc_q.filter(func.trim(purchasing_locations.location_name) == func.trim(global_loc))
        
    location_list = [x.location_name for x in loc_q.order_by(purchasing_locations.location_name).all()]

    vehicle_list = [
        x.vehicle_number for x in db.query(vehicle_numbers)
        .filter(vehicle_numbers.company_id == comp)
        .order_by(vehicle_numbers.vehicle_number).all()
    ]

    # Peeling At / Factory dropdown also layered with the same location restrictions if required
    peeling_q = db.query(peeling_at).filter(peeling_at.company_id == comp)
    if user_allowed_locations:
        allowed_clean = [loc.strip().upper() for loc in user_allowed_locations if loc.strip()]
        if allowed_clean:
            peeling_q = peeling_q.filter(func.upper(func.trim(peeling_at.peeling_at)).in_(allowed_clean))
    if global_loc:
        peeling_q = peeling_q.filter(func.trim(peeling_at.peeling_at) == func.trim(global_loc))
        
    peeling_list = [x.peeling_at for x in peeling_q.order_by(peeling_at.peeling_at).all()]

    prod_q = db.query(production_for.production_for).filter(production_for.company_id == comp)
    if global_p_for:
        prod_q = prod_q.filter(func.trim(production_for.production_for) == func.trim(global_p_for))
    
    prod_for_data = prod_q.distinct().all()
    prod_for_list = [p[0] for p in prod_for_data]

    # --- AUTO-INCREMENT MATRIX ENGINE (Optimized to Single DB Query) ---
    last_batch_map = {}
    last_challan_map = {}
    last_gp_combo_map = {}  
    
    # Fetch all gate entries for the company ordered by id desc (latest first)
    all_gate_entries = db.query(GateEntry).filter(GateEntry.company_id == comp).order_by(GateEntry.id.desc()).all()
    
    for p_name in prod_for_list:
        last_entry = next((g for g in all_gate_entries if g.production_for == p_name), None)
        last_batch_map[p_name] = last_entry.batch_number if last_entry else ""
        last_challan_map[p_name] = last_entry.challan_number if last_entry else ""
        
        last_gp_combo_map[p_name] = {}
        for f_name in peeling_list:
            f_clean = f_name.strip().upper()
            last_gp_entry = next((g for g in all_gate_entries if g.production_for == p_name and str(g.receiving_center or "").strip().upper() == f_clean), None)
            if last_gp_entry:
                last_gp_combo_map[p_name][f_clean] = last_gp_entry.gate_pass_number
            else:
                last_gp_combo_map[p_name][f_clean] = ""

    last_gp_backup = all_gate_entries[0].gate_pass_number if all_gate_entries else ""

    return (
        supplier_list, 
        location_list, 
        vehicle_list, 
        peeling_list, 
        prod_for_list,
        json.dumps(last_batch_map),
        json.dumps(last_challan_map),
        json.dumps(last_gp_combo_map),  
        last_gp_backup
    )


# =========================================================
# LOAD PAGE (WITH DUAL FILTER LAYERS INJECTION)
# =========================================================
@router.get("/gate_entry", response_class=HTMLResponse)
def gate_entry_page(request: Request, db: Session = Depends(get_db)):
    global_production_for, global_location = get_global_filters(request)

    email = request.session.get("email")
    comp  = request.session.get("company_code")

    if not email or not comp:
        return RedirectResponse("/auth/login", status_code=302)

    # 🟢 🔴 FETCH USER PERMITTED LOCATIONS FROM SESSION (లిస్ట్ లేదా కామా సెపరేటెడ్ స్ట్రింగ్ ఏదైనా సపోర్ట్ చేస్తుంది)
    session_locations = request.session.get("allowed_locations", [])
    if isinstance(session_locations, str):
        user_allowed_locations = [loc.strip() for loc in session_locations.split(",") if loc.strip()]
    else:
        user_allowed_locations = session_locations

    # డ్రాప్‌డౌన్ లోడ్ అయ్యేటప్పుడే యూజర్ పర్మిషన్స్ మరియు గ్లోబల్ సెలెక్షన్స్ ని పంపి లాక్ చేసాను
    (suppliers_dd, locations_dd, vehicles_dd, peeling_dd, prod_for_list, 
     lb_json, lc_json, lgp_json, last_gp) = load_dropdowns(
         db=db, 
         comp=comp, 
         user_allowed_locations=user_allowed_locations, 
         global_p_for=global_production_for, 
         global_loc=global_location
     )

    # Base Gate Query formulation strictly with active global filters pool
    today_date = ist_now().date()
    today_q = db.query(GateEntry).filter(GateEntry.company_id == comp, GateEntry.date == today_date)

    if global_production_for:
        today_q = today_q.filter(func.trim(GateEntry.production_for) == func.trim(global_production_for))
    if global_location:
        today_q = today_q.filter(func.trim(GateEntry.receiving_center) == func.trim(global_location))

    today_rows = today_q.order_by(GateEntry.id.desc()).all()

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
            "last_gp_map_json": lgp_json,  
            "last_gp_value": last_gp,
            "today_data": today_rows,
            "selected_production_for": global_production_for, 
            "selected_location": global_location,             
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
# SAVE NEW ENTRY 
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

    current_ist = ist_now()

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
        date=current_ist.date(), 
        time=current_ist.time(), 
        email=email,
        company_id=comp
    )

    db.add(row)
    db.commit()
    db.refresh(row)

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
    if is_edit_locked(request, row.date):
        return JSONResponse({"error": edit_lock_message()}, status_code=403)

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
        if is_edit_locked(request, row.date):
            return JSONResponse({"error": edit_lock_message()}, status_code=403)
        db.delete(row)
        db.commit()
        return JSONResponse({"status": "success", "message": "Entry Deleted Successfully"})

    return JSONResponse({"status": "error", "message": "Record not found"}, status_code=404)
