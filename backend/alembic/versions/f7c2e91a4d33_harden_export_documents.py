"""Harden export documents for tenant-safe lifecycle handling.

Revision ID: f7c2e91a4d33
Revises: e4a1c7d29b10
"""

from alembic import op
import sqlalchemy as sa


revision = "f7c2e91a4d33"
down_revision = "e4a1c7d29b10"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("export_compliance_tracker", sa.Column("company_id", sa.String(), nullable=True))
    op.execute("""
        UPDATE export_compliance_tracker ect
           SET company_id = es.company_id
          FROM export_shipments es
         WHERE es.shipment_no = ect.shipment_no
    """)
    op.alter_column("export_compliance_tracker", "company_id", nullable=False)
    op.create_index("ix_export_compliance_tracker_company_id", "export_compliance_tracker", ["company_id"])

    for table_name in (
        "commercial_invoices", "packing_lists", "container_stuffing",
        "shipping_bills", "bill_of_ladings", "health_certificates",
    ):
        op.add_column(table_name, sa.Column("is_cancelled", sa.Boolean(), nullable=False, server_default=sa.false()))
        op.create_index(f"ix_{table_name}_is_cancelled", table_name, ["is_cancelled"])

    op.drop_constraint("export_compliance_tracker_shipment_no_fkey", "export_compliance_tracker", type_="foreignkey")
    op.drop_constraint("commercial_invoices_shipment_no_fkey", "commercial_invoices", type_="foreignkey")
    op.drop_constraint("packing_lists_invoice_no_fkey", "packing_lists", type_="foreignkey")

    for table_name, column_name, constraint_name in (
        ("export_shipments", "shipment_no", "uq_export_shipments_company_shipment_no"),
        ("container_stuffing", "container_no", "uq_container_stuffing_company_container_no"),
        ("shipping_bills", "shipping_bill_no", "uq_shipping_bills_company_shipping_bill_no"),
        ("bill_of_ladings", "bl_no", "uq_bill_of_ladings_company_bl_no"),
        ("health_certificates", "certificate_no", "uq_health_certificates_company_certificate_no"),
    ):
        op.drop_constraint(f"{table_name}_{column_name}_key", table_name, type_="unique")
        op.create_unique_constraint(constraint_name, table_name, ["company_id", column_name])

    op.create_foreign_key("fk_export_compliance_company_shipment", "export_compliance_tracker", "export_shipments", ["company_id", "shipment_no"], ["company_id", "shipment_no"])
    op.create_foreign_key("fk_commercial_invoices_company_shipment", "commercial_invoices", "export_shipments", ["company_id", "shipment_no"], ["company_id", "shipment_no"])
    op.create_foreign_key("fk_packing_lists_company_invoice", "packing_lists", "commercial_invoices", ["company_id", "invoice_no"], ["company_id", "invoice_no"])

    for column_name, scale in (("exchange_rate", 6), ("total_amount", 2), ("invoice_value_inr", 2)):
        op.alter_column("commercial_invoices", column_name, existing_type=sa.Float(), type_=sa.Numeric(18, scale), postgresql_using=f"ROUND(COALESCE({column_name}, 0)::numeric, {scale})")
    for column_name in ("shipping_bill_value", "drawback_amount"):
        op.alter_column("shipping_bills", column_name, existing_type=sa.Float(), type_=sa.Numeric(18, 2), postgresql_using=f"ROUND(COALESCE({column_name}, 0)::numeric, 2)")


def downgrade():
    raise RuntimeError("Export-document tenant hardening downgrade is intentionally unsupported")
