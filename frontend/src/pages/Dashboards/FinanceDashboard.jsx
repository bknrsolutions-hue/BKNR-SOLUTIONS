import React, { useCallback, useState } from 'react';
import { Bars, DashboardHeader, DashboardState, Field, MetricCard, ModuleRail, money, number, Panel, ProgressList, useDashboardData } from './DashboardPrimitives';

const FINANCE_RAIL = [{ label: 'Accounts', items: [
  { id: 'finance_accounts_flow_guide', route: '/finance_accounts/accounts_flow_guide', icon: 'fa-diagram-project', label: 'Flow Guide' },
  { id: 'finance_ledger_master', route: '/finance_accounts/ledger_master/entry', icon: 'fa-folder-open', label: 'Ledger Master' },
  { id: 'finance_journal_entry', route: '/finance_accounts/journal_entry/entry', icon: 'fa-book', label: 'Journal Entries' },
  { id: 'finance_bank_transaction', route: '/finance_accounts/bank_transaction/entry', icon: 'fa-building-columns', label: 'Bank Transactions' },
  { id: 'finance_payment_receipt', route: '/finance_accounts/payment_receipt/entry', icon: 'fa-file-invoice-dollar', label: 'Payment Receipts' },
  { id: 'finance_bank_master', route: '/finance_accounts/bank_master/entry', icon: 'fa-landmark', label: 'Bank Master' },
] }, { label: 'Finance Bills', items: [
  { id: 'finance_electricity_bills', route: '/api/electricity/entry', icon: 'fa-bolt', label: 'Electricity Bills' },
  { id: 'finance_diesel_bills', route: '/api/diesel/entry', icon: 'fa-gas-pump', label: 'Diesel' },
  { id: 'finance_packaging_bills', route: '/api/purchase/entry', icon: 'fa-file-invoice', label: 'Purchase Bills' },
  { id: 'finance_logistics_bills', route: '/api/container/entry', icon: 'fa-truck-fast', label: 'Logistics' },
  { id: 'finance_other_expenses', route: '/api/expenses/entry', icon: 'fa-receipt', label: 'Other Expenses' },
] }, { label: 'Registers', items: [
  { id: 'finance_gst_register', route: '/finance_accounts/gst_register/entry', icon: 'fa-file-shield', label: 'GST Register' },
  { id: 'finance_fixed_assets', route: '/finance_accounts/fixed_assets/entry', icon: 'fa-building', label: 'Fixed Assets' },
  { id: 'finance_lc_tracking', route: '/finance_accounts/lc_tracking/entry', icon: 'fa-file-contract', label: 'LC Tracking' },
] }];

export default function FinanceDashboard({ setActivePage }) {
  const [companyId, setCompanyId] = useState('');
  const [fy, setFy] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const buildUrl = useCallback(() => {
    const q = new URLSearchParams({ format: 'json' });
    if (companyId) q.set('company_id', companyId);
    if (fy) q.set('fy', fy);
    if (fromDate) q.set('from_date', fromDate);
    if (toDate) q.set('to_date', toDate);
    return `/dashboard/finance_dashboard?${q}`;
  }, [companyId, fy, fromDate, toDate]);

  const { data, loading, error, reload } = useDashboardData(buildUrl);
  const go = (id, route) => setActivePage(id, route);

  const expenses = (data?.expense_categories || []).map((name, i) => ({ name, value: data?.expense_amounts?.[i] || 0 }));
  const aging = data?.aging_summary || {};
  const agingRows = [
    { name: 'Current (Not Due)', value: aging.current || 0 },
    { name: '1–30 Days', value: aging.bucket_1_30 || 0 },
    { name: '31–60 Days', value: aging.bucket_31_60 || 0 },
    { name: '61–90 Days', value: aging.bucket_61_90 || 0 },
    { name: '90+ Days (Risk)', value: aging.bucket_above_90 || 0 }
  ];

  return <div className="module-shell">
    <ModuleRail title="Finance" icon="fa-wallet" sections={FINANCE_RAIL} onNavigate={item => go(item.id, item.route)} />
    <main className="enterprise-dashboard">
    <DashboardHeader title="FINANCE DASHBOARD" subtitle="Executive Finance Command Center" onRefresh={reload}>
      <Field label="Company">
        <select value={companyId || data?.comp_code || ''} onChange={e => setCompanyId(e.target.value)}>
          <option value="">All Companies</option>
          {(data?.available_companies || []).map(comp => (
            <option key={comp.code} value={comp.code}>{comp.name} ({comp.code})</option>
          ))}
        </select>
      </Field>
      <Field label="Financial Year">
        <select value={fy || data?.selected_fy || ''} onChange={e => setFy(e.target.value)}>
          {(data?.fy_options || []).map(v => <option key={v}>{v}</option>)}
        </select>
      </Field>
      <Field label="From Date"><input type="date" value={fromDate || data?.from_date || ''} onChange={e => setFromDate(e.target.value)} /></Field>
      <Field label="To Date"><input type="date" value={toDate || data?.to_date || ''} onChange={e => setToDate(e.target.value)} /></Field>
    </DashboardHeader>
    <DashboardState loading={loading} error={error}>
      <div className="enterprise-kpis">
        <MetricCard label="Receivables" value={money(data?.receivables_outstanding)} note="Customer outstanding" icon="fa-file-invoice-dollar" color="#2563eb" onClick={() => go('finance_customer_receivable', '/finance_accounts/customer_receivable/entry')} />
        <MetricCard label="Payables" value={money(data?.payables_outstanding)} note="Vendor outstanding" icon="fa-file-invoice" color="#64748b" onClick={() => go('finance_vendor_payment', '/finance_accounts/vendor_payment/entry')} />
        <MetricCard label="Bank & Cash" value={money(data?.bank_balance)} note="Reserves" icon="fa-building-columns" color="#10b981" onClick={() => go('finance_bank_transaction', '/finance_accounts/bank_transaction/entry')} />
        <MetricCard label="Income" value={money(data?.total_income)} note="Total period income" icon="fa-arrow-trend-up" color="#2563eb" />
        <MetricCard label="Expenses" value={money(data?.total_expenses)} note="Total period expenses" icon="fa-receipt" color="#f59e0b" />
        <MetricCard label="Net Monthly Profit" value={money(data?.net_profit)} note="Period net profit" icon="fa-chart-line" color={Number(data?.net_profit) >= 0 ? '#10b981' : '#f59e0b'} />
        <MetricCard label="Net Cash Flow" value={money(data?.net_cash_flow)} note="Inflow vs Outflow" icon="fa-money-bill-transfer" color="#8b5cf6" />
        <MetricCard label="Current Ratio" value={data?.current_ratio ? String(data.current_ratio) : '0.0'} note="Liquidity metric" icon="fa-scale-balanced" color="#2563eb" />
        <MetricCard label="Posted Vouchers" value={`${number(data?.voucher_stats?.posted)}/${number(data?.voucher_stats?.total)}`} note="Voucher status" icon="fa-book" color="#64748b" />
        <MetricCard label="Receipts" value={money(data?.receipts_total)} note="Total receipts" icon="fa-circle-down" color="#10b981" />
        <MetricCard label="Vendor Paid" value={money(data?.vendor_paid_total)} note="Total vendor payments" icon="fa-circle-up" color="#ef4444" />
        <MetricCard label="Active Ledgers" value={number(data?.ledger_count)} note="Chart of accounts" icon="fa-folder-tree" color="#64748b" />
      </div>
      <div className="enterprise-grid">
        <Panel title="Cash Inflow vs Outflow Trend" meta="Monthly">
          <Bars labels={data?.month_labels || []} primary={data?.inflows || []} secondary={data?.outflows || []} />
        </Panel>
        <Panel title="Expenses Breakdown" meta="Ledger categories">
          <ProgressList rows={expenses} labelKey="name" valueKey="value" format={money} color="#2563eb" />
        </Panel>
        <Panel title="Customer Payments Aging" meta="Outstanding Buckets">
          <ProgressList rows={agingRows} labelKey="name" valueKey="value" format={money} color="#f59e0b" />
        </Panel>
        <Panel title="Working Capital Summary" meta="Liquidity & Balance Sheet">
          <table className="enterprise-table" style={{ width: '100%', fontSize: '12px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Account Type</th>
                <th style={{ textAlign: 'right' }}>Balance (₹)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Pending Customer Payments</td>
                <td style={{ textAlign: 'right', color: '#10b981', fontWeight: '700' }}>+{money(data?.receivables_outstanding)}</td>
              </tr>
              <tr>
                <td>Pending Vendor Payments</td>
                <td style={{ textAlign: 'right', color: '#ef4444', fontWeight: '700' }}>-{money(data?.payables_outstanding)}</td>
              </tr>
              <tr>
                <td>Total Bank Reserves</td>
                <td style={{ textAlign: 'right', color: '#2563eb', fontWeight: '700' }}>+{money(data?.bank_balance)}</td>
              </tr>
              <tr>
                <td>Current Assets</td>
                <td style={{ textAlign: 'right', color: '#10b981', fontWeight: '700' }}>{money(data?.current_assets)}</td>
              </tr>
              <tr>
                <td>Current Liabilities</td>
                <td style={{ textAlign: 'right', color: '#ef4444', fontWeight: '700' }}>{money(data?.current_liabilities)}</td>
              </tr>
              <tr style={{ fontWeight: '800', background: 'rgba(255,255,255,0.05)' }}>
                <td>Net Working Capital</td>
                <td style={{ textAlign: 'right', color: 'var(--text-primary)', fontSize: '13px' }}>{money(data?.net_working_capital)}</td>
              </tr>
              <tr>
                <td>Balance Sheet Status</td>
                <td style={{ textAlign: 'right', color: data?.is_balance_sheet_balanced ? '#10b981' : '#ef4444', fontWeight: '800' }}>
                  {data?.is_balance_sheet_balanced ? 'Balanced' : `Diff ${money(data?.balance_sheet_difference)}`}
                </td>
              </tr>
            </tbody>
          </table>
        </Panel>
      </div>
    </DashboardState>
    </main>
  </div>;
}
