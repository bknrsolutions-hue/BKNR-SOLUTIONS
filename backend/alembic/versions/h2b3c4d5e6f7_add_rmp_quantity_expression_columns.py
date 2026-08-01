"""Add raw-material-purchasing quantity expression columns.

Revision ID: h2b3c4d5e6f7
Revises: g1a2b3c4d5e6

Older staging databases can have the RMP quantity columns without the
corresponding expression fields.  The migration is additive and idempotent so
it is safe for databases that were partially updated outside Alembic.
"""

from alembic import op
import sqlalchemy as sa


revision = "h2b3c4d5e6f7"
down_revision = "g1a2b3c4d5e6"
branch_labels = None
depends_on = None


RMP_EXPRESSION_COLUMNS = (
    sa.Column("g1_expr", sa.String(length=500), nullable=True),
    sa.Column("g2_expr", sa.String(length=500), nullable=True),
    sa.Column("dc_expr", sa.String(length=500), nullable=True),
)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "raw_material_purchasing" not in inspector.get_table_names():
        return

    existing_columns = {
        column["name"] for column in inspector.get_columns("raw_material_purchasing")
    }
    for column in RMP_EXPRESSION_COLUMNS:
        if column.name not in existing_columns:
            op.add_column("raw_material_purchasing", column)
            existing_columns.add(column.name)


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "raw_material_purchasing" not in inspector.get_table_names():
        return

    existing_columns = {
        column["name"] for column in inspector.get_columns("raw_material_purchasing")
    }
    for column in ("dc_expr", "g2_expr", "g1_expr"):
        if column in existing_columns:
            op.drop_column("raw_material_purchasing", column)
