import React, { useEffect, useMemo, useState } from 'react';
import { Ban, Plus, Store } from 'lucide-react';

const emptyForm = {
  id: '',
  grnNumber: '',
  invoiceDate: '',
  unitId: 0,
  invoiceNumber: '',
  vendorId: 0,
  accountingLedgerId: 0,
  poNumber: 'N/A',
  hsnCode: '',
  gstPercent: 0,
  itemName: '',
  unitName: '',
  quantity: 0,
  rate: 0,
  minimumLevel: 0,
  openingStock: 0,
  grnAvailableStock: 0,
};

const number = (value) => Number(value || 0);
const fixed = (value) => number(value).toFixed(2);
const money = (value) => `₹${fixed(value)}`;

function Field({ label, children }) {
  return (
    <div className="form-group">
      <label>{label}</label>
      {children}
    </div>
  );
}

export default function GeneralStoreEntry() {
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [mode, setMode] = useState('IN');
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [entries, setEntries] = useState([]);
  const [masters, setMasters] = useState({
    grns: [], items: [], vendors: [], hsns: [], locations: [], ledgers: [], pos: ['N/A'],
  });
  const [form, setForm] = useState(emptyForm);
  const [outGrns, setOutGrns] = useState([]);

  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [newItem, setNewItem] = useState({ itemName: '', unitName: '', minimumLevel: 0 });

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const amount = useMemo(() => form.quantity * form.rate, [form.quantity, form.rate]);
  const taxAmount = useMemo(
    () => mode === 'IN' ? amount * form.gstPercent / 100 : 0,
    [amount, form.gstPercent, mode],
  );
  const totalAmount = amount + taxAmount;
  const availableStock = mode === 'IN'
    ? form.openingStock + form.quantity
    : form.openingStock - form.quantity;

  const notify = (type, text) => setMessage({ type, text });

  const fetchData = async ({ preserveForm = false } = {}) => {
    setLoading(true);
    try {
      const response = await fetch('/general_stock/entry?format=json', { credentials: 'include' });
      if (!response.ok) throw new Error(`Unable to load General Stock (${response.status})`);
      const data = await response.json();
      const rows = data.today_data || [];
      setEntries(rows);
      setMasters({
        grns: data.grn_list || [],
        items: data.items || [],
        vendors: data.vendors || [],
        hsns: data.hsn_list || [],
        locations: data.locations || [],
        ledgers: data.posting_ledgers || [],
        pos: (data.po_list || []).length ? data.po_list : ['N/A'],
      });
      if (!preserveForm && rows.length === 0) setShowForm(true);
    } catch (error) {
      notify('error', error.message || 'Unable to load General Stock Entry.');
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (!form.itemName) {
      setForm((current) => ({
        ...current,
        unitName: '', minimumLevel: 0, openingStock: 0, grnAvailableStock: 0,
      }));
      setOutGrns([]);
      return;
    }

    const unitForBalance = mode === 'OUT' ? form.unitId : 0;
    const query = new URLSearchParams({
      item_name: form.itemName,
      unit_id: String(unitForBalance || 0),
    });

    fetch(`/general_stock/api/item_details?${query}`, { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to load item details');
        setForm((current) => ({
          ...current,
          unitName: data.unit_name || '',
          minimumLevel: number(data.minimum_level),
          openingStock: number(data.opening_stock),
          grnAvailableStock: 0,
        }));
      })
      .catch((error) => notify('error', error.message));

    if (mode === 'OUT') {
      fetch(`/general_stock/api/get_item_grns?${query}`, { credentials: 'include' })
        .then((response) => response.json())
        .then((data) => setOutGrns(data.grns || []))
        .catch(() => setOutGrns([]));
    }
  }, [form.itemName, form.unitId, mode]);

  useEffect(() => {
    if (mode !== 'OUT' || !form.itemName || !form.grnNumber) return;
    const query = new URLSearchParams({
      item_name: form.itemName,
      grn_number: form.grnNumber,
      unit_id: String(form.unitId || 0),
    });
    fetch(`/general_stock/api/grn_rate?${query}`, { credentials: 'include' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.message || 'Unable to load GRN balance');
        setForm((current) => ({
          ...current,
          rate: number(data.rate),
          openingStock: number(data.available_qty),
          grnAvailableStock: number(data.available_qty),
        }));
      })
      .catch((error) => notify('error', error.message));
  }, [mode, form.itemName, form.grnNumber, form.unitId]);

  const openForm = (nextMode) => {
    setMode(nextMode);
    setForm(emptyForm);
    setOutGrns([]);
    setSelectedId(null);
    setMessage(null);
    setShowForm(true);
  };

  const switchMode = (nextMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setForm((current) => ({
      ...current,
      grnNumber: '', invoiceDate: '', invoiceNumber: '', vendorId: 0,
      accountingLedgerId: 0, hsnCode: '', gstPercent: 0, quantity: 0,
      rate: 0, openingStock: 0, grnAvailableStock: 0,
    }));
  };

  const validate = () => {
    if (!form.unitId) return 'Production At is required.';
    if (!form.itemName) return 'Item Name is required.';
    if (!form.grnNumber.trim()) return 'GRN Number is required.';
    if (!form.unitName) return 'Item unit is not available in master.';
    if (form.quantity <= 0) return 'Quantity must be greater than zero.';
    if (mode === 'IN' && !form.vendorId) return 'Vendor is required for Stock IN.';
    if (mode === 'IN' && form.rate <= 0) return 'Base Price must be greater than zero for Stock IN.';
    if (mode === 'OUT' && form.quantity > form.openingStock) return `Available item quantity is only ${fixed(form.openingStock)}.`;
    if (mode === 'OUT' && form.quantity > form.grnAvailableStock) return `Selected GRN available quantity is only ${fixed(form.grnAvailableStock)}.`;
    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const validationError = validate();
    if (validationError) {
      notify('error', validationError);
      return;
    }

    const body = new URLSearchParams({
      id: form.id,
      grn_number: form.grnNumber,
      invoice_date: form.invoiceDate,
      unit_id: String(form.unitId),
      invoice_number: form.invoiceNumber,
      vendor_id: String(form.vendorId),
      accounting_ledger_id: String(form.accountingLedgerId),
      po_number: form.poNumber || 'N/A',
      hsn_code: form.hsnCode,
      gst_percent: String(form.gstPercent),
      item_name: form.itemName,
      unit_name: form.unitName,
      movement_type: mode,
      quantity: String(form.quantity),
      rate: String(form.rate),
      minimum_level: String(form.minimumLevel),
    });

    setLoading(true);
    try {
      const response = await fetch('/general_stock/entry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
        body,
      });
      if (!response.ok) {
        let detail = 'Unable to save stock entry.';
        try {
          const data = await response.json();
          detail = data.message || data.detail || detail;
        } catch (_) {}
        throw new Error(detail);
      }

      notify('success', 'Stock entry saved and accounts posting updated.');
      setForm(emptyForm);
      setShowForm(false);
      await fetchData({ preserveForm: true });
    } catch (error) {
      notify('error', error.message || 'Unable to save stock entry.');
    } finally {
      setLoading(false);
    }
  };

  const cancelSelected = async () => {
    const row = entries.find((entry) => entry.id === selectedId);
    if (!row || row.is_cancelled) return;
    if (!window.confirm('Do you want to cancel this stock log?')) return;

    setLoading(true);
    try {
      const response = await fetch(`/general_stock/entry/delete/${row.id}`, {
        method: 'POST', credentials: 'include',
      });
      if (!response.ok) throw new Error('Cancellation failed.');
      notify('success', 'Stock entry cancelled successfully.');
      setSelectedId(null);
      await fetchData({ preserveForm: true });
    } catch (error) {
      notify('error', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAdd = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await fetch('/general_stock/items/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'include',
        body: new URLSearchParams({
          item_name: newItem.itemName,
          unit_name: newItem.unitName,
          minimum_level: String(newItem.minimumLevel),
        }),
      });
      if (!response.ok) throw new Error('Failed to add master item.');
      notify('success', 'Item registered in General Store master.');
      setShowQuickAdd(false);
      setNewItem({ itemName: '', unitName: '', minimumLevel: 0 });
      await fetchData({ preserveForm: true });
    } catch (error) {
      notify('error', error.message);
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="general-stock-page is-loading">
        <div className="general-stock-toolbar skeleton-box" />
        <div className="general-stock-form skeleton-box" />
        <div className="general-stock-table-skeleton skeleton-box" />
      </div>
    );
  }

  return (
    <div className="general-stock-page">
      <div className="general-stock-titlebar">
        <h2><Store size={20} /> General Stock Management</h2>
      </div>

      <div className="general-stock-toolbar">
        <h3>Stock Ledger Logs</h3>
        <div className="general-stock-actions">
          <button type="button" className="btn btn-primary" onClick={() => openForm('IN')}>
            <Plus size={13} /> Stock IN
          </button>
          <button type="button" className="btn general-stock-out" onClick={() => openForm('OUT')}>Stock OUT</button>
          {selectedId && (
            <button type="button" className="btn general-stock-cancel" onClick={cancelSelected} disabled={loading}>
              <Ban size={13} /> Cancel Selected
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`general-stock-message ${message.type}`}>
          <span>{message.type === 'success' ? '✓' : '⚠'} {message.text}</span>
          <button type="button" onClick={() => setMessage(null)}>×</button>
        </div>
      )}

      {showForm && (
        <form className={`general-stock-form ${mode === 'OUT' ? 'out-mode' : ''}`} onSubmit={handleSubmit}>
          <div className="general-stock-section-title">Stock Allocation Info</div>
          <div className="general-stock-tabs">
            <button type="button" className={mode === 'IN' ? 'active' : ''} onClick={() => switchMode('IN')}>Stock IN</button>
            <button type="button" className={mode === 'OUT' ? 'active out' : ''} onClick={() => switchMode('OUT')}>Stock OUT</button>
          </div>

          <div className="general-stock-grid">
            <Field label="GRN Number">
              {mode === 'IN' ? (
                <input className="form-control" value={form.grnNumber} onChange={(e) => setField('grnNumber', e.target.value)} placeholder="Enter or auto-generated GRN" required />
              ) : (
                <select className="form-control" value={form.grnNumber} onChange={(e) => setField('grnNumber', e.target.value)} required>
                  <option value="">Select source GRN</option>
                  {outGrns.map((grn) => <option key={grn} value={grn}>{grn}</option>)}
                </select>
              )}
            </Field>

            {mode === 'IN' && (
              <>
                <Field label="Invoice Date">
                  <input type="date" className="form-control" value={form.invoiceDate} onChange={(e) => setField('invoiceDate', e.target.value)} />
                </Field>
                <Field label="Invoice Number">
                  <input className="form-control" value={form.invoiceNumber} onChange={(e) => setField('invoiceNumber', e.target.value)} placeholder="Supplier invoice number" />
                </Field>
              </>
            )}

            <Field label="Production At">
              <select className="form-control" value={form.unitId} onChange={(e) => setField('unitId', Number(e.target.value))} required>
                <option value="0">Select Unit...</option>
                {masters.locations.map((location) => <option key={location.id} value={location.id}>{location.production_at}</option>)}
              </select>
            </Field>

            {mode === 'IN' && (
              <>
                <Field label="Vendor Entity">
                  <select className="form-control" value={form.vendorId} onChange={(e) => setField('vendorId', Number(e.target.value))}>
                    <option value="0">-- Select Vendor --</option>
                    {masters.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
                  </select>
                </Field>
                <Field label="Accounting Ledger">
                  <select className="form-control" value={form.accountingLedgerId} onChange={(e) => setField('accountingLedgerId', Number(e.target.value))}>
                    <option value="0">Auto - Stock Asset</option>
                    {masters.ledgers.map((ledger) => (
                      <option key={ledger.id} value={ledger.id}>
                        {ledger.ledger_name}{ledger.group_name ? ` (${ledger.group_name})` : ''}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}

            <Field label="PO Number">
              <select className="form-control" value={form.poNumber} onChange={(e) => setField('poNumber', e.target.value)}>
                {masters.pos.map((po) => <option key={po} value={po}>{po}</option>)}
              </select>
            </Field>

            <Field label="Product Nomenclature / Description">
              <select className="form-control" value={form.itemName} onChange={(e) => setField('itemName', e.target.value)} required>
                <option value="">Select Item</option>
                {masters.items.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </Field>

            {mode === 'IN' && (
              <Field label="Unit Name">
                <input className="form-control" value={form.unitName} readOnly />
              </Field>
            )}
          </div>

          <div className="general-stock-section-title metrics">Quantities & Stock Metrics</div>
          <div className="general-stock-grid">
            <Field label="Quantity">
              <input type="number" min="0.01" step="0.01" className="form-control" value={form.quantity || ''} onChange={(e) => setField('quantity', number(e.target.value))} required />
            </Field>

            {mode === 'IN' && (
              <>
                <Field label="Base Price">
                  <input type="number" min="0" step="0.01" className="form-control" value={form.rate || ''} onChange={(e) => setField('rate', number(e.target.value))} />
                </Field>
                <Field label="Taxable Value"><input className="form-control" value={fixed(amount)} readOnly /></Field>
                <Field label="HSN Code">
                  <select
                    className="form-control"
                    value={form.hsnCode}
                    onChange={(e) => {
                      const hsn = masters.hsns.find((item) => item.hsn_code === e.target.value);
                      setForm((current) => ({
                        ...current,
                        hsnCode: e.target.value,
                        gstPercent: number(hsn?.gst_percent),
                      }));
                    }}
                  >
                    <option value="">-- Select HSN --</option>
                    {masters.hsns.map((hsn) => (
                      <option key={hsn.id} value={hsn.hsn_code}>{hsn.hsn_code} ({fixed(hsn.gst_percent)}%)</option>
                    ))}
                  </select>
                </Field>
                <Field label="GST %">
                  <input type="number" min="0" step="0.01" className="form-control" value={form.gstPercent} onChange={(e) => setField('gstPercent', number(e.target.value))} />
                </Field>
                <Field label="Tax Value"><input className="form-control" value={fixed(taxAmount)} readOnly /></Field>
                <Field label="Grand Total"><input className="form-control" value={fixed(totalAmount)} readOnly /></Field>
              </>
            )}

            {mode === 'OUT' && (
              <Field label="Selected GRN Available Qty">
                <input className="form-control" value={fixed(form.grnAvailableStock)} readOnly />
              </Field>
            )}
            <Field label="Available Item Qty"><input className="form-control" value={fixed(form.openingStock)} readOnly /></Field>
            {mode === 'IN' && <Field label="Available Stock"><input className="form-control" value={fixed(availableStock)} readOnly /></Field>}
            {mode === 'IN' && <Field label="Minimum Level"><input className="form-control" value={fixed(form.minimumLevel)} readOnly /></Field>}
          </div>

          <div className="general-stock-form-actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Saving…' : 'Save Entry'}</button>
            <button type="button" className="btn btn-clear" onClick={() => { setShowForm(false); setForm(emptyForm); }}>Cancel</button>
            <button type="button" className="btn btn-clear" onClick={() => setShowQuickAdd(true)}>+ Add New Item</button>
          </div>
        </form>
      )}

      <div className="general-stock-table-wrap">
        <table className="bknr-table general-stock-table">
          <thead>
            <tr>
              <th>ID</th><th>GRN Number</th><th>Invoice Number</th><th>Location</th><th>Vendor</th><th>PO</th>
              <th>Item Name</th><th>HSN</th><th>Unit</th><th>Movement</th><th>Qty</th><th>Rate</th>
              <th>Value</th><th>GST</th><th>Total</th><th>Opening</th><th>Available</th><th>Minimum</th><th>Date</th><th>Time</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr><td colSpan="20" className="general-stock-empty">No stock entries for today.</td></tr>
            ) : entries.map((row) => (
              <tr
                key={row.id}
                className={`${selectedId === row.id ? 'selected' : ''} ${row.is_cancelled ? 'cancelled' : ''}`}
                onClick={() => setSelectedId(row.id)}
              >
                <td>{row.id}{row.is_cancelled ? <span className="cancelled-pill">C</span> : null}</td>
                <td>{row.grn_number}</td><td>{row.invoice_number || '—'}</td><td>{row.production_at || '—'}</td>
                <td>{row.vendor_name || '—'}</td><td>{row.po_number || 'N/A'}</td><td>{row.item_name}</td>
                <td>{row.hsn_code || '—'}</td><td>{row.unit_name}</td>
                <td><span className={`movement-pill ${row.movement_type === 'IN' ? 'in' : 'out'}`}>{row.movement_type}</span></td>
                <td>{fixed(row.quantity)}</td><td>{money(row.rate)}</td><td>{money(row.amount)}</td>
                <td>{money(row.tax_amount)}</td><td>{money(row.total_amount || row.amount)}</td>
                <td>{fixed(row.opening_stock)}</td><td>{fixed(row.available_stock)}</td><td>{fixed(row.minimum_level)}</td>
                <td>{row.date || '—'}</td><td>{row.time ? String(row.time).slice(0, 5) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showQuickAdd && (
        <div className="general-stock-modal-backdrop">
          <form className="general-stock-modal" onSubmit={handleQuickAdd}>
            <h3>Add New Item to Store Master</h3>
            <Field label="Item Name">
              <input className="form-control" value={newItem.itemName} onChange={(e) => setNewItem((current) => ({ ...current, itemName: e.target.value }))} required />
            </Field>
            <Field label="Unit Name">
              <input className="form-control" value={newItem.unitName} onChange={(e) => setNewItem((current) => ({ ...current, unitName: e.target.value }))} required />
            </Field>
            <Field label="Minimum Stock Level">
              <input type="number" min="0" step="0.01" className="form-control" value={newItem.minimumLevel} onChange={(e) => setNewItem((current) => ({ ...current, minimumLevel: number(e.target.value) }))} />
            </Field>
            <div className="general-stock-form-actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>Save Item</button>
              <button type="button" className="btn btn-clear" onClick={() => setShowQuickAdd(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <style>{`
        .general-stock-page{display:flex;flex:1;min-height:0;flex-direction:column;gap:10px;padding:10px 12px 28px;overflow:auto;color:var(--text-primary)}
        .general-stock-titlebar h2{display:flex;align-items:center;gap:8px;margin:0;color:var(--corp-ops);font-size:17px}
        .general-stock-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px}.general-stock-toolbar h3{margin:0;font-size:12px;text-transform:uppercase;color:var(--corp-ops)}
        .general-stock-actions,.general-stock-form-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.general-stock-out{background:#f97316!important;color:#fff!important}.general-stock-cancel{background:#dc2626!important;color:#fff!important}
        .general-stock-message{display:flex;justify-content:space-between;padding:8px 10px;border-radius:7px;font-size:12px;font-weight:750}.general-stock-message.success{background:#dcfce7;color:#166534}.general-stock-message.error{background:#fee2e2;color:#991b1b}.general-stock-message button{border:0;background:none;color:inherit;font-size:16px;cursor:pointer}
        .general-stock-form{padding:11px;border:1px solid var(--border);border-radius:9px;background:var(--card-bg)}
        .general-stock-section-title{padding-bottom:6px;border-bottom:1px dashed var(--border);color:var(--corp-ops);font-size:10px;font-weight:850;text-transform:uppercase}.general-stock-section-title.metrics{margin-top:11px}
        .general-stock-tabs{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin:8px 0}.general-stock-tabs button{height:34px;border:1px solid var(--border);border-radius:6px;background:var(--input-bg);color:var(--text-secondary);font-weight:800}.general-stock-tabs button.active{border-color:var(--corp-ops);color:var(--corp-ops);background:color-mix(in srgb,var(--corp-ops) 10%,transparent)}.general-stock-tabs button.active.out{border-color:#f97316;color:#f97316}
        .general-stock-grid{display:grid;grid-template-columns:repeat(5,minmax(125px,1fr));gap:8px;margin-top:8px}.general-stock-form-actions{justify-content:center;margin-top:12px}.general-stock-form input[readonly]{font-weight:750;background:var(--input-bg-disabled,var(--input-bg))}
        .general-stock-table-wrap{min-height:0;overflow:auto;border:1px solid var(--border);border-radius:8px;background:var(--card-bg)}.general-stock-table{min-width:1850px}.general-stock-table th,.general-stock-table td{padding:7px 6px;font-size:10px;white-space:nowrap;text-align:center}.general-stock-table tbody tr{cursor:pointer}.general-stock-table tbody tr.selected{background:color-mix(in srgb,var(--corp-ops) 13%,transparent);box-shadow:inset 3px 0 var(--corp-ops)}.general-stock-table tbody tr.cancelled{opacity:.58;text-decoration:line-through}.cancelled-pill{margin-left:4px;padding:1px 4px;border-radius:999px;background:#fee2e2;color:#991b1b;text-decoration:none}.movement-pill{display:inline-block;padding:2px 6px;border-radius:4px;color:#fff;font-weight:850}.movement-pill.in{background:#16a34a}.movement-pill.out{background:#dc2626}.general-stock-empty{padding:24px!important;color:var(--text-secondary)}
        .general-stock-modal-backdrop{position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:16px;background:rgba(2,6,23,.65);backdrop-filter:blur(4px)}.general-stock-modal{width:min(390px,100%);display:flex;flex-direction:column;gap:10px;padding:18px;border:1px solid var(--border);border-radius:12px;background:var(--card-bg)}.general-stock-modal h3{margin:0 0 4px;font-size:14px;color:var(--corp-ops)}
        .skeleton-box{position:relative;overflow:hidden;background:var(--card-bg);border:1px solid var(--border);border-radius:9px}.skeleton-box:after{content:'';position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,rgba(148,163,184,.18),transparent);animation:generalStockShimmer 1.1s infinite}.is-loading .general-stock-toolbar{height:46px}.general-stock-form.skeleton-box{height:230px}.general-stock-table-skeleton{height:250px}@keyframes generalStockShimmer{to{transform:translateX(100%)}}
        @media(max-width:1100px){.general-stock-grid{grid-template-columns:repeat(3,minmax(130px,1fr))}}
        @media(max-width:700px){.general-stock-page{padding:8px}.general-stock-titlebar h2{font-size:15px}.general-stock-toolbar{align-items:flex-start;flex-direction:column}.general-stock-actions{width:100%;overflow-x:auto;flex-wrap:nowrap;padding-bottom:3px}.general-stock-actions .btn{flex:0 0 auto}.general-stock-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}.general-stock-form{padding:8px}.general-stock-table-wrap{max-height:none}.general-stock-modal{padding:14px}}
      `}</style>
    </div>
  );
}
