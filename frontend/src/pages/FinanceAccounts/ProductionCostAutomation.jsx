import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  RefreshCw,
  X,
} from 'lucide-react';
import '../Attendance/Attendance.css';

const currency = value => `₹${Number(value || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const number = value => Number(value || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function KpiCard({ label, value, emphasis = false, onClick }) {
  return (
    <div
      className="attendance-card"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={event => event.key === 'Enter' && onClick?.()}
      style={{ padding: 14, border: '1px solid var(--att-border)', borderRadius: 8, minWidth: 0, cursor: 'pointer' }}
    >
      <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--att-muted)', textTransform: 'uppercase', letterSpacing: '.45px' }}>
        {label}
      </div>
      <div style={{ marginTop: 7, fontSize: 17, lineHeight: 1.2, fontWeight: 800, color: emphasis ? 'var(--att-accent)' : 'var(--att-heading)' }}>{value}</div>
    </div>
  );
}

export default function ProductionCostAutomation() {
  const [comparison, setComparison] = useState(null);
  const [locations, setLocations] = useState([]);
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [drill, setDrill] = useState(null);

  const loadComparison = useCallback(async signal => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams();
      if (location) query.set('production_at', location);
      const response = await fetch(
        `/finance_accounts/production_cost_allocation/automation-comparison?${query}`,
        { credentials: 'include', signal },
      );
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || 'Unable to calculate production cost.');
      }
      setComparison(payload.comparison);
      setLocations(payload.locations || []);
    } catch (requestError) {
      if (requestError.name !== 'AbortError') {
        setError(requestError.message || 'Unable to calculate production cost.');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [location]);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(() => loadComparison(controller.signal));
    return () => controller.abort();
  }, [loadComparison, reloadKey]);

  const today = comparison?.today;
  const todayRows = today?.allocations || [];
  const lastMonthAverage = comparison?.last_month?.weighted_average_cost_per_kg || 0;
  const commonTransactions = useMemo(
    () => Object.values(today?.common_costs || {}).reduce((sum, value) => sum + Number(value || 0), 0),
    [today],
  );
  const chemicalTransactions = useMemo(
    () => Object.values(today?.chemical_costs || {}).reduce((sum, value) => sum + Number(value || 0), 0),
    [today],
  );
  const openDrill = (title, period, mode = 'cost') => setDrill({ title, period, mode });

  const drillRows = useMemo(() => {
    if (!drill?.period) return [];
    const period = drill.period;
    const sources = period.source_details || {};
    if (drill.mode === 'production') {
      return (sources.production || []).map(row => ({
        type: 'Stock Entry IN', date: row.production_date, reference: row.batch_number,
        details: [row.po_number, row.variety, row.grade].filter(Boolean).join(' / '),
        quantity: row.weight_kg, amount: null,
      }));
    }
    if (drill.mode === 'electricity') {
      return (sources.electricity || []).map(row => ({
        type: 'Electricity', date: row.date, reference: `Bill #${row.id}`,
        details: 'Daily electricity bill', quantity: null, amount: row.amount,
      }));
    }
    if (drill.mode === 'cost') {
      const commonLabels = {
        salary_cost: 'Salary', electricity_cost: 'Electricity', diesel_cost: 'Diesel',
        other_expense_cost: 'Other Expenses', other_consumables_cost: 'Other Consumables',
      };
      const summary = period.period_cost_summary || {};
      const rows = Object.entries(period.common_costs || {}).map(([key, amount]) => ({
        type: commonLabels[key] || key, date: `${period.period_start} to ${period.period_end}`,
        reference: period.period_label, details: 'Period expense', quantity: null, amount,
      }));
      rows.push(
        { type: 'Carton', date: `${period.period_start} to ${period.period_end}`, reference: period.period_label, details: period.temporary_carton_cost_per_kg ? `Fixed ${currency(period.temporary_carton_cost_per_kg)}/KG` : 'Actual period carton consumption', quantity: null, amount: summary.applied_carton_expense },
        { type: 'Chemical', date: `${period.period_start} to ${period.period_end}`, reference: period.period_label, details: 'Period chemical consumption', quantity: null, amount: summary.chemical_expense },
        { type: 'TOTAL', date: `${period.period_start} to ${period.period_end}`, reference: period.period_label, details: 'Total expenses ÷ period quantity', quantity: period.total_output_weight_kg, rate: summary.cost_per_kg, amount: summary.total_expense },
      );
      return rows;
    }
    return [
      ...(sources.salary || []).map(row => ({ type: 'Salary', date: row.month, reference: row.employee, details: 'Accrued payroll', quantity: null, amount: row.amount })),
      ...(sources.electricity || []).map(row => ({ type: 'Electricity', date: row.date, reference: `Bill #${row.id}`, details: 'Daily electricity bill', quantity: null, amount: row.amount })),
      ...(sources.diesel || []).map(row => ({ type: 'Diesel', date: row.date, reference: `OUT #${row.id}`, details: `${number(row.quantity)} L`, quantity: row.quantity, amount: row.amount })),
      ...(sources.other_expenses || []).map(row => ({ type: 'Other Expense', date: row.date, reference: `Expense #${row.id}`, details: row.category, quantity: null, amount: row.amount })),
      ...(sources.consumables || []).map(row => ({ type: row.category, date: row.date, reference: row.po_number, details: row.item, quantity: row.quantity, amount: row.amount })),
    ];
  }, [drill]);

  return (
    <div className="attendance-container" style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0, padding: 0, overflow: 'hidden' }}>
      <div className="attendance-page-header" style={{ flex: '0 0 auto', margin: 0, padding: '16px 24px', borderBottom: '1px solid var(--att-border)', background: 'var(--att-card)' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, fontSize: 18 }}>
            <Calculator size={20} /> Production Cost Automation
          </h1>
          <p style={{ color: 'var(--att-muted)', fontSize: 11, margin: '4px 0 0' }}>
            Today uses only today&apos;s posted transactions and production. Yesterday is not carried forward.
          </p>
        </div>
        <button className="attendance-btn attendance-btn-primary" type="button" onClick={() => setReloadKey(key => key + 1)} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
        </button>
      </div>

      <div style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', padding: '16px 24px 48px', background: 'var(--att-bg)', overscrollBehavior: 'contain' }}>
        <div className="attendance-filters-bar" style={{ marginBottom: 10 }}>
          <div className="attendance-filter-group">
            <label>Calculation Date</label>
            <input className="attendance-input" type="date" value={comparison?.as_of_date || ''} readOnly />
          </div>
          <div className="attendance-filter-group">
            <label>Production Location</label>
            <select className="attendance-select" value={location} onChange={event => setLocation(event.target.value)}>
              <option value="">All Locations</option>
              {locations.map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <div style={{ color: 'var(--att-muted)', fontSize: 10, paddingBottom: 6, whiteSpace: 'nowrap' }}>
            Fixed carton rate today: <strong style={{ color: 'var(--att-heading)' }}>₹5.00/KG</strong>
          </div>
        </div>

        {error && (
          <div className="attendance-card" style={{ marginBottom: 10, padding: 10, border: '1px solid var(--att-danger)', color: 'var(--att-danger)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <AlertTriangle size={16} /> {error}
          </div>
        )}

        <div className="attendance-form-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginBottom: 10 }}>
          <KpiCard label="Today's Production Weight" value={`${number(today?.total_output_weight_kg)} KG`} onClick={() => openDrill("Today's Production Weight", today, 'production')} />
          <KpiCard label="Today's Transactions" value={currency(commonTransactions + chemicalTransactions)} onClick={() => openDrill("Today's Transactions", today, 'transactions')} />
          <KpiCard label="Today's Electricity" value={currency(today?.common_costs?.electricity_cost)} onClick={() => openDrill("Today's Electricity", today, 'electricity')} />
          <KpiCard label="Today Cost/KG" value={currency(today?.weighted_average_cost_per_kg)} emphasis onClick={() => openDrill('Today Product Cost', today, 'cost')} />
          <KpiCard label="Last Month Avg/KG" value={currency(lastMonthAverage)} onClick={() => openDrill('Last Month Product Cost', comparison?.last_month, 'cost')} />
          <KpiCard label="This Month Avg/KG" value={currency(comparison?.this_month?.weighted_average_cost_per_kg)} onClick={() => openDrill('This Month Product Cost', comparison?.this_month, 'cost')} />
          <KpiCard label="Year Average/KG" value={currency(comparison?.year?.weighted_average_cost_per_kg)} onClick={() => openDrill('Year Product Cost', comparison?.year, 'cost')} />
        </div>

        <div className="attendance-table-container" style={{ margin: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 14px', borderBottom: '1px solid var(--att-border)' }}>
            <strong style={{ fontSize: 12 }}>Today&apos;s Product Cost Breakdown</strong>
            <span className={`attendance-badge ${today?.status === 'READY' ? 'attendance-badge-present' : 'attendance-badge-absent'}`}>{today?.status || (loading ? 'LOADING' : 'INCOMPLETE')}</span>
          </div>
          <div className="attendance-table-wrapper">
          <table className="attendance-table" style={{ minWidth: 1250 }}>
            <thead>
              <tr>
                <th>Sl</th><th>Batch</th><th>PO Number</th><th>Variety</th><th>Grade</th>
                <th className="text-right">Stock Entry Qty KG</th><th className="text-right">Common/KG</th>
                <th className="text-right">Carton/KG</th><th className="text-right">Chemical/KG</th>
                <th className="text-right">Today Production Cost/KG</th><th className="text-right">Last Month Avg/KG</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan="11" className="text-center">Calculating today&apos;s production cost...</td></tr>}
              {!loading && todayRows.length === 0 && <tr><td colSpan="11" className="text-center">No eligible finished production found today.</td></tr>}
              {!loading && todayRows.map((row, index) => (
                <tr key={`${row.batch_number || 'batch'}-${row.po_number || 'po'}-${row.variety || 'variety'}-${row.grade || 'grade'}-${index}`}>
                  <td>{index + 1}</td><td>{row.batch_number || '-'}</td><td>{row.po_number || 'COMMON'}</td>
                  <td>{row.variety || '-'}</td><td>{row.grade || '-'}</td>
                  <td className="text-right">{number(row.weight_kg)}</td>
                  <td className="text-right">{currency(row.common_cost_per_kg)}</td>
                  <td className="text-right">{currency(row.temporary_carton_cost_per_kg)}</td>
                  <td className="text-right">{currency(row.chemical_cost_per_kg)}</td>
                  <td className="text-right" style={{ fontWeight: 800 }}>{currency(row.production_cost_per_kg)}</td>
                  <td className="text-right">{currency(lastMonthAverage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </div>

      {drill && (
        <div className="attendance-modal-overlay" onMouseDown={event => event.target === event.currentTarget && setDrill(null)}>
          <div className="attendance-modal-content">
            <div className="attendance-modal-header">
              <div>
                <h2>{drill.title}</h2>
                <div style={{ marginTop: 3, fontSize: 10, color: 'var(--att-muted)' }}>
                  {drill.period?.period_start || '-'} to {drill.period?.period_end || '-'}
                </div>
              </div>
              <button className="attendance-modal-close-btn" type="button" onClick={() => setDrill(null)} aria-label="Close details"><X size={18} /></button>
            </div>
            <div className="attendance-modal-body">
              <div className="attendance-table-container" style={{ margin: 0 }}>
                <div className="attendance-table-wrapper">
                  <table className="attendance-table">
                    <thead><tr><th>Sl</th><th>Type</th><th>Date</th><th>Reference</th><th>Details</th><th style={{ textAlign: 'right' }}>Quantity</th><th style={{ textAlign: 'right' }}>Rate/KG</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                    <tbody>
                      {drillRows.length === 0 && <tr><td colSpan="8" style={{ textAlign: 'center' }}>No source data is available for this KPI.</td></tr>}
                      {drillRows.map((row, index) => (
                        <tr key={`${row.type}-${row.reference}-${index}`}>
                          <td>{index + 1}</td><td>{row.type}</td><td>{row.date || '-'}</td><td>{row.reference || '-'}</td><td>{row.details || '-'}</td>
                          <td style={{ textAlign: 'right' }}>{row.quantity == null ? '-' : number(row.quantity)}</td>
                          <td style={{ textAlign: 'right' }}>{row.rate == null ? '-' : currency(row.rate)}</td>
                          <td style={{ textAlign: 'right' }}>{row.amount == null ? '-' : currency(row.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
