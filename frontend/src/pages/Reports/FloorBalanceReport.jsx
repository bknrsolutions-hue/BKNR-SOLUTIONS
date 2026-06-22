/**
 * FloorBalanceReport.jsx – Floor Balance Stock Register
 */
import React, { useState } from 'react';
import {
  ReportHeader, FilterBar, FilterBox, FilterSelect,
  KPIGrid, KPICard, Loader, ErrorBox, SearchInput, EmptyRow,
  useReport, fmt
} from './ReportShell';

export default function FloorBalanceReport({ activeRoute }) {
  const [search, setSearch] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [prodFilter, setProdFilter] = useState('');
  const [speciesFilter, setSpeciesFilter] = useState('');

  const { data, loading, error, reload } = useReport({ url: activeRoute });

  const rawRows = data?.rows_batch || [];

  // Filter raw rows
  const filteredRows = rawRows.filter(r => {
    if (locationFilter && r.location !== locationFilter) return false;
    if (sourceFilter && r.source !== sourceFilter) return false;
    if (prodFilter && r.production_for !== prodFilter) return false;
    if (speciesFilter && r.species !== speciesFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const match = Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  // Calculate unique filters dynamically from current data
  const locationsList = [...new Set(rawRows.map(r => r.location).filter(Boolean))].sort();
  const prodForList = [...new Set(rawRows.map(r => r.production_for).filter(Boolean))].sort();
  const speciesList = [...new Set(rawRows.map(r => r.species).filter(Boolean))].sort();

  // Grand total
  const grandTotalQty = filteredRows.reduce((s, r) => s + Number(r.available_qty || 0), 0);

  // Grouping logic for rendering
  const renderGroupedRows = () => {
    if (filteredRows.length === 0) {
      return <EmptyRow cols={8} />;
    }

    const groups = {}; // location -> batch -> rows
    filteredRows.forEach(r => {
      const loc = r.location || 'Floor';
      const batch = r.batch || 'N/A';
      if (!groups[loc]) groups[loc] = {};
      if (!groups[loc][batch]) groups[loc][batch] = [];
      groups[loc][batch].push(r);
    });

    const trs = [];
    let sl = 1;

    const sortedLocs = Object.keys(groups).sort();
    sortedLocs.forEach(loc => {
      trs.push(
        <tr key={`loc-${loc}`} className="row-location" style={{ background: 'rgba(71,85,105,0.08)', fontWeight: 800 }}>
          <td colSpan={8} style={{ textAlign: 'left', fontWeight: 800, paddingLeft: '12px', textTransform: 'uppercase' }}>
            📍 {loc}
          </td>
        </tr>
      );

      const sortedBatches = Object.keys(groups[loc]).sort();
      sortedBatches.forEach(batch => {
        const batchRows = groups[loc][batch];
        let subtotal = 0;

        batchRows.forEach((row, idx) => {
          subtotal += Number(row.available_qty || 0);
          trs.push(
            <tr key={`row-${loc}-${batch}-${idx}`} className="data-row">
              <td className="text-center">{sl++}</td>
              <td className="text-left" style={{ color: 'var(--accent)', fontWeight: 700 }}>{batch}</td>
              <td className="text-center">
                <span className="badge" style={{
                  padding: '2px 5px',
                  borderRadius: '3px',
                  fontSize: '9px',
                  fontWeight: 800,
                  background: 'var(--input-bg)',
                  border: '1px solid var(--border)'
                }}>{row.source}</span>
              </td>
              <td className="text-left">{row.variety}</td>
              <td className="text-center">{row.count}</td>
              <td className="text-center" style={{ color: 'var(--text-secondary)' }}>{row.species}</td>
              <td className="text-left">{row.production_for}</td>
              <td className="text-right" style={{ fontWeight: 700 }}>{fmt.number(row.available_qty)}</td>
            </tr>
          );
        });

        trs.push(
          <tr key={`sub-${loc}-${batch}`} className="row-batch-total" style={{ background: 'rgba(148,163,184,0.04)', fontWeight: 700 }}>
            <td colSpan={7} className="subtotal-label" style={{ textAlign: 'right', paddingRight: '12px', color: 'var(--text-secondary)' }}>
              Batch [{batch}] Total:
            </td>
            <td className="qty-bold text-right" style={{ fontWeight: 800, color: 'var(--text-main)' }}>
              {fmt.number(subtotal)}
            </td>
          </tr>
        );
      });
    });

    return trs;
  };

  return (
    <div className="report-viewer-card">
      <ReportHeader
        title="Floor Balance Stock Register"
        subtitle={`${filteredRows.length} items loaded`}
        loading={loading}
        onReload={reload}
      />

      <FilterBar>
        <FilterBox label="Location">
          <FilterSelect value={locationFilter} onChange={setLocationFilter}>
            <option value="">ALL LOCATIONS</option>
            {locationsList.map(loc => <option key={loc} value={loc}>{loc}</option>)}
          </FilterSelect>
        </FilterBox>

        <FilterBox label="Source Vector">
          <FilterSelect value={sourceFilter} onChange={setSourceFilter}>
            <option value="">ALL SOURCES</option>
            <option value="RMP">RMP</option>
            <option value="REPROCESS">REPROCESS</option>
          </FilterSelect>
        </FilterBox>

        <FilterBox label="Production For">
          <FilterSelect value={prodFilter} onChange={setProdFilter}>
            <option value="">ALL COMPANIES</option>
            {prodForList.map(pf => <option key={pf} value={pf}>{pf}</option>)}
          </FilterSelect>
        </FilterBox>

        <FilterBox label="Species Type">
          <FilterSelect value={speciesFilter} onChange={setSpeciesFilter}>
            <option value="">ALL SPECIES</option>
            {speciesList.map(sp => <option key={sp} value={sp}>{sp}</option>)}
          </FilterSelect>
        </FilterBox>

        <FilterBox label="Search">
          <SearchInput value={search} onChange={setSearch} placeholder="Batch/Variety..." />
        </FilterBox>
      </FilterBar>

      <div className="actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div id="rowCount" style={{ fontSize: 12, fontWeight: 700, color: 'var(--corp-rep)' }}>
          {filteredRows.length} records found
        </div>
      </div>

      {loading && <Loader />}
      {error && <ErrorBox msg={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <KPIGrid>
            <KPICard label="Total SKUs" value={filteredRows.length} accent="var(--corp-dash)" />
            <KPICard label="Total Balance (Kg)" value={fmt.number(grandTotalQty)} accent="var(--corp-ops)" />
          </KPIGrid>
          
          <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table className="bknr-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 45 }}>#</th>
                  <th style={{ width: 120 }}>Batch</th>
                  <th style={{ width: 100 }}>Src</th>
                  <th>Variety Description</th>
                  <th style={{ width: 100 }}>Count</th>
                  <th style={{ width: 100 }}>Spec</th>
                  <th style={{ width: 150 }}>Prod For</th>
                  <th style={{ width: 120 }} className="text-right">Avail (KG)</th>
                </tr>
              </thead>
              <tbody>
                {renderGroupedRows()}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 800 }}>
                  <td colSpan={7} style={{ textAlign: 'right', paddingRight: '12px' }}>GRAND NET BALANCE:</td>
                  <td className="text-right" style={{ color: 'var(--accent)', fontWeight: 800 }}>
                    {fmt.number(grandTotalQty)} KG
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

