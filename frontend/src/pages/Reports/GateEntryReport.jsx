/**
 * GateEntryReport.jsx – Gate Entry Registry Report
 * [Force rebuild cache buster: 104]
 */
import React, { useState } from 'react';
import { Boxes, ClipboardList } from 'lucide-react';
import {
  FilterBar, FilterBox, FilterSelect, FilterInput,
  KPIGrid, KPICard, Loader, ErrorBox, SearchInput, EmptyRow,
  FinYearSelect, useReport, fmt, ConfirmModal, AuditDrawer, RowActionMenu, InlineSearchableSelect
} from './ReportShell';

export default function GateEntryReport({ activeRoute }) {
  const [cacheBustVal] = useState('bknr-cb-104');
  const [activeTab, setActiveTab] = useState('raw');
  const [fy, setFy] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [supplier, setSupplier] = useState('');
  const [factory, setFactory] = useState('');
  const [goodsType, setGoodsType] = useState('');
  const [goodsCategory, setGoodsCategory] = useState('');
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
    if (search) {
      const query = search.toLowerCase();
      if (!Object.values(r).some(value => String(value ?? '').toLowerCase().includes(query))) return false;
    }
    return true;
  });
  const goodsRows = (data?.goods_rows || []).filter(r => {
    if (fromDate && r.movement_date < fromDate) return false;
    if (toDate && r.movement_date > toDate) return false;
    if (goodsType && r.movement_type !== goodsType) return false;
    if (goodsCategory && !(r.item_categories || []).includes(goodsCategory)) return false;
    if (search) {
      const query = search.toLowerCase();
      if (!Object.values(r).some(value => String(value ?? '').toLowerCase().includes(query))) return false;
    }
    return true;
  });

  const signed = (row, value) => (row.is_cancelled ? -1 : 1) * Number(value || 0);
  const totalMat = rows.reduce((s, r) => s + signed(r, r.no_of_material_boxes), 0);
  const totalEmpty = rows.reduce((s, r) => s + signed(r, r.no_of_empty_boxes), 0);
  const totalIce = rows.reduce((s, r) => s + signed(r, r.no_of_ice_boxes), 0);

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
    if (selectedRow.is_cancelled) return alert('Cancelled records cannot be edited.');
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
      const payload = await res.json().catch(() => ({}));
      if (res.ok) {
        alert('Changes saved successfully.');
        setIsEditing(false);
        setSelectedRow(null);
        reload();
      } else {
        alert(payload.detail || payload.error || 'Update failed.');
      }
    } catch (err) {
      alert('Error saving changes');
    }
  };

  const handleCancel = async () => {
    if (!selectedRow) return;
    if (selectedRow.is_cancelled) return alert('This record is already cancelled.');
    const reason = window.prompt(`Enter cancellation reason for batch ${selectedRow.batch_number}:`);
    if (reason === null) return;
    if (!reason.trim()) return alert('Cancellation reason is required.');
    try {
      const res = await fetch(`${activeRoute}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedRow.id, reason: reason.trim() }),
      });
      const payload = await res.json().catch(() => ({}));
      if (res.ok) {
        alert('Record cancelled successfully.');
        setSelectedRow(null);
        setConfirmModalOpen(false);
        reload();
      } else {
        alert(payload.detail || payload.error || 'Cancellation failed.');
      }
    } catch (err) {
      alert('Error cancelling row');
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
    { label: 'Cancel Record', onClick: () => { setConfirmAction('cancel'); setConfirmModalOpen(true); }, danger: true, disabled: !selectedRow }
  ];
  const goodsMenuActions = [
    { label: 'Print Native Table', onClick: () => window.print() },
    { label: 'Refresh Report', onClick: reload },
  ];

  const changeTab = tab => {
    setActiveTab(tab);
    setSelectedRow(null);
    setIsEditing(false);
    setSearch('');
  };

  return (
    <div className="report-viewer-card stock-report-page">

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
        {activeTab === 'raw' ? (
          <>
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
          </>
        ) : (
          <>
            <FilterBox label="Movement Type">
              <FilterSelect value={goodsType} onChange={setGoodsType}>
                <option value="">ALL MOVEMENTS</option>
                <option value="IN">GOODS IN</option>
                <option value="OUT">GOODS OUT</option>
              </FilterSelect>
            </FilterBox>
            <FilterBox label="Item Category">
              <FilterSelect value={goodsCategory} onChange={setGoodsCategory}>
                <option value="">ALL CATEGORIES</option>
                {(data?.goods_categories || []).map(value => <option key={value} value={value}>{value}</option>)}
              </FilterSelect>
            </FilterBox>
          </>
        )}
        <FilterBox label="Search">
          <SearchInput value={search} onChange={setSearch} />
        </FilterBox>
      </FilterBar>

      {/* Tab bar pinned below filters, above the KPIs/table */}
      <div style={tabStyles.wrap}>
        <button type="button" style={{ ...tabStyles.button, ...(activeTab === 'raw' ? tabStyles.active : {}) }} onClick={() => changeTab('raw')}>
          <ClipboardList size={15} /> Raw Material Gate Entry
        </button>
        <button type="button" style={{ ...tabStyles.button, ...(activeTab === 'goods' ? tabStyles.active : {}) }} onClick={() => changeTab('goods')}>
          <Boxes size={15} /> Goods IN / OUT Report
        </button>
      </div>

      {/* KPI strip — only for Raw Material tab, sits right below the Tab Bar */}
      {activeTab === 'raw' && !loading && !error && (
        <KPIGrid>
          <KPICard label="Total Entries" value={rows.length} accent="var(--corp-dash)" />
          <KPICard label="Material Boxes" value={fmt.number(totalMat)} accent="var(--corp-ops)" />
          <KPICard label="Empty Boxes" value={fmt.number(totalEmpty)} accent="var(--corp-rep)" />
          <KPICard label="Ice Boxes" value={fmt.number(totalIce)} accent="var(--corp-fin)" />
        </KPIGrid>
      )}

      <div className="actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div id="rowCount" style={{ fontSize: 12, fontWeight: 700, color: 'var(--corp-rep)' }}>
          {activeTab === 'raw' ? rows.length : goodsRows.length} rows found
        </div>
        <RowActionMenu actions={activeTab === 'raw' ? menuActions : goodsMenuActions} />
      </div>

      {loading && <Loader />}
      {error && <ErrorBox msg={error} onRetry={reload} />}

      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}>
          {activeTab === 'raw' ? (
            <div className="table-responsive" style={{ flex: '1 1 auto', overflow: 'auto', maxHeight: 'none' }}>
            <table className="bknr-table gate-entry-report-table" style={{ minWidth: 1900, width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 45 }}>#</th>
                  <th style={{ width: 90 }}>Date</th>
                  <th style={{ width: 65 }}>Time</th>
                  <th style={{ width: 100 }}>Batch No</th>
                  <th style={{ width: 100 }}>Challan No</th>
                  <th style={{ width: 130 }}>Receiving Center</th>
                  <th style={{ width: 100 }}>Gatepass No</th>
                  <th style={{ width: 160 }}>Supplier Name</th>
                  <th style={{ width: 145 }}>Purchasing Location</th>
                  <th style={{ width: 100 }}>Vehicle No</th>
                  <th style={{ width: 140 }}>Driver Name</th>
                  <th style={{ width: 140 }}>Production For</th>
                  <th style={{ width: 65 }}>Mat.</th>
                  <th style={{ width: 65 }}>Emp.</th>
                  <th style={{ width: 65 }}>Ice</th>
                  <th style={{ width: 140 }}>User</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <EmptyRow cols={16} />
                ) : (
                  rows.map((row, index) => {
                    const isSelected = selectedRow?.id === row.id;
                    const slNo = rows.length - index;
                    return (
                      <tr
                        key={row.id}
                        data-record-id={row.id}
                        onClick={() => {
                          if (!isEditing && !row.is_cancelled) {
                            setSelectedRow(row);
                          }
                        }}
                        style={{
                          background: isSelected ? 'rgba(139,92,246,0.08)' : undefined,
                          borderLeft: isSelected ? '3px solid var(--corp-rep)' : undefined,
                          opacity: row.is_cancelled ? 0.55 : 1,
                          cursor: row.is_cancelled ? 'default' : 'pointer',
                        }}
                      >
                        <td className="text-center">{slNo}</td>
                        <td className="text-center">{row.date}</td>
                        <td className="text-center">{row.time}</td>
                        <td className="text-center">
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
                            <input
                              className="edit-input"
                              value={editData.driver_name || ''}
                              onChange={e => setEditData({ ...editData, driver_name: e.target.value })}
                            />
                          ) : (
                            row.driver_name || '—'
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
                  <td colSpan={12} style={{ textAlign: 'right', fontWeight: 800 }}>NET BOX TOTALS:</td>
                  <td className="text-right" style={{ fontWeight: 800 }}>{fmt.number(totalMat)}</td>
                  <td className="text-right" style={{ fontWeight: 800 }}>{fmt.number(totalEmpty)}</td>
                  <td className="text-right" style={{ fontWeight: 800 }}>{fmt.number(totalIce)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          ) : <GoodsGateReport rows={goodsRows} />}
        </div>
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

function GoodsGateReport({ rows }) {
  const activeRows = rows.filter(row => !row.is_cancelled);
  const goodsInQty = activeRows
    .filter(row => row.movement_type === 'IN')
    .reduce((sum, row) => sum + Number(row.total_quantity || 0), 0);
  const goodsOutQty = activeRows
    .filter(row => row.movement_type === 'OUT')
    .reduce((sum, row) => sum + Number(row.total_quantity || 0), 0);
  const pendingReturns = activeRows.filter(
    row => row.is_returnable && ['PENDING', 'PARTIAL'].includes(row.return_status),
  ).length;
  const totalPackages = activeRows.reduce((sum, row) => sum + Number(row.total_packages || 0), 0);

  return (
    <>
      <div className="table-responsive" style={{ flex: '1 1 auto', overflow: 'auto' }}>
        <table className="bknr-table goods-gate-report-table" style={{ minWidth: 1760, width: '100%' }}>
          <thead>
            <tr>
              <th style={{ width: 48 }}>#</th>
              <th style={{ width: 125 }}>Movement No</th>
              <th style={{ width: 92 }}>Date</th>
              <th style={{ width: 65 }}>Time</th>
              <th style={{ width: 68 }}>Type</th>
              <th style={{ width: 135 }}>Production For</th>
              <th style={{ width: 130 }}>Plant Location</th>
              <th style={{ width: 165 }}>Party / Vendor</th>
              <th style={{ width: 145 }}>Source / Destination</th>
              <th style={{ width: 150 }}>PO / Challan / Invoice</th>
              <th style={{ width: 105 }}>Vehicle</th>
              <th style={{ width: 280 }}>Item Details</th>
              <th style={{ width: 88 }}>Quantity</th>
              <th style={{ width: 80 }}>Packages</th>
              <th style={{ width: 150 }}>Purpose</th>
              <th style={{ width: 105 }}>Return</th>
              <th style={{ width: 88 }}>Status</th>
              <th style={{ width: 155 }}>User</th>
            </tr>
          </thead>
          <tbody>
            {!rows.length ? <EmptyRow cols={18} /> : rows.map((row, index) => (
              <tr
                key={row.id}
                data-record-id={row.id}
                style={{
                  opacity: row.is_cancelled ? 0.55 : 1,
                  background: row.is_cancelled ? 'rgba(239,68,68,0.05)' : undefined,
                }}
              >
                <td className="text-center">{rows.length - index}</td>
                <td className="text-center">
                  {row.movement_number}<br />
                  <small style={{ color: 'var(--text-tertiary)' }}>Row #{row.id}</small>
                </td>
                <td className="text-center">{row.movement_date || '—'}</td>
                <td className="text-center">{row.movement_time || '—'}</td>
                <td className="text-center">
                  <span style={{ ...tabStyles.typeBadge, ...(row.movement_type === 'IN' ? tabStyles.inBadge : tabStyles.outBadge) }}>
                    {row.movement_type}
                  </span>
                </td>
                <td>{row.production_for || '—'}</td>
                <td>{row.plant_location || '—'}</td>
                <td>{row.party_name || '—'}</td>
                <td>{row.source_destination || '—'}</td>
                <td>
                  {[row.po_number, row.challan_number, row.invoice_number].filter(Boolean).join(' / ') || '—'}
                </td>
                <td className="text-center">{row.vehicle_number || '—'}</td>
                <td style={{ whiteSpace: 'normal', lineHeight: 1.35 }}>{row.item_summary || '—'}</td>
                <td className="text-right">{fmt.number(row.total_quantity)}</td>
                <td className="text-right">{fmt.number(row.total_packages)}</td>
                <td style={{ whiteSpace: 'normal' }}>{row.purpose || '—'}</td>
                <td className="text-center">{row.return_status || '—'}</td>
                <td className="text-center">{row.status || '—'}</td>
                <td style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{row.created_by || '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={12} style={{ textAlign: 'right', fontWeight: 800 }}>ACTIVE MOVEMENT TOTALS:</td>
              <td className="text-right" style={{ fontWeight: 800 }}>{fmt.number(goodsInQty + goodsOutQty)}</td>
              <td className="text-right" style={{ fontWeight: 800 }}>{fmt.number(totalPackages)}</td>
              <td colSpan={4}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}

const tabStyles = {
  wrap: {
    display: 'flex',
    gap: 5,
    margin: '4px 0 4px',
    padding: '4px 6px',
    border: '1px solid var(--border-light)',
    borderRadius: 7,
    background: 'var(--bg-app)',
    overflowX: 'auto',
  },
  button: {
    minWidth: 190,
    height: 36,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    padding: '0 14px',
    border: '1px solid var(--border-light)',
    borderRadius: 7,
    background: 'var(--surface-panel)',
    color: 'var(--text-secondary)',
    fontSize: 11,
    fontWeight: 800,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  active: {
    borderColor: 'var(--corp-rep, #2563eb)',
    background: 'var(--corp-rep, #2563eb)',
    color: '#fff',
  },
  typeBadge: {
    display: 'inline-flex',
    minWidth: 38,
    justifyContent: 'center',
    padding: '3px 7px',
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 900,
  },
  inBadge: { color: '#166534', background: '#dcfce7' },
  outBadge: { color: '#9a3412', background: '#ffedd5' },
};
