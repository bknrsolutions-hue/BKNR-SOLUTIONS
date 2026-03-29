from datetime import datetime
from app.database.models.audit import AuditLog


def save_audit_log(
    db,
    table_name,
    record_id,
    company_id,
    edited_by,
    field_name,
    old_value,
    new_value
):

    audit = AuditLog(
        table_name=table_name,
        record_id=record_id,
        company_id=company_id,
        field_name=field_name,
        old_value=str(old_value),
        new_value=str(new_value),
        edited_by=edited_by,
        edited_at=datetime.utcnow()
    )

    db.add(audit)
