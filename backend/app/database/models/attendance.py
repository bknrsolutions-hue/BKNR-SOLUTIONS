from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Time, Text, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from datetime import datetime
from app.database import Base
from app.database.models.criteria import metacolumns

class EmployeeRegistration(Base, metacolumns):
    __tablename__ = "employee_registration"
    id = Column(Integer, primary_key=True, index=True)
    
    # 🌐 GLOBAL FILTER
    production_at = Column(String(255), index=True, nullable=True) # Plant Location
    
    employee_id = Column(String(50), unique=True, index=True, nullable=False)
    employee_name = Column(String(100), nullable=False)
    designation = Column(String(100))
    department = Column(String(100))
    employee_type = Column(String(30))
    contractor_name = Column(String(100), nullable=True)
    joining_date = Column(Date)
    resignation_date = Column(Date, nullable=True)
    
    current_salary = Column(Float, default=0)
    basic_salary = Column(Float, default=0)         
    hra = Column(Float, default=0)                  
    conveyance_allowance = Column(Float, default=0) 
    other_expenses = Column(Float, default=0)       
    tds = Column(Float, default=0)                  
    
    bank_name = Column(String(100))
    account_number = Column(String(50))
    ifsc_code = Column(String(20))
    branch_name = Column(String(100))
    account_holder_name = Column(String(100))
    pan_number = Column(String(20))
    aadhar_number = Column(String(20))
    uan_number = Column(String(50))                 
    
    mobile = Column(String(15))
    email = Column(String(100)) 
    status = Column(String(20), default="ACTIVE")
    company_id = Column(String(50), index=True) 
    
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
    about = Column(Text)
    skills = Column(Text)
    present_address = Column(Text)
    permanent_address = Column(Text)
    reporting_to = Column(String(100))
    location = Column(String(100))
    photo_path = Column(String(255))

class DailyAttendance(Base, metacolumns):
    __tablename__ = "daily_attendance"
    id = Column(Integer, primary_key=True, index=True)
    production_at = Column(String(255), index=True, nullable=True)
    
    employee_id = Column(String(50), ForeignKey("employee_registration.employee_id"), nullable=False, index=True)
    employee_name = Column(String(100))
    designation = Column(String(100))
    employee_type = Column(String(30))
    
    # 🟢 🔴 OT APPROVAL ENGINE FIELDS
    shift_name = Column(String(100), nullable=True, default="GENERAL") 
    duty_type = Column(String(20), nullable=True)          # HALF, SINGLE, DOUBLE
    calculated_ot_hours = Column(Float, default=0.0)      # System calculate chesina hours
    approved_ot_hours = Column(Float, default=0.0)        # Manager approve cheshaka save ayye hours
    ot_status = Column(String(20), default="PENDING")     # PENDING, APPROVED, REJECTED
    ot_approved_by = Column(String(100), nullable=True) 
    duty_status = Column(String(20), default="PENDING")
    duty_approved_by = Column(String(100))  # Approve chesina manager email
    
    duty_date = Column(Date)
    first_in = Column(DateTime)
    exit_time = Column(DateTime, nullable=True)
    working_hours = Column(Float, default=0.0)
    salary_adjustment = Column(Float, default=0.0)
    movements = Column(JSONB, default=list) 
    status = Column(String(20), default="OPEN") 
    created_at = Column(DateTime, default=datetime.utcnow)

class EmployeeIncrement(Base, metacolumns):
    __tablename__ = "employee_increment"
    id = Column(Integer, primary_key=True, index=True)
    production_at = Column(String(255), index=True, nullable=True)
    employee_id = Column(String(50), ForeignKey("employee_registration.employee_id"))
    old_salary = Column(Float)
    increment_type = Column(String(20))
    increment_value = Column(Float)
    new_salary = Column(Float)
    effective_from = Column(Date)
    reason = Column(String(255))
    approved_by = Column(String(100))
    status = Column(String(20), default="ACTIVE")

class EmployeeStatutoryMaster(Base, metacolumns):
    __tablename__ = "employee_statutory_master"
    id = Column(Integer, primary_key=True, index=True)
    production_at = Column(String(255), index=True, nullable=True)
    employee_id = Column(String(50), ForeignKey("employee_registration.employee_id"), nullable=False, index=True)
    employee_name = Column(String(100))
    department = Column(String(100))
    company_id = Column(String(50), index=True)
    applicable_from = Column(Date, nullable=False)
    applicable_to = Column(Date, nullable=True)
    pf_applicable = Column(Boolean, default=True)
    uan_number = Column(String(50))
    pf_employee_percent = Column(Float, default=12.0)
    pf_employer_percent = Column(Float, default=12.0)
    pf_wage_limit = Column(Float, default=15000)
    esi_applicable = Column(Boolean, default=False)
    esi_number = Column(String(50))
    esi_employee_percent = Column(Float, default=0.75)
    esi_employer_percent = Column(Float, default=3.25)
    esi_wage_limit = Column(Float, default=21000)
    pt_applicable = Column(Boolean, default=False)
    pt_amount = Column(Float, default=0)
    lwf_applicable = Column(Boolean, default=False)
    lwf_employee_amount = Column(Float, default=0)
    lwf_employer_amount = Column(Float, default=0)
    status = Column(String(20), default="ACTIVE")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

class EmployeeSalaryAdvance(Base):
    __tablename__ = "employee_salary_advance"
    id = Column(Integer, primary_key=True, index=True)
    production_at = Column(String(255), index=True, nullable=True)
    employee_id = Column(String(50), ForeignKey("employee_registration.employee_id"), nullable=False, index=True)
    employee_name = Column(String(100))
    department = Column(String(100))
    company_id = Column(String(50), index=True)
    advance_date = Column(Date, nullable=False)
    advance_amount = Column(Float, nullable=False)
    deduction_mode = Column(String(20))
    monthly_deduction = Column(Float, default=0)
    paid_amount = Column(Float, default=0)
    remaining_balance = Column(Float, default=0)
    deduct_from = Column(String(7))
    deduct_to = Column(String(7))
    reason = Column(Text)
    status = Column(String(20), default="APPROVED")
    approved_by = Column(String(100))
    approved_date = Column(Date)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, onupdate=datetime.utcnow)

from sqlalchemy import Column, Integer, String, Time, Boolean, Date, UniqueConstraint
# మీ బేస్ ఇంపోర్ట్ ఇక్కడ ఉంచుకోండి (ఉదా: from app.database import Base)

class Shift(Base):
    __tablename__ = "shifts"
    
    id = Column(Integer, primary_key=True, index=True)
    production_at = Column(String(255), index=True, nullable=True)
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

    # 🟢 🔴 కొత్త UNIQUE CONSTRAINT ఇక్కడే యాడ్ చేశాను
    __table_args__ = (
        UniqueConstraint('company_id', 'production_at', 'shift_name', name='uq_company_plant_shift'),
    )