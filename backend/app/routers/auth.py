from fastapi import APIRouter, Depends, HTTPException, Request, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from pydantic import BaseModel, Field
from datetime import datetime, timedelta
from app.utils.timezone import ist_now
import random, json, os, requests, secrets
from dotenv import load_dotenv

load_dotenv()

from app.database import get_db
# 🟢 Added UserLoginActivity cleanly to the imports section
from app.database.models.users import Company, User, OTPTable, UserLoginActivity
from app.security.password_handler import hash_password, verify_password
from app.services.setup_service import SetupService

# 🟢 ADDED: Criteria Models for Global Dropdowns (Locations & Companies)
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


# 🟢 BULLETPROOF IST TIME HELPER (సర్వర్ లేదా డేటాబేస్ ఎక్కడున్నా ఇండియన్ టైమే రికార్డ్ అవుతుంది)
def get_ist_time():
    return datetime.utcnow() + timedelta(hours=5, minutes=30)


# =====================================================
# 🛡️ 🟢 MASTER SECURITY GUARD (Route Protection Dependency)
# =====================================================
def require_auth(request: Request):
    """
    ఎవరైనా డైరెక్ట్ గా URL ద్వారా పేజీలను ఓపెన్ చేయాలని చూస్తే, 
    సెషన్‌లో లాగిన్ వివరాలు ఉన్నాయో లేదో చెక్ చేసి... లేకపోతే వెంటనే లాగిన్ పేజీకి పంపించేస్తుంది.
    """
    email = request.session.get("email")
    if not email:
        raise HTTPException(status_code=303, headers={"Location": "/auth/login"})
    return request.session


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
        created_at=get_ist_time() 
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

    if not rec or get_ist_time() > rec.created_at + timedelta(minutes=OTP_EXPIRY_MIN): 
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
    # 🟢 FETCH UNIQUE DROPDOWN DATA (Locations & Companies)
    # =====================================
    companies_q = db.query(ProductionForModel.production_for).filter(
        ProductionForModel.company_id == company.company_code
    ).distinct().all()
    companies_list = [c[0] for c in companies_q if c[0]]

    locations_q = db.query(ProductionAtModel.production_at).filter(
        ProductionAtModel.company_id == company.company_code
    ).distinct().all()
    locations_list = [l[0] for l in locations_q if l[0]]

    # =====================================
    # GET NEXT MASTER / CHECK SETUP
    # =====================================
    setup_completed = SetupService.is_completed(db, company.company_code)
    next_page = SetupService.get_next_master(db, company.company_code)

    if setup_completed and not company.setup_completed:
        company.setup_completed = True
        db.commit()

    # Save Login Activity
    activity = UserLoginActivity(
        user_id=user.id,
        company_id=company.company_code,
        login_at=get_ist_time(),
        session_hours="Active Now"
    )

    db.add(activity)
    db.commit()

    # 🟢 Add everything to the active Session securely
    request.session.update({
        "email": user.email,
        "company_id": company.id,
        "company_code": company.company_code,
        "company_name": company.company_name,
        "name": user.name,
        "role": user.role,
        "permissions": user.permissions,
        "allowed_locations": locations_list, # By default attaching all locations
        "companies_list": companies_list,    # Dropdown Options - Companies
        "locations_list": locations_list,    # Dropdown Options - Locations
        "setup_completed": setup_completed,
        "last_activity": get_ist_time().timestamp() 
    })

    # Return JSON with the arrays so frontend can cache them if needed
    response = JSONResponse({
        "status": "success",
        "message": "Login Successful",
        "setup_completed": setup_completed,
        "next_page": next_page,
        "companies": companies_list,
        "locations": locations_list
    })

    return response


# =====================================================
# 5. FORGOT PASSWORD
# =====================================================
@router.post("/forgot-password")
def forgot_password(data: ForgotReq, request: Request, db: Session = Depends(get_db)):

    user = db.query(User).filter(
        User.email == data.email
    ).first()

    if not user:
        raise HTTPException(404, "Email not registered")

    token = secrets.token_urlsafe(32)

    db.query(OTPTable).filter(OTPTable.email == data.email).delete()
    db.add(OTPTable(
        email=data.email,
        otp=token,
        is_used=False,
        created_at=get_ist_time() 
    ))
    db.commit()

    reset_link = f"{request.base_url}auth/reset-password?token={token}"

    print("RESET LINK:", reset_link)
    # send_email(data.email, "BKNR ERP – Reset Password", f"<a href='{reset_link}'>Reset Password</a>")

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

    if not rec or get_ist_time() > rec.created_at + timedelta(minutes=RESET_EXPIRY_MIN): 
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
# 8. LOGOUT 
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
                current_ist = get_ist_time()
                activity.logout_at = current_ist

                hrs = (activity.logout_at - activity.login_at).total_seconds() / 3600
                activity.session_hours = f"{hrs:.2f} Hrs"

                db.commit()

    request.session.clear()

    return RedirectResponse("/", status_code=303)


# =====================================================
# 9. 🟢 SESSION HEARTBEAT (FIXED)
# =====================================================
@router.post("/heartbeat")
def session_heartbeat(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    last_activity = request.session.get("last_activity")

    if not email or not last_activity:
        return JSONResponse({"status": "expired"}, status_code=401)

    current_time = get_ist_time().timestamp()
    inactive_minutes = (current_time - float(last_activity)) / 60

    if inactive_minutes > 30:
        user = db.query(User).filter(User.email == email).first()
        if user:
            activity = db.query(UserLoginActivity).filter(
                UserLoginActivity.user_id == user.id, UserLoginActivity.logout_at.is_(None)
            ).order_by(UserLoginActivity.login_at.desc()).first()

            if activity:
                activity.logout_at = get_ist_time()
                hrs = (activity.logout_at - activity.login_at).total_seconds() / 3600
                activity.session_hours = f"{hrs:.2f} Hrs (Timeout)"
                db.commit()

        request.session.clear()
        return JSONResponse({"status": "expired", "message": "Session Timeout"}, status_code=401)

    return {"status": "active"}


# =====================================================
# 10. 🟢 REAL USER ACTIVITY TRACKER
# =====================================================
@router.post("/activity")
def update_activity(request: Request):
    request.session["last_activity"] = get_ist_time().timestamp()
    return {"status": "ok"}


# =====================================================
# 11. 🟢 BROWSER / TAB CLOSE AUTO LOGOUT
# =====================================================
@router.post("/tab-close-logout")
def tab_close_logout(request: Request, db: Session = Depends(get_db)):
    email = request.session.get("email")
    if email:
        user = db.query(User).filter(User.email == email).first()
        if user:
            activity = db.query(UserLoginActivity).filter(
                UserLoginActivity.user_id == user.id, UserLoginActivity.logout_at.is_(None)
            ).order_by(UserLoginActivity.login_at.desc()).first()

            if activity:
                activity.logout_at = get_ist_time()
                hrs = (activity.logout_at - activity.login_at).total_seconds() / 3600
                activity.session_hours = f"{hrs:.2f} Hrs (Closed)"
                db.commit()

        request.session.clear()
    return {"status": "logged_out"}


# =====================================================
# 12. 🟢 FETCH GLOBAL DROPDOWNS EXPLICITLY (AJAX SAFE)
# =====================================================
@router.get("/global-dropdowns")
def get_global_dropdowns(request: Request, db: Session = Depends(get_db)):
    """
    ఎప్పుడైనా ఫ్రంట్-ఎండ్ అప్లికేషన్ (Javascript/AJAX) ద్వారా డ్రాప్‌డౌన్ 
    డేటా తెచ్చుకోవాలంటే ఈ ఎండ్‌పాయింట్ ని కాల్ చేయొచ్చు.
    """
    comp_code = request.session.get("company_code")
    if not comp_code:
        return JSONResponse({"status": "error", "message": "Unauthorized Session"}, status_code=401)
        
    companies_q = db.query(ProductionForModel.production_for).filter(
        ProductionForModel.company_id == comp_code
    ).distinct().all()
    companies_list = [c[0] for c in companies_q if c[0]]

    locations_q = db.query(ProductionAtModel.production_at).filter(
        ProductionAtModel.company_id == comp_code
    ).distinct().all()
    locations_list = [l[0] for l in locations_q if l[0]]
    
    return JSONResponse({
        "status": "success",
        "companies": companies_list,
        "locations": locations_list
    })