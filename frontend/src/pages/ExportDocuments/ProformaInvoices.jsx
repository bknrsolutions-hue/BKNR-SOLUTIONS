import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, Building2, Calculator, Download, FileText, Pencil, Plus, Printer, Ship, X } from 'lucide-react';
import '../Attendance/Attendance.css';
import './ProformaInvoices.css';
import ExportSearchPanel from './ExportSearchPanel';
import { secureDownload } from '../../utils/secureDownload';

const today = () => new Date().toISOString().slice(0, 10);
const emptyItem = () => ({
  brand: '', packing_style: '', freezer: '', count_glaze: '', weight_glaze: '',
  species: '', variety: '', grade: '', no_of_pieces: '', no_of_mc: '',
  quantity: '', unit: 'KG', unit_price: '',
});

const emptyForm = (piNo = '') => ({
  pi_no: piNo, pi_date: today(), validity_date: '', po_number: '', buyer_name: '',
  buyer_address: '', country: '', currency: 'USD', incoterm: 'FOB', payment_terms: '',
  port_of_loading: '', port_of_discharge: '', product_description: '', quantity: '',
  unit: 'KG', unit_price: '', status: 'DRAFT', remarks: '',
  brand: '', packing_style: '', freezer: '', count_glaze: '', weight_glaze: '',
  species: '', variety: '', grade: '', no_of_pieces: '', no_of_mc: '',
  items: [emptyItem()],
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
  const [brandOptions, setBrandOptions] = useState([]);
  const [packingOptions, setPackingOptions] = useState([]);
  const [freezerOptions, setFreezerOptions] = useState([]);
  const [glazeOptions, setGlazeOptions] = useState([]);
  const [speciesOptions, setSpeciesOptions] = useState([]);
  const [varietyOptions, setVarietyOptions] = useState([]);
  const [gradeOptions, setGradeOptions] = useState([]);
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
      setBrandOptions(data.brands || []);
      setPackingOptions(data.packing_styles || []);
      setFreezerOptions(data.freezers || []);
      setGlazeOptions(data.glazes || []);
      setSpeciesOptions(data.species || []);
      setVarietyOptions(data.varieties || []);
      setGradeOptions(data.grades || []);
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

  const total = useMemo(() => {
    if (form.items && form.items.length) {
      return form.items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0), 0);
    }
    return (Number(form.quantity) || 0) * (Number(form.unit_price) || 0);
  }, [form.items, form.quantity, form.unit_price]);

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
    let parsedItems = [];
    if (row.items_json) {
      try { parsedItems = JSON.parse(row.items_json); } catch { parsedItems = []; }
    }
    if (!parsedItems || !parsedItems.length) {
      parsedItems = [{
        brand: row.brand || '', packing_style: row.packing_style || '', freezer: row.freezer || '',
        count_glaze: row.count_glaze || '', weight_glaze: row.weight_glaze || '', species: row.species || '',
        variety: row.variety || '', grade: row.grade || '', no_of_pieces: row.no_of_pieces || '',
        no_of_mc: row.no_of_mc || '', quantity: row.quantity || '', unit: row.unit || 'KG',
        unit_price: row.unit_price || '',
      }];
    }
    setForm({
      ...emptyForm(), ...row,
      validity_date: row.validity_date || '', po_number: row.po_number || '',
      port_of_loading: row.port_of_loading || '', port_of_discharge: row.port_of_discharge || '',
      remarks: row.remarks || '',
      items: parsedItems,
    });
    setModalOpen(true);
  };

  const handleAddItemRow = () => {
    setForm(current => ({ ...current, items: [...(current.items || []), emptyItem()] }));
  };

  const handleRemoveItemRow = (idx) => {
    setForm(current => {
      const filtered = (current.items || []).filter((_, i) => i !== idx);
      return { ...current, items: filtered.length ? filtered : [emptyItem()] };
    });
  };

  const handleItemRowChange = (idx, field, value) => {
    setForm(current => {
      const updatedItems = (current.items || []).map((row, i) => i === idx ? { ...row, [field]: value } : row);
      const firstItem = updatedItems[0] || {};
      const totalQty = updatedItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
      const totalMc = updatedItems.reduce((sum, item) => sum + (Number(item.no_of_mc) || 0), 0);
      return {
        ...current,
        items: updatedItems,
        brand: firstItem.brand || current.brand,
        packing_style: firstItem.packing_style || current.packing_style,
        freezer: firstItem.freezer || current.freezer,
        count_glaze: firstItem.count_glaze || current.count_glaze,
        weight_glaze: firstItem.weight_glaze || current.weight_glaze,
        species: firstItem.species || current.species,
        variety: firstItem.variety || current.variety,
        grade: firstItem.grade || current.grade,
        no_of_pieces: firstItem.no_of_pieces || current.no_of_pieces,
        no_of_mc: totalMc || firstItem.no_of_mc || current.no_of_mc,
        quantity: totalQty > 0 ? totalQty : current.quantity,
        unit_price: firstItem.unit_price || current.unit_price,
      };
    });
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
    if (!form.buyer_name.trim() || !form.buyer_address.trim()) {
      notify('Buyer and buyer address are required.', 'error');
      return;
    }
    if (!window.confirm(`Do you want to ${editingId ? 'update' : 'save'} this invoice?`)) return;
    setSaving(true);
    try {
      const firstItem = (form.items && form.items[0]) || {};
      const totalQty = (form.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) || Number(form.quantity) || 0;
      const avgPrice = (form.items && form.items.length) ? (form.items[0].unit_price || form.unit_price) : form.unit_price;
      const descSummary = form.product_description || (form.items || []).map(i => `${i.species} ${i.variety} ${i.grade}`.trim()).filter(Boolean).join('; ');

      const payload = {
        ...form,
        validity_date: form.validity_date || null,
        po_number: form.po_number || null,
        port_of_loading: form.port_of_loading || null,
        port_of_discharge: form.port_of_discharge || null,
        remarks: form.remarks || null,
        product_description: descSummary || 'Seafood Export Products',
        quantity: Number(totalQty) || 1,
        unit_price: Number(avgPrice) || 0,
        brand: firstItem.brand || form.brand || null,
        packing_style: firstItem.packing_style || form.packing_style || null,
        freezer: firstItem.freezer || form.freezer || null,
        count_glaze: firstItem.count_glaze || form.count_glaze || null,
        weight_glaze: firstItem.weight_glaze || form.weight_glaze || null,
        species: firstItem.species || form.species || null,
        variety: firstItem.variety || form.variety || null,
        grade: firstItem.grade || form.grade || null,
        no_of_pieces: firstItem.no_of_pieces || form.no_of_pieces || null,
        no_of_mc: Number(firstItem.no_of_mc) || Number(form.no_of_mc) || 0,
        items_json: JSON.stringify(form.items || []),
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
          <button className="attendance-btn attendance-btn-primary" onClick={() => modalOpen ? setModalOpen(false) : openNew()}>
            <Plus size={16} /> {modalOpen ? 'HIDE FORM' : 'NEW PROFORMA INVOICE'}
          </button>
        </div>
      </div>

      {modalOpen && (
        <section className="requirement-inline-form pi-inline-form" style={{ marginBottom: 16 }}>
          <div className="requirement-inline-form-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2>{editingId ? 'Edit' : 'Create'} Proforma Invoice</h2>
              <p>Complete buyer, trade, shipment and commercial value details.</p>
            </div>
            <button type="button" className="attendance-btn attendance-btn-secondary" onClick={() => setModalOpen(false)}>
              <X size={16} /> HIDE FORM
            </button>
          </div>
          <form onSubmit={save}>
            <div className="pi-form-body" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: '10px 0' }}>
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
                <div className="pi-form-section-title" style={{ justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><Calculator size={15} /><span>3. Product & Commercial Value</span></div>
                  <button type="button" className="attendance-btn attendance-btn-secondary" style={{ padding: '2px 8px', fontSize: 10 }} onClick={handleAddItemRow}>
                    <Plus size={12} /> ADD ITEM SPECIFICATION
                  </button>
                </div>
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {(form.items || []).map((it, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', background: 'var(--att-card)', border: '1px solid var(--att-border)', borderRadius: 8, padding: 10 }}>
                        <div style={{ minWidth: 120, flex: '1 1 120px' }}>
                          <Select label="Brand" value={it.brand} onChange={e => handleItemRowChange(idx, 'brand', e.target.value)} options={['', ...brandOptions]} />
                        </div>
                        <div style={{ minWidth: 125, flex: '1 1 125px' }}>
                          <Select label="Pack Style" value={it.packing_style} onChange={e => handleItemRowChange(idx, 'packing_style', e.target.value)} options={['', ...packingOptions]} />
                        </div>
                        <div style={{ minWidth: 110, flex: '1 1 110px' }}>
                          <Select label="Freezer" value={it.freezer} onChange={e => handleItemRowChange(idx, 'freezer', e.target.value)} options={['', ...freezerOptions]} />
                        </div>
                        <div style={{ minWidth: 115, flex: '1 1 115px' }}>
                          <Select label="Count Glaze" value={it.count_glaze} onChange={e => handleItemRowChange(idx, 'count_glaze', e.target.value)} options={['', ...glazeOptions]} />
                        </div>
                        <div style={{ minWidth: 115, flex: '1 1 115px' }}>
                          <Select label="Weight Glaze" value={it.weight_glaze} onChange={e => handleItemRowChange(idx, 'weight_glaze', e.target.value)} options={['', ...glazeOptions]} />
                        </div>
                        <div style={{ minWidth: 115, flex: '1 1 115px' }}>
                          <Select label="Species" value={it.species} onChange={e => handleItemRowChange(idx, 'species', e.target.value)} options={['', ...speciesOptions]} />
                        </div>
                        <div style={{ minWidth: 115, flex: '1 1 115px' }}>
                          <Select label="Variety" value={it.variety} onChange={e => handleItemRowChange(idx, 'variety', e.target.value)} options={['', ...varietyOptions]} />
                        </div>
                        <div style={{ minWidth: 100, flex: '1 1 100px' }}>
                          <Select label="Grade" value={it.grade} onChange={e => handleItemRowChange(idx, 'grade', e.target.value)} options={['', ...gradeOptions]} />
                        </div>
                        <div style={{ minWidth: 85, flex: '1 1 85px' }}>
                          <Field label="Pcs / Lb" value={it.no_of_pieces} onChange={e => handleItemRowChange(idx, 'no_of_pieces', e.target.value)} placeholder="16/20" />
                        </div>
                        <div style={{ minWidth: 90, flex: '1 1 90px' }}>
                          <Field label="Order MC" type="number" min="0" value={it.no_of_mc} onChange={e => handleItemRowChange(idx, 'no_of_mc', e.target.value)} placeholder="0" />
                        </div>
                        <div style={{ minWidth: 95, flex: '1 1 95px' }}>
                          <Field label="Quantity *" type="number" min="0.001" step="0.001" value={it.quantity} onChange={e => handleItemRowChange(idx, 'quantity', e.target.value)} required placeholder="0.000" />
                        </div>
                        <div style={{ minWidth: 75, flex: '1 1 75px' }}>
                          <Select label="Unit *" value={it.unit} onChange={e => handleItemRowChange(idx, 'unit', e.target.value)} options={['KG', 'MT', 'LB', 'CTN', 'PCS']} />
                        </div>
                        <div style={{ minWidth: 95, flex: '1 1 95px' }}>
                          <Field label="Unit Price *" type="number" min="0" step="0.0001" value={it.unit_price} onChange={e => handleItemRowChange(idx, 'unit_price', e.target.value)} required placeholder="0.00" />
                        </div>
                        <div style={{ minWidth: 100, flex: '1 1 100px' }}>
                          <div className="attendance-form-group">
                            <label>Total Value</label>
                            <div className="pi-total-value" style={{ height: 38, display: 'flex', alignItems: 'center' }}>
                              <small>{form.currency}</small>
                              <strong style={{ fontSize: 12 }}>{((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                            </div>
                          </div>
                        </div>
                        {(form.items || []).length > 1 && (
                          <button type="button" className="attendance-btn attendance-btn-secondary" style={{ color: 'var(--att-danger)', height: 38, padding: '0 10px', fontSize: 14, marginBottom: 2 }} onClick={() => handleRemoveItemRow(idx)}>
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  <button type="button" className="attendance-btn attendance-btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={handleAddItemRow}>
                    <Plus size={14} /> Add Product Line Item
                  </button>

                  <div className="attendance-form-group pi-full-row" style={{ marginTop: 8 }}><label>Product Description *</label><textarea className="attendance-input" name="product_description" value={form.product_description} onChange={change} required rows="2" placeholder="Product, species, grade, glaze, freezing type and packing specification" /></div>
                  <div className="attendance-form-group pi-full-row"><label>Remarks / Special Conditions</label><textarea className="attendance-input" name="remarks" value={form.remarks} onChange={change} rows="2" placeholder="Quality, delivery, documentation or offer conditions" /></div>
                </div>
              </section>
            </div>
            <div className="attendance-modal-footer" style={{ marginTop: 12, padding: '12px 0 0', borderTop: '1px solid var(--att-border)' }}>
              <div className="pi-footer-total"><span>Offer Value</span><strong>{form.currency} {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></div>
              <button type="button" className="attendance-btn attendance-btn-secondary" onClick={() => setModalOpen(false)}>CANCEL</button>
              <button type="submit" className="attendance-btn attendance-btn-primary" disabled={saving}>{saving ? 'SAVING...' : editingId ? 'UPDATE PI' : 'CREATE PI'}</button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

function Field({ label, ...props }) {
  return <div className="attendance-form-group"><label>{label}</label><input className="attendance-input" {...props} /></div>;
}

function Select({ label, options, ...props }) {
  return <div className="attendance-form-group"><label>{label}</label><select className="attendance-select" {...props}>{options.map(option => <option key={option}>{option}</option>)}</select></div>;
}
