from fastapi import APIRouter, Depends, HTTPException, Request, Form, File, UploadFile
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from pydantic import BaseModel, Field
from datetime import date, datetime, timedelta
from typing import Optional
from pathlib import Path
from uuid import uuid4
import logging, random, json, os, re, requests, secrets, time
from dotenv import load_dotenv

load_dotenv()

from app.database import get_db
from app.database.models.users import Company, User, OTPTable, UserLoginActivity
from app.security.password_handler import hash_password, verify_password
from app.services.setup_service import SetupService
from app.services.default_masters import seed_default_masters
from app.utils.timezone import ist_now
from app.utils.security_secrets import log_development_secret

# =====================================================
router = APIRouter(prefix="/auth", tags=["AUTH"])
templates = Jinja2Templates(directory="app/templates")
# =====================================================

# ================= BREVO CONFIG =================
BREVO_API_KEY = os.getenv("BREVO_API_KEY")
BREVO_URL = "https://api.brevo.com/v3/smtp/email"
SENDER_EMAIL = os.getenv("SMTP_EMAIL", os.getenv("BREVO_SENDER_EMAIL", "bknr.solutions@gmail.com"))
SENDER_NAME = os.getenv("EMAIL_SENDER_NAME", os.getenv("BREVO_SENDER_NAME", "SVBK"))
if not SENDER_NAME or "bknr" in SENDER_NAME.lower():
    SENDER_NAME = "SVBK"
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "bknr.solutions@gmail.com")
logger = logging.getLogger("BKNR_ERP.auth")

OTP_EXPIRY_MIN = 10
RESET_EXPIRY_MIN = 30
TENANT_LOGO_DIR = Path("app/static/uploads/company_logos")
TENANT_LOGO_MAX_BYTES = 2 * 1024 * 1024
TENANT_LOGO_TYPES = {
    "image/png": ("png", b"\x89PNG\r\n\x1a\n"),
    "image/jpeg": ("jpg", b"\xff\xd8\xff"),
    "image/webp": ("webp", b"RIFF"),
}

def activate_exclusive_email_session(db: Session, email: str, session_id: str) -> None:
    normalized_email = str(email or "").strip().lower()
    db.query(User).filter(
        func.lower(func.trim(User.email)) == normalized_email
    ).update(
        {User.current_session_id: session_id},
        synchronize_session=False,
    )

def get_ist_time():
    return ist_now().replace(tzinfo=None)

def require_auth(request: Request):
    email = request.session.get("email")
    if not email:
        raise HTTPException(status_code=303, headers={"Location": "/auth/login"})
    return request.session

def send_email(to_email: str, subject: str, html: str):
    # Try using Brevo transactional HTTP API first if API key is present
    if BREVO_API_KEY:
        try:
            payload = {
                "sender": {"name": SENDER_NAME, "email": SENDER_EMAIL},
                "to": [{"email": to_email}],
                "subject": subject,
                "htmlContent": html
            }
            headers = {
                "accept": "application/json",
                "api-key": BREVO_API_KEY,
                "content-type": "application/json"
            }
            res = requests.post(BREVO_URL, json=payload, headers=headers, timeout=10)
            if res.status_code in [200, 201, 202]:
                logger.info("Email successfully sent via Brevo API")
                return
            else:
                logger.warning("Brevo API rejected email with status %s", res.status_code)
        except Exception as e:
            logger.warning("Brevo API request failed: %s", e)

    # Fallback to standard SMTP if Brevo is not configured or fails
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    SMTP_SERVER = "smtp.gmail.com"
    SMTP_PORT = 587
    sender_email = SENDER_EMAIL
    sender_password = os.getenv("SMTP_PASSWORD")
    sender_name = SENDER_NAME

    if not sender_password:
        raise RuntimeError("Email delivery is not configured")

    try:
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(sender_email, sender_password)
        
        msg = MIMEMultipart()
        msg['From'] = f"{sender_name} <{sender_email}>"
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(html, 'html'))
        
        server.send_message(msg)
        server.quit()
        logger.info("Email successfully sent via Gmail SMTP fallback")
    except Exception as e:
        logger.error("SMTP email delivery failed: %s", e)
        raise RuntimeError("Email delivery failed") from e


def send_security_email(to_email: str, subject: str, html: str, debug_secret: str, debug_label: str):
    try:
        send_email(to_email, subject, html)
    except Exception as exc:
        if log_development_secret(debug_label, debug_secret):
            return
        logger.error("Security email delivery failed", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail="Verification email could not be sent. Please try again later.",
        ) from exc

def professional_email_html(title: str, intro: str, content_html: str, note: str = "", header_title: str = "SVBK") -> str:
    note_html = f"<p style='margin:14px 0 0;color:#64748b;font-size:13px;line-height:1.6;'>{note}</p>" if note else ""
    return f"""
    <!doctype html>
    <html>
    <body style="margin:0;padding:0;background:#eef6ff;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef6ff;padding:24px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dbeafe;border-radius:12px;overflow:hidden;">
              <tr>
                <td style="padding:18px 22px;background:#f8fbff;border-bottom:1px solid #e5eefb;">
                  <div style="font-size:18px;font-weight:800;color:#1d4ed8;">{header_title}</div>
                  <div style="font-size:12px;color:#64748b;margin-top:4px;">Secure business operations notification</div>
                </td>
              </tr>
              <tr>
                <td style="padding:24px 22px;">
                  <h2 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#0f172a;">{title}</h2>
                  <p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.6;">{intro}</p>
                  {content_html}
                  {note_html}
                </td>
              </tr>
              <tr>
                <td style="padding:16px 22px;background:#f8fbff;border-top:1px solid #e5eefb;color:#64748b;font-size:12px;line-height:1.6;">
                  Sent by <strong>SVBK</strong> from {SENDER_EMAIL}<br>
                  For support, contact {SUPPORT_EMAIL}. This is an automated email.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """

def otp_email_html(otp: str, purpose: str, header_title: str = "SVBK") -> str:
    return professional_email_html(
        title=purpose,
        intro="Use the verification code below to continue. Do not share this code with anyone.",
        content_html=f"""
          <div style="margin:18px 0;padding:18px;background:#f0f7ff;border:1px solid #bfdbfe;border-radius:10px;text-align:center;">
            <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Verification Code</div>
            <div style="font-size:32px;font-weight:800;color:#1d4ed8;letter-spacing:6px;margin-top:6px;">{otp}</div>
          </div>
        """,
        note=f"This code expires in {OTP_EXPIRY_MIN} minutes. If you did not request this, please ignore this email.",
        header_title=header_title
    )

def reset_password_email_html(reset_link: str) -> str:
    return professional_email_html(
        title="Reset your SVBK password",
        intro="We received a request to reset your password. Use the secure link below to create a new password.",
        content_html=f"""
          <div style="margin:20px 0;">
            <a href="{reset_link}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px;">Reset Password</a>
          </div>
          <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">If the button does not work, copy and paste this link into your browser:<br><span style="word-break:break-all;color:#2563eb;">{reset_link}</span></p>
        """,
        note=f"This link expires in {RESET_EXPIRY_MIN} minutes."
    )

# ================= REQUEST MODELS =================
class RegisterReq(BaseModel):
    company_name: str = Field(..., min_length=2)
    mpeda_registration_code: str = Field(..., min_length=4, max_length=4)
    user_name: str = Field(..., min_length=2)
    designation: str
    address: str
    mobile: str = Field(..., pattern=r"^[0-9]{10}$")
    email: str = Field(..., pattern=r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")

class OTPReq(BaseModel):
    email: str
    otp: str

class PasswordReq(BaseModel):
    email: str
    password: str

class LoginReq(BaseModel):
    company_id: str
    email: str
    password: str

class ProfileUpdateReq(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    designation: str = Field(default="", max_length=120)
    date_of_birth: Optional[date] = None
    blood_group: str = Field(default="", max_length=10)
    working_location: str = Field(default="", max_length=255)

class ForgotReq(BaseModel):
    email: str

# ================= ROUTES =================

@router.get("/login", response_class=HTMLResponse)
def get_login(request: Request):
    if request.session.get("email"):
        return RedirectResponse("/home", status_code=303)
    return templates.TemplateResponse(
        request=request,
        name="login.html",
        context={"request": request, "show_login": True}
    )

@router.get("/landing", response_class=HTMLResponse)
def get_landing(request: Request):
    if request.session.get("email"):
        return RedirectResponse("/home", status_code=303)
    return templates.TemplateResponse(
        request=request,
        name="login.html",
        context={"request": request, "show_login": False}
    )

@router.get("/register", response_class=HTMLResponse)
def get_register(request: Request):
    if request.session.get("email"):
        return RedirectResponse("/home", status_code=303)
    return templates.TemplateResponse(
        request=request,
        name="login.html",
        context={"request": request, "show_login": True}
    )

@router.post("/register")
def register(data: RegisterReq, db: Session = Depends(get_db)):
    clean_name = data.company_name.strip()
    mpeda_code = re.sub(r"\s+", "", data.mpeda_registration_code.strip().upper())
    if not re.fullmatch(r"[A-Z0-9]{4}", mpeda_code):
        raise HTTPException(
            status_code=400,
            detail="MPEDA Registration Code must contain exactly 4 letters or numbers.",
        )
    active_company = db.query(Company).filter(
        func.lower(func.trim(Company.company_name)) == clean_name.lower(),
        Company.is_active == True
    ).first()
    if active_company:
        raise HTTPException(status_code=400, detail="Company name already registered and active.")
    registered_mpeda = db.query(Company).filter(
        func.upper(func.trim(Company.mpeda_registration_code)) == mpeda_code
    ).first()
    if registered_mpeda:
        raise HTTPException(status_code=400, detail="MPEDA Registration Code is already registered.")

    existing_user = db.query(User).filter(or_(User.email == data.email, User.mobile == data.mobile)).first()
    if existing_user:
        if existing_user.password:
            raise HTTPException(status_code=400, detail="User already registered.")
        else:
            db.delete(existing_user)
            db.commit()
    
    otp = str(random.randint(1000, 9999))
    extra_data = data.model_dump() if hasattr(data, "model_dump") else data.dict()
    extra_data["mpeda_registration_code"] = mpeda_code
    db.query(OTPTable).filter(OTPTable.email == data.email).delete()
    db.add(OTPTable(email=data.email, otp=otp, extra=json.dumps(extra_data), is_used=False, created_at=get_ist_time()))
    db.commit()

    send_security_email(
        data.email,
        "SVBK - Verification Code",
        otp_email_html(otp, "Verify your SVBK email"),
        otp,
        "registration OTP",
    )
    return {"message": "OTP sent"}

@router.post("/verify-otp")
def verify_otp(data: OTPReq, db: Session = Depends(get_db)):
    rec = db.query(OTPTable).filter(OTPTable.email == data.email, OTPTable.otp == data.otp, OTPTable.is_used.is_(False)).first()
    if not rec or get_ist_time() > rec.created_at + timedelta(minutes=OTP_EXPIRY_MIN): 
        raise HTTPException(400, "OTP expired or invalid")
    rec.is_used = True
    
    # If the user already exists, mark them as verified!
    user = db.query(User).filter(User.email == data.email).first()
    user_exists = False
    if user:
        user.is_verified = True
        user_exists = True
        
    db.commit()
    return {"message": "OTP verified", "user_exists": user_exists}

@router.post("/set-password")
def set_password(data: PasswordReq, db: Session = Depends(get_db)):
    rec = db.query(OTPTable).filter(OTPTable.email == data.email, OTPTable.is_used.is_(True)).first()
    if not rec: raise HTTPException(400, "OTP not verified")
    extra = json.loads(rec.extra)

    # ERP tenant code = normalized company prefix + four-character MPEDA code.
    base_code = re.sub(r"[^A-Z0-9]", "", extra["company_name"].upper())[:4].ljust(4, "X")
    new_company_code = f"{base_code}{extra['mpeda_registration_code']}"
    tenant_owner = db.query(Company).filter(
        Company.company_code == new_company_code,
        Company.email != extra["email"],
    ).first()
    if tenant_owner:
        raise HTTPException(400, "Generated ERP Tenant Code is already registered.")

    company = db.query(Company).filter(Company.email == extra["email"]).first()
    mpeda_code = extra.get("mpeda_registration_code")
    if not mpeda_code:
        raise HTTPException(400, "MPEDA Registration Code is missing. Please register again.")
    mpeda_owner = db.query(Company).filter(
        func.upper(func.trim(Company.mpeda_registration_code)) == mpeda_code,
        Company.email != extra["email"],
    ).first()
    if mpeda_owner:
        raise HTTPException(400, "MPEDA Registration Code is already registered.")
    if not company:
        company = Company(
            company_name=extra["company_name"],
            address=extra["address"],
            email=extra["email"],
            company_code=new_company_code,
            mpeda_registration_code=mpeda_code,
            is_active=True,
        )
        db.add(company)
        db.flush()
    elif not company.mpeda_registration_code:
        company.mpeda_registration_code = mpeda_code

    # 🟢 Upsert User
    user = db.query(User).filter(User.email == extra["email"]).first()
    if not user:
        user = User(company_id=company.id, name=extra["user_name"], designation=extra["designation"], email=extra["email"], mobile=extra["mobile"], password=hash_password(data.password), role="admin", permissions="ALL", is_verified=True)
        db.add(user)
    else:
        user.company_id = company.id
        user.password = hash_password(data.password)
        user.is_verified = True
    db.flush()

    # 🌱 Seed default masters for new company
    try:
        seed_default_masters(db, company.company_code, email=extra.get("email", "system@bknr.com"))
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"SEED MASTERS ERROR: {e}")
        raise HTTPException(500, detail=f"Database setup failed during master seeding: {e}")

    try:
        send_email(
            company.email,
            "SVBK - Account Created",
            professional_email_html(
                title="Your SVBK account has been created",
                intro="Your company account is ready. Please keep the ERP tenant code below for login and admin access.",
                content_html=f"""
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:14px;">
                    <tr>
                      <td style="padding:12px;background:#f8fbff;border:1px solid #dbeafe;border-radius:8px;">
                        <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">ERP Tenant Code</div>
                        <div style="font-size:24px;font-weight:800;color:#1d4ed8;margin-top:4px;">{company.company_code}</div>
                      </td>
                    </tr>
                  </table>
                """,
                note="Your company may need approval before login is enabled."
            )
        )
    except Exception as e:
        print(f"EMAIL ERROR: {e}")
    return {"company_id": company.company_code}

@router.post("/login")
def login(data: LoginReq, request: Request, db: Session = Depends(get_db)):
    company = db.query(Company).filter(func.upper(func.trim(Company.company_code)) == data.company_id.strip().upper()).first()
    if not company:
        raise HTTPException(400, "Invalid credentials")
    
    if not company.is_active:
        raise HTTPException(400, "Your company has not been approved or is deactivated. Please contact support.")

    normalized_email = data.email.strip().lower()
    user = db.query(User).filter(
        func.lower(func.trim(User.email)) == normalized_email,
        User.company_id == company.id,
    ).first()

    if not user or not verify_password(data.password, user.password):
        raise HTTPException(400, "Invalid credentials")

    # 1. Check active status
    if not getattr(user, "is_active", True):
        raise HTTPException(400, "Account has been deactivated. Please contact your administrator.")

    # 2. Check verification status
    if not getattr(user, "is_verified", False):
        otp = str(random.randint(1000, 9999))
        db.query(OTPTable).filter(OTPTable.email == user.email).delete()
        db.add(OTPTable(
            email=user.email,
            otp=otp,
            extra=json.dumps({"company_code": company.company_code}),
            is_used=False,
            created_at=get_ist_time()
        ))
        db.commit()
        
        send_security_email(
            user.email,
            "SVBK - Email Verification Code",
            otp_email_html(otp, "Verify your SVBK login"),
            otp,
            "email verification OTP",
        )
        
        return JSONResponse(
            status_code=403,
            content={"status": "unverified", "detail": "Email not verified. A verification OTP has been sent to your email."}
        )

    # 3. Generate Login OTP for verified user
    otp = str(random.randint(1000, 9999))
    db.query(OTPTable).filter(OTPTable.email == user.email).delete()
    db.add(OTPTable(
        email=user.email,
        otp=otp,
        extra=json.dumps({"company_code": company.company_code, "purpose": "login"}),
        is_used=False,
        created_at=get_ist_time()
    ))
    db.commit()

    send_security_email(
        user.email,
        f"{company.company_name} - Login Verification Code",
        otp_email_html(otp, "Verify your login", header_title=company.company_name),
        otp,
        "login OTP",
    )

    return JSONResponse({
        "status": "otp_required",
        "email": user.email,
        "company_id": company.company_code
    })


class VerifyLoginOTPReq(BaseModel):
    company_id: str
    email: str
    otp: str


@router.post("/verify-login-otp")
def verify_login_otp(data: VerifyLoginOTPReq, request: Request, db: Session = Depends(get_db)):
    company = db.query(Company).filter(func.upper(func.trim(Company.company_code)) == data.company_id.strip().upper()).first()
    if not company:
        raise HTTPException(400, "Invalid credentials")

    if not company.is_active:
        raise HTTPException(400, "Company account is inactive")
    normalized_email = data.email.strip().lower()
    user = db.query(User).filter(
        func.lower(func.trim(User.email)) == normalized_email,
        User.company_id == company.id,
    ).first()
    if not user:
        raise HTTPException(400, "Invalid credentials")
    if not getattr(user, "is_active", True):
        raise HTTPException(400, "Account has been deactivated")

    # Verify matching active OTP
    rec = db.query(OTPTable).filter(
        OTPTable.email == user.email,
        OTPTable.otp == data.otp.strip(),
        OTPTable.is_used.is_(False)
    ).first()

    if not rec:
        raise HTTPException(400, "Invalid or expired OTP")
    if not rec.created_at or get_ist_time() > rec.created_at + timedelta(minutes=OTP_EXPIRY_MIN):
        rec.is_used = True
        db.commit()
        raise HTTPException(400, "Login OTP has expired")
    try:
        otp_context = json.loads(rec.extra or "{}")
    except (TypeError, ValueError):
        otp_context = {}
    if (
        otp_context.get("purpose") != "login"
        or str(otp_context.get("company_code") or "").strip().upper() != company.company_code.strip().upper()
    ):
        raise HTTPException(400, "OTP does not match this company login")

    rec.is_used = True

    # Ensure user is flagged as verified
    if not getattr(user, "is_verified", False):
        user.is_verified = True

    # Invalidate previous sessions by generating a new session UUID
    import uuid
    session_id = uuid.uuid4().hex
    activate_exclusive_email_session(db, user.email, session_id)

    # Record login activity
    activity = UserLoginActivity(user_id=user.id, company_id=company.company_code, login_at=get_ist_time(), session_hours="Active Now")
    db.add(activity)
    db.commit()

    request.session.update({
        "email": user.email,
        "company_id": company.id,
        "company_code": company.company_code,
        "company_name": company.company_name,
        "company_logo_url": company.logo_path,
        "mpeda_registration_code": company.mpeda_registration_code,
        "name": user.name,
        "role": user.role,
        "permissions": user.permissions,
        "setup_completed": True,
        "last_activity": get_ist_time().timestamp(),
        "session_id": session_id
    })
    return JSONResponse({"status": "success", "setup_completed": True, "next_page": "/app/#/page/dashboard_processing"})

@router.get("/session-info")
def session_info(request: Request, db: Session = Depends(get_db)):
    # Session probing is a state check, not a protected business operation.
    # Returning 200 for guests prevents expected login state from surfacing as
    # a failed network request in React/Vite while protected routes still use
    # their normal 401/redirect guards.
    if not request.session.get("email"):
        return {"authenticated": False}
    now_ts = time.time()
    idle_timeout = int(os.getenv("SESSION_IDLE_TIMEOUT_SECONDS", str(30 * 60)))
    try:
        last_activity = float(request.session.get("last_activity") or now_ts)
    except (TypeError, ValueError):
        last_activity = now_ts
    if now_ts - last_activity > idle_timeout:
        request.session.clear()
        return JSONResponse(
            {"authenticated": False, "session_expired": True, "redirect": "/auth/login"},
            status_code=401,
        )
    session_id = request.session.get("session_id")
    if not session_id:
        request.session.clear()
        return JSONResponse(
            {"authenticated": False, "session_expired": True, "redirect": "/auth/login"},
            status_code=401,
        )
    if session_id:
        user = db.query(User).filter(
            User.company_id == request.session.get("company_id"),
            func.lower(func.trim(User.email)) == str(request.session.get("email") or "").strip().lower(),
        ).first()
        if not user or not getattr(user, "is_active", True) or getattr(user, "current_session_id", None) != session_id:
            request.session.clear()
            return JSONResponse(
                {"authenticated": False, "session_expired": True, "redirect": "/auth/login"},
                status_code=401,
            )
        request.session["email"] = user.email
        request.session["name"] = user.name
        request.session["role"] = user.role
        request.session["permissions"] = user.permissions or ""
    mpeda_code = request.session.get("mpeda_registration_code")
    company = None
    if request.session.get("company_code"):
        company = db.query(Company).filter(
            Company.company_code == request.session.get("company_code")
        ).first()
        if not mpeda_code:
            mpeda_code = company.mpeda_registration_code if company else None
        if mpeda_code:
            request.session["mpeda_registration_code"] = mpeda_code
        request.session["company_logo_url"] = company.logo_path if company else None
    return {
        "authenticated": True,
        "email": request.session.get("email"),
        "name": request.session.get("name"),
        "company_name": request.session.get("company_name"),
        "company_code": request.session.get("company_code"),
        "mpeda_registration_code": mpeda_code,
        "company_logo_url": company.logo_path if company else None,
        "role": request.session.get("role"),
        "permissions": request.session.get("permissions") or [],
    }

def _current_profile(request: Request, db: Session):
    email = str(request.session.get("email") or "").strip().lower()
    company_code = request.session.get("company_code")
    if not email or not company_code:
        raise HTTPException(status_code=401, detail="Session expired")
    company = db.query(Company).filter(Company.company_code == company_code).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    user = db.query(User).filter(
        User.company_id == company.id,
        func.lower(func.trim(User.email)) == email,
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User profile not found")
    return company, user

def _profile_payload(request: Request, db: Session, company: Company, user: User):
    employee = None
    try:
        from app.database.models.attendance import EmployeeRegistration
        # A savepoint keeps profile loading usable on older tenant schemas even
        # if their optional employee-detail columns have not been migrated yet.
        with db.begin_nested():
            employee = db.query(EmployeeRegistration).filter(
                EmployeeRegistration.company_id == company.company_code,
                or_(
                    func.lower(func.trim(EmployeeRegistration.official_email)) == user.email.strip().lower(),
                    func.lower(func.trim(EmployeeRegistration.email)) == user.email.strip().lower(),
                    func.lower(func.trim(EmployeeRegistration.personal_email)) == user.email.strip().lower(),
                ),
            ).first()
    except Exception:
        employee = None
    dob = user.date_of_birth or (employee.dob if employee else None)
    return {
        "name": user.name or (employee.employee_name if employee else "") or "",
        "employee_id": (employee.employee_id if employee else "") or "",
        "email": str(request.session.get("email") or user.email or ""),
        "designation": user.designation or (employee.designation if employee else "") or "",
        "date_of_birth": dob.isoformat() if dob else "",
        "blood_group": user.blood_group or (employee.blood_group if employee else "") or "",
        "working_location": user.working_location or (employee.location if employee else "") or "",
        "address": (employee.present_address if employee else "") or (employee.permanent_address if employee else "") or user.address or "",
        "company_name": company.company_name,
        "company_code": company.company_code,
        "company_logo_url": company.logo_path,
        "role": user.role or "",
    }

def _require_tenant_logo_admin(request: Request, db: Session):
    company, user = _current_profile(request, db)
    role = str(user.role or request.session.get("role") or "").strip().lower()
    email = str(user.email or request.session.get("email") or "").strip().lower()
    if role not in {"admin", "super_admin", "super admin"} and email != "bknr.solutions@gmail.com":
        raise HTTPException(status_code=403, detail="Only tenant administrators can change the company logo")
    return company

@router.get("/tenant-logo")
def tenant_logo(request: Request, db: Session = Depends(get_db)):
    company, _ = _current_profile(request, db)
    return {"status": "success", "company_logo_url": company.logo_path}

@router.post("/tenant-logo")
async def update_tenant_logo(
    request: Request,
    logo: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    company = _require_tenant_logo_admin(request, db)
    content_type = str(logo.content_type or "").lower()
    type_info = TENANT_LOGO_TYPES.get(content_type)
    if not type_info:
        raise HTTPException(status_code=400, detail="Upload a PNG, JPEG or WebP image")
    extension, signature = type_info
    content = await logo.read(TENANT_LOGO_MAX_BYTES + 1)
    if not content:
        raise HTTPException(status_code=400, detail="Logo file is empty")
    if len(content) > TENANT_LOGO_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Logo must be 2 MB or smaller")
    if not content.startswith(signature):
        raise HTTPException(status_code=400, detail="The uploaded file is not a valid image")
    if content_type == "image/webp" and (len(content) < 12 or content[8:12] != b"WEBP"):
        raise HTTPException(status_code=400, detail="The uploaded file is not a valid WebP image")

    TENANT_LOGO_DIR.mkdir(parents=True, exist_ok=True)
    safe_company_code = re.sub(r"[^A-Za-z0-9_-]", "", company.company_code) or "tenant"
    filename = f"{safe_company_code}_{uuid4().hex}.{extension}"
    destination = TENANT_LOGO_DIR / filename
    destination.write_bytes(content)
    old_logo = company.logo_path
    company.logo_path = f"/static/uploads/company_logos/{filename}"
    db.commit()
    request.session["company_logo_url"] = company.logo_path
    if old_logo and old_logo.startswith("/static/uploads/company_logos/"):
        old_path = Path("app") / old_logo.lstrip("/")
        try:
            if old_path.is_file() and old_path != destination:
                old_path.unlink()
        except OSError:
            logger.warning("Unable to remove previous tenant logo: %s", old_path)
    return {"status": "success", "company_logo_url": company.logo_path}

@router.delete("/tenant-logo")
def remove_tenant_logo(request: Request, db: Session = Depends(get_db)):
    company = _require_tenant_logo_admin(request, db)
    old_logo = company.logo_path
    company.logo_path = None
    db.commit()
    request.session["company_logo_url"] = None
    if old_logo and old_logo.startswith("/static/uploads/company_logos/"):
        old_path = Path("app") / old_logo.lstrip("/")
        try:
            if old_path.is_file():
                old_path.unlink()
        except OSError:
            logger.warning("Unable to remove tenant logo: %s", old_path)
    return {"status": "success", "company_logo_url": None}

@router.get("/profile", response_class=HTMLResponse)
def profile_page(request: Request, format: str = "html", db: Session = Depends(get_db)):
    company, user = _current_profile(request, db)
    profile = _profile_payload(request, db, company, user)
    if format.lower() == "json":
        return JSONResponse({"status": "success", "profile": profile})
    return templates.TemplateResponse(
        request=request,
        name="profile.html",
        context={"request": request, "profile": profile},
    )

@router.post("/profile")
def update_profile(data: ProfileUpdateReq, request: Request, db: Session = Depends(get_db)):
    company, user = _current_profile(request, db)
    if data.date_of_birth and data.date_of_birth > date.today():
        raise HTTPException(status_code=400, detail="Date of Birth cannot be in the future")
    blood_group = data.blood_group.strip().upper()
    allowed_blood_groups = {"", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}
    if blood_group not in allowed_blood_groups:
        raise HTTPException(status_code=400, detail="Select a valid blood group")
    user.name = data.name.strip()
    user.designation = data.designation.strip() or "Staff"
    user.date_of_birth = data.date_of_birth
    user.blood_group = blood_group or None
    user.working_location = data.working_location.strip() or None
    request.session["name"] = user.name
    db.commit()
    db.refresh(user)
    return {
        "status": "success",
        "message": "Profile updated successfully.",
        "profile": _profile_payload(request, db, company, user),
    }

@router.post("/forgot-password")
def forgot_password(data: ForgotReq, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user: raise HTTPException(404, "Email not found")
    
    token = secrets.token_urlsafe(32)
    db.query(OTPTable).filter(OTPTable.email == data.email).delete()
    db.add(OTPTable(email=data.email, otp=token, is_used=False, created_at=get_ist_time()))
    db.commit()

    if request.headers.get("x-mobile-app") == "true":
        reset_link = f"bknrerp://reset-password?token={token}"
    else:
        base_url = os.getenv("APP_URL", "https://svbk.in")
        reset_link = f"{base_url}/auth/reset-password?token={token}"

    send_security_email(
        data.email,
        "SVBK - Reset Password",
        reset_password_email_html(reset_link),
        reset_link,
        "password reset link",
    )
    return {"message": "Reset link sent"}

@router.get("/reset-password", response_class=HTMLResponse)
def get_reset_password(request: Request, token: str, db: Session = Depends(get_db)):
    rec = db.query(OTPTable).filter(OTPTable.otp == token, OTPTable.is_used.is_(False)).first()
    if not rec or get_ist_time() > rec.created_at + timedelta(minutes=RESET_EXPIRY_MIN):
        return HTMLResponse("<h2>This password reset link has expired or is invalid.</h2>", status_code=400)
    return templates.TemplateResponse(
        request=request,
        name="reset_password.html",
        context={
            "token": token
        }
    )

@router.post("/reset-password")
def reset_password(token: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    rec = db.query(OTPTable).filter(OTPTable.otp == token, OTPTable.is_used.is_(False)).first()
    if not rec: raise HTTPException(400, "Invalid link")
    user = db.query(User).filter(User.email == rec.email).first()
    user.password = hash_password(password)
    rec.is_used = True
    db.commit()
    
    try:
        send_email(
            user.email,
            "SVBK - Password Changed",
            professional_email_html(
                title="Your password was changed",
                intro="This confirms that your SVBK account password was updated successfully.",
                content_html="<p style='margin:0;color:#475569;font-size:14px;line-height:1.6;'>If this change was not made by you, contact support immediately.</p>",
            )
        )
    except: pass
    return RedirectResponse("/", status_code=303)

@router.get("/masters-check")
def masters_check(request: Request, db: Session = Depends(get_db)):
    """Returns True if key masters tables are empty for this company (used for first-login popup)."""
    comp_code = request.session.get("company_code")
    if not comp_code:
        return JSONResponse({"authenticated": False}, status_code=401)
    from app.database.models.criteria import species as SpeciesModel, glazes as GlazesModel
    has_species = db.query(SpeciesModel).filter(SpeciesModel.company_id == comp_code).count()
    has_glazes  = db.query(GlazesModel).filter(GlazesModel.company_id == comp_code).count()
    masters_empty = (has_species == 0 and has_glazes == 0)
    return {"masters_empty": masters_empty, "company_code": comp_code}

@router.get("/auto-login")
def auto_login(request: Request, db: Session = Depends(get_db)):
    if os.getenv("ENVIRONMENT", "development").lower() == "production":
        raise HTTPException(status_code=404, detail="Not found")
    user = db.query(User).filter(User.email == "garikinanagaraju73@gmail.com").first()
    if not user:
        user = db.query(User).first()
    if not user:
        raise HTTPException(404, "No users found in database")
    
    company = db.query(Company).filter(Company.id == user.company_id).first()
    if not company:
        raise HTTPException(404, "No company found for user")

    # Add login activity
    import uuid
    session_id = uuid.uuid4().hex
    activate_exclusive_email_session(db, user.email, session_id)
    activity = UserLoginActivity(user_id=user.id, company_id=company.company_code, login_at=get_ist_time(), session_hours="Active Now")
    db.add(activity)
    db.commit()

    request.session.update({
        "email": user.email,
        "company_id": company.id,
        "company_code": company.company_code,
        "company_name": company.company_name,
        "mpeda_registration_code": company.mpeda_registration_code,
        "name": user.name,
        "role": user.role,
        "permissions": user.permissions,
        "setup_completed": True,
        "last_activity": get_ist_time().timestamp(),
        "session_id": session_id
    })
    return RedirectResponse("/home", status_code=303)

@router.get("/logout")
def logout(request: Request, db: Session = Depends(get_db)):
    email = str(request.session.get("email") or "").strip().lower()
    session_id = request.session.get("session_id")
    if email and session_id:
        db.query(User).filter(
            func.lower(func.trim(User.email)) == email,
            User.current_session_id == session_id,
        ).update(
            {User.current_session_id: None},
            synchronize_session=False,
        )
        db.commit()
    request.session.clear()
    return RedirectResponse("/", status_code=303)


class UIColorsRequest(BaseModel):
    accent: str
    sidebar: str
    header: str
    dashboard: str


@router.post("/ui-colors")
def save_ui_colors(request: Request, data: UIColorsRequest, db: Session = Depends(get_db)):
    email = request.session.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    import json
    if not data.accent.strip() and not data.sidebar.strip() and not data.header.strip() and not data.dashboard.strip():
        user.ui_colors = None
    else:
        user.ui_colors = json.dumps({
            "accent": data.accent,
            "sidebar": data.sidebar,
            "header": data.header,
            "dashboard": data.dashboard
        })
    db.commit()
    return {"success": True, "message": "UI colors saved to database successfully"}


@router.get("/global-dropdowns")
def global_dropdowns(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    if not email:
        return JSONResponse({"status": "error", "message": "Not authenticated"}, status_code=401)
        
    company_code = request.session.get("company_code")
    if not company_code:
        return JSONResponse({"status": "success", "companies": [], "locations": []})

    from app.database.models.criteria import peeling_at, production_at, production_for
    from app.database.models.inventory_management import cold_storage
    from sqlalchemy import func
    from app.services.cache import cache_get_or_set

    def build_menu_filters():
        companies = {
            str(value).strip()
            for (value,) in db.query(production_for.production_for).filter(
                production_for.company_id == company_code,
                func.lower(production_for.status) == "active",
            ).distinct().all()
            if value and str(value).strip()
        }
        locations = {
            str(value).strip()
            for model, column in (
                (production_at, production_at.production_at),
                (peeling_at, peeling_at.peeling_at),
            )
            for (value,) in db.query(column).filter(model.company_id == company_code).distinct().all()
            if value and str(value).strip()
        }
        locations.update(
            str(value).strip()
            for (value,) in db.query(cold_storage.storage_name).filter(
                cold_storage.company_id == company_code,
                func.lower(cold_storage.is_active) == "active",
            ).distinct().all()
            if value and str(value).strip()
        )
        return {"companies": sorted(companies), "locations": sorted(locations)}

    try:
        menu_filters = cache_get_or_set(
            f"bknr:menu:{company_code}:universal_filters:v2",
            build_menu_filters,
            ttl=300,
        )
        return {
            "status": "success",
            "companies": menu_filters["companies"],
            "locations": menu_filters["locations"]
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}
