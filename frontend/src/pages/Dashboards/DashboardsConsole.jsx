import React from 'react';
import ProcessingDashboard from './ProcessingDashboard';
import InventoryDashboard from './InventoryDashboard';
import HRDashboard from './HRDashboard';
import CostingDashboard from './CostingDashboard';
import FinanceDashboard from './FinanceDashboard';

export default function DashboardsConsole({ theme, setActivePage, activeDashboard }) {
  if (activeDashboard === 'inventory') {
    return (
      <InventoryDashboard theme={theme} setActivePage={setActivePage} />
    );
  }
  if (activeDashboard === 'hr') {
    return <HRDashboard theme={theme} setActivePage={setActivePage} />;
  }
  if (activeDashboard === 'costing') {
    return <CostingDashboard theme={theme} setActivePage={setActivePage} />;
  }
  if (activeDashboard === 'finance') {
    return <FinanceDashboard theme={theme} setActivePage={setActivePage} />;
  }
  return (
    <ProcessingDashboard theme={theme} setActivePage={setActivePage} />
  );
}
