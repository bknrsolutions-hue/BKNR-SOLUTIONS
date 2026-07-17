from sqlalchemy.orm import relationship, deferred
from sqlalchemy import Column, Integer, String, ForeignKey, Boolean, Date, DateTime, Text
from datetime import datetime
from zoneinfo import ZoneInfo
from app.database import Base


def ist_now_naive():
    return datetime.now(ZoneInfo("Asia/Kolkata")).replace(tzinfo=None)


# =================== COMPANY MODEL ===================
class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)

    company_name = Column(String, nullable=False)
    address = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)

    # Example: BKNR9837
    company_code = Column(String, unique=True, nullable=False)
    # External seafood-export registration shown on reports and documents.
    # Tenant isolation continues to use company_code.
    mpeda_registration_code = deferred(
        Column(String(80), unique=True, nullable=True, index=True)
    )

    # 🔥 NEW FIELDS (SAFE ADD - NO BREAK)
    company_type = Column(String, default="main")  # main / merchant
    parent_company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=ist_now_naive)

    # relationships
    users = relationship("User", back_populates="company")
    # NEW
    setup_completed = Column(Boolean, default=False)


    # self reference (optional use)
    sub_companies = relationship("Company")


# =================== USER MODEL (UPDATED) ===================
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)

    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)

    name = Column(String, nullable=False)
    designation = Column(String, nullable=False)

    email = Column(String, nullable=False)  # keeping as is (no break)
    mobile = Column(String, unique=True, nullable=False)

    password = Column(String, nullable=True)
    role = Column(String, default="admin")
    permissions = Column(String, nullable=True)
    working_for = Column(String(255), index=True)
    working_at = Column(String(255), index=True)
    date_of_birth = deferred(Column(Date, nullable=True))
    blood_group = deferred(Column(String(10), nullable=True))
    working_location = deferred(Column(String(255), nullable=True))
    unit = deferred(Column(String(255), nullable=True))
    address = deferred(Column(Text, nullable=True))

    is_verified = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True, server_default="true")
    data_management_access = Column(Boolean, default=False, server_default="false")
    created_at = Column(DateTime, default=ist_now_naive)

    # 🌟 NEW MULTI-TENANT SEGMENTATION TEXT COLUMNS (FOR JSON STORAGE)
    allowed_units = Column(Text, nullable=True)     # Stores JSON array of unit strings
    allowed_companies = Column(Text, nullable=True) # Stores JSON array of company strings
    ui_colors = Column(Text, nullable=True)         # Stores JSON of user color preferences
    current_session_id = Column(String, nullable=True) # Unique ID of current active login session

    # relationships
    company = relationship("Company", back_populates="users")


# =================== OTP MODEL ===================
class OTPTable(Base):
    __tablename__ = "otp_table"

    id = Column(Integer, primary_key=True)

    email = Column(String, unique=True)
    otp = Column(String)

    extra = Column(String)  # ✅ required field
    is_used = Column(Boolean, default=False)

    created_at = Column(DateTime, default=ist_now_naive)


# =================== NEW: USER LOGIN ACTIVITY MODEL ===================
class UserLoginActivity(Base):
    __tablename__ = "user_login_activities"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    
    login_at = Column(DateTime, default=ist_now_naive)
    logout_at = Column(DateTime, nullable=True)
    
    # Session computation helper text column (e.g., "4.5 Hrs" or "Active Now")
    session_hours = Column(String, default="Active Now")
    
