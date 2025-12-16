from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.database.models.users import OTPTable
from datetime import datetime, timedelta
import json

OTP_EXP_MINUTES = 10


def store_otp(email: str, otp: str, extra: dict = None):
    db: Session = SessionLocal()

    record = db.query(OTPTable).filter(OTPTable.email == email).first()

    if record:
        record.otp = otp
        record.extra = json.dumps(extra) if extra else None
        record.is_used = False
        record.created_at = datetime.utcnow()
    else:
        record = OTPTable(
            email=email,
            otp=otp,
            extra=json.dumps(extra) if extra else None
        )
        db.add(record)

    db.commit()
    db.close()


def verify_stored_otp(email: str, otp: str = None):
    db: Session = SessionLocal()

    record = db.query(OTPTable).filter(
        OTPTable.email == email,
        OTPTable.is_used == False
    ).first()

    if not record:
        db.close()
        return None

    if otp and record.otp != otp:
        db.close()
        return None

    if datetime.utcnow() > record.created_at + timedelta(minutes=OTP_EXP_MINUTES):
        db.close()
        return None

    record.is_used = True
    db.commit()

    data = {
        "email": record.email,
        "extra": json.loads(record.extra) if record.extra else None
    }

    db.close()
    return data
