/**
 * RMPReport.jsx – Raw Material Purchase Summary & Registry
 */
import React, { useState } from 'react';
import {
  ReportHeader, FilterBar, FilterBox, FilterSelect, FilterInput,
  KPIGrid, KPICard, Loader, ErrorBox, SearchInput, EmptyRow,
  FinYearSelect, useReport, fmt, ConfirmModal, AuditDrawer, RowActionMenu, InlineSearchableSelect
} from './ReportShell';

export default function RMPReport({ activeRoute }) {
  const [fy, setFy] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [batch, setBatch] = useState('');
  const [supplier, setSupplier] = useState('');
  const [variety, setVariety] = useState('');
  const [peeling, setPeeling] = useState('');
  const [hsn, setHsn] = useState('');
  const [production, setProduction] = useState('');
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

  const rawRows = data?.rows || [];

  // Filter logic
  const filteredRows = rawRows.filter(r => {
    if (fromDate && r.date < fromDate) return false;
    if (toDate && r.date > toDate) return false;
    if (batch && r.batch_number !== batch) return false;
    if (supplier && r.supplier_name !== supplier) return false;
    if (variety && r.variety_name !== variety) return false;
    if (peeling && r.peeling_at !== peeling) return false;
    if (hsn && r.hsn_code !== hsn) return false;
    if (production && r.production_for !== production) return false;
    if (search) {
      const q = search.toLowerCase();
      const match = Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  // Unique batches and other filter lists for filling selectors
  const uniqueBatches = Array.from(new Set(rawRows.map(r => r.batch_number).filter(Boolean))).sort();
  const uniqueHsns = Array.from(new Set(rawRows.map(r => r.hsn_code).filter(Boolean))).sort();

  // Grouping by Batch
  const groups = {};
  let netG1 = 0, netG2 = 0, netDC = 0, netRec = 0, netAmt = 0;

  filteredRows.forEach(r => {
    const b = r.batch_number || 'UNKNOWN';
    if (!groups[b]) {
      groups[b] = { g1: 0, g2: 0, dc: 0, rec: 0, amt: 0, items: [] };
    }
    groups[b].g1 += Number(r.g1_qty || 0);
    groups[b].g2 += Number(r.g2_qty || 0);
    groups[b].dc += Number(r.dc_qty || 0);
    groups[b].rec += Number(r.received_qty || 0);
    groups[b].amt += Number(r.amount || 0);
    groups[b].items.push(r);

    netG1 += Number(r.g1_qty || 0);
    netG2 += Number(r.g2_qty || 0);
    netDC += Number(r.dc_qty || 0);
    netRec += Number(r.received_qty || 0);
    netAmt += Number(r.amount || 0);
  });

  const getParamsString = (actionType) => {
    const visibleIds = filteredRows.map(r => r.id).join(',');
    const pf = localStorage.getItem('production_for_filter') || '';
    const loc = localStorage.getItem('plant_location_filter') || '';
    
    let qStr = `fy=${fy}&ids=${visibleIds}`;
    if (batch) qStr += `&batch=${encodeURIComponent(batch)}`;
    if (supplier) qStr += `&supplier=${encodeURIComponent(supplier)}`;
    if (variety) qStr += `&variety=${encodeURIComponent(variety)}`;
    if (peeling) qStr += `&peeling=${encodeURIComponent(peeling)}`;
    if (hsn) qStr += `&hsn=${encodeURIComponent(hsn)}`;
    if (production) qStr += `&production_for=${encodeURIComponent(production)}`;
    if (pf) qStr += `&global_production_for=${encodeURIComponent(pf)}`;
    if (loc) qStr += `&global_location=${encodeURIComponent(loc)}`;
    return qStr;
  };

  const executeAction = (action) => {
    const q = getParamsString(action);
    if (action === 'print_table') {
      window.open(`${activeRoute}/print_table?${q}`, '_blank');
    } else if (action === 'print_summary') {
      window.open(`${activeRoute}/print_summary?${q}`, '_blank');
    } else if (action === 'excel_table') {
      window.location.href = `${activeRoute}/export_excel?type=table&${q}`;
    } else if (action === 'excel_summary') {
      window.location.href = `${activeRoute}/export_excel?type=summary&${q}`;
    } else if (action === 'pdf_table') {
      window.location.href = `${activeRoute}/export_pdf?type=table&${q}`;
    } else if (action === 'pdf_summary') {
      window.location.href = `${activeRoute}/export_pdf?type=summary&${q}`;
    }
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
    { header: 'Print Options' },
    { label: 'Print Table', onClick: () => executeAction('print_table') },
    { label: 'Print Summary', onClick: () => executeAction('print_summary') },
    { divider: true },
    { header: 'Export Options' },
    { label: 'Export Excel (Table)', onClick: () => executeAction('excel_table') },
    { label: 'Export Excel (Summary)', onClick: () => executeAction('excel_summary') },
    { label: 'Export PDF (Table)', onClick: () => executeAction('pdf_table') },
    { label: 'Export PDF (Summary)', onClick: () => executeAction('pdf_summary') },
    { divider: true },
    { label: 'Delete Record', onClick: () => { setConfirmAction('delete'); setConfirmModalOpen(true); }, danger: true, disabled: !selectedRow }
  ];

  return (
    <div className="report-viewer-card">
      <ReportHeader
        title="Raw Material Purchase Report"
        subtitle={`${filteredRows.length} items loaded${fy ? ` — FY ${fy}–${Number(fy)+1}` : ''}`}
        loading={loading}
        onReload={reload}
        exportUrl={fy ? `${activeRoute}/export_excel?type=table&fy=${fy}` : null}
      />

      <FilterBar>
        <FilterBox label="Financial Year">
          <FinYearSelect value={fy} onChange={setFy} list={data?.financial_years} />
        </FilterBox>
        <FilterBox label="From Date">
          <FilterInput type="date" value={fromDate} onChange={setFromDate} />
        </FilterBox>
        <FilterBox label="To Date">
          <FilterInput type="date" value={toDate} onChange={setToDate} />
        </FilterBox>
        <FilterBox label="Batch">
          <FilterSelect value={batch} onChange={setBatch}>
            <option value="">ALL BATCHES</option>
            {uniqueBatches.map(b => <option key={b} value={b}>{b}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Supplier">
          <FilterSelect value={supplier} onChange={setSupplier}>
            <option value="">ALL SUPPLIERS</option>
            {(data?.suppliers || data?.suppliers_list || []).map(s => <option key={s} value={s}>{s}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Variety">
          <FilterSelect value={variety} onChange={setVariety}>
            <option value="">ALL VARIETIES</option>
            {(data?.varieties || data?.varieties_list || []).map(v => <option key={v} value={v}>{v}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Peeling At">
          <FilterSelect value={peeling} onChange={setPeeling}>
            <option value="">ALL LOCATIONS</option>
            {(data?.peeling_locations || data?.locations_list || []).map(p => <option key={p} value={p}>{p}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="HSN">
          <FilterSelect value={hsn} onChange={setHsn}>
            <option value="">ALL HSNs</option>
            {uniqueHsns.map(h => <option key={h} value={h}>{h}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Production For">
          <FilterSelect value={production} onChange={setProduction}>
            <option value="">ALL PRODUCTION FOR</option>
            {(data?.production_for_list || []).map(p => <option key={p} value={p}>{p}</option>)}
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
            <KPICard label="Total Entries" value={filteredRows.length} accent="var(--corp-dash)" />
            <KPICard label="Total Received (Kg)" value={fmt.number(netRec)} accent="var(--corp-ops)" />
            <KPICard label="Average Net Rate" value={netRec > 0 ? fmt.currency(netAmt / netRec) : '₹ 0.00'} accent="var(--corp-rep)" />
            <KPICard label="Total Amount" value={fmt.currency(netAmt)} accent="var(--corp-fin)" />
          </KPIGrid>

          <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table className="bknr-table" style={{ minWidth: 1600, width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 35 }}>#</th>
                  <th style={{ width: 75 }}>Date</th>
                  <th style={{ width: 85 }}>Batch number</th>
                  <th style={{ width: 130 }}>Supplier name</th>
                  <th style={{ width: 100 }}>Variety</th>
                  <th style={{ width: 60 }}>Boxes</th>
                  <th style={{ width: 70 }}>HSN</th>
                  <th style={{ width: 100 }}>Center</th>
                  <th style={{ width: 100 }}>Production</th>
                  <th style={{ width: 100 }}>Species</th>
                  <th style={{ width: 60 }}>Count</th>
                  <th style={{ width: 65 }}>G1</th>
                  <th style={{ width: 65 }}>G2</th>
                  <th style={{ width: 65 }}>DC</th>
                  <th style={{ width: 65 }}>Rec Qty</th>
                  <th style={{ width: 65 }}>Rate</th>
                  <th style={{ width: 90 }}>Amount</th>
                  <th style={{ width: 120 }}>Remarks</th>
                  <th style={{ width: 120 }}>Email</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <EmptyRow cols={19} />
                ) : (
                  Object.keys(groups).map(b => {
                    const g = groups[b];
                    const itemsHtml = g.items.map((row, index) => {
                      const isSelected = selectedRow?.id === row.id;
                      const slNo = filteredRows.length - filteredRows.findIndex(item => item.id === row.id);
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
                          <td>
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
                          <td>
                            {isEditing && isSelected ? (
                              <InlineSearchableSelect
                                value={editData.supplier_name}
                                onChange={val => setEditData({ ...editData, supplier_name: val })}
                                options={data?.suppliers || data?.suppliers_list || []}
                              />
                            ) : (
                              row.supplier_name
                            )}
                          </td>
                          <td>
                            {isEditing && isSelected ? (
                              <InlineSearchableSelect
                                value={editData.variety_name}
                                onChange={val => setEditData({ ...editData, variety_name: val })}
                                options={data?.varieties || data?.varieties_list || []}
                              />
                            ) : (
                              row.variety_name
                            )}
                          </td>
                          <td className="text-center">
                            {isEditing && isSelected ? (
                              <input
                                className="edit-input"
                                type="number"
                                value={editData.material_boxes || 0}
                                onChange={e => setEditData({ ...editData, material_boxes: Number(e.target.value) })}
                              />
                            ) : (
                              row.material_boxes
                            )}
                          </td>
                          <td className="text-center">
                            {isEditing && isSelected ? (
                              <input
                                className="edit-input"
                                value={editData.hsn_code || ''}
                                onChange={e => setEditData({ ...editData, hsn_code: e.target.value })}
                              />
                            ) : (
                              row.hsn_code
                            )}
                          </td>
                          <td>
                            {isEditing && isSelected ? (
                              <InlineSearchableSelect
                                value={editData.peeling_at}
                                onChange={val => setEditData({ ...editData, peeling_at: val })}
                                options={data?.peeling_locations || data?.locations_list || []}
                              />
                            ) : (
                              row.peeling_at
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
                                value={editData.species}
                                onChange={val => setEditData({ ...editData, species: val })}
                                options={data?.species || data?.species_list || []}
                              />
                            ) : (
                              row.species
                            )}
                          </td>
                          <td className="text-center">
                            {isEditing && isSelected ? (
                              <input
                                className="edit-input"
                                value={editData.count || ''}
                                onChange={e => setEditData({ ...editData, count: e.target.value })}
                              />
                            ) : (
                              row.count
                            )}
                          </td>
                          <td className="text-right">{fmt.number(row.g1_qty)}</td>
                          <td className="text-right">{fmt.number(row.g2_qty)}</td>
                          <td className="text-right">{fmt.number(row.dc_qty)}</td>
                          <td className="text-right" style={{ fontWeight: 700 }}>{fmt.number(row.received_qty)}</td>
                          <td className="text-right">
                            {isEditing && isSelected ? (
                              <input
                                className="edit-input text-right"
                                type="number"
                                step="0.01"
                                value={editData.rate_per_kg || 0}
                                onChange={e => setEditData({ ...editData, rate_per_kg: Number(e.target.value) })}
                              />
                            ) : (
                              fmt.currency(row.rate_per_kg)
                            )}
                          </td>
                          <td className="text-right" style={{ fontWeight: 700 }}>{fmt.currency(row.amount)}</td>
                          <td>
                            {isEditing && isSelected ? (
                              <input
                                className="edit-input"
                                value={editData.remarks || ''}
                                onChange={e => setEditData({ ...editData, remarks: e.target.value })}
                              />
                            ) : (
                              row.remarks
                            )}
                          </td>
                          <td style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>{row.email}</td>
                        </tr>
                      );
                    });

                    return (
                      <React.Fragment key={b}>
                        <tr style={{ background: 'rgba(71,85,105,0.08)', fontWeight: 800 }}>
                          <td colSpan={11} style={{ paddingLeft: 12 }}>BATCH: {b} TOTAL</td>
                          <td className="text-right" style={{ fontWeight: 800 }}>{fmt.number(g.g1)}</td>
                          <td className="text-right" style={{ fontWeight: 800 }}>{fmt.number(g.g2)}</td>
                          <td className="text-right" style={{ fontWeight: 800 }}>{fmt.number(g.dc)}</td>
                          <td className="text-right" style={{ fontWeight: 800 }}>{fmt.number(g.rec)}</td>
                          <td className="text-right" style={{ fontWeight: 800, color: 'var(--corp-rep)' }}>
                            {g.rec > 0 ? fmt.currency(g.amt / g.rec) : '₹ 0.00'}
                          </td>
                          <td className="text-right" style={{ fontWeight: 800 }}>{fmt.currency(g.amt)}</td>
                          <td colSpan={2}></td>
                        </tr>
                        {itemsHtml}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 800 }}>
                  <td colSpan={11} style={{ textAlign: 'right', fontWeight: 800 }}>NET TOTAL:</td>
                  <td className="text-right">{fmt.number(netG1)}</td>
                  <td className="text-right">{fmt.number(netG2)}</td>
                  <td className="text-right">{fmt.number(netDC)}</td>
                  <td className="text-right">{fmt.number(netRec)}</td>
                  <td className="text-right" style={{ color: 'blue' }}>{netRec > 0 ? fmt.currency(netAmt / netRec) : '₹ 0.00'}</td>
                  <td className="text-right">{fmt.currency(netAmt)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      {!loading && !fy && (
        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text-tertiary)' }}>
          Select a <strong>Financial Year</strong> to load RM Purchase data.
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
