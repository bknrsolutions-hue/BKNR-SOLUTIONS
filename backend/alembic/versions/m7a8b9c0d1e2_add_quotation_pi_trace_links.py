"""Add explicit quotation and proforma-invoice trace links.

Revision ID: m7a8b9c0d1e2
Revises: l6f7a8b9c0d1
"""

from alembic import op
import sqlalchemy as sa


revision = "m7a8b9c0d1e2"
down_revision = "l6f7a8b9c0d1"
branch_labels = None
depends_on = None


def _add_if_missing(table, column):
    columns = {item["name"] for item in sa.inspect(op.get_bind()).get_columns(table)}
    if column.name not in columns:
        op.add_column(table, column)


def upgrade():
    _add_if_missing("crm_quotations", sa.Column("linked_pi_id", sa.Integer(), nullable=True))
    _add_if_missing("crm_quotations", sa.Column("linked_pi_no", sa.String(length=100), nullable=True))
    _add_if_missing("proforma_invoices", sa.Column("quotation_id", sa.Integer(), nullable=True))
    _add_if_missing("proforma_invoices", sa.Column("quotation_no", sa.String(length=100), nullable=True))


def downgrade():
    for table, column in (("proforma_invoices", "quotation_no"), ("proforma_invoices", "quotation_id"), ("crm_quotations", "linked_pi_no"), ("crm_quotations", "linked_pi_id")):
        columns = {item["name"] for item in sa.inspect(op.get_bind()).get_columns(table)}
        if column in columns:
            op.drop_column(table, column)
