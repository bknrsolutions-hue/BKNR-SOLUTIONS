import React, { useState, useEffect } from 'react';
import { Boxes, Plus, Trash2, RefreshCw, ArrowDownToLine, ArrowUpFromLine } from 'lucide-react';

export default function StockEntry() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [mode, setMode] = useState('IN'); // IN or OUT
  const [showForm, setShowForm] = useState(false);
  const [tableData, setTableData] = useState([]);

  // Dropdowns
  const [batches, setBatches] = useState([]);
  const [brands, setBrands] = useState([]);
  const [species, setSpecies] = useState([]);
  const [varieties, setVarieties] = useState([]);
  const [grades, setGrades] = useState([]);
  const [glazes, setGlazes] = useState([]);
  const [freezers, setFreezersList] = useState([]);
  const [packingStyles, setPackingStyles] = useState([]);
  const [productionTypes, setProductionTypes] = useState([]);
  const [purposes, setPurposes] = useState([]);
  const [productionPlaces, setProductionPlaces] = useState([]);
  const [locations, setLocations] = useState([]);
  const [prodForList, setProdForList] = useState([]);
  const [poNumbers, setPoNumbers] = useState([]);

  // Form IN
  const [batchNumber, setBatchNumber] = useState('');
  const [typeOfProd, setTypeOfProd] = useState('');
  const [location, setLocation] = useState('');
  const [brand, setBrand] = useState('');
  const [prodFor, setProdFor] = useState('');
  const [freezer, setFreezer] = useState('');
  const [packStyle, setPackStyle] = useState('');
  const [glaze, setGlaze] = useState('');
  const [specie, setSpecie] = useState('');
  const [variety, setVariety] = useState('');
  const [grade, setGrade] = useState('');
  const [noOfMc, setNoOfMc] = useState(0);
  const [loose, setLoose] = useState(0);
  const [prodAt, setProdAt] = useState('');
  const [purpose, setPurpose] = useState('');
  const [poNumber, setPoNumber] = useState('');

  // Stock OUT rows
  const [outRows, setOutRows] = useState([]);
  const [availableStock, setAvailableStock] = useState([]);
  const [outFilters, setOutFilters] = useState({ brand: '', species: '', variety: '', grade: '', prodAt: '', prodFor: '' });

  const fetchData = async () => {
    setLoading(true);
    try {
      const pf = localStorage.getItem('production_for_filter') || '';
      const loc = localStorage.getItem('plant_location_filter') || '';
      const q = new URLSearchParams({ format: 'json' });
      if (pf) q.set('production_for', pf);
      if (loc) q.set('location', loc);
      const res = await fetch(`/inventory/stock_entry?${q}`, { credentials: 'include' });
      if (!res.ok) return;
      const d = await res.json();
      setBatches(d.batch_data_list || []);
      setBrands(d.brands || []);
      setSpecies(d.species || []);
      setVarieties(d.varieties || []);
      setGrades(d.grades || []);
      setGlazes(d.glazes || []);
      setFreezersList(d.freezers || []);
      setPackingStyles(d.packing_styles || []);
      setProductionTypes(d.production_types || []);
      setPurposes(d.purposes || []);
      setProductionPlaces(d.production_places || []);
      setLocations(d.locations || []);
      setProdForList(d.production_for_list || []);
      setPoNumbers(d.po_numbers || []);
      setTableData(d.table_data || []);
      if ((d.table_data || []).length === 0) setShowForm(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const h = () => fetchData();
    window.addEventListener('filter_change', h);
    return () => window.removeEventListener('filter_change', h);
  }, []);

  // Fetch coldstores when prodAt changes
  useEffect(() => {
    if (!prodAt) { setLocations([]); return; }
    fetch(`/inventory/get_matched_coldstores?production_at=${encodeURIComponent(prodAt)}`, { credentials: 'include' })
      .then(r => r.json())
      .then(d => setLocations(d.locations || []));
  }, [prodAt]);

  const handleStockIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    const fd = new URLSearchParams();
    fd.append('batch_number', batchNumber);
    fd.append('type_of_production', typeOfProd);
    fd.append('location', location);
    fd.append('brand', brand);
    fd.append('production_for', prodFor);
    fd.append('freezer', freezer);
    fd.append('packing_style', packStyle);
    fd.append('glaze', glaze);
    fd.append('species', specie);
    fd.append('variety', variety);
    fd.append('grade', grade);
    fd.append('no_of_mc', noOfMc);
    fd.append('loose', loose);
    fd.append('production_at', prodAt);
    fd.append('purpose', purpose);
    fd.append('po_number', poNumber);
    try {
      const res = await fetch('/inventory/stock_entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'include',
        body: fd,
        redirect: 'manual',
      });
      setMsg('✅ Stock IN saved successfully!');
      setShowForm(false);
      await fetchData();
    } catch (err) {
      setMsg('❌ Error saving Stock IN');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableStock = async () => {
    const q = new URLSearchParams();
    if (outFilters.brand) q.set('brand', outFilters.brand);
    if (outFilters.species) q.set('species', outFilters.species);
    if (outFilters.variety) q.set('variety', outFilters.variety);
    if (outFilters.grade) q.set('grade', outFilters.grade);
    if (outFilters.prodAt) q.set('production_at', outFilters.prodAt);
    if (outFilters.prodFor) q.set('production_for', outFilters.prodFor);
    const res = await fetch(`/inventory/stock_out_report?${q}`, { credentials: 'include' });
    const d = await res.json();
    setAvailableStock(d);
    setOutRows(d.map(r => ({ ...r, out_mc: 0, out_loose: 0 })));
  };

  const handleStockOut = async (e) => {
    e.preventDefault();
    setLoading(true);
    const validRows = outRows.filter(r => r.out_mc > 0 || r.out_loose > 0);
    if (!validRows.length) { setMsg('❌ Please enter MC or Loose quantity to move OUT'); setLoading(false); return; }
    const fd = new URLSearchParams();
    fd.append('production_for', outFilters.prodFor);
    fd.append('brand', outFilters.brand);
    fd.append('production_at', outFilters.prodAt);
    fd.append('freezer', freezer);
    fd.append('packing_style', packStyle);
    fd.append('glaze', glaze);
    fd.append('species', outFilters.species || specie);
    fd.append('variety', outFilters.variety || variety);
    fd.append('grade', outFilters.grade || grade);
    fd.append('purpose', purpose);
    fd.append('po_number', poNumber);
    validRows.forEach(r => {
      fd.append('out_batch', r.batch);
      fd.append('out_location', r.location);
      fd.append('out_mc', r.out_mc || 0);
      fd.append('out_loose', r.out_loose || 0);
    });
    try {
      await fetch('/inventory/stock_out_save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'include',
        body: fd,
        redirect: 'manual',
      });
      setMsg('✅ Stock OUT saved successfully!');
      setAvailableStock([]);
      setOutRows([]);
      setShowForm(false);
      await fetchData();
    } catch (err) {
      setMsg('❌ Error saving Stock OUT');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    const reason = window.prompt('Enter cancellation reason:');
    if (!reason) return;
    const fd = new URLSearchParams({ cancel_reason: reason });
    await fetch(`/inventory/stock_entry/delete/${id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      credentials: 'include',
      body: fd,
      redirect: 'manual',
    });
    setMsg('✅ Entry cancelled');
    await fetchData();
  };

  const INBadge = () => <span style={badge('#10b981')}>IN</span>;
  const OUTBadge = () => <span style={badge('#ef4444')}>OUT</span>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto', gap: 16, padding: '16px 16px 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <h2 style={{ color: 'var(--corp-ops)', display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
          <Boxes size={22} /> Stock Entry
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-clear" onClick={fetchData} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <RefreshCw size={13} className={loading ? 'spin-animation' : ''} /> Refresh
          </button>
          {!showForm && (
            <>
              <button className="btn btn-primary" style={{ background: '#10b981', borderColor: '#10b981', display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => { setMode('IN'); setShowForm(true); }}>
                <ArrowDownToLine size={13} /> Stock IN
              </button>
              <button className="btn btn-primary" style={{ background: '#ef4444', borderColor: '#ef4444', display: 'flex', alignItems: 'center', gap: 6 }}
                onClick={() => { setMode('OUT'); setShowForm(true); }}>
                <ArrowUpFromLine size={13} /> Stock OUT
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

      {/* STOCK IN FORM */}
      {showForm && mode === 'IN' && (
        <form onSubmit={handleStockIn} className="card" style={{ flexShrink: 0 }}>
          <h3 style={fh}>STOCK IN — COLD STORAGE ENTRY</h3>
          <div className="form-grid">
            <Sel label="Production For *" value={prodFor} onChange={setProdFor} options={prodForList} required />
            <Sel label="Production At *" value={prodAt} onChange={setProdAt} options={productionPlaces} required />
            <Sel label="Coldstore Location *" value={location} onChange={setLocation} options={locations} required />
            <div className="form-group">
              <label>Batch Number *</label>
              <select className="form-control" value={batchNumber} onChange={e => setBatchNumber(e.target.value)} required>
                <option value="">Select Batch</option>
                {batches.filter(b => !prodFor || b.production_for === prodFor).map(b =>
                  <option key={b.batch_number} value={b.batch_number}>{b.batch_number}</option>)}
              </select>
            </div>
            <Sel label="Type of Production *" value={typeOfProd} onChange={setTypeOfProd} options={productionTypes} required />
            <Sel label="Brand *" value={brand} onChange={setBrand} options={brands} required />
            <Sel label="Species *" value={specie} onChange={setSpecie} options={species} required />
            <Sel label="Variety *" value={variety} onChange={setVariety} options={varieties} required />
            <Sel label="Grade *" value={grade} onChange={setGrade} options={grades} required />
            <Sel label="Glaze *" value={glaze} onChange={setGlaze} options={glazes} required />
            <Sel label="Freezer *" value={freezer} onChange={setFreezer} options={freezers} required />
            <Sel label="Packing Style *" value={packStyle} onChange={setPackStyle} options={packingStyles.map(p => p.packing_style)} required />
            <Num label="No of MC *" value={noOfMc} onChange={setNoOfMc} />
            <Num label="Loose Slabs" value={loose} onChange={setLoose} />
            <Sel label="Purpose" value={purpose} onChange={setPurpose} options={purposes} />
            <Sel label="PO Number" value={poNumber} onChange={setPoNumber} options={poNumbers} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ background: '#10b981', borderColor: '#10b981' }}>
              <ArrowDownToLine size={14} /> Save Stock IN
            </button>
            <button type="button" className="btn btn-clear" onClick={() => setShowForm(false)}>Cancel</button>
          </div>
        </form>
      )}

      {/* STOCK OUT FORM */}
      {showForm && mode === 'OUT' && (
        <form onSubmit={handleStockOut} className="card" style={{ flexShrink: 0 }}>
          <h3 style={fh}>STOCK OUT — COLD STORAGE DISPATCH</h3>
          <div className="form-grid">
            <Sel label="Production For" value={outFilters.prodFor} onChange={v => setOutFilters(f => ({ ...f, prodFor: v }))} options={prodForList} />
            <Sel label="Production At" value={outFilters.prodAt} onChange={v => setOutFilters(f => ({ ...f, prodAt: v }))} options={productionPlaces} />
            <Sel label="Brand" value={outFilters.brand} onChange={v => setOutFilters(f => ({ ...f, brand: v }))} options={brands} />
            <Sel label="Species" value={outFilters.species} onChange={v => setOutFilters(f => ({ ...f, species: v }))} options={species} />
            <Sel label="Variety" value={outFilters.variety} onChange={v => setOutFilters(f => ({ ...f, variety: v }))} options={varieties} />
            <Sel label="Grade" value={outFilters.grade} onChange={v => setOutFilters(f => ({ ...f, grade: v }))} options={grades} />
            <Sel label="Freezer" value={freezer} onChange={setFreezer} options={freezers} />
            <Sel label="Packing Style" value={packStyle} onChange={setPackStyle} options={packingStyles.map(p => p.packing_style)} />
            <Sel label="Glaze" value={glaze} onChange={setGlaze} options={glazes} />
            <Sel label="Purpose" value={purpose} onChange={setPurpose} options={purposes} />
            <Sel label="PO Number" value={poNumber} onChange={setPoNumber} options={poNumbers} />
          </div>
          <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={fetchAvailableStock}>
            Search Available Stock
          </button>
          {outRows.length > 0 && (
            <div style={{ marginTop: 16, overflowX: 'auto' }}>
              <table className="bknr-table">
                <thead><tr>
                  <th>Location</th><th>Batch</th><th>Avail MC</th><th>Avail Loose</th>
                  <th>Out MC</th><th>Out Loose</th>
                </tr></thead>
                <tbody>
                  {outRows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.location}</td><td style={{ fontWeight: 700, color: 'var(--corp-ops)' }}>{r.batch}</td>
                      <td className="text-right">{r.mc}</td><td className="text-right">{r.loose}</td>
                      <td><input type="number" className="form-control" style={{ width: 80, padding: '4px 6px' }}
                        value={r.out_mc} min={0} max={r.mc}
                        onChange={e => setOutRows(rows => rows.map((row, idx) => idx === i ? { ...row, out_mc: parseInt(e.target.value) || 0 } : row))} /></td>
                      <td><input type="number" className="form-control" style={{ width: 80, padding: '4px 6px' }}
                        value={r.out_loose} min={0} max={r.loose}
                        onChange={e => setOutRows(rows => rows.map((row, idx) => idx === i ? { ...row, out_loose: parseInt(e.target.value) || 0 } : row))} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button type="submit" className="btn btn-primary" disabled={loading} style={{ background: '#ef4444', borderColor: '#ef4444' }}>
                  <ArrowUpFromLine size={14} /> Save Stock OUT
                </button>
                <button type="button" className="btn btn-clear" onClick={() => setShowForm(false)}>Cancel</button>
              </div>
            </div>
          )}
          {outRows.length === 0 && <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button type="button" className="btn btn-clear" onClick={() => setShowForm(false)}>Cancel</button>
          </div>}
        </form>
      )}

      {/* TODAY'S LOG TABLE */}
      <div style={{ flexShrink: 0 }}>
        <h3 style={{ fontSize: 13, fontWeight: 800, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Today's Stock Entries
        </h3>
        <div className="table-responsive">
          <table className="bknr-table" style={{ minWidth: 1400 }}>
            <thead><tr>
              <th>ID</th><th>Time</th><th>Type</th><th>Batch</th><th>Location</th>
              <th>Brand</th><th>Species</th><th>Variety</th><th>Grade</th>
              <th>Glaze</th><th>Freezer</th><th>Pack Style</th>
              <th className="text-right">MC</th><th className="text-right">Loose</th><th className="text-right">Qty (Kg)</th>
              <th>Purpose</th><th>PO #</th><th>Action</th>
            </tr></thead>
            <tbody>
              {tableData.length === 0 ? (
                <tr><td colSpan={18} className="text-center" style={{ padding: 24, color: 'var(--text-secondary)' }}>No stock entries recorded today.</td></tr>
              ) : tableData.map(row => (
                <tr key={row.id} style={{ opacity: row.is_cancelled ? 0.5 : 1, textDecoration: row.is_cancelled ? 'line-through' : 'none' }}>
                  <td className="text-center">{row.id}</td>
                  <td className="text-center">{row.time ? String(row.time).substring(0, 5) : ''}</td>
                  <td className="text-center">{row.cargo_movement_type === 'IN' ? <INBadge /> : <OUTBadge />}</td>
                  <td style={{ fontWeight: 700, color: 'var(--corp-ops)' }}>{row.batch_number}</td>
                  <td>{row.location}</td>
                  <td>{row.brand}</td><td>{row.species}</td><td>{row.variety}</td><td>{row.grade}</td>
                  <td>{row.glaze}</td><td>{row.freezer}</td><td>{row.packing_style}</td>
                  <td className="text-right">{row.no_of_mc}</td>
                  <td className="text-right">{row.loose}</td>
                  <td className="text-right">{Number(row.quantity || 0).toFixed(2)}</td>
                  <td>{row.purpose}</td><td>{row.po_number}</td>
                  <td className="text-center">
                    {!row.is_cancelled && (
                      <button style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
                        onClick={() => handleDelete(row.id)} title="Cancel">
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
    </div>
  );
}

// Shared helpers
const fh = { fontSize: 13, fontWeight: 800, marginBottom: 14, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' };
const badge = (color) => ({ background: color, color: '#fff', borderRadius: 4, padding: '2px 7px', fontSize: 10, fontWeight: 800, letterSpacing: '0.5px' });

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

function Num({ label, value, onChange }) {
  return (
    <div className="form-group">
      <label>{label}</label>
      <input type="number" className="form-control" value={value} min={0}
        onChange={e => onChange(parseInt(e.target.value) || 0)} />
    </div>
  );
}
