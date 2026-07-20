import { useState } from 'react';
import './SystemArchitecture.css';

const SUPER_ADMIN_EMAIL = 'bknr.solutions@gmail.com';

const CODEBASE_STATS = [
  ['131', 'ORM Tables'],
  ['619', 'Router Endpoints'],
  ['121', 'React Pages'],
  ['147', 'HTML Templates'],
  ['24', 'Backend Services'],
  ['13', 'Alembic Migrations'],
  ['18', 'Mobile Source Files'],
];

const ARCHITECTURES = [
  {
    id: 'master',
    label: 'Master ERP',
    icon: 'fa-sitemap',
    accent: '#334155',
    title: 'SVBK ERP Master Architecture',
    summary: 'The verified application path starts with tenant security and company-scoped masters, runs seafood operations through live WIP and finished-goods ledgers, and connects sales, exports, payroll and operational costs to the double-entry finance engine.',
    flow: ['Tenant & Security', 'Company Masters', 'Seafood Processing', 'Inventory & Orders', 'Sales / Export', 'Finance & Analytics'],
    branches: [
      {
        title: 'Authentication & Tenancy',
        icon: 'fa-shield-halved',
        description: 'Signed sessions isolate company data and enforce one active device, permissions and allowed locations.',
        items: ['Companies & Users', 'OTP / Login / Password', 'Single Active Session', 'Permissions & Location Scope', 'Maintenance / Feature Flags'],
      },
      {
        title: 'Master Data',
        icon: 'fa-database',
        description: 'Company-scoped reference values populate operational, inventory, HR and financial forms.',
        items: ['Buyer / Supplier / Vendor', 'Species / Variety / Grade', 'Yield & Packing Masters', 'Plant / Peeling / Coldstore', 'Ledger / Bank / HSN Masters'],
      },
      {
        title: 'Processing & WIP',
        icon: 'fa-industry',
        description: 'Batch movement is recorded stage by stage against the canonical live Floor Balance.',
        items: ['Gate Entry & RM Purchase', 'De-Heading & Grading', 'Peeling & Soaking', 'Production & Reprocess', 'Yield / Contractor Cost'],
      },
      {
        title: 'Inventory & Orders',
        icon: 'fa-warehouse',
        description: 'Finished goods, order commitments and cold-chain movements use separate controlled ledgers.',
        items: ['Stock IN / OUT', 'Pending Orders', 'Production Requirements', 'Cold Storage Holding', 'General Store'],
      },
      {
        title: 'Sales & Export',
        icon: 'fa-ship',
        description: 'PO, shipment, invoice, container and compliance references build one export dossier.',
        items: ['Sales Dispatch', 'Proforma & Shipment', 'Commercial Invoice', 'Packing / Logistics Docs', 'Supporting Docs & Approvals'],
      },
      {
        title: 'Accounts & Costing',
        icon: 'fa-calculator',
        description: 'Source transactions post balanced vouchers and retain immutable reversal history.',
        items: ['Operational Payables', 'Voucher Posting Engine', 'Receivable / Payable', 'Bank / GST / Assets', 'Production & Inventory Costing'],
      },
      {
        title: 'HRMS & Payroll',
        icon: 'fa-people-group',
        description: 'Employee, shift and attendance data feeds statutory payroll and salary accounting.',
        items: ['Employee Registration', 'Shifts & Attendance', 'Increment / Advance', 'Statutory Master', 'Salary Sheet & Processing'],
      },
      {
        title: 'Reports & Administration',
        icon: 'fa-chart-column',
        description: 'Dashboards, reports, snapshots, audit, helpdesk and controlled data movement support governance.',
        items: ['5 Operational Dashboards', 'Processing / Stock Reports', 'Daily Snapshots', 'Import / Export', 'Helpdesk / Deploy Audit'],
      },
    ],
    explanation: 'The session company code is the primary tenant boundary. Masters supply form selections; Gate Entry creates the batch identity; Raw Material Purchase creates cost and initial floor balance; processing stages mutate live WIP; Production and Stock Entry establish finished goods; orders and exports consume that stock; invoices, payroll and source bills post to the enterprise voucher engine. Reports read the same tenant-scoped transaction tables, summaries and scheduled snapshots.',
  },
  {
    id: 'accounts',
    label: 'Accounts',
    icon: 'fa-calculator',
    accent: '#2563eb',
    title: 'Accounts & Finance',
    summary: 'Financial transactions move from operational sources into mapped ledgers, controlled settlements, statutory records and management reporting.',
    flow: ['Source Transaction', 'Ledger Mapping', 'Journal / Settlement', 'Reconciliation', 'Finance Reports'],
    branches: [
      {
        title: 'Masters & Mapping',
        icon: 'fa-diagram-project',
        description: 'Defines the accounting identity used by every downstream transaction.',
        items: ['Ledger Master', 'Bank Master', 'Item Accounting Link', 'GST / HSN Mapping', 'Fixed Asset Register'],
      },
      {
        title: 'Source Transactions',
        icon: 'fa-file-invoice-dollar',
        description: 'Captures approved costs and obligations from connected ERP modules.',
        items: ['Electricity & Diesel', 'Purchase & Packaging', 'Logistics Bills', 'Contractor / Vendor Bills', 'Salary & QA Expenses'],
      },
      {
        title: 'Core Accounting',
        icon: 'fa-book',
        description: 'Creates the formal accounting movement and its supporting voucher trail.',
        items: ['Journal Entries', 'Expense Vouchers', 'Bank Transactions', 'Payment Receipts', 'Contra & Adjustment Entries'],
      },
      {
        title: 'Receivables & Payables',
        icon: 'fa-money-bill-transfer',
        description: 'Tracks what is due, what was settled and the balance still outstanding.',
        items: ['Customer Receivables', 'Vendor Payments', 'Payment Logs', 'LC Tracking', 'Ageing & Due Balances'],
      },
      {
        title: 'Integrated Outputs',
        icon: 'fa-chart-line',
        description: 'Combines reconciled finance data for costing and decision support.',
        items: ['Export Incentives', 'Salary Processing', 'Production Cost Allocation', 'Tally Dashboard', 'Audit & Reconciliation'],
      },
    ],
    explanation: 'Operational entries first receive the correct company, location and ledger mapping. Approval creates the accounting entry; payment or receipt settles it. Reconciliation validates the balance before it reaches dashboards, costing and Tally outputs. Corrections retain a cancellation and audit trail instead of removing financial history.',
  },
  {
    id: 'hrms',
    label: 'HRMS',
    icon: 'fa-people-group',
    accent: '#7c3aed',
    title: 'Human Resources & Payroll',
    summary: 'The employee master drives shift attendance, payroll inputs, monthly salary processing and the connected finance entry.',
    flow: ['Employee Master', 'Shift & Attendance', 'Payroll Inputs', 'Salary Processing', 'HR / Finance Output'],
    branches: [
      {
        title: 'Employee Master',
        icon: 'fa-id-card',
        description: 'Maintains the single employee identity used throughout HRMS.',
        items: ['Employee Registration', 'Employment Details', 'Bank & Statutory Data', 'Work Location', 'Contact & Profile Data'],
      },
      {
        title: 'Attendance',
        icon: 'fa-calendar-check',
        description: 'Maps each employee to the applicable working schedule and daily presence.',
        items: ['Shift Master', 'Daily Attendance', 'Location Assignment', 'Leave / Absence', 'Overtime Inputs'],
      },
      {
        title: 'Payroll Inputs',
        icon: 'fa-coins',
        description: 'Collects controlled additions and deductions for the payroll period.',
        items: ['Increment History', 'Salary Advance', 'Allowances', 'Tax & Statutory Deductions', 'Attendance Adjustments'],
      },
      {
        title: 'Payroll Processing',
        icon: 'fa-money-check-dollar',
        description: 'Calculates and validates the employee-wise monthly payable amount.',
        items: ['Monthly Salary Sheet', 'Gross Pay Calculation', 'Deduction Calculation', 'Net Salary', 'Processing Status'],
      },
      {
        title: 'Outputs & Controls',
        icon: 'fa-shield-halved',
        description: 'Publishes authorized results while preserving traceability.',
        items: ['HR Command Center', 'Salary Register', 'Payment Integration', 'Journal Integration', 'Audit History'],
      },
    ],
    explanation: 'Employee Registration is the source of truth. Shift and attendance records determine payable days and overtime; increments, advances and statutory values adjust the period. Salary Processing produces the approved net amount and then passes controlled payment and journal information to Accounts.',
  },
  {
    id: 'exports',
    label: 'Export Documents',
    icon: 'fa-ship',
    accent: '#0891b2',
    title: 'Export Documentation Lifecycle',
    summary: 'A purchase order becomes a shipment workspace, commercial document set, logistics record, compliance dossier and final export register.',
    flow: ['Purchase Order', 'Shipment Workspace', 'Commercial Documents', 'Logistics & Compliance', 'Approved Dossier'],
    branches: [
      {
        title: 'Order & Shipment',
        icon: 'fa-boxes-packing',
        description: 'Establishes the shipment identity and connects every document to the order.',
        items: ['Pending Orders / PO', 'Shipment Workspace', 'Export Shipment', 'Buyer & Consignee', 'Container Allocation'],
      },
      {
        title: 'Commercial Documents',
        icon: 'fa-file-invoice',
        description: 'Defines the commercial value, product quantities and packing declaration.',
        items: ['Proforma Invoice', 'Commercial Invoice', 'Packing List', 'Purchase Contract', 'Certificate of Origin'],
      },
      {
        title: 'Logistics Documents',
        icon: 'fa-truck-fast',
        description: 'Records the physical container and carrier movement.',
        items: ['Container Stuffing', 'Shipping Bill', 'Bill of Lading', 'Transport Details', 'Dispatch Milestones'],
      },
      {
        title: 'Compliance',
        icon: 'fa-file-circle-check',
        description: 'Collects mandatory authority and buyer-specific supporting evidence.',
        items: ['Health Certificate', 'Inspection Records', 'Supporting Documents', 'Requirement Forms', 'Declaration Documents'],
      },
      {
        title: 'Governance & Register',
        icon: 'fa-folder-tree',
        description: 'Controls completion, approval and retrieval of the full shipment file.',
        items: ['Approval Status', 'Document Checklist', 'Shipment Register', 'Final Dossier', 'Audit History'],
      },
    ],
    explanation: 'The purchase order is the common reference across the export cycle. Commercial and packing data feed logistics and compliance documents, preventing duplicate shipment details. Only the completed and approved set becomes the final dossier and export register entry.',
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: 'fa-warehouse',
    accent: '#d97706',
    title: 'Inventory & Cold-Chain Control',
    summary: 'Every inbound and outbound movement updates a batch-level stock ledger, which drives available quantity, floor balance, costing and storage reports.',
    flow: ['Inbound Source', 'Batch Identification', 'Stock Ledger', 'Outbound Movement', 'Balance & Cost Reports'],
    branches: [
      {
        title: 'Inbound Sources',
        icon: 'fa-arrow-right-to-bracket',
        description: 'Introduces approved material into the available stock pool.',
        items: ['Production Output', 'Stock Entry — IN', 'Cold Storage — IN', 'Purchase Receipt', 'Opening / Adjustment Stock'],
      },
      {
        title: 'Identification',
        icon: 'fa-barcode',
        description: 'Keeps each balance traceable to its commercial and production attributes.',
        items: ['Batch & PO Number', 'Company & Location', 'Species / Variety / Grade', 'Packing & Freezer', 'Glaze & Production Date'],
      },
      {
        title: 'Stock Ledger',
        icon: 'fa-layer-group',
        description: 'Maintains the quantity truth after every authorized movement.',
        items: ['Master Cartons', 'Loose Quantity', 'Available Quantity', 'Purpose', 'Location-wise Balance'],
      },
      {
        title: 'Outbound & Transfers',
        icon: 'fa-arrow-right-from-bracket',
        description: 'Consumes or relocates available stock without losing batch traceability.',
        items: ['Stock Entry — OUT', 'Sales Allocation', 'Cold Storage Transfer', 'Production Consumption', 'Dispatch Issue'],
      },
      {
        title: 'Controls & Reports',
        icon: 'fa-clipboard-list',
        description: 'Reconciles physical stock, commitments and financial value.',
        items: ['Stock Status', 'Floor Balance', 'Pending Order Allocation', 'Inventory Costing', 'Cold Storage Cost'],
      },
    ],
    explanation: 'Inbound quantity is classified by company, location, PO, batch and product attributes before it enters the ledger. Each issue or transfer reduces the same identified pool. Stock Status and Floor Balance therefore use one available-quantity calculation, while costing and storage reports add the relevant financial rates.',
  },
  {
    id: 'processing',
    label: 'Processing',
    icon: 'fa-industry',
    accent: '#059669',
    title: 'Production & Processing',
    summary: 'Raw-material intake moves through stage-wise conversion, treatment and final packing, with yield, rejection and floor balances retained at every hand-off.',
    flow: ['Gate Entry', 'Raw Material', 'Primary Processing', 'Treatment & Quality', 'Production Register / Stock'],
    branches: [
      {
        title: 'Raw-Material Intake',
        icon: 'fa-truck-ramp-box',
        description: 'Creates the traceable source lot for all processing stages.',
        items: ['Gate Entry', 'RM Purchasing', 'Supplier & Vehicle', 'Species / Count', 'Gross & Net Weight'],
      },
      {
        title: 'Primary Conversion',
        icon: 'fa-arrows-rotate',
        description: 'Records quantity movement and yield through each physical conversion.',
        items: ['De-Heading', 'Grading', 'Required Peeling', 'HOSO Balance', 'HLSO Balance'],
      },
      {
        title: 'Treatment & Quality',
        icon: 'fa-flask',
        description: 'Tracks treatment time, chemical use, acceptance and rejected quantity.',
        items: ['Soaking Entry', 'Soaking Time', 'Chemical Details', 'Rejection Status', 'Quality Release'],
      },
      {
        title: 'Production Planning',
        icon: 'fa-list-check',
        description: 'Links production needs and actual output to the customer order.',
        items: ['Requirements by PO', 'Product Specification', 'Planned Quantity', 'Material Allocation', 'Production Status'],
      },
      {
        title: 'Register & Balances',
        icon: 'fa-clipboard-check',
        description: 'Closes the production cycle and transfers approved output to inventory.',
        items: ['Production Register', 'Stage-wise Yield', 'Peeling Balance', 'Floor Balance', 'Finished Stock Entry'],
      },
    ],
    explanation: 'Gate Entry and RM Purchasing establish the source lot. De-heading, grading and peeling pass stage balances forward; soaking and rejection record time and quality decisions. PO-wise requirements guide production, and the Production Register closes actual output into Finished Stock while preserving stage yield and Floor Balance.',
  },
];

const MODULE_DOCUMENTATION = {
  master: {
    purpose: 'Provide a single, code-backed map of the complete ERP instead of treating React pages, templates and backend services as separate systems.',
    forms: ['Authentication & Profile', 'Business / Production / Inventory Masters', 'Processing Operations', 'Finished Goods & General Store', 'Operational Bills', 'HRMS & Payroll', 'Export Document Center', 'Administration & Data Management'],
    tables: ['Tenant: companies, users, user_login_activities', 'Operations: gate_entry → production', 'WIP: floor_balance + floor_balance_snapshot', 'Finished goods: stock_entry + inventory_summary', 'Orders: pending_orders + production_requirements', 'Finance: voucher_headers + voucher_details', 'Exports: export_shipments + document tables', 'HR: employee_registration + daily_attendance'],
    apis: ['/auth/* and /menu/*', '/criteria/*', '/processing/*', '/inventory/* and /general_stock/*', '/api/* operational bills', '/attendance/* and /api/salary/*', '/finance_accounts/*', '/export_documents/*', '/reports/*, /summary/* and /dashboard/*', '/admin/* and /data-management/*'],
    sources: ['Company scope → signed session company_code', 'User scope → permissions + allowed_locations', 'Global filters → production_for + plant/location session values', 'Form dropdowns → company-scoped criteria tables', 'Live WIP → floor_balance', 'Finished stock → signed IN/OUT stock_entry movement', 'Finance truth → approved/posted voucher headers and details'],
    upstream: ['Company registration and approval', 'Default-master setup', 'User configuration and permissions'],
    downstream: ['All operational forms', 'React, server templates and mobile shell', 'Dashboards, reports, exports and scheduled snapshots'],
    controls: ['AuthMiddleware on protected requests', '30-minute configurable idle timeout', 'One current_session_id per user', 'Route-prefix permission matrix', 'Tenant and allowed-location filtering', 'Feature flags / maintenance / screen hold', 'Cancellation and audit instead of physical delete'],
    reports: ['Processing, Inventory, HR, Costing and Finance dashboards', 'Stage reports and batch summary', 'Stock, floor balance and costing reports', 'Tally statutory and enterprise finance reports', 'Export registers and shipment dossier', 'Data-management history'],
  },
  processing: {
    purpose: 'Trace purchased seafood by batch through conversion stages while protecting available WIP, calculating yield and posting source/contractor cost.',
    forms: ['Gate Entry', 'Raw Material Purchasing', 'De-Heading', 'Grading', 'Peeling', 'Soaking', 'Production', 'Reprocess'],
    tables: ['gate_entry', 'raw_material_purchasing', 'de_heading', 'grading', 'hlso_for_grading', 'peeling', 'soaking', 'production', 'reprocess_entries', 'floor_balance', 'audit_log'],
    apis: ['/processing/gate_entry', '/processing/raw_material_purchasing', '/processing/de_heading + lookup APIs', '/processing/grading + HLSO pool APIs', '/processing/peeling + rate/availability APIs', '/processing/soaking + batch/count/quantity APIs', '/processing/production + soaking/rejection status APIs', '/reports/* stage update/cancel/audit/export APIs'],
    sources: ['Batch / supplier / production company → active Gate Entry', 'Species / variety / yield → criteria masters', 'Available input quantity → FloorBalanceService / floor_balance', 'Contractor and rate → contractors + peeling_rates', 'PO requirement → pending_orders, stock_entry and yield masters', 'Soaking time → entry date/time until completion status action'],
    upstream: ['Supplier, vehicle, location and product masters', 'Pending orders and finished stock', 'HOSO↔HLSO and peeling/soaking yield masters'],
    downstream: ['Floor Balance and stage reports', 'Production Requirement calculations', 'Finished Stock Entry', 'Contractor payable vouchers', 'Production Cost Allocation'],
    controls: ['Company + global production/location scope', 'Allowed-location enforcement', 'Row locking and negative-stock guards', 'Yield and quantity validation', 'Edit-lock policy', 'Soft cancellation with stock refund', 'Linked voucher reversal on financial source cancellation'],
    reports: ['Gate Entry Report', 'RM Purchase Report', 'De-Heading Report / Monthly Bill', 'Grading Report', 'Peeling Report / Monthly Bill', 'Soaking Report', 'Production Report', 'Reprocess Report', 'Batch / Periodic Summary', 'Floor Balance Report / Value'],
  },
  inventory: {
    purpose: 'Maintain signed finished-goods and cold-chain movements, calculate available stock, cover orders and preserve daily opening snapshots.',
    forms: ['Stock Entry IN', 'Stock Entry OUT', 'Pending Orders', 'Move to Sales', 'Cold Storage Master', 'Cold Storage Holding', 'General Store Entry', 'Production Requirements'],
    tables: ['stock_entry', 'inventory_summary', 'inventory_daily_snapshot', 'pending_orders', 'production_requirements', 'sales_dispatch', 'cold_storage', 'cold_storage_holding', 'general_stock', 'general_store_items'],
    apis: ['/inventory/stock_entry', '/inventory/stock_out_report and /stock_out_save', '/inventory/stock_report', '/inventory/pending_orders and /move_to_sales', '/inventory/cold_storage*', '/general_stock/*', '/production-requirements/*', '/summary/inventory_costing and /floor_balance_value'],
    sources: ['Quantity → MC × master carton weight + loose × slab weight', 'Available stock → CASE(IN, +quantity, -quantity)', 'Product identity → stock-entry attributes and criteria masters', 'Order demand → pending_orders', 'Requirement yield → variety, grade-to-HOSO and HOSO/HLSO masters', 'Coldstore rates → cold_storage / cold_storage_holding'],
    upstream: ['Production output', 'Packing, product and coldstore masters', 'Pending export/customer orders'],
    downstream: ['Production requirements', 'Sales dispatch and export packing', 'Inventory and costing dashboards', 'Cold-storage rent', 'COGS and production-cost allocation'],
    controls: ['Company and production-location filtering', 'Matched coldstore validation', 'Available MC/loose check before OUT', 'Soft cancellation', 'Summary and requirement refresh after stock mutation', '09:00 daily inventory and floor snapshots'],
    reports: ['Stock Status', 'Inventory Dashboard', 'Floor Balance / Value', 'Pending Orders Report', 'Sales Report', 'Cold Storage Holding Report', 'Storage Cost', 'Inventory Costing', 'General Store Report'],
  },
  accounts: {
    purpose: 'Convert operational obligations, revenue, payroll, inventory cost and manual finance entries into balanced, auditable double-entry vouchers.',
    forms: ['Operational bills: electricity, diesel, purchase, logistics, QA, expenses, contractor and salary', 'Ledger / Group / Bank / Item Accounting Masters', 'Journal, Expense Voucher and Bank Transaction', 'Customer Receivable and Vendor Payment', 'Payment Receipt / Remittance', 'GST, Fixed Assets, LC and Export Incentives', 'Salary Processing and Production Cost Allocation', 'Tally Dashboard and Bank Reconciliation'],
    tables: ['account_groups, ledger_masters, voucher_types', 'voucher_headers, voucher_details, finance_audit_trails', 'bank_masters, bank_transactions, bank_reconciliations', 'customer_receivables, vendor_payments, payment_receipts', 'expense_vouchers, journal_entries, journal_entry_lines', 'bill_allocations, forex_revaluations', 'gst_register, gstr_filing_status, itc_utilization', 'fixed_asset_masters, depreciation_schedules', 'salary_processing, production_cost_allocations'],
    apis: ['/api/electricity|diesel|purchase|container|qa|expenses', '/api/contractor_bills|salaries|payment_logs|payable bills', '/finance_accounts/native-data/{module}', '/finance_accounts/ledgers, groups, voucher-types and vouchers', '/finance_accounts/*/save and cancellation APIs', '/finance_accounts/reports/*', '/finance_accounts/bank/statements + auto-match', '/finance_accounts/dashboard/summary'],
    sources: ['Party → supplier/vendor/buyer or ledger master', 'Expense / asset classification → item_accounting_links', 'Amount and tax → source bill or finance form', 'Cost center → enterprise cost center master', 'Receivable → commercial invoice / sales dispatch', 'Payroll payable → attendance + statutory + advance recovery', 'Production cost → source charges, WIP and finished output'],
    upstream: ['Operational bills and RM purchase', 'Processing contractor charges', 'Sales and commercial invoices', 'HR payroll', 'Inventory valuation'],
    downstream: ['Trial Balance, P&L and Balance Sheet', 'Cash Flow and Day Book', 'GST and ageing', 'Bank reconciliation', 'Tally / finance dashboards', 'Costing reports'],
    controls: ['Exactly one debit or credit per line', 'Total debit must equal total credit', 'Company-scoped ledgers and voucher numbering', 'Locked financial-year rejection', 'Draft → Submit → Approve / Reject state flow', 'Posted voucher cancellation via immutable contra reversal', 'FinanceAuditTrail for mutations'],
    reports: ['Trial Balance', 'Profit & Loss', 'Balance Sheet', 'Ledger Statement', 'Day Book', 'GST Summary', 'Voucher Register', 'Cash Flow', 'Receivable / Payable Ageing', 'Finance and Tally Dashboards'],
  },
  hrms: {
    purpose: 'Maintain employee identity, calculate shift-based duty and OT, apply increments/statutory/advance deductions and produce payroll accounting.',
    forms: ['Staff Registration / Profile', 'Shift Master', 'Daily Attendance', 'Increment Details', 'Payroll Statutory Master', 'Salary Advance', 'Monthly Salary Sheet', 'Salary Processing', 'HR Command Center'],
    tables: ['employee_registration', 'shifts', 'daily_attendance', 'employee_increment', 'employee_statutory_master', 'employee_salary_advance', 'employee_salary_advance_recovery', 'salary_processing'],
    apis: ['/attendance/employee/*', '/attendance/shifts/*', '/attendance/daily, /entry, /today_all and /audit_all', '/attendance/employee-increment/*', '/attendance/tax-master and /payroll/statutory/*', '/attendance/salary-advance/*', '/api/salary/get-report and adjustment APIs', '/finance_accounts/salary_processing/*', '/dashboard/hr_command_center approval APIs'],
    sources: ['Employee profile → employee_registration', 'Work schedule → company/location Shift', 'Payable duty → movements, working hours and approved duty credit', 'OT → calculated hours then manager approval', 'Salary base → employee current salary / increments', 'PF/ESI/PT/LWF → effective statutory master', 'Advance deduction → recovery schedule and remaining balance'],
    upstream: ['Company and plant masters', 'Employee master', 'Shift configuration', 'Manager OT / duty approvals'],
    downstream: ['Monthly Salary Sheet', 'Salary Processing and payment', 'Salary journal and bank voucher', 'HR dashboard and attendance audit'],
    controls: ['Unique employee ID', 'Company and plant scope', 'Unique shift per company/plant/name', 'Movement-based punch IN/OUT', 'Manager approval for OT and duty', 'Effective-date statutory record', 'Unique advance recovery per employee/month', 'Payroll cancellation reverses journals/recovery'],
    reports: ['HR Command Center', 'Daily / Today Attendance', 'Attendance Audit', 'Monthly Salary Sheet', 'Employee Print / Export', 'Salary payment and finance reports'],
  },
  exports: {
    purpose: 'Build a PO-linked, versioned and approval-controlled export dossier while connecting revenue, receivable, COGS and compliance status.',
    forms: ['Proforma Invoice', 'Export Shipment', 'Commercial Invoice', 'Packing List', 'Container Stuffing', 'Shipping Bill', 'Bill of Lading', 'Health Certificate', 'Requirement Document Center', 'Supporting Documents', 'Approvals', 'Registers / Dossier'],
    tables: ['proforma_invoices', 'export_shipments', 'export_compliance_tracker', 'commercial_invoices', 'packing_lists', 'container_stuffing', 'shipping_bills', 'bill_of_ladings', 'health_certificates', 'export_document_files', 'export_document_approvals', 'export_required_documents'],
    apis: ['/export_documents/dashboard/data', '/proforma_invoice/* approval/cancel', '/export_shipment/*', '/commercial_invoice/*', '/packing_list/*', '/container_stuffing/*', '/shipping_bill/*', '/bill_of_lading/*', '/health_certificate/*', '/requirement/{kind}/*', '/supporting_documents/* and file approvals', '/workspace, /registers and dossier/export APIs'],
    sources: ['Buyer / country → business masters', 'PO and product → pending_orders', 'Shipment reference → export_shipments', 'Invoice defaults → shipment + buyer + packing data', 'Packing traceability → batch/lot/stock entry references', 'Container details → stuffing', 'Compliance state → presence of active linked documents', 'Document approval → email-wise assignments'],
    upstream: ['Pending order / PO', 'Finished stock and batch identity', 'Buyer, country, shipping vendor and HSN masters'],
    downstream: ['Sales dispatch and customer receivable', 'Sales / COGS journals', 'GST and export incentives', 'Compliance dashboard', 'Shipment dossier and registers'],
    controls: ['Company-scoped unique document numbers', 'Shipment → invoice → downstream cancellation order', 'Soft cancellation', 'PDF bytes + private path + version/current marker', 'Selected-email unanimous approvals', 'Approval reset on document revision', 'Commercial invoice reversal of Sales and COGS vouchers'],
    reports: ['Export Dashboard', 'Shipment Workspace', 'Document Completion Register', 'Approval Queue', 'PO Requirement Checklist', 'Shipment Dossier', 'Excel Registers'],
  },
};

const ACCOUNTING_FLOW_GROUPS = [
  {
    id: 'procurement',
    title: 'Procurement, Stores & Operational Bills',
    icon: 'fa-cart-flatbed',
    description: 'Purchase-side source files create the cost/asset and the supplier or vendor outstanding in one posted voucher.',
    flows: [
      {
        name: 'Raw Material Purchasing',
        source: 'Processing → RM Purchasing · /processing/raw_material_purchasing',
        trigger: 'Saving an approved batch purchase posts a Purchase voucher linked by journal_id.',
        formula: 'Base = purchase amount; Input GST = Base × GST%; TDS = Base × TDS%; Supplier payable = Base + GST − TDS.',
        lines: [
          ['DR', 'Raw Shrimp Purchase A/c', 'Expense · Purchase Accounts', 'Purchase cost and direct expense increase'],
          ['DR', 'Input GST A/c', 'Tax recoverable', 'Input tax credit increases, when GST exists'],
          ['CR', 'TDS Payable A/c', 'Liability · Duties & Taxes', 'Statutory liability increases, when TDS exists'],
          ['CR', '{Supplier} - Supplier A/c', 'Liability · Sundry Creditors', 'Supplier outstanding increases by net payable'],
        ],
        output: 'Feeds supplier outstanding, purchase register, P&L/direct cost, GST/TDS and batch costing.',
      },
      {
        name: 'Purchase / Packaging Invoice',
        source: 'Operational Bills → Purchase · /api/purchase/entry',
        trigger: 'Invoice save resolves the selected accounting ledger or item-based stock/expense default and posts a Purchase voucher.',
        formula: 'Taxable value = invoice base; GST = grand total − taxable value; Vendor payable = grand total.',
        lines: [
          ['DR', 'Selected Purchase / Stock / Expense A/c', 'Asset or Expense', 'Stock asset or purchase/expense increases'],
          ['DR', 'Input GST A/c', 'Tax recoverable', 'Input tax credit increases, if applicable'],
          ['CR', '{Vendor} A/c', 'Liability · Sundry Creditors', 'Vendor outstanding increases'],
        ],
        output: 'Affects stock/expense classification, vendor ageing, input GST and payable reports.',
      },
      {
        name: 'General Store Stock IN',
        source: 'General Store → Stock Entry IN · /general_stock',
        trigger: 'A priced IN row posts a journal against its GRN/invoice and stores journal_id.',
        formula: 'Base = quantity × rate; GST = entered tax; Vendor payable = Base + GST.',
        lines: [
          ['DR', 'Packing Material / Chemicals / Stickers Stock A/c', 'Asset · Current Assets', 'Consumable stock value increases'],
          ['DR', 'Input GST Credit A/c', 'Asset · Current Assets', 'Recoverable GST asset increases'],
          ['CR', '{Vendor} A/c', 'Liability · Sundry Creditors', 'Vendor payable increases'],
        ],
        output: 'Creates valued store stock and vendor outstanding; GRN remains the consumption cost source.',
      },
      {
        name: 'General Store Consumption / OUT',
        source: 'General Store → Stock Entry OUT · /general_stock',
        trigger: 'An OUT row values the issue using the source GRN rate and posts a consumption journal.',
        formula: 'Consumption value = issued quantity × source GRN rate.',
        lines: [
          ['DR', 'Packing / Chemical / Sticker Consumption Expense A/c', 'Expense · Direct Expenses', 'Production consumption expense increases'],
          ['CR', 'Matching Material Stock A/c', 'Asset · Current Assets', 'Store inventory asset decreases'],
        ],
        output: 'Moves cost from store inventory to production expense without creating a new payable.',
      },
      {
        name: 'Diesel Purchase',
        source: 'Operational Bills → Diesel · /api/diesel/entry',
        trigger: 'Purchase-type diesel log posts a Purchase voucher.',
        formula: 'Base = purchase value; tax = entered tax; payable = Base + tax.',
        lines: [
          ['DR', 'Diesel Stock A/c', 'Asset · Current Assets', 'Fuel stock asset increases'],
          ['DR', 'Input GST A/c', 'Tax recoverable', 'Input tax credit increases'],
          ['CR', '{Diesel Vendor} A/c', 'Liability · Sundry Creditors', 'Vendor payable increases'],
        ],
        output: 'Keeps diesel purchase separate from actual fuel consumption expense.',
      },
      {
        name: 'Diesel Consumption',
        source: 'Operational Bills → Diesel Consumption · /api/diesel/entry',
        trigger: 'Consumption log posts a Journal voucher.',
        formula: 'Consumption amount = issued litres × applicable rate/value entered by the source file.',
        lines: [
          ['DR', 'Fuel Consumption Expense A/c', 'Expense · Direct Expenses', 'Fuel expense increases'],
          ['CR', 'Diesel Stock A/c', 'Asset · Current Assets', 'Diesel asset decreases'],
        ],
        output: 'Moves fuel value into production/direct expense and reduces diesel stock.',
      },
      {
        name: 'Freight / Container / Logistics Bill',
        source: 'Operational Bills → Logistics · /api/container/entry',
        trigger: 'Container invoice save posts a Purchase voucher.',
        formula: 'Subtotal = charge lines; GST = calculated tax; payable = subtotal + GST.',
        lines: [
          ['DR', 'Freight & Logistics Expense A/c', 'Expense · Direct Expenses', 'Export logistics expense increases'],
          ['DR', 'Input GST A/c', 'Tax recoverable', 'Input tax credit increases'],
          ['CR', '{Logistics Vendor} A/c', 'Liability · Sundry Creditors', 'Vendor outstanding increases'],
        ],
        output: 'Feeds logistics cost, payable ageing and shipment profitability.',
      },
      {
        name: 'QA Testing Bill',
        source: 'Operational Bills → QA Testing · /api/qa/entry',
        trigger: 'Lab test entry posts a Purchase voucher against report reference/batch.',
        formula: 'Taxable = base cost; GST = grand total − base cost; payable = grand total.',
        lines: [
          ['DR', 'QA Testing Expense A/c', 'Expense · Direct Expenses', 'Quality/testing cost increases'],
          ['DR', 'Input GST A/c', 'Tax recoverable', 'Input tax credit increases'],
          ['CR', '{Laboratory} A/c', 'Liability · Sundry Creditors', 'Laboratory payable increases'],
        ],
        output: 'Connects batch QA evidence with its expense and vendor outstanding.',
      },
      {
        name: 'Other Expense Bill',
        source: 'Operational Bills → Expenses · /api/expenses/entry',
        trigger: 'Expense save uses the selected posting ledger and posts a Purchase voucher.',
        formula: 'Taxable = entered amount; GST = grand total − taxable; payable = grand total.',
        lines: [
          ['DR', 'Selected Expense A/c', 'Expense · Direct/Indirect', 'Selected expense increases'],
          ['DR', 'Input GST A/c', 'Tax recoverable', 'Input tax credit increases'],
          ['CR', '{Paid To / Vendor} A/c', 'Liability · Sundry Creditors', 'Payable increases'],
        ],
        output: 'Affects the selected P&L line, GST credit and vendor ageing.',
      },
    ],
  },
  {
    id: 'processing',
    title: 'Processing, Production & Inventory Value',
    icon: 'fa-industry',
    description: 'Operational quantity movements become finance entries only when a cost is recognised, absorbed into WIP or transferred to finished goods.',
    flows: [
      {
        name: 'De-Heading / Peeling / Contractor Source Charge',
        source: 'Processing → De-Heading / Peeling and linked reports',
        trigger: 'A charge-bearing stage row posts once by source reference; edits reverse the old voucher and repost.',
        formula: 'Taxable charge = processed quantity × contractor rate; GST = taxable × GST%; payable = taxable + GST.',
        lines: [
          ['DR', '{Charge Type} Contractor Charges A/c', 'Expense · Direct Expenses', 'Processing cost increases'],
          ['DR', 'Input GST A/c', 'Tax recoverable', 'Input tax credit increases, if configured'],
          ['CR', '{Contractor} - Contractor A/c', 'Liability · Sundry Creditors', 'Contractor outstanding increases'],
        ],
        output: 'Feeds contractor monthly bills, direct processing cost and payable balance.',
      },
      {
        name: 'Contract Attendance / Duty Adjustment',
        source: 'HR Attendance reports and HR Command Center approvals',
        trigger: 'Approved contract-duty value uses the same contractor source-charge posting path.',
        formula: 'Charge = approved duty/adjustment units × applicable contract rate.',
        lines: [
          ['DR', 'Contractor Charges A/c', 'Expense · Direct Expenses', 'Labour/contract processing cost increases'],
          ['CR', '{Contractor} - Contractor A/c', 'Liability · Sundry Creditors', 'Contractor payable increases'],
        ],
        output: 'Connects approved attendance duty value to contractor accounts.',
      },
      {
        name: 'Production Cost Absorption to WIP',
        source: 'Accounts → Production Cost Allocation',
        trigger: 'Status COST_ALLOCATED or FG_TRANSFERRED posts the batch WIP absorption journal.',
        formula: 'Total batch cost = RM + labour + power + ice + water + packing + chemicals + cold storage + other cost; cost/kg = total ÷ output kg.',
        lines: [
          ['DR', 'Work In Progress A/c', 'Asset · Stock-in-hand', 'WIP inventory asset increases'],
          ['CR', 'Each selected production cost ledger', 'Expense/Purchase contra', 'Previously recorded cost is absorbed out of expense into WIP'],
        ],
        output: 'Locks batch total cost, yield, process loss and cost per kg for profitability.',
      },
      {
        name: 'WIP to Finished Goods',
        source: 'Accounts → Production Cost Allocation · status FG_TRANSFERRED',
        trigger: 'Completing cost allocation posts the second batch journal.',
        formula: 'Finished-goods value = calculated batch total cost.',
        lines: [
          ['DR', 'Finished Goods Inventory A/c', 'Asset · Stock-in-hand', 'Finished-goods inventory increases'],
          ['CR', 'Work In Progress A/c', 'Asset · Stock-in-hand', 'WIP asset decreases'],
        ],
        output: 'Makes the batch eligible for packing-list COGS valuation.',
      },
      {
        name: 'Stock Entry IN / OUT and Floor Balance',
        source: 'Inventory Stock Entry, Production Register and Floor Balance',
        trigger: 'These files update quantity ledgers; no direct voucher is created by the stock-entry save itself.',
        formula: 'Available quantity = signed IN quantity − signed OUT quantity; financial value comes from Production Cost Allocation.',
        lines: [],
        output: 'Quantity control only. GL asset movement is handled through WIP/FG allocation and COGS to prevent duplicate valuation.',
        tracking: true,
      },
      {
        name: 'Cold Storage Holding and Storage Cost',
        source: 'Inventory → Cold Storage Holding / Storage Cost Report',
        trigger: 'Holding rows and reports calculate stock days, rent and handling values; the current routed save does not directly call the posting engine.',
        formula: 'Storage value is an operational accrual input; when included in Production Cost Allocation it becomes part of WIP through that batch voucher.',
        lines: [],
        output: 'Tracking/costing input only at source. The GL changes only through a separate approved cost allocation or vendor bill.',
        tracking: true,
      },
      {
        name: 'Gate Entry, Soaking, Grading and Production Stage Rows',
        source: 'Processing operational forms',
        trigger: 'Stage saves move batch/WIP quantities and calculate yield; only explicit charge/cost workflows post to GL.',
        formula: 'Stage balances and yields are operational quantities, not independent accounting values.',
        lines: [],
        output: 'Traceability and quantity control only unless a linked contractor charge or cost allocation is posted.',
        tracking: true,
      },
    ],
  },
  {
    id: 'sales',
    title: 'Sales, Export Revenue & Cost of Goods Sold',
    icon: 'fa-ship',
    description: 'The invoice recognises revenue and receivable; packing-list valuation recognises the matching inventory cost.',
    flows: [
      {
        name: 'Commercial Invoice / Sales Dispatch',
        source: 'Export Documents → Commercial Invoice or controlled Move to Sales flow',
        trigger: 'The source invoice posts one Sales voucher and stores journal_id; duplicate source references are guarded.',
        formula: 'Invoice value INR = foreign invoice amount × exchange rate, or the source invoice INR total.',
        lines: [
          ['DR', '{Buyer} - Customer A/c', 'Asset · Sundry Debtors', 'Trade receivable increases'],
          ['CR', 'Export Sales A/c', 'Income · Sales Accounts', 'Export revenue increases'],
        ],
        output: 'Feeds customer ageing, sales register, P&L revenue and export profitability.',
      },
      {
        name: 'Packing List COGS',
        source: 'Export Documents → Packing List linked to Commercial Invoice',
        trigger: 'Packing valuation recalculates and reposts invoice COGS when packing batches change.',
        formula: 'COGS = Σ(packing-list net weight × FG-transferred batch cost per kg).',
        lines: [
          ['DR', 'Cost of Goods Sold A/c', 'Expense · Direct Expenses', 'Cost of sales increases'],
          ['CR', 'Finished Goods Inventory A/c', 'Asset · Stock-in-hand', 'Finished-goods asset decreases'],
        ],
        output: 'Matches export revenue with actual batch cost and produces gross profit.',
      },
      {
        name: 'Customer Receipt',
        source: 'Accounts → Payment Receipt · transaction other than VENDOR_PAYMENT',
        trigger: 'Receipt posts and allocates the amount against the referenced invoice/receivable.',
        formula: 'Settlement = amount INR + bank charges + adjustment; every line remains balanced.',
        lines: [
          ['DR', 'Selected Bank / Cash A/c', 'Asset · Bank/Cash', 'Bank or cash asset increases'],
          ['DR', 'Bank Charges / Settlement Adjustments A/c', 'Expense · Indirect Expenses', 'Charges/approved difference increase'],
          ['CR', '{Customer} A/c', 'Asset · Sundry Debtors', 'Customer receivable decreases'],
        ],
        output: 'Reduces invoice outstanding, updates customer ageing and increases bank/cash.',
      },
      {
        name: 'Unrealised Forex Revaluation',
        source: 'Accounts → Customer Receivables → Forex Revaluation',
        trigger: 'Period-end run revalues open foreign-currency receivables; prior active run is reversed on roll-forward.',
        formula: 'Foreign open balance = foreign invoice × INR open balance ÷ booked INR value; gain/loss = foreign open balance × (closing rate − booking rate).',
        lines: [
          ['DR/CR', '{Customer} A/c', 'Asset · Sundry Debtors', 'Receivable increases for gain or decreases for loss'],
          ['CR', 'Unrealised Forex Gain A/c', 'Income · Indirect Incomes', 'Unrealised income increases when rate rises'],
          ['DR', 'Unrealised Forex Loss A/c', 'Expense · Indirect Expenses', 'Unrealised expense increases when rate falls'],
        ],
        output: 'Restates receivables at closing rate and reports the unrealised gain/loss separately.',
      },
      {
        name: 'Export Incentive, LC and Supporting Documents',
        source: 'Export Incentive Register, LC Tracking and Export Document Center',
        trigger: 'Current save paths register entitlement/status/documents but do not create voucher_headers.',
        formula: 'Recorded values remain memorandum/control values until a controlled accounting voucher is posted.',
        lines: [],
        output: 'Tracking only. They must not be treated as GL income, receivable or bank balance yet.',
        tracking: true,
      },
    ],
  },
  {
    id: 'payroll',
    title: 'Payroll, Payables & Settlements',
    icon: 'fa-money-check-dollar',
    description: 'Approval first creates the expense and liabilities; payment later clears the party liability against bank or cash.',
    flows: [
      {
        name: 'Salary Approval',
        source: 'HRMS → Salary Processing / Accounts Salary Approval',
        trigger: 'Approved salary posts one employee/month Journal voucher.',
        formula: 'Expense = gross salary + employer PF + employer EDLI + employer ESI + employer LWF; credits split into net salary and statutory/recovery liabilities.',
        lines: [
          ['DR', 'Salaries & Wages Expense A/c', 'Expense · Indirect Expenses', 'Payroll expense including employer contributions increases'],
          ['CR', 'Salaries Payable A/c', 'Liability · Current Liabilities', 'Employee net salary payable increases'],
          ['CR', 'PF / EPS / EDLI / ESI / PT / TDS / LWF Payable', 'Liability · Duties & Taxes', 'Statutory payables increase'],
          ['CR', 'Employee Salary Advances A/c', 'Asset · Loans & Advances', 'Advance receivable asset decreases on recovery'],
          ['CR', 'Other Deductions A/c', 'Liability · Current Liabilities', 'Other deduction liability increases'],
        ],
        output: 'Feeds payroll expense, salary outstanding, statutory dues and advance recovery.',
      },
      {
        name: 'Salary Payment',
        source: 'Operational Payables → Salaries',
        trigger: 'Full or partial payment posts a Payment voucher and logs the selected bank/cash ledger.',
        formula: 'Payment ≤ current employee salary outstanding.',
        lines: [
          ['DR', 'Salaries Payable A/c', 'Liability · Current Liabilities', 'Salary liability decreases'],
          ['CR', 'Selected Bank / Cash A/c', 'Asset · Bank/Cash', 'Bank or cash asset decreases'],
        ],
        output: 'Updates salary paid/outstanding status and bank/cash balance.',
      },
      {
        name: 'Vendor / Supplier Payment',
        source: 'Operational Payables → Vendor Bills / Supplier Bills',
        trigger: 'Payment validates outstanding and unique UTR/reference, then posts a Payment voucher.',
        formula: 'Allowed payment ≤ bill total − all active prior payments; advance payment follows the configured purpose.',
        lines: [
          ['DR', '{Vendor/Supplier} A/c', 'Liability · Sundry Creditors', 'Trade payable decreases'],
          ['CR', 'Selected Bank / Cash A/c', 'Asset · Bank/Cash', 'Bank or cash asset decreases'],
        ],
        output: 'Reduces source-bill outstanding and updates payable ageing/payment history.',
      },
      {
        name: 'Contractor Payment',
        source: 'Operational Payables → Contractor Bills',
        trigger: 'Monthly contractor payment validates remaining bill value and posts a Payment voucher.',
        formula: 'Remaining = contractor bill total − active payments; payment cannot exceed remaining.',
        lines: [
          ['DR', '{Contractor} - Contractor A/c', 'Liability · Sundry Creditors', 'Contractor payable decreases'],
          ['CR', 'Selected Bank / Cash A/c', 'Asset · Bank/Cash', 'Bank or cash asset decreases'],
        ],
        output: 'Updates contractor paid, partial/paid status, outstanding and payment history.',
      },
      {
        name: 'Generic Vendor Payment / Receipt Allocation',
        source: 'Accounts → Payment Receipt · VENDOR_PAYMENT',
        trigger: 'Payment voucher posts and allocates to the selected source bill.',
        formula: 'Settlement = amount INR + bank charges + adjustments.',
        lines: [
          ['DR', '{Vendor} A/c', 'Liability · Sundry Creditors', 'Vendor payable decreases'],
          ['DR', 'Bank Charges / Settlement Adjustments A/c', 'Expense · Indirect Expenses', 'Charges/approved differences increase'],
          ['CR', 'Selected Bank / Cash A/c', 'Asset · Bank/Cash', 'Bank or cash asset decreases'],
        ],
        output: 'Clears the linked payable while separately recognising settlement costs.',
      },
    ],
  },
  {
    id: 'controls',
    title: 'Tax, Assets, Banking & Controlled Journals',
    icon: 'fa-scale-balanced',
    description: 'Specialised finance files post only through validated, balanced voucher lines and retain reversal history.',
    flows: [
      {
        name: 'GST Register',
        source: 'Accounts → GST Register',
        trigger: 'PURCHASE, SALES/EXPORT, RCM, credit-note or debit-note save creates the matching voucher.',
        formula: 'Invoice total = taxable value + CGST + SGST + IGST + cess; RCM records both input GST and RCM output liability.',
        lines: [
          ['DR', 'GST Purchase / Input GST A/c', 'Expense + Tax recoverable', 'Purchase value/input tax increases'],
          ['CR', '{Supplier} A/c / RCM Output GST Payable', 'Liability', 'Supplier or statutory payable increases'],
          ['DR', '{Customer} A/c', 'Asset · Sundry Debtors', 'Sales receivable increases'],
          ['CR', 'Export Sales / Output GST A/c', 'Income + Tax liability', 'Revenue and output tax increase'],
        ],
        output: 'Feeds GST summary, input credit, output liability and party balances.',
      },
      {
        name: 'Fixed Asset Depreciation',
        source: 'Accounts → Fixed Assets → Run Depreciation',
        trigger: 'Monthly run posts one journal per active eligible asset.',
        formula: 'SLM = (cost − salvage) ÷ useful-life months; WDV = opening WDV × annual rate ÷ 12; never below salvage value.',
        lines: [
          ['DR', 'Depreciation Expense A/c', 'Expense · Indirect Expenses', 'Period depreciation expense increases'],
          ['CR', 'Accumulated Depreciation A/c', 'Contra Asset · Fixed Assets', 'Net fixed-asset carrying value decreases'],
        ],
        output: 'Updates accumulated depreciation, closing WDV, P&L and balance sheet.',
      },
      {
        name: 'Fixed Asset Registration / Acquisition Value',
        source: 'Accounts → Fixed Assets',
        trigger: 'Asset registration stores the asset identity, purchase cost and ledger mappings; registration itself does not post the acquisition invoice.',
        formula: 'Purchase cost becomes the depreciation base, but the asset acquisition must already be posted through Purchase/Journal with the fixed-asset ledger.',
        lines: [],
        output: 'Master/register only at creation; monthly depreciation is the direct GL-connected action.',
        tracking: true,
      },
      {
        name: 'Account Group, Ledger, Bank, Item Link and Cost Center Masters',
        source: 'Accounts → Masters & Mapping',
        trigger: 'Master save defines valid account identity and operational-to-ledger mapping; it does not create financial movement.',
        formula: 'Opening balance + posted voucher movement determines closing ledger balance.',
        lines: [],
        output: 'Configuration only. These records control which asset, liability, expense or income ledger each posting can use.',
        tracking: true,
      },
      {
        name: 'Bank Transaction',
        source: 'Accounts → Bank Transactions',
        trigger: 'A bank debit or credit creates a balanced Receipt/Payment voucher against linked party or clearing/suspense.',
        formula: 'Exactly one of bank debit or bank credit must be positive.',
        lines: [
          ['DR', 'Bank A/c', 'Asset · Bank Accounts', 'Bank increases for a receipt'],
          ['CR', 'Party / Bank Clearing A/c', 'Liability or Asset', 'Counterparty is credited for a receipt'],
          ['DR', 'Party / Bank Clearing A/c', 'Liability or Asset', 'Counterparty is debited for a payment'],
          ['CR', 'Bank A/c', 'Asset · Bank Accounts', 'Bank decreases for a payment'],
        ],
        output: 'Feeds bank book, cash flow and bank reconciliation.',
      },
      {
        name: 'Controlled Expense Voucher',
        source: 'Accounts → Expense Voucher',
        trigger: 'Admin correction/manual expense path only; normal source bills should not be re-entered here.',
        formula: 'Total = expense amount + GST.',
        lines: [
          ['DR', 'Selected Expense A/c', 'Expense', 'Expense increases'],
          ['DR', 'Input GST A/c', 'Tax recoverable', 'Input credit increases'],
          ['CR', 'Vendor A/c or Cash A/c', 'Liability or Asset', 'Payable increases or cash decreases'],
        ],
        output: 'Posts exceptional expenses while duplicate-source policy protects normal bills.',
      },
      {
        name: 'Manual Journal',
        source: 'Accounts → Journal Entry',
        trigger: 'Controlled adjustment only; requires at least two valid company ledgers.',
        formula: 'Σ debit lines must equal Σ credit lines; every line must contain only one positive side.',
        lines: [
          ['DR', 'User-selected ledger(s)', 'Any valid account type', 'Effect follows the selected account type'],
          ['CR', 'User-selected ledger(s)', 'Any valid account type', 'Effect follows the selected account type'],
        ],
        output: 'Handles authorised accruals/reclassifications without bypassing balance and audit controls.',
      },
      {
        name: 'Electricity Reading / Note',
        source: 'Operational Bills → Electricity',
        trigger: 'The current source records readings/notes but does not create a linked voucher.',
        formula: 'No GL amount is recognised until the reading is converted to an approved accounting bill.',
        lines: [],
        output: 'Operational tracking only; it does not change expense, payable, cash or bank balances.',
        tracking: true,
      },
    ],
  },
];

const MODULE_DETAILED_FLOWS = {
  master: {
    eyebrow: 'PIN-TO-PIN ERP CONTROL MAP',
    title: 'Every Tenant, Master and Transaction Dependency',
    badge: 'TENANT + SECURITY + OPERATIONS',
    columns: ['Step', 'System Component / Data Store', 'Data Classification', 'Exact Effect'],
    legend: [
      ['TENANT', 'Company code is the primary data boundary'],
      ['USER', 'Permissions and locations narrow access'],
      ['MASTER', 'Reference data feeds forms; it does not create transactions'],
      ['TXN', 'Operational save creates controlled business records'],
      ['OUTPUT', 'Reports read the same scoped records'],
    ],
    groups: [
      {
        id: 'master-security', title: 'Authentication, Session & Tenant Boundary', icon: 'fa-shield-halved',
        description: 'Every protected request is resolved to one company, user, session and permission scope before business data is read.',
        flows: [
          {
            name: 'Company Login and Session Creation', source: 'First Login / Auth pages · /auth/*',
            trigger: 'Approved credentials create a signed session containing company_code, email, permissions, allowed locations and current_session_id.',
            formula: 'Effective access = active company ∩ active user ∩ current device session ∩ permitted route.',
            lines: [['READ', 'companies + users', 'Tenant and identity', 'Validates approved company/user status'], ['WRITE', 'session + user_login_activities', 'Security audit', 'Creates the active authenticated context'], ['CONTROL', 'current_session_id', 'Single-device control', 'A newer login invalidates the older device']],
            output: 'All React, template and native requests inherit the same tenant and login identity.',
          },
          {
            name: 'Route Permission Enforcement', source: 'Auth middleware + access-control route matrix',
            trigger: 'Runs before protected API/page execution.',
            formula: 'Allowed = super-admin OR ALL permission OR matching route permission; location rows are additionally intersected with allowed_locations.',
            lines: [['READ', 'Session permissions', 'Authorisation', 'Matches page/API prefix to configured permission'], ['READ', 'allowed_locations', 'Row scope', 'Limits location-bearing queries'], ['BLOCK', '401 / 403 response', 'Security outcome', 'Expired sessions redirect to login; unauthorised routes are rejected']],
            output: 'One user configuration applies consistently to React, templates and native shared APIs.',
          },
          {
            name: 'Global Company and Location Filters', source: 'Top global filters / session filter endpoints',
            trigger: 'User changes Production For or production location.',
            formula: 'Visible rows = company_code + selected production_for + selected/allowed location.',
            lines: [['WRITE', 'Signed session filter values', 'User context', 'Persists the current cross-page selection'], ['READ', 'production_for + production_at masters', 'Master data', 'Provides valid selectable scope'], ['APPLY', 'Operational/report queries', 'Query filter', 'Keeps dashboards, forms and reports on the same scope']],
            output: 'Page totals and table rows remain comparable across modules.',
          },
        ],
      },
      {
        id: 'master-data', title: 'Master Data Dependency Chain', icon: 'fa-database',
        description: 'Company-scoped masters provide validated choices and rates to downstream forms without generating business balances themselves.',
        flows: [
          {
            name: 'Business Party Masters', source: 'Suppliers, Vendors, Buyers, Agents, Contractors and Shipping Vendors',
            trigger: 'Create/update a company-scoped party master.',
            formula: 'Dropdown choices = active records for session company.',
            lines: [['WRITE', 'Party criteria tables', 'Master', 'Creates canonical spelling and identity'], ['READ', 'Purchase / sales / contractor / export forms', 'Downstream dependency', 'Prevents unrelated tenant values from appearing'], ['MAP', 'Party ledger naming/mapping', 'Finance dependency', 'Provides supplier, vendor, customer or contractor identity for posting']],
            output: 'The same party identity follows source document, payable/receivable, payment and reports.',
          },
          {
            name: 'Seafood Product and Yield Masters', source: 'Species, Variety, Grade, HOSO/HLSO, Grade-to-HOSO, Glaze and Yield masters',
            trigger: 'Maintain product identity or conversion/yield rules.',
            formula: 'Required input = order output requirement ÷ configured stage yield; product key combines species/variety/grade/packing/glaze.',
            lines: [['WRITE', 'Criteria/yield tables', 'Master', 'Stores valid product and conversion rules'], ['READ', 'Processing forms', 'Operational dependency', 'Populates species, variety, grade and expected yield'], ['READ', 'Production Requirements', 'Calculation dependency', 'Converts PO finished-goods demand to raw/WIP demand']],
            output: 'Processing, requirements, stock and reports use the same product definition.',
          },
          {
            name: 'Location, Plant and Cold-Chain Masters', source: 'Production For, Production At, Peeling At, Purchasing Location, Freezer and Coldstore masters',
            trigger: 'Create an active company location or storage reference.',
            formula: 'Selectable location = tenant master ∩ user allowed_locations.',
            lines: [['WRITE', 'Location criteria tables', 'Master', 'Defines operational ownership'], ['READ', 'All location-aware forms', 'Scope dependency', 'Populates and validates selected plant/location'], ['GROUP', 'Dashboards and reports', 'Reporting dimension', 'Produces company/location subtotals without cross-tenant leakage']],
            output: 'Every batch, employee, stock row and report can be traced to its operating location.',
          },
          {
            name: 'Finance and Item Mapping Masters', source: 'Account Groups, Ledgers, Banks, HSN, Item Accounting Links and Cost Centers',
            trigger: 'Create/update a finance mapping.',
            formula: 'Posting ledger = selected active company ledger, otherwise the code-defined source default.',
            lines: [['WRITE', 'ledger_masters + account_groups', 'Finance master', 'Defines account identity and type'], ['WRITE', 'item_accounting_links + HSN/GST mapping', 'Posting map', 'Maps item to purchase, sales, inventory, COGS and WIP'], ['READ', 'Posting engine and finance forms', 'Control dependency', 'Rejects invalid tenant/type selections']],
            output: 'Source transactions reach the correct asset, liability, expense or income ledger.',
          },
        ],
      },
      {
        id: 'master-lifecycle', title: 'Transaction, Reporting & Governance Lifecycle', icon: 'fa-arrows-spin',
        description: 'Operational sources write once, services calculate balances, reports read them and audit records preserve every correction.',
        flows: [
          {
            name: 'Operational Source Transaction', source: 'Processing, Inventory, Export, HRMS or Operational Bill form',
            trigger: 'Validated Save action.',
            formula: 'Transaction identity = company + source reference/batch/document number + row identity.',
            lines: [['VALIDATE', 'Pydantic/form and service rules', 'Input control', 'Checks required values, quantities and tenant scope'], ['WRITE', 'Owning transaction table', 'Business transaction', 'Creates the source-of-truth row'], ['LINK', 'journal_id / related IDs', 'Integration reference', 'Connects finance, stock, document or audit effects']],
            output: 'Users enter data once in the owning module; connected systems consume the saved source.',
          },
          {
            name: 'Dashboards, Reports and Scheduled Snapshots', source: '/dashboard/* · /reports/* · /summary/*',
            trigger: 'Live page request or scheduled daily snapshot.',
            formula: 'KPI/table total = scoped active transactions, with cancelled rows excluded and signed movements applied.',
            lines: [['READ', 'Live transaction tables', 'Current truth', 'Builds real-time tables and KPIs'], ['WRITE', 'Daily snapshot tables', 'Historical truth', 'Preserves opening/day comparison values'], ['EXPORT', 'Structured report endpoints', 'Output', 'Feeds React, templates and authorised exports']],
            output: 'All presentation layers use the same scoped calculations.',
          },
          {
            name: 'Edit, Cancel and Audit', source: 'Report row actions and controlled admin actions',
            trigger: 'Authorised edit/cancel within policy.',
            formula: 'Corrected state = reverse/refund old effects + apply new values; financial history is never silently deleted.',
            lines: [['WRITE', 'audit_log / finance_audit_trails', 'Immutable history', 'Records who changed what and when'], ['REVERSE', 'Stock/floor/voucher links', 'Balance correction', 'Returns old quantity/value before replacement'], ['FLAG', 'is_cancelled / status', 'Soft cancellation', 'Removes record from active totals while retaining evidence']],
            output: 'Reports stay correct and every correction remains traceable.',
          },
        ],
      },
    ],
  },
  hrms: {
    eyebrow: 'PIN-TO-PIN HRMS MAP',
    title: 'Employee → Attendance → Payroll → Accounts',
    badge: 'EMPLOYEE + DUTY + PAYROLL',
    columns: ['Step', 'Affected Record / Component', 'Data Type', 'Exact Effect'],
    legend: [['MASTER', 'Employee and shift identity'], ['MOVEMENT', 'Punch and attendance events'], ['INPUT', 'Increment, advance and statutory values'], ['CALC', 'Monthly payroll calculation'], ['POST', 'Accounts liability and payment']],
    groups: [
      {
        id: 'hr-employee', title: 'Employee Identity & Work Assignment', icon: 'fa-id-card',
        description: 'Employee Registration is the single profile used by attendance, payroll, profile and finance outputs.',
        flows: [
          {
            name: 'Employee Registration', source: 'HRMS → Staff Registration',
            trigger: 'Save a unique employee ID under the session company.',
            formula: 'Active employee identity = company_id + employee_id; login email links profile display.',
            lines: [['WRITE', 'employee_registration', 'Employee master', 'Stores name, DOB, blood group, designation, email, address and work location'], ['READ', 'Profile and HR Command Center', 'Presentation', 'Displays the same default employee data'], ['LINK', 'Attendance and payroll rows', 'Foreign business key', 'Employee ID connects all duty and salary history']],
            output: 'One employee identity is reused across React, template and native views.',
          },
          {
            name: 'Shift Assignment', source: 'HRMS → Shift Master / Attendance shift icons',
            trigger: 'Assign an active company/location shift.',
            formula: 'Expected work window = shift start/end + configured breaks and grace rules.',
            lines: [['WRITE', 'shifts', 'Schedule master', 'Defines working time by company/plant'], ['READ', 'Daily attendance', 'Calculation input', 'Determines late, early, duty and OT windows'], ['CONTROL', 'Company + location uniqueness', 'Validation', 'Prevents invalid duplicate shift definitions']],
            output: 'Attendance calculations use the applicable plant shift instead of a free-text schedule.',
          },
        ],
      },
      {
        id: 'hr-attendance', title: 'Daily Attendance & Approval', icon: 'fa-calendar-check',
        description: 'Movement events become daily duty, overtime and approval-ready payroll inputs.',
        flows: [
          {
            name: 'Punch IN / OUT and Daily Attendance', source: 'HRMS → Daily Attendance',
            trigger: 'Record employee movement or approved daily entry.',
            formula: 'Worked time = valid OUT − IN movements; duty/OT derives from shift thresholds and approved adjustments.',
            lines: [['WRITE', 'daily_attendance', 'Daily transaction', 'Stores movements, hours, presence and status'], ['READ', 'employee_registration + shifts', 'Master inputs', 'Resolves employee and expected schedule'], ['CALC', 'working_hours / overtime', 'Derived values', 'Produces payroll-relevant duty and OT']],
            output: 'Today view, audit and monthly salary sheet read the same daily records.',
          },
          {
            name: 'Manager Duty / OT Approval', source: 'HR Command Center',
            trigger: 'Manager approves/rejects calculated duty credit or overtime.',
            formula: 'Payable duty/OT uses approved value, not an unapproved movement estimate.',
            lines: [['READ', 'Daily calculated values', 'Approval source', 'Shows exception requiring decision'], ['WRITE', 'Approval/status fields', 'Controlled adjustment', 'Locks approved payroll input'], ['AUDIT', 'Attendance audit', 'Governance', 'Records decision and actor']],
            output: 'Only authorised duty and overtime reach payroll.',
          },
        ],
      },
      {
        id: 'hr-payroll', title: 'Payroll Inputs, Calculation & Settlement', icon: 'fa-money-check-dollar',
        description: 'Effective-dated salary inputs combine with attendance to create net payable and connected finance entries.',
        flows: [
          {
            name: 'Increment and Salary Base', source: 'HRMS → Increment Details',
            trigger: 'Save an effective salary change.',
            formula: 'Applicable salary = latest approved increment/base effective on or before payroll month.',
            lines: [['WRITE', 'employee_increment', 'Effective-dated input', 'Preserves salary revision history'], ['READ', 'Monthly salary calculation', 'Payroll input', 'Selects the applicable base amount'], ['AUDIT', 'Increment history', 'Governance', 'Prevents silent overwrite of prior salary']],
            output: 'Payroll uses the correct salary for each period.',
          },
          {
            name: 'Statutory Master', source: 'HRMS → Payroll Statutory Master',
            trigger: 'Save effective PF, EPS, EDLI, ESI, PT, LWF or tax rules.',
            formula: 'Contribution/deduction = applicable wage base × effective rate, subject to configured limits.',
            lines: [['WRITE', 'employee_statutory_master', 'Effective rule', 'Stores employee/statutory applicability'], ['CALC', 'Employee + employer contributions', 'Payroll deductions/cost', 'Splits net pay and company contribution'], ['POST', 'Statutory payable ledgers', 'Finance output', 'Salary approval credits each liability']],
            output: 'Payslip deductions and statutory accounts use the same calculated components.',
          },
          {
            name: 'Salary Advance and Recovery', source: 'HRMS → Salary Advance',
            trigger: 'Approve an advance and its recovery schedule.',
            formula: 'Remaining advance = approved advance − active recoveries; monthly deduction is capped by remaining balance.',
            lines: [['WRITE', 'employee_salary_advance', 'Employee receivable', 'Creates advance balance'], ['WRITE', 'employee_salary_advance_recovery', 'Monthly recovery', 'Reduces remaining advance'], ['POST', 'Employee Salary Advances A/c', 'Asset effect', 'Salary journal credits recovered amount']],
            output: 'Employee outstanding and payroll deduction stay synchronised.',
          },
          {
            name: 'Monthly Salary Sheet', source: 'HRMS → Monthly Salary Sheet',
            trigger: 'Select payroll month/company/location.',
            formula: 'Gross/net uses payable duty, OT, salary base, additions, statutory deductions, advance recovery and other deductions.',
            lines: [['READ', 'employee + attendance + increments', 'Core inputs', 'Builds employee-wise earnings'], ['READ', 'statutory + advance tables', 'Deduction inputs', 'Calculates legal/recovery deductions'], ['CALC', 'Gross, deductions, net payable', 'Payroll result', 'Produces reviewable monthly values']],
            output: 'Provides the verified inputs used by Salary Processing.',
          },
          {
            name: 'Salary Processing and Payment', source: 'HRMS/Accounts → Salary Processing and Operational Payables',
            trigger: 'Approval posts salary expense/payables; payment later clears Salaries Payable against selected bank/cash.',
            formula: 'Net payable = gross/additions − employee deductions/recoveries; accounting debit and credits remain equal.',
            lines: [['WRITE', 'salary_processing', 'Payroll transaction', 'Stores approved payroll result'], ['POST', 'salary_journal_id', 'Expense/liability voucher', 'Creates salary and statutory liabilities'], ['POST', 'payment_journal_id + salary_payment_logs', 'Settlement voucher', 'Reduces salary payable and bank/cash']],
            output: 'HR status, employee outstanding and finance ledgers remain linked.',
          },
        ],
      },
    ],
  },
  exports: {
    eyebrow: 'PIN-TO-PIN EXPORT DOCUMENT MAP',
    title: 'PO → Shipment → Documents → Approval → Accounts',
    badge: 'ORDER + COMPLIANCE + DOSSIER',
    columns: ['Stage', 'Document / Data Store', 'Record Type', 'Exact Effect'],
    legend: [['PO', 'Commercial order identity'], ['DOC', 'Shipment document'], ['STOCK', 'Batch and quantity traceability'], ['APPROVAL', 'Assigned review control'], ['ACCOUNTS', 'Revenue, receivable and COGS']],
    groups: [
      {
        id: 'export-order', title: 'Order & Shipment Identity', icon: 'fa-file-contract',
        description: 'The PO and shipment references are the common keys reused by all commercial, logistics and compliance documents.',
        flows: [
          {
            name: 'Pending Order / Buyer PO', source: 'Inventory → Pending Orders',
            trigger: 'Save buyer, shipment, product specification and ordered MC.',
            formula: 'Order demand = Σ item MC × packing weight; INR estimate = foreign price × exchange rate × quantity.',
            lines: [['WRITE', 'pending_orders', 'Commercial demand', 'Creates PO-wise product requirements'], ['READ', 'Production Requirements', 'Planning dependency', 'Calculates uncovered production demand'], ['READ', 'Export document forms', 'Document dependency', 'Supplies buyer, country, product and PO']],
            output: 'One PO reference connects planning, stock, shipment and export documentation.',
          },
          {
            name: 'Proforma Invoice', source: 'Export Documents → Proforma Invoice',
            trigger: 'Create/version the buyer offer against PO.',
            formula: 'Proforma value = Σ product quantity × quoted unit price, with currency/exchange context.',
            lines: [['WRITE', 'proforma_invoices', 'Commercial document', 'Records pre-shipment offer'], ['LINK', 'PO / buyer / shipment references', 'Traceability', 'Prevents duplicate re-entry downstream'], ['CONTROL', 'Approval/cancellation status', 'Governance', 'Tracks current valid version']],
            output: 'Becomes the commercial starting document without posting revenue.',
          },
          {
            name: 'Export Shipment Workspace', source: 'Export Documents → Shipment / Workspace',
            trigger: 'Create a company-scoped shipment reference and assign PO/container context.',
            formula: 'Shipment completeness = required active documents present ÷ required document set.',
            lines: [['WRITE', 'export_shipments', 'Shipment master transaction', 'Creates the shipment identity'], ['READ', 'pending_orders + buyer masters', 'Source defaults', 'Populates commercial details'], ['GROUP', 'All document tables', 'Workspace relationship', 'Collects the dossier under one shipment']],
            output: 'Workspace shows one consolidated shipment status.',
          },
        ],
      },
      {
        id: 'export-docs', title: 'Commercial, Packing & Logistics Documents', icon: 'fa-folder-tree',
        description: 'Downstream documents reuse the shipment, invoice, packing and container data in a controlled sequence.',
        flows: [
          {
            name: 'Commercial Invoice', source: 'Export Documents → Commercial Invoice',
            trigger: 'Save a unique company invoice against the shipment.',
            formula: 'Invoice INR = foreign invoice total × exchange rate.',
            lines: [['WRITE', 'commercial_invoices', 'Commercial source', 'Creates final invoice and buyer receivable basis'], ['POST', 'journal_id', 'Sales accounting', 'DR customer; CR Export Sales'], ['LINK', 'Packing and downstream documents', 'Parent reference', 'Supplies invoice identity and values']],
            output: 'Creates revenue/receivable and anchors final export documents.',
          },
          {
            name: 'Packing List and Batch Cost', source: 'Export Documents → Packing List',
            trigger: 'Save packing rows with batch/lot and net weight.',
            formula: 'COGS = Σ net weight × FG-transferred batch cost/kg.',
            lines: [['WRITE', 'packing_lists', 'Packing document', 'Stores carton/weight/batch traceability'], ['READ', 'production_cost_allocations', 'Valuation source', 'Requires completed FG batch cost'], ['POST', 'commercial_invoice.cogs_journal_id', 'Cost accounting', 'DR COGS; CR Finished Goods Inventory']],
            output: 'Matches invoice revenue to the exact dispatched batch cost.',
          },
          {
            name: 'Container Stuffing', source: 'Export Documents → Container Stuffing',
            trigger: 'Assign packed cargo to container/seal and stuffing details.',
            formula: 'Stuffed totals aggregate linked packing/carton and weight rows.',
            lines: [['READ', 'Packing List', 'Cargo source', 'Reuses packed product values'], ['WRITE', 'container_stuffing', 'Logistics document', 'Stores container, seal and stuffing event'], ['LINK', 'Shipping Bill / B/L', 'Downstream dependency', 'Provides container identity']],
            output: 'Preserves cargo-to-container traceability.',
          },
          {
            name: 'Shipping Bill and Bill of Lading', source: 'Export Documents → Shipping Bill / Bill of Lading',
            trigger: 'Register customs and carrier document references.',
            formula: 'Document values inherit shipment/invoice/container facts; no separate stock or revenue calculation.',
            lines: [['WRITE', 'shipping_bills', 'Customs document', 'Records shipping bill and customs facts'], ['WRITE', 'bill_of_ladings', 'Carrier document', 'Records B/L and voyage facts'], ['READ', 'Shipment + invoice + stuffing', 'Shared source', 'Keeps repeated details consistent']],
            output: 'Completes logistics evidence and export registers.',
          },
        ],
      },
      {
        id: 'export-control', title: 'Compliance, Approval & Final Dossier', icon: 'fa-file-circle-check',
        description: 'Required documents are versioned, privately stored and approved by assigned users before final completion.',
        flows: [
          {
            name: 'Health Certificate and Requirement Documents', source: 'Health Certificate + Requirement Document Center',
            trigger: 'Create the required authority/buyer document against shipment/PO.',
            formula: 'Requirement status = current active version + required metadata + applicable approval state.',
            lines: [['WRITE', 'health_certificates / requirement records', 'Compliance document', 'Stores structured certificate values'], ['LINK', 'shipment + invoice + PO', 'Traceability', 'Connects evidence to commercial source'], ['STATUS', 'export_compliance_tracker', 'Completion control', 'Updates document presence/compliance state']],
            output: 'Shows exactly which compliance requirement is complete or missing.',
          },
          {
            name: 'Supporting Document Upload & Versioning', source: 'Export Documents → Supporting Documents',
            trigger: 'Upload a private file for shipment/document type.',
            formula: 'Only one current version per logical document; a new revision makes the previous version non-current.',
            lines: [['WRITE', 'export_document_files', 'Private binary/file metadata', 'Creates versioned document evidence'], ['STORE', 'Private upload path / DB bytes', 'Protected content', 'Prevents public static exposure'], ['RESET', 'Assigned approvals', 'Revision control', 'New content requires renewed review']],
            output: 'Maintains current document and complete revision history.',
          },
          {
            name: 'Document Approval', source: 'Export Documents → Approval Queue',
            trigger: 'Assigned email approves/rejects the current document version.',
            formula: 'Approved = every assigned active reviewer has approved the current version.',
            lines: [['READ', 'Approval assignments', 'Permission scope', 'Shows only assigned reviews'], ['WRITE', 'export_document_approvals', 'Decision record', 'Stores reviewer/date/status'], ['CONTROL', 'Current version', 'Integrity rule', 'Old-version approval cannot approve revised content']],
            output: 'Workspace and dossier expose a defensible approval state.',
          },
          {
            name: 'Registers and Shipment Dossier', source: 'Export Registers / Dossier',
            trigger: 'Open/export a shipment register or final dossier.',
            formula: 'Dossier = current active documents + shipment/commercial data + approvals + compliance checklist.',
            lines: [['READ', 'All linked export tables', 'Consolidated output', 'Builds one shipment file'], ['FILTER', 'company + shipment + active/current', 'Scope control', 'Excludes other tenants/cancelled versions'], ['OUTPUT', 'Register / PDF / structured response', 'Authorised report', 'Provides retrieval and audit evidence']],
            output: 'Final export file is generated from connected records rather than manually assembled duplicates.',
          },
        ],
      },
    ],
  },
  inventory: {
    eyebrow: 'PIN-TO-PIN INVENTORY MAP',
    title: 'Inbound → Batch Ledger → Allocation → Outbound → Balance',
    badge: 'QUANTITY + TRACEABILITY + VALUE',
    columns: ['Movement', 'Affected Table / Pool', 'Inventory Role', 'Exact Effect'],
    legend: [['IN', 'Adds available stock'], ['OUT', 'Consumes available stock'], ['POOL', 'Batch/product availability'], ['PLAN', 'Demand and requirement'], ['VALUE', 'Costing/finance connection']],
    groups: [
      {
        id: 'inventory-stock', title: 'Finished Stock Movement', icon: 'fa-boxes-stacked',
        description: 'Signed stock movements maintain the available batch/product pool used by orders, dispatch and reports.',
        flows: [
          {
            name: 'Production Output / Stock Entry IN', source: 'Production Register or Inventory → Stock Entry IN',
            trigger: 'Save approved finished-goods quantity with company/location/PO/batch/product attributes.',
            formula: 'Quantity kg = MC × master-carton weight + loose quantity × applicable unit/slab weight.',
            lines: [['WRITE', 'stock_entry · movement IN', 'Inventory transaction', 'Adds MC, loose and quantity to identified pool'], ['REFRESH', 'inventory_summary / requirements', 'Derived data', 'Updates balance and order coverage'], ['LINK', 'Production cost batch', 'Value dependency', 'Provides batch identity for FG value']],
            output: 'Makes finished goods available without losing batch and product traceability.',
          },
          {
            name: 'Stock Entry OUT / Dispatch Issue', source: 'Inventory → Stock OUT / Sales allocation',
            trigger: 'Issue against an existing matched pool after availability validation.',
            formula: 'Allowed OUT ≤ matched available MC/loose/quantity; new balance = prior signed balance − issue.',
            lines: [['READ', 'Matched stock_entry pool', 'Availability control', 'Finds same company/location/product/batch attributes'], ['WRITE', 'stock_entry · movement OUT', 'Inventory transaction', 'Reduces signed available quantity'], ['REFRESH', 'Stock status / requirements', 'Downstream recalculation', 'Updates balance and demand coverage']],
            output: 'Prevents negative stock and preserves the source pool of every issue.',
          },
          {
            name: 'Stock Status Ledger', source: 'Inventory → Stock Status Report',
            trigger: 'Read scoped active IN/OUT movements.',
            formula: 'Available = Σ CASE(IN, +quantity, −quantity), grouped by product/batch/company/location.',
            lines: [['READ', 'stock_entry', 'Signed movement source', 'Uses active IN and OUT rows'], ['GROUP', 'Product and location attributes', 'Balance dimension', 'Produces subtotals and detail ledger'], ['OUTPUT', 'Stock status table/KPIs', 'Live report', 'Displays the same available balance used by issue validation']],
            output: 'One signed calculation drives both operational availability and reporting.',
          },
        ],
      },
      {
        id: 'inventory-orders', title: 'Orders, Allocation & Production Demand', icon: 'fa-list-check',
        description: 'Customer order demand is compared against available finished stock and converted into PO-wise production requirements.',
        flows: [
          {
            name: 'Pending Order', source: 'Inventory → Pending Orders',
            trigger: 'Save PO item specifications and requested MC.',
            formula: 'Pending = ordered quantity − covered/produced/allocated quantity by matching product specification.',
            lines: [['WRITE', 'pending_orders', 'Demand source', 'Creates PO-wise requirement rows'], ['READ', 'stock_entry', 'Supply source', 'Measures available/produced coverage'], ['REFRESH', 'production_requirements', 'Planning result', 'Creates remaining requirement']],
            output: 'PO-wise demand drives production planning and export documents.',
          },
          {
            name: 'Production Requirements', source: 'Inventory/Production → Requirements tab',
            trigger: 'PO, stock or relevant yield master changes.',
            formula: 'Required finished output = uncovered PO demand; raw/WIP requirement applies grade/HOSO/HLSO/yield conversions.',
            lines: [['READ', 'pending_orders', 'Demand', 'Gets PO/product order quantity'], ['READ', 'stock_entry + yield masters', 'Coverage/conversion', 'Subtracts stock and converts stage input'], ['WRITE', 'production_requirements', 'Planning table', 'Stores refreshed PO-wise requirement']],
            output: 'Shows exact PO shortfall and stage-wise material need.',
          },
          {
            name: 'Move PO to Sales Dispatch', source: 'Pending Orders → Move to Dispatch',
            trigger: 'Complete PO with invoice/shipping references.',
            formula: 'Invoice INR aggregates dispatched quantity × selling price × exchange rate.',
            lines: [['WRITE', 'sales_dispatch', 'Sales source', 'Creates invoice-wise dispatch rows'], ['STATUS', 'pending_orders.progress_steps', 'Workflow state', 'Moves order from pending to completed'], ['POST', 'Sales voucher journal_id', 'Accounts integration', 'Creates customer receivable and export sales']],
            output: 'Closes planning demand and starts sales/export accounting.',
          },
        ],
      },
      {
        id: 'inventory-wip-cold', title: 'Floor Balance, Cold Storage & Daily Control', icon: 'fa-warehouse',
        description: 'WIP and cold-chain records remain separate from finished stock but reconcile through production and costing.',
        flows: [
          {
            name: 'Live Floor Balance', source: 'Processing services → Floor Balance Report',
            trigger: 'RM purchase or processing stage consumes/refunds/transfers quantity.',
            formula: 'Stage balance = cumulative source additions − valid stage consumption ± cancellation refunds.',
            lines: [['WRITE', 'floor_balance', 'Live WIP ledger', 'Updates stage/product/batch quantity'], ['READ', 'Processing forms', 'Availability source', 'Limits selectable/consumable quantity'], ['OUTPUT', 'Floor Balance report/value', 'Operational report', 'Shows company/location subtotals and value']],
            output: 'All processing stages use the same canonical WIP availability.',
          },
          {
            name: 'Cold Storage Holding', source: 'Inventory → Cold Storage Holding',
            trigger: 'Record coldstore IN/OUT/holding details against matched stock and location.',
            formula: 'Holding days and charges use quantity, dates and configured storage/handling rates.',
            lines: [['WRITE', 'cold_storage_holding', 'Cold-chain transaction', 'Records stock custody/location'], ['READ', 'cold_storage master + stock', 'Rate/quantity source', 'Validates storage and product'], ['OUTPUT', 'Holding/Storage Cost reports', 'Costing input', 'Calculates storage cost without directly duplicating stock GL']],
            output: 'Tracks physical custody and supplies storage cost to costing/allocation.',
          },
          {
            name: 'Daily Inventory and Floor Snapshots', source: 'Scheduled snapshot service',
            trigger: 'Daily scheduled run around the configured opening time.',
            formula: 'Snapshot opening = signed active movement/balance as of snapshot cutoff.',
            lines: [['READ', 'stock_entry + floor_balance', 'Live balances', 'Captures current quantity truth'], ['WRITE', 'inventory_daily_snapshot + floor_balance_snapshot', 'Historical opening', 'Preserves day-start comparison'], ['OUTPUT', 'Dashboard trends', 'Historical KPI', 'Separates opening, movement and closing']],
            output: 'Historical dashboards do not depend on reconstructing a mutable current table.',
          },
          {
            name: 'Inventory Costing', source: 'Inventory Costing / Floor Balance Value',
            trigger: 'Read live quantities with applicable product/production/coldstore rates.',
            formula: 'Inventory value = available quantity × applicable cost/kg; batch financial truth comes from completed production cost allocation.',
            lines: [['READ', 'Signed stock/floor quantity', 'Quantity input', 'Provides available kg'], ['READ', 'Cost/yield/packing masters or allocation', 'Rate input', 'Provides applicable unit cost'], ['OUTPUT', 'Cost/value reports', 'Management value', 'Supports profitability and reconciliation']],
            output: 'Connects operational quantity to management value while GL value remains voucher-controlled.',
          },
        ],
      },
    ],
  },
  processing: {
    eyebrow: 'PIN-TO-PIN PROCESSING MAP',
    title: 'Gate Entry → RM → Stage Conversion → Production → Stock',
    badge: 'BATCH + YIELD + FLOOR BALANCE',
    columns: ['Stage', 'Affected Table / Pool', 'Processing Role', 'Exact Effect'],
    legend: [['SOURCE', 'Creates batch identity'], ['CONSUME', 'Reduces prior stage balance'], ['OUTPUT', 'Adds next-stage balance'], ['YIELD', 'Compares input to output'], ['COST', 'Creates contractor/source cost']],
    groups: [
      {
        id: 'process-intake', title: 'Raw Material Intake', icon: 'fa-truck-ramp-box',
        description: 'Gate Entry establishes traceability; RM Purchasing records net commercial quantity, cost and the first live floor balance.',
        flows: [
          {
            name: 'Gate Entry', source: 'Processing → Gate Entry',
            trigger: 'Vehicle/supplier lot arrives and is saved under company/location.',
            formula: 'Net receipt context derives from entered gross/tare/declared weights; final purchased quantity is confirmed in RM Purchasing.',
            lines: [['WRITE', 'gate_entry', 'Source lot', 'Creates batch, supplier, vehicle and arrival identity'], ['READ', 'Supplier/location/species masters', 'Validated references', 'Populates canonical values'], ['FEED', 'RM Purchasing dropdown/lookup', 'Upstream dependency', 'Makes active batch available for purchase']],
            output: 'Every downstream stage can trace back to the source gate lot.',
          },
          {
            name: 'Raw Material Purchasing', source: 'Processing → RM Purchasing',
            trigger: 'Confirm supplier invoice, net weight, rate and tax for gate batch.',
            formula: 'Purchase value = accepted net quantity × rate; payable = base + GST − TDS.',
            lines: [['WRITE', 'raw_material_purchasing', 'Commercial RM transaction', 'Stores batch quantity, value and supplier'], ['OUTPUT', 'floor_balance initial HOSO/RM pool', 'WIP quantity', 'Adds accepted input to live floor balance'], ['POST', 'journal_id', 'Accounts cost/payable', 'Posts RM purchase, tax/TDS and supplier liability']],
            output: 'Creates both the physical WIP starting quantity and financial purchase cost.',
          },
        ],
      },
      {
        id: 'process-primary', title: 'Primary Conversion Stages', icon: 'fa-arrows-rotate',
        description: 'Each stage consumes an available source pool, records output and preserves yield plus cancellation refund logic.',
        flows: [
          {
            name: 'De-Heading', source: 'Processing → De-Heading',
            trigger: 'Select available RM/HOSO batch and save processed input/output.',
            formula: 'Yield % = output weight ÷ input weight × 100; contractor charge = applicable quantity × rate.',
            lines: [['CONSUME', 'RM/HOSO floor_balance', 'Input pool', 'Reduces available source quantity'], ['WRITE', 'de_heading', 'Stage transaction', 'Stores input/output, contractor and rate'], ['OUTPUT', 'HLSO/next-stage floor balance', 'Converted WIP', 'Adds accepted output quantity'], ['POST', 'journal_id', 'Contractor cost', 'Creates charge expense and contractor payable']],
            output: 'Moves batch quantity and cost into the de-headed stage with measurable yield.',
          },
          {
            name: 'Grading', source: 'Processing → Grading',
            trigger: 'Consume available HLSO/grade source and split output into grade/count rows.',
            formula: 'Total graded output = Σ grade row quantities; yield/loss compares total output to input.',
            lines: [['CONSUME', 'HLSO source pool', 'Input WIP', 'Reduces selected available quantity'], ['WRITE', 'grading + hlso_for_grading', 'Stage transaction/pool', 'Stores grade-wise distribution'], ['OUTPUT', 'Grade-wise floor balance', 'Next-stage WIP', 'Adds each grade/count output']],
            output: 'Creates the grade-specific pool required by peeling and production planning.',
          },
          {
            name: 'Required Peeling / Peeling', source: 'Processing → Peeling',
            trigger: 'Select grade/count balance, contractor and peeling output type.',
            formula: 'Peeled output/yield derives from input and configured peeling/yield rate; charge = payable quantity × peeling rate.',
            lines: [['CONSUME', 'Graded HLSO floor balance', 'Input WIP', 'Reduces grade/count source'], ['WRITE', 'peeling', 'Stage transaction', 'Stores peeled output and contractor detail'], ['OUTPUT', 'Peeled/required-peeling balance', 'Next-stage WIP', 'Adds usable peeled quantity'], ['POST', 'journal_id', 'Contractor cost', 'Posts peeling charge and payable']],
            output: 'Maintains required peeling, actual output, balance and contractor accounts together.',
          },
        ],
      },
      {
        id: 'process-treatment', title: 'Treatment, Quality & Final Production', icon: 'fa-flask',
        description: 'Soaking and production retain treatment time, quality status, PO specification, final output and rejected/reprocess quantities.',
        flows: [
          {
            name: 'Soaking', source: 'Processing → Soaking',
            trigger: 'Consume peeled batch/count, record chemical treatment and change status.',
            formula: 'Elapsed soaking time = completed/status timestamp − soaking start date/time; yield compares treated output to input.',
            lines: [['CONSUME', 'Peeled floor balance', 'Input WIP', 'Reduces selected peeled quantity'], ['WRITE', 'soaking', 'Treatment transaction', 'Stores chemicals, start/end and status'], ['OUTPUT', 'Soaked/available production pool', 'Treated WIP', 'Adds accepted treated quantity'], ['STATUS', 'Soaking status', 'Workflow control', 'Controls completion and production availability']],
            output: 'Provides time-calculated, status-controlled material for production.',
          },
          {
            name: 'Production Register', source: 'Processing → Production · Register tab',
            trigger: 'Consume soaking/eligible material against PO/product specification and save output.',
            formula: 'Production output = MC × packing weight + loose quantity; yield compares final output to stage input.',
            lines: [['READ', 'PO requirements + soaking pool', 'Demand/input', 'Selects required product and available material'], ['CONSUME', 'Soaked/floor balance', 'Input WIP', 'Reduces used stage quantity'], ['WRITE', 'production', 'Final production transaction', 'Stores PO/batch/product/MC/output'], ['OUTPUT', 'Finished stock entry/production register', 'Inventory hand-off', 'Makes approved output available to inventory']],
            output: 'Closes the processing cycle into PO-linked finished goods.',
          },
          {
            name: 'Rejection and Reprocess', source: 'Production status actions / Reprocess',
            trigger: 'Mark quantity rejected or create an authorised reprocess entry.',
            formula: 'Usable output excludes rejected quantity; reprocess consumes the eligible rejected/source pool and records recovered output.',
            lines: [['STATUS', 'Production/soaking rejection status', 'Quality control', 'Separates accepted and rejected material'], ['WRITE', 'reprocess_entries', 'Recovery transaction', 'Stores reprocessing input/output'], ['ADJUST', 'floor_balance pools', 'WIP correction', 'Moves quantity without double counting']],
            output: 'Quality losses and recovered production remain visible and auditable.',
          },
        ],
      },
      {
        id: 'process-control', title: 'Balance, Reports & Corrections', icon: 'fa-scale-balanced',
        description: 'The live Floor Balance controls availability; reports, monthly bills and audit actions read or safely reverse the same source records.',
        flows: [
          {
            name: 'Floor Balance Service', source: 'FloorBalanceService + floor_balance',
            trigger: 'Every supported stage save, edit or cancellation.',
            formula: 'Available stage quantity = additions − consumptions + authorised cancellation refunds.',
            lines: [['LOCK', 'Matched floor_balance row', 'Concurrency control', 'Prevents simultaneous over-consumption'], ['VALIDATE', 'Requested quantity', 'Negative-stock guard', 'Rejects quantity above available'], ['WRITE', 'Stage/product/batch balance', 'Canonical WIP', 'Updates live availability atomically']],
            output: 'Forms and Floor Balance report use the same WIP truth.',
          },
          {
            name: 'Stage Reports and Monthly Contractor Bills', source: '/reports/* processing reports',
            trigger: 'Read, filter, group or generate contractor-period totals.',
            formula: 'Report totals = active scoped stage rows; contractor bill = Σ eligible quantity × applicable rate + GST.',
            lines: [['READ', 'Stage transaction tables', 'Operational history', 'Builds detailed rows and subtotals'], ['GROUP', 'Company/location/contractor/month', 'Summary dimensions', 'Creates bills and management totals'], ['LINK', 'journal_id / bill payment', 'Accounts relationship', 'Shows posted cost and settlement status']],
            output: 'Operations, contractor bills and accounts reconcile to the same source rows.',
          },
          {
            name: 'Edit / Cancel / Refund', source: 'Processing report row action',
            trigger: 'Authorised correction within edit policy.',
            formula: 'Correction = refund old consumed quantity − remove old output − reverse linked voucher + apply corrected transaction.',
            lines: [['REVERSE', 'Linked floor balances', 'Quantity restoration', 'Returns old source/output effects'], ['REVERSE', 'Linked journal_id', 'Finance correction', 'Creates immutable contra voucher'], ['WRITE', 'audit_log + cancelled/edited row', 'History', 'Preserves actor, old and new state']],
            output: 'No correction silently changes WIP or contractor accounts.',
          },
        ],
      },
    ],
  },
};

const CODE_AUDIT_NOTES = [
  {
    severity: 'HIGH',
    title: 'Inventory summary movement sign',
    detail: 'InventorySummaryService currently sums stock_entry quantity, MC and loose without applying cargo_movement_type. Stock OUT rows are stored as positive quantities, while operational stock reports correctly use signed CASE(IN +, OUT -). The summary service should use the same signed expression before it is treated as an authoritative balance.',
  },
  {
    severity: 'HIGH',
    title: 'Production-requirement tenant endpoint',
    detail: 'The /production-requirements/{company_id} APIs accept company_id from the URL and have no dedicated route-permission mapping. They should derive company scope from the signed session, or explicitly reject a company ID that differs from the session tenant.',
  },
  {
    severity: 'MEDIUM',
    title: 'Mobile API router is not registered',
    detail: 'backend/app/routers/mobile_api.py defines /api/mobile endpoints, but main.py does not import or include that router. The current mobile project appears to use shared web APIs; the unused router should either be registered and secured or removed after confirming it is obsolete.',
  },
  {
    severity: 'MEDIUM',
    title: 'Stock Entry router is included twice',
    detail: 'inventory_router already includes inventory_management.stock_entry, and main.py includes stock_entry_router again. Duplicate FastAPI registration can duplicate OpenAPI operations and makes route ownership harder to audit.',
  },
  {
    severity: 'MEDIUM',
    title: 'Enterprise finance permission coverage',
    detail: 'Legacy finance form paths are mapped, but several enterprise endpoints such as groups, ledgers, vouchers, reports, financial years and bank statement imports do not have explicit prefix rules. Add granular read/post/approve/reverse permissions.',
  },
  {
    severity: 'LOW',
    title: 'Two ledger-master generations',
    detail: 'ledger_master is retained for compatibility while ledger_masters is the enterprise source. Continue migration toward ledger_masters and prevent new code from creating dependencies on the legacy table.',
  },
  {
    severity: 'INFO',
    title: 'Traceability is partially parallel',
    detail: 'The advanced Pond / Harvest Lot / Production Batch conversion service exists beside the operational Gate Entry → Floor Balance workflow. Its forward/backward APIs are useful, but the advanced lot records are not yet the mandatory source for every operational batch.',
  },
];

const ACCOUNTS_DETAILED_CONFIG = {
  eyebrow: 'PIN-TO-PIN DOUBLE-ENTRY MAP',
  title: 'Every Source Entry → Voucher → Ledger → Financial Statement Effect',
  badge: 'POSTING + TRACKING FLOWS',
  columns: ['Side', 'Affected Ledger', 'Account Type', 'Exact Financial Effect'],
  legend: [
    ['ASSET', 'DR increases · CR decreases'],
    ['LIABILITY', 'CR increases · DR decreases'],
    ['EXPENSE', 'DR increases · CR reverses/absorbs'],
    ['INCOME', 'CR increases · DR reverses'],
    ['CONTROL', 'Total DR must equal total CR'],
  ],
  groups: ACCOUNTING_FLOW_GROUPS,
};

function DetailedModuleArchitecture({ config, finance = false }) {
  const groups = config.groups || [];
  const flowCount = groups.reduce((total, group) => total + group.flows.length, 0);
  const connectedCount = groups.reduce(
    (total, group) => total + group.flows.filter(flow => !flow.tracking).length,
    0,
  );

  return (
    <section className="accounts-ledger-architecture">
      <div className="architecture-section-heading">
        <div>
          <span>{config.eyebrow}</span>
          <h2>{config.title}</h2>
        </div>
        <span className="architecture-verified">
          <i className="fa-solid fa-code-branch"></i>
          {connectedCount} CONNECTED · {flowCount - connectedCount} CONTROL/TRACKING
        </span>
      </div>

      <div className="accounts-posting-principle">
        <div className="accounts-principle-node">
          <i className="fa-solid fa-file-pen"></i>
          <span>1 · SOURCE FILE</span>
          <strong>Enter once in the owning ERP page</strong>
        </div>
        <i className="fa-solid fa-arrow-right"></i>
        <div className="accounts-principle-node">
          <i className="fa-solid fa-gears"></i>
          <span>2 · RULES ENGINE</span>
          <strong>Validate tenant, mapping, quantity and values</strong>
        </div>
        <i className="fa-solid fa-arrow-right"></i>
        <div className="accounts-principle-node">
          <i className={`fa-solid ${finance ? 'fa-book' : 'fa-database'}`}></i>
          <span>3 · CONNECTED RECORDS</span>
          <strong>{finance ? 'Balanced voucher and ledger lines' : 'Atomic table, status and balance effects'}</strong>
        </div>
        <i className="fa-solid fa-arrow-right"></i>
        <div className="accounts-principle-node">
          <i className="fa-solid fa-chart-pie"></i>
          <span>4 · OUTPUT EFFECT</span>
          <strong>{finance ? 'Outstanding and financial statements' : 'Next forms, dashboards, reports and audit'}</strong>
        </div>
      </div>

      <div className="accounts-effect-legend">
        {(config.legend || []).map(([label, description]) => (
          <span key={label}><b>{label}</b> {description}</span>
        ))}
      </div>

      <div className="accounts-flow-index">
        {groups.map((group, index) => (
          <div className="accounts-flow-index-node" key={group.id}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <i className={`fa-solid ${group.icon}`}></i>
            <div><strong>{group.title}</strong><small>{group.flows.length} connected flows</small></div>
          </div>
        ))}
      </div>

      {groups.map(group => (
        <div className="accounts-flow-group" key={group.id}>
          <div className="accounts-flow-group-head">
            <i className={`fa-solid ${group.icon}`}></i>
            <div><h3>{group.title}</h3><p>{group.description}</p></div>
          </div>
          <div className="accounts-flow-cards">
            {group.flows.map((flow, flowIndex) => (
              <details className={`accounts-flow-card ${flow.tracking ? 'tracking-only' : ''}`} key={flow.name} open={flowIndex === 0}>
                <summary>
                  <span className="accounts-flow-sequence">{String(flowIndex + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{flow.name}</strong>
                    <small>{flow.source}</small>
                  </div>
                  <span className={`accounts-posting-status ${flow.tracking ? 'tracking' : 'posted'}`}>
                    {flow.tracking ? (finance ? 'NO DIRECT GL' : 'CONTROL / READ FLOW') : (finance ? 'AUTO / CONTROLLED POSTING' : 'CONNECTED WRITE FLOW')}
                  </span>
                  <i className="fa-solid fa-chevron-down"></i>
                </summary>
                <div className="accounts-flow-detail">
                  <div className="accounts-flow-context">
                    <div><span>TRIGGER / ENTRY POINT</span><p>{flow.trigger}</p></div>
                    <div><span>RULE / CALCULATION</span><p>{flow.formula}</p></div>
                  </div>

                  {flow.lines.length > 0 ? (
                    <div className="accounts-ledger-table-wrap">
                      <table className="accounts-ledger-table">
                        <thead>
                          <tr>{config.columns.map(column => <th key={column}>{column}</th>)}</tr>
                        </thead>
                        <tbody>
                          {flow.lines.map(([side, ledger, type, effect], lineIndex) => (
                            <tr key={`${flow.name}-${ledger}-${lineIndex}`}>
                              <td><span className={`accounts-side side-${side.toLowerCase().replace('/', '-')}`}>{side}</span></td>
                              <td><strong>{ledger}</strong></td>
                              <td>{type}</td>
                              <td>{effect}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="accounts-no-posting">
                      <i className="fa-solid fa-circle-info"></i>
                      {finance
                        ? 'This source changes operational/register data only. It has no direct debit or credit entry in the current code.'
                        : 'This is a control, calculation or read-only flow. It does not independently create a new business balance.'}
                    </div>
                  )}

                  <div className="accounts-flow-output">
                    <span>{finance ? 'ACCOUNTS RESULT' : 'DOWNSTREAM RESULT'}</span>
                    <p>{flow.output}</p>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </div>
      ))}

      <div className="accounts-control-chain">
        <div>
          <span>{finance ? 'POSTING SAFETY CHAIN' : 'DATA INTEGRITY CHAIN'}</span>
          <strong>
            {finance
              ? 'Source row → journal_id → voucher_headers → voucher_details → ledger reports'
              : 'Source record → linked tables/services → scoped balances → reports → audit history'}
          </strong>
        </div>
        {finance ? (
          <p>
            A financial source is never physically erased to correct accounts. Cancellation creates an immutable contra voucher with the
            original debit and credit sides swapped; edits reverse the old voucher before posting corrected values. Tenant, ledger,
            financial-year, voucher-number and debit-equals-credit validations run before financial reports.
          </p>
        ) : (
          <p>
            Every flow is company-scoped and uses the owning source record as its traceability anchor. Edits and cancellations must reverse
            linked quantity, status, document or finance effects before applying corrected values; audit history retains the original and
            corrected states for React, template and native consumers.
          </p>
        )}
      </div>
    </section>
  );
}

export default function SystemArchitecture({ user }) {
  const [activeId, setActiveId] = useState(ARCHITECTURES[0].id);
  const normalizedEmail = user?.email?.trim().toLowerCase() || '';
  const allowed = normalizedEmail === SUPER_ADMIN_EMAIL;
  const active = ARCHITECTURES.find(item => item.id === activeId) || ARCHITECTURES[0];
  const documentation = MODULE_DOCUMENTATION[active.id] || {};
  const detailedConfig = active.id === 'accounts' ? ACCOUNTS_DETAILED_CONFIG : MODULE_DETAILED_FLOWS[active.id];

  if (!allowed) {
    return (
      <div className="architecture-access-page">
        <div className="architecture-access-card">
          <i className="fa-solid fa-lock"></i>
          <h1>Restricted Architecture View</h1>
          <p>This SVBK ERP system architecture is available only to the application super administrator.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="architecture-page" style={{ '--architecture-accent': active.accent }}>
      <header className="architecture-header">
        <div>
          <span className="architecture-eyebrow">
            <i className="fa-solid fa-shield-halved"></i>
            SUPER ADMIN REFERENCE
          </span>
          <h1>ERP System Architecture</h1>
          <p>Module ownership, transaction flow and integration reference for the SVBK ERP application.</p>
        </div>
        <span className="architecture-private-badge">
          <i className="fa-solid fa-lock"></i>
          PRIVATE
        </span>
      </header>

      {active.id === 'master' && (
        <section className="architecture-stats" aria-label="Codebase inventory">
          {CODEBASE_STATS.map(([value, label]) => (
            <div key={label}><strong>{value}</strong><span>{label}</span></div>
          ))}
        </section>
      )}

      <div className="architecture-tabs" role="tablist" aria-label="Architecture modules">
        {ARCHITECTURES.map(item => (
          <button
            type="button"
            role="tab"
            aria-selected={active.id === item.id}
            className={`architecture-tab ${active.id === item.id ? 'active' : ''}`}
            key={item.id}
            onClick={() => setActiveId(item.id)}
          >
            <i className={`fa-solid ${item.icon}`}></i>
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <section className="architecture-overview">
        <div className="architecture-overview-icon"><i className={`fa-solid ${active.icon}`}></i></div>
        <div>
          <span>MODULE ARCHITECTURE</span>
          <h2>{active.title}</h2>
          <p>{active.summary}</p>
        </div>
      </section>

      <section className="architecture-flow" aria-label={`${active.title} transaction flow`}>
        {active.flow.map((step, index) => (
          <div className="architecture-flow-group" key={step}>
            <div className="architecture-flow-step">
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{step}</strong>
            </div>
            {index < active.flow.length - 1 && <i className="fa-solid fa-arrow-right"></i>}
          </div>
        ))}
      </section>

      <section className="architecture-tree" aria-label={`${active.title} tree`}>
        <div className="architecture-root-node">
          <i className={`fa-solid ${active.icon}`}></i>
          <div><span>ROOT MODULE</span><strong>{active.title}</strong></div>
        </div>
        <div className="architecture-root-line"></div>
        <div className="architecture-branches">
          {active.branches.map((branch, branchIndex) => (
            <article className="architecture-branch" key={branch.title}>
              <div className="architecture-branch-head">
                <span className="architecture-branch-number">{String(branchIndex + 1).padStart(2, '0')}</span>
                <i className={`fa-solid ${branch.icon}`}></i>
                <h3>{branch.title}</h3>
              </div>
              <p>{branch.description}</p>
              <ul>
                {branch.items.map(item => <li key={item}><i className="fa-solid fa-circle-check"></i><span>{item}</span></li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="architecture-explanation">
        <div className="architecture-explanation-title">
          <i className="fa-solid fa-circle-info"></i>
          <div><span>HOW IT WORKS</span><h2>{active.title} Data Flow</h2></div>
        </div>
        <p>{active.explanation}</p>
      </section>

      {detailedConfig && <DetailedModuleArchitecture config={detailedConfig} finance={active.id === 'accounts'} />}

      <section className="architecture-documentation">
        <div className="architecture-section-heading">
          <div>
            <span>CODE-VERIFIED MODULE DOCUMENTATION</span>
            <h2>{active.title} Technical & Functional Reference</h2>
          </div>
          <span className="architecture-verified"><i className="fa-solid fa-code"></i> BACKEND + REACT + MODELS</span>
        </div>

        <div className="architecture-doc-grid">
          <article className="architecture-doc-card architecture-doc-purpose">
            <h3><i className="fa-solid fa-bullseye"></i> Purpose</h3>
            <p>{documentation.purpose}</p>
          </article>
          {[
            ['Forms & Workspaces', 'fa-rectangle-list', documentation.forms],
            ['Database Tables', 'fa-database', documentation.tables],
            ['API / Router Families', 'fa-code-branch', documentation.apis],
            ['Important Data Sources', 'fa-right-left', documentation.sources],
            ['Upstream Dependencies', 'fa-arrow-up', documentation.upstream],
            ['Downstream Impact', 'fa-arrow-down', documentation.downstream],
            ['Permissions & Controls', 'fa-shield-halved', documentation.controls],
            ['Reports & Outputs', 'fa-chart-column', documentation.reports],
          ].map(([title, icon, items]) => (
            <article className="architecture-doc-card" key={title}>
              <h3><i className={`fa-solid ${icon}`}></i> {title}</h3>
              <ul>
                {(items || []).map(item => <li key={item}>{item}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {active.id === 'master' && (
        <section className="architecture-audit">
          <div className="architecture-section-heading">
            <div>
              <span>CODE AUDIT NOTES</span>
              <h2>Recommended Architecture Corrections</h2>
            </div>
            <span className="architecture-audit-count">{CODE_AUDIT_NOTES.length} FINDINGS</span>
          </div>
          <div className="architecture-audit-list">
            {CODE_AUDIT_NOTES.map(note => (
              <article className={`architecture-audit-note severity-${note.severity.toLowerCase()}`} key={note.title}>
                <span>{note.severity}</span>
                <div><h3>{note.title}</h3><p>{note.detail}</p></div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
