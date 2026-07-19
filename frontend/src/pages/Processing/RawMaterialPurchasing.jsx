import React, { useState, useEffect } from 'react';
import { ShoppingBag, Plus, Ban, Edit2, Calendar, Clock, Mail, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

export default function RawMaterialPurchasing() {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);

  // Form inputs
  const [productionFor, setProductionFor] = useState('');
  const [peelingAt, setPeelingAt] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [productDescription, setProductDescription] = useState('');
  const [hsnCode, setHsnCode] = useState('');
  const [varietyName, setVarietyName] = useState('');
  const [species, setSpecies] = useState('');
  const [count, setCount] = useState('');
  const [materialBoxes, setMaterialBoxes] = useState('0');
  const [g1, setG1] = useState('0');
  const [g2, setG2] = useState('0');
  const [dc, setDc] = useState('0');
  const [rate, setRate] = useState('0');
  const [remarks, setRemarks] = useState('');

  // Auto-calcs
  const [receivedQty, setReceivedQty] = useState(0);
  const [amount, setAmount] = useState(0);

  // Log filters
  const [filterCompany, setFilterCompany] = useState('');
  const [filterBatch, setFilterBatch] = useState('');
  const [filterVariety, setFilterVariety] = useState('');

  // Autocomplete & Lookup lists
  const [suppliers, setSuppliers] = useState([]);
  const [varieties, setVarieties] = useState([]);
  const [speciesList, setSpeciesList] = useState([]);
  const [peelingLocations, setPeelingLocations] = useState([]);
  const [prodForList, setProdForList] = useState([]);
  const [hsnList, setHsnList] = useState([]);
  const [hsnMap, setHsnMap] = useState({});
  const [hosoSummary, setHosoSummary] = useState([]);
  const [drillDownData, setDrillDownData] = useState({});
  const [prodBatchMap, setProdBatchMap] = useState({});
  const [batchSupplierMap, setBatchSupplierMap] = useState({});
  
  // Table rows
  const [entries, setEntries] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  
  // UI States
  const [expandedHosoCount, setExpandedHosoCount] = useState(null); // 'species|variety|count' string

  const fetchBackendData = async () => {
    setLoading(true);
    try {
      const activeComp = localStorage.getItem('production_for_filter') || '';
      const activeLoc = localStorage.getItem('plant_location_filter') || '';
      
      const queryParams = new URLSearchParams({ format: 'json' });
      if (activeComp) queryParams.append('production_for', activeComp);
      if (activeLoc) {
        queryParams.append('location', activeLoc);
        queryParams.append('peeling_at', activeLoc);
      }

      const res = await fetch(`/processing/raw_material_purchasing?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.today_data || []);
        setSuppliers(data.supplier_list || []);
        setVarieties(data.variety_list || []);
        setSpeciesList(data.species_list || []);
        setPeelingLocations(data.peeling_locations || []);
        setProdForList(data.prod_for_list || []);
        setHsnList(data.hsn_list || []);
        setHsnMap(data.hsn_map || {});
        setHosoSummary(data.hoso_summary || []);
        setDrillDownData(data.drill_down || {});
        setProdBatchMap(data.prod_batch_map || {});
        setBatchSupplierMap(data.batch_supplier_map || {});

        if ((data.today_data || []).length === 0) {
          setShowForm(true);
        }
      } else {
        console.error('Failed to fetch purchasing data');
      }
    } catch (err) {
      console.error('Error fetching purchasing data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const now = new Date();
    setDate(now.toISOString().split('T')[0]);
    setTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    setEmail(localStorage.getItem('user_email') || 'bknr.solutions@gmail.com');
    fetchBackendData();

    const handleGlobalFilterChange = () => {
      fetchBackendData();
    };
    window.addEventListener('filter_change', handleGlobalFilterChange);
    return () => window.removeEventListener('filter_change', handleGlobalFilterChange);
  }, []);

  // Sync auto formulas
  useEffect(() => {
    const g1Val = parseFloat(g1) || 0;
    const g2Val = parseFloat(g2) || 0;
    const dcVal = parseFloat(dc) || 0;
    const rateVal = parseFloat(rate) || 0;

    const totalRec = g1Val + g2Val + dcVal;
    const billable = g1Val + (g2Val / 2);
    const totAmt = billable * rateVal;

    setReceivedQty(totalRec.toFixed(2));
    setAmount(totAmt.toFixed(2));
  }, [g1, g2, dc, rate]);

  // Handle HSN Code Autopopulate
  useEffect(() => {
    if (productDescription && hsnMap[productDescription]) {
      setHsnCode(hsnMap[productDescription]);
    } else {
      setHsnCode('');
    }
  }, [productDescription, hsnMap]);

  // Handle Supplier Autopopulate from Batch
  useEffect(() => {
    if (batchNumber && batchSupplierMap[batchNumber]) {
      setSupplierName(batchSupplierMap[batchNumber].supplier || '');
    } else {
      setSupplierName('');
    }
  }, [batchNumber, batchSupplierMap]);

  // Get matching batches based on selected Company and Location
  const getFilteredBatches = () => {
    if (!productionFor || !peelingAt) return [];
    const compVal = productionFor.trim().toUpperCase();
    const locVal = peelingAt.trim().toUpperCase();
    
    const candidates = prodBatchMap[compVal] || [];
    return candidates.filter(b => {
      const meta = batchSupplierMap[b];
      if (meta && meta.prod_for && meta.receiving_center) {
        return (
          meta.prod_for.trim().toUpperCase() === compVal &&
          meta.receiving_center.trim().toUpperCase() === locVal
        );
      }
      return false;
    });
  };

  const optionList = (items, currentValue = '') => Array.from(new Set(
    [currentValue, ...items].map(value => String(value || '').trim()).filter(Boolean)
  ));

  const handleProductionForChange = (value) => {
    setProductionFor(value);
    setBatchNumber('');
    setSupplierName('');
  };

  const handlePeelingAtChange = (value) => {
    setPeelingAt(value);
    setBatchNumber('');
    setSupplierName('');
  };

  const handleEdit = (row) => {
    setEditId(row.id);
    setProductionFor(row.production_for || '');
    setPeelingAt(row.peeling_at || '');
    setBatchNumber(row.batch_number || '');
    setSupplierName(row.supplier_name || '');
    setProductDescription(row.product_description || '');
    setHsnCode(row.hsn_code || '');
    setVarietyName(row.variety_name || '');
    setSpecies(row.species || '');
    setCount(row.count || '');
    setMaterialBoxes(String(row.material_boxes || 0));
    setG1(String(row.g1_qty || 0));
    setG2(String(row.g2_qty || 0));
    setDc(String(row.dc_qty || 0));
    setRate(String(row.rate_per_kg || 0));
    setRemarks(row.remarks || '');
    setShowForm(true);
  };

  const clearForm = () => {
    setEditId(null);
    setProductionFor('');
    setPeelingAt('');
    setBatchNumber('');
    setSupplierName('');
    setProductDescription('');
    setHsnCode('');
    setVarietyName('');
    setSpecies('');
    setCount('');
    setMaterialBoxes('0');
    setG1('0');
    setG2('0');
    setDc('0');
    setRate('0');
    setRemarks('');
    setSelectedId(null);
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!productionFor || !peelingAt || !batchNumber || !varietyName || !species || !rate) {
      alert('Please fill in all required fields.');
      return;
    }

    setLoading(true);
    const formData = new URLSearchParams();
    formData.append('production_for', productionFor.toUpperCase());
    formData.append('peeling_at', peelingAt.toUpperCase());
    formData.append('batch_number', batchNumber.toUpperCase());
    formData.append('supplier_name', supplierName.toUpperCase());
    formData.append('variety_name', varietyName.toUpperCase());
    formData.append('species', species.toUpperCase());
    formData.append('count', count.toUpperCase());
    formData.append('hsn_code', hsnCode.toUpperCase());
    formData.append('material_boxes', parseFloat(materialBoxes) || 0);
    formData.append('g1_qty', parseFloat(g1) || 0);
    formData.append('g2_qty', parseFloat(g2) || 0);
    formData.append('dc_qty', parseFloat(dc) || 0);
    formData.append('rate_per_kg', parseFloat(rate) || 0);
    formData.append('remarks', remarks);

    const url = editId 
      ? `/processing/raw_material_purchasing/update/${editId}`
      : '/processing/raw_material_purchasing';

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });

      if (res.ok) {
        alert(editId ? 'Purchase Updated Successfully!' : 'Lot Purchase Saved Successfully!');
        clearForm();
        await fetchBackendData();
      } else {
        alert('Error saving RM Purchase Lot');
      }
    } catch (err) {
      alert('Connection error saving purchase');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    const reason = window.prompt('Are you sure you want to cancel this purchase record? Please enter a cancellation reason:');
    if (reason === null) return;
    if (!reason.trim()) {
      alert('Cancellation reason is required!');
      return;
    }
    setLoading(true);
    try {
      const formData = new URLSearchParams();
      formData.append('cancel_reason', reason.trim());
      const res = await fetch(`/processing/raw_material_purchasing/delete/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });
      if (res.ok) {
        alert('Lot Purchase Cancelled Successfully');
        setSelectedId(null);
        await fetchBackendData();
      } else {
        const data = await res.json();
        alert(data.error || 'Cancellation failed');
      }
    } catch (err) {
      alert('Connection error cancelling record');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Filter logs list on client side
  const filteredEntries = entries.filter(row => {
    const matchesComp = !filterCompany || (row.production_for || '').toUpperCase().includes(filterCompany.toUpperCase());
    const matchesBatch = !filterBatch || (row.batch_number || '').toUpperCase().includes(filterBatch.toUpperCase());
    const matchesVariety = !filterVariety || (row.variety_name || '').toUpperCase().includes(filterVariety.toUpperCase());
    return matchesComp && matchesBatch && matchesVariety;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto', gap: '16px', padding: '16px 16px 80px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
        <h2 style={{ color: 'var(--corp-dash)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <ShoppingBag /> Raw Material Purchasing
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

      {/* Auto Fields */}
      <div style={autoFieldsRowStyle}>
        <div style={autoFieldStyle}><Calendar size={14} /> <strong>Date:</strong> {date}</div>
        <div style={autoFieldStyle}><Clock size={14} /> <strong>Time:</strong> {time}</div>
        <div style={autoFieldStyle}><Mail size={14} /> <strong>Email:</strong> {email}</div>
      </div>

      {/* Pending HOSO Status Summaries */}
      {!showForm && hosoSummary.length > 0 && (
        <div style={{ marginBottom: '25px', flexShrink: 0 }} className="card">
          <h3 style={{ fontSize: '13px', fontWeight: '800', marginBottom: '12px', color: 'var(--accent)', textTransform: 'uppercase' }}>
            Pending HOSO Status Requirements
          </h3>
          <div className="table-responsive">
            <table className="bknr-table" style={{ fontSize: '11px' }}>
              <thead>
                <tr>
                  <th className="text-center" style={{ width: '40%' }}>Species | Variety</th>
                  <th className="text-center" style={{ width: '30%' }}>Count (Grade)</th>
                  <th className="text-right" style={{ width: '30%' }}>Balance to Procure (KG)</th>
                </tr>
              </thead>
              <tbody>
                {hosoSummary.map((item, index) => {
                  if (item.balance <= 0) return null;
                  const itemKey = `${item.species}|${item.variety}|${item.hoso_count}`;
                  const isExpanded = expandedHosoCount === itemKey;
                  const drillDownRows = drillDownData[itemKey] || [];

                  return (
                    <React.Fragment key={index}>
                      <tr>
                        <td className="text-center" style={{ fontWeight: '700' }}>{item.species} | {item.variety}</td>
                        <td className="text-center">
                          <button
                            type="button"
                            onClick={() => setExpandedHosoCount(isExpanded ? null : itemKey)}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--corp-dash)',
                              textDecoration: 'underline',
                              fontWeight: '800',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            {item.hoso_count} {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                        </td>
                        <td className="text-right" style={{ color: 'var(--corp-dash)', fontWeight: '800' }}>
                          {item.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                      
                      {isExpanded && (
                        <tr>
                          <td colSpan="3" style={{ background: 'rgba(255,255,255,0.01)', padding: '10px' }}>
                            <div style={{ border: '1px dashed var(--border-light)', borderRadius: '6px', padding: '8px' }}>
                              <h4 style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '6px', textTransform: 'uppercase' }}>
                                Drilldown Orders Mapping:
                              </h4>
                              {drillDownRows.length === 0 ? (
                                <p style={{ fontSize: '10px', color: 'var(--text-secondary)', margin: 0 }}>No orders matching</p>
                              ) : (
                                <table className="bknr-table" style={{ fontSize: '10px', minWidth: '100%' }}>
                                  <thead>
                                    <tr>
                                      <th className="text-center">PO Number</th>
                                      <th className="text-left">Buyer</th>
                                      <th className="text-center">Target Grade</th>
                                      <th className="text-right">Req. Weight</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {drillDownRows.map((d, dIdx) => (
                                      <tr key={dIdx}>
                                        <td className="text-center">{d.po_no}</td>
                                        <td className="text-left">{d.buyer}</td>
                                        <td className="text-center">{d.grade}</td>
                                        <td className="text-right">{d.req.toLocaleString()} KG</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Form Log Filters */}
      {!showForm && (
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '15px' }} className="card">
          <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)' }}>FILTERS:</div>
          <input 
            type="text" 
            className="form-control" 
            placeholder="Filter Company..." 
            value={filterCompany} 
            onChange={e => setFilterCompany(e.target.value)} 
            style={{ maxWidth: '180px', height: '32px', fontSize: '11px' }}
          />
          <input 
            type="text" 
            className="form-control" 
            placeholder="Filter Batch..." 
            value={filterBatch} 
            onChange={e => setFilterBatch(e.target.value)} 
            style={{ maxWidth: '180px', height: '32px', fontSize: '11px' }}
          />
          <input 
            type="text" 
            className="form-control" 
            placeholder="Filter Variety..." 
            value={filterVariety} 
            onChange={e => setFilterVariety(e.target.value)} 
            style={{ maxWidth: '180px', height: '32px', fontSize: '11px' }}
          />
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div style={modalOverlayStyle} onClick={clearForm}>
          <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px', marginBottom: '16px', alignItems: 'center' }}>
              <h3 style={{ margin: 0, textTransform: 'uppercase', fontSize: '13px', fontWeight: '800', color: 'var(--corp-dash)' }}>
                {editId ? 'EDIT RM TRANSACTION LOT' : 'RECORD INCOMING MATERIAL LOT'}
              </h3>
              <button onClick={clearForm} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-secondary)' }}>&times;</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-grid">
            <div className="form-group">
              <label>Production For *</label>
              <select
                className="form-control"
                value={productionFor} 
                onChange={e => handleProductionForChange(e.target.value)}
                required 
              >
                <option value="">Select Company</option>
                {optionList(prodForList, productionFor).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Receiving At (Location) *</label>
              <select
                className="form-control"
                value={peelingAt} 
                onChange={e => handlePeelingAtChange(e.target.value)}
                required 
              >
                <option value="">Select Location</option>
                {optionList(peelingLocations, peelingAt).map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Batch Number *</label>
              <select
                className="form-control"
                value={batchNumber} 
                onChange={e => setBatchNumber(e.target.value)} 
                disabled={!productionFor || !peelingAt}
                required 
              >
                <option value="">{productionFor && peelingAt ? 'Select Batch' : 'Select Company & Location First'}</option>
                {optionList(getFilteredBatches(), batchNumber).map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Supplier Name</label>
              <input type="text" className="form-control" value={supplierName} readOnly placeholder="Auto from Batch" style={{ background: 'rgba(255,255,255,0.02)' }} />
            </div>

            <div className="form-group">
              <label>Product *</label>
              <select
                className="form-control"
                value={productDescription} 
                onChange={e => setProductDescription(e.target.value)} 
                required 
              >
                <option value="">Select Product</option>
                {optionList(hsnList, productDescription).map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>HSN Code</label>
              <input type="text" className="form-control" value={hsnCode} readOnly placeholder="Auto from Product" style={{ background: 'rgba(255,255,255,0.02)' }} />
            </div>

            <div className="form-group">
              <label>Variety *</label>
              <select
                className="form-control"
                value={varietyName} 
                onChange={e => setVarietyName(e.target.value)} 
                required 
              >
                <option value="">Select Variety</option>
                {optionList(varieties, varietyName).map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Species *</label>
              <select
                className="form-control"
                value={species} 
                onChange={e => setSpecies(e.target.value)} 
                required 
              >
                <option value="">Select Species</option>
                {optionList(speciesList, species).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Count / Grade</label>
              <input type="text" className="form-control" value={count} onChange={e => setCount(e.target.value)} placeholder="Enter Count" />
            </div>

            <div className="form-group">
              <label>Material Boxes</label>
              <input type="number" step="0.01" className="form-control" value={materialBoxes} onChange={e => setMaterialBoxes(e.target.value)} />
            </div>
          </div>

          <h3 style={{ fontSize: '12px', fontWeight: '800', margin: '20px 0 12px 0', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
            Qty & Pricing Details
          </h3>

          <div className="form-grid">
            <div className="form-group">
              <label>G1 Qty (Kg)</label>
              <input type="number" step="0.01" className="form-control" value={g1} onChange={e => setG1(e.target.value)} />
            </div>
            <div className="form-group">
              <label>G2 Qty (Kg)</label>
              <input type="number" step="0.01" className="form-control" value={g2} onChange={e => setG2(e.target.value)} />
            </div>
            <div className="form-group">
              <label>DC Qty (Kg)</label>
              <input type="number" step="0.01" className="form-control" value={dc} onChange={e => setDc(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Total Received Qty</label>
              <input type="text" className="form-control" value={receivedQty} readOnly style={{ background: 'rgba(255,255,255,0.02)', fontWeight: '800' }} />
            </div>
            <div className="form-group">
              <label>Purchase Rate (₹ per Kg) *</label>
              <input type="number" step="0.01" className="form-control" value={rate} onChange={e => setRate(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Computed Amount (₹)</label>
              <input type="text" className="form-control" value={amount} readOnly style={{ background: 'rgba(255,255,255,0.02)', fontWeight: '800', color: 'var(--corp-fin)' }} />
            </div>
          </div>

          <div className="form-group" style={{ marginTop: '12px' }}>
            <label>Remarks</label>
            <textarea className="form-control" rows="2" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional comments..." />
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
          </div>
        </div>
      )}

      {/* Logs Table */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexShrink: 0 }}>
        <h3 style={{ fontSize: '13px', fontWeight: '800', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Today's Lot Purchases
        </h3>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={14} /> Add New Entry
          </button>
        )}
      </div>

      <div className="table-responsive" style={{ flexShrink: 0 }}>
        <table className="bknr-table" style={{ minWidth: '1600px' }}>
          <thead>
            <tr>
              <th className="text-center" style={{ width: '60px' }}>ID</th>
              <th className="text-center" style={{ width: '90px' }}>Date</th>
              <th className="text-center" style={{ width: '80px' }}>Time</th>
              <th className="text-center" style={{ width: '120px' }}>Batch</th>
              <th className="text-left" style={{ width: '130px' }}>Company</th>
              <th className="text-left" style={{ width: '130px' }}>Receiving At</th>
              <th className="text-center" style={{ width: '100px' }}>HSN Code</th>
              <th className="text-left" style={{ width: '160px' }}>Supplier Name</th>
              <th className="text-left" style={{ width: '110px' }}>Variety</th>
              <th className="text-left" style={{ width: '110px' }}>Species</th>
              <th className="text-center" style={{ width: '80px' }}>Count</th>
              <th className="text-right" style={{ width: '80px' }}>Boxes</th>
              <th className="text-right" style={{ width: '90px' }}>G1 Qty</th>
              <th className="text-right" style={{ width: '90px' }}>G2 Qty</th>
              <th className="text-right" style={{ width: '90px' }}>DC Qty</th>
              <th className="text-right" style={{ width: '100px' }}>Total Qty</th>
              <th className="text-right" style={{ width: '90px' }}>Rate</th>
              <th className="text-right" style={{ width: '120px' }}>Amount</th>
              <th className="text-left" style={{ width: '160px' }}>Remarks</th>
              <th className="text-left" style={{ width: '110px' }}>User</th>
              <th className="text-center" style={{ width: '100px' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan="21" className="text-center" style={{ color: 'var(--text-secondary)', padding: '20px' }}>
                  No lot purchases match the selected filter.
                </td>
              </tr>
            ) : (
              filteredEntries.map(row => (
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
                  <td className="text-center">{row.date}</td>
                  <td className="text-center" style={{ color: 'var(--text-secondary)' }}>{row.time ? row.time.substring(0, 5) : ''}</td>
                  <td className="text-center" style={{ fontWeight: '800', color: 'var(--corp-dash)' }}>{row.batch_number}</td>
                  <td className="text-left">{row.production_for}</td>
                  <td className="text-left">{row.peeling_at}</td>
                  <td className="text-center">{row.hsn_code}</td>
                  <td className="text-left">{row.supplier_name}</td>
                  <td className="text-left">{row.variety_name}</td>
                  <td className="text-left">{row.species}</td>
                  <td className="text-center">{row.count}</td>
                  <td className="text-right">{(row.material_boxes || 0).toFixed(2)}</td>
                  <td className="text-right">{(row.g1_qty || 0).toFixed(2)}</td>
                  <td className="text-right">{(row.g2_qty || 0).toFixed(2)}</td>
                  <td className="text-right">{(row.dc_qty || 0).toFixed(2)}</td>
                  <td className="text-right" style={{ fontWeight: '800', color: 'var(--corp-dash)' }}>{(row.is_cancelled ? 0 : row.received_qty).toFixed(2)}</td>
                  <td className="text-right">₹{row.rate_per_kg.toFixed(2)}</td>
                  <td className="text-right" style={{ fontWeight: '800', color: 'var(--corp-fin)' }}>₹{(row.is_cancelled ? 0 : row.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="text-left" style={{ fontSize: '10px' }}>{row.remarks}</td>
                  <td className="text-left" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                    {row.email ? row.email.split('@')[0] : ''}
                  </td>
                  <td className="text-center" onClick={e => e.stopPropagation()}>
                    {!row.is_cancelled && (
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button 
                          onClick={() => handleEdit(row)} 
                          style={{ background: 'none', border: 'none', color: 'var(--corp-dash)', cursor: 'pointer', padding: '4px' }}
                          title="Edit log"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button 
                          onClick={() => handleDelete(row.id)} 
                          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}
                          title="Cancel log"
                        >
                          <Ban size={13} />
                        </button>
                      </div>
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

const modalOverlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  width: '100vw',
  height: '100vh',
  background: 'rgba(0, 0, 0, 0.5)',
  backdropFilter: 'blur(3px)',
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  zIndex: 1000
};

const modalContentStyle = {
  background: 'var(--card-bg)',
  border: '1px solid var(--border-light)',
  borderRadius: '8px',
  padding: '24px',
  width: '90%',
  maxWidth: '900px',
  maxHeight: '90vh',
  overflowY: 'auto',
  color: 'var(--text-primary)'
};
