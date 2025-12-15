# app/routers/criteria/purchasing_locations.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.criteria import purchasing_locations

router = APIRouter(tags=["PURCHASING LOCATIONS"])
templates = Jinja2Templates(directory="app/templates")


# =========================================================
# PAGE LOAD — COMPANY WISE DATA
# =========================================================
@router.get("/purchasing_locations")
def purchasing_locations_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")              # FIXED
    company_code = request.session.get("company_code")  # FIXED

    if not email or not company_code:
        return RedirectResponse("/auth/login", status_code=302)

    rows = (
        db.query(purchasing_locations)
        .filter(purchasing_locations.company_id == company_code)
        .order_by(purchasing_locations.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/purchasing_locations.html",
        {
            "request": request,
            "today_data": rows,
            "email": email,
            "company_id": company_code
        }
    )


# =========================================================
# SAVE / UPDATE
# =========================================================
@router.post("/purchasing_locations")
async def save_purchasing_location(
    request: Request,

    location_name: str = Form(...),
    id: str = Form(""),

    date: str = Form(""),
    time: str = Form(""),

    db: Session = Depends(get_db)
):

    # SESSION
    email = request.session.get("email")             # FIXED
    company_code = request.session.get("company_code")   # FIXED

    if not email or not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    # SAFE ID
    record_id = int(id) if id.isdigit() else None

    # AUTO DATE/TIME
    now = datetime.now()
    date = date or now.strftime("%Y-%m-%d")
    time = time or now.strftime("%H:%M:%S")

    # DUPLICATE CHECK
    duplicate = (
        db.query(purchasing_locations)
        .filter(
            purchasing_locations.location_name == location_name,
            purchasing_locations.company_id == company_code,
            purchasing_locations.id != (record_id or 0)
        )
        .first()
    )

    if duplicate:
        return JSONResponse({"error": "Location already exists!"}, status_code=400)

    # UPDATE
    if record_id:
        row = (
            db.query(purchasing_locations)
            .filter(
                purchasing_locations.id == record_id,
                purchasing_locations.company_id == company_code
            )
            .first()
        )

        if not row:
            return JSONResponse({"error": "Record not found!"}, status_code=404)

        row.location_name = location_name
        row.date = date
        row.time = time
        row.email = email

    # INSERT
    else:
        new_row = purchasing_locations(
            location_name=location_name,
            date=date,
            time=time,
            email=email,
            company_id=company_code
        )
        db.add(new_row)

    db.commit()
    return JSONResponse({"success": True})


# =========================================================
# DELETE
# =========================================================
@router.post("/purchasing_locations/delete/{id}")
def delete_purchasing_location(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    if not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    db.query(purchasing_locations).filter(
        purchasing_locations.id == id,
        purchasing_locations.company_id == company_code
    ).delete()

    db.commit()
    return JSONResponse({"status": "ok"})
