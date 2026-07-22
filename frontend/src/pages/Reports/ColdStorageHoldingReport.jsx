import { useMemo, useState } from 'react';
import {
  FilterBar, FilterBox, FilterSelect, FilterInput,
  KPIGrid, KPICard, Loader, ErrorBox, SearchInput, EmptyRow,
  useReport, fmt,
} from './ReportShell';
import './ColdStorageHoldingReport.css';

const signed = (row, field) => (String(row.cargo_movement_type || '').toUpperCase() === 'OUT' ? -1 : 1) * Number(row[field] || 0);

function BillChargeTable({ rows, opening = false }) {
  return <div className="cold-bill-table-wrap"><table className="cold-bill-table"><thead><tr><th>#</th><th>Batch #</th><th>Species / Variety / Grade</th><th>Pack Style</th><th>Date</th><th className="text-center">MC</th><th className="text-center">Holding Days</th><th className="text-right">Rate / MC</th><th className="text-right">Holding Cost</th><th className="text-right">L/U Chg</th><th className="text-right">Total</th></tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={row.id || index}><td>{index + 1}</td><td className="bill-cell-batch">{row.batch_number}</td><td>{[row.species, row.variety, row.grade].filter(Boolean).join(' / ')}</td><td>{row.packing_style || ''}</td><td>{row.in_date}</td><td className="text-center">{fmt.number(row.no_of_mc)}</td><td className="text-center bill-cell-days">{row.days} days</td><td className="text-right">{fmt.currency(row.storage_rate_per_mc)}</td><td className="text-right bill-cell-cost">{fmt.currency(row.holdingCost)}</td><td className="text-right">{opening ? '—' : fmt.currency(row.otherCharges)}</td><td className="text-right bill-cell-total">{fmt.currency(row.rowTotal)}</td></tr>) : <tr><td colSpan="11" className="bill-empty-row">{opening ? 'No opening stock for this period' : 'No new receipts this month'}</td></tr>}</tbody></table></div>;
}

function BillDispatchTable({ rows }) {
  return <div className="cold-bill-table-wrap"><table className="cold-bill-table"><thead><tr><th>#</th><th>Batch #</th><th>Species / Variety / Grade</th><th>Pack Style</th><th>Out Date</th><th className="text-center">MC Dispatched</th><th className="text-center">Holding Days</th><th className="text-right">Remarks</th></tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={row.id || index}><td>{index + 1}</td><td className="bill-cell-batch">{row.batch_number}</td><td>{[row.species, row.variety, row.grade].filter(Boolean).join(' / ')}</td><td>{row.packing_style || ''}</td><td>{row.in_date}</td><td className="text-center">− {fmt.number(row.no_of_mc)}</td><td className="text-center">—</td><td className="text-right">—</td></tr>) : <tr><td colSpan="8" className="bill-empty-row">No dispatches this month</td></tr>}</tbody></table></div>;
}

function ColdStorageBillInvoice({ block, billMonth, companyName }) {
  const [year, month] = billMonth.split('-').map(Number);
  const label = new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const monthDays = new Date(year, month, 0).getDate();
  const billNo = `CS-${String(block.store || 'CS').slice(0, 3).toUpperCase()}-${billMonth.replace('-', '')}`;
  const billDate = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  return <article className="cold-bill-invoice">
    <div className="cold-invoice-title">Cold Storage Monthly Bill</div>
    <div className="cold-invoice-company">{companyName}</div>
    <div className="cold-invoice-info">
      <div><b>Cold Storage :</b> {block.store}<br /><b>Address :</b> {block.address || '-'}<br /><b>Billing Period :</b> {label} ({monthDays} Days)</div>
      <div><b>Bill No :</b> {billNo}<br /><b>Bill Date :</b> {billDate}<br /><b>Client :</b> {companyName}</div>
    </div>

    <div className="cold-invoice-section-title">📦 Opening Stock</div>
    <BillChargeTable rows={block.openingRows} opening />
    <div className="cold-invoice-section-title">➕ Received This Month</div>
    <BillChargeTable rows={block.inRows} />
    <div className="cold-invoice-section-title">🚚 Dispatched This Month</div>
    <BillDispatchTable rows={block.outRows} />

    <div className="cold-invoice-total-wrap"><table className="cold-invoice-total-table"><tbody>
      <tr><td>Opening Balance MC</td><td>{fmt.number(block.openingMc)}</td></tr>
      <tr><td>Total Received MC</td><td>+{fmt.number(block.inMc)}</td></tr>
      <tr><td>Total Dispatched MC</td><td>−{fmt.number(block.outMc)}</td></tr>
      <tr className="is-closing"><td>Closing Balance MC</td><td>{fmt.number(block.closingMc)} MC</td></tr>
      <tr><td>Sub Total Holding Cost</td><td>{fmt.currency(block.holding)}</td></tr>
      <tr><td>L/U &amp; Handling Charges</td><td>{fmt.currency(block.other)}</td></tr>
      <tr className="is-grand"><td>Total Payable</td><td>{fmt.currency(block.total)}</td></tr>
    </tbody></table></div>

    <div className="cold-invoice-terms"><h4>Terms &amp; Conditions</h4><ol><li>Bill prepared from approved active storage transactions.</li><li>Holding rates and calculations are based on standard FIFO/pro-rata daily balances.</li><li>Any adjustments will be verified and reflected in the next billing period.</li><li>This is a computer generated document, authorized signatory verified.</li></ol></div>
    <div className="cold-invoice-signatures"><div>Cold Storage Representative</div><div>Authorized Signatory ({companyName})</div></div>
  </article>;
}

export default function ColdStorageHoldingReport({ activeRoute }) {
  const [fromDate, setFrom] = useState('');
  const [toDate, setTo] = useState('');
  const [view, setView] = useState('summary');
  const [csFilter, setCsFilter] = useState('');
  const [batchFilter, setBatchFilter] = useState('');
  const [ageRange, setAgeRange] = useState(null);
  const [search, setSearch] = useState('');
  const [billMonth, setBillMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [billStorage, setBillStorage] = useState('');
  const [todayEpoch] = useState(() => Date.now());

  const { data, loading, error, reload } = useReport({
    url: activeRoute,
    // Keep the full movement set in memory. The native template also applies
    // date filters client-side so its monthly bill can still see opening stock.
    params: {},
    deps: [],
  });
  const rawRows = useMemo(() => data?.rows || [], [data?.rows]);
  const generalRows = rawRows.filter(row => {
    if (fromDate && row.in_date < fromDate) return false;
    if (toDate && row.in_date > toDate) return false;
    if (csFilter && row.cold_storage_name !== csFilter) return false;
    if (batchFilter && row.batch_number !== batchFilter) return false;
    return !search || JSON.stringify(row).toLowerCase().includes(search.toLowerCase());
  });
  const rowAge = row => row.in_date ? Math.max(0, Math.floor((todayEpoch - new Date(`${row.in_date}T00:00:00`).getTime()) / 86400000)) : 0;
  const rows = generalRows.filter(row => !ageRange || (rowAge(row) >= ageRange[0] && rowAge(row) <= ageRange[1]));

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
  const batchList = [...new Set(rawRows.map(r => r.batch_number).filter(Boolean))].sort();
  const ageBuckets = [
    { key: 'age30', label: '0 – 30 Days', min: 0, max: 30, accent: '#16a34a' },
    { key: 'age90', label: '31 – 90 Days', min: 31, max: 90, accent: '#eab308' },
    { key: 'age150', label: '91 – 150 Days', min: 91, max: 150, accent: '#ea580c' },
    { key: 'age300', label: '151 – 300 Days', min: 151, max: 300, accent: '#dc2626' },
    { key: 'ageAbove', label: '300+ Days', min: 301, max: 999999, accent: '#7f1d1d' },
  ].map(bucket => ({
    ...bucket,
    qty: generalRows
      .filter(row => rowAge(row) >= bucket.min && rowAge(row) <= bucket.max)
      .reduce((sum, row) => sum + signed(row, 'quantity'), 0),
  }));
  const totalIn = rows.filter(r => String(r.cargo_movement_type).toUpperCase() === 'IN').reduce((s, r) => s + Number(r.no_of_mc || 0), 0);
  const totalOut = rows.filter(r => String(r.cargo_movement_type).toUpperCase() === 'OUT').reduce((s, r) => s + Number(r.no_of_mc || 0), 0);
  const totalValue = stockRows.reduce((s, r) => s + Number(r.valuation || 0), 0);
  const summaryTotals = summaryRows.reduce((totals, row) => ({
    mc: totals.mc + Number(row.total_mc || 0),
    loose: totals.loose + Number(row.total_loose || 0),
    qty: totals.qty + Number(row.total_qty || 0),
    value: totals.value + Number(row.valuation || 0),
  }), { mc: 0, loose: 0, qty: 0, value: 0 });

  const summaryDisplayRows = useMemo(() => {
    const companyGroups = new Map();
    summaryRows.forEach(row => {
      const company = String(row.production_for || 'N/A').trim() || 'N/A';
      const plant = String(row.production_at || 'N/A').trim() || 'N/A';
      if (!companyGroups.has(company)) companyGroups.set(company, new Map());
      const plants = companyGroups.get(company);
      if (!plants.has(plant)) plants.set(plant, []);
      plants.get(plant).push(row);
    });

    const displayRows = [];
    let rowNumber = 1;
    [...companyGroups.entries()].sort(([left], [right]) => left.localeCompare(right)).forEach(([company, plants]) => {
      const companyTotals = { mc: 0, loose: 0, qty: 0, value: 0 };
      [...plants.entries()].sort(([left], [right]) => left.localeCompare(right)).forEach(([plant, plantRows]) => {
        const plantTotals = { mc: 0, loose: 0, qty: 0, value: 0 };
        plantRows
          .sort((left, right) => [left.freezer, left.packing_style, left.variety, left.glaze, left.grade].join('|').localeCompare([right.freezer, right.packing_style, right.variety, right.glaze, right.grade].join('|')))
          .forEach(row => {
            displayRows.push({ type: 'item', rowNumber: rowNumber++, row });
            plantTotals.mc += Number(row.total_mc || 0);
            plantTotals.loose += Number(row.total_loose || 0);
            plantTotals.qty += Number(row.total_qty || 0);
            plantTotals.value += Number(row.valuation || 0);
          });
        displayRows.push({ type: 'plant', company, plant, totals: plantTotals });
        companyTotals.mc += plantTotals.mc;
        companyTotals.loose += plantTotals.loose;
        companyTotals.qty += plantTotals.qty;
        companyTotals.value += plantTotals.value;
      });
      displayRows.push({ type: 'company', company, totals: companyTotals });
    });
    return displayRows;
  }, [summaryRows]);

  const billBlocks = useMemo(() => {
    if (!billMonth) return [];
    const [year, month] = billMonth.split('-').map(Number);
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);
    const source = rawRows.filter(row => {
      if ((billStorage || csFilter) && row.cold_storage_name !== (billStorage || csFilter)) return false;
      if (batchFilter && row.batch_number !== batchFilter) return false;
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
      return { store, address: storeRows.find(row => row.address)?.address || '', openingRows, inRows, outRows, openingMc, inMc, outMc, closingMc: openingMc + inMc - outMc, holding, other, total: holding + other };
    }).filter(block => block.openingRows.length || block.inRows.length || block.outRows.length);
  }, [rawRows, billMonth, billStorage, csFilter, batchFilter, search]);

  const tabs = [['summary', 'Grouped Summary'], ['stock', 'Stock Balance'], ['report', 'Movement Ledger'], ['bill', 'Monthly Bill']];
  const printBill = () => {
    if (!billMonth) {
      window.alert('Please select a billing month first.');
      return;
    }
    const invoices = [...document.querySelectorAll('.cold-bill-invoice')];
    if (!invoices.length) {
      window.alert('No bill data found for the selected period.');
      return;
    }
    const [year, month] = billMonth.split('-').map(Number);
    const periodLabel = new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    const companyName = data?.company_name || '';
    const printWindow = window.open('', '_blank', 'width=1100,height=900');
    if (!printWindow) {
      window.alert('Print window was blocked. Please allow pop-ups and try again.');
      return;
    }
    const invoiceHtml = invoices.map(invoice => invoice.outerHTML).join('');
    printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Cold Storage Bill — ${periodLabel}</title><style>
      *{box-sizing:border-box;font-family:Arial,sans-serif}body{margin:0;padding:0;color:#111;background:#fff;font-size:8.5px}.print-doc-header{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px;padding-bottom:5px;border-bottom:1px solid #333}.print-doc-title{font-size:13px;font-weight:700}.print-doc-meta{font-size:8px;color:#444}.cold-bill-invoice{margin:0 0 8mm;padding:16px 18px;border:1.5px solid #000;color:#111;background:#fff;page-break-inside:avoid}.cold-invoice-title{color:#036;font-size:16px;font-weight:700;text-align:center}.cold-invoice-company{margin-top:3px;font-size:13px;font-weight:700;text-align:center}.cold-invoice-info{display:flex;justify-content:space-between;gap:24px;margin-top:9px;padding-bottom:7px;border-bottom:1px solid #777;font-size:9.5px;line-height:1.55}.cold-invoice-info>div:last-child{text-align:right}.cold-invoice-section-title{margin:14px 0 4px;color:#036;font-size:10px;font-weight:700}.cold-bill-table-wrap{width:100%;overflow:visible}.cold-bill-table{width:100%;min-width:0;border-collapse:collapse;table-layout:auto}.cold-bill-table th,.cold-bill-table td{padding:3px 4px;border:1px solid #888;font-size:8px;line-height:1.2;white-space:nowrap}.cold-bill-table th{color:#111;background:#e8eef5;font-weight:700;text-align:left}.cold-bill-table tbody tr:nth-child(even) td{background:#f8fafc}.text-center{text-align:center!important}.text-right{text-align:right!important}.bill-cell-batch,.bill-cell-cost,.bill-cell-total{font-weight:700}.bill-empty-row{padding:8px!important;color:#555;text-align:center!important}.cold-invoice-total-wrap{display:flex;justify-content:flex-end;margin-top:10px}.cold-invoice-total-table{width:45%;border-collapse:collapse;font-size:9px}.cold-invoice-total-table td{padding:4px 6px;border-bottom:1px solid #aaa}.cold-invoice-total-table td:last-child{text-align:right;font-weight:700}.cold-invoice-total-table .is-closing td{border-top:1px solid #333;font-weight:700}.cold-invoice-total-table .is-grand td{border-top:3px double #111;border-bottom:3px double #111;font-size:10px;font-weight:700}.cold-invoice-terms{margin-top:14px;font-size:9px;line-height:1.45}.cold-invoice-terms h4{margin:0 0 3px;color:#036;font-size:9.5px}.cold-invoice-terms ol{margin:0;padding-left:17px}.cold-invoice-signatures{display:flex;justify-content:space-between;gap:60px;margin-top:35px}.cold-invoice-signatures div{width:42%;padding-top:5px;border-top:1px solid #111;font-size:9px;text-align:center}@page{size:A4 portrait;margin:8mm 10mm}@media print{.cold-bill-invoice{break-after:page}.cold-bill-invoice:last-child{break-after:auto}}
    </style></head><body><div class="print-doc-header"><div><div class="print-doc-title">Cold Storage Monthly Bill</div><div class="print-doc-meta">Prepared by: <strong>${companyName}</strong> &nbsp;|&nbsp; Period: <strong>${periodLabel}</strong></div></div><div style="text-align:right;font-size:8px;color:#444">Printed: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}<br>ERP — Cold Storage Module</div></div>${invoiceHtml}<script>window.onload=function(){window.print()}<\/script></body></html>`);
    printWindow.document.close();
  };

  return <div className="report-viewer-card cold-storage-report">
    <header className="cold-storage-native-header">
      <h2>CS Inventory Dashboard</h2>
      <FilterBar>
        <FilterBox label="From"><FilterInput type="date" value={fromDate} onChange={setFrom} /></FilterBox>
        <FilterBox label="To"><FilterInput type="date" value={toDate} onChange={setTo} /></FilterBox>
        <FilterBox label="Storage"><FilterSelect value={csFilter} onChange={value => { setCsFilter(value); setBillStorage(''); }}><option value="">All Storage</option>{csList.map(v => <option key={v} value={v}>{v}</option>)}</FilterSelect></FilterBox>
        <FilterBox label="Batch"><FilterSelect value={batchFilter} onChange={setBatchFilter}><option value="">All Batches</option>{batchList.map(v => <option key={v} value={v}>{v}</option>)}</FilterSelect></FilterBox>
        <div className="cold-storage-search"><SearchInput value={search} onChange={setSearch} placeholder="Search batch, variety, brand, freezer..." /></div>
      </FilterBar>
    </header>
    {loading && <Loader />}{error && <ErrorBox msg={error} onRetry={reload} />}
    {!loading && !error && <>
      <div className="cold-storage-age-grid no-print">
        {ageBuckets.map(bucket => {
          const active = ageRange?.[0] === bucket.min && ageRange?.[1] === bucket.max;
          return <button
            type="button"
            key={bucket.key}
            className={`cold-age-card${active ? ' is-active' : ''}`}
            style={{ '--age-accent': bucket.accent }}
            onClick={() => setAgeRange(active ? null : [bucket.min, bucket.max])}
          ><span>{bucket.label}</span><b>{fmt.number(bucket.qty, 0)} KG</b></button>;
        })}
      </div>

      <KPIGrid className="cold-summary-strip"><KPICard label="Total Inward" value={`${fmt.number(totalIn)} MC`} accent="#2563eb" /><KPICard label="Total Outward" value={`${fmt.number(totalOut)} MC`} accent="#ef4444" /><KPICard label="Net Stock" value={`${fmt.number(totalIn - totalOut)} MC`} accent="#16a34a" /><KPICard label="Inv Value" value={fmt.currency(totalValue)} accent="#ca8a04" /></KPIGrid>
      <div className="cold-storage-tabs">{tabs.map(([key, label]) => <button key={key} type="button" className={view === key ? 'is-active' : ''} onClick={() => setView(key)}>{key === 'bill' && <span>💾 </span>}{label}</button>)}</div>

      {view === 'summary' && <div className="table-responsive cold-storage-table-wrap"><table className="bknr-table cold-storage-table cold-summary-table"><thead><tr><th>#</th><th>Production For</th><th>Production At</th><th>Freezer</th><th>Pack Style</th><th>Variety</th><th>Glaze</th><th>Grade</th><th className="text-right">Total MC</th><th className="text-right">Total Loose</th><th className="text-right">Total Qty (KG)</th><th className="text-right">Valuation</th><th>Ageing (Max)</th></tr></thead><tbody>{summaryDisplayRows.length === 0 ? <EmptyRow cols={13} /> : summaryDisplayRows.map((item, index) => {
        if (item.type === 'plant') return <tr className="cold-summary-plant-total" key={`plant-${item.company}-${item.plant}`}><td /><td>{item.company}</td><td colSpan="6" className="text-right">Sub-Total (Plant: {item.plant}):</td><td className="text-right">{fmt.number(item.totals.mc)}</td><td className="text-right">{fmt.number(item.totals.loose)}</td><td className="text-right">{fmt.number(item.totals.qty)}</td><td className="text-right">{fmt.currency(item.totals.value)}</td><td /></tr>;
        if (item.type === 'company') return <tr className="cold-summary-company-total" key={`company-${item.company}`}><td /><td colSpan="7" className="text-right">Total (Company: {item.company}):</td><td className="text-right">{fmt.number(item.totals.mc)}</td><td className="text-right">{fmt.number(item.totals.loose)}</td><td className="text-right">{fmt.number(item.totals.qty)}</td><td className="text-right">{fmt.currency(item.totals.value)}</td><td /></tr>;
        const row = item.row;
        return <tr key={`item-${item.rowNumber}-${index}`}><td>{item.rowNumber}</td><td>{row.production_for}</td><td>{row.production_at}</td><td>{row.freezer}</td><td>{row.packing_style}</td><td>{row.variety}</td><td>{row.glaze}</td><td>{row.grade}</td><td className="text-right">{fmt.number(row.total_mc)}</td><td className="text-right">{fmt.number(row.total_loose)}</td><td className="text-right">{fmt.number(row.total_qty)}</td><td className="text-right">{fmt.currency(row.valuation)}</td><td className={row.age_days > 90 ? 'cold-age-danger' : row.age_days > 30 ? 'cold-age-warning' : 'cold-age-safe'}>{row.age_days} Days</td></tr>;
      })}</tbody><tfoot><tr><td colSpan="8" className="text-right">Grand Totals (Stock In Hand):</td><td className="text-right">{fmt.number(summaryTotals.mc)}</td><td className="text-right">{fmt.number(summaryTotals.loose)}</td><td className="text-right">{fmt.number(summaryTotals.qty)}</td><td className="text-right">{fmt.currency(summaryTotals.value)}</td><td /></tr></tfoot></table></div>}
      {view === 'report' && <div className="table-responsive"><table className="bknr-table" style={{ minWidth: 1800 }}><thead><tr><th>Date</th><th>Cold Storage</th><th>Batch #</th><th>Type</th><th>Species</th><th>Variety</th><th>Brand</th><th>Grade</th><th>Freezer</th><th>Pack Style</th><th>Glaze</th><th>MC</th><th>Loose</th><th>Qty (KG)</th><th>Rate/KG</th><th>Inv Value</th><th>Status</th></tr></thead><tbody>{rows.length === 0 ? <EmptyRow cols={17} /> : rows.map((r, i) => <tr key={r.id || i}><td>{r.in_date}</td><td>{r.cold_storage_name}</td><td>{r.batch_number}</td><td>{r.cargo_movement_type}</td><td>{r.species}</td><td>{r.variety}</td><td>{r.brand}</td><td>{r.grade}</td><td>{r.freezer}</td><td>{r.packing_style}</td><td>{r.glaze}</td><td>{r.no_of_mc}</td><td>{r.loose}</td><td>{fmt.number(r.quantity)}</td><td>{fmt.currency(r.product_kg_value)}</td><td>{fmt.currency(r.inventory_value)}</td><td>{r.status}</td></tr>)}</tbody></table></div>}
      {view === 'stock' && <div className="table-responsive"><table className="bknr-table" style={{ minWidth: 1500 }}><thead><tr><th>Cold Storage</th><th>Batch #</th><th>Species</th><th>Variety</th><th>Brand</th><th>Grade</th><th>Freezer</th><th>Pack Style</th><th>Glaze</th><th>Bal MC</th><th>Bal Loose</th><th>Bal Qty (KG)</th><th>Valuation</th></tr></thead><tbody>{stockRows.length === 0 ? <EmptyRow cols={13} /> : stockRows.map((r, i) => <tr key={i}><td>{r.cold_storage_name}</td><td>{r.batch_number}</td><td>{r.species}</td><td>{r.variety}</td><td>{r.brand}</td><td>{r.grade}</td><td>{r.freezer}</td><td>{r.packing_style}</td><td>{r.glaze}</td><td>{fmt.number(r.balance_mc)}</td><td>{fmt.number(r.balance_loose)}</td><td>{fmt.number(r.balance_qty)}</td><td>{fmt.currency(r.valuation)}</td></tr>)}</tbody></table></div>}
      {view === 'bill' && <div className="card cold-bill-section">
        <div className="cold-bill-toolbar"><div><h3>💾 Monthly Cold Storage Bill</h3><p>Grouped by Storage Facility • Based on active filters</p></div><div className="cold-bill-actions"><FilterBox label="Cold Storage"><FilterSelect value={billStorage} onChange={setBillStorage}><option value="">All Storage</option>{csList.map(value => <option key={value} value={value}>{value}</option>)}</FilterSelect></FilterBox><FilterBox label="Bill Month"><FilterInput type="month" value={billMonth} onChange={setBillMonth} /></FilterBox><button type="button" onClick={printBill}>🖨 Print Bill</button></div></div>
        {billBlocks.length === 0 ? <div className="table-responsive"><table className="bknr-table"><tbody><EmptyRow cols={11} /></tbody></table></div> : billBlocks.map(block => <ColdStorageBillInvoice key={block.store} block={block} billMonth={billMonth} companyName={data?.company_name || ''} />)}
      </div>}
    </>}
  </div>;
}
