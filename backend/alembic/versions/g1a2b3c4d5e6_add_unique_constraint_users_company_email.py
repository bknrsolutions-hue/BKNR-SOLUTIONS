"""Add unique constraint on (company_id, email) in users table.

Revision ID: g1a2b3c4d5e6
Revises: e2b9c4d7a8f1
"""

from alembic import op

revision = "g1a2b3c4d5e6"
down_revision = "f4a8c2d91e70"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint(
        "uq_users_company_email",
        "users",
        ["company_id", "email"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_users_company_email", "users", type_="unique")
