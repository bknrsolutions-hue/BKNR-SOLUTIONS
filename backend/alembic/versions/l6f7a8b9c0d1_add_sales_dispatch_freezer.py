"""Store freezer selected in the loaded sales assortment.

Revision ID: l6f7a8b9c0d1
Revises: k5e6f7a8b9c0
"""

from alembic import op
import sqlalchemy as sa


revision = "l6f7a8b9c0d1"
down_revision = "k5e6f7a8b9c0"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("sales_dispatch")}
    if "freezer" not in columns:
        op.add_column("sales_dispatch", sa.Column("freezer", sa.String(length=255), nullable=True))


def downgrade():
    bind = op.get_bind()
    columns = {column["name"] for column in sa.inspect(bind).get_columns("sales_dispatch")}
    if "freezer" in columns:
        op.drop_column("sales_dispatch", "freezer")
