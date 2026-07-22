import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Loader, ErrorBox, EmptyRow, useReport, fmt,
} from './ReportShell';
import './StorageCostReport.css';

const productHeaders = [
  'Batch No', 'Type of Prod', 'Location', 'Brand', 'Freezer', 'Packing Style',
  'Glaze', 'Variety', 'Grade', 'Species', 'MC', 'Loose', 'Quantity (KG)',
  'Purpose/PO', 'Prod At', 'Prod For',
];

const sum = (rows, key) => rows.reduce((total, row) => total + Number(row?.[key] || 0), 0);

const displayDate = value => {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('en-GB');
};

const openPrintView = (element, title, portrait = false) => {
  const printWindow = window.open('', '_blank', 'width=1200,height=900');
  if (!printWindow) {
    window.alert('Print window blocked. Please allow popups for this site and try again.');
    return;
  }
  if (!element) {
    printWindow.close();
    window.alert('Printable report data is not available.');
    return;
  }

  const pageStyles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map(node => node.outerHTML)
    .join('\n');
  printWindow.document.open();
  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>${pageStyles}<style>
    @page { size: A4 ${portrait ? 'portrait' : 'landscape'}; margin: ${portrait ? '10mm 8mm' : '7mm'}; }
    html, body { display:block !important; width:auto !important; height:auto !important; margin:0 !important; padding:0 !important; overflow:visible !important; background:#fff !important; color:#000 !important; }
    .storage-tab-panel, .storage-monthly-invoice { display:block !important; width:100% !important; max-width:none !important; height:auto !important; margin:0 !important; padding:0 !important; overflow:visible !important; border:0 !important; box-shadow:none !important; background:#fff !important; color:#000 !important; }
    .storage-table-wrap, .storage-invoice-table-wrap { display:block !important; width:100% !important; height:auto !important; max-height:none !important; overflow:visible !important; }
    .storage-bill-actions, .storage-bill-warning { display:none !important; }
    table { width:100% !important; min-width:100% !important; table-layout:auto !important; border-collapse:collapse !important; color:#000 !important; }
    thead { display:table-header-group !important; }
    th, td { position:static !important; height:auto !important; padding:3px !important; border:1px solid #94a3b8 !important; background:#fff !important; color:#000 !important; font-size:${portrait ? '7.2px' : '6.3px'} !important; white-space:normal !important; }
    th { background:#f1f5f9 !important; font-weight:800 !important; }
    tr { break-inside:avoid; page-break-inside:avoid; }
    .storage-invoice-title, .storage-invoice-title * { color:#003366 !important; }
  </style></head><body>${element.outerHTML}</body></html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.setTimeout(() => printWindow.print(), 500);
};

export default function StorageCostReport({ activeRoute }) {
  const [activeTab, setActiveTab] = useState('summary');
  const [prodFor, setProdFor] = useState('');
  const [freezer, setFreezer] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({ prodFor: '', freezer: '', selectedMonth: '' });
  const monthlyInvoiceRef = useRef(null);

  const params = {
    ...(appliedFilters.prodFor ? { production_for: appliedFilters.prodFor } : {}),
    ...(appliedFilters.freezer ? { freezer: appliedFilters.freezer } : {}),
    ...(appliedFilters.selectedMonth ? { selected_month: appliedFilters.selectedMonth } : {}),
  };
  const { data, loading, error, reload } = useReport({
    url: activeRoute || '/reports/storage_cost_report',
    params,
    deps: [appliedFilters.prodFor, appliedFilters.freezer, appliedFilters.selectedMonth],
  });

  useEffect(() => {
    if (!selectedMonth && data?.selected_month) setSelectedMonth(data.selected_month);
  }, [data?.selected_month, selectedMonth]);

  const reportRows = useMemo(() => data?.report_data || [], [data?.report_data]);
  const originalRows = useMemo(() => {
    if (Array.isArray(data?.detailed_entries)) return data.detailed_entries;
    return reportRows.flatMap(row => (row.this_month_ledger || []).map(movement => ({
      ...movement,
      batch_number: movement.batch_number ?? row.batch_number,
      production_at: movement.production_at ?? row.production_at,
      production_for: movement.production_for ?? row.production_for,
    })));
  }, [data?.detailed_entries, reportRows]);
  const availableRows = data?.available_stock_items || [];
  const dispatchRows = data?.dispatches_this_month || [];

  const totalInQty = Number(data?.total_qty_sum ?? 0);
  const totalHolding = Number(data?.total_holding_sum ?? sum(reportRows, 'holding_cost'));
  const totalProduction = Number(data?.total_payable_sum ?? sum(reportRows, 'payable_amount'));
  const selectedClient = data?.selected_production_for || appliedFilters.prodFor;
  const selectedLocation = data?.selected_location || 'ALL LOCATIONS';
  const billingDate = data?.billing_start_date ? new Date(`${data.billing_start_date}T00:00:00`) : new Date();
  const billingLabel = billingDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const billDate = billingDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  const billMonthCode = appliedFilters.selectedMonth || data?.selected_month || billingDate.toISOString().slice(0, 7);
  const billNo = selectedClient
    ? `SP-${String(selectedClient).replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase()}-${billMonthCode.replace('-', '')}`
    : '—';

  const tabs = [
    ['summary', '1. CONSOLIDATED SUMMARY'],
    ['original', '2. DETAILED ORIGINAL ENTRIES'],
    ['bill', '🧾 3. MONTHLY BILL'],
  ];

  const generateReport = event => {
    event.preventDefault();
    const nextFilters = { prodFor, freezer, selectedMonth };
    const unchanged = Object.keys(nextFilters).every(key => nextFilters[key] === appliedFilters[key]);
    if (unchanged) reload();
    else setAppliedFilters(nextFilters);
  };

  const ProductCells = ({ row, details = row.details || row }) => <>
    <td className="storage-batch">{row.batch_number || '—'}</td>
    <td>{details.type_of_production || '—'}</td>
    <td>{details.location || '—'}</td>
    <td>{row.brand ?? details.brand ?? '—'}</td>
    <td>{row.freezer ?? details.freezer ?? '—'}</td>
    <td>{row.packing_style ?? details.packing_style ?? '—'}</td>
    <td>{row.glaze ?? details.glaze ?? '—'}</td>
    <td>{row.variety ?? details.variety ?? '—'}</td>
    <td>{row.grade ?? details.grade ?? '—'}</td>
    <td>{row.species ?? details.species ?? '—'}</td>
    <td className="text-right">{fmt.number(details.no_of_mc)}</td>
    <td className="text-right">{fmt.number(details.loose)}</td>
    <td className="text-right">{fmt.number(details.quantity)}</td>
    <td>{details.po_number || details.purpose || '—'}</td>
    <td>{row.production_at ?? details.production_at ?? '—'}</td>
    <td>{row.production_for ?? details.production_for ?? '—'}</td>
  </>;

  const printMonthlyBill = () => {
    if (!selectedClient || !monthlyInvoiceRef.current) return;
    openPrintView(monthlyInvoiceRef.current, `Monthly Bill - ${selectedClient}`, true);
  };

  const printCurrentView = () => {
    const activePanel = document.querySelector('.storage-cost-report .storage-tab-panel.active');
    openPrintView(activePanel, 'Advanced Stock & Storage Report', activeTab === 'bill');
  };

  return <div className="report-viewer-card storage-cost-report">
    <header className="storage-report-header">
      <h2>Advanced Stock &amp; Storage Report</h2>
      <button type="button" onClick={printCurrentView} disabled={loading}>Download PDF / Print</button>
    </header>

    <div className="storage-control-panel">
      <form className="storage-filter-fields" onSubmit={generateReport}>
        <label><span>Production For</span><select value={prodFor} onChange={event => setProdFor(event.target.value)}><option value="">-- All Clients --</option>{(data?.production_for_list || []).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label><span>Billing Month</span><input type="month" value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)} /></label>
        <label><span>Freezer</span><select value={freezer} onChange={event => setFreezer(event.target.value)}><option value="">-- All --</option>{(data?.freezers || []).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <button type="submit" className="storage-generate-btn" disabled={loading}>Generate</button>
      </form>
      <div className="storage-inline-kpis">
        <div className="storage-inline-kpi blue"><span>IN Qty (KG)</span><strong>{fmt.number(totalInQty)}</strong></div>
        <div className="storage-inline-kpi amber"><span>Holding Cost</span><strong>{fmt.currency(totalHolding)}</strong></div>
        <div className="storage-inline-kpi indigo"><span>Production Cost</span><strong>{fmt.currency(totalProduction)}</strong></div>
        <div className="storage-inline-kpi green"><span>Grand Total</span><strong>{fmt.currency(totalHolding + totalProduction)}</strong></div>
      </div>
    </div>

    <div className="storage-tabs" role="tablist" aria-label="Storage report views">
      {tabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={activeTab === key} className={`storage-tab-btn${activeTab === key ? ' active' : ''}`} onClick={() => setActiveTab(key)}>{label}</button>)}
    </div>

    {loading && <Loader />}
    {error && <ErrorBox msg={error} onRetry={reload} />}
    {!loading && !error && <>
      <section className={`storage-tab-panel${activeTab === 'summary' ? ' active' : ''}`} aria-label="Consolidated summary">
        <div className="storage-table-wrap"><table className="bknr-table storage-wide-table storage-summary-table">
          <thead><tr>{productHeaders.map(header => <th key={header}>{header}</th>)}<th>Opening MC</th><th>Month IN</th><th>Month OUT</th><th>Closing MC</th><th>Rate/MC/Day</th><th>Total Days</th><th>Free Days</th><th>Payable Days</th><th>Holding Cost ₹</th><th>Prod Cost/KG</th><th>Production Cost ₹</th><th>Total Cost ₹</th></tr></thead>
          <tbody>{reportRows.length === 0 ? <EmptyRow cols={28} /> : reportRows.map((row, index) => <tr key={`${row.batch_number}-${index}`}>
            <ProductCells row={row} />
            <td className="storage-opening">{fmt.number(row.opening_mc)}</td>
            <td className="storage-row-in">{fmt.number(row.monthly_in_mc)}</td>
            <td className="storage-row-out">{fmt.number(row.monthly_out_mc)}</td>
            <td className="storage-closing">{fmt.number(row.closing_mc)}</td>
            <td>{fmt.currency(row.holding_cost_per_mc_day)}</td><td>{row.total_days || 0} days</td><td>{row.free_days_tm || 0} days</td><td>{row.payable_days || 0} days</td>
            <td className="storage-holding">{fmt.currency(row.holding_cost)}</td><td>{fmt.currency(row.production_cost_per_kg)}</td><td className="storage-production">{fmt.currency(row.payable_amount)}</td><td className="storage-grand">{fmt.currency(Number(row.holding_cost || 0) + Number(row.payable_amount || 0))}</td>
          </tr>)}</tbody>
          <tfoot><tr><td colSpan="16" className="text-right">Sub Total:</td><td>{fmt.number(sum(reportRows, 'opening_mc'))}</td><td>{fmt.number(sum(reportRows, 'monthly_in_mc'))}</td><td>{fmt.number(sum(reportRows, 'monthly_out_mc'))}</td><td>{fmt.number(sum(reportRows, 'closing_mc'))}</td><td colSpan="4"></td><td className="storage-holding">{fmt.currency(sum(reportRows, 'holding_cost'))}</td><td></td><td className="storage-production">{fmt.currency(sum(reportRows, 'payable_amount'))}</td><td className="storage-grand">{fmt.currency(sum(reportRows, 'holding_cost') + sum(reportRows, 'payable_amount'))}</td></tr></tfoot>
        </table></div>
      </section>

      <section className={`storage-tab-panel${activeTab === 'original' ? ' active' : ''}`} aria-label="Detailed original entries">
        <div className="storage-table-wrap"><table className="bknr-table storage-original-table">
          <thead><tr><th>Date</th><th>Movement</th>{productHeaders.map(header => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>{originalRows.length === 0 ? <EmptyRow cols={18} /> : originalRows.map((row, index) => <tr key={`${row.batch_number}-${row.date}-${index}`}><td>{displayDate(row.date)}</td><td className={row.cargo_movement_type === 'IN' ? 'storage-row-in' : 'storage-row-out'}>{row.cargo_movement_type || '—'}</td><ProductCells row={row} details={row} /></tr>)}</tbody>
        </table></div>
      </section>

      <section className={`storage-tab-panel storage-bill-panel${activeTab === 'bill' ? ' active' : ''}`} aria-label="Monthly bill">
        {!selectedClient ? <div className="storage-bill-warning">⚠ Please select a client in the “Production For” filter to view and print the Monthly Bill.</div> : <>
          <div className="storage-bill-actions"><button type="button" onClick={printMonthlyBill}>🖨 Print Monthly Bill</button></div>
          <article className="storage-monthly-invoice" ref={monthlyInvoiceRef}>
            <header className="storage-invoice-title"><h2>Stock Processing &amp; Storage Monthly Bill</h2><strong>{data?.company_name || 'ERP'}</strong></header>
            <div className="storage-invoice-meta"><div><b>Client Name :</b> {selectedClient}<br/><b>Location :</b> {selectedLocation}<br/><b>Billing Period :</b> {billingLabel}</div><div><b>Bill No :</b> {billNo}<br/><b>Bill Date :</b> {billDate}<br/><b>System Generated Statement</b></div></div>

            <h3>📦 Active Available Stock</h3>
            <div className="storage-invoice-table-wrap"><table className="storage-invoice-table available-table"><thead><tr><th>Batch No</th><th>In Date</th><th>Details (Variety / Grade)</th><th>Available MC</th><th>Available Qty (KG)</th><th>Storage Rate</th><th>Total Days</th><th>Free Days</th><th>Payable Days</th><th>Holding Cost (₹)</th><th>Prod Rate/KG</th><th>Production Cost (₹)</th><th>Total (₹)</th></tr></thead><tbody>
              {availableRows.length === 0 ? <EmptyRow cols={13} /> : availableRows.map((row, index) => <tr key={`${row.batch_number}-${index}`}><td className="storage-batch">{row.batch_number}</td><td>{displayDate(row.in_date)}</td><td>{[row.variety, row.grade, row.freezer].filter(Boolean).join(' / ')}</td><td>{row.available_mc}</td><td>{fmt.number(row.qty_kg)}</td><td>{fmt.currency(row.holding_cost_per_mc_day)}/d</td><td>{row.total_days}</td><td>{row.free_days_tm}</td><td>{row.payable_days}</td><td>{fmt.currency(row.holding_cost)}</td><td>{fmt.currency(row.production_cost_per_kg)}</td><td>{fmt.currency(row.payable_amount)}</td><td>{fmt.currency(Number(row.holding_cost || 0) + Number(row.payable_amount || 0))}</td></tr>)}
            </tbody><tfoot><tr><td colSpan="3" className="text-right">Sub Total:</td><td>{fmt.number(sum(availableRows, 'available_mc'))}</td><td>{fmt.number(sum(availableRows, 'qty_kg'))}</td><td colSpan="4"></td><td>{fmt.currency(sum(availableRows, 'holding_cost'))}</td><td></td><td>{fmt.currency(sum(availableRows, 'payable_amount'))}</td><td>{fmt.currency(sum(availableRows, 'holding_cost') + sum(availableRows, 'payable_amount'))}</td></tr></tfoot></table></div>

            <h3>🚚 Dispatched Stock (This Month)</h3>
            <div className="storage-invoice-table-wrap"><table className="storage-invoice-table dispatched-table"><thead><tr><th>Batch No</th><th>In Date</th><th>Out Date</th><th>Details (Variety / Grade)</th><th>Dispatched MC</th><th>Dispatched Qty (KG)</th><th>Total Days</th><th>Free Days</th><th>Payable Days</th><th>Storage Rate</th><th>Holding Cost (₹)</th></tr></thead><tbody>
              {dispatchRows.length === 0 ? <EmptyRow cols={11} /> : dispatchRows.map((row, index) => <tr key={`${row.batch_number}-${index}`}><td className="storage-batch">{row.batch_number}</td><td>{displayDate(row.in_date)}</td><td>{displayDate(row.out_date)}</td><td>{[row.variety, row.grade, row.freezer].filter(Boolean).join(' / ')}</td><td>{row.mc_dispatched}</td><td>{fmt.number(row.qty_kg)}</td><td>{row.total_days}</td><td>{row.free_days_tm}</td><td>{row.payable_days}</td><td>{fmt.currency(row.holding_cost_per_mc_day)}/d</td><td>{fmt.currency(row.holding_cost)}</td></tr>)}
            </tbody><tfoot><tr><td colSpan="4" className="text-right">Sub Total:</td><td>{fmt.number(sum(dispatchRows, 'mc_dispatched'))}</td><td>{fmt.number(sum(dispatchRows, 'qty_kg'))}</td><td colSpan="4"></td><td>{fmt.currency(sum(dispatchRows, 'holding_cost'))}</td></tr></tfoot></table></div>

            <div className="storage-invoice-totals"><table><tbody><tr><td>Total Storage Holding Cost:</td><td>{fmt.currency(totalHolding)}</td></tr><tr><td>Total Production Processing Cost:</td><td>{fmt.currency(totalProduction)}</td></tr><tr><th>GRAND TOTAL PAYABLE:</th><th>{fmt.currency(totalHolding + totalProduction)}</th></tr></tbody></table></div>
            <div className="storage-invoice-terms"><h4>Terms &amp; Conditions</h4><ol><li>Holding rent calculated dynamically using FIFO balances after active free storage days.</li><li>Production processing fees based on weight received at plant.</li><li>This is a system generated document. Any disputes must be raised within 7 working days.</li></ol></div>
            <footer className="storage-invoice-signatures"><div>Client Authorized Signatory</div><div>{data?.company_name || 'Company'} Authorized Representative</div></footer>
          </article>
        </>}
      </section>
    </>}
  </div>;
}
