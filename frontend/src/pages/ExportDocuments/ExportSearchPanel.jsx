import { Search, X } from 'lucide-react';
import './ExportSearchPanel.css';

export default function ExportSearchPanel({ id, label, value, onChange, count, placeholder = 'Search records…' }) {
  return <div className="attendance-filters-bar export-search-panel">
    <div className="attendance-filter-group export-search-field">
      <label htmlFor={id}>{label}</label>
      <div className="export-search-control">
        <Search size={15} aria-hidden="true" />
        <input
          id={id}
          className="attendance-input"
          type="search"
          placeholder={placeholder}
          value={value}
          onChange={event => onChange(event.target.value)}
        />
        {value ? <button type="button" onClick={() => onChange('')} aria-label="Clear search"><X size={14} /></button> : null}
      </div>
    </div>
    <div className="export-search-result" aria-live="polite">
      <span>Matching records</span>
      <strong>{count}</strong>
    </div>
  </div>;
}
