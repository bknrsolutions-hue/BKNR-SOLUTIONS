# app/routers/criteria/freezers.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.criteria import freezers   # <-- SMALL LETTER MODEL

router = APIRouter(tags=["FREEZERS"])
templates = Jinja2Templates(directory="app/templates")


@router.get("/freezers")
def freezer_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("user_email")
    company_id = request.session.get("company_id")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    today_data = (
        db.query(freezers)
        .filter(freezers.company_id == company_id)
        .order_by(freezers.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/freezers.html",
        {
            "request": request,
            "today_data": today_data,
            "email": email,
            "company_id": company_id,
            "message": "",
        },
    )


@router.post("/freezers")
def save_freezer(
    request: Request,
    freezer_name: str = Form(...),
    capacity: float = Form(0.0),
    location: str = Form(""),
    id: int = Form(None),
    date: str = Form(...),
    time: str = Form(...),
    email: str = Form(""),
    company_id: str = Form(""),
    db: Session = Depends(get_db),
):

    session_email = request.session.get("user_email")
    session_company_id = request.session.get("company_id")

    if not session_email or not session_company_id:
        return JSONResponse({"error": "Session expired!"}, status_code=401)

    email = session_email
    company_id = session_company_id

    duplicate = (
        db.query(freezers)
        .filter(
            freezers.freezer_name == freezer_name,
            freezers.company_id == company_id,
            freezers.id != id,
        )
        .first()
    )

    if duplicate:
        return JSONResponse(
            {"error": f"Freezer '{freezer_name}' already exists!"}, status_code=400
        )

    if id:
        row = (
            db.query(freezers)
            .filter(freezers.id == id, freezers.company_id == company_id)
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

    else:
        new_row = freezers(
            freezer_name=freezer_name,
            capacity=capacity,
            location=location,
            date=date,
            time=time,
            email=email,
            company_id=company_id,
        )
        db.add(new_row)

    db.commit()
    return JSONResponse({"success": True})


@router.post("/freezers/delete/{id}")
def delete_freezer(id: int, request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_id")
    if not company_id:
        return JSONResponse({"error": "Session expired!"}, status_code=401)

    db.query(freezers).filter(
        freezers.id == id, freezers.company_id == company_id
    ).delete()

    db.commit()
    return JSONResponse({"status": "ok"})
