from datetime import date, time

import pytest

from app.database.models.processing import GateEntry, GoodsGateMovement
from tests.factories import seed_gate_masters


pytestmark = [pytest.mark.tenant, pytest.mark.api, pytest.mark.database]


def test_gate_entry_lists_reports_and_cancellation_are_tenant_scoped(
    client, db_session, tenants, login_as
):
    tenant_a, tenant_b = tenants
    masters_a = seed_gate_masters(db_session, tenant_a.company.company_code, "A")
    masters_b = seed_gate_masters(db_session, tenant_b.company.company_code, "B")
    row_a = GateEntry(
        batch_number="TENANT-A-BATCH",
        challan_number="TENANT-A-CH",
        gate_pass_number="TENANT-A-GP",
        receiving_center=masters_a["plant"],
        supplier_name=masters_a["supplier"],
        purchasing_location=masters_a["purchasing_location"],
        vehicle_number=masters_a["vehicle"],
        production_for=masters_a["production_for"],
        no_of_material_boxes=10,
        no_of_empty_boxes=0,
        no_of_ice_boxes=0,
        date=date.today(),
        time=time(10, 0),
        email=tenant_a.user.email,
        company_id=tenant_a.company.company_code,
    )
    row_b = GateEntry(
        batch_number="TENANT-B-BATCH",
        challan_number="TENANT-B-CH",
        gate_pass_number="TENANT-B-GP",
        receiving_center=masters_b["plant"],
        supplier_name=masters_b["supplier"],
        purchasing_location=masters_b["purchasing_location"],
        vehicle_number=masters_b["vehicle"],
        production_for=masters_b["production_for"],
        no_of_material_boxes=99,
        no_of_empty_boxes=0,
        no_of_ice_boxes=0,
        date=date.today(),
        time=time(10, 0),
        email=tenant_b.user.email,
        company_id=tenant_b.company.company_code,
    )
    db_session.add_all([row_a, row_b])
    db_session.commit()
    login_as(tenant_a)

    form_rows = client.get(
        "/processing/gate_entry?format=json", headers={"Accept": "application/json"}
    ).json()["today_data"]
    assert [row["batch_number"] for row in form_rows] == ["TENANT-A-BATCH"]

    report = client.get(
        "/reports/gate_entry?format=json", headers={"Accept": "application/json"}
    )
    assert report.status_code == 200
    assert {row["batch_number"] for row in report.json()["rows"]} == {"TENANT-A-BATCH"}

    cross_cancel = client.post(
        f"/processing/gate_entry/delete/{row_b.id}",
        data={"cancel_reason": "Cross tenant attempt"},
        headers={"Accept": "application/json"},
    )
    assert cross_cancel.status_code == 404
    db_session.refresh(row_b)
    assert row_b.is_cancelled is False


def test_user_supplied_tenant_fields_cannot_move_goods_to_another_tenant(
    client, db_session, tenants, login_as
):
    tenant_a, tenant_b = tenants
    masters_a = seed_gate_masters(db_session, tenant_a.company.company_code, "A")
    seed_gate_masters(db_session, tenant_b.company.company_code, "B")
    db_session.commit()
    login_as(tenant_a)
    response = client.post("/processing/gate_entry/goods", json={
        "company_id": tenant_b.company.company_code,
        "movement_type": "OUT",
        "production_for": masters_a["production_for"],
        "plant_location": masters_a["plant"],
        "party_name": "Synthetic Party",
        "purpose": "Office Use",
        "items": [{
            "item_category": "Office Materials",
            "item_name": "Synthetic Stationery",
            "quantity": 2,
            "unit": "Nos",
        }],
    })
    assert response.status_code == 200, response.text
    movement = db_session.query(GoodsGateMovement).one()
    assert movement.company_id == tenant_a.company.company_code
    assert movement.company_id != tenant_b.company.company_code
