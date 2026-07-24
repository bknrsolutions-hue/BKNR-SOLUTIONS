"""Add ERP performance indexes for tenant-scoped reports.

Revision ID: e2b9c4d7a8f1
Revises: c8a4f1d2e6b9
"""

from alembic import op
import sqlalchemy as sa


revision = "e2b9c4d7a8f1"
down_revision = "c8a4f1d2e6b9"
branch_labels = None
depends_on = None


INDEXES = (
    ("ix_production_for_company_status", "production_for", ("company_id", "status")),
    ("ix_production_for_company_lookup", "production_for", ("company_id", "production_for", "freezer_name", "glaze_percent")),
    ("ix_hoso_hlso_yields_company_species_count", "hoso_hlso_yields", ("company_id", "species", "hoso_count")),

    ("ix_gate_entry_company_date", "gate_entry", ("company_id", "date")),
    ("ix_gate_entry_company_batch", "gate_entry", ("company_id", "batch_number")),
    ("ix_gate_entry_company_prod_for_date", "gate_entry", ("company_id", "production_for", "date")),
    ("ix_gate_entry_company_status_cancel", "gate_entry", ("company_id", "status", "is_cancelled")),
    ("ix_rmp_company_date", "raw_material_purchasing", ("company_id", "date")),
    ("ix_rmp_company_batch", "raw_material_purchasing", ("company_id", "batch_number")),
    ("ix_rmp_company_supplier_date", "raw_material_purchasing", ("company_id", "supplier_name", "date")),
    ("ix_rmp_company_prod_for_peeling", "raw_material_purchasing", ("company_id", "production_for", "peeling_at")),
    ("ix_rmp_company_status_cancel", "raw_material_purchasing", ("company_id", "status", "is_cancelled")),
    ("ix_de_heading_company_date", "de_heading", ("company_id", "date")),
    ("ix_de_heading_company_batch", "de_heading", ("company_id", "batch_number")),
    ("ix_de_heading_company_prod_for_peeling", "de_heading", ("company_id", "production_for", "peeling_at")),
    ("ix_de_heading_company_status_cancel", "de_heading", ("company_id", "status", "is_cancelled")),
    ("ix_grading_company_date", "grading", ("company_id", "date")),
    ("ix_grading_company_batch", "grading", ("company_id", "batch_number")),
    ("ix_grading_company_prod_for_peeling", "grading", ("company_id", "production_for", "peeling_at")),
    ("ix_grading_company_status_cancel", "grading", ("company_id", "status", "is_cancelled")),
    ("ix_peeling_company_date", "peeling", ("company_id", "date")),
    ("ix_peeling_company_batch", "peeling", ("company_id", "batch_number")),
    ("ix_peeling_company_prod_for_peeling", "peeling", ("company_id", "production_for", "peeling_at")),
    ("ix_peeling_company_status_cancel", "peeling", ("company_id", "status", "is_cancelled")),
    ("ix_soaking_company_date", "soaking", ("company_id", "date")),
    ("ix_soaking_company_batch", "soaking", ("company_id", "batch_number")),
    ("ix_soaking_company_prod_for_at", "soaking", ("company_id", "production_for", "production_at")),
    ("ix_soaking_company_status_cancel", "soaking", ("company_id", "status", "is_cancelled")),
    ("ix_production_company_date", "production", ("company_id", "date")),
    ("ix_production_company_batch", "production", ("company_id", "batch_number")),
    ("ix_production_company_prod_for_at", "production", ("company_id", "production_for", "production_at")),
    ("ix_production_company_product_dims", "production", ("company_id", "species", "variety_name", "grade", "glaze")),
    ("ix_production_company_status_cancel", "production", ("company_id", "status", "is_cancelled")),
    ("ix_hlso_for_grading_company_batch", "hlso_for_grading", ("company_id", "batch_number")),
    ("ix_hlso_for_grading_company_status", "hlso_for_grading", ("company_id", "status")),
    ("ix_hlso_for_grading_company_prod_peeling", "hlso_for_grading", ("company_id", "production_for", "peeling_at")),
    ("ix_goods_gate_company_date_type", "goods_gate_movements", ("company_id", "movement_date", "movement_type")),
    ("ix_goods_gate_company_location_date", "goods_gate_movements", ("company_id", "plant_location", "movement_date")),
    ("ix_goods_gate_company_status_return", "goods_gate_movements", ("company_id", "status", "return_status")),

    ("ix_stock_entry_company_date", "stock_entry", ("company_id", "date")),
    ("ix_stock_entry_company_batch", "stock_entry", ("company_id", "batch_number")),
    ("ix_stock_entry_company_filters", "stock_entry", ("company_id", "production_for", "production_at", "batch_number")),
    ("ix_stock_entry_company_location_date", "stock_entry", ("company_id", "location", "date")),
    ("ix_stock_entry_company_product_dims", "stock_entry", ("company_id", "species", "variety", "grade", "glaze")),
    ("ix_stock_entry_company_status_cancel", "stock_entry", ("company_id", "status", "is_cancelled")),
    ("ix_pending_orders_company_po", "pending_orders", ("company_id", "po_number")),
    ("ix_pending_orders_company_shipment", "pending_orders", ("company_id", "shipment_date")),
    ("ix_pending_orders_company_buyer", "pending_orders", ("company_id", "buyer")),
    ("ix_pending_orders_company_product_dims", "pending_orders", ("company_id", "species", "variety", "grade")),
    ("ix_sales_dispatch_company_invoice", "sales_dispatch", ("company_id", "invoice_no")),
    ("ix_sales_dispatch_company_buyer", "sales_dispatch", ("company_id", "buyer_name")),
    ("ix_sales_dispatch_company_status", "sales_dispatch", ("company_id", "status")),
    ("ix_sales_dispatch_company_po", "sales_dispatch", ("company_id", "po_number")),
    ("ix_cold_storage_holding_company_batch", "cold_storage_holding", ("company_id", "batch_number")),
    ("ix_cold_storage_holding_company_status", "cold_storage_holding", ("company_id", "status")),
    ("ix_cold_storage_holding_company_storage_status", "cold_storage_holding", ("company_id", "cold_storage_name", "status")),
    ("ix_cold_storage_holding_company_prod_for_at", "cold_storage_holding", ("company_id", "production_for", "production_at")),
    ("ix_cold_storage_holding_company_in_date", "cold_storage_holding", ("company_id", "in_date")),
    ("ix_inventory_summary_company_prod_for_at", "inventory_summary", ("company_id", "production_for", "production_at")),
    ("ix_inventory_summary_company_product_dims", "inventory_summary", ("company_id", "species", "variety", "grade", "glaze")),
    ("ix_inventory_snapshot_company_date", "inventory_daily_snapshot", ("company_id", "snapshot_date")),
    ("ix_inventory_snapshot_company_prod_for_at", "inventory_daily_snapshot", ("company_id", "production_for", "production_at")),
    ("ix_inventory_snapshot_company_product_dims", "inventory_daily_snapshot", ("company_id", "species", "variety", "grade", "glaze")),

    ("ix_financial_year_company_dates", "financial_year_masters", ("company_id", "start_date", "end_date")),
    ("ix_voucher_headers_company_date_status", "voucher_headers", ("company_id", "voucher_date", "status")),
    ("ix_voucher_headers_company_type_date", "voucher_headers", ("company_id", "voucher_type_id", "voucher_date")),
    ("ix_voucher_headers_company_reference", "voucher_headers", ("company_id", "reference_no")),
    ("ix_voucher_details_voucher_ledger", "voucher_details", ("voucher_id", "ledger_id")),
    ("ix_voucher_details_ledger", "voucher_details", ("ledger_id",)),
    ("ix_voucher_details_cost_center", "voucher_details", ("cost_center_id",)),
    ("ix_bank_reconciliation_company_bank_date", "bank_reconciliations", ("company_id", "bank_ledger_id", "statement_date")),
    ("ix_bank_reconciliation_company_matched", "bank_reconciliations", ("company_id", "is_matched")),
    ("ix_bill_allocations_company_document", "bill_allocations", ("company_id", "document_no")),
    ("ix_bill_allocations_company_reversed", "bill_allocations", ("company_id", "is_reversed")),
    ("ix_forex_revaluation_company_date", "forex_revaluations", ("company_id", "as_of_date")),
    ("ix_finance_audit_company_table_record", "finance_audit_trails", ("company_id", "table_name", "record_id")),
    ("ix_finance_audit_company_timestamp", "finance_audit_trails", ("company_id", "timestamp")),
    ("ix_lc_tracking_company_status_expiry", "lc_tracking", ("company_id", "status", "expiry_date")),
    ("ix_lc_tracking_company_buyer", "lc_tracking", ("company_id", "buyer_name")),
    ("ix_salary_processing_company_month_status", "salary_processing", ("company_id", "month_year", "status")),
    ("ix_salary_processing_company_payment_status", "salary_processing", ("company_id", "payment_status")),
    ("ix_production_cost_company_date_status", "production_cost_allocations", ("company_id", "production_date", "status")),
    ("ix_production_cost_company_batch_status", "production_cost_allocations", ("company_id", "batch_number", "status")),
)


def _index_names(inspector, table_name):
    return {index["name"] for index in inspector.get_indexes(table_name)}


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    for index_name, table_name, columns in INDEXES:
        if table_name not in tables:
            continue
        inspector = sa.inspect(bind)
        if index_name in _index_names(inspector, table_name):
            continue
        op.create_index(index_name, table_name, list(columns))


def downgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    tables = set(inspector.get_table_names())

    for index_name, table_name, _columns in reversed(INDEXES):
        if table_name not in tables:
            continue
        inspector = sa.inspect(bind)
        if index_name not in _index_names(inspector, table_name):
            continue
        op.drop_index(index_name, table_name=table_name)
