"""
Accounting Automations Router
===============================
API endpoints for all 10 new Tally-style accounting automation flows:
  F1 /api/accounts/opening-balance-jv           -> OB JV
  F2 /api/accounts/forex-difference-preview     -> FOREX preview for Payment/Receipt
  F3 /api/accounts/gst-position                 -> GST position + setoff/payment JV
  F4 /api/accounts/statutory-payment            -> TDS/PF/ESI/PT/EDLI/EPS/LWF Pay
  F5 /api/accounts/depreciation                  -> Depreciation auto
  F6 /api/accounts/production-wip-transfer       -> WIP->FG JV
  F7 /api/accounts/contra                        -> Bank<->Cash Contra
  F8 /api/accounts/debit-note & credit-note      -> DN/CN
  F9 /api/accounts/closing-stock-adjustment      -> Stock Valuation JV
  F10 /api/accounts/grir-accrual + reversal      -> GR/IR
"""
from fastapi import APIRouter, Request, Depends, HTTPException, Query, Body
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from datetime import date
from typing import Optional, Literal

from app.database import get_db
from app.database.models.enterprise_finance import LedgerMaster
from app.services.accounting_automations import (
    generate_ob_journal,
    compute_forex_difference,
    compute_gst_position,
    generate_gst_setoff_jv,
    generate_gst_payment_jv,
    STATUTORY_LEDGERS,
    compute_statutory_balance,
    generate_statutory_payment_jv,
    compute_monthly_depreciation,
    generate_depreciation_jv,
    build_production_transfer_jv,
    generate_contra_voucher,
    generate_debit_note,
    generate_credit_note,
    generate_closing_stock_jv,
    generate_grir_accrual_jv,
    reverse_grir_accrual,
)

router = APIRouter(prefix="/api/accounts", tags=["Accounting Automations"])


# ---------- F1: OB JV ----------
class OBRequest(BaseModel):
    voucher_date: date
    suspense_ledger: str = "Suspense A/c (OB Difference)"


@router.post("/opening-balance-jv")
def api_opening_balance_jv(req: Request, body: OBRequest, db: Session = Depends(get_db)):
    company_id = req.session.get("company_code") or req.session.get("company_id")
    email = req.session.get("email") or "SYSTEM"
    if not company_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        voucher, summary = generate_ob_journal(db, company_id, body.voucher_date, created_by=email, suspense_ledger=body.suspense_ledger)
        db.commit()
        return {"success": True, **summary}
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# ---------- F2: FOREX preview ----------
@router.get("/forex-difference-preview")
def api_forex_preview(
    request: Request,
    party_ledger_id: int,
    invoice_no: Optional[str] = Query(None),
    settlement_amount_inr: float = Query(..., gt=0),
    db: Session = Depends(get_db),
):
    company_id = request.session.get("company_code") or request.session.get("company_id")
    if not company_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    data = compute_forex_difference(db, company_id, party_ledger_id, invoice_no, settlement_amount_inr)
    return {"success": True, "data": data}


# ---------- F3: GST ----------
@router.get("/gst-position")
def api_gst_position(request: Request, as_of: date, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code") or request.session.get("company_id")
    if not company_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"success": True, **compute_gst_position(db, company_id, as_of)}


class GSTSetoffRequest(BaseModel):
    period_end: date


@router.post("/gst-setoff-jv")
def api_gst_setoff(req: Request, body: GSTSetoffRequest, db: Session = Depends(get_db)):
    company_id = req.session.get("company_code") or req.session.get("company_id")
    email = req.session.get("email") or "SYSTEM"
    if not company_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        voucher, summary = generate_gst_setoff_jv(db, company_id, body.period_end, created_by=email)
        db.commit()
        return {"success": True, "voucher_no": voucher.voucher_no, "voucher_id": voucher.id, **summary}
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


class GSTPaymentRequest(BaseModel):
    payment_date: date
    payment_amount: float
    bank_ledger_name: str
    bank_group_name: str = "Bank Accounts"
    utr: Optional[str] = None


@router.post("/gst-payment-jv")
def api_gst_payment(req: Request, body: GSTPaymentRequest, db: Session = Depends(get_db)):
    company_id = req.session.get("company_code") or req.session.get("company_id")
    email = req.session.get("email") or "SYSTEM"
    if not company_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        voucher, summary = generate_gst_payment_jv(
            db, company_id, body.payment_date, body.payment_amount,
            body.bank_ledger_name, body.bank_group_name, created_by=email, utr=body.utr,
        )
        db.commit()
        return {"success": True, "voucher_no": voucher.voucher_no, "voucher_id": voucher.id, **summary}
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# ---------- F4: Statutory Payments ----------
@router.get("/statutory-ledgers")
def api_statutory_list():
    return {"success": True, "items": [
        {"key": k, "ledger": v[0], "group": v[1], "type": v[2]}
        for k, v in STATUTORY_LEDGERS.items()
    ]}


@router.get("/statutory-balance")
def api_statutory_balance_endpoint(request: Request, key: str, as_of: date, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code") or request.session.get("company_id")
    if not company_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        bal = compute_statutory_balance(db, company_id, as_of, key)
        return {"success": True, "key": key, "balance_payable": float(bal), "ledger": STATUTORY_LEDGERS[key][0]}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


class StatutoryPaymentRequest(BaseModel):
    payment_date: date
    statutory_key: str
    payment_amount: float
    bank_ledger_name: str
    bank_group_name: str = "Bank Accounts"
    challan_no: Optional[str] = None


@router.post("/statutory-payment-jv")
def api_statutory_payment(req: Request, body: StatutoryPaymentRequest, db: Session = Depends(get_db)):
    company_id = req.session.get("company_code") or req.session.get("company_id")
    email = req.session.get("email") or "SYSTEM"
    if not company_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        voucher, summary = generate_statutory_payment_jv(
            db, company_id, body.payment_date, body.statutory_key,
            body.payment_amount, body.bank_ledger_name, body.bank_group_name,
            created_by=email, challan_no=body.challan_no,
        )
        db.commit()
        return {"success": True, "voucher_no": voucher.voucher_no, "voucher_id": voucher.id, **summary}
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# ---------- F5: Depreciation ----------
@router.get("/depreciation-plan")
def api_depreciation_plan(request: Request, period_end: date, db: Session = Depends(get_db)):
    company_id = request.session.get("company_code") or request.session.get("company_id")
    if not company_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    plan = compute_monthly_depreciation(db, company_id, period_end)
    total = round(sum(float(p["to_book_amount"]) for p in plan), 2)
    return {"success": True, "count": len(plan), "total": total, "items": plan}


class DepRequest(BaseModel):
    period_end: date


@router.post("/depreciation-post")
def api_depreciation_post(req: Request, body: DepRequest, db: Session = Depends(get_db)):
    company_id = req.session.get("company_code") or req.session.get("company_id")
    email = req.session.get("email") or "SYSTEM"
    if not company_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        voucher, summary = generate_depreciation_jv(db, company_id, body.period_end, created_by=email)
        db.commit()
        if voucher is None:
            return {"success": False, **summary}
        return {"success": True, "voucher_no": voucher.voucher_no, **summary}
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# ---------- F6: Production WIP -> FG ----------
class ProductionTransferRequest(BaseModel):
    batch_number: str
    transfer_date: date
    raw_material_value: float = 0.0
    labour_value: float = 0.0
    power_value: float = 0.0
    ice_value: float = 0.0
    chemicals_value: float = 0.0
    other_value: float = 0.0
    fg_value: float


@router.post("/production-wip-transfer")
def api_production_wip_transfer(req: Request, body: ProductionTransferRequest, db: Session = Depends(get_db)):
    company_id = req.session.get("company_code") or req.session.get("company_id")
    email = req.session.get("email") or "SYSTEM"
    if not company_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        voucher, summary = build_production_transfer_jv(
            db, company_id, body.batch_number, body.transfer_date,
            body.raw_material_value, body.labour_value, body.power_value,
            body.ice_value, body.chemicals_value, body.other_value,
            body.fg_value, created_by=email,
        )
        db.commit()
        return {"success": True, "voucher_no": voucher.voucher_no, "voucher_id": voucher.id, **summary}
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# ---------- F7: Contra ----------
class ContraRequest(BaseModel):
    voucher_date: date
    from_ledger_name: str
    to_ledger_name: str
    amount: float
    reference_no: Optional[str] = None
    remarks: str = ""


@router.post("/contra")
def api_contra(req: Request, body: ContraRequest, db: Session = Depends(get_db)):
    company_id = req.session.get("company_code") or req.session.get("company_id")
    email = req.session.get("email") or "SYSTEM"
    if not company_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    # Validate both ledgers are Bank/Cash types
    ledgers = {body.from_ledger_name, body.to_ledger_name}
    rows = db.query(LedgerMaster.ledger_name, LedgerMaster.group_id).join(
        LedgerMaster.group
    ).filter(
        LedgerMaster.company_id == company_id,
        LedgerMaster.ledger_name.in_(ledgers),
    ).all()
    group_ids = {r.group_id for r in rows}
    from app.database.models.enterprise_finance import AccountGroup
    groups = db.query(AccountGroup.group_name).filter(AccountGroup.id.in_(group_ids)).all()
    if not all(g.group_name in {"Bank Accounts", "Cash-in-hand"} for g in groups):
        raise HTTPException(status_code=400, detail="Contra is allowed only between Bank and Cash ledgers.")
    try:
        voucher = generate_contra_voucher(
            db, company_id, body.voucher_date, body.from_ledger_name,
            body.to_ledger_name, body.amount,
            reference_no=body.reference_no, remarks=body.remarks, created_by=email,
        )
        db.commit()
        return {"success": True, "voucher_no": voucher.voucher_no, "voucher_id": voucher.id}
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# ---------- F8: DN / CN ----------
class DNRequest(BaseModel):
    note_date: date
    vendor_ledger_name: str
    reason_ledger_name: str
    reason_group_name: str = "Purchase Accounts"
    reason_group_type: str = "EXPENSE"
    amount: float
    gst_amount: float = 0.0
    reference_no: Optional[str] = None
    remarks: str = ""


@router.post("/debit-note")
def api_debit_note(req: Request, body: DNRequest, db: Session = Depends(get_db)):
    company_id = req.session.get("company_code") or req.session.get("company_id")
    email = req.session.get("email") or "SYSTEM"
    if not company_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        voucher, summary = generate_debit_note(
            db, company_id, body.note_date, body.vendor_ledger_name,
            body.reason_ledger_name, body.reason_group_name, body.reason_group_type,
            body.amount, body.gst_amount, reference_no=body.reference_no,
            remarks=body.remarks, created_by=email,
        )
        db.commit()
        return {"success": True, "voucher_no": voucher.voucher_no, "voucher_id": voucher.id, **summary}
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


class CNRequest(BaseModel):
    note_date: date
    customer_ledger_name: str
    reason_ledger_name: str
    reason_group_name: str = "Sales Accounts"
    reason_group_type: str = "INCOME"
    amount: float
    gst_amount: float = 0.0
    reference_no: Optional[str] = None
    remarks: str = ""


@router.post("/credit-note")
def api_credit_note(req: Request, body: CNRequest, db: Session = Depends(get_db)):
    company_id = req.session.get("company_code") or req.session.get("company_id")
    email = req.session.get("email") or "SYSTEM"
    if not company_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        voucher, summary = generate_credit_note(
            db, company_id, body.note_date, body.customer_ledger_name,
            body.reason_ledger_name, body.reason_group_name, body.reason_group_type,
            body.amount, body.gst_amount, reference_no=body.reference_no,
            remarks=body.remarks, created_by=email,
        )
        db.commit()
        return {"success": True, "voucher_no": voucher.voucher_no, "voucher_id": voucher.id, **summary}
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# ---------- F9: Closing Stock Valuation ----------
class StockAdjRequest(BaseModel):
    period_end: date
    closing_stock_value: float
    current_book_value: float


@router.post("/closing-stock-adjustment")
def api_closing_stock_adj(req: Request, body: StockAdjRequest, db: Session = Depends(get_db)):
    company_id = req.session.get("company_code") or req.session.get("company_id")
    email = req.session.get("email") or "SYSTEM"
    if not company_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        voucher, summary = generate_closing_stock_jv(
            db, company_id, body.period_end,
            body.closing_stock_value, body.current_book_value, created_by=email,
        )
        db.commit()
        return {"success": True, "voucher_no": voucher.voucher_no, "voucher_id": voucher.id, **summary}
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


# ---------- F10: GR/IR Accrual ----------
class GRIrItem(BaseModel):
    ledger_name: str = "Raw Shrimp Purchase A/c"
    group_name: str = "Purchase Accounts"
    group_type: str = "EXPENSE"
    parent_group_name: Optional[str] = None
    amount: float
    batch: Optional[str] = None
    remarks: Optional[str] = None


class GRIrRequest(BaseModel):
    accrual_date: date
    items: list[GRIrItem]
    reference_no: Optional[str] = None


@router.post("/grir-accrual")
def api_grir_accrual(req: Request, body: GRIrRequest, db: Session = Depends(get_db)):
    company_id = req.session.get("company_code") or req.session.get("company_id")
    email = req.session.get("email") or "SYSTEM"
    if not company_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        items = [
            {
                "ledger_name": i.ledger_name,
                "group_name": i.group_name,
                "group_type": i.group_type,
                "parent_group_name": i.parent_group_name,
                "amount": i.amount,
                "batch": i.batch,
                "remarks": i.remarks,
            }
            for i in body.items
        ]
        voucher, summary = generate_grir_accrual_jv(
            db, company_id, body.accrual_date, items,
            created_by=email, reference_no=body.reference_no,
        )
        db.commit()
        return {"success": True, "voucher_no": voucher.voucher_no, "voucher_id": voucher.id, **summary}
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


class GRIrReversalRequest(BaseModel):
    reversal_date: date
    accrual_voucher_id: int


@router.post("/grir-reversal")
def api_grir_reversal(req: Request, body: GRIrReversalRequest, db: Session = Depends(get_db)):
    company_id = req.session.get("company_code") or req.session.get("company_id")
    email = req.session.get("email") or "SYSTEM"
    if not company_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        voucher, summary = reverse_grir_accrual(
            db, company_id, body.reversal_date, body.accrual_voucher_id, created_by=email,
        )
        db.commit()
        return {"success": True, "voucher_no": voucher.voucher_no, "voucher_id": voucher.id, **summary}
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
