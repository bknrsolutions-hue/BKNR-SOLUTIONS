import React, { useEffect, useMemo, useState } from 'react';
import { sessionFetch } from '../../utils/sessionFetch';
import './LabourManagement.css';

const today = () => new Date().toISOString().slice(0, 10);
const cleanNameText = value => value.replace(/[^A-Za-z .'-]/g, '');

const blankMember = () => ({
  labour_name: '', contractor_name: '', mobile: '', aadhar_number: '', gender: '',
  joining_date: today(), department: 'ALL', production_at: '', remarks: ''
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
  const [selectedContract, setSelectedContract] = useState(null);
  const [contractMenuOpen, setContractMenuOpen] = useState(false);
  const [editingContract, setEditingContract] = useState(null);
  const [contractAudit, setContractAudit] = useState({ open: false, loading: false, worker: null, audits: [] });

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

  const validateContractMembers = () => {
    for (const [index, member] of members.entries()) {
      const rowLabel = `Worker ${index + 1}`;
      if (!member.labour_name.trim()) return `${rowLabel}: Worker Name is required`;
      if (!/^[A-Za-z][A-Za-z .'-]*$/.test(member.labour_name.trim())) return `${rowLabel}: Worker Name must contain text only`;
      if (!member.contractor_name.trim()) return `${rowLabel}: Contractor is required`;
      if (!member.department.trim()) return `${rowLabel}: Department is required`;
      if (!member.production_at.trim()) return `${rowLabel}: Plant / Location is required`;
      if (!member.joining_date) return `${rowLabel}: Joining Date is required`;
      if (!member.mobile.trim()) return `${rowLabel}: Mobile Number is required`;
      if (!/^\d{10}$/.test(member.mobile.trim())) return `${rowLabel}: Mobile Number must be 10 digits`;
      if (!member.aadhar_number.trim()) return `${rowLabel}: Aadhaar Number is required`;
      if (!/^\d{12}$/.test(member.aadhar_number.trim())) return `${rowLabel}: Aadhaar Number must be 12 digits`;
      if (!member.gender.trim()) return `${rowLabel}: Gender is required`;
    }
    return '';
  };

  const validateContractMember = member => {
    if (!member.labour_name.trim()) return 'Worker Name is required';
    if (!/^[A-Za-z][A-Za-z .'-]*$/.test(member.labour_name.trim())) return 'Worker Name must contain text only';
    if (!member.contractor_name.trim()) return 'Contractor is required';
    if (!member.department.trim()) return 'Department is required';
    if (!member.production_at.trim()) return 'Plant / Location is required';
    if (!member.joining_date) return 'Joining Date is required';
    if (!/^\d{10}$/.test(member.mobile.trim())) return 'Mobile Number must be 10 digits';
    if (!/^\d{12}$/.test(member.aadhar_number.trim())) return 'Aadhaar Number must be 12 digits';
    if (!member.gender.trim()) return 'Gender is required';
    return '';
  };

  const saveContractMembers = async event => {
    event.preventDefault();
    const validationError = validateContractMembers();
    if (validationError) {
      notify(validationError, 'error');
      return;
    }
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

  const matchedLabourPreview = useMemo(() => {
    const val = punchId.trim().toUpperCase();
    if (!val) return null;
    const firstVal = val.split(/[\s,]+/)[0];
    if (!firstVal) return null;

    const isNum = /^\d+$/.test(firstVal);
    const suffix = isNum ? String(Number(firstVal)).padStart(5, '0') : '';

    return (
      (suffix && contractRows.find(row => (row.labour_id || '').toUpperCase().endsWith(suffix))) ||
      contractRows.find(row => (row.labour_id || '').toUpperCase() === firstVal) ||
      contractRows.find(row => (row.labour_id || '').toUpperCase().endsWith(firstVal)) ||
      contractRows.find(row => (row.labour_name || '').toUpperCase().includes(firstVal))
    );
  }, [punchId, contractRows]);

  const addPunchIds = () => {
    const incoming = punchId.split(/[\s,]+/).map(value => value.trim().toUpperCase()).filter(Boolean);
    if (!incoming.length) return;
    const resolved = incoming.map(value => {
      const isNum = /^\d+$/.test(value);
      const suffix = isNum ? String(Number(value)).padStart(5, '0') : '';
      const worker = (suffix && contractRows.find(row => (row.labour_id || '').toUpperCase().endsWith(suffix))) ||
        contractRows.find(row => (row.labour_id || '').toUpperCase() === value) ||
        contractRows.find(row => (row.labour_id || '').toUpperCase().endsWith(value));
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

  const cancelContractWorker = async row => {
    if (!window.confirm(`Cancel contract worker ${row.labour_id}?`)) return;
    try {
      const response = await sessionFetch(`/attendance/labour-management/contract/delete/${row.id}`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to cancel entry');
      notify('Worker entry cancelled');
      await loadData();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setContractMenuOpen(false);
      setSelectedContract(null);
    }
  };

  const saveContractEdit = async event => {
    event.preventDefault();
    if (!editingContract) return;
    const validationError = validateContractMember(editingContract);
    if (validationError) return notify(validationError, 'error');
    setSaving(true);
    try {
      const response = await sessionFetch(`/attendance/labour-management/contract/update/${editingContract.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingContract),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to update contract worker');
      notify('Contract worker updated');
      setEditingContract(null);
      await loadData();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const openContractAudit = async row => {
    setContractMenuOpen(false);
    setContractAudit({ open: true, loading: true, worker: row, audits: [] });
    try {
      const response = await sessionFetch(`/attendance/labour-management/contract/audit/${row.id}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load audit trail');
      setContractAudit({ open: true, loading: false, worker: data.worker || row, audits: data.audits || [] });
    } catch (error) {
      notify(error.message, 'error');
      setContractAudit({ open: true, loading: false, worker: row, audits: [] });
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
                  <Field label="Worker Name *"><input required pattern="[A-Za-z .'-]+" title="Use letters only" placeholder="Enter full name" value={member.labour_name} onChange={e => updateMember(index, 'labour_name', cleanNameText(e.target.value))} /></Field>
                  <Field label="Contractor *"><select required value={member.contractor_name} onChange={e => updateMember(index, 'contractor_name', e.target.value)}><option value="">Select Contractor</option>{lookups.contractors.map(value => <option key={value}>{value}</option>)}</select></Field>
                  <Field label="Department *"><input required list="contract-worker-departments" placeholder="Select or enter department" value={member.department} onChange={e => updateMember(index, 'department', e.target.value)} /></Field>
                  <Field label="Plant / Location *"><select required value={member.production_at} onChange={e => updateMember(index, 'production_at', e.target.value)}>{lookups.locations.map(value => <option key={value}>{value}</option>)}</select></Field>

                  <Field label="Joining Date *"><input type="date" required value={member.joining_date} onChange={e => updateMember(index, 'joining_date', e.target.value)} /></Field>
                  <Field label="Mobile Number *"><input required inputMode="numeric" maxLength="10" placeholder="10 digit mobile" value={member.mobile} onChange={e => updateMember(index, 'mobile', e.target.value.replace(/\D/g, '').slice(0, 10))} /></Field>
                  <Field label="Aadhaar Number *"><input required inputMode="numeric" maxLength="12" placeholder="12 digit Aadhaar" value={member.aadhar_number} onChange={e => updateMember(index, 'aadhar_number', e.target.value.replace(/\D/g, '').slice(0, 12))} /></Field>
                  <Field label="Gender *"><select required value={member.gender} onChange={e => updateMember(index, 'gender', e.target.value)}><option value="">Select Gender</option><option>Male</option><option>Female</option><option>Other</option></select></Field>
                  <Field label="Remarks"><input placeholder="Optional remarks" value={member.remarks} onChange={e => updateMember(index, 'remarks', e.target.value)} /></Field>
                </div>
              </section>)}
            </div>
            <datalist id="contract-worker-departments"><option value="ALL" /><option value="Peeling" /><option value="Deheading" /></datalist>
            <div className="registration-form-footer">
              <button type="button" className="labour-btn secondary" onClick={() => setMembers([blankMember()])}><i className="fa-solid fa-rotate-left" /> Clear</button>
              <button type="button" className="labour-btn secondary" onClick={() => setRegistrationOpen(false)}>Cancel</button>
              <button className="labour-btn primary save-members-btn" disabled={saving}><i className="fa-solid fa-floppy-disk" /> {saving ? 'Saving...' : `Save ${members.length} Member${members.length > 1 ? 's' : ''}`}</button>
            </div>
          </form>}

          <div className="labour-section"><div className="labour-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', position: 'relative' }}><div><h2>Contract Worker Register</h2><p>{contractRows.length} registered workers {selectedContract ? `· Selected: ${selectedContract.labour_name} (${selectedContract.labour_id})` : '· Click a row to select actions'}</p></div>{selectedContract && <div className="master-menu-container" style={{ position: 'relative' }}><button type="button" className="master-dots-trigger" title="Worker Actions" onClick={e => { e.stopPropagation(); setContractMenuOpen(open => !open); }} style={{ background: 'var(--header-bg, #334155)', border: '1px solid var(--border, #475569)', color: 'var(--text, #fff)', width: '36px', height: '36px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}><i className="fa-solid fa-ellipsis-vertical" /></button>{contractMenuOpen && <div className="master-dropdown-menu" style={{ position: 'absolute', right: 0, top: '42px', background: 'var(--card-bg, #1e293b)', border: '1px solid var(--border, #334155)', borderRadius: '8px', padding: '6px', minWidth: '170px', boxShadow: 'var(--shadow, 0 10px 15px -3px rgba(0,0,0,0.3))', zIndex: 100 }}><div className="master-menu-item" style={{ padding: '8px 12px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '4px', color: 'var(--text, #f8fafc)' }} onClick={() => { setEditingContract({ ...selectedContract }); setContractMenuOpen(false); }}><i className="fa-solid fa-pen-to-square" style={{ color: 'var(--accent, #60a5fa)' }} /> Edit Worker</div><div className="master-menu-item" style={{ padding: '8px 12px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '4px', color: 'var(--text, #f8fafc)' }} onClick={() => openContractAudit(selectedContract)}><i className="fa-solid fa-clock-rotate-left" style={{ color: 'var(--accent, #60a5fa)' }} /> Audit Trail</div>{selectedContract.status !== 'Cancelled' && <div className="master-menu-item danger" style={{ padding: '8px 12px', fontSize: '12px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '4px', color: 'var(--danger, #ef4444)' }} onClick={() => { cancelContractWorker(selectedContract); setContractMenuOpen(false); }}><i className="fa-solid fa-ban" /> Cancel Registration</div>}</div>}</div>}</div>
            <RegisterTable loading={loading} columns={['Sl. No', 'Worker ID', 'Name', 'Contractor', 'Mobile', 'Department', 'Location', 'Joining', 'Status', 'Meta Date', 'Meta User']}>
              {contractRows.map((row, index) => { const isSelected = selectedContract?.id === row.id; return <tr key={row.id} style={{ cursor: 'pointer', background: isSelected ? 'color-mix(in srgb, var(--accent) 15%, var(--card-bg))' : undefined }} onClick={() => { setSelectedContract(isSelected ? null : row); setContractMenuOpen(false); }}><td><strong>{contractRows.length - index}</strong></td><td><strong>{row.labour_id}</strong></td><td>{row.labour_name}</td><td>{row.contractor_name || '-'}</td><td>{row.mobile || '-'}</td><td>{row.department || '-'}</td><td>{row.production_at || '-'}</td><td>{row.joining_date}</td><td>{row.status}</td><td>{row.date || '-'}</td><td>{row.email || '-'}</td></tr>; })}
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

          {matchedLabourPreview && (
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
                    {matchedLabourPreview.labour_name}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--att-muted, #94a3b8)', fontWeight: '700', marginTop: '2px' }}>
                    Full Worker ID: <span style={{ color: '#10b981', fontWeight: '900', fontSize: '13px' }}>{matchedLabourPreview.labour_id}</span>
                    {matchedLabourPreview.department ? ` | Dept: ${matchedLabourPreview.department}` : ''}
                    {matchedLabourPreview.contractor_name ? ` | Contractor: ${matchedLabourPreview.contractor_name}` : ''}
                  </div>
                </div>
              </div>
              <button
                type="button"
                className="labour-btn primary"
                style={{ fontSize: '12px', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', background: '#10b981', color: '#fff', border: 'none', fontWeight: '800' }}
              >
                + Add Full ID ({matchedLabourPreview.labour_id})
              </button>
            </div>
          )}

          <div className="punch-queue" aria-label="Queued worker IDs">
            {punchQueue.length ? punchQueue.map(item => <button type="button" key={item.fullId} onClick={() => setPunchQueue(queue => queue.filter(value => value.fullId !== item.fullId))}><strong>{item.fullId}</strong> · {item.name} <span>×</span></button>) : <span>Example: enter 1 for 00001, or 999 for 00999. Added Worker ID and name appear here.</span>}
          </div>
          <div className="labour-table-scroll punch-table-scroll">
            <table className="labour-table punch-table">
              <thead><tr><th>Sl. No</th><th>Worker ID</th><th>Name</th><th>Contractor</th><th>Location</th><th>IN</th><th>OUT</th><th>Status</th></tr></thead>
              <tbody>{loading ? <tr><td colSpan="8" className="labour-empty">Loading punches...</td></tr> : contractAttendance.length ? contractAttendance.map((row, index) => <tr key={row.id}><td><strong>{contractAttendance.length - index}</strong></td><td><strong>{row.labour_id}</strong></td><td>{row.labour_name}</td><td>{row.contractor_name || '-'}</td><td>{row.production_at || '-'}</td><td>{formatPunchTime(row.in_time)}</td><td>{formatPunchTime(row.out_time)}</td><td><span className={`punch-status ${row.status === 'INSIDE' ? 'inside' : 'closed'}`}>{row.status === 'INSIDE' ? 'INSIDE' : 'OUT'}</span></td></tr>) : <tr><td colSpan="8" className="labour-empty">No contract worker punches today</td></tr>}</tbody>
            </table>
          </div>
        </div>
      )}

      {editingContract && (
        <div className="labour-modal-overlay" onClick={() => setEditingContract(null)}>
          <div className="labour-modal-content" onClick={event => event.stopPropagation()}>
            <div className="labour-modal-header">
              <div>
                <h2>Edit Contract Worker: {editingContract.labour_name}</h2>
                <p>ID: <strong>{editingContract.labour_id}</strong></p>
              </div>
              <button type="button" className="labour-modal-close-btn" onClick={() => setEditingContract(null)}>
                <i className="fa-solid fa-xmark" />
              </button>
            </div>
            <form onSubmit={saveContractEdit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
              <div className="labour-modal-body">
                <div className="member-form-grid">
                  <Field label="Worker Name *"><input required pattern="[A-Za-z .'-]+" title="Use letters only" value={editingContract.labour_name || ''} onChange={e => setEditingContract(row => ({ ...row, labour_name: cleanNameText(e.target.value) }))} /></Field>
                  <Field label="Contractor *"><select required value={editingContract.contractor_name || ''} onChange={e => setEditingContract(row => ({ ...row, contractor_name: e.target.value }))}><option value="">Select Contractor</option>{lookups.contractors.map(value => <option key={value}>{value}</option>)}</select></Field>
                  <Field label="Department *"><input required list="contract-worker-departments" value={editingContract.department || 'ALL'} onChange={e => setEditingContract(row => ({ ...row, department: e.target.value }))} /></Field>
                  <Field label="Plant / Location *"><select required value={editingContract.production_at || ''} onChange={e => setEditingContract(row => ({ ...row, production_at: e.target.value }))}>{lookups.locations.map(value => <option key={value}>{value}</option>)}</select></Field>

                  <Field label="Joining Date *"><input type="date" required value={editingContract.joining_date || ''} onChange={e => setEditingContract(row => ({ ...row, joining_date: e.target.value }))} /></Field>
                  <Field label="Mobile Number *"><input required inputMode="numeric" maxLength="10" value={editingContract.mobile || ''} onChange={e => setEditingContract(row => ({ ...row, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) }))} /></Field>
                  <Field label="Aadhaar Number *"><input required inputMode="numeric" maxLength="12" value={editingContract.aadhar_number || ''} onChange={e => setEditingContract(row => ({ ...row, aadhar_number: e.target.value.replace(/\D/g, '').slice(0, 12) }))} /></Field>
                  <Field label="Gender *"><select required value={editingContract.gender || ''} onChange={e => setEditingContract(row => ({ ...row, gender: e.target.value }))}><option value="">Select Gender</option><option>Male</option><option>Female</option><option>Other</option></select></Field>
                  <Field label="Remarks"><input value={editingContract.remarks || ''} onChange={e => setEditingContract(row => ({ ...row, remarks: e.target.value }))} /></Field>
                </div>
              </div>
              <div className="labour-modal-footer">
                <button type="button" className="labour-btn secondary" onClick={() => setEditingContract(null)}>Cancel</button>
                <button className="labour-btn primary" disabled={saving}><i className="fa-solid fa-floppy-disk" /> {saving ? 'Saving...' : 'Save Changes'}</button>
              </div>
            </form>
          </div>
        </div>
      )}


      {contractAudit.open && <div className="labour-audit-backdrop" onClick={() => setContractAudit(audit => ({ ...audit, open: false }))}><aside className="labour-audit-panel" onClick={event => event.stopPropagation()}><div className="labour-audit-head"><div><span>{contractAudit.worker?.labour_id || 'Contract Worker'}</span><h2>Audit Trail</h2></div><button type="button" onClick={() => setContractAudit(audit => ({ ...audit, open: false }))}>×</button></div><div className="labour-audit-list">{contractAudit.loading ? <div className="labour-empty">Loading audit trail...</div> : contractAudit.audits.length ? contractAudit.audits.map(audit => <article key={audit.id}><strong>{audit.field_name}</strong><p>{audit.old_value || '-'} → {audit.new_value || '-'}</p><small>{audit.edited_by} · {String(audit.edited_at || '').replace('T', ' ').slice(0, 19)}</small></article>) : <div className="labour-empty">No audit trail found</div>}</div></aside></div>}
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
