from datetime import date, time

import pytest

from app.database.models.processing import (
    DeHeading,
    GateEntry,
    Grading,
    Peeling,
    Production,
    RawMaterialPurchasing,
    Soaking,
)


pytestmark = [pytest.mark.integration, pytest.mark.database]


def test_synthetic_raw_material_to_finished_goods_quantities_reconcile(db_session, tenants):
    """Exercise the real processing tables with one internally consistent batch.

    Each stage is intentionally synthetic.  This verifies tenant ownership,
    stage linkage and the quantity/yield invariants without mutating production
    or pretending that direct inserts are a substitute for route-level tests.
    """
    tenant_a, tenant_b = tenants
    company_id = tenant_a.company.company_code
    batch = "SYNTH-E2E-BATCH-001"
    common = {
        "date": date(2026, 7, 19),
        "time": time(9, 0),
        "email": tenant_a.user.email,
        "company_id": company_id,
        "production_for": "Synthetic Production",
    }
    gate = GateEntry(
        batch_number=batch,
        challan_number="SYNTH-CH-001",
        gate_pass_number="SYNTH-GP-001",
        receiving_center="Synthetic Plant",
        supplier_name="Synthetic Supplier",
        purchasing_location="Synthetic Harbour",
        vehicle_number="TEST-01",
        no_of_material_boxes=100,
        no_of_empty_boxes=10,
        no_of_ice_boxes=5,
        **common,
    )
    purchase = RawMaterialPurchasing(
        batch_number=batch,
        supplier_name="Synthetic Supplier",
        variety_name="HOSO",
        species="Vannamei",
        count="40",
        received_qty=1000.0,
        rate_per_kg=300.125,
        amount=300125.0,
        **common,
    )
    deheading = DeHeading(
        batch_number=batch,
        species="Vannamei",
        hoso_count="40",
        hoso_qty=1000.0,
        hlso_qty=650.0,
        yield_percent=65.0,
        **common,
    )
    grading = Grading(
        batch_number=batch,
        species="Vannamei",
        hoso_count="40",
        variety_name="HLSO",
        graded_count="51/60",
        quantity=645.0,
        **common,
    )
    peeling = Peeling(
        batch_number=batch,
        species="Vannamei",
        hlso_count="51/60",
        hlso_qty=645.0,
        variety_name="PD",
        peeled_qty=500.0,
        yield_percent=round(500.0 / 645.0 * 100, 2),
        **common,
    )
    soaking = Soaking(
        batch_number=batch,
        species="Vannamei",
        variety_name="PD",
        in_count="71/90",
        in_qty=500.0,
        chemical_name="Synthetic Phosphate",
        chemical_percent=1.0,
        chemical_qty=5.0,
        salt_percent=0.5,
        salt_qty=2.5,
        rejection_qty=2.0,
        production_at="Synthetic Plant",
        status="Completed",
        **common,
    )
    production = Production(
        batch_number=batch,
        production_at="Synthetic Plant",
        production_type="IQF",
        species="Vannamei",
        brand="Synthetic Brand",
        variety_name="PD",
        glaze="10%",
        freezer="IQF-1",
        packing_style="10 KG MC",
        grade="71/90",
        no_of_mc=48,
        loose=0,
        production_qty=480.0,
        **common,
    )
    db_session.add_all([gate, purchase, deheading, grading, peeling, soaking, production])
    db_session.commit()

    assert purchase.amount == pytest.approx(purchase.received_qty * purchase.rate_per_kg, abs=0.01)
    assert deheading.yield_percent == pytest.approx(deheading.hlso_qty / deheading.hoso_qty * 100)
    assert grading.quantity <= deheading.hlso_qty
    assert peeling.peeled_qty <= peeling.hlso_qty
    assert production.production_qty <= soaking.in_qty - soaking.rejection_qty
    assert production.production_qty / purchase.received_qty == pytest.approx(0.48)

    tenant_a_rows = db_session.query(Production).filter(Production.company_id == company_id).all()
    tenant_b_rows = db_session.query(Production).filter(
        Production.company_id == tenant_b.company.company_code
    ).all()
    assert [row.batch_number for row in tenant_a_rows] == [batch]
    assert tenant_b_rows == []
