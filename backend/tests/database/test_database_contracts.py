from datetime import date, time

import pytest
from sqlalchemy.exc import IntegrityError

from app.database.models.criteria import suppliers
from app.database.models.processing import GoodsGateMovement, GoodsGateMovementItem


pytestmark = [pytest.mark.database]


def _movement(company_id: str, number: str) -> GoodsGateMovement:
    return GoodsGateMovement(
        company_id=company_id,
        movement_number=number,
        movement_type="IN",
        movement_date=date(2026, 7, 19),
        movement_time=time(10, 30),
        production_for="Synthetic Production",
        plant_location="Synthetic Plant",
        party_name="Synthetic Vendor",
        purpose="Testing",
        created_by="automated-test@example.test",
        created_at=date(2026, 7, 19),
    )


def test_tenant_scoped_unique_master_allows_same_value_in_another_tenant(db_session, tenants):
    tenant_a, tenant_b = tenants
    db_session.add_all([
        suppliers(company_id=tenant_a.company.company_code, supplier_name="Shared Synthetic Supplier"),
        suppliers(company_id=tenant_b.company.company_code, supplier_name="Shared Synthetic Supplier"),
    ])
    db_session.commit()
    assert db_session.query(suppliers).count() == 2


def test_tenant_scoped_unique_master_rejects_duplicate_in_same_tenant(db_session, tenants):
    tenant_a, _ = tenants
    db_session.add_all([
        suppliers(company_id=tenant_a.company.company_code, supplier_name="Duplicate Synthetic Supplier"),
        suppliers(company_id=tenant_a.company.company_code, supplier_name="Duplicate Synthetic Supplier"),
    ])
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_goods_movement_number_is_unique_per_tenant(db_session, tenants):
    tenant_a, tenant_b = tenants
    db_session.add_all([
        _movement(tenant_a.company.company_code, "GM-0001"),
        _movement(tenant_b.company.company_code, "GM-0001"),
    ])
    db_session.commit()
    db_session.add(_movement(tenant_a.company.company_code, "GM-0001"))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_goods_items_require_parent_and_cascade_on_parent_delete(db_session, tenants):
    tenant_a, _ = tenants
    movement = _movement(tenant_a.company.company_code, "GM-CASCADE")
    db_session.add(movement)
    db_session.flush()
    item = GoodsGateMovementItem(
        movement_id=movement.id,
        item_category="Packing Materials",
        item_name="Synthetic Carton",
        quantity=2.125,
        unit="Nos",
    )
    db_session.add(item)
    db_session.commit()
    item_id = item.id

    db_session.delete(movement)
    db_session.commit()
    assert db_session.get(GoodsGateMovementItem, item_id) is None


def test_required_goods_fields_are_enforced_by_database(db_session, tenants):
    tenant_a, _ = tenants
    movement = _movement(tenant_a.company.company_code, "GM-NULL")
    movement.purpose = None
    db_session.add(movement)
    with pytest.raises(IntegrityError):
        db_session.commit()
