import { useState, useEffect, useRef, useMemo, Fragment } from 'react';
import { RefreshCw } from 'lucide-react';
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);
import { Loader, ErrorBox, EmptyRow, useReport } from './ReportShell';
import '../Dashboards/InventoryDashboard.css';

const fmt = (val, dec = 2) => {
  const n = parseFloat(val ?? 0);
  if (isNaN(n)) return '0.00';
  return n.toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec });
};

const fmtVal = (val) => {
  const n = parseFloat(val ?? 0);
  if (isNaN(n)) return '0';
  return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

function parseDateParts(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim().substring(0, 10);
  if (!s) return null;
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(s)) {
    const parts = s.split(/[-/]/);
    return { year: Number(parts[0]), month: Number(parts[1]), day: Number(parts[2]) };
  }
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{4}/.test(s)) {
    const parts = s.split(/[-/]/);
    return { year: Number(parts[2]), month: Number(parts[1]), day: Number(parts[0]) };
  }
  return null;
}

function getFYFromDate(dateStr) {
  const parsed = parseDateParts(dateStr);
  if (!parsed || !parsed.year || !parsed.month) return null;
  return parsed.month >= 4 ? parsed.year : parsed.year - 1;
}

function getCurrentFY() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return String(month >= 4 ? year : year - 1);
}

export default function SalesReport({ activeRoute, setActivePage }) {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [localData, setLocalData] = useState([]);
  const [notice, setNotice] = useState(null);

  // Filter dropdown states — defaults to Current Financial Year
  const [selFy, setSelFy] = useState(() => getCurrentFY());
  const [selBuyer, setSelBuyer] = useState('ALL');
  const [selCountry, setSelCountry] = useState('ALL');
  const [selVariety, setSelVariety] = useState('ALL');
  const [selGrade, setSelGrade] = useState('ALL');
  const [selStatus, setSelStatus] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Table View Tab state (closing register vs summary vs ledger)
  const [salesTableTab, setSalesTableTab] = useState('register');

  // Interactive chart filter states
  const [buyerChartFilter, setBuyerChartFilter] = useState(null);
  const [varietyChartFilter, setVarietyChartFilter] = useState(null);

  // Chart canvas refs
  const revenueTrendRef = useRef(null);
  const countryShareRef = useRef(null);
  const varietyPerfRef = useRef(null);
  const topGradesRef = useRef(null);
  const topBuyersRef = useRef(null);
  const revenueProfitRef = useRef(null);
  const chartInstances = useRef({});

  // Fetch sales report data via ReportShell hook
  const { data, loading, error, reload } = useReport({
    url: activeRoute || '/inventory/sales_report',
  });

  useEffect(() => {
    const list = data?.sales_data || data?.raw_rows || data?.rows || [];
    setLocalData(list);
  }, [data]);

  const showNotice = (type, message) => {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 3500);
  };

  const handleStatusChange = async (id, newStatus) => {
    setLocalData(prev => prev.map(item => item.obj?.id === id ? { ...item, obj: { ...item.obj, status: newStatus } } : item));
    try {
      const res = await fetch('/inventory/update_status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus })
      });
      if (res.ok) {
        showNotice('success', `Payment status updated to ${newStatus}`);
      } else {
        showNotice('error', 'Failed to update payment status.');
      }
    } catch {
      showNotice('error', 'Unable to update payment status.');
    }
  };

  const handleRateChange = async (id, newRate) => {
    const rateVal = parseFloat(newRate);
    if (isNaN(rateVal) || rateVal <= 0) return;
    setLocalData(prev => prev.map(item => {
      if (item.obj?.id === id) {
        const usd = parseFloat(item.total_usd) || 0;
        const newInr = usd * rateVal;
        const stockVal = parseFloat(item.stock_value) || 0;
        const newPl = newInr - stockVal;
        return {
          ...item,
          total_inr: newInr,
          profit_loss: newPl,
          obj: { ...item.obj, exchange_rate: rateVal }
        };
      }
      return item;
    }));
    try {
      const res = await fetch('/inventory/update_exchange_rate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, exchange_rate: rateVal })
      });
      if (res.ok) {
        showNotice('success', 'Exchange rate updated successfully.');
      } else {
        showNotice('error', 'Failed to update exchange rate.');
      }
    } catch {
      showNotice('error', 'Unable to update exchange rate.');
    }
  };

  const rawObjList = useMemo(() => localData.map(r => r.obj || {}), [localData]);

  // Derived filter options
  const fyList = useMemo(() => {
    const years = new Set(rawObjList.map(o => getFYFromDate(o.invoice_date)).filter(Boolean));
    return [...years].sort((a, b) => b - a);
  }, [rawObjList]);

  // Ensure default FY selects current FY or latest available FY in DB
  useEffect(() => {
    if (fyList.length > 0) {
      const currentFYStr = getCurrentFY();
      if (fyList.includes(Number(currentFYStr))) {
        setSelFy(currentFYStr);
      } else {
        setSelFy(String(fyList[0]));
      }
    }
  }, [fyList]);

  const buyersList = useMemo(() => [...new Set(rawObjList.map(o => o.buyer_name).filter(Boolean))].sort(), [rawObjList]);
  const countriesList = useMemo(() => [...new Set(rawObjList.map(o => o.country).filter(Boolean))].sort(), [rawObjList]);
  const varietiesList = useMemo(() => [...new Set(rawObjList.map(o => o.variety).filter(Boolean))].sort(), [rawObjList]);
  const gradesList = useMemo(() => [...new Set(rawObjList.map(o => o.grade).filter(Boolean))].sort(), [rawObjList]);

  // Local Filtered Rows
  const filtered = useMemo(() => localData.filter(item => {
    const s = item.obj || {};
    // Ignore incomplete/empty records missing key required fields (invoice_no, po_number, buyer_name, container_no, or shipping_bill)
    if (!s.invoice_no || !s.po_number || !s.buyer_name || !s.container_no || !s.shipping_bill) return false;

    if (selBuyer !== 'ALL' && s.buyer_name !== selBuyer) return false;
    if (selCountry !== 'ALL' && s.country !== selCountry) return false;
    if (selVariety !== 'ALL' && s.variety !== selVariety) return false;
    if (selGrade !== 'ALL' && s.grade !== selGrade) return false;
    if (selStatus !== 'ALL' && s.status !== selStatus) return false;
    if (buyerChartFilter && s.buyer_name !== buyerChartFilter) return false;
    if (varietyChartFilter && s.variety !== varietyChartFilter) return false;

    if (selFy !== 'ALL') {
      const targetYear = Number(selFy);
      const rowFY = getFYFromDate(s.invoice_date);
      if (rowFY !== null && rowFY !== targetYear) return false;
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const txt = `${s.invoice_no || ''} ${s.po_number || ''} ${s.buyer_name || ''} ${s.country || ''} ${s.brand || ''} ${s.variety || ''} ${s.grade || ''} ${s.container_no || ''} ${s.shipping_bill || ''}`.toLowerCase();
      if (!txt.includes(q)) return false;
    }
    return true;
  }), [localData, selBuyer, selCountry, selVariety, selGrade, selStatus, selFy, searchQuery, buyerChartFilter, varietyChartFilter]);

  // Aggregated Key Metrics
  const totalQty = filtered.reduce((s, d) => s + Number(d.total_qty_kg || 0), 0);
  const totalUsd = filtered.reduce((s, d) => s + Number(d.total_usd || 0), 0);
  const totalInr = filtered.reduce((s, d) => s + Number(d.total_inr || 0), 0);
  const totalStockValue = filtered.reduce((s, d) => s + Number(d.stock_value || 0), 0);
  const totalFreight = filtered.reduce((s, d) => s + Number(d.freight_cost || 0), 0);
  const totalPacking = filtered.reduce((s, d) => s + Number(d.packing_cost || 0), 0);
  const totalPL = filtered.reduce((s, d) => s + Number(d.profit_loss || 0), 0);
  const totalMc = filtered.reduce((s, d) => s + Number(d.obj?.no_of_mc || 0), 0);
  const pendingDue = filtered.reduce((s, d) => s + (d.obj?.status === 'Unpaid' ? Number(d.total_inr || 0) : 0), 0);
  const uniqueInvoices = new Set(filtered.map(d => d.obj?.invoice_no).filter(Boolean)).size;
  const uniquePOs = new Set(filtered.map(d => d.obj?.po_number).filter(Boolean)).size;

  // Grouping and Sorting POs
  const { poGroups, sortedPOs, poSummaryRows } = useMemo(() => {
    const groups = {};
    filtered.forEach(item => {
      const po = item.obj?.po_number || 'N/A';
      if (!groups[po]) groups[po] = [];
      groups[po].push(item);
    });

    const sorted = Object.keys(groups).sort((a, b) => {
      const dateA = String(groups[a][0]?.obj?.invoice_date || groups[a][0]?.obj?.date || '');
      const dateB = String(groups[b][0]?.obj?.invoice_date || groups[b][0]?.obj?.date || '');
      if (dateA !== dateB) {
        return dateB.localeCompare(dateA); // Descending date order (newest date first)
      }
      const slA = Number(groups[a][0]?.sl_no || 0);
      const slB = Number(groups[b][0]?.sl_no || 0);
      return slB - slA || b.localeCompare(a);
    });

    const summary = sorted.map((poNumber, index) => {
      const group = groups[poNumber];
      const firstObj = group[0]?.obj || {};
      const slNo = sorted.length - index;
      
      let mc = 0, qty = 0, usd = 0, inr = 0, stock = 0, freight = 0, packing = 0, pl = 0;
      const invoices = new Set();
      group.forEach(row => {
        const s = row.obj || {};
        if (s.invoice_no) invoices.add(s.invoice_no);
        mc += Number(s.no_of_mc || 0);
        qty += Number(row.total_qty_kg || 0);
        usd += Number(row.total_usd || 0);
        inr += Number(row.total_inr || 0);
        stock += Number(row.stock_value || 0);
        freight += Number(row.freight_cost || 0);
        packing += Number(row.packing_cost || 0);
        pl += Number(row.profit_loss || 0);
      });

      return {
        slNo,
        poNumber,
        date: firstObj.invoice_date || firstObj.date || '—',
        invoiceNo: [...invoices].join(', ') || '—',
        buyer: firstObj.buyer_name || '—',
        country: firstObj.country || '—',
        itemCount: group.length,
        mc,
        qty,
        usd,
        inr,
        stock,
        freight,
        packing,
        pl,
      };
    });

    return { poGroups: groups, sortedPOs: sorted, poSummaryRows: summary };
  }, [filtered]);

  // CSV Exporter matching Inventory Dashboard
  const exportToCSV = (rowsToExport, filename) => {
    const headers = ['SL', 'PO Number', 'Invoice No', 'Date', 'Buyer', 'Country', 'Brand', 'Variety', 'Grade', 'MC', 'Qty KG', 'USD Value', 'INR Value', 'Stock Cost', 'Freight', 'Packing Cost', 'Profit/Loss', 'Status'];
    const csvRows = [headers.join(',')];

    rowsToExport.forEach((item, i) => {
      const s = item.obj || {};
      const values = [
        i + 1,
        s.po_number || '',
        s.invoice_no || '',
        s.invoice_date || '',
        s.buyer_name || '',
        s.country || '',
        s.brand || '',
        s.variety || '',
        s.grade || '',
        s.no_of_mc ?? 0,
        item.total_qty_kg ?? 0,
        item.total_usd ?? 0,
        item.total_inr ?? 0,
        item.stock_value ?? 0,
        item.freight_cost ?? 0,
        item.packing_cost ?? 0,
        item.profit_loss ?? 0,
        s.status || ''
      ];
      const escaped = values.map(v => {
        const str = String(v ?? '');
        return str.includes(',') ? `"${str.replace(/"/g, '""')}"` : str;
      });
      csvRows.push(escaped.join(','));
    });

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Render ChartJS charts with same exact configurations as Inventory Dashboard
  useEffect(() => {
    if (filtered.length === 0 || !Chart) return;

    const timer = setTimeout(() => {
      const chartTextColor = '#475569';
      const chartGridColor = '#cbd5e1';
      const font = { family: 'Plus Jakarta Sans', size: 9, weight: 'bold' };

      const monthData = {};
      filtered.forEach(item => {
        const s = item.obj || item || {};
        const rawDate = s.invoice_date || s.date || item.invoice_date || '';
        const parsed = parseDateParts(rawDate);
        let m = 'UNKNOWN';
        if (parsed && parsed.year && parsed.month) {
          const monthStr = String(parsed.month).padStart(2, '0');
          m = `${parsed.year}-${monthStr}`;
        } else if (rawDate.length >= 7) {
          m = rawDate.substring(0, 7);
        }
        const rev = Number(item.total_inr ?? s.total_inr ?? s.amount_inr ?? 0);
        const profit = Number(item.profit_loss ?? s.profit_loss ?? 0);
        if (!monthData[m]) monthData[m] = { revenue: 0, profit: 0 };
        monthData[m].revenue += rev;
        monthData[m].profit += profit;
      });
      const monthsSorted = Object.keys(monthData).sort();

      const countryData = {};
      filtered.forEach(item => {
        const s = item.obj || item || {};
        const c = s.country || item.country || 'OTHER';
        const rev = Number(item.total_inr ?? s.total_inr ?? s.amount_inr ?? 0);
        countryData[c] = (countryData[c] || 0) + rev;
      });

      const varietyData = {};
      filtered.forEach(item => {
        const s = item.obj || item || {};
        const v = s.variety || item.variety || 'OTHER';
        const rev = Number(item.total_inr ?? s.total_inr ?? s.amount_inr ?? 0);
        varietyData[v] = (varietyData[v] || 0) + rev;
      });

      const gradeData = {};
      filtered.forEach(item => {
        const s = item.obj || item || {};
        const g = s.grade || item.grade || 'OTHER';
        const qty = Number(item.total_qty_kg ?? s.total_qty_kg ?? s.sales_quantity ?? 0);
        gradeData[g] = (gradeData[g] || 0) + qty;
      });

      const buyerData = {};
      filtered.forEach(item => {
        const s = item.obj || item || {};
        const b = s.buyer_name || item.buyer_name || 'OTHER';
        const rev = Number(item.total_inr ?? s.total_inr ?? s.amount_inr ?? 0);
        buyerData[b] = (buyerData[b] || 0) + rev;
      });

      const valueLabelPlugin = {
        id: 'valueLabelPlugin',
        afterDatasetsDraw(chart) {
          const { ctx } = chart;
          ctx.save();
          ctx.font = 'bold 8px "Plus Jakarta Sans", sans-serif';
          ctx.fillStyle = '#334155';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';

          chart.data.datasets.forEach((dataset, i) => {
            const meta = chart.getDatasetMeta(i);
            meta.data.forEach((element, index) => {
              const val = dataset.data[index];
              if (val === undefined || val === null || val === 0) return;
              const formatted = typeof val === 'number'
                ? (val >= 10000000 ? `${(val / 10000000).toFixed(1)}Cr` : (val >= 100000 ? `${(val / 100000).toFixed(1)}L` : (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : String(Math.round(val)))))
                : String(val);

              const pos = element.tooltipPosition();
              ctx.fillText(formatted, pos.x, pos.y - 2);
            });
          });
          ctx.restore();
        }
      };

      const createChart = (key, ref, type, labels, datasets, options = {}) => {
        if (!ref.current) return;
        const ctx = ref.current.getContext('2d');
        if (chartInstances.current[key]) {
          chartInstances.current[key].destroy();
        }
        chartInstances.current[key] = new Chart(ctx, {
          type,
          data: { labels, datasets },
          plugins: [valueLabelPlugin],
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: chartTextColor, font } } },
            scales: type !== 'doughnut' ? {
              x: { ticks: { color: chartTextColor }, grid: { color: chartGridColor } },
              y: { ticks: { color: chartTextColor }, grid: { color: chartGridColor } }
            } : {},
            ...options
          }
        });
      };

      createChart('revenueTrend', revenueTrendRef, 'line', monthsSorted, [{ label: 'Revenue (₹)', data: monthsSorted.map(m => monthData[m].revenue), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.15)', fill: true, tension: 0.4 }]);
      createChart('countryShare', countryShareRef, 'doughnut', Object.keys(countryData), [{ data: Object.values(countryData), backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'] }], { plugins: { legend: { position: 'right', labels: { color: chartTextColor, font } } } });
      createChart('varietyPerf', varietyPerfRef, 'bar', Object.keys(varietyData), [{ label: 'Revenue (₹)', data: Object.values(varietyData), backgroundColor: '#10b981' }]);
      createChart('topGrades', topGradesRef, 'bar', Object.keys(gradeData), [{ label: 'Volume (KG)', data: Object.values(gradeData), backgroundColor: '#f59e0b' }]);
      createChart('topBuyers', topBuyersRef, 'bar', Object.keys(buyerData), [{ label: 'Revenue (₹)', data: Object.values(buyerData), backgroundColor: '#8b5cf6' }], {
        onClick: (e, elements) => {
          if (!elements.length) return;
          const label = Object.keys(buyerData)[elements[0].index];
          if (label) setBuyerChartFilter(prev => prev === label ? null : label);
        }
      });
      createChart('revenueProfit', revenueProfitRef, 'line', monthsSorted, [
        { label: 'Revenue (₹)', data: monthsSorted.map(m => monthData[m].revenue), borderColor: '#3b82f6', tension: 0.3 },
        { label: 'Net Profit (₹)', data: monthsSorted.map(m => monthData[m].profit), borderColor: '#10b981', tension: 0.3 }
      ]);
    }, 100);

    return () => {
      clearTimeout(timer);
      Object.values(chartInstances.current).forEach(c => c.destroy());
    };
  }, [filtered]);

  // Render PO Rows
  const renderPORows = () => sortedPOs.map((poNumber, groupIdx) => {
    const group = poGroups[poNumber] || [];
    const displaySlNo = sortedPOs.length - groupIdx;
    let subMc = 0, subQty = 0, subUsd = 0, subInr = 0, subStock = 0, subFreight = 0, subPacking = 0, subPL = 0;

    group.forEach(row => {
      const s = row.obj || {};
      subMc += Number(s.no_of_mc || 0);
      subQty += Number(row.total_qty_kg || 0);
      subUsd += Number(row.total_usd || 0);
      subInr += Number(row.total_inr || 0);
      subStock += Number(row.stock_value || 0);
      subFreight += Number(row.freight_cost || 0);
      subPacking += Number(row.packing_cost || 0);
      subPL += Number(row.profit_loss || 0);
    });

    return (
      <Fragment key={poNumber}>
        {group.map((row, idx) => {
          const s = row.obj || {};
          return (
            <tr key={s.id || `${poNumber}-${idx}`}>
              {idx === 0 && (
                <>
                  <td rowSpan={group.length} style={{ fontWeight: 800 }}>
                    {displaySlNo}
                  </td>
                  <td rowSpan={group.length} style={{ fontWeight: 800 }}>
                    {poNumber}
                  </td>
                </>
              )}
              <td style={{ fontWeight: 700 }}>{s.invoice_no}</td>
              <td>{s.invoice_date}</td>
              <td style={{ fontWeight: 700 }}>{s.buyer_name}</td>
              <td>{s.country}</td>
              <td>{s.brand}</td>
              <td>{s.variety}</td>
              <td style={{ fontWeight: 700 }}>{s.grade}</td>
              <td>{s.container_no}</td>
              <td>{s.shipping_bill}</td>
              <td>{[s.count_glaze, s.weight_glaze].filter(Boolean).join(' / ')}</td>
              <td>{s.packing_style}</td>
              <td align="right">{s.no_of_mc}</td>
              <td align="right" style={{ fontWeight: 800 }}>{fmt(row.total_qty_kg)}</td>
              <td align="right" style={{ padding: '2px 4px' }}>
                <input
                  type="number"
                  step="0.01"
                  className="edit-input"
                  style={{ width: 60, padding: '2px', height: '24px', textAlign: 'right' }}
                  defaultValue={s.exchange_rate}
                  onBlur={e => {
                    if (Number(e.target.value) !== s.exchange_rate) handleRateChange(s.id, e.target.value);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleRateChange(s.id, e.target.value);
                  }}
                />
              </td>
              <td align="right">$ {fmt(row.total_usd)}</td>
              <td align="right" style={{ fontWeight: 800 }}>{fmtVal(row.total_inr)}</td>
              <td align="right">{fmtVal(row.stock_value)}</td>
              <td align="right">{fmtVal(row.freight_cost)}</td>
              <td align="right">{fmtVal(row.packing_cost)}</td>
              <td align="right" style={{ fontWeight: 800, color: row.profit_loss >= 0 ? '#10b981' : '#ef4444' }}>
                {fmtVal(row.profit_loss)}
              </td>
              <td>
                <select
                  value={s.status}
                  onChange={e => handleStatusChange(s.id, e.target.value)}
                  style={{
                    padding: '2px 6px', fontSize: 10, fontWeight: 800, borderRadius: 4,
                    border: '1px solid var(--border-light)',
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
          );
        })}

        <tr style={{ borderTop: '1px solid var(--border-light)', fontSize: '11px' }}>
          <td colSpan={13} style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-secondary)' }}>
            PO SUBTOTAL ({poNumber}):
          </td>
          <td align="right" style={{ fontWeight: 700 }}>{subMc} MC</td>
          <td align="right" style={{ fontWeight: 700 }}>{fmt(subQty)} KG</td>
          <td></td>
          <td align="right" style={{ fontWeight: 700 }}>$ {fmt(subUsd)}</td>
          <td align="right" style={{ fontWeight: 700 }}>₹ {fmtVal(subInr)}</td>
          <td align="right" style={{ fontWeight: 700 }}>₹ {fmtVal(subStock)}</td>
          <td align="right" style={{ fontWeight: 700 }}>₹ {fmtVal(subFreight)}</td>
          <td align="right" style={{ fontWeight: 700 }}>₹ {fmtVal(subPacking)}</td>
          <td align="right" style={{ fontWeight: 800, color: subPL >= 0 ? '#10b981' : '#ef4444' }}>
            ₹ {fmtVal(subPL)}
          </td>
          <td colSpan={2}></td>
        </tr>
      </Fragment>
    );
  });

  // Inventory Dashboard UI Inline Styles
  const chartBoxStyle = {
    background: 'var(--surface-panel)', border: '1px solid var(--border-light)',
    borderRadius: '10px', padding: '10px 14px', height: '230px', boxShadow: 'var(--shadow-soft)',
    display: 'flex', flexDirection: 'column'
  };

  const statusCardStyle = (color, isActive = false) => ({
    background: 'var(--surface-panel)',
    border: isActive ? `2px solid ${color}` : '1px solid var(--border-light)',
    borderLeft: `5px solid ${color}`, borderRadius: '10px', padding: '12px 10px',
    textAlign: 'center', boxShadow: 'var(--shadow-soft)', cursor: 'pointer',
    transition: 'all 0.2s ease', transform: isActive ? 'scale(1.02)' : 'none'
  });

  const filterBar = {
    display: 'flex', gap: '8px', flexWrap: 'nowrap', padding: '8px 12px',
    background: 'var(--surface-panel)', borderRadius: '10px', border: '1px solid var(--border-light)',
    marginBottom: '12px', alignItems: 'flex-end', overflowX: 'auto', overflowY: 'hidden',
    WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin'
  };
  const filterGrp = { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: '120px', flex: '0 0 120px' };
  const filterLbl = { fontSize: '9px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' };
  const filterSelect = {
    height: '28px', padding: '0 8px', fontSize: '11px', fontWeight: 700,
    background: 'var(--input-bg)', border: '1px solid var(--input-border)',
    borderRadius: '6px', color: 'var(--text-primary)', outline: 'none'
  };
  const card = {
    background: 'var(--surface-panel)', border: '1px solid var(--border-light)',
    borderRadius: '12px', padding: '16px', boxShadow: 'var(--shadow-soft)'
  };
  const secHeader = { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', marginTop: '20px' };
  const secTitle = { fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' };
  const secLine = { flex: 1, height: '1px', background: 'var(--border-light)' };

  const stockTabStyle = (active) => ({
    minWidth: '140px', height: '36px', padding: '0 14px',
    border: active ? '1px solid var(--ui-accent, #3b82f6)' : '1px solid transparent',
    borderRadius: '6px',
    background: active ? 'color-mix(in srgb, var(--ui-accent, #3b82f6) 10%, var(--surface-panel))' : 'transparent',
    color: active ? 'var(--ui-accent, #3b82f6)' : 'var(--text-secondary)',
    fontSize: '12px', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap'
  });

  const isMobile = windowWidth <= 992;

  return (
    <div style={{ width: '100%', height: '100%', overflowY: 'auto', boxSizing: 'border-box', padding: '10px 14px' }}>
      {notice && (
        <div className={`attendance-toast ${notice.type === 'error' ? 'error' : 'success'}`} role="status" style={{ top: 80 }}>
          {notice.message}
        </div>
      )}

      <div>
        <div style={{ padding: '0px' }}>

          {/* Compact Top Header Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-receipt" style={{ color: '#3b82f6' }}></i>
                Export Sales Dashboard
              </h2>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <div style={{ padding: '3px 8px', borderRadius: '5px', background: 'var(--ui-accent, #3b82f6)', color: '#fff', fontWeight: 700, fontSize: '10px' }}>
                FY {selFy === 'ALL' ? (fyList[0] || 'ALL') : selFy}
              </div>
            </div>
          </div>

          {/* Ultra-Compact Filters Toolbar at ABSOLUTE TOP */}
          <div className="erp-horizontal-filter-row" style={{ ...filterBar, marginBottom: '8px', padding: '6px 10px' }}>
            <div style={filterGrp}>
              <label style={filterLbl}>Financial Year</label>
              <select style={{ ...filterSelect, height: '26px' }} value={selFy} onChange={e => setSelFy(e.target.value)}>
                <option value="ALL">ALL YEARS</option>
                {fyList.map(y => <option key={y} value={String(y)}>FY {y}-{y + 1}</option>)}
              </select>
            </div>
            <div style={filterGrp}>
              <label style={filterLbl}>Buyer</label>
              <select style={{ ...filterSelect, height: '26px' }} value={selBuyer} onChange={e => setSelBuyer(e.target.value)}>
                <option value="ALL">ALL BUYERS</option>
                {buyersList.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div style={filterGrp}>
              <label style={filterLbl}>Country</label>
              <select style={{ ...filterSelect, height: '26px' }} value={selCountry} onChange={e => setSelCountry(e.target.value)}>
                <option value="ALL">ALL COUNTRIES</option>
                {countriesList.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={filterGrp}>
              <label style={filterLbl}>Variety</label>
              <select style={{ ...filterSelect, height: '26px' }} value={selVariety} onChange={e => setSelVariety(e.target.value)}>
                <option value="ALL">ALL VARIETIES</option>
                {varietiesList.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div style={filterGrp}>
              <label style={filterLbl}>Grade</label>
              <select style={{ ...filterSelect, height: '26px' }} value={selGrade} onChange={e => setSelGrade(e.target.value)}>
                <option value="ALL">ALL GRADES</option>
                {gradesList.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div style={filterGrp}>
              <label style={filterLbl}>Payment Status</label>
              <select style={{ ...filterSelect, height: '26px' }} value={selStatus} onChange={e => setSelStatus(e.target.value)}>
                <option value="ALL">ALL STATUSES</option>
                <option value="Unpaid">UNPAID</option>
                <option value="Received">RECEIVED</option>
              </select>
            </div>
            <div style={{ ...filterGrp, flexGrow: 1 }}>
              <label style={filterLbl}>Search Table</label>
              <input
                type="text"
                style={{ ...filterSelect, height: '26px', borderLeft: '3px solid var(--ui-accent, #3b82f6)' }}
                placeholder="Type to filter PO, Invoice, Buyer..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div role="alert" style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(239,68,68,.35)', background: 'rgba(239,68,68,.08)', color: '#ef4444', fontSize: 12, fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <span>{error}</span>
              <button type="button" onClick={reload} style={{ border: '1px solid currentColor', borderRadius: 6, background: 'transparent', color: 'inherit', padding: '5px 10px', fontWeight: 800, cursor: 'pointer' }}>Retry</button>
            </div>
          )}

          {/* Premium KPI Cards Grid */}
          <div className="kpi-grid">
            <div className="kpi-card kpi-blue" style={{ cursor: 'pointer' }} onClick={() => setSelStatus('ALL')} title="Click to show all status records">
              <div className="kpi-header">
                <h4>Gross Revenue</h4>
                <div className="kpi-icon"><i className="fa-solid fa-indian-rupee-sign"></i></div>
              </div>
              <div>
                <div className="value">₹ {fmtVal(totalInr)}</div>
                <div className="amt-sub">$ {fmt(totalUsd)} • {uniqueInvoices} Invoices ({uniquePOs} POs)</div>
              </div>
            </div>

            <div className="kpi-card kpi-indigo" style={{ cursor: 'pointer' }} onClick={() => setSelStatus('ALL')} title="Click to show all status records">
              <div className="kpi-header">
                <h4>Inv Value (Sold Stock)</h4>
                <div className="kpi-icon"><i className="fa-solid fa-boxes-stacked"></i></div>
              </div>
              <div>
                <div className="value">₹ {fmtVal(totalStockValue)}</div>
                <div className="amt-sub">Cost of Goods Sold</div>
              </div>
            </div>

            <div className="kpi-card kpi-green" style={{ cursor: 'pointer' }} onClick={() => setSelStatus('ALL')} title="Click to show all status records">
              <div className="kpi-header">
                <h4>Net Profit</h4>
                <div className="kpi-icon"><i className="fa-solid fa-chart-line"></i></div>
              </div>
              <div>
                <div className="value">₹ {fmtVal(totalPL)}</div>
                <div className="amt-sub">{totalQty > 0 ? `₹ ${fmt(totalPL / totalQty)} / KG` : '₹ 0.00 / KG'}</div>
              </div>
            </div>

            <div
              className="kpi-card kpi-orange"
              style={{
                cursor: 'pointer',
                outline: selStatus === 'Unpaid' ? '2px solid #f59e0b' : 'none',
                transform: selStatus === 'Unpaid' ? 'scale(1.02)' : 'none'
              }}
              onClick={() => setSelStatus(prev => prev === 'Unpaid' ? 'ALL' : 'Unpaid')}
              title="Click to filter Unpaid pending invoices"
            >
              <div className="kpi-header">
                <h4>Pending Due</h4>
                <div className="kpi-icon"><i className="fa-solid fa-clock"></i></div>
              </div>
              <div>
                <div className="value">₹ {fmtVal(pendingDue)}</div>
                <div className="amt-sub">{selStatus === 'Unpaid' ? 'Active Filter: UNPAID' : 'Click to Filter Unpaid'}</div>
              </div>
            </div>

            <div className="kpi-card kpi-cyan" style={{ cursor: 'pointer' }} onClick={() => setSelStatus('ALL')}>
              <div className="kpi-header">
                <h4>Profit / KG</h4>
                <div className="kpi-icon"><i className="fa-solid fa-scale-balanced"></i></div>
              </div>
              <div>
                <div className="value">₹ {totalQty > 0 ? fmt(totalPL / totalQty) : '0.00'}</div>
                <div className="amt-sub">Per KG Net Margin</div>
              </div>
            </div>

            <div className="kpi-card kpi-purple" style={{ cursor: 'pointer' }} onClick={() => setSelStatus('ALL')}>
              <div className="kpi-header">
                <h4>Landed Freight</h4>
                <div className="kpi-icon"><i className="fa-solid fa-ship"></i></div>
              </div>
              <div>
                <div className="value">₹ {fmtVal(totalFreight)}</div>
                <div className="amt-sub">Logistics Costs</div>
              </div>
            </div>

            <div className="kpi-card kpi-pink" style={{ cursor: 'pointer' }} onClick={() => setSelStatus('ALL')}>
              <div className="kpi-header">
                <h4>Packing Cost</h4>
                <div className="kpi-icon"><i className="fa-solid fa-box-open"></i></div>
              </div>
              <div>
                <div className="value">₹ {fmtVal(totalPacking)}</div>
                <div className="amt-sub">Material Expense</div>
              </div>
            </div>

            <div className="kpi-card kpi-teal" style={{ cursor: 'pointer' }} onClick={() => setSelStatus('ALL')}>
              <div className="kpi-header">
                <h4>Volume Sold</h4>
                <div className="kpi-icon"><i className="fa-solid fa-weight-hanging"></i></div>
              </div>
              <div>
                <div className="value">{fmt(totalQty)} KG</div>
                <div className="amt-sub">{totalMc.toLocaleString('en-IN')} MC Boxes</div>
              </div>
            </div>
          </div>

          {/* Compact Interactive Charts Grid (3 columns x 2 rows) */}
          <div style={{ display: 'grid', gridTemplateColumns: !isMobile ? 'repeat(3, 1fr)' : '1fr', gap: '12px', marginBottom: '12px' }}>
            <div style={chartBoxStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', borderBottom: '1px solid var(--border-light)', paddingBottom: '4px' }}>
                <h3 style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px', margin: 0 }}>Monthly Revenue Trend</h3>
              </div>
              <div style={{ position: 'relative', width: '100%', height: '165px' }}><canvas ref={revenueTrendRef}></canvas></div>
            </div>

            <div style={chartBoxStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', borderBottom: '1px solid var(--border-light)', paddingBottom: '4px' }}>
                <h3 style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px', margin: 0 }}>Country Market Share</h3>
              </div>
              <div style={{ position: 'relative', width: '100%', height: '165px' }}><canvas ref={countryShareRef}></canvas></div>
            </div>

            <div style={chartBoxStyle}>
              <h3 style={{ fontSize: '10px', fontWeight: 800, marginBottom: '6px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px', borderBottom: '1px solid var(--border-light)', paddingBottom: '4px' }}>Variety Revenue Performance</h3>
              <div style={{ position: 'relative', width: '100%', height: '165px' }}><canvas ref={varietyPerfRef}></canvas></div>
            </div>

            <div style={chartBoxStyle}>
              <h3 style={{ fontSize: '10px', fontWeight: 800, marginBottom: '6px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px', borderBottom: '1px solid var(--border-light)', paddingBottom: '4px' }}>Top Grades Volume (KG)</h3>
              <div style={{ position: 'relative', width: '100%', height: '165px' }}><canvas ref={topGradesRef}></canvas></div>
            </div>

            <div style={chartBoxStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', borderBottom: '1px solid var(--border-light)', paddingBottom: '4px' }}>
                <h3 style={{ fontSize: '10px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px', margin: 0 }}>
                  {buyerChartFilter ? `Top Buyers — Filtered: ${buyerChartFilter}` : 'Top Buyers Revenue'}
                </h3>
                {buyerChartFilter && (
                  <button onClick={() => setBuyerChartFilter(null)} style={{ border: '1px solid var(--border-light)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '9px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', cursor: 'pointer' }}>Clear</button>
                )}
              </div>
              <div style={{ position: 'relative', width: '100%', height: '165px' }}><canvas ref={topBuyersRef}></canvas></div>
            </div>

            <div style={chartBoxStyle}>
              <h3 style={{ fontSize: '10px', fontWeight: 800, marginBottom: '6px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px', borderBottom: '1px solid var(--border-light)', paddingBottom: '4px' }}>Revenue vs Net Profit</h3>
              <div style={{ position: 'relative', width: '100%', height: '165px' }}><canvas ref={revenueProfitRef}></canvas></div>
            </div>
          </div>

          {/* Clickable Payment & Status Summary Cards */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
              <div
                style={statusCardStyle('#10b981', selStatus === 'Received')}
                onClick={() => setSelStatus(prev => prev === 'Received' ? 'ALL' : 'Received')}
                title="Click to filter Received invoices"
              >
                <h4 style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 800, letterSpacing: '0.6px' }}>Received Invoices</h4>
                <h2 style={{ fontSize: '16px', marginTop: '6px', fontWeight: 800, color: '#10b981' }}>{filtered.filter(r => r.obj?.status === 'Received').length}</h2>
              </div>

              <div
                style={statusCardStyle('#f59e0b', selStatus === 'Unpaid')}
                onClick={() => setSelStatus(prev => prev === 'Unpaid' ? 'ALL' : 'Unpaid')}
                title="Click to filter Pending unpaid invoices"
              >
                <h4 style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 800, letterSpacing: '0.6px' }}>Pending Invoices</h4>
                <h2 style={{ fontSize: '16px', marginTop: '6px', fontWeight: 800, color: '#f59e0b' }}>{filtered.filter(r => r.obj?.status === 'Unpaid').length}</h2>
              </div>

              <div style={statusCardStyle('#3b82f6')} onClick={() => setSelBuyer('ALL')} title="Click to show all buyers">
                <h4 style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 800, letterSpacing: '0.6px' }}>Active Buyers</h4>
                <h2 style={{ fontSize: '16px', marginTop: '6px', fontWeight: 800, color: '#3b82f6' }}>{buyersList.length}</h2>
              </div>

              <div style={statusCardStyle('#8b5cf6')} onClick={() => setSelCountry('ALL')} title="Click to show all markets">
                <h4 style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 800, letterSpacing: '0.6px' }}>Target Markets</h4>
                <h2 style={{ fontSize: '16px', marginTop: '6px', fontWeight: 800, color: '#8b5cf6' }}>{countriesList.length}</h2>
              </div>
            </div>
          </div>



          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px' }}>
              <RefreshCw size={28} className="spin" style={{ color: 'var(--corp-rep)', marginBottom: 10 }} />
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>Loading sales data…</span>
            </div>
          )}

          {/* Navigation Tabs for Sales Tables */}
          <div
            id="inventoryStockTables"
            role="tablist"
            aria-label="Sales data tables"
            style={{ ...card, display: 'flex', gap: '6px', padding: '6px', marginTop: '20px', marginBottom: '12px', overflowX: 'auto' }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={salesTableTab === 'register'}
              style={stockTabStyle(salesTableTab === 'register')}
              onClick={() => setSalesTableTab('register')}
            >
              <i className="fa-solid fa-receipt" style={{ marginRight: '7px' }}></i>
              Sales Register
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={salesTableTab === 'summary'}
              style={stockTabStyle(salesTableTab === 'summary')}
              onClick={() => setSalesTableTab('summary')}
            >
              <i className="fa-solid fa-table-list" style={{ marginRight: '7px' }}></i>
              PO Summary Table
            </button>
          </div>

          {/* 1. Live Sales Register Table */}
          {salesTableTab === 'register' && (
            <>
              <div style={secHeader}>
                <span style={secTitle}><i className="fa-solid fa-receipt"></i> Live Sales Register Data</span>
                <div style={secLine}></div>
                <button
                  onClick={() => exportToCSV(filtered, 'Sales_Register_Export')}
                  style={{ height: '26px', padding: '0 10px', fontSize: '10px', fontWeight: 800, background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  <i className="fa-solid fa-file-excel" style={{ marginRight: '4px' }}></i> Export Excel
                </button>
              </div>

              <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: '24px' }}>
                <div className="inventory-stock-table-scroll" style={{ maxHeight: '550px' }}>
                  <table className="bknr-table" style={{ minWidth: 2600 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 45 }}>SL</th>
                        <th style={{ width: 120 }}>PO No</th>
                        <th>Invoice No</th>
                        <th>Date</th>
                        <th>Buyer</th>
                        <th>Country</th>
                        <th>Brand</th>
                        <th>Variety</th>
                        <th>Grade</th>
                        <th>Container</th>
                        <th>S.Bill</th>
                        <th>Glaze (C/W)</th>
                        <th>Packing</th>
                        <th>MC</th>
                        <th style={{ textAlign: 'right' }}>Qty (Kg)</th>
                        <th style={{ textAlign: 'right' }}>Ex. Rate</th>
                        <th style={{ textAlign: 'right' }}>USD Value</th>
                        <th style={{ textAlign: 'right' }}>Sold Value (₹)</th>
                        <th style={{ textAlign: 'right' }}>Inv Value (₹)</th>
                        <th style={{ textAlign: 'right' }}>Freight (₹)</th>
                        <th style={{ textAlign: 'right' }}>Packing Cost (₹)</th>
                        <th style={{ textAlign: 'right' }}>Profit / Loss (₹)</th>
                        <th>Status</th>
                        <th>Company</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan="24" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>
                            No sales records found for selected filters.
                          </td>
                        </tr>
                      ) : (
                        renderPORows()
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="grand-total-row">
                        <td colSpan="13" style={{ textAlign: 'right', fontWeight: 800 }}>GRAND TOTALS:</td>
                        <td align="right" style={{ fontWeight: 800 }}>{filtered.reduce((s, r) => s + Number(r.obj?.no_of_mc || 0), 0)} MC</td>
                        <td align="right" style={{ fontWeight: 800 }}>{fmt(totalQty)} KG</td>
                        <td></td>
                        <td align="right" style={{ fontWeight: 800 }}>$ {fmt(totalUsd)}</td>
                        <td align="right" style={{ fontWeight: 800 }}>₹ {fmtVal(totalInr)}</td>
                        <td align="right" style={{ fontWeight: 800 }}>₹ {fmtVal(filtered.reduce((s, r) => s + Number(r.stock_value || 0), 0))}</td>
                        <td align="right" style={{ fontWeight: 800 }}>₹ {fmtVal(totalFreight)}</td>
                        <td align="right" style={{ fontWeight: 800 }}>₹ {fmtVal(totalPacking)}</td>
                        <td align="right" style={{ color: totalPL >= 0 ? '#10b981' : '#ef4444', fontWeight: 800 }}>₹ {fmtVal(totalPL)}</td>
                        <td colSpan={2}></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* 2. PO Summary Table */}
          {salesTableTab === 'summary' && (
            <>
              <div style={secHeader}>
                <span style={secTitle}><i className="fa-solid fa-table-list"></i> PO-Wise Sales Summary</span>
                <div style={secLine}></div>
                <button
                  onClick={() => exportToCSV(poSummaryRows.map(r => ({ obj: { po_number: r.poNumber, invoice_no: r.invoiceNo, invoice_date: r.date, buyer_name: r.buyer, country: r.country, no_of_mc: r.mc }, total_qty_kg: r.qty, total_usd: r.usd, total_inr: r.inr, stock_value: r.stock, freight_cost: r.freight, packing_cost: r.packing, profit_loss: r.pl })), 'PO_Sales_Summary')}
                  style={{ height: '26px', padding: '0 10px', fontSize: '10px', fontWeight: 800, background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  <i className="fa-solid fa-file-excel" style={{ marginRight: '4px' }}></i> Export Excel
                </button>
              </div>

              <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: '24px' }}>
                <div className="inventory-stock-table-scroll" style={{ maxHeight: '550px' }}>
                  <table className="bknr-table" style={{ minWidth: 1700 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 50 }}>SL</th>
                        <th style={{ width: 120 }}>PO Number</th>
                        <th>Date</th>
                        <th>Invoice No</th>
                        <th>Buyer Name</th>
                        <th>Country</th>
                        <th>Items</th>
                        <th>MC Box</th>
                        <th style={{ textAlign: 'right' }}>Qty (Kg)</th>
                        <th style={{ textAlign: 'right' }}>Total USD ($)</th>
                        <th style={{ textAlign: 'right' }}>Sold Value (₹)</th>
                        <th style={{ textAlign: 'right' }}>Inv Value (₹)</th>
                        <th style={{ textAlign: 'right' }}>Freight (₹)</th>
                        <th style={{ textAlign: 'right' }}>Packing Cost (₹)</th>
                        <th style={{ textAlign: 'right' }}>Net Profit / Loss (₹)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {poSummaryRows.length === 0 ? (
                        <tr>
                          <td colSpan="15" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>
                            No PO summary records found.
                          </td>
                        </tr>
                      ) : (
                        poSummaryRows.map((row) => (
                          <tr key={`summary-row-${row.poNumber}`}>
                            <td style={{ fontWeight: 800 }}>{row.slNo}</td>
                            <td style={{ fontWeight: 800 }}>{row.poNumber}</td>
                            <td>{row.date}</td>
                            <td style={{ fontWeight: 700 }}>{row.invoiceNo}</td>
                            <td style={{ textAlign: 'left', fontWeight: 700 }}>{row.buyer}</td>
                            <td>{row.country}</td>
                            <td align="center">{row.itemCount}</td>
                            <td align="center">{row.mc}</td>
                            <td align="right" style={{ fontWeight: 800 }}>{fmt(row.qty)}</td>
                            <td align="right">$ {fmt(row.usd)}</td>
                            <td align="right" style={{ fontWeight: 800 }}>₹ {fmtVal(row.inr)}</td>
                            <td align="right">₹ {fmtVal(row.stock)}</td>
                            <td align="right">₹ {fmtVal(row.freight)}</td>
                            <td align="right">₹ {fmtVal(row.packing)}</td>
                            <td align="right" style={{ fontWeight: 800, color: row.pl >= 0 ? '#10b981' : '#ef4444' }}>
                              ₹ {fmtVal(row.pl)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="grand-total-row">
                        <td colSpan={6} style={{ textAlign: 'right', fontWeight: 800 }}>GRAND SUMMARY TOTALS:</td>
                        <td align="center" style={{ fontWeight: 800 }}>{filtered.length}</td>
                        <td align="center" style={{ fontWeight: 800 }}>{totalMc} MC</td>
                        <td align="right" style={{ fontWeight: 800 }}>{fmt(totalQty)} KG</td>
                        <td align="right" style={{ fontWeight: 800 }}>$ {fmt(totalUsd)}</td>
                        <td align="right" style={{ fontWeight: 800 }}>₹ {fmtVal(totalInr)}</td>
                        <td align="right" style={{ fontWeight: 800 }}>₹ {fmtVal(filtered.reduce((s, r) => s + Number(r.stock_value || 0), 0))}</td>
                        <td align="right" style={{ fontWeight: 800 }}>₹ {fmtVal(totalFreight)}</td>
                        <td align="right" style={{ fontWeight: 800 }}>₹ {fmtVal(totalPacking)}</td>
                        <td align="right" style={{ color: totalPL >= 0 ? '#10b981' : '#ef4444', fontWeight: 800 }}>
                          ₹ {fmtVal(totalPL)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
