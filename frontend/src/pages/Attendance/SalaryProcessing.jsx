import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Calculator, History, MoreVertical, Plus, X } from 'lucide-react';
import { sessionFetch } from '../../utils/sessionFetch';
import './Attendance.css';

const ZERO_FIELDS = {
  present_days: 0, absent_days: 0, ot_hours: 0, ot_amount: 0,
  salary_adjustment: 0, basic_salary: 0, hra: 0,
  conveyance_allowance: 0, special_allowance: 0, other_earnings: 0,
  pf_employee: 0, esi_employee: 0, professional_tax: 0, tds_salary: 0,
  advance_deduction: 0, lwf_employee: 0, other_deductions: 0,
  pf_employer: 0, epf_employer: 0, eps_employer: 0, edli_employer: 0,
  esi_employer: 0, lwf_employer: 0,
};

const emptyForm = () => ({
  month_year: '', employee_id: '', employee_name: '', designation: '',
  department: '', production_at: '', ...ZERO_FIELDS,
  payment_mode: 'BANK', status: 'DRAFT', payment_date: '', utr_reference: '',
});

const numericFields = new Set(Object.keys(ZERO_FIELDS));
const toNumber = value => Number.parseFloat(String(value ?? 0).replace(/[^0-9.-]/g, '')) || 0;
const money = value => toNumber(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Field({ label, name, value, onChange, type = 'text', readOnly = false, required = false, children, ...props }) {
  return (
    <div className="attendance-form-group">
      <label htmlFor={`salary-${name}`}>{label}</label>
      {children || (
        <input
          className="attendance-input"
          id={`salary-${name}`}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          readOnly={readOnly}
          required={required}
          {...props}
        />
      )}
    </div>
  );
}

export default function SalaryProcessing() {
  const [history, setHistory] = useState([]);
  const [audits, setAudits] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [activeSalaryTab, setActiveSalaryTab] = useState('identity');
  const [form, setForm] = useState(emptyForm);
  const [autoFillLabel, setAutoFillLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState(null);

  const notify = useCallback((msg, type = 'success') => {
    setNotification({ msg, type });
    window.setTimeout(() => setNotification(null), 4000);
  }, []);

  const loadRegister = useCallback(async () => {
    setLoading(true);
    try {
      const response = await sessionFetch('/finance_accounts/salary_processing/entry');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const rows = Array.from(doc.querySelectorAll('#tableBody tr.data-row'));
      setHistory(rows.map(row => {
        const cells = row.querySelectorAll('td');
        return {
          id: row.dataset.id,
          month_year: row.dataset.month || cells[1]?.textContent.trim() || '',
          employee_id: cells[2]?.textContent.trim() || '',
          employee_name: cells[3]?.textContent.trim() || '',
          designation: cells[4]?.textContent.trim() || '-',
          attendance: cells[5]?.textContent.trim() || '0 / 0',
          salary_adjustment: toNumber(cells[6]?.textContent),
          gross_salary: toNumber(cells[7]?.textContent),
          total_deductions: toNumber(cells[8]?.textContent),
          net_payable: toNumber(cells[9]?.textContent),
          status: cells[10]?.textContent.trim() || 'DRAFT',
          payment_status: cells[11]?.textContent.trim() || 'UNPAID',
        };
      }));

      const auditTable = doc.querySelectorAll('.table-wrap table')[1];
      const auditRows = Array.from(auditTable?.querySelectorAll('tbody tr') || []);
      setAudits(auditRows.map(row => Array.from(row.querySelectorAll('td')).map(cell => cell.textContent.trim()))
        .filter(cells => cells.length >= 6 && !cells[0].toLowerCase().startsWith('no payroll'))
        .map(cells => ({ time: cells[0], record: cells[1], check: cells[2], old: cells[3], next: cells[4], user: cells[5] })));
    } catch (error) {
      notify(`Salary register load failed: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const loadEmployees = useCallback(async () => {
    try {
      const response = await sessionFetch('/finance_accounts/salary_processing/employees');
      const data = await response.json();
      if (data.success) setEmployees(data.employees || []);
    } catch {
      notify('Employee list load failed.', 'error');
    }
  }, [notify]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadRegister();
      loadEmployees();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadEmployees, loadRegister]);

  const totals = useMemo(() => {
    const monthly = toNumber(form.basic_salary) + toNumber(form.hra) + toNumber(form.conveyance_allowance)
      + toNumber(form.special_allowance) + toNumber(form.other_earnings);
    const calculated = (monthly * toNumber(form.present_days) / 26) + toNumber(form.ot_amount);
    const gross = calculated + toNumber(form.salary_adjustment);
    const fixed = toNumber(form.pf_employee) + toNumber(form.esi_employee) + toNumber(form.professional_tax)
      + toNumber(form.tds_salary) + toNumber(form.lwf_employee) + toNumber(form.other_deductions);
    const advance = Math.min(toNumber(form.advance_deduction), Math.max(gross - fixed, 0));
    const deductions = fixed + advance;
    return { calculated, gross, advance, deductions, net: gross - deductions };
  }, [form]);

  const filteredRows = useMemo(() => history.filter(row => {
    const query = search.trim().toLowerCase();
    const matchesText = !query || `${row.employee_id} ${row.employee_name} ${row.designation}`.toLowerCase().includes(query);
    return matchesText && (!monthFilter || row.month_year === monthFilter);
  }), [history, monthFilter, search]);

  const change = event => {
    const { name, value } = event.target;
    setForm(previous => ({ ...previous, [name]: numericFields.has(name) ? value : value }));
    if (name === 'employee_id') setAutoFillLabel('');
    if (name === 'status') {
      setForm(previous => ({
        ...previous,
        status: value,
        payment_date: value === 'PAID' ? (previous.payment_date || new Date().toISOString().slice(0, 10)) : '',
        utr_reference: value === 'PAID' ? previous.utr_reference : '',
      }));
    }
  };

  const autoFill = useCallback(async (employeeId = form.employee_id, month = form.month_year) => {
    if (!employeeId) return;
    try {
      const query = month ? `?month_year=${encodeURIComponent(month)}` : '';
      const response = await sessionFetch(`/finance_accounts/salary_processing/employee_data/${encodeURIComponent(employeeId)}${query}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Employee payroll data unavailable');
      setForm(previous => {
        const next = { ...previous, employee_id: employeeId };
        Object.keys(next).forEach(key => {
          if (data[key] !== undefined && data[key] !== null) next[key] = data[key];
        });
        next.month_year = month || previous.month_year;
        return next;
      });
      setAutoFillLabel(data.source === 'existing'
        ? `Existing record (${data.source_month})`
        : data.source === 'salary_table'
          ? `Filled from ${data.source_month} salary`
          : 'Filled from employee master');
    } catch (error) {
      notify(error.message, 'error');
    }
  }, [form.employee_id, form.month_year, notify]);

  const openModal = () => {
    setForm(emptyForm());
    setAutoFillLabel('');
    setActiveSalaryTab('identity');
    setModalOpen(true);
    loadEmployees();
  };

  const save = async event => {
    event.preventDefault();
    if (form.status === 'PAID' && !form.payment_date) {
      notify('PAID status ki payment date compulsory.', 'error');
      return;
    }
    const payload = {
      ...form,
      ...Object.fromEntries(Object.keys(ZERO_FIELDS).map(key => [key, key === 'advance_deduction' ? totals.advance : toNumber(form[key])])),
      gross_salary: totals.gross,
      total_deductions: totals.deductions,
      net_payable: totals.net,
      payment_status: form.status === 'PAID' ? 'PAID' : 'UNPAID',
      payment_date: form.payment_date || null,
      utr_reference: form.utr_reference || null,
      designation: form.designation || null,
      department: form.department || null,
      production_at: form.production_at || null,
    };
    setSaving(true);
    try {
      const response = await sessionFetch('/finance_accounts/salary_processing/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Salary save failed');
      setModalOpen(false);
      notify(`${data.save_mode === 'UPDATED' ? 'Monthly row updated' : 'Salary slip created'} (#${data.record_id}).`);
      await loadRegister();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteSelected = async () => {
    if (!selectedId || !window.confirm('Cancel selected salary entry?')) return;
    try {
      const response = await sessionFetch(`/finance_accounts/salary_processing/delete/${selectedId}`, { method: 'POST' });
      if (!response.ok) throw new Error('Cancellation failed');
      setSelectedId(null);
      setMenuOpen(false);
      notify('Salary record cancelled.');
      await loadRegister();
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  return (
    <div className="attendance-container">
      {notification && <div className={`attendance-toast ${notification.type === 'error' ? 'error' : 'success'}`} style={{ top: 80 }}>{notification.msg}</div>}

      <div className="attendance-page-header">
        <div>
          <h1>Monthly Salary Processing Register</h1>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--att-muted)' }}>Compute, validate and post employee payroll slips</p>
        </div>
        <div className="attendance-page-header-actions">
          <button className="attendance-btn attendance-btn-secondary" type="button" onClick={() => setAuditModalOpen(true)}><History size={15} /> AUDIT TRAIL</button>
          <button className="attendance-btn attendance-btn-primary" type="button" onClick={openModal}><Plus size={16} /> COMPUTE SALARY</button>
        </div>
      </div>

      <div className="attendance-filters-bar">
        <div className="attendance-filter-group"><label htmlFor="salary-search">Search Employee</label><input id="salary-search" className="attendance-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Name / ID..." /></div>
        <div className="attendance-filter-group"><label htmlFor="salary-month-filter">Filter Month</label><input id="salary-month-filter" className="attendance-input" type="month" value={monthFilter} onChange={event => setMonthFilter(event.target.value)} /></div>
        <button className="attendance-btn attendance-btn-secondary" type="button" onClick={() => { setSearch(''); setMonthFilter(''); }}>Clear</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <strong style={{ fontSize: 11, color: 'var(--att-accent)' }}>{filteredRows.length} ENTRIES FOUND</strong>
        {selectedId && <div style={{ position: 'relative' }}><button className="attendance-action-dots-btn" type="button" onClick={() => setMenuOpen(value => !value)}><MoreVertical size={18} /></button>{menuOpen && <div className="attendance-dropdown-menu"><button className="attendance-dropdown-item" type="button" onClick={deleteSelected}><Ban size={14} /> Cancel Pay Slip</button></div>}</div>}
      </div>

      <div className="attendance-table-container"><div className="attendance-table-wrapper"><table className="attendance-table"><thead><tr>
        <th>Sl</th><th>Month</th><th>Employee ID</th><th>Employee Name</th><th>Designation</th><th>Attd (Days)</th>
        <th style={{ textAlign: 'right' }}>Adjustment (₹)</th><th style={{ textAlign: 'right' }}>Gross (₹)</th><th style={{ textAlign: 'right' }}>Deductions (₹)</th><th style={{ textAlign: 'right' }}>Net Payable (₹)</th><th>Status</th><th>Payment</th>
      </tr></thead><tbody>
        {loading && <tr><td colSpan="12" style={{ textAlign: 'center', padding: 32 }}>Loading salary register…</td></tr>}
        {!loading && !filteredRows.length && <tr><td colSpan="12" style={{ textAlign: 'center', padding: 32, color: 'var(--att-muted)' }}>No salary processing logs registered.</td></tr>}
        {!loading && filteredRows.map((row, index) => <tr key={row.id} className={String(selectedId) === String(row.id) ? 'selected' : ''} onClick={() => { setSelectedId(row.id); setMenuOpen(false); }}>
          <td>{index + 1}</td><td><strong>{row.month_year}</strong></td><td style={{ color: 'var(--att-accent)' }}>{row.employee_id}</td><td>{row.employee_name}</td><td>{row.designation}</td><td>{row.attendance}</td>
          <td style={{ textAlign: 'right' }}>{money(row.salary_adjustment)}</td><td style={{ textAlign: 'right' }}>{money(row.gross_salary)}</td><td style={{ textAlign: 'right', color: 'var(--att-danger)' }}>{money(row.total_deductions)}</td><td style={{ textAlign: 'right', color: 'var(--att-success)', fontWeight: 800 }}>{money(row.net_payable)}</td>
          <td><span className={`attendance-badge ${row.status === 'POSTED' || row.status === 'PAID' ? 'attendance-badge-success' : 'attendance-badge-warning'}`}>{row.status}</span></td><td><span className={`attendance-badge ${row.payment_status === 'PAID' ? 'attendance-badge-success' : 'attendance-badge-warning'}`}>{row.payment_status}</span></td>
        </tr>)}
      </tbody></table></div></div>

      {auditModalOpen && <div className="attendance-modal-overlay" onClick={() => setAuditModalOpen(false)}>
        <div className="attendance-modal-content salary-audit-modal" role="dialog" aria-modal="true" aria-labelledby="salary-audit-title" onClick={event => event.stopPropagation()}>
          <div className="attendance-modal-header">
            <h2 id="salary-audit-title"><History size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />Payroll Audit Trail</h2>
            <button className="attendance-modal-close-btn" type="button" onClick={() => setAuditModalOpen(false)} aria-label="Close audit trail"><X size={20} /></button>
          </div>
          <div className="attendance-modal-body salary-audit-modal-body">
            <div className="attendance-table-wrapper"><table className="attendance-table"><thead><tr><th>Time</th><th>Employee Record</th><th>Check</th><th>Old / Expected</th><th>New / Actual</th><th>User</th></tr></thead><tbody>
              {!audits.length && <tr><td colSpan="6" style={{ textAlign: 'center', color: 'var(--att-muted)' }}>No payroll audits found.</td></tr>}
              {audits.map((audit, index) => <tr key={`${audit.time}-${index}`} style={audit.check === 'PAYROLL VARIANCE ALERT' ? { background: 'rgba(239,68,68,.12)', color: 'var(--att-danger)' } : undefined}><td>{audit.time}</td><td>{audit.record}</td><td><strong>{audit.check}</strong></td><td>{audit.old}</td><td>{audit.next}</td><td>{audit.user}</td></tr>)}
            </tbody></table></div>
          </div>
        </div>
      </div>}

      {modalOpen && <div className="attendance-modal-overlay" onClick={() => setModalOpen(false)}><div className="attendance-modal-content" style={{ maxWidth: '1000px' }} role="dialog" aria-modal="true" aria-labelledby="salary-processing-title" onClick={event => event.stopPropagation()}>
        <div className="attendance-modal-header"><div><h2 id="salary-processing-title"><Calculator size={18} style={{ verticalAlign: 'middle', marginRight: 8 }} />Process Employee Salary Slip</h2>{autoFillLabel && <span className="attendance-badge attendance-badge-info" style={{ marginTop: 7 }}>{autoFillLabel}</span>}</div><button className="attendance-modal-close-btn" type="button" onClick={() => setModalOpen(false)} aria-label="Close salary form"><X size={20} /></button></div>
        <div className="attendance-tabs" style={{ padding: '0 24px', background: 'var(--att-card)' }}>
          {[['identity', '1. Employee & Attendance'], ['earnings', '2. Earnings'], ['deductions', '3. Deductions'], ['payment', '4. Payment Settings']].map(([tab, label]) => (
            <button key={tab} type="button" className={`attendance-tab-btn ${activeSalaryTab === tab ? 'active' : ''}`} onClick={() => setActiveSalaryTab(tab)}>{label}</button>
          ))}
        </div>
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}><div className="attendance-modal-body">
          {activeSalaryTab === 'identity' && <div className="attendance-form-grid">
            <div className="attendance-form-section-title">Payroll Identity & Attendance</div>
            <Field label="Month-Year" name="month_year" type="month" value={form.month_year} onChange={event => { change(event); if (form.employee_id) autoFill(form.employee_id, event.target.value); }} required />
            <Field label="Employee ID" name="employee_id" value={form.employee_id} onChange={event => { change(event); if (event.target.value) autoFill(event.target.value, form.month_year); }} required><select className="attendance-select" id="salary-employee_id" name="employee_id" value={form.employee_id} onChange={event => { change(event); if (event.target.value) autoFill(event.target.value, form.month_year); }} required><option value="">Select employee</option>{employees.map(employee => <option key={employee.employee_id} value={employee.employee_id}>{employee.employee_id} — {employee.employee_name}</option>)}</select></Field>
            <Field label="Employee Name" name="employee_name" value={form.employee_name} onChange={change} required />
            <Field label="Designation" name="designation" value={form.designation} onChange={change} />
            <Field label="Department" name="department" value={form.department} onChange={change} />
            <Field label="Plant / Cost Location" name="production_at" value={form.production_at} onChange={change} />
            <Field label="Present / Payable Days (26-day basis)" name="present_days" type="number" step="0.5" min="0" value={form.present_days} onChange={change} required />
            <Field label="Absent Days" name="absent_days" type="number" step="any" value={form.absent_days} onChange={change} required />
            <Field label="OT Hours Worked" name="ot_hours" type="number" step="any" value={form.ot_hours} onChange={change} />
          </div>}
          {activeSalaryTab === 'earnings' && <div className="attendance-form-grid">
            <div className="attendance-form-section-title">Earnings Structure</div>
            <Field label="Basic Salary (₹)" name="basic_salary" type="number" step="any" value={form.basic_salary} onChange={change} />
            <Field label="HRA (₹)" name="hra" type="number" step="any" value={form.hra} onChange={change} />
            <Field label="Conveyance (₹)" name="conveyance_allowance" type="number" step="any" value={form.conveyance_allowance} onChange={change} />
            <Field label="Special Allowance (₹)" name="special_allowance" type="number" step="any" value={form.special_allowance} onChange={change} />
            <Field label="OT Earnings (₹)" name="ot_amount" type="number" step="any" value={form.ot_amount} onChange={change} />
            <Field label="Other Earnings (₹)" name="other_earnings" type="number" step="any" value={form.other_earnings} onChange={change} />
            <Field label="System Earned Salary (₹)" name="calculated_salary" value={totals.calculated.toFixed(2)} onChange={() => {}} readOnly />
            <Field label="Salary Adjustment +/- (₹)" name="salary_adjustment" type="number" step="any" value={form.salary_adjustment} onChange={change} />
            <Field label="Final Gross Salary (₹)" name="gross_salary" value={totals.gross.toFixed(2)} onChange={() => {}} readOnly />
          </div>}
          {activeSalaryTab === 'deductions' && <div className="attendance-form-grid">
            <div className="attendance-form-section-title">Deductions & Contributions</div>
            <Field label="Employee PF (₹)" name="pf_employee" type="number" step="any" value={form.pf_employee} onChange={change} />
            <Field label="Employee ESI (₹)" name="esi_employee" type="number" step="any" value={form.esi_employee} onChange={change} />
            <Field label="Professional Tax (₹)" name="professional_tax" type="number" step="any" value={form.professional_tax} onChange={change} />
            <Field label="TDS (₹)" name="tds_salary" type="number" step="any" value={form.tds_salary} onChange={change} />
            <Field label="Salary Advance Set-off" name="advance_deduction" type="number" step="any" value={form.advance_deduction} onChange={change} />
            <Field label="LWF Contribution (₹)" name="lwf_employee" type="number" step="any" value={form.lwf_employee} onChange={change} />
            <Field label="Other Deductions (₹)" name="other_deductions" type="number" step="any" value={form.other_deductions} onChange={change} />
            <Field label="Total Deductions (₹)" name="total_deductions" value={totals.deductions.toFixed(2)} onChange={() => {}} readOnly />
            <Field label="Employer PF Total (EPF + EPS)" name="pf_employer" value={form.pf_employer} onChange={() => {}} readOnly />
            <Field label="Employer EPF (₹)" name="epf_employer" value={form.epf_employer} onChange={() => {}} readOnly />
            <Field label="Employer EPS (₹)" name="eps_employer" value={form.eps_employer} onChange={() => {}} readOnly />
            <Field label="Employer EDLI (₹)" name="edli_employer" value={form.edli_employer} onChange={() => {}} readOnly />
            <Field label="Employer ESI (₹)" name="esi_employer" type="number" step="any" value={form.esi_employer} onChange={change} />
            <Field label="Employer LWF (₹)" name="lwf_employer" type="number" step="any" value={form.lwf_employer} onChange={change} />
          </div>}
          {activeSalaryTab === 'payment' && <div className="attendance-form-grid">
            <div className="attendance-form-section-title">Net Payroll Outlay & Bank Settings</div>
            <Field label="Net Payable to Staff (₹)" name="net_payable" value={totals.net.toFixed(2)} onChange={() => {}} readOnly />
            <Field label="Payment Mode" name="payment_mode" value={form.payment_mode} onChange={change}><select className="attendance-select" id="salary-payment_mode" name="payment_mode" value={form.payment_mode} onChange={change}><option>BANK</option><option>CASH</option><option>CHEQUE</option><option>UPI</option></select></Field>
            <Field label="Processing Status" name="status" value={form.status} onChange={change}><select className="attendance-select" id="salary-status" name="status" value={form.status} onChange={change}><option>DRAFT</option><option>POSTED</option><option>PAID</option><option>CANCELLED</option></select></Field>
            <Field label="Payment Date" name="payment_date" type="date" value={form.payment_date} onChange={change} disabled={form.status !== 'PAID'} required={form.status === 'PAID'} />
            <Field label="UTR / Cheque Ref" name="utr_reference" value={form.utr_reference} onChange={change} disabled={form.status !== 'PAID'} />
          </div>}
        </div><div className="attendance-modal-footer"><button className="attendance-btn attendance-btn-secondary" type="button" onClick={() => setModalOpen(false)}>CANCEL</button><button className="attendance-btn attendance-btn-primary" type="submit" disabled={saving}>{saving ? 'SAVING…' : 'SAVE'}</button></div></form>
      </div></div>}
    </div>
  );
}
