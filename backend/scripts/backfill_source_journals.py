"""Idempotently link or post legacy financial source rows."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func
from sqlalchemy.orm import joinedload

from app.database import SessionLocal
from app.database.models.enterprise_finance import AccountGroup, FinanceAuditTrail, LedgerMaster, VoucherDetail, VoucherHeader
from app.database.models.payments import BankTransaction, CustomerReceivable, ExpenseVoucher, VendorPayment
from app.database.models.processing import DeHeading, Peeling, RawMaterialPurchasing
from app.services.posting_engine import PostingEngineService


ACTOR = "SYSTEM_ACCOUNTING_BACKFILL"


def ledger(db, company_id, name):
    return db.query(LedgerMaster).options(joinedload(LedgerMaster.group)).filter(
        LedgerMaster.company_id == company_id,
        func.lower(func.trim(LedgerMaster.ledger_name)) == str(name or "").strip().lower(),
        LedgerMaster.status == "ACTIVE",
    ).first()


def line_from_ledger(row, debit, credit, remarks):
    return {
        "ledger_name": row.ledger_name,
        "group_name": row.group.group_name,
        "group_type": row.group.group_type,
        "debit_amount": round(float(debit or 0), 2),
        "credit_amount": round(float(credit or 0), 2),
        "remarks": remarks,
    }


def line(name, group, group_type, debit, credit, remarks, parent=None):
    return {
        "ledger_name": name, "group_name": group, "group_type": group_type,
        "parent_group_name": parent, "debit_amount": round(float(debit or 0), 2),
        "credit_amount": round(float(credit or 0), 2), "remarks": remarks,
    }


def existing_voucher(db, company_id, reference, amount, claimed):
    if not reference:
        return None
    candidates = db.query(VoucherHeader).filter(
        VoucherHeader.company_id == company_id,
        func.lower(func.trim(func.coalesce(VoucherHeader.reference_no, ""))) == str(reference).strip().lower(),
        VoucherHeader.status == "POSTED",
    ).order_by(VoucherHeader.id.desc()).all()
    for voucher in candidates:
        if voucher.id in claimed:
            continue
        reversed_row = db.query(FinanceAuditTrail.id).filter(
            FinanceAuditTrail.company_id == company_id,
            FinanceAuditTrail.table_name == "voucher_headers",
            FinanceAuditTrail.record_id == voucher.id,
            FinanceAuditTrail.action == "REVERSE",
        ).first()
        if reversed_row:
            continue
        debit = db.query(func.coalesce(func.sum(VoucherDetail.debit_amount), 0)).filter(VoucherDetail.voucher_id == voucher.id).scalar() or 0
        if abs(float(debit) - round(float(amount or 0), 2)) <= 0.01:
            return voucher
    return None


def post_or_link(db, summary, source, module, reference, amount, voucher_type, voucher_date, narration, details, apply, claimed):
    match = existing_voucher(db, source.company_id, reference, amount, claimed)
    action = "LINK" if match else "POST"
    summary[module][action.lower()] += 1
    summary[module]["amount"] = round(summary[module]["amount"] + float(amount or 0), 2)
    if not apply:
        return
    if not match:
        match = PostingEngineService.create_voucher(
            db, source.company_id, voucher_type, voucher_date, narration, details,
            reference_no=str(reference or "")[:50] or None, created_by=ACTOR,
        )
    source.journal_id = match.id
    claimed.add(match.id)


def run(apply=False):
    db = SessionLocal()
    modules = ("raw_material", "de_heading", "peeling", "receivables", "vendor_bills", "bank_transactions", "expenses")
    summary = {name: {"link": 0, "post": 0, "amount": 0.0} for name in modules}
    summary["mode"] = "APPLY" if apply else "DRY_RUN"
    summary["duplicate_links_reset"] = {"raw_material": 0, "de_heading": 0, "peeling": 0}
    try:
        claimed_by_module = {}
        for model, module in (
            (RawMaterialPurchasing, "raw_material"),
            (DeHeading, "de_heading"),
            (Peeling, "peeling"),
        ):
            linked = db.query(model).filter(model.journal_id != None).order_by(model.id).all()
            seen = set()
            for row in linked:
                if row.journal_id in seen:
                    row.journal_id = None
                    summary["duplicate_links_reset"][module] += 1
                else:
                    seen.add(row.journal_id)
            claimed_by_module[module] = seen
        db.flush()
        for model, module in (
            (CustomerReceivable, "receivables"), (VendorPayment, "vendor_bills"),
            (BankTransaction, "bank_transactions"), (ExpenseVoucher, "expenses"),
        ):
            claimed_by_module[module] = {value for (value,) in db.query(model.journal_id).filter(model.journal_id != None).all()}

        for row in db.query(RawMaterialPurchasing).filter(
            RawMaterialPurchasing.is_cancelled != True, RawMaterialPurchasing.amount > 0,
            RawMaterialPurchasing.journal_id == None,
        ).with_for_update().all():
            amount = round(float(row.amount or 0), 2)
            details = [
                line("Raw Shrimp Purchase A/c", "Purchase Accounts", "EXPENSE", amount, 0, row.batch_number),
                line(f"{row.supplier_name} - Supplier A/c", "Sundry Creditors", "LIABILITY", 0, amount, row.batch_number, "Current Liabilities"),
            ]
            post_or_link(db, summary, row, "raw_material", row.batch_number, amount, "Purchase", row.date,
                         f"Historical raw shrimp purchase for batch {row.batch_number}", details, apply, claimed_by_module["raw_material"])

        for model, module, charge_name, contractor_field, qty_field, rate_field in (
            (DeHeading, "de_heading", "De-Heading", "contractor", "hoso_qty", "rate_per_kg"),
            (Peeling, "peeling", "Peeling", "contractor_name", "peeled_qty", "rate"),
        ):
            for row in db.query(model).filter(model.is_cancelled != True, model.amount > 0, model.journal_id == None).with_for_update().all():
                amount = round(float(row.amount or 0), 2)
                contractor = str(getattr(row, contractor_field, None) or "Processing Contractor")
                qty = float(getattr(row, qty_field, 0) or 0)
                rate = float(getattr(row, rate_field, 0) or 0)
                details = [
                    line(f"{charge_name} Charges A/c", "Direct Expenses", "EXPENSE", amount, 0, row.batch_number),
                    line(f"{contractor} - Contractor A/c", "Sundry Creditors", "LIABILITY", 0, amount, row.batch_number, "Current Liabilities"),
                ]
                post_or_link(db, summary, row, module, row.batch_number, amount, "Journal", row.date,
                             f"Historical {charge_name} charge: {qty} KG @ {rate}", details, apply, claimed_by_module[module])

        for row in db.query(CustomerReceivable).filter(
            CustomerReceivable.is_cancelled != True, CustomerReceivable.invoice_value_inr > 0,
            CustomerReceivable.journal_id == None,
        ).with_for_update().all():
            amount = round(float(row.invoice_value_inr or 0), 2)
            customer_name = row.buyer_name if str(row.buyer_name or "").lower().endswith("a/c") else f"{row.buyer_name} - Customer A/c"
            details = [
                line(customer_name, "Sundry Debtors", "ASSET", amount, 0, row.invoice_no, "Current Assets"),
                line("Export Sales A/c", "Sales Accounts", "INCOME", 0, amount, row.invoice_no),
            ]
            post_or_link(db, summary, row, "receivables", row.invoice_no, amount, "Sales", row.invoice_date,
                         f"Historical customer invoice {row.invoice_no}", details, apply, claimed_by_module["receivables"])

        for row in db.query(VendorPayment).filter(
            VendorPayment.is_cancelled != True, VendorPayment.total_amount > 0,
            VendorPayment.journal_id == None,
        ).with_for_update().all():
            total = round(float(row.total_amount or 0), 2)
            gst = round(float(row.gst_amount or 0), 2)
            tds = round(float(row.tds_amount or 0), 2)
            base = round(total - gst, 2)
            payable = round(total - tds, 2)
            vendor_name = row.vendor_name if str(row.vendor_name or "").lower().endswith("a/c") else f"{row.vendor_name} A/c"
            details = [
                line(f"{row.vendor_type} Expense A/c", "Direct Expenses", "EXPENSE", base, 0, row.bill_no),
                line(vendor_name, "Sundry Creditors", "LIABILITY", 0, payable, row.bill_no, "Current Liabilities"),
            ]
            if gst:
                details.append(line("Input GST A/c", "Duties & Taxes", "LIABILITY", gst, 0, row.bill_no, "Current Liabilities"))
            if tds:
                details.append(line("TDS Payable A/c", "Duties & Taxes", "LIABILITY", 0, tds, row.bill_no, "Current Liabilities"))
            post_or_link(db, summary, row, "vendor_bills", row.bill_no, total, "Purchase", row.bill_date,
                         f"Historical vendor bill {row.bill_no}", details, apply, claimed_by_module["vendor_bills"])

        for row in db.query(BankTransaction).filter(
            BankTransaction.is_cancelled != True,
            (BankTransaction.debit > 0) | (BankTransaction.credit > 0),
            BankTransaction.journal_id == None,
        ).with_for_update().all():
            amount = round(float(row.debit or row.credit or 0), 2)
            bank = ledger(db, row.company_id, row.bank_name)
            if not bank:
                bank = PostingEngineService.get_or_create_ledger(db, row.company_id, row.bank_name, "Bank Accounts", "ASSET", "Current Assets")
            counter = ledger(db, row.company_id, row.linked_vendor) if row.linked_vendor else None
            counter_line = (line_from_ledger(counter, 0, amount, row.reference_no) if counter else line("Bank Clearing / Suspense A/c", "Current Assets", "ASSET", 0, amount, row.reference_no))
            if float(row.debit or 0) > 0:
                details = [line_from_ledger(bank, amount, 0, row.reference_no), counter_line]
                voucher_type = "Receipt"
            else:
                counter_line["debit_amount"], counter_line["credit_amount"] = amount, 0.0
                details = [counter_line, line_from_ledger(bank, 0, amount, row.reference_no)]
                voucher_type = "Payment"
            post_or_link(db, summary, row, "bank_transactions", row.reference_no, amount, voucher_type, row.transaction_date,
                         f"Historical bank transaction {row.reference_no}", details, apply, claimed_by_module["bank_transactions"])

        for row in db.query(ExpenseVoucher).filter(
            ExpenseVoucher.is_cancelled != True, ExpenseVoucher.total_amount > 0,
            ExpenseVoucher.journal_id == None,
        ).with_for_update().all():
            total = round(float(row.total_amount or 0), 2)
            base = round(float(row.amount or 0), 2)
            gst = round(float(row.gst_amount or 0), 2)
            expense = ledger(db, row.company_id, row.expense_type)
            details = [line_from_ledger(expense, base, 0, row.voucher_no) if expense else line(row.expense_type, "Indirect Expenses", "EXPENSE", base, 0, row.voucher_no)]
            if gst:
                details.append(line("Input GST A/c", "Duties & Taxes", "LIABILITY", gst, 0, row.voucher_no, "Current Liabilities"))
            vendor = ledger(db, row.company_id, row.vendor_name) if row.vendor_name else None
            details.append(line_from_ledger(vendor, 0, total, row.voucher_no) if vendor else line("Cash Account", "Cash-in-hand", "ASSET", 0, total, row.voucher_no, "Current Assets"))
            post_or_link(db, summary, row, "expenses", row.voucher_no, total, "Journal" if vendor else "Payment", row.voucher_date,
                         f"Historical expense {row.voucher_no}", details, apply, claimed_by_module["expenses"])

        if apply:
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
