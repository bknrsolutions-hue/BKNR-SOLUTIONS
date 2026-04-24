from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from datetime import date as date_obj

from app.database import get_db
from app.database.models.inventory_management import cold_storage

router = APIRouter(tags=["COLD STORAGE"])
templates = Jinja2Templates(directory="app/templates")

# ---------------------------------------------------------
# HELPER: CONVERT SQLALCHEMY OBJECT TO DICTIONARY
# ---------------------------------------------------------
def object_to_dict(obj):
    """Jinja2 tojson filter error raakunda object ni dict ga maarustundi"""
    if obj is None:
        return None
    return {column.name: getattr(obj, column.name) for column in obj.__table__.columns}

# ---------------------------------------------------------
# PAGE – SHOW COLD STORAGE MASTER LIST
# ---------------------------------------------------------
@router.get("/cold_storage")
def cs_page(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    # Fetching records
    raw_data = (
        db.query(cold_storage)
        .filter(cold_storage.company_id == company_code)
        .order_by(cold_storage.id.desc())
        .all()
    )

    # CRITICAL FIX: Convert each row to a dictionary so 'tojson' filter works in HTML
    serialized_data = [object_to_dict(row) for row in raw_data]

    return templates.TemplateResponse(
        request=request,
        name="inventory_management/cold_storage.html",
        context={
            "today_data": serialized_data,
            "email": email,
            "company_id": company_code,
            "message": request.query_params.get("msg", "")
        }
    )

# ---------------------------------------------------------
# SAVE RECORD (INSERT)
# ---------------------------------------------------------
@router.post("/cold_storage/save")
async def save_cs(
    request: Request,
    storage_name: str = Form(...),
    storage_type: str = Form("External"),
    db: Session = Depends(get_db)
):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    form_data = await request.form()
    
    new_row = cold_storage(
        storage_name=storage_name,
        storage_type=storage_type,
        address=form_data.get("address"),
        contact_person=form_data.get("contact_person"),
        contact_number=form_data.get("contact_number"),
        total_capacity_mc=int(form_data.get("total_capacity_mc") or 0),
        no_of_chambers=int(form_data.get("no_of_chambers") or 1),
        rent_type=form_data.get("rent_type"),
        rate_per_mc_per_month=float(form_data.get("rate_per_mc_per_month") or 0.0),
        loading_unloading_charges=float(form_data.get("loading_unloading_charges") or 0.0),
        handling_charges=float(form_data.get("handling_charges") or 0.0),
        is_active=form_data.get("is_active", "ACTIVE"),
        remarks=form_data.get("remarks"),
        email=email,
        company_id=company_code
    )
    
    db.add(new_row)
    db.commit()
    return RedirectResponse("/inventory/cold_storage?msg=Saved", status_code=303)

# ---------------------------------------------------------
# UPDATE RECORD
# ---------------------------------------------------------
@router.post("/cold_storage/update/{id}")
async def update_cs(
    id: int,
    request: Request,
    storage_name: str = Form(...),
    db: Session = Depends(get_db)
):
    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    row = db.query(cold_storage).filter(
        cold_storage.id == id,
        cold_storage.company_id == company_code
    ).first()

    if row:
        form_data = await request.form()
        row.storage_name = storage_name
        row.storage_type = form_data.get("storage_type")
        row.address = form_data.get("address")
        row.contact_person = form_data.get("contact_person")
        row.contact_number = form_data.get("contact_number")
        row.total_capacity_mc = int(form_data.get("total_capacity_mc") or 0)
        row.no_of_chambers = int(form_data.get("no_of_chambers") or 1)
        row.rent_type = form_data.get("rent_type")
        row.rate_per_mc_per_month = float(form_data.get("rate_per_mc_per_month") or 0.0)
        row.loading_unloading_charges = float(form_data.get("loading_unloading_charges") or 0.0)
        row.handling_charges = float(form_data.get("handling_charges") or 0.0)
        row.is_active = form_data.get("is_active")
        row.remarks = form_data.get("remarks")
        row.email = email
        db.commit()

    return RedirectResponse("/inventory/cold_storage?msg=Updated", status_code=303)

# ---------------------------------------------------------
# DELETE RECORD
# ---------------------------------------------------------
@router.post("/cold_storage/delete/{id}")
def delete_cs(id: int, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")

    if not company_code:
        return RedirectResponse("/", status_code=302)

    db.query(cold_storage).filter(
        cold_storage.id == id,
        cold_storage.company_id == company_code
    ).delete()

    db.commit()
    return RedirectResponse("/inventory/cold_storage?msg=Deleted", status_code=303)