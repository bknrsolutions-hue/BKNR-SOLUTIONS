# app/routers/criteria/glazes.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.criteria import glazes   # MODEL

router = APIRouter(tags=["GLAZES"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE – SHOW GLAZES
# ---------------------------------------------------------
@router.get("/glazes")
def glazes_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")              # FIXED
    company_code = request.session.get("company_code")  # FIXED

    if not email or not company_code:
        return RedirectResponse("/auth/login", status_code=302)

    rows = (
        db.query(glazes)
        .filter(glazes.company_id == company_code)
        .order_by(glazes.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/glazes.html",
        {
            "request": request,
            "today_data": rows,
            "email": email,
            "company_id": company_code,
            "message": ""
        }
    )


# ---------------------------------------------------------
# SAVE / UPDATE GLAZE
# ---------------------------------------------------------
@router.post("/glazes")
def save_glaze(
    request: Request,
    glaze_name: str = Form(...),

    id: str = Form(""),        # safe string id
    date: str = Form(""),
    time: str = Form(""),

    db: Session = Depends(get_db),
):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    # convert id
    record_id = int(id) if id and id.isdigit() else None

    # auto date/time
    now = datetime.now()
    if not date:
        date = now.strftime("%Y-%m-%d")
    if not time:
        time = now.strftime("%H:%M:%S")

    # duplicate
    duplicate = (
        db.query(glazes)
        .filter(
            glazes.glaze_name == glaze_name,
            glazes.company_id == company_code,
            glazes.id != record_id
        )
        .first()
    )

    if duplicate:
        return JSONResponse(
            {"error": f"Glaze '{glaze_name}' already exists!"},
            status_code=400
        )

    # UPDATE
    if record_id:
        row = (
            db.query(glazes)
            .filter(glazes.id == record_id, glazes.company_id == company_code)
            .first()
        )

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        row.glaze_name = glaze_name
        row.date = date
        row.time = time
        row.email = email

    # INSERT
    else:
        new_row = glazes(
            glaze_name=glaze_name,
            date=date,
            time=time,
            email=email,
            company_id=company_code
        )
        db.add(new_row)

    db.commit()
    return JSONResponse({"success": True})


# ---------------------------------------------------------
# DELETE GLAZE
# ---------------------------------------------------------
@router.post("/glazes/delete/{id}")
def delete_glaze(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    if not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    db.query(glazes).filter(
        glazes.id == id,
        glazes.company_id == company_code
    ).delete()

    db.commit()

    return JSONResponse({"status": "ok"})
