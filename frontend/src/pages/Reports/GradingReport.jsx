/**
 * GradingReport.jsx – Grading Count Yields Report
 */
import React, { useState, useEffect } from 'react';
import {
  ReportHeader, FilterBar, FilterBox, FilterSelect, FilterInput,
  KPIGrid, KPICard, Loader, ErrorBox, SearchInput, EmptyRow,
  FinYearSelect, useReport, fmt, ConfirmModal, AuditDrawer, RowActionMenu, InlineSearchableSelect
} from './ReportShell';

export default function GradingReport({ activeRoute }) {
  const [fy, setFy] = useState('');
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'detailed' | 'card'

  // Filters
  const [batch, setBatch] = useState('');
  const [species, setSpecies] = useState('');
  const [variety, setVariety] = useState('');
  const [hosoCount, setHosoCount] = useState('');
  const [search, setSearch] = useState('');

  // Expansion state for Summary View
  const [expandedRows, setExpandedRows] = useState({});

  // Detailed view data
  const [detailedData, setDetailedData] = useState([]);
  const [detailedLoading, setDetailedLoading] = useState(false);

  // Edit / Action state
  const [selectedRow, setSelectedRow] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [auditOpen, setAuditOpen] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  const { data, loading, error, reload } = useReport({
    url: activeRoute,
    params: fy ? { fy } : {},
    deps: [fy],
  });

  // Load detailed data when switching tabs or refreshing
  const fetchDetailedData = async () => {
    setDetailedLoading(true);
    try {
      const res = await fetch(`${activeRoute}/details?source=all`);
      if (res.ok) {
        const json = await res.json();
        setDetailedData(json);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDetailedLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'summary') {
      fetchDetailedData();
    }
  }, [activeTab, fy]);

  const handleReload = () => {
    reload();
    if (activeTab !== 'summary') {
      fetchDetailedData();
    }
  };

  const rawRows = data?.rows || [];

  // Summary filtering
  const summaryRows = rawRows.filter(r => {
    if (batch && r.batch !== batch) return false;
    if (species && r.species !== species) return false;
    if (variety && r.variety !== variety) return false;
    if (hosoCount && r.hoso_count !== hosoCount) return false;
    if (search) {
      const q = search.toLowerCase();
      const match = Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const dataRows = summaryRows.filter(r => !r.is_subtotal);
  const totalHoso = dataRows.reduce((s, r) => s + Number(r.hoso_qty || 0), 0);
  const totalGraded = dataRows.reduce((s, r) => s + Number(r.graded_qty || 0), 0);

  // Detailed filtering
  const filteredDetailed = detailedData.filter(r => {
    if (batch && (r.batch_number || r.batch) !== batch) return false;
    if (species && r.species !== species) return false;
    if (variety && (r.variety_name || r.variety) !== variety) return false;
    if (hosoCount && r.hoso_count !== hosoCount) return false;
    if (search) {
      const q = search.toLowerCase();
      const match = Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  // Extract filter dropdown option lists
  const uniqueBatches = Array.from(new Set(rawRows.map(r => r.batch).filter(Boolean))).sort();
  const uniqueSpecies = Array.from(new Set(rawRows.map(r => r.species).filter(Boolean))).sort();
  const uniqueVarieties = Array.from(new Set(rawRows.map(r => r.variety).filter(Boolean))).sort();
  const uniqueCounts = Array.from(new Set(rawRows.map(r => r.hoso_count).filter(Boolean))).sort();

  // Collapsible expansions in Summary
  const handleExpand = async (row, source) => {
    const key = `${row.batch}_${row.species}_${row.hoso_count}_${row.variety}`;
    if (expandedRows[key]?.source === source) {
      const next = { ...expandedRows };
      delete next[key];
      setExpandedRows(next);
      return;
    }

    setExpandedRows(prev => ({
      ...prev,
      [key]: { loading: true, source }
    }));

    try {
      const q = new URLSearchParams({
        source,
        batch: row.batch || '',
        species: row.species || '',
        hoso_count: row.hoso_count || '',
        variety: row.variety || ''
      });
      const res = await fetch(`${activeRoute}/details?${q}`);
      const json = await res.json();
      setExpandedRows(prev => ({
        ...prev,
        [key]: { loading: false, source, data: json }
      }));
    } catch (err) {
      setExpandedRows(prev => ({
        ...prev,
        [key]: { loading: false, source, error: err.message }
      }));
    }
  };

  const handleEdit = () => {
    if (!selectedRow) return alert('Select a row inside Detailed View first!');
    setEditData({ ...selectedRow });
    setIsEditing(true);
  };

  const handleSave = async () => {
    try {
      const res = await fetch(`${activeRoute}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      if (res.ok) {
        alert('Changes saved successfully.');
        setIsEditing(false);
        setSelectedRow(null);
        fetchDetailedData();
      } else {
        alert('Update Failed!');
      }
    } catch (err) {
      alert('Error saving changes');
    }
  };

  const handleCancel = async () => {
    if (!selectedRow) return;
    try {
      const res = await fetch(`${activeRoute}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedRow.id }),
      });
      if (res.ok) {
        alert('Record cancelled successfully.');
        setSelectedRow(null);
        setConfirmModalOpen(false);
        fetchDetailedData();
      } else {
        alert('Cancel Failed!');
      }
    } catch (err) {
      alert('Error cancelling row');
    }
  };

  const getExportUrl = (type) => {
    const pf = localStorage.getItem('production_for_filter') || '';
    const loc = localStorage.getItem('plant_location_filter') || '';
    let url = `${activeRoute}/export_${type}?fy=${fy}&batch=${encodeURIComponent(batch)}&species=${encodeURIComponent(species)}&variety=${encodeURIComponent(variety)}&hoso_count=${encodeURIComponent(hosoCount)}`;
    if (pf) url += `&production_for=${encodeURIComponent(pf)}`;
    if (loc) url += `&location=${encodeURIComponent(loc)}`;
    return url;
  };

  const menuActions = [
    { label: 'Edit Selected Row', onClick: handleEdit, disabled: !selectedRow || isEditing || activeTab !== 'detailed' },
    { label: 'Save Changes', onClick: handleSave, disabled: !isEditing || activeTab !== 'detailed' },
    { label: 'View Audit Logs', onClick: () => setAuditOpen(true) },
    { divider: true },
    { header: 'Export Options' },
    { label: 'Print View', onClick: () => window.print() },
    { label: 'Export Excel', onClick: () => { window.location.href = getExportUrl('excel'); } },
    { divider: true },
    { label: 'Cancel Record', onClick: () => { setConfirmAction('cancel'); setConfirmModalOpen(true); }, danger: true, disabled: !selectedRow || activeTab !== 'detailed' }
  ];

  return (
    <div className="report-viewer-card">
      <ReportHeader
        title="Grading Summary & Detailed Report"
        subtitle={`${activeTab === 'summary' ? summaryRows.length : filteredDetailed.length} entries loaded${fy ? ` — FY ${fy}–${Number(fy)+1}` : ''}`}
        loading={loading || detailedLoading}
        onReload={handleReload}
        exportUrl={fy ? getExportUrl('excel') : null}
      />

      <div className="view-tabs" style={{ display: 'flex', gap: 15, borderBottom: '1px solid var(--border-light)', marginBottom: 16 }}>
        {['summary', 'detailed', 'card'].map(t => (
          <div
            key={t}
            onClick={() => {
              setActiveTab(t);
              setIsEditing(false);
              setSelectedRow(null);
            }}
            style={{
              padding: '8px 16px',
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
              textTransform: 'uppercase',
              color: activeTab === t ? 'var(--corp-rep)' : 'var(--text-tertiary)',
              borderBottom: activeTab === t ? '3px solid var(--corp-rep)' : '3px solid transparent',
              transition: 'all 0.2s',
            }}
          >
            {t} View
          </div>
        ))}
      </div>

      <FilterBar>
        <FilterBox label="Financial Year">
          <FinYearSelect value={fy} onChange={setFy} list={data?.fy_years || data?.financial_years} />
        </FilterBox>
        <FilterBox label="Batch">
          <FilterSelect value={batch} onChange={setBatch}>
            <option value="">ALL BATCHES</option>
            {uniqueBatches.map(b => <option key={b} value={b}>{b}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Species">
          <FilterSelect value={species} onChange={setSpecies}>
            <option value="">ALL SPECIES</option>
            {uniqueSpecies.map(s => <option key={s} value={s}>{s}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Variety">
          <FilterSelect value={variety} onChange={setVariety}>
            <option value="">ALL VARIETIES</option>
            {uniqueVarieties.map(v => <option key={v} value={v}>{v}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="HOSO Count">
          <FilterSelect value={hosoCount} onChange={setHosoCount}>
            <option value="">ALL COUNTS</option>
            {uniqueCounts.map(c => <option key={c} value={c}>{c}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Search">
          <SearchInput value={search} onChange={setSearch} />
        </FilterBox>
      </FilterBar>

      <div className="actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div id="rowCount" style={{ fontSize: 12, fontWeight: 700, color: 'var(--corp-rep)' }}>
          {activeTab === 'summary' ? `${summaryRows.length} groups found` : `${filteredDetailed.length} sessions found`}
        </div>
        <RowActionMenu actions={menuActions} />
      </div>

      {(loading || detailedLoading) && <Loader />}
      {error && <ErrorBox msg={error} onRetry={handleReload} />}

      {!loading && !error && (
        <>
          {activeTab === 'summary' && (
            <>
              <KPIGrid>
                <KPICard label="Batch Groups" value={dataRows.length} accent="var(--corp-dash)" />
                <KPICard label="Total HOSO Qty (Kg)" value={fmt.number(totalHoso)} accent="var(--corp-ops)" />
                <KPICard label="Total Graded Qty (Kg)" value={fmt.number(totalGraded)} accent="var(--corp-fin)" />
              </KPIGrid>

              <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                <table className="bknr-table" style={{ minWidth: 1150, width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ width: 45 }}>#</th>
                      <th style={{ width: 95 }}>Batch</th>
                      <th style={{ width: 120 }}>Species</th>
                      <th style={{ width: 85 }}>HOSO Count</th>
                      <th style={{ width: 100 }}>Variety</th>
                      <th style={{ width: 95 }} className="text-right">Actual HOSO</th>
                      <th style={{ width: 95 }} className="text-right">Graded Qty</th>
                      <th style={{ width: 95 }} className="text-right">Workout</th>
                      <th style={{ width: 95 }} className="text-right">Yield %</th>
                      <th style={{ width: 95 }} className="text-right">Grading HOSO</th>
                      <th style={{ width: 95 }} className="text-right">Diff (KG)</th>
                      <th style={{ width: 95 }} className="text-right">Diff %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryRows.length === 0 ? (
                      <EmptyRow cols={12} />
                    ) : (
                      summaryRows.map((row, index) => {
                        const key = `${row.batch}_${row.species}_${row.hoso_count}_${row.variety}`;
                        const isSubtotal = row.is_subtotal;
                        const expanded = expandedRows[key];
                        const slNo = isSubtotal ? '' : summaryRows.length - index;

                        return (
                          <React.Fragment key={key + index}>
                            <tr
                              style={{
                                background: isSubtotal ? 'rgba(139,92,246,0.08)' : undefined,
                                fontWeight: isSubtotal ? 800 : undefined,
                              }}
                            >
                              <td className="text-center">{slNo}</td>
                              <td style={{ fontWeight: 700 }}>{row.batch}</td>
                              <td>{row.species}</td>
                              <td className="text-center">{row.hoso_count}</td>
                              <td style={{ color: isSubtotal ? 'var(--corp-rep)' : undefined }}>{row.variety}</td>
                              <td
                                className="text-right text-link"
                                style={{ textDecoration: 'underline', color: 'var(--corp-rep)', cursor: 'pointer', fontWeight: 700 }}
                                onClick={() => !isSubtotal && handleExpand(row, 'hoso')}
                              >
                                {fmt.number(row.hoso_qty)}
                              </td>
                              <td
                                className="text-right text-link"
                                style={{ textDecoration: 'underline', color: 'var(--corp-rep)', cursor: 'pointer', fontWeight: 700 }}
                                onClick={() => !isSubtotal && handleExpand(row, 'graded')}
                              >
                                {fmt.number(row.graded_qty)}
                              </td>
                              <td className="text-right">{fmt.number(row.workout_count)}</td>
                              <td className="text-right" style={{ color: 'var(--corp-rep)', fontWeight: 800 }}>
                                {fmt.pct(row.yield_pct || row.yield_percent)}
                              </td>
                              <td className="text-right">{fmt.number(row.grading_hoso_qty)}</td>
                              <td className="text-right" style={{ fontWeight: 700, color: Number(row.weight_diff_kg) >= 0 ? '#10b981' : '#ef4444' }}>
                                {fmt.number(row.weight_diff_kg)}
                              </td>
                              <td className="text-right" style={{ fontWeight: 700, color: Number(row.weight_diff_kg) >= 0 ? '#10b981' : '#ef4444' }}>
                                {fmt.pct(row.weight_diff_pct)}
                              </td>
                            </tr>
                            {expanded && (
                              <tr>
                                <td colSpan={12} style={{ padding: 12, background: 'var(--input-bg)' }}>
                                  <div style={{ border: '1px solid var(--corp-rep)', borderRadius: 'var(--radius-element)', padding: 10, background: 'var(--surface-panel)' }}>
                                    {expanded.loading && <div style={{ fontSize: 12 }}>Loading breakdown details...</div>}
                                    {expanded.error && <div style={{ fontSize: 12, color: '#ef4444' }}>{expanded.error}</div>}
                                    {expanded.data && expanded.data.length === 0 && (
                                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No breakdown details found.</div>
                                    )}
                                    {expanded.data && expanded.data.length > 0 && (
                                      <table className="bknr-table" style={{ width: '100%', fontSize: 11 }}>
                                        <thead>
                                          <tr style={{ background: 'var(--input-bg)' }}>
                                            {expanded.source === 'hoso' ? (
                                              <>
                                                <th>ID</th><th>Date</th><th>Time</th><th>Location</th><th>Contractor</th><th>HOSO Count</th><th>HOSO Qty</th><th>HLSO Qty</th><th>Yield %</th><th>Rate</th><th>Amount</th>
                                              </>
                                            ) : (
                                              <>
                                                <th>ID</th><th>Date</th><th>Time</th><th>Location</th><th>Production For</th><th>Graded Count</th><th>Quantity (Kg)</th>
                                              </>
                                            )}
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {expanded.data.map(det => (
                                            <tr key={det.id}>
                                              {expanded.source === 'hoso' ? (
                                                <>
                                                  <td className="text-center">{det.id}</td>
                                                  <td className="text-center">{det.date}</td>
                                                  <td className="text-center">{det.time}</td>
                                                  <td>{det.peeling_at}</td>
                                                  <td>{det.contractor}</td>
                                                  <td className="text-center">{det.hoso_count}</td>
                                                  <td className="text-right">{fmt.number(det.hoso_qty)}</td>
                                                  <td className="text-right">{fmt.number(det.hlso_qty)}</td>
                                                  <td className="text-right">{fmt.pct(det.yield_percent)}</td>
                                                  <td className="text-right">{fmt.currency(det.rate_per_kg)}</td>
                                                  <td className="text-right">{fmt.currency(det.amount)}</td>
                                                </>
                                              ) : (
                                                <>
                                                  <td className="text-center">{det.id}</td>
                                                  <td className="text-center">{det.date}</td>
                                                  <td className="text-center">{det.time}</td>
                                                  <td>{det.peeling_at}</td>
                                                  <td>{det.production_for}</td>
                                                  <td className="text-center">{det.graded_count}</td>
                                                  <td className="text-right" style={{ fontWeight: 700 }}>{fmt.number(det.quantity)}</td>
                                                </>
                                              )}
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {activeTab === 'detailed' && (
            <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
              <table className="bknr-table" style={{ minWidth: 1200, width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>ID</th>
                    <th style={{ width: 85 }}>Date</th>
                    <th style={{ width: 65 }}>Time</th>
                    <th style={{ width: 100 }}>Location</th>
                    <th style={{ width: 120 }}>Prod For</th>
                    <th style={{ width: 100 }}>Species</th>
                    <th style={{ width: 95 }}>Batch</th>
                    <th style={{ width: 85 }}>HOSO Count</th>
                    <th style={{ width: 120 }}>Variety</th>
                    <th style={{ width: 85 }}>Graded Count</th>
                    <th style={{ width: 95 }} className="text-right">Quantity (Kg)</th>
                    <th style={{ width: 140 }}>User</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDetailed.length === 0 ? (
                    <EmptyRow cols={12} />
                  ) : (
                    filteredDetailed.map(row => {
                      const isSelected = selectedRow?.id === row.id;
                      return (
                        <tr
                          key={row.id}
                          data-record-id={row.id}
                          onClick={() => {
                            if (!isEditing) {
                              setSelectedRow(row);
                            }
                          }}
                          style={{
                            background: isSelected ? 'rgba(139,92,246,0.08)' : undefined,
                            borderLeft: isSelected ? '3px solid var(--corp-rep)' : undefined,
                            cursor: 'pointer',
                          }}
                        >
                          <td className="text-center">{row.id}</td>
                          <td className="text-center">{row.date}</td>
                          <td className="text-center">{row.time}</td>
                          <td>
                            {isEditing && isSelected ? (
                              <input
                                className="edit-input"
                                value={editData.peeling_at || ''}
                                onChange={e => setEditData({ ...editData, peeling_at: e.target.value })}
                              />
                            ) : (
                              row.peeling_at
                            )}
                          </td>
                          <td>
                            {isEditing && isSelected ? (
                              <input
                                className="edit-input"
                                value={editData.production_for || ''}
                                onChange={e => setEditData({ ...editData, production_for: e.target.value })}
                              />
                            ) : (
                              row.production_for
                            )}
                          </td>
                          <td>
                            {isEditing && isSelected ? (
                              <input
                                className="edit-input"
                                value={editData.species || ''}
                                onChange={e => setEditData({ ...editData, species: e.target.value })}
                              />
                            ) : (
                              row.species
                            )}
                          </td>
                          <td className="text-center" style={{ fontWeight: 700 }}>
                            {isEditing && isSelected ? (
                              <input
                                className="edit-input text-center"
                                value={editData.batch_number || ''}
                                onChange={e => setEditData({ ...editData, batch_number: e.target.value })}
                              />
                            ) : (
                              row.batch_number
                            )}
                          </td>
                          <td className="text-center">
                            {isEditing && isSelected ? (
                              <input
                                className="edit-input text-center"
                                value={editData.hoso_count || ''}
                                onChange={e => setEditData({ ...editData, hoso_count: e.target.value })}
                              />
                            ) : (
                              row.hoso_count
                            )}
                          </td>
                          <td>
                            {isEditing && isSelected ? (
                              <input
                                className="edit-input"
                                value={editData.variety_name || ''}
                                onChange={e => setEditData({ ...editData, variety_name: e.target.value })}
                              />
                            ) : (
                              row.variety_name
                            )}
                          </td>
                          <td className="text-center">
                            {isEditing && isSelected ? (
                              <input
                                className="edit-input text-center"
                                value={editData.graded_count || ''}
                                onChange={e => setEditData({ ...editData, graded_count: e.target.value })}
                              />
                            ) : (
                              row.graded_count
                            )}
                          </td>
                          <td className="text-right" style={{ fontWeight: 700 }}>
                            {isEditing && isSelected ? (
                              <input
                                className="edit-input text-right"
                                type="number"
                                step="0.01"
                                value={editData.quantity || ''}
                                onChange={e => setEditData({ ...editData, quantity: e.target.value })}
                              />
                            ) : (
                              fmt.number(row.quantity)
                            )}
                          </td>
                          <td style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{row.email}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'card' && (
            <div className="cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))', gap: 12, padding: 8 }}>
              {dataRows.map((r, i) => {
                const breakdown = detailedData.filter(d =>
                  String(d.batch_number || d.batch || '').toLowerCase() === String(r.batch || '').toLowerCase() &&
                  String(d.species || '').toLowerCase() === String(r.species || '').toLowerCase() &&
                  String(d.hoso_count || '').toLowerCase() === String(r.hoso_count || '').toLowerCase() &&
                  String(d.variety_name || d.variety || '').toLowerCase() === String(r.variety || '').toLowerCase()
                );

                const diffColor = Number(r.weight_diff_kg) < 0 ? '#ef4444' : '#10b981';

                return (
                  <div
                    key={i}
                    style={{
                      background: 'var(--surface-panel)',
                      border: '1px solid var(--border-light)',
                      borderRadius: 6,
                      boxShadow: 'var(--shadow-soft)',
                      display: 'flex',
                      flexDirection: 'column',
                      borderTop: '3px solid var(--corp-rep)',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ background: 'var(--input-bg)', padding: '10px 12px', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 12 }}>BATCH: {r.batch}</div>
                        <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 800 }}>{r.species} | {r.variety}</div>
                      </div>
                      <div style={{ textAlign: 'right', background: 'rgba(139,92,246,0.1)', padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(139,92,246,0.2)' }}>
                        <span style={{ fontSize: 8, display: 'block', textTransform: 'uppercase', color: 'var(--text-tertiary)', fontWeight: 800 }}>HOSO Count</span>
                        <b style={{ color: 'var(--corp-rep)', fontSize: 12 }}>{r.hoso_count}</b>
                      </div>
                    </div>

                    <div style={{ padding: 12, flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, background: 'var(--input-bg)', padding: '6px 10px', borderRadius: 4 }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Actual HOSO Qty:</span>
                        <b style={{ color: 'var(--text-primary)' }}>{fmt.number(r.hoso_qty)} KG</b>
                      </div>
                      <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--corp-rep)', textTransform: 'uppercase', borderBottom: '1px solid var(--border-light)', paddingBottom: 2 }}>
                        Graded Details Breakdown
                      </div>
                      <table style={{ width: '100%', border: '1px solid var(--border-light)', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead>
                          <tr style={{ background: 'var(--input-bg)' }}>
                            <th style={{ border: '1px solid var(--border-light)', padding: 4 }}>Count</th>
                            <th style={{ border: '1px solid var(--border-light)', padding: 4 }}>Quantity</th>
                          </tr>
                        </thead>
                        <tbody>
                          {breakdown.length === 0 ? (
                            <tr>
                              <td colSpan={2} style={{ padding: 6, textAlign: 'center', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                                No breakdown details available
                              </td>
                            </tr>
                          ) : (
                            breakdown.map((bRow, bi) => (
                              <tr key={bi}>
                                <td style={{ border: '1px solid var(--border-light)', padding: 4, textAlign: 'center' }}>{bRow.graded_count}</td>
                                <td style={{ border: '1px solid var(--border-light)', padding: 4, textAlign: 'center', fontWeight: 700, color: 'var(--corp-rep)' }}>{fmt.number(bRow.quantity)} KG</td>
                              </tr>
                            ))
                          )}
                          {breakdown.length > 0 && (
                            <tr style={{ background: 'var(--input-bg)', fontWeight: 800 }}>
                              <td style={{ border: '1px solid var(--border-light)', padding: 4, textAlign: 'right' }}>Total:</td>
                              <td style={{ border: '1px solid var(--border-light)', padding: 4, textAlign: 'center' }}>
                                {fmt.number(breakdown.reduce((s, d) => s + Number(d.quantity || 0), 0))} KG
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ background: 'var(--input-bg)', padding: '8px 12px', borderTop: '1px solid var(--border-light)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 10 }}>
                      <div>Workout: <b>{r.workout_count}</b></div>
                      <div>Yield: <b>{fmt.pct(r.yield_pct || r.yield_percent)}</b></div>
                      <div>Grading HOSO: <b>{fmt.number(r.grading_hoso_qty)}</b></div>
                      <div>Diff: <b style={{ color: diffColor }}>{fmt.number(r.weight_diff_kg)} ({fmt.pct(r.weight_diff_pct)})</b></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}



      <ConfirmModal
        isOpen={confirmModalOpen && confirmAction === 'cancel'}
        title="Cancel Record"
        message="Cancel this record? Its audit history will be preserved."
        onConfirm={handleCancel}
        onClose={() => setConfirmModalOpen(false)}
      />

      <AuditDrawer
        isOpen={auditOpen}
        onClose={() => setAuditOpen(false)}
        auditUrl={`${activeRoute}/audit`}
      />
    </div>
  );
}
