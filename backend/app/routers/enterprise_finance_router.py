from fastapi import APIRouter, Request, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import case, func
from sqlalchemy.orm import Session
from datetime import date, datetime
import openpyxl
import io
import pandas as pd
from typing import List, Optional
from pydantic import BaseModel

from app.database import get_db
from app.database.models.enterprise_finance import (
    AccountGroup, LedgerMaster, VoucherHeader, VoucherDetail, VoucherType,
    BranchMaster, FinancialYearMaster, CostCenter, CurrencyMaster, ExchangeRate,
    BankReconciliation, FinanceAuditTrail
)
from app.services.posting_engine import PostingEngineService
from app.services.accounting_reports import AccountingReportsService
from app.utils.timezone import ist_now

router = APIRouter()


def require_company_code(request: Request) -> str:
    company_code = request.session.get("company_code")
    if not company_code:
        raise HTTPException(status_code=401, detail="Company session is required")
    return company_code

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
    ("Export Incentive Receivable A/c", "Loans & Advances", "ASSET"),
    ("Export Incentive Income A/c", "Indirect Incomes", "INCOME"),
    ("Fixed Assets A/c", "Fixed Assets", "ASSET"),
    ("Accumulated Depreciation A/c", "Provisions", "LIABILITY"),
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
            status='POSTED'
        )
        db.commit()
        return {"success": True, "message": f"Voucher posted successfully: {voucher.voucher_no}", "voucher_id": voucher.id}
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
    email = request.session.get("email", "system@bknr.com")
    
    voucher = db.query(VoucherHeader).filter(
        VoucherHeader.id == voucher_id, 
        VoucherHeader.company_id == comp_code
    ).first()
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
        
    if voucher.status != 'SUBMITTED':
        raise HTTPException(status_code=400, detail="Only SUBMITTED vouchers can be approved")
        
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

# =========================================================================
# 4. REPORT APIs
# =========================================================================
@router.get("/reports/trial-balance")
def report_trial_balance(request: Request, as_of_date: Optional[date] = None, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    tb = AccountingReportsService.get_trial_balance(db, comp_code, as_of_date or ist_now().date())
    return {"success": True, "data": tb}

@router.get("/reports/profit-loss")
def report_profit_loss(request: Request, start_date: date, end_date: date, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
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
def report_gst_summary(request: Request, start_date: date, end_date: date, db: Session = Depends(get_db)):
    comp_code = require_company_code(request)
    return {"success": True, "data": AccountingReportsService.get_gst_summary(db, comp_code, start_date, end_date)}

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
    metric: str = Query(..., pattern="^(income|expense|assets|liabilities_equity)$"),
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
    }
    group_types = {
        "income": ["INCOME"],
        "expense": ["EXPENSE"],
        "assets": ["ASSET"],
        "liabilities_equity": ["LIABILITY", "EQUITY"],
    }[metric]

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
            if metric in {"income", "expense"}
            else (VoucherHeader.voucher_date <= as_of_date)
        ),
    ).filter(
        LedgerMaster.company_id == comp_code,
        AccountGroup.group_type.in_(group_types),
    ).group_by(
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
        balance = (0.0 if metric in {"income", "expense"} else opening) + debits - credits
        if metric == "income":
            amount = credits - debits
        elif metric in {"expense", "assets"}:
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
    if metric in {"income", "expense"}:
        tx_query = tx_query.filter(VoucherHeader.voucher_date.between(fy_start, as_of_date))
    else:
        tx_query = tx_query.filter(VoucherHeader.voucher_date <= as_of_date)

    transactions = []
    for row in tx_query.order_by(VoucherHeader.voucher_date.desc(), VoucherHeader.id.desc()).limit(500).all():
        debit = float(row.debit_amount or 0.0)
        credit = float(row.credit_amount or 0.0)
        if metric == "income":
            contribution = credit - debit
        elif metric in {"expense", "assets"}:
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
        "period": f"{fy_start.isoformat()} to {as_of_date.isoformat()}" if metric in {"income", "expense"} else f"Up to {as_of_date.isoformat()}",
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
    ).all()

    matched_count = 0
    
    for stmt in unmatched_stmts:
        # Search matching Voucher Details by reference UTR and debit/credit amounts
        match = db.query(VoucherDetail).join(VoucherHeader).filter(
            VoucherHeader.company_id == comp_code,
            VoucherHeader.status == 'POSTED',
            VoucherDetail.ledger_id == bank_ledger_id,
            VoucherDetail.debit_amount == stmt.debit,
            VoucherDetail.credit_amount == stmt.credit,
            VoucherHeader.reference_no == stmt.reference_no
        ).first()

        if match:
            stmt.is_matched = True
            stmt.matched_date = date.today()
            stmt.voucher_detail_id = match.id
            matched_count += 1

    db.commit()
    return {"success": True, "message": f"Auto-matched {matched_count} statement entries."}

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
