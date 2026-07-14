import React from 'react';
import ProcessingDashboard from './ProcessingDashboard';
import InventoryDashboard from './InventoryDashboard';

export default function DashboardsConsole({ theme, setActivePage, activeDashboard }) {
  if (activeDashboard === 'inventory') {
    return (
      <InventoryDashboard theme={theme} setActivePage={setActivePage} />
    );
  }
  return (
    <ProcessingDashboard theme={theme} setActivePage={setActivePage} />
  );
}
