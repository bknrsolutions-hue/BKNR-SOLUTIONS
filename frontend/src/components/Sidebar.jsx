import React, { useState } from 'react';

export default function Sidebar({ activePage, setActivePage, user, sidebarOpen, setSidebarOpen }) {
  // Enforce permission checks matching menu.html allow() function
  const permissions = user?.permissions || [];
  const currentUserEmail = user?.email || '';
  const isDefaultSuperAdmin = currentUserEmail === "bknr.solutions@gmail.com";

  const allow = (key) => {
    if (isDefaultSuperAdmin) return true;
    if (!permissions) return false;
    if (typeof permissions === 'string') {
      return permissions === 'ALL' || permissions.split(',').includes(key);
    }
    return permissions.includes("ALL") || permissions.includes(key);
  };

  // State to track accordion open states for sub-groups
  const [openSections, setOpenSections] = useState({
    'Processing': true,
    'Inventory': false,
    'Export Documents': false,
    'Commercial Bills': false,
    'Accounts & Ledgers': false,
    'Cash & Banking': false,
    'Payables & Receivables': false,
    'Processing Reports': false,
    'Inventory Reports': false,
    'Costing Reports': false,
    'Business Masters': false,
    'Production Masters': false,
    'Inventory Masters': false,
    'Finance Masters': false
  });

  const toggleSection = (sectionName) => {
    setOpenSections(prev => ({
      ...prev,
      [sectionName]: !prev[sectionName]
    }));
  };

  // Menu data replicating menu.html sidebarMenuData exactly (first 6 pillars)
  const menuConfig = [
    {
      title: "DASHBOARDS",
      items: [
        { id: 'dashboard_processing', perm: 'processing_dashboard', route: '/dashboard/processing_dashboard', icon: 'fa-chart-simple', label: 'Processing', badge: 'LIVE' },
        { id: 'dashboard_inventory', perm: 'inventory_dashboard', route: '/dashboard/inventory_dashboard', icon: 'fa-warehouse', label: 'Inventory', badge: 'LIVE' },
        { id: 'dashboard_hr', perm: 'hr_command_center', route: '/dashboard/hr_command_center', icon: 'fa-user-tie', label: 'HR & Staff', badge: 'LIVE' },
        { id: 'dashboard_costing', perm: 'costing_dashboard', route: '/dashboard/costing_dashboard', icon: 'fa-file-invoice-dollar', label: 'Costing & Fin', badge: 'LIVE' },
        { id: 'dashboard_finance', perm: 'finance_dashboard', route: '/dashboard/finance_dashboard', icon: 'fa-wallet', label: 'Finance Dashboard', badge: 'LIVE' },
        { id: 'tally_dashboard', perm: 'tally_dashboard', route: '/finance_accounts/tally_dashboard', icon: 'fa-chart-pie', label: 'Tally Dashboard', badge: 'LIVE' }
      ]
    },
    {
      title: "OPERATIONS",
      subgroups: [
        {
          name: "Processing",
          items: [
            { id: 'gate_entry', perm: 'gate_entry', route: '/processing/gate_entry', icon: 'fa-door-open', label: 'Gate Entry', badge: 'Ops-1' },
            { id: 'raw_material_purchasing', perm: 'raw_material_purchasing', route: '/processing/raw_material_purchasing', icon: 'fa-truck-ramp-box', label: 'RM Purchasing', badge: 'Ops-2' },
            { id: 'de_heading', perm: 'de_heading', route: '/processing/de_heading', icon: 'fa-scissors', label: 'De-Heading', badge: 'WIP' },
            { id: 'grading', perm: 'grading', route: '/processing/grading', icon: 'fa-filter', label: 'Grading', badge: 'WIP' },
            { id: 'peeling', perm: 'peeling', route: '/processing/peeling', icon: 'fa-hand-dots', label: 'Peeling', badge: 'WIP' },
            { id: 'soaking', perm: 'soaking', route: '/processing/soaking', icon: 'fa-droplet', label: 'Soaking', badge: 'WIP' },
            { id: 'production', perm: 'production', route: '/processing/production', icon: 'fa-industry', label: 'Production', badge: 'WIP' }
          ]
        },
        {
          name: "Inventory",
          items: [
            { id: 'stock_entry', perm: 'stock_entry', route: '/inventory/stock_entry', icon: 'fa-boxes-stacked', label: 'Stock Entry', badge: 'Stock' },
            { id: 'pending_orders', perm: 'pending_orders', route: '/inventory/pending_orders', icon: 'fa-clock-rotate-left', label: 'Pending Orders', badge: 'Orders' },
            { id: 'cold_storage_holding', perm: 'cold_storage_holding', route: '/inventory/cold_storage_holding', icon: 'fa-snowflake', label: 'Cold Storage Holding', badge: 'Cold' },
            { id: 'general_stock_entry', perm: 'general_store_entry', route: '/general_stock/entry', icon: 'fa-shop', label: 'General Store Entry', badge: 'Store' }
          ]
        },
        {
          name: "Export Documents",
          items: [
            { id: 'export_shipment', perm: 'export_shipment', route: '/export_documents/export_shipment/entry', icon: 'fa-ship', label: 'Export Shipments', badge: 'ExpOp' },
            { id: 'commercial_invoice', perm: 'commercial_invoice', route: '/export_documents/commercial_invoice/entry', icon: 'fa-file-invoice', label: 'Commercial Invoices', badge: 'ExpOp' },
            { id: 'packing_list', perm: 'packing_list', route: '/export_documents/packing_list/entry', icon: 'fa-file-lines', label: 'Packing Lists', badge: 'ExpOp' },
            { id: 'container_stuffing', perm: 'container_stuffing', route: '/export_documents/container_stuffing/entry', icon: 'fa-truck-ramp-box', label: 'Container Stuffing', badge: 'ExpOp' },
            { id: 'shipping_bill', perm: 'shipping_bill', route: '/export_documents/shipping_bill/entry', icon: 'fa-clipboard-check', label: 'Shipping Bills', badge: 'ExpOp' },
            { id: 'bill_of_lading', perm: 'bill_of_lading', route: '/export_documents/bill_of_lading/entry', icon: 'fa-file-contract', label: 'Bills of Lading', badge: 'ExpOp' },
            { id: 'health_certificate', perm: 'health_certificate', route: '/export_documents/health_certificate/entry', icon: 'fa-file-medical', label: 'Health Certificates', badge: 'ExpOp' }
          ]
        }
      ]
    },
    {
      title: "FINANCE",
      subgroups: [
        {
          name: "Commercial Bills",
          items: [
            { id: 'finance_electricity_bills', perm: 'electricity_bills', route: '/api/electricity/entry', icon: 'fa-bolt', label: 'Electricity Bills', badge: 'Exp' },
            { id: 'finance_diesel_bills', perm: 'diesel_bills', route: '/api/diesel/entry', icon: 'fa-gas-pump', label: 'Diesel Consumption', badge: 'Exp' },
            { id: 'finance_packaging_bills', perm: 'packaging_bills', route: '/api/purchase/entry', icon: 'fa-file-invoice-dollar', label: 'Purchase & Packaging', badge: 'Exp' },
            { id: 'finance_logistics_bills', perm: 'logistics_bills', route: '/api/container/entry', icon: 'fa-truck-fast', label: 'Logistics & Freight', badge: 'Exp' },
            { id: 'finance_qa_testing', perm: 'qa_testing', route: '/api/qa/entry', icon: 'fa-microscope', label: 'QA Testing Charges', badge: 'Exp' },
            { id: 'finance_other_expenses', perm: 'other_expenses', route: '/api/expenses/entry', icon: 'fa-receipt', label: 'Other Expenses', badge: 'Misc' }
          ]
        },
        {
          name: "Accounts & Ledgers",
          items: [
            { id: 'finance_ledger_master', perm: 'ledger_master', route: '/finance_accounts/ledger_master/entry', icon: 'fa-folder-open', label: 'Ledger Master', badge: 'Acc' },
            { id: 'finance_journal_entry', perm: 'journal_entry', route: '/finance_accounts/journal_entry/entry', icon: 'fa-book', label: 'Journal Entries', badge: 'Acc' }
          ]
        },
        {
          name: "Cash & Banking",
          items: [
            { id: 'finance_bank_transaction', perm: 'bank_transaction', route: '/finance_accounts/bank_transaction/entry', icon: 'fa-building-columns', label: 'Bank Transactions', badge: 'Bank' },
            { id: 'finance_payment_receipt', perm: 'payment_receipt', route: '/finance_accounts/payment_receipt/entry', icon: 'fa-file-invoice-dollar', label: 'Remittance & Receipts', badge: 'Bank' }
          ]
        },
        {
          name: "Payables & Receivables",
          items: [
            { id: 'finance_customer_receivable', perm: 'customer_receivable', route: '/finance_accounts/customer_receivable/entry', icon: 'fa-hand-holding-dollar', label: 'Customer Receivables', badge: 'Fin' },
            { id: 'finance_vendor_payment', perm: 'vendor_payment', route: '/finance_accounts/vendor_payment/entry', icon: 'fa-money-bill-transfer', label: 'Vendor Payments', badge: 'Fin' },
            { id: 'finance_expense_voucher', perm: 'expense_voucher', route: '/finance_accounts/expense_voucher/entry', icon: 'fa-receipt', label: 'Expense Vouchers', badge: 'Fin' }
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
            { id: 'report_gate_entry_report', perm: 'gate_entry_report', route: '/reports/gate_entry', icon: 'fa-file-lines', label: 'Gate Entry Report', badge: 'Logs' },
            { id: 'report_rmp_report', perm: 'rmp_report', route: '/reports/raw_material_purchasing', icon: 'fa-file-invoice', label: 'RM Purchase Report', badge: 'Data' },
            { id: 'report_de_heading_report', perm: 'de_heading_report', route: '/reports/de_heading', icon: 'fa-file-medical', label: 'De-Heading Report', badge: 'Data' },
            { id: 'report_grading_report', perm: 'grading_report', route: '/reports/grading_report', icon: 'fa-file-shield', label: 'Grading Report', badge: 'Data' },
            { id: 'report_peeling_report', perm: 'peeling_report', route: '/reports/peeling_report', icon: 'fa-file-import', label: 'Peeling Report', badge: 'Data' },
            { id: 'report_soaking_report', perm: 'soaking_report', route: '/reports/soaking_report', icon: 'fa-file-word', label: 'Soaking Report', badge: 'Data' },
            { id: 'report_production_report', perm: 'production_report', route: '/reports/production_report', icon: 'fa-file-export', label: 'Production Report', badge: 'Data' },
            { id: 'report_reprocess_report', perm: 'reprocess_report', route: '/reports/re-process', icon: 'fa-arrows-rotate', label: 'Re-Process Report', badge: 'Logs' }
          ]
        },
        {
          name: "Inventory Reports",
          items: [
            { id: 'report_floor_balance_report', perm: 'floor_balance_report', route: '/reports/floor_balance_report', icon: 'fa-scale-balanced', label: 'Floor Balance Report', badge: 'Stock' },
            { id: 'report_inventory_report', perm: 'inventory_report', route: '/inventory/stock_report', icon: 'fa-boxes-packing', label: 'Stock Status Report', badge: 'Inv' },
            { id: 'report_pending_orders_report', perm: 'pending_orders_report', route: '/reports/pending_orders_report', icon: 'fa-clock', label: 'Pending Orders Report', badge: 'Hold' },
            { id: 'report_sales_report', perm: 'sales_report', route: '/inventory/sales_report', icon: 'fa-receipt', label: 'Sales Report', badge: 'Out' },
            { id: 'report_gs_report', perm: 'gs_report', route: '/general_stock/report', icon: 'fa-file-zipper', label: 'General Store Report', badge: 'Store' },
            { id: 'report_cold_storage_holding_report', perm: 'cold_storage_holding_report', route: '/inventory/cold_storage_holding_report', icon: 'fa-warehouse', label: 'Cold Storage Report', badge: 'Cold' }
          ]
        },
        {
          name: "Costing Reports",
          items: [
            { id: 'report_storage_cost_report', perm: 'storage_cost_report', route: '/reports/storage_cost_report', icon: 'fa-coins', label: 'Storage & Cost Report', badge: 'Val' },
            { id: 'report_floor_balance_value', perm: 'floor_balance_value', route: '/summary/floor_balance_value', icon: 'fa-scale-balanced', label: 'Floor Balance Value', badge: 'Val' },
            { id: 'report_inventory_costing', perm: 'inventory_costing', route: '/summary/inventory_costing', icon: 'fa-calculator', label: 'Inventory Costing', badge: 'Fin' },
            { id: 'report_periodic_summary', perm: 'periodic_summary', route: '/summary/periodic-report', icon: 'fa-calendar-days', label: 'Periodic Summary', badge: 'Time' },
            { id: 'report_batch_summary', perm: 'batch_summary', route: '/summary/processing', icon: 'fa-rectangle-list', label: 'Batch Summary', badge: 'Run' }
          ]
        }
      ]
    },
    {
      title: "HRMS",
      items: [
        { id: 'attendance_employee_register', perm: 'employee_registration', route: '/attendance/employee/register', icon: 'fa-id-card-clip', label: 'Staff Registration', badge: 'HR' },
        { id: 'attendance_employee_increment', perm: 'employee_increment', route: '/attendance/employee-increment', icon: 'fa-arrow-trend-up', label: 'Increment Details', badge: 'HR' },
        { id: 'attendance_daily_attendance', perm: 'daily_attendance', route: '/attendance/daily', icon: 'fa-fingerprint', label: 'Daily Attendance', badge: 'HR' },
        { id: 'attendance_salary_report', perm: 'salary_report', route: '/attendance/salary/monthly-sheet', icon: 'fa-money-check-dollar', label: 'Monthly Salary Sheet', badge: 'HR' },
        { id: 'attendance_tax_master', perm: 'tax_master', route: '/attendance/tax-master', icon: 'fa-file-shield', label: 'Payroll Master', badge: 'HR' },
        { id: 'attendance_salary_advance', perm: 'salary_advance', route: '/attendance/salary-advance', icon: 'fa-hand-holding-dollar', label: 'Salary Advance', badge: 'HR' }
      ]
    },
    {
      title: "MASTERS",
      subgroups: [
        {
          name: "Business Masters",
          items: [
            { id: 'criteria_buyers', perm: 'buyers', route: '/criteria/buyers', icon: 'fa-circle-chevron-right', label: 'Buyers', badge: 'Mstr' },
            { id: 'criteria_buyer_agents', perm: 'buyer_agents', route: '/criteria/buyer_agents', icon: 'fa-circle-chevron-right', label: 'Buyer Agents', badge: 'Mstr' },
            { id: 'criteria_suppliers', perm: 'suppliers', route: '/criteria/suppliers', icon: 'fa-circle-chevron-right', label: 'Suppliers', badge: 'Mstr' },
            { id: 'criteria_vendors', perm: 'vendors', route: '/criteria/vendors', icon: 'fa-circle-chevron-right', label: 'Vendors', badge: 'Mstr' },
            { id: 'criteria_countries', perm: 'countries', route: '/criteria/countries', icon: 'fa-circle-chevron-right', label: 'Countries', badge: 'Mstr' },
            { id: 'criteria_brands', perm: 'brands', route: '/criteria/brands', icon: 'fa-circle-chevron-right', label: 'Brands', badge: 'Mstr' },
            { id: 'criteria_purchasing_locations', perm: 'purchasing_locations', route: '/criteria/purchasing_locations', icon: 'fa-circle-chevron-right', label: 'Purchasing Locations', badge: 'Mstr' }
          ]
        },
        {
          name: "Production Masters",
          items: [
            { id: 'criteria_species', perm: 'species', route: '/criteria/species', icon: 'fa-circle-chevron-right', label: 'Species', badge: 'Prod' },
            { id: 'criteria_varieties', perm: 'varieties', route: '/criteria/varieties', icon: 'fa-circle-chevron-right', label: 'Varieties', badge: 'Prod' },
            { id: 'criteria_grades', perm: 'grades', route: '/criteria/grades', icon: 'fa-circle-chevron-right', label: 'Grades', badge: 'Prod' },
            { id: 'criteria_freezers', perm: 'freezers', route: '/criteria/freezers', icon: 'fa-circle-chevron-right', label: 'Freezers', badge: 'Prod' },
            { id: 'criteria_glazes', perm: 'glazes', route: '/criteria/glazes', icon: 'fa-circle-chevron-right', label: 'Glazes', badge: 'Prod' },
            { id: 'criteria_packing_styles', perm: 'packing_styles', route: '/criteria/packing_styles', icon: 'fa-circle-chevron-right', label: 'Packing Styles', badge: 'Prod' },
            { id: 'criteria_contractors', perm: 'contractors', route: '/criteria/contractors', icon: 'fa-circle-chevron-right', label: 'Contractors', badge: 'Prod' },
            { id: 'criteria_peeling_at', perm: 'peeling_at', route: '/criteria/peeling_at', icon: 'fa-circle-chevron-right', label: 'Peeling At', badge: 'Prod' },
            { id: 'criteria_peeling_rates', perm: 'peeling_rates', route: '/criteria/peeling_rates', icon: 'fa-circle-chevron-right', label: 'Peeling Rates', badge: 'Prod' },
            { id: 'criteria_production_at', perm: 'production_at', route: '/criteria/production_at', icon: 'fa-circle-chevron-right', label: 'Production At', badge: 'Prod' },
            { id: 'criteria_production_for', perm: 'production_for', route: '/criteria/production_for', icon: 'fa-circle-chevron-right', label: 'Production For', badge: 'Prod' },
            { id: 'criteria_production_types', perm: 'production_types', route: '/criteria/production_types', icon: 'fa-circle-chevron-right', label: 'Production Types', badge: 'Prod' },
            { id: 'criteria_chemicals', perm: 'chemicals', route: '/criteria/chemicals', icon: 'fa-circle-chevron-right', label: 'Chemicals', badge: 'Prod' },
            { id: 'criteria_purposes', perm: 'purposes', route: '/criteria/purposes', icon: 'fa-circle-chevron-right', label: 'Purposes', badge: 'Prod' },
            { id: 'criteria_grade_to_hoso', perm: 'grade_to_hoso', route: '/criteria/grade_to_hoso', icon: 'fa-circle-chevron-right', label: 'Grade to HOSO', badge: 'Prod' },
            { id: 'criteria_hoso_hlso', perm: 'hoso_hlso', route: '/criteria/hoso_hlso', icon: 'fa-circle-chevron-right', label: 'HOSO & HLSO', badge: 'Prod' }
          ]
        },
        {
          name: "Inventory Masters",
          items: [
            { id: 'criteria_cold_storage', perm: 'cold_storage', route: '/inventory/cold_storage', icon: 'fa-warehouse', label: 'Cold Storage Master', badge: 'InvM' },
            { id: 'criteria_coldstore_locations', perm: 'coldstore_locations', route: '/criteria/coldstore_locations', icon: 'fa-circle-chevron-right', label: 'Coldstore Locations', badge: 'InvM' },
            { id: 'criteria_vehicle_numbers', perm: 'vehicle_numbers', route: '/criteria/vehicle_numbers', icon: 'fa-circle-chevron-right', label: 'Vehicle Numbers', badge: 'InvM' }
          ]
        },
        {
          name: "Finance Masters",
          items: [
            { id: 'criteria_hsn_codes', perm: 'hsn_codes', route: '/criteria/hsn_codes', icon: 'fa-circle-chevron-right', label: 'HSN Codes', badge: 'FinM' }
          ]
        }
      ]
    }
  ];

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
        {menuConfig.map((cat, idx) => {
          // Check permissions for the category
          let hasVisible = false;
          if (cat.items) {
            hasVisible = cat.items.some(item => allow(item.perm));
          } else if (cat.subgroups) {
            hasVisible = cat.subgroups.some(sub => sub.items.some(item => allow(item.perm)));
          }
          if (!hasVisible) return null;

          const catClass = `cat-${cat.title.split(' ')[0]}`;

          return (
            <div key={idx} className="pillar-block">
              <div className="pillar-title">{cat.title}</div>
              <div className="menu-wrapper">
                
                {/* Render direct items */}
                {cat.items && cat.items.map((item) => {
                  if (!allow(item.perm)) return null;
                  const isActive = activePage === item.id;
                  return (
                    <div key={item.id} className="submenu-item-row">
                      <a 
                        className={`submenu-item ${catClass} ${isActive ? 'active' : ''}`}
                        href="javascript:void(0)"
                        onClick={() => {
                          setActivePage(item.id, item.route);
                          setSidebarOpen(false);
                        }}
                      >
                        <div>
                          <i className={`fa-solid ${item.icon}`}></i> 
                          {item.label}
                        </div>
                        <span className="kpi-badge">{item.badge}</span>
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
                                href="javascript:void(0)"
                                onClick={() => {
                                  setActivePage(item.id, item.route);
                                  setSidebarOpen(false);
                                }}
                              >
                                <div>
                                  <i className={`fa-solid ${item.icon}`}></i> 
                                  {item.label}
                                </div>
                                <span className="kpi-badge">{item.badge}</span>
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
      <div className="sidebar-footer">
        <div className="footer-quote">Precision in every process.</div>
        <div className="footer-powered">
          <i className="fa-brands fa-hubspot" style={{ color: 'var(--corp-dash)', marginRight: '4px' }}></i> HORIZON ENGINE
        </div>
      </div>
    </div>
  );
}
