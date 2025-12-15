# app/routers/criteria/contractors.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.criteria import contractors

router = APIRouter(tags=["CONTRACTORS"])
templates = Jinja2Templates(directory="app/templates")


# =====================================================
# SHOW PAGE
# =====================================================
@router.get("/contractors")
def contractors_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    rows = (
        db.query(contractors)
        .filter(contractors.company_id == company_code)
        .order_by(contractors.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        "criteria/contractors.html",
        {
            "request": request,
            "today_data": rows,
            "email": email,
            "company_id": company_code,
        }
    )


# =====================================================
# SAVE / UPDATE (DUPLICATES ALLOWED)
# =====================================================
@router.post("/contractors")
def save_contractor(
    request: Request,

    contractor_name: str = Form(...),
    phone: str = Form(""),
    contractor_email: str = Form(""),
    address: str = Form(""),

    gst_number: str = Form(""),
    gst_percent: float | None = Form(None),
    gst_applicable_from: str = Form(""),

    bank_name: str = Form(""),
    account_no: str = Form(""),
    ifsc: str = Form(""),

    date: str = Form(...),
    time: str = Form(...),
    id: str = Form(""),

    db: Session = Depends(get_db)
):

    session_email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not session_email or not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    record_id = int(id) if id.isdigit() else None

    # ---------------- DATE PARSE ----------------
    gst_date = None
    if gst_applicable_from:
        gst_date = datetime.strptime(gst_applicable_from, "%Y-%m-%d").date()

    # ---------------- UPDATE ----------------
    if record_id:
        row = (
            db.query(contractors)
            .filter(
                contractors.id == record_id,
                contractors.company_id == company_code
            )
            .first()
        )

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        row.contractor_name = contractor_name
        row.phone = phone
        row.contractor_email = contractor_email
        row.address = address

        row.gst_number = gst_number
        row.gst_percent = gst_percent
        row.gst_applicable_from = gst_date

        row.bank_name = bank_name
        row.account_no = account_no
        row.ifsc = ifsc

        row.date = date
        row.time = time
        row.email = session_email

    # ---------------- INSERT (NO DUPLICATE CHECK) ----------------
    else:
        row = contractors(
            contractor_name=contractor_name,
            phone=phone,
            contractor_email=contractor_email,
            address=address,

            gst_number=gst_number,
            gst_percent=gst_percent,
            gst_applicable_from=gst_date,

            bank_name=bank_name,
            account_no=account_no,
            ifsc=ifsc,

            date=date,
            time=time,
            email=session_email,
            company_id=company_code
        )
        db.add(row)

    db.commit()
    return JSONResponse({"success": True})


# =====================================================
# DELETE
# =====================================================
@router.post("/contractors/delete/{id}")
def delete_contractor(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    if not company_code:
        return JSONResponse({"error": "Session expired"}, status_code=401)

    db.query(contractors).filter(
        contractors.id == id,
        contractors.company_id == company_code
    ).delete()

    db.commit()
    return JSONResponse({"status": "ok"})
