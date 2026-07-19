import { Fragment, useState, useEffect } from 'react';
import { Clock, Plus, RefreshCw, Eye } from 'lucide-react';

export default function PendingOrders() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [activeRows, setActiveRows] = useState([]);
  const [completedRows, setCompletedRows] = useState([]);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showPoActions, setShowPoActions] = useState(false);
  const [selectedPo, setSelectedPo] = useState('');
  const [orderView, setOrderView] = useState('pending');

  // Dropdowns
  const [uniqueCompanies, setUniqueCompanies] = useState([]);
  const [productionLocations, setProductionLocations] = useState([]);
  const [buyers, setBuyers] = useState([]);
  const [agents, setAgents] = useState([]);
  const [brands, setBrands] = useState([]);
  const [countries, setCountries] = useState([]);
  const [species, setSpecies] = useState([]);
  const [varieties, setVarieties] = useState([]);
  const [grades, setGrades] = useState([]);
  const [glazes, setGlazes] = useState([]);
  const [freezers, setFreezers] = useState([]);
  const [packing, setPacking] = useState([]);

  // Form Fields (Single Header Fields)
  const [slNo, setSlNo] = useState(1);
  const [companyName, setCompanyName] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [buyer, setBuyer] = useState('');
  const [agent, setAgent] = useState('');
  const [country, setCountry] = useState('');
  const [shipmentDate, setShipmentDate] = useState('');
  const [productionAt, setProductionAt] = useState('');
  const [exchangeRate, setExchangeRate] = useState(83.5);

  // Form Fields (Dynamic Rows)
  const [items, setItems] = useState([
    { brand: '', packing_style: '', freezer: '', count_glaze: '', weight_glaze: '', species: '', variety: '', grade: '', no_of_pieces: '0', no_of_mc: 0, selling_price: 0 }
  ]);

  // Dispatch modal form
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [shippingBill, setShippingBill] = useState('');
  const [containerNo, setContainerNo] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/inventory/pending_orders?format=json', { credentials: 'include' });
      if (!res.ok) return;
      const d = await res.json();
      setActiveRows(d.active_rows || []);
      setCompletedRows(d.completed_rows || []);
      setSlNo(d.next_sl || 1);
      setUniqueCompanies(d.unique_companies || []);
      setProductionLocations(d.production_locations || []);
      setBuyers(d.buyers || []);
      setAgents(d.agents || []);
      setBrands(d.brands || []);
      setCountries(d.countries || []);
      setSpecies(d.species || []);
      setVarieties(d.varieties || []);
      setGrades(d.grades || []);
      setGlazes(d.glazes || []);
      setFreezers(d.freezers || []);
      setPacking(d.packing || []);
      if ((d.active_rows || []).length === 0) setShowForm(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void Promise.resolve().then(fetchData);
  }, []);

  const handleAddRow = () => {
    setItems([...items, { brand: '', packing_style: '', freezer: '', count_glaze: '', weight_glaze: '', species: '', variety: '', grade: '', no_of_pieces: '0', no_of_mc: 0, selling_price: 0 }]);
  };

  const handleRemoveRow = (idx) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const handleRowChange = (idx, field, value) => {
    setItems(items.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const fd = new URLSearchParams();
    fd.append('sl_no', slNo);
    fd.append('company_name', companyName);
    fd.append('po_number', poNumber);
    fd.append('buyer', buyer);
    fd.append('agent', agent);
    fd.append('country', country);
    fd.append('shipment_date', shipmentDate);
    fd.append('production_at', productionAt);
    fd.append('exchange_rate', exchangeRate);

    items.forEach(it => {
      fd.append('brand', it.brand);
      fd.append('packing_style', it.packing_style);
      fd.append('freezer', it.freezer);
      fd.append('count_glaze', it.count_glaze);
      fd.append('weight_glaze', it.weight_glaze);
      fd.append('species', it.species);
      fd.append('variety', it.variety);
      fd.append('grade', it.grade);
      fd.append('no_of_pieces', it.no_of_pieces);
      fd.append('no_of_mc', it.no_of_mc);
      fd.append('selling_price', it.selling_price);
    });

    try {
      const res = await fetch('/inventory/pending_orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'include',
        body: fd,
        redirect: 'manual',
      });
      if (!res.ok && res.status !== 0 && res.status !== 303) throw new Error('Unable to save pending order');
      setMsg('✅ Pending PO saved successfully!');
      setShowForm(false);
      setItems([{ brand: '', packing_style: '', freezer: '', count_glaze: '', weight_glaze: '', species: '', variety: '', grade: '', no_of_pieces: '0', no_of_mc: 0, selling_price: 0 }]);
      await fetchData();
    } catch {
      setMsg('❌ Error saving PO');
    } finally {
      setLoading(false);
    }
  };

  const handleMoveToSales = async (e) => {
    e.preventDefault();
    setLoading(true);
    const fd = new URLSearchParams();
    fd.append('po_number', selectedPo);
    fd.append('invoice_no', invoiceNo);
    fd.append('invoice_date', invoiceDate);
    fd.append('shipping_bill', shippingBill);
    fd.append('container_no', containerNo);

    try {
      const res = await fetch('/inventory/move_to_sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'include',
        body: fd,
        redirect: 'manual',
      });
      if (!res.ok && res.status !== 0 && res.status !== 303) throw new Error('Unable to move PO to dispatch');
      setMsg('✅ Dispatch details logged and moved to Sales & Journals!');
      setShowMoveModal(false);
      setInvoiceNo('');
      setInvoiceDate('');
      setShippingBill('');
      setContainerNo('');
      await fetchData();
    } catch {
      setMsg('❌ Failed to post dispatch details');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePo = async (poNum) => {
    if (!window.confirm(`Do you want to cancel PO ${poNum}?`)) return;
    setLoading(true);
    try {
      const response = await fetch(`/inventory/pending_orders/delete_po/${poNum}`, {
        method: 'POST',
        credentials: 'include',
        redirect: 'manual',
      });
      if (!response.ok && response.status !== 0 && response.status !== 303) throw new Error('Unable to cancel PO');
      setMsg('PO cancelled successfully.');
      setShowPoActions(false);
      await fetchData();
    } catch {
      setMsg('❌ Error cancelling PO');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (poNum, status) => {
    if (!window.confirm(`Change PO ${poNum} status to ${status.toUpperCase()}?`)) return;
    setLoading(true);
    try {
      const res = await fetch('/inventory/update_po_status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ po_number: poNum, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.message || 'Unable to update PO status');
      setMsg(`✅ PO ${poNum} status updated to ${status.toUpperCase()}`);
      await fetchData();
    } catch (err) {
      setMsg(`❌ ${err.message || 'Unable to update PO status'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pending-orders-exempt" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto', gap: 16, padding: '16px 16px 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <h2 style={{ color: 'var(--corp-ops)', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <Clock size={22} /> Sales Pending Orders Worksheet
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-clear" onClick={fetchData} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin-animation' : ''} /> Refresh
          </button>
          {!showForm && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={13} /> Log New Purchase Order (PO)
            </button>
          )}
        </div>
      </div>

      {msg && (
        <div style={{ padding: '10px 16px', borderRadius: 8, background: (msg.startsWith('✅') || msg === 'PO cancelled successfully.') ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)', color: (msg.startsWith('✅') || msg === 'PO cancelled successfully.') ? '#10b981' : '#ef4444', fontSize: 13, fontWeight: 700 }}>
          {msg}
          <button style={{ float: 'right', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }} onClick={() => setMsg('')}>✕</button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ flexShrink: 0 }}>
          <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: 14, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            RECORD NEW SALES BACKLOG ORDER
          </h3>
          <div className="form-grid" style={{ marginBottom: 16 }}>
            <div className="form-group">
              <label>Serial Number</label>
              <input type="number" className="form-control" value={slNo} readOnly style={{ background: 'var(--input-bg-disabled)' }} />
            </div>
            <Sel label="Company Name *" value={companyName} onChange={setCompanyName} options={uniqueCompanies} required />
            <div className="form-group">
              <label>PO Number *</label>
              <input type="text" className="form-control" value={poNumber} onChange={e => setPoNumber(e.target.value)} required />
            </div>
            <Sel label="Buyer Name *" value={buyer} onChange={setBuyer} options={buyers} required />
            <Sel label="Buyer Agent *" value={agent} onChange={setAgent} options={agents} required />
            <Sel label="Target Country *" value={country} onChange={setCountry} options={countries} required />
            <div className="form-group">
              <label>Est Shipment Date *</label>
              <input type="date" className="form-control" value={shipmentDate} onChange={e => setShipmentDate(e.target.value)} required />
            </div>
            <Sel label="Production At *" value={productionAt} onChange={setProductionAt} options={productionLocations} required />
            <div className="form-group">
              <label>Exchange Rate (₹/$) *</label>
              <input type="number" step="0.01" className="form-control" value={exchangeRate} onChange={e => setExchangeRate(parseFloat(e.target.value) || 0)} required />
            </div>
          </div>

          <h4 style={{ fontSize: 12, fontWeight: 700, margin: '12px 0 8px', color: 'var(--text-secondary)' }}>ORDER ITEM SPECIFICATIONS</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((it, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', borderBottom: '1px solid var(--border-light)', paddingBottom: 10 }}>
                <Sel label="Brand" value={it.brand} onChange={v => handleRowChange(idx, 'brand', v)} options={brands} required />
                <Sel label="Pack Style" value={it.packing_style} onChange={v => handleRowChange(idx, 'packing_style', v)} options={packing.map(p => p.packing_style)} required />
                <Sel label="Freezer" value={it.freezer} onChange={v => handleRowChange(idx, 'freezer', v)} options={freezers} required />
                <Sel label="Count Glaze" value={it.count_glaze} onChange={v => handleRowChange(idx, 'count_glaze', v)} options={glazes} required />
                <Sel label="Weight Glaze" value={it.weight_glaze} onChange={v => handleRowChange(idx, 'weight_glaze', v)} options={glazes} required />
                <Sel label="Species" value={it.species} onChange={v => handleRowChange(idx, 'species', v)} options={species} required />
                <Sel label="Variety" value={it.variety} onChange={v => handleRowChange(idx, 'variety', v)} options={varieties} required />
                <Sel label="Grade" value={it.grade} onChange={v => handleRowChange(idx, 'grade', v)} options={grades} required />
                <div className="form-group" style={{ minWidth: 80 }}>
                  <label>Pcs/Lb</label>
                  <input type="text" className="form-control" value={it.no_of_pieces} onChange={e => handleRowChange(idx, 'no_of_pieces', e.target.value)} />
                </div>
                <div className="form-group" style={{ minWidth: 80 }}>
                  <label>Order MC *</label>
                  <input type="number" className="form-control" value={it.no_of_mc} onChange={e => handleRowChange(idx, 'no_of_mc', parseInt(e.target.value) || 0)} required />
                </div>
                <div className="form-group" style={{ minWidth: 90 }}>
                  <label>Price/Kg ($) *</label>
                  <input type="number" step="0.01" className="form-control" value={it.selling_price} onChange={e => handleRowChange(idx, 'selling_price', parseFloat(e.target.value) || 0)} required />
                </div>
                {items.length > 1 && (
                  <button type="button" className="btn btn-clear" style={{ height: 36, padding: '0 8px', color: '#ef4444' }} onClick={() => handleRemoveRow(idx)}>✕</button>
                )}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 12, marginTop: 14 }}>
            <button type="button" className="btn btn-secondary" onClick={handleAddRow}>+ Add Item Specifications</button>
            <button type="submit" className="btn btn-primary">Save</button>
            <button type="button" className="btn btn-clear" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          type="button"
          className={`btn ${orderView === 'pending' ? 'btn-primary' : 'btn-clear'}`}
          onClick={() => setOrderView('pending')}
        >
          Pending Orders ({activeRows.length})
        </button>
        <button
          type="button"
          className={`btn ${orderView === 'completed' ? 'btn-primary' : 'btn-clear'}`}
          onClick={() => setOrderView('completed')}
        >
          Completed Dispatch ({completedRows.length})
        </button>
      </div>

      {/* ACTIVE PO LIST */}
      {orderView === 'pending' && <div>
        <h3 style={{ fontSize: 13, fontWeight: 800, margin: '10px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Active Pending Backlogs
        </h3>
        {activeRows.length === 0 ? (
          <div className="card text-center" style={{ padding: 20, color: 'var(--text-secondary)' }}>No active pending orders.</div>
        ) : (
          <div className="card" style={{ padding: 14 }}>
            <OrdersTable
              rows={activeRows}
              onStatusChange={handleStatusChange}
              onRowClick={row => { setSelectedPo(row.po_number); setShowPoActions(true); }}
            />
          </div>
        )}
      </div>}

      {/* COMPLETED PO LIST */}
      {orderView === 'completed' && <div>
        <h3 style={{ fontSize: 13, fontWeight: 800, margin: '10px 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Completed Dispatch
        </h3>
        {completedRows.length === 0 ? (
          <div className="card text-center" style={{ padding: 20, color: 'var(--text-secondary)' }}>No completed dispatch orders.</div>
        ) : (
          <div className="card" style={{ padding: 14 }}>
            <OrdersTable rows={completedRows} completed />
          </div>
        )}
      </div>}

      {/* PENDING PO ACTIONS */}
      {showPoActions && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9998 }} onClick={() => setShowPoActions(false)}>
          <div className="card" style={{ width: 380, display: 'flex', flexDirection: 'column', gap: 14 }} onClick={event => event.stopPropagation()}>
            <div>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>PO {selectedPo}</h3>
              <p style={{ margin: '5px 0 0', color: 'var(--text-secondary)', fontSize: 11 }}>Select an action for this purchase order.</p>
            </div>
            <button className="btn btn-primary" type="button" onClick={() => { setShowPoActions(false); setShowMoveModal(true); }}>
              <Eye size={13} /> Move to Dispatch &amp; Ledger
            </button>
            <button className="btn btn-clear" type="button" style={{ color: '#ef4444' }} onClick={() => handleDeletePo(selectedPo)}>
              Cancel PO
            </button>
            <button className="btn btn-clear" type="button" onClick={() => setShowPoActions(false)}>Close</button>
          </div>
        </div>
      )}

      {/* DISPATCH/SALES MODAL OVERLAY */}
      {showMoveModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <form onSubmit={handleMoveToSales} className="card" style={{ width: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Dispatch PO: {selectedPo} to Sales Ledger</h3>
            <div className="form-group">
              <label>Invoice Number *</label>
              <input type="text" className="form-control" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Invoice / Shipping Date *</label>
              <input type="date" className="form-control" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Shipping Bill #</label>
              <input type="text" className="form-control" value={shippingBill} onChange={e => setShippingBill(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Container Number</label>
              <input type="text" className="form-control" value={containerNo} onChange={e => setContainerNo(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" className="btn btn-clear" onClick={() => setShowMoveModal(false)}>Close</button>
              <button type="submit" className="btn btn-primary">Move & Post Voucher</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function OrdersTable({ rows, completed = false, onStatusChange, onRowClick }) {
  const groupedRows = rows.reduce((groups, row) => {
    const poNumber = row.po_number || 'NO-PO';
    if (!groups[poNumber]) groups[poNumber] = [];
    groups[poNumber].push(row);
    return groups;
  }, {});

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <table className="bknr-table" style={{ minWidth: 1900 }}>
        <thead>
          <tr>
            <th>Sl</th><th>Company</th><th>Location</th><th>PO Number</th><th>Buyer</th><th>Agent</th><th>Ship.Date</th>
            <th>Brand</th><th>Packing</th><th>Freezer</th><th>C.G</th><th>W.G</th><th>Species</th><th>Variety</th>
            <th>Grade</th><th>Pieces</th><th className="text-right">M.C Box</th><th className="text-right">Price</th>
            <th className="text-right">Exch Rate</th><th>{completed ? 'Status' : 'Workflow Architecture'}</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(groupedRows).map(([poNumber, poRows]) => {
            const totalMc = poRows.reduce((sum, row) => sum + Number(row.no_of_mc || 0), 0);
            const totalPrice = poRows.reduce((sum, row) => sum + Number(row.selling_price || 0), 0);
            const averageExchange = poRows.length
              ? poRows.reduce((sum, row) => sum + Number(row.exchange_rate || 0), 0) / poRows.length
              : 0;
            return (
              <Fragment key={poNumber}>
                {poRows.map((row, index) => (
                  <tr
                    key={row.id}
                    role={onRowClick ? 'button' : undefined}
                    tabIndex={onRowClick ? 0 : undefined}
                    onClick={() => onRowClick?.(row)}
                    onKeyDown={event => event.key === 'Enter' && onRowClick?.(row)}
                    style={{ cursor: onRowClick ? 'pointer' : 'default' }}
                  >
                    <td>{row.sl_no || index + 1}</td>
                    <td>{row.company_name || '—'}</td>
                    <td>{row.production_at || '—'}</td>
                    <td style={{ fontWeight: 800, color: completed ? 'var(--success)' : 'var(--accent)' }}>{row.po_number || '—'}</td>
                    <td>{row.buyer || '—'}</td>
                    <td>{row.agent_name || '—'}</td>
                    <td>{row.shipment_date || '—'}</td>
                    <td>{row.brand || '—'}</td>
                    <td>{row.packing_style || '—'}</td>
                    <td>{row.freezer || '—'}</td>
                    <td>{row.count_glaze || '—'}</td>
                    <td>{row.weight_glaze || '—'}</td>
                    <td>{row.species || '—'}</td>
                    <td>{row.variety || '—'}</td>
                    <td>{row.grade || '—'}</td>
                    <td>{row.no_of_pieces ?? 0}</td>
                    <td className="text-right" style={{ fontWeight: 800 }}>{Number(row.no_of_mc || 0).toLocaleString('en-IN')}</td>
                    <td className="text-right" style={{ fontWeight: 800, color: 'var(--success)' }}>${Number(row.selling_price || 0).toFixed(2)}</td>
                    <td className="text-right" style={{ fontWeight: 800, color: 'var(--accent)' }}>₹{Number(row.exchange_rate || 0).toFixed(2)}</td>
                    <td>
                      {completed ? (
                        <span className="status-badge" style={{ color: 'var(--success)', fontWeight: 800 }}>COMPLETED</span>
                      ) : (
                        <select
                          className="form-control"
                          style={{ minWidth: 120, height: 30, padding: '2px 7px', fontSize: 10, fontWeight: 800 }}
                          value={String(row.progress_steps || 'pending').toLowerCase()}
                          onClick={event => event.stopPropagation()}
                          onChange={event => onStatusChange?.(row.po_number, event.target.value)}
                        >
                          <option value="pending">PENDING</option>
                          <option value="processing">PROCESSING</option>
                          <option value="completed">COMPLETED</option>
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--table-header-bg)', borderTop: '2px solid var(--border-light)' }}>
                  <td colSpan="16" style={{ textAlign: 'right', fontWeight: 900 }}>PO {poNumber} SUBTOTAL · {poRows.length} LINE{poRows.length === 1 ? '' : 'S'}</td>
                  <td className="text-right" style={{ fontWeight: 900 }}>{totalMc.toLocaleString('en-IN')} MC</td>
                  <td className="text-right" style={{ fontWeight: 900, color: 'var(--success)' }}>${totalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="text-right" style={{ fontWeight: 900, color: 'var(--accent)' }}>₹{averageExchange.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td></td>
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Sel({ label, value, onChange, options = [], required = false }) {
  return (
    <div className="form-group" style={{ minWidth: 120 }}>
      <label>{label}</label>
      <select className="form-control" value={value} onChange={e => onChange(e.target.value)} required={required}>
        <option value="">— Select —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
