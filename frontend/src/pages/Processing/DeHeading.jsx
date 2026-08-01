import React, { useState, useEffect, useRef } from 'react';
import { Scissors, Plus, Ban, Calendar, Clock, Mail, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import { Chart, registerables } from 'chart.js';
import { sessionFetch } from '../../utils/sessionFetch';
import ExpressionWeightInput from '../../components/ExpressionWeightInput';
import WeightBreakdownCell from '../../components/WeightBreakdownCell';
Chart.register(...registerables);

const uniqueValues = values => Array.from(
  new Set((values || []).map(value => String(value ?? '').trim()).filter(Boolean))
);

export default function DeHeading() {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

  // Form states (isolated from page filters)
  const [modalProductionFor, setModalProductionFor] = useState('');
  const [modalLocation, setModalLocation] = useState('');
  const [productionFor, setProductionFor] = useState('');
  const [deheadingAt, setDeheadingAt] = useState('');
  const [species, setSpecies] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  const [hosoCount, setHosoCount] = useState('');
  const [hosoQty, setHosoQty] = useState('');
  const [hlsoQty, setHlsoQty] = useState('');
  const [hlsoQtyExpr, setHlsoQtyExpr] = useState('');  // raw expression e.g. '25+30*2'
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

  // Selected row & Table Registration
  const [selectedId, setSelectedId] = useState(null);
  const [tableNo, setTableNo] = useState('');
  const [subTab, setSubTab] = useState('operations'); // 'operations' | 'tableRegistration'
  
  // Table Registration state
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

  // Tree collapse state
  const [collapsedComps, setCollapsedComps] = useState({});
  const [collapsedLocs, setCollapsedLocs] = useState({});
  const balanceChartCanvasRef = useRef(null);
  const balanceChartInstanceRef = useRef(null);

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

      const res = await fetch(`/processing/de_heading?${queryParams.toString()}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
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
        const pList = data.prod_for_list || [];
        const locList = data.peeling_locations || [];
        setSpeciesList(data.species || []);
        setPeelingLocations(locList);
        setProdForList(pList);
        setTodayEntries(data.today_data || []);
        setHosoFloorBalance(data.hoso_floor_balance || []);

        setFilterCompany(activeComp || data.selected_production_for || '');
        setFilterLocation(activeLoc || data.selected_location || '');
        setProductionFor(activeComp || data.selected_production_for || '');
        setDeheadingAt(activeLoc || data.selected_location || '');
        setRegPeelingAt(activeLoc || data.selected_location || '');
      } else {
        console.error('Failed to fetch De-heading data');
      }

      const regRes = await fetch(`/processing/de_heading/table_registrations`, { credentials: 'include' });
      if (regRes.ok) {
        const regData = await regRes.json();
        setRegisteredTables(regData.table_registrations || []);
      }
    } catch (err) {
      console.error('Error fetching De-heading data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Sync state defaults when modal opens or option lists update
  useEffect(() => {
    if (showModal) {
      const activeComp = localStorage.getItem('production_for_filter') || filterCompany || '';
      const activeLoc = localStorage.getItem('plant_location_filter') || filterLocation || '';
      setModalProductionFor(activeComp || (prodForList.length > 0 ? prodForList[0] : ''));
      setModalLocation(activeLoc || (peelingLocations.length > 0 ? peelingLocations[0] : ''));
    }
  }, [showModal, prodForList, peelingLocations, filterCompany, filterLocation]);

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

  // Cascading lists load for Entry Modal
  useEffect(() => {
    const loadBatches = async () => {
      if (!modalProductionFor || !modalLocation) {
        setBatchesList([]);
        return;
      }
      try {
        const res = await sessionFetch(`/processing/get_valid_batches/${encodeURIComponent(modalProductionFor)}/${encodeURIComponent(modalLocation)}`);
        if (res.ok) {
          const data = await res.json();
          setBatchesList(uniqueValues(data.batches).sort());
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadBatches();
  }, [modalProductionFor, modalLocation]);

  useEffect(() => {
    const loadCounts = async () => {
      if (!modalProductionFor || !modalLocation || !batchNumber) {
        setCountsList([]);
        return;
      }
      try {
        const res = await sessionFetch(`/processing/get_hoso/${encodeURIComponent(modalProductionFor)}/${encodeURIComponent(modalLocation)}/${encodeURIComponent(batchNumber)}`);
        if (res.ok) {
          const data = await res.json();
          setCountsList(uniqueValues(data.counts).sort());
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadCounts();
  }, [modalProductionFor, modalLocation, batchNumber]);

  // Check Floor Quantity
  useEffect(() => {
    const checkFloor = async () => {
      if (!modalLocation || !batchNumber || !hosoCount || !species) {
        setFloorAvail(0);
        return;
      }
      try {
        const params = new URLSearchParams({ 
          location: modalLocation, 
          production_for: modalProductionFor,
          batch: batchNumber, 
          count: hosoCount, 
          species_name: species 
        });
        const res = await sessionFetch(`/processing/get_available_qty?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setFloorAvail(data.available_qty || 0);
        }
      } catch (err) {
        console.error(err);
      }
    };
    checkFloor();
  }, [modalProductionFor, modalLocation, batchNumber, hosoCount, species]);

  // Fetch Contractor Rate
  useEffect(() => {
    const getRate = async () => {
      if (!contractor) {
        setRatePerKg(0);
        return;
      }
      try {
        const params = new URLSearchParams();
        if (hosoCount) params.append('count', hosoCount);
        const res = await sessionFetch(`/processing/get_rate/${encodeURIComponent(contractor)}?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setRatePerKg(data.rate || 0);
        }
      } catch (err) {
        console.error(err);
      }
    };
    getRate();
  }, [contractor, hosoCount]);

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
    formData.append('production_for', modalProductionFor);
    formData.append('deheading_at', modalLocation);
    formData.append('batch_number', batchNumber);
    formData.append('hoso_count', hosoCount);
    formData.append('species', species);
    formData.append('hoso_qty', String(hosoQty));
    formData.append('hlso_qty', String(hlsoQty));
    if (hlsoQtyExpr) formData.append('hlso_qty_expr', hlsoQtyExpr);
    formData.append('yield_percent', yieldPercent + '%');
    formData.append('contractor', contractor);
    formData.append('table_no', tableNo);
    formData.append('rate_per_kg', String(ratePerKg));
    formData.append('amount', String(amount));

    try {
      const res = await sessionFetch('/processing/de_heading', {
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
        setHlsoQtyExpr('');
        setContractor('');
        setTableNo('');
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

  const handleSaveTableRegistration = async (e) => {
    e.preventDefault();
    if (!regTableNo.trim()) {
      alert('Table Number is required!');
      return;
    }

    const cleanLocation = regPeelingAt || deheadingAt || '';
    if (!cleanLocation.trim()) {
      alert('Peeling At / Location is required!');
      return;
    }
    const formattedTableNo = formattedPreviewTableNo || regTableNo.trim();

    const getBaseName = (name) => String(name || '').replace(/\s*\(\d+(st|nd|rd|th)\)\s*$/i, '').trim();
    const baseInput = getBaseName(formattedTableNo);
    const existingMatches = registeredTables.filter(r => 
      r.table_no && getBaseName(r.table_no).toLowerCase() === baseInput.toLowerCase()
    );

    let isConfirmedShift = false;
    if (existingMatches.length > 0) {
      const getOrdinal = (n) => {
        if (11 <= (n % 100) && (n % 100) <= 13) return n + 'th';
        return n + ({1:'st',2:'nd',3:'rd'}[n % 10] || 'th');
      };
      const nextShift = existingMatches.length + 1;
      const baseCleanName = baseInput.match(/^\d+$/) ? `Table ${baseInput}` : baseInput;
      const nextTableNo = `${baseCleanName} (${getOrdinal(nextShift)})`;
      const lastReg = existingMatches[existingMatches.length - 1];
      const lastInfo = lastReg.contractor_name ? `Contractor (${lastReg.contractor_name})` : lastReg.worker_type;

      const confirmShift = window.confirm(
        `Table '${baseCleanName}' is already registered today (${existingMatches.length} time(s), last under ${lastInfo}).\n\nDo you want to register Shift ${nextShift} as '${nextTableNo}'?`
      );
      if (!confirmShift) return;
      isConfirmedShift = true;
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
    const postData = async (confirmFlag = false) => {
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
      if (confirmFlag) formData.append('confirm_shift', 'true');

      const res = await sessionFetch('/processing/de_heading/table_registration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
      });

      if (res.status === 409) {
        const data = await res.json().catch(() => ({}));
        if (data.already_exists) {
          if (window.confirm(data.error || 'Table already registered today. Register for new shift?')) {
            await postData(true);
            return;
          } else {
            setLoading(false);
            return;
          }
        }
      }

      if (res.ok) {
        const resJson = await res.json().catch(() => ({}));
        const registeredName = resJson.table_no || formattedTableNo;
        alert(`Table '${registeredName}' Registered Successfully!`);
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
    };

    try {
      await postData(isConfirmedShift);
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
      const res = await sessionFetch(`/processing/de_heading/table_registration/delete/${id}`, { method: 'POST' });
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
      const res = await sessionFetch(`/processing/de_heading/delete/${id}`, {
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

  // Helper vibrant colors for chart locations
  // Helper unique vibrant colors per Company (Production For)
  const getCompanyColor = (companyName) => {
    const colors = [
      '#2563EB', // Royal Blue
      '#059669', // Emerald Green
      '#D97706', // Amber Gold
      '#7C3AED', // Purple Violet
      '#DB2777', // Rose Pink
      '#0891B2', // Vibrant Cyan
      '#EA580C', // Bright Orange
      '#4F46E5', // Deep Indigo
      '#0D9488', // Teal
      '#DC2626', // Crimson Red
    ];
    let hash = 0;
    const str = String(companyName || 'General Stock').trim().toUpperCase();
    for (let i = 0; i < str.length; i++) { hash = str.charCodeAt(i) + ((hash << 5) - hash); }
    return colors[Math.abs(hash) % colors.length];
  };

  // Live calculation & filtering of Floor Balance Dashboard
  const getProcessedFloorData = () => {
    let filteredList = [];
    let totals = 0;
    let countsSet = new Set();
    let batchesSet = new Set();
    let chartMap = {}; // count -> { company -> qty }

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
      chartMap[countVal][comp] = (chartMap[countVal][comp] || 0) + qty;
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

  useEffect(() => {
    if (balanceChartInstanceRef.current) {
      balanceChartInstanceRef.current.destroy();
      balanceChartInstanceRef.current = null;
    }

    const counts = Object.keys(chartMap).sort();
    if (!balanceChartCanvasRef.current || !counts.length) return undefined;

    const companies = Array.from(new Set(counts.flatMap(count => Object.keys(chartMap[count] || {}))));
    const rootStyles = getComputedStyle(document.documentElement);
    const textColor = rootStyles.getPropertyValue('--text-secondary').trim() || '#64748b';
    const gridColor = rootStyles.getPropertyValue('--border-light').trim() || 'rgba(148, 163, 184, 0.2)';

    const barValueLabelsPlugin = {
      id: 'barValueLabels',
      afterDatasetsDraw(chart) {
        const { ctx } = chart;
        const countTotals = {};

        chart.data.datasets.forEach((dataset, datasetIndex) => {
          const meta = chart.getDatasetMeta(datasetIndex);
          if (meta.hidden) return;

          meta.data.forEach((element, index) => {
            const val = Number(dataset.data[index] || 0);
            if (val > 0) {
              countTotals[index] = (countTotals[index] || 0) + val;
            }
          });
        });

        Object.keys(countTotals).forEach(indexStr => {
          const index = Number(indexStr);
          const totalVal = countTotals[index];
          if (totalVal > 0) {
            let topY = chart.chartArea.bottom;
            let barX = 0;
            chart.data.datasets.forEach((_, datasetIndex) => {
              const meta = chart.getDatasetMeta(datasetIndex);
              if (!meta.hidden && meta.data[index]) {
                const el = meta.data[index];
                topY = Math.min(topY, el.y);
                barX = el.x;
              }
            });

            ctx.save();
            ctx.fillStyle = textColor;
            ctx.font = '800 10px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            const totalTxt = totalVal >= 1000 ? `${(totalVal / 1000).toFixed(1)}k` : `${totalVal.toFixed(2)}`;
            ctx.fillText(`${totalTxt} KG`, barX, topY - 3);
            ctx.restore();
          }
        });
      }
    };

    balanceChartInstanceRef.current = new Chart(balanceChartCanvasRef.current, {
      type: 'bar',
      plugins: [barValueLabelsPlugin],
      data: {
        labels: counts,
        datasets: companies.map(company => ({
          label: company,
          data: counts.map(count => Number(chartMap[count]?.[company] || 0)),
          backgroundColor: getCompanyColor(company),
          borderWidth: 0,
          borderRadius: 3,
          barThickness: 16,
        })),
      },
      options: {
        indexAxis: 'x',
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 250 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: textColor, boxWidth: 10, boxHeight: 10, padding: 12, font: { size: 10, weight: 600 } },
          },
          tooltip: {
            callbacks: { label: context => `${context.dataset.label}: ${Number(context.raw || 0).toFixed(2)} Kg` },
          },
        },
        scales: {
          x: {
            stacked: true,
            ticks: { color: textColor, font: { size: 10, weight: 700 } },
            grid: { display: false },
            title: { display: true, text: 'Count', color: textColor, font: { size: 10, weight: 700 } },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            ticks: { color: textColor, font: { size: 10 } },
            grid: { color: gridColor },
            title: { display: true, text: 'Quantity (KG)', color: textColor, font: { size: 10, weight: 700 } },
          },
        },
      },
    });

    return () => {
      if (balanceChartInstanceRef.current) {
        balanceChartInstanceRef.current.destroy();
        balanceChartInstanceRef.current = null;
      }
    };
  }, [hosoFloorBalance, filterCompany, filterLocation, filterSpecies]);

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

  // Rendering a stacked column chart with count labels on the bottom axis
  const renderCustomBarChart = () => {
    const sortedCounts = Object.keys(chartMap).sort();
    if (sortedCounts.length === 0) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)', fontSize: '11px' }}>
          No data matches selected filters.
        </div>
      );
    }

    return (
      <div style={{ position: 'relative', width: '100%', height: '250px' }}>
        <canvas ref={balanceChartCanvasRef} />
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
            onClick={() => setShowModal(true)} 
            className="btn btn-primary" 
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={14} /> Add New Entry
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
              Register De-Heading Table Number
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
                    const isLocMatch = (tableLoc, targetLoc) => {
                      if (!targetLoc || !tableLoc) return true;
                      const cleanA = String(tableLoc).toLowerCase().replace(/[-_\s]+/g, '');
                      const cleanB = String(targetLoc).toLowerCase().replace(/[-_\s]+/g, '');
                      return cleanA === cleanB || cleanA.includes(cleanB) || cleanB.includes(cleanA);
                    };
                    const displayedTables = registeredTables.filter(reg => isLocMatch(reg.production_at, filterLocation));
                    if (displayedTables.length === 0) {
                      return (
                        <tr>
                          <td colSpan="9" className="text-center" style={{ color: 'var(--text-secondary)', padding: '20px' }}>
                            No tables registered for today in {filterLocation || 'selected location'}.
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
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.65fr 1.35fr', gap: '16px', marginBottom: '25px', flexShrink: 0 }}>
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
                                          <td style={{ padding: '3px 0', textAlign: 'right', fontWeight: '750', color: 'var(--corp-dash)' }}>{(Number(i.available_qty) || 0).toFixed(2)} KG</td>
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
          <div style={{ fontSize: '16px', fontWeight: '900', color: 'var(--corp-dash)', margin: '8px 0 20px 0' }}>{uniqueBatches}</div>
          <div style={{ width: '80%', height: '1px', background: 'var(--border-light)', marginBottom: '20px' }} />
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Unique Count Grades</div>
          <div style={{ fontSize: '16px', fontWeight: '900', color: 'var(--corp-dash)', marginTop: '8px' }}>{uniqueCounts}</div>
        </div>

        {/* Chart Panel */}
        <div className="card" style={{ padding: '0px', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px', background: 'rgba(255,255,255,0.01)', borderBottom: '1px solid var(--border-light)', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase', color: 'var(--corp-dash)' }}>
            Count-Wise Stacked Balance (KG)
          </div>
          <div style={{ flex: 1, padding: '10px', overflow: 'hidden' }}>
            {renderCustomBarChart()}
          </div>
        </div>
      </div>

      {/* Today's Log Entries Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexShrink: 0 }}>
        <h3 style={{ fontSize: '13px', fontWeight: '800', margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          Today's De-Heading Logs
        </h3>
      </div>

      {/* Logs Table */}
      <div className="table-responsive" style={{ flexShrink: 0 }}>
        <table className="bknr-table" id="mainTable" style={{ minWidth: '1200px' }}>
          <thead>
            <tr>
              <th className="text-center" style={{ width: '60px' }}>Sl. No</th>
              <th className="text-center" style={{ width: '100px' }}>Table No</th>
              <th className="text-left" style={{ width: '130px' }}>Location</th>
              <th className="text-left" style={{ width: '140px' }}>Production For</th>
              <th className="text-center" style={{ width: '150px' }}>Batch / Count</th>
              <th className="text-left" style={{ width: '130px' }}>Species</th>
              <th className="text-right" style={{ width: '110px' }}>HOSO (In)</th>
              <th className="text-right" style={{ width: '110px' }}>HLSO (Out)</th>
              <th className="text-center" style={{ width: '100px' }}>Yield %</th>
              <th className="text-left" style={{ width: '150px' }}>Contractor</th>
              <th className="text-center" style={{ width: '100px' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(groupedEntries).length === 0 ? (
              <tr>
                <td colSpan="11" className="text-center" style={{ color: 'var(--text-secondary)', padding: '20px' }}>
                  No de-heading logs recorded today.
                </td>
              </tr>
            ) : (
              (() => {
                const totalLogs = Object.values(groupedEntries).reduce((sum, r) => sum + r.length, 0);
                let globalIndex = totalLogs;
                return Object.entries(groupedEntries).map(([loc, rows]) => {
                  const subHoso = rows.reduce((acc, r) => acc + (r.is_cancelled ? 0 : (parseFloat(r.hoso_qty) || 0)), 0);
                  const subHlso = rows.reduce((acc, r) => acc + (r.is_cancelled ? 0 : (parseFloat(r.hlso_qty) || 0)), 0);

                  return (
                    <React.Fragment key={loc}>
                      {rows.map(row => {
                        const currentNo = globalIndex;
                        globalIndex -= 1;
                        return (
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
                            <td className="text-center" style={{ fontWeight: '700' }}>{currentNo}</td>
                            <td className="text-center" style={{ fontWeight: '700', color: 'var(--corp-dash)' }}>{row.table_no || '-'}</td>
                        <td className="text-left">{row.peeling_at}</td>
                        <td className="text-left" style={{ fontWeight: '600', color: 'var(--corp-dash)' }}>{row.production_for}</td>
                        <td className="text-center">{row.batch_number} / {row.hoso_count}</td>
                        <td className="text-left">{row.species}</td>
                        <td className="text-right" style={{ fontWeight: '700', color: 'var(--corp-dash)' }}>{row.hoso_qty}</td>
                        <td className="text-right" style={{ fontWeight: '700' }}>
                          <WeightBreakdownCell value={row.hlso_qty} expr={row.hlso_qty_expr} />
                        </td>
                        <td className="text-center">{row.yield_percent}%</td>
                        <td className="text-left">{row.contractor}</td>
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
                    );
                  })}
                    {/* Subtotal row */}
                    <tr style={{ background: 'rgba(255, 255, 255, 0.015)', fontWeight: 'bold' }}>
                      <td colSpan="6" className="text-right" style={{ paddingRight: '12px' }}>Subtotal ({loc}):</td>
                      <td className="text-right" style={{ color: 'var(--corp-dash)', fontWeight: '800' }}>{subHoso.toFixed(2)}</td>
                      <td className="text-right" style={{ fontWeight: '800' }}>{subHlso.toFixed(2)}</td>
                      <td colSpan="3"></td>
                    </tr>
                  </React.Fragment>
                );
              });
            })()
          )}
          </tbody>
        </table>
      </div>
        </>
      )}

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
                    value={modalProductionFor} 
                    onChange={e => {
                      setModalProductionFor(e.target.value);
                      setBatchNumber('');
                      setHosoCount('');
                    }} 
                    required
                  >
                    {prodForList.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>

                </div>

                <div className="form-group">
                  <label>Location *</label>
                  <select 
                    className="form-control" 
                    value={modalLocation} 
                    onChange={e => {
                      setModalLocation(e.target.value);
                      setBatchNumber('');
                      setHosoCount('');
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
                      const isLocMatch = (tableLoc, targetLoc) => {
                        if (!targetLoc || !tableLoc) return true;
                        const cleanA = String(tableLoc).toLowerCase().replace(/[-_\s]+/g, '');
                        const cleanB = String(targetLoc).toLowerCase().replace(/[-_\s]+/g, '');
                        return cleanA === cleanB || cleanA.includes(cleanB) || cleanB.includes(cleanA);
                      };
                      const locFiltered = registeredTables.filter(r => isLocMatch(r.production_at, modalLocation));
                      if (locFiltered.length === 0) {
                        return <option value="" disabled>No tables created for today in {modalLocation || 'selected location'}</option>;
                      }

                      // 2-hour shift retirement for older shift tables when a newer shift is created
                      const now = new Date();
                      const getBaseName = (name) => String(name || '').replace(/\s*\(\d+(st|nd|rd|th)\)\s*$/i, '').trim();
                      const groupedByBase = {};
                      locFiltered.forEach(r => {
                        const base = getBaseName(r.table_no).toLowerCase();
                        if (!groupedByBase[base]) groupedByBase[base] = [];
                        groupedByBase[base].push(r);
                      });

                      const activeShiftTables = [];
                      Object.values(groupedByBase).forEach(regs => {
                        regs.sort((a, b) => a.id - b.id);
                        for (let i = 0; i < regs.length; i++) {
                          const currentReg = regs[i];
                          const newerReg = regs[i + 1];
                          if (newerReg && newerReg.created_at) {
                            const newerTime = new Date(newerReg.created_at);
                            const diffHours = (now - newerTime) / (1000 * 60 * 60);
                            if (diffHours >= 2) {
                              continue; // Retire older shift 2 hours after newer shift creation
                            }
                          }
                          activeShiftTables.push(currentReg);
                        }
                      });

                      return activeShiftTables.map(r => (
                        <option key={r.id} value={r.table_no}>
                          {r.table_no} ({r.worker_type}{r.contractor_name ? ` - ${r.contractor_name}` : ''})
                        </option>
                      ));
                    })()}
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
                    {batchesList.map((b, idx) => <option key={`${b}-${idx}`} value={b}>{b}</option>)}
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
                    {countsList.map((c, idx) => <option key={`${c}-${idx}`} value={c}>{c}</option>)}
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
                  <ExpressionWeightInput
                    value={hlsoQty}
                    onChange={setHlsoQty}
                    onExprChange={setHlsoQtyExpr}
                    placeholder="0.00 or 25+30-5*2"
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
                    <option value="KG BASIS">KG BASIS</option>
                    <option value="DAILY BASIS">DAILY BASIS</option>
                    {contractorsList.filter(c => c !== 'KG BASIS' && c !== 'DAILY BASIS').map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
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
