"""add table registrations

Revision ID: 02bec41e1023
Revises: m7a8b9c0d1e2
Create Date: 2026-08-17
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "02bec41e1023"
down_revision: Union[str, Sequence[str], None] = "m7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if "table_registrations" not in inspector.get_table_names():
        op.create_table(
            "table_registrations",
            sa.Column("id", sa.Integer(), nullable=False),
            sa.Column("company_id", sa.String(length=50), nullable=False),
            sa.Column("date", sa.Date(), nullable=False),
            sa.Column("department", sa.String(length=50), nullable=False),
            sa.Column("table_no", sa.String(length=50), nullable=False),
            sa.Column("worker_type", sa.String(length=100), nullable=False),
            sa.Column("contractor_name", sa.String(length=255), nullable=True),
            sa.Column("no_of_workers", sa.Integer(), server_default="0", nullable=True),
            sa.Column("worker_ids", sa.Text(), nullable=True),
            sa.Column("production_at", sa.String(length=255), nullable=True),
            sa.Column("production_for", sa.String(length=255), nullable=True),
            sa.Column("status", sa.String(length=50), server_default="Active", nullable=True),
            sa.Column("created_by", sa.String(length=255), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(),
                server_default=sa.text("CURRENT_TIMESTAMP"),
                nullable=True,
            ),
            sa.PrimaryKeyConstraint("id"),
        )

    existing_indexes = {
        index["name"]
        for index in inspector.get_indexes("table_registrations")
    }

    indexes = [
        ("ix_table_registrations_id", ["id"]),
        ("ix_table_registrations_company_id", ["company_id"]),
        ("ix_table_registrations_date", ["date"]),
        ("ix_table_registrations_department", ["department"]),
        ("ix_table_registrations_table_no", ["table_no"]),
        ("ix_table_registrations_production_at", ["production_at"]),
        ("ix_table_registrations_production_for", ["production_for"]),
        ("ix_table_reg_company_dept_date", ["company_id", "department", "date"]),
        ("ix_table_reg_company_table", ["company_id", "table_no"]),
    ]

    for index_name, columns in indexes:
        if index_name not in existing_indexes:
            op.create_index(
                index_name,
                "table_registrations",
                columns,
                unique=False,
            )


def downgrade() -> None:
    op.drop_index(
        "ix_table_reg_company_table",
        table_name="table_registrations",
    )
    op.drop_index(
        "ix_table_reg_company_dept_date",
        table_name="table_registrations",
    )
    op.drop_index(
        "ix_table_registrations_production_for",
        table_name="table_registrations",
    )
    op.drop_index(
        "ix_table_registrations_production_at",
        table_name="table_registrations",
    )
    op.drop_index(
        "ix_table_registrations_table_no",
        table_name="table_registrations",
    )
    op.drop_index(
        "ix_table_registrations_department",
        table_name="table_registrations",
    )
    op.drop_index(
        "ix_table_registrations_date",
        table_name="table_registrations",
    )
    op.drop_index(
        "ix_table_registrations_company_id",
        table_name="table_registrations",
    )
    op.drop_index(
        "ix_table_registrations_id",
        table_name="table_registrations",
    )
    op.drop_table("table_registrations")