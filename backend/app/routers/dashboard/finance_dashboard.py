from fastapi import APIRouter, Request, Depends, Query
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from datetime import date, datetime, timedelta
import logging

from app.database import get_db
from app.database.models.payments import (
    CustomerReceivable,
    VendorPayment,
    BankTransaction,
    ExpenseVoucher,
    JournalEntry,
    PaymentReceipt,
    BuyerAgingSummary
)
from app.database.models.enterprise_finance import LedgerMaster
from app.database.models.enterprise_finance import VoucherHeader
from app.services.accounting_reports import AccountingReportsService

router = APIRouter(tags=["CORPORATE FINANCE DASHBOARD"])
templates = Jinja2Templates(directory="app/templates")
logger = logging.getLogger(__name__)


def _current_fy_start(today: date) -> int:
    return today.year if today.month >= 4 else today.year - 1


def _parse_fy_start(fy_value: str, fallback_year: int) -> int:
    if not fy_value:
        return fallback_year
    try:
        return int(str(fy_value).split("-")[0])
    except (TypeError, ValueError):
        return fallback_year


def _parse_iso_date(value: str) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except Exception:
        return None


def _apply_date_range(query, column, start_date: date | None, end_date: date | None):
    if start_date:
        query = query.filter(column >= start_date)
    if end_date:
        query = query.filter(column <= end_date)
    return query


def _blank_profit_loss():
    return {
        "total_income": 0.0,
        "total_expense": 0.0,
        "net_profit": 0.0,
        "details": {"income_ledgers": [], "expense_ledgers": []},
    }


def _blank_balance_sheet():
    return {
        "total_assets": 0.0,
        "total_liabilities": 0.0,
        "total_equity": 0.0,
        "difference": 0.0,
        "is_balanced": True,
    }


def _safe_accounting_call(db: Session, label: str, fallback, fn, *args):
    try:
        return fn(db, *args)
    except Exception:
        db.rollback()
        logger.exception("Finance dashboard accounting fallback used for %s", label)
        return fallback


def _safe_scalar(db: Session, label: str, query, fallback=0.0):
    try:
        return query.scalar()
    except Exception:
        db.rollback()
        logger.exception("Finance dashboard scalar fallback used for %s", label)
        return fallback


def _safe_all(db: Session, label: str, query, fallback=None):
    try:
        return query.all()
    except Exception:
        db.rollback()
        logger.exception("Finance dashboard list fallback used for %s", label)
        return [] if fallback is None else fallback


@router.get("/finance_dashboard", response_class=HTMLResponse)
def finance_dashboard(
    request: Request,
    db: Session = Depends(get_db),
    company_id: str = Query("", description="Selected Company ID for filtering data"),
    fy: str = Query("", description="Financial year start, example: 2025 or 2025-26"),
    from_date: str = Query("", description="YYYY-MM-DD"),
    to_date: str = Query("", description="YYYY-MM-DD")
):
    # ---------------------------------------------------------
    # 🔐 AUTHENTICATION
    # ---------------------------------------------------------
    email = request.session.get("email")
    session_comp_code = request.session.get("company_code")

    if not email or not session_comp_code:
        return RedirectResponse("/auth/login", status_code=302)

    comp_code = session_comp_code

    # ---------------------------------------------------------
    # 🏢 DROPDOWN COMPANIES
    # ---------------------------------------------------------
    available_companies = [{"name": session_comp_code, "code": session_comp_code}]

    today = date.today()
    current_fy_year = _current_fy_start(today)
    selected_fy_year = _parse_fy_start(fy, current_fy_year)
    selected_fy = f"{selected_fy_year}-{str(selected_fy_year + 1)[2:]}"
    fy_options = [f"{year}-{str(year + 1)[2:]}" for year in range(current_fy_year, current_fy_year - 6, -1)]

    parsed_from = _parse_iso_date(from_date)
    parsed_to = _parse_iso_date(to_date)
    if not parsed_from:
        parsed_from = date(selected_fy_year, 4, 1)
        from_date = parsed_from.isoformat()
    if not parsed_to:
        parsed_to = date(selected_fy_year + 1, 3, 31)
        to_date = parsed_to.isoformat()

    last_updated_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    try:
        # 1. Receivables Outstanding
        receivables_q = db.query(func.coalesce(func.sum(CustomerReceivable.balance_amount), 0.0)).filter(
            CustomerReceivable.company_id == comp_code
        )
        receivables_q = _apply_date_range(receivables_q, CustomerReceivable.invoice_date, parsed_from, parsed_to)
        receivables_outstanding = float(_safe_scalar(db, "receivables_outstanding", receivables_q) or 0.0)

        # 2. Payables Outstanding
        payables_q = db.query(func.coalesce(func.sum(VendorPayment.balance), 0.0)).filter(
            VendorPayment.company_id == comp_code
        )
        payables_q = _apply_date_range(payables_q, VendorPayment.bill_date, parsed_from, parsed_to)
        payables_outstanding = float(_safe_scalar(db, "payables_outstanding", payables_q) or 0.0)

        # 3. Bank/cash movement for the selected period.
        bank_debit = db.query(func.coalesce(func.sum(BankTransaction.debit), 0.0)).filter(
            BankTransaction.company_id == comp_code
        )
        bank_credit = db.query(func.coalesce(func.sum(BankTransaction.credit), 0.0)).filter(
            BankTransaction.company_id == comp_code
        )
        bank_debit = _apply_date_range(bank_debit, BankTransaction.transaction_date, parsed_from, parsed_to)
        bank_credit = _apply_date_range(bank_credit, BankTransaction.transaction_date, parsed_from, parsed_to)
        cash_inflow_period = float(_safe_scalar(db, "bank_debit_inflow", bank_debit) or 0.0)
        cash_outflow_period = float(_safe_scalar(db, "bank_credit_outflow", bank_credit) or 0.0)
        net_cash_flow = cash_inflow_period - cash_outflow_period

        # 4. Expense summary category wise (ExpenseVouchers)
        expense_q = db.query(ExpenseVoucher.expense_type, func.sum(ExpenseVoucher.total_amount).label("total")).filter(
            ExpenseVoucher.company_id == comp_code,
            ExpenseVoucher.status == "APPROVED"
        )
        expense_q = _apply_date_range(expense_q, ExpenseVoucher.voucher_date, parsed_from, parsed_to)
        expense_summary_rows = _safe_all(db, "expense_summary", expense_q.group_by(ExpenseVoucher.expense_type))

        expense_categories = []
        expense_amounts = []
        total_expenses = 0.0
        for row in expense_summary_rows:
            expense_categories.append(row.expense_type)
            expense_amounts.append(float(row.total))
            total_expenses += float(row.total)

        # 5. Profit from posted double-entry vouchers for the selected period.
        period_end = parsed_to or today
        period_start = parsed_from or date(period_end.year, period_end.month, 1)
        profit_loss = _safe_accounting_call(
            db,
            "profit_and_loss",
            _blank_profit_loss(),
            AccountingReportsService.get_profit_and_loss,
            comp_code,
            period_start,
            period_end,
        )
        total_income = float(profit_loss["total_income"] or 0.0)
        total_expense_books = float(profit_loss["total_expense"] or 0.0)
        net_profit = profit_loss["net_profit"]
        expense_ledger_rows = profit_loss["details"]["expense_ledgers"]
        if expense_ledger_rows:
            expense_categories = [row["name"] for row in expense_ledger_rows[:8]]
            expense_amounts = [float(row["amount"] or 0.0) for row in expense_ledger_rows[:8]]
            total_expenses = total_expense_books

        balance_sheet = _safe_accounting_call(
            db,
            "balance_sheet",
            _blank_balance_sheet(),
            AccountingReportsService.get_balance_sheet,
            comp_code,
            period_end,
        )
        trial_balance = _safe_accounting_call(
            db,
            "trial_balance",
            [],
            AccountingReportsService.get_trial_balance,
            comp_code,
            period_end,
        )
        books_receivables = sum(
            float(row["balance"] or 0.0) for row in trial_balance
            if row["type"] == "LEDGER"
            and row["group_type"] == "ASSET"
            and row.get("group_name") == "Sundry Debtors"
        )
        books_payables = abs(sum(
            float(row["balance"] or 0.0) for row in trial_balance
            if row["type"] == "LEDGER"
            and row["group_type"] == "LIABILITY"
            and row.get("group_name") == "Sundry Creditors"
        ))
        if books_receivables:
            receivables_outstanding = books_receivables
        if books_payables:
            payables_outstanding = books_payables

        bank_balance = sum(
            float(row["balance"] or 0.0) for row in trial_balance
            if row["type"] == "LEDGER"
            and row["group_type"] == "ASSET"
            and row.get("group_name") in {"Cash-in-hand", "Bank Accounts"}
        )
        current_assets = sum(
            float(row["balance"] or 0.0) for row in trial_balance
            if row["type"] == "LEDGER"
            and row["group_type"] == "ASSET"
            and row.get("group_name") in {"Cash-in-hand", "Bank Accounts", "Sundry Debtors", "Current Assets"}
        )
        current_liabilities = sum(
            abs(float(row["balance"] or 0.0)) for row in trial_balance
            if row["type"] == "LEDGER"
            and row["group_type"] == "LIABILITY"
            and row.get("group_name") in {"Sundry Creditors", "Current Liabilities", "Duties & Taxes", "Provisions"}
        )
        net_working_capital = current_assets - current_liabilities
        current_ratio = round(current_assets / current_liabilities, 2) if current_liabilities else 0.0

        voucher_q = db.query(VoucherHeader).filter(VoucherHeader.company_id == comp_code)
        voucher_q = _apply_date_range(voucher_q, VoucherHeader.voucher_date, parsed_from, parsed_to)
        voucher_rows = _safe_all(db, "voucher_rows", voucher_q)
        voucher_stats = {
            "total": len(voucher_rows),
            "posted": sum(1 for v in voucher_rows if v.status == "POSTED"),
            "draft": sum(1 for v in voucher_rows if v.status == "DRAFT"),
            "pending": sum(1 for v in voucher_rows if v.status not in {"POSTED", "CANCELLED", "DRAFT"}),
        }
        ledger_count_q = db.query(func.count(LedgerMaster.id)).filter(
            LedgerMaster.company_id == comp_code,
            LedgerMaster.status == "ACTIVE",
        )
        ledger_count = _safe_scalar(db, "active_ledger_count", ledger_count_q, 0) or 0

        receipts_q = db.query(func.coalesce(func.sum(PaymentReceipt.amount_inr), 0.0)).filter(PaymentReceipt.company_id == comp_code)
        receipts_q = _apply_date_range(receipts_q, PaymentReceipt.entry_date, parsed_from, parsed_to)
        receipts_total = float(_safe_scalar(db, "payment_receipts_total", receipts_q) or 0.0)

        vendor_paid_q = db.query(func.coalesce(func.sum(VendorPayment.paid_amount), 0.0)).filter(VendorPayment.company_id == comp_code)
        vendor_paid_q = _apply_date_range(vendor_paid_q, VendorPayment.payment_date, parsed_from, parsed_to)
        vendor_paid_total = float(_safe_scalar(db, "vendor_paid_total", vendor_paid_q) or 0.0)

        # 6. Aging schedule of Receivables
        # Try to read from BuyerAgingSummary view or calculate directly
        aging_summary = {
            "current": 0.0,
            "bucket_1_30": 0.0,
            "bucket_31_60": 0.0,
            "bucket_61_90": 0.0,
            "bucket_above_90": 0.0
        }
        
        try:
            aging_rows = _safe_all(db, "buyer_aging_summary", db.query(BuyerAgingSummary).filter(BuyerAgingSummary.company_id == comp_code))
            for r in aging_rows:
                aging_summary["current"] += float(r.not_due or 0.0)
                aging_summary["bucket_1_30"] += float(r.bucket_1_30_days or 0.0)
                aging_summary["bucket_31_60"] += float(r.bucket_31_60_days or 0.0)
                aging_summary["bucket_61_90"] += float(r.bucket_61_90_days or 0.0)
                aging_summary["bucket_above_90"] += float(r.bucket_above_90 or 0.0)
        except Exception:
            db.rollback()
            # Calculate manually from CustomerReceivable
            today = date.today()
            receivable_items_q = db.query(CustomerReceivable).filter(CustomerReceivable.company_id == comp_code)
            receivable_items_q = _apply_date_range(receivable_items_q, CustomerReceivable.invoice_date, parsed_from, parsed_to)
            receivable_items = _safe_all(db, "manual_receivable_aging_items", receivable_items_q)
            for r in receivable_items:
                bal = float(r.balance_amount or 0.0)
                if bal <= 0: continue
                due_diff = (today - r.due_date).days if r.due_date else 0
                if due_diff <= 0:
                    aging_summary["current"] += bal
                elif due_diff <= 30:
                    aging_summary["bucket_1_30"] += bal
                elif due_diff <= 60:
                    aging_summary["bucket_31_60"] += bal
                elif due_diff <= 90:
                    aging_summary["bucket_61_90"] += bal
                else:
                    aging_summary["bucket_above_90"] += bal

        # 7. Six-month cash flow from actual bank/cash transactions.
        month_starts = []
        cursor = date(period_end.year, period_end.month, 1)
        for offset in range(5, -1, -1):
            year = cursor.year
            month = cursor.month - offset
            while month <= 0:
                month += 12
                year -= 1
            month_starts.append(date(year, month, 1))

        trend_start = month_starts[0]
        bank_rows_q = db.query(
            func.extract("year", BankTransaction.transaction_date).label("year"),
            func.extract("month", BankTransaction.transaction_date).label("month"),
            func.coalesce(func.sum(BankTransaction.debit), 0.0).label("inflow"),
            func.coalesce(func.sum(BankTransaction.credit), 0.0).label("outflow"),
        ).filter(
            BankTransaction.company_id == comp_code,
            BankTransaction.transaction_date >= trend_start,
            BankTransaction.transaction_date <= period_end,
        ).group_by(
            func.extract("year", BankTransaction.transaction_date),
            func.extract("month", BankTransaction.transaction_date),
        )
        bank_rows = _safe_all(db, "bank_monthly_trend", bank_rows_q)
        trend_map = {
            (int(row.year), int(row.month)): (float(row.inflow), float(row.outflow))
            for row in bank_rows
        }
        months = [month.strftime("%b %y") for month in month_starts]
        inflows = [trend_map.get((month.year, month.month), (0.0, 0.0))[0] for month in month_starts]
        outflows = [trend_map.get((month.year, month.month), (0.0, 0.0))[1] for month in month_starts]

    except Exception:
        logger.exception(
            "Finance dashboard failed company=%s fy=%s from=%s to=%s",
            comp_code,
            selected_fy,
            from_date,
            to_date,
        )
        raise

    return templates.TemplateResponse(
        request=request,
        name="dashboard/finance_dashboard.html",
        context={
            "comp_code": comp_code,
            "email": email,
            "available_companies": available_companies,
            "fy_options": fy_options,
            "selected_fy": selected_fy,
            "company_id": comp_code,
            "last_updated": last_updated_timestamp,
            "receivables_outstanding": round(receivables_outstanding, 2),
            "payables_outstanding": round(payables_outstanding, 2),
            "bank_balance": round(bank_balance, 2),
            "cash_inflow_period": round(cash_inflow_period, 2),
            "cash_outflow_period": round(cash_outflow_period, 2),
            "net_cash_flow": round(net_cash_flow, 2),
            "total_expenses": round(total_expenses, 2),
            "total_income": round(total_income, 2),
            "net_profit": round(net_profit, 2),
            "total_assets": round(balance_sheet["total_assets"], 2),
            "total_liabilities": round(balance_sheet["total_liabilities"], 2),
            "total_equity": round(balance_sheet["total_equity"], 2),
            "balance_sheet_difference": round(balance_sheet["difference"], 2),
            "is_balance_sheet_balanced": balance_sheet["is_balanced"],
            "current_assets": round(current_assets, 2),
            "current_liabilities": round(current_liabilities, 2),
            "net_working_capital": round(net_working_capital, 2),
            "current_ratio": current_ratio,
            "voucher_stats": voucher_stats,
            "ledger_count": ledger_count,
            "receipts_total": round(receipts_total, 2),
            "vendor_paid_total": round(vendor_paid_total, 2),
            "expense_categories": expense_categories,
            "expense_amounts": expense_amounts,
            "aging_summary": aging_summary,
            "month_labels": months,
            "inflows": inflows,
            "outflows": outflows,
            "from_date": from_date,
            "to_date": to_date
        }
    )
