import { useState, useEffect, useRef } from 'react';
import FloorBalanceReport from '../Reports/FloorBalanceReport';

const todayIso = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function ProcessingDashboard({ theme }) {
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Filters State
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [selectedCompany, setSelectedCompany] = useState(() => localStorage.getItem('production_for_filter') || '');
  const [selectedLocation, setSelectedLocation] = useState(() => localStorage.getItem('plant_location_filter') || '');

  // Dropdown options
  const [companies, setCompanies] = useState([]);
  const [locations, setLocations] = useState([]);

  // Modal State
  const [modalUrl, setModalUrl] = useState(null);
  const [modalTitle, setModalTitle] = useState('');
  const [modalLoading, setModalLoading] = useState(false);
  const [statsReloadTrigger, setStatsReloadTrigger] = useState(0);

  // Dashboard Data State
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [liveFloorKpi, setLiveFloorKpi] = useState('0.00');

  // Chart Canvas Refs
  const dhCanvasRef = useRef(null);
  const peelingCanvasRef = useRef(null);
  const prodCanvasRef = useRef(null);

  // Chart Instance Refs
  const dhChartInstance = useRef(null);
  const peelingChartInstance = useRef(null);
  const prodChartInstance = useRef(null);

  // Init Dates & Load Dropdowns
  useEffect(() => {
    // Load Dropdowns
    fetch('/auth/global-dropdowns')
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('Failed to load dropdowns');
      })
      .then((resData) => {
        if (resData.status === 'success') {
          setCompanies(resData.companies || []);
          setLocations(resData.locations || []);
        }
      })
      .catch((err) => console.error(err));
  }, []);

  // Listen to parent global filter changes
  useEffect(() => {
    const handleFilterChange = (e) => {
      if (e.detail) {
        if (e.detail.production_for !== undefined) setSelectedCompany(e.detail.production_for);
        if (e.detail.location !== undefined) setSelectedLocation(e.detail.location);
      }
    };
    window.addEventListener('filter_change', handleFilterChange);
    return () => window.removeEventListener('filter_change', handleFilterChange);
  }, []);

  // Fetch Dashboard Stats on Filter Change
  useEffect(() => {
    if (!selectedDate) return;

    const controller = new AbortController();
    const loadingTimer = window.setTimeout(() => {
      setLoading(true);
      setError('');
    }, 0);
    let url = `/dashboard/processing_dashboard?format=json&from_date=${selectedDate}&to_date=${selectedDate}&hour_date=${selectedDate}`;
    if (selectedCompany) url += `&production_for=${encodeURIComponent(selectedCompany)}`;
    if (selectedLocation) url += `&location=${encodeURIComponent(selectedLocation)}`;

    fetch(url, {
      credentials: 'include',
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    })
      .then(async (res) => {
        const contentType = res.headers.get('content-type') || '';
        if (res.status === 401 || res.redirected || res.url.includes('/auth/login')) {
          throw new Error('Session expired. Please log in again.');
        }
        if (!res.ok) throw new Error(`Unable to load Processing Dashboard (HTTP ${res.status}).`);
        if (!contentType.includes('application/json')) {
          throw new Error('Dashboard server returned an invalid response. Please refresh or log in again.');
        }
        return res.json();
      })
      .then((resData) => {
        if (resData.status !== 'success') throw new Error(resData.message || 'Unable to load Processing Dashboard.');
        setData(resData);
        setLiveFloorKpi(resData.floor_total ?? '0.00');
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => {
      window.clearTimeout(loadingTimer);
      controller.abort();
    };
  }, [selectedDate, selectedCompany, selectedLocation, statsReloadTrigger]);

  // Re-instantiate ChartJS instances whenever data or theme shifts
  useEffect(() => {
    if (!data) return;

    const currentTheme = theme || document.documentElement.getAttribute("data-theme") || 'dark';
    const gridColor = currentTheme === 'dark' ? '#334155' : '#e2e8f0';
    const labelColor = currentTheme === 'dark' ? '#94a3b8' : '#475569';

    const chartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: {
            color: labelColor,
            font: { family: 'Plus Jakarta Sans', size: 9, weight: 'bold' }
          }
        },
        x: {
          grid: { display: false },
          ticks: {
            color: labelColor,
            font: { family: 'Plus Jakarta Sans', size: 9, weight: 'bold' }
          }
        }
      }
    };

    // De-heading
    if (dhChartInstance.current) dhChartInstance.current.destroy();
    if (dhCanvasRef.current && window.Chart) {
      dhChartInstance.current = new window.Chart(dhCanvasRef.current, {
        type: 'bar',
        data: {
          labels: data.hourly_labels,
          datasets: [{ data: data.dh_hourly_data, backgroundColor: '#2563eb', borderWidth: 0, borderRadius: 7, borderSkipped: false, maxBarThickness: 34 }]
        },
        options: chartOptions
      });
    }

    // Peeling
    if (peelingChartInstance.current) peelingChartInstance.current.destroy();
    if (peelingCanvasRef.current && window.Chart) {
      peelingChartInstance.current = new window.Chart(peelingCanvasRef.current, {
        type: 'bar',
        data: {
          labels: data.hourly_labels,
          datasets: [{ data: data.peeling_hourly_data, backgroundColor: '#10b981', borderWidth: 0, borderRadius: 7, borderSkipped: false, maxBarThickness: 34 }]
        },
        options: chartOptions
      });
    }

    // Production
    if (prodChartInstance.current) prodChartInstance.current.destroy();
    if (prodCanvasRef.current && window.Chart) {
      prodChartInstance.current = new window.Chart(prodCanvasRef.current, {
        type: 'bar',
        data: {
          labels: data.hourly_labels,
          datasets: [{ data: data.prod_hourly_data, backgroundColor: '#2563eb', borderWidth: 0, borderRadius: 7, borderSkipped: false, maxBarThickness: 34 }]
        },
        options: chartOptions
      });
    }

    return () => {
      if (dhChartInstance.current) dhChartInstance.current.destroy();
      if (peelingChartInstance.current) peelingChartInstance.current.destroy();
      if (prodChartInstance.current) prodChartInstance.current.destroy();
    };
  }, [data, theme]);

  const handleKpiClick = (id, route) => {
    let title = 'Process Terminal';
    if (id === 'gate_entry') title = 'Gate Entry Workspace';
    else if (id === 'raw_material_purchasing') title = 'RM Purchasing Platform';
    else if (id === 'de_heading') title = 'De-Heading Production Console';
    else if (id === 'grading') title = 'Grading Allocation Module';
    else if (id === 'peeling') title = 'Peeling Process Terminal';
    else if (id === 'soaking') title = 'Soaking Monitoring Room';
    else if (id === 'production') title = 'Final Production Suite';
    else if (id === 'finance_production_cost_allocation') title = 'Production Cost Allocation';
    else if (id.startsWith('report_')) {
      if (id === 'report_gate_entry_report') title = 'Gate Entry Report';
      else if (id === 'report_rmp_report') title = 'RM Purchase Report';
      else if (id === 'report_de_heading_report') title = 'De-Heading Report';
      else if (id === 'report_grading_report') title = 'Grading Report';
      else if (id === 'report_peeling_report') title = 'Peeling Report';
      else if (id === 'report_soaking_report') title = 'Soaking Report';
      else if (id === 'report_production_report') title = 'Production Report';
      else if (id === 'report_reprocess_report') title = 'Re-Process Report';
      else if (id === 'report_floor_balance_report') title = 'Floor Balance Report';
    }

    openModal(route, title);
  };

  const openModal = (route, title) => {
    setModalTitle(title);
    setModalLoading(true);

    const targetUrl = new URL(route, window.location.origin);
    targetUrl.searchParams.set('view', 'dashboard');
    targetUrl.searchParams.set('embedded', 'true');
    targetUrl.searchParams.set('backend', route);
    if (selectedCompany) targetUrl.searchParams.set('production_for', selectedCompany);
    if (selectedLocation) targetUrl.searchParams.set('location', selectedLocation);

    const pathsMapInverse = {
      '/processing/gate_entry': 'gate_entry',
      '/processing/raw_material_purchasing': 'raw_material_purchasing',
      '/processing/de_heading': 'de_heading',
      '/processing/grading': 'grading',
      '/processing/peeling': 'peeling',
      '/processing/soaking': 'soaking',
      '/processing/production': 'production',
      '/reports/gate_entry': 'report_gate_entry_report',
      '/reports/raw_material_purchasing': 'report_rmp_report',
      '/reports/de_heading': 'report_de_heading_report',
      '/reports/grading_report': 'report_grading_report',
      '/reports/peeling_report': 'report_peeling_report',
      '/reports/soaking_report': 'report_soaking_report',
      '/reports/production_report': 'report_production_report',
      '/reports/re-process': 'report_reprocess_report',
      '/reports/floor_balance_report': 'report_floor_balance_report'
    };

    const reactId = pathsMapInverse[route];
    if (reactId) {
      // This app uses HashRouter. Without the hash the iframe resolves to `/`
      // and App falls back to dashboard_processing, nesting this dashboard.
      setModalUrl(`/#/page/${encodeURIComponent(reactId)}?${targetUrl.searchParams.toString()}`);
    } else {
      setModalUrl(`${route}?${targetUrl.searchParams.toString()}`);
    }
    document.body.style.overflow = 'hidden';
  };

  const closeModal = () => {
    setModalUrl(null);
    setModalTitle('');
    setModalLoading(false);
    document.body.style.overflow = 'auto';
    setStatsReloadTrigger(prev => prev + 1);
  };

  const isMobile = windowWidth <= 992;

  if (loading && !data) {
    return <ProcessingDashboardSkeleton isMobile={isMobile} />;
  }

  if (error && !data) {
    return (
      <div style={centeredErrorShellStyle}>
        <div role="alert" style={{ ...errorPanelStyle, maxWidth: '560px', width: 'calc(100% - 32px)' }}>
          <span><i className="fa-solid fa-triangle-exclamation"></i> {error}</span>
          <button type="button" style={retryButtonStyle} onClick={() => setStatsReloadTrigger(value => value + 1)}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="module-shell" style={containerStyle}>
      {!isMobile && (
        <aside className="module-rail">
          <div className="rail-title">
            <i className="fa-solid fa-industry"></i> Production
          </div>
          <div className="rail-section">
            <div className="rail-label">Forms</div>
            <button className="rail-link" onClick={() => handleKpiClick('gate_entry', '/processing/gate_entry')}>
              <i className="fa-solid fa-door-open"></i>
              <span>Gate Entry</span>
            </button>
            <button className="rail-link" onClick={() => handleKpiClick('raw_material_purchasing', '/processing/raw_material_purchasing')}>
              <i className="fa-solid fa-truck-ramp-box"></i>
              <span>RM Purchasing</span>
            </button>
            <button className="rail-link" onClick={() => handleKpiClick('de_heading', '/processing/de_heading')}>
              <i className="fa-solid fa-scissors"></i>
              <span>De-Heading</span>
            </button>
            <button className="rail-link" onClick={() => handleKpiClick('grading', '/processing/grading')}>
              <i className="fa-solid fa-filter"></i>
              <span>Grading</span>
            </button>
            <button className="rail-link" onClick={() => handleKpiClick('peeling', '/processing/peeling')}>
              <i className="fa-solid fa-hand-dots"></i>
              <span>Peeling</span>
            </button>
            <button className="rail-link" onClick={() => handleKpiClick('soaking', '/processing/soaking')}>
              <i className="fa-solid fa-droplet"></i>
              <span>Soaking</span>
            </button>
            <button className="rail-link" onClick={() => handleKpiClick('production', '/processing/production')}>
              <i className="fa-solid fa-industry"></i>
              <span>Production Entry</span>
            </button>
            <button className="rail-link" onClick={() => handleKpiClick('finance_production_cost_allocation', '/finance_accounts/production_cost_allocation/entry')}>
              <i className="fa-solid fa-coins"></i>
              <span>Cost Allocation</span>
            </button>
          </div>
          <div className="rail-section">
            <div className="rail-label">Reports</div>
            <button className="rail-link" onClick={() => handleKpiClick('report_gate_entry_report', '/reports/gate_entry')}>
              <i className="fa-solid fa-file-lines"></i>
              <span>Gate Entry Report</span>
            </button>
            <button className="rail-link" onClick={() => handleKpiClick('report_rmp_report', '/reports/raw_material_purchasing')}>
              <i className="fa-solid fa-file-invoice"></i>
              <span>RM Purchase Report</span>
            </button>
            <button className="rail-link" onClick={() => handleKpiClick('report_de_heading_report', '/reports/de_heading')}>
              <i className="fa-solid fa-file-medical"></i>
              <span>De-Heading Report</span>
            </button>
            <button className="rail-link" onClick={() => handleKpiClick('report_grading_report', '/reports/grading_report')}>
              <i className="fa-solid fa-file-shield"></i>
              <span>Grading Report</span>
            </button>
            <button className="rail-link" onClick={() => handleKpiClick('report_peeling_report', '/reports/peeling_report')}>
              <i className="fa-solid fa-file-import"></i>
              <span>Peeling Report</span>
            </button>
            <button className="rail-link" onClick={() => handleKpiClick('report_soaking_report', '/reports/soaking_report')}>
              <i className="fa-solid fa-file-word"></i>
              <span>Soaking Report</span>
            </button>
            <button className="rail-link" onClick={() => handleKpiClick('report_production_report', '/reports/production_report')}>
              <i className="fa-solid fa-file-export"></i>
              <span>Production Report</span>
            </button>
            <button className="rail-link" onClick={() => handleKpiClick('report_reprocess_report', '/reports/re-process')}>
              <i className="fa-solid fa-arrows-rotate"></i>
              <span>Re-Process Report</span>
            </button>
            <button className="rail-link" onClick={() => handleKpiClick('report_floor_balance_report', '/reports/floor_balance_report')}>
              <i className="fa-solid fa-scale-balanced"></i>
              <span>Floor Balance</span>
            </button>
          </div>
        </aside>
      )}

      <main className="module-main" style={isMobile ? { width: '100%', height: '100%', overflowY: 'auto' } : { height: '100%', overflowY: 'auto', paddingRight: '4px' }}>
        {/* Filters Toolbar */}
        <div className="erp-horizontal-filter-row" style={filterToolbarStyle}>
          <div style={filterGroupStyle}>
            <label style={filterLabelStyle}>Dashboard Date</label>
            <input type="date" style={filterInputStyle} value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
          </div>
          <div style={filterGroupStyle}>
            <label style={filterLabelStyle}>Production For (Company)</label>
            <select
              style={filterSelectStyle}
              value={selectedCompany}
              onChange={e => {
                const val = e.target.value;
                setSelectedCompany(val);
                localStorage.setItem('production_for_filter', val);
                window.dispatchEvent(new CustomEvent('filter_change', { detail: { production_for: val, location: selectedLocation } }));
              }}
            >
              <option value="">All Companies</option>
              {companies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div style={filterGroupStyle}>
            <label style={filterLabelStyle}>Location</label>
            <select
              style={filterSelectStyle}
              value={selectedLocation}
              onChange={e => {
                const val = e.target.value;
                setSelectedLocation(val);
                localStorage.setItem('plant_location_filter', val);
                window.dispatchEvent(new CustomEvent('filter_change', { detail: { production_for: selectedCompany, location: val } }));
              }}
            >
              <option value="">All Locations</option>
              {locations.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>
        </div>

        {loading && data && (
          <div style={loadingOverlayStyle}>
            <SkeletonBlock width="180px" height="10px" />
          </div>
        )}

        {error && (
          <div role="alert" style={errorPanelStyle}>
            <span><i className="fa-solid fa-triangle-exclamation"></i> {error}</span>
            <button type="button" style={retryButtonStyle} onClick={() => setStatsReloadTrigger(value => value + 1)}>Retry</button>
          </div>
        )}

        {/* KPI Cards Grid */}
        <div className="kpi-grid">
          <div className="kpi-card kpi-yellow" onClick={() => handleKpiClick('gate_entry', '/processing/gate_entry')}>
            <div className="kpi-header">
              <h4>Gate Entries</h4>
              <div className="kpi-icon"><i className="fa-solid fa-door-open"></i></div>
            </div>
            <div>
              <div className="value">{data?.gate_today ?? 0}</div>
            </div>
          </div>

          <div className="kpi-card kpi-blue" onClick={() => handleKpiClick('raw_material_purchasing', '/processing/raw_material_purchasing')}>
            <div className="kpi-header">
              <h4>Raw Material</h4>
              <div className="kpi-icon"><i className="fa-solid fa-truck-ramp-box"></i></div>
            </div>
            <div>
              <div className="value">
                {data?.rmp_today ?? '0.00'}<span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', marginLeft: '2px' }}>kg</span>
              </div>
            </div>
          </div>

          <div className="kpi-card kpi-blue" onClick={() => handleKpiClick('de_heading', '/processing/de_heading')}>
            <div className="kpi-header">
              <h4>De-heading</h4>
              <div className="kpi-icon"><i className="fa-solid fa-scissors"></i></div>
            </div>
            <div>
              <div className="value">
                {data?.dh_today ?? '0.00'}<span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', marginLeft: '2px' }}>kg</span>
              </div>
            </div>
          </div>

          <div className="kpi-card kpi-blue" onClick={() => handleKpiClick('grading', '/processing/grading')}>
            <div className="kpi-header">
              <h4>Grading</h4>
              <div className="kpi-icon"><i className="fa-solid fa-filter"></i></div>
            </div>
            <div>
              <div className="value">
                {data?.grading_today ?? '0.00'}<span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', marginLeft: '2px' }}>kg</span>
              </div>
            </div>
          </div>

          <div className="kpi-card kpi-green" onClick={() => handleKpiClick('peeling', '/processing/peeling')}>
            <div className="kpi-header">
              <h4>Peeling</h4>
              <div className="kpi-icon"><i className="fa-solid fa-hand-dots"></i></div>
            </div>
            <div>
              <div className="value">
                {data?.peeling_today ?? '0.00'}<span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', marginLeft: '2px' }}>kg</span>
              </div>
            </div>
          </div>

          <div className="kpi-card kpi-blue" onClick={() => handleKpiClick('soaking', '/processing/soaking')}>
            <div className="kpi-header">
              <h4>Soaking</h4>
              <div className="kpi-icon"><i className="fa-solid fa-droplet"></i></div>
            </div>
            <div>
              <div className="value">
                {data?.soaking_today ?? '0.00'}<span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', marginLeft: '2px' }}>kg</span>
              </div>
            </div>
          </div>

          <div className="kpi-card kpi-green" onClick={() => handleKpiClick('production', '/processing/production')}>
            <div className="kpi-header">
              <h4>Production</h4>
              <div className="kpi-icon"><i className="fa-solid fa-industry"></i></div>
            </div>
            <div>
              <div className="value">
                {data?.production_today ?? '0.00'}<span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', marginLeft: '2px' }}>kg</span>
              </div>
            </div>
          </div>

          <div className="kpi-card kpi-gray" onClick={() => handleKpiClick('report_floor_balance_report', '/reports/floor_balance_report')}>
            <div className="kpi-header">
              <h4>Floor Snapshot (9 AM)</h4>
              <div className="kpi-icon"><i className="fa-solid fa-snowflake"></i></div>
            </div>
            <div>
              <div className="value">
                {liveFloorKpi}<span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)', marginLeft: '2px' }}>kg</span>
              </div>
              <div style={{ fontSize: '9px', color: 'var(--text-tertiary)', marginTop: '4px', fontWeight: 700 }}>
                {data?.floor_snapshot_date || selectedDate} · 09:00 IST
              </div>
            </div>
          </div>
        </div>

        {/* Live Attendance Swipe Module */}
        <div style={sectionHeaderStyle}>
          <span>Staff Attendance — Selected Dashboard Date</span>
          <div style={sectionHeaderLineStyle}></div>
        </div>
        <div style={attendanceViewportStyle}>
          <div style={attendanceStatsContainerStyle}>
            <div style={attendanceCardStyle} className="card">
              <div style={kpiMetaStyle}>
                <div style={kpiLabelStyle}>Total Staff</div>
                <div style={kpiValueStyle}>{data?.att_stats?.total ?? 0}</div>
              </div>
              <div style={{ ...kpiIconWrapperStyle, background: 'rgba(100, 116, 139, 0.1)', color: '#64748b' }}>
                <i className="fa-solid fa-users"></i>
              </div>
            </div>

            <div style={attendanceCardStyle} className="card">
              <div style={kpiMetaStyle}>
                <div style={kpiLabelStyle}>On Duty</div>
                <div style={kpiValueStyle}>{data?.att_stats?.inside ?? 0}</div>
              </div>
              <div style={{ ...kpiIconWrapperStyle, background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
                <i className="fa-solid fa-user-check"></i>
              </div>
            </div>

            <div style={attendanceCardStyle} className="card">
              <div style={kpiMetaStyle}>
                <div style={kpiLabelStyle}>On Break</div>
                <div style={kpiValueStyle}>{data?.att_stats?.away ?? 0}</div>
              </div>
              <div style={{ ...kpiIconWrapperStyle, background: 'rgba(234, 88, 12, 0.1)', color: '#ea580c' }}>
                <i className="fa-solid fa-mug-hot"></i>
              </div>
            </div>

            <div style={attendanceCardStyle} className="card">
              <div style={kpiMetaStyle}>
                <div style={kpiLabelStyle}>Half Day</div>
                <div style={kpiValueStyle}>{data?.att_stats?.half ?? 0}</div>
              </div>
              <div style={{ ...kpiIconWrapperStyle, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                <i className="fa-solid fa-user-clock"></i>
              </div>
            </div>

            <div style={attendanceCardStyle} className="card">
              <div style={kpiMetaStyle}>
                <div style={kpiLabelStyle}>Single Shift Workers</div>
                <div style={kpiValueStyle}>{data?.att_stats?.single ?? 0}</div>
              </div>
              <div style={{ ...kpiIconWrapperStyle, background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                <i className="fa-solid fa-user-tie"></i>
              </div>
            </div>

            <div style={attendanceCardStyle} className="card">
              <div style={kpiMetaStyle}>
                <div style={kpiLabelStyle}>Double Shift Workers</div>
                <div style={kpiValueStyle}>{data?.att_stats?.double ?? 0}</div>
              </div>
              <div style={{ ...kpiIconWrapperStyle, background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
                <i className="fa-solid fa-user-plus"></i>
              </div>
            </div>
          </div>
        </div>

        {/* Designation and Dept Summary Grid */}
        <div style={summaryGridStyle}>
          <div className="card" style={{ padding: '16px' }}>
            <h4 style={summaryCardTitleStyle}>Department Staff Summary</h4>
            <table className="rm-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
              <tbody>
                {data?.dept_summary && Object.keys(data.dept_summary).length > 0 ? (
                  Object.entries(data.dept_summary).map(([dept, vals]) => (
                    <tr key={dept} style={summaryRowStyle}>
                      <td style={summaryTdStyle}>{dept}</td>
                      <td style={{ ...summaryTdStyle, textAlign: 'right', color: '#10b981' }}>
                        Present: <strong>{vals.active}</strong>
                      </td>
                      <td style={{ ...summaryTdStyle, textAlign: 'right', color: '#e11d48' }}>
                        Absent: <strong>{vals.closed}</strong>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3" style={{ textAlign: 'center', padding: '10px', color: 'var(--text-tertiary)' }}>
                      No department data compiled.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ padding: '16px' }}>
            <h4 style={summaryCardTitleStyle}>Job Role Summary</h4>
            <table className="rm-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
              <tbody>
                {data?.desg_summary && Object.keys(data.desg_summary).length > 0 ? (
                  Object.entries(data.desg_summary).map(([desg, vals]) => (
                    <tr key={desg} style={summaryRowStyle}>
                      <td style={summaryTdStyle}>{desg}</td>
                      <td style={{ ...summaryTdStyle, textAlign: 'right', color: '#10b981' }}>
                        Present: <strong>{vals.active}</strong>
                      </td>
                      <td style={{ ...summaryTdStyle, textAlign: 'right', color: '#e11d48' }}>
                        Absent: <strong>{vals.closed}</strong>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="3" style={{ textAlign: 'center', padding: '10px', color: 'var(--text-tertiary)' }}>
                      No designation data compiled.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* RM Purchasing Summary Section */}
        <div style={sectionHeaderStyle}>
          <span>Raw Material Purchase Summary</span>
          <div style={sectionHeaderLineStyle}></div>
        </div>
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '20px' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="bknr-table" style={{ margin: 0, minWidth: '600px' }}>
              <thead>
                <tr>
                  <th className="text-left" style={tableHeaderStyle}>Fish Species</th>
                  <th className="text-left" style={tableHeaderStyle}>Variety</th>
                  <th className="text-left" style={tableHeaderStyle}>Size Count</th>
                  <th className="text-right" style={tableHeaderStyle}>Total Weight (KG)</th>
                </tr>
              </thead>
              <tbody>
                {data?.rm_summary && data.rm_summary.length > 0 ? (
                  data.rm_summary.map((item, idx) => (
                    <tr key={idx}>
                      <td className="text-left" style={tableTdStyle}>{item.species}</td>
                      <td className="text-left" style={tableTdStyle}>{item.variety || '-'}</td>
                      <td className="text-left" style={tableTdStyle}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: '700' }}>{item.count}</span>
                      </td>
                      <td className="text-right" style={{ ...tableTdStyle, color: '#2563eb', fontWeight: '800' }}>
                        {item.qty.toFixed(2)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" style={{ textAlign: 'center', padding: '16px', color: 'var(--text-tertiary)' }}>
                      No purchasing records found for the selected KPI date.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Hourly Analytics Charts */}
        <div style={sectionHeaderStyle}>
          <span>Hourly Production Output</span>
          <div style={sectionHeaderLineStyle}></div>
        </div>
        <div style={chartsRowStyle}>
          <div style={chartBoxStyle} className="card">
            <div style={chartTitleStyle}>De-Heading (KG/Hour)</div>
            <div style={{ height: '140px', position: 'relative' }}>
              <canvas ref={dhCanvasRef}></canvas>
            </div>
          </div>
          <div style={chartBoxStyle} className="card">
            <div style={chartTitleStyle}>Peeling (KG/Hour)</div>
            <div style={{ height: '140px', position: 'relative' }}>
              <canvas ref={peelingCanvasRef}></canvas>
            </div>
          </div>
          <div style={chartBoxStyle} className="card">
            <div style={chartTitleStyle}>Production (KG/Hour)</div>
            <div style={{ height: '140px', position: 'relative' }}>
              <canvas ref={prodCanvasRef}></canvas>
            </div>
          </div>
        </div>

        {/* Current Floor Balance Report */}
        <div className="card" style={{ padding: '16px', display: 'flex', flexDirection: 'column' }}>
          <FloorBalanceReport
            activeRoute="/reports/floor_balance_report"
            params={{ snapshot_date: selectedDate }}
            hideSnapshotStatus
          />
        </div>
      </main>

      {modalUrl && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modalTitle}</h3>
              <button className="close-btn" onClick={closeModal}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="entry-frame-shell" style={{ flex: 1, minHeight: 0 }}>
              {modalLoading && (
                <div style={{ position: 'absolute', inset: 0, background: 'var(--bg-app)', zIndex: 10, overflow: 'hidden' }}>
                  <EmbeddedPageSkeleton />
                </div>
              )}
              <iframe
                src={modalUrl}
                style={iframeStyle}
                onLoad={() => setModalLoading(false)}
                title="Process modal console"
              ></iframe>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SkeletonBlock({ width = '100%', height = '12px', radius = '7px', style }) {
  return <span className="processing-skeleton-block" style={{ display: 'block', width, height, borderRadius: radius, ...style }} />;
}

function SkeletonRail() {
  return (
    <aside className="module-rail" aria-hidden="true">
      <SkeletonBlock width="58%" height="15px" style={{ marginBottom: 22 }} />
      {Array.from({ length: 8 }, (_, index) => (
        <SkeletonBlock key={`form-${index}`} height="38px" style={{ marginBottom: 7 }} />
      ))}
      <SkeletonBlock width="38%" height="9px" style={{ margin: '18px 0 10px' }} />
      {Array.from({ length: 5 }, (_, index) => (
        <SkeletonBlock key={`report-${index}`} height="38px" style={{ marginBottom: 7 }} />
      ))}
    </aside>
  );
}

function ProcessingDashboardSkeleton({ isMobile }) {
  return (
    <div className="module-shell processing-dashboard-skeleton" style={containerStyle} aria-label="Loading Processing Dashboard">
      <style>{processingSkeletonCss}</style>
      {!isMobile && <SkeletonRail />}
      <main className="module-main" style={{ height: '100%', overflow: 'hidden', paddingRight: isMobile ? 0 : 4 }}>
        <div style={skeletonFilterGridStyle}>
          {Array.from({ length: 3 }, (_, index) => <SkeletonBlock key={index} height="52px" />)}
        </div>
        <div className="processing-skeleton-kpis">
          {Array.from({ length: 8 }, (_, index) => <SkeletonBlock key={index} height="92px" radius="10px" />)}
        </div>
        <SkeletonBlock width="190px" height="11px" style={{ margin: '22px 0 12px' }} />
        <div className="processing-skeleton-attendance">
          {Array.from({ length: 6 }, (_, index) => <SkeletonBlock key={index} height="72px" radius="10px" />)}
        </div>
        <div className="processing-skeleton-summary">
          <SkeletonBlock height="132px" radius="10px" />
          <SkeletonBlock height="132px" radius="10px" />
        </div>
        <SkeletonBlock width="230px" height="11px" style={{ margin: '22px 0 12px' }} />
        <div style={{ display: 'grid', gap: 1 }}>
          {Array.from({ length: 4 }, (_, index) => <SkeletonBlock key={index} height={index === 0 ? '38px' : '34px'} radius="3px" />)}
        </div>
      </main>
    </div>
  );
}

function EmbeddedPageSkeleton() {
  return (
    <div className="processing-embedded-skeleton" aria-label="Loading form">
      <style>{processingSkeletonCss}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <SkeletonBlock width="38%" height="18px" />
        <SkeletonBlock width="96px" height="34px" />
      </div>
      <div className="processing-embedded-fields">
        {Array.from({ length: 8 }, (_, index) => <SkeletonBlock key={index} height="54px" />)}
      </div>
      <SkeletonBlock width="160px" height="13px" />
      <div style={{ display: 'grid', gap: 2 }}>
        {Array.from({ length: 6 }, (_, index) => <SkeletonBlock key={index} height={index === 0 ? '42px' : '36px'} radius="3px" />)}
      </div>
    </div>
  );
}

const processingSkeletonCss = `
  .processing-skeleton-block {
    position: relative;
    overflow: hidden;
    background: var(--loader-skeleton-base, color-mix(in srgb, var(--border-light) 82%, var(--surface-panel)));
  }
  .processing-skeleton-block::after {
    content: "";
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background: linear-gradient(90deg, transparent, var(--loader-skeleton-shine, rgba(255,255,255,.42)), transparent);
    animation: processingSkeletonShimmer 1.15s ease-in-out infinite;
  }
  .processing-skeleton-kpis { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
  .processing-skeleton-attendance { display:grid; grid-template-columns:repeat(6,minmax(145px,1fr)); gap:12px; overflow:hidden; }
  .processing-skeleton-summary { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px; margin-top:20px; }
  .processing-embedded-skeleton { display:grid; gap:18px; padding:20px; }
  .processing-embedded-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
  @keyframes processingSkeletonShimmer { to { transform:translateX(100%); } }
  @media (max-width: 720px) {
    .processing-skeleton-kpis { grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
    .processing-skeleton-attendance { grid-template-columns:repeat(3,minmax(130px,1fr)); }
    .processing-skeleton-summary, .processing-embedded-fields { grid-template-columns:1fr; }
  }
  @media (prefers-reduced-motion: reduce) { .processing-skeleton-block::after { animation:none; } }
`;

// Styling Constants
const containerStyle = {
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  position: 'relative'
};

const filterToolbarStyle = {
  display: 'flex',
  gap: '12px',
  background: 'var(--border-light)',
  padding: '12px 16px',
  borderRadius: 'var(--radius-element)',
  marginBottom: '20px',
  flexWrap: 'nowrap',
  alignItems: 'flex-end',
  border: '1px solid var(--border-light)',
  overflowX: 'auto',
  overflowY: 'hidden',
  WebkitOverflowScrolling: 'touch',
  scrollbarWidth: 'thin'
};

const filterGroupStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  flex: '0 0 180px'
};

const filterLabelStyle = {
  fontSize: '11px',
  fontWeight: '800',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px'
};

const filterInputStyle = {
  padding: '8px 12px',
  fontSize: '13px',
  borderRadius: '6px',
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--text-primary)',
  outline: 'none'
};

const filterSelectStyle = {
  ...filterInputStyle,
  cursor: 'pointer'
};

const loadingOverlayStyle = {
  display: 'flex',
  gap: '10px',
  alignItems: 'center',
  background: 'rgba(255, 255, 255, 0.05)',
  padding: '10px 16px',
  borderRadius: '8px',
  marginBottom: '20px',
  border: '1px dashed var(--corp-dash)'
};

const errorPanelStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '14px',
  padding: '12px 14px',
  marginBottom: '16px',
  borderRadius: '8px',
  border: '1px solid rgba(220, 38, 38, .35)',
  background: 'rgba(220, 38, 38, .08)',
  color: 'var(--text-primary)',
  fontSize: '12px',
  fontWeight: 700
};

const retryButtonStyle = {
  border: 0,
  borderRadius: '6px',
  padding: '7px 13px',
  background: '#dc2626',
  color: '#fff',
  fontSize: '11px',
  fontWeight: 800,
  cursor: 'pointer'
};

const centeredErrorShellStyle = {
  width: '100%',
  height: '100%',
  minHeight: '320px',
  display: 'grid',
  placeItems: 'center',
  background: 'var(--bg-app)'
};

const skeletonFilterGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
  gap: '12px',
  marginBottom: '20px'
};

const kpiMetaStyle = {
  textAlign: 'left'
};

const kpiLabelStyle = {
  fontSize: '10px',
  textTransform: 'uppercase',
  fontWeight: '800',
  color: 'var(--text-secondary)',
  letterSpacing: '0.8px'
};

const kpiValueStyle = {
  fontSize: '19px',
  fontWeight: '800',
  color: 'var(--text-primary)',
  marginTop: '4px',
  letterSpacing: '-0.5px'
};

const kpiIconWrapperStyle = {
  width: '36px',
  height: '36px',
  borderRadius: '10px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '16px',
  flexShrink: 0
};

const sectionHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  color: 'var(--text-secondary)',
  fontSize: '11px',
  fontWeight: '800',
  letterSpacing: '1px',
  textTransform: 'uppercase',
  margin: '20px 0 10px 0',
  width: '100%'
};

const sectionHeaderLineStyle = {
  flex: 1,
  height: '1px',
  background: 'var(--border-light)',
  marginLeft: '16px',
  border: 'none'
};

const tableHeaderStyle = {
  fontSize: '10px',
  fontWeight: '800',
  letterSpacing: '0.8px',
  background: 'var(--border-light)',
  padding: '10px 14px'
};

const tableTdStyle = {
  padding: '12px 14px',
  fontWeight: '700'
};

const chartsRowStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: '16px',
  marginBottom: '20px'
};

const chartBoxStyle = {
  padding: '16px 12px'
};

const chartTitleStyle = {
  fontSize: '10px',
  fontWeight: '800',
  color: 'var(--text-secondary)',
  marginBottom: '14px',
  textAlign: 'center',
  letterSpacing: '0.8px',
  textTransform: 'uppercase'
};

const attendanceViewportStyle = {
  overflowX: 'auto',
  scrollbarWidth: 'none',
  marginBottom: '20px',
  padding: '6px 0',
  width: '100%'
};

const attendanceStatsContainerStyle = {
  display: 'flex',
  gap: '12px',
  width: 'max-content'
};

const attendanceCardStyle = {
  width: '175px',
  flexShrink: 0,
  padding: '14px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between'
};

const summaryGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: '16px',
  marginBottom: '20px'
};

const summaryCardTitleStyle = {
  margin: '0 0 12px 0',
  fontSize: '10px',
  fontWeight: '800',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px'
};

const summaryRowStyle = {
  borderBottom: '1px solid var(--border-light)'
};

const summaryTdStyle = {
  padding: '8px 0',
  fontWeight: '700'
};

const iframeStyle = {
  width: '100%',
  height: '100%',
  border: 'none',
  background: 'transparent'
};
