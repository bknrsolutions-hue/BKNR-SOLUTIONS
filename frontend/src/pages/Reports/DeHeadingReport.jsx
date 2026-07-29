/**
 * DeHeadingReport.jsx – De-Heading Production Wages Ledger
 */
import React, { useState } from 'react';
import {
  ReportHeader, FilterBar, FilterBox, FilterSelect, FilterInput,
  KPIGrid, KPICard, Loader, ErrorBox, SearchInput, EmptyRow,
  FinYearSelect, useReport, fmt, ConfirmModal, AuditDrawer, RowActionMenu, InlineSearchableSelect
} from './ReportShell';
import { WagesTabNav, ContractorAnalysisView, DailyBasisMatrixView, KgBasisMatrixView } from './WagesReportTabs';

const getWorkerDetails = (row) => {
  const wType = String(row.worker_type || '').toLowerCase();
  const isContractor = wType.includes('contractor') || (!wType && row.contractor);
  
  let count = Number(row.no_of_workers || 0);
  let idsList = [];
  if (row.worker_ids) {
    idsList = String(row.worker_ids).split(',').map(s => s.trim()).filter(Boolean);
    if (!count) count = idsList.length;
  }

  if (isContractor) {
    if (count > 0) return `${count} Worker${count > 1 ? 's' : ''}`;
    return '-';
  } else {
    if (count > 0 && row.worker_ids) {
      return `${count} Worker${count > 1 ? 's' : ''} (${row.worker_ids})`;
    }
    if (count > 0) {
      return `${count} Worker${count > 1 ? 's' : ''}`;
    }
    if (row.worker_ids) {
      return `${idsList.length} Worker${idsList.length > 1 ? 's' : ''} (${row.worker_ids})`;
    }
    return '-';
  }
};

export default function DeHeadingReport({ activeRoute }) {
  const [fy, setFy] = useState('');
  const [month, setMonth] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [batch, setBatch] = useState('');
  const [contractor, setContractor] = useState('');
  const [species, setSpecies] = useState('');
  const [peeling, setPeeling] = useState('');
  const [production, setProduction] = useState('');
  const [search, setSearch] = useState('');
  const [reportTab, setReportTab] = useState('ledger');

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
    if (contractor && r.contractor !== contractor) return false;
    if (species && r.species !== species) return false;
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
  let totalHoso = 0, totalHlso = 0, totalAmt = 0, diffSum = 0, diffKgSum = 0;

  filteredRows.forEach(r => {
    // Note: recalculate on fly to match HTML/backend logic
    const hoso = Number(r.hoso_qty || 0);
    const hlso = Number(r.hlso_qty || 0);
    const rate = Number(r.rate_per_kg || 0);
    const target = Number(r.target_yield_percent || 0);
    const yld = hoso > 0 ? (hlso / hoso) * 100 : 0;
    const diffPct = yld - target;
    const diffKg = target > 0 ? (hlso / (target / 100)) - hoso : 0;

    totalHoso += hoso;
    totalHlso += hlso;
    totalAmt += hlso * rate;
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
    if (field === 'hoso_qty' || field === 'hlso_qty' || field === 'rate_per_kg') {
      const hoso = Number(updated.hoso_qty || 0);
      const hlso = Number(updated.hlso_qty || 0);
      const rate = Number(updated.rate_per_kg || 0);
      const target = Number(updated.target_yield_percent || 0);

      updated.yield_percent = hoso > 0 ? (hlso / hoso) * 100 : 0;
      updated.diff_percent = updated.yield_percent - target;
      updated.diff_qty = target > 0 ? (hlso / (target / 100)) - hoso : 0;
      updated.amount = hlso * rate;
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
        title="De-Heading Production Wages Ledger"
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
        <FilterBox label="Species">
          <FilterSelect value={species} onChange={setSpecies}>
            <option value="">ALL SPECIES</option>
            {(data?.species_list || []).map(s => <option key={s} value={s}>{s}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Peeling At">
          <FilterSelect value={peeling} onChange={setPeeling}>
            <option value="">ALL LOCATIONS</option>
            {(data?.peeling_locations || []).map(p => <option key={p} value={p}>{p}</option>)}
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

      <WagesTabNav activeTab={reportTab} onChangeTab={setReportTab} />

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
          {reportTab === 'ledger' && (
            <>
              <KPIGrid>
                <KPICard label="Records" value={filteredRows.length} accent="var(--corp-dash)" />
                <KPICard label="Total HOSO (Kg)" value={fmt.number(totalHoso)} accent="var(--corp-ops)" />
                <KPICard label="Total HLSO (Kg)" value={fmt.number(totalHlso)} accent="var(--corp-rep)" />
                <KPICard label="Average Yield %" value={totalHoso > 0 ? fmt.pct((totalHlso / totalHoso) * 100) : '0.00%'} accent="var(--corp-dash)" />
                <KPICard label="Total Wages" value={fmt.currency(totalAmt)} accent="var(--corp-fin)" />
              </KPIGrid>

              <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                <table className="bknr-table" style={{ minWidth: 1750, width: '100%' }}>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>#</th>
                      <th style={{ width: 80 }}>Date</th>
                      <th style={{ width: 95 }}>Batch No</th>
                      <th style={{ width: 140 }}>Contractor</th>
                      <th style={{ width: 90 }}>Table No</th>
                      <th style={{ width: 130 }}>Workers / IDs</th>
                      <th style={{ width: 100 }}>Species</th>
                      <th style={{ width: 90 }}>H-Cnt</th>
                      <th style={{ width: 100 }}>HOSO Kg</th>
                      <th style={{ width: 100 }}>HLSO Kg</th>
                      <th style={{ width: 100 }}>Target %</th>
                      <th style={{ width: 80 }}>Actual %</th>
                      <th style={{ width: 80 }}>Diff %</th>
                      <th style={{ width: 90 }}>Diff Kg</th>
                      <th style={{ width: 80 }}>Rate</th>
                      <th style={{ width: 120 }}>Amount</th>
                      <th style={{ width: 110 }}>Peeling At</th>
                      <th style={{ width: 110 }}>Prod For</th>
                      <th style={{ width: 100 }}>User</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length === 0 ? (
                      <EmptyRow cols={19} />
                    ) : (
                      filteredRows.map((row, index) => {
                        const isSelected = selectedRow?.id === row.id;
                        const slNo = filteredRows.length - index;

                        // Compute values
                        const hosoVal = isEditing && isSelected ? Number(editData.hoso_qty || 0) : Number(row.hoso_qty || 0);
                        const hlsoVal = isEditing && isSelected ? Number(editData.hlso_qty || 0) : Number(row.hlso_qty || 0);
                        const rateVal = isEditing && isSelected ? Number(editData.rate_per_kg || 0) : Number(row.rate_per_kg || 0);
                        const targetVal = isEditing && isSelected ? Number(editData.target_yield_percent || 0) : Number(row.target_yield_percent || 0);

                        const yld = hosoVal > 0 ? (hlsoVal / hosoVal) * 100 : 0;
                        const diffPct = yld - targetVal;
                        const diffKg = targetVal > 0 ? (hlsoVal / (targetVal / 100)) - hosoVal : 0;
                        const amt = hlsoVal * rateVal;

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
                            <td className="text-center">{slNo}</td>
                            <td className="text-center">{row.date}</td>
                            <td style={{ fontWeight: 700, color: 'var(--corp-ops)' }}>{row.batch_number}</td>
                            <td>{row.contractor}</td>
                            <td className="text-center">T-{row.table_no}</td>
                            <td>{getWorkerDetails(row)}</td>
                            <td>{row.species}</td>
                            <td className="text-center">{row.hoso_count || '-'}</td>

                            <td className="text-right">
                              {isEditing && isSelected ? (
                                <input
                                  type="number"
                                  className="edit-input"
                                  style={{ width: 70 }}
                                  value={editData.hoso_qty || ''}
                                  onChange={e => handleEditChange('hoso_qty', e.target.value)}
                                />
                              ) : (
                                fmt.number(hosoVal)
                              )}
                            </td>

                            <td className="text-right" style={{ fontWeight: 700 }}>
                              {isEditing && isSelected ? (
                                <input
                                  type="number"
                                  className="edit-input"
                                  style={{ width: 70 }}
                                  value={editData.hlso_qty || ''}
                                  onChange={e => handleEditChange('hlso_qty', e.target.value)}
                                />
                              ) : (
                                fmt.number(hlsoVal)
                              )}
                            </td>

                            <td className="text-center">
                              {isEditing && isSelected ? (
                                <input
                                  type="number"
                                  className="edit-input"
                                  style={{ width: 60 }}
                                  value={editData.target_yield_percent || ''}
                                  onChange={e => handleEditChange('target_yield_percent', e.target.value)}
                                />
                              ) : (
                                fmt.pct(targetVal)
                              )}
                            </td>

                            <td className="text-center" style={{ fontWeight: 700, color: 'var(--corp-rep)' }}>
                              {fmt.pct(yld)}
                            </td>

                            <td className="text-center">
                              <span style={{
                                background: diffPct >= 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                color: diffPct >= 0 ? '#059669' : '#dc2626',
                                border: diffPct >= 0 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontWeight: '800',
                                display: 'inline-block'
                              }}>
                                {diffPct >= 0 ? `+${fmt.pct(diffPct)}` : fmt.pct(diffPct)}
                              </span>
                            </td>

                            <td className="text-right">
                              <span style={{
                                background: diffKg >= 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                color: diffKg >= 0 ? '#059669' : '#dc2626',
                                border: diffKg >= 0 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontWeight: '800',
                                display: 'inline-block'
                              }}>
                                {diffKg > 0 ? `+${fmt.number(diffKg)}` : fmt.number(diffKg)}
                              </span>
                            </td>

                            <td className="text-right">
                              {isEditing && isSelected ? (
                                <input
                                  type="number"
                                  className="edit-input"
                                  style={{ width: 60 }}
                                  value={editData.rate_per_kg || ''}
                                  onChange={e => handleEditChange('rate_per_kg', e.target.value)}
                                />
                              ) : (
                                `₹${rateVal.toFixed(2)}`
                              )}
                            </td>

                            <td className="text-right" style={{ fontWeight: 800, color: 'var(--corp-fin)' }}>
                              {fmt.currency(amt)}
                            </td>

                            <td>{row.peeling_at}</td>
                            <td>{row.production_for}</td>
                            <td style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
                              {row.email ? row.email.split('@')[0] : ''}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 800 }}>
                      <td colSpan={9} style={{ textAlign: 'right', fontWeight: 800 }}>TOTALS:</td>
                      <td className="text-right">{fmt.number(totalHoso)}</td>
                      <td className="text-right">{fmt.number(totalHlso)}</td>
                      <td className="text-center" style={{ color: 'var(--corp-rep)' }}>
                        {totalHoso > 0 ? fmt.pct((totalHlso / totalHoso) * 100) : '0.00%'}
                      </td>
                      <td></td>
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

          {reportTab === 'contractor' && (
            <ContractorAnalysisView rows={filteredRows} monthFilter={month} />
          )}

          {reportTab === 'daily_basis' && (
            <DailyBasisMatrixView rows={filteredRows} monthFilter={month} />
          )}

          {reportTab === 'kg_basis' && (
            <KgBasisMatrixView rows={filteredRows} monthFilter={month} />
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
        auditUrl={`${activeRoute}/audit_all`}
      />
    </div>
  );
}
