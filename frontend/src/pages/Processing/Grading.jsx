import React, { useState, useEffect } from 'react';
import { Filter, Plus, Trash2, Calendar, Clock, Mail, RefreshCw, ChevronDown, ChevronUp, X, Info } from 'lucide-react';

export default function Grading() {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Form fields
  const [productionFor, setProductionFor] = useState('');
  const [peelingAt, setPeelingAt] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [hosoCount, setHosoCount] = useState('');
  const [speciesVal, setSpeciesVal] = useState('');
  const [varietyName, setVarietyName] = useState('');
  const [gradedCount, setGradedCount] = useState('');
  const [quantity, setQuantity] = useState('');

  // Dropdown options & raw data sets
  const [prodForList, setProdForList] = useState([]);
  const [peelingLocations, setPeelingLocations] = useState([]);
  const [speciesList, setSpeciesList] = useState([]);
  const [varietyList, setVarietyList] = useState([]);
  
  // Today logs and aggregates
  const [todayEntries, setTodayEntries] = useState([]);
  const [hlsoSummary, setHlsoSummary] = useState([]);
  const [hosoSummary, setHosoSummary] = useState([]);
  const [deheadingPending, setDeheadingPending] = useState([]);
  const [drillDownData, setDrillDownData] = useState({});

  // UI state
  const [expandedHlsoCount, setExpandedHlsoCount] = useState(null); // 'species|variety|count' string
  const [expandedHosoCount, setExpandedHosoCount] = useState(null); // 'species|variety|count' string
  const [selectedId, setSelectedId] = useState(null);

  // Lookup iframe modal state
  const [showLookupModal, setShowLookupModal] = useState(false);
  const [lookupUrl, setLookupUrl] = useState('');

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

      const res = await fetch(`/processing/grading?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setProdForList(data.prod_for_list || []);
        setPeelingLocations(data.peeling_locations || []);
        setSpeciesList(data.species_list || []);
        setVarietyList(data.variety_list || []);
        setTodayEntries(data.today_data || []);
        setHlsoSummary(data.hlso_summary || []);
        setHosoSummary(data.hoso_summary || []);
        setDeheadingPending(data.deheading_pending || []);
        setDrillDownData(data.drill_down || {});

        if ((data.today_data || []).length === 0) {
          setShowForm(true);
        }
      } else {
        console.error('Failed to fetch grading details');
      }
    } catch (err) {
      console.error('Error fetching grading details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const now = new Date();
    setDate(now.toISOString().split('T')[0]);
    setTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    setEmail(localStorage.getItem('user_email') || 'bknr.solutions@gmail.com');
    
    // Initial fetch
    fetchBackendData();

    // Listen to global header filter changes
    const handleGlobalFilterChange = () => {
      fetchBackendData();
    };
    window.addEventListener('filter_change', handleGlobalFilterChange);
    return () => window.removeEventListener('filter_change', handleGlobalFilterChange);
  }, []);

  // Change pool item status (Pending <-> Completed)
  const handleStatusChange = async (item, nextStatus) => {
    if (item.status === nextStatus) return;

    if (window.confirm(`Are you sure you want to change status to ${nextStatus} for Batch ${item.batch_number}?`)) {
      setLoading(true);
      const formData = new URLSearchParams();
      formData.append('batch_number', item.batch_number);
      formData.append('production_for', item.production_for);
      formData.append('hoso_count', item.hoso_count);
      formData.append('status', nextStatus);

      try {
        const res = await fetch('/processing/grading/update_pool_status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData,
        });

        if (res.ok) {
          const resp = await res.json();
          if (resp.status === 'success') {
            await fetchBackendData();
          } else {
            alert(resp.message || 'Error updating status');
          }
        } else {
          alert('Network response error updating status');
        }
      } catch (err) {
        alert('Connection error updating status');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
  };

  // Form cascade filtering helper methods
  const getRelevantBatches = () => {
    if (!productionFor || !peelingAt) return [];
    const compVal = productionFor.trim().toUpperCase();
    const locVal = peelingAt.trim().toUpperCase();

    const matches = deheadingPending.filter(item => 
      (item.production_for || '').trim().toUpperCase() === compVal &&
      (item.peeling_at || '').trim().toUpperCase() === locVal
    );
    return Array.from(new Set(matches.map(m => m.batch_number))).sort();
  };

  const getRelevantCounts = () => {
    if (!productionFor || !peelingAt || !batchNumber) return [];
    const compVal = productionFor.trim().toUpperCase();
    const locVal = peelingAt.trim().toUpperCase();

    const matches = deheadingPending.filter(item => 
      item.batch_number === batchNumber &&
      (item.production_for || '').trim().toUpperCase() === compVal &&
      (item.peeling_at || '').trim().toUpperCase() === locVal
    );
    return Array.from(new Set(matches.map(m => m.hoso_count))).sort();
  };

  // Resolve matching species choices based on pool match, or default to all species
  const getSpeciesChoices = () => {
    if (productionFor && peelingAt && batchNumber && hosoCount) {
      const compVal = productionFor.trim().toUpperCase();
      const locVal = peelingAt.trim().toUpperCase();
      const matches = deheadingPending.filter(item => 
        item.batch_number === batchNumber &&
        String(item.hoso_count) === String(hosoCount) &&
        (item.production_for || '').trim().toUpperCase() === compVal &&
        (item.peeling_at || '').trim().toUpperCase() === locVal
      );
      if (matches.length > 0) {
        return Array.from(new Set(matches.map(m => m.species))).sort();
      }
    }
    return speciesList.sort();
  };

  // Auto set species from matching pool row if single match is found
  useEffect(() => {
    const choices = getSpeciesChoices();
    if (choices.length === 1 && !speciesVal) {
      setSpeciesVal(choices[0]);
    }
  }, [productionFor, peelingAt, batchNumber, hosoCount, deheadingPending]);

  const handleSpeciesChange = (val) => {
    if (val === 'ADD_NEW') {
      setLookupUrl('/criteria/species');
      setShowLookupModal(true);
      setSpeciesVal('');
    } else {
      setSpeciesVal(val);
    }
  };

  const handleVarietyChange = (val) => {
    if (val === 'ADD_NEW') {
      setLookupUrl('/criteria/varieties');
      setShowLookupModal(true);
      setVarietyName('');
    } else {
      setVarietyName(val);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!productionFor || !peelingAt || !batchNumber || !hosoCount || !speciesVal || !varietyName || !gradedCount || !quantity) {
      alert('Please fill in all required fields.');
      return;
    }

    setLoading(true);
    const formData = new URLSearchParams();
    formData.append('production_for', productionFor);
    formData.append('peeling_at', peelingAt);
    formData.append('batch_number', batchNumber);
    formData.append('hoso_count', hosoCount);
    formData.append('species_val', speciesVal);
    formData.append('variety_name', varietyName);
    formData.append('graded_count', gradedCount.toUpperCase().trim());
    formData.append('quantity', String(quantity));

    try {
      const res = await fetch('/processing/grading', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });

      if (res.ok) {
        alert('Grading Entry Saved Successfully!');
        clearForm();
        await fetchBackendData();
      } else {
        alert('Error saving Grading record');
      }
    } catch (err) {
      alert('Connection error saving Grading record');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this grading entry?')) {
      setLoading(true);
      try {
        const res = await fetch(`/processing/grading/delete/${id}`, {
          method: 'POST',
        });
        if (res.ok) {
          setSelectedId(null);
          await fetchBackendData();
        } else {
          alert('Deletion rejected');
        }
      } catch (err) {
        alert('Connection error deleting grading record');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
  };

  const clearForm = () => {
    setProductionFor('');
    setPeelingAt('');
    setBatchNumber('');
    setHosoCount('');
    setSpeciesVal('');
    setVarietyName('');
    setGradedCount('');
    setQuantity('');
    setSelectedId(null);
    setShowForm(false);
  };

  // Sort queue: Pending first, Completed last
  const sortedQueue = [...deheadingPending].sort((a, b) => {
    if (a.status === 'Pending' && b.status === 'Completed') return -1;
    if (a.status === 'Completed' && b.status === 'Pending') return 1;
    return 0;
  });

  const speciesChoices = getSpeciesChoices();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 16px 80px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <h2 style={{ color: 'var(--corp-dash)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <Filter size={20} /> Grading Operations Worksheet
        </h2>
        <button 
          onClick={fetchBackendData} 
          className="btn btn-secondary" 
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
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

      {/* Aggregate Panels Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px', marginBottom: '10px', flexShrink: 0 }}>
          {/* HLSO Requirement Panel */}
          <div className="card" style={{ padding: '0px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border-light)', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--corp-dash)' }}>
              HLSO Requirement
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '280px', padding: '8px' }}>
              <table className="bknr-table" style={{ fontSize: '11px' }}>
                <thead>
                  <tr>
                    <th className="text-left">Species | Variety</th>
                    <th className="text-center">Count</th>
                    <th className="text-right">Total KG</th>
                  </tr>
                </thead>
                <tbody>
                  {hlsoSummary.length === 0 ? (
                    <tr><td colSpan="3" className="text-center" style={{ color: 'var(--text-secondary)', padding: '12px' }}>No HLSO requirements pending.</td></tr>
                  ) : (
                    hlsoSummary.map((item, idx) => {
                      const itemKey = `${item.species}|${item.variety}|${item.count}`;
                      const isExpanded = expandedHlsoCount === itemKey;
                      const drillDownRows = (drillDownData.hlso && drillDownData.hlso[itemKey]) ? drillDownData.hlso[itemKey] : [];

                      return (
                        <React.Fragment key={idx}>
                          <tr>
                            <td className="text-left">{item.species} | {item.variety}</td>
                            <td className="text-center">
                              <button 
                                type="button" 
                                onClick={() => setExpandedHlsoCount(isExpanded ? null : itemKey)} 
                                style={{ background: 'none', border: 'none', textDecoration: 'underline', color: 'var(--corp-dash)', cursor: 'pointer', fontWeight: '800' }}
                              >
                                {item.count}
                              </button>
                            </td>
                            <td className="text-right" style={{ color: 'var(--corp-dash)', fontWeight: '750' }}>{(Number(item.total_kg) || 0).toFixed(2)}</td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan="3" style={{ background: 'rgba(255,255,255,0.01)', padding: '8px' }}>
                                <table className="bknr-table" style={{ fontSize: '10px' }}>
                                  <thead>
                                    <tr><th>PO#</th><th>Buyer</th><th>Grade</th><th>Qty</th></tr>
                                  </thead>
                                  <tbody>
                                    {drillDownRows.map((d, dIdx) => (
                                      <tr key={dIdx}>
                                        <td className="text-center">{d.po_no}</td>
                                        <td className="text-left">{d.buyer}</td>
                                        <td className="text-center">{d.grade}</td>
                                        <td className="text-right" style={{ color: 'var(--corp-fin)' }}>{(Number(d.qty) || 0).toFixed(2)} KG</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* HOSO Requirement Panel */}
          <div className="card" style={{ padding: '0px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border-light)', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--corp-dash)' }}>
              HOSO Requirement
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '280px', padding: '8px' }}>
              <table className="bknr-table" style={{ fontSize: '11px' }}>
                <thead>
                  <tr>
                    <th className="text-left">Species | Variety</th>
                    <th className="text-center">Count</th>
                    <th className="text-right">Total KG</th>
                  </tr>
                </thead>
                <tbody>
                  {hosoSummary.length === 0 ? (
                    <tr><td colSpan="3" className="text-center" style={{ color: 'var(--text-secondary)', padding: '12px' }}>No HOSO requirements pending.</td></tr>
                  ) : (
                    hosoSummary.map((item, idx) => {
                      const itemKey = `${item.species}|${item.variety}|${item.count}`;
                      const isExpanded = expandedHosoCount === itemKey;
                      const drillDownRows = (drillDownData.hoso && drillDownData.hoso[itemKey]) ? drillDownData.hoso[itemKey] : [];

                      return (
                        <React.Fragment key={idx}>
                          <tr>
                            <td className="text-left">{item.species} | {item.variety}</td>
                            <td className="text-center">
                              <button 
                                type="button" 
                                onClick={() => setExpandedHosoCount(isExpanded ? null : itemKey)} 
                                style={{ background: 'none', border: 'none', textDecoration: 'underline', color: 'var(--corp-dash)', cursor: 'pointer', fontWeight: '800' }}
                              >
                                {item.count}
                              </button>
                            </td>
                            <td className="text-right" style={{ color: 'var(--corp-dash)', fontWeight: '750' }}>{(Number(item.total_kg) || 0).toFixed(2)}</td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan="3" style={{ background: 'rgba(255,255,255,0.01)', padding: '8px' }}>
                                <table className="bknr-table" style={{ fontSize: '10px' }}>
                                  <thead>
                                    <tr><th>PO#</th><th>Buyer</th><th>Grade</th><th>Qty</th></tr>
                                  </thead>
                                  <tbody>
                                    {drillDownRows.map((d, dIdx) => (
                                      <tr key={dIdx}>
                                        <td className="text-center">{d.po_no}</td>
                                        <td className="text-left">{d.buyer}</td>
                                        <td className="text-center">{d.grade}</td>
                                        <td className="text-right" style={{ color: 'var(--corp-fin)' }}>{(Number(d.qty) || 0).toFixed(2)} KG</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* HLSO Pending Queue Panel */}
          <div className="card" style={{ padding: '0px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border-light)', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--corp-dash)' }}>
              HLSO For Grading Queue
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '280px', padding: '8px' }}>
              <table className="bknr-table" style={{ fontSize: '11px' }}>
                <thead>
                  <tr>
                    <th className="text-left">Batch / Location</th>
                    <th className="text-left">Species | Count</th>
                    <th className="text-center">Avail Qty</th>
                    <th className="text-center" style={{ width: '90px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedQueue.length === 0 ? (
                    <tr><td colSpan="4" className="text-center" style={{ color: 'var(--text-secondary)', padding: '12px' }}>No pending stock in de-heading</td></tr>
                  ) : (
                    sortedQueue.map((item, idx) => (
                      <tr key={idx}>
                        <td className="text-left" style={{ fontSize: '10px' }}>
                          <strong>{item.batch_number}</strong><br />
                          <span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>{item.peeling_at}</span>
                        </td>
                        <td className="text-left" style={{ fontSize: '10px' }}>
                          {item.species}<br />
                          <span style={{ fontSize: '9px', color: 'var(--corp-dash)', fontWeight: '700' }}>In: {item.hoso_count}</span>
                        </td>
                        <td className="text-center" style={{ color: 'var(--corp-fin)', fontWeight: '800' }}>{(Number(item.available_qty) || 0).toFixed(2)} KG</td>
                        <td className="text-center">
                          <select 
                            className="form-control"
                            value={item.status} 
                            onChange={e => handleStatusChange(item, e.target.value)}
                            style={{ 
                              height: '24px', 
                              fontSize: '10px', 
                              padding: '2px 4px',
                              color: item.status === 'Completed' ? 'var(--corp-fin)' : 'var(--text-secondary)',
                              borderColor: item.status === 'Completed' ? 'var(--corp-fin)' : 'var(--border-light)'
                            }}
                          >
                            <option value="Pending">Pending</option>
                            <option value="Completed">Completed</option>
                          </select>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      {/* Form Toggle & Panel Button */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '12px', fontWeight: '800', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>
          Recent Records (Today)
        </h3>
        {!showForm && (
          <button onClick={() => setShowForm(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Plus size={14} /> Add New Grading
          </button>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div style={modalOverlayStyle} onClick={clearForm}>
          <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px', marginBottom: '16px', alignItems: 'center' }}>
              <h3 style={{ margin: 0, textTransform: 'uppercase', fontSize: '13px', fontWeight: '800', color: 'var(--corp-dash)' }}>
                New Grading Entry
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
                onChange={e => {
                  setProductionFor(e.target.value);
                  setBatchNumber('');
                  setHosoCount('');
                  setSpeciesVal('');
                }} 
                required
              >
                <option value="">Select Company</option>
                {prodForList.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Grading At (Location) *</label>
              <select 
                className="form-control" 
                value={peelingAt} 
                onChange={e => {
                  setPeelingAt(e.target.value);
                  setBatchNumber('');
                  setHosoCount('');
                  setSpeciesVal('');
                }} 
                required
              >
                <option value="">Select Location</option>
                {peelingLocations.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Batch Number *</label>
              <select 
                className="form-control" 
                value={batchNumber} 
                onChange={e => {
                  setBatchNumber(e.target.value);
                  setHosoCount('');
                  setSpeciesVal('');
                }} 
                required
              >
                <option value="">Select Batch</option>
                {getRelevantBatches().map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>HOSO Count (In) *</label>
              <select 
                className="form-control" 
                value={hosoCount} 
                onChange={e => setHosoCount(e.target.value)} 
                required
              >
                <option value="">Select Count</option>
                {getRelevantCounts().map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label>Species *</label>
              <select 
                className="form-control" 
                value={speciesVal} 
                onChange={e => handleSpeciesChange(e.target.value)} 
                required
              >
                <option value="">Select Species</option>
                {speciesChoices.map(s => <option key={s} value={s}>{s}</option>)}
                <option value="ADD_NEW">➕ Add New Species</option>
              </select>
            </div>

            <div className="form-group">
              <label>Variety *</label>
              <select 
                className="form-control" 
                value={varietyName} 
                onChange={e => handleVarietyChange(e.target.value)} 
                required
              >
                <option value="">Select Variety</option>
                {varietyList.map(v => <option key={v} value={v}>{v}</option>)}
                <option value="ADD_NEW">➕ Add New Variety</option>
              </select>
            </div>

            <div className="form-group">
              <label>Graded Count (Out) *</label>
              <input 
                type="text" 
                className="form-control" 
                placeholder="Enter Graded Size" 
                value={gradedCount} 
                onChange={e => setGradedCount(e.target.value)} 
                required 
              />
            </div>

            <div className="form-group">
              <label>Quantity (Kg) *</label>
              <input 
                type="number" 
                step="0.01" 
                min="0" 
                className="form-control" 
                placeholder="0.00" 
                value={quantity} 
                onChange={e => setQuantity(e.target.value)} 
                required 
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <Plus size={16} /> Save Grading Lot
            </button>
            <button type="button" className="btn btn-secondary" onClick={clearForm}>
              Cancel
            </button>
          </div>
            </form>
          </div>
        </div>
      )}

      {/* Logs Table */}
      <div className="table-responsive" style={{ flexShrink: 0 }}>
        <table className="bknr-table" style={{ minWidth: '1060px' }}>
          <thead>
            <tr>
              <th className="text-center" style={{ width: '120px' }}>Batch #</th>
              <th className="text-left" style={{ width: '180px' }}>Production For</th>
              <th className="text-center" style={{ width: '120px' }}>In (HOSO)</th>
              <th className="text-center" style={{ width: '130px' }}>Out (Graded)</th>
              <th className="text-left" style={{ width: '200px' }}>Species | Variety</th>
              <th className="text-right" style={{ width: '120px' }}>Quantity (KG)</th>
              <th className="text-center" style={{ width: '100px' }}>Time</th>
              <th className="text-center" style={{ width: '90px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {todayEntries.length === 0 ? (
              <tr>
                <td colSpan="8" className="text-center" style={{ color: 'var(--text-secondary)', padding: '20px' }}>
                  No grading records logged today.
                </td>
              </tr>
            ) : (
              todayEntries.map(row => (
                <tr 
                  key={row.id} 
                  className={selectedId === row.id ? 'selected' : ''}
                  onClick={() => setSelectedId(row.id === selectedId ? null : row.id)}
                  style={{ background: selectedId === row.id ? 'var(--row-selected)' : 'transparent', cursor: 'pointer' }}
                >
                  <td className="text-center" style={{ fontWeight: '700', color: 'var(--corp-dash)' }}>{row.batch_number}</td>
                  <td className="text-left">{row.production_for}</td>
                  <td className="text-center">{row.hoso_count}</td>
                  <td className="text-center" style={{ color: 'var(--corp-dash)', fontWeight: '800' }}>{row.graded_count}</td>
                  <td className="text-left">{row.species} | {row.variety_name}</td>
                  <td className="text-right" style={{ fontWeight: '800', color: 'var(--corp-fin)' }}>{(Number(row.quantity) || 0).toFixed(2)} KG</td>
                  <td className="text-center" style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>{row.time}</td>
                  <td className="text-center">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(row.id);
                      }} 
                      style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}
                      title="Delete log"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add New Master Configuration Iframe popup modal */}
      {showLookupModal && (
        <div style={modalOverlayStyle} onClick={() => { setShowLookupModal(false); fetchBackendData(); }}>
          <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px', marginBottom: '16px', alignItems: 'center' }}>
              <h3 style={{ margin: 0, textTransform: 'uppercase', fontSize: '12px', fontWeight: '800', color: 'var(--corp-dash)' }}>
                Master Configuration Lookup
              </h3>
              <button 
                onClick={() => { setShowLookupModal(false); fetchBackendData(); }} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>
            <div style={{ height: '70vh', width: '100%', overflow: 'hidden' }}>
              <iframe 
                src={lookupUrl} 
                style={{ width: '100%', height: '100%', border: 'none', borderRadius: 'var(--radius-element)' }} 
              />
            </div>
          </div>
        </div>
      )}
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
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.75)',
  backdropFilter: 'blur(5px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000,
  padding: '20px'
};

const modalContentStyle = {
  background: 'var(--surface-panel)',
  border: '1px solid var(--border-highlight)',
  borderRadius: 'var(--radius-panel)',
  padding: '24px',
  width: '100%',
  maxWidth: '900px',
  boxShadow: 'var(--shadow-float)',
  color: 'var(--text-primary)'
};
