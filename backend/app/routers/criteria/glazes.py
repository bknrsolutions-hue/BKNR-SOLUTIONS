# app/routers/criteria/glazes.py

from app.services.grade_to_hoso_sync import sync_grade_to_hoso
from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.criteria import glazes

router = APIRouter(tags=["GLAZES"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE – SHOW GLAZES
# ---------------------------------------------------------
@router.get("/glazes")
def glazes_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

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
    id: str = Form(""),
    date: str = Form(""),
    time: str = Form(""),
    db: Session = Depends(get_db),
):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    record_id = int(id) if id and id.isdigit() else None

    now = datetime.now()
    date = date or now.strftime("%Y-%m-%d")
    time = time or now.strftime("%H:%M:%S")

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
        db.add(glazes(
            glaze_name=glaze_name,
            date=date,
            time=time,
            email=email,
            company_id=company_code
        ))

    db.commit()

    # 🔥 AUTO GENERATE / SYNC GRADE → HOSO COMBINATIONS
    sync_grade_to_hoso(db, company_code, email)

    return JSONResponse({"success": True})


# ---------------------------------------------------------
# DELETE GLAZE
# ---------------------------------------------------------
@router.post("/glazes/delete/{id}")
def delete_glaze(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")
    email = request.session.get("email")

    if not company_code or not email:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    db.query(glazes).filter(
        glazes.id == id,
        glazes.company_id == company_code
    ).delete()

    db.commit()

    # 🔥 RE-SYNC AFTER DELETE
    sync_grade_to_hoso(db, company_code, email)

    return JSONResponse({"status": "ok"})
