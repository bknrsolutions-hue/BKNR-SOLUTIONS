from fastapi import APIRouter, HTTPException, Form, Request, Depends
from fastapi.responses import RedirectResponse, HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import EmailStr
from sqlalchemy.orm import Session
from app.database import SessionLocal, get_db
from app.database.models import User
from passlib.context import CryptContext
import random, smtplib, os
from email.mime.text import MIMEText
from dotenv import load_dotenv

# -----------------------------------------------------
# TEMPLATE ENGINE (VERY IMPORTANT — FIXES YOUR ERROR)
# -----------------------------------------------------
templates = Jinja2Templates(directory="app/templates")

# -----------------------------------------------------
# ROUTER + SECURITY
# -----------------------------------------------------
router = APIRouter(prefix="/auth", tags=["Authentication"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Load environment variables
load_dotenv()

SENDER_EMAIL = os.getenv("EMAIL_USER", "bknr.solutions@gmail.com")
SENDER_PASSWORD = os.getenv("EMAIL_PASS", "lfvu etvn ffdv wvvb")  # fallback password

# Temporary OTP store
otp_store = {}

# -----------------------------------------------------
# ✉️ EMAIL SENDER
# -----------------------------------------------------
def send_email(receiver_email, subject, body):
    msg = MIMEText(body, "plain")
    msg["Subject"] = subject
    msg["From"] = SENDER_EMAIL
    msg["To"] = receiver_email
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.send_message(msg)
        print(f"Email sent → {receiver_email}")
    except Exception as e:
        print("Email error:", e)


# -----------------------------------------------------
# 🔓 LOGIN PAGE (GET)  — FIXED 405 ERROR
# -----------------------------------------------------
@router.get("/login", response_class=HTMLResponse)
def show_login_page(request: Request):
    return templates.TemplateResponse("login.html", {"request": request})


# -----------------------------------------------------
# 🔐 SEND OTP
# -----------------------------------------------------
@router.post("/send_otp")
def send_otp(
    full_name: str = Form(...),
    email: EmailStr = Form(...),
    company_name: str = Form(...),
    designation: str = Form(...),
    phone: str = Form(...)
):
    db: Session = SessionLocal()

    # Check duplicate email
    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    otp = str(random.randint(100000, 999999))
    otp_store[email] = {
        "otp": otp,
        "full_name": full_name,
        "company_name": company_name,
        "designation": designation,
        "phone": phone
    }

    send_email(email, "BKNR SOLUTIONS - OTP Verification", f"Your OTP is {otp}")
    return {"message": f"OTP sent to {email}"}


# -----------------------------------------------------
# 🧾 VERIFY OTP
# -----------------------------------------------------
@router.post("/verify_otp")
def verify_otp(email: EmailStr = Form(...), otp: str = Form(...)):
    if email not in otp_store:
        raise HTTPException(status_code=400, detail="OTP not generated for this email")
    if otp_store[email]["otp"] != otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    return {"message": "OTP verified successfully"}


# -----------------------------------------------------
# 🔑 CREATE PASSWORD (FINAL REGISTRATION)
# -----------------------------------------------------
@router.post("/create_password")
def create_password(email: EmailStr = Form(...), password: str = Form(...)):
    db: Session = SessionLocal()

    if email not in otp_store:
        raise HTTPException(status_code=400, detail="OTP not verified")

    # Auto-generate unique company ID
    company_id = f"BKNR{random.randint(1000, 9999)}"

    hashed_pw = pwd_context.hash(password)

    new_user = User(
        full_name=otp_store[email]["full_name"],
        email=email,
        company_name=otp_store[email]["company_name"],
        designation=otp_store[email]["designation"],
        phone=otp_store[email]["phone"],
        company_id=company_id,
        password=hashed_pw,
        role="User"
    )

    db.add(new_user)
    try:
        db.commit()
    except:
        db.rollback()
        raise HTTPException(status_code=500, detail="Database error")

    send_email(
        email,
        "BKNR SOLUTIONS - Registration Successful",
        f"Welcome!\nYour Company ID: {company_id}\nEmail: {email}"
    )

    del otp_store[email]
    return {"message": "Password created successfully", "company_id": company_id}


# -----------------------------------------------------
# 🔒 LOGIN (POST)
# -----------------------------------------------------
@router.post("/login")
def login(
    request: Request,
    company_id: str = Form(...),
    email: EmailStr = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(
        User.email == email,
        User.company_id == company_id
    ).first()

    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    if not pwd_context.verify(password, user.password):
        raise HTTPException(status_code=401, detail="Invalid password")

    # Save session
    request.session["company_name"] = user.company_name
    request.session["company_id"] = user.company_id
    request.session["user_email"] = user.email
    request.session["user_name"] = user.full_name
    request.session["role"] = user.role

    return RedirectResponse(url="/menu", status_code=302)


# -----------------------------------------------------
# 🚪 LOGOUT
# -----------------------------------------------------
@router.get("/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="/", status_code=302)
