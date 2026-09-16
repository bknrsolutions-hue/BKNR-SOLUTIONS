"""Create CRM quotation tables when absent.

Revision ID: k5e6f7a8b9c0
Revises: j4d5e6f7a8b9

Idempotent migration to create crm_quotations, crm_quotation_lines, and crm_quotation_replies.
"""

from alembic import op
from app.database.models.crm_quotation import CRMQuotation, CRMQuotationLine, CRMQuotationReply


revision = "k5e6f7a8b9c0"
down_revision = "j4d5e6f7a8b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    CRMQuotation.__table__.create(bind=bind, checkfirst=True)
    CRMQuotationLine.__table__.create(bind=bind, checkfirst=True)
    CRMQuotationReply.__table__.create(bind=bind, checkfirst=True)


def downgrade() -> None:
    pass
