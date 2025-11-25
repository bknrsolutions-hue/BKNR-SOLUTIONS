# app/routers/criteria/packing_styles.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.criteria import packing_styles   # <-- lowercase model

router = APIRouter(tags=["PACKING STYLES"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# LOAD PAGE
# ---------------------------------------------------------
@router.get("/packing_styles")
def page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("user_email")
    company_id = request.session.get("company_id")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    rows = db.query(packing_styles).filter(
        packing_styles.company_id == company_id
    ).order_by(packing_styles.id.desc()).all()

    return templates.TemplateResponse(
        "criteria/packing_styles.html",
        {
            "request": request,
            "today_data": rows,
            "email": email,
            "company_id": company_id,
            "message": ""
        }
    )


# ---------------------------------------------------------
# SAVE OR UPDATE
# ---------------------------------------------------------
@router.post("/packing_styles")
def save_packing_style(
    request: Request,
    packing_style: str = Form(...),
    mc_weight: str = Form(""),
    slab_weight: str = Form(""),
    id: int = Form(None),
    date: str = Form(...),
    time: str = Form(...),
    email: str = Form(""),
    company_id: str = Form(""),
    db: Session = Depends(get_db)
):

    session_email = request.session.get("user_email")
    session_company_id = request.session.get("company_id")

    if not session_email or not session_company_id:
        return JSONResponse({"error": "Session expired!"}, status_code=401)

    email = session_email
    company_id = session_company_id

    # Duplicate Check
    duplicate = db.query(packing_styles).filter(
        packing_styles.packing_style == packing_style,
        packing_styles.company_id == company_id,
        packing_styles.id != id
    ).first()

    if duplicate:
        return JSONResponse({"error": f"'{packing_style}' already exists!"}, status_code=400)

    # UPDATE
    if id:
        row = db.query(packing_styles).filter(
            packing_styles.id == id,
            packing_styles.company_id == company_id
        ).first()

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        row.packing_style = packing_style
        row.mc_weight = mc_weight
        row.slab_weight = slab_weight
        row.date = date
        row.time = time
        row.email = email

    # INSERT NEW
    else:
        new_row = packing_styles(
            packing_style=packing_style,
            mc_weight=mc_weight,
            slab_weight=slab_weight,
            date=date,
            time=time,
            email=email,
            company_id=session_company_id
        )
        db.add(new_row)

    db.commit()
    return JSONResponse({"success": True})


# ---------------------------------------------------------
# DELETE
# ---------------------------------------------------------
@router.post("/packing_styles/delete/{id}")
def delete_record(id: int, request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_id")
    if not company_id:
        return JSONResponse({"error": "Session expired!"}, status_code=401)

    db.query(packing_styles).filter(
        packing_styles.id == id,
        packing_styles.company_id == company_id
    ).delete()

    db.commit()
    return JSONResponse({"status": "ok"})
