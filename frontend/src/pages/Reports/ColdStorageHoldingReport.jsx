/**
 * ColdStorageHoldingReport.jsx – Cold Storage Rent & Charges Report
 */
import React, { useState } from 'react';
import {
  ReportHeader, FilterBar, FilterBox, FilterSelect, FilterInput,
  KPIGrid, KPICard, Loader, ErrorBox, SearchInput, EmptyRow,
  useReport, fmt
} from './ReportShell';

export default function ColdStorageHoldingReport({ activeRoute }) {
  const [fromDate, setFrom] = useState('');
  const [toDate, setTo]     = useState('');
  const [view, setView]     = useState('summary'); // 'summary' | 'ledger'
  const [csFilter, setCsFilter] = useState('');
  const [prodFilter, setProdFilter] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data, loading, error, reload } = useReport({
    url: activeRoute,
    params: { ...(fromDate ? {from_date: fromDate} : {}), ...(toDate ? {to_date: toDate} : {}) },
    deps: [fromDate, toDate],
  });

  const rawLedgerRows = data?.rows || [];
  const rawComboRows = data?.combo_rows || [];

  // Filter combo rows (summary)
  const filteredComboRows = rawComboRows.filter(r => {
    if (csFilter && r.cold_storage_name !== csFilter) return false;
    if (prodFilter && r.production_for !== prodFilter) return false;
    if (speciesFilter && r.species !== speciesFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const match = Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  // Filter ledger rows
  const filteredLedgerRows = rawLedgerRows.filter(r => {
    if (csFilter && r.cold_storage_name !== csFilter) return false;
    if (prodFilter && r.production_for !== prodFilter) return false;
    if (speciesFilter && r.species !== speciesFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const match = Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  // Dynamic filter options lists
  const csList = [...new Set(rawComboRows.map(r => r.cold_storage_name).filter(Boolean))].sort();
  const prodList = [...new Set(rawComboRows.map(r => r.production_for).filter(Boolean))].sort();
  const speciesList = data?.species_list || [...new Set(rawComboRows.map(r => r.species).filter(Boolean))].sort();

  // Dynamic KPI calculations based on filtered summary rows
  const totalBalanceMc = filteredComboRows.reduce((s, r) => s + Number(r.balance_mc || 0), 0);
  const totalInvValue = filteredComboRows.reduce((s, r) => s + Number(r.inv_value_balance || 0), 0);
  const totalHoldingCost = filteredComboRows.reduce((s, r) => s + Number(r.holding_cost || 0), 0);
  const totalPayable = filteredComboRows.reduce((s, r) => s + Number(r.total_payable || 0), 0);

  const TAB = (t, label) => (
    <button
      onClick={() => setView(t)}
      style={{
        padding: '8px 18px', fontSize: 11, fontWeight: 800, borderRadius: 6,
        border: 'none', cursor: 'pointer', textTransform: 'uppercase',
        background: view === t ? 'var(--corp-rep)' : 'var(--input-bg)',
        color: view === t ? '#fff' : 'var(--text-secondary)',
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="report-viewer-card">
      <ReportHeader
        title="Cold Storage Rent & Charges Report"
        subtitle={`${view === 'summary' ? filteredComboRows.length : filteredLedgerRows.length} entries loaded`}
        loading={loading}
        onReload={reload}
      />

      <FilterBar>
        <FilterBox label="From Date">
          <FilterInput type="date" value={fromDate} onChange={setFrom} />
        </FilterBox>
        <FilterBox label="To Date">
          <FilterInput type="date" value={toDate} onChange={setTo} />
        </FilterBox>
        <FilterBox label="Cold Storage">
          <FilterSelect value={csFilter} onChange={setCsFilter}>
            <option value="">ALL STORAGES</option>
            {csList.map(cs => <option key={cs} value={cs}>{cs}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Production For">
          <FilterSelect value={prodFilter} onChange={setProdFilter}>
            <option value="">ALL COMPANIES</option>
            {prodList.map(pf => <option key={pf} value={pf}>{pf}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Species">
          <FilterSelect value={speciesFilter} onChange={setSpeciesFilter}>
            <option value="">ALL SPECIES</option>
            {speciesList.map(s => <option key={s} value={s}>{s}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Search">
          <SearchInput value={search} onChange={setSearch} placeholder="Batch, variety..." />
        </FilterBox>
      </FilterBar>

      {loading && <Loader />}
      {error && <ErrorBox msg={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <KPIGrid>
            <KPICard label="Balance MC" value={totalBalanceMc} accent="var(--corp-dash)" />
            <KPICard label="Inventory Value (₹)" value={fmt.currency(totalInvValue)} accent="var(--corp-ops)" />
            <KPICard label="Holding Cost (₹)" value={fmt.currency(totalHoldingCost)} accent="var(--corp-rep)" />
            <KPICard label="Total Payable (₹)" value={fmt.currency(totalPayable)} accent="var(--corp-fin)" />
          </KPIGrid>

          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            {TAB('summary', 'Batch Summary')} {TAB('ledger', 'Ledger Movements')}
          </div>

          {view === 'summary' && (
            <div className="card" style={{ marginTop: 0 }}>
              <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                <table className="bknr-table" style={{ minWidth: 1400, width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Batch No</th>
                      <th>Cold Storage</th>
                      <th>Species / Variety / Grade</th>
                      <th className="text-center">Glaze</th>
                      <th className="text-center">Freezer</th>
                      <th className="text-right">In MC</th>
                      <th className="text-right">Out MC</th>
                      <th className="text-right">Balance MC</th>
                      <th className="text-right">Balance Qty (Kg)</th>
                      <th className="text-right">Holding Cost (₹)</th>
                      <th className="text-right">Other Charges (₹)</th>
                      <th className="text-right">Payable (₹)</th>
                      <th className="text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredComboRows.length === 0 ? <EmptyRow cols={13} /> :
                      filteredComboRows.map((r, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{r.batch_number}</td>
                          <td>{r.cold_storage_name}</td>
                          <td style={{ fontSize: 11 }}>{r.species} / {r.variety} / {r.grade}</td>
                          <td className="text-center">{r.glaze}</td>
                          <td className="text-center">{r.freezer}</td>
                          <td className="text-right">{r.in_mc}</td>
                          <td className="text-right">{r.out_mc}</td>
                          <td className="text-right" style={{ fontWeight: 700 }}>{r.balance_mc}</td>
                          <td className="text-right">{fmt.number(r.balance_qty || r.balance_kg)}</td>
                          <td className="text-right">{fmt.currency(r.holding_cost)}</td>
                          <td className="text-right">{fmt.currency(r.other_charges)}</td>
                          <td className="text-right" style={{ fontWeight: 800, color: 'var(--corp-rep)' }}>
                            {fmt.currency(r.total_payable)}
                          </td>
                          <td className="text-center">
                            <span style={{
                              padding: '3px 10px', fontSize: 10, fontWeight: 800, borderRadius: 20, textTransform: 'uppercase',
                              background: r.status === 'PAID' || r.payment_status === 'PAID' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                              color: r.status === 'PAID' || r.payment_status === 'PAID' ? '#10b981' : '#f59e0b',
                              border: r.status === 'PAID' || r.payment_status === 'PAID' ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(245,158,11,0.3)',
                            }}>{r.status || r.payment_status || 'UNPAID'}</span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {view === 'ledger' && (
            <div className="card" style={{ marginTop: 0 }}>
              <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                <table className="bknr-table" style={{ minWidth: 1400, width: '100%' }}>
                  <thead>
                    <tr>
                      <th>In Date</th>
                      <th>Cold Storage</th>
                      <th>Batch No</th>
                      <th>Movement</th>
                      <th>Species / Variety / Grade</th>
                      <th className="text-right">MC</th>
                      <th className="text-right">Qty (Kg)</th>
                      <th className="text-right">Inv Value (₹)</th>
                      <th className="text-right">Holding Cost (₹)</th>
                      <th className="text-right">Other (₹)</th>
                      <th className="text-right">Payable (₹)</th>
                      <th className="text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLedgerRows.length === 0 ? <EmptyRow cols={12} /> :
                      filteredLedgerRows.map((r, i) => (
                        <tr key={i}>
                          <td className="text-center">{r.in_date}</td>
                          <td>{r.cold_storage_name}</td>
                          <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{r.batch_number}</td>
                          <td className="text-center">
                            <span style={{
                              padding: '2px 8px', fontSize: 10, fontWeight: 800, borderRadius: 12, textTransform: 'uppercase',
                              background: r.cargo_movement_type === 'IN' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                              color: r.cargo_movement_type === 'IN' ? '#10b981' : '#ef4444',
                              border: r.cargo_movement_type === 'IN' ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(239,68,68,0.3)',
                            }}>{r.cargo_movement_type}</span>
                          </td>
                          <td style={{ fontSize: 11 }}>{r.species} / {r.variety} / {r.grade}</td>
                          <td className="text-right">{r.no_of_mc}</td>
                          <td className="text-right">{fmt.number(r.quantity)}</td>
                          <td className="text-right">{fmt.currency(r.inventory_value)}</td>
                          <td className="text-right">{fmt.currency(r.holding_cost)}</td>
                          <td className="text-right">{fmt.currency(r.other_charges)}</td>
                          <td className="text-right" style={{ fontWeight: 800 }}>{fmt.currency(r.total_payable)}</td>
                          <td className="text-center">
                            <span style={{
                              padding: '2px 8px', fontSize: 10, fontWeight: 800, borderRadius: 12, textTransform: 'uppercase',
                              background: r.status === 'PAID' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
                              color: r.status === 'PAID' ? '#10b981' : '#f59e0b',
                              border: r.status === 'PAID' ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(245,158,11,0.3)',
                            }}>{r.status || 'UNPAID'}</span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

