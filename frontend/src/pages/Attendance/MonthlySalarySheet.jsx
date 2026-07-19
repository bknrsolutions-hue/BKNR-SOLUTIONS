import React, { useState, useEffect } from 'react';
import { 
  Users, RefreshCw, Printer, FileText, CheckCircle, AlertCircle, X, ChevronRight 
} from 'lucide-react';
import { sessionFetch } from '../../utils/sessionFetch';
import './Attendance.css';
import './PayrollPayslip.css';

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function belowHundred(value) {
  const number = Math.floor(Number(value || 0));
  if (number < 20) return ONES[number];
  return `${TENS[Math.floor(number / 10)]}${number % 10 ? ` ${ONES[number % 10]}` : ''}`;
}

function belowThousand(value) {
  const number = Math.floor(Number(value || 0));
  const hundreds = Math.floor(number / 100);
  const remainder = number % 100;
  return `${hundreds ? `${ONES[hundreds]} Hundred` : ''}${hundreds && remainder ? ' ' : ''}${belowHundred(remainder)}`.trim();
}

function indianAmountInWords(value) {
  const amount = Math.max(0, Number(value || 0));
  let whole = Math.floor(amount);
  const paise = Math.round((amount - whole) * 100);
  if (!whole && !paise) return 'Zero Rupees Only';
  const parts = [];
  const crore = Math.floor(whole / 10000000); whole %= 10000000;
  const lakh = Math.floor(whole / 100000); whole %= 100000;
  const thousand = Math.floor(whole / 1000); whole %= 1000;
  if (crore) parts.push(`${belowThousand(crore)} Crore`);
  if (lakh) parts.push(`${belowHundred(lakh)} Lakh`);
  if (thousand) parts.push(`${belowHundred(thousand)} Thousand`);
  if (whole) parts.push(belowThousand(whole));
  const rupees = `${parts.join(' ') || 'Zero'} Rupees`;
  return `${rupees}${paise ? ` and ${belowHundred(paise)} Paise` : ''} Only`;
}

export default function MonthlySalarySheet({ theme }) {
  const [month, setMonth] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('ALL');
  const [selectedDept, setSelectedDept] = useState('ALL');
  
  const [locations, setLocations] = useState([]);
  const [departments, setDepartments] = useState([]);
  
  const [daysInMonth, setDaysInMonth] = useState(30);
  const [monthName, setMonthName] = useState('');
  const [employees, setEmployees] = useState([]);
  const [selectedRow, setSelectedRow] = useState(null);
  const [reportMeta, setReportMeta] = useState({
    company_name: '',
    company_address: '',
    company_code: '',
    mpeda_registration_code: '',
    adjustment_start: '',
    adjustment_deadline: '',
    adjustment_open: false,
    adjustment_closed: false,
    adjustment_window_status: '',
  });
  
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalSubTitle, setModalSubTitle] = useState('');
  const [attendanceLogs, setAttendanceLogs] = useState([]);

  // Notification
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Format numbers to Indian currency format
  const fmt = (val) => {
    return parseFloat(val || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const loadFilters = async () => {
    try {
      const [locRes, deptRes] = await Promise.all([
        sessionFetch('/api/salary/get-locations'),
        sessionFetch('/api/salary/get-departments')
      ]);
      const locs = await locRes.json();
      const depts = await deptRes.json();
      setLocations(locs || []);
      setDepartments(depts || []);
    } catch (e) {
      console.error('Filter fetch error', e);
    }
  };

  const generateSheet = async (targetMonth = month, targetLoc = selectedLocation, targetDept = selectedDept) => {
    if (!targetMonth) return;
    try {
      const res = await sessionFetch(`/api/salary/get-report?month=${targetMonth}&dept=${targetDept}&location=${targetLoc}`);
      const data = await res.json();
      setDaysInMonth(data.days_in_month || 30);
      setMonthName(data.month_name || '');
      setEmployees(data.employees || []);
      setReportMeta({
        company_name: data.company_name || '',
        company_address: data.company_address || '',
        company_code: data.company_code || '',
        mpeda_registration_code: data.mpeda_registration_code || '',
        adjustment_start: data.adjustment_start || '',
        adjustment_deadline: data.adjustment_deadline || '',
        adjustment_open: Boolean(data.adjustment_open),
        adjustment_closed: Boolean(data.adjustment_closed),
        adjustment_window_status: data.adjustment_window_status || '',
      });
      setSelectedRow(null);
    } catch (e) {
      showNotification('❌ Failed to calculate payroll summary!', 'danger');
    }
  };

  useEffect(() => {
    const now = new Date();
    const currentMonth = now.toISOString().slice(0, 7);
    setMonth(currentMonth);
    loadFilters();
    generateSheet(currentMonth, 'ALL', 'ALL');
  }, []);

  const handleMonthChange = (e) => {
    setMonth(e.target.value);
    generateSheet(e.target.value, selectedLocation, selectedDept);
  };

  const handleLocationChange = (e) => {
    setSelectedLocation(e.target.value);
    generateSheet(month, e.target.value, selectedDept);
  };

  const handleDeptChange = (e) => {
    setSelectedDept(e.target.value);
    generateSheet(month, selectedLocation, e.target.value);
  };

  const printFullLedger = () => {
    document.body.classList.remove('print-single-mode');
    window.print();
  };

  const printSelectedRow = () => {
    if (!selectedRow) return;
    document.body.classList.add('print-single-mode');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('print-single-mode');
    }, 1000);
  };

  const showAttendance = async (empId, empName, day = null) => {
    setModalTitle(empName);
    setModalSubTitle((day ? `Day ${day} Log` : `Full Month Logs`) + ` | Employee ID: ${empId}`);
    
    let url = `/api/salary/get-attendance-logs?emp_id=${empId}&month=${month}`;
    if (day) url += `&day=${day}`;

    try {
      const res = await sessionFetch(url);
      const data = await res.json();
      setAttendanceLogs(data || []);
      setIsModalOpen(true);
    } catch (e) {
      showNotification('❌ Failed to fetch raw gate movements!', 'danger');
    }
  };

  const saveAdjustment = async (empId, val, prevVal, targetInput) => {
    if (reportMeta.adjustment_closed) {
      targetInput.value = Number(prevVal || 0).toFixed(1);
      const message = reportMeta.adjustment_window_status === 'NOT_OPEN'
        ? `Adjustment window opens on ${reportMeta.adjustment_start}.`
        : `Adjustment window closed on ${reportMeta.adjustment_deadline || 'the 10th'}.`;
      showNotification(message, 'danger');
      return;
    }
    const parsedValue = Number.parseFloat(val);
    const previousValue = Number.parseFloat(prevVal || 0);
    if (!Number.isFinite(parsedValue)) {
      targetInput.value = previousValue.toFixed(1);
      showNotification('Enter a valid adjustment value.', 'danger');
      return;
    }
    if (parsedValue === previousValue) return;

    const reason = window.prompt('Adjustment reason (compulsory):', '');
    if (!reason || !reason.trim()) {
      targetInput.value = previousValue.toFixed(1);
      showNotification('Adjustment reason is compulsory.', 'danger');
      return;
    }

    const decision = window.confirm(`Confirm & Lock Adjustment\nSave ${parsedValue} days for this employee?\n\nReason: ${reason.trim()}\n\nThis monthly adjustment cannot be edited again.`);
    if (!decision) {
      targetInput.value = previousValue.toFixed(1);
      return;
    }

    try {
      const res = await sessionFetch('/api/salary/save-adjustment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employee_id: empId,
          month,
          adjustment: parsedValue,
          reason: reason.trim(),
        })
      });
      const out = await res.json();
      if (!res.ok || out.status !== 'success') {
        throw new Error(out.message || 'Adjustment Save Failed!');
      }
      
      showNotification('✅ Monthly adjustment saved and locked.', 'success');
      generateSheet();
    } catch (e) {
      targetInput.value = Number(prevVal).toFixed(1);
      showNotification(e.message || '❌ Adjustment Save Failed!', 'danger');
    }
  };

  // Generate date day columns headers
  const dayHeaders = [];
  for (let i = 1; i <= daysInMonth; i++) {
    dayHeaders.push(<th key={i} style={{ width: '38px', minWidth: '38px' }}>{i}</th>);
  }

  return (
    <div className="attendance-container">
      {notification && (
        <div className={`attendance-toast ${notification.type === 'success' ? 'success' : 'error'}`} style={{ top: '80px' }}>
          {notification.msg}
        </div>
      )}

      {/* HEADER CONTROLS */}
      <div className="attendance-page-header">
        <div>
          <h1>Payroll & Statutory Ledger</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            {monthName ? `${monthName.toUpperCase()} ${month.split('-')[0]} - PAYROLL SUMMARY` : ''}
          </p>
        </div>
        <div className="attendance-page-header-actions">
          {selectedRow && (
            <button className="attendance-btn attendance-btn-secondary" onClick={printSelectedRow}>
              <Printer size={14} /> Print Payslip
            </button>
          )}
          <button className="attendance-btn attendance-btn-secondary" onClick={() => generateSheet()}>
            <RefreshCw size={14} /> Recalculate
          </button>
          <button className="attendance-btn attendance-btn-secondary" onClick={printFullLedger}>
            <FileText size={14} /> Export Ledger
          </button>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="attendance-filters-bar">
        <div className="attendance-filter-group">
          <label htmlFor="payroll-month">Payroll Month</label>
          <input 
            id="payroll-month"
            className="attendance-input" 
            type="month" 
            value={month} 
            onChange={handleMonthChange} 
          />
        </div>
        <div className="attendance-filter-group">
          <label htmlFor="work-loc">Work Location</label>
          <select 
            id="work-loc"
            className="attendance-select" 
            value={selectedLocation} 
            onChange={handleLocationChange}
          >
            <option value="ALL">ALL LOCATIONS</option>
            {locations.map(loc => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
        </div>
        <div className="attendance-filter-group">
          <label htmlFor="payroll-dept">Department</label>
          <select 
            id="payroll-dept"
            className="attendance-select" 
            value={selectedDept} 
            onChange={handleDeptChange}
          >
            <option value="ALL">ALL DEPARTMENTS</option>
            {departments.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>

      {/* CORPORATE LEDGER TABLE */}
      <div className="attendance-table-container">
        <div className="attendance-table-wrapper">
          <table className="attendance-table payroll-sheet-table" style={{ minWidth: `${300 + daysInMonth * 40 + 1700}px` }}>
            <thead>
              <tr>
                <th rowSpan="2" className="sticky-col" style={{ zIndex: 30, background: 'var(--att-table-header-bg)', borderRight: '2px solid var(--att-border)', minWidth: '180px' }}>
                  Employee & ID
                </th>
                <th colSpan={daysInMonth} style={{ borderBottom: '1px solid var(--att-border)' }}>Daily Attendance</th>
                <th colSpan="8" style={{ borderBottom: '1px solid var(--att-border)', background: 'rgba(0,0,0,0.1)' }}>Duty Summary</th>
                <th colSpan="2" style={{ borderBottom: '1px solid var(--att-border)', background: 'rgba(0,0,0,0.1)' }}>Overtime</th>
                <th colSpan="5" style={{ borderBottom: '1px solid var(--att-border)', background: 'rgba(0,0,0,0.1)' }}>Financials (₹)</th>
                <th colSpan="6" style={{ borderBottom: '1px solid var(--att-border)', background: 'rgba(0,0,0,0.1)' }}>Deductions (₹)</th>
                <th rowSpan="2" className="payout-col" style={{ borderBottom: '2px solid var(--att-border)', minWidth: '120px' }}>Net Payout</th>
              </tr>
              <tr>
                {dayHeaders}
                <th>HP</th><th>1P</th><th>1.5P</th><th>2P</th><th>2.5P</th><th>3P</th><th>Duty Credit</th><th>Worked Days</th>
                <th>OT Hrs</th><th>OT Pay</th>
                <th>Gross</th><th>Bonus</th><th>Adj</th><th>Adjustment Reason</th><th>Earned</th>
                <th>Adv.</th><th>PF</th><th>ESI</th><th>PT</th><th>LWF</th><th>TDS</th>
              </tr>
            </thead>
            <tbody>
              {employees.map(emp => (
                <tr 
                  key={emp.id} 
                  className={selectedRow?.id === emp.id ? 'selected' : ''}
                  onClick={() => setSelectedRow(emp)}
                >
                  <td className="sticky-col" style={{ zIndex: 10, background: 'var(--att-card)', borderRight: '2px solid var(--att-border)', textAlign: 'left' }}>
                    <div style={{ fontWeight: '800', color: 'var(--att-heading)' }}>{emp.name}</div>
                    <div style={{ fontSize: '9px', color: 'var(--att-muted)', fontWeight: '700' }}>{emp.id} | {emp.dept}</div>
                  </td>
                  
                  {/* Daily attendance cells */}
                  {Array.from({ length: daysInMonth }, (_, index) => {
                    const day = index + 1;
                    const st = emp.att_map[day] || 'A';
                    let cls = 'attendance-cell-empty';
                    if (st === 'HP') cls = 'attendance-cell-half';
                    else if (st === 'P') cls = 'attendance-cell-active';
                    else if (st === '1.5P' || st === '2P' || st === '2.5P' || st === '3P') cls = 'attendance-cell-ot';
                    
                    return (
                      <td 
                        key={day} 
                        className={`${cls} clickable`} 
                        onClick={(e) => { e.stopPropagation(); showAttendance(emp.id, emp.name, day); }}
                      >
                        {st}
                      </td>
                    );
                  })}

                  {/* Summary columns */}
                  <td style={{ color: 'var(--att-warning)' }}>{emp.duty_counts['HP']}</td>
                  <td style={{ color: 'var(--att-success)' }}>{emp.duty_counts['1P']}</td>
                  <td style={{ color: 'var(--att-info)' }}>{emp.duty_counts['1.5P']}</td>
                  <td style={{ color: 'var(--att-info)' }}>{emp.duty_counts['2P']}</td>
                  <td style={{ color: 'var(--att-info)' }}>{emp.duty_counts['2.5P']}</td>
                  <td style={{ color: 'var(--att-info)' }}>{emp.duty_counts['3P']}</td>
                  
                  <td 
                    className="clickable" 
                    onClick={(e) => { e.stopPropagation(); showAttendance(emp.id, emp.name, null); }}
                    style={{ fontWeight: '800', textDecoration: 'underline', color: 'var(--att-accent)' }}
                  >
                    {parseFloat(emp.actual_duties || 0).toFixed(1)}
                  </td>
                  <td style={{ fontWeight: '800' }}>{emp.worked_days}</td>

                  {/* Overtime */}
                  <td style={{ color: 'var(--att-warning)' }}>{emp.ot_hours}</td>
                  <td style={{ color: 'var(--att-warning)' }}>₹{fmt(emp.ot_earnings)}</td>

                  {/* Financials */}
                  <td>₹{fmt(emp.base_sal)}</td>
                  <td style={{ color: 'var(--att-success)' }}>+{emp.extra_holidays}</td>
                  <td>
                    <div style={{ minWidth: '110px' }}>
                      <input
                        key={`${month}-${emp.id}-${emp.saved_adjustment || 0}-${emp.adjustment_locked ? 'locked' : 'open'}`}
                        aria-label={`Adjustment for ${emp.name}`}
                        className="adjust-input"
                        type="number"
                        step="0.5"
                        defaultValue={parseFloat(emp.saved_adjustment || 0).toFixed(1)}
                        disabled={Boolean(emp.adjustment_locked || reportMeta.adjustment_closed)}
                        title={emp.adjustment_locked
                          ? `Locked: ${emp.adjustment_reason || 'Monthly adjustment saved'}`
                          : reportMeta.adjustment_closed
                            ? reportMeta.adjustment_window_status === 'NOT_OPEN'
                              ? `Adjustment window opens on ${reportMeta.adjustment_start}`
                              : `Adjustment window closed on ${reportMeta.adjustment_deadline}`
                            : `Open ${reportMeta.adjustment_start} to ${reportMeta.adjustment_deadline}`}
                        onBlur={(e) => saveAdjustment(emp.id, e.target.value, emp.saved_adjustment || 0, e.target)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.currentTarget.blur();
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </td>
                  <td
                    title={emp.adjustment_reason || ''}
                    style={{ minWidth: '170px', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--att-muted)' }}
                  >
                    {emp.adjustment_locked
                      ? `🔒 ${emp.adjustment_reason || 'Locked'}`
                      : reportMeta.adjustment_closed
                        ? reportMeta.adjustment_window_status === 'NOT_OPEN'
                          ? `⏳ Opens ${reportMeta.adjustment_start}`
                          : `🔒 Closed ${reportMeta.adjustment_deadline}`
                        : '—'}
                  </td>
                  <td style={{ fontWeight: '800' }}>₹{fmt(emp.earned_gross)}</td>

                  {/* Deductions */}
                  <td style={{ color: 'var(--att-danger)' }}>₹{fmt(emp.salary_advance)}</td>
                  <td>₹{fmt(emp.pf)}</td>
                  <td>₹{fmt(emp.esi)}</td>
                  <td>₹{emp.pt}</td>
                  <td>₹{emp.lwf}</td>
                  <td>₹{emp.tds}</td>

                  {/* Net Pay */}
                  <td className="payout-col" style={{ fontWeight: '800', color: 'var(--att-success)' }}>₹{fmt(emp.net_pay)}</td>
                </tr>
              ))}
              {!employees.length && (
                <tr>
                  <td colSpan={daysInMonth + 23} className="attendance-empty">
                    No active employees registered under this criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RAW GATE TELEMETRY LOGS MODAL */}
      {isModalOpen && (
        <div className="attendance-modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="attendance-modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '750px' }}>
            <div className="attendance-modal-header">
              <div>
                <h2>{modalTitle}</h2>
                <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>{modalSubTitle}</p>
              </div>
              <button className="attendance-modal-close-btn" onClick={() => setIsModalOpen(false)} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            <div className="attendance-modal-body" style={{ padding: '16px' }}>
              <div className="attendance-table-wrapper">
                <table className="attendance-table">
                  <thead>
                    <tr>
                      <th style={{ textalign: 'left', border: 'none', borderBottom: '1px solid var(--att-border)' }}>Date</th>
                      <th style={{ textalign: 'left', border: 'none', borderBottom: '1px solid var(--att-border)' }}>Shift</th>
                      <th style={{ textalign: 'left', border: 'none', borderBottom: '1px solid var(--att-border)' }}>Timeline (Gate Entry/Exit)</th>
                      <th style={{ border: 'none', borderBottom: '1px solid var(--att-border)' }}>Work Hrs</th>
                      <th style={{ border: 'none', borderBottom: '1px solid var(--att-border)' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceLogs.map((d, index) => (
                      <tr key={index}>
                        <td style={{ fontWeight: '600', padding: '10px 8px', border: 'none', borderBottom: '1px solid var(--att-border)' }}>{d.date}</td>
                        <td style={{ fontWeight: '800', padding: '10px 8px', border: 'none', borderBottom: '1px solid var(--att-border)' }}>{d.shift}</td>
                        <td style={{ padding: '10px 8px', border: 'none', borderBottom: '1px solid var(--att-border)' }}>
                          {d.movements && d.movements.length > 0 ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                              {d.movements.map((m, mIdx) => (
                                <React.Fragment key={mIdx}>
                                  {mIdx > 0 && <ChevronRight size={10} style={{ color: 'var(--att-muted)' }} />}
                                  <span 
                                    className="attendance-badge" 
                                    style={{
                                      background: m.type === 'IN' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                                      color: m.type === 'IN' ? 'var(--att-success)' : 'var(--att-danger)',
                                      padding: '2px 6px',
                                      fontSize: '9px'
                                    }}
                                  >
                                    {m.type} {m.display_date || m.date || d.date} {m.time}
                                  </span>
                                </React.Fragment>
                              ))}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--att-muted)', fontStyle: 'italic' }}>Manual Entry</span>
                          )}
                        </td>
                        <td style={{ fontWeight: '800', padding: '10px 8px', border: 'none', borderBottom: '1px solid var(--att-border)', textAlign: 'center' }}>
                          {d.hours} hrs
                        </td>
                        <td style={{ fontWeight: '800', padding: '10px 8px', border: 'none', borderBottom: '1px solid var(--att-border)', textAlign: 'center', color: 'var(--att-accent)' }}>
                          {d.status}
                        </td>
                      </tr>
                    ))}
                    {!attendanceLogs.length && (
                      <tr>
                        <td colSpan="5" style={{ padding: '24px', textAlign: 'center', color: 'var(--att-muted)' }}>
                          No attendance records found for this selection.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* payslip print section */}
      {selectedRow && (
        <div id="printSection" className="pay-slip-print">
          <div className="pay-slip-sheet">
            <header className="pay-slip-company">
              <h1>{reportMeta.company_name || 'ERP COMPANY'}</h1>
              {reportMeta.company_address ? <p>{reportMeta.company_address}</p> : null}
              <h2>PAY SLIP FOR THE MONTH OF {monthName.toUpperCase()} - {month.split('-')[0]}</h2>
            </header>

            <table className="pay-slip-details">
              <tbody>
                <tr><th>Employee Name</th><td>{selectedRow.name}</td><th>Pay Mode</th><td>{selectedRow.pay_mode || 'BANK'}</td></tr>
                <tr><th>Employee Code</th><td>{selectedRow.id}</td><th>Bank Name</th><td>{selectedRow.bank_name || '—'}</td></tr>
                <tr><th>Designation</th><td>{selectedRow.designation || '—'}</td><th>Bank A/C No</th><td>{selectedRow.account_number || '—'}</td></tr>
                <tr><th>Department</th><td>{selectedRow.dept}</td><th>UAN / PF No</th><td>{selectedRow.uan_number || '—'}</td></tr>
                <tr><th>Location</th><td>{selectedRow.location || '—'}</td><th>MPEDA Registration Code</th><td>{reportMeta.mpeda_registration_code || 'NOT REGISTERED'}</td></tr>
                <tr><th>Date of Joining</th><td>{selectedRow.joining_date ? new Intl.DateTimeFormat('en-GB').format(new Date(`${selectedRow.joining_date}T00:00:00`)) : '—'}</td><th>Employee Type</th><td>{selectedRow.employee_type || 'REGULAR'}</td></tr>
              </tbody>
            </table>

            <table className="pay-slip-attendance">
              <thead><tr><th>Worked Days</th><th>LWP / Absent</th><th>Leave</th><th>EL</th><th>SL</th><th>CL</th><th>Duty Credit</th><th>OT Hours</th></tr></thead>
              <tbody><tr><td>{selectedRow.worked_days}</td><td>{Math.max(0, daysInMonth - Number(selectedRow.worked_days || 0))}</td><td>0</td><td>0</td><td>0</td><td>0</td><td>{Number(selectedRow.actual_duties || 0).toFixed(1)}</td><td>{fmt(selectedRow.ot_hours)}</td></tr></tbody>
            </table>

            <table className="pay-slip-money">
              <thead><tr><th colSpan="2">EARNINGS</th><th colSpan="2">DEDUCTIONS</th></tr></thead>
              <tbody>
                <tr><th>Basic Salary</th><td>₹ {fmt(selectedRow.basic_earned)}</td><th>Employee PF</th><td>₹ {fmt(selectedRow.pf)}</td></tr>
                <tr><th>HRA</th><td>₹ {fmt(selectedRow.hra_earned)}</td><th>ESI</th><td>₹ {fmt(selectedRow.esi)}</td></tr>
                <tr><th>Conveyance Allowance</th><td>₹ {fmt(selectedRow.conveyance_earned)}</td><th>Professional Tax</th><td>₹ {fmt(selectedRow.pt)}</td></tr>
                <tr><th>Other Allowance</th><td>₹ {fmt(selectedRow.other_earned)}</td><th>Salary Advance</th><td>₹ {fmt(selectedRow.salary_advance)}</td></tr>
                <tr><th>Overtime Pay ({fmt(selectedRow.ot_hours)} Hrs)</th><td>₹ {fmt(selectedRow.ot_earnings)}</td><th>LWF</th><td>₹ {fmt(selectedRow.lwf)}</td></tr>
                <tr><th>Holiday / Adjustment Days</th><td>{Number(selectedRow.extra_holidays || 0) + Number(selectedRow.saved_adjustment || 0)}</td><th>TDS</th><td>₹ {fmt(selectedRow.tds)}</td></tr>
                {selectedRow.adjustment_locked && <tr><th>Adjustment Reason</th><td colSpan="3">{selectedRow.adjustment_reason || 'Monthly adjustment locked'}</td></tr>}
                <tr className="pay-slip-total"><th>Total Earnings</th><td>₹ {fmt(selectedRow.earned_gross)}</td><th>Total Deductions</th><td>₹ {fmt(Number(selectedRow.pf || 0) + Number(selectedRow.esi || 0) + Number(selectedRow.pt || 0) + Number(selectedRow.lwf || 0) + Number(selectedRow.tds || 0) + Number(selectedRow.salary_advance || 0))}</td></tr>
              </tbody>
            </table>

            <table className="pay-slip-attendance">
              <thead><tr><th>Employer EPF</th><th>Employer EPS</th><th>Employer PF Total</th><th>Employer EDLI</th><th>Employer ESI</th></tr></thead>
              <tbody><tr><td>₹ {fmt(selectedRow.employer_epf)}</td><td>₹ {fmt(selectedRow.employer_eps)}</td><td>₹ {fmt(selectedRow.employer_pf)}</td><td>₹ {fmt(selectedRow.employer_edli)}</td><td>₹ {fmt(selectedRow.employer_esi)}</td></tr></tbody>
            </table>

            <div className="pay-slip-net">
              <span>Net Pay</span><strong>₹ {fmt(selectedRow.net_pay)}</strong>
            </div>
            <div className="pay-slip-words"><strong>In Words:</strong> {indianAmountInWords(selectedRow.net_pay)}</div>
            <div className="pay-slip-signatures"><span>Employee Signature</span><span>Prepared By</span><span>Authorised Signatory</span></div>
            <p className="pay-slip-note">This is a computer-generated payslip.</p>
          </div>
        </div>
      )}
    </div>
  );
}
