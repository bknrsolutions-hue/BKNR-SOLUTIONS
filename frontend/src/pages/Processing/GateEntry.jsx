// GateEntry.jsx - [Force rebuild cache buster: 104]
import React, { useState, useEffect } from 'react';
import { Truck, Plus, Ban, Calendar, Clock, Mail, RefreshCw, PackageSearch } from 'lucide-react';
import GoodsGateMovements, { SearchableDropdown } from './GoodsGateMovements';
import './GateEntry.css';

function RawMaterialGateEntry() {
  const [cacheBustVal] = useState('bknr-cb-104');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState(null);

  // Form fields
  const [batchNumber, setBatchNumber] = useState('');
  const [challanNumber, setChallanNumber] = useState('');
  const [gatePassNumber, setGatePassNumber] = useState('');
  const [receivingCenter, setReceivingCenter] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [purchasingLocation, setPurchasingLocation] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [productionFor, setProductionFor] = useState('');
  const [noOfMaterialBoxes, setNoOfMaterialBoxes] = useState('0');
  const [noOfEmptyBoxes, setNoOfEmptyBoxes] = useState('0');
  const [noOfIceBoxes, setNoOfIceBoxes] = useState('0');

  // Backend dropdowns & configurations
  const [suppliers, setSuppliers] = useState([]);
  const [locations, setLocations] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [peelingAts, setPeelingAts] = useState([]);
  const [prodForList, setProdForList] = useState([]);
  const [lastBatchMap, setLastBatchMap] = useState({});
  const [lastChallanMap, setLastChallanMap] = useState({});
  const [lastGPComboMap, setLastGPComboMap] = useState({});
  const [lastGPValue, setLastGPValue] = useState('');
  const [drivers, setDrivers] = useState([]);
  const [driverName, setDriverName] = useState('');

  // Table rows
  const [entries, setEntries] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const fetchBackendData = async () => {
    setLoading(true);
    try {
      const activeComp = localStorage.getItem('production_for_filter') || '';
      const activeLoc = localStorage.getItem('plant_location_filter') || '';
      
      const queryParams = new URLSearchParams({ format: 'json' });
      if (activeComp) queryParams.append('production_for', activeComp);
      if (activeLoc) {
        queryParams.append('location', activeLoc);
      }

      const res = await fetch(`/processing/gate_entry?${queryParams.toString()}`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        setSuppliers(data.suppliers || []);
        setLocations(data.locations || []);
        setVehicles(data.vehicles || []);
        setPeelingAts(data.peeling_ats || []);
        setProdForList(data.prod_for_list || []);
        setLastBatchMap(data.last_batch_map || {});
        setLastChallanMap(data.last_challan_map || {});
        setLastGPComboMap(data.last_gp_combo_map || {});
        setLastGPValue(data.last_gp_value || '');
        setDrivers(data.drivers || []);
        setEntries(data.today_data || []);
        setProductionFor(current => {
          const options = data.prod_for_list || [];
          if (activeComp && options.includes(activeComp)) return activeComp;
          if (current && options.includes(current)) return current;
          return options.length === 1 ? options[0] : '';
        });
        setReceivingCenter(current => {
          const options = data.peeling_ats || [];
          if (activeLoc && options.includes(activeLoc)) return activeLoc;
          if (current && options.includes(current)) return current;
          return options.length === 1 ? options[0] : '';
        });
        
        // Show form if no logs exist
        if ((data.today_data || []).length === 0) {
          setShowForm(true);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage({ type: 'error', text: data.error || data.message || 'Gate Entry data could not be loaded.' });
      }
    } catch (err) {
      console.error('Error fetching gate entry data:', err);
      setMessage({ type: 'error', text: 'Gate Entry data could not be loaded. Check the backend connection.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const now = new Date();
    setDate([
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-'));
    setTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    setEmail(localStorage.getItem('user_email') || 'bknr.solutions@gmail.com');
    fetchBackendData();

    const handleGlobalFilterChange = () => {
      fetchBackendData();
    };
    window.addEventListener('filter_change', handleGlobalFilterChange);
    return () => window.removeEventListener('filter_change', handleGlobalFilterChange);
  }, []);

  // Helper sequence generator
  const getNextSequence = (val) => {
    if (!val) return '';
    let parts = val.split('-');
    if (parts.length < 2) return val + '-1';
    let lastPart = parts[parts.length - 1];
    let num = parseInt(lastPart);
    if (isNaN(num)) return val + '-1';
    parts[parts.length - 1] = String(num + 1).padStart(lastPart.length, '0');
    return parts.join('-');
  };

  // Cascade triggers
  useEffect(() => {
    if (!productionFor) {
      setBatchNumber('');
      setChallanNumber('');
      setGatePassNumber('');
      return;
    }

    const fName = (receivingCenter || '').trim().toUpperCase();
    if (fName !== '') {
      setBatchNumber(getNextSequence(lastBatchMap[productionFor] || ''));
      setChallanNumber(getNextSequence(lastChallanMap[productionFor] || ''));

      if (lastGPComboMap[productionFor] && lastGPComboMap[productionFor][fName] !== undefined && lastGPComboMap[productionFor][fName] !== '') {
        setGatePassNumber(getNextSequence(lastGPComboMap[productionFor][fName]));
      } else {
        setGatePassNumber(getNextSequence(lastGPValue || ''));
      }
    } else {
      setBatchNumber('');
      setChallanNumber('');
      setGatePassNumber('');
    }
  }, [productionFor, receivingCenter, lastBatchMap, lastChallanMap, lastGPComboMap, lastGPValue]);

  const handleCompanyChange = (compVal) => {
    setProductionFor(compVal);
    setReceivingCenter('');
    setBatchNumber('');
    setChallanNumber('');
    setGatePassNumber('');
  };

  const handleFactoryChange = (factoryVal) => {
    if (!productionFor) {
      setMessage({ type: 'error', text: 'Select Production For before selecting Factory Name.' });
      setReceivingCenter('');
      return;
    }
    setReceivingCenter(factoryVal);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    if (!productionFor || !receivingCenter || !supplierName || !purchasingLocation || !vehicleNumber) {
      setMessage({ type: 'error', text: 'Complete all required Gate Entry fields.' });
      return;
    }

    setLoading(true);
    const formData = new URLSearchParams();
    formData.append('batch_number', batchNumber);
    formData.append('challan_number', challanNumber);
    formData.append('gate_pass_number', gatePassNumber);
    formData.append('receiving_center', receivingCenter);
    formData.append('supplier_name', supplierName);
    formData.append('purchasing_location', purchasingLocation);
    formData.append('vehicle_number', vehicleNumber);
    formData.append('driver_name', driverName.trim());
    formData.append('production_for', productionFor);
    formData.append('no_of_material_boxes', parseFloat(noOfMaterialBoxes) || 0);
    formData.append('no_of_empty_boxes', parseFloat(noOfEmptyBoxes) || 0);
    formData.append('no_of_ice_boxes', parseFloat(noOfIceBoxes) || 0);

    try {
      const res = await fetch('/processing/gate_entry', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message || 'Gate Entry saved successfully.' });
        // Clear input values
        setNoOfMaterialBoxes('0');
        setNoOfEmptyBoxes('0');
        setNoOfIceBoxes('0');
        setSupplierName('');
        setPurchasingLocation('');
        setVehicleNumber('');
        setDriverName('');
        setProductionFor(localStorage.getItem('production_for_filter') || '');
        setReceivingCenter(localStorage.getItem('plant_location_filter') || '');
        setSelectedId(null);
        await fetchBackendData();
      } else {
        setMessage({ type: 'error', text: data.error || 'Gate Entry could not be saved.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Connection error while saving Gate Entry. Your form data was retained.' });
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    const reason = window.prompt('Are you sure you want to cancel this gate entry? Please enter a cancellation reason:');
    if (reason === null) return;
    if (!reason.trim()) {
      alert('Cancellation reason is required!');
      return;
    }
    setLoading(true);
    try {
      const formData = new URLSearchParams();
      formData.append('cancel_reason', reason.trim());
      const res = await fetch(`/processing/gate_entry/delete/${id}`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });
      if (res.ok) {
        setMessage({ type: 'success', text: 'Gate Entry cancelled successfully.' });
        setSelectedId(null);
        await fetchBackendData();
      } else {
        const data = await res.json();
        setMessage({ type: 'error', text: data.error || 'Cancellation failed.' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Connection error while cancelling Gate Entry.' });
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const clearForm = () => {
    setProductionFor(localStorage.getItem('production_for_filter') || '');
    setReceivingCenter(localStorage.getItem('plant_location_filter') || '');
    setSupplierName('');
    setPurchasingLocation('');
    setVehicleNumber('');
    setDriverName('');
    setNoOfMaterialBoxes('0');
    setNoOfEmptyBoxes('0');
    setNoOfIceBoxes('0');
    setBatchNumber('');
    setChallanNumber('');
    setGatePassNumber('');
    setSelectedId(null);
    setShowForm(false);
  };

  return (
    <div className="raw-gate-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
        <h2 style={{ color: 'var(--corp-dash)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <Truck /> Gate Entry Worksheet
        </h2>
        <button 
          onClick={fetchBackendData} 
          className="btn btn-clear" 
          style={{ minWidth: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'spin-animation' : ''} /> Refresh
        </button>
      </div>

      {message && (
        <div className={`goods-message ${message.type}`}>
          {message.text}
          <button type="button" onClick={() => setMessage(null)}>×</button>
        </div>
      )}

      {/* Auto Fields */}
      <div style={autoFieldsRowStyle}>
        <div style={autoFieldStyle}><Calendar size={14} /> <strong>Date:</strong> {date}</div>
        <div style={autoFieldStyle}><Clock size={14} /> <strong>Time:</strong> {time}</div>
        <div style={autoFieldStyle}><Mail size={14} /> <strong>Email:</strong> {email}</div>
      </div>

      {/* Form Card */}
      {showForm && (
        <form onSubmit={handleSubmit} className="card" style={{ marginBottom: '30px', flexShrink: 0 }}>
          <h3 style={{ fontSize: '14px', fontWeight: '800', marginBottom: '16px', color: 'var(--text-secondary)' }}>
            RECORD NEW VEHICLE ARRIVAL
          </h3>

          <div className="form-grid">
            <div className="form-group">
              <label>Production For *</label>
              <select
                className="form-control"
                value={productionFor} 
                onChange={e => handleCompanyChange(e.target.value)}
                required
              >
                <option value="">Select Company</option>
                {Array.from(new Set([productionFor, ...prodForList].filter(Boolean))).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Factory Name *</label>
              <select
                className="form-control"
                value={receivingCenter} 
                onChange={e => handleFactoryChange(e.target.value)}
                required
              >
                <option value="">Select Peeling At</option>
                {Array.from(new Set([receivingCenter, ...peelingAts].filter(Boolean))).map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Gate Pass Number</label>
              <input type="text" className="form-control" value={gatePassNumber} onChange={e => setGatePassNumber(e.target.value)} placeholder="Auto Generated" />
            </div>
            <div className="form-group">
              <label>Batch Number</label>
              <input type="text" className="form-control" value={batchNumber} onChange={e => setBatchNumber(e.target.value)} placeholder="Auto Generated" />
            </div>
            <div className="form-group">
              <label>Challan Number</label>
              <input type="text" className="form-control" value={challanNumber} onChange={e => setChallanNumber(e.target.value)} placeholder="Auto Generated" />
            </div>

            <div className="form-group">
              <label>Supplier Name *</label>
              <select
                className="form-control"
                value={supplierName} 
                onChange={e => setSupplierName(e.target.value)}
                required
              >
                <option value="">Select Supplier</option>
                {Array.from(new Set([supplierName, ...suppliers].filter(Boolean))).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Purchasing Location *</label>
              <select
                className="form-control"
                value={purchasingLocation} 
                onChange={e => setPurchasingLocation(e.target.value)}
                required
              >
                <option value="">Select Location</option>
                {Array.from(new Set([purchasingLocation, ...locations].filter(Boolean))).map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Vehicle Number *</label>
              <select
                className="form-control"
                value={vehicleNumber} 
                onChange={e => setVehicleNumber(e.target.value)}
                required
              >
                <option value="">Select Vehicle</option>
                {Array.from(new Set([vehicleNumber, ...vehicles].filter(Boolean))).map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Driver Name</label>
              <select
                className="form-control"
                value={driverName}
                onChange={e => setDriverName(e.target.value)}
              >
                <option value="">Select Driver</option>
                {Array.from(new Set([driverName, ...drivers].filter(Boolean))).map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Material Boxes</label>
              <input 
                type="number" 
                className="form-control" 
                value={noOfMaterialBoxes} 
                onChange={e => setNoOfMaterialBoxes(e.target.value)} 
              />
            </div>
            <div className="form-group">
              <label>Empty Boxes</label>
              <input 
                type="number" 
                className="form-control" 
                value={noOfEmptyBoxes} 
                onChange={e => setNoOfEmptyBoxes(e.target.value)} 
              />
            </div>
            <div className="form-group">
              <label>Ice Boxes</label>
              <input 
                type="number" 
                className="form-control" 
                value={noOfIceBoxes} 
                onChange={e => setNoOfIceBoxes(e.target.value)} 
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <Plus size={16} /> Save
            </button>
            <button type="button" className="btn btn-clear" onClick={clearForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Entries Log Table Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexShrink: 0 }}>
        <h3 style={{ fontSize: '13px', fontWeight: '800', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Today's Active Check-ins
        </h3>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={14} /> Add Gate Entry
          </button>
        )}
      </div>

      <div className="table-responsive" style={{ flexShrink: 0 }}>
        <table className="bknr-table" style={{ minWidth: '1560px' }}>
          <thead>
            <tr>
              <th className="text-center" style={{ width: '60px' }}>ID</th>
              <th className="text-center" style={{ width: '90px' }}>Time</th>
              <th className="text-left" style={{ width: '130px' }}>Company</th>
              <th className="text-left" style={{ width: '130px' }}>Factory</th>
              <th className="text-center" style={{ width: '110px' }}>GP #</th>
              <th className="text-center" style={{ width: '110px' }}>Batch #</th>
              <th className="text-center" style={{ width: '110px' }}>Challan #</th>
              <th className="text-left" style={{ width: '150px' }}>Supplier</th>
              <th className="text-left" style={{ width: '130px' }}>Location</th>
              <th className="text-left" style={{ width: '110px' }}>Vehicle</th>
              <th className="text-left" style={{ width: '150px' }}>Driver Name</th>
              <th className="text-right" style={{ width: '80px' }}>Mat</th>
              <th className="text-right" style={{ width: '80px' }}>Emp</th>
              <th className="text-right" style={{ width: '80px' }}>Ice</th>
              <th className="text-left" style={{ width: '100px' }}>Channel</th>
              <th className="text-center" style={{ width: '80px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan="16" className="text-center" style={{ color: 'var(--text-secondary)', padding: '20px' }}>
                  No active check-ins recorded today.
                </td>
              </tr>
            ) : (
              entries.map(row => (
                <tr 
                  key={row.id} 
                  className={`${selectedId === row.id ? 'selected' : ''} ${row.is_cancelled ? 'cancelled-row' : ''}`}
                  onClick={() => {
                    if (row.is_cancelled) {
                      setSelectedId(null);
                    } else {
                      setSelectedId(row.id);
                    }
                  }}
                  style={{ 
                    cursor: 'pointer',
                    opacity: row.is_cancelled ? 0.55 : 1,
                    textDecoration: row.is_cancelled ? 'line-through' : 'none',
                    color: row.is_cancelled ? 'var(--cancelled-text)' : 'inherit'
                  }}
                >
                  <td className="text-center">{row.id}</td>
                  <td className="text-center" style={{ color: 'var(--text-secondary)' }}>{row.time ? row.time.substring(0, 5) : ''}</td>
                  <td className="text-left">{row.production_for}</td>
                  <td className="text-left">{row.receiving_center}</td>
                  <td className="text-center">{row.gate_pass_number}</td>
                  <td className="text-center">{row.batch_number}</td>
                  <td className="text-center">{row.challan_number}</td>
                  <td className="text-left">{row.supplier_name}</td>
                  <td className="text-left">{row.purchasing_location}</td>
                  <td className="text-left">{row.vehicle_number}</td>
                  <td className="text-left">{row.driver_name || ''}</td>
                  <td className="text-right">{row.no_of_material_boxes}</td>
                  <td className="text-right">{row.no_of_empty_boxes}</td>
                  <td className="text-right">{row.no_of_ice_boxes}</td>
                  <td className="text-left" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                    {row.email ? row.email.split('@')[0] : ''}
                  </td>
                  <td className="text-center">
                    {!row.is_cancelled && (
                      <button 
                         onClick={(e) => {
                           e.stopPropagation();
                           handleDelete(row.id);
                         }} 
                         style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}
                         title="Cancel entry"
                       >
                        <Ban size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const autoFieldsRowStyle = {
  display: 'flex',
  gap: '24px',
  marginBottom: '20px',
  background: 'rgba(255, 255, 255, 0.02)',
  padding: '10px 16px',
  borderRadius: 'var(--radius-element)',
  border: '1px solid var(--border-light)',
  flexWrap: 'wrap',
  flexShrink: 0
};

const autoFieldStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '12px',
  color: 'var(--text-secondary)'
};

export default function GateEntry() {
  const [activeTab, setActiveTab] = useState('raw');
  return (
    <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <div style={{
        display: 'flex',
        gap: '7px',
        margin: '12px 16px 8px',
        padding: '5px',
        border: '1px solid var(--border-light)',
        borderRadius: '9px',
        background: 'var(--bg-app)',
        flexShrink: 0
      }}>
        <button type="button" onClick={() => setActiveTab('raw')} style={tabStyle(activeTab === 'raw')}>
          <Truck size={15} /> Raw Material Gate Entry
        </button>
        <button type="button" onClick={() => setActiveTab('goods')} style={tabStyle(activeTab === 'goods')}>
          <PackageSearch size={15} /> Goods IN / OUT
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {activeTab === 'raw' ? <RawMaterialGateEntry /> : <GoodsGateMovements />}
      </div>
    </div>
  );
}

const tabStyle = active => ({
  minWidth: '190px',
  height: '36px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '7px',
  padding: '0 14px',
  border: active ? '1px solid var(--corp-dash, #2563eb)' : '1px solid var(--border-light)',
  borderRadius: '7px',
  background: active ? 'var(--corp-dash, #2563eb)' : 'var(--surface-panel)',
  color: active ? '#fff' : 'var(--text-secondary)',
  fontSize: '11px',
  fontWeight: 800,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
});
