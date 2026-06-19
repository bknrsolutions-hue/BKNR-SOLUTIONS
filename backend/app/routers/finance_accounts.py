from fastapi import APIRouter, Request, Depends, Body, HTTPException, Query
from fastapi.responses import HTMLResponse, RedirectResponse, JSONResponse, StreamingResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, and_
from datetime import date, datetime
import io
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
    LedgerMaster,
    PaymentReceipt
)
from app.database.models.processing import AuditLog  # Audit trails

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)

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
    buyer_name: str
    buyer_type: str = "Direct"
    country: str
    invoice_date: date
    currency: str = "USD"
    exchange_rate: float = 83.50
    invoice_value_foreign: float
    credit_days: int = 30

class VendorPaymentSchema(BaseModel):
    vendor_name: str
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
    bank_name: str
    transaction_date: date
    voucher_type: str
    reference_no: str
    linked_invoice_no: str = None
    linked_vendor: str = None
    debit: float = 0.0
    credit: float = 0.0
    closing_balance: float

class ExpenseVoucherSchema(BaseModel):
    voucher_no: str
    voucher_date: date
    expense_type: str
    department: str
    vendor_name: str = None
    gst_percentage: float = 0.0
    gst_amount: float = 0.0
    amount: float
    total_amount: float
    approved_by: str
    payment_mode: str = "Cash"
    remarks: str = None

class JournalEntryLineSchema(BaseModel):
    ledger_name: str
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
    party_ledger: str
    bank_cash_ledger: str
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

# ============================================================
# 1. LEDGER MASTER
# ============================================================
@router.get("/ledger_master/entry", response_class=HTMLResponse)
def ledger_master_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(LedgerMaster).filter(LedgerMaster.company_id == comp_code).order_by(LedgerMaster.ledger_name).all()
    return templates.TemplateResponse(request=request, name="finance_accounts/ledger_master.html", context={"history": history, "company_id": comp_code})

@router.post("/ledger_master/save")
def ledger_master_save(request: Request, payload: LedgerMasterSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    # Check if duplicate exists
    exists = db.query(LedgerMaster).filter(LedgerMaster.company_id == comp_code, LedgerMaster.ledger_name == payload.ledger_name).first()
    if exists: return JSONResponse({"success": False, "message": "Ledger already exists"}, status_code=400)
    
    entry = LedgerMaster(company_id=comp_code, **payload.dict())
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
    history = db.query(CustomerReceivable).filter(CustomerReceivable.company_id == comp_code).order_by(desc(CustomerReceivable.invoice_date)).all()
    return templates.TemplateResponse(request=request, name="finance_accounts/customer_receivable.html", context={"history": history, "company_id": comp_code})

@router.post("/customer_receivable/save")
def customer_receivable_save(request: Request, payload: CustomerReceivableSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    exists = db.query(CustomerReceivable).filter(CustomerReceivable.company_id == comp_code, CustomerReceivable.invoice_no == payload.invoice_no).first()
    if exists: return JSONResponse({"success": False, "message": "Invoice already registered"}, status_code=400)
    
    inr_value = payload.invoice_value_foreign * payload.exchange_rate
    due = payload.invoice_date + timedelta(days=payload.credit_days) if getattr(payload, 'invoice_date', None) else date.today()
    
    entry = CustomerReceivable(
        company_id=comp_code,
        invoice_no=payload.invoice_no,
        po_number=payload.po_number,
        container_no=payload.container_no,
        buyer_name=payload.buyer_name,
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
    write_audit(db, "customer_receivables", entry.id, comp_code, "CREATE", "NONE", f"Invoice Added: {payload.invoice_no} (Value: ₹{inr_value})", email)
    db.commit()
    return {"success": True, "message": "Customer receivable recorded successfully"}

@router.post("/customer_receivable/delete/{log_id}")
def customer_receivable_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(CustomerReceivable).filter(CustomerReceivable.id == log_id, CustomerReceivable.company_id == comp_code).first()
    if entry:
        write_audit(db, "customer_receivables", entry.id, comp_code, "DELETE", f"Invoice: {entry.invoice_no}", "DELETED", email)
        db.delete(entry)
        db.commit()
        return {"success": True, "message": "Receivable deleted successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)


# ============================================================
# 3. VENDOR PAYMENT
# ============================================================
@router.get("/vendor_payment/entry", response_class=HTMLResponse)
def vendor_payment_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(VendorPayment).filter(VendorPayment.company_id == comp_code).order_by(desc(VendorPayment.bill_date)).all()
    return templates.TemplateResponse(request=request, name="finance_accounts/vendor_payment.html", context={"history": history, "company_id": comp_code})

@router.post("/vendor_payment/save")
def vendor_payment_save(request: Request, payload: VendorPaymentSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    exists = db.query(VendorPayment).filter(VendorPayment.company_id == comp_code, VendorPayment.bill_no == payload.bill_no).first()
    if exists: return JSONResponse({"success": False, "message": "Voucher bill number already exists"}, status_code=400)
    
    balance = payload.total_amount
    entry = VendorPayment(
        company_id=comp_code,
        vendor_name=payload.vendor_name,
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
    write_audit(db, "vendor_payments", entry.id, comp_code, "CREATE", "NONE", f"Bill Added: {payload.bill_no} (Total: ₹{payload.total_amount})", email)
    db.commit()
    return {"success": True, "message": "Vendor payment recorded successfully"}

@router.post("/vendor_payment/delete/{log_id}")
def vendor_payment_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(VendorPayment).filter(VendorPayment.id == log_id, VendorPayment.company_id == comp_code).first()
    if entry:
        write_audit(db, "vendor_payments", entry.id, comp_code, "DELETE", f"Bill: {entry.bill_no}", "DELETED", email)
        db.delete(entry)
        db.commit()
        return {"success": True, "message": "Vendor bill deleted successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)


# ============================================================
# 4. BANK TRANSACTION
# ============================================================
@router.get("/bank_transaction/entry", response_class=HTMLResponse)
def bank_transaction_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(BankTransaction).filter(BankTransaction.company_id == comp_code).order_by(desc(BankTransaction.transaction_date)).all()
    return templates.TemplateResponse(request=request, name="finance_accounts/bank_transaction.html", context={"history": history, "company_id": comp_code})

@router.post("/bank_transaction/save")
def bank_transaction_save(request: Request, payload: BankTransactionSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    exists = db.query(BankTransaction).filter(BankTransaction.company_id == comp_code, BankTransaction.reference_no == payload.reference_no).first()
    if exists: return JSONResponse({"success": False, "message": "Reference Transaction number already mapped"}, status_code=400)
    
    entry = BankTransaction(
        company_id=comp_code,
        bank_name=payload.bank_name,
        transaction_date=payload.transaction_date,
        voucher_type=payload.voucher_type,
        reference_no=payload.reference_no,
        linked_invoice_no=payload.linked_invoice_no,
        linked_vendor=payload.linked_vendor,
        debit=payload.debit,
        credit=payload.credit,
        closing_balance=payload.closing_balance,
        created_by=email
    )
    db.add(entry)
    db.flush()
    write_audit(db, "bank_transactions", entry.id, comp_code, "CREATE", "NONE", f"Transaction Ref: {payload.reference_no}", email)
    db.commit()
    return {"success": True, "message": "Bank transaction registered successfully"}

@router.post("/bank_transaction/delete/{log_id}")
def bank_transaction_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(BankTransaction).filter(BankTransaction.id == log_id, BankTransaction.company_id == comp_code).first()
    if entry:
        write_audit(db, "bank_transactions", entry.id, comp_code, "DELETE", f"Ref: {entry.reference_no}", "DELETED", email)
        db.delete(entry)
        db.commit()
        return {"success": True, "message": "Transaction trace deleted successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)


# ============================================================
# 5. EXPENSE VOUCHER
# ============================================================
@router.get("/expense_voucher/entry", response_class=HTMLResponse)
def expense_voucher_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(ExpenseVoucher).filter(ExpenseVoucher.company_id == comp_code).order_by(desc(ExpenseVoucher.voucher_date)).all()
    return templates.TemplateResponse(request=request, name="finance_accounts/expense_voucher.html", context={"history": history, "company_id": comp_code})

@router.post("/expense_voucher/save")
def expense_voucher_save(request: Request, payload: ExpenseVoucherSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    exists = db.query(ExpenseVoucher).filter(ExpenseVoucher.company_id == comp_code, ExpenseVoucher.voucher_no == payload.voucher_no).first()
    if exists: return JSONResponse({"success": False, "message": "Voucher number already allocated"}, status_code=400)
    
    entry = ExpenseVoucher(
        company_id=comp_code,
        voucher_no=payload.voucher_no,
        voucher_date=payload.voucher_date,
        expense_type=payload.expense_type,
        department=payload.department,
        vendor_name=payload.vendor_name,
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
    write_audit(db, "expense_vouchers", entry.id, comp_code, "CREATE", "NONE", f"Voucher: {payload.voucher_no} (Amt: ₹{payload.total_amount})", email)
    db.commit()
    return {"success": True, "message": "Expense voucher registered successfully"}

@router.post("/expense_voucher/delete/{log_id}")
def expense_voucher_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(ExpenseVoucher).filter(ExpenseVoucher.id == log_id, ExpenseVoucher.company_id == comp_code).first()
    if entry:
        write_audit(db, "expense_vouchers", entry.id, comp_code, "DELETE", f"Voucher: {entry.voucher_no}", "DELETED", email)
        db.delete(entry)
        db.commit()
        return {"success": True, "message": "Voucher deleted successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)


# ============================================================
# 6. JOURNAL ENTRY
# ============================================================
@router.get("/journal_entry/entry", response_class=HTMLResponse)
def journal_entry_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(JournalEntry).filter(JournalEntry.company_id == comp_code).order_by(desc(JournalEntry.entry_date)).all()
    ledgers = db.query(LedgerMaster).filter(LedgerMaster.company_id == comp_code).all()
    return templates.TemplateResponse(request=request, name="finance_accounts/journal_entry.html", context={"history": history, "ledgers": ledgers, "company_id": comp_code})

@router.post("/journal_entry/save")
def journal_entry_save(request: Request, payload: JournalEntrySchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    if payload.total_debit != payload.total_credit:
         return JSONResponse({"success": False, "message": "Debit and Credit totals must match"}, status_code=400)
         
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
            ledger_name=line.ledger_name,
            debit=line.debit,
            credit=line.credit
        )
        db.add(db_line)
        
    write_audit(db, "journal_entries", entry.id, comp_code, "CREATE", "NONE", f"Journal Entry Saved: {payload.entry_no}", email)
    db.commit()
    return {"success": True, "message": "Journal Entry posted successfully"}

@router.post("/journal_entry/delete/{log_id}")
def journal_entry_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(JournalEntry).filter(JournalEntry.id == log_id, JournalEntry.company_id == comp_code).first()
    if entry:
        write_audit(db, "journal_entries", entry.id, comp_code, "DELETE", f"Journal: {entry.entry_no}", "DELETED", email)
        db.delete(entry)
        db.commit()
        return {"success": True, "message": "Journal Entry deleted successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)


# ============================================================
# 7. PAYMENT RECEIPT
# ============================================================
@router.get("/payment_receipt/entry", response_class=HTMLResponse)
def payment_receipt_entry(request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    if not comp_code: return RedirectResponse("/", status_code=302)
    history = db.query(PaymentReceipt).filter(PaymentReceipt.company_id == comp_code).order_by(desc(PaymentReceipt.entry_date)).all()
    ledgers = db.query(LedgerMaster).filter(LedgerMaster.company_id == comp_code).all()
    return templates.TemplateResponse(request=request, name="finance_accounts/payment_receipt.html", context={"history": history, "ledgers": ledgers, "company_id": comp_code})

@router.post("/payment_receipt/save")
def payment_receipt_save(request: Request, payload: PaymentReceiptSchema, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    if not comp_code: return JSONResponse({"success": False, "message": "Unauthorized"}, status_code=401)
    
    exists = db.query(PaymentReceipt).filter(PaymentReceipt.company_id == comp_code, PaymentReceipt.receipt_no == payload.receipt_no).first()
    if exists: return JSONResponse({"success": False, "message": "Voucher Receipt Number already registered"}, status_code=400)
    
    entry = PaymentReceipt(
        company_id=comp_code,
        receipt_no=payload.receipt_no,
        entry_date=payload.entry_date,
        transaction_type=payload.transaction_type,
        party_ledger=payload.party_ledger,
        bank_cash_ledger=payload.bank_cash_ledger,
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
    write_audit(db, "payment_receipts", entry.id, comp_code, "CREATE", "NONE", f"Receipt: {payload.receipt_no}", email)
    db.commit()
    return {"success": True, "message": "Payment receipt registered successfully"}

@router.post("/payment_receipt/delete/{log_id}")
def payment_receipt_delete(log_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code")
    email = request.session.get("email")
    entry = db.query(PaymentReceipt).filter(PaymentReceipt.id == log_id, PaymentReceipt.company_id == comp_code).first()
    if entry:
        write_audit(db, "payment_receipts", entry.id, comp_code, "DELETE", f"Receipt: {entry.receipt_no}", "DELETED", email)
        db.delete(entry)
        db.commit()
        return {"success": True, "message": "Receipt deleted successfully"}
    return JSONResponse({"success": False, "message": "Record not found"}, status_code=404)
