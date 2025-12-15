from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.criteria import vehicle_numbers

router = APIRouter(tags=["VEHICLE NUMBERS"])   # FIXED: prefix removed
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE LOAD
# ---------------------------------------------------------
@router.get("/vehicle_numbers")
def page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/auth/login", status_code=302)

    rows = (
        db.query(vehicle_numbers)
        .filter(vehicle_numbers.company_id == company_code)
        .order_by(vehicle_numbers.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/vehicle_numbers.html",
        {
            "request": request,
            "today_data": rows,
            "email": email,
            "company_id": company_code
        }
    )


# ---------------------------------------------------------
# SAVE / UPDATE
# ---------------------------------------------------------
@router.post("/vehicle_numbers")
async def save_vehicle(
    request: Request,
    vehicle_number: str = Form(...),
    id: str = Form(""),
    date: str = Form(""),
    time: str = Form(""),
    db: Session = Depends(get_db)
):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    # safe ID
    record_id = int(id) if id.isdigit() else None

    now = datetime.now()
    if not date: date = now.strftime("%Y-%m-%d")
    if not time: time = now.strftime("%H:%M:%S")

    # DUPLICATE CHECK
    duplicate = db.query(vehicle_numbers).filter(
        vehicle_numbers.vehicle_number == vehicle_number,
        vehicle_numbers.company_id == company_code,
        vehicle_numbers.id != (record_id if record_id else 0)
    ).first()

    if duplicate:
        return JSONResponse({"error": "Vehicle number already exists!"}, status_code=400)

    # UPDATE MODE
    if record_id:
        row = db.query(vehicle_numbers).filter(
            vehicle_numbers.id == record_id,
            vehicle_numbers.company_id == company_code
        ).first()

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        row.vehicle_number = vehicle_number
        row.date = date
        row.time = time
        row.email = email

    # INSERT MODE
    else:
        new_row = vehicle_numbers(
            vehicle_number=vehicle_number,
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
@router.post("/vehicle_numbers/delete/{id}")
def delete_vehicle(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    if not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    db.query(vehicle_numbers).filter(
        vehicle_numbers.id == id,
        vehicle_numbers.company_id == company_code
    ).delete()

    db.commit()
    return JSONResponse({"status": "ok"})
