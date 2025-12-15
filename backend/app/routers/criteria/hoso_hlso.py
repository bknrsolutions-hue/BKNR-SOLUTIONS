# app/routers/criteria/hoso_hlso.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.criteria import HOSO_HLSO_Yields, species

router = APIRouter(tags=["HOSO → HLSO YIELDS"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE LOAD (COMPANY WISE)
# ---------------------------------------------------------
@router.get("/hoso_hlso")
def hoso_hlso_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_id = request.session.get("company_code")

    if not email or not company_id:
        return RedirectResponse("/", status_code=302)

    species_list = [
        s[0] for s in
        db.query(species.species_name)
        .filter(species.company_id == company_id)
        .order_by(species.species_name)
        .all()
    ]

    rows = (
        db.query(HOSO_HLSO_Yields)
        .filter(HOSO_HLSO_Yields.company_id == company_id)
        .order_by(HOSO_HLSO_Yields.hoso_count)
        .all()
    )

    return templates.TemplateResponse(
        "criteria/hoso_hlso.html",
        {
            "request": request,
            "today_data": rows,
            "species_list": species_list,
            "email": email,
            "company_id": company_id
        }
    )


# ---------------------------------------------------------
# SAVE (SINGLE OR RANGE)
# ---------------------------------------------------------
@router.post("/hoso_hlso")
def save_hoso_hlso(
    request: Request,
    species: str = Form(...),
    hoso_count: str = Form(...),          # can be "10" or "10 to 20"
    hlso_yield_pct: float = Form(...),
    db: Session = Depends(get_db)
):

    email = request.session.get("email")
    company_id = request.session.get("company_code")

    if not email or not company_id:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    # -----------------------------
    # PARSE RANGE
    # -----------------------------
    counts = []
    hoso_count = hoso_count.strip().lower()

    if "to" in hoso_count:
        start, end = hoso_count.split("to")
        start = int(start.strip())
        end = int(end.strip())
        counts = list(range(start, end + 1))
    else:
        counts = [int(hoso_count)]

    now = datetime.now()

    # -----------------------------
    # SAVE EACH COUNT INDIVIDUALLY
    # -----------------------------
    for c in counts:

        row = (
            db.query(HOSO_HLSO_Yields)
            .filter(
                HOSO_HLSO_Yields.company_id == company_id,
                HOSO_HLSO_Yields.species == species,
                HOSO_HLSO_Yields.hoso_count == c
            )
            .first()
        )

        # UPDATE IF EXISTS
        if row:
            row.hlso_yield_pct = hlso_yield_pct
            row.date = now.date()
            row.time = now.time()
            row.email = email

        # INSERT NEW
        else:
            db.add(
                HOSO_HLSO_Yields(
                    species=species,
                    hoso_count=c,
                    hlso_yield_pct=hlso_yield_pct,
                    date=now.date(),
                    time=now.time(),
                    email=email,
                    company_id=company_id
                )
            )

    db.commit()
    return JSONResponse({"success": True})


# ---------------------------------------------------------
# DELETE (SINGLE)
# ---------------------------------------------------------
@router.post("/hoso_hlso/delete/{id}")
def delete_hoso_hlso(
    id: int,
    request: Request,
    db: Session = Depends(get_db)
):

    company_id = request.session.get("company_code")
    if not company_id:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    db.query(HOSO_HLSO_Yields).filter(
        HOSO_HLSO_Yields.id == id,
        HOSO_HLSO_Yields.company_id == company_id
    ).delete()

    db.commit()
    return JSONResponse({"status": "ok"})
