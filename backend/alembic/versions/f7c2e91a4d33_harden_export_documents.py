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
    bind = op.get_bind()

    def inspector():
        return sa.inspect(bind)

    def column_map(table_name):
        return {
            column["name"]: column
            for column in inspector().get_columns(table_name)
        }

    def index_names(table_name):
        return {
            index["name"]
            for index in inspector().get_indexes(table_name)
            if index.get("name")
        }

    def unique_names(table_name):
        return {
            constraint["name"]
            for constraint in inspector().get_unique_constraints(table_name)
            if constraint.get("name")
        }

    def foreign_key_names(table_name):
        return {
            constraint["name"]
            for constraint in inspector().get_foreign_keys(table_name)
            if constraint.get("name")
        }

    if "company_id" not in column_map("export_compliance_tracker"):
        op.add_column(
            "export_compliance_tracker",
            sa.Column("company_id", sa.String(), nullable=True),
        )
    op.execute("""
        UPDATE export_compliance_tracker ect
           SET company_id = es.company_id
          FROM export_shipments es
         WHERE es.shipment_no = ect.shipment_no
           AND ect.company_id IS NULL
    """)
    compliance_company = column_map("export_compliance_tracker")["company_id"]
    if compliance_company["nullable"]:
        op.alter_column(
            "export_compliance_tracker",
            "company_id",
            existing_type=compliance_company["type"],
            nullable=False,
        )
    if "ix_export_compliance_tracker_company_id" not in index_names(
        "export_compliance_tracker"
    ):
        op.create_index(
            "ix_export_compliance_tracker_company_id",
            "export_compliance_tracker",
            ["company_id"],
        )

    for table_name in (
        "commercial_invoices", "packing_lists", "container_stuffing",
        "shipping_bills", "bill_of_ladings", "health_certificates",
    ):
        if "is_cancelled" not in column_map(table_name):
            op.add_column(
                table_name,
                sa.Column(
                    "is_cancelled",
                    sa.Boolean(),
                    nullable=False,
                    server_default=sa.false(),
                ),
            )
        index_name = f"ix_{table_name}_is_cancelled"
        if index_name not in index_names(table_name):
            op.create_index(index_name, table_name, ["is_cancelled"])

    for table_name, constraint_name in (
        ("export_compliance_tracker", "export_compliance_tracker_shipment_no_fkey"),
        ("commercial_invoices", "commercial_invoices_shipment_no_fkey"),
        ("packing_lists", "packing_lists_invoice_no_fkey"),
    ):
        if constraint_name in foreign_key_names(table_name):
            op.drop_constraint(
                constraint_name, table_name, type_="foreignkey"
            )

    for table_name, column_name, constraint_name in (
        ("export_shipments", "shipment_no", "uq_export_shipments_company_shipment_no"),
        (
            "commercial_invoices",
            "invoice_no",
            "uq_commercial_invoices_company_invoice_no",
        ),
        ("container_stuffing", "container_no", "uq_container_stuffing_company_container_no"),
        ("shipping_bills", "shipping_bill_no", "uq_shipping_bills_company_shipping_bill_no"),
        ("bill_of_ladings", "bl_no", "uq_bill_of_ladings_company_bl_no"),
        ("health_certificates", "certificate_no", "uq_health_certificates_company_certificate_no"),
    ):
        old_constraint = f"{table_name}_{column_name}_key"
        uniques = unique_names(table_name)
        if old_constraint in uniques:
            op.drop_constraint(
                old_constraint, table_name, type_="unique"
            )
        if constraint_name not in unique_names(table_name):
            op.create_unique_constraint(
                constraint_name,
                table_name,
                ["company_id", column_name],
            )

    for (
        constraint_name,
        source_table,
        target_table,
        source_columns,
        target_columns,
    ) in (
        (
            "fk_export_compliance_company_shipment",
            "export_compliance_tracker",
            "export_shipments",
            ["company_id", "shipment_no"],
            ["company_id", "shipment_no"],
        ),
        (
            "fk_commercial_invoices_company_shipment",
            "commercial_invoices",
            "export_shipments",
            ["company_id", "shipment_no"],
            ["company_id", "shipment_no"],
        ),
        (
            "fk_packing_lists_company_invoice",
            "packing_lists",
            "commercial_invoices",
            ["company_id", "invoice_no"],
            ["company_id", "invoice_no"],
        ),
    ):
        if constraint_name not in foreign_key_names(source_table):
            op.create_foreign_key(
                constraint_name,
                source_table,
                target_table,
                source_columns,
                target_columns,
            )

    for column_name, scale in (("exchange_rate", 6), ("total_amount", 2), ("invoice_value_inr", 2)):
        existing = column_map("commercial_invoices")[column_name]
        if not isinstance(existing["type"], sa.Numeric):
            op.alter_column("commercial_invoices", column_name, existing_type=existing["type"], type_=sa.Numeric(18, scale), postgresql_using=f"ROUND(COALESCE({column_name}, 0)::numeric, {scale})")
    for column_name in ("shipping_bill_value", "drawback_amount"):
        existing = column_map("shipping_bills")[column_name]
        if not isinstance(existing["type"], sa.Numeric):
            op.alter_column("shipping_bills", column_name, existing_type=existing["type"], type_=sa.Numeric(18, 2), postgresql_using=f"ROUND(COALESCE({column_name}, 0)::numeric, 2)")


def downgrade():
    raise RuntimeError("Export-document tenant hardening downgrade is intentionally unsupported")
