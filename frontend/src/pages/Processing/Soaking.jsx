import React, { useState, useEffect } from 'react';
import { Droplet, Plus, Trash2, Calendar, Clock, Mail, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';

export default function Soaking() {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Form inputs
  const [sintexNumber, setSintexNumber] = useState('AUTO');
  const [productionFor, setProductionFor] = useState('');
  const [productionAt, setProductionAt] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [inCount, setInCount] = useState('');
  const [varietyName, setVarietyName] = useState('');
  const [speciesName, setSpeciesName] = useState('');
  const [inQty, setInQty] = useState('0');
  const [chemicalName, setChemicalName] = useState('');
  const [chemicalPercent, setChemicalPercent] = useState('0');
  const [saltPercent, setSaltPercent] = useState('0');
  const [rejectionQty, setRejectionQty] = useState('0');
  const [rejectionFor, setRejectionFor] = useState('');
  const [floorAvail, setFloorAvail] = useState(0);

  // Calculated values
  const [chemCalc, setChemCalc] = useState('0.00');
  const [saltCalc, setSaltCalc] = useState('0.00');

  // Filters
  const [filterCompany, setFilterCompany] = useState('');
  const [filterVariety, setFilterVariety] = useState('');
  const [filterCount, setFilterCount] = useState('');
  const [filterBatchSearch, setFilterBatchSearch] = useState('');

  // Dropdown options & raw data sets
  const [prodForList, setProdForList] = useState([]);
  const [peelingLocations, setPeelingLocations] = useState([]);
  const [varietiesList, setVarietiesList] = useState([]);
  const [chemicalsList, setChemicalsList] = useState([]);
  const [speciesList, setSpeciesList] = useState([]);
  const [floorBalanceRows, setFloorBalanceRows] = useState([]);
  const [todayEntries, setTodayEntries] = useState([]);

  // Cascaded lists
  const [batchesList, setBatchesList] = useState([]);
  const [countsList, setCountsList] = useState([]);

  // Selected row
  const [selectedId, setSelectedId] = useState(null);

  // Collapse states for tree
  const [collapsedComps, setCollapsedComps] = useState({});
  const [collapsedLocs, setCollapsedLocs] = useState({});

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

      const res = await fetch(`/processing/soaking?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setProdForList(data.prod_for_list || []);
        setPeelingLocations(data.peeling_locations || []);
        setVarietiesList(data.varieties || []);
        setChemicalsList(data.chemicals || []);
        setSpeciesList(data.species || []);
        setFloorBalanceRows(data.rows_batch || []);
        setTodayEntries(data.today_data || []);

        if (data.selected_production_for) setFilterCompany(data.selected_production_for);
        if (data.selected_location) setProductionAt(data.selected_location);

        if ((data.today_data || []).length === 0) {
          setShowModal(true);
        }
      } else {
        console.error('Failed to fetch Soaking details');
      }
    } catch (err) {
      console.error('Error fetching Soaking details:', err);
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

  // Form cascading lookups
  const getFilteredBatches = () => {
    if (!productionFor || !productionAt) return [];
    const compVal = productionFor.toUpperCase().trim();
    const locVal = productionAt.toUpperCase().trim();

    const matches = floorBalanceRows.filter(row => 
      (row.production_for || '').toUpperCase().trim() === compVal &&
      (row.location || '').toUpperCase().trim() === locVal
    );
    return Array.from(new Set(matches.map(m => m.batch))).sort();
  };

  // Load counts matching selected batch
  useEffect(() => {
    const fetchCounts = async () => {
      if (!batchNumber) {
        setCountsList([]);
        return;
      }
      try {
        const res = await fetch(`/processing/soaking/get_count/${encodeURIComponent(batchNumber)}`);
        if (res.ok) {
          const data = await res.json();
          setCountsList(Array.from(new Set(data.counts)).sort());
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchCounts();
  }, [batchNumber]);

  // Load available qty
  useEffect(() => {
    const fetchAvailable = async () => {
      if (!productionAt || !batchNumber || !inCount || !varietyName || !speciesName) {
        setFloorAvail(0);
        return;
      }
      try {
        const params = new URLSearchParams({
          location: productionAt,
          batch: batchNumber,
          count: inCount,
          species: speciesName,
          variety: varietyName
        });
        const res = await fetch(`/processing/soaking/get_available_qty?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setFloorAvail(parseFloat(data.available_qty) || 0);
        }
      } catch (err) {
        console.error(err);
      }
    };
    fetchAvailable();
  }, [productionAt, batchNumber, inCount, varietyName, speciesName]);

  // Sintex numbers and reject validations trigger
  useEffect(() => {
    const qty = parseFloat(inQty) || 0;
    const rej = parseFloat(rejectionQty) || 0;

    if (qty > 0) {
      setRejectionQty('0');
      setRejectionFor('');
      setSintexNumber('AUTO');
    } else if (rej > 0) {
      setSintexNumber('');
    } else {
      setSintexNumber('AUTO');
    }
  }, [inQty, rejectionQty]);

  // Calculations for chemical and salt
  useEffect(() => {
    const qty = parseFloat(inQty) || 0;
    const chemP = parseFloat(chemicalPercent) || 0;
    const saltP = parseFloat(saltPercent) || 0;

    setChemCalc((qty * chemP / 100).toFixed(2));
    setSaltCalc((qty * saltP / 100).toFixed(2));
  }, [inQty, chemicalPercent, saltPercent]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const qty = parseFloat(inQty) || 0;
    const rej = parseFloat(rejectionQty) || 0;

    if (qty <= 0 && rej <= 0) {
      alert('Please enter either Input Qty or Rejection Qty!');
      return;
    }
    if (qty > (floorAvail + 0.05)) {
      alert(`Input Qty (${qty.toFixed(2)}) exceeds available stock (${floorAvail.toFixed(2)})!`);
      return;
    }
    if (rej > 0 && qty <= 0 && !rejectionFor) {
      alert('Please select "Rejection For" variety to continue.');
      return;
    }

    setLoading(true);
    const formData = new URLSearchParams();
    formData.append('sintex_number', sintexNumber);
    formData.append('production_for', productionFor);
    formData.append('production_at', productionAt);
    formData.append('batch_number', batchNumber);
    formData.append('in_count', inCount);
    formData.append('variety_name', varietyName);
    formData.append('species_name', speciesName);
    formData.append('in_qty', String(qty));
    formData.append('chemical_name', chemicalName);
    formData.append('chemical_percent', String(chemicalPercent));
    formData.append('salt_percent', String(saltPercent));
    formData.append('rejection_qty', String(rej));
    formData.append('rejection_for', rejectionFor);

    try {
      const res = await fetch('/processing/soaking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });

      if (res.ok) {
        alert('Soaking entry saved successfully!');
        closeModal();
        await fetchBackendData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to save soaking entry');
      }
    } catch (err) {
      alert('Connection error saving Soaking entry');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this soaking entry? This will reverse floor balance changes.')) {
      setLoading(true);
      try {
        const res = await fetch(`/processing/soaking/delete/${id}`, {
          method: 'POST',
        });
        if (res.ok) {
          alert('Soaking entry deleted');
          setSelectedId(null);
          await fetchBackendData();
        } else {
          alert('Deletion rejected');
        }
      } catch (err) {
        alert('Connection error deleting soaking record');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setProductionFor('');
    setProductionAt('');
    setBatchNumber('');
    setInCount('');
    setVarietyName('');
    setSpeciesName('');
    setInQty('0');
    setChemicalName('');
    setChemicalPercent('0');
    setSaltPercent('0');
    setRejectionQty('0');
    setRejectionFor('');
    setFloorAvail(0);
    setSelectedId(null);
  };

  // Get filtered data and tree structures
  const getFilteredData = () => {
    let filteredFloor = [];
    let totalsFloorVal = 0;
    let distribution = {}; // variety -> quantity

    floorBalanceRows.forEach(row => {
      if (row.available_qty <= 0.01) return;
      const compMatch = !filterCompany || (row.production_for || '').toUpperCase() === filterCompany.toUpperCase();
      const varMatch = !filterVariety || (row.variety || '').toUpperCase() === filterVariety.toUpperCase();
      const countMatch = !filterCount || String(row.count).toUpperCase() === filterCount.toUpperCase();
      const batchMatch = !filterBatchSearch || (row.batch || '').toUpperCase().includes(filterBatchSearch.toUpperCase());

      if (compMatch && varMatch && countMatch && batchMatch) {
        filteredFloor.push(row);
        totalsFloorVal += parseFloat(row.available_qty) || 0;
        distribution[row.variety] = (distribution[row.variety] || 0) + parseFloat(row.available_qty);
      }
    });

    // Build hierarchy Company -> Location -> Rows
    let hierarchy = {};
    filteredFloor.forEach(row => {
      const comp = row.production_for || 'General Stock';
      const loc = row.location || 'Purchased Stock';
      const qty = parseFloat(row.available_qty) || 0;

      if (!hierarchy[comp]) hierarchy[comp] = { total: 0, locations: {} };
      if (!hierarchy[comp].locations[loc]) hierarchy[comp].locations[loc] = { total: 0, items: [] };

      hierarchy[comp].total += qty;
      hierarchy[comp].locations[loc].total += qty;
      hierarchy[comp].locations[loc].items.push(row);
    });

    // Today Soaking Summary aggregates
    let soakedGroup = {};
    const filteredToday = todayEntries.filter(row => {
      const compMatch = !filterCompany || (row.production_for || '').toUpperCase() === filterCompany.toUpperCase();
      const varMatch = !filterVariety || (row.variety_name || '').toUpperCase() === filterVariety.toUpperCase();
      const countMatch = !filterCount || String(row.in_count).toUpperCase() === filterCount.toUpperCase();
      const batchMatch = !filterBatchSearch || (row.batch_number || '').toUpperCase().includes(filterBatchSearch.toUpperCase());
      return compMatch && varMatch && countMatch && batchMatch;
    });

    filteredToday.forEach(r => {
      const key = `${r.batch_number} | ${r.variety_name} | ${r.species} | ${r.in_count}`;
      const qty = parseFloat(r.in_qty) || 0;
      const rej = parseFloat(r.rejection_qty) || 0;
      soakedGroup[key] = (soakedGroup[key] || 0) + qty - rej;
    });

    return {
      hierarchy,
      grandTotal: totalsFloorVal,
      distributionList: Object.entries(distribution).sort((a,b)=>b[1]-a[1]),
      todaySummary: Object.entries(soakedGroup).sort((a,b)=>a[0].localeCompare(b[0])),
      logsList: filteredToday
    };
  };

  const { hierarchy, grandTotal, distributionList, todaySummary, logsList } = getFilteredData();

  // Helper values for distribution color
  const getVarietyColor = (index) => {
    const colors = ['#1e3a8a', '#2563eb', '#10b981', '#f59e0b', '#64748b', '#8b5cf6'];
    return colors[index % colors.length];
  };

  const resetFilters = () => {
    setFilterCompany('');
    setFilterVariety('');
    setFilterCount('');
    setFilterBatchSearch('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto', gap: '16px', padding: '16px 16px 80px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
        <h2 style={{ color: 'var(--corp-dash)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <Droplet /> Soaking Operations Dashboard
        </h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div className="grand-total" style={{ background: 'var(--corp-dash)', color: '#fff', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: '800' }}>
            FLOOR BALANCE: {grandTotal.toFixed(2)} KG
          </div>
          <button 
            onClick={fetchBackendData} 
            className="btn btn-clear" 
            style={{ minWidth: 'auto', display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px' }}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spin-animation' : ''} /> Refresh
          </button>
        </div>
      </div>

      {/* Top Filters Bar */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '15px', flexShrink: 0 }} className="card">
        <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)' }}>FILTERS:</div>
        <select 
          className="form-control" 
          value={filterCompany} 
          onChange={e => setFilterCompany(e.target.value)} 
          style={{ maxWidth: '180px', height: '34px', fontSize: '11px' }}
        >
          <option value="">All Companies</option>
          {prodForList.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select 
          className="form-control" 
          value={filterVariety} 
          onChange={e => setFilterVariety(e.target.value)} 
          style={{ maxWidth: '180px', height: '34px', fontSize: '11px' }}
        >
          <option value="">All Varieties</option>
          {varietiesList.map(v => <option key={v} value={v}>{v}</option>)}
        </select>

        <select 
          className="form-control" 
          value={filterCount} 
          onChange={e => setFilterCount(e.target.value)} 
          style={{ maxWidth: '130px', height: '34px', fontSize: '11px' }}
        >
          <option value="">All Counts</option>
          {Array.from(new Set(floorBalanceRows.map(r => r.count))).sort().map(cnt => <option key={cnt} value={cnt}>{cnt}</option>)}
        </select>

        <input 
          type="text" 
          className="form-control" 
          placeholder="Batch Search..." 
          value={filterBatchSearch} 
          onChange={e => setFilterBatchSearch(e.target.value)} 
          style={{ maxWidth: '180px', height: '34px', fontSize: '11px' }}
        />

        <button onClick={resetFilters} className="btn btn-clear" style={{ padding: '0 16px', height: '34px', minWidth: 'auto' }}>
          Clear
        </button>
      </div>

      {/* Aggregate Panels Row */}
      {!showModal && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr', gap: '16px', marginBottom: '25px', flexShrink: 0 }}>
          {/* Floor Balance Hierarchical Tree */}
          <div className="card" style={{ padding: '0px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border-light)', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--corp-dash)' }}>
              Floor Balance
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '250px', padding: '8px' }}>
              {Object.keys(hierarchy).length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)' }}>No available floor balance rows.</div>
              ) : (
                Object.keys(hierarchy).sort().map(comp => {
                  const isCompCollapsed = collapsedComps[comp];
                  return (
                    <div key={comp} style={{ marginBottom: '8px' }}>
                      <div 
                        onClick={() => setCollapsedComps(prev => ({ ...prev, [comp]: !prev[comp] }))}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: '750', fontSize: '12px', color: 'var(--corp-dash)', padding: '4px' }}
                      >
                        {isCompCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        <span>{comp}</span>
                        <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-secondary)' }}>{hierarchy[comp].total.toFixed(2)} KG</span>
                      </div>

                      {!isCompCollapsed && (
                        <div style={{ paddingLeft: '12px' }}>
                          {Object.keys(hierarchy[comp].locations).sort().map(loc => {
                            const isLocCollapsed = collapsedLocs[`${comp}|${loc}`];
                            return (
                              <div key={loc} style={{ marginTop: '4px' }}>
                                <div 
                                  onClick={() => setCollapsedLocs(prev => ({ ...prev, [`${comp}|${loc}`]: !prev[`${comp}|${loc}`] }))}
                                  style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '11px', color: 'var(--text-primary)', padding: '3px' }}
                                >
                                  {isLocCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                  <span>{loc}</span>
                                  <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-secondary)' }}>{hierarchy[comp].locations[loc].total.toFixed(2)} KG</span>
                                </div>

                                {!isLocCollapsed && (
                                  <div style={{ paddingLeft: '16px', marginTop: '2px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                                      <tbody>
                                        {hierarchy[comp].locations[loc].items.map((i, idx) => (
                                          <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                            <td style={{ padding: '3px 0', color: 'var(--text-secondary)' }}>{i.batch} | {i.species}</td>
                                            <td style={{ padding: '3px 0', textAlign: 'center' }}>{i.variety}</td>
                                            <td style={{ padding: '3px 0', textAlign: 'center' }}>{i.count}</td>
                                            <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: '750', color: 'var(--corp-dash)' }}>{i.available_qty.toFixed(2)} KG</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Distribution Stacked / Grid bars */}
          <div className="card" style={{ padding: '0px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border-light)', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--corp-dash)' }}>
              Variety Distribution
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '250px', padding: '12px' }}>
              {distributionList.length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)' }}>No distribution records.</div>
              ) : (
                distributionList.map(([varietyKey, qty], idx) => {
                  const pct = grandTotal > 0 ? (qty / grandTotal) * 100 : 0;
                  return (
                    <div key={varietyKey} style={{ marginBottom: '10px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontWeight: '700', marginBottom: '2px' }}>
                        <span>{varietyKey}</span>
                        <span>{qty.toFixed(2)} KG ({pct.toFixed(1)}%)</span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: getVarietyColor(idx) }} />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Today Soaking Summary aggregates */}
          <div className="card" style={{ padding: '0px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border-light)', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--corp-dash)' }}>
              Today Soaked Summaries
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '250px', padding: '8px' }}>
              <table className="bknr-table" style={{ fontSize: '11px' }}>
                <thead>
                  <tr>
                    <th>Batch | Var | Spec | Cnt</th>
                    <th className="text-right">Net KG</th>
                  </tr>
                </thead>
                <tbody>
                  {todaySummary.length === 0 ? (
                    <tr><td colSpan="2" className="text-center" style={{ color: 'var(--text-secondary)', padding: '12px' }}>No entries soaked today</td></tr>
                  ) : (
                    todaySummary.map(([key, val]) => (
                      <tr key={key}>
                        <td className="text-left" style={{ color: 'var(--text-secondary)' }}>{key}</td>
                        <td className="text-right" style={{ fontWeight: '800', color: 'var(--corp-dash)' }}>{val.toFixed(2)} KG</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Table Header and Add new Entry */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexShrink: 0 }}>
        <h3 style={{ fontSize: '13px', fontWeight: '800', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Recent Soaking Logs
        </h3>
        <button onClick={() => setShowModal(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={14} /> New Soaking Entry
        </button>
      </div>

      {/* Table Logs */}
      <div className="table-responsive" style={{ flexShrink: 0 }}>
        <table className="bknr-table" style={{ minWidth: '1700px' }}>
          <thead>
            <tr>
              <th className="text-center" style={{ width: '80px' }}>Sintex</th>
              <th className="text-center" style={{ width: '120px' }}>Batch</th>
              <th className="text-left" style={{ width: '140px' }}>Company</th>
              <th className="text-center" style={{ width: '90px' }}>Count</th>
              <th className="text-left" style={{ width: '120px' }}>Variety</th>
              <th className="text-left" style={{ width: '130px' }}>Location</th>
              <th className="text-left" style={{ width: '120px' }}>Species</th>
              <th className="text-right" style={{ width: '100px' }}>Input Qty</th>
              <th className="text-left" style={{ width: '130px' }}>Chemical</th>
              <th className="text-right" style={{ width: '90px' }}>Chem %</th>
              <th className="text-right" style={{ width: '100px' }}>Chem Qty</th>
              <th className="text-right" style={{ width: '90px' }}>Salt %</th>
              <th className="text-right" style={{ width: '100px' }}>Salt Qty</th>
              <th className="text-right" style={{ width: '100px' }}>Rej Qty</th>
              <th className="text-left" style={{ width: '120px' }}>Rej For</th>
              <th className="text-center" style={{ width: '90px' }}>Time</th>
              <th className="text-center" style={{ width: '90px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {logsList.length === 0 ? (
              <tr>
                <td colSpan="17" className="text-center" style={{ color: 'var(--text-secondary)', padding: '20px' }}>
                  No soaking logs logged today.
                </td>
              </tr>
            ) : (
              logsList.map(row => {
                const chemWeight = (row.in_qty * row.chemical_percent / 100);
                const saltWeight = (row.in_qty * row.salt_percent / 100);
                return (
                  <tr 
                    key={row.id} 
                    className={selectedId === row.id ? 'selected' : ''}
                    onClick={() => setSelectedId(row.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="text-center" style={{ fontWeight: '800', color: 'var(--corp-dash)' }}>{row.sintex_number || '-'}</td>
                    <td className="text-center" style={{ fontWeight: '700', color: 'var(--corp-dash)' }}>{row.batch_number}</td>
                    <td className="text-left">{row.production_for}</td>
                    <td className="text-center" style={{ color: 'var(--corp-dash)', fontWeight: '800' }}>{row.in_count}</td>
                    <td className="text-left">{row.variety_name}</td>
                    <td className="text-left">{row.production_at}</td>
                    <td className="text-left">{row.species}</td>
                    <td className="text-right" style={{ fontWeight: '800' }}>{row.in_qty.toFixed(2)} KG</td>
                    <td className="text-left">{row.chemical_name}</td>
                    <td className="text-right">{row.chemical_percent.toFixed(2)}%</td>
                    <td className="text-right" style={{ color: 'var(--corp-dash)', fontWeight: '700' }}>{chemWeight.toFixed(2)}</td>
                    <td className="text-right">{row.salt_percent.toFixed(2)}%</td>
                    <td className="text-right" style={{ color: 'var(--corp-dash)', fontWeight: '700' }}>{saltWeight.toFixed(2)}</td>
                    <td className="text-right" style={{ color: '#64748b', fontWeight: '850' }}>{row.rejection_qty.toFixed(2)}</td>
                    <td className="text-left" style={{ fontSize: '9px' }}>{row.rejection_for || '-'}</td>
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
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Entry Modal Panel */}
      {showModal && (
        <div style={modalOverlayStyle} onClick={closeModal}>
          <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px', marginBottom: '16px', alignItems: 'center' }}>
              <h3 style={{ margin: 0, textTransform: 'uppercase', fontSize: '13px', fontWeight: '800', color: 'var(--corp-dash)' }}>
                New Soaking Entry
              </h3>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-secondary)' }}>&times;</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Sintex</label>
                  <input type="text" className="form-control" value={sintexNumber} readonly placeholder="Auto Generated" style={{ background: 'rgba(255,255,255,0.02)', fontWeight: '800' }} />
                </div>

                <div className="form-group">
                  <label>Production For *</label>
                  <select 
                    className="form-control" 
                    value={productionFor} 
                    onChange={e => {
                      setProductionFor(e.target.value);
                      setBatchNumber('');
                      setInCount('');
                      setSpeciesName('');
                    }} 
                    required
                  >
                    <option value="">Select Company</option>
                    {prodForList.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Location (Processing At) *</label>
                  <select 
                    className="form-control" 
                    value={productionAt} 
                    onChange={e => {
                      setProductionAt(e.target.value);
                      setBatchNumber('');
                      setInCount('');
                      setSpeciesName('');
                    }} 
                    required
                  >
                    <option value="">Select Location</option>
                    {peelingLocations.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Batch *</label>
                  <select 
                    className="form-control" 
                    value={batchNumber} 
                    onChange={e => {
                      setBatchNumber(e.target.value);
                      setInCount('');
                      setSpeciesName('');
                    }} 
                    required
                  >
                    <option value="">Select Batch</option>
                    {getFilteredBatches().map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Count *</label>
                  <select 
                    className="form-control" 
                    value={inCount} 
                    onChange={e => setInCount(e.target.value)} 
                    required
                  >
                    <option value="">Select Count</option>
                    {countsList.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
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
                    {varietiesList.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Species *</label>
                  <select 
                    className="form-control" 
                    value={speciesName} 
                    onChange={e => setSpeciesName(e.target.value)} 
                    required
                  >
                    <option value="">Select Species</option>
                    {speciesList.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Input Qty (KG)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    className="form-control" 
                    value={inQty} 
                    onChange={e => setInQty(e.target.value)} 
                    placeholder="Enter input Qty" 
                  />
                  <span style={{ fontSize: '10px', color: 'var(--corp-dash)', fontWeight: '700', marginTop: '2px', display: 'block' }}>
                    Available stock: <strong>{floorAvail.toFixed(2)} KG</strong>
                  </span>
                </div>

                <div className="form-group">
                  <label>Chemical *</label>
                  <select 
                    className="form-control" 
                    value={chemicalName} 
                    onChange={e => setChemicalName(e.target.value)} 
                    required
                  >
                    <option value="">Select Chemical</option>
                    {chemicalsList.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Chem % *</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    className="form-control" 
                    value={chemicalPercent} 
                    onChange={e => setChemicalPercent(e.target.value)} 
                    placeholder="0.00" 
                    required 
                  />
                </div>

                <div className="form-group">
                  <label>Salt % *</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    className="form-control" 
                    value={saltPercent} 
                    onChange={e => setSaltPercent(e.target.value)} 
                    placeholder="0.00" 
                    required 
                  />
                </div>

                <div className="form-group">
                  <label>Rejection Qty</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    className="form-control" 
                    value={rejectionQty} 
                    onChange={e => setRejectionQty(e.target.value)} 
                    placeholder="0.00" 
                  />
                </div>

                <div className="form-group">
                  <label>Rejection For</label>
                  <select 
                    className="form-control" 
                    value={rejectionFor} 
                    onChange={e => setRejectionFor(e.target.value)} 
                    disabled={parseFloat(rejectionQty) <= 0}
                    required={parseFloat(rejectionQty) > 0}
                  >
                    <option value="">Select Variety</option>
                    {varietiesList.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Chemical Calc (KG)</label>
                  <input type="text" className="form-control" value={chemCalc} readonly style={{ background: 'rgba(255,255,255,0.02)' }} />
                </div>

                <div className="form-group">
                  <label>Salt Calc (KG)</label>
                  <input type="text" className="form-control" value={saltCalc} readonly style={{ background: 'rgba(255,255,255,0.02)' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px', borderTop: '1px solid var(--border-light)', paddingTop: '15px' }}>
                <button type="button" className="btn btn-clear" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>Save Entry</button>
              </div>
            </form>
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
