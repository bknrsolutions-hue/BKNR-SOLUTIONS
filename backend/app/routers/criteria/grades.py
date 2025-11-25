# app/routers/criteria/grades.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.criteria import grades   # <-- LOWERCASE MODEL

# No prefix here (handled in criteria_router)
router = APIRouter(tags=["GRADES"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE
# ---------------------------------------------------------
@router.get("/grades")
def grades_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("user_email")
    company_id = request.session.get("company_id")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    today_data = db.query(grades).filter(
        grades.company_id == company_id
    ).order_by(grades.id.desc()).all()

    return templates.TemplateResponse(
        "criteria/grades.html",
        {
            "request": request,
            "today_data": today_data,
            "email": email,
            "company_id": company_id,
            "message": ""
        }
    )


# ---------------------------------------------------------
# SAVE / UPDATE
# ---------------------------------------------------------
@router.post("/grades")
def save_grade(
    request: Request,
    grade_name: str = Form(...),
    id: int = Form(None),
    date: str = Form(...),
    time: str = Form(...),
    email: str = Form(""),
    company_id: str = Form(""),
    db: Session = Depends(get_db)
):

    session_email = request.session.get("user_email")
    session_company_id = request.session.get("company_id")

    if not session_email or not session_company_id:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    email = session_email
    company_id = session_company_id

    # Duplicate Check
    duplicate = db.query(grades).filter(
        grades.grade_name == grade_name,
        grades.company_id == company_id,
        grades.id != id
    ).first()

    if duplicate:
        return JSONResponse(
            {"error": f"Grade '{grade_name}' already exists!"},
            status_code=400
        )

    # UPDATE
    if id:
        row = db.query(grades).filter(
            grades.id == id,
            grades.company_id == company_id
        ).first()

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        row.grade_name = grade_name
        row.date = date
        row.time = time
        row.email = email

    # INSERT
    else:
        new_row = grades(
            grade_name=grade_name,
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
@router.post("/grades/delete/{id}")
def delete_grade(id: int, request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_id")

    if not company_id:
        return JSONResponse({"error": "Session expired!"}, status_code=401)

    db.query(grades).filter(
        grades.id == id,
        grades.company_id == company_id
    ).delete()

    db.commit()

    return JSONResponse({"status": "ok"})
