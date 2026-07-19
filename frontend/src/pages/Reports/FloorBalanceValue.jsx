/**
 * FloorBalanceValue.jsx – Floor Balance Costing Report
 * Grouped hierarchically: Location -> Production For -> Variety.
 */
import { useState } from 'react';
import {
  Loader, ErrorBox, EmptyRow, useReport, fmt,
} from './ReportShell';
import './CostingReports.css';

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
    <div className="costing-floor-report">
      <aside className="floor-template-sidebar">
        <h2>Report Filters</h2>
        <div className="floor-template-filters">
          <label className="floor-template-fbox"><span>Location</span>
          <select value={fLocation} onChange={event => setFLocation(event.target.value)}>
            <option value="">All Locations</option>
            {locationsList.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          </label>

          <label className="floor-template-fbox"><span>Production For</span>
          <select value={fProduction} onChange={event => setFProduction(event.target.value)}>
            <option value="">All Stocks</option>
            {productionList.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          </label>

          <label className="floor-template-fbox"><span>Variety</span>
          <select value={fVariety} onChange={event => setFVariety(event.target.value)}>
            <option value="">All Varieties</option>
            {varietiesList.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
          </label>

          <label className="floor-template-fbox"><span>Global Filter</span>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by Batch, Species, Source..." />
          </label>
        </div>
      </aside>

      <main className="floor-template-main">
        <header className="floor-template-header">
          <h2>Floor Balance Value Summary</h2>
          <div className="floor-template-meta">
            <span>Company: {data?.company_id || '—'}</span>
            <span>{filtered.length} Records Found</span>
            <button type="button" onClick={() => window.print()}><i className="fas fa-print" /> Print</button>
          </div>
        </header>

        {loading && <Loader />}
        {error && <ErrorBox msg={error} onRetry={reload} />}

        {!loading && !error && (
          <section className="floor-template-section">
            <div className="floor-template-table-wrap">
              <table className="floor-template-table">
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
                          <tr key={idx} className={row.className}>
                            <td colSpan={8}>
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
                          <td>{row.sl}</td>
                          <td>{row.location}</td>
                          <td>{row.production_for}</td>
                          <td className="batch-bold">{row.batch}</td>
                          <td>
                            <span className="source-tag">{row.source}</span>
                          </td>
                          <td>{row.species}</td>
                          <td>
                            <span className="tag">{row.variety}</span>
                          </td>
                          <td>{row.count}</td>
                          <td className="qty-bold">{fmt.number(row.qty)}</td>
                          <td className="val-column">{fmt.currency(row.val)}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'right', paddingRight: '8px' }}>GRAND TOTAL:</td>
                    <td className="text-right" style={{ fontWeight: 800 }}>{fmt.number(grandQty)}</td>
                    <td className="text-right" style={{ color: 'var(--completed-text)', fontWeight: 800 }}>{fmt.currency(grandValue)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
