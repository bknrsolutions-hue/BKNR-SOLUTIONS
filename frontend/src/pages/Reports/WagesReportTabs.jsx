/**
 * WagesReportTabs.jsx
 * ─────────────────────────────────────────────────────────
 * Custom Analysis Tabs & Matrix Views for De-Heading & Peeling Reports:
 * 1. Contractor Analysis Matrix (Day-wise Grid, Adjustments & Subtotals)
 * 2. Daily Basis Worker Matrix (Full Month Day Grid, Subtotals & Co-worker Modal)
 * 3. KG Basis Worker Matrix (Full Month Day Grid, Adjustments & Net Payable Subtotals)
 * ─────────────────────────────────────────────────────────
 */
import React, { useState } from 'react';
import { fmt } from './ReportShell';
import { X, Users, Table, Calculator, Lock, CheckCircle2 } from 'lucide-react';

/* ── Helper: Check 1st to 10th of Month Active Window ───── */
export function checkAdjustmentActiveWindow() {
  const now = new Date();
  const day = now.getDate();
  return {
    isAdjustmentActive: day >= 1 && day <= 10,
    currentDay: day
  };
}

/* ── Modal Overlay Styles ────────────────────────────────── */
const overlayStyle = {
  position: 'fixed', inset: 0,
  background: 'rgba(2, 6, 23, 0.75)', backdropFilter: 'blur(6px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 10000, padding: '20px'
};

const modalBoxStyle = {
  background: 'var(--surface-panel)', border: '1px solid var(--border-light)',
  borderRadius: '12px', width: 'min(920px, 95vw)', maxHeight: '85vh',
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)'
};

const modalHeaderStyle = {
  padding: '14px 20px', background: 'var(--corp-dash, #2563eb)', color: '#fff',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  fontWeight: 800, fontSize: '14px'
};

/* ── Helper: Month Date Generator (Defaults to Running Month) ── */
export function getMonthDateList(monthFilter) {
  let targetMonth = monthFilter;
  if (!targetMonth || !targetMonth.match(/^\d{4}-\d{2}$/)) {
    const now = new Date();
    targetMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  const [y, m] = targetMonth.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const dateList = [];
  for (let d = 1; d <= daysInMonth; d++) {
    dateList.push(`${targetMonth}-${String(d).padStart(2, '0')}`);
  }
  return { targetMonth, dateList };
}

/* ── Helper: Extract Worker Rows ─────────────────────────── */
export function extractWorkerRows(rows, targetType) {
  const result = [];
  (rows || []).forEach(r => {
    const wType = String(r.worker_type || r.contractor || r.contractor_name || '').toUpperCase();
    
    // Filter matching targetType (DAILY BASIS vs KG BASIS)
    if (targetType === 'DAILY BASIS' && !wType.includes('DAILY')) return;
    if (targetType === 'KG BASIS' && !wType.includes('KG')) return;

    let workerList = [];
    if (r.worker_ids) {
      workerList = String(r.worker_ids).split(',').map(s => s.trim()).filter(Boolean);
    }
    
    // Fallback if no worker IDs listed
    if (workerList.length === 0) {
      const numWorkers = Number(r.no_of_workers || 1) || 1;
      for (let i = 1; i <= numWorkers; i++) {
        workerList.push(`Worker-${i} (T-${r.table_no || '?'})`);
      }
    }

    const totalWorkersOnTable = workerList.length || Number(r.no_of_workers || 1) || 1;
    const tableQty = Number(r.hlso_qty || r.peeled_qty || r.hoso_qty || r.quantity || 0);
    const tableRate = Number(r.rate_per_kg || r.rate || 0);
    const tableAmt = tableQty * tableRate;

    const qtyPerWorker = tableQty / totalWorkersOnTable;
    const amtPerWorker = tableAmt / totalWorkersOnTable;

    workerList.forEach(wId => {
      result.push({
        workerId: wId,
        date: r.date || '—',
        time: r.time || '',
        tableNo: r.table_no || '—',
        batchNumber: r.batch_number || '—',
        species: r.species || r.variety_name || '—',
        location: r.peeling_at || r.deheading_at || r.production_at || '—',
        totalWorkersOnTable,
        tableQty,
        tableAmt,
        tableRate,
        qtyPerWorker,
        amtPerWorker,
        rawRow: r,
        coWorkers: workerList.filter(id => id !== wId)
      });
    });
  });
  return result;
}

/* ── 1. CONTRACTOR ANALYSIS MATRIX VIEW ──────────────────── */
export function ContractorAnalysisView({ rows, monthFilter }) {
  const [modalCellData, setModalCellData] = useState(null);
  const [adjustments, setAdjustments] = useState({});

  const { isAdjustmentActive, currentDay } = checkAdjustmentActiveWindow();
  const { targetMonth, dateList } = getMonthDateList(monthFilter);

  const handleAdjustmentChange = (key, field, val) => {
    setAdjustments(prev => ({
      ...prev,
      [key]: {
        amount: prev[key]?.amount || 0,
        reason: prev[key]?.reason || '',
        [field]: field === 'amount' ? Number(val) || 0 : val
      }
    }));
  };

  // Group by Contractor Name + Variety/Species Name and Date
  const map = {};
  (rows || []).forEach(r => {
    const cName = r.contractor || r.contractor_name || r.worker_type || 'Direct';
    const varName = r.variety_name || r.species || 'General';
    const key = `${cName}___${varName}`;

    if (!map[key]) {
      map[key] = {
        contractorName: cName,
        varietyName: varName,
        totalQty: 0,
        totalAmt: 0,
        dateMap: {}
      };
    }

    const qty = Number(r.hlso_qty || r.peeled_qty || r.hoso_qty || 0);
    const rate = Number(r.rate_per_kg || r.rate || 0);
    const amt = qty * rate;
    const dateStr = r.date || '—';

    map[key].totalQty += qty;
    map[key].totalAmt += amt;

    if (!map[key].dateMap[dateStr]) {
      map[key].dateMap[dateStr] = { records: [], totalQty: 0, totalAmt: 0 };
    }
    map[key].dateMap[dateStr].records.push(r);
    map[key].dateMap[dateStr].totalQty += qty;
    map[key].dateMap[dateStr].totalAmt += amt;
  });

  const groupedList = Object.values(map).sort((a, b) => a.contractorName.localeCompare(b.contractorName));

  // Compute Subtotals & Day Totals
  const dayTotals = {};
  let grandQty = 0;
  let grandGrossAmt = 0;
  let grandAdjAmt = 0;
  let grandNetAmt = 0;
  dateList.forEach(d => { dayTotals[d] = { qty: 0, amt: 0 }; });

  groupedList.forEach(g => {
    const key = `${g.contractorName}___${g.varietyName}`;
    const adjObj = adjustments[key] || { amount: 0, reason: '' };
    g.adjAmount = adjObj.amount || 0;
    g.adjReason = adjObj.reason || '';
    g.netAmt = g.totalAmt + g.adjAmount;

    grandQty += g.totalQty;
    grandGrossAmt += g.totalAmt;
    grandAdjAmt += g.adjAmount;
    grandNetAmt += g.netAmt;

    dateList.forEach(d => {
      if (g.dateMap[d]) {
        dayTotals[d].qty += g.dateMap[d].totalQty;
        dayTotals[d].amt += g.dateMap[d].totalAmt;
      }
    });
  });

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--corp-dash)' }}>
          Contractor Analysis for Month: <strong>{targetMonth}</strong> (Day-wise Matrix)
        </div>
        
        {/* Adjustment Window Status Badge */}
        <div style={{
          fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 20,
          background: isAdjustmentActive ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
          color: isAdjustmentActive ? '#10b981' : '#ef4444',
          border: isAdjustmentActive ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(239,68,68,0.3)',
          display: 'flex', alignItems: 'center', gap: 5
        }}>
          {isAdjustmentActive ? <CheckCircle2 size={12} /> : <Lock size={12} />}
          <span>
            {isAdjustmentActive 
              ? `Adjustments Active (1st–10th Window Open: Day ${currentDay})`
              : `Adjustments Locked (Active on 1st–10th only: Today is Day ${currentDay})`}
          </span>
        </div>
      </div>

      <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: 8 }}>
        <table className="bknr-table" style={{ borderCollapse: 'collapse', borderSpacing: 0, tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
          <colgroup>
            <col style={{ width: 35 }} />
            <col style={{ width: 120 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 85 }} />
            <col style={{ width: 85 }} />
            <col style={{ width: 90 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 95 }} />
            {dateList.map(d => <col key={d} style={{ width: 55 }} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ width: 35, position: 'sticky', left: 0, background: 'var(--surface-panel)', zIndex: 4, borderBottom: '2px solid var(--border-light)' }}>#</th>
              <th style={{ width: 120, position: 'sticky', left: 35, background: 'var(--surface-panel)', zIndex: 4, borderBottom: '2px solid var(--border-light)' }}>Contractor Name</th>
              <th style={{ width: 100, position: 'sticky', left: 155, background: 'var(--surface-panel)', zIndex: 4, borderBottom: '2px solid var(--border-light)' }}>Variety</th>
              <th className="text-right" style={{ width: 85, position: 'sticky', left: 255, background: 'var(--surface-panel)', zIndex: 4, borderBottom: '2px solid var(--border-light)' }}>Qty (KG)</th>
              <th className="text-right" style={{ width: 85, position: 'sticky', left: 340, background: 'var(--surface-panel)', zIndex: 4, borderBottom: '2px solid var(--border-light)' }}>Gross (₹)</th>
              <th className="text-center" style={{ width: 90, position: 'sticky', left: 425, background: 'var(--surface-panel)', zIndex: 4, borderBottom: '2px solid var(--border-light)' }}>Adj (₹)</th>
              <th style={{ width: 110, position: 'sticky', left: 515, background: 'var(--surface-panel)', zIndex: 4, borderBottom: '2px solid var(--border-light)' }}>Reason</th>
              <th className="text-right" style={{ width: 95, position: 'sticky', left: 625, background: 'var(--surface-panel)', zIndex: 4, borderRight: '2px solid var(--border-light)', borderBottom: '2px solid var(--border-light)' }}>Net Pay (₹)</th>
              {dateList.map(d => (
                <th key={d} className="text-center" style={{ width: 55, padding: '6px 2px', background: 'var(--surface-panel)', borderBottom: '2px solid var(--border-light)' }}>
                  <div style={{ background: 'rgba(255,255,255,0.04)', padding: '2px 0', borderRadius: 4, border: '1px solid var(--border-light)', fontSize: 10, fontWeight: 800, color: 'var(--text-secondary)' }}>
                    {d.split('-')[2]}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groupedList.length === 0 ? (
              <tr><td colSpan={dateList.length + 8} className="text-center" style={{ padding: 24, color: 'var(--text-secondary)' }}>No contractor entries found in month {targetMonth}.</td></tr>
            ) : (
              groupedList.map((g, idx) => {
                const key = `${g.contractorName}___${g.varietyName}`;
                return (
                  <tr key={idx}>
                    <td style={{ position: 'sticky', left: 0, background: 'var(--surface-panel)', zIndex: 2 }}>{idx + 1}</td>
                    <td style={{ position: 'sticky', left: 35, background: 'var(--surface-panel)', zIndex: 2, fontWeight: 700, color: 'var(--corp-dash)' }}>{g.contractorName}</td>
                    <td style={{ position: 'sticky', left: 155, background: 'var(--surface-panel)', zIndex: 2 }}>{g.varietyName}</td>
                    <td className="text-right" style={{ position: 'sticky', left: 255, background: 'var(--surface-panel)', zIndex: 2, fontWeight: 700 }}>{fmt.number(g.totalQty)}</td>
                    <td className="text-right" style={{ position: 'sticky', left: 340, background: 'var(--surface-panel)', zIndex: 2, fontWeight: 800, color: 'var(--corp-fin)' }}>{fmt.currency(g.totalAmt)}</td>
                    <td style={{ position: 'sticky', left: 425, background: 'var(--surface-panel)', zIndex: 2, padding: '2px 4px' }}>
                      <input
                        type="number"
                        disabled={!isAdjustmentActive}
                        placeholder="0"
                        value={g.adjAmount || ''}
                        onChange={e => handleAdjustmentChange(key, 'amount', e.target.value)}
                        style={{
                          width: '100%', padding: '3px 4px', fontSize: 11, fontWeight: 800, textAlign: 'right', borderRadius: 4,
                          border: isAdjustmentActive ? '1px solid var(--corp-dash)' : '1px solid var(--border-light)',
                          background: isAdjustmentActive ? 'var(--bg-app)' : 'rgba(255,255,255,0.03)',
                          color: isAdjustmentActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                          cursor: isAdjustmentActive ? 'text' : 'not-allowed'
                        }}
                      />
                    </td>
                    <td style={{ position: 'sticky', left: 515, background: 'var(--surface-panel)', zIndex: 2, padding: '2px 4px' }}>
                      <input
                        type="text"
                        disabled={!isAdjustmentActive}
                        placeholder={isAdjustmentActive ? "Reason..." : "Locked"}
                        value={g.adjReason || ''}
                        onChange={e => handleAdjustmentChange(key, 'reason', e.target.value)}
                        style={{
                          width: '100%', padding: '3px 4px', fontSize: 10, borderRadius: 4,
                          border: '1px solid var(--border-light)',
                          background: isAdjustmentActive ? 'var(--bg-app)' : 'rgba(255,255,255,0.03)',
                          color: isAdjustmentActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                          cursor: isAdjustmentActive ? 'text' : 'not-allowed'
                        }}
                      />
                    </td>
                    <td className="text-right" style={{ position: 'sticky', left: 625, background: 'var(--surface-panel)', zIndex: 2, fontWeight: 800, color: '#10b981', borderRight: '2px solid var(--border-light)' }}>
                      {fmt.currency(g.netAmt)}
                    </td>
                    {dateList.map(d => {
                      const dayData = g.dateMap[d];
                      const hasEntries = dayData && dayData.records.length > 0;
                      return (
                        <td key={d} className="text-center" style={{ padding: '4px', cursor: hasEntries ? 'pointer' : 'default' }}
                          onClick={() => {
                            if (hasEntries) {
                              setModalCellData({
                                contractorName: g.contractorName,
                                varietyName: g.varietyName,
                                date: d,
                                dayData
                              });
                            }
                          }}>
                          {hasEntries ? (
                            <div style={{ background: 'rgba(37, 99, 235, 0.08)', border: '1px solid rgba(37, 99, 235, 0.2)', borderRadius: 6, padding: '3px 4px' }}>
                              <div style={{ fontWeight: 800, color: 'var(--corp-dash)', fontSize: 10 }}>{dayData.totalQty.toFixed(1)} <span style={{ fontSize: 8 }}>kg</span></div>
                              <div style={{ color: '#10b981', fontWeight: 800, fontSize: 9 }}>₹{dayData.totalAmt.toFixed(0)}</div>
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text-tertiary)', opacity: 0.25 }}>-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 800, background: 'var(--surface-panel)' }}>
              <td colSpan={3} style={{ position: 'sticky', left: 0, background: 'var(--surface-panel)', zIndex: 3, textAlign: 'right', borderTop: '2px solid var(--corp-dash)', fontSize: 11 }}>SUB TOTALS / GRAND TOTAL:</td>
              <td className="text-right" style={{ position: 'sticky', left: 255, background: 'var(--surface-panel)', zIndex: 3, fontWeight: 800, color: 'var(--corp-dash)', borderTop: '2px solid var(--corp-dash)', fontSize: 11 }}>{fmt.number(grandQty)}</td>
              <td className="text-right" style={{ position: 'sticky', left: 340, background: 'var(--surface-panel)', zIndex: 3, fontWeight: 800, color: 'var(--corp-fin)', borderTop: '2px solid var(--corp-dash)', fontSize: 11 }}>{fmt.currency(grandGrossAmt)}</td>
              <td className="text-right" style={{ position: 'sticky', left: 425, background: 'var(--surface-panel)', zIndex: 3, fontWeight: 800, color: grandAdjAmt >= 0 ? '#10b981' : '#ef4444', borderTop: '2px solid var(--corp-dash)', fontSize: 11 }}>{fmt.currency(grandAdjAmt)}</td>
              <td style={{ position: 'sticky', left: 515, background: 'var(--surface-panel)', zIndex: 3, borderTop: '2px solid var(--corp-dash)' }}></td>
              <td className="text-right" style={{ position: 'sticky', left: 625, background: 'var(--surface-panel)', zIndex: 3, fontWeight: 800, color: '#10b981', borderRight: '2px solid var(--border-light)', borderTop: '2px solid var(--corp-dash)', fontSize: 11 }}>{fmt.currency(grandNetAmt)}</td>
              {dateList.map(d => (
                <td key={d} className="text-center" style={{ fontSize: 9, padding: '6px 4px', background: 'var(--surface-panel)', borderTop: '2px solid var(--corp-dash)' }}>
                  {dayTotals[d].qty > 0 ? (
                    <div>
                      <div style={{ fontWeight: 800, color: 'var(--corp-dash)' }}>{dayTotals[d].qty.toFixed(1)}kg</div>
                      <div style={{ color: '#10b981', fontWeight: 800 }}>₹{dayTotals[d].amt.toFixed(0)}</div>
                    </div>
                  ) : '—'}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Drill-down Modal Pop-up */}
      {modalCellData && (
        <div style={overlayStyle} onClick={() => setModalCellData(null)}>
          <div style={modalBoxStyle} onClick={e => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Users size={16} />
                <span>Contractor Details: {modalCellData.contractorName} ({modalCellData.varietyName}) — {modalCellData.date}</span>
              </div>
              <button onClick={() => setModalCellData(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            
            <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 14, background: 'var(--surface-panel)', padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border-light)' }}>
                <div><strong>Records:</strong> {modalCellData.dayData.records.length}</div>
                <div><strong>Daily Total Qty:</strong> {fmt.number(modalCellData.dayData.totalQty)} KG</div>
                <div><strong>Daily Total Amount:</strong> {fmt.currency(modalCellData.dayData.totalAmt)}</div>
              </div>

              <table className="bknr-table" style={{ width: '100%', fontSize: 11 }}>
                <thead>
                  <tr>
                    <th>#</th><th>Time</th><th>Batch No</th><th>Table No</th><th>Workers / IDs</th>
                    <th className="text-right">Qty (KG)</th><th className="text-right">Rate</th><th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {modalCellData.dayData.records.map((r, i) => {
                    const qty = Number(r.hlso_qty || r.peeled_qty || r.hoso_qty || 0);
                    const rate = Number(r.rate_per_kg || r.rate || 0);
                    const amt = qty * rate;
                    return (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>{r.time || '—'}</td>
                        <td style={{ fontWeight: 700 }}>{r.batch_number}</td>
                        <td>T-{r.table_no}</td>
                        <td>{r.no_of_workers} Workers {r.worker_ids ? `(${r.worker_ids})` : ''}</td>
                        <td className="text-right" style={{ fontWeight: 700 }}>{fmt.number(qty)}</td>
                        <td className="text-right">₹{rate.toFixed(2)}</td>
                        <td className="text-right" style={{ fontWeight: 800 }}>{fmt.currency(amt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 2. DAILY BASIS MATRIX VIEW ──────────────────────────── */
export function DailyBasisMatrixView({ rows, monthFilter }) {
  const [activeCellData, setActiveCellData] = useState(null);

  const extracted = extractWorkerRows(rows, 'DAILY BASIS');
  const { targetMonth, dateList } = getMonthDateList(monthFilter);

  // Group by Worker
  const workerMap = {};
  extracted.forEach(item => {
    if (!workerMap[item.workerId]) {
      workerMap[item.workerId] = { workerId: item.workerId, dateMap: {} };
    }
    if (!workerMap[item.workerId].dateMap[item.date]) {
      workerMap[item.workerId].dateMap[item.date] = [];
    }
    workerMap[item.workerId].dateMap[item.date].push(item);
  });

  const workerList = Object.values(workerMap).sort((a, b) => a.workerId.localeCompare(b.workerId));

  // Compute Subtotals
  const dayPresentCounts = {};
  let grandPresentCount = 0;
  dateList.forEach(d => { dayPresentCounts[d] = 0; });

  workerList.forEach(w => {
    let workerDays = 0;
    dateList.forEach(d => {
      const count = (w.dateMap[d] || []).length;
      if (count > 0) {
        dayPresentCounts[d] += 1;
        workerDays += count;
      }
    });
    w.totalWorkerDays = workerDays;
    grandPresentCount += workerDays;
  });

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--corp-dash)' }}>
          Daily Basis Attendance Matrix for Month: <strong>{targetMonth}</strong> (All Days 1 to {dateList.length})
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Click any green badge to view assigned tables & co-workers</span>
      </div>
      <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: 8 }}>
        <table className="bknr-table" style={{ borderCollapse: 'collapse', borderSpacing: 0, tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
          <colgroup>
            <col style={{ width: 35 }} />
            <col style={{ width: 140 }} />
            <col style={{ width: 90 }} />
            {dateList.map(d => <col key={d} style={{ width: 45 }} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ width: 35, position: 'sticky', left: 0, background: 'var(--surface-panel)', zIndex: 4, borderBottom: '2px solid var(--border-light)' }}>#</th>
              <th style={{ width: 140, position: 'sticky', left: 35, background: 'var(--surface-panel)', zIndex: 4, borderBottom: '2px solid var(--border-light)' }}>Worker ID / Name</th>
              <th className="text-center" style={{ width: 90, position: 'sticky', left: 175, background: 'var(--surface-panel)', zIndex: 4, borderRight: '2px solid var(--border-light)', borderBottom: '2px solid var(--border-light)' }}>Total Days</th>
              {dateList.map(d => (
                <th key={d} className="text-center" style={{ width: 45, padding: '6px 2px', background: 'var(--surface-panel)', borderBottom: '2px solid var(--border-light)' }}>
                  <div style={{ background: 'rgba(255,255,255,0.04)', padding: '2px 0', borderRadius: 4, border: '1px solid var(--border-light)', fontSize: 10, fontWeight: 800, color: 'var(--text-secondary)' }}>
                    {d.split('-')[2]}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workerList.length === 0 ? (
              <tr><td colSpan={dateList.length + 3} className="text-center" style={{ padding: 24, color: 'var(--text-secondary)' }}>No Daily Basis worker entries found in month {targetMonth}.</td></tr>
            ) : (
              workerList.map((w, idx) => (
                <tr key={w.workerId}>
                  <td style={{ position: 'sticky', left: 0, background: 'var(--surface-panel)', zIndex: 2 }}>{idx + 1}</td>
                  <td style={{ position: 'sticky', left: 35, background: 'var(--surface-panel)', zIndex: 2, fontWeight: 700, color: 'var(--corp-ops)' }}>
                    {w.workerId}
                  </td>
                  <td className="text-center" style={{ position: 'sticky', left: 175, background: 'var(--surface-panel)', zIndex: 2, fontWeight: 800, color: '#10b981', borderRight: '2px solid var(--border-light)' }}>
                    {w.totalWorkerDays} Days
                  </td>
                  {dateList.map(d => {
                    const cellEntries = w.dateMap[d] || [];
                    const count = cellEntries.length;
                    return (
                      <td key={d} className="text-center" style={{ padding: '4px', cursor: count > 0 ? 'pointer' : 'default' }}
                        onClick={() => {
                          if (count > 0) setActiveCellData({ workerId: w.workerId, date: d, entries: cellEntries });
                        }}>
                        {count > 0 ? (
                          <span style={{
                            background: 'rgba(16, 185, 129, 0.12)',
                            color: '#10b981',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            padding: '2px 6px',
                            borderRadius: 10,
                            fontWeight: 800,
                            fontSize: 10,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 3
                          }}>
                            P <span style={{ opacity: 0.8, fontSize: 9 }}>({count})</span>
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)', opacity: 0.25 }}>-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 800, background: 'var(--surface-panel)' }}>
              <td colSpan={2} style={{ position: 'sticky', left: 0, background: 'var(--surface-panel)', zIndex: 3, textAlign: 'right', borderTop: '2px solid #10b981', fontSize: 11 }}>TOTAL WORKERS PRESENT:</td>
              <td className="text-center" style={{ position: 'sticky', left: 175, background: 'var(--surface-panel)', zIndex: 3, color: '#10b981', fontWeight: 800, borderRight: '2px solid var(--border-light)', borderTop: '2px solid #10b981', fontSize: 11 }}>{grandPresentCount}</td>
              {dateList.map(d => (
                <td key={d} className="text-center" style={{ fontSize: 10, fontWeight: 800, color: '#10b981', background: 'var(--surface-panel)', borderTop: '2px solid #10b981', padding: '6px 4px' }}>
                  {dayPresentCounts[d] > 0 ? dayPresentCounts[d] : '—'}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Daily Basis Details Modal Pop-up */}
      {activeCellData && (
        <div style={overlayStyle} onClick={() => setActiveCellData(null)}>
          <div style={modalBoxStyle} onClick={e => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Table size={16} />
                <span>Daily Basis Shift Details: {activeCellData.workerId} on {activeCellData.date}</span>
              </div>
              <button onClick={() => setActiveCellData(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            
            <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
              <h4 style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--corp-ops)' }}>Tables & Co-Workers Assigned</h4>
              {activeCellData.entries.map((entry, i) => (
                <div key={i} style={{ marginBottom: 12, padding: 12, borderRadius: 8, background: 'var(--surface-panel)', border: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontWeight: 700 }}>
                    <span>Table No: T-{entry.tableNo} (Batch #{entry.batchNumber})</span>
                    <span style={{ color: 'var(--corp-ops)' }}>Location: {entry.location}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    <strong>Species/Variety:</strong> {entry.species} | <strong>Total Workers on Table:</strong> {entry.totalWorkersOnTable}
                  </div>
                  <div style={{ fontSize: 11, background: 'rgba(255,255,255,0.03)', padding: 8, borderRadius: 4 }}>
                    <strong>Co-Workers on Same Table:</strong> {entry.coWorkers.length > 0 ? entry.coWorkers.join(', ') : 'None (Solo Table)'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── 3. KG BASIS MATRIX VIEW ─────────────────────────────── */
export function KgBasisMatrixView({ rows, monthFilter }) {
  const [activeCellData, setActiveCellData] = useState(null);
  const [adjustments, setAdjustments] = useState({});

  const { isAdjustmentActive, currentDay } = checkAdjustmentActiveWindow();
  const extracted = extractWorkerRows(rows, 'KG BASIS');
  const { targetMonth, dateList } = getMonthDateList(monthFilter);

  const handleAdjustmentChange = (key, field, val) => {
    setAdjustments(prev => ({
      ...prev,
      [key]: {
        amount: prev[key]?.amount || 0,
        reason: prev[key]?.reason || '',
        [field]: field === 'amount' ? Number(val) || 0 : val
      }
    }));
  };

  // Group by Worker
  const workerMap = {};
  extracted.forEach(item => {
    if (!workerMap[item.workerId]) {
      workerMap[item.workerId] = { workerId: item.workerId, dateMap: {} };
    }
    if (!workerMap[item.workerId].dateMap[item.date]) {
      workerMap[item.workerId].dateMap[item.date] = { entries: [], totalQty: 0, totalAmt: 0 };
    }
    workerMap[item.workerId].dateMap[item.date].entries.push(item);
    workerMap[item.workerId].dateMap[item.date].totalQty += item.qtyPerWorker;
    workerMap[item.workerId].dateMap[item.date].totalAmt += item.amtPerWorker;
  });

  const workerList = Object.values(workerMap).sort((a, b) => a.workerId.localeCompare(b.workerId));

  // Compute Worker Subtotals and Day Totals
  const dayKgTotals = {};
  let grandKgQty = 0;
  let grandGrossAmt = 0;
  let grandAdjAmt = 0;
  let grandNetAmt = 0;
  dateList.forEach(d => { dayKgTotals[d] = { qty: 0, amt: 0 }; });

  workerList.forEach(w => {
    let workerQty = 0;
    let workerGrossAmt = 0;
    dateList.forEach(d => {
      const dayData = w.dateMap[d];
      if (dayData) {
        workerQty += dayData.totalQty;
        workerGrossAmt += dayData.totalAmt;
        dayKgTotals[d].qty += dayData.totalQty;
        dayKgTotals[d].amt += dayData.totalAmt;
      }
    });

    const adjObj = adjustments[w.workerId] || { amount: 0, reason: '' };
    w.totalWorkerQty = workerQty;
    w.totalGrossAmt = workerGrossAmt;
    w.adjAmount = adjObj.amount || 0;
    w.adjReason = adjObj.reason || '';
    w.netPayable = workerGrossAmt + w.adjAmount;

    grandKgQty += workerQty;
    grandGrossAmt += workerGrossAmt;
    grandAdjAmt += w.adjAmount;
    grandNetAmt += w.netPayable;
  });

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--corp-dash)' }}>
          KG Basis Earnings Matrix for Month: <strong>{targetMonth}</strong> (All Days 1 to {dateList.length})
        </div>

        {/* Adjustment Window Status Badge */}
        <div style={{
          fontSize: 10, fontWeight: 800, padding: '4px 10px', borderRadius: 20,
          background: isAdjustmentActive ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
          color: isAdjustmentActive ? '#10b981' : '#ef4444',
          border: isAdjustmentActive ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(239,68,68,0.3)',
          display: 'flex', alignItems: 'center', gap: 5
        }}>
          {isAdjustmentActive ? <CheckCircle2 size={12} /> : <Lock size={12} />}
          <span>
            {isAdjustmentActive 
              ? `Adjustments Active (1st–10th Window Open: Day ${currentDay})`
              : `Adjustments Locked (Active on 1st–10th only: Today is Day ${currentDay})`}
          </span>
        </div>
      </div>

      <div className="table-responsive" style={{ maxHeight: '600px', overflowY: 'auto', border: '1px solid var(--border-light)', borderRadius: 8 }}>
        <table className="bknr-table" style={{ borderCollapse: 'collapse', borderSpacing: 0, tableLayout: 'fixed', width: 'max-content', minWidth: '100%' }}>
          <colgroup>
            <col style={{ width: 35 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 85 }} />
            <col style={{ width: 85 }} />
            <col style={{ width: 85 }} />
            <col style={{ width: 110 }} />
            <col style={{ width: 90 }} />
            {dateList.map(d => <col key={d} style={{ width: 55 }} />)}
          </colgroup>
          <thead>
            <tr>
              <th style={{ width: 35, position: 'sticky', left: 0, background: 'var(--surface-panel)', zIndex: 4, borderBottom: '2px solid var(--border-light)' }}>#</th>
              <th style={{ width: 130, position: 'sticky', left: 35, background: 'var(--surface-panel)', zIndex: 4, borderBottom: '2px solid var(--border-light)' }}>Worker ID / Name</th>
              <th className="text-right" style={{ width: 85, position: 'sticky', left: 165, background: 'var(--surface-panel)', zIndex: 4, borderBottom: '2px solid var(--border-light)' }}>Qty (KG)</th>
              <th className="text-right" style={{ width: 85, position: 'sticky', left: 250, background: 'var(--surface-panel)', zIndex: 4, borderBottom: '2px solid var(--border-light)' }}>Gross (₹)</th>
              <th className="text-center" style={{ width: 85, position: 'sticky', left: 335, background: 'var(--surface-panel)', zIndex: 4, borderBottom: '2px solid var(--border-light)' }}>Adj (₹)</th>
              <th style={{ width: 110, position: 'sticky', left: 420, background: 'var(--surface-panel)', zIndex: 4, borderBottom: '2px solid var(--border-light)' }}>Reason</th>
              <th className="text-right" style={{ width: 90, position: 'sticky', left: 530, background: 'var(--surface-panel)', zIndex: 4, borderRight: '2px solid var(--border-light)', borderBottom: '2px solid var(--border-light)' }}>Net Pay (₹)</th>
              {dateList.map(d => (
                <th key={d} className="text-center" style={{ width: 55, padding: '6px 2px', background: 'var(--surface-panel)', borderBottom: '2px solid var(--border-light)' }}>
                  <div style={{ background: 'rgba(255,255,255,0.04)', padding: '2px 0', borderRadius: 4, border: '1px solid var(--border-light)', fontSize: 10, fontWeight: 800, color: 'var(--text-secondary)' }}>
                    {d.split('-')[2]}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workerList.length === 0 ? (
              <tr><td colSpan={dateList.length + 7} className="text-center" style={{ padding: 24, color: 'var(--text-secondary)' }}>No KG Basis worker entries found in month {targetMonth}.</td></tr>
            ) : (
              workerList.map((w, idx) => (
                <tr key={w.workerId}>
                  <td style={{ position: 'sticky', left: 0, background: 'var(--surface-panel)', zIndex: 2 }}>{idx + 1}</td>
                  <td style={{ position: 'sticky', left: 35, background: 'var(--surface-panel)', zIndex: 2, fontWeight: 700, color: 'var(--corp-dash)' }}>
                    {w.workerId}
                  </td>
                  <td className="text-right" style={{ position: 'sticky', left: 165, background: 'var(--surface-panel)', zIndex: 2, fontWeight: 700, color: 'var(--corp-ops)' }}>
                    {fmt.number(w.totalWorkerQty)}
                  </td>
                  <td className="text-right" style={{ position: 'sticky', left: 250, background: 'var(--surface-panel)', zIndex: 2, fontWeight: 800, color: 'var(--corp-fin)' }}>
                    {fmt.currency(w.totalGrossAmt)}
                  </td>
                  <td style={{ position: 'sticky', left: 335, background: 'var(--surface-panel)', zIndex: 2, padding: '2px 4px' }}>
                    <input
                      type="number"
                      disabled={!isAdjustmentActive}
                      placeholder="0"
                      value={w.adjAmount || ''}
                      onChange={e => handleAdjustmentChange(w.workerId, 'amount', e.target.value)}
                      style={{
                        width: '100%', padding: '3px 4px', fontSize: 11, fontWeight: 800, textAlign: 'right', borderRadius: 4,
                        border: isAdjustmentActive ? '1px solid var(--corp-dash)' : '1px solid var(--border-light)',
                        background: isAdjustmentActive ? 'var(--bg-app)' : 'rgba(255,255,255,0.03)',
                        color: isAdjustmentActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        cursor: isAdjustmentActive ? 'text' : 'not-allowed'
                      }}
                    />
                  </td>
                  <td style={{ position: 'sticky', left: 420, background: 'var(--surface-panel)', zIndex: 2, padding: '2px 4px' }}>
                    <input
                      type="text"
                      disabled={!isAdjustmentActive}
                      placeholder={isAdjustmentActive ? "Reason..." : "Locked"}
                      value={w.adjReason || ''}
                      onChange={e => handleAdjustmentChange(w.workerId, 'reason', e.target.value)}
                      style={{
                        width: '100%', padding: '3px 4px', fontSize: 10, borderRadius: 4,
                        border: '1px solid var(--border-light)',
                        background: isAdjustmentActive ? 'var(--bg-app)' : 'rgba(255,255,255,0.03)',
                        color: isAdjustmentActive ? 'var(--text-primary)' : 'var(--text-tertiary)',
                        cursor: isAdjustmentActive ? 'text' : 'not-allowed'
                      }}
                    />
                  </td>
                  <td className="text-right" style={{ position: 'sticky', left: 530, background: 'var(--surface-panel)', zIndex: 2, fontWeight: 800, color: '#10b981', borderRight: '2px solid var(--border-light)' }}>
                    {fmt.currency(w.netPayable)}
                  </td>
                  {dateList.map(d => {
                    const dayData = w.dateMap[d];
                    const hasEntries = dayData && dayData.entries.length > 0;
                    return (
                      <td key={d} className="text-center" style={{ padding: '4px', cursor: hasEntries ? 'pointer' : 'default' }}
                        onClick={() => {
                          if (hasEntries) setActiveCellData({ workerId: w.workerId, date: d, dayData });
                        }}>
                        {hasEntries ? (
                          <div style={{
                            background: 'rgba(37, 99, 235, 0.08)',
                            border: '1px solid rgba(37, 99, 235, 0.2)',
                            borderRadius: 6,
                            padding: '3px 4px',
                            transition: 'all 0.15s ease'
                          }}>
                            <div style={{ fontWeight: 800, color: 'var(--corp-dash)', fontSize: 10 }}>{dayData.totalQty.toFixed(1)} <span style={{ fontSize: 8, fontWeight: 600 }}>kg</span></div>
                            <div style={{ color: '#10b981', fontWeight: 800, fontSize: 9.5 }}>₹{dayData.totalAmt.toFixed(0)}</div>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)', opacity: 0.25 }}>-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr style={{ fontWeight: 800, background: 'var(--surface-panel)' }}>
              <td colSpan={2} style={{ position: 'sticky', left: 0, background: 'var(--surface-panel)', zIndex: 3, textAlign: 'right', borderTop: '2px solid var(--corp-fin)', fontSize: 11 }}>SUB TOTALS / GRAND TOTAL:</td>
              <td className="text-right" style={{ position: 'sticky', left: 165, background: 'var(--surface-panel)', zIndex: 3, fontWeight: 800, color: 'var(--corp-ops)', borderTop: '2px solid var(--corp-fin)', fontSize: 11 }}>{fmt.number(grandKgQty)}</td>
              <td className="text-right" style={{ position: 'sticky', left: 250, background: 'var(--surface-panel)', zIndex: 3, fontWeight: 800, color: 'var(--corp-fin)', borderTop: '2px solid var(--corp-fin)', fontSize: 11 }}>{fmt.currency(grandGrossAmt)}</td>
              <td className="text-right" style={{ position: 'sticky', left: 335, background: 'var(--surface-panel)', zIndex: 3, fontWeight: 800, color: grandAdjAmt >= 0 ? '#10b981' : '#ef4444', borderTop: '2px solid var(--corp-fin)', fontSize: 11 }}>{fmt.currency(grandAdjAmt)}</td>
              <td style={{ position: 'sticky', left: 420, background: 'var(--surface-panel)', zIndex: 3, borderTop: '2px solid var(--corp-fin)' }}></td>
              <td className="text-right" style={{ position: 'sticky', left: 530, background: 'var(--surface-panel)', zIndex: 3, fontWeight: 800, color: '#10b981', borderRight: '2px solid var(--border-light)', borderTop: '2px solid var(--corp-fin)', fontSize: 11 }}>{fmt.currency(grandNetAmt)}</td>
              {dateList.map(d => (
                <td key={d} className="text-center" style={{ fontSize: 9, padding: '6px 4px', background: 'var(--surface-panel)', borderTop: '2px solid var(--corp-fin)' }}>
                  {dayKgTotals[d].qty > 0 ? (
                    <div>
                      <div style={{ fontWeight: 800, color: 'var(--corp-dash)' }}>{dayKgTotals[d].qty.toFixed(1)}kg</div>
                      <div style={{ color: '#10b981', fontWeight: 800 }}>₹{dayKgTotals[d].amt.toFixed(0)}</div>
                    </div>
                  ) : '—'}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* KG Basis Earnings Division Breakdown Modal */}
      {activeCellData && (
        <div style={overlayStyle} onClick={() => setActiveCellData(null)}>
          <div style={modalBoxStyle} onClick={e => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Calculator size={16} />
                <span>KG Basis Share Calculation: {activeCellData.workerId} ({activeCellData.date})</span>
              </div>
              <button onClick={() => setActiveCellData(null)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            
            <div style={{ padding: 16, overflowY: 'auto', flex: 1 }}>
              <div style={{ display: 'flex', gap: 16, marginBottom: 14, background: 'rgba(139,92,246,0.1)', padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(139,92,246,0.3)' }}>
                <div><strong>Daily Total Quantity Share:</strong> {fmt.number(activeCellData.dayData.totalQty)} KG</div>
                <div><strong>Daily Total Amount Earned:</strong> {fmt.currency(activeCellData.dayData.totalAmt)}</div>
              </div>

              <h4 style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--corp-ops)' }}>Table-wise Share & Amount Division Breakdown</h4>
              <table className="bknr-table" style={{ width: '100%', fontSize: 11 }}>
                <thead>
                  <tr>
                    <th>Table No</th><th>Batch No</th><th>Variety / Species</th>
                    <th className="text-right">Table Total Qty</th><th className="text-right">Table Total Amt</th>
                    <th className="text-center">Workers (N)</th><th className="text-center">Division Formula</th>
                    <th className="text-right">Worker Share Qty</th><th className="text-right">Worker Share Amt</th>
                  </tr>
                </thead>
                <tbody>
                  {activeCellData.dayData.entries.map((entry, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 700 }}>T-{entry.tableNo}</td>
                      <td>{entry.batchNumber}</td>
                      <td>{entry.species}</td>
                      <td className="text-right">{fmt.number(entry.tableQty)} KG</td>
                      <td className="text-right">{fmt.currency(entry.tableAmt)}</td>
                      <td className="text-center" style={{ fontWeight: 800, color: 'var(--corp-dash)' }}>{entry.totalWorkersOnTable}</td>
                      <td className="text-center" style={{ fontSize: 10, color: 'var(--text-secondary)', background: 'rgba(255,255,255,0.02)' }}>
                        ₹{entry.tableAmt.toFixed(2)} ÷ {entry.totalWorkersOnTable} Workers
                      </td>
                      <td className="text-right" style={{ fontWeight: 700, color: 'var(--corp-ops)' }}>{entry.qtyPerWorker.toFixed(2)} KG</td>
                      <td className="text-right" style={{ fontWeight: 800, color: 'var(--corp-fin)' }}>{fmt.currency(entry.amtPerWorker)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── TAB NAV BAR HELPER ──────────────────────────────────── */
export function WagesTabNav({ activeTab, onChangeTab }) {
  const tabs = [
    { id: 'ledger', label: 'Detailed Ledger' },
    { id: 'contractor', label: 'Contractor Analysis' },
    { id: 'daily_basis', label: 'Daily Basis Matrix' },
    { id: 'kg_basis', label: 'KG Basis Matrix' },
  ];

  return (
    <div style={{ display: 'flex', gap: 6, margin: '10px 0 12px', borderBottom: '1px solid var(--border-light)', paddingBottom: 6 }}>
      {tabs.map(t => {
        const isActive = activeTab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChangeTab(t.id)}
            style={{
              padding: '6px 14px', fontSize: 11, fontWeight: 800,
              borderRadius: 6, cursor: 'pointer', border: 'none',
              background: isActive ? 'var(--corp-dash, #2563eb)' : 'var(--surface-panel)',
              color: isActive ? '#fff' : 'var(--text-secondary)',
              transition: 'all 0.15s ease'
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
