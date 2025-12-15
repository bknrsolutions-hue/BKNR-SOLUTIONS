# app/routers/criteria/buyer_agents.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

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
        "criteria/buyer_agents.html",
        {
            "request": request,
            "today_data": data,
            "email": session_email,
            "company_id": company_code,
            "message": ""
        }
    )


# ---------------------------------------------------------
# SAVE (ADD / UPDATE)
# ---------------------------------------------------------
@router.post("/")
def save_buyer_agent(
    request: Request,
    agent_name: str = Form(...),
    id: int = Form(None),
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

        return templates.TemplateResponse("criteria/buyer_agents.html", {
            "request": request,
            "today_data": data,
            "email": session_email,
            "company_id": company_code,
            "message": f"❌ Agent '{agent_name}' already exists!"
        })

    # UPDATE
    if id:
        row = db.query(buyer_agents).filter(
            buyer_agents.id == id,
            buyer_agents.company_id == company_code
        ).first()

        if not row:
            return RedirectResponse("/buyer_agents?msg=Record+Not+Found", status_code=302)

        row.agent_name = agent_name
        row.date = date
        row.time = time
        row.email = session_email

    # INSERT
    else:
        new_row = buyer_agents(
            agent_name=agent_name,
            date=date,
            time=time,
            email=session_email,
            company_id=company_code   # store string company_code (consistent with your models)
        )
        db.add(new_row)

    db.commit()

    data = db.query(buyer_agents).filter(
        buyer_agents.company_id == company_code
    ).order_by(buyer_agents.id.desc()).all()

    return templates.TemplateResponse("criteria/buyer_agents.html", {
        "request": request,
        "today_data": data,
        "email": session_email,
        "company_id": company_code,
        "message": f"✔️ Agent '{agent_name}' saved successfully!"
    })


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

    # Redirect back to page with message (you can handle the msg query in template if needed)
    return RedirectResponse("/buyer_agents?msg=Deleted", status_code=302)
