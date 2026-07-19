import { useCallback, useEffect, useState } from 'react';
import { sessionFetch } from '../../utils/sessionFetch';
import './EnterpriseDashboard.css';

export const number = value => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 }).format(Number(value || 0));
export const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));

export function useDashboardData(buildUrl) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const response = await sessionFetch(buildUrl(), { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(response.status === 401 ? 'Session expired. Please log in again.' : 'Dashboard data could not be loaded.');
      const payload = await response.json();
      setData(payload);
    } catch (err) { setError(err.message || 'Dashboard data could not be loaded.'); }
    finally { setLoading(false); }
  }, [buildUrl]);
  useEffect(() => { load(); }, [load]);
  return { data, loading, error, reload: load };
}

export function DashboardHeader({ title, subtitle, children, onRefresh }) {
  return <div className="enterprise-head"><div><h1>{title}</h1><p>{subtitle}</p></div><div className="enterprise-actions">{children}<button type="button" className="enterprise-refresh" onClick={onRefresh}><i className="fa-solid fa-rotate-right"></i> Refresh</button></div></div>;
}

export function ModuleRail({ title, icon, sections, onNavigate }) {
  return <aside className="module-rail"><div className="rail-title"><i className={`fa-solid ${icon}`}></i> {title}</div>{sections.map(section => <div className="rail-section" key={section.label}><div className="rail-label">{section.label}</div>{section.items.map(item => <button type="button" className="rail-link" key={item.route} onClick={() => onNavigate(item)}><i className={`fa-solid ${item.icon}`}></i><span>{item.label}</span></button>)}</div>)}</aside>;
}

export function Field({ label, children }) { return <label className="enterprise-field"><span>{label}</span>{children}</label>; }

export function MetricCard({ label, value, note, icon = 'fa-chart-line', color = '#2563eb', onClick }) {
  return <div className={`enterprise-kpi ${onClick ? 'clickable' : ''}`} style={{ '--kpi-accent': color }} onClick={onClick} onKeyDown={event => { if (onClick && (event.key === 'Enter' || event.key === ' ')) onClick(); }} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}><div className="enterprise-kpi-top"><span>{label}</span><span className="enterprise-kpi-icon"><i className={`fa-solid ${icon}`}></i></span></div><strong>{value}</strong>{note && <small>{note}</small>}</div>;
}

export function Panel({ title, meta, full = false, children }) { return <section className={`enterprise-panel ${full ? 'full' : ''}`}><div className="enterprise-panel-head"><h2>{title}</h2>{meta && <span>{meta}</span>}</div>{children}</section>; }

export function Bars({ labels = [], primary = [], secondary = [], showValues = false, valueLabels = [], valueSuffix = '' }) {
  const max = Math.max(1, ...primary.map(Number), ...secondary.map(Number));
  return <div className="enterprise-bars">{labels.map((label, index) => {
    const primaryValue = Number(primary[index] || 0);
    const displayedValue = valueLabels.length > 0 ? Number(valueLabels[index] || 0) : primaryValue;
    const primaryHeight = Math.max(2, primaryValue / max * 100);
    const tooltip = secondary.length > 0
      ? `${label} · ${number(primary[index])} / ${number(secondary[index])}`
      : `${label} · ${number(primary[index])}`;
    return <div className="enterprise-bar-group" data-tooltip={tooltip} aria-label={tooltip} key={`${label}-${index}`}><div className="enterprise-bar-track">{showValues && <span className="enterprise-bar-value" style={{ bottom: `calc(${primaryHeight}% + 4px)` }}>{number(displayedValue)}{valueSuffix}</span>}<div className="enterprise-bar" style={{ height: `${primaryHeight}%` }}></div>{secondary.length > 0 && <div className="enterprise-bar alt" style={{ height: `${Math.max(2, Number(secondary[index] || 0) / max * 100)}%` }}></div>}</div><span className="enterprise-bar-label" title={label}>{label}</span></div>;
  })}</div>;
}

export function ProgressList({ rows = [], labelKey, valueKey, format = number, color = '#2563eb' }) {
  const max = Math.max(1, ...rows.map(row => Number(row[valueKey] || 0)));
  return <div className="enterprise-progress-list">{rows.map((row, index) => <div className="enterprise-progress-row" key={`${row[labelKey]}-${index}`}><span>{row[labelKey] || 'N/A'}</span><div className="enterprise-progress-track"><div className="enterprise-progress-fill" style={{ width: `${Number(row[valueKey] || 0) / max * 100}%`, '--progress-color': color }}></div></div><strong className="enterprise-progress-value">{format(row[valueKey])}</strong></div>)}</div>;
}

export function DashboardState({ loading, error, children }) { if (loading) return <div className="enterprise-state"><i className="fa-solid fa-spinner fa-spin"></i>&nbsp; Loading dashboard…</div>; if (error) return <div className="enterprise-state error">{error}</div>; return children; }
