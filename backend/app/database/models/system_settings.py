"""
System Settings Model — BKNR ERP
Key-value store for system-wide settings like maintenance_mode.
"""
from sqlalchemy import Column, String, Boolean, DateTime, Text
from sqlalchemy.sql import func
from app.database import Base


class SystemSetting(Base):
    """
    Key-value table for system-wide settings.
    Examples:
        maintenance_mode  = "true" / "false"
        maintenance_msg   = "Scheduled upgrade in progress..."
    """
    __tablename__ = "system_settings"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=False, default="")
    updated_by = Column(String(200), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    def __repr__(self):
        return f"<SystemSetting {self.key}={self.value}>"
