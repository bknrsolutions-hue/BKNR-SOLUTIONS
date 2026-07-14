import React, { useState, useEffect } from 'react';
import { Store, Plus, Trash2, RefreshCw } from 'lucide-react';

export default function GeneralStoreEntry() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [mode, setMode] = useState('IN'); // IN or OUT
  const [showForm, setShowForm] = useState(false);
  const [entries, setEntries] = useState([]);

  // Masters
  const [grnList, setGrnList] = useState([]);
  const [itemsList, setItemsList] = useState([]);
  const [unitsList, setUnitsList] = useState([]);
  const [vendorsList, setVendorsList] = useState([]);
  const [hsnList, setHsnList] = useState([]);
  const [locationsList, setLocationsList] = useState([]);
  const [postingLedgersList, setPostingLedgersList] = useState([]);
  const [poList, setPoList] = useState([]);

  // Form Fields
  const [id, setId] = useState('');
  const [grnNumber, setGrnNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [unitId, setUnitId] = useState(0);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [vendorId, setVendorId] = useState(0);
  const [accountingLedgerId, setAccountingLedgerId] = useState(0);
  const [poNumber, setPoNumber] = useState('N/A');
  const [hsnCode, setHsnCode] = useState('');
  const [gstPercent, setGstPercent] = useState(0.0);
  const [itemName, setItemName] = useState('');
  const [unitName, setUnitName] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [rate, setRate] = useState(0.0);
  const [minimumLevel, setMinimumLevel] = useState(0.0);
  const [availableStockMsg, setAvailableStockMsg] = useState('');

  // New Item Quick Add
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('');
  const [newItemMinLevel, setNewItemMinLevel] = useState(0.0);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/general_stock/entry?format=json', { credentials: 'include' });
      if (!res.ok) return;
      const d = await res.json();
      setEntries(d.today_data || []);
      setGrnList(d.grn_list || []);
      setItemsList(d.items || []);
      setUnitsList(d.units || []);
      setVendorsList(d.vendors || []);
      setHsnList(d.hsn_list || []);
      setLocationsList(d.locations || []);
      setPostingLedgersList(d.posting_ledgers || []);
      setPoList(d.po_list || []);
      if ((d.today_data || []).length === 0) setShowForm(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Autofill details when Item is selected
  useEffect(() => {
    if (!itemName) {
      setUnitName('');
      setMinimumLevel(0.0);
      setAvailableStockMsg('');
      return;
    }
    fetch(`/general_stock/api/item_details?item_name=${encodeURIComponent(itemName)}&unit_id=${unitId}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        setUnitName(d.unit_name || '');
        setMinimumLevel(d.minimum_level || 0);
        setAvailableStockMsg(`Opening Stock Balance: ${d.opening_stock || 0} ${d.unit_name || ''}`);
      });
  }, [itemName, unitId]);

  // For Stock OUT: Load GRNs and rates
  useEffect(() => {
    if (mode === 'OUT' && itemName) {
      fetch(`/general_stock/api/get_item_grns?item_name=${encodeURIComponent(itemName)}&unit_id=${unitId}`, { credentials: 'include' })
        .then(r => r.json())
        .then(d => setGrnList(d.grns || []));
    }
  }, [itemName, unitId, mode]);

  // When GRN changes in Stock OUT, fetch rate & available qty
  useEffect(() => {
    if (mode === 'OUT' && itemName && grnNumber) {
      fetch(`/general_stock/api/grn_rate?item_name=${encodeURIComponent(itemName)}&grn_number=${encodeURIComponent(grnNumber)}&unit_id=${unitId}`, { credentials: 'include' })
        .then(r => r.json())
        .then(d => {
          if (d.success) {
            setRate(d.rate || 0);
            setAvailableStockMsg(`GRN Available Stock: ${d.available_qty || 0} ${unitName}`);
          }
        });
    }
  }, [grnNumber, itemName, unitId, mode]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const fd = new URLSearchParams();
    if (id) fd.append('id', id);
    fd.append('grn_number', grnNumber);
    fd.append('invoice_date', invoiceDate);
    fd.append('unit_id', unitId);
    fd.append('invoice_number', invoiceNumber);
    fd.append('vendor_id', vendorId);
    fd.append('accounting_ledger_id', accountingLedgerId);
    fd.append('po_number', poNumber);
    fd.append('hsn_code', hsnCode);
    fd.append('gst_percent', gstPercent);
    fd.append('item_name', itemName);
    fd.append('unit_name', unitName);
    fd.append('movement_type', mode);
    fd.append('quantity', quantity);
    fd.append('rate', rate);
    fd.append('minimum_level', minimumLevel);

    try {
      const res = await fetch('/general_stock/entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'include',
        body: fd,
        redirect: 'manual',
      });
      setMsg('✅ General Store entry saved successfully!');
      setShowForm(false);
      setId('');
      setGrnNumber('');
      setInvoiceNumber('');
      setItemName('');
      setQuantity(0);
      setRate(0);
      await fetchData();
    } catch (err) {
      setMsg('❌ Error saving entry');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    setLoading(true);
    const fd = new URLSearchParams();
    fd.append('item_name', newItemName);
    fd.append('unit_name', newItemUnit);
    fd.append('minimum_level', newItemMinLevel);

    try {
      const res = await fetch('/general_stock/items/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'include',
        body: fd,
      });
      if (res.ok) {
        setMsg('✅ Item added to master list!');
        setShowQuickAdd(false);
        setNewItemName('');
        setNewItemUnit('');
        await fetchData();
      }
    } catch (err) {
      setMsg('❌ Failed to add item');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (idVal) => {
    if (!window.confirm('Cancel this general store entry permanently?')) return;
    setLoading(true);
    try {
      const res = await fetch(`/general_stock/entry/delete/${idVal}`, {
        method: 'POST',
        credentials: 'include',
      });
      if (res.ok) {
        setMsg('✅ Entry cancelled successfully');
        await fetchData();
      }
    } catch (err) {
      setMsg('❌ Cancellation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto', gap: 16, padding: '16px 16px 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <h2 style={{ color: 'var(--corp-ops)', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <Store size={22} /> General Store stock movement
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-clear" onClick={fetchData} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin-animation' : ''} /> Refresh
          </button>
          {!showForm && (
            <>
              <button className="btn btn-primary" style={{ background: '#10b981', borderColor: '#10b981' }}
                onClick={() => { setMode('IN'); setShowForm(true); }}>
                + Stock IN (Purchase)
              </button>
              <button className="btn btn-primary" style={{ background: '#ef4444', borderColor: '#ef4444' }}
                onClick={() => { setMode('OUT'); setShowForm(true); }}>
                - Stock OUT (Issue)
              </button>
            </>
          )}
        </div>
      </div>

      {msg && (
        <div style={{ padding: '10px 16px', borderRadius: 8, background: msg.startsWith('✅') ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: msg.startsWith('✅') ? '#10b981' : '#ef4444', fontSize: 13, fontWeight: 700 }}>
          {msg}
          <button style={{ float: 'right', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }} onClick={() => setMsg('')}>✕</button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, margin: 0, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {mode === 'IN' ? 'GRN PURCHASE / STOCK IN' : 'CONSUMPTION ISSUE / STOCK OUT'}
            </h3>
            <button type="button" className="btn btn-secondary" style={{ height: 28, padding: '2px 8px', fontSize: 11 }}
              onClick={() => setShowQuickAdd(true)}>
              + Quick Add Master Item
            </button>
          </div>

          <div className="form-grid">
            <div className="form-group">
              <label>Location Unit *</label>
              <select className="form-control" value={unitId} onChange={e => setUnitId(parseInt(e.target.value) || 0)} required>
                <option value="">— Select Location —</option>
                {locationsList.map(l => <option key={l.id} value={l.id}>{l.production_at}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Item Name *</label>
              <select className="form-control" value={itemName} onChange={e => setItemName(e.target.value)} required>
                <option value="">— Select Item —</option>
                {itemsList.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Unit Name</label>
              <input type="text" className="form-control" value={unitName} readOnly style={{ background: 'var(--input-bg-disabled)' }} />
            </div>

            {mode === 'IN' ? (
              <>
                <div className="form-group">
                  <label>GRN / Bill Number *</label>
                  <input type="text" className="form-control" value={grnNumber} onChange={e => setGrnNumber(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Invoice Number</label>
                  <input type="text" className="form-control" value={invoiceNumber} onChange={e => setInvoiceNumber(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Invoice / GRN Date *</label>
                  <input type="date" className="form-control" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Vendor *</label>
                  <select className="form-control" value={vendorId} onChange={e => setVendorId(parseInt(e.target.value) || 0)} required>
                    <option value="">— Select Vendor —</option>
                    {vendorsList.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Asset Ledger Posting *</label>
                  <select className="form-control" value={accountingLedgerId} onChange={e => setAccountingLedgerId(parseInt(e.target.value) || 0)} required>
                    <option value="">— Select Ledger —</option>
                    {postingLedgersList.map(p => <option key={p.id} value={p.id}>{p.ledger_name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>HSN Code</label>
                  <select className="form-control" value={hsnCode} onChange={e => setHsnCode(e.target.value)}>
                    <option value="">— Select HSN —</option>
                    {hsnList.map(h => <option key={h.id} value={h.hsn_code}>{h.hsn_code} ({h.description})</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>GST Percent (%)</label>
                  <input type="number" step="0.1" className="form-control" value={gstPercent} onChange={e => setGstPercent(parseFloat(e.target.value) || 0)} />
                </div>
                <div className="form-group">
                  <label>Quantity *</label>
                  <input type="number" step="0.01" className="form-control" value={quantity} onChange={e => setQuantity(parseFloat(e.target.value) || 0)} required />
                </div>
                <div className="form-group">
                  <label>Purchase Rate / Unit *</label>
                  <input type="number" step="0.0001" className="form-control" value={rate} onChange={e => setRate(parseFloat(e.target.value) || 0)} required />
                </div>
              </>
            ) : (
              <>
                <div className="form-group">
                  <label>Source GRN Batch *</label>
                  <select className="form-control" value={grnNumber} onChange={e => setGrnNumber(e.target.value)} required>
                    <option value="">— Select GRN —</option>
                    {grnList.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Issue Quantity *</label>
                  <input type="number" step="0.01" className="form-control" value={quantity} onChange={e => setQuantity(parseFloat(e.target.value) || 0)} required />
                </div>
                <div className="form-group">
                  <label>GRN Rate / Unit</label>
                  <input type="number" step="0.0001" className="form-control" value={rate} readOnly style={{ background: 'var(--input-bg-disabled)' }} />
                </div>
              </>
            )}

            <div className="form-group">
              <label>Re-Order Minimum Level</label>
              <input type="number" step="0.01" className="form-control" value={minimumLevel} onChange={e => setMinimumLevel(parseFloat(e.target.value) || 0)} />
            </div>
            <div className="form-group">
              <label>Link PO Reference</label>
              <select className="form-control" value={poNumber} onChange={e => setPoNumber(e.target.value)}>
                {poList.map(po => <option key={po} value={po}>{po}</option>)}
              </select>
            </div>
          </div>

          {availableStockMsg && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--corp-ops)', fontWeight: 700 }}>
              💡 {availableStockMsg}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {mode === 'IN' ? 'Post Purchase Bill' : 'Post Consumption Issue'}
            </button>
            <button type="button" className="btn btn-clear" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      {/* TODAY'S LOG TABLE */}
      <div style={{ flexShrink: 0 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Today's General Store Stock Entries
        </h3>
        <div className="table-responsive">
          <table className="bknr-table" style={{ minWidth: 1400 }}>
            <thead><tr>
              <th>ID</th><th>Time</th><th>Move</th><th>GRN/Bill</th><th>Item Name</th><th>Location</th>
              <th>Vendor</th><th className="text-right">Quantity</th><th>Unit</th><th className="text-right">Rate</th>
              <th className="text-right">Amount</th><th className="text-right">Total Amount</th><th>PO #</th><th>Posted Journal ID</th><th>Action</th>
            </tr></thead>
            <tbody>
              {entries.map(r => (
                <tr key={r.id} style={{ opacity: r.is_cancelled ? 0.5 : 1, textDecoration: r.is_cancelled ? 'line-through' : 'none' }}>
                  <td className="text-center">{r.id}</td>
                  <td className="text-center">{r.time ? String(r.time).substring(0, 5) : ''}</td>
                  <td className="text-center">
                    <span style={{ background: r.movement_type === 'IN' ? '#10b981' : '#ef4444', color: '#fff', borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 800 }}>
                      {r.movement_type}
                    </span>
                  </td>
                  <td>{r.grn_number}</td>
                  <td style={{ fontWeight: 700, color: 'var(--corp-ops)' }}>{r.item_name}</td>
                  <td>{r.production_at}</td>
                  <td>{r.vendor_name || '—'}</td>
                  <td className="text-right">{Number(r.quantity || 0).toFixed(2)}</td>
                  <td>{r.unit_name}</td>
                  <td className="text-right">₹{Number(r.rate || 0).toFixed(2)}</td>
                  <td className="text-right">₹{Number(r.amount || 0).toFixed(2)}</td>
                  <td className="text-right">₹{Number(r.total_amount || 0).toFixed(2)}</td>
                  <td>{r.po_number}</td>
                  <td className="text-center">{r.journal_id || '—'}</td>
                  <td className="text-center">
                    {!r.is_cancelled && (
                      <button style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
                        onClick={() => handleDelete(r.id)}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* QUICK ADD MODAL */}
      {showQuickAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <form onSubmit={handleQuickAdd} className="card" style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Add New Item to Store Master</h3>
            <div className="form-group">
              <label>Item Name *</label>
              <input type="text" className="form-control" value={newItemName} onChange={e => setNewItemName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Unit Name (e.g. Kg, Box, Pcs) *</label>
              <input type="text" className="form-control" value={newItemUnit} onChange={e => setNewItemUnit(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Min Level</label>
              <input type="number" step="0.01" className="form-control" value={newItemMinLevel} onChange={e => setNewItemMinLevel(parseFloat(e.target.value) || 0)} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" className="btn btn-clear" onClick={() => setShowQuickAdd(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Add Item</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
