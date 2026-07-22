"""
app/routers/page_tokens.py
──────────────────────────
Opaque page token resolver for the React ERP frontend.

Token → {page_id, backend_route} mapping lives here on the server.
Real security is enforced by:
  1. Session authentication  (AuthMiddleware in main.py)
  2. Permission check         (has_permission() below)
  3. Tenant isolation         (company_code in session vs. all DB queries)

Tokens are NOT cryptographic secrets; they just keep internal route
paths out of browser URLs and server logs.
"""
from fastapi import APIRouter, Request, Query, HTTPException
from fastapi.responses import JSONResponse
from app.utils.access_control import has_permission, SUPER_ADMIN_EMAIL

router = APIRouter(prefix="/nav", tags=["Navigation"])

# ─────────────────────────────────────────────────────────────────────────────
# ROUTE_TOKENS  –  single source of truth for all navigable pages.
#
# Schema per entry:
#   page_id    : internal React page identifier (matches CRITERIA_COMPONENTS key
#                or activePage string in App.jsx)
#   backend    : FastAPI route the page loads data from; None for pure-React pages
#   permission : permission key checked against session; None = any logged-in user
# ─────────────────────────────────────────────────────────────────────────────
ROUTE_TOKENS: dict[str, dict] = {
    # ── Dashboards ──────────────────────────────────────────────────────────
    "dash_proc":    {"page_id": "dashboard_processing",             "backend": None,                                           "permission": "processing_dashboard"},
    "dash_inv":     {"page_id": "dashboard_inventory",              "backend": None,                                           "permission": "inventory_dashboard"},
    "dash_hr":      {"page_id": "dashboard_hr",                     "backend": None,                                           "permission": "hr_command_center"},
    "dash_cost":    {"page_id": "dashboard_costing",                "backend": None,                                           "permission": "costing_dashboard"},
    "dash_fin":     {"page_id": "dashboard_finance",                "backend": None,                                           "permission": "finance_dashboard"},
    "dash_tally":   {"page_id": "tally_dashboard",                  "backend": "/finance_accounts/tally_dashboard",            "permission": "tally_dashboard"},

    # ── Processing Operations ────────────────────────────────────────────────
    "ops_ge":       {"page_id": "gate_entry",                       "backend": "/processing/gate_entry",                      "permission": "gate_entry"},
    "ops_rmp":      {"page_id": "raw_material_purchasing",          "backend": "/processing/raw_material_purchasing",          "permission": "raw_material_purchasing"},
    "ops_dh":       {"page_id": "de_heading",                       "backend": "/processing/de_heading",                      "permission": "de_heading"},
    "ops_grd":      {"page_id": "grading",                          "backend": "/processing/grading",                         "permission": "grading"},
    "ops_pel":      {"page_id": "peeling",                          "backend": "/processing/peeling",                         "permission": "peeling"},
    "ops_soak":     {"page_id": "soaking",                          "backend": "/processing/soaking",                         "permission": "soaking"},
    "ops_prod":     {"page_id": "production",                       "backend": "/processing/production",                      "permission": "production"},
    "ops_preg":     {"page_id": "processing_registers",             "backend": "/registers/processing",                       "permission": "gate_entry"},

    # ── Inventory Operations ─────────────────────────────────────────────────
    "inv_se":       {"page_id": "stock_entry",                      "backend": "/inventory/stock_entry",                      "permission": "stock_entry"},
    "inv_po":       {"page_id": "pending_orders",                   "backend": "/inventory/pending_orders",                   "permission": "pending_orders"},
    "inv_cs":       {"page_id": "cold_storage_holding",             "backend": "/inventory/cold_storage_holding",             "permission": "cold_storage_holding"},
    "inv_gse":      {"page_id": "general_stock_entry",              "backend": "/general_stock/entry",                        "permission": "general_store_entry"},
    "inv_ireg":     {"page_id": "inventory_registers",              "backend": "/registers/inventory",                        "permission": "stock_entry"},

    # ── Export Documents ─────────────────────────────────────────────────────
    "exp_dash":     {"page_id": "export_documents_dashboard",       "backend": "/export_documents/dashboard",                 "permission": "export_documents_dashboard"},
    "exp_ws":       {"page_id": "export_shipment_workspace",        "backend": "/export_documents/workspace",                 "permission": "export_documents_dashboard"},
    "exp_dc":       {"page_id": "export_requirement_forms",         "backend": "/export_documents/requirement-pages/entry",   "permission": "export_documents_dashboard"},
    "exp_appr":     {"page_id": "export_document_approvals",        "backend": "/export_documents/approvals",                 "permission": "export_documents_dashboard"},
    "exp_reg":      {"page_id": "export_registers",                 "backend": "/export_documents/registers",                 "permission": "export_documents_dashboard"},
    "exp_pi":       {"page_id": "proforma_invoice",                 "backend": "/export_documents/proforma_invoice/entry",    "permission": "proforma_invoice"},
    "exp_es":       {"page_id": "export_shipment",                  "backend": "/export_documents/export_shipment/entry",     "permission": "export_shipment"},
    "exp_ci":       {"page_id": "commercial_invoice",               "backend": "/export_documents/commercial_invoice/entry",  "permission": "commercial_invoice"},
    "exp_pl":       {"page_id": "packing_list",                     "backend": "/export_documents/packing_list/entry",        "permission": "packing_list"},
    "exp_ct":       {"page_id": "container_stuffing",               "backend": "/export_documents/container_stuffing/entry",  "permission": "container_stuffing"},
    "exp_sb":       {"page_id": "shipping_bill",                    "backend": "/export_documents/shipping_bill/entry",       "permission": "shipping_bill"},
    "exp_bl":       {"page_id": "bill_of_lading",                   "backend": "/export_documents/bill_of_lading/entry",      "permission": "bill_of_lading"},
    "exp_hc":       {"page_id": "health_certificate",               "backend": "/export_documents/health_certificate/entry",  "permission": "health_certificate"},
    "exp_sd":       {"page_id": "export_supporting_documents",      "backend": "/export_documents/supporting_documents/entry","permission": "export_supporting_documents"},

    # ── Finance – Operational Bills ──────────────────────────────────────────
    "fin_eb":       {"page_id": "finance_electricity_bills",        "backend": "/api/electricity/entry",                      "permission": "electricity_bills"},
    "fin_db":       {"page_id": "finance_diesel_bills",             "backend": "/api/diesel/entry",                           "permission": "diesel_bills"},
    "fin_pkg":      {"page_id": "finance_packaging_bills",          "backend": "/api/purchase/entry",                         "permission": "packaging_bills"},
    "fin_logi":     {"page_id": "finance_logistics_bills",          "backend": "/api/container/entry",                        "permission": "logistics_bills"},
    "fin_cb":       {"page_id": "finance_contractor_bills",         "backend": "/api/contractor_bills/entry",                 "permission": "contractor_bills"},
    "fin_sal":      {"page_id": "finance_salaries",                 "backend": "/api/salaries/entry",                         "permission": "salaries"},
    "fin_vb":       {"page_id": "finance_vendor_bills",             "backend": "/api/vendor_bills/entry",                     "permission": "vendor_bills"},
    "fin_sub":      {"page_id": "finance_supplier_bills",           "backend": "/api/supplier_bills/entry",                   "permission": "supplier_bills"},
    "fin_plog":     {"page_id": "finance_payment_logs",             "backend": "/api/payment_logs/entry",                     "permission": "payment_logs"},
    "fin_qa":       {"page_id": "finance_qa_testing",               "backend": "/api/qa/entry",                               "permission": "qa_testing"},
    "fin_oe":       {"page_id": "finance_other_expenses",           "backend": "/api/expenses/entry",                         "permission": "other_expenses"},

    # ── Finance – Accounts & Ledgers ─────────────────────────────────────────
    "acc_afg":      {"page_id": "finance_accounts_flow_guide",      "backend": "/finance_accounts/accounts_flow_guide",       "permission": "accounts_flow_guide"},
    "acc_lm":       {"page_id": "finance_ledger_master",            "backend": "/finance_accounts/ledger_master/entry",       "permission": "ledger_master"},
    "acc_je":       {"page_id": "finance_journal_entry",            "backend": "/finance_accounts/journal_entry/entry",       "permission": "journal_entry"},
    "acc_bm":       {"page_id": "finance_bank_master",              "backend": "/finance_accounts/bank_master/entry",         "permission": "bank_master"},
    "acc_ial":      {"page_id": "finance_item_accounting_link",     "backend": "/finance_accounts/item_accounting_link/entry","permission": "item_accounting_link"},
    "acc_fa":       {"page_id": "finance_fixed_assets",             "backend": "/finance_accounts/fixed_assets/entry",        "permission": "fixed_assets"},
    "acc_gst":      {"page_id": "finance_gst_register",             "backend": "/finance_accounts/gst_register/entry",        "permission": "gst_register"},
    "acc_cr":       {"page_id": "finance_customer_receivable",      "backend": "/finance_accounts/customer_receivable/entry", "permission": "customer_receivable"},
    "acc_vp":       {"page_id": "finance_vendor_payment",           "backend": "/finance_accounts/vendor_payment/entry",      "permission": "vendor_payment"},
    "acc_ev":       {"page_id": "finance_expense_voucher",          "backend": "/finance_accounts/expense_voucher/entry",     "permission": "expense_voucher"},
    "acc_areg":     {"page_id": "accounts_registers",               "backend": "/registers/accounts",                         "permission": "ledger_master"},

    # ── Finance – Cash & Banking ─────────────────────────────────────────────
    "bnk_bt":       {"page_id": "finance_bank_transaction",         "backend": "/finance_accounts/bank_transaction/entry",    "permission": "bank_transaction"},
    "bnk_pr":       {"page_id": "finance_payment_receipt",          "backend": "/finance_accounts/payment_receipt/entry",     "permission": "payment_receipt"},

    # ── Finance – Integrated Finance ─────────────────────────────────────────
    "intfin_ei":    {"page_id": "finance_export_incentive_register","backend": "/finance_accounts/export_incentive_register/entry","permission": "export_incentive_register"},
    "intfin_lc":    {"page_id": "finance_lc_tracking",              "backend": "/finance_accounts/lc_tracking/entry",         "permission": "lc_tracking"},
    "intfin_pca":   {"page_id": "finance_production_cost_allocation","backend": "/finance_accounts/production_cost_allocation/entry","permission": "production_cost_allocation"},

    # ── Reports – Processing ─────────────────────────────────────────────────
    "rpt_ge":       {"page_id": "report_gate_entry_report",         "backend": "/reports/gate_entry",                         "permission": "gate_entry_report"},
    "rpt_rmp":      {"page_id": "report_rmp_report",                "backend": "/reports/raw_material_purchasing",            "permission": "rmp_report"},
    "rpt_dh":       {"page_id": "report_de_heading_report",         "backend": "/reports/de_heading",                         "permission": "de_heading_report"},
    "rpt_grd":      {"page_id": "report_grading_report",            "backend": "/reports/grading_report",                     "permission": "grading_report"},
    "rpt_pel":      {"page_id": "report_peeling_report",            "backend": "/reports/peeling_report",                     "permission": "peeling_report"},
    "rpt_soak":     {"page_id": "report_soaking_report",            "backend": "/reports/soaking_report",                     "permission": "soaking_report"},
    "rpt_prod":     {"page_id": "report_production_report",         "backend": "/reports/production_report",                  "permission": "production_report"},
    "rpt_repr":     {"page_id": "report_reprocess_report",          "backend": "/reports/re-process",                         "permission": "reprocess_report"},

    # ── Reports – Inventory ──────────────────────────────────────────────────
    "rpt_fb":       {"page_id": "report_floor_balance_report",      "backend": "/reports/floor_balance_report",               "permission": "floor_balance_report"},
    "rpt_inv":      {"page_id": "report_inventory_report",          "backend": "/inventory/stock_report",                     "permission": "inventory_report"},
    "rpt_por":      {"page_id": "report_pending_orders_report",     "backend": "/reports/pending_orders_report",              "permission": "pending_orders_report"},
    "rpt_sales":    {"page_id": "report_sales_report",              "backend": "/inventory/sales_report",                     "permission": "sales_report"},
    "rpt_gs":       {"page_id": "report_gs_report",                 "backend": "/general_stock/report",                       "permission": "gs_report"},
    "rpt_csh":      {"page_id": "report_cold_storage_holding_report","backend": "/inventory/cold_storage_holding_report",      "permission": "cold_storage_holding_report"},

    # ── Reports – Costing ────────────────────────────────────────────────────
    "rpt_sc":       {"page_id": "report_storage_cost_report",       "backend": "/reports/storage_cost_report",                "permission": "storage_cost_report"},
    "rpt_fbv":      {"page_id": "report_floor_balance_value",       "backend": "/summary/floor_balance_value",                "permission": "floor_balance_value"},
    "rpt_ic":       {"page_id": "report_inventory_costing",         "backend": "/summary/inventory_costing",                  "permission": "inventory_costing"},
    "rpt_ps":       {"page_id": "report_periodic_summary",          "backend": "/summary/periodic-report",                    "permission": "periodic_summary"},
    "rpt_bs":       {"page_id": "report_batch_summary",             "backend": "/summary/processing",                         "permission": "batch_summary"},

    # ── HRMS ─────────────────────────────────────────────────────────────────
    "hr_er":        {"page_id": "attendance_employee_register",     "backend": "/attendance/employee/register",               "permission": "employee_registration"},
    "hr_ei":        {"page_id": "attendance_employee_increment",    "backend": "/attendance/employee-increment",              "permission": "employee_increment"},
    "hr_da":        {"page_id": "attendance_daily_attendance",      "backend": "/attendance/daily",                           "permission": "daily_attendance"},
    "hr_lm":        {"page_id": "attendance_labour_management",     "backend": "/attendance/labour-management",               "permission": "labour_management"},
    "hr_kgl":       {"page_id": "attendance_kg_basis_labour",       "backend": "/attendance/kg-basis-labour",                  "permission": "kg_basis_labour"},
    "hr_vdw":       {"page_id": "attendance_visitors_day_workers",  "backend": "/attendance/visitors-day-workers",             "permission": "visitors_day_workers"},
    "hr_ss":        {"page_id": "attendance_salary_report",         "backend": "/attendance/salary/monthly-sheet",            "permission": "salary_report"},
    "hr_tm":        {"page_id": "attendance_tax_master",            "backend": "/attendance/tax-master",                      "permission": "tax_master"},
    "hr_sa":        {"page_id": "attendance_salary_advance",        "backend": "/attendance/salary-advance",                  "permission": "salary_advance"},
    "hr_sp":        {"page_id": "finance_salary_processing",        "backend": "/finance_accounts/salary_processing/entry",   "permission": "salary_processing"},
    "hr_reg":       {"page_id": "hrms_registers",                   "backend": "/registers/hrms",                             "permission": "employee_registration"},

    # ── Masters – Business ───────────────────────────────────────────────────
    "mst_byr":      {"page_id": "criteria_buyers",                  "backend": "/criteria/buyers",                            "permission": "buyers"},
    "mst_bya":      {"page_id": "criteria_buyer_agents",            "backend": "/criteria/buyer_agents",                      "permission": "buyer_agents"},
    "mst_sup":      {"page_id": "criteria_suppliers",               "backend": "/criteria/suppliers",                         "permission": "suppliers"},
    "mst_vnd":      {"page_id": "criteria_vendors",                 "backend": "/criteria/vendors",                           "permission": "vendors"},
    "mst_cty":      {"page_id": "criteria_countries",               "backend": "/criteria/countries",                         "permission": "countries"},
    "mst_brd":      {"page_id": "criteria_brands",                  "backend": "/criteria/brands",                            "permission": "brands"},

    # ── Masters – Production ─────────────────────────────────────────────────
    "mst_spc":      {"page_id": "criteria_species",                 "backend": "/criteria/species",                           "permission": "species"},
    "mst_var":      {"page_id": "criteria_varieties",               "backend": "/criteria/varieties",                         "permission": "varieties"},
    "mst_grd":      {"page_id": "criteria_grades",                  "backend": "/criteria/grades",                            "permission": "grades"},
    "mst_frz":      {"page_id": "criteria_freezers",                "backend": "/criteria/freezers",                          "permission": "freezers"},
    "mst_glz":      {"page_id": "criteria_glazes",                  "backend": "/criteria/glazes",                            "permission": "glazes"},
    "mst_pks":      {"page_id": "criteria_packing_styles",          "backend": "/criteria/packing_styles",                    "permission": "packing_styles"},
    "mst_con":      {"page_id": "criteria_contractors",             "backend": "/criteria/contractors",                       "permission": "contractors"},
    "mst_pat":      {"page_id": "criteria_peeling_at",              "backend": "/criteria/peeling_at",                        "permission": "peeling_at"},
    "mst_prt":      {"page_id": "criteria_peeling_rates",           "backend": "/criteria/peeling_rates",                     "permission": "peeling_rates"},
    "mst_kgl":      {"page_id": "criteria_kg_basis_labour_rates",   "backend": "/criteria/api/kg_basis_labour_rates",          "permission": "kg_basis_labour_rates"},
    "mst_pra":      {"page_id": "criteria_production_at",           "backend": "/criteria/production_at",                     "permission": "production_at"},
    "pf_8Kx92LmQ":  {"page_id": "criteria_production_for",          "backend": "/criteria/production_for",                    "permission": "production_for"},
    "mst_prt2":     {"page_id": "criteria_production_types",        "backend": "/criteria/production_types",                  "permission": "production_types"},
    "mst_chem":     {"page_id": "criteria_chemicals",               "backend": "/criteria/chemicals",                         "permission": "chemicals"},
    "mst_purp":     {"page_id": "criteria_purposes",                "backend": "/criteria/purposes",                          "permission": "purposes"},
    "mst_gth":      {"page_id": "criteria_grade_to_hoso",           "backend": "/criteria/grade_to_hoso",                     "permission": "grade_to_hoso"},
    "mst_hh":       {"page_id": "criteria_hoso_hlso",               "backend": "/criteria/hoso_hlso",                         "permission": "hoso_hlso"},

    # ── Masters – Inv & Fin ───────────────────────────────────────────────────
    "mst_cs":       {"page_id": "criteria_cold_storage",            "backend": "/inventory/cold_storage",                     "permission": "cold_storage"},
    "mst_csl":      {"page_id": "criteria_coldstore_locations",     "backend": "/criteria/coldstore_locations",               "permission": "coldstore_locations"},
    "mst_veh":      {"page_id": "criteria_vehicle_numbers",         "backend": "/criteria/vehicle_numbers",                   "permission": "vehicle_numbers"},
    "mst_hsn":      {"page_id": "criteria_hsn_codes",               "backend": "/criteria/hsn_codes",                         "permission": "hsn_codes"},
    "mst_gsi":      {"page_id": "criteria_general_store_items",     "backend": "/general_stock/items",                        "permission": "general_store_items"},
    "mst_swv":      {"page_id": "criteria_shipping_vendors",        "backend": "/criteria/shipping_vendors",                  "permission": "shipping_vendors"},

    # ── Admin ─────────────────────────────────────────────────────────────────
    "adm_usr":      {"page_id": "admin_add_user",                   "backend": "/admin/add_user",                             "permission": "add_user"},
    "adm_shf":      {"page_id": "admin_shifts",                     "backend": "/attendance/shifts",                          "permission": "shifts"},
    "adm_dm":       {"page_id": "admin_data_management",            "backend": "/data-management",                            "permission": "data_management"},
    "adm_sys":      {"page_id": "admin_system_settings",            "backend": "/admin/system_settings",                      "permission": "system_settings"},
    "adm_arc":      {"page_id": "admin_system_architecture",        "backend": "/admin/system_architecture",                  "permission": "system_architecture"},

    # ── Support / Helpdesk (open in drawer, not full page) ────────────────────
    "sup_tkt":      {"page_id": "admin_raise_ticket",               "backend": "/support/my_tickets",                         "permission": None},
    "sup_hd":       {"page_id": "admin_helpdesk",                   "backend": "/admin/all_tickets",                          "permission": "admin_helpdesk"},
    "sup_team":     {"page_id": "admin_manage_support",             "backend": "/admin/support_team",                         "permission": "manage_support"},
    "sup_act":      {"page_id": "admin_user_activity",              "backend": "/admin/activities",                           "permission": "user_activity"},

    # ── Profile ───────────────────────────────────────────────────────────────
    "my_profile":   {"page_id": "user_profile",                     "backend": None,                                          "permission": None},
}

# Reverse lookup: page_id → token  (first match wins for page_ids with multiple tokens)
PAGE_ID_TO_TOKEN: dict[str, str] = {}
for _tok, _entry in ROUTE_TOKENS.items():
    PAGE_ID_TO_TOKEN.setdefault(_entry["page_id"], _tok)


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/resolve")
async def resolve_page_token(
    request: Request,
    token: str = Query(..., description="Opaque page token"),
):
    """
    Resolve an opaque page token to {page_id, backend}.

    - 401 if session is not authenticated
    - 404 if the token is unknown
    - 403 if the logged-in user lacks the required permission
    - 200 {page_id, backend} on success
    """
    email = request.session.get("email")
    if not email:
        raise HTTPException(status_code=401, detail="Not authenticated")

    entry = ROUTE_TOKENS.get(token)
    if not entry:
        raise HTTPException(status_code=404, detail="Unknown page token")

    required_perm = entry.get("permission")
    if required_perm:
        is_super = str(email).strip().lower() == SUPER_ADMIN_EMAIL
        if not is_super and not has_permission(request.session, required_perm):
            raise HTTPException(status_code=403, detail="Permission denied")

    return JSONResponse({"page_id": entry["page_id"], "backend": entry["backend"]})
