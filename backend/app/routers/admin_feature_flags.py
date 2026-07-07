"""
Feature Flags Admin Router — BKNR ERP
Admin-only API to manage global and tenant-level feature flags.
"""

from fastapi import APIRouter, Depends, Request, HTTPException, Body
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from app.database import get_db
from app.database.models.feature_flags import FeatureFlag, TenantFeatureAccess

router = APIRouter(prefix="/admin/feature-flags", tags=["Admin - Feature Flags"])


def _require_admin(request: Request):
    role = request.session.get("role")
    if role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")


# ─────────────────────────────────────────────
# GET — list all global flags
# ─────────────────────────────────────────────
@router.get("")
def list_flags(request: Request, db: Session = Depends(get_db)):
    _require_admin(request)
    flags = db.query(FeatureFlag).all()
    return [{"flag_key": f.flag_key, "is_enabled": f.is_enabled, "description": f.description} for f in flags]


# ─────────────────────────────────────────────
# POST — create or update a global flag
# ─────────────────────────────────────────────
@router.post("")
def upsert_flag(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    _require_admin(request)
    key = payload.get("flag_key", "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="flag_key is required")

    flag = db.query(FeatureFlag).filter(FeatureFlag.flag_key == key).first()
    if flag:
        flag.is_enabled = bool(payload.get("is_enabled", False))
        flag.description = payload.get("description", flag.description)
    else:
        flag = FeatureFlag(
            flag_key=key,
            is_enabled=bool(payload.get("is_enabled", False)),
            description=payload.get("description", ""),
        )
        db.add(flag)
    db.commit()
    return {"status": "ok", "flag_key": key, "is_enabled": flag.is_enabled}


# ─────────────────────────────────────────────
# DELETE — remove a global flag
# ─────────────────────────────────────────────
@router.delete("/{flag_key}")
def delete_flag(flag_key: str, request: Request, db: Session = Depends(get_db)):
    _require_admin(request)
    db.query(FeatureFlag).filter(FeatureFlag.flag_key == flag_key).delete()
    db.query(TenantFeatureAccess).filter(TenantFeatureAccess.flag_key == flag_key).delete()
    db.commit()
    return {"status": "deleted", "flag_key": flag_key}


# ─────────────────────────────────────────────
# GET — list tenant overrides for a company
# ─────────────────────────────────────────────
@router.get("/tenant/{company_id}")
def list_tenant_flags(company_id: str, request: Request, db: Session = Depends(get_db)):
    _require_admin(request)
    overrides = db.query(TenantFeatureAccess).filter(
        TenantFeatureAccess.company_id == company_id
    ).all()
    return [{"flag_key": t.flag_key, "is_enabled": t.is_enabled} for t in overrides]


# ─────────────────────────────────────────────
# POST — set tenant-level override
# ─────────────────────────────────────────────
@router.post("/tenant")
def set_tenant_flag(request: Request, payload: dict = Body(...), db: Session = Depends(get_db)):
    _require_admin(request)
    company_id = str(payload.get("company_id", "")).strip()
    flag_key = str(payload.get("flag_key", "")).strip()
    if not company_id or not flag_key:
        raise HTTPException(status_code=400, detail="company_id and flag_key required")

    record_id = f"{company_id}_{flag_key}"
    override = db.query(TenantFeatureAccess).filter(
        TenantFeatureAccess.id == record_id
    ).first()

    if override:
        override.is_enabled = bool(payload.get("is_enabled", False))
    else:
        override = TenantFeatureAccess(
            id=record_id,
            company_id=company_id,
            flag_key=flag_key,
            is_enabled=bool(payload.get("is_enabled", False)),
        )
        db.add(override)
    db.commit()
    return {"status": "ok", "company_id": company_id, "flag_key": flag_key, "is_enabled": override.is_enabled}


# ─────────────────────────────────────────────
# DELETE — remove tenant override
# ─────────────────────────────────────────────
@router.delete("/tenant/{company_id}/{flag_key}")
def delete_tenant_flag(company_id: str, flag_key: str, request: Request, db: Session = Depends(get_db)):
    _require_admin(request)
    record_id = f"{company_id}_{flag_key}"
    db.query(TenantFeatureAccess).filter(TenantFeatureAccess.id == record_id).delete()
    db.commit()
    return {"status": "deleted", "company_id": company_id, "flag_key": flag_key}
