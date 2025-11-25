# app/routers/criteria/grade_to_hoso.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.criteria import (
    grade_to_hoso,
    grades,
    glazes,
    varieties,
    species
)

router = APIRouter(tags=["GRADE → HOSO"])
templates = Jinja2Templates(directory="app/templates")


# -------------------------------------------------------
# PAGE LOAD
# -------------------------------------------------------
@router.get("/grade_to_hoso")
def page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("user_email")
    company_id = request.session.get("company_id")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    # LOOKUP — company-wise
    grade_list = (
        db.query(grades.grade_name)
        .filter(grades.company_id == company_id)
        .order_by(grades.grade_name)
        .all()
    )

    nwgrade_list = grade_list  # same table

    glaze_list = (
        db.query(glazes.glaze_name)
        .filter(glazes.company_id == company_id)
        .order_by(glazes.glaze_name)
        .all()
    )

    variety_list = (
        db.query(varieties.variety_name)
        .filter(varieties.company_id == company_id)
        .order_by(varieties.variety_name)
        .all()
    )

    species_list = (
        db.query(species.species_name)
        .filter(species.company_id == company_id)
        .order_by(species.species_name)
        .all()
    )

    # table rows
    rows = (
        db.query(grade_to_hoso)
        .filter(grade_to_hoso.company_id == company_id)
        .order_by(grade_to_hoso.id.desc())
        .all()
    )

    lookup = {
        "grades": [g[0] for g in grade_list],
        "nwgrades": [g[0] for g in nwgrade_list],
        "glazes": [g[0] for g in glaze_list],
        "varieties": [v[0] for v in variety_list],
        "species": [s[0] for s in species_list],
    }

    return templates.TemplateResponse(
        "criteria/grade_to_hoso.html",
        {
            "request": request,
            "today_data": rows,
            "lookup": lookup,
            "email": email,
            "company_id": company_id,
        }
    )


# -------------------------------------------------------
# SAVE / UPDATE
# -------------------------------------------------------
@router.post("/grade_to_hoso")
def save_grade_to_hoso(
    request: Request,

    grade_name: str = Form(...),
    nw_grade: str = Form(...),
    glaze_name: str = Form(...),
    variety_name: str = Form(...),
    species_name: str = Form(...),
    hoso_count: int = Form(0),
    hlso_count: int = Form(0),

    id: int = Form(None),
    date: str = Form(""),
    time: str = Form(""),

    db: Session = Depends(get_db)
):

    # session
    email = request.session.get("user_email")
    company_id = request.session.get("company_id")

    if not email or not company_id:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    # auto date/time
    now = datetime.now()
    if not date:
        date = now.strftime("%Y-%m-%d")
    if not time:
        time = now.strftime("%H:%M:%S")

    # ---------------------------------------------
    # DUPLICATE CHECK (Exactly 5 columns only)
    # ---------------------------------------------
    dup = (
        db.query(grade_to_hoso)
        .filter(
            grade_to_hoso.grade_name == grade_name,
            grade_to_hoso.nw_grade == nw_grade,
            grade_to_hoso.glaze_name == glaze_name,
            grade_to_hoso.variety_name == variety_name,
            grade_to_hoso.company_id == company_id,
            grade_to_hoso.id != id
        )
        .first()
    )

    if dup:
        return JSONResponse(
            {"error": "This Grade + NWGrade + Glaze + Variety already exists!"},
            status_code=400
        )

    # ---------------------------------------------
    # UPDATE
    # ---------------------------------------------
    if id:
        row = (
            db.query(grade_to_hoso)
            .filter(
                grade_to_hoso.id == id,
                grade_to_hoso.company_id == company_id
            )
            .first()
        )

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        row.grade_name = grade_name
        row.nw_grade = nw_grade
        row.glaze_name = glaze_name
        row.variety_name = variety_name
        row.species = species_name
        row.hoso_count = hoso_count
        row.hlso_count = hlso_count
        row.date = date
        row.time = time
        row.email = email

    # ---------------------------------------------
    # INSERT
    # ---------------------------------------------
    else:
        new_row = grade_to_hoso(
            grade_name=grade_name,
            nw_grade=nw_grade,
            glaze_name=glaze_name,
            variety_name=variety_name,
            species=species_name,
            hoso_count=hoso_count,
            hlso_count=hlso_count,
            date=date,
            time=time,
            email=email,
            company_id=company_id
        )
        db.add(new_row)

    db.commit()
    return JSONResponse({"success": True})


# -------------------------------------------------------
# DELETE
# -------------------------------------------------------
@router.post("/grade_to_hoso/delete/{id}")
def delete(id: int, request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_id")

    db.query(grade_to_hoso).filter(
        grade_to_hoso.id == id,
        grade_to_hoso.company_id == company_id
    ).delete()

    db.commit()
    return JSONResponse({"status": "ok"})
