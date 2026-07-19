import pytest

from app.database.models.processing import GateEntry, GoodsGateMovement
from tests.factories import seed_gate_masters


pytestmark = [pytest.mark.api, pytest.mark.database]


def _raw_payload(masters, suffix="001"):
    return {
        "batch_number": f"TEST-BATCH-{suffix}",
        "challan_number": f"TEST-CH-{suffix}",
        "gate_pass_number": f"TEST-GP-{suffix}",
        "receiving_center": masters["plant"],
        "supplier_name": masters["supplier"],
        "purchasing_location": masters["purchasing_location"],
        "vehicle_number": masters["vehicle"],
        "driver_name": "Synthetic Driver",
        "production_for": masters["production_for"],
        "no_of_material_boxes": "10.5",
        "no_of_empty_boxes": "2",
        "no_of_ice_boxes": "1",
    }


def test_raw_gate_entry_create_read_and_duplicate_validation(client, db_session, tenants, login_as):
    tenant_a, _ = tenants
    masters = seed_gate_masters(db_session, tenant_a.company.company_code, "A")
    db_session.commit()
    login_as(tenant_a)

    response = client.post("/processing/gate_entry", data=_raw_payload(masters))
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "success"

    response = client.get("/processing/gate_entry?format=json", headers={"Accept": "application/json"})
    assert response.status_code == 200
    rows = response.json()["today_data"]
    assert len(rows) == 1
    assert rows[0]["batch_number"] == "TEST-BATCH-001"
    assert rows[0]["no_of_material_boxes"] == 10.5

    duplicate = client.post("/processing/gate_entry", data=_raw_payload(masters))
    assert duplicate.status_code == 400
    assert "already exists" in duplicate.text


def test_raw_gate_entry_rejects_missing_fields_and_unknown_factory(client, db_session, tenants, login_as):
    tenant_a, _ = tenants
    masters = seed_gate_masters(db_session, tenant_a.company.company_code, "A")
    db_session.commit()
    login_as(tenant_a)
    payload = _raw_payload(masters)
    payload["receiving_center"] = ""
    assert client.post("/processing/gate_entry", data=payload).status_code in {400, 422}
    payload["receiving_center"] = "Unconfigured Plant"
    assert client.post("/processing/gate_entry", data=payload).status_code == 400


def test_goods_gate_entry_validates_rmp_and_persists_non_rmp_goods(client, db_session, tenants, login_as):
    tenant_a, _ = tenants
    masters = seed_gate_masters(db_session, tenant_a.company.company_code, "A")
    db_session.commit()
    login_as(tenant_a)
    payload = {
        "movement_type": "IN",
        "production_for": masters["production_for"],
        "plant_location": masters["plant"],
        "party_name": masters["supplier"],
        "source_destination": masters["purchasing_location"],
        "purpose": "Purchase Receipt",
        "items": [{
            "item_category": "Packing Materials",
            "item_name": "Synthetic Cartons",
            "quantity": 25,
            "unit": "Nos",
            "packages": 1,
        }],
    }
    response = client.post("/processing/gate_entry/goods", json=payload)
    assert response.status_code == 200, response.text
    assert response.json()["row"]["movement_type"] == "IN"
    assert db_session.query(GoodsGateMovement).filter(
        GoodsGateMovement.company_id == tenant_a.company.company_code
    ).count() == 1

    payload["items"][0]["item_name"] = "Raw Shrimp"
    payload["items"][0]["item_category"] = "Other"
    rejected = client.post("/processing/gate_entry/goods", json=payload)
    assert rejected.status_code == 400
    assert "Raw material shrimp" in rejected.text
