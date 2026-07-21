import React, { useCallback, useState } from 'react';
import { Bars, DashboardHeader, DashboardState, Field, MetricCard, ModuleRail, money, number, Panel, ProgressList, useDashboardData } from './DashboardPrimitives';

const COSTING_RAIL = [{ label: 'Source Reports', items: [
  { id: 'report_sales_report', route: '/inventory/sales_report', icon: 'fa-receipt', label: 'Sales Report' },
  { id: 'report_rmp_report', route: '/reports/raw_material_purchasing', icon: 'fa-file-invoice', label: 'RM Purchase Report' },
  { id: 'report_de_heading_report', route: '/reports/de_heading', icon: 'fa-file-medical', label: 'De-Heading Report' },
  { id: 'report_peeling_report', route: '/reports/peeling_report', icon: 'fa-file-import', label: 'Peeling Report' },
  { id: 'report_production_report', route: '/reports/production_report', icon: 'fa-file-export', label: 'Production Report' },
  { id: 'report_inventory_report', route: '/inventory/stock_report', icon: 'fa-boxes-packing', label: 'Stock Status Report' },
  { id: 'report_inventory_costing', route: '/summary/inventory_costing', icon: 'fa-calculator', label: 'Inventory Costing' },
  { id: 'report_floor_balance_value', route: '/summary/floor_balance_value', icon: 'fa-scale-balanced', label: 'Floor Balance Value' },
  { id: 'report_storage_cost_report', route: '/reports/storage_cost_report', icon: 'fa-coins', label: 'Storage Cost' },
] }];

export default function CostingDashboard({ setActivePage }) {
  const [fy, setFy] = useState(''); const [location, setLocation] = useState(''); const [fromDate, setFromDate] = useState(''); const [toDate, setToDate] = useState('');
  const buildUrl = useCallback(() => { const q = new URLSearchParams({ format: 'json' }); if (fy) q.set('fy', fy); if (location) q.set('location', location); if (fromDate) q.set('from_date', fromDate); if (toDate) q.set('to_date', toDate); return `/dashboard/costing_dashboard?${q}`; }, [fy, location, fromDate, toDate]);
  const { data, loading, error, reload } = useDashboardData(buildUrl);
  const go = (id, route) => setActivePage(id, route);
  const expenseRows = [
    ['Raw Material', data?.rmp_cost], ['Processing', (data?.deheading_cost || 0) + (data?.peeling_cost || 0) + (data?.grading_cost || 0) + (data?.soaking_cost || 0)], ['Utilities', (data?.electricity_cost || 0) + (data?.diesel_cost || 0) + (data?.water_cost || 0) + (data?.ice_cost || 0)], ['Packaging', data?.packaging_cost], ['Logistics', data?.logistics_cost], ['Payroll', data?.payroll_cost], ['Other', (data?.qa_cost || 0) + (data?.other_cost || 0)],
  ].map(([name, value]) => ({ name, value: Number(value || 0) }));

  return <div className="module-shell">
    <ModuleRail title="Costing" icon="fa-file-invoice-dollar" sections={COSTING_RAIL} onNavigate={item => go(item.id, item.route)} />
    <main className="enterprise-dashboard">
    <DashboardHeader title="Costing & Finance Dashboard" subtitle={`Enterprise profitability intelligence · ${data?.last_updated || ''}`} onRefresh={reload}>
      <Field label="Financial Year"><select value={fy || data?.selected_fy || ''} onChange={e => setFy(e.target.value)}>{(data?.fy_options || []).map(v => <option key={v}>{v}</option>)}</select></Field>
      <Field label="Location"><select value={location} onChange={e => setLocation(e.target.value)}><option value="">All Locations</option>{(data?.locations || []).map(v => <option key={v}>{v}</option>)}</select></Field>
      <Field label="From"><input type="date" value={fromDate || data?.from_date || ''} onChange={e => setFromDate(e.target.value)} /></Field>
      <Field label="To"><input type="date" value={toDate || data?.to_date || ''} onChange={e => setToDate(e.target.value)} /></Field>
    </DashboardHeader>
    <DashboardState loading={loading} error={error}>
      <div className="enterprise-kpis">
        <MetricCard label="Raw Material Cost" value={money(data?.rmp_cost)} note={`${number(data?.total_qty)} kg purchased`} icon="fa-boxes-stacked" color="#2563eb" />
        <MetricCard label="Production Cost" value={money((data?.deheading_cost || 0) + (data?.peeling_cost || 0) + (data?.grading_cost || 0) + (data?.soaking_cost || 0))} note="Wages & processing" icon="fa-industry" color="#2563eb" />
        <MetricCard label="Conversion Cost/KG" value={`₹${data?.total_qty > 0 ? ((data?.total_expense || 0) / data.total_qty).toFixed(2) : '0.00'}`} note="Per kg processing" icon="fa-scale-balanced" color="#f59e0b" />
        <MetricCard label="Staff Salary Cost" value={money(data?.payroll_cost)} note="Payroll expenses" icon="fa-users" color="#2563eb" />
        <MetricCard label="Power & Fuel Expense" value={money((data?.electricity_cost || 0) + (data?.diesel_cost || 0) + (data?.water_cost || 0) + (data?.ice_cost || 0))} note="Utilities cost" icon="fa-plug" color="#64748b" />
        <MetricCard label="Packing Material" value={money(data?.packaging_cost)} note="Packaging supply" icon="fa-box-open" color="#64748b" />
        <MetricCard label="Transport & Freight" value={money(data?.logistics_cost)} note="Logistics cost" icon="fa-truck-fast" color="#2563eb" />
        <MetricCard label="Stock Value" value={money(data?.inventory_value)} note={`${number(data?.inventory_days)} stock days`} icon="fa-warehouse" onClick={() => go('report_inventory_costing', '/summary/inventory_costing')} />
        <MetricCard label="Gross Sales" value={money(data?.total_sales)} note={`${number(data?.sales_qty)} kg sold`} icon="fa-arrow-trend-up" color="#10b981" />
        <MetricCard label="Pending Receivables" value={money(data?.receivable_outstanding)} note={`${number(data?.receivable_days)} days out`} icon="fa-file-invoice-dollar" color="#f59e0b" />
        <MetricCard label="Gross Margin" value={money((data?.total_sales || 0) - (data?.total_expense || 0))} note="Profit pool" icon="fa-sack-dollar" color={((data?.total_sales || 0) - (data?.total_expense || 0)) >= 0 ? '#10b981' : '#f59e0b'} />
        <MetricCard label="Net Profit %" value={`${data?.total_sales > 0 ? (((data?.total_sales - data?.total_expense) / data?.total_sales) * 100).toFixed(2) : '0.00'}%`} note="Profit margin %" icon="fa-percent" color={((data?.total_sales || 0) - (data?.total_expense || 0)) >= 0 ? '#10b981' : '#f59e0b'} />
      </div>
      <div className="enterprise-grid">
        <Panel title="Revenue vs Expense Trend" meta="Monthly"><Bars labels={data?.month_labels || []} primary={data?.revenue_trend || []} secondary={data?.expense_trend || []} /></Panel>
        <Panel title="Cost Composition" meta="Selected period"><ProgressList rows={expenseRows} labelKey="name" valueKey="value" format={money} color="#dc2626" /></Panel>
        <Panel title="Product Profitability" full meta={`${(data?.product_costing_matrix || []).length} products`}>
          <div className="enterprise-table-wrap"><table className="enterprise-table"><thead><tr><th>Product</th><th className="num">Qty</th><th className="num">Revenue</th><th className="num">Cost</th><th className="num">Profit</th><th className="num">Profit/Kg</th></tr></thead><tbody>{(data?.product_costing_matrix || []).map(row => <tr key={row.product_name}><td>{row.product_name}</td><td className="num">{number(row.qty)}</td><td className="num">{money(row.revenue)}</td><td className="num">{money(row.cost)}</td><td className="num">{money(row.profit)}</td><td className="num">{money(row.profit_per_kg)}</td></tr>)}</tbody></table></div>
        </Panel>
      </div>
    </DashboardState>
    </main>
  </div>;
}
