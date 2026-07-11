import React, { useState, useEffect } from 'react';
import { 
  Settings, Plus, Trash2, Calendar, Clock, Mail, RefreshCw, 
  ChevronDown, ChevronRight, Check, X, FileText, AlertTriangle, 
  Info, BarChart2, Eye, EyeOff 
} from 'lucide-react';

export default function Production() {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  // Lookup options and live data
  const [todayEntries, setTodayEntries] = useState([]);
  const [rejectionData, setRejectionData] = useState([]);
  const [soakingData, setSoakingData] = useState([]);
  const [pendingOrders, setPendingOrders] = useState([]);
  const [brands, setBrands] = useState([]);
  const [varieties, setVarieties] = useState([]);
  const [glazes, setGlazes] = useState([]);
  const [freezers, setFreezers] = useState([]);
  const [packingStyles, setPackingStyles] = useState([]);
  const [grades, setGrades] = useState([]);
  const [species, setSpecies] = useState([]);
  const [prodAtList, setProdAtList] = useState([]);
  const [prodForList, setFormCompanyList] = useState([]);
  const [prodTypesList, setProdTypesList] = useState([]);
  const [globalProductionFor, setGlobalProductionFor] = useState('');
  const [globalLocation, setGlobalLocation] = useState('');

  // Search and global filters
  const [filterCompany, setFilterCompany] = useState('');
  const [filterVariety, setFilterVariety] = useState('');
  const [filterGlaze, setFilterGlaze] = useState('');
  const [filterFreezer, setFilterFreezer] = useState('');
  const [filterGrade, setFilterGrade] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [detailsModal, setDetailsModal] = useState({ isOpen: false, title: '', data: [] });
  const [selectedLogId, setSelectedLogId] = useState(null);

  // Form states
  const [formCompany, setFormCompany] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formBatch, setFormBatch] = useState('');
  const [formSpecies, setFormSpecies] = useState('');
  const [formVariety, setFormVariety] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [formGrade, setFormGrade] = useState('');
  const [formGlaze, setFormGlaze] = useState('');
  const [formFreezer, setFormFreezer] = useState('');
  const [formType, setFormType] = useState('');
  const [formPackingStyle, setFormPackingStyle] = useState('');
  const [formNoOfMc, setFormNoOfMc] = useState('0');
  const [formLoose, setFormLoose] = useState('0');
  const [formProductionQty, setFormProductionQty] = useState('0.00');

  // Timers state
  const [now, setNow] = useState(new Date());

  // Collapse states for tree groupings
  const [collapsedSoakComps, setCollapsedSoakComps] = useState({});
  const [collapsedRejComps, setCollapsedRejComps] = useState({});
  const [collapsedReqPOs, setCollapsedReqPOs] = useState({});

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
        queryParams.append('production_at', activeLoc);
      }

      const res = await fetch(`/processing/production?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setTodayEntries(data.today_data || []);
        setRejectionData(data.rejection_data || []);
        setSoakingData(data.soaking_data || []);
        setPendingOrders(data.pending_orders || []);
        setBrands(data.brands || []);
        setVarieties(data.varieties || []);
        setGlazes(data.glazes || []);
        setFreezers(data.freezers || []);
        setPackingStyles(data.packing_styles || []);
        setGrades(data.grades || []);
        setSpecies(data.species || []);
        setProdAtList(data.prod_at_list || []);
        setFormCompanyList(data.prod_for_list || []);
        setProdTypesList(data.prod_types_list || []);
        setGlobalProductionFor(data.global_production_for || '');
        setGlobalLocation(data.global_location || '');
      } else {
        console.error('Failed to fetch Production Worksheet details');
      }
    } catch (err) {
      console.error('Error fetching Production Worksheet details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const current = new Date();
    setDate(current.toISOString().split('T')[0]);
    setTime(current.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    setEmail(localStorage.getItem('user_email') || 'bknr.solutions@gmail.com');
    fetchBackendData();

    // Timer interval
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);

    // Listen to global header filter changes
    const handleGlobalFilterChange = () => {
      fetchBackendData();
    };
    window.addEventListener('filter_change', handleGlobalFilterChange);

    return () => {
      clearInterval(timer);
      window.removeEventListener('filter_change', handleGlobalFilterChange);
    };
  }, []);

  // Sync Global locks when Modal opens
  useEffect(() => {
    if (showEntryModal) {
      if (globalProductionFor && globalProductionFor !== 'ALL') {
        setFormCompany(globalProductionFor);
      } else {
        // Pre-populate with first company having active soaking entries
        const activeComps = Array.from(new Set(soakingData.map(s => s.production_for))).filter(Boolean);
        if (activeComps.length > 0) {
          setFormCompany(activeComps[0]);
        }
      }
    }
  }, [showEntryModal, globalProductionFor, soakingData]);

  // Handle cascading form company selection
  useEffect(() => {
    if (!formCompany) {
      setFormLocation('');
      return;
    }

    if (globalLocation && globalLocation !== 'ALL') {
      setFormLocation(globalLocation);
    } else {
      const matchedLocations = Array.from(
        new Set(
          soakingData
            .filter(s => s.production_for?.toUpperCase().trim() === formCompany.toUpperCase().trim())
            .map(s => s.production_at)
        )
      ).filter(Boolean).sort();

      if (matchedLocations.length > 0) {
        setFormLocation(matchedLocations[0]);
      } else {
        setFormLocation('');
      }
    }
  }, [formCompany, globalLocation, soakingData]);

  // Handle cascading form location selection to populate batches
  const getFilteredBatches = () => {
    if (!formCompany || !formLocation) return [];
    return Array.from(
      new Set(
        soakingData
          .filter(
            s =>
              s.production_for?.toUpperCase().trim() === formCompany.toUpperCase().trim() &&
              s.production_at?.toUpperCase().trim() === formLocation.toUpperCase().trim()
          )
          .map(s => s.batch_number)
      )
    ).filter(Boolean).sort();
  };

  // Sync batch change to auto-resolve species and varieties
  useEffect(() => {
    const batches = getFilteredBatches();
    if (batches.length > 0 && !formBatch) {
      setFormBatch(batches[0]);
    } else if (batches.length === 0) {
      setFormBatch('');
      setFormSpecies('');
      setFormVariety('');
    }
  }, [formLocation, formCompany]);

  useEffect(() => {
    if (!formBatch) {
      setFormSpecies('');
      setFormVariety('');
      return;
    }

    const matches = soakingData.filter(
      s =>
        s.batch_number === formBatch &&
        s.production_for?.toUpperCase().trim() === formCompany.toUpperCase().trim() &&
        s.production_at?.toUpperCase().trim() === formLocation.toUpperCase().trim()
    );

    const matchedSpecies = Array.from(new Set(matches.map(m => m.species))).filter(Boolean);
    const matchedVarieties = Array.from(new Set(matches.map(m => m.variety_name))).filter(Boolean);

    if (matchedSpecies.length > 0) setFormSpecies(matchedSpecies[0]);
    if (matchedVarieties.length > 0) setFormVariety(matchedVarieties[0]);
  }, [formBatch, formCompany, formLocation]);

  // Auto calculate production weight in KG
  useEffect(() => {
    const mcVal = parseFloat(formNoOfMc) || 0;
    const looseVal = parseFloat(formLoose) || 0;
    const selectedStyle = packingStyles.find(p => p.packing_style === formPackingStyle);

    if (!selectedStyle) {
      setFormProductionQty('0.00');
      return;
    }

    const mcWeight = parseFloat(selectedStyle.mc_weight) || 0;
    const slabWeight = parseFloat(selectedStyle.slab_weight) || 0;
    const totalQty = (mcVal * mcWeight) + (looseVal * slabWeight);
    setFormProductionQty(totalQty.toFixed(2));
  }, [formNoOfMc, formLoose, formPackingStyle, packingStyles]);

  // Form submission handler
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (
      !formCompany ||
      !formLocation ||
      !formBatch ||
      !formSpecies ||
      !formVariety ||
      !formBrand ||
      !formPackingStyle ||
      !formType
    ) {
      alert('Please fill in all mandatory fields.');
      return;
    }

    setLoading(true);
    const formData = new URLSearchParams();
    formData.append('production_for', formCompany);
    formData.append('production_at', formLocation);
    formData.append('batch_number', formBatch);
    formData.append('species', formSpecies);
    formData.append('variety_name', formVariety);
    formData.append('brand', formBrand);
    formData.append('grade', formGrade);
    formData.append('glaze', formGlaze);
    formData.append('freezer', formFreezer);
    formData.append('production_type', formType);
    formData.append('packing_style', formPackingStyle);
    formData.append('no_of_mc', String(parseInt(formNoOfMc) || 0));
    formData.append('loose', String(parseInt(formLoose) || 0));
    formData.append('production_qty', String(parseFloat(formProductionQty) || 0.0));

    try {
      const res = await fetch('/processing/production', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      if (res.ok) {
        alert('Production Worksheet Entry Saved Successfully!');
        setShowEntryModal(false);
        resetForm();
        fetchBackendData();
      } else {
        alert('Failed to save Production entry.');
      }
    } catch (err) {
      console.error(err);
      alert('Connection error. Could not save Production worksheet.');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormCompany('');
    setFormLocation('');
    setFormBatch('');
    setFormSpecies('');
    setFormVariety('');
    setFormBrand('');
    setFormGrade('');
    setFormGlaze('');
    setFormFreezer('');
    setFormType('');
    setFormPackingStyle('');
    setFormNoOfMc('0');
    setFormLoose('0');
    setFormProductionQty('0.00');
  };

  // Status Change and Deletions
  const handleUpdateSoakingStatus = async (id, status) => {
    if (status === 'Completed') {
      const confirm = window.confirm(
        'Are you sure you want to complete soaking? This batch will move to production logs.'
      );
      if (!confirm) {
        fetchBackendData();
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch(`/processing/production/update_soaking_status/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        fetchBackendData();
      } else {
        alert('Failed to update soaking status');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to update status.');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRejectionCompleted = async (id) => {
    if (window.confirm('Confirm rejection floor balance processed?')) {
      setLoading(true);
      try {
        const res = await fetch(`/processing/production/complete_rejection/${id}`, {
          method: 'POST',
        });
        if (res.ok) {
          fetchBackendData();
        } else {
          alert('Failed to process rejection completion.');
        }
      } catch (err) {
        console.error(err);
        alert('Failed to complete rejection.');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDeleteLog = async (id) => {
    const reason = window.prompt('Are you sure you want to cancel this production entry? Please enter a cancellation reason:');
    if (reason === null) return;
    if (!reason.trim()) {
      alert('Cancellation reason is required!');
      return;
    }
    setLoading(true);
    try {
      const formData = new URLSearchParams();
      formData.append('cancel_reason', reason.trim());
      const res = await fetch(`/processing/production/delete/${id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData,
      });
      if (res.ok) {
        alert('Production Entry Cancelled Successfully');
        setSelectedLogId(null);
        fetchBackendData();
      } else {
        const data = await res.json();
        alert(data.error || 'Cancellation failed');
      }
    } catch (err) {
      console.error(err);
      alert('Connection error cancelling record.');
    } finally {
      setLoading(false);
    }
  };

  // Global Filter Matrix
  const matchesFilters = (item, type) => {
    const itemCompany = (item.production_for || item.company_name || '').toLowerCase().trim();
    const itemVariety = (item.variety_name || item.variety || '').toLowerCase().trim();
    const itemGlaze = (item.glaze || item.count_glaze || '').toLowerCase().trim().replace('%', '');
    const itemFreezer = (item.freezer || '').toLowerCase().trim();
    const itemGrade = (item.grade || '').toLowerCase().trim();

    const targetCompany = filterCompany.toLowerCase().trim();
    const targetVariety = filterVariety.toLowerCase().trim();
    const targetGlaze = filterGlaze.toLowerCase().trim().replace('%', '');
    const targetFreezer = filterFreezer.toLowerCase().trim();
    const targetGrade = filterGrade.toLowerCase().trim();

    const search = searchTerm.toLowerCase().trim();
    const searchString = `${item.batch_number || item.po_number || ''} ${item.buyer || ''} ${item.brand || ''} ${item.sintex_number || ''} ${item.variety_name || item.variety || ''}`.toLowerCase();

    const matchesSearch = !search || searchString.includes(search);
    const compMatch = !targetCompany || itemCompany === targetCompany || itemCompany.includes(targetCompany);
    const varMatch = !targetVariety || itemVariety === targetVariety || itemVariety.includes(targetVariety);

    if (type === 'soaking' || type === 'rejection') {
      return compMatch && varMatch && !targetGlaze && !targetFreezer && !targetGrade && matchesSearch;
    }

    const glazeMatch = !targetGlaze || itemGlaze === targetGlaze;
    const freezerMatch = !targetFreezer || itemFreezer === targetFreezer || itemFreezer.includes(targetFreezer);
    const gradeMatch = !targetGrade || itemGrade === targetGrade || itemGrade.includes(targetGrade);

    return compMatch && varMatch && glazeMatch && freezerMatch && gradeMatch && matchesSearch;
  };

  // Grouped active soaking lines mapping
  const getGroupedSoaking = () => {
    const filtered = soakingData.filter(s => s.status !== 'Completed' && matchesFilters(s, 'soaking'));
    const grouped = {};
    filtered.forEach(s => {
      const comp = s.production_for || 'General Company';
      const loc = s.production_at || 'General Location';
      if (!grouped[comp]) grouped[comp] = {};
      if (!grouped[comp][loc]) grouped[comp][loc] = [];
      grouped[comp][loc].push(s);
    });
    return grouped;
  };

  // Grouped rejection mapping
  const getGroupedRejection = () => {
    const filtered = rejectionData.filter(r => matchesFilters(r, 'rejection'));
    const grouped = {};
    filtered.forEach(r => {
      const comp = r.production_for || 'General Company';
      if (!grouped[comp]) grouped[comp] = [];
      grouped[comp].push(r);
    });
    return grouped;
  };

  // Grouped requirements mapping (PO Number)
  const getGroupedRequirements = () => {
    const filtered = pendingOrders.filter(p => matchesFilters(p, 'pending'));
    const grouped = {};
    filtered.forEach(p => {
      const po = p.po_number || 'NO-PO';
      if (!grouped[po]) grouped[po] = [];
      grouped[po].push(p);
    });
    return grouped;
  };

  // Active Soaking Timers Formatter
  const getTimerValue = (dateStr, timeStr) => {
    if (!dateStr || !timeStr) return '00:00:00';
    try {
      const diff = now - new Date(`${dateStr}T${timeStr}`);
      if (diff < 0) return '00:00:00';
      const hrs = Math.floor(diff / 3600000).toString().padStart(2, '0');
      const mins = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
      const secs = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');
      return `${hrs}:${mins}:${secs}`;
    } catch (e) {
      return '00:00:00';
    }
  };

  const getGlazeDisplayName = (g) => {
    if (typeof g !== 'string') return String(g);
    if (!g.endsWith('%') && !isNaN(parseFloat(g))) return `${g}%`;
    return g;
  };

  const openTraceDetails = (jsonStr, title) => {
    if (!jsonStr) {
      setDetailsModal({ isOpen: true, title, data: [] });
      return;
    }
    try {
      const parsed = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
      setDetailsModal({ isOpen: true, title, data: Array.isArray(parsed) ? parsed : [parsed] });
    } catch (err) {
      console.error('Error parsing details JSON:', err);
      setDetailsModal({ isOpen: true, title, data: [] });
    }
  };

  const renderTraceModal = () => {
    if (!detailsModal.isOpen) return null;
    return (
      <div style={modalOverlayStyle} onClick={() => setDetailsModal({ isOpen: false, title: '', data: [] })}>
        <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px', marginBottom: '16px', alignItems: 'center' }}>
            <h3 style={{ margin: 0, textTransform: 'uppercase', fontSize: '12px', fontWeight: '800', color: 'var(--corp-dash)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Info size={16} /> {detailsModal.title}
            </h3>
            <button 
              onClick={() => setDetailsModal({ isOpen: false, title: '', data: [] })} 
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
            >
              <X size={18} />
            </button>
          </div>
          <div style={{ maxHeight: '350px', overflowY: 'auto' }}>
            {detailsModal.data.length === 0 ? (
              <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '16px', fontSize: '11px' }}>
                No tracking information recorded.
              </p>
            ) : (
              <table className="bknr-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th className="text-left">Trace Info</th>
                    <th className="text-right">Value/Qty (Kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {detailsModal.data.map((item, idx) => (
                    <tr key={idx}>
                      <td className="text-left" style={{ fontWeight: '600' }}>
                        {item.po_no || item.location || 'N/A'}
                      </td>
                      <td className="text-right" style={{ fontWeight: '800', color: 'var(--corp-fin)' }}>
                        {parseFloat(item.utilized || item.available || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  };

  const clearFilters = () => {
    setFilterCompany('');
    setFilterVariety('');
    setFilterGlaze('');
    setFilterFreezer('');
    setFilterGrade('');
    setSearchTerm('');
  };

  const soakGroups = getGroupedSoaking();
  const rejGroups = getGroupedRejection();
  const reqGroups = getGroupedRequirements();

  // Aggregate stats
  const activeSoakingQty = soakingData.filter(s => s.status !== 'Completed' && !s.is_cancelled).reduce((sum, item) => sum + (parseFloat(item.in_qty) || 0), 0);
  const rejectionQtySum = rejectionData.filter(r => !r.is_cancelled).reduce((sum, item) => sum + (parseFloat(item.rejection_qty) || 0), 0);
  const productionTodayQty = todayEntries.filter(t => !t.is_cancelled).reduce((sum, item) => sum + (parseFloat(item.production_qty) || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto', gap: '16px', padding: '16px 16px 80px 16px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        <h2 style={{ color: 'var(--corp-dash)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
          <Settings size={20} /> Production Control Worksheet
        </h2>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button 
            onClick={() => setShowEntryModal(true)} 
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={14} /> NEW ENTRY
          </button>
          <button 
            onClick={fetchBackendData} 
            className="btn btn-secondary" 
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spin-animation' : ''} /> {loading ? 'Syncing...' : 'Sync'}
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', flexShrink: 0 }}>
        <div className="card" style={{ padding: '14px', borderLeft: '4px solid var(--corp-dash)' }}>
          <div style={{ fontSize: '9px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Active Soaking Pool</div>
          <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px' }}>{activeSoakingQty.toFixed(2)} Kg</div>
        </div>
        <div className="card" style={{ padding: '14px', borderLeft: '4px solid var(--text-secondary)' }}>
          <div style={{ fontSize: '9px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Rejection Balance</div>
          <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px' }}>{rejectionQtySum.toFixed(2)} Kg</div>
        </div>
        <div className="card" style={{ padding: '14px', borderLeft: '4px solid var(--corp-fin)' }}>
          <div style={{ fontSize: '9px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Today's Production Output</div>
          <div style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text-primary)', marginTop: '4px' }}>{productionTodayQty.toFixed(2)} Kg</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ padding: '12px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end', flexShrink: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '120px', flex: 1 }}>
          <label style={{ fontSize: '9px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Company</label>
          <select 
            className="form-control" 
            value={filterCompany} 
            onChange={e => setFilterCompany(e.target.value)}
          >
            <option value="">All Companies</option>
            {Array.from(new Set(soakingData.map(s => s.production_for))).filter(Boolean).sort().map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '120px', flex: 1 }}>
          <label style={{ fontSize: '9px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Variety</label>
          <select 
            className="form-control" 
            value={filterVariety} 
            onChange={e => setFilterVariety(e.target.value)}
          >
            <option value="">All Varieties</option>
            {varieties.map(v => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '100px', flex: 1 }}>
          <label style={{ fontSize: '9px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Glaze</label>
          <select 
            className="form-control" 
            value={filterGlaze} 
            onChange={e => setFilterGlaze(e.target.value)}
          >
            <option value="">All Glazes</option>
            {glazes.map(g => (
              <option key={g} value={g}>{getGlazeDisplayName(g)}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '110px', flex: 1 }}>
          <label style={{ fontSize: '9px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Freezer</label>
          <select 
            className="form-control" 
            value={filterFreezer} 
            onChange={e => setFilterFreezer(e.target.value)}
          >
            <option value="">All Freezers</option>
            {freezers.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '100px', flex: 1 }}>
          <label style={{ fontSize: '9px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Grade</label>
          <select 
            className="form-control" 
            value={filterGrade} 
            onChange={e => setFilterGrade(e.target.value)}
          >
            <option value="">All Grades</option>
            {grades.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '180px', flex: 2 }}>
          <label style={{ fontSize: '9px', fontWeight: '800', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Search</label>
          <input 
            type="text" 
            className="form-control" 
            placeholder="Search PO, Buyer, Batch..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
          />
        </div>

        <button onClick={clearFilters} className="btn btn-secondary" style={{ padding: '0 16px', height: '34px' }}>
          Clear
        </button>
      </div>

      {/* Grid: Soaking Timers & Rejection stock */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: '16px', flexShrink: 0 }}>
        {/* Soaking Timers */}
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--corp-dash)' }}>Active Soaking Lines</span>
            <span className="badge badge-warning">{Object.values(soakGroups).reduce((acc, comp) => acc + Object.values(comp).reduce((a, l) => a + l.length, 0), 0)} Timer Lines</span>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: '320px', padding: '12px' }}>
            <table className="bknr-table" style={{ width: '100%', minWidth: '420px' }}>
              <thead>
                <tr>
                  <th>Sintex</th>
                  <th>Batch</th>
                  <th className="text-left">Variety</th>
                  <th>Cnt</th>
                  <th className="text-right">Qty</th>
                  <th>Timer</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(soakGroups).length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center" style={{ color: 'var(--text-tertiary)', padding: '16px' }}>No active soaking timers.</td>
                  </tr>
                ) : (
                  Object.keys(soakGroups).map(company => {
                    const collapsed = collapsedSoakComps[company];
                    return (
                      <React.Fragment key={company}>
                        <tr 
                          onClick={() => setCollapsedSoakComps(prev => ({ ...prev, [company]: !prev[company] }))}
                          style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.01)' }}
                        >
                          <td colSpan="7" style={{ fontWeight: '800', color: 'var(--corp-dash)', textAlign: 'left', paddingLeft: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                              <span>{company}</span>
                              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', marginLeft: 'auto', marginRight: '8px' }}>
                                Total: {Object.values(soakGroups[company]).reduce((acc, list) => acc + list.reduce((a, s) => a + (parseFloat(s.in_qty) || 0), 0), 0).toFixed(2)} Kg
                              </span>
                            </div>
                          </td>
                        </tr>
                        {!collapsed && Object.keys(soakGroups[company]).map(loc => {
                          const list = soakGroups[company][loc];
                          return (
                            <React.Fragment key={loc}>
                              <tr style={{ background: 'rgba(255,255,255,0.005)' }}>
                                <td colSpan="7" style={{ fontWeight: '700', fontSize: '10px', textAlign: 'left', paddingLeft: '24px', color: 'var(--text-secondary)' }}>
                                  Location: {loc}
                                </td>
                              </tr>
                              {list.map(s => (
                                <tr key={s.id}>
                                  <td style={{ color: 'var(--corp-dash)', fontWeight: '800' }}>{s.sintex_number}</td>
                                  <td style={{ fontWeight: '700' }}>{s.batch_number}</td>
                                  <td className="text-left">{s.variety_name}</td>
                                  <td>{s.in_count}</td>
                                  <td className="text-right" style={{ fontWeight: '700' }}>{parseFloat(s.in_qty).toFixed(2)}</td>
                                  <td style={{ fontFamily: 'monospace', fontWeight: '800', color: 'var(--text-secondary)' }}>
                                    {getTimerValue(s.date, s.time)}
                                  </td>
                                  <td>
                                    <select 
                                      className="form-control" 
                                      style={{ height: '26px', padding: '0 4px', fontSize: '9px', fontWeight: '700', border: '1px solid var(--border-light)', minWidth: '70px' }}
                                      value={s.status} 
                                      onChange={e => handleUpdateSoakingStatus(s.id, e.target.value)}
                                    >
                                      <option value="Pending">PND</option>
                                      <option value="Running">RUN</option>
                                      <option value="Completed">DONE</option>
                                    </select>
                                  </td>
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Rejection Stock Floor */}
        <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
          <div style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>Rejection Stock Floor</span>
            <span className="badge badge-secondary" style={{ marginLeft: 'auto' }}>{rejectionData.length} Items</span>
          </div>
          <div style={{ overflowY: 'auto', maxHeight: '320px', padding: '12px' }}>
            <table className="bknr-table" style={{ width: '100%', minWidth: '380px' }}>
              <thead>
                <tr>
                  <th>Batch</th>
                  <th className="text-left">Variety</th>
                  <th>Cnt</th>
                  <th className="text-right">Rej Qty</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(rejGroups).length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center" style={{ color: 'var(--text-tertiary)', padding: '16px' }}>No active rejection stock floor.</td>
                  </tr>
                ) : (
                  Object.keys(rejGroups).map(company => {
                    const collapsed = collapsedRejComps[company];
                    const items = rejGroups[company];
                    return (
                      <React.Fragment key={company}>
                        <tr 
                          onClick={() => setCollapsedRejComps(prev => ({ ...prev, [company]: !prev[company] }))}
                          style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.01)' }}
                        >
                          <td colSpan="5" style={{ fontWeight: '800', color: 'var(--text-secondary)', textAlign: 'left', paddingLeft: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                              <span>{company}</span>
                              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', marginLeft: 'auto', marginRight: '8px' }}>
                                Total: {items.reduce((acc, r) => acc + (parseFloat(r.rejection_qty) || 0), 0).toFixed(2)} Kg
                              </span>
                            </div>
                          </td>
                        </tr>
                        {!collapsed && items.map(r => (
                          <tr key={r.id}>
                            <td style={{ fontWeight: '800', color: 'var(--corp-dash)' }}>{r.batch_number}</td>
                            <td className="text-left">{r.variety_name}</td>
                            <td>{r.in_count}</td>
                            <td className="text-right">
                              <span style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#d97706', padding: '2px 6px', borderRadius: '3px', fontWeight: '800' }}>
                                {r.rejection_qty}
                              </span>
                            </td>
                            <td>
                              <button 
                                className="btn btn-primary"
                                style={{ background: 'var(--corp-fin)', color: '#fff', padding: '3px 8px', borderRadius: '4px', height: '22px', fontSize: '9px', fontWeight: '700' }}
                                onClick={() => handleMarkRejectionCompleted(r.id)}
                              >
                                DONE
                              </button>
                            </td>
                          </tr>
                        ))}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Yield Requirements */}
      <div className="card" style={{ padding: '0', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--corp-rep)' }}>Dynamic Yield Production Requirements</span>
          <span className="badge badge-success">{pendingOrders.length} Order Rows</span>
        </div>
        <div className="table-responsive">
          <table className="bknr-table" style={{ minWidth: '2200px' }}>
            <thead>
              <tr>
                <th style={{ width: '40px' }}>Sl</th>
                <th style={{ width: '130px' }} className="text-left">Company</th>
                <th style={{ width: '95px' }}>PO Number</th>
                <th style={{ width: '140px' }} className="text-left">Buyer</th>
                <th style={{ width: '85px' }}>Ship Date</th>
                <th style={{ width: '120px' }} className="text-left">Packing Style</th>
                <th style={{ width: '110px' }} className="text-left">Brand</th>
                <th style={{ width: '75px' }}>Sps</th>
                <th style={{ width: '115px' }} className="text-left">Var</th>
                <th style={{ width: '65px' }}>CG%</th>
                <th style={{ width: '65px' }}>WG%</th>
                <th style={{ width: '75px' }}>Grd</th>
                <th style={{ width: '75px' }}>NW Grd</th>
                <th style={{ width: '75px' }} className="text-right">Pcs</th>
                <th style={{ width: '75px' }} className="text-right">Ord MC</th>
                <th style={{ width: '75px' }} className="text-right">Stk MC</th>
                <th style={{ width: '75px', background: 'rgba(245, 158, 11, 0.05)', color: 'var(--text-secondary)' }} className="text-right">Pnd MC</th>
                <th style={{ width: '75px', background: 'var(--row-hover)' }} className="text-right">Net Cnt</th>
                <th style={{ width: '75px', background: 'var(--row-hover)' }} className="text-right">HL Cnt</th>
                <th style={{ width: '75px', background: 'var(--row-hover)' }} className="text-right">HOSO Cnt</th>
                <th style={{ width: '90px' }} className="text-right">Ord Qty</th>
                <th style={{ width: '90px' }} className="text-right">Avl Stk</th>
                <th style={{ width: '85px' }} className="text-right">Utilized</th>
                <th style={{ width: '130px' }} className="text-left">Ref Stock</th>
                <th style={{ width: '90px' }} className="text-right">Pnd Prd</th>
                <th style={{ width: '95px', background: 'rgba(245,158,11,0.05)', color: '#f59e0b' }} className="text-right">REQ HLSO</th>
                <th style={{ width: '95px', background: 'rgba(245,158,11,0.05)', color: '#f59e0b' }} className="text-right">REQ HOSO</th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(reqGroups).length === 0 ? (
                <tr>
                  <td colSpan="27" className="text-center" style={{ color: 'var(--text-tertiary)', padding: '20px' }}>
                    No requirements found matching criteria.
                  </td>
                </tr>
              ) : (
                Object.keys(reqGroups).map(poNo => {
                  const items = reqGroups[poNo];
                  const first = items[0];
                  const collapsed = collapsedReqPOs[poNo];
                  const totalPendingMC = items.reduce((acc, row) => acc + (parseFloat(row.no_of_mc) - (parseFloat(row.stock_mc) || 0)), 0);

                  return (
                    <React.Fragment key={poNo}>
                      <tr 
                        onClick={() => setCollapsedReqPOs(prev => ({ ...prev, [poNo]: !prev[poNo] }))}
                        style={{ cursor: 'pointer', background: 'rgba(255,255,255,0.02)' }}
                      >
                        <td colSpan="16" style={{ fontWeight: '800', color: 'var(--corp-dash)', textAlign: 'left', paddingLeft: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                            <span>PO: <b>{poNo}</b> | {first.buyer} ({first.company_name})</span>
                          </div>
                        </td>
                        <td style={{ background: 'rgba(245, 158, 11, 0.05)', color: 'var(--text-secondary)', fontWeight: '800', textAlign: 'right', paddingRight: '10px' }}>
                          {totalPendingMC.toFixed(0)}
                        </td>
                        <td colSpan="10"></td>
                      </tr>
                      {!collapsed && items.map(row => {
                        const pendingMC = (parseFloat(row.no_of_mc) || 0) - (parseFloat(row.stock_mc) || 0);
                        return (
                          <tr key={row.id}>
                            <td>{row.sl_no}</td>
                            <td className="text-left" style={{ fontWeight: '700' }}>{row.company_name}</td>
                            <td style={{ color: 'var(--corp-dash)', fontWeight: '700' }}>{row.po_number}</td>
                            <td className="text-left">{row.buyer}</td>
                            <td>{row.shipment_date}</td>
                            <td className="text-left">{row.packing_style}</td>
                            <td className="text-left">{row.brand}</td>
                            <td>{row.species}</td>
                            <td className="text-left">{row.variety}</td>
                            <td>{row.count_glaze}</td>
                            <td>{row.weight_glaze}</td>
                            <td>{row.grade}</td>
                            <td>{row.nw_grade}</td>
                            <td className="text-right">{row.no_of_pieces}</td>
                            <td className="text-right">{row.no_of_mc}</td>
                            <td className="text-right">{row.stock_mc || 0}</td>
                            <td className="text-right" style={{ background: 'rgba(245, 158, 11, 0.02)', color: 'var(--text-secondary)', fontWeight: '700' }}>{pendingMC.toFixed(0)}</td>
                            <td className="text-right" style={{ background: 'var(--row-hover)', fontWeight: '700' }}>{row.net_count_calc}</td>
                            <td className="text-right" style={{ background: 'var(--row-hover)', fontWeight: '700' }}>{row.hl_count_calc}</td>
                            <td className="text-right" style={{ background: 'var(--row-hover)', fontWeight: '700' }}>{row.hoso_count_calc}</td>
                            <td className="text-right">{row.ordered_qty}</td>
                            <td className="text-right">{row.available_stock}</td>
                            <td className="text-right">
                              <span 
                                style={traceBadgeStyle}
                                onClick={() => openTraceDetails(row.util_json, 'Stock Tracking Breakdown')}
                              >
                                {row.existed_stock_util}
                              </span>
                            </td>
                            <td className="text-left">
                              <span 
                                style={{ ...traceBadgeStyle, background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}
                                onClick={() => openTraceDetails(row.ref_json, 'Referral Stock Location Maps')}
                              >
                                {row.ref_opt_stock}
                              </span>
                            </td>
                            <td className="text-right" style={{ color: parseFloat(row.pending_production) < 0 ? 'var(--corp-ops)' : 'var(--success)', fontWeight: '800' }}>{row.pending_production}</td>
                            <td className="text-right" style={{ color: '#f59e0b', fontWeight: '800' }}>{row.req_hlso_qty}</td>
                            <td className="text-right" style={{ color: '#f59e0b', fontWeight: '800' }}>{row.req_hoso_qty}</td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transaction Logs */}
      <div className="card" style={{ padding: '0', overflow: 'hidden', flexShrink: 0 }}>
        <div style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--corp-fin)' }}>Today's Production Transaction Log</span>
          <span className="badge badge-success">{todayEntries.length} Saved Logs</span>
        </div>
        <div className="table-responsive" style={{ flexShrink: 0 }}>
          <table className="bknr-table" style={{ minWidth: '1465px' }}>
            <thead>
              <tr>
                <th className="text-center" style={{ width: '60px' }}>ID</th>
                <th className="text-left" style={{ width: '130px' }}>Company</th>
                <th className="text-center" style={{ width: '100px' }}>Batch</th>
                <th className="text-center" style={{ width: '90px' }}>Type</th>
                <th className="text-left" style={{ width: '110px' }}>Loc</th>
                <th className="text-center" style={{ width: '80px' }}>Sps</th>
                <th className="text-left" style={{ width: '110px' }}>Brand</th>
                <th className="text-left" style={{ width: '120px' }}>Variety</th>
                <th className="text-center" style={{ width: '70px' }}>Glaze</th>
                <th className="text-left" style={{ width: '110px' }}>Freezer</th>
                <th className="text-center" style={{ width: '70px' }}>Grade</th>
                <th className="text-left" style={{ width: '130px' }}>Packing Style</th>
                <th className="text-right" style={{ width: '70px' }}>MC</th>
                <th className="text-right" style={{ width: '70px' }}>Loose</th>
                <th className="text-right" style={{ width: '85px' }}>Total KG</th>
                <th className="text-center" style={{ width: '60px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {todayEntries.filter(row => matchesFilters(row, 'logs')).length === 0 ? (
                <tr>
                  <td colSpan="16" className="text-center" style={{ color: 'var(--text-tertiary)', padding: '16px' }}>No production entries recorded today.</td>
                </tr>
              ) : (
                todayEntries.filter(row => matchesFilters(row, 'logs')).map(row => (
                  <tr 
                    key={row.id}
                    className={row.is_cancelled ? 'cancelled-row' : ''}
                    onClick={() => {
                      if (row.is_cancelled) {
                        setSelectedLogId(null);
                      } else {
                        setSelectedLogId(row.id === selectedLogId ? null : row.id);
                      }
                    }}
                    style={{ 
                      background: selectedLogId === row.id ? 'var(--row-selected)' : 'transparent', 
                      cursor: 'pointer',
                      opacity: row.is_cancelled ? 0.55 : 1,
                      textDecoration: row.is_cancelled ? 'line-through' : 'none',
                      color: row.is_cancelled ? 'var(--cancelled-text)' : 'inherit'
                    }}
                  >
                    <td className="text-center">{row.id}</td>
                    <td className="text-left">{row.production_for}</td>
                    <td style={{ fontWeight: '800', color: 'var(--corp-dash)' }} className="text-center">{row.batch_number}</td>
                    <td style={{ color: 'var(--corp-fin)', fontWeight: '700' }} className="text-center">{row.production_type}</td>
                    <td className="text-left">{row.production_at}</td>
                    <td className="text-center">{row.species}</td>
                    <td className="text-left">{row.brand}</td>
                    <td className="text-left">{row.variety_name}</td>
                    <td className="text-center">{row.glaze}</td>
                    <td className="text-left">{row.freezer}</td>
                    <td className="text-center">{row.grade}</td>
                    <td className="text-left">{row.packing_style}</td>
                    <td className="text-right">{row.is_cancelled ? 0 : row.no_of_mc}</td>
                    <td className="text-right">{row.is_cancelled ? 0 : row.loose}</td>
                    <td className="text-right" style={{ fontWeight: '800', color: 'var(--corp-dash)' }}>{(row.is_cancelled ? 0 : parseFloat(row.production_qty)).toFixed(2)}</td>
                    <td className="text-center">
                      {!row.is_cancelled && (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteLog(row.id);
                          }} 
                          style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }}
                          title="Cancel entry"
                        >
                          <Trash2 size={13} />
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

      {/* Entry Modal Panel */}
      {showEntryModal && (
        <div style={modalOverlayStyle} onClick={() => setShowEntryModal(false)}>
          <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px', marginBottom: '16px', alignItems: 'center' }}>
              <h3 style={{ margin: 0, textTransform: 'uppercase', fontSize: '13px', fontWeight: '800', color: 'var(--corp-dash)' }}>
                New Production Entry
              </h3>
              <button 
                onClick={() => setShowEntryModal(false)} 
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Production For *</label>
                  <select 
                    className="form-control" 
                    value={formCompany} 
                    onChange={e => setFormCompany(e.target.value)}
                    required
                    disabled={Boolean(globalProductionFor && globalProductionFor !== 'ALL')}
                  >
                    <option value="">Select Company</option>
                    {prodForList.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Location (Production At) *</label>
                  <select 
                    className="form-control" 
                    value={formLocation} 
                    onChange={e => setFormLocation(e.target.value)}
                    required
                    disabled={Boolean(globalLocation && globalLocation !== 'ALL')}
                  >
                    <option value="">Select Location</option>
                    {prodAtList.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Batch / PO Number *</label>
                  <select 
                    className="form-control" 
                    value={formBatch} 
                    onChange={e => setFormBatch(e.target.value)}
                    required
                  >
                    <option value="">Select Batch</option>
                    {getFilteredBatches().map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Species *</label>
                  <select 
                    className="form-control" 
                    value={formSpecies} 
                    onChange={e => setFormSpecies(e.target.value)}
                    required
                  >
                    <option value="">Select Species</option>
                    {species.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Variety *</label>
                  <select 
                    className="form-control" 
                    value={formVariety} 
                    onChange={e => setFormVariety(e.target.value)}
                    required
                  >
                    <option value="">Select Variety</option>
                    {varieties.map(v => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Brand *</label>
                  <select 
                    className="form-control" 
                    value={formBrand} 
                    onChange={e => setFormBrand(e.target.value)}
                    required
                  >
                    <option value="">Select Brand</option>
                    {brands.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Grade</label>
                  <select 
                    className="form-control" 
                    value={formGrade} 
                    onChange={e => setFormGrade(e.target.value)}
                  >
                    <option value="">Select Grade</option>
                    {grades.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Glaze (%)</label>
                  <select 
                    className="form-control" 
                    value={formGlaze} 
                    onChange={e => setFormGlaze(e.target.value)}
                  >
                    <option value="">Select Glaze</option>
                    {glazes.map(g => <option key={g} value={g}>{getGlazeDisplayName(g)}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Freezer</label>
                  <select 
                    className="form-control" 
                    value={formFreezer} 
                    onChange={e => setFormFreezer(e.target.value)}
                  >
                    <option value="">Select Freezer</option>
                    {freezers.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Production Type *</label>
                  <select 
                    className="form-control" 
                    value={formType} 
                    onChange={e => setFormType(e.target.value)}
                    required
                  >
                    <option value="">Select Type</option>
                    {prodTypesList.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Packing Style *</label>
                  <select 
                    className="form-control" 
                    value={formPackingStyle} 
                    onChange={e => setFormPackingStyle(e.target.value)}
                    required
                  >
                    <option value="">Select Style</option>
                    {packingStyles.map(p => (
                      <option key={p.packing_style} value={p.packing_style}>
                        {p.packing_style} (MC: {p.mc_weight}Kg, Slab: {p.slab_weight}Kg)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>No. of MC</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    value={formNoOfMc} 
                    onChange={e => setFormNoOfMc(e.target.value)} 
                    placeholder="0" 
                  />
                </div>

                <div className="form-group">
                  <label>Loose (Slabs)</label>
                  <input 
                    type="number" 
                    className="form-control" 
                    value={formLoose} 
                    onChange={e => setFormLoose(e.target.value)} 
                    placeholder="0" 
                  />
                </div>

                <div className="form-group">
                  <label>Total weight (Kg)</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    value={formProductionQty} 
                    readOnly 
                    style={{ fontWeight: '800', color: 'var(--corp-dash)', textAlign: 'center' }} 
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                <button 
                  type="button" 
                  onClick={() => { setShowEntryModal(false); resetForm(); }} 
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="btn btn-primary"
                  style={{ flex: 2 }}
                >
                  Save Production Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Render trace popup */}
      {renderTraceModal()}
    </div>
  );
}

// Inline modal styles matching standard glassmorphism UI overlay
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
  maxWidth: '850px',
  boxShadow: 'var(--shadow-float)',
  color: 'var(--text-primary)'
};

const traceBadgeStyle = {
  background: 'var(--row-hover)',
  color: 'var(--corp-dash)',
  padding: '2px 6px',
  borderRadius: '4px',
  fontWeight: '800',
  cursor: 'pointer',
  display: 'inline-block'
};
