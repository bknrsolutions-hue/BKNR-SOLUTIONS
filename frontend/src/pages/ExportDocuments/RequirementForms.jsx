import { useCallback, useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import RequirementDocumentPage from './RequirementDocumentPage';
import '../Attendance/Attendance.css';
import './RequirementDocuments.css';

export default function RequirementForms() {
  const [documents, setDocuments] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [selectedKind, setSelectedKind] = useState('');

  const loadData = useCallback(async () => {
    try {
      const response = await fetch('/export_documents/requirement-pages/catalog');
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load document forms');
      setDocuments(data.document_types || []);
      setSelectedKind(current => current || data.document_types?.[0]?.code || '');
    } catch (loadError) {
      setError(loadError.message);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const filteredDocuments = useMemo(() => {
    const term = query.trim().toLowerCase();
    return documents.filter(item => !term || `${item.label} ${item.code} ${item.stage}`.toLowerCase().includes(term));
  }, [documents, query]);

  return <div className="attendance-container requirement-forms-page">
    <div className="attendance-page-header"><div><h1>Export Document Center</h1>
      <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--att-muted)' }}>Generate controlled PDFs, import external originals or final signed copies, and manage approvals and versions.</p></div></div>
    {error && <div className="attendance-toast error" style={{ top: 80 }}>{error}</div>}
    <div className="requirement-form-selector">
      <div className="attendance-filter-group" style={{ position: 'relative' }}>
      <label htmlFor="requirement-search">Search Document Form</label><Search size={15} style={{ position: 'absolute', left: 10, bottom: 9 }} />
      <input id="requirement-search" className="attendance-input" style={{ paddingLeft: 32 }} value={query} onChange={event => setQuery(event.target.value)} placeholder="PI, certificate, bank, shipping..." />
      </div>
      <div className="attendance-filter-group"><label htmlFor="requirement-document-select">Document Form</label>
        <select id="requirement-document-select" className="attendance-select" value={selectedKind} onChange={event => setSelectedKind(event.target.value)}>
          {filteredDocuments.map(item => <option key={item.code} value={item.code}>{item.label} · {item.document_mode?.replaceAll('_', ' ') || 'IMPORT PDF'} · {item.stage}{item.pending_for_me ? ` · ${item.pending_for_me} pending for me` : ''}</option>)}
        </select>
      </div>
    </div>
    {selectedKind ? <RequirementDocumentPage key={selectedKind} documentKind={selectedKind} embedded /> : <div className="attendance-empty">Select a document form.</div>}
  </div>;
}
