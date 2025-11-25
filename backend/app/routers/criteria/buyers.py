# app/routers/criteria/buyers.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse, JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.criteria import buyers   # <-- lowercase model

# ❗IMPORTANT: NO PREFIX HERE (prefix handled in criteria_router)
router = APIRouter(tags=["BUYERS"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE – SHOW BUYERS
# ---------------------------------------------------------
@router.get("/buyers")
def buyers_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("user_email")
    company_id = request.session.get("company_id")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    today_data = db.query(buyers).filter(
        buyers.company_id == company_id
    ).order_by(buyers.id.desc()).all()

    return templates.TemplateResponse(
        "criteria/buyers.html",
        {
            "request": request,
            "today_data": today_data,
            "email": email,
            "company_id": company_id,
            "message": ""
        }
    )


# ---------------------------------------------------------
# SAVE / UPDATE BUYER
# ---------------------------------------------------------
@router.post("/buyers")
def save_buyer(
    request: Request,
    buyer_name: str = Form(...),
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

    # DUPLICATE CHECK
    duplicate = db.query(buyers).filter(
        buyers.buyer_name == buyer_name,
        buyers.company_id == company_id,
        buyers.id != id
    ).first()

    if duplicate:
        return JSONResponse(
            {"error": f"Buyer '{buyer_name}' already exists!"},
            status_code=400
        )

    # UPDATE
    if id:
        row = db.query(buyers).filter(
            buyers.id == id,
            buyers.company_id == company_id
        ).first()

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        row.buyer_name = buyer_name
        row.date = date
        row.time = time
        row.email = email

    # INSERT
    else:
        new_row = buyers(
            buyer_name=buyer_name,
            date=date,
            time=time,
            email=email,
            company_id=company_id
        )
        db.add(new_row)

    db.commit()
    return JSONResponse({"success": True})


# ---------------------------------------------------------
# DELETE BUYER
# ---------------------------------------------------------
@router.post("/buyers/delete/{id}")
def delete_buyer(id: int, request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_id")

    if not company_id:
        return JSONResponse({"error": "Session invalid"}, status_code=401)

    db.query(buyers).filter(
        buyers.id == id,
        buyers.company_id == company_id
    ).delete()

    db.commit()

    return JSONResponse({"status": "ok"})
