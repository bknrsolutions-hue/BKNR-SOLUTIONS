from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime
from starlette.status import HTTP_303_SEE_OTHER

from app.database import get_db
from app.database.models.criteria import peeling_rates, species, varieties, contractors

router = APIRouter(tags=["PEELING RATES"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE LOAD (COMPANY WISE)
# ---------------------------------------------------------
@router.get("/peeling_rates")
def peeling_rates_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_id = request.session.get("company_code")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    lookup_data = {
        "species": [s[0] for s in db.query(species.species_name)
                    .filter(species.company_id == company_id).all()],
        "varieties": [v[0] for v in db.query(varieties.variety_name)
                      .filter(varieties.company_id == company_id).all()],
        "contractors": [c[0] for c in db.query(contractors.contractor_name)
                        .filter(contractors.company_id == company_id).all()],
    }

    rows = (
        db.query(peeling_rates)
        .filter(peeling_rates.company_id == company_id)
        .order_by(peeling_rates.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/peeling_rates.html",
        {
            "request": request,
            "lookup_data": lookup_data,
            "today_data": rows,
            "email": email,
            "company_id": company_id,
        }
    )


# ---------------------------------------------------------
# SAVE / UPDATE (RANGE SUPPORT + REDIRECT)
# ---------------------------------------------------------
@router.post("/peeling_rates")
def save_peeling_rate(
    request: Request,
    species: str = Form(...),
    variety_name: str = Form(...),
    contractor_name: str = Form(...),
    hlso_count: str = Form(...),     # 10 / 10 to 20
    rate: float = Form(...),
    effective_from: str = Form(...),
    id: str = Form(""),
    db: Session = Depends(get_db)
):

    email = request.session.get("email")
    company_id = request.session.get("company_code")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    now = datetime.now()
    date = now.date()
    time = now.time()

    # ---------- RANGE PARSE ----------
    counts = []
    if "to" in hlso_count.lower():
        a, b = hlso_count.lower().replace(" ", "").split("to")
        counts = range(int(a), int(b) + 1)
    else:
        counts = [int(hlso_count)]

    # ---------- EDIT MODE DELETE ----------
    if id and id.isdigit():
        base = db.query(peeling_rates).filter(
            peeling_rates.id == int(id),
            peeling_rates.company_id == company_id
        ).first()

        if base:
            db.query(peeling_rates).filter(
                peeling_rates.company_id == company_id,
                peeling_rates.species == base.species,
                peeling_rates.variety_name == base.variety_name,
                peeling_rates.contractor_name == base.contractor_name,
                peeling_rates.effective_from == base.effective_from
            ).delete()

    # ---------- INSERT ----------
    for c in counts:
        exists = db.query(peeling_rates).filter(
            peeling_rates.company_id == company_id,
            peeling_rates.species == species,
            peeling_rates.variety_name == variety_name,
            peeling_rates.contractor_name == contractor_name,
            peeling_rates.hlso_count == str(c),
            peeling_rates.effective_from == effective_from
        ).first()

        if exists:
            continue

        db.add(peeling_rates(
            species=species,
            variety_name=variety_name,
            contractor_name=contractor_name,
            hlso_count=str(c),
            rate=rate,
            effective_from=effective_from,
            date=date,
            time=time,
            email=email,
            company_id=company_id
        ))

    db.commit()

    # ✅ IMPORTANT – REDIRECT AFTER SAVE
    return RedirectResponse(
        url="/criteria/peeling_rates",
        status_code=HTTP_303_SEE_OTHER
    )


# ---------------------------------------------------------
# DELETE (FULL RANGE GROUP)
# ---------------------------------------------------------
@router.post("/peeling_rates/delete/{id}")
def delete_peeling_rate(id: int, request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_code")

    base = db.query(peeling_rates).filter(
        peeling_rates.id == id,
        peeling_rates.company_id == company_id
    ).first()

    if not base:
        return JSONResponse({"error": "Not found"}, status_code=404)

    db.query(peeling_rates).filter(
        peeling_rates.company_id == company_id,
        peeling_rates.species == base.species,
        peeling_rates.variety_name == base.variety_name,
        peeling_rates.contractor_name == base.contractor_name,
        peeling_rates.effective_from == base.effective_from
    ).delete()

    db.commit()
    return JSONResponse({"status": "ok"})
