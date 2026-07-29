"""
Accounting Automations Service
================================
All 10 Tally-style missing accounting automation flows:
  F1. OB (Opening Balance) Auto JV
  F2. FOREX Realised Gain/Loss booking for payment/receipt
  F3. GST Set-off + GST Payment Auto JV
  F4. TDS / PF / ESI / PT Statutory Payment Auto JV
  F5. Depreciation Auto Posting
  F6. WIP -> Finished Goods Production Transfer JV
  F7. Contra Voucher (Bank <-> Cash)
  F8. Debit Note / Credit Note
  F9. Closing Stock Valuation Adjustment JV
  F10. GR/IR Accrual (Goods Received Not Invoiced) + reversal
"""
import logging
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional

from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_, func

from app.database.models.enterprise_finance import (
    AccountGroup,
    LedgerMaster,
    VoucherHeader,
    VoucherDetail,
    FinancialYearMaster,
)
from app.database.models.assets import FixedAssetMaster, DepreciationSchedule
from app.database.models.gst_models import GSTRegister
from app.services.posting_engine import PostingEngineService
from app.services.bill_accounting import amount_line

logger = logging.getLogger(__name__)

Q = Decimal("0.01")


def q(v) -> Decimal:
    return Decimal(str(v or 0)).quantize(Q, rounding=ROUND_HALF_UP)


# =========================================================================
# F1. OB (OPENING BALANCE) AUTO JV GENERATOR
# =========================================================================
def generate_ob_journal(
    db: Session,
    company_id: str,
    voucher_date: date,
    created_by: str = "SYSTEM",
    suspense_ledger: str = "Suspense A/c (OB Difference)",
) -> tuple[VoucherHeader | None, dict]:
    """
    Creates a single "Opening Balance" JV that reflects every ledger's
    opening_balance + opening_balance_type into voucher_headers/details.

    OB Rule (Tally):
      Assets (DR-normal) with DR balance -> DR
      Liabilities + Equity (CR-normal) with CR balance -> CR
    Any DR != CR difference is parked in Suspense A/c so the JV always tallies.
    """
    # If an OB JV was already posted for this company, reject to avoid double booking.
    existing = (
        db.query(VoucherHeader)
        .filter(
            VoucherHeader.company_id == company_id,
            VoucherHeader.narration.ilike("Opening Balance%"),
            VoucherHeader.status == "POSTED",
        )
        .first()
    )
    if existing:
        return None, {"status": "SKIPPED", "reason": f"OB JV already posted: {existing.voucher_no}", "existing_id": existing.id}

    ledgers = (
        db.query(LedgerMaster)
        .options(joinedload(LedgerMaster.group))
        .filter(
            LedgerMaster.company_id == company_id,
            LedgerMaster.status == "ACTIVE",
        )
        .all()
    )
    if not ledgers:
        return None, {"status": "SKIPPED", "reason": "No active ledgers for this company"}

    total_dr = Decimal("0.00")
    total_cr = Decimal("0.00")
    details: list[dict] = []
    ob_count = 0

    for l in ledgers:
        ob_amt = q(l.opening_balance or 0)
        ob_type = str(l.opening_balance_type or "DR").upper().strip()
        if ob_amt <= 0:
            continue
        ob_count += 1
        group = l.group
        group_name = group.group_name if group else "General"
        group_type = group.group_type if group else "EQUITY"
        parent_name = group.parent.group_name if group and group.parent else None

        if ob_type == "DR":
            total_dr += ob_amt
            details.append(
                amount_line(
                    l.ledger_name, group_name, group_type,
                    debit=float(ob_amt),
                    remarks=f"Opening Balance {ob_type}",
                    parent_group_name=parent_name,
                    cost_center_id=None,
                )
            )
        elif ob_type == "CR":
            total_cr += ob_amt
            details.append(
                amount_line(
                    l.ledger_name, group_name, group_type,
                    credit=float(ob_amt),
                    remarks=f"Opening Balance {ob_type}",
                    parent_group_name=parent_name,
                    cost_center_id=None,
                )
            )

    if ob_count == 0:
        return None, {"status": "SKIPPED", "reason": "No non-zero opening balances"}

    # Plug difference into Suspense A/c so JV tallies.
    if total_dr > total_cr:
        diff = float(total_dr - total_cr)
        details.append(
            amount_line(
                suspense_ledger, "Current Liabilities", "LIABILITY",
                credit=diff,
                remarks="OB Difference - Suspense (match manually later)",
                parent_group_name="Current Liabilities",
            )
        )
        total_cr += Decimal(str(diff))
    elif total_cr > total_dr:
        diff = float(total_cr - total_dr)
        details.append(
            amount_line(
                suspense_ledger, "Loans & Advances", "ASSET",
                debit=diff,
                remarks="OB Difference - Suspense (match manually later)",
                parent_group_name="Current Assets",
            )
        )
        total_dr += Decimal(str(diff))

    narration = (
        f"Opening Balance JV as on {voucher_date.isoformat()} — "
        f"{ob_count} ledgers; Suspense plug: {abs(float(total_dr - total_cr)):.2f}"
    )
    voucher = PostingEngineService.create_voucher(
        db, company_id, "Journal", voucher_date, narration, details,
        reference_no=f"OB-{voucher_date.isoformat()}", created_by=created_by or "SYSTEM",
        status="POSTED",
    )
    summary = {
        "status": "CREATED",
        "voucher_no": voucher.voucher_no,
        "voucher_id": voucher.id,
        "ledgers_count": ob_count,
        "total_debit": float(total_dr),
        "total_credit": float(total_cr),
        "suspense_plug": float(abs(total_dr - total_cr)),
    }
    return voucher, summary


# =========================================================================
# F2. FOREX REALISED GAIN / LOSS FOR PAYMENT / RECEIPT
# =========================================================================
def build_forex_lines(
    party_ledger_name: str,
    group_name: str,
    group_type: str,
    parent_group: Optional[str],
    bill_value_inr: float,
    settled_amount_inr: float,
    receipt_no: str,
    bank_charges: float = 0.0,
    adjustment_amount: float = 0.0,
) -> tuple[list[dict], Decimal, Decimal, str | None]:
    """
    Given the original booked INR and the actual settlement INR, returns
    the full detail set including the realised forex gain/loss line.

    Returns:
      (details, total_debit, total_credit, nature_of_forex | None)
    """
    booked = q(bill_value_inr)
    settled = q(settled_amount_inr)
    diff = booked - settled  # positive -> LOSS (we received less / paid more)
    nature = None

    details: list[dict] = []
    totals = Decimal("0.00")

    if abs(diff) >= Decimal("0.01"):
        if diff > 0:
            nature = "LOSS"
            details.append(
                amount_line(
                    "Unrealised Forex Loss A/c", "Indirect Expenses", "EXPENSE",
                    debit=float(diff),
                    remarks=f"Realised Forex LOSS on {receipt_no}: {booked:.2f} - {settled:.2f}",
                )
            )
            totals += diff
        else:
            nature = "GAIN"
            details.append(
                amount_line(
                    "Unrealised Forex Gain A/c", "Indirect Incomes", "INCOME",
                    credit=float(-diff),
                    remarks=f"Realised Forex GAIN on {receipt_no}: {settled:.2f} - {booked:.2f}",
                )
            )
            totals += (-diff)

    return details, Decimal("0"), totals, nature


def compute_forex_difference(
    db: Session,
    company_id: str,
    party_ledger_id: int,
    invoice_no: Optional[str],
    settlement_amount_inr: float,
) -> dict:
    """
    Helper to compute the original booked amount for a customer invoice /
    vendor bill (the earliest POSTED sales/purchase voucher that touched
    the party ledger with the reference_no = invoice_no).

    Returns dict: {booked_inr, diff_inr, nature, found}
    """
    from app.database.models.enterprise_finance import VoucherType

    base = (
        db.query(
            func.sum(VoucherDetail.debit_amount).label("dr"),
            func.sum(VoucherDetail.credit_amount).label("cr"),
        )
        .join(VoucherHeader, VoucherHeader.id == VoucherDetail.voucher_id)
        .filter(
            VoucherHeader.company_id == company_id,
            VoucherHeader.status == "POSTED",
            VoucherDetail.ledger_id == party_ledger_id,
        )
    )
    if invoice_no:
        base = base.filter(VoucherHeader.reference_no == invoice_no)
    row = base.first()
    dr = float(row.dr or 0.0)
    cr = float(row.cr or 0.0)
    # For Sundry Debtors / Customer: original booking is DR side
    # For Sundry Creditors / Vendor: original booking is CR side
    ledger: LedgerMaster | None = (
        db.query(LedgerMaster).options(
            joinedload(LedgerMaster.group)
        )
        .filter(LedgerMaster.id == party_ledger_id, LedgerMaster.company_id == company_id)
        .first()
    )
    if not ledger or not ledger.group:
        booked = max(dr, cr)
    elif ledger.group.group_name == "Sundry Debtors":
        booked = dr
    else:
        booked = cr
    settled = float(settlement_amount_inr or 0.0)
    diff = round(booked - settled, 2)
    nature = None
    if abs(diff) >= 0.01:
        nature = "LOSS" if diff > 0 else "GAIN"
    return {
        "booked_inr": round(booked, 2),
        "settled_inr": round(settled, 2),
        "diff_inr": diff,
        "nature": nature,
        "found": booked > 0,
    }


# =========================================================================
# F3. GST SET-OFF + GST PAYMENT AUTO JV
# =========================================================================
def compute_gst_position(
    db: Session,
    company_id: str,
    as_of: date,
) -> dict:
    """
    Walks all POSTED vouchers touching any GST ledger up to `as_of`
    and returns the Output GST, Input GST, Net Payable / ITC Carryforward.
    """
    rows = (
        db.query(
            LedgerMaster.ledger_name,
            func.coalesce(func.sum(VoucherDetail.debit_amount), 0).label("dr"),
            func.coalesce(func.sum(VoucherDetail.credit_amount), 0).label("cr"),
        )
        .join(LedgerMaster, LedgerMaster.id == VoucherDetail.ledger_id)
        .join(VoucherHeader, VoucherHeader.id == VoucherDetail.voucher_id)
        .filter(
            VoucherHeader.company_id == company_id,
            VoucherHeader.status == "POSTED",
            VoucherHeader.voucher_date <= as_of,
            LedgerMaster.ledger_name.ilike("%GST%"),
        )
        .group_by(LedgerMaster.ledger_name)
        .all()
    )
    output_gst = Decimal("0.00")
    input_gst = Decimal("0.00")
    details_breakup = []
    for r in rows:
        dr = q(r.dr)
        cr = q(r.cr)
        name = r.ledger_name
        net = cr - dr
        if "output" in name.lower():
            output_gst += net
        elif "input" in name.lower():
            input_gst += (-net)
        details_breakup.append({"ledger": name, "dr": float(dr), "cr": float(cr), "net": float(net)})

    net_payable = float(max(Decimal("0.00"), output_gst - input_gst))
    itc_carry = float(max(Decimal("0.00"), input_gst - output_gst))
    return {
        "as_of": as_of.isoformat(),
        "output_gst": float(output_gst),
        "input_gst": float(input_gst),
        "net_gst_payable": net_payable,
        "itc_carry_forward": itc_carry,
        "breakup": details_breakup,
    }


def generate_gst_setoff_jv(
    db: Session,
    company_id: str,
    period_end: date,
    created_by: str = "SYSTEM",
) -> tuple[VoucherHeader, dict]:
    """JV-1: Setoff Output GST vs Input GST -> Net Payable moved to GST Payable."""
    pos = compute_gst_position(db, company_id, period_end)
    if pos["net_gst_payable"] <= 0 and pos["itc_carry_forward"] <= 0:
        raise ValueError("No GST position to settle as on " + period_end.isoformat())

    output = q(pos["output_gst"])
    itc_used = min(output, q(pos["input_gst"]))
    net_pay = output - itc_used

    details: list[dict] = []
    # DR Output GST (closing liability to 0)
    if output > 0:
        details.append(
            amount_line(
                "Output GST A/c", "Duties & Taxes", "LIABILITY",
                debit=float(output),
                remarks=f"GST Set-off {period_end.isoformat()}",
                parent_group_name="Current Liabilities",
            )
        )
    # CR Input GST (to the extent of set-off)
    if itc_used > 0:
        details.append(
            amount_line(
                "Input GST A/c", "Duties & Taxes", "LIABILITY",
                credit=float(itc_used),
                remarks=f"GST Set-off {period_end.isoformat()}",
                parent_group_name="Current Liabilities",
            )
        )
    # CR Balance -> Net GST Payable A/c
    if net_pay > 0:
        details.append(
            amount_line(
                "Net GST Payable A/c", "Duties & Taxes", "LIABILITY",
                credit=float(net_pay),
                remarks=f"GST Payable for period up to {period_end.isoformat()}",
                parent_group_name="Current Liabilities",
            )
        )
    # If ITC CF remains, park it in ITC C/F A/c (asset-side group)
    itc_cf = q(pos["itc_carry_forward"])
    if itc_cf > 0:
        details.append(
            amount_line(
                "Input GST Carry Forward A/c", "Loans & Advances", "ASSET",
                debit=float(itc_cf),
                remarks=f"ITC carried forward beyond {period_end.isoformat()}",
                parent_group_name="Current Assets",
            )
        )
        details.append(
            amount_line(
                "Input GST A/c", "Duties & Taxes", "LIABILITY",
                credit=float(itc_cf),
                remarks=f"ITC C/F transfer for period end",
                parent_group_name="Current Liabilities",
            )
        )

    narration = f"GST Set-off Journal for period ending {period_end.isoformat()}. Output {output:.2f}, ITC used {itc_used:.2f}, Payable {net_pay:.2f}, ITC CF {itc_cf:.2f}."
    voucher = PostingEngineService.create_voucher(
        db, company_id, "Journal", period_end, narration, details,
        reference_no=f"GST-SO-{period_end.isoformat()}", created_by=created_by,
    )
    return voucher, {**pos, "itc_used": float(itc_used), "net_gst_payable": float(net_pay)}


def generate_gst_payment_jv(
    db: Session,
    company_id: str,
    payment_date: date,
    payment_amount: float,
    bank_ledger_name: str,
    bank_group_name: str = "Bank Accounts",
    created_by: str = "SYSTEM",
    utr: Optional[str] = None,
) -> tuple[VoucherHeader, dict]:
    """JV-2: Pay GST -> DR Net GST Payable + CR Bank."""
    amt = q(payment_amount)
    if amt <= 0:
        raise ValueError("Payment amount must be positive")
    details = [
        amount_line(
            "Net GST Payable A/c", "Duties & Taxes", "LIABILITY",
            debit=float(amt),
            remarks=f"GST Payment via {bank_ledger_name} | {utr or '-'}",
            parent_group_name="Current Liabilities",
        ),
        amount_line(
            bank_ledger_name, bank_group_name, "ASSET",
            credit=float(amt),
            remarks=f"GST Challan paid | UTR {utr or '-'}",
            parent_group_name="Current Assets",
        ),
    ]
    narration = f"GST Payment of Rs {float(amt):,.2f} via {bank_ledger_name} on {payment_date.isoformat()}."
    voucher = PostingEngineService.create_voucher(
        db, company_id, "Payment", payment_date, narration, details,
        reference_no=utr or f"GST-PAY-{payment_date.isoformat()}", created_by=created_by,
    )
    return voucher, {"amount_paid": float(amt), "utr": utr}


# =========================================================================
# F4. STATUTORY PAYMENT (TDS / PF / ESI / PT / EDLI / EPS / LWF)
# =========================================================================
STATUTORY_LEDGERS = {
    "TDS": ("TDS Payable A/c", "Duties & Taxes", "LIABILITY", "Current Liabilities"),
    "PF": ("Provident Fund (PF) Payable A/c", "Duties & Taxes", "LIABILITY", "Current Liabilities"),
    "EPS": ("Employees Pension Scheme (EPS) Payable A/c", "Duties & Taxes", "LIABILITY", "Current Liabilities"),
    "EDLI": ("EDLI Contribution Payable A/c", "Duties & Taxes", "LIABILITY", "Current Liabilities"),
    "ESI": ("Employee State Insurance (ESI) Payable A/c", "Duties & Taxes", "LIABILITY", "Current Liabilities"),
    "PT": ("Professional Tax (PT) Payable A/c", "Duties & Taxes", "LIABILITY", "Current Liabilities"),
    "LWF": ("Labour Welfare Fund (LWF) Payable A/c", "Duties & Taxes", "LIABILITY", "Current Liabilities"),
}


def compute_statutory_balance(db: Session, company_id: str, as_of: date, key: str) -> Decimal:
    """Returns the CREDIT-balance payable (DR - CR reversed sign) for the ledger."""
    if key not in STATUTORY_LEDGERS:
        raise ValueError(f"Unknown statutory key: {key}")
    name, _, _, _ = STATUTORY_LEDGERS[key]
    row = (
        db.query(
            func.coalesce(func.sum(VoucherDetail.debit_amount), 0).label("dr"),
            func.coalesce(func.sum(VoucherDetail.credit_amount), 0).label("cr"),
        )
        .join(LedgerMaster, LedgerMaster.id == VoucherDetail.ledger_id)
        .join(VoucherHeader, VoucherHeader.id == VoucherDetail.voucher_id)
        .filter(
            VoucherHeader.company_id == company_id,
            VoucherHeader.status == "POSTED",
            VoucherHeader.voucher_date <= as_of,
            LedgerMaster.ledger_name == name,
        )
        .first()
    )
    dr = q(row.dr)
    cr = q(row.cr)
    return cr - dr  # positive = still payable


def generate_statutory_payment_jv(
    db: Session,
    company_id: str,
    payment_date: date,
    statutory_key: str,
    payment_amount: float,
    bank_ledger_name: str,
    bank_group_name: str = "Bank Accounts",
    created_by: str = "SYSTEM",
    challan_no: Optional[str] = None,
) -> tuple[VoucherHeader, dict]:
    key = statutory_key.upper().strip()
    amt = q(payment_amount)
    if amt <= 0:
        raise ValueError("Amount must be positive")
    lname, gname, gtype, pgname = STATUTORY_LEDGERS[key]
    details = [
        amount_line(
            lname, gname, gtype,
            debit=float(amt),
            remarks=f"{key} Challan {challan_no or '-'} paid",
            parent_group_name=pgname,
        ),
        amount_line(
            bank_ledger_name, bank_group_name, "ASSET",
            credit=float(amt),
            remarks=f"{key} Payment | Challan {challan_no or '-'}",
            parent_group_name="Current Assets",
        ),
    ]
    narration = f"{key} Payment of Rs {float(amt):,.2f} via {bank_ledger_name} on {payment_date.isoformat()}."
    voucher = PostingEngineService.create_voucher(
        db, company_id, "Payment", payment_date, narration, details,
        reference_no=challan_no or f"{key}-PAY-{payment_date.isoformat()}", created_by=created_by,
    )
    bal_before = compute_statutory_balance(db, company_id, payment_date, key)
    return voucher, {
        "statutory": key,
        "ledger": lname,
        "amount_paid": float(amt),
        "balance_before_payment": float(bal_before),
        "challan_no": challan_no,
    }


# =========================================================================
# F5. DEPRECIATION AUTO POSTING
# =========================================================================
def compute_monthly_depreciation(
    db: Session,
    company_id: str,
    period_end: date,
) -> list[dict]:
    """
    Reads every ACTIVE fixed asset, computes monthly depreciation for the
    `period_end` calendar month. Supports both WDV (default, by rate) and
    SLM (by useful_life_years) methods. Skips if the period already has a
    DepreciationSchedule row for this asset.
    """
    period_month = period_end.strftime("%Y-%m")
    assets = (
        db.query(FixedAssetMaster)
        .filter(
            FixedAssetMaster.company_id == company_id,
            FixedAssetMaster.is_cancelled != True,  # noqa: E712
            FixedAssetMaster.status == "ACTIVE",
            FixedAssetMaster.purchase_date <= period_end,
        )
        .all()
    )
    plan = []
    for a in assets:
        cost = q(a.purchase_cost or 0)
        salvage = q(a.salvage_value or 0)
        life = int(a.useful_life_years or 0)
        rate = float(a.dep_rate_percent or 0.0)
        opening_wdv = q(a.current_wdv or a.purchase_cost or 0)
        if cost <= 0 or opening_wdv <= 0:
            continue

        # Determine monthly depreciation amount
        method = (a.depreciation_method or "WDV").upper()
        if method == "SLM" and life > 0 and cost > salvage:
            monthly_amount = ((cost - salvage) / Decimal(life) / Decimal(12)).quantize(Q)
        elif rate > 0:
            # WDV monthly = opening_wdv * (rate/100) / 12
            monthly_amount = (opening_wdv * Decimal(str(rate)) / Decimal(100) / Decimal(12)).quantize(Q)
        elif life > 0 and cost > salvage:
            monthly_amount = ((cost - salvage) / Decimal(life) / Decimal(12)).quantize(Q)
        else:
            continue
        if monthly_amount <= 0:
            continue

        already = (
            db.query(DepreciationSchedule.id)
            .filter(
                DepreciationSchedule.company_id == company_id,
                DepreciationSchedule.asset_id == a.id,
                DepreciationSchedule.period_month == period_month,
            )
            .first()
        )
        if already:
            continue
        closing_wdv = opening_wdv - monthly_amount
        plan.append({
            "asset_id": a.id,
            "asset_name": a.asset_name,
            "method": method,
            "opening_wdv": float(opening_wdv),
            "dep_rate_percent": rate,
            "monthly_amount": float(monthly_amount),
            "closing_wdv": float(closing_wdv),
            "period_month": period_month,
            "period_end_date": period_end.isoformat(),
            "to_book_amount": float(monthly_amount),
        })
    return plan


def generate_depreciation_jv(
    db: Session,
    company_id: str,
    period_end: date,
    created_by: str = "SYSTEM",
) -> tuple[VoucherHeader | None, dict]:
    plan = compute_monthly_depreciation(db, company_id, period_end)
    if not plan:
        return None, {"status": "SKIPPED", "reason": "No depreciation pending for this period"}

    total = Decimal("0.00")
    details: list[dict] = []
    created_ids: list[int] = []

    for p in plan:
        amt = q(p["to_book_amount"])
        total += amt
        # Asset-specific accumulated depreciation line using linked ledger if present
        asset_obj = db.get(FixedAssetMaster, p["asset_id"])
        acc_ledger_name = "Accumulated Depreciation A/c"
        if asset_obj and asset_obj.acc_dep_ledger and asset_obj.acc_dep_ledger.ledger_name:
            acc_ledger_name = asset_obj.acc_dep_ledger.ledger_name
        dep_ledger_name = "Depreciation Expense A/c"
        if asset_obj and asset_obj.dep_expense_ledger and asset_obj.dep_expense_ledger.ledger_name:
            dep_ledger_name = asset_obj.dep_expense_ledger.ledger_name
        details.append(
            amount_line(
                acc_ledger_name, "Fixed Assets", "ASSET",
                credit=float(amt),
                remarks=f"Accum. depreciation {p['period_month']} for {p['asset_name']}",
            )
        )
        details.append(
            amount_line(
                dep_ledger_name, "Indirect Expenses", "EXPENSE",
                debit=float(amt),
                remarks=f"Depreciation for {p['asset_name']} period {p['period_month']}",
            )
        )
        # Record depreciation schedule
        sched = DepreciationSchedule(
            company_id=company_id,
            asset_id=p["asset_id"],
            period_month=p["period_month"],
            opening_wdv=p["opening_wdv"],
            dep_rate_percent=p["dep_rate_percent"],
            dep_amount=p["monthly_amount"],
            closing_wdv=p["closing_wdv"],
            run_date=period_end,
            run_by=created_by,
        )
        db.add(sched)
        db.flush()
        created_ids.append(sched.id)

        # Update asset book values (accumulated depreciation + current WDV)
        if asset_obj:
            asset_obj.accumulated_depreciation = round(float(asset_obj.accumulated_depreciation or 0) + float(amt), 2)
            asset_obj.current_wdv = round(p["closing_wdv"], 2)

    narration = (
        f"Depreciation auto-posting for period {plan[0]['period_month']}: "
        f"{len(plan)} assets, total Rs {float(total):,.2f}."
    )
    voucher = PostingEngineService.create_voucher(
        db, company_id, "Journal", period_end, narration, details,
        reference_no=f"DEP-{plan[0]['period_month']}", created_by=created_by,
    )
    # Link schedule rows back to this voucher
    for sched_id in created_ids:
        s = db.get(DepreciationSchedule, sched_id)
        if s is not None:
            s.journal_id = voucher.id
    summary = {
        "status": "CREATED",
        "voucher_no": voucher.voucher_no,
        "voucher_id": voucher.id,
        "assets_count": len(plan),
        "total_depreciation": float(total),
        "period_month": plan[0]["period_month"],
        "schedules_ids": created_ids,
        "breakup": plan,
    }
    return voucher, summary


# =========================================================================
# F6. WIP -> FINISHED GOODS PRODUCTION TRANSFER JV
# =========================================================================
def build_production_transfer_jv(
    db: Session,
    company_id: str,
    batch_number: str,
    transfer_date: date,
    raw_material_value: float,
    labour_value: float,
    power_value: float,
    ice_value: float,
    chemicals_value: float,
    other_value: float,
    fg_value: float,
    created_by: str = "SYSTEM",
) -> tuple[VoucherHeader, dict]:
    """
    Production accounting transfer:
      Step A: Raw material / purchases moved to WIP (DR WIP, CR Purchase A/c)
      Step B: Processing/Labour/Power/Ice/Chemicals accumulated to WIP
      Step C: WIP transferred to Finished Goods at production cost

    We do A+B+C in a single tallied JV so totals always match.
    """
    raw = q(raw_material_value)
    labour = q(labour_value)
    power = q(power_value)
    ice = q(ice_value)
    chem = q(chemicals_value)
    other = q(other_value)
    fg = q(fg_value)

    produced_cost = raw + labour + power + ice + chem + other

    details: list[dict] = []

    # Step A: Raw -> WIP
    if raw > 0:
        details.append(
            amount_line(
                "Work In Progress A/c", "Stock-in-hand", "ASSET",
                debit=float(raw),
                remarks=f"WIP: Raw Material for Batch {batch_number}",
                parent_group_name="Current Assets",
            )
        )
        details.append(
            amount_line(
                "Raw Shrimp Purchase A/c", "Purchase Accounts", "EXPENSE",
                credit=float(raw),
                remarks=f"Transfer to WIP Batch {batch_number}",
            )
        )
    # Step B: Costs to WIP
    def wip_accrue(debit_ledger, group, amt_, parent="Current Assets"):
        if amt_ <= 0:
            return
        details.append(
            amount_line(
                "Work In Progress A/c", "Stock-in-hand", "ASSET",
                debit=float(amt_),
                remarks=f"WIP Accrue: {debit_ledger} (Batch {batch_number})",
                parent_group_name="Current Assets",
            )
        )
        details.append(
            amount_line(
                debit_ledger, group, "EXPENSE",
                credit=float(amt_),
                remarks=f"Accrue to WIP Batch {batch_number}",
                parent_group_name=parent,
            )
        )

    wip_accrue("Processing Labour Cost A/c", "Direct Expenses", labour)
    wip_accrue("Production Power Cost A/c", "Direct Expenses", power)
    wip_accrue("Production Ice Cost A/c", "Direct Expenses", ice)
    wip_accrue("Soaking Chemical Cost A/c", "Direct Expenses", chem)
    wip_accrue("Other Production Cost A/c", "Direct Expenses", other)

    # Step C: WIP -> Finished Goods
    if fg > 0:
        details.append(
            amount_line(
                "Finished Goods Inventory A/c", "Stock-in-hand", "ASSET",
                debit=float(fg),
                remarks=f"FG produced Batch {batch_number} @ production cost",
                parent_group_name="Current Assets",
            )
        )
        details.append(
            amount_line(
                "Work In Progress A/c", "Stock-in-hand", "ASSET",
                credit=float(produced_cost),
                remarks=f"WIP → FG for Batch {batch_number}",
                parent_group_name="Current Assets",
            )
        )

    # If produced_cost != fg_value (rare — rounding/standard costing), plug to Production Cost Variance
    variance = produced_cost - fg
    if abs(variance) >= Decimal("0.01"):
        if variance > 0:
            details.append(
                amount_line(
                    "Production Cost Variance A/c", "Direct Expenses", "EXPENSE",
                    debit=float(variance),
                    remarks=f"Variance for Batch {batch_number} (produced > FG)",
                )
            )
        else:
            details.append(
                amount_line(
                    "Production Cost Variance A/c", "Direct Expenses", "EXPENSE",
                    credit=float(-variance),
                    remarks=f"Variance for Batch {batch_number} (FG > produced)",
                )
            )

    narration = (
        f"Production Transfer JV for Batch {batch_number} on {transfer_date.isoformat()}. "
        f"Produced Cost {float(produced_cost):,.2f}, FG Value {float(fg):,.2f}."
    )
    voucher = PostingEngineService.create_voucher(
        db, company_id, "Journal", transfer_date, narration, details,
        reference_no=f"FG-{batch_number}", created_by=created_by,
    )
    return voucher, {
        "produced_cost": float(produced_cost),
        "fg_value": float(fg),
        "variance": float(variance),
        "batch_number": batch_number,
    }


# =========================================================================
# F7. CONTRA VOUCHER (Bank <-> Cash)
# =========================================================================
def generate_contra_voucher(
    db: Session,
    company_id: str,
    voucher_date: date,
    from_ledger_name: str,
    to_ledger_name: str,
    amount: float,
    reference_no: Optional[str] = None,
    remarks: str = "",
    created_by: str = "SYSTEM",
) -> VoucherHeader:
    """Bank ↔ Cash Contra.  Only Bank/Cash allowed (asset-type groups checked in router)."""
    amt = q(amount)
    if amt <= 0:
        raise ValueError("Contra amount must be positive")
    details = [
        amount_line(
            to_ledger_name,
            "Bank Accounts" if "bank" in to_ledger_name.lower() else "Cash-in-hand",
            "ASSET",
            debit=float(amt),
            remarks=remarks or f"Transfer from {from_ledger_name}",
            parent_group_name="Current Assets",
        ),
        amount_line(
            from_ledger_name,
            "Bank Accounts" if "bank" in from_ledger_name.lower() else "Cash-in-hand",
            "ASSET",
            credit=float(amt),
            remarks=remarks or f"Transfer to {to_ledger_name}",
            parent_group_name="Current Assets",
        ),
    ]
    narration = f"Contra: {from_ledger_name} → {to_ledger_name} amount Rs {float(amt):,.2f}."
    return PostingEngineService.create_voucher(
        db, company_id, "Contra", voucher_date, narration, details,
        reference_no=reference_no or f"CON-{voucher_date.isoformat()}", created_by=created_by,
    )


# =========================================================================
# F8. DEBIT NOTE / CREDIT NOTE
# =========================================================================
def generate_debit_note(
    db: Session,
    company_id: str,
    note_date: date,
    vendor_ledger_name: str,
    reason_ledger_name: str,
    reason_group_name: str,
    reason_group_type: str,
    amount: float,
    gst_amount: float = 0.0,
    reference_no: Optional[str] = None,
    remarks: str = "",
    created_by: str = "SYSTEM",
) -> tuple[VoucherHeader, dict]:
    """
    Debit Note (we issue to Vendor → reduce our payable):
      DR  Vendor Payable             (Total + GST if any)
      CR  Purchase / Expense A/c     (base value)
      CR  Input GST A/c              (if applicable)
    """
    base = q(amount)
    gst = q(gst_amount)
    total = base + gst
    if total <= 0:
        raise ValueError("Debit note total must be positive")
    details = [
        amount_line(
            vendor_ledger_name, "Sundry Creditors", "LIABILITY",
            debit=float(total),
            remarks=remarks or f"Debit Note issued | {reference_no or '-'}",
            parent_group_name="Current Liabilities",
        ),
        amount_line(
            reason_ledger_name, reason_group_name, reason_group_type,
            credit=float(base),
            remarks=remarks or "Debit Note reduction",
        ),
    ]
    if gst > 0:
        details.append(
            amount_line(
                "Input GST A/c", "Duties & Taxes", "LIABILITY",
                credit=float(gst),
                remarks="Input GST reversed via Debit Note",
                parent_group_name="Current Liabilities",
            )
        )
    narration = f"Debit Note issued on {note_date.isoformat()} to {vendor_ledger_name} for Rs {float(total):,.2f}."
    voucher = PostingEngineService.create_voucher(
        db, company_id, "Debit Note", note_date, narration, details,
        reference_no=reference_no or f"DN-{note_date.isoformat()}", created_by=created_by,
    )
    return voucher, {"base": float(base), "gst": float(gst), "total": float(total)}


def generate_credit_note(
    db: Session,
    company_id: str,
    note_date: date,
    customer_ledger_name: str,
    reason_ledger_name: str,
    reason_group_name: str,
    reason_group_type: str,
    amount: float,
    gst_amount: float = 0.0,
    reference_no: Optional[str] = None,
    remarks: str = "",
    created_by: str = "SYSTEM",
) -> tuple[VoucherHeader, dict]:
    """
    Credit Note (we issue to Customer → reduce our receivable):
      DR  Sales / Income A/c             (base value)
      DR  Output GST A/c                 (if applicable)
      CR  Customer Receivable            (total)
    """
    base = q(amount)
    gst = q(gst_amount)
    total = base + gst
    if total <= 0:
        raise ValueError("Credit note total must be positive")
    details = [
        amount_line(
            reason_ledger_name, reason_group_name, reason_group_type,
            debit=float(base),
            remarks=remarks or "Credit Note issued reduction",
        ),
    ]
    if gst > 0:
        details.append(
            amount_line(
                "Output GST A/c", "Duties & Taxes", "LIABILITY",
                debit=float(gst),
                remarks="Output GST reversed via Credit Note",
                parent_group_name="Current Liabilities",
            )
        )
    details.append(
        amount_line(
            customer_ledger_name, "Sundry Debtors", "ASSET",
            credit=float(total),
            remarks=remarks or f"Credit Note issued | {reference_no or '-'}",
            parent_group_name="Current Assets",
        )
    )
    narration = f"Credit Note issued on {note_date.isoformat()} to {customer_ledger_name} for Rs {float(total):,.2f}."
    voucher = PostingEngineService.create_voucher(
        db, company_id, "Credit Note", note_date, narration, details,
        reference_no=reference_no or f"CN-{note_date.isoformat()}", created_by=created_by,
    )
    return voucher, {"base": float(base), "gst": float(gst), "total": float(total)}


# =========================================================================
# F9. CLOSING STOCK VALUATION JV
# =========================================================================
def generate_closing_stock_jv(
    db: Session,
    company_id: str,
    period_end: date,
    closing_stock_value: float,
    current_book_value: float,
    created_by: str = "SYSTEM",
) -> tuple[VoucherHeader, dict]:
    """
    Adjusts book stock vs physical stock valuation:
      If physical > book: DR Closing Stock A/c, CR Trading Adjustment A/c
      If book > physical: DR Trading Adjustment, CR Closing Stock / FG
    """
    phys = q(closing_stock_value)
    book = q(current_book_value)
    diff = phys - book
    if abs(diff) < Decimal("0.01"):
        raise ValueError("No difference between physical and book stock values")
    details: list[dict] = []
    if diff > 0:
        details.append(
            amount_line(
                "Finished Goods Inventory A/c", "Stock-in-hand", "ASSET",
                debit=float(diff),
                remarks=f"Closing Stock uplift as on {period_end.isoformat()} (Physical {float(phys):,.2f} > Book {float(book):,.2f})",
                parent_group_name="Current Assets",
            )
        )
        details.append(
            amount_line(
                "Trading Adjustment A/c", "Direct Incomes", "INCOME",
                credit=float(diff),
                remarks="Closing Stock uplift (income side)",
            )
        )
    else:
        details.append(
            amount_line(
                "Stock Write-off / Damage A/c", "Direct Expenses", "EXPENSE",
                debit=float(-diff),
                remarks=f"Stock write-off as on {period_end.isoformat()} (Book {float(book):,.2f} > Physical {float(phys):,.2f})",
            )
        )
        details.append(
            amount_line(
                "Finished Goods Inventory A/c", "Stock-in-hand", "ASSET",
                credit=float(-diff),
                remarks="Closing Stock write-down",
                parent_group_name="Current Assets",
            )
        )
    up_or_down = "UP" if diff > 0 else "DOWN"
    narration = f"Closing Stock Valuation JV ({up_or_down}) for {period_end.isoformat()}: diff Rs {float(abs(diff)):,.2f}."
    voucher = PostingEngineService.create_voucher(
        db, company_id, "Journal", period_end, narration, details,
        reference_no=f"STOCK-ADJ-{period_end.isoformat()}", created_by=created_by,
    )
    return voucher, {
        "book_value": float(book),
        "physical_value": float(phys),
        "difference": float(diff),
        "direction": up_or_down,
    }


# =========================================================================
# F10. GR/IR ACCRUAL (Goods Received, Invoice Not Posted)
# =========================================================================
def generate_grir_accrual_jv(
    db: Session,
    company_id: str,
    accrual_date: date,
    items: list[dict],
    created_by: str = "SYSTEM",
    reference_no: Optional[str] = None,
) -> tuple[VoucherHeader, dict]:
    """
    End-of-month accrual:
      DR  Purchase / Expense account  (book value per item)
      CR  GR/IR Clearing A/c          (total)
    """
    if not items:
        raise ValueError("Accrual items list is empty")
    details: list[dict] = []
    total = Decimal("0.00")
    for it in items:
        amt = q(it.get("amount") or 0)
        if amt <= 0:
            continue
        lname = str(it.get("ledger_name") or "Raw Shrimp Purchase A/c")
        gname = str(it.get("group_name") or "Purchase Accounts")
        gtype = str(it.get("group_type") or "EXPENSE")
        remark = str(it.get("batch") or it.get("remarks") or f"GR/IR Accrual {accrual_date.isoformat()}")
        total += amt
        details.append(
            amount_line(
                lname, gname, gtype,
                debit=float(amt),
                remarks=remark,
                parent_group_name=it.get("parent_group_name"),
            )
        )
    if total <= 0:
        raise ValueError("No positive accrual amounts")
    details.append(
        amount_line(
            "GR/IR Clearing A/c", "Current Liabilities", "LIABILITY",
            credit=float(total),
            remarks=f"Accrued liabilities: Goods Received but Invoice not booked",
            parent_group_name="Current Liabilities",
        )
    )
    narration = (
        f"GR/IR Accrual JV for {accrual_date.isoformat()}: {len(items)} items, "
        f"total Rs {float(total):,.2f} (to reverse when actual vendor invoice is posted)."
    )
    voucher = PostingEngineService.create_voucher(
        db, company_id, "Journal", accrual_date, narration, details,
        reference_no=reference_no or f"GRIR-{accrual_date.isoformat()}", created_by=created_by,
    )
    return voucher, {"items_count": len(items), "total_accrued": float(total)}


def reverse_grir_accrual(
    db: Session,
    company_id: str,
    reversal_date: date,
    accrual_voucher_id: int,
    created_by: str = "SYSTEM",
) -> tuple[VoucherHeader, dict]:
    """Creates an exact reversing JV for the source accrual voucher."""
    src: VoucherHeader | None = (
        db.query(VoucherHeader)
        .options(joinedload(VoucherHeader.details))
        .filter(
            VoucherHeader.id == accrual_voucher_id,
            VoucherHeader.company_id == company_id,
            VoucherHeader.status == "POSTED",
        )
        .first()
    )
    if not src or not src.reference_no or not src.reference_no.startswith("GRIR-"):
        raise ValueError("Accrual voucher not found or not a GR/IR type")
    # Already reversed?
    existing = (
        db.query(VoucherHeader)
        .filter(
            VoucherHeader.company_id == company_id,
            VoucherHeader.reference_no == f"REV-{src.reference_no}",
        )
        .first()
    )
    if existing:
        return existing, {"status": "SKIPPED", "reason": "Already reversed"}

    flipped: list[dict] = []
    for d in src.details:
        flipped.append(
            amount_line(
                d.ledger.ledger_name,
                d.ledger.group.group_name,
                d.ledger.group.group_type,
                debit=float(d.credit_amount or 0),
                credit=float(d.debit_amount or 0),
                remarks=f"Reversal of accrual {src.voucher_no}",
                parent_group_name=(d.ledger.group.parent.group_name if d.ledger.group and d.ledger.group.parent else None),
                cost_center_id=d.cost_center_id,
            )
        )
    narration = f"Reversal of GR/IR Accrual {src.voucher_no} — actual vendor invoice now booked."
    reversal = PostingEngineService.create_voucher(
        db, company_id, "Journal", reversal_date, narration, flipped,
        reference_no=f"REV-{src.reference_no}", created_by=created_by,
    )
    return reversal, {"reversed_voucher_no": src.voucher_no, "reversal_id": reversal.id}
