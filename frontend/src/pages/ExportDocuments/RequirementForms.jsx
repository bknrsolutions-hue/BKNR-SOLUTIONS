import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileCheck2, FileText, Search, X } from 'lucide-react';
import RequirementDocumentPage from './RequirementDocumentPage';
import '../Attendance/Attendance.css';
import './RequirementDocuments.css';

export default function RequirementForms() {
  const [documents, setDocuments] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [selectedKind, setSelectedKind] = useState('');
  const [activeStage, setActiveStage] = useState('ALL');

  const loadData = useCallback(async () => {
    try {
      const response = await fetch('/export_documents/requirement-pages/catalog');
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load document forms');
      setDocuments(data.document_types || []);
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
    return documents.filter(item =>
      (activeStage === 'ALL' || item.stage === activeStage)
      && (!term || `${item.label} ${item.code} ${item.stage}`.toLowerCase().includes(term))
    );
  }, [activeStage, documents, query]);

  const stages = useMemo(() => ['ALL', ...new Set(documents.map(item => item.stage))], [documents]);
  const activeDocument = documents.find(item => item.code === selectedKind);

  const chooseStage = stage => {
    setActiveStage(stage);
    setSelectedKind('');
  };

  const openDocument = code => {
    setSelectedKind(code);
    window.requestAnimationFrame(() => {
      document.getElementById('requirement-active-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return <div className="attendance-container requirement-forms-page">
    <div className="attendance-page-header"><div><h1>Export Document Center</h1>
      <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--att-muted)' }}>Generate controlled PDFs, import external originals or final signed copies, and manage approvals and versions.</p></div></div>
    {error && <div className="attendance-toast error" style={{ top: 80 }}>{error}</div>}
    <div className="requirement-stage-tabs" role="tablist" aria-label="Export document stages">
      {stages.map(stage => {
        const count = stage === 'ALL' ? documents.length : documents.filter(item => item.stage === stage).length;
        return <button type="button" key={stage} className={activeStage === stage ? 'active' : ''} onClick={() => chooseStage(stage)}>
          <span>{stage === 'ALL' ? 'All Documents' : stage}</span><strong>{count}</strong>
        </button>;
      })}
    </div>
    <div className="requirement-form-selector">
      <label htmlFor="requirement-search" style={{ fontSize: '10px', fontWeight: 800, whiteSpace: 'nowrap', textTransform: 'uppercase', color: 'var(--att-muted)', margin: 0 }}>Search Document Form:</label>
      <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
        <Search size={13} style={{ position: 'absolute', left: 8, color: 'var(--att-muted)' }} />
        <input id="requirement-search" className="attendance-input" style={{ paddingLeft: 28, width: '100%' }} value={query} onChange={event => { setQuery(event.target.value); setSelectedKind(''); }} placeholder="PI, certificate, bank, shipping..." />
      </div>
      <div className="requirement-result-count"><strong>{filteredDocuments.length}</strong><span>Forms Available</span></div>
    </div>
    <div className="requirement-document-cards">
      {filteredDocuments.map(item => {
        const ModeIcon = item.document_mode?.includes('GENERATE') ? FileText : FileCheck2;
        return <button
          type="button"
          key={item.code}
          className={selectedKind === item.code ? 'active' : ''}
          onClick={() => openDocument(item.code)}
        >
          <span className="requirement-document-card-icon"><ModeIcon size={18} /></span>
          <span className="requirement-document-card-copy">
            <strong>{item.label}</strong>
          </span>
          {item.pending_for_me ? <em>{item.pending_for_me}</em> : null}
        </button>;
      })}
      {!filteredDocuments.length && <div className="attendance-empty requirement-card-empty">No matching document forms.</div>}
    </div>
    {activeDocument ? (
      <div className="attendance-modal-overlay" onClick={() => setSelectedKind('')}>
        <div className="attendance-modal-content" style={{ maxWidth: '1100px', maxHeight: '92vh' }} onClick={e => e.stopPropagation()}>
          <div className="attendance-modal-header">
            <div>
              <small style={{ fontSize: '9px', fontWeight: 800, color: 'var(--att-muted)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>OPEN DOCUMENT FORM</small>
              <h2 style={{ margin: 0, fontSize: '15px' }}>{activeDocument.label}</h2>
            </div>
            <button type="button" className="attendance-modal-close-btn" onClick={() => setSelectedKind('')}><X size={20} /></button>
          </div>
          <div className="attendance-modal-body" style={{ padding: '16px', overflowY: 'auto' }}>
            <RequirementDocumentPage key={activeDocument.code} documentKind={activeDocument.code} embedded />
          </div>
        </div>
      </div>
    ) : null}
  </div>;
}
