import { useState, useRef, useEffect, Component } from 'react';
import './TopNavbar.css';

class TopNavbarErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, errorInfo) {
    console.error('TopNavbar Error:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function TopNavbarContent({ activePage, setActivePage, user }) {
  const permissions = user?.permissions || [];
  const currentUserEmail = user?.email ? String(user.email).trim().toLowerCase() : '';
  const isDefaultSuperAdmin = currentUserEmail === "bknr.solutions@gmail.com";

  const allow = (key) => {
    try {
      if (!key) return true;
      if (isDefaultSuperAdmin) return true;
      if (!permissions || (Array.isArray(permissions) && permissions.length === 0)) return true;
      if (Array.isArray(key)) return key.some(permission => allow(permission));

      const checkSingle = (k) => {
        if (typeof permissions === 'string') {
          if (permissions === 'ALL' || permissions === '*') return true;
          const list = permissions.split(',').map(item => item.trim());
          if (list.includes(k)) return true;
          if (typeof k === 'string' && k.endsWith('_report') && list.includes(k.replace('_report', ''))) return true;
          return false;
        }
        if (Array.isArray(permissions)) {
          if (permissions.includes("ALL") || permissions.includes("*")) return true;
          if (permissions.includes(k)) return true;
          if (typeof k === 'string' && k.endsWith('_report') && permissions.includes(k.replace('_report', ''))) return true;
          return false;
        }
        return true;
      };

      return checkSingle(key);
    } catch {
      return true;
    }
  };

  const [activePillar, setActivePillar] = useState(null);
  const [selectedSubgroup, setSelectedSubgroup] = useState(null);
  const navRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (navRef.current && !navRef.current.contains(event.target)) {
        setActivePillar(null);
        setSelectedSubgroup(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const menuConfig = [
    {
      title: "DASHBOARDS",
      icon: "fa-chart-pie",
      items: [
        { id: 'dashboard_processing', token: 'dash_proc', perm: 'processing_dashboard', route: '/dashboard/processing_dashboard', icon: 'fa-chart-simple', label: 'Processing Dashboard' },
        { id: 'dashboard_inventory', token: 'dash_inv', perm: 'inventory_dashboard', route: '/dashboard/inventory_dashboard', icon: 'fa-warehouse', label: 'Inventory Dashboard' },
        { id: 'dashboard_hr', token: 'dash_hr', perm: 'hr_command_center', route: '/dashboard/hr_command_center', icon: 'fa-user-tie', label: 'HR & Staff Dashboard' },
        { id: 'dashboard_costing', token: 'dash_cost', perm: 'costing_dashboard', route: '/dashboard/costing_dashboard', icon: 'fa-file-invoice-dollar', label: 'Costing & Fin Dashboard' },
        { id: 'dashboard_finance', token: 'dash_fin', perm: 'finance_dashboard', route: '/dashboard/finance_dashboard', icon: 'fa-wallet', label: 'Finance Dashboard' },
        { id: 'tally_dashboard', token: 'dash_tally', perm: 'tally_dashboard', route: '/finance_accounts/tally_dashboard', icon: 'fa-chart-pie', label: 'Tally Dashboard' }
      ]
    },
    {
      title: "OPERATIONS",
      icon: "fa-industry",
      subgroups: [
        {
          name: "Production Forms",
          icon: "fa-gears",
          items: [
            { id: 'gate_entry', token: 'ops_ge', perm: 'gate_entry', route: '/processing/gate_entry', icon: 'fa-door-open', label: 'Gate Entry' },
            { id: 'raw_material_purchasing', token: 'ops_rmp', perm: 'raw_material_purchasing', route: '/processing/raw_material_purchasing', icon: 'fa-truck-ramp-box', label: 'RM Purchasing' },
            { id: 'de_heading', token: 'ops_dh', perm: 'de_heading', route: '/processing/de_heading', icon: 'fa-scissors', label: 'De-Heading' },
            { id: 'grading', token: 'ops_grd', perm: 'grading', route: '/processing/grading', icon: 'fa-filter', label: 'Grading' },
            { id: 'peeling', token: 'ops_pel', perm: 'peeling', route: '/processing/peeling', icon: 'fa-hand-dots', label: 'Peeling' },
            { id: 'soaking', token: 'ops_soak', perm: 'soaking', route: '/processing/soaking', icon: 'fa-droplet', label: 'Soaking' },
            { id: 'production', token: 'ops_prod', perm: 'production', route: '/processing/production', icon: 'fa-industry', label: 'Production Entry' },
            { id: 'finance_production_cost_allocation', token: 'intfin_pca', perm: 'production_cost_allocation', route: '/finance_accounts/production_cost_allocation/entry', icon: 'fa-coins', label: 'Cost Allocation' },
            { id: 'processing_registers', token: 'ops_preg', perm: ['gate_entry', 'raw_material_purchasing', 'de_heading', 'grading', 'peeling', 'soaking', 'production'], route: '/registers/processing', icon: 'fa-file-excel', label: 'Processing Registers' }
          ]
        },
        {
          name: "Production Reports",
          icon: "fa-file-lines",
          items: [
            { id: 'report_gate_entry_report', token: 'rpt_ge', perm: 'gate_entry_report', route: '/reports/gate_entry', icon: 'fa-file-lines', label: 'Gate Entry Report' },
            { id: 'report_rmp_report', token: 'rpt_rmp', perm: 'rmp_report', route: '/reports/raw_material_purchasing', icon: 'fa-file-invoice', label: 'RM Purchase Report' },
            { id: 'report_de_heading_report', token: 'rpt_dh', perm: 'de_heading_report', route: '/reports/de_heading', icon: 'fa-file-medical', label: 'De-Heading Report' },
            { id: 'report_grading_report', token: 'rpt_grd', perm: 'grading_report', route: '/reports/grading_report', icon: 'fa-file-shield', label: 'Grading Report' },
            { id: 'report_peeling_report', token: 'rpt_pel', perm: 'peeling_report', route: '/reports/peeling_report', icon: 'fa-file-import', label: 'Peeling Report' },
            { id: 'report_soaking_report', token: 'rpt_soak', perm: 'soaking_report', route: '/reports/soaking_report', icon: 'fa-file-word', label: 'Soaking Report' },
            { id: 'report_production_report', token: 'rpt_prod', perm: 'production_report', route: '/reports/production_report', icon: 'fa-file-export', label: 'Production Report' },
            { id: 'report_reprocess_report', token: 'rpt_repr', perm: 'reprocess_report', route: '/reports/re-process', icon: 'fa-arrows-rotate', label: 'Re-Process Report' },
            { id: 'report_floor_balance_report', token: 'rpt_fb', perm: 'floor_balance_report', route: '/reports/floor_balance_report', icon: 'fa-scale-balanced', label: 'Floor Balance Report' }
          ]
        },
        {
          name: "Inventory",
          icon: "fa-boxes-stacked",
          items: [
            { id: 'stock_entry', token: 'inv_se', perm: 'stock_entry', route: '/inventory/stock_entry', icon: 'fa-boxes-stacked', label: 'Stock Entry' },
            { id: 'pending_orders', token: 'inv_po', perm: 'pending_orders', route: '/inventory/pending_orders', icon: 'fa-clock-rotate-left', label: 'Pending Orders' },
            { id: 'cold_storage_holding', token: 'inv_cs', perm: 'cold_storage_holding', route: '/inventory/cold_storage_holding', icon: 'fa-snowflake', label: 'Cold Storage Holding' },
            { id: 'general_stock_entry', token: 'inv_gse', perm: 'general_store_entry', route: '/general_stock/entry', icon: 'fa-shop', label: 'General Store Entry' },
            { id: 'inventory_registers', token: 'inv_ireg', perm: ['stock_entry', 'pending_orders', 'cold_storage_holding', 'sales_report'], route: '/registers/inventory', icon: 'fa-file-excel', label: 'Inventory Registers' }
          ]
        },
        {
          name: "Export Documents",
          icon: "fa-plane-departure",
          items: [
            { id: 'export_documents_dashboard', token: 'exp_dash', perm: 'export_documents_dashboard', route: '/export_documents/dashboard', icon: 'fa-file-export', label: 'Export Dashboard' },
            { id: 'export_shipment_workspace', token: 'exp_ws', perm: ['export_documents_dashboard', 'proforma_invoice', 'export_shipment', 'commercial_invoice', 'packing_list', 'container_stuffing', 'shipping_bill', 'bill_of_lading', 'health_certificate'], route: '/export_documents/workspace', icon: 'fa-ship', label: 'Shipment Workspace' },
            { id: 'export_requirement_forms', token: 'exp_dc', perm: ['export_documents_dashboard', 'export_supporting_documents'], route: '/export_documents/requirement-pages/entry', icon: 'fa-folder-tree', label: 'Document Center' },
            { id: 'export_document_approvals', token: 'exp_appr', perm: ['export_documents_dashboard', 'export_supporting_documents'], route: '/export_documents/approvals', icon: 'fa-user-check', label: 'Approvals' },
            { id: 'export_registers', token: 'exp_reg', perm: ['export_documents_dashboard', 'proforma_invoice', 'export_shipment', 'commercial_invoice', 'packing_list', 'container_stuffing', 'shipping_bill', 'bill_of_lading', 'health_certificate'], route: '/export_documents/registers', icon: 'fa-file-excel', label: 'Registers' }
          ]
        }
      ]
    },
    {
      title: "FINANCE",
      icon: "fa-wallet",
      subgroups: [
        {
          name: "Operational Bills",
          icon: "fa-receipt",
          items: [
            { id: 'finance_electricity_bills', token: 'fin_eb', perm: 'electricity_bills', route: '/api/electricity/entry', icon: 'fa-bolt', label: 'Electricity Bills' },
            { id: 'finance_diesel_bills', token: 'fin_db', perm: 'diesel_bills', route: '/api/diesel/entry', icon: 'fa-gas-pump', label: 'Diesel Consumption' },
            { id: 'finance_packaging_bills', token: 'fin_pkg', perm: 'packaging_bills', route: '/api/purchase/entry', icon: 'fa-file-invoice-dollar', label: 'Purchase & Packaging' },
            { id: 'finance_logistics_bills', token: 'fin_logi', perm: 'logistics_bills', route: '/api/container/entry', icon: 'fa-truck-fast', label: 'Logistics & Freight' },
            { id: 'finance_contractor_bills', token: 'fin_cb', perm: 'contractor_bills', route: '/api/contractor_bills/entry', icon: 'fa-users-gear', label: 'Contractor Bills' },
            { id: 'finance_salaries', token: 'fin_sal', perm: 'salaries', route: '/api/salaries/entry', icon: 'fa-money-check-dollar', label: 'Salaries' },
            { id: 'finance_vendor_bills', token: 'fin_vb', perm: 'vendor_bills', route: '/api/vendor_bills/entry', icon: 'fa-file-invoice-dollar', label: 'Vendor Bills' },
            { id: 'finance_supplier_bills', token: 'fin_sub', perm: 'supplier_bills', route: '/api/supplier_bills/entry', icon: 'fa-truck-field', label: 'Supplier Bills' },
            { id: 'finance_payment_logs', token: 'fin_plog', perm: 'payment_logs', route: '/api/payment_logs/entry', icon: 'fa-receipt', label: 'Payment Logs' },
            { id: 'finance_qa_testing', token: 'fin_qa', perm: 'qa_testing', route: '/api/qa/entry', icon: 'fa-microscope', label: 'QA Testing Charges' },
            { id: 'finance_other_expenses', token: 'fin_oe', perm: 'other_expenses', route: '/api/expenses/entry', icon: 'fa-receipt', label: 'Other Expenses' }
          ]
        },
        {
          name: "Accounts & Ledgers",
          icon: "fa-book",
          items: [
            { id: 'finance_accounts_flow_guide', token: 'acc_afg', perm: 'accounts_flow_guide', route: '/finance_accounts/accounts_flow_guide', icon: 'fa-diagram-project', label: 'Accounts Flow Guide' },
            { id: 'finance_ledger_master', token: 'acc_lm', perm: 'ledger_master', route: '/finance_accounts/ledger_master/entry', icon: 'fa-folder-open', label: 'Ledger Master' },
            { id: 'finance_journal_entry', token: 'acc_je', perm: 'journal_entry', route: '/finance_accounts/journal_entry/entry', icon: 'fa-book', label: 'Journal Entries' },
            { id: 'finance_bank_master', token: 'acc_bm', perm: 'bank_master', route: '/finance_accounts/bank_master/entry', icon: 'fa-building-columns', label: 'Bank Master' },
            { id: 'finance_item_accounting_link', token: 'acc_ial', perm: 'item_accounting_link', route: '/finance_accounts/item_accounting_link/entry', icon: 'fa-link', label: 'Item Accounting Link' },
            { id: 'finance_fixed_assets', token: 'acc_fa', perm: 'fixed_assets', route: '/finance_accounts/fixed_assets/entry', icon: 'fa-building', label: 'Fixed Assets' },
            { id: 'finance_gst_register', token: 'acc_gst', perm: 'gst_register', route: '/finance_accounts/gst_register/entry', icon: 'fa-percent', label: 'GST Register' },
            { id: 'finance_customer_receivable', token: 'acc_cr', perm: 'customer_receivable', route: '/finance_accounts/customer_receivable/entry', icon: 'fa-money-bill-transfer', label: 'Customer Receivables' },
            { id: 'finance_vendor_payment', token: 'acc_vp', perm: 'vendor_payment', route: '/finance_accounts/vendor_payment/entry', icon: 'fa-money-check-dollar', label: 'Vendor Payments' },
            { id: 'finance_expense_voucher', token: 'acc_ev', perm: 'expense_voucher', route: '/finance_accounts/expense_voucher/entry', icon: 'fa-file-circle-dollar', label: 'Expense Vouchers' },
            { id: 'accounts_registers', token: 'acc_areg', perm: ['ledger_master', 'journal_entry', 'customer_receivable', 'vendor_payment', 'expense_voucher'], route: '/registers/accounts', icon: 'fa-file-excel', label: 'Accounts Registers' }
          ]
        },
        {
          name: "Cash & Banking",
          icon: "fa-building-columns",
          items: [
            { id: 'finance_bank_transaction', token: 'bnk_bt', perm: 'bank_transaction', route: '/finance_accounts/bank_transaction/entry', icon: 'fa-building-columns', label: 'Bank Transactions' },
            { id: 'finance_payment_receipt', token: 'bnk_pr', perm: 'payment_receipt', route: '/finance_accounts/payment_receipt/entry', icon: 'fa-file-invoice-dollar', label: 'Remittance & Receipts' }
          ]
        },
        {
          name: "Integrated Finance",
          icon: "fa-hand-holding-dollar",
          items: [
            { id: 'finance_export_incentive_register', token: 'intfin_ei', perm: 'export_incentive_register', route: '/finance_accounts/export_incentive_register/entry', icon: 'fa-award', label: 'Export Incentives' },
            { id: 'finance_lc_tracking', token: 'intfin_lc', perm: 'lc_tracking', route: '/finance_accounts/lc_tracking/entry', icon: 'fa-file-shield', label: 'LC Tracking' },
            { id: 'finance_production_cost_allocation', token: 'intfin_pca', perm: 'production_cost_allocation', route: '/finance_accounts/production_cost_allocation/entry', icon: 'fa-coins', label: 'Production Cost Allocation' }
          ]
        }
      ]
    },
    {
      title: "REPORTS",
      icon: "fa-chart-column",
      subgroups: [
        {
          name: "Processing Reports",
          icon: "fa-file-lines",
          items: [
            { id: 'report_gate_entry_report', token: 'rpt_ge', perm: 'gate_entry_report', route: '/reports/gate_entry', icon: 'fa-file-lines', label: 'Gate Entry Report' },
            { id: 'report_rmp_report', token: 'rpt_rmp', perm: 'rmp_report', route: '/reports/raw_material_purchasing', icon: 'fa-file-invoice', label: 'RM Purchase Report' },
            { id: 'report_de_heading_report', token: 'rpt_dh', perm: 'de_heading_report', route: '/reports/de_heading', icon: 'fa-file-medical', label: 'De-Heading Report' },
            { id: 'report_grading_report', token: 'rpt_grd', perm: 'grading_report', route: '/reports/grading_report', icon: 'fa-file-shield', label: 'Grading Report' },
            { id: 'report_peeling_report', token: 'rpt_pel', perm: 'peeling_report', route: '/reports/peeling_report', icon: 'fa-file-import', label: 'Peeling Report' },
            { id: 'report_soaking_report', token: 'rpt_soak', perm: 'soaking_report', route: '/reports/soaking_report', icon: 'fa-file-word', label: 'Soaking Report' },
            { id: 'report_production_report', token: 'rpt_prod', perm: 'production_report', route: '/reports/production_report', icon: 'fa-file-export', label: 'Production Report' },
            { id: 'report_reprocess_report', token: 'rpt_repr', perm: 'reprocess_report', route: '/reports/re-process', icon: 'fa-arrows-rotate', label: 'Re-Process Report' }
          ]
        },
        {
          name: "Inventory Reports",
          icon: "fa-boxes-packing",
          items: [
            { id: 'report_floor_balance_report', token: 'rpt_fb', perm: 'floor_balance_report', route: '/reports/floor_balance_report', icon: 'fa-scale-balanced', label: 'Floor Balance Report' },
            { id: 'report_inventory_report', token: 'rpt_inv', perm: 'inventory_report', route: '/inventory/stock_report', icon: 'fa-boxes-packing', label: 'Stock Status Report' },
            { id: 'report_pending_orders_report', token: 'rpt_por', perm: 'pending_orders_report', route: '/reports/pending_orders_report', icon: 'fa-clock', label: 'Pending Orders Report' },
            { id: 'report_sales_report', token: 'rpt_sales', perm: 'sales_report', route: '/inventory/sales_report', icon: 'fa-receipt', label: 'Sales Report' },
            { id: 'report_gs_report', token: 'rpt_gs', perm: 'gs_report', route: '/general_stock/report', icon: 'fa-file-zipper', label: 'General Store Report' },
            { id: 'report_cold_storage_holding_report', token: 'rpt_csh', perm: 'cold_storage_holding_report', route: '/inventory/cold_storage_holding_report', icon: 'fa-warehouse', label: 'Cold Storage Report' }
          ]
        },
        {
          name: "Costing Reports",
          icon: "fa-calculator",
          items: [
            { id: 'report_storage_cost_report', token: 'rpt_sc', perm: 'storage_cost_report', route: '/reports/storage_cost_report', icon: 'fa-coins', label: 'Storage & Cost Report' },
            { id: 'report_floor_balance_value', token: 'rpt_fbv', perm: 'floor_balance_value', route: '/summary/floor_balance_value', icon: 'fa-scale-balanced', label: 'Floor Balance Value' },
            { id: 'report_inventory_costing', token: 'rpt_ic', perm: 'inventory_costing', route: '/summary/inventory_costing', icon: 'fa-calculator', label: 'Inventory Costing' },
            { id: 'report_periodic_summary', token: 'rpt_ps', perm: 'periodic_summary', route: '/summary/periodic-report', icon: 'fa-calendar-days', label: 'Periodic Summary' },
            { id: 'report_batch_summary', token: 'rpt_bs', perm: 'batch_summary', route: '/summary/processing', icon: 'fa-rectangle-list', label: 'Batch Summary' }
          ]
        }
      ]
    },
    {
      title: "HRMS",
      icon: "fa-users-gear",
      items: [
        { id: 'attendance_employee_register', token: 'hr_er', perm: 'employee_registration', route: '/attendance/employee/register', icon: 'fa-id-card-clip', label: 'Staff Registration' },
        { id: 'attendance_employee_increment', token: 'hr_ei', perm: 'employee_increment', route: '/attendance/employee-increment', icon: 'fa-arrow-trend-up', label: 'Increment Details' },
        { id: 'attendance_daily_attendance', token: 'hr_da', perm: 'daily_attendance', route: '/attendance/daily', icon: 'fa-fingerprint', label: 'Daily Attendance' },
        { id: 'attendance_salary_report', token: 'hr_ss', perm: 'salary_report', route: '/attendance/salary/monthly-sheet', icon: 'fa-money-check-dollar', label: 'Monthly Salary Sheet' },
        { id: 'attendance_tax_master', token: 'hr_tm', perm: 'tax_master', route: '/attendance/tax-master', icon: 'fa-file-shield', label: 'Payroll Master' },
        { id: 'attendance_salary_advance', token: 'hr_sa', perm: 'salary_advance', route: '/attendance/salary-advance', icon: 'fa-hand-holding-dollar', label: 'Salary Advance' },
        { id: 'finance_salary_processing', token: 'hr_sp', perm: 'salary_processing', route: '/finance_accounts/salary_processing/entry', icon: 'fa-calculator', label: 'Salary Processing' },
        { id: 'hrms_registers', token: 'hr_reg', perm: ['employee_registration', 'daily_attendance', 'employee_increment', 'tax_master', 'salary_advance'], route: '/registers/hrms', icon: 'fa-file-excel', label: 'HRMS Registers' }
      ]
    }
  ];

  const handleSelect = (id, token) => {
    setActivePage(id, token);
    setActivePillar(null);
    setSelectedSubgroup(null);
  };

  const handlePillarClick = (e, pillar) => {
    if (e) {
      e.stopPropagation();
    }
    setActivePillar(prev => (prev === pillar.title ? null : pillar.title));
    if (pillar.subgroups && pillar.subgroups.length > 0) {
      setSelectedSubgroup(pillar.subgroups[0].name);
    } else {
      setSelectedSubgroup(null);
    }
  };

  return (
    <nav className="top-navbar-bar" ref={navRef}>
      <div className="top-navbar-container">
        {menuConfig.map((cat) => {
          const isOpen = activePillar === cat.title;

          const isCategoryActive = cat.items
            ? cat.items.some(i => i.id === activePage)
            : (cat.subgroups || []).some(sg => (sg.items || []).some(i => i.id === activePage));

          const activeSubgroupObj = cat.subgroups
            ? cat.subgroups.find(sg => sg.name === selectedSubgroup) || cat.subgroups[0]
            : null;

          return (
            <div className="top-nav-item-wrap" key={cat.title}>
              <button
                type="button"
                className={`top-nav-btn ${isCategoryActive ? 'active' : ''} ${isOpen ? 'open' : ''}`}
                onClick={(e) => handlePillarClick(e, cat)}
                onMouseEnter={() => {
                  if (activePillar && activePillar !== cat.title) {
                    setActivePillar(cat.title);
                    if (cat.subgroups && cat.subgroups.length > 0) {
                      setSelectedSubgroup(cat.subgroups[0].name);
                    } else {
                      setSelectedSubgroup(null);
                    }
                  }
                }}
              >
                <i className={`fa-solid ${cat.icon}`}></i>
                <span>{cat.title}</span>
                <i className="fa-solid fa-chevron-down caret-icon"></i>
              </button>

              {isOpen && (
                <div className={`top-nav-flyout-panel ${cat.subgroups ? 'has-subgroups' : 'simple-list'}`}>
                  {cat.items && (
                    <div className="top-nav-simple-items">
                      {cat.items.filter(i => allow(i.perm)).map(item => (
                        <button
                          type="button"
                          key={item.id}
                          className={`top-nav-item-btn ${activePage === item.id ? 'selected' : ''}`}
                          onClick={() => handleSelect(item.id, item.token)}
                        >
                          <i className={`fa-solid ${item.icon}`}></i>
                          <span>{item.label}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {cat.subgroups && (
                    <div className="top-nav-split-panel">
                      {/* Left Column: Category List */}
                      <div className="top-nav-categories-column">
                        <div className="top-nav-col-header">CATEGORIES</div>
                        {cat.subgroups.map(sg => {
                          const allowed = (sg.items || []).filter(i => allow(i.perm));
                          if (!allowed.length) return null;
                          const isSgActive = activeSubgroupObj?.name === sg.name;

                          return (
                            <button
                              type="button"
                              key={sg.name}
                              className={`top-nav-sg-btn ${isSgActive ? 'active' : ''}`}
                              onMouseEnter={() => setSelectedSubgroup(sg.name)}
                              onClick={() => setSelectedSubgroup(sg.name)}
                            >
                              <i className={`fa-solid ${sg.icon || 'fa-folder'}`}></i>
                              <span>{sg.name}</span>
                              <i className="fa-solid fa-chevron-right sg-arrow"></i>
                            </button>
                          );
                        })}
                      </div>

                      {/* Right Column: Submenu Pages Grid */}
                      {activeSubgroupObj && (
                        <div className="top-nav-pages-column">
                          <div className="top-nav-col-header page-header">
                            <i className={`fa-solid ${activeSubgroupObj.icon || 'fa-folder-open'}`}></i>
                            <span>{activeSubgroupObj.name} Pages</span>
                          </div>
                          <div className="top-nav-pages-grid">
                            {(activeSubgroupObj.items || []).filter(i => allow(i.perm)).map(item => (
                              <button
                                type="button"
                                key={item.id}
                                className={`top-nav-item-btn ${activePage === item.id ? 'selected' : ''}`}
                                onClick={() => handleSelect(item.id, item.token)}
                              >
                                <i className={`fa-solid ${item.icon}`}></i>
                                <span>{item.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}

export default function TopNavbar(props) {
  return (
    <TopNavbarErrorBoundary>
      <TopNavbarContent {...props} />
    </TopNavbarErrorBoundary>
  );
}
