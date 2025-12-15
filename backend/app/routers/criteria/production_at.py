# app/routers/criteria/production_at.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.criteria import production_at as ProductionAt

router = APIRouter(tags=["PRODUCTION AT MASTER"])
templates = Jinja2Templates(directory="app/templates")


@router.get("/production_at")
def production_at_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    rows = (
        db.query(ProductionAt)
        .filter(ProductionAt.company_id == company_code)
        .order_by(ProductionAt.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/production_at.html",
        {
            "request": request,
            "today_data": rows,
            "email": email,
            "company_id": company_code
        }
    )


@router.post("/production_at")
def save_production_at(
    request: Request,

    production_at_name: str = Form(...),   # MUST MATCH HTML NAME
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

    # DUPLICATE
    dup = (
        db.query(ProductionAt)
        .filter(
            ProductionAt.production_at == production_at_name,
            ProductionAt.company_id == company_code,
            ProductionAt.id != (record_id if record_id else 0)
        )
        .first()
    )

    if dup:
        return JSONResponse({"error": "Already Exists!"}, status_code=400)

    if record_id:
        row = (
            db.query(ProductionAt)
            .filter(
                ProductionAt.id == record_id,
                ProductionAt.company_id == company_code
            ).first()
        )

        if not row:
            return JSONResponse({"error": "Not Found"}, status_code=404)

        row.production_at = production_at_name
        row.date = date
        row.time = time
        row.email = email

    else:
        new_row = ProductionAt(
            production_at=production_at_name,
            date=date,
            time=time,
            email=email,
            company_id=company_code
        )
        db.add(new_row)

    db.commit()
    return JSONResponse({"success": True})


@router.post("/production_at/delete/{id}")
def delete(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    db.query(ProductionAt).filter(
        ProductionAt.id == id,
        ProductionAt.company_id == company_code
    ).delete()

    db.commit()
    return JSONResponse({"status": "ok"})
