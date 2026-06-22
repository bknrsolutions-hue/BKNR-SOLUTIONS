from fastapi import APIRouter, Request, Depends, Form, HTTPException, File, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import cast, Date
from datetime import date, timedelta, datetime
import os
import shutil

from app.database import get_db
from app.database.models.helpdesk import SupportTicket, TicketMessage, EventNotification
from app.database.models.users import User, Company

router = APIRouter(prefix="/admin", tags=["SUPER ADMIN HELPDESK"])

ALLOWED_ADMINS = ["bknr.solutions@gmail.com"]

def is_admin(request: Request):
    email = request.session.get("email")
    return email in ALLOWED_ADMINS

# =====================================================
# 1. ALL TICKETS (HTML)
# =====================================================
@router.get("/all_tickets", response_class=HTMLResponse)
async def all_tickets(request: Request, db: Session = Depends(get_db)):
    if not is_admin(request):
        return RedirectResponse("/dashboard", status_code=302)

    tickets = db.query(SupportTicket).order_by(SupportTicket.created_at.desc()).all()
    
    tickets_json = []
    for t in tickets:
        tickets_json.append({
            "id": t.id,
            "ticket_number": t.ticket_number,
            "subject": t.subject,
            "status": t.status,
            "user_email": t.user_email,
            "company_id": t.company_id,
            "date": t.created_at.strftime("%d %b") if t.created_at else ""
        })

    return request.app.state.templates.TemplateResponse(
        request=request,
        name="helpdesk/all_tickets.html", 
        context={"request": request, "tickets_json": tickets_json}
    )

# =====================================================
# 2. SUPPORT TEAM (HTML)
# =====================================================
@router.get("/support_team", response_class=HTMLResponse)
async def manage_support_team(request: Request, db: Session = Depends(get_db)):
    if not is_admin(request):
        return RedirectResponse("/dashboard", status_code=302)
    support_users = db.query(User).filter(User.role.in_(["admin", "support", "super_admin"])).all()
    return request.app.state.templates.TemplateResponse(
        request=request, name="admin/manage_support.html",
        context={"request": request, "support_users": support_users}
    )

# =====================================================
# 3. GET MESSAGES VIA AJAX (FOR CHAT BOX PANEL)
# =====================================================
@router.get("/get_messages/{ticket_id}")
async def admin_get_messages(ticket_id: int, request: Request, db: Session = Depends(get_db)):
    if not is_admin(request):
        raise HTTPException(status_code=403, detail="Unauthorized")
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    messages = db.query(TicketMessage).filter(TicketMessage.ticket_id == ticket_id).order_by(TicketMessage.sent_at.asc()).all()
    msg_data = [{"sender_type": m.sender_type, "message": m.message, "media_path": m.media_path, "time": m.sent_at.strftime("%I:%M %p") if m.sent_at else ""} for m in messages]
    
    return JSONResponse(content={"status": ticket.status, "subject": ticket.subject, "messages": msg_data})

# =====================================================
# 4. UPDATE TICKET STATUS (WITH AUTO-REPLY RESOLUTION)
# =====================================================
@router.post("/update_ticket_status")
async def update_ticket_status(request: Request, ticket_id: int = Form(...), status: str = Form(...), db: Session = Depends(get_db)):
    if not is_admin(request):
        raise HTTPException(status_code=403, detail="Unauthorized")

    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # If status is being changed to RESOLVED for the first time
    if status == "RESOLVED" and ticket.status != "RESOLVED":
        auto_msg = TicketMessage(
            ticket_id=ticket_id,
            sender_email="support@bknr.solutions",
            sender_type="ADMIN",
            message="Thank you for reaching out to BKNR Support. This ticket is now successfully RESOLVED and permanently closed. If you require any further assistance, please raise a new ticket from your dashboard. Best regards, Operations Team."
        )
        db.add(auto_msg)

    ticket.status = status
    db.commit()
    return JSONResponse(content={"success": True, "message": "Ticket status updated"})

# =====================================================
# 5. SEND MESSAGE VIA CHAT PANEL
# =====================================================
@router.post("/send_message")
async def admin_send_message(
    request: Request, 
    ticket_id: int = Form(...), 
    message: str = Form(None),
    file: UploadFile = File(None),
    db: Session = Depends(get_db)
):
    if not is_admin(request):
        raise HTTPException(status_code=403, detail="Unauthorized")

    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # 🔴 BLOCKING ANY MESSAGES IF TICKET IS CLOSED
    if ticket.status == "RESOLVED":
        return JSONResponse(status_code=400, content={"detail": "Ticket is permanently closed."})

    media_path = None
    if file and file.filename:
        upload_dir = "app/static/uploads/support"
        os.makedirs(upload_dir, exist_ok=True)
        filename = f"{int(datetime.utcnow().timestamp())}_{file.filename}"
        dest_path = os.path.join(upload_dir, filename)
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        media_path = f"/static/uploads/support/{filename}"

    new_msg = TicketMessage(
        ticket_id=ticket_id,
        sender_email="support@bknr.solutions",
        sender_type="ADMIN",
        message=message or "",
        media_path=media_path
    )
    db.add(new_msg)
    # Note: NO code here to change status back to IN_PROGRESS. Status stays as is!
    db.commit()
    
    return JSONResponse(content={"success": True})

# =====================================================
# 6. BROADCAST EVENT NOTIFICATION (ADMIN ONLY)
# =====================================================
@router.post("/create_event")
async def create_event(
    request: Request,
    message: str = Form(...),
    db: Session = Depends(get_db)
):
    if not is_admin(request):
        raise HTTPException(status_code=403, detail="Unauthorized")
        
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code:
        raise HTTPException(status_code=400, detail="No active company context")

    new_event = EventNotification(
        title="Admin Broadcast",
        message=message,
        created_by=email,
        company_id=comp_code
    )
    db.add(new_event)
    db.commit()
    return JSONResponse(content={"success": True, "message": "Event broadcasted successfully"})