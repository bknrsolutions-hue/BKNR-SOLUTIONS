from fastapi import FastAPI, APIRouter, Request, Form, Depends
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import random
import json
import os
import requests

from app.database import get_db
from app.database.models.users import User, Company, OTPTable
from app.security.password_handler import hash_password, verify_password

# ==========================================================
# 🚀 APP INIT
# ==========================================================
app = FastAPI()

# ==========================================================
# 🛤️ ROUTER & TEMPLATES
# ==========================================================
router = APIRouter(prefix="/auth", tags=["Auth"])
templates = Jinja2Templates(directory="app/templates")

# ==========================================================
# 🔐 EMAIL CONFIG
# ==========================================================
BREVO_API_KEY = os.getenv("BREVO_API_KEY")
BREVO_URL = "https://api.brevo.com/v3/smtp/email"
SENDER_EMAIL = "bknr.solutions@gmail.com"
SENDER_NAME = "BKNR ERP"
OTP_EXPIRY_MIN = 10

# ==========================================================
# 📧 SEND EMAIL
# ==========================================================
def send_email(to_email: str, subject: str, html: str):
    if not BREVO_API_KEY:
        print("⚠️ BREVO KEY NOT FOUND")
        return

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

    try:
        res = requests.post(BREVO_URL, json=payload, headers=headers)
        if res.status_code >= 400:
            print("❌ EMAIL FAILED:", res.text)
        else:
            print("✅ EMAIL SENT:", to_email)
    except Exception as e:
        print("❌ EMAIL ERROR:", e)

# ==========================================================
# 📄 REGISTER PAGE
# ==========================================================
@router.get("/register", response_class=HTMLResponse)
def register_page(request: Request):
    return templates.TemplateResponse("auth/register.html", {"request": request})

# ==========================================================
# 🚀 REGISTER
# ==========================================================
@router.post("/register")
def register(
    request: Request,
    company_name: str = Form(...),
    address: str = Form(...),
    email: str = Form(...),
    mobile: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        return RedirectResponse("/auth/register?msg=Email Already Registered", status_code=302)

    otp = str(random.randint(1000, 9999))

    db.query(OTPTable).filter(OTPTable.email == email).delete()

    extra_data = {
        "company_name": company_name,
        "address": address,
        "email": email,
        "mobile": mobile,
        "password": password
    }

    db.add(OTPTable(
        email=email,
        otp=otp,
        extra=json.dumps(extra_data),
        is_used=False,
        created_at=datetime.utcnow()
    ))

    db.commit()

    send_email(
        email,
        "BKNR ERP – OTP Verification",
        f"<h2>{otp}</h2><p>Valid for {OTP_EXPIRY_MIN} minutes.</p>"
    )

    return RedirectResponse(f"/auth/verify?email={email}", status_code=302)

# ==========================================================
# 🔐 VERIFY PAGE
# ==========================================================
@router.get("/verify", response_class=HTMLResponse)
def verify_page(request: Request, email: str):
    return templates.TemplateResponse("auth/verify.html", {"request": request, "email": email})

# ==========================================================
# ✅ VERIFY OTP
# ==========================================================
@router.post("/verify")
def verify_otp(
    request: Request,
    email: str = Form(...),
    otp: str = Form(...),
    db: Session = Depends(get_db)
):
    record = db.query(OTPTable).filter(
        OTPTable.email == email,
        OTPTable.is_used == False
    ).first()

    if not record:
        return RedirectResponse("/auth/register?msg=OTP Expired", status_code=302)

    if datetime.utcnow() > record.created_at + timedelta(minutes=OTP_EXPIRY_MIN):
        return RedirectResponse("/auth/register?msg=OTP Expired", status_code=302)

    if record.otp != otp:
        return RedirectResponse(f"/auth/verify?email={email}&msg=Invalid OTP", status_code=302)

    data = json.loads(record.extra)

    company = Company(
        company_name=data["company_name"],
        address=data["address"],
        email=data["email"],
        company_code="CMP" + str(random.randint(1000, 9999)),
        company_type="main",
        is_active=True
    )

    db.add(company)
    db.commit()
    db.refresh(company)

    user = User(
        company_id=company.id,
        name=data["company_name"],
        designation="Admin",
        email=data["email"],
        mobile=data["mobile"],
        password=hash_password(data["password"]),
        role="admin",
        permissions="ALL",
        is_verified=True,
        created_at=datetime.utcnow()
    )

    db.add(user)
    record.is_used = True
    db.commit()

    return RedirectResponse("/", status_code=302)

# ==========================================================
# 🔑 LOGIN
# ==========================================================
@router.post("/login")
def login(
    request: Request,
    email: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == email).first()

    if not user:
        return RedirectResponse("/?msg=Invalid Email", status_code=302)

    if not verify_password(password, user.password):
        return RedirectResponse("/?msg=Invalid Password", status_code=302)

    request.session["user"] = user.email
    return RedirectResponse("/home", status_code=302)

# ==========================================================
# 🚪 LOGOUT
# ==========================================================
@router.get("/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse("/", status_code=302)

# ==========================================================
# 🏠 ROOT ROUTE
# ==========================================================
@app.get("/")
def home():
    return {"message": "BKNR ERP Running Successfully 🚀"}

# ==========================================================
# 🔗 CONNECT ROUTER
# ==========================================================
app.include_router(router)