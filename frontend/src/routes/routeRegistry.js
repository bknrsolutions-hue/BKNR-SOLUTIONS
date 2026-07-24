import { lazy } from 'react';

// Core Views
export const AuthContainer = lazy(() => import('../pages/Auth/AuthContainer'));
export const DashboardsConsole = lazy(() => import('../pages/Dashboards/DashboardsConsole'));
export const BackendConsole = lazy(() => import('../pages/BackendConsole'));
export const ReportViewer = lazy(() => import('../pages/Reports/ReportViewer'));
export const UserProfile = lazy(() => import('../pages/Profile/Profile'));

// Reports Components
export const GateEntryReport = lazy(() => import('../pages/Reports/GateEntryReport'));
export const RMPReport = lazy(() => import('../pages/Reports/RMPReport'));
export const DeHeadingReport = lazy(() => import('../pages/Reports/DeHeadingReport'));
export const GradingReport = lazy(() => import('../pages/Reports/GradingReport'));
export const PeelingReport = lazy(() => import('../pages/Reports/PeelingReport'));
export const SoakingReport = lazy(() => import('../pages/Reports/SoakingReport'));
export const ProductionReport = lazy(() => import('../pages/Reports/ProductionReport'));
export const ReprocessReport = lazy(() => import('../pages/Reports/ReprocessReport'));
export const FloorBalanceReport = lazy(() => import('../pages/Reports/FloorBalanceReport'));
export const StockReport = lazy(() => import('../pages/Reports/StockReport'));
export const PendingOrdersReport = lazy(() => import('../pages/Reports/PendingOrdersReport'));
export const SalesReport = lazy(() => import('../pages/Reports/SalesReport'));
export const GeneralStockReport = lazy(() => import('../pages/Reports/GeneralStockReport'));
export const ColdStorageHoldingReport = lazy(() => import('../pages/Reports/ColdStorageHoldingReport'));
export const StorageCostReport = lazy(() => import('../pages/Reports/StorageCostReport'));
export const FloorBalanceValue = lazy(() => import('../pages/Reports/FloorBalanceValue'));
export const InventoryCosting = lazy(() => import('../pages/Reports/InventoryCosting'));

// Criteria Components
export const Buyers = lazy(() => import('../pages/Criteria/Buyers'));
export const BuyerAgents = lazy(() => import('../pages/Criteria/BuyerAgents'));
export const Suppliers = lazy(() => import('../pages/Criteria/Suppliers'));
export const Vendors = lazy(() => import('../pages/Criteria/Vendors'));
export const Countries = lazy(() => import('../pages/Criteria/Countries'));
export const Brands = lazy(() => import('../pages/Criteria/Brands'));
export const PurchasingLocations = lazy(() => import('../pages/Criteria/PurchasingLocations'));
export const Species = lazy(() => import('../pages/Criteria/Species'));
export const Varieties = lazy(() => import('../pages/Criteria/Varieties'));
export const Grades = lazy(() => import('../pages/Criteria/Grades'));
export const Freezers = lazy(() => import('../pages/Criteria/Freezers'));
export const Glazes = lazy(() => import('../pages/Criteria/Glazes'));
export const PackingStyles = lazy(() => import('../pages/Criteria/PackingStyles'));
export const Contractors = lazy(() => import('../pages/Criteria/Contractors'));
export const PeelingAt = lazy(() => import('../pages/Criteria/PeelingAt'));
export const PeelingRates = lazy(() => import('../pages/Criteria/PeelingRates'));
export const KgBasisLabourRates = lazy(() => import('../pages/Criteria/KgBasisLabourRates'));
export const DailyBasisWorkerRates = lazy(() => import('../pages/Criteria/DailyBasisWorkerRates'));
export const ProductionAt = lazy(() => import('../pages/Criteria/ProductionAt'));
export const ProductionFor = lazy(() => import('../pages/Criteria/ProductionFor'));
export const ProductionTypes = lazy(() => import('../pages/Criteria/ProductionTypes'));
export const Chemicals = lazy(() => import('../pages/Criteria/Chemicals'));
export const Purposes = lazy(() => import('../pages/Criteria/Purposes'));
export const GradeToHoso = lazy(() => import('../pages/Criteria/GradeToHoso'));
export const HosoHlso = lazy(() => import('../pages/Criteria/HosoHlso'));
export const ColdStorage = lazy(() => import('../pages/Criteria/ColdStorage'));
export const ColdstoreLocations = lazy(() => import('../pages/Criteria/ColdstoreLocations'));
export const VehicleNumbers = lazy(() => import('../pages/Criteria/VehicleNumbers'));
export const HsnCodes = lazy(() => import('../pages/Criteria/HsnCodes'));
export const ShippingVendors = lazy(() => import('../pages/Criteria/ShippingVendors'));

// Operations Components
export const GateEntry = lazy(() => import('../pages/Processing/GateEntry'));
export const RawMaterialPurchasing = lazy(() => import('../pages/Processing/RawMaterialPurchasing'));
export const DeHeading = lazy(() => import('../pages/Processing/DeHeading'));
export const Grading = lazy(() => import('../pages/Processing/Grading'));
export const Peeling = lazy(() => import('../pages/Processing/Peeling'));
export const Soaking = lazy(() => import('../pages/Processing/Soaking'));
export const Production = lazy(() => import('../pages/Processing/Production'));
export const StockEntry = lazy(() => import('../pages/Processing/StockEntry'));
export const PendingOrders = lazy(() => import('../pages/Processing/PendingOrders'));
export const ColdStorageHolding = lazy(() => import('../pages/Processing/ColdStorageHolding'));
export const GeneralStoreEntry = lazy(() => import('../pages/Processing/GeneralStoreEntry'));
export const DailyAttendance = lazy(() => import('../pages/Attendance/DailyAttendance'));
export const AdminConsole = lazy(() => import('../pages/Admin/AdminConsole'));
export const SupportTicketDesk = lazy(() => import('../pages/Admin/AdminConsole').then(module => ({ default: module.TicketDesk })));
export const StaffRegistration = lazy(() => import('../pages/Attendance/StaffRegistration'));
export const IncrementDetails = lazy(() => import('../pages/Attendance/IncrementDetails'));
export const MonthlySalarySheet = lazy(() => import('../pages/Attendance/MonthlySalarySheet'));
export const StatutoryMaster = lazy(() => import('../pages/Attendance/StatutoryMaster'));
export const SalaryAdvance = lazy(() => import('../pages/Attendance/SalaryAdvance'));
export const SalaryProcessing = lazy(() => import('../pages/Attendance/SalaryProcessing'));
export const LabourManagement = lazy(() => import('../pages/Attendance/LabourManagement'));
export const KgBasisCompanyLabour = lazy(() => import('../pages/Attendance/KgBasisCompanyLabour'));
export const VisitorsDayWorkers = lazy(() => import('../pages/Attendance/VisitorsDayWorkers'));

// Finance & Accounts Components
export const LedgerDirectory = lazy(() => import('../pages/FinanceAccounts/LedgerDirectory'));
export const JournalEntries = lazy(() => import('../pages/FinanceAccounts/JournalEntries'));
export const BankTransactions = lazy(() => import('../pages/FinanceAccounts/BankTransactions'));
export const PaymentReceipts = lazy(() => import('../pages/FinanceAccounts/PaymentReceipts'));
export const CustomerReceivables = lazy(() => import('../pages/FinanceAccounts/CustomerReceivables'));
export const VendorPayments = lazy(() => import('../pages/FinanceAccounts/VendorPayments'));
export const ExpenseVouchers = lazy(() => import('../pages/FinanceAccounts/ExpenseVouchers'));
export const TallyDashboard = lazy(() => import('../pages/FinanceAccounts/TallyDashboard'));
export const ProductionCostAutomation = lazy(() => import('../pages/FinanceAccounts/ProductionCostAutomation'));
export const AccountsFlowGuide = lazy(() => import('../pages/FinanceAccounts/NativeFinanceRegisters').then(module => ({ default: module.AccountsFlowGuide })));
export const BankMasterPage = lazy(() => import('../pages/FinanceAccounts/NativeFinanceRegisters').then(module => ({ default: module.BankMasterPage })));
export const ItemAccountingLinkPage = lazy(() => import('../pages/FinanceAccounts/NativeFinanceRegisters').then(module => ({ default: module.ItemAccountingLinkPage })));
export const ExportIncentivePage = lazy(() => import('../pages/FinanceAccounts/NativeFinanceRegisters').then(module => ({ default: module.ExportIncentivePage })));
export const LcTrackingPage = lazy(() => import('../pages/FinanceAccounts/NativeFinanceRegisters').then(module => ({ default: module.LcTrackingPage })));
export const GstRegisterPage = lazy(() => import('../pages/FinanceAccounts/NativeFinanceRegisters').then(module => ({ default: module.GstRegisterPage })));
export const FixedAssetsPage = lazy(() => import('../pages/FinanceAccounts/NativeFinanceRegisters').then(module => ({ default: module.FixedAssetsPage })));
export const ContractorBillsPage = lazy(() => import('../pages/FinanceAccounts/OperationalPayables').then(module => ({ default: module.ContractorBillsPage })));
export const SalaryBillsPage = lazy(() => import('../pages/FinanceAccounts/OperationalPayables').then(module => ({ default: module.SalaryBillsPage })));
export const VendorBillsPage = lazy(() => import('../pages/FinanceAccounts/OperationalPayables').then(module => ({ default: module.VendorBillsPage })));
export const SupplierBillsPage = lazy(() => import('../pages/FinanceAccounts/OperationalPayables').then(module => ({ default: module.SupplierBillsPage })));
export const PaymentLogsPage = lazy(() => import('../pages/FinanceAccounts/OperationalPayables').then(module => ({ default: module.PaymentLogsPage })));

// Commercial Bills Components
export const ElectricityBills = lazy(() => import('../pages/FinanceAccounts/ElectricityBills'));
export const DieselConsumption = lazy(() => import('../pages/FinanceAccounts/DieselConsumption'));
export const PurchasePackaging = lazy(() => import('../pages/FinanceAccounts/PurchasePackaging'));
export const LogisticsFreight = lazy(() => import('../pages/FinanceAccounts/LogisticsFreight'));
export const QaTestingCharges = lazy(() => import('../pages/FinanceAccounts/QaTestingCharges'));
export const OtherExpenses = lazy(() => import('../pages/FinanceAccounts/OtherExpenses'));

// Export Documents Components
export const ProformaInvoices = lazy(() => import('../pages/ExportDocuments/ProformaInvoices'));
export const ExportShipments = lazy(() => import('../pages/ExportDocuments/ExportShipments'));
export const CommercialInvoices = lazy(() => import('../pages/ExportDocuments/CommercialInvoices'));
export const PackingLists = lazy(() => import('../pages/ExportDocuments/PackingLists'));
export const ContainerStuffing = lazy(() => import('../pages/ExportDocuments/ContainerStuffing'));
export const ShippingBills = lazy(() => import('../pages/ExportDocuments/ShippingBills'));
export const BillsOfLading = lazy(() => import('../pages/ExportDocuments/BillsOfLading'));
export const HealthCertificates = lazy(() => import('../pages/ExportDocuments/HealthCertificates'));
export const SupportingDocuments = lazy(() => import('../pages/ExportDocuments/SupportingDocuments'));
export const RequirementForms = lazy(() => import('../pages/ExportDocuments/RequirementForms'));
export const RequirementDocumentPage = lazy(() => import('../pages/ExportDocuments/RequirementDocumentPage'));
export const ExportWorkspace = lazy(() => import('../pages/ExportDocuments/ExportWorkspace'));
export const ExportApprovals = lazy(() => import('../pages/ExportDocuments/ExportApprovals'));
export const ExportRegisters = lazy(() => import('../pages/ExportDocuments/ExportRegisters'));
export const ProcessingRegisters = lazy(() => import('../pages/Registers/ModuleRegisters').then(module => ({ default: module.ProcessingRegisters })));
export const InventoryRegisters = lazy(() => import('../pages/Registers/ModuleRegisters').then(module => ({ default: module.InventoryRegisters })));
export const AccountsRegisters = lazy(() => import('../pages/Registers/ModuleRegisters').then(module => ({ default: module.AccountsRegisters })));
export const HRMSRegisters = lazy(() => import('../pages/Registers/ModuleRegisters').then(module => ({ default: module.HRMSRegisters })));
export const ExportDashboard = lazy(() => import('../pages/Dashboards/ExportDashboard'));

export const CRITERIA_COMPONENTS = {
  criteria_buyers: Buyers,
  criteria_buyer_agents: BuyerAgents,
  criteria_suppliers: Suppliers,
  criteria_vendors: Vendors,
  criteria_countries: Countries,
  criteria_brands: Brands,
  criteria_purchasing_locations: PurchasingLocations,
  criteria_species: Species,
  criteria_varieties: Varieties,
  criteria_grades: Grades,
  criteria_freezers: Freezers,
  criteria_glazes: Glazes,
  criteria_packing_styles: PackingStyles,
  criteria_contractors: Contractors,
  criteria_peeling_at: PeelingAt,
  criteria_peeling_rates: PeelingRates,
  criteria_kg_basis_labour_rates: KgBasisLabourRates,
  criteria_daily_basis_worker_rates: DailyBasisWorkerRates,
  criteria_production_at: ProductionAt,
  criteria_production_for: ProductionFor,
  criteria_production_types: ProductionTypes,
  criteria_chemicals: Chemicals,
  criteria_purposes: Purposes,
  criteria_grade_to_hoso: GradeToHoso,
  criteria_hoso_hlso: HosoHlso,
  criteria_cold_storage: ColdStorage,
  criteria_coldstore_locations: ColdstoreLocations,
  criteria_vehicle_numbers: VehicleNumbers,
  criteria_hsn_codes: HsnCodes,
  criteria_shipping_vendors: ShippingVendors,

  // Operations
  gate_entry: GateEntry,
  raw_material_purchasing: RawMaterialPurchasing,
  de_heading: DeHeading,
  grading: Grading,
  peeling: Peeling,
  soaking: Soaking,
  production: Production,
  stock_entry: StockEntry,
  pending_orders: PendingOrders,
  cold_storage_holding: ColdStorageHolding,
  general_store_entry: GeneralStoreEntry,
  attendance_daily_attendance: DailyAttendance,
  attendance_employee_register: StaffRegistration,
  attendance_employee_increment: IncrementDetails,
  attendance_salary_report: MonthlySalarySheet,
  attendance_tax_master: StatutoryMaster,
  attendance_salary_advance: SalaryAdvance,
  attendance_labour_management: LabourManagement,
  attendance_kg_basis_labour: KgBasisCompanyLabour,
  attendance_visitors_day_workers: VisitorsDayWorkers,
  finance_salary_processing: SalaryProcessing,

  // Finance & Accounts
  finance_ledger_master: LedgerDirectory,
  finance_journal_entry: JournalEntries,
  finance_bank_transaction: BankTransactions,
  finance_payment_receipt: PaymentReceipts,
  finance_customer_receivable: CustomerReceivables,
  finance_vendor_payment: VendorPayments,
  finance_expense_voucher: ExpenseVouchers,
  finance_production_cost_allocation: ProductionCostAutomation,
  finance_accounts_flow_guide: AccountsFlowGuide,
  finance_bank_master: BankMasterPage,
  finance_item_accounting_link: ItemAccountingLinkPage,
  finance_fixed_assets: FixedAssetsPage,
  finance_gst_register: GstRegisterPage,
  finance_export_incentive_register: ExportIncentivePage,
  finance_lc_tracking: LcTrackingPage,
  finance_contractor_bills: ContractorBillsPage,
  finance_salaries: SalaryBillsPage,
  finance_vendor_bills: VendorBillsPage,
  finance_supplier_bills: SupplierBillsPage,
  finance_payment_logs: PaymentLogsPage,
  tally_dashboard: TallyDashboard,

  // Commercial Bills
  finance_electricity_bills: ElectricityBills,
  finance_diesel_bills: DieselConsumption,
  finance_packaging_bills: PurchasePackaging,
  finance_logistics_bills: LogisticsFreight,
  finance_qa_testing: QaTestingCharges,
  finance_other_expenses: OtherExpenses,

  // Export Documents
  export_documents_dashboard: ExportDashboard,
  proforma_invoice: ProformaInvoices,
  export_shipment: ExportShipments,
  commercial_invoice: CommercialInvoices,
  packing_list: PackingLists,
  container_stuffing: ContainerStuffing,
  shipping_bill: ShippingBills,
  bill_of_lading: BillsOfLading,
  health_certificate: HealthCertificates,
  export_supporting_documents: SupportingDocuments,
  export_requirement_forms: RequirementForms,
  export_shipment_workspace: ExportWorkspace,
  export_document_approvals: ExportApprovals,
  export_registers: ExportRegisters,
  processing_registers: ProcessingRegisters,
  inventory_registers: InventoryRegisters,
  accounts_registers: AccountsRegisters,
  hrms_registers: HRMSRegisters,
};

export const REPORT_COMPONENTS = {
  report_gate_entry_report: GateEntryReport,
  report_rmp_report: RMPReport,
  report_de_heading_report: DeHeadingReport,
  report_grading_report: GradingReport,
  report_peeling_report: PeelingReport,
  report_soaking_report: SoakingReport,
  report_production_report: ProductionReport,
  report_reprocess_report: ReprocessReport,
  report_floor_balance_report: FloorBalanceReport,
  report_inventory_report: StockReport,
  report_pending_orders_report: PendingOrdersReport,
  report_sales_report: SalesReport,
  report_gs_report: GeneralStockReport,
  report_cold_storage_holding_report: ColdStorageHoldingReport,
  report_storage_cost_report: StorageCostReport,
  report_floor_balance_value: FloorBalanceValue,
  report_inventory_costing: InventoryCosting,
};

export const COMPACT_PROCESSING_FORM_PAGES = new Set([
  'gate_entry',
  'raw_material_purchasing',
  'de_heading',
  'grading',
  'peeling',
  'soaking',
  'production',
]);

export const COMPACT_INVENTORY_FORM_PAGES = new Set([
  'stock_entry',
  'pending_orders',
  'cold_storage_holding',
  'general_stock_entry',
  'general_store_entry',
]);

export const isCompactHrmsFormPage = page => (
  page.startsWith('attendance_')
  || page === 'finance_salary_processing'
  || page === 'admin_shifts'
);
