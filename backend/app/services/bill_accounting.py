from datetime import date
import logging
from typing import Optional
from sqlalchemy import text
from sqlalchemy.orm import Session, joinedload

from app.database.models.enterprise_finance import AccountGroup, LedgerMaster, VoucherHeader
from app.services.posting_engine import PostingEngineService

logger = logging.getLogger(__name__)


def ensure_bill_accounting_schema(db: Session) -> None:
    statements = [
        "ALTER TABLE diesel_logs ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'DRAFT'",
        "ALTER TABLE diesel_logs ADD COLUMN IF NOT EXISTS journal_id INTEGER",
        "ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'DRAFT'",
        "ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS journal_id INTEGER",
        "ALTER TABLE container_logs ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'DRAFT'",
        "ALTER TABLE container_logs ADD COLUMN IF NOT EXISTS journal_id INTEGER",
        "ALTER TABLE qa_testing_logs ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'DRAFT'",
        "ALTER TABLE qa_testing_logs ADD COLUMN IF NOT EXISTS journal_id INTEGER",
        "ALTER TABLE qa_testing_logs ADD COLUMN IF NOT EXISTS product_name VARCHAR(150)",
        "ALTER TABLE qa_testing_logs ADD COLUMN IF NOT EXISTS parameters TEXT",
        "ALTER TABLE other_expenses ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'DRAFT'",
        "ALTER TABLE other_expenses ADD COLUMN IF NOT EXISTS journal_id INTEGER",
        "ALTER TABLE commercial_invoices ADD COLUMN IF NOT EXISTS journal_id INTEGER",
        "ALTER TABLE commercial_invoices ADD COLUMN IF NOT EXISTS cogs_journal_id INTEGER",
        "ALTER TABLE commercial_invoices ADD COLUMN IF NOT EXISTS customer_ledger_id INTEGER",
        "ALTER TABLE commercial_invoices ADD COLUMN IF NOT EXISTS sales_ledger_id INTEGER",
        "ALTER TABLE sales_dispatch ADD COLUMN IF NOT EXISTS journal_id INTEGER",
        "ALTER TABLE de_heading ADD COLUMN IF NOT EXISTS journal_id INTEGER",
        "ALTER TABLE peeling ADD COLUMN IF NOT EXISTS journal_id INTEGER",
        "ALTER TABLE daily_attendance ADD COLUMN IF NOT EXISTS journal_id INTEGER",
        "ALTER TABLE daily_attendance ADD COLUMN IF NOT EXISTS approved_duty_credit DOUBLE PRECISION DEFAULT 0",
        "ALTER TABLE daily_attendance ADD COLUMN IF NOT EXISTS salary_adjustment_reason TEXT",
        "ALTER TABLE employee_statutory_master ADD COLUMN IF NOT EXISTS eps_applicable BOOLEAN DEFAULT TRUE",
        "ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS brand VARCHAR(150)",
        "ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS packing_style VARCHAR(150)",
        "ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS freezer VARCHAR(150)",
        "ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS count_glaze VARCHAR(100)",
        "ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS weight_glaze VARCHAR(100)",
        "ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS species VARCHAR(150)",
        "ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS variety VARCHAR(150)",
        "ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS grade VARCHAR(100)",
        "ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS no_of_pieces VARCHAR(100)",
        "ALTER TABLE proforma_invoices ADD COLUMN IF NOT EXISTS no_of_mc INTEGER DEFAULT 0",
        """
        CREATE TABLE IF NOT EXISTS employee_salary_advance_recovery (
            id SERIAL PRIMARY KEY,
            company_id VARCHAR(50) NOT NULL,
            employee_id VARCHAR(50) NOT NULL,
            advance_id INTEGER NOT NULL,
            salary_processing_id INTEGER,
            month_year VARCHAR(7) NOT NULL,
            amount DOUBLE PRECISION DEFAULT 0 NOT NULL,
            status VARCHAR(20) DEFAULT 'ACTIVE' NOT NULL,
            recovered_at TIMESTAMP,
            reversed_at TIMESTAMP,
            CONSTRAINT uq_advance_recovery_month UNIQUE (company_id, advance_id, month_year)
        )
        """,
        "CREATE INDEX IF NOT EXISTS ix_advance_recovery_employee ON employee_salary_advance_recovery (company_id, employee_id, month_year)",
        "ALTER TABLE salary_processing ADD COLUMN IF NOT EXISTS payment_date DATE",
        "ALTER TABLE salary_processing ADD COLUMN IF NOT EXISTS utr_reference VARCHAR(50)",
        "ALTER TABLE salary_processing ADD COLUMN IF NOT EXISTS paid_amount DOUBLE PRECISION DEFAULT 0",
        "ALTER TABLE salary_processing ADD COLUMN IF NOT EXISTS epf_employer DOUBLE PRECISION DEFAULT 0",
        "ALTER TABLE salary_processing ADD COLUMN IF NOT EXISTS eps_employer DOUBLE PRECISION DEFAULT 0",
        "ALTER TABLE salary_processing ADD COLUMN IF NOT EXISTS edli_employer DOUBLE PRECISION DEFAULT 0",
        "ALTER TABLE salary_processing ADD COLUMN IF NOT EXISTS payment_journal_id INTEGER",
        """
        CREATE TABLE IF NOT EXISTS salary_payment_logs (
            id SERIAL PRIMARY KEY,
            company_id VARCHAR(50) NOT NULL,
            salary_id INTEGER NOT NULL,
            employee_id VARCHAR(50),
            employee_name VARCHAR(150),
            month_year VARCHAR(7) NOT NULL,
            paid_amount DOUBLE PRECISION DEFAULT 0,
            payment_mode VARCHAR(20) DEFAULT 'BANK',
            payment_date DATE,
            utr_reference VARCHAR(50),
            payment_status VARCHAR(20) DEFAULT 'PARTIAL',
            journal_id INTEGER,
            bank_cash_ledger_id INTEGER,
            is_cancelled BOOLEAN DEFAULT FALSE,
            created_by VARCHAR(150),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """,
        "ALTER TABLE salary_payment_logs ADD COLUMN IF NOT EXISTS bank_cash_ledger_id INTEGER",
        "ALTER TABLE salary_payment_logs ADD COLUMN IF NOT EXISTS is_cancelled BOOLEAN DEFAULT FALSE",
        "CREATE INDEX IF NOT EXISTS ix_salary_payment_logs_salary ON salary_payment_logs(company_id, salary_id)",
    ]
    for statement in statements:
        db.execute(text(statement))
    db.flush()


def amount_line(
    ledger_name: str,
    group_name: str,
    group_type: str,
    debit: float = 0.0,
    credit: float = 0.0,
    remarks: str = "",
    parent_group_name: Optional[str] = None,
    cost_center_id: Optional[int] = None,
) -> dict:
    return {
        "ledger_name": ledger_name,
        "group_name": group_name,
        "group_type": group_type,
        "parent_group_name": parent_group_name,
        "debit_amount": round(float(debit or 0.0), 2),
        "credit_amount": round(float(credit or 0.0), 2),
        "remarks": remarks,
        "cost_center_id": cost_center_id,
    }


def list_posting_ledgers(
    db: Session,
    company_id: str,
    group_types: Optional[set[str]] = None,
    group_names: Optional[set[str]] = None,
) -> list[LedgerMaster]:
    try:
        query = (
            db.query(LedgerMaster)
            .options(joinedload(LedgerMaster.group).joinedload(AccountGroup.parent))
            .join(AccountGroup, LedgerMaster.group_id == AccountGroup.id)
            .filter(LedgerMaster.company_id == company_id, LedgerMaster.status == "ACTIVE")
        )
        if group_types:
            query = query.filter(AccountGroup.group_type.in_(group_types))
        if group_names:
            query = query.filter(AccountGroup.group_name.in_(group_names))
        return query.order_by(AccountGroup.group_name, LedgerMaster.ledger_name).all()
    except Exception as exc:
        db.rollback()
        logger.warning("Posting ledger list unavailable for %s: %s", company_id, exc)
        return []


def resolve_posting_ledger(
    db: Session,
    company_id: str,
    ledger_id: Optional[int],
    default_ledger_name: str,
    default_group_name: str,
    default_group_type: str,
    default_parent_group_name: Optional[str] = None,
) -> dict:
    if not ledger_id:
        return {
            "ledger_name": default_ledger_name,
            "group_name": default_group_name,
            "group_type": default_group_type,
            "parent_group_name": default_parent_group_name,
        }

    ledger = (
        db.query(LedgerMaster)
        .options(joinedload(LedgerMaster.group).joinedload(AccountGroup.parent))
        .filter(
            LedgerMaster.id == ledger_id,
            LedgerMaster.company_id == company_id,
            LedgerMaster.status == "ACTIVE",
        )
        .first()
    )
    if not ledger or not ledger.group:
        raise ValueError("Selected posting ledger is not available")

    return {
        "ledger_name": ledger.ledger_name,
        "group_name": ledger.group.group_name,
        "group_type": ledger.group.group_type,
        "parent_group_name": ledger.group.parent.group_name if ledger.group.parent else None,
    }


def post_vendor_bill(
    db: Session,
    company_id: str,
    voucher_date: date,
    reference_no: str,
    vendor_name: str,
    expense_ledger_name: str,
    taxable_amount: float,
    gst_amount: float,
    total_amount: float,
    narration: str,
    created_by: str,
    expense_group_name: str = "Direct Expenses",
    expense_group_type: str = "EXPENSE",
    expense_parent_group_name: Optional[str] = None,
    voucher_type: str = "Purchase",
    cost_center_id: Optional[int] = None,
) -> VoucherHeader:
    taxable_amount = round(float(taxable_amount or 0.0), 2)
    gst_amount = round(float(gst_amount or 0.0), 2)
    total_amount = round(float(total_amount or 0.0), 2)
    if total_amount <= 0:
        raise ValueError("Bill total must be greater than zero")
    if abs((taxable_amount + gst_amount) - total_amount) > 0.05:
        raise ValueError("Bill total must equal taxable amount plus GST")

    clean_vendor = (vendor_name or "Unknown Vendor").strip() or "Unknown Vendor"
    vendor_ledger = clean_vendor if clean_vendor.lower().endswith("a/c") else f"{clean_vendor} A/c"
    details = [
        amount_line(
            expense_ledger_name,
            expense_group_name,
            expense_group_type,
            debit=taxable_amount,
            remarks=reference_no,
            parent_group_name=expense_parent_group_name,
            cost_center_id=cost_center_id,
        ),
        amount_line(
            vendor_ledger,
            "Sundry Creditors",
            "LIABILITY",
            credit=total_amount,
            remarks=reference_no,
            parent_group_name="Current Liabilities",
        ),
    ]
    if gst_amount:
        details.insert(
            1,
            amount_line(
                "Input GST A/c",
                "Duties & Taxes",
                "LIABILITY",
                debit=gst_amount,
                remarks=reference_no,
                parent_group_name="Current Liabilities",
            ),
        )

    return PostingEngineService.create_voucher(
        db,
        company_id,
        voucher_type,
        voucher_date,
        narration,
        details,
        reference_no=reference_no,
        created_by=created_by or "SYSTEM",
        status="POSTED",
    )


def post_diesel_purchase(
    db: Session,
    company_id: str,
    voucher_date: date,
    reference_no: str,
    vendor_name: str,
    taxable_amount: float,
    tax_amount: float,
    total_amount: float,
    created_by: str,
) -> VoucherHeader:
    taxable_amount = round(float(taxable_amount or 0.0), 2)
    tax_amount = round(float(tax_amount or 0.0), 2)
    total_amount = round(float(total_amount or 0.0), 2)
    if abs((taxable_amount + tax_amount) - total_amount) > 0.05:
        raise ValueError("Diesel bill total must equal base value plus tax")
    clean_vendor = (vendor_name or "Diesel Vendor").strip() or "Diesel Vendor"
    vendor_ledger = clean_vendor if clean_vendor.lower().endswith("a/c") else f"{clean_vendor} A/c"
    details = [
        amount_line("Diesel Stock A/c", "Current Assets", "ASSET", debit=taxable_amount, remarks=reference_no),
        amount_line(vendor_ledger, "Sundry Creditors", "LIABILITY", credit=total_amount, remarks=reference_no, parent_group_name="Current Liabilities"),
    ]
    if tax_amount:
        details.insert(1, amount_line("Input GST A/c", "Duties & Taxes", "LIABILITY", debit=tax_amount, remarks=reference_no, parent_group_name="Current Liabilities"))
    return PostingEngineService.create_voucher(
        db,
        company_id,
        "Purchase",
        voucher_date,
        f"Diesel purchase invoice {reference_no}",
        details,
        reference_no=reference_no,
        created_by=created_by or "SYSTEM",
        status="POSTED",
    )


def post_diesel_consumption(
    db: Session,
    company_id: str,
    voucher_date: date,
    reference_no: str,
    amount: float,
    created_by: str,
) -> VoucherHeader:
    amount = round(float(amount or 0.0), 2)
    if amount <= 0:
        raise ValueError("Diesel consumption amount must be greater than zero")
    details = [
        amount_line("Fuel Consumption Expense A/c", "Direct Expenses", "EXPENSE", debit=amount, remarks=reference_no),
        amount_line("Diesel Stock A/c", "Current Assets", "ASSET", credit=amount, remarks=reference_no),
    ]
    return PostingEngineService.create_voucher(
        db,
        company_id,
        "Journal",
        voucher_date,
        f"Diesel consumption transfer {reference_no}",
        details,
        reference_no=reference_no,
        created_by=created_by or "SYSTEM",
        status="POSTED",
    )


def post_export_sales_invoice(
    db: Session,
    company_id: str,
    voucher_date: date,
    reference_no: str,
    buyer_name: str,
    invoice_value_inr: float,
    created_by: str,
) -> VoucherHeader:
    invoice_value_inr = round(float(invoice_value_inr or 0.0), 2)
    if invoice_value_inr <= 0:
        raise ValueError("Commercial invoice value must be greater than zero")

    clean_buyer = (buyer_name or "Export Buyer").strip() or "Export Buyer"
    buyer_ledger = clean_buyer if clean_buyer.lower().endswith("a/c") else f"{clean_buyer} - Customer A/c"
    details = [
        amount_line(
            buyer_ledger,
            "Sundry Debtors",
            "ASSET",
            debit=invoice_value_inr,
            remarks=reference_no,
            parent_group_name="Current Assets",
        ),
        amount_line(
            "Export Sales A/c",
            "Sales Accounts",
            "INCOME",
            credit=invoice_value_inr,
            remarks=reference_no,
        ),
    ]
    return PostingEngineService.create_voucher(
        db,
        company_id,
        "Sales",
        voucher_date,
        f"Export commercial invoice {reference_no} for {clean_buyer}",
        details,
        reference_no=reference_no,
        created_by=created_by or "SYSTEM",
        status="POSTED",
    )


def post_contractor_monthly_bill(
    db: Session,
    company_id: str,
    voucher_date: date,
    reference_no: str,
    contractor_name: str,
    bill_type: str,
    taxable_amount: float,
    gst_amount: float,
    total_amount: float,
    created_by: str,
) -> VoucherHeader:
    taxable_amount = round(float(taxable_amount or 0.0), 2)
    gst_amount = round(float(gst_amount or 0.0), 2)
    total_amount = round(float(total_amount or 0.0), 2)
    if total_amount <= 0:
        raise ValueError("Contractor bill total must be greater than zero")
    if abs((taxable_amount + gst_amount) - total_amount) > 0.05:
        raise ValueError("Contractor bill total must equal taxable amount plus GST")

    existing = db.query(VoucherHeader).filter(
        VoucherHeader.company_id == company_id,
        VoucherHeader.reference_no == reference_no,
        VoucherHeader.status == "POSTED",
    ).first()
    if existing:
        return existing

    clean_contractor = (contractor_name or "Contractor").strip() or "Contractor"
    contractor_ledger = clean_contractor if clean_contractor.lower().endswith("a/c") else f"{clean_contractor} - Contractor A/c"
    clean_type = (bill_type or "Contractor").strip().title()
    expense_ledger_name = f"{clean_type} Contractor Charges A/c"

    details = [
        amount_line(
            expense_ledger_name,
            "Direct Expenses",
            "EXPENSE",
            debit=taxable_amount,
            remarks=reference_no,
        ),
        amount_line(
            contractor_ledger,
            "Sundry Creditors",
            "LIABILITY",
            credit=total_amount,
            remarks=reference_no,
            parent_group_name="Current Liabilities",
        ),
    ]
    if gst_amount:
        details.insert(
            1,
            amount_line(
                "Input GST A/c",
                "Duties & Taxes",
                "LIABILITY",
                debit=gst_amount,
                remarks=reference_no,
                parent_group_name="Current Liabilities",
            ),
        )

    return PostingEngineService.create_voucher(
        db,
        company_id,
        "Purchase",
        voucher_date,
        f"{clean_type} monthly contractor bill {reference_no} for {clean_contractor}",
        details,
        reference_no=reference_no,
        created_by=created_by or "SYSTEM",
        status="POSTED",
    )


def post_contractor_source_charge(
    db: Session,
    company_id: str,
    voucher_date: date,
    reference_no: str,
    contractor_name: str,
    charge_type: str,
    taxable_amount: float,
    gst_percent: float,
    created_by: str,
    quantity: float = 0.0,
    rate: float = 0.0,
) -> VoucherHeader:
    taxable_amount = round(float(taxable_amount or 0.0), 2)
    gst_percent = round(float(gst_percent or 0.0), 2)
    gst_amount = round(taxable_amount * gst_percent / 100.0, 2)
    total_amount = round(taxable_amount + gst_amount, 2)
    if total_amount <= 0:
        raise ValueError("Contractor source charge must be greater than zero")

    existing = db.query(VoucherHeader).filter(
        VoucherHeader.company_id == company_id,
        VoucherHeader.reference_no == reference_no,
        VoucherHeader.status == "POSTED",
    ).first()
    if existing:
        return existing

    clean_contractor = (contractor_name or "Contractor").strip() or "Contractor"
    clean_type = (charge_type or "Contractor").strip().title()
    contractor_ledger = clean_contractor if clean_contractor.lower().endswith("a/c") else f"{clean_contractor} - Contractor A/c"
    remarks = f"{reference_no} | Qty: {round(float(quantity or 0.0), 2)} | Rate: {round(float(rate or 0.0), 2)}"

    details = [
        amount_line(
            f"{clean_type} Contractor Charges A/c",
            "Direct Expenses",
            "EXPENSE",
            debit=taxable_amount,
            remarks=remarks,
        ),
        amount_line(
            contractor_ledger,
            "Sundry Creditors",
            "LIABILITY",
            credit=total_amount,
            remarks=reference_no,
            parent_group_name="Current Liabilities",
        ),
    ]
    if gst_amount:
        details.insert(
            1,
            amount_line(
                "Input GST A/c",
                "Duties & Taxes",
                "LIABILITY",
                debit=gst_amount,
                remarks=f"Input GST @ {gst_percent:g}% | {reference_no}",
                parent_group_name="Current Liabilities",
            ),
        )

    return PostingEngineService.create_voucher(
        db,
        company_id,
        "Purchase",
        voucher_date,
        f"Auto-posted {clean_type} contractor charge {reference_no} for {clean_contractor}",
        details,
        reference_no=reference_no,
        created_by=created_by or "SYSTEM",
        status="POSTED",
    )


def cancel_linked_bill_voucher(db: Session, company_id: str, journal_id: Optional[int], email: Optional[str]) -> None:
    if not journal_id:
        return
    PostingEngineService.reverse_voucher(
        db, company_id, journal_id,
        "Linked source transaction cancelled",
        email or "SYSTEM",
    )
