"""Add payroll salary adjustment.

Revision ID: a82c74e19f31
Revises: 9e31b874aa20
"""

from alembic import op
import sqlalchemy as sa


revision = "a82c74e19f31"
down_revision = "9e31b874aa20"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "salary_processing",
        sa.Column("salary_adjustment", sa.Float(), nullable=False, server_default="0"),
    )


def downgrade():
    op.drop_column("salary_processing", "salary_adjustment")
