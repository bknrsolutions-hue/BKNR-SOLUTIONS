from fastapi import APIRouter, Depends, HTTPException, Request, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from pydantic import BaseModel
from datetime import datetime, timedelta
import random, json, os, requests, secrets
from dotenv import load_dotenv

load_dotenv()

from app.database import get_db
from app.database.models.users import Company, User, OTPTable
from app.security.password_handler import hash_password, verify_password

# =====================================================
router = APIRouter(prefix="/auth", tags=["AUTH"])
templates = Jinja2Templates(directory="app/templates")
# =====================================================

# ================= BREVO CONFIG =================
BREVO_API_KEY = os.getenv("BREVO_API_KEY")
BREVO_URL = "https://api.brevo.com/v3/smtp/email"

SENDER_EMAIL = "bknr.solutions@gmail.com"
SENDER_NAME = "BKNR ERP"

OTP_EXPIRY_MIN = 10
RESET_EXPIRY_MIN = 30
SESSION_EXPIRY_MIN = 30  # ⏱️ 30 నిమిషాల సెషన్ టైమ్‌అవుట్ లిమిట్


# ================= EMAIL FUNCTION =================
def send_email(to_email: str, subject: str, html: str):
    if not BREVO_API_KEY:
        raise HTTPException(500, "Email service not configured")

    payload = {
        "sender": {"email": SENDER_EMAIL, "name": SENDER_NAME},
        "to": [{"email": to_email}],
        "subject": subject,
        "htmlContent": html
    }

    headers = {
        "api-key": BREVO_API_KEY,
        "content-type": "application/json"
    }

    res = requests.post(BREVO_URL, json=payload, headers=headers)
    if res.status_code >= 400:
        raise HTTPException(500, "Email sending failed")

    print("✅ Email sent:", to_email)


# ================= REQUEST MODELS =================
class RegisterReq(BaseModel):
    company_name: str
    user_name: str
    designation: str
    address: str
    mobile: str
    email: str


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


# ================= 🛡️ NO-CACHE RESPONSES HELPER =================
# బ్రౌజర్ బ్యాక్/ఫార్వర్డ్ బటన్స్ హిస్టరీ నుండి పాత పేజీల డేటాను లోడ్ చేయకుండా ఆపే హెడర్స్
def apply_no_cache_headers(response):
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response


# ================= SESSION EXPIRY DEPENDENCY =================
# ఇతర ప్రొటెక్టెడ్ రూట్స్ (eg: /home, /dashboard) దగ్గర దీనిని Dependency గా వాడాలి.
def get_current_user(request: Request):
    session_data = request.session
    if not session_data or "last_activity" not in session_data:
        request.session.clear()
        raise HTTPException(status_code=401, detail="Session expired or invalid. Please login again.")
    
    last_activity_str = session_data.get("last_activity")
    last_activity = datetime.fromisoformat(last_activity_str)
    
    # 30 నిమిషాల ఇన్-యాక్టివిటీ టైమ్ వెరిఫికేషన్
    if datetime.now() > last_activity + timedelta(minutes=SESSION_EXPIRY_MIN):
        request.session.clear()
        raise HTTPException(status_code=401, detail="Session expired due to inactivity.")
    
    # సెషన్ యాక్టివ్‌గా ఉంటే టైమ్‌స్టాంప్‌ను అప్‌డేట్ చేస్తుంది (Sliding Expiry)
    request.session["last_activity"] = datetime.now().isoformat()
    return session_data


# =====================================================
# REGISTER → SEND OTP
# =====================================================
@router.post("/register")
def register(data: RegisterReq, db: Session = Depends(get_db)):

    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(400, "Email already registered")

    otp = str(random.randint(1000, 9999))

    db.query(OTPTable).filter(OTPTable.email == data.email).delete()
    db.add(OTPTable(
        email=data.email,
        otp=otp,
        extra=json.dumps(data.dict()),
        is_used=False,
        created_at=datetime.now()
    ))
    db.commit()

    send_email(
        data.email,
        "BKNR ERP – OTP Verification",
        f"<h2>{otp}</h2><p>Valid for {OTP_EXPIRY_MIN} minutes</p>"
    )

    return {"message": "OTP sent"}


# =====================================================
# VERIFY OTP
# =====================================================
@router.post("/verify-otp")
def verify_otp(data: OTPReq, db: Session = Depends(get_db)):

    rec = db.query(OTPTable).filter(
        OTPTable.email == data.email,
        OTPTable.otp == data.otp,
        OTPTable.is_used.is_(False)
    ).first()

    if not rec or datetime.now() > rec.created_at + timedelta(minutes=OTP_EXPIRY_MIN):
        raise HTTPException(400, "OTP expired or invalid")

    rec.is_used = True
    db.commit()

    return {"message": "OTP verified"}


# =====================================================
# SET PASSWORD
# =====================================================
@router.post("/set-password")
def set_password(data: PasswordReq, db: Session = Depends(get_db)):

    rec = db.query(OTPTable).filter(
        OTPTable.email == data.email,
        OTPTable.is_used.is_(True)
    ).first()

    if not rec:
        raise HTTPException(400, "OTP not verified")

    extra = json.loads(rec.extra)

    company = db.query(Company).filter(Company.email == extra["email"]).first()
    if not company:
        company = Company(
            company_name=extra["company_name"],
            address=extra["address"],
            email=extra["email"],
            company_code=extra["company_name"][:4].upper() + str(random.randint(1000, 9999)),
            is_active=True
        )
        db.add(company)
        db.commit()
        db.refresh(company)

    user = User(
        company_id=company.id,
        name=extra["user_name"],
        designation=extra["designation"],
        email=extra["email"],
        mobile=extra["mobile"],
        password=hash_password(data.password),
        role="admin",
        permissions="ALL",
        is_verified=True
    )

    db.add(user)
    db.commit()

    return {"company_id": company.company_code}


# =====================================================
# LOGIN (WITH CACHE SECURITY)
# =====================================================
@router.post("/login")
def login(data: LoginReq, request: Request, db: Session = Depends(get_db)):

    company = db.query(Company).filter(
        Company.company_code == data.company_id
    ).first()
    if not company:
        raise HTTPException(400, "Invalid Company ID")

    user = db.query(User).filter(
        User.email == data.email,
        User.company_id == company.id
    ).first()

    if not user or not verify_password(data.password, user.password):
        raise HTTPException(400, "Invalid credentials")

    # ✅ SESSION SET & TIME TRACKING
    request.session.update({
        "email": user.email,
        "company_id": company.id,
        "company_code": company.company_code,
        "name": user.name,
        "role": user.role,
        "permissions": user.permissions,
        "last_activity": datetime.now().isoformat()
    })

    # ✅ COOKIE RESPONSE WITH CACHE CONTROL
    response = JSONResponse({
        "status": "success",
        "message": "Login Successful"
    })

    response.set_cookie(
        key="session",
        value="active",
        httponly=True
    )

    # 🛡️ లాగిన్ రెస్పాన్స్‌కు నో-క్యాచీ హెడర్స్ అప్లై చేస్తున్నాం
    return apply_no_cache_headers(response)


# =====================================================
# 🔍 LIVE SESSION CHECK ENDPOINT FOR FRONTEND
# =====================================================
# మెనూ/హోమ్ పేజీ లోడ్ అవ్వగానే క్లయింట్ సైడ్ నుండి ఈ ఎండ్‌పాయింట్‌ని కాల్ చేసి వెరిఫై చేసుకోవచ్చు.
@router.get("/check-session")
def check_session(session: dict = Depends(get_current_user)):
    return {"status": "authenticated", "company_code": session.get("company_code")}


# =====================================================
# FORGOT PASSWORD
# =====================================================
@router.post("/forgot-password")
def forgot_password(data: ForgotReq, request: Request, db: Session = Depends(get_db)):

    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(404, "Email not registered")

    token = secrets.token_urlsafe(32)

    db.query(OTPTable).filter(OTPTable.email == data.email).delete()
    db.add(OTPTable(
        email=data.email,
        otp=token,
        is_used=False,
        created_at=datetime.now()
    ))
    db.commit()

    reset_link = f"{request.base_url}auth/reset-password?token={token}"

    send_email(
        data.email,
        "BKNR ERP – Reset Password",
        f"<a href='{reset_link}'>Reset Password</a>"
    )

    return {"message": "Reset link sent"}


# =====================================================
# RESET PASSWORD PAGE
# =====================================================
@router.get("/reset-password", response_class=HTMLResponse)
def reset_password_page(request: Request, token: str, db: Session = Depends(get_db)):

    rec = db.query(OTPTable).filter(
        OTPTable.otp == token,
        OTPTable.is_used.is_(False)
    ).first()

    if not rec or datetime.now() > rec.created_at + timedelta(minutes=RESET_EXPIRY_MIN):
        return HTMLResponse("<h3>Link expired</h3>")

    response = templates.TemplateResponse(
        request=request,
        name="reset_password.html",
        context={"token": token}
    )
    return apply_no_cache_headers(response)


# =====================================================
# RESET PASSWORD SAVE
# =====================================================
@router.post("/reset-password")
def reset_password(
    token: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):

    rec = db.query(OTPTable).filter(
        OTPTable.otp == token,
        OTPTable.is_used.is_(False)
    ).first()

    if not rec:
        raise HTTPException(400, "Invalid link")

    user = db.query(User).filter(User.email == rec.email).first()
    if not user:
        raise HTTPException(404, "User not found")

    user.password = hash_password(password)
    rec.is_used = True

    db.commit()

    response = RedirectResponse("/", status_code=303)
    return apply_no_cache_headers(response)


# =====================================================
# LOGOUT (FORCE CLEAR & REDIRECT)
# =====================================================
@router.get("/logout")
def logout(request: Request):
    request.session.clear()
    response = RedirectResponse("/", status_code=303)
    # లాగ్‌అవుట్ అయ్యాక బ్రౌజర్ ఫార్వర్డ్ బటన్ నొక్కినా మెనూ పేజీ రాకుండా హెడర్స్ క్లియర్ చేస్తుంది
    return apply_no_cache_headers(response)