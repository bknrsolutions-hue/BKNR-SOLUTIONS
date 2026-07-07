from app.utils.timezone import ist_now
from fastapi import APIRouter, Request, Form, Depends, HTTPException
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import random
import json

from app.database import get_db
from app.database.models.users import User, Company, OTPTable
from app.security.password_handler import hash_password
from app.routers.auth import get_ist_time, professional_email_html, send_email

# ==========================================================
# CONFIG & INITIALIZATION PARAMETERS
# ==========================================================
router = APIRouter(prefix="/admin", tags=["Admin"])
templates = Jinja2Templates(directory="app/templates")

SESSION_EXPIRY_MIN = 30  # ⏱️ 30 min session timeout trace limit


# ==========================================================
# 🛡️ ANTI-CACHE HEADERS SECURITY LAYER INTERACTION HELPER
# ==========================================================
def apply_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


# ==========================================================
# 🔒 STRICT SYSTEM ACCESS PERMISSION VERIFICATION LAYER
# ==========================================================
def check_dashboard_access(request: Request):
    """
    Strict security dependency layer structure verifying active session bounds, 
    multi-company isolation matrices alignment constraints, and dashboard permissions validation rules map.
    """
    session_data = request.session
    if not session_data or "last_activity" not in session_data:
        request.session.clear()
        raise HTTPException(status_code=401, detail="Session layout template profile mapping error or expired token context.")

    # Validation rules mapping check loop execution timestamps definitions
    last_activity_str = session_data.get("last_activity")
    try:
        last_activity = datetime.fromisoformat(last_activity_str)
    except Exception:
        request.session.clear()
        raise HTTPException(status_code=401, detail="Session verification metadata encryption mismatch sequence detected.")

    # 30 min session timeout verification structure bounds check allocation
    if ist_now() > last_activity + timedelta(minutes=SESSION_EXPIRY_MIN):
        request.session.clear()
        raise HTTPException(status_code=401, detail="Inactivity runtime window verification threshold trace execution timeout breach.")

    # Update session activity sliding rules threshold window trace setup parameters
    request.session["last_activity"] = ist_now().isoformat()

    # Core permission data array layout matrix verification matching block
    user_role = session_data.get("role")
    permissions_str = session_data.get("permissions", "")

    # Clean character string splitting layout trace array variables mapping logic check values
    allowed_routes = [p.strip() for p in permissions_str.split(",") if p.strip()]

    # Global master administrator bypass rule settings check blocks execution
    if user_role == "admin" or "ALL" in allowed_routes:
        return session_data

    # Match active dashboard operational context identifier validation rules engine arrays
    if "dashboard" not in allowed_routes and "Dashboard" not in allowed_routes:
        raise HTTPException(status_code=403, detail="Access Authorization Exception: Account credentials do not possess target dashboard access privileges mapping specifications.")

    return session_data


# ==========================================================
# PAGE VIEW – USER MANAGEMENT ENGINE (ADD/EDIT IN ONE PAGE)
# ==========================================================
@router.get("/add_user", response_class=HTMLResponse)
def add_user_page(request: Request, db: Session = Depends(get_db)):
    logged_email = request.session.get("email")
    company_code = request.session.get("company_code")   # example: BKNR5647
    logged_role = request.session.get("role")

    if not logged_email or not company_code:
        return RedirectResponse("/", status_code=302)

    if logged_role != "admin":
        return RedirectResponse("/home?msg=Access Denied", status_code=302)

    # Company Wise Data Filter configuration boundary schema mapping
    company = db.query(Company).filter(
        Company.company_code == company_code
    ).first()

    if not company:
        return RedirectResponse("/", status_code=302)

    # Strictly fetch rows filtered inside multi-company structural domain scope
    users = (
        db.query(User)
        .filter(User.company_id == company.id)
        .order_by(User.id.desc())
        .all()
    )

    response = templates.TemplateResponse(
        request=request, 
        name="admin/add_user.html", 
        context={"existing_users": users, "company_code": company_code}
    )
    return apply_no_cache_headers(response)


# ==========================================================
# SAVE USER (CREATE ACTION)
# ==========================================================
@router.post("/add_user")
def save_user(
    request: Request,
    full_name: str = Form(...),
    designation: str = Form(...),
    email: str = Form(...),
    mobile: str = Form(...),
    password: str = Form("123456"),
    role: str = Form("user"),
    access: list[str] = Form([]),
    data_management_access: str = Form(None),
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")
    logged_role = request.session.get("role")
    if not company_code or logged_role != "admin":
        return RedirectResponse("/", status_code=302)

    # Company wise multi-tenant schema isolation validation checks mapping logic block execution sequences
    company = db.query(Company).filter(Company.company_code == company_code).first()
    if not company:
        return RedirectResponse("/", status_code=302)

    # Unique parameters verification strictly mapped bounded to target tenant ecosystem identity boundary
    if db.query(User).filter(User.email == email, User.company_id == company.id).first():
        return RedirectResponse("/admin/add_user?msg=Email Exists", status_code=302)

    if db.query(User).filter(User.mobile == mobile, User.company_id == company.id).first():
        return RedirectResponse("/admin/add_user?msg=Mobile Exists", status_code=302)

    permissions_csv = ",".join(access)

    new_user = User(
        company_id=company.id,
        name=full_name,
        designation=designation,
        email=email,
        mobile=mobile,
        password=hash_password(password if password else "123456"),
        role=role,
        permissions=permissions_csv,
        data_management_access=(data_management_access == "true"),
        is_verified=False,
        is_active=True,
        created_at=ist_now()
    )

    db.add(new_user)
    db.commit()

    # Generate OTP for email verification
    otp = str(random.randint(1000, 9999))
    db.query(OTPTable).filter(OTPTable.email == email).delete()
    db.add(OTPTable(
        email=email,
        otp=otp,
        extra=json.dumps({"company_code": company.company_code}),
        is_used=False,
        created_at=get_ist_time()
    ))
    db.commit()
    
    # Send email with credentials and OTP
    subject = "BKNR ERP – Account Verification Required"
    body_html = professional_email_html(
        title=f"Welcome to BKNR ERP, {full_name}",
        intro=f"An administrator has created your profile under {company.company_name}. Please use the details below to sign in and verify your email.",
        content_html=f"""
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;margin-bottom:18px;">
            <tr><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#64748b;width:36%;">Company ID</td><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#0f172a;font-weight:700;">{company.company_code}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#64748b;">Email</td><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#0f172a;">{email}</td></tr>
            <tr><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#64748b;">Temporary Password</td><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#0f172a;">{password if password else '123456'}</td></tr>
          </table>
          <div style="padding:18px;background:#f0f7ff;border:1px solid #bfdbfe;border-radius:10px;text-align:center;">
            <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Verification Code</div>
            <div style="font-size:32px;font-weight:800;color:#1d4ed8;letter-spacing:6px;margin-top:6px;">{otp}</div>
          </div>
        """,
        note="Please change your password after your first successful login."
    )
    try:
        send_email(email, subject, body_html)
    except Exception as e:
        print(f"EMAIL ERROR: {e}")
        
    print(f"\n🔑 [OFFLINE/DEBUG] GENERATED OTP FOR {email}: {otp}\n")

    response = RedirectResponse("/admin/add_user?msg=User Saved. Verification email sent.", status_code=302)
    return apply_no_cache_headers(response)


# ==========================================================
# COMMIT MODIFY USER (EDIT ACTION MATCHED WITH FRONTEND)
# ==========================================================
@router.post("/edit_user/{uid}")
def edit_user(
    uid: int, 
    request: Request,
    full_name: str = Form(...),
    designation: str = Form(...),
    email: str = Form(...),
    mobile: str = Form(...),
    password: str = Form(None), # Optional field in frontend UI
    role: str = Form(...),
    access: list[str] = Form([]),
    data_management_access: str = Form(None),
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")
    logged_role = request.session.get("role")
    if not company_code or logged_role != "admin":
        return RedirectResponse("/", status_code=302)

    company = db.query(Company).filter(Company.company_code == company_code).first()
    if not company:
        return RedirectResponse("/", status_code=302)

    # Find target profile and isolate boundary inside target client tenant scope
    user = db.query(User).filter(
        User.id == uid,
        User.company_id == company.id
    ).first()

    if not user:
        return RedirectResponse("/admin/add_user?msg=User Not Found", status_code=302)

    # Cross-validation validation to avoid email overlapping duplicates
    email_check = db.query(User).filter(
        User.email == email, 
        User.company_id == company.id,
        User.id != uid
    ).first()
    if email_check:
        return RedirectResponse("/admin/add_user?msg=Email Already Assigned", status_code=302)

    # Cross-validation validation to avoid mobile overlapping duplicates
    mobile_check = db.query(User).filter(
        User.mobile == mobile, 
        User.company_id == company.id,
        User.id != uid
    ).first()
    if mobile_check:
        return RedirectResponse("/admin/add_user?msg=Mobile Already Assigned", status_code=302)

    # Bind request stream objects to data structures
    user.name = full_name
    user.designation = designation
    user.email = email
    user.mobile = mobile
    user.role = role
    user.permissions = ",".join(access)
    user.data_management_access = (data_management_access == "true")

    # If the operator specified a new pass string, inject security layer overhead
    if password and password.strip() != "":
        user.password = hash_password(password.strip())

    db.commit()
    response = RedirectResponse("/admin/add_user?msg=Updated Successfully", status_code=302)
    return apply_no_cache_headers(response)


# ==========================================================
# DISABLE DELETE AND TOGGLE USER ACTIVE STATE
# ==========================================================
@router.post("/delete_user/{uid}")
def delete_user(uid: int, request: Request):
    return RedirectResponse("/admin/add_user?msg=Deletion is disabled. Use active/inactive toggle.", status_code=302)

@router.post("/toggle_user/{uid}")
def toggle_user(uid: int, request: Request, db: Session = Depends(get_db)):
    company_code = request.session.get("company_code")
    logged_role = request.session.get("role")
    if not company_code or logged_role != "admin":
        return RedirectResponse("/", status_code=302)

    company = db.query(Company).filter(Company.company_code == company_code).first()
    if not company:
        return RedirectResponse("/", status_code=302)

    # Find user profile inside target company scope
    user = db.query(User).filter(
        User.id == uid,
        User.company_id == company.id
    ).first()

    if not user:
        return RedirectResponse("/admin/add_user?msg=User Not Found", status_code=302)

    user.is_active = not getattr(user, "is_active", True)
    db.commit()

    status_str = "Activated" if user.is_active else "Deactivated"
    if user.is_active:
        activated_at = ist_now().strftime("%d-%m-%Y %I:%M %p IST")
        try:
            send_email(
                user.email,
                "BKNR ERP - User Access Activated",
                professional_email_html(
                    title="Your BKNR ERP access is active",
                    intro=f"Your user profile under {company.company_name} has been activated by your administrator.",
                    content_html=f"""
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;font-size:14px;margin-top:14px;">
                        <tr><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#64748b;width:36%;">Company ID</td><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#0f172a;font-weight:700;">{company.company_code}</td></tr>
                        <tr><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#64748b;">Email</td><td style="padding:8px;border-bottom:1px solid #e5eefb;color:#0f172a;">{user.email}</td></tr>
                      </table>
                      <p style="margin:14px 0 0;color:#475569;font-size:14px;line-height:1.6;"><strong>Activated At:</strong> {activated_at}</p>
                      <p style="margin:16px 0 0;color:#475569;font-size:14px;line-height:1.6;">You can now log in and continue your assigned ERP work.</p>
                    """,
                    note="If you did not expect this activation, please contact your company administrator."
                )
            )
        except Exception as e:
            print(f"USER ACTIVATION EMAIL ERROR: {e}")

    response = RedirectResponse(f"/admin/add_user?msg=User {status_str} Successfully", status_code=302)
    return apply_no_cache_headers(response)


# ==========================================================
# 📊 🛡️ SECURE PROTECTED DASHBOARD SUITE ENFORCEMENT ROUTE EXAMPLES
# ==========================================================
@router.get("/dashboard-analytics", response_class=HTMLResponse)
def dashboard_analytics_view(request: Request, current_session: dict = Depends(check_dashboard_access), db: Session = Depends(get_db)):
    """
    Example metric endpoint layout binding protecting secure data fields metrics calculations maps layer logic engine.
    """
    company_id = current_session.get("company_id")
    
    # Prathi dashboard backend core queries matrix code component lo query level constraint dynamic rules explicitly inject cheyyali
    # users_count = db.query(User).filter(User.company_id == company_id).count()
    
    response = templates.TemplateResponse(
        request=request,
        name="admin/dashboard_analytics.html",
        context={"company_code": current_session.get("company_code")}
    )
    return apply_no_cache_headers(response)


@router.get("/system_settings", response_class=HTMLResponse)
def system_settings_view(
    request: Request, 
    current_session: dict = Depends(check_dashboard_access), 
    db: Session = Depends(get_db)
):
    logged_role = request.session.get("role")
    if logged_role not in ("admin", "super_admin"):
        return RedirectResponse("/home?msg=Access Denied", status_code=302)

    from app.services.maintenance import get_maintenance_level, get_maintenance_message
    from app.services.deployment import get_lock_status, get_audit_log
    from app.database.models.feature_flags import FeatureFlag, TenantFeatureAccess

    m_level = get_maintenance_level(db)
    m_msg = get_maintenance_message(db)
    lock_state = get_lock_status(db)
    audit_logs = get_audit_log(db, limit=20)
    
    # Feature Flags
    flags = db.query(FeatureFlag).all()
    tenant_overrides = db.query(TenantFeatureAccess).all()

    response = templates.TemplateResponse(
        request=request,
        name="admin/system_settings.html",
        context={
            "request": request,
            "company_code": current_session.get("company_code"),
            "maintenance_level": m_level,
            "maintenance_message": m_msg,
            "lock_status": lock_state,
            "audit_logs": audit_logs,
            "feature_flags": flags,
            "tenant_overrides": tenant_overrides,
        }
    )
    return apply_no_cache_headers(response)
