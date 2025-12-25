# app/routers/criteria/peeling_at.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.criteria import peeling_at as PeelingAt

router = APIRouter(tags=["PEELING AT MASTER"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE LOAD
# ---------------------------------------------------------
@router.get("/peeling_at")
def peeling_at_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    rows = (
        db.query(PeelingAt)
        .filter(PeelingAt.company_id == company_code)
        .order_by(PeelingAt.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/peeling_at.html",
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
@router.post("/peeling_at")
def save_peeling_at(
    request: Request,

    peeling_at_name: str = Form(...),   # ✅ matches HTML
    id: str = Form(""),
    date: str = Form(""),
    time: str = Form(""),

    db: Session = Depends(get_db)
):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return JSONResponse({"error": "Session expired!"}, status_code=401)

    record_id = int(id) if id.isdigit() else None

    now = datetime.now()
    if not date:
        date = now.strftime("%Y-%m-%d")
    if not time:
        time = now.strftime("%H:%M:%S")

    # DUPLICATE CHECK
    dup = (
        db.query(PeelingAt)
        .filter(
            PeelingAt.peeling_at == peeling_at_name,
            PeelingAt.company_id == company_code,
            PeelingAt.id != (record_id if record_id else 0)
        )
        .first()
    )

    if dup:
        return JSONResponse({"error": "Already Exists!"}, status_code=400)

    # UPDATE
    if record_id:
        row = (
            db.query(PeelingAt)
            .filter(
                PeelingAt.id == record_id,
                PeelingAt.company_id == company_code
            )
            .first()
        )

        if not row:
            return JSONResponse({"error": "Not Found"}, status_code=404)

        row.peeling_at = peeling_at_name
        row.date = date
        row.time = time
        row.email = email

    # INSERT
    else:
        new_row = PeelingAt(
            peeling_at=peeling_at_name,
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
@router.post("/peeling_at/delete/{id}")
def delete_peeling_at(
    id: int,
    request: Request,
    db: Session = Depends(get_db)
):

    company_code = request.session.get("company_code")

    db.query(PeelingAt).filter(
        PeelingAt.id == id,
        PeelingAt.company_id == company_code
    ).delete()

    db.commit()
    return JSONResponse({"status": "ok"})
