import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckSquare, ChevronRight, Download, FileText, FolderOpen, History, Plus, RefreshCw, Search, ShieldCheck, Upload, X } from 'lucide-react';
import '../Attendance/Attendance.css';
import './SupportingDocuments.css';

const EMPTY_UPLOAD = {
  po_number: '',
  document_kind: '',
  document_no: '',
  remarks: '',
};

const makeCustomCode = label => {
  const slug = label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `CUSTOM_${slug || Date.now()}`.slice(0, 80);
};

const isPendingUpload = row => row.required && row.status === 'PENDING';
const isPendingApproval = row => row.required && row.file_id && (row.approval_status || 'PENDING') !== 'APPROVED';

export default function SupportingDocuments() {
  const navigate = useNavigate();
  const [poOptions, setPoOptions] = useState([]);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [requirementsByPo, setRequirementsByPo] = useState({});
  const [poGroups, setPoGroups] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [poFilter, setPoFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ATTENTION');
  const [expandedPo, setExpandedPo] = useState('');
  const [showAuditLogs, setShowAuditLogs] = useState(false);

  const [requiredModalOpen, setRequiredModalOpen] = useState(false);
  const [requiredPo, setRequiredPo] = useState('');
  const [selectedRequiredCodes, setSelectedRequiredCodes] = useState([]);
  const [customDocuments, setCustomDocuments] = useState([]);
  const [customDocumentLabel, setCustomDocumentLabel] = useState('');
  const [documentSearch, setDocumentSearch] = useState('');

  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState(EMPTY_UPLOAD);
  const [uploadFile, setUploadFile] = useState(null);
  const fileInputRef = useRef(null);

  const showNotification = useCallback((message, type = 'success') => {
    setNotification({ message, type });
    window.setTimeout(() => setNotification(null), 4000);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/export_documents/supporting_documents/data', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to load document checklist.');
      setPoOptions(result.po_options || []);
      setDocumentTypes(result.document_types || []);
      setRequirementsByPo(result.requirements_by_po || {});
      setPoGroups(result.po_groups || []);
      setAuditLogs(result.audit_logs || []);
      setIsAdmin(Boolean(result.is_admin));
      setCompanyId(result.company_id || '');
    } catch (error) {
      showNotification(error.message || 'Failed to load supporting documents.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    // Data is loaded from the authenticated API after this React screen mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const allRequirementChoices = useMemo(() => {
    const merged = new Map(documentTypes.map(item => [item.code, item]));
    customDocuments.forEach(item => merged.set(item.code, item));
    Object.values(requirementsByPo).flat().forEach(item => {
      if (!merged.has(item.code)) merged.set(item.code, { ...item, stage: 'Custom Documents' });
    });
    return Array.from(merged.values());
  }, [customDocuments, documentTypes, requirementsByPo]);

  const openRequiredForm = (poNumber = '') => {
    const filteredPo = poOptions.find(item => item.po_number.toLowerCase() === poFilter.trim().toLowerCase())?.po_number;
    const initialPo = poNumber || filteredPo || poOptions[0]?.po_number || '';
    setRequiredPo(initialPo);
    setSelectedRequiredCodes((requirementsByPo[initialPo] || []).map(item => item.code));
    setCustomDocumentLabel('');
    setDocumentSearch('');
    setRequiredModalOpen(true);
  };

  const changeRequiredPo = poNumber => {
    setRequiredPo(poNumber);
    setSelectedRequiredCodes((requirementsByPo[poNumber] || []).map(item => item.code));
  };

  const toggleRequiredDocument = code => {
    setSelectedRequiredCodes(current =>
      current.includes(code) ? current.filter(item => item !== code) : [...current, code]
    );
  };

  const addCustomDocument = () => {
    const label = customDocumentLabel.trim();
    if (!label) return;
    const code = makeCustomCode(label);
    setCustomDocuments(current => current.some(item => item.code === code)
      ? current
      : [...current, { code, label, stage: 'Custom Documents' }]);
    setSelectedRequiredCodes(current => current.includes(code) ? current : [...current, code]);
    setCustomDocumentLabel('');
  };

  const saveRequiredDocuments = async event => {
    event.preventDefault();
    if (!requiredPo) return showNotification('Select a PO number.', 'error');
    const choices = new Map(allRequirementChoices.map(item => [item.code, item]));
    const documents = selectedRequiredCodes.map(code => ({
      code,
      label: choices.get(code)?.label || code.replaceAll('_', ' '),
    }));
    if (!window.confirm('Do you want to save these documents?')) return;
    setSaving(true);
    try {
      const response = await fetch('/export_documents/supporting_documents/requirements', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ po_number: requiredPo, documents }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Unable to save required documents.');
      setRequiredModalOpen(false);
      setPoFilter(requiredPo);
      setExpandedPo(requiredPo);
      await loadData();
      showNotification(result.message || 'Required document list saved.');
    } catch (error) {
      showNotification(error.message || 'Failed to save required documents.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const uploadChoices = useMemo(() => {
    const merged = new Map(documentTypes.map(item => [item.code, item]));
    (requirementsByPo[uploadForm.po_number] || []).forEach(item => {
      if (!merged.has(item.code)) merged.set(item.code, { ...item, stage: 'Custom Documents' });
    });
    return Array.from(merged.values());
  }, [documentTypes, requirementsByPo, uploadForm.po_number]);

  const openUploadForm = () => {
    navigate('/page/export_requirement_forms?backend=%2Fexport_documents%2Frequirement-pages%2Fentry');
  };

  const openDocumentForm = row => {
    const pageUrl = row?.page_url || (row?.document_kind
      ? `/page/export_requirement_${encodeURIComponent(row.document_kind)}`
      : '/page/export_requirement_forms');
    navigate(pageUrl, { state: { returnToShipmentStatus: true } });
  };

  const changeUploadPo = poNumber => {
    const firstRequired = requirementsByPo[poNumber]?.[0]?.code || documentTypes[0]?.code || '';
    setUploadForm(current => ({ ...current, po_number: poNumber, document_kind: firstRequired }));
  };

  const uploadDocument = async event => {
    event.preventDefault();
    const po = poOptions.find(item => item.po_number === uploadForm.po_number);
    if (!po) return showNotification('Select a valid PO number.', 'error');
    if (!uploadFile) return showNotification('Select a PDF file.', 'error');
    if (uploadFile.type !== 'application/pdf' && !uploadFile.name.toLowerCase().endsWith('.pdf')) {
      return showNotification('Only PDF files are allowed.', 'error');
    }
    if (uploadFile.size > 25 * 1024 * 1024) {
      return showNotification('PDF size cannot exceed 25 MB.', 'error');
    }
    if (!window.confirm('Do you want to import and save this PDF?')) return;

    const body = new FormData();
    body.append('shipment_id', po.shipment_id);
    body.append('document_kind', uploadForm.document_kind);
    body.append('document_no', uploadForm.document_no || '');
    body.append('remarks', uploadForm.remarks || '');
    body.append('file', uploadFile);

    setSaving(true);
    try {
      const response = await fetch('/export_documents/supporting_documents/upload', {
        method: 'POST',
        credentials: 'include',
        body,
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Upload failed.');
      setUploadModalOpen(false);
      setPoFilter(uploadForm.po_number);
      setExpandedPo(uploadForm.po_number);
      await loadData();
      showNotification(result.message || 'Supporting PDF uploaded successfully.');
    } catch (error) {
      showNotification(error.message || 'Network error while uploading PDF.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmPdfExport = (event, row) => {
    if (!window.confirm('Do you want to download this file?')) {
      event.preventDefault();
      return;
    }
    showNotification(`${row.document_label} PDF export started successfully.`);
  };

  const filteredPoGroups = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return poGroups.flatMap(group => {
      if (poFilter !== 'ALL' && !group.po_number.toLowerCase().includes(poFilter.trim().toLowerCase())) return [];
      const rows = group.rows.filter(row => {
        if (!row.required) return false;
        if (statusFilter === 'PENDING_UPLOAD' && !isPendingUpload(row)) return false;
        if (statusFilter === 'PENDING_APPROVAL' && !isPendingApproval(row)) return false;
        if (statusFilter === 'ATTENTION' && !isPendingUpload(row) && !isPendingApproval(row)) return false;
        if (!query) return true;
        return [row.document_label, row.document_no, row.file_name]
          .some(value => String(value || '').toLowerCase().includes(query));
      });
      if (!rows.length) return [];
      if (!query) return [{ ...group, visibleRows: rows }];
      const groupMatch = [group.po_number, group.shipment_no, group.buyer_name]
        .some(value => String(value || '').toLowerCase().includes(query));
      if (groupMatch) {
        const statusRows = group.rows.filter(row => {
          if (!row.required) return false;
          if (statusFilter === 'PENDING_UPLOAD') return isPendingUpload(row);
          if (statusFilter === 'PENDING_APPROVAL') return isPendingApproval(row);
          if (statusFilter === 'ATTENTION') return isPendingUpload(row) || isPendingApproval(row);
          return true;
        });
        return statusRows.length ? [{ ...group, visibleRows: statusRows }] : [];
      }
      return [{ ...group, visibleRows: rows }];
    });
  }, [poFilter, poGroups, searchQuery, statusFilter]);

  const summary = useMemo(() => {
    const scoped = poFilter === 'ALL' ? poGroups : poGroups.filter(group =>
      group.po_number.toLowerCase().includes(poFilter.trim().toLowerCase())
    );
    const requiredRows = scoped.flatMap(group => group.rows).filter(row => row.required);
    return {
      required: requiredRows.length,
      pendingUploads: requiredRows.filter(isPendingUpload).length,
      pendingApprovals: requiredRows.filter(isPendingApproval).length,
      attentionPos: scoped.filter(group => group.rows.some(row => isPendingUpload(row) || isPendingApproval(row))).length,
    };
  }, [poFilter, poGroups]);

  const decideApproval = async (row, decision) => {
    const promptText = decision === 'REJECTED' ? 'Enter rejection reason:' : 'Approval remarks (optional):';
    const remarks = window.prompt(promptText, '') ?? '';
    if (decision === 'REJECTED' && !remarks.trim()) {
      showNotification('Rejection remarks are required.', 'error');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/export_documents/supporting_documents/files/${row.file_id}/approval`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, remarks }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.message || 'Approval update failed.');
      await loadData();
      setExpandedPo(row.po_number);
      showNotification(result.message);
    } catch (error) {
      showNotification(error.message || 'Approval update failed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const visibleDocumentChoices = allRequirementChoices.filter(item => {
    const query = documentSearch.trim().toLowerCase();
    return !query || item.label.toLowerCase().includes(query) || item.stage.toLowerCase().includes(query);
  });
  const groupedChoices = Object.groupBy
    ? Object.groupBy(visibleDocumentChoices, item => item.stage)
    : visibleDocumentChoices.reduce((groups, item) => ({ ...groups, [item.stage]: [...(groups[item.stage] || []), item] }), {});

  return (
    <div className="attendance-container supporting-documents-page">
      {notification && (
        <div className={`attendance-toast ${notification.type === 'success' ? 'success' : 'error'}`} style={{ top: 80 }}>
          {notification.message}
        </div>
      )}

      <div className="attendance-page-header">
        <div>
          <h1 className="supporting-title"><FolderOpen size={22} /> Shipment Status</h1>
          <p className="supporting-subtitle">
            PO-wise required documents, pending uploads and pending approvals
            {companyId ? ` · ${companyId}` : ''}
          </p>
        </div>
        <div className="attendance-page-header-actions">
          <button className="attendance-btn attendance-btn-secondary" type="button" onClick={openUploadForm}>
            <FileText size={15} /> Document Entry Forms
          </button>
          <button className="attendance-btn attendance-btn-secondary" type="button" onClick={loadData} disabled={loading}>
            <RefreshCw size={15} /> Refresh
          </button>
          <button className="attendance-btn attendance-btn-secondary" type="button" onClick={() => openRequiredForm()}>
            <CheckSquare size={16} /> Set Required Documents
          </button>
          <button className="attendance-btn attendance-btn-secondary" type="button" onClick={() => setShowAuditLogs(current => !current)}>
            <History size={16} /> Audit Logs
          </button>
          <button className="attendance-btn attendance-btn-primary" type="button" onClick={() => openUploadForm()}>
            <Upload size={16} /> Upload Document
          </button>
        </div>
      </div>

      <div className="supporting-summary-grid">
        <button type="button" className={`supporting-summary-card ${statusFilter === 'REQUIRED' ? 'active' : ''}`} onClick={() => setStatusFilter('REQUIRED')}><span>Required Documents</span><strong>{summary.required}</strong></button>
        <button type="button" className={`supporting-summary-card pending ${statusFilter === 'PENDING_UPLOAD' ? 'active' : ''}`} onClick={() => setStatusFilter('PENDING_UPLOAD')}><span>Pending Uploads</span><strong>{summary.pendingUploads}</strong></button>
        <button type="button" className={`supporting-summary-card pending ${statusFilter === 'PENDING_APPROVAL' ? 'active' : ''}`} onClick={() => setStatusFilter('PENDING_APPROVAL')}><span>Pending Approvals</span><strong>{summary.pendingApprovals}</strong></button>
        <button type="button" className={`supporting-summary-card pending ${statusFilter === 'ATTENTION' ? 'active' : ''}`} onClick={() => setStatusFilter('ATTENTION')}><span>POs Requiring Action</span><strong>{summary.attentionPos}</strong></button>
      </div>

      <div className="attendance-filters-bar supporting-filters">
        <div className="attendance-filter-group">
          <label htmlFor="support-po-filter">PO Number</label>
          <input id="support-po-filter" className="attendance-input" list="support-po-options" value={poFilter === 'ALL' ? '' : poFilter} onChange={event => setPoFilter(event.target.value || 'ALL')} placeholder="Type or select a PO" autoComplete="off" />
          <datalist id="support-po-options">
            {poOptions.map(po => <option key={po.po_number} value={po.po_number}>{po.buyer_name || po.source}</option>)}
          </datalist>
        </div>
        <div className="attendance-filter-group">
          <label htmlFor="support-status-filter">Document View</label>
          <select id="support-status-filter" className="attendance-select" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
            <option value="ATTENTION">Pending Uploads & Approvals</option>
            <option value="REQUIRED">All Required Documents</option>
            <option value="PENDING_UPLOAD">Pending Uploads</option>
            <option value="PENDING_APPROVAL">Pending Approvals</option>
          </select>
        </div>
        <div className="attendance-filter-group supporting-search-field">
          <label htmlFor="support-search">Search</label>
          <div className="supporting-search-wrap">
            <Search size={15} />
            <input id="support-search" className="attendance-input" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="PO, buyer, document, file..." />
          </div>
        </div>
      </div>

      <div className="attendance-table-container">
        <div className="attendance-table-wrapper">
          <table className="attendance-table">
            <thead>
              <tr>
                <th style={{ width: 55, textAlign: 'center' }}>Sl</th>
                <th>PO Number</th>
                <th>Shipment / Buyer</th>
                <th style={{ textAlign: 'center' }}>Required</th>
                <th style={{ textAlign: 'center' }}>Pending Upload</th>
                <th style={{ textAlign: 'center' }}>Pending Approval</th>
                <th style={{ width: 120, textAlign: 'center' }}>PO Status</th>
                <th style={{ width: 70, textAlign: 'center' }}>View</th>
              </tr>
            </thead>
            <tbody>
              {filteredPoGroups.map((group, index) => {
                const pendingUploadCount = group.rows.filter(isPendingUpload).length;
                const pendingApprovalCount = group.rows.filter(isPendingApproval).length;
                const expanded = expandedPo === group.po_number;
                return (
                  <Fragment key={group.po_number}>
                    <tr className={`supporting-po-row ${group.status === 'PENDING' || group.status === 'REJECTED' ? 'supporting-pending-row' : ''}`} onClick={() => setExpandedPo(expanded ? '' : group.po_number)}>
                      <td style={{ textAlign: 'center' }}>{index + 1}</td>
                      <td><strong className="supporting-po-number">{group.po_number}</strong></td>
                      <td><strong>{group.shipment_no || '-'}</strong><small className="supporting-cell-note">{group.buyer_name || '-'}</small></td>
                      <td style={{ textAlign: 'center' }}><strong>{group.required_count}</strong></td>
                      <td style={{ textAlign: 'center' }}><strong>{pendingUploadCount}</strong></td>
                      <td style={{ textAlign: 'center' }}><strong>{pendingApprovalCount}</strong></td>
                      <td style={{ textAlign: 'center' }}><span className={`supporting-status ${group.status.toLowerCase()}`}>{group.status.replaceAll('_', ' ')}</span></td>
                      <td style={{ textAlign: 'center' }}><ChevronRight size={16} className={`supporting-expand-icon ${expanded ? 'open' : ''}`} /></td>
                    </tr>
                    {expanded && (
                      <tr className="supporting-expanded-row">
                        <td colSpan="8">
                          <div className="supporting-po-detail">
                            <div className="supporting-po-detail-head">
                              <strong>{group.po_number} · Document Details</strong>
                              <div>
                                <button className="attendance-btn attendance-btn-secondary supporting-row-action" type="button" onClick={event => { event.stopPropagation(); openRequiredForm(group.po_number); }}><CheckSquare size={13} /> Requirements</button>
                                <button className="attendance-btn attendance-btn-primary supporting-row-action" type="button" onClick={event => { event.stopPropagation(); openUploadForm({ po_number: group.po_number }); }}><Upload size={13} /> Upload</button>
                              </div>
                            </div>
                            <div className="attendance-table-wrapper">
                              <table className="attendance-table supporting-inner-table">
                                <thead><tr><th>Document</th><th>Requirement</th><th>Upload</th><th>Approval</th><th>File / Reference</th><th>Reviewed By</th><th>Action</th></tr></thead>
                                <tbody>
                                  {group.visibleRows.map(row => (
                                    <tr key={`${row.document_kind}-${row.file_id || 'pending'}`}>
                                      <td><FileText size={14} className="supporting-doc-icon" /><strong>{row.document_label}</strong></td>
                                      <td>{row.required ? 'REQUIRED' : 'EXTRA'}</td>
                                      <td><span className={`supporting-status ${row.status.toLowerCase()}`}>{row.status}</span></td>
                                      <td>{row.file_id ? <><span className={`supporting-status ${(row.approval_status || 'PENDING').toLowerCase()}`}>{row.approval_status || 'PENDING'}</span><small className="supporting-cell-note">{row.approval_progress ? `${row.approval_progress} approved` : ''}</small>{row.pending_approvers?.map(email => <small className="supporting-cell-note" key={email} style={{ color: 'var(--att-danger)' }}>Pending: {email}</small>)}</> : '-'}</td>
                                      <td>{row.file_name || '-'}<small className="supporting-cell-note">{row.document_no || ''}{row.version_no ? ` · v${row.version_no}` : ''}</small></td>
                                      <td>{row.approved_by || '-'}<small className="supporting-cell-note">{row.approved_at ? new Date(row.approved_at).toLocaleString() : ''}</small></td>
                                      <td>
                                        <div className="supporting-detail-actions">
                                          {row.status === 'PENDING' ? <button className="attendance-btn attendance-btn-primary supporting-row-action" type="button" onClick={() => openDocumentForm(row)}><Upload size={13} /> Enter & Upload</button> : <a className="attendance-btn attendance-btn-secondary supporting-row-action" href={row.download_url} target="_blank" rel="noreferrer" onClick={event => confirmPdfExport(event, row)}><Download size={13} /> PDF</a>}
                                          {(row.can_current_user_approve || (isAdmin && !row.approvals?.length)) && row.file_id && <><button className="attendance-btn attendance-btn-secondary supporting-row-action supporting-approve" type="button" disabled={saving} onClick={() => decideApproval(row, 'APPROVED')}><ShieldCheck size={13} /> Approve</button><button className="attendance-btn attendance-btn-secondary supporting-row-action supporting-reject" type="button" disabled={saving} onClick={() => decideApproval(row, 'REJECTED')}>Reject</button></>}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                  {!group.visibleRows.length && <tr><td colSpan="7" className="attendance-empty">No required documents match this view.</td></tr>}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
              {!filteredPoGroups.length && (
                <tr><td colSpan="8" className="attendance-empty">{loading ? 'Loading pending documents...' : 'No required documents are pending in this view.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showAuditLogs && (
        <div className="attendance-table-container supporting-audit-table">
          <div className="supporting-po-detail-head"><strong><History size={15} /> Supporting Document Audit Logs</strong><span>{auditLogs.length} latest events</span></div>
          <div className="attendance-table-wrapper"><table className="attendance-table"><thead><tr><th>Time</th><th>Action</th><th>Record</th><th>Previous</th><th>New Value</th><th>User</th></tr></thead><tbody>{auditLogs.map(log => <tr key={log.id}><td>{log.edited_at ? new Date(log.edited_at).toLocaleString() : '-'}</td><td><strong>{log.action}</strong></td><td>#{log.record_id}</td><td>{log.old_value || '-'}</td><td>{log.new_value || '-'}</td><td>{log.edited_by || '-'}</td></tr>)}{!auditLogs.length && <tr><td colSpan="6" className="attendance-empty">No audit events yet.</td></tr>}</tbody></table></div>
        </div>
      )}

      {requiredModalOpen && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content supporting-requirements-modal">
            <div className="attendance-modal-header">
              <div><h2>Required List of Documents</h2><p>Select every document expected for this PO.</p></div>
              <button className="attendance-modal-close-btn" type="button" onClick={() => !saving && setRequiredModalOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={saveRequiredDocuments}>
              <div className="attendance-modal-body">
                <div className="supporting-requirement-columns">
                  <div className="attendance-form-group">
                    <label htmlFor="required-po-number">1. PO Number</label>
                    <input id="required-po-number" className="attendance-input" list="required-po-options" value={requiredPo} onChange={event => changeRequiredPo(event.target.value)} placeholder="Type or select a PO number" autoComplete="off" required />
                    <datalist id="required-po-options">
                      {poOptions.map(po => <option key={po.po_number} value={po.po_number}>{po.buyer_name || po.source}</option>)}
                    </datalist>
                    {requiredPo && <div className="supporting-po-meta">Shipment: {poOptions.find(item => item.po_number === requiredPo)?.shipment_no || '-'}</div>}
                  </div>
                  <div className="attendance-form-group">
                    <label>2. Required Documents ({selectedRequiredCodes.length} selected)</label>
                    <details className="supporting-check-dropdown">
                      <summary>{selectedRequiredCodes.length ? `${selectedRequiredCodes.length} documents selected` : 'Select documents'}</summary>
                      <div className="supporting-check-dropdown-panel">
                        <input className="attendance-input" value={documentSearch} onChange={event => setDocumentSearch(event.target.value)} placeholder="Search document list..." />
                        <div className="supporting-check-list">
                          {Object.entries(groupedChoices).map(([stage, items]) => (
                            <div className="supporting-doc-stage" key={stage}>
                              <strong>{stage}</strong>
                              {items.map(item => (
                                <label key={item.code} className="supporting-check-option">
                                  <input type="checkbox" checked={selectedRequiredCodes.includes(item.code)} onChange={() => toggleRequiredDocument(item.code)} />
                                  <span>{item.label}</span>
                                </label>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    </details>
                  </div>
                </div>
                <div className="supporting-custom-document">
                  <div className="attendance-form-group">
                    <label htmlFor="custom-document-label">Document not available in the list?</label>
                    <input id="custom-document-label" className="attendance-input" value={customDocumentLabel} onChange={event => setCustomDocumentLabel(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addCustomDocument(); } }} placeholder="Enter custom document name" />
                  </div>
                  <button className="attendance-btn attendance-btn-secondary" type="button" onClick={addCustomDocument}><Plus size={14} /> Add Custom Document</button>
                </div>
              </div>
              <div className="attendance-modal-footer">
                <button className="attendance-btn attendance-btn-secondary" type="button" onClick={() => setRequiredModalOpen(false)} disabled={saving}>Cancel</button>
                <button className="attendance-btn attendance-btn-primary" type="submit" disabled={saving}><CheckSquare size={15} /> {saving ? 'Saving...' : 'Save Required List'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {uploadModalOpen && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content" style={{ maxWidth: 760 }}>
            <div className="attendance-modal-header">
              <div><h2>Upload Export Document</h2><p>Uses the same PI-to-payment document master list.</p></div>
              <button className="attendance-modal-close-btn" type="button" onClick={() => !saving && setUploadModalOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={uploadDocument}>
              <div className="attendance-modal-body">
                <div className="attendance-form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="attendance-form-group">
                    <label htmlFor="upload-po-number">PO Number</label>
                    <select id="upload-po-number" className="attendance-select" value={uploadForm.po_number} onChange={event => changeUploadPo(event.target.value)} required>
                      <option value="">Select PO Number</option>
                      {poOptions.map(po => <option key={po.po_number} value={po.po_number}>{po.po_number} · {po.buyer_name}</option>)}
                    </select>
                  </div>
                  <div className="attendance-form-group">
                    <label htmlFor="upload-document-kind">Document Type</label>
                    <select id="upload-document-kind" className="attendance-select" value={uploadForm.document_kind} onChange={event => setUploadForm(current => ({ ...current, document_kind: event.target.value }))} required>
                      <option value="">Select Document</option>
                      {uploadChoices.map(item => <option key={item.code} value={item.code}>{item.label} · {item.stage}</option>)}
                    </select>
                  </div>
                  <div className="attendance-form-group">
                    <label htmlFor="upload-document-no">Document No / Reference</label>
                    <input id="upload-document-no" className="attendance-input" value={uploadForm.document_no} onChange={event => setUploadForm(current => ({ ...current, document_no: event.target.value }))} />
                  </div>
                  <div className="attendance-form-group">
                    <label htmlFor="upload-pdf">PDF File (Maximum 25 MB)</label>
                    <input id="upload-pdf" ref={fileInputRef} className="attendance-input" type="file" accept="application/pdf,.pdf" onChange={event => setUploadFile(event.target.files?.[0] || null)} required />
                  </div>
                  <div className="attendance-form-group full-width">
                    <label htmlFor="upload-remarks">Remarks</label>
                    <textarea id="upload-remarks" className="attendance-input" rows="3" value={uploadForm.remarks} onChange={event => setUploadForm(current => ({ ...current, remarks: event.target.value }))} />
                  </div>
                </div>
              </div>
              <div className="attendance-modal-footer">
                <button className="attendance-btn attendance-btn-secondary" type="button" onClick={() => setUploadModalOpen(false)} disabled={saving}>Cancel</button>
                <button className="attendance-btn attendance-btn-primary" type="submit" disabled={saving}><Upload size={15} /> {saving ? 'Uploading...' : 'Save PDF in DB'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
