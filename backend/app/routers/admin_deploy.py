"""
Deployment Admin Router — BKNR ERP
Super Admin only — manage deployment locks and view deploy logs.
"""

from fastapi import APIRouter, Depends, Request, HTTPException, Body
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.deployment import (
    acquire_lock, release_lock, get_lock_status, get_audit_log, audit
)

import os

router = APIRouter(prefix="/admin/deploy", tags=["Admin - Deployment Management"])


def _require_super_admin(request: Request):
    deploy_token = request.headers.get("X-Deploy-Token")
    expected_token = os.getenv("DEPLOYMENT_TOKEN", "bknr_deploy_token_2026")
    if deploy_token and deploy_token == expected_token:
        return
    if request.session.get("role") != "super_admin":
        raise HTTPException(status_code=403, detail="Super Admin access required")


def _get_actor(request: Request) -> str:
    deploy_token = request.headers.get("X-Deploy-Token")
    expected_token = os.getenv("DEPLOYMENT_TOKEN", "bknr_deploy_token_2026")
    if deploy_token and deploy_token == expected_token:
        return request.headers.get("X-Deploy-Actor", "release_script")
    return request.session.get("email", "release_script")


@router.get("/status")
def lock_status(request: Request, db: Session = Depends(get_db)):
    """Get deployment lock status."""
    _require_super_admin(request)
    return get_lock_status(db)


@router.post("/lock")
def lock_deployment(request: Request, payload: dict = Body(default={}), db: Session = Depends(get_db)):
    """Acquire deployment lock before starting a release."""
    _require_super_admin(request)
    version = payload.get("version", "unknown").strip()
    actor = _get_actor(request)
    
    success = acquire_lock(actor=actor, version=version, db=db)
    if not success:
        status = get_lock_status(db)
        raise HTTPException(
            status_code=409, 
            detail=f"Deployment already in progress, locked by {status['locked_by']} at {status['locked_at']}"
        )
    return {"status": "locked", "version": version, "actor": actor}


@router.post("/unlock")
def unlock_deployment(request: Request, payload: dict = Body(default={}), db: Session = Depends(get_db)):
    """Release deployment lock after finishing (or failing) a release."""
    _require_super_admin(request)
    version = payload.get("version", "unknown").strip()
    actor = _get_actor(request)
    result = payload.get("result", "success")
    detail = payload.get("detail", "")
    
    release_lock(actor=actor, version=version, db=db, result=result, detail=detail)
    return {"status": "unlocked"}


@router.get("/audit")
def view_audit_log(request: Request, db: Session = Depends(get_db)):
    """Retrieve immutable deployment audit logs."""
    _require_super_admin(request)
    return get_audit_log(db)
