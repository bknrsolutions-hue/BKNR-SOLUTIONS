import React, { useState, useEffect } from 'react';
import { 
  Users, RefreshCw, Printer, FileText, CheckCircle, AlertCircle, X, ChevronRight 
} from 'lucide-react';
import './Attendance.css';

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
        fetch('/api/salary/get-locations'),
        fetch('/api/salary/get-departments')
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
      const res = await fetch(`/api/salary/get-report?month=${targetMonth}&dept=${targetDept}&location=${targetLoc}`);
      const data = await res.json();
      setDaysInMonth(data.days_in_month || 30);
      setMonthName(data.month_name || '');
      setEmployees(data.employees || []);
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
      const res = await fetch(url);
      const data = await res.json();
      setAttendanceLogs(data || []);
      setIsModalOpen(true);
    } catch (e) {
      showNotification('❌ Failed to fetch raw gate movements!', 'danger');
    }
  };

  const saveAdjustment = async (empId, val, prevVal, targetInput) => {
    const decision = window.confirm(`Confirm Adjustment\nSave salary adjustment ${val} days for this employee?`);
    if (!decision) {
      targetInput.value = Number(prevVal).toFixed(1);
      return;
    }

    try {
      const res = await fetch('/api/salary/save-adjustment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: empId, month: month, adjustment: parseFloat(val) })
      });
      const out = await res.json();
      if (!res.ok || out.status !== 'success') {
        throw new Error(out.message || 'Adjustment Save Failed!');
      }
      
      showNotification('✅ Salary adjustment saved successfully.', 'success');
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
          <table className="attendance-table payroll-sheet-table" style={{ minWidth: `${300 + daysInMonth * 40 + 1500}px` }}>
            <thead>
              <tr>
                <th rowSpan="2" className="sticky-col" style={{ zIndex: 30, background: 'var(--att-table-header-bg)', borderRight: '2px solid var(--att-border)', minWidth: '180px' }}>
                  Employee & ID
                </th>
                <th colSpan={daysInMonth} style={{ borderBottom: '1px solid var(--att-border)' }}>Daily Attendance</th>
                <th colSpan="8" style={{ borderBottom: '1px solid var(--att-border)', background: 'rgba(0,0,0,0.1)' }}>Duty Summary</th>
                <th colSpan="2" style={{ borderBottom: '1px solid var(--att-border)', background: 'rgba(0,0,0,0.1)' }}>Overtime</th>
                <th colSpan="4" style={{ borderBottom: '1px solid var(--att-border)', background: 'rgba(0,0,0,0.1)' }}>Financials (₹)</th>
                <th colSpan="6" style={{ borderBottom: '1px solid var(--att-border)', background: 'rgba(0,0,0,0.1)' }}>Deductions (₹)</th>
                <th rowSpan="2" className="payout-col" style={{ borderBottom: '2px solid var(--att-border)', minWidth: '120px' }}>Net Payout</th>
              </tr>
              <tr>
                {dayHeaders}
                <th>HP</th><th>1P</th><th>1.5P</th><th>2P</th><th>2.5P</th><th>3P</th><th>Duty Credit</th><th>Worked Days</th>
                <th>OT Hrs</th><th>OT Pay</th>
                <th>Gross</th><th>Bonus</th><th>Adj</th><th>Earned</th>
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
                    <input 
                      aria-label={`Adjustment for ${emp.name}`}
                      className="adjust-input" 
                      type="number" 
                      step="0.5" 
                      defaultValue={parseFloat(emp.saved_adjustment || 0).toFixed(1)} 
                      onBlur={(e) => saveAdjustment(emp.id, e.target.value, emp.saved_adjustment || 0, e.target)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          saveAdjustment(emp.id, e.target.value, emp.saved_adjustment || 0, e.target);
                        }
                      }}
                      onClick={(e) => e.stopPropagation()} 
                    />
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
                  <td colSpan={daysInMonth + 19} className="attendance-empty">
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
                                    {m.type} {m.time}
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
        <div id="printSection">
          <div style={{ padding: '20px', fontFamily: 'sans-serif', background: '#fff', color: '#000' }}>
            <h2 style={{ color: '#0f172a', borderBottom: '2px solid #0f172a', paddingBottom: '8px', textAlign: 'center', fontWeight: '800' }}>
              PAYROLL PAYSLIP MASTER
            </h2>
            <br />
            <table style={{ width: '100%', marginBottom: '20px', fontSize: '12px' }}>
              <tbody>
                <tr>
                  <td style={{ textAlign: 'left', fontWeight: '800', width: '150px', padding: '4px 0' }}>Employee Name:</td>
                  <td style={{ textAlign: 'left', padding: '4px 0' }}>{selectedRow.name}</td>
                </tr>
                <tr>
                  <td style={{ textAlign: 'left', fontWeight: '800', padding: '4px 0' }}>Employee ID:</td>
                  <td style={{ textAlign: 'left', padding: '4px 0' }}>{selectedRow.id}</td>
                </tr>
                <tr>
                  <td style={{ textAlign: 'left', fontWeight: '800', padding: '4px 0' }}>Department:</td>
                  <td style={{ textAlign: 'left', padding: '4px 0' }}>{selectedRow.dept}</td>
                </tr>
                <tr>
                  <td style={{ textAlign: 'left', fontWeight: '800', padding: '4px 0' }}>Duty Credit:</td>
                  <td style={{ textAlign: 'left', fontWeight: '800', padding: '4px 0' }}>{parseFloat(selectedRow.actual_duties || 0).toFixed(1)} Days</td>
                </tr>
                <tr>
                  <td style={{ textAlign: 'left', fontWeight: '800', padding: '4px 0' }}>Worked Days:</td>
                  <td style={{ textAlign: 'left', fontWeight: '800', padding: '4px 0' }}>{selectedRow.worked_days} Days</td>
                </tr>
              </tbody>
            </table>
            <table style={{ width: '100%', border: '1px solid #d6dde7', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ background: '#f1f5f9' }}>
                  <th style={{ padding: '10px', border: '1px solid #d6dde7', textAlign: 'left' }}>Component Description</th>
                  <th style={{ padding: '10px', border: '1px solid #d6dde7', textAlign: 'right' }}>Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '10px', border: '1px solid #d6dde7', textAlign: 'left' }}>Gross Base Salary (Monthly)</td>
                  <td style={{ padding: '10px', border: '1px solid #d6dde7', textAlign: 'right' }}>₹{fmt(selectedRow.base_sal)}</td>
                </tr>
                {selectedRow.ot_hours > 0 && (
                  <tr>
                    <td style={{ padding: '10px', border: '1px solid #d6dde7', textAlign: 'left' }}>
                      Overtime (OT) Pay <span style={{ fontSize: '10px', color: '#64748b' }}>({selectedRow.ot_hours} Hrs)</span>
                    </td>
                    <td style={{ padding: '10px', border: '1px solid #d6dde7', textAlign: 'right', fontWeight: '700', color: '#ea580c' }}>
                      +₹{fmt(selectedRow.ot_earnings)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td style={{ padding: '10px', border: '1px solid #d6dde7', textAlign: 'left' }}>Earned Gross Total</td>
                  <td style={{ padding: '10px', border: '1px solid #d6dde7', textAlign: 'right', fontWeight: '800' }}>₹{fmt(selectedRow.earned_gross)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '10px', border: '1px solid #d6dde7', textAlign: 'left', color: '#dc2626' }}>Salary Advance</td>
                  <td style={{ padding: '10px', border: '1px solid #d6dde7', textAlign: 'right', color: '#dc2626' }}>-₹{fmt(selectedRow.salary_advance)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '10px', border: '1px solid #d6dde7', textAlign: 'left' }}>Provident Fund (PF)</td>
                  <td style={{ padding: '10px', border: '1px solid #d6dde7', textAlign: 'right' }}>-₹{fmt(selectedRow.pf)}</td>
                </tr>
                <tr>
                  <td style={{ padding: '10px', border: '1px solid #d6dde7', textAlign: 'left' }}>Employee State Insurance (ESI)</td>
                  <td style={{ padding: '10px', border: '1px solid #d6dde7', textAlign: 'right' }}>-₹{fmt(selectedRow.esi)}</td>
                </tr>
                <tr style={{ background: '#f0fdf4', fontSize: '14px', fontWeight: '800' }}>
                  <td style={{ padding: '10px', border: '1px solid #d6dde7', textAlign: 'left', color: '#16a34a' }}>Net Disbursed Payout</td>
                  <td style={{ padding: '10px', border: '1px solid #d6dde7', textAlign: 'right', color: '#16a34a' }}>₹{fmt(selectedRow.net_pay)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
