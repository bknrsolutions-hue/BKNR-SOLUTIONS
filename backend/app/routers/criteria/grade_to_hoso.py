from fastapi import APIRouter, Request, Depends, Form
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func
import math

from app.database import get_db
# HOSO_HLSO_Yields ని ఇంపోర్ట్ చేయడం మర్చిపోవద్దు
from app.database.models.criteria import (
    varieties,
    grade_to_hoso,
    HOSO_HLSO_Yields 
)

router = APIRouter(tags=["GRADE TO HOSO"])
templates = Jinja2Templates(directory="app/templates")

GRADE_ORDER = [
    "8/12","13/15","16/20","21/25","26/30","31/35",
    "31/40","41/50","51/60","61/70","71/90",
    "91/110","111/130","131/150","100/200",
    "20/40","40/60","60/80","80/120","BKN","DC"
]

@router.get("/grade_to_hoso")
def grade_to_hoso_report(request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    email = request.session.get("email")
    if not company_id or not email:
        return RedirectResponse("/auth/login", status_code=302)

    rows = (
        db.query(grade_to_hoso)
        .filter(grade_to_hoso.company_id == company_id)
        .order_by(
            grade_to_hoso.species,
            grade_to_hoso.grade_name,
            grade_to_hoso.variety_name,
            grade_to_hoso.glaze_name
        )
        .all()
    )
    return templates.TemplateResponse("criteria/grade_to_hoso.html", {"request": request, "rows": rows})

@router.post("/grade_to_hoso")
def save_grade_to_hoso(
    request: Request,
    species: str = Form(...),
    grade_name: str = Form(...),
    variety_name: str = Form(...),
    glaze_name: str = Form(...),
    db: Session = Depends(get_db)
):
    company_id = request.session.get("company_code")
    email = request.session.get("email")

    if not company_id or not email:
        return RedirectResponse("/auth/login", status_code=302)

    # -------- NORMALIZE --------
    s_val = species.strip()
    g_val = grade_name.strip().upper()
    v_val = variety_name.strip().upper()
    gl_val = glaze_name.strip().upper()

    if g_val in ["BKN", "DC"]:
        hlso = 0
        hoso = 0
        nw_grade = g_val
    else:
        # 1️⃣ HLSO CALCULATION (Based on Grade High Count)
        high = int(g_val.split("/")[-1])
        glaze_factor = (
            1 if gl_val == "NWNC"
            else (100 - float(gl_val.replace("%", ""))) / 100
        )

        var = db.query(varieties).filter(
            varieties.company_id == company_id,
            varieties.variety_name == v_val
        ).first()

        peel = (float(var.peeling_yield or 100)) / 100 if var else 1
        soak = (float(var.soaking_yield or 100)) / 100 if var else 1

        hlso = math.floor(high / glaze_factor / peel / soak)

        # 2️⃣ HOSO LOOKUP (Instead of Formula)
        # ఇక్కడ మనం కాలిక్యులేట్ చేసిన HLSO ని మాస్టర్ టేబుల్ లో వెతుకుతున్నాం
        yield_row = (
            db.query(HOSO_HLSO_Yields)
            .filter(
                HOSO_HLSO_Yields.company_id == company_id,
                func.lower(HOSO_HLSO_Yields.species) == s_val.lower(),
                HOSO_HLSO_Yields.hlso_count >= hlso
            )
            .order_by(HOSO_HLSO_Yields.hlso_count.asc())
            .first()
        )

        # ఒకవేళ మాస్టర్ లో దొరికితే ఆ HOSO తీసుకుంటుంది, లేదంటే 0 చూపిస్తుంది
        hoso = yield_row.hoso_count if yield_row else 0

        # 3️⃣ NW GRADE
        try:
            idx = GRADE_ORDER.index(g_val)
        except ValueError:
            idx = 0
        step = 3 if hlso > 70 else 2 if hlso > 50 else 1 if hlso > 20 else 0
        nw_grade = GRADE_ORDER[min(idx + step, len(GRADE_ORDER) - 1)]

    # -------- UPSERT --------
    row = db.query(grade_to_hoso).filter(
        grade_to_hoso.company_id == company_id,
        grade_to_hoso.species == s_val,
        grade_to_hoso.grade_name == g_val,
        grade_to_hoso.variety_name == v_val,
        grade_to_hoso.glaze_name == gl_val
    ).first()

    if row:
        row.hlso_count = hlso
        row.hoso_count = hoso
        row.nw_grade = nw_grade
    else:
        db.add(grade_to_hoso(
            species=s_val, grade_name=g_val, variety_name=v_val, glaze_name=gl_val,
            hlso_count=hlso, hoso_count=hoso, nw_grade=nw_grade,
            email=email, company_id=company_id
        ))

    db.commit()
    return RedirectResponse("/criteria/grade_to_hoso", status_code=303)