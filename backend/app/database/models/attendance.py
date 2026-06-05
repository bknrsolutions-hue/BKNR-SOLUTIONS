from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Time, Text, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
from app.database import Base
from sqlalchemy import Boolean

from app.database.models.criteria import metacolumns

# =========================================================
# 1️⃣ EMPLOYEE REGISTRATION (MASTER)
# =========================================================
class EmployeeRegistration(Base, metacolumns):
    __tablename__ = "employee_registration"

    id = Column(Integer, primary_key=True, index=True)
    
    # Primary Details
    employee_id = Column(String(50), unique=True, index=True, nullable=False)
    employee_name = Column(String(100), nullable=False)
    designation = Column(String(100))
    department = Column(String(100))
    
    # Work Info
    employee_type = Column(String(30))
    contractor_name = Column(String(100), nullable=True)
    joining_date = Column(Date)
    resignation_date = Column(Date, nullable=True)
    
    # 💰 SALARY DETAILS (Sync with HTML)
    current_salary = Column(Float, default=0)       # Gross Total
    basic_salary = Column(Float, default=0)         
    hra = Column(Float, default=0)                  
    conveyance_allowance = Column(Float, default=0) 
    other_expenses = Column(Float, default=0)       
    tds = Column(Float, default=0)                  
    
    # 🏦 BANK & STATUTORY
    bank_name = Column(String(100))
    account_number = Column(String(50))
    ifsc_code = Column(String(20))
    branch_name = Column(String(100))
    account_holder_name = Column(String(100))
    pan_number = Column(String(20))
    aadhar_number = Column(String(20))
    uan_number = Column(String(50))                 # Added
    
    # Contact & Status
    mobile = Column(String(15))
    email = Column(String(100)) 
    status = Column(String(20), default="ACTIVE")
    company_id = Column(String(50), index=True) 
    
    # Extra Fields & Personal Info
    created_at = Column(DateTime, default=datetime.utcnow)
    date = Column(Date) 
    time = Column(Time) 
    gender = Column(String(20))
    personal_email = Column(String(100))
    dob = Column(Date)
    blood_group = Column(String(10))
    marital_status = Column(String(20))
    emergency_name = Column(String(100))
    emergency_mobile = Column(String(15))
    official_email = Column(String(100))
    
    # Text Fields
    about = Column(Text)
    skills = Column(Text)
    present_address = Column(Text)
    permanent_address = Column(Text)
    
    # Reporting & Photo
    reporting_to = Column(String(100))
    location = Column(String(100))
    photo_path = Column(String(255))

# =========================================================
# 2️⃣ DAILY ATTENDANCE (With Salary Adjustment)
# =========================================================
class DailyAttendance(Base, metacolumns):
    __tablename__ = "daily_attendance"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(String(50), ForeignKey("employee_registration.employee_id"), nullable=False, index=True)
    employee_name = Column(String(100))
    designation = Column(String(100))
    employee_type = Column(String(30))
    duty_date = Column(Date)
    first_in = Column(DateTime)
    exit_time = Column(DateTime, nullable=True)
    working_hours = Column(Float, default=0)
    
    # 🔥 Salary Adjustment (Error fix kosam ikkada add chesa)
    salary_adjustment = Column(Float, default=0.0)
    
    movements = Column(JSONB, default=list) 
    status = Column(String(20), default="OPEN") 
    created_at = Column(DateTime, default=datetime.utcnow)
    # 2️⃣ EMPLOYEE SALARY INCREMENT
# =========================================================
class EmployeeIncrement(Base, metacolumns):
    __tablename__ = "employee_increment"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(String(50), ForeignKey("employee_registration.employee_id"))
    old_salary = Column(Float)
    increment_type = Column(String(20))
    increment_value = Column(Float)
    new_salary = Column(Float)
    effective_from = Column(Date)
    reason = Column(String(255))
    approved_by = Column(String(100))
    status = Column(String(20), default="ACTIVE")


# =========================================================
# 4️⃣ EMPLOYEE STATUTORY MASTER (PF / ESI / PT / LWF)
# =========================================================
class EmployeeStatutoryMaster(Base, metacolumns):
    __tablename__ = "employee_statutory_master"

    id = Column(Integer, primary_key=True, index=True)

    # 🔗 EMPLOYEE LINK
    employee_id = Column(
        String(50),
        ForeignKey("employee_registration.employee_id"),
        nullable=False,
        index=True
    )

    employee_name = Column(String(100))
    department = Column(String(100))
    company_id = Column(String(50), index=True)

    # 📅 EFFECTIVE PERIOD
    applicable_from = Column(Date, nullable=False)   # Month Start (YYYY-MM-01)
    applicable_to = Column(Date, nullable=True)      # Optional (auto-close previous)

    # ================= PF =================
    pf_applicable = Column(Boolean, default=True)
    uan_number = Column(String(50))
    pf_employee_percent = Column(Float, default=12.0)
    pf_employer_percent = Column(Float, default=12.0)
    pf_wage_limit = Column(Float, default=15000)

    # ================= ESI =================
    esi_applicable = Column(Boolean, default=False)
    esi_number = Column(String(50))
    esi_employee_percent = Column(Float, default=0.75)
    esi_employer_percent = Column(Float, default=3.25)
    esi_wage_limit = Column(Float, default=21000)

    # ================= PROFESSIONAL TAX =================
    pt_applicable = Column(Boolean, default=False)
    pt_amount = Column(Float, default=0)

    # ================= LABOUR WELFARE FUND =================
    lwf_applicable = Column(Boolean, default=False)
    lwf_employee_amount = Column(Float, default=0)
    lwf_employer_amount = Column(Float, default=0)

    # ================= STATUS =================
    status = Column(String(20), default="ACTIVE")  # ACTIVE / INACTIVE

    # 🕒 AUDIT
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

# =========================================================
# EMPLOYEE SALARY ADVANCE (OFFLINE APPROVED)
# =========================================================
class EmployeeSalaryAdvance(Base):
    __tablename__ = "employee_salary_advance"

    id = Column(Integer, primary_key=True, index=True)

    # EMPLOYEE
    employee_id = Column(
        String(50),
        ForeignKey("employee_registration.employee_id"),
        nullable=False,
        index=True
    )
    employee_name = Column(String(100))
    department = Column(String(100))
    company_id = Column(String(50), index=True)

    # ADVANCE
    advance_date = Column(Date, nullable=False)
    advance_amount = Column(Float, nullable=False)

    # DEDUCTION
    deduction_mode = Column(String(20))   # MONTHLY
    monthly_deduction = Column(Float, default=0)

    paid_amount = Column(Float, default=0)
    remaining_balance = Column(Float, default=0)

    deduct_from = Column(String(7))        # YYYY-MM
    deduct_to = Column(String(7))          # YYYY-MM

    # REASON
    reason = Column(Text)

    # APPROVAL
    status = Column(String(20), default="APPROVED")
    approved_by = Column(String(100))
    approved_date = Column(Date)

    # AUDIT
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

class Shift(Base):
    __tablename__ = "shifts"

    id = Column(Integer, primary_key=True, index=True)

    company_id = Column(String, nullable=False, index=True)
    company_name = Column(String(255), nullable=False)

    shift_name = Column(String(100), nullable=False, index=True)

    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)

    break_minutes = Column(Integer, default=0)

    is_night_shift = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)

    date = Column(Date)
    time = Column(Time)

    email = Column(String(255))