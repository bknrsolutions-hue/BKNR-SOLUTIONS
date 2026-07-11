"""Harden accounting voucher amounts and invariants.

Revision ID: e4a1c7d29b10
Revises: d6b7e2a91f04
"""

from alembic import op
import sqlalchemy as sa


revision = "e4a1c7d29b10"
down_revision = "d6b7e2a91f04"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        "voucher_details",
        "debit_amount",
        existing_type=sa.Float(),
        type_=sa.Numeric(18, 2),
        existing_nullable=True,
        nullable=False,
        postgresql_using="ROUND(COALESCE(debit_amount, 0)::numeric, 2)",
    )
    op.alter_column(
        "voucher_details",
        "credit_amount",
        existing_type=sa.Float(),
        type_=sa.Numeric(18, 2),
        existing_nullable=True,
        nullable=False,
        postgresql_using="ROUND(COALESCE(credit_amount, 0)::numeric, 2)",
    )
    op.create_check_constraint(
        "ck_voucher_header_status",
        "voucher_headers",
        "status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED','POSTED','CANCELLED')",
    )
    op.create_check_constraint(
        "ck_voucher_detail_debit_nonnegative", "voucher_details", "debit_amount >= 0"
    )
    op.create_check_constraint(
        "ck_voucher_detail_credit_nonnegative", "voucher_details", "credit_amount >= 0"
    )
    op.create_check_constraint(
        "ck_voucher_detail_one_sided",
        "voucher_details",
        "(debit_amount > 0 AND credit_amount = 0) OR "
        "(credit_amount > 0 AND debit_amount = 0)",
    )


def downgrade():
    op.drop_constraint("ck_voucher_detail_one_sided", "voucher_details", type_="check")
    op.drop_constraint("ck_voucher_detail_credit_nonnegative", "voucher_details", type_="check")
    op.drop_constraint("ck_voucher_detail_debit_nonnegative", "voucher_details", type_="check")
    op.drop_constraint("ck_voucher_header_status", "voucher_headers", type_="check")
    op.alter_column(
        "voucher_details", "credit_amount", existing_type=sa.Numeric(18, 2), type_=sa.Float()
    )
    op.alter_column(
        "voucher_details", "debit_amount", existing_type=sa.Numeric(18, 2), type_=sa.Float()
    )
