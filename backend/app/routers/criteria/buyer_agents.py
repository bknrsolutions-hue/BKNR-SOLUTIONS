# app/routers/criteria/buyer_agents.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.templating import Jinja2Templates
from fastapi.responses import RedirectResponse, JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.criteria import buyer_agents   # <-- lowercase model

router = APIRouter(tags=["BUYER AGENTS"])   # no prefix here
templates = Jinja2Templates(directory="app/templates")


# ---------------------------------------------------------
# SHOW PAGE
# ---------------------------------------------------------
@router.get("/buyer_agents")
def buyer_agents_page(request: Request, db: Session = Depends(get_db)):

    email = request.session.get("user_email")
    company_id = request.session.get("company_id")

    if not email or not company_id:
        return RedirectResponse("/auth/login")

    today_data = db.query(buyer_agents).filter(
        buyer_agents.company_id == company_id
    ).order_by(buyer_agents.id.desc()).all()

    return templates.TemplateResponse(
        "criteria/buyer_agents.html",
        {
            "request": request,
            "today_data": today_data,
            "email": email,
            "company_id": company_id,
            "message": ""
        }
    )


# ---------------------------------------------------------
# SAVE / UPDATE BUYER AGENT
# ---------------------------------------------------------
@router.post("/buyer_agents")
def save_buyer_agent(
    request: Request,
    agent_name: str = Form(...),
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
        return JSONResponse({"error": "Session expired"}, status_code=401)

    email = session_email
    company_id = session_company_id

    # Duplicate check
    duplicate = db.query(buyer_agents).filter(
        buyer_agents.agent_name == agent_name,
        buyer_agents.company_id == company_id,
        buyer_agents.id != id
    ).first()

    if duplicate:
        return JSONResponse(
            {"error": f"Agent '{agent_name}' already exists!"},
            status_code=400
        )

    # UPDATE
    if id:
        row = db.query(buyer_agents).filter(
            buyer_agents.id == id,
            buyer_agents.company_id == company_id
        ).first()

        if not row:
            return JSONResponse({"error": "Record not found"}, status_code=404)

        row.agent_name = agent_name
        row.date = date
        row.time = time
        row.email = email

    # INSERT
    else:
        new_row = buyer_agents(
            agent_name=agent_name,
            date=date,
            time=time,
            email=email,
            company_id=company_id
        )
        db.add(new_row)

    db.commit()

    return JSONResponse({"success": True})


# ---------------------------------------------------------
# DELETE BUYER AGENT
# ---------------------------------------------------------
@router.post("/buyer_agents/delete/{id}")
def delete_buyer_agent(id: int, request: Request, db: Session = Depends(get_db)):

    company_id = request.session.get("company_id")

    if not company_id:
        return JSONResponse({"error": "Session invalid"}, status_code=401)

    db.query(buyer_agents).filter(
        buyer_agents.id == id,
        buyer_agents.company_id == company_id
    ).delete()

    db.commit()

    return JSONResponse({"status": "ok"})
