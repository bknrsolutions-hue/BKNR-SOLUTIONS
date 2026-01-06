from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.database.models.users import User, Company


def get_gate_entry_report_emails(db: Session, company_code: str):

    company = (
        db.query(Company)
        .filter(Company.company_code == company_code)
        .first()
    )

    if not company:
        return []

    users = (
        db.query(User.email)
        .filter(
            User.company_id == company.id,
            or_(
                User.permissions == "ALL",
                User.permissions.ilike("%gate_entry_report%")
            )
        )
        .all()
    )

    return [u.email for u in users]
