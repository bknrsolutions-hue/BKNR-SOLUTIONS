import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './App.css';
import './SapHorizon.css';

// Components
import Sidebar from './components/Sidebar';
import Header from './components/Header';

let initialSessionRequest;

function loadInitialSession() {
  if (!initialSessionRequest) {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 8000);

    initialSessionRequest = fetch('/auth/session-info', {
      credentials: 'include',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to read session');
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) throw new Error('Invalid session response');
        return response.json();
      })
      .catch(error => {
        initialSessionRequest = undefined;
        throw error;
      })
      .finally(() => window.clearTimeout(timeoutId));
  }
  return initialSessionRequest;
}

const AuthContainer = lazy(() => import('./pages/Auth/AuthContainer'));
const DashboardsConsole = lazy(() => import('./pages/Dashboards/DashboardsConsole'));
const BackendConsole = lazy(() => import('./pages/BackendConsole'));
const ReportViewer = lazy(() => import('./pages/Reports/ReportViewer'));
const UserProfile = lazy(() => import('./pages/Profile/Profile'));

const GateEntryReport = lazy(() => import('./pages/Reports/GateEntryReport'));
const RMPReport = lazy(() => import('./pages/Reports/RMPReport'));
const DeHeadingReport = lazy(() => import('./pages/Reports/DeHeadingReport'));
const GradingReport = lazy(() => import('./pages/Reports/GradingReport'));
const PeelingReport = lazy(() => import('./pages/Reports/PeelingReport'));
const SoakingReport = lazy(() => import('./pages/Reports/SoakingReport'));
const ProductionReport = lazy(() => import('./pages/Reports/ProductionReport'));
const ReprocessReport = lazy(() => import('./pages/Reports/ReprocessReport'));
const FloorBalanceReport = lazy(() => import('./pages/Reports/FloorBalanceReport'));
const StockReport = lazy(() => import('./pages/Reports/StockReport'));
const PendingOrdersReport = lazy(() => import('./pages/Reports/PendingOrdersReport'));
const SalesReport = lazy(() => import('./pages/Reports/SalesReport'));
const GeneralStockReport = lazy(() => import('./pages/Reports/GeneralStockReport'));
const ColdStorageHoldingReport = lazy(() => import('./pages/Reports/ColdStorageHoldingReport'));
const StorageCostReport = lazy(() => import('./pages/Reports/StorageCostReport'));
const FloorBalanceValue = lazy(() => import('./pages/Reports/FloorBalanceValue'));
const InventoryCosting = lazy(() => import('./pages/Reports/InventoryCosting'));

const Buyers = lazy(() => import('./pages/Criteria/Buyers'));
const BuyerAgents = lazy(() => import('./pages/Criteria/BuyerAgents'));
const Suppliers = lazy(() => import('./pages/Criteria/Suppliers'));
const Vendors = lazy(() => import('./pages/Criteria/Vendors'));
const Countries = lazy(() => import('./pages/Criteria/Countries'));
const Brands = lazy(() => import('./pages/Criteria/Brands'));
const PurchasingLocations = lazy(() => import('./pages/Criteria/PurchasingLocations'));
const Species = lazy(() => import('./pages/Criteria/Species'));
const Varieties = lazy(() => import('./pages/Criteria/Varieties'));
const Grades = lazy(() => import('./pages/Criteria/Grades'));
const Freezers = lazy(() => import('./pages/Criteria/Freezers'));
const Glazes = lazy(() => import('./pages/Criteria/Glazes'));
const PackingStyles = lazy(() => import('./pages/Criteria/PackingStyles'));
const Contractors = lazy(() => import('./pages/Criteria/Contractors'));
const PeelingAt = lazy(() => import('./pages/Criteria/PeelingAt'));
const PeelingRates = lazy(() => import('./pages/Criteria/PeelingRates'));
const ProductionAt = lazy(() => import('./pages/Criteria/ProductionAt'));
const ProductionFor = lazy(() => import('./pages/Criteria/ProductionFor'));
const ProductionTypes = lazy(() => import('./pages/Criteria/ProductionTypes'));
const Chemicals = lazy(() => import('./pages/Criteria/Chemicals'));
const Purposes = lazy(() => import('./pages/Criteria/Purposes'));
const GradeToHoso = lazy(() => import('./pages/Criteria/GradeToHoso'));
const HosoHlso = lazy(() => import('./pages/Criteria/HosoHlso'));
const ColdStorage = lazy(() => import('./pages/Criteria/ColdStorage'));
const ColdstoreLocations = lazy(() => import('./pages/Criteria/ColdstoreLocations'));
const VehicleNumbers = lazy(() => import('./pages/Criteria/VehicleNumbers'));
const HsnCodes = lazy(() => import('./pages/Criteria/HsnCodes'));
const ShippingVendors = lazy(() => import('./pages/Criteria/ShippingVendors'));

const GateEntry = lazy(() => import('./pages/Processing/GateEntry'));
const RawMaterialPurchasing = lazy(() => import('./pages/Processing/RawMaterialPurchasing'));
const DeHeading = lazy(() => import('./pages/Processing/DeHeading'));
const Grading = lazy(() => import('./pages/Processing/Grading'));
const Peeling = lazy(() => import('./pages/Processing/Peeling'));
const Soaking = lazy(() => import('./pages/Processing/Soaking'));
const Production = lazy(() => import('./pages/Processing/Production'));
const StockEntry = lazy(() => import('./pages/Processing/StockEntry'));
const PendingOrders = lazy(() => import('./pages/Processing/PendingOrders'));
const ColdStorageHolding = lazy(() => import('./pages/Processing/ColdStorageHolding'));
const GeneralStoreEntry = lazy(() => import('./pages/Processing/GeneralStoreEntry'));
const DailyAttendance = lazy(() => import('./pages/Attendance/DailyAttendance'));
const AdminConsole = lazy(() => import('./pages/Admin/AdminConsole'));
const StaffRegistration = lazy(() => import('./pages/Attendance/StaffRegistration'));
const IncrementDetails = lazy(() => import('./pages/Attendance/IncrementDetails'));
const MonthlySalarySheet = lazy(() => import('./pages/Attendance/MonthlySalarySheet'));
const StatutoryMaster = lazy(() => import('./pages/Attendance/StatutoryMaster'));
const SalaryAdvance = lazy(() => import('./pages/Attendance/SalaryAdvance'));
const SalaryProcessing = lazy(() => import('./pages/Attendance/SalaryProcessing'));

// Finance & Accounts Components
const LedgerDirectory = lazy(() => import('./pages/FinanceAccounts/LedgerDirectory'));
const JournalEntries = lazy(() => import('./pages/FinanceAccounts/JournalEntries'));
const BankTransactions = lazy(() => import('./pages/FinanceAccounts/BankTransactions'));
const PaymentReceipts = lazy(() => import('./pages/FinanceAccounts/PaymentReceipts'));
const CustomerReceivables = lazy(() => import('./pages/FinanceAccounts/CustomerReceivables'));
const VendorPayments = lazy(() => import('./pages/FinanceAccounts/VendorPayments'));
const ExpenseVouchers = lazy(() => import('./pages/FinanceAccounts/ExpenseVouchers'));
const TallyDashboard = lazy(() => import('./pages/FinanceAccounts/TallyDashboard'));
const ProductionCostAutomation = lazy(() => import('./pages/FinanceAccounts/ProductionCostAutomation'));
const AccountsFlowGuide = lazy(() => import('./pages/FinanceAccounts/NativeFinanceRegisters').then(module => ({ default: module.AccountsFlowGuide })));
const BankMasterPage = lazy(() => import('./pages/FinanceAccounts/NativeFinanceRegisters').then(module => ({ default: module.BankMasterPage })));
const ItemAccountingLinkPage = lazy(() => import('./pages/FinanceAccounts/NativeFinanceRegisters').then(module => ({ default: module.ItemAccountingLinkPage })));
const ExportIncentivePage = lazy(() => import('./pages/FinanceAccounts/NativeFinanceRegisters').then(module => ({ default: module.ExportIncentivePage })));
const LcTrackingPage = lazy(() => import('./pages/FinanceAccounts/NativeFinanceRegisters').then(module => ({ default: module.LcTrackingPage })));
const GstRegisterPage = lazy(() => import('./pages/FinanceAccounts/NativeFinanceRegisters').then(module => ({ default: module.GstRegisterPage })));
const FixedAssetsPage = lazy(() => import('./pages/FinanceAccounts/NativeFinanceRegisters').then(module => ({ default: module.FixedAssetsPage })));
const ContractorBillsPage = lazy(() => import('./pages/FinanceAccounts/OperationalPayables').then(module => ({ default: module.ContractorBillsPage })));
const SalaryBillsPage = lazy(() => import('./pages/FinanceAccounts/OperationalPayables').then(module => ({ default: module.SalaryBillsPage })));
const VendorBillsPage = lazy(() => import('./pages/FinanceAccounts/OperationalPayables').then(module => ({ default: module.VendorBillsPage })));
const SupplierBillsPage = lazy(() => import('./pages/FinanceAccounts/OperationalPayables').then(module => ({ default: module.SupplierBillsPage })));
const PaymentLogsPage = lazy(() => import('./pages/FinanceAccounts/OperationalPayables').then(module => ({ default: module.PaymentLogsPage })));

// Commercial Bills Components
const ElectricityBills = lazy(() => import('./pages/FinanceAccounts/ElectricityBills'));
const DieselConsumption = lazy(() => import('./pages/FinanceAccounts/DieselConsumption'));
const PurchasePackaging = lazy(() => import('./pages/FinanceAccounts/PurchasePackaging'));
const LogisticsFreight = lazy(() => import('./pages/FinanceAccounts/LogisticsFreight'));
const QaTestingCharges = lazy(() => import('./pages/FinanceAccounts/QaTestingCharges'));
const OtherExpenses = lazy(() => import('./pages/FinanceAccounts/OtherExpenses'));

// Export Documents Components
const ProformaInvoices = lazy(() => import('./pages/ExportDocuments/ProformaInvoices'));
const ExportShipments = lazy(() => import('./pages/ExportDocuments/ExportShipments'));
const CommercialInvoices = lazy(() => import('./pages/ExportDocuments/CommercialInvoices'));
const PackingLists = lazy(() => import('./pages/ExportDocuments/PackingLists'));
const ContainerStuffing = lazy(() => import('./pages/ExportDocuments/ContainerStuffing'));
const ShippingBills = lazy(() => import('./pages/ExportDocuments/ShippingBills'));
const BillsOfLading = lazy(() => import('./pages/ExportDocuments/BillsOfLading'));
const HealthCertificates = lazy(() => import('./pages/ExportDocuments/HealthCertificates'));
const SupportingDocuments = lazy(() => import('./pages/ExportDocuments/SupportingDocuments'));
const RequirementForms = lazy(() => import('./pages/ExportDocuments/RequirementForms'));
const RequirementDocumentPage = lazy(() => import('./pages/ExportDocuments/RequirementDocumentPage'));
const ExportWorkspace = lazy(() => import('./pages/ExportDocuments/ExportWorkspace'));
const ExportApprovals = lazy(() => import('./pages/ExportDocuments/ExportApprovals'));
const ExportRegisters = lazy(() => import('./pages/ExportDocuments/ExportRegisters'));
const ExportDashboard = lazy(() => import('./pages/Dashboards/ExportDashboard'));

const CRITERIA_COMPONENTS = {
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
};

const REPORT_COMPONENTS = {
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

function PageLoading() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span className="route-loading-spinner" aria-hidden="true" />
      <span>Loading page...</span>
    </div>
  );
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [theme, setTheme]               = useState(() => localStorage.getItem('theme') || 'light');
  const [user, setUser]                 = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [availableMenuItems, setAvailableMenuItems] = useState([]);
  const [appNotice, setAppNotice]       = useState(null);

  const activePage = location.pathname.startsWith('/page/')
    ? decodeURIComponent(location.pathname.slice('/page/'.length))
    : 'dashboard_processing';
  const activeRoute = new URLSearchParams(location.search).get('backend');
  const isEmbedded = new URLSearchParams(location.search).get('embedded') === 'true';

  const setActivePage = useCallback((id, route) => {
    const search = route ? `?backend=${encodeURIComponent(route)}` : '';
    navigate(`/page/${encodeURIComponent(id)}${search}`);
  }, [navigate]);

  // Sync theme to <html data-theme>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.applyBKNRUiColors?.();
  }, [theme]);

  useEffect(() => {
    if (!appNotice) return undefined;
    const timeout = window.setTimeout(() => setAppNotice(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [appNotice]);

  useEffect(() => {
    const originalAlert = window.alert.bind(window);
    const successPattern = /success|saved|created|updated|cancelled|completed|registered|recorded|uploaded/i;
    const notify = (message, type = 'success') => setAppNotice({ message: String(message || 'Action completed successfully.'), type });
    const handleApiFeedback = event => {
      const detail = event.detail || {};
      notify(detail.message, detail.type === 'error' ? 'error' : 'success');
    };
    const appAlert = message => {
      if (successPattern.test(String(message || ''))) notify(message, 'success');
      else originalAlert(message);
    };
    window.BKNRNotify = notify;
    window.alert = appAlert;
    window.addEventListener('bknr:api-feedback', handleApiFeedback);
    return () => {
      window.removeEventListener('bknr:api-feedback', handleApiFeedback);
      if (window.alert === appAlert) window.alert = originalAlert;
      if (window.BKNRNotify === notify) delete window.BKNRNotify;
    };
  }, []);

  // Load session on mount
  useEffect(() => {
    let active = true;
    // Some mobile WebViews do not reliably reject a fetch after AbortController
    // fires, especially when a service worker has intercepted the request. Keep
    // the workspace loader bounded independently so the app can always recover.
    const loadingDeadline = window.setTimeout(() => {
      if (active) setLoadingSession(false);
    }, 6000);

    loadInitialSession()
      .then(data => {
        if (!active) return;
        if (data.authenticated) {
          document.documentElement.setAttribute('data-user-email', data.email || '');
          document.documentElement.setAttribute('data-company-code', data.company_code || '');
          window.applyBKNRUiColors?.();
          setUser({
            email: data.email,
            company: data.company_name,
            company_code: data.company_code,
            mpeda_registration_code: data.mpeda_registration_code,
            name: data.name,
            role: data.role,
            permissions: data.permissions
          });
          localStorage.setItem('user_email', data.email);
        } else {
          setUser(null);
        }
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        window.clearTimeout(loadingDeadline);
        if (active) setLoadingSession(false);
      });

    return () => {
      active = false;
      window.clearTimeout(loadingDeadline);
    };
  }, []);

  useEffect(() => {
    const handleSessionExpired = () => {
      initialSessionRequest = undefined;
      document.documentElement.removeAttribute('data-user-email');
      document.documentElement.removeAttribute('data-company-code');
      localStorage.removeItem('user_email');
      setUser(null);
      setLoadingSession(false);
    };
    window.addEventListener('bknr:session-expired', handleSessionExpired);
    return () => window.removeEventListener('bknr:session-expired', handleSessionExpired);
  }, []);

  const toggleTheme = () => setTheme(prev => {
    const next = prev === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    return next;
  });

  const handleLoginSuccess = async () => {
    try {
      const res = await fetch('/auth/session-info', {
        credentials: 'include'
      });
  
      if (res.ok) {
        const data = await res.json();
  
        if (data.authenticated) {
          document.documentElement.setAttribute('data-user-email', data.email || '');
          document.documentElement.setAttribute('data-company-code', data.company_code || '');
          window.applyBKNRUiColors?.();
          setUser({
            email: data.email,
            company: data.company_name,
            company_code: data.company_code,
            mpeda_registration_code: data.mpeda_registration_code,
            name: data.name,
            role: data.role,
            permissions: data.permissions
          });
          localStorage.setItem('user_email', data.email);
          setActivePage('dashboard_processing', null);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/auth/logout');
    } catch {
      // Local session state is still cleared if the server is unreachable.
    }
    setUser(null);
    navigate('/', { replace: true });
  };

  // ── Page Router ──────────────────────────────────────────────────────────
  const renderActivePage = () => {
    // Dashboards — full React components (no iframe needed)
    if (['dashboard_processing', 'dashboard_inventory', 'dashboard_hr', 'dashboard_costing', 'dashboard_finance'].includes(activePage)) {
      return (
        <DashboardsConsole
          key={activePage}
          activeDashboard={activePage.replace('dashboard_', '')}
          theme={theme}
          setActivePage={setActivePage}
        />
      );
    }

    if (activePage === 'user_profile') {
      return (
        <UserProfile
          key="user_profile"
          onProfileUpdated={profile => setUser(current => current ? {
            ...current,
            name: profile.name,
            email: profile.email,
            designation: profile.designation,
          } : current)}
        />
      );
    }

    if (activePage.startsWith('admin_')) {
      return (
        <AdminConsole
          key={activePage}
          activePage={activePage}
          activeRoute={activeRoute}
          user={user}
          theme={theme}
          setActivePage={setActivePage}
        />
      );
    }

    // Direct React Criteria / Masters pages
    if (CRITERIA_COMPONENTS[activePage]) {
      const Component = CRITERIA_COMPONENTS[activePage];
      return (
        <Component
          key={activePage}
          user={user}
          theme={theme}
          setActivePage={setActivePage}
        />
      );
    }

    if (activePage.startsWith('export_requirement_') && activePage !== 'export_requirement_forms') {
      return (
        <RequirementDocumentPage
          key={activePage}
          documentKind={activePage.slice('export_requirement_'.length)}
        />
      );
    }

    // Custom React Reports
    if (REPORT_COMPONENTS[activePage]) {
      const Component = REPORT_COMPONENTS[activePage];
      return (
        <Component
          key={activePage}
          activeRoute={activeRoute}
          user={user}
          theme={theme}
        />
      );
    }

    // Fallback React Report Viewer (for compound dashboards/summaries)
    if (activePage.startsWith('report_')) {
      return (
        <ReportViewer
          key={activePage}
          reportId={activePage}
          activeRoute={activeRoute}
          user={user}
          theme={theme}
        />
      );
    }

    // Every other page — iframe loads the real backend HTML template
    // activeRoute comes directly from the sidebar's item.route field
    return (
      <BackendConsole
        key={activePage}
        activePage={activePage}
        activeRoute={activeRoute}
        theme={theme}
      />
    );
  };

  // ── Loading screen ───────────────────────────────────────────────────────
  if (loadingSession) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        height: '100vh', width: '100vw',
        background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 25%, #e2e8f0 75%, #cbd5e1 100%)',
        color: '#0f172a', fontFamily: "'Inter', sans-serif"
      }}>
        <h2 style={{ fontWeight: 800, fontSize: '1.5rem', marginBottom: '8px' }}>BKNR ERP</h2>
        <p style={{ color: '#475569', fontSize: '0.88rem' }}>Loading Workspace Architecture...</p>
      </div>
    );
  }

  // ── Auth screen ──────────────────────────────────────────────────────────
  if (!user) {
    return (
      <Suspense fallback={<PageLoading />}>
        <AuthContainer handleLoginSuccess={handleLoginSuccess} />
      </Suspense>
    );
  }

  const noticePopup = appNotice && (
    <div className={`app-success-popup ${appNotice.type === 'error' ? 'error' : 'success'}`} role="status" aria-live="polite">
      <span className="app-success-popup-icon" aria-hidden="true">{appNotice.type === 'error' ? '!' : '✓'}</span>
      <span>{appNotice.message}</span>
      <button type="button" onClick={() => setAppNotice(null)} aria-label="Close notification">×</button>
    </div>
  );

  if (isEmbedded) {
    return (
      <div className="embedded-app-shell">
        <main className="embedded-app-content">
          <Suspense fallback={<PageLoading />}>
            {renderActivePage()}
          </Suspense>
        </main>
        {noticePopup}
      </div>
    );
  }

  // ── Main ERP Layout ──────────────────────────────────────────────────────
  return (
    <React.Fragment>
      <div
        className={`sidebar-overlay ${sidebarOpen ? 'show' : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
        user={user}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        onMenuItemsReady={setAvailableMenuItems}
      />

      <div className="app-container">
        <Header
          theme={theme}
          toggleTheme={toggleTheme}
          user={user}
          handleLogout={handleLogout}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          setActivePage={setActivePage}
          availableMenuItems={availableMenuItems}
        />

        <main className="main-content">
          <Suspense fallback={<PageLoading />}>
            {renderActivePage()}
          </Suspense>
        </main>
      </div>
      {noticePopup}
    </React.Fragment>
  );
}
