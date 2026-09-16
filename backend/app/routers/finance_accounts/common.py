import re
import json
import logging
from datetime import date, datetime
from typing import Any, Optional
from pathlib import Path

from fastapi import APIRouter, Request, Depends, HTTPException
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, text

from app.database import get_db
from app.database.models.payments import (
    CustomerReceivable,
    VendorPayment,
    BankTransaction,
    ExpenseVoucher,
    JournalEntry,
    JournalEntryLine,
    PaymentReceipt,
)
from app.database.models.enterprise_finance import (
    LedgerMaster,
    VoucherHeader,
    AccountGroup,
    BankMaster,
    ItemAccountingLink,
    ExportIncentiveRegister,
    LCTracking,
    SalaryProcessing,
    ProductionCostAllocation,
    BillAllocation,
    ForexRevaluation,
)
from app.database.models.invoices import ExportDocumentFile
from app.database.models.processing import AuditLog
from app.database.models.attendance import EmployeeRegistration
from app.services.posting_engine import PostingEngineService
from app.services.bill_accounting import cancel_linked_bill_voucher, ensure_bill_accounting_schema

templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)
EXPORT_PDF_DIR = Path("uploads/export_documents_private")


def write_audit(db: Session, table: str, rec_id: int, company_id: str, action: str, old: str, new: str, email: str):
    audit = AuditLog(
        table_name=table,
        record_id=rec_id,
        company_id=company_id,
        field_name=action,
        old_value=old,
        new_value=new,
        edited_by=email,
        edited_at=datetime.utcnow()
    )
    db.add(audit)


def safe_filename(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", str(value or "document")).strip("_")[:120]


def store_finance_pdf(
    db: Session,
    company_id: str,
    module_name: str,
    record_id: int,
    document_no: str,
    document_kind: str,
    file_name: str,
    content: bytes,
    uploaded_by: str | None,
    remarks: str | None = None,
):
    EXPORT_PDF_DIR.mkdir(parents=True, exist_ok=True)
    for old in db.query(ExportDocumentFile).filter(
        ExportDocumentFile.company_id == company_id,
        ExportDocumentFile.module_name == module_name,
        ExportDocumentFile.record_id == record_id,
        ExportDocumentFile.document_kind == document_kind,
        ExportDocumentFile.is_current == True,
    ).all():
        old.is_current = False
    version_no = (
        db.query(func.coalesce(func.max(ExportDocumentFile.version_no), 0))
        .filter(
            ExportDocumentFile.company_id == company_id,
            ExportDocumentFile.module_name == module_name,
            ExportDocumentFile.record_id == record_id,
            ExportDocumentFile.document_kind == document_kind,
        )
        .scalar()
        + 1
    )
    final_name = f"{safe_filename(module_name)}_{safe_filename(document_no)}_v{version_no}_{safe_filename(file_name)}"
    disk_path = EXPORT_PDF_DIR / final_name
    disk_path.write_bytes(content)
    file_row = ExportDocumentFile(
        company_id=company_id,
        module_name=module_name,
        record_id=record_id,
        document_no=document_no,
        document_kind=document_kind,
        file_name=final_name,
        file_path=None,
        content_type="application/pdf",
        file_bytes=content,
        file_size=len(content),
        version_no=version_no,
        uploaded_by=uploaded_by,
        remarks=remarks,
    )
    db.add(file_row)
    db.flush()
    file_row.file_path = f"/export_documents/files/{file_row.id}/download"
    return file_row


class LedgerMasterSchema(BaseModel):
    ledger_name: str
    ledger_group: str
    ledger_type: str = "ASSET"
    gst_no: str = None
    pan_no: str = None
    state: str = None
    opening_balance: float = 0.0
    balance_type: str = "DR"
    address: str = None
    phone: str = None


class CustomerReceivableSchema(BaseModel):
    invoice_no: str
    po_number: str = None
    container_no: str = None
    buyer_ledger_id: int
    buyer_type: str = "Direct"
    country: str
    invoice_date: date
    currency: str = "USD"
    exchange_rate: float = 83.50
    invoice_value_foreign: float
    credit_days: int = 30


class VendorPaymentSchema(BaseModel):
    vendor_ledger_id: int
    vendor_type: str
    gst_no: str = None
    vendor_invoice_no: str = None
    bill_no: str
    bill_date: date
    due_date: date
    total_amount: float
    gst_amount: float = 0.0
    tds_amount: float = 0.0
    payment_mode: str = None
    transaction_no: str = None


class BankTransactionSchema(BaseModel):
    bank_ledger_id: int
    transaction_date: date
    voucher_type: str
    reference_no: str
    linked_invoice_no: str = None
    linked_vendor_ledger_id: int = None
    debit: float = 0.0
    credit: float = 0.0
    closing_balance: float


class ExpenseVoucherSchema(BaseModel):
    voucher_no: str
    voucher_date: date
    expense_ledger_id: int
    department: str
    vendor_ledger_id: int = None
    gst_percentage: float = 0.0
    gst_amount: float = 0.0
    amount: float
    total_amount: float
    approved_by: str
    payment_mode: str = "Cash"
    remarks: str = None


class JournalEntryLineSchema(BaseModel):
    ledger_id: int
    debit: float = 0.0
    credit: float = 0.0


class JournalEntrySchema(BaseModel):
    entry_no: str
    entry_date: date
    narration: str
    total_debit: float
    total_credit: float
    lines: list[JournalEntryLineSchema]


class PaymentReceiptSchema(BaseModel):
    receipt_no: str
    entry_date: date
    transaction_type: str
    party_ledger_id: int
    bank_cash_ledger_id: int
    invoice_no: str = None
    vendor_bill_no: str = None
    amount: float
    exchange_rate: float = 1.0
    amount_inr: float
    bank_charges: float = 0.0
    adjustment_amount: float = 0.0
    reference_no: str = None
    payment_mode: str
    narration: str = None
