from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel
import random, json

from app.database import get_db
from app.database.models.users import Company, User, OTPTable
from app.security.password_handler import hash_password, verify_password
from app.utils.email_service import send_otp_email

router = APIRouter(prefix="/auth", tags=["Authentication"])

# ===================== REQUEST MODELS =====================
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

# ===================== REGISTER =====================
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
        is_used=False
    ))
    db.commit()

    send_otp_email(data.email, otp)
    return {"message": "OTP sent to email"}

# ===================== VERIFY OTP =====================
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

# ===================== SET PASSWORD =====================
@router.post("/set-password")
def set_password(data: PasswordReq, db: Session = Depends(get_db)):
    rec = db.query(OTPTable).filter(
        OTPTable.email == data.email,
        OTPTable.is_used == True
    ).first()

    if not rec:
        raise HTTPException(400, "OTP not verified")

    extra = json.loads(rec.extra)

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

    if db.query(User).filter(User.email == extra["email"]).first():
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

    return {"message": "Account created", "company_id": company.company_code}

# ===================== LOGIN =====================
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

    request.session["email"] = user.email
    request.session["company_id"] = company.id
    request.session["permissions"] = ["ALL"]

    return {"message": "Login success"}

# ===================== FORGOT PASSWORD =====================
@router.post("/forgot-password")
def forgot(data: ForgotReq):
    return {"message": "Contact admin to reset password"}

# ===================== LOGOUT =====================
@router.get("/logout")
def logout(request: Request):
    request.session.clear()
    return {"message": "Logged out"}
