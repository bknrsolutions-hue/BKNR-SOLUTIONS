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
  const [activeTab, setActiveTab] = useState('staff'); // 'staff' | 'day_workers' | 'kg_workers'
  const [dayWorkersData, setDayWorkersData] = useState({ workers: [], pending_ot_list: [] });
  const [dayWorkersLoading, setDayWorkersLoading] = useState(false);

  const [kgWorkersData, setKgWorkersData] = useState({ workers: [] });
  const [kgWorkersLoading, setKgWorkersLoading] = useState(false);

  // Worker Adjustment Modal
  const [isAdjModalOpen, setIsAdjModalOpen] = useState(false);
  const [adjModalWorker, setAdjModalWorker] = useState(null);
  const [adjModalAmount, setAdjModalAmount] = useState('');
  const [adjModalReason, setAdjModalReason] = useState('');

  // KG Daily Production Details Modal
  const [kgDetailModal, setKgDetailModal] = useState({ isOpen: false, worker: null, day: null, details: null });

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

  const loadDayWorkersSheet = async (targetMonth = month, targetLoc = selectedLocation, targetDept = selectedDept) => {
    if (!targetMonth) return;
    setDayWorkersLoading(true);
    try {
      const res = await sessionFetch(`/api/salary/get-day-basis-report?month=${targetMonth}&dept=${targetDept}&location=${targetLoc}`);
      const data = await res.json();
      setDayWorkersData({
        workers: data.workers || [],
        pending_ot_list: data.pending_ot_list || []
      });
    } catch (e) {
      showNotification('❌ Failed to fetch Day Basis Workers Report!', 'danger');
    } finally {
      setDayWorkersLoading(false);
    }
  };

  const [tempWorkersData, setTempWorkersData] = useState({ workers: [], pending_ot_list: [] });
  const [tempWorkersLoading, setTempWorkersLoading] = useState(false);

  const loadTempWorkersSheet = async (targetMonth = month, targetLoc = selectedLocation, targetDept = selectedDept) => {
    if (!targetMonth) return;
    setTempWorkersLoading(true);
    try {
      const res = await sessionFetch(`/api/salary/get-temp-day-workers-report?month=${targetMonth}&dept=${targetDept}&location=${targetLoc}`);
      const data = await res.json();
      setTempWorkersData({
        workers: data.workers || [],
        pending_ot_list: data.pending_ot_list || []
      });
    } catch (e) {
      showNotification('❌ Failed to fetch Daily Temporary Workers Report!', 'danger');
    } finally {
      setTempWorkersLoading(false);
    }
  };

  const loadKgWorkersSheet = async (targetMonth = month, targetLoc = selectedLocation, targetDept = selectedDept) => {
    if (!targetMonth) return;
    setKgWorkersLoading(true);
    try {
      const res = await sessionFetch(`/api/salary/get-kg-basis-report?month=${targetMonth}&dept=${targetDept}&location=${targetLoc}`);
      const data = await res.json();
      setKgWorkersData({
        workers: data.workers || []
      });
    } catch (e) {
      showNotification('❌ Failed to fetch KG Basis Workers Report!', 'danger');
    } finally {
      setKgWorkersLoading(false);
    }
  };
  const openAdjustmentModal = (worker) => {
    const currentDay = new Date().getDate();
    const isAdjustmentActive = currentDay >= 1 && currentDay <= 10;
    if (!isAdjustmentActive) {
      showNotification(`🔒 Adjustments locked! Salary adjustments are allowed only between the 1st and 10th of the month. (Today is Day ${currentDay})`, 'danger');
      return;
    }
    setAdjModalWorker(worker);
    setAdjModalAmount(worker.salary_adjustment || 0);
    setAdjModalReason(worker.salary_adjustment_reason || '');
    setIsAdjModalOpen(true);
  };

  const handleSaveAdjustment = async () => {
    if (!adjModalWorker) return;
    const currentDay = new Date().getDate();
    const isAdjustmentActive = currentDay >= 1 && currentDay <= 10;
    if (!isAdjustmentActive) {
      showNotification(`🔒 Adjustments locked! Salary adjustments are allowed only between the 1st and 10th of the month. (Today is Day ${currentDay})`, 'danger');
      return;
    }

    try {
      const res = await sessionFetch('/api/salary/save-worker-adjustment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          worker_id: adjModalWorker.id,
          worker_name: adjModalWorker.name,
          month: month,
          adjustment_amount: parseFloat(adjModalAmount || 0),
          reason: adjModalReason
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        showNotification(data.message, 'success');
        setIsAdjModalOpen(false);
        if (activeTab === 'day_workers') loadDayWorkersSheet(month, selectedLocation, selectedDept);
        if (activeTab === 'kg_workers') loadKgWorkersSheet(month, selectedLocation, selectedDept);
        if (activeTab === 'temp_day_workers') loadTempWorkersSheet(month, selectedLocation, selectedDept);
      } else {
        throw new Error(data.message || 'Failed to save adjustment');
      }
    } catch (e) {
      showNotification(`❌ ${e.message}`, 'danger');
    }
  };

  const handleOtApproval = async (attId, action, approvedOtHours = null) => {
    try {
      const res = await sessionFetch('/api/salary/approve-day-basis-ot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          att_id: attId,
          action: action,
          approved_ot_hours: approvedOtHours
        })
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        showNotification(data.message, 'success');
        loadDayWorkersSheet(month, selectedLocation, selectedDept);
        generateSheet(month, selectedLocation, selectedDept);
      } else {
        throw new Error(data.message || 'Action failed!');
      }
    } catch (e) {
      showNotification(`❌ ${e.message}`, 'danger');
    }
  };

  const generateSheet = async (targetMonth = month, targetLoc = selectedLocation, targetDept = selectedDept) => {
    if (!targetMonth) return;
    try {
      const res = await sessionFetch(`/api/salary/get-report?month=${targetMonth}&dept=${targetDept}&location=${targetLoc}`);
      const data = await res.json();
      setDaysInMonth(data.days_in_month || 30);
      setMonthName(data.month_name || '');
      const rawEmployees = data.employees || [];
      const naturalSortKey = (str) => String(str || '').split(/(\d+)/).map(t => /^\d+$/.test(t) ? parseInt(t, 10) : t.toLowerCase());
      const sortedEmployees = [...rawEmployees].sort((a, b) => {
        const keyA = naturalSortKey(a.id);
        const keyB = naturalSortKey(b.id);
        for (let i = 0; i < Math.max(keyA.length, keyB.length); i++) {
          if (keyA[i] === undefined) return -1;
          if (keyB[i] === undefined) return 1;
          if (keyA[i] !== keyB[i]) {
            if (typeof keyA[i] === 'number' && typeof keyB[i] === 'number') return keyA[i] - keyB[i];
            return String(keyA[i]).localeCompare(String(keyB[i]));
          }
        }
        return 0;
      });
      setEmployees(sortedEmployees);
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
    loadDayWorkersSheet(currentMonth, 'ALL', 'ALL');
    loadKgWorkersSheet(currentMonth, 'ALL', 'ALL');
    loadTempWorkersSheet(currentMonth, 'ALL', 'ALL');
  }, []);

  const handleMonthChange = (e) => {
    setMonth(e.target.value);
    generateSheet(e.target.value, selectedLocation, selectedDept);
    loadDayWorkersSheet(e.target.value, selectedLocation, selectedDept);
    loadKgWorkersSheet(e.target.value, selectedLocation, selectedDept);
    loadTempWorkersSheet(e.target.value, selectedLocation, selectedDept);
  };

  const handleLocationChange = (e) => {
    setSelectedLocation(e.target.value);
    generateSheet(month, e.target.value, selectedDept);
    loadDayWorkersSheet(month, e.target.value, selectedDept);
    loadKgWorkersSheet(month, e.target.value, selectedDept);
    loadTempWorkersSheet(month, e.target.value, selectedDept);
  };

  const handleDeptChange = (e) => {
    setSelectedDept(e.target.value);
    generateSheet(month, selectedLocation, e.target.value);
    loadDayWorkersSheet(month, selectedLocation, e.target.value);
    loadKgWorkersSheet(month, selectedLocation, e.target.value);
    loadTempWorkersSheet(month, selectedLocation, e.target.value);
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

  const totals = React.useMemo(() => {
    const res = {
      hp: 0, p1: 0, p1_5: 0, p2: 0, p2_5: 0, p3: 0,
      actual_duties: 0, worked_days: 0,
      ot_hours: 0, ot_earnings: 0,
      base_sal: 0, extra_holidays: 0, saved_adjustment: 0, earned_gross: 0,
      salary_advance: 0, pf: 0, esi: 0, pt: 0, lwf: 0, tds: 0,
      net_pay: 0,
      daily_presents: {}
    };

    employees.forEach(emp => {
      res.hp += Number(emp.duty_counts?.['HP'] || 0);
      res.p1 += Number(emp.duty_counts?.['1P'] || 0);
      res.p1_5 += Number(emp.duty_counts?.['1.5P'] || 0);
      res.p2 += Number(emp.duty_counts?.['2P'] || 0);
      res.p2_5 += Number(emp.duty_counts?.['2.5P'] || 0);
      res.p3 += Number(emp.duty_counts?.['3P'] || 0);
      res.actual_duties += Number(emp.actual_duties || 0);
      res.worked_days += Number(emp.worked_days || 0);
      res.ot_hours += Number(emp.ot_hours || 0);
      res.ot_earnings += Number(emp.ot_earnings || 0);
      res.base_sal += Number(emp.base_sal || 0);
      res.extra_holidays += Number(emp.extra_holidays || 0);
      res.saved_adjustment += Number(emp.saved_adjustment || 0);
      res.earned_gross += Number(emp.earned_gross || 0);
      res.salary_advance += Number(emp.salary_advance || 0);
      res.pf += Number(emp.pf || 0);
      res.esi += Number(emp.esi || 0);
      res.pt += Number(emp.pt || 0);
      res.lwf += Number(emp.lwf || 0);
      res.tds += Number(emp.tds || 0);
      res.net_pay += Number(emp.net_pay || 0);

      for (let day = 1; day <= daysInMonth; day++) {
        const st = emp.att_map?.[day];
        if (st && st !== 'A') {
          let credit = 1.0;
          if (st === 'HP') credit = 0.5;
          else if (st === 'P' || st === '1P') credit = 1.0;
          else if (st === '1.5P') credit = 1.5;
          else if (st === '2P') credit = 2.0;
          else if (st === '2.5P') credit = 2.5;
          else if (st === '3P') credit = 3.0;
          else {
            const m = String(st).match(/^([\d.]+)P?$/i);
            if (m) credit = parseFloat(m[1]);
          }
          res.daily_presents[day] = (res.daily_presents[day] || 0) + credit;
        }
      }
    });

    return res;
  }, [employees, daysInMonth]);

  // Generate date day columns headers
  const dayHeaders = [];
  for (let i = 1; i <= daysInMonth; i++) {
    dayHeaders.push(<th key={i} style={{ width: '38px', minWidth: '38px' }}>{i}</th>);
  }

  return (
    <div className="attendance-container page-scrollable" style={{ paddingBottom: '80px' }}>
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

      {/* TAB NAVIGATION BAR */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', borderBottom: '2px solid var(--att-border)', paddingBottom: '10px', flexWrap: 'wrap' }}>
        <button
          className={`attendance-btn ${activeTab === 'staff' ? 'attendance-btn-primary' : 'attendance-btn-secondary'}`}
          onClick={() => setActiveTab('staff')}
          style={{ padding: '8px 18px', fontWeight: '800', fontSize: '13px', borderRadius: '6px' }}
        >
          👥 Regular Staff Payroll
        </button>
        <button
          className={`attendance-btn ${activeTab === 'day_workers' ? 'attendance-btn-primary' : 'attendance-btn-secondary'}`}
          onClick={() => {
            setActiveTab('day_workers');
            loadDayWorkersSheet();
          }}
          style={{ padding: '8px 18px', fontWeight: '800', fontSize: '13px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          📅 Day Basis Staff Payroll
          {dayWorkersData.pending_ot_list?.length > 0 && (
            <span style={{ background: '#f59e0b', color: '#fff', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: '900' }}>
              {dayWorkersData.pending_ot_list.length} OT Waiting
            </span>
          )}
        </button>
        <button
          className={`attendance-btn ${activeTab === 'kg_workers' ? 'attendance-btn-primary' : 'attendance-btn-secondary'}`}
          onClick={() => {
            setActiveTab('kg_workers');
            loadKgWorkersSheet();
          }}
          style={{ padding: '8px 18px', fontWeight: '800', fontSize: '13px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          ⚖️ KG Basis Workers Salary Sheet
        </button>
        <button
          className={`attendance-btn ${activeTab === 'temp_day_workers' ? 'attendance-btn-primary' : 'attendance-btn-secondary'}`}
          onClick={() => {
            setActiveTab('temp_day_workers');
            loadTempWorkersSheet();
          }}
          style={{ padding: '8px 18px', fontWeight: '800', fontSize: '13px', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          ⚡ Daily Temporary Workers
        </button>
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
      {activeTab === 'kg_workers' ? (

        <div className="kg-workers-payroll-container">
          {/* KPI CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div style={{ background: 'rgba(37, 99, 235, 0.08)', border: '1px solid rgba(37, 99, 235, 0.2)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--att-muted)' }}>Total KG Workers</div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#2563eb', marginTop: '4px' }}>
                {kgWorkersData.workers.length} Staff
              </div>
            </div>
            <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--att-muted)' }}>Total Worked Duty Days</div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#10b981', marginTop: '4px' }}>
                {kgWorkersData.workers.reduce((s, w) => s + Number(w.worked_duties || 0), 0)} Days
              </div>
            </div>
            <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--att-muted)' }}>Total KG Production</div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#f59e0b', marginTop: '4px' }}>
                ⚖️ {fmt(kgWorkersData.workers.reduce((s, w) => s + Number(w.total_kg || 0), 0))} KG
              </div>
            </div>
            <div style={{ background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.2)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--att-muted)' }}>Total KG Basis Payout</div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#8b5cf6', marginTop: '4px' }}>
                ₹{fmt(kgWorkersData.workers.reduce((s, w) => s + Number(w.net_pay || 0), 0))}
              </div>
            </div>
          </div>

          {/* KG BASIS WORKERS SALARY TABLE */}
          <div className="attendance-table-container">
            <div className="attendance-table-wrapper">
              <table className="attendance-table payroll-sheet-table" style={{ minWidth: `${300 + daysInMonth * 40 + 750}px` }}>
                <thead>
                  <tr>
                    <th rowSpan="2" className="sticky-col" style={{ zIndex: 30, background: 'var(--att-table-header-bg)', borderRight: '2px solid var(--att-border)', minWidth: '180px' }}>
                      KG Worker Name & ID
                    </th>
                    <th colSpan={daysInMonth} style={{ borderBottom: '1px solid var(--att-border)' }}>Daily Production Pay (₹) (Click Cell for KG Breakup)</th>
                    <th colSpan="3" style={{ borderBottom: '1px solid var(--att-border)', background: 'rgba(0,0,0,0.1)' }}>Duty & Earnings</th>
                    <th colSpan="3" style={{ borderBottom: '1px solid var(--att-border)', background: 'rgba(0,0,0,0.1)' }}>Payout (₹)</th>
                  </tr>
                  <tr>
                    {dayHeaders}
                    <th>Duty Days</th><th>Total KG</th><th>Base Pay (₹)</th>
                    <th>± Adjustment (₹)</th><th>Advance (₹)</th><th className="payout-col">Net Payout (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {kgWorkersData.workers.map((worker, index) => (
                    <tr key={worker.id || index}>
                      <td className="sticky-col" style={{ zIndex: 10, background: 'var(--att-card)', borderRight: '2px solid var(--att-border)', textAlign: 'left' }}>
                        <div style={{ fontWeight: '800', color: 'var(--att-heading)' }}>{index + 1}. {worker.name}</div>
                        <div style={{ fontSize: '9px', color: 'var(--att-muted)', fontWeight: '700' }}>ID: {worker.id} | {worker.contractor}</div>
                      </td>

                      {/* Daily Amount Cells (Click to view KG Details) */}
                      {Array.from({ length: daysInMonth }, (_, i) => {
                        const day = i + 1;
                        const cellVal = worker.att_map?.[day] || '-';
                        const dt = worker.att_details?.[day] || { day, total_kg: 0, deheading_kg: 0, peeling_kg: 0, amount: 0 };
                        const hasVal = cellVal !== '-';

                        return (
                          <td
                            key={day}
                            className={hasVal ? 'attendance-cell-active' : 'attendance-cell-empty'}
                            onClick={() => {
                              setKgDetailModal({
                                isOpen: true,
                                worker: worker,
                                day: day,
                                details: dt
                              });
                            }}
                            title={`Click to view Day ${day} KG Production Details`}
                            style={{ cursor: 'pointer', fontWeight: hasVal ? '800' : 'normal', fontSize: '11px', userSelect: 'none' }}
                          >
                            {cellVal}
                          </td>
                        );
                      })}

                      {/* Summary Columns */}
                      <td style={{ fontWeight: '800', color: 'var(--att-success)' }}>{worker.worked_duties}</td>
                      <td style={{ fontWeight: '800', color: '#f59e0b' }}>{fmt(worker.total_kg)}</td>
                      <td style={{ fontWeight: '800' }}>₹{fmt(worker.base_earnings)}</td>

                      <td style={{ fontWeight: '800' }}>
                        <span style={{ color: worker.salary_adjustment > 0 ? '#10b981' : (worker.salary_adjustment < 0 ? '#ef4444' : 'inherit') }}>
                          ₹{fmt(worker.salary_adjustment)}
                        </span>
                        <button
                          type="button"
                          onClick={() => openAdjustmentModal(worker)}
                          style={{ marginLeft: '6px', background: 'transparent', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '11px', fontWeight: '800' }}
                        >
                          ✏️
                        </button>
                      </td>
                      <td style={{ color: 'var(--att-muted)' }}>₹{fmt(worker.salary_advance)}</td>
                      <td className="payout-col" style={{ fontWeight: '900', color: 'var(--att-success)' }}>₹{fmt(worker.net_pay)}</td>
                    </tr>
                  ))}

                  {!kgWorkersData.workers.length && (
                    <tr>
                      <td colSpan={daysInMonth + 7} className="attendance-empty">
                        No KG Basis Workers records found for this selection.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'day_workers' ? (
        <div className="day-workers-payroll-container">
          {/* KPI CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div style={{ background: 'rgba(37, 99, 235, 0.08)', border: '1px solid rgba(37, 99, 235, 0.2)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--att-muted)' }}>Total Day Workers</div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#2563eb', marginTop: '4px' }}>
                {dayWorkersData.workers.length} Staff
              </div>
            </div>
            <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--att-muted)' }}>Total Worked Duty Days</div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#10b981', marginTop: '4px' }}>
                {dayWorkersData.workers.reduce((s, w) => s + Number(w.worked_duties || 0), 0)} Days
              </div>
            </div>
            <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--att-muted)' }}>Approved OT Hours</div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#f59e0b', marginTop: '4px' }}>
                ⚡ {dayWorkersData.workers.reduce((s, w) => s + Number(w.approved_ot_hours || 0), 0)} Hrs
              </div>
            </div>
            <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--att-muted)' }}>OT Approval Pending</div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#f59e0b', marginTop: '4px' }}>
                ⏳ {dayWorkersData.pending_ot_list.length} Requests
              </div>
            </div>
            <div style={{ background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.2)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--att-muted)' }}>Total Day Basis Payout</div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#8b5cf6', marginTop: '4px' }}>
                ₹{fmt(dayWorkersData.workers.reduce((s, w) => s + Number(w.net_pay || 0), 0))}
              </div>
            </div>
          </div>

          {/* PENDING OT & DOUBLE DUTY APPROVAL WAITING LIST */}
          {dayWorkersData.pending_ot_list.length > 0 && (
            <div style={{ background: 'var(--att-card)', border: '2px solid rgba(245, 158, 11, 0.4)', borderRadius: '10px', padding: '16px', marginBottom: '24px', boxShadow: '0 4px 12px rgba(245,158,11,0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '800', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    ⚠️ OT & Double Duty Approval Waiting List ({dayWorkersData.pending_ot_list.length} Pending)
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
                    Working hours &ge; 9 hrs require manager approval. Accept saves requested OT hours. Reject saves 8h Duty (P) only.
                  </p>
                </div>
              </div>

              <div className="attendance-table-wrapper" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                <table className="attendance-table" style={{ fontSize: '12px' }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'center', width: '40px' }}>#</th>
                      <th style={{ textAlign: 'left' }}>Date</th>
                      <th style={{ textAlign: 'left' }}>Worker Name & ID</th>
                      <th style={{ textAlign: 'left' }}>Department / Contractor</th>
                      <th style={{ textAlign: 'center' }}>Total Working Hours</th>
                      <th style={{ textAlign: 'center' }}>Standard Duty</th>
                      <th style={{ textAlign: 'center' }}>Requested OT Hours</th>
                      <th style={{ textAlign: 'center', width: '220px' }}>Approval Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dayWorkersData.pending_ot_list.map((item, idx) => (
                      <tr key={item.att_id || idx}>
                        <td style={{ textAlign: 'center', fontWeight: '700' }}>{idx + 1}</td>
                        <td style={{ fontWeight: '700' }}>{item.duty_date}</td>
                        <td style={{ fontWeight: '800', color: 'var(--att-heading)' }}>
                          {item.worker_name} <span style={{ fontSize: '10px', color: 'var(--att-muted)' }}>({item.worker_id})</span>
                        </td>
                        <td>{item.department}</td>
                        <td style={{ textAlign: 'center', fontWeight: '900', color: '#f59e0b' }}>
                          {item.working_hours} hrs {item.is_double_duty ? '(Double Duty)' : ''}
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: '800', color: 'var(--att-success)' }}>
                          8.0 hrs (P)
                        </td>
                        <td style={{ textAlign: 'center', fontWeight: '900', color: '#f59e0b' }}>
                          ⚡ {item.requested_ot_hours} hrs
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button
                              type="button"
                              className="attendance-btn"
                              onClick={() => handleOtApproval(item.att_id, 'APPROVE', item.requested_ot_hours)}
                              style={{ background: '#10b981', color: '#fff', border: 'none', padding: '4px 10px', fontSize: '11px', fontWeight: '800', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              ✓ Accept & Save
                            </button>
                            <button
                              type="button"
                              className="attendance-btn"
                              onClick={() => handleOtApproval(item.att_id, 'REJECT')}
                              style={{ background: '#475569', color: '#fff', border: 'none', padding: '4px 10px', fontSize: '11px', fontWeight: '800', borderRadius: '4px', cursor: 'pointer' }}
                            >
                              ✕ Reject (8h P Only)
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* DAY BASIS WORKERS SALARY TABLE */}
          <div className="attendance-table-container">
            <div className="attendance-table-wrapper">
              <table className="attendance-table payroll-sheet-table" style={{ minWidth: `${300 + daysInMonth * 40 + 950}px` }}>
                <thead>
                  <tr>
                    <th rowSpan="2" className="sticky-col" style={{ zIndex: 30, background: 'var(--att-table-header-bg)', borderRight: '2px solid var(--att-border)', minWidth: '180px' }}>
                      Day Worker Name & ID
                    </th>
                    <th colSpan={daysInMonth} style={{ borderBottom: '1px solid var(--att-border)' }}>Daily Attendance (P / HP / OT)</th>
                    <th colSpan="3" style={{ borderBottom: '1px solid var(--att-border)', background: 'rgba(0,0,0,0.1)' }}>Duty & Earnings</th>
                    <th colSpan="3" style={{ borderBottom: '1px solid var(--att-border)', background: 'rgba(0,0,0,0.1)' }}>Overtime (OT) Pay</th>
                    <th colSpan="3" style={{ borderBottom: '1px solid var(--att-border)', background: 'rgba(0,0,0,0.1)' }}>Payout (₹)</th>
                  </tr>
                  <tr>
                    {dayHeaders}
                    <th>Duty Days</th><th>Per Day Rate (₹)</th><th>Base Pay (₹)</th>
                    <th>OT Hrs</th><th>OT Rate (₹/h)</th><th>OT Pay (₹)</th>
                    <th>± Adjustment (₹)</th><th>Advance (₹)</th><th className="payout-col">Net Payout (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {dayWorkersData.workers.map((worker, index) => (
                    <tr key={worker.id || index}>
                      <td className="sticky-col" style={{ zIndex: 10, background: 'var(--att-card)', borderRight: '2px solid var(--att-border)', textAlign: 'left' }}>
                        <div style={{ fontWeight: '800', color: 'var(--att-heading)' }}>{index + 1}. {worker.name}</div>
                        <div style={{ fontSize: '9px', color: 'var(--att-muted)', fontWeight: '700' }}>ID: {worker.id} | {worker.contractor}</div>
                      </td>

                      {/* Attendance Cells */}
                      {Array.from({ length: daysInMonth }, (_, i) => {
                        const day = i + 1;
                        const st = worker.att_map?.[day] || 'A';
                        let cls = 'attendance-cell-empty';
                        if (st === 'HP') cls = 'attendance-cell-half';
                        else if (st.startsWith('P')) cls = 'attendance-cell-active';
                        if (st.includes('+')) cls = 'attendance-cell-ot';

                        return (
                          <td key={day} className={cls}>
                            {st}
                          </td>
                        );
                      })}

                      {/* Summary Columns */}
                      <td style={{ fontWeight: '800', color: 'var(--att-success)' }}>{worker.worked_duties}</td>
                      <td>₹{fmt(worker.per_day_rate)}</td>
                      <td style={{ fontWeight: '800' }}>₹{fmt(worker.base_earnings)}</td>

                      <td style={{ fontWeight: '800', color: 'var(--att-warning)' }}>{worker.approved_ot_hours}</td>
                      <td>₹{fmt(worker.ot_hourly_rate)}</td>
                      <td style={{ fontWeight: '800', color: 'var(--att-warning)' }}>₹{fmt(worker.ot_pay)}</td>

                      <td style={{ fontWeight: '800' }}>
                        <span style={{ color: worker.salary_adjustment > 0 ? '#10b981' : (worker.salary_adjustment < 0 ? '#ef4444' : 'inherit') }}>
                          ₹{fmt(worker.salary_adjustment)}
                        </span>
                        <button
                          type="button"
                          onClick={() => openAdjustmentModal(worker)}
                          style={{ marginLeft: '6px', background: 'transparent', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '11px', fontWeight: '800' }}
                        >
                          ✏️
                        </button>
                      </td>
                      <td style={{ color: 'var(--att-muted)' }}>₹{fmt(worker.salary_advance)}</td>
                      <td className="payout-col" style={{ fontWeight: '900', color: 'var(--att-success)' }}>₹{fmt(worker.net_pay)}</td>
                    </tr>
                  ))}

                  {!dayWorkersData.workers.length && (
                    <tr>
                      <td colSpan={daysInMonth + 11} className="attendance-empty">
                        No Day Basis Workers records found for this selection.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : activeTab === 'temp_day_workers' ? (
        <div className="temp-workers-payroll-container">
          {/* KPI CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div style={{ background: 'rgba(37, 99, 235, 0.08)', border: '1px solid rgba(37, 99, 235, 0.2)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--att-muted)' }}>Total Daily Temp Workers</div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#2563eb', marginTop: '4px' }}>
                {tempWorkersData.workers.length} Staff
              </div>
            </div>
            <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--att-muted)' }}>Total Worked Duty Days</div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#10b981', marginTop: '4px' }}>
                {tempWorkersData.workers.reduce((s, w) => s + Number(w.worked_duties || 0), 0)} Days
              </div>
            </div>
            <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--att-muted)' }}>Approved OT Hours</div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#f59e0b', marginTop: '4px' }}>
                ⚡ {tempWorkersData.workers.reduce((s, w) => s + Number(w.approved_ot_hours || 0), 0)} Hrs
              </div>
            </div>
            <div style={{ background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.2)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--att-muted)' }}>Total Temp Basis Payout</div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#8b5cf6', marginTop: '4px' }}>
                ₹{fmt(tempWorkersData.workers.reduce((s, w) => s + Number(w.net_pay || 0), 0))}
              </div>
            </div>
          </div>

          {/* TEMPORARY WORKERS SALARY TABLE */}
          <div className="attendance-table-container">
            <div className="attendance-table-wrapper">
              <table className="attendance-table payroll-sheet-table" style={{ minWidth: `${300 + daysInMonth * 40 + 950}px` }}>
                <thead>
                  <tr>
                    <th rowSpan="2" className="sticky-col" style={{ zIndex: 30, background: 'var(--att-table-header-bg)', borderRight: '2px solid var(--att-border)', minWidth: '180px' }}>
                      Temp Worker Name & ID
                    </th>
                    <th colSpan={daysInMonth} style={{ borderBottom: '1px solid var(--att-border)' }}>Daily Attendance (P / HP / OT)</th>
                    <th colSpan="3" style={{ borderBottom: '1px solid var(--att-border)', background: 'rgba(0,0,0,0.1)' }}>Duty & Earnings</th>
                    <th colSpan="3" style={{ borderBottom: '1px solid var(--att-border)', background: 'rgba(0,0,0,0.1)' }}>Overtime (OT) Pay</th>
                    <th colSpan="3" style={{ borderBottom: '1px solid var(--att-border)', background: 'rgba(0,0,0,0.1)' }}>Payout (₹)</th>
                  </tr>
                  <tr>
                    {dayHeaders}
                    <th>Duty Days</th><th>Per Day Rate (₹)</th><th>Base Pay (₹)</th>
                    <th>OT Hrs</th><th>OT Rate (₹/h)</th><th>OT Pay (₹)</th>
                    <th>± Adjustment (₹)</th><th>Advance (₹)</th><th className="payout-col">Net Payout (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {tempWorkersData.workers.map((worker, index) => (
                    <tr key={worker.id || index}>
                      <td className="sticky-col" style={{ zIndex: 10, background: 'var(--att-card)', borderRight: '2px solid var(--att-border)', textAlign: 'left' }}>
                        <div style={{ fontWeight: '800', color: 'var(--att-heading)' }}>{index + 1}. {worker.name}</div>
                        <div style={{ fontSize: '9px', color: 'var(--att-muted)', fontWeight: '700' }}>ID: {worker.id} | {worker.contractor}</div>
                      </td>

                      {/* Attendance Cells */}
                      {Array.from({ length: daysInMonth }, (_, i) => {
                        const day = i + 1;
                        const st = worker.att_map?.[day] || 'A';
                        let cls = 'attendance-cell-empty';
                        if (st === 'HP') cls = 'attendance-cell-half';
                        else if (st.startsWith('P')) cls = 'attendance-cell-active';
                        if (st.includes('+')) cls = 'attendance-cell-ot';

                        return (
                          <td key={day} className={cls}>
                            {st}
                          </td>
                        );
                      })}

                      {/* Summary Columns */}
                      <td style={{ fontWeight: '800', color: 'var(--att-success)' }}>{worker.worked_duties}</td>
                      <td>₹{fmt(worker.per_day_rate)}</td>
                      <td style={{ fontWeight: '800' }}>₹{fmt(worker.base_earnings)}</td>

                      <td style={{ fontWeight: '800', color: 'var(--att-warning)' }}>{worker.approved_ot_hours}</td>
                      <td>₹{fmt(worker.ot_hourly_rate)}</td>
                      <td style={{ fontWeight: '800', color: 'var(--att-warning)' }}>₹{fmt(worker.ot_pay)}</td>

                      <td style={{ fontWeight: '800' }}>
                        <span style={{ color: worker.salary_adjustment > 0 ? '#10b981' : (worker.salary_adjustment < 0 ? '#ef4444' : 'inherit') }}>
                          ₹{fmt(worker.salary_adjustment)}
                        </span>
                        <button
                          type="button"
                          onClick={() => openAdjustmentModal(worker)}
                          style={{ marginLeft: '6px', background: 'transparent', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '11px', fontWeight: '800' }}
                        >
                          ✏️
                        </button>
                      </td>
                      <td style={{ color: 'var(--att-muted)' }}>₹{fmt(worker.salary_advance)}</td>
                      <td className="payout-col" style={{ fontWeight: '900', color: 'var(--att-success)' }}>₹{fmt(worker.net_pay)}</td>
                    </tr>
                  ))}

                  {!tempWorkersData.workers.length && (
                    <tr>
                      <td colSpan={daysInMonth + 11} className="attendance-empty">
                        No Daily Temporary Workers records found for this selection.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="staff-workers-payroll-container">
          {/* KPI CARDS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div style={{ background: 'rgba(37, 99, 235, 0.08)', border: '1px solid rgba(37, 99, 235, 0.2)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--att-muted)' }}>Total Regular Staff</div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#2563eb', marginTop: '4px' }}>
                {employees.length} Staff
              </div>
            </div>
            <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--att-muted)' }}>Total Worked Duty Days</div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#10b981', marginTop: '4px' }}>
                {totals.worked_days} Days
              </div>
            </div>
            <div style={{ background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--att-muted)' }}>Earned Gross Pay</div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#f59e0b', marginTop: '4px' }}>
                ₹{fmt(totals.earned_gross)}
              </div>
            </div>
            <div style={{ background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.2)', padding: '12px', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--att-muted)' }}>Total Net Payout</div>
              <div style={{ fontSize: '20px', fontWeight: '900', color: '#8b5cf6', marginTop: '4px' }}>
                ₹{fmt(totals.net_pay)}
              </div>
            </div>
          </div>

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

              {employees.map((emp, index) => (
                <tr 
                  key={emp.id} 
                  className={selectedRow?.id === emp.id ? 'selected' : ''}
                  onClick={() => setSelectedRow(emp)}
                >
                  <td className="sticky-col" style={{ zIndex: 10, background: 'var(--att-card)', borderRight: '2px solid var(--att-border)', textAlign: 'left' }}>
                    <div style={{ fontWeight: '800', color: 'var(--att-heading)' }}>{index + 1}. {emp.name}</div>
                    <div style={{ fontSize: '9px', color: 'var(--att-muted)', fontWeight: '700' }}>ID: {emp.id} | {emp.dept}</div>
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
            <tfoot>
              <tr style={{ background: 'var(--att-table-header-bg)', color: 'var(--att-heading)', fontWeight: '800', borderTop: '2px solid var(--att-border)' }}>
                <td className="sticky-col" style={{ zIndex: 10, background: 'var(--att-table-header-bg)', borderRight: '2px solid var(--att-border)', textAlign: 'left' }}>
                  <strong>TOTALS ({employees.length} Staff)</strong>
                </td>
                {Array.from({ length: daysInMonth }, (_, index) => {
                  const day = index + 1;
                  const dayTotal = totals.daily_presents[day] || 0;
                  return (
                    <td key={day} style={{ fontSize: '10px', textAlign: 'center', color: dayTotal > 0 ? 'var(--att-success)' : 'var(--att-muted)' }}>
                      {dayTotal > 0 ? (Number.isInteger(dayTotal) ? dayTotal : dayTotal.toFixed(1)) : '—'}
                    </td>
                  );
                })}
                <td style={{ color: 'var(--att-warning)' }}>{totals.hp}</td>
                <td style={{ color: 'var(--att-success)' }}>{totals.p1}</td>
                <td style={{ color: 'var(--att-info)' }}>{totals.p1_5}</td>
                <td style={{ color: 'var(--att-info)' }}>{totals.p2}</td>
                <td style={{ color: 'var(--att-info)' }}>{totals.p2_5}</td>
                <td style={{ color: 'var(--att-info)' }}>{totals.p3}</td>
                <td style={{ color: 'var(--att-accent)', fontWeight: '800' }}>{totals.actual_duties.toFixed(1)}</td>
                <td style={{ fontWeight: '800' }}>{totals.worked_days}</td>
                <td style={{ color: 'var(--att-warning)' }}>{totals.ot_hours}</td>
                <td style={{ color: 'var(--att-warning)' }}>₹{fmt(totals.ot_earnings)}</td>
                <td>₹{fmt(totals.base_sal)}</td>
                <td style={{ color: 'var(--att-success)' }}>+{totals.extra_holidays}</td>
                <td>{totals.saved_adjustment > 0 ? `+${fmt(totals.saved_adjustment)}` : fmt(totals.saved_adjustment)}</td>
                <td style={{ color: 'var(--att-muted)' }}>—</td>
                <td style={{ color: 'var(--att-heading)', fontWeight: '800' }}>₹{fmt(totals.earned_gross)}</td>
                <td style={{ color: 'var(--att-danger)' }}>₹{fmt(totals.salary_advance)}</td>
                <td>₹{fmt(totals.pf)}</td>
                <td>₹{fmt(totals.esi)}</td>
                <td>₹{fmt(totals.pt)}</td>
                <td>₹{fmt(totals.lwf)}</td>
                <td className="payout-col" style={{ color: 'var(--att-success)', fontWeight: '900', fontSize: '12px' }}>₹{fmt(totals.net_pay)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )}






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
                      <th style={{ textAlign: 'left', border: 'none', borderBottom: '1px solid var(--att-border)' }}>Date</th>
                      <th style={{ textAlign: 'left', border: 'none', borderBottom: '1px solid var(--att-border)' }}>Shift</th>
                      <th style={{ textAlign: 'left', border: 'none', borderBottom: '1px solid var(--att-border)' }}>Timeline (Gate Entry/Exit)</th>
                      <th style={{ border: 'none', borderBottom: '1px solid var(--att-border)', textAlign: 'center' }}>Work Hrs</th>
                      <th style={{ border: 'none', borderBottom: '1px solid var(--att-border)', textAlign: 'center' }}>Overtime (OT)</th>
                      <th style={{ border: 'none', borderBottom: '1px solid var(--att-border)', textAlign: 'center' }}>Duty Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceLogs.map((d, index) => (
                      <tr key={index}>
                        <td style={{ fontWeight: '600', padding: '10px 8px', border: 'none', borderBottom: '1px solid var(--att-border)' }}>{d.date}</td>
                        <td style={{ fontWeight: '800', padding: '10px 8px', border: 'none', borderBottom: '1px solid var(--att-border)' }}>{d.shift}</td>
                        <td style={{ padding: '10px 8px', border: 'none', borderBottom: '1px solid var(--att-border)' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
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
                            {d.punch_missed && (
                              <div style={{ marginTop: 2 }}>
                                <span className="attendance-badge" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#dc2626', border: '1px solid #fca5a5', fontSize: '9px', fontWeight: '800' }}>
                                  ⚠️ Punch Missed ({d.punch_missed_reason || 'Incomplete Punch'})
                                </span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ fontWeight: '800', padding: '10px 8px', border: 'none', borderBottom: '1px solid var(--att-border)', textAlign: 'center' }}>
                          {d.hours} hrs
                        </td>
                        <td style={{ fontWeight: '800', padding: '10px 8px', border: 'none', borderBottom: '1px solid var(--att-border)', textAlign: 'center' }}>
                          {d.ot_hours > 0 ? (
                            <span className="attendance-badge" style={{
                              background: d.ot_status === 'APPROVED' ? 'rgba(34, 197, 94, 0.15)' : d.ot_status === 'REJECTED' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(234, 179, 8, 0.15)',
                              color: d.ot_status === 'APPROVED' ? '#16a34a' : d.ot_status === 'REJECTED' ? '#dc2626' : '#ca8a04',
                              fontSize: '10px',
                              fontWeight: '800',
                              padding: '2px 6px'
                            }}>
                              ⚡ {d.ot_hours} hrs ({d.ot_status})
                            </span>
                          ) : (
                            <span style={{ color: 'var(--att-muted)' }}>—</span>
                          )}
                        </td>
                        <td style={{ fontWeight: '800', padding: '10px 8px', border: 'none', borderBottom: '1px solid var(--att-border)', textAlign: 'center' }}>
                          <span className="attendance-badge" style={{
                            background: d.duty_status === 'REJECTED' ? 'rgba(239, 68, 68, 0.15)' : d.status === 'A' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                            color: d.duty_status === 'REJECTED' ? '#dc2626' : d.status === 'A' ? 'var(--att-danger)' : 'var(--att-success)',
                            fontSize: '10px'
                          }}>
                            {d.status} {d.duty_status ? `(${d.duty_status})` : ''}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {!attendanceLogs.length && (
                      <tr>
                        <td colSpan="6" style={{ padding: '24px', textAlign: 'center', color: 'var(--att-muted)' }}>
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

      {/* SALARY ADJUSTMENT MODAL FOR DAY & KG WORKERS */}
      {isAdjModalOpen && adjModalWorker && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--att-card)', border: '1px solid var(--att-border)', borderRadius: '12px', width: '100%', maxWidth: '420px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '16px', fontWeight: '800', color: 'var(--att-heading)' }}>
              ✏️ Edit Salary Adjustment - {adjModalWorker.name}
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '12px', color: 'var(--att-muted)' }}>
              Worker ID: {adjModalWorker.id} | Month: {month}
            </p>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', marginBottom: '6px', color: 'var(--att-muted)' }}>
                Adjustment Amount (₹) (+ for bonus, - for deduction)
              </label>
              <input
                type="number"
                step="any"
                className="attendance-input"
                style={{ width: '100%', fontSize: '14px', fontWeight: '800' }}
                placeholder="e.g. 500 or -200"
                value={adjModalAmount}
                onChange={(e) => setAdjModalAmount(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', marginBottom: '6px', color: 'var(--att-muted)' }}>
                Adjustment Reason / Remarks
              </label>
              <input
                type="text"
                className="attendance-input"
                style={{ width: '100%', fontSize: '13px' }}
                placeholder="e.g. Incentive / Special Allowance"
                value={adjModalReason}
                onChange={(e) => setAdjModalReason(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="attendance-btn attendance-btn-secondary"
                onClick={() => setIsAdjModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="attendance-btn attendance-btn-primary"
                onClick={handleSaveAdjustment}
                style={{ fontWeight: '800' }}
              >
                Save Adjustment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* KG PRODUCTION DETAILS POPUP MODAL */}
      {kgDetailModal.isOpen && kgDetailModal.worker && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ background: 'var(--att-card)', border: '1px solid var(--att-border)', borderRadius: '12px', width: '100%', maxWidth: '400px', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: '800', color: 'var(--att-heading)' }}>
              ⚖️ Daily KG Production Details
            </h3>
            <p style={{ margin: '0 0 16px', fontSize: '12px', color: 'var(--att-muted)' }}>
              Worker: <strong>{kgDetailModal.worker.name}</strong> ({kgDetailModal.worker.id})<br />
              Date: <strong>Day {kgDetailModal.day} ({month})</strong>
            </p>

            <div style={{ background: 'var(--att-table-header-bg)', borderRadius: '8px', padding: '14px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                <span style={{ fontWeight: '700', color: 'var(--att-muted)' }}>✂️ De-heading Production:</span>
                <strong style={{ color: '#2563eb' }}>{kgDetailModal.details?.deheading_kg || 0} KG</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
                <span style={{ fontWeight: '700', color: 'var(--att-muted)' }}>🦐 Peeling Production:</span>
                <strong style={{ color: '#10b981' }}>{kgDetailModal.details?.peeling_kg || 0} KG</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px dashed var(--att-border)', fontSize: '14px' }}>
                <span style={{ fontWeight: '800' }}>⚖️ Total Daily KG:</span>
                <strong style={{ color: '#f59e0b', fontSize: '15px' }}>{kgDetailModal.details?.total_kg || 0} KG</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px dashed var(--att-border)', fontSize: '14px', marginTop: '6px' }}>
                <span style={{ fontWeight: '800' }}>💰 Daily Amount Earned:</span>
                <strong style={{ color: '#8b5cf6', fontSize: '16px' }}>₹{kgDetailModal.details?.amount || 0}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="attendance-btn attendance-btn-primary"
                onClick={() => setKgDetailModal({ isOpen: false, worker: null, day: null, details: null })}
              >
                Close
              </button>
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
