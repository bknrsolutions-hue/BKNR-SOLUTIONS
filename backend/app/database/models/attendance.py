from sqlalchemy import Column, Integer, String, Float, Date, DateTime, Time, Text, ForeignKey, Boolean, UniqueConstraint
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
    approved_duty_credit = Column(Float, default=0.0)     # 1.0 / 1.5 / 2.0 / 2.5 / 3.0 approved payable duty
    ot_status = Column(String(20), default="PENDING")     # PENDING, APPROVED, REJECTED
    ot_approved_by = Column(String(100), nullable=True)
    duty_status = Column(String(20), default="PENDING")
    duty_approved_by = Column(String(100))  # Approve chesina manager email

    duty_date = Column(Date)
    first_in = Column(DateTime)
    exit_time = Column(DateTime, nullable=True)
    working_hours = Column(Float, default=0.0)
    salary_adjustment = Column(Float, default=0.0)
    salary_adjustment_reason = Column(Text, nullable=True)
    journal_id = Column(Integer, nullable=True)
    movements = Column(JSONB, default=list)
    status = Column(String(20), default="OPEN")
    created_at = Column(DateTime, default=datetime.utcnow)


class ContractLabour(Base, metacolumns):
    __tablename__ = "contract_labour"
    __table_args__ = (
        UniqueConstraint("company_id", "labour_id", name="uq_company_contract_labour_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    labour_id = Column(String(50), nullable=False, index=True)
    labour_name = Column(String(120), nullable=False)
    contractor_name = Column(String(150), nullable=True)
    mobile = Column(String(20), nullable=True)
    aadhar_number = Column(String(20), nullable=True)
    gender = Column(String(20), nullable=True)
    joining_date = Column(Date, nullable=False)
    department = Column(String(150), nullable=True)
    production_at = Column(String(255), nullable=True, index=True)
    remarks = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="ACTIVE")
    created_at = Column(DateTime, default=datetime.utcnow)


class ContractLabourAttendance(Base, metacolumns):
    __tablename__ = "contract_labour_attendance"
    __table_args__ = (
        UniqueConstraint(
            "company_id", "labour_id", "attendance_date",
            name="uq_company_contract_labour_attendance_day"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    labour_id = Column(String(50), nullable=False, index=True)
    labour_name = Column(String(120), nullable=False)
    contractor_name = Column(String(150), nullable=True)
    production_at = Column(String(255), nullable=True, index=True)
    attendance_date = Column(Date, nullable=False, index=True)
    in_time = Column(DateTime, nullable=False)
    out_time = Column(DateTime, nullable=True)
    status = Column(String(20), nullable=False, default="INSIDE")
    created_at = Column(DateTime, default=datetime.utcnow)


class DailyTemporaryWorker(Base, metacolumns):
    __tablename__ = "daily_temporary_workers"

    id = Column(Integer, primary_key=True, index=True)
    worker_name = Column(String(120), nullable=False)
    worker_type = Column(String(30), nullable=False, default="DAILY LABOUR")
    purpose = Column(String(255), nullable=False)
    work_date = Column(Date, nullable=False)
    in_time = Column(Time, nullable=False)
    out_time = Column(Time, nullable=True)
    amount = Column(Float, nullable=False, default=0.0)
    day_charge = Column(Float, nullable=False, default=0.0)
    day_charge_locked = Column(Boolean, nullable=False, default=False)
    approved_by_name = Column(String(120), nullable=True)
    approved_by_email = Column(String(255), nullable=True, index=True)
    approval_status = Column(String(20), nullable=False, default="PENDING")
    approval_note = Column(Text, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    production_at = Column(String(255), nullable=True, index=True)
    remarks = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="ACTIVE")
    created_at = Column(DateTime, default=datetime.utcnow)


class VisitorEntry(Base, metacolumns):
    __tablename__ = "visitor_entries"

    id = Column(Integer, primary_key=True, index=True)
    visitor_name = Column(String(120), nullable=False)
    mobile = Column(String(20), nullable=True)
    organization = Column(String(150), nullable=True)
    purpose = Column(String(255), nullable=False)
    person_to_meet = Column(String(120), nullable=True)
    person_to_meet_email = Column(String(255), nullable=True, index=True)
    approval_status = Column(String(20), nullable=False, default="PENDING")
    approval_note = Column(Text, nullable=True)
    approved_by = Column(String(255), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    visit_date = Column(Date, nullable=False, index=True)
    in_time = Column(Time, nullable=False)
    out_time = Column(Time, nullable=True)
    production_at = Column(String(255), nullable=True, index=True)
    remarks = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="INSIDE")
    created_at = Column(DateTime, default=datetime.utcnow)


class EntryApprovalRequest(Base):
    __tablename__ = "entry_approval_requests"
    __table_args__ = (
        UniqueConstraint("company_id", "entry_type", "entry_id", name="uq_entry_approval_request"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), nullable=False, index=True)
    entry_type = Column(String(30), nullable=False, index=True)
    entry_id = Column(Integer, nullable=False, index=True)
    title = Column(String(180), nullable=False)
    message = Column(Text, nullable=False)
    requested_by = Column(String(255), nullable=False)
    assigned_to_name = Column(String(120), nullable=False)
    assigned_to_email = Column(String(255), nullable=False, index=True)
    status = Column(String(20), nullable=False, default="PENDING", index=True)
    decision_note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    decided_at = Column(DateTime, nullable=True)


class KgBasisCompanyLabour(Base, metacolumns):
    __tablename__ = "kg_basis_company_labour"

    id = Column(Integer, primary_key=True, index=True)
    labour_name = Column(String(120), nullable=False)
    work_date = Column(Date, nullable=False)
    production_at = Column(String(255), nullable=True, index=True)
    species = Column(String(255), nullable=True)
    variety_name = Column(String(255), nullable=False)
    work_type = Column(String(100), nullable=False)
    count_grade = Column(String(50), nullable=True)
    quantity_kg = Column(Float, nullable=False, default=0.0)
    rate_per_kg = Column(Float, nullable=False, default=0.0)
    amount = Column(Float, nullable=False, default=0.0)
    in_time = Column(Time, nullable=True)
    out_time = Column(Time, nullable=True)
    remarks = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="ACTIVE")
    created_at = Column(DateTime, default=datetime.utcnow)


class KgBasisWorker(Base, metacolumns):
    __tablename__ = "kg_basis_workers"
    __table_args__ = (
        UniqueConstraint("company_id", "worker_id", name="uq_company_kg_basis_worker_id"),
    )

    id = Column(Integer, primary_key=True, index=True)
    worker_id = Column(String(50), nullable=False, index=True)
    worker_name = Column(String(120), nullable=False)
    department = Column(String(150), nullable=True)
    mobile = Column(String(20), nullable=True)
    aadhar_number = Column(String(20), nullable=True)
    gender = Column(String(20), nullable=True)
    joining_date = Column(Date, nullable=False)
    production_at = Column(String(255), nullable=True, index=True)
    remarks = Column(Text, nullable=True)
    status = Column(String(20), nullable=False, default="ACTIVE")
    created_at = Column(DateTime, default=datetime.utcnow)


class KgBasisWorkerAttendance(Base, metacolumns):
    __tablename__ = "kg_basis_worker_attendance"
    __table_args__ = (
        UniqueConstraint(
            "company_id", "worker_id", "attendance_date",
            name="uq_company_kg_worker_attendance_day"
        ),
    )

    id = Column(Integer, primary_key=True, index=True)
    worker_id = Column(String(50), nullable=False, index=True)
    worker_name = Column(String(120), nullable=False)
    production_at = Column(String(255), nullable=True, index=True)
    attendance_date = Column(Date, nullable=False, index=True)
    in_time = Column(DateTime, nullable=False)
    out_time = Column(DateTime, nullable=True)
    status = Column(String(20), nullable=False, default="INSIDE")
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
    eps_applicable = Column(Boolean, default=True)
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


class EmployeeSalaryAdvanceRecovery(Base):
    __tablename__ = "employee_salary_advance_recovery"
    __table_args__ = (
        UniqueConstraint("company_id", "advance_id", "month_year", name="uq_advance_recovery_month"),
    )

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(String(50), nullable=False, index=True)
    employee_id = Column(String(50), nullable=False, index=True)
    advance_id = Column(Integer, nullable=False, index=True)
    salary_processing_id = Column(Integer, nullable=True, index=True)
    month_year = Column(String(7), nullable=False, index=True)
    amount = Column(Float, default=0.0, nullable=False)
    status = Column(String(20), default="ACTIVE", nullable=False)
    recovered_at = Column(DateTime, default=datetime.utcnow)
    reversed_at = Column(DateTime, nullable=True)


from sqlalchemy import Column, Integer, String, Time, Boolean, Date
#      (: from app.database import Base)

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

    # 🟢 🔴  UNIQUE CONSTRAINT
    __table_args__ = (
        UniqueConstraint('company_id', 'production_at', 'shift_name', name='uq_company_plant_shift'),
    )
