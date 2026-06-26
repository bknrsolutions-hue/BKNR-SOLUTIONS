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

def get_ist_time():
    return datetime.utcnow() + timedelta(hours=5, minutes=30)

def require_auth(request: Request):
    email = request.session.get("email")
    if not email:
        raise HTTPException(status_code=303, headers={"Location": "/auth/login"})
    return request.session

def send_email(to_email: str, subject: str, html: str):
    if not BREVO_API_KEY:
        raise HTTPException(500, "Email service not configured")
    payload = {
        "sender": {"email": SENDER_EMAIL, "name": SENDER_NAME},
        "to": [{"email": to_email}],
        "subject": subject,
        "htmlContent": html
    }
    headers = {"api-key": BREVO_API_KEY, "content-type": "application/json"}
    res = requests.post(BREVO_URL, json=payload, headers=headers)
    if res.status_code >= 400:
        raise HTTPException(500, "Email sending failed")

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

@router.post("/register")
def register(data: RegisterReq, db: Session = Depends(get_db)):
    existing_user = db.query(User).filter(or_(User.email == data.email, User.mobile == data.mobile)).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="User already registered.")
    
    otp = str(random.randint(1000, 9999))
    extra_data = data.model_dump() if hasattr(data, "model_dump") else data.dict()
    db.query(OTPTable).filter(OTPTable.email == data.email).delete()
    db.add(OTPTable(email=data.email, otp=otp, extra=json.dumps(extra_data), is_used=False, created_at=get_ist_time()))
    db.commit()

    try:
        send_email(data.email, "BKNR ERP – OTP", f"<h2>{otp}</h2>")
    except Exception as e:
        print(f"EMAIL ERROR: {e}")
    return {"message": "OTP sent"}

@router.post("/verify-otp")
def verify_otp(data: OTPReq, db: Session = Depends(get_db)):
    rec = db.query(OTPTable).filter(OTPTable.email == data.email, OTPTable.otp == data.otp, OTPTable.is_used.is_(False)).first()
    if not rec or get_ist_time() > rec.created_at + timedelta(minutes=OTP_EXPIRY_MIN): 
        raise HTTPException(400, "OTP expired or invalid")
    rec.is_used = True
    db.commit()
    return {"message": "OTP verified"}

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
        company = Company(company_name=extra["company_name"], address=extra["address"], email=extra["email"], company_code=new_company_code, is_active=True)
        db.add(company)
        db.commit()
        db.refresh(company)

    # 🟢 Upsert User
    user = db.query(User).filter(User.email == extra["email"]).first()
    if not user:
        user = User(company_id=company.id, name=extra["user_name"], designation=extra["designation"], email=extra["email"], mobile=extra["mobile"], password=hash_password(data.password), role="admin", permissions="ALL", is_verified=True)
        db.add(user)
    else:
        user.company_id = company.id
        user.password = hash_password(data.password)
        user.is_verified = True
    db.commit()

    try:
        send_email(company.email, "BKNR ERP - Account Created", f"ID: {company.company_code}")
    except Exception as e:
        print(f"EMAIL ERROR: {e}")
    return {"company_id": company.company_code}

@router.post("/login")
def login(data: LoginReq, request: Request, db: Session = Depends(get_db)):
    company = db.query(Company).filter(func.upper(func.trim(Company.company_code)) == data.company_id.strip().upper()).first()
    user = db.query(User).filter(User.email == data.email.strip(), User.company_id == company.id).first() if company else None

    if not user or not verify_password(data.password, user.password):
        raise HTTPException(400, "Invalid credentials")

    # Bypass Setup Logic
    activity = UserLoginActivity(user_id=user.id, company_id=company.company_code, login_at=get_ist_time(), session_hours="Active Now")
    db.add(activity)
    db.commit()

    request.session.update({
        "email": user.email, "company_id": company.id, "company_code": company.company_code,
        "company_name": company.company_name, "name": user.name, "role": user.role,
        "permissions": user.permissions, "setup_completed": True, "last_activity": get_ist_time().timestamp()
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

    try:
        send_email(data.email, "BKNR ERP – Reset Password", f"Link: {request.base_url}auth/reset-password?token={token}")
    except Exception as e:
        print(f"EMAIL ERROR: {e}")
    return {"message": "Reset link sent"}

@router.post("/reset-password")
def reset_password(token: str = Form(...), password: str = Form(...), db: Session = Depends(get_db)):
    rec = db.query(OTPTable).filter(OTPTable.otp == token, OTPTable.is_used.is_(False)).first()
    if not rec: raise HTTPException(400, "Invalid link")
    user = db.query(User).filter(User.email == rec.email).first()
    user.password = hash_password(password)
    rec.is_used = True
    db.commit()
    
    try:
        send_email(user.email, "Password Changed", "Success")
    except: pass
    return RedirectResponse("/", status_code=303)

@router.get("/logout")
def logout(request: Request, db: Session = Depends(get_db)):
    request.session.clear()
    return RedirectResponse("/", status_code=303)
