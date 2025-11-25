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
# PAGE LOAD
# ---------------------------------------------------------
@router.get("/production_types")
def page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("user_email")
    company_id = request.session.get("company_id")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    glaze_list = (
        db.query(glazes.glaze_name)
        .filter(glazes.company_id == company_id)
        .order_by(glazes.glaze_name)
        .all()
    )

    freezer_list = (
        db.query(freezers.freezer_name)
        .filter(freezers.company_id == company_id)
        .order_by(freezers.freezer_name)
        .all()
    )

    lookup_data = {
        "glazes": [g[0] for g in glaze_list],
        "freezers": [f[0] for f in freezer_list],
    }

    rows = (
        db.query(production_types)
        .filter(production_types.company_id == company_id)
        .order_by(production_types.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/production_types.html",
        {
            "request": request,
            "lookup_data": lookup_data,
            "today_data": rows,
            "email": email,
            "company_id": company_id,
        }
    )


# ---------------------------------------------------------
# SAVE / UPDATE
# ---------------------------------------------------------
@router.post("/production_types")
async def save(
    request: Request,

    production_type: str = Form(...),
    glaze_name: str = Form(...),
    freezer_name: str = Form(...),
    production_charge_per_kg: str = Form(""),

    date: str = Form(""),
    time: str = Form(""),
    email: str = Form(""),
    company_id: str = Form(""),

    id: str = Form(None),   # ID as string to avoid 422
    db: Session = Depends(get_db)
):

    session_email = request.session.get("user_email")
    session_company_id = request.session.get("company_id")

    if not session_email or not session_company_id:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    email = session_email
    company_id = session_company_id

    now = datetime.now()

    if not date:
        date = now.strftime("%Y-%m-%d")
    if not time:
        time = now.strftime("%H:%M:%S")

    # Convert charge safely
    try:
        charge_value = float(production_charge_per_kg) if production_charge_per_kg else 0
    except:
        charge_value = 0

    # Convert ID safely
    clean_id = int(id) if id not in (None, "", " ", "null") else None

    # Duplicate check
    dup = db.query(production_types).filter(
        production_types.production_type == production_type,
        production_types.glaze_name == glaze_name,
        production_types.freezer_name == freezer_name,
        production_types.company_id == company_id,
        production_types.id != (clean_id if clean_id else 0),
    ).first()

    if dup:
        return JSONResponse({"error": "Record already exists"}, status_code=400)

    if clean_id:  # UPDATE MODE
        row = db.query(production_types).filter(
            production_types.id == clean_id,
            production_types.company_id == company_id
        ).first()

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        row.production_type = production_type
        row.glaze_name = glaze_name
        row.freezer_name = freezer_name
        row.production_charge_per_kg = charge_value
        row.date = date
        row.time = time
        row.email = email

    else:  # INSERT MODE
        new_row = production_types(
            production_type=production_type,
            glaze_name=glaze_name,
            freezer_name=freezer_name,
            production_charge_per_kg=charge_value,
            date=date,
            time=time,
            email=email,
            company_id=company_id,
        )

        db.add(new_row)

    db.commit()
    return JSONResponse({"success": True})


# ---------------------------------------------------------
# DELETE
# ---------------------------------------------------------
@router.post("/production_types/delete/{id}")
def delete(id: int, request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_id")
    if not company_id:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    db.query(production_types).filter(
        production_types.id == id,
        production_types.company_id == company_id
    ).delete()

    db.commit()
    return JSONResponse({"status": "ok"})
