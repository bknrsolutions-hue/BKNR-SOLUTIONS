import React, { useEffect, useMemo, useState } from 'react';
import { sessionFetch } from '../../utils/sessionFetch';
import './LabourManagement.css';

const today = () => new Date().toISOString().slice(0, 10);

const blankMember = () => ({
  labour_name: '', contractor_name: '', mobile: '', aadhar_number: '', gender: '',
  joining_date: today(), department: '', production_at: '', remarks: ''
});

export default function LabourManagement() {
  const [activeTab, setActiveTab] = useState('registration');
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [contractRows, setContractRows] = useState([]);
  const [contractAttendance, setContractAttendance] = useState([]);
  const [lookups, setLookups] = useState({ contractors: [], purposes: [], locations: [] });
  const [members, setMembers] = useState([blankMember()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [punching, setPunching] = useState(false);
  const [punchId, setPunchId] = useState('');
  const [punchMode, setPunchMode] = useState('IN');
  const [punchQueue, setPunchQueue] = useState([]);
  const [notice, setNotice] = useState(null);

  const notify = (message, type = 'success') => {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 3500);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await sessionFetch('/attendance/labour-management?format=json');
      const data = await response.json();
      if (!response.ok || data.status !== 'success') throw new Error(data.error || 'Unable to load worker register');
      setContractRows(data.contract_labour || []);
      setContractAttendance(data.contract_attendance || []);
      setLookups(data.lookups || { contractors: [], purposes: [], locations: [] });
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

  const saveContractMembers = async event => {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await sessionFetch('/attendance/labour-management/contract/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ members })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save members');
      const ids = (data.records || []).map(row => row.labour_id).join(', ');
      notify(`Saved ${data.records?.length || members.length} members. IDs: ${ids}`);
      setMembers([blankMember()]);
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
        ? contractRows.find(row => /^[A-Z]{2}\d{5}$/.test(row.labour_id || '') && row.labour_id.endsWith(suffix))
        : contractRows.find(row => row.labour_id === value);
      return worker ? { fullId: worker.labour_id, name: worker.labour_name } : null;
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

  const punchContractLabour = async () => {
    const labourIds = punchQueue.map(item => item.fullId);
    if (!labourIds.length) return notify('Enter or scan at least one Contract Worker ID', 'error');
    setPunching(true);
    try {
      const response = await sessionFetch('/attendance/labour-management/contract/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          labour_ids: labourIds,
          action: punchMode,
          location: localStorage.getItem('plant_location_filter') || '',
        }),
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

  const deleteRow = async (group, id) => {
    if (!window.confirm('Delete this worker entry?')) return;
    try {
      const response = await sessionFetch(`/attendance/labour-management/${group}/delete/${id}`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to delete entry');
      notify('Worker entry deleted');
      await loadData();
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const summary = useMemo(() => ({
    activeContract: contractRows.filter(row => row.status === 'ACTIVE').length,
    inside: contractAttendance.filter(row => row.status === 'INSIDE').length,
  }), [contractRows, contractAttendance]);

  return (
    <div className="labour-page">
      {notice && <div className={`labour-notice ${notice.type}`}>{notice.message}</div>}
      <div className="labour-heading">
        <div><h1>Contract Workers</h1><p>Registration and daily IN / OUT punching</p></div>
        <div className="labour-counts"><span>{summary.activeContract} Registered</span><span>{summary.inside} Inside</span></div>
      </div>

      <div className="labour-tabs" role="tablist">
        <button className={activeTab === 'registration' ? 'active' : ''} onClick={() => setActiveTab('registration')}>Registration</button>
        <button className={activeTab === 'punching' ? 'active' : ''} onClick={() => setActiveTab('punching')}>Punching</button>
      </div>

      {activeTab === 'registration' ? (
        <>
          <div className="labour-section registration-toggle">
            <div className="labour-section-title">
              <div><h2>Contract Worker Registration</h2><p>Open the form only when new workers need to be registered.</p></div>
              <button type="button" className="labour-btn primary" onClick={() => setRegistrationOpen(open => !open)}>{registrationOpen ? 'Close Form' : '+ New Registration'}</button>
            </div>
          </div>

          {registrationOpen && <form className="labour-section registration-form" onSubmit={saveContractMembers}>
            <div className="registration-form-head">
              <div className="registration-form-icon"><i className="fa-solid fa-users" /></div>
              <div className="registration-form-copy"><h2>Bulk Worker Registration</h2><p>Fill one section per worker. IDs are generated automatically after saving.</p></div>
              <div className="registration-form-badge">{members.length} Member{members.length > 1 ? 's' : ''}</div>
              <button type="button" className="labour-btn add-member-btn" onClick={() => setMembers(rows => [...rows, blankMember()])}><i className="fa-solid fa-plus" /> Add Member</button>
            </div>
            <div className="registration-help"><span><i className="fa-solid fa-circle-info" /> Name, contractor and joining date are required.</span><span>ID format: Company + Contractor + 5 digits</span></div>
            <div className="member-form-list">
              {members.map((member, index) => <section className="member-form-section" key={index}>
                <div className="member-form-title"><span className="member-row-number">{index + 1}</span><strong>Worker {index + 1}</strong><button type="button" className="labour-icon-btn" title="Remove worker" disabled={members.length === 1} onClick={() => setMembers(rows => rows.filter((_, rowIndex) => rowIndex !== index))}><i className="fa-solid fa-trash-can" /></button></div>
                <div className="member-form-grid">
                  <Field label="Worker Name *"><input required placeholder="Enter full name" value={member.labour_name} onChange={e => updateMember(index, 'labour_name', e.target.value)} /></Field>
                  <Field label="Contractor *"><select required value={member.contractor_name} onChange={e => updateMember(index, 'contractor_name', e.target.value)}><option value="">Select Contractor</option>{lookups.contractors.map(value => <option key={value}>{value}</option>)}</select></Field>
                  <Field label="Department"><input list="contract-worker-departments" placeholder="Select or enter department" value={member.department} onChange={e => updateMember(index, 'department', e.target.value)} /></Field>
                  <Field label="Plant / Location"><select value={member.production_at} onChange={e => updateMember(index, 'production_at', e.target.value)}><option value="">Select Location</option>{lookups.locations.map(value => <option key={value}>{value}</option>)}</select></Field>
                  <Field label="Joining Date *"><input type="date" required value={member.joining_date} onChange={e => updateMember(index, 'joining_date', e.target.value)} /></Field>
                  <Field label="Mobile Number"><input inputMode="tel" maxLength="15" placeholder="Enter mobile" value={member.mobile} onChange={e => updateMember(index, 'mobile', e.target.value)} /></Field>
                  <Field label="Aadhaar Number"><input inputMode="numeric" maxLength="12" placeholder="12 digit Aadhaar" value={member.aadhar_number} onChange={e => updateMember(index, 'aadhar_number', e.target.value.replace(/\D/g, ''))} /></Field>
                  <Field label="Gender"><select value={member.gender} onChange={e => updateMember(index, 'gender', e.target.value)}><option value="">Select Gender</option><option>Male</option><option>Female</option><option>Other</option></select></Field>
                  <Field label="Remarks"><input placeholder="Optional remarks" value={member.remarks} onChange={e => updateMember(index, 'remarks', e.target.value)} /></Field>
                </div>
              </section>)}
            </div>
            <datalist id="contract-worker-departments"><option value="Peeling" /><option value="Deheading" /></datalist>
            <div className="registration-form-footer">
              <button type="button" className="labour-btn secondary" onClick={() => setMembers([blankMember()])}><i className="fa-solid fa-rotate-left" /> Clear</button>
              <button type="button" className="labour-btn secondary" onClick={() => setRegistrationOpen(false)}>Cancel</button>
              <button className="labour-btn primary save-members-btn" disabled={saving}><i className="fa-solid fa-floppy-disk" /> {saving ? 'Saving...' : `Save ${members.length} Member${members.length > 1 ? 's' : ''}`}</button>
            </div>
          </form>}

          <div className="labour-section"><div className="labour-section-title"><div><h2>Contract Worker Register</h2><p>{contractRows.length} registered workers</p></div></div>
            <RegisterTable loading={loading} columns={['Worker ID', 'Name', 'Contractor', 'Mobile', 'Department', 'Location', 'Joining', 'Status', 'Meta Date', 'Meta User', 'Action']}>
              {contractRows.map(row => <tr key={row.id}><td><strong>{row.labour_id}</strong></td><td>{row.labour_name}</td><td>{row.contractor_name || '-'}</td><td>{row.mobile || '-'}</td><td>{row.department || '-'}</td><td>{row.production_at || '-'}</td><td>{row.joining_date}</td><td>{row.status}</td><td>{row.date || '-'}</td><td>{row.email || '-'}</td><td><button className="labour-link danger" onClick={() => deleteRow('contract', row.id)}>Delete</button></td></tr>)}
            </RegisterTable>
          </div>
        </>
      ) : (
        <div className="labour-section contract-terminal">
          <div className="labour-section-title">
            <div><h2>Contract Worker Punching</h2><p>Select IN or OUT, scan multiple Worker IDs, then punch all at once.</p></div>
            <div className="terminal-status"><span>{contractAttendance.filter(row => row.status === 'INSIDE').length} Inside</span><span>{contractAttendance.filter(row => row.status === 'CLOSED').length} Completed</span></div>
          </div>
          <div className="punch-mode-row">
            <button type="button" className={`punch-mode in ${punchMode === 'IN' ? 'active' : ''}`} onClick={() => setPunchMode('IN')}><i className="fa-solid fa-right-to-bracket" /> IN</button>
            <button type="button" className={`punch-mode out ${punchMode === 'OUT' ? 'active' : ''}`} onClick={() => setPunchMode('OUT')}><i className="fa-solid fa-right-from-bracket" /> OUT</button>
          </div>
          <div className="contract-punch-row bulk">
            <label className="contract-id-input"><span>Worker Number or Full ID</span><input autoFocus value={punchId} placeholder="1, 999 or BS00001" onChange={event => setPunchId(event.target.value.toUpperCase())} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addPunchIds(); } }} /></label>
            <button type="button" className="labour-btn secondary queue-add" onClick={addPunchIds}>Add ID</button>
            <button type="button" className={`punch-btn ${punchMode.toLowerCase()}`} disabled={punching || !punchQueue.length} onClick={punchContractLabour}>{punching ? 'Saving...' : `Punch ${punchQueue.length} ${punchMode}`}</button>
          </div>
          <div className="punch-queue" aria-label="Queued worker IDs">
            {punchQueue.length ? punchQueue.map(item => <button type="button" key={item.fullId} onClick={() => setPunchQueue(queue => queue.filter(value => value.fullId !== item.fullId))}><strong>{item.fullId}</strong> · {item.name} <span>×</span></button>) : <span>Example: enter 1 for 00001, or 999 for 00999. Added Worker ID and name appear here.</span>}
          </div>
          <div className="labour-table-scroll punch-table-scroll">
            <table className="labour-table punch-table">
              <thead><tr><th>Worker ID</th><th>Name</th><th>Contractor</th><th>Location</th><th>IN</th><th>OUT</th><th>Status</th></tr></thead>
              <tbody>{loading ? <tr><td colSpan="7" className="labour-empty">Loading punches...</td></tr> : contractAttendance.length ? contractAttendance.map(row => <tr key={row.id}><td><strong>{row.labour_id}</strong></td><td>{row.labour_name}</td><td>{row.contractor_name || '-'}</td><td>{row.production_at || '-'}</td><td>{formatPunchTime(row.in_time)}</td><td>{formatPunchTime(row.out_time)}</td><td><span className={`punch-status ${row.status === 'INSIDE' ? 'inside' : 'closed'}`}>{row.status === 'INSIDE' ? 'INSIDE' : 'OUT'}</span></td></tr>) : <tr><td colSpan="7" className="labour-empty">No contract worker punches today</td></tr>}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function RegisterTable({ loading, columns, children }) {
  return <div className="labour-table-scroll"><table className="labour-table"><thead><tr>{columns.map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={columns.length} className="labour-empty">Loading register...</td></tr> : React.Children.count(children) ? children : <tr><td colSpan={columns.length} className="labour-empty">No entries found</td></tr>}</tbody></table></div>;
}

function Field({ label, children }) {
  return <label className="member-form-field"><span>{label}</span>{children}</label>;
}

function formatPunchTime(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value).slice(11, 19) : parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
