import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Download, FileText, Pencil, Plus, Printer, Search, X } from 'lucide-react';
import '../Attendance/Attendance.css';

const today = () => new Date().toISOString().slice(0, 10);
const emptyForm = () => ({
  pi_no: '', pi_date: today(), validity_date: '', po_number: '', buyer_name: '',
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
    setForm(emptyForm());
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

  const save = async event => {
    event.preventDefault();
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
    <div className="attendance-container">
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
          <button className="attendance-btn attendance-btn-secondary" onClick={() => confirmAndOpen('/export_documents/proforma_invoice/register.xlsx', 'Proforma Invoice Register')}>
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
          <tbody>{auditLogs.map(log => <tr key={log.id}><td>{log.edited_at}</td><td>#{log.record_id}</td><td><strong>{log.action}</strong></td><td>{log.old_value || '—'}</td><td>{log.new_value || '—'}</td><td>{log.edited_by || '—'}</td></tr>)}
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

      <div className="attendance-filters-bar" style={{ maxWidth: 390 }}>
        <div className="attendance-filter-group" style={{ position: 'relative' }}>
          <label htmlFor="pi-search">Search PI / Buyer / PO</label>
          <Search size={15} style={{ position: 'absolute', left: 10, bottom: 9, color: 'var(--att-muted)' }} />
          <input id="pi-search" className="attendance-input" style={{ paddingLeft: 32 }} value={query} onChange={event => setQuery(event.target.value)} placeholder="Search..." />
        </div>
      </div>

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
                <tr key={row.id}>
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
        <div className="attendance-modal-content" style={{ maxWidth: 930 }}>
          <div className="attendance-modal-header"><h2>{editingId ? 'Edit' : 'Create'} Proforma Invoice</h2>
            <button className="attendance-modal-close-btn" onClick={() => setModalOpen(false)}><X size={20} /></button>
          </div>
          <form onSubmit={save}>
            <div className="attendance-modal-body">
              <div className="attendance-form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <Field label="PI Number" name="pi_no" value={form.pi_no} onChange={change} required placeholder="PI-2026-0001" />
                <Field label="PI Date" name="pi_date" type="date" value={form.pi_date} onChange={change} required />
                <Field label="Valid Until" name="validity_date" type="date" value={form.validity_date} onChange={change} />
                <Field label="Buyer Name" name="buyer_name" value={form.buyer_name} onChange={change} required />
                <Field label="Country" name="country" value={form.country} onChange={change} required />
                <Field label="Buyer PO (Optional)" name="po_number" value={form.po_number} onChange={change} />
                <div className="attendance-form-group" style={{ gridColumn: 'span 3' }}><label>Buyer Address</label><textarea className="attendance-input" name="buyer_address" value={form.buyer_address} onChange={change} required rows="2" /></div>
                <Select label="Currency" name="currency" value={form.currency} onChange={change} options={['USD', 'EUR', 'GBP', 'AED', 'JPY', 'INR']} />
                <Select label="Incoterm" name="incoterm" value={form.incoterm} onChange={change} options={['FOB', 'CFR', 'CIF', 'EXW', 'FCA', 'CPT', 'CIP', 'DDP']} />
                <Field label="Payment Terms" name="payment_terms" value={form.payment_terms} onChange={change} required placeholder="30% advance, balance against documents" />
                <Field label="Port of Loading" name="port_of_loading" value={form.port_of_loading} onChange={change} />
                <Field label="Port of Discharge" name="port_of_discharge" value={form.port_of_discharge} onChange={change} />
                <Select label="Status" name="status" value={form.status} onChange={change} options={statuses} />
                <div className="attendance-form-group" style={{ gridColumn: 'span 3' }}><label>Product Description</label><textarea className="attendance-input" name="product_description" value={form.product_description} onChange={change} required rows="2" placeholder="Species, grade, freezing and packing details" /></div>
                <Field label="Quantity" name="quantity" type="number" min="0.001" step="0.001" value={form.quantity} onChange={change} required />
                <Select label="Unit" name="unit" value={form.unit} onChange={change} options={['KG', 'MT', 'LB', 'CTN', 'PCS']} />
                <Field label="Unit Price" name="unit_price" type="number" min="0" step="0.0001" value={form.unit_price} onChange={change} required />
                <div className="attendance-form-group"><label>Calculated Total</label><div className="attendance-input" style={{ fontWeight: 800 }}>{form.currency} {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
                <div className="attendance-form-group" style={{ gridColumn: 'span 2' }}><label>Remarks</label><input className="attendance-input" name="remarks" value={form.remarks} onChange={change} /></div>
              </div>
            </div>
            <div className="attendance-modal-footer">
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
