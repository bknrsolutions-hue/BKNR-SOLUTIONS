import React, { useCallback, useEffect, useState } from 'react';
import { sessionFetch } from '../../utils/sessionFetch';
import './LabourManagement.css';

const today = () => new Date().toISOString().slice(0, 10);
const currentTime = () => new Date().toTimeString().slice(0, 5);
const blankVisitor = () => ({ visitor_name: '', mobile: '', organization: '', purpose: '', person_to_meet: '', person_to_meet_email: '', visit_date: today(), in_time: currentTime(), production_at: '', remarks: '' });
const blankDayWorker = () => ({ worker_name: '', purpose: '', approved_by_name: '', approved_by_email: '', work_date: today(), in_time: currentTime(), production_at: '', remarks: '' });

export default function VisitorsDayWorkers() {
  const [activeTab, setActiveTab] = useState('visitors');
  const [visitors, setVisitors] = useState([]);
  const [dayWorkers, setDayWorkers] = useState([]);
  const [visitorForm, setVisitorForm] = useState(blankVisitor());
  const [workerForm, setWorkerForm] = useState(blankDayWorker());
  const [lookups, setLookups] = useState({ purposes: [], locations: [], users: [] });
  const [dayCharges, setDayCharges] = useState({});
  const [canEditLockedCharge, setCanEditLockedCharge] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [chargeAudits, setChargeAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [outBusy, setOutBusy] = useState('');
  const [notice, setNotice] = useState(null);

  const notify = useCallback((message, type = 'success') => {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 3500);
  }, []);

  const loadData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const response = await sessionFetch('/attendance/visitors-day-workers?format=json');
      const data = await response.json();
      if (!response.ok || data.status !== 'success') throw new Error(data.error || 'Unable to load entries');
      setVisitors(data.visitors || []);
      setDayWorkers(data.day_workers || []);
      setLookups(data.lookups || { purposes: [], locations: [], users: [] });
      setDayCharges(Object.fromEntries((data.day_workers || []).map(row => [row.id, row.day_charge ?? 0])));
      setCanEditLockedCharge(Boolean(data.permissions?.can_edit_locked_day_charge));
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    const initialTimeout = window.setTimeout(loadData, 0);
    const refreshInterval = window.setInterval(() => loadData(false), 10000);
    const reloadAfterApproval = () => loadData();
    window.addEventListener('svbk:approval-updated', reloadAfterApproval);
    return () => {
      window.clearTimeout(initialTimeout);
      window.clearInterval(refreshInterval);
      window.removeEventListener('svbk:approval-updated', reloadAfterApproval);
    };
  }, [loadData]);

  const submit = async (event, type) => {
    event.preventDefault();
    setSaving(true);
    const payload = type === 'visitor' ? visitorForm : workerForm;
    try {
      const response = await sessionFetch(`/attendance/visitors-day-workers/${type}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save entry');
      notify(type === 'visitor' ? 'Visitor approval sent' : 'Day worker approval sent');
      if (type === 'visitor') setVisitorForm(blankVisitor()); else setWorkerForm(blankDayWorker());
      await loadData();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const markOut = async (type, id) => {
    const busyKey = `${type}-${id}`;
    setOutBusy(busyKey);
    try {
      const response = await sessionFetch(`/attendance/visitors-day-workers/${type}/${id}/out`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to mark OUT');
      if (type === 'visitor') {
        setVisitors(rows => rows.map(row => row.id === id ? { ...row, out_time: data.out_time, status: 'OUT' } : row));
      } else {
        setDayWorkers(rows => rows.map(row => row.id === id ? { ...row, out_time: data.out_time, status: 'CLOSED' } : row));
      }
      notify(`OUT time saved: ${String(data.out_time).slice(0, 5)}`);
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setOutBusy('');
    }
  };

  const remove = async (type, id) => {
    if (!window.confirm('Delete this entry?')) return;
    const response = await sessionFetch(`/attendance/visitors-day-workers/${type}/delete/${id}`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) return notify(data.error || 'Unable to delete entry', 'error');
    notify('Entry deleted');
    loadData();
  };

  const saveDayCharge = async id => {
    const response = await sessionFetch(`/attendance/visitors-day-workers/day-worker/${id}/charge`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ day_charge: dayCharges[id] })
    });
    const data = await response.json();
    if (!response.ok) return notify(data.error || 'Unable to update amount', 'error');
    notify('Day charge updated');
    loadData();
  };

  const openChargeAudit = async () => {
    setAuditOpen(true);
    setAuditLoading(true);
    try {
      const response = await sessionFetch('/attendance/visitors-day-workers/day-worker-charge-audit');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load audit trail');
      setChargeAudits(data.audits || []);
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setAuditLoading(false);
    }
  };

  return <div className="labour-page visitors-workers-page">
    {notice && <div className={`labour-notice ${notice.type}`}>{notice.message}</div>}
    <div className="labour-heading"><div><h1>Visitors & Day Workers</h1></div><div className="labour-heading-actions"><button type="button" className="labour-audit-btn" onClick={openChargeAudit}><i className="fa-solid fa-clock-rotate-left" /> Audit Trail</button><div className="labour-counts"><span>{visitors.length} Visitors</span><span>{dayWorkers.length} Day Workers</span></div></div></div>
    <div className="labour-tabs" role="tablist">
      <button className={activeTab === 'visitors' ? 'active' : ''} onClick={() => setActiveTab('visitors')}>Visitors</button>
      <button className={activeTab === 'day-workers' ? 'active' : ''} onClick={() => setActiveTab('day-workers')}>Day Workers</button>
    </div>

    {activeTab === 'visitors' ? <>
      <form className="labour-section visitor-entry-form" onSubmit={event => submit(event, 'visitor')}>
        <div className="labour-section-title"><div><h2>Visitor Entry Form</h2></div></div>
        <div className="member-form-grid standalone-form-grid">
          <Field label="Visitor Name *"><input required value={visitorForm.visitor_name} onChange={event => setVisitorForm({ ...visitorForm, visitor_name: event.target.value })} /></Field>
          <Field label="Mobile"><input inputMode="tel" maxLength="15" value={visitorForm.mobile} onChange={event => setVisitorForm({ ...visitorForm, mobile: event.target.value })} /></Field>
          <Field label="Organization"><input value={visitorForm.organization} onChange={event => setVisitorForm({ ...visitorForm, organization: event.target.value })} /></Field>
          <Field label="Purpose *"><input required list="visitor-purpose-list" value={visitorForm.purpose} onChange={event => setVisitorForm({ ...visitorForm, purpose: event.target.value })} /></Field>
          <Field label="Person To Meet *"><UserSelect required users={lookups.users} value={visitorForm.person_to_meet_email} onChange={user => setVisitorForm({ ...visitorForm, person_to_meet: user?.name || '', person_to_meet_email: user?.email || '' })} /></Field>
          <Field label="Visit Date *"><input type="date" required value={visitorForm.visit_date} onChange={event => setVisitorForm({ ...visitorForm, visit_date: event.target.value })} /></Field>
          <Field label="IN Time *"><input type="time" required value={visitorForm.in_time} onChange={event => setVisitorForm({ ...visitorForm, in_time: event.target.value })} /></Field>
          <Field label="Plant / Location"><select value={visitorForm.production_at} onChange={event => setVisitorForm({ ...visitorForm, production_at: event.target.value })}><option value="">Select Location</option>{lookups.locations.map(value => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Remarks"><input value={visitorForm.remarks} onChange={event => setVisitorForm({ ...visitorForm, remarks: event.target.value })} /></Field>
        </div>
        <datalist id="visitor-purpose-list">{lookups.purposes.map(value => <option key={value} value={value} />)}</datalist>
        <FormActions saving={saving} onClear={() => setVisitorForm(blankVisitor())} label="Save Visitor" />
      </form>
      <EntryTable loading={loading} title="Visitor Register" columns={['Date', 'Visitor', 'Mobile', 'Organization', 'Purpose', 'Meet', 'Approval', 'Location', 'IN', 'OUT', 'Status', 'Meta User', 'Action']}>
        {visitors.map(row => <tr key={row.id}><td>{row.visit_date}</td><td><strong>{row.visitor_name}</strong></td><td>{row.mobile || '-'}</td><td>{row.organization || '-'}</td><td>{row.purpose}</td><td>{row.person_to_meet || '-'}</td><td><ApprovalBadge status={row.approval_status} /></td><td>{row.production_at || '-'}</td><td>{row.in_time || '-'}</td><td>{row.out_time || '-'}</td><td>{row.status}</td><td>{row.email || '-'}</td><td><ExitActions type="visitor" row={row} outBusy={outBusy} markOut={markOut} remove={remove} /></td></tr>)}
      </EntryTable>
    </> : <>
      <form className="labour-section visitor-entry-form" onSubmit={event => submit(event, 'day-worker')}>
        <div className="labour-section-title"><div><h2>Day Worker Entry Form</h2></div></div>
        <div className="member-form-grid standalone-form-grid">
          <Field label="Worker Name *"><input required value={workerForm.worker_name} onChange={event => setWorkerForm({ ...workerForm, worker_name: event.target.value })} /></Field>
          <Field label="Purpose *"><input required list="worker-purpose-list" value={workerForm.purpose} onChange={event => setWorkerForm({ ...workerForm, purpose: event.target.value })} /></Field>
          <Field label="Approved By *"><UserSelect required users={lookups.users} value={workerForm.approved_by_email} onChange={user => setWorkerForm({ ...workerForm, approved_by_name: user?.name || '', approved_by_email: user?.email || '' })} /></Field>
          <Field label="Work Date *"><input type="date" required value={workerForm.work_date} onChange={event => setWorkerForm({ ...workerForm, work_date: event.target.value })} /></Field>
          <Field label="IN Time *"><input type="time" required value={workerForm.in_time} onChange={event => setWorkerForm({ ...workerForm, in_time: event.target.value })} /></Field>
          <Field label="Plant / Location"><select value={workerForm.production_at} onChange={event => setWorkerForm({ ...workerForm, production_at: event.target.value })}><option value="">Select Location</option>{lookups.locations.map(value => <option key={value}>{value}</option>)}</select></Field>
          <Field label="Remarks"><input value={workerForm.remarks} onChange={event => setWorkerForm({ ...workerForm, remarks: event.target.value })} /></Field>
        </div>
        <datalist id="worker-purpose-list">{lookups.purposes.map(value => <option key={value} value={value} />)}</datalist>
        <FormActions saving={saving} onClear={() => setWorkerForm(blankDayWorker())} label="Save Day Worker" />
      </form>
      <EntryTable loading={loading} title="Day Worker Register" columns={['Date', 'Worker', 'Purpose', 'Approved By', 'Approval', 'Location', 'IN', 'OUT', 'Day Charge ₹', 'Status', 'Meta Date', 'Meta User', 'Action']}>
        {dayWorkers.map(row => { const chargeLocked = Boolean(row.day_charge_locked); const chargeReadOnly = chargeLocked && !canEditLockedCharge; return <tr key={row.id}><td>{row.work_date}</td><td><strong>{row.worker_name}</strong></td><td>{row.purpose}</td><td>{row.approved_by_name || '-'}</td><td><ApprovalBadge status={row.approval_status} /></td><td>{row.production_at || '-'}</td><td>{row.in_time || '-'}</td><td>{row.out_time || '-'}</td><td><div className={`amount-editor ${chargeLocked ? 'locked' : ''}`}><input disabled={chargeReadOnly} type="number" min="0" step="0.01" value={dayCharges[row.id] ?? 0} onChange={event => setDayCharges(current => ({ ...current, [row.id]: event.target.value }))} />{chargeReadOnly ? <span className="charge-lock"><i className="fa-solid fa-lock" /> Locked</span> : <button onClick={() => saveDayCharge(row.id)}>{chargeLocked ? 'Admin Save' : 'Save & Lock'}</button>}</div></td><td>{row.status}</td><td>{row.date || '-'}</td><td>{row.email || '-'}</td><td><ExitActions type="day-worker" row={row} outBusy={outBusy} markOut={markOut} remove={remove} /></td></tr>; })}
      </EntryTable>
    </>}
    {auditOpen && <div className="labour-audit-backdrop" onClick={() => setAuditOpen(false)}><aside className="labour-audit-panel" onClick={event => event.stopPropagation()}><div className="labour-audit-head"><div><span>Day Worker Charges</span><h2>Audit Trail</h2></div><button type="button" onClick={() => setAuditOpen(false)}>×</button></div><div className="labour-audit-list">{auditLoading ? <div className="labour-empty">Loading audit trail...</div> : chargeAudits.length ? chargeAudits.map(audit => <article key={audit.id}><strong>{audit.worker_name} · {audit.work_date}</strong><p>₹{Number(audit.old_value || 0).toFixed(2)} → ₹{Number(audit.new_value || 0).toFixed(2)}</p><small>{audit.edited_by} · {String(audit.edited_at || '').replace('T', ' ').slice(0, 19)}</small></article>) : <div className="labour-empty">No charge changes found</div>}</div></aside></div>}
  </div>;
}

function Field({ label, children }) { return <label className="member-form-field"><span>{label}</span>{children}</label>; }
function UserSelect({ users, value, onChange, required }) { return <select required={required} value={value} onChange={event => onChange(users.find(user => user.email === event.target.value))}><option value="">Select User</option>{users.map(user => <option key={user.email} value={user.email}>{user.name}{user.designation ? ` — ${user.designation}` : ''}</option>)}</select>; }
function ApprovalBadge({ status }) { const value = status || 'PENDING'; return <span className={`approval-status ${value.toLowerCase()}`}>{value}</span>; }
function ExitActions({ type, row, outBusy, markOut, remove }) { const busyKey = `${type}-${row.id}`; return <div className="row-action-group">{row.out_time ? <span className="out-saved">OUT Saved</span> : row.approval_status === 'APPROVED' ? <button className="out-save" disabled={outBusy === busyKey} onClick={() => markOut(type, row.id)}>{outBusy === busyKey ? 'Saving...' : 'OUT & Save'}</button> : <span className={`exit-wait ${row.approval_status === 'REJECTED' ? 'rejected' : ''}`}>{row.approval_status === 'REJECTED' ? 'Rejected' : 'Awaiting Approval'}</span>}<button className="danger" disabled={Boolean(row.out_time)} onClick={() => remove(type, row.id)}>Delete</button></div>; }
function FormActions({ saving, onClear, label }) { return <div className="labour-form-actions"><button type="button" className="labour-btn secondary" onClick={onClear}>Clear</button><button className="labour-btn primary" disabled={saving}>{saving ? 'Saving...' : label}</button></div>; }
function EntryTable({ loading, title, columns, children }) { return <div className="labour-section"><div className="labour-section-title"><div><h2>{title}</h2></div></div><div className="labour-table-scroll"><table className="labour-table"><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={columns.length} className="labour-empty">Loading entries...</td></tr> : React.Children.count(children) ? children : <tr><td colSpan={columns.length} className="labour-empty">No entries found</td></tr>}</tbody></table></div></div>; }
