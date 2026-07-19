from datetime import date
import re

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.database.models.enterprise_finance import AccountGroup, LedgerMaster
from app.database.models.bills import ContainerLog, DieselLog, OtherExpense, PurchaseInvoice, QATestingLog
from app.database.models.criteria import hsn_codes as HSNCode, production_at, suppliers as SupplierTable, vendors as VendorMaster
from app.database.models.general_stock import GeneralStock
from app.database.models.payments import PaymentReceipt, SupplierBatchExpense, VendorPayment
from app.database.models.processing import GateEntry, RawMaterialPurchasing
from app.database.models.users import Company
from app.services.posting_engine import PostingEngineService
from app.utils.timezone import ist_now

router = APIRouter(tags=["Payable Bills"])
templates = Jinja2Templates(directory="app/templates")


class PayablePaymentPayload(BaseModel):
    bill_key: str
    party_name: str
    bill_total: float
    amount: float
    payment_purpose: str = "AGAINST_OUTSTANDING"
    against_details: str | None = None
    payment_mode: str = "BANK"
    payment_date: date | None = None
    utr_reference: str | None = None
    bank_cash_ledger_id: int


class SupplierBatchExpensePayload(BaseModel):
    supplier_name: str
    batch_number: str
    transportation: float = 0.0
    commission: float = 0.0
    ice: float = 0.0
    others: float = 0.0
    reason: str | None = None


def current_fy() -> int:
    today = ist_now().date()
    return today.year if today.month >= 4 else today.year - 1


def month_from_date(value: date | None) -> str:
    return value.strftime("%Y-%m") if value else ""


def expense_total(row: SupplierBatchExpense | None) -> float:
    if not row or row.is_cancelled:
        return 0.0
    return round(
        float(row.transportation or 0.0)
        + float(row.commission or 0.0)
        + float(row.ice or 0.0)
        + float(row.others or 0.0),
        2,
    )


def batch_expense(db: Session, company_id: str, supplier_name: str, batch_number: str):
    return db.query(SupplierBatchExpense).filter(
        SupplierBatchExpense.company_id == company_id,
        SupplierBatchExpense.supplier_name == supplier_name,
        SupplierBatchExpense.batch_number == batch_number,
        SupplierBatchExpense.is_cancelled != True,
    ).first()


def batch_expense_dict(row: SupplierBatchExpense | None):
    return {
        "transportation": round(float(row.transportation or 0.0), 2) if row else 0.0,
        "commission": round(float(row.commission or 0.0), 2) if row else 0.0,
        "ice": round(float(row.ice or 0.0), 2) if row else 0.0,
        "others": round(float(row.others or 0.0), 2) if row else 0.0,
        "reason": row.reason or "" if row else "",
        "total": expense_total(row),
    }


def supplier_expense_total(db: Session, company_id: str, supplier_name: str, period: str):
    batch_query = db.query(RawMaterialPurchasing.batch_number).filter(
        RawMaterialPurchasing.company_id == company_id,
        RawMaterialPurchasing.supplier_name == supplier_name,
        RawMaterialPurchasing.is_cancelled != True,
    )
    if period and period != "ALL":
        batch_query = batch_query.filter(func.to_char(RawMaterialPurchasing.date, "YYYY-MM") == period)
    batch_numbers = [row[0] for row in batch_query.distinct().all() if row[0]]
    if not batch_numbers:
        return 0.0
    total = db.query(
        func.coalesce(
            func.sum(
                func.coalesce(SupplierBatchExpense.transportation, 0.0)
                + func.coalesce(SupplierBatchExpense.commission, 0.0)
                + func.coalesce(SupplierBatchExpense.ice, 0.0)
                + func.coalesce(SupplierBatchExpense.others, 0.0)
            ),
            0.0,
        )
    ).filter(
        SupplierBatchExpense.company_id == company_id,
        SupplierBatchExpense.supplier_name == supplier_name,
        SupplierBatchExpense.batch_number.in_(batch_numbers),
        SupplierBatchExpense.is_cancelled != True,
    ).scalar()
    return round(float(total or 0.0), 2)


def hsn_tax_percent(db: Session, company_id: str, hsn_code: str | None) -> float:
    if not hsn_code:
        return 0.0
    row = db.query(HSNCode).filter(
        HSNCode.company_id == company_id,
        HSNCode.hsn_code == str(hsn_code).strip(),
    ).first()
    return round(float(row.gst_percent or 0.0), 2) if row else 0.0


def rmp_tax_amount(db: Session, company_id: str, row: RawMaterialPurchasing) -> float:
    rate = hsn_tax_percent(db, company_id, row.hsn_code)
    return round(float(row.amount or 0.0) * rate / 100.0, 2)


def supplier_tax_total(db: Session, company_id: str, supplier_name: str, period: str):
    query = db.query(RawMaterialPurchasing).filter(
        RawMaterialPurchasing.company_id == company_id,
        RawMaterialPurchasing.supplier_name == supplier_name,
        RawMaterialPurchasing.is_cancelled != True,
    )
    if period and period != "ALL":
        query = query.filter(func.to_char(RawMaterialPurchasing.date, "YYYY-MM") == period)
    return round(sum(rmp_tax_amount(db, company_id, row) for row in query.all()), 2)


def bank_cash_ledgers(db: Session, company_id: str):
    return (
        db.query(LedgerMaster)
        .join(AccountGroup, LedgerMaster.group_id == AccountGroup.id)
        .filter(
            LedgerMaster.company_id == company_id,
            LedgerMaster.status == "ACTIVE",
            AccountGroup.group_name.in_(["Bank Accounts", "Cash-in-hand"]),
        )
        .order_by(AccountGroup.group_name, LedgerMaster.ledger_name)
        .all()
    )


def get_ledger_by_name(db: Session, company_id: str, ledger_name: str):
    return db.query(LedgerMaster).filter(
        LedgerMaster.company_id == company_id,
        LedgerMaster.ledger_name == ledger_name,
        LedgerMaster.status == "ACTIVE",
    ).first()


def bank_ledger(db: Session, company_id: str, ledger_id: int):
    return (
        db.query(LedgerMaster)
        .join(AccountGroup, LedgerMaster.group_id == AccountGroup.id)
        .filter(
            LedgerMaster.company_id == company_id,
            LedgerMaster.id == ledger_id,
            LedgerMaster.status == "ACTIVE",
            AccountGroup.group_name.in_(["Bank Accounts", "Cash-in-hand"]),
        )
        .first()
    )


def voucher_line(ledger, debit: float, credit: float, remarks: str):
    return {
        "ledger_name": ledger.ledger_name,
        "group_name": ledger.group.group_name if ledger.group else "Suspense Account",
        "group_type": ledger.group.group_type if ledger.group else "ASSET",
        "parent_group_name": ledger.group.parent.group_name if ledger.group and ledger.group.parent else None,
        "debit_amount": round(float(debit or 0.0), 2),
        "credit_amount": round(float(credit or 0.0), 2),
        "remarks": remarks,
    }


def clean_payment_purpose(value: str | None) -> str:
    value = (value or "AGAINST_OUTSTANDING").strip().upper()
    allowed = {"AGAINST_OUTSTANDING", "AGAINST_BATCH", "ADVANCE_PAYMENT"}
    return value if value in allowed else "AGAINST_OUTSTANDING"


def purpose_label(value: str | None) -> str:
    return {
        "AGAINST_OUTSTANDING": "Against Outstanding",
        "AGAINST_BATCH": "Against Batch",
        "ADVANCE_PAYMENT": "Advance Payment",
    }.get(clean_payment_purpose(value), "Against Outstanding")


def payment_narration(bill_key: str, purpose: str, against_details: str | None) -> str:
    against = (against_details or "").strip()
    return f"Purpose: {clean_payment_purpose(purpose)} | Against: {against or bill_key} | Payment against {bill_key}"


def parse_payment_meta(narration: str | None):
    meta = {"purpose": "Against Outstanding", "against": ""}
    text = narration or ""
    for part in [item.strip() for item in text.split("|")]:
        if part.startswith("Purpose:"):
            meta["purpose"] = purpose_label(part.split(":", 1)[1].strip())
        elif part.startswith("Against:"):
            meta["against"] = part.split(":", 1)[1].strip()
    return meta


def payment_display(row: PaymentReceipt):
    meta = parse_payment_meta(row.narration)
    return {
        "id": row.id,
        "date": row.entry_date.isoformat() if row.entry_date else "",
        "entry_date": row.entry_date,
        "amount": round(float(row.amount_inr or 0.0), 2),
        "amount_inr": round(float(row.amount_inr or 0.0), 2),
        "mode": row.payment_mode or "",
        "payment_mode": row.payment_mode or "",
        "utr": row.reference_no or "",
        "reference_no": row.reference_no or "",
        "account": row.bank_cash_ledger or "",
        "bank_cash_ledger": row.bank_cash_ledger or "",
        "purpose": meta["purpose"],
        "against": meta["against"] or row.vendor_bill_no or "",
        "status": "POSTED",
    }


def payment_history(db: Session, company_id: str, bill_key: str, transaction_type: str):
    query = db.query(PaymentReceipt).filter(
        PaymentReceipt.company_id == company_id,
        PaymentReceipt.transaction_type == transaction_type,
        PaymentReceipt.is_cancelled != True,
    )
    if transaction_type == "SUPPLIER_PAYMENT" and (bill_key or "").endswith("|ALL"):
        supplier, _ = parse_supplier_bill_key(bill_key)
        query = query.filter(PaymentReceipt.vendor_bill_no.like(f"SUPPLIER|{supplier}|%"))
    elif transaction_type == "VENDOR_PAYMENT" and (bill_key or "").startswith("VENDOR|"):
        vendor, period = parse_vendor_bill_key(bill_key)
        bill_numbers = vendor_source_bill_numbers(db, company_id, vendor, period)
        conditions = [PaymentReceipt.vendor_bill_no == bill_key, PaymentReceipt.vendor_bill_no.like(f"VENDOR|{vendor}|%")]
        if bill_numbers:
            conditions.append(PaymentReceipt.vendor_bill_no.in_(bill_numbers))
        query = query.filter(or_(*conditions))
    else:
        query = query.filter(PaymentReceipt.vendor_bill_no == bill_key)
    rows = query.order_by(PaymentReceipt.id.asc()).all()
    return [payment_display(row) for row in rows]


def vendor_bill_key(vendor_name: str, period: str) -> str:
    return f"VENDOR|{vendor_name}|{period or 'ALL'}"


def parse_vendor_bill_key(bill_key: str):
    parts = (bill_key or "").split("|", 2)
    if len(parts) != 3 or parts[0] != "VENDOR":
        return "", ""
    return parts[1], parts[2]


def vendor_bill_no(vendor_name: str, period: str) -> str:
    clean = re.sub(r"[^A-Z0-9]+", "-", (vendor_name or "VENDOR").upper()).strip("-")
    return f"VEN-{period or 'ALL'}-{clean[:18]}"


def _text_between(text: str | None, start: str, end: str | None = None) -> str:
    if not text or start not in text:
        return ""
    value = text.split(start, 1)[1]
    if end and end in value:
        value = value.split(end, 1)[0]
    return value.strip(" |")


def _same_vendor(left: str | None, right: str | None) -> bool:
    clean_left = (left or "").strip().casefold()
    clean_right = (right or "").strip().casefold()
    return bool(clean_left and clean_right and clean_left == clean_right)


def _record_matches(record: dict, vendor_name: str | None, bill_no: str | None) -> bool:
    if vendor_name and not _same_vendor(record.get("vendor_name"), vendor_name):
        return False
    if bill_no and record.get("bill_no") != bill_no:
        return False
    return True


def _manual_reference_exists(records: list[dict], record: dict) -> bool:
    refs = {
        (record.get("vendor_invoice_no") or "").strip().casefold(),
        (record.get("bill_no") or "").strip().casefold(),
    }
    refs.discard("")
    if not refs:
        return False
    for item in records:
        if item.get("source") != "Manual Vendor Bill":
            continue
        if not _same_vendor(item.get("vendor_name"), record.get("vendor_name")):
            continue
        item_refs = {
            (item.get("vendor_invoice_no") or "").strip().casefold(),
            (item.get("bill_no") or "").strip().casefold(),
        }
        if refs.intersection(item_refs):
            return True
    return False


def vendor_source_records(
    db: Session,
    company_id: str,
    month: str = "",
    vendor_name: str | None = None,
    bill_no: str | None = None,
) -> list[dict]:
    records: list[dict] = []

    manual_query = db.query(VendorPayment).filter(
        VendorPayment.company_id == company_id,
        VendorPayment.is_cancelled != True,
    )
    if month and month != "ALL":
        manual_query = manual_query.filter(func.to_char(VendorPayment.bill_date, "YYYY-MM") == month)
    for row in manual_query.all():
        record = {
            "source": "Manual Vendor Bill",
            "vendor_name": row.vendor_name or "Unknown Vendor",
            "vendor_type": row.vendor_type or "Vendor Bill",
            "gst_no": row.gst_no or "",
            "vendor_invoice_no": row.vendor_invoice_no or row.bill_no or "",
            "bill_no": row.bill_no,
            "bill_date": row.bill_date,
            "due_date": row.due_date or row.bill_date,
            "total_amount": round(float(row.total_amount or 0.0), 2),
            "gst_amount": round(float(row.gst_amount or 0.0), 2),
            "tds_amount": round(float(row.tds_amount or 0.0), 2),
            "payment_mode": row.payment_mode or "",
            "transaction_no": row.transaction_no or "",
            "status": row.status or "POSTED",
            "remarks": row.remarks or "",
        }
        if _record_matches(record, vendor_name, bill_no) and not _manual_reference_exists(records, record):
            records.append(record)

    purchase_query = (
        db.query(PurchaseInvoice, VendorMaster.name.label("vendor_name"))
        .outerjoin(VendorMaster, PurchaseInvoice.vendor_id == VendorMaster.id)
        .filter(PurchaseInvoice.company_id == company_id, PurchaseInvoice.is_cancelled != True)
    )
    if month and month != "ALL":
        purchase_query = purchase_query.filter(func.to_char(PurchaseInvoice.invoice_date, "YYYY-MM") == month)
    for inv, name in purchase_query.all():
        record = {
            "source": "Purchase Invoice",
            "vendor_name": name or f"Vendor {inv.vendor_id}",
            "vendor_type": "Purchase Invoice",
            "gst_no": "",
            "vendor_invoice_no": inv.invoice_no or "",
            "bill_no": f"PURCHASE-{inv.id}",
            "bill_date": inv.invoice_date,
            "due_date": inv.invoice_date,
            "total_amount": round(float(inv.grand_total or 0.0), 2),
            "gst_amount": round(float(inv.tax_amount or 0.0), 2),
            "tds_amount": 0.0,
            "payment_mode": "",
            "transaction_no": "",
            "status": inv.status or "POSTED",
            "remarks": f"Product: {inv.product_name or '-'} | Invoice: {inv.invoice_no or '-'}",
        }
        if _record_matches(record, vendor_name, bill_no) and not _manual_reference_exists(records, record):
            records.append(record)

    diesel_query = (
        db.query(DieselLog)
        .join(production_at, DieselLog.unit_id == production_at.id)
        .filter(
            production_at.company_id == company_id,
            DieselLog.type == "IN",
            DieselLog.is_cancelled != True,
        )
    )
    if month and month != "ALL":
        diesel_query = diesel_query.filter(func.to_char(DieselLog.bill_date, "YYYY-MM") == month)
    for row in diesel_query.all():
        if not (row.vendor or "").strip():
            continue
        taxable = round(float(row.purchase_qty or 0.0) * float(row.avg_price or 0.0), 2)
        total = round(float(row.net_val or 0.0), 2)
        record = {
            "source": "Diesel Purchase",
            "vendor_name": row.vendor,
            "vendor_type": "Diesel Purchase",
            "gst_no": "",
            "vendor_invoice_no": row.bill_no or row.grn_no or "",
            "bill_no": f"DIESEL-{row.id}",
            "bill_date": row.bill_date or row.log_date,
            "due_date": row.bill_date or row.log_date,
            "total_amount": total,
            "gst_amount": max(round(total - taxable, 2), 0.0),
            "tds_amount": 0.0,
            "payment_mode": "",
            "transaction_no": "",
            "status": row.status or "POSTED",
            "remarks": f"GRN: {row.grn_no or '-'} | Qty: {row.purchase_qty or 0} Ltr",
        }
        if _record_matches(record, vendor_name, bill_no) and not _manual_reference_exists(records, record):
            records.append(record)

    store_query = db.query(GeneralStock).filter(
        GeneralStock.company_id == company_id,
        GeneralStock.movement_type == "IN",
        GeneralStock.is_cancelled != True,
    )
    if month and month != "ALL":
        store_query = store_query.filter(func.to_char(GeneralStock.date, "YYYY-MM") == month)
    for row in store_query.all():
        if not (row.vendor_name or "").strip():
            continue
        record = {
            "source": "General Store Purchase",
            "vendor_name": row.vendor_name,
            "vendor_type": "General Store Purchase",
            "gst_no": "",
            "vendor_invoice_no": row.invoice_number or row.grn_number or "",
            "bill_no": f"GENSTORE-{row.id}",
            "bill_date": row.date,
            "due_date": row.date,
            "total_amount": round(float(row.total_amount or row.amount or 0.0), 2),
            "gst_amount": round(float(row.tax_amount or 0.0), 2),
            "tds_amount": 0.0,
            "payment_mode": "",
            "transaction_no": "",
            "status": "POSTED" if row.journal_id else "DRAFT",
            "remarks": f"GRN: {row.grn_number or '-'} | Item: {row.item_name or '-'} | HSN: {row.hsn_code or '-'}",
        }
        if _record_matches(record, vendor_name, bill_no) and not _manual_reference_exists(records, record):
            records.append(record)

    container_query = (
        db.query(ContainerLog, VendorMaster.name.label("vendor_name"))
        .outerjoin(VendorMaster, ContainerLog.vendor_id == VendorMaster.id)
        .filter(ContainerLog.company_id == company_id, ContainerLog.is_cancelled != True)
    )
    if month and month != "ALL":
        container_query = container_query.filter(func.to_char(ContainerLog.date, "YYYY-MM") == month)
    for row, name in container_query.all():
        record = {
            "source": "Container Logistics",
            "vendor_name": name or f"Shipping Vendor {row.vendor_id}",
            "vendor_type": "Container Logistics",
            "gst_no": "",
            "vendor_invoice_no": row.container_no or "",
            "bill_no": f"CONTAINER-{row.id}",
            "bill_date": row.date,
            "due_date": row.date,
            "total_amount": round(float(row.lended_total or 0.0), 2),
            "gst_amount": 0.0,
            "tds_amount": 0.0,
            "payment_mode": "",
            "transaction_no": "",
            "status": row.status or "POSTED",
            "remarks": f"PO: {row.po_number or '-'} | Container: {row.container_no or '-'}",
        }
        if _record_matches(record, vendor_name, bill_no) and not _manual_reference_exists(records, record):
            records.append(record)

    qa_query = (
        db.query(QATestingLog)
        .join(production_at, QATestingLog.unit_id == production_at.id)
        .filter(production_at.company_id == company_id, QATestingLog.is_cancelled != True)
    )
    if month and month != "ALL":
        qa_query = qa_query.filter(func.to_char(QATestingLog.test_date, "YYYY-MM") == month)
    for row in qa_query.all():
        lab_name = (row.lab_name or "").strip()
        if not lab_name or lab_name.upper() == "INHOUSE":
            continue
        record = {
            "source": "QA Testing",
            "vendor_name": lab_name,
            "vendor_type": "QA Testing",
            "gst_no": "",
            "vendor_invoice_no": row.report_ref or row.batch_no or "",
            "bill_no": f"QA-{row.id}",
            "bill_date": row.test_date,
            "due_date": row.test_date,
            "total_amount": round(float(row.test_cost or 0.0), 2),
            "gst_amount": 0.0,
            "tds_amount": 0.0,
            "payment_mode": "",
            "transaction_no": "",
            "status": row.status or "POSTED",
            "remarks": f"Batch/PO: {row.batch_no or '-'} | Parameters: {row.parameters or '-'}",
        }
        if _record_matches(record, vendor_name, bill_no) and not _manual_reference_exists(records, record):
            records.append(record)

    expense_query = (
        db.query(OtherExpense)
        .join(production_at, OtherExpense.unit_id == production_at.id)
        .filter(production_at.company_id == company_id, OtherExpense.is_cancelled != True)
    )
    if month and month != "ALL":
        expense_query = expense_query.filter(func.to_char(OtherExpense.date, "YYYY-MM") == month)
    for row in expense_query.all():
        paid_to = _text_between(row.remarks, "Paid To:", "| Voucher:") or "Unknown Vendor"
        voucher = _text_between(row.remarks, "Voucher:", "| Ledger:") or f"EXP-{row.id}"
        gst_text = _text_between(row.remarks, "GST:", "%")
        gst_rate = float(gst_text) if gst_text.replace(".", "", 1).isdigit() else 0.0
        total = round(float(row.amount or 0.0), 2)
        gst_amount = round(total - (total / (1 + gst_rate / 100.0)), 2) if gst_rate else 0.0
        record = {
            "source": "Other Expense",
            "vendor_name": paid_to,
            "vendor_type": row.category or "Other Expense",
            "gst_no": "",
            "vendor_invoice_no": voucher,
            "bill_no": f"EXPENSE-{row.id}",
            "bill_date": row.date,
            "due_date": row.date,
            "total_amount": total,
            "gst_amount": gst_amount,
            "tds_amount": 0.0,
            "payment_mode": "",
            "transaction_no": "",
            "status": row.status or "POSTED",
            "remarks": row.remarks or "",
        }
        if _record_matches(record, vendor_name, bill_no) and not _manual_reference_exists(records, record):
            records.append(record)

    return sorted(records, key=lambda item: (item.get("bill_date") or date.min, item.get("bill_no") or ""))


def vendor_source_bill_numbers(db: Session, company_id: str, vendor_name: str, period: str) -> list[str]:
    return [
        item["bill_no"]
        for item in vendor_source_records(db, company_id, period or "ALL", vendor_name=vendor_name)
        if item.get("bill_no")
    ]


def vendor_rows(db: Session, company_id: str, month: str):
    grouped: dict[str, dict] = {}
    for record in vendor_source_records(db, company_id, month or "ALL"):
        vendor = record["vendor_name"] or "Unknown Vendor"
        bucket = grouped.setdefault(vendor, {"records": [], "bill_date": record.get("bill_date")})
        bucket["records"].append(record)
        if record.get("bill_date") and (not bucket["bill_date"] or record["bill_date"] < bucket["bill_date"]):
            bucket["bill_date"] = record["bill_date"]

    result = []
    for vendor, bucket in sorted(grouped.items(), key=lambda item: item[1]["bill_date"] or date.min, reverse=True):
        records = bucket["records"]
        row_month = month or "ALL"
        bill_key = vendor_bill_key(vendor, row_month)
        history = payment_history(db, company_id, bill_key, "VENDOR_PAYMENT")
        paid = round(sum(item["amount"] for item in history), 2)
        total = round(sum(float(item["total_amount"] or 0.0) for item in records), 2)
        outstanding = max(round(total - paid, 2), 0.0)
        result.append({
            "bill_key": bill_key,
            "party_name": vendor,
            "bill_date": bucket["bill_date"].isoformat() if bucket["bill_date"] else "",
            "month_year": row_month,
            "bill_no": vendor_bill_no(vendor, row_month),
            "invoice_no": f"{len(records)} Invoices",
            "category": "Operational Vendor Bills",
            "total_amount": total,
            "paid_amount": paid,
            "outstanding": outstanding,
            "payment_status": "PAID" if outstanding <= 0.01 and total > 0 else ("PARTIAL" if paid > 0 else "UNPAID"),
            "payment_history": history,
        })
    return result


def supplier_bill_key(supplier_name: str, period: str) -> str:
    return f"SUPPLIER|{supplier_name}|{period or 'ALL'}"


def parse_supplier_bill_key(bill_key: str):
    parts = (bill_key or "").split("|", 2)
    if len(parts) != 3 or parts[0] != "SUPPLIER":
        return "", ""
    return parts[1], parts[2]


def supplier_bill_no(supplier_name: str, period: str) -> str:
    clean = re.sub(r"[^A-Z0-9]+", "-", (supplier_name or "SUPPLIER").upper()).strip("-")
    return f"SUP-{period or 'ALL'}-{clean[:18]}"


def supplier_rows(db: Session, company_id: str, month: str):
    query = db.query(
        RawMaterialPurchasing.supplier_name,
        func.min(RawMaterialPurchasing.date).label("bill_date"),
        func.coalesce(func.sum(RawMaterialPurchasing.amount), 0.0).label("total_amount"),
    ).filter(
        RawMaterialPurchasing.company_id == company_id,
        RawMaterialPurchasing.is_cancelled != True,
    )
    if month:
        query = query.filter(func.to_char(RawMaterialPurchasing.date, "YYYY-MM") == month)
    grouped = query.group_by(RawMaterialPurchasing.supplier_name).order_by(func.min(RawMaterialPurchasing.date).desc()).all()

    result = []
    for row in grouped:
        supplier = row.supplier_name or "Unknown Supplier"
        row_month = month or "ALL"
        bill_key = supplier_bill_key(supplier, row_month)
        history = payment_history(db, company_id, bill_key, "SUPPLIER_PAYMENT")
        paid = round(sum(item["amount"] for item in history), 2)
        expenses = supplier_expense_total(db, company_id, supplier, row_month)
        tax = supplier_tax_total(db, company_id, supplier, row_month)
        total = round(float(row.total_amount or 0.0) + tax + expenses, 2)
        outstanding = max(round(total - paid, 2), 0.0)
        result.append({
            "bill_key": bill_key,
            "party_name": supplier,
            "bill_date": row.bill_date.isoformat() if row.bill_date else "",
            "month_year": row_month,
            "bill_no": supplier_bill_no(supplier, row_month),
            "invoice_no": row_month if row_month != "ALL" else "All Months",
            "category": "Raw Material Supplier",
            "total_amount": total,
            "paid_amount": paid,
            "outstanding": outstanding,
            "payment_status": "PAID" if outstanding <= 0.01 and total > 0 else ("PARTIAL" if paid > 0 else "UNPAID"),
            "payment_history": history,
        })
    return result


def supplier_bill_detail_rows(db: Session, company_id: str, bill_key: str):
    supplier, period = parse_supplier_bill_key(bill_key)
    query = db.query(RawMaterialPurchasing).filter(
        RawMaterialPurchasing.company_id == company_id,
        RawMaterialPurchasing.supplier_name == supplier,
        RawMaterialPurchasing.is_cancelled != True,
    )
    if period and period != "ALL":
        query = query.filter(func.to_char(RawMaterialPurchasing.date, "YYYY-MM") == period)
    rows = query.order_by(RawMaterialPurchasing.date.desc(), RawMaterialPurchasing.id.desc()).all()
    output = [
        {
            "date": row.date.isoformat() if row.date else "",
            "bill_no": row.batch_number or f"RMP-{row.id}",
            "invoice_no": row.batch_number or "",
            "description": f"{row.species or ''} {row.variety_name or ''} {row.count or ''} HSN:{row.hsn_code or '-'} GST:{hsn_tax_percent(db, company_id, row.hsn_code):.2f}%".strip() or "Raw Material Purchase",
            "qty": round(float(row.received_qty or 0.0), 2),
            "rate": round(float(row.rate_per_kg or 0.0), 2),
            "amount": round(float(row.amount or 0.0) + rmp_tax_amount(db, company_id, row), 2),
        }
        for row in rows
    ]
    batch_numbers = sorted({row.batch_number for row in rows if row.batch_number})
    for batch_no in batch_numbers:
        exp = batch_expense(db, company_id, supplier, batch_no)
        total = expense_total(exp)
        if total > 0:
            output.append({
                "date": "",
                "bill_no": batch_no,
                "invoice_no": "",
                "description": "Batch Expenses",
                "qty": 0.0,
                "rate": 0.0,
                "amount": total,
                "is_expense": True,
            })
    return output


def company_info(db: Session, company_id: str):
    company = db.query(Company).filter(Company.company_code == company_id).first()
    if not company:
        return {"name": "BKNR ERP", "address": "", "email": "", "mpeda_registration_code": ""}
    return {
        "name": company.company_name or "",
        "address": company.address or "",
        "email": company.email or "",
        "mpeda_registration_code": company.mpeda_registration_code or "",
    }


def supplier_info(db: Session, company_id: str, supplier_name: str):
    supplier = db.query(SupplierTable).filter(
        SupplierTable.company_id == company_id,
        SupplierTable.supplier_name == supplier_name,
    ).first()
    if not supplier:
        return {"id": supplier_name, "name": supplier_name, "email": "", "phone": "", "address": ""}
    return {
        "id": supplier.id,
        "name": supplier.supplier_name or "",
        "email": supplier.supplier_email or "",
        "phone": supplier.phone or "",
        "address": supplier.address or "",
    }


def supplier_payment_rows(db: Session, company_id: str, bill_key: str):
    query = db.query(PaymentReceipt).filter(
        PaymentReceipt.company_id == company_id,
        PaymentReceipt.transaction_type == "SUPPLIER_PAYMENT",
        PaymentReceipt.is_cancelled != True,
    )
    if (bill_key or "").endswith("|ALL"):
        supplier, _ = parse_supplier_bill_key(bill_key)
        query = query.filter(PaymentReceipt.vendor_bill_no.like(f"SUPPLIER|{supplier}|%"))
    else:
        query = query.filter(PaymentReceipt.vendor_bill_no == bill_key)
    return query.order_by(PaymentReceipt.entry_date.asc(), PaymentReceipt.id.asc()).all()


def supplier_print_batches(db: Session, company_id: str, bill_key: str, batch_number: str | None = None):
    supplier, period = parse_supplier_bill_key(bill_key)
    query = db.query(RawMaterialPurchasing).filter(
        RawMaterialPurchasing.company_id == company_id,
        RawMaterialPurchasing.supplier_name == supplier,
        RawMaterialPurchasing.is_cancelled != True,
    )
    if period and period != "ALL":
        query = query.filter(func.to_char(RawMaterialPurchasing.date, "YYYY-MM") == period)
    if batch_number:
        query = query.filter(RawMaterialPurchasing.batch_number == batch_number)
    rows = query.order_by(RawMaterialPurchasing.date.asc(), RawMaterialPurchasing.id.asc()).all()
    grouped = {}
    for row in rows:
        grouped.setdefault(row.batch_number or f"RMP-{row.id}", []).append(row)

    payments = supplier_payment_rows(db, company_id, bill_key)
    if batch_number:
        payments = [
            payment for payment in payments
            if (parse_payment_meta(payment.narration).get("against") or "").strip() == batch_number
        ]
    pending_payments = list(payments)
    batches = []
    for batch_no, batch_rows in grouped.items():
        gate = db.query(GateEntry).filter(
            GateEntry.company_id == company_id,
            GateEntry.batch_number == batch_no,
        ).first()
        batch_date = gate.date if gate and gate.date else batch_rows[0].date
        attached = []
        remaining = []
        for payment in pending_payments:
            if payment.entry_date and batch_date and payment.entry_date <= batch_date:
                attached.append(payment_display(payment))
            else:
                remaining.append(payment)
        pending_payments = remaining
        expense = batch_expense(db, company_id, supplier, batch_no)
        purchase_amount = round(sum(float(item.amount or 0.0) for item in batch_rows), 2)
        for item in batch_rows:
            item.gst_percent = hsn_tax_percent(db, company_id, item.hsn_code)
            item.tax_amount = rmp_tax_amount(db, company_id, item)
            item.gross_amount = round(float(item.amount or 0.0) + item.tax_amount, 2)
        tax_amount = round(sum(float(getattr(item, "tax_amount", 0.0) or 0.0) for item in batch_rows), 2)
        expense_amount = expense_total(expense)
        batches.append({
            "batch_number": batch_no,
            "vehicle_number": gate.vehicle_number if gate else "N/A",
            "challan_number": gate.challan_number if gate else "N/A",
            "location": gate.purchasing_location if gate else (batch_rows[0].peeling_at or "N/A"),
            "date": batch_date,
            "rows": batch_rows,
            "payments": attached,
            "expense": batch_expense_dict(expense),
            "total_boxes": round(sum(float(item.material_boxes or 0.0) for item in batch_rows), 2),
            "total_quantity": round(sum(float(item.received_qty or 0.0) for item in batch_rows), 2),
            "purchase_amount": purchase_amount,
            "tax_amount": tax_amount,
            "total_amount": round(purchase_amount + tax_amount + expense_amount, 2),
        })

    purchase_total = round(sum(float(row.amount or 0.0) for row in rows), 2)
    tax_total = round(sum(rmp_tax_amount(db, company_id, row) for row in rows), 2)
    expenses_total = round(sum(batch["expense"]["total"] for batch in batches), 2)
    return {
        "supplier": supplier_info(db, company_id, supplier),
        "batches": batches,
        "unallocated_payments": [payment_display(payment) for payment in pending_payments],
        "summary": {
            "quantity": round(sum(float(row.received_qty or 0.0) for row in rows), 2),
            "purchase_amount": purchase_total,
            "tax": tax_total,
            "expenses": expenses_total,
            "amount": round(purchase_total + tax_total + expenses_total, 2),
            "paid": round(sum(float(row.amount_inr or 0.0) for row in payments), 2),
        },
    }


def vendor_bill_detail_rows(db: Session, company_id: str, bill_key: str):
    if (bill_key or "").startswith("VENDOR|"):
        vendor, period = parse_vendor_bill_key(bill_key)
        rows = vendor_source_records(db, company_id, period or "ALL", vendor_name=vendor)
    else:
        rows = vendor_source_records(db, company_id, "ALL", bill_no=bill_key)
    return [{
        "date": row["bill_date"].isoformat() if row.get("bill_date") else "",
        "bill_no": row["bill_no"],
        "invoice_no": row.get("vendor_invoice_no") or row.get("bill_no") or "",
        "description": row.get("vendor_type") or row.get("source") or "Vendor Bill",
        "qty": 1,
        "rate": round(float(row.get("total_amount") or 0.0), 2),
        "amount": round(float(row.get("total_amount") or 0.0), 2),
    } for row in rows]


def vendor_print_data(db: Session, company_id: str, bill_key: str, vendor_bill_no: str | None = None):
    if (bill_key or "").startswith("VENDOR|"):
        vendor, period = parse_vendor_bill_key(bill_key)
        bills = vendor_source_records(db, company_id, period or "ALL", vendor_name=vendor)
    else:
        bills = vendor_source_records(db, company_id, "ALL", bill_no=bill_key)
    if vendor_bill_no:
        bills = [bill for bill in bills if bill.get("bill_no") == vendor_bill_no]
    if not bills:
        return None
    payment_key = bill_key if (bill_key or "").startswith("VENDOR|") else bills[0]["bill_no"]
    payments = payment_history(db, company_id, bill_key, "VENDOR_PAYMENT")
    if vendor_bill_no:
        payments = [
            payment for payment in payments
            if (payment.get("against") or "").strip() in {vendor_bill_no, bills[0].get("vendor_invoice_no") or ""}
            or payment.get("against") == payment_key
        ]
    total = round(sum(float(bill.get("total_amount") or 0.0) for bill in bills), 2)
    gst = round(sum(float(bill.get("gst_amount") or 0.0) for bill in bills), 2)
    tds = round(sum(float(bill.get("tds_amount") or 0.0) for bill in bills), 2)
    paid = round(sum(float(item["amount"] or 0.0) for item in payments), 2)
    return {
        "vendor": bills[0],
        "bills": bills,
        "payments": payments,
        "summary": {
            "bill_amount": total,
            "gst_amount": gst,
            "tds_amount": tds,
            "paid": paid,
            "outstanding": max(round(total - paid, 2), 0.0),
            "advance": max(round(paid - total, 2), 0.0),
        },
    }


def page_response(request: Request, db: Session, bill_type: str):
    company_id = request.session.get("company_code")
    if not request.session.get("email") or not company_id:
        return RedirectResponse("/", status_code=302)
    return templates.TemplateResponse(
        request=request,
        name="bills/payable_bills.html",
        context={
            "bill_type": bill_type,
            "title": "Vendor Bills" if bill_type == "vendor" else "Supplier Bills",
            "api_base": f"/api/{bill_type}_bills",
            "selected_month": "",
            "selected_fy": current_fy(),
            "bank_cash_ledgers": bank_cash_ledgers(db, company_id),
        },
    )


@router.get("/vendor_bills/entry", response_class=HTMLResponse)
def vendor_bills_page(request: Request, db: Session = Depends(get_db)):
    return page_response(request, db, "vendor")


@router.get("/supplier_bills/entry", response_class=HTMLResponse)
def supplier_bills_page(request: Request, db: Session = Depends(get_db)):
    return page_response(request, db, "supplier")


@router.get("/vendor_bills/data")
def vendor_bills_data(request: Request, month: str = Query(default=""), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        return JSONResponse({"success": False, "message": "Session expired"}, status_code=401)
    rows = vendor_rows(db, company_id, month)
    return {"success": True, "rows": rows}


@router.get("/supplier_bills/data")
def supplier_bills_data(request: Request, month: str = Query(default=""), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        return JSONResponse({"success": False, "message": "Session expired"}, status_code=401)
    rows = supplier_rows(db, company_id, month)
    return {"success": True, "rows": rows}


@router.get("/vendor_bills/details")
def vendor_bill_details(request: Request, bill_key: str = Query(...), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        return JSONResponse({"success": False, "message": "Session expired"}, status_code=401)
    rows = vendor_bill_detail_rows(db, company_id, bill_key)
    return {"success": True, "rows": rows, "total": round(sum(row["amount"] for row in rows), 2)}


@router.get("/vendor_bills/print", response_class=HTMLResponse)
def vendor_bill_print(
    request: Request,
    bill_key: str = Query(...),
    vendor_bill_no: str = Query(default=""),
    db: Session = Depends(get_db),
):
    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/", status_code=302)
    data = vendor_print_data(db, company_id, bill_key, (vendor_bill_no or "").strip() or None)
    if not data:
        return HTMLResponse("Vendor bill not found", status_code=404)
    company = company_info(db, company_id)
    return templates.TemplateResponse(
        request=request,
        name="bills/vendor_bill_print.html",
        context={
            "bill": data["vendor"],
            "bills": data["bills"],
            "payments": data["payments"],
            "summary": data["summary"],
            "company_name": company["name"],
            "company_address": company["address"],
            "company_email": company["email"],
            "mpeda_registration_code": company["mpeda_registration_code"],
            "printed_on": ist_now(),
        },
    )


@router.get("/supplier_bills/details")
def supplier_bill_details(request: Request, bill_key: str = Query(...), db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        return JSONResponse({"success": False, "message": "Session expired"}, status_code=401)
    rows = supplier_bill_detail_rows(db, company_id, bill_key)
    return {"success": True, "rows": rows, "total": round(sum(row["amount"] for row in rows), 2)}


@router.get("/supplier_bills/print", response_class=HTMLResponse)
def supplier_bill_print(
    request: Request,
    bill_key: str = Query(...),
    batch_number: str = Query(default=""),
    db: Session = Depends(get_db),
):
    company_id = request.session.get("company_code")
    if not company_id:
        return RedirectResponse("/", status_code=302)
    data = supplier_print_batches(db, company_id, bill_key, (batch_number or "").strip() or None)
    total_amount = data["summary"]["amount"]
    paid_amount = data["summary"]["paid"]
    summary = {
        **data["summary"],
        "outstanding": max(round(total_amount - paid_amount, 2), 0.0),
        "advance": max(round(paid_amount - total_amount, 2), 0.0),
    }
    company = company_info(db, company_id)
    return templates.TemplateResponse(
        request=request,
        name="bills/supplier_bill_print.html",
        context={
            "supplier": data["supplier"],
            "batches": data["batches"],
            "unallocated_payments": data["unallocated_payments"],
            "summary": summary,
            "company_name": company["name"],
            "company_address": company["address"],
            "company_email": company["email"],
            "mpeda_registration_code": company["mpeda_registration_code"],
            "printed_on": ist_now(),
        },
    )


@router.get("/supplier_bills/batch_expense")
def get_supplier_batch_expense(
    request: Request,
    supplier_name: str = Query(...),
    batch_number: str = Query(...),
    db: Session = Depends(get_db),
):
    company_id = request.session.get("company_code")
    if not company_id:
        return JSONResponse({"success": False, "message": "Session expired"}, status_code=401)
    row = batch_expense(db, company_id, supplier_name, batch_number)
    return {"success": True, "expense": batch_expense_dict(row)}


@router.post("/supplier_bills/batch_expense")
def save_supplier_batch_expense(
    payload: SupplierBatchExpensePayload,
    request: Request,
    db: Session = Depends(get_db),
):
    company_id = request.session.get("company_code")
    if not company_id:
        return JSONResponse({"success": False, "message": "Session expired"}, status_code=401)
    supplier = (payload.supplier_name or "").strip()
    batch_no = (payload.batch_number or "").strip()
    if not supplier or not batch_no:
        return JSONResponse({"success": False, "message": "Supplier and batch number are required"}, status_code=400)
    row = batch_expense(db, company_id, supplier, batch_no)
    if not row:
        row = SupplierBatchExpense(
            company_id=company_id,
            supplier_name=supplier,
            batch_number=batch_no,
            created_by=request.session.get("email") or "SYSTEM",
        )
        db.add(row)
    row.transportation = round(float(payload.transportation or 0.0), 2)
    row.commission = round(float(payload.commission or 0.0), 2)
    row.ice = round(float(payload.ice or 0.0), 2)
    row.others = round(float(payload.others or 0.0), 2)
    row.reason = (payload.reason or "").strip() or None
    row.updated_by = request.session.get("email") or "SYSTEM"
    row.is_cancelled = False
    db.commit()
    return {"success": True, "message": "Batch expenses saved.", "expense": batch_expense_dict(row)}


def post_payable_payment(db: Session, company_id: str, email: str, payload: PayablePaymentPayload, transaction_type: str):
    if payload.amount <= 0:
        return JSONResponse({"success": False, "message": "Payment amount must be greater than zero"}, status_code=400)
    purpose = clean_payment_purpose(payload.payment_purpose)
    against_details = (payload.against_details or "").strip()
    clean_ref = (payload.utr_reference or "").strip()
    if clean_ref:
        duplicate = db.query(PaymentReceipt.id).filter(
            PaymentReceipt.company_id == company_id,
            PaymentReceipt.is_cancelled != True,
            func.upper(func.trim(func.coalesce(PaymentReceipt.reference_no, ""))) == clean_ref.upper(),
        ).first()
        if duplicate:
            return JSONResponse({"success": False, "message": "This UTR / reference is already posted."}, status_code=400)
    bank = bank_ledger(db, company_id, payload.bank_cash_ledger_id)
    if not bank:
        return JSONResponse({"success": False, "message": "Select a valid bank/cash account"}, status_code=400)
    party_ledger_name = payload.party_name if payload.party_name.lower().endswith("a/c") else (
        f"{payload.party_name} - Supplier A/c" if transaction_type == "SUPPLIER_PAYMENT" else payload.party_name
    )
    party = get_ledger_by_name(db, company_id, party_ledger_name)
    if not party:
        group_name = "Sundry Creditors"
        party = PostingEngineService.get_or_create_ledger(db, company_id, party_ledger_name, group_name, "LIABILITY", "Current Liabilities")
    paid_query = db.query(func.coalesce(func.sum(PaymentReceipt.amount_inr), 0.0)).filter(
        PaymentReceipt.company_id == company_id,
        PaymentReceipt.transaction_type == transaction_type,
        PaymentReceipt.is_cancelled != True,
    )
    if transaction_type == "SUPPLIER_PAYMENT" and (payload.bill_key or "").endswith("|ALL"):
        supplier, _ = parse_supplier_bill_key(payload.bill_key)
        paid_query = paid_query.filter(PaymentReceipt.vendor_bill_no.like(f"SUPPLIER|{supplier}|%"))
    elif transaction_type == "VENDOR_PAYMENT" and (payload.bill_key or "").startswith("VENDOR|"):
        vendor, period = parse_vendor_bill_key(payload.bill_key)
        bill_numbers = vendor_source_bill_numbers(db, company_id, vendor, period)
        conditions = [PaymentReceipt.vendor_bill_no == payload.bill_key, PaymentReceipt.vendor_bill_no.like(f"VENDOR|{vendor}|%")]
        if bill_numbers:
            conditions.append(PaymentReceipt.vendor_bill_no.in_(bill_numbers))
        paid_query = paid_query.filter(or_(*conditions))
    else:
        paid_query = paid_query.filter(PaymentReceipt.vendor_bill_no == payload.bill_key)
    paid = paid_query.scalar() or 0.0
    remaining = max(round(float(payload.bill_total or 0.0) - float(paid or 0.0), 2), 0.0)
    if purpose != "ADVANCE_PAYMENT" and payload.amount - remaining > 0.01:
        return JSONResponse({"success": False, "message": f"Payment amount cannot exceed outstanding ₹{remaining:,.2f}"}, status_code=400)

    payment_date = payload.payment_date or ist_now().date()
    receipt_no = f"{'SUPPAY' if transaction_type == 'SUPPLIER_PAYMENT' else 'VENPAY'}-{ist_now().strftime('%Y%m%d%H%M%S%f')}"
    narration = payment_narration(payload.bill_key, purpose, against_details)
    details = [
        voucher_line(party, payload.amount, 0.0, narration),
        voucher_line(bank, 0.0, payload.amount, clean_ref or narration),
    ]
    voucher = PostingEngineService.create_voucher(
        db,
        company_id,
        "Payment",
        payment_date,
        f"{transaction_type.replace('_', ' ').title()} - {payload.party_name} - {purpose_label(purpose)}",
        details,
        reference_no=clean_ref or receipt_no,
        created_by=email or "SYSTEM",
    )
    entry = PaymentReceipt(
        company_id=company_id,
        receipt_no=receipt_no,
        entry_date=payment_date,
        transaction_type=transaction_type,
        party_ledger=party.ledger_name,
        bank_cash_ledger=bank.ledger_name,
        vendor_bill_no=payload.bill_key,
        amount=payload.amount,
        exchange_rate=1.0,
        amount_inr=payload.amount,
        reference_no=clean_ref or None,
        payment_mode=payload.payment_mode,
        narration=narration,
        created_by=email or "SYSTEM",
        journal_id=voucher.id,
    )
    db.add(entry)
    db.commit()
    return {"success": True, "message": f"Payment posted: {voucher.voucher_no}", "voucher_no": voucher.voucher_no}


@router.post("/vendor_bills/payment")
def vendor_bill_payment(payload: PayablePaymentPayload, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        return JSONResponse({"success": False, "message": "Session expired"}, status_code=401)
    try:
        return post_payable_payment(db, company_id, request.session.get("email") or "SYSTEM", payload, "VENDOR_PAYMENT")
    except Exception as exc:
        db.rollback()
        return JSONResponse({"success": False, "message": f"Payment failed: {str(exc)}"}, status_code=400)


@router.post("/supplier_bills/payment")
def supplier_bill_payment(payload: PayablePaymentPayload, request: Request, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code")
    if not company_id:
        return JSONResponse({"success": False, "message": "Session expired"}, status_code=401)
    try:
        return post_payable_payment(db, company_id, request.session.get("email") or "SYSTEM", payload, "SUPPLIER_PAYMENT")
    except Exception as exc:
        db.rollback()
        return JSONResponse({"success": False, "message": f"Payment failed: {str(exc)}"}, status_code=400)
