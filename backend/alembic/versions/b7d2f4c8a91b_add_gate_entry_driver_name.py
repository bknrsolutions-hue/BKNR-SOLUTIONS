\"""Add gate entry driver name."""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision = "b7d2f4c8a91b"
down_revision = "a82c74e19f31"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    columns = [c["name"] for c in inspector.get_columns("gate_entry")]

    if "driver_name" not in columns:
        op.add_column(
            "gate_entry",
            sa.Column("driver_name", sa.String(length=255), nullable=True),
        )


def downgrade():
    bind = op.get_bind()
    inspector = inspect(bind)

    columns = [c["name"] for c in inspector.get_columns("gate_entry")]

    if "driver_name" in columns:
        op.drop_column("gate_entry", "driver_name")