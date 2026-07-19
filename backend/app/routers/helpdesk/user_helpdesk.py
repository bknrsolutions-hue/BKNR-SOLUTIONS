from fastapi import APIRouter, Request, Depends, HTTPException, Form, File, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from sqlalchemy.orm import Session
import os
import shutil
from datetime import datetime
from app.utils.timezone import ist_now

from app.database import get_db
from app.database.models.helpdesk import SupportTicket, TicketMessage
from app.database.models.users import Company
from app.support_knowledge import knowledge_payload

router = APIRouter(prefix="/support", tags=["USER SUPPORT HELPDESK"])


@router.get("/knowledge-base")
async def support_knowledge_base(request: Request):
    if not request.session.get("email"):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return JSONResponse(content=knowledge_payload())


# 1. 🌟   ()
@router.get("/my_tickets", response_class=HTMLResponse)
async def my_tickets_page(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    comp_code = request.session.get("company_code")

    if not email:
        return RedirectResponse("/auth/login", status_code=302)

    # 💡
    tickets = db.query(SupportTicket).filter(
        SupportTicket.user_email == email,
        SupportTicket.company_id == comp_code
    ).order_by(SupportTicket.created_at.desc()).all()

    #      (HTML  )
    tickets_data = []
    for t in tickets:
        tickets_data.append({
            "id": t.id,
            "ticket_number": t.ticket_number,
            "subject": t.subject,
            "status": t.status,
            "date": t.created_at.strftime("%d %b, %Y") if t.created_at else ""
        })

    if request.query_params.get("format") == "json":
        return JSONResponse(content={"status": "success", "tickets": tickets_data})

    c_info = db.query(Company).filter(Company.company_code == comp_code).first()

    context = {
        "request": request,
        "tickets_json": tickets_data,
        "company_name": c_info.company_name if c_info else "BKNR ENTERPRISES",
    }

    return request.app.state.templates.TemplateResponse(
        request=request,
        name="helpdesk/my_tickets.html",
        context=context
    )

# 2. 🌟     API (WITH AUTO-REPLY)
@router.post("/create_ticket")
async def create_new_ticket(
    request: Request,
    subject: str = Form(...),
    message: str = Form(...),
    db: Session = Depends(get_db)
):
    email = request.session.get("email")
    comp_code = request.session.get("company_code")

    if not email:
        raise HTTPException(status_code=401, detail="Unauthorized")

    #     (: TKT-20260610-001)
    date_str = ist_now().strftime("%Y%m%d")
    count_today = db.query(SupportTicket).filter(SupportTicket.ticket_number.like(f"TKT-{date_str}-%")).count()
    new_ticket_no = f"TKT-{date_str}-{count_today + 1:03d}"

    # 1.
    new_ticket = SupportTicket(
        ticket_number=new_ticket_no,
        user_email=email,
        company_id=comp_code,
        subject=subject,
        status="OPEN"
    )
    db.add(new_ticket)
    db.commit()
    db.refresh(new_ticket)

    # 2.
    first_msg = TicketMessage(
        ticket_id=new_ticket.id,
        sender_email=email,
        sender_type="USER",
        message=message
    )
    db.add(first_msg)

    # 🔴 3.  - (Welcome Message)
    auto_reply_text = f"Hello! Thank you for reaching out. We have received your ticket regarding '{subject}'. Our technical team will look into this shortly. Could you please provide any additional details or screenshots if available?"

    auto_reply = TicketMessage(
        ticket_id=new_ticket.id,
        sender_email="support@bknr.solutions",
        sender_type="ADMIN",  #    ,  ‌   .
        message=auto_reply_text
    )
    db.add(auto_reply)

    #
    db.commit()

    return RedirectResponse(url="/support/my_tickets", status_code=303)

# 3. 🌟        API (Ajax  )
@router.get("/get_messages/{ticket_id}")
async def get_ticket_messages(ticket_id: int, request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    if not email:
        raise HTTPException(status_code=401)

    #
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id, SupportTicket.user_email == email).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    messages = db.query(TicketMessage).filter(TicketMessage.ticket_id == ticket_id).order_by(TicketMessage.sent_at.asc()).all()

    msg_data = []
    for m in messages:
        msg_data.append({
            "sender_type": m.sender_type,
            "message": m.message,
            "media_path": m.media_path,
            "time": m.sent_at.strftime("%I:%M %p") if m.sent_at else ""
        })

    return JSONResponse(content={"status": ticket.status, "subject": ticket.subject, "messages": msg_data})

# 4. 🌟     API
@router.post("/send_message")
async def send_reply(
    request: Request,
    ticket_id: int = Form(...),
    message: str = Form(None),
    file: UploadFile = File(None),
    db: Session = Depends(get_db)
):
    email = request.session.get("email")
    if not email:
        raise HTTPException(status_code=401)

    media_path = None
    if file and file.filename:
        # Guarantee static folder exists
        upload_dir = "app/static/uploads/support"
        os.makedirs(upload_dir, exist_ok=True)

        # Save file with secure timestamp prefix
        filename = f"{int(datetime.utcnow().timestamp())}_{file.filename}"
        dest_path = os.path.join(upload_dir, filename)
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        media_path = f"/static/uploads/support/{filename}"

    new_msg = TicketMessage(
        ticket_id=ticket_id,
        sender_email=email,
        sender_type="USER",
        message=message or "",
        media_path=media_path
    )
    db.add(new_msg)

    #   ,      (IN PROGRESS)
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if ticket and ticket.status == "RESOLVED":
        ticket.status = "IN_PROGRESS"

    db.commit()
    return JSONResponse(content={"status": "success"})
