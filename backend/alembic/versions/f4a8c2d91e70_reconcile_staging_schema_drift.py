"""Reconcile additive staging schema drift.

Revision ID: f4a8c2d91e70
Revises: e2b9c4d7a8f1

This migration is intentionally additive and idempotent.  Older staging
databases were partly updated outside Alembic, so every operation first checks
the live schema.  No legacy table, column, constraint, or data is removed.
"""

from alembic import op
import sqlalchemy as sa


revision = "f4a8c2d91e70"
down_revision = "e2b9c4d7a8f1"
branch_labels = None
depends_on = None


ADDITIVE_COLUMNS = {
    "kg_basis_workers": (
        sa.Column(
            "worker_type",
            sa.String(length=100),
            nullable=True,
            server_default="KG Basis Company Worker",
        ),
        sa.Column("worker_category", sa.String(length=50), nullable=True),
        sa.Column("daily_salary", sa.Float(), nullable=True, server_default="0"),
        sa.Column("bank_name", sa.String(length=100), nullable=True),
        sa.Column("account_number", sa.String(length=50), nullable=True),
        sa.Column("ifsc_code", sa.String(length=20), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
    ),
    "de_heading": (
        sa.Column("table_no", sa.String(length=50), nullable=True),
    ),
    "production_requirements": (
        sa.Column("date", sa.Date(), nullable=True),
        sa.Column("time", sa.String(length=50), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
    ),
}


ADDITIVE_INDEXES = (
    ("ix_de_heading_table_no", "de_heading", ("table_no",)),
    (
        "ix_production_requirements_company_id",
        "production_requirements",
        ("company_id",),
    ),
    ("ix_production_requirements_id", "production_requirements", ("id",)),
    (
        "ix_production_requirements_po_number",
        "production_requirements",
        ("po_number",),
    ),
)


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    for table_name, columns in ADDITIVE_COLUMNS.items():
        if table_name not in tables:
            continue
        existing_columns = {
            column["name"] for column in inspector.get_columns(table_name)
        }
        for column in columns:
            if column.name not in existing_columns:
                op.add_column(table_name, column)
                existing_columns.add(column.name)

    inspector = sa.inspect(bind)
    for index_name, table_name, columns in ADDITIVE_INDEXES:
        if table_name not in tables:
            continue
        existing_columns = {
            column["name"] for column in inspector.get_columns(table_name)
        }
        if not set(columns).issubset(existing_columns):
            continue
        existing_indexes = {
            index["name"]
            for index in inspector.get_indexes(table_name)
            if index.get("name")
        }
        if index_name not in existing_indexes:
            op.create_index(index_name, table_name, list(columns), unique=False)
            inspector = sa.inspect(bind)


def downgrade():
    # Reconciliation may encounter columns that predated Alembic.  Dropping
    # them on downgrade could destroy valid staging data, so rollback is
    # intentionally non-destructive.
    pass
