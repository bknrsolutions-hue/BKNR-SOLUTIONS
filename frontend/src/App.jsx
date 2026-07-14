import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './App.css';

// Components
import Sidebar from './components/Sidebar';
import Header from './components/Header';

let initialSessionRequest;

function loadInitialSession() {
  if (!initialSessionRequest) {
    initialSessionRequest = fetch('/auth/session-info', { credentials: 'include' })
      .then(async response => {
        if (!response.ok) throw new Error('Unable to read session');
        return response.json();
      });
  }
  return initialSessionRequest;
}

const AuthContainer = lazy(() => import('./pages/Auth/AuthContainer'));
const DashboardsConsole = lazy(() => import('./pages/Dashboards/DashboardsConsole'));
const BackendConsole = lazy(() => import('./pages/BackendConsole'));
const ReportViewer = lazy(() => import('./pages/Reports/ReportViewer'));

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
  const [theme, setTheme]               = useState(() => localStorage.getItem('theme') || 'dark');
  const [user, setUser]                 = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [sidebarOpen, setSidebarOpen]   = useState(false);

  const activePage = location.pathname.startsWith('/page/')
    ? decodeURIComponent(location.pathname.slice('/page/'.length))
    : 'dashboard_processing';
  const activeRoute = new URLSearchParams(location.search).get('backend');

  const setActivePage = useCallback((id, route) => {
    const search = route ? `?backend=${encodeURIComponent(route)}` : '';
    navigate(`/page/${encodeURIComponent(id)}${search}`);
  }, [navigate]);

  // Sync theme to <html data-theme>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Load session on mount
  useEffect(() => {
    loadInitialSession()
      .then(data => {
        if (data.authenticated) {
          document.documentElement.setAttribute('data-user-email', data.email || '');
          document.documentElement.setAttribute('data-company-code', data.company_code || '');
          window.applyBKNRUiColors?.();
          setUser({
            email: data.email,
            company: data.company_name,
            company_code: data.company_code,
            name: data.name,
            role: data.role,
            permissions: data.permissions
          });
          localStorage.setItem('user_email', data.email);
        } else {
          setUser(null);
        }
      })
      .catch(() => { setUser(null); })
      .finally(() => { setLoadingSession(false); });
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
    if (activePage.startsWith('dashboard_')) {
      return (
        <DashboardsConsole
          key={activePage}
          activeDashboard={activePage.replace('dashboard_', '')}
          theme={theme}
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
        />

        <main className="main-content">
          <Suspense fallback={<PageLoading />}>
            {renderActivePage()}
          </Suspense>
        </main>
      </div>
    </React.Fragment>
  );
}
