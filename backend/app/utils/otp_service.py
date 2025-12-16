import json
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.database.models.users import OTPTable

OTP_EXPIRY_MINUTES = 5


def store_otp(db: Session, email: str, otp: str, extra=None):
    record = db.query(OTPTable).filter(OTPTable.email == email).first()

    if not record:
        record = OTPTable(email=email)

    record.otp = str(otp)
    record.extra = json.dumps(extra) if extra else None
    record.is_used = False
    record.created_at = datetime.utcnow()

    db.add(record)
    db.commit()


def verify_stored_otp(db: Session, email: str, otp: str = None):
    record = db.query(OTPTable).filter(OTPTable.email == email).first()

    if not record:
        return None

    # Expiry check
    if datetime.utcnow() - record.created_at > timedelta(minutes=OTP_EXPIRY_MINUTES):
        db.delete(record)
        db.commit()
        return None

    # OTP verification
    if otp:
        if record.is_used:
            return None

        if record.otp != str(otp):
            return None

        record.is_used = True
        db.commit()

    return {
        "email": record.email,
        "extra": json.loads(record.extra) if record.extra else None
    }
