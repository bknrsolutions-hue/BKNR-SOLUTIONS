import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  Coffee,
  FileSpreadsheet,
  History,
  LockKeyhole,
  LogIn,
  LogOut,
  MapPin,
  MoreVertical,
  UserRoundCheck,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import './DailyAttendance.css';

const ERROR_MESSAGES = {
  GLOBAL_FILTER_REQUIRED: 'Select one plant location in the global filter.',
  INVALID_SESSION: 'Session expired. Please log in again.',
  ALREADY_INSIDE: 'Employee is already inside the plant.',
  DAILY_DUTY_LIMIT_REACHED: 'Daily duty limit has been reached for this employee.',
  NO_ACTIVE_DUTY: 'No active duty was found for this employee.',
  ALREADY_ON_BREAK: 'Employee is already on break.',
};

async function readJson(response) {
  const contentType = response.headers.get('content-type') || '';
  if (response.redirected || !contentType.includes('application/json')) {
    throw new Error(response.status === 401 ? 'Session expired. Please log in again.' : 'Attendance service returned an invalid response.');
  }
  const data = await response.json();
  if (response.status === 401) {
    throw new Error('Session expired. Please log in again.');
  }
  if (!response.ok) {
    const code = data.error || data.message || `Request failed (${response.status})`;
    throw new Error(ERROR_MESSAGES[code] || code);
  }
  return data;
}

function PageSkeleton() {
  return (
    <div className="attendance-page attendance-page-skeleton" aria-label="Loading daily attendance">
      <div className="attendance-skeleton attendance-skeleton-header" />
      <div className="attendance-shift-grid">
        {[1, 2, 3].map((item) => <div className="attendance-skeleton attendance-skeleton-card" key={item} />)}
      </div>
      <div className="attendance-layout">
        <div className="attendance-skeleton attendance-skeleton-terminal" />
        <div className="attendance-skeleton attendance-skeleton-table" />
      </div>
    </div>
  );
}

export default function DailyAttendance() {
  const inputRef = useRef(null);
  const toastTimerRef = useRef(null);
  const [meta, setMeta] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [activeShift, setActiveShift] = useState('ALL');
  const [menuOpen, setMenuOpen] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [clock, setClock] = useState(new Date());
  const [toast, setToast] = useState(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [audits, setAudits] = useState([]);

  const location = meta?.actual_location || '';
  const activeRows = useMemo(() => rows.filter((row) => row.status !== 'CLOSED'), [rows]);
  const visibleRows = useMemo(
    () => activeShift === 'ALL' ? activeRows : activeRows.filter((row) => (row.shift_name || 'GENERAL') === activeShift),
    [activeRows, activeShift],
  );

  const showToast = useCallback((kind, message) => {
    window.clearTimeout(toastTimerRef.current);
    setToast({ kind, message });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  const loadRows = useCallback(async (targetLocation) => {
    if (!targetLocation) {
      setRows([]);
      return;
    }
    try {
      const response = await fetch(`/attendance/today_all?location=${encodeURIComponent(targetLocation)}`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const data = await readJson(response);
      setRows(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const loadPage = useCallback(async (locationOverride) => {
    setLoading(true);
    setError('');
    try {
      const selectedLocation = locationOverride ?? localStorage.getItem('plant_location_filter') ?? '';
      const params = new URLSearchParams({ format: 'json' });
      if (selectedLocation) params.set('location', selectedLocation);
      const response = await fetch(`/attendance/daily?${params.toString()}`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const data = await readJson(response);
      setMeta(data);
      await loadRows(data.actual_location);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [loadRows]);

  useEffect(() => {
    const initialLoad = window.setTimeout(loadPage, 0);
    const handleFilterChange = (event) => loadPage(event.detail?.location ?? '');
    window.addEventListener('filter_change', handleFilterChange);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener('filter_change', handleFilterChange);
    };
  }, [loadPage]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!location) return undefined;
    const timer = window.setInterval(() => loadRows(location), 15000);
    return () => window.clearInterval(timer);
  }, [loadRows, location]);

  useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);

  const speak = useCallback((message) => {
    if (!voiceEnabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }, [voiceEnabled]);

  const punch = useCallback(async (action, shiftName = 'GENERAL') => {
    const id = employeeId.trim();
    if (!id) {
      showToast('error', 'Enter or scan an Employee ID.');
      inputRef.current?.focus();
      return;
    }
    if (!location) {
      showToast('error', ERROR_MESSAGES.GLOBAL_FILTER_REQUIRED);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/attendance/entry', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          employee_id: id,
          action,
          shift_name: shiftName || 'GENERAL',
          location,
        }),
      });
      const data = await readJson(response);
      const label = action === 'OUT' ? 'Break started' : action === 'EXIT' ? 'Shift checked out' : 'Punch in recorded';
      showToast('success', `${data.employee_name || id}: ${label}.`);
      speak(action === 'OUT' ? 'Break started' : action === 'EXIT' ? 'Checkout successful. Goodbye.' : `Welcome ${data.employee_name || ''}`);
      setEmployeeId('');
      await loadRows(location);
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setSubmitting(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [employeeId, loadRows, location, showToast, speak]);

  const openAudit = useCallback(async () => {
    setAuditOpen(true);
    setAuditLoading(true);
    try {
      const response = await fetch('/attendance/audit_all', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const data = await readJson(response);
      setAudits(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setAuditLoading(false);
    }
  }, [showToast]);

  const exportExcel = () => {
    if (!location) {
      showToast('error', ERROR_MESSAGES.GLOBAL_FILTER_REQUIRED);
      return;
    }
    window.location.assign(`/attendance/export/excel?location=${encodeURIComponent(location)}`);
  };

  if (loading && !meta) return <PageSkeleton />;

  return (
    <div className="attendance-page">
      {toast && <div className={`attendance-toast ${toast.kind}`} role="status">{toast.message}</div>}

      {!location && (
        <div className="attendance-lock-overlay">
          <LockKeyhole size={60} />
          <h2>Terminal Locked</h2>
          <p>Please select a specific <strong>Plant / Unit</strong> from the Global Filter menu at the top to activate this Gate Terminal.</p>
        </div>
      )}

      <header className="attendance-header">
        <h1>
          Live Terminal Monitor
          {location && <span className="attendance-plant-badge"><MapPin size={11} /> {location}</span>}
        </h1>
        <div className="attendance-header-actions">
          <button className={`attendance-voice-btn ${voiceEnabled ? '' : 'muted'}`} type="button" onClick={() => setVoiceEnabled((value) => !value)} title="Toggle Voice Feedback">
            {voiceEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          </button>
          <div className="attendance-clock">{clock.toLocaleTimeString('en-GB')}</div>
        </div>
      </header>

      <section className="attendance-shift-grid" aria-label="Active shift summary">
        {[{ shift_name: 'ALL' }, ...(meta?.shifts || [])].map((shift, index) => {
          const shiftRows = shift.shift_name === 'ALL' ? activeRows : activeRows.filter((row) => (row.shift_name || 'GENERAL') === shift.shift_name);
          const present = shiftRows.filter((row) => row.status === 'OPEN').length;
          const away = shiftRows.filter((row) => row.status === 'AWAY').length;
          return (
            <button
              className={`attendance-shift-card shift-color-${shift.shift_name === 'ALL' ? 'default' : (index - 1) % 5} ${activeShift === shift.shift_name ? 'active' : ''}`}
              type="button"
              key={shift.shift_name}
              onClick={() => setActiveShift(shift.shift_name)}
            >
              <div className="attendance-shift-name">{shift.shift_name === 'ALL' ? 'ALL ACTIVE' : shift.shift_name}</div>
              <div className="attendance-shift-metrics">
                <div><strong>{present}</strong><small>Present</small></div>
                <div><strong className="away">{away}</strong><small>On Break</small></div>
              </div>
            </button>
          );
        })}
      </section>

      <section className="attendance-layout">
        <aside className="attendance-terminal-card">
          <label className="attendance-scan-label" htmlFor="attendance-employee-id">Scan ID Badge</label>
          <input
            ref={inputRef}
            id="attendance-employee-id"
            className="attendance-id-input"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') punch('IN', 'GENERAL'); }}
            placeholder="SCAN ID"
            autoComplete="off"
            autoFocus
            disabled={!location || submitting}
          />

          <div className="attendance-shift-buttons">
            {meta?.shifts?.length ? meta.shifts.map((shift, index) => (
              <button className={`attendance-terminal-action shift-${index % 5}`} type="button" key={shift.id} onClick={() => punch('IN', shift.shift_name)} disabled={!location || submitting}>
                <LogIn size={14} /> {shift.shift_name} In
              </button>
            )) : (
              <button className="attendance-terminal-action shift-default full" type="button" onClick={() => punch('IN', 'GENERAL')} disabled={!location || submitting}>
                <LogIn size={14} /> Check In (Default)
              </button>
            )}
          </div>
          <div className="attendance-break-buttons">
            <button className="attendance-terminal-action break-out" type="button" onClick={() => punch('OUT')} disabled={!location || submitting}><Coffee size={14} /> Break Out</button>
            <button className="attendance-terminal-action break-in" type="button" onClick={() => punch('IN', 'GENERAL')} disabled={!location || submitting}><UserRoundCheck size={14} /> Break In</button>
          </div>
          <button className="attendance-terminal-action check-out full" type="button" onClick={() => punch('EXIT')} disabled={!location || submitting}><LogOut size={14} /> Check Out Shift</button>
        </aside>

        <div className="attendance-table-card">
          <div className="attendance-table-header">
            <strong>{visibleRows.length} ACTIVE PERSONNEL</strong>
            <div className="attendance-menu-wrap">
              <button className="attendance-menu-trigger" type="button" onClick={() => setMenuOpen((value) => !value)} disabled={!location}><MoreVertical size={17} /></button>
              {menuOpen && (
                <div className="attendance-menu">
                  <button type="button" onClick={() => { setMenuOpen(false); openAudit(); }}><History size={15} /> Terminal Log</button>
                  <button type="button" onClick={() => { setMenuOpen(false); exportExcel(); }}><FileSpreadsheet size={15} /> Export Live List</button>
                </div>
              )}
            </div>
          </div>
          {error && <div className="attendance-inline-error">{error}<button type="button" onClick={loadPage}>Retry</button></div>}
          <div className="attendance-table-wrap">
            <table>
              <thead>
                <tr><th>Personnel Info</th><th>Active Shift</th><th>Movement Timeline</th><th>Current State</th></tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={`${row.employee_id}-${row.shift_name}`}>
                    <td><strong>{row.employee_name}</strong><small>{row.employee_id}</small></td>
                    <td><span className={`attendance-shift-pill shift-pill-${Math.max(0, (meta?.shifts || []).findIndex((shift) => shift.shift_name === row.shift_name)) % 5}`}>{row.shift_name || 'GENERAL'}</span></td>
                    <td>
                      <div className="attendance-movements">
                        {(row.movements || []).map((item, index) => (
                          <span className="attendance-movement-group" key={`${item.type}-${item.time}-${index}`}>
                            {index > 0 && <ChevronRight className="attendance-movement-arrow" size={10} />}
                            <span className={(item.type || '').toLowerCase()}>{item.type} {item.time}</span>
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="attendance-state-cell"><span className={`attendance-status ${(row.status || '').toLowerCase()}`}><i />{row.status === 'AWAY' ? 'ON BREAK' : 'INSIDE'}</span></td>
                  </tr>
                ))}
                {!visibleRows.length && (
                  <tr><td className="attendance-empty" colSpan="4">No active personnel in this view.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {auditOpen && (
        <div className="attendance-drawer-backdrop">
          <aside className="attendance-audit-drawer">
            <div className="attendance-audit-head">
              <div><span>Terminal Telemetry</span></div>
              <button type="button" onClick={() => setAuditOpen(false)}><X size={20} /></button>
            </div>
            <div className="attendance-audit-body">
              {auditLoading && <div className="attendance-audit-loading">Loading audit trail…</div>}
              {!auditLoading && audits.map((audit, index) => (
                <article key={`${audit.timestamp}-${index}`}>
                  <p><strong>{audit.timestamp}</strong> | {audit.batch}<br />{audit.action}: {audit.details}</p>
                  <small>By: {audit.user} ({audit.email})</small>
                </article>
              ))}
              {!auditLoading && !audits.length && <div className="attendance-empty">No audit transactions found.</div>}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
