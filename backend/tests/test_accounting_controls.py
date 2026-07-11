import os
import unittest
from datetime import date


os.environ.setdefault("DATABASE_URL", "postgresql://user:pass@localhost/test")

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database.models.enterprise_finance import (
    AccountGroup,
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


if __name__ == "__main__":
    unittest.main()
