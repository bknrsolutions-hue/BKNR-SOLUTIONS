import React, { useState, useEffect, useRef } from 'react';
import { Scissors, Plus, Trash2, Calendar, Clock, Mail, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';

export default function DeHeading() {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Form states
  const [productionFor, setProductionFor] = useState('');
  const [deheadingAt, setDeheadingAt] = useState('');
  const [species, setSpecies] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [hosoCount, setHosoCount] = useState('');
  const [hosoQty, setHosoQty] = useState('');
  const [hlsoQty, setHlsoQty] = useState('');
  const [yieldPercent, setYieldPercent] = useState('0.00');
  const [contractor, setContractor] = useState('');
  const [ratePerKg, setRatePerKg] = useState(0);
  const [amount, setAmount] = useState('0.00');
  const [floorAvail, setFloorAvail] = useState(0);

  // Filter states
  const [filterCompany, setFilterCompany] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterSpecies, setFilterSpecies] = useState('');

  // Dropdowns & Master lists
  const [contractorsList, setContractorsList] = useState([]);
  const [speciesList, setSpeciesList] = useState([]);
  const [peelingLocations, setPeelingLocations] = useState([]);
  const [prodForList, setProdForList] = useState([]);
  const [todayEntries, setTodayEntries] = useState([]);
  const [hosoFloorBalance, setHosoFloorBalance] = useState([]);
  
  // Cascaded lists
  const [batchesList, setBatchesList] = useState([]);
  const [countsList, setCountsList] = useState([]);

  // Selected row
  const [selectedId, setSelectedId] = useState(null);

  // Tree collapse state
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

      const res = await fetch(`/processing/de_heading?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setContractorsList(data.contractors || []);
        setSpeciesList(data.species || []);
        setPeelingLocations(data.peeling_locations || []);
        setProdForList(data.prod_for_list || []);
        setTodayEntries(data.today_data || []);
        setHosoFloorBalance(data.hoso_floor_balance || []);

        if (data.selected_production_for) setProductionFor(data.selected_production_for);
        if (data.selected_location) setDeheadingAt(data.selected_location);
      } else {
        console.error('Failed to fetch De-heading data');
      }
    } catch (err) {
      console.error('Error fetching De-heading data:', err);
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

  // Cascading lists load
  useEffect(() => {
    const loadBatches = async () => {
      if (!productionFor || !deheadingAt) {
        setBatchesList([]);
        return;
      }
      try {
        const res = await fetch(`/processing/get_valid_batches/${encodeURIComponent(productionFor)}/${encodeURIComponent(deheadingAt)}`);
        if (res.ok) {
          const data = await res.json();
          setBatchesList(data.batches || []);
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadBatches();
  }, [productionFor, deheadingAt]);

  useEffect(() => {
    const loadCounts = async () => {
      if (!productionFor || !deheadingAt || !batchNumber) {
        setCountsList([]);
        return;
      }
      try {
        const res = await fetch(`/processing/get_hoso/${encodeURIComponent(productionFor)}/${encodeURIComponent(deheadingAt)}/${encodeURIComponent(batchNumber)}`);
        if (res.ok) {
          const data = await res.json();
          setCountsList(data.counts || []);
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadCounts();
  }, [productionFor, deheadingAt, batchNumber]);

  // Check Floor Quantity
  useEffect(() => {
    const checkFloor = async () => {
      if (!deheadingAt || !batchNumber || !hosoCount || !species) {
        setFloorAvail(0);
        return;
      }
      try {
        const params = new URLSearchParams({ 
          location: deheadingAt, 
          production_for: productionFor,
          batch: batchNumber, 
          count: hosoCount, 
          species_name: species 
        });
        const res = await fetch(`/processing/get_available_qty?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setFloorAvail(data.available_qty || 0);
        }
      } catch (err) {
        console.error(err);
      }
    };
    checkFloor();
  }, [productionFor, deheadingAt, batchNumber, hosoCount, species]);

  // Fetch Contractor Rate
  useEffect(() => {
    const getRate = async () => {
      if (!contractor) {
        setRatePerKg(0);
        return;
      }
      try {
        const res = await fetch(`/processing/get_rate/${encodeURIComponent(contractor)}`);
        if (res.ok) {
          const data = await res.json();
          setRatePerKg(data.rate || 0);
        }
      } catch (err) {
        console.error(err);
      }
    };
    getRate();
  }, [contractor]);

  // Auto Calculations
  useEffect(() => {
    const h = parseFloat(hosoQty) || 0;
    const l = parseFloat(hlsoQty) || 0;
    const yld = h > 0 ? (l / h) * 100 : 0;
    const amt = l * ratePerKg;

    setYieldPercent(yld.toFixed(2));
    setAmount(amt.toFixed(2));
  }, [hosoQty, hlsoQty, ratePerKg]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const reqQty = parseFloat(hosoQty) || 0;
    if (reqQty <= 0) {
      alert('Please enter a valid HOSO Quantity');
      return;
    }
    if (reqQty > (floorAvail + 0.1)) {
      alert(`Quantity exceeds floor balance! (Available: ${floorAvail})`);
      return;
    }

    setLoading(true);
    const formData = new URLSearchParams();
    formData.append('production_for', productionFor);
    formData.append('deheading_at', deheadingAt);
    formData.append('batch_number', batchNumber);
    formData.append('hoso_count', hosoCount);
    formData.append('species', species);
    formData.append('hoso_qty', String(hosoQty));
    formData.append('hlso_qty', String(hlsoQty));
    formData.append('yield_percent', yieldPercent + '%');
    formData.append('contractor', contractor);
    formData.append('rate_per_kg', String(ratePerKg));
    formData.append('amount', String(amount));

    try {
      const res = await fetch('/processing/de_heading', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });

      if (res.ok) {
        alert('De-Heading Entry Saved Successfully!');
        setShowModal(false);
        // Reset form fields
        setBatchNumber('');
        setHosoCount('');
        setHosoQty('');
        setHlsoQty('');
        setContractor('');
        setRatePerKg(0);
        setFloorAvail(0);
        await fetchBackendData();
      } else {
        const errData = await res.json();
        alert(errData.detail || 'Save failed');
      }
    } catch (err) {
      alert('Connection error saving De-Heading record');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setBatchNumber('');
    setHosoCount('');
    setHosoQty('');
    setHlsoQty('');
    setContractor('');
    setRatePerKg(0);
    setFloorAvail(0);
  };

  const handleDelete = async (id) => {
    const reason = window.prompt('Are you sure you want to cancel this de-heading entry? Please enter a cancellation reason:');
    if (reason === null) return;
    if (!reason.trim()) {
      alert('Cancellation reason is required!');
      return;
    }
    setLoading(true);
    try {
      const formData = new URLSearchParams();
      formData.append('cancel_reason', reason.trim());
      const res = await fetch(`/processing/de_heading/delete/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });
      if (res.ok) {
        alert('De-Heading Cancelled Successfully');
        setSelectedId(null);
        await fetchBackendData();
      } else {
        const data = await res.json();
        alert(data.error || 'Cancellation failed');
      }
    } catch (err) {
      alert('Connection error cancelling De-Heading record');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Helper colors for chart locations
  const getLocationColor = (loc) => {
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#64748b', '#8b5cf6', '#ec4899', '#06b6d4'];
    let hash = 0;
    for (let i = 0; i < loc.length; i++) { hash = loc.charCodeAt(i) + ((hash << 5) - hash); }
    return colors[Math.abs(hash) % colors.length];
  };

  // Live calculation & filtering of Floor Balance Dashboard
  const getProcessedFloorData = () => {
    let filteredList = [];
    let totals = 0;
    let countsSet = new Set();
    let batchesSet = new Set();
    let chartMap = {}; // count -> { location -> qty }

    hosoFloorBalance.forEach(item => {
      const comp = item.production_for || 'General Stock';
      const loc = item.peeling_at || 'Purchased Stock';
      const sp = item.species || '';
      const qty = parseFloat(item.available_qty) || 0;
      const countVal = item.count || 'Unknown';

      // Filters
      if (filterCompany && comp.toUpperCase() !== filterCompany.toUpperCase()) return;
      if (filterLocation && !loc.toUpperCase().includes(filterLocation.toUpperCase())) return;
      if (filterSpecies && sp.toUpperCase() !== filterSpecies.toUpperCase()) return;

      filteredList.push(item);
      totals += qty;
      countsSet.add(countVal);
      batchesSet.add(item.batch);

      if (!chartMap[countVal]) chartMap[countVal] = {};
      chartMap[countVal][loc] = (chartMap[countVal][loc] || 0) + qty;
    });

    // Structure list hierarchically
    let hierarchy = {};
    filteredList.forEach(item => {
      const comp = item.production_for || 'General Stock';
      const loc = item.peeling_at || 'Purchased Stock';
      const qty = parseFloat(item.available_qty) || 0;

      if (!hierarchy[comp]) hierarchy[comp] = { total: 0, locations: {} };
      if (!hierarchy[comp].locations[loc]) hierarchy[comp].locations[loc] = { total: 0, items: [] };

      hierarchy[comp].total += qty;
      hierarchy[comp].locations[loc].total += qty;
      hierarchy[comp].locations[loc].items.push(item);
    });

    return {
      hierarchy,
      grandTotal: totals,
      uniqueBatches: batchesSet.size,
      uniqueCounts: countsSet.size,
      chartMap
    };
  };

  const { hierarchy, grandTotal, uniqueBatches, uniqueCounts, chartMap } = getProcessedFloorData();

  // Subtotal grouping for today's log entries
  const getSubtotaledEntries = () => {
    let grouped = {};
    todayEntries.forEach(r => {
      const loc = r.peeling_at || 'Unknown';
      if (!grouped[loc]) grouped[loc] = [];
      grouped[loc].push(r);
    });
    return grouped;
  };

  const groupedEntries = getSubtotaledEntries();

  // Rendering custom horizontal stacked bar chart
  const renderCustomBarChart = () => {
    const sortedCounts = Object.keys(chartMap).sort();
    if (sortedCounts.length === 0) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', fontSize: '11px' }}>
          No data matches selected filters.
        </div>
      );
    }

    // Find maximum count total to scale the width
    let maxTotal = 0;
    sortedCounts.forEach(c => {
      const cTot = Object.values(chartMap[c]).reduce((a, b) => a + b, 0);
      if (cTot > maxTotal) maxTotal = cTot;
    });

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '10px' }}>
        {sortedCounts.map(cnt => {
          const locsQty = chartMap[cnt];
          const countTotal = Object.values(locsQty).reduce((a, b) => a + b, 0);

          return (
            <div key={cnt} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '60px', fontSize: '11px', fontWeight: '800', textAlign: 'right', whiteSpace: 'nowrap' }}>{cnt}</div>
              <div style={{ flex: 1, display: 'flex', height: '16px', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', overflow: 'hidden' }}>
                {Object.entries(locsQty).map(([loc, qty]) => {
                  const widthPct = (qty / maxTotal) * 100;
                  if (widthPct <= 0) return null;
                  return (
                    <div 
                      key={loc} 
                      style={{ 
                        width: `${widthPct}%`, 
                        background: getLocationColor(loc),
                        height: '100%' 
                      }} 
                      title={`${loc}: ${qty.toFixed(2)} Kg`}
                    />
                  );
                })}
              </div>
              <div style={{ width: '70px', fontSize: '11px', fontWeight: '700', color: 'var(--text-secondary)' }}>
                {countTotal.toFixed(2)} Kg
              </div>
            </div>
          );
        })}

        {/* Legend */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '10px', justifyContent: 'center' }}>
          {Array.from(new Set(hosoFloorBalance.map(i => i.peeling_at || 'Purchased Stock'))).map(loc => (
            <div key={loc} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: getLocationColor(loc) }} />
              <span style={{ color: 'var(--text-secondary)' }}>{loc}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto', gap: '16px', padding: '16px 16px 80px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
        <h2 style={{ color: 'var(--corp-dash)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <Scissors /> De-Heading Operations Dashboard
        </h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div className="grand-total" style={{ background: 'var(--corp-dash)', color: '#fff', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: '800' }}>
            TOTAL FLOOR: {grandTotal.toFixed(2)} KG
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

      {/* Filters Bar */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '15px', flexShrink: 0 }} className="card">
        <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-secondary)' }}>FILTERS:</div>
        <input 
          type="text" 
          className="form-control" 
          placeholder="Search Company..." 
          value={filterCompany} 
          onChange={e => setFilterCompany(e.target.value)} 
          list="filter-companies"
          style={{ maxWidth: '180px', height: '32px', fontSize: '11px' }}
        />
        <datalist id="filter-companies">
          {prodForList.map(c => <option key={c} value={c} />)}
        </datalist>
        <input 
          type="text" 
          className="form-control" 
          placeholder="Search Location..." 
          value={filterLocation} 
          onChange={e => setFilterLocation(e.target.value)} 
          list="filter-locations"
          style={{ maxWidth: '180px', height: '32px', fontSize: '11px' }}
        />
        <datalist id="filter-locations">
          {peelingLocations.map(l => <option key={l} value={l} />)}
        </datalist>
        <input 
          type="text" 
          className="form-control" 
          placeholder="Search Species..." 
          value={filterSpecies} 
          onChange={e => setFilterSpecies(e.target.value)} 
          list="filter-species"
          style={{ maxWidth: '180px', height: '32px', fontSize: '11px' }}
        />
        <datalist id="filter-species">
          {speciesList.map(s => <option key={s} value={s} />)}
        </datalist>
      </div>

      {/* Main Grid Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '16px', marginBottom: '25px', flexShrink: 0 }}>
        {/* HOSO Floor Balance Tree Panel */}
        <div className="card" style={{ padding: '0px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border-light)', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--corp-dash)' }}>
            HOSO Floor Balance
          </div>
          <div style={{ overflowY: 'auto', maxHeight: '320px', padding: '8px' }}>
            {Object.keys(hierarchy).length === 0 ? (
              <div style={{ padding: '16px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)' }}>No available floor balance matching filters.</div>
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
                                          <td style={{ padding: '3px 0', color: 'var(--text-secondary)' }}>{i.species}</td>
                                          <td style={{ padding: '3px 0', textAlign: 'center', fontWeight: '700' }}>{i.batch} / {i.count}</td>
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

        {/* Live Stats Panel */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Filtered Batches</div>
          <div style={{ fontSize: '36px', fontWeight: '900', color: 'var(--corp-dash)', margin: '8px 0 20px 0' }}>{uniqueBatches}</div>
          <div style={{ width: '80%', height: '1px', background: 'var(--border-light)', marginBottom: '20px' }} />
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Unique Count Grades</div>
          <div style={{ fontSize: '36px', fontWeight: '900', color: 'var(--corp-dash)', marginTop: '8px' }}>{uniqueCounts}</div>
        </div>

        {/* Chart Panel */}
        <div className="card" style={{ padding: '0px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border-light)', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--corp-dash)' }}>
            Count-Wise Stacked Balance (KG)
          </div>
          <div style={{ flex: 1, padding: '10px', overflowY: 'auto' }}>
            {renderCustomBarChart()}
          </div>
        </div>
      </div>

      {/* Today's Log Entries Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexShrink: 0 }}>
        <h3 style={{ fontSize: '13px', fontWeight: '800', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Today's De-Heading Logs
        </h3>
        <button onClick={() => setShowModal(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={14} /> New De-Heading Entry
        </button>
      </div>

      {/* Logs Table */}
      <div className="table-responsive" style={{ flexShrink: 0 }}>
        <table className="bknr-table" id="mainTable" style={{ minWidth: '1200px' }}>
          <thead>
            <tr>
              <th className="text-left" style={{ width: '130px' }}>Location</th>
              <th className="text-left" style={{ width: '140px' }}>Production For</th>
              <th className="text-center" style={{ width: '150px' }}>Batch / Count</th>
              <th className="text-left" style={{ width: '130px' }}>Species</th>
              <th className="text-right" style={{ width: '110px' }}>HOSO (In)</th>
              <th className="text-right" style={{ width: '110px' }}>HLSO (Out)</th>
              <th className="text-center" style={{ width: '100px' }}>Yield %</th>
              <th className="text-left" style={{ width: '150px' }}>Contractor</th>
              <th className="text-right" style={{ width: '120px' }}>Amount</th>
              <th className="text-center" style={{ width: '100px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(groupedEntries).length === 0 ? (
              <tr>
                <td colSpan="10" className="text-center" style={{ color: 'var(--text-secondary)', padding: '20px' }}>
                  No de-heading logs recorded today.
                </td>
              </tr>
            ) : (
              Object.entries(groupedEntries).map(([loc, rows]) => {
                const subHoso = rows.reduce((acc, r) => acc + (r.is_cancelled ? 0 : (parseFloat(r.hoso_qty) || 0)), 0);
                const subHlso = rows.reduce((acc, r) => acc + (r.is_cancelled ? 0 : (parseFloat(r.hlso_qty) || 0)), 0);
                const subAmt = rows.reduce((acc, r) => acc + (r.is_cancelled ? 0 : (parseFloat(r.amount) || 0)), 0);

                return (
                  <React.Fragment key={loc}>
                    {rows.map(row => (
                      <tr 
                        key={row.id} 
                        className={`${selectedId === row.id ? 'selected-row' : ''} ${row.is_cancelled ? 'cancelled-row' : ''}`}
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
                        <td className="text-left">{row.peeling_at}</td>
                        <td className="text-left" style={{ fontWeight: '600', color: 'var(--corp-dash)' }}>{row.production_for}</td>
                        <td className="text-center">{row.batch_number} / {row.hoso_count}</td>
                        <td className="text-left">{row.species}</td>
                        <td className="text-right" style={{ fontWeight: '700', color: 'var(--corp-dash)' }}>{row.hoso_qty}</td>
                        <td className="text-right" style={{ fontWeight: '700' }}>{row.hlso_qty}</td>
                        <td className="text-center">{row.yield_percent}%</td>
                        <td className="text-left">{row.contractor}</td>
                        <td className="text-right" style={{ color: 'var(--corp-dash)', fontWeight: '700' }}>₹{row.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
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
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {/* Subtotal row */}
                    <tr style={{ background: 'rgba(255, 255, 255, 0.015)', fontWeight: 'bold' }}>
                      <td colSpan="4" className="text-right" style={{ paddingRight: '12px' }}>Subtotal ({loc}):</td>
                      <td className="text-right" style={{ color: 'var(--corp-dash)', fontWeight: '800' }}>{subHoso.toFixed(2)}</td>
                      <td className="text-right" style={{ fontWeight: '800' }}>{subHlso.toFixed(2)}</td>
                      <td colSpan="2"></td>
                      <td className="text-right" style={{ color: 'var(--corp-dash)', fontWeight: '800' }}>₹{subAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      <td></td>
                    </tr>
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Entry Modal Popup */}
      {showModal && (
        <div style={modalOverlayStyle} onClick={closeModal}>
          <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifySpace: 'space-between', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px', marginBottom: '16px', alignItems: 'center' }}>
              <h3 style={{ margin: 0, textTransform: 'uppercase', fontSize: '13px', fontWeight: '800', color: 'var(--corp-dash)' }}>
                De-Heading Entry Form
              </h3>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-secondary)' }}>&times;</button>
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
                    }} 
                    required
                  >
                    <option value="">Select Company</option>
                    {prodForList.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Location *</label>
                  <select 
                    className="form-control" 
                    value={deheadingAt} 
                    onChange={e => {
                      setDeheadingAt(e.target.value);
                      setBatchNumber('');
                      setHosoCount('');
                    }} 
                    required
                  >
                    <option value="">Select Location</option>
                    {peelingLocations.map(l => <option key={l} value={l}>{l}</option>)}
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
                    {speciesList.map(s => <option key={s} value={s}>{s}</option>)}
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
                    }} 
                    required
                  >
                    <option value="">Select Batch</option>
                    {batchesList.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>HOSO Count *</label>
                  <select 
                    className="form-control" 
                    value={hosoCount} 
                    onChange={e => setHosoCount(e.target.value)} 
                    required
                  >
                    <option value="">Select Count</option>
                    {countsList.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>HOSO Qty (In) *</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    className="form-control" 
                    value={hosoQty} 
                    onChange={e => setHosoQty(e.target.value)} 
                    placeholder="0.00" 
                    required 
                  />
                  <span style={{ fontSize: '10px', color: 'var(--corp-dash)', fontWeight: '700', marginTop: '2px', display: 'block' }}>
                    Floor Avail: <strong style={{ color: floorAvail > 0 ? 'var(--corp-dash)' : 'var(--text-secondary)' }}>{floorAvail.toFixed(2)} KG</strong>
                  </span>
                </div>

                <div className="form-group">
                  <label>HLSO Qty (Out) *</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    className="form-control" 
                    value={hlsoQty} 
                    onChange={e => setHlsoQty(e.target.value)} 
                    placeholder="0.00" 
                    required 
                  />
                </div>

                <div className="form-group">
                  <label>Yield %</label>
                  <input type="text" className="form-control" value={yieldPercent + '%'} readOnly style={{ background: 'rgba(255,255,255,0.02)', fontWeight: '800' }} />
                </div>

                <div className="form-group">
                  <label>Contractor *</label>
                  <select 
                    className="form-control" 
                    value={contractor} 
                    onChange={e => setContractor(e.target.value)} 
                    required
                  >
                    <option value="">Select Contractor</option>
                    {contractorsList.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Rate / Kg</label>
                  <input type="number" className="form-control" value={ratePerKg} readOnly style={{ background: 'rgba(255,255,255,0.02)' }} />
                </div>

                <div className="form-group">
                  <label>Total Amount (₹)</label>
                  <input type="text" className="form-control" value={amount} readOnly style={{ background: 'rgba(255,255,255,0.02)', color: 'var(--corp-dash)', fontWeight: '800', fontSize: '13px' }} />
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
  flexWrap: 'wrap'
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
