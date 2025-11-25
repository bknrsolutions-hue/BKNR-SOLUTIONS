# app/routers/criteria/chemicals.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse, JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.criteria import chemicals   # <-- lowercase model

# ❗IMPORTANT: NO prefix here (prefix added in criteria_router)
router = APIRouter(tags=["CHEMICALS"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE – SHOW CHEMICALS
# ---------------------------------------------------------
@router.get("/chemicals")
def chemicals_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("user_email")
    company_id = request.session.get("company_id")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    today_data = db.query(chemicals).filter(
        chemicals.company_id == company_id
    ).order_by(chemicals.id.desc()).all()

    return templates.TemplateResponse(
        "criteria/chemicals.html",
        {
            "request": request,
            "today_data": today_data,
            "email": email,
            "company_id": company_id,
            "message": ""
        }
    )


# ---------------------------------------------------------
# SAVE / UPDATE CHEMICAL
# ---------------------------------------------------------
@router.post("/chemicals")
def save_chemical(
    request: Request,
    chemical_name: str = Form(...),
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
    duplicate = db.query(chemicals).filter(
        chemicals.chemical_name == chemical_name,
        chemicals.company_id == company_id,
        chemicals.id != id
    ).first()

    if duplicate:
        return JSONResponse(
            {"error": f"Chemical '{chemical_name}' already exists!"},
            status_code=400
        )

    # UPDATE
    if id:
        row = db.query(chemicals).filter(
            chemicals.id == id,
            chemicals.company_id == company_id
        ).first()

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        row.chemical_name = chemical_name
        row.date = date
        row.time = time
        row.email = email

    # INSERT
    else:
        new_row = chemicals(
            chemical_name=chemical_name,
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
@router.post("/chemicals/delete/{id}")
def delete_chemical(id: int, request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_id")

    if not company_id:
        return JSONResponse({"error": "Session invalid"}, status_code=401)

    db.query(chemicals).filter(
        chemicals.id == id,
        chemicals.company_id == company_id
    ).delete()

    db.commit()

    return JSONResponse({"status": "ok"})
