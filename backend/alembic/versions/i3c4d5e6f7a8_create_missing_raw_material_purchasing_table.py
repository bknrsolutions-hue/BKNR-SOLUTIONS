"""Create the raw-material-purchasing register when absent.

Revision ID: i3c4d5e6f7a8
Revises: h2b3c4d5e6f7

Some legacy staging databases were stamped to a newer Alembic revision without
having the original, pre-Alembic RMP table. This idempotent repair restores the
complete mapped register, including its indexes, without touching an existing
table or its data.
"""

from alembic import op

from app.database.models.processing import RawMaterialPurchasing


revision = "i3c4d5e6f7a8"
down_revision = "h2b3c4d5e6f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    RawMaterialPurchasing.__table__.create(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    # This repair can create a table containing operational purchase records.
    # Downgrade must never remove those records.
    pass
