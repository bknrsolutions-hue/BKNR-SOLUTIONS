"""Link legacy finance forms to enterprise vouchers.

Revision ID: 9e31b874aa20
Revises: c931ff9a5bfc
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


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


def has_column(inspector, table_name, column_name):
    return column_name in [c["name"] for c in inspector.get_columns(table_name)]


def has_index(inspector, table_name, index_name):
    return index_name in [i["name"] for i in inspector.get_indexes(table_name)]


def has_fk(inspector, table_name, fk_name):
    return fk_name in [f["name"] for f in inspector.get_foreign_keys(table_name)]


def has_unique(inspector, table_name, constraint_name):
    return constraint_name in [
        u["name"] for u in inspector.get_unique_constraints(table_name)
    ]


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    # ------------------------------------------------------------------
    # Add journal_id + FK + Index
    # ------------------------------------------------------------------
    for table_name in LINKED_TABLES:

        if not has_column(inspector, table_name, "journal_id"):
            op.add_column(
                table_name,
                sa.Column("journal_id", sa.Integer(), nullable=True),
            )

        # Refresh metadata after add_column
        inspector = inspect(bind)

        fk_name = f"fk_{table_name}_journal_id"

        if not has_fk(inspector, table_name, fk_name):
            op.create_foreign_key(
                fk_name,
                table_name,
                "voucher_headers",
                ["journal_id"],
                ["id"],
            )

        idx_name = f"ix_{table_name}_journal_id"

        if not has_index(inspector, table_name, idx_name):
            op.create_index(
                idx_name,
                table_name,
                ["journal_id"],
            )

    # ------------------------------------------------------------------
    # Company-wise unique constraints
    # ------------------------------------------------------------------
    inspector = inspect(bind)

    for table_name, column_name in DOCUMENT_KEYS:

        old_name = f"{table_name}_{column_name}_key"
        new_name = f"uq_{table_name}_company_{column_name}"

        if has_unique(inspector, table_name, old_name):
            op.drop_constraint(old_name, table_name, type_="unique")

        inspector = inspect(bind)

        if not has_unique(inspector, table_name, new_name):
            op.create_unique_constraint(
                new_name,
                table_name,
                ["company_id", column_name],
            )


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    for table_name, column_name in reversed(DOCUMENT_KEYS):

        new_name = f"uq_{table_name}_company_{column_name}"
        old_name = f"{table_name}_{column_name}_key"

        if has_unique(inspector, table_name, new_name):
            op.drop_constraint(new_name, table_name, type_="unique")

        inspector = inspect(bind)

        if not has_unique(inspector, table_name, old_name):
            op.create_unique_constraint(
                old_name,
                table_name,
                [column_name],
            )

    inspector = inspect(bind)

    for table_name in reversed(LINKED_TABLES):

        idx_name = f"ix_{table_name}_journal_id"

        if has_index(inspector, table_name, idx_name):
            op.drop_index(idx_name, table_name=table_name)

        inspector = inspect(bind)

        fk_name = f"fk_{table_name}_journal_id"

        if has_fk(inspector, table_name, fk_name):
            op.drop_constraint(
                fk_name,
                table_name,
                type_="foreignkey",
            )

        inspector = inspect(bind)

        if has_column(inspector, table_name, "journal_id"):
            op.drop_column(table_name, "journal_id")