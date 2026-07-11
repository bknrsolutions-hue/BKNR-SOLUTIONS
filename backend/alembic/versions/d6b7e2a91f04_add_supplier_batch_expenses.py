"""Add supplier batch expenses.

Revision ID: d6b7e2a91f04
Revises: cb42d7893daa
"""

from alembic import op
import sqlalchemy as sa


revision = "d6b7e2a91f04"
down_revision = "cb42d7893daa"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "supplier_batch_expenses",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("company_id", sa.String(), nullable=False, index=True),
        sa.Column("supplier_name", sa.String(), nullable=False, index=True),
        sa.Column("batch_number", sa.String(), nullable=False, index=True),
        sa.Column("transportation", sa.Float(), nullable=True, server_default="0"),
        sa.Column("commission", sa.Float(), nullable=True, server_default="0"),
        sa.Column("ice", sa.Float(), nullable=True, server_default="0"),
        sa.Column("others", sa.Float(), nullable=True, server_default="0"),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(), nullable=True),
        sa.Column("updated_by", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("is_cancelled", sa.Boolean(), nullable=True, server_default=sa.text("false")),
        sa.UniqueConstraint("company_id", "supplier_name", "batch_number", name="uq_supplier_batch_expense"),
    )


def downgrade():
    op.drop_table("supplier_batch_expenses")
