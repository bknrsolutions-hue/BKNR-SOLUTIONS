# app/routers/criteria/production_types.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.criteria import production_types, glazes, freezers

router = APIRouter(tags=["PRODUCTION TYPES"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE LOAD (COMPANY-WISE)
# ---------------------------------------------------------
@router.get("/production_types")
def production_types_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    # LOOKUPS (company-wise only)
    glaze_list = (
        db.query(glazes.glaze_name)
        .filter(glazes.company_id == company_code)
        .order_by(glazes.glaze_name)
        .all()
    )

    freezer_list = (
        db.query(freezers.freezer_name)
        .filter(freezers.company_id == company_code)
        .order_by(freezers.freezer_name)
        .all()
    )

    lookup = {
        "glazes": [g[0] for g in glaze_list],
        "freezers": [f[0] for f in freezer_list],
    }

    # TABLE DATA
    rows = (
        db.query(production_types)
        .filter(production_types.company_id == company_code)
        .order_by(production_types.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/production_types.html",
        {
            "request": request,
            "lookup": lookup,
            "today_data": rows,
            "email": email,
            "company_id": company_code,
        }
    )


# ---------------------------------------------------------
# SAVE / UPDATE
# ---------------------------------------------------------
@router.post("/production_types")
def save_production_types(
    request: Request,

    production_type: str = Form(...),
    glaze_name: str = Form(...),
    freezer_name: str = Form(...),
    production_charge_per_kg: str = Form(""),

    id: str = Form(""),
    date: str = Form(""),
    time: str = Form(""),

    db: Session = Depends(get_db)
):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    # SAFE ID
    record_id = int(id) if id and id.isdigit() else None

    # Auto Date & Time
    now = datetime.now()
    if not date:
        date = now.strftime("%Y-%m-%d")
    if not time:
        time = now.strftime("%H:%M:%S")

    # SAFE FLOAT
    try:
        charge_value = float(production_charge_per_kg) if production_charge_per_kg else 0
    except:
        charge_value = 0

    # DUPLICATE CHECK
    duplicate = (
        db.query(production_types)
        .filter(
            production_types.production_type == production_type,
            production_types.glaze_name == glaze_name,
            production_types.freezer_name == freezer_name,
            production_types.company_id == company_code,
            production_types.id != (record_id if record_id else 0)
        )
        .first()
    )

    if duplicate:
        return JSONResponse({"error": "This record already exists!"}, status_code=400)

    # UPDATE MODE
    if record_id:
        row = (
            db.query(production_types)
            .filter(
                production_types.id == record_id,
                production_types.company_id == company_code
            )
            .first()
        )

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        row.production_type = production_type
        row.glaze_name = glaze_name
        row.freezer_name = freezer_name
        row.production_charge_per_kg = charge_value
        row.date = date
        row.time = time
        row.email = email

    # INSERT MODE
    else:
        new_row = production_types(
            production_type=production_type,
            glaze_name=glaze_name,
            freezer_name=freezer_name,
            production_charge_per_kg=charge_value,
            date=date,
            time=time,
            email=email,
            company_id=company_code
        )
        db.add(new_row)

    db.commit()
    return JSONResponse({"success": True})


# ---------------------------------------------------------
# DELETE RECORD
# ---------------------------------------------------------
@router.post("/production_types/delete/{id}")
def delete_production_type(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    if not company_code:
        return JSONResponse({"error": "Session expired!"}, status_code=401)

    db.query(production_types).filter(
        production_types.id == id,
        production_types.company_id == company_code
    ).delete()

    db.commit()
    return JSONResponse({"status": "ok"})
