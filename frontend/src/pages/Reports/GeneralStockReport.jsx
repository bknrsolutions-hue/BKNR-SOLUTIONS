/**
 * GeneralStockReport.jsx – General Store Stock Ledger
 */
import React, { useState } from 'react';
import {
  ReportHeader, FilterBar, FilterBox, FilterSelect, FilterInput,
  KPIGrid, KPICard, Loader, ErrorBox, SearchInput, RowActionMenu,
  FinYearSelect, useReport, fmt, EmptyRow,
} from './ReportShell';

export default function GeneralStockReport({ activeRoute }) {
  const [fy, setFy] = useState('');
  const [item, setItem] = useState('');
  const [grn, setGrn] = useState('');
  const [unit, setUnit] = useState('');
  const [movement, setMovement] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [month, setMonth] = useState('');
  const [search, setSrch] = useState('');

  const { data, loading, error, reload } = useReport({
    url: activeRoute,
    params: fy ? { fy } : {},
    deps: [fy],
  });

  const rawRecords = data?.records || [];

  // Filter records
  const records = rawRecords.filter(r => {
    if (item && r.item_name !== item) return false;
    if (grn && r.grn_number !== grn) return false;
    if (unit && r.unit_name !== unit) return false;
    if (movement && r.movement_type !== movement) return false;
    if (fromDate && r.date < fromDate) return false;
    if (toDate && r.date > toDate) return false;
    if (month) {
      const m = r.date ? r.date.substring(0, 7) : '';
      if (m !== month) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const match = Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  // Dynamic filter lists
  const grnList = data?.dropdown_grn || [...new Set(rawRecords.map(r => r.grn_number).filter(Boolean))].sort();
  const itemsList = data?.dropdown_items || [...new Set(rawRecords.map(r => r.item_name).filter(Boolean))].sort();
  const unitsList = data?.dropdown_unit || [...new Set(rawRecords.map(r => r.unit_name).filter(Boolean))].sort();
  const monthsList = [...new Set(rawRecords.map(r => r.date ? r.date.substring(0, 7) : '').filter(Boolean))].sort();

  // Footer sums
  const totalQty = records.reduce((s, r) => s + Number(r.quantity || 0), 0);

  const resetFilters = () => {
    setFy('');
    setItem('');
    setGrn('');
    setUnit('');
    setMovement('');
    setFromDate('');
    setToDate('');
    setMonth('');
    setSrch('');
  };

  const exportCSV = () => {
    const headers = ['Date', 'Time', 'GRN Number', 'Item Name', 'Unit', 'Movement', 'Opening Stock', 'Qty', 'Available Stock', 'Min Level', 'User'];
    const csvRows = [headers.join(',')];
    records.forEach(r => {
      const row = [
        r.date,
        r.time,
        `"${r.grn_number || ''}"`,
        `"${r.item_name || ''}"`,
        `"${r.unit_name || ''}"`,
        r.movement_type,
        r.opening_stock,
        r.quantity,
        r.available_stock,
        r.minimum_level,
        r.email
      ];
      csvRows.push(row.join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'general_store_stock_ledger.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const menuActions = [
    { label: 'Print Report', onClick: () => window.print() },
    { label: 'Export Excel (CSV)', onClick: exportCSV },
    { divider: true },
    { label: 'Reset Filters', onClick: resetFilters }
  ];

  return (
    <div className="report-viewer-card">
      <ReportHeader title="General Store Stock Ledger" loading={loading} onReload={reload} />

      <FilterBar>
        <FilterBox label="Financial Year">
          <FinYearSelect value={fy} onChange={setFy} list={['2024', '2025', '2026']} />
        </FilterBox>
        <FilterBox label="Billing Month">
          <FilterSelect value={month} onChange={setMonth}>
            <option value="">ALL MONTHS</option>
            {monthsList.map(m => <option key={m} value={m}>{m}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="From Date">
          <FilterInput type="date" value={fromDate} onChange={setFromDate} />
        </FilterBox>
        <FilterBox label="To Date">
          <FilterInput type="date" value={toDate} onChange={setToDate} />
        </FilterBox>
        <FilterBox label="GRN">
          <FilterSelect value={grn} onChange={setGrn}>
            <option value="">ALL GRNs</option>
            {grnList.map(g => <option key={g} value={g}>{g}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Item">
          <FilterSelect value={item} onChange={setItem}>
            <option value="">ALL ITEMS</option>
            {itemsList.map(i => <option key={i} value={i}>{i}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Unit">
          <FilterSelect value={unit} onChange={setUnit}>
            <option value="">ALL UNITS</option>
            {unitsList.map(u => <option key={u} value={u}>{u}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Movement">
          <FilterSelect value={movement} onChange={setMovement}>
            <option value="">ALL MOVEMENTS</option>
            <option value="IN">IN</option>
            <option value="OUT">OUT</option>
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Search">
          <SearchInput value={search} onChange={setSrch} placeholder="Item, GRN, User..." />
        </FilterBox>
      </FilterBar>

      <div className="actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div id="rowCount" style={{ fontSize: 12, fontWeight: 700, color: 'var(--corp-rep)' }}>
          {records.length} records found
        </div>
        <RowActionMenu actions={menuActions} />
      </div>

      {loading && <Loader />}
      {error && <ErrorBox msg={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          <KPIGrid>
            <KPICard label="Total Entries" value={records.length} accent="var(--corp-dash)" />
            <KPICard label="Items"
              value={new Set(records.map(r => r.item_name)).size}
              accent="var(--corp-ops)" />
            <KPICard label="Total Quantity" value={fmt.number(totalQty)} accent="var(--corp-fin)" />
          </KPIGrid>

          <div className="card" style={{ marginTop: 0 }}>
            <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
              <table className="bknr-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>Date</th>
                    <th style={{ width: 70 }}>Time</th>
                    <th style={{ width: 120 }}>GRN Number</th>
                    <th>Item Name</th>
                    <th style={{ width: 100 }} className="text-center">Unit</th>
                    <th style={{ width: 100 }} className="text-center">Movement</th>
                    <th style={{ width: 130 }} className="text-right">Opening Stock</th>
                    <th style={{ width: 110 }} className="text-right">Qty</th>
                    <th style={{ width: 130 }} className="text-right">Available Stock</th>
                    <th style={{ width: 110 }} className="text-right">Min Level</th>
                    <th style={{ width: 120 }}>User</th>
                  </tr>
                </thead>
                <tbody>
                  {records.length === 0 ? <EmptyRow cols={11} /> :
                    records.map((r, i) => (
                      <tr key={i}>
                        <td className="text-center">{r.date}</td>
                        <td className="text-center">{r.time}</td>
                        <td style={{ fontWeight: 700, color: 'var(--accent)' }}>{r.grn_number}</td>
                        <td>{r.item_name}</td>
                        <td className="text-center">{r.unit_name}</td>
                        <td className="text-center">
                          <span style={{
                            padding: '2px 10px', fontSize: 10, fontWeight: 800, borderRadius: 12,
                            textTransform: 'uppercase',
                            background: r.movement_type === 'IN' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                            color: r.movement_type === 'IN' ? '#10b981' : '#ef4444',
                            border: r.movement_type === 'IN' ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(239,68,68,0.3)',
                          }}>{r.movement_type}</span>
                        </td>
                        <td className="text-right">{fmt.number(r.opening_stock)}</td>
                        <td className="text-right" style={{ fontWeight: 700 }}>{fmt.number(r.quantity)}</td>
                        <td className="text-right" style={{
                          color: Number(r.available_stock) <= Number(r.minimum_level) ? '#ef4444' : undefined,
                          fontWeight: 700
                        }}>{fmt.number(r.available_stock)}</td>
                        <td className="text-right">{fmt.number(r.minimum_level)}</td>
                        <td style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                          {r.email ? r.email.split('@')[0] : ''}
                        </td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr style={{ fontWeight: 800 }}>
                    <td colSpan={7} style={{ textAlign: 'right', paddingRight: '12px' }}>PAGE TOTAL QUANTITY:</td>
                    <td className="text-right" style={{ color: 'var(--accent)', fontWeight: 800 }}>{fmt.number(totalQty)}</td>
                    <td colSpan={3}></td>
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

