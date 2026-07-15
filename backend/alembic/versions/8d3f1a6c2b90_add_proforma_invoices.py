"""Add export proforma invoices.

Revision ID: 8d3f1a6c2b90
Revises: 4b7e2c91d5a8
"""

from alembic import op
import sqlalchemy as sa


revision = "8d3f1a6c2b90"
down_revision = "4b7e2c91d5a8"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    if "proforma_invoices" in inspector.get_table_names():
        columns = {column["name"] for column in inspector.get_columns("proforma_invoices")}
        additions = {
            "approval_status": sa.Column("approval_status", sa.String(), nullable=False, server_default="PENDING"),
            "approved_by": sa.Column("approved_by", sa.String(), nullable=True),
            "approved_at": sa.Column("approved_at", sa.DateTime(), nullable=True),
            "approval_remarks": sa.Column("approval_remarks", sa.Text(), nullable=True),
        }
        for name, column in additions.items():
            if name not in columns:
                op.add_column("proforma_invoices", column)
        index_names = {index["name"] for index in sa.inspect(op.get_bind()).get_indexes("proforma_invoices")}
        if "ix_proforma_invoices_approval_status" not in index_names:
            op.create_index("ix_proforma_invoices_approval_status", "proforma_invoices", ["approval_status"])
        return
    op.create_table(
        "proforma_invoices",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("company_id", sa.String(), nullable=False),
        sa.Column("pi_no", sa.String(), nullable=False),
        sa.Column("pi_date", sa.Date(), nullable=False),
        sa.Column("validity_date", sa.Date(), nullable=True),
        sa.Column("po_number", sa.String(), nullable=True),
        sa.Column("buyer_name", sa.String(), nullable=False),
        sa.Column("buyer_address", sa.Text(), nullable=False),
        sa.Column("country", sa.String(), nullable=False),
        sa.Column("currency", sa.String(), nullable=False, server_default="USD"),
        sa.Column("incoterm", sa.String(), nullable=False),
        sa.Column("payment_terms", sa.String(), nullable=False),
        sa.Column("port_of_loading", sa.String(), nullable=True),
        sa.Column("port_of_discharge", sa.String(), nullable=True),
        sa.Column("product_description", sa.Text(), nullable=False),
        sa.Column("quantity", sa.Numeric(18, 3), nullable=False, server_default="0"),
        sa.Column("unit", sa.String(), nullable=False, server_default="KG"),
        sa.Column("unit_price", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("total_amount", sa.Numeric(18, 2), nullable=False, server_default="0"),
        sa.Column("status", sa.String(), nullable=False, server_default="DRAFT"),
        sa.Column("approval_status", sa.String(), nullable=False, server_default="PENDING"),
        sa.Column("approved_by", sa.String(), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("approval_remarks", sa.Text(), nullable=True),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(), nullable=False),
        sa.Column("updated_by", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.Column("is_cancelled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.UniqueConstraint("company_id", "pi_no", name="uq_proforma_invoices_company_pi_no"),
    )
    for column in ("company_id", "pi_no", "po_number", "buyer_name", "country", "status", "approval_status", "is_cancelled"):
        op.create_index(f"ix_proforma_invoices_{column}", "proforma_invoices", [column])


def downgrade():
    if "proforma_invoices" in sa.inspect(op.get_bind()).get_table_names():
        op.drop_table("proforma_invoices")
