import React, { useEffect, useMemo, useState } from 'react';
import { Store, Plus, Ban, RefreshCw, ArrowDownToLine, ArrowUpFromLine, X } from 'lucide-react';

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

  const fetchData = async () => {
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
  }, [form.itemName, form.grnNumber, form.unitId, mode]);

  const openForm = (targetMode) => {
    setMode(targetMode);
    setShowForm(true);
    setForm(emptyForm);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage(null);

    const body = new URLSearchParams({
      id: form.id || '',
      grn_number: form.grnNumber,
      invoice_date: form.invoiceDate,
      unit_id: String(form.unitId),
      invoice_number: form.invoiceNumber,
      vendor_id: String(form.vendorId),
      accounting_ledger_id: String(form.accountingLedgerId),
      po_number: form.poNumber,
      hsn_code: form.hsnCode,
      gst_percent: String(form.gstPercent),
      item_name: form.itemName,
      unit_name: form.unitName,
      movement_type: mode,
      quantity: String(form.quantity),
      rate: String(form.rate),
      minimum_level: String(form.minimumLevel),
    });

    try {
      const response = await fetch('/general_stock/entry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        credentials: 'include',
        body,
      });

      let data = {};
      try { data = await response.json(); } catch (e) {}

      if (!response.ok) {
        throw new Error(data.message || data.error || 'Failed to save general stock entry');
      }

      notify('success', `✅ Stock ${mode} entry saved successfully!`);
      setShowForm(false);
      setForm(emptyForm);
      await fetchData();
    } catch (error) {
      notify('error', `❌ ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const cancelSelected = async () => {
    if (!selectedId) return;
    if (!window.confirm(`Cancel selected stock entry record #${selectedId}?`)) return;
    setLoading(true);

    try {
      const response = await fetch(`/general_stock/entry/delete/${selectedId}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || data.message || 'Unable to cancel record');
      }
      notify('success', '✅ Record cancelled successfully.');
      setSelectedId(null);
      await fetchData();
    } catch (error) {
      notify('error', `❌ ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAdd = async (event) => {
    event.preventDefault();
    setLoading(true);
    const body = new URLSearchParams({
      item_name: newItem.itemName,
      unit_name: newItem.unitName,
      minimum_level: String(newItem.minimumLevel),
    });

    try {
      const response = await fetch('/general_stock/items/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'include',
        body,
      });

      if (!response.ok) throw new Error('Unable to add item');
      notify('success', `✅ Added "${newItem.itemName.toUpperCase()}" to Store Master.`);
      setShowQuickAdd(false);
      setNewItem({ itemName: '', unitName: '', minimumLevel: 0 });
      await fetchData();
      setForm((current) => ({ ...current, itemName: newItem.itemName.toUpperCase() }));
    } catch (error) {
      notify('error', `❌ ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const INBadge = () => (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 4, background: 'rgba(16,185,129,0.15)', color: '#10b981', fontSize: 11, fontWeight: 800 }}>
      IN
    </span>
  );
  const OUTBadge = () => (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: 11, fontWeight: 800 }}>
      OUT
    </span>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto', gap: 16, padding: '16px 16px 80px' }}>
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <h2 style={{ color: 'var(--corp-ops)', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <Store size={22} /> General Store Management
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-clear" onClick={fetchData} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} className={loading ? 'spin-animation' : ''} /> Refresh
          </button>
          {!showForm && (
            <>
              <button
                className="btn btn-primary"
                style={{ background: '#10b981', borderColor: '#10b981', display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => openForm('IN')}
              >
                <ArrowDownToLine size={13} /> Stock IN
              </button>
              <button
                className="btn btn-primary"
                style={{ background: '#ef4444', borderColor: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => openForm('OUT')}
              >
                <ArrowUpFromLine size={13} /> Stock OUT
              </button>
            </>
          )}
          {selectedId && (
            <button
              className="btn btn-clear"
              style={{ color: '#ef4444', borderColor: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}
              onClick={cancelSelected}
              disabled={loading}
            >
              <Ban size={13} /> Cancel Selected
            </button>
          )}
        </div>
      </div>

      {/* Message Banner */}
      {message && (
        <div style={{ padding: '10px 16px', borderRadius: 8, background: message.type === 'success' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: message.type === 'success' ? '#10b981' : '#ef4444', fontSize: 13, fontWeight: 700, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{message.text}</span>
          <button style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }} onClick={() => setMessage(null)}>✕</button>
        </div>
      )}

      {/* STOCK FORM */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ flexShrink: 0 }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: 14, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            {mode === 'IN' ? 'GENERAL STORE — STOCK IN PURCHASE BILL ENTRY' : 'GENERAL STORE — STOCK OUT CONSUMPTION'}
          </h3>

          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--corp-ops)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.5px' }}>
            1. Stock Allocation Info
          </div>

          <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12, marginBottom: 16 }}>
            <Field label="GRN Number *">
              {mode === 'IN' ? (
                <input className="form-control" style={inputStyle} value={form.grnNumber} onChange={(e) => setField('grnNumber', e.target.value)} placeholder="Enter or auto-generated GRN" required />
              ) : (
                <select className="form-control" style={inputStyle} value={form.grnNumber} onChange={(e) => setField('grnNumber', e.target.value)} required>
                  <option value="">Select source GRN</option>
                  {outGrns.map((grn) => <option key={grn} value={grn}>{grn}</option>)}
                </select>
              )}
            </Field>

            {mode === 'IN' && (
              <>
                <Field label="Invoice Date">
                  <input type="date" className="form-control" style={inputStyle} value={form.invoiceDate} onChange={(e) => setField('invoiceDate', e.target.value)} />
                </Field>
                <Field label="Invoice Number">
                  <input className="form-control" style={inputStyle} value={form.invoiceNumber} onChange={(e) => setField('invoiceNumber', e.target.value)} placeholder="Supplier invoice number" />
                </Field>
              </>
            )}

            <Field label="Production At *">
              <select className="form-control" style={inputStyle} value={form.unitId} onChange={(e) => setField('unitId', Number(e.target.value))} required>
                <option value="0">Select Unit...</option>
                {masters.locations.map((location) => <option key={location.id} value={location.id}>{location.production_at}</option>)}
              </select>
            </Field>

            {mode === 'IN' && (
              <>
                <Field label="Vendor Entity *">
                  <select className="form-control" style={inputStyle} value={form.vendorId} onChange={(e) => setField('vendorId', Number(e.target.value))} required>
                    <option value="0">-- Select Vendor --</option>
                    {masters.vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
                  </select>
                </Field>
                <Field label="Accounting Ledger">
                  <select className="form-control" style={inputStyle} value={form.accountingLedgerId} onChange={(e) => setField('accountingLedgerId', Number(e.target.value))}>
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
              <select className="form-control" style={inputStyle} value={form.poNumber} onChange={(e) => setField('poNumber', e.target.value)}>
                {masters.pos.map((po) => <option key={po} value={po}>{po}</option>)}
              </select>
            </Field>

            <Field label="Product Nomenclature / Description *">
              <select
                className="form-control"
                style={inputStyle}
                value={form.itemName}
                onChange={(e) => {
                  if (e.target.value === '__add__') {
                    setShowQuickAdd(true);
                  } else {
                    setField('itemName', e.target.value);
                  }
                }}
                required
              >
                <option value="">Select Item</option>
                {masters.items.map((item) => <option key={item} value={item}>{item}</option>)}
                <option value="__add__" style={{ fontWeight: 800, color: 'var(--corp-ops)' }}>➕ Add New Item</option>
              </select>
            </Field>

            {mode === 'IN' && (
              <Field label="Unit Name">
                <input className="form-control" style={{ ...inputStyle, backgroundColor: 'var(--header-bg)' }} value={form.unitName} readOnly />
              </Field>
            )}
          </div>

          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--corp-ops)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: '0.5px' }}>
            2. Quantities & Stock Metrics
          </div>

          <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 12 }}>
            <Field label="Quantity *">
              <input type="number" min="0.01" step="0.01" className="form-control" style={inputStyle} value={form.quantity || ''} onChange={(e) => setField('quantity', number(e.target.value))} required />
            </Field>

            {mode === 'IN' && (
              <>
                <Field label="Base Price">
                  <input type="number" min="0" step="0.01" className="form-control" style={inputStyle} value={form.rate || ''} onChange={(e) => setField('rate', number(e.target.value))} />
                </Field>
                <Field label="Taxable Value">
                  <input className="form-control" style={{ ...inputStyle, backgroundColor: 'var(--header-bg)' }} value={fixed(amount)} readOnly />
                </Field>
                <Field label="HSN Code">
                  <select
                    className="form-control"
                    style={inputStyle}
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
                  <input type="number" min="0" step="0.01" className="form-control" style={inputStyle} value={form.gstPercent} onChange={(e) => setField('gstPercent', number(e.target.value))} />
                </Field>
                <Field label="Tax Value">
                  <input className="form-control" style={{ ...inputStyle, backgroundColor: 'var(--header-bg)' }} value={fixed(taxAmount)} readOnly />
                </Field>
                <Field label="Grand Total">
                  <input className="form-control" style={{ ...inputStyle, backgroundColor: 'var(--header-bg)', fontWeight: 800, color: 'var(--corp-ops)' }} value={fixed(totalAmount)} readOnly />
                </Field>
              </>
            )}

            {mode === 'OUT' && (
              <Field label="Selected GRN Available Qty">
                <input className="form-control" style={{ ...inputStyle, backgroundColor: 'var(--header-bg)', fontWeight: 700 }} value={fixed(form.grnAvailableStock)} readOnly />
              </Field>
            )}
            <Field label="Available Item Qty">
              <input className="form-control" style={{ ...inputStyle, backgroundColor: 'var(--header-bg)' }} value={fixed(form.openingStock)} readOnly />
            </Field>
            {mode === 'IN' && (
              <Field label="Available Stock">
                <input className="form-control" style={{ ...inputStyle, backgroundColor: 'var(--header-bg)', fontWeight: 700 }} value={fixed(availableStock)} readOnly />
              </Field>
            )}
            {mode === 'IN' && (
              <Field label="Minimum Level">
                <input className="form-control" style={{ ...inputStyle, backgroundColor: 'var(--header-bg)' }} value={fixed(form.minimumLevel)} readOnly />
              </Field>
            )}
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ background: mode === 'IN' ? '#10b981' : '#ef4444', borderColor: mode === 'IN' ? '#10b981' : '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              {mode === 'IN' ? <ArrowDownToLine size={14} /> : <ArrowUpFromLine size={14} />} Save
            </button>
            <button type="button" className="btn btn-clear" onClick={() => { setShowForm(false); setForm(emptyForm); }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* TODAY'S LOG TABLE */}
      <div style={{ flexShrink: 0 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Today's General Store Entries
        </h3>
        <div className="table-responsive">
          <table className="bknr-table" style={{ minWidth: 2100 }}>
            <colgroup>
              <col style={{ width: 52 }} />   {/* ID */}
              <col style={{ width: 88 }} />   {/* Date */}
              <col style={{ width: 60 }} />   {/* Time */}
              <col style={{ width: 72 }} />   {/* Movement */}
              <col style={{ width: 130 }} />  {/* GRN Number */}
              <col style={{ width: 130 }} />  {/* Invoice Number */}
              <col style={{ width: 140 }} />  {/* Location */}
              <col style={{ width: 150 }} />  {/* Vendor */}
              <col style={{ width: 90 }} />   {/* PO Number */}
              <col style={{ width: 220 }} />  {/* Item Name */}
              <col style={{ width: 72 }} />   {/* HSN */}
              <col style={{ width: 72 }} />   {/* Unit */}
              <col style={{ width: 72 }} />   {/* Qty */}
              <col style={{ width: 84 }} />   {/* Rate */}
              <col style={{ width: 100 }} />  {/* Taxable Value */}
              <col style={{ width: 72 }} />   {/* GST % */}
              <col style={{ width: 100 }} />  {/* Grand Total */}
              <col style={{ width: 84 }} />   {/* Opening */}
              <col style={{ width: 84 }} />   {/* Available */}
              <col style={{ width: 84 }} />   {/* Min Level */}
            </colgroup>
            <thead>
              <tr>
                <th className="text-center">ID</th>
                <th className="text-center">Date</th>
                <th className="text-center">Time</th>
                <th className="text-center">Movement</th>
                <th>GRN Number</th>
                <th>Invoice No.</th>
                <th>Location</th>
                <th>Vendor</th>
                <th>PO No.</th>
                <th>Item Name / Description</th>
                <th className="text-center">HSN</th>
                <th className="text-center">Unit</th>
                <th className="text-right">Qty</th>
                <th className="text-right">Rate</th>
                <th className="text-right">Taxable Val.</th>
                <th className="text-right">GST %</th>
                <th className="text-right">Grand Total</th>
                <th className="text-right">Opening</th>
                <th className="text-right">Available</th>
                <th className="text-right">Min Level</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr><td colSpan={20} className="text-center" style={{ padding: 24, color: 'var(--text-secondary)' }}>No general stock entries recorded today.</td></tr>
              ) : (
                entries.map((row) => (
                  <tr
                    key={row.id}
                    style={{
                      opacity: row.is_cancelled ? 0.5 : 1,
                      textDecoration: row.is_cancelled ? 'line-through' : 'none',
                      cursor: 'pointer',
                      background: selectedId === row.id ? 'var(--row-selected, rgba(59,130,246,0.18))' : undefined,
                    }}
                    onClick={() => setSelectedId(selectedId === row.id ? null : row.id)}
                  >
                    <td className="text-center">
                      {row.id}
                      {row.is_cancelled ? <span style={{ marginLeft: 4, padding: '1px 4px', background: '#ef4444', color: '#fff', borderRadius: 3, fontSize: 9, fontWeight: 800 }}>C</span> : null}
                    </td>
                    <td className="text-center">{row.date || '—'}</td>
                    <td className="text-center">{row.time ? String(row.time).slice(0, 5) : '—'}</td>
                    <td className="text-center">{row.movement_type === 'IN' ? <INBadge /> : <OUTBadge />}</td>
                    <td style={{ fontWeight: 700, color: 'var(--corp-ops)' }}>{row.grn_number}</td>
                    <td>{row.invoice_number || '—'}</td>
                    <td>{row.production_at || '—'}</td>
                    <td>{row.vendor_name || '—'}</td>
                    <td>{row.po_number || 'N/A'}</td>
                    <td style={{ fontWeight: 700, color: 'var(--corp-ops)' }}>{row.item_name}</td>
                    <td className="text-center">{row.hsn_code || '—'}</td>
                    <td className="text-center">{row.unit_name}</td>
                    <td className="text-right" style={{ fontWeight: 700 }}>{fixed(row.quantity)}</td>
                    <td className="text-right">{fixed(row.rate)}</td>
                    <td className="text-right">{fixed(row.amount)}</td>
                    <td className="text-right">{fixed(row.tax_amount)}</td>
                    <td className="text-right" style={{ fontWeight: 800, color: 'var(--corp-ops)' }}>{fixed(row.total_amount || row.amount)}</td>
                    <td className="text-right">{fixed(row.opening_stock)}</td>
                    <td className="text-right" style={{ fontWeight: 700 }}>{fixed(row.available_stock)}</td>
                    <td className="text-right">{fixed(row.minimum_level)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* QUICK ADD ITEM MODAL */}
      {showQuickAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <form className="card" style={{ width: 420, display: 'flex', flexDirection: 'column', gap: 14 }} onSubmit={handleQuickAdd}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: 800, textTransform: 'uppercase', color: 'var(--corp-ops)' }}>
                Add New Item to Store Master
              </h3>
              <button type="button" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }} onClick={() => setShowQuickAdd(false)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Item Name *</label>
              <input className="form-control" style={inputStyle} value={newItem.itemName} onChange={(e) => setNewItem((c) => ({ ...c, itemName: e.target.value }))} required placeholder="Enter item name" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Unit Name *</label>
              <input className="form-control" style={inputStyle} value={newItem.unitName} onChange={(e) => setNewItem((c) => ({ ...c, unitName: e.target.value }))} required placeholder="e.g. KG, BOX, LTR, PCS" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={labelStyle}>Minimum Stock Level</label>
              <input type="number" min="0" step="0.01" className="form-control" style={inputStyle} value={newItem.minimumLevel} onChange={(e) => setNewItem((c) => ({ ...c, minimumLevel: number(e.target.value) }))} />
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" className="btn btn-clear" onClick={() => setShowQuickAdd(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>Save Item</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// Helpers
function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

const labelStyle = { fontSize: 9, fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' };
const inputStyle = { padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11, fontWeight: 700, height: 32, backgroundColor: 'var(--card-bg)', color: 'var(--text-main)', width: '100%', outline: 'none' };
