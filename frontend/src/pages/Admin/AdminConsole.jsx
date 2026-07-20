import { useCallback, useEffect, useMemo, useState } from 'react';
import SystemArchitecture from './SystemArchitecture';
import { RegisterLibrary } from '../Registers/ModuleRegisters';
import './AdminConsole.css';
import './AdminConsoleOverrides.css';

const PAGE_META = {
  admin_add_user: ['User Configuration Master', 'Manage ERP users, roles and permissions'],
  admin_shifts: ['Shift Master', 'Configure plant working shifts'],
  admin_data_management: ['Master Data Management', 'Export, import and review company data'],
  admin_system_settings: ['System Control & Pipeline Settings', 'Platform controls and deployment status'],
  admin_raise_ticket: ['Support', 'Raise and track support tickets'],
  admin_helpdesk: ['Support Hub', 'Review and respond to customer tickets'],
  admin_manage_support: ['Support Team Management', 'Active administration and support users'],
  admin_user_activity: ['System Control Dashboard', 'Company and user access monitoring'],
};
const ACTIVITY_TYPES = [['registrations','Registrations'],['active','Active Companies'],['active_users','Active Users'],['new_month','New This Month'],['tickets','Open Tickets'],['pending_approvals','Pending Approvals']];

const ADMIN_NAV_ITEMS = [
  { id: 'admin_add_user', perm: 'add_user', route: '/admin/add_user', icon: 'fa-user-gear', label: 'User Configuration' },
  { id: 'admin_shifts', perm: 'shifts', route: '/attendance/shifts', icon: 'fa-business-time', label: 'Shifts' },
  { id: 'admin_data_management', perm: 'data_management', route: '/data-management', icon: 'fa-database', label: 'Data Management' },
  { id: 'admin_system_settings', perm: 'system_settings', route: '/admin/system_settings', icon: 'fa-sliders', label: 'System & Pipeline', superAdminOnly: true },
  { id: 'admin_system_architecture', perm: 'system_architecture', route: '/admin/system_architecture', icon: 'fa-sitemap', label: 'System Architecture', superAdminOnly: true },
  { id: 'admin_raise_ticket', perm: 'raise_ticket', route: '/support/my_tickets', icon: 'fa-support-agent', label: 'My Complaints' },
  { id: 'admin_helpdesk', perm: 'admin_helpdesk', route: '/admin/all_tickets', icon: 'fa-ticket', label: 'Helpdesk', superAdminOnly: true },
  { id: 'admin_manage_support', perm: 'manage_support', route: '/admin/support_team', icon: 'fa-users-gear', label: 'Support Team', superAdminOnly: true },
  { id: 'admin_user_activity', perm: 'user_activity', route: '/admin/activities', icon: 'fa-clock-rotate-left', label: 'User Activity Logs', superAdminOnly: true },
];

function extractJsonArray(html, variable) {
  const marker = `const ${variable} =`;
  const start = html.indexOf(marker);
  if (start < 0) return [];
  const arrayStart = html.indexOf('[', start + marker.length);
  if (arrayStart < 0) return [];
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = arrayStart; index < html.length; index += 1) {
    const char = html[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '[') depth += 1;
    else if (char === ']' && --depth === 0) {
      try { return JSON.parse(html.slice(arrayStart, index + 1)); } catch { return []; }
    }
  }
  return [];
}

function parseAdminHtml(html, activePage) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const tables = Array.from(doc.querySelectorAll('table')).map((table, tableIndex) => {
    const headers = Array.from(table.querySelectorAll('thead th')).map(node => node.textContent.trim());
    const rows = Array.from(table.querySelectorAll('tbody tr')).map((row, rowIndex) => ({
      id: row.dataset.id || `${tableIndex}-${rowIndex}`,
      cells: Array.from(row.querySelectorAll('td')).map(node => node.textContent.replace(/\s+/g, ' ').trim()),
      data: { ...row.dataset },
    })).filter(row => row.cells.length);
    return { headers, rows };
  }).filter(table => table.headers.length || table.rows.length);

  const forms = Array.from(doc.querySelectorAll('form[action]')).filter(form => form.id !== 'nativeDeleteForm').map(form => {
    const fields = Array.from(form.querySelectorAll('input[name],select[name],textarea[name]')).map((field, index) => {
      const labelNode = field.closest('label') || field.closest('.field,.form-group')?.querySelector('label');
      return {
        key: `${field.name}-${index}`,
        name: field.name,
        label: labelNode?.textContent.replace(/\s+/g, ' ').trim() || field.name.replaceAll('_', ' '),
        type: field.type || field.tagName.toLowerCase(),
        tag: field.tagName.toLowerCase(),
        value: field.value || '',
        checked: field.checked,
        required: field.required,
        group: field.closest('.pillar-section')?.dataset.pillar || (field.type === 'checkbox' ? 'Security' : ''),
        options: field.tagName === 'SELECT' ? Array.from(field.options).map(option => ({ value: option.value, label: option.textContent.trim() })) : [],
      };
    });
    return { action: form.getAttribute('action'), method: form.method || 'post', fields };
  });

  const tickets = activePage === 'admin_raise_ticket'
    ? extractJsonArray(html, 'myTickets')
    : activePage === 'admin_helpdesk' ? extractJsonArray(html, 'allTickets') : [];
  const flagTable = Array.from(doc.querySelectorAll('table')).find(table => table.querySelector('th')?.textContent.includes('Flag Key'));
  const system = activePage === 'admin_system_settings' ? {
    maintenanceLevel: doc.querySelector('#mLevel')?.value || 'off',
    maintenanceMessage: doc.querySelector('#mMessage')?.value || '',
    pipelineLocked: Array.from(doc.querySelectorAll('button')).some(button => button.textContent.includes('Force Unlock')),
    popupMessage: doc.querySelector('#screenPopupMessage')?.value || '',
    popupRoutes: Array.from(doc.querySelectorAll('.screen-popup-route')).map(input => ({
      route: input.value,
      label: input.closest('label')?.textContent.replace(/\s+/g, ' ').trim() || input.value,
      checked: input.checked,
    })),
    flags: Array.from(flagTable?.querySelectorAll('tbody tr') || []).map(row => {
      const cells = Array.from(row.querySelectorAll('td'));
      return cells.length >= 5 ? {
        key: cells[0].textContent.trim(), description: cells[1].textContent.trim(),
        version: cells[2].textContent.trim(), enabled: !!row.querySelector('input[type="checkbox"]')?.checked,
      } : null;
    }).filter(Boolean),
  } : null;
  return { tables, forms, tickets, system };
}

function PageHeader({ activePage, actions }) {
  const [title, subtitle] = PAGE_META[activePage] || ['Administration', 'ERP administration'];
  return <div className="admin-page-head"><div><h1>{title}</h1><p>{subtitle}</p></div><div className="admin-actions">{actions}</div></div>;
}

function DataTable({ table, search = '', onRowClick, selectedId }) {
  if (!table) return <div className="admin-empty">No records found.</div>;
  const query = search.trim().toLowerCase();
  const rows = query ? table.rows.filter(row => row.cells.join(' ').toLowerCase().includes(query)) : table.rows;
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr>{table.headers.map((header, index) => <th key={`${header}-${index}`}>{header}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className={String(selectedId) === String(row.id) ? 'selected' : ''} onClick={() => onRowClick?.(row)} style={{ cursor: onRowClick ? 'pointer' : 'default' }}>{row.cells.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody></table>{!rows.length && <div className="admin-empty">No matching records.</div>}</div>;
}

function DynamicForm({ schema, onSaved }) {
  const initial = useMemo(() => (schema?.fields || []).reduce((values, field) => {
    if (field.type === 'checkbox') {
      if (!Array.isArray(values[field.name])) values[field.name] = [];
      if (field.checked) values[field.name].push(field.value);
    } else values[field.name] = field.value;
    return values;
  }, {}), [schema]);
  const [values, setValues] = useState(initial);
  const [openPermissionGroups, setOpenPermissionGroups] = useState({ Dashboards: true });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  if (!schema) return null;
  const regular = schema.fields.filter(field => !['hidden', 'checkbox'].includes(field.type));
  const checks = schema.fields.filter(field => field.type === 'checkbox');
  const checkGroups = Object.entries(checks.reduce((groups, field) => {
    const group = field.group || 'Security';
    if (!groups[group]) groups[group] = [];
    groups[group].push(field);
    return groups;
  }, {}));
  const submit = async event => {
    event.preventDefault(); setSaving(true); setMessage('');
    const body = new FormData();
    schema.fields.forEach(field => {
      if (field.type === 'checkbox') { if (values[field.name]?.includes?.(field.value)) body.append(field.name, field.value); }
      else body.append(field.name, values[field.name] ?? '');
    });
    try {
      const response = await fetch(schema.action, { method: 'POST', body, credentials: 'include' });
      if (!response.ok) throw new Error('Save failed');
      setMessage('Saved successfully.'); onSaved?.();
    } catch (error) { setMessage(error.message); } finally { setSaving(false); }
  };
  const toggleCheck = field => setValues(current => {
    const selected = Array.isArray(current[field.name]) ? current[field.name] : [];
    return { ...current, [field.name]: selected.includes(field.value) ? selected.filter(value => value !== field.value) : [...selected, field.value] };
  });
  return <form className="admin-form-grid" onSubmit={submit}>{regular.map(field => <div className="admin-field" key={field.key}><label>{field.label}</label>{field.tag === 'select' ? <select value={values[field.name] || ''} required={field.required} onChange={event => setValues({ ...values, [field.name]: event.target.value })}>{field.options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : field.tag === 'textarea' ? <textarea value={values[field.name] || ''} required={field.required} onChange={event => setValues({ ...values, [field.name]: event.target.value })}/> : <input type={field.type} value={values[field.name] || ''} required={field.required} onChange={event => setValues({ ...values, [field.name]: event.target.value })}/>}</div>)}{checks.length > 0 && <div className="permission-pillars">{checkGroups.map(([group, fields]) => { const isOpen = !!openPermissionGroups[group]; const selectedCount = fields.filter(field => (values[field.name] || []).includes?.(field.value)).length; return <div className={`permission-pillar ${isOpen ? 'open' : ''}`} key={group}><button type="button" className="permission-pillar-head" onClick={() => setOpenPermissionGroups(current => ({ ...current, [group]: !current[group] }))}><span><i className={`fa-solid ${isOpen ? 'fa-folder-open' : 'fa-folder'}`}></i>{group}</span><span>{selectedCount}/{fields.length}<i className="fa-solid fa-chevron-right"></i></span></button>{isOpen && <div className="permission-pillar-body">{fields.map(field => <label className="admin-check" key={field.key}><input type="checkbox" checked={(values[field.name] || []).includes?.(field.value)} onChange={() => toggleCheck(field)}/><span>{field.label}</span></label>)}</div>}</div>; })}</div>}<div className="admin-actions" style={{ gridColumn: '1/-1' }}><button className="admin-btn primary" disabled={saving}>{saving ? 'SAVING...' : 'SAVE'}</button>{message && <span className={message.includes('success') ? 'admin-status' : 'admin-error'}>{message}</span>}</div></form>;
}

const EMPTY_USER_FORM = {
  full_name: '', designation: '', email: '', mobile: '', password: '',
  role: 'user', data_management_access: false, access: [],
};

function UserConfiguration() {
  const [config, setConfig] = useState(null);
  const [form, setForm] = useState(EMPTY_USER_FORM);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [permissionSearch, setPermissionSearch] = useState('');
  const [openGroups, setOpenGroups] = useState({ Dashboards: true });
  const [otpEmail, setOtpEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/admin/user-configuration', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Unable to load user configuration.');
      setConfig(data);
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);
  // Load the authenticated tenant configuration after this screen mounts.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const groups = useMemo(() => {
    const query = permissionSearch.trim().toLowerCase();
    return Object.entries((config?.permissions || []).reduce((result, permission) => {
      if (query && !`${permission.label} ${permission.value} ${permission.group}`.toLowerCase().includes(query)) return result;
      if (!result[permission.group]) result[permission.group] = [];
      result[permission.group].push(permission);
      return result;
    }, {}));
  }, [config?.permissions, permissionSearch]);
  const users = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (config?.users || []).filter(user => !query || `${user.id} ${user.name} ${user.email} ${user.mobile} ${user.designation} ${user.role}`.toLowerCase().includes(query));
  }, [config?.users, search]);

  const startAdd = () => {
    setEditingId(null); setForm(EMPTY_USER_FORM); setMessage(''); setError(''); setShowForm(true);
  };
  const startEdit = user => {
    setEditingId(user.id);
    setForm({
      full_name: user.name, designation: user.designation, email: user.email,
      mobile: user.mobile, password: '', role: user.role || 'user',
      data_management_access: !!user.data_management_access,
      access: user.permissions || [],
    });
    setMessage(''); setError(''); setShowForm(true);
  };
  const togglePermission = value => setForm(current => ({
    ...current,
    access: current.access.includes(value)
      ? current.access.filter(permission => permission !== value)
      : [...current.access, value],
  }));
  const toggleGroup = permissions => setForm(current => {
    const values = permissions.map(permission => permission.value);
    const allSelected = values.every(value => current.access.includes(value));
    return { ...current, access: allSelected ? current.access.filter(value => !values.includes(value)) : [...new Set([...current.access, ...values])] };
  });
  const submit = async event => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    const body = new FormData();
    Object.entries(form).forEach(([key, value]) => {
      if (key === 'access') value.forEach(permission => body.append('access', permission));
      else if (key === 'data_management_access') body.append(key, value ? 'true' : 'false');
      else body.append(key, value);
    });
    const url = editingId ? `/admin/edit_user/${editingId}?format=json` : '/admin/add_user';
    try {
      const response = await fetch(url, { method: 'POST', body, credentials: 'include', headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.status === 'error') throw new Error(data.detail || data.msg || 'Unable to save user.');
      if (data.status === 'otp_required') {
        setOtpEmail(data.email); setOtp(''); setMessage(data.msg);
      } else {
        setMessage(data.msg || 'User updated successfully.');
        setShowForm(false); setEditingId(null); await load();
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  };
  const verifyOtp = async () => {
    if (!otp.trim()) { setError('Enter the verification OTP.'); return; }
    setSaving(true); setError('');
    const body = new FormData(); body.append('email', otpEmail); body.append('otp', otp.trim());
    try {
      const response = await fetch('/admin/verify_add_user_otp', { method: 'POST', body, credentials: 'include', headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.status !== 'success') throw new Error(data.detail || data.msg || 'OTP verification failed.');
      setOtpEmail(''); setOtp(''); setShowForm(false); setMessage(data.msg); await load();
    } catch (requestError) { setError(requestError.message); }
    finally { setSaving(false); }
  };
  const resendOtp = async () => {
    const body = new FormData(); body.append('email', otpEmail);
    setSaving(true); setError('');
    try {
      const response = await fetch('/admin/resend_add_user_otp', { method: 'POST', body, credentials: 'include', headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.status !== 'success') throw new Error(data.detail || data.msg || 'Unable to resend OTP.');
      setMessage(data.msg);
    } catch (requestError) { setError(requestError.message); }
    finally { setSaving(false); }
  };
  const toggleStatus = async user => {
    if (!window.confirm(`${user.is_active ? 'Deactivate' : 'Activate'} ${user.name}?`)) return;
    setError('');
    try {
      const response = await fetch(`/admin/toggle_user/${user.id}?format=json`, { method: 'POST', credentials: 'include', headers: { Accept: 'application/json' } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.detail || 'Unable to update status.');
      setMessage(data.msg); await load();
    } catch (requestError) { setError(requestError.message); }
  };

  return <div className="admin-react-page user-config-page">
    <PageHeader activePage="admin_add_user" actions={<><button className="admin-btn" onClick={load}>REFRESH</button><button className="admin-btn primary" onClick={showForm ? () => setShowForm(false) : startAdd}>{showForm ? 'CANCEL' : 'ADD NEW USER'}</button></>}/>
    {error && <div className="admin-card admin-error user-config-feedback">{error}</div>}
    {message && <div className="admin-card user-config-feedback"><span className="admin-status">{message}</span></div>}
    {showForm && <div className="admin-card">
      <div className="admin-toolbar"><h2>{editingId ? 'Edit User Profile' : 'Create New User Profile'}</h2><span className="admin-status">{config?.company?.code}</span></div>
      <form className="admin-form-grid" onSubmit={submit}>
        {[['full_name','Full Name','text'],['designation','Designation','text'],['email','Email Address','email'],['mobile','Mobile Reference','text'],['password',editingId ? 'New Password (optional)' : 'Access Password (default applied if empty)','password']].map(([name,label,type]) => <div className="admin-field" key={name}><label>{label}</label><input type={type} minLength={name === 'password' && form.password ? 8 : undefined} maxLength={name === 'password' ? 64 : undefined} required={!['password'].includes(name)} value={form[name]} onChange={event => setForm(current => ({ ...current, [name]: event.target.value }))}/></div>)}
        <div className="admin-field"><label>System Role</label><select value={form.role} onChange={event => setForm(current => ({ ...current, role: event.target.value }))}>{(config?.roles || []).map(role => <option key={role.value} value={role.value}>{role.label}</option>)}</select></div>
        <label className="admin-check user-config-dm"><input type="checkbox" checked={form.data_management_access} onChange={event => setForm(current => ({ ...current, data_management_access: event.target.checked }))}/><span>Data Management Access</span></label>
        <div className="permission-pillars user-config-permissions">
          <div className="admin-toolbar"><h2>Ecosystem Access Matrix</h2><input className="admin-search" placeholder="Search permissions…" value={permissionSearch} onChange={event => setPermissionSearch(event.target.value)}/></div>
          {groups.map(([group, permissions]) => {
            const isOpen = !!openGroups[group] || !!permissionSearch;
            const selectedCount = permissions.filter(permission => form.access.includes(permission.value)).length;
            return <div className={`permission-pillar ${isOpen ? 'open' : ''}`} key={group}>
              <div className="permission-pillar-head"><button type="button" onClick={() => setOpenGroups(current => ({ ...current, [group]: !current[group] }))}><span><i className={`fa-solid ${isOpen ? 'fa-folder-open' : 'fa-folder'}`}></i>{group}</span></button><button type="button" onClick={() => toggleGroup(permissions)}>{selectedCount}/{permissions.length} • {selectedCount === permissions.length ? 'CLEAR' : 'SELECT ALL'}</button></div>
              {isOpen && <div className="permission-pillar-body">{permissions.map(permission => <label className="admin-check" key={permission.value}><input type="checkbox" checked={form.access.includes(permission.value)} onChange={() => togglePermission(permission.value)}/><span>{permission.label}</span></label>)}</div>}
            </div>;
          })}
        </div>
        <div className="admin-actions user-config-save"><button className="admin-btn primary" disabled={saving}>{saving ? 'SAVING…' : 'SAVE'}</button></div>
      </form>
    </div>}
    <div className="admin-card">
      <div className="admin-toolbar"><h2>Configured User Accounts</h2><input className="admin-search" placeholder="Search users…" value={search} onChange={event => setSearch(event.target.value)}/></div>
      {!config ? <div className="admin-empty">Loading users…</div> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>User ID</th><th>Name</th><th>Email</th><th>Mobile</th><th>Designation</th><th>Role</th><th>Status</th><th>Permissions</th><th>Actions</th></tr></thead><tbody>{users.map(user => <tr key={user.id}><td><b>{user.id}</b></td><td>{user.name}</td><td>{user.email}</td><td>{user.mobile}</td><td>{user.designation}</td><td>{user.role === 'admin' ? 'Administrator' : 'Operational User'}</td><td><span className={`user-status ${user.is_active ? 'active' : 'inactive'}`}>{user.is_active ? 'Active' : 'Inactive'}</span></td><td className="user-permissions-cell" title={user.permissions.join(', ')}>{user.permissions.length} assigned</td><td><div className="admin-actions"><button className="admin-btn" type="button" onClick={() => startEdit(user)}>EDIT</button><button className="admin-btn danger" type="button" onClick={() => toggleStatus(user)}>{user.is_active ? 'DEACTIVATE' : 'ACTIVATE'}</button></div></td></tr>)}</tbody></table>{!users.length && <div className="admin-empty">No matching users.</div>}</div>}
    </div>
    {otpEmail && <div className="user-otp-overlay"><div className="admin-card user-otp-card"><h2>Verify New User</h2><p>Enter the OTP sent to <b>{otpEmail}</b>. It expires in {config?.otp_expiry_minutes || 10} minutes.</p><input className="admin-search" inputMode="numeric" maxLength="6" autoFocus value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, ''))}/><div className="admin-actions"><button className="admin-btn primary" disabled={saving} onClick={verifyOtp}>VERIFY & SAVE</button><button className="admin-btn" disabled={saving} onClick={resendOtp}>RESEND OTP</button><button className="admin-btn danger" onClick={() => { setOtpEmail(''); setOtp(''); }}>CANCEL</button></div></div></div>}
  </div>;
}

function StandardAdminPage({ activePage, activeRoute }) {
  const [snapshot, setSnapshot] = useState(null); const [error, setError] = useState(''); const [search, setSearch] = useState(''); const [showForm, setShowForm] = useState(false); const [selectedRow, setSelectedRow] = useState(null); const [editSchema, setEditSchema] = useState(null);
  const load = useCallback(async () => { setError(''); try { const response = await fetch(activeRoute, { credentials: 'include', headers: { Accept: 'text/html' } }); if (!response.ok) throw new Error(`Unable to load (${response.status})`); const html = await response.text(); setSnapshot(parseAdminHtml(html, activePage)); } catch (err) { setError(err.message); } }, [activePage, activeRoute]);
  // Data is sourced from the authenticated legacy endpoint after the React screen mounts.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  const addLabel = activePage === 'admin_add_user' ? 'ADD NEW USER' : activePage === 'admin_shifts' ? 'ADD SHIFT' : 'ADD NEW';
  const tableTitle = activePage === 'admin_add_user' ? 'Configured User Accounts' : activePage === 'admin_shifts' ? 'Registered Shifts List' : activePage === 'admin_manage_support' ? 'Support Team Members' : 'Records';
  const startAdd = () => { setSelectedRow(null); setEditSchema(null); setShowForm(value => !value); };
  const startEdit = () => {
    if (!selectedRow || !snapshot?.forms?.[0]) return;
    const permissions = (selectedRow.data.permissions || '').split(',').map(value => value.trim());
    const valueMap = activePage === 'admin_add_user' ? { full_name:selectedRow.data.name, designation:selectedRow.data.designation, email:selectedRow.data.email, mobile:selectedRow.data.mobile, role:selectedRow.data.role, data_management_access:selectedRow.data.dmAccess } : { shift_id:selectedRow.data.id, production_at:selectedRow.data.plant, shift_name:selectedRow.data.name, start_time:selectedRow.data.start?.slice(0,5), end_time:selectedRow.data.end?.slice(0,5), break_minutes:selectedRow.data.break, is_night_shift:String(selectedRow.data.night).toLowerCase() === 'true' ? 'True' : 'False' };
    setEditSchema({ ...snapshot.forms[0], action: activePage === 'admin_add_user' ? `/admin/edit_user/${selectedRow.id}` : snapshot.forms[0].action, fields: snapshot.forms[0].fields.map(field => ({ ...field, value:valueMap[field.name] ?? field.value, checked:field.type === 'checkbox' ? permissions.includes(field.value) : field.checked })) });
    setShowForm(true);
  };
  const cancelRecord = async () => {
    if (!selectedRow) return;
    const url = activePage === 'admin_add_user' ? `/admin/toggle_user/${selectedRow.id}` : `/attendance/shifts/delete/${selectedRow.id}`;
    if (!window.confirm(activePage === 'admin_add_user' ? 'Toggle this user active status?' : 'Cancel this shift?')) return;
    await fetch(url, { method:'POST', credentials:'include' }); setSelectedRow(null); load();
  };
  return <div className="admin-react-page"><PageHeader activePage={activePage} actions={<><button className="admin-btn" onClick={load}>REFRESH</button>{selectedRow && snapshot?.forms?.length > 0 && <><button className="admin-btn" onClick={startEdit}>EDIT</button><button className="admin-btn danger" onClick={cancelRecord}>{activePage === 'admin_add_user' ? 'TOGGLE STATUS' : 'CANCEL SHIFT'}</button></>} {snapshot?.forms?.length > 0 && <button className="admin-btn primary" onClick={startAdd}>{showForm ? 'CANCEL' : addLabel}</button>}</>}/>{error && <div className="admin-card admin-error">{error}</div>}{showForm && (editSchema || snapshot?.forms?.[0]) && <div className="admin-card"><div className="admin-toolbar"><h2>{editSchema ? 'Edit Profile' : activePage === 'admin_add_user' ? 'Create New Profile' : 'Shift Configuration'}</h2></div><DynamicForm key={editSchema?.action || 'create'} schema={editSchema || snapshot.forms[0]} onSaved={() => { setShowForm(false); setEditSchema(null); setSelectedRow(null); load(); }}/></div>}<div className="admin-card"><div className="admin-toolbar"><h2>{tableTitle}</h2><input className="admin-search" placeholder="Search records..." value={search} onChange={event => setSearch(event.target.value)}/></div>{snapshot ? snapshot.tables.map((table, index) => <DataTable key={index} table={table} search={search} selectedId={index === 0 ? selectedRow?.id : null} onRowClick={index === 0 && snapshot.forms.length ? setSelectedRow : undefined}/>) : <div className="admin-empty">Loading...</div>}</div></div>;
}

export function TicketDesk({ activePage, activeRoute, compact = false }) {
  const isAdmin = activePage === 'admin_helpdesk';
  const [supportView, setSupportView] = useState(isAdmin ? 'tickets' : 'knowledge');
  const [knowledge, setKnowledge] = useState({ entries: [], categories: [], total: 0 });
  const [knowledgeSearch, setKnowledgeSearch] = useState('');
  const [expandedAnswer, setExpandedAnswer] = useState('');
  const [knowledgeSuggestOpen, setKnowledgeSuggestOpen] = useState(false);
  const [knowledgeLoading, setKnowledgeLoading] = useState(true);
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [search, setSearch] = useState('');
  const [reply, setReply] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [status, setStatus] = useState('OPEN');
  const [newOpen, setNewOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [detail, setDetail] = useState('');
  const [loadingTickets, setLoadingTickets] = useState(true);
  const [ticketError, setTicketError] = useState('');

  const loadTickets = useCallback(async () => {
    setLoadingTickets(true);
    setTicketError('');
    try {
      const requestRoute = activePage === 'admin_raise_ticket'
        ? `${activeRoute}${activeRoute.includes('?') ? '&' : '?'}format=json`
        : activeRoute;
      const response = await fetch(requestRoute, {
        credentials: 'include',
        headers: { Accept: activePage === 'admin_raise_ticket' ? 'application/json' : 'text/html' },
      });
      if (!response.ok) throw new Error(`Unable to load complaints (HTTP ${response.status}).`);
      if (activePage === 'admin_raise_ticket') {
        const payload = await response.json();
        setTickets(payload.tickets || []);
      } else {
        const parsed = parseAdminHtml(await response.text(), activePage);
        setTickets(parsed.tickets);
      }
    } catch (error) {
      setTickets([]);
      setTicketError(error.message || 'Unable to load complaints.');
    } finally {
      setLoadingTickets(false);
    }
  }, [activePage, activeRoute]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadTickets(); }, [loadTickets]);
  useEffect(() => {
    let active = true;
    fetch('/support/knowledge-base', { credentials: 'include', headers: { Accept: 'application/json' } })
      .then(response => {
        if (!response.ok) throw new Error('Unable to load the knowledge base.');
        return response.json();
      })
      .then(payload => { if (active) setKnowledge(payload); })
      .catch(error => { if (active) setTicketError(error.message); })
      .finally(() => { if (active) setKnowledgeLoading(false); });
    return () => { active = false; };
  }, []);

  const openTicket = async ticket => {
    setSelected(ticket); setStatus(ticket.status); setAttachment(null);
    const response = await fetch(`${isAdmin ? '/admin' : '/support'}/get_messages/${ticket.id}`, { credentials: 'include' });
    const data = await response.json(); setMessages(data.messages || []);
  };
  const send = async () => {
    if (!selected || (!reply.trim() && !attachment)) return;
    const body = new FormData(); body.append('ticket_id', selected.id); body.append('message', reply.trim());
    if (attachment) body.append('file', attachment);
    const response = await fetch(`${isAdmin ? '/admin' : '/support'}/send_message`, { method: 'POST', body, credentials: 'include' });
    if (response.ok) { setReply(''); setAttachment(null); openTicket(selected); }
  };
  const updateStatus = async () => {
    const body = new FormData(); body.append('ticket_id', selected.id); body.append('status', status);
    const response = await fetch('/admin/update_ticket_status', { method: 'POST', body, credentials: 'include' });
    if (response.ok) { const next = { ...selected, status }; setTickets(current => current.map(ticket => ticket.id === selected.id ? next : ticket)); openTicket(next); }
  };
  const createTicket = async event => {
    event.preventDefault(); const body = new FormData(); body.append('subject', subject); body.append('message', detail);
    const response = await fetch('/support/create_ticket', { method: 'POST', body, credentials: 'include' });
    if (response.ok) { setNewOpen(false); setSubject(''); setDetail(''); loadTickets(); }
  };
  const visible = tickets.filter(ticket => `${ticket.ticket_number} ${ticket.subject} ${ticket.user_email || ''}`.toLowerCase().includes(search.toLowerCase()));
  const normalizeQuestion = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const knowledgeQuery = normalizeQuestion(knowledgeSearch);
  const questionMatchScore = question => {
    if (!knowledgeQuery) return 0;
    const normalized = normalizeQuestion(question);
    const queryWords = knowledgeQuery.split(' ').filter(Boolean);
    if (!queryWords.every(word => normalized.includes(word))) return -1;
    const questionWords = normalized.split(' ');
    return (normalized.startsWith(knowledgeQuery) ? 1000 : 0)
      + (normalized.includes(knowledgeQuery) ? 500 : 0)
      + queryWords.reduce((score, word) => score + (questionWords.some(questionWord => questionWord.startsWith(word)) ? 50 : 10), 0)
      - normalized.length / 1000;
  };
  const visibleKnowledge = (knowledge.entries || []).filter(item => {
    if (!knowledgeQuery) return false;
    return questionMatchScore(item.question) >= 0;
  });
  const knowledgeSuggestions = knowledgeQuery ? (knowledge.entries || [])
    .filter(item => questionMatchScore(item.question) >= 0)
    .sort((left, right) => questionMatchScore(right.question) - questionMatchScore(left.question))
    .slice(0, 8) : [];
  const selectKnowledgeSuggestion = item => {
    setKnowledgeSearch(item.question);
    setExpandedAnswer(item.id);
    setKnowledgeSuggestOpen(false);
  };
  const openNewComplaint = () => { setSupportView('tickets'); setNewOpen(true); };

  return <div className={`admin-react-page ${compact ? 'support-drawer-page' : ''}`}>
    {compact ? <div className="admin-toolbar support-drawer-toolbar"><h2>{isAdmin ? 'Support Queue' : 'SVBK Support'}</h2>{!isAdmin && <button className="admin-btn primary" onClick={openNewComplaint}>NEW COMPLAINT</button>}</div> : <PageHeader activePage={activePage} actions={!isAdmin && <button className="admin-btn primary" onClick={openNewComplaint}>NEW COMPLAINT</button>}/>}
    <div className="support-mode-tabs"><button type="button" className={supportView === 'knowledge' ? 'active' : ''} onClick={() => setSupportView('knowledge')}><i className="fa-solid fa-book-open"></i> Knowledge Base <span>{knowledge.total || 0}</span></button><button type="button" className={supportView === 'tickets' ? 'active' : ''} onClick={() => setSupportView('tickets')}><i className="fa-solid fa-ticket"></i> {isAdmin ? 'Support Queue' : 'My Complaints'} <span>{tickets.length}</span></button></div>
    {supportView === 'knowledge' ? <div className="support-kb">
      <div className="support-kb-search"><i className="fa-solid fa-magnifying-glass"></i><input value={knowledgeSearch} onFocus={() => setKnowledgeSuggestOpen(true)} onBlur={() => window.setTimeout(() => setKnowledgeSuggestOpen(false), 150)} onChange={event => { setKnowledgeSearch(event.target.value); setKnowledgeSuggestOpen(true); }} placeholder="Type a question…" />{knowledgeSuggestOpen && knowledgeQuery ? <div className="support-kb-suggestions">{knowledgeSuggestions.length ? knowledgeSuggestions.map(item => <button type="button" key={item.id} onMouseDown={event => event.preventDefault()} onClick={() => selectKnowledgeSuggestion(item)}><i className="fa-regular fa-circle-question"></i><span><strong>{item.question}</strong></span></button>) : <div>No related questions found.</div>}</div> : null}</div>
      <div className="support-kb-results">{!knowledgeQuery ? null : knowledgeLoading ? <div className="admin-empty">Loading complete ERP knowledge base…</div> : visibleKnowledge.length ? visibleKnowledge.map(item => <article className={`support-kb-item ${expandedAnswer === item.id ? 'open' : ''}`} key={item.id}><button type="button" onClick={() => setExpandedAnswer(current => current === item.id ? '' : item.id)}><span><strong>{item.question}</strong></span><i className={`fa-solid fa-chevron-${expandedAnswer === item.id ? 'up' : 'down'}`}></i></button>{expandedAnswer === item.id ? <div className="support-kb-answer"><p>{item.answer}</p>{item.route ? <code>{item.route}</code> : null}</div> : null}</article>) : <div className="admin-empty">No matching answer found. Raise a complaint with the page name and exact issue.</div>}</div>
    </div> : <>
    {newOpen && <div className="admin-card"><form className="admin-form-grid" onSubmit={createTicket}><div className="admin-field"><label>Issue Summary</label><input required value={subject} onChange={event => setSubject(event.target.value)}/></div><div className="admin-field" style={{ gridColumn: 'span 2' }}><label>Detailed Message</label><textarea required value={detail} onChange={event => setDetail(event.target.value)}/></div><button className="admin-btn primary">SUBMIT TICKET</button></form></div>}
    {ticketError && <div className="admin-card admin-error" role="alert">{ticketError} <button className="admin-btn" type="button" onClick={loadTickets}>RETRY</button></div>}
    <div className="ticket-layout">
      <div className="admin-card"><input className="admin-search" style={{ maxWidth: '100%', marginBottom: 10 }} placeholder="Search tickets, subjects..." value={search} onChange={event => setSearch(event.target.value)}/><div className="ticket-list">{loadingTickets ? <div className="admin-empty">Loading complaints...</div> : visible.length ? visible.map(ticket => <div key={ticket.id} className={`ticket-card ${selected?.id === ticket.id ? 'active' : ''}`} onClick={() => openTicket(ticket)}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong>{ticket.ticket_number}</strong><small>{ticket.date}</small></div><span>{ticket.subject}</span><small>{ticket.status}{ticket.user_email ? ` · ${ticket.user_email}` : ''}</small></div>) : <div className="admin-empty">No complaints found.</div>}</div></div>
      <div className="admin-card">{selected ? <>
        <div className="admin-toolbar"><div><h2>{selected.subject}</h2><small style={{ color: 'var(--text-tertiary)' }}>{selected.ticket_number}{selected.user_email ? ` · ${selected.user_email} · ${selected.company_id}` : ''}</small></div>{isAdmin ? <div className="admin-actions"><select className="admin-search" value={status} onChange={event => setStatus(event.target.value)}><option value="OPEN">OPEN</option><option value="IN_PROGRESS">IN PROGRESS</option><option value="RESOLVED">RESOLVED</option></select><button className="admin-btn primary" onClick={updateStatus}>UPDATE STATUS</button></div> : <span className="admin-status">{selected.status}</span>}</div>
        <div className="chat-box">{messages.map((message, index) => <div key={index} className={`chat-msg ${(isAdmin ? message.sender_type === 'ADMIN' : message.sender_type === 'USER') ? 'mine' : ''}`}>{message.message}{message.media_path && <div><a href={message.media_path} target="_blank" rel="noreferrer">Attachment</a></div>}<small>{message.time}</small></div>)}</div>
        {selected.status === 'RESOLVED' && isAdmin ? <div className="admin-empty">This ticket is permanently closed.</div> : <div className="chat-compose"><label className="admin-btn" style={{ display: 'grid', placeItems: 'center' }} title="Attach file"><i className="fa-solid fa-paperclip"></i><input type="file" hidden onChange={event => setAttachment(event.target.files?.[0] || null)}/></label><input value={reply} onChange={event => setReply(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') send(); }} placeholder={attachment ? attachment.name : 'Type a reply...'}/><button className="admin-btn primary" onClick={send}>SEND</button></div>}
      </> : <div className="admin-empty">Select a ticket to view conversation.</div>}</div>
    </div>
    </>}
  </div>;
}

function DataManagement({ activePage }) {
  const [schema, setSchema] = useState({});
  const [history, setHistory] = useState([]);
  const [blankTable, setBlankTable] = useState('');
  const [cleanupTable, setCleanupTable] = useState('');
  const [upload, setUpload] = useState(null);
  const [uploadInfo, setUploadInfo] = useState(null);
  const [targetTable, setTargetTable] = useState('');
  const [sheet, setSheet] = useState('');
  const [mapping, setMapping] = useState({});
  const [message, setMessage] = useState('');
  const modules = ['processing', 'inventory', 'accounts', 'bills', 'general-stock', 'payments', 'masters', 'hrms'];

  const load = useCallback(async () => {
    const [schemaRes, historyRes] = await Promise.all([
      fetch('/data-management/db-schema', { credentials: 'include' }),
      fetch('/data-management/history', { credentials: 'include' }),
    ]);
    const schemaData = await schemaRes.json(); const historyData = await historyRes.json();
    setSchema(schemaData.tables || {}); setHistory(historyData.history || []);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const downloadBlob = async (endpoint, label, method = 'POST', downloadToken = '') => {
    const response = await fetch(endpoint, { method, credentials: 'include', headers: { 'X-SVBK-Download-Token': downloadToken, Accept: 'application/json' } });
    if (!response.ok) {
      const failure = await response.json().catch(() => ({}));
      throw new Error(failure.detail || failure.error || `${label} download failed`);
    }
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
    const disposition = response.headers.get('content-disposition') || '';
    const filename = disposition.match(/filename=\"?([^\";]+)\"?/i)?.[1];
    anchor.href = url; anchor.download = filename || `SVBK_${label}_Export.xlsx`; anchor.style.display = 'none';
    document.body.appendChild(anchor); anchor.click();
    window.setTimeout(() => { anchor.remove(); URL.revokeObjectURL(url); }, 1500);
  };
  const secureAction = async (action, module, callback) => {
    if (!window.confirm(`Security clearance is required to ${action} ${module}. Send OTP?`)) return;
    const generate = await fetch('/data-management/generate-otp', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, module }) });
    const generated = await generate.json(); if (!generated.success) return setMessage(generated.error || 'OTP failed');
    const otp = window.prompt(`${generated.message}\nEnter 6-digit Admin OTP:`); if (!otp) return;
    const verify = await fetch('/data-management/verify-otp', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, otp }) });
    const verified = await verify.json(); if (!verified.success) return setMessage(verified.error || 'Invalid OTP');
    try { await callback(verified.download_token || ''); setMessage(`${action.toUpperCase()} completed successfully.`); load(); } catch (error) { setMessage(error.message); }
  };
  const inspectFile = async () => {
    if (!upload) return setMessage('Select an Excel file first.');
    const body = new FormData(); body.append('excel_file', upload);
    const response = await fetch('/data-management/inspect-file', { method: 'POST', body }); const data = await response.json();
    if (!data.success) return setMessage(data.error || 'Unable to inspect file');
    setUploadInfo(data); const firstSheet = Object.keys(data.sheets || {})[0] || ''; setSheet(firstSheet); setMessage('File inspected. Select a table and map columns.');
  };
  const buildMapping = (tableName, sheetName) => {
    const excelColumns = uploadInfo?.sheets?.[sheetName] || [];
    return Object.fromEntries((schema[tableName] || []).map(column => [column, excelColumns.find(excel => excel.toLowerCase() === column.toLowerCase()) || '']));
  };
  const executeImport = () => secureAction('import', targetTable, async () => {
    const response = await fetch('/data-management/execute-import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filename: uploadInfo.filename, table_name: targetTable, sheet_name: sheet, mapping: Object.fromEntries(Object.entries(mapping).filter(([,value]) => value)) }) });
    const data = await response.json(); if (!data.success) throw new Error(data.error || 'Import failed');
  });
  const recovery = action => secureAction(action, cleanupTable, async () => {
    const endpoint = action === 'undo' ? '/data-management/undo-import' : '/data-management/clear-table';
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ table_name: cleanupTable }) });
    const data = await response.json(); if (!data.success) throw new Error(data.error || `${action} failed`);
  });
  const excelColumns = uploadInfo?.sheets?.[sheet] || [];

  return <div className="admin-react-page">
    <PageHeader activePage={activePage}/>
    {message && <div className="admin-card"><span className="admin-status">{message}</span></div>}
    <div className="admin-control-grid">
      <div className="admin-card"><div className="admin-toolbar"><h2>Secure Module Data Exports</h2></div><div className="admin-form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>{modules.map(module => <button className="admin-btn" key={module} onClick={() => secureAction('export', module, token => downloadBlob(`/export/${module}`, module, 'GET', token))}>{module.replace('-', ' ').toUpperCase()}</button>)}</div></div>
      <div className="admin-card"><div className="admin-toolbar"><h2>Blank Import Sheets</h2></div><p style={{ color: 'var(--text-secondary)' }}>Select a table to download a blank template with column headers and format hints.</p><div className="admin-field"><label>Database Table</label><select value={blankTable} onChange={event => setBlankTable(event.target.value)}><option value="">All Tables (Full Workbook)</option>{Object.keys(schema).map(name => <option key={name}>{name}</option>)}</select></div><button className="admin-btn primary" style={{ marginTop: 10 }} onClick={() => secureAction('download', blankTable || 'All Blank Import Sheets', token => downloadBlob(`/data-management/template/blank${blankTable ? `?table=${encodeURIComponent(blankTable)}` : ''}`, blankTable || 'All Blank Import Sheets', 'GET', token))}>DOWNLOAD BLANK SHEET</button></div>
    </div>
    <RegisterLibrary modules={['exports', 'processing', 'inventory', 'accounts', 'hrms']} embedded onDownload={(url, label, method) => secureAction('export', label, token => downloadBlob(url, label, method, token))} />
    <div className="admin-card"><div className="admin-toolbar"><h2>Dynamic Excel Import & Column Mapping</h2></div><div className="admin-form-grid"><div className="admin-field"><label>Excel File</label><input type="file" accept=".xlsx,.xls" onChange={event => setUpload(event.target.files?.[0] || null)}/></div><div className="admin-actions" style={{ alignItems: 'end' }}><button className="admin-btn primary" onClick={inspectFile}>INSPECT FILE</button></div>{uploadInfo && <><div className="admin-field"><label>Excel Sheet</label><select value={sheet} onChange={event => { const next = event.target.value; setSheet(next); setMapping(buildMapping(targetTable, next)); }}>{Object.keys(uploadInfo.sheets || {}).map(name => <option key={name}>{name}</option>)}</select></div><div className="admin-field"><label>Database Table</label><select value={targetTable} onChange={event => { const next = event.target.value; setTargetTable(next); setMapping(buildMapping(next, sheet)); }}><option value="">Select table</option>{Object.keys(schema).map(name => <option key={name}>{name}</option>)}</select></div></>}</div>{targetTable && sheet && <><div className="admin-table-wrap" style={{ marginTop: 12 }}><table className="admin-table"><thead><tr><th>Database Field Name</th><th>Matching Excel Column</th></tr></thead><tbody>{(schema[targetTable] || []).map(column => <tr key={column}><td>{column}</td><td><select className="admin-search" value={mapping[column] || ''} onChange={event => setMapping({ ...mapping, [column]: event.target.value })}><option value="">-- Ignore --</option>{excelColumns.map(excel => <option key={excel}>{excel}</option>)}</select></td></tr>)}</tbody></table></div><button className="admin-btn primary" style={{ marginTop: 12 }} onClick={executeImport}>VERIFY OTP & IMPORT DATA</button></>}</div>
    <div className="admin-card"><div className="admin-toolbar"><h2>Emergency Recovery & Cleanup</h2></div><div className="admin-form-grid"><div className="admin-field"><label>Database Table</label><select value={cleanupTable} onChange={event => setCleanupTable(event.target.value)}><option value="">Select table</option>{Object.keys(schema).map(name => <option key={name}>{name}</option>)}</select></div><div className="admin-actions" style={{ alignItems: 'end' }}><button className="admin-btn" disabled={!cleanupTable} onClick={() => recovery('undo')}>UNDO LAST IMPORT</button><button className="admin-btn danger" disabled={!cleanupTable} onClick={() => recovery('clear')}>CLEAR TABLE</button></div></div></div>
    <div className="admin-card"><div className="admin-toolbar"><h2>Data Management History</h2></div><DataTable table={{ headers: ['Timestamp','Action','Module / Table','Details','Status'], rows: history.map((item,index) => ({ id:index,cells:[item.timestamp || item.date || '',item.type || '',item.module || '',item.details || '',item.status || ''] })) }}/></div>
  </div>;
}

function SystemSettings({ activePage, activeRoute }) {
  const [snapshot, setSnapshot] = useState(null); const [level, setLevel] = useState('off'); const [notice, setNotice] = useState(''); const [popupMessage, setPopupMessage] = useState(''); const [selectedRoutes, setSelectedRoutes] = useState([]); const [message, setMessage] = useState('');
  const load = useCallback(async () => { const response = await fetch(activeRoute, { credentials: 'include' }); const html = await response.text(); const next = parseAdminHtml(html, activePage); setSnapshot(next); setLevel(next.system?.maintenanceLevel || 'off'); setNotice(next.system?.maintenanceMessage || ''); setPopupMessage(next.system?.popupMessage || ''); setSelectedRoutes((next.system?.popupRoutes || []).filter(item => item.checked).map(item => item.route)); }, [activePage, activeRoute]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  const postJson = async (url, body, method = 'POST') => { setMessage(''); const response = await fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: method === 'DELETE' ? undefined : JSON.stringify(body) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.detail || data.error || 'Action failed'); return data; };
  const applyMaintenance = async () => { try { const url = level === 'soft' ? '/admin/maintenance/soft/enable' : level === 'hard' ? '/admin/maintenance/hard/enable' : '/admin/maintenance/disable'; await postJson(url, level === 'off' ? {} : { message: notice }); setMessage('Maintenance status updated.'); load(); } catch (error) { setMessage(error.message); } };
  const togglePipeline = async () => { try { if (snapshot?.system?.pipelineLocked) await postJson('/admin/deploy/unlock', { version: 'manual-unlock', result: 'rollback', detail: 'Forced manually via Admin UI' }); else await postJson('/admin/deploy/lock', { version: 'manual-lock-test' }); setMessage('Pipeline lock updated.'); load(); } catch (error) { setMessage(error.message); } };
  const savePopup = async enabled => { try { await postJson('/admin/screen-popup-settings', { enabled, routes: enabled ? selectedRoutes : [], message: enabled ? popupMessage : '' }); setMessage(enabled ? 'Screen popup saved.' : 'Screen popup cleared.'); load(); } catch (error) { setMessage(error.message); } };
  const toggleFlag = async flag => { try { await postJson('/admin/feature-flags', { flag_key: flag.key, description: flag.description, introduced_in: flag.version, is_enabled: !flag.enabled }); load(); } catch (error) { setMessage(error.message); } };
  const deleteFlag = async flag => { if (!window.confirm(`Cancel feature flag ${flag.key}?`)) return; try { await postJson(`/admin/feature-flags/${encodeURIComponent(flag.key)}`, {}, 'DELETE'); load(); } catch (error) { setMessage(error.message); } };
  if (!snapshot) return <div className="admin-react-page"><PageHeader activePage={activePage}/><div className="admin-empty">Loading system controls...</div></div>;
  const system = snapshot.system || {}; const auditTable = snapshot.tables.find(table => table.headers.includes('Timestamp') && table.headers.includes('Git Commit'));
  return <div className="admin-react-page"><PageHeader activePage={activePage} actions={<button className="admin-btn" onClick={load}>REFRESH</button>}/>{message && <div className="admin-card"><span className="admin-status">{message}</span></div>}<div className="admin-control-grid"><div className="admin-card"><div className="admin-toolbar"><h2>Maintenance Controls</h2><span className="admin-status">STATUS: {level.toUpperCase()}</span></div><div className="admin-field"><label>Maintenance Severity Level</label><select value={level} onChange={event => setLevel(event.target.value)}><option value="off">OFF - Normal System Operation</option><option value="soft">SOFT - Block Users, Allow Admins</option><option value="hard">HARD - Block Users & Admins</option></select></div><div className="admin-field" style={{ marginTop: 10 }}><label>Broadcast Notice Message</label><textarea rows="3" value={notice} onChange={event => setNotice(event.target.value)}/></div><button className="admin-btn primary" style={{ marginTop: 10 }} onClick={applyMaintenance}>APPLY STATUS</button></div><div className="admin-card"><div className="admin-toolbar"><h2>Deployment Pipeline Lock</h2><span className="admin-status">{system.pipelineLocked ? 'LOCKED' : 'AVAILABLE'}</span></div><p style={{ color: 'var(--text-secondary)', minHeight: 54 }}>{system.pipelineLocked ? 'Deployment lock is active. Release it only after confirming that no deployment is running.' : 'Pipeline lock is currently free. Deployment scripts can run safely.'}</p><button className={`admin-btn ${system.pipelineLocked ? 'danger' : 'primary'}`} onClick={togglePipeline}>{system.pipelineLocked ? 'FORCE UNLOCK PIPELINE' : 'MANUAL TEST LOCK'}</button></div></div><div className="admin-card"><div className="admin-toolbar"><h2>Screen Popup Broadcast</h2><span className="admin-status">{selectedRoutes.length ? 'ACTIVE' : 'OFF'}</span></div><div className="admin-control-grid"><div className="admin-checks" style={{ gridColumn: 'auto', maxHeight: 210 }}>{(system.popupRoutes || []).map(item => <label className="admin-check" key={item.route}><input type="checkbox" checked={selectedRoutes.includes(item.route)} onChange={() => setSelectedRoutes(current => current.includes(item.route) ? current.filter(route => route !== item.route) : [...current,item.route])}/>{item.label}</label>)}</div><div><div className="admin-field"><label>Popup Message</label><textarea rows="5" value={popupMessage} onChange={event => setPopupMessage(event.target.value)}/></div><div className="admin-actions" style={{ marginTop: 10 }}><button className="admin-btn primary" onClick={() => savePopup(true)}>SAVE POPUP</button><button className="admin-btn danger" onClick={() => savePopup(false)}>CLEAR POPUP</button></div></div></div></div><div className="admin-card"><div className="admin-toolbar"><h2>Feature Flags Matrix</h2></div><div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Flag Key</th><th>Description</th><th>Introduced In</th><th>Status</th><th>Actions</th></tr></thead><tbody>{(system.flags || []).map(flag => <tr key={flag.key}><td>{flag.key}</td><td>{flag.description}</td><td>{flag.version}</td><td><button className="admin-btn" onClick={() => toggleFlag(flag)}>{flag.enabled ? 'ENABLED' : 'DISABLED'}</button></td><td><button className="admin-btn danger" onClick={() => deleteFlag(flag)}>CANCEL</button></td></tr>)}</tbody></table></div></div><div className="admin-card"><div className="admin-toolbar"><h2>Deployment Audit Logs</h2></div><DataTable table={auditTable}/></div></div>;
}

function ActivityLogs({ activePage, activeRoute }) {
  const types = ACTIVITY_TYPES; const [current, setCurrent] = useState('active'); const [rows, setRows] = useState([]); const [counts, setCounts] = useState({}); const [feed, setFeed] = useState([]);
  const loadType = useCallback(async (type, display = false) => { const response = await fetch(`/admin/api/kpi_data/${type}`); const data = await response.json(); const list = data.data || []; if (display) setRows(list); setCounts(currentCounts => ({ ...currentCounts, [type]: list.length })); }, []);
  useEffect(() => { types.forEach(([type]) => loadType(type, type === 'active')); fetch(activeRoute, { credentials: 'include' }).then(response => response.text()).then(html => { const doc = new DOMParser().parseFromString(html, 'text/html'); setFeed(Array.from(doc.querySelectorAll('.activity-card')).map((card,index) => ({ id:index, sender:card.querySelector('.activity-sender')?.textContent.replace(/\s+/g,' ').trim() || 'System', time:card.querySelector('.activity-meta div:last-child')?.textContent.trim() || '', message:card.querySelector('.activity-msg')?.textContent.trim() || '' }))); }); }, [activeRoute, loadType, types]);
  const headers = rows.length ? Object.keys(rows[0]) : []; return <div className="admin-react-page"><PageHeader activePage={activePage}/><div className="admin-kpis">{types.map(([type,label]) => <div className="admin-kpi" key={type} onClick={() => { setCurrent(type); loadType(type, true); }}><span>{label}</span><strong>{counts[type] ?? '—'}</strong></div>)}</div><div className="activity-layout"><div className="admin-card"><div className="admin-toolbar"><h2>{types.find(item => item[0] === current)?.[1]}</h2><button className="admin-btn" onClick={() => loadType(current, true)}>REFRESH</button></div><DataTable table={{ headers, rows: rows.map((row,index) => ({ id:index,cells:headers.map(header => String(row[header] ?? '')) })) }}/></div><div className="admin-card"><div className="admin-toolbar"><h2>Live Helpdesk Feed</h2></div><div className="activity-feed">{feed.map(item => <div className="ticket-card" key={item.id}><strong>{item.sender}</strong><span>{item.message}</span><small>{item.time}</small></div>)}{!feed.length && <div className="admin-empty">No message streams monitored today.</div>}</div></div></div></div>;
}

export default function AdminConsole({ activePage, activeRoute, user, setActivePage }) {
  const permissions = user?.permissions || [];
  const isDefaultSuperAdmin = user?.email?.trim().toLowerCase() === 'bknr.solutions@gmail.com';
  const allow = permission => {
    if (isDefaultSuperAdmin) return true;
    if (typeof permissions === 'string') {
      return permissions === 'ALL' || permissions.split(',').map(item => item.trim()).includes(permission);
    }
    return permissions.includes?.('ALL') || permissions.includes?.(permission);
  };

  const visibleNavItems = ADMIN_NAV_ITEMS.filter(item =>
    (isDefaultSuperAdmin || !item.superAdminOnly) && allow(item.perm)
  );

  let pageContent;
  if (activePage === 'admin_data_management') pageContent = <DataManagement activePage={activePage}/>;
  else if (activePage === 'admin_system_settings') pageContent = <SystemSettings activePage={activePage} activeRoute={activeRoute}/>;
  else if (activePage === 'admin_system_architecture') pageContent = <SystemArchitecture user={user}/>;
  else if (activePage === 'admin_raise_ticket' || activePage === 'admin_helpdesk') pageContent = <TicketDesk activePage={activePage} activeRoute={activeRoute}/>;
  else if (activePage === 'admin_user_activity') pageContent = <ActivityLogs activePage={activePage} activeRoute={activeRoute}/>;
  else if (activePage === 'admin_add_user') pageContent = <UserConfiguration/>;
  else pageContent = <StandardAdminPage activePage={activePage} activeRoute={activeRoute}/>;

  return (
    <div className="admin-console-shell">
      <div className="admin-console-content">{pageContent}</div>
      <aside className="admin-right-nav" aria-label="Admin navigation">
        <div className="admin-right-nav-title">
          <i className="fa-solid fa-shield-halved"></i>
          <span>ADMIN PANEL</span>
        </div>
        <nav>
          {visibleNavItems.map(item => (
            <button
              type="button"
              key={item.id}
              className={`admin-right-nav-item ${activePage === item.id ? 'active' : ''}`}
              onClick={() => setActivePage(item.id, item.route)}
            >
              <i className={`fa-solid ${item.icon}`}></i>
              <span>{item.label}</span>
              <i className="fa-solid fa-chevron-right admin-right-nav-arrow"></i>
            </button>
          ))}
        </nav>
      </aside>
    </div>
  );
}
