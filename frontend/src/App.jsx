import React, { useState, useEffect } from 'react';
import './App.css';

// Components
import Sidebar from './components/Sidebar';
import Header from './components/Header';

// Auth Pages
import AuthContainer from './pages/Auth/AuthContainer';

// Dashboard Pages (kept as full React — charts, KPIs, live stats)
import DashboardsConsole from './pages/Dashboards/DashboardsConsole';

// Universal Backend Console — iframes every backend HTML template without touching them
import BackendConsole from './pages/BackendConsole';

// Report Viewer
import ReportViewer from './pages/Reports/ReportViewer';

// Custom React Reports
import GateEntryReport from './pages/Reports/GateEntryReport';
import RMPReport from './pages/Reports/RMPReport';
import DeHeadingReport from './pages/Reports/DeHeadingReport';
import GradingReport from './pages/Reports/GradingReport';
import PeelingReport from './pages/Reports/PeelingReport';
import SoakingReport from './pages/Reports/SoakingReport';
import ProductionReport from './pages/Reports/ProductionReport';
import ReprocessReport from './pages/Reports/ReprocessReport';
import FloorBalanceReport from './pages/Reports/FloorBalanceReport';
import StockReport from './pages/Reports/StockReport';
import PendingOrdersReport from './pages/Reports/PendingOrdersReport';
import SalesReport from './pages/Reports/SalesReport';
import GeneralStockReport from './pages/Reports/GeneralStockReport';
import ColdStorageHoldingReport from './pages/Reports/ColdStorageHoldingReport';
import StorageCostReport from './pages/Reports/StorageCostReport';
import FloorBalanceValue from './pages/Reports/FloorBalanceValue';
import InventoryCosting from './pages/Reports/InventoryCosting';

// Criteria / Masters Pages
import Buyers from './pages/Criteria/Buyers';
import BuyerAgents from './pages/Criteria/BuyerAgents';
import Suppliers from './pages/Criteria/Suppliers';
import Vendors from './pages/Criteria/Vendors';
import Countries from './pages/Criteria/Countries';
import Brands from './pages/Criteria/Brands';
import PurchasingLocations from './pages/Criteria/PurchasingLocations';
import Species from './pages/Criteria/Species';
import Varieties from './pages/Criteria/Varieties';
import Grades from './pages/Criteria/Grades';
import Freezers from './pages/Criteria/Freezers';
import Glazes from './pages/Criteria/Glazes';
import PackingStyles from './pages/Criteria/PackingStyles';
import Contractors from './pages/Criteria/Contractors';
import PeelingAt from './pages/Criteria/PeelingAt';
import PeelingRates from './pages/Criteria/PeelingRates';
import ProductionAt from './pages/Criteria/ProductionAt';
import ProductionFor from './pages/Criteria/ProductionFor';
import ProductionTypes from './pages/Criteria/ProductionTypes';
import Chemicals from './pages/Criteria/Chemicals';
import Purposes from './pages/Criteria/Purposes';
import GradeToHoso from './pages/Criteria/GradeToHoso';
import HosoHlso from './pages/Criteria/HosoHlso';
import ColdStorage from './pages/Criteria/ColdStorage';
import ColdstoreLocations from './pages/Criteria/ColdstoreLocations';
import VehicleNumbers from './pages/Criteria/VehicleNumbers';
import HsnCodes from './pages/Criteria/HsnCodes';
import ShippingVendors from './pages/Criteria/ShippingVendors';

// Processing Operations Pages
import GateEntry from './pages/Processing/GateEntry';
import RawMaterialPurchasing from './pages/Processing/RawMaterialPurchasing';
import DeHeading from './pages/Processing/DeHeading';
import Grading from './pages/Processing/Grading';
import Peeling from './pages/Processing/Peeling';
import Soaking from './pages/Processing/Soaking';
import Production from './pages/Processing/Production';

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

export default function App() {
  const [theme, setTheme]               = useState('dark');
  const [user, setUser]                 = useState(null);
  const [activePage, setActivePage_]    = useState('dashboard_processing');
  const [activeRoute, setActiveRoute]   = useState(null); // backend URL for current page
  const [loadingSession, setLoadingSession] = useState(true);
  const [sidebarOpen, setSidebarOpen]   = useState(false);

  // Combined setter — sidebar passes both id and route
  const setActivePage = (id, route) => {
    setActivePage_(id);
    setActiveRoute(route || null);
  };

  // Sync theme to <html data-theme>
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Load session on mount
  useEffect(() => {
    fetch('/auth/session-info')
      .then(res => {
        if (res.ok) return res.json();
        throw new Error('Not authenticated');
      })
      .then(data => {
        if (data.status === 'success') {
          setUser({
            email: data.email,
            company: data.company_name,
            company_code: data.company_code,
            name: data.name,
            role: data.role,
            permissions: data.permissions
          });
        }
      })
      .catch(() => { setUser(null); })
      .finally(() => { setLoadingSession(false); });
  }, []);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const handleLoginSuccess = async () => {
    try {
      const res = await fetch('/auth/session-info');
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'success') {
          setUser({
            email: data.email,
            company: data.company_name,
            company_code: data.company_code,
            name: data.name,
            role: data.role,
            permissions: data.permissions
          });
          setActivePage('dashboard_processing', null);
        }
      }
    } catch (err) {
      console.error('Failed to load session after login:', err);
    }
  };

  const handleLogout = async () => {
    try { await fetch('/auth/logout'); } catch (_) {}
    setUser(null);
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
    return <AuthContainer handleLoginSuccess={handleLoginSuccess} />;
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
          {renderActivePage()}
        </main>
      </div>
    </React.Fragment>
  );
}
