import { useMemo, useState } from 'react';
import {
  ReportHeader, FilterBar, FilterBox, FilterSelect, FilterInput,
  KPIGrid, KPICard, Loader, ErrorBox, SearchInput, EmptyRow,
  useReport, fmt,
} from './ReportShell';

const productHeaders = [
  'Batch No', 'Type of Prod', 'Location', 'Brand', 'Freezer', 'Packing Style',
  'Glaze', 'Variety', 'Grade', 'Species', 'MC', 'Loose', 'Quantity (KG)',
  'Purpose/PO', 'Prod At', 'Prod For',
];

export default function StorageCostReport({ activeRoute }) {
  const [activeTab, setActiveTab] = useState('summary');
  const [prodFor, setProdFor] = useState('');
  const [prodAt, setProdAt] = useState('');
  const [freezer, setFreezer] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [search, setSearch] = useState('');

  const params = {
    ...(prodFor ? { production_for: prodFor } : {}),
    ...(prodAt ? { production_at: prodAt } : {}),
    ...(freezer ? { freezer } : {}),
    ...(selectedMonth ? { selected_month: selectedMonth } : {}),
  };
  const { data, loading, error, reload } = useReport({
    url: activeRoute || '/reports/storage_cost_report',
    params,
    deps: [prodFor, prodAt, freezer, selectedMonth],
  });

  const reportRows = useMemo(() => data?.report_data || [], [data?.report_data]);
  const visibleRows = useMemo(() => reportRows.filter(row => {
    if (!search) return true;
    return JSON.stringify(row).toLowerCase().includes(search.toLowerCase());
  }), [reportRows, search]);
  const originalRows = useMemo(() => visibleRows.flatMap(row =>
    (row.this_month_ledger || []).map(movement => ({ ...movement, batch_number: row.batch_number }))
  ), [visibleRows]);
  const availableRows = data?.available_stock_items || [];
  const dispatchRows = data?.dispatches_this_month || [];

  const totalHolding = visibleRows.reduce((sum, row) => sum + Number(row.holding_cost || 0), 0);
  const totalProduction = visibleRows.reduce((sum, row) => sum + Number(row.payable_amount || 0), 0);
  const totalClosingMc = visibleRows.reduce((sum, row) => sum + Number(row.closing_mc || 0), 0);

  const tabs = [
    ['summary', '1. Consolidated Summary'],
    ['original', '2. Detailed Original Entries'],
    ['bill', '3. Monthly Bill'],
  ];

  const ProductCells = ({ row, details = row.details || row }) => <>
    <td style={{ fontWeight: 800 }}>{row.batch_number}</td>
    <td>{details.type_of_production}</td><td>{details.location}</td><td>{row.brand ?? details.brand}</td>
    <td>{row.freezer ?? details.freezer}</td><td>{row.packing_style ?? details.packing_style}</td>
    <td>{row.glaze ?? details.glaze}</td><td>{row.variety ?? details.variety}</td>
    <td>{row.grade ?? details.grade}</td><td>{row.species ?? details.species}</td>
    <td className="text-right">{fmt.number(details.no_of_mc)}</td><td className="text-right">{fmt.number(details.loose)}</td>
    <td className="text-right">{fmt.number(details.quantity)}</td><td>{details.po_number || details.purpose}</td>
    <td>{row.production_at ?? details.production_at}</td><td>{row.production_for ?? details.production_for}</td>
  </>;

  return <div className="report-viewer-card">
    <ReportHeader title="Cold Storage Cost Report" loading={loading} onReload={reload} onPrint={() => window.print()} />
    <FilterBar>
      <FilterBox label="Billing Month"><FilterInput type="month" value={selectedMonth} onChange={setSelectedMonth} /></FilterBox>
      <FilterBox label="Production For"><FilterSelect value={prodFor} onChange={setProdFor}><option value="">ALL CLIENTS</option>{(data?.production_for_list || []).map(v => <option key={v} value={v}>{v}</option>)}</FilterSelect></FilterBox>
      <FilterBox label="Production At"><FilterSelect value={prodAt} onChange={setProdAt}><option value="">ALL LOCATIONS</option>{(data?.production_at_list || []).map(v => <option key={v} value={v}>{v}</option>)}</FilterSelect></FilterBox>
      <FilterBox label="Freezer"><FilterSelect value={freezer} onChange={setFreezer}><option value="">ALL FREEZERS</option>{(data?.freezers || []).map(v => <option key={v} value={v}>{v}</option>)}</FilterSelect></FilterBox>
      <FilterBox label="Search"><SearchInput value={search} onChange={setSearch} /></FilterBox>
    </FilterBar>

    {loading && <Loader />}{error && <ErrorBox msg={error} onRetry={reload} />}
    {!loading && !error && <>
      <KPIGrid>
        <KPICard label="Closing Stock" value={`${fmt.number(totalClosingMc)} MC`} accent="var(--corp-dash)" />
        <KPICard label="Holding Cost" value={fmt.currency(totalHolding)} accent="#d97706" />
        <KPICard label="Production Cost" value={fmt.currency(totalProduction)} accent="#2563eb" />
        <KPICard label="Grand Total" value={fmt.currency(totalHolding + totalProduction)} accent="#059669" />
      </KPIGrid>
      <div style={{ display: 'flex', gap: 8, margin: '8px 0', overflowX: 'auto' }}>
        {tabs.map(([key, label]) => <button key={key} type="button" className={`btn ${activeTab === key ? 'btn-primary' : ''}`} onClick={() => setActiveTab(key)} style={{ whiteSpace: 'nowrap' }}>{label}</button>)}
      </div>

      {activeTab === 'summary' && <div className="table-responsive"><table className="bknr-table" style={{ minWidth: 2800 }}>
        <thead><tr>{productHeaders.map(h => <th key={h}>{h}</th>)}<th>Opening MC</th><th>Month IN</th><th>Month OUT</th><th>Closing MC</th><th>Rate/MC/Day</th><th>Total Days</th><th>Free Days</th><th>Payable Days</th><th>Holding Cost ₹</th><th>Prod Cost/KG</th><th>Production Cost ₹</th><th>Total Cost ₹</th></tr></thead>
        <tbody>{visibleRows.length === 0 ? <EmptyRow cols={28} /> : visibleRows.map((row, index) => <tr key={`${row.batch_number}-${index}`}><ProductCells row={row} /><td>{fmt.number(row.opening_mc)}</td><td>{fmt.number(row.monthly_in_mc)}</td><td>{fmt.number(row.monthly_out_mc)}</td><td>{fmt.number(row.closing_mc)}</td><td>{fmt.currency(row.holding_cost_per_mc_day)}</td><td>{row.total_days}</td><td>{row.free_days_tm}</td><td>{row.payable_days}</td><td>{fmt.currency(row.holding_cost)}</td><td>{fmt.currency(row.production_cost_per_kg)}</td><td>{fmt.currency(row.payable_amount)}</td><td>{fmt.currency(Number(row.holding_cost || 0) + Number(row.payable_amount || 0))}</td></tr>)}</tbody>
      </table></div>}

      {activeTab === 'original' && <div className="table-responsive"><table className="bknr-table" style={{ minWidth: 1900 }}>
        <thead><tr><th>Date</th><th>Movement</th>{productHeaders.map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{originalRows.length === 0 ? <EmptyRow cols={18} /> : originalRows.map((row, index) => <tr key={`${row.batch_number}-${row.date}-${index}`}><td>{row.date}</td><td>{row.cargo_movement_type}</td><ProductCells row={row} details={row} /></tr>)}</tbody>
      </table></div>}

      {activeTab === 'bill' && <div className="card" style={{ marginTop: 0 }}>
        {!prodFor && <div className="error-box">Select Production For to generate the monthly bill.</div>}
        <h3>Active Available Stock</h3>
        <div className="table-responsive"><table className="bknr-table" style={{ minWidth: 1500 }}><thead><tr><th>Batch No</th><th>In Date</th><th>Details (Variety / Grade)</th><th>Available MC</th><th>Available Qty (KG)</th><th>Storage Rate</th><th>Total Days</th><th>Free Days</th><th>Payable Days</th><th>Holding Cost (₹)</th><th>Prod Rate/KG</th><th>Production Cost (₹)</th><th>Total (₹)</th></tr></thead><tbody>{availableRows.length === 0 ? <EmptyRow cols={13} /> : availableRows.map((r, i) => <tr key={`${r.batch_number}-${i}`}><td>{r.batch_number}</td><td>{r.in_date}</td><td>{[r.variety, r.grade, r.freezer].filter(Boolean).join(' / ')}</td><td>{r.available_mc}</td><td>{fmt.number(r.qty_kg)}</td><td>{fmt.currency(r.holding_cost_per_mc_day)}</td><td>{r.total_days}</td><td>{r.free_days_tm}</td><td>{r.payable_days}</td><td>{fmt.currency(r.holding_cost)}</td><td>{fmt.currency(r.production_cost_per_kg)}</td><td>{fmt.currency(r.payable_amount)}</td><td>{fmt.currency(Number(r.holding_cost || 0) + Number(r.payable_amount || 0))}</td></tr>)}</tbody></table></div>
        <h3 style={{ marginTop: 18 }}>Dispatched Stock (This Month)</h3>
        <div className="table-responsive"><table className="bknr-table" style={{ minWidth: 1300 }}><thead><tr><th>Batch No</th><th>In Date</th><th>Out Date</th><th>Details (Variety / Grade)</th><th>Dispatched MC</th><th>Dispatched Qty (KG)</th><th>Total Days</th><th>Free Days</th><th>Payable Days</th><th>Storage Rate</th><th>Holding Cost (₹)</th></tr></thead><tbody>{dispatchRows.length === 0 ? <EmptyRow cols={11} /> : dispatchRows.map((r, i) => <tr key={`${r.batch_number}-${i}`}><td>{r.batch_number}</td><td>{r.in_date}</td><td>{r.out_date}</td><td>{[r.variety, r.grade, r.freezer].filter(Boolean).join(' / ')}</td><td>{r.mc_dispatched}</td><td>{fmt.number(r.qty_kg)}</td><td>{r.total_days}</td><td>{r.free_days_tm}</td><td>{r.payable_days}</td><td>{fmt.currency(r.holding_cost_per_mc_day)}</td><td>{fmt.currency(r.holding_cost)}</td></tr>)}</tbody></table></div>
      </div>}
    </>}
  </div>;
}
