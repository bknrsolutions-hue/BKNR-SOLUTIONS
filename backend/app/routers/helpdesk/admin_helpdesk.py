from fastapi import APIRouter, Request, Depends, HTTPException, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.database.models.helpdesk import SupportTicket, TicketMessage
from app.database.models.users import User

router = APIRouter(prefix="/admin", tags=["SUPER ADMIN HELPDESK"])

# 🔴 కేవలం BKNR మాత్రమే డిఫాల్ట్ సూపర్ అడ్మిన్ (మాస్టర్ ఓవర్‌రైడ్)
ALLOWED_ADMINS = ["bknr.solutions@gmail.com"]

# ─── 1. అన్ని కంప్లైంట్స్ చూసే రూట్ (HTML Page) ───
@router.get("/all_tickets", response_class=HTMLResponse)
async def admin_all_tickets_page(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    role = request.session.get("role")
    
    # సెక్యూరిటీ చెక్ (అడ్మిన్ కాకపోతే డాష్‌బోర్డ్ కి పంపించేస్తాం)
    if email not in ALLOWED_ADMINS and role != "Super Admin":
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

# ─── 2. సపోర్ట్ టీమ్ కాన్ఫిగరేషన్ (HTML Page) ───
@router.get("/support_team", response_class=HTMLResponse)
async def manage_support_team(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    role = request.session.get("role")
    
    if email not in ALLOWED_ADMINS and role != "Super Admin":
        return RedirectResponse("/dashboard", status_code=302)
        
    support_users = db.query(User).filter(User.role == "Support Team").all()
    return request.app.state.templates.TemplateResponse(
        request=request,
        name="admin/manage_support.html",
        context={"request": request, "support_users": support_users}
    )

# ─── 3. ADMIN గెట్ మెసేజెస్ (Ajax API) ───
@router.get("/get_messages/{ticket_id}")
async def admin_get_messages(ticket_id: int, request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    role = request.session.get("role")
    
    if email not in ALLOWED_ADMINS and role != "Super Admin":
        raise HTTPException(status_code=403, detail="Unauthorized Admin Access")

    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    messages = db.query(TicketMessage).filter(TicketMessage.ticket_id == ticket_id).order_by(TicketMessage.sent_at.asc()).all()
    
    msg_data = []
    for m in messages:
        msg_data.append({
            "sender_type": m.sender_type,
            "message": m.message,
            "time": m.sent_at.strftime("%I:%M %p") if m.sent_at else ""
        })

    return JSONResponse(content={"status": ticket.status, "subject": ticket.subject, "messages": msg_data})

# ─── 4. ADMIN స్టేటస్ అప్‌డేట్ (Ajax API) ───
@router.post("/update_ticket_status")
async def update_ticket_status(
    request: Request,
    ticket_id: int = Form(...),
    status: str = Form(...),
    db: Session = Depends(get_db)
):
    email = request.session.get("email")
    role = request.session.get("role")
    
    if email not in ALLOWED_ADMINS and role != "Super Admin":
        raise HTTPException(status_code=403, detail="Unauthorized Admin Access")

    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    ticket.status = status
    db.commit()

    return JSONResponse(content={"success": True, "message": "Ticket status updated"})

# ─── 5. ADMIN రిప్లై పంపడం (Ajax API) - 🔴 FIXED (No User Email Leak) ───
@router.post("/send_message")
async def admin_send_message(
    request: Request,
    ticket_id: int = Form(...),
    message: str = Form(...),
    db: Session = Depends(get_db)
):
    email = request.session.get("email")
    role = request.session.get("role")
    
    if email not in ALLOWED_ADMINS and role != "Super Admin":
        raise HTTPException(status_code=403, detail="Unauthorized Admin Access")

    new_msg = TicketMessage(
        ticket_id=ticket_id,
        sender_email="support@bknr.solutions", # ఇక్కడ హార్డ్‌కోడ్ చేసాం
        sender_type="ADMIN",
        message=message
    )
    db.add(new_msg)
    
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if ticket and ticket.status == "RESOLVED":
        ticket.status = "IN_PROGRESS"

    db.commit()

    return JSONResponse(content={"success": True})