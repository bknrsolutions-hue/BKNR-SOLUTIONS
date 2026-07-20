"""add non-RMP goods gate movement register

Revision ID: c8a4f1d2e6b9
Revises: b91e5f7a2c40
"""

from alembic import op
import sqlalchemy as sa


revision = "c8a4f1d2e6b9"
down_revision = "b91e5f7a2c40"
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    tables = set(sa.inspect(bind).get_table_names())
    if "goods_gate_movements" not in tables:
        op.create_table(
            "goods_gate_movements",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("company_id", sa.String(50), nullable=False),
            sa.Column("movement_number", sa.String(100), nullable=False),
            sa.Column("movement_type", sa.String(10), nullable=False),
            sa.Column("movement_date", sa.Date(), nullable=False),
            sa.Column("movement_time", sa.Time(), nullable=False),
            sa.Column("production_for", sa.String(255), nullable=False),
            sa.Column("plant_location", sa.String(255), nullable=False),
            sa.Column("party_name", sa.String(255), nullable=False),
            sa.Column("source_destination", sa.String(255)),
            sa.Column("po_number", sa.String(100)),
            sa.Column("challan_number", sa.String(100)),
            sa.Column("invoice_number", sa.String(100)),
            sa.Column("vehicle_number", sa.String(100)),
            sa.Column("driver_name", sa.String(255)),
            sa.Column("department", sa.String(255)),
            sa.Column("purpose", sa.String(255), nullable=False),
            sa.Column("authorized_received_by", sa.String(255)),
            sa.Column("is_returnable", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("expected_return_date", sa.Date()),
            sa.Column("linked_movement_id", sa.Integer(), sa.ForeignKey("goods_gate_movements.id")),
            sa.Column("return_status", sa.String(30), nullable=False, server_default="NOT_APPLICABLE"),
            sa.Column("status", sa.String(30), nullable=False, server_default="ACTIVE"),
            sa.Column("remarks", sa.Text()),
            sa.Column("created_by", sa.String(255), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("is_cancelled", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("cancel_reason", sa.Text()),
            sa.Column("cancelled_by", sa.String(255)),
            sa.Column("cancelled_at", sa.DateTime()),
            sa.UniqueConstraint("company_id", "movement_number", name="uix_company_goods_gate_movement"),
        )
        op.create_index("ix_goods_gate_movements_company_id", "goods_gate_movements", ["company_id"])
        op.create_index("ix_goods_gate_movements_movement_number", "goods_gate_movements", ["movement_number"])
        op.create_index("ix_goods_gate_movements_movement_type", "goods_gate_movements", ["movement_type"])
        op.create_index("ix_goods_gate_movements_movement_date", "goods_gate_movements", ["movement_date"])
        op.create_index("ix_goods_gate_movements_production_for", "goods_gate_movements", ["production_for"])
        op.create_index("ix_goods_gate_movements_plant_location", "goods_gate_movements", ["plant_location"])

    tables = set(sa.inspect(bind).get_table_names())
    if "goods_gate_movement_items" not in tables:
        op.create_table(
            "goods_gate_movement_items",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("movement_id", sa.Integer(), sa.ForeignKey("goods_gate_movements.id", ondelete="CASCADE"), nullable=False),
            sa.Column("item_category", sa.String(150), nullable=False),
            sa.Column("item_name", sa.String(255), nullable=False),
            sa.Column("description", sa.Text()),
            sa.Column("quantity", sa.Float(), nullable=False),
            sa.Column("unit", sa.String(50), nullable=False),
            sa.Column("packages", sa.Float(), server_default="0"),
            sa.Column("returned_quantity", sa.Float(), server_default="0"),
            sa.Column("material_condition", sa.String(100)),
            sa.Column("remarks", sa.Text()),
        )
        op.create_index("ix_goods_gate_movement_items_movement_id", "goods_gate_movement_items", ["movement_id"])
        op.create_index("ix_goods_gate_movement_items_item_category", "goods_gate_movement_items", ["item_category"])


def downgrade():
    tables = set(sa.inspect(op.get_bind()).get_table_names())
    if "goods_gate_movement_items" in tables:
        op.drop_table("goods_gate_movement_items")
    if "goods_gate_movements" in tables:
        op.drop_table("goods_gate_movements")
