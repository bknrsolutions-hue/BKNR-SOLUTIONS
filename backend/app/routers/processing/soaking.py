from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime

from app.database import get_db
from app.database.models.processing import Soaking, GateEntry
from app.database.models.criteria import varieties, grade_to_hoso, chemicals

router = APIRouter(tags=["SOAKING"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE LOAD
# ---------------------------------------------------------
@router.get("/soaking")
def page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("user_email")
    company_id = request.session.get("company_id")

    if not email or not company_id:
        return RedirectResponse("/auth/login", status_code=302)

    # Batches lookup
    batch_list = (
        db.query(gate_entry.batch_number)
        .filter(gate_entry.company_id == company_id)
        .order_by(gate_entry.batch_number)
        .all()
    )

    # Variety lookup
    variety_list = (
        db.query(varieties.variety_name)
        .filter(varieties.company_id == company_id)
        .order_by(varieties.variety_name)
        .all()
    )

    # Count lookup (HOSO/HLSO)
    count_list = (
        db.query(grade_to_hoso.grade_name)
        .filter(grade_to_hoso.company_id == company_id)
        .order_by(grade_to_hoso.grade_name)
        .all()
    )

    # Chemicals lookup
    chemical_list = (
        db.query(chemicals.chemical_name)
        .filter(chemicals.company_id == company_id)
        .order_by(chemicals.chemical_name)
        .all()
    )

    return templates.TemplateResponse(
        "processing/soaking.html",
        {
            "request": request,
            "batches": [b[0] for b in batch_list],
            "varieties": [v[0] for v in variety_list],
            "counts": [c[0] for c in count_list],
            "chemicals": [c[0] for c in chemical_list],
            "email": email,
            "company_id": company_id,
        }
    )


# ---------------------------------------------------------
# SAVE SOAKING ENTRY
# ---------------------------------------------------------
@router.post("/soaking")
def save(
    request: Request,

    batch_number: str = Form(...),
    variety: str = Form(...),
    in_count: str = Form(...),

    in_qty: float = Form(0),
    chemical_name: str = Form(...),
    chemical_percent: float = Form(0),
    chemical_qty: float = Form(0),

    salt_percent: float = Form(0),
    salt_qty: float = Form(0),

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

    # Auto date and time
    now = datetime.now()
    if not date:
        date = now.strftime("%Y-%m-%d")
    if not time:
        time = now.strftime("%H:%M:%S")

    # Duplicate checking
    dup = db.query(soaking).filter(
        soaking.batch_number == batch_number,
        soaking.variety == variety,
        soaking.in_count == in_count,
        soaking.date == date,
        soaking.company_id == company_id,
    ).first()

    if dup:
        return RedirectResponse("/processing/soaking?error=exists", status_code=302)

    # Insert new entry
    new_row = soaking(
        batch_number=batch_number,
        variety=variety,
        in_count=in_count,

        in_qty=in_qty,
        chemical_name=chemical_name,
        chemical_percent=chemical_percent,
        chemical_qty=chemical_qty,

        salt_percent=salt_percent,
        salt_qty=salt_qty,

        date=date,
        time=time,
        email=email,
        company_id=company_id,
    )

    db.add(new_row)
    db.commit()

    return RedirectResponse("/processing/soaking?success=1", status_code=302)
