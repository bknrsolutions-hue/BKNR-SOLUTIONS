# ==========================================
# 📌 FILE: app/database/models/attendance.py
# ==========================================

from sqlalchemy import Column, Integer, String, Date, Time, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Attendance(Base):
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"))   # link to employee table

    punch_date = Column(Date, index=True)
    punch_time = Column(DateTime)
    punch_type = Column(String(10))        # IN / OUT
    method = Column(String(20))            # FACE / MANUAL

    # relationship to Employee table
    employee = relationship("Employee", back_populates="attendance_logs")


# 🔥 Link back to Employee model
from app.database.models.employee_registration import Employee
Employee.attendance_logs = relationship("Attendance", back_populates="employee")
