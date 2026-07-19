import json
import uuid
from fastapi import APIRouter, Request, Depends, Form, BackgroundTasks
from fastapi.responses import RedirectResponse, JSONResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct, or_
from datetime import datetime, date
from app.utils.timezone import ist_now

from app.services.brevo_email import send_bulk_email
from app.utils.company_service import get_gate_entry_report_emails

from app.database import get_db
from app.database.models.processing import (
    AuditLog,
    GateEntry,
    GoodsGateMovement,
    GoodsGateMovementItem,
)
from app.database.models.attendance import EmployeeRegistration
from app.database.models.criteria import (
    purposes,
    suppliers,
    purchasing_locations,
    vehicle_numbers,
    production_for,
    peeling_at,
    vendors,
)
from app.utils.global_filters import get_global_filters
from app.utils.edit_lock import is_edit_locked, edit_lock_message
from app.services.cache import invalidate_company_cache

router = APIRouter(tags=["GATE ENTRY"])
templates = Jinja2Templates(directory="app/templates")

GOODS_GATE_CATEGORIES = [
    "Packing Materials",
    "Chemicals",
    "General Store Items",
    "Machinery",
    "Spare Parts",
    "Office Materials",
    "Repair / Service Items",
    "Samples",
    "Scrap",
    "Returnable Materials",
    "Other",
]
GOODS_GATE_UNITS = ["Nos", "KG", "Boxes", "Bags", "Litres", "Metres", "Sets", "Lots"]
GOODS_GATE_PURPOSES = [
    "Purchase Receipt",
    "Material Issue",
    "Repair / Service",
    "Job Work",
    "Return to Vendor",
    "Customer Return",
    "Sample",
    "Office Use",
    "Scrap Disposal",
    "Inter-Unit Transfer",
    "Other",
]
RMP_BLOCKED_TERMS = {"RMP", "RAW MATERIAL", "RAW SHRIMP", "RAW MATERIAL SHRIMP"}


class GoodsGateItemPayload(BaseModel):
    item_category: str
    item_name: str
    description: str | None = None
    quantity: float = Field(gt=0)
    unit: str
    packages: str | float | None = 0
    material_condition: str | None = None
    remarks: str | None = None


class GoodsGateMovementPayload(BaseModel):
    movement_type: str
    production_for: str
    plant_location: str
    party_name: str
    source_destination: str | None = None
    po_number: str | None = None
    challan_number: str | None = None
    invoice_number: str | None = None
    vehicle_number: str | None = None
    driver_name: str | None = None
    department: str | None = None
    purpose: str
    authorized_received_by: str | None = None
    is_returnable: bool = False
    expected_return_date: date | None = None
    linked_movement_id: int | None = None
    remarks: str | None = None
    items: list[GoodsGateItemPayload]


class GoodsGateCancelPayload(BaseModel):
    reason: str


def _invalidate_gate_entry_caches(company_id: str) -> None:
    invalidate_company_cache(company_id, "processing_forms")
    invalidate_company_cache(company_id, "processing_reports")


def _clean(value) -> str:
    return str(value or "").strip()


def _is_rmp_item(category: str, item_name: str, description: str | None = None) -> bool:
    text = " ".join((_clean(category), _clean(item_name), _clean(description))).upper()
    normalized = " ".join(text.replace("-", " ").replace("/", " ").split())
    words = set(normalized.split())
    return (
        "RMP" in words
        or "RAW SHRIMP" in normalized
        or "RAW PRAWN" in normalized
        or "RAW MATERIAL SHRIMP" in normalized
        or "RAW MATERIAL PRAWN" in normalized
        or _clean(category).upper() in RMP_BLOCKED_TERMS
    )


def _allowed_locations(request: Request) -> list[str]:
    locations = request.session.get("allowed_locations", [])
    if isinstance(locations, str):
        locations = locations.split(",")
    return [_clean(value).upper() for value in (locations or []) if _clean(value)]


def _validate_goods_scope(request: Request, production_for_value: str, location_value: str) -> str | None:
    global_production_for, global_location = get_global_filters(request)
    production_for_clean = _clean(production_for_value)
    location_clean = _clean(location_value)
    if global_production_for and production_for_clean.upper() != _clean(global_production_for).upper():
        return "Production For must match the active global filter."
    if global_location and location_clean.upper() != _clean(global_location).upper():
        return "Plant Location must match the active global filter."
    allowed = _allowed_locations(request)
    if allowed and location_clean.upper() not in allowed:
        return "You do not have access to the selected plant location."
    return None


def _goods_items(db: Session, movement_id: int) -> list[GoodsGateMovementItem]:
    return db.query(GoodsGateMovementItem).filter(
        GoodsGateMovementItem.movement_id == movement_id
    ).order_by(GoodsGateMovementItem.id).all()


def _serialize_goods_movement(db: Session, row: GoodsGateMovement) -> dict:
    items = _goods_items(db, row.id)
    return {
        "id": row.id,
        "movement_number": row.movement_number,
        "movement_type": row.movement_type,
        "movement_date": row.movement_date.isoformat() if row.movement_date else None,
        "movement_time": row.movement_time.strftime("%H:%M") if row.movement_time else None,
        "production_for": row.production_for,
        "plant_location": row.plant_location,
        "party_name": row.party_name,
        "source_destination": row.source_destination,
        "po_number": row.po_number,
        "challan_number": row.challan_number,
        "invoice_number": row.invoice_number,
        "vehicle_number": row.vehicle_number,
        "driver_name": row.driver_name,
        "department": row.department,
        "purpose": row.purpose,
        "authorized_received_by": row.authorized_received_by,
        "is_returnable": bool(row.is_returnable),
        "expected_return_date": row.expected_return_date.isoformat() if row.expected_return_date else None,
        "linked_movement_id": row.linked_movement_id,
        "return_status": row.return_status,
        "status": row.status,
        "remarks": row.remarks,
        "created_by": row.created_by,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "is_cancelled": bool(row.is_cancelled),
        "cancel_reason": row.cancel_reason,
        "items": [{
            "id": item.id,
            "item_category": item.item_category,
            "item_name": item.item_name,
            "description": item.description,
            "quantity": item.quantity,
            "unit": item.unit,
            "packages": item.packages,
            "returned_quantity": item.returned_quantity,
            "material_condition": item.material_condition,
            "remarks": item.remarks,
        } for item in items],
        "item_summary": ", ".join(
            f"{item.item_name} ({item.quantity:g} {item.unit})" for item in items
        ),
        "total_quantity": round(sum(float(item.quantity or 0) for item in items), 3),
        "total_packages": round(sum(float(item.packages or 0) for item in items), 3),
    }


def _refresh_return_status(db: Session, parent: GoodsGateMovement) -> None:
    items = _goods_items(db, parent.id)
    if not parent.is_returnable:
        parent.return_status = "NOT_APPLICABLE"
    elif items and all(float(item.returned_quantity or 0) >= float(item.quantity or 0) - 0.0001 for item in items):
        parent.return_status = "RETURNED"
        parent.status = "COMPLETED"
    elif any(float(item.returned_quantity or 0) > 0.0001 for item in items):
        parent.return_status = "PARTIAL"
        parent.status = "ACTIVE"
    else:
        parent.return_status = "PENDING"
        parent.status = "ACTIVE"


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

    # Purchasing Location is a different lookup from the active Plant Location
    # (Peeling At). Applying the plant filter here hides valid purchasing
    # locations whenever a plant is selected globally.
    loc_q = db.query(purchasing_locations).filter(purchasing_locations.company_id == comp)

    location_list = [x.location_name for x in loc_q.order_by(purchasing_locations.location_name).all()]

    vehicle_list = [
        x.vehicle_number for x in db.query(vehicle_numbers)
        .filter(vehicle_numbers.company_id == comp)
        .order_by(vehicle_numbers.vehicle_number).all()
    ]

    driver_rows = db.query(EmployeeRegistration.employee_name).filter(
        EmployeeRegistration.company_id == comp,
        func.lower(func.trim(EmployeeRegistration.designation)) == "driver",
    ).distinct().order_by(EmployeeRegistration.employee_name).all()
    driver_list = [
        name.strip() for (name,) in driver_rows
        if name and name.strip()
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
        driver_list,
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

    # 🟢 🔴 FETCH USER PERMITTED LOCATIONS FROM SESSION (       )
    session_locations = request.session.get("allowed_locations", [])
    if isinstance(session_locations, str):
        user_allowed_locations = [loc.strip() for loc in session_locations.split(",") if loc.strip()]
    else:
        user_allowed_locations = session_locations

    # ‌
    (suppliers_dd, locations_dd, vehicles_dd, drivers_dd, peeling_dd, prod_for_list,
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
    gate_history_q = db.query(GateEntry).filter(GateEntry.company_id == comp)
    goods_history_q = db.query(GoodsGateMovement).filter(GoodsGateMovement.company_id == comp)
    if global_production_for:
        gate_history_q = gate_history_q.filter(
            func.upper(func.trim(GateEntry.production_for)) == _clean(global_production_for).upper()
        )
        goods_history_q = goods_history_q.filter(
            func.upper(func.trim(GoodsGateMovement.production_for)) == _clean(global_production_for).upper()
        )
    if global_location:
        gate_history_q = gate_history_q.filter(
            func.upper(func.trim(GateEntry.receiving_center)) == _clean(global_location).upper()
        )
        goods_history_q = goods_history_q.filter(
            func.upper(func.trim(GoodsGateMovement.plant_location)) == _clean(global_location).upper()
        )

    def history_values(query, column):
        return [
            row[0] for row in query.with_entities(column).filter(
                column != None,
                func.trim(column) != "",
            ).distinct().all() if row[0]
        ]

    historical_production_for = (
        history_values(gate_history_q, GateEntry.production_for)
        + history_values(goods_history_q, GoodsGateMovement.production_for)
    )
    prod_for_list = (
        [_clean(global_production_for)] if global_production_for
        else sorted(set(prod_for_list + historical_production_for))
    )
    locations_dd = sorted(set(
        locations_dd
        + history_values(gate_history_q, GateEntry.purchasing_location)
        + history_values(goods_history_q, GoodsGateMovement.source_destination)
    ))
    vehicles_dd = sorted(set(
        vehicles_dd
        + history_values(gate_history_q, GateEntry.vehicle_number)
        + history_values(goods_history_q, GoodsGateMovement.vehicle_number)
    ))
    drivers_dd = sorted(set(
        drivers_dd
        + history_values(gate_history_q, GateEntry.driver_name)
        + history_values(goods_history_q, GoodsGateMovement.driver_name)
    ))
    vendor_names = [
        row.name for row in db.query(vendors).filter(
            vendors.company_id == comp,
        ).order_by(vendors.name).all() if row.name
    ]
    purpose_list = GOODS_GATE_PURPOSES + [
        row.purpose_name for row in db.query(purposes).filter(
            purposes.company_id == comp,
        ).order_by(purposes.purpose_name).all() if row.purpose_name
    ] + history_values(goods_history_q, GoodsGateMovement.purpose)
    purpose_list = list(dict.fromkeys(purpose_list))
    employee_q = db.query(EmployeeRegistration).filter(
        EmployeeRegistration.company_id == comp,
        or_(
            EmployeeRegistration.status == None,
            func.upper(EmployeeRegistration.status) == "ACTIVE",
        ),
    )
    if global_location:
        employee_q = employee_q.filter(
            or_(
                func.upper(func.trim(EmployeeRegistration.production_at)) == _clean(global_location).upper(),
                func.upper(func.trim(EmployeeRegistration.location)) == _clean(global_location).upper(),
            )
        )
    employees = employee_q.order_by(EmployeeRegistration.employee_name).all()
    employee_names = sorted({row.employee_name for row in employees if row.employee_name})
    department_list = sorted(
        {row.department for row in employees if row.department}
        | set(history_values(goods_history_q, GoodsGateMovement.department))
    )
    employee_names = sorted(set(
        employee_names
        + history_values(goods_history_q, GoodsGateMovement.authorized_received_by)
    ))
    goods_parties = sorted(set(
        suppliers_dd
        + vendor_names
        + history_values(goods_history_q, GoodsGateMovement.party_name)
    ))

    if request.query_params.get("format") == "json":
        return JSONResponse({
            "suppliers": suppliers_dd,
            "locations": locations_dd,
            "goods_source_locations": locations_dd,
            "vehicles": vehicles_dd,
            "drivers": drivers_dd,
            "peeling_ats": peeling_dd,
            "prod_for_list": prod_for_list,
            "goods_parties": goods_parties,
            "purposes": purpose_list,
            "departments": department_list,
            "employee_names": employee_names,
            "last_batch_map": json.loads(lb_json) if isinstance(lb_json, str) else lb_json,
            "last_challan_map": json.loads(lc_json) if isinstance(lc_json, str) else lc_json,
            "last_gp_combo_map": json.loads(lgp_json) if isinstance(lgp_json, str) else lgp_json,
            "last_gp_value": last_gp,
            "today_data": [
                {
                    "id": r.id,
                    "date": r.date.isoformat() if r.date else None,
                    "time": r.time.strftime("%H:%M") if r.time else None,
                    "batch_number": r.batch_number,
                    "challan_number": r.challan_number,
                    "gate_pass_number": r.gate_pass_number,
                    "supplier_name": r.supplier_name,
                    "purchasing_location": r.purchasing_location,
                    "vehicle_number": r.vehicle_number,
                    "driver_name": getattr(r, 'driver_name', ''),
                    "no_of_material_boxes": r.no_of_material_boxes,
                    "no_of_empty_boxes": r.no_of_empty_boxes,
                    "no_of_ice_boxes": r.no_of_ice_boxes,
                    "species": r.species,
                    "production_for": r.production_for,
                    "receiving_center": r.receiving_center,
                    "is_cancelled": r.is_cancelled,
                    "cancel_reason": r.cancel_reason,
                    "cancelled_by": r.cancelled_by,
                    "cancelled_at": r.cancelled_at.isoformat() if r.cancelled_at else None,
                    "email": r.email
                } for r in today_rows
            ]
        })

    return templates.TemplateResponse(
        request=request,
        name="processing/gate_entry.html",
        context={
            "suppliers": suppliers_dd,
            "locations": locations_dd,
            "goods_source_locations": locations_dd,
            "vehicles": vehicles_dd,
            "drivers": drivers_dd,
            "peeling_ats": peeling_dd,
            "prod_for_list": prod_for_list,
            "goods_parties": goods_parties,
            "purposes": purpose_list,
            "departments": department_list,
            "employee_names": employee_names,
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
# NON-RMP GOODS IN / OUT REGISTER
# =========================================================
@router.get("/gate_entry/goods")
def goods_gate_register(
    request: Request,
    movement_type: str | None = None,
    category: str | None = None,
    search: str | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    db: Session = Depends(get_db),
):
    email = request.session.get("email")
    comp = request.session.get("company_code")
    if not email or not comp:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)

    global_production_for, global_location = get_global_filters(request)
    query = db.query(GoodsGateMovement).filter(GoodsGateMovement.company_id == comp)
    if global_production_for:
        query = query.filter(func.upper(func.trim(GoodsGateMovement.production_for)) == _clean(global_production_for).upper())
    if global_location:
        query = query.filter(func.upper(func.trim(GoodsGateMovement.plant_location)) == _clean(global_location).upper())
    elif _allowed_locations(request):
        query = query.filter(func.upper(func.trim(GoodsGateMovement.plant_location)).in_(_allowed_locations(request)))
    if movement_type and movement_type.upper() in {"IN", "OUT"}:
        query = query.filter(GoodsGateMovement.movement_type == movement_type.upper())
    if from_date:
        query = query.filter(GoodsGateMovement.movement_date >= from_date)
    if to_date:
        query = query.filter(GoodsGateMovement.movement_date <= to_date)
    if search and _clean(search):
        pattern = f"%{_clean(search)}%"
        item_matches = db.query(GoodsGateMovementItem.movement_id).filter(
            or_(
                GoodsGateMovementItem.item_name.ilike(pattern),
                GoodsGateMovementItem.description.ilike(pattern),
            )
        )
        query = query.filter(or_(
            GoodsGateMovement.movement_number.ilike(pattern),
            GoodsGateMovement.party_name.ilike(pattern),
            GoodsGateMovement.vehicle_number.ilike(pattern),
            GoodsGateMovement.challan_number.ilike(pattern),
            GoodsGateMovement.invoice_number.ilike(pattern),
            GoodsGateMovement.id.in_(item_matches),
        ))
    if category and _clean(category):
        category_ids = db.query(GoodsGateMovementItem.movement_id).filter(
            func.upper(func.trim(GoodsGateMovementItem.item_category)) == _clean(category).upper()
        )
        query = query.filter(GoodsGateMovement.id.in_(category_ids))

    rows = query.order_by(GoodsGateMovement.movement_date.desc(), GoodsGateMovement.id.desc()).limit(300).all()
    link_query = db.query(GoodsGateMovement).filter(
        GoodsGateMovement.company_id == comp,
        GoodsGateMovement.is_returnable == True,
        GoodsGateMovement.is_cancelled != True,
        GoodsGateMovement.return_status.in_(["PENDING", "PARTIAL"]),
    )
    if global_location:
        link_query = link_query.filter(func.upper(func.trim(GoodsGateMovement.plant_location)) == _clean(global_location).upper())
    elif _allowed_locations(request):
        link_query = link_query.filter(func.upper(func.trim(GoodsGateMovement.plant_location)).in_(_allowed_locations(request)))
    link_rows = link_query.order_by(GoodsGateMovement.id.desc()).limit(100).all()

    return {
        "success": True,
        "categories": GOODS_GATE_CATEGORIES,
        "units": GOODS_GATE_UNITS,
        "rows": [_serialize_goods_movement(db, row) for row in rows],
        "returnable_movements": [{
            "id": row.id,
            "movement_number": row.movement_number,
            "movement_type": row.movement_type,
            "party_name": row.party_name,
            "production_for": row.production_for,
            "plant_location": row.plant_location,
            "return_status": row.return_status,
            "items": [{
                "item_name": item.item_name,
                "unit": item.unit,
                "quantity": item.quantity,
                "returned_quantity": item.returned_quantity,
                "balance_quantity": round(max(float(item.quantity or 0) - float(item.returned_quantity or 0), 0), 3),
                "item_category": item.item_category,
            } for item in _goods_items(db, row.id)],
        } for row in link_rows],
    }


@router.post("/gate_entry/goods")
def save_goods_gate_movement(
    request: Request,
    payload: GoodsGateMovementPayload,
    db: Session = Depends(get_db),
):
    email = request.session.get("email")
    comp = request.session.get("company_code")
    if not email or not comp:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)

    movement_type = _clean(payload.movement_type).upper()
    if movement_type not in {"IN", "OUT"}:
        return JSONResponse({"success": False, "message": "Movement type must be IN or OUT."}, status_code=400)
    if not _clean(payload.production_for) or not _clean(payload.plant_location):
        return JSONResponse({"success": False, "message": "Production For and Plant Location are required."}, status_code=400)
    plant_exists = db.query(peeling_at.id).filter(
        peeling_at.company_id == comp,
        func.upper(func.trim(peeling_at.peeling_at)) == _clean(payload.plant_location).upper(),
    ).first()
    if not plant_exists:
        return JSONResponse({
            "success": False,
            "message": "Plant Location must be selected from the configured Peeling At lookup.",
        }, status_code=400)
    scope_error = _validate_goods_scope(request, payload.production_for, payload.plant_location)
    if scope_error:
        return JSONResponse({"success": False, "message": scope_error}, status_code=403)
    if not _clean(payload.party_name) or not _clean(payload.purpose):
        return JSONResponse({"success": False, "message": "Party Name and Purpose are required."}, status_code=400)
    if not payload.items:
        return JSONResponse({"success": False, "message": "Add at least one goods item."}, status_code=400)
    if payload.is_returnable and movement_type == "OUT" and not payload.expected_return_date:
        return JSONResponse({"success": False, "message": "Expected Return Date is required for returnable Goods OUT."}, status_code=400)
    item_keys: set[tuple[str, str]] = set()
    for item in payload.items:
        category_upper = _clean(item.item_category).upper()
        unit_upper = _clean(item.unit).upper()
        if _is_rmp_item(item.item_category, item.item_name, item.description):
            return JSONResponse({
                "success": False,
                "message": "Raw material shrimp must be recorded under Raw Material Gate Entry.",
            }, status_code=400)
        if not _clean(item.item_category) or not _clean(item.item_name) or not _clean(item.unit):
            return JSONResponse({"success": False, "message": "Category, Item Name, Quantity and Unit are required for every item."}, status_code=400)
        if category_upper not in {value.upper() for value in GOODS_GATE_CATEGORIES}:
            return JSONResponse({"success": False, "message": f"Invalid goods category: {item.item_category}."}, status_code=400)
        if unit_upper not in {value.upper() for value in GOODS_GATE_UNITS}:
            return JSONResponse({"success": False, "message": f"Invalid unit: {item.unit}."}, status_code=400)
        item_key = (_clean(item.item_name).upper(), unit_upper)
        if item_key in item_keys:
            return JSONResponse({
                "success": False,
                "message": f"Combine duplicate item lines for {item.item_name} ({item.unit}).",
            }, status_code=400)
        item_keys.add(item_key)

    parent = None
    parent_items = {}
    if payload.linked_movement_id:
        parent = db.query(GoodsGateMovement).filter(
            GoodsGateMovement.id == payload.linked_movement_id,
            GoodsGateMovement.company_id == comp,
            GoodsGateMovement.is_returnable == True,
            GoodsGateMovement.is_cancelled != True,
        ).with_for_update().first()
        if not parent:
            return JSONResponse({"success": False, "message": "Linked returnable movement was not found."}, status_code=400)
        if parent.movement_type == movement_type:
            return JSONResponse({"success": False, "message": "A return must use the opposite IN/OUT movement type."}, status_code=400)
        if parent.return_status == "RETURNED":
            return JSONResponse({"success": False, "message": "The linked movement is already fully returned."}, status_code=400)
        if _clean(parent.production_for).upper() != _clean(payload.production_for).upper():
            return JSONResponse({"success": False, "message": "Return Production For must match the linked movement."}, status_code=400)
        if _clean(parent.plant_location).upper() != _clean(payload.plant_location).upper():
            return JSONResponse({"success": False, "message": "Return Plant Location must match the linked movement."}, status_code=400)
        parent_items = {
            (_clean(item.item_name).upper(), _clean(item.unit).upper()): item
            for item in _goods_items(db, parent.id)
        }
        for item in payload.items:
            key = (_clean(item.item_name).upper(), _clean(item.unit).upper())
            original = parent_items.get(key)
            if not original:
                return JSONResponse({"success": False, "message": f"{item.item_name} is not present in the linked movement."}, status_code=400)
            balance = float(original.quantity or 0) - float(original.returned_quantity or 0)
            if float(item.quantity or 0) > balance + 0.0001:
                return JSONResponse({
                    "success": False,
                    "message": f"Return quantity for {item.item_name} exceeds the balance of {balance:g} {original.unit}.",
                }, status_code=400)

    current = ist_now()
    try:
        row = GoodsGateMovement(
            company_id=comp,
            movement_number=f"PENDING-{uuid.uuid4().hex}",
            movement_type=movement_type,
            movement_date=current.date(),
            movement_time=current.time(),
            production_for=_clean(payload.production_for),
            plant_location=_clean(payload.plant_location),
            party_name=_clean(payload.party_name),
            source_destination=_clean(payload.source_destination) or None,
            po_number=_clean(payload.po_number) or None,
            challan_number=_clean(payload.challan_number) or None,
            invoice_number=_clean(payload.invoice_number) or None,
            vehicle_number=_clean(payload.vehicle_number) or None,
            driver_name=_clean(payload.driver_name) or None,
            department=_clean(payload.department) or None,
            purpose=_clean(payload.purpose),
            authorized_received_by=_clean(payload.authorized_received_by) or None,
            is_returnable=bool(payload.is_returnable and not parent),
            expected_return_date=payload.expected_return_date if not parent else None,
            linked_movement_id=parent.id if parent else None,
            return_status="PENDING" if payload.is_returnable and not parent else "NOT_APPLICABLE",
            status="ACTIVE",
            remarks=_clean(payload.remarks) or None,
            created_by=email,
            created_at=current,
            is_cancelled=False,
        )
        db.add(row)
        db.flush()
        row.movement_number = f"G{movement_type}-{current.year}-{row.id:06d}"
        for item in payload.items:
            pkg_raw = str(item.packages or 0)
            pkg_match = re.search(r'[\d.]+', pkg_raw)
            pkg_num = float(pkg_match.group()) if pkg_match else 0.0

            db.add(GoodsGateMovementItem(
                movement_id=row.id,
                item_category=_clean(item.item_category),
                item_name=_clean(item.item_name),
                description=_clean(item.description) or None,
                quantity=round(float(item.quantity), 3),
                unit=_clean(item.unit),
                packages=round(pkg_num, 3),
                returned_quantity=0,
                material_condition=_clean(item.material_condition) or None,
                remarks=_clean(item.remarks) or None,
            ))
            if parent:
                original = parent_items[(_clean(item.item_name).upper(), _clean(item.unit).upper())]
                original.returned_quantity = round(float(original.returned_quantity or 0) + float(item.quantity), 3)

        if parent:
            _refresh_return_status(db, parent)
        db.add(AuditLog(
            table_name="goods_gate_movements",
            record_id=row.id,
            company_id=comp,
            field_name="CREATE",
            old_value="NONE",
            new_value=f"{row.movement_number} | {movement_type} | {len(payload.items)} item(s) | No inventory/accounting posting",
            edited_by=email,
            edited_at=current,
        ))
        db.commit()
        _invalidate_gate_entry_caches(comp)
        db.refresh(row)
        return {
            "success": True,
            "message": f"{row.movement_number} saved successfully. No inventory or accounting entry was posted.",
            "row": _serialize_goods_movement(db, row),
        }
    except Exception as exc:
        db.rollback()
        return JSONResponse({"success": False, "message": f"Goods gate movement could not be saved: {exc}"}, status_code=400)


@router.post("/gate_entry/goods/{movement_id}/cancel")
def cancel_goods_gate_movement(
    movement_id: int,
    request: Request,
    payload: GoodsGateCancelPayload,
    db: Session = Depends(get_db),
):
    email = request.session.get("email")
    comp = request.session.get("company_code")
    reason = _clean(payload.reason)
    if not email or not comp:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    if not reason:
        return JSONResponse({"success": False, "message": "Cancellation reason is required."}, status_code=400)
    row = db.query(GoodsGateMovement).filter(
        GoodsGateMovement.id == movement_id,
        GoodsGateMovement.company_id == comp,
    ).with_for_update().first()
    if not row:
        return JSONResponse({"success": False, "message": "Goods movement not found."}, status_code=404)
    if row.is_cancelled:
        return JSONResponse({"success": False, "message": "Goods movement is already cancelled."}, status_code=400)
    if db.query(GoodsGateMovement.id).filter(
        GoodsGateMovement.linked_movement_id == row.id,
        GoodsGateMovement.is_cancelled != True,
    ).first():
        return JSONResponse({"success": False, "message": "Cancel linked return movements before cancelling this entry."}, status_code=400)

    now = ist_now()
    if row.linked_movement_id:
        parent = db.query(GoodsGateMovement).filter(
            GoodsGateMovement.id == row.linked_movement_id,
            GoodsGateMovement.company_id == comp,
        ).with_for_update().first()
        if parent:
            parent_items = {
                (_clean(item.item_name).upper(), _clean(item.unit).upper()): item
                for item in _goods_items(db, parent.id)
            }
            for item in _goods_items(db, row.id):
                original = parent_items.get((_clean(item.item_name).upper(), _clean(item.unit).upper()))
                if original:
                    original.returned_quantity = round(max(
                        float(original.returned_quantity or 0) - float(item.quantity or 0), 0
                    ), 3)
            _refresh_return_status(db, parent)
    row.is_cancelled = True
    row.status = "CANCELLED"
    row.cancel_reason = reason
    row.cancelled_by = email
    row.cancelled_at = now
    db.add(AuditLog(
        table_name="goods_gate_movements",
        record_id=row.id,
        company_id=comp,
        field_name="CANCEL",
        old_value="ACTIVE",
        new_value=reason,
        edited_by=email,
        edited_at=now,
    ))
    db.commit()
    _invalidate_gate_entry_caches(comp)
    return {"success": True, "message": f"{row.movement_number} cancelled successfully."}


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
                no_of_ice_boxes=row.no_of_ice_boxes, species=row.species, date=row.date, time=row.time,
                email=row.email, company_id=row.company_id
            )
            text = (
                f"SVBK Gate Entry Notification\n"
                f"Batch: {row.batch_number}\n"
                f"Vehicle: {row.vehicle_number}\n"
                f"Receiving Center: {row.receiving_center}\n"
                f"Supplier: {row.supplier_name}\n"
                f"Date/Time: {row.date} {row.time}\n"
                f"Entered By: {row.email}"
            )
            send_bulk_email(emails, f"SVBK - Vehicle Arrived: Batch {row.batch_number}", html, text=text)
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
    driver_name: str = Form(""),
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

    production_for = _clean(production_for)
    receiving_center = _clean(receiving_center)
    supplier_name = _clean(supplier_name)
    purchasing_location = _clean(purchasing_location)
    vehicle_number = _clean(vehicle_number)
    batch_number = _clean(batch_number)
    challan_number = _clean(challan_number)
    gate_pass_number = _clean(gate_pass_number)

    if not all((production_for, receiving_center, supplier_name, purchasing_location, vehicle_number)):
        return JSONResponse({"error": "Complete all required Gate Entry fields."}, status_code=400)

    scope_error = _validate_goods_scope(request, production_for, receiving_center)
    if scope_error:
        return JSONResponse({"error": scope_error}, status_code=403)

    factory_exists = db.query(peeling_at.id).filter(
        peeling_at.company_id == comp,
        func.upper(func.trim(peeling_at.peeling_at)) == receiving_center.upper(),
    ).first()
    if not factory_exists:
        return JSONResponse(
            {"error": "Factory Name must be selected from the Peeling At lookup."},
            status_code=400,
        )

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
        driver_name=driver_name.strip() if driver_name else None,
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
    _invalidate_gate_entry_caches(comp)
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
    driver_name: str = Form(""),
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
    row.driver_name = driver_name.strip() if driver_name else None
    row.production_for = production_for
    row.no_of_material_boxes = no_of_material_boxes
    row.no_of_empty_boxes = no_of_empty_boxes
    row.no_of_ice_boxes = no_of_ice_boxes

    db.commit()
    _invalidate_gate_entry_caches(comp)
    return JSONResponse({"status": "success", "message": "Gate Entry Updated Successfully!"})


from app.utils.trace_lock import is_batch_used_in_rmp

@router.post("/gate_entry/delete/{id}")
def delete_entry(
    id: int,
    request: Request,
    cancel_reason: str = Form(None),
    db: Session = Depends(get_db)
):
    comp = request.session.get("company_code")
    if not comp:
        return JSONResponse({"error": "Unauthorized"}, status_code=401)

    row = db.query(GateEntry).filter(GateEntry.company_id == comp, GateEntry.id == id).first()
    if not row:
        return JSONResponse({"status": "error", "message": "Record not found"}, status_code=404)

    if row.is_cancelled:
        return JSONResponse({"error": "This entry is already cancelled!"}, status_code=400)

    if is_edit_locked(request, row.date):
        return JSONResponse({"error": edit_lock_message()}, status_code=403)

    # 🔒 Traceability Check: Block cancellation if batch is already used in RMP
    if is_batch_used_in_rmp(db, row.batch_number, row.company_id):
        return JSONResponse({
            "error": f"❌ Cannot cancel: Batch '{row.batch_number}' has already been processed in Raw Material Purchasing (RMP)!"
        }, status_code=400)

    # Perform Soft Delete / Cancellation
    row.is_cancelled = True
    row.status = "Cancelled"
    row.cancel_reason = cancel_reason.strip() if cancel_reason else "Cancelled by user"
    row.cancelled_by = request.session.get("email")
    row.cancelled_at = ist_now()

    db.commit()
    _invalidate_gate_entry_caches(comp)
    return JSONResponse({"status": "success", "message": "Entry Cancelled Successfully"})
