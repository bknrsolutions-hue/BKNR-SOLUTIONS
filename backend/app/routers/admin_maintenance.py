"""
Maintenance Mode Admin Router — BKNR ERP
Super Admin only — toggle maintenance mode ON/OFF.
"""

from fastapi import APIRouter, Depends, Request, HTTPException, Body
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db

router = APIRouter(prefix="/admin/maintenance", tags=["Admin - Maintenance Mode"])


def _require_admin(request: Request):
    if request.session.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


@router.get("/status")
def get_status(request: Request, db: Session = Depends(get_db)):
    """Get current maintenance mode status."""
    _require_admin(request)
    from app.services.maintenance import is_maintenance_mode, get_maintenance_message
    return {
        "maintenance_mode": is_maintenance_mode(db),
        "message": get_maintenance_message(db),
    }


@router.post("/enable")
def enable_maintenance(request: Request, payload: dict = Body(default={}), db: Session = Depends(get_db)):
    """Turn maintenance mode ON."""
    _require_admin(request)
    from app.services.maintenance import set_maintenance_mode
    msg = payload.get("message", "System is under scheduled maintenance. We'll be back shortly.")
    user = request.session.get("email", "admin")
    set_maintenance_mode(enabled=True, message=msg, updated_by=user, db=db)
    return {"status": "ok", "maintenance_mode": True, "message": msg}


@router.post("/disable")
def disable_maintenance(request: Request, db: Session = Depends(get_db)):
    """Turn maintenance mode OFF."""
    _require_admin(request)
    from app.services.maintenance import set_maintenance_mode
    user = request.session.get("email", "admin")
    set_maintenance_mode(enabled=False, message="", updated_by=user, db=db)
    return {"status": "ok", "maintenance_mode": False}
