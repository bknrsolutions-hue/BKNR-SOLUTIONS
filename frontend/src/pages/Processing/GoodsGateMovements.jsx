import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, Ban, ChevronDown, Link2, PackagePlus, Plus, RefreshCw, Trash2 } from 'lucide-react';
import './GoodsGateMovements.css';

const emptyHeader = () => ({
  movement_type: 'IN',
  production_for: localStorage.getItem('production_for_filter') || '',
  plant_location: localStorage.getItem('plant_location_filter') || '',
  party_name: '',
  source_destination: '',
  po_number: '',
  challan_number: '',
  invoice_number: '',
  vehicle_number: '',
  driver_name: '',
  department: '',
  purpose: '',
  authorized_received_by: '',
  is_returnable: false,
  expected_return_date: '',
  linked_movement_id: '',
  remarks: '',
});

const emptyItem = () => ({
  item_category: '',
  item_name: '',
  description: '',
  quantity: '',
  unit: 'Nos',
  packages: '0',
  material_condition: '',
  remarks: '',
});

async function readJson(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || payload.error || `Request failed (${response.status})`);
  return payload;
}

export default function GoodsGateMovements() {
  const [form, setForm] = useState(emptyHeader);
  const [items, setItems] = useState([emptyItem()]);
  const [rows, setRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [returnables, setReturnables] = useState([]);
  const [masters, setMasters] = useState({
    productionFor: [],
    plants: [],
    parties: [],
    sourceLocations: [],
    purposes: [],
    vehicles: [],
    drivers: [],
    departments: [],
    employees: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState(null);
  const [filters, setFilters] = useState({ movement_type: '', category: '', search: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.movement_type) params.set('movement_type', filters.movement_type);
      if (filters.category) params.set('category', filters.category);
      if (filters.search.trim()) params.set('search', filters.search.trim());
      const payload = await readJson(await fetch(`/processing/gate_entry/goods?${params}`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      }));
      setRows(payload.rows || []);
      setCategories(payload.categories || []);
      setUnits(payload.units || []);
      setReturnables(payload.returnable_movements || []);
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  }, [filters.category, filters.movement_type, filters.search]);

  const loadMasters = useCallback(async () => {
    try {
      const params = new URLSearchParams({ format: 'json' });
      const activeProductionFor = localStorage.getItem('production_for_filter') || '';
      const activeLocation = localStorage.getItem('plant_location_filter') || '';
      if (activeProductionFor) params.set('production_for', activeProductionFor);
      if (activeLocation) params.set('location', activeLocation);
      const payload = await readJson(await fetch(`/processing/gate_entry?${params}`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      }));
      const nextMasters = {
        productionFor: payload.prod_for_list || [],
        plants: payload.peeling_ats || [],
        parties: payload.goods_parties || payload.suppliers || [],
        sourceLocations: payload.goods_source_locations || payload.locations || [],
        purposes: payload.purposes || [],
        vehicles: payload.vehicles || [],
        drivers: payload.drivers || [],
        departments: payload.departments || [],
        employees: payload.employee_names || [],
      };
      setMasters(nextMasters);
      setForm(current => ({
        ...current,
        production_for: current.production_for || (nextMasters.productionFor.length === 1 ? nextMasters.productionFor[0] : ''),
        plant_location: current.plant_location || (nextMasters.plants.length === 1 ? nextMasters.plants[0] : ''),
      }));
    } catch (error) {
      setMessage({ type: 'error', text: `Dropdown data could not be loaded: ${error.message}` });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void loadMasters();
  }, [loadMasters]);

  useEffect(() => {
    const onFilterChange = event => {
      setForm(current => ({
        ...current,
        production_for: event.detail?.production_for ?? localStorage.getItem('production_for_filter') ?? current.production_for,
        plant_location: event.detail?.location ?? localStorage.getItem('plant_location_filter') ?? current.plant_location,
      }));
      window.setTimeout(load, 0);
      window.setTimeout(loadMasters, 0);
    };
    window.addEventListener('filter_change', onFilterChange);
    return () => window.removeEventListener('filter_change', onFilterChange);
  }, [load, loadMasters]);

  const linked = useMemo(
    () => returnables.find(row => String(row.id) === String(form.linked_movement_id)),
    [form.linked_movement_id, returnables],
  );

  const updateForm = (name, value) => setForm(current => ({ ...current, [name]: value }));
  const updateItem = (index, name, value) => setItems(current => current.map((item, itemIndex) => (
    itemIndex === index ? { ...item, [name]: value } : item
  )));

  const chooseLinkedMovement = value => {
    const source = returnables.find(row => String(row.id) === String(value));
    if (!source) {
      updateForm('linked_movement_id', '');
      return;
    }
    setForm(current => ({
      ...current,
      linked_movement_id: String(source.id),
      movement_type: source.movement_type === 'IN' ? 'OUT' : 'IN',
      party_name: source.party_name || current.party_name,
      production_for: source.production_for || current.production_for,
      plant_location: source.plant_location || current.plant_location,
      purpose: `Return against ${source.movement_number}`,
      is_returnable: false,
      expected_return_date: '',
    }));
    setItems((source.items || []).filter(item => Number(item.balance_quantity || 0) > 0).map(item => ({
      ...emptyItem(),
      item_category: item.item_category || '',
      item_name: item.item_name || '',
      quantity: String(item.balance_quantity || ''),
      unit: item.unit || 'Nos',
      description: `Return against ${source.movement_number}`,
    })));
  };

  const resetForm = () => {
    setForm(emptyHeader());
    setItems([emptyItem()]);
  };

  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const body = {
        ...form,
        linked_movement_id: form.linked_movement_id ? Number(form.linked_movement_id) : null,
        expected_return_date: form.expected_return_date || null,
        items: items.map(item => ({
          ...item,
          quantity: Number(item.quantity || 0),
          packages: item.packages || '0',
        })),
      };
      const payload = await readJson(await fetch('/processing/gate_entry/goods', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      }));
      const successMsg = payload.message || 'Goods Gate Movement saved successfully!';
      setMessage({ type: 'success', text: successMsg });
      const currentProdFor = form.production_for;
      const currentPlantLoc = form.plant_location;
      setForm({
        ...emptyHeader(),
        production_for: currentProdFor,
        plant_location: currentPlantLoc,
      });
      setItems([emptyItem()]);
      setShowForm(false);
      setFilters(cur => ({ ...cur, search: '' }));
      await load();
      window.alert(`✅ ${successMsg}`);
    } catch (error) {
      const errorMsg = error.message || 'Unable to save goods gate movement';
      setMessage({ type: 'error', text: errorMsg });
      window.alert(`❌ Save Failed: ${errorMsg}`);
    } finally {
      setSaving(false);
    }
  };

  const cancelRow = async row => {
    const reason = window.prompt(`Enter cancellation reason for ${row.movement_number}:`);
    if (reason === null) return;
    if (!reason.trim()) {
      setMessage({ type: 'error', text: 'Cancellation reason is required.' });
      return;
    }
    try {
      const payload = await readJson(await fetch(`/processing/gate_entry/goods/${row.id}/cancel`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      }));
      setMessage({ type: 'success', text: payload.message });
      await load();
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    }
  };

  const badgeStyle = (isIn) => ({
    display: 'inline-flex',
    minWidth: 38,
    justifyContent: 'center',
    padding: '3px 7px',
    borderRadius: 999,
    fontSize: 10,
    fontWeight: 900,
    color: isIn ? '#166534' : '#9a3412',
    background: isIn ? '#dcfce7' : '#ffedd5',
  });

  const returnStatusStyle = (status) => {
    const norm = String(status || '').toUpperCase();
    const isPending = norm === 'PENDING' || norm === 'PARTIAL';
    const isReturned = norm === 'RETURNED';
    return {
      display: 'inline-flex',
      minWidth: 50,
      justifyContent: 'center',
      padding: '3px 7px',
      borderRadius: 5,
      fontSize: 9,
      fontWeight: 800,
      color: isPending ? '#92400e' : (isReturned ? '#166534' : '#475569'),
      background: isPending ? '#fef3c7' : (isReturned ? '#dcfce7' : '#e2e8f0'),
    };
  };

  return (
    <div className="raw-gate-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
        <div>
          <h2 style={{ color: 'var(--corp-dash)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <PackagePlus size={19} /> Non-RMP Goods Gate Register
          </h2>
          <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 650 }}>
            Security movement log only — no inventory or accounting posting.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className={showForm ? 'btn btn-secondary' : 'btn btn-primary'}
            onClick={() => setShowForm(!showForm)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '32px', fontSize: '11px', fontWeight: '800' }}
          >
            {showForm ? <Ban size={14} /> : <Plus size={14} />} {showForm ? 'Close Form' : '+ New Goods Movement'}
          </button>
          <button 
            type="button" 
            className="btn btn-clear" 
            style={{ minWidth: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}
            onClick={load} 
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spin-animation' : ''} /> Refresh
          </button>
        </div>
      </div>

      {message && <div className={`goods-message ${message.type}`}>{message.text}<button type="button" onClick={() => setMessage(null)}>×</button></div>}

      {showForm && (
        <form className="card" onSubmit={submit} style={{ marginBottom: '30px', flexShrink: 0 }}>
        <div className="goods-movement-toggle">
          <button type="button" className={form.movement_type === 'IN' ? 'active in' : ''} onClick={() => updateForm('movement_type', 'IN')} disabled={Boolean(linked)}>
            <ArrowDownToLine size={16} /> Goods IN
          </button>
          <button type="button" className={form.movement_type === 'OUT' ? 'active out' : ''} onClick={() => updateForm('movement_type', 'OUT')} disabled={Boolean(linked)}>
            <ArrowUpFromLine size={16} /> Goods OUT
          </button>
        </div>

        <div className="form-grid">
          <Field label="Production For *">
            <select
              className="form-control"
              value={form.production_for}
              onChange={e => updateForm('production_for', e.target.value)}
              required
            >
              <option value="">Select Company</option>
              {withCurrent(masters.productionFor, form.production_for).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label="Plant Location *">
            <select
              className="form-control"
              value={form.plant_location}
              onChange={e => updateForm('plant_location', e.target.value)}
              required
            >
              <option value="">Select Peeling At</option>
              {withCurrent(masters.plants, form.plant_location).map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>
          <Field label="Party / Vendor Name *">
            <select
              className="form-control"
              value={form.party_name}
              onChange={e => updateForm('party_name', e.target.value)}
              required
            >
              <option value="">Select Party</option>
              {withCurrent(masters.parties, form.party_name).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label={form.movement_type === 'IN' ? 'Source / From Location' : 'Destination / To Location'}>
            <select
              className="form-control"
              value={form.source_destination}
              onChange={e => updateForm('source_destination', e.target.value)}
            >
              <option value="">Select Location</option>
              {withCurrent(masters.sourceLocations, form.source_destination).map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </Field>
          <Field label="Purpose *">
            <select
              className="form-control"
              value={form.purpose}
              onChange={e => updateForm('purpose', e.target.value)}
              required
            >
              <option value="">Select Purpose</option>
              {withCurrent(masters.purposes, form.purpose).map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <Field label={form.movement_type === 'IN' ? 'Received By' : 'Authorized By'}>
            <select
              className="form-control"
              value={form.authorized_received_by}
              onChange={e => updateForm('authorized_received_by', e.target.value)}
            >
              <option value="">Select Employee</option>
              {withCurrent(masters.employees, form.authorized_received_by).map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </Field>
          <Field label="PO Number"><input className="form-control" value={form.po_number} onChange={e => updateForm('po_number', e.target.value)} /></Field>
          <Field label="Challan Number"><input className="form-control" value={form.challan_number} onChange={e => updateForm('challan_number', e.target.value)} /></Field>
          <Field label="Invoice Number"><input className="form-control" value={form.invoice_number} onChange={e => updateForm('invoice_number', e.target.value)} /></Field>
          <Field label="Vehicle Number">
            <select
              className="form-control"
              value={form.vehicle_number}
              onChange={e => updateForm('vehicle_number', e.target.value)}
            >
              <option value="">Select Vehicle</option>
              {withCurrent(masters.vehicles, form.vehicle_number).map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </Field>
          <Field label="Driver Name">
            <SearchableDropdown
              value={form.driver_name}
              onChange={val => updateForm('driver_name', val)}
              options={masters.drivers || []}
              placeholder="Search or type driver name"
              allowCustom={true}
            />
          </Field>
          <Field label="Department">
            <select
              className="form-control"
              value={form.department}
              onChange={e => updateForm('department', e.target.value)}
            >
              <option value="">Select Department</option>
              {withCurrent(masters.departments, form.department).map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
          <Field label="Linked Return Movement">
            <select className="form-control" value={form.linked_movement_id} onChange={e => chooseLinkedMovement(e.target.value)}>
              <option value="">Not linked</option>
              {returnables.map(row => <option key={row.id} value={row.id}>{row.movement_number} · {row.movement_type} · {row.party_name} · {row.return_status}</option>)}
            </select>
          </Field>
          <label className="goods-check-field"><input type="checkbox" checked={form.is_returnable} onChange={e => updateForm('is_returnable', e.target.checked)} disabled={Boolean(linked)} /><span>Returnable movement</span></label>
          {form.is_returnable && form.movement_type === 'OUT' && <Field label="Expected Return Date *"><input className="form-control" type="date" value={form.expected_return_date} onChange={e => updateForm('expected_return_date', e.target.value)} required /></Field>}
          <Field label="Header Remarks"><input className="form-control" value={form.remarks} onChange={e => updateForm('remarks', e.target.value)} /></Field>
        </div>

        <div className="goods-items-head" style={{ marginTop: '13px', paddingTop: '10px', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <strong style={{ color: 'var(--text-secondary)', fontSize: '8.5px', fontWeight: '850', letterSpacing: '.45px', textTransform: 'uppercase' }}>ITEM DETAILS</strong>
            <br />
            <small style={{ color: '#b45309', fontSize: '9px', fontWeight: '650' }}>Raw shrimp/RMP is not allowed in this tab.</small>
          </div>
          <button type="button" className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 'auto', height: '30px' }} onClick={() => setItems(current => [...current, emptyItem()])}><Plus size={14} /> Add Item</button>
        </div>
        <div className="goods-items">
          {items.map((item, index) => (
            <div className="goods-item-row" key={index}>
              <span className="goods-item-index">{index + 1}</span>
              <select className="form-control" value={item.item_category} onChange={e => updateItem(index, 'item_category', e.target.value)} required>
                <option value="">Category *</option>
                {categories.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
              <input className="form-control" value={item.item_name} onChange={e => updateItem(index, 'item_name', e.target.value)} placeholder="Item name *" required />
              <input className="form-control" value={item.description} onChange={e => updateItem(index, 'description', e.target.value)} placeholder="Description" />
              <input className="form-control" type="number" min="0.001" step="0.001" value={item.quantity} onChange={e => updateItem(index, 'quantity', e.target.value)} placeholder="Qty *" required />
              <select className="form-control" value={item.unit} onChange={e => updateItem(index, 'unit', e.target.value)} required>{units.map(value => <option key={value}>{value}</option>)}</select>
              <input className="form-control" value={item.packages} onChange={e => updateItem(index, 'packages', e.target.value)} placeholder="Packages (e.g. 10 Boxes)" />
              <input className="form-control" value={item.material_condition} onChange={e => updateItem(index, 'material_condition', e.target.value)} placeholder="Condition" />
              <button type="button" className="goods-remove" onClick={() => setItems(current => current.length === 1 ? current : current.filter((_, itemIndex) => itemIndex !== index))} disabled={items.length === 1}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <div className="goods-form-actions" style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          <button type="button" className="btn btn-clear" onClick={() => { resetForm(); setShowForm(false); }}>Cancel / Close</button>
        </div>
      </form>
      )}

      {/* Entries Log Table Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', marginTop: '30px', flexShrink: 0 }}>
        <h3 style={{ fontSize: '13px', fontWeight: '800', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Goods Movement Register
        </h3>
        <div style={{ display: 'flex', gap: '7px' }}>
          <select className="form-control" style={{ width: '130px', height: '28px', padding: '0 6px', fontSize: '10px' }} value={filters.movement_type} onChange={e => setFilters(current => ({ ...current, movement_type: e.target.value }))}>
            <option value="">All Movements</option>
            <option>IN</option>
            <option>OUT</option>
          </select>
          <select className="form-control" style={{ width: '140px', height: '28px', padding: '0 6px', fontSize: '10px' }} value={filters.category} onChange={e => setFilters(current => ({ ...current, category: e.target.value }))}>
            <option value="">All Categories</option>
            {categories.map(value => <option key={value}>{value}</option>)}
          </select>
          <input className="form-control" style={{ width: '180px', height: '28px', padding: '0 6px 0 10px', fontSize: '10px' }} value={filters.search} onChange={e => setFilters(current => ({ ...current, search: e.target.value }))} placeholder="Search..." />
        </div>
      </div>

      <div className="table-responsive" style={{ flexShrink: 0 }}>
        <table className="bknr-table" style={{ minWidth: '1500px', width: '100%' }}>
          <thead>
            <tr>
              <th className="text-center" style={{ width: '110px' }}>Movement #</th>
              <th className="text-center" style={{ width: '130px' }}>Date / Time</th>
              <th className="text-center" style={{ width: '80px' }}>IN/OUT</th>
              <th className="text-left" style={{ width: '140px' }}>Company</th>
              <th className="text-left" style={{ width: '140px' }}>Plant</th>
              <th className="text-left" style={{ width: '180px' }}>Party / Vendor</th>
              <th className="text-left" style={{ width: '150px' }}>Document #</th>
              <th className="text-left" style={{ width: '120px' }}>Vehicle</th>
              <th className="text-left" style={{ width: '140px' }}>Driver</th>
              <th className="text-left" style={{ width: '280px' }}>Item Summary</th>
              <th className="text-right" style={{ width: '90px' }}>Quantity</th>
              <th className="text-right" style={{ width: '90px' }}>Packages</th>
              <th className="text-left" style={{ width: '130px' }}>Purpose</th>
              <th className="text-center" style={{ width: '120px' }}>Return Status</th>
              <th className="text-left" style={{ width: '100px' }}>Channel</th>
              <th className="text-center" style={{ width: '80px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className={`${row.is_cancelled ? 'cancelled-row' : ''}`} style={{ opacity: row.is_cancelled ? 0.55 : 1 }}>
                <td className="text-center"><strong>{row.movement_number}</strong><br/><small style={{ color: 'var(--text-tertiary)' }}>Row #{row.id}</small></td>
                <td className="text-center">{row.movement_date}<br/><small style={{ color: 'var(--text-tertiary)' }}>{row.movement_time}</small></td>
                <td className="text-center">
                  <span style={{ ...badgeStyle(row.movement_type === 'IN') }}>
                    {row.movement_type}
                  </span>
                </td>
                <td className="text-left">{row.production_for || '—'}</td>
                <td className="text-left">{row.plant_location || '—'}</td>
                <td className="text-left">{row.party_name || '—'}</td>
                <td className="text-left">{[row.po_number, row.challan_number, row.invoice_number].filter(Boolean).join(' / ') || '—'}</td>
                <td className="text-left">{row.vehicle_number || '—'}</td>
                <td className="text-left">{row.driver_name || '—'}</td>
                <td className="goods-summary" style={{ whiteSpace: 'normal', lineHeight: 1.3 }}>{row.item_summary || '—'}</td>
                <td className="text-right">{(Number(row.total_quantity) || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 })}</td>
                <td className="text-left" style={{ whiteSpace: 'normal', fontSize: '11px' }}>
                  {row.packages_summary || (row.total_packages > 0 ? String(row.total_packages) : '—')}
                </td>
                <td className="text-left" style={{ whiteSpace: 'normal' }}>{row.purpose || '—'}</td>
                <td className="text-center">
                  <span style={{ ...returnStatusStyle(row.return_status) }}>
                    {row.return_status.replaceAll('_', ' ')}
                  </span>
                </td>
                <td className="text-left" style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{(row.created_by || '').split('@')[0]}</td>
                <td className="text-center">
                  {!row.is_cancelled && (
                    <button type="button" className="goods-cancel" title="Cancel movement" onClick={() => cancelRow(row)} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}>
                      <Ban size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="16" className="text-center" style={{ color: 'var(--text-secondary)', padding: '20px' }}>{loading ? 'Loading goods movements…' : 'No matching goods movements found.'}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="form-group">
      <label>{label}</label>
      {children}
    </div>
  );
}

function withCurrent(values, current) {
  return [...new Set([...(values || []), current].filter(Boolean))];
}

export function SearchableDropdown({
  value,
  onChange,
  options = [],
  placeholder = 'Select',
  allowCustom = false,
  required = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || '');
  const rootRef = useRef(null);
  const normalizedOptions = useMemo(
    () => [...new Set((options || []).filter(Boolean).map(option => String(option)))],
    [options],
  );

  useEffect(() => setQuery(value || ''), [value]);
  useEffect(() => {
    const close = event => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
        if (!allowCustom) setQuery(value || '');
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [allowCustom, value]);

  const filtered = normalizedOptions.filter(option => (
    !query || option.toLowerCase().includes(query.toLowerCase())
  ));

  return (
    <div className="goods-search-dropdown" ref={rootRef}>
      <input
        value={query}
        placeholder={placeholder}
        aria-required={required}
        required={required}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={event => {
          const next = event.target.value;
          setQuery(next);
          setOpen(true);
          if (allowCustom) {
            onChange(next);
          } else {
            const exact = normalizedOptions.find(option => option.toLowerCase() === next.trim().toLowerCase());
            onChange(exact || '');
          }
        }}
      />
      <button type="button" aria-label={`Open ${placeholder} dropdown`} onClick={() => setOpen(current => !current)}>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="goods-search-menu">
          {filtered.length ? filtered.map(option => (
            <button
              type="button"
              key={option}
              className={option === value ? 'selected' : ''}
              onClick={() => {
                onChange(option);
                setQuery(option);
                setOpen(false);
              }}
            >
              {option}
            </button>
          )) : <span>No matching lookup values</span>}
        </div>
      )}
    </div>
  );
}
