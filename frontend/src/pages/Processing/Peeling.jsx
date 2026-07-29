import React, { useState, useEffect } from 'react';
import { Layers, Plus, Ban, Calendar, Clock, Mail, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { sessionFetch } from '../../utils/sessionFetch';

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
  const [collapsedOtherComps, setCollapsedOtherComps] = useState({});
  const [collapsedOtherLocs, setCollapsedOtherLocs] = useState({});
  const [collapsedDailyComps, setCollapsedDailyComps] = useState({});
  const [collapsedDailyLocs, setCollapsedDailyLocs] = useState({});
  const [collapsedContractorComps, setCollapsedContractorComps] = useState({});
  const [collapsedContractorLocs, setCollapsedContractorLocs] = useState({});
  const [collapsedContractors, setCollapsedContractors] = useState({});
  const [collapsedReqComps, setCollapsedReqComps] = useState({});
  const [collapsedReqLocs, setCollapsedReqLocs] = useState({});
  const [expandedReqCount, setExpandedReqCount] = useState(null); // 'species|variety|count' string

  // Table Registration state
  const [tableNo, setTableNo] = useState('');
  const [subTab, setSubTab] = useState('operations'); // 'operations' | 'tableRegistration'

  const [regTableNo, setRegTableNo] = useState('');
  const [regWorkerType, setRegWorkerType] = useState('Contractor');
  const [regContractor, setRegContractor] = useState('');
  const [regNoOfWorkers, setRegNoOfWorkers] = useState('');
  const [regWorkerIds, setRegWorkerIds] = useState('');
  const [regPeelingAt, setRegPeelingAt] = useState('');
  const [registeredTables, setRegisteredTables] = useState([]);
  const [registeredWorkersList, setRegisteredWorkersList] = useState([]);
  const [workerSearchTerm, setWorkerSearchTerm] = useState('');
  const [selectedWorkerIds, setSelectedWorkerIds] = useState([]);

  useEffect(() => {
    const fetchRegisteredWorkers = async () => {
      try {
        const res = await fetch('/attendance/kg-basis-labour', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          const insideIds = new Set((data.attendance || [])
            .filter(row => row.status === 'INSIDE')
            .map(row => String(row.worker_id || '').trim())
            .filter(Boolean));
          setRegisteredWorkersList((data.workers || []).filter(worker => insideIds.has(String(worker.worker_id || '').trim())));
        }
      } catch (err) {
        console.error('Error fetching registered workers:', err);
      }
    };
    fetchRegisteredWorkers();
  }, []);

  const toggleWorkerSelection = (wId) => {
    let next;
    if (selectedWorkerIds.includes(wId)) {
      next = selectedWorkerIds.filter(id => id !== wId);
    } else {
      next = [...selectedWorkerIds, wId];
    }
    setSelectedWorkerIds(next);
    setRegWorkerIds(next.join(', '));
    if (regWorkerType !== 'Contractor') {
      setRegNoOfWorkers(String(next.length));
    }
  };

  const formattedPreviewTableNo = React.useMemo(() => {
    if (!regTableNo.trim()) return '';
    const raw = regTableNo.trim();
    if (/^\d+$/.test(raw)) {
      return `Table ${raw}`;
    }
    return raw;
  }, [regTableNo]);

  const isTableAlreadyRegistered = React.useMemo(() => {
    if (!formattedPreviewTableNo) return false;
    const cleanCheck = formattedPreviewTableNo.toLowerCase();
    return registeredTables.some(t => t.table_no && t.table_no.trim().toLowerCase() === cleanCheck);
  }, [formattedPreviewTableNo, registeredTables]);

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

      const res = await fetch(`/processing/peeling?${queryParams.toString()}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const pList = data.prod_for_list || [];
        const locList = data.peeling_locations || [];
        setProdForList(pList);
        setPeelingLocations(locList);
        setVarietiesList(data.varieties || []);

        const nextComp = pList.includes(productionFor) ? productionFor :
          (activeComp && pList.includes(activeComp) ? activeComp :
          (data.selected_production_for && pList.includes(data.selected_production_for) ? data.selected_production_for :
          (pList.length > 0 ? pList[0] : '')));

        setProductionFor(nextComp);

        setLocationVal(current => {
          if (current && locList.includes(current) && (current !== nextComp || locList.length === 1)) return current;
          if (activeLoc && locList.includes(activeLoc) && (activeLoc !== nextComp || locList.length === 1)) return activeLoc;
          if (data.selected_location && locList.includes(data.selected_location) && (data.selected_location !== nextComp || locList.length === 1)) return data.selected_location;
          const distinctLoc = locList.find(l => l !== nextComp);
          return distinctLoc || (locList.length > 0 ? locList[0] : '');
        });

        let cList = data.contractors || [];
        if (!cList.length) {
          try {
            const apiRes = await fetch('/api/contractors', { credentials: 'include' });
            if (apiRes.ok) {
              const apiData = await apiRes.json();
              cList = (apiData.data || []).map(row => row.contractor_name).filter(Boolean);
            }
          } catch (e) {
            console.error('Error fetching contractors fallback:', e);
          }
        }
        const defaultContractors = ['KG BASIS', 'DAILY BASIS'];
        setContractorsList(Array.from(new Set([...defaultContractors, ...cList])));
        setHlsoFloorBalance(data.hlso_floor_balance || []);
        setHlsoSummary(data.hlso_summary || []);
        setVarietySummary(data.variety_summary || []);
        setDrillDownData(data.drill_down_json || {});
        setTodayEntries(data.today_data || []);

        if (data.selected_production_for) setFilterCompany(data.selected_production_for);
        if (data.selected_location) {
          setFilterLocation(data.selected_location);
          setRegPeelingAt(data.selected_location);
        }
      } else {
        console.error('Failed to fetch Peeling data');
      }

      const regRes = await fetch(`/processing/peeling/table_registrations`, { credentials: 'include' });
      if (regRes.ok) {
        const regData = await regRes.json();
        setRegisteredTables(regData.table_registrations || []);
      }
    } catch (err) {
      console.error('Error fetching Peeling data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Auto-set state defaults when modal opens or option lists update
  useEffect(() => {
    if (showModal) {
      const activeComp = localStorage.getItem('production_for_filter') || '';
      const activeLoc = localStorage.getItem('plant_location_filter') || '';
      if (!productionFor && prodForList.length > 0) {
        setProductionFor(prodForList.includes(activeComp) ? activeComp : prodForList[0]);
      }
      if (!locationVal && peelingLocations.length > 0) {
        setLocationVal(peelingLocations.includes(activeLoc) ? activeLoc : peelingLocations[0]);
      }
    }
  }, [showModal, prodForList, peelingLocations, productionFor, locationVal]);

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

  // Autoload the exact species row, then refresh its live quantity from the
  // backend formula instead of relying only on the page-load snapshot.
  useEffect(() => {
    let active = true;
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
        const params = new URLSearchParams({
          production_for: productionFor,
          location: locationVal,
          batch: batchNumber,
          count: inCount,
          species_name: match.species || '',
          variety_name: match.variety || 'HLSO',
        });
        sessionFetch(`/processing/peeling/get_available_qty?${params.toString()}`)
          .then(res => res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))
          .then(data => { if (active) setFloorAvail(parseFloat(data.available_qty) || 0); })
          .catch(err => {
            console.error('Unable to refresh peeling balance:', err);
            if (active) setFloorAvail(0);
          });
      } else {
        setSpecies('');
        setFloorAvail(0);
      }
    } else {
      setSpecies('');
      setFloorAvail(0);
    }
    return () => { active = false; };
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
        const res = await sessionFetch(`/processing/peeling/get_rate?${params.toString()}`);
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
    formData.append('table_no', tableNo);
    formData.append('rate', String(rate));
    formData.append('yield_percent', yieldPercent + '%');
    formData.append('amount', String(amount));

    try {
      const res = await sessionFetch('/processing/peeling', {
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
        setTableNo('');
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

  const handleSaveTableRegistration = async (e) => {
    e.preventDefault();
    if (!regTableNo.trim()) {
      alert('Table Number is required!');
      return;
    }

    const cleanLocation = regPeelingAt || filterLocation || locationVal || '';
    if (!cleanLocation.trim()) {
      alert('Peeling At / Location is required!');
      return;
    }
    const formattedTableNo = formattedPreviewTableNo || regTableNo.trim();

    const cleanCheck = formattedTableNo.toLowerCase();
    const isDuplicate = registeredTables.some(t => t.table_no && t.table_no.trim().toLowerCase() === cleanCheck);
    if (isDuplicate) {
      alert(`Table Number '${formattedTableNo}' is already registered for today!`);
      return;
    }

    if (regWorkerType !== 'Contractor') {
      const targetCount = parseInt(regNoOfWorkers || 0, 10);
      if (targetCount <= 0) {
        alert('Please enter a valid Number of Workers (> 0)!');
        return;
      }
      if (selectedWorkerIds.length !== targetCount) {
        alert(`Please select exactly ${targetCount} workers matching 'Number of Workers'! (Currently selected: ${selectedWorkerIds.length})`);
        return;
      }
    }

    setLoading(true);
    const formData = new URLSearchParams();
    formData.append('table_no', formattedTableNo);
    formData.append('worker_type', regWorkerType);
    if (regWorkerType === 'Contractor') {
      formData.append('contractor_name', regContractor);
      formData.append('no_of_workers', String(regNoOfWorkers || 0));
    } else {
      formData.append('no_of_workers', String(regNoOfWorkers || 0));
      formData.append('worker_ids', selectedWorkerIds.join(', '));
    }
    formData.append('production_at', cleanLocation);
    formData.append('production_for', productionFor);

    try {
      const res = await sessionFetch('/processing/peeling/table_registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
      });
      if (res.ok) {
        alert('Table Registered Successfully!');
        setRegTableNo('');
        setRegContractor('');
        setRegNoOfWorkers('');
        setRegWorkerIds('');
        setSelectedWorkerIds([]);
        await fetchBackendData();
      } else {
        const data = await res.json().catch(() => ({ error: `Server error (${res.status})` }));
        alert(data.error || data.detail || data.message || 'Registration failed');
      }
    } catch (err) {
      console.error(err);
      alert(err?.message || 'Error saving table registration');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTableRegistration = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this table registration?')) return;
    setLoading(true);
    try {
      const res = await sessionFetch(`/processing/peeling/table_registration/delete/${id}`, { method: 'POST' });
      if (res.ok) {
        alert('Table registration cancelled');
        await fetchBackendData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    const reason = window.prompt('Are you sure you want to cancel this peeling entry? Please enter a cancellation reason:');
    if (reason === null) return;
    if (!reason.trim()) {
      alert('Cancellation reason is required!');
      return;
    }
    setLoading(true);
    try {
      const formData = new URLSearchParams();
      formData.append('cancel_reason', reason.trim());
      const res = await sessionFetch(`/processing/peeling/delete/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });
      if (res.ok) {
        alert('Peeling entry cancelled successfully');
        setSelectedId(null);
        await fetchBackendData();
      } else {
        const data = await res.json();
        alert(data.error || 'Cancellation failed');
      }
    } catch (err) {
      alert('Connection error cancelling peeling record');
      console.error(err);
    } finally {
      setLoading(false);
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

    // Calculate contractor & daily sum hierarchies based on filtered logs
    let contractorHierarchy = {};
    let dailySumHierarchy = {};

    logs.forEach(r => {
      if (r.is_cancelled) return;
      const comp = r.production_for || 'General Company';
      const loc = r.peeling_at || 'General Location';
      const variety = r.variety_name || 'General Variety';
      const batch = r.batch_number || '-';
      const species = r.species || '-';
      const count = r.in_count || '-';
      const qty = parseFloat(r.peeled_qty) || 0;
      const amt = parseFloat(r.amount) || 0;
      const cont = r.contractor_name || 'Direct / Company';

      // Daily Sum hierarchy
      if (!dailySumHierarchy[comp]) dailySumHierarchy[comp] = { total: 0, locations: {} };
      if (!dailySumHierarchy[comp].locations[loc]) dailySumHierarchy[comp].locations[loc] = { total: 0, items: [] };

      dailySumHierarchy[comp].total += qty;
      dailySumHierarchy[comp].locations[loc].total += qty;
      dailySumHierarchy[comp].locations[loc].items.push({
        batch,
        species,
        variety,
        count,
        qty
      });

      // Contractor hierarchy (Company -> Location -> Contractor)
      if (!contractorHierarchy[comp]) contractorHierarchy[comp] = { totalQty: 0, totalAmt: 0, locations: {} };
      if (!contractorHierarchy[comp].locations[loc]) contractorHierarchy[comp].locations[loc] = { totalQty: 0, totalAmt: 0, contractors: {} };
      if (!contractorHierarchy[comp].locations[loc].contractors[cont]) contractorHierarchy[comp].locations[loc].contractors[cont] = { totalQty: 0, totalAmt: 0, items: [] };

      contractorHierarchy[comp].totalQty += qty;
      contractorHierarchy[comp].totalAmt += amt;
      contractorHierarchy[comp].locations[loc].totalQty += qty;
      contractorHierarchy[comp].locations[loc].totalAmt += amt;
      contractorHierarchy[comp].locations[loc].contractors[cont].totalQty += qty;
      contractorHierarchy[comp].locations[loc].contractors[cont].totalAmt += amt;
      contractorHierarchy[comp].locations[loc].contractors[cont].items.push({
        table_no: r.table_no,
        batch_number: r.batch_number,
        variety_name: r.variety_name,
        peeled_qty: qty,
        amount: amt
      });
    });

    // Build Other Floor hierarchy Company -> Location -> Items & Variety Sums per Level
    let otherFloorHierarchy = {};
    let varietySumMap = {};

    varietySummary.forEach(item => {
      const comp = item.production_for || 'General Stock';
      const loc = item.location || 'Purchased Stock';
      const vName = item.variety_name || 'Unknown';
      const qty = parseFloat(item.total_hlso) || 0;

      if (!otherFloorHierarchy[comp]) otherFloorHierarchy[comp] = { total: 0, locations: {}, varietySum: {} };
      if (!otherFloorHierarchy[comp].locations[loc]) otherFloorHierarchy[comp].locations[loc] = { total: 0, items: [], varietySum: {} };

      otherFloorHierarchy[comp].total += qty;
      otherFloorHierarchy[comp].locations[loc].total += qty;
      otherFloorHierarchy[comp].locations[loc].items.push(item);

      // Company level variety sum
      otherFloorHierarchy[comp].varietySum[vName] = (otherFloorHierarchy[comp].varietySum[vName] || 0) + qty;

      // Location level variety sum
      otherFloorHierarchy[comp].locations[loc].varietySum[vName] = (otherFloorHierarchy[comp].locations[loc].varietySum[vName] || 0) + qty;

      // Global variety sum
      varietySumMap[vName] = (varietySumMap[vName] || 0) + qty;
    });

    const otherFloorVarietySum = Object.entries(varietySumMap).sort((a, b) => b[1] - a[1]);

    // Build Peeling Required Hierarchy (Company -> Location -> Items)
    let reqHierarchy = {};
    hlsoSummary.forEach(item => {
      const comp = item.production_for || 'General Stock';
      const loc = item.location || 'FLOOR';
      const qty = parseFloat(item.total_kg) || 0;

      if (!reqHierarchy[comp]) reqHierarchy[comp] = { total: 0, locations: {} };
      if (!reqHierarchy[comp].locations[loc]) reqHierarchy[comp].locations[loc] = { total: 0, items: [] };

      reqHierarchy[comp].total += qty;
      reqHierarchy[comp].locations[loc].total += qty;
      reqHierarchy[comp].locations[loc].items.push(item);
    });

    return {
      hierarchy,
      otherFloorHierarchy,
      otherFloorVarietySum,
      dailySumHierarchy,
      contractorHierarchy,
      reqHierarchy,
      grandTotal: grandTotalVal,
      filteredLogs: logs
    };
  };

  const { hierarchy, otherFloorHierarchy, otherFloorVarietySum, dailySumHierarchy, contractorHierarchy, reqHierarchy, grandTotal, filteredLogs } = getFilteredData();

  const resetFilters = () => {
    setFilterCompany('');
    setFilterLocation('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto', gap: '16px', padding: '16px 16px 80px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexShrink: 0 }}>
        <h2 style={{ color: 'var(--corp-dash)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <i className="fa-solid fa-hand-dots"></i> Peeling Operations Dashboard
        </h2>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div className="grand-total" style={{ background: 'var(--corp-dash)', color: '#fff', padding: '6px 12px', borderRadius: '4px', fontSize: '12px', fontWeight: '800' }}>
            TOTAL FLOOR: {grandTotal.toFixed(2)} KG
          </div>
          <button 
            onClick={() => setShowModal(true)} 
            className="btn btn-primary" 
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={14} /> New Entry
          </button>
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

      {/* Sub Tabs Navigation */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-light)', paddingBottom: '10px', marginBottom: '16px', flexShrink: 0 }}>
        <button 
          type="button"
          onClick={() => setSubTab('operations')} 
          className={`btn ${subTab === 'operations' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ padding: '6px 16px', fontSize: '11px' }}
        >
          Daily Operations & Floor Balance
        </button>
        <button 
          type="button"
          onClick={() => setSubTab('tableRegistration')} 
          className={`btn ${subTab === 'tableRegistration' ? 'btn-primary' : 'btn-secondary'}`}
          style={{ padding: '6px 16px', fontSize: '11px' }}
        >
          Daily Table Registration
        </button>
      </div>

      {subTab === 'tableRegistration' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Table Registration Form Card */}
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '13px', fontWeight: '800', color: 'var(--corp-dash)', textTransform: 'uppercase' }}>
              Register Peeling Table Number
            </h3>
            <form onSubmit={handleSaveTableRegistration}>
              <div className="form-grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                <div className="form-group">
                  <label>1. Peeling At / Location *</label>
                  <select 
                    className="form-control" 
                    value={regPeelingAt} 
                    onChange={e => setRegPeelingAt(e.target.value)}
                    required
                  >
                    <option value="">Select Peeling At / Location</option>
                    {peelingLocations.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>

                </div>

                <div className="form-group">
                  <label>2. Table No *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. 1, 2, 3 (saves as PeelingAt-TableNo)" 
                    value={regTableNo} 
                    onChange={e => setRegTableNo(e.target.value)} 
                    required 
                  />
                  {regPeelingAt && regTableNo && (
                    <small style={{ color: '#2563eb', fontWeight: '700', marginTop: '4px', display: 'block' }}>
                      Will save as: {formattedPreviewTableNo}
                    </small>
                  )}

                  {isTableAlreadyRegistered && (
                    <div style={{
                      background: '#fef08a', // Yellow background
                      border: '1.5px solid #eab308', // Amber border
                      color: '#854d0e', // Dark yellow/brown text
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '800',
                      marginTop: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      boxShadow: '0 2px 4px rgba(234, 179, 8, 0.2)'
                    }}>
                      ⚠️ Table Number '{formattedPreviewTableNo}' is already registered for today!
                    </div>
                  )}
                </div>


                <div className="form-group">
                  <label>3. Worker Type *</label>
                  <select 
                    className="form-control" 
                    value={regWorkerType} 
                    onChange={e => {
                      setRegWorkerType(e.target.value);
                      setRegNoOfWorkers('');
                      setRegWorkerIds('');
                      setSelectedWorkerIds([]);
                    }}
                    required
                  >
                    <option value="Contractor">Contractor</option>
                    <option value="KG Basis Company Worker">KG Basis Company Worker</option>
                    <option value="Daily Basis Company Worker">Daily Basis Company Worker</option>
                  </select>
                </div>

                {regWorkerType === 'Contractor' ? (
                  <>
                    <div className="form-group">
                      <label>Contractor Name *</label>
                      <select 
                        className="form-control" 
                        value={regContractor} 
                        onChange={e => setRegContractor(e.target.value)}
                        required
                      >
                        <option value="">Select Contractor</option>
                        <option value="KG BASIS">KG BASIS</option>
                        <option value="DAILY BASIS">DAILY BASIS</option>
                        {contractorsList.filter(c => c !== 'KG BASIS' && c !== 'DAILY BASIS').map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Number of Workers *</label>
                      <input 
                        type="number" 
                        className="form-control" 
                        placeholder="Count e.g. 10" 
                        value={regNoOfWorkers} 
                        onChange={e => setRegNoOfWorkers(e.target.value)} 
                        required 
                        min="1"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="form-group">
                      <label>Number of Workers *</label>
                      <input 
                        type="number" 
                        className="form-control" 
                        placeholder="Auto from selected workers" 
                        value={regNoOfWorkers} 
                        onChange={e => setRegNoOfWorkers(e.target.value)} 
                        required 
                        min="1"
                        readOnly
                      />
                    </div>

                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <label style={{ margin: 0, fontWeight: '700' }}>Worker Checkbox Selection (Must select exactly {regNoOfWorkers || 0}) *</label>
                        <span className={`badge ${selectedWorkerIds.length === parseInt(regNoOfWorkers || 0, 10) && selectedWorkerIds.length > 0 ? 'bg-success' : 'bg-warning'}`} style={{ fontSize: '11px', padding: '4px 10px', borderRadius: '12px' }}>
                          Selected: {selectedWorkerIds.length} / {regNoOfWorkers || 0} Workers
                        </span>
                      </div>

                      <input 
                        type="text" 
                        className="form-control" 
                        placeholder="🔍 Search registered workers by ID, Name or Department..." 
                        value={workerSearchTerm} 
                        onChange={e => setWorkerSearchTerm(e.target.value)}
                        style={{ marginBottom: '10px', fontSize: '12px' }}
                      />

                      <div style={{
                        maxHeight: '220px',
                        overflowY: 'auto',
                        border: '1px solid var(--border-light)',
                        borderRadius: '8px',
                        padding: '10px',
                        background: 'var(--bg-card)',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                        gap: '8px'
                      }}>
                        {registeredWorkersList
                          .filter(w => {
                            if (!workerSearchTerm.trim()) return true;
                            const q = workerSearchTerm.toLowerCase();
                            return (w.worker_id && w.worker_id.toLowerCase().includes(q)) ||
                                   (w.worker_name && w.worker_name.toLowerCase().includes(q)) ||
                                   (w.department && w.department.toLowerCase().includes(q));
                          })
                          .map(w => {
                            const isChecked = selectedWorkerIds.includes(w.worker_id);
                            return (
                              <label 
                                key={w.worker_id || w.id} 
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  padding: '8px 10px',
                                  borderRadius: '6px',
                                  background: isChecked ? 'rgba(37, 99, 235, 0.12)' : 'var(--bg-primary, #f8fafc)',
                                  border: isChecked ? '1px solid #2563eb' : '1px solid var(--border-light, #e2e8f0)',
                                  cursor: 'pointer',
                                  fontSize: '12px',
                                  userSelect: 'none'
                                }}
                              >
                                <input 
                                  type="checkbox" 
                                  checked={isChecked} 
                                  onChange={() => toggleWorkerSelection(w.worker_id)} 
                                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#2563eb' }}
                                />
                                <span style={{ lineHeight: '1.3' }}>
                                  <strong style={{ color: 'var(--corp-dash, #1e293b)' }}>{w.worker_id}</strong> — {w.worker_name}
                                  <br/>
                                  <small style={{ color: 'var(--text-secondary, #64748b)', fontSize: '10px' }}>{w.department || 'General Department'}</small>
                                </span>
                              </label>
                            );
                          })}
                        {registeredWorkersList.length === 0 && (
                          <div style={{ gridColumn: '1 / -1', padding: '16px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
                            No punched-in KG Basis workers found for today. Punch IN workers under <strong>HRMS → KG Basis Workers</strong> first.
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  Save Table Registration
                </button>
              </div>
            </form>
          </div>

          {/* Registered Tables List */}
          <div className="card" style={{ padding: '20px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '13px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--corp-dash)' }}>
              Registered Tables (Today)
            </h3>
            <div className="table-responsive">
              <table className="bknr-table">
                <thead>
                  <tr>
                    <th className="text-center" style={{ width: '60px' }}>Sl. No</th>
                    <th className="text-center">Date</th>
                    <th className="text-left">Peeling At / Location</th>
                    <th className="text-center">Table No</th>
                    <th className="text-left">Worker Type</th>
                    <th className="text-left">Contractor / Details</th>
                    <th className="text-center">No of Workers</th>
                    <th className="text-left">Worker IDs</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const curLoc = regPeelingAt || filterLocation || locationVal || '';
                    const displayedTables = registeredTables.filter(reg => !curLoc || !reg.production_at || reg.production_at.trim().toLowerCase() === curLoc.trim().toLowerCase());
                    if (displayedTables.length === 0) {
                      return (
                        <tr>
                          <td colSpan="9" className="text-center" style={{ color: 'var(--text-secondary)', padding: '20px' }}>
                            No tables registered for today in {curLoc || 'selected location'}.
                          </td>
                        </tr>
                      );
                    }
                    return displayedTables.map((reg, idx) => {
                      const isMatch = formattedPreviewTableNo && reg.table_no && reg.table_no.trim().toLowerCase() === formattedPreviewTableNo.toLowerCase();
                      return (
                        <tr key={reg.id} style={{ background: isMatch ? 'rgba(254, 240, 138, 0.4)' : 'transparent' }}>
                          <td className="text-center" style={{ fontWeight: '700' }}>{displayedTables.length - idx}</td>
                          <td className="text-center">{reg.date}</td>
                          <td className="text-left" style={{ fontWeight: '600' }}>{reg.production_at || '-'}</td>
                          <td className="text-center">
                            <span style={{ 
                              background: '#fef08a', // Yellow background
                              color: '#854d0e', // Dark yellow/brown text
                              padding: '3px 8px', 
                              borderRadius: '6px', 
                              border: '1px solid #eab308', 
                              fontWeight: '800',
                              fontSize: '12px',
                              display: 'inline-block'
                            }}>
                              {reg.table_no}
                            </span>
                          </td>
                          <td className="text-left">{reg.worker_type}</td>
                          <td className="text-left">{reg.contractor_name || '-'}</td>
                          <td className="text-center" style={{ fontWeight: '700' }}>{reg.no_of_workers}</td>
                          <td className="text-left">{reg.worker_ids || '-'}</td>
                          <td className="text-center">
                            <button 
                              type="button"
                              onClick={() => handleDeleteTableRegistration(reg.id)}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                              title="Cancel Table Registration"
                            >
                              <Ban size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <>
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
                <div>
                  {Object.keys(otherFloorHierarchy).length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)' }}>No other floor stock found.</div>
                  ) : (
                    Object.keys(otherFloorHierarchy).sort().map(comp => {
                      const isCompCollapsed = collapsedOtherComps[comp];
                      return (
                        <div key={comp} style={{ marginBottom: '8px' }}>
                          <div 
                            onClick={() => setCollapsedOtherComps(prev => ({ ...prev, [comp]: !prev[comp] }))}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: '750', fontSize: '12px', color: 'var(--corp-dash)', padding: '4px' }}
                          >
                            {isCompCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                            <span>{comp}</span>
                            <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-secondary)' }}>{otherFloorHierarchy[comp].total.toFixed(2)} KG</span>
                          </div>

                          {!isCompCollapsed && (
                            <div style={{ paddingLeft: '12px' }}>
                              {/* Company Level Variety Wise Badges */}
                              {Object.keys(otherFloorHierarchy[comp].varietySum || {}).length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                                  {Object.entries(otherFloorHierarchy[comp].varietySum).map(([vName, vQty]) => (
                                    <span key={vName} style={{ background: 'rgba(59, 130, 246, 0.08)', border: '1px solid rgba(59, 130, 246, 0.2)', padding: '2px 6px', borderRadius: '3px', fontSize: '9px' }}>
                                      <strong style={{ color: 'var(--text-primary)' }}>{vName}:</strong> <span style={{ color: 'var(--corp-dash)', fontWeight: '750' }}>{vQty.toFixed(2)} KG</span>
                                    </span>
                                  ))}
                                </div>
                              )}

                              {Object.keys(otherFloorHierarchy[comp].locations).sort().map(loc => {
                                const isLocCollapsed = collapsedOtherLocs[`${comp}|${loc}`];
                                return (
                                  <div key={loc} style={{ marginTop: '4px' }}>
                                    <div 
                                      onClick={() => setCollapsedOtherLocs(prev => ({ ...prev, [`${comp}|${loc}`]: !prev[`${comp}|${loc}`] }))}
                                      style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '11px', color: 'var(--text-primary)', padding: '3px' }}
                                    >
                                      {isLocCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                      <span>{loc}</span>
                                      <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-secondary)' }}>{otherFloorHierarchy[comp].locations[loc].total.toFixed(2)} KG</span>
                                    </div>

                                    {!isLocCollapsed && (
                                      <div style={{ paddingLeft: '16px', marginTop: '2px' }}>
                                        {/* Location Level Variety Wise Badges */}
                                        {Object.keys(otherFloorHierarchy[comp].locations[loc].varietySum || {}).length > 0 && (
                                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
                                            {Object.entries(otherFloorHierarchy[comp].locations[loc].varietySum).map(([vName, vQty]) => (
                                              <span key={vName} style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '2px 6px', borderRadius: '3px', fontSize: '9px' }}>
                                                <strong style={{ color: 'var(--text-primary)' }}>{vName}:</strong> <span style={{ color: '#10b981', fontWeight: '750' }}>{vQty.toFixed(2)} KG</span>
                                              </span>
                                            ))}
                                          </div>
                                        )}

                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                                          <tbody>
                                            {otherFloorHierarchy[comp].locations[loc].items.map((v, idx) => (
                                              <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                                <td style={{ padding: '3px 0', color: 'var(--text-secondary)' }}>B: {v.batch_number} ({v.species})</td>
                                                <td style={{ padding: '3px 0', textAlign: 'center' }}>{v.variety_name}</td>
                                                <td style={{ padding: '3px 0', textAlign: 'center' }}>{v.count}</td>
                                                <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: '750', color: 'var(--corp-dash)' }}>{v.total_hlso.toFixed(2)} KG</td>
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
              )}

              {activeTab === 'dailySum' && (
                <div>
                  {Object.keys(dailySumHierarchy).length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)' }}>No peeling data logged today.</div>
                  ) : (
                    Object.keys(dailySumHierarchy).sort().map(comp => {
                      const isCompCollapsed = collapsedDailyComps[comp];
                      return (
                        <div key={comp} style={{ marginBottom: '8px' }}>
                          <div 
                            onClick={() => setCollapsedDailyComps(prev => ({ ...prev, [comp]: !prev[comp] }))}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: '750', fontSize: '12px', color: 'var(--corp-dash)', padding: '4px' }}
                          >
                            {isCompCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                            <span>{comp}</span>
                            <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-secondary)' }}>{dailySumHierarchy[comp].total.toFixed(2)} KG</span>
                          </div>

                          {!isCompCollapsed && (
                            <div style={{ paddingLeft: '12px' }}>
                              {Object.keys(dailySumHierarchy[comp].locations).sort().map(loc => {
                                const isLocCollapsed = collapsedDailyLocs[`${comp}|${loc}`];
                                return (
                                  <div key={loc} style={{ marginTop: '4px' }}>
                                    <div 
                                      onClick={() => setCollapsedDailyLocs(prev => ({ ...prev, [`${comp}|${loc}`]: !prev[`${comp}|${loc}`] }))}
                                      style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '11px', color: 'var(--text-primary)', padding: '3px' }}
                                    >
                                      {isLocCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                      <span>{loc}</span>
                                      <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-secondary)' }}>{dailySumHierarchy[comp].locations[loc].total.toFixed(2)} KG</span>
                                    </div>

                                    {!isLocCollapsed && (
                                      <div style={{ paddingLeft: '16px', marginTop: '2px' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                                          <tbody>
                                            {dailySumHierarchy[comp].locations[loc].items.map((v, idx) => (
                                              <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                                <td style={{ padding: '3px 0', color: 'var(--text-secondary)' }}>B: {v.batch} ({v.species})</td>
                                                <td style={{ padding: '3px 0', textAlign: 'center' }}>{v.variety}</td>
                                                <td style={{ padding: '3px 0', textAlign: 'center' }}>{v.count}</td>
                                                <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: '750', color: 'var(--corp-dash)' }}>{v.qty.toFixed(2)} KG</td>
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
              )}

              {activeTab === 'contractorSum' && (
                <div>
                  {Object.keys(contractorHierarchy).length === 0 ? (
                    <div style={{ padding: '16px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)' }}>No contractor payroll sessions logged today.</div>
                  ) : (
                    Object.keys(contractorHierarchy).sort().map(comp => {
                      const isCompCollapsed = collapsedContractorComps[comp];
                      const compData = contractorHierarchy[comp];
                      return (
                        <div key={comp} style={{ marginBottom: '8px' }}>
                          <div 
                            onClick={() => setCollapsedContractorComps(prev => ({ ...prev, [comp]: !prev[comp] }))}
                            style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: '750', fontSize: '12px', color: 'var(--corp-dash)', padding: '4px' }}
                          >
                            {isCompCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                            <span>{comp}</span>
                            <div style={{ marginLeft: 'auto', textAlign: 'right', fontSize: '11px' }}>
                              <span style={{ color: 'var(--corp-dash)', fontWeight: '800' }}>{compData.totalQty.toFixed(2)} KG</span>
                            </div>
                          </div>

                          {!isCompCollapsed && (
                            <div style={{ paddingLeft: '12px' }}>
                              {Object.keys(compData.locations).sort().map(loc => {
                                const isLocCollapsed = collapsedContractorLocs[`${comp}|${loc}`];
                                const locData = compData.locations[loc];
                                return (
                                  <div key={loc} style={{ marginTop: '4px' }}>
                                    <div 
                                      onClick={() => setCollapsedContractorLocs(prev => ({ ...prev, [`${comp}|${loc}`]: !prev[`${comp}|${loc}`] }))}
                                      style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '11px', color: 'var(--text-primary)', padding: '3px' }}
                                    >
                                      {isLocCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                      <span>{loc}</span>
                                      <div style={{ marginLeft: 'auto', textAlign: 'right', fontSize: '10px' }}>
                                        <span style={{ color: 'var(--corp-dash)', fontWeight: '750' }}>{locData.totalQty.toFixed(2)} KG</span>
                                      </div>
                                    </div>

                                    {!isLocCollapsed && (
                                      <div style={{ paddingLeft: '14px', marginTop: '2px' }}>
                                        {Object.keys(locData.contractors).sort().map(cont => {
                                          const isContCollapsed = collapsedContractors[`${comp}|${loc}|${cont}`];
                                          const cData = locData.contractors[cont];
                                          return (
                                            <div key={cont} style={{ marginTop: '3px', marginBottom: '4px' }}>
                                              <div 
                                                onClick={() => setCollapsedContractors(prev => ({ ...prev, [`${comp}|${loc}|${cont}`]: !prev[`${comp}|${loc}|${cont}`] }))}
                                                style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '10px', color: 'var(--corp-dash)', padding: '2px' }}
                                              >
                                                {isContCollapsed ? <ChevronRight size={10} /> : <ChevronDown size={10} />}
                                                <span>{cont}</span>
                                                <div style={{ marginLeft: 'auto', fontSize: '10px' }}>
                                                  <span style={{ color: 'var(--corp-dash)', fontWeight: '750' }}>{cData.totalQty.toFixed(2)} KG</span>
                                                </div>
                                              </div>

                                              {!isContCollapsed && (
                                                <div style={{ paddingLeft: '12px', marginTop: '2px' }}>
                                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                                                    <tbody>
                                                      {cData.items.map((item, idx) => (
                                                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                                          <td style={{ padding: '2px 0', color: 'var(--text-secondary)' }}>
                                                            <strong>{item.table_no || 'T-?'}</strong> ({item.batch_number})
                                                          </td>
                                                          <td style={{ padding: '2px 0', textAlign: 'center' }}>{item.variety_name}</td>
                                                          <td style={{ padding: '2px 0', textAlign: 'right', fontWeight: '700', color: 'var(--corp-dash)' }}>{item.peeled_qty.toFixed(2)} KG</td>
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
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>

          {/* PEELING Required Panel */}
          <div className="card" style={{ padding: '0px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border-light)', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--corp-dash)' }}>
              Peeling Required KG
            </div>
            <div style={{ overflowY: 'auto', maxHeight: '300px', padding: '8px' }}>
              {Object.keys(reqHierarchy).length === 0 ? (
                <div style={{ padding: '16px', textAlign: 'center', fontSize: '11px', color: 'var(--text-secondary)' }}>No pending requirements found.</div>
              ) : (
                Object.keys(reqHierarchy).sort().map(comp => {
                  const isCompCollapsed = collapsedReqComps[comp];
                  return (
                    <div key={comp} style={{ marginBottom: '8px' }}>
                      <div 
                        onClick={() => setCollapsedReqComps(prev => ({ ...prev, [comp]: !prev[comp] }))}
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: '750', fontSize: '12px', color: 'var(--corp-dash)', padding: '4px' }}
                      >
                        {isCompCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        <span>{comp}</span>
                        <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-secondary)' }}>{reqHierarchy[comp].total.toFixed(2)} KG</span>
                      </div>

                      {!isCompCollapsed && (
                        <div style={{ paddingLeft: '12px' }}>
                          {Object.keys(reqHierarchy[comp].locations).sort().map(loc => {
                            const isLocCollapsed = collapsedReqLocs[`${comp}|${loc}`];
                            return (
                              <div key={loc} style={{ marginTop: '4px' }}>
                                <div 
                                  onClick={() => setCollapsedReqLocs(prev => ({ ...prev, [`${comp}|${loc}`]: !prev[`${comp}|${loc}`] }))}
                                  style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: '600', fontSize: '11px', color: 'var(--text-primary)', padding: '3px' }}
                                >
                                  {isLocCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
                                  <span>{loc}</span>
                                  <span style={{ marginLeft: 'auto', fontSize: '10px', color: 'var(--text-secondary)' }}>{reqHierarchy[comp].locations[loc].total.toFixed(2)} KG</span>
                                </div>

                                {!isLocCollapsed && (
                                  <div style={{ paddingLeft: '16px', marginTop: '2px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
                                      <tbody>
                                        {reqHierarchy[comp].locations[loc].items.map((item, idx) => {
                                          const itemKey = `${comp}|${item.species}|${item.variety}|${item.count}`;
                                          const isExpanded = expandedReqCount === itemKey;
                                          const drillDownRows = (drillDownData[itemKey] || drillDownData[`${item.species}|${item.variety}|${item.count}`]) ? (drillDownData[itemKey] || drillDownData[`${item.species}|${item.variety}|${item.count}`]) : [];

                                          return (
                                            <React.Fragment key={idx}>
                                              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                                                <td style={{ padding: '3px 0', color: 'var(--text-secondary)' }}>{item.species} | {item.variety}</td>
                                                <td style={{ padding: '3px 0', textAlign: 'center' }}>
                                                  <button 
                                                    type="button" 
                                                    onClick={() => setExpandedReqCount(isExpanded ? null : itemKey)} 
                                                    style={{ background: 'none', border: 'none', textDecoration: 'underline', color: 'var(--corp-dash)', cursor: 'pointer', fontWeight: '800' }}
                                                  >
                                                    {item.count}
                                                  </button>
                                                </td>
                                                <td style={{ padding: '3px 0', textAlign: 'right', color: 'var(--corp-dash)', fontWeight: '750' }}>{item.total_kg.toFixed(2)} KG</td>
                                              </tr>
                                              {isExpanded && (
                                                <tr>
                                                  <td colSpan="3" style={{ background: 'rgba(255,255,255,0.01)', padding: '6px' }}>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '9px' }}>
                                                      <thead>
                                                        <tr style={{ color: 'var(--text-secondary)' }}><th>PO#</th><th>Buyer</th><th className="text-right">Qty</th></tr>
                                                      </thead>
                                                      <tbody>
                                                        {drillDownRows.map((d, dIdx) => (
                                                          <tr key={dIdx}>
                                                            <td style={{ textAlign: 'center' }}>{d.po_no}</td>
                                                            <td style={{ textAlign: 'left' }}>{d.buyer}</td>
                                                            <td style={{ textAlign: 'right', fontWeight: '700' }}>{d.qty.toFixed(2)} KG</td>
                                                          </tr>
                                                        ))}
                                                      </tbody>
                                                    </table>
                                                  </td>
                                                </tr>
                                              )}
                                            </React.Fragment>
                                          );
                                        })}
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
        </div>
      )}

      {/* Recents Entries Logs Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexShrink: 0 }}>
        <h3 style={{ fontSize: '13px', fontWeight: '800', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Recent Peeling Logs
        </h3>
      </div>

      {/* Table Logs */}
      <div className="table-responsive" style={{ flexShrink: 0 }}>
        <table className="bknr-table" style={{ minWidth: '1385px' }}>
          <thead>
            <tr>
              <th className="text-center" style={{ width: '60px' }}>Sl. No</th>
              <th className="text-center" style={{ width: '100px' }}>Table No</th>
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
              <th className="text-center" style={{ width: '90px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan="13" className="text-center" style={{ color: 'var(--text-secondary)', padding: '20px' }}>
                  No peeling entries recorded today.
                </td>
              </tr>
            ) : (
              filteredLogs.map((row, idx) => (
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
                  <td className="text-center" style={{ fontWeight: '700' }}>{filteredLogs.length - idx}</td>
                  <td className="text-center" style={{ fontWeight: '700', color: 'var(--corp-dash)' }}>{row.table_no || '-'}</td>
                  <td className="text-center" style={{ fontWeight: '700', color: 'var(--corp-dash)' }}>{row.batch_number}</td>
                  <td className="text-left">{row.production_for}</td>
                  <td className="text-left">{row.species}</td>
                  <td className="text-left" style={{ color: 'var(--corp-dash)' }}>{row.variety_name}</td>
                  <td className="text-center">{row.hlso_count}</td>
                  <td className="text-right">{(row.is_cancelled ? 0 : row.hlso_qty).toFixed(2)}</td>
                  <td className="text-right" style={{ color: 'var(--success)', fontWeight: '800' }}>{(row.is_cancelled ? 0 : row.peeled_qty).toFixed(2)}</td>
                  <td className="text-center">{row.yield_percent}%</td>
                  <td className="text-left">{row.peeling_at}</td>
                  <td className="text-left">{row.contractor_name}</td>
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
                        <Ban size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
        </>
      )}

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
                    {peelingLocations.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>

                </div>

                <div className="form-group">
                  <label>Table No</label>
                  <select 
                    className="form-control" 
                    value={tableNo} 
                    onChange={e => {
                      const sel = e.target.value;
                      setTableNo(sel);
                      const reg = registeredTables.find(r => r.table_no === sel);
                      if (reg) {
                        const wType = (reg.worker_type || '').toUpperCase();
                        if (wType.includes('KG')) {
                          setContractor('KG BASIS');
                        } else if (wType.includes('DAILY')) {
                          setContractor('DAILY BASIS');
                        } else if (reg.contractor_name) {
                          setContractor(reg.contractor_name);
                        }
                      }
                    }}
                  >
                    <option value="">Select Table No</option>
                    {(() => {
                      const curLoc = filterLocation || locationVal || '';
                      const locFiltered = registeredTables.filter(r => !curLoc || !r.production_at || r.production_at.trim().toLowerCase() === curLoc.trim().toLowerCase());
                      if (locFiltered.length === 0) {
                        return <option value="" disabled>No tables created for today in {curLoc || 'selected location'}</option>;
                      }
                      return locFiltered.map(r => (
                        <option key={r.id} value={r.table_no}>
                          {r.table_no} ({r.worker_type}{r.contractor_name ? ` - ${r.contractor_name}` : ''})
                        </option>
                      ));
                    })()}
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
                  <input type="text" className="form-control" value={species} readOnly placeholder="Auto Loaded" style={{ background: 'rgba(255,255,255,0.02)' }} />
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
                    <option value="KG BASIS">KG BASIS</option>
                    <option value="DAILY BASIS">DAILY BASIS</option>
                    {contractorsList.filter(c => c !== 'KG BASIS' && c !== 'DAILY BASIS').map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Yield %</label>
                  <input type="text" className="form-control" value={yieldPercent + '%'} readOnly placeholder="0.00%" style={{ background: 'rgba(255,255,255,0.02)' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px', borderTop: '1px solid var(--border-light)', paddingTop: '15px' }}>
                <button type="button" className="btn btn-clear" onClick={closeModal}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>Save</button>
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
