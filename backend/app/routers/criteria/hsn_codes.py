from app.utils.timezone import ist_now
# app/routers/criteria/hsn_codes.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.criteria import hsn_codes

router = APIRouter(tags=["HSN CODES"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE – SHOW HSN CODES
# URL: /criteria/hsn_codes
# ---------------------------------------------------------
@router.get("/hsn_codes")
def hsn_codes_page(
    request: Request,
    db: Session = Depends(get_db)
):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    rows = (
        db.query(hsn_codes)
        .filter(hsn_codes.company_id == company_code)
        .order_by(hsn_codes.id.desc())
        .all()
    )

    # ✅ FIX: TemplateResponse arguments updated for FastAPI latest
    return templates.TemplateResponse(
        request=request,
        name="criteria/hsn_codes.html",
        context={
            "today_data": rows,
            "email": email,
            "company_id": company_code,
            "message": ""
        }
    )


# ---------------------------------------------------------
# SAVE / UPDATE HSN CODE
# URL: /criteria/hsn_codes
# ---------------------------------------------------------
@router.post("/hsn_codes")
def save_hsn_code(
    request: Request,
    hsn_code: str = Form(...),
    description: str = Form(...),
    gst_percent: float = Form(...),
    applicable_from: str = Form(""),
    id: str = Form(""),
    date: str = Form(""),
    time: str = Form(""),
    db: Session = Depends(get_db)
):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    record_id = int(id) if id and id.isdigit() else None

    now = ist_now()
    date = date or now.strftime("%Y-%m-%d")
    time = time or now.strftime("%H:%M:%S")

    # -------------------------------
    # DUPLICATE CHECK
    # -------------------------------
    duplicate = (
        db.query(hsn_codes)
        .filter(
            hsn_codes.hsn_code == hsn_code,
            hsn_codes.company_id == company_code,
            hsn_codes.id != record_id
        )
        .first()
    )

    if duplicate:
        return JSONResponse(
            {"error": f"HSN Code '{hsn_code}' already exists!"},
            status_code=400
        )

    # -------------------------------
    # UPDATE
    # -------------------------------
    if record_id:
        row = (
            db.query(hsn_codes)
            .filter(
                hsn_codes.id == record_id,
                hsn_codes.company_id == company_code
            )
            .first()
        )

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        row.hsn_code = hsn_code
        row.description = description
        row.gst_percent = gst_percent
        row.applicable_from = applicable_from or None
        row.date = date
        row.time = time
        row.email = email

    # -------------------------------
    # INSERT
    # -------------------------------
    else:
        db.add(
            hsn_codes(
                hsn_code=hsn_code,
                description=description,
                gst_percent=gst_percent,
                applicable_from=applicable_from or None,
                date=date,
                time=time,
                email=email,
                company_id=company_code
            )
        )

    db.commit()

    return JSONResponse({"success": True})


# ---------------------------------------------------------
# DELETE HSN CODE
# URL: /criteria/hsn_codes/delete/{id}
# ---------------------------------------------------------
@router.post("/hsn_codes/delete/{id}")
def delete_hsn_code(
    id: int,
    request: Request,
    db: Session = Depends(get_db)
):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    db.query(hsn_codes).filter(
        hsn_codes.id == id,
        hsn_codes.company_id == company_code
    ).delete()

    db.commit()

    return JSONResponse({"status": "ok"})