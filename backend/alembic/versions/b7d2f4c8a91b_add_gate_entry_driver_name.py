"""Add gate entry driver name.

Revision ID: b7d2f4c8a91b
Revises: a82c74e19f31
"""

from alembic import op
import sqlalchemy as sa


revision = "b7d2f4c8a91b"
down_revision = "a82c74e19f31"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("gate_entry", sa.Column("driver_name", sa.String(length=255), nullable=True))


def downgrade():
    op.drop_column("gate_entry", "driver_name")
