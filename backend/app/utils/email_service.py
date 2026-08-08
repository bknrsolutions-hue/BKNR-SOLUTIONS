import logging
import os
import smtplib
from email.message import EmailMessage

import requests

from app.utils.timezone import ist_now

SMTP_EMAIL = os.getenv("SMTP_EMAIL") or os.getenv("BREVO_SENDER_EMAIL") or os.getenv("SUPPORT_EMAIL", "bknr.solutions@gmail.com")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SENDER_NAME = os.getenv("EMAIL_SENDER_NAME", "SVBK")
if not SENDER_NAME or "bknr" in SENDER_NAME.lower():
    SENDER_NAME = "SVBK"
SUPPORT_EMAIL = os.getenv("SUPPORT_EMAIL", "bknr.solutions@gmail.com")
BREVO_API_KEY = os.getenv("BREVO_API_KEY")
BREVO_URL = "https://api.brevo.com/v3/smtp/email"
logger = logging.getLogger("BKNR_ERP.email")


def send_email(to_email, subject, html, text=None, from_email=None, reply_to=None, attachment_bytes=None, attachment_name=None, attachment_type="application/pdf", attachments=None):
    reply = reply_to or from_email or SMTP_EMAIL

    # Normalize attachments list
    all_attachments = []
    if attachment_bytes and attachment_name:
        all_attachments.append((attachment_name, attachment_bytes, attachment_type))
    if attachments:
        for att in attachments:
            if isinstance(att, (list, tuple)) and len(att) >= 2:
                aname = att[0]
                abytes = att[1]
                atype = att[2] if len(att) >= 3 else "application/pdf"
                all_attachments.append((aname, abytes, atype))
            elif isinstance(att, dict):
                aname = att.get("filename") or att.get("name") or "attachment"
                abytes = att.get("content") or att.get("bytes") or att.get("raw_bytes")
                atype = att.get("mime_type") or att.get("type") or "application/pdf"
                if abytes:
                    all_attachments.append((aname, abytes, atype))

    if SMTP_EMAIL and SMTP_PASSWORD:
        try:
            message = EmailMessage()
            message["Subject"] = subject
            message["From"] = f"{SENDER_NAME} <{SMTP_EMAIL}>"
            if reply:
                message["Reply-To"] = reply
            message["To"] = to_email
            message.set_content(text or "Document Attachment Email")
            message.add_alternative(html, subtype="html")

            for aname, abytes, atype in all_attachments:
                maintype, subtype = atype.split("/", 1) if "/" in atype else ("application", "octet-stream")
                message.add_attachment(abytes, maintype=maintype, subtype=subtype, filename=aname)

            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
                server.login(SMTP_EMAIL, SMTP_PASSWORD)
                server.send_message(message)
            return
        except Exception:
            logger.warning("SMTP email delivery failed, falling back to Brevo...", exc_info=True)

    if BREVO_API_KEY:
        try:
            import base64
            payload_data = {
                "sender": {"name": SENDER_NAME, "email": SMTP_EMAIL or SUPPORT_EMAIL},
                "to": [{"email": to_email}],
                "subject": subject,
                "htmlContent": html,
            }
            if reply:
                payload_data["replyTo"] = {"email": reply}
            if all_attachments:
                brevo_atts = []
                for aname, abytes, _ in all_attachments:
                    b64_content = base64.b64encode(abytes).decode('utf-8')
                    brevo_atts.append({"name": aname, "content": b64_content})
                payload_data["attachment"] = brevo_atts

            response = requests.post(
                BREVO_URL,
                json=payload_data,
                headers={
                    "accept": "application/json",
                    "api-key": BREVO_API_KEY,
                    "content-type": "application/json",
                },
                timeout=10,
            )
            if response.status_code in (200, 201, 202):
                return
            logger.warning("Brevo rejected email with status %s", response.status_code)
        except Exception:
            logger.warning("Brevo email delivery failed", exc_info=True)

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
