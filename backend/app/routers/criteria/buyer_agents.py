# app/routers/criteria/buyer_agents.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse, Response
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.database.models.criteria import buyer_agents

router = APIRouter(prefix="/buyer_agents", tags=["Buyer Agents"])
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# PAGE VIEW – LIST + FORM
# ---------------------------------------------------------
@router.get("/")
def buyer_agents_page(request: Request, db: Session = Depends(get_db)):

    session_email = request.session.get("email")
    company_code = request.session.get("company_code")   # STRING like BKNR5647

    if not session_email or not company_code:
        return RedirectResponse("/", status_code=302)

    data = (
        db.query(buyer_agents)
        .filter(buyer_agents.company_id == company_code)   # match string company_code
        .order_by(buyer_agents.id.desc())
        .all()
    )

    return templates.TemplateResponse(
        request=request, 
        name="criteria/buyer_agents.html", 
        context={
            "today_data": data,
            "email": session_email,
            "company_id": company_code,
            "message": ""
        }
    )

# ---------------------------------------------------------
# SAVE (ADD / UPDATE) - ALL COLUMNS INCLUDED (WITH AGENT EMAIL)
# ---------------------------------------------------------
@router.post("/")
def save_buyer_agent(
    request: Request,
    agent_name: str = Form(...),
    agent_email: Optional[str] = Form(None),  # 👈 కొత్తగా యాడ్ చేసిన ఏజెంట్ ఈమెయిల్ ఫీల్డ్
    phone: Optional[str] = Form(None),
    address: Optional[str] = Form(None),
    service_for: str = Form(...),
    gst_number: Optional[str] = Form(None),
    bank_name: Optional[str] = Form(None),
    account_no: Optional[str] = Form(None),
    ifsc: Optional[str] = Form(None),
    id: Optional[int] = Form(None),
    date: str = Form(...),
    time: str = Form(...),
    db: Session = Depends(get_db)
):

    session_email = request.session.get("email")
    company_code = request.session.get("company_code")

    if not session_email or not company_code:
        return RedirectResponse("/", status_code=302)

    # Duplicate Check (same company)
    exists = db.query(buyer_agents).filter(
        buyer_agents.agent_name == agent_name,
        buyer_agents.company_id == company_code,
        buyer_agents.id != id
    ).first()

    if exists:
        data = db.query(buyer_agents).filter(
            buyer_agents.company_id == company_code
        ).order_by(buyer_agents.id.desc()).all()

        return templates.TemplateResponse(
            request=request,
            name="criteria/buyer_agents.html",
            context={
                "today_data": data,
                "email": session_email,
                "company_id": company_code,
                "message": f"❌ Agent '{agent_name}' already exists!"
            }
        )

    # UPDATE EXISTING RECORD
    if id:
        row = db.query(buyer_agents).filter(
            buyer_agents.id == id,
            buyer_agents.company_id == company_code
        ).first()

        if not row:
            return RedirectResponse("/buyer_agents?msg=Record+Not+Found", status_code=302)

        # Updating all new table columns
        row.agent_name = agent_name
        row.agent_email = agent_email  # 👈 అప్‌డేట్ లాజిక్‌లో యాడ్ చేసాను
        row.phone = phone
        row.address = address
        row.service_for = service_for
        row.gst_number = gst_number
        row.bank_name = bank_name
        row.account_no = account_no
        row.ifsc = ifsc
        row.date = date
        row.time = time
        row.email = session_email

    # INSERT NEW RECORD
    else:
        new_row = buyer_agents(
            agent_name=agent_name,
            agent_email=agent_email,  # 👈 ఇన్సర్ట్ లాజిక్‌లో యాడ్ చేసాను
            phone=phone,
            address=address,
            service_for=service_for,
            gst_number=gst_number,
            bank_name=bank_name,
            account_no=account_no,
            ifsc=ifsc,
            date=date,
            time=time,
            email=session_email,
            company_id=company_code   # store string company_code
        )
        db.add(new_row)

    db.commit()

    return Response(status_code=200)


# ---------------------------------------------------------
# DELETE
# ---------------------------------------------------------
@router.post("/delete/{id}")
def delete_agent(id: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    if not company_code:
        return RedirectResponse("/", status_code=302)

    db.query(buyer_agents).filter(
        buyer_agents.id == id,
        buyer_agents.company_id == company_code
    ).delete()

    db.commit()

    return Response(status_code=200)