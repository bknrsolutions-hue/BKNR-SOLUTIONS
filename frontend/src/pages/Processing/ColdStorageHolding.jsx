import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, MapPin, PackageOpen, Plus, Scale, Warehouse, X } from 'lucide-react';
import './ColdStorageHolding.css';

const emptyForm = (today = '') => ({
  coldStorageName: '',
  address: '',
  rentStartDate: today,
  storageRatePerMc: 0,
  productionFor: '',
  batchNumber: '',
  cargoMovementType: 'IN',
  species: '',
  variety: '',
  grade: '',
  brand: '',
  packingStyle: '',
  glaze: '',
  freezer: '',
  poNumber: 'N/A',
  purpose: 'Storing',
  noOfMc: 0,
  loose: 0,
  quantity: 0,
  remarks: '',
});

export default function ColdStorageHolding() {
  const initialFetchStarted = useRef(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [entries, setEntries] = useState([]);
  const [todayDate, setTodayDate] = useState('');
  const [storageMasters, setStorageMasters] = useState([]);
  const [productionForList, setProductionForList] = useState([]);
  const [masters, setMasters] = useState({
    brands: [], species: [], glazes: [], varieties: [], grades: [], freezers: [], packingStyles: [], pendingOrders: [],
  });
  const [batches, setBatches] = useState([]);
  const [form, setForm] = useState(emptyForm());

  const updateForm = (field, value) => setForm(current => ({ ...current, [field]: value }));

  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/inventory/cold_storage_holding?format=json', {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok) throw new Error(`Cold storage data request failed (HTTP ${response.status})`);
      if (!contentType.includes('application/json')) throw new Error('Cold storage server returned HTML instead of data');

      const data = await response.json();
      const fetchedToday = data.today_date || new Date().toISOString().slice(0, 10);
      setEntries(data.current_holdings || []);
      setTodayDate(fetchedToday);
      setStorageMasters(data.storage_masters || []);
      setProductionForList(data.production_for_list || []);
      setMasters({
        brands: data.brands || [],
        species: data.species || [],
        glazes: data.glazes || [],
        varieties: data.varieties || [],
        grades: data.grades || [],
        freezers: data.freezers || [],
        packingStyles: data.packing_styles || [],
        pendingOrders: data.pending_orders || [],
      });
      setForm(current => ({ ...current, rentStartDate: current.rentStartDate || fetchedToday }));
    } catch (error) {
      console.error(error);
      setMessage(error.message || 'Unable to load cold storage data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialFetchStarted.current) return;
    initialFetchStarted.current = true;
    fetchData();
  }, []);

  useEffect(() => {
    if (!message) return undefined;
    const timeout = window.setTimeout(() => setMessage(''), 3000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  useEffect(() => {
    if (!form.productionFor) {
      setBatches([]);
      return;
    }

    const controller = new AbortController();
    fetch(`/inventory/get_storing_batches?production_for_val=${encodeURIComponent(form.productionFor)}&purpose_val=${encodeURIComponent(form.purpose)}`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Unable to load batches')))
      .then(data => setBatches(data.batches || []))
      .catch(error => {
        if (error.name !== 'AbortError') console.error(error);
      });
    return () => controller.abort();
  }, [form.productionFor, form.purpose]);

  useEffect(() => {
    const packing = masters.packingStyles.find(item => item.packing_style === form.packingStyle);
    if (!packing) {
      updateForm('quantity', 0);
      return;
    }
    const total = (Number(form.noOfMc) * Number(packing.mc_weight || 0))
      + (Number(form.loose) * Number(packing.slab_weight || 0));
    updateForm('quantity', Number(total.toFixed(2)));
  }, [form.noOfMc, form.loose, form.packingStyle, masters.packingStyles]);

  const selectStorage = value => {
    const storage = storageMasters.find(item => item.cold_storage_name === value);
    setForm(current => ({
      ...current,
      coldStorageName: value,
      address: storage?.address || '',
      storageRatePerMc: Number(storage?.rate_per_mc || 0),
    }));
  };

  const handleSubmit = async event => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    const body = new URLSearchParams({
      cold_storage_name: form.coldStorageName,
      address: form.address,
      batch_number: form.batchNumber,
      cargo_movement_type: form.cargoMovementType,
      species: form.species,
      variety: form.variety,
      grade: form.grade,
      brand: form.brand,
      packing_style: form.packingStyle,
      no_of_mc: String(form.noOfMc),
      loose: String(form.loose),
      quantity: String(form.quantity),
      freezer: form.freezer,
      rent_start_date: form.rentStartDate,
      storage_rate_per_mc: String(form.storageRatePerMc),
      glaze: form.glaze,
      purpose: form.purpose,
      production_for: form.productionFor,
      po_number: form.poNumber || 'N/A',
      remarks: form.remarks,
    });

    try {
      const response = await fetch('/inventory/cold_storage_holding/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest' },
        credentials: 'include',
        body,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Failed to save holding');

      setMessage('Holding entry saved successfully');
      setShowForm(false);
      setForm(emptyForm(todayDate));
      await fetchData();
    } catch (error) {
      setMessage(error.message || 'Connection error');
    } finally {
      setLoading(false);
    }
  };

  const productionForOptions = useMemo(
    () => [...new Set(productionForList.map(item => item.production_for).filter(Boolean))],
    [productionForList],
  );
  const todayEntries = useMemo(
    () => entries.filter(entry => String(entry.in_date || '').slice(0, 10) === todayDate),
    [entries, todayDate],
  );

  return (
    <div className="cold-holding-page">
      <header className="cold-holding-header">
        <div>
          <h2>Cold Storage Holding</h2>
          <p><Warehouse size={13} /> External Inventory &amp; Rent Management</p>
        </div>
        <button
          type="button"
          className={`btn btn-primary cold-holding-add${showForm ? ' is-open' : ''}`}
          onClick={() => setShowForm(current => !current)}
        >
          {showForm ? <X size={14} /> : <><Plus size={14} /> Add</>}
        </button>
      </header>

      {message && (
        <div className="cold-holding-alert" role="status">
          {message}
          <button type="button" onClick={() => setMessage('')} aria-label="Dismiss message"><X size={13} /></button>
        </div>
      )}

      {showForm && (
        <form className="cold-holding-form" onSubmit={handleSubmit} autoComplete="off">
          <FormSection icon={<MapPin size={14} />} title="Storage Facility Details">
            <Field label="Facility Name">
              <select value={form.coldStorageName} onChange={event => selectStorage(event.target.value)} required>
                <option value="">Select Cold Storage</option>
                {storageMasters.map(storage => <option key={storage.id} value={storage.cold_storage_name}>{storage.cold_storage_name}</option>)}
              </select>
            </Field>
            <Field label="Full Address" wide>
              <input list="holding-addresses" value={form.address} onChange={event => updateForm('address', event.target.value)} placeholder="Select/Type Address..." required />
              <datalist id="holding-addresses">
                {storageMasters
                  .filter(storage => storage.cold_storage_name === form.coldStorageName && storage.address)
                  .map(storage => <option key={`${storage.id}-${storage.address}`} value={storage.address} />)}
              </datalist>
            </Field>
            <Field label="Rent Start Date">
              <input type="date" value={form.rentStartDate} onChange={event => updateForm('rentStartDate', event.target.value)} />
            </Field>
            <Field label="Holding Cost (Per MC)">
              <input type="number" step="any" value={form.storageRatePerMc} readOnly />
            </Field>
          </FormSection>

          <FormSection icon={<PackageOpen size={14} />} title="Stock Identification">
            <Field label="Production For">
              <select value={form.productionFor} onChange={event => updateForm('productionFor', event.target.value)} required>
                <option value="">Select Client</option>
                {productionForOptions.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </Field>
            <DatalistField label="Batch Number" value={form.batchNumber} onChange={value => updateForm('batchNumber', value)} options={batches} listId="holding-batches" placeholder="Select/Enter Batch" required />
            <Field label="Movement Type">
              <select value={form.cargoMovementType} onChange={event => updateForm('cargoMovementType', event.target.value)} required>
                <option value="IN">📥 STOCK IN</option>
                <option value="OUT">📤 STOCK OUT</option>
              </select>
            </Field>
            <DatalistField label="Species" value={form.species} onChange={value => updateForm('species', value)} options={masters.species} listId="holding-species" placeholder="Select/Type Species" required />
            <DatalistField label="Variety" value={form.variety} onChange={value => updateForm('variety', value)} options={masters.varieties} listId="holding-varieties" placeholder="Select/Type Variety" required />
            <DatalistField label="Grade" value={form.grade} onChange={value => updateForm('grade', value)} options={masters.grades} listId="holding-grades" placeholder="Select/Type Grade" required />
            <DatalistField label="Brand" value={form.brand} onChange={value => updateForm('brand', value)} options={masters.brands} listId="holding-brands" placeholder="Select/Type Brand" required />
            <DatalistField label="Packing Style" value={form.packingStyle} onChange={value => updateForm('packingStyle', value)} options={masters.packingStyles.map(item => item.packing_style)} listId="holding-packing" placeholder="Select Style" required />
            <DatalistField label="Glaze" value={form.glaze} onChange={value => updateForm('glaze', value)} options={masters.glazes} listId="holding-glazes" placeholder="Select/Type Glaze" />
            <Field label="Freezer">
              <select value={form.freezer} onChange={event => updateForm('freezer', event.target.value)}>
                <option value="">N/A</option>
                {masters.freezers.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </Field>
            <DatalistField label="PO Number" value={form.poNumber} onChange={value => updateForm('poNumber', value)} options={['N/A', ...masters.pendingOrders]} listId="holding-pos" placeholder="Default N/A" />
            <Field label="Purpose">
              <select value={form.purpose} onChange={event => updateForm('purpose', event.target.value)}>
                <option value="Storing">Storing</option>
                <option value="Sales">Sales</option>
                <option value="Reprocess">Reprocess</option>
              </select>
            </Field>
          </FormSection>

          <FormSection icon={<Scale size={14} />} title="Inventory Counts">
            <Field label="No of MC">
              <input type="number" min="0" value={form.noOfMc} onChange={event => updateForm('noOfMc', Number(event.target.value) || 0)} required />
            </Field>
            <Field label="Loose (Slabs)">
              <input type="number" min="0" value={form.loose} onChange={event => updateForm('loose', Number(event.target.value) || 0)} />
            </Field>
            <Field label="Total Quantity (KG)" accent>
              <input type="number" step="any" value={form.quantity.toFixed(2)} readOnly required />
            </Field>
            <Field label="Remarks" wide>
              <input value={form.remarks} onChange={event => updateForm('remarks', event.target.value)} placeholder="Enter remarks (if any)" />
            </Field>
          </FormSection>

          <div className="cold-holding-actions">
            <button type="button" className="btn btn-clear" onClick={() => setShowForm(false)}><X size={14} /> Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}><Check size={14} /> {loading ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      )}

      {entries.length > 0 && (
        <div className="table-responsive cold-holding-table-wrap">
          <table className="bknr-table cold-holding-table">
            <thead>
              <tr>
                <th>Status</th><th>Facility</th><th>Production For</th><th>Batch #</th><th>Movement</th>
                <th>Species</th><th>Variety</th><th>Grade</th><th>MC</th><th>Loose</th><th>Total Qty</th><th>In Date</th>
              </tr>
            </thead>
            <tbody>
              {todayEntries.map(entry => (
                <tr key={entry.id}>
                  <td><span className="cold-holding-badge status">{entry.status}</span></td>
                  <td className="strong-cell">{entry.cold_storage_name}</td>
                  <td className="strong-cell muted-cell">{entry.production_for}</td>
                  <td className="batch-cell">{entry.batch_number}</td>
                  <td><span className={`cold-holding-badge ${entry.cargo_movement_type === 'IN' ? 'movement-in' : 'movement-out'}`}>{entry.cargo_movement_type}</span></td>
                  <td>{entry.species}</td><td>{entry.variety}</td><td>{entry.grade}</td>
                  <td className="strong-cell">{entry.no_of_mc}</td><td>{entry.loose}</td>
                  <td className="strong-cell">{Number(entry.quantity || 0).toFixed(2)}</td>
                  <td className="muted-cell">{String(entry.in_date || '').slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FormSection({ icon, title, children }) {
  return (
    <section className="cold-holding-section">
      <h3>{icon}{title}</h3>
      <div className="cold-holding-grid">{children}</div>
    </section>
  );
}

function Field({ label, children, wide = false, accent = false }) {
  return (
    <label className={`cold-holding-field${wide ? ' is-wide' : ''}${accent ? ' is-accent' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function DatalistField({ label, value, onChange, options, listId, placeholder, required = false }) {
  return (
    <Field label={label}>
      <input list={listId} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} required={required} />
      <datalist id={listId}>
        {[...new Set(options.filter(Boolean))].map(option => <option key={option} value={option} />)}
      </datalist>
    </Field>
  );
}
