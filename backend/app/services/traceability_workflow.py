import logging
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import and_

from app.database.models.advanced_seafood_erp import (
    PondMaster, HarvestLot, ProductionBatch, ProductionConversion, 
    WorkflowConfig, DocumentApproval
)
# Import existing ERP tables to construct the dynamic traceability mapping
from app.database.models.processing import RawMaterialPurchasing, Production
from app.database.models.inventory_management import stock_entry, sales_dispatch

logger = logging.getLogger(__name__)

class TraceabilityWorkflowService:

    # =========================================================================
    # 1. TRACEABILITY PATH ENGINES
    # =========================================================================

    @staticmethod
    def trace_lot_forward(db: Session, lot_number: str) -> dict:
        """
        Traverses supply chain FORWARD:
        Farmer Lot -> RM Purchase Batch -> Advanced Production Conversions -> Stock Warehouse -> Shipment Invoice.
        """
        result = {
            "lot_number": lot_number,
            "source_farmer": None,
            "purchase_batch": None,
            "production_batches": [],
            "warehouse_stocks": [],
            "shipments": []
        }

        # 1. Resolve Harvest Lot Source
        lot = db.query(HarvestLot).filter(HarvestLot.lot_number == lot_number).first()
        if not lot:
            return result
        
        result["source_farmer"] = {
            "farmer": lot.pond.farmer_name,
            "pond_location": lot.pond.pond_location,
            "mpeda_reg_no": lot.pond.mpeda_reg_no,
            "quantity_harvested": lot.quantity_harvested
        }

        # 2. Resolve Raw Material Purchasing records linked to this lot/batch
        rm = db.query(RawMaterialPurchasing).filter(
            RawMaterialPurchasing.batch_number == lot_number
        ).all()
        
        if rm:
            result["purchase_batch"] = {
                "batch_number": lot_number,
                "species": rm[0].species,
                "variety": rm[0].variety_name,
                "received_qty": sum(r.received_qty for r in rm),
                "total_cost": sum(r.amount for r in rm)
            }

        # 3. Resolve advanced production batches linked to this lot/batch number
        prod_batches = db.query(ProductionBatch).filter(
            ProductionBatch.batch_number == lot_number
        ).all()
        
        for pb in prod_batches:
            conversions = db.query(ProductionConversion).filter(
                ProductionConversion.batch_id == pb.id
            ).all()
            
            result["production_batches"].append({
                "batch_number": pb.batch_number,
                "start_date": pb.start_date.strftime('%Y-%m-%d %H:%M:%S'),
                "yield_percent": pb.yield_percent,
                "stages": [
                    {
                        "from": c.from_stage,
                        "to": c.to_stage,
                        "input": c.input_weight,
                        "output": c.output_weight,
                        "process_loss": c.process_loss
                    } for c in conversions
                ]
            })

        # 4. Resolve current stocks in cold storage warehouse
        stocks = db.query(stock_entry).filter(
            stock_entry.batch_number == lot_number
        ).all()
        
        for s in stocks:
            result["warehouse_stocks"].append({
                "location": s.location,
                "brand": s.brand,
                "packing_style": s.packing_style,
                "grade": s.grade,
                "quantity": s.quantity,
                "no_of_mc": s.no_of_mc
            })

        # 5. Resolve finalized export shipments
        # Search by lot_number or reference PO in sales dispatch records
        dispatches = db.query(sales_dispatch).filter(
            sales_dispatch.po_number == lot_number
        ).all()
        
        for d in dispatches:
            result["shipments"].append({
                "invoice_no": d.invoice_no,
                "buyer": d.buyer_name,
                "country": d.country,
                "container_no": d.container_no,
                "amount_usd": d.amount_usd,
                "exchange_rate": d.exchange_rate
            })

        return result

    @staticmethod
    def trace_container_backward(db: Session, container_no: str) -> dict:
        """
        Traverses supply chain BACKWARD:
        Container No -> Sales Dispatch Invoices -> Warehouse Stock Entries -> Processing Batches -> RM Purchase Lots -> Source Farmer Pond.
        """
        result = {
            "container_no": container_no,
            "shipments": [],
            "linked_batches": [],
            "source_farmers": []
        }

        # 1. Trace shipments inside the container
        dispatches = db.query(sales_dispatch).filter(
            sales_dispatch.container_no == container_no
        ).all()

        if not dispatches:
            return result

        batch_nos = set()

        for d in dispatches:
            result["shipments"].append({
                "invoice_no": d.invoice_no,
                "buyer": d.buyer_name,
                "country": d.country,
                "po_number": d.po_number,
                "amount_usd": d.amount_usd
            })
            if d.po_number:
                batch_nos.add(d.po_number)

        # 2. Trace warehouse stock and processing batches
        for b_no in batch_nos:
            pb = db.query(ProductionBatch).filter(ProductionBatch.batch_number == b_no).first()
            if pb:
                conversions = db.query(ProductionConversion).filter(ProductionConversion.batch_id == pb.id).all()
                result["linked_batches"].append({
                    "batch_number": b_no,
                    "yield_percent": pb.yield_percent,
                    "stages": [{"from": c.from_stage, "to": c.to_stage, "input": c.input_weight, "output": c.output_weight} for c in conversions]
                })

            # 3. Trace back to Supplier / Harvest Lot
            lot = db.query(HarvestLot).filter(HarvestLot.lot_number == b_no).first()
            if lot:
                result["source_farmers"].append({
                    "lot_number": b_no,
                    "farmer": lot.pond.farmer_name,
                    "pond_location": lot.pond.pond_location,
                    "mpeda_reg_no": lot.pond.mpeda_reg_no,
                    "harvest_date": lot.harvest_date.strftime('%Y-%m-%d'),
                    "quantity": lot.quantity_harvested
                })

        return result

    # =========================================================================
    # 2. WORKFLOW APPROVAL STATE MACHINE
    # =========================================================================

    @staticmethod
    def seed_default_workflow_configs(db: Session, company_id: str):
        """Seeds default approval sequences (Requester -> Manager -> GM -> CEO)."""
        configs = [
            # Sequence for Purchase Orders
            {"type": "PURCHASE_ORDER", "role": "MANAGER", "seq": 1},
            {"type": "PURCHASE_ORDER", "role": "GM", "seq": 2},
            {"type": "PURCHASE_ORDER", "role": "CEO", "seq": 3},
            # Sequence for Sales Invoice / Discounts
            {"type": "SALES_APPROVAL", "role": "GM", "seq": 1},
            {"type": "SALES_APPROVAL", "role": "CEO", "seq": 2}
        ]

        for conf in configs:
            exists = db.query(WorkflowConfig).filter(
                WorkflowConfig.company_id == company_id,
                WorkflowConfig.document_type == conf["type"],
                WorkflowConfig.approver_role == conf["role"]
            ).first()
            
            if not exists:
                c = WorkflowConfig(
                    company_id=company_id,
                    document_type=conf["type"],
                    approver_role=conf["role"],
                    approval_sequence=conf["seq"]
                )
                db.add(c)
        db.flush()

    @staticmethod
    def submit_document_for_approval(db: Session, company_id: str, document_type: str, document_id: int) -> DocumentApproval:
        """Submits a document to start approval routing workflows."""
        # Ensure configuration exists
        TraceabilityWorkflowService.seed_default_workflow_configs(db, company_id)

        # Clear any existing approval tracks
        db.query(DocumentApproval).filter(
            DocumentApproval.company_id == company_id,
            DocumentApproval.document_type == document_type,
            DocumentApproval.document_id == document_id
        ).delete()

        approval = DocumentApproval(
            company_id=company_id,
            document_type=document_type,
            document_id=document_id,
            current_sequence=1,
            status='PENDING'
        )
        db.add(approval)
        db.flush()
        return approval

    @staticmethod
    def approve_document(db: Session, company_id: str, document_type: str, document_id: int, approver_role: str, email: str) -> dict:
        """Approves a document step. Advances sequence or flags as fully APPROVED."""
        approval = db.query(DocumentApproval).filter(
            DocumentApproval.company_id == company_id,
            DocumentApproval.document_type == document_type,
            DocumentApproval.document_id == document_id
        ).first()

        if not approval:
            return {"success": False, "message": "No active approval workflow found for this document"}

        if approval.status != 'PENDING':
            return {"success": False, "message": f"Document is already in {approval.status} status"}

        # Find expected role at current sequence
        conf = db.query(WorkflowConfig).filter(
            WorkflowConfig.company_id == company_id,
            WorkflowConfig.document_type == document_type,
            WorkflowConfig.approval_sequence == approval.current_sequence
        ).first()

        if not conf:
            return {"success": False, "message": "Approval routing sequence configuration out of sync"}

        if conf.approver_role != approver_role:
            return {"success": False, "message": f"Unauthorized. Current sequence requires approval from: {conf.approver_role}"}

        # Check if this is the final sequence
        max_seq = db.query(func.max(WorkflowConfig.approval_sequence)).filter(
            WorkflowConfig.company_id == company_id,
            WorkflowConfig.document_type == document_type
        ).scalar()

        approval.last_updated_by = email
        approval.last_updated_date = datetime.utcnow()

        if approval.current_sequence >= max_seq:
            approval.status = 'APPROVED'
            message = "Document fully approved"
        else:
            approval.current_sequence += 1
            message = f"Document approved at step {conf.approval_sequence}. Advanced sequence to: {approval.current_sequence}"

        db.flush()
        return {"success": True, "status": approval.status, "current_step": approval.current_sequence, "message": message}

    @staticmethod
    def reject_document(db: Session, company_id: str, document_type: str, document_id: int, approver_role: str, email: str) -> dict:
        """Rejects a document. Marks status as REJECTED immediately."""
        approval = db.query(DocumentApproval).filter(
            DocumentApproval.company_id == company_id,
            DocumentApproval.document_type == document_type,
            DocumentApproval.document_id == document_id
        ).first()

        if not approval or approval.status != 'PENDING':
            return {"success": False, "message": "No active pending approval workflow found"}

        approval.status = 'REJECTED'
        approval.last_updated_by = email
        approval.last_updated_date = datetime.utcnow()
        db.flush()

        return {"success": True, "status": "REJECTED", "message": f"Document rejected by {approver_role}."}
