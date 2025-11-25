from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.processing import Grading, GateEntry
from app.database.models.criteria import grade_to_hoso, varieties

router = APIRouter(tags=["GRADING"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE LOAD
# ---------------------------------------------------------
@router.get("/grading")
def page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("user_email")
    company_id = request.session.get("company_id")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    # Batch lookup
    batches = (
        db.query(gate_entry.batch_number)
        .filter(gate_entry.company_id == company_id)
        .order_by(gate_entry.batch_number)
        .all()
    )

    # HOSO lookup
    hoso_list = (
        db.query(grade_to_hoso.hoso_count)
        .filter(grade_to_hoso.company_id == company_id)
        .order_by(grade_to_hoso.hoso_count)
        .all()
    )

    # Variety lookup
    variety_list = (
        db.query(varieties.variety_name)
        .filter(varieties.company_id == company_id)
        .order_by(varieties.variety_name)
        .all()
    )

    return templates.TemplateResponse(
        "processing/grading.html",
        {
            "request": request,
            "batches": [b[0] for b in batches],
            "hoso_counts": [h[0] for h in hoso_list],
            "varieties": [v[0] for v in variety_list],
            "email": email,
            "company_id": company_id,
        }
    )


# ---------------------------------------------------------
# SAVE GRADING ENTRY
# ---------------------------------------------------------
@router.post("/grading")
def save(
    request: Request,

    batch_number: str = Form(...),
    hoso_count: str = Form(...),
    variety: str = Form(...),
    graded_count: str = Form(...),
    quantity: float = Form(...),

    date: str = Form(""),
    time: str = Form(""),
    email: str = Form(""),
    company_id: str = Form(""),

    db: Session = Depends(get_db)
):

    session_email = request.session.get("user_email")
    session_company_id = request.session.get("company_id")

    if not session_email or not session_company_id:
        return RedirectResponse("/auth/login", status_code=302)

    email = session_email
    company_id = session_company_id

    now = datetime.now()
    if not date:
        date = now.strftime("%Y-%m-%d")
    if not time:
        time = now.strftime("%H:%M:%S")

    # Duplicate rule:
    # same batch_number + same hoso_count + same graded_count → single entry per day
    dup = db.query(grading).filter(
        grading.batch_number == batch_number,
        grading.hoso_count == hoso_count,
        grading.graded_count == graded_count,
        grading.date == date,
        grading.company_id == company_id,
    ).first()

    if dup:
        return RedirectResponse("/processing/grading?error=exists", status_code=302)

    new_row = grading(
        batch_number=batch_number,
        hoso_count=hoso_count,
        variety=variety,
        graded_count=graded_count,
        quantity=quantity,
        date=date,
        time=time,
        email=email,
        company_id=company_id,
    )

    db.add(new_row)
    db.commit()

    return RedirectResponse("/processing/grading?success=1", status_code=302)
