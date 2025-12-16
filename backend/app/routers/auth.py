from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
import random

from app.database import get_db
from app.database.models.users import Company, User
from app.security.password_handler import hash_password, verify_password
from app.utils.otp_service import store_otp, verify_stored_otp
from app.utils.email_service import (
    send_email_otp,
    send_company_id_mail,
    send_reset_password_link
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

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


# ================= REGISTER =================
@router.post("/register")
def register_company_api(data: RegisterReq, db: Session = Depends(get_db)):

    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(400, "Email already registered")

    if db.query(User).filter(User.mobile == data.mobile).first():
        raise HTTPException(400, "Mobile already registered")

    otp = str(random.randint(1000, 9999))

    # STORE OTP IN DB
    store_otp(db, data.email, otp, extra=data.dict())

    # SEND OTP EMAIL
    email_sent = send_email_otp(data.email, otp)
    if not email_sent:
        raise HTTPException(500, "OTP email failed. Please try again.")

    return {"message": "OTP sent successfully"}


# ================= VERIFY OTP =================
@router.post("/verify-otp")
def verify_otp_api(data: OTPReq, db: Session = Depends(get_db)):

    verified = verify_stored_otp(db, data.email, data.otp)
    if not verified:
        raise HTTPException(400, "Invalid or expired OTP")

    return {"message": "OTP verified"}


# ================= SET PASSWORD =================
@router.post("/set-password")
def set_password_api(data: PasswordReq, db: Session = Depends(get_db)):

    verified = verify_stored_otp(db, data.email)
    if not verified:
        raise HTTPException(400, "OTP not verified")

    extra = verified["extra"]

    # GENERATE COMPANY CODE
    prefix = extra["company_name"][:4].upper()
    code = prefix + str(random.randint(1000, 9999))

    company = db.query(Company).filter(Company.email == extra["email"]).first()
    if not company:
        company = Company(
            company_name=extra["company_name"],
            address=extra["address"],
            email=extra["email"],
            company_code=code,
            is_active=True
        )
        db.add(company)
        db.commit()
        db.refresh(company)

    if db.query(User).filter(
        User.email == extra["email"],
        User.company_id == company.id
    ).first():
        raise HTTPException(400, "User already exists")

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

    # SEND COMPANY ID MAIL
    try:
        send_company_id_mail(extra["email"], extra["user_name"], company.company_code)
    except Exception as e:
        print("COMPANY ID EMAIL FAILED:", e)

    return {"message": "Account created successfully"}


# ================= LOGIN =================
@router.post("/login")
def login_api(data: LoginReq, request: Request, db: Session = Depends(get_db)):

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

    request.session["email"] = user.email
    request.session["company_id"] = company.id
    request.session["company_code"] = company.company_code
    request.session["user_id"] = user.id
    request.session["permissions"] = ["ALL"]

    return {"message": "Login successful"}


# ================= FORGOT PASSWORD =================
@router.post("/forgot-password")
def forgot_api(data: ForgotReq, db: Session = Depends(get_db)):

    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(404, "Email not registered")

    email_sent = send_reset_password_link(user.email)
    if not email_sent:
        raise HTTPException(500, "Reset email failed")

    return {"message": "Reset password link sent"}


# ================= LOGOUT =================
@router.get("/logout")
def logout_api(request: Request):
    request.session.clear()
    return {"message": "Logout successful"}
