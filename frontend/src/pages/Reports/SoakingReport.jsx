/**
 * SoakingReport.jsx – Chemical Soaking Treatment Logs
 */
import React, { useState } from 'react';
import {
  ReportHeader, FilterBar, FilterBox, FilterSelect, FilterInput,
  KPIGrid, KPICard, Loader, ErrorBox, SearchInput, EmptyRow,
  FinYearSelect, useReport, fmt, ConfirmModal, AuditDrawer, RowActionMenu, InlineSearchableSelect
} from './ReportShell';

export default function SoakingReport({ activeRoute }) {
  const [fy, setFy] = useState('');
  const [month, setMonth] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [status, setStatus] = useState('');
  const [batch, setBatch] = useState('');
  const [variety, setVariety] = useState('');
  const [location, setLocation] = useState('');
  const [production, setProduction] = useState('');
  const [search, setSearch] = useState('');

  // Editing & Dialogs state
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

  const rawRows = data?.rows || [];

  // Filtering
  const filteredRows = rawRows.filter(r => {
    if (month && !(r.date || '').startsWith(month)) return false;
    if (fromDate && r.date < fromDate) return false;
    if (toDate && r.date > toDate) return false;
    if (status && (r.status || '').toLowerCase() !== status.toLowerCase()) return false;
    if (batch && r.batch_number !== batch) return false;
    if (variety && r.variety_name !== variety) return false;
    if (location && r.production_at !== location) return false;
    if (production && r.production_for !== production) return false;
    if (search) {
      const q = search.toLowerCase();
      const match = Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  // Unique options for selectors
  const uniqueBatches = Array.from(new Set(rawRows.map(r => r.batch_number).filter(Boolean))).sort();
  const uniqueVarieties = Array.from(new Set(rawRows.map(r => r.variety_name).filter(Boolean))).sort();
  const uniqueLocations = Array.from(new Set(rawRows.map(r => r.production_at).filter(Boolean))).sort();
  const uniqueProductions = Array.from(new Set(rawRows.map(r => r.production_for).filter(Boolean))).sort();

  // Calculations
  const totalInQty = filteredRows.reduce((s, r) => s + Number(r.in_qty || 0), 0);
  const totalChemQty = filteredRows.reduce((s, r) => s + Number(r.chemical_qty || 0), 0);
  const totalSaltQty = filteredRows.reduce((s, r) => s + Number(r.salt_qty || 0), 0);

  const totalGain = filteredRows.reduce((s, r) => s + Number(r.gain_percent || 0), 0);
  const avgGain = filteredRows.length > 0 ? (totalGain / filteredRows.length) : 0;

  const handleEdit = () => {
    if (!selectedRow) return alert('Select a row first!');
    setEditData({ ...selectedRow });
    setIsEditing(true);
  };

  const handleEditChange = (field, val) => {
    const updated = { ...editData, [field]: val };
    if (field === 'in_qty' || field === 'chemical_percent' || field === 'salt_percent') {
      const inQty = Number(updated.in_qty || 0);
      const chemPercent = Number(updated.chemical_percent || 0);
      const saltPercent = Number(updated.salt_percent || 0);

      updated.chemical_qty = (inQty * chemPercent) / 100;
      updated.salt_qty = (inQty * saltPercent) / 100;
    }
    setEditData(updated);
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

  const getExportUrl = () => {
    const ids = filteredRows.map(r => r.id).join(',');
    return `${activeRoute}/export_excel?ids=${ids}&fy=${fy}`;
  };

  const menuActions = [
    { label: 'Edit Selected Row', onClick: handleEdit, disabled: !selectedRow || isEditing },
    { label: 'Save Changes', onClick: handleSave, disabled: !isEditing },
    { label: 'View Audit History', onClick: () => setAuditOpen(true) },
    { divider: true },
    { header: 'Export Options' },
    { label: 'Print Table', onClick: () => window.print() },
    { label: 'Export Excel Filtered', onClick: () => { window.location.href = getExportUrl(); } },
    { divider: true },
    { label: 'Delete Selected Row', onClick: () => { setConfirmAction('delete'); setConfirmModalOpen(true); }, danger: true, disabled: !selectedRow }
  ];

  const getStatusBadgeStyle = (statusStr) => {
    const s = String(statusStr || '').toLowerCase();
    if (s === 'completed') return { background: '#dcfce7', color: '#166534', padding: '3px 6px', borderRadius: 4, fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase' };
    if (s === 'processing') return { background: '#dbeafe', color: '#1e40af', padding: '3px 6px', borderRadius: 4, fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase' };
    return { background: '#fef3c7', color: '#92400e', padding: '3px 6px', borderRadius: 4, fontSize: 8.5, fontWeight: 800, textTransform: 'uppercase' };
  };

  return (
    <div className="report-viewer-card">
      <ReportHeader
        title="Chemical Soaking Treatment Logs"
        subtitle={`${filteredRows.length} entries loaded${fy ? ` — FY ${fy}–${Number(fy)+1}` : ''}`}
        loading={loading}
        onReload={reload}
        exportUrl={fy ? getExportUrl() : null}
      />

      <FilterBar>
        <FilterBox label="Financial Year">
          <FinYearSelect value={fy} onChange={setFy} list={data?.financial_years} />
        </FilterBox>
        <FilterBox label="Month View">
          <FilterInput type="month" value={month} onChange={setMonth} />
        </FilterBox>
        <FilterBox label="From">
          <FilterInput type="date" value={fromDate} onChange={setFromDate} />
        </FilterBox>
        <FilterBox label="To">
          <FilterInput type="date" value={toDate} onChange={setToDate} />
        </FilterBox>
        <FilterBox label="Status">
          <FilterSelect value={status} onChange={setStatus}>
            <option value="">ALL STATUS</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Batch">
          <FilterSelect value={batch} onChange={setBatch}>
            <option value="">ALL BATCHES</option>
            {uniqueBatches.map(b => <option key={b} value={b}>{b}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Variety">
          <FilterSelect value={variety} onChange={setVariety}>
            <option value="">ALL VARIETIES</option>
            {uniqueVarieties.map(v => <option key={v} value={v}>{v}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Location">
          <FilterSelect value={location} onChange={setLocation}>
            <option value="">ALL LOCATIONS</option>
            {uniqueLocations.map(l => <option key={l} value={l}>{l}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Prod For">
          <FilterSelect value={production} onChange={setProduction}>
            <option value="">ALL PRODUCTION</option>
            {uniqueProductions.map(p => <option key={p} value={p}>{p}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Search">
          <SearchInput value={search} onChange={setSearch} />
        </FilterBox>
      </FilterBar>

      <div className="actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div id="rowCount" style={{ fontSize: 12, fontWeight: 700, color: 'var(--corp-rep)' }}>
          {filteredRows.length} rows found
        </div>
        <RowActionMenu actions={menuActions} />
      </div>

      {loading && <Loader />}
      {error && <ErrorBox msg={error} onRetry={reload} />}

      {!loading && !error && fy && (
        <>
          <KPIGrid>
            <KPICard label="Soaking Batches" value={filteredRows.length} accent="var(--corp-dash)" />
            <KPICard label="Total In Qty (Kg)" value={fmt.number(totalInQty)} accent="var(--corp-ops)" />
            <KPICard label="Total Chemical (Kg)" value={fmt.number(totalChemQty)} accent="var(--corp-rep)" />
            <KPICard label="Total Salt (Kg)" value={fmt.number(totalSaltQty)} accent="var(--corp-fin)" />
          </KPIGrid>

          <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table className="bknr-table" style={{ minWidth: 1550, width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th style={{ width: 80 }}>Date</th>
                  <th style={{ width: 90 }}>Sintex No</th>
                  <th style={{ width: 90 }}>Batch No</th>
                  <th style={{ width: 110 }}>Variety</th>
                  <th style={{ width: 85 }}>In Qty</th>
                  <th style={{ width: 75 }}>Rej Qty</th>
                  <th style={{ width: 90 }}>Rej For</th>
                  <th style={{ width: 110 }}>Chem Name</th>
                  <th style={{ width: 65 }}>Chem %</th>
                  <th style={{ width: 75 }}>Chem Kg</th>
                  <th style={{ width: 65 }}>Salt %</th>
                  <th style={{ width: 75 }}>Salt Kg</th>
                  <th style={{ width: 110 }}>Soaking At</th>
                  <th style={{ width: 95 }}>Status</th>
                  <th style={{ width: 110 }}>Prod For</th>
                  <th style={{ width: 140 }}>User</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <EmptyRow cols={17} />
                ) : (
                  filteredRows.map((row, index) => {
                    const isSelected = selectedRow?.id === row.id;
                    const slNo = filteredRows.length - index;

                    // Computed values
                    const inQtyVal = isEditing && isSelected ? Number(editData.in_qty || 0) : Number(row.in_qty || 0);
                    const chemPercentVal = isEditing && isSelected ? Number(editData.chemical_percent || 0) : Number(row.chemical_percent || 0);
                    const saltPercentVal = isEditing && isSelected ? Number(editData.salt_percent || 0) : Number(row.salt_percent || 0);

                    const chemQty = (inQtyVal * chemPercentVal) / 100;
                    const saltQty = (inQtyVal * saltPercentVal) / 100;

                    return (
                      <tr
                        key={row.id}
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
                        <td className="text-center">{slNo}</td>
                        <td className="text-center">{row.date}</td>
                        <td className="text-center">
                          {isEditing && isSelected ? (
                            <input
                              className="edit-input text-center"
                              value={editData.sintex_number || ''}
                              onChange={e => handleEditChange('sintex_number', e.target.value)}
                            />
                          ) : (
                            row.sintex_number
                          )}
                        </td>
                        <td className="text-center" style={{ fontWeight: 700 }}>
                          {isEditing && isSelected ? (
                            <input
                              className="edit-input text-center"
                              value={editData.batch_number || ''}
                              onChange={e => handleEditChange('batch_number', e.target.value)}
                            />
                          ) : (
                            row.batch_number
                          )}
                        </td>
                        <td>
                          {isEditing && isSelected ? (
                            <InlineSearchableSelect
                              value={editData.variety_name}
                              onChange={val => handleEditChange('variety_name', val)}
                              options={uniqueVarieties}
                            />
                          ) : (
                            row.variety_name
                          )}
                        </td>
                        <td className="text-right">
                          {isEditing && isSelected ? (
                            <input
                              className="edit-input text-right"
                              type="number"
                              value={editData.in_qty || ''}
                              onChange={e => handleEditChange('in_qty', e.target.value)}
                            />
                          ) : (
                            fmt.number(row.in_qty)
                          )}
                        </td>
                        <td className="text-right">
                          {isEditing && isSelected ? (
                            <input
                              className="edit-input text-right"
                              type="number"
                              value={editData.rejection_qty || ''}
                              onChange={e => handleEditChange('rejection_qty', e.target.value)}
                            />
                          ) : (
                            fmt.number(row.rejection_qty)
                          )}
                        </td>
                        <td>
                          {isEditing && isSelected ? (
                            <input
                              className="edit-input"
                              value={editData.rejection_for || ''}
                              onChange={e => handleEditChange('rejection_for', e.target.value)}
                            />
                          ) : (
                            row.rejection_for
                          )}
                        </td>
                        <td>
                          {isEditing && isSelected ? (
                            <input
                              className="edit-input"
                              value={editData.chemical_name || ''}
                              onChange={e => handleEditChange('chemical_name', e.target.value)}
                            />
                          ) : (
                            row.chemical_name
                          )}
                        </td>
                        <td className="text-right">
                          {isEditing && isSelected ? (
                            <input
                              className="edit-input text-right"
                              type="number"
                              value={editData.chemical_percent || ''}
                              onChange={e => handleEditChange('chemical_percent', e.target.value)}
                            />
                          ) : (
                            fmt.pct(row.chemical_percent)
                          )}
                        </td>
                        <td className="text-right calc-cell" style={{ fontWeight: 700, background: 'var(--input-bg)' }}>
                          {fmt.number(chemQty)}
                        </td>
                        <td className="text-right">
                          {isEditing && isSelected ? (
                            <input
                              className="edit-input text-right"
                              type="number"
                              value={editData.salt_percent || ''}
                              onChange={e => handleEditChange('salt_percent', e.target.value)}
                            />
                          ) : (
                            fmt.pct(row.salt_percent)
                          )}
                        </td>
                        <td className="text-right calc-cell" style={{ fontWeight: 700, background: 'var(--input-bg)' }}>
                          {fmt.number(saltQty)}
                        </td>
                        <td>
                          {isEditing && isSelected ? (
                            <InlineSearchableSelect
                              value={editData.production_at}
                              onChange={val => handleEditChange('production_at', val)}
                              options={uniqueLocations}
                            />
                          ) : (
                            row.production_at
                          )}
                        </td>
                        <td className="text-center">
                          {isEditing && isSelected ? (
                            <InlineSearchableSelect
                              value={editData.status}
                              onChange={val => handleEditChange('status', val)}
                              options={['Pending', 'Processing', 'Completed']}
                            />
                          ) : (
                            <span style={getStatusBadgeStyle(row.status)}>
                              {row.status || 'Pending'}
                            </span>
                          )}
                        </td>
                        <td>
                          {isEditing && isSelected ? (
                            <input
                              className="edit-input"
                              value={editData.production_for || ''}
                              onChange={e => handleEditChange('production_for', e.target.value)}
                            />
                          ) : (
                            row.production_for
                          )}
                        </td>
                        <td style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{row.email?.split('@')[0]}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 800 }}>
                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 800 }}>TOTALS:</td>
                  <td className="text-right">{fmt.number(totalInQty)}</td>
                  <td colSpan={4}></td>
                  <td className="text-right">{fmt.number(totalChemQty)}</td>
                  <td></td>
                  <td className="text-right">{fmt.number(totalSaltQty)}</td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {!loading && !fy && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-tertiary)' }}>
          Select a <strong>Financial Year</strong> to load Soaking logs.
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
