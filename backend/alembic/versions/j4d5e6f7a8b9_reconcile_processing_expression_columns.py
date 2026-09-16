"""Reconcile processing quantity-expression columns.

Revision ID: j4d5e6f7a8b9
Revises: i3c4d5e6f7a8

Legacy databases can be marked at an Alembic revision while missing additive
processing expression columns. Re-check every current operational table and
add only the columns that are absent.
"""

from alembic import op
import sqlalchemy as sa


revision = "j4d5e6f7a8b9"
down_revision = "i3c4d5e6f7a8"
branch_labels = None
depends_on = None


EXPRESSION_COLUMNS = {
    "raw_material_purchasing": ("g1_expr", "g2_expr", "dc_expr"),
    "de_heading": ("hlso_qty_expr",),
    "grading": ("quantity_expr",),
    "peeling": ("peeled_qty_expr",),
}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    for table_name, column_names in EXPRESSION_COLUMNS.items():
        if table_name not in tables:
            continue
        existing_columns = {
            column["name"] for column in inspector.get_columns(table_name)
        }
        for column_name in column_names:
            if column_name not in existing_columns:
                op.add_column(
                    table_name,
                    sa.Column(column_name, sa.String(length=500), nullable=True),
                )
                existing_columns.add(column_name)


def downgrade() -> None:
    # These fields may contain audit-relevant operational expressions. Keep a
    # downgrade non-destructive rather than silently deleting stored data.
    pass
