"""Add structured export document details and email-wise approvals.

Revision ID: a6c4e2f918b7
Revises: 8d3f1a6c2b90
"""

from alembic import op
import sqlalchemy as sa


revision = "a6c4e2f918b7"
down_revision = "8d3f1a6c2b90"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    file_columns = {column["name"] for column in inspector.get_columns("export_document_files")}
    additions = {
        "document_date": sa.Column("document_date", sa.Date(), nullable=True),
        "expiry_date": sa.Column("expiry_date", sa.Date(), nullable=True),
        "issuer_name": sa.Column("issuer_name", sa.String(), nullable=True),
        "reference_no": sa.Column("reference_no", sa.String(), nullable=True),
        "currency": sa.Column("currency", sa.String(), nullable=True),
        "amount": sa.Column("amount", sa.Numeric(18, 2), nullable=True),
        "details_json": sa.Column("details_json", sa.Text(), nullable=True),
    }
    for name, column in additions.items():
        if name not in file_columns:
            op.add_column("export_document_files", column)

    inspector = sa.inspect(bind)
    if "export_document_approvals" not in inspector.get_table_names():
        op.create_table(
            "export_document_approvals",
            sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column("company_id", sa.String(), nullable=False),
            sa.Column("file_id", sa.Integer(), sa.ForeignKey("export_document_files.id", ondelete="CASCADE"), nullable=False),
            sa.Column("approver_email", sa.String(), nullable=False),
            sa.Column("decision", sa.String(), nullable=False, server_default="PENDING"),
            sa.Column("remarks", sa.Text(), nullable=True),
            sa.Column("assigned_by", sa.String(), nullable=True),
            sa.Column("assigned_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("decided_at", sa.DateTime(), nullable=True),
            sa.UniqueConstraint("file_id", "approver_email", name="uq_export_document_approvals_file_email"),
        )
        for column in ("company_id", "file_id", "approver_email", "decision"):
            op.create_index(f"ix_export_document_approvals_{column}", "export_document_approvals", [column])


def downgrade():
    inspector = sa.inspect(op.get_bind())
    if "export_document_approvals" in inspector.get_table_names():
        op.drop_table("export_document_approvals")
    columns = {column["name"] for column in sa.inspect(op.get_bind()).get_columns("export_document_files")}
    for name in ("details_json", "amount", "currency", "reference_no", "issuer_name", "expiry_date", "document_date"):
        if name in columns:
            op.drop_column("export_document_files", name)
