/**
 * StockReport.jsx – Stock Status Report (Inventory)
 */
import React, { useState } from 'react';
import {
  ReportHeader, FilterBar, FilterBox, FilterSelect, FilterInput,
  KPIGrid, KPICard, Loader, ErrorBox, SearchInput, EmptyRow,
  FinYearSelect, useReport, fmt, ConfirmModal, AuditDrawer, RowActionMenu, InlineSearchableSelect
} from './ReportShell';

export default function StockReport({ activeRoute }) {
  const [fy, setFy]                     = useState('');
  const [fromDate, setFrom]             = useState('');
  const [toDate, setTo]                 = useState('');
  const [movFilter, setMov]             = useState('');
  const [batchFilter, setBatchFilter]   = useState('');
  const [brandFilter, setBrandFilter]   = useState('');
  const [speciesFilter, setSpeciesFilter] = useState('');
  const [varietyFilter, setVarietyFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [search, setSearch]             = useState('');

  // Editing state
  const [selectedRow, setSelectedRow] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({});
  const [auditOpen, setAuditOpen] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  const params = {};
  if (fy) params.fy = fy;
  if (fromDate) params.from_date = fromDate;
  if (toDate)   params.to_date   = toDate;

  const { data, loading, error, reload } = useReport({
    url: activeRoute, params, deps: [fy, fromDate, toDate],
  });

  const rawRows = data?.rows || [];

  // Client-side filtering
  const rows = rawRows.filter(r => {
    if (movFilter && r.cargo_movement_type !== movFilter) return false;
    if (batchFilter && r.batch_number !== batchFilter) return false;
    if (brandFilter && r.brand !== brandFilter) return false;
    if (speciesFilter && r.species !== speciesFilter) return false;
    if (varietyFilter && r.variety !== varietyFilter) return false;
    if (locationFilter && r.location !== locationFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const match = Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  // Calculate unique filters lists
  const batchesList = [...new Set(rawRows.map(r => r.batch_number).filter(Boolean))].sort();
  const brandsList = data?.brands_list || [];
  const speciesList = data?.species_list || [];
  const varietiesList = data?.varieties_list || [];
  const locationsList = [...new Set(rawRows.map(r => r.location).filter(Boolean))].sort();

  // Grand totals
  const inRows  = rows.filter(r => (r.cargo_movement_type || '').toUpperCase() === 'IN');
  const outRows = rows.filter(r => (r.cargo_movement_type || '').toUpperCase() === 'OUT');
  const totalIn  = inRows.reduce((s, r)  => s + Number(r.quantity || 0), 0);
  const totalOut = outRows.reduce((s, r) => s + Number(r.quantity || 0), 0);
  const netStock = totalIn - totalOut;

  const totalInMc = inRows.reduce((s, r)  => s + Number(r.no_of_mc || 0), 0);
  const totalOutMc = outRows.reduce((s, r) => s + Number(r.no_of_mc || 0), 0);
  const netMc = totalInMc - totalOutMc;

  const totalInLoose = inRows.reduce((s, r)  => s + Number(r.loose || 0), 0);
  const totalOutLoose = outRows.reduce((s, r) => s + Number(r.loose || 0), 0);
  const netLoose = totalInLoose - totalOutLoose;

  const totalVal = rows.reduce((s, r) => s + Number(r.inventory_value || 0), 0);

  const getExportUrl = (type) => {
    let url = `${activeRoute}/export_${type}?from_date=${fromDate}&to_date=${toDate}&type=${movFilter}&batch=${encodeURIComponent(batchFilter)}&brand=${encodeURIComponent(brandFilter)}&species=${encodeURIComponent(speciesFilter)}&variety=${encodeURIComponent(varietyFilter)}&location=${encodeURIComponent(locationFilter)}`;
    const pf = localStorage.getItem('production_for_filter') || '';
    const loc = localStorage.getItem('plant_location_filter') || '';
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
        const errJson = await res.json();
        alert(`Update Failed: ${errJson.detail || 'Error saving changes'}`);
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
    { label: 'Export Excel', onClick: () => { window.location.href = getExportUrl('xlsx'); } },
    { divider: true },
    { label: 'Delete Record', onClick: () => { setConfirmAction('delete'); setConfirmModalOpen(true); }, danger: true, disabled: !selectedRow }
  ];

  return (
    <div className="report-viewer-card">
      <ReportHeader
        title="Stock Status Report"
        subtitle={`${rows.length} records loaded`}
        loading={loading}
        onReload={reload}
        exportUrl={getExportUrl('xlsx')}
      />

      <FilterBar>
        <FilterBox label="Financial Year">
          <FinYearSelect value={fy} onChange={setFy} list={data?.financial_years} />
        </FilterBox>
        <FilterBox label="From Date">
          <FilterInput type="date" value={fromDate} onChange={setFrom} />
        </FilterBox>
        <FilterBox label="To Date">
          <FilterInput type="date" value={toDate} onChange={setTo} />
        </FilterBox>
        <FilterBox label="Movement">
          <FilterSelect value={movFilter} onChange={setMov}>
            <option value="">ALL MOVEMENTS</option>
            <option value="IN">IN</option>
            <option value="OUT">OUT</option>
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Batch #">
          <FilterSelect value={batchFilter} onChange={setBatchFilter}>
            <option value="">ALL BATCHES</option>
            {batchesList.map(b => <option key={b} value={b}>{b}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Brand">
          <FilterSelect value={brandFilter} onChange={setBrandFilter}>
            <option value="">ALL BRANDS</option>
            {brandsList.map(b => <option key={b} value={b}>{b}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Species">
          <FilterSelect value={speciesFilter} onChange={setSpeciesFilter}>
            <option value="">ALL SPECIES</option>
            {speciesList.map(s => <option key={s} value={s}>{s}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Variety">
          <FilterSelect value={varietyFilter} onChange={setVarietyFilter}>
            <option value="">ALL VARIETIES</option>
            {varietiesList.map(v => <option key={v} value={v}>{v}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Location">
          <FilterSelect value={locationFilter} onChange={setLocationFilter}>
            <option value="">ALL LOCATIONS</option>
            {locationsList.map(loc => <option key={loc} value={loc}>{loc}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Search">
          <SearchInput value={search} onChange={setSearch} placeholder="Search anything..." />
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

      {!loading && !error && data && (
        <>
          <KPIGrid>
            <KPICard label="Total Rows" value={rows.length} accent="var(--corp-dash)" />
            <KPICard label="Total IN (Kg)" value={fmt.number(totalIn)} accent="var(--corp-fin)" />
            <KPICard label="Total OUT (Kg)" value={fmt.number(totalOut)} accent="var(--corp-ops)" />
            <KPICard label="Net Stock (Kg)" value={fmt.number(netStock)}
              accent={netStock >= 0 ? 'var(--corp-fin)' : '#ef4444'} />
          </KPIGrid>

          <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table className="bknr-table" style={{ minWidth: 2300, width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 45 }}>#</th>
                  <th style={{ width: 90 }}>Date</th>
                  <th style={{ width: 70 }}>Time</th>
                  <th style={{ width: 110 }}>Batch No</th>
                  <th style={{ width: 90 }}>Movement</th>
                  <th style={{ width: 130 }}>Brand</th>
                  <th style={{ width: 120 }}>Species</th>
                  <th style={{ width: 150 }}>Variety</th>
                  <th style={{ width: 80 }}>Grade</th>
                  <th style={{ width: 80 }}>Glaze</th>
                  <th style={{ width: 100 }}>Freezer</th>
                  <th style={{ width: 130 }}>Pack Style</th>
                  <th style={{ width: 80 }} className="text-right">MC</th>
                  <th style={{ width: 80 }} className="text-right">Loose</th>
                  <th style={{ width: 100 }} className="text-right">Qty (Kg)</th>
                  <th style={{ width: 110 }}>Location</th>
                  <th style={{ width: 110 }}>PO Number</th>
                  <th style={{ width: 140 }}>Prod For</th>
                  <th style={{ width: 140 }}>Prod At</th>
                  <th style={{ width: 100 }} className="text-right">Cost/Kg</th>
                  <th style={{ width: 110 }} className="text-right">Inv Value</th>
                  <th style={{ width: 120 }}>Type</th>
                  <th style={{ width: 100 }}>User</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <EmptyRow cols={23} />
                ) : (
                  rows.map((row, index) => {
                    const isSelected = selectedRow?.id === row.id;
                    const isOut = (row.cargo_movement_type || '').toUpperCase() === 'OUT';
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
                          background: isSelected ? 'rgba(139,92,246,0.08)' : (isOut ? 'rgba(239, 68, 68, 0.05)' : undefined),
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
                            <select
                              className="edit-input"
                              value={editData.cargo_movement_type}
                              onChange={e => setEditData({ ...editData, cargo_movement_type: e.target.value })}
                            >
                              <option value="IN">IN</option>
                              <option value="OUT">OUT</option>
                            </select>
                          ) : (
                            <span className="badge" style={{
                              padding: '2px 6px',
                              borderRadius: '3px',
                              fontWeight: 800,
                              background: isOut ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                              color: isOut ? '#ef4444' : '#10b981',
                              border: isOut ? '1px solid rgba(239,68,68,0.3)' : '1px solid rgba(16,185,129,0.3)'
                            }}>
                              {row.cargo_movement_type}
                            </span>
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
                            row.brand
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
                            row.species
                          )}
                        </td>
                        <td>
                          {isEditing && isSelected ? (
                            <InlineSearchableSelect
                              value={editData.variety}
                              onChange={val => setEditData({ ...editData, variety: val })}
                              options={data?.varieties_list || []}
                            />
                          ) : (
                            row.variety
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
                            row.grade
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
                            row.glaze
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
                            row.freezer
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
                            row.packing_style
                          )}
                        </td>
                        <td className="text-right">
                          {isEditing && isSelected ? (
                            <input
                              type="number"
                              className="edit-input text-right"
                              value={editData.no_of_mc ?? 0}
                              onChange={e => setEditData({ ...editData, no_of_mc: Number(e.target.value) })}
                            />
                          ) : (
                            fmt.number(row.no_of_mc)
                          )}
                        </td>
                        <td className="text-right">
                          {isEditing && isSelected ? (
                            <input
                              type="number"
                              className="edit-input text-right"
                              value={editData.loose ?? 0}
                              onChange={e => setEditData({ ...editData, loose: Number(e.target.value) })}
                            />
                          ) : (
                            fmt.number(row.loose)
                          )}
                        </td>
                        <td className="text-right" style={{ fontWeight: 700 }}>
                          {fmt.number(row.quantity)}
                        </td>
                        <td>
                          {isEditing && isSelected ? (
                            <input
                              className="edit-input"
                              value={editData.location || ''}
                              onChange={e => setEditData({ ...editData, location: e.target.value })}
                            />
                          ) : (
                            row.location
                          )}
                        </td>
                        <td className="text-center">
                          {isEditing && isSelected ? (
                            <input
                              className="edit-input"
                              value={editData.po_number || ''}
                              onChange={e => setEditData({ ...editData, po_number: e.target.value })}
                            />
                          ) : (
                            row.po_number
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
                        <td>
                          {isEditing && isSelected ? (
                            <InlineSearchableSelect
                              value={editData.production_at}
                              onChange={val => setEditData({ ...editData, production_at: val })}
                              options={data?.production_at_list || []}
                            />
                          ) : (
                            row.production_at
                          )}
                        </td>
                        <td className="text-right">
                          {isEditing && isSelected ? (
                            <input
                              type="number"
                              className="edit-input text-right"
                              value={editData.product_kg_value ?? 0}
                              onChange={e => setEditData({ ...editData, product_kg_value: Number(e.target.value) })}
                            />
                          ) : (
                            fmt.currency(row.product_kg_value)
                          )}
                        </td>
                        <td className="text-right" style={{ fontWeight: 700 }}>
                          {fmt.currency(row.inventory_value)}
                        </td>
                        <td>
                          {isEditing && isSelected ? (
                            <InlineSearchableSelect
                              value={editData.type_of_production}
                              onChange={val => setEditData({ ...editData, type_of_production: val })}
                              options={data?.type_of_production_list || []}
                            />
                          ) : (
                            row.type_of_production
                          )}
                        </td>
                        <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          {row.email ? row.email.split('@')[0] : ''}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 800 }}>
                  <td colSpan={12} className="text-right">PAGE TOTALS (NET = IN - OUT):</td>
                  <td className="text-right">{fmt.number(netMc)} MC</td>
                  <td className="text-right">{fmt.number(netLoose)} Lse</td>
                  <td className="text-right" style={{ color: 'var(--accent)', fontWeight: 800 }}>
                    {fmt.number(netStock)} KG
                  </td>
                  <td colSpan={5}></td>
                  <td className="text-right" style={{ color: 'var(--accent)' }}>
                    {fmt.currency(totalVal)}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {!loading && !data && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-tertiary)' }}>
          Select a <strong>Financial Year</strong> or date range to load Stock data.
        </div>
      )}

      {/* Audit Logs Drawer */}
      <AuditDrawer
        isOpen={auditOpen}
        onClose={() => setAuditOpen(false)}
        auditUrl={`${activeRoute}/audit_all`}
      />

      {/* Delete/Save Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        onConfirm={confirmAction === 'delete' ? handleDelete : undefined}
        title="Confirm Action"
        message="Are you sure you want to permanently delete this stock record? This cannot be undone."
      />
    </div>
  );
}

