# app/routers/auth.py

from fastapi import APIRouter, Request, Form, Depends
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

router = APIRouter(prefix="/auth", tags=["Auth"])
templates = Jinja2Templates(directory="app/templates")

# ==========================================================

# 🔐 EMAIL CONFIG

# ==========================================================

BREVO_API_KEY = os.getenv("BREVO_API_KEY")
BREVO_URL = "https://api.brevo.com/v3/smtp/email"
SENDER_EMAIL = "[bknr.solutions@gmail.com](mailto:bknr.solutions@gmail.com)"
SENDER_NAME = "BKNR ERP"
OTP_EXPIRY_MIN = 10

# ==========================================================

# 📧 SEND EMAIL

# ==========================================================

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

    try:
        res = requests.post(BREVO_URL, json=payload, headers=headers)
        if res.status_code >= 400:
            print(f"❌ Brevo Error: {res.text}")
            raise HTTPException(500, "Email sending failed")
        print("✅ Email sent successfully to:", to_email)
    except Exception as e:
        print(f"❌ Request Error: {e}")
        raise HTTPException(500, "Email service communication error")
# ==========================================================

# 📄 REGISTER PAGE

# ==========================================================

@router.get("/register", response_class=HTMLResponse)
def register_page(request: Request):
return templates.TemplateResponse("auth/register.html", {"request": request})

# ==========================================================

# 🚀 REGISTER → SEND OTP

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

```
# 🔒 Check existing user
existing_user = db.query(User).filter(User.email == email).first()
if existing_user:
    return RedirectResponse("/auth/register?msg=Email Already Registered", status_code=302)

# 🔢 Generate OTP
otp = str(random.randint(1000, 9999))

# 🧹 Delete old OTP
db.query(OTPTable).filter(OTPTable.email == email).delete(synchronize_session=False)

# 📦 Save registration data
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

# 📧 Send OTP
send_email(
    email,
    "BKNR ERP – OTP Verification",
    f"<h2>{otp}</h2><p>Valid for {OTP_EXPIRY_MIN} minutes</p>"
)

return RedirectResponse(f"/auth/verify?email={email}", status_code=302)
```

# ==========================================================

# 🔐 VERIFY PAGE

# ==========================================================

@router.get("/verify", response_class=HTMLResponse)
def verify_page(request: Request, email: str):
return templates.TemplateResponse("auth/verify.html", {"request": request, "email": email})

# ==========================================================

# ✅ VERIFY OTP → CREATE COMPANY + USER

# ==========================================================

@router.post("/verify")
def verify_otp(
request: Request,
email: str = Form(...),
otp: str = Form(...),
db: Session = Depends(get_db)
):

```
record = db.query(OTPTable).filter(
    OTPTable.email == email,
    OTPTable.is_used == False
).first()

if not record:
    return RedirectResponse("/auth/register?msg=OTP Not Found", status_code=302)

# ⏳ Expiry check
if datetime.utcnow() > record.created_at + timedelta(minutes=OTP_EXPIRY_MIN):
    return RedirectResponse("/auth/register?msg=OTP Expired", status_code=302)

# ❌ Wrong OTP
if record.otp != otp:
    return RedirectResponse(f"/auth/verify?email={email}&msg=Invalid OTP", status_code=302)

# 📦 Extract saved data
data = json.loads(record.extra)

# 🏢 Create Company
company_code = data["company_name"][:4].upper() + str(random.randint(1000, 9999))

company = Company(
    company_name=data["company_name"],
    address=data["address"],
    email=data["email"],
    company_code=company_code,
    company_type="main",
    is_active=True,
    created_at=datetime.utcnow()
)

db.add(company)
db.commit()
db.refresh(company)

# 👤 Create Admin User
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

# 🔒 Mark OTP used
record.is_used = True

db.commit()

return RedirectResponse("/?msg=Registration Success", status_code=302)
```

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

```
user = db.query(User).filter(User.email == email).first()

if not user:
    return RedirectResponse("/?msg=Invalid Email", status_code=302)

if not verify_password(password, user.password):
    return RedirectResponse("/?msg=Invalid Password", status_code=302)

company = db.query(Company).filter(Company.id == user.company_id).first()

# 🧠 SESSION
request.session["email"] = user.email
request.session["user_id"] = user.id
request.session["name"] = user.name
request.session["role"] = user.role
request.session["company_id"] = company.id
request.session["company_code"] = company.company_code

return RedirectResponse("/home", status_code=302)
```

# ==========================================================

# 🚪 LOGOUT

# ==========================================================

@router.get("/logout")
def logout(request: Request):
request.session.clear()
return RedirectResponse("/", status_code=302)
