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
    "kg_basis_labour_rates": criteria.kg_basis_labour_rates,
    "daily_basis_worker_rates": criteria.daily_basis_worker_rates,
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

def get_model_or_404(model_name: str, db: Session = None):
    model = model_mapping.get(model_name.lower())
    if not model:
        raise HTTPException(status_code=404, detail=f"Criteria model '{model_name}' not found")
    if db and hasattr(model, "__table__"):
        try:
            model.__table__.create(bind=db.bind, checkfirst=True)
        except Exception:
            pass
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

    model = get_model_or_404(model_name, db)
    
    # Query filters: check company_id matching user session
    query = db.query(model)
    if hasattr(model, "company_id"):
        query = query.filter(model.company_id == company_code)
    
    # Sort order
    if hasattr(model, "id"):
        query = query.order_by(model.id.desc())

    records = query.all()

    # 🔥 Auto-create grade_to_hoso records if table is empty for company
    if model_name.lower() == "grade_to_hoso" and not records:
        from app.services.grade_to_hoso_sync import sync_grade_to_hoso
        try:
            sync_grade_to_hoso(db, company_code, session_email)
            records = query.all()
        except Exception as e:
            print("Auto create grade_to_hoso warning:", e)

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

    # 🔥 Append 'KG BASIS' option to Contractors lookup list
    if model_name.lower() == "contractors":
        existing_names = set(str(r.get("contractor_name", "")).strip().upper() for r in serialized if r.get("contractor_name"))
        if "KG BASIS" not in existing_names:
            serialized.append({
                "id": "kg_basis_opt",
                "contractor_name": "KG BASIS",
                "company_id": company_code
            })

    return {"status": "success", "data": serialized}

import re

def parse_count_range(val_str):
    if not val_str:
        return []
    s = str(val_str).strip()
    # Match ONLY explicit range connectors ('to' or '-') like '10 to 20', '10 TO 20', '10-20'
    # Do NOT auto-expand grade ratio slash notations like '10/20', '20/30'
    m = re.match(r'^(\d+)\s*(?:-|\bto\b)\s*(\d+)$', s, re.IGNORECASE)
    if m:
        start_val = int(m.group(1))
        end_val = int(m.group(2))
        if start_val < end_val and (end_val - start_val) <= 500:
            return [str(i) for i in range(start_val, end_val + 1)]
    return []

# ---------------------------------------------------------
# SAVE OR UPDATE RECORD FOR A MODEL
# ---------------------------------------------------------
@router.post("/{model_name}")
async def save_record(request: Request, model_name: str, db: Session = Depends(get_db)):
    session_email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not session_email or not company_code:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})

    model = get_model_or_404(model_name, db)
    
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

    # 🔥 RANGE EXPANSION FOR RECORDS (e.g. "10 to 20", "10 TO 40", "10-20")
    count_fields = ["hlso_count", "count_grade", "count_range", "count", "hoso_count"]
    range_field = None
    expanded_counts = []
    for cf in count_fields:
        if cf in body and body[cf]:
            parsed = parse_count_range(body[cf])
            if len(parsed) > 1:
                range_field = cf
                expanded_counts = parsed
                break

    if range_field and expanded_counts:
        rows_to_add = []
        for c_val in expanded_counts:
            r = model()
            if hasattr(model, "company_id"):
                r.company_id = company_code
            if hasattr(model, "email"):
                r.email = session_email
            elif hasattr(model, "created_by_email"):
                r.created_by_email = session_email

            for column in model.__table__.columns:
                if column.name in ["id", "company_id", "email", "created_by_email", "created_at"]:
                    continue
                if column.name == range_field:
                    setattr(r, column.name, cast_value(column, c_val))
                elif column.name in body:
                    setattr(r, column.name, cast_value(column, body[column.name]))
                elif column.name == "date" and not getattr(r, "date", None):
                    setattr(r, "date", cast_value(column, meta_date))
                elif column.name == "time" and not getattr(r, "time", None):
                    setattr(r, "time", cast_value(column, meta_time))
            rows_to_add.append(r)

        db.add_all(rows_to_add)
        try:
            db.commit()
            if model_name.lower() in ["grades", "varieties", "glazes", "species", "hoso_hlso", "grade_to_hoso"]:
                from app.services.grade_to_hoso_sync import sync_grade_to_hoso
                try:
                    sync_grade_to_hoso(db, company_code, session_email or "system@bknr.com")
                except Exception as e:
                    print("sync_grade_to_hoso trigger warning:", e)
            return {"status": "success", "message": f"Successfully created {len(rows_to_add)} count records ({expanded_counts[0]} to {expanded_counts[-1]})"}
        except Exception as e:
            db.rollback()
            return JSONResponse(status_code=400, content={"error": f"Database range save failed: {str(e)}"})

    # Single Record Save / Update (with missing ID fallback to new creation)
    row = None
    if record_id:
        try:
            record_id_int = int(record_id)
            query = db.query(model)
            if hasattr(model, "company_id"):
                query = query.filter(model.company_id == company_code)
            row = query.filter(model.id == record_id_int).first()
        except ValueError:
            pass

    if not row:
        row = model()
        if hasattr(model, "company_id"):
            row.company_id = company_code
        if hasattr(model, "email"):
            row.email = session_email
        elif hasattr(model, "created_by_email"):
            row.created_by_email = session_email

    for column in model.__table__.columns:
        if column.name in ["id", "company_id", "email", "created_by_email", "created_at"]:
            continue
        
        if column.name in body:
            setattr(row, column.name, cast_value(column, body[column.name]))
        elif column.name == "date" and not getattr(row, "date", None):
            setattr(row, "date", cast_value(column, meta_date))
        elif column.name == "time" and not getattr(row, "time", None):
            setattr(row, "time", cast_value(column, meta_time))

    if not getattr(row, "id", None):
        db.add(row)

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        return JSONResponse(status_code=400, content={"error": f"Database save failed: {str(e)}"})

    if model_name.lower() in ["grades", "varieties", "glazes", "species", "hoso_hlso", "grade_to_hoso"]:
        from app.services.grade_to_hoso_sync import sync_grade_to_hoso
        try:
            sync_grade_to_hoso(db, company_code, session_email or "system@bknr.com")
        except Exception as e:
            print("sync_grade_to_hoso trigger warning:", e)

    return {"status": "success", "message": "Record saved successfully"}

# ---------------------------------------------------------
# DELETE RECORD FOR A MODEL
# ---------------------------------------------------------
@router.post("/{model_name}/delete/{id}")
@router.delete("/{model_name}/{id}")
def delete_record(request: Request, model_name: str, id: int, db: Session = Depends(get_db)):
    session_email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not company_code:
        return JSONResponse(status_code=401, content={"error": "Unauthorized session"})

    model = get_model_or_404(model_name, db)

    query = db.query(model).filter(model.id == id)
    if hasattr(model, "company_id"):
        query = query.filter(model.company_id == company_code)

    row = query.first()
    if not row:
        return JSONResponse(status_code=404, content={"error": "Record not found"})

    db.delete(row)
    db.commit()

    if model_name.lower() in ["grades", "varieties", "glazes", "species", "hoso_hlso", "grade_to_hoso"]:
        from app.services.grade_to_hoso_sync import sync_grade_to_hoso
        try:
            sync_grade_to_hoso(db, company_code, session_email or "system@bknr.com")
        except Exception as e:
            print("sync_grade_to_hoso trigger warning:", e)

    return {"status": "success", "message": "Record deleted successfully"}
