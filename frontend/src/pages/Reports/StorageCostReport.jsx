/**
 * StorageCostReport.jsx – FIFO Cold Storage Cost Report
 * Renders tabs, grouping, subtotals, and metrics with 1:1 legacy template parity.
 */
import React, { useState } from 'react';
import {
  ReportHeader, FilterBar, FilterBox, FilterSelect, FilterInput,
  KPIGrid, KPICard, Loader, ErrorBox, SearchInput,
  EmptyRow, useReport, fmt,
} from './ReportShell';

export default function StorageCostReport({ activeRoute }) {
  const [activeTab, setActiveTab] = useState('ledger');
  const [coldStorage, setColdStorage] = useState('');
  const [prodFor, setProdFor] = useState('');
  const [prodAt, setProdAt] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [search, setSearch] = useState('');

  const params = {};
  if (coldStorage) params.cold_storage_name = coldStorage;
  if (prodFor) params.production_for = prodFor;
  if (prodAt) params.production_at = prodAt;
  if (selectedMonth) params.selected_month = selectedMonth;

  const { data, loading, error, reload } = useReport({
    url: activeRoute || '/reports/storage_cost_report',
    params,
    deps: [coldStorage, prodFor, prodAt, selectedMonth],
  });

  // Data layers from API
  const transactionGroups = data?.transaction_groups || [];
  const productionForGroups = data?.production_for_groups || [];
  const facilitySummary = data?.facility_summary || [];

  // Options lists
  const csNames = data?.cold_storage_names || [];
  const pForList = data?.production_for_list || [];
  const pAtList = data?.production_locations || [];

  // Render helper for tab buttons
  const TabBtn = ({ id, label }) => (
    <button
      className={`v-btn ${activeTab === id ? 'active' : ''}`}
      onClick={() => setActiveTab(id)}
      style={{
        padding: '6px 12px',
        fontSize: '10px',
        fontWeight: '700',
        border: 'none',
        background: activeTab === id ? 'var(--card-bg)' : 'transparent',
        color: activeTab === id ? 'var(--corp-rep)' : 'var(--text-secondary)',
        borderRadius: '4px',
        cursor: 'pointer',
        textTransform: 'uppercase',
        transition: 'all 0.2s',
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="report-viewer-card">
      {/* Header and View tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
        <ReportHeader
          title="Cold Storage Cost Matrix (FIFO)"
          loading={loading}
          onReload={reload}
          onPrint={() => window.print()}
        />
        <div style={{ display: 'flex', background: 'var(--border-light)', padding: '3px', borderRadius: '6px', gap: '4px' }}>
          <TabBtn id="ledger" label="1. Ledger Matrix" />
          <TabBtn id="prod" label="2. Prod Cost" />
          <TabBtn id="storage" label="3. Storage Rent" />
          <TabBtn id="combined" label="4. Combined" />
          <TabBtn id="facility" label="5. Facility Summary" />
        </div>
      </div>

      {/* Filters group */}
      <FilterBar>
        <FilterBox label="Cold Storage Facility">
          <FilterSelect value={coldStorage} onChange={setColdStorage}>
            <option value="">All Facilities</option>
            {csNames.map(cs => <option key={cs} value={cs}>{cs}</option>)}
          </FilterSelect>
        </FilterBox>

        <FilterBox label="Production For (Client)">
          <FilterSelect value={prodFor} onChange={setProdFor}>
            <option value="">All Clients</option>
            {pForList.map(p => <option key={p} value={p}>{p}</option>)}
          </FilterSelect>
        </FilterBox>

        <FilterBox label="Location (Production At)">
          <FilterSelect value={prodAt} onChange={setProdAt}>
            <option value="">All Locations</option>
            {pAtList.map(loc => <option key={loc} value={loc}>{loc}</option>)}
          </FilterSelect>
        </FilterBox>

        <FilterBox label="Billing Month">
          <FilterInput type="month" value={selectedMonth} onChange={setSelectedMonth} />
        </FilterBox>

        <FilterBox label="Search">
          <SearchInput value={search} onChange={setSearch} />
        </FilterBox>
      </FilterBar>

      {loading && <Loader />}
      {error && <ErrorBox msg={error} onRetry={reload} />}

      {!loading && !error && data && (
        <>
          {/* KPI matrix cards */}
          <KPIGrid>
            <KPICard label="Closing Stock" value={`${data.total_closing_mc || 0} MC`} accent="#0ea5e9" />
            <KPICard label="Prod Cost" value={fmt.currency(data.total_prod_cost)} accent="#8b5cf6" />
            <KPICard label="Storage Rent" value={fmt.currency(data.total_storage_rent)} accent="#d97706" />
            <KPICard label="Handling / L&U" value={fmt.currency(data.total_charges)} accent="#3b82f6" />
            <KPICard label="Total Payable" value={fmt.currency(data.total_payable_all)} accent="#10b981" />
            <KPICard label="Amount Paid" value={fmt.currency(data.total_paid_all)} accent="#22c55e" />
            <KPICard label="Pending Dues" value={fmt.currency(data.total_pending_all)} accent="#ef4444" />
          </KPIGrid>

          {/* Table Container */}
          <div className="card" style={{ marginTop: 0, padding: 0, overflow: 'hidden' }}>
            <div className="table-responsive">

              {/* TAB 1: LEDGER MATRIX */}
              {activeTab === 'ledger' && (
                <table className="bknr-table" style={{ minWidth: 1400 }}>
                  <thead>
                    <tr>
                      <th style={{ width: '3%' }}>#</th>
                      <th>Client</th>
                      <th>Location</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Cold Storage</th>
                      <th>Batch No</th>
                      <th>Freezer</th>
                      <th>Variety / Grade</th>
                      <th>Packing</th>
                      <th>MC (In/Out)</th>
                      <th>Loose</th>
                      <th>Qty (KG)</th>
                      <th>Balance MC</th>
                      <th>Status</th>
                      <th>Prod Cost</th>
                      <th>Rent Type</th>
                      <th>Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactionGroups.length === 0 ? (
                      <EmptyRow cols={18} />
                    ) : (() => {
                      let globalIdx = 0;
                      return transactionGroups.map((tg, tgi) => (
                        <React.Fragment key={tgi}>
                          <tr className="tr-group-header" style={{ background: 'var(--primary)', color: '#fff', fontWeight: 800 }}>
                            <td colSpan={18} style={{ textAlign: 'left', padding: '8px 12px', textTransform: 'uppercase' }}>
                              CLIENT: {tg.production_for}
                            </td>
                          </tr>
                          {(tg.location_groups || []).map((lg, lgi) => (
                            <React.Fragment key={lgi}>
                              <tr className="tr-loc-header" style={{ background: 'var(--border-light)', color: 'var(--text-primary)', fontWeight: 700 }}>
                                <td colSpan={18} style={{ textAlign: 'left', padding: '6px 20px', textTransform: 'uppercase' }}>
                                  LOCATION: {lg.production_at}
                                </td>
                              </tr>
                              {(lg.transactions || [])
                                .filter(t => !search || Object.values(t).some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase())))
                                .map((t, ti) => {
                                  globalIdx++;
                                  return (
                                    <tr key={ti}>
                                      <td className="text-center" style={{ color: 'var(--text-tertiary)' }}>{globalIdx}</td>
                                      <td style={{ fontWeight: 700 }}>{t.production_for}</td>
                                      <td style={{ fontWeight: 700, color: 'var(--corp-dash)' }}>{t.production_at}</td>
                                      <td>{t.date ? new Date(t.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                                      <td className="text-center">
                                        <span className={`badge ${t.type === 'IN' ? 'bg-in' : 'bg-out'}`} style={{
                                          padding: '2px 6px', fontSize: '9px', fontWeight: 800, borderRadius: '4px',
                                          background: t.type === 'IN' ? 'rgba(22, 163, 74, 0.1)' : 'rgba(220, 38, 38, 0.1)',
                                          color: t.type === 'IN' ? '#16a34a' : '#dc2626'
                                        }}>
                                          {t.type}
                                        </span>
                                      </td>
                                      <td style={{ textAlign: 'left', fontWeight: 800 }}>{t.cold_storage_name}</td>
                                      <td style={{ fontWeight: 800, color: 'var(--corp-dash)' }}>{t.batch_number}</td>
                                      <td>{t.freezer}</td>
                                      <td>{t.variety} / {t.grade}</td>
                                      <td>{t.packing_style}</td>
                                      <td className={t.type === 'IN' ? 'val-pos' : 'val-neg'} style={{ fontWeight: 700, color: t.type === 'IN' ? '#16a34a' : '#dc2626' }}>
                                        {t.type === 'IN' ? `+${t.mc}` : `-${t.mc}`}
                                      </td>
                                      <td>{t.loose || '—'}</td>
                                      <td style={{ fontWeight: 700 }}>{fmt.number(t.qty_kg)}</td>
                                      <td style={{ fontWeight: 800, color: 'var(--corp-rep)', background: 'var(--bg-light)' }}>{t.running_balance}</td>
                                      <td>
                                        <span className="badge" style={{
                                          padding: '2px 6px', fontSize: '9px', fontWeight: 800, borderRadius: '4px',
                                          background: t.status === 'HOLDING' ? 'rgba(217, 119, 6, 0.1)' : 'rgba(22, 163, 74, 0.1)',
                                          color: t.status === 'HOLDING' ? '#d97706' : '#16a34a'
                                        }}>
                                          {t.status}
                                        </span>
                                      </td>
                                      <td style={{ color: '#7c3aed', fontWeight: 800 }}>
                                        {t.type === 'IN' && Number(t.prod_cost_row) > 0 ? fmt.currency(t.prod_cost_row) : '—'}
                                      </td>
                                      <td style={{ color: 'var(--text-secondary)', fontSize: '9px' }}>{t.rent_type || 'DAILY'}</td>
                                      <td>{fmt.currency(t.rate)}</td>
                                    </tr>
                                  );
                                })}
                            </React.Fragment>
                          ))}
                        </React.Fragment>
                      ));
                    })()}
                  </tbody>
                </table>
              )}

              {/* TAB 2: PROD COST */}
              {activeTab === 'prod' && (
                <table className="bknr-table" style={{ minWidth: 1400 }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Client</th>
                      <th>Location</th>
                      <th>Cold Storage</th>
                      <th>Batch No</th>
                      <th>Freezer</th>
                      <th>Variety / Grade</th>
                      <th>Packing</th>
                      <th>First IN</th>
                      <th>Last OUT</th>
                      <th>Open MC</th>
                      <th>IN MC</th>
                      <th>IN KG</th>
                      <th>OUT MC</th>
                      <th>Close MC</th>
                      <th>Rate/KG</th>
                      <th>Prod Cost ₹</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productionForGroups.length === 0 ? (
                      <EmptyRow cols={17} />
                    ) : (() => {
                      let globalIdx = 0;
                      return productionForGroups.map((g, gi) => (
                        <React.Fragment key={gi}>
                          <tr className="tr-group-header" style={{ background: 'var(--primary)', color: '#fff', fontWeight: 800 }}>
                            <td colSpan={17} style={{ textAlign: 'left', padding: '8px 12px', textTransform: 'uppercase' }}>
                              CLIENT: {g.production_for}
                            </td>
                          </tr>
                          {(g.location_groups || []).map((lg, lgi) => (
                            <React.Fragment key={lgi}>
                              <tr className="tr-loc-header" style={{ background: 'var(--border-light)', color: 'var(--text-primary)', fontWeight: 700 }}>
                                <td colSpan={17} style={{ textAlign: 'left', padding: '6px 20px', textTransform: 'uppercase' }}>
                                  LOCATION: {lg.production_at}
                                </td>
                              </tr>
                              {(lg.batches || [])
                                .filter(b => !search || Object.values(b).some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase())))
                                .map((b, bi) => {
                                  globalIdx++;
                                  return (
                                    <tr key={bi}>
                                      <td className="txt-muted">{globalIdx}</td>
                                      <td style={{ fontWeight: 700 }}>{b.production_for}</td>
                                      <td style={{ fontWeight: 700, color: 'var(--corp-dash)' }}>{b.production_at}</td>
                                      <td style={{ textAlign: 'left', fontWeight: 800 }}>{b.cold_storage_name}</td>
                                      <td style={{ fontWeight: 800, color: 'var(--corp-dash)' }}>{b.batch_number}</td>
                                      <td>{b.freezer}</td>
                                      <td>{b.variety} / {b.grade}</td>
                                      <td>{b.packing_style}</td>
                                      <td style={{ color: '#16a34a', fontWeight: 700 }}>
                                        {b.first_in_date ? new Date(b.first_in_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                                      </td>
                                      <td style={{ color: '#dc2626', fontWeight: 700 }}>
                                        {b.last_out_date ? new Date(b.last_out_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                                      </td>
                                      <td style={{ fontWeight: 700 }}>{b.opening_mc}</td>
                                      <td style={{ color: '#16a34a' }}>+{b.monthly_in_mc}</td>
                                      <td style={{ fontWeight: 800 }}>{fmt.number(b.monthly_in_kg)}</td>
                                      <td style={{ color: '#dc2626' }}>-{b.monthly_out_mc}</td>
                                      <td style={{ fontWeight: 800, color: 'var(--corp-rep)', background: 'var(--bg-light)' }}>{b.closing_mc}</td>
                                      <td>{fmt.currency(b.prod_rate_per_kg)}</td>
                                      <td style={{ color: '#7c3aed', fontWeight: 800 }}>{fmt.currency(b.prod_cost_total)}</td>
                                    </tr>
                                  );
                                })}
                              {/* Location Subtotal */}
                              <tr style={{ background: 'rgba(59, 130, 246, 0.05)', fontWeight: 800, color: '#0284c7' }}>
                                <td colSpan={10} style={{ textAlign: 'right', paddingRight: '12px' }}>
                                  LOC SUBTOTAL ({lg.production_at}):
                                </td>
                                <td>{lg.opening_mc}</td>
                                <td>+{lg.monthly_in_mc}</td>
                                <td>{fmt.number(lg.monthly_in_kg)}</td>
                                <td>-{lg.monthly_out_mc}</td>
                                <td>{lg.closing_mc}</td>
                                <td></td>
                                <td>{fmt.currency(lg.prod_cost_total)}</td>
                              </tr>
                            </React.Fragment>
                          ))}
                          {/* Client Total */}
                          <tr style={{ background: '#fef3c7', fontWeight: 800, color: '#b45309' }}>
                            <td colSpan={10} style={{ textAlign: 'right', paddingRight: '12px' }}>
                              CLIENT TOTAL ({g.production_for}):
                            </td>
                            <td>{g.opening_mc}</td>
                            <td>+{g.monthly_in_mc}</td>
                            <td>{fmt.number(g.monthly_in_kg)}</td>
                            <td>-{g.monthly_out_mc}</td>
                            <td>{g.closing_mc}</td>
                            <td></td>
                            <td>{fmt.currency(g.prod_cost_total)}</td>
                          </tr>
                        </React.Fragment>
                      ));
                    })()}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 800 }}>
                      <td colSpan={10} style={{ textAlign: 'right' }}>GRAND TOTAL:</td>
                      <td>{data.total_opening_mc}</td>
                      <td>+{data.total_in_mc}</td>
                      <td></td>
                      <td>-{data.total_out_mc}</td>
                      <td>{data.total_closing_mc}</td>
                      <td></td>
                      <td>{fmt.currency(data.total_prod_cost)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}

              {/* TAB 3: STORAGE RENT */}
              {activeTab === 'storage' && (
                <table className="bknr-table" style={{ minWidth: 1400 }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Client</th>
                      <th>Location</th>
                      <th>Cold Storage</th>
                      <th>Batch No</th>
                      <th>Variety / Grade</th>
                      <th>Rent Type</th>
                      <th>Rate</th>
                      <th>Open MC</th>
                      <th>IN MC</th>
                      <th>OUT MC</th>
                      <th>Close MC</th>
                      <th>Storage Rent ₹</th>
                      <th>LU IN ₹</th>
                      <th>LU OUT ₹</th>
                      <th>Payable ₹</th>
                      <th>Paid ₹</th>
                      <th>Pending ₹</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productionForGroups.length === 0 ? (
                      <EmptyRow cols={18} />
                    ) : (() => {
                      let globalIdx = 0;
                      return productionForGroups.map((g, gi) => (
                        <React.Fragment key={gi}>
                          <tr className="tr-group-header" style={{ background: 'var(--primary)', color: '#fff', fontWeight: 800 }}>
                            <td colSpan={18} style={{ textAlign: 'left', padding: '8px 12px', textTransform: 'uppercase' }}>
                              CLIENT: {g.production_for}
                            </td>
                          </tr>
                          {(g.location_groups || []).map((lg, lgi) => (
                            <React.Fragment key={lgi}>
                              <tr className="tr-loc-header" style={{ background: 'var(--border-light)', color: 'var(--text-primary)', fontWeight: 700 }}>
                                <td colSpan={18} style={{ textAlign: 'left', padding: '6px 20px', textTransform: 'uppercase' }}>
                                  LOCATION: {lg.production_at}
                                </td>
                              </tr>
                              {(lg.batches || [])
                                .filter(b => !search || Object.values(b).some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase())))
                                .map((b, bi) => {
                                  globalIdx++;
                                  return (
                                    <tr key={bi} style={b.pending_amount > 0 ? { background: 'rgba(245, 158, 11, 0.03)' } : {}}>
                                      <td className="txt-muted">{globalIdx}</td>
                                      <td style={{ fontWeight: 700 }}>{b.production_for}</td>
                                      <td style={{ fontWeight: 700, color: 'var(--corp-dash)' }}>{b.production_at}</td>
                                      <td style={{ textAlign: 'left', fontWeight: 800 }}>{b.cold_storage_name}</td>
                                      <td style={{ fontWeight: 800, color: 'var(--corp-dash)' }}>{b.batch_number}</td>
                                      <td>{b.variety} / {b.grade}</td>
                                      <td className="txt-muted">{b.rent_type}</td>
                                      <td>{fmt.currency(b.rate_per_mc)}</td>
                                      <td style={{ fontWeight: 700 }}>{b.opening_mc}</td>
                                      <td style={{ color: '#16a34a' }}>+{b.monthly_in_mc}</td>
                                      <td style={{ color: '#dc2626' }}>-{b.monthly_out_mc}</td>
                                      <td style={{ fontWeight: 800, color: 'var(--corp-rep)', background: 'var(--bg-light)' }}>{b.closing_mc}</td>
                                      <td style={{ color: '#d97706', fontWeight: 800 }}>{fmt.currency(b.storage_rent)}</td>
                                      <td style={{ color: '#3b82f6', fontWeight: 700 }}>{fmt.currency(b.handling_charges)}</td>
                                      <td style={{ color: '#3b82f6', fontWeight: 700 }}>{fmt.currency(b.lu_charges_out)}</td>
                                      <td style={{ color: '#10b981', fontWeight: 800, background: 'var(--bg-light)' }}>{fmt.currency(b.total_payable)}</td>
                                      <td style={{ color: '#16a34a', fontWeight: 700 }}>{fmt.currency(b.paid_amount)}</td>
                                      <td style={{ color: '#dc2626', fontWeight: 700 }}>{fmt.currency(b.pending_amount)}</td>
                                    </tr>
                                  );
                                })}
                              {/* Location Subtotal */}
                              <tr style={{ background: 'rgba(59, 130, 246, 0.05)', fontWeight: 800, color: '#0284c7' }}>
                                <td colSpan={8} style={{ textAlign: 'right', paddingRight: '12px' }}>
                                  LOC SUBTOTAL ({lg.production_at}):
                                </td>
                                <td>{lg.opening_mc}</td>
                                <td>+{lg.monthly_in_mc}</td>
                                <td>-{lg.monthly_out_mc}</td>
                                <td>{lg.closing_mc}</td>
                                <td>{fmt.currency(lg.storage_rent)}</td>
                                <td>{fmt.currency(lg.handling_charges)}</td>
                                <td>{fmt.currency(lg.lu_charges_out)}</td>
                                <td>{fmt.currency(lg.total_payable)}</td>
                                <td>{fmt.currency(lg.paid_amount)}</td>
                                <td>{fmt.currency(lg.pending_amount)}</td>
                              </tr>
                            </React.Fragment>
                          ))}
                          {/* Client Total */}
                          <tr style={{ background: '#fef3c7', fontWeight: 800, color: '#b45309' }}>
                            <td colSpan={8} style={{ textAlign: 'right', paddingRight: '12px' }}>
                              CLIENT TOTAL ({g.production_for}):
                            </td>
                            <td>{g.opening_mc}</td>
                            <td>+{g.monthly_in_mc}</td>
                            <td>-{g.monthly_out_mc}</td>
                            <td>{g.closing_mc}</td>
                            <td>{fmt.currency(g.storage_rent)}</td>
                            <td>{fmt.currency(g.handling_charges)}</td>
                            <td>{fmt.currency(g.lu_charges_out)}</td>
                            <td>{fmt.currency(g.total_payable)}</td>
                            <td>{fmt.currency(g.paid_amount)}</td>
                            <td>{fmt.currency(g.pending_amount)}</td>
                          </tr>
                        </React.Fragment>
                      ));
                    })()}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 800 }}>
                      <td colSpan={8} style={{ textAlign: 'right' }}>GRAND TOTAL:</td>
                      <td>{data.total_opening_mc}</td>
                      <td>+{data.total_in_mc}</td>
                      <td>-{data.total_out_mc}</td>
                      <td>{data.total_closing_mc}</td>
                      <td>{fmt.currency(data.total_storage_rent)}</td>
                      <td colSpan={2}>{fmt.currency(data.total_charges)}</td>
                      <td>{fmt.currency(data.total_payable_all)}</td>
                      <td>{fmt.currency(data.total_paid_all)}</td>
                      <td>{fmt.currency(data.total_pending_all)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}

              {/* TAB 4: COMBINED */}
              {activeTab === 'combined' && (
                <table className="bknr-table" style={{ minWidth: 1400 }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Client</th>
                      <th>Location</th>
                      <th>Cold Storage</th>
                      <th>Batch No</th>
                      <th>Variety / Grade</th>
                      <th>Open MC</th>
                      <th>IN MC</th>
                      <th>OUT MC</th>
                      <th>Close MC</th>
                      <th>Prod Cost ₹</th>
                      <th>Rent ₹</th>
                      <th>L&U ₹</th>
                      <th>Combined Payable ₹</th>
                      <th>Paid ₹</th>
                      <th>Pending ₹</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productionForGroups.length === 0 ? (
                      <EmptyRow cols={16} />
                    ) : (() => {
                      let globalIdx = 0;
                      return productionForGroups.map((g, gi) => (
                        <React.Fragment key={gi}>
                          <tr className="tr-group-header" style={{ background: 'var(--primary)', color: '#fff', fontWeight: 800 }}>
                            <td colSpan={16} style={{ textAlign: 'left', padding: '8px 12px', textTransform: 'uppercase' }}>
                              CLIENT: {g.production_for}
                            </td>
                          </tr>
                          {(g.location_groups || []).map((lg, lgi) => (
                            <React.Fragment key={lgi}>
                              <tr className="tr-loc-header" style={{ background: 'var(--border-light)', color: 'var(--text-primary)', fontWeight: 700 }}>
                                <td colSpan={16} style={{ textAlign: 'left', padding: '6px 20px', textTransform: 'uppercase' }}>
                                  LOCATION: {lg.production_at}
                                </td>
                              </tr>
                              {(lg.batches || [])
                                .filter(b => !search || Object.values(b).some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase())))
                                .map((b, bi) => {
                                  globalIdx++;
                                  return (
                                    <tr key={bi} style={b.pending_amount > 0 ? { background: 'rgba(245, 158, 11, 0.03)' } : {}}>
                                      <td className="txt-muted">{globalIdx}</td>
                                      <td style={{ fontWeight: 700 }}>{b.production_for}</td>
                                      <td style={{ fontWeight: 700, color: 'var(--corp-dash)' }}>{b.production_at}</td>
                                      <td style={{ textAlign: 'left', fontWeight: 800 }}>{b.cold_storage_name}</td>
                                      <td style={{ fontWeight: 800, color: 'var(--corp-dash)' }}>{b.batch_number}</td>
                                      <td>{b.variety} / {b.grade}</td>
                                      <td style={{ fontWeight: 700 }}>{b.opening_mc}</td>
                                      <td style={{ color: '#16a34a' }}>+{b.monthly_in_mc}</td>
                                      <td style={{ color: '#dc2626' }}>-{b.monthly_out_mc}</td>
                                      <td style={{ fontWeight: 800, color: 'var(--corp-rep)', background: 'var(--bg-light)' }}>{b.closing_mc}</td>
                                      <td style={{ color: '#7c3aed', fontWeight: 800 }}>{fmt.currency(b.prod_cost_total)}</td>
                                      <td style={{ color: '#d97706', fontWeight: 800 }}>{fmt.currency(b.storage_rent)}</td>
                                      <td style={{ color: '#3b82f6', fontWeight: 800 }}>{fmt.currency(b.other_charges)}</td>
                                      <td style={{ color: '#10b981', fontWeight: 800, background: 'var(--bg-light)' }}>
                                        {fmt.currency(b.prod_cost_total + b.total_payable)}
                                      </td>
                                      <td style={{ color: '#16a34a', fontWeight: 700 }}>{fmt.currency(b.paid_amount)}</td>
                                      <td style={{ color: '#dc2626', fontWeight: 700 }}>{fmt.currency(b.pending_amount)}</td>
                                    </tr>
                                  );
                                })}
                              {/* Location Subtotal */}
                              <tr style={{ background: 'rgba(59, 130, 246, 0.05)', fontWeight: 800, color: '#0284c7' }}>
                                <td colSpan={6} style={{ textAlign: 'right', paddingRight: '12px' }}>
                                  LOC SUBTOTAL ({lg.production_at}):
                                </td>
                                <td>{lg.opening_mc}</td>
                                <td>+{lg.monthly_in_mc}</td>
                                <td>-{lg.monthly_out_mc}</td>
                                <td>{lg.closing_mc}</td>
                                <td>{fmt.currency(lg.prod_cost_total)}</td>
                                <td>{fmt.currency(lg.storage_rent)}</td>
                                <td>{fmt.currency(lg.other_charges)}</td>
                                <td>{fmt.currency(lg.prod_cost_total + lg.total_payable)}</td>
                                <td>{fmt.currency(lg.paid_amount)}</td>
                                <td>{fmt.currency(lg.pending_amount)}</td>
                              </tr>
                            </React.Fragment>
                          ))}
                          {/* Client Total */}
                          <tr style={{ background: '#fef3c7', fontWeight: 800, color: '#b45309' }}>
                            <td colSpan={6} style={{ textAlign: 'right', paddingRight: '12px' }}>
                              CLIENT TOTAL ({g.production_for}):
                            </td>
                            <td>{g.opening_mc}</td>
                            <td>+{g.monthly_in_mc}</td>
                            <td>-{g.monthly_out_mc}</td>
                            <td>{g.closing_mc}</td>
                            <td>{fmt.currency(g.prod_cost_total)}</td>
                            <td>{fmt.currency(g.storage_rent)}</td>
                            <td>{fmt.currency(g.other_charges)}</td>
                            <td>{fmt.currency(g.prod_cost_total + g.total_payable)}</td>
                            <td>{fmt.currency(g.paid_amount)}</td>
                            <td>{fmt.currency(g.pending_amount)}</td>
                          </tr>
                        </React.Fragment>
                      ));
                    })()}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 800 }}>
                      <td colSpan={6} style={{ textAlign: 'right' }}>GRAND TOTAL:</td>
                      <td>{data.total_opening_mc}</td>
                      <td>+{data.total_in_mc}</td>
                      <td>-{data.total_out_mc}</td>
                      <td>{data.total_closing_mc}</td>
                      <td>{fmt.currency(data.total_prod_cost)}</td>
                      <td>{fmt.currency(data.total_storage_rent)}</td>
                      <td>{fmt.currency(data.total_charges)}</td>
                      <td>{fmt.currency(data.total_prod_cost + data.total_payable_all)}</td>
                      <td>{fmt.currency(data.total_paid_all)}</td>
                      <td>{fmt.currency(data.total_pending_all)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}

              {/* TAB 5: FACILITY SUMMARY */}
              {activeTab === 'facility' && (
                <table className="bknr-table" style={{ minWidth: 1400 }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th style={{ textAlign: 'left' }}>Cold Storage Facility</th>
                      <th>Client</th>
                      <th>Location</th>
                      <th>Open MC</th>
                      <th>IN MC</th>
                      <th>OUT MC</th>
                      <th>Close MC</th>
                      <th>Prod Cost ₹ (Info)</th>
                      <th>Storage Rent ₹</th>
                      <th>Handling / L&U ₹</th>
                      <th>Total Payable ₹</th>
                      <th>Paid ₹</th>
                      <th>Pending ₹</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facilitySummary.length === 0 ? (
                      <EmptyRow cols={15} />
                    ) : (
                      facilitySummary.map((f, fi) => (
                        <React.Fragment key={fi}>
                          <tr className="tr-group-header" style={{ background: 'var(--primary)', color: '#fff', fontWeight: 800 }}>
                            <td colSpan={15} style={{ textAlign: 'left', padding: '8px 12px', textTransform: 'uppercase' }}>
                              FACILITY: {f.cold_storage_name}
                            </td>
                          </tr>
                          {(f.client_groups || []).map((cg, cgi) => (
                            <React.Fragment key={cgi}>
                              <tr className="tr-loc-header" style={{ background: 'var(--border-light)', color: 'var(--text-primary)', fontWeight: 700 }}>
                                <td colSpan={15} style={{ textAlign: 'left', padding: '6px 20px', textTransform: 'uppercase' }}>
                                  CLIENT: {cg.production_for}
                                </td>
                              </tr>
                              {(cg.location_groups || [])
                                .filter(l => !search || Object.values(l).some(v => String(v ?? '').toLowerCase().includes(search.toLowerCase())))
                                .map((locGroup, li) => (
                                  <tr key={li} style={locGroup.pending_amount > 0 ? { background: 'rgba(245, 158, 11, 0.03)' } : {}}>
                                    <td className="txt-muted">-</td>
                                    <td style={{ textAlign: 'left', fontWeight: 800, color: 'var(--text-primary)' }}>{f.cold_storage_name}</td>
                                    <td style={{ fontWeight: 700 }}>{cg.production_for}</td>
                                    <td style={{ fontWeight: 700, color: 'var(--corp-dash)' }}>{locGroup.production_at}</td>
                                    <td style={{ fontWeight: 700 }}>{locGroup.opening_mc}</td>
                                    <td style={{ color: '#16a34a' }}>+{locGroup.monthly_in_mc}</td>
                                    <td style={{ color: '#dc2626' }}>-{locGroup.monthly_out_mc}</td>
                                    <td style={{ fontWeight: 800, color: 'var(--corp-rep)', background: 'var(--bg-light)' }}>{locGroup.closing_mc}</td>
                                    <td style={{ color: '#7c3aed', fontWeight: 800 }}>{fmt.currency(locGroup.prod_cost)}</td>
                                    <td style={{ color: '#d97706', fontWeight: 800 }}>{fmt.currency(locGroup.storage_rent)}</td>
                                    <td style={{ color: '#3b82f6', fontWeight: 800 }}>{fmt.currency(locGroup.other_charges)}</td>
                                    <td style={{ color: '#10b981', fontWeight: 800, background: 'var(--bg-light)' }}>{fmt.currency(locGroup.total_payable)}</td>
                                    <td style={{ color: '#16a34a', fontWeight: 700 }}>{fmt.currency(locGroup.paid_amount)}</td>
                                    <td style={{ color: '#dc2626', fontWeight: 700 }}>{fmt.currency(locGroup.pending_amount)}</td>
                                    <td>
                                      {locGroup.pending_amount <= 0 ? (
                                        <span className="badge bg-in" style={{ padding: '2px 6px', fontSize: '9px', fontWeight: 800, borderRadius: '4px', background: 'rgba(22, 163, 74, 0.1)', color: '#16a34a' }}>
                                          CLEAR
                                        </span>
                                      ) : locGroup.pending_amount >= locGroup.total_payable ? (
                                        <span className="badge bg-out" style={{ padding: '2px 6px', fontSize: '9px', fontWeight: 800, borderRadius: '4px', background: 'rgba(220, 38, 38, 0.1)', color: '#dc2626' }}>
                                          UNPAID
                                        </span>
                                      ) : (
                                        <span className="badge bg-warn" style={{ padding: '2px 6px', fontSize: '9px', fontWeight: 800, borderRadius: '4px', background: 'rgba(217, 119, 6, 0.1)', color: '#d97706' }}>
                                          PARTIAL
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                            </React.Fragment>
                          ))}
                          {/* Facility Total */}
                          <tr style={{ background: '#fef3c7', fontWeight: 800, color: '#b45309' }}>
                            <td colSpan={4} style={{ textAlign: 'right', paddingRight: '12px' }}>
                              FACILITY TOTAL ({f.cold_storage_name}):
                            </td>
                            <td>{f.opening_mc}</td>
                            <td>+{f.monthly_in_mc}</td>
                            <td>-{f.monthly_out_mc}</td>
                            <td>{f.closing_mc}</td>
                            <td>{fmt.currency(f.prod_cost)}</td>
                            <td>{fmt.currency(f.storage_rent)}</td>
                            <td>{fmt.currency(f.other_charges)}</td>
                            <td>{fmt.currency(f.total_payable)}</td>
                            <td>{fmt.currency(f.paid_amount)}</td>
                            <td>{fmt.currency(f.pending_amount)}</td>
                            <td></td>
                          </tr>
                        </React.Fragment>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr style={{ fontWeight: 800 }}>
                      <td colSpan={4} style={{ textAlign: 'right' }}>GRAND TOTAL:</td>
                      <td>{data.total_opening_mc}</td>
                      <td>+{data.total_in_mc}</td>
                      <td>-{data.total_out_mc}</td>
                      <td>{data.total_closing_mc}</td>
                      <td>{fmt.currency(data.total_prod_cost)}</td>
                      <td>{fmt.currency(data.total_storage_rent)}</td>
                      <td>{fmt.currency(data.total_charges)}</td>
                      <td>{fmt.currency(data.total_payable_all)}</td>
                      <td>{fmt.currency(data.total_paid_all)}</td>
                      <td>{fmt.currency(data.total_pending_all)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              )}

            </div>
          </div>
        </>
      )}
    </div>
  );
}
