# app/routers/criteria/vehicle_numbers.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.criteria import vehicle_numbers

router = APIRouter(tags=["VEHICLE NUMBERS"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE
# ---------------------------------------------------------
@router.get("/vehicle_numbers")
def page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("user_email")
    company_id = request.session.get("company_id")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    rows = (
        db.query(vehicle_numbers)
        .filter(vehicle_numbers.company_id == company_id)
        .order_by(vehicle_numbers.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/vehicle_numbers.html",
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
@router.post("/vehicle_numbers")
async def save(
    request: Request,

    vehicle_number: str = Form(...),

    id: str = Form(""),

    date: str = Form(""),
    time: str = Form(""),
    email: str = Form(""),
    company_id: str = Form(""),

    db: Session = Depends(get_db)
):

    # ID FIX (no 422)
    record_id = int(id) if id and id.isdigit() else None

    # SESSION FIX
    session_email = request.session.get("user_email")
    session_company_id = request.session.get("company_id")

    if not session_email or not session_company_id:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    email = session_email
    company_id = session_company_id

    # AUTO DATE & TIME FIX
    now = datetime.now()
    if not date:
        date = now.strftime("%Y-%m-%d")
    if not time:
        time = now.strftime("%H:%M:%S")

    # DUPLICATE CHECK
    dup = (
        db.query(vehicle_numbers)
        .filter(
            vehicle_numbers.vehicle_number == vehicle_number,
            vehicle_numbers.company_id == company_id,
            vehicle_numbers.id != record_id
        )
        .first()
    )

    if dup:
        return JSONResponse({"error": "Vehicle number already exists!"}, status_code=400)

    # UPDATE
    if record_id:
        row = (
            db.query(vehicle_numbers)
            .filter(
                vehicle_numbers.id == record_id,
                vehicle_numbers.company_id == company_id
            )
            .first()
        )

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        row.vehicle_number = vehicle_number
        row.date = date
        row.time = time
        row.email = email

    # INSERT
    else:
        new_row = vehicle_numbers(
            vehicle_number=vehicle_number,
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
@router.post("/vehicle_numbers/delete/{id}")
def delete(id: int, request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_id")
    if not company_id:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    db.query(vehicle_numbers).filter(
        vehicle_numbers.id == id,
        vehicle_numbers.company_id == company_id
    ).delete()

    db.commit()
    return JSONResponse({"status": "ok"})
