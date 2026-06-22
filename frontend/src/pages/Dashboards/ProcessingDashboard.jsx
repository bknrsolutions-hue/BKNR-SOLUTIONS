import React, { useState, useEffect, useRef } from 'react';

export default function ProcessingDashboard({ theme }) {
  // Filters State
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [hourDate, setHourDate] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');

  // Dropdown options
  const [companies, setCompanies] = useState([]);
  const [locations, setLocations] = useState([]);

  // Dashboard Data State
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [liveFloorKpi, setLiveFloorKpi] = useState('0.00');

  // Chart Canvas Refs
  const dhCanvasRef = useRef(null);
  const peelingCanvasRef = useRef(null);
  const prodCanvasRef = useRef(null);

  // Chart Instance Refs
  const dhChartInstance = useRef(null);
  const peelingChartInstance = useRef(null);
  const prodChartInstance = useRef(null);

  // Floor iframe ref
  const iframeRef = useRef(null);

  // Init Dates & Load Dropdowns
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setToDate(today);
    setHourDate(today);

    const sixDaysAgo = new Date();
    sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);
    setFromDate(sixDaysAgo.toISOString().split('T')[0]);

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

  // Fetch Dashboard Stats on Filter Change
  useEffect(() => {
    if (!fromDate || !toDate || !hourDate) return;

    setLoading(true);
    let url = `/processing_dashboard?format=json&from_date=${fromDate}&to_date=${toDate}&hour_date=${hourDate}`;
    if (selectedCompany) url += `&production_for=${encodeURIComponent(selectedCompany)}`;
    if (selectedLocation) url += `&location=${encodeURIComponent(selectedLocation)}`;

    fetch(url)
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('Failed to fetch dashboard statistics');
      })
      .then((resData) => {
        if (resData.status === 'success') {
          setData(resData);
          setLiveFloorKpi(resData.floor_total || '0.00');
        }
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  }, [fromDate, toDate, hourDate, selectedCompany, selectedLocation]);

  // Synchronize Live Floor grand net balance from Iframe body safely
  const syncLiveFloorFromIframe = () => {
    try {
      const iframe = iframeRef.current;
      if (!iframe) return;
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      if (!iframeDoc) return;

      const cells = iframeDoc.querySelectorAll("td, th, span, div, b, strong");
      for (let i = 0; i < cells.length; i++) {
        const elText = cells[i].textContent || cells[i].innerText || "";
        if (elText.toUpperCase().includes("GRAND NET BALANCE:")) {
          const balancePart = elText.toUpperCase().split("GRAND NET BALANCE:")[1];
          const numMatch = balancePart.match(/[0-9,.]+/);
          if (numMatch) {
            setLiveFloorKpi(numMatch[0].trim());
            return;
          }
        }
      }

      // Fallback manual sum calculation of visible rows
      let computedTotal = 0;
      const iframeRows = iframeDoc.querySelectorAll("table tbody tr");
      let parsedRows = false;
      for (let i = 0; i < iframeRows.length; i++) {
        const row = iframeRows[i];
        if (row.style.display !== "none") {
          const columns = row.querySelectorAll("td");
          if (columns.length > 0) {
            const lastCellText = columns[columns.length - 1].innerText;
            if (/[0-9]/.test(lastCellText) && !lastCellText.toUpperCase().includes("TOTAL")) {
              const val = parseFloat(lastCellText.replace(/[^0-9.]/g, '')) || 0;
              computedTotal += val;
              parsedRows = true;
            }
          }
        }
      }
      if (parsedRows && computedTotal > 0) {
        setLiveFloorKpi(computedTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      }
    } catch (e) {
      console.warn("Iframe cross-origin or structural parsing blocked:", e);
    }
  };

  // Attach theme to iframe load
  const handleIframeLoad = () => {
    syncLiveFloorFromIframe();
    try {
      const iframe = iframeRef.current;
      if (iframe) {
        const frameDoc = iframe.contentDocument || iframe.contentWindow.document;
        const currentTheme = theme || document.documentElement.getAttribute("data-theme") || "light";
        frameDoc.documentElement.setAttribute("data-theme", currentTheme);
      }
    } catch (e) {}
  };

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
          datasets: [{ data: data.dh_hourly_data, backgroundColor: '#ea580c', borderRadius: 4 }]
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
          datasets: [{ data: data.peeling_hourly_data, backgroundColor: '#0d9488', borderRadius: 4 }]
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
          datasets: [{ data: data.prod_hourly_data, backgroundColor: '#4f46e5', borderRadius: 4 }]
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

  // Build local Report URL with query params
  const getFloorReportUrl = () => {
    let url = `/reports/floor_balance_report?from_date=${fromDate}&to_date=${toDate}`;
    if (selectedCompany) url += `&production_for=${encodeURIComponent(selectedCompany)}`;
    if (selectedLocation) url += `&location=${encodeURIComponent(selectedLocation)}`;
    return url;
  };

  return (
    <div style={containerStyle}>
      {/* Filters Toolbar */}
      <div style={filterToolbarStyle}>
        <div style={filterGroupStyle}>
          <label style={filterLabelStyle}>From Date</label>
          <input type="date" style={filterInputStyle} value={fromDate} onChange={e => setFromDate(e.target.value)} />
        </div>
        <div style={filterGroupStyle}>
          <label style={filterLabelStyle}>To Date</label>
          <input type="date" style={filterInputStyle} value={toDate} onChange={e => setToDate(e.target.value)} />
        </div>
        <div style={filterGroupStyle}>
          <label style={filterLabelStyle}>Hourly Chart Date</label>
          <input type="date" style={filterInputStyle} value={hourDate} onChange={e => setHourDate(e.target.value)} />
        </div>
        <div style={filterGroupStyle}>
          <label style={filterLabelStyle}>Production For (Company)</label>
          <select style={filterSelectStyle} value={selectedCompany} onChange={e => setSelectedCompany(e.target.value)}>
            <option value="">All Companies</option>
            {companies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={filterGroupStyle}>
          <label style={filterLabelStyle}>Location</label>
          <select style={filterSelectStyle} value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)}>
            <option value="">All Locations</option>
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      {loading && (
        <div style={loadingOverlayStyle}>
          <div style={spinnerStyle}></div>
          <span style={{ fontSize: '12px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>
            Syncing live worksheets...
          </span>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div style={kpiGridStyle}>
        <div style={{ ...kpiCardStyle, borderLeft: '4px solid #3b82f6' }}>
          <div style={kpiMetaStyle}>
            <div style={kpiLabelStyle}>Gate Today</div>
            <div style={kpiValueStyle}>{data?.gate_today ?? 0}</div>
          </div>
          <div style={{ ...kpiIconWrapperStyle, background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
            <i className="fa-solid fa-door-open"></i>
          </div>
        </div>

        <div style={{ ...kpiCardStyle, borderLeft: '4px solid #10b981' }}>
          <div style={kpiMetaStyle}>
            <div style={kpiLabelStyle}>RM Today</div>
            <div style={kpiValueStyle}>
              {data?.rmp_today ?? '0.00'}<span style={kpiUnitStyle}>kg</span>
            </div>
          </div>
          <div style={{ ...kpiIconWrapperStyle, background: 'rgba(16, 185, 129, 0.1)', color: '#10b981' }}>
            <i className="fa-solid fa-truck-ramp-box"></i>
          </div>
        </div>

        <div style={{ ...kpiCardStyle, borderLeft: '4px solid #ea580c' }}>
          <div style={kpiMetaStyle}>
            <div style={kpiLabelStyle}>DH Today</div>
            <div style={kpiValueStyle}>
              {data?.dh_today ?? '0.00'}<span style={kpiUnitStyle}>kg</span>
            </div>
          </div>
          <div style={{ ...kpiIconWrapperStyle, background: 'rgba(234, 88, 12, 0.1)', color: '#ea580c' }}>
            <i className="fa-solid fa-scissors"></i>
          </div>
        </div>

        <div style={{ ...kpiCardStyle, borderLeft: '4px solid #8b5cf6' }}>
          <div style={kpiMetaStyle}>
            <div style={kpiLabelStyle}>Grading Today</div>
            <div style={kpiValueStyle}>
              {data?.grading_today ?? '0.00'}<span style={kpiUnitStyle}>kg</span>
            </div>
          </div>
          <div style={{ ...kpiIconWrapperStyle, background: 'rgba(139, 92, 246, 0.1)', color: '#8b5cf6' }}>
            <i className="fa-solid fa-filter"></i>
          </div>
        </div>

        <div style={{ ...kpiCardStyle, borderLeft: '4px solid #14b8a6' }}>
          <div style={kpiMetaStyle}>
            <div style={kpiLabelStyle}>Peeling Today</div>
            <div style={kpiValueStyle}>
              {data?.peeling_today ?? '0.00'}<span style={kpiUnitStyle}>kg</span>
            </div>
          </div>
          <div style={{ ...kpiIconWrapperStyle, background: 'rgba(20, 184, 166, 0.1)', color: '#14b8a6' }}>
            <i className="fa-solid fa-hand-dots"></i>
          </div>
        </div>

        <div style={{ ...kpiCardStyle, borderLeft: '4px solid #ec4899' }}>
          <div style={kpiMetaStyle}>
            <div style={kpiLabelStyle}>Soaking Today</div>
            <div style={kpiValueStyle}>
              {data?.soaking_today ?? '0.00'}<span style={kpiUnitStyle}>kg</span>
            </div>
          </div>
          <div style={{ ...kpiIconWrapperStyle, background: 'rgba(236, 72, 153, 0.1)', color: '#ec4899' }}>
            <i className="fa-solid fa-droplet"></i>
          </div>
        </div>

        <div style={{ ...kpiCardStyle, borderLeft: '4px solid #6366f1' }}>
          <div style={kpiMetaStyle}>
            <div style={kpiLabelStyle}>Prod Today</div>
            <div style={kpiValueStyle}>
              {data?.production_today ?? '0.00'}<span style={kpiUnitStyle}>kg</span>
            </div>
          </div>
          <div style={{ ...kpiIconWrapperStyle, background: 'rgba(99, 102, 241, 0.1)', color: '#6366f1' }}>
            <i className="fa-solid fa-industry"></i>
          </div>
        </div>

        <div style={{ ...kpiCardStyle, borderLeft: '4px solid #64748b' }}>
          <div style={kpiMetaStyle}>
            <div style={kpiLabelStyle}>Live Floor</div>
            <div style={kpiValueStyle}>
              {liveFloorKpi}<span style={kpiUnitStyle}>kg</span>
            </div>
          </div>
          <div style={{ ...kpiIconWrapperStyle, background: 'rgba(100, 116, 139, 0.1)', color: '#64748b' }}>
            <i className="fa-solid fa-snowflake"></i>
          </div>
        </div>
      </div>

      {/* RM Purchasing Summary Section */}
      <div style={sectionHeaderStyle}>
        RM Purchasing Summary <hr style={hrStyle} />
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '20px' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="bknr-table" style={{ margin: 0, minWidth: '600px' }}>
            <thead>
              <tr>
                <th className="text-left" style={tableHeaderStyle}>Species Name</th>
                <th className="text-left" style={tableHeaderStyle}>Count / Size</th>
                <th className="text-right" style={tableHeaderStyle}>Quantity (KG)</th>
              </tr>
            </thead>
            <tbody>
              {data?.rm_summary && data.rm_summary.length > 0 ? (
                data.rm_summary.map((item, idx) => (
                  <tr key={idx}>
                    <td className="text-left" style={tableTdStyle}>{item.species}</td>
                    <td className="text-left" style={tableTdStyle}>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: '700' }}>{item.count}</span>
                    </td>
                    <td className="text-right" style={{ ...tableTdStyle, color: '#3b82f6', fontWeight: '800' }}>
                      {item.qty.toFixed(2)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="3" style={{ textAlign: 'center', padding: '16px', color: 'var(--text-tertiary)' }}>
                    No purchasing records registered for today.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Hourly Analytics Charts */}
      <div style={sectionHeaderStyle}>
        Hourly Analytics <hr style={hrStyle} />
      </div>
      <div style={chartsRowStyle}>
        <div style={chartBoxStyle} className="card">
          <div style={chartTitleStyle}>De-Heading (Hourly)</div>
          <div style={{ height: '140px', position: 'relative' }}>
            <canvas ref={dhCanvasRef}></canvas>
          </div>
        </div>
        <div style={chartBoxStyle} className="card">
          <div style={chartTitleStyle}>Peeling (Hourly)</div>
          <div style={{ height: '140px', position: 'relative' }}>
            <canvas ref={peelingCanvasRef}></canvas>
          </div>
        </div>
        <div style={chartBoxStyle} className="card">
          <div style={chartTitleStyle}>Production (Hourly)</div>
          <div style={{ height: '140px', position: 'relative' }}>
            <canvas ref={prodCanvasRef}></canvas>
          </div>
        </div>
      </div>

      {/* Live Attendance Swipe Module */}
      <div style={sectionHeaderStyle}>
        Live Attendance Status <hr style={hrStyle} />
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
              <div style={kpiLabelStyle}>Inside Floor</div>
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
              <div style={kpiLabelStyle}>Single Shift</div>
              <div style={kpiValueStyle}>{data?.att_stats?.single ?? 0}</div>
            </div>
            <div style={{ ...kpiIconWrapperStyle, background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
              <i className="fa-solid fa-user-tie"></i>
            </div>
          </div>

          <div style={attendanceCardStyle} className="card">
            <div style={kpiMetaStyle}>
              <div style={kpiLabelStyle}>Double Shift</div>
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
          <h4 style={summaryCardTitleStyle}>DEPARTMENT STRUCT</h4>
          <table className="rm-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
            <tbody>
              {data?.dept_summary && Object.keys(data.dept_summary).length > 0 ? (
                Object.entries(data.dept_summary).map(([dept, vals]) => (
                  <tr key={dept} style={summaryRowStyle}>
                    <td style={summaryTdStyle}>{dept}</td>
                    <td style={{ ...summaryTdStyle, textAlign: 'right', color: '#10b981' }}>
                      A: <strong>{vals.active}</strong>
                    </td>
                    <td style={{ ...summaryTdStyle, textAlign: 'right', color: '#e11d48' }}>
                      C: <strong>{vals.closed}</strong>
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
          <h4 style={summaryCardTitleStyle}>DESIGNATION MATRIX</h4>
          <table className="rm-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
            <tbody>
              {data?.desg_summary && Object.keys(data.desg_summary).length > 0 ? (
                Object.entries(data.desg_summary).map(([desg, vals]) => (
                  <tr key={desg} style={summaryRowStyle}>
                    <td style={summaryTdStyle}>{desg}</td>
                    <td style={{ ...summaryTdStyle, textAlign: 'right', color: '#10b981' }}>
                      A: <strong>{vals.active}</strong>
                    </td>
                    <td style={{ ...summaryTdStyle, textAlign: 'right', color: '#e11d48' }}>
                      C: <strong>{vals.closed}</strong>
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

      {/* Live Floor Balance Details Iframe */}
      <div style={sectionHeaderStyle}>
        Live Floor Balance Details <hr style={hrStyle} />
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden', height: '520px', display: 'flex', flexDirection: 'column' }}>
        <iframe
          ref={iframeRef}
          src={getFloorReportUrl()}
          onLoad={handleIframeLoad}
          style={{ width: '100%', height: '100%', border: 'none', background: 'transparent' }}
          title="Floor Report Frame"
        ></iframe>
      </div>
    </div>
  );
}

// Styling Constants
const containerStyle = {
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  position: 'relative'
};

const filterToolbarStyle = {
  display: 'flex',
  gap: '12px',
  background: 'var(--border-light)',
  padding: '12px 16px',
  borderRadius: 'var(--radius-element)',
  marginBottom: '20px',
  flexWrap: 'wrap',
  alignItems: 'flex-end',
  border: '1px solid var(--border-light)'
};

const filterGroupStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  flex: '1 1 180px'
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

const spinnerStyle = {
  width: '16px',
  height: '16px',
  borderRadius: '50%',
  border: '2px solid var(--text-tertiary)',
  borderTopColor: 'var(--corp-dash)',
  animation: 'spin 0.8s linear infinite'
};

const kpiGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '12px',
  marginBottom: '20px'
};

const kpiCardStyle = {
  background: 'var(--surface-panel)',
  border: '1px solid var(--border-light)',
  borderRadius: 'var(--radius-element)',
  padding: '14px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.02)',
  transition: 'transform 0.2s ease'
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

const kpiUnitStyle = {
  fontSize: '11px',
  fontWeight: '800',
  color: 'var(--text-secondary)',
  marginLeft: '2px',
  textTransform: 'uppercase'
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
  gap: '10px',
  margin: '24px 0 12px 0',
  color: 'var(--text-secondary)',
  fontSize: '11px',
  fontWeight: '800',
  letterSpacing: '1.5px',
  textTransform: 'uppercase'
};

const hrStyle = {
  flex: 1,
  border: 0,
  borderTop: '1px solid var(--border-light)'
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
