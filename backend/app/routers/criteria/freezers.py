# app/routers/criteria/freezers.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.criteria import freezers   # MODEL

router = APIRouter(tags=["FREEZERS"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE – SHOW FREEZERS
# ---------------------------------------------------------
@router.get("/freezers")
def freezers_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    # session validation
    if not email or not company_code:
        return RedirectResponse("/auth/login", status_code=302)

    rows = (
        db.query(freezers)
        .filter(freezers.company_id == company_code)
        .order_by(freezers.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/freezers.html",
        {
            "request": request,
            "today_data": rows,
            "email": email,
            "company_id": company_code,
            "message": ""
        }
    )


# ---------------------------------------------------------
# SAVE / UPDATE FREEZER
# ---------------------------------------------------------
@router.post("/freezers")
def save_freezer(
    request: Request,
    freezer_name: str = Form(...),
    capacity: float = Form(0.0),
    location: str = Form(""),

    id: str = Form(""),         # SAFE STRING ID
    date: str = Form(""),
    time: str = Form(""),

    db: Session = Depends(get_db),
):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    # convert id safely
    record_id = int(id) if id and id.isdigit() else None

    # auto date / time
    now = datetime.now()
    if not date:
        date = now.strftime("%Y-%m-%d")
    if not time:
        time = now.strftime("%H:%M:%S")

    # duplicate check
    duplicate = (
        db.query(freezers)
        .filter(
            freezers.freezer_name == freezer_name,
            freezers.company_id == company_code,
            freezers.id != record_id
        )
        .first()
    )

    if duplicate:
        return JSONResponse({"error": f"Freezer '{freezer_name}' already exists!"}, status_code=400)

    # UPDATE
    if record_id:
        row = (
            db.query(freezers)
            .filter(
                freezers.id == record_id,
                freezers.company_id == company_code
            )
            .first()
        )

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        row.freezer_name = freezer_name
        row.capacity = capacity
        row.location = location
        row.date = date
        row.time = time
        row.email = email

    # INSERT
    else:
        new_row = freezers(
            freezer_name=freezer_name,
            capacity=capacity,
            location=location,
            date=date,
            time=time,
            email=email,
            company_id=company_code
        )
        db.add(new_row)

    db.commit()
    return JSONResponse({"success": True})


# ---------------------------------------------------------
# DELETE FREEZER
# ---------------------------------------------------------
@router.post("/freezers/delete/{id}")
def delete_freezer(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    if not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    db.query(freezers).filter(
        freezers.id == id,
        freezers.company_id == company_code
    ).delete()

    db.commit()
    return JSONResponse({"status": "ok"})
