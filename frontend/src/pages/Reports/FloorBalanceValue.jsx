/**
 * FloorBalanceValue.jsx – Floor Balance Costing Report
 * Grouped hierarchically: Location -> Production For -> Variety.
 */
import React, { useState } from 'react';
import {
  ReportHeader, FilterBar, FilterBox, FilterSelect, FilterInput,
  KPIGrid, KPICard, Loader, ErrorBox, SearchInput, EmptyRow,
  useReport, fmt,
} from './ReportShell';

export default function FloorBalanceValue({ activeRoute }) {
  const [fLocation, setFLocation] = useState('');
  const [fProduction, setFProduction] = useState('');
  const [fVariety, setFVariety] = useState('');
  const [search, setSearch] = useState('');

  const { data, loading, error, reload } = useReport({ url: activeRoute || '/summary/floor_balance_value' });

  const rawRows = data?.rows_batch || [];

  // Derive unique values for select dropdowns from raw data
  const locationsList = Array.from(new Set(rawRows.map(r => r.location || 'Floor'))).sort();
  const productionList = Array.from(new Set(rawRows.map(r => r.production_for || 'General Stock'))).sort();
  const varietiesList = Array.from(new Set(rawRows.map(r => r.variety || '—'))).sort();

  // Local filter logic
  const filtered = rawRows.filter(d => {
    const loc = d.location || 'Floor';
    const prod = d.production_for || 'General Stock';
    const vr = d.variety || '—';

    if (fLocation && loc !== fLocation) return false;
    if (fProduction && prod !== fProduction) return false;
    if (fVariety && vr !== fVariety) return false;

    if (search) {
      const q = search.toLowerCase();
      const txt = `${d.batch || ''} ${d.species || ''} ${d.source || ''} ${loc} ${prod} ${vr}`.toLowerCase();
      if (!txt.includes(q)) return false;
    }
    return true;
  });

  // Sorting
  filtered.sort((a, b) => {
    const locA = a.location || 'Floor';
    const locB = b.location || 'Floor';
    const prodA = a.production_for || 'General Stock';
    const prodB = b.production_for || 'General Stock';

    return locA.localeCompare(locB) || prodA.localeCompare(prodB);
  });

  // Build tree grouping
  const tree = {};
  let grandQty = 0;
  let grandValue = 0;

  filtered.forEach(d => {
    const loc = d.location || 'Floor';
    const prod = d.production_for || 'General Stock';
    const vr = d.variety || '—';
    const qty = Number(d.available_qty || 0);
    const value = Number(d.value || 0);

    if (!tree[loc]) {
      tree[loc] = { qty: 0, val: 0, comps: {} };
    }
    if (!tree[loc].comps[prod]) {
      tree[loc].comps[prod] = { qty: 0, val: 0, vars: {} };
    }
    if (!tree[loc].comps[prod].vars[vr]) {
      tree[loc].comps[prod].vars[vr] = { qty: 0, val: 0, items: [] };
    }

    tree[loc].qty += qty;
    tree[loc].val += value;
    tree[loc].comps[prod].qty += qty;
    tree[loc].comps[prod].val += value;
    tree[loc].comps[prod].vars[vr].qty += qty;
    tree[loc].comps[prod].vars[vr].val += value;
    tree[loc].comps[prod].vars[vr].items.push(d);

    grandQty += qty;
    grandValue += value;
  });

  // Build rows array based on tree traversal
  const renderedRows = [];
  let sl = 1;

  Object.keys(tree).sort().forEach(loc => {
    // 1. Location Total
    renderedRows.push({
      isGroupRow: true,
      className: 'row-loc',
      style: { background: 'var(--primary)', color: '#ffffff', fontWeight: 800 },
      label: `${loc} TOTAL`,
      qty: tree[loc].qty,
      val: tree[loc].val,
    });

    const comps = tree[loc].comps;
    Object.keys(comps).sort().forEach(prod => {
      // 2. Client/Company Total
      renderedRows.push({
        isGroupRow: true,
        className: 'row-comp',
        style: { background: 'rgba(37, 99, 235, 0.08)', color: 'var(--corp-dash)', fontWeight: 700 },
        label: `-- ${prod} TOTAL`,
        qty: comps[prod].qty,
        val: comps[prod].val,
      });

      const vars = comps[prod].vars;
      Object.keys(vars).sort().forEach(vr => {
        // 3. Variety Total
        renderedRows.push({
          isGroupRow: true,
          className: 'row-var',
          style: { background: 'var(--border-light)', color: 'var(--text-secondary)', fontWeight: 700 },
          label: `---- ${vr} TOTAL`,
          qty: vars[vr].qty,
          val: vars[vr].val,
        });

        // 4. Individual Items
        vars[vr].items.forEach(item => {
          renderedRows.push({
            isGroupRow: false,
            sl: sl++,
            location: item.location || 'Floor',
            production_for: item.production_for || 'General Stock',
            batch: item.batch,
            source: item.source || 'RMP',
            species: item.species,
            variety: item.variety,
            count: item.count,
            qty: Number(item.available_qty || 0),
            val: Number(item.value || 0),
          });
        });
      });
    });
  });

  return (
    <div className="report-viewer-card">
      <ReportHeader
        title="Floor Balance Valuation Report"
        loading={loading}
        onReload={reload}
        onPrint={() => window.print()}
      />

      {/* Filters bar */}
      <FilterBar>
        <FilterBox label="Location">
          <FilterSelect value={fLocation} onChange={setFLocation}>
            <option value="">All Locations</option>
            {locationsList.map(l => <option key={l} value={l}>{l}</option>)}
          </FilterSelect>
        </FilterBox>

        <FilterBox label="Production For">
          <FilterSelect value={fProduction} onChange={setFProduction}>
            <option value="">All Stocks</option>
            {productionList.map(p => <option key={p} value={p}>{p}</option>)}
          </FilterSelect>
        </FilterBox>

        <FilterBox label="Variety">
          <FilterSelect value={fVariety} onChange={setFVariety}>
            <option value="">All Varieties</option>
            {varietiesList.map(v => <option key={v} value={v}>{v}</option>)}
          </FilterSelect>
        </FilterBox>

        <FilterBox label="Global Filter">
          <SearchInput value={search} onChange={setSearch} />
        </FilterBox>
      </FilterBar>

      {loading && <Loader />}
      {error && <ErrorBox msg={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          {/* KPI indicators */}
          <KPIGrid>
            <KPICard label="SKU Lines" value={filtered.length} accent="var(--corp-dash)" />
            <KPICard label="Total Qty (Kg)" value={`${fmt.number(grandQty)} Kg`} accent="var(--corp-ops)" />
            <KPICard label="Total Value (₹)" value={fmt.currency(grandValue)} accent="var(--corp-fin)" />
            <KPICard label="Avg Rate (₹/Kg)"
              value={fmt.currency(grandQty > 0 ? grandValue / grandQty : 0)}
              accent="var(--corp-rep)" />
          </KPIGrid>

          <div style={{ margin: '8px 0', fontSize: '11px', fontWeight: '700', color: 'var(--corp-dash)' }}>
            {filtered.length} Records Found
          </div>

          {/* Hierarchical Table */}
          <div className="card" style={{ marginTop: 0, padding: 0, overflow: 'hidden' }}>
            <div className="table-responsive">
              <table className="bknr-table" style={{ minWidth: 1100 }}>
                <thead>
                  <tr>
                    <th style={{ width: 50 }}>#</th>
                    <th style={{ width: 140 }}>Location</th>
                    <th style={{ width: 150 }}>Production For</th>
                    <th style={{ width: 110 }}>Batch No</th>
                    <th style={{ width: 100 }}>Source</th>
                    <th style={{ width: 120 }}>Species</th>
                    <th style={{ width: 120 }}>Variety</th>
                    <th style={{ width: 90 }}>Count</th>
                    <th className="text-right" style={{ width: 120 }}>Qty (Kg)</th>
                    <th className="text-right" style={{ width: 140 }}>Value (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {renderedRows.length === 0 ? (
                    <EmptyRow cols={10} />
                  ) : (
                    renderedRows.map((row, idx) => {
                      if (row.isGroupRow) {
                        return (
                          <tr key={idx} className={row.className} style={row.style}>
                            <td colSpan={8} style={{ paddingLeft: '12px', textAlign: 'left', fontWeight: 800 }}>
                              {row.label}
                            </td>
                            <td className="text-right" style={{ fontWeight: 800, paddingRight: '8px' }}>
                              {fmt.number(row.qty)}
                            </td>
                            <td className="text-right" style={{ fontWeight: 800, paddingRight: '8px' }}>
                              {fmt.currency(row.val)}
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={idx}>
                          <td className="text-center" style={{ color: 'var(--text-tertiary)' }}>{row.sl}</td>
                          <td style={{ textAlign: 'left' }}>{row.location}</td>
                          <td style={{ textAlign: 'left' }}>{row.production_for}</td>
                          <td style={{ fontWeight: 700 }}>{row.batch}</td>
                          <td className="text-center">
                            <span className="source-tag" style={{
                              padding: '2px 6px', fontSize: '9px', fontWeight: 800, borderRadius: '4px',
                              background: row.source === 'RMP' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(124, 58, 237, 0.1)',
                              color: row.source === 'RMP' ? '#3b82f6' : '#7c3aed'
                            }}>{row.source}</span>
                          </td>
                          <td>{row.species}</td>
                          <td style={{ textAlign: 'left' }}>
                            <span className="tag" style={{ fontWeight: 600 }}>{row.variety}</span>
                          </td>
                          <td>{row.count}</td>
                          <td className="text-right" style={{ fontWeight: 800 }}>{fmt.number(row.qty)}</td>
                          <td className="text-right" style={{ color: 'var(--completed-text)' }}>{fmt.currency(row.val)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 800 }}>
                    <td colSpan={8} style={{ textAlign: 'right', paddingRight: '8px' }}>GRAND TOTAL:</td>
                    <td className="text-right" style={{ fontWeight: 800 }}>{fmt.number(grandQty)}</td>
                    <td className="text-right" style={{ color: 'var(--completed-text)', fontWeight: 800 }}>{fmt.currency(grandValue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
