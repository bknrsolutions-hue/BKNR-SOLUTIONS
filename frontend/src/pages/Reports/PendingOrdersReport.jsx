/**
 * PendingOrdersReport.jsx – Pending Orders Production Tracker
 */
import { Fragment, useState } from 'react';
import {
  ReportHeader, FilterBar, FilterBox, FilterSelect, FilterInput,
  Loader, ErrorBox, SearchInput,
  EmptyRow, useReport, fmt
} from './ReportShell';

export default function PendingOrdersReport({ activeRoute }) {
  const [fromDate, setFrom] = useState('');
  const [toDate, setTo]     = useState('');
  const [poFilter, setPoFilter] = useState('');
  const [search, setSearch] = useState('');

  // Expand states for summaries and details
  const [hlsoExpanded, setHlsoExpanded] = useState(true);
  const [hosoExpanded, setHosoExpanded] = useState(true);
  const [drillExpanded, setDrillExpanded] = useState({}); // key -> boolean
  const [rowExpandType, setRowExpandType] = useState({}); // rowId -> 'referral' | 'utilization' | null

  const { data, loading, error, reload } = useReport({
    url: activeRoute,
    params: { ...(fromDate ? {from_date: fromDate} : {}), ...(toDate ? {to_date: toDate} : {}) },
    deps: [fromDate, toDate],
  });

  const rawRows = data?.rows || [];

  // Filter rows
  const rows = rawRows.filter(r => {
    if (poFilter && r.po_number !== poFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const match = Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  // Unique PO filter options
  const poOptions = data?.f_po || [];

  // Group rows by PO Number
  const poGroups = {};
  rows.forEach(r => {
    const po = r.po_number || 'N/A';
    if (!poGroups[po]) poGroups[po] = [];
    poGroups[po].push(r);
  });

  // Sort PO Groups by the sl_no of the first item
  const sortedPoKeys = Object.keys(poGroups).sort((a, b) => {
    const slA = poGroups[a][0]?.sl_no || 0;
    const slB = poGroups[b][0]?.sl_no || 0;
    return slA - slB;
  });

  // Calculate Requirement Summaries
  const hlsoSummary = {};
  const hosoSummary = {};

  rows.forEach(row => {
    const spVar = `${row.species} | ${row.variety}`;
    const hlCnt = Math.round(row.hl_count_calc || 0);
    const hoCnt = Math.round(row.hoso_count_calc || 0);
    const netCnt = row.net_count_calc || '-';

    if (row.req_hlso_qty > 0) {
      const key = `${spVar}||${hlCnt}`;
      if (!hlsoSummary[key]) {
        hlsoSummary[key] = { total: 0, details: [] };
      }
      hlsoSummary[key].total += Number(row.req_hlso_qty);
      hlsoSummary[key].details.push({ po: row.po_number, qty: Number(row.req_hlso_qty), exact: netCnt });
    }

    if (row.req_hoso_qty > 0) {
      const key = `${spVar}||${hoCnt}`;
      if (!hosoSummary[key]) {
        hosoSummary[key] = { total: 0, details: [] };
      }
      hosoSummary[key].total += Number(row.req_hoso_qty);
      hosoSummary[key].details.push({ po: row.po_number, qty: Number(row.req_hoso_qty), exact: netCnt });
    }
  });

  // Grand totals
  const grandTotal = {
    mc: rows.reduce((s, r) => s + Number(r.no_of_mc || 0), 0),
    stockMc: rows.reduce((s, r) => s + Number(r.stock_mc || 0), 0),
    pendMc: rows.reduce((s, r) => s + Number(r.prod_pending_mc || 0), 0),
    ordQty: rows.reduce((s, r) => s + Number(r.ordered_qty || 0), 0),
    avail: rows.reduce((s, r) => s + Number(r.available_stock || 0), 0),
    pendPrd: rows.reduce((s, r) => s + Number(r.pending_production || 0), 0),
    reqHl: rows.reduce((s, r) => s + Number(r.req_hlso_qty || 0), 0),
    reqHo: rows.reduce((s, r) => s + Number(r.req_hoso_qty || 0), 0),
  };

  const toggleDrill = (key) => {
    setDrillExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleRowExpand = (rowId, type) => {
    setRowExpandType(prev => ({
      ...prev,
      [rowId]: prev[rowId] === type ? null : type
    }));
  };

  const renderSummaryTable = (summaryObj, idPrefix) => {
    const keys = Object.keys(summaryObj).sort();
    let grandSum = 0;

    const trs = [];

    keys.forEach(key => {
      const [spVar, count] = key.split('||');
      const data = summaryObj[key];
      grandSum += data.total;
      const isDrillOpen = !!drillExpanded[`${idPrefix}_${key}`];

      trs.push(
        <Fragment key={key}>
          <tr>
            <td>{spVar}</td>
            <td
              className="clickable-count"
              onClick={() => toggleDrill(`${idPrefix}_${key}`)}
              style={{ color: 'var(--accent)', textDecoration: 'underline', cursor: 'pointer', fontWeight: 800 }}
            >
              {count}
            </td>
            <td className="text-right" style={{ fontWeight: 700 }}>{fmt.number(data.total)}</td>
          </tr>
          {isDrillOpen && (
            <tr className="drill-row">
              <td colSpan={3} style={{ padding: '6px' }}>
                <div style={{ background: 'var(--bg)', border: '1px dashed var(--border)', borderRadius: 6, padding: 6 }}>
                  <table className="bknr-table" style={{ width: '100%', fontSize: '10px' }}>
                    <thead>
                      <tr>
                        <th>PO</th>
                        <th>Exact Net Count</th>
                        <th className="text-right">Qty (Kg)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.details.map((d, dIdx) => (
                        <tr key={dIdx}>
                          <td className="text-center">{d.po}</td>
                          <td className="text-center">{d.exact}</td>
                          <td className="text-right">{fmt.number(d.qty)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </td>
            </tr>
          )}
        </Fragment>
      );
    });

    if (keys.length > 0) {
      trs.push(
        <tr key="total" style={{ fontWeight: 800, background: 'rgba(71,85,105,0.08)' }}>
          <td colSpan={2}>TOTAL REQUIREMENT</td>
          <td className="text-right">{fmt.number(grandSum)}</td>
        </tr>
      );
    } else {
      trs.push(
        <tr key="empty">
          <td colSpan={3} className="text-center" style={{ color: 'var(--text-secondary)' }}>No Requirements Pending</td>
        </tr>
      );
    }

    return trs;
  };

  const renderTableRows = () => {
    const trs = [];

    sortedPoKeys.forEach(po => {
      const items = poGroups[po];
      let subMc = 0, subStockMc = 0, subPendMc = 0;
      let subOrdQty = 0, subAvail = 0, subPendPrd = 0;
      let subReqHl = 0, subReqHo = 0;

      items.forEach((row, idx) => {
        // Accumulate subtotals
        subMc += Number(row.no_of_mc || 0);
        subStockMc += Number(row.stock_mc || 0);
        subPendMc += Number(row.prod_pending_mc || 0);
        subOrdQty += Number(row.ordered_qty || 0);
        subAvail += Number(row.available_stock || 0);
        subPendPrd += Number(row.pending_production || 0);
        subReqHl += Number(row.req_hlso_qty || 0);
        subReqHo += Number(row.req_hoso_qty || 0);

        const rowKey = `${po}-${idx}`;
        const expandType = rowExpandType[rowKey];

        trs.push(
          <tr key={rowKey} className="data-row">
            {idx === 0 && (
              <>
                <td rowSpan={items.length} className="text-center" style={{ background: 'var(--header-bg)', fontWeight: 700 }}>
                  {row.sl_no}
                </td>
                <td rowSpan={items.length} className="text-center po-cell-merged" style={{ background: 'var(--header-bg)', fontSize: '10px' }}>
                  {row.company_name}
                </td>
                <td rowSpan={items.length} className="text-center po-cell-merged" style={{ background: 'var(--header-bg)', fontWeight: 700, color: 'var(--accent)' }}>
                  {po}
                </td>
                <td rowSpan={items.length} className="text-left po-cell-merged" style={{ background: 'var(--header-bg)' }}>
                  {row.buyer}
                </td>
                <td rowSpan={items.length} className="text-center po-cell-merged" style={{ background: 'var(--header-bg)' }}>
                  {row.shipment_date}
                </td>
              </>
            )}
            <td>{row.packing_style}</td>
            <td>{row.brand}</td>
            <td style={{ fontWeight: 700 }}>{row.species}</td>
            <td>{row.variety}</td>
            <td className="text-center">{row.count_glaze}</td>
            <td className="text-center">{row.weight_glaze}</td>
            <td className="text-center">{row.grade}</td>
            <td className="text-center" style={{ fontWeight: 700 }}>{row.nw_grade}</td>
            <td className="text-center">{row.no_of_pieces}</td>
            <td className="text-center" style={{ fontWeight: 800 }}>{row.no_of_mc}</td>
            <td className="text-right">$ {fmt.number(row.selling_price)}</td>
            <td className="text-right">₹{fmt.number(row.exchange_rate || 83.5)}</td>
            <td className="text-center">{row.stock_mc}</td>
            <td className="text-center">{row.prod_pending_mc}</td>
            <td className="text-center" style={{ background: 'rgba(148,163,184,0.04)', fontWeight: 700 }}>{row.net_count_calc}</td>
            <td className="text-center" style={{ background: 'rgba(148,163,184,0.04)' }}>{row.hl_count_calc}</td>
            <td className="text-center" style={{ background: 'rgba(148,163,184,0.04)' }}>{row.hoso_count_calc}</td>
            <td className="text-right" style={{ color: 'var(--completed-text)', fontWeight: 800 }}>{fmt.number(row.ordered_qty)}</td>
            <td className="text-right">{fmt.number(row.available_stock)}</td>
            <td className="text-right" style={{ color: row.pending_production < 0 ? '#ef4444' : undefined }}>{fmt.number(row.pending_production)}</td>
            <td className="text-center">
              <span
                onClick={() => toggleRowExpand(rowKey, 'referral')}
                style={{
                  background: 'var(--input-bg)', color: 'var(--accent)', fontWeight: 800,
                  padding: '2px 6px', borderRadius: '3px', border: '1px solid var(--border)',
                  cursor: 'pointer', textDecoration: 'underline', fontSize: '9px'
                }}
              >
                {fmt.number(row.ref_opt_stock)}
              </span>
            </td>
            <td className="text-center">
              <span
                onClick={() => toggleRowExpand(rowKey, 'utilization')}
                style={{
                  background: 'var(--input-bg)', color: 'var(--accent)', fontWeight: 800,
                  padding: '2px 6px', borderRadius: '3px', border: '1px solid var(--border)',
                  cursor: 'pointer', textDecoration: 'underline', fontSize: '9px'
                }}
              >
                {fmt.number(row.existed_stock_util)}
              </span>
            </td>
            <td className="text-right" style={{ fontWeight: 800 }}>{fmt.number(row.req_hlso_qty)}</td>
            <td className="text-right" style={{ fontWeight: 800 }}>{fmt.number(row.req_hoso_qty)}</td>
          </tr>
        );

        // Expand detail drawer row if open
        if (expandType) {
          const detailTitle = expandType === 'referral' ? 'Referral Details' : 'Utilization History';
          const logsList = JSON.parse((expandType === 'referral' ? row.ref_json : row.util_json) || '[]');

          trs.push(
            <tr key={`expand-${rowKey}`} className="expand-row">
              <td colSpan={29} style={{ padding: '0px', background: 'var(--bg)' }}>
                <div style={{ padding: '8px 12px', background: 'var(--card-bg)', border: '1px solid var(--border)', margin: '4px', borderRadius: 4 }}>
                  <div style={{ fontWeight: 800, fontSize: '10px', textTransform: 'uppercase', marginBottom: '6px', color: 'var(--accent)' }}>
                    ℹ️ {detailTitle} ({row.species} / {row.variety} / {row.grade})
                  </div>
                  <table className="bknr-table" style={{ width: '100%', fontSize: '10px' }}>
                    <thead>
                      <tr>
                        <th>Source / PO / Location</th>
                        <th className="text-right">Opening Available</th>
                        <th className="text-right">Utilized</th>
                        <th className="text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logsList.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-center" style={{ color: 'var(--text-secondary)' }}>No records found.</td>
                        </tr>
                      ) : (
                        logsList.map((log, lIdx) => {
                          const label = log.po_no || log.po || log.source || '-';
                          const availVal = log.available ?? log.opening ?? 0;
                          const utilVal = log.utilized ?? 0;
                          const balVal = log.balance ?? 0;
                          return (
                            <tr key={lIdx}>
                              <td className="text-center"><span className="badge" style={{ padding: '2px 4px', background: 'var(--input-bg)' }}>{label}</span></td>
                              <td className="text-right">{fmt.number(availVal)}</td>
                              <td className="text-right" style={{ color: '#ef4444' }}>-{fmt.number(utilVal)}</td>
                              <td className="text-right" style={{ color: balVal < 0 ? '#ef4444' : '#10b981', fontWeight: 700 }}>{fmt.number(balVal)}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </td>
            </tr>
          );
        }
      });

      // Render PO subtotal row
      trs.push(
        <tr key={`subtotal-${po}`} className="subtotal-row" style={{ background: 'rgba(71,85,105,0.05)', fontWeight: 800 }}>
          <td colSpan={14} style={{ textAlign: 'right', paddingRight: '8px' }}>
            TOTAL {po}:
          </td>
          <td className="text-center">{subMc}</td>
          <td colSpan={2}></td>
          <td className="text-center">{subStockMc}</td>
          <td className="text-center">{subPendMc}</td>
          <td colSpan={3}></td>
          <td className="text-right">{fmt.number(subOrdQty)}</td>
          <td className="text-right">{fmt.number(subAvail)}</td>
          <td className="text-right">{fmt.number(subPendPrd)}</td>
          <td colSpan={2}></td>
          <td className="text-right">{fmt.number(subReqHl)}</td>
          <td className="text-right">{fmt.number(subReqHo)}</td>
        </tr>
      );
    });

    return trs;
  };

  return (
    <div className="report-viewer-card">
      <ReportHeader
        title="Pending Orders Premium Detailed Report"
        subtitle={`${rows.length} active order items`}
        loading={loading}
        onReload={reload}
      />

      <FilterBar>
        <FilterBox label="Ship From">
          <FilterInput type="date" value={fromDate} onChange={setFrom} />
        </FilterBox>
        <FilterBox label="Ship To">
          <FilterInput type="date" value={toDate} onChange={setTo} />
        </FilterBox>
        <FilterBox label="PO Selector">
          <FilterSelect value={poFilter} onChange={setPoFilter}>
            <option value="">ALL ACTIVE POS</option>
            {poOptions.map(po => <option key={po} value={po}>{po}</option>)}
          </FilterSelect>
        </FilterBox>
        <FilterBox label="Search Stream">
          <SearchInput value={search} onChange={setSearch} placeholder="Buyer, Brand, Species, Var, Grd..." />
        </FilterBox>
        <FilterBox label="Actions">
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-clear" type="button" onClick={() => { setFrom(''); setTo(''); setPoFilter(''); setSearch(''); }}>Reset</button>
            <button className="btn btn-primary" type="button" onClick={() => window.print()}>Print</button>
          </div>
        </FilterBox>
      </FilterBar>

      {loading && <Loader />}
      {error && <ErrorBox msg={error} onRetry={reload} />}

      {!loading && !error && (
        <>
          {/* Collapsible Summaries Container */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <div
                onClick={() => setHlsoExpanded(!hlsoExpanded)}
                style={{
                  background: 'var(--header-bg)', padding: '10px 14px', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)'
                }}
              >
                <span style={{ fontWeight: 850, fontSize: 11, letterSpacing: 0.5 }}>HLSO REQUIREMENT SUMMARY</span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{hlsoExpanded ? '▲' : '▼'}</span>
              </div>
              {hlsoExpanded && (
                <div style={{ padding: 6 }}>
                  <table className="bknr-table" style={{ width: '100%', fontSize: '10.5px' }}>
                    <thead>
                      <tr>
                        <th>Species | Variety</th>
                        <th>Count</th>
                        <th className="text-right">Total KG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {renderSummaryTable(hlsoSummary, 'hlso')}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <div
                onClick={() => setHosoExpanded(!hosoExpanded)}
                style={{
                  background: 'var(--header-bg)', padding: '10px 14px', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)'
                }}
              >
                <span style={{ fontWeight: 850, fontSize: 11, letterSpacing: 0.5 }}>HOSO REQUIREMENT SUMMARY</span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{hosoExpanded ? '▲' : '▼'}</span>
              </div>
              {hosoExpanded && (
                <div style={{ padding: 6 }}>
                  <table className="bknr-table" style={{ width: '100%', fontSize: '10.5px' }}>
                    <thead>
                      <tr>
                        <th>Species | Variety</th>
                        <th>Count</th>
                        <th className="text-right">Total KG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {renderSummaryTable(hosoSummary, 'hoso')}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Main Grouped Table */}
          <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto' }}>
            <table className="bknr-table" style={{ minWidth: 2200, width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ width: 45 }}>Sl</th>
                  <th style={{ width: 130 }}>Company</th>
                  <th style={{ width: 110 }}>PO Number</th>
                  <th style={{ width: 160 }}>Buyer</th>
                  <th style={{ width: 100 }}>Ship Date</th>
                  <th style={{ width: 120 }}>Packing Style</th>
                  <th style={{ width: 100 }}>Brand</th>
                  <th style={{ width: 90 }}>Sps</th>
                  <th>Var</th>
                  <th style={{ width: 65 }}>CG %</th>
                  <th style={{ width: 65 }}>WG %</th>
                  <th style={{ width: 70 }}>Grd</th>
                  <th style={{ width: 85 }}>NW Grd</th>
                  <th style={{ width: 75 }}>Pcs</th>
                  <th style={{ width: 75 }}>Ord MC</th>
                  <th style={{ width: 110 }}>Price ($)</th>
                  <th style={{ width: 110 }}>Exch Rate</th>
                  <th style={{ width: 75 }}>Stk MC</th>
                  <th style={{ width: 75 }}>Pnd MC</th>
                  <th style={{ width: 85 }}>Net Cnt</th>
                  <th style={{ width: 85 }}>HL Cnt</th>
                  <th style={{ width: 85 }}>HO Cnt</th>
                  <th style={{ width: 100 }} className="text-right">Ord Qty</th>
                  <th style={{ width: 100 }} className="text-right">Avl Stk</th>
                  <th style={{ width: 100 }} className="text-right">Pnd Prd</th>
                  <th style={{ width: 95 }} className="text-center">Ref Stk</th>
                  <th style={{ width: 95 }} className="text-center">Stk Util</th>
                  <th style={{ width: 100 }} className="text-right">Req HL</th>
                  <th style={{ width: 100 }} className="text-right">Req HO</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <EmptyRow cols={29} />
                ) : (
                  renderTableRows()
                )}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 800, background: 'var(--header-bg)', color: 'var(--text)', borderTop: '2px solid var(--accent)' }}>
                  <td colSpan={14} style={{ textAlign: 'right', color: 'var(--text)' }}>GRAND TOTAL:</td>
                  <td className="text-center" style={{ color: 'var(--text)' }}>{grandTotal.mc}</td>
                  <td colSpan={2}></td>
                  <td className="text-center" style={{ color: 'var(--text)' }}>{grandTotal.stockMc}</td>
                  <td className="text-center" style={{ color: 'var(--text)' }}>{grandTotal.pendMc}</td>
                  <td colSpan={3}></td>
                  <td className="text-right" style={{ color: 'var(--text)' }}>{fmt.number(grandTotal.ordQty)}</td>
                  <td className="text-right" style={{ color: 'var(--text)' }}>{fmt.number(grandTotal.avail)}</td>
                  <td className="text-right" style={{ color: 'var(--text)' }}>{fmt.number(grandTotal.pendPrd)}</td>
                  <td colSpan={2}></td>
                  <td className="text-right" style={{ color: 'var(--text)' }}>{fmt.number(grandTotal.reqHl)}</td>
                  <td className="text-right" style={{ color: 'var(--text)' }}>{fmt.number(grandTotal.reqHo)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
