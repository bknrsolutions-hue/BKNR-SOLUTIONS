import { useEffect, useState } from 'react';

export default function Sidebar({ activePage, setActivePage, user, sidebarOpen, setSidebarOpen, onMenuItemsReady }) {
  // Enforce permission checks matching menu.html allow() function
  const permissions = user?.permissions || [];
  const currentUserEmail = user?.email?.trim().toLowerCase() || '';
  const isDefaultSuperAdmin = currentUserEmail === "bknr.solutions@gmail.com";

  const allow = (key) => {
    if (isDefaultSuperAdmin) return true;
    if (Array.isArray(key)) return key.some(permission => allow(permission));
    if (!permissions) return false;
    if (typeof permissions === 'string') {
      return permissions === 'ALL' || permissions.split(',').map(item => item.trim()).includes(key);
    }
    return permissions.includes("ALL") || permissions.includes(key);
  };

  // State to track accordion open states for sub-groups
  const [openSections, setOpenSections] = useState({
    'Processing': false,
    'Inventory': false,
    'Export Documents': false,
    'Operational Bills': false,
    'Accounts & Ledgers': false,
    'Cash & Banking': false,
    'Integrated Finance': false,
    'Processing Reports': false,
    'Inventory Reports': false,
    'Costing Reports': false,
    'Business Masters': false,
    'Production Masters': false,
    'Inv & Fin Masters': false,
    'Admin': false
  });
  const [openPillars, setOpenPillars] = useState({});

  const toggleSection = (sectionName) => {
    setOpenSections(prev => {
      const isCurrentlyOpen = !!prev[sectionName];
      const nextState = { ...prev };
      Object.keys(nextState).forEach(key => {
        nextState[key] = key === sectionName ? !isCurrentlyOpen : false;
      });
      return nextState;
    });
  };

  const togglePillar = (title) => {
    setOpenPillars(prev => {
      const isCurrentlyOpen = prev[title] ?? title === firstVisibleTitle;
      const nextState = {};
      visibleMenuConfig.forEach(cat => {
        nextState[cat.title] = cat.title === title ? !isCurrentlyOpen : false;
      });
      return nextState;
    });
  };

  // Menu data replicating menu.html sidebarMenuData exactly (first 6 pillars)
  // Each item carries a `token` field for clean /p/<token> URL navigation.
  const menuConfig = [
    {
      title: "DASHBOARDS",
      items: [
        { id: 'dashboard_processing', token: 'dash_proc', perm: 'processing_dashboard', route: '/dashboard/processing_dashboard', icon: 'fa-chart-simple', label: 'Processing' },
        { id: 'dashboard_inventory', token: 'dash_inv', perm: 'inventory_dashboard', route: '/dashboard/inventory_dashboard', icon: 'fa-warehouse', label: 'Inventory' },
        { id: 'dashboard_hr', token: 'dash_hr', perm: 'hr_command_center', route: '/dashboard/hr_command_center', icon: 'fa-user-tie', label: 'HR & Staff' },
        { id: 'dashboard_costing', token: 'dash_cost', perm: 'costing_dashboard', route: '/dashboard/costing_dashboard', icon: 'fa-file-invoice-dollar', label: 'Costing & Fin' },
        { id: 'dashboard_finance', token: 'dash_fin', perm: 'finance_dashboard', route: '/dashboard/finance_dashboard', icon: 'fa-wallet', label: 'Finance Dashboard' },
        { id: 'tally_dashboard', token: 'dash_tally', perm: 'tally_dashboard', route: '/finance_accounts/tally_dashboard', icon: 'fa-chart-pie', label: 'Tally Dashboard' }
      ]
    },
    {
      title: "OPERATIONS",
      subgroups: [
        {
          name: "Processing",
          items: [
            { id: 'gate_entry', token: 'ops_ge', perm: 'gate_entry', route: '/processing/gate_entry', icon: 'fa-door-open', label: 'Gate Entry', badge: 'Ops-1' },
            { id: 'raw_material_purchasing', token: 'ops_rmp', perm: 'raw_material_purchasing', route: '/processing/raw_material_purchasing', icon: 'fa-truck-ramp-box', label: 'RM Purchasing', badge: 'Ops-2' },
            { id: 'de_heading', token: 'ops_dh', perm: 'de_heading', route: '/processing/de_heading', icon: 'fa-scissors', label: 'De-Heading', badge: 'WIP' },
            { id: 'grading', token: 'ops_grd', perm: 'grading', route: '/processing/grading', icon: 'fa-filter', label: 'Grading', badge: 'WIP' },
            { id: 'peeling', token: 'ops_pel', perm: 'peeling', route: '/processing/peeling', icon: 'fa-hand-dots', label: 'Peeling', badge: 'WIP' },
            { id: 'soaking', token: 'ops_soak', perm: 'soaking', route: '/processing/soaking', icon: 'fa-droplet', label: 'Soaking', badge: 'WIP' },
            { id: 'production', token: 'ops_prod', perm: 'production', route: '/processing/production', icon: 'fa-industry', label: 'Production', badge: 'WIP' },
            { id: 'processing_registers', token: 'ops_preg', perm: ['gate_entry', 'raw_material_purchasing', 'de_heading', 'grading', 'peeling', 'soaking', 'production'], route: '/registers/processing', icon: 'fa-file-excel', label: 'Processing Registers', badge: 'XLSX' }
          ]
        },
        {
          name: "Inventory",
          items: [
            { id: 'stock_entry', token: 'inv_se', perm: 'stock_entry', route: '/inventory/stock_entry', icon: 'fa-boxes-stacked', label: 'Stock Entry', badge: 'Stock' },
            { id: 'pending_orders', token: 'inv_po', perm: 'pending_orders', route: '/inventory/pending_orders', icon: 'fa-clock-rotate-left', label: 'Pending Orders', badge: 'Orders' },
            { id: 'cold_storage_holding', token: 'inv_cs', perm: 'cold_storage_holding', route: '/inventory/cold_storage_holding', icon: 'fa-snowflake', label: 'Cold Storage Holding', badge: 'Cold' },
            { id: 'general_stock_entry', token: 'inv_gse', perm: 'general_store_entry', route: '/general_stock/entry', icon: 'fa-shop', label: 'General Store Entry', badge: 'Store' },
            { id: 'inventory_registers', token: 'inv_ireg', perm: ['stock_entry', 'pending_orders', 'cold_storage_holding', 'sales_report'], route: '/registers/inventory', icon: 'fa-file-excel', label: 'Inventory Registers', badge: 'XLSX' }
          ]
        },
        {
          name: "Export Documents",
          items: [
            { id: 'export_documents_dashboard', token: 'exp_dash', perm: 'export_documents_dashboard', route: '/export_documents/dashboard', icon: 'fa-file-export', label: 'Export Dashboard', badge: 'ExpOp' },
            { id: 'export_shipment_workspace', token: 'exp_ws', perm: ['export_documents_dashboard', 'proforma_invoice', 'export_shipment', 'commercial_invoice', 'packing_list', 'container_stuffing', 'shipping_bill', 'bill_of_lading', 'health_certificate'], route: '/export_documents/workspace', icon: 'fa-ship', label: 'Shipment Workspace', badge: 'Flow' },
            { id: 'export_requirement_forms', token: 'exp_dc', perm: ['export_documents_dashboard', 'export_supporting_documents'], route: '/export_documents/requirement-pages/entry', icon: 'fa-folder-tree', label: 'Document Center', badge: 'Docs' },
            { id: 'export_document_approvals', token: 'exp_appr', perm: ['export_documents_dashboard', 'export_supporting_documents'], route: '/export_documents/approvals', icon: 'fa-user-check', label: 'Approvals', badge: 'Action' },
            { id: 'export_registers', token: 'exp_reg', perm: ['export_documents_dashboard', 'proforma_invoice', 'export_shipment', 'commercial_invoice', 'packing_list', 'container_stuffing', 'shipping_bill', 'bill_of_lading', 'health_certificate'], route: '/export_documents/registers', icon: 'fa-file-excel', label: 'Registers', badge: 'XLSX' }
          ]
        }
      ]
    },
    {
      title: "FINANCE",
      subgroups: [
        {
          name: "Operational Bills",
          items: [
            { id: 'finance_electricity_bills', token: 'fin_eb', perm: 'electricity_bills', route: '/api/electricity/entry', icon: 'fa-bolt', label: 'Electricity Bills', badge: 'Exp' },
            { id: 'finance_diesel_bills', token: 'fin_db', perm: 'diesel_bills', route: '/api/diesel/entry', icon: 'fa-gas-pump', label: 'Diesel Consumption', badge: 'Exp' },
            { id: 'finance_packaging_bills', token: 'fin_pkg', perm: 'packaging_bills', route: '/api/purchase/entry', icon: 'fa-file-invoice-dollar', label: 'Purchase & Packaging', badge: 'Exp' },
            { id: 'finance_logistics_bills', token: 'fin_logi', perm: 'logistics_bills', route: '/api/container/entry', icon: 'fa-truck-fast', label: 'Logistics & Freight', badge: 'Exp' },
            { id: 'finance_contractor_bills', token: 'fin_cb', perm: 'contractor_bills', route: '/api/contractor_bills/entry', icon: 'fa-users-gear', label: 'Contractor Bills', badge: 'Exp' },
            { id: 'finance_salaries', token: 'fin_sal', perm: 'salaries', route: '/api/salaries/entry', icon: 'fa-money-check-dollar', label: 'Salaries', badge: 'Pay' },
            { id: 'finance_vendor_bills', token: 'fin_vb', perm: 'vendor_bills', route: '/api/vendor_bills/entry', icon: 'fa-file-invoice-dollar', label: 'Vendor Bills', badge: 'AP' },
            { id: 'finance_supplier_bills', token: 'fin_sub', perm: 'supplier_bills', route: '/api/supplier_bills/entry', icon: 'fa-truck-field', label: 'Supplier Bills', badge: 'AP' },
            { id: 'finance_payment_logs', token: 'fin_plog', perm: 'payment_logs', route: '/api/payment_logs/entry', icon: 'fa-receipt', label: 'Payment Logs', badge: 'Pay' },
            { id: 'finance_qa_testing', token: 'fin_qa', perm: 'qa_testing', route: '/api/qa/entry', icon: 'fa-microscope', label: 'QA Testing Charges', badge: 'Exp' },
            { id: 'finance_other_expenses', token: 'fin_oe', perm: 'other_expenses', route: '/api/expenses/entry', icon: 'fa-receipt', label: 'Other Expenses', badge: 'Misc' }
          ]
        },
        {
          name: "Accounts & Ledgers",
          items: [
            { id: 'finance_accounts_flow_guide', token: 'acc_afg', perm: 'accounts_flow_guide', route: '/finance_accounts/accounts_flow_guide', icon: 'fa-diagram-project', label: 'Accounts Flow Guide', badge: 'Acc' },
            { id: 'finance_ledger_master', token: 'acc_lm', perm: 'ledger_master', route: '/finance_accounts/ledger_master/entry', icon: 'fa-folder-open', label: 'Ledger Master', badge: 'Acc' },
            { id: 'finance_journal_entry', token: 'acc_je', perm: 'journal_entry', route: '/finance_accounts/journal_entry/entry', icon: 'fa-book', label: 'Journal Entries', badge: 'Acc' },
            { id: 'finance_bank_master', token: 'acc_bm', perm: 'bank_master', route: '/finance_accounts/bank_master/entry', icon: 'fa-building-columns', label: 'Bank Master', badge: 'Acc' },
            { id: 'finance_item_accounting_link', token: 'acc_ial', perm: 'item_accounting_link', route: '/finance_accounts/item_accounting_link/entry', icon: 'fa-link', label: 'Item Accounting Link', badge: 'Acc' },
            { id: 'finance_fixed_assets', token: 'acc_fa', perm: 'fixed_assets', route: '/finance_accounts/fixed_assets/entry', icon: 'fa-building', label: 'Fixed Assets', badge: 'Acc' },
            { id: 'finance_gst_register', token: 'acc_gst', perm: 'gst_register', route: '/finance_accounts/gst_register/entry', icon: 'fa-percent', label: 'GST Register', badge: 'Acc' },
            { id: 'finance_customer_receivable', token: 'acc_cr', perm: 'customer_receivable', route: '/finance_accounts/customer_receivable/entry', icon: 'fa-money-bill-transfer', label: 'Customer Receivables', badge: 'AR' },
            { id: 'finance_vendor_payment', token: 'acc_vp', perm: 'vendor_payment', route: '/finance_accounts/vendor_payment/entry', icon: 'fa-money-check-dollar', label: 'Vendor Payments', badge: 'AP' },
            { id: 'finance_expense_voucher', token: 'acc_ev', perm: 'expense_voucher', route: '/finance_accounts/expense_voucher/entry', icon: 'fa-file-circle-dollar', label: 'Expense Vouchers', badge: 'Vchr' },
            { id: 'accounts_registers', token: 'acc_areg', perm: ['ledger_master', 'journal_entry', 'customer_receivable', 'vendor_payment', 'expense_voucher'], route: '/registers/accounts', icon: 'fa-file-excel', label: 'Accounts Registers', badge: 'XLSX' }
          ]
        },
        {
          name: "Cash & Banking",
          items: [
            { id: 'finance_bank_transaction', token: 'bnk_bt', perm: 'bank_transaction', route: '/finance_accounts/bank_transaction/entry', icon: 'fa-building-columns', label: 'Bank Transactions', badge: 'Bank' },
            { id: 'finance_payment_receipt', token: 'bnk_pr', perm: 'payment_receipt', route: '/finance_accounts/payment_receipt/entry', icon: 'fa-file-invoice-dollar', label: 'Remittance & Receipts', badge: 'Bank' }
          ]
        },
        {
          name: "Integrated Finance",
          items: [
            { id: 'finance_export_incentive_register', token: 'intfin_ei', perm: 'export_incentive_register', route: '/finance_accounts/export_incentive_register/entry', icon: 'fa-award', label: 'Export Incentives', badge: 'Fin' },
            { id: 'finance_lc_tracking', token: 'intfin_lc', perm: 'lc_tracking', route: '/finance_accounts/lc_tracking/entry', icon: 'fa-file-shield', label: 'LC Tracking', badge: 'Fin' },
            { id: 'finance_production_cost_allocation', token: 'intfin_pca', perm: 'production_cost_allocation', route: '/finance_accounts/production_cost_allocation/entry', icon: 'fa-coins', label: 'Production Cost Allocation', badge: 'Fin' }
          ]
        }
      ]
    },
    {
      title: "REPORTS",
      subgroups: [
        {
          name: "Processing Reports",
          items: [
            { id: 'report_gate_entry_report', token: 'rpt_ge', perm: 'gate_entry_report', route: '/reports/gate_entry', icon: 'fa-file-lines', label: 'Gate Entry Report', badge: 'Logs' },
            { id: 'report_rmp_report', token: 'rpt_rmp', perm: 'rmp_report', route: '/reports/raw_material_purchasing', icon: 'fa-file-invoice', label: 'RM Purchase Report', badge: 'Data' },
            { id: 'report_de_heading_report', token: 'rpt_dh', perm: 'de_heading_report', route: '/reports/de_heading', icon: 'fa-file-medical', label: 'De-Heading Report', badge: 'Data' },
            { id: 'report_grading_report', token: 'rpt_grd', perm: 'grading_report', route: '/reports/grading_report', icon: 'fa-file-shield', label: 'Grading Report', badge: 'Data' },
            { id: 'report_peeling_report', token: 'rpt_pel', perm: 'peeling_report', route: '/reports/peeling_report', icon: 'fa-file-import', label: 'Peeling Report', badge: 'Data' },
            { id: 'report_soaking_report', token: 'rpt_soak', perm: 'soaking_report', route: '/reports/soaking_report', icon: 'fa-file-word', label: 'Soaking Report', badge: 'Data' },
            { id: 'report_production_report', token: 'rpt_prod', perm: 'production_report', route: '/reports/production_report', icon: 'fa-file-export', label: 'Production Report', badge: 'Data' },
            { id: 'report_reprocess_report', token: 'rpt_repr', perm: 'reprocess_report', route: '/reports/re-process', icon: 'fa-arrows-rotate', label: 'Re-Process Report', badge: 'Logs' }
          ]
        },
        {
          name: "Inventory Reports",
          items: [
            { id: 'report_floor_balance_report', token: 'rpt_fb', perm: 'floor_balance_report', route: '/reports/floor_balance_report', icon: 'fa-scale-balanced', label: 'Floor Balance Report', badge: 'Stock' },
            { id: 'report_inventory_report', token: 'rpt_inv', perm: 'inventory_report', route: '/inventory/stock_report', icon: 'fa-boxes-packing', label: 'Stock Status Report', badge: 'Inv' },
            { id: 'report_pending_orders_report', token: 'rpt_por', perm: 'pending_orders_report', route: '/reports/pending_orders_report', icon: 'fa-clock', label: 'Pending Orders Report', badge: 'Hold' },
            { id: 'report_sales_report', token: 'rpt_sales', perm: 'sales_report', route: '/inventory/sales_report', icon: 'fa-receipt', label: 'Sales Report', badge: 'Out' },
            { id: 'report_gs_report', token: 'rpt_gs', perm: 'gs_report', route: '/general_stock/report', icon: 'fa-file-zipper', label: 'General Store Report', badge: 'Store' },
            { id: 'report_cold_storage_holding_report', token: 'rpt_csh', perm: 'cold_storage_holding_report', route: '/inventory/cold_storage_holding_report', icon: 'fa-warehouse', label: 'Cold Storage Report', badge: 'Cold' }
          ]
        },
        {
          name: "Costing Reports",
          items: [
            { id: 'report_storage_cost_report', token: 'rpt_sc', perm: 'storage_cost_report', route: '/reports/storage_cost_report', icon: 'fa-coins', label: 'Storage & Cost Report', badge: 'Val' },
            { id: 'report_floor_balance_value', token: 'rpt_fbv', perm: 'floor_balance_value', route: '/summary/floor_balance_value', icon: 'fa-scale-balanced', label: 'Floor Balance Value', badge: 'Val' },
            { id: 'report_inventory_costing', token: 'rpt_ic', perm: 'inventory_costing', route: '/summary/inventory_costing', icon: 'fa-calculator', label: 'Inventory Costing', badge: 'Fin' },
            { id: 'report_periodic_summary', token: 'rpt_ps', perm: 'periodic_summary', route: '/summary/periodic-report', icon: 'fa-calendar-days', label: 'Periodic Summary', badge: 'Time' },
            { id: 'report_batch_summary', token: 'rpt_bs', perm: 'batch_summary', route: '/summary/processing', icon: 'fa-rectangle-list', label: 'Batch Summary', badge: 'Run' }
          ]
        }
      ]
    },
    {
      title: "HRMS",
      items: [
        { id: 'attendance_employee_register', token: 'hr_er', perm: 'employee_registration', route: '/attendance/employee/register', icon: 'fa-id-card-clip', label: 'Staff Registration', badge: 'HR' },
        { id: 'attendance_employee_increment', token: 'hr_ei', perm: 'employee_increment', route: '/attendance/employee-increment', icon: 'fa-arrow-trend-up', label: 'Increment Details', badge: 'HR' },
        { id: 'attendance_daily_attendance', token: 'hr_da', perm: 'daily_attendance', route: '/attendance/daily', icon: 'fa-fingerprint', label: 'Daily Attendance', badge: 'HR' },
        { id: 'attendance_salary_report', token: 'hr_ss', perm: 'salary_report', route: '/attendance/salary/monthly-sheet', icon: 'fa-money-check-dollar', label: 'Monthly Salary Sheet', badge: 'HR' },
        { id: 'attendance_tax_master', token: 'hr_tm', perm: 'tax_master', route: '/attendance/tax-master', icon: 'fa-file-shield', label: 'Payroll Master', badge: 'HR' },
        { id: 'attendance_salary_advance', token: 'hr_sa', perm: 'salary_advance', route: '/attendance/salary-advance', icon: 'fa-hand-holding-dollar', label: 'Salary Advance', badge: 'HR' },
        { id: 'finance_salary_processing', token: 'hr_sp', perm: 'salary_processing', route: '/finance_accounts/salary_processing/entry', icon: 'fa-calculator', label: 'Salary Processing', badge: 'HR' },
        { id: 'hrms_registers', token: 'hr_reg', perm: ['employee_registration', 'daily_attendance', 'employee_increment', 'tax_master', 'salary_advance'], route: '/registers/hrms', icon: 'fa-file-excel', label: 'HRMS Registers', badge: 'XLSX' }
      ]
    },
    {
      title: "MASTERS",
      subgroups: [
        {
          name: "Business Masters",
          items: [
            { id: 'criteria_buyers', token: 'mst_byr', perm: 'buyers', route: '/criteria/buyers', icon: 'fa-users', label: 'Buyers', badge: 'Mstr' },
            { id: 'criteria_buyer_agents', token: 'mst_bya', perm: 'buyer_agents', route: '/criteria/buyer_agents', icon: 'fa-user-tie', label: 'Buyer Agents', badge: 'Mstr' },
            { id: 'criteria_suppliers', token: 'mst_sup', perm: 'suppliers', route: '/criteria/suppliers', icon: 'fa-truck-field', label: 'Suppliers', badge: 'Mstr' },
            { id: 'criteria_vendors', token: 'mst_vnd', perm: 'vendors', route: '/criteria/vendors', icon: 'fa-store', label: 'Vendors', badge: 'Mstr' },
            { id: 'criteria_countries', token: 'mst_cty', perm: 'countries', route: '/criteria/countries', icon: 'fa-globe', label: 'Countries', badge: 'Mstr' },
            { id: 'criteria_brands', token: 'mst_brd', perm: 'brands', route: '/criteria/brands', icon: 'fa-building', label: 'Brands', badge: 'Mstr' }
          ]
        },
        {
          name: "Production Masters",
          items: [
            { id: 'criteria_species', token: 'mst_spc', perm: 'species', route: '/criteria/species', icon: 'fa-fish', label: 'Species', badge: 'Mstr' },
            { id: 'criteria_varieties', token: 'mst_var', perm: 'varieties', route: '/criteria/varieties', icon: 'fa-seedling', label: 'Varieties', badge: 'Mstr' },
            { id: 'criteria_grades', token: 'mst_grd', perm: 'grades', route: '/criteria/grades', icon: 'fa-medal', label: 'Grades', badge: 'Mstr' },
            { id: 'criteria_freezers', token: 'mst_frz', perm: 'freezers', route: '/criteria/freezers', icon: 'fa-snowflake', label: 'Freezers', badge: 'Mstr' },
            { id: 'criteria_glazes', token: 'mst_glz', perm: 'glazes', route: '/criteria/glazes', icon: 'fa-igloo', label: 'Glazes', badge: 'Mstr' },
            { id: 'criteria_packing_styles', token: 'mst_pks', perm: 'packing_styles', route: '/criteria/packing_styles', icon: 'fa-box', label: 'Packing Styles', badge: 'Mstr' },
            { id: 'criteria_contractors', token: 'mst_con', perm: 'contractors', route: '/criteria/contractors', icon: 'fa-hard-hat', label: 'Contractors', badge: 'Mstr' },
            { id: 'criteria_peeling_at', token: 'mst_pat', perm: 'peeling_at', route: '/criteria/peeling_at', icon: 'fa-map-pin', label: 'Peeling At', badge: 'Mstr' },
            { id: 'criteria_peeling_rates', token: 'mst_prt', perm: 'peeling_rates', route: '/criteria/peeling_rates', icon: 'fa-money-bill', label: 'Peeling Rates', badge: 'Mstr' },
            { id: 'criteria_production_at', token: 'mst_pra', perm: 'production_at', route: '/criteria/production_at', icon: 'fa-industry', label: 'Production At', badge: 'Mstr' },
            { id: 'criteria_production_for', token: 'pf_8Kx92LmQ', perm: 'production_for', route: '/criteria/production_for', icon: 'fa-building-flag', label: 'Production For', badge: 'Mstr' },
            { id: 'criteria_production_types', token: 'mst_prt2', perm: 'production_types', route: '/criteria/production_types', icon: 'fa-tags', label: 'Production Types', badge: 'Mstr' },
            { id: 'criteria_chemicals', token: 'mst_chem', perm: 'chemicals', route: '/criteria/chemicals', icon: 'fa-flask', label: 'Chemicals', badge: 'Mstr' },
            { id: 'criteria_purposes', token: 'mst_purp', perm: 'purposes', route: '/criteria/purposes', icon: 'fa-bullseye', label: 'Purposes', badge: 'Mstr' },
            { id: 'criteria_grade_to_hoso', token: 'mst_gth', perm: 'grade_to_hoso', route: '/criteria/grade_to_hoso', icon: 'fa-exchange-alt', label: 'Grade to HOSO', badge: 'Mstr' },
            { id: 'criteria_hoso_hlso', token: 'mst_hh', perm: 'hoso_hlso', route: '/criteria/hoso_hlso', icon: 'fa-ruler-combined', label: 'HOSO & HLSO', badge: 'Mstr' }
          ]
        },
        {
          name: "Inv & Fin Masters",
          items: [
            { id: 'criteria_cold_storage', token: 'mst_cs', perm: 'cold_storage', route: '/inventory/cold_storage', icon: 'fa-igloo', label: 'Cold Storage Master', badge: 'Mstr' },
            { id: 'criteria_coldstore_locations', token: 'mst_csl', perm: 'coldstore_locations', route: '/criteria/coldstore_locations', icon: 'fa-map-location-dot', label: 'Coldstore Locations', badge: 'Mstr' },
            { id: 'criteria_vehicle_numbers', token: 'mst_veh', perm: 'vehicle_numbers', route: '/criteria/vehicle_numbers', icon: 'fa-truck', label: 'Vehicle Numbers', badge: 'Mstr' },
            { id: 'criteria_hsn_codes', token: 'mst_hsn', perm: 'hsn_codes', route: '/criteria/hsn_codes', icon: 'fa-barcode', label: 'HSN Codes', badge: 'Mstr' },
            { id: 'criteria_general_store_items', token: 'mst_gsi', perm: 'general_store_items', route: '/general_stock/items', icon: 'fa-cubes', label: 'General Store Items', badge: 'Mstr' }
          ]
        },
        {
          name: "Admin",
          items: [
            { id: 'admin_add_user', token: 'adm_usr', perm: 'add_user', route: '/admin/add_user', icon: 'fa-user-gear', label: 'User Configuration', badge: 'Admin' },
            { id: 'admin_shifts', token: 'adm_shf', perm: 'shifts', route: '/attendance/shifts', icon: 'fa-business-time', label: 'Shifts', badge: 'Admin' },
            { id: 'admin_data_management', token: 'adm_dm', perm: 'data_management', route: '/data-management', icon: 'fa-database', label: 'Data Management', badge: 'Admin' },
            ...(isDefaultSuperAdmin ? [
              { id: 'admin_system_settings', token: 'adm_sys', perm: 'system_settings', route: '/admin/system_settings', icon: 'fa-sliders', label: 'System & Pipeline', badge: 'Admin' },
              { id: 'admin_system_architecture', token: 'adm_arc', perm: 'system_architecture', route: '/admin/system_architecture', icon: 'fa-sitemap', label: 'System Architecture', badge: 'Admin' }
            ] : [])
          ]
        }
      ]
    }
  ];

  // menu.html keeps Masters/Admin in the profile mega-menu, not the sidebar.
  const visibleMenuConfig = menuConfig.filter(category => category.title !== 'MASTERS');

  useEffect(() => {
    if (!onMenuItemsReady) return;

    const items = menuConfig.flatMap(category => {
      if (category.items) {
        return category.items
          .filter(item => allow(item.perm))
          .map(item => ({ ...item, category: category.title }));
      }
      return (category.subgroups || []).flatMap(subgroup => subgroup.items
        .filter(item => allow(item.perm))
        .map(item => ({ ...item, category: `${category.title} > ${subgroup.name}` })));
    });

    onMenuItemsReady(items);
    // The sidebar mounts after authentication, so this permission-filtered snapshot
    // only needs to be published once for the header Quick Actions picker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onMenuItemsReady]);

  const categoryHasVisibleItems = (category) => category.items
    ? category.items.some(item => allow(item.perm))
    : category.subgroups?.some(subgroup => subgroup.items.some(item => allow(item.perm)));
  const firstVisibleTitle = visibleMenuConfig.find(categoryHasVisibleItems)?.title;

  return (
    <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
      {/* Sidebar Header */}
      <div className="sidebar-brand">
        <div className="brand-wrapper">
          <div className="brand-title">
            <i className="fa-solid fa-layer-group"></i> MY ERP
          </div>
          <div className="brand-subtitle">WORKSPACE</div>
        </div>
        <button className="close-sidebar-btn" onClick={() => setSidebarOpen(false)}>
          <i className="fa-solid fa-xmark"></i>
        </button>
      </div>

      {/* Sidebar Navigation Scroll Box */}
      <div className="sidebar-menu">
        {visibleMenuConfig.map((cat, idx) => {
          // Check permissions for the category
          const hasVisible = categoryHasVisibleItems(cat);
          if (!hasVisible) return null;

          const catClass = `cat-${cat.title.split(' ')[0]}`;
          const isPillarOpen = openPillars[cat.title] ?? cat.title === firstVisibleTitle;

          return (
            <div key={idx} className={`pillar-block ${isPillarOpen ? 'open' : 'collapsed'}`}>
              <div className="pillar-title" onClick={() => togglePillar(cat.title)}>
                <i className="fa-solid fa-chevron-right pillar-chevron"></i>
                <i className={`fa-solid ${isPillarOpen ? 'fa-folder-open' : 'fa-folder'} pillar-folder`}></i>
                <span>{cat.title}</span>
              </div>
              <div className="menu-wrapper">
                
                {/* Render direct items */}
                {cat.items && cat.items.map((item) => {
                  if (!allow(item.perm)) return null;
                  const isActive = activePage === item.id;
                  return (
                    <div key={item.id} className="submenu-item-row">
                      <a 
                        className={`submenu-item ${catClass} ${isActive ? 'active' : ''}`}
                        href="#"
                        onClick={(e) => {
                          e.preventDefault();
                          setActivePage(item.token || item.id, item.route);
                          setSidebarOpen(false);
                        }}
                      >
                        <div>
                          <i className={`fa-solid ${item.icon}`}></i> 
                          {item.label}
                        </div>
                      </a>
                    </div>
                  );
                })}

                {/* Render subgroups */}
                {cat.subgroups && cat.subgroups.map((sub, sIdx) => {
                  let allowedSubItems = sub.items.filter(item => allow(item.perm));
                  if (allowedSubItems.length === 0) return null;
                  const isSubgroupOpen = !!openSections[sub.name];

                  return (
                    <div key={sIdx} className={`submenu-heading-block ${isSubgroupOpen ? 'open' : ''}`}>
                      {/* Subgroup Heading */}
                      <div 
                        className="submenu-heading-text"
                        onClick={() => toggleSection(sub.name)}
                      >
                        <i className="fa-solid fa-chevron-right sub-chevron"></i>
                        <i className={`fa-solid ${isSubgroupOpen ? 'fa-folder-open' : 'fa-folder'} sub-folder`}></i>
                        <span>{sub.name}</span>
                      </div>

                      {/* Subgroup Items Container */}
                      <div className="reports-container">
                        {allowedSubItems.map((item) => {
                          const isActive = activePage === item.id;
                          return (
                            <div key={item.id} className="submenu-item-row">
                              <a 
                                className={`submenu-item ${catClass} ${isActive ? 'active' : ''}`}
                                href="#"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setActivePage(item.token || item.id, item.route);
                                  setSidebarOpen(false);
                                }}
                              >
                                <div>
                                  <i className={`fa-solid ${item.icon}`}></i> 
                                  {item.label}
                                </div>
                              </a>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

              </div>
            </div>
          );
        })}
      </div>

      {/* Quote Footer */}
      <div className="sidebar-footer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
        <div className="footer-quote" style={{ fontSize: '9.5px', color: 'var(--text-tertiary)' }}>Powered by</div>
        <img 
          src={`${import.meta.env.BASE_URL || '/'}svbk-it-solutions-logo-3d-transparent.png`.replace(/\/+/g, '/')} 
          alt="SVBK IT Solutions" 
          style={{ height: '30px', width: 'auto', objectFit: 'contain', display: 'block' }} 
        />
      </div>
    </div>
  );
}
