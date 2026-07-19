"""
Feature Flags System — BKNR ERP
================================
3 levels of control:
  1. Global ON/OFF         — FEATURE_FLAGS table (flag_key, is_enabled)
  2. Tenant-specific       — TENANT_FEATURE_ACCESS table (company_id, flag_key, is_enabled)
  3. Environment override  — ENVIRONMENT env var (staging always gets all flags ON for testing)
"""

from sqlalchemy import Column, String, Boolean, DateTime, Text
from sqlalchemy.sql import func
from app.database import Base


class FeatureFlag(Base):
    """Global feature flag — applies to all tenants unless overridden."""
    __tablename__ = "feature_flags"

    flag_key     = Column(String(100), primary_key=True)           # e.g. "new_recon_table"
    description  = Column(Text, nullable=True)                     # human-readable description
    is_enabled   = Column(Boolean, default=False, nullable=False)  # global default
    introduced_in = Column(String(20), nullable=True)              # e.g. "1.0.2" — version when flag was added
    removed_in    = Column(String(20), nullable=True)              # e.g. "2.0.0" — version when feature was retired
    created_at   = Column(DateTime(timezone=True), server_default=func.now())
    updated_at   = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<FeatureFlag {self.flag_key}={self.is_enabled} introduced={self.introduced_in}>"


class TenantFeatureAccess(Base):
    """Per-tenant feature flag override — overrides the global flag for a specific tenant."""
    __tablename__ = "tenant_feature_access"

    id = Column(String(50), primary_key=True)                  # company_id + "_" + flag_key
    company_id = Column(String(50), nullable=False, index=True)
    flag_key = Column(String(100), nullable=False, index=True)
    is_enabled = Column(Boolean, default=False, nullable=False) # tenant-specific override
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<TenantFeatureAccess {self.company_id}:{self.flag_key}={self.is_enabled}>"
