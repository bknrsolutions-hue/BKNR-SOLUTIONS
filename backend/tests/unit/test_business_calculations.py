from datetime import date
from types import SimpleNamespace

import pytest

from app.routers.attendance.daily_attendance import (
    attendance_payable_credit,
    calculate_duty_type_and_ot,
)
from app.routers.finance_accounts import calculate_salary_totals
from app.routers.inventory_management.pending_orders import (
    calculate_pieces,
    calculate_sales_values,
)
from app.routers.inventory_management.sales import refresh_sales_amounts
from app.services.payroll_statutory import calculate_pf_esi, nearest_rupee, next_higher_rupee
from app.services.production_cost_automation import (
    allocate_cost_pools,
    calculate_period_cost_summary,
    month_bounds,
)
from app.utils.cancel_math import active_number, signed_number


pytestmark = pytest.mark.unit


def test_cost_summary_zero_weight_is_safe_and_precise():
    result = calculate_period_cost_summary(
        total_weight_kg=0,
        common_costs={"power": 125.555},
        carton_costs={},
        chemical_costs={},
    )
    assert result["common_expense"] == 125.56
    assert result["cost_per_kg"] == 0


def test_cost_allocation_ignores_negative_output_and_rounds_rates():
    result = allocate_cost_pools(
        outputs=[
            {"po_number": "PO-1", "variety": "PD", "weight_kg": 3},
            {"po_number": "PO-2", "variety": "PD", "weight_kg": -1},
        ],
        common_costs={"power": 10},
        carton_costs={},
        chemical_costs={},
    )
    assert result["total_output_weight_kg"] == 3
    assert result["allocations"][0]["common_cost_per_kg"] == 3.3333
    assert result["allocations"][0]["allocated_cost"] == 10


@pytest.mark.parametrize(
    ("value", "expected"),
    [("2026-02", (date(2026, 2, 1), date(2026, 2, 28))), ("2024-02", (date(2024, 2, 1), date(2024, 2, 29)))],
)
def test_month_bounds_handles_normal_and_leap_years(value, expected):
    assert month_bounds(value) == expected


@pytest.mark.parametrize("value", ["", "2026", "2026-13", None])
def test_month_bounds_rejects_invalid_values(value):
    with pytest.raises(ValueError, match="YYYY-MM"):
        month_bounds(value)


def test_salary_totals_prorate_and_cap_advance_deduction():
    totals = calculate_salary_totals({
        "present_days": 13,
        "basic_salary": 13000,
        "hra": 2600,
        "ot_amount": 500,
        "pf_employee": 1000,
        "advance_deduction": 999999,
    })
    assert totals["earned_monthly_salary"] == 7800
    assert totals["gross_salary"] == 8300
    assert totals["advance_deduction"] == 7300
    assert totals["net_payable"] == 0


def test_salary_totals_reject_negative_or_excess_fixed_deductions():
    with pytest.raises(ValueError, match="cannot be negative"):
        calculate_salary_totals({"present_days": -1})
    with pytest.raises(ValueError, match="cannot exceed"):
        calculate_salary_totals({"present_days": 1, "basic_salary": 100, "pf_employee": 1000})


def test_pf_esi_rounding_and_age_rules():
    statutory = SimpleNamespace(
        pf_applicable=True,
        pf_wage_limit=15000,
        pf_employee_percent=12,
        pf_employer_percent=12,
        eps_applicable=True,
        esi_applicable=True,
        esi_employee_percent=0.75,
        esi_employer_percent=3.25,
    )
    result = calculate_pf_esi(
        statutory,
        monthly_pf_wages=25000,
        earned_pf_wages=20000,
        monthly_esi_wages=26000,
        earned_esi_wages=12345.67,
        employee_dob=date(1968, 1, 1),
        effective_date=date(2026, 7, 1),
    )
    assert result["pf_wages"] == 15000
    assert result["pf_employee"] == 1800
    assert result["eps_employer"] == 0
    assert result["epf_employer"] == 1800
    assert result["esi_employee"] == 93
    assert result["esi_employer"] == 402
    assert nearest_rupee(10.5) == 11
    assert next_higher_rupee(10.01) == 11


@pytest.mark.parametrize(
    ("hours", "duty", "ot", "credit"),
    [(3.9, "ABSENT", 0, 0), (4, "HALF", 0, 0.5), (9, "SINGLE", 1, 1), (17, "DOUBLE", 1, 2)],
)
def test_attendance_boundaries(hours, duty, ot, credit):
    assert calculate_duty_type_and_ot(hours) == (duty, ot)
    assert attendance_payable_credit(hours, 8) == credit


def test_pending_order_and_sales_amount_calculations():
    assert calculate_pieces("16/20", None) == 44
    assert calculate_pieces("16/20", "12") == 12
    order = SimpleNamespace(
        packing_style="10 KG MC",
        no_of_mc=10,
        selling_price=6.25,
        exchange_rate=83.5,
    )
    assert calculate_sales_values(order, {"10 KG MC": 10}) == (100, 625, 52187.5)

    sale = SimpleNamespace(
        packing_style="10 KG MC",
        no_of_mc=10,
        price=6.25,
        exchange_rate=83.5,
        sales_quantity=0,
        amount_usd=0,
        amount_inr=0,
    )
    assert refresh_sales_amounts(sale, {"10 KG MC": 10}) == 52187.5
    assert sale.sales_quantity == 100


def test_cancel_math_distinguishes_net_and_active_values():
    active = SimpleNamespace(is_cancelled=False)
    cancelled = SimpleNamespace(is_cancelled=True)
    assert signed_number(active, 12.5) == 12.5
    assert signed_number(cancelled, 12.5) == -12.5
    assert active_number(cancelled, 12.5) == 0
