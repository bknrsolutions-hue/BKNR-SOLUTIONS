import { useCallback, useMemo, useState } from 'react';
import { sessionFetch } from '../../utils/sessionFetch';
import { Bars, DashboardHeader, DashboardState, MetricCard, ModuleRail, money, number, Panel, ProgressList, useDashboardData } from './DashboardPrimitives';
import './HRDashboard.css';
import './HRDashboardModal.css';

const HR_RAIL = [{ label: 'Forms', items: [
  { id: 'attendance_employee_register', route: '/attendance/employee/register', icon: 'fa-id-card-clip', label: 'Staff Registration' },
  { id: 'attendance_employee_increment', route: '/attendance/employee-increment', icon: 'fa-arrow-trend-up', label: 'Increment Details' },
  { id: 'attendance_daily_attendance', route: '/attendance/daily', icon: 'fa-fingerprint', label: 'Daily Attendance' },
  { id: 'attendance_tax_master', route: '/attendance/tax-master', icon: 'fa-file-shield', label: 'Payroll Master' },
  { id: 'attendance_salary_advance', route: '/attendance/salary-advance', icon: 'fa-hand-holding-dollar', label: 'Salary Advance' },
  { id: 'finance_salary_processing', route: '/finance_accounts/salary_processing/entry', icon: 'fa-calculator', label: 'Salary Processing' },
  { id: 'admin_shifts', route: '/attendance/shifts', icon: 'fa-clock', label: 'Shift Master' },
] }, { label: 'Reports', items: [
  { id: 'attendance_salary_report', route: '/attendance/salary/monthly-sheet', icon: 'fa-money-check-dollar', label: 'Monthly Salary Sheet' },
  { id: 'attendance_today_report', route: '/attendance/today_report', icon: 'fa-clipboard-user', label: 'Today Attendance' },
  { id: 'attendance_audit_report', route: '/attendance/audit_report', icon: 'fa-clock-rotate-left', label: 'Attendance Audit' },
] }];

const TABS = [
  ['operations', 'fa-stopwatch', 'Operations & Shifts'],
  ['cost', 'fa-indian-rupee-sign', 'Cost Centers & Payroll'],
  ['compliance', 'fa-shield-halved', 'Compliance & Risks'],
  ['approvals', 'fa-circle-check', 'Queue Approvals'],
  ['directory', 'fa-address-book', 'Master Directory'],
  ['analytics', 'fa-chart-pie', 'Analytics'],
];

const TableEmpty = ({ columns, text = 'No records available.' }) => <tr><td colSpan={columns} className="hr-empty">{text}</td></tr>;
const Pill = ({ children, tone = 'blue' }) => <span className={`hr-pill ${tone}`}>{children}</span>;

export default function HRDashboard({ setActivePage }) {
  const [tab, setTab] = useState('operations');
  const [deptFilter, setDeptFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [actionBusy, setActionBusy] = useState('');
  const [dutyInputs, setDutyInputs] = useState({});
  const [kpiModal, setKpiModal] = useState(null);
  const buildUrl = useCallback(() => {
    const params = new URLSearchParams({ format: 'json' });
    if (deptFilter) params.set('dept_filter', deptFilter);
    if (typeFilter) params.set('type_filter', typeFilter);
    if (statusFilter) params.set('status_filter', statusFilter);
    return `/dashboard/hr_command_center?${params.toString()}`;
  }, [deptFilter, typeFilter, statusFilter]);
  const { data, loading, error, reload } = useDashboardData(buildUrl);
  const go = (id, route) => setActivePage(id, route);

  const directory = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return data?.directory_list || [];
    return (data?.directory_list || []).filter(row => [
      row.employee_id, row.employee_name, row.department, row.designation, row.mobile,
    ].some(value => String(value || '').toLowerCase().includes(query)));
  }, [data?.directory_list, search]);

  const runApproval = async (kind, row) => {
    const key = `${kind}-${row.id}`;
    setActionBusy(key);
    try {
      const options = { method: 'POST' };
      if (kind === 'approve_duty') {
        const values = dutyInputs[row.id] || {};
        const selectedCredit = String(values.credit ?? row.suggested_duty_credit ?? 1);
        const body = new FormData();
        body.append('approved_duty_credit', selectedCredit);
        body.append('approved_ot_hours', selectedCredit === 'A' ? 0 : values.ot ?? row.calculated_ot_hours ?? 0);
        body.append('mark_absent', selectedCredit === 'A' ? 'true' : 'false');
        options.body = body;
      }
      const response = await sessionFetch(`/dashboard/${kind}/${row.id}`, options);
      if (!response.ok) throw new Error('Approval action failed.');
      await reload();
    } finally {
      setActionBusy('');
    }
  };

  const pendingTotal = Number(data?.pending_ot_count || 0) + Number(data?.pending_duty_count || 0);
  const openKpiDetails = async (type, title) => {
    setKpiModal({ title, loading: true, rows: [], mode: '' });
    try {
      const params = new URLSearchParams({ kpi_type: type });
      if (deptFilter) params.set('dept_filter', deptFilter);
      if (typeFilter) params.set('type_filter', typeFilter);
      if (statusFilter) params.set('status_filter', statusFilter);
      const response = await sessionFetch(`/dashboard/hr_kpi_details?${params.toString()}`, { headers: { Accept: 'application/json' } });
      const payload = await response.json();
      if (!response.ok || payload.status !== 'success') throw new Error(payload.message || 'KPI details could not be loaded.');
      setKpiModal({ title, loading: false, rows: payload.data || [], mode: payload.mode || '' });
    } catch (modalError) {
      setKpiModal({ title, loading: false, rows: [], mode: '', error: modalError.message });
    }
  };

  return <div className="module-shell hr-react-dashboard">
    <ModuleRail title="HRMS" icon="fa-users-gear" sections={HR_RAIL} onNavigate={item => go(item.id, item.route)} />
    <main className="enterprise-dashboard">
      <DashboardHeader title="HR Dashboard" subtitle={data?.actual_location || 'ALL UNITS'} onRefresh={reload} />
      <DashboardState loading={loading} error={error}>
        <div className="enterprise-kpis hr-kpis">
          <MetricCard label="Total Manpower" value={number(data?.total_employees)} note="All registered staff" icon="fa-users" onClick={() => openKpiDetails('TOTAL_STAFF', 'Total Manpower')} />
          <MetricCard label="Active Force" value={number(data?.active_employees)} note="Currently active" icon="fa-user-check" color="#16a34a" onClick={() => openKpiDetails('ACTIVE_STAFF', 'Active Force')} />
          <MetricCard label="Present Today" value={`${number(data?.present_pct)}%`} note={Number(data?.present_pct) >= 85 ? 'Good turnout' : 'Below target'} icon="fa-clipboard-user" onClick={() => openKpiDetails('PRESENT', 'Present Today')} />
          <MetricCard label="Absent Today" value={number(data?.absent_today)} note="Unaccounted" icon="fa-user-xmark" color="#f59e0b" onClick={() => openKpiDetails('ABSENT', 'Absent Today')} />
          <MetricCard label="Labour Cost/KG" value={money(data?.cost_per_kg)} note="Per kg processed" icon="fa-scale-unbalanced" onClick={() => setTab('cost')} />
          <MetricCard label="Est. Labour Cost" value={money(data?.labor_cost_today)} note="Today’s estimate" icon="fa-indian-rupee-sign" onClick={() => setTab('cost')} />
          <MetricCard label="OT Hours Logged" value={`${number(data?.ot_hours_today)} Hrs`} note="Pending approval" icon="fa-clock" color="#f59e0b" onClick={() => openKpiDetails('OT_TODAY', 'OT Hours Logged')} />
          <MetricCard label="Productivity" value={`${number(data?.employee_productivity)}%`} note="Efficiency index" icon="fa-chart-line" color="#16a34a" onClick={() => setTab('analytics')} />
          <MetricCard label="Permanent Labor" value={`${number(data?.perm_pct)}%`} icon="fa-building-user" onClick={() => openKpiDetails('PERMANENT', 'Permanent Labor')} />
          <MetricCard label="Contract Labor" value={`${number(data?.contract_pct)}%`} icon="fa-helmet-safety" color="#64748b" onClick={() => openKpiDetails('CONTRACT', 'Contract Labor')} />
          <MetricCard label="Avg Net Salary" value={money(data?.avg_salary)} note="Per employee" icon="fa-money-check-dollar" color="#64748b" onClick={() => setTab('cost')} />
          <MetricCard label="Attrition (YTD)" value={`${number(data?.attrition_rate)}%`} note={Number(data?.attrition_rate) <= 5 ? 'Under control' : 'Needs attention'} icon="fa-person-walking-arrow-right" color="#f59e0b" onClick={() => setTab('analytics')} />
          <MetricCard label="Pending OT" value={number(data?.pending_ot_count)} note="Awaiting approval" icon="fa-stopwatch" color="#f59e0b" onClick={() => setTab('approvals')} />
          <MetricCard label="Pending Duty" value={number(data?.pending_duty_count)} note="Awaiting approval" icon="fa-clipboard-check" color="#f59e0b" onClick={() => setTab('approvals')} />
        </div>

        <div className="hr-tabs">
          {TABS.map(([key, icon, label]) => <button type="button" key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            <i className={`fa-solid ${icon}`}></i>{label}
            {key === 'approvals' && pendingTotal > 0 ? <span>{pendingTotal}</span> : null}
          </button>)}
        </div>

        {tab === 'operations' && <OperationsTab data={data} />}
        {tab === 'cost' && <CostTab data={data} />}
        {tab === 'compliance' && <ComplianceTab data={data} />}
        {tab === 'approvals' && <ApprovalsTab data={data} runApproval={runApproval} actionBusy={actionBusy} dutyInputs={dutyInputs} setDutyInputs={setDutyInputs} />}
        {tab === 'directory' && <DirectoryTab data={data} rows={directory} filters={{ deptFilter, typeFilter, statusFilter, search }} setters={{ setDeptFilter, setTypeFilter, setStatusFilter, setSearch }} />}
        {tab === 'analytics' && <AnalyticsTab data={data} />}
      </DashboardState>
      {kpiModal ? <KpiDetailsModal state={kpiModal} onClose={() => setKpiModal(null)} /> : null}
    </main>
  </div>;
}

function KpiDetailsModal({ state, onClose }) {
  const employeeMode = state.mode === 'EMPLOYEE';
  return <div className="hr-modal-overlay" role="presentation" onMouseDown={onClose}><div className="hr-modal" role="dialog" aria-modal="true" aria-label={`${state.title} details`} onMouseDown={event => event.stopPropagation()}>
    <div className="hr-modal-head"><div><h2>{state.title}</h2><span>{state.loading ? 'Loading details…' : `${number(state.rows.length)} records`}</span></div><button type="button" onClick={onClose}>×</button></div>
    {state.loading ? <div className="hr-modal-state"><i className="fa-solid fa-spinner fa-spin"></i> Loading data…</div> : state.error ? <div className="hr-modal-state error">{state.error}</div> : <div className="enterprise-table-wrap hr-modal-table"><table className="enterprise-table"><thead><tr>{employeeMode ? <><th>Emp ID</th><th>Name</th><th>Department</th><th>Designation</th><th>Type</th><th>Contact</th><th>Manager</th><th>Status</th></> : <><th>Emp ID</th><th>Name</th><th>Shift</th><th>Movements</th><th className="num">Hours</th><th className="num">OT Hours</th><th>Status</th></>}</tr></thead><tbody>{state.rows.length ? state.rows.map((row, index) => employeeMode ? <tr key={`${row.id}-${index}`}><td><strong>{row.id}</strong></td><td>{row.name}</td><td>{row.department}</td><td>{row.designation}</td><td><Pill tone={['CONTRACT', 'CONTRACTOR'].includes(row.employee_type) ? 'amber' : 'blue'}>{row.employee_type}</Pill></td><td>{row.contact}</td><td>{row.manager}</td><td><Pill tone={row.status === 'ACTIVE' ? 'green' : 'red'}>{row.status}</Pill></td></tr> : <tr key={`${row.id}-${index}`}><td><strong>{row.id}</strong></td><td>{row.name}</td><td><Pill>{row.shift}</Pill></td><td>{row.movements}</td><td className="num">{number(row.hours)}</td><td className="num">{number(row.ot_hours)}</td><td><Pill tone={row.status === 'CLOSED' ? 'green' : 'amber'}>{row.status}</Pill></td></tr>) : <TableEmpty columns={employeeMode ? 8 : 7} text="No matching records found." />}</tbody></table></div>}
  </div></div>;
}

function OperationsTab({ data }) {
  const heatmap = Object.entries(data?.heatmap_data || {});
  return <div className="enterprise-grid hr-grid">
    <Panel title="7-Day Department Attendance Heatmap" meta="Last 7 days" full>
      <div className="enterprise-table-wrap"><table className="enterprise-table"><thead><tr><th>Department</th>{(data?.heatmap_days || []).map(day => <th className="num" key={day}>{day}</th>)}<th className="num">Avg</th></tr></thead><tbody>
        {heatmap.length ? heatmap.map(([department, counts]) => <tr key={department}><td><strong>{department || 'GENERAL'}</strong></td>{counts.map((count, index) => <td className="num" key={index}><span className={`hr-heat ${Number(count) > 10 ? 'high' : Number(count) > 0 ? 'mid' : 'zero'}`}>{count || '—'}</span></td>)}<td className="num"><strong>{number(counts.reduce((sum, value) => sum + Number(value || 0), 0) / Math.max(1, counts.length))}</strong></td></tr>) : <TableEmpty columns={9} text="No heatmap data available." />}
      </tbody></table></div>
    </Panel>
    <Panel title="Shift Performance Matrix" meta="Today">
      <div className="enterprise-table-wrap"><table className="enterprise-table"><thead><tr><th>Shift</th><th className="num">Staff</th><th className="num">OT Hrs</th><th className="num">Avg Hrs</th><th className="num">Efficiency</th></tr></thead><tbody>{(data?.shift_performance || []).length ? data.shift_performance.map(row => <tr key={row.shift}><td><Pill>{row.shift}</Pill></td><td className="num">{number(row.employees)}</td><td className="num">{number(row.ot_hrs)}</td><td className="num">{number(row.avg_hrs)}</td><td className="num"><Pill tone={Number(row.efficiency) > 80 ? 'green' : Number(row.efficiency) > 60 ? 'amber' : 'red'}>{number(row.efficiency)}%</Pill></td></tr>) : <TableEmpty columns={5} />}</tbody></table></div>
    </Panel>
    <Panel title="Hours Logged Spectrum" meta="Today"><Bars labels={['<4h', '4-8h', '8-12h', '12h+']} primary={data?.productivity_data || []} /></Panel>
    <Panel title="Today’s Attendance Split" meta="Live"><StatTiles rows={[
      ['Present', data?.present_today, 'green'], ['Absent', data?.absent_today, 'red'], ['Half Day', data?.half_day_today, 'amber'], ['OT Workers', data?.ot_workers_today, 'purple'],
    ]} /><Gauge label="Attendance Rate" value={data?.present_pct} color="#16a34a" /></Panel>
  </div>;
}

function CostTab({ data }) {
  const ot = data?.ot_center || {};
  const processedOt = Number(ot.APPROVED || 0) + Number(ot.REJECTED || 0);
  return <div className="enterprise-grid hr-grid">
    <Panel title="Department Cost Center" full>
      <div className="enterprise-table-wrap"><table className="enterprise-table"><thead><tr><th>Department</th><th className="num">Employees</th><th className="num">Salary Cost</th><th className="num">Avg Salary</th><th className="num">% Total</th></tr></thead><tbody>{(data?.dept_cost_center || []).length ? data.dept_cost_center.map(row => <tr key={row.dept}><td><strong>{row.dept}</strong></td><td className="num">{number(row.emps)}</td><td className="num">{money(row.total_sal)}</td><td className="num">{money(row.avg_sal)}</td><td className="num"><Pill>{number(row.cost_pct)}%</Pill></td></tr>) : <TableEmpty columns={5} />}</tbody></table></div>
    </Panel>
    <Panel title="Salary Tier Distribution"><Bars labels={['<₹10K', '₹10-20K', '₹20-30K', '₹30K+']} primary={data?.salary_tiers || []} /></Panel>
    <Panel title="Overtime Control Center"><StatTiles rows={[
      ['Pending OT', `${number(ot.PENDING)}h`, 'amber'], ['Approved OT', `${number(ot.APPROVED)}h`, 'green'], ['Rejected OT', `${number(ot.REJECTED)}h`, 'red'], ['Est. OT Cost', money(ot.TOTAL_COST), 'red'],
    ]} /><Gauge label="OT Approval Rate" value={processedOt ? Number(ot.APPROVED || 0) / processedOt * 100 : 0} color="#16a34a" /></Panel>
    <Panel title="Contractor Performance Analytics" full>
      <div className="enterprise-table-wrap"><table className="enterprise-table"><thead><tr><th>Contractor</th><th className="num">Manpower</th><th className="num">Present</th><th className="num">Attendance</th><th className="num">Productivity</th><th className="num">Net Payroll</th></tr></thead><tbody>{(data?.contractor_analytics || []).length ? data.contractor_analytics.map(row => <tr key={row.name}><td><strong>{row.name}</strong></td><td className="num">{number(row.manpower)}</td><td className="num">{number(row.present)}</td><td className="num">{number(Number(row.present || 0) / Math.max(1, Number(row.manpower || 0)) * 100)}%</td><td className="num"><Pill tone={Number(row.productivity) >= 75 ? 'green' : 'red'}>{number(row.productivity)}%</Pill></td><td className="num">{money(row.salary)}</td></tr>) : <TableEmpty columns={6} />}</tbody></table></div>
    </Panel>
  </div>;
}

function ComplianceTab({ data }) {
  return <div className="enterprise-grid hr-grid">
    <Panel title="Statutory Coverage"><Gauge label="PF Coverage Ratio" value={data?.pf_coverage_pct} color="#16a34a" /><Gauge label="ESI Coverage Ratio" value={data?.esi_coverage_pct} color="#2563eb" /><Gauge label="PT Covered Employees" value={data?.pt_coverage_pct} color="#7c3aed" /><InfoRows rows={[
      ['Missing UAN Numbers', `${number(data?.stat_missing_uan)} profiles`, 'red'], ['Missing ESI Numbers', `${number(data?.stat_missing_esi)} profiles`, 'red'], ['PF Not Applicable', `${number(data?.stat_pf_na)} employees`, 'amber'],
    ]} /></Panel>
    <Panel title="Master Risk Registry"><InfoRows rows={[
      ['PAN Card Missing', `${number(data?.risk_no_pan)} alerts`, 'red'], ['Aadhaar Missing', `${number(data?.risk_no_aadhar)} alerts`, 'red'], ['Bank A/C Missing', `${number(data?.risk_no_bank)} alerts`, 'red'], ['Mobile No Missing', `${number(data?.risk_no_mobile)} alerts`, 'amber'], ['Biometric / Photo Missing', `${number(data?.risk_no_photo)} alerts`, 'amber'], ['Email Missing', `${number(data?.risk_no_email)} alerts`, 'amber'], ['Missing Statutory Master', `${number(data?.risk_missing_statutory)} alerts`, 'red'],
    ]} /></Panel>
    <Panel title="Salary Advance Control"><InfoRows rows={[
      ['Total Disbursed (YTD)', money(data?.adv_issued)], ['Total Recovered', `${money(data?.adv_recovered)} · ${number(data?.adv_recovery_pct)}%`, 'green'], ['Net Outstanding', money(data?.adv_balance), 'red'],
    ]} />{(data?.top_10_advances || []).slice(0, 6).map(row => <div className="hr-data-row compact" key={row.id}><span>{row.employee_name}</span><strong className="red">{money(row.remaining_balance)}</strong></div>)}</Panel>
    <Panel title="Calendar & Leaves"><InfoRows rows={[
      ['Upcoming Birthdays (7D)', number(data?.bday_7?.length)], ['Upcoming Birthdays (30D)', number(data?.bday_30?.length)], ['Work Anniversaries (7D)', number(data?.anniv_7?.length)],
    ]} />{(data?.bday_7 || []).slice(0, 4).map(row => <div className="hr-data-row compact" key={row.employee_id}><span>{row.employee_name}</span><strong>{formatDate(row.date, { day: '2-digit', month: 'short' })}</strong></div>)}<StatTiles rows={[
      ['CL', data?.leave_module?.cl], ['SL', data?.leave_module?.sl], ['EL', data?.leave_module?.el], ['Pending', data?.leave_module?.pending_approvals, 'amber'],
    ]} /></Panel>
  </div>;
}

function ApprovalsTab({ data, runApproval, actionBusy, dutyInputs, setDutyInputs }) {
  return <div className="enterprise-grid hr-grid">
    <Panel title="Multiple Duty (Double / Triple) Queue" meta={`${number(data?.pending_duty_count)} pending`} full><div className="enterprise-table-wrap hr-tall-table"><table className="enterprise-table"><thead><tr><th>Emp ID</th><th>Name</th><th>Date</th><th>Shift</th><th>Status</th><th className="num">Working Hrs</th><th className="num">Extra Hrs</th><th>Duty Credit</th><th>Approve OT</th><th>Action</th></tr></thead><tbody>{(data?.pending_duty_rows || []).length ? data.pending_duty_rows.map(row => {
      const values = dutyInputs[row.id] || {};
      return <tr key={row.id}><td><strong>{row.employee_id}</strong></td><td>{row.employee_name}</td><td>{formatDate(row.duty_date)}</td><td><Pill>{row.shift_name}</Pill></td><td><Pill tone="red">{row.duty_status}</Pill>{row.is_punch_missing ? <Pill tone="amber">Punch Miss</Pill> : null}</td><td className="num">{number(row.working_hours)}</td><td className="num">{number(row.extra_hours)}</td><td><select className="hr-inline-input" value={values.credit ?? row.suggested_duty_credit ?? 1} onChange={event => setDutyInputs(current => ({ ...current, [row.id]: { ...current[row.id], credit: event.target.value, ...(event.target.value === 'A' ? { ot: 0 } : {}) } }))}><option value="A">A (Absent)</option>{[1, 1.5, 2, 2.5, 3].map(value => <option value={value} key={value}>{value}P</option>)}</select></td><td><input className="hr-inline-input" type="number" min="0" max="16" step=".25" disabled={(values.credit ?? row.suggested_duty_credit) === 'A'} value={(values.credit ?? row.suggested_duty_credit) === 'A' ? 0 : values.ot ?? row.calculated_ot_hours ?? 0} onChange={event => setDutyInputs(current => ({ ...current, [row.id]: { ...current[row.id], ot: event.target.value } }))} /></td><td><ActionButtons row={row} approve="approve_duty" reject="reject_duty" run={runApproval} busy={actionBusy} /></td></tr>;
    }) : <TableEmpty columns={10} text="All caught up. No pending duty requests." />}</tbody></table></div></Panel>
  </div>;
}

function DirectoryTab({ data, rows, filters, setters }) {
  return <Panel title="Searchable Master Directory" meta={`${number(rows.length)} records`} full><div className="hr-filter-bar"><select value={filters.deptFilter} onChange={event => setters.setDeptFilter(event.target.value)}><option value="">All Departments</option>{(data?.dept_cost_center || []).map(row => <option key={row.dept}>{row.dept}</option>)}</select><select value={filters.typeFilter} onChange={event => setters.setTypeFilter(event.target.value)}><option value="">All Tiers</option><option value="PERMANENT">PERMANENT</option><option value="TEMPORARY">TEMPORARY</option><option value="CONTRACT">CONTRACT</option></select><select value={filters.statusFilter} onChange={event => setters.setStatusFilter(event.target.value)}><option value="">All States</option><option value="ACTIVE">ACTIVE</option><option value="RESIGNED">RESIGNED</option></select><input value={filters.search} onChange={event => setters.setSearch(event.target.value)} placeholder="Search name, ID, mobile, department…" /></div><div className="enterprise-table-wrap hr-directory-table"><table className="enterprise-table"><thead><tr><th>Emp ID</th><th>Name</th><th>Department</th><th>Designation</th><th>Type</th><th>Reporting To</th><th>Mobile</th><th className="num">Net Salary</th><th>Joining Date</th><th>Status</th></tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={row.employee_id}><td><strong>{row.employee_id}</strong></td><td><span className="hr-employee"><span style={{ '--avatar-hue': `${index * 47 % 360}` }}>{String(row.employee_name || '?')[0]}</span><strong>{row.employee_name}</strong></span></td><td>{row.department}</td><td>{row.designation}</td><td><Pill tone={['CONTRACT', 'CONTRACTOR'].includes(row.employee_type) ? 'amber' : 'blue'}>{row.employee_type}</Pill></td><td>{row.reporting_to}</td><td>{row.mobile}</td><td className="num">{money(row.current_salary)}</td><td>{formatDate(row.joining_date)}</td><td><Pill tone={row.status === 'ACTIVE' ? 'green' : 'red'}>{row.status}</Pill></td></tr>) : <TableEmpty columns={10} text="No employees found." />}</tbody></table></div></Panel>;
}

function AnalyticsTab({ data }) {
  return <div className="enterprise-grid hr-grid">
    <Panel title="Monthly Attendance Trend (30 Days)" full><div className="hr-analytics-chart"><Bars labels={data?.attendance_trend_labels || []} primary={data?.attendance_trend_data || []} valueLabels={data?.attendance_trend_counts || []} showValues /></div></Panel>
    <Panel title="Workforce Composition"><ProgressList rows={(data?.gender_labels || []).map((label, index) => ({ label, value: data?.gender_values?.[index] || 0 }))} labelKey="label" valueKey="value" /><InfoRows rows={[['Permanent (Regular)', `${number(data?.perm_pct)}%`], ['Contract Labour', `${number(data?.contract_pct)}%`, 'amber']]} /></Panel>
    <Panel title="Attrition & Growth"><InfoRows rows={[['Attrition Rate (YTD)', `${number(data?.attrition_rate)}%`, Number(data?.attrition_rate) <= 5 ? 'green' : 'red'], ['New Joinings (This Month)', number(data?.new_joinings_month), 'blue'], ['Resignations (This Month)', number(data?.resignations_month), 'red'], ['Increments Given (YTD)', number(data?.increments_ytd), 'green']]} /><Gauge label="Retention Rate" value={100 - Number(data?.attrition_rate || 0)} color="#16a34a" /></Panel>
    <Panel title="Department Headcount Distribution" full><ProgressList rows={data?.dept_cost_center || []} labelKey="dept" valueKey="emps" /></Panel>
    <Panel title="Blood Group Distribution" full><ProgressList rows={data?.blood_groups || []} labelKey="group" valueKey="count" color="#dc2626" /></Panel>
  </div>;
}

function StatTiles({ rows }) {
  return <div className="hr-stat-tiles">{rows.map(([label, value, tone = 'blue']) => <div className={tone} key={label}><span>{label}</span><strong>{typeof value === 'number' ? number(value) : value ?? 0}</strong></div>)}</div>;
}

function Gauge({ label, value, color }) {
  const safe = Math.max(0, Math.min(100, Number(value || 0)));
  return <div className="hr-gauge"><div><span>{label}</span><strong>{number(safe)}%</strong></div><span><i style={{ width: `${safe}%`, background: color }}></i></span></div>;
}

function InfoRows({ rows }) {
  return <div className="hr-info-rows">{rows.map(([label, value, tone = '']) => <div key={label}><span>{label}</span><strong className={tone}>{value}</strong></div>)}</div>;
}

function ActionButtons({ row, approve, reject, run, busy }) {
  return <div className="hr-actions"><button disabled={Boolean(busy)} type="button" className="approve" onClick={() => run(approve, row)}>{busy === `${approve}-${row.id}` ? 'Saving…' : 'Approve'}</button><button disabled={Boolean(busy)} type="button" className="reject" onClick={() => run(reject, row)}>Reject</button></div>;
}

function formatDate(value, options = { day: '2-digit', month: '2-digit', year: 'numeric' }) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-IN', options).format(date);
}
