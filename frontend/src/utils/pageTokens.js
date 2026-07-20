/**
 * src/utils/pageTokens.js
 * ────────────────────────
 * Client-side copy of the server's ROUTE_TOKENS registry.
 *
 * Why keep a frontend copy?
 *   • Zero-latency navigation  — Sidebar / Header clicks resolve instantly
 *     without an API round-trip.
 *   • The token is NOT a secret; real security lives in the backend session
 *     checks and the existing AuthMiddleware permission guards.
 *
 * Keep this file in sync with backend/app/routers/page_tokens.py whenever
 * new pages are added.
 */

/**
 * TOKEN_MAP
 * Maps opaque token → { page_id, backend }
 *   page_id : internal React page identifier (used by App.jsx renderActivePage)
 *   backend  : FastAPI route the page loads; null for pure-React pages
 */
export const TOKEN_MAP = {
  // ── Dashboards ────────────────────────────────────────────────────────────
  dash_proc:    { page_id: 'dashboard_processing',             backend: null },
  dash_inv:     { page_id: 'dashboard_inventory',              backend: null },
  dash_hr:      { page_id: 'dashboard_hr',                     backend: null },
  dash_cost:    { page_id: 'dashboard_costing',                backend: null },
  dash_fin:     { page_id: 'dashboard_finance',                backend: null },
  dash_tally:   { page_id: 'tally_dashboard',                  backend: '/finance_accounts/tally_dashboard' },

  // ── Processing Operations ─────────────────────────────────────────────────
  ops_ge:       { page_id: 'gate_entry',                       backend: '/processing/gate_entry' },
  ops_rmp:      { page_id: 'raw_material_purchasing',          backend: '/processing/raw_material_purchasing' },
  ops_dh:       { page_id: 'de_heading',                       backend: '/processing/de_heading' },
  ops_grd:      { page_id: 'grading',                          backend: '/processing/grading' },
  ops_pel:      { page_id: 'peeling',                          backend: '/processing/peeling' },
  ops_soak:     { page_id: 'soaking',                          backend: '/processing/soaking' },
  ops_prod:     { page_id: 'production',                       backend: '/processing/production' },
  ops_preg:     { page_id: 'processing_registers',             backend: '/registers/processing' },

  // ── Inventory Operations ──────────────────────────────────────────────────
  inv_se:       { page_id: 'stock_entry',                      backend: '/inventory/stock_entry' },
  inv_po:       { page_id: 'pending_orders',                   backend: '/inventory/pending_orders' },
  inv_cs:       { page_id: 'cold_storage_holding',             backend: '/inventory/cold_storage_holding' },
  inv_gse:      { page_id: 'general_stock_entry',              backend: '/general_stock/entry' },
  inv_ireg:     { page_id: 'inventory_registers',              backend: '/registers/inventory' },

  // ── Export Documents ──────────────────────────────────────────────────────
  exp_dash:     { page_id: 'export_documents_dashboard',       backend: '/export_documents/dashboard' },
  exp_ws:       { page_id: 'export_shipment_workspace',        backend: '/export_documents/workspace' },
  exp_dc:       { page_id: 'export_requirement_forms',         backend: '/export_documents/requirement-pages/entry' },
  exp_appr:     { page_id: 'export_document_approvals',        backend: '/export_documents/approvals' },
  exp_reg:      { page_id: 'export_registers',                 backend: '/export_documents/registers' },
  exp_pi:       { page_id: 'proforma_invoice',                 backend: '/export_documents/proforma_invoice/entry' },
  exp_es:       { page_id: 'export_shipment',                  backend: '/export_documents/export_shipment/entry' },
  exp_ci:       { page_id: 'commercial_invoice',               backend: '/export_documents/commercial_invoice/entry' },
  exp_pl:       { page_id: 'packing_list',                     backend: '/export_documents/packing_list/entry' },
  exp_ct:       { page_id: 'container_stuffing',               backend: '/export_documents/container_stuffing/entry' },
  exp_sb:       { page_id: 'shipping_bill',                    backend: '/export_documents/shipping_bill/entry' },
  exp_bl:       { page_id: 'bill_of_lading',                   backend: '/export_documents/bill_of_lading/entry' },
  exp_hc:       { page_id: 'health_certificate',               backend: '/export_documents/health_certificate/entry' },
  exp_sd:       { page_id: 'export_supporting_documents',      backend: '/export_documents/supporting_documents/entry' },

  // ── Finance – Operational Bills ───────────────────────────────────────────
  fin_eb:       { page_id: 'finance_electricity_bills',        backend: '/api/electricity/entry' },
  fin_db:       { page_id: 'finance_diesel_bills',             backend: '/api/diesel/entry' },
  fin_pkg:      { page_id: 'finance_packaging_bills',          backend: '/api/purchase/entry' },
  fin_logi:     { page_id: 'finance_logistics_bills',          backend: '/api/container/entry' },
  fin_cb:       { page_id: 'finance_contractor_bills',         backend: '/api/contractor_bills/entry' },
  fin_sal:      { page_id: 'finance_salaries',                 backend: '/api/salaries/entry' },
  fin_vb:       { page_id: 'finance_vendor_bills',             backend: '/api/vendor_bills/entry' },
  fin_sub:      { page_id: 'finance_supplier_bills',           backend: '/api/supplier_bills/entry' },
  fin_plog:     { page_id: 'finance_payment_logs',             backend: '/api/payment_logs/entry' },
  fin_qa:       { page_id: 'finance_qa_testing',               backend: '/api/qa/entry' },
  fin_oe:       { page_id: 'finance_other_expenses',           backend: '/api/expenses/entry' },

  // ── Finance – Accounts & Ledgers ──────────────────────────────────────────
  acc_afg:      { page_id: 'finance_accounts_flow_guide',      backend: '/finance_accounts/accounts_flow_guide' },
  acc_lm:       { page_id: 'finance_ledger_master',            backend: '/finance_accounts/ledger_master/entry' },
  acc_je:       { page_id: 'finance_journal_entry',            backend: '/finance_accounts/journal_entry/entry' },
  acc_bm:       { page_id: 'finance_bank_master',              backend: '/finance_accounts/bank_master/entry' },
  acc_ial:      { page_id: 'finance_item_accounting_link',     backend: '/finance_accounts/item_accounting_link/entry' },
  acc_fa:       { page_id: 'finance_fixed_assets',             backend: '/finance_accounts/fixed_assets/entry' },
  acc_gst:      { page_id: 'finance_gst_register',             backend: '/finance_accounts/gst_register/entry' },
  acc_cr:       { page_id: 'finance_customer_receivable',      backend: '/finance_accounts/customer_receivable/entry' },
  acc_vp:       { page_id: 'finance_vendor_payment',           backend: '/finance_accounts/vendor_payment/entry' },
  acc_ev:       { page_id: 'finance_expense_voucher',          backend: '/finance_accounts/expense_voucher/entry' },
  acc_areg:     { page_id: 'accounts_registers',               backend: '/registers/accounts' },

  // ── Finance – Cash & Banking ──────────────────────────────────────────────
  bnk_bt:       { page_id: 'finance_bank_transaction',         backend: '/finance_accounts/bank_transaction/entry' },
  bnk_pr:       { page_id: 'finance_payment_receipt',          backend: '/finance_accounts/payment_receipt/entry' },

  // ── Finance – Integrated Finance ──────────────────────────────────────────
  intfin_ei:    { page_id: 'finance_export_incentive_register',backend: '/finance_accounts/export_incentive_register/entry' },
  intfin_lc:    { page_id: 'finance_lc_tracking',              backend: '/finance_accounts/lc_tracking/entry' },
  intfin_pca:   { page_id: 'finance_production_cost_allocation',backend: '/finance_accounts/production_cost_allocation/entry' },

  // ── Reports – Processing ──────────────────────────────────────────────────
  rpt_ge:       { page_id: 'report_gate_entry_report',         backend: '/reports/gate_entry' },
  rpt_rmp:      { page_id: 'report_rmp_report',                backend: '/reports/raw_material_purchasing' },
  rpt_dh:       { page_id: 'report_de_heading_report',         backend: '/reports/de_heading' },
  rpt_grd:      { page_id: 'report_grading_report',            backend: '/reports/grading_report' },
  rpt_pel:      { page_id: 'report_peeling_report',            backend: '/reports/peeling_report' },
  rpt_soak:     { page_id: 'report_soaking_report',            backend: '/reports/soaking_report' },
  rpt_prod:     { page_id: 'report_production_report',         backend: '/reports/production_report' },
  rpt_repr:     { page_id: 'report_reprocess_report',          backend: '/reports/re-process' },

  // ── Reports – Inventory ───────────────────────────────────────────────────
  rpt_fb:       { page_id: 'report_floor_balance_report',      backend: '/reports/floor_balance_report' },
  rpt_inv:      { page_id: 'report_inventory_report',          backend: '/inventory/stock_report' },
  rpt_por:      { page_id: 'report_pending_orders_report',     backend: '/reports/pending_orders_report' },
  rpt_sales:    { page_id: 'report_sales_report',              backend: '/inventory/sales_report' },
  rpt_gs:       { page_id: 'report_gs_report',                 backend: '/general_stock/report' },
  rpt_csh:      { page_id: 'report_cold_storage_holding_report',backend: '/inventory/cold_storage_holding_report' },

  // ── Reports – Costing ─────────────────────────────────────────────────────
  rpt_sc:       { page_id: 'report_storage_cost_report',       backend: '/reports/storage_cost_report' },
  rpt_fbv:      { page_id: 'report_floor_balance_value',       backend: '/summary/floor_balance_value' },
  rpt_ic:       { page_id: 'report_inventory_costing',         backend: '/summary/inventory_costing' },
  rpt_ps:       { page_id: 'report_periodic_summary',          backend: '/summary/periodic-report' },
  rpt_bs:       { page_id: 'report_batch_summary',             backend: '/summary/processing' },

  // ── HRMS ──────────────────────────────────────────────────────────────────
  hr_er:        { page_id: 'attendance_employee_register',     backend: '/attendance/employee/register' },
  hr_ei:        { page_id: 'attendance_employee_increment',    backend: '/attendance/employee-increment' },
  hr_da:        { page_id: 'attendance_daily_attendance',      backend: '/attendance/daily' },
  hr_ss:        { page_id: 'attendance_salary_report',         backend: '/attendance/salary/monthly-sheet' },
  hr_tm:        { page_id: 'attendance_tax_master',            backend: '/attendance/tax-master' },
  hr_sa:        { page_id: 'attendance_salary_advance',        backend: '/attendance/salary-advance' },
  hr_sp:        { page_id: 'finance_salary_processing',        backend: '/finance_accounts/salary_processing/entry' },
  hr_reg:       { page_id: 'hrms_registers',                   backend: '/registers/hrms' },

  // ── Masters – Business ────────────────────────────────────────────────────
  mst_byr:      { page_id: 'criteria_buyers',                  backend: '/criteria/buyers' },
  mst_bya:      { page_id: 'criteria_buyer_agents',            backend: '/criteria/buyer_agents' },
  mst_sup:      { page_id: 'criteria_suppliers',               backend: '/criteria/suppliers' },
  mst_vnd:      { page_id: 'criteria_vendors',                 backend: '/criteria/vendors' },
  mst_cty:      { page_id: 'criteria_countries',               backend: '/criteria/countries' },
  mst_brd:      { page_id: 'criteria_brands',                  backend: '/criteria/brands' },

  // ── Masters – Production ──────────────────────────────────────────────────
  mst_spc:      { page_id: 'criteria_species',                 backend: '/criteria/species' },
  mst_var:      { page_id: 'criteria_varieties',               backend: '/criteria/varieties' },
  mst_grd:      { page_id: 'criteria_grades',                  backend: '/criteria/grades' },
  mst_frz:      { page_id: 'criteria_freezers',                backend: '/criteria/freezers' },
  mst_glz:      { page_id: 'criteria_glazes',                  backend: '/criteria/glazes' },
  mst_pks:      { page_id: 'criteria_packing_styles',          backend: '/criteria/packing_styles' },
  mst_con:      { page_id: 'criteria_contractors',             backend: '/criteria/contractors' },
  mst_pat:      { page_id: 'criteria_peeling_at',              backend: '/criteria/peeling_at' },
  mst_prt:      { page_id: 'criteria_peeling_rates',           backend: '/criteria/peeling_rates' },
  mst_pra:      { page_id: 'criteria_production_at',           backend: '/criteria/production_at' },
  'pf_8Kx92LmQ':{ page_id: 'criteria_production_for',          backend: '/criteria/production_for' },
  mst_prt2:     { page_id: 'criteria_production_types',        backend: '/criteria/production_types' },
  mst_chem:     { page_id: 'criteria_chemicals',               backend: '/criteria/chemicals' },
  mst_purp:     { page_id: 'criteria_purposes',                backend: '/criteria/purposes' },
  mst_gth:      { page_id: 'criteria_grade_to_hoso',           backend: '/criteria/grade_to_hoso' },
  mst_hh:       { page_id: 'criteria_hoso_hlso',               backend: '/criteria/hoso_hlso' },

  // ── Masters – Inv & Fin ───────────────────────────────────────────────────
  mst_cs:       { page_id: 'criteria_cold_storage',            backend: '/inventory/cold_storage' },
  mst_csl:      { page_id: 'criteria_coldstore_locations',     backend: '/criteria/coldstore_locations' },
  mst_veh:      { page_id: 'criteria_vehicle_numbers',         backend: '/criteria/vehicle_numbers' },
  mst_hsn:      { page_id: 'criteria_hsn_codes',               backend: '/criteria/hsn_codes' },
  mst_gsi:      { page_id: 'criteria_general_store_items',     backend: '/general_stock/items' },
  mst_swv:      { page_id: 'criteria_shipping_vendors',        backend: '/criteria/shipping_vendors' },

  // ── Admin ─────────────────────────────────────────────────────────────────
  adm_usr:      { page_id: 'admin_add_user',                   backend: '/admin/add_user' },
  adm_shf:      { page_id: 'admin_shifts',                     backend: '/attendance/shifts' },
  adm_dm:       { page_id: 'admin_data_management',            backend: '/data-management' },
  adm_sys:      { page_id: 'admin_system_settings',            backend: '/admin/system_settings' },
  adm_arc:      { page_id: 'admin_system_architecture',        backend: '/admin/system_architecture' },

  // ── Support / Helpdesk ────────────────────────────────────────────────────
  sup_tkt:      { page_id: 'admin_raise_ticket',               backend: '/support/my_tickets' },
  sup_hd:       { page_id: 'admin_helpdesk',                   backend: '/admin/all_tickets' },
  sup_team:     { page_id: 'admin_manage_support',             backend: '/admin/support_team' },
  sup_act:      { page_id: 'admin_user_activity',              backend: '/admin/activities' },

  // ── Profile ───────────────────────────────────────────────────────────────
  my_profile:   { page_id: 'user_profile',                     backend: null },
};

/**
 * PAGE_ID_MAP
 * Reverse lookup: page_id → token  (first match wins)
 * Used by setActivePage() to convert a page_id to a clean /p/<token> URL.
 */
export const PAGE_ID_MAP = Object.fromEntries(
  Object.entries(TOKEN_MAP).map(([token, { page_id }]) => [page_id, token])
);
