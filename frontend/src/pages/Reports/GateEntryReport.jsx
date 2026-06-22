/**
 * GateEntryReport.jsx – Gate Entry Registry Report
 */
import React, { useState } from 'react';
import {
  ReportHeader, FilterBar, FilterBox, FilterSelect, FilterInput,
  KPIGrid, KPICard, Loader, ErrorBox, SearchInput, EmptyRow,
  FinYearSelect, useReport, fmt, ConfirmModal, AuditDrawer, RowActionMenu, InlineSearchableSelect
} from './ReportShell';

export default function GateEntryReport({ activeRoute }) {
  const [fy, setFy] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [supplier, setSupplier] = useState('');
  const [factory, setFactory] = useState('');
  const [search, setSearch] = useState('');

  // Editing state
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

  const allRows = data?.rows || [];
  const rows = allRows.filter(r => {
    if (fromDate && r.date < fromDate) return false;
    if (toDate && r.date > toDate) return false;
    if (supplier && r.supplier_name !== supplier) return false;
    if (factory && r.receiving_center !== factory) return false;
    return true;
  });

  const totalMat = rows.reduce((s, r) => s + Number(r.no_of_material_boxes || 0), 0);
  const totalEmpty = rows.reduce((s, r) => s + Number(r.no_of_empty_boxes || 0), 0);
  const totalIce = rows.reduce((s, r) => s + Number(r.no_of_ice_boxes || 0), 0);

  const getExportUrl = (type) => {
    const pf = localStorage.getItem('production_for_filter') || '';
    const loc = localStorage.getItem('plant_location_filter') || '';
    let url = `${activeRoute}/export_${type}?fy=${fy}&supplier=${encodeURIComponent(supplier)}&factory=${encodeURIComponent(factory)}`;
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
    { label: 'View Audit Logs', onClick: () => setAuditOpen(true) },
    { divider: true },
    { label: 'Print Native Table', onClick: () => window.print() },
    { label: 'Export PDF', onClick: () => { window.location.href = getExportUrl('pdf'); } },
    { label: 'Export Excel', onClick: () => { window.location.href = getExportUrl('excel'); } },
    { divider: true },
    { label: 'Delete Record', onClick: () => { setConfirmAction('delete'); setConfirmModalOpen(true); }, danger: true, disabled: !selectedRow }
  ];

  return (
    <div className="report-viewer-card">
      <ReportHeader
        title="Gate Entry Registry Report"
        subtitle={`${rows.length} entries loaded${fy ? ` — FY ${fy}–${Number(fy)+1}` : ''}`}
        loading={loading}
        onReload={reload}
        exportUrl={fy ? getExportUrl('excel') : null}
      />

      <FilterBar>
        <FilterBox label="Financial Year">
          <FinYearSelect value={fy} onChange={setFy}
            list={data?.financial_years || ['2024','2025','2026']} />
        </FilterBox>
        <FilterBox label="From Date">
          <FilterInput type="date" value={fromDate} onChange={setFromDate} />
        </FilterBox>
        <FilterBox label="To Date">
          <FilterInput type="date" value={toDate} onChange={setToDate} />
        </FilterBox>
        <FilterBox label="Supplier">
          <FilterSelect value={supplier} onChange={setSupplier}>
            <option value="">ALL SUPPLIERS</option>
            {(data?.suppliers_list || []).map(s => <option key={s} value={s}>{s}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Receiving Center">
          <FilterSelect value={factory} onChange={setFactory}>
            <option value="">ALL CENTERS</option>
            {(data?.factories_list || []).map(f => <option key={f} value={f}>{f}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Search">
          <SearchInput value={search} onChange={setSearch} />
        </FilterBox>
      </FilterBar>

      <div className="actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div id="rowCount" style={{ fontSize: 12, fontWeight: 700, color: 'var(--corp-rep)' }}>
          {rows.length} rows found
        </div>
        <RowActionMenu actions={menuActions} />
      </div>

      {loading && <Loader />}
      {error && <ErrorBox msg={error} onRetry={reload} />}

      {!loading && !error && fy && (
        <>
          <KPIGrid>
            <KPICard label="Total Entries" value={rows.length} accent="var(--corp-dash)" />
            <KPICard label="Material Boxes" value={fmt.number(totalMat)} accent="var(--corp-ops)" />
            <KPICard label="Empty Boxes" value={fmt.number(totalEmpty)} accent="var(--corp-rep)" />
            <KPICard label="Ice Boxes" value={fmt.number(totalIce)} accent="var(--corp-fin)" />
          </KPIGrid>
          
          <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table className="bknr-table" style={{ minWidth: 1550, width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 45 }}>#</th>
                  <th style={{ width: 90 }}>Date</th>
                  <th style={{ width: 65 }}>Time</th>
                  <th style={{ width: 100 }}>Batch No</th>
                  <th style={{ width: 100 }}>Challan No</th>
                  <th style={{ width: 120 }}>Factory Name</th>
                  <th style={{ width: 100 }}>Gatepass No</th>
                  <th style={{ width: 160 }}>Supplier Name</th>
                  <th style={{ width: 120 }}>PR Location</th>
                  <th style={{ width: 100 }}>Vehicle No</th>
                  <th style={{ width: 140 }}>Production For</th>
                  <th style={{ width: 65 }}>Mat.</th>
                  <th style={{ width: 65 }}>Emp.</th>
                  <th style={{ width: 65 }}>Ice</th>
                  <th style={{ width: 140 }}>User</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <EmptyRow cols={15} />
                ) : (
                  rows.map((row, index) => {
                    const isSelected = selectedRow?.id === row.id;
                    const slNo = rows.length - index;
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
                        <td className="text-center">{row.time}</td>
                        <td className="text-center" style={{ fontWeight: 700 }}>
                          {isEditing && isSelected ? (
                            <input
                              className="edit-input"
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
                              className="edit-input"
                              value={editData.challan_number || ''}
                              onChange={e => setEditData({ ...editData, challan_number: e.target.value })}
                            />
                          ) : (
                            row.challan_number
                          )}
                        </td>
                        <td>
                          {isEditing && isSelected ? (
                            <InlineSearchableSelect
                              value={editData.receiving_center}
                              onChange={val => setEditData({ ...editData, receiving_center: val })}
                              options={data?.factories_list || []}
                            />
                          ) : (
                            row.receiving_center
                          )}
                        </td>
                        <td className="text-center">
                          {isEditing && isSelected ? (
                            <input
                              className="edit-input"
                              value={editData.gate_pass_number || ''}
                              onChange={e => setEditData({ ...editData, gate_pass_number: e.target.value })}
                            />
                          ) : (
                            row.gate_pass_number
                          )}
                        </td>
                        <td>
                          {isEditing && isSelected ? (
                            <InlineSearchableSelect
                              value={editData.supplier_name}
                              onChange={val => setEditData({ ...editData, supplier_name: val })}
                              options={data?.suppliers_list || []}
                            />
                          ) : (
                            row.supplier_name
                          )}
                        </td>
                        <td>
                          {isEditing && isSelected ? (
                            <InlineSearchableSelect
                              value={editData.purchasing_location}
                              onChange={val => setEditData({ ...editData, purchasing_location: val })}
                              options={data?.locations_list || []}
                            />
                          ) : (
                            row.purchasing_location
                          )}
                        </td>
                        <td className="text-center">
                          {isEditing && isSelected ? (
                            <input
                              className="edit-input"
                              value={editData.vehicle_number || ''}
                              onChange={e => setEditData({ ...editData, vehicle_number: e.target.value })}
                            />
                          ) : (
                            row.vehicle_number
                          )}
                        </td>
                        <td>
                          {isEditing && isSelected ? (
                            <InlineSearchableSelect
                              value={editData.production_for}
                              onChange={val => setEditData({ ...editData, production_for: val })}
                              options={data?.production_for_list || []}
                            />
                          ) : (
                            row.production_for
                          )}
                        </td>
                        <td className="text-right">
                          {isEditing && isSelected ? (
                            <input
                              className="edit-input text-right"
                              type="number"
                              value={editData.no_of_material_boxes || ''}
                              onChange={e => setEditData({ ...editData, no_of_material_boxes: e.target.value })}
                            />
                          ) : (
                            fmt.number(row.no_of_material_boxes)
                          )}
                        </td>
                        <td className="text-right">
                          {isEditing && isSelected ? (
                            <input
                              className="edit-input text-right"
                              type="number"
                              value={editData.no_of_empty_boxes || ''}
                              onChange={e => setEditData({ ...editData, no_of_empty_boxes: e.target.value })}
                            />
                          ) : (
                            fmt.number(row.no_of_empty_boxes)
                          )}
                        </td>
                        <td className="text-right">
                          {isEditing && isSelected ? (
                            <input
                              className="edit-input text-right"
                              type="number"
                              value={editData.no_of_ice_boxes || ''}
                              onChange={e => setEditData({ ...editData, no_of_ice_boxes: e.target.value })}
                            />
                          ) : (
                            fmt.number(row.no_of_ice_boxes)
                          )}
                        </td>
                        <td style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{row.email}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={11} style={{ textAlign: 'right', fontWeight: 800 }}>TOTAL BOXES:</td>
                  <td className="text-right" style={{ fontWeight: 800 }}>{fmt.number(totalMat)}</td>
                  <td className="text-right" style={{ fontWeight: 800 }}>{fmt.number(totalEmpty)}</td>
                  <td className="text-right" style={{ fontWeight: 800 }}>{fmt.number(totalIce)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {!loading && !fy && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-tertiary)' }}>
          Select a <strong>Financial Year</strong> above to load the Gate Entry Registry.
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
        auditUrl={`${activeRoute}/audit`}
      />
    </div>
  );
}
