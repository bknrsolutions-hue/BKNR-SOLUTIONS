import React, { useState, useEffect } from 'react';
import { Layers, Plus, Trash2, Calendar, Clock, Mail, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';

export default function Peeling() {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Form inputs
  const [productionFor, setProductionFor] = useState('');
  const [locationVal, setLocationVal] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [inCount, setInCount] = useState('');
  const [species, setSpecies] = useState('');
  const [hlsoQty, setHlsoQty] = useState('');
  const [variety, setVariety] = useState('');
  const [peeledQty, setPeeledQty] = useState('');
  const [contractor, setContractor] = useState('');
  const [rate, setRate] = useState(0);
  const [yieldPercent, setYieldPercent] = useState('0.00');
  const [amount, setAmount] = useState('0.00');
  const [floorAvail, setFloorAvail] = useState(0);

  // Filters
  const [filterCompany, setFilterCompany] = useState('');
  const [filterLocation, setFilterLocation] = useState('');

  // Dropdown options & raw data sets
  const [prodForList, setProdForList] = useState([]);
  const [peelingLocations, setPeelingLocations] = useState([]);
  const [varietiesList, setVarietiesList] = useState([]);
  const [contractorsList, setContractorsList] = useState([]);
  const [hlsoFloorBalance, setHlsoFloorBalance] = useState([]);
  const [hlsoSummary, setHlsoSummary] = useState([]);
  const [varietySummary, setVarietySummary] = useState([]);
  const [drillDownData, setDrillDownData] = useState({});
  const [todayEntries, setTodayEntries] = useState([]);

  // Active Dashboard Tab
  const [activeTab, setActiveTab] = useState('otherFloor');

  // Selected row
  const [selectedId, setSelectedId] = useState(null);

  // Collapse states for tree
  const [collapsedComps, setCollapsedComps] = useState({});
  const [collapsedLocs, setCollapsedLocs] = useState({});
  const [expandedReqCount, setExpandedReqCount] = useState(null); // 'species|variety|count' string

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

      const res = await fetch(`/processing/peeling?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setProdForList(data.prod_for_list || []);
        setPeelingLocations(data.peeling_locations || []);
        setVarietiesList(data.varieties || []);
        setContractorsList(data.contractors || []);
        setHlsoFloorBalance(data.hlso_floor_balance || []);
        setHlsoSummary(data.hlso_summary || []);
        setVarietySummary(data.variety_summary || []);
        setDrillDownData(data.drill_down_json || {});
        setTodayEntries(data.today_data || []);

        if (data.selected_production_for) setFilterCompany(data.selected_production_for);
        if (data.selected_location) setFilterLocation(data.selected_location);

        if ((data.today_data || []).length === 0) {
          setShowModal(true);
        }
      } else {
        console.error('Failed to fetch Peeling data');
      }
    } catch (err) {
      console.error('Error fetching Peeling data:', err);
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
    if (!productionFor || !locationVal) return [];
    const compVal = productionFor.toUpperCase().trim();
    const locVal = locationVal.toUpperCase().trim();

    const matches = hlsoFloorBalance.filter(row => 
      (row.production_for || '').toUpperCase().trim() === compVal &&
      (row.location || '').toUpperCase().trim() === locVal
    );
    return Array.from(new Set(matches.map(m => m.batch))).sort();
  };

  const getFilteredCounts = () => {
    if (!productionFor || !locationVal || !batchNumber) return [];
    const compVal = productionFor.toUpperCase().trim();
    const locVal = locationVal.toUpperCase().trim();

    const matches = hlsoFloorBalance.filter(row => 
      row.batch === batchNumber &&
      (row.production_for || '').toUpperCase().trim() === compVal &&
      (row.location || '').toUpperCase().trim() === locVal
    );
    return Array.from(new Set(matches.map(m => m.count))).sort();
  };

  // Autoload Species & Available Floor stock from selected options
  useEffect(() => {
    if (productionFor && locationVal && batchNumber && inCount) {
      const compVal = productionFor.toUpperCase().trim();
      const locVal = locationVal.toUpperCase().trim();

      const match = hlsoFloorBalance.find(row => 
        row.batch === batchNumber &&
        String(row.count).trim() === String(inCount).trim() &&
        (row.production_for || '').toUpperCase().trim() === compVal &&
        (row.location || '').toUpperCase().trim() === locVal
      );
      if (match) {
        setSpecies(match.species || '');
        setFloorAvail(parseFloat(match.available_qty) || 0);
      } else {
        setSpecies('');
        setFloorAvail(0);
      }
    } else {
      setSpecies('');
      setFloorAvail(0);
    }
  }, [productionFor, locationVal, batchNumber, inCount, hlsoFloorBalance]);

  // Load Peeling Rate
  useEffect(() => {
    const fetchRate = async () => {
      if (!contractor || !variety) {
        setRate(0);
        return;
      }
      try {
        const params = new URLSearchParams({ contractor, variety });
        const res = await fetch(`/processing/peeling/get_rate?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setRate(data.rate || 0);
        }
      } catch (err) {
        console.error('Error fetching peeling rate:', err);
      }
    };
    fetchRate();
  }, [contractor, variety]);

  // Form Auto-calculations
  useEffect(() => {
    const h = parseFloat(hlsoQty) || 0;
    const p = parseFloat(peeledQty) || 0;
    const r = parseFloat(rate) || 0;

    const yld = h > 0 ? (p / h) * 100 : 0;
    const amt = p * r;

    setYieldPercent(yld.toFixed(2));
    setAmount(amt.toFixed(2));
  }, [hlsoQty, peeledQty, rate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const inputQty = parseFloat(hlsoQty) || 0;
    if (inputQty > (floorAvail + 0.1)) {
      alert(`Insufficient floor stock! (Available: ${floorAvail} KG)`);
      return;
    }

    setLoading(true);
    const formData = new URLSearchParams();
    formData.append('production_for', productionFor);
    formData.append('location', locationVal);
    formData.append('batch_number', batchNumber);
    formData.append('in_count', inCount);
    formData.append('species', species);
    formData.append('hlso_qty', String(hlsoQty));
    formData.append('variety', variety);
    formData.append('peeled_qty', String(peeledQty));
    formData.append('contractor_name', contractor);
    formData.append('rate', String(rate));
    formData.append('yield_percent', yieldPercent + '%');
    formData.append('amount', String(amount));

    try {
      const res = await fetch('/processing/peeling', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });

      if (res.ok) {
        alert('Peeling Job Saved Successfully!');
        setShowModal(false);
        // Clear form
        setBatchNumber('');
        setInCount('');
        setSpecies('');
        setHlsoQty('');
        setPeeledQty('');
        setContractor('');
        setRate(0);
        setFloorAvail(0);
        await fetchBackendData();
      } else {
        const errData = await res.json();
        alert(errData.error || 'Error saving peeling record');
      }
    } catch (err) {
      alert('Connection error saving peeling lot');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this peeling entry? This will reverse floor balance changes.')) {
      setLoading(true);
      try {
        const res = await fetch(`/processing/peeling/delete/${id}`, {
          method: 'POST',
        });
        if (res.ok) {
          alert('Peeling entry deleted');
          setSelectedId(null);
          await fetchBackendData();
        } else {
          alert('Deletion rejected');
        }
      } catch (err) {
        alert('Connection error deleting peeling record');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setProductionFor('');
    setLocationVal('');
    setBatchNumber('');
    setInCount('');
    setSpecies('');
    setHlsoQty('');
    setVariety('');
    setPeeledQty('');
    setContractor('');
    setRate(0);
    setFloorAvail(0);
    setSelectedId(null);
  };

  // Get filtered entries and tree hierarchies
  const getFilteredData = () => {
    let filteredFloor = [];
    let grandTotalVal = 0;
    
    hlsoFloorBalance.forEach(row => {
      const isHLSO = (row.variety || '').toUpperCase().includes('HLSO');
      if (!isHLSO) return;
      if (filterCompany && (row.production_for || '').toUpperCase() !== filterCompany.toUpperCase()) return;
      if (filterLocation && (row.location || '').toUpperCase() !== filterLocation.toUpperCase()) return;

      filteredFloor.push(row);
      grandTotalVal += parseFloat(row.available_qty) || 0;
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

    // Logs filtered on client
    const logs = todayEntries.filter(row => {
      const matchComp = !filterCompany || (row.production_for || '').toUpperCase() === filterCompany.toUpperCase();
      const matchLoc = !filterLocation || (row.peeling_at || '').toUpperCase() === filterLocation.toUpperCase();
      return matchComp && matchLoc;
    });

    // Calculate contractor summaries based on filtered logs
    let contractorMap = {};
    let dailySumMap = {};

    logs.forEach(r => {
      const cont = r.contractor_name || 'Unknown';
      const qty = parseFloat(r.peeled_qty) || 0;
      const amt = parseFloat(r.amount) || 0;
      const key = `${r.production_for} > ${r.peeling_at} > ${r.variety_name}`;

      if (!contractorMap[cont]) contractorMap[cont] = { qty: 0, amt: 0 };
      contractorMap[cont].qty += qty;
      contractorMap[cont].amt += amt;

      dailySumMap[key] = (dailySumMap[key] || 0) + qty;
    });

    return {
      hierarchy,
      grandTotal: grandTotalVal,
      filteredLogs: logs,
      contractorSummary: Object.entries(contractorMap).sort((a,b)=>a[0].localeCompare(b[0])),
      dailySummary: Object.entries(dailySumMap).sort((a,b)=>a[0].localeCompare(b[0]))
    };
  };

  const { hierarchy, grandTotal, filteredLogs, contractorSummary, dailySummary } = getFilteredData();

  const resetFilters = () => {
    setFilterCompany('');
    setFilterLocation('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto', gap: '16px', padding: '16px 16px 80px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
        <h2 style={{ color: 'var(--corp-dash)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <Layers /> Peeling Operations Dashboard
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

      {/* Filter Bar */}
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
          value={filterLocation} 
          onChange={e => setFilterLocation(e.target.value)} 
          style={{ maxWidth: '180px', height: '34px', fontSize: '11px' }}
        >
          <option value="">All Locations</option>
          {peelingLocations.map(l => <option key={l} value={l}>{l}</option>)}
        </select>

        <button onClick={resetFilters} className="btn btn-clear" style={{ padding: '0 16px', height: '34px', minWidth: 'auto' }}>
          Clear
        </button>
      </div>

      {/* Aggregate Panels Grid */}
      {!showModal && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: '16px', marginBottom: '25px', flexShrink: 0 }}>
          {/* HLSO Floor Hierarchy */}
          <div className="card" style={{ padding: '0px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border-light)', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--corp-dash)' }}>
              HLSO Floor Active Stock
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '300px', padding: '8px' }}>
              {Object.keys(hierarchy).length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)' }}>No HLSO floor stock found.</div>
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
                                            <td style={{ padding: '3px 0', color: 'var(--text-secondary)' }}>B: {i.batch} ({i.species})</td>
                                            <td style={{ padding: '3px 0', textAlign: 'center' }}>{i.variety}</td>
                                            <td style={{ padding: '3px 0', textAlign: 'center' }}>{i.count}</td>
                                            <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: '750', color: 'var(--corp-dash)' }}>{parseFloat(i.available_qty).toFixed(2)} KG</td>
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

          {/* Analysis Dashboard Tabs Panel */}
          <div className="card" style={{ padding: '0px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-light)' }}>
              <button 
                onClick={() => setActiveTab('otherFloor')} 
                style={{ flex: 1, padding: '10px', fontSize: '10px', fontWeight: '800', border: 'none', background: activeTab === 'otherFloor' ? 'var(--card-bg)' : 'transparent', color: activeTab === 'otherFloor' ? 'var(--corp-dash)' : 'var(--text-secondary)', cursor: 'pointer', borderBottom: activeTab === 'otherFloor' ? '2px solid var(--corp-dash)' : 'none' }}
              >
                Other Floor
              </button>
              <button 
                onClick={() => setActiveTab('dailySum')} 
                style={{ flex: 1, padding: '10px', fontSize: '10px', fontWeight: '800', border: 'none', background: activeTab === 'dailySum' ? 'var(--card-bg)' : 'transparent', color: activeTab === 'dailySum' ? 'var(--corp-dash)' : 'var(--text-secondary)', cursor: 'pointer', borderBottom: activeTab === 'dailySum' ? '2px solid var(--corp-dash)' : 'none' }}
              >
                Today Summary
              </button>
              <button 
                onClick={() => setActiveTab('contractorSum')} 
                style={{ flex: 1, padding: '10px', fontSize: '10px', fontWeight: '800', border: 'none', background: activeTab === 'contractorSum' ? 'var(--card-bg)' : 'transparent', color: activeTab === 'contractorSum' ? 'var(--corp-dash)' : 'var(--text-secondary)', cursor: 'pointer', borderBottom: activeTab === 'contractorSum' ? '2px solid var(--corp-dash)' : 'none' }}
              >
                Contractor Analysis
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', maxHeight: '280px', padding: '10px' }}>
              {activeTab === 'otherFloor' && (
                <table className="bknr-table" style={{ fontSize: '11px' }}>
                  <thead>
                    <tr><th>Variety</th><th className="text-right">Available Qty</th></tr>
                  </thead>
                  <tbody>
                    {varietySummary.length === 0 ? (
                      <tr><td colSpan="2" className="text-center" style={{ color: 'var(--text-secondary)' }}>No variety summaries</td></tr>
                    ) : (
                      varietySummary.map((v, idx) => (
                        <tr key={idx}>
                          <td className="text-left"><strong>{v.variety_name}</strong></td>
                          <td className="text-right" style={{ fontWeight: '800', color: 'var(--corp-dash)' }}>{v.total_hlso.toFixed(2)} KG</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {activeTab === 'dailySum' && (
                <table className="bknr-table" style={{ fontSize: '11px' }}>
                  <thead>
                    <tr><th>Company &gt; Loc &gt; Variety</th><th className="text-right">Qty (KG)</th></tr>
                  </thead>
                  <tbody>
                    {dailySummary.length === 0 ? (
                      <tr><td colSpan="2" className="text-center" style={{ color: 'var(--text-secondary)' }}>No data logged today</td></tr>
                    ) : (
                      dailySummary.map(([key, val]) => (
                        <tr key={key}>
                          <td className="text-left"><strong>{key}</strong></td>
                          <td className="text-right" style={{ fontWeight: '800', color: 'var(--corp-dash)' }}>{val.toFixed(2)} KG</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}

              {activeTab === 'contractorSum' && (
                <table className="bknr-table" style={{ fontSize: '10px' }}>
                  <thead>
                    <tr><th>Contractor</th><th>Payroll Details</th><th className="text-right">Total Qty / Amt</th></tr>
                  </thead>
                  <tbody>
                    {contractorSummary.length === 0 ? (
                      <tr><td colSpan="3" className="text-center" style={{ color: 'var(--text-secondary)' }}>No contractor payroll sessions</td></tr>
                    ) : (
                      contractorSummary.map(([cont, data]) => (
                        <tr key={cont}>
                          <td className="text-left"><strong>{cont}</strong></td>
                          <td className="text-left" style={{ color: 'var(--text-secondary)', fontSize: '9px' }}>Total Peeled<br />Total Wages</td>
                          <td className="text-right" style={{ fontWeight: '800' }}>
                            <span style={{ color: 'var(--corp-dash)' }}>{data.qty.toFixed(2)} KG</span><br />
                            <span>₹{data.amt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* PEELING Required Panel */}
          <div className="card" style={{ padding: '0px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border-light)', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--corp-dash)' }}>
              Peeling Required KG
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '300px', padding: '8px' }}>
              <table className="bknr-table" style={{ fontSize: '11px' }}>
                <thead>
                  <tr>
                    <th>Species | Variety</th>
                    <th className="text-center">Count</th>
                    <th className="text-right">Required KG</th>
                  </tr>
                </thead>
                <tbody>
                  {hlsoSummary.length === 0 ? (
                    <tr><td colSpan="3" className="text-center" style={{ color: 'var(--text-secondary)', padding: '12px' }}>No pending requirements</td></tr>
                  ) : (
                    hlsoSummary.map((item, idx) => {
                      const itemKey = `${item.species}|${item.variety}|${item.count}`;
                      const isExpanded = expandedReqCount === itemKey;
                      const drillDownRows = (drillDownData[itemKey]) ? drillDownData[itemKey] : [];

                      return (
                        <React.Fragment key={idx}>
                          <tr>
                            <td className="text-left">{item.species} | {item.variety}</td>
                            <td className="text-center">
                              <button 
                                type="button" 
                                onClick={() => setExpandedReqCount(isExpanded ? null : itemKey)} 
                                style={{ background: 'none', border: 'none', textDecoration: 'underline', color: 'var(--corp-dash)', cursor: 'pointer', fontWeight: '800' }}
                              >
                                {item.count}
                              </button>
                            </td>
                            <td className="text-right" style={{ color: 'var(--corp-dash)', fontWeight: '800' }}>{item.total_kg.toFixed(2)}</td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan="3" style={{ background: 'rgba(255,255,255,0.01)', padding: '8px' }}>
                                <table className="bknr-table" style={{ fontSize: '10px' }}>
                                  <thead>
                                    <tr><th>PO#</th><th>Buyer</th><th className="text-right">Qty</th></tr>
                                  </thead>
                                  <tbody>
                                    {drillDownRows.map((d, dIdx) => (
                                      <tr key={dIdx}>
                                        <td className="text-center">{d.po_no}</td>
                                        <td className="text-left">{d.buyer}</td>
                                        <td className="text-right">{d.qty.toFixed(2)} KG</td>
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
        </div>
      )}

      {/* Recents Entries Logs Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexShrink: 0 }}>
        <h3 style={{ fontSize: '13px', fontWeight: '800', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Recent Peeling Logs
        </h3>
        <button onClick={() => setShowModal(true)} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Plus size={14} /> New Peeling Entry
        </button>
      </div>

      {/* Table Logs */}
      <div className="table-responsive" style={{ flexShrink: 0 }}>
        <table className="bknr-table" style={{ minWidth: '1385px' }}>
          <thead>
            <tr>
              <th className="text-center" style={{ width: '120px' }}>Batch</th>
              <th className="text-left" style={{ width: '140px' }}>Company</th>
              <th className="text-left" style={{ width: '130px' }}>Species</th>
              <th className="text-left" style={{ width: '130px' }}>Variety</th>
              <th className="text-center" style={{ width: '90px' }}>Count</th>
              <th className="text-right" style={{ width: '100px' }}>HLSO In</th>
              <th className="text-right" style={{ width: '100px' }}>Peeled Out</th>
              <th className="text-center" style={{ width: '95px' }}>Yield %</th>
              <th className="text-left" style={{ width: '140px' }}>Location</th>
              <th className="text-left" style={{ width: '150px' }}>Contractor</th>
              <th className="text-right" style={{ width: '120px' }}>Amount</th>
              <th className="text-center" style={{ width: '90px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan="12" className="text-center" style={{ color: 'var(--text-secondary)', padding: '20px' }}>
                  No peeling entries recorded today.
                </td>
              </tr>
            ) : (
              filteredLogs.map(row => (
                <tr 
                  key={row.id} 
                  className={selectedId === row.id ? 'selected' : ''}
                  onClick={() => setSelectedId(row.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="text-center" style={{ fontWeight: '700', color: 'var(--corp-dash)' }}>{row.batch_number}</td>
                  <td className="text-left">{row.production_for}</td>
                  <td className="text-left">{row.species}</td>
                  <td className="text-left" style={{ color: 'var(--corp-dash)' }}>{row.variety_name}</td>
                  <td className="text-center">{row.hlso_count}</td>
                  <td className="text-right">{row.hlso_qty.toFixed(2)}</td>
                  <td className="text-right" style={{ color: 'var(--success)', fontWeight: '800' }}>{row.peeled_qty.toFixed(2)}</td>
                  <td className="text-center">{row.yield_percent}%</td>
                  <td className="text-left">{row.peeling_at}</td>
                  <td className="text-left">{row.contractor_name}</td>
                  <td className="text-right" style={{ color: 'var(--corp-dash)', fontWeight: '800' }}>₹{row.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  <td className="text-center">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(row.id);
                      }} 
                      style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}
                      title="Delete entry"
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

      {/* Entry Modal Panel */}
      {showModal && (
        <div style={modalOverlayStyle} onClick={closeModal}>
          <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px', marginBottom: '16px', alignItems: 'center' }}>
              <h3 style={{ margin: 0, textTransform: 'uppercase', fontSize: '13px', fontWeight: '800', color: 'var(--corp-dash)' }}>
                New Peeling Entry
              </h3>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', color: 'var(--text-secondary)' }}>&times;</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Company *</label>
                  <select 
                    className="form-control" 
                    value={productionFor} 
                    onChange={e => {
                      setProductionFor(e.target.value);
                      setBatchNumber('');
                      setInCount('');
                      setSpecies('');
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
                    value={locationVal} 
                    onChange={e => {
                      setLocationVal(e.target.value);
                      setBatchNumber('');
                      setInCount('');
                      setSpecies('');
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
                      setSpecies('');
                    }} 
                    required
                  >
                    <option value="">Select Batch</option>
                    {getFilteredBatches().map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Count (In) *</label>
                  <select 
                    className="form-control" 
                    value={inCount} 
                    onChange={e => setInCount(e.target.value)} 
                    required
                  >
                    <option value="">Select Count</option>
                    {getFilteredCounts().map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Species</label>
                  <input type="text" className="form-control" value={species} readonly placeholder="Auto Loaded" style={{ background: 'rgba(255,255,255,0.02)' }} />
                </div>

                <div className="form-group">
                  <label>HLSO In (Qty) *</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    className="form-control" 
                    value={hlsoQty} 
                    onChange={e => setHlsoQty(e.target.value)} 
                    placeholder="0.00" 
                    required 
                  />
                  <span style={{ fontSize: '10px', color: 'var(--corp-dash)', fontWeight: '700', marginTop: '2px', display: 'block' }}>
                    Stock Available: <strong>{floorAvail.toFixed(2)} KG</strong>
                  </span>
                </div>

                <div className="form-group">
                  <label>Variety *</label>
                  <select 
                    className="form-control" 
                    value={variety} 
                    onChange={e => setVariety(e.target.value)} 
                    required
                  >
                    <option value="">Select Variety</option>
                    {varietiesList.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Peeled Out (Qty) *</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    className="form-control" 
                    value={peeledQty} 
                    onChange={e => setPeeledQty(e.target.value)} 
                    placeholder="0.00" 
                    required 
                  />
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
                  <input type="number" className="form-control" value={rate} readonly placeholder="0.00" style={{ background: 'rgba(255,255,255,0.02)' }} />
                </div>

                <div className="form-group">
                  <label>Yield %</label>
                  <input type="text" className="form-control" value={yieldPercent + '%'} readonly placeholder="0.00%" style={{ background: 'rgba(255,255,255,0.02)' }} />
                </div>

                <div className="form-group">
                  <label>Total Amount (₹)</label>
                  <input type="text" className="form-control" value={amount} readonly style={{ background: 'rgba(255,255,255,0.02)', color: 'var(--corp-dash)', fontWeight: '800' }} />
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
