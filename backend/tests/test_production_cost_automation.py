from app.services.production_cost_automation import (
    allocate_cost_pools,
    calculate_period_cost_summary,
    classify_consumable,
    is_ns_variety,
    normalize_po,
)


def test_common_and_po_carton_costs_are_both_applied():
    result = allocate_cost_pools(
        outputs=[
            {"po_number": "PO-100", "variety": "HLSO", "weight_kg": 100},
            {"po_number": "PO-200", "variety": "HOSO", "weight_kg": 100},
        ],
        common_costs={},
        carton_costs={"COMMON": 800, "PO-100": 300},
        chemical_costs={},
    )

    by_po = {row["po_number"]: row for row in result["allocations"]}
    assert by_po["PO-100"]["common_carton_cost_per_kg"] == 4
    assert by_po["PO-100"]["po_carton_cost_per_kg"] == 3
    assert by_po["PO-100"]["carton_cost_per_kg"] == 7
    assert by_po["PO-200"]["carton_cost_per_kg"] == 4


def test_ns_variety_excludes_both_common_and_po_chemical_cost():
    result = allocate_cost_pools(
        outputs=[
            {"po_number": "PO-100", "variety": "PD NS", "weight_kg": 100},
            {"po_number": "PO-100", "variety": "PD", "weight_kg": 100},
        ],
        common_costs={"salary_cost": 1000},
        carton_costs={},
        chemical_costs={"COMMON": 200, "PO-100": 100},
    )

    ns_row = next(row for row in result["allocations"] if row["variety"] == "PD NS")
    eligible_row = next(row for row in result["allocations"] if row["variety"] == "PD")
    assert ns_row["chemical_cost_per_kg"] == 0
    assert ns_row["production_cost_per_kg"] == 5
    assert eligible_row["chemical_cost_per_kg"] == 3
    assert eligible_row["production_cost_per_kg"] == 8


def test_today_temporary_cost_uses_fixed_five_rupee_carton_rate():
    result = allocate_cost_pools(
        outputs=[
            {"po_number": "PO-100", "variety": "PD NS", "weight_kg": 100},
            {"po_number": "PO-100", "variety": "PD", "weight_kg": 100},
        ],
        common_costs={"daily_transactions": 1000},
        carton_costs={"COMMON": 800, "PO-100": 300},
        chemical_costs={"COMMON": 200, "PO-100": 100},
        temporary_carton_cost_per_kg=5,
    )

    ns_row = next(row for row in result["allocations"] if row["variety"] == "PD NS")
    eligible_row = next(row for row in result["allocations"] if row["variety"] == "PD")
    assert ns_row["production_cost_per_kg"] == 10
    assert eligible_row["production_cost_per_kg"] == 13
    assert eligible_row["actual_calculated_cost_per_kg"] == 13.5


def test_period_kpi_uses_all_period_expenses_even_when_po_is_unmatched():
    actual = calculate_period_cost_summary(
        total_weight_kg=200,
        common_costs={"salary": 1000},
        carton_costs={"COMMON": 800, "UNMATCHED-PO": 300},
        chemical_costs={"COMMON": 300},
    )
    today = calculate_period_cost_summary(
        total_weight_kg=200,
        common_costs={"salary": 1000},
        carton_costs={"COMMON": 800, "UNMATCHED-PO": 300},
        chemical_costs={"COMMON": 300},
        temporary_carton_cost_per_kg=5,
    )

    assert actual["total_expense"] == 2400
    assert actual["cost_per_kg"] == 12
    assert today["applied_carton_expense"] == 1000
    assert today["total_expense"] == 2300
    assert today["cost_per_kg"] == 11.5


def test_normalization_and_consumable_classification():
    assert normalize_po(None) == "COMMON"
    assert normalize_po(" n/a ") == "COMMON"
    assert normalize_po(" po-7 ") == "PO-7"
    assert is_ns_variety("PDTO NS") is True
    assert is_ns_variety("PDTO") is False
    assert classify_consumable("5 ply master carton") == "CARTON"
    assert classify_consumable("STPP chemical") == "CHEMICAL"
    assert classify_consumable("machine oil") == "OTHER"
