import os, smtplib
from email.message import EmailMessage

SMTP_EMAIL = os.getenv("SMTP_EMAIL")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")

def send_otp_email(to_email, otp):

    if not SMTP_EMAIL or not SMTP_PASSWORD:
        raise Exception("Email service not configured")

    msg = EmailMessage()
    msg["Subject"] = "BKNR ERP - OTP Verification"
    msg["From"] = SMTP_EMAIL
    msg["To"] = to_email
    msg.set_content(f"Your BKNR ERP OTP is: {otp}")

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(SMTP_EMAIL, SMTP_PASSWORD)
        server.send_message(msg)
