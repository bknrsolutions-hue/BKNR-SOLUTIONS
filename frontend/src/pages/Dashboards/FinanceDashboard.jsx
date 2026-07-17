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
  const [fy, setFy] = useState(''); const [fromDate, setFromDate] = useState(''); const [toDate, setToDate] = useState('');
  const buildUrl = useCallback(() => { const q = new URLSearchParams({ format: 'json' }); if (fy) q.set('fy', fy); if (fromDate) q.set('from_date', fromDate); if (toDate) q.set('to_date', toDate); return `/dashboard/finance_dashboard?${q}`; }, [fy, fromDate, toDate]);
  const { data, loading, error, reload } = useDashboardData(buildUrl);
  const go = (id, route) => setActivePage(id, route);
  const expenses = (data?.expense_categories || []).map((name, i) => ({ name, value: data?.expense_amounts?.[i] || 0 }));
  const aging = data?.aging_summary || {};
  const agingRows = [{ name: 'Current', value: aging.current }, { name: '1–30 Days', value: aging.bucket_1_30 }, { name: '31–60 Days', value: aging.bucket_31_60 }, { name: '61–90 Days', value: aging.bucket_61_90 }, { name: 'Above 90 Days', value: aging.bucket_above_90 }];

  return <div className="module-shell">
    <ModuleRail title="Finance" icon="fa-wallet" sections={FINANCE_RAIL} onNavigate={item => go(item.id, item.route)} />
    <main className="enterprise-dashboard">
    <DashboardHeader title="Finance Dashboard" subtitle={`Accounting, cash flow and working capital · ${data?.last_updated || ''}`} onRefresh={reload}>
      <Field label="Financial Year"><select value={fy || data?.selected_fy || ''} onChange={e => setFy(e.target.value)}>{(data?.fy_options || []).map(v => <option key={v}>{v}</option>)}</select></Field>
      <Field label="From"><input type="date" value={fromDate || data?.from_date || ''} onChange={e => setFromDate(e.target.value)} /></Field>
      <Field label="To"><input type="date" value={toDate || data?.to_date || ''} onChange={e => setToDate(e.target.value)} /></Field>
    </DashboardHeader>
    <DashboardState loading={loading} error={error}>
      <div className="enterprise-kpis">
        <MetricCard label="Receivables" value={money(data?.receivables_outstanding)} note="Customer outstanding" icon="fa-hand-holding-dollar" onClick={() => go('finance_customer_receivable', '/finance_accounts/customer_receivable/entry')} />
        <MetricCard label="Payables" value={money(data?.payables_outstanding)} note="Vendor outstanding" icon="fa-file-invoice-dollar" color="#f59e0b" onClick={() => go('finance_vendor_payment', '/finance_accounts/vendor_payment/entry')} />
        <MetricCard label="Bank Balance" value={money(data?.bank_balance)} note="Cash and bank ledgers" icon="fa-building-columns" color="#0d9488" onClick={() => go('finance_bank_transaction', '/finance_accounts/bank_transaction/entry')} />
        <MetricCard label="Net Cash Flow" value={money(data?.net_cash_flow)} note={`${money(data?.cash_inflow_period)} inflow`} icon="fa-money-bill-transfer" color={Number(data?.net_cash_flow) >= 0 ? '#16a34a' : '#dc2626'} />
        <MetricCard label="Total Income" value={money(data?.total_income)} note="Posted accounting income" icon="fa-arrow-trend-up" color="#16a34a" />
        <MetricCard label="Total Expenses" value={money(data?.total_expenses)} note="Posted accounting expenses" icon="fa-arrow-trend-down" color="#dc2626" />
        <MetricCard label="Net Profit" value={money(data?.net_profit)} note="Selected reporting period" icon="fa-chart-line" color={Number(data?.net_profit) >= 0 ? '#7c3aed' : '#dc2626'} />
        <MetricCard label="Working Capital" value={money(data?.net_working_capital)} note={`${number(data?.current_ratio)} current ratio`} icon="fa-scale-balanced" color="#2563eb" />
      </div>
      <div className="enterprise-grid">
        <Panel title="Cash Inflow vs Outflow" meta="Monthly"><Bars labels={data?.month_labels || []} primary={data?.inflows || []} secondary={data?.outflows || []} /></Panel>
        <Panel title="Expense Breakdown" meta="Top ledger categories"><ProgressList rows={expenses} labelKey="name" valueKey="value" format={money} color="#dc2626" /></Panel>
        <Panel title="Receivables Ageing"><ProgressList rows={agingRows} labelKey="name" valueKey="value" format={money} color="#f59e0b" /></Panel>
        <Panel title="Books Control">
          <div className="enterprise-risk-grid">
            <div className="enterprise-risk"><span>Active Ledgers</span><strong>{number(data?.ledger_count)}</strong></div>
            <div className="enterprise-risk"><span>Vouchers</span><strong>{number(data?.voucher_stats?.total)}</strong></div>
            <div className="enterprise-risk"><span>Posted</span><strong>{number(data?.voucher_stats?.posted)}</strong></div>
            <div className="enterprise-risk"><span>Draft</span><strong>{number(data?.voucher_stats?.draft)}</strong></div>
            <div className="enterprise-risk"><span>Total Assets</span><strong>{money(data?.total_assets)}</strong></div>
            <div className="enterprise-risk"><span>Liabilities</span><strong>{money(data?.total_liabilities)}</strong></div>
            <div className="enterprise-risk"><span>Equity</span><strong>{money(data?.total_equity)}</strong></div>
            <div className="enterprise-risk"><span>Balance Check</span><strong>{data?.is_balance_sheet_balanced ? 'Balanced' : money(data?.balance_sheet_difference)}</strong></div>
          </div>
        </Panel>
      </div>
    </DashboardState>
    </main>
  </div>;
}
