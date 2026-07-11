# app/routers/criteria/buyers.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.criteria import buyers, countries
from app.database.models.enterprise_finance import AccountGroup, LedgerMaster

router = APIRouter(tags=["BUYERS"])
templates = Jinja2Templates(directory="app/templates")


def get_buyer_page_context(db: Session, company_code: str, email: str, message: str = ""):
    today_data = (
        db.query(buyers)
        .filter(buyers.company_id == company_code)
        .order_by(buyers.id.desc())
        .all()
    )
    buyer_ledgers = (
        db.query(LedgerMaster)
        .join(AccountGroup, LedgerMaster.group_id == AccountGroup.id)
        .filter(
            LedgerMaster.company_id == company_code,
            LedgerMaster.status == "ACTIVE",
            AccountGroup.group_type == "ASSET",
        )
        .order_by(LedgerMaster.ledger_name)
        .all()
    )
    country_list = (
        db.query(countries)
        .filter(countries.company_id == company_code)
        .order_by(countries.country_name)
        .all()
    )
    ledger_names = {ledger.id: ledger.ledger_name for ledger in buyer_ledgers}
    return {
        "today_data": today_data,
        "buyer_ledgers": buyer_ledgers,
        "ledger_names": ledger_names,
        "countries_list": country_list,
        "email": email,
        "company_id": company_code,
        "message": message,
    }


# ---------------------------------------------------------
# PAGE – SHOW BUYERS
# ---------------------------------------------------------
@router.get("/buyers")
def buyers_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("email")
    company_code = request.session.get("company_code")   # STRING like BKNR5647

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    return templates.TemplateResponse(
        request=request,
        name="criteria/buyers.html",
        context=get_buyer_page_context(db, company_code, email)
    )


# ---------------------------------------------------------
# SAVE / UPDATE BUYER
# ---------------------------------------------------------
@router.post("/buyers")
def save_buyer(
    request: Request,
    buyer_name: str = Form(...),
    buyer_type: str = Form("EXPORT"),
    country: str = Form(""),
    currency_code: str = Form("USD"),
    iec_code: str = Form(""),
    credit_limit: float = Form(0.0),
    credit_insurance: int = Form(0),
    payment_terms_days: int = Form(30),
    gst_number: str = Form(""),
    contact_person: str = Form(""),
    buyer_email: str = Form(""),
    account_ledger_id: str = Form(""),
    address: str = Form(""),
    id: int = Form(None),
    date: str = Form(...),
    time: str = Form(...),
    db: Session = Depends(get_db)
):

    email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not email or not company_code:
        return RedirectResponse("/", status_code=302)

    ledger_id = int(account_ledger_id) if str(account_ledger_id or "").strip() else None

    # Duplicate Validation
    duplicate = db.query(buyers).filter(
        buyers.buyer_name == buyer_name,
        buyers.company_id == company_code,
        buyers.id != id
    ).first()

    if duplicate:
        return templates.TemplateResponse(
            request=request,
            name="criteria/buyers.html",
            context=get_buyer_page_context(
                db, company_code, email, f"❌ Buyer '{buyer_name}' already exists!"
            )
        )

    # UPDATE
    if id:
        row = db.query(buyers).filter(
            buyers.id == id,
            buyers.company_id == company_code
        ).first()

        if not row:
            return RedirectResponse("/buyers?msg=Record+Not+Found", status_code=302)

        row.buyer_name = buyer_name
        row.buyer_type = buyer_type
        row.country = country
        row.currency_code = currency_code
        row.iec_code = iec_code
        row.credit_limit = credit_limit
        row.credit_insurance = credit_insurance
        row.payment_terms_days = payment_terms_days
        row.gst_number = gst_number
        row.contact_person = contact_person
        row.buyer_email = buyer_email
        row.account_ledger_id = ledger_id
        row.address = address
        row.date = date
        row.time = time
        row.email = email

    # INSERT
    else:
        new_row = buyers(
            buyer_name=buyer_name,
            buyer_type=buyer_type,
            country=country,
            currency_code=currency_code,
            iec_code=iec_code,
            credit_limit=credit_limit,
            credit_insurance=credit_insurance,
            payment_terms_days=payment_terms_days,
            gst_number=gst_number,
            contact_person=contact_person,
            buyer_email=buyer_email,
            account_ledger_id=ledger_id,
            address=address,
            date=date,
            time=time,
            email=email,
            company_id=company_code  # STRING stored
        )
        db.add(new_row)

    db.commit()

    return templates.TemplateResponse(
        request=request,
        name="criteria/buyers.html",
        context=get_buyer_page_context(
            db, company_code, email, f"✔ Buyer '{buyer_name}' saved successfully!"
        )
    )


# ---------------------------------------------------------
# DELETE BUYER
# ---------------------------------------------------------
@router.post("/buyers/delete/{id}")
def delete_buyer(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    if not company_code:
        return RedirectResponse("/", status_code=302)

    db.query(buyers).filter(
        buyers.id == id,
        buyers.company_id == company_code
    ).delete()

    db.commit()

    return RedirectResponse("/buyers?msg=Deleted", status_code=302)
