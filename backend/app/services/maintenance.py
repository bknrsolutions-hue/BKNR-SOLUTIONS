"""
Maintenance Mode Service — BKNR ERP
=====================================
Two levels of maintenance:

  SOFT  → Users blocked, Admin can bypass (daily small fixes)
  HARD  → Users + Admin blocked, only Super Admin can bypass (DB migrations)

Cache TTL: 30 seconds (toggle takes effect quickly without hitting DB on every request).

Role definitions:
  role == "admin"       → can bypass SOFT maintenance
  role == "super_admin" → can bypass SOFT + HARD maintenance
"""
import time
import logging
from sqlalchemy.orm import Session

logger = logging.getLogger("BKNR_ERP")

MAINTENANCE_OFF  = "off"
MAINTENANCE_SOFT = "soft"   # Users ❌  Admin ✔  Super Admin ✔
MAINTENANCE_HARD = "hard"   # Users ❌  Admin ❌  Super Admin ✔

# In-process cache
_cache: dict = {"level": MAINTENANCE_OFF, "msg": "", "ts": 0.0}
_CACHE_TTL = 30  # seconds


def _upsert(db: Session, key: str, value: str, updated_by: str):
    from app.database.models.system_settings import SystemSetting
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if row:
        row.value = value
        row.updated_by = updated_by
    else:
        db.add(SystemSetting(key=key, value=value, updated_by=updated_by))


def _refresh_cache(db: Session):
    try:
        from app.database.models.system_settings import SystemSetting
        row_level = db.query(SystemSetting).filter(SystemSetting.key == "maintenance_level").first()
        row_msg   = db.query(SystemSetting).filter(SystemSetting.key == "maintenance_msg").first()
        _cache["level"] = row_level.value if row_level else MAINTENANCE_OFF
        _cache["msg"]   = row_msg.value   if row_msg   else "System is under maintenance. Please try again shortly."
        _cache["ts"]    = time.time()
    except Exception as e:
        logger.error("maintenance cache refresh error: %s", e)
        _cache["level"] = MAINTENANCE_OFF


def _ensure_fresh(db: Session):
    if time.time() - _cache["ts"] > _CACHE_TTL:
        _refresh_cache(db)


# ─────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────

def get_maintenance_level(db: Session) -> str:
    """Returns current level: 'off', 'soft', or 'hard'."""
    _ensure_fresh(db)
    return _cache["level"]


def get_maintenance_message(db: Session) -> str:
    _ensure_fresh(db)
    return _cache["msg"]


def is_maintenance_active(db: Session) -> bool:
    """True if maintenance is ON (soft or hard)."""
    return get_maintenance_level(db) != MAINTENANCE_OFF


def can_bypass(db: Session, role: str) -> bool:
    """
    Returns True if the given role is allowed through during maintenance.

    SOFT:  admin + super_admin bypass
    HARD:  only super_admin bypasses
    OFF:   everyone through
    """
    level = get_maintenance_level(db)
    if level == MAINTENANCE_OFF:
        return True
    if level == MAINTENANCE_SOFT:
        return role in ("admin", "super_admin")
    if level == MAINTENANCE_HARD:
        return role == "super_admin"
    return False


def set_maintenance(level: str, message: str, updated_by: str, db: Session):
    """
    Set maintenance level: 'soft', 'hard', or 'off'.
    Also records the action in system_settings.
    """
    if level not in (MAINTENANCE_OFF, MAINTENANCE_SOFT, MAINTENANCE_HARD):
        raise ValueError(f"Invalid maintenance level: {level!r}")
    try:
        _upsert(db, "maintenance_level", level, updated_by)
        _upsert(db, "maintenance_msg",   message, updated_by)
        db.commit()

        # Immediately update cache
        _cache["level"] = level
        _cache["msg"]   = message
        _cache["ts"]    = time.time()

        logger.info("Maintenance level set to '%s' by %s", level, updated_by)
    except Exception as e:
        db.rollback()
        logger.error("set_maintenance error: %s", e)
        raise
