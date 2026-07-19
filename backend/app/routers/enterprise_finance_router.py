from fastapi import APIRouter, Request, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import case, func, or_, and_
from sqlalchemy.orm import Session, joinedload
from datetime import date, datetime
import html
import json
import openpyxl
import io
import re
import pandas as pd
from typing import List, Optional
from pydantic import BaseModel, model_validator

from app.database import get_db
from app.database.models.enterprise_finance import (
    AccountGroup, LedgerMaster, VoucherHeader, VoucherDetail, VoucherType,
    BranchMaster, FinancialYearMaster, CostCenter, CurrencyMaster, ExchangeRate,
    BankReconciliation, FinanceAuditTrail
)
from app.services.posting_engine import PostingEngineService
from app.services.accounting_reports import AccountingReportsService
from app.services.pdf_renderer import render_pdf_from_html
from app.utils.timezone import ist_now

router = APIRouter()


def require_company_code(request: Request) -> str:
    company_code = request.session.get("company_code")
    if not company_code:
        raise HTTPException(status_code=401, detail="Company session is required")
    return company_code


def require_finance_admin(request: Request) -> None:
    role = str(request.session.get("role") or "").strip().lower().replace(" ", "_")
    email = str(request.session.get("email") or "").strip().lower()
    if role not in {"admin", "super_admin"} and email != "bknr.solutions@gmail.com":
        raise HTTPException(status_code=403, detail="Finance administrator approval is required")


def current_financial_period() -> tuple[date, date]:
    today = ist_now().date()
    start = date(today.year if today.month >= 4 else today.year - 1, 4, 1)
    return start, today


def _pdf_column_position(line: str, aliases: tuple[str, ...]) -> int | None:
    lowered = line.lower()
    positions = [lowered.find(alias) for alias in aliases if lowered.find(alias) >= 0]
    return min(positions) if positions else None


def _pdf_amount(value: str) -> float:
    raw = str(value or "").strip()
    if not raw or raw in {"-", "—"}:
        return 0.0
    negative = raw.startswith("(") and raw.endswith(")")
    cleaned = re.sub(r"[^0-9.\-]", "", raw)
    if not cleaned or cleaned in {"-", ".", "-."}:
        return 0.0
    amount = float(cleaned)
    return -abs(amount) if negative else amount


def _statement_text(value, limit: int) -> str | None:
    if value is None or pd.isna(value):
        return None
    cleaned = str(value).strip()
    return cleaned[:limit] or None


def extract_bank_statement_pdf(content: bytes) -> pd.DataFrame:
    """Extract standard text-based bank tables with labelled debit/credit columns."""
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(content))
    parsed_rows = []
    seen_rows = set()
    date_pattern = re.compile(
        r"(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})"
    )
    amount_pattern = re.compile(r"(?<![A-Za-z0-9])(?:INR|Rs\.?|₹)?\s*\(?-?\d[\d,]*\.\d{2}\)?(?:\s*(?:DR|CR))?", re.I)
    tagged_amount_pattern = re.compile(
        r"((?:INR|Rs\.?|₹)?\s*\(?-?\d[\d,]*\.\d{2}\)?)\s*(DR|CR)\b",
        re.I,
    )
    debit_aliases = (
        "debit", "withdrawal", "withdrawals", "withdrawal amt", "withdrawal amount",
        "dr amount", "dr amt", "debit amount", "debit amt",
    )
    credit_aliases = (
        "credit", "deposit", "deposits", "deposit amt", "deposit amount",
        "cr amount", "cr amt", "credit amount", "credit amt",
    )
    balance_aliases = ("balance", "closing balance", "running balance", "available balance")

    def append_row(raw_date: str, description: str, debit: float, credit: float) -> None:
        if (debit > 0) == (credit > 0):
            return
        reference_match = re.search(
            r"\b(?:UTR|UPI|NEFT|IMPS|RTGS|CHQ|CHEQUE)[\s:/#-]*([A-Z0-9-]{5,})",
            description.upper(),
        )
        reference = _statement_text(reference_match.group(1) if reference_match else description, 50)
        key = (raw_date, reference, round(debit, 2), round(credit, 2))
        if key in seen_rows:
            return
        seen_rows.add(key)
        parsed_rows.append({
            "Date": raw_date,
            "Reference": reference or None,
            "Debit": round(debit, 2),
            "Credit": round(credit, 2),
            "Remarks": _statement_text(description, 255),
        })

    for page in reader.pages:
        try:
            page_text = page.extract_text(extraction_mode="layout") or ""
        except TypeError:
            page_text = page.extract_text() or ""
        lines = [line.rstrip() for line in page_text.splitlines() if line.strip()]
        header_index = None
        debit_position = credit_position = balance_position = None
        debit_header_index = credit_header_index = 0
        for index, line in enumerate(lines):
            if debit_position is None:
                debit_position = _pdf_column_position(line, debit_aliases)
                if debit_position is not None:
                    debit_header_index = index
            if credit_position is None:
                credit_position = _pdf_column_position(line, credit_aliases)
                if credit_position is not None:
                    credit_header_index = index
            if balance_position is None:
                balance_position = _pdf_column_position(line, balance_aliases)
            if debit_position is not None and credit_position is not None:
                header_index = max(debit_header_index, credit_header_index)
                break

        if header_index is not None:
            amount_positions = sorted(
                position for position in (debit_position, credit_position, balance_position)
                if position is not None
            )
            first_amount_position = amount_positions[0]

            def column_slice(line: str, start: int) -> str:
                following = [position for position in amount_positions if position > start]
                end = min(following) if following else len(line)
                return line[start:end]

            for line in lines[header_index + 1:]:
                date_match = date_pattern.search(line[:35])
                if not date_match:
                    continue
                debit = abs(_pdf_amount(column_slice(line, debit_position)))
                credit = abs(_pdf_amount(column_slice(line, credit_position)))
                description = line[date_match.end():first_amount_position].strip(" |")
                append_row(date_match.group(1), description, debit, credit)

        # Fallback 1: statements that print transaction amount with an explicit DR/CR suffix.
        for line in lines:
            date_match = date_pattern.search(line[:35])
            if not date_match:
                continue
            tagged = tagged_amount_pattern.findall(line[date_match.end():])
            if not tagged:
                continue
            transaction_amount, transaction_side = tagged[0]
            amount = abs(_pdf_amount(transaction_amount))
            description_end = line.upper().find(transaction_amount.strip().upper(), date_match.end())
            description = line[date_match.end():description_end if description_end >= 0 else len(line)].strip(" |")
            append_row(
                date_match.group(1),
                description,
                amount if transaction_side.upper() == "DR" else 0.0,
                amount if transaction_side.upper() == "CR" else 0.0,
            )

        # Fallback 2: compact rows containing transaction amount + running balance.
        compact_candidates = []
        opening_balance = None
        opening_match = re.search(
            r"opening\s+balance[^0-9]{0,20}((?:INR|Rs\.?|₹)?\s*\d[\d,]*\.\d{2})",
            page_text,
            re.I,
        )
        if opening_match:
            opening_balance = abs(_pdf_amount(opening_match.group(1)))
        for line in lines:
            date_match = date_pattern.search(line[:35])
            if not date_match:
                continue
            amounts = amount_pattern.findall(line[date_match.end():])
            if len(amounts) < 2:
                continue
            transaction_amount = abs(_pdf_amount(amounts[-2]))
            running_balance = abs(_pdf_amount(amounts[-1]))
            amount_start = line.find(amounts[-2], date_match.end())
            description = line[date_match.end():amount_start if amount_start >= 0 else len(line)].strip(" |")
            compact_candidates.append((date_match.group(1), description, transaction_amount, running_balance))

        previous_balance = opening_balance
        for raw_date, description, transaction_amount, running_balance in compact_candidates:
            debit = credit = 0.0
            if previous_balance is not None:
                difference = round(running_balance - previous_balance, 2)
                if abs(abs(difference) - transaction_amount) <= 0.05:
                    credit = transaction_amount if difference > 0 else 0.0
                    debit = transaction_amount if difference < 0 else 0.0
            if debit == 0 and credit == 0:
                upper_description = description.upper()
                if re.search(r"\b(?:CREDIT|DEPOSIT|SALARY|REFUND|INWARD|INTEREST)\b", upper_description):
                    credit = transaction_amount
                elif re.search(r"\b(?:DEBIT|WITHDRAWAL|ATM|POS|CHARGES|OUTWARD|PAYMENT)\b", upper_description):
                    debit = transaction_amount
            append_row(raw_date, description, debit, credit)
            previous_balance = running_balance

    if not parsed_rows:
        raise ValueError(
            "Bank rows could not be identified. Use a text-based statement PDF with Debit/Credit columns or export the bank statement as CSV/Excel."
        )
    return pd.DataFrame(parsed_rows)


DEFAULT_ACCOUNT_GROUPS = [
    ("Capital Account", "EQUITY", None),
    ("Current Assets", "ASSET", None),
    ("Bank Accounts", "ASSET", "Current Assets"),
    ("Cash-in-hand", "ASSET", "Current Assets"),
    ("Sundry Debtors", "ASSET", "Current Assets"),
    ("Loans & Advances", "ASSET", "Current Assets"),
    ("Stock-in-hand", "ASSET", "Current Assets"),
    ("Fixed Assets", "ASSET", None),
    ("Current Liabilities", "LIABILITY", None),
    ("Sundry Creditors", "LIABILITY", "Current Liabilities"),
    ("Duties & Taxes", "LIABILITY", "Current Liabilities"),
    ("Provisions", "LIABILITY", "Current Liabilities"),
    ("Loans", "LIABILITY", None),
    ("Sales Accounts", "INCOME", None),
    ("Direct Incomes", "INCOME", None),
    ("Indirect Incomes", "INCOME", None),
    ("Purchase Accounts", "EXPENSE", None),
    ("Direct Expenses", "EXPENSE", None),
    ("Indirect Expenses", "EXPENSE", None),
]

DEFAULT_VOUCHER_TYPES = [
    ("Contra", "CON"),
    ("Payment", "PAY"),
    ("Receipt", "RCT"),
    ("Journal", "JV"),
    ("Purchase", "PUR"),
    ("Sales", "SAL"),
    ("Debit Note", "DN"),
    ("Credit Note", "CN"),
]

DEFAULT_LEDGERS = [
    ("Cash Account", "Cash-in-hand", "ASSET"),
    ("SBI Cash Credit A/c", "Bank Accounts", "ASSET"),
    ("Raw Shrimp Purchase A/c", "Purchase Accounts", "EXPENSE"),
    ("Export Sales A/c", "Sales Accounts", "INCOME"),
    ("Input GST A/c", "Duties & Taxes", "LIABILITY"),
    ("Output GST A/c", "Duties & Taxes", "LIABILITY"),
    ("TDS Payable A/c", "Duties & Taxes", "LIABILITY"),
    ("Salaries & Wages Expense A/c", "Indirect Expenses", "EXPENSE"),
    ("Salaries Payable A/c", "Current Liabilities", "LIABILITY"),
    ("Cold Storage Rent & Handling A/c", "Indirect Expenses", "EXPENSE"),
    ("Freight & Logistics Expense A/c", "Direct Expenses", "EXPENSE"),
    ("Packing Material Purchase A/c", "Purchase Accounts", "EXPENSE"),
    ("Finished Goods Inventory A/c", "Stock-in-hand", "ASSET"),
    ("Work In Progress A/c", "Stock-in-hand", "ASSET"),
    ("Cost of Goods Sold A/c", "Direct Expenses", "EXPENSE"),
    ("Processing Labour Cost A/c", "Direct Expenses", "EXPENSE"),
    ("Production Power Cost A/c", "Direct Expenses", "EXPENSE"),
    ("Production Ice Cost A/c", "Direct Expenses", "EXPENSE"),
    ("Production Water Cost A/c", "Direct Expenses", "EXPENSE"),
    ("Soaking Chemical Cost A/c", "Direct Expenses", "EXPENSE"),
    ("Other Production Cost A/c", "Direct Expenses", "EXPENSE"),
    ("Bank Charges A/c", "Indirect Expenses", "EXPENSE"),
    ("Settlement Adjustments A/c", "Indirect Expenses", "EXPENSE"),
    ("Unrealised Forex Gain A/c", "Indirect Incomes", "INCOME"),
    ("Unrealised Forex Loss A/c", "Indirect Expenses", "EXPENSE"),
    ("Export Incentive Receivable A/c", "Loans & Advances", "ASSET"),
    ("Export Incentive Income A/c", "Indirect Incomes", "INCOME"),
    ("Fixed Assets A/c", "Fixed Assets", "ASSET"),
    ("Accumulated Depreciation A/c", "Fixed Assets", "ASSET"),
    ("Depreciation Expense A/c", "Indirect Expenses", "EXPENSE"),
    ("Fixed Asset Payable A/c", "Sundry Creditors", "LIABILITY"),
]


def ensure_default_accounting_setup(db: Session, company_id: str, email: str = "SYSTEM") -> dict:
    created = {"groups": 0, "voucher_types": 0, "ledgers": 0}

    for group_name, group_type, parent_name in DEFAULT_ACCOUNT_GROUPS:
        before = db.query(AccountGroup).filter(
            AccountGroup.company_id == company_id,
            AccountGroup.group_name == group_name
        ).first()
        PostingEngineService.get_or_create_group(db, company_id, group_name, group_type, parent_name)
        if not before:
            created["groups"] += 1

    for type_name, prefix in DEFAULT_VOUCHER_TYPES:
        before = db.query(VoucherType).filter(
            VoucherType.company_id == company_id,
            VoucherType.name == type_name
        ).first()
        PostingEngineService.get_or_create_voucher_type(db, company_id, type_name, prefix)
        if not before:
            created["voucher_types"] += 1

    for ledger_name, group_name, group_type in DEFAULT_LEDGERS:
        ledger = db.query(LedgerMaster).filter(
            LedgerMaster.company_id == company_id,
            LedgerMaster.ledger_name == ledger_name
        ).first()
        if not ledger:
            PostingEngineService.get_or_create_ledger(db, company_id, ledger_name, group_name, group_type)
            created["ledgers"] += 1
        elif ledger_name == "Accumulated Depreciation A/c":
            expected_group = PostingEngineService.get_or_create_group(db, company_id, group_name, group_type)
            if ledger.group_id != expected_group.id:
                ledger.group_id = expected_group.id

    db.commit()
    return created

# =========================================================================
# SCHEMAS FOR VALIDATIONS
# =========================================================================
class AccountGroupCreate(BaseModel):
    group_name: str
    parent_group_id: Optional[int] = None
    group_type: str # ASSET, LIABILITY, INCOME, EXPENSE, EQUITY

class LedgerCreate(BaseModel):
    ledger_code: Optional[str] = None
    ledger_name: str
    group_id: int
    opening_balance: float = 0.0
    opening_balance_type: str = 'DR'
    gstin: Optional[str] = None
    pan: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    credit_days: int = 30
    credit_limit: float = 0.0
    branch_id: Optional[int] = None

class VoucherDetailCreate(BaseModel):
    ledger_id: int
    cost_center_id: Optional[int] = None
    debit_amount: float = 0.0
    credit_amount: float = 0.0
    remarks: Optional[str] = None

class VoucherCreate(BaseModel):
    voucher_date: date
    voucher_type_id: int
    branch_id: Optional[int] = None
    reference_no: Optional[str] = None
    narration: Optional[str] = None
    details: List[VoucherDetailCreate]


class FinancialYearCreate(BaseModel):
    year_name: str
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def validate_dates(self):
        if self.start_date > self.end_date:
            raise ValueError("Financial year start date must be before end date")
        return self


class VoucherDecision(BaseModel):
    remarks: Optional[str] = None

# =========================================================================
# 1. CHART OF ACCOUNTS / GROUPS APIs
# =========================================================================
@router.get("/groups")
def get_groups(request: Request, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    groups = db.query(AccountGroup).filter(AccountGroup.company_id == comp_code).all()
    
    # Construct hierarchical tree list
    tree = []
    roots = [g for g in groups if g.parent_group_id is None]
    
    def add_children(node):
        children = [g for g in groups if g.parent_group_id == node.id]
        node_data = {
            "id": node.id,
            "name": node.group_name,
            "type": node.group_type,
            "children": []
        }
        for child in children:
            node_data["children"].append(add_children(child))
        return node_data

    for r in roots:
        tree.append(add_children(r))
        
    return {"success": True, "tree": tree, "flat_list": [{"id": g.id, "name": g.group_name, "type": g.group_type} for g in groups]}

@router.post("/groups")
def create_group(request: Request, payload: AccountGroupCreate, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    if payload.parent_group_id is not None:
        parent = db.query(AccountGroup).filter(
            AccountGroup.id == payload.parent_group_id,
            AccountGroup.company_id == comp_code,
        ).first()
        if not parent:
            raise HTTPException(status_code=400, detail="Invalid parent account group")
    
    # Check duplicate
    exists = db.query(AccountGroup).filter(
        AccountGroup.company_id == comp_code, 
        AccountGroup.group_name == payload.group_name
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail="Group name already exists")
        
    group = AccountGroup(
        company_id=comp_code,
        group_name=payload.group_name,
        parent_group_id=payload.parent_group_id,
        group_type=payload.group_type
    )
    db.add(group)
    db.commit()
    return {"success": True, "message": "Account group created successfully", "id": group.id}

# =========================================================================
# 2. LEDGER MASTER APIs
# =========================================================================
@router.get("/ledgers")
def get_ledgers(request: Request, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    ledgers = db.query(LedgerMaster).filter(LedgerMaster.company_id == comp_code).all()
    return {
        "success": True, 
        "data": [
            {
                "id": l.id,
                "ledger_code": l.ledger_code,
                "ledger_name": l.ledger_name,
                "group_name": l.group.group_name if l.group else "",
                "group_type": l.group.group_type if l.group else "",
                "opening_balance": l.opening_balance,
                "opening_balance_type": l.opening_balance_type,
                "gstin": l.gstin,
                "pan": l.pan,
                "status": l.status
            } for l in ledgers
        ]
    }

@router.get("/voucher-types")
def get_voucher_types(request: Request, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    ensure_default_accounting_setup(db, comp_code, request.session.get("email", "SYSTEM"))
    rows = db.query(VoucherType).filter(VoucherType.company_id == comp_code).order_by(VoucherType.name).all()
    return {
        "success": True,
        "data": [
            {"id": row.id, "name": row.name, "prefix": row.prefix, "next_number": row.next_number}
            for row in rows
        ]
    }

@router.post("/ledgers")
def create_ledger(request: Request, payload: LedgerCreate, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    email = request.session.get("email", "system@bknr.com")
    
    group = db.query(AccountGroup).filter(
        AccountGroup.id == payload.group_id,
        AccountGroup.company_id == comp_code,
    ).first()
    if not group:
        raise HTTPException(status_code=400, detail="Invalid account group")

    exists = db.query(LedgerMaster).filter(
        LedgerMaster.company_id == comp_code,
        LedgerMaster.ledger_name == payload.ledger_name
    ).first()
    if exists:
        raise HTTPException(status_code=400, detail="Ledger name already exists")

    ledger = LedgerMaster(
        company_id=comp_code,
        ledger_code=payload.ledger_code,
        ledger_name=payload.ledger_name,
        group_id=payload.group_id,
        opening_balance=payload.opening_balance,
        opening_balance_type=payload.opening_balance_type,
        gstin=payload.gstin,
        pan=payload.pan,
        address=payload.address,
        phone=payload.phone,
        email=payload.email,
        credit_days=payload.credit_days,
        credit_limit=payload.credit_limit,
        branch_id=payload.branch_id,
        status='ACTIVE',
        created_by=email
    )
    db.add(ledger)
    db.commit()
    
    PostingEngineService.write_finance_audit(
        db, comp_code, 'ledger_masters', ledger.id, 'INSERT', None, 
        {"name": ledger.ledger_name, "opening": ledger.opening_balance}, email
    )
    db.commit()
    return {"success": True, "message": "Ledger created successfully", "id": ledger.id}

@router.post("/ledgers/import")
async def import_ledgers_excel(request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    email = request.session.get("email", "system@bknr.com")
    
    contents = await file.read()
    df = pd.read_excel(io.BytesIO(contents))
    df = df.where(pd.notnull(df), None)
    
    imported_count = 0
    for _, row in df.iterrows():
        # Find or create group dynamically
        group_name = row.get("Group Name") or "Suspense Account"
        group_type = row.get("Group Type") or "ASSET"
        group = PostingEngineService.get_or_create_group(db, comp_code, group_name, group_type)
        
        ledger_name = row.get("Ledger Name")
        if not ledger_name:
            continue
            
        exists = db.query(LedgerMaster).filter(
            LedgerMaster.company_id == comp_code,
            LedgerMaster.ledger_name == ledger_name
        ).first()
        
        if not exists:
            ledger = LedgerMaster(
                company_id=comp_code,
                ledger_name=ledger_name,
                group_id=group.id,
                opening_balance=float(row.get("Opening Balance") or 0.0),
                opening_balance_type=row.get("Balance Type") or 'DR',
                gstin=row.get("GSTIN"),
                pan=row.get("PAN"),
                status='ACTIVE',
                created_by=email
            )
            db.add(ledger)
            imported_count += 1
            
    db.commit()
    return {"success": True, "message": f"Successfully imported {imported_count} ledgers."}

# =========================================================================
# 3. VOUCHER TRANSACTION APIs
# =========================================================================
@router.post("/vouchers")
def create_voucher_entry(request: Request, payload: VoucherCreate, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    email = request.session.get("email", "system@bknr.com")
    
    v_type = db.query(VoucherType).filter(
        VoucherType.id == payload.voucher_type_id,
        VoucherType.company_id == comp_code
    ).first()
    if not v_type:
        raise HTTPException(status_code=404, detail="Voucher type configuration not found")

    if len(payload.details) < 2:
        raise HTTPException(status_code=400, detail="A voucher requires at least two ledger lines")

    # Format detail mapping list
    details_mapped = []
    for d in payload.details:
        ledger = db.query(LedgerMaster).filter(
            LedgerMaster.id == d.ledger_id,
            LedgerMaster.company_id == comp_code,
            LedgerMaster.status == "ACTIVE",
        ).first()
        if not ledger:
            raise HTTPException(status_code=404, detail=f"Ledger with ID {d.ledger_id} not found")
        if d.debit_amount < 0 or d.credit_amount < 0 or (d.debit_amount > 0 and d.credit_amount > 0):
            raise HTTPException(status_code=400, detail="Each line must contain either a positive debit or credit")
        if d.debit_amount == 0 and d.credit_amount == 0:
            raise HTTPException(status_code=400, detail="Zero-value voucher lines are not allowed")
        if d.cost_center_id is not None:
            cost_center = db.query(CostCenter).filter(
                CostCenter.id == d.cost_center_id,
                CostCenter.company_id == comp_code,
            ).first()
            if not cost_center:
                raise HTTPException(status_code=400, detail="Invalid cost center")
        details_mapped.append({
            "ledger_name": ledger.ledger_name,
            "group_name": ledger.group.group_name,
            "group_type": ledger.group.group_type,
            "cost_center_id": d.cost_center_id,
            "debit_amount": d.debit_amount,
            "credit_amount": d.credit_amount,
            "remarks": d.remarks
        })

    try:
        voucher = PostingEngineService.create_voucher(
            db=db,
            company_id=comp_code,
            voucher_type_name=v_type.name,
            voucher_date=payload.voucher_date,
            narration=payload.narration or "",
            details=details_mapped,
            reference_no=payload.reference_no,
            created_by=email,
            status='SUBMITTED'
        )
        db.commit()
        return {"success": True, "message": f"Voucher submitted for approval: {voucher.voucher_no}", "voucher_id": voucher.id, "status": voucher.status}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/vouchers/{voucher_id}/submit")
def submit_voucher(voucher_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    email = request.session.get("email", "system@bknr.com")
    
    voucher = db.query(VoucherHeader).filter(
        VoucherHeader.id == voucher_id, 
        VoucherHeader.company_id == comp_code
    ).first()
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
        
    if voucher.status != 'DRAFT':
        raise HTTPException(status_code=400, detail="Only DRAFT vouchers can be submitted")
        
    old_status = voucher.status
    voucher.status = 'SUBMITTED'
    
    PostingEngineService.write_finance_audit(
        db, comp_code, 'voucher_headers', voucher.id, 'UPDATE', 
        {"status": old_status}, {"status": 'SUBMITTED'}, email
    )
    db.commit()
    return {"success": True, "message": "Voucher submitted for approval"}

@router.post("/vouchers/{voucher_id}/approve")
def approve_voucher(voucher_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    require_finance_admin(request)
    email = request.session.get("email", "system@bknr.com")
    
    voucher = db.query(VoucherHeader).filter(
        VoucherHeader.id == voucher_id, 
        VoucherHeader.company_id == comp_code
    ).first()
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
        
    if voucher.status != 'SUBMITTED':
        raise HTTPException(status_code=400, detail="Only SUBMITTED vouchers can be approved")
    if str(voucher.created_by or "").strip().lower() == str(email or "").strip().lower():
        raise HTTPException(status_code=400, detail="Maker and approver must be different users")
        
    old_status = voucher.status
    voucher.status = 'APPROVED'
    voucher.approved_by = email
    voucher.approved_date = datetime.now()
    
    # Auto-post to accounts once approved
    voucher.status = 'POSTED'
    
    PostingEngineService.write_finance_audit(
        db, comp_code, 'voucher_headers', voucher.id, 'APPROVE', 
        {"status": old_status}, {"status": 'POSTED', "approved_by": email}, email
    )
    db.commit()
    return {"success": True, "message": "Voucher approved and posted successfully"}


@router.post("/vouchers/{voucher_id}/reject")
def reject_voucher(voucher_id: int, payload: VoucherDecision, request: Request, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    require_finance_admin(request)
    email = request.session.get("email", "system@bknr.com")
    voucher = db.query(VoucherHeader).filter(
        VoucherHeader.id == voucher_id,
        VoucherHeader.company_id == comp_code,
    ).first()
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    if voucher.status != "SUBMITTED":
        raise HTTPException(status_code=400, detail="Only SUBMITTED vouchers can be rejected")
    old_status = voucher.status
    voucher.status = "REJECTED"
    PostingEngineService.write_finance_audit(
        db, comp_code, "voucher_headers", voucher.id, "REJECT",
        {"status": old_status}, {"status": "REJECTED", "remarks": payload.remarks}, email,
    )
    db.commit()
    return {"success": True, "message": "Voucher rejected successfully"}


@router.post("/vouchers/{voucher_id}/reverse")
def reverse_voucher(voucher_id: int, payload: VoucherDecision, request: Request, db: Session = Depends(get_db)):
    """Post an immutable contra voucher instead of deleting a posted transaction."""
    comp_code = require_company_code(request)
    require_finance_admin(request)
    email = request.session.get("email", "system@bknr.com")
    reason = str(payload.remarks or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Reversal reason is required")
    voucher = db.query(VoucherHeader).options(
        joinedload(VoucherHeader.details).joinedload(VoucherDetail.ledger).joinedload(LedgerMaster.group),
        joinedload(VoucherHeader.voucher_type),
    ).filter(
        VoucherHeader.id == voucher_id,
        VoucherHeader.company_id == comp_code,
        VoucherHeader.status == "POSTED",
    ).first()
    if not voucher:
        raise HTTPException(status_code=404, detail="Posted voucher not found")
    already_reversed = db.query(FinanceAuditTrail.id).filter(
        FinanceAuditTrail.company_id == comp_code,
        FinanceAuditTrail.table_name == "voucher_headers",
        FinanceAuditTrail.record_id == voucher.id,
        FinanceAuditTrail.action == "REVERSE",
    ).first()
    if already_reversed:
        raise HTTPException(status_code=400, detail="Voucher has already been reversed")
    lines = [{
        "ledger_name": line.ledger.ledger_name,
        "group_name": line.ledger.group.group_name,
        "group_type": line.ledger.group.group_type,
        "cost_center_id": line.cost_center_id,
        "debit_amount": float(line.credit_amount or 0),
        "credit_amount": float(line.debit_amount or 0),
        "remarks": f"Reversal of {voucher.voucher_no}: {reason}",
    } for line in voucher.details]
    try:
        reversal = PostingEngineService.create_voucher(
            db, comp_code, "Journal", ist_now().date(),
            f"Reversal of {voucher.voucher_no}: {reason}", lines,
            reference_no=f"REV-{voucher.voucher_no}", created_by=email, status="POSTED",
        )
        PostingEngineService.write_finance_audit(
            db, comp_code, "voucher_headers", voucher.id, "REVERSE",
            {"status": "POSTED"}, {"reversal_voucher_id": reversal.id, "reason": reason}, email,
        )
        db.commit()
        return {"success": True, "message": f"Reversal posted successfully: {reversal.voucher_no}", "voucher_id": reversal.id}
    except Exception as error:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(error)) from error

# =========================================================================
# 4. REPORT APIs
# =========================================================================
@router.get("/reports/trial-balance")
def report_trial_balance(request: Request, as_of_date: Optional[date] = None, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    tb = AccountingReportsService.get_trial_balance(db, comp_code, as_of_date or ist_now().date())
    return {"success": True, "data": tb}

@router.get("/reports/profit-loss")
def report_profit_loss(request: Request, start_date: Optional[date] = None, end_date: Optional[date] = None, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    default_start, default_end = current_financial_period()
    start_date, end_date = start_date or default_start, end_date or default_end
    pl = AccountingReportsService.get_profit_and_loss(db, comp_code, start_date, end_date)
    return {"success": True, "data": pl}

@router.get("/reports/balance-sheet")
def report_balance_sheet(request: Request, as_of_date: Optional[date] = None, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    bs = AccountingReportsService.get_balance_sheet(db, comp_code, as_of_date or ist_now().date())
    return {"success": True, "data": bs}

@router.get("/reports/ledger-statement")
def report_ledger_statement(request: Request, ledger_id: int, start_date: date, end_date: date, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    statement = AccountingReportsService.get_ledger_statement(db, ledger_id, start_date, end_date, comp_code)
    if not statement:
        raise HTTPException(status_code=404, detail="Ledger not found")
    return {"success": True, "data": statement}

@router.get("/reports/day-book")
def report_day_book(request: Request, target_date: Optional[date] = None, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    return {"success": True, "data": AccountingReportsService.get_day_book(db, comp_code, target_date or ist_now().date())}

@router.get("/reports/gst-summary")
def report_gst_summary(request: Request, start_date: Optional[date] = None, end_date: Optional[date] = None, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    default_start, default_end = current_financial_period()
    start_date, end_date = start_date or default_start, end_date or default_end
    return {"success": True, "data": AccountingReportsService.get_gst_summary(db, comp_code, start_date, end_date)}


@router.get("/reports/voucher-register")
def report_voucher_register(request: Request, start_date: Optional[date] = None, end_date: Optional[date] = None, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    default_start, default_end = current_financial_period()
    return {"success": True, "data": AccountingReportsService.get_voucher_register(db, comp_code, start_date or default_start, end_date or default_end)}


@router.get("/reports/cash-flow")
def report_cash_flow(request: Request, start_date: Optional[date] = None, end_date: Optional[date] = None, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    default_start, default_end = current_financial_period()
    return {"success": True, "data": AccountingReportsService.get_cash_flow(db, comp_code, start_date or default_start, end_date or default_end)}


@router.get("/reports/aging")
def report_aging(request: Request, as_of_date: Optional[date] = None, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    return {"success": True, "data": AccountingReportsService.get_aging_report(db, comp_code, as_of_date or ist_now().date())}


@router.get("/controls/audit")
def accounting_control_audit(request: Request, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    return {"success": True, "data": AccountingReportsService.get_control_audit(db, comp_code)}


@router.get("/financial-years")
def list_financial_years(request: Request, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    rows = db.query(FinancialYearMaster).filter(
        FinancialYearMaster.company_id == comp_code
    ).order_by(FinancialYearMaster.start_date.desc()).all()
    return {"success": True, "data": [{
        "id": row.id, "year_name": row.year_name,
        "start_date": row.start_date.isoformat(), "end_date": row.end_date.isoformat(),
        "is_locked": bool(row.is_locked),
    } for row in rows]}


@router.post("/financial-years")
def create_financial_year(payload: FinancialYearCreate, request: Request, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    require_finance_admin(request)
    overlap = db.query(FinancialYearMaster.id).filter(
        FinancialYearMaster.company_id == comp_code,
        FinancialYearMaster.start_date <= payload.end_date,
        FinancialYearMaster.end_date >= payload.start_date,
    ).first()
    if overlap:
        raise HTTPException(status_code=400, detail="Financial year overlaps an existing period")
    row = FinancialYearMaster(company_id=comp_code, **payload.model_dump())
    db.add(row)
    db.commit()
    return {"success": True, "message": "Financial year created successfully", "id": row.id}


@router.post("/financial-years/{year_id}/lock")
def set_financial_year_lock(year_id: int, locked: bool, request: Request, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    require_finance_admin(request)
    row = db.query(FinancialYearMaster).filter(
        FinancialYearMaster.id == year_id,
        FinancialYearMaster.company_id == comp_code,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Financial year not found")
    row.is_locked = locked
    db.commit()
    return {"success": True, "message": f"Financial year {'locked' if locked else 'unlocked'} successfully"}

@router.get("/dashboard/summary")
def accounting_dashboard_summary(request: Request, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    ensure_default_accounting_setup(db, comp_code, request.session.get("email", "SYSTEM"))
    as_of_date = ist_now().date()
    tb = AccountingReportsService.get_trial_balance(db, comp_code, as_of_date)
    fy_start = date(as_of_date.year if as_of_date.month >= 4 else as_of_date.year - 1, 4, 1)
    pl = AccountingReportsService.get_profit_and_loss(db, comp_code, fy_start, as_of_date)
    bs = AccountingReportsService.get_balance_sheet(db, comp_code, as_of_date)
    day_book = AccountingReportsService.get_day_book(db, comp_code, as_of_date)

    cash_bank = sum(
        row["balance"] for row in tb
        if row["type"] == "LEDGER" and row["group_type"] == "ASSET"
        and row.get("group_name") in {"Cash-in-hand", "Bank Accounts"}
    )
    receivables = sum(
        row["balance"] for row in tb
        if row["type"] == "LEDGER" and row["group_type"] == "ASSET"
        and row.get("group_name") == "Sundry Debtors"
    )
    payables = abs(sum(
        row["balance"] for row in tb
        if row["type"] == "LEDGER" and row["group_type"] == "LIABILITY"
        and row.get("group_name") == "Sundry Creditors"
    ))

    return {
        "success": True,
        "as_of_date": as_of_date.isoformat(),
        "kpis": {
            "cash_bank": cash_bank,
            "receivables": receivables,
            "payables": payables,
            "income": pl["total_income"],
            "expense": pl["total_expense"],
            "net_profit": pl["net_profit"],
            "assets": bs["total_assets"],
            "liabilities": bs["total_liabilities"],
            "equity": bs["total_equity"],
            "day_vouchers": len(day_book),
        },
        "balance_sheet_balanced": bs["is_balanced"],
        "balance_sheet_difference": bs["difference"],
    }

@router.get("/dashboard/summary/details")
def accounting_dashboard_summary_details(
    request: Request,
    metric: str = Query(..., pattern="^(income|expense|assets|liabilities_equity|cash_bank|receivables|payables|net_profit)$"),
    db: Session = Depends(get_db),
):
    comp_code = require_company_code(request)
    ensure_default_accounting_setup(db, comp_code, request.session.get("email", "SYSTEM"))
    as_of_date = ist_now().date()
    fy_start = date(as_of_date.year if as_of_date.month >= 4 else as_of_date.year - 1, 4, 1)

    labels = {
        "income": "Total Income",
        "expense": "Total Expense",
        "assets": "Assets",
        "liabilities_equity": "Liabilities + Equity",
        "cash_bank": "Cash & Bank",
        "receivables": "Receivables",
        "payables": "Payables",
        "net_profit": "Net Profit",
    }
    group_types = {
        "income": ["INCOME"],
        "expense": ["EXPENSE"],
        "assets": ["ASSET"],
        "liabilities_equity": ["LIABILITY", "EQUITY"],
        "cash_bank": ["ASSET"],
        "receivables": ["ASSET"],
        "payables": ["LIABILITY"],
        "net_profit": ["INCOME", "EXPENSE"],
    }[metric]
    group_name_filters = {
        "cash_bank": ["Cash-in-hand", "Bank Accounts"],
        "receivables": ["Sundry Debtors"],
        "payables": ["Sundry Creditors"],
    }

    posted_debit = case((VoucherHeader.id.isnot(None), VoucherDetail.debit_amount), else_=0.0)
    posted_credit = case((VoucherHeader.id.isnot(None), VoucherDetail.credit_amount), else_=0.0)

    ledger_rows = db.query(
        LedgerMaster.id.label("ledger_id"),
        LedgerMaster.ledger_name,
        LedgerMaster.opening_balance,
        LedgerMaster.opening_balance_type,
        AccountGroup.group_name,
        AccountGroup.group_type,
        func.coalesce(func.sum(posted_debit), 0.0).label("debits"),
        func.coalesce(func.sum(posted_credit), 0.0).label("credits"),
    ).join(AccountGroup, AccountGroup.id == LedgerMaster.group_id).outerjoin(
        VoucherDetail, VoucherDetail.ledger_id == LedgerMaster.id
    ).outerjoin(
        VoucherHeader,
        (VoucherHeader.id == VoucherDetail.voucher_id)
        & (VoucherHeader.company_id == comp_code)
        & (VoucherHeader.status == "POSTED")
        & (
            VoucherHeader.voucher_date.between(fy_start, as_of_date)
            if metric in {"income", "expense", "net_profit"}
            else (VoucherHeader.voucher_date <= as_of_date)
        ),
    ).filter(
        LedgerMaster.company_id == comp_code,
        AccountGroup.group_type.in_(group_types),
    )
    if metric in group_name_filters:
        ledger_rows = ledger_rows.filter(AccountGroup.group_name.in_(group_name_filters[metric]))
    ledger_rows = ledger_rows.group_by(
        LedgerMaster.id,
        LedgerMaster.ledger_name,
        LedgerMaster.opening_balance,
        LedgerMaster.opening_balance_type,
        AccountGroup.group_name,
        AccountGroup.group_type,
    ).order_by(AccountGroup.group_name, LedgerMaster.ledger_name).all()

    ledger_summary = []
    total_amount = 0.0
    for row in ledger_rows:
        opening = float(row.opening_balance or 0.0)
        if row.opening_balance_type != "DR":
            opening = -opening
        debits = float(row.debits or 0.0)
        credits = float(row.credits or 0.0)
        balance = (0.0 if metric in {"income", "expense", "net_profit"} else opening) + debits - credits
        if metric == "income":
            amount = credits - debits
        elif metric == "net_profit":
            amount = credits - debits if row.group_type == "INCOME" else -(debits - credits)
        elif metric in {"expense", "assets", "cash_bank", "receivables"}:
            amount = balance
        else:
            amount = -balance
        if abs(amount) > 0.01 or abs(opening) > 0.01 or abs(debits) > 0.01 or abs(credits) > 0.01:
            total_amount += amount
            ledger_summary.append({
                "ledger_id": row.ledger_id,
                "ledger_name": row.ledger_name,
                "group_name": row.group_name,
                "group_type": row.group_type,
                "opening": round(opening, 2),
                "debit": round(debits, 2),
                "credit": round(credits, 2),
                "amount": round(amount, 2),
            })

    if metric == "liabilities_equity":
        pl = AccountingReportsService.get_profit_and_loss(db, comp_code, date(1900, 1, 1), as_of_date)
        retained = float(pl["net_profit"] or 0.0)
        if abs(retained) > 0.01:
            total_amount += retained
            ledger_summary.append({
                "ledger_id": None,
                "ledger_name": "Retained Earnings (P&L to Date)",
                "group_name": "Equity",
                "group_type": "EQUITY",
                "opening": 0.0,
                "debit": 0.0,
                "credit": 0.0,
                "amount": round(retained, 2),
            })

    tx_query = db.query(
        VoucherHeader.voucher_date,
        VoucherHeader.voucher_no,
        VoucherHeader.reference_no,
        VoucherHeader.narration,
        VoucherType.name.label("voucher_type"),
        LedgerMaster.ledger_name,
        AccountGroup.group_name,
        AccountGroup.group_type,
        VoucherDetail.debit_amount,
        VoucherDetail.credit_amount,
        VoucherDetail.remarks,
    ).join(VoucherDetail, VoucherDetail.voucher_id == VoucherHeader.id).join(
        LedgerMaster, LedgerMaster.id == VoucherDetail.ledger_id
    ).join(AccountGroup, AccountGroup.id == LedgerMaster.group_id).join(
        VoucherType, VoucherType.id == VoucherHeader.voucher_type_id
    ).filter(
        VoucherHeader.company_id == comp_code,
        VoucherHeader.status == "POSTED",
        AccountGroup.group_type.in_(group_types),
    )
    if metric in group_name_filters:
        tx_query = tx_query.filter(AccountGroup.group_name.in_(group_name_filters[metric]))
    if metric in {"income", "expense", "net_profit"}:
        tx_query = tx_query.filter(VoucherHeader.voucher_date.between(fy_start, as_of_date))
    else:
        tx_query = tx_query.filter(VoucherHeader.voucher_date <= as_of_date)

    transactions = []
    for row in tx_query.order_by(VoucherHeader.voucher_date.desc(), VoucherHeader.id.desc()).limit(500).all():
        debit = float(row.debit_amount or 0.0)
        credit = float(row.credit_amount or 0.0)
        if metric == "income":
            contribution = credit - debit
        elif metric == "net_profit":
            contribution = credit - debit if row.group_type == "INCOME" else -(debit - credit)
        elif metric in {"expense", "assets", "cash_bank", "receivables"}:
            contribution = debit - credit
        else:
            contribution = credit - debit
        transactions.append({
            "date": row.voucher_date.isoformat() if row.voucher_date else "",
            "voucher_no": row.voucher_no,
            "voucher_type": row.voucher_type,
            "reference_no": row.reference_no or "",
            "ledger_name": row.ledger_name,
            "group_name": row.group_name,
            "debit": round(debit, 2),
            "credit": round(credit, 2),
            "amount": round(contribution, 2),
            "remarks": row.remarks or row.narration or "",
        })

    return {
        "success": True,
        "metric": metric,
        "title": labels[metric],
        "period": f"{fy_start.isoformat()} to {as_of_date.isoformat()}" if metric in {"income", "expense", "net_profit"} else f"Up to {as_of_date.isoformat()}",
        "total_amount": round(total_amount, 2),
        "ledger_summary": ledger_summary,
        "transactions": transactions,
        "transaction_limit": 500,
    }

@router.post("/setup/defaults")
def setup_default_accounting(request: Request, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    email = request.session.get("email", "SYSTEM")
    created = ensure_default_accounting_setup(db, comp_code, email)
    return {"success": True, "message": "Default Tally-style accounting masters are ready.", "created": created}

# =========================================================================
# 5. BANK RECONCILIATION API
# =========================================================================
@router.get("/bank/statements")
def list_bank_statements(request: Request, bank_ledger_id: int, matched: Optional[bool] = None, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    query = db.query(BankReconciliation).filter(
        BankReconciliation.company_id == comp_code,
        BankReconciliation.bank_ledger_id == bank_ledger_id,
    )
    if matched is not None:
        query = query.filter(BankReconciliation.is_matched == matched)
    rows = query.order_by(BankReconciliation.statement_date.desc(), BankReconciliation.id.desc()).limit(2000).all()
    return {"success": True, "data": [{
        "id": row.id,
        "statement_date": row.statement_date.isoformat(),
        "reference_no": row.reference_no,
        "debit": row.debit,
        "credit": row.credit,
        "is_matched": row.is_matched,
        "matched_date": row.matched_date.isoformat() if row.matched_date else None,
        "voucher_detail_id": row.voucher_detail_id,
        "remarks": row.remarks,
    } for row in rows]}


@router.get("/bank/statements/export/pdf")
def export_bank_reconciliation_pdf(
    request: Request,
    bank_ledger_id: int,
    matched: Optional[bool] = None,
    db: Session = Depends(get_db),
):
    comp_code = require_company_code(request)
    bank_ledger = db.query(LedgerMaster).filter(
        LedgerMaster.id == bank_ledger_id,
        LedgerMaster.company_id == comp_code,
    ).first()
    if not bank_ledger:
        raise HTTPException(status_code=404, detail="Bank ledger not found")
    query = db.query(BankReconciliation).filter(
        BankReconciliation.company_id == comp_code,
        BankReconciliation.bank_ledger_id == bank_ledger_id,
    )
    if matched is not None:
        query = query.filter(BankReconciliation.is_matched == matched)
    rows = query.order_by(BankReconciliation.statement_date, BankReconciliation.id).all()
    debit_total = round(sum(float(row.debit or 0) for row in rows), 2)
    credit_total = round(sum(float(row.credit or 0) for row in rows), 2)
    matched_count = sum(1 for row in rows if row.is_matched)
    status_label = "Matched" if matched is True else ("Unmatched" if matched is False else "All Entries")
    company_name = str(request.session.get("company_name") or comp_code)

    body_rows = "".join(
        "<tr>"
        f"<td>{html.escape(row.statement_date.strftime('%d-%m-%Y'))}</td>"
        f"<td>{html.escape(str(row.reference_no or '—'))}</td>"
        f"<td class='num'>₹{float(row.debit or 0):,.2f}</td>"
        f"<td class='num'>₹{float(row.credit or 0):,.2f}</td>"
        f"<td class='status {'matched' if row.is_matched else 'unmatched'}'>{'MATCHED' if row.is_matched else 'UNMATCHED'}</td>"
        f"<td>{html.escape(str(row.remarks or '—'))}</td>"
        "</tr>"
        for row in rows
    )
    if not body_rows:
        body_rows = "<tr><td colspan='6' class='empty'>No reconciliation entries found for the selected filter.</td></tr>"
    report_html = f"""
    <!doctype html>
    <html><head><meta charset="utf-8"><style>
    @page {{ size:A4 portrait; margin:10mm; }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; color:#172033; font-family:Arial,sans-serif; font-size:8.5pt; }}
    .brand {{ height:5px; margin-bottom:10px; background:#123b5d; }}
    .header {{ display:flex; justify-content:space-between; gap:20px; padding-bottom:8px; border-bottom:2px solid #123b5d; }}
    h1 {{ margin:0; color:#123b5d; font-size:16pt; text-transform:uppercase; }}
    h2 {{ margin:2px 0 0; color:#176b87; font-size:10pt; }}
    .meta {{ text-align:right; color:#52677a; line-height:1.45; }}
    .summary {{ display:grid; grid-template-columns:repeat(4,1fr); margin:10px 0; border:1px solid #b9c9d4; }}
    .summary div {{ padding:7px; border-right:1px solid #b9c9d4; }}
    .summary div:last-child {{ border-right:0; }}
    .summary small {{ display:block; color:#607181; font-size:6.5pt; font-weight:bold; text-transform:uppercase; }}
    .summary strong {{ display:block; margin-top:2px; color:#123b5d; font-size:9pt; }}
    table {{ width:100%; border-collapse:collapse; }}
    th,td {{ padding:5px 6px; border:1px solid #b9c9d4; vertical-align:top; }}
    th {{ color:#fff; background:#123b5d; font-size:7pt; text-transform:uppercase; }}
    tbody tr:nth-child(even) {{ background:#f5f8fa; }}
    .num {{ text-align:right; white-space:nowrap; }}
    .status {{ text-align:center; font-size:7pt; font-weight:bold; }}
    .matched {{ color:#047857; }} .unmatched {{ color:#b45309; }}
    tfoot td {{ color:#123b5d; background:#eaf5f8; font-weight:bold; }}
    .empty {{ padding:24px; text-align:center; color:#607181; }}
    .footer {{ margin-top:10px; padding-top:5px; border-top:1px solid #b9c9d4; color:#607181; font-size:6.5pt; text-align:center; }}
    </style></head><body>
      <div class="brand"></div>
      <div class="header">
        <div><h1>{html.escape(company_name)}</h1><h2>Bank Reconciliation Statement</h2></div>
        <div class="meta"><b>{html.escape(bank_ledger.ledger_name)}</b><br>Filter: {status_label}<br>Generated: {ist_now().strftime('%d-%m-%Y %I:%M %p')}</div>
      </div>
      <div class="summary">
        <div><small>Statement Entries</small><strong>{len(rows)}</strong></div>
        <div><small>Matched Entries</small><strong>{matched_count}</strong></div>
        <div><small>Total Debit</small><strong>₹{debit_total:,.2f}</strong></div>
        <div><small>Total Credit</small><strong>₹{credit_total:,.2f}</strong></div>
      </div>
      <table>
        <thead><tr><th>Date</th><th>Reference</th><th>Debit</th><th>Credit</th><th>Status</th><th>Remarks</th></tr></thead>
        <tbody>{body_rows}</tbody>
        <tfoot><tr><td colspan="2">TOTAL</td><td class="num">₹{debit_total:,.2f}</td><td class="num">₹{credit_total:,.2f}</td><td colspan="2">{matched_count} of {len(rows)} matched</td></tr></tfoot>
      </table>
      <div class="footer">System-generated bank reconciliation control report · {html.escape(comp_code)}</div>
    </body></html>
    """
    try:
        pdf = render_pdf_from_html(report_html)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Unable to generate reconciliation PDF: {exc}") from exc
    safe_ledger = "".join(char if char.isalnum() else "_" for char in bank_ledger.ledger_name).strip("_") or "Bank"
    return StreamingResponse(
        io.BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="Bank_Reconciliation_{safe_ledger}.pdf"'},
    )


@router.post("/bank/statements/import")
async def import_bank_statement(
    request: Request,
    bank_ledger_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Import CSV/XLSX statements using Date, Reference, Debit and Credit columns."""
    comp_code = require_company_code(request)
    email = request.session.get("email", "SYSTEM")
    bank_ledger = db.query(LedgerMaster).filter(
        LedgerMaster.id == bank_ledger_id,
        LedgerMaster.company_id == comp_code,
    ).first()
    if not bank_ledger:
        raise HTTPException(status_code=404, detail="Bank ledger not found")
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Statement file is empty")
    try:
        name = str(file.filename or "").lower()
        if name.endswith(".pdf"):
            frame = extract_bank_statement_pdf(content)
        elif name.endswith(".csv"):
            frame = pd.read_csv(io.BytesIO(content))
        elif name.endswith((".xlsx", ".xls")):
            frame = pd.read_excel(io.BytesIO(content))
        else:
            raise ValueError("Supported statement formats are PDF, CSV, XLSX and XLS")
        aliases = {
            "date": {"date", "transaction date", "txn date", "value date", "statement date"},
            "reference": {"reference", "reference no", "utr", "utr no", "cheque no", "transaction id", "ref no"},
            "debit": {"debit", "withdrawal", "withdrawal amount", "dr"},
            "credit": {"credit", "deposit", "deposit amount", "cr"},
            "remarks": {"remarks", "description", "narration", "particulars"},
        }
        columns = {str(column).strip().lower(): column for column in frame.columns}
        selected = {key: next((columns[value] for value in values if value in columns), None) for key, values in aliases.items()}
        if not selected["date"] or (not selected["debit"] and not selected["credit"]):
            raise ValueError("Required columns: Date and at least one of Debit/Credit")
        imported = skipped = 0
        imported_rows = []
        for _, data in frame.iterrows():
            parsed_date = pd.to_datetime(data[selected["date"]], errors="coerce")
            if pd.isna(parsed_date):
                skipped += 1
                continue
            debit = round(float(pd.to_numeric(data[selected["debit"]], errors="coerce") or 0), 2) if selected["debit"] else 0.0
            credit = round(float(pd.to_numeric(data[selected["credit"]], errors="coerce") or 0), 2) if selected["credit"] else 0.0
            if pd.isna(debit): debit = 0.0
            if pd.isna(credit): credit = 0.0
            if (debit <= 0) == (credit <= 0):
                skipped += 1
                continue
            reference = _statement_text(data[selected["reference"]], 50) if selected["reference"] else None
            exists = db.query(BankReconciliation.id).filter(
                BankReconciliation.company_id == comp_code,
                BankReconciliation.bank_ledger_id == bank_ledger_id,
                BankReconciliation.statement_date == parsed_date.date(),
                func.coalesce(BankReconciliation.reference_no, "") == (reference or ""),
                BankReconciliation.debit == debit,
                BankReconciliation.credit == credit,
            ).first()
            if exists:
                skipped += 1
                continue
            remarks = _statement_text(data[selected["remarks"]], 255) if selected["remarks"] else None
            statement_row = BankReconciliation(
                company_id=comp_code, bank_ledger_id=bank_ledger_id,
                statement_date=parsed_date.date(), reference_no=reference,
                debit=debit, credit=credit, remarks=remarks,
            )
            db.add(statement_row)
            imported_rows.append(statement_row)
            imported += 1
        db.flush()
        PostingEngineService.write_finance_audit(
            db, comp_code, "bank_reconciliations", bank_ledger_id, "IMPORT", None,
            {
                "file": file.filename,
                "imported": imported,
                "skipped": skipped,
                "row_ids": [row.id for row in imported_rows],
            },
            email,
        )
        db.commit()
        return {"success": True, "message": f"Imported {imported} statement entries; skipped {skipped}.", "imported": imported, "skipped": skipped}
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/bank/statements/rollback-last-pdf-import")
def rollback_last_bank_pdf_import(
    request: Request,
    bank_ledger_id: int,
    db: Session = Depends(get_db),
):
    comp_code = require_company_code(request)
    require_finance_admin(request)
    email = request.session.get("email", "SYSTEM")
    imports = db.query(FinanceAuditTrail).filter(
        FinanceAuditTrail.company_id == comp_code,
        FinanceAuditTrail.table_name == "bank_reconciliations",
        FinanceAuditTrail.record_id == bank_ledger_id,
        FinanceAuditTrail.action == "IMPORT",
    ).order_by(FinanceAuditTrail.id.desc()).limit(100).all()
    latest_pdf_audit = None
    latest_pdf_payload = None
    for audit in imports:
        try:
            payload = json.loads(audit.new_value or "{}")
        except (TypeError, json.JSONDecodeError):
            continue
        if str(payload.get("file") or "").lower().endswith(".pdf"):
            latest_pdf_audit = audit
            latest_pdf_payload = payload
            break
    if not latest_pdf_audit:
        raise HTTPException(status_code=404, detail="No PDF bank statement import found for this ledger")

    rollback_audits = db.query(FinanceAuditTrail).filter(
        FinanceAuditTrail.company_id == comp_code,
        FinanceAuditTrail.table_name == "bank_reconciliations",
        FinanceAuditTrail.record_id == bank_ledger_id,
        FinanceAuditTrail.action == "ROLLBACK",
    ).all()
    for audit in rollback_audits:
        try:
            old_value = json.loads(audit.old_value or "{}")
        except (TypeError, json.JSONDecodeError):
            continue
        if old_value.get("import_audit_id") == latest_pdf_audit.id:
            raise HTTPException(status_code=400, detail="Latest PDF import has already been rolled back")

    row_ids = [int(row_id) for row_id in latest_pdf_payload.get("row_ids", []) if row_id]
    imported_count = int(latest_pdf_payload.get("imported") or 0)
    if imported_count <= 0:
        raise HTTPException(status_code=400, detail="Latest PDF import did not add any statement entries")
    if not row_ids:
        if not imports or imports[0].id != latest_pdf_audit.id:
            raise HTTPException(
                status_code=400,
                detail="This legacy PDF import cannot be rolled back after a newer statement import",
            )
        row_ids = [
            row.id for row in db.query(BankReconciliation).filter(
                BankReconciliation.company_id == comp_code,
                BankReconciliation.bank_ledger_id == bank_ledger_id,
            ).order_by(BankReconciliation.id.desc()).limit(imported_count).all()
        ]
    rows = db.query(BankReconciliation).filter(
        BankReconciliation.company_id == comp_code,
        BankReconciliation.bank_ledger_id == bank_ledger_id,
        BankReconciliation.id.in_(row_ids),
    ).with_for_update().all()
    if len(rows) != len(set(row_ids)):
        raise HTTPException(status_code=400, detail="Latest PDF import rows could not be identified safely")
    if any(row.is_matched for row in rows):
        raise HTTPException(
            status_code=400,
            detail="Latest PDF import contains matched entries. Unmatch them before rollback.",
        )
    deleted_ids = [row.id for row in rows]
    for row in rows:
        db.delete(row)
    PostingEngineService.write_finance_audit(
        db,
        comp_code,
        "bank_reconciliations",
        bank_ledger_id,
        "ROLLBACK",
        {
            "import_audit_id": latest_pdf_audit.id,
            "file": latest_pdf_payload.get("file"),
            "row_ids": deleted_ids,
        },
        {"deleted": len(deleted_ids)},
        email,
    )
    db.commit()
    return {
        "success": True,
        "message": f"Rolled back {len(deleted_ids)} entries from {latest_pdf_payload.get('file') or 'latest PDF import'}.",
        "deleted": len(deleted_ids),
    }


@router.post("/bank/auto-match")
def auto_match_bank_statement(request: Request, bank_ledger_id: int, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    bank_ledger = db.query(LedgerMaster).filter(
        LedgerMaster.id == bank_ledger_id,
        LedgerMaster.company_id == comp_code,
    ).first()
    if not bank_ledger:
        raise HTTPException(status_code=404, detail="Bank ledger not found")
    
    # Fetch unmatched statements
    unmatched_stmts = db.query(BankReconciliation).filter(
        BankReconciliation.company_id == comp_code,
        BankReconciliation.bank_ledger_id == bank_ledger_id,
        BankReconciliation.is_matched == False
    ).with_for_update().all()

    matched_count = 0
    used_detail_ids = {
        row[0] for row in db.query(BankReconciliation.voucher_detail_id).filter(
            BankReconciliation.company_id == comp_code,
            BankReconciliation.bank_ledger_id == bank_ledger_id,
            BankReconciliation.is_matched.is_(True),
            BankReconciliation.voucher_detail_id.isnot(None),
        ).all()
    }
    
    for stmt in unmatched_stmts:
        # Search matching Voucher Details by reference UTR and debit/credit amounts
        match_query = db.query(VoucherDetail).join(VoucherHeader).filter(
            VoucherHeader.company_id == comp_code,
            VoucherHeader.status == 'POSTED',
            VoucherDetail.ledger_id == bank_ledger_id,
            or_(
                and_(VoucherDetail.debit_amount == stmt.credit, VoucherDetail.credit_amount == 0),
                and_(VoucherDetail.credit_amount == stmt.debit, VoucherDetail.debit_amount == 0),
            ),
            or_(VoucherHeader.reference_no == stmt.reference_no, stmt.reference_no == None),
        )
        if used_detail_ids:
            match_query = match_query.filter(~VoucherDetail.id.in_(used_detail_ids))
        match = match_query.with_for_update(skip_locked=True).first()

        if match:
            stmt.is_matched = True
            stmt.matched_date = date.today()
            stmt.voucher_detail_id = match.id
            used_detail_ids.add(match.id)
            matched_count += 1

    db.commit()
    return {"success": True, "message": f"Auto-matched {matched_count} statement entries."}


@router.post("/bank/statements/{statement_id}/match/{voucher_detail_id}")
def match_bank_statement(statement_id: int, voucher_detail_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    statement = db.query(BankReconciliation).filter(
        BankReconciliation.id == statement_id,
        BankReconciliation.company_id == comp_code,
    ).with_for_update().first()
    detail = db.query(VoucherDetail).join(VoucherHeader).filter(
        VoucherDetail.id == voucher_detail_id,
        VoucherHeader.company_id == comp_code,
        VoucherHeader.status == "POSTED",
        VoucherDetail.ledger_id == statement.bank_ledger_id if statement else False,
    ).first()
    if not statement or not detail:
        raise HTTPException(status_code=404, detail="Statement or bank voucher line not found")
    existing_match = db.query(BankReconciliation.id).filter(
        BankReconciliation.company_id == comp_code,
        BankReconciliation.id != statement.id,
        BankReconciliation.is_matched.is_(True),
        BankReconciliation.voucher_detail_id == detail.id,
    ).first()
    if existing_match:
        raise HTTPException(status_code=400, detail="This bank voucher line is already matched to another statement entry")
    if round(float(detail.debit_amount or 0), 2) != round(float(statement.credit or 0), 2) or round(float(detail.credit_amount or 0), 2) != round(float(statement.debit or 0), 2):
        raise HTTPException(status_code=400, detail="Statement amount does not match the selected bank voucher line")
    statement.is_matched = True
    statement.matched_date = date.today()
    statement.voucher_detail_id = detail.id
    db.commit()
    return {"success": True, "message": "Bank statement matched successfully"}


@router.post("/bank/statements/{statement_id}/unmatch")
def unmatch_bank_statement(statement_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    require_finance_admin(request)
    statement = db.query(BankReconciliation).filter(
        BankReconciliation.id == statement_id,
        BankReconciliation.company_id == comp_code,
    ).first()
    if not statement:
        raise HTTPException(status_code=404, detail="Statement entry not found")
    statement.is_matched = False
    statement.matched_date = None
    statement.voucher_detail_id = None
    db.commit()
    return {"success": True, "message": "Bank statement match removed"}

# =========================================================================
# 6. HTML PAGE LOADERS
# =========================================================================
@router.get("/tally_dashboard")
def get_tally_dashboard(request: Request, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    ensure_default_accounting_setup(db, comp_code, request.session.get("email", "SYSTEM"))
    templates = request.app.state.templates
    return templates.TemplateResponse(
        request=request,
        name="finance_accounts/tally_dashboard.html",
        context={"request": request}
    )
