import os, requests

BREVO_API_KEY = os.getenv("BREVO_API_KEY")
BREVO_URL = "https://api.brevo.com/v3/smtp/email"

SENDER_EMAIL = os.getenv("BREVO_SENDER_EMAIL", "bknr.solutions@gmail.com")
SENDER_NAME = os.getenv("BREVO_SENDER_NAME", "SVBK")
if not SENDER_NAME or "bknr" in SENDER_NAME.lower():
    SENDER_NAME = "SVBK"
REPLY_TO_EMAIL = os.getenv("SUPPORT_EMAIL", SENDER_EMAIL)


def send_bulk_email(to_emails: list, subject: str, html: str, text: str = ""):
    if not BREVO_API_KEY or not to_emails:
        return

    clean_emails = sorted({str(e).strip().lower() for e in to_emails if str(e).strip()})
    if not clean_emails:
        return

    payload = {
        "sender": {"email": SENDER_EMAIL, "name": SENDER_NAME},
        "to": [{"email": e} for e in clean_emails],
        "replyTo": {"email": REPLY_TO_EMAIL, "name": SENDER_NAME},
        "subject": subject,
        "htmlContent": html
    }
    if text:
        payload["textContent"] = text

    headers = {
        "api-key": BREVO_API_KEY,
        "content-type": "application/json"
    }

    res = requests.post(BREVO_URL, json=payload, headers=headers)

    if res.status_code >= 400:
        print("Gate Entry mail failed", res.text)
    else:
        print("Gate Entry mail sent to:", clean_emails)
