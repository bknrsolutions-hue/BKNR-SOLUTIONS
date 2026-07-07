"""
Maintenance Mode Service — BKNR ERP
=====================================
Checks if maintenance mode is active, with a short cache (30s).
Admins bypass maintenance mode automatically.
"""
import time
import logging
from sqlalchemy.orm import Session

logger = logging.getLogger("BKNR_ERP")

# Simple in-process cache: (value, timestamp)
_cache: dict = {"enabled": False, "msg": "", "ts": 0.0}
_CACHE_TTL = 30  # seconds — toggle takes effect within 30s


def _refresh_cache(db: Session):
    """Read from DB and refresh cache."""
    try:
        from app.database.models.system_settings import SystemSetting
        row_mode = db.query(SystemSetting).filter(SystemSetting.key == "maintenance_mode").first()
        row_msg = db.query(SystemSetting).filter(SystemSetting.key == "maintenance_msg").first()
        _cache["enabled"] = (row_mode.value.lower() == "true") if row_mode else False
        _cache["msg"] = row_msg.value if row_msg else "System is under maintenance. Please try again shortly."
        _cache["ts"] = time.time()
    except Exception as e:
        logger.error("maintenance_mode cache refresh error: %s", e)
        _cache["enabled"] = False


def is_maintenance_mode(db: Session) -> bool:
    """Returns True if maintenance mode is currently active."""
    if time.time() - _cache["ts"] > _CACHE_TTL:
        _refresh_cache(db)
    return _cache["enabled"]


def get_maintenance_message(db: Session) -> str:
    """Returns the current maintenance message."""
    if time.time() - _cache["ts"] > _CACHE_TTL:
        _refresh_cache(db)
    return _cache["msg"]


def set_maintenance_mode(enabled: bool, message: str, updated_by: str, db: Session):
    """Toggle maintenance mode ON or OFF."""
    try:
        from app.database.models.system_settings import SystemSetting

        # Upsert maintenance_mode
        row = db.query(SystemSetting).filter(SystemSetting.key == "maintenance_mode").first()
        if row:
            row.value = "true" if enabled else "false"
            row.updated_by = updated_by
        else:
            db.add(SystemSetting(key="maintenance_mode", value="true" if enabled else "false", updated_by=updated_by))

        # Upsert maintenance_msg
        row_msg = db.query(SystemSetting).filter(SystemSetting.key == "maintenance_msg").first()
        if row_msg:
            row_msg.value = message
            row_msg.updated_by = updated_by
        else:
            db.add(SystemSetting(key="maintenance_msg", value=message, updated_by=updated_by))

        db.commit()

        # Immediately invalidate cache
        _cache["enabled"] = enabled
        _cache["msg"] = message
        _cache["ts"] = time.time()

        logger.info("Maintenance mode %s by %s", "ENABLED" if enabled else "DISABLED", updated_by)
    except Exception as e:
        db.rollback()
        logger.error("set_maintenance_mode error: %s", e)
        raise
