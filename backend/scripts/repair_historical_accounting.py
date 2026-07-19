"""Idempotent repair for legacy accounting cancellations and payment allocations."""

import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func

from app.database import SessionLocal
from app.database.models.enterprise_finance import BillAllocation, FinanceAuditTrail, VoucherHeader
from app.database.models.payments import PaymentReceipt, VendorPayment
from app.database.models.processing import RawMaterialPurchasing
from app.services.posting_engine import PostingEngineService


def parse_meta(narration):
    result = {"purpose": "AGAINST_OUTSTANDING", "against": ""}
    for part in str(narration or "").split("|"):
        clean = part.strip()
        if clean.startswith("Purpose:"):
            result["purpose"] = clean.split(":", 1)[1].strip().upper()
        elif clean.startswith("Against:"):
            result["against"] = clean.split(":", 1)[1].strip()
    return result


def pending_payable_sources(db, payment):
    bill_key = str(payment.vendor_bill_no or "")
    exact = db.query(VendorPayment).filter(
        VendorPayment.company_id == payment.company_id,
        VendorPayment.bill_no == bill_key,
        VendorPayment.is_cancelled != True,
    ).first()
    if exact:
        return [exact]
    vendor_name = bill_key.split("|", 2)[1] if bill_key.startswith("VENDOR|") else str(payment.party_ledger or "")
    return db.query(VendorPayment).filter(
        VendorPayment.company_id == payment.company_id,
        func.lower(func.trim(VendorPayment.vendor_name)) == vendor_name.strip().lower(),
        VendorPayment.is_cancelled != True,
    ).order_by(VendorPayment.bill_date, VendorPayment.id).all()


def proposed_allocations(db, payment):
    amount = round(float(payment.amount_inr or 0), 2)
    meta = parse_meta(payment.narration)
    if payment.transaction_type == "SUPPLIER_PAYMENT":
        if meta["purpose"] == "ADVANCE_PAYMENT":
            return [("ADVANCE", 0, meta["against"] or payment.vendor_bill_no, amount)]
        supplier = str(payment.vendor_bill_no or "").split("|", 2)[1] if str(payment.vendor_bill_no or "").startswith("SUPPLIER|") else str(payment.party_ledger or "")
        if meta["purpose"] == "AGAINST_BATCH" and meta["against"]:
            row = db.query(RawMaterialPurchasing).filter(
                RawMaterialPurchasing.company_id == payment.company_id,
                func.lower(func.trim(RawMaterialPurchasing.supplier_name)) == supplier.strip().lower(),
                func.lower(func.trim(RawMaterialPurchasing.batch_number)) == meta["against"].strip().lower(),
                RawMaterialPurchasing.is_cancelled != True,
            ).order_by(RawMaterialPurchasing.id).first()
            return [("SUPPLIER_BATCH", row.id if row else 0, meta["against"], amount)]
        rows = db.query(RawMaterialPurchasing).filter(
            RawMaterialPurchasing.company_id == payment.company_id,
            func.lower(func.trim(RawMaterialPurchasing.supplier_name)) == supplier.strip().lower(),
            RawMaterialPurchasing.is_cancelled != True,
        ).order_by(RawMaterialPurchasing.date, RawMaterialPurchasing.id).all()
        remaining = amount
        allocations = []
        for row in rows:
            already = db.query(func.coalesce(func.sum(BillAllocation.allocated_amount), 0)).filter(
                BillAllocation.company_id == payment.company_id,
                BillAllocation.source_type == "SUPPLIER_BATCH",
                BillAllocation.source_id == row.id,
                BillAllocation.is_reversed == False,
            ).scalar() or 0
            available = max(round(float(row.amount or 0) - float(already), 2), 0)
            allocated = min(remaining, available)
            if allocated > 0:
                allocations.append(("SUPPLIER_BATCH", row.id, row.batch_number or f"RMP-{row.id}", allocated))
                remaining = round(remaining - allocated, 2)
            if remaining <= 0.01:
                break
        if remaining > 0.01:
            allocations.append(("SUPPLIER_ACCOUNT", 0, payment.vendor_bill_no or supplier, remaining))
        return allocations

    if payment.transaction_type == "VENDOR_PAYMENT":
        remaining = amount
        allocations = []
        for row in pending_payable_sources(db, payment):
            already = db.query(func.coalesce(func.sum(BillAllocation.allocated_amount), 0)).filter(
                BillAllocation.company_id == payment.company_id,
                BillAllocation.source_type == "PAYABLE",
                BillAllocation.source_id == row.id,
                BillAllocation.is_reversed == False,
            ).scalar() or 0
            available = max(round(float(row.total_amount or 0) - float(already), 2), 0)
            allocated = min(remaining, available)
            if allocated > 0:
                allocations.append(("PAYABLE", row.id, row.bill_no, allocated))
                remaining = round(remaining - allocated, 2)
            if remaining <= 0.01:
                break
        if remaining > 0.01:
            allocations.append(("VENDOR_ACCOUNT", 0, payment.vendor_bill_no or payment.party_ledger, remaining))
        return allocations
    return [("ACCOUNT", 0, payment.vendor_bill_no or payment.receipt_no, amount)]


def run(apply=False):
    db = SessionLocal()
    summary = {"mode": "APPLY" if apply else "DRY_RUN", "legacy_reversals": [], "allocations": []}
    try:
        cancelled = db.query(VoucherHeader).filter(VoucherHeader.status == "CANCELLED").with_for_update().all()
        for voucher in cancelled:
            reversed_audit = db.query(FinanceAuditTrail.id).filter(
                FinanceAuditTrail.company_id == voucher.company_id,
                FinanceAuditTrail.table_name == "voucher_headers",
                FinanceAuditTrail.record_id == voucher.id,
                FinanceAuditTrail.action == "REVERSE",
            ).first()
            if reversed_audit:
                continue
            summary["legacy_reversals"].append({"voucher_id": voucher.id, "voucher_no": voucher.voucher_no})
            if apply:
                voucher.status = "POSTED"
                PostingEngineService.reverse_voucher(
                    db, voucher.company_id, voucher.id,
                    "Legacy cancellation converted to immutable contra entry",
                    "SYSTEM_ACCOUNTING_REPAIR",
                )

        payments = db.query(PaymentReceipt).filter(PaymentReceipt.is_cancelled != True).order_by(PaymentReceipt.id).all()
        for payment in payments:
            exists = db.query(BillAllocation.id).filter(
                BillAllocation.company_id == payment.company_id,
                BillAllocation.payment_receipt_id == payment.id,
                BillAllocation.is_reversed == False,
            ).first()
            if exists:
                continue
            for source_type, source_id, document_no, amount in proposed_allocations(db, payment):
                item = {
                    "payment_receipt_id": payment.id, "receipt_no": payment.receipt_no,
                    "source_type": source_type, "source_id": source_id,
                    "document_no": document_no, "amount": round(float(amount), 2),
                }
                summary["allocations"].append(item)
                if apply:
                    db.add(BillAllocation(
                        company_id=payment.company_id,
                        payment_receipt_id=payment.id,
                        source_type=source_type,
                        source_id=source_id,
                        document_no=str(document_no or payment.receipt_no),
                        allocated_amount=amount,
                        created_by="SYSTEM_ACCOUNTING_REPAIR",
                    ))
        if apply:
            db.flush()
            db.add(FinanceAuditTrail(
                company_id="VNBK2162", table_name="historical_accounting_repair", record_id=0,
                action="REPAIR", old_value=None,
                new_value=json.dumps({"reversals": len(summary["legacy_reversals"]), "allocations": len(summary["allocations"])}),
                user_email="SYSTEM_ACCOUNTING_REPAIR", timestamp=datetime.utcnow(),
            ))
            db.commit()
        else:
            db.rollback()
        print(json.dumps(summary, indent=2, default=str))
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    run(parser.parse_args().apply)
