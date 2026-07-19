import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Building2, Calculator, Download, FileText, Pencil, Plus, Printer, Ship, X } from 'lucide-react';
import '../Attendance/Attendance.css';
import './ProformaInvoices.css';
import ExportSearchPanel from './ExportSearchPanel';
import { secureDownload } from '../../utils/secureDownload';

const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = (piNo = '') => ({
  pi_no: piNo, pi_date: today(), validity_date: '', po_number: '', buyer_name: '',
  buyer_address: '', country: '', currency: 'USD', incoterm: 'FOB', payment_terms: '',
  port_of_loading: '', port_of_discharge: '', product_description: '', quantity: '',
  unit: 'KG', unit_price: '', status: 'DRAFT', remarks: '',
});

const statuses = ['DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED'];

export default function ProformaInvoices() {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [showAudit, setShowAudit] = useState(false);
  const [buyerOptions, setBuyerOptions] = useState([]);
  const [countryOptions, setCountryOptions] = useState([]);
  const [nextPiNo, setNextPiNo] = useState('');

  const notify = useCallback((msg, type = 'success') => {
    setNotice({ msg, type });
    window.setTimeout(() => setNotice(null), 4000);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const response = await fetch('/export_documents/proforma_invoice/data', { headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.detail || data.message || 'Unable to load data');
      setRows(data.rows || []);
      setCanApprove(Boolean(data.can_approve));
      setAuditLogs(data.audit_logs || []);
      setBuyerOptions(data.buyers || []);
      setCountryOptions(data.countries || []);
      setNextPiNo(data.next_pi_no || '');
    } catch (error) {
      notify(error.message || 'Unable to load proforma invoices', 'error');
    }
  }, [notify]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter(row => {
      const matchesStatus = statusFilter === 'ALL' || row.status === statusFilter;
      const haystack = `${row.pi_no} ${row.po_number || ''} ${row.buyer_name} ${row.country}`.toLowerCase();
      return matchesStatus && (!term || haystack.includes(term));
    });
  }, [query, rows, statusFilter]);

  const total = (Number(form.quantity) || 0) * (Number(form.unit_price) || 0);
  const counts = useMemo(() => Object.fromEntries(
    ['ALL', ...statuses].map(status => [status, status === 'ALL' ? rows.length : rows.filter(row => row.status === status).length]),
  ), [rows]);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm(nextPiNo));
    setModalOpen(true);
  };

  const openEdit = row => {
    setEditingId(row.id);
    setForm({
      ...emptyForm(), ...row,
      validity_date: row.validity_date || '', po_number: row.po_number || '',
      port_of_loading: row.port_of_loading || '', port_of_discharge: row.port_of_discharge || '',
      remarks: row.remarks || '',
    });
    setModalOpen(true);
  };

  const change = event => setForm(current => ({ ...current, [event.target.name]: event.target.value }));

  const changeBuyer = event => {
    const buyerName = event.target.value;
    const buyer = buyerOptions.find(item => item.name === buyerName);
    setForm(current => ({
      ...current,
      buyer_name: buyerName,
      buyer_address: buyer?.address || '',
      country: buyer?.country || current.country,
      currency: buyer?.currency || current.currency,
      payment_terms: buyer?.payment_terms || current.payment_terms,
    }));
  };

  const save = async event => {
    event.preventDefault();
    if (form.validity_date && form.validity_date < form.pi_date) {
      notify('Valid Until date cannot be before PI Date.', 'error');
      return;
    }
    if (!form.buyer_name.trim() || !form.buyer_address.trim() || !form.product_description.trim()) {
      notify('Buyer, buyer address and product description are required.', 'error');
      return;
    }
    if ((Number(form.quantity) || 0) <= 0 || Number(form.unit_price) < 0) {
      notify('Quantity must be greater than zero and unit price cannot be negative.', 'error');
      return;
    }
    if (!window.confirm(`Do you want to ${editingId ? 'update' : 'save'} this invoice?`)) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        validity_date: form.validity_date || null,
        po_number: form.po_number || null,
        port_of_loading: form.port_of_loading || null,
        port_of_discharge: form.port_of_discharge || null,
        remarks: form.remarks || null,
        quantity: Number(form.quantity),
        unit_price: Number(form.unit_price),
      };
      const response = await fetch(
        editingId ? `/export_documents/proforma_invoice/${editingId}` : '/export_documents/proforma_invoice/save',
        { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      );
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || data.detail || 'Save failed');
      setModalOpen(false);
      await loadData();
      notify(data.message);
    } catch (error) {
      notify(error.message || 'Unable to save proforma invoice', 'error');
    } finally {
      setSaving(false);
    }
  };

  const confirmAndOpen = (url, label) => {
    if (!window.confirm('Do you want to download this file?')) return;
    window.open(url, '_blank', 'noopener,noreferrer');
    notify(`${label} export started successfully.`);
  };

  const cancelRow = async row => {
    if (!window.confirm(`Cancel proforma invoice ${row.pi_no}?`)) return;
    try {
      const response = await fetch(`/export_documents/proforma_invoice/cancel/${row.id}`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Cancel failed');
      await loadData();
      notify(data.message);
    } catch (error) {
      notify(error.message || 'Unable to cancel proforma invoice', 'error');
    }
  };

  const decideApproval = async (row, decision) => {
    const remarks = decision === 'REJECTED' ? window.prompt('Enter rejection reason:') : '';
    if (decision === 'REJECTED' && !remarks) return;
    if (decision === 'APPROVED' && !window.confirm(`Approve proforma invoice ${row.pi_no}?`)) return;
    try {
      const response = await fetch(`/export_documents/proforma_invoice/${row.id}/approval`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, remarks: remarks || null }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Approval failed');
      await loadData();
      notify(data.message);
    } catch (error) {
      notify(error.message || 'Unable to update approval', 'error');
    }
  };

  return (
    <div className="attendance-container export-document-page">
      {notice && <div className={`attendance-toast ${notice.type === 'error' ? 'error' : 'success'}`} style={{ top: 80 }}>{notice.msg}</div>}

      <div className="attendance-page-header">
        <div>
          <h1>Proforma Invoice Register</h1>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--att-muted)' }}>
            Prepare buyer offers and track record approval. Final PDF approval is handled in Document Center by selected emails.
          </p>
        </div>
        <div className="attendance-page-header-actions">
          <button className="attendance-btn attendance-btn-secondary" onClick={() => setShowAudit(value => !value)}>
            AUDIT LOGS ({auditLogs.length})
          </button>
          <button className="attendance-btn attendance-btn-secondary" onClick={() => secureDownload('/export_documents/proforma_invoice/register.xlsx', 'Proforma Invoice Register')}>
            <Download size={16} /> EXPORT
          </button>
          <button className="attendance-btn attendance-btn-primary" onClick={openNew}>
            <Plus size={16} /> NEW PROFORMA INVOICE
          </button>
        </div>
      </div>

      {showAudit && <div className="attendance-table-container" style={{ marginBottom: 14 }}>
        <div className="attendance-table-wrapper"><table className="attendance-table">
          <thead><tr><th>Time</th><th>PI Record</th><th>Action</th><th>Previous</th><th>New Value</th><th>User</th></tr></thead>
          <tbody>{auditLogs.map(log => <tr key={log.id} data-audit-record-id={log.record_id} onClick={() => { setShowAudit(false); window.setTimeout(() => window.openAuditRecord?.(log.record_id), 80); }} style={{ cursor: 'pointer' }}><td>{log.edited_at}</td><td>Row ID #{log.record_id}</td><td><strong>{log.action}</strong></td><td>{log.old_value || '—'}</td><td>{log.new_value || '—'}</td><td>{log.edited_by || '—'}</td></tr>)}
          {!auditLogs.length && <tr><td colSpan="6" className="attendance-empty">No audit activity yet.</td></tr>}</tbody>
        </table></div>
      </div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(110px, 1fr))', gap: 10, marginBottom: 14 }}>
        {['ALL', ...statuses].map(status => (
          <button key={status} type="button" onClick={() => setStatusFilter(status)} className="attendance-btn attendance-btn-secondary"
            style={{ justifyContent: 'space-between', borderColor: statusFilter === status ? 'var(--att-accent)' : undefined }}>
            <span>{status === 'ALL' ? 'TOTAL' : status}</span><strong>{counts[status]}</strong>
          </button>
        ))}
      </div>

      <ExportSearchPanel
        id="pi-search"
        label="Search PI / Buyer / PO"
        value={query}
        onChange={setQuery}
        count={filteredRows.length}
        placeholder="PI number, buyer or PO…"
      />

      <div className="attendance-table-container">
        <div className="attendance-table-wrapper">
          <table className="attendance-table">
            <thead><tr>
              <th>PI No</th><th>PI Date</th><th>Buyer / Country</th><th>Buyer PO</th><th>Product</th>
              <th style={{ textAlign: 'right' }}>Quantity</th><th style={{ textAlign: 'right' }}>Unit Price</th>
              <th style={{ textAlign: 'right' }}>Total</th><th>Valid Until</th><th>Status</th><th>PI Record Approval</th><th style={{ textAlign: 'center' }}>Actions</th>
            </tr></thead>
            <tbody>
              {filteredRows.map(row => (
                <tr key={row.id} data-record-id={row.id}>
                  <td style={{ fontWeight: 800, color: 'var(--att-accent)' }}>{row.pi_no}</td>
                  <td>{row.pi_date}</td><td><strong>{row.buyer_name}</strong><br /><small>{row.country}</small></td>
                  <td>{row.po_number || '—'}</td><td style={{ maxWidth: 220 }}>{row.product_description}</td>
                  <td style={{ textAlign: 'right' }}>{Number(row.quantity).toLocaleString()} {row.unit}</td>
                  <td style={{ textAlign: 'right' }}>{Number(row.unit_price).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right', fontWeight: 800 }}>{row.currency} {Number(row.total_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td>{row.validity_date || '—'}</td><td><span className="attendance-status-badge">{row.status}</span></td>
                  <td title={row.approval_remarks || ''}><span className="attendance-status-badge">{row.approval_status}</span></td>
                  <td><div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                    <button title="Edit" className="attendance-action-dots-btn" onClick={() => openEdit(row)}><Pencil size={14} /></button>
                    <button title="Print" className="attendance-action-dots-btn" onClick={() => confirmAndOpen(`/export_documents/proforma_invoice/print/${row.id}`, `${row.pi_no} print view`)}><Printer size={14} /></button>
                    <button title="Export PDF" className="attendance-action-dots-btn" onClick={() => confirmAndOpen(`/export_documents/proforma_invoice/pdf/${row.id}`, `${row.pi_no} PDF`)}><FileText size={14} /></button>
                    {canApprove && row.approval_status !== 'APPROVED' && <button title="Approve" className="attendance-action-dots-btn" onClick={() => decideApproval(row, 'APPROVED')}>✓</button>}
                    {canApprove && row.approval_status !== 'REJECTED' && <button title="Reject" className="attendance-action-dots-btn" onClick={() => decideApproval(row, 'REJECTED')}>✕</button>}
                    <button title="Cancel" className="attendance-action-dots-btn" onClick={() => cancelRow(row)}><Ban size={14} /></button>
                  </div></td>
                </tr>
              ))}
              {!filteredRows.length && <tr><td colSpan="12" className="attendance-empty">No proforma invoices found.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && <div className="attendance-modal-overlay">
        <div className="attendance-modal-content pi-form-modal">
          <div className="attendance-modal-header"><div><h2>{editingId ? 'Edit' : 'Create'} Proforma Invoice</h2>
            <p>Complete buyer, trade, shipment and commercial value details.</p></div>
            <button className="attendance-modal-close-btn" onClick={() => setModalOpen(false)}><X size={20} /></button>
          </div>
          <form onSubmit={save}>
            <div className="attendance-modal-body pi-form-body">
              <section className="pi-form-section">
                <div className="pi-form-section-title"><FileText size={15} /><span>1. Document & Buyer Details</span></div>
                <div className="pi-form-grid-organized">
                  <Field label="PI Number *" name="pi_no" value={form.pi_no} onChange={change} required placeholder="PI-2026-0001" />
                  <Field label="PI Date *" name="pi_date" type="date" value={form.pi_date} onChange={change} required />
                  <Field label="Valid Until" name="validity_date" type="date" min={form.pi_date} value={form.validity_date} onChange={change} />
                  <Field label="Buyer PO (Optional)" name="po_number" value={form.po_number} onChange={change} placeholder="Buyer PO #" />
                  {editingId
                    ? <Select label="PI Status" name="status" value={form.status} onChange={change} options={statuses} />
                    : <div className="attendance-form-group"><label>PI Status</label><div className="attendance-input pi-readonly-value">DRAFT</div></div>}

                  <div className="attendance-form-group">
                    <label>Buyer Name *</label>
                    <select className="attendance-select" name="buyer_name" value={form.buyer_name} onChange={changeBuyer} required>
                      <option value="">Select Buyer</option>
                      {buyerOptions.map(buyer => <option key={buyer.name} value={buyer.name}>{buyer.name}{buyer.country ? ` · ${buyer.country}` : ''}</option>)}
                      {form.buyer_name && !buyerOptions.some(buyer => buyer.name === form.buyer_name) && <option value={form.buyer_name}>{form.buyer_name}</option>}
                    </select>
                  </div>
                  <div className="attendance-form-group">
                    <label>Country *</label>
                    <select className="attendance-select" name="country" value={form.country} onChange={change} required>
                      <option value="">Select Country</option>
                      {countryOptions.map(country => <option key={country} value={country}>{country}</option>)}
                      {form.country && !countryOptions.includes(form.country) && <option value={form.country}>{form.country}</option>}
                    </select>
                  </div>
                  <Select label="Currency *" name="currency" value={form.currency} onChange={change} options={['USD', 'EUR', 'GBP', 'AED', 'JPY', 'INR']} />
                  <div className="attendance-form-group pi-full-row"><label>Buyer Address *</label><textarea className="attendance-input" name="buyer_address" value={form.buyer_address} onChange={change} required rows="2" placeholder="Complete buyer billing & shipping address" /></div>
                </div>
              </section>

              <section className="pi-form-section">
                <div className="pi-form-section-title"><Ship size={15} /><span>2. Trade & Shipment Terms</span></div>
                <div className="pi-form-grid-organized">
                  <Select label="Incoterm *" name="incoterm" value={form.incoterm} onChange={change} options={['FOB', 'CFR', 'CIF', 'EXW', 'FCA', 'CPT', 'CIP', 'DDP']} />
                  <Field label="Payment Terms *" name="payment_terms" value={form.payment_terms} onChange={change} required placeholder="Advance / LC / documents" />
                  <Field label="Port of Loading" name="port_of_loading" value={form.port_of_loading} onChange={change} placeholder="Loading port" />
                  <Field label="Port of Discharge" name="port_of_discharge" value={form.port_of_discharge} onChange={change} placeholder="Destination port" />
                </div>
              </section>

              <section className="pi-form-section">
                <div className="pi-form-section-title"><Calculator size={15} /><span>3. Product & Commercial Value</span></div>
                <div className="pi-form-grid-organized">
                  <div className="attendance-form-group pi-full-row"><label>Product Description *</label><textarea className="attendance-input" name="product_description" value={form.product_description} onChange={change} required rows="2" placeholder="Product, species, grade, glaze, freezing type and packing specification" /></div>
                  <Field label="Quantity *" name="quantity" type="number" min="0.001" step="0.001" value={form.quantity} onChange={change} required placeholder="0.000" />
                  <Select label="Unit *" name="unit" value={form.unit} onChange={change} options={['KG', 'MT', 'LB', 'CTN', 'PCS']} />
                  <Field label="Unit Price *" name="unit_price" type="number" min="0" step="0.0001" value={form.unit_price} onChange={change} required placeholder="0.00" />
                  <div className="attendance-form-group"><label>Total PI Value</label><div className="pi-total-value"><small>{form.currency}</small><strong>{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div></div>
                  <div className="attendance-form-group pi-full-row"><label>Remarks / Special Conditions</label><textarea className="attendance-input" name="remarks" value={form.remarks} onChange={change} rows="2" placeholder="Quality, delivery, documentation or offer conditions" /></div>
                </div>
              </section>
            </div>
            <div className="attendance-modal-footer">
              <div className="pi-footer-total"><span>Offer Value</span><strong>{form.currency} {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
              <button type="button" className="attendance-btn attendance-btn-secondary" onClick={() => setModalOpen(false)}>CANCEL</button>
              <button type="submit" className="attendance-btn attendance-btn-primary" disabled={saving}>{saving ? 'SAVING...' : editingId ? 'UPDATE PI' : 'CREATE PI'}</button>
            </div>
          </form>
        </div>
      </div>}
    </div>
  );
}

function Field({ label, ...props }) {
  return <div className="attendance-form-group"><label>{label}</label><input className="attendance-input" {...props} /></div>;
}

function Select({ label, options, ...props }) {
  return <div className="attendance-form-group"><label>{label}</label><select className="attendance-select" {...props}>{options.map(option => <option key={option}>{option}</option>)}</select></div>;
}
