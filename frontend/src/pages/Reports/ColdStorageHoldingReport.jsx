import { useMemo, useState } from 'react';
import {
  ReportHeader, FilterBar, FilterBox, FilterSelect, FilterInput,
  KPIGrid, KPICard, Loader, ErrorBox, SearchInput, EmptyRow,
  useReport, fmt,
} from './ReportShell';

const signed = (row, field) => (String(row.cargo_movement_type || '').toUpperCase() === 'OUT' ? -1 : 1) * Number(row[field] || 0);

export default function ColdStorageHoldingReport({ activeRoute }) {
  const [fromDate, setFrom] = useState('');
  const [toDate, setTo] = useState('');
  const [view, setView] = useState('summary');
  const [csFilter, setCsFilter] = useState('');
  const [prodFilter, setProdFilter] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState('');
  const [search, setSearch] = useState('');
  const [billMonth, setBillMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [todayEpoch] = useState(() => Date.now());

  const { data, loading, error, reload } = useReport({
    url: activeRoute,
    // Keep the full movement set in memory. The native template also applies
    // date filters client-side so its monthly bill can still see opening stock.
    params: {},
    deps: [],
  });
  const rawRows = useMemo(() => data?.rows || [], [data?.rows]);
  const rows = rawRows.filter(row => {
    if (fromDate && row.in_date < fromDate) return false;
    if (toDate && row.in_date > toDate) return false;
    if (csFilter && row.cold_storage_name !== csFilter) return false;
    if (prodFilter && row.production_for !== prodFilter) return false;
    if (speciesFilter && row.species !== speciesFilter) return false;
    return !search || JSON.stringify(row).toLowerCase().includes(search.toLowerCase());
  });

  const stockRows = useMemo(() => {
    const fields = ['cold_storage_name', 'batch_number', 'species', 'variety', 'brand', 'grade', 'freezer', 'packing_style', 'glaze'];
    const map = new Map();
    rows.forEach(row => {
      const key = fields.map(field => String(row[field] ?? '').trim()).join('\u001f');
      const item = map.get(key) || { ...row, balance_mc: 0, balance_loose: 0, balance_qty: 0, valuation: 0, holding_cost: 0, other_charges: 0, total_payable: 0 };
      item.balance_mc += signed(row, 'no_of_mc'); item.balance_loose += signed(row, 'loose'); item.balance_qty += signed(row, 'quantity');
      item.valuation += Number(row.inventory_value || 0); item.holding_cost += Number(row.holding_cost || 0);
      item.other_charges += Number(row.other_charges || 0); item.total_payable += Number(row.total_payable || 0);
      map.set(key, item);
    });
    return [...map.values()].filter(row => Math.abs(row.balance_qty) > 0.0001 || row.balance_mc !== 0 || row.balance_loose !== 0);
  }, [rows]);

  const summaryRows = useMemo(() => {
    const fields = ['production_for', 'production_at', 'freezer', 'packing_style', 'variety', 'glaze', 'grade'];
    const map = new Map();
    stockRows.forEach(row => {
      const key = fields.map(field => String(row[field] ?? '').trim()).join('\u001f');
      const item = map.get(key) || { ...row, total_mc: 0, total_loose: 0, total_qty: 0, valuation: 0, oldest_date: row.in_date };
      item.total_mc += Number(row.balance_mc || 0); item.total_loose += Number(row.balance_loose || 0);
      item.total_qty += Number(row.balance_qty || 0); item.valuation += Number(row.valuation || 0);
      if (row.in_date && (!item.oldest_date || row.in_date < item.oldest_date)) item.oldest_date = row.in_date;
      map.set(key, item);
    });
    return [...map.values()].map(item => ({ ...item, age_days: item.oldest_date ? Math.max(0, Math.floor((todayEpoch - new Date(item.oldest_date).getTime()) / 86400000)) : 0 }));
  }, [stockRows, todayEpoch]);

  const csList = [...new Set(rawRows.map(r => r.cold_storage_name).filter(Boolean))].sort();
  const prodList = [...new Set(rawRows.map(r => r.production_for).filter(Boolean))].sort();
  const speciesList = [...new Set(rawRows.map(r => r.species).filter(Boolean))].sort();
  const totalIn = rows.filter(r => String(r.cargo_movement_type).toUpperCase() === 'IN').reduce((s, r) => s + Number(r.no_of_mc || 0), 0);
  const totalOut = rows.filter(r => String(r.cargo_movement_type).toUpperCase() === 'OUT').reduce((s, r) => s + Number(r.no_of_mc || 0), 0);
  const totalValue = stockRows.reduce((s, r) => s + Number(r.valuation || 0), 0);

  const billBlocks = useMemo(() => {
    if (!billMonth) return [];
    const [year, month] = billMonth.split('-').map(Number);
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);
    const source = rawRows.filter(row => {
      if (csFilter && row.cold_storage_name !== csFilter) return false;
      if (prodFilter && row.production_for !== prodFilter) return false;
      if (speciesFilter && row.species !== speciesFilter) return false;
      return !search || JSON.stringify(row).toLowerCase().includes(search.toLowerCase());
    });
    const stores = new Map();
    source.forEach(row => {
      const name = row.cold_storage_name || 'Unknown';
      if (!stores.has(name)) stores.set(name, []);
      stores.get(name).push(row);
    });
    const parse = value => value ? new Date(`${value}T00:00:00`) : null;
    const billingRow = (row, opening) => {
      const inDate = parse(row.in_date);
      const days = opening ? monthEnd.getDate() : Math.max(1, Math.floor((monthEnd - inDate) / 86400000) + 1);
      const mc = Number(row.no_of_mc || 0);
      const rate = Number(row.storage_rate_per_mc || 0);
      const holdingCost = String(row.rent_type || 'DAILY').toUpperCase() === 'MONTHLY' ? mc * rate : mc * rate * days;
      const otherCharges = opening ? 0 : Number(row.other_charges || 0);
      return { ...row, days, holdingCost, otherCharges, rowTotal: holdingCost + otherCharges };
    };
    return [...stores.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([store, storeRows]) => {
      const openingRows = storeRows.filter(row => String(row.cargo_movement_type).toUpperCase() === 'IN' && parse(row.in_date) < monthStart).map(row => billingRow(row, true));
      const inRows = storeRows.filter(row => { const d = parse(row.in_date); return String(row.cargo_movement_type).toUpperCase() === 'IN' && d >= monthStart && d <= monthEnd; }).map(row => billingRow(row, false));
      const outRows = storeRows.filter(row => { const d = parse(row.in_date); return String(row.cargo_movement_type).toUpperCase() === 'OUT' && d >= monthStart && d <= monthEnd; });
      const openingMc = openingRows.reduce((sum, row) => sum + Number(row.no_of_mc || 0), 0);
      const inMc = inRows.reduce((sum, row) => sum + Number(row.no_of_mc || 0), 0);
      const outMc = outRows.reduce((sum, row) => sum + Number(row.no_of_mc || 0), 0);
      const holding = [...openingRows, ...inRows].reduce((sum, row) => sum + row.holdingCost, 0);
      const other = inRows.reduce((sum, row) => sum + row.otherCharges, 0);
      return { store, openingRows, inRows, outRows, openingMc, inMc, outMc, closingMc: openingMc + inMc - outMc, holding, other, total: holding + other };
    }).filter(block => block.openingRows.length || block.inRows.length || block.outRows.length);
  }, [rawRows, billMonth, csFilter, prodFilter, speciesFilter, search]);

  const tabs = [['summary', 'Grouped Summary'], ['stock', 'Stock Balance'], ['report', 'Movement Ledger'], ['bill', 'Monthly Bill']];
  return <div className="report-viewer-card">
    <ReportHeader title="Cold Storage Report" loading={loading} onReload={reload} onPrint={() => window.print()} />
    <FilterBar>
      <FilterBox label="From Date"><FilterInput type="date" value={fromDate} onChange={setFrom} /></FilterBox>
      <FilterBox label="To Date"><FilterInput type="date" value={toDate} onChange={setTo} /></FilterBox>
      <FilterBox label="Cold Storage"><FilterSelect value={csFilter} onChange={setCsFilter}><option value="">ALL STORAGES</option>{csList.map(v => <option key={v} value={v}>{v}</option>)}</FilterSelect></FilterBox>
      <FilterBox label="Production For"><FilterSelect value={prodFilter} onChange={setProdFilter}><option value="">ALL COMPANIES</option>{prodList.map(v => <option key={v} value={v}>{v}</option>)}</FilterSelect></FilterBox>
      <FilterBox label="Species"><FilterSelect value={speciesFilter} onChange={setSpeciesFilter}><option value="">ALL SPECIES</option>{speciesList.map(v => <option key={v} value={v}>{v}</option>)}</FilterSelect></FilterBox>
      <FilterBox label="Search"><SearchInput value={search} onChange={setSearch} /></FilterBox>
    </FilterBar>
    {loading && <Loader />}{error && <ErrorBox msg={error} onRetry={reload} />}
    {!loading && !error && <>
      <KPIGrid><KPICard label="Total Inward" value={`${fmt.number(totalIn)} MC`} accent="#10b981" /><KPICard label="Total Outward" value={`${fmt.number(totalOut)} MC`} accent="#ef4444" /><KPICard label="Net Stock" value={`${fmt.number(totalIn - totalOut)} MC`} accent="var(--corp-dash)" /><KPICard label="Inv Value" value={fmt.currency(totalValue)} accent="var(--corp-fin)" /></KPIGrid>
      <div style={{ display: 'flex', gap: 8, margin: '8px 0', overflowX: 'auto' }}>{tabs.map(([key, label]) => <button key={key} type="button" className={`btn ${view === key ? 'btn-primary' : ''}`} onClick={() => setView(key)} style={{ whiteSpace: 'nowrap' }}>{label}</button>)}</div>

      {view === 'summary' && <div className="table-responsive"><table className="bknr-table" style={{ minWidth: 1500 }}><thead><tr><th>#</th><th>Production For</th><th>Production At</th><th>Freezer</th><th>Pack Style</th><th>Variety</th><th>Glaze</th><th>Grade</th><th>Total MC</th><th>Total Loose</th><th>Total Qty (KG)</th><th>Valuation</th><th>Ageing (Max)</th></tr></thead><tbody>{summaryRows.length === 0 ? <EmptyRow cols={13} /> : summaryRows.map((r, i) => <tr key={i}><td>{i + 1}</td><td>{r.production_for}</td><td>{r.production_at}</td><td>{r.freezer}</td><td>{r.packing_style}</td><td>{r.variety}</td><td>{r.glaze}</td><td>{r.grade}</td><td>{fmt.number(r.total_mc)}</td><td>{fmt.number(r.total_loose)}</td><td>{fmt.number(r.total_qty)}</td><td>{fmt.currency(r.valuation)}</td><td>{r.age_days} Days</td></tr>)}</tbody></table></div>}
      {view === 'report' && <div className="table-responsive"><table className="bknr-table" style={{ minWidth: 1800 }}><thead><tr><th>Date</th><th>Cold Storage</th><th>Batch #</th><th>Type</th><th>Species</th><th>Variety</th><th>Brand</th><th>Grade</th><th>Freezer</th><th>Pack Style</th><th>Glaze</th><th>MC</th><th>Loose</th><th>Qty (KG)</th><th>Rate/KG</th><th>Inv Value</th><th>Status</th></tr></thead><tbody>{rows.length === 0 ? <EmptyRow cols={17} /> : rows.map((r, i) => <tr key={r.id || i}><td>{r.in_date}</td><td>{r.cold_storage_name}</td><td>{r.batch_number}</td><td>{r.cargo_movement_type}</td><td>{r.species}</td><td>{r.variety}</td><td>{r.brand}</td><td>{r.grade}</td><td>{r.freezer}</td><td>{r.packing_style}</td><td>{r.glaze}</td><td>{r.no_of_mc}</td><td>{r.loose}</td><td>{fmt.number(r.quantity)}</td><td>{fmt.currency(r.product_kg_value)}</td><td>{fmt.currency(r.inventory_value)}</td><td>{r.status}</td></tr>)}</tbody></table></div>}
      {view === 'stock' && <div className="table-responsive"><table className="bknr-table" style={{ minWidth: 1500 }}><thead><tr><th>Cold Storage</th><th>Batch #</th><th>Species</th><th>Variety</th><th>Brand</th><th>Grade</th><th>Freezer</th><th>Pack Style</th><th>Glaze</th><th>Bal MC</th><th>Bal Loose</th><th>Bal Qty (KG)</th><th>Valuation</th></tr></thead><tbody>{stockRows.length === 0 ? <EmptyRow cols={13} /> : stockRows.map((r, i) => <tr key={i}><td>{r.cold_storage_name}</td><td>{r.batch_number}</td><td>{r.species}</td><td>{r.variety}</td><td>{r.brand}</td><td>{r.grade}</td><td>{r.freezer}</td><td>{r.packing_style}</td><td>{r.glaze}</td><td>{fmt.number(r.balance_mc)}</td><td>{fmt.number(r.balance_loose)}</td><td>{fmt.number(r.balance_qty)}</td><td>{fmt.currency(r.valuation)}</td></tr>)}</tbody></table></div>}
      {view === 'bill' && <div className="card" style={{ marginTop: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}><h3>Monthly Cold Storage Bill</h3><FilterBox label="Bill Month"><FilterInput type="month" value={billMonth} onChange={setBillMonth} /></FilterBox></div>
        {billBlocks.length === 0 ? <div className="table-responsive"><table className="bknr-table"><tbody><EmptyRow cols={11} /></tbody></table></div> : billBlocks.map(block => <div key={block.store} style={{ marginTop: 18 }}>
          <h4>{block.store}</h4>
          {[['Opening Stock', block.openingRows], ['Received During Month', block.inRows]].map(([label, billRows]) => <div key={label} style={{ marginTop: 10 }}><strong>{label}</strong><div className="table-responsive"><table className="bknr-table" style={{ minWidth: 1450 }}><thead><tr><th>#</th><th>Batch #</th><th>Species / Variety / Grade</th><th>Pack Style</th><th>Date</th><th>MC</th><th>Holding Days</th><th>Rate / MC</th><th>Holding Cost</th><th>L/U Chg</th><th>Total</th></tr></thead><tbody>{billRows.length === 0 ? <EmptyRow cols={11} /> : billRows.map((r, i) => <tr key={`${label}-${r.id || i}`}><td>{i + 1}</td><td>{r.batch_number}</td><td>{[r.species, r.variety, r.grade].filter(Boolean).join(' / ')}</td><td>{r.packing_style}</td><td>{r.in_date}</td><td>{fmt.number(r.no_of_mc)}</td><td>{r.days} days</td><td>{fmt.currency(r.storage_rate_per_mc)}</td><td>{fmt.currency(r.holdingCost)}</td><td>{fmt.currency(r.otherCharges)}</td><td>{fmt.currency(r.rowTotal)}</td></tr>)}</tbody></table></div></div>)}
          <div style={{ marginTop: 10 }}><strong>Dispatched During Month</strong><div className="table-responsive"><table className="bknr-table" style={{ minWidth: 1050 }}><thead><tr><th>#</th><th>Batch #</th><th>Species / Variety / Grade</th><th>Pack Style</th><th>Out Date</th><th>MC Dispatched</th><th>Remarks</th></tr></thead><tbody>{block.outRows.length === 0 ? <EmptyRow cols={7} /> : block.outRows.map((r, i) => <tr key={r.id || i}><td>{i + 1}</td><td>{r.batch_number}</td><td>{[r.species, r.variety, r.grade].filter(Boolean).join(' / ')}</td><td>{r.packing_style}</td><td>{r.in_date}</td><td>{fmt.number(r.no_of_mc)}</td><td>{r.remarks || 'Stock dispatched'}</td></tr>)}</tbody></table></div></div>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'flex-end', marginTop: 10, fontWeight: 700 }}><span>Opening: {fmt.number(block.openingMc)} MC</span><span>IN: {fmt.number(block.inMc)} MC</span><span>OUT: {fmt.number(block.outMc)} MC</span><span>Closing: {fmt.number(block.closingMc)} MC</span><span>Holding: {fmt.currency(block.holding)}</span><span>L/U: {fmt.currency(block.other)}</span><span>Total: {fmt.currency(block.total)}</span></div>
        </div>)}
      </div>}
    </>}
  </div>;
}
