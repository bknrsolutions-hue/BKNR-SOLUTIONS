"""add audit log clean

Revision ID: 59076461dae3
Revises: None
Create Date: 2026-02-23
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "59076461dae3"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "audit_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("table_name", sa.String(length=100)),
        sa.Column("record_id", sa.Integer()),
        sa.Column("company_id", sa.String(length=50)),
        sa.Column("field_name", sa.String(length=100)),
        sa.Column("old_value", sa.Text()),
        sa.Column("new_value", sa.Text()),
        sa.Column("edited_by", sa.String(length=255)),
        sa.Column("edited_at", sa.DateTime()),
    )


def downgrade():
    op.drop_table("audit_log")

       
