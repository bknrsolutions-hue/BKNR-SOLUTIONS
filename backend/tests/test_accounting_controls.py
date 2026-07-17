import os
import json
import unittest
from datetime import date
from types import SimpleNamespace


os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost/test")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from starlette.requests import Request

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
)
from app.services.posting_engine import PostingEngineService
from app.services.accounting_reports import AccountingReportsService
from app.services.pdf_renderer import render_pdf_from_html
from app.routers.enterprise_finance_router import (
    extract_bank_statement_pdf,
    rollback_last_bank_pdf_import,
    _statement_text,
)


class AccountingControlTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        for model in (
            BranchMaster,
            FinancialYearMaster,
            CurrencyMaster,
            ExchangeRate,
            AccountGroup,
            LedgerMaster,
            CostCenter,
            VoucherType,
            VoucherHeader,
            VoucherDetail,
            BankReconciliation,
            FinanceAuditTrail,
        ):
            model.__table__.create(self.engine)
        self.db = sessionmaker(bind=self.engine)()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    @staticmethod
    def lines(**overrides):
        debit = {
            "ledger_name": "Cash A/c",
            "group_name": "Cash-in-hand",
            "group_type": "ASSET",
            "debit_amount": 100,
            "credit_amount": 0,
        }
        debit.update(overrides)
        return [
            debit,
            {
                "ledger_name": "Capital A/c",
                "group_name": "Capital Account",
                "group_type": "EQUITY",
                "debit_amount": 0,
                "credit_amount": 100,
            },
        ]

    def test_valid_balanced_voucher_posts_with_decimal_amounts(self):
        voucher = PostingEngineService.create_voucher(
            self.db, "C1", "Journal", date(2026, 7, 11), "Test", self.lines()
        )
        self.db.commit()
        self.assertEqual(voucher.status, "POSTED")
        self.assertEqual(sum(line.debit_amount for line in voucher.details), 100)
        self.assertEqual(sum(line.credit_amount for line in voucher.details), 100)

    def test_posted_voucher_cancellation_creates_idempotent_contra(self):
        source = PostingEngineService.create_voucher(
            self.db, "C1", "Journal", date(2026, 7, 11), "Source", self.lines()
        )
        reversal = PostingEngineService.reverse_voucher(
            self.db, "C1", source.id, "Source cancelled", "admin@example.com", date(2026, 7, 12)
        )
        repeated = PostingEngineService.reverse_voucher(
            self.db, "C1", source.id, "Source cancelled again", "admin@example.com", date(2026, 7, 12)
        )
        self.db.commit()
        self.assertEqual(source.status, "POSTED")
        self.assertEqual(reversal.id, repeated.id)
        self.assertEqual(len(self.db.query(VoucherHeader).all()), 2)
        net_debit = sum(float(line.debit_amount) - float(line.credit_amount) for voucher in self.db.query(VoucherHeader).all() for line in voucher.details)
        self.assertEqual(net_debit, 0)

    def test_invalid_lines_are_rejected(self):
        invalid_cases = (
            [],
            self.lines(debit_amount=-100),
            self.lines(debit_amount=100, credit_amount=100),
            self.lines(debit_amount=0, credit_amount=0),
            self.lines(debit_amount=float("nan")),
        )
        for lines in invalid_cases:
            with self.subTest(lines=lines), self.assertRaises(ValueError):
                PostingEngineService.validate_details(lines)

    def test_locked_financial_year_rejects_posting(self):
        self.db.add(
            FinancialYearMaster(
                company_id="C1",
                year_name="FY-2026-27",
                start_date=date(2026, 4, 1),
                end_date=date(2027, 3, 31),
                is_locked=True,
            )
        )
        self.db.flush()
        with self.assertRaisesRegex(ValueError, "is locked"):
            PostingEngineService.create_voucher(
                self.db, "C1", "Journal", date(2026, 7, 11), "Locked", self.lines()
            )

    def test_cross_company_cost_center_is_rejected(self):
        center = CostCenter(
            company_id="C2", cost_center_code="ADMIN", cost_center_name="Admin", is_active=True
        )
        self.db.add(center)
        self.db.flush()
        with self.assertRaisesRegex(ValueError, "cost centers are invalid"):
            PostingEngineService.create_voucher(
                self.db,
                "C1",
                "Journal",
                date(2026, 7, 11),
                "Wrong tenant",
                self.lines(cost_center_id=center.id),
            )

    def test_required_cost_center_is_enforced_by_posting_engine(self):
        ledger = PostingEngineService.get_or_create_ledger(
            self.db, "C1", "Cash A/c", "Cash-in-hand", "ASSET"
        )
        ledger.cost_center_required = True
        self.db.flush()
        with self.assertRaisesRegex(ValueError, "Cost center is required"):
            PostingEngineService.create_voucher(
                self.db, "C1", "Journal", date(2026, 7, 11), "Missing cost center", self.lines()
            )

    def test_salary_accrual_posts_on_payroll_month_end(self):
        salary = SimpleNamespace(
            employee_name="Test Employee",
            employee_id="EMP001",
            month_year="2026-02",
            gross_salary=1000.0,
            net_payable=1000.0,
            pf_employee=0.0,
            pf_employer=0.0,
            epf_employer=0.0,
            eps_employer=0.0,
            edli_employer=0.0,
            esi_employee=0.0,
            esi_employer=0.0,
            professional_tax=0.0,
            tds_salary=0.0,
            advance_deduction=0.0,
            lwf_employee=0.0,
            lwf_employer=0.0,
            other_deductions=0.0,
        )
        voucher = PostingEngineService.post_salary_approval(self.db, "C1", salary)
        self.assertEqual(voucher.voucher_date, date(2026, 2, 28))

    def test_text_bank_statement_pdf_extracts_debit_and_credit_rows(self):
        pdf = render_pdf_from_html("""
            <style>table{width:100%;table-layout:fixed}td,th{padding:8px}</style>
            <table>
              <tr><th>Date</th><th>Reference</th><th>Debit</th><th>Credit</th><th>Balance</th></tr>
              <tr><td>16-07-2026</td><td>NEFT ABCDE12345</td><td>1,250.00</td><td></td><td>8,750.00</td></tr>
              <tr><td>17-07-2026</td><td>RTGS XYZ987654</td><td></td><td>2,000.00</td><td>10,750.00</td></tr>
            </table>
        """)
        rows = extract_bank_statement_pdf(pdf).to_dict("records")
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["Debit"], 1250.0)
        self.assertEqual(rows[1]["Credit"], 2000.0)

    def test_bank_statement_pdf_supports_dr_cr_suffix_rows(self):
        pdf = render_pdf_from_html("""
            <p>Date Particulars Amount Balance</p>
            <p>16-07-2026 ATM WITHDRAWAL 1,250.00 DR 8,750.00 CR</p>
            <p>17-07-2026 CASH DEPOSIT 2,000.00 CR 10,750.00 CR</p>
        """)
        rows = extract_bank_statement_pdf(pdf).to_dict("records")
        self.assertEqual(rows[0]["Debit"], 1250.0)
        self.assertEqual(rows[1]["Credit"], 2000.0)

    def test_bank_statement_text_respects_database_limits(self):
        description = "LONG BANK DESCRIPTION " * 20
        self.assertEqual(len(_statement_text(description, 50)), 50)
        self.assertEqual(len(_statement_text(description, 255)), 255)

    def test_latest_pdf_import_can_be_rolled_back_as_one_batch(self):
        bank = PostingEngineService.get_or_create_ledger(
            self.db, "C1", "Test Bank A/c", "Bank Accounts", "ASSET"
        )
        rows = [
            BankReconciliation(
                company_id="C1",
                bank_ledger_id=bank.id,
                statement_date=date(2026, 7, 16),
                reference_no=f"REF-{index}",
                debit=100.0 if index == 1 else 0.0,
                credit=100.0 if index == 2 else 0.0,
            )
            for index in (1, 2)
        ]
        self.db.add_all(rows)
        self.db.flush()
        audit = FinanceAuditTrail(
            company_id="C1",
            table_name="bank_reconciliations",
            record_id=bank.id,
            action="IMPORT",
            new_value=json.dumps({
                "file": "statement.pdf",
                "imported": 2,
                "skipped": 0,
                "row_ids": [row.id for row in rows],
            }),
            user_email="admin@example.com",
        )
        self.db.add(audit)
        self.db.commit()
        request = Request({
            "type": "http",
            "session": {"company_code": "C1", "email": "admin@example.com", "role": "admin"},
        })
        result = rollback_last_bank_pdf_import(request, bank.id, self.db)
        self.assertEqual(result["deleted"], 2)
        self.assertEqual(self.db.query(BankReconciliation).count(), 0)

    def test_control_audit_passes_for_balanced_posted_voucher(self):
        PostingEngineService.create_voucher(
            self.db, "C1", "Journal", date(2026, 7, 11), "Audit", self.lines()
        )
        self.db.commit()
        audit = AccountingReportsService.get_control_audit(self.db, "C1")
        self.assertEqual(audit["status"], "PASS")
        self.assertEqual(audit["posted_vouchers_checked"], 1)
        self.assertEqual(audit["unbalanced_vouchers"], [])

    def test_voucher_register_exposes_balance_control_totals(self):
        PostingEngineService.create_voucher(
            self.db, "C1", "Journal", date(2026, 7, 11), "Register", self.lines()
        )
        self.db.commit()
        rows = AccountingReportsService.get_voucher_register(
            self.db, "C1", date(2026, 7, 1), date(2026, 7, 31)
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["total_debit"], rows[0]["total_credit"])


if __name__ == "__main__":
    unittest.main()
