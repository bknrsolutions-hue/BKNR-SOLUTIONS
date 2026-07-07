from sqlalchemy import Column, String, Boolean, DateTime, Text, Integer
from sqlalchemy.sql import func
from app.database import Base


class SystemSetting(Base):
    """
    Key-value table for system-wide settings.
    Examples:
        maintenance_level = "off" / "soft" / "hard"
        maintenance_msg   = "Scheduled upgrade in progress..."
    """
    __tablename__ = "system_settings"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=False, default="")
    updated_by = Column(String(200), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<SystemSetting {self.key}={self.value}>"


class SystemVersion(Base):
    """
    Release version history — one row per production release.
    Used by /api/version and admin rollback UI.
    """
    __tablename__ = "system_versions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    version = Column(String(20), nullable=False, unique=True)   # e.g. "1.0.2"
    release_date = Column(DateTime(timezone=True), server_default=func.now())
    description = Column(Text, nullable=True)                    # release notes
    released_by = Column(String(200), nullable=True)             # admin email
    is_current = Column(Boolean, default=False, nullable=False)  # only one row True at a time

    def __repr__(self):
        return f"<SystemVersion v{self.version} current={self.is_current}>"


class DeploymentAuditLog(Base):
    """
    Immutable audit log — one row per deployment-related action.
    Records: release, maintenance toggle, lock acquire/release.

    Example row:
        action      = "release"
        version     = "1.2.3"
        actor       = "admin@bknr.in"
        git_commit  = "9c8ab32"
        result      = "success"
        detail      = "Deploy confirmed via /api/version"
    """
    __tablename__ = "deployment_audit_log"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    timestamp  = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    action     = Column(String(50),  nullable=False)   # "release" | "maintenance_on" | "maintenance_off" | "lock_acquire" | "lock_release"
    version    = Column(String(20),  nullable=True)    # "1.2.3"
    actor      = Column(String(200), nullable=True)    # email
    git_commit = Column(String(40),  nullable=True)    # short SHA
    result     = Column(String(20),  nullable=True)    # "success" | "failure" | "rollback"
    detail     = Column(Text,        nullable=True)    # free-text notes

    def __repr__(self):
        return f"<AuditLog [{self.action}] v{self.version} by {self.actor} → {self.result}>"
