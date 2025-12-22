# app/routers/criteria/grades.py

from app.services.grade_to_hoso_sync import sync_grade_to_hoso
from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.criteria import grades

router = APIRouter(tags=["GRADES"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE – SHOW GRADES
# ---------------------------------------------------------
@router.get("/grades")
def grades_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    rows = (
        db.query(grades)
        .filter(grades.company_id == company_code)
        .order_by(grades.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/grades.html",
        {
            "request": request,
            "today_data": rows,
            "email": email,
            "company_id": company_code,
            "message": ""
        }
    )


# ---------------------------------------------------------
# SAVE / UPDATE GRADE
# ---------------------------------------------------------
@router.post("/grades")
def save_grade(
    request: Request,
    grade_name: str = Form(...),
    id: str = Form(""),
    date: str = Form(""),
    time: str = Form(""),
    db: Session = Depends(get_db)
):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    record_id = int(id) if id and id.isdigit() else None

    now = datetime.now()
    date = date or now.strftime("%Y-%m-%d")
    time = time or now.strftime("%H:%M:%S")

    # DUPLICATE CHECK
    duplicate = (
        db.query(grades)
        .filter(
            grades.grade_name == grade_name,
            grades.company_id == company_code,
            grades.id != record_id
        )
        .first()
    )

    if duplicate:
        return JSONResponse(
            {"error": f"Grade '{grade_name}' already exists!"},
            status_code=400
        )

    # UPDATE
    if record_id:
        row = (
            db.query(grades)
            .filter(grades.id == record_id, grades.company_id == company_code)
            .first()
        )

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        row.grade_name = grade_name
        row.date = date
        row.time = time
        row.email = email

    # INSERT
    else:
        db.add(grades(
            grade_name=grade_name,
            date=date,
            time=time,
            email=email,
            company_id=company_code
        ))

    db.commit()

    # 🔥 AUTO GENERATE / SYNC GRADE → HOSO
    sync_grade_to_hoso(db, company_code, email)

    return JSONResponse({"success": True})


# ---------------------------------------------------------
# DELETE GRADE
# ---------------------------------------------------------
@router.post("/grades/delete/{id}")
def delete_grade(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")
    email = request.session.get("email")

    if not company_code or not email:
        return JSONResponse({"error": "Session expired!"}, status_code=401)

    db.query(grades).filter(
        grades.id == id,
        grades.company_id == company_code
    ).delete()

    db.commit()

    # 🔥 RE-SYNC AFTER DELETE
    sync_grade_to_hoso(db, company_code, email)

    return JSONResponse({"status": "ok"})
