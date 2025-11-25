# app/routers/criteria/glazes.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.criteria import glazes   # <-- LOWERCASE MODEL NAME

router = APIRouter(tags=["GLAZES"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE (COMPANY-WISE)
# ---------------------------------------------------------
@router.get("/glazes")
def glazes_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("user_email")
    company_id = request.session.get("company_id")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    today_data = db.query(glazes).filter(
        glazes.company_id == company_id
    ).order_by(glazes.id.desc()).all()

    return templates.TemplateResponse("criteria/glazes.html", {
        "request": request,
        "today_data": today_data,
        "email": email,
        "company_id": company_id,
        "message": ""
    })


# ---------------------------------------------------------
# SAVE / UPDATE
# ---------------------------------------------------------
@router.post("/glazes")
def save_glaze(
    request: Request,
    glaze_name: str = Form(...),
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
        return JSONResponse({"error": "Session expired!"}, status_code=401)

    email = session_email
    company_id = session_company_id

    # Duplicate check
    duplicate = db.query(glazes).filter(
        glazes.glaze_name == glaze_name,
        glazes.company_id == company_id,
        glazes.id != id
    ).first()

    if duplicate:
        return JSONResponse(
            {"error": f"Glaze '{glaze_name}' already exists!"},
            status_code=400
        )

    # UPDATE
    if id:
        row = db.query(glazes).filter(
            glazes.id == id,
            glazes.company_id == company_id
        ).first()

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
            company_id=company_id
        )
        db.add(new_row)

    db.commit()
    return JSONResponse({"success": True})


# ---------------------------------------------------------
# DELETE
# ---------------------------------------------------------
@router.post("/glazes/delete/{id}")
def delete_glaze(id: int, request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_id")

    if not company_id:
        return JSONResponse({"error": "Session expired!"}, status_code=401)

    db.query(glazes).filter(
        glazes.id == id,
        glazes.company_id == company_id
    ).delete()

    db.commit()

    return JSONResponse({"status": "ok"})
