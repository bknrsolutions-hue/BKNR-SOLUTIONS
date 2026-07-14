/**
 * ReportShell.jsx
 * ─────────────────────────────────────────────────────────
 * Shared scaffold for every BKNR report page.
 * Provides: fetch lifecycle, header, loader, error, filter bar,
 *           search, generic table, currency/number formatting.
 * ─────────────────────────────────────────────────────────
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Printer, Download, Search, FileText, MoreVertical, X, Trash2, Edit, Save, History, Check } from 'lucide-react';

/* ── Formatters ─────────────────────────────────────────── */
export const fmt = {
  currency: (v) =>
    v == null ? '—' : Number(v).toLocaleString('en-IN', {
      style: 'currency', currency: 'INR', minimumFractionDigits: 2
    }),
  number: (v) =>
    v == null ? '—' : Number(v).toLocaleString('en-IN', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    }),
  pct: (v) => (v == null ? '—' : `${Number(v).toFixed(2)}%`),
  plain: (v) => (v == null || v === '' ? '—' : String(v)),
};

/* ── useReport hook ──────────────────────────────────────── */
export function useReport({ url, params = {}, deps = [] }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!url) throw new Error('Report route is not configured. Please reopen this report from the menu.');
      const q = new URLSearchParams({ format: 'json', ...params });
      // inject global filters
      const pf = localStorage.getItem('production_for_filter') || '';
      const loc = localStorage.getItem('plant_location_filter') || '';
      if (pf)  q.set('production_for', pf);
      if (loc) q.set('location', loc);

      const res = await fetch(`${url}?${q}`, {
        credentials: 'include',
        redirect: 'follow',
        headers: { Accept: 'application/json' },
      });

      // Detect redirect to login page (session expired)
      if (res.redirected || res.url.includes('/auth/login') || res.url.includes('/login')) {
        throw new Error('Session expired. Please log in again.');
      }

      // Ensure response is JSON, not an HTML login/error page
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        if (res.status === 500) throw new Error('Server error (500). The report backend may have crashed. Check server logs.');
        if (res.status === 403) throw new Error('Access denied (403). You do not have permission to view this report.');
        if (!contentType.includes('application/json')) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        // Try to read JSON error message
        try { const errJson = await res.json(); throw new Error(errJson?.detail || errJson?.message || `HTTP ${res.status}`); } catch(_) {}
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      if (!contentType.includes('application/json')) {
        throw new Error('Report server returned HTML instead of JSON. Try refreshing or re-logging in.');
      }

      const json = await res.json();
      // Accept any valid JSON object — each report component knows its own shape.
      if (json !== null && typeof json === 'object' && !Array.isArray(json)) {
        setData(json);
      } else if (Array.isArray(json)) {
        // Some endpoints return a plain array — wrap it.
        setData({ rows: json });
      } else {
        throw new Error('Server returned an unexpected response');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [url, JSON.stringify(params)]);

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener('filter_change', handler);
    return () => window.removeEventListener('filter_change', handler);
  }, [load, ...deps]);

  return { data, loading, error, reload: load };
}

/* ── ReportHeader ────────────────────────────────────────── */
export function ReportHeader({ title, subtitle, loading, onReload, onPrint, exportUrl }) {
  return (
    <div style={styles.header}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={styles.iconBox}><FileText size={18} color="#fff" /></div>
        <div>
          <h2 style={styles.title}>{title}</h2>
          {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
        </div>
      </div>
      <div style={styles.actions}>
        <Btn icon={<RefreshCw size={13} className={loading ? 'spin' : ''} />} label="Refresh" onClick={onReload} />
        <Btn icon={<Printer size={13} />} label="Print" onClick={onPrint || (() => window.print())} />
        {exportUrl && (
          <Btn icon={<Download size={13} />} label="Excel"
            onClick={() => { window.location.href = exportUrl; }} />
        )}
      </div>
    </div>
  );
}

/* ── FilterBar ───────────────────────────────────────────── */
export function FilterBar({ children }) {
  return <div className="erp-horizontal-filter-row" style={styles.filterBar}>{children}</div>;
}

export function FilterBox({ label, children }) {
  return (
    <div style={styles.filterBox}>
      <label style={styles.filterLabel}>{label}</label>
      {children}
    </div>
  );
}

export function FilterSelect({ value, onChange, children, style }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ ...styles.select, ...style }}>
      {children}
    </select>
  );
}

export function FilterInput({ type = 'text', value, onChange, placeholder, style }) {
  return (
    <input type={type} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={{ ...styles.select, ...style }} />
  );
}

/* ── KPI Cards ───────────────────────────────────────────── */
export function KPIGrid({ children }) {
  return <div className="erp-report-kpi-row" style={styles.kpiGrid}>{children}</div>;
}

export function KPICard({ label, value, accent = 'var(--corp-rep)' }) {
  return (
    <div className="erp-report-kpi-card" style={{ ...styles.kpiCard, borderLeft: `3px solid ${accent}` }}>
      <span style={styles.kpiLabel}>{label}</span>
      <span style={styles.kpiValue}>{value}</span>
    </div>
  );
}

/* ── Loader / Error ──────────────────────────────────────── */
export function Loader() {
  return (
    <div style={styles.center}>
      <RefreshCw size={28} className="spin" style={{ color: 'var(--corp-rep)', marginBottom: 10 }} />
      <span style={styles.subtitle}>Loading report data…</span>
    </div>
  );
}

export function ErrorBox({ msg, onRetry }) {
  return (
    <div style={styles.errBox}>
      <span>⚠ {msg}</span>
      <button className="btn btn-secondary"
        style={{ marginLeft: 12, background: '#dc2626', color: '#fff', padding: '2px 12px' }}
        onClick={onRetry}>Retry</button>
    </div>
  );
}

/* ── SearchInput ─────────────────────────────────────────── */
export function SearchInput({ value, onChange }) {
  return (
    <div style={styles.searchWrap}>
      <Search size={13} style={styles.searchIcon} />
      <input type="text" placeholder="Search…" value={value}
        onChange={e => onChange(e.target.value)} style={styles.searchInput} />
    </div>
  );
}

/* ── EmptyRow ────────────────────────────────────────────── */
export function EmptyRow({ cols }) {
  return (
    <tr>
      <td colSpan={cols} style={{ padding: '32px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
        No records found. Select a financial year or adjust filters.
      </td>
    </tr>
  );
}

/* ── FinYearSelect ───────────────────────────────────────── */
export function FinYearSelect({ value, onChange, list }) {
  const years = list?.length
    ? list
    : [String(new Date().getFullYear() - 1), String(new Date().getFullYear())];
  return (
    <FilterSelect value={value} onChange={onChange}>
      <option value="">-- Select FY --</option>
      {years.map(y => <option key={y} value={y}>{y}–{Number(y) + 1}</option>)}
    </FilterSelect>
  );
}

/* ── Generic Table ───────────────────────────────────────── */
export function ReportTable({ columns, rows, searchQuery = '' }) {
  const filtered = rows.filter(r =>
    !searchQuery ||
    Object.values(r).some(v => String(v ?? '').toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="table-responsive">
      <table className="bknr-table">
        <thead>
          <tr>
            {columns.map((c, i) => (
              <th key={i} className={c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0
            ? <EmptyRow cols={columns.length} />
            : filtered.map((row, ri) => (
              <tr key={ri} style={row.is_subtotal ? styles.subtotalRow : {}}>
                {columns.map((c, ci) => {
                  const raw = row[c.key];
                  let display = raw;
                  if (c.fmt === 'currency') display = fmt.currency(raw);
                  else if (c.fmt === 'number') display = fmt.number(raw);
                  else if (c.fmt === 'pct') display = fmt.pct(raw);
                  else display = fmt.plain(raw);

                  return (
                    <td key={ci}
                      className={c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left'}
                      style={{
                        fontWeight: (c.bold || row.is_subtotal) ? 700 : 'normal',
                        color: row.is_subtotal ? 'var(--corp-rep)' : undefined
                      }}>
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Small button helper ─────────────────────────────────── */
function Btn({ icon, label, onClick }) {
  return (
    <button className="btn btn-secondary"
      onClick={onClick}
      style={{ height: 28, padding: '0 8px', fontSize: 9, display: 'flex', alignItems: 'center', gap: 4 }}>
      {icon} {label}
    </button>
  );
}

/* ── Styles ──────────────────────────────────────────────── */
const styles = {
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    flexWrap: 'nowrap', gap: 8, paddingBottom: 6,
    borderBottom: '1px solid var(--border-light)', marginBottom: 6,
  },
  iconBox: {
    width: 30, height: 30, borderRadius: 7,
    background: 'var(--corp-rep)', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', margin: 0 },
  subtitle: { fontSize: 9, color: 'var(--text-secondary)', margin: 0 },
  actions: { display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'nowrap' },
  filterBar: {
    display: 'flex', flexWrap: 'nowrap', gap: 6,
    background: 'var(--glass-bg)', padding: '4px 7px',
    borderRadius: 'var(--radius-element)', border: '1px solid var(--border-light)',
    marginBottom: 6, alignItems: 'flex-end', overflowX: 'auto', overflowY: 'hidden',
    WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin',
  },
  filterBox: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 108, flex: '0 0 108px' },
  filterLabel: {
    fontSize: 8, fontWeight: 800, color: 'var(--text-secondary)',
    textTransform: 'uppercase', letterSpacing: '0.35px',
  },
  select: {
    height: 27, padding: '0 7px', fontSize: 10, fontWeight: 700,
    borderRadius: 5, border: '1px solid var(--input-border)',
    background: 'var(--input-bg)', color: 'var(--text-primary)', outline: 'none', width: '100%',
  },
  kpiGrid: {
    display: 'flex', flexWrap: 'nowrap', overflowX: 'auto', overflowY: 'hidden',
    gap: 6, marginBottom: 6, scrollbarWidth: 'thin',
  },
  kpiCard: {
    background: 'var(--surface-panel)', border: '1px solid var(--border-light)',
    padding: '5px 8px', borderRadius: 6, minWidth: 140, minHeight: 38, flex: '1 0 140px',
    display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 7, boxShadow: 'var(--shadow-soft)',
  },
  kpiLabel: { fontSize: 8, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.35px', whiteSpace: 'nowrap' },
  kpiValue: { fontSize: 12, fontWeight: 900, color: 'var(--text-primary)', whiteSpace: 'nowrap' },
  center: { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 60 },
  errBox: {
    background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.25)',
    padding: 14, borderRadius: 'var(--radius-element)', color: '#f87171',
    display: 'flex', alignItems: 'center', marginBottom: 12,
  },
  searchWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
  searchIcon: { position: 'absolute', left: 7, color: 'var(--text-tertiary)' },
  searchInput: {
    padding: '0 7px 0 25px', fontSize: 10,
    border: '1px solid var(--input-border)', borderRadius: 5,
    background: 'var(--input-bg)', color: 'var(--text-primary)', outline: 'none',
    width: 150, height: 27,
  },
  subtotalRow: { background: 'rgba(139,92,246,0.06)' },
  modalOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
  },
  modalContent: {
    background: 'var(--surface-panel)', border: '1px solid var(--border-light)',
    padding: 24, borderRadius: 'var(--radius-panel)', width: 320, textAlign: 'center',
    boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', gap: 16,
  },
  drawerOverlay: {
    position: 'fixed', inset: 0, background: 'rgba(0, 0, 0, 0.3)', zIndex: 9990,
  },
  drawerContent: {
    position: 'fixed', right: 0, top: 0, bottom: 0, width: 380,
    background: 'var(--surface-panel)', borderLeft: '3px solid var(--corp-rep)',
    boxShadow: 'var(--shadow-lg)', display: 'flex', flexDirection: 'column', zIndex: 9991,
    transition: 'transform 0.3s ease-in-out',
  },
  drawerHeader: {
    padding: '16px 20px', background: 'var(--corp-rep)', color: '#fff',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  drawerBody: {
    flex: 1, padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12,
  },
  auditItem: {
    borderLeft: '2px solid var(--corp-rep)', padding: '10px 12px',
    background: 'var(--input-bg)', borderRadius: 'var(--radius-element)',
    fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4,
  },
  menuContainer: {
    position: 'relative', display: 'inline-block',
  },
  menuDots: {
    width: 32, height: 32, border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-element)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', cursor: 'pointer', background: 'var(--surface-panel)',
  },
  menuList: {
    position: 'absolute', right: 0, top: '100%', marginTop: 6, width: 220,
    background: 'var(--surface-panel)', border: '1px solid var(--border-light)',
    borderRadius: 'var(--radius-element)', boxShadow: 'var(--shadow-lg)',
    zIndex: 5000, display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  menuHeader: {
    padding: '6px 12px', fontSize: 10, background: 'var(--input-bg)',
    color: 'var(--text-tertiary)', textTransform: 'uppercase', fontWeight: 800,
    letterSpacing: '0.5px', borderBottom: '1px solid var(--border-light)',
  },
  menuItem: {
    padding: '10px 14px', fontSize: 12, borderBottom: '1px solid var(--border-light)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
    color: 'var(--text-primary)', transition: 'background 0.2s', textAlign: 'left',
  },
  menuItemDanger: {
    color: '#ef4444',
  },
  searchableContainer: {
    position: 'relative', width: '100%',
  },
  searchableList: {
    position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: 150,
    overflowY: 'auto', background: 'var(--surface-panel)',
    border: '1px solid var(--corp-rep)', zIndex: 9999, borderRadius: 'var(--radius-element)',
    boxShadow: 'var(--shadow-md)', textAlign: 'left',
  },
  searchableItem: {
    padding: '8px 12px', fontSize: 12, cursor: 'pointer',
    borderBottom: '1px solid var(--border-light)', color: 'var(--text-primary)',
  },
};

/* ── ConfirmModal ────────────────────────────────────────── */
export function ConfirmModal({ isOpen, title = 'Confirm Action', message, onConfirm, onClose, confirmText = 'Yes, Proceed', cancelText = 'Cancel' }) {
  if (!isOpen) return null;
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>{title}</h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>{message}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 8 }}>
          <button className="btn btn-secondary" style={{ flex: 1, height: 36 }} onClick={onClose}>{cancelText}</button>
          <button className="btn btn-primary" style={{ flex: 1, height: 36, background: '#ef4444', borderColor: '#ef4444' }} onClick={onConfirm}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
}

/* ── AuditDrawer ─────────────────────────────────────────── */
export function AuditDrawer({ isOpen, onClose, auditUrl }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    async function fetchLogs() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(auditUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setLogs(Array.isArray(data) ? data : []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchLogs();
  }, [isOpen, auditUrl]);

  if (!isOpen) return null;

  return (
    <>
      <div style={styles.drawerOverlay} onClick={onClose} />
      <div style={styles.drawerContent}>
        <div style={styles.drawerHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <History size={16} />
            <span style={{ fontWeight: 800, fontSize: 14 }}>EDIT HISTORY LOGS</span>
          </div>
          <button style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }} onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div style={styles.drawerBody}>
          {loading && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Loading audit records...</div>}
          {error && <div style={{ fontSize: 13, color: '#f87171' }}>Error: {error}</div>}
          {!loading && !error && logs.length === 0 && (
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', padding: 20 }}>
              No audit logs found.
            </div>
          )}
          {!loading && !error && logs.map((log, i) => {
            // Handle both formats
            // Format A: { time/timestamp, batch, action, details, user }
            // Format B: { record_id, field, old, new, user, time/timestamp }
            const logTime = log.timestamp || log.time || '';
            const logUser = log.user || 'System';
            
            if (log.action || log.details) {
              return (
                <div key={i} style={styles.auditItem}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)' }}>
                    <span>{logTime}</span>
                    {log.batch && <span>Batch: {log.batch}</span>}
                  </div>
                  <div style={{ fontWeight: 600 }}>{log.action}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{log.details}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>By: {logUser}</div>
                </div>
              );
            } else {
              return (
                <div key={i} style={styles.auditItem}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-tertiary)' }}>
                    <span>{logTime}</span>
                    <span>ID: {log.record_id}</span>
                  </div>
                  <div style={{ fontWeight: 600 }}>Field: <span style={{ color: 'var(--corp-rep)' }}>{log.field}</span></div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                    {log.field === 'DELETE' ? 'DELETED' : <>{log.old} &rarr; {log.new}</>}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>By: {logUser}</div>
                </div>
              );
            }
          })}
        </div>
      </div>
    </>
  );
}

/* ── RowActionMenu ───────────────────────────────────────── */
export function RowActionMenu({ actions }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div style={styles.menuContainer} ref={containerRef}>
      <button style={styles.menuDots} onClick={() => setIsOpen(!isOpen)}>
        <MoreVertical size={16} color="var(--text-primary)" />
      </button>
      {isOpen && (
        <div style={styles.menuList}>
          {actions.map((act, i) => {
            if (act.divider) {
              return <hr key={i} style={{ margin: '2px 0', border: 0, borderTop: '1px solid var(--border-light)' }} />;
            }
            if (act.header) {
              return <div key={i} style={styles.menuHeader}>{act.header}</div>;
            }
            return (
              <div key={i}
                style={{
                  ...styles.menuItem,
                  ...(act.danger ? styles.menuItemDanger : {})
                }}
                onClick={() => {
                  setIsOpen(false);
                  act.onClick();
                }}>
                {act.icon}
                <span>{act.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── InlineSearchableSelect ──────────────────────────────── */
export function InlineSearchableSelect({ value, onChange, options = [], placeholder = 'Search...' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState(value || '');
  const containerRef = useRef(null);

  useEffect(() => {
    setFilter(value || '');
  }, [value]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = options.filter(opt =>
    String(opt || '').toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div style={styles.searchableContainer} ref={containerRef}>
      <input
        className="edit-input"
        style={{ width: '100%', height: 26, fontSize: 11, border: '1px solid var(--corp-rep)', padding: '2px 6px', outline: 'none' }}
        value={filter}
        onChange={e => {
          setFilter(e.target.value);
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
      />
      {isOpen && filtered.length > 0 && (
        <div style={styles.searchableList}>
          {filtered.map((opt, i) => (
            <div key={i}
              style={styles.searchableItem}
              className="searchable-dropdown-item"
              onClick={() => {
                onChange(opt);
                setFilter(opt);
                setIsOpen(false);
              }}>
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
