from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy import cast, Date, or_
from datetime import date, datetime, timedelta
import logging

from app.database import get_db
from app.database.models.helpdesk import SupportTicket, TicketMessage
from app.database.models.users import User, Company, UserLoginActivity
from app.routers.auth import professional_email_html, send_email
from app.utils.timezone import ist_now

# Logger Setup
logger = logging.getLogger("admin_dashboard")

router = APIRouter(prefix="/admin", tags=["SUPER ADMIN DASHBOARD & ACTIVITIES"])

# 🔴 సెక్యూరిటీ గేట్‌వే: సూపర్ అడ్మిన్ యాక్సెస్ వెరిఫికేషన్
ALLOWED_ADMINS = ["bknr.solutions@gmail.com"]

def is_admin(request: Request):
    email = request.session.get("email")
    return email in ALLOWED_ADMINS


# =====================================================
# 1. RENDER ACTIVITIES DASHBOARD (HTML VIEW)
# =====================================================
@router.get("/activities", response_class=HTMLResponse)
async def activities_page(request: Request, db: Session = Depends(get_db)):
    if not is_admin(request):
        return RedirectResponse("/dashboard", status_code=302)

    try:
        # కుడివైపు లైవ్ హెల్ప్‌డెస్క్ ఫీడ్ కోసం లాస్ట్ 100 మెసేజ్‌లు
        latest_messages = db.query(TicketMessage).order_by(TicketMessage.sent_at.desc()).limit(100).all()

        today = ist_now().date()
        yesterday = today - timedelta(days=1)  # Midnight rollover protection
        first_day_this_month = today.replace(day=1)

        # KPI 1: Total Registrations
        total_registrations = db.query(Company).count()
        
        # 🛠️ FIX: ఈరోజు మరియు నిన్నటి మిడ్‌నైట్ సెషన్స్ ని బేస్ చేసుకుని యునిక్ కంపెనీ కౌంట్ కరెక్ట్ గా వస్తుంది
        today_active = db.query(UserLoginActivity.company_id).filter(
            or_(
                cast(UserLoginActivity.login_at, Date) == today,
                cast(UserLoginActivity.login_at, Date) == yesterday,
                UserLoginActivity.session_hours == "Active Now"
            )
        ).distinct().count()

        # 🛠️ FIX: ఈరోజు ఆక్టివిటీ లో ఉన్న యునిక్ యూజర్ల (ఇమెయిల్స్) కౌంట్ పర్ఫెక్ట్ గా వస్తుంది
        active_users = db.query(UserLoginActivity.user_id).filter(
            or_(
                cast(UserLoginActivity.login_at, Date) == today,
                cast(UserLoginActivity.login_at, Date) == yesterday,
                UserLoginActivity.session_hours == "Active Now"
            )
        ).distinct().count()

        # KPI 4: New This Month
        new_this_month = db.query(Company).filter(
            cast(Company.created_at, Date) >= first_day_this_month
        ).count()

        # KPI 5: Open Tickets
        open_tickets = db.query(SupportTicket).filter(SupportTicket.status == "OPEN").count()

        # KPI 6: Pending Approvals
        pending_approvals = db.query(Company).filter(Company.is_active == False).count()

        stats = {
            "total_registrations": total_registrations,
            "today_active": today_active,
            "active_users": active_users,
            "new_this_month": new_this_month,
            "open_tickets": open_tickets,
            "pending_approvals": pending_approvals
        }

        return request.app.state.templates.TemplateResponse(
            request=request,
            name="admin/activities.html",
            context={"request": request, "activities": latest_messages, "stats": stats}
        )
        
    except Exception as e:
        logger.error(f"Dashboard HTML Render Failed: {str(e)}")
        return HTMLResponse(content=f"<h2>Internal Server Error: {str(e)}</h2>", status_code=500)


# =====================================================
# 2. REAL-TIME KPI DETAILED DATA ENGINE (AJAX JSON)
# =====================================================
@router.get("/api/kpi_data/{kpi_type}")
async def get_kpi_detailed_data(kpi_type: str, request: Request, db: Session = Depends(get_db)):
    if not is_admin(request):
        return JSONResponse(status_code=403, content={"success": False, "error": "Access Denied"})

    today = ist_now().date()
    yesterday = today - timedelta(days=1)
    first_day_this_month = today.replace(day=1)
    response_payload = []

    try:
        # 🟢 FIXED: ACTIVE TODAY & USERS TO SHOW EVERY LOG/OUT TRANSACTION MATCHING THE COUNT
        if kpi_type == "active" or kpi_type == "active_users":
            
            # 🛠️ FIX: కౌంట్ కి మ్యాచ్ అయ్యేలా ఈరోజు మరియు నిన్నటి సెషన్స్ అన్నింటినీ టేబుల్ లో చూపిస్తుంది
            activities = db.query(UserLoginActivity).filter(
                or_(
                    cast(UserLoginActivity.login_at, Date) == today,
                    cast(UserLoginActivity.login_at, Date) == yesterday,
                    UserLoginActivity.session_hours == "Active Now"
                )
            ).order_by(UserLoginActivity.login_at.desc()).all()

            print("TOTAL ACTIVITIES IN JET STREAM =", len(activities))

            for act in activities:
                comp = db.query(Company).filter(Company.company_code == act.company_id).first()
                user = db.query(User).filter(User.id == act.user_id).first()

                if comp and user:
                    response_payload.append({
                        "company_id": comp.company_code,
                        "company_name": comp.company_name,
                        "login_date": act.login_at.strftime("%Y-%m-%d"),
                        "login_time": act.login_at.strftime("%I:%M %p"),
                        "logout_time": act.logout_at.strftime("%I:%M %p") if act.logout_at else "--",
                        "email": user.email,
                        "mobile": user.mobile or "--",
                        "login_hours": act.session_hours,
                        "status": "Online" if act.session_hours == "Active Now" else "Offline"
                    })

        # CASE B: TOTAL REGISTRATIONS
        elif kpi_type == "registrations":
            companies = db.query(Company).order_by(Company.created_at.desc()).all()
            for c in companies:
                admin_user = db.query(User).filter(User.company_id == c.id, User.role == "admin").first()
                response_payload.append({
                    "company_id": c.company_code,
                    "company_name": c.company_name,
                    "login_date": c.created_at.strftime("%Y-%m-%d") if c.created_at else "--",
                    "login_time": c.created_at.strftime("%I:%M %p") if c.created_at else "--",
                    "logout_time": "--",
                    "email": c.email,
                    "mobile": admin_user.mobile if admin_user else "--",
                    "login_hours": "--",
                    "status": "Active" if c.is_active else "Inactive"
                })

        # CASE C: NEW THIS MONTH
        elif kpi_type == "new_month":
            new_companies = db.query(Company).filter(
                cast(Company.created_at, Date) >= first_day_this_month
            ).order_by(Company.created_at.desc()).all()
            
            for c in new_companies:
                admin_user = db.query(User).filter(User.company_id == c.id, User.role == "admin").first()
                response_payload.append({
                    "company_id": c.company_code,
                    "company_name": c.company_name,
                    "login_date": c.created_at.strftime("%Y-%m-%d") if c.created_at else "--",
                    "login_time": c.created_at.strftime("%I:%M %p") if c.created_at else "--",
                    "logout_time": "--",
                    "email": c.email,
                    "mobile": admin_user.mobile if admin_user else "--",
                    "login_hours": "0.0 Hrs",
                    "status": "New"
                })

        # CASE D: OPEN TICKETS
        elif kpi_type == "tickets":
            open_tkts = db.query(SupportTicket).filter(
                SupportTicket.status == "OPEN"
            ).order_by(SupportTicket.created_at.desc()).all()
            
            for t in open_tkts:
                comp = db.query(Company).filter(Company.company_code == t.company_id).first()
                if not comp:
                    try:
                        comp = db.query(Company).filter(Company.id == int(t.company_id)).first()
                    except:
                        comp = None

                admin_user = db.query(User).filter(User.email == t.user_email).first()
                response_payload.append({
                    "company_id": comp.company_code if comp else f"ID: {t.company_id}",
                    "company_name": comp.company_name if comp else "Unknown Entity",
                    "login_date": t.created_at.strftime("%Y-%m-%d") if t.created_at else "--",
                    "login_time": t.created_at.strftime("%I:%M %p") if t.created_at else "--",
                    "logout_time": "--",
                    "email": t.user_email,
                    "mobile": admin_user.mobile if admin_user else "--",
                    "login_hours": "In-Ticket",
                    "status": t.status
                })

        # CASE E: PENDING APPROVALS
        elif kpi_type == "pending_approvals":
            pending = db.query(Company).filter(Company.is_active == False).order_by(Company.created_at.desc()).all()
            for c in pending:
                admin_user = db.query(User).filter(User.company_id == c.id, User.role == "admin").first()
                response_payload.append({
                    "company_id": c.company_code,
                    "company_name": c.company_name,
                    "login_date": c.created_at.strftime("%Y-%m-%d") if c.created_at else "--",
                    "login_time": c.created_at.strftime("%I:%M %p") if c.created_at else "--",
                    "logout_time": "--",
                    "email": c.email,
                    "mobile": admin_user.mobile if admin_user else "--",
                    "address": c.address or "--",
                    "status": "Pending"
                })

        return JSONResponse(content={"success": True, "data": response_payload})

    except Exception as e:
        logger.error(f"KPI Data JSON API Exception: {str(e)}")
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})


@router.post("/approve_company/{company_code}")
async def approve_company(company_code: str, request: Request, db: Session = Depends(get_db)):
    if not is_admin(request):
        return JSONResponse(status_code=403, content={"success": False, "error": "Access Denied"})
    
    comp = db.query(Company).filter(Company.company_code == company_code).first()
    if not comp:
        return JSONResponse(status_code=404, content={"success": False, "error": "Company not found"})
        
    comp.is_active = True
    db.commit()
    admin_user = db.query(User).filter(User.company_id == comp.id, User.role == "admin").first()
    recipient = admin_user.email if admin_user and admin_user.email else comp.email
    approved_at = ist_now().strftime("%d-%m-%Y %I:%M %p IST")

    if recipient:
        try:
            send_email(
                recipient,
                "BKNR ERP - Account Approved",
                professional_email_html(
                    title="Your BKNR ERP account is approved",
                    intro=f"{comp.company_name} has been approved and your ERP access is now active.",
                    content_html=f"""
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:14px;">
                        <tr>
                          <td style="padding:12px;background:#f8fbff;border:1px solid #dbeafe;border-radius:8px;">
                            <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Company ID</div>
                            <div style="font-size:24px;font-weight:800;color:#1d4ed8;margin-top:4px;">{comp.company_code}</div>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:14px 0 0;color:#475569;font-size:14px;line-height:1.6;"><strong>Approved At:</strong> {approved_at}</p>
                      <p style="margin:16px 0 0;color:#475569;font-size:14px;line-height:1.6;">You can now log in to BKNR ERP using your registered email and password.</p>
                    """,
                    note="If you have trouble logging in, please contact BKNR ERP support."
                )
            )
        except Exception as e:
            logger.error(f"Approval confirmation email failed for {recipient}: {e}")

    return {"success": True, "message": f"Company {comp.company_name} approved successfully!"}


@router.post("/reject_company/{company_code}")
async def reject_company(company_code: str, request: Request, db: Session = Depends(get_db)):
    if not is_admin(request):
        return JSONResponse(status_code=403, content={"success": False, "error": "Access Denied"})
    
    comp = db.query(Company).filter(Company.company_code == company_code).first()
    if not comp:
        return JSONResponse(status_code=404, content={"success": False, "error": "Company not found"})
        
    db.delete(comp) # delete the company record if rejected (or we can set is_active = False, but deletion is clean registration rejection)
    db.commit()
    return {"success": True, "message": f"Company {comp.company_name} rejected successfully!"}
