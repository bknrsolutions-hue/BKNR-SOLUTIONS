# app/utils/email_service.py

import smtplib
from email.mime.text import MIMEText

EMAIL_USER = "bknr.solutions@gmail.com"
EMAIL_PASS = "jtwwkttabthsvdeu"   # Gmail App Password

def send_mail(to_email, subject, body):
    msg = MIMEText(body, "html")
    msg["Subject"] = subject
    msg["From"] = EMAIL_USER
    msg["To"] = to_email

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(EMAIL_USER, EMAIL_PASS)
        server.sendmail(EMAIL_USER, to_email, msg.as_string())
