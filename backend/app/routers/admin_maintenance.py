"""
Maintenance Mode Admin Router — BKNR ERP
=========================================
SOFT mode  → requires role: admin or super_admin
HARD mode  → requires role: super_admin only
"""

from fastapi import APIRouter, Depends, Request, HTTPException, Body
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.maintenance import (
    MAINTENANCE_OFF, MAINTENANCE_SOFT, MAINTENANCE_HARD,
    get_maintenance_level, get_maintenance_message, is_maintenance_active,
    set_maintenance
)

import os

router = APIRouter(prefix="/admin/maintenance", tags=["Admin - Maintenance Mode"])


def _role(request: Request) -> str:
    deploy_token = request.headers.get("X-Deploy-Token")
    expected_token = os.getenv("DEPLOYMENT_TOKEN", "bknr_deploy_token_2026")
    if deploy_token and deploy_token == expected_token:
        return "super_admin"
    return request.session.get("role", "")


def _require_min_admin(request: Request):
    """Require at least 'admin' role."""
    if _role(request) not in ("admin", "super_admin"):
        raise HTTPException(status_code=403, detail="Admin access required")


def _require_super_admin(request: Request):
    """Require 'super_admin' role."""
    if _role(request) != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")


# ─── Status (any admin) ───────────────────────────────────────
@router.get("/status")
def get_status(request: Request, db: Session = Depends(get_db)):
    """Get current maintenance level and message."""
    _require_min_admin(request)
    return {
        "maintenance_active": is_maintenance_active(db),
        "level": get_maintenance_level(db),
        "message": get_maintenance_message(db),
        "levels": {
            "soft": "Users ❌  Admin ✔  Super Admin ✔ (daily fixes)",
            "hard": "Users ❌  Admin ❌  Super Admin ✔ (DB migrations/schema changes)",
        },
    }


# ─── Soft Maintenance (admin) ─────────────────────────────────
@router.post("/soft/enable")
def enable_soft(request: Request, payload: dict = Body(default={}), db: Session = Depends(get_db)):
    """Enable SOFT maintenance — admins can still work."""
    _require_min_admin(request)
    msg = payload.get("message", "Minor maintenance in progress. Admins can continue working.")
    set_maintenance(MAINTENANCE_SOFT, msg, request.session.get("email", "admin"), db)
    return {"status": "ok", "level": MAINTENANCE_SOFT, "message": msg}


# ─── Hard Maintenance (super_admin only) ──────────────────────
@router.post("/hard/enable")
def enable_hard(request: Request, payload: dict = Body(default={}), db: Session = Depends(get_db)):
    """Enable HARD maintenance — only super_admin can access (for DB migrations)."""
    _require_super_admin(request)
    msg = payload.get("message", "Critical system upgrade in progress. Service will resume shortly.")
    set_maintenance(MAINTENANCE_HARD, msg, request.session.get("email", "super_admin"), db)
    return {"status": "ok", "level": MAINTENANCE_HARD, "message": msg}


# ─── Disable Maintenance ──────────────────────────────────────
@router.post("/disable")
def disable_maintenance(request: Request, db: Session = Depends(get_db)):
    """Turn maintenance mode OFF. Super admin required if current level is HARD."""
    current = get_maintenance_level(db)
    if current == MAINTENANCE_HARD:
        _require_super_admin(request)
    else:
        _require_min_admin(request)

    set_maintenance(MAINTENANCE_OFF, "", request.session.get("email", "admin"), db)
    return {"status": "ok", "level": MAINTENANCE_OFF}
