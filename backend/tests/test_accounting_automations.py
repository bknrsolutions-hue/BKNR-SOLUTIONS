"""Unit tests for Accounting Automations (10 new flows).

Runs against SQLite in-memory so no external DB is needed.
Uses unittest.TestCase style — identical to test_accounting_controls.py.
"""
import os
import unittest
from datetime import date

os.environ.setdefault("DATABASE_URL", "sqlite:///:memory:")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database.models.enterprise_finance import (
    AccountGroup,
    BankReconciliation,
    BranchMaster,
    CostCenter,
    CurrencyMaster,
    ExchangeRate,
    FinanceAuditTrail,
    FinancialYearMaster,
    LedgerMaster,
    VoucherDetail,
    VoucherHeader,
    VoucherType,
    ForexRevaluation,
    ProductionCostAllocation,
)
from app.database.models.assets import FixedAssetMaster, DepreciationSchedule
from app.database.models.gst_models import GSTRegister
from app.database.models.payments import PaymentReceipt
from app.services.posting_engine import PostingEngineService
from app.services.bill_accounting import amount_line
from app.services.accounting_automations import (
    generate_ob_journal,
    compute_gst_position,
    generate_gst_setoff_jv,
    generate_gst_payment_jv,
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
    compute_forex_difference,
)


MODELS = (
    BranchMaster, FinancialYearMaster, CurrencyMaster, ExchangeRate,
    AccountGroup, LedgerMaster, CostCenter, VoucherType, VoucherHeader, VoucherDetail,
    BankReconciliation, FinanceAuditTrail,
    ForexRevaluation, ProductionCostAllocation, GSTRegister,
    FixedAssetMaster, DepreciationSchedule, PaymentReceipt,
)


def totals(v):
    dr = sum(float(x.debit_amount or 0) for x in v.details)
    cr = sum(float(x.credit_amount or 0) for x in v.details)
    return round(dr, 2), round(cr, 2)


def seed_groups(db):
    def make(name, gtype, parent=None):
        return AccountGroup(group_name=name, group_type=gtype, company_id="C1", parent=parent)
    eq = make("Capital Account", "EQUITY")
    cur_assets = make("Current Assets", "ASSET")
    fix_assets = make("Fixed Assets", "ASSET")
    cur_liab = make("Current Liabilities", "LIABILITY")
    loans = make("Loans", "LIABILITY")
    sales = make("Sales Accounts", "INCOME")
    d_inc = make("Direct Incomes", "INCOME")
    i_inc = make("Indirect Incomes", "INCOME")
    purch = make("Purchase Accounts", "EXPENSE")
    d_exp = make("Direct Expenses", "EXPENSE")
    i_exp = make("Indirect Expenses", "EXPENSE")
    db.add_all([eq, cur_assets, fix_assets, cur_liab, loans, sales, d_inc, i_inc, purch, d_exp, i_exp])
    db.flush()
    subs = [
        ("Bank Accounts", "ASSET", cur_assets),
        ("Cash-in-hand", "ASSET", cur_assets),
        ("Sundry Debtors", "ASSET", cur_assets),
        ("Loans & Advances", "ASSET", cur_assets),
        ("Stock-in-hand", "ASSET", cur_assets),
        ("Sundry Creditors", "LIABILITY", cur_liab),
        ("Duties & Taxes", "LIABILITY", cur_liab),
        ("Provisions", "LIABILITY", cur_liab),
    ]
    for n, t, p in subs:
        db.add(make(n, t, p))
    db.flush()


VT_PREFIX = {
    "Receipt": "RCT", "Payment": "PAY", "Contra": "CON", "Journal": "JV",
    "Sales": "SAL", "Purchase": "PUR", "Debit Note": "DN", "Credit Note": "CN",
}


def seed_voucher_types(db):
    for vt, pf in VT_PREFIX.items():
        db.add(VoucherType(name=vt, company_id="C1", prefix=pf,
                           is_auto_number=True, next_number=1))
    db.flush()


def make_ledger(db, name, group_name, opening_dr=0.0, opening_cr=0.0):
    g = db.query(AccountGroup).filter(AccountGroup.group_name == group_name).one()
    ob_amt = max(opening_dr, opening_cr)
    ob_type = "DR" if opening_dr >= opening_cr else "CR"
    l = LedgerMaster(
        company_id="C1", ledger_name=name, group_id=g.id,
        opening_balance=ob_amt, opening_balance_type=ob_type, status="ACTIVE",
        created_by="TEST",
    )
    db.add(l)
    db.flush()
    return l


class TestAccountingAutomations(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        for m in MODELS:
            m.__table__.create(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        seed_groups(self.db)
        seed_voucher_types(self.db)
        self.bank = make_ledger(self.db, "SBI Bank A/c", "Bank Accounts", opening_dr=10_00_000.00)
        self.cash = make_ledger(self.db, "Cash Account", "Cash-in-hand", opening_dr=50_000.00)
        self.debtor = make_ledger(self.db, "Omega Exports - Customer A/c", "Sundry Debtors", opening_dr=5_00_000.00)
        self.creditor = make_ledger(self.db, "Delta Shrimps - Supplier A/c", "Sundry Creditors", opening_cr=3_00_000.00)
        self.capital = make_ledger(self.db, "Proprietor Capital A/c", "Capital Account", opening_cr=12_50_000.00)
        self.purchase = make_ledger(self.db, "Raw Shrimp Purchase A/c", "Purchase Accounts")
        self.sales = make_ledger(self.db, "Export Sales A/c", "Sales Accounts")
        self.input_gst = make_ledger(self.db, "Input GST A/c", "Duties & Taxes", opening_dr=20_000.00)
        self.output_gst = make_ledger(self.db, "Output GST A/c", "Duties & Taxes", opening_cr=60_000.00)
        self.net_gst_payable = make_ledger(self.db, "Net GST Payable A/c", "Duties & Taxes")
        self.itc_carry = make_ledger(self.db, "Input GST Carry Forward A/c", "Loans & Advances")
        self.tds_pay = make_ledger(self.db, "TDS Payable A/c", "Duties & Taxes", opening_cr=15_000.00)
        self.pf_pay = make_ledger(self.db, "Provident Fund (PF) Payable A/c", "Duties & Taxes", opening_cr=8_000.00)
        self.esi_pay = make_ledger(self.db, "Employee State Insurance (ESI) Payable A/c", "Duties & Taxes", opening_cr=3_000.00)
        self.pt_pay = make_ledger(self.db, "Professional Tax (PT) Payable A/c", "Duties & Taxes", opening_cr=2_000.00)
        self.edli_pay = make_ledger(self.db, "EDLI Contribution Payable A/c", "Duties & Taxes", opening_cr=500.00)
        self.bank_charges = make_ledger(self.db, "Bank Charges A/c", "Indirect Expenses")
        self.settlement_adj = make_ledger(self.db, "Settlement Adjustments A/c", "Indirect Expenses")
        self.dep_exp = make_ledger(self.db, "Depreciation Expense A/c", "Indirect Expenses")
        self.fixed_asset = make_ledger(self.db, "Fixed Assets A/c", "Fixed Assets", opening_dr=6_00_000.00)
        self.acc_dep = make_ledger(self.db, "Accumulated Depreciation A/c", "Fixed Assets", opening_cr=1_00_000.00)
        self.wip = make_ledger(self.db, "Work In Progress A/c", "Stock-in-hand")
        self.fg_inv = make_ledger(self.db, "Finished Goods Inventory A/c", "Stock-in-hand", opening_dr=2_00_000.00)
        self.cogs = make_ledger(self.db, "Cost of Goods Sold A/c", "Direct Expenses")
        self.labour = make_ledger(self.db, "Processing Labour Cost A/c", "Direct Expenses")
        self.power = make_ledger(self.db, "Production Power Cost A/c", "Direct Expenses")
        self.ice = make_ledger(self.db, "Production Ice Cost A/c", "Direct Expenses")
        self.chems = make_ledger(self.db, "Soaking Chemical Cost A/c", "Direct Expenses")
        self.other_prod = make_ledger(self.db, "Other Production Cost A/c", "Direct Expenses")
        self.forex_loss = make_ledger(self.db, "Unrealised Forex Loss A/c", "Indirect Expenses")
        self.forex_gain = make_ledger(self.db, "Unrealised Forex Gain A/c", "Indirect Incomes")
        self.grir = make_ledger(self.db, "GR/IR Clearing A/c", "Current Liabilities")
        self.suspense = make_ledger(self.db, "Suspense A/c (OB Difference)", "Current Liabilities")
        self.fy = FinancialYearMaster(
            company_id="C1", year_name="FY2026-27",
            start_date=date(2026, 4, 1), end_date=date(2027, 3, 31),
            is_locked=False,
        )
        self.db.add(self.fy)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    # ------------------------------------------------------------------ F1
    def test_f1_ob_jv_creates_balanced_voucher(self):
        voucher, summary = generate_ob_journal(self.db, "C1", date(2026, 4, 1), "TEST")
        self.db.commit()
        self.assertIsNotNone(voucher)
        self.assertEqual(summary["status"], "CREATED")
        dr, cr = totals(voucher)
        self.assertAlmostEqual(dr, cr, 2)
        self.assertGreater(summary["ledgers_count"], 5)
        voucher2, summary2 = generate_ob_journal(self.db, "C1", date(2026, 4, 1))
        self.assertIsNone(voucher2)
        self.assertEqual(summary2["status"], "SKIPPED")

    # ------------------------------------------------------------------ F2
    def test_f2_forex_difference_preview(self):
        details = [
            amount_line(self.debtor.ledger_name, "Sundry Debtors", "ASSET",
                        debit=835000.00, remarks="INV-101", parent_group_name="Current Assets"),
            amount_line(self.sales.ledger_name, "Sales Accounts", "INCOME",
                        credit=835000.00, remarks="INV-101"),
        ]
        PostingEngineService.create_voucher(
            self.db, "C1", "Sales", date(2026, 7, 1), "INV-101 booked",
            details, reference_no="INV-101", created_by="TEST",
        )
        self.db.commit()
        data = compute_forex_difference(self.db, "C1", self.debtor.id, "INV-101", 830000.00)
        self.assertTrue(data["found"])
        self.assertAlmostEqual(data["booked_inr"], 835000.00, 2)
        self.assertAlmostEqual(data["diff_inr"], 5000.00, 2)
        self.assertEqual(data["nature"], "LOSS")
        gain = compute_forex_difference(self.db, "C1", self.debtor.id, "INV-101", 840000.00)
        self.assertEqual(gain["nature"], "GAIN")
        self.assertAlmostEqual(gain["diff_inr"], -5000.00, 2)

    # ------------------------------------------------------------------ F3
    def test_f3_gst_setoff_and_payment(self):
        for _ in range(3):
            PostingEngineService.create_voucher(
                self.db, "C1", "Sales", date(2026, 5, 1), "Sale", [
                    amount_line(self.debtor.ledger_name, "Sundry Debtors", "ASSET", debit=130000),
                    amount_line(self.sales.ledger_name, "Sales Accounts", "INCOME", credit=100000),
                    amount_line(self.output_gst.ledger_name, "Duties & Taxes", "LIABILITY", credit=30000,
                                parent_group_name="Current Liabilities"),
                ], created_by="TEST",
            )
            PostingEngineService.create_voucher(
                self.db, "C1", "Purchase", date(2026, 5, 2), "Purchase", [
                    amount_line(self.creditor.ledger_name, "Sundry Creditors", "LIABILITY", credit=94400,
                                parent_group_name="Current Liabilities"),
                    amount_line(self.purchase.ledger_name, "Purchase Accounts", "EXPENSE", debit=80000),
                    amount_line(self.input_gst.ledger_name, "Duties & Taxes", "LIABILITY", debit=14400,
                                parent_group_name="Current Liabilities"),
                ], created_by="TEST",
            )
        self.db.commit()
        pos = compute_gst_position(self.db, "C1", date(2026, 5, 31))
        self.assertGreater(pos["net_gst_payable"], 0)
        v1, s = generate_gst_setoff_jv(self.db, "C1", date(2026, 5, 31), "TEST")
        dr, cr = totals(v1)
        self.assertAlmostEqual(dr, cr, 2)
        self.db.commit()
        v2, s2 = generate_gst_payment_jv(
            self.db, "C1", date(2026, 6, 5), pos["net_gst_payable"],
            self.bank.ledger_name, "Bank Accounts", "TEST", utr="GST12345",
        )
        dr, cr = totals(v2)
        self.assertAlmostEqual(dr, cr, 2)
        self.assertEqual(s2["utr"], "GST12345")

    # ------------------------------------------------------------------ F4
    def test_f4_statutory_payments_all_keys(self):
        # Statutory ledgers have opening balances — OB JV must post them first
        generate_ob_journal(self.db, "C1", date(2026, 4, 1), "TEST")
        self.db.commit()
        cases = [("TDS", 15000.0), ("PF", 8000.0), ("ESI", 3000.0),
                 ("PT", 2000.0), ("EDLI", 500.0)]
        for key, expected in cases:
            bal = compute_statutory_balance(self.db, "C1", date(2026, 5, 5), key)
            self.assertAlmostEqual(float(bal), expected, 2, msg=key)
            v, s = generate_statutory_payment_jv(
                self.db, "C1", date(2026, 5, 10), key, expected,
                self.bank.ledger_name, "Bank Accounts", "TEST", challan_no=f"{key}-123",
            )
            dr, cr = totals(v)
            self.assertAlmostEqual(dr, cr, 2, msg=key)
            self.assertAlmostEqual(s["amount_paid"], expected, 2)
            bal_after = compute_statutory_balance(self.db, "C1", date(2026, 5, 10), key)
            self.assertAlmostEqual(float(bal_after), 0.0, 2, msg=key)

    def test_f4_statutory_invalid_key_raises(self):
        with self.assertRaises(ValueError):
            compute_statutory_balance(self.db, "C1", date(2026, 5, 5), "INVALID")

    # ------------------------------------------------------------------ F5
    def test_f5_depreciation_auto_posting(self):
        a1 = FixedAssetMaster(
            company_id="C1", asset_code="FA-001", asset_name="Cold Storage 1",
            asset_category="PLANT_MACHINERY",
            purchase_date=date(2026, 1, 1),
            purchase_cost=1200000.00, salvage_value=0,
            depreciation_method="SLM", useful_life_years=10,
            dep_rate_percent=10.0,
            current_wdv=1200000.00,
            accumulated_depreciation=0.0,
            status="ACTIVE", is_cancelled=False,
            created_by="TEST",
        )
        a2 = FixedAssetMaster(
            company_id="C1", asset_code="FA-002", asset_name="Truck 1",
            asset_category="VEHICLE",
            purchase_date=date(2026, 3, 1),
            purchase_cost=600000.00, salvage_value=0,
            depreciation_method="WDV", dep_rate_percent=20.0,
            current_wdv=600000.00,
            accumulated_depreciation=0.0,
            status="ACTIVE", is_cancelled=False,
            created_by="TEST",
        )
        a1.asset_ledger_id = self.fixed_asset.id
        a1.acc_dep_ledger_id = self.acc_dep.id
        a1.dep_expense_ledger_id = self.dep_exp.id
        a2.asset_ledger_id = self.fixed_asset.id
        a2.acc_dep_ledger_id = self.acc_dep.id
        a2.dep_expense_ledger_id = self.dep_exp.id
        self.db.add_all([a1, a2])
        self.db.commit()

        pe = date(2026, 7, 31)
        plan = compute_monthly_depreciation(self.db, "C1", pe)
        self.assertEqual(len(plan), 2)
        v, s = generate_depreciation_jv(self.db, "C1", pe, "TEST")
        self.db.commit()
        dr, cr = totals(v)
        self.assertAlmostEqual(dr, cr, 2)
        self.assertGreater(s["total_depreciation"], 18000)
        v2, s2 = generate_depreciation_jv(self.db, "C1", pe, "TEST")
        self.assertIsNone(v2)
        self.assertEqual(s2["status"], "SKIPPED")

    # ------------------------------------------------------------------ F6
    def test_f6_wip_to_fg_tallies(self):
        raw = 500000.0; labour = 100000.0; power = 60000.0
        ice = 25000.0; chem = 15000.0; other = 10000.0
        produced = raw + labour + power + ice + chem + other
        v, s = build_production_transfer_jv(
            self.db, "C1", "BATCH-007", date(2026, 7, 25),
            raw, labour, power, ice, chem, other, produced, "TEST",
        )
        self.db.commit()
        dr, cr = totals(v)
        self.assertAlmostEqual(dr, cr, 2)
        self.assertAlmostEqual(s["produced_cost"], produced, 2)
        self.assertAlmostEqual(s["variance"], 0, 2)
        vx, sx = build_production_transfer_jv(
            self.db, "C1", "BATCH-008", date(2026, 7, 26),
            100000.0, 20000.0, 0, 0, 0, 0, 125000.0, "TEST",
        )
        dr, cr = totals(vx)
        self.assertAlmostEqual(dr, cr, 2)
        self.assertAlmostEqual(sx["variance"], -5000.00, 2)

    # ------------------------------------------------------------------ F7
    def test_f7_contra_tallies(self):
        v = generate_contra_voucher(
            self.db, "C1", date(2026, 7, 20),
            "SBI Bank A/c", "Cash Account", 75000.0,
            reference_no="CHQ-1001", remarks="Withdrew from SBI for office use",
            created_by="TEST",
        )
        self.db.commit()
        dr, cr = totals(v)
        self.assertAlmostEqual(dr, cr, 2)
        self.assertEqual(v.voucher_type.name, "Contra")
        with self.assertRaises(ValueError):
            generate_contra_voucher(self.db, "C1", date(2026, 7, 21),
                                    self.cash.ledger_name, self.bank.ledger_name, 0)

    # ------------------------------------------------------------------ F8
    def test_f8_debit_note(self):
        v, s = generate_debit_note(
            self.db, "C1", date(2026, 5, 12),
            self.creditor.ledger_name,
            self.purchase.ledger_name, "Purchase Accounts", "EXPENSE",
            25000.0, gst_amount=4500.0, reference_no="DN-2026-005",
            remarks="Shortage in supply", created_by="TEST",
        )
        self.db.commit()
        dr, cr = totals(v)
        self.assertAlmostEqual(dr, cr, 2)
        self.assertEqual(s["total"], 29500.0)
        self.assertEqual(v.voucher_type.name, "Debit Note")

    def test_f8_credit_note(self):
        v, s = generate_credit_note(
            self.db, "C1", date(2026, 6, 2),
            self.debtor.ledger_name,
            self.sales.ledger_name, "Sales Accounts", "INCOME",
            10000.0, gst_amount=1800.0, reference_no="CN-2026-002",
            remarks="Rate discount", created_by="TEST",
        )
        self.db.commit()
        dr, cr = totals(v)
        self.assertAlmostEqual(dr, cr, 2)
        self.assertEqual(s["total"], 11800.0)
        self.assertEqual(v.voucher_type.name, "Credit Note")

    # ------------------------------------------------------------------ F9
    def test_f9_closing_stock_uplift(self):
        v, s = generate_closing_stock_jv(
            self.db, "C1", date(2026, 7, 31),
            closing_stock_value=3_00_000.00, current_book_value=2_00_000.00,
            created_by="TEST",
        )
        self.db.commit()
        dr, cr = totals(v)
        self.assertAlmostEqual(dr, cr, 2)
        self.assertEqual(s["direction"], "UP")
        self.assertAlmostEqual(s["difference"], 1_00_000.00, 2)

    def test_f9_closing_stock_writedown(self):
        v, s = generate_closing_stock_jv(
            self.db, "C1", date(2026, 3, 31),
            closing_stock_value=1_50_000.00, current_book_value=2_00_000.00,
        )
        self.db.commit()
        dr, cr = totals(v)
        self.assertAlmostEqual(dr, cr, 2)
        self.assertEqual(s["direction"], "DOWN")
        self.assertAlmostEqual(s["difference"], -50_000.00, 2)

    def test_f9_closing_stock_no_diff_raises(self):
        with self.assertRaises(ValueError):
            generate_closing_stock_jv(self.db, "C1", date(2026, 3, 31),
                                      2_00_000.00, 2_00_000.00)

    # ------------------------------------------------------------------ F10
    def test_f10_grir_accrual_and_reversal(self):
        items = [
            {"ledger_name": "Raw Shrimp Purchase A/c",
             "group_name": "Purchase Accounts", "group_type": "EXPENSE",
             "amount": 150000.00, "batch": "GE-2026-07-001",
             "remarks": "Gate-entry from Delta Shrimps, bill pending"},
            {"ledger_name": "Raw Shrimp Purchase A/c",
             "group_name": "Purchase Accounts", "group_type": "EXPENSE",
             "amount": 95000.00, "batch": "GE-2026-07-002"},
        ]
        v, s = generate_grir_accrual_jv(
            self.db, "C1", date(2026, 7, 31), items, "TEST",
            reference_no="GRIR-2026-07",
        )
        self.db.commit()
        dr, cr = totals(v)
        self.assertAlmostEqual(dr, cr, 2)
        self.assertEqual(s["items_count"], 2)
        self.assertAlmostEqual(s["total_accrued"], 245000.00, 2)
        rv, rs = reverse_grir_accrual(self.db, "C1", date(2026, 8, 3), v.id, "TEST")
        self.db.commit()
        dr, cr = totals(rv)
        self.assertAlmostEqual(dr, cr, 2)
        self.assertTrue(rv.reference_no.startswith("REV-"))
        rv2, rs2 = reverse_grir_accrual(self.db, "C1", date(2026, 8, 5), v.id, "TEST")
        self.assertEqual(rs2["status"], "SKIPPED")

    def test_f10_grir_invalid_voucher_refused(self):
        v = PostingEngineService.create_voucher(
            self.db, "C1", "Journal", date(2026, 7, 15), "Random JV", [
                amount_line(self.cash.ledger_name, "Cash-in-hand", "ASSET", debit=100.0),
                amount_line(self.capital.ledger_name, "Capital Account", "EQUITY", credit=100.0),
            ], reference_no="RANDOM",
        )
        self.db.commit()
        with self.assertRaises(ValueError):
            reverse_grir_accrual(self.db, "C1", date(2026, 8, 1), v.id, "TEST")


if __name__ == "__main__":
    unittest.main()
