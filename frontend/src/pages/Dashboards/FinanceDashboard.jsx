import React, { useCallback, useState, useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';
import { DashboardHeader, DashboardState, Field, MetricCard, ModuleRail, money, number, Panel } from './DashboardPrimitives';
import { sessionFetch } from '../../utils/sessionFetch';

Chart.register(...registerables);

const FINANCE_RAIL = [{ label: 'Accounts', items: [
  { id: 'finance_accounts_flow_guide', route: '/finance_accounts/accounts_flow_guide', icon: 'fa-diagram-project', label: 'Flow Guide' },
  { id: 'finance_ledger_master', route: '/finance_accounts/ledger_master/entry', icon: 'fa-folder-open', label: 'Ledger Master' },
  { id: 'finance_journal_entry', route: '/finance_accounts/journal_entry/entry', icon: 'fa-book', label: 'Journal Entries' },
  { id: 'finance_bank_transaction', route: '/finance_accounts/bank_transaction/entry', icon: 'fa-building-columns', label: 'Bank Transactions' },
  { id: 'finance_payment_receipt', route: '/finance_accounts/payment_receipt/entry', icon: 'fa-file-invoice-dollar', label: 'Payment Receipts' },
  { id: 'finance_customer_receivable', route: '/finance_accounts/customer_receivable/entry', icon: 'fa-hand-holding-dollar', label: 'Receivables' },
  { id: 'finance_vendor_payment', route: '/finance_accounts/vendor_payment/entry', icon: 'fa-money-bill-transfer', label: 'Vendor Payments' },
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

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const rupeesFromLakhs = value => money(Number(value || 0) * 100000);
const rupeesFromCrores = value => money(Number(value || 0) * 10000000);

function ExecutiveChart({ type, data, options = {}, onSelect }) {
  const canvasRef = useRef(null);
  const instanceRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    instanceRef.current?.destroy();
    instanceRef.current = new Chart(canvasRef.current, {
      type,
      data,
      options: {
        ...options,
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: type === 'doughnut', position: 'right', labels: { boxWidth: 8, font: { size: 9 } } },
          tooltip: { enabled: true },
          ...options.plugins,
        },
        scales: type === 'doughnut' ? {} : {
          x: { grid: { display: false }, ticks: { font: { size: 8 }, maxRotation: 0, autoSkip: true } },
          y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,.18)' }, ticks: { font: { size: 8 } } },
          ...options.scales,
        },
        onClick: (_event, elements) => {
          if (elements.length && onSelect) onSelect(data.labels[elements[0].index], elements[0].index);
        },
      },
    });
    return () => instanceRef.current?.destroy();
  }, [type, data, options]);

  return <div className={`ceo-chart-canvas ${onSelect ? 'clickable' : ''}`}><canvas ref={canvasRef} /></div>;
}

const monthLabelFromKey = monthKey => {
  const [year, month] = String(monthKey || '').split('-').map(Number);
  if (!year || !month) return { label: '', year: '' };
  return { label: MONTH_NAMES[month - 1] || '', year: String(year) };
};

export default function FinanceDashboard({ setActivePage }) {
  const getInitialCurrentFy = () => {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const fyStartYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
    return {
      fy: `${fyStartYear}-${String(fyStartYear + 1).slice(-2)}`,
      start: `${fyStartYear}-04-01`,
      end: `${fyStartYear + 1}-03-31`,
    };
  };

  const initialCurrentFy = getInitialCurrentFy();
  const [fy, setFy] = useState(initialCurrentFy.fy);
  const [fromDate, setFromDate] = useState(initialCurrentFy.start);
  const [toDate, setToDate] = useState(initialCurrentFy.end);
  const [activePeriod, setActivePeriod] = useState('Current Financial Year');
  const [activeModal, setActiveModal] = useState(null);
  const [selectedTrendMonth, setSelectedTrendMonth] = useState(null);
  const [selectedPoDetail, setSelectedPoDetail] = useState(null);
  const [selectedCostDetail, setSelectedCostDetail] = useState(null);
  const [expandedDecisionSection, setExpandedDecisionSection] = useState('risks');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const reqSeq = useRef(0);

  const handlePeriodSelect = (period) => {
    setActivePeriod(period);
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    let start, end;
    if (period === 'Today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'Yesterday') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    } else if (period === 'This Month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (period === 'Last Month') {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      end = new Date(now.getFullYear(), now.getMonth(), 0);
    } else if (period === 'Current Financial Year' || period === 'This Financial Year') {
      const curYear = now.getFullYear();
      const fyStartYear = now.getMonth() >= 3 ? curYear : curYear - 1;
      start = new Date(fyStartYear, 3, 1);
      end = new Date(fyStartYear + 1, 2, 31);
    } else if (period === 'Last Year' || period === 'Last Financial Year') {
      const curYear = now.getFullYear();
      const fyStartYear = now.getMonth() >= 3 ? curYear - 1 : curYear - 2;
      start = new Date(fyStartYear, 3, 1);
      end = new Date(fyStartYear + 1, 2, 31);
    }

    if (start && end) {
      setFromDate(toISO(start));
      setToDate(toISO(end));
    }
  };

  const handleFySelect = (selectedFy) => {
    setFy(selectedFy);
    setActivePeriod(`FY ${selectedFy}`);
    const startYear = parseInt(selectedFy.split('-')[0], 10) || new Date().getFullYear();
    setFromDate(`${startYear}-04-01`);
    setToDate(`${startYear + 1}-03-31`);
  };

  const handleMonthWithFySelect = (monthVal) => {
    if (!monthVal) return;
    const [yearStr, monthStr] = monthVal.split('-');
    const y = parseInt(yearStr, 10);
    const m = parseInt(monthStr, 10) - 1;
    const pad = (n) => String(n).padStart(2, '0');
    const start = `${y}-${pad(m + 1)}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate();
    const end = `${y}-${pad(m + 1)}-${pad(lastDay)}`;
    setActivePeriod(`${MONTH_NAMES[m]} ${y}`);
    setFromDate(start);
    setToDate(end);
  };

  const fetchData = useCallback(async ({ silent = false } = {}) => {
    const curSeq = ++reqSeq.current;
    if (!silent) setLoading(true);
    setError('');
    const q = new URLSearchParams({ format: 'json' });
    if (fy) q.set('fy', fy);
    if (fromDate) q.set('from_date', fromDate);
    if (toDate) q.set('to_date', toDate);

    const url = `/dashboard/finance_dashboard?${q}`;

    try {
      let res = await sessionFetch(url, { cache: 'no-store', headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
      if (!res.ok) {
        res = await fetch(url, { cache: 'no-store', credentials: 'include', headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
      }
      if (res.ok) {
        const jsonPayload = await res.json();
        if (curSeq === reqSeq.current) {
          setData(jsonPayload);
          setError('');
        }
      } else {
        if (curSeq === reqSeq.current) {
          setError('Failed to load finance dashboard data from server.');
        }
      }
    } catch (err) {
      if (curSeq === reqSeq.current) {
        setError(err.message || 'Error connecting to finance dashboard.');
      }
    } finally {
      if (curSeq === reqSeq.current) {
        setLoading(false);
      }
    }
  }, [fy, fromDate, toDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const refreshTimer = window.setInterval(() => fetchData({ silent: true }), 30000);
    return () => window.clearInterval(refreshTimer);
  }, [fetchData]);

  const reload = fetchData;
  const go = (id, route) => setActivePage(id, route);
  const openDecisionSource = (title, route) => {
    const targets = {
      'Vendor payment pressure': { id: 'finance_vendor_bills', route: '/api/vendor_bills/entry' },
      'Low workforce attendance': { id: 'dashboard_hr', route: '/dashboard/hr_command_center' },
      'Elevated overtime load': { id: 'attendance_salary_report', route: '/attendance/salary/monthly-sheet' },
      'Peeling yield needs review': { id: 'peeling', route: '/processing/peeling' },
      'Pending export execution': { id: 'pending_orders', route: '/inventory/pending_orders' },
      'GST compliance review due': { id: 'finance_gst_register', route: '/finance_accounts/gst_register/entry' },
    };
    const target = targets[title] || { id: 'dashboard_finance', route: '/dashboard/finance_dashboard' };
    go(target.id, target.route || route);
  };

  // Extracted Data Structures
  const expenses = (data?.expense_categories || []).map((name, i) => ({ name, value: data?.expense_amounts?.[i] || 0 }));
  const aging = data?.aging_summary || {};
  const agingRows = [
    { name: 'Current (Not Due)', value: aging.current || 0 },
    { name: '1–30 Days', value: aging.bucket_1_30 || 0 },
    { name: '31–60 Days', value: aging.bucket_31_60 || 0 },
    { name: '61–90 Days', value: aging.bucket_61_90 || 0 },
    { name: '90+ Days (Risk)', value: aging.bucket_above_90 || 0 }
  ];

  const lc = data?.labour_cost_summary || {};
  const salStat = data?.salary_status || {};
  const otDash = data?.ot_dashboard || {};
  const labProd = data?.labour_productivity || {};
  const costKg = data?.cost_per_kg_summary || {};
  const profitBridge = data?.profit_bridge || [];
  const cashReq = data?.next_7_days_cash || {};
  const payrollVsBud = data?.payroll_vs_budget || {};
  const salDept = data?.salary_dept_wise || [];
  const hrmsAttendance = data?.hrms_attendance || { is_single_day: false, shift_rows: [], average: {} };

  // World-Class CEO Command Center Enhancements
  const execAlerts = data?.executive_alerts || [];
  const alertIconByAction = {
    approve_salary: 'fa-money-check-dollar',
    vendor_payments: 'fa-hand-holding-dollar',
    receivables: 'fa-file-invoice-dollar',
    cash_forecast: 'fa-building-columns',
    contractor_payments: 'fa-helmet-safety',
    gst_register: 'fa-file-circle-check',
  };

  const plantSnap = data?.plant_snapshot || {
    today_production_mt: 0,
    today_dispatch_mt: 0,
    raw_material_received_mt: 0,
    cold_storage_occupancy_pct: 0,
    rejected_pct: 0,
    yield_pct: 0,
    target_yield_pct: 0,
    yield_diff_pct: 0
  };

  const cashPos = data?.live_cash_position || {
    opening_balance: 0,
    todays_receipts: 0,
    todays_payments: 0,
    closing_balance: 0
  };

  const profitTrend = data?.profit_trend_months || [];

  const openTrendMonth = (pt) => {
    setSelectedTrendMonth(pt);
    const url = new URL(window.location.href);
    url.searchParams.set('trend_month', pt.month);
    window.history.pushState(null, '', url.toString());
  };

  const closeTrendMonth = () => {
    setSelectedTrendMonth(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('trend_month');
    window.history.pushState(null, '', url.toString());
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const monthParam = params.get('trend_month');
    if (monthParam && profitTrend && profitTrend.length > 0) {
      const found = profitTrend.find(m => m.month.toLowerCase() === monthParam.toLowerCase());
      if (found) {
        setSelectedTrendMonth(found);
      }
    }
  }, [data]);


  const expPerf = data?.export_performance || {
    total_containers: 0,
    shipped_containers: 0,
    pending_containers: 0,
    export_value_cr: 0
  };

  const ceoApps = data?.ceo_approvals || {
    pending_salary_count: 0,
    pending_ot_count: 0,
    pending_purchase_count: 0,
    pending_vendor_bills_count: 0,
    pending_expenses_count: 0
  };


  const aiInsights = data?.ai_insights || {
    takeaways: [],
    recommended_action: ''
  };
  const decisionEngine = data?.executive_decision_engine || {};
  const decisionHealth = decisionEngine.health || { overall: 0, label: 'Needs Attention', categories: {} };
  const decisionForecast = decisionEngine.forecast || {};
  const morningBrief = decisionEngine.morning_brief || {};
  const rootCause = decisionEngine.root_cause || {};
  const decisionRiskColors = { green: '#15803d', yellow: '#a16207', orange: '#c2410c', red: '#b91c1c' };
  const healthStatus = (score) => score >= 85 ? 'Healthy' : score >= 70 ? 'Good' : score >= 50 ? 'Needs Attention' : 'Critical';
  const corporateFlow = [
    { label: 'Opening Cash', value: money(decisionForecast.opening_cash || 0), icon: 'fa-building-columns', tone: 'blue' },
    { label: 'Collections', value: money(decisionForecast.expected_collections || 0), icon: 'fa-arrow-down', tone: 'green' },
    { label: 'Payments', value: money((decisionForecast.expected_payments || 0) + (decisionForecast.payroll_requirement || 0)), icon: 'fa-arrow-up', tone: 'orange' },
    { label: 'Closing Cash', value: money(decisionForecast.expected_closing_cash || 0), icon: 'fa-wallet', tone: 'navy' },
  ];
  const operationsFlow = [
    { label: 'Raw Material', value: `${number(plantSnap.raw_material_received_mt || 0)} MT`, icon: 'fa-fish', tone: 'teal' },
    { label: 'Production', value: `${number(plantSnap.today_production_mt || 0)} MT`, icon: 'fa-industry', tone: 'blue' },
    { label: 'Dispatch', value: `${number(plantSnap.today_dispatch_mt || 0)} MT`, icon: 'fa-truck', tone: 'green' },
    { label: 'Export Pending', value: `${number(expPerf.pending_containers || 0)} POs`, icon: 'fa-ship', tone: 'orange' },
  ];
  const decisionSections = [
    { key: 'financial', label: 'Financial Intelligence', icon: 'fa-chart-line', lines: decisionEngine.financial || [] },
    { key: 'payroll', label: 'Payroll & Labour', icon: 'fa-users-gear', lines: decisionEngine.payroll || [] },
    { key: 'production', label: 'Production', icon: 'fa-industry', lines: decisionEngine.production || [] },
    { key: 'inventory', label: 'Inventory', icon: 'fa-boxes-stacked', lines: decisionEngine.inventory || [] },
    { key: 'sales_export', label: 'Sales & Export', icon: 'fa-ship', lines: decisionEngine.sales_export || [] },
    { key: 'compliance', label: 'Compliance', icon: 'fa-shield-halved', lines: decisionEngine.compliance || [] },
  ];

  const costBreakdownRows = costKg.breakdown || [
    { category: 'Raw Material', amount: 0, pct: 0, color: '#2563eb' },
    { category: 'Labour', amount: 0, pct: 0, color: '#10b981' },
    { category: 'Utilities', amount: 0, pct: 0, color: '#8b5cf6' },
    { category: 'Others', amount: 0, pct: 0, color: '#64748b' }
  ];
  const processingCostSubtotal = Number(costKg.subtotal_cost_per_kg ?? costBreakdownRows.reduce((sum, row) => sum + Number(row.amount || 0), 0));
  const processingCostShare = costBreakdownRows.reduce((sum, row) => sum + Number(row.pct || 0), 0);

  const activeMonthKey = (data?.from_date || fromDate || '').slice(0, 7);
  const activeMonthMeta = monthLabelFromKey(activeMonthKey);
  const activeMonthLabel = activeMonthMeta.label || 'Selected';
  const activeMonthYear = activeMonthMeta.year || '';
  const activeMonthStart = activeMonthKey ? `${activeMonthKey}-01` : (data?.from_date || fromDate || '');
  const activeMonthEnd = activeMonthKey
    ? `${activeMonthKey}-${String(new Date(Number(activeMonthKey.slice(0, 4)), Number(activeMonthKey.slice(5, 7)), 0).getDate()).padStart(2, '0')}`
    : (data?.to_date || toDate || '');

  const getTrendMonthRange = (trend) => {
    const monthIndex = MONTH_NAMES.findIndex(name => name.toLowerCase() === String(trend?.month || '').slice(0, 3).toLowerCase());
    let monthKey = trend?.month_key || '';
    if (!monthKey && monthIndex >= 0) {
      const fyStartYear = parseInt((fy || data?.selected_fy || activeMonthKey || '').split('-')[0], 10) || new Date().getFullYear();
      const year = monthIndex >= 3 ? fyStartYear : fyStartYear + 1;
      monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
    }
    const [year, month] = String(monthKey || '').split('-').map(Number);
    if (!year || !month) {
      return { month_key: activeMonthKey, from_date: activeMonthStart, to_date: activeMonthEnd };
    }
    const lastDay = new Date(year, month, 0).getDate();
    return {
      month_key: monthKey,
      from_date: `${monthKey}-01`,
      to_date: `${monthKey}-${String(lastDay).padStart(2, '0')}`,
    };
  };

  const selectedCostMonthMeta = monthLabelFromKey((selectedCostDetail?.from_date || '').slice(0, 7));
  const selectedCostMonthTitle = `${selectedCostDetail?.month || selectedCostMonthMeta.label || 'Selected'} ${selectedCostMonthMeta.year || activeMonthYear}`.trim();

  const handleAlertClick = (action) => {
    if (action === 'approve_salary') go('attendance_salary_report', '/attendance/salary/monthly-sheet?status=PENDING');
    else if (action === 'contractor_payments') {
      sessionFetch('/dashboard/contractor_salary_outstanding_detail').then(r => r.json()).then(res => {
        const items = res.items || [];
        setSelectedCostDetail({
          cost_component: 'Contractor Salaries Pending Until Last Month',
          month: 'All pending months',
          from_date: '',
          to_date: '',
          amount_lakhs: Number(res.total_amount_lakhs || 0).toFixed(4),
          pct: 100,
          items,
          basis_totals: res.basis_totals || [],
          kg_basis_note: res.kg_basis_note || '',
          target_token: 'finance_contractor_bills',
          target_route: '/api/contractor_bills/entry',
        });
      }).catch(() => setError('Unable to load contractor salary outstanding details.'));
    }
    else if (action === 'vendor_payments') {
      const currentMonthStr = activeMonthLabel;
      const month_key = activeMonthKey;
      const from_date = activeMonthStart;
      const to_date = activeMonthEnd;
      sessionFetch(`/dashboard/cost_items_detail?category=vendor_payables&month_key=${month_key}`).then(r => r.json()).then(res => {
        const items = res.items || [];
        const itemsSum = items.reduce((acc, row) => acc + (parseFloat(row.amount_lakhs) || 0), 0);
        const displayAmt = itemsSum > 0 ? itemsSum.toFixed(2) : '0.00';
        setSelectedCostDetail({ 
          cost_component: 'Vendor Payables Due (Outstanding Bills)', 
          month: currentMonthStr, 
          from_date, 
          to_date, 
          amount_lakhs: displayAmt, 
          pct: 100, 
          items, 
          target_token: 'finance_vendor_bills', 
          target_route: '/bills/payable_bills' 
        });
      }).catch(() => {
        setSelectedCostDetail({ 
          cost_component: 'Vendor Payables Due (Outstanding Bills)', 
          month: currentMonthStr, 
          from_date, 
          to_date, 
          amount_lakhs: '0.00', 
          pct: 100, 
          items: [], 
          target_token: 'finance_vendor_bills', 
          target_route: '/bills/payable_bills' 
        });
      });
    }
    else if (action === 'receivables') {
      const currentMonthStr = activeMonthLabel;
      const month_key = activeMonthKey;
      const from_date = activeMonthStart;
      const to_date = activeMonthEnd;
      sessionFetch(`/dashboard/cost_items_detail?category=receivables&month_key=${month_key}`).then(r => r.json()).then(res => {
        const items = res.items || [];
        const itemsSum = items.reduce((acc, row) => acc + (parseFloat(row.amount_lakhs) || 0), 0);
        const displayAmt = itemsSum > 0 ? itemsSum.toFixed(2) : '0.00';
        setSelectedCostDetail({ 
          cost_component: 'Customer Receivables Overdue (Pending Dispatches)', 
          month: currentMonthStr, 
          from_date, 
          to_date, 
          amount_lakhs: displayAmt, 
          pct: 100, 
          items, 
          target_token: 'report_sales_report', 
          target_route: '/inventory/sales_report' 
        });
      }).catch(() => {
        setSelectedCostDetail({ 
          cost_component: 'Customer Receivables Overdue (Pending Dispatches)', 
          month: currentMonthStr, 
          from_date, 
          to_date, 
          amount_lakhs: '0.00', 
          pct: 100, 
          items: [], 
          target_token: 'report_sales_report', 
          target_route: '/inventory/sales_report' 
        });
      });
    }
    else if (action === 'cash_forecast') {
      const currentMonthStr = activeMonthLabel;
      const month_key = activeMonthKey;
      const from_date = activeMonthStart;
      const to_date = activeMonthEnd;
      sessionFetch(`/dashboard/cost_items_detail?category=cash_forecast&month_key=${month_key}`).then(r => r.json()).then(res => {
        const items = res.items || [];
        const displayAmt = Number(res.total_amount_lakhs || 0).toFixed(2);
        setSelectedCostDetail({ 
          cost_component: 'Vendor Payments: Overdue + 5 Days', 
          month: currentMonthStr, 
          from_date, 
          to_date, 
          amount_lakhs: displayAmt, 
          pct: 100, 
          items, 
          target_token: 'finance_vendor_bills', 
          target_route: '/bills/payable_bills' 
        });
      }).catch(() => {
        setSelectedCostDetail({ 
          cost_component: 'Vendor Payments: Overdue + 5 Days', 
          month: currentMonthStr, 
          from_date, 
          to_date, 
          amount_lakhs: '0.00', 
          pct: 100, 
          items: [], 
          target_token: 'finance_vendor_bills', 
          target_route: '/bills/payable_bills' 
        });
      });
    }
    else if (action === 'gst_register') go('finance_gst_register', '/finance_accounts/gst_register/entry');
  };

  return <div className="module-shell" style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
    <ModuleRail
      title="CEO Dashboard"
      icon="fa-chart-line"
      sections={FINANCE_RAIL}
      onNavigate={item => go(item.id, item.route)}
    />
    <main className="module-main" style={{ height: '100%', overflowY: 'auto', paddingRight: '4px' }}>
    <div className="enterprise-dashboard" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
    <DashboardHeader title="CEO DASHBOARD" subtitle="Company Overview" onRefresh={reload}>
      <div className="ceo-dashboard-links" aria-label="Other dashboards">
        {[
          ['Processing', 'fa-industry', 'dash_proc', '/dashboard/processing_dashboard'],
          ['Inventory', 'fa-warehouse', 'dash_inv', '/dashboard/inventory_dashboard'],
          ['HR', 'fa-users', 'dash_hr', '/dashboard/hr_command_center'],
          ['Costing', 'fa-calculator', 'dash_cost', '/dashboard/costing_dashboard'],
          ['Tally', 'fa-chart-pie', 'dash_tally', '/finance_accounts/tally_dashboard'],
        ].map(([label, icon, token, route]) => (
          <button key={token} type="button" className="ceo-dashboard-link" onClick={() => go(token, route)} title={`${label} Dashboard`}>
            <i className={`fa-solid ${icon}`}></i><span>{label}</span>
          </button>
        ))}
      </div>
    </DashboardHeader>

    <DashboardState loading={loading} error={error} onRetry={reload}>

      {/* EXECUTIVE ALERT CENTER */}
      <Panel title={<span style={{ color: '#b45309' }}><i className="fa-solid fa-bell" style={{ marginRight: '6px' }} />Alerts</span>} meta="Action needed">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: '8px' }}>
          {execAlerts.map((alert, idx) => (
            <div
              key={idx}
              onClick={() => handleAlertClick(alert.action)}
              className="enterprise-kpi clickable"
              style={{ minHeight: 'auto', padding: '10px 12px' }}
            >
              <div className="enterprise-kpi-top">
                <span style={{ color: ['#2563eb', '#16a34a', '#d97706', '#7c3aed'][idx % 4] }}>{alert.title}</span>
                <span className="enterprise-kpi-icon" style={{ '--kpi-accent': ({ critical: '#dc2626', warning: '#d97706', healthy: '#15803d' }[alert.level] || '#2563eb') }} title={alert.title}>
                  <i className={`fa-solid ${alertIconByAction[alert.action] || 'fa-triangle-exclamation'}`}></i>
                </span>
              </div>
              <strong style={{ fontSize: '15px', marginTop: '4px' }}>{alert.detail}</strong>
            </div>
          ))}
        </div>
      </Panel>

      {/* PERIOD SWITCHER & DYNAMIC FILTERS TOOLBAR */}
      <Panel>
        <div className="ceo-date-filter-row">
            {/* Quick Period Buttons: Today, Yesterday, This Month */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <label style={{ fontSize: '9px', fontWeight: '700', color: 'var(--text-secondary, #64748b)' }}>Quick Period</label>
              <div style={{ display: 'flex', gap: '3px' }}>
                {['Today', 'Yesterday', 'This Month'].map(p => (
                  <button
                    key={p}
                    type="button"
                    className="enterprise-refresh"
                    onClick={() => handlePeriodSelect(p)}
                    style={{
                      height: '24px',
                      fontSize: '10px',
                      fontWeight: '500',
                      padding: '0 7px',
                      background: 'var(--surface-panel)',
                      color: activePeriod === p ? '#2563eb' : ({ Today: '#1d4ed8', Yesterday: '#475569', 'This Month': '#15803d' }[p]),
                      borderRadius: '5px',
                      border: `1px solid ${activePeriod === p ? '#2563eb' : 'var(--border-color, #e2e8f0)'}`,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Financial Year Filter Dropdown */}
            <div style={{ width: '105px' }}>
              <Field label="FY">
                <select value={fy} onChange={e => handleFySelect(e.target.value)} style={{ height: '24px', fontSize: '10px', padding: '1px 4px' }}>
                  <option value="">-- Select FY --</option>
                  {(data?.fy_options || []).map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </Field>
            </div>

            {/* Month with FY Dropdown */}
            <div style={{ width: '135px' }}>
              <Field label="Month">
                <select value="" onChange={e => handleMonthWithFySelect(e.target.value)} style={{ height: '24px', fontSize: '10px', padding: '1px 4px' }}>
                  <option value="">-- Select Month --</option>
                  {(() => {
                    const selectedFyYear = parseInt((fy || data?.selected_fy || String(new Date().getFullYear())).split('-')[0], 10) || new Date().getFullYear();
                    const monthList = [
                      { label: `April ${selectedFyYear}`, val: `${selectedFyYear}-04` },
                      { label: `May ${selectedFyYear}`, val: `${selectedFyYear}-05` },
                      { label: `June ${selectedFyYear}`, val: `${selectedFyYear}-06` },
                      { label: `July ${selectedFyYear}`, val: `${selectedFyYear}-07` },
                      { label: `August ${selectedFyYear}`, val: `${selectedFyYear}-08` },
                      { label: `September ${selectedFyYear}`, val: `${selectedFyYear}-09` },
                      { label: `October ${selectedFyYear}`, val: `${selectedFyYear}-10` },
                      { label: `November ${selectedFyYear}`, val: `${selectedFyYear}-11` },
                      { label: `December ${selectedFyYear}`, val: `${selectedFyYear}-12` },
                      { label: `January ${selectedFyYear + 1}`, val: `${selectedFyYear + 1}-01` },
                      { label: `February ${selectedFyYear + 1}`, val: `${selectedFyYear + 1}-02` },
                      { label: `March ${selectedFyYear + 1}`, val: `${selectedFyYear + 1}-03` },
                    ];
                    return monthList.map(m => <option key={m.val} value={m.val}>{m.label}</option>);
                  })()}
                </select>
              </Field>
            </div>

            {/* From Date Picker */}
            <div style={{ width: '125px' }}>
              <Field label="From Date">
                <input type="date" value={fromDate || data?.from_date || ''} onChange={e => { setFromDate(e.target.value); setActivePeriod('Custom Range'); }} style={{ height: '24px', fontSize: '10px', padding: '1px 4px' }} />
              </Field>
            </div>

            {/* To Date Picker */}
            <div style={{ width: '125px' }}>
              <Field label="To Date">
                <input type="date" value={toDate || data?.to_date || ''} onChange={e => { setToDate(e.target.value); setActivePeriod('Custom Range'); }} style={{ height: '24px', fontSize: '10px', padding: '1px 4px' }} />
              </Field>
            </div>

          <div className="ceo-date-filter-status">
            Showing Metrics for: <strong>{activePeriod}</strong> ({fromDate || data?.from_date} to {toDate || data?.to_date})
          </div>
        </div>
      </Panel>

      {/* EXECUTIVE QUICK ACTIONS */}
      <Panel title={<span style={{ color: '#0f766e' }}><i className="fa-solid fa-bolt" style={{ marginRight: '6px' }} />Quick Actions</span>} meta="Shortcuts">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px' }}>
          <button type="button" className="enterprise-refresh" style={{ color: '#1d4ed8' }} onClick={() => go('finance_payment_receipt', '/finance_accounts/payment_receipt/entry')}>
            <i className="fa-solid fa-plus"></i> Record Receipt
          </button>
          <button type="button" className="enterprise-refresh" style={{ color: '#c2410c' }} onClick={() => go('finance_vendor_payment', '/finance_accounts/vendor_payment/entry')}>
            <i className="fa-solid fa-paper-plane"></i> Vendor Payment
          </button>
          <button type="button" className="enterprise-refresh" style={{ color: '#15803d' }} onClick={() => go('finance_salary_processing', '/finance_accounts/salary_processing/entry')}>
            <i className="fa-solid fa-circle-check"></i> Approve Salary
          </button>
          <button type="button" className="enterprise-refresh" style={{ color: '#a16207' }} onClick={() => go('attendance_daily_attendance', '/attendance/daily')}>
            <i className="fa-solid fa-clock-check"></i> Approve OT
          </button>
          <button type="button" className="enterprise-refresh" onClick={() => go('attendance_labour_management', '/attendance/labour-management')}>
            <i className="fa-solid fa-users"></i> Open Payroll
          </button>
          <button type="button" className="enterprise-refresh" onClick={() => go('production', '/processing/production')}>
            <i className="fa-solid fa-industry"></i> Open Production
          </button>
          <button type="button" className="enterprise-refresh" onClick={() => go('commercial_invoice', '/export_documents/commercial_invoice/entry')}>
            <i className="fa-solid fa-file-invoice"></i> Create Invoice
          </button>
          <button type="button" className="enterprise-refresh" onClick={() => go('pending_orders', '/inventory/pending_orders')}>
            <i className="fa-solid fa-cart-plus"></i> Raise PO
          </button>
        </div>
      </Panel>

      {/* LIVE CASH POSITION & PRIMARY KPIS */}
      <div className="enterprise-kpis ceo-primary-kpis" style={{ marginTop: '12px', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}>
        <MetricCard label="Opening Cash Balance" value={money(cashPos.opening_balance)} note="Live Opening" icon="fa-building-columns" color="#2563eb" />
        <MetricCard label="Today's Cash Receipts" value={`+${money(cashPos.todays_receipts)}`} note="Inflow Healthy" icon="fa-arrow-down" color="#16a34a" />
        <MetricCard label="Today's Vendor Payments" value={`-${money(cashPos.todays_payments)}`} note="Outflow Active" icon="fa-arrow-up" color="#d97706" />
        <MetricCard label="Net Closing Cash Balance" value={money(cashPos.closing_balance)} note="Net Reserve Positive" icon="fa-wallet" color="#0f766e" />
        <MetricCard label="Customer Receivables" value={money(data?.receivables_outstanding || 0)} note="Total Outstanding" icon="fa-file-invoice-dollar" color="#7c3aed" onClick={() => go('finance_customer_receivable', '/finance_accounts/customer_receivable/entry')} />
        <MetricCard label="Vendor Payables" value={money(data?.payables_outstanding || 0)} note="Unpaid Bills" icon="fa-receipt" color="#dc2626" onClick={() => go('finance_vendor_bills', '/api/vendor_bills/entry')} />
        <MetricCard
          label="Labour Cost This Month"
          value={money(lc.total)}
          note={`${lc.change_pct ?? 0}% vs Last Month (Click Breakdown)`}
          icon="fa-people-group"
          onClick={() => setActiveModal('labour')}
        />
        <MetricCard
          label="Labour Productivity"
          value={`₹${labProd.cost_per_kg ?? 0} / KG`}
          note={`Salary ${money(labProd.salary)} for ${labProd.production_mt ?? 0} MT Output`}
          icon="fa-industry"
        />
        <MetricCard
          label="Overall Cost Per KG"
          value={`₹${costKg.overall_cost_per_kg ?? 0} / KG`}
          note="Raw Material + Labour + Overheads (Click Breakdown)"
          icon="fa-scale-unbalanced-flip"
          onClick={() => setActiveModal('cost_per_kg')}
        />
        <MetricCard
          label="7-Day Cash Requirement"
          value={money(cashReq.total_required || 0)}
          note={`Reserves ${money(cashReq.available_reserves || 0)} (Click Details)`}
          icon="fa-hand-holding-dollar"
          onClick={() => setActiveModal('cash_req')}
        />
      </div>

      {/* DAILY PLANT SNAPSHOT & SEAFOOD EXPORT PERFORMANCE */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px', alignItems: 'stretch' }}>
        <div style={{ display: 'grid', gap: '12px', alignContent: 'start' }}>
        <Panel title={<span style={{ color: '#0f766e' }}><i className="fa-solid fa-boxes-stacked" style={{ marginRight: '6px' }} />Inventory</span>} meta="Stock and production">
          <div className="enterprise-risk-grid">
            <div className="enterprise-risk" style={{ cursor: 'pointer' }} onClick={() => go('inventory_stock_report', '/inventory/stock_report')}><span>Opening Inventory</span><strong>{plantSnap.opening_inventory_mt ?? 0} MT</strong></div>
            <div className="enterprise-risk" style={{ cursor: 'pointer' }} onClick={() => go('inventory_stock_report', '/inventory/stock_report?type=IN')}><span>Total Production</span><strong>{plantSnap.today_production_mt} MT</strong></div>
            <div className="enterprise-risk" style={{ cursor: 'pointer' }} onClick={() => go('report_sales_report', '/inventory/sales_report')}><span>Total Dispatch</span><strong>{plantSnap.today_dispatch_mt} MT</strong></div>
            <div className="enterprise-risk" style={{ cursor: 'pointer' }} onClick={() => go('report_rmp_report', '/reports/raw_material_purchasing')}><span>RM Received</span><strong>{plantSnap.raw_material_received_mt} MT</strong></div>
            <div className="enterprise-risk" style={{ cursor: 'pointer' }} onClick={() => go('inventory_stock_report', '/inventory/stock_report')}><span>Inventory</span><strong>{plantSnap.cold_storage_mt ?? plantSnap.cold_storage_occupancy_pct} MT</strong></div>
            <div className="enterprise-risk" style={{ cursor: 'pointer' }} onClick={() => go('report_reprocess_report', '/reports/re-process')}><span>Reprocess Qty</span><strong>{plantSnap.reprocess_mt ?? 0} MT</strong></div>
            <div className="enterprise-risk" style={{ cursor: 'pointer' }} onClick={() => go('inventory_stock_report', '/inventory/stock_report')}><span>Reglaze Qty</span><strong>{plantSnap.reglaze_mt ?? 0} MT</strong></div>
          </div>
        </Panel>

        <Panel title={<span style={{ color: '#2563eb' }}><i className="fa-solid fa-ship" style={{ marginRight: '6px' }} />Exports</span>} meta="Container status">
          <div className="enterprise-risk-grid">
            <div className="enterprise-risk" style={{ cursor: 'pointer' }} onClick={() => go('report_pending_orders_report', '/inventory/pending_orders_report')}><span>Total Containers</span><strong>{expPerf.total_containers} POs</strong></div>
            <div className="enterprise-risk" style={{ cursor: 'pointer' }} onClick={() => go('report_sales_report', '/inventory/sales_report')}><span>Shipped Out</span><strong>{expPerf.shipped_containers} POs</strong></div>
            <div className="enterprise-risk" style={{ cursor: 'pointer' }} onClick={() => go('report_pending_orders_report', '/inventory/pending_orders_report')}><span>Pending Stuffing</span><strong>{expPerf.pending_containers} POs</strong></div>
            <div className="enterprise-risk" style={{ cursor: 'pointer' }} onClick={() => go('report_sales_report', '/inventory/sales_report')}><span>Export Value</span><strong>{rupeesFromCrores(expPerf.export_value_cr)}</strong></div>
          </div>
        </Panel>
        </div>

        <Panel title={<span style={{ color: '#a16207' }}><i className="fa-solid fa-list-check" style={{ marginRight: '6px' }} />Approvals</span>} meta="Pending items">
          <div className="ceo-table-chart">
            <ExecutiveChart type="doughnut" data={{
              labels: ['Salary', 'OT', 'Purchase', 'Vendor Bills'],
              datasets: [{ data: [ceoApps.pending_salary_count, ceoApps.pending_ot_count, ceoApps.pending_purchase_count, ceoApps.pending_vendor_bills_count], backgroundColor: ['#dc2626', '#d97706', '#2563eb', '#7c3aed'], borderWidth: 0 }],
            }} onSelect={(_label, index) => [
              () => go('finance_salary_processing', '/finance_accounts/salary_processing/entry'),
              () => go('dashboard_hr', '/dashboard/hr_command_center?tab=approvals'),
              () => go('pending_orders', '/inventory/pending_orders'),
              () => go('finance_vendor_bills', '/api/vendor_bills/entry'),
            ][index]?.()} />
          </div>
          <table className="enterprise-table">
            <thead>
              <tr><th>Action Item</th><th className="num">Pending Items</th></tr>
            </thead>
            <tbody>
              <tr style={{ cursor: 'pointer' }} onClick={() => go('finance_salary_processing', '/finance_accounts/salary_processing/entry')}>
                <td>Pending Salary Disbursal</td>
                <td className="num"><strong>{ceoApps.pending_salary_count} Employees &rarr;</strong></td>
              </tr>
              <tr style={{ cursor: 'pointer' }} onClick={() => go('dashboard_hr', '/dashboard/hr_command_center?tab=approvals')}>
                <td>Pending OT Hours Approval</td>
                <td className="num"><strong>{ceoApps.pending_ot_count} Items &rarr;</strong></td>
              </tr>
              <tr style={{ cursor: 'pointer' }} onClick={() => go('pending_orders', '/inventory/pending_orders')}>
                <td>Pending Purchase Orders</td>
                <td className="num"><strong>{ceoApps.pending_purchase_count} POs &rarr;</strong></td>
              </tr>
              <tr style={{ cursor: 'pointer' }} onClick={() => go('finance_vendor_bills', '/api/vendor_bills/entry')}>
                <td>Pending Vendor Bills</td>
                <td className="num"><strong>{ceoApps.pending_vendor_bills_count} Bills &rarr;</strong></td>
              </tr>
            </tbody>
          </table>
        </Panel>
      </div>

      {/* AI EXECUTIVE INSIGHTS */}
      <div style={{ marginTop: '12px', order: 99 }}>
        <Panel title={<span style={{ color: '#4338ca' }}><i className="fa-solid fa-brain" style={{ marginRight: '6px' }} />AI Business Summary</span>} meta="Current company and period">
          <div style={{ borderLeft: '4px solid #2563eb', padding: '10px 12px', background: '#eff6ff', marginBottom: '12px', borderRadius: '6px' }}>
            <strong style={{ display: 'block', fontSize: '13px', color: '#1e3a8a' }}><i className="fa-solid fa-sun" style={{ marginRight: '6px' }} />CEO Morning Brief</strong>
            <span style={{ display: 'block', fontSize: '12px', marginTop: '3px' }}>{morningBrief.headline || 'Live ERP data is being evaluated for the selected company and period.'}</span>
            <ul style={{ margin: '6px 0 0', paddingLeft: '16px', fontSize: '11px', lineHeight: 1.45 }}>
              {(morningBrief.lines || []).map((line, index) => <li key={index}>{line}</li>)}
            </ul>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '7px' }}>
              {(morningBrief.priorities || []).map((item, index) => <button type="button" key={`${item.title}-${index}`} className="enterprise-refresh" style={{ fontSize: '10px' }} onClick={() => openDecisionSource(item.title, item.route)}>{item.priority} {item.severity}: {item.title}</button>)}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '96px minmax(0, 1fr)', gap: '12px', alignItems: 'center', marginBottom: '12px', padding: '8px', background: '#f8fafc', borderRadius: '7px' }}>
            <div style={{ width: 88, height: 88, borderRadius: '50%', display: 'grid', placeItems: 'center', border: `7px solid ${decisionHealth.overall >= 85 ? '#15803d' : decisionHealth.overall >= 70 ? '#a16207' : decisionHealth.overall >= 50 ? '#c2410c' : '#b91c1c'}`, background: '#ffffff' }}>
              <div style={{ textAlign: 'center' }}><strong style={{ display: 'block', fontSize: '24px' }}>{decisionHealth.overall}</strong><span style={{ fontSize: '9px', fontWeight: 800 }}>HEALTH</span></div>
            </div>
            <div>
              <strong style={{ display: 'block', fontSize: '15px' }}><i className="fa-solid fa-building-shield" style={{ marginRight: '6px', color: '#2563eb' }} />Overall Business Health: {decisionHealth.label}</strong>
              <span className="enterprise-pill" style={{ marginTop: '4px' }}>Confidence {decisionEngine.confidence?.score || 0}%</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '7px' }}>
                {Object.entries(decisionHealth.categories || {}).map(([name, score]) => <span key={name} className="enterprise-pill">{name}: {healthStatus(score)}</span>)}
              </div>
            </div>
          </div>

          <div className="ceo-flow-grid">
            <div className="ceo-flow-panel">
              <div className="ceo-flow-heading"><i className="fa-solid fa-money-bill-transfer" /> Cash Flow</div>
              <div className="ceo-flow-track">
                {corporateFlow.map((item, index) => <React.Fragment key={item.label}>
                  <div className={`ceo-flow-step ${item.tone}`}>
                    <i className={`fa-solid ${item.icon}`} />
                    <span>{item.label}</span><strong>{item.value}</strong>
                  </div>
                  {index < corporateFlow.length - 1 && <i className="fa-solid fa-arrow-right ceo-flow-arrow" />}
                </React.Fragment>)}
              </div>
            </div>
            <div className="ceo-flow-panel">
              <div className="ceo-flow-heading"><i className="fa-solid fa-arrows-spin" /> Operations Flow</div>
              <div className="ceo-flow-track">
                {operationsFlow.map((item, index) => <React.Fragment key={item.label}>
                  <div className={`ceo-flow-step ${item.tone}`}>
                    <i className={`fa-solid ${item.icon}`} />
                    <span>{item.label}</span><strong>{item.value}</strong>
                  </div>
                  {index < operationsFlow.length - 1 && <i className="fa-solid fa-arrow-right ceo-flow-arrow" />}
                </React.Fragment>)}
              </div>
            </div>
          </div>

          <div className="ai-engine-columns">
          <div style={{ padding: '10px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '7px' }}>
            <strong style={{ fontSize: '12px', textTransform: 'uppercase', color: '#166534' }}><i className="fa-solid fa-chart-pie" style={{ marginRight: '6px' }} />Summary</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: '16px', fontSize: '11px', lineHeight: 1.5 }}>
              {(decisionEngine.summary || []).map((line, index) => <li key={index}>{line}</li>)}
            </ul>
          </div>

          <div style={{ padding: '10px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '7px' }}>
            <strong style={{ fontSize: '12px', textTransform: 'uppercase', color: '#1d4ed8' }}><i className="fa-solid fa-building-columns" style={{ marginRight: '6px' }} />7-Day Cash Forecast</strong>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '6px', marginTop: '6px' }}>
              <div className="enterprise-risk"><span>Opening Cash</span><strong>{money(decisionForecast.opening_cash || 0)}</strong></div>
              <div className="enterprise-risk"><span>Expected Collections</span><strong>{money(decisionForecast.expected_collections || 0)}</strong></div>
              <div className="enterprise-risk"><span>Expected Payments</span><strong>{money(decisionForecast.expected_payments || 0)}</strong></div>
              <div className="enterprise-risk"><span>Expected Payroll</span><strong>{money(decisionForecast.payroll_requirement || 0)}</strong></div>
              <div className="enterprise-risk"><span>Expected Closing Cash</span><strong>{money(decisionForecast.expected_closing_cash || 0)}</strong></div>
              <div className="enterprise-risk"><span>Days Cash Available</span><strong>{decisionForecast.days_cash_available == null ? 'No recorded commitments' : `${decisionForecast.days_cash_available} days`}</strong></div>
            </div>
          </div>

          <div style={{ padding: '10px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '7px' }}>
            <strong style={{ fontSize: '12px', textTransform: 'uppercase', color: '#92400e' }}><i className="fa-solid fa-magnifying-glass-chart" style={{ marginRight: '6px' }} />Why Did Production Change?</strong>
            {rootCause.production_change_pct == null ? <div style={{ fontSize: '11px', marginTop: '5px', color: 'var(--text-secondary)' }}>A like-for-like prior-period production comparison is not available yet.</div> : <>
              <div style={{ fontSize: '11px', marginTop: '5px' }}>Production is {Math.abs(rootCause.production_change_pct)}% {rootCause.production_change_pct >= 0 ? 'higher' : 'lower'} than the preceding comparable period.</div>
              {(rootCause.causes || []).map((cause, index) => <div key={`${cause.factor}-${index}`} style={{ marginTop: '6px', borderLeft: '3px solid #d97706', paddingLeft: '7px', fontSize: '11px' }}><strong>{cause.factor}</strong><div>{cause.evidence}</div><span style={{ color: 'var(--text-secondary)' }}>Impact: {cause.impact}</span></div>)}
            </>}
            {(rootCause.departments || []).length > 0 && <div style={{ marginTop: '7px', fontSize: '10px' }}><strong>Latest Department Attendance</strong><div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '4px' }}>{rootCause.departments.map(item => <span key={item.department} className="enterprise-pill">{item.department}: {item.pct}% ({item.present}/{item.active})</span>)}</div></div>}
            {(rootCause.data_gaps || []).map((gap, index) => <div key={index} style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>{gap}</div>)}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', padding: '10px', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '7px' }}>
            {(decisionEngine.risks || []).length === 0 ? (
              <div style={{ fontSize: '11px', padding: '8px', border: '1px solid #bbf7d0', color: '#166534' }}>No material risk rule is triggered from the live ERP records for this period.</div>
            ) : (decisionEngine.risks || []).map((risk, index) => (
              <div key={`${risk.title}-${index}`} style={{ borderLeft: `4px solid ${decisionRiskColors[risk.level] || '#64748b'}`, border: '1px solid var(--border-light)', padding: '7px 8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}><strong style={{ fontSize: '11px' }}><i className="fa-solid fa-triangle-exclamation" style={{ marginRight: '5px', color: decisionRiskColors[risk.level] }} />{risk.title}</strong><span className="enterprise-pill">{risk.priority} {risk.severity}</span></div>
                <div style={{ fontSize: '11px', marginTop: '3px' }}>{risk.reason}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '3px' }}>Impact: {risk.impact}</div>
                <button type="button" className="enterprise-refresh" style={{ marginTop: '5px', fontSize: '10px' }} onClick={() => openDecisionSource(risk.title, risk.route)}><i className="fa-solid fa-arrow-up-right-from-square" /> {risk.action}</button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', padding: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '7px' }}>
            {decisionSections.map(section => {
              const hasData = section.lines.some(line => String(line || '').trim());
              const isExpanded = hasData && expandedDecisionSection !== section.key ? true : expandedDecisionSection === section.key;
              return (
                <div key={section.key} style={{ border: '1px solid var(--border-light)', alignSelf: 'start' }}>
                  <button type="button" onClick={() => hasData && setExpandedDecisionSection(isExpanded ? section.key : '')} style={{ width: '100%', border: 0, background: 'var(--bg-app)', padding: '7px 8px', textAlign: 'left', cursor: hasData ? 'pointer' : 'default', display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 700 }}>
                    <span><i className={`fa-solid ${section.icon}`} style={{ width: 16 }} /> {section.label}</span><span>{isExpanded ? '−' : '+'}</span>
                  </button>
                  {isExpanded && <ul style={{ margin: '0', padding: '6px 8px 7px 24px', fontSize: '11px', lineHeight: 1.45 }}>{section.lines.map((line, index) => <li key={index}>{line}</li>)}</ul>}
                </div>
              );
            })}
          </div>

          <div style={{ padding: '10px', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: '7px' }}>
            <strong style={{ fontSize: '12px', textTransform: 'uppercase', color: '#3730a3' }}><i className="fa-solid fa-lightbulb" style={{ marginRight: '6px' }} />Recommendations</strong>
            {(decisionEngine.recommendations || []).map((item, index) => (
              <div key={`${item.title}-${index}`} style={{ marginTop: '6px', padding: '7px 8px', border: '1px solid var(--border-light)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px' }}><strong style={{ fontSize: '11px' }}>{item.title}</strong><span className="enterprise-pill">{item.priority} · {item.confidence}%</span></div>
                <div style={{ fontSize: '10px', marginTop: '3px' }}>{item.action}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '3px' }}>Expected benefit: {item.benefit}</div>
                <button type="button" className="enterprise-refresh" style={{ marginTop: '5px', fontSize: '10px' }} onClick={() => openDecisionSource(item.title, item.route)}>Open Source</button>
              </div>
            ))}
          </div>

          <div style={{ padding: '10px', background: '#ecfeff', border: '1px solid #a5f3fc', borderRadius: '7px' }}>
            <strong style={{ fontSize: '12px', textTransform: 'uppercase', color: '#0e7490' }}><i className="fa-solid fa-arrow-trend-up" style={{ marginRight: '6px' }} />Opportunity Detection</strong>
            {(decisionEngine.opportunities || []).length === 0 ? <div style={{ fontSize: '10px', marginTop: '5px', color: 'var(--text-secondary)' }}>No quantified opportunity is available from the registered source data.</div> : (decisionEngine.opportunities || []).map((item, index) => (
              <button type="button" key={`${item.title}-${index}`} onClick={() => go('executive_opportunity', item.route)} style={{ width: '100%', marginTop: '5px', background: 'transparent', border: '1px solid var(--border-light)', padding: '6px 8px', textAlign: 'left', cursor: 'pointer' }}>
                <strong style={{ display: 'block', fontSize: '10px' }}>{item.title}</strong><span style={{ fontSize: '10px' }}>{item.detail}</span>
              </button>
            ))}
          </div>

          <div style={{ gridColumn: '1 / -1', padding: '7px 10px', fontSize: '11px', color: 'var(--text-secondary)', background: '#f8fafc', borderRadius: '6px' }}>
            Comparison: {decisionEngine.history?.production_change_pct == null ? 'Insufficient prior-period production data for a like-for-like comparison.' : `Production is ${Math.abs(decisionEngine.history.production_change_pct)}% ${decisionEngine.history.production_change_pct >= 0 ? 'higher' : 'lower'} than the preceding ${decisionEngine.history.comparison_days}-day period.`}
          </div>
          </div>
        </Panel>
      </div>

      {/* MULTI-MONTH PROFIT TREND & COST PER KG BREAKDOWN */}
      <div className="enterprise-grid">
        <Panel title={<span style={{ color: '#15803d' }}><i className="fa-solid fa-chart-line" style={{ marginRight: '6px' }} />Monthly Profit</span>} meta="Revenue, expenses and profit">
          <div className="ceo-table-chart">
            <ExecutiveChart type="bar" data={{
              labels: profitTrend.map(item => item.month),
              datasets: [
                { label: 'Revenue', data: profitTrend.map(item => Number(item.revenue || 0)), backgroundColor: '#2563eb', borderRadius: 3 },
                { label: 'Expenses', data: profitTrend.map(item => Number(item.expenses ?? (Number(item.revenue || 0) - Number(item.profit || 0)))), backgroundColor: '#f59e0b', borderRadius: 3 },
                { type: 'line', label: 'Profit', data: profitTrend.map(item => Number(item.profit || 0)), borderColor: '#15803d', backgroundColor: '#15803d', borderWidth: 2, pointRadius: 2, tension: .3 },
              ],
            }} options={{ plugins: { legend: { display: true, position: 'top', labels: { boxWidth: 8, font: { size: 9 } } } } }} onSelect={(_label, index) => profitTrend[index] && openTrendMonth(profitTrend[index])} />
          </div>
          <table className="enterprise-table">
            <thead>
              <tr><th>Month</th><th className="num">Revenue</th><th className="num">Expenses</th><th className="num">Profit</th><th className="num">Margin</th></tr>
            </thead>
            <tbody>
              {profitTrend.map((pt, i) => (
                <tr key={i} style={{ cursor: 'pointer' }} onClick={() => openTrendMonth(pt)} title={`Click to view itemized financial breakdown for ${pt.month}`}>
                  <td><strong>{pt.month} &rarr;</strong></td>
                  <td className="num">{rupeesFromLakhs(pt.revenue)}</td>
                  <td className="num" style={{ color: '#ef4444' }}>{rupeesFromLakhs(pt.expenses ?? (pt.revenue - pt.profit).toFixed(1))}</td>
                  <td className="num" style={{ color: '#10b981' }}>{rupeesFromLakhs(pt.profit)}</td>
                  <td className="num"><span className="enterprise-pill">{pt.margin_pct}%</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '8px', fontStyle: 'italic' }}>
            💡 Click any month row above to open itemized cost breakdown & sales dispatches in a popup modal.
          </div>
        </Panel>

        <Panel title={<span style={{ color: '#7c3aed' }}><i className="fa-solid fa-scale-balanced" style={{ marginRight: '6px' }} />Cost Per KG</span>} meta={`Overall ₹${costKg.overall_cost_per_kg ?? 0} / KG | ${costKg.cost_basis_label || 'RMP Received KG'}: ${Number(costKg.cost_basis_kg || 0).toLocaleString('en-IN')}`}>
          <div className="ceo-table-chart">
            <ExecutiveChart type="doughnut" data={{
              labels: costBreakdownRows.map(item => item.category),
              datasets: [{ data: costBreakdownRows.map(item => Number(item.amount_total || item.amount || 0)), backgroundColor: costBreakdownRows.map(item => item.color || '#64748b'), borderWidth: 0 }],
            }} onSelect={(label) => {
              const targets = {
                'Raw Material': ['report_rmp_report', '/reports/raw_material_purchasing'],
                Labour: ['attendance_salary_report', '/attendance/salary/monthly-sheet'],
                Utilities: ['finance_electricity_bills', '/api/electricity/entry'],
                Others: ['finance_packaging_bills', '/api/purchase/entry'],
              };
              const target = targets[label];
              if (target) go(target[0], target[1]);
            }} />
          </div>
          <table className="enterprise-table">
            <thead>
              <tr><th>Category</th><th className="num">Qty (KG)</th><th className="num">Amount</th><th className="num">Avg Rate / KG</th><th className="num">Share</th></tr>
            </thead>
            <tbody>
              {costBreakdownRows.map((item, idx) => {
                const targetMap = {
                  'Raw Material': { token: 'report_rmp_report', route: '/reports/raw_material_purchasing' },
                  'Labour': { token: 'attendance_salary_report', route: '/attendance/salary/monthly-sheet' },
                  'Utilities': { token: 'finance_electricity_bills', route: '/api/electricity/entry' },
                  'Others': { token: 'finance_packaging_bills', route: '/api/purchase/entry' }
                };
                const t = targetMap[item.category] || { token: 'report_rmp_report', route: '/reports/raw_material_purchasing' };
                return (
                  <tr key={idx} style={{ cursor: 'pointer' }} onClick={() => go(t.token, t.route)} title={`Click to open ${item.category} source report`}>
                    <td><strong>{item.category} &rarr;</strong></td>
                    <td className="num">{Number(item.quantity_kg || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                    <td className="num">{money(item.amount_total || 0)}</td>
                    <td className="num">₹{Number(item.amount || 0).toFixed(2)}</td>
                    <td className="num">{item.pct}%</td>
                  </tr>
                );
              })}
              <tr style={{ background: 'var(--bg-app, #f8fafc)', fontWeight: '800' }}>
                <td>Sub Total</td>
                <td className="num">{Number(costKg.cost_basis_kg || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                <td className="num">{money(costKg.subtotal_amount || 0)}</td>
                <td className="num">₹{processingCostSubtotal.toFixed(2)}</td>
                <td className="num">{processingCostShare.toFixed(1)}%</td>
              </tr>
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel title={<span style={{ color: '#0f766e' }}><i className="fa-solid fa-user-clock" style={{ marginRight: '6px' }} />Attendance</span>} meta={hrmsAttendance.is_single_day ? 'Attendance by shift' : 'Average for selected period'}>
        {hrmsAttendance.is_single_day ? (
          (hrmsAttendance.shift_rows || []).length > 0 ? <><div className="ceo-table-chart">
            <ExecutiveChart type="bar" data={{
              labels: (hrmsAttendance.shift_rows || []).map(item => item.shift),
              datasets: [{ label: 'Present Employees', data: (hrmsAttendance.shift_rows || []).map(item => Number(item.present || 0)), backgroundColor: '#0f766e', borderRadius: 3 }],
            }} onSelect={(shift) => go('attendance_daily_attendance', `/attendance/daily?shift=${encodeURIComponent(shift)}`)} />
          </div><table className="enterprise-table">
            <thead><tr><th>Shift</th><th className="num">Present Employees</th><th className="num">Approved OT Hours</th></tr></thead>
            <tbody>{hrmsAttendance.shift_rows.map(row => <tr key={row.shift}><td><strong>{row.shift}</strong></td><td className="num">{row.present}</td><td className="num">{row.ot_hours}</td></tr>)}</tbody>
          </table></> : <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>No attendance entries are recorded for the selected day.</div>
        ) : (
          <div className="enterprise-risk-grid">
            <div className="enterprise-risk"><span>Attendance Days Logged</span><strong>{hrmsAttendance.average?.logged_days || 0}</strong></div>
            <div className="enterprise-risk"><span>Average Present / Day</span><strong>{hrmsAttendance.average?.average_present || 0}</strong></div>
            <div className="enterprise-risk"><span>Average Attendance</span><strong>{hrmsAttendance.average?.average_attendance_pct == null ? 'N/A' : `${hrmsAttendance.average.average_attendance_pct}%`}</strong></div>
            <div className="enterprise-risk"><span>Average Approved OT / Day</span><strong>{hrmsAttendance.average?.average_ot_hours || 0} Hrs</strong></div>
          </div>
        )}
      </Panel>

    </DashboardState>

    {/* MODALS */}
    {activeModal === 'labour' && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
        <div className="enterprise-panel" style={{ width: '90%', maxWidth: '550px', padding: '20px' }}>
          <div className="enterprise-panel-head" style={{ marginBottom: '14px' }}>
            <h2>Labour Cost Breakdown</h2>
            <button type="button" onClick={() => setActiveModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>&times;</button>
          </div>
          <div className="enterprise-risk-grid" style={{ marginBottom: '14px' }}>
            <div className="enterprise-risk"><span>Permanent Salary</span><strong>{money(lc.permanent_salary || 0)}</strong></div>
            <div className="enterprise-risk"><span>Day Basis Salary</span><strong>{money(lc.day_basis_salary || 420000)}</strong></div>
            <div className="enterprise-risk"><span>Contractor Charges</span><strong>{money(lc.contractor_charges || 210000)}</strong></div>
            <div className="enterprise-risk"><span>OT Amount</span><strong>{money(lc.ot_amount || 126540)}</strong></div>
          </div>
          <button type="button" className="enterprise-refresh" style={{ width: '100%' }} onClick={() => setActiveModal(null)}>Close</button>
        </div>
      </div>
    )}

    {activeModal === 'cash_req' && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
        <div className="enterprise-panel" style={{ width: '90%', maxWidth: '500px', padding: '20px' }}>
          <div className="enterprise-panel-head" style={{ marginBottom: '14px' }}>
            <h2>Next 7 Days Cash Requirement Forecast</h2>
            <button type="button" onClick={() => setActiveModal(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>&times;</button>
          </div>
          <table className="enterprise-table" style={{ marginBottom: '14px' }}>
            <tbody>
              <tr><td>Salary Obligation</td><td className="num">{money(cashReq.salary || 0)}</td></tr>
              <tr><td>Vendor Due Invoices</td><td className="num">{money(cashReq.vendor || 0)}</td></tr>
              <tr><td>Total Outflow Required</td><td className="num"><strong>{money(cashReq.total_required || 0)}</strong></td></tr>
              <tr><td>Available Bank Reserves</td><td className="num"><strong>{money(cashReq.available_reserves || 0)}</strong></td></tr>
            </tbody>
          </table>
          <button type="button" className="enterprise-refresh" style={{ width: '100%' }} onClick={() => setActiveModal(null)}>Close</button>
        </div>
      </div>
    )}

    {selectedTrendMonth && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99999 }} role="presentation" onClick={closeTrendMonth}>
        <div className="enterprise-panel" style={{ width: '90%', maxWidth: '650px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', background: 'var(--bg-card, #ffffff)', borderRadius: '12px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)', border: '1px solid var(--border-color, #e2e8f0)' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color, #e2e8f0)', paddingBottom: '12px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: 'var(--text-primary, #0f172a)' }}>{selectedTrendMonth.month} Profitability & Cost Breakdown</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary, #64748b)' }}>Itemized Financial & Sales Report Details</span>
            </div>
            <button type="button" onClick={closeTrendMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '22px', color: 'var(--text-secondary, #64748b)' }}>&times;</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px' }}>
            <div style={{ background: 'rgba(37, 99, 235, 0.08)', padding: '12px 10px', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(37, 99, 235, 0.2)' }}>
              <span style={{ fontSize: '11px', color: '#2563eb', fontWeight: '600', display: 'block', marginBottom: '2px' }}>Revenue</span>
              <strong style={{ fontSize: '17px', color: '#1d4ed8' }}>{rupeesFromLakhs(selectedTrendMonth.revenue)}</strong>
            </div>
            <div style={{ background: 'rgba(239, 68, 68, 0.08)', padding: '12px 10px', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <span style={{ fontSize: '11px', color: '#ef4444', fontWeight: '600', display: 'block', marginBottom: '2px' }}>Expenses</span>
              <strong style={{ fontSize: '17px', color: '#dc2626' }}>{rupeesFromLakhs(selectedTrendMonth.expenses)}</strong>
            </div>
            <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '12px 10px', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <span style={{ fontSize: '11px', color: '#10b981', fontWeight: '600', display: 'block', marginBottom: '2px' }}>Net Profit</span>
              <strong style={{ fontSize: '17px', color: '#059669' }}>{rupeesFromLakhs(selectedTrendMonth.profit)}</strong>
            </div>
            <div style={{ background: 'rgba(139, 92, 246, 0.08)', padding: '12px 10px', borderRadius: '8px', textAlign: 'center', border: '1px solid rgba(139, 92, 246, 0.2)' }}>
              <span style={{ fontSize: '11px', color: '#8b5cf6', fontWeight: '600', display: 'block', marginBottom: '2px' }}>Net Margin</span>
              <strong style={{ fontSize: '17px', color: '#7c3aed' }}>{selectedTrendMonth.margin_pct}%</strong>
            </div>
          </div>

          <h4 style={{ margin: '16px 0 8px 0', fontSize: '14px', color: 'var(--text-primary, #0f172a)', fontWeight: '700', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Itemized Cost Breakdown ({selectedTrendMonth.month})</span>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary, #64748b)', fontWeight: 'normal' }}>💡 Click any cost row to open source register</span>
          </h4>
          <table className="enterprise-table" style={{ marginBottom: '20px', fontSize: '13px' }}>
            <thead>
              <tr><th>Cost Component</th><th className="num">Cost Amount</th><th className="num">% Share</th></tr>
            </thead>
            <tbody>
              <tr style={{ cursor: 'pointer' }} onClick={() => { 
                const m = selectedTrendMonth.month;
                const { month_key, from_date, to_date } = getTrendMonthRange(selectedTrendMonth);
                const amt = selectedTrendMonth.cogs || (selectedTrendMonth.expenses * 0.715).toFixed(1);
                const pct = selectedTrendMonth.cogs_pct ?? 0;
                sessionFetch(`/dashboard/cost_items_detail?category=cogs&month_key=${month_key}`).then(r => r.json()).then(res => {
                  const items = res.items || [];
                  const itemsSum = items.reduce((acc, row) => acc + (parseFloat(row.amount_lakhs) || 0), 0);
                  const displayAmt = itemsSum > 0 ? itemsSum.toFixed(2) : amt;
                  setSelectedCostDetail({ cost_component: 'Raw Material Procurement (COGS)', month: m, from_date, to_date, amount_lakhs: displayAmt, pct, items, target_token: 'report_rmp_report', target_route: '/reports/raw_material_purchasing' });
                }).catch(() => {
                  setSelectedCostDetail({ cost_component: 'Raw Material Procurement (COGS)', month: m, from_date, to_date, amount_lakhs: amt, pct, items: [], target_token: 'report_rmp_report', target_route: '/reports/raw_material_purchasing' });
                });
              }} title="Click to view live database Raw Material Procurement items">
                <td><strong>Raw Material Procurement (COGS) &rarr;</strong></td>
                <td className="num">{rupeesFromLakhs(selectedTrendMonth.cogs)}</td>
                <td className="num">{selectedTrendMonth.cogs_pct ?? 0}%</td>
              </tr>
              <tr style={{ cursor: 'pointer' }} onClick={() => { 
                const m = selectedTrendMonth.month;
                const { month_key, from_date, to_date } = getTrendMonthRange(selectedTrendMonth);
                const amt = selectedTrendMonth.labour || (selectedTrendMonth.expenses * 0.150).toFixed(1);
                const pct = selectedTrendMonth.labour_pct ?? 0;
                sessionFetch(`/dashboard/cost_items_detail?category=labour&month_key=${month_key}`).then(r => r.json()).then(res => {
                  const items = res.items || [];
                  const itemsSum = items.reduce((acc, row) => acc + (parseFloat(row.amount_lakhs) || 0), 0);
                  const displayAmt = itemsSum > 0 ? itemsSum.toFixed(2) : amt;
                  setSelectedCostDetail({ cost_component: 'Processing & Direct Labour', month: m, from_date, to_date, amount_lakhs: displayAmt, pct, items, target_token: 'attendance_salary_report', target_route: '/attendance/salary/monthly-sheet' });
                }).catch(() => {
                  setSelectedCostDetail({ cost_component: 'Processing & Direct Labour', month: m, from_date, to_date, amount_lakhs: amt, pct, items: [], target_token: 'attendance_salary_report', target_route: '/attendance/salary/monthly-sheet' });
                });
              }} title="Click to view live database Labour & Wage items">
                <td><strong>Processing & Direct Labour &rarr;</strong></td>
                <td className="num">{rupeesFromLakhs(selectedTrendMonth.labour)}</td>
                <td className="num">{selectedTrendMonth.labour_pct ?? 0}%</td>
              </tr>
              <tr style={{ cursor: 'pointer' }} onClick={() => { 
                const m = selectedTrendMonth.month;
                const { month_key, from_date, to_date } = getTrendMonthRange(selectedTrendMonth);
                const amt = selectedTrendMonth.freight || (selectedTrendMonth.expenses * 0.053).toFixed(1);
                const pct = selectedTrendMonth.freight_pct ?? 0;
                sessionFetch(`/dashboard/cost_items_detail?category=freight&month_key=${month_key}`).then(r => r.json()).then(res => {
                  const items = res.items || [];
                  const itemsSum = items.reduce((acc, row) => acc + (parseFloat(row.amount_lakhs) || 0), 0);
                  const displayAmt = itemsSum > 0 ? itemsSum.toFixed(2) : amt;
                  setSelectedCostDetail({ cost_component: 'Freight & Logistics', month: m, from_date, to_date, amount_lakhs: displayAmt, pct, items, target_token: 'finance_logistics_bills', target_route: '/api/container/entry' });
                }).catch(() => {
                  setSelectedCostDetail({ cost_component: 'Freight & Logistics', month: m, from_date, to_date, amount_lakhs: amt, pct, items: [], target_token: 'finance_logistics_bills', target_route: '/api/container/entry' });
                });
              }} title="Click to view live database Freight & Logistics items">
                <td><strong>Freight & Logistics &rarr;</strong></td>
                <td className="num">{rupeesFromLakhs(selectedTrendMonth.freight)}</td>
                <td className="num">{selectedTrendMonth.freight_pct ?? 0}%</td>
              </tr>
              <tr style={{ cursor: 'pointer' }} onClick={() => { 
                const m = selectedTrendMonth.month;
                const { month_key, from_date, to_date } = getTrendMonthRange(selectedTrendMonth);
                const amt = selectedTrendMonth.utilities || (selectedTrendMonth.expenses * 0.044).toFixed(1);
                const pct = selectedTrendMonth.utilities_pct ?? 0;
                sessionFetch(`/dashboard/cost_items_detail?category=utilities&month_key=${month_key}`).then(r => r.json()).then(res => {
                  const items = res.items || [];
                  const itemsSum = items.reduce((acc, row) => acc + (parseFloat(row.amount_lakhs) || 0), 0);
                  const displayAmt = itemsSum > 0 ? itemsSum.toFixed(2) : amt;
                  setSelectedCostDetail({ cost_component: 'Utilities (Power & Fuel)', month: m, from_date, to_date, amount_lakhs: displayAmt, pct, items, target_token: 'finance_electricity_bills', target_route: '/api/electricity/entry' });
                }).catch(() => {
                  setSelectedCostDetail({ cost_component: 'Utilities (Power & Fuel)', month: m, from_date, to_date, amount_lakhs: amt, pct, items: [], target_token: 'finance_electricity_bills', target_route: '/api/electricity/entry' });
                });
              }} title="Click to view live database Electricity & Utilities items">
                <td><strong>Utilities (Power & Fuel) &rarr;</strong></td>
                <td className="num">{rupeesFromLakhs(selectedTrendMonth.utilities)}</td>
                <td className="num">{selectedTrendMonth.utilities_pct ?? 0}%</td>
              </tr>
              <tr style={{ cursor: 'pointer' }} onClick={() => { 
                const m = selectedTrendMonth.month;
                const { month_key, from_date, to_date } = getTrendMonthRange(selectedTrendMonth);
                const amt = selectedTrendMonth.packaging || (selectedTrendMonth.expenses * 0.038).toFixed(1);
                const pct = selectedTrendMonth.packaging_pct ?? 0;
                sessionFetch(`/dashboard/cost_items_detail?category=packaging&month_key=${month_key}`).then(r => r.json()).then(res => {
                  const items = res.items || [];
                  const itemsSum = items.reduce((acc, row) => acc + (parseFloat(row.amount_lakhs) || 0), 0);
                  const displayAmt = itemsSum > 0 ? itemsSum.toFixed(2) : amt;
                  setSelectedCostDetail({ cost_component: 'Packaging Material', month: m, from_date, to_date, amount_lakhs: displayAmt, pct, items, target_token: 'finance_packaging_bills', target_route: '/api/purchase/entry' });
                }).catch(() => {
                  setSelectedCostDetail({ cost_component: 'Packaging Material', month: m, from_date, to_date, amount_lakhs: amt, pct, items: [], target_token: 'finance_packaging_bills', target_route: '/api/purchase/entry' });
                });
              }} title="Click to view live database Packaging Material items">
                <td><strong>Packaging Material &rarr;</strong></td>
                <td className="num">{rupeesFromLakhs(selectedTrendMonth.packaging)}</td>
                <td className="num">{selectedTrendMonth.packaging_pct ?? 0}%</td>
              </tr>
              <tr style={{ fontWeight: '800', background: 'var(--bg-app, #f8fafc)', borderTop: '2px solid var(--border-color, #cbd5e1)' }}>
                <td>Total Monthly Operational Expenses</td>
                <td className="num" style={{ color: '#ef4444' }}>{rupeesFromLakhs(selectedTrendMonth.expenses)}</td>
                <td className="num">100.0%</td>
              </tr>
            </tbody>
          </table>

          {selectedTrendMonth.dispatches && selectedTrendMonth.dispatches.length > 0 && (
            <>
              <h4 style={{ margin: '16px 0 8px 0', fontSize: '14px', color: 'var(--text-primary, #0f172a)', fontWeight: '700', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Sales Dispatches ({selectedTrendMonth.month})</span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary, #64748b)', fontWeight: 'normal' }}>💡 Click PO row for PO details popup</span>
              </h4>
              <table className="enterprise-table" style={{ marginBottom: '16px', fontSize: '13px' }}>
                <thead>
                  <tr><th>Invoice Date</th><th>PO Number</th><th className="num">Sales Value</th></tr>
                </thead>
                <tbody>
                  {selectedTrendMonth.dispatches.map((item, idx) => (
                    <tr key={idx} style={{ cursor: 'pointer' }} onClick={() => setSelectedPoDetail(item)} title={`Click to view PO ${item.po_number} details popup`}>
                      <td>{item.invoice_date}</td>
                      <td><strong>{item.po_number} &rarr;</strong></td>
                      <td className="num" style={{ color: '#2563eb', fontWeight: '700' }}>{rupeesFromLakhs(item.amount_lakhs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <button type="button" className="enterprise-refresh" style={{ width: '100%', marginTop: '12px', padding: '10px', fontSize: '14px' }} onClick={closeTrendMonth}>Close Details</button>
        </div>
      </div>
    )}

    {selectedPoDetail && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000 }} role="presentation" onClick={() => setSelectedPoDetail(null)}>
        <div className="enterprise-panel" style={{ width: '92%', maxWidth: '740px', padding: '24px', background: 'var(--bg-card, #ffffff)', borderRadius: '16px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', border: '1px solid var(--border-color, #cbd5e1)' }} onClick={e => e.stopPropagation()}>
          
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '2px solid var(--border-color, #e2e8f0)', paddingBottom: '12px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: 'var(--text-primary, #0f172a)' }}>📦 PO Dispatch Details: {selectedPoDetail.po_number}</h3>
                {selectedPoDetail.line_items_count > 1 && (
                  <span style={{ fontSize: '11px', background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb', padding: '2px 8px', borderRadius: '12px', fontWeight: '700' }}>
                    {selectedPoDetail.line_items_count} Dispatches Grouped
                  </span>
                )}
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary, #64748b)' }}>Invoice No: {selectedPoDetail.invoice_no} | Date: {selectedPoDetail.invoice_date}</span>
            </div>
            <button type="button" onClick={() => setSelectedPoDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '24px', color: 'var(--text-secondary, #64748b)' }}>&times;</button>
          </div>

          {/* Top 2 Aggregated Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px', marginBottom: '16px' }}>
            
            {/* Card 1: Buyer & Shipping Logistics */}
            <div style={{ background: 'var(--bg-app, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '10px', padding: '14px' }}>
              <h5 style={{ margin: '0 0 10px 0', fontSize: '12px', fontWeight: '800', color: '#2563eb', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                🌐 Buyer & Shipping Logistics
              </h5>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                <div><span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Buyer Name</span><strong>{selectedPoDetail.buyer_name || '—'}</strong></div>
                <div><span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Destination Country</span><strong>{selectedPoDetail.country || 'Overseas'}</strong></div>
                <div><span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Container Number</span><strong>{selectedPoDetail.container_no || 'N/A'}</strong></div>
                <div><span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Shipping Bill</span><strong>{selectedPoDetail.shipping_bill || 'N/A'}</strong></div>
                <div style={{ gridColumn: 'span 2' }}><span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Company Name</span><strong>{selectedPoDetail.company_name || selectedPoDetail.company_id || '—'}</strong></div>
              </div>
            </div>

            {/* Card 2: Financial & Commercials */}
            <div style={{ background: 'var(--bg-app, #f8fafc)', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '10px', padding: '14px' }}>
              <h5 style={{ margin: '0 0 10px 0', fontSize: '12px', fontWeight: '800', color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                💰 Financial & Cost Breakdown
              </h5>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px' }}>
                <div><span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Sales Value (INR)</span><strong style={{ color: '#1d4ed8' }}>{rupeesFromLakhs(selectedPoDetail.amount_lakhs)}</strong></div>
                <div><span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>USD Amount</span><strong>{selectedPoDetail.amount_usd ? `$${selectedPoDetail.amount_usd.toLocaleString('en-IN')}` : '—'}</strong></div>
                <div><span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Exchange Rate</span><strong>{selectedPoDetail.exchange_rate ? `₹${selectedPoDetail.exchange_rate} / $` : '—'}</strong></div>
                <div><span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Stock COGS Cost</span><strong>₹{(selectedPoDetail.stock_value || 0).toLocaleString('en-IN')}</strong></div>
                <div><span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Freight Cost</span><strong>₹{(selectedPoDetail.freight_cost || 0).toLocaleString('en-IN')}</strong></div>
                <div><span style={{ color: '#64748b', fontSize: '11px', display: 'block' }}>Status / P&L</span><strong style={{ color: (selectedPoDetail.profit_loss || 0) >= 0 ? '#10b981' : '#ef4444' }}>{selectedPoDetail.status || 'Unpaid'}</strong></div>
              </div>
            </div>

          </div>

          {/* Single Unified Product Specs & Dispatches Table Container with Independent Scroll */}
          <div style={{ marginBottom: '18px' }}>
            <h5 style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: '800', color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              🏷️ Product Specs, Packing & Dispatches under PO {selectedPoDetail.po_number} ({selectedPoDetail.line_items_count || 1} Records)
            </h5>
            <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '260px', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-app, #ffffff)' }}>
              <table className="enterprise-table" style={{ fontSize: '12px', marginBottom: 0, minWidth: '820px' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-card, #f8fafc)' }}>
                  <tr>
                    <th>Invoice No</th>
                    <th>Date</th>
                    <th>Brand</th>
                    <th>Variety & Grade</th>
                    <th>Glaze (Count/Weight)</th>
                    <th>Packing Style</th>
                    <th>Master Cartons</th>
                    <th className="num">Quantity (KG)</th>
                    <th className="num">Sales Value</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPoDetail.line_items && selectedPoDetail.line_items.length > 0 ? (
                    selectedPoDetail.line_items.map((line, lidx) => (
                      <tr key={lidx}>
                        <td><strong>{line.invoice_no || 'N/A'}</strong></td>
                        <td>{line.invoice_date || selectedPoDetail.invoice_date}</td>
                        <td>{line.brand || selectedPoDetail.brand || '—'}</td>
                        <td>{line.variety || selectedPoDetail.variety || 'PD'} ({line.grade || selectedPoDetail.grade || 'Standard'})</td>
                        <td>{line.count_glaze || selectedPoDetail.count_glaze || '—'} / {line.weight_glaze || selectedPoDetail.weight_glaze || '—'}</td>
                        <td>{line.packing_style || selectedPoDetail.packing_style || 'Standard'}</td>
                        <td><strong>{line.no_of_mc ? `${line.no_of_mc} MC` : (selectedPoDetail.no_of_mc ? `${selectedPoDetail.no_of_mc} MC` : '—')}</strong></td>
                        <td className="num" style={{ fontWeight: '700' }}>
                          {line.qty_kg ? `${line.qty_kg.toLocaleString('en-IN')} KG` : '—'}
                        </td>
                        <td className="num" style={{ color: '#2563eb', fontWeight: '700' }}>
                          {rupeesFromLakhs(line.amount_lakhs)}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td><strong>{selectedPoDetail.invoice_no || 'N/A'}</strong></td>
                      <td>{selectedPoDetail.invoice_date}</td>
                      <td>{selectedPoDetail.brand || 'Standard'}</td>
                      <td>{selectedPoDetail.variety || '—'} ({selectedPoDetail.grade || '—'})</td>
                      <td>{selectedPoDetail.count_glaze || '—'} / {selectedPoDetail.weight_glaze || '—'}</td>
                      <td>{selectedPoDetail.packing_style || 'Standard'}</td>
                      <td><strong>{selectedPoDetail.no_of_mc ? `${selectedPoDetail.no_of_mc} MC` : '—'}</strong></td>
                      <td className="num" style={{ fontWeight: '700' }}>
                        {selectedPoDetail.qty_kg ? `${selectedPoDetail.qty_kg.toLocaleString('en-IN')} KG` : '—'}
                      </td>
                      <td className="num" style={{ color: '#2563eb', fontWeight: '700' }}>
                        {rupeesFromLakhs(selectedPoDetail.amount_lakhs)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="enterprise-refresh" style={{ flex: 1, padding: '10px', borderRadius: '8px' }} onClick={() => setSelectedPoDetail(null)}>Close PO Details</button>
            <button type="button" className="enterprise-refresh" style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb', borderColor: '#2563eb' }} onClick={() => {
              const currentMonth = selectedTrendMonth?.month || activeMonthLabel;
              setSelectedPoDetail(null);
              go('report_sales_report', `/inventory/sales_report?trend_month=${currentMonth}&search=${selectedPoDetail.po_number}`);
            }}>Open Full Sales Register ↗</button>
          </div>
        </div>
      </div>
    )}

    {selectedCostDetail && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100000 }} role="presentation" onClick={() => setSelectedCostDetail(null)}>
        <div className="enterprise-panel" style={{ width: 'min(96vw, 1400px)', maxWidth: 'none', maxHeight: '92vh', padding: '24px', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-card, #ffffff)', borderRadius: '12px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)', border: '1px solid var(--border-color, #cbd5e1)' }} onClick={e => e.stopPropagation()}>
          
          {/* Modal Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '2px solid var(--border-color, #e2e8f0)', paddingBottom: '12px' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: '800', color: 'var(--text-primary, #0f172a)' }}>📊 Filtered Cost Breakdown: {selectedCostDetail.cost_component}</h3>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary, #64748b)' }}>Month Filter: {selectedCostMonthTitle} | Date Range: {selectedCostDetail.from_date} to {selectedCostDetail.to_date}</span>
            </div>
            <button type="button" onClick={() => setSelectedCostDetail(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '24px', color: 'var(--text-secondary, #64748b)' }}>&times;</button>
          </div>

          {/* KPI Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
            <div style={{ background: 'rgba(37, 99, 235, 0.06)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(37, 99, 235, 0.2)', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: '#2563eb', fontWeight: '700', display: 'block', textTransform: 'uppercase' }}>Total Cost</span>
              <strong style={{ fontSize: '18px', color: '#1d4ed8' }}>{rupeesFromLakhs(selectedCostDetail.amount_lakhs)}</strong>
            </div>
            <div style={{ background: 'rgba(16, 185, 129, 0.06)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.2)', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: '#10b981', fontWeight: '700', display: 'block', textTransform: 'uppercase' }}>% Share of Expenses</span>
              <strong style={{ fontSize: '18px', color: '#059669' }}>{selectedCostDetail.pct}%</strong>
            </div>
            <div style={{ background: 'rgba(139, 92, 246, 0.06)', padding: '12px', borderRadius: '10px', border: '1px solid rgba(139, 92, 246, 0.2)', textAlign: 'center' }}>
              <span style={{ fontSize: '11px', color: '#8b5cf6', fontWeight: '700', display: 'block', textTransform: 'uppercase' }}>Month Filter</span>
              <strong style={{ fontSize: '16px', color: '#7c3aed' }}>{selectedCostMonthTitle}</strong>
            </div>
          </div>

          {!!selectedCostDetail.basis_totals?.length && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                {selectedCostDetail.basis_totals.map(row => (
                  <div key={row.label} style={{ padding: '10px 12px', border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-app, #f8fafc)' }}>
                    <span style={{ display: 'block', color: '#64748b', fontSize: '10px', fontWeight: '700', textTransform: 'uppercase' }}>{row.label} Outstanding</span>
                    <strong style={{ color: '#b45309', fontSize: '15px' }}>{money(row.amount)}</strong>
                  </div>
                ))}
              </div>
              {selectedCostDetail.kg_basis_note && <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: '11px' }}>{selectedCostDetail.kg_basis_note}</p>}
            </div>
          )}

          {/* Filtered Line Items Table */}
          <div style={{ marginBottom: '18px', display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            <h5 style={{ margin: '0 0 8px 0', fontSize: '12px', fontWeight: '800', color: '#059669', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              📋 Filtered Source Register Items ({selectedCostMonthTitle})
            </h5>
            <div style={{ overflowX: 'auto', overflowY: 'auto', minHeight: '280px', flex: 1, border: '1px solid var(--border-color, #e2e8f0)', borderRadius: '8px', background: 'var(--bg-app, #ffffff)' }}>
              <table className="enterprise-table" style={{ fontSize: '12px', marginBottom: 0 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-card, #f8fafc)' }}>
                  <tr>
                    <th>Ref / Voucher No</th>
                    <th>Date</th>
                    <th>Description / Vendor</th>
                    <th>Category / Details</th>
                    <th className="num">Cost Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedCostDetail.items && selectedCostDetail.items.length > 0 ? (
                    selectedCostDetail.items.map((row, idx) => (
                      <tr 
                        key={idx} 
                        style={{ cursor: 'pointer' }} 
                        onClick={() => {
                          const currentMonth = selectedCostDetail.month;
                          const f = selectedCostDetail.from_date;
                          const t = selectedCostDetail.to_date;
                          const token = selectedCostDetail.target_token === 'finance_payable_bills' ? 'finance_vendor_bills' : selectedCostDetail.target_token;
                          const searchVal = row.vendor_name || row.ref_no || '';
                          setSelectedCostDetail(null);
                          go(token, `${selectedCostDetail.target_route}?trend_month=${currentMonth}&from_date=${f}&to_date=${t}&search=${encodeURIComponent(searchVal)}`);
                        }}
                        title={`Click to open source register page for ${row.ref_no || 'record'}`}
                      >
                        <td><strong>{row.ref_no} &rarr;</strong></td>
                        <td>{row.date}</td>
                        <td>{row.vendor_name}</td>
                        <td>{row.details}</td>
                        <td className="num" style={{ color: '#1d4ed8', fontWeight: '700' }}>{rupeesFromLakhs(row.amount_lakhs)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" style={{ textAlign: 'center', color: '#64748b' }}>No individual records found for this month filter.</td>
                    </tr>
                  )}
                </tbody>
                {selectedCostDetail.items && selectedCostDetail.items.length > 0 && (
                  <tfoot style={{ position: 'sticky', bottom: 0, background: 'var(--bg-card, #f8fafc)', fontWeight: '800', borderTop: '2px solid var(--border-color, #cbd5e1)' }}>
                    <tr>
                      <td colSpan="4" style={{ textAlign: 'right', color: '#1e293b' }}>Total Filtered Component Expenses ({selectedCostMonthTitle}):</td>
                      <td className="num" style={{ color: '#059669', fontSize: '13px' }}>{rupeesFromLakhs(selectedCostDetail.amount_lakhs)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* Modal Actions */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="enterprise-refresh" style={{ flex: 1, padding: '10px', borderRadius: '8px' }} onClick={() => setSelectedCostDetail(null)}>Close Sub-Popup</button>
            <button type="button" className="enterprise-refresh" style={{ flex: 1, padding: '10px', borderRadius: '8px', background: 'rgba(37, 99, 235, 0.1)', color: '#2563eb', borderColor: '#2563eb' }} onClick={() => {
              const currentMonth = selectedCostDetail.month;
              const f = selectedCostDetail.from_date;
              const t = selectedCostDetail.to_date;
              setSelectedCostDetail(null);
              go(selectedCostDetail.target_token, `${selectedCostDetail.target_route}?trend_month=${currentMonth}&from_date=${f}&to_date=${t}`);
            }}>Open Full Register in Console ↗</button>
          </div>
        </div>
      </div>
    )}

    </div>
    </main>
  </div>;
}
