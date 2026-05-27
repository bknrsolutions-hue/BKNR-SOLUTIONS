"""Add enterprise export shipment and accounts v3

Revision ID: c931ff9a5bfc
Revises: 59076461dae3
Create Date: 2026-05-27 18:37:12.840703

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'c931ff9a5bfc'
down_revision: Union[str, Sequence[str], None] = '59076461dae3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. EXPORT MANAGEMENT TABLES
    op.create_table(
        'export_shipments',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True, autoincrement=True),
        sa.Column('company_id', sa.String(), nullable=False),
        sa.Column('shipment_no', sa.String(), nullable=False, unique=True),
        sa.Column('po_number', sa.String(), nullable=False),
        sa.Column('invoice_no', sa.String(), nullable=True),
        sa.Column('container_no', sa.String(), nullable=True),
        sa.Column('buyer_name', sa.String(), nullable=False),
        sa.Column('country', sa.String(), nullable=False),
        sa.Column('etd', sa.Date(), nullable=True),
        sa.Column('eta', sa.Date(), nullable=True),
        sa.Column('completion_date', sa.Date(), nullable=True),
        sa.Column('status', sa.String(), server_default='OPEN', nullable=False),
        sa.Column('is_completed', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('is_cancelled', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('created_by', sa.String(), nullable=False),
        sa.Column('updated_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('approved_by', sa.String(), nullable=True),
        sa.Column('approved_at', sa.DateTime(), nullable=True),
        sa.Column('approval_status', sa.String(), server_default='PENDING', nullable=False)
    )
    op.create_index('ix_export_shipments_shipment_no', 'export_shipments', ['shipment_no'])
    op.create_index('ix_export_shipments_company_id', 'export_shipments', ['company_id'])

    op.create_table(
        'export_compliance_tracker',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True, autoincrement=True),
        sa.Column('shipment_no', sa.String(), sa.ForeignKey('export_shipments.shipment_no', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('invoice_pending', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('packing_list_pending', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('health_cert_pending', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('shipping_bill_pending', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('bl_pending', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('payment_pending', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('last_checked_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('remarks', sa.Text(), nullable=True)
    )

    op.create_table(
        'commercial_invoices',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True, autoincrement=True),
        sa.Column('company_id', sa.String(), nullable=False),
        sa.Column('shipment_no', sa.String(), sa.ForeignKey('export_shipments.shipment_no'), nullable=False),
        sa.Column('invoice_no', sa.String(), nullable=False, unique=True),
        sa.Column('po_number', sa.String(), nullable=False),
        sa.Column('container_no', sa.String(), nullable=True),
        sa.Column('buyer_name', sa.String(), nullable=False),
        sa.Column('invoice_date', sa.Date(), nullable=False),
        sa.Column('buyer_address', sa.Text(), nullable=False),
        sa.Column('consignee_name', sa.String(), nullable=True),
        sa.Column('notify_party', sa.Text(), nullable=True),
        sa.Column('country', sa.String(), nullable=False),
        sa.Column('currency', sa.String(), server_default='USD', nullable=False),
        sa.Column('exchange_rate', sa.Float(), server_default='1.0', nullable=False),
        sa.Column('total_amount', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('invoice_value_inr', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('shipment_type', sa.String(), server_default='SEA', nullable=False),
        sa.Column('payment_terms', sa.String(), nullable=False),
        sa.Column('shipment_terms', sa.String(), nullable=False),
        sa.Column('payment_status', sa.String(), server_default='PENDING', nullable=False),
        sa.Column('status', sa.String(), server_default='OPEN', nullable=False),
        sa.Column('total_mc', sa.Integer(), server_default='0', nullable=False),
        sa.Column('total_net_weight', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('total_gross_weight', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('port_of_loading', sa.String(), nullable=True),
        sa.Column('port_of_discharge', sa.String(), nullable=True),
        sa.Column('final_destination', sa.String(), nullable=True),
        sa.Column('document_path', sa.String(), nullable=True),
        sa.Column('remarks', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(), nullable=False),
        sa.Column('updated_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('approved_by', sa.String(), nullable=True),
        sa.Column('approved_at', sa.DateTime(), nullable=True),
        sa.Column('approval_status', sa.String(), server_default='PENDING', nullable=False)
    )
    op.create_index('ix_commercial_invoices_invoice_no', 'commercial_invoices', ['invoice_no'])

    op.create_table(
        'packing_lists',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True, autoincrement=True),
        sa.Column('company_id', sa.String(), nullable=False),
        sa.Column('packing_no', sa.String(), nullable=False),
        sa.Column('invoice_no', sa.String(), sa.ForeignKey('commercial_invoices.invoice_no'), nullable=False),
        sa.Column('po_number', sa.String(), nullable=True),
        sa.Column('container_no', sa.String(), nullable=True),
        sa.Column('buyer_name', sa.String(), nullable=True),
        sa.Column('invoice_item_no', sa.Integer(), nullable=True),
        sa.Column('inventory_batch_id', sa.String(), nullable=True),
        sa.Column('stock_entry_no', sa.String(), nullable=True),
        sa.Column('product_name', sa.String(), nullable=False),
        sa.Column('grade', sa.String(), nullable=False),
        sa.Column('batch_no', sa.String(), nullable=True),
        sa.Column('lot_no', sa.String(), nullable=True),
        sa.Column('glaze', sa.String(), nullable=True),
        sa.Column('freezing_type', sa.String(), nullable=True),
        sa.Column('hs_code', sa.String(), nullable=True),
        sa.Column('manufacturing_date', sa.Date(), nullable=True),
        sa.Column('expiry_date', sa.Date(), nullable=True),
        sa.Column('packing_style', sa.String(), nullable=False),
        sa.Column('inner_pack', sa.String(), nullable=True),
        sa.Column('outer_pack', sa.String(), nullable=True),
        sa.Column('master_cartons', sa.Integer(), server_default='0', nullable=False),
        sa.Column('net_weight', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('gross_weight', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('pallet_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('document_path', sa.String(), nullable=True),
        sa.Column('created_by', sa.String(), nullable=False),
        sa.Column('updated_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True)
    )

    op.create_table(
        'container_stuffing',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True, autoincrement=True),
        sa.Column('company_id', sa.String(), nullable=False),
        sa.Column('company_name', sa.String(), nullable=True),
        sa.Column('container_no', sa.String(), nullable=False, unique=True),
        sa.Column('invoice_no', sa.String(), nullable=True),
        sa.Column('po_number', sa.String(), nullable=True),
        sa.Column('buyer_name', sa.String(), nullable=True),
        sa.Column('seal_no', sa.String(), nullable=False),
        sa.Column('shipping_line', sa.String(), nullable=True),
        sa.Column('stuffing_date', sa.Date(), nullable=False),
        sa.Column('stuffing_location', sa.String(), nullable=True),
        sa.Column('container_type', sa.String(), server_default='Reefer', nullable=False),
        sa.Column('container_size', sa.String(), server_default='40FT', nullable=False),
        sa.Column('container_condition', sa.String(), nullable=True),
        sa.Column('start_time', sa.DateTime(), nullable=True),
        sa.Column('end_time', sa.DateTime(), nullable=True),
        sa.Column('temperature_before_loading', sa.Float(), nullable=True),
        sa.Column('temperature_after_loading', sa.Float(), nullable=True),
        sa.Column('temperature', sa.Float(), nullable=False),
        sa.Column('vehicle_no', sa.String(), nullable=False),
        sa.Column('driver_name', sa.String(), nullable=True),
        sa.Column('loading_supervisor', sa.String(), nullable=False),
        sa.Column('photo_path', sa.String(), nullable=True),
        sa.Column('document_path', sa.String(), nullable=True),
        sa.Column('remarks', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(), nullable=False),
        sa.Column('updated_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('approved_by', sa.String(), nullable=True),
        sa.Column('approved_at', sa.DateTime(), nullable=True),
        sa.Column('approval_status', sa.String(), server_default='PENDING', nullable=False)
    )

    op.create_table(
        'shipping_bills',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True, autoincrement=True),
        sa.Column('company_id', sa.String(), nullable=False),
        sa.Column('shipping_bill_no', sa.String(), nullable=False, unique=True),
        sa.Column('shipping_bill_date', sa.Date(), nullable=False),
        sa.Column('invoice_no', sa.String(), nullable=False),
        sa.Column('container_no', sa.String(), nullable=True),
        sa.Column('po_number', sa.String(), nullable=True),
        sa.Column('buyer_name', sa.String(), nullable=True),
        sa.Column('shipping_bill_value', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('drawback_amount', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('scheme', sa.String(), server_default='NONE', nullable=False),
        sa.Column('customs_status', sa.String(), server_default='LEO', nullable=False),
        sa.Column('port', sa.String(), nullable=False),
        sa.Column('cha_name', sa.String(), nullable=False),
        sa.Column('cha_bill_no', sa.String(), nullable=True),
        sa.Column('vessel_name', sa.String(), nullable=False),
        sa.Column('voyage_no', sa.String(), nullable=False),
        sa.Column('etd', sa.Date(), nullable=False),
        sa.Column('eta', sa.Date(), nullable=False),
        sa.Column('document_path', sa.String(), nullable=True),
        sa.Column('remarks', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(), nullable=False),
        sa.Column('updated_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('approved_by', sa.String(), nullable=True),
        sa.Column('approved_at', sa.DateTime(), nullable=True),
        sa.Column('approval_status', sa.String(), server_default='PENDING', nullable=False)
    )

    op.create_table(
        'bill_of_ladings',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True, autoincrement=True),
        sa.Column('company_id', sa.String(), nullable=False),
        sa.Column('bl_no', sa.String(), nullable=False, unique=True),
        sa.Column('bl_date', sa.Date(), nullable=False),
        sa.Column('onboard_date', sa.Date(), nullable=True),
        sa.Column('invoice_no', sa.String(), nullable=False),
        sa.Column('container_no', sa.String(), nullable=False),
        sa.Column('po_number', sa.String(), nullable=True),
        sa.Column('buyer_name', sa.String(), nullable=True),
        sa.Column('shipping_line', sa.String(), nullable=False),
        sa.Column('seal_no', sa.String(), nullable=False),
        sa.Column('freight_terms', sa.String(), server_default='PREPAID', nullable=False),
        sa.Column('no_of_original_bl', sa.Integer(), server_default='3', nullable=False),
        sa.Column('marks_and_numbers', sa.Text(), nullable=True),
        sa.Column('packages_description', sa.Text(), nullable=True),
        sa.Column('place_of_receipt', sa.String(), nullable=True),
        sa.Column('place_of_delivery', sa.String(), nullable=True),
        sa.Column('gross_weight', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('net_weight', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('document_path', sa.String(), nullable=True),
        sa.Column('created_by', sa.String(), nullable=False),
        sa.Column('updated_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('approved_by', sa.String(), nullable=True),
        sa.Column('approved_at', sa.DateTime(), nullable=True),
        sa.Column('approval_status', sa.String(), server_default='PENDING', nullable=False)
    )

    op.create_table(
        'health_certificates',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True, autoincrement=True),
        sa.Column('company_id', sa.String(), nullable=False),
        sa.Column('certificate_no', sa.String(), nullable=False, unique=True),
        sa.Column('issue_date', sa.Date(), nullable=False),
        sa.Column('authority', sa.String(), server_default='EIA', nullable=False),
        sa.Column('factory_approval_no', sa.String(), nullable=True),
        sa.Column('invoice_no', sa.String(), nullable=False),
        sa.Column('container_no', sa.String(), nullable=False),
        sa.Column('po_number', sa.String(), nullable=True),
        sa.Column('buyer_name', sa.String(), nullable=True),
        sa.Column('country', sa.String(), nullable=True),
        sa.Column('species', sa.String(), nullable=True),
        sa.Column('temperature_verified', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('issued_by', sa.String(), nullable=True),
        sa.Column('status', sa.String(), server_default='ACTIVE', nullable=False),
        sa.Column('document_path', sa.String(), nullable=True),
        sa.Column('remarks', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('approved_by', sa.String(), nullable=True),
        sa.Column('approved_at', sa.DateTime(), nullable=True)
    )

    # 2. FINANCIAL & ACCOUNTING TABLES
    op.create_table(
        'customer_receivables',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True, autoincrement=True),
        sa.Column('company_id', sa.String(), nullable=False),
        sa.Column('invoice_no', sa.String(), nullable=False, unique=True),
        sa.Column('po_number', sa.String(), nullable=True),
        sa.Column('container_no', sa.String(), nullable=True),
        sa.Column('buyer_name', sa.String(), nullable=False),
        sa.Column('buyer_type', sa.String(), nullable=True),
        sa.Column('country', sa.String(), nullable=False),
        sa.Column('invoice_date', sa.Date(), nullable=False),
        sa.Column('currency', sa.String(), server_default='USD', nullable=False),
        sa.Column('exchange_rate', sa.Float(), server_default='1.0', nullable=False),
        sa.Column('invoice_value_foreign', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('invoice_value_inr', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('actual_received_rate', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('currency_gain_loss', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('bank_charges', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('tds_deduction', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('received_amount', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('balance_amount', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('received_date', sa.Date(), nullable=True),
        sa.Column('credit_days', sa.Integer(), server_default='30', nullable=False),
        sa.Column('due_date', sa.Date(), nullable=False),
        sa.Column('aging_days', sa.Integer(), server_default='0', nullable=False),
        sa.Column('credit_limit', sa.Float(), nullable=True),
        sa.Column('risk_status', sa.String(), server_default='CLEAN', nullable=False),
        sa.Column('payment_status', sa.String(), server_default='PENDING', nullable=False),
        sa.Column('status', sa.String(), server_default='OPEN', nullable=False),
        sa.Column('document_path', sa.String(), nullable=True),
        sa.Column('remarks', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(), nullable=False),
        sa.Column('updated_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('approved_by', sa.String(), nullable=True),
        sa.Column('approved_at', sa.DateTime(), nullable=True)
    )

    op.create_table(
        'vendor_payments',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True, autoincrement=True),
        sa.Column('company_id', sa.String(), nullable=False),
        sa.Column('vendor_name', sa.String(), nullable=False),
        sa.Column('vendor_type', sa.String(), nullable=False),
        sa.Column('gst_no', sa.String(), nullable=True),
        sa.Column('vendor_invoice_no', sa.String(), nullable=True),
        sa.Column('bill_no', sa.String(), nullable=False, unique=True),
        sa.Column('bill_date', sa.Date(), nullable=False),
        sa.Column('due_date', sa.Date(), nullable=False),
        sa.Column('total_amount', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('gst_amount', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('tds_amount', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('paid_amount', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('balance', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('payment_mode', sa.String(), nullable=True),
        sa.Column('transaction_no', sa.String(), nullable=True),
        sa.Column('payment_date', sa.Date(), nullable=True),
        sa.Column('status', sa.String(), server_default='Unpaid', nullable=False),
        sa.Column('document_path', sa.String(), nullable=True),
        sa.Column('remarks', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(), nullable=False),
        sa.Column('updated_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.Column('approved_by', sa.String(), nullable=True),
        sa.Column('approved_date', sa.Date(), nullable=True)
    )

    op.create_table(
        'bank_transactions',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True, autoincrement=True),
        sa.Column('company_id', sa.String(), nullable=False),
        sa.Column('bank_name', sa.String(), nullable=False),
        sa.Column('transaction_date', sa.Date(), nullable=False),
        sa.Column('voucher_type', sa.String(), nullable=False),
        sa.Column('reference_no', sa.String(), nullable=False, unique=True),
        sa.Column('linked_invoice_no', sa.String(), nullable=True),
        sa.Column('linked_vendor', sa.String(), nullable=True),
        sa.Column('debit', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('credit', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('closing_balance', sa.Float(), nullable=False),
        sa.Column('narration', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False)
    )

    op.create_table(
        'expense_vouchers',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True, autoincrement=True),
        sa.Column('company_id', sa.String(), nullable=False),
        sa.Column('voucher_no', sa.String(), nullable=False, unique=True),
        sa.Column('voucher_date', sa.Date(), nullable=False),
        sa.Column('expense_type', sa.String(), nullable=False),
        sa.Column('department', sa.String(), nullable=False),
        sa.Column('vendor_name', sa.String(), nullable=True),
        sa.Column('gst_percentage', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('gst_amount', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('amount', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('total_amount', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('approved_by', sa.String(), nullable=False),
        sa.Column('payment_mode', sa.String(), server_default='Cash', nullable=False),
        sa.Column('bill_attachment', sa.String(), nullable=True),
        sa.Column('status', sa.String(), server_default='APPROVED', nullable=False),
        sa.Column('remarks', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False)
    )

    op.create_table(
        'journal_entries',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True, autoincrement=True),
        sa.Column('company_id', sa.String(), nullable=False),
        sa.Column('entry_no', sa.String(), nullable=False, unique=True),
        sa.Column('entry_date', sa.Date(), nullable=False),
        sa.Column('narration', sa.Text(), nullable=False),
        sa.Column('total_debit', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('total_credit', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('created_by', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False)
    )

    op.create_table(
        'journal_entry_lines',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True, autoincrement=True),
        sa.Column('entry_no', sa.String(), sa.ForeignKey('journal_entries.entry_no', ondelete='CASCADE'), nullable=False),
        sa.Column('ledger_name', sa.String(), nullable=False),
        sa.Column('debit', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('credit', sa.Float(), server_default='0.0', nullable=False)
    )

    op.create_table(
        'ledger_master',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True, autoincrement=True),
        sa.Column('company_id', sa.String(), nullable=False),
        sa.Column('ledger_name', sa.String(), nullable=False, unique=True),
        sa.Column('ledger_group', sa.String(), nullable=False),
        sa.Column('ledger_type', sa.String(), nullable=True),
        sa.Column('gst_no', sa.String(), nullable=True),
        sa.Column('pan_no', sa.String(), nullable=True),
        sa.Column('state', sa.String(), nullable=True),
        sa.Column('opening_balance', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('balance_type', sa.String(), server_default='DR', nullable=False),
        sa.Column('address', sa.Text(), nullable=True),
        sa.Column('phone', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False)
    )

    op.create_table(
        'payment_receipts',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True, autoincrement=True),
        sa.Column('company_id', sa.String(), nullable=False),
        sa.Column('receipt_no', sa.String(), nullable=False, unique=True),
        sa.Column('entry_date', sa.Date(), nullable=False),
        sa.Column('transaction_type', sa.String(), nullable=False),
        sa.Column('party_ledger', sa.String(), nullable=False),
        sa.Column('bank_cash_ledger', sa.String(), nullable=False),
        sa.Column('invoice_no', sa.String(), nullable=True),
        sa.Column('vendor_bill_no', sa.String(), nullable=True),
        sa.Column('amount', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('exchange_rate', sa.Float(), server_default='1.0', nullable=False),
        sa.Column('amount_inr', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('bank_charges', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('adjustment_amount', sa.Float(), server_default='0.0', nullable=False),
        sa.Column('reference_no', sa.String(), nullable=True),
        sa.Column('payment_mode', sa.String(), nullable=False),
        sa.Column('document_path', sa.String(), nullable=True),
        sa.Column('narration', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('approved_by', sa.String(), nullable=True),
        sa.Column('approved_at', sa.DateTime(), nullable=True)
    )

    op.create_table(
        'erp_alert_engine',
        sa.Column('id', sa.Integer(), nullable=False, primary_key=True, autoincrement=True),
        sa.Column('company_id', sa.String(), nullable=False),
        sa.Column('alert_type', sa.String(), nullable=False),
        sa.Column('severity', sa.String(), server_default='WARNING', nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('linked_reference_no', sa.String(), nullable=True),
        sa.Column('is_resolved', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('resolved_by', sa.String(), nullable=True),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False)
    )


def downgrade() -> None:
    op.drop_table('erp_alert_engine')
    op.drop_table('payment_receipts')
    op.drop_table('ledger_master')
    op.drop_table('journal_entry_lines')
    op.drop_table('journal_entries')
    op.drop_table('expense_vouchers')
    op.drop_table('bank_transactions')
    op.drop_table('vendor_payments')
    op.drop_table('customer_receivables')
    op.drop_table('health_certificates')
    op.drop_table('bill_of_ladings')
    op.drop_table('shipping_bills')
    op.drop_table('container_stuffing')
    op.drop_table('packing_lists')
    op.drop_table('commercial_invoices')
    op.drop_table('export_compliance_tracker')
    op.drop_table('export_shipments')