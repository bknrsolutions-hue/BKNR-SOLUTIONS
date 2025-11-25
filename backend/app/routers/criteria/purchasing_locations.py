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


@router.get("/purchasing_locations")
def page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("user_email")
    company_id = request.session.get("company_id")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    rows = (
        db.query(purchasing_locations)
        .filter(purchasing_locations.company_id == company_id)
        .order_by(purchasing_locations.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/purchasing_locations.html",
        {
            "request": request,
            "today_data": rows,
            "email": email,
            "company_id": company_id
        }
    )


# ---------------------------------------------------------
# SAVE / UPDATE
# ---------------------------------------------------------
@router.post("/purchasing_locations")
async def save(
    request: Request,

    location_name: str = Form(...),

    id: str = Form(""),

    date: str = Form(""),
    time: str = Form(""),
    email: str = Form(""),
    company_id: str = Form(""),

    db: Session = Depends(get_db)
):

    # Convert id
    record_id = int(id) if id and id.isdigit() else None

    # SESSION DATA
    session_email = request.session.get("user_email")
    session_company_id = request.session.get("company_id")

    if not session_email or not session_company_id:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    email = session_email
    company_id = session_company_id

    # AUTO DATE/TIME FIX (IMPORTANT)
    now = datetime.now()
    if not date:
        date = now.strftime("%Y-%m-%d")

    if not time:
        time = now.strftime("%H:%M:%S")

    # DUPLICATE CHECK
    dup = (
        db.query(purchasing_locations)
        .filter(
            purchasing_locations.location_name == location_name,
            purchasing_locations.company_id == company_id,
            purchasing_locations.id != record_id
        )
        .first()
    )

    if dup:
        return JSONResponse({"error": "Location already exists!"}, status_code=400)

    # UPDATE
    if record_id:
        row = (
            db.query(purchasing_locations)
            .filter(
                purchasing_locations.id == record_id,
                purchasing_locations.company_id == company_id
            )
            .first()
        )

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

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
            company_id=company_id
        )
        db.add(new_row)

    db.commit()
    return JSONResponse({"success": True})


# ---------------------------------------------------------
# DELETE
# ---------------------------------------------------------
@router.post("/purchasing_locations/delete/{id}")
def delete(id: int, request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_id")
    if not company_id:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    db.query(purchasing_locations).filter(
        purchasing_locations.id == id,
        purchasing_locations.company_id == company_id
    ).delete()

    db.commit()
    return JSONResponse({"status": "ok"})
