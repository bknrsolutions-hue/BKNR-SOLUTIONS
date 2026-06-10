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
# 🟢 Added UserLoginActivity cleanly to the imports section
from app.database.models.users import Company, User, OTPTable, UserLoginActivity
from app.security.password_handler import hash_password, verify_password
from app.services.setup_service import SetupService

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


# 🟢 BULLETPROOF IST TIME HELPER (సర్వర్ లేదా డేటాబేస్ ఎక్కడున్నా ఇండియన్ టైమే రికార్డ్ అవుతుంది)
def get_ist_time():
    return datetime.utcnow() + timedelta(hours=5, minutes=30)


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

    res = requests.post(
        BREVO_URL,
        json=payload,
        headers=headers
    )

    print("BREVO STATUS:", res.status_code)
    print("BREVO RESPONSE:", res.text)

    if res.status_code >= 400:
        raise HTTPException(500, "Email sending failed")

    print("✅ Email sent:", to_email)


# ================= REQUEST MODELS =================
class RegisterReq(BaseModel):
    company_name: str = Field(..., min_length=2, description="Company name is required")
    user_name: str = Field(..., min_length=2)
    designation: str
    address: str
    
    # 🔴 Strict Mobile Number Validation (Exactly 10 digits)
    mobile: str = Field(..., pattern=r"^[0-9]{10}$", description="Enter a valid 10-digit mobile number")
    
    # 🔴 Strict Email Format Validation
    email: str = Field(..., pattern=r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$", description="Enter a valid email format")

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
# 1. REGISTER → SEND OTP (WITH VALIDATIONS)
# =====================================================
@router.post("/register")
def register(data: RegisterReq, db: Session = Depends(get_db)):

    # 🔴 1. Check if Email or Mobile is already registered in the DB
    existing_user = db.query(User).filter(
        or_(User.email == data.email, User.mobile == data.mobile)
    ).first()

    if existing_user:
        if existing_user.email == data.email:
            raise HTTPException(status_code=400, detail="This Email ID is already registered. Please go to Login.")
        if existing_user.mobile == data.mobile:
            raise HTTPException(status_code=400, detail="This Mobile Number is already registered.")

    # 2. Generate OTP
    otp = str(random.randint(1000, 9999))

    # 3. Handle Extra Data for Pydantic V2/V1 compatibility
    extra_data = data.model_dump() if hasattr(data, "model_dump") else data.dict()

    db.query(OTPTable).filter(OTPTable.email == data.email).delete()
    db.add(OTPTable(
        email=data.email,
        otp=otp,
        extra=json.dumps(extra_data),
        is_used=False,
        created_at=get_ist_time() # 🟢 Synchronized to IST
    ))
    db.commit()

    # =====================================
    # SEND EMAIL WITH LOCAL DEV FALLBACK
    # =====================================
    try:
        send_email(
            data.email,
            "BKNR ERP – OTP Verification",
            f"<h2>{otp}</h2><p>Valid for {OTP_EXPIRY_MIN} minutes</p>"
        )
    except Exception as e:
        print("EMAIL ERROR:", e)
        print("OTP =", otp)

    return {"message": "OTP sent successfully"}

# =====================================================
# 2. VERIFY OTP
# =====================================================
@router.post("/verify-otp")
def verify_otp(data: OTPReq, db: Session = Depends(get_db)):

    rec = db.query(OTPTable).filter(
        OTPTable.email == data.email,
        OTPTable.otp == data.otp,
        OTPTable.is_used.is_(False)
    ).first()

    if not rec or get_ist_time() > rec.created_at + timedelta(minutes=OTP_EXPIRY_MIN): # 🟢 Synchronized to IST
        raise HTTPException(400, "OTP expired or invalid")

    rec.is_used = True
    db.commit()

    return {"message": "OTP verified"}

# =====================================================
# 3. SET PASSWORD
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
# 4. LOGIN
# =====================================================
@router.post("/login")
def login(data: LoginReq, request: Request, db: Session = Depends(get_db)):

    company_code = data.company_id.strip().upper()
    email = data.email.strip()

    company = db.query(Company).filter(
        func.upper(func.trim(Company.company_code)) == company_code
    ).first()
    if not company:
        raise HTTPException(400, "Invalid Company ID")

    user = db.query(User).filter(
        User.email == email,
        User.company_id == company.id
    ).first()

    if not user or not verify_password(data.password, user.password):
        raise HTTPException(400, "Invalid credentials")

    # =====================================
    # GET NEXT MASTER / CHECK SETUP
    # =====================================
    setup_completed = SetupService.is_completed(db, company.company_code)
    next_page = SetupService.get_next_master(db, company.company_code)

    print("================================")
    print("COMPANY CODE =", company.company_code)
    print("SETUP COMPLETED =", setup_completed)
    print("NEXT PAGE =", next_page)
    print("================================")

    # ఒకవేళ ఇప్పుడే సెటప్ పూర్తయితే, DB లో కూడా అప్‌డేట్ చేయాలి
    if setup_completed and not company.setup_completed:
        company.setup_completed = True
        db.commit()

    # 🟢 Save Login Activity Block Inserted with Explicit IST Timestamp
    activity = UserLoginActivity(
        user_id=user.id,
        company_id=company.company_code,
        login_at=get_ist_time(),
        session_hours="Active Now"
    )

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
        "setup_completed": setup_completed
    })

    response = JSONResponse({
        "status": "success",
        "message": "Login Successful",
        "setup_completed": setup_completed,
        "next_page": next_page
    })

    return response

# =====================================================
# 5. FORGOT PASSWORD
# =====================================================
@router.post("/forgot-password")
def forgot_password(data: ForgotReq, request: Request, db: Session = Depends(get_db)):

    print("EMAIL:", data.email)

    user = db.query(User).filter(
        User.email == data.email
    ).first()

    print("USER:", user)

    if not user:
        raise HTTPException(404, "Email not registered")

    token = secrets.token_urlsafe(32)

    db.query(OTPTable).filter(OTPTable.email == data.email).delete()
    db.add(OTPTable(
        email=data.email,
        otp=token,
        is_used=False,
        created_at=get_ist_time() # 🟢 Synchronized to IST
    ))
    db.commit()

    reset_link = f"{request.base_url}auth/reset-password?token={token}"

    print("RESET LINK:", reset_link)

    # send_email(
    #     data.email,
    #     "BKNR ERP – Reset Password",
    #     f"<a href='{reset_link}'>Reset Password</a>"
    # )

    return {"message": "Reset link sent"}

# =====================================================
# 6. RESET PASSWORD PAGE
# =====================================================
@router.get("/reset-password", response_class=HTMLResponse)
def reset_password_page(request: Request, token: str, db: Session = Depends(get_db)):

    rec = db.query(OTPTable).filter(
        OTPTable.otp == token,
        OTPTable.is_used.is_(False)
    ).first()

    if not rec or get_ist_time() > rec.created_at + timedelta(minutes=RESET_EXPIRY_MIN): # 🟢 Synchronized to IST
        return HTMLResponse("<h3>Link expired</h3>")

    return templates.TemplateResponse(
        request=request,
        name="reset_password.html",
        context={"token": token}
    )

# =====================================================
# 7. RESET PASSWORD SAVE
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

    return RedirectResponse("/", status_code=303)

# =====================================================
# 8. LOGOUT (🟢 Updated with UserLoginActivity tracking & IST Calibration)
# =====================================================
@router.get("/logout")
def logout(
    request: Request,
    db: Session = Depends(get_db)
):
    email = request.session.get("email")

    if email:
        user = db.query(User).filter(
            User.email == email
        ).first()

        if user:
            activity = (
                db.query(UserLoginActivity)
                .filter(
                    UserLoginActivity.user_id == user.id,
                    UserLoginActivity.logout_at.is_(None)
                )
                .order_by(
                    UserLoginActivity.login_at.desc()
                )
                .first()
            )

            if activity:
                # 🛠️ FIX: Logouts strictly mapped using same IST timeline
                current_ist = get_ist_time()
                activity.logout_at = current_ist

                hrs = (activity.logout_at - activity.login_at).total_seconds() / 3600
                activity.session_hours = f"{hrs:.2f} Hrs"

                db.commit()

    request.session.clear()

    return RedirectResponse("/", status_code=303)