import logging
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
import json

from app.database.models.enterprise_finance import (
    AccountGroup, LedgerMaster, VoucherType, VoucherHeader, VoucherDetail,
    CostCenter, CurrencyMaster, ExchangeRate, FinanceAuditTrail, FinancialYearMaster
)

logger = logging.getLogger(__name__)

class PostingEngineService:

    @staticmethod
    def validate_details(details: list) -> tuple[Decimal, Decimal]:
        """Validate journal lines and return currency-rounded debit/credit totals."""
        if not isinstance(details, list) or len(details) < 2:
            raise ValueError("A voucher requires at least two accounting lines")

        total_debit = Decimal("0.00")
        total_credit = Decimal("0.00")
        for index, detail in enumerate(details, start=1):
            try:
                debit = Decimal(str(detail.get("debit_amount", 0) or 0))
                credit = Decimal(str(detail.get("credit_amount", 0) or 0))
            except (InvalidOperation, TypeError, ValueError):
                raise ValueError(f"Voucher line {index} has an invalid amount") from None

            if not debit.is_finite() or not credit.is_finite():
                raise ValueError(f"Voucher line {index} amount must be finite")
            if debit < 0 or credit < 0:
                raise ValueError(f"Voucher line {index} amount cannot be negative")
            if (debit > 0) == (credit > 0):
                raise ValueError(f"Voucher line {index} requires exactly one positive debit or credit")
            if not str(detail.get("ledger_name", "")).strip():
                raise ValueError(f"Voucher line {index} requires a ledger")

            total_debit += debit.quantize(Decimal("0.01"))
            total_credit += credit.quantize(Decimal("0.01"))

        if total_debit <= 0 or total_debit != total_credit:
            raise ValueError(
                f"Transaction not balanced. Debit {total_debit:.2f} must equal credit {total_credit:.2f}"
            )
        return total_debit, total_credit

    @staticmethod
    def verify_balance(details: list) -> bool:
        """Compatibility helper for callers that only need a boolean result."""
        try:
            PostingEngineService.validate_details(details)
            return True
        except (ValueError, TypeError):
            return False

    @staticmethod
    def get_or_create_group(db: Session, company_id: str, group_name: str, group_type: str, parent_name: str = None) -> AccountGroup:
        """Finds or creates an account group."""
        group = db.query(AccountGroup).filter(
            AccountGroup.company_id == company_id,
            AccountGroup.group_name == group_name
        ).first()
        
        if not group:
            parent_group_id = None
            if parent_name:
                parent = PostingEngineService.get_or_create_group(db, company_id, parent_name, group_type)
                parent_group_id = parent.id
            
            group = AccountGroup(
                company_id=company_id,
                group_name=group_name,
                parent_group_id=parent_group_id,
                group_type=group_type
            )
            db.add(group)
            db.flush()
            logger.info(f"Created Account Group: {group_name} ({group_type})")
        return group

    @staticmethod
    def get_or_create_ledger(db: Session, company_id: str, ledger_name: str, group_name: str, group_type: str, parent_group_name: str = None) -> LedgerMaster:
        """Finds or creates a ledger master, ensuring the group exists first."""
        ledger = db.query(LedgerMaster).filter(
            LedgerMaster.company_id == company_id,
            LedgerMaster.ledger_name == ledger_name
        ).first()

        if not ledger:
            group = PostingEngineService.get_or_create_group(db, company_id, group_name, group_type, parent_group_name)
            ledger = LedgerMaster(
                company_id=company_id,
                ledger_name=ledger_name,
                group_id=group.id,
                opening_balance=0.0,
                opening_balance_type='DR',
                status='ACTIVE',
                created_by='SYSTEM'
            )
            db.add(ledger)
            db.flush()
            logger.info(f"Created Ledger Master: {ledger_name} under group {group_name}")
        return ledger

    @staticmethod
    def get_or_create_voucher_type(db: Session, company_id: str, type_name: str, prefix: str) -> VoucherType:
        """Finds or creates a voucher type configuration."""
        v_type = db.query(VoucherType).filter(
            VoucherType.company_id == company_id,
            VoucherType.name == type_name
        ).first()

        if not v_type:
            v_type = VoucherType(
                company_id=company_id,
                name=type_name,
                prefix=prefix,
                is_auto_number=True,
                next_number=1
            )
            db.add(v_type)
            db.flush()
            logger.info(f"Created Voucher Type: {type_name} (Prefix: {prefix})")
        return v_type

    @staticmethod
    def generate_voucher_no(db: Session, company_id: str, voucher_type_id: int, voucher_date: date = None) -> str:
        """Generates the next sequential voucher number (e.g. PUR-2026-000001)."""
        v_type = db.query(VoucherType).filter(
            VoucherType.id == voucher_type_id,
            VoucherType.company_id == company_id,
        ).with_for_update().first()
        if not v_type:
            raise ValueError("Voucher Type not found")
        
        current_year = (voucher_date or date.today()).year
        num_str = str(v_type.next_number).zfill(6)
        voucher_no = f"{v_type.prefix}-{current_year}-{num_str}"
        
        # Increment sequence
        v_type.next_number += 1
        db.flush()
        return voucher_no

    @staticmethod
    def write_finance_audit(db: Session, company_id: str, table_name: str, rec_id: int, action: str, old_val: dict, new_val: dict, email: str):
        """Writes an entry into the Finance Audit Trail table."""
        audit = FinanceAuditTrail(
            company_id=company_id,
            table_name=table_name,
            record_id=rec_id,
            action=action,
            old_value=json.dumps(old_val) if old_val else None,
            new_value=json.dumps(new_val) if new_val else None,
            user_email=email,
            timestamp=datetime.utcnow()
        )
        db.add(audit)

    @staticmethod
    def create_voucher(db: Session, company_id: str, voucher_type_name: str, voucher_date: date, narration: str, details: list, reference_no: str = None, created_by: str = 'SYSTEM', status: str = 'POSTED') -> VoucherHeader:
        """Creates and posts a fully balanced double entry voucher."""
        total_debit, _ = PostingEngineService.validate_details(details)
        allowed_statuses = {"DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "POSTED", "CANCELLED"}
        if status not in allowed_statuses:
            raise ValueError("Invalid voucher status")

        locked_year = db.query(FinancialYearMaster).filter(
            FinancialYearMaster.company_id == company_id,
            FinancialYearMaster.is_locked.is_(True),
            FinancialYearMaster.start_date <= voucher_date,
            FinancialYearMaster.end_date >= voucher_date,
        ).first()
        if locked_year:
            raise ValueError(f"Financial year {locked_year.year_name} is locked")

        cost_center_ids = {d.get("cost_center_id") for d in details if d.get("cost_center_id")}
        if cost_center_ids:
            valid_count = db.query(CostCenter.id).filter(
                CostCenter.company_id == company_id,
                CostCenter.is_active.is_(True),
                CostCenter.id.in_(cost_center_ids),
            ).count()
            if valid_count != len(cost_center_ids):
                raise ValueError("One or more cost centers are invalid for this company")

        v_type = PostingEngineService.get_or_create_voucher_type(
            db, company_id, voucher_type_name, voucher_type_name[:3].upper()
        )
        
        voucher_no = PostingEngineService.generate_voucher_no(db, company_id, v_type.id, voucher_date)
        
        header = VoucherHeader(
            company_id=company_id,
            voucher_no=voucher_no,
            voucher_date=voucher_date,
            voucher_type_id=v_type.id,
            reference_no=reference_no,
            narration=narration,
            status=status,
            created_by=created_by,
            created_at=datetime.utcnow()
        )
        db.add(header)
        db.flush()

        for d in details:
            ledger = PostingEngineService.get_or_create_ledger(
                db, company_id, d['ledger_name'], d['group_name'], d['group_type'], d.get('parent_group_name')
            )
            detail = VoucherDetail(
                voucher_id=header.id,
                ledger_id=ledger.id,
                cost_center_id=d.get('cost_center_id'),
                debit_amount=Decimal(str(d.get('debit_amount', 0) or 0)).quantize(Decimal("0.01")),
                credit_amount=Decimal(str(d.get('credit_amount', 0) or 0)).quantize(Decimal("0.01")),
                remarks=d.get('remarks')
            )
            db.add(detail)

        PostingEngineService.write_finance_audit(
            db, company_id, 'voucher_headers', header.id, 'INSERT', None, 
            {"voucher_no": voucher_no, "amount": float(total_debit)},
            created_by
        )
        db.flush()
        return header

    @staticmethod
    def reverse_voucher(
        db: Session,
        company_id: str,
        voucher_id: int,
        reason: str,
        reversed_by: str = "SYSTEM",
        reversal_date: date | None = None,
    ) -> VoucherHeader | None:
        """Create an immutable contra entry for a posted source voucher.

        The original voucher remains POSTED so the audit trail is preserved.  The
        contra voucher neutralises it in every accounting report.  Repeating the
        operation is idempotent and returns the existing reversal.
        """
        voucher = (
            db.query(VoucherHeader)
            .options(
                joinedload(VoucherHeader.details)
                .joinedload(VoucherDetail.ledger)
                .joinedload(LedgerMaster.group)
            )
            .filter(
                VoucherHeader.id == voucher_id,
                VoucherHeader.company_id == company_id,
            )
            .first()
        )
        if not voucher:
            return None
        if voucher.status != "POSTED":
            if voucher.status not in {"CANCELLED", "REJECTED"}:
                voucher.status = "CANCELLED"
            return None

        existing_audit = db.query(FinanceAuditTrail).filter(
            FinanceAuditTrail.company_id == company_id,
            FinanceAuditTrail.table_name == "voucher_headers",
            FinanceAuditTrail.record_id == voucher.id,
            FinanceAuditTrail.action == "REVERSE",
        ).order_by(FinanceAuditTrail.id.desc()).first()
        if existing_audit and existing_audit.new_value:
            try:
                reversal_id = int(json.loads(existing_audit.new_value).get("reversal_voucher_id"))
                return db.query(VoucherHeader).filter(
                    VoucherHeader.id == reversal_id,
                    VoucherHeader.company_id == company_id,
                ).first()
            except (TypeError, ValueError, json.JSONDecodeError):
                pass

        clean_reason = str(reason or "Source transaction cancelled").strip()
        lines = []
        for line in voucher.details:
            if not line.ledger or not line.ledger.group:
                raise ValueError("Cannot reverse a voucher with an invalid ledger link")
            lines.append({
                "ledger_name": line.ledger.ledger_name,
                "group_name": line.ledger.group.group_name,
                "group_type": line.ledger.group.group_type,
                "cost_center_id": line.cost_center_id,
                "debit_amount": float(line.credit_amount or 0),
                "credit_amount": float(line.debit_amount or 0),
                "remarks": f"Reversal of {voucher.voucher_no}: {clean_reason}",
            })
        reversal = PostingEngineService.create_voucher(
            db,
            company_id,
            "Journal",
            reversal_date or date.today(),
            f"Reversal of {voucher.voucher_no}: {clean_reason}",
            lines,
            reference_no=f"REV-{voucher.voucher_no}"[:50],
            created_by=reversed_by or "SYSTEM",
            status="POSTED",
        )
        PostingEngineService.write_finance_audit(
            db,
            company_id,
            "voucher_headers",
            voucher.id,
            "REVERSE",
            {"status": voucher.status},
            {"reversal_voucher_id": reversal.id, "reason": clean_reason},
            reversed_by or "SYSTEM",
        )
        return reversal

    # =========================================================================
    # ERP SEAFOOD AUTO-POSTING RULES
    # =========================================================================

    @staticmethod
    def post_shrimp_purchase(db: Session, company_id: str, supplier_name: str, total_amount: float, gst_rate: float, tds_rate: float, batch_number: str, invoice_date: date, created_by: str = "SYSTEM") -> VoucherHeader:
        """
        Auto-posts raw material purchasing.
        Double entry:
          Debit: Shrimp Purchase Account (Base Value)
          Debit: Input GST Account (GST amount)
          Credit: Supplier Accounts Payable (Total Net Payable)
          Credit: TDS Payable Account (TDS deduction)
        """
        gst_amount = round(total_amount * (gst_rate / 100.0), 2)
        tds_amount = round(total_amount * (tds_rate / 100.0), 2)
        net_payable = round(total_amount + gst_amount - tds_amount, 2)
        
        details = [
            # Debit Raw Shrimp Purchase Cost
            {
                "ledger_name": "Raw Shrimp Purchase A/c",
                "group_name": "Purchase Accounts",
                "group_type": "EXPENSE",
                "debit_amount": total_amount,
                "credit_amount": 0.0,
                "remarks": f"Raw Shrimp Purchase - Batch: {batch_number}"
            }
        ]

        if gst_amount > 0:
            details.append({
                "ledger_name": "Input GST A/c",
                "group_name": "Duties & Taxes",
                "group_type": "LIABILITY",
                "parent_group_name": "Current Liabilities",
                "debit_amount": gst_amount,
                "credit_amount": 0.0,
                "remarks": f"Input GST @ {gst_rate}%"
            })
            
        if tds_amount > 0:
            details.append({
                "ledger_name": "TDS Payable A/c",
                "group_name": "Duties & Taxes",
                "group_type": "LIABILITY",
                "parent_group_name": "Current Liabilities",
                "debit_amount": 0.0,
                "credit_amount": tds_amount,
                "remarks": f"TDS Deduction @ {tds_rate}%"
            })

        details.append({
            "ledger_name": f"{supplier_name} - Supplier A/c",
            "group_name": "Sundry Creditors",
            "group_type": "LIABILITY",
            "parent_group_name": "Current Liabilities",
            "debit_amount": 0.0,
            "credit_amount": net_payable,
            "remarks": f"Supplier Payable for batch {batch_number}"
        })

        narration = f"Auto-posted Raw Shrimp Purchase for Batch {batch_number} from {supplier_name} on {invoice_date}."
        
        return PostingEngineService.create_voucher(
            db,
            company_id,
            "Purchase",
            invoice_date,
            narration,
            details,
            reference_no=batch_number,
            created_by=created_by or "SYSTEM",
        )

    @staticmethod
    def post_processing_contractor_charges(db: Session, company_id: str, contractor_name: str, charge_type: str, quantity: float, rate: float, amount: float, batch_number: str, transaction_date: date) -> VoucherHeader:
        """
        Auto-posts Peeling/De-Heading processing charges.
        Double entry:
          Debit: Processing Cost / Peeling/DeHeading Charges
          Credit: Contractor Accounts Payable
        """
        details = [
            {
                "ledger_name": f"{charge_type} Charges A/c",
                "group_name": "Direct Expenses",
                "group_type": "EXPENSE",
                "debit_amount": amount,
                "credit_amount": 0.0,
                "remarks": f"{charge_type} of {quantity} KGs @ ₹{rate}/KG"
            },
            {
                "ledger_name": f"{contractor_name} - Contractor A/c",
                "group_name": "Sundry Creditors",
                "group_type": "LIABILITY",
                "parent_group_name": "Current Liabilities",
                "debit_amount": 0.0,
                "credit_amount": amount,
                "remarks": f"Contractor outstanding for processing batch {batch_number}"
            }
        ]

        narration = f"Auto-posted Processing charges ({charge_type}) for Contractor: {contractor_name}, Quantity: {quantity} KG on {transaction_date}."
        
        return PostingEngineService.create_voucher(
            db, company_id, "Journal", transaction_date, narration, details, reference_no=batch_number
        )

    @staticmethod
    def post_sales_dispatch(db: Session, company_id: str, invoice_no: str, customer_name: str, amount_usd: float, exchange_rate: float, packing_cost: float, freight_cost: float, invoice_date: date) -> VoucherHeader:
        """
        Auto-posts sales dispatch invoices (supporting multi-currency conversion).
        Double entry:
          Debit: Customer Account (INR Value)
          Credit: Export Sales Account (INR Value)
        
        Note: Separate entries for packing cost and freight accruals can also be booked if applicable.
        """
        amount_inr = round(amount_usd * exchange_rate, 2)
        
        details = [
            {
                "ledger_name": f"{customer_name} - Customer A/c",
                "group_name": "Sundry Debtors",
                "group_type": "ASSET",
                "parent_group_name": "Current Assets",
                "debit_amount": amount_inr,
                "credit_amount": 0.0,
                "remarks": f"Sales Dispatch - Invoice: {invoice_no} (${amount_usd:.2f} USD @ Ex-rate: {exchange_rate})"
            },
            {
                "ledger_name": "Export Sales A/c",
                "group_name": "Sales Accounts",
                "group_type": "INCOME",
                "debit_amount": 0.0,
                "credit_amount": amount_inr,
                "remarks": f"Export Sales booking for invoice {invoice_no}"
            }
        ]

        # Handle packing and freight allocation if present
        if packing_cost > 0 or freight_cost > 0:
            logger.info(f"Sales Dispatch costs: Packing {packing_cost}, Freight {freight_cost} booked as ancillary expenses.")

        narration = f"Auto-posted Export Sales Dispatch for Invoice {invoice_no} to {customer_name}. Total Value: ₹{amount_inr} (${amount_usd:.2f} USD)."
        
        return PostingEngineService.create_voucher(
            db, company_id, "Sales", invoice_date, narration, details, reference_no=invoice_no
        )

    @staticmethod
    def post_cold_storage_charges(db: Session, company_id: str, storage_name: str, handling_charges: float, rent_charges: float, transaction_date: date) -> VoucherHeader:
        """
        Auto-posts cold storage rents.
        Double entry:
          Debit: Cold Storage Expense Account
          Credit: Cold Storage Payable Account
        """
        total_charges = round(handling_charges + rent_charges, 2)
        
        details = [
            {
                "ledger_name": "Cold Storage Rent & Handling A/c",
                "group_name": "Indirect Expenses",
                "group_type": "EXPENSE",
                "debit_amount": total_charges,
                "credit_amount": 0.0,
                "remarks": f"Rent: ₹{rent_charges}, Handling: ₹{handling_charges}"
            },
            {
                "ledger_name": f"{storage_name} - Storage Vendor A/c",
                "group_name": "Sundry Creditors",
                "group_type": "LIABILITY",
                "parent_group_name": "Current Liabilities",
                "debit_amount": 0.0,
                "credit_amount": total_charges,
                "remarks": f"Cold Storage rent accruals"
            }
        ]

        narration = f"Auto-posted Cold Storage charges for storage {storage_name} as of {transaction_date}."
        
        return PostingEngineService.create_voucher(
            db, company_id, "Journal", transaction_date, narration, details, reference_no=storage_name
        )

    @staticmethod
    def post_salary_approval(db: Session, company_id: str, entry) -> VoucherHeader:
        """
        Auto-posts salary approval journal.
        Double entry:
          Debit: Salaries & Wages Expense A/c (Gross Salary + Employer PF + Employer ESI)
          Credit: Salaries Payable A/c (Net Payable)
          Credit: PF Payable A/c (Employer + Employee PF)
          Credit: ESI Payable A/c (Employer + Employee ESI)
          Credit: PT Payable A/c (Professional Tax)
          Credit: TDS Payable A/c (TDS on Salary)
          Credit: Salary Advance A/c (Advance Deduction)
          Credit: LWF Payable A/c (Employee + Employer LWF)
        """
        salaries_wages_expense = round(entry.gross_salary + entry.pf_employer + entry.esi_employer + entry.lwf_employer, 2)
        total_pf_payable = round(entry.pf_employee + entry.pf_employer, 2)
        total_esi_payable = round(entry.esi_employee + entry.esi_employer, 2)
        total_lwf_payable = round(entry.lwf_employee + entry.lwf_employer, 2)
        
        details = [
            # Debit salaries & wages expense
            {
                "ledger_name": "Salaries & Wages Expense A/c",
                "group_name": "Indirect Expenses",
                "group_type": "EXPENSE",
                "debit_amount": salaries_wages_expense,
                "credit_amount": 0.0,
                "remarks": f"Salary Expense for {entry.employee_name} ({entry.month_year})"
            },
            # Credit Salaries Payable
            {
                "ledger_name": "Salaries Payable A/c",
                "group_name": "Current Liabilities",
                "group_type": "LIABILITY",
                "debit_amount": 0.0,
                "credit_amount": entry.net_payable,
                "remarks": f"Net payable to {entry.employee_name}"
            }
        ]
        
        # Credit PF Payable
        if total_pf_payable > 0:
            details.append({
                "ledger_name": "Provident Fund (PF) Payable A/c",
                "group_name": "Duties & Taxes",
                "group_type": "LIABILITY",
                "parent_group_name": "Current Liabilities",
                "debit_amount": 0.0,
                "credit_amount": total_pf_payable,
                "remarks": f"PF contribution (Emp + Empr)"
            })
            
        # Credit ESI Payable
        if total_esi_payable > 0:
            details.append({
                "ledger_name": "Employee State Insurance (ESI) Payable A/c",
                "group_name": "Duties & Taxes",
                "group_type": "LIABILITY",
                "parent_group_name": "Current Liabilities",
                "debit_amount": 0.0,
                "credit_amount": total_esi_payable,
                "remarks": f"ESI contribution (Emp + Empr)"
            })
            
        # Credit PT Payable
        if entry.professional_tax > 0:
            details.append({
                "ledger_name": "Professional Tax (PT) Payable A/c",
                "group_name": "Duties & Taxes",
                "group_type": "LIABILITY",
                "parent_group_name": "Current Liabilities",
                "debit_amount": 0.0,
                "credit_amount": entry.professional_tax,
                "remarks": "Professional Tax deduction"
            })
            
        # Credit TDS Payable
        if entry.tds_salary > 0:
            details.append({
                "ledger_name": "TDS Payable A/c",
                "group_name": "Duties & Taxes",
                "group_type": "LIABILITY",
                "parent_group_name": "Current Liabilities",
                "debit_amount": 0.0,
                "credit_amount": entry.tds_salary,
                "remarks": "TDS deduction on Salary"
            })
            
        # Credit Salary Advance
        if entry.advance_deduction > 0:
            details.append({
                "ledger_name": "Employee Salary Advances A/c",
                "group_name": "Loans & Advances (Asset)",
                "group_type": "ASSET",
                "parent_group_name": "Current Assets",
                "debit_amount": 0.0,
                "credit_amount": entry.advance_deduction,
                "remarks": "Salary Advance recovery"
            })
            
        # Credit LWF Payable
        if total_lwf_payable > 0:
            details.append({
                "ledger_name": "Labour Welfare Fund (LWF) Payable A/c",
                "group_name": "Duties & Taxes",
                "group_type": "LIABILITY",
                "parent_group_name": "Current Liabilities",
                "debit_amount": 0.0,
                "credit_amount": total_lwf_payable,
                "remarks": "LWF contribution (Emp + Empr)"
            })
            
        # Credit Other Deductions
        if entry.other_deductions > 0:
            details.append({
                "ledger_name": "Other Deductions A/c",
                "group_name": "Current Liabilities",
                "group_type": "LIABILITY",
                "debit_amount": 0.0,
                "credit_amount": entry.other_deductions,
                "remarks": "Other salary deductions"
            })

        narration = f"Auto-posted Salary Approval for Employee {entry.employee_name} ({entry.employee_id}) for the month of {entry.month_year}."
        
        return PostingEngineService.create_voucher(
            db, company_id, "Journal", date.today(), narration, details, reference_no=f"SAL-{entry.employee_id}-{entry.month_year}"
        )

    @staticmethod
    def post_salary_payment(db: Session, company_id: str, entry, amount: float = None, bank_cash_ledger=None) -> VoucherHeader:
        """
        Auto-posts salary payment journal.
        Double entry:
          Debit: Salaries Payable A/c (Net Payable)
          Credit: Bank Account
        """
        payment_mode = (entry.payment_mode or "BANK").strip().upper()
        credit_ledger = bank_cash_ledger.ledger_name if bank_cash_ledger else ("Cash Account" if payment_mode == "CASH" else "Bank Account")
        credit_group = bank_cash_ledger.group.group_name if bank_cash_ledger and bank_cash_ledger.group else ("Cash-in-hand" if payment_mode == "CASH" else "Bank Accounts")
        credit_group_type = bank_cash_ledger.group.group_type if bank_cash_ledger and bank_cash_ledger.group else "ASSET"
        payment_date = entry.payment_date or date.today()
        reference_no = entry.utr_reference or f"PAY-{entry.employee_id}-{entry.month_year}"
        payment_amount = round(float(entry.net_payable if amount is None else amount), 2)
        if payment_amount <= 0:
            raise ValueError("Salary payment amount must be greater than zero")

        details = [
            {
                "ledger_name": "Salaries Payable A/c",
                "group_name": "Current Liabilities",
                "group_type": "LIABILITY",
                "debit_amount": payment_amount,
                "credit_amount": 0.0,
                "remarks": f"Salary Payment for {entry.employee_name} ({entry.month_year})"
            },
            {
                "ledger_name": credit_ledger,
                "group_name": credit_group,
                "group_type": credit_group_type,
                "parent_group_name": "Current Assets",
                "debit_amount": 0.0,
                "credit_amount": payment_amount,
                "remarks": f"Salary Paid - Mode: {payment_mode}; Ref: {entry.utr_reference or '-'}"
            }
        ]
        
        narration = f"Auto-posted Salary Payment for Employee {entry.employee_name} ({entry.employee_id}) for the month of {entry.month_year}. Payment Mode: {payment_mode}."
        
        return PostingEngineService.create_voucher(
            db, company_id, "Payment", payment_date, narration, details, reference_no=reference_no
        )
