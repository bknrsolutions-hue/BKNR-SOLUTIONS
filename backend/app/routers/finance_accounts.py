from fastapi import APIRouter, Request, Depends, Body, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import desc, func, and_, text
from datetime import date, datetime, timedelta
import io
from pathlib import Path
import re
import openpyxl
from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
import logging

from app.database import get_db
from app.database.models.payments import (
    CustomerReceivable,
    VendorPayment,
    BankTransaction,
    ExpenseVoucher,
    JournalEntry,
    JournalEntryLine,
    PaymentReceipt
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
    ProductionCostAllocation
)
from app.database.models.gst_models import GSTRegister, GSTRFilingStatus, ITCUtilization
from app.database.models.assets import FixedAssetMaster, DepreciationSchedule
from app.database.models.invoices import ExportDocumentFile
from app.services.posting_engine import PostingEngineService
from app.database.models.processing import AuditLog  # Audit trails
from app.database.models.attendance import (
    EmployeeRegistration, DailyAttendance, EmployeeSalaryAdvance, EmployeeStatutoryMaster
)

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)

EXPORT_PDF_DIR = Path("uploads/export_documents_private")


def ensure_expense_voucher_schema(db: Session) -> None:
    """Older production DBs may not yet have columns added in the ORM model."""
    try:
        db.execute(text("ALTER TABLE expense_vouchers ADD COLUMN IF NOT EXISTS journal_id INTEGER"))
        db.commit()
    except Exception as exc:
        db.rollback()
        logger.warning("Expense voucher schema check failed: %s", exc)


def safe_filename(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", str(value or "document")).strip("_")[:120]


def store_finance_pdf(db: Session, company_id: str, module_name: str, record_id: int, document_no: str, document_kind: str, file_name: str, content: bytes, uploaded_by: str | None, remarks: str | None = None):
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

# Pydantic schemas for data validation
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


class BankMasterSchema(BaseModel):
    bank_name: str
    account_number: str
    branch: str = None
    ifsc_code: str = None
    swift_code: str = None
    account_type: str = "CURRENT"
    currency_code: str = "INR"
    is_export_account: bool = False
    is_eefc_account: bool = False
    is_default: bool = False
    opening_balance: float = 0.0
    account_ledger_id: int = None
    remarks: str = None

class ItemAccountingLinkSchema(BaseModel):
    item_name: str
    species: str = None
    item_type: str = "FINISHED_GOOD"
    hsn_code: str = None
    default_gst_percent: float = 0.0
    purchase_account_id: int = None
    sales_account_id: int = None
    inventory_account_id: int = None
    cogs_account_id: int = None
    wip_account_id: int = None

class ExportIncentiveRegisterSchema(BaseModel):
    incentive_type: str
    invoice_no: str
    shipping_bill_no: str = None
    shipping_bill_date: date = None
    port: str = None
    fob_value_inr: float
    rate_percent: float
    incentive_amount: float
    scrip_no: str = None
    scrip_value: float = 0.0
    status: str = "PENDING"
    sanction_date: date = None
    utilization_date: date = None
    expiry_date: date = None
    receivable_ledger_id: int = None
    income_ledger_id: int = None
    remarks: str = None

class LCTrackingSchema(BaseModel):
    lc_number: str
    lc_reference: str = None
    issuing_bank: str
    advising_bank: str
    negotiating_bank: str = None
    lc_amount: float
    currency_code: str = "USD"
    utilized_amount: float = 0.0
    balance_amount: float = 0.0
    lc_issue_date: date = None
    expiry_date: date
    latest_shipment_date: date
    presentation_period_days: int = 21
    lc_type: str = "SIGHT"
    docs_required: str = None
    buyer_name: str = None
    customer_ledger_id: int = None
    linked_invoice_nos: str = None
    status: str = "OPEN"
    remarks: str = None

class SalaryProcessingSchema(BaseModel):
    month_year: str
    employee_id: str
    employee_name: str
    designation: str = None
    department: str = None
    production_at: str = None
    present_days: float = 0.0
    absent_days: float = 0.0
    ot_hours: float = 0.0
    ot_amount: float = 0.0
    salary_adjustment: float = 0.0
    basic_salary: float = 0.0
    hra: float = 0.0
    conveyance_allowance: float = 0.0
    special_allowance: float = 0.0
    other_earnings: float = 0.0
    gross_salary: float = 0.0
    pf_employee: float = 0.0
    esi_employee: float = 0.0
    professional_tax: float = 0.0
    tds_salary: float = 0.0
    advance_deduction: float = 0.0
    lwf_employee: float = 0.0
    other_deductions: float = 0.0
    total_deductions: float = 0.0
    pf_employer: float = 0.0
    esi_employer: float = 0.0
    lwf_employer: float = 0.0
    net_payable: float = 0.0
    payment_mode: str = "BANK"
    payment_status: str = "UNPAID"
    status: str = "DRAFT"

class ProductionCostAllocationSchema(BaseModel):
    batch_number: str
    production_date: date
    production_at: str = None
    species: str = None
    input_qty_kg: float = 0.0
    output_qty_kg: float = 0.0
    yield_percent: float = 0.0
    process_loss_kg: float = 0.0
    raw_material_cost: float = 0.0
    labour_cost: float = 0.0
    power_cost: float = 0.0
    ice_cost: float = 0.0
    water_cost: float = 0.0
    packing_material_cost: float = 0.0
    chemical_cost: float = 0.0
    cold_storage_cost: float = 0.0
    other_cost: float = 0.0
    total_cost: float = 0.0
    cost_per_kg: float = 0.0
    wip_ledger_id: int = None
    cost_center_id: int = None
    status: str = "OPEN"

class GSTRegisterSchema(BaseModel):
    transaction_type: str
    invoice_no: str
    invoice_date: date
    party_name: str = None
    gstin: str = None
    state_code: str = None
    hsn_code: str = None
    description: str = None
    taxable_value: float = 0.0
    igst_rate: float = 0.0
    cgst_rate: float = 0.0
    sgst_rate: float = 0.0
    is_export: bool = False
    is_rcm: bool = False
    lut_number: str = None
    period_month: str

class GSTRFilingStatusSchema(BaseModel):
    return_type: str
    period_month: str
    total_output_tax: float = 0.0
    total_input_credit: float = 0.0
    gst_paid_amount: float = 0.0
    status: str = "PENDING"
    filing_date: date = None
    arn_number: str = None
    remarks: str = None

class ITCUtilizationSchema(BaseModel):
    period_month: str
    gst_type: str
    opening_itc: float = 0.0
    itc_earned: float = 0.0
    itc_reversed: float = 0.0
    itc_utilized: float = 0.0

class FixedAssetSchema(BaseModel):
    asset_code: str
    asset_name: str
    asset_category: str
    purchase_date: date
    purchase_cost: float
    purchase_invoice_no: str = None
    location: str = None
    department: str = None
    depreciation_method: str = "WDV"
    dep_rate_percent: float
    useful_life_years: int = None
    salvage_value: float = 0.0
    asset_ledger_id: int = None
    acc_dep_ledger_id: int = None
    dep_expense_ledger_id: int = None
    status: str = "ACTIVE"
    remarks: str = None

class DepreciationRunSchema(BaseModel):
    period_month: str
    run_date: date = None


# Helper function to audit actions
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

def ledger_detail(db: Session, company_id: str, ledger_id: int = None, ledger_name: str = None, group_name: str = None, group_type: str = None, parent_group_name: str = None) -> dict:
    ledger = None
    if ledger_id:
        ledger = db.query(LedgerMaster).filter(LedgerMaster.company_id == company_id, LedgerMaster.id == ledger_id).first()
    if ledger:
        return {
            "ledger_name": ledger.ledger_name,
            "group_name": ledger.group.group_name if ledger.group else (group_name or "Suspense Account"),
            "group_type": ledger.group.group_type if ledger.group else (group_type or "ASSET"),
        }
    return {
        "ledger_name": ledger_name,
        "group_name": group_name,
        "group_type": group_type,
        "parent_group_name": parent_group_name,
    }

def amount_line(db: Session, company_id: str, debit: float, credit: float, remarks: str, ledger_id: int = None, ledger_name: str = None, group_name: str = None, group_type: str = None, parent_group_name: str = None) -> dict:
    detail = ledger_detail(db, company_id, ledger_id, ledger_name, group_name, group_type, parent_group_name)
    detail.update({"debit_amount": round(debit or 0.0, 2), "credit_amount": round(credit or 0.0, 2), "remarks": remarks})
    return detail


def cancel_linked_voucher(db: Session, company_id: str, journal_id: int | None, email: str) -> None:
    if not journal_id:
        return
    voucher = db.query(VoucherHeader).filter(
        VoucherHeader.id == journal_id,
        VoucherHeader.company_id == company_id,
    ).first()
    if voucher and voucher.status != "CANCELLED":
        old_status = voucher.status
        voucher.status = "CANCELLED"
        PostingEngineService.write_finance_audit(
            db,
            company_id,
            "voucher_headers",
            voucher.id,
            "CANCEL",
            {"status": old_status},
            {"status": "CANCELLED"},
            email or "SYSTEM",
        )


SALARY_EARNING_FIELDS = (
    "basic_salary", "hra", "conveyance_allowance", "special_allowance", "ot_amount", "other_earnings",
)
SALARY_MONTHLY_EARNING_FIELDS = (
    "basic_salary", "hra", "conveyance_allowance", "special_allowance", "other_earnings",
)
SALARY_DEDUCTION_FIELDS = (
    "pf_employee", "esi_employee", "professional_tax", "tds_salary", "advance_deduction",
    "lwf_employee", "other_deductions",
)


def calculate_salary_totals(values) -> dict:
    def amount(field: str) -> float:
        raw = values.get(field, 0.0) if isinstance(values, dict) else getattr(values, field, 0.0)
        value = round(float(raw or 0.0), 2)
        if value < 0:
            raise ValueError(f"{field.replace('_', ' ').title()} cannot be negative")
        return value

    present_days = amount("present_days")
    monthly_earnings = sum(amount(field) for field in SALARY_MONTHLY_EARNING_FIELDS)
    earned_monthly_salary = round(monthly_earnings * present_days / 26.0, 2)
    raw_adjustment = values.get("salary_adjustment", 0.0) if isinstance(values, dict) else getattr(values, "salary_adjustment", 0.0)
    salary_adjustment = round(float(raw_adjustment or 0.0), 2)
    calculated_salary = round(earned_monthly_salary + amount("ot_amount"), 2)
    gross_salary = round(calculated_salary + salary_adjustment, 2)
    if gross_salary < 0:
        raise ValueError("Salary adjustment cannot make gross salary negative")
    fixed_deductions = round(sum(
        amount(field) for field in SALARY_DEDUCTION_FIELDS if field != "advance_deduction"
    ), 2)
    if fixed_deductions > gross_salary:
        raise ValueError("Statutory and other deductions cannot exceed gross salary")
    advance_deduction = min(amount("advance_deduction"), round(gross_salary - fixed_deductions, 2))
    total_deductions = round(fixed_deductions + advance_deduction, 2)
    return {
        "gross_salary": gross_salary,
        "calculated_salary": calculated_salary,
        "salary_adjustment": salary_adjustment,
        "earned_monthly_salary": earned_monthly_salary,
        "advance_deduction": advance_deduction,
        "total_deductions": total_deductions,
        "net_payable": round(gross_salary - total_deductions, 2),
    }

def account_lookup(
    db: Session,
    company_id: str,
    ledger_id: int | None,
    group_types: set[str] | None = None,
    group_names: set[str] | None = None,
) -> LedgerMaster | None:
    if not ledger_id:
        return None
    ledger = db.query(LedgerMaster).filter(
        LedgerMaster.id == ledger_id,
        LedgerMaster.company_id == company_id,
        LedgerMaster.status == "ACTIVE",
    ).first()
    if not ledger or not ledger.group:
        return None
    if group_types and ledger.group.group_type not in group_types:
        return None
    if group_names and ledger.group.group_name not in group_names:
        return None
    return ledger

# ============================================================
# 1. LEDGER MASTER
# ============================================================
@router.get("/ledger_master/entry", response_class=HTMLResponse)
def ledger_master_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    for group_name, group_type in [
        ("Sundry Debtors", "ASSET"),
        ("Sundry Creditors", "LIABILITY"),
        ("Bank Accounts", "ASSET"),
        ("Cash-in-hand", "ASSET"),
        ("Direct Expenses", "EXPENSE"),
        ("Indirect Expenses", "EXPENSE"),
        ("Sales Accounts", "INCOME"),
        ("Purchase Accounts", "EXPENSE"),
        ("Duties & Taxes", "LIABILITY"),
        ("Stock-in-hand", "ASSET"),
        ("Fixed Assets", "ASSET"),
    ]:
        PostingEngineService.get_or_create_group(db, comp_code, group_name, group_type)
    db.commit()
    history = db.query(LedgerMaster).options(joinedload(LedgerMaster.group)).filter(LedgerMaster.company_id == comp_code).order_by(LedgerMaster.ledger_name).all()
    groups = db.query(AccountGroup).filter(AccountGroup.company_id == comp_code).order_by(AccountGroup.group_name).all()
    return templates.TemplateResponse(request=request, name="finance_accounts/ledger_master.html", context={"history": history, "groups": groups, "company_id": comp_code})

@router.post("/ledger_master/save")
def ledger_master_save(request: Request, payload: LedgerMasterSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    exists = db.query(LedgerMaster).filter(LedgerMaster.company_id == comp_code, LedgerMaster.ledger_name == payload.ledger_name).first()
    if exists: return JSONResponse({"success": False, "message": "Ledger already exists"}, status_code=400)

    group = PostingEngineService.get_or_create_group(db, comp_code, payload.ledger_group, payload.ledger_type)
    entry = LedgerMaster(
        company_id=comp_code,
        ledger_name=payload.ledger_name,
        group_id=group.id,
        opening_balance=payload.opening_balance,
        opening_balance_type=payload.balance_type,
        gstin=payload.gst_no,
        pan=payload.pan_no,
        address=payload.address,
        phone=payload.phone,
        status="ACTIVE",
        created_by=email or "SYSTEM",
    )
    db.add(entry)
    db.flush()
    write_audit(db, "ledger_master", entry.id, comp_code, "CREATE", "NONE", f"Ledger Created: {payload.ledger_name}", email)
    db.commit()
    return {"success": True, "message": "Ledger master entry saved successfully"}

@router.post("/ledger_master/delete/{log_id}")
def ledger_master_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(LedgerMaster).filter(LedgerMaster.id == log_id, LedgerMaster.company_id == comp_code).first()
    if entry:
        write_audit(db, "ledger_master", entry.id, comp_code, "DELETE", f"Ledger: {entry.ledger_name}", "DELETED", email)
        db.delete(entry)
        db.commit()
        return {"success": True, "message": "Ledger deleted successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)


# ============================================================
# 2. CUSTOMER RECEIVABLE
# ============================================================
@router.get("/customer_receivable/entry", response_class=HTMLResponse)
def customer_receivable_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(CustomerReceivable).filter(CustomerReceivable.company_id == comp_code, CustomerReceivable.is_cancelled != True).order_by(desc(CustomerReceivable.invoice_date)).all()
    ledgers = db.query(LedgerMaster).options(joinedload(LedgerMaster.group)).join(AccountGroup).filter(LedgerMaster.company_id == comp_code, LedgerMaster.status == "ACTIVE", AccountGroup.group_type == "ASSET").order_by(LedgerMaster.ledger_name).all()
    return templates.TemplateResponse(request=request, name="finance_accounts/customer_receivable.html", context={"history": history, "ledgers": ledgers, "company_id": comp_code})

@router.post("/customer_receivable/save")
def customer_receivable_save(request: Request, payload: CustomerReceivableSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    buyer_ledger = account_lookup(db, comp_code, payload.buyer_ledger_id, group_types={"ASSET"})
    if not buyer_ledger:
        return JSONResponse({"success": False, "message": "Select a valid customer ledger"}, status_code=400)
    exists = db.query(CustomerReceivable).filter(CustomerReceivable.company_id == comp_code, CustomerReceivable.invoice_no == payload.invoice_no).first()
    if exists: return JSONResponse({"success": False, "message": "Invoice already registered"}, status_code=400)
    
    inr_value = payload.invoice_value_foreign * payload.exchange_rate
    due = payload.invoice_date + timedelta(days=payload.credit_days) if getattr(payload, 'invoice_date', None) else date.today()
    
    entry = CustomerReceivable(
        company_id=comp_code,
        invoice_no=payload.invoice_no,
        po_number=payload.po_number,
        container_no=payload.container_no,
        buyer_name=buyer_ledger.ledger_name,
        buyer_type=payload.buyer_type,
        country=payload.country,
        invoice_date=payload.invoice_date,
        currency=payload.currency,
        exchange_rate=payload.exchange_rate,
        invoice_value_foreign=payload.invoice_value_foreign,
        invoice_value_inr=inr_value,
        balance_amount=inr_value,
        credit_days=payload.credit_days,
        due_date=due,
        created_by=email
    )
    db.add(entry)
    db.flush()
    voucher = PostingEngineService.create_voucher(
        db,
        comp_code,
        "Sales",
        payload.invoice_date,
        f"Customer invoice {payload.invoice_no}",
        [
            amount_line(db, comp_code, inr_value, 0.0, payload.invoice_no, ledger_id=buyer_ledger.id),
            amount_line(db, comp_code, 0.0, inr_value, payload.invoice_no, ledger_name="Export Sales A/c", group_name="Sales Accounts", group_type="INCOME"),
        ],
        reference_no=payload.invoice_no,
        created_by=email or "SYSTEM",
    )
    entry.journal_id = voucher.id
    write_audit(db, "customer_receivables", entry.id, comp_code, "CREATE", "NONE", f"Invoice Added: {payload.invoice_no} (Value: ₹{inr_value})", email)
    db.commit()
    return {"success": True, "message": "Customer receivable recorded successfully"}

@router.post("/customer_receivable/delete/{log_id}")
def customer_receivable_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(CustomerReceivable).filter(CustomerReceivable.id == log_id, CustomerReceivable.company_id == comp_code).first()
    if entry:
        cancel_linked_voucher(db, comp_code, entry.journal_id, email)
        write_audit(db, "customer_receivables", entry.id, comp_code, "is_cancelled", "False", "True", email)
        entry.is_cancelled = True
        db.commit()
        return {"success": True, "message": "Receivable cancelled successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)

@router.get("/customer_receivables", response_class=JSONResponse)
def get_customer_receivables_history(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code:
        return JSONResponse(status_code=401, content={"success": False, "message": "Unauthorized"})
    history = db.query(CustomerReceivable).filter(CustomerReceivable.company_id == comp_code, CustomerReceivable.is_cancelled != True).order_by(desc(CustomerReceivable.invoice_date)).all()
    history_data = [
        {
            "id": row.id,
            "invoice_no": row.invoice_no,
            "po_number": row.po_number,
            "buyer_name": row.buyer_name,
            "country": row.country,
            "invoice_date": row.invoice_date.isoformat() if row.invoice_date else None,
            "invoice_value_inr": row.invoice_value_inr,
            "balance_amount": row.balance_amount,
            "due_date": row.due_date.isoformat() if row.due_date else None,
            "payment_status": row.payment_status,
        } for row in history
    ]
    return {"success": True, "data": history_data}


# ============================================================
# 3. VENDOR PAYMENT
# ============================================================
@router.get("/vendor_payment/entry", response_class=HTMLResponse)
def vendor_payment_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(VendorPayment).filter(VendorPayment.company_id == comp_code, VendorPayment.is_cancelled != True).order_by(desc(VendorPayment.bill_date)).all()
    ledgers = db.query(LedgerMaster).options(joinedload(LedgerMaster.group)).join(AccountGroup).filter(LedgerMaster.company_id == comp_code, LedgerMaster.status == "ACTIVE", AccountGroup.group_type == "LIABILITY").order_by(LedgerMaster.ledger_name).all()
    return templates.TemplateResponse(request=request, name="finance_accounts/vendor_payment.html", context={"history": history, "ledgers": ledgers, "company_id": comp_code})

@router.post("/vendor_payment/save")
def vendor_payment_save(request: Request, payload: VendorPaymentSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    vendor_ledger = account_lookup(db, comp_code, payload.vendor_ledger_id, group_types={"LIABILITY"})
    if not vendor_ledger:
        return JSONResponse({"success": False, "message": "Select a valid vendor ledger"}, status_code=400)
    exists = db.query(VendorPayment).filter(VendorPayment.company_id == comp_code, VendorPayment.bill_no == payload.bill_no).first()
    if exists: return JSONResponse({"success": False, "message": "Voucher bill number already exists"}, status_code=400)
    
    balance = payload.total_amount
    if payload.total_amount <= 0 or payload.gst_amount < 0 or payload.tds_amount < 0:
        return JSONResponse({"success": False, "message": "Amounts must be valid positive values"}, status_code=400)
    if payload.gst_amount > payload.total_amount or payload.tds_amount > payload.total_amount:
        return JSONResponse({"success": False, "message": "GST/TDS cannot exceed the bill total"}, status_code=400)
    entry = VendorPayment(
        company_id=comp_code,
        vendor_name=vendor_ledger.ledger_name,
        vendor_type=payload.vendor_type,
        gst_no=payload.gst_no,
        vendor_invoice_no=payload.vendor_invoice_no,
        bill_no=payload.bill_no,
        bill_date=payload.bill_date,
        due_date=payload.due_date,
        total_amount=payload.total_amount,
        gst_amount=payload.gst_amount,
        tds_amount=payload.tds_amount,
        balance=balance,
        payment_mode=payload.payment_mode,
        transaction_no=payload.transaction_no,
        created_by=email
    )
    db.add(entry)
    db.flush()
    expense_amount = payload.total_amount - payload.gst_amount
    vendor_credit = payload.total_amount - payload.tds_amount
    details = [
        amount_line(db, comp_code, expense_amount, 0.0, payload.bill_no, ledger_name=f"{payload.vendor_type} Expense A/c", group_name="Direct Expenses", group_type="EXPENSE"),
        amount_line(db, comp_code, 0.0, vendor_credit, payload.bill_no, ledger_id=vendor_ledger.id),
    ]
    if payload.gst_amount:
        details.append(amount_line(db, comp_code, payload.gst_amount, 0.0, payload.bill_no, ledger_name="Input GST A/c", group_name="Duties & Taxes", group_type="LIABILITY"))
    if payload.tds_amount:
        details.append(amount_line(db, comp_code, 0.0, payload.tds_amount, payload.bill_no, ledger_name="TDS Payable A/c", group_name="Duties & Taxes", group_type="LIABILITY"))
    voucher = PostingEngineService.create_voucher(
        db, comp_code, "Purchase", payload.bill_date, f"Vendor bill {payload.bill_no}", details,
        reference_no=payload.bill_no, created_by=email or "SYSTEM",
    )
    entry.journal_id = voucher.id
    write_audit(db, "vendor_payments", entry.id, comp_code, "CREATE", "NONE", f"Bill Added: {payload.bill_no} (Total: ₹{payload.total_amount})", email)
    db.commit()
    return {"success": True, "message": "Vendor payment recorded successfully"}

@router.post("/vendor_payment/delete/{log_id}")
def vendor_payment_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(VendorPayment).filter(VendorPayment.id == log_id, VendorPayment.company_id == comp_code).first()
    if entry:
        cancel_linked_voucher(db, comp_code, entry.journal_id, email)
        write_audit(db, "vendor_payments", entry.id, comp_code, "is_cancelled", "False", "True", email)
        entry.is_cancelled = True
        db.commit()
        return {"success": True, "message": "Vendor bill cancelled successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)

@router.get("/vendor_payments", response_class=JSONResponse)
def get_vendor_payments_history(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code:
        return JSONResponse(status_code=401, content={"success": False, "message": "Unauthorized"})
    history = db.query(VendorPayment).filter(VendorPayment.company_id == comp_code, VendorPayment.is_cancelled != True).order_by(desc(VendorPayment.bill_date)).all()
    history_data = [
        {
            "id": row.id,
            "vendor_name": row.vendor_name,
            "vendor_type": row.vendor_type,
            "bill_no": row.bill_no,
            "bill_date": row.bill_date.isoformat() if row.bill_date else None,
            "total_amount": row.total_amount,
            "gst_amount": row.gst_amount,
            "tds_amount": row.tds_amount,
            "balance": row.balance,
            "status": row.status,
        } for row in history
    ]
    return {"success": True, "data": history_data}


# ============================================================
# 4. BANK TRANSACTION
# ============================================================
@router.get("/bank_transaction/entry", response_class=HTMLResponse)
def bank_transaction_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(BankTransaction).filter(BankTransaction.company_id == comp_code, BankTransaction.is_cancelled != True).order_by(desc(BankTransaction.transaction_date)).all()
    ledgers = db.query(LedgerMaster).options(joinedload(LedgerMaster.group)).join(AccountGroup).filter(LedgerMaster.company_id == comp_code, LedgerMaster.status == "ACTIVE").order_by(LedgerMaster.ledger_name).all()
    return templates.TemplateResponse(request=request, name="finance_accounts/bank_transaction.html", context={"history": history, "ledgers": ledgers, "company_id": comp_code})

@router.post("/bank_transaction/save")
def bank_transaction_save(request: Request, payload: BankTransactionSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    bank_ledger = account_lookup(db, comp_code, payload.bank_ledger_id, group_names={"Bank Accounts", "Cash-in-hand"})
    vendor_ledger = account_lookup(db, comp_code, payload.linked_vendor_ledger_id, group_types={"LIABILITY"})
    if not bank_ledger:
        return JSONResponse({"success": False, "message": "Select a valid bank/cash ledger"}, status_code=400)
    if payload.linked_vendor_ledger_id and not vendor_ledger:
        return JSONResponse({"success": False, "message": "Select a valid linked vendor ledger"}, status_code=400)
    if payload.debit < 0 or payload.credit < 0 or (payload.debit > 0 and payload.credit > 0) or (payload.debit == 0 and payload.credit == 0):
        return JSONResponse({"success": False, "message": "Enter either a positive debit or a positive credit"}, status_code=400)
    exists = db.query(BankTransaction).filter(BankTransaction.company_id == comp_code, BankTransaction.reference_no == payload.reference_no).first()
    if exists: return JSONResponse({"success": False, "message": "Reference Transaction number already mapped"}, status_code=400)
    
    entry = BankTransaction(
        company_id=comp_code,
        bank_name=bank_ledger.ledger_name,
        transaction_date=payload.transaction_date,
        voucher_type=payload.voucher_type,
        reference_no=payload.reference_no,
        linked_invoice_no=payload.linked_invoice_no,
        linked_vendor=vendor_ledger.ledger_name if vendor_ledger else None,
        debit=payload.debit,
        credit=payload.credit,
        closing_balance=payload.closing_balance,
        created_by=email
    )
    db.add(entry)
    db.flush()
    counterpart = (
        ledger_detail(db, comp_code, ledger_id=vendor_ledger.id)
        if vendor_ledger
        else ledger_detail(
            db,
            comp_code,
            ledger_name="Bank Clearing / Suspense A/c",
            group_name="Current Assets",
            group_type="ASSET",
        )
    )
    amount = float(payload.debit or payload.credit)
    if payload.debit > 0:
        details = [
            amount_line(db, comp_code, amount, 0.0, payload.reference_no, ledger_id=bank_ledger.id),
            {**counterpart, "debit_amount": 0.0, "credit_amount": amount, "remarks": payload.reference_no},
        ]
        voucher_type = "Receipt"
    else:
        details = [
            {**counterpart, "debit_amount": amount, "credit_amount": 0.0, "remarks": payload.reference_no},
            amount_line(db, comp_code, 0.0, amount, payload.reference_no, ledger_id=bank_ledger.id),
        ]
        voucher_type = "Payment"
    voucher = PostingEngineService.create_voucher(
        db, comp_code, voucher_type, payload.transaction_date, f"Bank transaction {payload.reference_no}", details,
        reference_no=payload.reference_no, created_by=email or "SYSTEM",
    )
    entry.journal_id = voucher.id
    write_audit(db, "bank_transactions", entry.id, comp_code, "CREATE", "NONE", f"Transaction Ref: {payload.reference_no}", email)
    db.commit()
    return {"success": True, "message": "Bank transaction registered successfully"}

@router.post("/bank_transaction/delete/{log_id}")
def bank_transaction_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(BankTransaction).filter(BankTransaction.id == log_id, BankTransaction.company_id == comp_code).first()
    if entry:
        cancel_linked_voucher(db, comp_code, entry.journal_id, email)
        write_audit(db, "bank_transactions", entry.id, comp_code, "is_cancelled", "False", "True", email)
        entry.is_cancelled = True
        db.commit()
        return {"success": True, "message": "Transaction trace cancelled successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)


# ============================================================
# 5. EXPENSE VOUCHER
# ============================================================
@router.get("/expense_voucher/entry", response_class=HTMLResponse)
def expense_voucher_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    ensure_expense_voucher_schema(db)
    history = db.query(
        ExpenseVoucher.id,
        ExpenseVoucher.voucher_no,
        ExpenseVoucher.voucher_date,
        ExpenseVoucher.expense_type,
        ExpenseVoucher.department,
        ExpenseVoucher.vendor_name,
        ExpenseVoucher.gst_percentage,
        ExpenseVoucher.gst_amount,
        ExpenseVoucher.amount,
        ExpenseVoucher.total_amount,
        ExpenseVoucher.payment_mode,
        ExpenseVoucher.status,
    ).filter(ExpenseVoucher.company_id == comp_code, ExpenseVoucher.is_cancelled != True).order_by(desc(ExpenseVoucher.voucher_date)).all()
    ledgers = db.query(LedgerMaster).options(joinedload(LedgerMaster.group)).join(AccountGroup).filter(LedgerMaster.company_id == comp_code, LedgerMaster.status == "ACTIVE").order_by(LedgerMaster.ledger_name).all()
    return templates.TemplateResponse(request=request, name="finance_accounts/expense_voucher.html", context={"history": history, "ledgers": ledgers, "company_id": comp_code})

@router.post("/expense_voucher/save")
def expense_voucher_save(request: Request, payload: ExpenseVoucherSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    ensure_expense_voucher_schema(db)
    
    expense_ledger = account_lookup(db, comp_code, payload.expense_ledger_id, group_types={"EXPENSE"})
    vendor_ledger = account_lookup(db, comp_code, payload.vendor_ledger_id, group_types={"LIABILITY"})
    if not expense_ledger:
        return JSONResponse({"success": False, "message": "Select a valid expense ledger"}, status_code=400)
    if payload.vendor_ledger_id and not vendor_ledger:
        return JSONResponse({"success": False, "message": "Select a valid vendor ledger"}, status_code=400)
    if payload.amount <= 0 or payload.gst_amount < 0 or abs((payload.amount + payload.gst_amount) - payload.total_amount) > 0.01:
        return JSONResponse({"success": False, "message": "Total must equal amount plus GST"}, status_code=400)
    exists = db.query(ExpenseVoucher).filter(ExpenseVoucher.company_id == comp_code, ExpenseVoucher.voucher_no == payload.voucher_no).first()
    if exists: return JSONResponse({"success": False, "message": "Voucher number already allocated"}, status_code=400)
    
    entry = ExpenseVoucher(
        company_id=comp_code,
        voucher_no=payload.voucher_no,
        voucher_date=payload.voucher_date,
        expense_type=expense_ledger.ledger_name,
        department=payload.department,
        vendor_name=vendor_ledger.ledger_name if vendor_ledger else None,
        gst_percentage=payload.gst_percentage,
        gst_amount=payload.gst_amount,
        amount=payload.amount,
        total_amount=payload.total_amount,
        approved_by=payload.approved_by,
        payment_mode=payload.payment_mode,
        remarks=payload.remarks
    )
    db.add(entry)
    db.flush()
    credit_ledger = vendor_ledger
    details = [
        amount_line(db, comp_code, payload.amount, 0.0, payload.voucher_no, ledger_id=expense_ledger.id),
    ]
    if payload.gst_amount:
        details.append(amount_line(db, comp_code, payload.gst_amount, 0.0, payload.voucher_no, ledger_name="Input GST A/c", group_name="Duties & Taxes", group_type="LIABILITY"))
    if credit_ledger:
        details.append(amount_line(db, comp_code, 0.0, payload.total_amount, payload.voucher_no, ledger_id=credit_ledger.id))
        voucher_type = "Journal"
    else:
        details.append(amount_line(db, comp_code, 0.0, payload.total_amount, payload.voucher_no, ledger_name="Cash Account", group_name="Cash-in-hand", group_type="ASSET", parent_group_name="Current Assets"))
        voucher_type = "Payment"
    voucher = PostingEngineService.create_voucher(
        db, comp_code, voucher_type, payload.voucher_date, payload.remarks or f"Expense {payload.voucher_no}", details,
        reference_no=payload.voucher_no, created_by=email or "SYSTEM",
    )
    entry.journal_id = voucher.id
    write_audit(db, "expense_vouchers", entry.id, comp_code, "CREATE", "NONE", f"Voucher: {payload.voucher_no} (Amt: ₹{payload.total_amount})", email)
    db.commit()
    return {"success": True, "message": "Expense voucher registered successfully"}

@router.post("/expense_voucher/delete/{log_id}")
def expense_voucher_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    ensure_expense_voucher_schema(db)
    entry = db.query(ExpenseVoucher).filter(ExpenseVoucher.id == log_id, ExpenseVoucher.company_id == comp_code).first()
    if entry:
        cancel_linked_voucher(db, comp_code, entry.journal_id, email)
        write_audit(db, "expense_vouchers", entry.id, comp_code, "is_cancelled", "False", "True", email)
        entry.is_cancelled = True
        db.commit()
        return {"success": True, "message": "Voucher cancelled successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)


# ============================================================
# 6. JOURNAL ENTRY
# ============================================================
@router.get("/journal_entry/entry", response_class=HTMLResponse)
def journal_entry_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(JournalEntry).filter(JournalEntry.company_id == comp_code, JournalEntry.is_cancelled != True).order_by(desc(JournalEntry.entry_date)).all()
    ledgers = db.query(LedgerMaster).options(joinedload(LedgerMaster.group)).filter(LedgerMaster.company_id == comp_code, LedgerMaster.status == "ACTIVE").order_by(LedgerMaster.ledger_name).all()
    return templates.TemplateResponse(request=request, name="finance_accounts/journal_entry.html", context={"history": history, "ledgers": ledgers, "company_id": comp_code})

@router.post("/journal_entry/save")
def journal_entry_save(request: Request, payload: JournalEntrySchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    if len(payload.lines) < 2 or abs(payload.total_debit - payload.total_credit) > 0.01:
         return JSONResponse({"success": False, "message": "Debit and Credit totals must match"}, status_code=400)
    if payload.total_debit <= 0 or any(
        line.debit < 0 or line.credit < 0
        or (line.debit > 0 and line.credit > 0)
        or (line.debit == 0 and line.credit == 0)
        for line in payload.lines
    ):
        return JSONResponse({"success": False, "message": "Each journal line requires either a positive debit or credit"}, status_code=400)
    calculated_debit = sum(line.debit for line in payload.lines)
    calculated_credit = sum(line.credit for line in payload.lines)
    if abs(calculated_debit - payload.total_debit) > 0.01 or abs(calculated_credit - payload.total_credit) > 0.01:
        return JSONResponse({"success": False, "message": "Journal line totals do not match header totals"}, status_code=400)

    ledger_ids = {line.ledger_id for line in payload.lines}
    ledger_map = {
        ledger.id: ledger for ledger in db.query(LedgerMaster).filter(
            LedgerMaster.company_id == comp_code,
            LedgerMaster.status == "ACTIVE",
            LedgerMaster.id.in_(ledger_ids),
        ).all()
    }
    if len(ledger_map) != len(ledger_ids):
        return JSONResponse({"success": False, "message": "One or more selected ledgers are invalid"}, status_code=400)
         
    exists = db.query(JournalEntry).filter(JournalEntry.company_id == comp_code, JournalEntry.entry_no == payload.entry_no).first()
    if exists: return JSONResponse({"success": False, "message": "Journal Entry Number already exists"}, status_code=400)
    
    entry = JournalEntry(
        company_id=comp_code,
        entry_no=payload.entry_no,
        entry_date=payload.entry_date,
        narration=payload.narration,
        total_debit=payload.total_debit,
        total_credit=payload.total_credit,
        created_by=email
    )
    db.add(entry)
    db.flush()
    
    # Save ledger lines
    for line in payload.lines:
        db_line = JournalEntryLine(
            entry_no=entry.entry_no,
            ledger_name=ledger_map[line.ledger_id].ledger_name,
            debit=line.debit,
            credit=line.credit
        )
        db.add(db_line)

    voucher_details = [
        amount_line(
            db, comp_code, line.debit, line.credit, payload.entry_no,
            ledger_id=ledger_map[line.ledger_id].id,
        )
        for line in payload.lines
    ]
    voucher = PostingEngineService.create_voucher(
        db, comp_code, "Journal", payload.entry_date, payload.narration, voucher_details,
        reference_no=payload.entry_no, created_by=email or "SYSTEM",
    )
    entry.journal_id = voucher.id
    write_audit(db, "journal_entries", entry.id, comp_code, "CREATE", "NONE", f"Journal Entry Saved: {payload.entry_no}", email)
    db.commit()
    return {"success": True, "message": "Journal Entry posted successfully"}

@router.post("/journal_entry/delete/{log_id}")
def journal_entry_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(JournalEntry).filter(JournalEntry.id == log_id, JournalEntry.company_id == comp_code).first()
    if entry:
        cancel_linked_voucher(db, comp_code, entry.journal_id, email)
        write_audit(db, "journal_entries", entry.id, comp_code, "is_cancelled", "False", "True", email)
        entry.is_cancelled = True
        db.commit()
        return {"success": True, "message": "Journal Entry cancelled successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)


# ============================================================
# 7. PAYMENT RECEIPT
# ============================================================
@router.get("/payment_receipt/entry", response_class=HTMLResponse)
def payment_receipt_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(PaymentReceipt).filter(PaymentReceipt.company_id == comp_code, PaymentReceipt.is_cancelled != True).order_by(desc(PaymentReceipt.entry_date)).all()
    ledgers = db.query(LedgerMaster).options(joinedload(LedgerMaster.group)).filter(LedgerMaster.company_id == comp_code, LedgerMaster.status == "ACTIVE").order_by(LedgerMaster.ledger_name).all()
    return templates.TemplateResponse(request=request, name="finance_accounts/payment_receipt.html", context={"history": history, "ledgers": ledgers, "company_id": comp_code})

@router.post("/payment_receipt/save")
def payment_receipt_save(request: Request, payload: PaymentReceiptSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    party_ledger = account_lookup(db, comp_code, payload.party_ledger_id)
    bank_cash_ledger = account_lookup(db, comp_code, payload.bank_cash_ledger_id, group_names={"Bank Accounts", "Cash-in-hand"})
    if not party_ledger or not bank_cash_ledger:
        return JSONResponse({"success": False, "message": "Select valid party and bank/cash ledgers"}, status_code=400)
    if payload.amount_inr <= 0 or payload.bank_charges < 0 or payload.adjustment_amount < 0:
        return JSONResponse({"success": False, "message": "Receipt/payment amounts must be valid positive values"}, status_code=400)
    exists = db.query(PaymentReceipt).filter(PaymentReceipt.company_id == comp_code, PaymentReceipt.receipt_no == payload.receipt_no).first()
    if exists: return JSONResponse({"success": False, "message": "Voucher Receipt Number already registered"}, status_code=400)
    
    entry = PaymentReceipt(
        company_id=comp_code,
        receipt_no=payload.receipt_no,
        entry_date=payload.entry_date,
        transaction_type=payload.transaction_type,
        party_ledger=party_ledger.ledger_name,
        bank_cash_ledger=bank_cash_ledger.ledger_name,
        invoice_no=payload.invoice_no,
        vendor_bill_no=payload.vendor_bill_no,
        amount=payload.amount,
        exchange_rate=payload.exchange_rate,
        amount_inr=payload.amount_inr,
        bank_charges=payload.bank_charges,
        adjustment_amount=payload.adjustment_amount,
        reference_no=payload.reference_no,
        payment_mode=payload.payment_mode,
        narration=payload.narration,
        created_by=email
    )
    db.add(entry)
    db.flush()
    settlement_total = payload.amount_inr + payload.bank_charges + payload.adjustment_amount
    if payload.transaction_type == "VENDOR_PAYMENT":
        details = [
            amount_line(db, comp_code, payload.amount_inr, 0.0, payload.receipt_no, ledger_id=party_ledger.id),
            amount_line(db, comp_code, 0.0, settlement_total, payload.receipt_no, ledger_id=bank_cash_ledger.id),
        ]
        voucher_type = "Payment"
    else:
        details = [
            amount_line(db, comp_code, payload.amount_inr, 0.0, payload.receipt_no, ledger_id=bank_cash_ledger.id),
            amount_line(db, comp_code, 0.0, settlement_total, payload.receipt_no, ledger_id=party_ledger.id),
        ]
        voucher_type = "Receipt"
    if payload.bank_charges:
        details.append(amount_line(db, comp_code, payload.bank_charges, 0.0, payload.receipt_no, ledger_name="Bank Charges A/c", group_name="Indirect Expenses", group_type="EXPENSE"))
    if payload.adjustment_amount:
        details.append(amount_line(db, comp_code, payload.adjustment_amount, 0.0, payload.receipt_no, ledger_name="Settlement Adjustments A/c", group_name="Indirect Expenses", group_type="EXPENSE"))
    voucher = PostingEngineService.create_voucher(
        db, comp_code, voucher_type, payload.entry_date, payload.narration or payload.receipt_no, details,
        reference_no=payload.reference_no or payload.receipt_no, created_by=email or "SYSTEM",
    )
    entry.journal_id = voucher.id
    write_audit(db, "payment_receipts", entry.id, comp_code, "CREATE", "NONE", f"Receipt: {payload.receipt_no}", email)
    db.commit()
    return {"success": True, "message": "Payment receipt registered successfully"}

@router.post("/payment_receipt/delete/{log_id}")
def payment_receipt_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(PaymentReceipt).filter(PaymentReceipt.id == log_id, PaymentReceipt.company_id == comp_code).first()
    if entry:
        cancel_linked_voucher(db, comp_code, entry.journal_id, email)
        write_audit(db, "payment_receipts", entry.id, comp_code, "is_cancelled", "False", "True", email)
        entry.is_cancelled = True
        db.commit()
        return {"success": True, "message": "Receipt cancelled successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)


# ============================================================
# 8. BANK MASTER
# ============================================================
@router.get("/bank_master/entry", response_class=HTMLResponse)
def bank_master_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(BankMaster).filter(BankMaster.company_id == comp_code).all()
    ledgers = db.query(LedgerMaster).filter(LedgerMaster.company_id == comp_code).all()
    return templates.TemplateResponse(request=request, name="finance_accounts/bank_master.html", context={"history": history, "ledgers": ledgers, "company_id": comp_code})

@router.post("/bank_master/save")
def bank_master_save(request: Request, payload: BankMasterSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    # Check duplicate account number
    exists = db.query(BankMaster).filter(BankMaster.company_id == comp_code, BankMaster.account_number == payload.account_number).first()
    if exists: return JSONResponse({"success": False, "message": "Bank account already registered"}, status_code=400)
    
    entry = BankMaster(company_id=comp_code, created_by=email, **payload.dict())
    db.add(entry)
    db.flush()
    write_audit(db, "bank_masters", entry.id, comp_code, "CREATE", "NONE", f"Bank: {payload.bank_name} A/C: {payload.account_number}", email)
    db.commit()
    return {"success": True, "message": "Bank master saved successfully"}

@router.post("/bank_master/delete/{log_id}")
def bank_master_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(BankMaster).filter(BankMaster.id == log_id, BankMaster.company_id == comp_code).first()
    if entry:
        write_audit(db, "bank_masters", entry.id, comp_code, "DELETE", f"Bank: {entry.bank_name}", "DELETED", email)
        db.delete(entry)
        db.commit()
        return {"success": True, "message": "Bank account deleted successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)


# ============================================================
# 9. ITEM ACCOUNTING LINK
# ============================================================
@router.get("/item_accounting_link/entry", response_class=HTMLResponse)
def item_accounting_link_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(ItemAccountingLink).options(
        joinedload(ItemAccountingLink.purchase_account),
        joinedload(ItemAccountingLink.sales_account),
        joinedload(ItemAccountingLink.inventory_account),
        joinedload(ItemAccountingLink.cogs_account),
        joinedload(ItemAccountingLink.wip_account),
    ).filter(ItemAccountingLink.company_id == comp_code).all()
    ledgers = db.query(LedgerMaster).filter(LedgerMaster.company_id == comp_code).all()
    return templates.TemplateResponse(request=request, name="finance_accounts/item_accounting_link.html", context={"history": history, "ledgers": ledgers, "company_id": comp_code})

@router.post("/item_accounting_link/save")
def item_accounting_link_save(request: Request, payload: ItemAccountingLinkSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    exists = db.query(ItemAccountingLink).filter(ItemAccountingLink.company_id == comp_code, ItemAccountingLink.item_name == payload.item_name).first()
    if exists:
        # Update existing mapping
        for k, v in payload.dict().items():
            setattr(exists, k, v)
        write_audit(db, "item_accounting_links", exists.id, comp_code, "UPDATE", f"Item: {payload.item_name}", "UPDATED", email)
    else:
        # Create new mapping
        entry = ItemAccountingLink(company_id=comp_code, created_by=email, **payload.dict())
        db.add(entry)
        db.flush()
        write_audit(db, "item_accounting_links", entry.id, comp_code, "CREATE", "NONE", f"Item: {payload.item_name}", email)
        
    db.commit()
    return {"success": True, "message": "Item accounting links updated successfully"}

@router.post("/item_accounting_link/delete/{log_id}")
def item_accounting_link_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(ItemAccountingLink).filter(ItemAccountingLink.id == log_id, ItemAccountingLink.company_id == comp_code).first()
    if entry:
        write_audit(db, "item_accounting_links", entry.id, comp_code, "DELETE", f"Item: {entry.item_name}", "DELETED", email)
        db.delete(entry)
        db.commit()
        return {"success": True, "message": "Item accounting link deleted successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)


# ============================================================
# 10. EXPORT INCENTIVE REGISTER
# ============================================================
@router.get("/export_incentive_register/entry", response_class=HTMLResponse)
def export_incentive_register_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(ExportIncentiveRegister).filter(ExportIncentiveRegister.company_id == comp_code, ExportIncentiveRegister.is_cancelled != True).all()
    ledgers = db.query(LedgerMaster).filter(LedgerMaster.company_id == comp_code).all()
    return templates.TemplateResponse(request=request, name="finance_accounts/export_incentive_register.html", context={"history": history, "ledgers": ledgers, "company_id": comp_code})

@router.post("/export_incentive_register/save")
def export_incentive_register_save(request: Request, payload: ExportIncentiveRegisterSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    exists = db.query(ExportIncentiveRegister).filter(
        ExportIncentiveRegister.company_id == comp_code, 
        ExportIncentiveRegister.invoice_no == payload.invoice_no,
        ExportIncentiveRegister.incentive_type == payload.incentive_type
    ).first()
    if exists: return JSONResponse({"success": False, "message": "Incentive already registered for this invoice"}, status_code=400)
    
    entry = ExportIncentiveRegister(company_id=comp_code, created_by=email, **payload.dict())
    db.add(entry)
    db.flush()
    write_audit(db, "export_incentive_register", entry.id, comp_code, "CREATE", "NONE", f"Incentive Type: {payload.incentive_type} Inv: {payload.invoice_no}", email)
    db.commit()
    return {"success": True, "message": "Export incentive recorded successfully"}

@router.post("/export_incentive_register/delete/{log_id}")
def export_incentive_register_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(ExportIncentiveRegister).filter(ExportIncentiveRegister.id == log_id, ExportIncentiveRegister.company_id == comp_code).first()
    if entry:
        write_audit(db, "export_incentive_register", entry.id, comp_code, "is_cancelled", "False", "True", email)
        entry.is_cancelled = True
        db.commit()
        return {"success": True, "message": "Incentive record cancelled successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)


# ============================================================
# 11. LETTER OF CREDIT (LC) TRACKING
# ============================================================
@router.get("/lc_tracking/entry", response_class=HTMLResponse)
def lc_tracking_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(LCTracking).filter(LCTracking.company_id == comp_code, LCTracking.is_cancelled != True).all()
    ledgers = db.query(LedgerMaster).filter(LedgerMaster.company_id == comp_code).all()
    return templates.TemplateResponse(request=request, name="finance_accounts/lc_tracking.html", context={"history": history, "ledgers": ledgers, "company_id": comp_code})

@router.post("/lc_tracking/save")
def lc_tracking_save(request: Request, payload: LCTrackingSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    exists = db.query(LCTracking).filter(LCTracking.company_id == comp_code, LCTracking.lc_number == payload.lc_number).first()
    if exists:
        # Update existing
        for k, v in payload.dict().items():
            setattr(exists, k, v)
        write_audit(db, "lc_tracking", exists.id, comp_code, "UPDATE", f"LC: {payload.lc_number}", "UPDATED", email)
    else:
        # Create new
        entry = LCTracking(company_id=comp_code, created_by=email, **payload.dict())
        db.add(entry)
        db.flush()
        write_audit(db, "lc_tracking", entry.id, comp_code, "CREATE", "NONE", f"LC: {payload.lc_number}", email)
        
    db.commit()
    return {"success": True, "message": "LC record saved successfully"}

@router.post("/lc_tracking/delete/{log_id}")
def lc_tracking_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(LCTracking).filter(LCTracking.id == log_id, LCTracking.company_id == comp_code).first()
    if entry:
        write_audit(db, "lc_tracking", entry.id, comp_code, "is_cancelled", "False", "True", email)
        entry.is_cancelled = True
        db.commit()
        return {"success": True, "message": "LC record cancelled successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)


@router.post("/lc_tracking/upload_pdf/{log_id}")
async def lc_tracking_upload_pdf(
    log_id: int,
    request: Request,
    file: UploadFile = File(...),
    document_kind: str = Form("LC_COPY"),
    remarks: str = Form(None),
    db: Session = Depends(get_db),
):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    entry = db.query(LCTracking).filter(LCTracking.id == log_id, LCTracking.company_id == comp_code).first()
    if not entry:
        return JSONResponse({"success": False, "message": "LC record not found"}, status_code=404)
    if file.content_type != "application/pdf" and not file.filename.lower().endswith(".pdf"):
        return JSONResponse({"success": False, "message": "Only PDF files are allowed"}, status_code=400)
    content = await file.read()
    if not content:
        return JSONResponse({"success": False, "message": "Empty PDF file"}, status_code=400)
    file_row = store_finance_pdf(
        db=db,
        company_id=comp_code,
        module_name="lc_tracking",
        record_id=entry.id,
        document_no=entry.lc_number,
        document_kind=document_kind,
        file_name=file.filename or f"{entry.lc_number}.pdf",
        content=content,
        uploaded_by=email,
        remarks=remarks,
    )
    write_audit(db, "lc_tracking", entry.id, comp_code, "PDF_UPLOAD", "NONE", file_row.file_path, email)
    db.commit()
    return {"success": True, "message": "LC PDF copy saved in DB", "file_id": file_row.id, "file_path": file_row.file_path}


# ============================================================
# 12. SALARY PROCESSING
# ============================================================
@router.get("/salary_processing/entry", response_class=HTMLResponse)
def salary_processing_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(SalaryProcessing).filter(
        SalaryProcessing.company_id == comp_code
    ).order_by(desc(SalaryProcessing.month_year), SalaryProcessing.employee_name).all()
    for row in history:
        try:
            totals = calculate_salary_totals(row)
        except ValueError:
            continue
        db.expunge(row)
        row.gross_salary = totals["gross_salary"]
        row.advance_deduction = totals["advance_deduction"]
        row.total_deductions = totals["total_deductions"]
        row.net_payable = totals["net_payable"]
    audit_history = db.query(AuditLog).filter(
        AuditLog.company_id == comp_code,
        AuditLog.table_name == "salary_processing",
    ).order_by(desc(AuditLog.edited_at)).limit(100).all()
    ledgers = db.query(LedgerMaster).filter(LedgerMaster.company_id == comp_code).all()
    return templates.TemplateResponse(request=request, name="finance_accounts/salary_processing.html", context={"history": history, "audit_history": audit_history, "ledgers": ledgers, "company_id": comp_code})


@router.get("/salary_processing/employees")
def salary_processing_employees(request: Request, db: Session = Depends(get_db)):
    """Return list of active employees for dropdown in salary processing form."""
    comp_code = request.session.get("company_code")
    if not comp_code:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    employees = db.query(
        EmployeeRegistration.employee_id,
        EmployeeRegistration.employee_name,
        EmployeeRegistration.designation,
        EmployeeRegistration.department,
        EmployeeRegistration.production_at
    ).filter(
        EmployeeRegistration.company_id == comp_code,
        EmployeeRegistration.status == "ACTIVE"
    ).order_by(EmployeeRegistration.employee_name).all()
    return {
        "success": True,
        "employees": [
            {"employee_id": e.employee_id, "employee_name": e.employee_name,
             "designation": e.designation or "", "department": e.department or "",
             "production_at": e.production_at or ""}
            for e in employees
        ]
    }


@router.get("/salary_processing/employee_data/{employee_id}")
def salary_processing_employee_data(employee_id: str, month_year: str = None, request: Request = None, db: Session = Depends(get_db)):
    """Return employee salary structure for auto-fill. Priority:
    1. Exact month match in salary_processing → return full record (all fields + attendance)
    2. Latest salary_processing record for this employee → copy salary structure; attendance from DailyAttendance
    3. Employee master defaults (basic, HRA, etc.); attendance from DailyAttendance
    Attendance (present/absent/OT) always pulled live from daily_attendance for the selected month.
    """
    comp_code = request.session.get("company_code")
    if not comp_code:
        return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)

    emp = db.query(EmployeeRegistration).filter(
        EmployeeRegistration.employee_id == employee_id,
        EmployeeRegistration.company_id == comp_code
    ).first()
    if not emp:
        return JSONResponse({"success": False, "message": "Employee not found"}, status_code=404)

    # ── Live Attendance Aggregation from daily_attendance ────────────────────
    # Always pull fresh attendance for the selected month (if month_year given)
    att_present = 0.0
    att_absent  = 0.0
    att_ot_hrs  = 0.0
    att_ot_amt  = 0.0
    advance_ded = 0.0
    has_attendance = False
    period_start = None
    period_end = None

    if month_year:
        # month_year format: "2026-06" → filter duty_date between first and last day
        try:
            yr, mo = int(month_year.split("-")[0]), int(month_year.split("-")[1])
            from datetime import date as _date
            import calendar
            first_day = _date(yr, mo, 1)
            last_day  = _date(yr, mo, calendar.monthrange(yr, mo)[1])
            period_start, period_end = first_day, last_day

            att_rows = db.query(DailyAttendance).filter(
                DailyAttendance.employee_id == employee_id,
                DailyAttendance.company_id == comp_code,
                DailyAttendance.duty_date >= first_day,
                DailyAttendance.duty_date <= last_day
            ).all()
            has_attendance = bool(att_rows)

            for row in att_rows:
                s = (row.duty_status or "").upper()
                if s in ("APPROVED", "PRESENT", "CLOSED"):
                    att_present += 1.0
                elif s in ("ABSENT",):
                    att_absent += 1.0
                # Count approved OT; fall back to calculated_ot_hours
                ot_h = row.approved_ot_hours or row.calculated_ot_hours or 0.0
                att_ot_hrs += ot_h

            # Salary advance: active advance monthly_deduction for this employee
            adv = db.query(EmployeeSalaryAdvance).filter(
                EmployeeSalaryAdvance.employee_id == employee_id,
                EmployeeSalaryAdvance.company_id == comp_code,
                EmployeeSalaryAdvance.status == "APPROVED",
                EmployeeSalaryAdvance.remaining_balance > 0,
                EmployeeSalaryAdvance.deduct_from <= month_year,
            ).filter(
                (EmployeeSalaryAdvance.deduct_to == None) |
                (EmployeeSalaryAdvance.deduct_to >= month_year)
            ).all()
            advance_ded = round(sum(
                min(float(a.monthly_deduction or 0.0), float(a.remaining_balance or 0.0))
                for a in adv
            ), 2)

        except Exception:
            pass  # If any parsing fails, leave at 0

    # ── Priority 1: Exact month match → use salary from record, attendance live ──
    if month_year:
        exact = db.query(SalaryProcessing).filter(
            SalaryProcessing.company_id == comp_code,
            SalaryProcessing.employee_id == employee_id,
            SalaryProcessing.month_year == month_year
        ).first()
        if exact:
            # Use saved attendance if live data has 0 rows (attendance not yet entered)
            p_days = att_present if has_attendance else exact.present_days
            a_days = att_absent if has_attendance else exact.absent_days
            ot_h = att_ot_hrs if has_attendance else exact.ot_hours
            adv_d = advance_ded if period_start else exact.advance_deduction
            exact_values = {
                field: getattr(exact, field, 0.0)
                for field in SALARY_EARNING_FIELDS + SALARY_DEDUCTION_FIELDS
            }
            exact_values["present_days"] = p_days
            exact_values["salary_adjustment"] = exact.salary_adjustment or 0.0
            exact_values["advance_deduction"] = adv_d
            totals = calculate_salary_totals(exact_values)
            return {
                "success": True, "source": "existing",
                "source_month": exact.month_year,
                "employee_name": exact.employee_name,
                "designation": exact.designation or "",
                "department": exact.department or "",
                "production_at": exact.production_at or "",
                "present_days": p_days,
                "absent_days":  a_days,
                "ot_hours":     ot_h,
                "ot_amount":    exact.ot_amount,
                "salary_adjustment": totals["salary_adjustment"],
                "calculated_salary": totals["calculated_salary"],
                "basic_salary": exact.basic_salary,
                "hra": exact.hra,
                "conveyance_allowance": exact.conveyance_allowance,
                "special_allowance": exact.special_allowance,
                "other_earnings": exact.other_earnings,
                "gross_salary": totals["gross_salary"],
                "pf_employee": exact.pf_employee,
                "esi_employee": exact.esi_employee,
                "professional_tax": exact.professional_tax,
                "tds_salary": exact.tds_salary,
                "advance_deduction": totals["advance_deduction"],
                "lwf_employee": exact.lwf_employee,
                "other_deductions": exact.other_deductions,
                "total_deductions": totals["total_deductions"],
                "net_payable": totals["net_payable"],
                "pf_employer": exact.pf_employer,
                "esi_employer": exact.esi_employer,
                "lwf_employer": exact.lwf_employer,
                "payment_mode": exact.payment_mode,
                "status": exact.status,
            }

    # ── Priority 2: Latest salary record (any month) → salary structure + live att ─
    latest = db.query(SalaryProcessing).filter(
        SalaryProcessing.company_id == comp_code,
        SalaryProcessing.employee_id == employee_id
    ).order_by(desc(SalaryProcessing.month_year)).first()

    if latest:
        basic    = latest.basic_salary or 0.0
        hra      = latest.hra or 0.0
        conveyance = latest.conveyance_allowance or 0.0
        special  = latest.special_allowance or 0.0
        other_earn = latest.other_earnings or 0.0
        ot_amount = 0.0
        gross    = basic + hra + conveyance + special + ot_amount + other_earn
        pf_emp   = latest.pf_employee or round(basic * 0.12, 2)
        esi_emp  = latest.esi_employee or (round(gross * 0.0075, 2) if gross <= 21000 else 0.0)
        pt       = latest.professional_tax or 0.0
        tds      = latest.tds_salary or 0.0
        lwf      = latest.lwf_employee or 0.0
        totals = calculate_salary_totals({
            "present_days": att_present,
            "salary_adjustment": 0.0,
            "basic_salary": basic, "hra": hra, "conveyance_allowance": conveyance,
            "special_allowance": special, "ot_amount": ot_amount, "other_earnings": other_earn,
            "pf_employee": pf_emp, "esi_employee": esi_emp, "professional_tax": pt,
            "tds_salary": tds, "advance_deduction": advance_ded, "lwf_employee": lwf,
            "other_deductions": latest.other_deductions or 0.0,
        })

        return {
            "success": True, "source": "salary_table",
            "source_month": latest.month_year,
            "employee_name": latest.employee_name,
            "designation": latest.designation or emp.designation or "",
            "department":  latest.department  or emp.department  or "",
            "production_at": latest.production_at or emp.production_at or "",
            # Live attendance from daily_attendance
            "present_days": att_present,
            "absent_days":  att_absent,
            "ot_hours":     att_ot_hrs,
            "ot_amount":    ot_amount,
            "salary_adjustment": 0.0,
            "calculated_salary": totals["calculated_salary"],
            # Salary structure from latest record
            "basic_salary": basic,
            "hra": hra,
            "conveyance_allowance": conveyance,
            "special_allowance": special,
            "other_earnings": other_earn,
            "gross_salary": totals["gross_salary"],
            "pf_employee": pf_emp,
            "esi_employee": esi_emp,
            "professional_tax": pt,
            "tds_salary": tds,
            "advance_deduction": totals["advance_deduction"],
            "lwf_employee": lwf,
            "other_deductions": latest.other_deductions or 0.0,
            "total_deductions": totals["total_deductions"],
            "net_payable": totals["net_payable"],
            "pf_employer": latest.pf_employer or 0.0,
            "esi_employer": latest.esi_employer or 0.0,
            "lwf_employer": latest.lwf_employer or 0.0,
            "payment_mode": latest.payment_mode or "BANK",
            "status": "DRAFT",
        }

    # ── Priority 3: Employee master defaults + live attendance ───────────────
    basic    = emp.basic_salary or 0.0
    hra      = emp.hra or 0.0
    conveyance = emp.conveyance_allowance or 0.0
    other_earn = emp.other_expenses or 0.0
    gross = basic + hra + conveyance + other_earn
    effective_date = period_end or date.today()
    statutory = db.query(EmployeeStatutoryMaster).filter(
        EmployeeStatutoryMaster.employee_id == employee_id,
        EmployeeStatutoryMaster.company_id == comp_code,
        EmployeeStatutoryMaster.status == "ACTIVE",
        EmployeeStatutoryMaster.applicable_from <= effective_date,
    ).filter(
        (EmployeeStatutoryMaster.applicable_to == None) |
        (EmployeeStatutoryMaster.applicable_to >= effective_date)
    ).order_by(desc(EmployeeStatutoryMaster.applicable_from)).first()

    pf_emp = esi_emp = pt = lwf = pf_employer = esi_employer = lwf_employer = 0.0
    if statutory:
        if statutory.pf_applicable:
            pf_wage = min(float(statutory.pf_wage_limit or basic), float(basic))
            pf_emp = round(pf_wage * float(statutory.pf_employee_percent or 0.0) / 100, 2)
            pf_employer = round(pf_wage * float(statutory.pf_employer_percent or 0.0) / 100, 2)
        if statutory.esi_applicable and gross <= float(statutory.esi_wage_limit or 0.0):
            esi_emp = round(gross * float(statutory.esi_employee_percent or 0.0) / 100, 2)
            esi_employer = round(gross * float(statutory.esi_employer_percent or 0.0) / 100, 2)
        pt = float(statutory.pt_amount or 0.0) if statutory.pt_applicable else 0.0
        lwf = float(statutory.lwf_employee_amount or 0.0) if statutory.lwf_applicable else 0.0
        lwf_employer = float(statutory.lwf_employer_amount or 0.0) if statutory.lwf_applicable else 0.0
    tds = round(gross * float(emp.tds or 0.0) / 100, 2)
    totals = calculate_salary_totals({
        "present_days": att_present,
        "salary_adjustment": 0.0,
        "basic_salary": basic, "hra": hra, "conveyance_allowance": conveyance,
        "special_allowance": 0.0, "ot_amount": 0.0, "other_earnings": other_earn,
        "pf_employee": pf_emp, "esi_employee": esi_emp, "professional_tax": pt,
        "tds_salary": tds, "advance_deduction": advance_ded, "lwf_employee": lwf,
        "other_deductions": 0.0,
    })

    return {
        "success": True, "source": "master",
        "source_month": None,
        "employee_name": emp.employee_name,
        "designation": emp.designation or "",
        "department":  emp.department  or "",
        "production_at": emp.production_at or "",
        # Live attendance
        "present_days": att_present,
        "absent_days":  att_absent,
        "ot_hours":     att_ot_hrs,
        "ot_amount":    0,
        "salary_adjustment": 0.0,
        "calculated_salary": totals["calculated_salary"],
        "basic_salary": basic,
        "hra": hra,
        "conveyance_allowance": conveyance,
        "special_allowance": 0,
        "other_earnings": other_earn,
        "gross_salary": totals["gross_salary"],
        "pf_employee": pf_emp,
        "esi_employee": esi_emp,
        "professional_tax": pt,
        "tds_salary": tds,
        "advance_deduction": totals["advance_deduction"],
        "lwf_employee": lwf,
        "other_deductions": 0.0,
        "total_deductions": totals["total_deductions"],
        "net_payable": totals["net_payable"],
        "pf_employer": pf_employer,
        "esi_employer": esi_employer,
        "lwf_employer": lwf_employer,
        "payment_mode": "BANK",
        "status": "DRAFT",
    }

@router.post("/salary_processing/save")
def salary_processing_save(request: Request, payload: SalaryProcessingSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    if not re.fullmatch(r"\d{4}-(0[1-9]|1[0-2])", payload.month_year):
        return JSONResponse({"success": False, "message": "Invalid salary month"}, status_code=400)
    employee = db.query(EmployeeRegistration).filter(
        EmployeeRegistration.company_id == comp_code,
        EmployeeRegistration.employee_id == payload.employee_id,
        EmployeeRegistration.status == "ACTIVE",
    ).first()
    if not employee:
        return JSONResponse({"success": False, "message": "Active employee not found"}, status_code=404)

    active_advances = db.query(EmployeeSalaryAdvance).filter(
        EmployeeSalaryAdvance.company_id == comp_code,
        EmployeeSalaryAdvance.employee_id == payload.employee_id,
        EmployeeSalaryAdvance.status == "APPROVED",
        EmployeeSalaryAdvance.remaining_balance > 0,
        EmployeeSalaryAdvance.deduct_from <= payload.month_year,
    ).filter(
        (EmployeeSalaryAdvance.deduct_to == None) |
        (EmployeeSalaryAdvance.deduct_to >= payload.month_year)
    ).all()
    advance_deduction = round(sum(
        min(float(row.monthly_deduction or 0.0), float(row.remaining_balance or 0.0))
        for row in active_advances
    ), 2)
    values = payload.dict()
    submitted_gross = float(payload.gross_salary or 0.0)
    submitted_net = float(payload.net_payable or 0.0)
    values["employee_name"] = employee.employee_name
    values["advance_deduction"] = advance_deduction
    try:
        values.update(calculate_salary_totals(values))
    except ValueError as exc:
        return JSONResponse({"success": False, "message": str(exc)}, status_code=400)
    system_values = dict(values)
    system_values["salary_adjustment"] = 0.0
    system_totals = calculate_salary_totals(system_values)
    calculation_mismatch = (
        abs(submitted_gross - values["gross_salary"]) > 0.01
        or abs(submitted_net - values["net_payable"]) > 0.01
    )
    has_variance = abs(values["salary_adjustment"]) > 0.01 or calculation_mismatch

    exists = db.query(SalaryProcessing).filter(
        SalaryProcessing.company_id == comp_code, 
        SalaryProcessing.employee_id == payload.employee_id,
        SalaryProcessing.month_year == payload.month_year
    ).first()
    
    if exists:
        # Update existing
        old_present_days = float(exists.present_days or 0.0)
        old_net_payable = float(exists.net_payable or 0.0)
        old_adjustment = float(exists.salary_adjustment or 0.0)
        for k, v in values.items():
            setattr(exists, k, v)
        if abs(old_present_days - float(values["present_days"])) > 0.001:
            write_audit(
                db,
                "salary_processing",
                exists.id,
                comp_code,
                "PRESENT_DAYS_CHANGE",
                f"Present Days: {old_present_days:.2f}; Net Payable: {old_net_payable:.2f}",
                f"Present Days: {float(values['present_days']):.2f}; Net Payable: {values['net_payable']:.2f}",
                email,
            )
        record = exists
        save_mode = "UPDATED"
        write_audit(db, "salary_processing", exists.id, comp_code, "UPDATE", f"Emp: {payload.employee_name} Month: {payload.month_year}", "UPDATED", email)
    else:
        # Create new
        entry = SalaryProcessing(company_id=comp_code, created_by=email, **values)
        db.add(entry)
        db.flush()
        old_adjustment = 0.0
        record = entry
        save_mode = "CREATED"
        write_audit(db, "salary_processing", entry.id, comp_code, "CREATE", "NONE", f"Emp: {payload.employee_name} Month: {payload.month_year}", email)

    if has_variance:
        write_audit(
            db,
            "salary_processing",
            record.id,
            comp_code,
            "PAYROLL_VARIANCE_ALERT",
            f"System Earned: {system_totals['calculated_salary']:.2f}; Previous Adjustment: {old_adjustment:.2f}",
            f"Submitted Gross/Net: {submitted_gross:.2f}/{submitted_net:.2f}; Adjustment: {values['salary_adjustment']:.2f}; Saved Gross/Net: {values['gross_salary']:.2f}/{values['net_payable']:.2f}",
            email,
        )
    else:
        write_audit(
            db,
            "salary_processing",
            record.id,
            comp_code,
            "PAYROLL_CALCULATION_OK",
            f"Present Days: {float(values['present_days']):.2f}",
            f"System Gross: {values['gross_salary']:.2f}; Net: {values['net_payable']:.2f}",
            email,
        )

    db.commit()
    return {
        "success": True,
        "message": f"Salary record {save_mode.lower()} successfully",
        "save_mode": save_mode,
        "record_id": record.id,
        "gross_salary": values["gross_salary"],
        "total_deductions": values["total_deductions"],
        "net_payable": values["net_payable"],
    }

@router.post("/salary_processing/delete/{log_id}")
def salary_processing_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(SalaryProcessing).filter(SalaryProcessing.id == log_id, SalaryProcessing.company_id == comp_code).first()
    if entry:
        write_audit(db, "salary_processing", entry.id, comp_code, "is_cancelled", "False", "True", email)
        entry.is_cancelled = True
        db.commit()
        return {"success": True, "message": "Salary record cancelled successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)


# ============================================================
# 13. PRODUCTION COST ALLOCATION
# ============================================================
@router.get("/production_cost_allocation/entry", response_class=HTMLResponse)
def production_cost_allocation_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(ProductionCostAllocation).filter(ProductionCostAllocation.company_id == comp_code, ProductionCostAllocation.is_cancelled != True).all()
    ledgers = db.query(LedgerMaster).filter(LedgerMaster.company_id == comp_code).all()
    from app.database.models.enterprise_finance import CostCenter
    cost_centers = db.query(CostCenter).filter(CostCenter.company_id == comp_code).all()
    return templates.TemplateResponse(request=request, name="finance_accounts/production_cost_allocation.html", context={"history": history, "ledgers": ledgers, "cost_centers": cost_centers, "company_id": comp_code})

@router.post("/production_cost_allocation/save")
def production_cost_allocation_save(request: Request, payload: ProductionCostAllocationSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    exists = db.query(ProductionCostAllocation).filter(ProductionCostAllocation.company_id == comp_code, ProductionCostAllocation.batch_number == payload.batch_number).first()
    if exists:
        # Update existing
        for k, v in payload.dict().items():
            setattr(exists, k, v)
        write_audit(db, "production_cost_allocations", exists.id, comp_code, "UPDATE", f"Batch: {payload.batch_number}", "UPDATED", email)
    else:
        # Create new
        entry = ProductionCostAllocation(company_id=comp_code, created_by=email, **payload.dict())
        db.add(entry)
        db.flush()
        write_audit(db, "production_cost_allocations", entry.id, comp_code, "CREATE", "NONE", f"Batch: {payload.batch_number}", email)
        
    db.commit()
    return {"success": True, "message": "Production cost allocation saved successfully"}

@router.post("/production_cost_allocation/delete/{log_id}")
def production_cost_allocation_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(ProductionCostAllocation).filter(ProductionCostAllocation.id == log_id, ProductionCostAllocation.company_id == comp_code).first()
    if entry:
        write_audit(db, "production_cost_allocations", entry.id, comp_code, "is_cancelled", "False", "True", email)
        entry.is_cancelled = True
        db.commit()
        return {"success": True, "message": "Production cost allocation cancelled successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)


# ============================================================
# 14. GST REGISTER / RETURNS / ITC
# ============================================================
@router.get("/gst_register/entry", response_class=HTMLResponse)
def gst_register_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(GSTRegister).filter(GSTRegister.company_id == comp_code).order_by(desc(GSTRegister.invoice_date)).all()
    filings = db.query(GSTRFilingStatus).filter(GSTRFilingStatus.company_id == comp_code).order_by(desc(GSTRFilingStatus.period_month)).all()
    itc_rows = db.query(ITCUtilization).filter(ITCUtilization.company_id == comp_code).order_by(desc(ITCUtilization.period_month)).all()
    return templates.TemplateResponse(
        request=request,
        name="finance_accounts/gst_register.html",
        context={"history": history, "filings": filings, "itc_rows": itc_rows, "company_id": comp_code}
    )

@router.post("/gst_register/save")
def gst_register_save(request: Request, payload: GSTRegisterSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)

    exists = db.query(GSTRegister).filter(
        GSTRegister.company_id == comp_code,
        GSTRegister.invoice_no == payload.invoice_no,
        GSTRegister.transaction_type == payload.transaction_type
    ).first()
    if exists: return JSONResponse({"success": False, "message": "GST invoice already registered for this type"}, status_code=400)

    igst_amount = round(payload.taxable_value * payload.igst_rate / 100, 2)
    cgst_amount = round(payload.taxable_value * payload.cgst_rate / 100, 2)
    sgst_amount = round(payload.taxable_value * payload.sgst_rate / 100, 2)
    total_tax = round(igst_amount + cgst_amount + sgst_amount, 2)

    entry = GSTRegister(
        company_id=comp_code,
        created_by=email,
        transaction_type=payload.transaction_type,
        invoice_no=payload.invoice_no,
        invoice_date=payload.invoice_date,
        party_name=payload.party_name,
        gstin=payload.gstin,
        state_code=payload.state_code,
        hsn_code=payload.hsn_code,
        description=payload.description,
        taxable_value=payload.taxable_value,
        igst_rate=payload.igst_rate,
        cgst_rate=payload.cgst_rate,
        sgst_rate=payload.sgst_rate,
        igst_amount=igst_amount,
        cgst_amount=cgst_amount,
        sgst_amount=sgst_amount,
        total_tax=total_tax,
        invoice_total=round(payload.taxable_value + total_tax, 2),
        is_export=payload.is_export,
        is_rcm=payload.is_rcm,
        is_igst_applicable=payload.igst_rate > 0,
        lut_number=payload.lut_number,
        period_month=payload.period_month,
    )
    db.add(entry)
    db.flush()
    try:
        tx_type = (payload.transaction_type or "").upper()
        taxable = round(payload.taxable_value or 0.0, 2)
        total = round(entry.invoice_total or 0.0, 2)
        party = payload.party_name or "GST Party"
        details = []

        if tx_type in ("PURCHASE", "RCM"):
            details.append(amount_line(db, comp_code, taxable, 0.0, f"Purchase taxable value - {payload.invoice_no}", ledger_name="GST Purchase A/c", group_name="Purchase Accounts", group_type="EXPENSE"))
            if total_tax > 0:
                details.append(amount_line(db, comp_code, total_tax, 0.0, f"Input GST - {payload.invoice_no}", ledger_name="Input GST A/c", group_name="Duties & Taxes", group_type="LIABILITY", parent_group_name="Current Liabilities"))
            details.append(amount_line(db, comp_code, 0.0, total, f"Supplier payable - {payload.invoice_no}", ledger_name=f"{party} - Supplier A/c", group_name="Sundry Creditors", group_type="LIABILITY", parent_group_name="Current Liabilities"))
            voucher_type = "Purchase"
        elif tx_type == "CREDIT_NOTE":
            details.append(amount_line(db, comp_code, taxable, 0.0, f"Sales credit note value - {payload.invoice_no}", ledger_name="Export Sales A/c", group_name="Sales Accounts", group_type="INCOME"))
            if total_tax > 0:
                details.append(amount_line(db, comp_code, total_tax, 0.0, f"Output GST reversal - {payload.invoice_no}", ledger_name="Output GST A/c", group_name="Duties & Taxes", group_type="LIABILITY", parent_group_name="Current Liabilities"))
            details.append(amount_line(db, comp_code, 0.0, total, f"Customer credit note - {payload.invoice_no}", ledger_name=f"{party} - Customer A/c", group_name="Sundry Debtors", group_type="ASSET", parent_group_name="Current Assets"))
            voucher_type = "Credit Note"
        else:
            details.append(amount_line(db, comp_code, total, 0.0, f"Customer receivable - {payload.invoice_no}", ledger_name=f"{party} - Customer A/c", group_name="Sundry Debtors", group_type="ASSET", parent_group_name="Current Assets"))
            details.append(amount_line(db, comp_code, 0.0, taxable, f"Sales taxable value - {payload.invoice_no}", ledger_name="Export Sales A/c", group_name="Sales Accounts", group_type="INCOME"))
            if total_tax > 0:
                details.append(amount_line(db, comp_code, 0.0, total_tax, f"Output GST - {payload.invoice_no}", ledger_name="Output GST A/c", group_name="Duties & Taxes", group_type="LIABILITY", parent_group_name="Current Liabilities"))
            voucher_type = "Sales" if tx_type in ("SALES", "EXPORT") else "Debit Note"

        voucher = PostingEngineService.create_voucher(
            db=db,
            company_id=comp_code,
            voucher_type_name=voucher_type,
            voucher_date=payload.invoice_date,
            narration=f"Auto-posted GST {tx_type} invoice {payload.invoice_no}",
            details=details,
            reference_no=payload.invoice_no,
            created_by=email or "SYSTEM",
            status="POSTED"
        )
        entry.journal_id = voucher.id
        write_audit(db, "gst_register", entry.id, comp_code, "CREATE", "NONE", f"GST Invoice: {payload.invoice_no}; Journal: {voucher.voucher_no}", email)
        db.commit()
        return {"success": True, "message": f"GST register entry saved and journal posted: {voucher.voucher_no}"}
    except Exception as e:
        db.rollback()
        return JSONResponse({"success": False, "message": f"GST entry posting failed: {str(e)}"}, status_code=400)

@router.post("/gst_register/delete/{log_id}")
def gst_register_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(GSTRegister).filter(GSTRegister.id == log_id, GSTRegister.company_id == comp_code).first()
    if entry:
        if entry.journal_id:
            voucher = db.query(VoucherHeader).filter(VoucherHeader.id == entry.journal_id, VoucherHeader.company_id == comp_code).first()
            if voucher:
                db.delete(voucher)
        write_audit(db, "gst_register", entry.id, comp_code, "is_cancelled", "False", "True", email)
        entry.is_cancelled = True
        db.commit()
        return {"success": True, "message": "GST entry cancelled successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)

@router.post("/gstr_filing/save")
def gstr_filing_save(request: Request, payload: GSTRFilingStatusSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    net_payable = round(payload.total_output_tax - payload.total_input_credit, 2)
    exists = db.query(GSTRFilingStatus).filter(
        GSTRFilingStatus.company_id == comp_code,
        GSTRFilingStatus.return_type == payload.return_type,
        GSTRFilingStatus.period_month == payload.period_month
    ).first()
    if exists:
        for k, v in payload.dict().items():
            setattr(exists, k, v)
        exists.net_gst_payable = net_payable
        exists.filed_by = email if payload.status in ("FILED", "LATE_FILED") else exists.filed_by
        write_audit(db, "gstr_filing_status", exists.id, comp_code, "UPDATE", payload.return_type, payload.status, email)
    else:
        entry = GSTRFilingStatus(company_id=comp_code, net_gst_payable=net_payable, filed_by=email if payload.status in ("FILED", "LATE_FILED") else None, **payload.dict())
        db.add(entry)
        db.flush()
        write_audit(db, "gstr_filing_status", entry.id, comp_code, "CREATE", "NONE", f"{payload.return_type} {payload.period_month}", email)
    db.commit()
    return {"success": True, "message": "GSTR filing status saved successfully"}

@router.post("/itc_utilization/save")
def itc_utilization_save(request: Request, payload: ITCUtilizationSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    closing_itc = round(payload.opening_itc + payload.itc_earned - payload.itc_reversed - payload.itc_utilized, 2)
    exists = db.query(ITCUtilization).filter(
        ITCUtilization.company_id == comp_code,
        ITCUtilization.period_month == payload.period_month,
        ITCUtilization.gst_type == payload.gst_type
    ).first()
    if exists:
        for k, v in payload.dict().items():
            setattr(exists, k, v)
        exists.closing_itc = closing_itc
        rec_id = exists.id
        action = "UPDATE"
    else:
        entry = ITCUtilization(company_id=comp_code, closing_itc=closing_itc, **payload.dict())
        db.add(entry)
        db.flush()
        rec_id = entry.id
        action = "CREATE"
    write_audit(db, "itc_utilization", rec_id, comp_code, action, "ITC", f"{payload.gst_type} {payload.period_month}", email)
    db.commit()
    return {"success": True, "message": "ITC utilization saved successfully"}


# ============================================================
# 15. FIXED ASSETS / DEPRECIATION
# ============================================================
@router.get("/fixed_assets/entry", response_class=HTMLResponse)
def fixed_assets_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(FixedAssetMaster).filter(FixedAssetMaster.company_id == comp_code).order_by(FixedAssetMaster.asset_code).all()
    depreciation_rows = db.query(DepreciationSchedule).options(joinedload(DepreciationSchedule.asset)).filter(DepreciationSchedule.company_id == comp_code).order_by(desc(DepreciationSchedule.period_month)).all()
    ledgers = db.query(LedgerMaster).filter(LedgerMaster.company_id == comp_code).order_by(LedgerMaster.ledger_name).all()
    return templates.TemplateResponse(
        request=request,
        name="finance_accounts/fixed_assets.html",
        context={"history": history, "depreciation_rows": depreciation_rows, "ledgers": ledgers, "company_id": comp_code}
    )

@router.post("/fixed_assets/save")
def fixed_assets_save(request: Request, payload: FixedAssetSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    exists = db.query(FixedAssetMaster).filter(FixedAssetMaster.company_id == comp_code, FixedAssetMaster.asset_code == payload.asset_code).first()
    if exists: return JSONResponse({"success": False, "message": "Asset code already registered"}, status_code=400)
    entry = FixedAssetMaster(
        company_id=comp_code,
        created_by=email or "SYSTEM",
        current_wdv=payload.purchase_cost,
        accumulated_depreciation=0.0,
        **payload.dict()
    )
    db.add(entry)
    db.flush()
    try:
        details = [
            amount_line(db, comp_code, payload.purchase_cost, 0.0, f"Asset capitalization - {payload.asset_code}", ledger_id=payload.asset_ledger_id, ledger_name="Fixed Assets A/c", group_name="Fixed Assets", group_type="ASSET"),
            amount_line(db, comp_code, 0.0, payload.purchase_cost, f"Fixed asset payable - {payload.asset_code}", ledger_name="Fixed Asset Payable A/c", group_name="Sundry Creditors", group_type="LIABILITY", parent_group_name="Current Liabilities"),
        ]
        voucher = PostingEngineService.create_voucher(
            db=db,
            company_id=comp_code,
            voucher_type_name="Journal",
            voucher_date=payload.purchase_date,
            narration=f"Auto-posted fixed asset capitalization: {payload.asset_code} - {payload.asset_name}",
            details=details,
            reference_no=payload.purchase_invoice_no or payload.asset_code,
            created_by=email or "SYSTEM",
            status="POSTED"
        )
        entry.purchase_journal_id = voucher.id
        write_audit(db, "fixed_asset_masters", entry.id, comp_code, "CREATE", "NONE", f"Asset: {payload.asset_code}; Journal: {voucher.voucher_no}", email)
        db.commit()
        return {"success": True, "message": f"Fixed asset saved and capitalization journal posted: {voucher.voucher_no}"}
    except Exception as e:
        db.rollback()
        return JSONResponse({"success": False, "message": f"Fixed asset posting failed: {str(e)}"}, status_code=400)

@router.post("/fixed_assets/delete/{log_id}")
def fixed_assets_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(FixedAssetMaster).filter(FixedAssetMaster.id == log_id, FixedAssetMaster.company_id == comp_code).first()
    if entry:
        dep_exists = db.query(DepreciationSchedule).filter(DepreciationSchedule.company_id == comp_code, DepreciationSchedule.asset_id == entry.id).first()
        if dep_exists:
            return JSONResponse({"success": False, "message": "Asset has depreciation runs. Reverse depreciation before deleting asset."}, status_code=400)
        if entry.purchase_journal_id:
            voucher = db.query(VoucherHeader).filter(VoucherHeader.id == entry.purchase_journal_id, VoucherHeader.company_id == comp_code).first()
            if voucher:
                db.delete(voucher)
        write_audit(db, "fixed_asset_masters", entry.id, comp_code, "is_cancelled", "False", "True", email)
        entry.is_cancelled = True
        db.commit()
        return {"success": True, "message": "Fixed asset cancelled successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)

@router.post("/fixed_assets/run_depreciation")
def fixed_assets_run_depreciation(request: Request, payload: DepreciationRunSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email") or "SYSTEM"
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    run_date = payload.run_date or date.today()
    assets = db.query(FixedAssetMaster).filter(FixedAssetMaster.company_id == comp_code, FixedAssetMaster.status == "ACTIVE").all()
    created_count = 0
    for asset in assets:
        exists = db.query(DepreciationSchedule).filter(
            DepreciationSchedule.company_id == comp_code,
            DepreciationSchedule.asset_id == asset.id,
            DepreciationSchedule.period_month == payload.period_month
        ).first()
        if exists:
            continue
        opening_wdv = asset.current_wdv or 0.0
        if opening_wdv <= max(asset.salvage_value or 0.0, 0.0):
            asset.status = "FULLY_DEPRECIATED"
            continue
        if asset.depreciation_method == "SLM" and asset.useful_life_years:
            dep_amount = round((asset.purchase_cost - (asset.salvage_value or 0.0)) / (asset.useful_life_years * 12), 2)
        else:
            dep_amount = round(opening_wdv * (asset.dep_rate_percent / 100) / 12, 2)
        dep_amount = min(dep_amount, max(opening_wdv - (asset.salvage_value or 0.0), 0.0))
        closing_wdv = round(opening_wdv - dep_amount, 2)
        row = DepreciationSchedule(
            company_id=comp_code,
            asset_id=asset.id,
            period_month=payload.period_month,
            opening_wdv=opening_wdv,
            dep_rate_percent=asset.dep_rate_percent,
            dep_amount=dep_amount,
            closing_wdv=closing_wdv,
            run_date=run_date,
            run_by=email,
        )
        db.add(row)
        db.flush()
        try:
            details = [
                amount_line(db, comp_code, dep_amount, 0.0, f"Depreciation expense - {asset.asset_code} {payload.period_month}", ledger_id=asset.dep_expense_ledger_id, ledger_name="Depreciation Expense A/c", group_name="Indirect Expenses", group_type="EXPENSE"),
                amount_line(db, comp_code, 0.0, dep_amount, f"Accumulated depreciation - {asset.asset_code} {payload.period_month}", ledger_id=asset.acc_dep_ledger_id, ledger_name="Accumulated Depreciation A/c", group_name="Provisions", group_type="LIABILITY", parent_group_name="Current Liabilities"),
            ]
            voucher = PostingEngineService.create_voucher(
                db=db,
                company_id=comp_code,
                voucher_type_name="Journal",
                voucher_date=run_date,
                narration=f"Auto-posted depreciation for {asset.asset_code} - {asset.asset_name} ({payload.period_month})",
                details=details,
                reference_no=f"DEP-{payload.period_month}-{asset.asset_code}",
                created_by=email,
                status="POSTED"
            )
            row.journal_id = voucher.id
        except Exception as e:
            db.rollback()
            return JSONResponse({"success": False, "message": f"Depreciation posting failed for {asset.asset_code}: {str(e)}"}, status_code=400)
        asset.accumulated_depreciation = round((asset.accumulated_depreciation or 0.0) + dep_amount, 2)
        asset.current_wdv = closing_wdv
        if closing_wdv <= max(asset.salvage_value or 0.0, 0.0):
            asset.status = "FULLY_DEPRECIATED"
        created_count += 1
    db.commit()
    return {"success": True, "message": f"Depreciation created for {created_count} assets."}
