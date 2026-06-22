/**
 * ProductionReport.jsx – Finished Goods Production Summary
 */
import React, { useState } from 'react';
import {
  ReportHeader, FilterBar, FilterBox, FilterSelect, FilterInput,
  KPIGrid, KPICard, Loader, ErrorBox, SearchInput, EmptyRow,
  FinYearSelect, useReport, fmt, ConfirmModal, AuditDrawer, RowActionMenu, InlineSearchableSelect
} from './ReportShell';

export default function ProductionReport({ activeRoute }) {
  const [fy, setFy] = useState('');
  const [month, setMonth] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [brand, setBrand] = useState('');
  const [variety, setVariety] = useState('');
  const [freezer, setFreezer] = useState('');
  const [prodType, setProdType] = useState('');
  const [prodFor, setProdFor] = useState('');
  const [search, setSearch] = useState('');
  const [view, setView] = useState('summary'); // 'summary' | 'detail'

  // Editing & Dialogs state
  const [selectedRow, setSelectedRow] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [auditOpen, setAuditOpen] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  const params = {};
  if (fy) params.fy = fy;
  if (fromDate) params.from_date = fromDate;
  if (toDate) params.to_date = toDate;

  const { data, loading, error, reload } = useReport({
    url: activeRoute,
    params,
    deps: [fy, fromDate, toDate],
  });

  const rawSummaryRows = data?.summary_rows || [];
  const rawDetailRows = data?.detail_rows || [];
  const summarySubtotals = data?.summary_subtotals || {};
  const detailSubtotals = data?.detail_subtotals || {};

  // Filtering function
  const filterRows = (rows) => {
    return rows.filter(r => {
      if (month && !(r.date || '').startsWith(month)) return false;
      if (fromDate && r.date < fromDate) return false;
      if (toDate && r.date > toDate) return false;
      if (brand && r.brand !== brand) return false;
      if (variety && r.variety_name !== variety) return false;
      if (freezer && r.freezer !== freezer) return false;
      if (prodType && r.production_type !== prodType) return false;
      if (prodFor && r.production_for !== prodFor) return false;
      if (search) {
        const q = search.toLowerCase();
        const match = Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q));
        if (!match) return false;
      }
      return true;
    });
  };

  const summaryRows = filterRows(rawSummaryRows);
  const detailRows = filterRows(rawDetailRows);

  // Extract unique filter dropdown lists
  const uniqueBrands = Array.from(new Set(rawSummaryRows.map(r => r.brand).filter(Boolean))).sort();
  const uniqueVarieties = Array.from(new Set(rawSummaryRows.map(r => r.variety_name).filter(Boolean))).sort();
  const uniqueFreezers = Array.from(new Set(rawSummaryRows.map(r => r.freezer).filter(Boolean))).sort();
  const uniqueTypes = Array.from(new Set(rawSummaryRows.map(r => r.production_type).filter(Boolean))).sort();
  const uniqueProductions = Array.from(new Set(rawSummaryRows.map(r => r.production_for).filter(Boolean))).sort();

  // KPIS
  const totalMC = summaryRows.reduce((s, r) => s + Number(r.no_of_mc || 0), 0);
  const totalQty = summaryRows.reduce((s, r) => s + Number(r.production_qty || 0), 0);

  const getExportUrl = (type) => {
    const pf = localStorage.getItem('production_for_filter') || '';
    const loc = localStorage.getItem('plant_location_filter') || '';
    let url = `${activeRoute}/export_${type}?fy=${fy}`;
    if (pf) url += `&production_for=${encodeURIComponent(pf)}`;
    if (loc) url += `&location=${encodeURIComponent(loc)}`;
    return url;
  };

  const handleEdit = () => {
    if (!selectedRow) return alert('Select a row first!');
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
        setIsEditing(false);
        setSelectedRow(null);
        reload();
      } else {
        alert('Update Failed!');
      }
    } catch (err) {
      alert('Error saving changes');
    }
  };

  const handleDelete = async () => {
    if (!selectedRow) return;
    try {
      const res = await fetch(`${activeRoute}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedRow.id }),
      });
      if (res.ok) {
        setSelectedRow(null);
        setConfirmModalOpen(false);
        reload();
      } else {
        alert('Delete Failed!');
      }
    } catch (err) {
      alert('Error deleting row');
    }
  };

  const menuActions = [
    { label: 'Edit Selected Row', onClick: handleEdit, disabled: !selectedRow || isEditing },
    { label: 'Save Changes', onClick: handleSave, disabled: !isEditing },
    { label: 'View Audit History', onClick: () => setAuditOpen(true) },
    { divider: true },
    { header: 'Export Options' },
    { label: 'Print Current View', onClick: () => window.print() },
    { label: 'Download PDF Report', onClick: () => { window.location.href = getExportUrl('pdf'); } },
    { label: 'Export Excel Filtered', onClick: () => { window.location.href = getExportUrl('xlsx'); } },
    { divider: true },
    { label: 'Delete Selected Row', onClick: () => { setConfirmAction('delete'); setConfirmModalOpen(true); }, danger: true, disabled: !selectedRow }
  ];

  const renderSummaryRows = () => {
    const result = [];
    let lastKey = null;

    summaryRows.forEach((r, idx) => {
      const currentKey = `${r.production_at || ''}|${r.production_for || ''}|${r.batch_number || ''}|${r.variety_name || ''}|${r.grade || ''}`;

      if (lastKey && lastKey !== currentKey) {
        const s = summarySubtotals[lastKey];
        if (s) {
          result.push(
            <tr key={`sub-${lastKey}-${idx}`} className="subtotal-row" style={{ background: '#f8fafc', fontWeight: 800 }}>
              <td colSpan={14} style={{ textAlign: 'right', fontWeight: 800 }}>GROUP SUBTOTAL:</td>
              <td className="text-right">{s.mc}</td>
              <td className="text-right">{s.loose}</td>
              <td className="text-right" style={{ color: 'var(--corp-rep)' }}>{fmt.number(s.prod_qty)}</td>
              <td className="text-center" style={{ color: Number(s.diff_yield_perc) < 0 ? '#ef4444' : '#10b981' }}>{s.actual_yield}% ({s.diff_yield_perc}%)</td>
              <td className="text-right" style={{ color: Number(s.diff_qty) < 0 ? '#ef4444' : '#10b981' }}>{s.diff_qty}</td>
              <td style={{ textTransform: 'none', fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'left', paddingLeft: 4 }}>
                In: {s.soaking_in} | Trg: {s.target_yield}%
              </td>
            </tr>
          );
        }
      }

      const isSelected = selectedRow?.id === r.id;
      const slNo = summaryRows.length - idx;
      result.push(
        <tr
          key={r.id}
          onClick={() => {
            if (!isEditing) setSelectedRow(r);
          }}
          style={{
            background: isSelected ? 'rgba(139,92,246,0.08)' : undefined,
            borderLeft: isSelected ? '3px solid var(--corp-rep)' : undefined,
            cursor: 'pointer',
          }}
        >
          <td className="text-center">{slNo}</td>
          <td className="text-center">{r.date}</td>
          <td className="text-center">{r.time}</td>
          <td>
            {isEditing && isSelected ? (
              <InlineSearchableSelect
                value={editData.production_at}
                onChange={val => setEditData({ ...editData, production_at: val })}
                options={data?.prod_at_list || []}
              />
            ) : (
              r.production_at
            )}
          </td>
          <td>
            {isEditing && isSelected ? (
              <InlineSearchableSelect
                value={editData.production_for}
                onChange={val => setEditData({ ...editData, production_for: val })}
                options={data?.prod_for_list || []}
              />
            ) : (
              r.production_for
            )}
          </td>
          <td>
            {isEditing && isSelected ? (
              <InlineSearchableSelect
                value={editData.production_type}
                onChange={val => setEditData({ ...editData, production_type: val })}
                options={data?.prod_types_list || []}
              />
            ) : (
              r.production_type
            )}
          </td>
          <td>
            {isEditing && isSelected ? (
              <InlineSearchableSelect
                value={editData.species}
                onChange={val => setEditData({ ...editData, species: val })}
                options={data?.species_list || []}
              />
            ) : (
              r.species
            )}
          </td>
          <td className="text-center" style={{ fontWeight: 700 }}>
            {isEditing && isSelected ? (
              <input
                className="edit-input"
                value={editData.batch_number || ''}
                onChange={e => setEditData({ ...editData, batch_number: e.target.value })}
              />
            ) : (
              r.batch_number
            )}
          </td>
          <td>
            {isEditing && isSelected ? (
              <InlineSearchableSelect
                value={editData.brand}
                onChange={val => setEditData({ ...editData, brand: val })}
                options={data?.brands_list || []}
              />
            ) : (
              r.brand
            )}
          </td>
          <td>
            {isEditing && isSelected ? (
              <InlineSearchableSelect
                value={editData.variety_name}
                onChange={val => setEditData({ ...editData, variety_name: val })}
                options={data?.varieties_list || []}
              />
            ) : (
              r.variety_name
            )}
          </td>
          <td className="text-center">
            {isEditing && isSelected ? (
              <InlineSearchableSelect
                value={editData.glaze}
                onChange={val => setEditData({ ...editData, glaze: val })}
                options={data?.glazes_list || []}
              />
            ) : (
              r.glaze
            )}
          </td>
          <td>
            {isEditing && isSelected ? (
              <InlineSearchableSelect
                value={editData.freezer}
                onChange={val => setEditData({ ...editData, freezer: val })}
                options={data?.freezers_list || []}
              />
            ) : (
              r.freezer
            )}
          </td>
          <td>
            {isEditing && isSelected ? (
              <InlineSearchableSelect
                value={editData.packing_style}
                onChange={val => setEditData({ ...editData, packing_style: val })}
                options={data?.packing_styles_list || []}
              />
            ) : (
              r.packing_style
            )}
          </td>
          <td className="text-center">
            {isEditing && isSelected ? (
              <InlineSearchableSelect
                value={editData.grade}
                onChange={val => setEditData({ ...editData, grade: val })}
                options={data?.grades_list || []}
              />
            ) : (
              r.grade
            )}
          </td>
          <td className="text-right">
            {isEditing && isSelected ? (
              <input
                className="edit-input text-right"
                type="number"
                value={editData.no_of_mc || ''}
                onChange={e => setEditData({ ...editData, no_of_mc: e.target.value })}
              />
            ) : (
              r.no_of_mc
            )}
          </td>
          <td className="text-right">
            {isEditing && isSelected ? (
              <input
                className="edit-input text-right"
                type="number"
                value={editData.loose || ''}
                onChange={e => setEditData({ ...editData, loose: e.target.value })}
              />
            ) : (
              r.loose
            )}
          </td>
          <td className="text-right calc-cell" style={{ background: 'var(--input-bg)', fontWeight: 700 }}>
            {fmt.number(r.production_qty)}
          </td>
          <td className="text-center">-</td>
          <td className="text-center">-</td>
          <td style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{r.email?.split('@')[0]}</td>
        </tr>
      );

      lastKey = currentKey;

      if (idx === summaryRows.length - 1) {
        const s = summarySubtotals[currentKey];
        if (s) {
          result.push(
            <tr key={`sub-last`} className="subtotal-row" style={{ background: '#f8fafc', fontWeight: 800 }}>
              <td colSpan={14} style={{ textAlign: 'right', fontWeight: 800 }}>GROUP SUBTOTAL:</td>
              <td className="text-right">{s.mc}</td>
              <td className="text-right">{s.loose}</td>
              <td className="text-right" style={{ color: 'var(--corp-rep)' }}>{fmt.number(s.prod_qty)}</td>
              <td className="text-center" style={{ color: Number(s.diff_yield_perc) < 0 ? '#ef4444' : '#10b981' }}>{s.actual_yield}% ({s.diff_yield_perc}%)</td>
              <td className="text-right" style={{ color: Number(s.diff_qty) < 0 ? '#ef4444' : '#10b981' }}>{s.diff_qty}</td>
              <td style={{ textTransform: 'none', fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'left', paddingLeft: 4 }}>
                In: {s.soaking_in} | Trg: {s.target_yield}%
              </td>
            </tr>
          );
        }
      }
    });

    return result;
  };

  const renderDetailedRows = () => {
    const result = [];
    let lastDate = null;

    detailRows.forEach((r, idx) => {
      if (lastDate && r.date !== lastDate) {
        const s = detailSubtotals[lastDate];
        if (s) {
          result.push(
            <tr key={`sub-det-${lastDate}-${idx}`} className="subtotal-row" style={{ background: 'rgba(59,130,246,0.06)', fontWeight: 800 }}>
              <td colSpan={14} style={{ textAlign: 'right', fontWeight: 800 }}>DATE SUBTOTAL ({lastDate}):</td>
              <td className="text-right">{s.mc}</td>
              <td className="text-right">{s.loose}</td>
              <td className="text-right" style={{ color: 'var(--corp-rep)' }}>{fmt.number(s.prod_qty)}</td>
              <td></td>
            </tr>
          );
        }
      }

      const isSelected = selectedRow?.id === r.id;
      const slNo = detailRows.length - idx;
      result.push(
        <tr
          key={r.id}
          onClick={() => {
            if (!isEditing) setSelectedRow(r);
          }}
          style={{
            background: isSelected ? 'rgba(139,92,246,0.08)' : undefined,
            borderLeft: isSelected ? '3px solid var(--corp-rep)' : undefined,
            cursor: 'pointer',
          }}
        >
          <td className="text-center">{slNo}</td>
          <td className="text-center">{r.date}</td>
          <td className="text-center">{r.time}</td>
          <td>
            {isEditing && isSelected ? (
              <InlineSearchableSelect
                value={editData.production_at}
                onChange={val => setEditData({ ...editData, production_at: val })}
                options={data?.prod_at_list || []}
              />
            ) : (
              r.production_at
            )}
          </td>
          <td>
            {isEditing && isSelected ? (
              <InlineSearchableSelect
                value={editData.production_for}
                onChange={val => setEditData({ ...editData, production_for: val })}
                options={data?.prod_for_list || []}
              />
            ) : (
              r.production_for
            )}
          </td>
          <td>
            {isEditing && isSelected ? (
              <InlineSearchableSelect
                value={editData.production_type}
                onChange={val => setEditData({ ...editData, production_type: val })}
                options={data?.prod_types_list || []}
              />
            ) : (
              r.production_type
            )}
          </td>
          <td>
            {isEditing && isSelected ? (
              <InlineSearchableSelect
                value={editData.species}
                onChange={val => setEditData({ ...editData, species: val })}
                options={data?.species_list || []}
              />
            ) : (
              r.species
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
              r.batch_number
            )}
          </td>
          <td>
            {isEditing && isSelected ? (
              <InlineSearchableSelect
                value={editData.brand}
                onChange={val => setEditData({ ...editData, brand: val })}
                options={data?.brands_list || []}
              />
            ) : (
              r.brand
            )}
          </td>
          <td>
            {isEditing && isSelected ? (
              <InlineSearchableSelect
                value={editData.variety_name}
                onChange={val => setEditData({ ...editData, variety_name: val })}
                options={data?.varieties_list || []}
              />
            ) : (
              r.variety_name
            )}
          </td>
          <td className="text-center">
            {isEditing && isSelected ? (
              <InlineSearchableSelect
                value={editData.glaze}
                onChange={val => setEditData({ ...editData, glaze: val })}
                options={data?.glazes_list || []}
              />
            ) : (
              r.glaze
            )}
          </td>
          <td>
            {isEditing && isSelected ? (
              <InlineSearchableSelect
                value={editData.freezer}
                onChange={val => setEditData({ ...editData, freezer: val })}
                options={data?.freezers_list || []}
              />
            ) : (
              r.freezer
            )}
          </td>
          <td>
            {isEditing && isSelected ? (
              <InlineSearchableSelect
                value={editData.packing_style}
                onChange={val => setEditData({ ...editData, packing_style: val })}
                options={data?.packing_styles_list || []}
              />
            ) : (
              r.packing_style
            )}
          </td>
          <td className="text-center">
            {isEditing && isSelected ? (
              <InlineSearchableSelect
                value={editData.grade}
                onChange={val => setEditData({ ...editData, grade: val })}
                options={data?.grades_list || []}
              />
            ) : (
              r.grade
            )}
          </td>
          <td className="text-right">
            {isEditing && isSelected ? (
              <input
                className="edit-input text-right"
                type="number"
                value={editData.no_of_mc || ''}
                onChange={e => setEditData({ ...editData, no_of_mc: e.target.value })}
              />
            ) : (
              r.no_of_mc
            )}
          </td>
          <td className="text-right">
            {isEditing && isSelected ? (
              <input
                className="edit-input text-right"
                type="number"
                value={editData.loose || ''}
                onChange={e => setEditData({ ...editData, loose: e.target.value })}
              />
            ) : (
              r.loose
            )}
          </td>
          <td className="text-right calc-cell" style={{ background: 'var(--input-bg)', fontWeight: 700 }}>
            {fmt.number(r.production_qty)}
          </td>
          <td style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{r.email?.split('@')[0]}</td>
        </tr>
      );

      lastDate = r.date;

      if (idx === detailRows.length - 1) {
        const s = detailSubtotals[lastDate];
        if (s) {
          result.push(
            <tr key={`sub-det-last`} className="subtotal-row" style={{ background: 'rgba(59,130,246,0.06)', fontWeight: 800 }}>
              <td colSpan={14} style={{ textAlign: 'right', fontWeight: 800 }}>DATE SUBTOTAL ({lastDate}):</td>
              <td className="text-right">{s.mc}</td>
              <td className="text-right">{s.loose}</td>
              <td className="text-right" style={{ color: 'var(--corp-rep)' }}>{fmt.number(s.prod_qty)}</td>
              <td></td>
            </tr>
          );
        }
      }
    });

    return result;
  };

  return (
    <div className="report-viewer-card">
      <ReportHeader
        title="Finished Goods Production Summary"
        loading={loading}
        onReload={reload}
        exportUrl={fy ? getExportUrl('xlsx') : null}
      />

      <FilterBar>
        <FilterBox label="Financial Year">
          <FinYearSelect value={fy} onChange={setFy} list={data?.financial_years} />
        </FilterBox>
        <FilterBox label="Month View">
          <FilterInput type="month" value={month} onChange={setMonth} />
        </FilterBox>
        <FilterBox label="From Date">
          <FilterInput type="date" value={fromDate} onChange={setFromDate} />
        </FilterBox>
        <FilterBox label="To Date">
          <FilterInput type="date" value={toDate} onChange={setToDate} />
        </FilterBox>
        <FilterBox label="Brand">
          <FilterSelect value={brand} onChange={setBrand}>
            <option value="">ALL BRANDS</option>
            {uniqueBrands.map(b => <option key={b} value={b}>{b}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Variety">
          <FilterSelect value={variety} onChange={setVariety}>
            <option value="">ALL VARIETIES</option>
            {uniqueVarieties.map(v => <option key={v} value={v}>{v}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Freezer">
          <FilterSelect value={freezer} onChange={setFreezer}>
            <option value="">ALL FREEZERS</option>
            {uniqueFreezers.map(f => <option key={f} value={f}>{f}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Prod Type">
          <FilterSelect value={prodType} onChange={setProdType}>
            <option value="">ALL TYPES</option>
            {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Prod For">
          <FilterSelect value={prodFor} onChange={setProdFor}>
            <option value="">ALL PRODUCTION</option>
            {uniqueProductions.map(p => <option key={p} value={p}>{p}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Search">
          <SearchInput value={search} onChange={setSearch} />
        </FilterBox>
      </FilterBar>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {['summary', 'detail'].map(t => (
          <button
            key={t}
            onClick={() => {
              setView(t);
              setSelectedRow(null);
              setIsEditing(false);
            }}
            style={{
              padding: '8px 18px',
              fontSize: 11,
              fontWeight: 800,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              textTransform: 'uppercase',
              background: view === t ? 'var(--corp-rep)' : 'var(--input-bg)',
              color: view === t ? '#fff' : 'var(--text-secondary)',
            }}
          >
            {t === 'summary' ? 'Subtotal Summary' : 'Detailed Production'}
          </button>
        ))}
      </div>

      <div className="actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div id="rowCount" style={{ fontSize: 12, fontWeight: 700, color: 'var(--corp-rep)' }}>
          {view === 'summary' ? summaryRows.length : detailRows.length} rows found
        </div>
        <RowActionMenu actions={menuActions} />
      </div>

      {loading && <Loader />}
      {error && <ErrorBox msg={error} onRetry={reload} />}

      {!loading && !error && data && (
        <>
          <KPIGrid>
            <KPICard label="Total MC Slabs" value={fmt.number(totalMC)} accent="var(--corp-dash)" />
            <KPICard label="Total Net Weight (Kg)" value={fmt.number(totalQty)} accent="var(--corp-ops)" />
            <KPICard label="Records" value={summaryRows.length} accent="var(--corp-rep)" />
          </KPIGrid>

          <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table className="bknr-table" style={{ minWidth: 1400, width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th style={{ width: 80 }}>Date</th>
                  <th style={{ width: 65 }}>Time</th>
                  <th style={{ width: 100 }}>Prod At</th>
                  <th style={{ width: 100 }}>Prod For</th>
                  <th style={{ width: 100 }}>Prod Type</th>
                  <th style={{ width: 100 }}>Species</th>
                  <th style={{ width: 95 }}>Batch No</th>
                  <th style={{ width: 95 }}>Brand</th>
                  <th style={{ width: 110 }}>Variety</th>
                  <th style={{ width: 65 }}>Glaze</th>
                  <th style={{ width: 85 }}>Freezer</th>
                  <th style={{ width: 120 }}>Packing Style</th>
                  <th style={{ width: 80 }}>Grade</th>
                  <th style={{ width: 60 }} className="text-right">MC</th>
                  <th style={{ width: 60 }} className="text-right">Loose</th>
                  <th style={{ width: 90 }} className="text-right">Prod Qty</th>
                  {view === 'summary' ? (
                    <>
                      <th style={{ width: 95 }} className="text-right">Yield %</th>
                      <th style={{ width: 85 }} className="text-right">Diff Qty</th>
                    </>
                  ) : null}
                  <th style={{ width: 120 }}>User</th>
                </tr>
              </thead>
              <tbody>
                {view === 'summary' ? (
                  summaryRows.length === 0 ? <EmptyRow cols={20} /> : renderSummaryRows()
                ) : (
                  detailRows.length === 0 ? <EmptyRow cols={18} /> : renderDetailedRows()
                )}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 800 }}>
                  <td colSpan={14} style={{ textAlign: 'right', fontWeight: 800 }}>PAGE TOTALS:</td>
                  <td className="text-right">{fmt.number(totalMC)}</td>
                  <td className="text-right">
                    {fmt.number((view === 'summary' ? summaryRows : detailRows).reduce((s, r) => s + Number(r.loose || 0), 0))}
                  </td>
                  <td className="text-right">{fmt.number(totalQty)}</td>
                  {view === 'summary' ? <td colSpan={2}></td> : null}
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {!loading && !data && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-tertiary)' }}>
          Select a <strong>Financial Year</strong> or date range to load Production data.
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModalOpen && confirmAction === 'delete'}
        title="Delete Record"
        message="Delete this record permanently?"
        onConfirm={handleDelete}
        onClose={() => setConfirmModalOpen(false)}
      />

      <AuditDrawer
        isOpen={auditOpen}
        onClose={() => setAuditOpen(false)}
        auditUrl={`${activeRoute}/audit_all`}
      />
    </div>
  );
}
