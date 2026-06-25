import React, { lazy } from 'react';

const ProcessingDashboard = lazy(() => import('./ProcessingDashboard'));
const InventoryDashboard = lazy(() => import('./InventoryDashboard'));
const HRDashboard = lazy(() => import('./HRDashboard'));
const CostingDashboard = lazy(() => import('./CostingDashboard'));
const FinanceDashboard = lazy(() => import('./FinanceDashboard'));
const TallyDashboard = lazy(() => import('./TallyDashboard'));

const DASHBOARD_MAP = {
  processing: ProcessingDashboard,
  inventory: InventoryDashboard,
  hr_command_center: HRDashboard,
  costing: CostingDashboard,
  finance: FinanceDashboard,
  tally: TallyDashboard,
};

export default function DashboardsConsole({ activeDashboard, theme }) {
  // The key from App.jsx for tally_dashboard is 'tally'
  const dashboardKey = activeDashboard === 'tally_dashboard' ? 'tally' : activeDashboard;

  const DashboardComponent = DASHBOARD_MAP[dashboardKey] 
    || (() => <div>Dashboard not found: {activeDashboard}</div>);

  return <DashboardComponent theme={theme} />;
}