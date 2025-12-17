from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
import random, json, os
import requests

from app.database import get_db
from app.database.models.users import Company, User, OTPTable
from app.security.password_handler import hash_password, verify_password

# =====================================================
router = APIRouter(prefix="/auth", tags=["Authentication"])
# =====================================================


# ================= BREVO CONFIG =================
BREVO_API_KEY = os.getenv("BREVO_API_KEY")
BREVO_URL = "https://api.brevo.com/v3/smtp/email"

SENDER_EMAIL = "bknr.solutions@gmail.com"
SENDER_NAME = "BKNR ERP"

# =================================================
def send_email(to_email: str, subject: str, html_content: str):

    if not BREVO_API_KEY:
        print("❌ BREVO_API_KEY missing")
        return False

    payload = {
        "sender": {
            "email": SENDER_EMAIL,
            "name": SENDER_NAME
        },
        "to": [
            {"email": to_email}
        ],
        "subject": subject,
        "htmlContent": html_content
    }

    headers = {
        "accept": "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json"
    }

    try:
        res = requests.post(BREVO_URL, json=payload, headers=headers, timeout=10)

        if res.status_code >= 400:
            print("❌ Brevo email failed:", res.text)
            return False

        print("✅ Email sent to:", to_email)
        return True

    except Exception as e:
        print("❌ Brevo exception:", e)
        return False


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

# =====================================================
# REGISTER + SEND OTP
# =====================================================
@router.post("/register")
def register(data: RegisterReq, db: Session = Depends(get_db)):

    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(400, "Email already registered")

    otp = str(random.randint(1000, 9999))

    db.query(OTPTable).filter(OTPTable.email == data.email).delete()

    db.add(
        OTPTable(
            email=data.email,
            otp=otp,
            extra=json.dumps(data.dict()),
            is_used=False
        )
    )
    db.commit()

    send_email(
        data.email,
        "BKNR ERP – OTP Verification",
        f"""
        <h3>Your OTP</h3>
        <h2>{otp}</h2>
        <p>Valid for 10 minutes</p>
        """
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
        OTPTable.is_used == False
    ).first()

    if not rec:
        raise HTTPException(400, "Invalid OTP")

    rec.is_used = True
    db.commit()

    return {"message": "OTP verified"}

# =====================================================
# SET PASSWORD + CREATE COMPANY + ADMIN
# =====================================================
@router.post("/set-password")
def set_password(data: PasswordReq, db: Session = Depends(get_db)):

    rec = db.query(OTPTable).filter(
        OTPTable.email == data.email,
        OTPTable.is_used == True
    ).first()

    if not rec:
        raise HTTPException(400, "OTP not verified")

    extra = json.loads(rec.extra)

    # -------- COMPANY --------
    company = db.query(Company).filter(
        Company.email == extra["email"]
    ).first()

    if not company:
        company_code = extra["company_name"][:4].upper() + str(random.randint(1000, 9999))
        company = Company(
            company_name=extra["company_name"],
            address=extra["address"],
            email=extra["email"],
            company_code=company_code,
            is_active=True
        )
        db.add(company)
        db.commit()
        db.refresh(company)

    # -------- USER --------
    if db.query(User).filter(
        User.email == extra["email"],
        User.company_id == company.id
    ).first():
        raise HTTPException(400, "User already exists")

    safe_password = data.password[:72]  # bcrypt fix

    user = User(
        company_id=company.id,
        name=extra["user_name"],
        designation=extra["designation"],
        email=extra["email"],
        mobile=extra["mobile"],
        password=hash_password(safe_password),
        role="admin",
        permissions="ALL",
        is_verified=True
    )

    db.add(user)
    db.commit()

    send_email(
        extra["email"],
        "BKNR ERP – Company Created",
        f"""
        <h3>Welcome to BKNR ERP</h3>
        <p>Your Company ID:</p>
        <h2>{company.company_code}</h2>
        """
    )

    return {
        "message": "Account created",
        "company_id": company.company_code
    }

# =====================================================
# LOGIN
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

    if not user or not verify_password(data.password[:72], user.password):
        raise HTTPException(400, "Invalid credentials")

    request.session["email"] = user.email
    request.session["company_id"] = company.id
    request.session["company_code"] = company.company_code
    request.session["name"] = user.name
    request.session["role"] = user.role
    request.session["permissions"] = user.permissions

    return {"message": "Login success"}

# =====================================================
# FORGOT PASSWORD
# =====================================================
@router.post("/forgot-password")
def forgot_password(data: ForgotReq, db: Session = Depends(get_db)):

    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(404, "Email not registered")

    send_email(
        data.email,
        "BKNR ERP – Password Reset",
        "<p>Please contact admin to reset password.</p>"
    )

    return {"message": "Reset email sent"}

# =====================================================
# LOGOUT
# =====================================================
@router.get("/logout")
def logout(request: Request):
    request.session.clear()
    return {"message": "Logged out"}
