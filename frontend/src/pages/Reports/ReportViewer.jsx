import React, { useState, useEffect } from 'react';
import { FileText, Search, Printer, Download, RefreshCw, Edit2, Ban, Save, X } from 'lucide-react';
import { formatFinancialYear } from '../../utils/financialYear';
import './BatchSummaryReport.css';
import './PeriodicSummaryReport.css';

function Metric({ label, value, accent = false, success = false, purple = false, danger = false }) {
  const modifiers = [
    accent ? 'batch-metric-accent' : '',
    success ? 'batch-metric-success' : '',
    purple ? 'batch-metric-purple' : '',
    danger ? 'batch-metric-danger' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={`batch-metric-card ${modifiers}`}>
      <span className="batch-metric-label">{label}</span>
      <strong className="batch-metric-value">{value}</strong>
    </div>
  );
}

function GradingSummaryCards({ rows = [], details = [], selectedBatch = '' }) {
  const number = value => Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (!rows.length) {
    return <div className="batch-grading-empty">No grading summary available for this batch.</div>;
  }

  return (
    <div className="batch-grading-grid">
      {rows.map((row, index) => {
        const batch = row.batch_number || selectedBatch;
        const breakdown = details.filter(detail =>
          String(detail.batch_number || detail.batch || '').toLowerCase() === String(batch).toLowerCase()
          && String(detail.species || '').toLowerCase() === String(row.species || '').toLowerCase()
          && String(detail.hoso_count || '').toLowerCase() === String(row.hoso_count || '').toLowerCase()
          && String(detail.variety_name || detail.variety || '').toLowerCase() === String(row.variety || '').toLowerCase()
        );
        const detailTotal = breakdown.reduce((total, detail) => total + Number(detail.quantity || 0), 0);
        const diffKg = Number(row.weight_diff_kg || 0);

        return (
          <article className="batch-grading-card" key={`${batch}-${row.species}-${row.variety}-${row.hoso_count}-${index}`}>
            <header className="batch-grading-card-head">
              <div>
                <strong>Batch: {batch}</strong>
                <span>{row.species || 'N/A'} | {row.variety || 'N/A'}</span>
              </div>
              <div className="batch-grading-count">
                <small>HOSO Count</small>
                <b>{row.hoso_count || '-'}</b>
              </div>
            </header>

            <div className="batch-grading-card-body">
              <div className="batch-grading-actual">
                <span>Actual HOSO Qty:</span>
                <b>{number(row.hoso_qty)} KG</b>
              </div>
              <div className="batch-grading-breakdown-title">Graded Details Breakdown</div>
              <div className="batch-grading-breakdown">
                <div className="batch-grading-breakdown-head"><span>Count</span><span>Quantity</span></div>
                {breakdown.length ? breakdown.map((detail, detailIndex) => (
                  <div className="batch-grading-breakdown-row" key={`${detail.graded_count}-${detailIndex}`}>
                    <span>{detail.graded_count || '-'}</span>
                    <b>{number(detail.quantity)} KG</b>
                  </div>
                )) : (
                  <div className="batch-grading-no-details">No breakdown details available</div>
                )}
                {breakdown.length > 0 && (
                  <div className="batch-grading-total"><span>Total:</span><b>{number(detailTotal)} KG</b></div>
                )}
              </div>
            </div>

            <footer className="batch-grading-card-foot">
              <span>Workout: <b>{row.workout_count || '-'}</b></span>
              <span>Yield: <b>{number(row.yield_pct)}%</b></span>
              <span>Grading HOSO: <b>{number(row.grading_hoso_qty)}</b></span>
              <span>Diff: <b className={diffKg < 0 ? 'is-negative' : 'is-positive'}>{number(diffKg)} ({number(row.weight_diff_pct)}%)</b></span>
            </footer>
          </article>
        );
      })}
    </div>
  );
}

function PeriodicKpi({ label, primary, secondary, icon, onClick }) {
  return (
    <button type="button" className="periodic-kpi-card" onClick={onClick}>
      <span className="periodic-kpi-label">{label} <i className={`fa-solid ${icon}`} /></span>
      <strong>{primary}</strong>
      <small>{secondary}</small>
    </button>
  );
}

function PeriodicFlowPanel({ chart, sectionKey, onPointClick }) {
  const [mode, setMode] = useState('day');
  const [hiddenSeries, setHiddenSeries] = useState([]);
  const [tooltip, setTooltip] = useState(null);
  if (!chart) return null;

  const colors = ['#2563eb', '#10b981', '#8b5cf6', '#f59e0b', '#ef4444', '#0891b2'];
  const availableSeries = (chart.series || []).filter(series => Array.isArray(series[mode]) && series[mode].length);
  const allDatasets = availableSeries.length
    ? availableSeries.map((series, index) => ({ name: series.name || 'N/A', color: colors[index % colors.length], points: series[mode] }))
    : [{ name: chart.title || 'Flow', color: colors[0], points: chart[mode] || [] }];
  const datasets = allDatasets.filter(dataset => !hiddenSeries.includes(dataset.name));
  const labels = [...new Set(datasets.flatMap(dataset => dataset.points.map(point => point.label)))].sort();
  const valuesByDataset = datasets.map(dataset => new Map(dataset.points.map(point => [point.label, Number(point.value || 0)])));
  const maxValue = Math.max(1, ...datasets.flatMap(dataset => dataset.points.map(point => Number(point.value || 0))));
  const width = 760;
  const height = 185;
  const pad = { left: 48, right: 15, top: 15, bottom: 34 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const x = index => pad.left + (labels.length > 1 ? (plotWidth * index) / (labels.length - 1) : plotWidth / 2);
  const y = value => pad.top + plotHeight - (Number(value || 0) / maxValue) * plotHeight;
  const interactivePoints = datasets.flatMap((dataset, datasetIndex) => labels.map((label, index) => {
    const value = valuesByDataset[datasetIndex].get(label) || 0;
    return { dataset: dataset.name, color: dataset.color, label, value, x: x(index), y: y(value) };
  })).filter(point => point.value > 0);
  const summaryItems = chart.summary || [];
  const takeGroup = (title, prefix, fallbackItems = []) => ({
    title,
    items: prefix === null
      ? fallbackItems
      : summaryItems
        .filter(item => String(item.label || '').startsWith(prefix))
        .map(item => ({ ...item, label: String(item.label || '').replace(prefix, '') })),
  });
  const productionForItems = summaryItems.filter(item => String(item.label || '').startsWith('Production For:'));
  let summaryGroups;
  if (sectionKey === 'sec-gate') {
    summaryGroups = [
      takeGroup('Entries', null, summaryItems.filter(item => !String(item.label || '').startsWith('Production For:'))),
      takeGroup('Production For', 'Production For:'),
    ];
  } else if (['sec-deh', 'sec-pel'].includes(sectionKey)) {
    summaryGroups = [takeGroup('Variety Wise', 'Variety:'), takeGroup('Contractor Wise', 'Contractor:'), takeGroup('Production For', 'Production For:')];
  } else if (sectionKey === 'sec-stk-out') {
    summaryGroups = [takeGroup('Variety Wise', 'Variety:'), takeGroup('Purpose Wise', 'Purpose:'), takeGroup('Production At', 'Production At:'), takeGroup('Production For', 'Production For:')];
  } else if (productionForItems.length) {
    summaryGroups = [
      takeGroup('Summary', null, summaryItems.filter(item => !String(item.label || '').startsWith('Production For:'))),
      takeGroup('Production For', 'Production For:'),
    ];
  } else {
    summaryGroups = [takeGroup('Summary', null, summaryItems)];
  }
  summaryGroups = summaryGroups.filter(group => group.items.length);

  return (
    <div className="periodic-flow-panel no-print">
      <div className="periodic-flow-head">
        <div className="periodic-flow-title">
          <i className="fa-solid fa-chart-line" />
          <span>{chart.title || 'Flow Chart'}</span>
          <small>FY {chart.fy || ''}</small>
        </div>
        <div className="periodic-flow-actions">
          <button type="button" className={mode === 'day' ? 'is-active' : ''} onClick={() => setMode('day')}>Day</button>
          <button type="button" className={mode === 'month' ? 'is-active' : ''} onClick={() => setMode('month')}>Month</button>
        </div>
      </div>

      <div className="periodic-flow-grid">
        <div className="periodic-flow-chart">
          {allDatasets.length > 1 && (
            <div className="periodic-flow-legend">
              {allDatasets.map(dataset => (
                <button
                  type="button"
                  key={dataset.name}
                  className={hiddenSeries.includes(dataset.name) ? 'is-hidden' : ''}
                  onClick={() => {
                    setHiddenSeries(current => current.includes(dataset.name)
                      ? current.filter(name => name !== dataset.name)
                      : [...current, dataset.name]);
                    setTooltip(null);
                  }}
                  title={`${hiddenSeries.includes(dataset.name) ? 'Show' : 'Hide'} ${dataset.name}`}
                >
                  <i style={{ background: dataset.color }} />{dataset.name}
                </button>
              ))}
            </div>
          )}
          {labels.length ? (
            <svg
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label={`${chart.title || 'Periodic'} trend chart`}
              onMouseMove={event => {
                const rect = event.currentTarget.getBoundingClientRect();
                const pointerX = ((event.clientX - rect.left) / rect.width) * width;
                const pointerY = ((event.clientY - rect.top) / rect.height) * height;
                const nearest = interactivePoints.reduce((best, point) => {
                  const distance = Math.hypot(point.x - pointerX, point.y - pointerY);
                  return !best || distance < best.distance ? { ...point, distance } : best;
                }, null);
                if (nearest && nearest.distance <= 24) {
                  setTooltip({ ...nearest, left: `${(nearest.x / width) * 100}%`, top: `${(nearest.y / height) * 100}%` });
                } else {
                  setTooltip(null);
                }
              }}
              onMouseLeave={() => setTooltip(null)}
            >
              {[0, 1, 2, 3].map(step => {
                const gridY = pad.top + (plotHeight * step) / 3;
                const gridValue = maxValue - (maxValue * step) / 3;
                return (
                  <g key={step}>
                    <line x1={pad.left} x2={width - pad.right} y1={gridY} y2={gridY} className="periodic-chart-gridline" />
                    <text x="4" y={gridY + 3} className="periodic-chart-axis">{gridValue >= 10 ? gridValue.toFixed(0) : gridValue.toFixed(1)}</text>
                  </g>
                );
              })}
              {datasets.map((dataset, datasetIndex) => {
                const points = labels.map((label, index) => `${x(index)},${y(valuesByDataset[datasetIndex].get(label) || 0)}`).join(' ');
                return (
                  <g key={dataset.name}>
                    <polyline points={points} fill="none" stroke={dataset.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                    {labels.map((label, index) => {
                      const value = valuesByDataset[datasetIndex].get(label) || 0;
                      return value > 0 ? (
                        <g
                          key={label}
                          className="periodic-chart-point"
                          role="button"
                          tabIndex="0"
                          aria-label={`Filter ${mode}: ${label}`}
                          onClick={() => onPointClick?.(mode, label)}
                          onKeyDown={event => {
                            if (event.key === 'Enter' || event.key === ' ') onPointClick?.(mode, label);
                          }}
                        >
                          <circle cx={x(index)} cy={y(value)} r="10" fill="transparent" />
                          <circle cx={x(index)} cy={y(value)} r="3.5" fill="white" stroke={dataset.color} strokeWidth="2" />
                          <title>{`${label}: ${value.toLocaleString('en-IN')} ${chart.unit || ''} — click to filter`}</title>
                        </g>
                      ) : null;
                    })}
                  </g>
                );
              })}
              {labels.map((label, index) => {
                const interval = Math.max(1, Math.ceil(labels.length / 8));
                if (index !== 0 && index !== labels.length - 1 && index % interval !== 0) return null;
                return <text key={label} x={x(index)} y={height - 10} textAnchor="middle" className="periodic-chart-axis">{label}</text>;
              })}
            </svg>
          ) : (
            <div className="periodic-flow-empty">No flow data for selected filters.</div>
          )}
          {tooltip && (
            <div className="periodic-chart-tooltip" style={{ left: tooltip.left, top: tooltip.top }}>
              <span><i style={{ background: tooltip.color }} />{tooltip.dataset}</span>
              <strong>{tooltip.label}</strong>
              <b>{tooltip.value.toLocaleString('en-IN', { maximumFractionDigits: 2 })} {chart.unit || ''}</b>
              <small>Click point to filter</small>
            </div>
          )}
        </div>

        <aside className="periodic-flow-summary">
          <div className="periodic-flow-summary-title">Summary</div>
          <div className={`periodic-flow-summary-list periodic-summary-groups-${Math.min(summaryGroups.length, 4)}`}>
            {summaryGroups.length ? summaryGroups.map(group => (
              <div className="periodic-flow-summary-group" key={group.title}>
                <div className="periodic-flow-group-title">{group.title}</div>
                <div className="periodic-flow-group-list">
                  {group.items.map((item, index) => (
                    <div className="periodic-flow-summary-item" key={`${item.label}-${index}`}>
                      <span>{String(item.label || 'N/A').trim()}</span>
                      <strong>{Number(item.value || 0).toLocaleString('en-IN', { maximumFractionDigits: Number(item.value || 0) >= 10 ? 0 : 1 })} {item.unit || chart.unit || ''}</strong>
                      {item.extra && <small>{item.extra}</small>}
                    </div>
                  ))}
                </div>
              </div>
            )) : <div className="periodic-flow-empty">No summary data.</div>}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default function ReportViewer({ reportId, activeRoute }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);

  // Local filters state
  const [selectedFy, setSelectedFy] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  
  // Custom Filters for Periodic/Batch Summary
  const [dateFilterType, setDateFilterType] = useState('today');
  const [prodType, setProdType] = useState('RMP');
  const [selectedBatch, setSelectedBatch] = useState('');
  const [selectedCompany, setSelectedCompany] = useState('');
  const [selectedProductionAt, setSelectedProductionAt] = useState('');
  
  // Storage Cost Filters
  const [freezer, setFreezer] = useState('');
  const [coldStorageName, setColdStorageName] = useState('');

  // Editing state for transactional reports (e.g. Gate Entry)
  const [editRowId, setEditRowId] = useState(null);
  const [editData, setEditData] = useState({});

  // Active tabs for compound dashboards
  const [activeTab, setActiveTab] = useState('summary');

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (reportId === 'report_periodic_summary') setActiveTab('closing_floor_balance');
    else if (reportId === 'report_batch_summary') setActiveTab('grading_summary');
  }, [reportId]);

  // Unified metadata configurations for standard reports
  const reportConfigs = {
    report_gate_entry_report: {
      title: 'Gate Entry Registry Report',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Time', key: 'time', align: 'center' },
        { label: 'Batch No', key: 'batch_number', align: 'center', bold: true },
        { label: 'Supplier', key: 'supplier_name', align: 'left', editable: true },
        { label: 'Purchasing Loc', key: 'purchasing_location', align: 'left', editable: true },
        { label: 'Receiving Center', key: 'receiving_center', align: 'left', editable: true },
        { label: 'Vehicle No', key: 'vehicle_number', align: 'left', editable: true },
        { label: 'Driver', key: 'driver_name', align: 'left', editable: true },
        { label: 'Boxes', key: 'no_of_material_boxes', align: 'right', format: 'number', editable: true },
        { label: 'Empty Boxes', key: 'no_of_empty_boxes', align: 'right', format: 'number', editable: true },
        { label: 'Ice Boxes', key: 'no_of_ice_boxes', align: 'right', format: 'number', editable: true },
        { label: 'Production For', key: 'production_for', align: 'left' },
        { label: 'User', key: 'email', align: 'left' }
      ],
      filters: ['fy', 'supplier', 'factory'],
      canEdit: true,
      updateEndpoint: '/reports/gate_entry/update',
      deleteEndpoint: '/reports/gate_entry/delete'
    },
    report_rmp_report: {
      title: 'Raw Material Purchase Summary',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Time', key: 'time', align: 'center' },
        { label: 'Batch No', key: 'batch_number', align: 'center', bold: true },
        { label: 'Supplier', key: 'supplier_name', align: 'left' },
        { label: 'Purchasing Loc', key: 'purchasing_location', align: 'left' },
        { label: 'Peeling At', key: 'peeling_at', align: 'left' },
        { label: 'Production For', key: 'production_for', align: 'left' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Variety', key: 'variety_name', align: 'left' },
        { label: 'Count', key: 'count', align: 'center' },
        { label: 'Received Qty (Kg)', key: 'received_qty', align: 'right', format: 'number' },
        { label: 'Rate (₹)', key: 'rate', align: 'right', format: 'currency' },
        { label: 'Amount (₹)', key: 'amount', align: 'right', format: 'currency' },
        { label: 'Rate Type', key: 'rate_type', align: 'center' },
        { label: 'Final Costing', key: 'final_costing', align: 'center' }
      ],
      filters: ['fy']
    },
    report_de_heading_report: {
      title: 'De-Heading Production Wages Ledger',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Time', key: 'time', align: 'center' },
        { label: 'Batch No', key: 'batch_number', align: 'center', bold: true },
        { label: 'Contractor', key: 'contractor', align: 'left' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'HOSO Count', key: 'hoso_count', align: 'center' },
        { label: 'HOSO Qty (Kg)', key: 'hoso_qty', align: 'right', format: 'number' },
        { label: 'HLSO Qty (Kg)', key: 'hlso_qty', align: 'right', format: 'number' },
        { label: 'Yield %', key: 'yield_percent', align: 'right', format: 'percentage' },
        { label: 'Target Yield %', key: 'target_yield_percent', align: 'right', format: 'percentage' },
        { label: 'Diff Qty (Kg)', key: 'diff_qty', align: 'right', format: 'number' },
        { label: 'Diff %', key: 'diff_percent', align: 'right', format: 'percentage' },
        { label: 'Rate/Kg (₹)', key: 'rate_per_kg', align: 'right', format: 'currency' },
        { label: 'Amount (₹)', key: 'amount', align: 'right', format: 'currency' },
        { label: 'Peeling At', key: 'peeling_at', align: 'left' },
        { label: 'Production For', key: 'production_for', align: 'left' }
      ],
      filters: ['fy']
    },
    report_grading_report: {
      title: 'Grading Count Yields Report',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Time', key: 'time', align: 'center' },
        { label: 'Batch No', key: 'batch_number', align: 'center', bold: true },
        { label: 'Peeling At', key: 'peeling_at', align: 'left' },
        { label: 'Production For', key: 'production_for', align: 'left' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Variety', key: 'variety_name', align: 'left' },
        { label: 'HOSO Count', key: 'hoso_count', align: 'center' },
        { label: 'Graded Count', key: 'graded_count', align: 'center' },
        { label: 'Quantity (Kg)', key: 'quantity', align: 'right', format: 'number' }
      ],
      filters: ['fy']
    },
    report_peeling_report: {
      title: 'Peeling Production Ledger',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Time', key: 'time', align: 'center' },
        { label: 'Batch No', key: 'batch_number', align: 'center', bold: true },
        { label: 'Contractor', key: 'contractor', align: 'left' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Variety', key: 'variety', align: 'left' },
        { label: 'HLSO Count', key: 'hlso_count', align: 'center' },
        { label: 'HLSO Qty (Kg)', key: 'hlso_qty', align: 'right', format: 'number' },
        { label: 'Peeled Qty (Kg)', key: 'peeled_qty', align: 'right', format: 'number' },
        { label: 'Yield %', key: 'yield_percent', align: 'right', format: 'percentage' },
        { label: 'Target Yield %', key: 'target_yield_percent', align: 'right', format: 'percentage' },
        { label: 'Diff Qty (Kg)', key: 'diff_qty', align: 'right', format: 'number' },
        { label: 'Diff %', key: 'diff_percent', align: 'right', format: 'percentage' },
        { label: 'Rate/Kg (₹)', key: 'rate_per_kg', align: 'right', format: 'currency' },
        { label: 'Amount (₹)', key: 'amount', align: 'right', format: 'currency' },
        { label: 'Peeling At', key: 'peeling_at', align: 'left' },
        { label: 'Production For', key: 'production_for', align: 'left' }
      ],
      filters: ['fy']
    },
    report_soaking_report: {
      title: 'Chemical Soaking Treatment Logs',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Time', key: 'time', align: 'center' },
        { label: 'Batch No', key: 'batch_number', align: 'center', bold: true },
        { label: 'Production At', key: 'production_at', align: 'left' },
        { label: 'Production For', key: 'production_for', align: 'left' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Variety', key: 'variety_name', align: 'left' },
        { label: 'In Count', key: 'in_count', align: 'center' },
        { label: 'In Qty (Kg)', key: 'in_qty', align: 'right', format: 'number' },
        { label: 'Chemical', key: 'chemical_name', align: 'left' },
        { label: 'Chem %', key: 'chemical_percent', align: 'right', format: 'percentage' },
        { label: 'Chem Qty (Kg)', key: 'chemical_qty', align: 'right', format: 'number' },
        { label: 'Salt Qty (Kg)', key: 'salt_qty', align: 'right', format: 'number' },
        { label: 'Out Qty (Kg)', key: 'out_qty', align: 'right', format: 'number' },
        { label: 'Gain %', key: 'gain_percent', align: 'right', format: 'percentage' }
      ],
      filters: ['fy']
    },
    report_production_report: {
      title: 'Finished Goods Production Summary',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Time', key: 'time', align: 'center' },
        { label: 'Batch No', key: 'batch_number', align: 'center', bold: true },
        { label: 'Brand', key: 'brand_name', align: 'left' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Variety', key: 'variety_name', align: 'left' },
        { label: 'Grade', key: 'grade', align: 'center' },
        { label: 'Glaze', key: 'glaze', align: 'center' },
        { label: 'Freezer', key: 'freezer', align: 'left' },
        { label: 'Packing Style', key: 'packing_style', align: 'left' },
        { label: 'MC Slabs', key: 'no_of_mc', align: 'right' },
        { label: 'Loose Slabs', key: 'loose', align: 'right' },
        { label: 'Net Weight (Kg)', key: 'production_qty', align: 'right', format: 'number' },
        { label: 'Production At', key: 'production_at', align: 'left' },
        { label: 'Production For', key: 'production_for', align: 'left' }
      ],
      filters: ['fy']
    },
    report_reprocess_report: {
      title: 'Re-Process Registry Report',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Time', key: 'time', align: 'center' },
        { label: 'Original Batch', key: 'original_batch', align: 'center' },
        { label: 'New Batch', key: 'new_batch_id', align: 'center', bold: true },
        { label: 'Reprocess Type', key: 'reprocess_type', align: 'center' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Variety', key: 'variety', align: 'left' },
        { label: 'Grade', key: 'grade', align: 'center' },
        { label: 'Out Qty (Kg)', key: 'out_qty', align: 'right', format: 'number' },
        { label: 'Glaze', key: 'glaze', align: 'center' },
        { label: 'Freezer', key: 'freezer', align: 'left' },
        { label: 'Packing Style', key: 'packing_style', align: 'left' },
        { label: 'In Qty (Kg)', key: 'in_qty', align: 'right', format: 'number' },
        { label: 'Product Kg Value', key: 'product_kg_value', align: 'right', format: 'currency' },
        { label: 'Inventory Value', key: 'inventory_value', align: 'right', format: 'currency' },
        { label: 'Production At', key: 'production_at', align: 'left' },
        { label: 'Production For', key: 'production_for', align: 'left' }
      ],
      filters: ['fy']
    },
    report_floor_balance_report: {
      title: 'Plant Floor WIP Stock Balance Report',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Batch No', key: 'batch', align: 'center', bold: true },
        { label: 'Location', key: 'location', align: 'left' },
        { label: 'Production For', key: 'production_for', align: 'left' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Variety', key: 'variety', align: 'left' },
        { label: 'Count', key: 'count', align: 'center' },
        { label: 'Available Qty (Kg)', key: 'available_qty', align: 'right', format: 'number' },
        { label: 'Source', key: 'source', align: 'center' }
      ],
      filters: []
    },
    report_inventory_report: {
      title: 'Cold Storage Stock Status Report',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Batch No', key: 'batch_number', align: 'center', bold: true },
        { label: 'Location', key: 'location', align: 'left' },
        { label: 'Production For', key: 'production_for', align: 'left' },
        { label: 'Brand', key: 'brand', align: 'left' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Variety', key: 'variety', align: 'left' },
        { label: 'Grade', key: 'grade', align: 'center' },
        { label: 'Glaze', key: 'glaze', align: 'center' },
        { label: 'Freezer', key: 'freezer', align: 'left' },
        { label: 'Packing Style', key: 'packing_style', align: 'left' },
        { label: 'No of MC', key: 'no_of_mc', align: 'right' },
        { label: 'Loose', key: 'loose', align: 'right' },
        { label: 'Quantity (Kg)', key: 'quantity', align: 'right', format: 'number' },
        { label: 'Cargo Type', key: 'cargo_movement_type', align: 'center' }
      ],
      filters: ['date_range']
    },
    report_pending_orders_report: {
      title: 'Sales Pending Orders Backlog Report',
      columns: [
        { label: 'Order Date', key: 'order_date', align: 'center' },
        { label: 'Order No', key: 'order_number', align: 'center', bold: true },
        { label: 'Buyer', key: 'buyer_name', align: 'left' },
        { label: 'Buyer Agent', key: 'buyer_agent_name', align: 'left' },
        { label: 'Brand', key: 'brand', align: 'left' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Variety', key: 'variety', align: 'left' },
        { label: 'Grade', key: 'grade', align: 'center' },
        { label: 'Glaze', key: 'glaze', align: 'center' },
        { label: 'Freezer', key: 'freezer', align: 'left' },
        { label: 'Packing Style', key: 'packing_style', align: 'left' },
        { label: 'Ordered MC', key: 'ordered_mc', align: 'right' },
        { label: 'Shipped MC', key: 'shipped_mc', align: 'right' },
        { label: 'Pending MC', key: 'pending_mc', align: 'right' },
        { label: 'Ordered Qty (Kg)', key: 'ordered_qty', align: 'right', format: 'number' },
        { label: 'Shipped Qty (Kg)', key: 'shipped_qty', align: 'right', format: 'number' },
        { label: 'Pending Qty (Kg)', key: 'pending_qty', align: 'right', format: 'number' }
      ],
      filters: ['date_range']
    },
    report_sales_report: {
      title: 'Sales & Invoicing Ledger Report',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Invoice No', key: 'invoice_number', align: 'center', bold: true },
        { label: 'Container No', key: 'container_number', align: 'left' },
        { label: 'Buyer', key: 'buyer', align: 'left' },
        { label: 'Buyer Agent', key: 'buyer_agent', align: 'left' },
        { label: 'Batch No', key: 'batch_number', align: 'center' },
        { label: 'Brand', key: 'brand', align: 'left' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Variety', key: 'variety', align: 'left' },
        { label: 'Grade', key: 'grade', align: 'center' },
        { label: 'Glaze', key: 'glaze', align: 'center' },
        { label: 'Freezer', key: 'freezer', align: 'left' },
        { label: 'Packing Style', key: 'packing_style', align: 'left' },
        { label: 'No of MC', key: 'no_of_mc', align: 'right' },
        { label: 'Loose Slabs', key: 'loose', align: 'right' },
        { label: 'Quantity (Kg)', key: 'quantity', align: 'right', format: 'number' },
        { label: 'Rate', key: 'rate', align: 'right', format: 'currency' },
        { label: 'Amount', key: 'amount', align: 'right', format: 'currency' }
      ],
      filters: ['date_range']
    },
    report_gs_report: {
      title: 'General Store Stock Movement Ledger',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Item Name', key: 'item_name', align: 'left' },
        { label: 'Category', key: 'category', align: 'left' },
        { label: 'Supplier/Vendor', key: 'supplier_vendor', align: 'left' },
        { label: 'Reference No', key: 'reference_no', align: 'left' },
        { label: 'Movement', key: 'movement_type', align: 'center' },
        { label: 'Quantity', key: 'quantity', align: 'right', format: 'number' },
        { label: 'Rate (₹)', key: 'rate', align: 'right', format: 'currency' },
        { label: 'Amount (₹)', key: 'amount', align: 'right', format: 'currency' },
        { label: 'Department', key: 'department', align: 'left' },
        { label: 'Purpose', key: 'purpose', align: 'left' },
        { label: 'Email', key: 'email', align: 'left' }
      ],
      filters: ['date_range']
    },
    report_cold_storage_holding_report: {
      title: 'Cold Storage Holding Inventory Report',
      columns: [
        { label: 'Location', key: 'location', align: 'left' },
        { label: 'Production For', key: 'production_for', align: 'left' },
        { label: 'Brand', key: 'brand', align: 'left' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Variety', key: 'variety', align: 'left' },
        { label: 'Grade', key: 'grade', align: 'center' },
        { label: 'Glaze', key: 'glaze', align: 'center' },
        { label: 'Freezer', key: 'freezer', align: 'left' },
        { label: 'Packing Style', key: 'packing_style', align: 'left' },
        { label: 'No of MC', key: 'no_of_mc', align: 'right' },
        { label: 'Loose', key: 'loose', align: 'right' },
        { label: 'Quantity (Kg)', key: 'quantity', align: 'right', format: 'number' },
        { label: 'Type of Production', key: 'type_of_production', align: 'center' }
      ],
      filters: []
    },
    report_floor_balance_value: {
      title: 'Plant WIP Floor Stock Balances Value',
      columns: [
        { label: 'Batch No', key: 'batch', align: 'center', bold: true },
        { label: 'Variety', key: 'variety', align: 'left' },
        { label: 'Count', key: 'count', align: 'center' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Production For', key: 'production_for', align: 'left' },
        { label: 'Location', key: 'location', align: 'left' },
        { label: 'Available Qty (Kg)', key: 'available_qty', align: 'right', format: 'number' },
        { label: 'Value (₹)', key: 'value', align: 'right', format: 'currency' },
        { label: 'Source', key: 'source', align: 'center' }
      ],
      filters: []
    },
    report_inventory_costing: {
      title: 'Inventory Costing & Valuation Report',
      columns: [
        { label: 'Date', key: 'date', align: 'center' },
        { label: 'Batch No', key: 'batch_number', align: 'center', bold: true },
        { label: 'Location', key: 'location', align: 'left' },
        { label: 'Production For', key: 'production_for', align: 'left' },
        { label: 'Brand', key: 'brand', align: 'left' },
        { label: 'Species', key: 'species', align: 'left' },
        { label: 'Variety', key: 'variety', align: 'left' },
        { label: 'Grade', key: 'grade', align: 'center' },
        { label: 'Glaze', key: 'glaze', align: 'center' },
        { label: 'Freezer', key: 'freezer', align: 'left' },
        { label: 'Packing Style', key: 'packing_style', align: 'left' },
        { label: 'Quantity (Kg)', key: 'quantity', align: 'right', format: 'number' },
        { label: 'Kg Value', key: 'product_kg_value', align: 'right', format: 'currency' },
        { label: 'Inventory Value', key: 'inventory_value', align: 'right', format: 'currency' }
      ],
      filters: ['fy', 'date_range']
    }
  };

  const activeConfig = reportConfigs[reportId];

  // Fetch report data
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!activeRoute) throw new Error('Report route is not configured. Please reopen this report from the menu.');
      const activeComp = localStorage.getItem('production_for_filter') || '';
      const activeLoc = localStorage.getItem('plant_location_filter') || '';

      const queryParams = new URLSearchParams({ format: 'json' });
      
      // Inject global headers
      if (activeComp) queryParams.append('production_for', activeComp);
      if (activeLoc) queryParams.append('location', activeLoc);

      // Inject local filters based on config / reportId
      if (reportId === 'report_storage_cost_report') {
        if (selectedMonth) queryParams.append('selected_month', selectedMonth);
        if (freezer) queryParams.append('freezer', freezer);
        if (coldStorageName) queryParams.append('cold_storage_name', coldStorageName);
      } else if (reportId === 'report_periodic_summary') {
        if (selectedFy) queryParams.append('fy', selectedFy);
        queryParams.append('date_filter_type', dateFilterType);
        if (selectedMonth) queryParams.append('selected_month', selectedMonth);
        if (fromDate) queryParams.append('start_date', fromDate);
        if (toDate) queryParams.append('end_date', toDate);
        if (prodType) queryParams.append('prod_type', prodType);
        if (selectedBatch) queryParams.append('batch', selectedBatch);
        if (selectedCompany || activeComp) queryParams.set('production_for', selectedCompany || activeComp);
        if (selectedProductionAt || activeLoc) queryParams.set('production_at', selectedProductionAt || activeLoc);
        queryParams.delete('location');
      } else if (reportId === 'report_batch_summary') {
        if (selectedFy) queryParams.append('fy', selectedFy);
        if (prodType) queryParams.append('prod_type', prodType);
        if (selectedBatch) queryParams.append('batch', selectedBatch);
        if (selectedCompany || activeComp) queryParams.set('production_for', selectedCompany || activeComp);
      } else {
        // Standard filters
        if (selectedFy) queryParams.append('fy', selectedFy);
        if (fromDate) queryParams.append('from_date', fromDate);
        if (toDate) queryParams.append('to_date', toDate);
      }

      const res = await fetch(`${activeRoute}?${queryParams.toString()}`, {
        credentials: 'include',
        redirect: 'follow',
        headers: { Accept: 'application/json' },
      });

      // Detect redirect to login page (session expired)
      if (res.redirected || res.url.includes('/auth/login') || res.url.includes('/login')) {
        throw new Error('Session expired. Please log in again.');
      }

      // Ensure we received JSON and not an HTML login page
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        if (res.status === 500) throw new Error('Server error (500). The report backend may have crashed. Please retry or contact support.');
        if (res.status === 403) throw new Error('Access denied (403). You do not have permission to view this report.');
        if (!contentType.includes('application/json')) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        let errJson = null;
        try { errJson = await res.json(); } catch { /* response had no JSON error body */ }
        throw new Error(errJson?.detail || errJson?.message || `HTTP ${res.status}: ${res.statusText}`);
      }
      if (!contentType.includes('application/json')) {
        throw new Error('Report server returned HTML instead of JSON. Try refreshing or re-logging in.');
      }

      const resData = await res.json();
      // Accept any valid JSON object — each report knows its own response shape
      if (resData !== null && typeof resData === 'object' && !Array.isArray(resData)) {
        setData(resData);
      } else if (Array.isArray(resData)) {
        setData({ rows: resData });
      } else {
        throw new Error('Server returned an unexpected response');
      }
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();

    // Listen to universal header filter changes
    const handleGlobalFilterChange = () => {
      fetchData();
    };
    window.addEventListener('filter_change', handleGlobalFilterChange);
    return () => window.removeEventListener('filter_change', handleGlobalFilterChange);
  }, [reportId, activeRoute, selectedFy, fromDate, toDate, selectedMonth, dateFilterType, prodType, selectedBatch, selectedCompany, selectedProductionAt, freezer, coldStorageName]);

  const handlePrint = () => {
    window.print();
  };

  const handleExport = (type) => {
    if (reportId === 'report_periodic_summary' || reportId === 'report_batch_summary') {
      const table = document.querySelector('.periodic-table-card table, .batch-table-card table, .batch-reconciliation-card table, .report-viewer-card .card table');
      if (!table) {
        alert('No active report table is available to export.');
        return;
      }
      const csv = [...table.rows].map(row => [...row.cells].map(cell => {
        const value = cell.innerText.replace(/\s+/g, ' ').trim().replace(/"/g, '""');
        return `"${value}"`;
      }).join(',')).join('\n');
      const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${reportId === 'report_periodic_summary' ? 'periodic-summary' : 'batch-summary'}-${activeTab}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      return;
    }

    const activeComp = localStorage.getItem('production_for_filter') || '';
    const activeLoc = localStorage.getItem('plant_location_filter') || '';

    let exportUrl = new URL(`${activeRoute}/export_${type}`, window.location.origin);
    exportUrl.searchParams.set('fy', selectedFy);
    if (activeComp) exportUrl.searchParams.set('production_for', activeComp);
    if (activeLoc) exportUrl.searchParams.set('location', activeLoc);
    if (fromDate) exportUrl.searchParams.set('from_date', fromDate);
    if (toDate) exportUrl.searchParams.set('to_date', toDate);
    if (selectedMonth) exportUrl.searchParams.set('selected_month', selectedMonth);

    window.location.href = exportUrl.toString();
  };

  // Inline transaction edits (e.g. for Gate Entry)
  const startEdit = (row) => {
    setEditRowId(row.id);
    setEditData(row);
  };

  const saveEdit = async () => {
    if (!activeConfig || !activeConfig.updateEndpoint) return;
    setLoading(true);
    try {
      const res = await fetch(activeConfig.updateEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData)
      });
      if (res.ok) {
        setEditRowId(null);
        fetchData();
      } else {
        alert('Failed to update record.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const deleteRow = async (id) => {
    if (!activeConfig || !activeConfig.deleteEndpoint) return;
    if (!confirm('Cancel this record?')) return;
    setLoading(true);
    try {
      const res = await fetch(activeConfig.deleteEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      if (res.ok) {
        fetchData();
      } else {
        alert('Failed to cancel record.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Get raw list rows from payload
  const getRowsList = () => {
    if (!data) return [];
    if (data.rows && Array.isArray(data.rows)) return data.rows;
    if (data.rows_batch && Array.isArray(data.rows_batch)) return data.rows_batch;
    return [];
  };

  const rows = getRowsList();

  // Keyword filter search
  const filteredRows = rows.filter(row => {
    if (!searchQuery) return true;
    return Object.values(row).some(val => 
      String(val || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  // Value formatting helper
  const formatVal = (val, format) => {
    if (val === null || val === undefined) return '';
    if (format === 'currency') {
      return Number(val).toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
    }
    if (format === 'percentage') {
      return `${Number(val).toFixed(2)} %`;
    }
    if (format === 'number') {
      return Number(val).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return String(val);
  };

  // RENDER: COMPOUND DASHBOARDS (Periodic Summary, Batch Summary, Storage Cost)
  
  // 1. BATCH SUMMARY TEMPLATE (report_batch_summary)
  if (reportId === 'report_batch_summary') {
    const card = data?.card || {};
    const qty = value => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const money = value => Number(value || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 });
    const grossProduction = (data?.rows?.production || []).reduce((total, row) => {
      const netQty = Number(row.production_qty || 0);
      const glazeText = String(row.glaze || '').trim().toUpperCase();
      const match = glazeText.includes('NWNC') ? null : glazeText.match(/^(\d+(?:\.\d+)?)%$/);
      const glazePct = match ? Number(match[1]) : 0;
      return total + (glazePct > 0 && glazePct < 100 ? netQty / ((100 - glazePct) / 100) : netQty);
    }, 0);
    const sections = [
      { id: 'grading_summary', title: 'Grading Summary' },
      ...(prodType === 'RMP'
        ? [{ id: 'gate', title: '1. Gate Entry' }, { id: 'rmp', title: '2. Raw Material Purchasing' }]
        : [{ id: 'reprocess', title: '1. Re-Processing Input' }]),
      { id: 'deheading', title: '3. De-Heading Process' },
      { id: 'grading_details', title: '4.1 Grading Breakdown Details' },
      { id: 'peeling', title: '5. Peeling Process' },
      { id: 'soaking', title: '6. Soaking Process' },
      { id: 'production', title: '7. Production Packing' },
      { id: 'stock', title: '8. Stock Inventory Log' },
      { id: 'hoso_floor_balance', title: '9. Floor Balance', danger: true },
    ];

    return (
      <div className="report-viewer-card batch-summary-report">
        {renderHeader('Batch Wise Analysis')}
        {renderBatchSummaryFilters()}
        
        {loading && renderLoader()}
        {error && renderError()}
        
        {data && !selectedBatch && !loading && (
          <div className="batch-summary-empty">
            Financial year, production company and batch number select chesi Batch Summary view cheyyandi.
          </div>
        )}

        {data && selectedBatch && (
          <div className="batch-summary-content">
            <div className="batch-section-title batch-section-title-first">Batch Matrix Metrics</div>
            <div className="batch-matrix-grid">
              <Metric label="Batch Number" value={selectedBatch} accent />
              <Metric label="Supplier | Location" value={`${card.supplier_name || 'N/A'} | ${card.purchasing_location || 'N/A'}`} />
              <Metric label="Receiving At | Vehicle" value={`${card.receiving_center || 'N/A'} | ${card.vehicle_number || 'N/A'}`} />
              <Metric label="Boxes | Challan | Gatepass" value={`${card.total_boxes || 0} Box | ${card.challan_number || 'N/A'} | ${card.gate_pass_number || 'N/A'}`} />
              <Metric label="RM Total Qty / Amount" value={`${qty(card.rmp_qty)} KG | ${money(card.rmp_amount)}`} success />
              <Metric label="De-Heading Qty / Amount" value={`${qty(card.deheading_qty)} KG | ${money(card.deheading_amount)}`} />
              <Metric label="Grading | Peeling Qty / Amount" value={`${qty(card.grading_qty)} K | ${qty(card.peeling_qty)} K | ${money(card.peeling_amount)}`} />
              <Metric label="Soaking | Chem | Salt" value={`${qty(card.soaking_qty)} KG | C: ${qty(card.chemical_qty)} | S: ${qty(card.salt_qty)}`} />
              <Metric label="Gross Prod | Net Prod | Stock Qty" value={`${qty(grossProduction)} G | ${qty(card.production_qty)} N | ${qty(card.stock_qty)} S`} purple />
              <Metric label="Stock Inventory Value" value={money(card.stock_amount)} success />
              <Metric label="Floor Balance Qty | Value" value={`${qty(card.floor_qty)} KG | ${money(card.floor_amount)}`} danger />
            </div>

            <div className="batch-reconciliation-card">
              <div className="batch-reconciliation-title">Reconciliation Summary</div>
              {renderSummaryTabTable('reconciliation', { compact: true })}
            </div>

            {sections.map(section => (
              <section className="batch-process-section" key={section.id}>
                <div className={`batch-section-title${section.danger ? ' batch-section-danger' : ''}`}>{section.title}</div>
                {section.id === 'grading_summary' ? (
                  <GradingSummaryCards
                    rows={data.rows?.grading_summary || []}
                    details={data.rows?.grading_details || []}
                    selectedBatch={selectedBatch}
                  />
                ) : (
                  <div className="batch-table-card">
                    {renderSummaryTabTable(section.id, { compact: true })}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 2. PERIODIC SUMMARY TEMPLATE (report_periodic_summary)
  if (reportId === 'report_periodic_summary') {
    const card = data?.card || {};
    const quantity = value => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const currency = value => Number(value || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
    const periodicSections = [
      { id: 'closing_floor_balance', chartKey: 'sec-close-floor', label: 'Closing Floor Balance', icon: 'fa-balance-scale' },
      { id: 'opening_floor_balance', chartKey: 'sec-open-floor', label: 'Opening Floor Balance', icon: 'fa-hourglass-start' },
      { id: 'gate', chartKey: 'sec-gate', label: 'Gate Entry', icon: 'fa-door-open' },
      ...(prodType === 'RMP'
        ? [{ id: 'rmp', chartKey: 'sec-rmp', label: 'Raw Material Purchasing', icon: 'fa-cart-shopping' }]
        : [{ id: 'reprocess', chartKey: 'sec-rep', label: 'Reprocess', icon: 'fa-recycle' }]),
      { id: 'rmp_variety_summary', chartKey: 'sec-rmp-sum1', label: 'RM Variety Summary', icon: 'fa-chart-line' },
      { id: 'supplier_summary', chartKey: 'sec-rmp-sum2', label: 'Supplier Summary', icon: 'fa-users' },
      { id: 'reconciliation', chartKey: 'sec-recon', label: 'Reconciliation', icon: 'fa-compress' },
      { id: 'grading_summary', chartKey: 'sec-grading-cards-wrapper', label: 'Grading Card View', icon: 'fa-layer-group' },
      { id: 'deheading', chartKey: 'sec-deh', label: 'Deheading', icon: 'fa-scissors' },
      { id: 'grading_details', chartKey: 'sec-grd', label: 'Grading Output', icon: 'fa-layer-group' },
      { id: 'peeling', chartKey: 'sec-pel', label: 'Peeling', icon: 'fa-hands' },
      { id: 'soaking', chartKey: 'sec-soak', label: 'Soaking', icon: 'fa-water' },
      { id: 'production', chartKey: 'sec-prod', label: 'Production Packing', icon: 'fa-box-open' },
      { id: 'stock_in', chartKey: 'sec-stk', label: 'Stock IN', icon: 'fa-warehouse' },
      { id: 'stock_out', chartKey: 'sec-stk-out', label: 'Stock OUT', icon: 'fa-truck-ramp-box' },
    ];
    const currentSection = periodicSections.find(section => section.id === activeTab) || periodicSections[0];
    const sourceRows = activeTab === 'opening_floor_balance'
      ? (data?.opening_floor_balance || [])
      : activeTab === 'closing_floor_balance'
        ? (data?.closing_floor_balance || [])
        : activeTab === 'stock_in'
          ? (data?.rows?.stock || []).filter(row => String(row.cargo_movement_type || '').toUpperCase() === 'IN')
          : activeTab === 'stock_out'
            ? (data?.rows?.stock || []).filter(row => String(row.cargo_movement_type || '').toUpperCase() === 'OUT')
            : (data?.rows?.[activeTab] || []);

    return (
      <div className="report-viewer-card periodic-summary-report">
        {renderHeader('Periodic Activity Summary')}

        {loading && renderLoader()}
        {error && renderError()}

        {data && (
          <div className="periodic-summary-content">
            <div className="periodic-kpi-grid no-print">
              <PeriodicKpi label="Opening Floor Bal" primary={`${quantity(card.floor_opening_qty)} KG`} secondary={currency(card.floor_opening_val)} icon="fa-hourglass-start" onClick={() => setActiveTab('opening_floor_balance')} />
              <PeriodicKpi label="Gate Boxes" primary={quantity(card.gate_boxes)} secondary="Boxes Received" icon="fa-door-open" onClick={() => setActiveTab('gate')} />
              {prodType === 'RMP' ? (
                <PeriodicKpi label="RM Purchasing" primary={`${quantity(card.rmp_qty)} KG`} secondary={currency(card.rmp_amount)} icon="fa-cart-shopping" onClick={() => setActiveTab('rmp')} />
              ) : (
                <PeriodicKpi label="Reprocess" primary={`${quantity(card.rep_in)} KG`} secondary={`Out: ${quantity(card.rep_out)} KG`} icon="fa-recycle" onClick={() => setActiveTab('reprocess')} />
              )}
              <PeriodicKpi label="Deheading" primary={`${quantity(card.deh_hoso)} KG`} secondary={`HLSO: ${quantity(card.deh_hlso)} KG`} icon="fa-scissors" onClick={() => setActiveTab('deheading')} />
              <PeriodicKpi label="Grading Output" primary={`${quantity(card.grd_qty)} KG`} secondary="Graded Qty" icon="fa-layer-group" onClick={() => setActiveTab('grading_details')} />
              <PeriodicKpi label="Peeling Input" primary={`${quantity(card.pel_hlso)} KG`} secondary={`Peeled: ${quantity(card.pel_peeled)} KG`} icon="fa-hands" onClick={() => setActiveTab('peeling')} />
              <PeriodicKpi label="Soaking Input" primary={`${quantity(card.soaking_qty)} KG`} secondary={`Chem ${quantity(card.chemical_qty)} | Salt ${quantity(card.salt_qty)}`} icon="fa-water" onClick={() => setActiveTab('soaking')} />
              <PeriodicKpi label="Net Production" primary={`${quantity(card.production_qty)} KG`} secondary="Packed Output" icon="fa-box-open" onClick={() => setActiveTab('production')} />
              <PeriodicKpi label="Stock Vault Asset" primary={`${quantity(card.stock_qty)} KG`} secondary={`Out: ${quantity(card.stock_out_qty)} KG`} icon="fa-warehouse" onClick={() => setActiveTab('stock_in')} />
              <PeriodicKpi label="Closing Floor Bal" primary={`${quantity(card.floor_closing_qty)} KG`} secondary={currency(card.floor_closing_val)} icon="fa-balance-scale" onClick={() => setActiveTab('closing_floor_balance')} />
            </div>

            {renderPeriodicFilters()}

            <div className="periodic-row-count no-print">
              {sourceRows.length.toLocaleString('en-IN')} operational lines found
            </div>

            <div className="periodic-workspace-react">
              <aside className="periodic-section-menu no-print">
                <div className="periodic-menu-title">Periodic Sections</div>
                {periodicSections.map(section => (
                  <button
                    type="button"
                    key={section.id}
                    className={activeTab === section.id ? 'is-active' : ''}
                    onClick={() => { setActiveTab(section.id); setSearchQuery(''); }}
                  >
                    <i className={`fa-solid ${section.icon}`} />
                    <span>{section.label}</span>
                  </button>
                ))}
              </aside>

              <main className="periodic-section-content">
                <div className="periodic-section-heading">
                  <span><i className={`fa-solid ${currentSection.icon}`} /> {currentSection.label}</span>
                </div>
                <PeriodicFlowPanel
                  chart={data.flow_charts?.[currentSection.chartKey]}
                  sectionKey={currentSection.chartKey}
                  onPointClick={(chartMode, label) => {
                    if (chartMode === 'month') {
                      setDateFilterType('month');
                      setSelectedMonth(label);
                      setFromDate('');
                      setToDate('');
                    } else {
                      setDateFilterType('between');
                      setFromDate(label);
                      setToDate(label);
                      setSelectedMonth('');
                    }
                  }}
                />
                {activeTab === 'grading_summary' ? (
                  <GradingSummaryCards rows={data.rows?.grading_summary || []} details={data.rows?.grading_details || []} selectedBatch={selectedBatch} />
                ) : (
                  <div className="periodic-table-card">
                    {renderSummaryTabTable(activeTab, { compact: true })}
                  </div>
                )}
              </main>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 3. STORAGE & COST REPORT TEMPLATE (report_storage_cost_report)
  if (reportId === 'report_storage_cost_report') {
    return (
      <div className="report-viewer-card">
        {renderHeader('Storage & Cost FIFO Report')}
        {renderStorageCostFilters()}

        {loading && renderLoader()}
        {error && renderError()}

        {data && (
          <div style={{ marginTop: '20px' }}>
            {/* Grand Totals */}
            <div style={kpiGridStyle}>
              <div style={{ ...kpiCardStyle, borderLeft: '4px solid var(--corp-dash)' }}>
                <span style={kpiTitleStyle}>Total Opening MC</span>
                <span style={kpiValueStyle}>{data.total_opening_mc || '0'}</span>
              </div>
              <div style={{ ...kpiCardStyle, borderLeft: '4px solid var(--corp-ops)' }}>
                <span style={kpiTitleStyle}>Rent / Handling Charges</span>
                <span style={kpiValueStyle}>₹ {data.total_storage_rent?.toLocaleString('en-IN') || '0'} / ₹ {data.total_charges?.toLocaleString('en-IN') || '0'}</span>
              </div>
              <div style={{ ...kpiCardStyle, borderLeft: '4px solid var(--corp-rep)' }}>
                <span style={kpiTitleStyle}>Total Payable (This Month)</span>
                <span style={kpiValueStyle}>₹ {data.total_payable_all?.toLocaleString('en-IN') || '0'}</span>
              </div>
              <div style={{ ...kpiCardStyle, borderLeft: '4px solid var(--corp-fin)' }}>
                <span style={kpiTitleStyle}>Total Closing MC</span>
                <span style={kpiValueStyle}>{data.total_closing_mc || '0'}</span>
              </div>
            </div>

            {/* Tab Buttons */}
            <div style={tabsRowStyle}>
              {['facility_summary', 'batch_summary', 'transactions'].map(tab => (
                <button
                  key={tab}
                  style={activeTab === tab ? activeTabStyle : inactiveTabStyle}
                  onClick={() => {
                    setActiveTab(tab);
                    setSearchQuery('');
                  }}
                >
                  {tab.replaceAll('_', ' ').toUpperCase()}
                </button>
              ))}
            </div>

            {/* Tab Contents */}
            <div style={{ marginTop: '16px' }} className="card">
              {renderStorageCostTable(activeTab)}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 4. RENDER: STANDARD UNIFIED SPREADSHEET TABLE
  return (
    <div className="report-viewer-card">
      {renderHeader(activeConfig?.title || 'Report spreadsheet')}
      {renderStandardFilters()}

      {loading && renderLoader()}
      {error && renderError()}

      {!loading && !error && data && (
        <div style={{ marginTop: '16px' }} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-secondary)' }}>
              Rows found: {filteredRows.length} {rows.length !== filteredRows.length && `(filtered from ${rows.length})`}
            </span>
            <div style={searchWrapperStyle}>
              <Search size={14} style={searchIconStyle} />
              <input
                type="text"
                placeholder="Search rows..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={searchInputStyle}
              />
            </div>
          </div>

          <div className="table-responsive">
            <table className="bknr-table">
              <thead>
                <tr>
                  {activeConfig?.columns.map((col, idx) => (
                    <th key={idx} className={col.align === 'right' ? 'text-right' : (col.align === 'center' ? 'text-center' : 'text-left')}>
                      {col.label}
                    </th>
                  ))}
                  {activeConfig?.canEdit && <th className="text-center">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filteredRows.length > 0 ? (
                  filteredRows.map((row, rowIdx) => {
                    const isEditing = editRowId === row.id;
                    return (
                      <tr key={rowIdx}>
                        {activeConfig?.columns.map((col, colIdx) => {
                          const alignment = col.align === 'right' ? 'text-right' : (col.align === 'center' ? 'text-center' : 'text-left');
                          const cellVal = row[col.key];

                          return (
                            <td key={colIdx} className={alignment} style={{ fontWeight: col.bold ? '700' : 'normal' }}>
                              {isEditing && col.editable ? (
                                <input
                                  type="text"
                                  className="form-control"
                                  style={{ height: '28px', padding: '2px 8px', fontSize: '12px', width: '100%', background: 'var(--bg-app)', color: 'var(--text-primary)' }}
                                  value={editData[col.key] || ''}
                                  onChange={(e) => setEditData({ ...editData, [col.key]: e.target.value })}
                                />
                              ) : (
                                formatVal(cellVal, col.format)
                              )}
                            </td>
                          );
                        })}

                        {activeConfig?.canEdit && (
                          <td className="text-center">
                            {isEditing ? (
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                <button onClick={saveEdit} className="btn btn-secondary" style={{ padding: '4px 8px', height: '28px' }}>
                                  <Save size={12} />
                                </button>
                                <button onClick={() => setEditRowId(null)} className="btn btn-secondary" style={{ padding: '4px 8px', height: '28px', background: '#475569' }}>
                                  <X size={12} />
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                <button onClick={() => startEdit(row)} className="btn btn-secondary" style={{ padding: '4px 8px', height: '28px' }}>
                                  <Edit2 size={12} />
                                </button>
                                <button onClick={() => deleteRow(row.id)} className="btn btn-secondary" style={{ padding: '4px 8px', height: '28px', background: '#dc2626' }}>
                                  <Ban size={12} /> Cancel
                                </button>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={activeConfig?.columns.length + (activeConfig?.canEdit ? 1 : 0)} className="text-center" style={{ padding: '40px', color: 'var(--text-tertiary)' }}>
                      No report records loaded. Select financial year or check filters above.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );

  // RENDER HELPERS: HEADERS, LOADERS, ERRORS, FILTERS

  function renderHeader(title) {
    return (
      <div style={reportHeaderStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={iconBadgeStyle}>
            <FileText size={18} style={{ color: 'white' }} />
          </div>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', margin: 0 }}>
              {title}
            </h2>
            <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0 }}>
              Natively rendering real-time operational registers from database framework
            </p>
          </div>
        </div>

        <div style={actionsRowStyle}>
          <button onClick={fetchData} className="btn btn-secondary" style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button onClick={handlePrint} className="btn btn-secondary" style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Printer size={13} /> Print
          </button>
          <button onClick={() => handleExport('excel')} className="btn btn-secondary" style={{ height: '36px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Download size={13} /> Export Excel
          </button>
        </div>
      </div>
    );
  }

  function renderLoader() {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px' }}>
        <RefreshCw size={28} className="spin" style={{ color: 'var(--corp-rep)', marginBottom: '12px' }} />
        <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>
          Fetching structured report data blocks from ledger endpoints...
        </span>
      </div>
    );
  }

  function renderError() {
    return (
      <div style={{ background: 'rgba(220, 38, 38, 0.1)', border: '1px solid rgba(220, 38, 38, 0.2)', padding: '16px', borderRadius: 'var(--radius-element)', color: '#f87171', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span>⚠️ ERROR: {error}</span>
        <button onClick={fetchData} className="btn btn-secondary" style={{ height: '28px', background: '#dc2626', color: 'white', padding: '0 12px' }}>
          Retry Fetch
        </button>
      </div>
    );
  }

  function renderStandardFilters() {
    return (
      <div className="erp-horizontal-filter-row" style={filtersWrapperStyle}>
        {activeConfig?.filters.includes('fy') && (
          <div style={filterBoxStyle}>
            <label style={filterLabelStyle}>Financial Year</label>
            <select
              className="form-control"
              style={selectControlStyle}
              value={selectedFy}
              onChange={e => setSelectedFy(e.target.value)}
            >
              {data?.financial_years ? (
                data.financial_years.map(y => <option key={y} value={y}>{formatFinancialYear(y)}</option>)
              ) : (
                ['2026', '2025', '2024'].map(y => <option key={y} value={y}>{formatFinancialYear(y)}</option>)
              )}
            </select>
          </div>
        )}

        {activeConfig?.filters.includes('date_range') && (
          <>
            <div style={filterBoxStyle}>
              <label style={filterLabelStyle}>Start Date</label>
              <input
                type="date"
                className="form-control"
                style={selectControlStyle}
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
              />
            </div>
            <div style={filterBoxStyle}>
              <label style={filterLabelStyle}>End Date</label>
              <input
                type="date"
                className="form-control"
                style={selectControlStyle}
                value={toDate}
                onChange={e => setToDate(e.target.value)}
              />
            </div>
          </>
        )}
      </div>
    );
  }

  function renderStorageCostFilters() {
    return (
      <div className="erp-horizontal-filter-row" style={filtersWrapperStyle}>
        <div style={filterBoxStyle}>
          <label style={filterLabelStyle}>Billing Month</label>
          <input
            type="month"
            className="form-control"
            style={selectControlStyle}
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
          />
        </div>
        <div style={filterBoxStyle}>
          <label style={filterLabelStyle}>Freezer Tunnel</label>
          <select
            className="form-control"
            style={selectControlStyle}
            value={freezer}
            onChange={e => setFreezer(e.target.value)}
          >
            <option value="">ALL FREEZERS</option>
            {data?.freezers?.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div style={filterBoxStyle}>
          <label style={filterLabelStyle}>Cold Storage Facility</label>
          <select
            className="form-control"
            style={selectControlStyle}
            value={coldStorageName}
            onChange={e => setColdStorageName(e.target.value)}
          >
            <option value="">ALL COLD STORAGES</option>
            {data?.cold_storage_names?.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
    );
  }

  function renderPeriodicFilters() {
    return (
      <div className="erp-horizontal-filter-row periodic-summary-filters no-print" style={filtersWrapperStyle}>
        <div style={filterBoxStyle}>
          <label style={filterLabelStyle}>Financial Year</label>
          <select className="form-control" style={selectControlStyle} value={selectedFy} onChange={e => setSelectedFy(e.target.value)}>
            <option value="">-- ALL FY --</option>
            {(data?.financial_years || []).map(y => <option key={y} value={y}>{formatFinancialYear(y)}</option>)}
          </select>
        </div>
        <div style={filterBoxStyle}>
          <label style={filterLabelStyle}>Date Filter</label>
          <select
            className="form-control"
            style={selectControlStyle}
            value={dateFilterType}
            onChange={e => setDateFilterType(e.target.value)}
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="month">Select Month</option>
            <option value="between">Date Range</option>
          </select>
        </div>

        {dateFilterType === 'month' && (
          <div style={filterBoxStyle}>
            <label style={filterLabelStyle}>Month</label>
            <input
              type="month"
              className="form-control"
              style={selectControlStyle}
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
            />
          </div>
        )}

        {dateFilterType === 'between' && (
          <>
            <div style={filterBoxStyle}>
              <label style={filterLabelStyle}>From Date</label>
              <input
                type="date"
                className="form-control"
                style={selectControlStyle}
                value={fromDate}
                onChange={e => setFromDate(e.target.value)}
              />
            </div>
            <div style={filterBoxStyle}>
              <label style={filterLabelStyle}>To Date</label>
              <input
                type="date"
                className="form-control"
                style={selectControlStyle}
                value={toDate}
                onChange={e => setToDate(e.target.value)}
              />
            </div>
          </>
        )}

        <div style={filterBoxStyle}>
          <label style={filterLabelStyle}>Production For</label>
          <select className="form-control" style={selectControlStyle} value={selectedCompany} onChange={e => { setSelectedCompany(e.target.value); setSelectedBatch(''); }}>
            <option value="">ALL COMPANIES</option>
            {(data?.companies || []).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        <div style={filterBoxStyle}>
          <label style={filterLabelStyle}>Production At</label>
          <select className="form-control" style={selectControlStyle} value={selectedProductionAt} onChange={e => setSelectedProductionAt(e.target.value)}>
            <option value="">ALL LOCATIONS</option>
            {(data?.production_ats || []).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        <div style={filterBoxStyle}>
          <label style={filterLabelStyle}>Process Type</label>
          <select
            className="form-control"
            style={selectControlStyle}
            value={prodType}
            onChange={e => {
              setProdType(e.target.value);
              setSelectedBatch('');
            }}
          >
            <option value="RMP">RMP (Fresh)</option>
            <option value="REPROCESS">Re-Processing</option>
          </select>
        </div>

        <div style={filterBoxStyle}>
          <label style={filterLabelStyle}>Batch Number</label>
          <select
            className="form-control"
            style={selectControlStyle}
            value={selectedBatch}
            onChange={e => setSelectedBatch(e.target.value)}
          >
            <option value="">All Batches</option>
            {data?.batches?.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <div style={filterBoxStyle}>
          <label style={filterLabelStyle}>Search Filters</label>
          <input
            type="search"
            className="form-control"
            style={selectControlStyle}
            value={searchQuery}
            onChange={event => setSearchQuery(event.target.value)}
            placeholder="Batch, brand, grade..."
          />
        </div>

        <div className="periodic-filter-actions">
          <button type="button" className="periodic-filter-button" onClick={fetchData}>
            <RefreshCw size={11} /> Filter Matrix
          </button>
          <button
            type="button"
            className="periodic-reset-button"
            onClick={() => {
              setSelectedFy('');
              setDateFilterType('today');
              setSelectedMonth('');
              setFromDate('');
              setToDate('');
              setSelectedCompany('');
              setSelectedProductionAt('');
              setProdType('RMP');
              setSelectedBatch('');
              setSearchQuery('');
            }}
          >
            Reset
          </button>
        </div>
      </div>
    );
  }

  function renderBatchSummaryFilters() {
    return (
      <div className="erp-horizontal-filter-row batch-summary-filters" style={filtersWrapperStyle}>
        <div style={filterBoxStyle}>
          <label style={filterLabelStyle}>Financial Year</label>
          <select
            className="form-control"
            style={selectControlStyle}
            value={selectedFy}
            onChange={e => setSelectedFy(e.target.value)}
          >
            <option value="">-- SELECT FY --</option>
            {data?.financial_years ? (
              data.financial_years.map(y => <option key={y} value={y}>{formatFinancialYear(y)}</option>)
            ) : (
              ['2026', '2025', '2024'].map(y => <option key={y} value={y}>{formatFinancialYear(y)}</option>)
            )}
          </select>
        </div>

        <div style={filterBoxStyle}>
          <label style={filterLabelStyle}>Production For</label>
          <select className="form-control" style={selectControlStyle} value={selectedCompany} onChange={e => { setSelectedCompany(e.target.value); setSelectedBatch(''); }}>
            <option value="">SELECT COMPANY</option>
            {(data?.companies || []).map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        <div style={filterBoxStyle}>
          <label style={filterLabelStyle}>Process Type</label>
          <select
            className="form-control"
            style={selectControlStyle}
            value={prodType}
            onChange={e => {
              setProdType(e.target.value);
              setSelectedBatch('');
            }}
          >
            <option value="RMP">RMP (Fresh)</option>
            <option value="REPROCESS">Re-Processing</option>
          </select>
        </div>

        <div style={filterBoxStyle}>
          <label style={filterLabelStyle}>Batch Number</label>
          <select
            className="form-control"
            style={selectControlStyle}
            value={selectedBatch}
            onChange={e => setSelectedBatch(e.target.value)}
          >
            <option value="">SELECT BATCH (REQUIRED)</option>
            {data?.batches?.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <div className="batch-filter-actions">
          <button type="button" className="batch-filter-button" onClick={fetchData}>Filter</button>
          <button
            type="button"
            className="batch-reset-button"
            onClick={() => {
              setSelectedFy('');
              setSelectedCompany('');
              setProdType('RMP');
              setSelectedBatch('');
              setSearchQuery('');
            }}
          >
            Reset
          </button>
        </div>
      </div>
    );
  }

  // RENDER DYNAMIC TABLES FOR SUB-SECTIONS (BATCH SUMMARY, PERIODIC SUMMARY)

  function renderSummaryTabTable(tab, options = {}) {
    if (!data || !data.rows) return null;
    const sourceRows = data.rows;
    const aggregateRmp = (bySupplier = false) => {
      const map = new Map();
      (sourceRows.rmp || []).forEach(row => {
        const parts = bySupplier
          ? [row.supplier_name, row.species, row.variety_name, row.count]
          : [row.species, row.variety_name, row.count];
        const key = parts.join('\u001f');
        const item = map.get(key) || {
          supplier_name: row.supplier_name, species: row.species,
          variety_name: row.variety_name, count: row.count,
          material_boxes: 0, received_qty: 0, amount: 0,
        };
        item.material_boxes += Number(row.material_boxes || 0);
        item.received_qty += Number(row.received_qty || 0);
        item.amount += Number(row.amount || 0);
        map.set(key, item);
      });
      return [...map.values()];
    };
    const reconciliationRows = Object.entries(data.subtotals || {}).map(([key, value]) => {
      const [production_for, production_at, species, variety, batch_number] = key.split('|');
      return { production_for, production_at, species, variety, batch_number, ...value };
    });
    const specialRows = {
      opening_floor_balance: data.opening_floor_balance || sourceRows.opening_floor_balance || [],
      closing_floor_balance: data.closing_floor_balance || sourceRows.closing_floor_balance || [],
      hoso_floor_balance: data.hoso_floor_balance || [],
      rmp_variety_summary: aggregateRmp(false),
      supplier_summary: aggregateRmp(true),
      reconciliation: reconciliationRows,
      stock_in: sourceRows.stock_in || (sourceRows.stock || []).filter(r => String(r.cargo_movement_type || '').toUpperCase() === 'IN'),
      stock_out: sourceRows.stock_out || (sourceRows.stock || []).filter(r => String(r.cargo_movement_type || '').toUpperCase() === 'OUT'),
    };
    const tabRows = specialRows[tab] || sourceRows[tab] || data[tab] || [];

    // Filter rows dynamically by search query
    const filteredTabRows = tabRows.filter(row => {
      if (!searchQuery) return true;
      return Object.values(row).some(val => 
        String(val || '').toLowerCase().includes(searchQuery.toLowerCase())
      );
    });

    // Keep the React tables aligned with the server-rendered summary templates.
    const schemas = {
      gate: {
        headers: ['Sl', 'Batch Number', 'Supplier Name', 'Vehicle Number', 'Date', 'Time', 'Species', 'Gate Pass', 'Challan', 'Center', 'Location', 'Boxes', 'Production For', 'Email'],
        keys: ['__sl', 'batch_number', 'supplier_name', 'vehicle_number', 'date', 'time', 'species', 'gate_pass_number', 'challan_number', 'receiving_center', 'purchasing_location', 'no_of_material_boxes', 'production_for', 'email'],
        formats: { no_of_material_boxes: 'number' }
      },
      rmp: {
        headers: ['Sl', 'Batch Number', 'Supplier Name', 'Date', 'Time', 'Species', 'Variety Name', 'Count', 'G1 Qty', 'G2 Qty', 'DC Qty', 'Boxes', 'Received Qty', 'Rate', 'Amount', 'Peeling At', 'Production For', 'Remarks', 'HSN Code', 'Email'],
        keys: ['__sl', 'batch_number', 'supplier_name', 'date', 'time', 'species', 'variety_name', 'count', 'g1_qty', 'g2_qty', 'dc_qty', 'material_boxes', 'received_qty', 'rate_per_kg', 'amount', 'peeling_at', 'production_for', 'remarks', 'hsn_code', 'email'],
        formats: { g1_qty: 'number', g2_qty: 'number', dc_qty: 'number', material_boxes: 'number', received_qty: 'number', rate_per_kg: 'currency', amount: 'currency' }
      },
      reprocess: {
        headers: ['Sl', 'Batch Number', 'Date', 'Prod For', 'Prod At', 'Species', 'Type', 'Old Batch', 'Brand', 'Freezer', 'Packing', 'MC', 'Loose', 'Variety', 'Grade', 'In Qty', 'Out Qty', 'Value'],
        keys: ['__sl', 'new_batch_id', 'date', 'production_for', 'production_at', 'species', 'reprocess_type', 'original_batch', 'brand', 'freezer', 'packing_style', 'no_of_mc', 'loose', 'variety', 'grade', 'in_qty', 'out_qty', 'inventory_value'],
        formats: { no_of_mc: 'number', loose: 'number', in_qty: 'number', out_qty: 'number', inventory_value: 'currency' }
      },
      deheading: {
        headers: ['Sl', 'Batch Number', 'Contractor', 'Date', 'Time', 'Prod At', 'Prod For', 'Species', 'Variety / Count', 'HOSO Qty', 'HLSO Qty', 'Yield %', 'Target %', 'Diff Qty', 'Rate', 'Amount', 'Email'],
        keys: ['__sl', 'batch_number', 'contractor', 'date', 'time', 'peeling_at', 'production_for', 'species', 'hoso_count', 'hoso_qty', 'hlso_qty', 'yield_percent', 'target_yield_percent', 'diff_qty', 'rate_per_kg', 'amount', 'email'],
        formats: { hoso_qty: 'number', hlso_qty: 'number', yield_percent: 'percentage', target_yield_percent: 'percentage', diff_qty: 'number', rate_per_kg: 'currency', amount: 'currency' }
      },
      grading_details: {
        headers: ['Sl', 'Batch Number', 'Date', 'Time', 'Peeling At', 'Production For', 'Species', 'HOSO Count', 'Variety Name', 'Graded Count', 'Quantity', 'Email'],
        keys: ['__sl', 'batch_number', 'date', 'time', 'peeling_at', 'production_for', 'species', 'hoso_count', 'variety_name', 'graded_count', 'quantity', 'email'],
        formats: { quantity: 'number' }
      },
      grading_summary: {
        headers: ['Species', 'HOSO Count', 'Variety', 'Actual HOSO', 'Graded Qty', 'Workout Count', 'Yield %', 'Grading HOSO', 'Diff KG', 'Diff %'],
        keys: ['species', 'hoso_count', 'variety', 'hoso_qty', 'graded_qty', 'workout_count', 'yield_pct', 'grading_hoso_qty', 'weight_diff_kg', 'weight_diff_pct'],
        formats: { hoso_qty: 'number', graded_qty: 'number', grading_hoso_qty: 'number', weight_diff_kg: 'number', yield_pct: 'percentage', weight_diff_pct: 'percentage' }
      },
      peeling: {
        headers: ['Sl', 'Batch Number', 'Contractor Name', 'Date', 'Time', 'Peeling At', 'Prod For', 'Species', 'HLSO Count', 'Variety Name', 'HLSO Qty', 'Peeled Qty', 'Yield %', 'Target %', 'Diff Qty', 'Diff %', 'Rate', 'Amount', 'Email'],
        keys: ['__sl', 'batch_number', 'contractor_name', 'date', 'time', 'peeling_at', 'production_for', 'species', 'hlso_count', 'variety_name', 'hlso_qty', 'peeled_qty', 'yield_percent', 'target_yield_percent', 'diff_qty', 'diff_percent', 'rate', 'amount', 'email'],
        formats: { hlso_qty: 'number', peeled_qty: 'number', yield_percent: 'percentage', target_yield_percent: 'percentage', diff_qty: 'number', diff_percent: 'percentage', rate: 'currency', amount: 'currency' }
      },
      soaking: {
        headers: ['Sl', 'Batch Number', 'Variety Name', 'Date', 'Time', 'Species', 'In Count', 'Sintex Number', 'Chemical Name', 'Chem %', 'Chem Qty', 'Salt %', 'Salt Qty', 'In Qty', 'Rejection Qty', 'Rejection For', 'Status', 'Production At', 'Production For', 'Email'],
        keys: ['__sl', 'batch_number', 'variety_name', 'date', 'time', 'species', 'in_count', 'sintex_number', 'chemical_name', 'chemical_percent', 'chemical_qty', 'salt_percent', 'salt_qty', 'in_qty', 'rejection_qty', 'rejection_for', 'status', 'production_at', 'production_for', 'email'],
        formats: { chemical_percent: 'percentage', chemical_qty: 'number', salt_percent: 'percentage', salt_qty: 'number', in_qty: 'number', rejection_qty: 'number' }
      },
      production: {
        headers: ['Sl', 'Date', 'Time', 'Prod At', 'Prod For', 'Type', 'Species', 'Batch No', 'Brand', 'Variety', 'Glaze', 'Freezer', 'Packing', 'Grade', 'MC', 'Loose', 'Gross Qty', 'Prod Qty', 'Yield %', 'Diff', 'User'],
        keys: ['__sl', 'date', 'time', 'production_at', 'production_for', 'production_type', 'species', 'batch_number', 'brand', 'variety_name', 'glaze', 'freezer', 'packing_style', 'grade', 'no_of_mc', 'loose', '__gross_qty', 'production_qty', '__dash', '__dash', 'email'],
        formats: { no_of_mc: 'number', loose: 'number', __gross_qty: 'number', production_qty: 'number' }
      },
      stock: {
        headers: ['Sl.No', 'Species', 'Location', 'Production At', 'Production For', 'PO Number', 'Purpose', 'Movement Type', 'Brand', 'Freezer', 'Packing Style', 'Glaze', 'Variety', 'Grade', 'No of MC', 'Loose', 'Quantity (KG)', 'Inventory Value'],
        keys: ['__sl', 'species', 'location', 'production_at', 'production_for', 'po_number', 'purpose', 'cargo_movement_type', 'brand', 'freezer', 'packing_style', 'glaze', 'variety', 'grade', 'no_of_mc', 'loose', 'quantity', 'inventory_value'],
        formats: { no_of_mc: 'number', loose: 'number', quantity: 'number', inventory_value: 'currency' }
      },
      stock_in: null,
      stock_out: null,
      hoso_floor_balance: {
        headers: ['Sl', 'Batch Number', 'Species', 'Location / Peeling At', 'Production For', 'Variety', 'Count / Grade', 'Available Qty (KG)', 'Value'],
        keys: ['__sl', '__batch', 'species', 'peeling_at', 'production_for', 'variety', 'count', 'available_qty', 'value'],
        formats: { available_qty: 'number', value: 'currency' }
      },
      opening_floor_balance: {
        headers: ['Sl', 'Batch Number', 'Species', 'Location / Peeling At', 'Production For', 'Variety', 'Count / Grade', 'Opening Qty (KG)', 'Value'],
        keys: ['__sl', '__batch', 'species', 'peeling_at', 'production_for', 'variety', 'count', 'available_qty', 'value'],
        formats: { available_qty: 'number', value: 'currency' }
      },
      closing_floor_balance: {
        headers: ['Sl', 'Batch Number', 'Species', 'Location / Peeling At', 'Production For', 'Variety', 'Count / Grade', 'Available Qty (KG)', 'Value'],
        keys: ['__sl', '__batch', 'species', 'peeling_at', 'production_for', 'variety', 'count', 'available_qty', 'value'],
        formats: { available_qty: 'number', value: 'currency' }
      },
      rmp_variety_summary: {
        headers: ['Sl', 'Species', 'Variety Name', 'Count', 'Total Boxes', 'Total Received Qty (KG)', 'Total Amount'],
        keys: ['__sl', 'species', 'variety_name', 'count', 'material_boxes', 'received_qty', 'amount'],
        formats: { material_boxes: 'number', received_qty: 'number', amount: 'currency' }
      },
      supplier_summary: {
        headers: ['Sl', 'Supplier Name', 'Species', 'Variety Name', 'Count', 'Total Boxes', 'Total Received Qty (KG)', 'Total Amount'],
        keys: ['__sl', 'supplier_name', 'species', 'variety_name', 'count', 'material_boxes', 'received_qty', 'amount'],
        formats: { material_boxes: 'number', received_qty: 'number', amount: 'currency' }
      },
      reconciliation: {
        headers: ['Production For', 'Production At', 'Species', 'Variety', 'Batch', 'Soaking In', 'Produced Qty', 'Target Yield', 'Actual Yield', 'Yield Diff', 'Diff Qty'],
        keys: ['production_for', 'production_at', 'species', 'variety', 'batch_number', 'soaking_in', 'prod_qty', 'target_yield', 'actual_yield', 'diff_yield_perc', 'diff_qty'],
        formats: { soaking_in: 'number', prod_qty: 'number', target_yield: 'percentage', actual_yield: 'percentage', diff_yield_perc: 'percentage', diff_qty: 'number' }
      }
    };

    schemas.stock_in = schemas.stock;
    schemas.stock_out = schemas.stock;

    const batchSchemas = {
      gate: {
        headers: ['Sl', 'Date', 'Time', 'Prod For', 'Species', 'Gate Pass', 'Challan', 'Center', 'Supplier', 'Location', 'Vehicle', 'Boxes', 'Email'],
        keys: ['__sl', 'date', 'time', 'production_for', 'species', 'gate_pass_number', 'challan_number', 'receiving_center', 'supplier_name', 'purchasing_location', 'vehicle_number', 'no_of_material_boxes', 'email'],
        formats: { no_of_material_boxes: 'number' }
      },
      rmp: {
        headers: ['Sl', 'Date', 'Species', 'HSN', 'Peeling At', 'G1/G2/DC', 'Remarks', 'Boxes', 'Variety', 'Count', 'Qty', 'Rate', 'Amount', 'Email'],
        keys: ['__sl', 'date', 'species', 'hsn_code', 'peeling_at', '__g123', 'remarks', 'material_boxes', 'variety_name', 'count', 'received_qty', 'rate_per_kg', 'amount', 'email'],
        formats: { material_boxes: 'number', received_qty: 'number', rate_per_kg: 'currency', amount: 'currency' }
      },
      reprocess: {
        headers: ['Sl', 'Date', 'Prod For', 'Prod At', 'Species', 'Type', 'Old Batch', 'Brand', 'Freezer', 'Packing', 'MC/Loose', 'Variety', 'Grade', 'In Qty', 'Out Qty', 'Value'],
        keys: ['__sl', 'date', 'production_for', 'production_at', 'species', 'reprocess_type', 'original_batch', 'brand', 'freezer', 'packing_style', '__mc_loose', 'variety', 'grade', 'in_qty', 'out_qty', 'inventory_value'],
        formats: { in_qty: 'number', out_qty: 'number', inventory_value: 'currency' }
      },
      deheading: {
        headers: ['Sl', 'Date', 'Time', 'Batch No', 'Prod At', 'Prod For', 'Species', 'Variety', 'HOSO Qty', 'HLSO Qty', 'Yield %', 'Def Yield', 'Def Qty', 'Rate', 'Amount', 'Contractor', 'Email'],
        keys: ['__sl', 'date', 'time', 'batch_number', 'peeling_at', 'production_for', 'species', 'hoso_count', 'hoso_qty', 'hlso_qty', 'yield_percent', 'target_yield_percent', 'diff_qty', 'rate_per_kg', 'amount', 'contractor', 'email'],
        formats: schemas.deheading.formats
      },
      grading_details: {
        headers: ['Sl', 'Date', 'Time', 'Peeling At', 'Production For', 'Species', 'Batch Number', 'Variety Name', 'Graded Count', 'Quantity', 'Email'],
        keys: ['__sl', 'date', 'time', 'peeling_at', 'production_for', 'species', 'batch_number', 'variety_name', 'graded_count', 'quantity', 'email'],
        formats: { quantity: 'number' }
      },
      peeling: {
        headers: ['Sl', 'Date', 'Peeling At', 'Peeling For', 'Variety', 'HLSO Qty', 'Peeled Qty', 'Yield %', 'Def Yield', 'Def Qty', 'Rate', 'Amount', 'Contractor', 'Email'],
        keys: ['__sl', 'date', 'peeling_at', 'production_for', 'variety_name', 'hlso_qty', 'peeled_qty', 'yield_percent', 'target_yield_percent', 'diff_qty', 'rate', 'amount', 'contractor_name', 'email'],
        formats: schemas.peeling.formats
      },
      soaking: {
        headers: ['Sl', 'Date', 'Sintex #', 'Chemical', 'Chem % / Qty', 'Salt % / Qty', 'Variety', 'Count', 'In Qty', 'Status', 'Rej', 'Email'],
        keys: ['__sl', 'date', 'sintex_number', 'chemical_name', '__chemical', '__salt', 'variety_name', 'in_count', 'in_qty', 'status', 'rejection_qty', 'email'],
        formats: { in_qty: 'number', rejection_qty: 'number' }
      },
      production: schemas.production,
      stock: {
        headers: ['Sl.No', 'Species', 'Location', 'Production At', 'Production For', 'PO Number', 'Purpose', 'Movement Type', 'Brand', 'Freezer', 'Packing Style', 'Variety', 'Grade', 'No of MC', 'Loose', 'Quantity (KG)', 'Inventory Value'],
        keys: ['__sl', 'species', 'location', 'production_at', 'production_for', 'po_number', 'purpose', 'cargo_movement_type', 'brand', 'freezer', 'packing_style', 'variety', 'grade', 'no_of_mc', 'loose', 'quantity', 'inventory_value'],
        formats: schemas.stock.formats
      },
      hoso_floor_balance: {
        headers: ['Sl', 'Species', 'Location / Peeling At', 'Variety', 'Count / Grade', 'Available Qty (KG)', 'Value'],
        keys: ['__sl', 'species', 'peeling_at', 'variety', 'count', 'available_qty', 'value'],
        formats: { available_qty: 'number', value: 'currency' }
      }
    };

    const periodicSchemas = {
      opening_floor_balance: {
        headers: ['Sl', 'Batch Number', 'Species', 'Location / Peeling At', 'Variety', 'Count / Grade', 'Opening Qty (KG)', 'Value'],
        keys: ['__sl', '__batch', 'species', 'peeling_at', 'variety', 'count', 'available_qty', 'value'],
        formats: { available_qty: 'number', value: 'currency' }
      },
      closing_floor_balance: {
        headers: ['Sl', 'Batch Number', 'Species', 'Location / Peeling At', 'Variety', 'Count / Grade', 'Available Qty (KG)', 'Value'],
        keys: ['__sl', '__batch', 'species', 'peeling_at', 'variety', 'count', 'available_qty', 'value'],
        formats: { available_qty: 'number', value: 'currency' }
      }
    };

    const schema = (reportId === 'report_batch_summary' ? batchSchemas[tab] : periodicSchemas[tab]) || schemas[tab] || schemas.gate;

    return (
      <div className={`summary-table-block summary-table-${tab}`}>
        {!options.compact && <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h4 style={{ fontSize: '13px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-primary)' }}>
            {tab.replaceAll('_', ' ')} DETAILS
          </h4>
          <div style={searchWrapperStyle}>
            <Search size={13} style={searchIconStyle} />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={searchInputStyle}
            />
          </div>
        </div>}

        <div className="table-responsive summary-table-wrap">
          <table
            className="bknr-table summary-data-table"
            style={{ minWidth: options.compact ? Math.max(700, schema.headers.length * 82) : Math.max(900, schema.headers.length * 105) }}
          >
            <thead>
              <tr>
                {schema.headers.map((head, index) => (
                  <th
                    key={index}
                    className={schema.keys[index] === '__sl' ? 'text-center' : schema.formats?.[schema.keys[index]] ? 'text-right' : 'text-left'}
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredTabRows.length > 0 ? (
                filteredTabRows.map((row, rIdx) => (
                  <tr key={rIdx}>
                    {schema.keys.map((k, cIdx) => {
                      const format = schema.formats?.[k];
                      let value = row[k];
                      if (k === '__sl') value = rIdx + 1;
                      else if (k === '__batch') value = row.batch_number || row.batch || '';
                      else if (k === 'peeling_at' && !value) value = row.location || '';
                      else if (k === '__g123') value = [row.g1_qty, row.g2_qty, row.dc_qty].map(v => Number(v || 0).toFixed(2)).join(' / ');
                      else if (k === '__mc_loose') value = `${Number(row.no_of_mc || 0)} / ${Number(row.loose || 0)}`;
                      else if (k === '__chemical') value = `${Number(row.chemical_percent || 0).toFixed(2)}% / ${Number(row.chemical_qty || 0).toFixed(2)}`;
                      else if (k === '__salt') value = `${Number(row.salt_percent || 0).toFixed(2)}% / ${Number(row.salt_qty || 0).toFixed(2)}`;
                      else if (k === '__dash') value = '-';
                      else if (k === '__gross_qty') {
                        const netQty = Number(row.production_qty || 0);
                        const glazeText = String(row.glaze || '').trim().toUpperCase();
                        const match = glazeText.includes('NWNC') ? null : glazeText.match(/^(\d+(?:\.\d+)?)%$/);
                        const glazePct = match ? Number(match[1]) : 0;
                        value = glazePct > 0 && glazePct < 100 ? netQty / ((100 - glazePct) / 100) : netQty;
                      }
                      return (
                        <td key={cIdx} className={format ? 'text-right' : 'text-left'}>
                          {formatVal(value, format)}
                        </td>
                      );
                    })}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={schema.headers.length} className="text-center" style={{ padding: '24px', color: 'var(--text-tertiary)' }}>
                    No record blocks registered for this stage.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // RENDER CUSTOM STORAGE & COST DETAILS
  function renderStorageCostTable(tab) {
    if (!data) return null;

    if (tab === 'facility_summary') {
      const rows = data.facility_summary || [];
      return (
        <div className="table-responsive">
          <table className="bknr-table">
            <thead>
              <tr>
                <th>Cold Storage Facility</th>
                <th>Client Group</th>
                <th>Opening MC</th>
                <th>Monthly IN MC</th>
                <th>Monthly OUT MC</th>
                <th>Closing MC</th>
                <th>Rent Cost</th>
                <th>Handling Charges</th>
                <th>Total Payable</th>
              </tr>
            </thead>
            <tbody>
              {rows.length > 0 ? (
                rows.map((fac, fIdx) => (
                  <React.Fragment key={fIdx}>
                    {/* Facility Header Row */}
                    <tr style={{ background: 'var(--row-hover)' }}>
                      <td style={{ fontWeight: '800', color: 'var(--corp-rep)' }}>{fac.cold_storage_name}</td>
                      <td>(Facility Total)</td>
                      <td className="text-right font-bold">{fac.opening_mc}</td>
                      <td className="text-right font-bold">{fac.monthly_in_mc}</td>
                      <td className="text-right font-bold">{fac.monthly_out_mc}</td>
                      <td className="text-right font-bold">{fac.closing_mc}</td>
                      <td className="text-right font-bold">{formatVal(fac.storage_rent, 'currency')}</td>
                      <td className="text-right font-bold">{formatVal(fac.other_charges, 'currency')}</td>
                      <td className="text-right font-bold" style={{ color: 'var(--corp-rep)' }}>{formatVal(fac.total_payable, 'currency')}</td>
                    </tr>
                    {/* Nested Client Rows */}
                    {fac.client_groups?.map((cli, cIdx) => (
                      <React.Fragment key={cIdx}>
                        {cli.location_groups?.map((loc, lIdx) => (
                          <tr key={`${cIdx}-${lIdx}`} style={{ fontSize: '12px' }}>
                            <td style={{ paddingLeft: '24px', color: 'var(--text-secondary)' }}>↳ {loc.production_at}</td>
                            <td>{cli.production_for}</td>
                            <td className="text-right">{loc.opening_mc}</td>
                            <td className="text-right">{loc.monthly_in_mc}</td>
                            <td className="text-right">{loc.monthly_out_mc}</td>
                            <td className="text-right">{loc.closing_mc}</td>
                            <td className="text-right">{formatVal(loc.storage_rent, 'currency')}</td>
                            <td className="text-right">{formatVal(loc.other_charges, 'currency')}</td>
                            <td className="text-right">{formatVal(loc.total_payable, 'currency')}</td>
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </React.Fragment>
                ))
              ) : (
                <tr>
                  <td colSpan="9" className="text-center" style={{ padding: '24px' }}>No facilities summary logged.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      );
    }

    if (tab === 'batch_summary') {
      const groups = data.production_for_groups || [];
      return (
        <div className="table-responsive">
          <table className="bknr-table">
            <thead>
              <tr>
                <th>Batch / Details</th>
                <th>Species / Variety</th>
                <th>Grade / Glaze</th>
                <th>Opening MC</th>
                <th>Inward MC / Kg</th>
                <th>Outward MC / Kg</th>
                <th>Closing MC</th>
                <th>Storage Rent</th>
                <th>Handling Charges</th>
                <th>Net Payable</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group, gIdx) => (
                <React.Fragment key={gIdx}>
                  {/* Group Client Header */}
                  <tr style={{ background: 'var(--row-hover)' }}>
                    <td colSpan="3" style={{ fontWeight: '800', color: 'var(--corp-ops)' }}>
                      CLIENT: {group.production_for}
                    </td>
                    <td className="text-right font-bold">{group.opening_mc}</td>
                    <td className="text-right font-bold">{group.monthly_in_mc} MC / {group.monthly_in_kg?.toFixed(2)} Kg</td>
                    <td className="text-right font-bold">{group.monthly_out_mc} MC / {group.monthly_out_kg?.toFixed(2)} Kg</td>
                    <td className="text-right font-bold">{group.closing_mc}</td>
                    <td className="text-right font-bold">{formatVal(group.storage_rent, 'currency')}</td>
                    <td className="text-right font-bold">{formatVal(group.other_charges, 'currency')}</td>
                    <td className="text-right font-bold">{formatVal(group.total_payable, 'currency')}</td>
                  </tr>
                  {/* Location Groups */}
                  {group.location_groups?.map((loc, lIdx) => (
                    <React.Fragment key={lIdx}>
                      <tr style={{ background: 'rgba(255,255,255,0.01)' }}>
                        <td colSpan="3" style={{ paddingLeft: '20px', fontWeight: '700', color: 'var(--text-secondary)' }}>
                          ↳ PLANT LOCATION: {loc.production_at}
                        </td>
                        <td className="text-right font-bold">{loc.opening_mc}</td>
                        <td className="text-right font-bold">{loc.monthly_in_mc} MC</td>
                        <td className="text-right font-bold">{loc.monthly_out_mc} MC</td>
                        <td className="text-right font-bold">{loc.closing_mc}</td>
                        <td className="text-right font-bold">{formatVal(loc.storage_rent, 'currency')}</td>
                        <td className="text-right font-bold">{formatVal(loc.other_charges, 'currency')}</td>
                        <td className="text-right font-bold">{formatVal(loc.total_payable, 'currency')}</td>
                      </tr>
                      {/* Individual Batches */}
                      {loc.batches?.map((b, bIdx) => (
                        <tr key={bIdx} style={{ fontSize: '11px' }}>
                          <td style={{ paddingLeft: '40px' }} className="font-bold">{b.batch_number} <br/><span style={{ fontSize: '9px', color: 'var(--text-tertiary)' }}>{b.cold_storage_name}</span></td>
                          <td>{b.species} / {b.variety}</td>
                          <td>{b.grade} / {b.glaze}</td>
                          <td className="text-right">{b.opening_mc}</td>
                          <td className="text-right">{b.monthly_in_mc} MC / {b.monthly_in_kg?.toFixed(1)} Kg</td>
                          <td className="text-right">{b.monthly_out_mc} MC / {b.monthly_out_kg?.toFixed(1)} Kg</td>
                          <td className="text-right">{b.closing_mc}</td>
                          <td className="text-right">{formatVal(b.storage_rent, 'currency')}</td>
                          <td className="text-right">{formatVal(b.other_charges, 'currency')}</td>
                          <td className="text-right font-bold" style={{ color: 'var(--text-primary)' }}>{formatVal(b.total_payable, 'currency')}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    if (tab === 'transactions') {
      const rows = data.transactions || [];
      const filteredTxRows = rows.filter(r => 
        !searchQuery || 
        Object.values(r).some(val => String(val || '').toLowerCase().includes(searchQuery.toLowerCase()))
      );

      return (
        <div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
            <div style={searchWrapperStyle}>
              <Search size={13} style={searchIconStyle} />
              <input
                type="text"
                placeholder="Search ledger..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={searchInputStyle}
              />
            </div>
          </div>
          <div className="table-responsive">
            <table className="bknr-table">
              <thead>
                <tr>
                  <th>Client</th>
                  <th>Date</th>
                  <th>Batch No</th>
                  <th>Variety / Grade</th>
                  <th>Facility</th>
                  <th>Type</th>
                  <th>MC / Qty (Kg)</th>
                  <th>Running Bal</th>
                  <th>Rent Rate</th>
                  <th>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {filteredTxRows.map((tx, idx) => (
                  <tr key={idx}>
                    <td>{tx.production_for}</td>
                    <td className="text-center">{tx.date}</td>
                    <td className="text-center font-bold">{tx.batch_number}</td>
                    <td>{tx.variety} / {tx.grade}</td>
                    <td>{tx.cold_storage_name}</td>
                    <td className="text-center" style={{ color: tx.type === 'IN' ? 'var(--corp-fin)' : 'var(--corp-ops)', fontWeight: '700' }}>
                      {tx.type}
                    </td>
                    <td className="text-right">{tx.mc} MC / {tx.qty_kg?.toFixed(1)} Kg</td>
                    <td className="text-right font-bold">{tx.running_balance} MC</td>
                    <td className="text-right">₹ {tx.rate?.toFixed(2)}</td>
                    <td style={{ fontStyle: 'italic', fontSize: '10px' }}>{tx.remarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
    }
  }
}

// PREMIUM INLINE STYLES FOR SLEEK DARK/LIGHT COMPATIBILITY

const reportHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '20px',
  flexWrap: 'wrap',
  gap: '16px',
  paddingBottom: '16px',
  borderBottom: '1px solid var(--border-light)'
};

const actionsRowStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  flexWrap: 'wrap'
};

const filtersWrapperStyle = {
  display: 'flex',
  flexWrap: 'nowrap',
  gap: '6px',
  background: 'var(--glass-bg)',
  padding: '4px 7px',
  borderRadius: 'var(--radius-element)',
  border: '1px solid var(--border-light)',
  marginBottom: '6px',
  alignItems: 'flex-end',
  overflowX: 'auto',
  overflowY: 'hidden',
  WebkitOverflowScrolling: 'touch',
  scrollbarWidth: 'thin'
};

const filterBoxStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  flexShrink: 0,
  minWidth: '108px',
  width: '108px'
};

const filterLabelStyle = {
  fontSize: '8px',
  fontWeight: '800',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px'
};

const selectControlStyle = {
  height: '27px',
  padding: '0 7px',
  fontSize: '10px',
  fontWeight: '600',
  borderRadius: 'var(--radius-element)',
  border: '1px solid var(--input-border)',
  background: 'var(--input-bg)',
  color: 'var(--text-primary)',
  outline: 'none',
  width: '100%'
};

const searchWrapperStyle = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center'
};

const searchIconStyle = {
  position: 'absolute',
  left: '7px',
  color: 'var(--text-tertiary)'
};

const searchInputStyle = {
  padding: '0 7px 0 25px',
  fontSize: '10px',
  border: '1px solid var(--input-border)',
  borderRadius: 'var(--radius-element)',
  background: 'var(--input-bg)',
  color: 'var(--text-primary)',
  outline: 'none',
  width: '150px',
  height: '27px'
};

const kpiGridStyle = {
  display: 'flex',
  flexWrap: 'nowrap',
  overflowX: 'auto',
  overflowY: 'hidden',
  gap: '6px',
  marginBottom: '6px'
};

const kpiCardStyle = {
  background: 'var(--erp-kpi-surface, var(--surface-panel))',
  border: '1px solid var(--erp-kpi-border, var(--border-light))',
  borderRadius: '14px',
  padding: '12px',
  minWidth: '150px',
  minHeight: '92px',
  flex: '1 0 150px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  boxShadow: 'var(--erp-kpi-shadow, 0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px rgba(15, 23, 42, 0.055))',
  transition: 'transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease'
};

const kpiMetaStyle = {
  textAlign: 'left'
};

const kpiLabelStyle = {
  fontSize: '10px',
  textTransform: 'uppercase',
  fontWeight: '800',
  color: 'var(--erp-kpi-title, var(--text-secondary))',
  letterSpacing: '0.55px',
  lineHeight: 1.35
};

const kpiValueStyle = {
  fontSize: '16px',
  fontWeight: '800',
  color: 'var(--erp-kpi-value, var(--text-primary))',
  marginTop: '8px',
  lineHeight: 1.08,
  letterSpacing: '-0.75px',
  fontVariantNumeric: 'tabular-nums'
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

const kpiSubValueStyle = {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--text-secondary)',
    marginTop: '2px'
};

const kpiTitleStyle = {
  fontSize: '10px',
  fontWeight: '800',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.5px'
};


const tabsRowStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  borderBottom: '1px solid var(--border-light)',
  paddingBottom: '8px',
  marginBottom: '14px'
};

const activeTabStyle = {
  background: 'var(--corp-rep)',
  color: 'white',
  border: 'none',
  padding: '8px 16px',
  fontSize: '11px',
  fontWeight: '800',
  borderRadius: '4px',
  cursor: 'pointer',
  transition: 'all 0.2s ease'
};

const inactiveTabStyle = {
  background: 'var(--input-bg)',
  color: 'var(--text-secondary)',
  border: '1px solid var(--input-border)',
  padding: '8px 16px',
  fontSize: '11px',
  fontWeight: '700',
  borderRadius: '4px',
  cursor: 'pointer',
  transition: 'all 0.2s ease'
};

const iconBadgeStyle = {
  width: '36px',
  height: '36px',
  borderRadius: '8px',
  background: 'var(--corp-rep)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};
