import math
from datetime import date

from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.database.models.attendance import EmployeeStatutoryMaster


def nearest_rupee(value: float) -> float:
    return float(math.floor(max(0.0, float(value or 0.0)) + 0.5))


def next_higher_rupee(value: float) -> float:
    amount = max(0.0, float(value or 0.0))
    return float(math.ceil(amount - 1e-9))


def effective_statutory_record(
    db: Session,
    company_id: str,
    employee_id: str,
    effective_date: date,
):
    return (
        db.query(EmployeeStatutoryMaster)
        .filter(
            EmployeeStatutoryMaster.company_id == company_id,
            EmployeeStatutoryMaster.employee_id == employee_id,
            EmployeeStatutoryMaster.status == "ACTIVE",
            EmployeeStatutoryMaster.applicable_from <= effective_date,
        )
        .filter(
            (EmployeeStatutoryMaster.applicable_to == None) |
            (EmployeeStatutoryMaster.applicable_to >= effective_date)
        )
        .order_by(desc(EmployeeStatutoryMaster.applicable_from), desc(EmployeeStatutoryMaster.id))
        .first()
    )


def calculate_pf_esi(
    statutory,
    *,
    monthly_pf_wages: float,
    earned_pf_wages: float,
    monthly_esi_wages: float,
    earned_esi_wages: float,
    employee_dob: date | None = None,
    effective_date: date | None = None,
) -> dict:
    result = {
        "pf_employee": 0.0,
        "pf_employer": 0.0,
        "epf_employer": 0.0,
        "eps_employer": 0.0,
        "edli_employer": 0.0,
        "esi_employee": 0.0,
        "esi_employer": 0.0,
        "pf_wages": 0.0,
        "esi_wages": 0.0,
        "esi_employee_exempt": False,
    }
    if not statutory:
        return result

    if statutory.pf_applicable:
        pf_limit = float(statutory.pf_wage_limit or 15000.0)
        pf_wages = min(max(0.0, float(earned_pf_wages or 0.0)), pf_limit)
        result["pf_wages"] = round(pf_wages, 2)
        result["pf_employee"] = nearest_rupee(
            pf_wages * float(statutory.pf_employee_percent or 0.0) / 100.0
        )
        result["pf_employer"] = nearest_rupee(
            pf_wages * float(statutory.pf_employer_percent or 0.0) / 100.0
        )
        eps_setting = getattr(statutory, "eps_applicable", True)
        eps_applicable = True if eps_setting is None else bool(eps_setting)
        if employee_dob and effective_date:
            try:
                eps_stop_date = employee_dob.replace(year=employee_dob.year + 58)
            except ValueError:
                eps_stop_date = employee_dob.replace(year=employee_dob.year + 58, day=28)
            if effective_date >= eps_stop_date:
                eps_applicable = False
        result["eps_employer"] = min(
            result["pf_employer"],
            nearest_rupee(min(pf_wages, 15000.0) * 8.33 / 100.0),
        ) if eps_applicable else 0.0
        result["epf_employer"] = max(
            0.0,
            result["pf_employer"] - result["eps_employer"],
        )
        result["edli_employer"] = nearest_rupee(
            min(pf_wages, 15000.0) * 0.5 / 100.0
        )

    if statutory.esi_applicable:
        esi_wages = max(0.0, float(earned_esi_wages or 0.0))
        full_month_daily_wage = max(0.0, float(monthly_esi_wages or 0.0)) / 26.0
        employee_exempt = full_month_daily_wage <= 176.0
        result["esi_wages"] = round(esi_wages, 2)
        result["esi_employee_exempt"] = employee_exempt
        result["esi_employee"] = 0.0 if employee_exempt else next_higher_rupee(
            esi_wages * float(statutory.esi_employee_percent or 0.0) / 100.0
        )
        result["esi_employer"] = next_higher_rupee(
            esi_wages * float(statutory.esi_employer_percent or 0.0) / 100.0
        )

    return result
