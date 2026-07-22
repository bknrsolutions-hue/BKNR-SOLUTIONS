import React, { useEffect, useMemo, useState } from 'react';
import { sessionFetch } from '../../utils/sessionFetch';
import './LabourManagement.css';

const today = () => new Date().toISOString().slice(0, 10);
const blankWorker = () => ({ worker_name: '', department: '', mobile: '', aadhar_number: '', gender: '', joining_date: today(), production_at: '', remarks: '' });

export default function KgBasisCompanyLabour() {
  const [activeTab, setActiveTab] = useState('registration');
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [workers, setWorkers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [members, setMembers] = useState([blankWorker()]);
  const [locations, setLocations] = useState([]);
  const [punchMode, setPunchMode] = useState('IN');
  const [punchId, setPunchId] = useState('');
  const [punchQueue, setPunchQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [punching, setPunching] = useState(false);
  const [notice, setNotice] = useState(null);

  const notify = (message, type = 'success') => {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 3500);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await sessionFetch('/attendance/kg-basis-labour?format=json');
      const data = await response.json();
      if (!response.ok || data.status !== 'success') throw new Error(data.error || 'Unable to load KG workers');
      setWorkers(data.workers || []);
      setAttendance(data.attendance || []);
      setLocations(data.lookups?.locations || []);
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const updateMember = (index, key, value) => {
    setMembers(current => current.map((member, rowIndex) => rowIndex === index ? { ...member, [key]: value } : member));
  };

  const saveWorkers = async event => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await sessionFetch('/attendance/kg-basis-labour/registration/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ members })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save KG workers');
      const ids = (data.records || []).map(row => row.worker_id).join(', ');
      notify(`Saved ${data.records?.length || members.length} workers. IDs: ${ids}`);
      setMembers([blankWorker()]);
      setRegistrationOpen(false);
      await loadData();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const addPunchIds = () => {
    const incoming = punchId.split(/[\s,]+/).map(value => value.trim().toUpperCase()).filter(Boolean);
    if (!incoming.length) return;
    const resolved = incoming.map(value => {
      const suffix = /^\d+$/.test(value) ? String(Number(value)).padStart(5, '0') : '';
      const worker = suffix
        ? workers.find(row => /^[A-Z]K\d{5}$/.test(row.worker_id || '') && row.worker_id.endsWith(suffix))
        : workers.find(row => row.worker_id === value);
      return worker ? { fullId: worker.worker_id, name: worker.worker_name } : null;
    }).filter(Boolean);
    if (!resolved.length) return notify('Worker ID not found', 'error');
    setPunchQueue(current => {
      const queued = new Map(current.map(item => [item.fullId, item]));
      resolved.forEach(item => queued.set(item.fullId, item));
      return [...queued.values()];
    });
    if (resolved.length < incoming.length) notify(`${incoming.length - resolved.length} Worker ID(s) not found`, 'error');
    setPunchId('');
  };

  const punchWorkers = async () => {
    const workerIds = punchQueue.map(item => item.fullId);
    if (!workerIds.length) return notify('Enter or scan at least one KG Worker ID', 'error');
    setPunching(true);
    try {
      const response = await sessionFetch('/attendance/kg-basis-labour/punch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_ids: workerIds, action: punchMode, location: localStorage.getItem('plant_location_filter') || '' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Punch failed');
      const failed = data.errors?.length || 0;
      notify(failed ? `${data.message}. ${failed} ID(s) skipped.` : data.message, failed ? 'error' : 'success');
      setPunchId('');
      setPunchQueue([]);
      await loadData();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setPunching(false);
    }
  };

  const deleteWorker = async id => {
    if (!window.confirm('Delete this KG worker?')) return;
    const response = await sessionFetch(`/attendance/kg-basis-labour/worker/delete/${id}`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) return notify(data.error || 'Unable to delete worker', 'error');
    notify('Worker deleted');
    loadData();
  };

  const summary = useMemo(() => ({
    registered: workers.filter(worker => worker.status === 'ACTIVE').length,
    inside: attendance.filter(row => row.status === 'INSIDE').length,
  }), [workers, attendance]);

  return <div className="labour-page">
    {notice && <div className={`labour-notice ${notice.type}`}>{notice.message}</div>}
    <div className="labour-heading"><div><h1>KG Basis Company Workers</h1><p>Worker registration and daily IN / OUT punching</p></div><div className="labour-counts"><span>{summary.registered} Registered</span><span>{summary.inside} Inside</span></div></div>
    <div className="labour-tabs" role="tablist">
      <button className={activeTab === 'registration' ? 'active' : ''} onClick={() => setActiveTab('registration')}>Registration</button>
      <button className={activeTab === 'punching' ? 'active' : ''} onClick={() => setActiveTab('punching')}>Punching</button>
    </div>

    {activeTab === 'registration' ? <>
      <div className="labour-section registration-toggle"><div className="labour-section-title"><div><h2>KG Basis Worker Registration</h2><p>Open the form only when new workers need to be registered.</p></div><button type="button" className="labour-btn primary" onClick={() => setRegistrationOpen(open => !open)}>{registrationOpen ? 'Close Form' : '+ New Registration'}</button></div></div>
      {registrationOpen && <form className="labour-section registration-form" onSubmit={saveWorkers}>
        <div className="registration-form-head"><div className="registration-form-icon"><i className="fa-solid fa-users" /></div><div className="registration-form-copy"><h2>Bulk KG Worker Registration</h2><p>Fill one section per worker. IDs are generated automatically.</p></div><div className="registration-form-badge">{members.length} Worker{members.length > 1 ? 's' : ''}</div><button type="button" className="labour-btn add-member-btn" onClick={() => setMembers(rows => [...rows, blankWorker()])}><i className="fa-solid fa-plus" /> Add Worker</button></div>
        <div className="registration-help"><span><i className="fa-solid fa-circle-info" /> Worker name and joining date are required.</span><span>ID format: Company + K + 5 digits</span></div>
        <div className="member-form-list">{members.map((member, index) => <section className="member-form-section" key={index}>
          <div className="member-form-title"><span className="member-row-number">{index + 1}</span><strong>Worker {index + 1}</strong><button type="button" className="labour-icon-btn" title="Remove worker" disabled={members.length === 1} onClick={() => setMembers(rows => rows.filter((_, rowIndex) => rowIndex !== index))}><i className="fa-solid fa-trash-can" /></button></div>
          <div className="member-form-grid">
            <Field label="Worker Name *"><input required placeholder="Enter full name" value={member.worker_name} onChange={event => updateMember(index, 'worker_name', event.target.value)} /></Field>
            <Field label="Department"><input list="kg-worker-departments" placeholder="Select or enter department" value={member.department} onChange={event => updateMember(index, 'department', event.target.value)} /></Field>
            <Field label="Plant / Location"><select value={member.production_at} onChange={event => updateMember(index, 'production_at', event.target.value)}><option value="">Select Location</option>{locations.map(value => <option key={value}>{value}</option>)}</select></Field>
            <Field label="Joining Date *"><input type="date" required value={member.joining_date} onChange={event => updateMember(index, 'joining_date', event.target.value)} /></Field>
            <Field label="Mobile Number"><input inputMode="tel" maxLength="15" placeholder="Enter mobile" value={member.mobile} onChange={event => updateMember(index, 'mobile', event.target.value)} /></Field>
            <Field label="Aadhaar Number"><input inputMode="numeric" maxLength="12" placeholder="12 digit Aadhaar" value={member.aadhar_number} onChange={event => updateMember(index, 'aadhar_number', event.target.value.replace(/\D/g, ''))} /></Field>
            <Field label="Gender"><select value={member.gender} onChange={event => updateMember(index, 'gender', event.target.value)}><option value="">Select Gender</option><option>Male</option><option>Female</option><option>Other</option></select></Field>
            <Field label="Remarks"><input placeholder="Optional remarks" value={member.remarks} onChange={event => updateMember(index, 'remarks', event.target.value)} /></Field>
          </div>
        </section>)}</div>
        <datalist id="kg-worker-departments"><option value="Peeling" /><option value="Deheading" /></datalist>
        <div className="registration-form-footer"><button type="button" className="labour-btn secondary" onClick={() => setMembers([blankWorker()])}><i className="fa-solid fa-rotate-left" /> Clear</button><button type="button" className="labour-btn secondary" onClick={() => setRegistrationOpen(false)}>Cancel</button><button className="labour-btn primary save-members-btn" disabled={saving}><i className="fa-solid fa-floppy-disk" /> {saving ? 'Saving...' : `Save ${members.length} Worker${members.length > 1 ? 's' : ''}`}</button></div>
      </form>}
      <div className="labour-section"><div className="labour-section-title"><div><h2>KG Basis Worker Register</h2><p>{workers.length} registered workers</p></div></div><div className="labour-table-scroll"><table className="labour-table"><thead><tr><th>Worker ID</th><th>Name</th><th>Department</th><th>Mobile</th><th>Location</th><th>Joining</th><th>Status</th><th>Meta Date</th><th>Meta User</th><th>Action</th></tr></thead><tbody>{loading ? <tr><td colSpan="10" className="labour-empty">Loading register...</td></tr> : workers.length ? workers.map(worker => <tr key={worker.id}><td><strong>{worker.worker_id}</strong></td><td>{worker.worker_name}</td><td>{worker.department || '-'}</td><td>{worker.mobile || '-'}</td><td>{worker.production_at || '-'}</td><td>{worker.joining_date}</td><td>{worker.status}</td><td>{worker.date || '-'}</td><td>{worker.email || '-'}</td><td><button className="labour-link danger" onClick={() => deleteWorker(worker.id)}>Delete</button></td></tr>) : <tr><td colSpan="10" className="labour-empty">No workers registered</td></tr>}</tbody></table></div></div>
    </> : <div className="labour-section contract-terminal">
      <div className="labour-section-title"><div><h2>KG Basis Worker Punching</h2><p>Select IN or OUT, scan multiple Worker IDs, then punch all at once.</p></div><div className="terminal-status"><span>{summary.inside} Inside</span><span>{attendance.filter(row => row.status === 'CLOSED').length} Completed</span></div></div>
      <div className="punch-mode-row"><button type="button" className={`punch-mode in ${punchMode === 'IN' ? 'active' : ''}`} onClick={() => setPunchMode('IN')}><i className="fa-solid fa-right-to-bracket" /> IN</button><button type="button" className={`punch-mode out ${punchMode === 'OUT' ? 'active' : ''}`} onClick={() => setPunchMode('OUT')}><i className="fa-solid fa-right-from-bracket" /> OUT</button></div>
      <div className="contract-punch-row bulk"><label className="contract-id-input"><span>Worker Number or Full ID</span><input autoFocus value={punchId} placeholder="1, 999 or BK00001" onChange={event => setPunchId(event.target.value.toUpperCase())} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addPunchIds(); } }} /></label><button type="button" className="labour-btn secondary queue-add" onClick={addPunchIds}>Add ID</button><button type="button" className={`punch-btn ${punchMode.toLowerCase()}`} disabled={punching || !punchQueue.length} onClick={punchWorkers}>{punching ? 'Saving...' : `Punch ${punchQueue.length} ${punchMode}`}</button></div>
      <div className="punch-queue">{punchQueue.length ? punchQueue.map(item => <button type="button" key={item.fullId} onClick={() => setPunchQueue(queue => queue.filter(value => value.fullId !== item.fullId))}><strong>{item.fullId}</strong> · {item.name} <span>×</span></button>) : <span>Example: enter 1 for 00001, or 999 for 00999. Added Worker ID and name appear here.</span>}</div>
      <div className="labour-table-scroll"><table className="labour-table punch-table"><thead><tr><th>Worker ID</th><th>Name</th><th>Location</th><th>IN</th><th>OUT</th><th>Status</th></tr></thead><tbody>{loading ? <tr><td colSpan="6" className="labour-empty">Loading punches...</td></tr> : attendance.length ? attendance.map(row => <tr key={row.id}><td><strong>{row.worker_id}</strong></td><td>{row.worker_name}</td><td>{row.production_at || '-'}</td><td>{formatPunchTime(row.in_time)}</td><td>{formatPunchTime(row.out_time)}</td><td><span className={`punch-status ${row.status === 'INSIDE' ? 'inside' : 'closed'}`}>{row.status === 'INSIDE' ? 'INSIDE' : 'OUT'}</span></td></tr>) : <tr><td colSpan="6" className="labour-empty">No KG worker punches today</td></tr>}</tbody></table></div>
    </div>}
  </div>;
}

function Field({ label, children }) { return <label className="member-form-field"><span>{label}</span>{children}</label>; }
function formatPunchTime(value) { if (!value) return '-'; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? String(value).slice(11, 19) : parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
