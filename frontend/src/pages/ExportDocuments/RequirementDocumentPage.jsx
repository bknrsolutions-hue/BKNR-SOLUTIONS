import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Download, FileText, Plus, Search, Upload } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import '../Attendance/Attendance.css';
import './RequirementDocuments.css';

const initialValue = field => field.multiple ? [] : field.type === 'date' && field.name === 'document_date'
  ? new Date().toISOString().slice(0, 10)
  : field.name === 'currency' ? 'USD' : '';

const displayValue = value => Array.isArray(value) ? value.join(', ') : value;

export default function RequirementDocumentPage({ documentKind, embedded = false }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [definition, setDefinition] = useState(null);
  const [entries, setEntries] = useState([]);
  const [poOptions, setPoOptions] = useState([]);
  const [emailOptions, setEmailOptions] = useState([]);
  const [lookupOptions, setLookupOptions] = useState({});
  const [currentEmail, setCurrentEmail] = useState('');
  const [selectedEmails, setSelectedEmails] = useState([]);
  const [details, setDetails] = useState({});
  const [shipmentId, setShipmentId] = useState('');
  const [pdfFile, setPdfFile] = useState(null);
  const [formOpen, setFormOpen] = useState(true);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState(null);
  const [loadError, setLoadError] = useState('');

  const notify = useCallback((message, type = 'success') => {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 4500);
  }, []);

  const loadData = useCallback(async () => {
    setLoadError('');
    try {
      const response = await fetch(`/export_documents/requirement/${encodeURIComponent(documentKind)}/data`);
      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await response.json() : null;
      if (!data) throw new Error(response.status === 502
        ? 'Backend server is unavailable. Start the backend on port 8000 and retry.'
        : `Unable to load document form (HTTP ${response.status}).`);
      if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load document page');
      setDefinition(data.definition);
      setEntries(data.entries || []);
      setPoOptions(data.po_options || []);
      setEmailOptions(data.email_options || []);
      setLookupOptions(data.lookup_options || {});
      setCurrentEmail(data.current_email || '');
      setDetails(Object.fromEntries((data.definition?.fields || []).map(field => [field.name, initialValue(field)])));
      setSelectedEmails(data.current_email ? [data.current_email] : []);
    } catch (error) {
      setLoadError(error.message || 'Unable to load document form.');
      notify(error.message, 'error');
    }
  }, [documentKind, notify]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const openForm = () => {
    const values = Object.fromEntries((definition?.fields || []).map(field => [field.name, initialValue(field)]));
    setDetails(values);
    setShipmentId('');
    setPdfFile(null);
    setSelectedEmails(currentEmail ? [currentEmail] : []);
    setFormOpen(true);
  };

  const toggleEmail = email => setSelectedEmails(values => values.includes(email) ? values.filter(value => value !== email) : [...values, email]);

  const changeReference = value => {
    setShipmentId(value);
    const selected = poOptions.find(item => String(item.shipment_id) === String(value));
    if (!selected) return;
    setDetails(current => ({
      ...current,
      ...(definition?.pre_po_allowed ? {
        document_no: selected.shipment_no,
        document_date: selected.document_date || current.document_date,
        expiry_date: selected.validity_date || '',
      } : {}),
      ...(Object.hasOwn(current, 'buyer_name') && (lookupOptions.buyers || []).includes(selected.buyer_name)
        ? { buyer_name: selected.buyer_name } : {}),
      ...(Object.hasOwn(current, 'destination_country') && (lookupOptions.countries || []).includes(selected.country)
        ? { destination_country: selected.country } : {}),
    }));
  };

  const upload = async event => {
    event.preventDefault();
    if (!pdfFile || !selectedEmails.length) return notify('Select a PDF and at least one approver email.', 'error');
    if (!window.confirm('Do you want to import and save this PDF?')) return;
    setSaving(true);
    try {
      const body = new FormData();
      body.append('shipment_id', shipmentId);
      body.append('details_json', JSON.stringify(details));
      body.append('approver_emails', JSON.stringify(selectedEmails));
      body.append('file', pdfFile);
      const response = await fetch(`/export_documents/requirement/${encodeURIComponent(documentKind)}/upload`, { method: 'POST', body });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Upload failed');
      await loadData();
      setShipmentId('');
      setPdfFile(null);
      setFormOpen(true);
      notify(data.message);
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const generatePdf = async () => {
    if (!shipmentId) return notify(`Select ${definition.reference_label}.`, 'error');
    if (!selectedEmails.length) return notify('Select at least one approver email.', 'error');
    const missing = definition.fields.filter(field => field.required && (Array.isArray(details[field.name]) ? !details[field.name].length : !String(details[field.name] || '').trim()));
    if (missing.length) return notify(`Complete required fields: ${missing.map(field => field.label).join(', ')}`, 'error');
    if (!window.confirm('Do you want to generate and save this PDF?')) return;
    setGenerating(true);
    try {
      const response = await fetch(`/export_documents/requirement/${encodeURIComponent(documentKind)}/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shipment_id: Number(shipmentId), details, approver_emails: selectedEmails }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'PDF generation failed');
      await loadData();
      notify(data.message);
      if (data.download_url) window.open(data.download_url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setGenerating(false);
    }
  };

  const confirmExport = (event, label) => {
    if (!window.confirm('Do you want to download this file?')) {
      event.preventDefault();
      return;
    }
    notify(`${label} export started successfully.`);
  };

  const decide = async (row, decision) => {
    const remarks = decision === 'REJECTED' ? window.prompt('Rejection remarks (required):') : window.prompt('Approval remarks (optional):');
    if (decision === 'REJECTED' && !remarks?.trim()) return;
    try {
      const response = await fetch(`/export_documents/requirement/${encodeURIComponent(documentKind)}/files/${row.id}/approval`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, remarks: remarks || null }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Approval failed');
      await loadData();
      notify(data.message);
    } catch (error) {
      notify(error.message, 'error');
    }
  };

  const filteredEntries = useMemo(() => {
    const term = query.trim().toLowerCase();
    return entries.filter(row => !term || `${row.po_number} ${row.document_no} ${row.buyer_name} ${row.approval_status}`.toLowerCase().includes(term));
  }, [entries, query]);

  if (!definition) return <div className="attendance-container">
    {loadError
      ? <div className="attendance-empty"><strong>{loadError}</strong><br /><button className="attendance-btn attendance-btn-primary" style={{ marginTop: 12 }} onClick={loadData}>RETRY</button></div>
      : 'Loading document form...'}
  </div>;

  const documentMode = definition.document_mode || 'IMPORT_PDF';
  const canGenerate = documentMode === 'GENERATE' || documentMode === 'GENERATE_AND_IMPORT_FINAL';
  const canImport = ['IMPORT_PDF', 'IMPORT_FINAL_PDF', 'GENERATE_AND_IMPORT_FINAL'].includes(documentMode);
  const returnToShipmentStatus = Boolean(location.state?.returnToShipmentStatus);
  const goBack = () => navigate(returnToShipmentStatus
    ? '/page/export_supporting_documents?backend=%2Fexport_documents%2Fsupporting_documents%2Fentry'
    : '/page/export_requirement_forms?backend=%2Fexport_documents%2Frequirement-pages%2Fentry');

  return <div className={`attendance-container requirement-document-page ${embedded ? 'embedded' : ''}`}>
    {notice && <div className={`attendance-toast ${notice.type === 'error' ? 'error' : 'success'}`} style={{ top: 80 }}>{notice.message}</div>}
    <div className="attendance-page-header"><div>{!embedded && <button type="button" onClick={goBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: 0, border: 0, background: 'transparent', color: 'var(--att-muted)', cursor: 'pointer', fontSize: 12 }}><ArrowLeft size={14} /> {returnToShipmentStatus ? 'Back to Shipment Status' : 'All Requirement Forms'}</button>}
      <h1 style={{ marginTop: 6 }}>{definition.label}</h1><p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--att-muted)' }}>{definition.stage} · {documentMode.replaceAll('_', ' ')} · Versioned PDF storage and unanimous email approval</p></div>
      <button className="attendance-btn attendance-btn-primary" onClick={() => formOpen ? setFormOpen(false) : openForm()}><Plus size={16} /> {formOpen ? 'HIDE ENTRY FORM' : 'NEW ENTRY & UPLOAD'}</button>
    </div>

    {formOpen && <section className="requirement-inline-form">
      <div className="requirement-inline-form-head"><div><h2>{definition.label} — Details & PDF</h2><p>Complete the fields, upload the PDF, and save the entry.</p></div></div>
      <form onSubmit={upload}><div className="attendance-form-grid requirement-fields-grid">
        <div className="attendance-form-group"><label>{definition.reference_label}</label><select className="attendance-select" value={shipmentId} onChange={event => changeReference(event.target.value)} required><option value="">{definition.pre_po_allowed ? 'Select PI Number / Buyer' : 'Select PO'}</option>{poOptions.map(po => <option key={po.shipment_id} value={po.shipment_id}>{definition.pre_po_allowed ? `${po.shipment_no} · ${po.buyer_name}${po.po_number !== 'PRE-PO' ? ` · PO ${po.po_number}` : ' · PRE-PO'}` : `${po.po_number} · ${po.buyer_name}${po.is_required ? ' · REQUIRED' : ''}`}</option>)}</select>
        </div>
        {definition.fields.map(field => <DynamicField key={field.name} field={field} options={field.lookup ? lookupOptions[field.lookup] || [] : field.options || []} value={details[field.name] || ''} onChange={value => setDetails(values => ({ ...values, [field.name]: value }))} />)}
        {canImport && <div className="attendance-form-group"><label>{['GENERATE_AND_IMPORT_FINAL', 'IMPORT_FINAL_PDF'].includes(documentMode) ? 'Final / Signed PDF (Maximum 25 MB)' : 'Original PDF (Maximum 25 MB)'}</label><input className="attendance-input" type="file" accept="application/pdf,.pdf" onChange={event => setPdfFile(event.target.files?.[0] || null)} required={!canGenerate} /></div>}
        <div className="attendance-form-group requirement-approver-field"><label>Approval Emails ({selectedEmails.length} selected)</label>
          <details open className="requirement-email-dropdown"><summary>{selectedEmails.length ? selectedEmails.join(', ') : 'Select approvers'}</summary>
            <div className="requirement-email-grid">{emailOptions.map(item => <label key={item.email}>
              <input type="checkbox" checked={selectedEmails.includes(item.email)} onChange={() => toggleEmail(item.email)} /><span><strong>{item.name}</strong> · {item.email}{item.email === currentEmail ? ' (Current Session)' : ''}<small>{item.designation}</small></span>
            </label>)}</div>
          </details><small>Only the selected email users can approve this document. The overall status becomes APPROVED only after every selected approver has approved it.</small></div>
        <div className="requirement-save-row">
          {canGenerate && <button type="button" className="attendance-btn attendance-btn-primary" disabled={generating || saving} onClick={generatePdf}><FileText size={14} /> {generating ? 'GENERATING...' : 'GENERATE, SAVE & OPEN PDF'}</button>}
          {canImport && <button type="submit" className="attendance-btn attendance-btn-secondary" disabled={saving || generating}><Upload size={14} /> {saving ? 'UPLOADING...' : ['GENERATE_AND_IMPORT_FINAL', 'IMPORT_FINAL_PDF'].includes(documentMode) ? 'IMPORT FINAL PDF' : 'IMPORT & SAVE PDF'}</button>}
        </div>
      </div></form>
    </section>}

    <div className="attendance-filters-bar" style={{ maxWidth: 420 }}><div className="attendance-filter-group" style={{ position: 'relative' }}><label htmlFor="document-entry-search">Search Records</label>
      <Search size={15} style={{ position: 'absolute', left: 10, bottom: 9 }} /><input id="document-entry-search" className="attendance-input" style={{ paddingLeft: 32 }} value={query} onChange={event => setQuery(event.target.value)} placeholder="PO, buyer, reference, approval..." />
    </div></div>
    <div className="attendance-table-container"><div className="attendance-table-wrapper"><table className="attendance-table"><thead><tr>
      <th>{definition.reference_label}</th><th>Buyer</th>{definition.fields.map(field => <th key={field.name}>{field.label}</th>)}<th>PDF</th><th>Approval</th><th>Pending With</th><th>Approval Emails</th><th>Action</th>
    </tr></thead><tbody>{filteredEntries.map(row => <tr key={row.id}>
      <td><strong>{definition.pre_po_allowed ? row.shipment_no : row.po_number}</strong><br /><small>{definition.pre_po_allowed ? (row.po_number ? `PO: ${row.po_number}` : 'PRE-PO') : row.shipment_no}</small></td><td>{row.buyer_name}</td>
      {definition.fields.map(field => <td key={field.name}>{displayValue(row.details?.[field.name] || row[field.name]) || '—'}</td>)}
      <td><a href={row.download_url} target="_blank" rel="noreferrer" className="attendance-btn attendance-btn-secondary" onClick={event => confirmExport(event, `${definition.label} v${row.version_no}`)}><Download size={13} /> {row.file_origin || 'PDF'} · v{row.version_no}</a>
        {row.versions?.length > 1 && <details style={{ marginTop: 6 }}><summary style={{ cursor: 'pointer' }}>{row.versions.length} versions</summary>{row.versions.map(version => <a key={version.id} href={version.download_url} target="_blank" rel="noreferrer" onClick={event => confirmExport(event, `${definition.label} v${version.version_no}`)} style={{ display: 'block', fontSize: 11, marginTop: 4 }}>v{version.version_no} · {version.file_origin}{version.is_current ? ' · CURRENT' : ''}</a>)}</details>}
      </td>
      <td><strong>{row.approval_status}</strong><br /><small>{row.approval_progress} approved</small></td>
      <td>{row.pending_approvers?.length ? row.pending_approvers.map(email => <small key={email} style={{ display: 'block', color: 'var(--att-danger)' }}>Pending: {email}</small>) : '—'}</td>
      <td>{row.approvals.map(item => <small key={item.email} style={{ display: 'block' }}>{item.email}: <strong>{item.decision}</strong></small>)}</td>
      <td>{row.can_current_user_approve ? <div style={{ display: 'flex', gap: 4 }}><button className="attendance-btn attendance-btn-secondary" onClick={() => decide(row, 'APPROVED')}><Check size={13} /> Approve</button><button className="attendance-btn attendance-btn-secondary" onClick={() => decide(row, 'REJECTED')}>Reject</button></div> : <small>{currentEmail}<br />No pending action</small>}</td>
    </tr>)}{!filteredEntries.length && <tr><td colSpan={definition.fields.length + 8} className="attendance-empty">No {definition.label} entries uploaded yet.</td></tr>}</tbody></table></div></div>

  </div>;
}

function DynamicField({ field, value, onChange, options = [] }) {
  const common = { value, onChange: event => onChange(event.target.value), required: field.required };
  if (field.type === 'select' && field.multiple) {
    const selected = Array.isArray(value) ? value : value ? [value] : [];
    const toggle = option => onChange(selected.includes(option) ? selected.filter(item => item !== option) : [...selected, option]);
    return <div className="attendance-form-group"><label>{field.label} ({selected.length} selected)</label>
      <details className="requirement-email-dropdown"><summary>{selected.length ? selected.join(', ') : options.length ? `Select ${field.label}` : 'No master values available'}</summary>
        <div className="requirement-lookup-multi-grid">{options.map(option => <label key={option}><input type="checkbox" checked={selected.includes(option)} onChange={() => toggle(option)} /><span>{option}</span></label>)}</div>
      </details>{!options.length && <small>Add values in Masters before creating this entry.</small>}
    </div>;
  }
  if (field.type === 'select') return <div className="attendance-form-group"><label>{field.label}</label><select className="attendance-select" {...common}><option value="">{field.lookup && !options.length ? 'No master values available' : `Select ${field.label}`}</option>{options.map(option => <option key={option} value={option}>{option}</option>)}</select>{field.lookup && !options.length && <small>Add values in Masters before creating this entry.</small>}</div>;
  if (field.type === 'textarea') return <div className="attendance-form-group"><label>{field.label}</label><textarea className="attendance-input" rows="2" {...common} /></div>;
  return <div className="attendance-form-group"><label>{field.label}</label><input className="attendance-input" type={field.type || 'text'} step={field.type === 'number' ? '0.01' : undefined} {...common} /></div>;
}
