import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


SENDER_EMAIL = "bknr.solutions@gmail.com"
APP_PASSWORD = "obvhzyacbjgwympn"  # Gmail App Password required


def send_email_otp(email, otp):
    """Send OTP to email"""
    subject = "BKNR ERP - Email Verification OTP"
    message = f"""
    Hello,

    Your verification OTP is: <b>{otp}</b>

    Validity: 10 minutes

    Regards,
    BKNR SOLUTIONS
    """

    return send_email(email, subject, message)


def send_company_id_mail(email, name, company_code):
    """Send company code to newly registered user"""
    subject = "BKNR ERP - Company ID Created"
    message = f"""
    Hello {name},

    Your Company ID is: <b>{company_code}</b>

    Use this to login into ERP.

    Regards,
    BKNR SOLUTIONS
    """

    return send_email(email, subject, message)


def send_reset_password_link(email):
    """Send reset link"""
    subject = "BKNR ERP - Password Reset Link"
    link = "http://127.0.0.1:8000/reset-password"

    message = f"""
    Hello,

    Click the below link to reset your password:

    <a href="{link}">Reset Password</a>

    Regards,
    BKNR SOLUTIONS
    """

    return send_email(email, subject, message)



def send_email(to_email, subject, html_message):
    """Common Email Handler"""
    try:
        msg = MIMEMultipart()
        msg["From"] = SENDER_EMAIL
        msg["To"] = to_email
        msg["Subject"] = subject

        msg.attach(MIMEText(html_message, "html"))

        server = smtplib.SMTP_SSL("smtp.gmail.com", 465)
        server.login(SENDER_EMAIL, APP_PASSWORD)
        server.send_message(msg)
        server.quit()

        return True

    except Exception as e:
        print("EMAIL FAILED:", e)
        return False
