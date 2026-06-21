from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
import datetime
from app.database import get_db
from app.database.models import criteria
from app.database.models.inventory_management import cold_storage

router = APIRouter(prefix="/api", tags=["Criteria API"])

# Map model names to SQLAlchemy model classes in criteria.py
model_mapping = {
    "brands": criteria.brands,
    "purposes": criteria.purposes,
    "production_at": criteria.production_at,
    "production_for": criteria.production_for,
    "glazes": criteria.glazes,
    "grades": criteria.grades,
    "varieties": criteria.varieties,
    "countries": criteria.countries,
    "buyers": criteria.buyers,
    "buyer_agents": criteria.buyer_agents,
    "packing_styles": criteria.packing_styles,
    "production_types": criteria.production_types,
    "chemicals": criteria.chemicals,
    "contractors": criteria.contractors,
    "suppliers": criteria.suppliers,
    "peeling_rates": criteria.peeling_rates,
    "species": criteria.species,
    "purchasing_locations": criteria.purchasing_locations,
    "vehicle_numbers": criteria.vehicle_numbers,
    "coldstore_locations": criteria.coldstore_locations,
    "freezers": criteria.freezers,
    "grade_to_hoso": criteria.grade_to_hoso,
    "hoso_hlso": criteria.HOSO_HLSO_Yields,
    "peeling_at": criteria.peeling_at,
    "shipping_vendors": criteria.shipping_vendors,
    "vendors": criteria.vendors,
    "hsn_codes": criteria.hsn_codes,
    "cold_storage": cold_storage,
}

def get_model_or_404(model_name: str):
    model = model_mapping.get(model_name.lower())
    if not model:
        raise HTTPException(status_code=404, detail=f"Criteria model '{model_name}' not found")
    return model

def cast_value(column, val):
    if val is None or val == "":
        return None
    from sqlalchemy.sql import sqltypes
    col_type = column.type
    if isinstance(col_type, sqltypes.Integer):
        try:
            return int(val)
        except ValueError:
            return None
    elif isinstance(col_type, sqltypes.Float):
        try:
            return float(val)
        except ValueError:
            return None
    elif isinstance(col_type, sqltypes.Date):
        if isinstance(val, (datetime.date, datetime.datetime)):
            return val
        try:
            return datetime.date.fromisoformat(str(val))
        except ValueError:
            return None
    elif isinstance(col_type, sqltypes.Time):
        if isinstance(val, datetime.time):
            return val
        try:
            return datetime.time.fromisoformat(str(val))
        except ValueError:
            return None
    elif isinstance(col_type, sqltypes.DateTime):
        if isinstance(val, datetime.datetime):
            return val
        try:
            return datetime.datetime.fromisoformat(str(val))
        except ValueError:
            return None
    return str(val)

# ---------------------------------------------------------
# GET ALL RECORDS FOR A MODEL
# ---------------------------------------------------------
@router.get("/{model_name}")
def get_all(request: Request, model_name: str, db: Session = Depends(get_db)):
    session_email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not session_email or not company_code:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})

    model = get_model_or_404(model_name)
    
    # Query filters: check company_id matching user session
    query = db.query(model)
    if hasattr(model, "company_id"):
        query = query.filter(model.company_id == company_code)
    
    # Sort order
    if hasattr(model, "id"):
        query = query.order_by(model.id.desc())

    records = query.all()

    # Serialize rows dynamically
    serialized = []
    for row in records:
        row_dict = {}
        for column in model.__table__.columns:
            val = getattr(row, column.name)
            # Format dates/times to string for JSON serialization
            if isinstance(val, (datetime.date, datetime.datetime, datetime.time)):
                row_dict[column.name] = val.isoformat()
            else:
                row_dict[column.name] = val
        serialized.append(row_dict)

    return {"status": "success", "data": serialized}

# ---------------------------------------------------------
# SAVE OR UPDATE RECORD FOR A MODEL
# ---------------------------------------------------------
@router.post("/{model_name}")
async def save_record(request: Request, model_name: str, db: Session = Depends(get_db)):
    session_email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not session_email or not company_code:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})

    model = get_model_or_404(model_name)
    
    # Read payload (accepts JSON)
    try:
        body = await request.json()
    except Exception:
        # Fallback to form data if JSON reading fails
        form_data = await request.form()
        body = {k: v for k, v in form_data.items()}

    record_id = body.get("id")
    
    # Prepare metadata fields
    now = datetime.datetime.now()
    meta_date = now.strftime("%Y-%m-%d")
    meta_time = now.strftime("%H:%M:%S")

    # Fetch existing or instantiate new row
    if record_id:
        try:
            record_id_int = int(record_id)
        except ValueError:
            return JSONResponse(status_code=400, content={"error": "Invalid ID format"})

        row = db.query(model)
        if hasattr(model, "company_id"):
            row = row.filter(model.company_id == company_code)
        row = row.filter(model.id == record_id_int).first()

        if not row:
            return JSONResponse(status_code=404, content={"error": "Record not found"})
    else:
        row = model()
        # Set metadata defaults for new record
        if hasattr(model, "company_id"):
            row.company_id = company_code
        if hasattr(model, "email"):
            row.email = session_email
        elif hasattr(model, "created_by_email"):
            row.created_by_email = session_email

    # Map form/JSON inputs dynamically to database columns
    for column in model.__table__.columns:
        if column.name in ["id", "company_id", "email", "created_by_email", "created_at"]:
            continue
        
        # Check if the field is provided in the body
        if column.name in body:
            setattr(row, column.name, cast_value(column, body[column.name]))
        # Defaults for date/time if not provided and present in model
        elif column.name == "date" and not getattr(row, "date", None):
            setattr(row, "date", cast_value(column, meta_date))
        elif column.name == "time" and not getattr(row, "time", None):
            setattr(row, "time", cast_value(column, meta_time))

    if not record_id:
        db.add(row)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        return JSONResponse(status_code=400, content={"error": f"Database save failed: {str(e)}"})

    return {"status": "success", "message": "Record saved successfully"}

# ---------------------------------------------------------
# DELETE RECORD FOR A MODEL
# ---------------------------------------------------------
@router.post("/{model_name}/delete/{id}")
@router.delete("/{model_name}/{id}")
def delete_record(request: Request, model_name: str, id: int, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")

    if not company_code:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})

    model = get_model_or_404(model_name)

    query = db.query(model).filter(model.id == id)
    if hasattr(model, "company_id"):
        query = query.filter(model.company_id == company_code)

    row = query.first()
    if not row:
        return JSONResponse(status_code=404, content={"error": "Record not found"})

    db.delete(row)
    db.commit()

    return {"status": "success", "message": "Record deleted successfully"}
