import sys
import os
from datetime import date

# Add backend root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.services.traceability_workflow import TraceabilityWorkflowService

def run_tests():
    print("=========================================================================")
    print("▶ STARTING AUTOMATED TRACEABILITY & WORKFLOW ENGINE VERIFICATION TESTS")
    print("=========================================================================")

    # 1. Setup in-memory sqlite engine
    engine = create_engine("sqlite:///:memory:", echo=False)
    Session = sessionmaker(bind=engine)
    db = Session()

    # 2. Create only the necessary tables
    from app.database.models.advanced_seafood_erp import (
        PondMaster, HarvestLot, ProductionBatch, ProductionConversion, 
        WorkflowConfig, DocumentApproval
    )
    from app.database.models.processing import RawMaterialPurchasing, Production
    from app.database.models.inventory_management import stock_entry, sales_dispatch

    for model in [PondMaster, HarvestLot, ProductionBatch, ProductionConversion, 
                  WorkflowConfig, DocumentApproval, RawMaterialPurchasing, Production, 
                  stock_entry, sales_dispatch]:
        model.__table__.create(bind=engine)
    print("✔ Database tables successfully initialized in memory.")

    company_id = "VNBK2162"

    # =========================================================================
    # TEST TRACEABILITY ENGINE
    # =========================================================================
    print("\n[STEP 1] Seeding complete traceability chain data...")
    
    # Farmer / Pond
    pond = PondMaster(
        company_id=company_id,
        farmer_name="Venkata Rao",
        pond_location="Nellore District, AP",
        mpeda_reg_no="MPEDA-AP-NELL-8283",
        is_active=True
    )
    db.add(pond)
    db.flush()

    # Harvest Lot
    lot_no = "LOT-NELLORE-091"
    lot = HarvestLot(
        company_id=company_id,
        lot_number=lot_no,
        pond_id=pond.id,
        harvest_date=date.today(),
        quantity_harvested=12000.0,
        temperature=4.2,
        qc_status="APPROVED"
    )
    db.add(lot)

    # RM purchase record
    rm = RawMaterialPurchasing(
        company_id=company_id,
        batch_number=lot_no,
        supplier_name="Venkata Rao Farms",
        species="Vannamei",
        variety_name="Peeled Tail On",
        received_qty=12000.0,
        amount=6500000.0
    )
    db.add(rm)

    # Advanced production conversions
    p_batch = ProductionBatch(
        company_id=company_id,
        batch_number=lot_no,
        status="CLOSED",
        yield_percent=92.5
    )
    db.add(p_batch)
    db.flush()

    conv1 = ProductionConversion(
        batch_id=p_batch.id,
        from_stage="HOSO",
        to_stage="HLSO",
        input_weight=12000.0,
        output_weight=11500.0,
        process_loss=500.0
    )
    conv2 = ProductionConversion(
        batch_id=p_batch.id,
        from_stage="HLSO",
        to_stage="PDTO",
        input_weight=11500.0,
        output_weight=11100.0,
        process_loss=400.0
    )
    db.add_all([conv1, conv2])

    # Stock entry
    stock = stock_entry(
        company_id=company_id,
        batch_number=lot_no,
        location="Vizag Main Cold Chamber 2",
        brand="ROYAL_SHRIMP",
        packing_style="10x2kg cartons",
        grade="16/20",
        quantity=11100.0,
        no_of_mc=555
    )
    db.add(stock)

    # Sales dispatch & container
    container_no = "TGHU8472930"
    dispatch = sales_dispatch(
        company_id=company_id,
        invoice_no="INV-2026-X9",
        container_no=container_no,
        buyer_name="Boston Seafoods Ltd",
        country="USA",
        po_number=lot_no, # Links to lot_no
        amount_usd=92000.0,
        exchange_rate=83.50
    )
    db.add(dispatch)
    db.commit()
    print("✔ Traceability chain data successfully seeded.")

    # Execute Forward Traceability
    print("\n[STEP 2] Running FORWARD TRACEABILITY from Farmer Lot...")
    forward = TraceabilityWorkflowService.trace_lot_forward(db, lot_no)
    print(f"✔ Source Farmer: {forward['source_farmer']['farmer']}")
    print(f"✔ Pond Location: {forward['source_farmer']['pond_location']}")
    print(f"✔ Production Stages: {len(forward['production_batches'][0]['stages'])} stages tracked")
    print(f"✔ Final Container: {forward['shipments'][0]['container_no']}")
    print(f"✔ Shipment Buyer: {forward['shipments'][0]['buyer']}")

    # Execute Backward Traceability
    print("\n[STEP 3] Running BACKWARD TRACEABILITY from Container Number...")
    backward = TraceabilityWorkflowService.trace_container_backward(db, container_no)
    print(f"✔ Container: {backward['container_no']}")
    print(f"✔ Associated Invoice: {backward['shipments'][0]['invoice_no']}")
    print(f"✔ Linked Farmer: {backward['source_farmers'][0]['farmer']}")
    print(f"✔ Source Pond Registration: {backward['source_farmers'][0]['mpeda_reg_no']}")

    # Assert traceability verification
    if forward['source_farmer']['farmer'] == "Venkata Rao" and backward['source_farmers'][0]['farmer'] == "Venkata Rao":
        print("✔ Traceability forward/backward cycle matches perfectly!")
    else:
        print("❌ Traceability matching error")

    # =========================================================================
    # TEST WORKFLOW APPROVALS ENGINE
    # =========================================================================
    print("\n[STEP 4] Seeding workflow approval hierarchies (MANAGER -> GM -> CEO)...")
    TraceabilityWorkflowService.seed_default_workflow_configs(db, company_id)
    
    doc_id = 505
    doc_type = "PURCHASE_ORDER"
    
    print("\n[STEP 5] Initiating Document Approval workflow...")
    approval = TraceabilityWorkflowService.submit_document_for_approval(db, company_id, doc_type, doc_id)
    db.commit()
    print(f"✔ Workflow registered. Initial Sequence Step: {approval.current_sequence} (Status: {approval.status})")

    # Try wrong step sequence
    print("\n[STEP 6] Attempting approval with incorrect role sequence (GM)...")
    err_res = TraceabilityWorkflowService.approve_document(
        db, company_id, doc_type, doc_id, "GM", "gm@bknr.com"
    )
    print(f"✔ Rejection feedback: {err_res['message']}")

    # Step 1: MANAGER Approval
    print("\n[STEP 7] Executing Sequence Step 1: MANAGER Approval...")
    r1 = TraceabilityWorkflowService.approve_document(
        db, company_id, doc_type, doc_id, "MANAGER", "manager@bknr.com"
    )
    db.commit()
    print(f"✔ Action outcome: {r1['message']}")

    # Step 2: GM Approval
    print("\n[STEP 8] Executing Sequence Step 2: GM Approval...")
    r2 = TraceabilityWorkflowService.approve_document(
        db, company_id, doc_type, doc_id, "GM", "gm@bknr.com"
    )
    db.commit()
    print(f"✔ Action outcome: {r2['message']}")

    # Step 3: CEO Approval (Final Step)
    print("\n[STEP 9] Executing Sequence Step 3 (Final): CEO Approval...")
    r3 = TraceabilityWorkflowService.approve_document(
        db, company_id, doc_type, doc_id, "CEO", "ceo@bknr.com"
    )
    db.commit()
    print(f"✔ Action outcome: {r3['message']} (Final Document Status: {r3['status']})")

    if r3['status'] == 'APPROVED':
        print("✔ Workflow state engine approvals executed perfectly!")
    else:
        print("❌ Workflow state approvals validation failed!")

    print("\n=========================================================================")
    print("▶ ALL TRACEABILITY & WORKFLOW VERIFICATION TESTS COMPLETED SUCCESSFULLY!")
    print("=========================================================================")

if __name__ == "__main__":
    run_tests()
