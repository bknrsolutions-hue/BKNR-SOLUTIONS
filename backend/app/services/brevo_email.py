import os, requests

BREVO_API_KEY = os.getenv("BREVO_API_KEY")
BREVO_URL = "https://api.brevo.com/v3/smtp/email"

SENDER_EMAIL = os.getenv("BREVO_SENDER_EMAIL", "bknr.solutions@gmail.com")
SENDER_NAME = os.getenv("BREVO_SENDER_NAME", "BKNR ERP")


def send_bulk_email(to_emails: list, subject: str, html: str):
    if not BREVO_API_KEY or not to_emails:
        return

    payload = {
        "sender": {"email": SENDER_EMAIL, "name": SENDER_NAME},
        "to": [{"email": e} for e in to_emails],
        "subject": subject,
        "htmlContent": html
    }

    headers = {
        "api-key": BREVO_API_KEY,
        "content-type": "application/json"
    }

    res = requests.post(BREVO_URL, json=payload, headers=headers)

    if res.status_code >= 400:
        print("❌ Gate Entry mail failed", res.text)
    else:
        print("✅ Gate Entry mail sent to:", to_emails)
