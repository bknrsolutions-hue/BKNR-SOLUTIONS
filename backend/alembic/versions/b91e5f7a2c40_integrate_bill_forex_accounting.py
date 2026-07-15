"""Integrate bill allocation and period-end forex accounting.

Revision ID: b91e5f7a2c40
Revises: a6c4e2f918b7
"""

from alembic import op
import sqlalchemy as sa


revision = "b91e5f7a2c40"
down_revision = "a6c4e2f918b7"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if "commercial_invoices" in tables:
        invoice_columns = {column["name"] for column in sa.inspect(bind).get_columns("commercial_invoices")}
        if "cogs_journal_id" not in invoice_columns:
            op.add_column("commercial_invoices", sa.Column("cogs_journal_id", sa.Integer(), nullable=True))
    if "bill_allocations" not in tables:
        op.create_table(
            "bill_allocations",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.String(length=50), nullable=False),
            sa.Column("payment_receipt_id", sa.Integer(), sa.ForeignKey("payment_receipts.id"), nullable=False),
            sa.Column("source_type", sa.String(length=20), nullable=False),
            sa.Column("source_id", sa.Integer(), nullable=False),
            sa.Column("document_no", sa.String(length=100), nullable=False),
            sa.Column("allocated_amount", sa.Numeric(18, 2), nullable=False),
            sa.Column("created_by", sa.String(length=100), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("is_reversed", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("reversed_at", sa.DateTime(), nullable=True),
            sa.CheckConstraint("allocated_amount > 0", name="ck_bill_allocation_positive"),
            sa.UniqueConstraint("company_id", "payment_receipt_id", "source_type", "source_id", name="uix_bill_allocation_source"),
        )
        op.create_index("ix_bill_allocations_company_id", "bill_allocations", ["company_id"])
        op.create_index("ix_bill_allocations_payment_receipt_id", "bill_allocations", ["payment_receipt_id"])
        op.create_index("ix_bill_allocations_source_id", "bill_allocations", ["source_id"])
        op.create_index("ix_bill_allocations_document_no", "bill_allocations", ["document_no"])

    tables = set(sa.inspect(bind).get_table_names())
    if "forex_revaluations" not in tables:
        op.create_table(
            "forex_revaluations",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.String(length=50), nullable=False),
            sa.Column("receivable_id", sa.Integer(), sa.ForeignKey("customer_receivables.id"), nullable=False),
            sa.Column("as_of_date", sa.Date(), nullable=False),
            sa.Column("currency_code", sa.String(length=5), nullable=False),
            sa.Column("foreign_balance", sa.Numeric(18, 4), nullable=False),
            sa.Column("booking_rate", sa.Numeric(18, 6), nullable=False),
            sa.Column("closing_rate", sa.Numeric(18, 6), nullable=False),
            sa.Column("gain_loss_amount", sa.Numeric(18, 2), nullable=False),
            sa.Column("journal_id", sa.Integer(), sa.ForeignKey("voucher_headers.id"), nullable=False),
            sa.Column("created_by", sa.String(length=100), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=True),
            sa.Column("is_reversed", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.UniqueConstraint("company_id", "receivable_id", "as_of_date", name="uix_forex_revaluation_period"),
        )
        op.create_index("ix_forex_revaluations_company_id", "forex_revaluations", ["company_id"])
        op.create_index("ix_forex_revaluations_receivable_id", "forex_revaluations", ["receivable_id"])
        op.create_index("ix_forex_revaluations_as_of_date", "forex_revaluations", ["as_of_date"])


def downgrade():
    op.drop_table("forex_revaluations")
    op.drop_table("bill_allocations")
    op.drop_column("commercial_invoices", "cogs_journal_id")
