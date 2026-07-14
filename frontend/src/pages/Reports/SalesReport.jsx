/**
 * SalesReport.jsx – Export Sales Dispatch Register
 */
import React, { useState, useEffect, useRef } from 'react';
import {
  ReportHeader, FilterBar, FilterBox, FilterSelect, FilterInput,
  KPIGrid, KPICard, Loader, ErrorBox, SearchInput, EmptyRow,
  useReport, fmt
} from './ReportShell';
import Chart from 'chart.js/auto';

export default function SalesReport({ activeRoute }) {
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

  const { data, loading, error, reload } = useReport({ url: activeRoute });
  const [localData, setLocalData] = useState([]);

  // Refs for Chart canvases
  const revenueTrendRef = useRef(null);
  const countryShareRef = useRef(null);
  const varietyPerfRef = useRef(null);
  const topGradesRef = useRef(null);
  const topBuyersRef = useRef(null);
  const revenueProfitRef = useRef(null);
  const chartInstances = useRef({});

  useEffect(() => {
    if (data?.sales_data) {
      setLocalData(data.sales_data);
    }
  }, [data]);

  // Client side filtering
  const filtered = localData.filter(item => {
    const s = item.obj || {};
    if (buyerFilter && s.buyer_name !== buyerFilter) return false;
    if (countryFilter && s.country !== countryFilter) return false;
    if (brandFilter && s.brand !== brandFilter) return false;
    if (invoiceFilter && s.invoice_no !== invoiceFilter) return false;
    if (poFilter && s.po_number !== poFilter) return false;
    if (varietyFilter && s.variety !== varietyFilter) return false;
    if (gradeFilter && s.grade !== gradeFilter) return false;
    if (statusFilter && s.status !== statusFilter) return false;
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
  });

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

  // KPIs
  const totalInr = filtered.reduce((s, d) => s + Number(d.total_inr || 0), 0);
  const totalUsd = filtered.reduce((s, d) => s + Number(d.total_usd || 0), 0);
  const totalPL  = filtered.reduce((s, d) => s + Number(d.profit_loss || 0), 0);
  const totalQty = filtered.reduce((s, d) => s + Number(d.total_qty_kg || 0), 0);
  const totalFreight = filtered.reduce((s, d) => s + Number(d.freight_cost || 0), 0);
  const totalPacking = filtered.reduce((s, d) => s + Number(d.packing_cost || 0), 0);
  const pendingDue = filtered.reduce((s, d) => s + (d.obj?.status !== 'Paid' ? Number(d.total_inr || 0) : 0), 0);
  const uniqueInvoices = new Set(filtered.map(d => d.obj?.invoice_no).filter(Boolean)).size;

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
  }, [showCharts, filtered.length]);

  // In-place Update functions
  const handleRateChange = async (rowId, newRate) => {
    try {
      const res = await fetch(`${activeRoute}/update_exchange_rate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rowId, exchange_rate: Number(newRate) }),
      });
      if (res.ok) {
        const json = await res.json();
        setLocalData(prev => prev.map(item => {
          if (item.obj?.id === rowId) {
            return {
              ...item,
              total_inr: json.new_inr,
              profit_loss: json.new_pl,
              obj: { ...item.obj, exchange_rate: Number(newRate) }
            };
          }
          return item;
        }));
      } else {
        alert('Failed to update exchange rate');
      }
    } catch (err) {
      alert('Error updating rate');
    }
  };

  const handleStatusChange = async (rowId, newStatus) => {
    try {
      const res = await fetch(`${activeRoute}/update_status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rowId, status: newStatus }),
      });
      if (res.ok) {
        setLocalData(prev => prev.map(item => {
          if (item.obj?.id === rowId) {
            return {
              ...item,
              obj: { ...item.obj, status: newStatus }
            };
          }
          return item;
        }));
      } else {
        alert('Failed to update status');
      }
    } catch (err) {
      alert('Error updating status');
    }
  };

  // Group filtered data by Invoice No
  const invoiceGroups = {};
  filtered.forEach(item => {
    const inv = item.obj?.invoice_no || 'N/A';
    if (!invoiceGroups[inv]) invoiceGroups[inv] = [];
    invoiceGroups[inv].push(item);
  });

  const sortedInvoices = Object.keys(invoiceGroups).sort();

  const renderInvoiceRows = () => {
    const trs = [];

    sortedInvoices.forEach(invoiceNo => {
      const group = invoiceGroups[invoiceNo];
      let subMc = 0, subQty = 0, subUsd = 0, subInr = 0, subStock = 0, subPL = 0;

      group.forEach((row, idx) => {
        const s = row.obj || {};
        subMc += Number(s.no_of_mc || 0);
        subQty += Number(row.total_qty_kg || 0);
        subUsd += Number(row.total_usd || 0);
        subInr += Number(row.total_inr || 0);
        subStock += Number(row.stock_value || 0);
        subPL += Number(row.profit_loss || 0);

        trs.push(
          <tr key={`${invoiceNo}-${idx}`}>
            {idx === 0 && (
              <>
                <td rowSpan={group.length} className="text-center" style={{ background: 'var(--header-bg)', fontWeight: 700 }}>
                  {row.sl_no}
                </td>
                <td rowSpan={group.length} className="text-center" style={{ background: 'var(--header-bg)' }}>
                  {s.po_number}
                </td>
                <td rowSpan={group.length} className="text-center" style={{ background: 'var(--header-bg)', fontWeight: 800, color: 'var(--corp-rep)' }}>
                  {invoiceNo}
                </td>
                <td rowSpan={group.length} className="text-center" style={{ background: 'var(--header-bg)' }}>
                  {s.invoice_date}
                </td>
                <td rowSpan={group.length} style={{ background: 'var(--header-bg)' }}>
                  {s.buyer_name}
                </td>
                <td rowSpan={group.length} style={{ background: 'var(--header-bg)' }}>
                  {s.country}
                </td>
              </>
            )}
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
            {idx === 0 && (
              <>
                <td rowSpan={group.length} className="text-center" style={{ background: 'var(--header-bg)' }}>
                  <select
                  value={s.status}
                  onChange={e => handleStatusChange(s.id, e.target.value)}
                  style={{
                    padding: '3px 8px', fontSize: 10, fontWeight: 800,
                    borderRadius: 20, border: '1px solid var(--border)',
                    background: s.status === 'Paid' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                    color: s.status === 'Paid' ? '#10b981' : '#f59e0b',
                    outline: 'none', cursor: 'pointer'
                  }}
                >
                  <option value="Unpaid">UNPAID</option>
                  <option value="Paid">PAID</option>
                  <option value="Cancelled">CANCELLED</option>
                  </select>
                </td>
                <td rowSpan={group.length} style={{ background: 'var(--header-bg)' }}>{s.company_name || s.company_id}</td>
              </>
            )}
          </tr>
        );
      });

      // Subtotal row per Invoice
      trs.push(
        <tr key={`subtotal-${invoiceNo}`} style={{ background: 'rgba(71,85,105,0.06)', fontWeight: 800 }}>
          <td colSpan={13} style={{ textAlign: 'right', paddingRight: '8px' }}>
            SUBTOTAL {invoiceNo}:
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
      );
    });

    return trs;
  };

  return (
    <div className="report-viewer-card">
      <ReportHeader title="Export Sales Dispatch Register" loading={loading} onReload={reload} />

      <FilterBar>
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
          {showCharts ? '📊 Hide Analytics Dashboard' : '📊 Show Analytics Dashboard'}
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
            <KPICard label="Gross Revenue" value={fmt.currency(totalInr)} accent="var(--corp-fin)" />
            <KPICard label="Net Profit" value={fmt.currency(totalPL)} accent={totalPL >= 0 ? 'var(--corp-fin)' : '#ef4444'} />
            <KPICard label="Pending Due" value={fmt.currency(pendingDue)} accent="#ef4444" />
            <KPICard label="Profit / KG" value={totalQty > 0 ? fmt.currency(totalPL / totalQty) : '₹0.00'} accent="var(--corp-ops)" />
            <KPICard label="Landed Freight" value={fmt.currency(totalFreight)} accent="var(--corp-dash)" />
            <KPICard label="Packing Cost" value={fmt.currency(totalPacking)} accent="var(--corp-rep)" />
            <KPICard label="Volume Sold" value={`${fmt.number(totalQty)} KG`} accent="var(--corp-ops)" />
            <KPICard label="Total Invoices" value={uniqueInvoices} accent="var(--corp-dash)" />
          </KPIGrid>

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
                  renderInvoiceRows()
                )}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 800, background: 'var(--accent)', color: '#fff' }}>
                  <td colSpan={13} style={{ textAlign: 'right', color: '#fff' }}>GRAND TOTALS:</td>
                  <td className="text-center" style={{ color: '#fff' }}>{filtered.reduce((s, r) => s + Number(r.obj?.no_of_mc || 0), 0)} MC</td>
                  <td className="text-right" style={{ color: '#fff' }}>{fmt.number(totalQty)} KG</td>
                  <td></td>
                  <td className="text-right" style={{ color: '#fff' }}>$ {fmt.number(totalUsd)}</td>
                  <td className="text-right" style={{ color: '#fff' }}>{fmt.currency(totalInr)}</td>
                  <td className="text-right" style={{ color: '#fff' }}>{fmt.currency(filtered.reduce((s, r) => s + Number(r.stock_value || 0), 0))}</td>
                  <td className="text-right" style={{ color: '#fff' }}>{fmt.currency(totalFreight)}</td>
                  <td className="text-right" style={{ color: '#fff' }}>{fmt.currency(totalPacking)}</td>
                  <td className="text-right" style={{ color: '#fff' }}>{fmt.currency(totalPL)}</td>
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
