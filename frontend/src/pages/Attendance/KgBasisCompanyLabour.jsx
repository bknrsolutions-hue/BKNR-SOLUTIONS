import { useEffect, useMemo, useRef, useState } from 'react';
import { sessionFetch } from '../../utils/sessionFetch';
import { normalizeFieldValue, normalizeRecordFields, standardInputProps } from '../../utils/fieldStandards';
import './LabourManagement.css';

const today = () => new Date().toISOString().slice(0, 10);
const cleanNameText = value => value.replace(/[^A-Za-z .'-]/g, '');
const blankWorker = (locs = []) => ({ worker_name: '', worker_type: 'KG Basis Company Worker', department: '', mobile: '', aadhar_number: '', gender: 'Male', joining_date: today(), production_at: locs.length ? locs[0] : '', daily_salary: '', worker_category: '', bank_name: '', account_number: '', ifsc_code: '', address: '', remarks: '' });

export default function KgBasisCompanyLabour() {
  const [activeTab, setActiveTab] = useState('registration');
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [workers, setWorkers] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [locations, setLocations] = useState([]);
  const [members, setMembers] = useState([blankWorker()]);
  const [dailyWorkerRates, setDailyWorkerRates] = useState([]);
  const [editingWorker, setEditingWorker] = useState(null);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [punchMode, setPunchMode] = useState('IN');
  const [punchId, setPunchId] = useState('');
  const [punchQueue, setPunchQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [punching, setPunching] = useState(false);
  const [notice, setNotice] = useState(null);

  const dotsRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dotsRef.current && !dotsRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

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
      const locs = data.lookups?.locations || [];
      setLocations(locs);
      setMembers(current => current.map(m => ({
        ...m,
        production_at: m.production_at || (locs.length ? locs[0] : ''),
        gender: m.gender || 'Male',
      })));
      setDailyWorkerRates(data.daily_worker_rates || []);
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const updateMember = (index, key, value) => {
    setMembers(current => current.map((member, rowIndex) => {
      if (rowIndex !== index) return member;
      const updated = { ...member, [key]: normalizeFieldValue(key, value) };
      if (key === 'worker_category' && value && dailyWorkerRates.length) {
        const matchedRate = dailyWorkerRates.find(r => r.worker_type === value && r.status !== 'Inactive');
        if (matchedRate && matchedRate.daily_salary) {
          updated.daily_salary = matchedRate.daily_salary;
        }
      }
      return updated;
    }));
  };

  const saveWorkers = async event => {
    event.preventDefault();
    const preparedMembers = members.map(m => ({
      ...m,
      production_at: (m.production_at || '').trim() || (locations.length ? locations[0] : ''),
      gender: m.gender || 'Male',
    })).map(normalizeRecordFields);

    const invalidRow = preparedMembers.findIndex(member => !/^[A-Za-z][A-Za-z .'-]*$/.test(String(member.worker_name || '').trim()));
    if (invalidRow >= 0) {
      notify(`Worker ${invalidRow + 1}: Worker Name must contain text only`, 'error');
      return;
    }
    setSaving(true);
    try {
      const response = await sessionFetch('/attendance/kg-basis-labour/registration/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ members: preparedMembers })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to save KG workers');
      const ids = (data.records || []).map(row => row.worker_id).join(', ');
      notify(`Saved ${data.records?.length || members.length} workers. IDs: ${ids}`);
      setMembers([blankWorker(locations)]);
      setRegistrationOpen(false);
      await loadData();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const saveEditWorker = async event => {
    event.preventDefault();
    if (!editingWorker) return;
    setSaving(true);
    try {
      const response = await sessionFetch(`/attendance/kg-basis-labour/worker/update/${editingWorker.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizeRecordFields(editingWorker))
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to update worker');
      notify('Worker details updated successfully!');
      setEditingWorker(null);
      setSelectedWorker(data.record || editingWorker);
      await loadData();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const matchedWorkerPreview = useMemo(() => {
    const val = punchId.trim().toUpperCase();
    if (!val) return null;
    const firstVal = val.split(/[\s,]+/)[0];
    if (!firstVal) return null;

    const isNum = /^\d+$/.test(firstVal);
    const suffix = isNum ? String(Number(firstVal)).padStart(5, '0') : '';

    return (
      (suffix && workers.find(row => (row.worker_id || '').toUpperCase().endsWith(suffix))) ||
      workers.find(row => (row.worker_id || '').toUpperCase() === firstVal) ||
      workers.find(row => (row.worker_id || '').toUpperCase().endsWith(firstVal)) ||
      workers.find(row => (row.worker_name || '').toUpperCase().includes(firstVal))
    );
  }, [punchId, workers]);

  const addPunchIds = () => {
    const incoming = punchId.split(/[\s,]+/).map(value => value.trim().toUpperCase()).filter(Boolean);
    if (!incoming.length) return;
    const resolved = incoming.map(value => {
      const isNum = /^\d+$/.test(value);
      const suffix = isNum ? String(Number(value)).padStart(5, '0') : '';
      const worker = (suffix && workers.find(row => (row.worker_id || '').toUpperCase().endsWith(suffix))) ||
        workers.find(row => (row.worker_id || '').toUpperCase() === value) ||
        workers.find(row => (row.worker_id || '').toUpperCase().endsWith(value));
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

  const cancelWorker = async id => {
    if (!window.confirm('Cancel this KG worker registration?')) return;
    const response = await sessionFetch(`/attendance/kg-basis-labour/worker/cancel/${id}`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) return notify(data.error || 'Unable to cancel worker', 'error');
    notify('Worker registration cancelled');
    setSelectedWorker(null);
    loadData();
  };

  const summary = useMemo(() => ({
    registered: workers.filter(worker => worker.status === 'ACTIVE' || worker.status === 'Active').length,
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
      <div className="labour-section registration-toggle"><div className="labour-section-title"><div><h2>KG Basis Worker Registration</h2><p>Open the form only when new workers need to be registered.</p></div><button type="button" className="labour-btn primary" onClick={() => setRegistrationOpen(open => !open)}>{registrationOpen ? 'Close Form' : 'Add New Entry'}</button></div></div>
      {registrationOpen && <form className="labour-section registration-form" onSubmit={saveWorkers}>
        <div className="registration-form-head"><div className="registration-form-icon"><i className="fa-solid fa-users" /></div><div className="registration-form-copy"><h2>Bulk KG Worker Registration</h2><p>Fill one section per worker. IDs are generated automatically.</p></div><div className="registration-form-badge">{members.length} Worker{members.length > 1 ? 's' : ''}</div><button type="button" className="labour-btn add-member-btn" onClick={() => setMembers(rows => [...rows, blankWorker()])}><i className="fa-solid fa-plus" /> Add Worker</button></div>
        <div className="registration-help"><span><i className="fa-solid fa-circle-info" /> Worker name and joining date are required.</span><span>ID format: Company + K + 5 digits</span></div>
        <div className="member-form-list">{members.map((member, index) => <section className="member-form-section" key={index}>
          <div className="member-form-title"><span className="member-row-number">{index + 1}</span><strong>Worker {index + 1}</strong><button type="button" className="labour-icon-btn" title="Remove worker" disabled={members.length === 1} onClick={() => setMembers(rows => rows.filter((_, rowIndex) => rowIndex !== index))}><i className="fa-solid fa-trash-can" /></button></div>
          <div className="member-form-grid">
            <Field label="Worker Name *"><input required pattern="[A-Za-z .'-]+" title="Use letters only" placeholder="Enter full name" value={member.worker_name} onChange={event => updateMember(index, 'worker_name', cleanNameText(event.target.value))} /></Field>
            <Field label="Worker Type *">
              <select value={member.worker_type || 'KG Basis Company Worker'} onChange={event => updateMember(index, 'worker_type', event.target.value)}>
                <option value="KG Basis Company Worker">KG Basis Company Worker</option>
                <option value="Daily Basis Company Worker">Daily Basis Company Worker</option>
                <option value="Contractor">Contractor</option>
              </select>
            </Field>
            <Field label="Department"><input list="kg-worker-departments" placeholder="Select or enter department" value={member.department} onChange={event => updateMember(index, 'department', event.target.value)} /></Field>
            <Field label="Plant / Location"><select value={member.production_at} onChange={event => updateMember(index, 'production_at', event.target.value)}>{locations.map(value => <option key={value}>{value}</option>)}</select></Field>

            <Field label="Joining Date *"><input type="date" required value={member.joining_date} onChange={event => updateMember(index, 'joining_date', event.target.value)} /></Field>
            {member.worker_type === 'Daily Basis Company Worker' && (
              <Field label="Worker Category">
                <select value={member.worker_category || ''} onChange={event => updateMember(index, 'worker_category', event.target.value)}>
                  <option value="">Select Category</option>
                  <option value="Fresher">Fresher</option>
                  <option value="Medium Experience">Medium Experience</option>
                  <option value="Experienced">Experienced</option>
                </select>
              </Field>
            )}
            <Field label="Mobile Number"><input {...standardInputProps('mobile')} placeholder="10 digit mobile" value={member.mobile} onChange={event => updateMember(index, 'mobile', event.target.value)} /></Field>
            <Field label="Aadhaar Number"><input inputMode="numeric" maxLength="12" placeholder="12 digit Aadhaar" value={member.aadhar_number} onChange={event => updateMember(index, 'aadhar_number', event.target.value.replace(/\D/g, ''))} /></Field>
            <Field label="Gender"><select value={member.gender} onChange={event => updateMember(index, 'gender', event.target.value)}><option value="">Select Gender</option><option>Male</option><option>Female</option><option>Other</option></select></Field>
            <Field label="Bank Name"><input placeholder="Bank name e.g. SBI" value={member.bank_name} onChange={event => updateMember(index, 'bank_name', event.target.value)} /></Field>
            <Field label="Account Number"><input {...standardInputProps('account_number')} placeholder="9 to 18 digit account number" value={member.account_number} onChange={event => updateMember(index, 'account_number', event.target.value)} /></Field>
            <Field label="IFSC Code"><input {...standardInputProps('ifsc_code')} placeholder="IFSC e.g. SBIN0001234" value={member.ifsc_code} onChange={event => updateMember(index, 'ifsc_code', event.target.value)} /></Field>
            <Field label="Address"><input placeholder="Full address" value={member.address} onChange={event => updateMember(index, 'address', event.target.value)} /></Field>
            <Field label="Remarks"><input placeholder="Optional remarks" value={member.remarks} onChange={event => updateMember(index, 'remarks', event.target.value)} /></Field>
          </div>
        </section>)}</div>
        <datalist id="kg-worker-departments">
          <option value="ALL" />
          <option value="Peeling" />
          <option value="Deheading" />
          <option value="Grading" />
          <option value="Packing" />
        </datalist>
        <div className="registration-form-footer"><button type="button" className="labour-btn secondary" onClick={() => setMembers([blankWorker()])}><i className="fa-solid fa-rotate-left" /> Clear</button><button type="button" className="labour-btn secondary" onClick={() => setRegistrationOpen(false)}>Cancel</button><button className="labour-btn primary save-members-btn" disabled={saving}><i className="fa-solid fa-floppy-disk" /> {saving ? 'Saving...' : `Save ${members.length} Worker${members.length > 1 ? 's' : ''}`}</button></div>
      </form>}
      <div className="labour-section">
        <div className="labour-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', position: 'relative' }}>
          <div>
            <h2>KG Basis Worker Register</h2>
            <p>{workers.length} registered workers {selectedWorker ? `· Selected: ${selectedWorker.worker_name} (${selectedWorker.worker_id})` : '· Click a row to select actions'}</p>
          </div>
          {selectedWorker && (
            <div className="master-menu-container" ref={dotsRef} style={{ position: 'relative' }}>
              <button
                type="button"
                className="master-dots-trigger"
                title="Worker Actions"
                onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
                style={{ background: 'var(--header-bg, #334155)', border: '1px solid var(--border, #475569)', color: 'var(--text, #fff)', width: '36px', height: '36px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}
              >
                <i className="fa-solid fa-ellipsis-vertical" />
              </button>
              {menuOpen && (
                <div className="master-dropdown-menu" style={{ position: 'absolute', right: 0, top: '42px', background: 'var(--card-bg, #1e293b)', border: '1px solid var(--border, #334155)', borderRadius: '8px', padding: '6px', minWidth: '170px', boxShadow: 'var(--shadow, 0 10px 15px -3px rgba(0,0,0,0.3))', zIndex: 100 }}>
                  {selectedWorker.status !== 'Cancelled' && (
                    <div
                      className="master-menu-item"
                      style={{ padding: '8px 12px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '4px', color: 'var(--text, #f8fafc)' }}
                      onClick={() => { setEditingWorker({ ...selectedWorker }); setMenuOpen(false); }}
                    >
                      <i className="fa-solid fa-pen-to-square" style={{ color: 'var(--accent, #60a5fa)' }} /> Edit Worker
                    </div>
                  )}
                  {selectedWorker.status !== 'Cancelled' && (
                    <div
                      className="master-menu-item danger"
                      style={{ padding: '8px 12px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '4px', color: 'var(--danger, #ef4444)' }}
                      onClick={() => { cancelWorker(selectedWorker.id); setMenuOpen(false); }}
                    >
                      <i className="fa-solid fa-ban" /> Cancel Registration
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="labour-table-scroll">
          <table className="labour-table">
            <thead>
              <tr>
                <th>Sl. No</th>
                <th>Date</th>
                <th>Worker ID</th>
                <th>Name</th>
                <th>Worker Type</th>
                <th>Category</th>
                <th>Department</th>
                <th>Bank Account Details</th>
                <th>Address</th>
                <th>Mobile</th>
                <th>Location</th>
                <th>Joining</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="13" className="labour-empty">Loading register...</td></tr>
              ) : workers.length ? (
                workers.map((worker, index) => {
                  const isSelected = selectedWorker?.id === worker.id;
                  return (
                    <tr
                      key={worker.id}
                      style={{ cursor: 'pointer', background: isSelected ? 'color-mix(in srgb, var(--accent) 15%, var(--card-bg))' : undefined }}
                      onClick={() => setSelectedWorker(isSelected ? null : worker)}
                    >
                      <td><strong>{workers.length - index}</strong></td>
                      <td>{worker.date || '-'}</td>
                      <td><strong>{worker.worker_id}</strong></td>
                      <td>{worker.worker_name}</td>
                      <td>{worker.worker_type || 'KG Basis Company Worker'}</td>
                      <td>{worker.worker_category || '-'}</td>
                      <td>{worker.department || '-'}</td>
                      <td>{worker.account_number ? `${worker.account_number}${worker.bank_name ? ` (${worker.bank_name})` : ''}` : '-'}</td>
                      <td>{worker.address || '-'}</td>
                      <td>{worker.mobile || '-'}</td>
                      <td>{worker.production_at || '-'}</td>
                      <td>{worker.joining_date}</td>
                      <td>{worker.status}</td>
                    </tr>
                  );
                })
              ) : (
                <tr><td colSpan="14" className="labour-empty">No workers registered</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </> : <div className="labour-section contract-terminal">
      <div className="labour-section-title"><div><h2>KG Basis Worker Punching</h2><p>Select IN or OUT, scan multiple Worker IDs, then punch all at once.</p></div><div className="terminal-status"><span>{summary.inside} Inside</span><span>{attendance.filter(row => row.status === 'CLOSED').length} Completed</span></div></div>
      <div className="punch-mode-row"><button type="button" className={`punch-mode in ${punchMode === 'IN' ? 'active' : ''}`} onClick={() => setPunchMode('IN')}><i className="fa-solid fa-right-to-bracket" /> IN</button><button type="button" className={`punch-mode out ${punchMode === 'OUT' ? 'active' : ''}`} onClick={() => setPunchMode('OUT')}><i className="fa-solid fa-right-from-bracket" /> OUT</button></div>
      <div className="contract-punch-row bulk"><label className="contract-id-input"><span>Worker Number or Full ID</span><input autoFocus value={punchId} placeholder="1, 999 or BK00001" onChange={event => setPunchId(event.target.value.toUpperCase())} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addPunchIds(); } }} /></label><button type="button" className="labour-btn secondary queue-add" onClick={addPunchIds}>Add ID</button><button type="button" className={`punch-btn ${punchMode.toLowerCase()}`} disabled={punching || !punchQueue.length} onClick={punchWorkers}>{punching ? 'Saving...' : `Punch ${punchQueue.length} ${punchMode}`}</button></div>

      {matchedWorkerPreview && (
        <div
          onClick={addPunchIds}
          style={{
            margin: '8px 0 14px 0',
            padding: '12px 16px',
            background: 'linear-gradient(135deg, rgba(37,99,235,0.15), rgba(16,185,129,0.15))',
            border: '1.5px solid rgba(59,130,246,0.4)',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justify: 'space-between',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: '900', fontSize: '16px' }}>
              👤
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '900', color: 'var(--att-heading, #f8fafc)' }}>
                {matchedWorkerPreview.worker_name}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--att-muted, #94a3b8)', fontWeight: '700', marginTop: '2px' }}>
                Full Worker ID: <span style={{ color: '#10b981', fontWeight: '900', fontSize: '13px' }}>{matchedWorkerPreview.worker_id}</span>
                {matchedWorkerPreview.department ? ` | Dept: ${matchedWorkerPreview.department}` : ''}
                {matchedWorkerPreview.production_at ? ` | Location: ${matchedWorkerPreview.production_at}` : ''}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="labour-btn primary"
            style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', background: '#10b981', color: '#fff', border: 'none', fontWeight: '800' }}
          >
            + Add Full ID ({matchedWorkerPreview.worker_id})
          </button>
        </div>
      )}

      <div className="punch-queue">{punchQueue.length ? punchQueue.map(item => <button type="button" key={item.fullId} onClick={() => setPunchQueue(queue => queue.filter(value => value.fullId !== item.fullId))}><strong>{item.fullId}</strong> · {item.name} <span>×</span></button>) : <span>Example: enter 1 for 00001, or 999 for 00999. Added Worker ID and name appear here.</span>}</div>
      <div className="labour-table-scroll"><table className="labour-table punch-table"><thead><tr><th>Sl. No</th><th>Worker ID</th><th>Name</th><th>Location</th><th>IN</th><th>OUT</th><th>Status</th></tr></thead><tbody>{loading ? <tr><td colSpan="7" className="labour-empty">Loading punches...</td></tr> : attendance.length ? attendance.map((row, index) => <tr key={row.id}><td><strong>{attendance.length - index}</strong></td><td><strong>{row.worker_id}</strong></td><td>{row.worker_name}</td><td>{row.production_at || '-'}</td><td>{formatPunchTime(row.in_time)}</td><td>{formatPunchTime(row.out_time)}</td><td><span className={`punch-status ${row.status === 'INSIDE' ? 'inside' : 'closed'}`}>{row.status === 'INSIDE' ? 'INSIDE' : 'OUT'}</span></td></tr>) : <tr><td colSpan="7" className="labour-empty">No KG worker punches today</td></tr>}</tbody></table></div>
    </div>}

    {editingWorker && (
      <div className="labour-modal-overlay" onClick={() => setEditingWorker(null)}>
        <div className="labour-modal-content" onClick={e => e.stopPropagation()}>
          <div className="labour-modal-header">
            <div>
              <h2>Edit KG Worker: {editingWorker.worker_name}</h2>
              <p>ID: <strong>{editingWorker.worker_id}</strong></p>
            </div>
            <button type="button" className="labour-modal-close-btn" onClick={() => setEditingWorker(null)}>
              <i className="fa-solid fa-xmark" />
            </button>
          </div>

          <form onSubmit={saveEditWorker} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <div className="labour-modal-body">
              <div className="member-form-grid">
                <Field label="Worker Name *">
                  <input required pattern="[A-Za-z .'-]+" title="Use letters only" value={editingWorker.worker_name || ''} onChange={e => setEditingWorker(w => ({ ...w, worker_name: normalizeFieldValue('worker_name', cleanNameText(e.target.value)) }))} />
                </Field>
                <Field label="Worker Type *">
                  <select value={editingWorker.worker_type || 'KG Basis Company Worker'} onChange={e => setEditingWorker(w => ({ ...w, worker_type: e.target.value }))}>
                    <option value="KG Basis Company Worker">KG Basis Company Worker</option>
                    <option value="Daily Basis Company Worker">Daily Basis Company Worker</option>
                    <option value="Contractor">Contractor</option>
                  </select>
                </Field>
                {editingWorker.worker_type === 'Daily Basis Company Worker' && (
                  <Field label="Worker Category">
                    <select value={editingWorker.worker_category || ''} onChange={e => {
                      const val = e.target.value;
                      const matchedRate = dailyWorkerRates.find(r => r.worker_type === val && r.status !== 'Inactive');
                      setEditingWorker(w => ({
                        ...w,
                        worker_category: val,
                        daily_salary: matchedRate?.daily_salary || w.daily_salary
                      }));
                    }}>
                      <option value="">Select Category</option>
                      <option value="Fresher">Fresher</option>
                      <option value="Medium Experience">Medium Experience</option>
                      <option value="Experienced">Experienced</option>
                    </select>
                  </Field>
                )}
                <Field label="Department">
                  <input list="kg-worker-departments" value={editingWorker.department || ''} onChange={e => setEditingWorker(w => ({ ...w, department: normalizeFieldValue('department', e.target.value) }))} />
                </Field>
                <Field label="Plant / Location">
                  <select value={editingWorker.production_at || ''} onChange={e => setEditingWorker(w => ({ ...w, production_at: e.target.value }))}>
                    {locations.map(loc => <option key={loc}>{loc}</option>)}
                  </select>

                </Field>
                <Field label="Joining Date *">
                  <input type="date" required value={editingWorker.joining_date || ''} onChange={e => setEditingWorker(w => ({ ...w, joining_date: e.target.value }))} />
                </Field>
                <Field label="Mobile Number">
                  <input {...standardInputProps('mobile')} value={editingWorker.mobile || ''} onChange={e => setEditingWorker(w => ({ ...w, mobile: normalizeFieldValue('mobile', e.target.value) }))} />
                </Field>
                <Field label="Aadhaar Number">
                  <input value={editingWorker.aadhar_number || ''} onChange={e => setEditingWorker(w => ({ ...w, aadhar_number: e.target.value.replace(/\D/g, '') }))} />
                </Field>
                <Field label="Gender">
                  <select value={editingWorker.gender || ''} onChange={e => setEditingWorker(w => ({ ...w, gender: e.target.value }))}>
                    <option value="">Select Gender</option>
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </select>
                </Field>
                <Field label="Bank Name">
                  <input value={editingWorker.bank_name || ''} onChange={e => setEditingWorker(w => ({ ...w, bank_name: normalizeFieldValue('bank_name', e.target.value) }))} />
                </Field>
                <Field label="Account Number">
                  <input {...standardInputProps('account_number')} value={editingWorker.account_number || ''} onChange={e => setEditingWorker(w => ({ ...w, account_number: normalizeFieldValue('account_number', e.target.value) }))} />
                </Field>
                <Field label="IFSC Code">
                  <input {...standardInputProps('ifsc_code')} value={editingWorker.ifsc_code || ''} onChange={e => setEditingWorker(w => ({ ...w, ifsc_code: normalizeFieldValue('ifsc_code', e.target.value) }))} />
                </Field>
                <Field label="Address">
                  <input value={editingWorker.address || ''} onChange={e => setEditingWorker(w => ({ ...w, address: normalizeFieldValue('address', e.target.value) }))} />
                </Field>
                <Field label="Status">
                  <select value={editingWorker.status || 'ACTIVE'} onChange={e => setEditingWorker(w => ({ ...w, status: e.target.value }))}>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </Field>
                <Field label="Remarks">
                  <input value={editingWorker.remarks || ''} onChange={e => setEditingWorker(w => ({ ...w, remarks: e.target.value }))} />
                </Field>
              </div>
            </div>

            <div className="labour-modal-footer">
              <button type="button" className="labour-btn secondary" onClick={() => setEditingWorker(null)}>Cancel</button>
              <button className="labour-btn primary" disabled={saving}>
                <i className="fa-solid fa-floppy-disk" /> {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

  </div>;
}

function Field({ label, children }) { return <label className="member-form-field"><span>{label}</span>{children}</label>; }
function formatPunchTime(value) { if (!value) return '-'; const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? String(value).slice(11, 19) : parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
