/**
 * InventoryCosting.jsx – Inventory Costing Report (DATA GRID vs GRADE DASHBOARD)
 */
import React, { useState } from 'react';
import {
  ReportHeader, FilterBar, FilterBox, FilterSelect, FilterInput,
  KPIGrid, KPICard, Loader, ErrorBox, SearchInput,
  FinYearSelect, useReport, fmt, EmptyRow
} from './ReportShell';

export default function InventoryCosting({ activeRoute }) {
  const [currentView, setCurrentView] = useState('table'); // 'table' or 'dashboard'
  const [fy, setFy] = useState('');
  const [prodFor, setProdFor] = useState('');
  const [prodAt, setProdAt] = useState('');
  const [species, setSpecies] = useState('');
  const [variety, setVariety] = useState('');
  const [grade, setGrade] = useState('');
  const [glaze, setGlaze] = useState('');
  const [search, setSearch] = useState('');

  const params = {};
  if (fy) params.fy = fy;

  const { data, loading, error, reload } = useReport({
    url: activeRoute || '/summary/inventory_costing',
    params,
    deps: [fy],
  });

  const rows = data?.rows || [];

  // Local filtering logic
  const filteredRows = rows.filter(r => {
    if (prodFor && r.production_for !== prodFor) return false;
    if (currentView === 'table' && prodAt && r.production_at !== prodAt) return false;

    if (currentView === 'dashboard') {
      if (species && r.species !== species) return false;
      if (variety && r.variety !== variety) return false;
      if (grade && r.grade !== grade) return false;
      if (glaze && r.glaze !== glaze) return false;
    }

    if (search) {
      const q = search.toLowerCase();
      const matchText = `${r.batch_number || ''} ${r.grade || ''} ${r.variety || ''} ${r.species || ''} ${r.brand || ''} ${r.location || ''}`.toLowerCase();
      if (!matchText.includes(q)) return false;
    }

    return true;
  });

  // Unique lists for filters (Dashboard options are derived dynamically)
  const productionForList = Array.from(new Set(rows.map(r => r.production_for).filter(Boolean))).sort();
  const productionAtList = Array.from(new Set(rows.map(r => r.production_at).filter(Boolean))).sort();

  // Dynamically populated lists for dashboard filters
  const filteredForOptions = rows.filter(r => !prodFor || r.production_for === prodFor);
  const speciesList = Array.from(new Set(filteredForOptions.map(r => r.species).filter(Boolean))).sort();
  const varietiesList = Array.from(new Set(filteredForOptions.map(r => r.variety).filter(Boolean))).sort();
  const gradesList = Array.from(new Set(filteredForOptions.map(r => r.grade).filter(Boolean))).sort();
  const glazesList = Array.from(new Set(filteredForOptions.map(r => r.glaze).filter(Boolean))).sort();

  // Metrics aggregation for the sticky footer
  let totalInQty = 0;
  let totalInVal = 0;
  let totalOutQty = 0;
  let totalOutVal = 0;

  filteredRows.forEach(r => {
    const q = Number(r.quantity || 0);
    const v = Number(r.inventory_value || 0);
    if (r.cargo_movement_type === 'IN') {
      totalInQty += q;
      totalInVal += v;
    } else {
      totalOutQty += q;
      totalOutVal += q; // absolute weight out
    }
  });

  // For output totals, match the legacy calculations:
  // totalOutVal = abs sum of out values
  const totalOutValAbs = Math.abs(filteredRows.reduce((sum, r) => {
    return sum + (r.cargo_movement_type === 'OUT' ? Number(r.inventory_value || 0) : 0);
  }, 0));

  const availableQty = totalInQty - totalOutQty;
  const balanceValue = totalInVal - totalOutValAbs;
  const avgRate = availableQty > 0 ? balanceValue / availableQty : 0;

  // Grade Dashboard grouping
  const dashboardGroups = {};
  if (currentView === 'dashboard') {
    filteredRows.forEach(r => {
      const key = `${r.species}_${r.variety}_${r.grade}_${r.glaze}`;
      if (!dashboardGroups[key]) {
        dashboardGroups[key] = {
          species: r.species,
          variety: r.variety,
          grade: r.grade,
          glaze: r.glaze,
          inQty: 0,
          inVal: 0,
          outQty: 0,
          outVal: 0
        };
      }
      const q = Number(r.quantity || 0);
      const v = Number(r.inventory_value || 0);
      if (r.cargo_movement_type === 'IN') {
        dashboardGroups[key].inQty += q;
        dashboardGroups[key].inVal += v;
      } else {
        dashboardGroups[key].outQty += q;
        dashboardGroups[key].outVal += v;
      }
    });
  }

  const dashboardEntries = Object.values(dashboardGroups);

  // Tab switcher component
  const TabBtn = ({ id, label }) => (
    <button
      className={`tab-btn ${currentView === id ? 'active' : ''}`}
      onClick={() => {
        setCurrentView(id);
        // Reset sub-filters when switching views
        if (id === 'table') {
          setSpecies('');
          setVariety('');
          setGrade('');
          setGlaze('');
        }
      }}
      style={{
        padding: '5px 14px',
        border: 'none',
        background: currentView === id ? 'var(--brand-primary, var(--text-primary))' : 'transparent',
        color: currentView === id ? '#ffffff' : 'var(--text-secondary)',
        fontSize: '9px',
        fontWeight: '700',
        borderRadius: '4px',
        cursor: 'pointer',
        textTransform: 'uppercase',
        transition: '0.2s',
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="report-viewer-card" style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 120px)', position: 'relative' }}>
      <ReportHeader
        title="Inventory Costing & Analysis"
        loading={loading}
        onReload={reload}
        onPrint={() => window.print()}
      />

      {/* Control bar containing view tabs & filters */}
      <div className="control-bar" style={{ background: 'var(--surface-panel)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-light)', marginBottom: '8px' }}>
        <div style={{ display: 'flex', background: 'var(--input-bg, rgba(0,0,0,0.05))', padding: '3px', borderRadius: '6px', width: 'max-content', marginBottom: '12px' }}>
          <TabBtn id="table" label="DATA GRID" />
          <TabBtn id="dashboard" label="GRADE DASHBOARD" />
        </div>

        <FilterBar>
          {currentView === 'table' && (
            <FilterBox label="Year Filter">
              <FinYearSelect value={fy} onChange={setFy} list={data?.financial_years} />
            </FilterBox>
          )}

          <FilterBox label="Production For">
            <FilterSelect value={prodFor} onChange={setProdFor}>
              <option value="">-- All Companies --</option>
              {productionForList.map(item => <option key={item} value={item}>{item}</option>)}
            </FilterSelect>
          </FilterBox>

          {currentView === 'table' && (
            <FilterBox label="Production At">
              <FilterSelect value={prodAt} onChange={setProdAt}>
                <option value="">-- All Locations --</option>
                {productionAtList.map(item => <option key={item} value={item}>{item}</option>)}
              </FilterSelect>
            </FilterBox>
          )}

          {currentView === 'dashboard' && (
            <>
              <FilterBox label="Species">
                <FilterSelect value={species} onChange={setSpecies}>
                  <option value="">All Species</option>
                  {speciesList.map(item => <option key={item} value={item}>{item}</option>)}
                </FilterSelect>
              </FilterBox>

              <FilterBox label="Variety">
                <FilterSelect value={variety} onChange={setVariety}>
                  <option value="">All Varieties</option>
                  {varietiesList.map(item => <option key={item} value={item}>{item}</option>)}
                </FilterSelect>
              </FilterBox>

              <FilterBox label="Grade">
                <FilterSelect value={grade} onChange={setGrade}>
                  <option value="">All Grades</option>
                  {gradesList.map(item => <option key={item} value={item}>{item}</option>)}
                </FilterSelect>
              </FilterBox>

              <FilterBox label="Glaze">
                <FilterSelect value={glaze} onChange={setGlaze}>
                  <option value="">All Glazes</option>
                  {glazesList.map(item => <option key={item} value={item}>{item}</option>)}
                </FilterSelect>
              </FilterBox>
            </>
          )}

          <FilterBox label="Local Search">
            <SearchInput value={search} onChange={setSearch} />
          </FilterBox>
        </FilterBar>
      </div>

      {loading && <Loader />}
      {error && <ErrorBox msg={error} onRetry={reload} />}

      {!loading && !error && (
        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '60px' }}>

          {/* VIEW 1: DATA GRID */}
          {currentView === 'table' && (
            <div className="card" style={{ marginTop: 0, padding: 0, overflow: 'hidden' }}>
              <div className="table-responsive">
                <table className="bknr-table">
                  <thead>
                    <tr>
                      <th style={{ width: 45 }}>SL</th>
                      <th style={{ width: 100 }}>Batch #</th>
                      <th>Date</th>
                      <th>Prod Type</th>
                      <th>Movement</th>
                      <th>Location</th>
                      <th>Brand</th>
                      <th>Species</th>
                      <th>Variety</th>
                      <th>Grade</th>
                      <th>Glaze</th>
                      <th>Freezer</th>
                      <th>Packing</th>
                      <th>PO Number</th>
                      <th>Purpose</th>
                      <th>Prod For</th>
                      <th>Prod At</th>
                      <th>MC</th>
                      <th>Loose</th>
                      <th className="text-right">Qty (Kg)</th>
                      <th className="text-right">Base RM Rate</th>
                      <th className="text-right">Prod Cost</th>
                      <th className="text-right">Ice Rate</th>
                      <th className="text-right">Deheading</th>
                      <th className="text-right">Grading</th>
                      <th className="text-right">Peeling</th>
                      <th className="text-right">Total Cost/KG</th>
                      <th className="text-right">Inv Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length === 0 ? (
                      <EmptyRow cols={28} />
                    ) : (
                      filteredRows.map((r, idx) => (
                        <tr key={idx}>
                          <td className="text-center" style={{ color: 'var(--text-tertiary)' }}>
                            {filteredRows.length - idx}
                          </td>
                          <td style={{ fontWeight: 700, color: 'var(--corp-dash)' }}>{r.batch_number}</td>
                          <td>{r.date}</td>
                          <td>{r.type_of_production}</td>
                          <td className="text-center">
                            <span className={r.cargo_movement_type === 'IN' ? 'move-in' : 'move-out'} style={{
                              fontWeight: 800, padding: '2px 5px', borderRadius: '3px', fontSize: '8px',
                              background: r.cargo_movement_type === 'IN' ? 'rgba(22, 163, 74, 0.1)' : 'rgba(220, 38, 38, 0.1)',
                              color: r.cargo_movement_type === 'IN' ? '#16a34a' : '#dc2626'
                            }}>
                              {r.cargo_movement_type}
                            </span>
                          </td>
                          <td>{r.location}</td>
                          <td>{r.brand}</td>
                          <td>{r.species}</td>
                          <td style={{ textAlign: 'left' }}>{r.variety}</td>
                          <td style={{ fontWeight: 800, color: 'var(--corp-dash)' }}>{r.grade}</td>
                          <td>{r.glaze}</td>
                          <td>{r.freezer}</td>
                          <td style={{ textAlign: 'left' }}>{r.packing_style}</td>
                          <td>{r.po_number || '-'}</td>
                          <td>{r.purpose || '-'}</td>
                          <td>{r.production_for || '-'}</td>
                          <td>{r.production_at}</td>
                          <td>{r.no_of_mc}</td>
                          <td>{r.loose}</td>
                          <td className="text-right" style={{ fontWeight: 800 }}>{fmt.number(r.quantity)}</td>
                          <td className="text-right">{fmt.currency(r.base_rm_rate)}</td>
                          <td className="text-right">{fmt.currency(r.production_cost_per_kg)}</td>
                          <td className="text-right">{fmt.currency(r.ice_rate_per_kg)}</td>
                          <td className="text-right">{fmt.currency(r.deheading_rate_per_kg)}</td>
                          <td className="text-right">{fmt.currency(r.grading_rate_per_kg)}</td>
                          <td className="text-right">{fmt.currency(r.peeling_rate_per_kg)}</td>
                          <td className="text-right" style={{ fontWeight: 800 }}>{fmt.currency(r.product_kg_value)}</td>
                          <td className="text-right" style={{ fontWeight: 800, color: r.cargo_movement_type === 'IN' ? '#16a34a' : '#dc2626' }}>
                            {fmt.currency(r.inventory_value)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VIEW 2: GRADE DASHBOARD */}
          {currentView === 'dashboard' && (
            <div className="grid-layout" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '14px', padding: '2px' }}>
              {dashboardEntries.length === 0 ? (
                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  <h3>No grade metrics found</h3>
                  <p style={{ fontSize: '11px' }}>Try changing filters or company verification criteria.</p>
                </div>
              ) : (
                dashboardEntries.map((g, idx) => {
                  const availQty = g.inQty - g.outQty;
                  const availVal = g.inVal + g.outVal;

                  const inAvg = g.inQty > 0 ? g.inVal / g.inQty : 0;
                  const outAvg = g.outQty > 0 ? Math.abs(g.outVal) / g.outQty : 0;
                  const availAvg = availQty > 0 ? availVal / availQty : 0;

                  return (
                    <div key={idx} className="grade-card" style={{
                      background: 'var(--surface-panel)', borderRadius: '10px', border: '1px solid var(--border-light)',
                      overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-soft)'
                    }}>
                      <div className="card-head" style={{
                        background: 'linear-gradient(135deg, var(--primary) 0%, rgba(15,23,42,0.85) 100%)',
                        padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff'
                      }}>
                        <span className="grade-title" style={{ fontSize: '12px', fontWeight: '800' }}>{g.grade}</span>
                        <span className="glaze-badge" style={{
                          background: 'rgba(96, 165, 250, 0.2)', color: '#93c5fd', padding: '2px 6px',
                          borderRadius: '4px', fontSize: '8.5px', fontWeight: '700', border: '1px solid rgba(96, 165, 250, 0.4)'
                        }}>{g.glaze}</span>
                      </div>
                      <div className="card-body" style={{ padding: '14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <div className="variety-label" style={{
                            fontSize: '11px', fontWeight: '800', color: 'var(--corp-dash)', display: 'flex', alignItems: 'center', gap: '4px'
                          }}>
                            <span style={{ display: 'inline-block', width: '4px', height: '11px', background: 'var(--corp-dash)', borderRadius: '2px' }}></span>
                            {g.variety}
                          </div>
                          <div style={{
                            fontSize: '8.5px', fontWeight: '800', color: 'var(--text-secondary)', background: 'var(--input-bg)',
                            padding: '1px 6px', borderRadius: '3px', border: '1px solid var(--border-light)'
                          }}>{g.species}</div>
                        </div>

                        {/* Movement boxes */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                          <div style={{ background: 'var(--input-bg)', border: '1px solid var(--border-light)', borderLeft: '3.5px solid #16a34a', padding: '8px', borderRadius: '6px' }}>
                            <span style={{ fontSize: '8.5px', fontWeight: '800', color: '#16a34a', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Stock IN</span>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '2px', marginBottom: '3px' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>Qty</span>
                              <span>{fmt.number(g.inQty)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '2px', marginBottom: '3px' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>Avg</span>
                              <span>{fmt.currency(inAvg)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>Value</span>
                              <span>{fmt.currency(g.inVal)}</span>
                            </div>
                          </div>

                          <div style={{ background: 'var(--input-bg)', border: '1px solid var(--border-light)', borderLeft: '3.5px solid #dc2626', padding: '8px', borderRadius: '6px' }}>
                            <span style={{ fontSize: '8.5px', fontWeight: '800', color: '#dc2626', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Stock OUT</span>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '2px', marginBottom: '3px' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>Qty</span>
                              <span>{fmt.number(g.outQty)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '2px', marginBottom: '3px' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>Avg</span>
                              <span>{fmt.currency(outAvg)}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>Value</span>
                              <span>{fmt.currency(Math.abs(g.outVal))}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Card Footer */}
                      <div className="card-footer" style={{
                        background: 'rgba(22, 163, 74, 0.03)', padding: '10px 14px', borderTop: '1px solid var(--border-light)',
                        display: 'grid', gridTemplateColumns: '1fr 1fr 1.1fr', gap: '6px', alignItems: 'center'
                      }}>
                        <div>
                          <span style={{ fontSize: '7.5px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block' }}>Balance</span>
                          <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-primary)' }}>{fmt.number(availQty)} Kg</span>
                        </div>
                        <div>
                          <span style={{ fontSize: '7.5px', fontWeight: '800', color: '#d97706', textTransform: 'uppercase', display: 'block' }}>Avail Avg</span>
                          <span style={{ fontSize: '11px', fontWeight: '800', color: '#d97706' }}>{fmt.currency(availAvg)}</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontSize: '7.5px', fontWeight: '800', color: '#16a34a', textTransform: 'uppercase', display: 'block' }}>Stock Value</span>
                          <span style={{ fontSize: '11px', fontWeight: '800', color: '#16a34a' }}>{fmt.currency(availVal)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

        </div>
      )}

      {/* STICKY STATUS FOOTER */}
      {!loading && !error && (
        <div className="status-footer" style={{
          position: 'fixed', bottom: 0, left: '260px', right: 0, background: 'var(--surface-panel)',
          padding: '10px 20px', borderTop: '2px solid var(--border-light)', display: 'flex', flexWrap: 'wrap',
          gap: '24px', alignItems: 'center', boxShadow: '0 -4px 12px rgba(0,0,0,0.08)', zIndex: 1000
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRight: '1px solid var(--border-light)', paddingRight: '16px' }}>
            <span style={{ fontSize: '8px', color: 'var(--text-secondary)', textTransform: 'uppercase', display: 'block' }}>Total Items</span>
            <span style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-primary)' }}>{filteredRows.length}</span>
          </div>

          <div style={{ display: 'flex', gap: '16px', borderRight: '1px solid var(--border-light)', paddingRight: '16px' }}>
            <div>
              <span style={{ fontSize: '8px', color: '#16a34a', textTransform: 'uppercase', display: 'block' }}>Total Stock IN</span>
              <span style={{ fontSize: '13px', fontWeight: '800', color: '#16a34a' }}>{fmt.number(totalInQty)} Kg</span>
            </div>
            <div>
              <span style={{ fontSize: '8px', color: '#16a34a', textTransform: 'uppercase', display: 'block' }}>IN Value</span>
              <span style={{ fontSize: '13px', fontWeight: '800', color: '#16a34a' }}>{fmt.currency(totalInVal)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '16px', borderRight: '1px solid var(--border-light)', paddingRight: '16px' }}>
            <div>
              <span style={{ fontSize: '8px', color: '#dc2626', textTransform: 'uppercase', display: 'block' }}>Total Stock OUT</span>
              <span style={{ fontSize: '13px', fontWeight: '800', color: '#dc2626' }}>{fmt.number(totalOutQty)} Kg</span>
            </div>
            <div>
              <span style={{ fontSize: '8px', color: '#dc2626', textTransform: 'uppercase', display: 'block' }}>OUT Value</span>
              <span style={{ fontSize: '13px', fontWeight: '800', color: '#dc2626' }}>{fmt.currency(totalOutValAbs)}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '20px' }}>
            <div>
              <span style={{ fontSize: '8px', color: 'var(--corp-dash)', textTransform: 'uppercase', display: 'block' }}>Available Stock</span>
              <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--corp-dash)' }}>{fmt.number(availableQty)} Kg</span>
            </div>
            <div>
              <span style={{ fontSize: '8px', color: '#d97706', textTransform: 'uppercase', display: 'block' }}>Avg Rate</span>
              <span style={{ fontSize: '13px', fontWeight: '800', color: '#d97706' }}>{fmt.currency(avgRate)}</span>
            </div>
            <div>
              <span style={{ fontSize: '8px', color: 'var(--corp-dash)', textTransform: 'uppercase', display: 'block' }}>Balance Value</span>
              <span style={{ fontSize: '13px', fontWeight: '800', color: 'var(--corp-dash)' }}>{fmt.currency(balanceValue)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
