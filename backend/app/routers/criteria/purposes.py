# app/routers/criteria/purposes.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse, JSONResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.criteria import purposes as Purposes

router = APIRouter(tags=["PURPOSES MASTER"])
templates = Jinja2Templates(directory="app/templates")


# ----------------------------------------------------------
# PAGE – COMPANY WISE
# ----------------------------------------------------------
@router.get("/purposes")
def purposes_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")             # ✔ correct
    company_code = request.session.get("company_code")  # ✔ correct

    if not email or not company_code:
        return RedirectResponse("/auth/login", status_code=302)

    rows = (
        db.query(Purposes)
        .filter(Purposes.company_id == company_code)
        .order_by(Purposes.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/purposes.html",
        {
            "request": request,
            "today_data": rows,
            "email": email,
            "company_id": company_code,
            "message": ""
        }
    )


# ----------------------------------------------------------
# SAVE / UPDATE
# ----------------------------------------------------------
@router.post("/purposes")
def save_purpose(
    request: Request,
    purpose_name: str = Form(...),
    id: str = Form(""),
    db: Session = Depends(get_db)
):

    email = request.session.get("email")            # ✔ correct
    company_code = request.session.get("company_code")  # ✔ correct

    if not email or not company_code:
        return JSONResponse({"error": "Session Expired"}, status_code=401)

    # Safe ID
    record_id = int(id) if id and id.isdigit() else None

    now = datetime.now()
    date = now.strftime("%Y-%m-%d")
    time = now.strftime("%H:%M:%S")

    # Duplicate check – company wise
    duplicate = (
        db.query(Purposes)
        .filter(
            Purposes.purpose_name == purpose_name,
            Purposes.company_id == company_code,
            Purposes.id != (record_id if record_id else 0)
        )
        .first()
    )

    if duplicate:
        return JSONResponse(
            {"error": f"'{purpose_name}' already exists!"},
            status_code=400
        )

    # UPDATE
    if record_id:
        row = (
            db.query(Purposes)
            .filter(
                Purposes.id == record_id,
                Purposes.company_id == company_code
            )
            .first()
        )

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        row.purpose_name = purpose_name
        row.date = date
        row.time = time
        row.email = email

    # INSERT
    else:
        new_row = Purposes(
            purpose_name=purpose_name,
            date=date,
            time=time,
            email=email,
            company_id=company_code
        )
        db.add(new_row)

    db.commit()
    return JSONResponse({"success": True})


# ----------------------------------------------------------
# DELETE
# ----------------------------------------------------------
@router.post("/purposes/delete/{id}")
def delete_purpose(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    if not company_code:
        return JSONResponse({"error": "Session Expired"}, status_code=401)

    db.query(Purposes).filter(
        Purposes.id == id,
        Purposes.company_id == company_code
    ).delete()

    db.commit()

    return JSONResponse({"status": "ok"})
