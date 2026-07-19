/**
 * ReprocessReport.jsx – Re-Process Inventory Ledger
 */
import React, { useState } from 'react';
import {
  ReportHeader, FilterBar, FilterBox, FilterSelect, FilterInput,
  Loader, ErrorBox, SearchInput, EmptyRow,
  FinYearSelect, useReport, fmt
} from './ReportShell';

export default function ReprocessReport({ activeRoute }) {
  const [fy, setFy] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('reprocess'); // 'reprocess' | 'sales' | 'storing'

  const { data, loading, error, reload } = useReport({
    url: activeRoute,
    params: fy ? { fy } : {},
    deps: [fy],
  });

  const getActiveRows = () => {
    if (!data) return [];
    if (activeTab === 'sales') return data.rows_sales || [];
    if (activeTab === 'storing') return data.rows_storing || [];
    return data.rows_reprocess || [];
  };

  const rawRows = getActiveRows();

  // Filter rows
  const filteredRows = rawRows.filter(r => {
    if (fromDate && r.date < fromDate) return false;
    if (toDate && r.date > toDate) return false;
    if (search) {
      const q = search.toLowerCase();
      const match = Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  // Calculate grand totals
  const grandQty = filteredRows.reduce((s, r) => s + Number(r.in_qty || r.qty || 0), 0);
  const grandVal = filteredRows.reduce((s, r) => s + Number(r.inventory_value || r.value || 0), 0);

  // Grouping by Date
  const groups = {};
  filteredRows.forEach(r => {
    const d = r.date || 'UNKNOWN';
    if (!groups[d]) {
      groups[d] = {
        displayDate: r.date ? r.date.split('-').reverse().join('-') : 'UNKNOWN', // DD-MM-YYYY format helper
        items: [],
        subQty: 0,
        subVal: 0,
      };
    }
    groups[d].items.push(r);
    groups[d].subQty += Number(r.in_qty || r.qty || 0);
    groups[d].subVal += Number(r.inventory_value || r.value || 0);
  });

  // Render grouped table rows
  const renderGroupedRows = () => {
    const sortedDates = Object.keys(groups).sort().reverse();
    const trs = [];

    sortedDates.forEach(dKey => {
      const g = groups[dKey];
      trs.push(
        <tr key={`group-${dKey}`} style={{ background: 'rgba(71,85,105,0.08)', fontWeight: 800 }}>
          <td colSpan={11}>DATE: {g.displayDate}</td>
          <td className="text-right">{fmt.number(g.subQty)}</td>
          <td></td>
          <td className="text-right">{fmt.currency(g.subVal)}</td>
          <td></td>
        </tr>
      );

      g.items.forEach((row, idx) => {
        trs.push(
          <tr key={row.id || `${dKey}-${idx}`}>
            <td className="text-center">{idx + 1}</td>
            <td className="text-center">{row.date}</td>
            <td className="text-center" style={{ fontWeight: 700 }}>{row.new_batch_id}</td>
            <td className="text-center">{row.original_batch}</td>
            <td>{row.production_for}</td>
            <td>{row.reprocess_type}</td>
            <td>{row.variety}</td>
            <td className="text-center">{row.grade}</td>
            <td>{row.species}</td>
            <td>{row.freezer}</td>
            <td className="text-center">{row.glaze}</td>
            <td className="text-right">{fmt.number(row.in_qty)}</td>
            <td className="text-right">{fmt.currency(row.product_kg_value)}</td>
            <td className="text-right" style={{ fontWeight: 700 }}>{fmt.currency(row.inventory_value)}</td>
            <td>{row.production_at}</td>
          </tr>
        );
      });
    });

    return trs;
  };

  return (
    <div className="report-viewer-card">
      <ReportHeader
        title="Re-Process Inventory Ledger"
        subtitle={`${filteredRows.length} entries loaded${fy ? ` — FY ${fy}–${Number(fy)+1}` : ''}`}
        loading={loading}
        onReload={reload}
      />

      <FilterBar>
        <FilterBox label="Financial Year">
          <FinYearSelect value={fy} onChange={setFy} list={data?.financial_years} />
        </FilterBox>
        <FilterBox label="From">
          <FilterInput type="date" value={fromDate} onChange={setFromDate} />
        </FilterBox>
        <FilterBox label="To">
          <FilterInput type="date" value={toDate} onChange={setToDate} />
        </FilterBox>
        <FilterBox label="Search">
          <SearchInput value={search} onChange={setSearch} />
        </FilterBox>
      </FilterBar>

      <div className="tabs-container" style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        {[
          { key: 'reprocess', label: 'Reprocess' },
          { key: 'sales', label: 'Sales Out' },
          { key: 'storing', label: 'Storing Out' }
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              padding: '8px 18px',
              fontSize: 11,
              fontWeight: 800,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              textTransform: 'uppercase',
              background: activeTab === t.key ? 'var(--corp-rep)' : 'var(--input-bg)',
              color: activeTab === t.key ? '#fff' : 'var(--text-secondary)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && <Loader />}
      {error && <ErrorBox msg={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table className="bknr-table" style={{ minWidth: 1300, width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 45 }}>#</th>
                  <th style={{ width: 85 }}>Date</th>
                  <th style={{ width: 120 }}>Generated Batch</th>
                  <th style={{ width: 110 }}>Original Batch</th>
                  <th style={{ width: 120 }}>Production For</th>
                  <th style={{ width: 100 }}>Purpose</th>
                  <th style={{ width: 120 }}>Variety</th>
                  <th style={{ width: 80 }}>Grade</th>
                  <th style={{ width: 100 }}>Species</th>
                  <th style={{ width: 90 }}>Freezer</th>
                  <th style={{ width: 65 }}>Glaze</th>
                  <th style={{ width: 85 }} className="text-right">In-Qty</th>
                  <th style={{ width: 85 }} className="text-right">Rate</th>
                  <th style={{ width: 105 }} className="text-right">Total Value</th>
                  <th style={{ width: 120 }}>Production At</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <EmptyRow cols={15} />
                ) : (
                  renderGroupedRows()
                )}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 800 }}>
                  <td colSpan={11} style={{ textAlign: 'right', fontWeight: 800 }}>GRAND TOTALS:</td>
                  <td className="text-right">{fmt.number(grandQty)}</td>
                  <td></td>
                  <td className="text-right">{fmt.currency(grandVal)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}


    </div>
  );
}
