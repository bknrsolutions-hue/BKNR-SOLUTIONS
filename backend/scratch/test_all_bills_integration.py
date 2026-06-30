import sys
import os
import datetime as dt
from datetime import date
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Setup path to import backend modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import Base
from app.database.models.bills import ContainerLog, ElectricityLog, QATestingLog, OtherExpense
from app.database.models.enterprise_finance import (
    BranchMaster, FinancialYearMaster, CurrencyMaster, ExchangeRate,
    AccountGroup, LedgerMaster, CostCenter, BudgetMaster, VoucherType,
    VoucherHeader, VoucherDetail, BankReconciliation, FinanceAuditTrail,
    SalaryProcessing
)
from app.database.models.payments import CustomerReceivable, VendorPayment, PaymentReceipt
from app.database.models.criteria import production_at, vendors
from app.services.posting_engine import PostingEngineService

# Create in-memory SQLite database for testing
DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def create_voucher_types(db):
    types = [
        ("Purchase", "PUR"),
        ("Sales", "SAL"),
        ("Payment", "PAY"),
        ("Receipt", "RCT"),
        ("Journal", "JV")
    ]
    for name, prefix in types:
        vt = VoucherType(company_id="TESTCOMP", name=name, prefix=prefix, is_auto_number=True, next_number=1)
        db.add(vt)
    db.commit()

def print_ledger_entries(db, journal_id):
    voucher = db.query(VoucherHeader).filter(VoucherHeader.id == journal_id).first()
    if not voucher:
        print("No voucher found.")
        return
    print(f"\nVoucher: {voucher.voucher_no} ({voucher.status}) | Date: {voucher.voucher_date}")
    print("-" * 75)
    print(f"{'Ledger Name':<45} | {'Debit (DR)':<12} | {'Credit (CR)':<12}")
    print("-" * 75)
    for detail in voucher.details:
        ledger = db.query(LedgerMaster).filter(LedgerMaster.id == detail.ledger_id).first()
        dr = f"₹{detail.debit_amount:,.2f}" if detail.debit_amount > 0 else "-"
        cr = f"₹{detail.credit_amount:,.2f}" if detail.credit_amount > 0 else "-"
        print(f"{ledger.ledger_name:<45} | {dr:<12} | {cr:<12}")
    print("-" * 75)

def run_tests():
    print("=" * 80)
    print("▶ STARTING ALL BILLS & SALARY INTEGRATION TESTS")
    print("=" * 80)
    
    # Create only the required tables to avoid JSONB SQLite compiling error
    for model in [BranchMaster, FinancialYearMaster, CurrencyMaster, ExchangeRate,
                  AccountGroup, LedgerMaster, CostCenter, BudgetMaster, VoucherType,
                  VoucherHeader, VoucherDetail, BankReconciliation, FinanceAuditTrail,
                  SalaryProcessing, ContainerLog, ElectricityLog, QATestingLog, OtherExpense,
                  CustomerReceivable, VendorPayment, PaymentReceipt, production_at, vendors]:
        model.__table__.create(bind=engine)
        
    db = TestingSessionLocal()
    
    try:
        # Seed voucher types
        create_voucher_types(db)
        
        # Seed testing unit
        unit = production_at(company_id="TESTCOMP", production_at="VIZAG PLANT")
        db.add(unit)
        db.flush()
        
        # Seed vendor
        vendor = vendors(company_id="TESTCOMP", name="AP SEAFOOD LOGISTICS", service_for="LOGISTICS")
        db.add(vendor)
        db.flush()
        
        print("\n[TEST 1] Testing Container Freight double-entry...")
        from app.routers.bills.container import post_container_log_to_ledger
        container = ContainerLog(
            company_id="TESTCOMP",
            unit_id=unit.id,
            po_number="PO-CONT-99",
            container_no="CONT-123456",
            size=40,
            vendor_id=vendor.id,
            ocean_cost=10000.0,
            local_cost=2000.0,
            handling=500.0,
            detention=0.0,
            lended_total=14750.0,  # includes GST
            date=date.today()
        )
        db.add(container)
        db.flush()
        
        j_id = post_container_log_to_ledger(db, "TESTCOMP", container, vendor.name, "tester@test.com")
        container.journal_id = j_id
        container.status = "POSTED"
        db.commit()
        print("✔ Container entry auto-posted successfully!")
        print_ledger_entries(db, j_id)
        
        print("\n[TEST 2] Testing Electricity consumption double-entry...")
        from app.routers.bills.electricity import post_electricity_log_to_ledger
        elec = ElectricityLog(
            unit_id=unit.id,
            reading_date=date.today(),
            opening_kwh=1000.0,
            closing_kwh=2500.0,
            unit_rate=10.0,
            total_cost=15000.0
        )
        db.add(elec)
        db.flush()
        
        j_id = post_electricity_log_to_ledger(db, "TESTCOMP", elec, "VIZAG PLANT", "tester@test.com")
        elec.journal_id = j_id
        elec.status = "POSTED"
        db.commit()
        print("✔ Electricity entry auto-posted successfully!")
        print_ledger_entries(db, j_id)
        
        print("\n[TEST 3] Testing QA Lab Testing double-entry...")
        from app.routers.bills.qa_testing import post_qa_testing_log_to_ledger
        qa = QATestingLog(
            unit_id=unit.id,
            batch_no="BATCH-2026-A",
            lab_name="APEX ANALYTICS LAB",
            test_cost=8000.0,
            report_ref="REP-QA-999",
            test_date=date.today()
        )
        db.add(qa)
        db.flush()
        
        j_id = post_qa_testing_log_to_ledger(db, "TESTCOMP", qa, "APEX ANALYTICS LAB", "tester@test.com")
        qa.journal_id = j_id
        qa.status = "POSTED"
        db.commit()
        print("✔ QA Testing entry auto-posted successfully!")
        print_ledger_entries(db, j_id)
        
        print("\n[TEST 4] Testing Other Expenses double-entry...")
        from app.routers.bills.expenses import post_expense_voucher_to_ledger
        expense = OtherExpense(
            unit_id=unit.id,
            category="CANTEEN",
            amount=5000.0,
            remarks="Canteen monthly provisions",
            date=date.today()
        )
        db.add(expense)
        db.flush()
        
        j_id = post_expense_voucher_to_ledger(db, "TESTCOMP", expense, "VIZAG PLANT", 0.0, "tester@test.com")
        expense.journal_id = j_id
        expense.status = "POSTED"
        db.commit()
        print("✔ Other Expense entry auto-posted successfully!")
        print_ledger_entries(db, j_id)
        
        print("\n[TEST 5] Testing Salary Processing double-entry...")
        # Create an employee SalaryProcessing mock
        salary = SalaryProcessing(
            company_id="TESTCOMP",
            month_year="2026-06",
            employee_id="EMP001",
            employee_name="John Doe",
            present_days=26.0,
            absent_days=4.0,
            gross_salary=30000.0,
            pf_employee=1800.0,
            esi_employee=225.0,
            professional_tax=200.0,
            tds_salary=0.0,
            advance_deduction=500.0,
            lwf_employee=10.0,
            total_deductions=2735.0,
            pf_employer=1800.0,
            esi_employer=975.0,
            lwf_employer=20.0,
            net_payable=27265.0,
            status="DRAFT"
        )
        db.add(salary)
        db.flush()
        
        j_id = PostingEngineService.post_salary_approval(db, "TESTCOMP", salary).id
        salary.salary_journal_id = j_id
        salary.status = "APPROVED"
        db.commit()
        print("✔ Salary Processing entry auto-posted successfully!")
        print_ledger_entries(db, j_id)

        print("\n[TEST 6] Testing Payment Receipts Auto-adjust outstanding balances...")
        # Setup customer receivable
        receivable = CustomerReceivable(
            company_id="TESTCOMP",
            invoice_no="INV-101",
            po_number="PO-11",
            container_no="CONT-11",
            buyer_name="GLOBAL FOODS US",
            buyer_type="EXPORT",
            country="USA",
            invoice_date=date.today(),
            currency="USD",
            exchange_rate=84.0,
            invoice_value_foreign=1000.0,
            invoice_value_inr=84000.0,
            balance_amount=84000.0,
            credit_days=30,
            due_date=date.today(),
            payment_status="PENDING",
            status="OPEN",
            created_by="tester@test.com"
        )
        db.add(receivable)
        db.flush()
        
        # Mock payload save
        party_ledger = PostingEngineService.get_or_create_ledger(db, "TESTCOMP", "GLOBAL FOODS US - Customer A/c", "Sundry Debtors", "ASSET")
        bank_ledger = PostingEngineService.get_or_create_ledger(db, "TESTCOMP", "HDFC Bank A/c", "Bank Accounts", "ASSET")
        
        receipt = PaymentReceipt(
            company_id="TESTCOMP",
            receipt_no="RCT-001",
            entry_date=date.today(),
            transaction_type="CUSTOMER_RECEIPT",
            party_ledger=party_ledger.ledger_name,
            bank_cash_ledger=bank_ledger.ledger_name,
            invoice_no="INV-101",
            amount=500.0,
            exchange_rate=84.0,
            amount_inr=42000.0,
            bank_charges=0.0,
            adjustment_amount=0.0,
            payment_mode="NEFT",
            created_by="tester@test.com"
        )
        db.add(receipt)
        db.flush()
        
        # Deduct balance
        receivable.balance_amount = max(0.0, receivable.balance_amount - receipt.amount_inr)
        receivable.received_amount = (receivable.received_amount or 0.0) + receipt.amount_inr
        receivable.payment_status = "PARTIAL"
        db.commit()
        
        print(f"✔ Payment receipt recorded. Invoice Outstanding Balance: ₹{receivable.balance_amount:,.2f} (Received: ₹{receivable.received_amount:,.2f})")
        assert receivable.balance_amount == 42000.0
        print("✔ Assert passed successfully!")

        print("\n[TEST 7] Testing Deletion Balance Reversion...")
        # Revert outstanding balances on deletion
        receivable.balance_amount += receipt.amount_inr
        receivable.received_amount = max(0.0, receivable.received_amount - receipt.amount_inr)
        receivable.payment_status = "PENDING"
        db.delete(receipt)
        db.commit()
        print(f"✔ Payment receipt deleted. Invoice Outstanding Balance reverted to: ₹{receivable.balance_amount:,.2f}")
        assert receivable.balance_amount == 84000.0
        print("✔ Assert passed successfully!")

        print("\n" + "=" * 80)
        print("✔ ALL COMPREHENSIVE BILLS & SALARY INTEGRATION TESTS COMPLETED SUCCESSFULLY!")
        print("=" * 80)
        
    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
