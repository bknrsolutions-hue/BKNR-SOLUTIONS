import React, { Suspense, lazy } from 'react';

const ProcessingDashboard = lazy(() => import('./ProcessingDashboard'));
const InventoryDashboard  = lazy(() => import('./InventoryDashboard'));
const HRDashboard         = lazy(() => import('./HRDashboard'));
const CostingDashboard    = lazy(() => import('./CostingDashboard'));
const FinanceDashboard    = lazy(() => import('./FinanceDashboard'));

function DashboardSkeleton() {
  return (
    <div className="page-skeleton" role="status" aria-live="polite" aria-label="Loading dashboard...">
      <div className="skel-body">
        <div className="skel-row">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="skel-kpi-card">
              <div className="skel-block" style={{ width: 40, height: 10, borderRadius: 4, marginBottom: 10 }} />
              <div className="skel-block" style={{ width: 70, height: 22, borderRadius: 6, marginBottom: 6 }} />
              <div className="skel-block" style={{ width: 50, height: 8, borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DashboardsConsole({ theme, setActivePage, activeDashboard }) {
  let content;
  if (activeDashboard === 'inventory') {
    content = <InventoryDashboard theme={theme} setActivePage={setActivePage} />;
  } else if (activeDashboard === 'hr') {
    content = <HRDashboard theme={theme} setActivePage={setActivePage} />;
  } else if (activeDashboard === 'costing') {
    content = <CostingDashboard theme={theme} setActivePage={setActivePage} />;
  } else if (activeDashboard === 'finance') {
    content = <FinanceDashboard theme={theme} setActivePage={setActivePage} />;
  } else {
    content = <ProcessingDashboard theme={theme} setActivePage={setActivePage} />;
  }

  return (
    <Suspense fallback={<DashboardSkeleton />}>
      {content}
    </Suspense>
  );
}

