"""
Feature Flags Service — BKNR ERP
=================================
Usage:
    from app.services.feature_flags import is_feature_enabled

    if is_feature_enabled("new_recon_table", company_code=comp_code, db=db):
        # show new UI

Resolution order (highest priority first):
    1. ENVIRONMENT == "staging"  → always True (staging sees all features)
    2. Tenant-specific override  → TenantFeatureAccess table
    3. Global flag               → FeatureFlag table
    4. Default                   → False
"""

import os
import logging
from sqlalchemy.orm import Session

logger = logging.getLogger("BKNR_ERP")

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")


def is_feature_enabled(flag_key: str, company_code: str = None, db: Session = None) -> bool:
    """
    Check if a feature flag is enabled for a given tenant.

    Args:
        flag_key:     The feature flag name (e.g. "new_recon_table")
        company_code: The tenant's company code (for tenant-level override)
        db:           SQLAlchemy session (required for DB lookup)

    Returns:
        bool — True if feature is active, False otherwise
    """
    # 1. Staging always sees all features (for testing)
    if ENVIRONMENT == "staging":
        return True

    if db is None:
        logger.warning("is_feature_enabled called without db session, defaulting to False")
        return False

    try:
        from app.database.models.feature_flags import FeatureFlag, TenantFeatureAccess

        # 2. Tenant-level override (highest priority after staging)
        if company_code:
            tenant_flag = db.query(TenantFeatureAccess).filter(
                TenantFeatureAccess.company_id == str(company_code),
                TenantFeatureAccess.flag_key == flag_key,
            ).first()
            if tenant_flag is not None:
                return bool(tenant_flag.is_enabled)

        # 3. Global flag
        global_flag = db.query(FeatureFlag).filter(
            FeatureFlag.flag_key == flag_key
        ).first()
        if global_flag is not None:
            return bool(global_flag.is_enabled)

    except Exception as e:
        logger.error("Feature flag lookup error for '%s': %s", flag_key, e)

    # 4. Default — off
    return False


def get_all_flags_for_tenant(company_code: str, db: Session) -> dict:
    """
    Returns a dict of {flag_key: bool} for all flags for a tenant.
    Used to pass feature_flags context to Jinja templates.
    """
    if ENVIRONMENT == "staging":
        # In staging, get all defined flags and return all True
        try:
            from app.database.models.feature_flags import FeatureFlag
            all_flags = db.query(FeatureFlag).all()
            return {f.flag_key: True for f in all_flags}
        except Exception:
            return {}

    try:
        from app.database.models.feature_flags import FeatureFlag, TenantFeatureAccess

        # Start with global flags
        global_flags = {f.flag_key: f.is_enabled for f in db.query(FeatureFlag).all()}

        # Apply tenant overrides
        tenant_overrides = {
            t.flag_key: t.is_enabled
            for t in db.query(TenantFeatureAccess).filter(
                TenantFeatureAccess.company_id == str(company_code)
            ).all()
        }

        merged = {**global_flags, **tenant_overrides}
        return {k: bool(v) for k, v in merged.items()}

    except Exception as e:
        logger.error("get_all_flags_for_tenant error: %s", e)
        return {}
