import imaplib
import email
from email.header import decode_header
from email.utils import parsedate_to_datetime
import re
import logging
from datetime import datetime
from zoneinfo import ZoneInfo
import os
from sqlalchemy.orm import Session

from app.database.models.crm_quotation import CRMQuotation, CRMQuotationReply

logger = logging.getLogger("BKNR_ERP.email_poller")

_IST = ZoneInfo("Asia/Kolkata")

def _parse_email_date_ist(date_str: str) -> datetime:
    """Parse email Date header and return a naive IST datetime."""
    try:
        dt = parsedate_to_datetime(date_str)
        return dt.astimezone(_IST).replace(tzinfo=None)
    except Exception:
        return datetime.now(_IST).replace(tzinfo=None)

def poll_inbound_emails(db: Session):
    try:
        from app.routers.crm_quotation_router import ensure_crm_quotation_schema
        ensure_crm_quotation_schema(db)
    except Exception:
        pass
    """
    Connects to Gmail/SMTP via IMAP to check for unread replies matching Quotations (QT-2026-XXXX).
    Zero external cost, built into standard Python imaplib.
    """
    smtp_email = os.getenv("SMTP_EMAIL") or os.getenv("BREVO_SENDER_EMAIL") or os.getenv("SUPPORT_EMAIL", "bknr.solutions@gmail.com")
    smtp_password = os.getenv("SMTP_PASSWORD")

    if not smtp_email or not smtp_password:
        return {"success": False, "count": 0, "message": "SMTP Email credentials not configured for IMAP."}

    fetched_count = 0
    try:
        # Connect to Gmail IMAP
        mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
        mail.login(smtp_email, smtp_password)
        mail.select("inbox")

        # Search for UNSEEN emails
        status, response = mail.search(None, 'UNSEEN')
        if status != "OK" or not response[0]:
            mail.logout()
            return {"success": True, "count": 0, "message": "No new unread email replies found."}

        email_ids = response[0].split()
        for e_id in email_ids:
            try:
                res, msg_data = mail.fetch(e_id, "(RFC822)")
                if res != "OK":
                    continue

                for response_part in msg_data:
                    if isinstance(response_part, tuple):
                        msg = email.message_from_bytes(response_part[1])
                        
                        # Extract Subject
                        raw_subj = msg["Subject"] or ""
                        subj_bytes, encoding = decode_header(raw_subj)[0]
                        if isinstance(subj_bytes, bytes):
                            subject_text = subj_bytes.decode(encoding or "utf-8", errors="ignore")
                        else:
                            subject_text = str(subj_bytes)

                        # Extract From
                        from_header = msg["From"] or ""
                        sender_email = from_header
                        if "<" in from_header and ">" in from_header:
                            sender_email = from_header.split("<")[1].split(">")[0]

                        # Check if subject contains QT-XXXX-XXXX or PI-XXXX-XXXX pattern
                        match = re.search(r"(QT|PI|SO|INV)-\d{4}-\d{4}", subject_text, re.IGNORECASE)
                        quotation = None
                        if match:
                            q_no = match.group(0).upper()
                            quotation = db.query(CRMQuotation).filter(CRMQuotation.quotation_no == q_no).first()

                        if not quotation and sender_email:
                            # Match by sender_email if subject doesn't contain explicit QT/PI number
                            quotation = db.query(CRMQuotation).filter(
                                (CRMQuotation.customer_email == sender_email) | (CRMQuotation.customer_name == sender_email)
                            ).order_by(CRMQuotation.id.desc()).first()

                        if not quotation:
                            continue

                        q_no = quotation.quotation_no

                        # Extract Message Body & Attachments
                        body_text = ""
                        html_text = ""
                        attachments = []

                        if msg.is_multipart():
                            for part in msg.walk():
                                c_type = part.get_content_type()
                                c_disp = str(part.get('Content-Disposition') or '')
                                filename = part.get_filename()

                                # Extract Plain Body
                                if c_type == "text/plain" and "attachment" not in c_disp and not filename:
                                    payload = part.get_payload(decode=True)
                                    if payload:
                                        body_text = payload.decode(errors="ignore")

                                # Extract HTML Body fallback
                                if c_type == "text/html" and "attachment" not in c_disp and not filename:
                                    payload = part.get_payload(decode=True)
                                    if payload:
                                        html_text = payload.decode(errors="ignore")

                                # Extract Attachments (Photos, Images, PDFs, Documents)
                                is_image = c_type.startswith("image/")
                                is_pdf = c_type == "application/pdf"
                                is_attachment = filename or "attachment" in c_disp or "inline" in c_disp or is_image or is_pdf

                                if is_attachment and c_type not in ["text/plain", "text/html"]:
                                    file_payload = part.get_payload(decode=True)
                                    if file_payload:
                                        import base64
                                        ext = "png"
                                        if "jpeg" in c_type or "jpg" in c_type:
                                            ext = "jpg"
                                        elif "gif" in c_type:
                                            ext = "gif"
                                        elif "pdf" in c_type:
                                            ext = "pdf"

                                        fname = filename or f"photo_{len(attachments)+1}.{ext}"
                                        # Decode header if filename is encoded
                                        try:
                                            fn_bytes, fn_enc = decode_header(fname)[0]
                                            if isinstance(fn_bytes, bytes):
                                                fname = fn_bytes.decode(fn_enc or "utf-8", errors="ignore")
                                        except Exception:
                                            pass

                                        b64_data = base64.b64encode(file_payload).decode("utf-8")
                                        mime = c_type or "application/octet-stream"
                                        attachments.append({
                                            "filename": fname,
                                            "mime_type": mime,
                                            "data_url": f"data:{mime};base64,{b64_data}"
                                        })
                        else:
                            payload = msg.get_payload(decode=True)
                            if payload:
                                body_text = payload.decode(errors="ignore")

                        if not body_text:
                            if html_text:
                                body_text = re.sub(r'<[^>]+>', ' ', html_text)
                            else:
                                body_text = subject_text

                        import json
                        attachments_json_str = json.dumps(attachments) if attachments else None

                        # Avoid Duplicate Message Log
                        msg_id = msg.get("Message-ID") or f"{q_no}_{datetime.utcnow().timestamp()}"
                        existing = db.query(CRMQuotationReply).filter(CRMQuotationReply.message_id == msg_id).first()
                        if existing:
                            continue

                        reply_entry = CRMQuotationReply(
                            quotation_id=quotation.id,
                            quotation_no=quotation.quotation_no,
                            sender_email=sender_email,
                            recipient_email=smtp_email,
                            subject=subject_text,
                            message_body=body_text.strip(),
                            direction="INBOUND",
                            message_id=msg_id,
                            attachments_json=attachments_json_str,
                            received_at=_parse_email_date_ist(msg.get("Date", ""))
                        )
                        db.add(reply_entry)
                        quotation.status = "CUSTOMER REPLIED"
                        fetched_count += 1
            except Exception as ex:
                logger.warning(f"Error parsing email ID {e_id}: {ex}")

        db.commit()
        mail.logout()
        return {"success": True, "count": fetched_count, "message": f"Successfully synced {fetched_count} email replies from Gmail!"}

    except Exception as e:
        logger.error(f"IMAP Poller Error: {e}")
        return {"success": False, "count": 0, "message": f"IMAP Sync Notice: {str(e)}"}
