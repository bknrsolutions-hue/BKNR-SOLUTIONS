# app/routers/criteria/coldstore_locations.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse, JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.criteria import coldstore_locations

router = APIRouter(tags=["COLDSTORE LOCATIONS"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE – LOAD
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

    return templates.TemplateResponse(
        "criteria/coldstore_locations.html",
        {
            "request": request,
            "today_data": rows,
            "email": email,
            "company_id": company_code,
            "message": ""
        }
    )


# ---------------------------------------------------------
# SAVE / UPDATE
# ---------------------------------------------------------
@router.post("/coldstore_locations")
def save_coldstore_location(
    request: Request,
    location_name: str = Form(...),
    id: str = Form(""),
    date: str = Form(""),
    time: str = Form(""),
    db: Session = Depends(get_db)
):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    # Safe ID conversion
    record_id = int(id) if id and id.isdigit() else None

    # Duplicate check
    duplicate = db.query(coldstore_locations).filter(
        coldstore_locations.coldstore_location == location_name,
        coldstore_locations.company_id == company_code,
        coldstore_locations.id != record_id
    ).first()

    if duplicate:
        return JSONResponse({"error": f"Location '{location_name}' already exists!"}, status_code=400)

    # UPDATE
    if record_id:
        row = db.query(coldstore_locations).filter(
            coldstore_locations.id == record_id,
            coldstore_locations.company_id == company_code
        ).first()

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        row.coldstore_location = location_name
        row.date = date
        row.time = time
        row.email = email

    # INSERT
    else:
        new_row = coldstore_locations(
            coldstore_location=location_name,
            date=date,
            time=time,
            email=email,
            company_id=company_code
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
        coldstore_locations.id == id,
        coldstore_locations.company_id == company_code
    ).delete()

    db.commit()

    return JSONResponse({"status": "ok"})
