import React, { useEffect, useState } from 'react';
import { Boxes, Pencil, Plus, Printer } from 'lucide-react';

const emptyForm = { itemName: '', unitName: '', minimumLevel: '' };

export default function GeneralStoreItems() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const selectedItem = items.find((item) => item.id === selectedId) || null;

  const loadItems = async ({ keepForm = false } = {}) => {
    setLoading(true);
    try {
      const response = await fetch('/general_stock/items?format=json', { credentials: 'include' });
      if (!response.ok) throw new Error(`Unable to load item master (${response.status})`);
      const data = await response.json();
      const rows = data.items || [];
      setItems(rows);
      if (!keepForm && rows.length === 0) setShowForm(true);
    } catch (error) {
      setMessage({ type: 'error', text: error.message || 'Unable to load General Store Item Master.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems();
  }, []);

  const clearForm = () => {
    setForm(emptyForm);
    setEditing(false);
    setShowForm(false);
  };

  const openAdd = () => {
    setSelectedId(null);
    setEditing(false);
    setForm(emptyForm);
    setMessage(null);
    setShowForm(true);
  };

  const openEdit = () => {
    if (!selectedItem) return;
    setEditing(true);
    setForm({
      itemName: selectedItem.item_name,
      unitName: selectedItem.unit_name,
      minimumLevel: String(Number(selectedItem.minimum_level || 0)),
    });
    setShowForm(true);
  };

  const saveItem = async (event) => {
    event.preventDefault();
    const itemName = form.itemName.trim();
    const unitName = form.unitName.trim();
    const minimumLevel = Number(form.minimumLevel);

    if (!itemName || !unitName || Number.isNaN(minimumLevel) || minimumLevel < 0) {
      setMessage({ type: 'error', text: 'Item Name, Unit Name and valid Minimum Stock Level are required.' });
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/general_stock/items/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'include',
        body: new URLSearchParams({
          item_name: itemName,
          unit_name: unitName,
          minimum_level: String(minimumLevel),
        }),
      });
      if (!response.ok) {
        let detail = 'Failed to save item configuration.';
        try {
          const data = await response.json();
          detail = data.message || data.detail || data.error || detail;
        } catch (_) {}
        throw new Error(detail);
      }

      setMessage({
        type: 'success',
        text: editing ? 'Item configuration updated successfully.' : 'Item saved successfully.',
      });
      clearForm();
      setSelectedId(null);
      await loadItems({ keepForm: true });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSaving(false);
    }
  };

  const printSelected = () => {
    if (!selectedItem) return;
    const printWindow = window.open('', '_blank', 'width=720,height=560');
    if (!printWindow) return;
    printWindow.document.write(`
      <html><head><title>General Store Item</title>
      <style>body{font-family:Arial,sans-serif;padding:28px;color:#172033}h2{margin:0 0 8px}table{border-collapse:collapse;width:100%;margin-top:18px}th,td{border:1px solid #cbd5e1;padding:10px;text-align:left}th{background:#f1f5f9}</style>
      </head><body><h2>General Store Item Master</h2><p>Item configuration profile</p>
      <table><tr><th>Item Name</th><th>Unit Name</th><th>Minimum Stock Level</th></tr>
      <tr><td>${selectedItem.item_name}</td><td>${selectedItem.unit_name}</td><td>${Number(selectedItem.minimum_level || 0).toFixed(2)}</td></tr></table>
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  if (loading && items.length === 0) {
    return (
      <div className="gs-items-page gs-items-loading">
        <div className="gs-items-skeleton header" />
        <div className="gs-items-skeleton form" />
        <div className="gs-items-skeleton table" />
        <PageStyles />
      </div>
    );
  }

  return (
    <div className="gs-items-page">
      <div className="gs-items-title">
        <h2><Boxes size={20} /> General Store Item Master</h2>
      </div>

      {message && (
        <div className={`gs-items-message ${message.type}`}>
          <span>{message.type === 'success' ? '✓' : '⚠'} {message.text}</span>
          <button type="button" onClick={() => setMessage(null)}>×</button>
        </div>
      )}

      {showForm && (
        <form className="gs-items-form" onSubmit={saveItem}>
          <div className="gs-items-form-title">Item Configurations</div>
          <div className="gs-items-form-grid">
            <label>
              <span>Item Name</span>
              <input
                className="form-control"
                value={form.itemName}
                onChange={(event) => setForm((current) => ({ ...current, itemName: event.target.value }))}
                placeholder="Enter Item Name"
                readOnly={editing}
                required
              />
            </label>
            <label>
              <span>Unit Name</span>
              <input
                className="form-control"
                value={form.unitName}
                onChange={(event) => setForm((current) => ({ ...current, unitName: event.target.value }))}
                placeholder="KG / Liters / Box"
                readOnly={editing}
                required
              />
            </label>
            <label>
              <span>Minimum Stock Level</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="form-control"
                value={form.minimumLevel}
                onChange={(event) => setForm((current) => ({ ...current, minimumLevel: event.target.value }))}
                placeholder="0.00"
                required
              />
            </label>
          </div>
          <div className="gs-items-form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Update Item' : 'Save'}
            </button>
            <button type="button" className="btn btn-clear" onClick={clearForm}>Cancel</button>
          </div>
        </form>
      )}

      <div className="gs-items-toolbar">
        <h3>Registered Items List</h3>
        <div className="gs-items-actions">
          <button type="button" className="btn btn-primary" onClick={openAdd}><Plus size={13} /> Add Item</button>
          {selectedItem && (
            <>
              <button type="button" className="btn btn-clear" onClick={openEdit}><Pencil size={13} /> Edit</button>
              <button type="button" className="btn btn-clear" onClick={printSelected}><Printer size={13} /> Print</button>
            </>
          )}
          <button type="button" className="btn btn-clear" onClick={() => { window.location.href = '/criteria/setup/next'; }}>Next Step</button>
        </div>
      </div>

      <div className="gs-items-mobile-list">
        {items.map((item) => (
          <button
            type="button"
            key={item.id}
            className={`gs-items-card ${selectedId === item.id ? 'selected' : ''}`}
            onClick={() => setSelectedId(item.id)}
          >
            <span><small>Item Profile</small><strong>{item.item_name}</strong></span>
            <span><small>Measurement Unit</small><strong>{item.unit_name}</strong></span>
            <span><small>Minimum Level Alert</small><strong>{Number(item.minimum_level || 0).toFixed(2)}</strong></span>
          </button>
        ))}
      </div>

      <div className="gs-items-table-wrap">
        <table className="bknr-table gs-items-table">
          <thead><tr><th>Item Name</th><th>Unit Name</th><th>Minimum Stock Level</th></tr></thead>
          <tbody>
            {items.length === 0 ? (
              <tr><td colSpan="3" className="gs-items-empty">No General Store items registered.</td></tr>
            ) : items.map((item) => (
              <tr key={item.id} className={selectedId === item.id ? 'selected' : ''} onClick={() => setSelectedId(item.id)}>
                <td>{item.item_name}</td>
                <td>{item.unit_name}</td>
                <td>{Number(item.minimum_level || 0).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <PageStyles />
    </div>
  );
}

function PageStyles() {
  return <style>{`
    .gs-items-page{display:flex;flex:1;min-height:0;flex-direction:column;gap:10px;padding:10px 12px 28px;overflow:auto;color:var(--text-primary)}
    .gs-items-title h2{display:flex;align-items:center;gap:8px;margin:0;color:var(--corp-master);font-size:17px}
    .gs-items-message{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:7px;font-size:12px;font-weight:750}.gs-items-message.success{background:#dcfce7;color:#166534}.gs-items-message.error{background:#fee2e2;color:#991b1b}.gs-items-message button{border:0;background:none;color:inherit;font-size:17px;cursor:pointer}
    .gs-items-form{padding:11px;border:1px solid var(--border);border-radius:9px;background:var(--card-bg)}.gs-items-form-title{padding-bottom:6px;border-bottom:1px dashed var(--border);color:var(--corp-master);font-size:10px;font-weight:850;text-transform:uppercase}
    .gs-items-form-grid{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:9px;margin-top:9px}.gs-items-form-grid label{display:flex;flex-direction:column;gap:5px}.gs-items-form-grid label span{font-size:10px;font-weight:750;color:var(--text-secondary);text-transform:uppercase}.gs-items-form-grid input[readonly]{background:var(--input-bg-disabled,var(--input-bg));font-weight:700}
    .gs-items-form-actions,.gs-items-actions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.gs-items-form-actions{margin-top:11px}.gs-items-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px}.gs-items-toolbar h3{margin:0;color:var(--corp-master);font-size:12px;text-transform:uppercase}
    .gs-items-table-wrap{overflow:auto;border:1px solid var(--border);border-radius:8px;background:var(--card-bg)}.gs-items-table{width:100%;min-width:560px}.gs-items-table th,.gs-items-table td{padding:9px 8px;font-size:11px;text-align:center}.gs-items-table td:first-child{text-align:left;font-weight:700;color:var(--corp-master)}.gs-items-table tbody tr{cursor:pointer}.gs-items-table tbody tr.selected{background:color-mix(in srgb,var(--corp-master) 13%,transparent);box-shadow:inset 3px 0 var(--corp-master)}.gs-items-empty{text-align:center!important;padding:28px!important;color:var(--text-secondary)!important}
    .gs-items-mobile-list{display:none}.gs-items-card{width:100%;padding:11px;border:1px solid var(--border);border-radius:8px;background:var(--card-bg);color:var(--text-primary);text-align:left}.gs-items-card.selected{border-color:var(--corp-master);box-shadow:inset 3px 0 var(--corp-master)}.gs-items-card span{display:flex;justify-content:space-between;gap:12px;padding:4px 0}.gs-items-card small{color:var(--text-secondary);text-transform:uppercase}.gs-items-card strong:last-child{color:var(--corp-master)}
    .gs-items-skeleton{position:relative;overflow:hidden;border:1px solid var(--border);border-radius:9px;background:var(--card-bg)}.gs-items-skeleton.header{height:42px}.gs-items-skeleton.form{height:135px}.gs-items-skeleton.table{height:250px}.gs-items-skeleton:after{content:'';position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,rgba(148,163,184,.18),transparent);animation:gsItemShimmer 1.1s infinite}@keyframes gsItemShimmer{to{transform:translateX(100%)}}
    @media(max-width:700px){.gs-items-page{padding:8px}.gs-items-title h2{font-size:15px}.gs-items-form-grid{grid-template-columns:1fr}.gs-items-toolbar{align-items:flex-start;flex-direction:column}.gs-items-actions{width:100%;overflow-x:auto;flex-wrap:nowrap;padding-bottom:3px}.gs-items-actions .btn{flex:0 0 auto}.gs-items-table-wrap{display:none}.gs-items-mobile-list{display:flex;flex-direction:column;gap:7px}}
  `}</style>;
}
