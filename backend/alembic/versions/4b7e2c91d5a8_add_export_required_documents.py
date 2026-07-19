"""Add PO-wise export required-document checklist.

Revision ID: 4b7e2c91d5a8
Revises: f7c2e91a4d33
"""

from alembic import op
import sqlalchemy as sa


revision = "4b7e2c91d5a8"
down_revision = "f7c2e91a4d33"
branch_labels = None
depends_on = None


def upgrade():
    inspector = sa.inspect(op.get_bind())
    if "export_required_documents" not in inspector.get_table_names():
        op.create_table(
            "export_required_documents",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("po_number", sa.String(), nullable=False),
            sa.Column("document_kind", sa.String(), nullable=False),
            sa.Column("document_label", sa.String(), nullable=False),
            sa.Column("created_by", sa.String(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint(
                "company_id", "po_number", "document_kind",
                name="uq_export_required_documents_company_po_kind",
            ),
        )
        op.create_index("ix_export_required_documents_company_id", "export_required_documents", ["company_id"])
        op.create_index("ix_export_required_documents_po_number", "export_required_documents", ["po_number"])
        op.create_index("ix_export_required_documents_document_kind", "export_required_documents", ["document_kind"])

    file_columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("export_document_files")}
    if "approval_status" not in file_columns:
        op.add_column("export_document_files", sa.Column("approval_status", sa.String(), nullable=False, server_default="PENDING"))
    file_indexes = {index["name"] for index in sa.inspect(op.get_bind()).get_indexes("export_document_files")}
    if "ix_export_document_files_approval_status" not in file_indexes:
        op.create_index("ix_export_document_files_approval_status", "export_document_files", ["approval_status"])
    if "approved_by" not in file_columns:
        op.add_column("export_document_files", sa.Column("approved_by", sa.String(), nullable=True))
    if "approved_at" not in file_columns:
        op.add_column("export_document_files", sa.Column("approved_at", sa.DateTime(), nullable=True))
    if "approval_remarks" not in file_columns:
        op.add_column("export_document_files", sa.Column("approval_remarks", sa.Text(), nullable=True))


def downgrade():
    inspector = sa.inspect(op.get_bind())
    file_columns = {column["name"] for column in inspector.get_columns("export_document_files")}
    file_indexes = {index["name"] for index in inspector.get_indexes("export_document_files")}
    if "ix_export_document_files_approval_status" in file_indexes:
        op.drop_index("ix_export_document_files_approval_status", table_name="export_document_files")
    for column_name in ("approval_remarks", "approved_at", "approved_by", "approval_status"):
        if column_name in file_columns:
            op.drop_column("export_document_files", column_name)
    if "export_required_documents" in inspector.get_table_names():
        op.drop_table("export_required_documents")
