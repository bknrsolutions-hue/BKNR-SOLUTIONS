from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.utils.email_service import (
    send_email_otp,
    send_company_id_mail,
    send_reset_password_link
)
from app.utils.otp_service import store_otp, verify_stored_otp
from app.database.models.users import Company, User
from app.security.password_handler import hash_password, verify_password


router = APIRouter(prefix="/auth", tags=["Authentication"])


# ------------------ REQUEST MODELS ------------------ #

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
# REGISTER COMPANY
# =====================================================
@router.post("/register")
def register_company_api(data: RegisterReq, db: Session = Depends(get_db)):

    # Duplicate check inside users table
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    if db.query(User).filter(User.mobile == data.mobile).first():
        raise HTTPException(status_code=400, detail="Mobile already registered")

    import random
    otp = str(random.randint(1000, 9999))

    store_otp(data.email, otp, extra=data.dict())
    send_email_otp(data.email, otp)

    return {"message": "OTP Sent Successfully to Email"}


# =====================================================
# VERIFY OTP
# =====================================================
@router.post("/verify-otp")
def verify_otp_api(data: OTPReq):
    verified_data = verify_stored_otp(data.email, data.otp)
    if not verified_data:
        raise HTTPException(status_code=400, detail="Invalid OTP or Expired")

    return {"message": "OTP Verified"}


# =====================================================
# SET PASSWORD + CREATE COMPANY + ADMIN USER
# =====================================================
@router.post("/set-password")
def set_password_api(data: PasswordReq, db: Session = Depends(get_db)):

    verified_data = verify_stored_otp(data.email)
    if not verified_data:
        raise HTTPException(status_code=400, detail="OTP not verified yet")

    extra = verified_data["extra"]

    # Create company code
    prefix = extra["company_name"].strip()[:4].upper()
    import random
    generated_code = prefix + str(random.randint(1000, 9999))

    # ---------------------------------------------------
    # FIX: CHECK IF COMPANY ALREADY EXISTS
    # ---------------------------------------------------
    existing_company = db.query(Company).filter(
        Company.email == extra["email"]
    ).first()

    if existing_company:
        company = existing_company   # use existing company
    else:
        company = Company(
            company_name=extra["company_name"],
            address=extra["address"],
            email=extra["email"],
            company_code=generated_code,
            is_active=True
        )
        db.add(company)
        db.commit()
        db.refresh(company)

    # ---------------------------------------------------
    # FIX: CHECK IF USER ALREADY EXISTS IN THIS COMPANY
    # ---------------------------------------------------
    existing_user = db.query(User).filter(
        User.email == extra["email"],
        User.company_id == company.id
    ).first()

    if existing_user:
        raise HTTPException(status_code=400, detail="User already exists. Please Login.")

    # Create Admin User
    admin_user = User(
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

    db.add(admin_user)
    db.commit()

    send_company_id_mail(extra["email"], extra["user_name"], company.company_code)

    return {"message": "Password Set Successfully. Company Created!"}


# =====================================================
# LOGIN USER
# =====================================================
@router.post("/login")
def login_api(data: LoginReq, request: Request, db: Session = Depends(get_db)):

    # Validate company
    company = db.query(Company).filter(
        Company.company_code == data.company_id
    ).first()

    if not company:
        raise HTTPException(status_code=400, detail="Invalid Company ID")

    # Validate User under same company
    user = db.query(User).filter(
        User.email == data.email,
        User.company_id == company.id
    ).first()

    if not user:
        raise HTTPException(status_code=400, detail="Invalid Credentials")

    if not verify_password(data.password, user.password):
        raise HTTPException(status_code=400, detail="Invalid Password")

    # Save session
    request.session["company_db_id"] = company.id
    request.session["company_code"] = company.company_code
    request.session["email"] = user.email
    request.session["name"] = user.name
    request.session["user_id"] = user.id

    request.session["permissions"] = (
        ["ALL"] if user.permissions == "ALL" else user.permissions.split(",")
    )

    return {"message": "Login Success"}


# =====================================================
# FORGOT PASSWORD
# =====================================================
@router.post("/forgot-password")
def forgot_api(data: ForgotReq, db: Session = Depends(get_db)):

    user = db.query(User).filter(User.email == data.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Email not registered")

    send_reset_password_link(user.email)
    return {"message": "Password reset link sent to email"}


# =====================================================
# LOGOUT
# =====================================================
@router.get("/logout")
def logout_api(request: Request):
    request.session.clear()
    return {"message": "Logout Successful"}
