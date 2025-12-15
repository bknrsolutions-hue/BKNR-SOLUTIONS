# app/routers/criteria/packing_styles.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.criteria import packing_styles

router = APIRouter(tags=["PACKING STYLES"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE – SHOW PACKING STYLES
# ---------------------------------------------------------
@router.get("/packing_styles")
def packing_styles_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    rows = (
        db.query(packing_styles)
        .filter(packing_styles.company_id == company_code)
        .order_by(packing_styles.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/packing_styles.html",
        {
            "request": request,
            "today_data": rows,
            "email": email,
            "company_id": company_code,
            "message": ""
        }
    )


# ---------------------------------------------------------
# SAVE / UPDATE PACKING STYLE
# ---------------------------------------------------------
@router.post("/packing_styles")
def save_packing_style(
    request: Request,

    packing_style: str = Form(...),
    mc_weight: str = Form(""),
    slab_weight: str = Form(""),

    id: str = Form(""),      # safe string
    date: str = Form(...),
    time: str = Form(...),

    db: Session = Depends(get_db)
):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    # Safe ID convert
    record_id = int(id) if id and id.isdigit() else None

    # Duplicate check
    duplicate = (
        db.query(packing_styles)
        .filter(
            packing_styles.packing_style == packing_style,
            packing_styles.company_id == company_code,
            packing_styles.id != record_id
        )
        .first()
    )

    if duplicate:
        return JSONResponse(
            {"error": f"'{packing_style}' already exists!"},
            status_code=400
        )

    # UPDATE
    if record_id:
        row = (
            db.query(packing_styles)
            .filter(
                packing_styles.id == record_id,
                packing_styles.company_id == company_code
            )
            .first()
        )

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        row.packing_style = packing_style
        row.mc_weight = mc_weight
        row.slab_weight = slab_weight
        row.date = date
        row.time = time
        row.email = email

    # INSERT
    else:
        new_row = packing_styles(
            packing_style=packing_style,
            mc_weight=mc_weight,
            slab_weight=slab_weight,
            date=date,
            time=time,
            email=email,
            company_id=company_code
        )
        db.add(new_row)

    db.commit()
    return JSONResponse({"success": True})


# ---------------------------------------------------------
# DELETE PACKING STYLE
# ---------------------------------------------------------
@router.post("/packing_styles/delete/{id}")
def delete_packing_style(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    if not company_code:
        return JSONResponse({"error": "Session expired!"}, status_code=401)

    db.query(packing_styles).filter(
        packing_styles.id == id,
        packing_styles.company_id == company_code
    ).delete()

    db.commit()
    return JSONResponse({"status": "ok"})
