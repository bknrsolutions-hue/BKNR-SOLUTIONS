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
# PAGE LOAD (COMPANY-WISE)
# ---------------------------------------------------------
@router.get("/varieties")
def varieties_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")                 # FIXED
    company_code = request.session.get("company_code")   # FIXED

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    rows = (
        db.query(varieties)
        .filter(varieties.company_id == company_code)
        .order_by(varieties.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/varieties.html",
        {
            "request": request,
            "today_data": rows,
            "email": email,
            "company_id": company_code
        }
    )


# ---------------------------------------------------------
# SAVE / UPDATE
# ---------------------------------------------------------
@router.post("/varieties")
def save_variety(
    request: Request,

    variety_name: str = Form(...),
    peeling_yield: str = Form(""),
    soaking_yield: str = Form(""),
    hoso_to_finished_yield: str = Form(""),

    id: str = Form(""),        # FIXED: incoming from JS as string
    date: str = Form(""),
    time: str = Form(""),

    db: Session = Depends(get_db)
):

    # SESSION
    email = request.session.get("email")                 
    company_code = request.session.get("company_code")   

    if not email or not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    # SAFE ID CONVERSION
    record_id = int(id) if id and id.isdigit() else None

    # AUTO DATE/TIME
    now = datetime.now()
    if not date:
        date = now.strftime("%Y-%m-%d")
    if not time:
        time = now.strftime("%H:%M:%S")

    # DUPLICATE CHECK (company-wise)
    duplicate = (
        db.query(varieties)
        .filter(
            varieties.variety_name == variety_name,
            varieties.company_id == company_code,
            varieties.id != (record_id if record_id else 0)
        )
        .first()
    )

    if duplicate:
        return JSONResponse(
            {"error": f"Variety '{variety_name}' already exists!"},
            status_code=400,
        )

    # UPDATE MODE
    if record_id:
        row = (
            db.query(varieties)
            .filter(varieties.id == record_id, varieties.company_id == company_code)
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

    # INSERT MODE
    else:
        new_row = varieties(
            variety_name=variety_name,
            peeling_yield=peeling_yield,
            soaking_yield=soaking_yield,
            hoso_to_finished_yield=hoso_to_finished_yield,
            date=date,
            time=time,
            email=email,
            company_id=company_code
        )
        db.add(new_row)

    db.commit()
    return JSONResponse({"success": True})


# ---------------------------------------------------------
# DELETE
# ---------------------------------------------------------
@router.post("/varieties/delete/{id}")
def delete_variety(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")   # FIXED

    if not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    db.query(varieties).filter(
        varieties.id == id,
        varieties.company_id == company_code
    ).delete()

    db.commit()
    return JSONResponse({"status": "ok"})
