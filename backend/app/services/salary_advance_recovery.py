from datetime import datetime

from sqlalchemy.orm import Session

from app.database.models.attendance import EmployeeSalaryAdvance, EmployeeSalaryAdvanceRecovery


def _eligible_advances(db: Session, company_id: str, employee_id: str, month_year: str, lock: bool = False):
    query = db.query(EmployeeSalaryAdvance).filter(
        EmployeeSalaryAdvance.company_id == company_id,
        EmployeeSalaryAdvance.employee_id == employee_id,
        EmployeeSalaryAdvance.status == "APPROVED",
        EmployeeSalaryAdvance.deduct_from <= month_year,
    ).order_by(EmployeeSalaryAdvance.deduct_from, EmployeeSalaryAdvance.id)
    return query.with_for_update().all() if lock else query.all()


def preview_monthly_advance_recovery(
    db: Session,
    company_id: str,
    employee_id: str,
    month_year: str,
) -> tuple[float, list[tuple[EmployeeSalaryAdvance, float]]]:
    advances = _eligible_advances(db, company_id, employee_id, month_year)
    active_recoveries = {
        row.advance_id: float(row.amount or 0.0)
        for row in db.query(EmployeeSalaryAdvanceRecovery).filter(
            EmployeeSalaryAdvanceRecovery.company_id == company_id,
            EmployeeSalaryAdvanceRecovery.employee_id == employee_id,
            EmployeeSalaryAdvanceRecovery.month_year == month_year,
            EmployeeSalaryAdvanceRecovery.status == "ACTIVE",
        ).all()
    }
    allocations = []
    for advance in advances:
        restored_balance = float(advance.remaining_balance or 0.0) + active_recoveries.get(advance.id, 0.0)
        if restored_balance <= 0:
            continue
        amount = round(min(float(advance.monthly_deduction or 0.0), restored_balance), 2)
        if amount > 0:
            allocations.append((advance, amount))
    return round(sum(amount for _, amount in allocations), 2), allocations


def sync_monthly_advance_recovery(
    db: Session,
    company_id: str,
    employee_id: str,
    month_year: str,
    salary_processing_id: int,
    should_recover: bool,
) -> float:
    advances = _eligible_advances(db, company_id, employee_id, month_year, lock=True)
    recoveries = {
        row.advance_id: row
        for row in db.query(EmployeeSalaryAdvanceRecovery).filter(
            EmployeeSalaryAdvanceRecovery.company_id == company_id,
            EmployeeSalaryAdvanceRecovery.employee_id == employee_id,
            EmployeeSalaryAdvanceRecovery.month_year == month_year,
        ).with_for_update().all()
    }

    total = 0.0
    for advance in advances:
        recovery = recoveries.get(advance.id)
        existing_amount = float(recovery.amount or 0.0) if recovery and recovery.status == "ACTIVE" else 0.0
        restored_balance = float(advance.remaining_balance or 0.0) + existing_amount
        target_amount = round(min(float(advance.monthly_deduction or 0.0), restored_balance), 2) if should_recover else 0.0
        delta = round(target_amount - existing_amount, 2)

        if abs(delta) > 0.001:
            advance.paid_amount = round(float(advance.paid_amount or 0.0) + delta, 2)
            advance.remaining_balance = round(max(0.0, float(advance.advance_amount or 0.0) - advance.paid_amount), 2)

        if target_amount > 0:
            if not recovery:
                recovery = EmployeeSalaryAdvanceRecovery(
                    company_id=company_id,
                    employee_id=employee_id,
                    advance_id=advance.id,
                    month_year=month_year,
                )
                db.add(recovery)
            recovery.salary_processing_id = salary_processing_id
            recovery.amount = target_amount
            recovery.status = "ACTIVE"
            recovery.recovered_at = datetime.utcnow()
            recovery.reversed_at = None
            total += target_amount
        elif recovery and recovery.status == "ACTIVE":
            recovery.status = "REVERSED"
            recovery.reversed_at = datetime.utcnow()

    return round(total, 2)
