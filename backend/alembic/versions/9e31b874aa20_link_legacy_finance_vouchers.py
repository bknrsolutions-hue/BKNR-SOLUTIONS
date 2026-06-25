"""Link legacy finance forms to enterprise vouchers.

Revision ID: 9e31b874aa20
Revises: c931ff9a5bfc
"""

from alembic import op
import sqlalchemy as sa


revision = "9e31b874aa20"
down_revision = "c931ff9a5bfc"
branch_labels = None
depends_on = None


LINKED_TABLES = (
    "customer_receivables",
    "bank_transactions",
    "expense_vouchers",
    "journal_entries",
    "payment_receipts",
)

DOCUMENT_KEYS = (
    ("customer_receivables", "invoice_no"),
    ("vendor_payments", "bill_no"),
    ("bank_transactions", "reference_no"),
    ("expense_vouchers", "voucher_no"),
    ("payment_receipts", "receipt_no"),
)


def upgrade():
    for table_name in LINKED_TABLES:
        op.add_column(table_name, sa.Column("journal_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            f"fk_{table_name}_journal_id",
            table_name,
            "voucher_headers",
            ["journal_id"],
            ["id"],
        )
        op.create_index(f"ix_{table_name}_journal_id", table_name, ["journal_id"])

    for table_name, column_name in DOCUMENT_KEYS:
        op.drop_constraint(f"{table_name}_{column_name}_key", table_name, type_="unique")
        op.create_unique_constraint(
            f"uq_{table_name}_company_{column_name}",
            table_name,
            ["company_id", column_name],
        )


def downgrade():
    for table_name, column_name in reversed(DOCUMENT_KEYS):
        op.drop_constraint(f"uq_{table_name}_company_{column_name}", table_name, type_="unique")
        op.create_unique_constraint(f"{table_name}_{column_name}_key", table_name, [column_name])

    for table_name in reversed(LINKED_TABLES):
        op.drop_index(f"ix_{table_name}_journal_id", table_name=table_name)
        op.drop_constraint(f"fk_{table_name}_journal_id", table_name, type_="foreignkey")
        op.drop_column(table_name, "journal_id")
