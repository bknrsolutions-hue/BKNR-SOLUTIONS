/**
 * PeelingReport.jsx – Peeling Production Ledger
 */
import React, { useState } from 'react';
import {
  ReportHeader, FilterBar, FilterBox, FilterSelect, FilterInput,
  KPIGrid, KPICard, Loader, ErrorBox, SearchInput, EmptyRow,
  FinYearSelect, useReport, fmt, ConfirmModal, AuditDrawer, RowActionMenu, InlineSearchableSelect
} from './ReportShell';

export default function PeelingReport({ activeRoute }) {
  const [fy, setFy] = useState('');
  const [month, setMonth] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [batch, setBatch] = useState('');
  const [contractor, setContractor] = useState('');
  const [variety, setVariety] = useState('');
  const [peeling, setPeeling] = useState('');
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
    if (batch && r.batch_number !== batch) return false;
    if (contractor && r.contractor_name !== contractor) return false;
    if (variety && r.variety_name !== variety) return false;
    if (peeling && r.peeling_at !== peeling) return false;
    if (production && r.production_for !== production) return false;
    if (search) {
      const q = search.toLowerCase();
      const match = Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  // Calculate totals
  let totalHlso = 0, totalPeeled = 0, totalAmt = 0, diffSum = 0, diffKgSum = 0;

  filteredRows.forEach(r => {
    const hlso = Number(r.hlso_qty || 0);
    const peeled = Number(r.peeled_qty || 0);
    const rate = Number(r.rate || 0);
    const target = Number(r.target_yield_percent || 0);
    const yld = hlso > 0 ? (peeled / hlso) * 100 : 0;
    const diffPct = yld - target;
    const diffKg = target > 0 ? (peeled / (target / 100)) - hlso : 0;

    totalHlso += hlso;
    totalPeeled += peeled;
    totalAmt += peeled * rate;
    diffSum += diffPct;
    diffKgSum += diffKg;
  });

  const getParamsString = (actionType) => {
    const visibleIds = filteredRows.map(r => r.id).join(',');
    const pf = localStorage.getItem('production_for_filter') || '';
    const loc = localStorage.getItem('plant_location_filter') || '';
    let q = `fy=${fy}&ids=${visibleIds}`;
    if (month) q += `&month=${month}`;
    if (contractor) q += `&contractor=${encodeURIComponent(contractor)}`;
    if (pf) q += `&global_production_for=${encodeURIComponent(pf)}`;
    if (loc) q += `&global_location=${encodeURIComponent(loc)}`;
    return q;
  };

  const executeAction = (action) => {
    const q = getParamsString(action);
    if (action === 'print_table') {
      window.print();
    } else if (action === 'excel_table') {
      window.location.href = `${activeRoute}/export_excel?${q}`;
    } else if (action === 'pdf_table') {
      window.location.href = `${activeRoute}/export_pdf?${q}`;
    } else if (action === 'print_bill') {
      if (!contractor || !month) return alert('Select Month & Contractor first!');
      window.open(`${activeRoute}/contractor_monthly_bill?month=${month}&contractor=${encodeURIComponent(contractor)}&ids=${filteredRows.map(r => r.id).join(',')}`, '_blank');
    } else if (action === 'pdf_bill') {
      if (!contractor || !month) return alert('Select Month & Contractor first!');
      window.location.href = `${activeRoute}/contractor_monthly_bill?month=${month}&contractor=${encodeURIComponent(contractor)}&ids=${filteredRows.map(r => r.id).join(',')}&download=true`;
    }
  };

  const handleEdit = () => {
    if (!selectedRow) return alert('Select a row first!');
    setEditData({ ...selectedRow });
    setIsEditing(true);
  };

  const handleEditChange = (field, val) => {
    const updated = { ...editData, [field]: val };
    if (field === 'hlso_qty' || field === 'peeled_qty' || field === 'rate') {
      const hlso = Number(updated.hlso_qty || 0);
      const peeled = Number(updated.peeled_qty || 0);
      const rate = Number(updated.rate || 0);
      const target = Number(updated.target_yield_percent || 0);

      updated.yield_percent = hlso > 0 ? (peeled / hlso) * 100 : 0;
      updated.diff_percent = updated.yield_percent - target;
      updated.diff_qty = target > 0 ? (peeled / (target / 100)) - hlso : 0;
      updated.amount = peeled * rate;
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
        alert('Changes saved successfully.');
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
        reload();
      } else {
        alert('Cancel Failed!');
      }
    } catch (err) {
      alert('Error cancelling row');
    }
  };

  const menuActions = [
    { label: 'Edit Selected Row', onClick: handleEdit, disabled: !selectedRow || isEditing },
    { label: 'Save Changes', onClick: handleSave, disabled: !isEditing },
    { label: 'View Audit History', onClick: () => setAuditOpen(true) },
    { divider: true },
    { header: 'Export Options' },
    { label: 'Print Native Table', onClick: () => executeAction('print_table') },
    { label: 'Export Table PDF', onClick: () => executeAction('pdf_table') },
    { label: 'Export Excel', onClick: () => executeAction('excel_table') },
    { divider: true },
    { header: 'Monthly Bill' },
    { label: 'Print Bill', onClick: () => executeAction('print_bill'), disabled: !contractor || !month },
    { label: 'Download Bill PDF', onClick: () => executeAction('pdf_bill'), disabled: !contractor || !month },
    { divider: true },
    { label: 'Cancel Record', onClick: () => { setConfirmAction('cancel'); setConfirmModalOpen(true); }, danger: true, disabled: !selectedRow }
  ];

  return (
    <div className="report-viewer-card">
      <ReportHeader
        title="Peeling Production Ledger"
        subtitle={`${filteredRows.length} entries loaded${fy ? ` — FY ${fy}–${Number(fy)+1}` : ''}`}
        loading={loading}
        onReload={reload}
        exportUrl={fy ? `${activeRoute}/export_excel?fy=${fy}` : null}
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
        <FilterBox label="Batch">
          <FilterSelect value={batch} onChange={setBatch}>
            <option value="">ALL BATCHES</option>
            {(data?.batches || []).map(b => <option key={b} value={b}>{b}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Contractor">
          <FilterSelect value={contractor} onChange={setContractor}>
            <option value="">ALL CONTRACTORS</option>
            {(data?.contractors || []).map(c => <option key={c} value={c}>{c}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Variety">
          <FilterSelect value={variety} onChange={setVariety}>
            <option value="">ALL VARIETIES</option>
            {(data?.varieties_dropdown || []).map(v => <option key={v} value={v}>{v}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Peeling At">
          <FilterSelect value={peeling} onChange={setPeeling}>
            <option value="">ALL LOCATIONS</option>
            {(data?.locations || []).map(p => <option key={p} value={p}>{p}</option>)}
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

      {!loading && !error && (
        <>
          <KPIGrid>
            <KPICard label="Records" value={filteredRows.length} accent="var(--corp-dash)" />
            <KPICard label="Total Peeled (Kg)" value={fmt.number(totalPeeled)} accent="var(--corp-ops)" />
            <KPICard label="Average Yield %" value={totalHlso > 0 ? fmt.pct((totalPeeled / totalHlso) * 100) : '0.00%'} accent="var(--corp-rep)" />
            <KPICard label="Total Wages" value={fmt.currency(totalAmt)} accent="var(--corp-fin)" />
          </KPIGrid>

          <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table className="bknr-table" style={{ minWidth: 1550, width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th style={{ width: 80 }}>Date</th>
                  <th style={{ width: 95 }}>Batch</th>
                  <th style={{ width: 140 }}>Contractor</th>
                  <th style={{ width: 110 }}>Variety</th>
                  <th style={{ width: 65 }}>Count</th>
                  <th style={{ width: 85 }}>HLSO Kg</th>
                  <th style={{ width: 85 }}>Peeled Kg</th>
                  <th style={{ width: 75 }}>Tgt %</th>
                  <th style={{ width: 75 }}>Act %</th>
                  <th style={{ width: 75 }}>Diff %</th>
                  <th style={{ width: 85 }}>Diff Kg</th>
                  <th style={{ width: 70 }}>Rate</th>
                  <th style={{ width: 100 }}>Amount</th>
                  <th style={{ width: 110 }}>Peeling At</th>
                  <th style={{ width: 110 }}>Prod For</th>
                  <th style={{ width: 100 }}>User</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <EmptyRow cols={17} />
                ) : (
                  filteredRows.map((row, index) => {
                    const isSelected = selectedRow?.id === row.id;
                    const slNo = filteredRows.length - index;

                    // Compute values
                    const hlsoVal = isEditing && isSelected ? Number(editData.hlso_qty || 0) : Number(row.hlso_qty || 0);
                    const peeledVal = isEditing && isSelected ? Number(editData.peeled_qty || 0) : Number(row.peeled_qty || 0);
                    const rateVal = isEditing && isSelected ? Number(editData.rate || 0) : Number(row.rate || 0);
                    const targetVal = isEditing && isSelected ? Number(editData.target_yield_percent || 0) : Number(row.target_yield_percent || 0);

                    const yld = hlsoVal > 0 ? (peeledVal / hlsoVal) * 100 : 0;
                    const diffPct = yld - targetVal;
                    const diffKg = targetVal > 0 ? (peeledVal / (targetVal / 100)) - hlsoVal : 0;
                    const amt = peeledVal * rateVal;

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
                        <td className="text-center" style={{ fontWeight: 700 }}>
                          {isEditing && isSelected ? (
                            <input
                              className="edit-input"
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
                              value={editData.contractor_name}
                              onChange={val => handleEditChange('contractor_name', val)}
                              options={data?.contractors || []}
                            />
                          ) : (
                            row.contractor_name
                          )}
                        </td>
                        <td>
                          {isEditing && isSelected ? (
                            <InlineSearchableSelect
                              value={editData.variety_name}
                              onChange={val => handleEditChange('variety_name', val)}
                              options={data?.varieties_dropdown || []}
                            />
                          ) : (
                            row.variety_name
                          )}
                        </td>
                        <td className="text-center">
                          {isEditing && isSelected ? (
                            <input
                              className="edit-input text-center"
                              value={editData.hlso_count || ''}
                              onChange={e => handleEditChange('hlso_count', e.target.value)}
                            />
                          ) : (
                            row.hlso_count
                          )}
                        </td>
                        <td className="text-right">
                          {isEditing && isSelected ? (
                            <input
                              className="edit-input text-right"
                              type="number"
                              value={editData.hlso_qty || ''}
                              onChange={e => handleEditChange('hlso_qty', e.target.value)}
                            />
                          ) : (
                            fmt.number(row.hlso_qty)
                          )}
                        </td>
                        <td className="text-right">
                          {isEditing && isSelected ? (
                            <input
                              className="edit-input text-right"
                              type="number"
                              value={editData.peeled_qty || ''}
                              onChange={e => handleEditChange('peeled_qty', e.target.value)}
                            />
                          ) : (
                            fmt.number(row.peeled_qty)
                          )}
                        </td>
                        <td className="text-center" style={{ color: 'var(--text-tertiary)' }}>
                          {fmt.pct(row.target_yield_percent)}
                        </td>
                        <td className="text-center" style={{ fontWeight: 700, color: 'var(--corp-rep)' }}>
                          {fmt.pct(yld)}
                        </td>
                        <td className="text-center" style={{ fontWeight: 700, color: diffPct >= 0 ? '#10b981' : '#ef4444' }}>
                          {fmt.pct(diffPct)}
                        </td>
                        <td className="text-right" style={{ fontWeight: 700, color: diffKg >= 0 ? '#10b981' : '#ef4444' }}>
                          {fmt.number(diffKg)}
                        </td>
                        <td className="text-right">
                          {isEditing && isSelected ? (
                            <input
                              className="edit-input text-right"
                              type="number"
                              value={editData.rate || ''}
                              onChange={e => handleEditChange('rate', e.target.value)}
                            />
                          ) : (
                            fmt.currency(row.rate)
                          )}
                        </td>
                        <td className="text-right" style={{ fontWeight: 700 }}>
                          {fmt.currency(amt)}
                        </td>
                        <td>
                          {isEditing && isSelected ? (
                            <InlineSearchableSelect
                              value={editData.peeling_at}
                              onChange={val => handleEditChange('peeling_at', val)}
                              options={data?.locations || []}
                            />
                          ) : (
                            row.peeling_at
                          )}
                        </td>
                        <td>
                          {isEditing && isSelected ? (
                            <InlineSearchableSelect
                              value={editData.production_for}
                              onChange={val => handleEditChange('production_for', val)}
                              options={data?.production_for_list || []}
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
                  <td colSpan={6} style={{ textAlign: 'right', fontWeight: 800 }}>TOTALS:</td>
                  <td className="text-right">{fmt.number(totalHlso)}</td>
                  <td className="text-right">{fmt.number(totalPeeled)}</td>
                  <td></td>
                  <td className="text-center" style={{ color: 'var(--corp-rep)' }}>
                    {totalHlso > 0 ? fmt.pct((totalPeeled / totalHlso) * 100) : '0.00%'}
                  </td>
                  <td className="text-center" style={{ color: (diffSum / (filteredRows.length || 1)) >= 0 ? '#10b981' : '#ef4444' }}>
                    {fmt.pct(diffSum / (filteredRows.length || 1))}
                  </td>
                  <td className="text-right" style={{ color: diffKgSum >= 0 ? '#10b981' : '#ef4444' }}>
                    {fmt.number(diffKgSum)}
                  </td>
                  <td></td>
                  <td className="text-right">{fmt.currency(totalAmt)}</td>
                  <td colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
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
        auditUrl={`${activeRoute}/audit_all`}
      />
    </div>
  );
}
