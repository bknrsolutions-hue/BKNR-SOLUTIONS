import React, { useState, useEffect, useRef } from 'react';
import { Snowflake, Plus, Ban, RefreshCw } from 'lucide-react';

export default function ColdStorageHolding() {
  const initialFetchStarted = useRef(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [entries, setEntries] = useState([]);

  // Masters
  const [storageMasters, setStorageMasters] = useState([]);
  const [prodForList, setProdForList] = useState([]);
  const [brands, setBrands] = useState([]);
  const [species, setSpecies] = useState([]);
  const [glazes, setGlazes] = useState([]);
  const [varieties, setVarieties] = useState([]);
  const [grades, setGrades] = useState([]);
  const [freezers, setFreezers] = useState([]);
  const [packingStyles, setPackingStyles] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [batches, setBatches] = useState([]);

  // Form Fields
  const [coldStorageName, setColdStorageName] = useState('');
  const [address, setAddress] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [cargoMovementType, setCargoMovementType] = useState('IN');
  const [specie, setSpecie] = useState('');
  const [variety, setVariety] = useState('');
  const [grade, setGrade] = useState('');
  const [brand, setBrand] = useState('');
  const [packingStyle, setPackingStyle] = useState('');
  const [noOfMc, setNoOfMc] = useState(0);
  const [loose, setLoose] = useState(0);
  const [quantity, setQuantity] = useState(0);
  const [freezer, setFreezer] = useState('');
  const [rentStartDate, setRentStartDate] = useState('');
  const [storageRatePerMc, setStorageRatePerMc] = useState(0);
  const [glaze, setGlaze] = useState('');
  const [purpose, setPurpose] = useState('Storing');
  const [productionFor, setProductionFor] = useState('');
  const [poNumber, setPoNumber] = useState('N/A');
  const [remarks, setRemarks] = useState('');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch('/cold_storage_holding?format=json', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) throw new Error(`Cold storage data request failed (HTTP ${res.status})`);
      if (!contentType.includes('application/json')) {
        throw new Error('Cold storage server returned HTML instead of data');
      }
      const d = await res.json();
      setEntries(d.current_holdings || []);
      setStorageMasters(d.storage_masters || []);
      setProdForList(d.production_for_list || []);
      setBrands(d.brands || []);
      setSpecies(d.species || []);
      setGlazes(d.glazes || []);
      setVarieties(d.varieties || []);
      setGrades(d.grades || []);
      setFreezers(d.freezers || []);
      setPackingStyles(d.packing_styles || []);
      setPendingOrders(d.pending_orders || []);
      if ((d.current_holdings || []).length === 0) setShowForm(true);
    } catch (e) {
      console.error(e);
      setMsg(e.message || 'Unable to load cold storage data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialFetchStarted.current) return;
    initialFetchStarted.current = true;
    fetchData();
  }, []);

  // Fetch batches when productionFor changes
  useEffect(() => {
    if (!productionFor) { setBatches([]); return; }
    fetch(`/get_storing_batches?production_for_val=${encodeURIComponent(productionFor)}&purpose_val=${encodeURIComponent(purpose)}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setBatches(d.batches || []));
  }, [productionFor, purpose]);

  // Sync address when coldStorageName changes
  useEffect(() => {
    const matched = storageMasters.find(s => s.cold_storage_name === coldStorageName);
    if (matched) {
      setAddress(matched.address || '');
      setStorageRatePerMc(matched.rate_per_mc || 0);
    } else {
      setAddress('');
      setStorageRatePerMc(0);
    }
  }, [coldStorageName, storageMasters]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const fd = new URLSearchParams();
    fd.append('cold_storage_name', coldStorageName);
    fd.append('address', address);
    fd.append('batch_number', batchNumber);
    fd.append('cargo_movement_type', cargoMovementType);
    fd.append('species', specie);
    fd.append('variety', variety);
    fd.append('grade', grade);
    fd.append('brand', brand);
    fd.append('packing_style', packingStyle);
    fd.append('no_of_mc', noOfMc);
    fd.append('loose', loose);
    fd.append('quantity', quantity);
    fd.append('freezer', freezer);
    fd.append('rent_start_date', rentStartDate);
    fd.append('storage_rate_per_mc', storageRatePerMc);
    fd.append('glaze', glaze);
    fd.append('purpose', purpose);
    fd.append('production_for', productionFor);
    fd.append('po_number', poNumber);
    fd.append('remarks', remarks);

    try {
      const res = await fetch('/cold_storage_holding/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
        body: fd,
      });
      if (res.ok) {
        setMsg('✅ Cold Storage Holding saved successfully!');
        setShowForm(false);
        await fetchData();
      } else {
        const errData = await res.json();
        setMsg(`❌ Error: ${errData.error || 'Failed to save holding'}`);
      }
    } catch (err) {
      setMsg('❌ Connection error');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this holding entry?')) return;
    setLoading(true);
    try {
      await fetch(`/cold_storage_holding/delete/${id}`, {
        method: 'POST',
        credentials: 'include',
        redirect: 'manual',
      });
      setMsg('Entry cancelled');
      await fetchData();
    } catch (err) {
      setMsg('❌ Error deleting holding');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto', gap: 16, padding: '16px 16px 80px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <h2 style={{ color: 'var(--corp-ops)', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <Snowflake size={22} /> Cold Storage Holding Entry
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-clear" onClick={fetchData} disabled={loading}>
            <RefreshCw size={13} className={loading ? 'spin-animation' : ''} /> Refresh
          </button>
          {!showForm && (
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              <Plus size={13} /> Record Holding
            </button>
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
          <h3 style={{ fontSize: 13, fontWeight: 800, marginBottom: 14, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            NEW COLD STORAGE TRANSACTION
          </h3>
          <div className="form-grid">
            <div className="form-group">
              <label>Cold Storage Facility *</label>
              <select className="form-control" value={coldStorageName} onChange={e => setColdStorageName(e.target.value)} required>
                <option value="">— Select Storage —</option>
                {storageMasters.map(s => <option key={s.id} value={s.cold_storage_name}>{s.cold_storage_name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Address</label>
              <input type="text" className="form-control" value={address} readOnly style={{ background: 'var(--input-bg-disabled)' }} />
            </div>
            <div className="form-group">
              <label>Production For (Client) *</label>
              <select className="form-control" value={productionFor} onChange={e => setProductionFor(e.target.value)} required>
                <option value="">— Select Client —</option>
                {prodForList.map(p => <option key={p.id} value={p.production_for}>{p.production_for}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Purpose</label>
              <select className="form-control" value={purpose} onChange={e => setPurpose(e.target.value)}>
                <option value="Storing">Storing</option>
                <option value="Reprocess">Reprocess</option>
              </select>
            </div>
            <div className="form-group">
              <label>Batch Number *</label>
              <select className="form-control" value={batchNumber} onChange={e => setBatchNumber(e.target.value)} required>
                <option value="">— Select Batch —</option>
                {batches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Movement Type *</label>
              <select className="form-control" value={cargoMovementType} onChange={e => setCargoMovementType(e.target.value)} required>
                <option value="IN">Stock IN</option>
                <option value="OUT">Stock OUT (Dispatch)</option>
              </select>
            </div>
            <Sel label="Species *" value={specie} onChange={setSpecie} options={species} required />
            <Sel label="Variety *" value={variety} onChange={setVariety} options={varieties} required />
            <Sel label="Grade *" value={grade} onChange={setGrade} options={grades} required />
            <Sel label="Brand *" value={brand} onChange={setBrand} options={brands} required />
            <Sel label="Packing Style *" value={packingStyle} onChange={setPackingStyle} options={packingStyles.map(p => p.packing_style)} required />
            <Num label="No of MC" value={noOfMc} onChange={setNoOfMc} />
            <Num label="Loose Slabs" value={loose} onChange={setLoose} />
            <Num label="Quantity (Kg) *" value={quantity} onChange={setQuantity} required />
            <Sel label="Freezer" value={freezer} onChange={setFreezer} options={freezers} />
            <div className="form-group">
              <label>Rent Start Date</label>
              <input type="date" className="form-control" value={rentStartDate} onChange={e => setRentStartDate(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Rate / MC (₹)</label>
              <input type="number" step="0.01" className="form-control" value={storageRatePerMc} onChange={e => setStorageRatePerMc(parseFloat(e.target.value) || 0)} />
            </div>
            <Sel label="Glaze" value={glaze} onChange={setGlaze} options={glazes} />
            <Sel label="PO Number" value={poNumber} onChange={setPoNumber} options={pendingOrders} />
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label>Remarks</label>
              <input type="text" className="form-control" value={remarks} onChange={e => setRemarks(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>Save Entry</button>
            <button type="button" className="btn btn-clear" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      {/* Table */}
      <div style={{ flexShrink: 0 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Recent Storing logs & holdings
        </h3>
        <div className="table-responsive">
          <table className="bknr-table" style={{ minWidth: 1400 }}>
            <thead><tr>
              <th>ID</th><th>Cold Storage</th><th>Batch</th><th>Move</th><th>Species</th><th>Variety</th>
              <th>Grade</th><th>Brand</th><th>Pack Style</th><th>MC</th><th>Loose</th>
              <th>Qty (Kg)</th><th>Rate/MC</th><th>Rent Start</th><th>Status</th><th>Action</th>
            </tr></thead>
            <tbody>
              {entries.map(r => (
                <tr key={r.id}>
                  <td className="text-center">{r.id}</td>
                  <td>{r.cold_storage_name}</td>
                  <td style={{ fontWeight: 700, color: 'var(--corp-ops)' }}>{r.batch_number}</td>
                  <td className="text-center">
                    <span style={{ background: r.cargo_movement_type === 'IN' ? '#10b981' : '#ef4444', color: '#fff', borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 800 }}>
                      {r.cargo_movement_type}
                    </span>
                  </td>
                  <td>{r.species}</td><td>{r.variety}</td><td>{r.grade}</td><td>{r.brand}</td>
                  <td>{r.packing_style}</td>
                  <td className="text-right">{r.no_of_mc}</td>
                  <td className="text-right">{r.loose}</td>
                  <td className="text-right">{Number(r.quantity || 0).toFixed(2)}</td>
                  <td className="text-right">₹{Number(r.storage_rate_per_mc || 0).toFixed(2)}</td>
                  <td className="text-center">{r.rent_start_date ? String(r.rent_start_date).substring(0, 10) : ''}</td>
                  <td className="text-center">{r.status}</td>
                  <td className="text-center">
                    <button style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }} title="Cancel entry" aria-label="Cancel holding entry"
                      onClick={() => handleDelete(r.id)}>
                      <Ban size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Sel({ label, value, onChange, options = [], required = false }) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <select className="form-control" value={value} onChange={e => onChange(e.target.value)} required={required}>
        <option value="">— Select —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Num({ label, value, onChange, required = false }) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <input type="number" className="form-control" value={value} min={0}
        onChange={e => onChange(parseFloat(e.target.value) || 0)} required={required} />
    </div>
  );
}
