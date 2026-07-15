/**
 * SalesReport.jsx – Export Sales Dispatch Register
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReportHeader, FilterBar, FilterBox, FilterSelect,
  KPIGrid, KPICard, Loader, ErrorBox, SearchInput, EmptyRow,
  useReport, fmt
} from './ReportShell';
import Chart from 'chart.js/auto';

const currentFYStart = (() => {
  const today = new Date();
  return today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
})();

export default function SalesReport({ activeRoute }) {
  const [fyFilter, setFyFilter] = useState(String(currentFYStart));
  const [buyerFilter, setBuyerFilter] = useState('');
  const [countryFilter, setCountryFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [invoiceFilter, setInvoiceFilter] = useState('');
  const [poFilter, setPoFilter] = useState('');
  const [varietyFilter, setVarietyFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showCharts, setShowCharts] = useState(false);
  const [rowOverrides, setRowOverrides] = useState({});
  const [notice, setNotice] = useState(null);
  const [kpiDetail, setKpiDetail] = useState(null);

  const { data, loading, error, reload } = useReport({ url: activeRoute });
  const localData = useMemo(() => (data?.sales_data || []).map(item => {
    const rowId = item.obj?.id;
    const override = rowOverrides[rowId];
    return override ? { ...item, ...override, obj: { ...item.obj, ...override.obj } } : item;
  }), [data, rowOverrides]);

  // Refs for Chart canvases
  const revenueTrendRef = useRef(null);
  const countryShareRef = useRef(null);
  const varietyPerfRef = useRef(null);
  const topGradesRef = useRef(null);
  const topBuyersRef = useRef(null);
  const revenueProfitRef = useRef(null);
  const chartInstances = useRef({});

  const showNotice = (type, message) => {
    const id = `${type}:${message}`;
    setNotice({ id, type, message });
    window.setTimeout(() => setNotice(current => current?.id === id ? null : current), 3500);
  };

  // Client side filtering
  const filtered = useMemo(() => localData.filter(item => {
    const s = item.obj || {};
    if (buyerFilter && s.buyer_name !== buyerFilter) return false;
    if (countryFilter && s.country !== countryFilter) return false;
    if (brandFilter && s.brand !== brandFilter) return false;
    if (invoiceFilter && s.invoice_no !== invoiceFilter) return false;
    if (poFilter && s.po_number !== poFilter) return false;
    if (varietyFilter && s.variety !== varietyFilter) return false;
    if (gradeFilter && s.grade !== gradeFilter) return false;
    if (statusFilter && s.status !== statusFilter) return false;
    if (fyFilter !== 'ALL') {
      const invoiceDate = String(s.invoice_date || '').substring(0, 10);
      const fyStart = `${fyFilter}-04-01`;
      const fyEnd = `${Number(fyFilter) + 1}-03-31`;
      if (!invoiceDate || invoiceDate < fyStart || invoiceDate > fyEnd) return false;
    }
    if (monthFilter) {
      const month = s.invoice_date ? s.invoice_date.substring(0, 7) : '';
      if (month !== monthFilter) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const match = Object.values(s).some(v => String(v ?? '').toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  }), [
    localData, buyerFilter, countryFilter, brandFilter, invoiceFilter,
    poFilter, varietyFilter, gradeFilter, statusFilter, monthFilter, search, fyFilter,
  ]);

  // Calculate unique filters from current dataset
  const rawObjList = localData.map(d => d.obj).filter(Boolean);
  const buyersList = [...new Set(rawObjList.map(o => o.buyer_name).filter(Boolean))].sort();
  const countriesList = [...new Set(rawObjList.map(o => o.country).filter(Boolean))].sort();
  const brandsList = [...new Set(rawObjList.map(o => o.brand).filter(Boolean))].sort();
  const invoicesList = [...new Set(rawObjList.map(o => o.invoice_no).filter(Boolean))].sort();
  const poList = [...new Set(rawObjList.map(o => o.po_number).filter(Boolean))].sort();
  const varietiesList = [...new Set(rawObjList.map(o => o.variety).filter(Boolean))].sort();
  const gradesList = [...new Set(rawObjList.map(o => o.grade).filter(Boolean))].sort();
  const monthsList = [...new Set(rawObjList.map(o => o.invoice_date ? o.invoice_date.substring(0, 7) : '').filter(Boolean))].sort();
  const statusesList = [...new Set(rawObjList.map(o => o.status).filter(Boolean))].sort();
  const fyList = [...new Set([
    currentFYStart,
    ...rawObjList.map(o => {
      const date = String(o.invoice_date || '');
      const year = Number(date.substring(0, 4));
      const month = Number(date.substring(5, 7));
      if (!year || !month) return null;
      return month >= 4 ? year : year - 1;
    }).filter(Boolean),
  ])].sort((a, b) => b - a);

  // KPIs
  const totalInr = filtered.reduce((s, d) => s + Number(d.total_inr || 0), 0);
  const totalUsd = filtered.reduce((s, d) => s + Number(d.total_usd || 0), 0);
  const totalPL  = filtered.reduce((s, d) => s + Number(d.profit_loss || 0), 0);
  const totalQty = filtered.reduce((s, d) => s + Number(d.total_qty_kg || 0), 0);
  const totalFreight = filtered.reduce((s, d) => s + Number(d.freight_cost || 0), 0);
  const totalPacking = filtered.reduce((s, d) => s + Number(d.packing_cost || 0), 0);
  const pendingDue = filtered.reduce((s, d) => s + (d.obj?.status === 'Unpaid' ? Number(d.total_inr || 0) : 0), 0);
  const uniqueInvoices = new Set(filtered.map(d => d.obj?.invoice_no).filter(Boolean)).size;
  const kpiLabels = {
    revenue: 'Gross Revenue Details',
    profit: 'Net Profit Details',
    pending: 'Pending Due Details',
    profitKg: 'Profit per KG Details',
    freight: 'Landed Freight Details',
    packing: 'Packing Cost Details',
    volume: 'Volume Sold Details',
    invoices: 'Invoice Details',
  };
  let kpiRows = kpiDetail === 'pending'
    ? filtered.filter(row => row.obj?.status === 'Unpaid')
    : filtered;
  if (kpiDetail === 'invoices') {
    const seenInvoices = new Set();
    kpiRows = filtered.filter(row => {
      const invoice = row.obj?.invoice_no;
      if (!invoice || seenInvoices.has(invoice)) return false;
      seenInvoices.add(invoice);
      return true;
    });
  }

  // Chart Rendering Hook
  useEffect(() => {
    if (!showCharts || filtered.length === 0) {
      // Destroy any remaining charts
      Object.values(chartInstances.current).forEach(c => c.destroy());
      chartInstances.current = {};
      return;
    }

    // Destroy existing instances to avoid overlapping
    Object.values(chartInstances.current).forEach(c => c.destroy());
    chartInstances.current = {};

    // Data Aggregation
    const monthData = {};
    filtered.forEach(item => {
      const date = item.obj?.invoice_date || '';
      const m = date.substring(0, 7) || 'UNKNOWN';
      if (!monthData[m]) monthData[m] = { revenue: 0, profit: 0 };
      monthData[m].revenue += Number(item.total_inr || 0);
      monthData[m].profit += Number(item.profit_loss || 0);
    });
    const monthsSorted = Object.keys(monthData).sort();

    const countryData = {};
    filtered.forEach(item => {
      const c = item.obj?.country || 'OTHER';
      countryData[c] = (countryData[c] || 0) + Number(item.total_inr || 0);
    });

    const varietyData = {};
    filtered.forEach(item => {
      const v = item.obj?.variety || 'OTHER';
      varietyData[v] = (varietyData[v] || 0) + Number(item.total_inr || 0);
    });

    const gradeData = {};
    filtered.forEach(item => {
      const g = item.obj?.grade || 'OTHER';
      gradeData[g] = (gradeData[g] || 0) + Number(item.total_qty_kg || 0);
    });

    const buyerData = {};
    filtered.forEach(item => {
      const b = item.obj?.buyer_name || 'OTHER';
      buyerData[b] = (buyerData[b] || 0) + Number(item.total_inr || 0);
    });

    // 1. Revenue Trend
    if (revenueTrendRef.current) {
      chartInstances.current.revenueTrend = new Chart(revenueTrendRef.current, {
        type: 'line',
        data: {
          labels: monthsSorted,
          datasets: [{
            label: 'Revenue (INR)',
            data: monthsSorted.map(m => monthData[m].revenue),
            borderColor: 'rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            tension: 0.2,
            fill: true
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    // 2. Country Share
    if (countryShareRef.current) {
      chartInstances.current.countryShare = new Chart(countryShareRef.current, {
        type: 'doughnut',
        data: {
          labels: Object.keys(countryData),
          datasets: [{
            data: Object.values(countryData),
            backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#64748b']
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    // 3. Variety Performance
    if (varietyPerfRef.current) {
      chartInstances.current.varietyPerf = new Chart(varietyPerfRef.current, {
        type: 'bar',
        data: {
          labels: Object.keys(varietyData),
          datasets: [{
            label: 'Revenue (INR)',
            data: Object.values(varietyData),
            backgroundColor: '#10b981',
            borderWidth: 0,
            borderRadius: 7,
            borderSkipped: false,
            maxBarThickness: 34
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    // 4. Top Grades
    if (topGradesRef.current) {
      chartInstances.current.topGrades = new Chart(topGradesRef.current, {
        type: 'bar',
        data: {
          labels: Object.keys(gradeData),
          datasets: [{
            label: 'Volume (KG)',
            data: Object.values(gradeData),
            backgroundColor: '#f59e0b',
            borderWidth: 0,
            borderRadius: 7,
            borderSkipped: false,
            maxBarThickness: 34
          }]
        },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false }
      });
    }

    // 5. Top Buyers
    if (topBuyersRef.current) {
      chartInstances.current.topBuyers = new Chart(topBuyersRef.current, {
        type: 'bar',
        data: {
          labels: Object.keys(buyerData),
          datasets: [{
            label: 'Revenue (INR)',
            data: Object.values(buyerData),
            backgroundColor: '#8b5cf6',
            borderWidth: 0,
            borderRadius: 7,
            borderSkipped: false,
            maxBarThickness: 34
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    // 6. Revenue vs Profit
    if (revenueProfitRef.current) {
      chartInstances.current.revenueProfit = new Chart(revenueProfitRef.current, {
        type: 'line',
        data: {
          labels: monthsSorted,
          datasets: [
            { label: 'Revenue (INR)', data: monthsSorted.map(m => monthData[m].revenue), borderColor: '#3b82f6', tension: 0.1 },
            { label: 'Profit (INR)', data: monthsSorted.map(m => monthData[m].profit), borderColor: '#10b981', tension: 0.1 }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    return () => {
      Object.values(chartInstances.current).forEach(c => c.destroy());
    };
  }, [showCharts, filtered]);

  // In-place Update functions
  const handleRateChange = async (rowId, newRate) => {
    try {
      const res = await fetch('/inventory/update_exchange_rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rowId, exchange_rate: Number(newRate) }),
      });
      if (res.ok) {
        const json = await res.json();
        setRowOverrides(prev => ({
          ...prev,
          [rowId]: {
            ...(prev[rowId] || {}),
            total_inr: json.new_inr,
            profit_loss: json.new_pl,
            obj: { ...(prev[rowId]?.obj || {}), exchange_rate: Number(newRate) },
          },
        }));
        showNotice('success', 'Exchange rate updated successfully.');
      } else {
        const json = await res.json().catch(() => ({}));
        showNotice('error', json.detail || 'Failed to update exchange rate.');
      }
    } catch {
      showNotice('error', 'Unable to update the exchange rate.');
    }
  };

  const handleStatusChange = async (rowId, newStatus) => {
    try {
      const res = await fetch('/inventory/update_status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rowId, status: newStatus }),
      });
      if (res.ok) {
        const json = await res.json();
        const updatedIds = json.updated_ids || [rowId];
        setRowOverrides(prev => {
          const next = { ...prev };
          updatedIds.forEach(id => {
            next[id] = {
              ...(next[id] || {}),
              obj: { ...(next[id]?.obj || {}), status: json.new_status || newStatus },
            };
          });
          return next;
        });
        showNotice('success', `Invoice ${json.invoice_no || ''} status updated successfully.`.replace('  ', ' '));
      } else {
        const json = await res.json().catch(() => ({}));
        showNotice('error', json.detail || 'Failed to update payment status.');
      }
    } catch {
      showNotice('error', 'Unable to update payment status.');
    }
  };

  // The report is grouped and subtotalled by PO in both React and the template.
  const poGroups = {};
  filtered.forEach(item => {
    const po = item.obj?.po_number || 'N/A';
    if (!poGroups[po]) poGroups[po] = [];
    poGroups[po].push(item);
  });

  const sortedPOs = Object.keys(poGroups).sort((a, b) => {
    const slA = Number(poGroups[a][0]?.sl_no || 0);
    const slB = Number(poGroups[b][0]?.sl_no || 0);
    return slA - slB || a.localeCompare(b);
  });

  const renderPORows = () => sortedPOs.map(poNumber => {
      const group = poGroups[poNumber];
      let subMc = 0, subQty = 0, subUsd = 0, subInr = 0, subStock = 0, subPL = 0;

      group.forEach(row => {
        const s = row.obj || {};
        subMc += Number(s.no_of_mc || 0);
        subQty += Number(row.total_qty_kg || 0);
        subUsd += Number(row.total_usd || 0);
        subInr += Number(row.total_inr || 0);
        subStock += Number(row.stock_value || 0);
        subPL += Number(row.profit_loss || 0);

      });

      return (
        <Fragment key={poNumber}>
          {group.map((row, idx) => {
            const s = row.obj || {};
            return <tr key={s.id || `${poNumber}-${idx}`}>
            {idx === 0 && (
              <>
                <td rowSpan={group.length} className="text-center" style={{ background: 'var(--header-bg)', fontWeight: 700 }}>
                  {row.sl_no}
                </td>
                <td rowSpan={group.length} className="text-center" style={{ background: 'var(--header-bg)' }}>
                  {poNumber}
                </td>
              </>
            )}
            <td className="text-center" style={{ fontWeight: 800, color: 'var(--corp-rep)' }}>{s.invoice_no}</td>
            <td className="text-center">{s.invoice_date}</td>
            <td>{s.buyer_name}</td>
            <td>{s.country}</td>
            <td>{s.brand}</td>
            <td>{s.variety}</td>
            <td>{s.grade}</td>
            <td>{s.container_no}</td>
            <td>{s.shipping_bill}</td>
            <td className="text-center">{[s.count_glaze, s.weight_glaze].filter(Boolean).join(' / ')}</td>
            <td>{s.packing_style}</td>
            <td className="text-center">{s.no_of_mc}</td>
            <td className="text-right">{fmt.number(row.total_qty_kg)}</td>
            <td className="text-right" style={{ padding: '2px 4px' }}>
                <input
                  type="number"
                  step="0.01"
                  className="edit-input"
                  style={{ width: 60, padding: '2px', height: '24px', textAlign: 'right' }}
                  defaultValue={s.exchange_rate}
                  onBlur={e => {
                    if (Number(e.target.value) !== s.exchange_rate) {
                      handleRateChange(s.id, e.target.value);
                    }
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      handleRateChange(s.id, e.target.value);
                    }
                  }}
                />
            </td>
            <td className="text-right">$ {fmt.number(row.total_usd)}</td>
            <td className="text-right">{fmt.currency(row.total_inr)}</td>
            <td className="text-right">{fmt.currency(row.stock_value)}</td>
            <td className="text-right">{fmt.currency(row.freight_cost)}</td>
            <td className="text-right">{fmt.currency(row.packing_cost)}</td>
            <td className="text-right" style={{ fontWeight: 700, color: row.profit_loss >= 0 ? '#10b981' : '#ef4444' }}>
              {fmt.currency(row.profit_loss)}
            </td>
            <td className="text-center">
              <select
                  value={s.status}
                  onChange={e => handleStatusChange(s.id, e.target.value)}
                  style={{
                    padding: '3px 8px', fontSize: 10, fontWeight: 800,
                    borderRadius: 20, border: '1px solid var(--border)',
                    background: s.status === 'Received' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                    color: s.status === 'Received' ? '#10b981' : '#f59e0b',
                    outline: 'none', cursor: 'pointer'
                  }}
                >
                  <option value="Unpaid">UNPAID</option>
                  <option value="Received">RECEIVED</option>
              </select>
            </td>
            <td>{s.company_name || s.company_id}</td>
          </tr>
          })}

        <tr style={{ background: 'rgba(71,85,105,0.06)', fontWeight: 800 }}>
          <td colSpan={13} style={{ textAlign: 'right', paddingRight: '8px' }}>
            PO SUBTOTAL ({poNumber}):
          </td>
          <td className="text-center">{subMc} MC</td>
          <td className="text-right">{fmt.number(subQty)} KG</td>
          <td></td>
          <td className="text-right">$ {fmt.number(subUsd)}</td>
          <td className="text-right">{fmt.currency(subInr)}</td>
          <td className="text-right">{fmt.currency(subStock)}</td>
          <td className="text-right">{fmt.currency(group.reduce((sum, item) => sum + Number(item.freight_cost || 0), 0))}</td>
          <td className="text-right">{fmt.currency(group.reduce((sum, item) => sum + Number(item.packing_cost || 0), 0))}</td>
          <td className="text-right" style={{ color: subPL >= 0 ? '#10b981' : '#ef4444' }}>
            {fmt.currency(subPL)}
          </td>
          <td colSpan={2}></td>
        </tr>
        </Fragment>
      );
  });

  return (
    <div className="report-viewer-card">
      {notice && (
        <div className={`attendance-toast ${notice.type === 'error' ? 'error' : 'success'}`} role="status" style={{ top: 80 }}>
          {notice.message}
        </div>
      )}
      <ReportHeader title="Export Sales Dispatch Register" loading={loading} onReload={reload} />

      <FilterBar>
        <FilterBox label="Financial Year">
          <FilterSelect value={fyFilter} onChange={setFyFilter}>
            {fyList.map(year => (
              <option key={year} value={String(year)}>FY {year}-{year + 1}</option>
            ))}
            <option value="ALL">ALL FY</option>
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Buyer">
          <FilterSelect value={buyerFilter} onChange={setBuyerFilter}>
            <option value="">ALL BUYERS</option>
            {buyersList.map(b => <option key={b} value={b}>{b}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Country">
          <FilterSelect value={countryFilter} onChange={setCountryFilter}>
            <option value="">ALL COUNTRIES</option>
            {countriesList.map(c => <option key={c} value={c}>{c}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Brand">
          <FilterSelect value={brandFilter} onChange={setBrandFilter}>
            <option value="">ALL BRANDS</option>
            {brandsList.map(b => <option key={b} value={b}>{b}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Invoice No">
          <FilterSelect value={invoiceFilter} onChange={setInvoiceFilter}>
            <option value="">ALL INVOICES</option>
            {invoicesList.map(i => <option key={i} value={i}>{i}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="PO Number">
          <FilterSelect value={poFilter} onChange={setPoFilter}>
            <option value="">ALL POS</option>
            {poList.map(p => <option key={p} value={p}>{p}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Variety">
          <FilterSelect value={varietyFilter} onChange={setVarietyFilter}>
            <option value="">ALL VARIETIES</option>
            {varietiesList.map(v => <option key={v} value={v}>{v}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Grade">
          <FilterSelect value={gradeFilter} onChange={setGradeFilter}>
            <option value="">ALL GRADES</option>
            {gradesList.map(g => <option key={g} value={g}>{g}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Billing Month">
          <FilterSelect value={monthFilter} onChange={setMonthFilter}>
            <option value="">ALL MONTHS</option>
            {monthsList.map(m => <option key={m} value={m}>{m}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Payment Status">
          <FilterSelect value={statusFilter} onChange={setStatusFilter}>
            <option value="">ALL STATUSES</option>
            {statusesList.map(s => <option key={s} value={s}>{s}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Search Stream">
          <SearchInput value={search} onChange={setSearch} placeholder="Invoice, Buyer, Brand, Grd..." />
        </FilterBox>
      </FilterBar>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <button
          onClick={() => setShowCharts(!showCharts)}
          style={{
            padding: '8px 16px', borderRadius: 6, border: 'none', background: 'var(--corp-ops)',
            color: '#fff', fontSize: 11, fontWeight: 800, cursor: 'pointer', textTransform: 'uppercase'
          }}
        >
          {showCharts ? 'Hide Analytics Dashboard' : 'Show Analytics Dashboard'}
        </button>
        <div id="rowCount" style={{ fontSize: 12, fontWeight: 700, color: 'var(--corp-rep)' }}>
          {filtered.length} line items found
        </div>
      </div>

      {showCharts && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 14, marginBottom: 16 }}>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, height: 240 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-secondary)' }}>REVENUE TREND (MONTHLY)</span>
            <div style={{ height: 200 }}><canvas ref={revenueTrendRef} /></div>
          </div>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, height: 240 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-secondary)' }}>COUNTRY MARKET SHARE (REV)</span>
            <div style={{ height: 200 }}><canvas ref={countryShareRef} /></div>
          </div>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, height: 240 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-secondary)' }}>VARIETY PERFORMANCE (REV)</span>
            <div style={{ height: 200 }}><canvas ref={varietyPerfRef} /></div>
          </div>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, height: 240 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-secondary)' }}>TOP GRADES BY VOLUME (KG)</span>
            <div style={{ height: 200 }}><canvas ref={topGradesRef} /></div>
          </div>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, height: 240 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-secondary)' }}>TOP BUYERS BY REVENUE</span>
            <div style={{ height: 200 }}><canvas ref={topBuyersRef} /></div>
          </div>
          <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, height: 240 }}>
            <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text-secondary)' }}>REVENUE VS NET PROFIT</span>
            <div style={{ height: 200 }}><canvas ref={revenueProfitRef} /></div>
          </div>
        </div>
      )}

      {loading && <Loader />}
      {error && <ErrorBox msg={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <KPIGrid>
            <KPICard stacked label="Gross Revenue" value={fmt.currency(totalInr)} accent="var(--corp-fin)" onClick={() => setKpiDetail('revenue')} />
            <KPICard stacked label="Net Profit" value={fmt.currency(totalPL)} accent={totalPL >= 0 ? 'var(--corp-fin)' : '#ef4444'} onClick={() => setKpiDetail('profit')} />
            <KPICard stacked label="Pending Due" value={fmt.currency(pendingDue)} accent="#ef4444" onClick={() => setKpiDetail('pending')} />
            <KPICard stacked label="Profit / KG" value={totalQty > 0 ? fmt.currency(totalPL / totalQty) : '₹0.00'} accent="var(--corp-ops)" onClick={() => setKpiDetail('profitKg')} />
            <KPICard stacked label="Landed Freight" value={fmt.currency(totalFreight)} accent="var(--corp-dash)" onClick={() => setKpiDetail('freight')} />
            <KPICard stacked label="Packing Cost" value={fmt.currency(totalPacking)} accent="var(--corp-rep)" onClick={() => setKpiDetail('packing')} />
            <KPICard stacked label="Volume Sold" value={`${fmt.number(totalQty)} KG`} accent="var(--corp-ops)" onClick={() => setKpiDetail('volume')} />
            <KPICard stacked label="Total Invoices" value={uniqueInvoices} accent="var(--corp-dash)" onClick={() => setKpiDetail('invoices')} />
          </KPIGrid>

          {kpiDetail && (
            <div style={{ border: '1px solid var(--border)', borderRadius: 7, marginBottom: 8, overflow: 'hidden' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: 'var(--header-bg)' }}>
                <strong style={{ fontSize: 11 }}>{kpiLabels[kpiDetail]}</strong>
                <button type="button" onClick={() => setKpiDetail(null)} style={{ border: '1px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)', borderRadius: 5, cursor: 'pointer', fontSize: 10, padding: '3px 8px' }}>Close</button>
              </div>
              <div className="table-responsive" style={{ maxHeight: 220, overflowY: 'auto' }}>
                <table className="bknr-table" style={{ minWidth: 900, width: '100%' }}>
                  <thead><tr><th>PO No</th><th>Invoice No</th><th>Buyer</th><th>Status</th><th className="text-right">KG</th><th className="text-right">INR Value</th><th className="text-right">Freight</th><th className="text-right">Packing</th><th className="text-right">Profit/Loss</th></tr></thead>
                  <tbody>
                    {kpiRows.map(row => <tr key={`kpi-${row.obj?.id}`}><td>{row.obj?.po_number || '-'}</td><td>{row.obj?.invoice_no || '-'}</td><td>{row.obj?.buyer_name || '-'}</td><td>{row.obj?.status || '-'}</td><td className="text-right">{fmt.number(row.total_qty_kg)}</td><td className="text-right">{fmt.currency(row.total_inr)}</td><td className="text-right">{fmt.currency(row.freight_cost)}</td><td className="text-right">{fmt.currency(row.packing_cost)}</td><td className="text-right">{fmt.currency(row.profit_loss)}</td></tr>)}
                    {kpiRows.length === 0 && <EmptyRow cols={9} />}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table className="bknr-table" style={{ minWidth: 2000, width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 45 }}>#</th>
                  <th style={{ width: 110 }}>PO No</th>
                  <th style={{ width: 110 }}>Invoice No</th>
                  <th style={{ width: 100 }}>Date</th>
                  <th style={{ width: 150 }}>Buyer</th>
                  <th style={{ width: 110 }}>Country</th>
                  <th>Brand</th>
                  <th>Variety</th>
                  <th>Grade</th>
                  <th>Container</th>
                  <th>S.Bill</th>
                  <th style={{ width: 100 }} className="text-center">Glaze (C/W)</th>
                  <th>Packing</th>
                  <th style={{ width: 80 }} className="text-center">MC</th>
                  <th style={{ width: 100 }} className="text-right">KG</th>
                  <th style={{ width: 100 }} className="text-right">Ex. Rate</th>
                  <th style={{ width: 110 }} className="text-right">USD Value</th>
                  <th style={{ width: 130 }} className="text-right">INR Value</th>
                  <th style={{ width: 130 }} className="text-right">Stock Cost</th>
                  <th style={{ width: 110 }} className="text-right">Freight</th>
                  <th style={{ width: 120 }} className="text-right">Packing Cost</th>
                  <th style={{ width: 130 }} className="text-right">Profit/Loss</th>
                  <th style={{ width: 130 }} className="text-center">Status</th>
                  <th style={{ width: 130 }}>Company</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <EmptyRow cols={24} />
                ) : (
                  renderPORows()
                )}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 800, background: 'rgba(71,85,105,0.10)', color: 'var(--text-primary)', borderTop: '2px solid var(--border)' }}>
                  <td colSpan={13} style={{ textAlign: 'right' }}>GRAND TOTALS:</td>
                  <td className="text-center">{filtered.reduce((s, r) => s + Number(r.obj?.no_of_mc || 0), 0)} MC</td>
                  <td className="text-right">{fmt.number(totalQty)} KG</td>
                  <td></td>
                  <td className="text-right">$ {fmt.number(totalUsd)}</td>
                  <td className="text-right">{fmt.currency(totalInr)}</td>
                  <td className="text-right">{fmt.currency(filtered.reduce((s, r) => s + Number(r.stock_value || 0), 0))}</td>
                  <td className="text-right">{fmt.currency(totalFreight)}</td>
                  <td className="text-right">{fmt.currency(totalPacking)}</td>
                  <td className="text-right">{fmt.currency(totalPL)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
