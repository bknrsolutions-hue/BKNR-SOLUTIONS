import React, { useState } from 'react';
import { LayoutDashboard, TrendingUp, DollarSign, Users, Activity } from 'lucide-react';
import ProcessingDashboard from './ProcessingDashboard';

export default function DashboardsConsole({ activeDashboard: initialDashboard, theme }) {
  const [activeDashboard, setActiveDashboard] = useState(initialDashboard || 'processing');

  const tabs = [
    { id: 'processing', label: 'Processing' },
    { id: 'costing', label: 'Costing' },
    { id: 'finance', label: 'Finance' },
    { id: 'hr', label: 'HR' }
  ];

  return (
    <div>
      <div style={headerRowStyle}>
        <h2 style={{ color: 'var(--corp-dash)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <LayoutDashboard /> ERP Command Dashboards
        </h2>

        <div style={tabsRowStyle}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveDashboard(t.id)}
              style={{
                ...tabBtnStyle,
                background: activeDashboard === t.id ? 'var(--corp-dash)' : 'transparent',
                color: activeDashboard === t.id ? '#ffffff' : 'var(--text-secondary)',
                borderColor: activeDashboard === t.id ? 'var(--corp-dash)' : 'var(--border-light)'
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Common Dashboard Widgets */}
      <div style={widgetsGridStyle}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ ...iconWrapperStyle, background: 'rgba(59, 130, 246, 0.1)', color: 'var(--corp-dash)' }}>
            <TrendingUp size={20} />
          </div>
          <div>
            <div style={widgetLabelStyle}>TOTAL PRODUCTION WEIGHT</div>
            <div style={widgetValueStyle}>5,420.50 Kg</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ ...iconWrapperStyle, background: 'rgba(16, 185, 129, 0.1)', color: 'var(--corp-fin)' }}>
            <DollarSign size={20} />
          </div>
          <div>
            <div style={widgetLabelStyle}>TODAY'S TURNOVER</div>
            <div style={widgetValueStyle}>₹1,89,500</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ ...iconWrapperStyle, background: 'rgba(236, 72, 153, 0.1)', color: 'var(--corp-hr)' }}>
            <Users size={20} />
          </div>
          <div>
            <div style={widgetLabelStyle}>ACTIVE WORKERS FORCE</div>
            <div style={widgetValueStyle}>125 Employees</div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ ...iconWrapperStyle, background: 'rgba(234, 88, 12, 0.1)', color: 'var(--corp-ops)' }}>
            <Activity size={20} />
          </div>
          <div>
            <div style={widgetLabelStyle}>WIP INVENTORIES</div>
            <div style={widgetValueStyle}>3 active batches</div>
          </div>
        </div>
      </div>

      {/* Render selected dashboard */}
      {activeDashboard === 'processing' && (
        <ProcessingDashboard theme={theme} />
      )}

      {activeDashboard === 'costing' && (
        <div className="card">
          <h3 style={{ fontSize: '15px', fontWeight: '800', marginBottom: '16px' }}>Lot Purchasing Rates (Per Kg)</h3>
          <div className="table-responsive">
            <table className="bknr-table">
              <thead>
                <tr>
                  <th className="text-left">Variety</th>
                  <th className="text-center">Active Grade</th>
                  <th className="text-right">Purchase Rate (₹)</th>
                  <th className="text-right">Processing Costs (₹)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="text-left">Vannamei</td>
                  <td className="text-center">30/40</td>
                  <td className="text-right">₹350.00</td>
                  <td className="text-right">₹12.50</td>
                </tr>
                <tr>
                  <td className="text-left">Black Tiger</td>
                  <td className="text-center">20/25</td>
                  <td className="text-right">₹420.00</td>
                  <td className="text-right">₹15.00</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeDashboard === 'finance' && (
        <div className="card">
          <h3 style={{ fontSize: '15px', fontWeight: '800', marginBottom: '16px' }}>Cash Flow ledger</h3>
          <div style={cashFlowRowStyle}>
            <div style={flowCardStyle}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Net Cash Inflow</span>
              <h4 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--corp-fin)' }}>₹3,54,000</h4>
            </div>
            <div style={flowCardStyle}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Total Wage Disbursements</span>
              <h4 style={{ fontSize: '20px', fontWeight: 800, color: '#ef4444' }}>₹1,64,500</h4>
            </div>
          </div>
        </div>
      )}

      {activeDashboard === 'hr' && (
        <div className="card">
          <h3 style={{ fontSize: '15px', fontWeight: '800', marginBottom: '16px' }}>Plant Shift Assignments</h3>
          <div className="table-responsive">
            <table className="bknr-table">
              <thead>
                <tr>
                  <th className="text-left">Employee Name</th>
                  <th className="text-center">Plant Designation</th>
                  <th className="text-center">Active Shift Hours</th>
                  <th className="text-center">Check-in Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="text-left">Nagaraju</td>
                  <td className="text-center">Plant Supervisor</td>
                  <td className="text-center">09:00 AM - 06:00 PM</td>
                  <td className="text-center"><span className="badge badge-success">On Duty</span></td>
                </tr>
                <tr>
                  <td className="text-left">Ramanayya</td>
                  <td className="text-center">QA Specialist</td>
                  <td className="text-center">09:00 AM - 06:00 PM</td>
                  <td className="text-center"><span className="badge badge-success">On Duty</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Scoped Layout Styles
const headerRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '20px',
  flexWrap: 'wrap',
  gap: '16px'
};

const tabsRowStyle = {
  display: 'flex',
  gap: '8px'
};

const tabBtnStyle = {
  padding: '6px 14px',
  fontSize: '12px',
  fontWeight: '700',
  borderRadius: '20px',
  border: '1px solid',
  cursor: 'pointer',
  transition: 'background 0.15s, color 0.15s'
};

const widgetsGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '16px',
  marginBottom: '30px'
};

const iconWrapperStyle = {
  width: '42px',
  height: '42px',
  borderRadius: '12px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};

const widgetLabelStyle = {
  fontSize: '9.5px',
  fontWeight: 800,
  color: 'var(--text-tertiary)',
  letterSpacing: '0.5px'
};

const widgetValueStyle = {
  fontSize: '18px',
  fontWeight: 800,
  marginTop: '2px'
};

const barChartRowStyle = {
  display: 'flex',
  height: '180px',
  alignItems: 'flex-end',
  justifyContent: 'space-around',
  paddingTop: '20px'
};

const barColStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '8px'
};

const barTrackStyle = {
  width: '16px',
  height: '120px',
  background: 'rgba(255, 255, 255, 0.03)',
  borderRadius: '8px',
  overflow: 'hidden',
  display: 'flex',
  alignItems: 'flex-end'
};

const barFillStyle = {
  width: '100%',
  borderRadius: '8px'
};

const barLabelStyle = {
  fontSize: '11px',
  fontWeight: '700',
  color: 'var(--text-secondary)'
};

const cashFlowRowStyle = {
  display: 'flex',
  gap: '16px',
  flexWrap: 'wrap'
};

const flowCardStyle = {
  flex: 1,
  padding: '16px',
  borderRadius: 'var(--radius-element)',
  border: '1px solid var(--border-light)',
  background: 'rgba(255, 255, 255, 0.01)',
  minWidth: '200px'
};
