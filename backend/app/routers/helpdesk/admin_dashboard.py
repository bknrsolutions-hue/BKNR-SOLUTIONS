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

# 🔴  ‌:
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
        latest_messages = db.query(TicketMessage).order_by(TicketMessage.sent_at.desc()).limit(50).all()

        today = ist_now().date()
        yesterday = today - timedelta(days=1)
        start_yesterday = datetime.combine(yesterday, datetime.min.time())
        first_day_this_month = datetime.combine(today.replace(day=1), datetime.min.time())

        # KPI 1: Total Registrations
        total_registrations = db.query(Company).count()

        # KPI 2 & 3: Active Companies (unique company_id) & Active Users (unique email)
        active_activities = db.query(UserLoginActivity.company_id, UserLoginActivity.user_id).filter(
            or_(
                UserLoginActivity.login_at >= start_yesterday,
                UserLoginActivity.session_hours == "Active Now"
            )
        ).all()

        today_active_company_ids = set(act.company_id for act in active_activities if act.company_id)
        user_ids = list(set(act.user_id for act in active_activities if act.user_id))

        active_user_emails = set()
        if user_ids:
            active_user_emails = set(
                email.strip().lower()
                for (email,) in db.query(User.email).filter(User.id.in_(user_ids)).all()
                if email
            )

        today_active = len(today_active_company_ids)
        active_users = len(active_user_emails)

        # KPI 4: New This Month
        new_this_month = db.query(Company).filter(
            Company.created_at >= first_day_this_month
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
    start_yesterday = datetime.combine(yesterday, datetime.min.time())
    first_day_this_month = datetime.combine(today.replace(day=1), datetime.min.time())
    response_payload = []

    try:
        if kpi_type in {"active", "active_users"}:
            activities = db.query(UserLoginActivity).filter(
                or_(
                    UserLoginActivity.login_at >= start_yesterday,
                    UserLoginActivity.session_hours == "Active Now"
                )
            ).order_by(UserLoginActivity.login_at.desc()).limit(300).all()

            # Batch fetch related companies and users to avoid N+1 queries
            comp_codes = {act.company_id for act in activities if act.company_id}
            user_ids = {act.user_id for act in activities if act.user_id}

            companies_map = {c.company_code: c for c in db.query(Company).filter(Company.company_code.in_(comp_codes)).all()} if comp_codes else {}
            users_map = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}

            seen_keys = set()
            for act in activities:
                comp = companies_map.get(act.company_id)
                user = users_map.get(act.user_id)
                if comp and user:
                    # Deduplicate by unique company_id for Active Companies, and by unique email for Active Users
                    dedup_key = comp.company_code if kpi_type == "active" else user.email.strip().lower()
                    if dedup_key in seen_keys:
                        continue
                    seen_keys.add(dedup_key)

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


        elif kpi_type == "registrations":
            companies = db.query(Company).order_by(Company.created_at.desc()).limit(200).all()
            comp_ids = [c.id for c in companies]
            admin_users = {u.company_id: u for u in db.query(User).filter(User.company_id.in_(comp_ids), User.role == "admin").all()} if comp_ids else {}
            for c in companies:
                admin_user = admin_users.get(c.id)
                response_payload.append({
                    "company_id": c.company_code,
                    "mpeda_registration_code": c.mpeda_registration_code or "--",
                    "company_name": c.company_name,
                    "login_date": c.created_at.strftime("%Y-%m-%d") if c.created_at else "--",
                    "login_time": c.created_at.strftime("%I:%M %p") if c.created_at else "--",
                    "logout_time": "--",
                    "email": c.email,
                    "mobile": admin_user.mobile if admin_user else "--",
                    "login_hours": "--",
                    "status": "Active" if c.is_active else "Inactive"
                })

        elif kpi_type == "new_month":
            new_companies = db.query(Company).filter(
                Company.created_at >= first_day_this_month
            ).order_by(Company.created_at.desc()).limit(200).all()
            comp_ids = [c.id for c in new_companies]
            admin_users = {u.company_id: u for u in db.query(User).filter(User.company_id.in_(comp_ids), User.role == "admin").all()} if comp_ids else {}
            for c in new_companies:
                admin_user = admin_users.get(c.id)
                response_payload.append({
                    "company_id": c.company_code,
                    "mpeda_registration_code": c.mpeda_registration_code or "--",
                    "company_name": c.company_name,
                    "login_date": c.created_at.strftime("%Y-%m-%d") if c.created_at else "--",
                    "login_time": c.created_at.strftime("%I:%M %p") if c.created_at else "--",
                    "logout_time": "--",
                    "email": c.email,
                    "mobile": admin_user.mobile if admin_user else "--",
                    "login_hours": "0.0 Hrs",
                    "status": "New"
                })

        elif kpi_type == "tickets":
            open_tkts = db.query(SupportTicket).filter(
                SupportTicket.status == "OPEN"
            ).order_by(SupportTicket.created_at.desc()).limit(200).all()
            user_emails = {t.user_email for t in open_tkts if t.user_email}
            users_by_email = {u.email: u for u in db.query(User).filter(User.email.in_(user_emails)).all()} if user_emails else {}
            comp_codes = {t.company_id for t in open_tkts if t.company_id}
            companies_map = {c.company_code: c for c in db.query(Company).filter(Company.company_code.in_(comp_codes)).all()} if comp_codes else {}

            for t in open_tkts:
                comp = companies_map.get(t.company_id)
                admin_user = users_by_email.get(t.user_email)
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

        elif kpi_type == "pending_approvals":
            pending = db.query(Company).filter(Company.is_active == False).order_by(Company.created_at.desc()).limit(200).all()
            comp_ids = [c.id for c in pending]
            admin_users = {u.company_id: u for u in db.query(User).filter(User.company_id.in_(comp_ids), User.role == "admin").all()} if comp_ids else {}
            for c in pending:
                admin_user = admin_users.get(c.id)
                response_payload.append({
                    "company_id": c.company_code,
                    "mpeda_registration_code": c.mpeda_registration_code or "--",
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
                "SVBK - Account Approved",
                professional_email_html(
                    title="Your SVBK account is approved",
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
                      <p style="margin:16px 0 0;color:#475569;font-size:14px;line-height:1.6;">You can now log in to SVBK using your registered email and password.</p>
                    """,
                    note="If you have trouble logging in, please contact SVBK support."
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
