
# app/routers/criteria/coldstore_locations.py

import logging
from datetime import date, datetime
from fastapi import APIRouter, Depends, Form, Query, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.database import get_db
# 🟢 🔴 production_at ‌     !
from app.database.models.criteria import coldstore_locations, production_at

router = APIRouter(prefix="", tags=["COLDSTORE LOCATIONS"])
templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)


# ---------------------------------------------------------
# PAGE – LOAD (🔥 Context Synced for Plant & Production For)
# ---------------------------------------------------------
@router.get("/coldstore_locations")
def coldstore_locations_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    rows = (
        db.query(coldstore_locations)
        .filter(coldstore_locations.company_id == company_code)
        .order_by(coldstore_locations.id.desc())
        .all()
    )

    # 🟢 🔴       ‌   !
    plants = (
        db.query(production_at)
        .filter(production_at.company_id == company_code)
        .all()
    )

    return templates.TemplateResponse(
        request=request,
        name="criteria/coldstore_locations.html",
        context={
            "today_data": rows,
            "production_at_list": plants,  # 👈     !
            "email": email,
            "company_id": company_code,
            "message": "",
        },
    )

# ---------------------------------------------------------
# SAVE / UPDATE (🔥 Production For & Production At Integrated)
# ---------------------------------------------------------
@router.post("/coldstore_locations")
def save_coldstore_location(
    request: Request,
    location_name: str = Form(...),
    production_for: str = Form(...),  # 👈 New Premium Column Form Data
    production_at: str = Form(...),   # 👈 New Premium Column Form Data
    id: str = Form(""),
    date: str = Form(""),
    time: str = Form(""),
    db: Session = Depends(get_db),
):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    # Safe ID conversion
    record_id = int(id) if id and id.isdigit() else None

    # 🟢 🔴 DUPLICATE CHECK: Validated against specific corporate entity and specific plant floor location
    duplicate = (
        db.query(coldstore_locations)
        .filter(
            coldstore_locations.coldstore_location == location_name,
            coldstore_locations.production_for == production_for,  # 👈 Added to duplicate gate lock
            coldstore_locations.production_at == production_at,    # 👈 Added to duplicate gate lock
            coldstore_locations.company_id == company_code,
            coldstore_locations.id != record_id,
        )
        .first()
    )

    if duplicate:
        return JSONResponse(
            {"error": f"Location '{location_name}' already exists for {production_for} at {production_at}!"},
            status_code=400,
        )

    # UPDATE
    if record_id:
        row = (
            db.query(coldstore_locations)
            .filter(
                coldstore_locations.id == record_id,
                coldstore_locations.company_id == company_code,
            )
            .first()
        )

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        # Original states updated cleanly
        row.coldstore_location = location_name
        row.production_for = production_for  # 👈 Sync Update
        row.production_at = production_at    # 👈 Sync Update
        row.date = date
        row.time = time
        row.email = email

    # INSERT
    else:
        new_row = coldstore_locations(
            coldstore_location=location_name,
            production_for=production_for,  # 👈 Enforce new column context mappings
            production_at=production_at,    # 👈 Enforce new column context mappings
            date=date,
            time=time,
            email=email,
            company_id=company_code,
        )
        db.add(new_row)

    db.commit()
    return JSONResponse({"success": True})


# ---------------------------------------------------------
# DELETE
# ---------------------------------------------------------
@router.post("/coldstore_locations/delete/{id}")
def delete_coldstore_location(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    if not company_code:
        return JSONResponse({"error": "Session Invalid"}, status_code=401)

    db.query(coldstore_locations).filter(
        coldstore_locations.id == id, coldstore_locations.company_id == company_code
    ).delete()

    db.commit()
    return JSONResponse({"status": "ok"})