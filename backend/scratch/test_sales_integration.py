import sys
import os
from datetime import date, datetime

# Add backend root to path
sys.path.insert(0, "/Users/nagaraju/Documents/BKNR_ERP/backend")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.services.posting_engine import PostingEngineService
from app.services.accounting_reports import AccountingReportsService

def run_sales_integration_tests():
    print("=========================================================================")
    print("▶ STARTING SALES LEDGER INTEGRATION TESTS")
    print("=========================================================================")

    # 1. Setup in-memory sqlite engine
    engine = create_engine("sqlite:///:memory:", echo=False)
    Session = sessionmaker(bind=engine)
    db = Session()

    # Create required tables
    from app.database.models.enterprise_finance import (
        BranchMaster, FinancialYearMaster, CurrencyMaster, ExchangeRate,
        AccountGroup, LedgerMaster, CostCenter, BudgetMaster, VoucherType,
        VoucherHeader, VoucherDetail, BankReconciliation, FinanceAuditTrail
    )
    from app.database.models.inventory_management import pending_orders, sales_dispatch
    from app.database.models.criteria import packing_styles

    for model in [BranchMaster, FinancialYearMaster, CurrencyMaster, ExchangeRate,
                  AccountGroup, LedgerMaster, CostCenter, BudgetMaster, VoucherType,
                  VoucherHeader, VoucherDetail, BankReconciliation, FinanceAuditTrail,
                  pending_orders, sales_dispatch, packing_styles]:
        model.__table__.create(bind=engine)
    
    print("✔ SQLite Database tables successfully created in memory.")

    company_id = "VNBK2162"

    # Seed baseline group structure
    PostingEngineService.get_or_create_group(db, company_id, "Assets", "ASSET")
    PostingEngineService.get_or_create_group(db, company_id, "Liabilities", "LIABILITY")
    PostingEngineService.get_or_create_group(db, company_id, "Income", "INCOME")
    PostingEngineService.get_or_create_group(db, company_id, "Expenses", "EXPENSE")
    PostingEngineService.get_or_create_group(db, company_id, "Current Assets", "ASSET", "Assets")
    PostingEngineService.get_or_create_group(db, company_id, "Sales Accounts", "INCOME", "Income")
    PostingEngineService.get_or_create_group(db, company_id, "Sundry Debtors", "ASSET", "Current Assets")

    # Seed packing style and pending order
    style = packing_styles(packing_style="10x1KG", mc_weight=10.0, company_id=company_id)
    db.add(style)
    db.flush()

    po_item = pending_orders(
        company_name="BKNR SOLUTIONS",
        production_at="VIZAG",
        po_number="PO-1001",
        buyer="Global Seafoods US",
        agent_name="Agent Alpha",
        brand="BKNR Brand",
        country="USA",
        packing_style="10x1KG",
        freezer="IQF",
        count_glaze="30/40",
        weight_glaze="10%",
        variety="Vannamei HLSO",
        grade="31/40",
        no_of_mc=150,
        selling_price=8.50, # USD per KG
        exchange_rate=84.20,
        shipment_date=date.today(),
        progress_steps="pending",
        email="test@bknr.com",
        company_id=company_id,
        date=date.today(),
        sl_no=1,
        species="Vannamei"
    )
    db.add(po_item)
    db.commit()
    print("✔ Seeded pending order: PO-1001 (150 MC @ $8.50/KG, ex-rate: 84.20)")

    # 2. Test move_to_sales logic
    from fastapi import Request
    from starlette.requests import Request as StarletteRequest

    # Mock is_edit_locked helper
    import app.routers.inventory_management.pending_orders as po_router
    po_router.is_edit_locked = lambda req, dt: False

    print("\n[TEST 1] Moving PO to Sales Dispatch via route...")
    mock_request = StarletteRequest(scope={
        "type": "http",
        "session": {"company_code": company_id, "email": "test@bknr.com"}
    })

    po_router.move_to_sales(
        request=mock_request,
        po_number="PO-1001",
        invoice_no="INV-2026-001",
        invoice_date=date.today().strftime("%Y-%m-%d"),
        shipping_bill="SB-9988",
        container_no="CONT-1122",
        db=db
    )

    # Verify that sales_dispatch fields were populated
    sd = db.query(sales_dispatch).filter(sales_dispatch.invoice_no == "INV-2026-001").first()
    print(f"✔ Sales Dispatch created. Quantity (KG): {sd.sales_quantity}, USD Amount: ${sd.amount_usd:.2f}, INR Amount: ₹{sd.amount_inr:,.2f}")
    assert sd.sales_quantity == 1500.0, "Sales quantity should be 1500 KG (150 MC * 10 KG/MC)"
    assert sd.amount_usd == 12750.0, "USD amount should be $12,750 (1500 KG * $8.50/KG)"
    assert sd.amount_inr == 12750.0 * 84.20, "INR amount calculation incorrect"

    # Verify that a ledger voucher was created
    voucher = db.query(VoucherHeader).filter(VoucherHeader.reference_no == "INV-2026-001").first()
    print(f"✔ Ledger Voucher created: {voucher.voucher_no}, Status: {voucher.status}")
    assert voucher is not None, "Ledger voucher not created"
    assert voucher.status != "CANCELLED", "Voucher is cancelled"

    # Print Trial Balance to check balance matching
    tb = AccountingReportsService.get_trial_balance(db, company_id)
    print("\n-------------------------------------------------------------------------")
    print(f"{'GROUP / LEDGER NAME':<38} | {'DEBIT (DR)':<15} | {'CREDIT (CR)':<15}")
    print("-------------------------------------------------------------------------")
    for row in tb:
        if row["type"] == "LEDGER":
            name = row["name"]
            dr = f"₹{row['debit']:,.2f}" if row['debit'] > 0 else "-"
            cr = f"₹{row['credit']:,.2f}" if row['credit'] > 0 else "-"
            print(f"{name:<38} | {dr:<15} | {cr:<15}")
    print("-------------------------------------------------------------------------")

    # 3. Test update_exchange_rate logic
    print("\n[TEST 2] Updating Exchange Rate to 85.00...")
    import app.routers.inventory_management.sales as sales_router
    # Mock update_exchange_rate's is_edit_locked if any, and session dependencies
    
    # We call the update_exchange_rate route
    import asyncio
    async def run_update():
        mock_update_request = StarletteRequest(scope={
            "type": "http",
            "session": {"company_code": company_id, "email": "test@bknr.com"},
            "method": "POST"
        })
        # Set body
        async def mock_receive():
            return {
                "type": "http.request",
                "body": b'{"id": 1, "exchange_rate": 85.00}'
            }
        mock_update_request._receive = mock_receive
        return await sales_router.update_exchange_rate(request=mock_update_request, db=db)

    res = asyncio.run(run_update())
    print("✔ Update Exchange Rate response:", res)

    # Verify database fields updated
    sd_updated = db.query(sales_dispatch).filter(sales_dispatch.id == sd.id).first()
    print(f"✔ Sales Dispatch updated. Ex Rate: {sd_updated.exchange_rate}, INR Amount: ₹{sd_updated.amount_inr:,.2f}")
    assert sd_updated.exchange_rate == 85.00
    assert sd_updated.amount_inr == 12750.0 * 85.00

    # Verify that the old voucher is cancelled, and new voucher is active
    old_vh = db.query(VoucherHeader).filter(VoucherHeader.id == voucher.id).first()
    print(f"✔ Old Voucher ({old_vh.voucher_no}) status: {old_vh.status}")
    assert old_vh.status == "CANCELLED"

    new_vh = db.query(VoucherHeader).filter(
        VoucherHeader.reference_no == "INV-2026-001",
        VoucherHeader.status != "CANCELLED"
    ).first()
    print(f"✔ New active Ledger Voucher: {new_vh.voucher_no}, Status: {new_vh.status}")
    assert new_vh is not None
    assert new_vh.id != old_vh.id

    # Print Trial Balance to check balance matching after update
    tb_updated = AccountingReportsService.get_trial_balance(db, company_id)
    print("\n-------------------------------------------------------------------------")
    print(f"{'GROUP / LEDGER NAME (UPDATED)':<38} | {'DEBIT (DR)':<15} | {'CREDIT (CR)':<15}")
    print("-------------------------------------------------------------------------")
    for row in tb_updated:
        if row["type"] == "LEDGER":
            name = row["name"]
            dr = f"₹{row['debit']:,.2f}" if row['debit'] > 0 else "-"
            cr = f"₹{row['credit']:,.2f}" if row['credit'] > 0 else "-"
            print(f"{name:<38} | {dr:<15} | {cr:<15}")
    print("-------------------------------------------------------------------------")

    print("\n=========================================================================")
    print("▶ ALL INTEGRATION TESTS COMPLETED SUCCESSFULLY!")
    print("=========================================================================")

if __name__ == "__main__":
    run_sales_integration_tests()
