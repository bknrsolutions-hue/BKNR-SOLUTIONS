import random
import smtplib
import ssl
from email.mime.text import MIMEText
from datetime import datetime, timedelta

# --------------------------------------------------------
# ✅ OTP Storage (email -> {otp, expiry})
# --------------------------------------------------------
otp_store = {}

# --------------------------------------------------------
# 🔹 Gmail Configuration
# --------------------------------------------------------
SENDER_EMAIL = "bknr.solutions@gmail.com"
SENDER_PASSWORD = "jtwwkttabthsvdeu"  # ✅ Your Gmail App Password (no spaces)

# --------------------------------------------------------
# 🔹 Generate OTP (6 digits)
# --------------------------------------------------------
def generate_otp(email: str) -> int:
    otp = random.randint(100000, 999999)
    otp_store[email] = {
        "otp": otp,
        "expiry": datetime.now() + timedelta(minutes=5)  # expires in 5 min
    }
    print(f"✅ OTP generated for {email}: {otp}")
    return otp

# --------------------------------------------------------
# 🔹 Send OTP via Gmail SMTP
# --------------------------------------------------------
def send_email_otp(to_email: str, otp: int):
    subject = "Your BKNR ERP OTP Verification Code"
    body = f"""
    Hello,

    Your One-Time Password (OTP) for ERP verification is: {otp}

    This OTP is valid for 5 minutes. 
    Please do not share it with anyone.

    Regards,
    BKNR SOLUTIONS ERP System
    """

    message = MIMEText(body)
    message["Subject"] = subject
    message["From"] = SENDER_EMAIL
    message["To"] = to_email

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=context) as server:
            server.login(SENDER_EMAIL, SENDER_PASSWORD)
            server.send_message(message)
        print(f"✅ OTP sent successfully to {to_email}")
    except Exception as e:
        print(f"❌ Failed to send OTP: {e}")

# --------------------------------------------------------
# 🔹 Verify OTP (with expiry check)
# --------------------------------------------------------
def verify_otp(email: str, otp_code: str) -> bool:
    """Checks if OTP matches and is not expired"""
    record = otp_store.get(email)
    if not record:
        return False

    # Check expiry
    if datetime.now() > record["expiry"]:
        print(f"⚠️ OTP expired for {email}")
        otp_store.pop(email, None)
        return False

    # Check match
    if str(record["otp"]) == str(otp_code):
        otp_store.pop(email, None)
        return True

    return False
