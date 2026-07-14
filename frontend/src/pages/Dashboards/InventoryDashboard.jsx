import { useState, useEffect, useRef, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';

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

export default function InventoryDashboard({ theme, setActivePage }) {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selFy, setSelFy] = useState('ALL');
  const [selSpecies, setSelSpecies] = useState('ALL');
  const [selVariety, setSelVariety] = useState('ALL');
  const [selGrade, setSelGrade] = useState('ALL');
  const [selGlaze, setSelGlaze] = useState('ALL');
  const [selectedCompany, setSelectedCompany] = useState(() => localStorage.getItem('production_for_filter') || '');
  const [selectedLocation, setSelectedLocation] = useState(() => localStorage.getItem('plant_location_filter') || '');
  const [companies, setCompanies] = useState([]);
  const [locations, setLocations] = useState([]);

  // Active Ageing Filter
  const [ageMinFilter, setAgeMinFilter] = useState(null);
  const [ageMaxFilter, setAgeMaxFilter] = useState(null);
  const [activeAgeCard, setActiveAgeCard] = useState(null);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Interactive chart filter states
  const [varietyChartFilter, setVarietyChartFilter] = useState(null);
  const [gradeChartFilter, setGradeChartFilter] = useState(null);
  const [glazeChartFilter, setGlazeChartFilter] = useState(null);

  // Charts
  const varietyCanvasRef = useRef(null);
  const gradeCanvasRef = useRef(null);
  const opClCanvasRef = useRef(null);
  const flowCanvasRef = useRef(null);

  const varietyChart = useRef(null);
  const gradeChart = useRef(null);
  const opClChart = useRef(null);
  const flowChart = useRef(null);
  const requestSequence = useRef(0);

  // Load Dropdowns
  useEffect(() => {
    fetch('/auth/global-dropdowns')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.status === 'success') {
          setCompanies(d.companies || []);
          setLocations(d.locations || []);
        }
      }).catch(() => {});
  }, []);

  // Listen to header global filter changes
  useEffect(() => {
    const handleGlobalFilters = (e) => {
      if (e.detail) {
        if (e.detail.production_for !== undefined) setSelectedCompany(e.detail.production_for);
        if (e.detail.location !== undefined) setSelectedLocation(e.detail.location);
      }
    };
    window.addEventListener('filter_change', handleGlobalFilters);
    return () => window.removeEventListener('filter_change', handleGlobalFilters);
  }, []);

  const fetchData = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError('');
    let url = `/dashboard/inventory_dashboard?format=json&sel_fy=${selFy}&sel_species=${selSpecies}&sel_variety=${selVariety}&sel_grade=${selGrade}&sel_glaze=${selGlaze}`;
    if (selectedCompany) url += `&production_for=${encodeURIComponent(selectedCompany)}`;
    if (selectedLocation) url += `&location=${encodeURIComponent(selectedLocation)}`;

    try {
      const response = await fetch(url, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (response.redirected || response.url.includes('/auth/login')) {
        throw new Error('Session expired. Please log in again.');
      }
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok) throw new Error(`Inventory dashboard request failed (${response.status}).`);
      if (!contentType.includes('application/json')) throw new Error('Inventory dashboard returned HTML instead of JSON.');
      const payload = await response.json();
      if (payload?.status !== 'success') throw new Error(payload?.detail || 'Inventory dashboard data is unavailable.');
      if (requestId === requestSequence.current) setData(payload);
    } catch (requestError) {
      if (requestId === requestSequence.current) setError(requestError.message || 'Unable to load inventory dashboard.');
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [selFy, selSpecies, selVariety, selGrade, selGlaze, selectedCompany, selectedLocation]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  // Click on Ageing Summary card
  const handleAgeFilterClick = (min, max, cardIdx) => {
    if (activeAgeCard === cardIdx) {
      setAgeMinFilter(null);
      setAgeMaxFilter(null);
      setActiveAgeCard(null);
    } else {
      setAgeMinFilter(min);
      setAgeMaxFilter(max);
      setActiveAgeCard(cardIdx);
    }
  };

  // Filter Table Data locally matching legacy logic
  const getFilteredRows = () => {
    if (!data?.stock_table_data) return [];
    return data.stock_table_data.filter(row => {
      const text = `${row.loc} ${row.fr} ${row.sp} ${row.vr} ${row.pk} ${row.gl} ${row.gr} ${row.production_for}`.toUpperCase();
      const matchesSearch = text.includes(searchQuery.toUpperCase());
      const age = row.ageing_days ?? 0;
      const matchesAge = ageMinFilter === null || (age >= ageMinFilter && age <= ageMaxFilter);
      const matchesVarietyChart = !varietyChartFilter || row.vr === varietyChartFilter;
      const matchesGradeChart = !gradeChartFilter || row.gr === gradeChartFilter;
      const selectedGlaze = String(selGlaze || 'ALL').trim().toUpperCase();
      const rowGlaze = String(row.gl || '').trim().toUpperCase();
      const selectedChartGlaze = String(glazeChartFilter || '').trim().toUpperCase();
      const matchesGlazeDropdown = selectedGlaze === 'ALL' || rowGlaze === selectedGlaze;
      const matchesGlazeChart = !selectedChartGlaze || rowGlaze === selectedChartGlaze;
      
      // Exclude zero-quantity rows matching legacy template line 797
      const opQty = row.opening_qty || 0;
      const clQty = row.qty || 0;
      const inQty = row.in_qty || 0;
      const outQty = row.out_qty || 0;
      const isZeroRow = (opQty === 0 && clQty === 0 && inQty === 0 && outQty === 0);
      
      return matchesSearch && matchesAge && matchesVarietyChart && matchesGradeChart && matchesGlazeDropdown && matchesGlazeChart && !isZeroRow;
    });
  };

  const filteredRows = getFilteredRows();

  // Grand Totals calculation matching legacy
  const totals = filteredRows.reduce((acc, row) => {
    acc.opening_mc += (row.opening_mc || 0);
    acc.opening_qty += (row.opening_qty || 0);
    acc.closing_mc += (row.mc || 0);
    acc.closing_qty += (row.qty || 0);
    acc.value += (row.value || 0);
    return acc;
  }, { opening_mc: 0, opening_qty: 0, closing_mc: 0, closing_qty: 0, value: 0 });

  const exportToCSV = (rowsToExport, filename) => {
    const headers = ['Loc', 'Storage', 'Species', 'Variety', 'Packing', 'Glaze', 'Grade', 'Client', 'Op MC', 'Op Loose', 'Op Qty', 'IN', 'OUT', 'Cl MC', 'Loose', 'Cl Qty', 'Avg Rate', 'Inv Value', 'Ageing'];
    const csvRows = [];
    csvRows.push(headers.join(','));

    rowsToExport.forEach(row => {
      const values = [
        row.loc || '',
        row.fr || '',
        row.sp || '',
        row.vr || '',
        row.pk || '',
        row.gl || '',
        row.gr || '',
        row.production_for || '',
        row.opening_mc ?? 0,
        row.opening_loose ?? 0,
        row.opening_qty ?? 0,
        row.in_qty ?? 0,
        row.out_qty ?? 0,
        row.mc ?? 0,
        row.loose ?? 0,
        row.qty ?? 0,
        row.avg_rate ?? 0,
        row.value ?? 0,
        `${row.ageing_days ?? 0}D`
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

  // Render ChartJS charts with same exact configurations as template
  useEffect(() => {
    if (!data || !window.Chart) return;

    const isDark = (theme || document.documentElement.getAttribute('data-theme') || 'dark') === 'dark';
    const chartTextColor = isDark ? '#cbd5e1' : '#475569';
    const chartGridColor = isDark ? '#475569' : '#cbd5e1';
    const font = { family: 'Plus Jakarta Sans', size: 9, weight: 'bold' };

    // Grouping calculations based on visible (filtered) table data for dynamic charts
    const speciesMap = {};
    const varietyMap = {};
    const gradeMap = {};
    const allGlazes = new Set();
    const allGradeCombos = new Set();

    filteredRows.forEach(row => {
      const species = row.sp || 'N/A';
      const variety = row.vr || 'N/A';
      const glaze = row.gl || 'NW';
      const grade = row.gr || 'N/A';
      const opQty = row.opening_qty || 0;
      const clQty = row.qty || 0;

      if (!speciesMap[species]) speciesMap[species] = { op: 0, cl: 0 };
      speciesMap[species].op += opQty;
      speciesMap[species].cl += clQty;

      if (clQty !== 0) {
        allGlazes.add(glaze);
        if (!varietyMap[variety]) varietyMap[variety] = {};
        if (!varietyMap[variety][glaze]) varietyMap[variety][glaze] = 0;
        varietyMap[variety][glaze] += clQty;
      }

      if (clQty !== 0) {
        if (!gradeMap[grade]) gradeMap[grade] = {};
        const gradeCombo = `${variety} / ${glaze}`;
        allGradeCombos.add(gradeCombo);
        if (!gradeMap[grade][gradeCombo]) gradeMap[grade][gradeCombo] = 0;
        gradeMap[grade][gradeCombo] += clQty;
      }
    });

    const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1'];

    // 1. Variety Stock Mix (Stacked Horizontal Glaze Wise)
    const vLabels = Object.keys(varietyMap).sort();
    const glazesArray = Array.from(allGlazes).sort();
    const vDatasets = glazesArray.map((glaze, index) => ({
      label: glaze,
      data: vLabels.map(v => varietyMap[v][glaze] || 0),
      backgroundColor: CHART_COLORS[index % CHART_COLORS.length]
    })).filter(ds => ds.data.reduce((sum, value) => sum + Math.abs(value), 0) > 0);

    if (varietyChart.current) varietyChart.current.destroy();
    if (varietyCanvasRef.current) {
      varietyChart.current = new window.Chart(varietyCanvasRef.current, {
        type: 'bar',
        data: { labels: vLabels, datasets: vDatasets },
        options: {
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          onClick: (event, elements) => {
            if (!elements || !elements.length) return;
            const idx = elements[0].index;
            const label = vLabels[idx];
            const clickedGlaze = glazesArray[elements[0].datasetIndex];
            if (label) {
              setVarietyChartFilter(prev => prev === label ? null : label);
            }
            if (clickedGlaze) {
              setGlazeChartFilter(prev => prev === clickedGlaze ? null : clickedGlaze);
            }
          },
          plugins: {
            legend: {
              position: 'top',
              labels: { color: chartTextColor, boxWidth: 10, font },
              onClick: (_event, legendItem) => {
                const glaze = String(legendItem?.text || '').trim();
                if (glaze) setGlazeChartFilter(previous => previous === glaze ? null : glaze);
              }
            }
          },
          scales: {
            x: { stacked: true, ticks: { color: chartTextColor }, grid: { color: chartGridColor } },
            y: { stacked: true, ticks: { color: chartTextColor }, grid: { display: false } }
          }
        }
      });
    }

    // 2. Grade Stock Mix (Stacked Vertical Variety+Glaze Wise)
    const gLabels = Object.keys(gradeMap).sort();
    const gradeCombosArray = Array.from(allGradeCombos).sort();
    const gDatasets = gradeCombosArray.map((combo, index) => ({
      label: combo,
      data: gLabels.map(g => gradeMap[g][combo] || 0),
      backgroundColor: CHART_COLORS[index % CHART_COLORS.length]
    })).filter(ds => ds.data.reduce((sum, value) => sum + Math.abs(value), 0) > 0);

    if (gradeChart.current) gradeChart.current.destroy();
    if (gradeCanvasRef.current) {
      gradeChart.current = new window.Chart(gradeCanvasRef.current, {
        type: 'bar',
        data: { labels: gLabels, datasets: gDatasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          onClick: (event, elements) => {
            if (!elements || !elements.length) return;
            const idx = elements[0].index;
            const label = gLabels[idx];
            if (label) {
              setGradeChartFilter(prev => prev === label ? null : label);
            }
          },
          plugins: { legend: { position: 'top', labels: { color: chartTextColor, boxWidth: 10, font } } },
          scales: {
            x: { stacked: true, ticks: { color: chartTextColor }, grid: { display: false } },
            y: { stacked: true, ticks: { color: chartTextColor }, grid: { color: chartGridColor } }
          }
        }
      });
    }

    // 3. Opening vs Closing (By Species)
    const spLabels = Object.keys(speciesMap).filter(sp => Math.abs(speciesMap[sp].op) > 0.01 || Math.abs(speciesMap[sp].cl) > 0.01).sort();
    if (opClChart.current) opClChart.current.destroy();
    if (opClCanvasRef.current) {
      opClChart.current = new window.Chart(opClCanvasRef.current, {
        type: 'bar',
        data: {
          labels: spLabels,
          datasets: [
            { label: 'Opening Stock', data: spLabels.map(sp => speciesMap[sp].op), backgroundColor: '#3b82f6' },
            { label: 'Closing Stock', data: spLabels.map(sp => speciesMap[sp].cl), backgroundColor: '#10b981' }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: chartTextColor, font } } },
          scales: {
            x: { ticks: { color: chartTextColor }, grid: { color: chartGridColor } },
            y: { ticks: { color: chartTextColor }, grid: { color: chartGridColor } }
          }
        }
      });
    }

    // 4. Stock Movement Analysis (Line Chart)
    if (flowChart.current) flowChart.current.destroy();
    if (flowCanvasRef.current) {
      flowChart.current = new window.Chart(flowCanvasRef.current, {
        type: 'line',
        data: {
          labels: data.flow_labels,
          datasets: [
            { label: 'Fresh Production', data: data.flow_fresh, borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,.15)', tension: 0.4, fill: true },
            { label: 'Reprocess', data: data.flow_reprocess, borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,.15)', tension: 0.4, fill: true },
            { label: 'OUT', data: data.flow_out, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,.15)', tension: 0.4, fill: true }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: chartTextColor, font } } },
          scales: {
            x: { ticks: { color: chartTextColor }, grid: { color: chartGridColor } },
            y: { ticks: { color: chartTextColor }, grid: { color: chartGridColor } }
          }
        }
      });
    }

    return () => {
      if (varietyChart.current) varietyChart.current.destroy();
      if (gradeChart.current) gradeChart.current.destroy();
      if (opClChart.current) opClChart.current.destroy();
      if (flowChart.current) flowChart.current.destroy();
    };
  // filteredRows is derived from the dependencies listed below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, theme, searchQuery, ageMinFilter, ageMaxFilter, varietyChartFilter, gradeChartFilter, glazeChartFilter]);

  const openModal = (route) => {
    if (setActivePage) {
      const routeMap = {
        '/inventory/stock_entry': 'stock_entry',
        '/inventory/pending_orders': 'pending_orders',
        '/inventory/cold_storage_holding': 'cold_storage_holding',
        '/inventory/stock_report': 'report_inventory_report',
        '/inventory/sales_report': 'report_sales_report',
        '/inventory/cold_storage_holding_report': 'report_cold_storage_holding_report',
        '/summary/floor_balance_value': 'report_floor_balance_value',
        '/summary/inventory_costing': 'report_inventory_costing',
        '/reports/storage_cost_report': 'report_storage_cost_report',
        '/reports/pending_orders_report': 'report_pending_orders_report',
        '/reports/re-process': 'report_reprocess_report',
        '/reports/production_report': 'report_production_report',
        '/reports/floor_balance_report': 'report_floor_balance_report',
      };
      const pageId = routeMap[route];
      if (pageId) {
        setActivePage(pageId, route);
      }
    }
  };

  const getAgeLabelClass = (age) => {
    if (age <= 30) return 'age-green';
    if (age <= 90) return 'age-yellow';
    if (age <= 700) return 'age-orange';
    return 'age-red';
  };

  // Styled helper for cards
  const chartBoxStyle = {
    background: 'var(--surface-panel)',
    border: '1px solid var(--border-light)',
    borderRadius: '12px',
    padding: '16px',
    height: '360px',
    boxShadow: 'var(--shadow-soft)',
    display: 'flex',
    flexDirection: 'column'
  };

  const ageCardStyle = (isActive, color) => ({
    background: 'var(--surface-panel)',
    border: isActive ? `2px solid ${color}` : '1px solid var(--border-light)',
    borderLeft: `5px solid ${color}`,
    borderRadius: '12px',
    padding: '20px 14px',
    textAlign: 'center',
    boxShadow: 'var(--shadow-soft)',
    cursor: 'pointer',
    transition: '0.2s',
    transform: isActive ? 'translateY(-3px)' : 'none'
  });

  const filterBar = {
    display: 'flex', gap: '10px', flexWrap: 'nowrap', padding: '12px 16px',
    background: 'var(--surface-panel)', borderRadius: '10px', border: '1px solid var(--border-light)',
    marginBottom: '16px', alignItems: 'flex-end', overflowX: 'auto', overflowY: 'hidden',
    WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin'
  };
  const filterGrp = { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '130px', flex: '0 0 130px' };
  const filterLbl = { fontSize: '9px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' };
  const filterSelect = {
    height: '32px', padding: '0 10px', fontSize: '11px', fontWeight: 700,
    background: 'var(--input-bg)', border: '1px solid var(--input-border)',
    borderRadius: '7px', color: 'var(--text-primary)', outline: 'none'
  };
  const card = {
    background: 'var(--surface-panel)', border: '1px solid var(--border-light)',
    borderRadius: '12px', padding: '16px', boxShadow: 'var(--shadow-soft)'
  };
  const secHeader = { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', marginTop: '20px' };
  const secTitle = { fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' };
  const secLine = { flex: 1, height: '1px', background: 'var(--border-light)' };

  const isMobile = windowWidth <= 992;

  return (
    <div className="module-shell" style={{ width: '100%', height: '100%', overflow: 'hidden', position: 'relative' }}>
      {!isMobile && (
        <aside className="module-rail">
          <div className="rail-title"><i className="fa-solid fa-warehouse"></i> Inventory</div>
          <div className="rail-section">
            <div className="rail-label">Forms</div>
            <button className="rail-link" type="button" onClick={() => openModal('/inventory/stock_entry', 'Stock Entry')}><i className="fa-solid fa-boxes-stacked"></i><span>Stock Entry</span></button>
            <button className="rail-link" type="button" onClick={() => openModal('/inventory/pending_orders', 'Pending Orders')}><i className="fa-solid fa-clock-rotate-left"></i><span>Pending Orders</span></button>
            <button className="rail-link" type="button" onClick={() => openModal('/inventory/cold_storage_holding', 'Cold Storage Holding')}><i className="fa-solid fa-snowflake"></i><span>Cold Storage Holding</span></button>
          </div>
          <div className="rail-section">
            <div className="rail-label">Reports</div>
            <button className="rail-link" type="button" onClick={() => openModal('/inventory/stock_report', 'Stock Status Report')}><i className="fa-solid fa-boxes-packing"></i><span>Stock Status Report</span></button>
            <button className="rail-link" type="button" onClick={() => openModal('/reports/floor_balance_report', 'Floor Balance Report')}><i className="fa-solid fa-scale-balanced"></i><span>Floor Balance Report</span></button>
            <button className="rail-link" type="button" onClick={() => openModal('/reports/pending_orders_report', 'Pending Orders Report')}><i className="fa-solid fa-clock"></i><span>Pending Orders Report</span></button>
            <button className="rail-link" type="button" onClick={() => openModal('/inventory/sales_report', 'Sales Report')}><i className="fa-solid fa-receipt"></i><span>Sales Report</span></button>
            <button className="rail-link" type="button" onClick={() => openModal('/inventory/cold_storage_holding_report', 'Cold Storage Report')}><i className="fa-solid fa-warehouse"></i><span>Cold Storage Report</span></button>
            <button className="rail-link" type="button" onClick={() => openModal('/reports/storage_cost_report', 'Storage & Cost Report')}><i className="fa-solid fa-coins"></i><span>Storage & Cost Report</span></button>
            <button className="rail-link" type="button" onClick={() => openModal('/summary/inventory_costing', 'Inventory Costing')}><i className="fa-solid fa-calculator"></i><span>Inventory Costing</span></button>
          </div>
        </aside>
      )}

      <main className="module-main" style={isMobile ? { width: '100%', height: '100%', overflowY: 'auto' } : { height: '100%', overflowY: 'auto', paddingRight: '4px' }}>
        <div style={{ padding: '20px', paddingRight: '16px' }}>

          {/* Header Row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                <i className="fa-solid fa-boxes-stacked" style={{ color: '#3b82f6' }}></i>
                Inventory Dashboard
              </h2>
            </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          <div style={{ padding: '5px 10px', borderRadius: '6px', background: 'var(--ui-accent, #3b82f6)', color: '#fff', fontWeight: 700, fontSize: '10px' }}>
            {data?.sel_fy || '—'}
          </div>
        </div>
      </div>

      {error && (
        <div role="alert" style={{ marginBottom: 16, padding: '12px 14px', borderRadius: 10, border: '1px solid rgba(239,68,68,.35)', background: 'rgba(239,68,68,.08)', color: '#ef4444', fontSize: 12, fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span>{error}</span>
          <button type="button" onClick={fetchData} style={{ border: '1px solid currentColor', borderRadius: 6, background: 'transparent', color: 'inherit', padding: '5px 10px', fontWeight: 800, cursor: 'pointer' }}>Retry</button>
        </div>
      )}

      {/* 8 Premium KPI Cards matching legacy layout with INR sub-totals */}
      <div className="kpi-grid">
        {/* 1. Opening */}
        <div className="kpi-card kpi-blue" onClick={() => document.getElementById('openingStockBox')?.scrollIntoView({ behavior: 'smooth' })}>
          <div className="kpi-header">
            <h4>Opening</h4>
            <div className="kpi-icon"><i className="fa-solid fa-box-open"></i></div>
          </div>
          <div>
            <div className="value">{fmt(data?.opening_stock_qty)}</div>
            <div className="amt-sub">₹ {fmtVal(data?.total_opening_value)}</div>
          </div>
        </div>

        {/* 2. Closing */}
        <div className="kpi-card kpi-green" onClick={() => document.getElementById('liveInventoryBox')?.scrollIntoView({ behavior: 'smooth' })}>
          <div className="kpi-header">
            <h4>Closing</h4>
            <div className="kpi-icon"><i className="fa-solid fa-boxes-stacked"></i></div>
          </div>
          <div>
            <div className="value">{fmt(data?.closing_stock_qty)}</div>
            <div className="amt-sub">₹ {fmtVal(data?.total_inventory_value)}</div>
          </div>
        </div>

        {/* 3. Sales */}
        <div className="kpi-card kpi-blue" onClick={() => openModal('/inventory/sales_report')}>
          <div className="kpi-header">
            <h4>Sales</h4>
            <div className="kpi-icon"><i className="fa-solid fa-truck-ramp-box"></i></div>
          </div>
          <div>
            <div className="value">{fmt(data?.total_out_qty)}</div>
            <div className="amt-sub">₹ {fmtVal(data?.total_out_value)}</div>
          </div>
        </div>

        {/* 4. Reprocess */}
        <div className="kpi-card kpi-blue" onClick={() => openModal('/reports/re-process')}>
          <div className="kpi-header">
            <h4>Reprocess</h4>
            <div className="kpi-icon"><i className="fa-solid fa-arrows-rotate"></i></div>
          </div>
          <div>
            <div className="value">{fmt(data?.reprocess_qty)}</div>
            <div className="amt-sub">₹ {fmtVal(data?.reprocess_value)}</div>
          </div>
        </div>

        {/* 5. Fresh Stock */}
        <div className="kpi-card kpi-blue" onClick={() => openModal('/inventory/stock_report')}>
          <div className="kpi-header">
            <h4>Fresh Stock</h4>
            <div className="kpi-icon"><i className="fa-solid fa-seedling"></i></div>
          </div>
          <div>
            <div className="value">{fmt(data?.total_in_qty)}</div>
            <div className="amt-sub">₹ {fmtVal(data?.total_in_value)}</div>
          </div>
        </div>

        {/* 6. Reglaze Prod */}
        <div className="kpi-card kpi-cyan" style={{ cursor: 'default' }}>
          <div className="kpi-header">
            <h4>Reglaze Prod.</h4>
            <div className="kpi-icon"><i className="fa-solid fa-snowflake"></i></div>
          </div>
          <div>
            <div className="value">{fmt(data?.reglaze_qty)} Kg</div>
            <div className="amt-sub">₹ {fmtVal(data?.reglaze_value)}</div>
          </div>
        </div>

        {/* 7. Dead Stock */}
        <div className="kpi-card kpi-gray" style={{ cursor: 'default' }}>
          <div className="kpi-header">
            <h4>Dead Stock</h4>
            <div className="kpi-icon"><i className="fa-solid fa-skull-crossbones"></i></div>
          </div>
          <div>
            <div className="value">{fmt(data?.dead_stock_qty)}</div>
            <div className="amt-sub">₹ {fmtVal(data?.dead_stock_value)}</div>
          </div>
        </div>

        {/* 8. Total MC */}
        <div className="kpi-card kpi-teal" style={{ cursor: 'default' }}>
          <div className="kpi-header">
            <h4>Total MC</h4>
            <div className="kpi-icon"><i className="fa-solid fa-cubes"></i></div>
          </div>
          <div>
            <div className="value">{data?.closing_stock_mc ? data.closing_stock_mc.toLocaleString() : 0}</div>
            <div className="amt-sub">Boxes Active</div>
          </div>
        </div>
      </div>

      {/* Interactive Charts Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: window.innerWidth > 992 ? '1fr 1fr' : '1fr', gap: '16px', marginBottom: '16px' }}>
        <div style={chartBoxStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
            <h3 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px', margin: 0 }}>
              {varietyChartFilter || glazeChartFilter
                ? `Variety Stock Mix — Filtered: ${[varietyChartFilter, glazeChartFilter].filter(Boolean).join(' / ')}`
                : 'Variety Stock Mix (Glaze Wise)'}
            </h3>
            {(varietyChartFilter || glazeChartFilter) && (
              <button 
                onClick={() => { setVarietyChartFilter(null); setGlazeChartFilter(null); }}
                style={{ border: '1px solid var(--border-light)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '9px', fontWeight: 800, padding: '3px 8px', borderRadius: '5px', cursor: 'pointer' }}
              >
                Clear
              </button>
            )}
          </div>
          <div style={{ flexGrow: 1, position: 'relative', width: '100%' }}>
            <canvas ref={varietyCanvasRef}></canvas>
          </div>
        </div>
        <div style={chartBoxStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
            <h3 style={{ fontSize: '11px', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px', margin: 0 }}>
              {gradeChartFilter || glazeChartFilter
                ? `Grade Stock Mix — Filtered: ${[gradeChartFilter, glazeChartFilter].filter(Boolean).join(' / ')}`
                : 'Grade Stock Mix (Variety + Glaze Wise)'}
            </h3>
            {(gradeChartFilter || glazeChartFilter) && (
              <button 
                onClick={() => { setGradeChartFilter(null); setGlazeChartFilter(null); }}
                style={{ border: '1px solid var(--border-light)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '9px', fontWeight: 800, padding: '3px 8px', borderRadius: '5px', cursor: 'pointer' }}
              >
                Clear
              </button>
            )}
          </div>
          <div style={{ flexGrow: 1, position: 'relative', width: '100%' }}>
            <canvas ref={gradeCanvasRef}></canvas>
          </div>
        </div>
        <div style={chartBoxStyle}>
          <h3 style={{ fontSize: '11px', fontWeight: 800, marginBottom: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
            Opening vs Closing (By Species)
          </h3>
          <div style={{ flexGrow: 1, position: 'relative', width: '100%' }}>
            <canvas ref={opClCanvasRef}></canvas>
          </div>
        </div>
        <div style={chartBoxStyle}>
          <h3 style={{ fontSize: '11px', fontWeight: 800, marginBottom: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.8px', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
            Stock Movement Analysis
          </h3>
          <div style={{ flexGrow: 1, position: 'relative', width: '100%' }}>
            <canvas ref={flowCanvasRef}></canvas>
          </div>
        </div>
      </div>

      {/* Ageing Summary Cards (With active filters) */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
          <div style={ageCardStyle(activeAgeCard === 1, '#10b981')} onClick={() => handleAgeFilterClick(0, 30, 1)}>
            <h4 style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 800, letterSpacing: '0.6px' }}>0-30 Days</h4>
            <h2 style={{ fontSize: '24px', marginTop: '8px', fontWeight: 800 }}>{fmt(data?.age_30)}</h2>
          </div>
          <div style={ageCardStyle(activeAgeCard === 2, '#f59e0b')} onClick={() => handleAgeFilterClick(31, 90, 2)}>
            <h4 style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 800, letterSpacing: '0.6px' }}>31-90 Days</h4>
            <h2 style={{ fontSize: '24px', marginTop: '8px', fontWeight: 800 }}>{fmt(data?.age_90)}</h2>
          </div>
          <div style={ageCardStyle(activeAgeCard === 3, '#ea580c')} onClick={() => handleAgeFilterClick(91, 700, 3)}>
            <h4 style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 800, letterSpacing: '0.6px' }}>91-700 Days</h4>
            <h2 style={{ fontSize: '24px', marginTop: '8px', fontWeight: 800 }}>{fmt(data?.age_700)}</h2>
          </div>
          <div style={ageCardStyle(activeAgeCard === 4, '#ef4444')} onClick={() => handleAgeFilterClick(701, 99999, 4)}>
            <h4 style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 800, letterSpacing: '0.6px' }}>700+ Days (Dead)</h4>
            <h2 style={{ fontSize: '24px', marginTop: '8px', fontWeight: 800 }}>{fmt(data?.dead_stock_qty)}</h2>
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="erp-horizontal-filter-row" style={filterBar}>
        <div style={filterGrp}>
          <label style={filterLbl}>Financial Year</label>
          <select style={filterSelect} value={selFy} onChange={e => setSelFy(e.target.value)}>
            <option value="ALL">Current FY</option>
            {['2024-25','2023-24','2022-23'].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div style={filterGrp}>
          <label style={filterLbl}>Production For</label>
          <select style={filterSelect} value={selectedCompany} onChange={e => { const v = e.target.value; setSelectedCompany(v); localStorage.setItem('production_for_filter', v); }}>
            <option value="">All Companies</option>
            {companies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={filterGrp}>
          <label style={filterLbl}>Location</label>
          <select style={filterSelect} value={selectedLocation} onChange={e => { const v = e.target.value; setSelectedLocation(v); localStorage.setItem('plant_location_filter', v); }}>
            <option value="">All Locations</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
        <div style={filterGrp}>
          <label style={filterLbl}>Species</label>
          <select style={filterSelect} value={selSpecies} onChange={e => setSelSpecies(e.target.value)}>
            <option value="ALL">ALL SPECIES</option>
            {data?.species_list?.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div style={filterGrp}>
          <label style={filterLbl}>Variety</label>
          <select style={filterSelect} value={selVariety} onChange={e => setSelVariety(e.target.value)}>
            <option value="ALL">ALL VARIETIES</option>
            {data?.varieties_list?.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div style={filterGrp}>
          <label style={filterLbl}>Glaze (Both Charts)</label>
          <select style={filterSelect} value={selGlaze} onChange={e => { setSelGlaze(e.target.value); setVarietyChartFilter(null); setGradeChartFilter(null); setGlazeChartFilter(null); }}>
            <option value="ALL">ALL GLAZES</option>
            {data?.glazes_list?.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div style={filterGrp}>
          <label style={filterLbl}>Grade</label>
          <select style={filterSelect} value={selGrade} onChange={e => setSelGrade(e.target.value)}>
            <option value="ALL">ALL GRADES</option>
            {data?.grades_list?.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div style={{ ...filterGrp, flexGrow: 1 }}>
          <label style={filterLbl}>Search Table</label>
          <input
            type="text"
            style={{ ...filterSelect, borderLeft: '3px solid var(--ui-accent, #3b82f6)' }}
            placeholder="Type to filter..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px' }}>
          <RefreshCw size={28} className="spin" style={{ color: 'var(--corp-rep)', marginBottom: 10 }} />
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600 }}>Loading inventory data…</span>
        </div>
      )}

      {/* Live Closing Inventory Table */}
      <div style={secHeader}>
        <span style={secTitle}><i className="fa-solid fa-boxes-stacked"></i> Live Closing Inventory</span>
        <div style={secLine}></div>
        <button 
          onClick={() => exportToCSV(filteredRows, 'Live_Closing_Inventory')}
          style={{ height: '26px', padding: '0 10px', fontSize: '10px', fontWeight: 800, background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap', marginRight: '6px' }}
        >
          <i className="fa-solid fa-file-excel" style={{ marginRight: '4px' }}></i> Export Excel
        </button>
        <button onClick={() => openModal('/inventory/stock_report')}
          style={{ height: '26px', padding: '0 10px', fontSize: '10px', fontWeight: 800, background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          Full Report →
        </button>
      </div>

      <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ overflowX: 'auto', maxHeight: '550px' }}>
          <table className="bknr-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Loc</th>
                <th>Storage</th>
                <th>Species</th>
                <th>Variety</th>
                <th>Packing</th>
                <th>Glaze</th>
                <th>Grade</th>
                <th>Client</th>
                <th style={{ textAlign: 'right' }}>Op MC</th>
                <th style={{ textAlign: 'right' }}>Op Loose</th>
                <th style={{ textAlign: 'right' }}>Op Qty</th>
                <th style={{ textAlign: 'right' }}>IN</th>
                <th style={{ textAlign: 'right' }}>OUT</th>
                <th style={{ textAlign: 'right' }}>Cl MC</th>
                <th style={{ textAlign: 'right' }}>Loose</th>
                <th style={{ textAlign: 'right' }}>Cl Qty</th>
                <th style={{ textAlign: 'right' }}>Avg Rate</th>
                <th style={{ textAlign: 'right' }}>Inv Value</th>
                <th>Ageing</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length ? filteredRows.map((row, i) => {
                const age = row.ageing_days ?? 0;
                return (
                  <tr key={i} className={age > 700 ? 'dead-row' : ''}>
                    <td>{i + 1}</td>
                    <td>{row.loc}</td>
                    <td>{row.fr}</td>
                    <td><strong>{row.sp}</strong></td>
                    <td>{row.vr}</td>
                    <td>{row.pk}</td>
                    <td>{row.gl}</td>
                    <td>{row.gr}</td>
                    <td>{row.production_for}</td>
                    <td align="right">{row.opening_mc ?? 0}</td>
                    <td align="right">{row.opening_loose ?? 0}</td>
                    <td align="right">{fmt(row.opening_qty)}</td>
                    <td align="right" style={{ color: '#10b981' }}>{fmt(row.in_qty)}</td>
                    <td align="right" style={{ color: '#ef4444' }}>{fmt(row.out_qty)}</td>
                    <td align="right">{row.mc ?? 0}</td>
                    <td align="right">{row.loose ?? 0}</td>
                    <td align="right" style={{ color: 'var(--ui-accent, #3b82f6)', fontWeight: 800 }}>{fmt(row.qty)}</td>
                    <td align="right">{fmt(row.avg_rate)}</td>
                    <td align="right" style={{ color: 'var(--ui-accent, #3b82f6)', fontWeight: 800 }}>{fmtVal(row.value)}</td>
                    <td>
                      <span className={getAgeLabelClass(age)}>{age}D</span>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan="20" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>
                    No stock records found for selected filters.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="grand-total-row">
                <td colSpan="9" style={{ textAlign: 'right', fontWeight: 800 }}>GRAND TOTAL</td>
                <td align="right">{totals.opening_mc.toLocaleString()}</td>
                <td></td>
                <td align="right">{fmt(totals.opening_qty)}</td>
                <td></td>
                <td></td>
                <td align="right">{totals.closing_mc.toLocaleString()}</td>
                <td></td>
                <td align="right" style={{ color: 'var(--ui-accent, #3b82f6)', fontWeight: 800 }}>{fmt(totals.closing_qty)}</td>
                <td></td>
                <td align="right" style={{ color: 'var(--ui-accent, #3b82f6)', fontWeight: 800 }}>{fmtVal(totals.value)}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Opening Stock Summary Section */}
      <div style={secHeader} id="openingStockBox">
        <span style={secTitle}><i className="fa-solid fa-box-open"></i> Opening Stock Summary</span>
        <div style={secLine}></div>
        <button 
          onClick={() => exportToCSV(filteredRows.filter(r => (r.opening_qty || 0) !== 0), 'Opening_Stock_Summary')}
          style={{ height: '26px', padding: '0 10px', fontSize: '10px', fontWeight: 800, background: 'rgba(16,185,129,0.1)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)', borderRadius: '6px', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          <i className="fa-solid fa-file-excel" style={{ marginRight: '4px' }}></i> Export Excel
        </button>
      </div>

      <div style={{ ...card, padding: 0, overflow: 'hidden', marginBottom: '24px' }}>
        <div style={{ overflowX: 'auto', maxHeight: '400px' }}>
          <table className="bknr-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Loc</th>
                <th>Storage</th>
                <th>Species</th>
                <th>Variety</th>
                <th>Packing</th>
                <th>Glaze</th>
                <th>Grade</th>
                <th>Client</th>
                <th style={{ textAlign: 'right' }}>Op MC</th>
                <th style={{ textAlign: 'right' }}>Op Loose</th>
                <th style={{ textAlign: 'right' }}>Op Qty</th>
                <th style={{ textAlign: 'right' }}>Avg Rate</th>
                <th style={{ textAlign: 'right' }}>Value</th>
                <th>Age</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.filter(r => (r.opening_qty || 0) !== 0).length ? filteredRows.filter(r => (r.opening_qty || 0) !== 0).map((row, i) => {
                const age = row.ageing_days ?? 0;
                const value = (row.opening_qty || 0) * (row.avg_rate || 0);
                return (
                  <tr key={i} className="op-row">
                    <td>{i + 1}</td>
                    <td>{row.loc}</td>
                    <td>{row.fr}</td>
                    <td><strong>{row.sp}</strong></td>
                    <td>{row.vr}</td>
                    <td>{row.pk}</td>
                    <td>{row.gl}</td>
                    <td>{row.gr}</td>
                    <td>{row.production_for}</td>
                    <td align="right">{row.opening_mc ?? 0}</td>
                    <td align="right">{row.opening_loose ?? 0}</td>
                    <td align="right">{fmt(row.opening_qty)}</td>
                    <td align="right">{fmt(row.avg_rate)}</td>
                    <td align="right" style={{ color: 'var(--ui-accent, #3b82f6)', fontWeight: 800 }}>{fmtVal(value)}</td>
                    <td>{age}D</td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan="15" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>
                    No opening stock records found for selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
        </div>
      </main>
    </div>
  );
}
