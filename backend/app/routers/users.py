from app.utils.timezone import ist_now
# app/routers/users.py

from fastapi import APIRouter, Request, Form, Depends
from fastapi.responses import RedirectResponse, HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from datetime import datetime
import random, os, json

from app.database import get_db
from app.database.models.users import User, Company, OTPTable
from app.security.password_handler import hash_password


router = APIRouter(prefix="/admin", tags=["Admin"])
templates = Jinja2Templates(directory="app/templates")

OTP_EXPIRY_MIN = 10

# -------------------------------------------------------
# Reuse email + OTP template from auth module
# -------------------------------------------------------
def _send_user_otp_email(to_email: str, otp: str, user_name: str, company_name: str):
    """Send OTP email for Add User verification."""
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    SMTP_SERVER = "smtp.gmail.com"
    SMTP_PORT = 587
    sender_email = os.getenv("SMTP_EMAIL", "bknr.solutions@gmail.com")
    sender_password = os.getenv("SMTP_PASSWORD", "aaim dsqz jpbg sosx")
    sender_name = os.getenv("EMAIL_SENDER_NAME", "BKNR ERP")
    support_email = os.getenv("SUPPORT_EMAIL", "bknr.solutions@gmail.com")

    html = f"""<!doctype html>
<html>
<body style="margin:0;padding:0;background:#eef6ff;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef6ff;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #dbeafe;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="padding:18px 22px;background:#f8fbff;border-bottom:1px solid #e5eefb;">
            <div style="font-size:18px;font-weight:800;color:#1d4ed8;">{company_name}</div>
            <div style="font-size:12px;color:#64748b;margin-top:4px;">User Account Verification</div>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 22px;">
            <h2 style="margin:0 0 12px;font-size:20px;color:#0f172a;">Verify Your Account</h2>
            <p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.6;">
              Hello <strong>{user_name}</strong>, your account is being set up on <strong>{company_name} ERP</strong>.<br>
              Use the code below to complete verification.
            </p>
            <div style="margin:18px 0;padding:18px;background:#f0f7ff;border:1px solid #bfdbfe;border-radius:10px;text-align:center;">
              <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">Verification Code</div>
              <div style="font-size:32px;font-weight:800;color:#1d4ed8;letter-spacing:6px;margin-top:6px;">{otp}</div>
            </div>
            <p style="margin:14px 0 0;color:#64748b;font-size:13px;line-height:1.6;">
              This code expires in {OTP_EXPIRY_MIN} minutes. Do not share it with anyone.
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 22px;background:#f8fbff;border-top:1px solid #e5eefb;color:#64748b;font-size:12px;line-height:1.6;">
            Sent by <strong>BKNR ERP</strong> from {sender_email}<br>
            For support, contact {support_email}. This is an automated email.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""

    try:
        msg = MIMEMultipart()
        msg['From'] = f"{sender_name} <{sender_email}>"
        msg['To'] = to_email
        msg['Subject'] = f"{company_name} - New User Verification Code"
        msg.attach(MIMEText(html, 'html'))
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(sender_email, sender_password)
        server.send_message(msg)
        server.quit()
    except Exception as e:
        print(f"ADD USER OTP EMAIL ERROR: {e}")
        raise


# ==========================================================
# PAGE VIEW – ADD USER PAGE
# ==========================================================
@router.get("/add_user", response_class=HTMLResponse)
def add_user_page(request: Request, db: Session = Depends(get_db)):

    # session values
    logged_email = request.session.get("email")
    company_code = request.session.get("company_code")   # example: BKNR5647

    if not logged_email or not company_code:
        return RedirectResponse("/", status_code=302)

    # company_code STRING → fetch company record
    company = db.query(Company).filter(
        Company.company_code == company_code
    ).first()

    # All users under this company (company.id)
    users = db.query(User).filter(User.company_id == company.id).order_by(User.id.desc()).all()

    return templates.TemplateResponse(
        "admin/add_user.html",
        {
            "request": request,
            "existing_users": users,
            "company_code": company_code
        }
    )


# ==========================================================
# SAVE USER → SEND OTP (Step 1)
# ==========================================================
@router.post("/add_user")
async def save_user(
    request: Request,
    full_name: str = Form(...),
    designation: str = Form(...),
    email: str = Form(...),
    mobile: str = Form(...),
    password: str = Form("123456"),
    role: str = Form("user"),
    data_management_access: str = Form("false"),
    access: list[str] = Form([]),  # list of permissions
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")
    logged_email = request.session.get("email")

    if not logged_email or not company_code:
        return JSONResponse({"status": "error", "msg": "Session expired. Please login again."}, status_code=401)

    # fetch company record
    company = db.query(Company).filter(
        Company.company_code == company_code
    ).first()

    if not company:
        return JSONResponse({"status": "error", "msg": "Company not found."}, status_code=404)

    # Duplicate email check
    if db.query(User).filter(User.email == email, User.company_id == company.id).first():
        return JSONResponse({"status": "error", "msg": "Email already exists for this company."})

    # Duplicate mobile check
    if db.query(User).filter(User.mobile == mobile, User.company_id == company.id).first():
        return JSONResponse({"status": "error", "msg": "Mobile number already exists for this company."})

    # Generate OTP
    otp = str(random.randint(100000, 999999))
    permissions_csv = ",".join(access)

    # Store pending user details in OTPTable
    otp_record = db.query(OTPTable).filter(OTPTable.email == email).first()
    pending_data = json.dumps({
        "company_id": company.id,
        "name": full_name,
        "designation": designation,
        "email": email,
        "mobile": mobile,
        "password": hash_password(password),
        "role": role,
        "permissions": permissions_csv,
        "data_management_access": data_management_access == "true",
        "created_at": ist_now().isoformat()
    })

    if otp_record:
        otp_record.otp = otp
        otp_record.extra = pending_data
        otp_record.is_used = False
        otp_record.created_at = datetime.utcnow().replace(tzinfo=None)
    else:
        otp_record = OTPTable(
            email=email,
            otp=otp,
            extra=pending_data,
            is_used=False
        )
        db.add(otp_record)
    db.commit()

    # Send OTP email
    try:
        _send_user_otp_email(email, otp, full_name, company.company_name)
    except Exception as e:
        return JSONResponse({"status": "error", "msg": f"Failed to send OTP email: {e}"})

    return JSONResponse({"status": "otp_required", "email": email, "msg": f"OTP sent to {email}"})


# ==========================================================
# VERIFY ADD USER OTP (Step 2) → Commit User
# ==========================================================
@router.post("/verify_add_user_otp")
async def verify_add_user_otp(
    request: Request,
    email: str = Form(...),
    otp: str = Form(...),
    db: Session = Depends(get_db)
):
    from datetime import timedelta

    company_code = request.session.get("company_code")
    logged_email = request.session.get("email")

    if not logged_email or not company_code:
        return JSONResponse({"status": "error", "msg": "Session expired."}, status_code=401)

    otp_record = db.query(OTPTable).filter(OTPTable.email == email).first()

    if not otp_record or otp_record.is_used:
        return JSONResponse({"status": "error", "msg": "OTP is invalid or already used."})

    # Check expiry (10 minutes)
    created = otp_record.created_at
    if (datetime.utcnow().replace(tzinfo=None) - created).total_seconds() > OTP_EXPIRY_MIN * 60:
        return JSONResponse({"status": "error", "msg": "OTP has expired. Please resend."})

    if otp_record.otp != otp.strip():
        return JSONResponse({"status": "error", "msg": "Incorrect OTP. Please try again."})

    # Parse pending user data and create user
    try:
        pending = json.loads(otp_record.extra)
    except Exception:
        return JSONResponse({"status": "error", "msg": "Session data corrupted. Please re-submit the form."})

    # Final duplicate check before saving
    if db.query(User).filter(User.email == pending["email"], User.company_id == pending["company_id"]).first():
        otp_record.is_used = True
        db.commit()
        return JSONResponse({"status": "error", "msg": "User with this email already exists."})

    new_user = User(
        company_id=pending["company_id"],
        name=pending["name"],
        designation=pending["designation"],
        email=pending["email"],
        mobile=pending["mobile"],
        password=pending["password"],
        role=pending["role"],
        permissions=pending["permissions"],
        data_management_access=pending.get("data_management_access", False),
        is_verified=True,
        is_active=True,
        created_at=ist_now()
    )
    db.add(new_user)
    otp_record.is_used = True
    db.commit()

    return JSONResponse({"status": "success", "msg": f"User '{pending['name']}' created and verified successfully."})


# ==========================================================
# RESEND OTP FOR ADD USER
# ==========================================================
@router.post("/resend_add_user_otp")
async def resend_add_user_otp(
    request: Request,
    email: str = Form(...),
    db: Session = Depends(get_db)
):
    company_code = request.session.get("company_code")
    if not company_code:
        return JSONResponse({"status": "error", "msg": "Session expired."}, status_code=401)

    otp_record = db.query(OTPTable).filter(OTPTable.email == email).first()
    if not otp_record or otp_record.is_used:
        return JSONResponse({"status": "error", "msg": "No pending verification found. Please re-submit the form."})

    try:
        pending = json.loads(otp_record.extra)
    except Exception:
        return JSONResponse({"status": "error", "msg": "Session data error. Please re-submit the form."})

    company = db.query(Company).filter(Company.company_code == company_code).first()

    # New OTP
    new_otp = str(random.randint(100000, 999999))
    otp_record.otp = new_otp
    otp_record.created_at = datetime.utcnow().replace(tzinfo=None)
    otp_record.is_used = False
    db.commit()

    try:
        _send_user_otp_email(email, new_otp, pending["name"], company.company_name if company else "BKNR ERP")
    except Exception as e:
        return JSONResponse({"status": "error", "msg": f"Failed to resend OTP: {e}"})

    return JSONResponse({"status": "success", "msg": f"OTP resent to {email}"})


# ==========================================================
# DELETE USER
# ==========================================================
@router.post("/delete_user/{uid}")
def delete_user(uid: int, request: Request, db: Session = Depends(get_db)):

    company_code = request.session.get("company_code")

    company = db.query(Company).filter(
        Company.company_code == company_code
    ).first()

    user = db.query(User).filter(
        User.id == uid,
        User.company_id == company.id
    ).first()

    if not user:
        return RedirectResponse("/admin/add_user?msg=User Not Found", status_code=302)

    db.delete(user)
    db.commit()

    return RedirectResponse("/admin/add_user?msg=User Deleted", status_code=302)
