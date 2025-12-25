# app/services/brevo_email.py
import os, requests
from fastapi import HTTPException

BREVO_API_KEY = os.getenv("BREVO_API_KEY")
SENDER_EMAIL = os.getenv("BREVO_SENDER_EMAIL")
SENDER_NAME = os.getenv("BREVO_SENDER_NAME")
BREVO_URL = "https://api.brevo.com/v3/smtp/email"

def send_brevo_email(to_email: str, subject: str, html: str):
    if not BREVO_API_KEY:
        raise HTTPException(500, "Brevo API key not configured")

    payload = {
        "sender": {"email": SENDER_EMAIL, "name": SENDER_NAME},
        "to": [{"email": to_email}],
        "subject": subject,
        "htmlContent": html
    }
    headers = {"api-key": BREVO_API_KEY, "content-type": "application/json"}

    r = requests.post(BREVO_URL, json=payload, headers=headers)
    if r.status_code >= 400:
        raise HTTPException(500, "Email sending failed")
