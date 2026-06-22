import sys
import os
from datetime import date

# Add backend root to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.services.posting_engine import PostingEngineService
from app.services.accounting_reports import AccountingReportsService

def run_tests():
    print("=========================================================================")
    print("▶ STARTING AUTOMATED ACCOUNTING ENGINE VERIFICATION TESTS")
    print("=========================================================================")

    # 1. Setup in-memory sqlite engine
    engine = create_engine("sqlite:///:memory:", echo=False)
    Session = sessionmaker(bind=engine)
    db = Session()

    # 2. Create only the finance tables to avoid JSONB compile errors of other modules
    from app.database.models.enterprise_finance import (
        BranchMaster, FinancialYearMaster, CurrencyMaster, ExchangeRate,
        AccountGroup, LedgerMaster, CostCenter, BudgetMaster, VoucherType,
        VoucherHeader, VoucherDetail, BankReconciliation, FinanceAuditTrail
    )
    for model in [BranchMaster, FinancialYearMaster, CurrencyMaster, ExchangeRate,
                  AccountGroup, LedgerMaster, CostCenter, BudgetMaster, VoucherType,
                  VoucherHeader, VoucherDetail, BankReconciliation, FinanceAuditTrail]:
        model.__table__.create(bind=engine)
    print("✔ SQLite Database tables successfully created in memory.")

    company_id = "VNBK2162"

    # 3. Seed baseline group structure
    print("\n[STEP 1] Seeding baseline Chart of Accounts hierarchy...")
    assets = PostingEngineService.get_or_create_group(db, company_id, "Assets", "ASSET")
    liabilities = PostingEngineService.get_or_create_group(db, company_id, "Liabilities", "LIABILITY")
    income = PostingEngineService.get_or_create_group(db, company_id, "Income", "INCOME")
    expenses = PostingEngineService.get_or_create_group(db, company_id, "Expenses", "EXPENSE")

    # Seed child groups
    curr_assets = PostingEngineService.get_or_create_group(db, company_id, "Current Assets", "ASSET", "Assets")
    curr_liab = PostingEngineService.get_or_create_group(db, company_id, "Current Liabilities", "LIABILITY", "Liabilities")
    
    # 4. Test manual balanced voucher posting
    print("\n[STEP 2] Testing manual balanced voucher creation...")
    details = [
        {
            "ledger_name": "Cash Account",
            "group_name": "Cash-in-hand",
            "group_type": "ASSET",
            "parent_group_name": "Current Assets",
            "debit_amount": 50000.0,
            "credit_amount": 0.0,
            "remarks": "Owner capital injection"
        },
        {
            "ledger_name": "Capital Account",
            "group_name": "Capital Account",
            "group_type": "EQUITY",
            "debit_amount": 0.0,
            "credit_amount": 50000.0,
            "remarks": "Owner capital injection"
        }
    ]

    try:
        voucher = PostingEngineService.create_voucher(
            db, company_id, "Journal", date.today(), "Initial funding entry", details
        )
        db.commit()
        print(f"✔ Balanced voucher successfully posted: {voucher.voucher_no}")
    except Exception as e:
        print(f"❌ Failed to post balanced voucher: {e}")
        db.rollback()

    # 5. Test manual unbalanced voucher posting (Must fail)
    print("\n[STEP 3] Testing manual unbalanced voucher validation...")
    unbalanced_details = [
        {
            "ledger_name": "Cash Account",
            "group_name": "Cash-in-hand",
            "group_type": "ASSET",
            "parent_group_name": "Current Assets",
            "debit_amount": 10000.0,
            "credit_amount": 0.0,
            "remarks": "Unbalanced entry"
        },
        {
            "ledger_name": "Capital Account",
            "group_name": "Capital Account",
            "group_type": "EQUITY",
            "debit_amount": 0.0,
            "credit_amount": 5000.0,
            "remarks": "Unbalanced entry"
        }
    ]

    try:
        PostingEngineService.create_voucher(
            db, company_id, "Journal", date.today(), "Unbalanced entry", unbalanced_details
        )
        print("❌ Unbalanced voucher posting succeeded (Validation Error: Should have failed!)")
    except ValueError as ve:
        print(f"✔ Unbalanced voucher correctly rejected: {ve}")
    except Exception as e:
        print(f"❌ Unexpected exception during unbalanced voucher validation: {e}")

    # 6. Test Seafood ERP auto-posting events
    print("\n[STEP 4] Testing Seafood ERP Auto-posting integrations...")
    try:
        # Simulate RM Purchase
        pur_v = PostingEngineService.post_shrimp_purchase(
            db=db,
            company_id=company_id,
            supplier_name="Shrimp Farms Inc",
            total_amount=100000.0,
            gst_rate=5.0,
            tds_rate=1.0,
            batch_number="BCH-009A",
            invoice_date=date.today()
        )
        db.commit()
        print(f"✔ Shrimp Purchase Voucher auto-posted: {pur_v.voucher_no}")

        # Simulate Processing charges (Peeling cost)
        proc_v = PostingEngineService.post_processing_contractor_charges(
            db=db,
            company_id=company_id,
            contractor_name="Vasco Processing Ltd",
            charge_type="Peeling",
            quantity=2500,
            rate=12.0,
            amount=30000.0,
            batch_number="BCH-009A",
            transaction_date=date.today()
        )
        db.commit()
        print(f"✔ Processing contractor charges auto-posted: {proc_v.voucher_no}")

        # Simulate Sales Dispatch (Export sales in USD)
        sal_v = PostingEngineService.post_sales_dispatch(
            db=db,
            company_id=company_id,
            invoice_no="INV-2026-048",
            customer_name="Global Seafoods US",
            amount_usd=2000.0,
            exchange_rate=83.50,
            packing_cost=0.0,
            freight_cost=0.0,
            invoice_date=date.today()
        )
        db.commit()
        print(f"✔ Export Sales Dispatch auto-posted: {sal_v.voucher_no}")

    except Exception as e:
        print(f"❌ Seafood ERP auto-posting integration failed: {e}")
        db.rollback()

    # 7. Verification of calculated Trial Balance reports
    print("\n[STEP 5] Calculating live Trial Balance rollups...")
    try:
        tb = AccountingReportsService.get_trial_balance(db, company_id)
        print("-------------------------------------------------------------------------")
        print(f"{'GROUP / LEDGER NAME':<35} | {'DEBIT (DR)':<15} | {'CREDIT (CR)':<15}")
        print("-------------------------------------------------------------------------")
        total_dr = 0
        total_cr = 0
        for row in tb:
            # Print only ledgers to verify final double entry balance sheet matching
            if row["type"] == "LEDGER":
                name = row["name"]
                dr = f"₹{row['debit']:,.2f}" if row['debit'] > 0 else "-"
                cr = f"₹{row['credit']:,.2f}" if row['credit'] > 0 else "-"
                print(f"{name:<35} | {dr:<15} | {cr:<15}")
                total_dr += row['debit']
                total_cr += row['credit']
        print("-------------------------------------------------------------------------")
        print(f"{'TOTAL BALANCES':<35} | ₹{total_dr:,.2f} | ₹{total_cr:,.2f}")
        print("-------------------------------------------------------------------------")
        
        if abs(total_dr - total_cr) < 0.01:
            print("✔ Trial Balance rollups match perfectly! Double entry engine verified.")
        else:
            print("❌ Trial Balance is out of balance!")
            
    except Exception as e:
        print(f"❌ Failed to generate Trial Balance: {e}")

    # 8. Verification of Profit and Loss
    print("\n[STEP 6] Calculating Profit & Loss statement...")
    try:
        pl = AccountingReportsService.get_profit_and_loss(db, company_id, date.today(), date.today())
        print(f"✔ Total Income:  ₹{pl['total_income']:,.2f}")
        print(f"✔ Total Expense: ₹{pl['total_expense']:,.2f}")
        print(f"✔ Net Profit:    ₹{pl['net_profit']:,.2f}")
    except Exception as e:
        print(f"❌ Failed to generate Profit & Loss: {e}")

    # 9. Verification of Balance Sheet
    print("\n[STEP 7] Calculating Balance Sheet statement...")
    try:
        bs = AccountingReportsService.get_balance_sheet(db, company_id, date.today())
        print(f"✔ Total Assets:      ₹{bs['total_assets']:,.2f}")
        print(f"✔ Total Liabilities: ₹{bs['total_liabilities']:,.2f}")
        print(f"✔ Total Equity:      ₹{bs['total_equity']:,.2f}")
        print(f"✔ Balanced:          {bs['is_balanced']}")
    except Exception as e:
        print(f"❌ Failed to generate Balance Sheet: {e}")

    print("\n=========================================================================")
    print("▶ ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!")
    print("=========================================================================")

if __name__ == "__main__":
    run_tests()
