"""
Deployment Service — BKNR ERP
==============================
Handles:
  1. Deployment Lock  — prevents two simultaneous deploys
  2. Audit Log        — appends immutable record for every deploy-related action
"""
import logging
import subprocess
from datetime import datetime, timezone
from sqlalchemy.orm import Session

logger = logging.getLogger("BKNR_ERP")

LOCK_KEY = "deployment_lock"
LOCK_BY_KEY = "deployment_lock_by"
LOCK_AT_KEY = "deployment_lock_at"


# ─── Helpers ────────────────────────────────────────────────────────────────

def _get_setting(db: Session, key: str) -> str:
    from app.database.models.system_settings import SystemSetting
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    return row.value if row else ""


def _set_setting(db: Session, key: str, value: str, updated_by: str = "system"):
    from app.database.models.system_settings import SystemSetting
    row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
    if row:
        row.value = value
        row.updated_by = updated_by
    else:
        db.add(SystemSetting(key=key, value=value, updated_by=updated_by))


def _git_commit() -> str:
    """Returns current short git commit SHA, or empty string if not in a git repo."""
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], stderr=subprocess.DEVNULL
        ).decode().strip()
    except Exception:
        return ""


# ─── Deployment Lock ─────────────────────────────────────────────────────────

def get_lock_status(db: Session) -> dict:
    """Returns current lock state."""
    locked = _get_setting(db, LOCK_KEY) == "true"
    return {
        "locked": locked,
        "locked_by": _get_setting(db, LOCK_BY_KEY) if locked else None,
        "locked_at": _get_setting(db, LOCK_AT_KEY) if locked else None,
    }


def acquire_lock(actor: str, version: str, db: Session) -> bool:
    """
    Try to acquire deployment lock.
    Returns True if lock acquired, False if already locked.
    """
    current = _get_setting(db, LOCK_KEY)
    if current == "true":
        locked_by = _get_setting(db, LOCK_BY_KEY)
        logger.warning("Deployment lock already held by %s — rejecting lock from %s", locked_by, actor)
        return False

    _set_setting(db, LOCK_KEY,    "true",                         actor)
    _set_setting(db, LOCK_BY_KEY, actor,                          actor)
    _set_setting(db, LOCK_AT_KEY, datetime.now(timezone.utc).isoformat(), actor)
    db.commit()

    audit(db, action="lock_acquire", version=version, actor=actor,
          result="success", detail=f"Deployment lock acquired for v{version}")
    logger.info("Deployment lock acquired by %s for v%s", actor, version)
    return True


def release_lock(actor: str, version: str, db: Session, result: str = "success", detail: str = ""):
    """Release the deployment lock."""
    _set_setting(db, LOCK_KEY,    "false", actor)
    _set_setting(db, LOCK_BY_KEY, "",      actor)
    _set_setting(db, LOCK_AT_KEY, "",      actor)
    db.commit()

    audit(db, action="lock_release", version=version, actor=actor,
          result=result, detail=detail or f"Deployment lock released after v{version}")
    logger.info("Deployment lock released by %s", actor)


# ─── Audit Log ───────────────────────────────────────────────────────────────

def audit(db: Session, action: str, actor: str = "system",
          version: str = None, result: str = "success", detail: str = "") -> None:
    """
    Append an immutable audit log entry.

    Actions: release | maintenance_on | maintenance_off | lock_acquire | lock_release | rollback
    Results: success | failure | rollback
    """
    try:
        from app.database.models.system_settings import DeploymentAuditLog
        entry = DeploymentAuditLog(
            action=action,
            version=version,
            actor=actor,
            git_commit=_git_commit(),
            result=result,
            detail=detail,
        )
        db.add(entry)
        db.commit()
    except Exception as e:
        logger.error("audit() failed: %s", e)
        try:
            db.rollback()
        except Exception:
            pass


def get_audit_log(db: Session, limit: int = 50) -> list:
    """Return recent audit log entries, newest first."""
    try:
        from app.database.models.system_settings import DeploymentAuditLog
        rows = db.query(DeploymentAuditLog).order_by(
            DeploymentAuditLog.id.desc()
        ).limit(limit).all()
        return [
            {
                "id": r.id,
                "timestamp": r.timestamp.isoformat() if r.timestamp else None,
                "action": r.action,
                "version": r.version,
                "actor": r.actor,
                "git_commit": r.git_commit,
                "result": r.result,
                "detail": r.detail,
            }
            for r in rows
        ]
    except Exception as e:
        logger.error("get_audit_log error: %s", e)
        return []
