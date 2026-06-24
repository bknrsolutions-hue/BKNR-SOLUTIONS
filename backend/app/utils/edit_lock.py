from datetime import date, datetime
from typing import Any

from app.utils.timezone import ist_now


ADMIN_ROLES = {"admin", "super_admin", "super admin", "Admin", "Super Admin"}
LOCK_AFTER_DAYS = 5


def is_admin_session(request: Any) -> bool:
    role = request.session.get("role") if hasattr(request, "session") else None
    email = request.session.get("email") if hasattr(request, "session") else None
    return role in ADMIN_ROLES or str(email or "").strip().lower() == "bknr.solutions@gmail.com"


def _to_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text).date()
    except ValueError:
        try:
            return datetime.strptime(text[:10], "%Y-%m-%d").date()
        except ValueError:
            return None


def is_edit_locked(request: Any, record_date: Any, *, today: date | None = None) -> bool:
    if is_admin_session(request):
        return False
    parsed_date = _to_date(record_date)
    if parsed_date is None:
        return False
    today = today or ist_now().date()
    return (today - parsed_date).days > LOCK_AFTER_DAYS


def edit_lock_message() -> str:
    return f"Edit locked after {LOCK_AFTER_DAYS} days. Only admin can edit/delete this record."
