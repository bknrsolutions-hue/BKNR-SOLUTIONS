# app/routers/criteria/contractors.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.criteria import contractors   # <-- LOWERCASE MODEL

router = APIRouter(tags=["CONTRACTORS"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# SHOW PAGE (COMPANY WISE)
# ---------------------------------------------------------
@router.get("/contractors")
def contractors_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("user_email")
    company_id = request.session.get("company_id")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    today_data = db.query(contractors).filter(
        contractors.company_id == company_id
    ).order_by(contractors.id.desc()).all()

    return templates.TemplateResponse("criteria/contractors.html", {
        "request": request,
        "today_data": today_data,
        "email": email,
        "company_id": company_id,
        "message": ""
    })


# ---------------------------------------------------------
# SAVE / UPDATE CONTRACTOR
# ---------------------------------------------------------
@router.post("/contractors")
def save_contractor(
    request: Request,
    contractor_name: str = Form(...),
    phone: str = Form(""),
    address: str = Form(""),
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

    # Duplicate check
    duplicate = db.query(contractors).filter(
        contractors.contractor_name == contractor_name,
        contractors.company_id == company_id,
        contractors.id != id
    ).first()

    if duplicate:
        return JSONResponse({"error": f"'{contractor_name}' already exists!"}, status_code=400)

    # UPDATE
    if id:
        row = db.query(contractors).filter(
            contractors.id == id,
            contractors.company_id == company_id
        ).first()

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        row.contractor_name = contractor_name
        row.phone = phone
        row.address = address
        row.date = date
        row.time = time
        row.email = email

    # INSERT
    else:
        new_row = contractors(
            contractor_name=contractor_name,
            phone=phone,
            address=address,
            date=date,
            time=time,
            email=email,
            company_id=company_id
        )
        db.add(new_row)

    db.commit()
    return JSONResponse({"success": True})


# ---------------------------------------------------------
# DELETE CONTRACTOR
# ---------------------------------------------------------
@router.post("/contractors/delete/{id}")
def delete_contractor(id: int, request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_id")

    if not company_id:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    db.query(contractors).filter(
        contractors.id == id,
        contractors.company_id == company_id
    ).delete()

    db.commit()

    return JSONResponse({"status": "ok"})
