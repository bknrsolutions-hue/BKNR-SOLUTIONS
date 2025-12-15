from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime

from app.database import Base


# ===========================================================
# EMPLOYEE ROLES (Dropdown + Add New Role)
# ===========================================================
class EmployeeRole(Base):
    __tablename__ = "employee_roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)   # No duplicates

    created_at = Column(DateTime, default=datetime.utcnow)


# ===========================================================
# EMPLOYEE REGISTRATION
# ===========================================================
class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    
    employee_id = Column(String(20), unique=True, nullable=False)  # BKNXXXXXX
    name        = Column(String(120))
    gender      = Column(String(20))
    mobile      = Column(String(15), unique=True)                 # Prevent duplicate
    role        = Column(String(120))                              # selected / new role name

    emp_type    = Column(String(20))                               # company / contract
    contractor  = Column(String(120), nullable=True)

    face_img1   = Column(Text)     # Stored base64 image
    face_img2   = Column(Text)

    company_id  = Column(Integer, nullable=True)   # Company wise saving

    created_at  = Column(DateTime, default=datetime.utcnow)
