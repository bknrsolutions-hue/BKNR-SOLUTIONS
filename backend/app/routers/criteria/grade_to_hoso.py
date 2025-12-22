from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
import math

from app.database import get_db
from app.database.models.criteria import (
    grades,
    varieties,
    glazes,
    species,
    grade_to_hoso
)

router = APIRouter(
    prefix="/grade_to_hoso",
    tags=["GRADE TO HOSO"]
)

templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE LOAD
# ---------------------------------------------------------
@router.get("")
def page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_id = request.session.get("company_code")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    grade_list = [g.grade_name for g in db.query(grades)
                  .filter(grades.company_id == company_id).all()]

    variety_list = db.query(varieties)\
        .filter(varieties.company_id == company_id).all()

    glaze_list = [g.glaze_name for g in db.query(glazes)
                  .filter(glazes.company_id == company_id).all()]

    species_list = [s.species_name for s in db.query(species)
                    .filter(species.company_id == company_id).all()]

    rows = db.query(grade_to_hoso)\
        .filter(grade_to_hoso.company_id == company_id)\
        .order_by(grade_to_hoso.id.desc())\
        .all()

    return templates.TemplateResponse(
        "criteria/grade_to_hoso.html",
        {
            "request": request,
            "grades": grade_list,
            "varieties": variety_list,
            "glazes": glaze_list,
            "species": species_list,
            "rows": rows
        }
    )


# ---------------------------------------------------------
# SAVE / CALCULATE
# ---------------------------------------------------------
@router.post("")
def save(
    request: Request,
    species: str = Form(...),
    grade_name: str = Form(...),
    variety_name: str = Form(...),
    glaze_name: str = Form(...),
    db: Session = Depends(get_db)
):

    email = request.session.get("email")
    company_id = request.session.get("company_code")

    if not email or not company_id:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    # ================= GRADE ORDER =================
    GRADE_ORDER = [
        "8/12","13/15","16/20","21/25","26/30","31/35",
        "31/40","41/50","51/60","61/70","71/90",
        "91/110","111/130","131/150","100/200",
        "20/40","40/60","60/80","80/120","BKN","DC"
    ]

    # ---------------- CALCULATION ----------------
    if grade_name in ["BKN", "DC"]:
        hlso = 0
        hoso = 0
        nw_grade = grade_name

    else:
        # HIGHER COUNT (16/20 → 20)
        high = int(grade_name.split("/")[-1])

        # GLAZE FACTOR
        if glaze_name == "NWNC":
            glaze_factor = 1
        else:
            glaze_factor = (100 - float(glaze_name.replace("%", ""))) / 100

        # VARIETY YIELDS
        var = db.query(varieties).filter(
            varieties.company_id == company_id,
            varieties.variety_name == variety_name
        ).first()

        peel = (float(var.peeling_yield or 100)) / 100
        soak = (float(var.soaking_yield or 100)) / 100

        # HLSO (ROUND DOWN)
        hlso = math.floor(high / glaze_factor / peel / soak)

        # HOSO RULE
        if hlso <= 40:
            minus = 1
        elif hlso <= 70:
            minus = 2
        elif hlso <= 110:
            minus = 5
        else:
            minus = 15

        hoso = int((hlso * 1.54) - minus)

        # ---------- NW GRADE AUTO UPGRADE ----------
        try:
            idx = GRADE_ORDER.index(grade_name)
        except ValueError:
            idx = 0

        if hlso <= 20:
            step = 0
        elif hlso <= 50:
            step = 1
        elif hlso <= 70:
            step = 2
        else:
            step = 3

        nw_idx = min(idx + step, len(GRADE_ORDER) - 1)
        nw_grade = GRADE_ORDER[nw_idx]

    # ---------------- UPSERT ----------------
    row = db.query(grade_to_hoso).filter(
        grade_to_hoso.company_id == company_id,
        grade_to_hoso.species == species,
        grade_to_hoso.grade_name == grade_name,
        grade_to_hoso.variety_name == variety_name,
        grade_to_hoso.glaze_name == glaze_name
    ).first()

    if row:
        row.hlso_count = hlso
        row.hoso_count = hoso
        row.nw_grade = nw_grade
    else:
        db.add(
            grade_to_hoso(
                species=species,
                grade_name=grade_name,
                variety_name=variety_name,
                glaze_name=glaze_name,
                hlso_count=hlso,
                hoso_count=hoso,
                nw_grade=nw_grade,
                email=email,
                company_id=company_id
            )
        )

    db.commit()
    return RedirectResponse("/criteria/grade_to_hoso", status_code=302)
