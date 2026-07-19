"""Monthly production-cost automation.

This module deliberately does not update inventory valuation.  It only reads
posted operational records and produces an auditable monthly allocation
preview.  Inventory costing can consume the approved result in a later step.
"""

from __future__ import annotations

from calendar import monthrange
from collections import defaultdict
from datetime import date, timedelta
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database.models.bills import DieselLog, ElectricityLog, OtherExpense
from app.database.models.criteria import production_at
from app.database.models.enterprise_finance import SalaryProcessing
from app.database.models.general_stock import GeneralStock
from app.database.models.inventory_management import stock_entry


CHEMICAL_WORDS = ("CHEMICAL", "CHEM", "SALT", "STPP", "SODA", "POWDER", "DRY", "WET")
PACKING_WORDS = (
    "CARTON", "BOX", "PACKING", "PACKAGING", "POLY", "POUCH", "BAG",
    "LINER", "TRAY", "LABEL", "STICKER", "TAPE",
)
COMMON_PO_VALUES = {"", "N/A", "NA", "-", "NONE", "NULL"}
TEMPORARY_CARTON_COST_PER_KG = 5.0
NON_PRODUCTION_EXPENSE_WORDS = (
    "FREIGHT", "LOGISTICS", "CONTAINER", "EXPORT", "SALES", "MARKETING",
    "FINANCE", "INTEREST", "TAX", "PENALTY",
)
DUPLICATE_POOL_WORDS = (
    "SALARY", "PAYROLL", "WAGES", "ELECTRIC", "POWER", "DIESEL",
    "CARTON", "PACKING", "PACKAGING", "CHEMICAL", "SALT", "STPP",
)


def normalize_po(value: Any) -> str:
    clean = str(value or "").strip().upper()
    return "COMMON" if clean in COMMON_PO_VALUES else clean


def is_ns_variety(value: Any) -> bool:
    clean = str(value or "").strip().upper()
    return clean.endswith("NS")


def classify_consumable(item_name: Any) -> str:
    clean = str(item_name or "").strip().upper()
    if any(word in clean for word in CHEMICAL_WORDS):
        return "CHEMICAL"
    if any(word in clean for word in PACKING_WORDS):
        return "CARTON"
    return "OTHER"


def month_bounds(month: str) -> tuple[date, date]:
    try:
        year_text, month_text = str(month or "").split("-", 1)
        year, month_number = int(year_text), int(month_text)
        if not 1 <= month_number <= 12:
            raise ValueError
    except (TypeError, ValueError):
        raise ValueError("Month must use YYYY-MM format")
    return date(year, month_number, 1), date(year, month_number, monthrange(year, month_number)[1])


def _money(value: Any) -> float:
    return round(float(value or 0.0), 2)


def _rate(value: Any, weight: Any) -> float:
    denominator = float(weight or 0.0)
    return round(float(value or 0.0) / denominator, 4) if denominator > 0 else 0.0


def calculate_period_cost_summary(
    total_weight_kg: float,
    common_costs: dict[str, float],
    carton_costs: dict[str, float],
    chemical_costs: dict[str, float],
    temporary_carton_cost_per_kg: float | None = None,
) -> dict[str, float]:
    """Calculate a period KPI from that period's complete expense and quantity pools."""
    weight = max(float(total_weight_kg or 0.0), 0.0)
    common_expense = sum(float(value or 0.0) for value in common_costs.values())
    actual_carton_expense = sum(float(value or 0.0) for value in carton_costs.values())
    chemical_expense = sum(float(value or 0.0) for value in chemical_costs.values())
    applied_carton_expense = actual_carton_expense
    if temporary_carton_cost_per_kg is not None:
        applied_carton_expense = weight * float(temporary_carton_cost_per_kg)
    total_expense = common_expense + applied_carton_expense + chemical_expense
    return {
        "common_expense": round(common_expense, 2),
        "actual_carton_expense": round(actual_carton_expense, 2),
        "applied_carton_expense": round(applied_carton_expense, 2),
        "chemical_expense": round(chemical_expense, 2),
        "total_expense": round(total_expense, 2),
        "cost_per_kg": _rate(total_expense, weight),
    }


def allocate_cost_pools(
    outputs: list[dict[str, Any]],
    common_costs: dict[str, float],
    carton_costs: dict[str, float],
    chemical_costs: dict[str, float],
    temporary_carton_cost_per_kg: float | None = None,
) -> dict[str, Any]:
    """Allocate common and PO-specific pools over finished-output weight."""
    clean_outputs: list[dict[str, Any]] = []
    po_weight: dict[str, float] = defaultdict(float)
    po_non_ns_weight: dict[str, float] = defaultdict(float)
    total_weight = 0.0
    total_non_ns_weight = 0.0

    for source in outputs:
        weight = max(float(source.get("weight_kg") or 0.0), 0.0)
        if weight <= 0:
            continue
        po_number = normalize_po(source.get("po_number"))
        variety = str(source.get("variety") or "").strip()
        ns_exempt = is_ns_variety(variety)
        row = {**source, "po_number": po_number, "weight_kg": weight, "ns_exempt": ns_exempt}
        clean_outputs.append(row)
        total_weight += weight
        po_weight[po_number] += weight
        if not ns_exempt:
            total_non_ns_weight += weight
            po_non_ns_weight[po_number] += weight

    common_total = sum(float(value or 0.0) for value in common_costs.values())
    common_rate = _rate(common_total, total_weight)
    common_carton_rate = _rate(carton_costs.get("COMMON", 0.0), total_weight)
    common_chemical_rate = _rate(chemical_costs.get("COMMON", 0.0), total_non_ns_weight)

    allocations = []
    for row in clean_outputs:
        po_number = row["po_number"]
        po_carton_rate = 0.0 if po_number == "COMMON" else _rate(
            carton_costs.get(po_number, 0.0), po_weight.get(po_number, 0.0)
        )
        chemical_rate = 0.0
        po_chemical_rate = 0.0
        if not row["ns_exempt"]:
            chemical_rate = common_chemical_rate
            if po_number != "COMMON":
                po_chemical_rate = _rate(
                    chemical_costs.get(po_number, 0.0), po_non_ns_weight.get(po_number, 0.0)
                )
        carton_rate = round(common_carton_rate + po_carton_rate, 4)
        chemical_total_rate = round(chemical_rate + po_chemical_rate, 4)
        actual_calculated_rate = round(common_rate + carton_rate + chemical_total_rate, 4)
        production_rate = actual_calculated_rate
        if temporary_carton_cost_per_kg is not None:
            production_rate = round(common_rate + float(temporary_carton_cost_per_kg) + chemical_total_rate, 4)
        allocations.append({
            **row,
            "common_cost_per_kg": common_rate,
            "common_carton_cost_per_kg": common_carton_rate,
            "po_carton_cost_per_kg": po_carton_rate,
            "carton_cost_per_kg": carton_rate,
            "common_chemical_cost_per_kg": chemical_rate,
            "po_chemical_cost_per_kg": po_chemical_rate,
            "chemical_cost_per_kg": chemical_total_rate,
            "temporary_carton_cost_per_kg": round(float(temporary_carton_cost_per_kg or 0.0), 2),
            "actual_calculated_cost_per_kg": actual_calculated_rate,
            "production_cost_per_kg": production_rate,
            "allocated_cost": round(production_rate * row["weight_kg"], 2),
        })

    return {
        "total_output_weight_kg": round(total_weight, 2),
        "non_ns_output_weight_kg": round(total_non_ns_weight, 2),
        "po_weights": {key: round(value, 2) for key, value in sorted(po_weight.items())},
        "common_cost_per_kg": common_rate,
        "common_carton_cost_per_kg": common_carton_rate,
        "common_chemical_cost_per_kg": common_chemical_rate,
        "temporary_carton_cost_per_kg": round(float(temporary_carton_cost_per_kg or 0.0), 2),
        "allocations": allocations,
    }


def build_monthly_production_cost_preview(
    db: Session,
    company_id: str,
    month: str,
    location: str | None = None,
    period_start: date | None = None,
    period_end: date | None = None,
    temporary_carton_cost_per_kg: float | None = None,
    period_label: str | None = None,
) -> dict[str, Any]:
    month_start, month_end = month_bounds(month)
    start_date = period_start or month_start
    end_date = period_end or (min(month_end, date.today()) if month_start <= date.today() else month_end)
    if end_date < start_date:
        raise ValueError("Period end cannot be before period start")
    company_id = str(company_id or "").strip()
    location = str(location or "").strip()
    warnings: list[str] = []

    output_query = db.query(stock_entry).filter(
        stock_entry.company_id == company_id,
        stock_entry.date >= start_date,
        stock_entry.date <= end_date,
        func.upper(func.trim(stock_entry.cargo_movement_type)) == "IN",
        func.coalesce(stock_entry.is_cancelled, False).is_(False),
    )
    if location:
        output_query = output_query.filter(func.upper(func.trim(stock_entry.production_at)) == location.upper())
    output_rows = output_query.all()
    outputs = [{
        "source_id": row.id,
        "production_date": row.date.isoformat() if row.date else None,
        "batch_number": row.batch_number,
        "po_number": normalize_po(row.po_number),
        "variety": row.variety,
        "grade": row.grade,
        "production_at": row.production_at,
        "weight_kg": max(float(row.quantity or 0.0), 0.0),
    } for row in output_rows if float(row.quantity or 0.0) > 0]

    salary_months = []
    cursor = date(start_date.year, start_date.month, 1)
    final_month = date(end_date.year, end_date.month, 1)
    while cursor <= final_month:
        salary_months.append(cursor.strftime("%Y-%m"))
        cursor = date(cursor.year + (1 if cursor.month == 12 else 0), 1 if cursor.month == 12 else cursor.month + 1, 1)

    salary_query = db.query(SalaryProcessing).filter(
        SalaryProcessing.company_id == company_id,
        SalaryProcessing.month_year.in_(salary_months),
        SalaryProcessing.status.in_(["APPROVED", "PAID"]),
        func.coalesce(SalaryProcessing.is_cancelled, False).is_(False),
    )
    if location:
        salary_query = salary_query.filter(func.upper(func.trim(SalaryProcessing.production_at)) == location.upper())
    salary_rows = salary_query.all()
    salary_cost = 0.0
    for row in salary_rows:
        salary_month_start, salary_month_end = month_bounds(row.month_year)
        overlap_start = max(start_date, salary_month_start)
        overlap_end = min(end_date, salary_month_end)
        overlap_days = max((overlap_end - overlap_start).days + 1, 0)
        month_days = salary_month_end.day
        monthly_expense = (
            float(row.gross_salary or 0.0)
            + float(row.pf_employer or 0.0)
            + float(getattr(row, "edli_employer", 0.0) or 0.0)
            + float(row.esi_employer or 0.0)
            + float(row.lwf_employer or 0.0)
        )
        salary_cost += monthly_expense * overlap_days / month_days

    electricity_query = db.query(ElectricityLog).join(
        production_at, ElectricityLog.unit_id == production_at.id
    ).filter(
        production_at.company_id == company_id,
        ElectricityLog.reading_date >= start_date,
        ElectricityLog.reading_date <= end_date,
        func.coalesce(ElectricityLog.is_cancelled, False).is_(False),
    )
    diesel_query = db.query(DieselLog).join(
        production_at, DieselLog.unit_id == production_at.id
    ).filter(
        production_at.company_id == company_id,
        DieselLog.log_date >= start_date,
        DieselLog.log_date <= end_date,
        func.upper(func.trim(DieselLog.type)) == "OUT",
        func.coalesce(DieselLog.is_cancelled, False).is_(False),
    )
    expense_query = db.query(OtherExpense).join(
        production_at, OtherExpense.unit_id == production_at.id
    ).filter(
        production_at.company_id == company_id,
        OtherExpense.date >= start_date,
        OtherExpense.date <= end_date,
        func.upper(func.trim(OtherExpense.status)) == "POSTED",
        func.coalesce(OtherExpense.is_cancelled, False).is_(False),
    )
    stock_query = db.query(GeneralStock).filter(
        GeneralStock.company_id == company_id,
        GeneralStock.date >= start_date,
        func.upper(func.trim(GeneralStock.movement_type)) == "OUT",
        func.coalesce(GeneralStock.is_cancelled, False).is_(False),
    )
    if location:
        location_filter = location.upper()
        electricity_query = electricity_query.filter(func.upper(func.trim(production_at.production_at)) == location_filter)
        diesel_query = diesel_query.filter(func.upper(func.trim(production_at.production_at)) == location_filter)
        expense_query = expense_query.filter(func.upper(func.trim(production_at.production_at)) == location_filter)
        stock_query = stock_query.filter(func.upper(func.trim(GeneralStock.production_at)) == location_filter)

    electricity_rows = electricity_query.all()
    diesel_rows = diesel_query.all()
    expense_rows = expense_query.all()
    consumable_rows = stock_query.all()
    electricity_cost = sum(float(row.total_cost or 0.0) for row in electricity_rows)
    diesel_cost = sum(float(row.net_val or 0.0) for row in diesel_rows)

    other_expense_cost = 0.0
    excluded_expenses = []
    for row in expense_rows:
        category = str(row.category or "").strip().upper()
        if any(word in category for word in NON_PRODUCTION_EXPENSE_WORDS):
            excluded_expenses.append(category or f"Expense #{row.id}")
            continue
        if any(word in category for word in DUPLICATE_POOL_WORDS):
            excluded_expenses.append(category or f"Expense #{row.id}")
            continue
        other_expense_cost += float(row.amount or 0.0)

    carton_costs: dict[str, float] = defaultdict(float)
    chemical_costs: dict[str, float] = defaultdict(float)
    other_consumables_cost = 0.0
    for row in consumable_rows:
        amount = float(row.amount or 0.0)
        pool = normalize_po(row.po_number)
        category = classify_consumable(row.item_name)
        if category == "CARTON":
            carton_costs[pool] += amount
        elif category == "CHEMICAL":
            chemical_costs[pool] += amount
        else:
            other_consumables_cost += amount

    common_costs = {
        "salary_cost": _money(salary_cost),
        "electricity_cost": _money(electricity_cost),
        "diesel_cost": _money(diesel_cost),
        "other_expense_cost": _money(other_expense_cost),
        "other_consumables_cost": _money(other_consumables_cost),
    }
    allocation = allocate_cost_pools(
        outputs,
        common_costs,
        carton_costs,
        chemical_costs,
        temporary_carton_cost_per_kg=temporary_carton_cost_per_kg,
    )

    if not outputs:
        warnings.append("No stock-entry IN quantity is available for this period and location.")
    if not salary_rows:
        warnings.append("No approved or paid salary-processing records are available for this period.")
    if allocation["total_output_weight_kg"] <= 0:
        warnings.append("Production cost per kg cannot be calculated until output weight is available.")
    elif allocation["common_cost_per_kg"] > 1000:
        warnings.append(
            "Common transaction cost per kg is unusually high. Verify production weight and high-value utility transactions for this period."
        )
    if allocation["total_output_weight_kg"] > 0 and _rate(diesel_cost, allocation["total_output_weight_kg"]) > 500:
        warnings.append(
            "Diesel cost per output kg is unusually high. Verify diesel OUT value and finished-production quantity."
        )
    for po_number, amount in sorted(carton_costs.items()):
        if po_number != "COMMON" and allocation["po_weights"].get(po_number, 0.0) <= 0:
            warnings.append(f"Carton consumption for PO {po_number} has no matching finished output weight.")
    if excluded_expenses:
        warnings.append("Non-production or duplicate expense categories were excluded: " + ", ".join(sorted(set(excluded_expenses))))

    allocated_total = sum(float(row["allocated_cost"] or 0.0) for row in allocation["allocations"])
    period_cost = calculate_period_cost_summary(
        allocation["total_output_weight_kg"],
        common_costs,
        carton_costs,
        chemical_costs,
        temporary_carton_cost_per_kg=temporary_carton_cost_per_kg,
    )
    unallocated_period_cost = round(period_cost["total_expense"] - allocated_total, 2)
    if abs(unallocated_period_cost) > 0.01:
        warnings.append(
            f"Period KPI includes {abs(unallocated_period_cost):.2f} of expense not matched to product/PO rows; product breakdown and period average may differ."
        )
    source_details = {
        "production": outputs,
        "salary": [{
            "id": row.id,
            "employee": row.employee_name,
            "month": row.month_year,
            "amount": _money(
                (
                    float(row.gross_salary or 0.0)
                    + float(row.pf_employer or 0.0)
                    + float(getattr(row, "edli_employer", 0.0) or 0.0)
                    + float(row.esi_employer or 0.0)
                    + float(row.lwf_employer or 0.0)
                )
                * max((min(end_date, month_bounds(row.month_year)[1]) - max(start_date, month_bounds(row.month_year)[0])).days + 1, 0)
                / month_bounds(row.month_year)[1].day
            ),
        } for row in salary_rows],
        "electricity": [{"id": row.id, "date": row.reading_date.isoformat() if row.reading_date else None, "amount": _money(row.total_cost)} for row in electricity_rows],
        "diesel": [{"id": row.id, "date": row.log_date.isoformat() if row.log_date else None, "quantity": float(row.consumption or 0.0), "amount": _money(row.net_val)} for row in diesel_rows],
        "other_expenses": [{"id": row.id, "date": row.date.isoformat() if row.date else None, "category": row.category, "amount": _money(row.amount)} for row in expense_rows],
        "consumables": [{"id": row.id, "date": row.date.isoformat() if row.date else None, "po_number": normalize_po(row.po_number), "item": row.item_name, "quantity": float(row.quantity or 0.0), "amount": _money(row.amount), "category": classify_consumable(row.item_name)} for row in consumable_rows],
    }
    return {
        "month": month,
        "period_label": period_label or month,
        "period_start": start_date.isoformat(),
        "period_end": end_date.isoformat(),
        "as_of_date": end_date.isoformat(),
        "production_at": location or "ALL",
        "status": "READY" if allocation["total_output_weight_kg"] > 0 else "INCOMPLETE",
        "common_costs": common_costs,
        "carton_costs": {key: _money(value) for key, value in sorted(carton_costs.items())},
        "chemical_costs": {key: _money(value) for key, value in sorted(chemical_costs.items())},
        "warnings": warnings,
        "source_details": source_details,
        "allocated_product_cost": round(allocated_total, 2),
        "unallocated_period_cost": unallocated_period_cost,
        "period_cost_summary": period_cost,
        "weighted_average_cost_per_kg": period_cost["cost_per_kg"],
        **allocation,
    }


def build_production_cost_comparison(
    db: Session,
    company_id: str,
    location: str | None = None,
    as_of_date: date | None = None,
) -> dict[str, Any]:
    as_of = as_of_date or date.today()
    this_month_start = date(as_of.year, as_of.month, 1)
    last_month_end = this_month_start - timedelta(days=1)
    last_month_start = date(last_month_end.year, last_month_end.month, 1)
    year_start = date(as_of.year, 1, 1)

    today_preview = build_monthly_production_cost_preview(
        db, company_id, as_of.strftime("%Y-%m"), location,
        period_start=as_of, period_end=as_of,
        temporary_carton_cost_per_kg=TEMPORARY_CARTON_COST_PER_KG,
        period_label="TODAY",
    )
    last_month_preview = build_monthly_production_cost_preview(
        db, company_id, last_month_start.strftime("%Y-%m"), location,
        period_start=last_month_start, period_end=last_month_end,
        period_label="LAST MONTH",
    )
    this_month_preview = build_monthly_production_cost_preview(
        db, company_id, as_of.strftime("%Y-%m"), location,
        period_start=this_month_start, period_end=as_of,
        period_label="THIS MONTH",
    )
    year_preview = build_monthly_production_cost_preview(
        db, company_id, as_of.strftime("%Y-%m"), location,
        period_start=year_start, period_end=as_of,
        period_label="YEAR TO DATE",
    )
    return {
        "as_of_date": as_of.isoformat(),
        "production_at": str(location or "ALL"),
        "today": today_preview,
        "last_month": last_month_preview,
        "this_month": this_month_preview,
        "year": year_preview,
    }
