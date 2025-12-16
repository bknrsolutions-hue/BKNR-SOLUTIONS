from sqlalchemy.orm import relationship
from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, DateTime, JSON
from datetime import datetime
from app.database import Base


# =================== COMPANY MODEL ===================
class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)

    company_name = Column(String, nullable=False)
    address = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)

    # Example: BKNR9837
    company_code = Column(String, unique=True, nullable=False)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    users = relationship("User", back_populates="company")


# =================== USER MODEL ===================
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)

    name = Column(String, nullable=False)
    designation = Column(String, nullable=False)

    email = Column(String, nullable=False)      # ❌ removed unique
    mobile = Column(String, unique=True, nullable=False)

    password = Column(String, nullable=True)
    role = Column(String, default="admin")
    permissions = Column(String, nullable=True)

    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    company = relationship("Company", back_populates="users")


# =================== OTP MODEL ===================
class OTPTable(Base):
    __tablename__ = "otp_table"

    id = Column(Integer, primary_key=True, index=True)

    email = Column(String, unique=True, nullable=False)
    otp = Column(String, nullable=False)

    extra = Column(JSON, nullable=True)   # ✅ FIXED
    is_used = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
