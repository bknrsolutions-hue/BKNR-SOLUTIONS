from fastapi import APIRouter, Request, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import JSONResponse, StreamingResponse
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

router = APIRouter()

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
    comp_code = request.session.get("company_code", "VNBK2162")
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
    comp_code = request.session.get("company_code", "VNBK2162")
    
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
    comp_code = request.session.get("company_code", "VNBK2162")
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

@router.post("/ledgers")
def create_ledger(request: Request, payload: LedgerCreate, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code", "VNBK2162")
    email = request.session.get("email", "system@bknr.com")
    
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
    comp_code = request.session.get("company_code", "VNBK2162")
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
    comp_code = request.session.get("company_code", "VNBK2162")
    email = request.session.get("email", "system@bknr.com")
    
    v_type = db.query(VoucherType).filter(VoucherType.id == payload.voucher_type_id).first()
    if not v_type:
        raise HTTPException(status_code=404, detail="Voucher type configuration not found")

    # Format detail mapping list
    details_mapped = []
    for d in payload.details:
        ledger = db.query(LedgerMaster).filter(LedgerMaster.id == d.ledger_id).first()
        if not ledger:
            raise HTTPException(status_code=404, detail=f"Ledger with ID {d.ledger_id} not found")
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
            status='DRAFT' # Created as draft first
        )
        db.commit()
        return {"success": True, "message": f"Voucher created in DRAFT status: {voucher.voucher_no}", "voucher_id": voucher.id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/vouchers/{voucher_id}/submit")
def submit_voucher(voucher_id: int, request: Request, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code", "VNBK2162")
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
    comp_code = request.session.get("company_code", "VNBK2162")
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
    comp_code = request.session.get("company_code", "VNBK2162")
    tb = AccountingReportsService.get_trial_balance(db, comp_code, as_of_date)
    return {"success": True, "data": tb}

@router.get("/reports/profit-loss")
def report_profit_loss(request: Request, start_date: date, end_date: date, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code", "VNBK2162")
    pl = AccountingReportsService.get_profit_and_loss(db, comp_code, start_date, end_date)
    return {"success": True, "data": pl}

@router.get("/reports/balance-sheet")
def report_balance_sheet(request: Request, as_of_date: Optional[date] = None, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code", "VNBK2162")
    bs = AccountingReportsService.get_balance_sheet(db, comp_code, as_of_date)
    return {"success": True, "data": bs}

@router.get("/reports/ledger-statement")
def report_ledger_statement(request: Request, ledger_id: int, start_date: date, end_date: date, db: Session = Depends(get_db)):
    statement = AccountingReportsService.get_ledger_statement(db, ledger_id, start_date, end_date)
    return {"success": True, "data": statement}

# =========================================================================
# 5. BANK RECONCILIATION API
# =========================================================================
@router.post("/bank/auto-match")
def auto_match_bank_statement(request: Request, bank_ledger_id: int, db: Session = Depends(get_db)):
    comp_code = request.session.get("company_code", "VNBK2162")
    
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
def get_tally_dashboard(request: Request):
    templates = request.app.state.templates
    return templates.TemplateResponse(
        request=request,
        name="finance_accounts/tally_dashboard.html",
        context={"request": request}
    )

