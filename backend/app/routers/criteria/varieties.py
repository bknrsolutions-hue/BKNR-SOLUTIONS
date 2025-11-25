from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.criteria import varieties

router = APIRouter(tags=["VARIETIES"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE LOAD
# ---------------------------------------------------------
@router.get("/varieties")
def varieties_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("user_email")
    company_id = request.session.get("company_id")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    today_data = (
        db.query(varieties)
        .filter(varieties.company_id == company_id)
        .order_by(varieties.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/varieties.html",
        {
            "request": request,
            "today_data": today_data,
            "email": email,
            "company_id": company_id
        }
    )


# ---------------------------------------------------------
# SAVE / UPDATE VARIETY
# ---------------------------------------------------------
@router.post("/varieties")
def save_variety(
    request: Request,
    variety_name: str = Form(...),
    peeling_yield: str = Form(""),
    soaking_yield: str = Form(""),
    hoso_to_finished_yield: str = Form(""),

    date: str = Form(...),
    time: str = Form(...),

    email: str = Form(""),
    company_id: str = Form(""),

    id: int = Form(None),

    db: Session = Depends(get_db)
):

    session_email = request.session.get("user_email")
    session_company_id = request.session.get("company_id")

    if not session_email or not session_company_id:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    email = session_email
    company_id = session_company_id

    duplicate = (
        db.query(varieties)
        .filter(
            varieties.variety_name == variety_name,
            varieties.company_id == company_id,
            varieties.id != id
        )
        .first()
    )

    if duplicate:
        return JSONResponse(
            {"error": f"Variety '{variety_name}' already exists!"},
            status_code=400,
        )

    if id:
        row = (
            db.query(varieties)
            .filter(varieties.id == id, varieties.company_id == company_id)
            .first()
        )

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        row.variety_name = variety_name
        row.peeling_yield = peeling_yield
        row.soaking_yield = soaking_yield
        row.hoso_to_finished_yield = hoso_to_finished_yield
        row.date = date
        row.time = time
        row.email = email

    else:
        new_row = varieties(
            variety_name=variety_name,
            peeling_yield=peeling_yield,
            soaking_yield=soaking_yield,
            hoso_to_finished_yield=hoso_to_finished_yield,
            date=date,
            time=time,
            email=email,
            company_id=company_id,
        )
        db.add(new_row)

    db.commit()
    return JSONResponse({"success": True})


# ---------------------------------------------------------
# DELETE
# ---------------------------------------------------------
@router.post("/varieties/delete/{id}")
def delete_variety(id: int, request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_id")

    if not company_id:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    db.query(varieties).filter(
        varieties.id == id,
        varieties.company_id == company_id
    ).delete()

    db.commit()
    return JSONResponse({"status": "ok"})
