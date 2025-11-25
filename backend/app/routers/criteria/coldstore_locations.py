from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.criteria import coldstore_locations

router = APIRouter(tags=["COLDSTORE LOCATIONS"])   # <-- FIXED
templates = Jinja2Templates(directory="app/templates")


@router.get("/coldstore_locations")
def coldstore_locations_page(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("user_email")
    company_id = request.session.get("company_id")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    rows = db.query(coldstore_locations).filter(
        coldstore_locations.company_id == company_id
    ).order_by(coldstore_locations.id.desc()).all()

    return templates.TemplateResponse(
        "criteria/coldstore_locations.html",
        {
            "request": request,
            "today_data": rows,
            "email": email,
            "company_id": company_id,
        }
    )


@router.post("/coldstore_locations")
def save(
    request: Request,
    location_name: str = Form(...),
    id: int = Form(None),
    date: str = Form(...),
    time: str = Form(...),
    email: str = Form(""),
    company_id: str = Form(""),
    db: Session = Depends(get_db)
):

    session_email = request.session.get("user_email")
    session_company_id = request.session.get("company_id")

    email = session_email
    company_id = session_company_id

    duplicate = db.query(coldstore_locations).filter(
        coldstore_locations.coldstore_location == location_name,
        coldstore_locations.company_id == company_id,
        coldstore_locations.id != id
    ).first()

    if duplicate:
        return JSONResponse({"error": "Already exists"}, status_code=400)

    if id:
        row = db.query(coldstore_locations).filter(
            coldstore_locations.id == id,
            coldstore_locations.company_id == company_id
        ).first()

        if not row:
            return JSONResponse({"error": "Not found"}, status_code=404)

        row.coldstore_location = location_name
        row.date = date
        row.time = time
        row.email = email

    else:
        new_row = coldstore_locations(
            coldstore_location=location_name,
            date=date,
            time=time,
            email=email,
            company_id=company_id
        )
        db.add(new_row)

    db.commit()
    return JSONResponse({"success": True})


@router.post("/coldstore_locations/delete/{id}")
def delete(id: int, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_id")

    db.query(coldstore_locations).filter(
        coldstore_locations.id == id,
        coldstore_locations.company_id == company_id
    ).delete()

    db.commit()
    return JSONResponse({"status": "ok"})
