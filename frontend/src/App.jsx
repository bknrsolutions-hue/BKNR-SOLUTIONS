import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { TOKEN_MAP, PAGE_ID_MAP } from './utils/pageTokens';
import './App.css';
import './SapHorizon.css';
import './ErpTables.css';

// Components
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import AnimatedBrandLogo from './components/AnimatedBrandLogo';

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
const SupportTicketDesk = lazy(() => import('./pages/Admin/AdminConsole').then(module => ({ default: module.TicketDesk })));
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
const ProcessingRegisters = lazy(() => import('./pages/Registers/ModuleRegisters').then(module => ({ default: module.ProcessingRegisters })));
const InventoryRegisters = lazy(() => import('./pages/Registers/ModuleRegisters').then(module => ({ default: module.InventoryRegisters })));
const AccountsRegisters = lazy(() => import('./pages/Registers/ModuleRegisters').then(module => ({ default: module.AccountsRegisters })));
const HRMSRegisters = lazy(() => import('./pages/Registers/ModuleRegisters').then(module => ({ default: module.HRMSRegisters })));
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
  processing_registers: ProcessingRegisters,
  inventory_registers: InventoryRegisters,
  accounts_registers: AccountsRegisters,
  hrms_registers: HRMSRegisters,
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

const COMPACT_PROCESSING_FORM_PAGES = new Set([
  'gate_entry',
  'raw_material_purchasing',
  'de_heading',
  'grading',
  'peeling',
  'soaking',
  'production',
]);

const COMPACT_INVENTORY_FORM_PAGES = new Set([
  'stock_entry',
  'pending_orders',
  'cold_storage_holding',
  'general_stock_entry',
  'general_store_entry',
]);

const isCompactHrmsFormPage = page => (
  page.startsWith('attendance_')
  || page === 'finance_salary_processing'
  || page === 'admin_shifts'
);

function tenantLogoSource(url) {
  if (!url) return '';
  return /^https?:\/\//i.test(url) ? url : url.startsWith('/') ? url : `/${url}`;
}

function PageLoading({ user }) {
  const companyName = user?.company || localStorage.getItem('tenant_company_name') || 'SVBK ERP';
  const logoUrl = tenantLogoSource(user?.company_logo_url || localStorage.getItem('tenant_company_logo'));
  return (
    <div className="route-loading" role="status" aria-live="polite">
      {logoUrl
        ? <img className="tenant-loading-logo compact" src={logoUrl} alt={`${companyName} logo`} />
        : <AnimatedBrandLogo size={64} loop />}
      <strong>{companyName}</strong>
      <span>Loading workspace…</span>
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
  const [supportDrawer, setSupportDrawer] = useState(null);
  const [supportDrawerPosition, setSupportDrawerPosition] = useState(null);
  const [floatingSupportPosition, setFloatingSupportPosition] = useState(null);
  const supportDrawerRef = useRef(null);
  const floatingSupportRef = useRef(null);
  const floatingSupportDragged = useRef(false);

  // ── Opaque token routing (/p/<token>) with legacy /page/<id> fallback ──────
  // Resolves the current URL to activePage + activeRoute without an API call.
  // Security for backend data remains in the existing FastAPI AuthMiddleware.
  const _rawPath = location.pathname;
  const _isTokenRoute  = _rawPath.startsWith('/p/');
  const _isLegacyRoute = _rawPath.startsWith('/page/');
  const _currentToken  = _isTokenRoute  ? decodeURIComponent(_rawPath.slice('/p/'.length))    : null;
  const _tokenEntry    = _currentToken  ? (TOKEN_MAP[_currentToken] ?? null)                   : null;

  const activePage = _isTokenRoute
    ? (_tokenEntry?.page_id || 'dashboard_processing')
    : _isLegacyRoute
    ? decodeURIComponent(_rawPath.slice('/page/'.length))
    : 'dashboard_processing';

  const activeRoute = _isTokenRoute
    ? (_tokenEntry?.backend ?? null)
    : new URLSearchParams(location.search).get('backend');
  const isEmbedded = new URLSearchParams(location.search).get('embedded') === 'true';
  const compactFormModule = COMPACT_PROCESSING_FORM_PAGES.has(activePage)
    ? 'processing'
    : COMPACT_INVENTORY_FORM_PAGES.has(activePage)
      ? 'inventory'
      : isCompactHrmsFormPage(activePage)
        ? 'hrms'
        : '';
  const mainContentClass = `main-content${compactFormModule ? ` erp-compact-module-forms erp-${compactFormModule}-forms` : ''}`;

  const setActivePage = useCallback((idOrToken, legacyRoute) => {
    // Support drawer pages open in a floating panel — not a full navigation.
    if (idOrToken === 'admin_raise_ticket' || idOrToken === 'admin_helpdesk') {
      setSupportDrawer({
        activePage: idOrToken,
        activeRoute: legacyRoute || (idOrToken === 'admin_helpdesk' ? '/admin/all_tickets' : '/support/my_tickets'),
      });
      setSupportDrawerPosition(null);
      setSidebarOpen(false);
      return;
    }
    // 1. Direct token passed (e.g. from Sidebar item.token)
    if (TOKEN_MAP[idOrToken]) {
      navigate(`/p/${encodeURIComponent(idOrToken)}`);
      return;
    }
    // 2. page_id passed — look up its token for a clean URL
    const tok = PAGE_ID_MAP[idOrToken];
    if (tok) {
      navigate(`/p/${encodeURIComponent(tok)}`);
      return;
    }
    // 3. Legacy fallback (unknown page_id / internal component calls)
    const search = legacyRoute ? `?backend=${encodeURIComponent(legacyRoute)}` : '';
    navigate(`/page/${encodeURIComponent(idOrToken)}${search}`);
  }, [navigate]);

  useEffect(() => {
    if (activePage !== 'admin_raise_ticket' && activePage !== 'admin_helpdesk') return;
    setSupportDrawer({
      activePage,
      activeRoute: activeRoute || (activePage === 'admin_helpdesk' ? '/admin/all_tickets' : '/support/my_tickets'),
    });
    setSupportDrawerPosition(null);
    navigate('/page/dashboard_processing', { replace: true });
  }, [activePage, activeRoute, navigate]);

  useEffect(() => {
    if (!supportDrawer) return undefined;
    const closeOnEscape = event => {
      if (event.key === 'Escape') setSupportDrawer(null);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [supportDrawer]);

  const startSupportDrawerDrag = useCallback(event => {
    if (event.button !== 0 || event.target.closest('button, input, select, textarea, a')) return;
    const panel = supportDrawerRef.current;
    if (!panel) return;

    const bounds = panel.getBoundingClientRect();
    const offsetX = event.clientX - bounds.left;
    const offsetY = event.clientY - bounds.top;

    const moveDrawer = moveEvent => {
      const maxLeft = Math.max(0, window.innerWidth - bounds.width);
      const maxTop = Math.max(0, window.innerHeight - bounds.height);
      setSupportDrawerPosition({
        left: Math.min(maxLeft, Math.max(0, moveEvent.clientX - offsetX)),
        top: Math.min(maxTop, Math.max(0, moveEvent.clientY - offsetY)),
      });
    };
    const stopDragging = () => {
      document.removeEventListener('pointermove', moveDrawer);
      document.removeEventListener('pointerup', stopDragging);
      document.body.classList.remove('support-drawer-dragging');
    };

    event.preventDefault();
    document.body.classList.add('support-drawer-dragging');
    document.addEventListener('pointermove', moveDrawer);
    document.addEventListener('pointerup', stopDragging);
  }, []);

  const openFloatingSupport = useCallback(() => {
    if (floatingSupportDragged.current) {
      floatingSupportDragged.current = false;
      return;
    }
    if (supportDrawer) return;
    const isDefaultSuperAdmin = user?.email?.trim().toLowerCase() === 'bknr.solutions@gmail.com';
    setActivePage(
      isDefaultSuperAdmin ? 'admin_helpdesk' : 'admin_raise_ticket',
      isDefaultSuperAdmin ? '/admin/all_tickets' : '/support/my_tickets',
    );
  }, [setActivePage, supportDrawer, user?.email]);

  const startFloatingSupportDrag = useCallback(event => {
    if (event.button !== 0) return;
    const launcher = floatingSupportRef.current;
    if (!launcher) return;

    const bounds = launcher.getBoundingClientRect();
    const originX = event.clientX;
    const originY = event.clientY;
    const offsetX = originX - bounds.left;
    const offsetY = originY - bounds.top;
    let moved = false;

    const moveLauncher = moveEvent => {
      if (!moved && Math.hypot(moveEvent.clientX - originX, moveEvent.clientY - originY) < 5) return;
      moved = true;
      floatingSupportDragged.current = true;
      setFloatingSupportPosition({
        left: Math.min(Math.max(0, window.innerWidth - bounds.width), Math.max(0, moveEvent.clientX - offsetX)),
        top: Math.min(Math.max(0, window.innerHeight - bounds.height), Math.max(0, moveEvent.clientY - offsetY)),
      });
    };
    const stopDragging = () => {
      document.removeEventListener('pointermove', moveLauncher);
      document.removeEventListener('pointerup', stopDragging);
      document.body.classList.remove('floating-support-dragging');
      if (moved) window.setTimeout(() => { floatingSupportDragged.current = false; }, 0);
    };

    document.body.classList.add('floating-support-dragging');
    document.addEventListener('pointermove', moveLauncher);
    document.addEventListener('pointerup', stopDragging);
  }, []);

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
            company_logo_url: data.company_logo_url,
            name: data.name,
            role: data.role,
            permissions: data.permissions
          });
          localStorage.setItem('tenant_company_name', data.company_name || 'SVBK ERP');
          if (data.company_logo_url) localStorage.setItem('tenant_company_logo', data.company_logo_url);
          else localStorage.removeItem('tenant_company_logo');
          localStorage.setItem('user_email', data.email);
        } else {
          setUser(null);
        }
        return data.authenticated
          ? new Promise(resolve => window.setTimeout(resolve, 450))
          : undefined;
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

  useEffect(() => {
    if (!user) return undefined;
    let checking = false;
    const checkSession = async () => {
      if (checking) return;
      checking = true;
      try {
        const response = await fetch('/auth/session-info', {
          credentials: 'include',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        });
        if (response.ok) {
          const data = await response.clone().json();
          if (!data.authenticated) {
            window.dispatchEvent(new CustomEvent('bknr:session-expired'));
          } else {
            setUser(current => current ? {
              ...current,
              email: data.email,
              name: data.name,
              company: data.company_name,
              company_code: data.company_code,
              company_logo_url: data.company_logo_url,
              role: data.role,
              permissions: data.permissions,
            } : current);
          }
        }
      } catch {
        // A temporary network outage must not log out a valid local session.
      } finally {
        checking = false;
      }
    };
    const interval = window.setInterval(checkSession, 15000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void checkSession();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', checkSession);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', checkSession);
    };
  }, [user]);

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
            company_logo_url: data.company_logo_url,
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

    // Direct React Criteria / Masters / Operations pages
    if (CRITERIA_COMPONENTS[activePage]) {
      const Component = CRITERIA_COMPONENTS[activePage];
      return (
        <Component
          key={activePage}
          user={user}
          theme={theme}
          setActivePage={setActivePage}
          activeRoute={activeRoute}
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
    const loadingCompanyName = user?.company || localStorage.getItem('tenant_company_name') || 'SVBK ERP';
    const loadingLogoUrl = tenantLogoSource(user?.company_logo_url || localStorage.getItem('tenant_company_logo'));
    return (
      <div className="tenant-loading-screen" role="status" aria-live="polite">
        {loadingLogoUrl
          ? <img className="tenant-loading-logo" src={loadingLogoUrl} alt={`${loadingCompanyName} logo`} />
          : <AnimatedBrandLogo size={110} loop />}
        <h2>{loadingCompanyName}</h2>
        <p>Opening secure workspace…</p>
      </div>
    );
  }

  // ── Auth screen ──────────────────────────────────────────────────────────
  if (!user) {
    return (
      <Suspense fallback={<PageLoading user={user} />}>
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
        <main className={`embedded-app-content${compactFormModule ? ` erp-compact-module-forms erp-${compactFormModule}-forms` : ''}`}>
          <Suspense fallback={<PageLoading user={user} />}>
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

        <main className={mainContentClass}>
          <Suspense fallback={<PageLoading user={user} />}>
            {renderActivePage()}
          </Suspense>
        </main>
      </div>
      {supportDrawer && (
        <div className="react-support-drawer" aria-label="Support and helpdesk">
          <aside
            ref={supportDrawerRef}
            className="react-support-drawer-panel"
            role="dialog"
            aria-modal="false"
            style={supportDrawerPosition ? {
              left: supportDrawerPosition.left,
              top: supportDrawerPosition.top,
              right: 'auto',
            } : undefined}
          >
            <div className="react-support-drawer-head" onPointerDown={startSupportDrawerDrag}>
              <div>
                <span>SVBK ERP</span>
                <strong>{supportDrawer.activePage === 'admin_helpdesk' ? 'Helpdesk' : 'Support'}</strong>
              </div>
              <button
                type="button"
                onClick={() => setSupportDrawer(null)}
                title="Close Support"
                aria-label="Close Support"
              >
                <i className="fa-solid fa-support-agent" aria-hidden="true" />
              </button>
            </div>
            <div className="react-support-drawer-content">
              <Suspense fallback={<PageLoading user={user} />}>
                <SupportTicketDesk
                  activePage={supportDrawer.activePage}
                  activeRoute={supportDrawer.activeRoute}
                  compact
                />
              </Suspense>
            </div>
            <span className="react-support-resize-hint" aria-hidden="true">
              <i className="fa-solid fa-up-right-and-down-left-from-center" />
            </span>
          </aside>
        </div>
      )}
      <button
        ref={floatingSupportRef}
        type="button"
        className={`floating-support-launcher ${supportDrawer ? 'active' : ''}`}
        onClick={openFloatingSupport}
        onPointerDown={startFloatingSupportDrag}
        style={floatingSupportPosition ? {
          left: floatingSupportPosition.left,
          top: floatingSupportPosition.top,
          right: 'auto',
          bottom: 'auto',
        } : undefined}
        title="Open Support"
        aria-label="Open Support"
        aria-pressed={Boolean(supportDrawer)}
      >
        <i className="fa-solid fa-support-agent" aria-hidden="true" />
      </button>
      {noticePopup}
    </React.Fragment>
  );
}
