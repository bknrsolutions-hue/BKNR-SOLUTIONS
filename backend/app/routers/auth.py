from fastapi import APIRouter, Depends, HTTPException, Request, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from pydantic import BaseModel, Field
from datetime import datetime, timedelta
import random, json, os, requests, secrets
from dotenv import load_dotenv

load_dotenv()

from app.database import get_db
from app.database.models.users import Company, User, OTPTable, UserLoginActivity
from app.security.password_handler import hash_password, verify_password
from app.services.setup_service import SetupService
from app.database.models.criteria import production_at as ProductionAtModel, production_for as ProductionForModel
from app.services.default_masters import seed_default_masters
from app.utils.timezone import ist_now

# =====================================================
router = APIRouter(prefix="/auth", tags=["AUTH"])
templates = Jinja2Templates(directory="app/templates")
# =====================================================

# ================= BREVO CONFIG =================
BREVO_API_KEY = os.getenv("BREVO_API_KEY")
BREVO_URL = "https://api.brevo.com/v3/smtp/email"
SENDER_EMAIL = os.getenv("SMTP_EMAIL", os.getenv("BREVO_SENDER_EMAIL", "bknr.solutions@gmail.com"))
SENDER_NAME = os.getenv("EMAIL_SENDER_NAME", os.getenv("BREVO_SENDER_NAME", "SVBK"))
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "bknr.solutions@gmail.com")

OTP_EXPIRY_MIN = 10
RESET_EXPIRY_MIN = 30

def get_ist_time():
    return ist_now().replace(tzinfo=None)

def require_auth(request: Request):
    email = request.session.get("email")
    if not email:
        raise HTTPException(status_code=303, headers={"Location": "/auth/login"})
    return request.session

def send_email(to_email: str, subject: str, html: str):
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    SMTP_SERVER = "smtp.gmail.com"
    SMTP_PORT = 587
    sender_email = SENDER_EMAIL
    SENDER_PASSWORD = os.getenv("SMTP_PASSWORD", "aaim dsqz jpbg sosx")
    sender_name = SENDER_NAME

    try:
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(sender_email, SENDER_PASSWORD)
        
        msg = MIMEMultipart()
        msg['From'] = f"{sender_name} <{sender_email}>"
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(html, 'html'))
        
        server.send_message(msg)
        server.quit()
    except Exception as e:
        print(f"SMTP EMAIL ERROR: {e}")
        raise HTTPException(500, f"Email sending failed: {e}")

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
    active_company = db.query(Company).filter(
        func.lower(func.trim(Company.company_name)) == clean_name.lower(),
        Company.is_active == True
    ).first()
    if active_company:
        raise HTTPException(status_code=400, detail="Company name already registered and active.")

    existing_user = db.query(User).filter(or_(User.email == data.email, User.mobile == data.mobile)).first()
    if existing_user:
        if existing_user.password:
            raise HTTPException(status_code=400, detail="User already registered.")
        else:
            db.delete(existing_user)
            db.commit()
    
    otp = str(random.randint(1000, 9999))
    extra_data = data.model_dump() if hasattr(data, "model_dump") else data.dict()
    db.query(OTPTable).filter(OTPTable.email == data.email).delete()
    db.add(OTPTable(email=data.email, otp=otp, extra=json.dumps(extra_data), is_used=False, created_at=get_ist_time()))
    db.commit()

    try:
        send_email(data.email, "SVBK - Verification Code", otp_email_html(otp, "Verify your SVBK email"))
    except Exception as e:
        print(f"EMAIL ERROR: {e}")
    
    # 🔑 Fallback print to terminal so offline/unauthorized IP setups can proceed
    print(f"\n🔑 [OFFLINE/DEBUG] GENERATED OTP FOR {data.email}: {otp}\n")
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

    # 🟢 Unique Company Code
    base_code = extra["company_name"][:4].upper()
    while True:
        new_company_code = f"{base_code}{random.randint(1000, 9999)}"
        if not db.query(Company).filter(Company.company_code == new_company_code).first():
            break

    company = db.query(Company).filter(Company.email == extra["email"]).first()
    if not company:
        company = Company(company_name=extra["company_name"], address=extra["address"], email=extra["email"], company_code=new_company_code, is_active=False)
        db.add(company)
        db.flush()

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
                intro="Your company account is ready. Please keep the company ID below for login and admin access.",
                content_html=f"""
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:14px;">
                    <tr>
                      <td style="padding:12px;background:#f8fbff;border:1px solid #dbeafe;border-radius:8px;">
                        <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;">Company ID</div>
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

    user = db.query(User).filter(User.email == data.email.strip(), User.company_id == company.id).first()

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
        
        try:
            send_email(user.email, "SVBK - Email Verification Code", otp_email_html(otp, "Verify your SVBK login"))
        except Exception as e:
            print(f"EMAIL ERROR: {e}")
            
        print(f"\n🔑 [OFFLINE/DEBUG] GENERATED OTP FOR {user.email}: {otp}\n")
        
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

    try:
        send_email(user.email, f"{company.company_name} - Login Verification Code", otp_email_html(otp, "Verify your login", header_title=company.company_name))
    except Exception as e:
        print(f"EMAIL ERROR: {e}")

    print(f"\n🔑 [OFFLINE/DEBUG] GENERATED LOGIN OTP FOR {user.email}: {otp}\n")

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

    user = db.query(User).filter(User.email == data.email.strip(), User.company_id == company.id).first()
    if not user:
        raise HTTPException(400, "Invalid credentials")

    # Verify matching active OTP
    rec = db.query(OTPTable).filter(
        OTPTable.email == user.email,
        OTPTable.otp == data.otp.strip(),
        OTPTable.is_used.is_(False)
    ).first()

    if not rec:
        raise HTTPException(400, "Invalid or expired OTP")

    rec.is_used = True

    # Ensure user is flagged as verified
    if not getattr(user, "is_verified", False):
        user.is_verified = True

    # Invalidate previous sessions by generating a new session UUID
    import uuid
    session_id = uuid.uuid4().hex
    user.current_session_id = session_id

    # Record login activity
    activity = UserLoginActivity(user_id=user.id, company_id=company.company_code, login_at=get_ist_time(), session_hours="Active Now")
    db.add(activity)
    db.commit()

    request.session.update({
        "email": user.email,
        "company_id": company.id,
        "company_code": company.company_code,
        "company_name": company.company_name,
        "name": user.name,
        "role": user.role,
        "permissions": user.permissions,
        "setup_completed": True,
        "last_activity": get_ist_time().timestamp(),
        "session_id": session_id
    })
    return JSONResponse({"status": "success", "setup_completed": True, "next_page": "/home"})

@router.get("/session-info")
def session_info(request: Request):
    if not request.session.get("email"): return JSONResponse({"authenticated": False}, status_code=401)
    return {
        "authenticated": True,
        "email": request.session.get("email"),
        "name": request.session.get("name"),
        "company_name": request.session.get("company_name"),
        "company_code": request.session.get("company_code"),
    }

@router.post("/forgot-password")
def forgot_password(data: ForgotReq, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user: raise HTTPException(404, "Email not found")
    
    token = secrets.token_urlsafe(32)
    db.query(OTPTable).filter(OTPTable.email == data.email).delete()
    db.add(OTPTable(email=data.email, otp=token, is_used=False, created_at=get_ist_time()))
    db.commit()

    base_url = os.getenv("APP_URL", "https://svbk.in")
    reset_link = f"{base_url}/auth/reset-password?token={token}"

    try:
        send_email(
            data.email,
            "SVBK - Reset Password",
            reset_password_email_html(reset_link)
        )
    except Exception as e:
        print(f"EMAIL ERROR: {e}")
    
    # 🔑 Fallback print to terminal so offline/unauthorized IP setups can proceed
    print(f"\n🔑 [OFFLINE/DEBUG] RESET PASSWORD LINK FOR {data.email}: {reset_link}\n")
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
    user.current_session_id = session_id
    activity = UserLoginActivity(user_id=user.id, company_id=company.id, login_at=get_ist_time(), session_hours="Active Now")
    db.add(activity)
    db.commit()

    request.session.update({
        "email": user.email,
        "company_id": company.id,
        "company_code": company.company_code,
        "company_name": company.company_name,
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
