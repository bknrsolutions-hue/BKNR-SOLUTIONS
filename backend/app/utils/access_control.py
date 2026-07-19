"""Canonical account permission helpers shared by middleware and admin flows."""

SUPER_ADMIN_EMAIL = "bknr.solutions@gmail.com"

PERMISSION_ALIASES = {
    "bank_transactions": "bank_transaction",
    "customer_receivables": "customer_receivable",
    "expense_vouchers": "expense_voucher",
    "journal_entries": "journal_entry",
    "payment_receipts": "payment_receipt",
    "vendor_payments": "vendor_payment",
    "export_shipments": "export_shipment",
    "container_logs": "logistics_bills",
}


def normalize_permission(value):
    key = str(value or "").strip()
    return PERMISSION_ALIASES.get(key, key)


def permission_set(value):
    if isinstance(value, (list, tuple, set)):
        raw = value
    else:
        raw = str(value or "").split(",")
    return {normalize_permission(item) for item in raw if str(item or "").strip()}


def has_permission(session, required):
    email = str(session.get("email") or "").strip().lower()
    if email == SUPER_ADMIN_EMAIL:
        return True
    granted = permission_set(session.get("permissions"))
    if "ALL" in granted:
        return True
    choices = required if isinstance(required, (list, tuple, set)) else (required,)
    return any(normalize_permission(choice) in granted for choice in choices)


# Ordered longest/specific prefixes first. A tuple means any listed permission
# grants the supporting endpoint.
ROUTE_PERMISSION_RULES = (
    ("/admin/user-configuration", "add_user"),
    ("/admin/verify_add_user_otp", "add_user"),
    ("/admin/resend_add_user_otp", "add_user"),
    ("/admin/toggle_user/", "add_user"),
    ("/admin/edit_user/", "add_user"),
    ("/admin/add_user", "add_user"),
    ("/admin/user_list", "add_user"),
    ("/admin/role_permissions", "add_user"),
    ("/dashboard/processing_dashboard", "processing_dashboard"),
    ("/dashboard/inventory_dashboard", "inventory_dashboard"),
    ("/dashboard/hr_command_center", "hr_command_center"),
    ("/dashboard/costing_dashboard", "costing_dashboard"),
    ("/dashboard/finance_dashboard", "finance_dashboard"),
    ("/dashboard/processing", "processing_dashboard"),
    ("/dashboard/inventory", "inventory_dashboard"),
    ("/finance_accounts/tally_dashboard", "tally_dashboard"),
    ("/processing/raw_material_purchasing", "raw_material_purchasing"),
    ("/processing/de_heading", "de_heading"),
    ("/processing/gate_entry", "gate_entry"),
    ("/processing/grading", "grading"),
    ("/processing/peeling", "peeling"),
    ("/processing/soaking", "soaking"),
    ("/processing/production", "production"),
    ("/processing/get_rate/", ("de_heading", "peeling")),
    ("/inventory/stock_entry", "stock_entry"),
    ("/inventory/pending_orders", "pending_orders"),
    ("/inventory/cold_storage_holding_report", "cold_storage_holding_report"),
    ("/inventory/cold_storage_holding", "cold_storage_holding"),
    ("/inventory/cold_storage", "cold_storage"),
    ("/inventory/stock_report", ("inventory_report", "processing_dashboard", "production", "stock_entry")),
    ("/inventory/sales_report", "sales_report"),
    ("/inventory/inventory_report", "inventory_report"),
    ("/inventory/get_matched_coldstores", ("stock_entry", "cold_storage_holding")),
    ("/inventory/get_storing_batches", "stock_entry"),
    ("/inventory/stock_out_report", "stock_entry"),
    ("/general_stock/entry", "general_store_entry"),
    ("/general_stock/report", "gs_report"),
    ("/general_stock/items", "general_store_items"),
    ("/reports/floor_balance_report", ("floor_balance_report", "processing_dashboard")),
    ("/reports/raw_material_purchasing", "rmp_report"),
    ("/reports/pending_orders_report", "pending_orders_report"),
    ("/reports/storage_cost_report", "storage_cost_report"),
    ("/reports/production_report", "production_report"),
    ("/reports/grading_report", "grading_report"),
    ("/reports/peeling_report", "peeling_report"),
    ("/reports/soaking_report", "soaking_report"),
    ("/reports/re-process", "reprocess_report"),
    ("/reports/de_heading", "de_heading_report"),
    ("/reports/gate_entry", "gate_entry_report"),
    ("/summary/floor_balance_value", "floor_balance_value"),
    ("/summary/inventory_costing", "inventory_costing"),
    ("/summary/periodic-report", "periodic_summary"),
    ("/summary/processing", "batch_summary"),
    ("/attendance/employee/register", "employee_registration"),
    ("/attendance/employee-increment", "employee_increment"),
    ("/attendance/salary/monthly-sheet", "salary_report"),
    ("/attendance/salary-advance", "salary_advance"),
    ("/attendance/tax-master", "tax_master"),
    ("/attendance/daily", "daily_attendance"),
    ("/attendance/today_all", "daily_attendance"),
    ("/attendance/entry", "daily_attendance"),
    ("/attendance/audit_all", "daily_attendance"),
    ("/criteria/api/buyer_agents", "buyer_agents"),
    ("/criteria/api/coldstore_locations", "coldstore_locations"),
    ("/criteria/api/production_types", "production_types"),
    ("/criteria/api/production_for", "production_for"),
    ("/criteria/api/production_at", "production_at"),
    ("/criteria/api/peeling_rates", "peeling_rates"),
    ("/criteria/api/packing_styles", "packing_styles"),
    ("/criteria/api/vehicle_numbers", "vehicle_numbers"),
    ("/criteria/api/cold_storage", "cold_storage"),
    ("/criteria/api/contractors", "contractors"),
    ("/criteria/api/chemicals", "chemicals"),
    ("/criteria/api/countries", "countries"),
    ("/criteria/api/suppliers", "suppliers"),
    ("/criteria/api/purposes", "purposes"),
    ("/criteria/api/hsn_codes", "hsn_codes"),
    ("/criteria/api/buyers", "buyers"),
    ("/criteria/api/freezers", "freezers"),
    ("/criteria/api/varieties", "varieties"),
    ("/criteria/api/species", "species"),
    ("/criteria/api/grades", "grades"),
    ("/criteria/api/glazes", "glazes"),
    ("/criteria/api/brands", "brands"),
    ("/criteria/api/vendors", "vendors"),
    ("/criteria/api/peeling_at", "peeling_at"),
    ("/criteria/api/grade_to_hoso", "grade_to_hoso"),
    ("/criteria/api/hoso_hlso", "hoso_hlso"),
    ("/criteria/buyer_agents", "buyer_agents"),
    ("/criteria/coldstore_locations", "coldstore_locations"),
    ("/criteria/production_types", "production_types"),
    ("/criteria/production_for", "production_for"),
    ("/criteria/production_at", "production_at"),
    ("/criteria/peeling_rates", "peeling_rates"),
    ("/criteria/packing_styles", "packing_styles"),
    ("/criteria/vehicle_numbers", "vehicle_numbers"),
    ("/criteria/contractors", "contractors"),
    ("/criteria/chemicals", "chemicals"),
    ("/criteria/countries", "countries"),
    ("/criteria/suppliers", "suppliers"),
    ("/criteria/purposes", "purposes"),
    ("/criteria/hsn_codes", "hsn_codes"),
    ("/criteria/freezers", "freezers"),
    ("/criteria/varieties", "varieties"),
    ("/criteria/species", "species"),
    ("/criteria/grades", "grades"),
    ("/criteria/glazes", "glazes"),
    ("/criteria/brands", "brands"),
    ("/criteria/buyers", "buyers"),
    ("/criteria/vendors", "vendors"),
    ("/criteria/peeling_at", "peeling_at"),
    ("/criteria/grade_to_hoso", "grade_to_hoso"),
    ("/criteria/hoso_hlso", "hoso_hlso"),
    ("/finance_accounts/accounts_flow_guide", "accounts_flow_guide"),
    ("/finance_accounts/customer_receivable", "customer_receivable"),
    ("/finance_accounts/vendor_payment", "vendor_payment"),
    ("/finance_accounts/expense_voucher", "expense_voucher"),
    ("/finance_accounts/export_incentive_register", "export_incentive_register"),
    ("/finance_accounts/production_cost_allocation", "production_cost_allocation"),
    ("/finance_accounts/salary_processing", "salary_processing"),
    ("/finance_accounts/bank_transaction", "bank_transaction"),
    ("/finance_accounts/payment_receipt", "payment_receipt"),
    ("/finance_accounts/item_accounting_link", "item_accounting_link"),
    ("/finance_accounts/journal_entry", "journal_entry"),
    ("/finance_accounts/ledger_master", "ledger_master"),
    ("/finance_accounts/bank_master", "bank_master"),
    ("/finance_accounts/fixed_assets", "fixed_assets"),
    ("/finance_accounts/gst_register", "gst_register"),
    ("/finance_accounts/lc_tracking", "lc_tracking"),
    ("/api/electricity", "electricity_bills"),
    ("/api/diesel", "diesel_bills"),
    ("/api/purchase", "packaging_bills"),
    ("/api/container", "logistics_bills"),
    ("/api/contractor_bills", "contractor_bills"),
    ("/api/salaries", "salaries"),
    ("/api/vendor_bills", "vendor_bills"),
    ("/api/supplier_bills", "supplier_bills"),
    ("/api/payment_logs", "payment_logs"),
    ("/api/qa", "qa_testing"),
    ("/api/expenses", "other_expenses"),
    ("/export_documents/dashboard", "export_documents_dashboard"),
    ("/export_documents/export_shipment", "export_shipment"),
    ("/export_documents/proforma_invoice", "proforma_invoice"),
    ("/export_documents/commercial_invoice", "commercial_invoice"),
    ("/export_documents/packing_list", "packing_list"),
    ("/export_documents/container_stuffing", "container_stuffing"),
    ("/export_documents/shipping_bill", "shipping_bill"),
    ("/export_documents/bill_of_lading", "bill_of_lading"),
    ("/export_documents/health_certificate", "health_certificate"),
    ("/export_documents/supporting_documents", "export_supporting_documents"),
    ("/export_documents/requirement-pages", "export_supporting_documents"),
)


def required_permission_for_path(path, method="GET"):
    normalized = str(path or "").rstrip("/") or "/"
    # Master data is shared reference data for assigned operational forms.
    # Reading dropdown values is safe for every authenticated account; writes
    # continue through the matching master permission below.
    if normalized.startswith("/criteria/api/") and str(method).upper() == "GET":
        return None
    for prefix, permission in ROUTE_PERMISSION_RULES:
        if normalized == prefix.rstrip("/") or normalized.startswith(prefix):
            return permission
    return None
