import os, smtplib
from email.message import EmailMessage

SMTP_EMAIL = os.getenv("SMTP_EMAIL")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SENDER_NAME = os.getenv("EMAIL_SENDER_NAME", "SVBK")
if not SENDER_NAME or "bknr" in SENDER_NAME.lower():
    SENDER_NAME = "SVBK"
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "bknr.solutions@gmail.com")

def build_otp_email(otp):
    html = f"""
    <!doctype html>
    <html>
    <body style="margin:0;padding:0;background:#eef6ff;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef6ff;padding:24px 12px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:540px;background:#ffffff;border:1px solid #dbeafe;border-radius:12px;overflow:hidden;">
              <tr>
                <td style="padding:18px 22px;background:#f8fbff;border-bottom:1px solid #e5eefb;">
                  <div style="font-size:18px;font-weight:800;color:#1d4ed8;">SVBK</div>
                  <div style="font-size:12px;color:#64748b;margin-top:4px;">Secure verification email</div>
                </td>
              </tr>
              <tr>
                <td style="padding:24px 22px;">
                  <h2 style="margin:0 0 12px;font-size:20px;color:#0f172a;">Your verification code</h2>
                  <p style="margin:0 0 18px;color:#475569;font-size:14px;line-height:1.6;">Use this code to continue in SVBK. Do not share it with anyone.</p>
                  <div style="padding:18px;background:#f0f7ff;border:1px solid #bfdbfe;border-radius:10px;text-align:center;">
                    <div style="font-size:12px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;">OTP</div>
                    <div style="font-size:32px;font-weight:800;color:#1d4ed8;letter-spacing:6px;margin-top:6px;">{otp}</div>
                  </div>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 22px;background:#f8fbff;border-top:1px solid #e5eefb;color:#64748b;font-size:12px;line-height:1.6;">
                  Sent by <strong>{SENDER_NAME}</strong> from {SMTP_EMAIL}<br>
                  For support, contact {SUPPORT_EMAIL}. This is an automated email.
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
    """
    text = f"SVBK verification code: {otp}\n\nDo not share this code with anyone.\nSupport: {SUPPORT_EMAIL}"
    return html, text

def send_otp_email(to_email, otp):

    if not SMTP_EMAIL or not SMTP_PASSWORD:
        raise Exception("Email service not configured")

    html, text = build_otp_email(otp)
    msg = EmailMessage()
    msg["Subject"] = "SVBK - OTP Verification"
    msg["From"] = f"{SENDER_NAME} <{SMTP_EMAIL}>"
    msg["To"] = to_email
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")

    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
        server.login(SMTP_EMAIL, SMTP_PASSWORD)
        server.send_message(msg)
