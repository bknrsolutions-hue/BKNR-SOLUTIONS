import React, { useState, useEffect, useRef } from 'react';
import './bknr-masters.css';

export default function ProductionFor({ user }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'id', direction: 'desc' });
  const [notification, setNotification] = useState(null);

  // Form states
  const [recordId, setRecordId] = useState('');
  const [productionFor, setProductionFor] = useState('');
  const [applyFrom, setApplyFrom] = useState('');
  const [freeDays, setFreeDays] = useState(0);
  const [status, setStatus] = useState('Active');
  
  // Rate parameters
  const [iceRate, setIceRate] = useState('');
  const [gradingRate, setGradingRate] = useState('');
  const [peelingRate, setPeelingRate] = useState('');
  const [deheadingRate, setDeheadingRate] = useState('');

  // Freezer & MC parameters
  const [freezerName, setFreezerName] = useState('');
  const [repackingCost, setRepackingCost] = useState('');
  const [ratePerMcDay, setRatePerMcDay] = useState('');

  // Glaze Matrix state
  const glazeKeys = ["NWNC", "20", "25", "30", "35", "40", "45", "50", "55", "60"];
  const [glazeCosts, setGlazeCosts] = useState({
    NWNC: '', '20': '', '25': '', '30': '', '35': '',
    '40': '', '45': '', '50': '', '55': '', '60': ''
  });

  const dotsRef = useRef(null);

  const showNotification = (type, text) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 3000);
  };

  const loadData = () => {
    setLoading(true);
    fetch('/criteria/api/production_for')
      .then(res => res.json())
      .then(resData => {
        if (resData.status === 'success' && Array.isArray(resData.data)) {
          setData(resData.data);
        } else {
          showNotification('error', 'Failed to retrieve database records.');
        }
      })
      .catch(err => {
        console.error(err);
        showNotification('error', 'Connection to database failed.');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    const handleOutsideClick = (e) => {
      if (dotsRef.current && !dotsRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, []);

  const clearForm = () => {
    setRecordId('');
    setProductionFor('');
    setApplyFrom('');
    setFreeDays(0);
    setStatus('Active');
    setIceRate('');
    setGradingRate('');
    setPeelingRate('');
    setDeheadingRate('');
    setFreezerName('');
    setRepackingCost('');
    setRatePerMcDay('');
    setGlazeCosts({
      NWNC: '', '20': '', '25': '', '30': '', '35': '',
      '40': '', '45': '', '50': '', '55': '', '60': ''
    });
    setSelectedRow(null);
    setFormOpen(false);
  };

  const handleGlazeChange = (key, value) => {
    setGlazeCosts(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (recordId) {
        // Edit mode: Update single row via JSON API
        const glazePct = selectedRow?.glaze_percent || 'NWNC';
        const key = glazePct.replace('%', '');
        const cost = glazeCosts[key] || 0;

        const payload = {
          id: recordId,
          production_for: productionFor,
          apply_from: applyFrom,
          free_days: freeDays,
          status,
          ice_rate_per_kg: iceRate ? parseFloat(iceRate) : 0.0,
          grading_rate_per_kg: gradingRate ? parseFloat(gradingRate) : 0.0,
          peeling_rate_per_kg: peelingRate ? parseFloat(peelingRate) : 0.0,
          deheading_rate_per_kg: deheadingRate ? parseFloat(deheadingRate) : 0.0,
          freezer_name: freezerName,
          repacking_cost_per_kg: repackingCost ? parseFloat(repackingCost) : 0.0,
          rate_per_mc_day: ratePerMcDay ? parseFloat(ratePerMcDay) : 0.0,
          glaze_percent: glazePct,
          production_cost_per_kg: parseFloat(cost)
        };

        const res = await fetch('/criteria/api/production_for', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          showNotification('success', 'Costing Matrix updated successfully!');
          clearForm();
          loadData();
        } else {
          const text = await res.text();
          showNotification('error', `Update failed: ${text}`);
        }
      } else {
        // Add mode: Post FormData to /criteria/production_for for multi-glaze generation
        const formData = new FormData();
        formData.append('production_for', productionFor);
        formData.append('apply_from', applyFrom);
        formData.append('free_days', freeDays);
        formData.append('status', status);
        formData.append('ice_rate_per_kg', iceRate || '0');
        formData.append('grading_rate_per_kg', gradingRate || '0');
        formData.append('peeling_rate_per_kg', peelingRate || '0');
        formData.append('deheading_rate_per_kg', deheadingRate || '0');
        formData.append('freezer_name', freezerName || '');
        formData.append('repacking_cost_per_kg', repackingCost || '0');
        formData.append('rate_per_mc_day', ratePerMcDay || '0');

        glazeKeys.forEach(k => {
          if (glazeCosts[k]) {
            formData.append(`prod_cost_${k}`, glazeCosts[k]);
          }
        });

        const res = await fetch('/criteria/production_for', {
          method: 'POST',
          body: formData
        });

        const result = await res.json();
        if (result.success) {
          showNotification('success', `Saved structure with ${result.rows_created} glaze records!`);
          clearForm();
          loadData();
        } else {
          showNotification('error', 'Failed to save costing structures.');
        }
      }
    } catch (err) {
      console.error(err);
      showNotification('error', 'Network failure during save operation.');
    }
  };

  const handleEdit = () => {
    if (!selectedRow) return;
    setRecordId(selectedRow.id);
    setProductionFor(selectedRow.production_for || '');
    setApplyFrom(selectedRow.apply_from || '');
    setFreeDays(selectedRow.free_days ?? 0);
    setStatus(selectedRow.status || 'Active');
    setIceRate(selectedRow.ice_rate_per_kg ?? '');
    setGradingRate(selectedRow.grading_rate_per_kg ?? '');
    setPeelingRate(selectedRow.peeling_rate_per_kg ?? '');
    setDeheadingRate(selectedRow.deheading_rate_per_kg ?? '');
    setFreezerName(selectedRow.freezer_name || '');
    setRepackingCost(selectedRow.repacking_cost_per_kg ?? '');
    setRatePerMcDay(selectedRow.rate_per_mc_day ?? '');

    // Reset glaze costs and prefill selected row's glaze cost
    const glazePct = selectedRow.glaze_percent || 'NWNC';
    const key = glazePct.replace('%', '');
    setGlazeCosts({
      NWNC: '', '20': '', '25': '', '30': '', '35': '',
      '40': '', '45': '', '50': '', '55': '', '60': '',
      [key]: selectedRow.production_cost_per_kg ?? ''
    });

    setFormOpen(true);
    setMenuOpen(false);
  };

  const handleDelete = async () => {
    if (!selectedRow) return;
    if (!window.confirm('Drop this production costing configuration profile matrix permanently?')) return;

    try {
      const res = await fetch(`/criteria/production_for/delete/${selectedRow.id}`, {
        method: 'POST'
      });

      if (res.ok) {
        showNotification('success', 'Costing Matrix deleted successfully.');
        clearForm();
        loadData();
      } else {
        showNotification('error', 'Database deletion request failed.');
      }
    } catch (err) {
      console.error(err);
      showNotification('error', 'Network failure during delete.');
    }
  };

  // Sorting and Filtering
  const sortedData = React.useMemo(() => {
    let result = [...data];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(row =>
        Object.values(row).some(val =>
          val !== null && val !== undefined && String(val).toLowerCase().includes(q)
        )
      );
    }

    if (sortConfig.key) {
      result.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        if (typeof valA === 'string') valA = valA.toLowerCase();
        if (typeof valB === 'string') valB = valB.toLowerCase();

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [data, searchQuery, sortConfig]);

  const requestSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const printSelected = () => {
    if (!selectedRow) return;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
      <head>
        <title>Production Costing - #${selectedRow.id}</title>
        <style>
          body { font-family: 'Inter', sans-serif; padding: 30px; color: #1e293b; line-height: 1.5; }
          h2 { border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; text-transform: uppercase; font-size: 16px; letter-spacing: 0.5px; }
          .item { margin-bottom: 12px; }
          .label { font-weight: 700; color: #64748b; font-size: 11px; text-transform: uppercase; }
          .value { font-size: 13px; font-weight: 600; margin-top: 2px; }
        </style>
      </head>
      <body>
        <h2>Production Costing Matrix Details</h2>
        <div class="item"><div class="label">System ID</div><div class="value">#${selectedRow.id}</div></div>
        <div class="item"><div class="label">Production For</div><div class="value">${selectedRow.production_for}</div></div>
        <div class="item"><div class="label">Apply From</div><div class="value">${selectedRow.apply_from}</div></div>
        <div class="item"><div class="label">Freezer Name</div><div class="value">${selectedRow.freezer_name || 'N/A'}</div></div>
        <div class="item"><div class="label">Glaze Percent</div><div class="value">${selectedRow.glaze_percent || 'N/A'}</div></div>
        <div class="item"><div class="label">Production Cost / KG</div><div class="value">₹${selectedRow.production_cost_per_kg || '0.00'}</div></div>
        <div class="item"><div class="label">Repacking Cost / KG</div><div class="value">₹${selectedRow.repacking_cost_per_kg || '0.00'}</div></div>
        <div class="item"><div class="label">Rate / MC Day</div><div class="value">₹${selectedRow.rate_per_mc_day || '0.00'}</div></div>
        <div class="item"><div class="label">Ice Rate / KG</div><div class="value">₹${selectedRow.ice_rate_per_kg || '0.00'}</div></div>
        <div class="item"><div class="label">Grading Rate / KG</div><div class="value">₹${selectedRow.grading_rate_per_kg || '0.00'}</div></div>
        <div class="item"><div class="label">Peeling Rate / KG</div><div class="value">₹${selectedRow.peeling_rate_per_kg || '0.00'}</div></div>
        <div class="item"><div class="label">Deheading Rate / KG</div><div class="value">₹${selectedRow.deheading_rate_per_kg || '0.00'}</div></div>
        <div class="item"><div class="label">Status</div><div class="value">${selectedRow.status}</div></div>
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  const exportExcel = () => {
    if (!selectedRow) return;
    const headers = ['ID', 'Production For', 'Apply From', 'Freezer Name', 'Glaze %', 'Prod Cost', 'Repack Cost', 'Rate/MC Day', 'Ice Cost', 'Grading Cost', 'Peeling Cost', 'Deheading Cost', 'Status'];
    const fieldsVal = [
      selectedRow.id,
      selectedRow.production_for,
      selectedRow.apply_from,
      selectedRow.freezer_name || '',
      selectedRow.glaze_percent || '',
      selectedRow.production_cost_per_kg || 0,
      selectedRow.repacking_cost_per_kg || 0,
      selectedRow.rate_per_mc_day || 0,
      selectedRow.ice_rate_per_kg || 0,
      selectedRow.grading_rate_per_kg || 0,
      selectedRow.peeling_rate_per_kg || 0,
      selectedRow.deheading_rate_per_kg || 0,
      selectedRow.status
    ];

    const blob = new Blob([[headers.join('\t'), fieldsVal.join('\t')].join('\n')], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `production_for_costing_${selectedRow.id}.xls`;
    link.click();
  };

  return (
    <div style={{ flex: 1, padding: '8px', overflowY: 'auto', display: 'flex', flexDirection: 'column', height: '100%' }}>
      {notification && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', padding: '12px 24px', borderRadius: '8px',
          color: '#ffffff', fontWeight: 700, fontSize: '12px', zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          background: notification.type === 'success' ? 'var(--corp-fin)' : '#ef4444'
        }}>
          {notification.text}
        </div>
      )}

      {/* Header */}
      <div className="master-header">
        <div className="master-header-titles">
          <h2><i className="fa-solid fa-calculator"></i> Production For – Costing Master</h2>
        </div>
      </div>

      {/* Form */}
      {formOpen && (
        <form onSubmit={handleSubmit}>
          <div className="master-form-container">
            <div className="master-form-grid">
              <div className="master-form-title-inner">
                <i className="fa-solid fa-calculator"></i> Production Base Parameters
              </div>

              <div className="master-field">
                <label>Production For *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Internal / Client name"
                  value={productionFor}
                  onChange={(e) => setProductionFor(e.target.value)}
                />
              </div>

              <div className="master-field">
                <label>Apply From *</label>
                <input
                  type="date"
                  required
                  value={applyFrom}
                  onChange={(e) => setApplyFrom(e.target.value)}
                />
              </div>

              <div className="master-field">
                <label>Free Days</label>
                <input
                  type="number"
                  value={freeDays}
                  onChange={(e) => setFreeDays(parseInt(e.target.value) || 0)}
                />
              </div>

              <div className="master-field">
                <label>Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>

              <div className="master-field">
                <label>Ice ₹ / KG</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={iceRate}
                  onChange={(e) => setIceRate(e.target.value)}
                />
              </div>

              <div className="master-field">
                <label>Grading ₹ / KG</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={gradingRate}
                  onChange={(e) => setGradingRate(e.target.value)}
                />
              </div>

              <div className="master-field">
                <label>Peeling ₹ / KG</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={peelingRate}
                  onChange={(e) => setPeelingRate(e.target.value)}
                />
              </div>

              <div className="master-field">
                <label>Deheading ₹ / KG</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={deheadingRate}
                  onChange={(e) => setDeheadingRate(e.target.value)}
                />
              </div>
            </div>

            {/* Freezer Segment */}
            <div style={{ marginTop: '20px', padding: '16px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-light)', borderRadius: '8px' }}>
              <div className="master-form-title-inner" style={{ color: '#0284c7' }}>
                <i className="fa-solid fa-snowflake"></i> Freezer & Glaze Matrix Segments
              </div>

              <div className="master-form-grid">
                <div className="master-field">
                  <label>Freezer Name</label>
                  <input
                    type="text"
                    placeholder="e.g. IQF / Plate Freezer"
                    value={freezerName}
                    onChange={(e) => setFreezerName(e.target.value)}
                  />
                </div>

                <div className="master-field">
                  <label>Repack ₹ / KG</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={repackingCost}
                    onChange={(e) => setRepackingCost(e.target.value)}
                  />
                </div>

                <div className="master-field">
                  <label>MC / Day</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={ratePerMcDay}
                    onChange={(e) => setRatePerMcDay(e.target.value)}
                  />
                </div>
              </div>

              {/* Glaze Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))',
                gap: '8px',
                marginTop: '12px',
                padding: '12px',
                background: 'var(--input-bg)',
                border: '1px solid var(--border-light)',
                borderRadius: '8px'
              }}>
                {glazeKeys.map(k => (
                  <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', textAlign: 'center' }}>
                      {k === 'NWNC' ? 'NWNC' : `${k}%`}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      style={{ textAlign: 'center', padding: '6px 4px', fontSize: '11px' }}
                      value={glazeCosts[k]}
                      onChange={(e) => handleGlazeChange(k, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="master-actions">
              <button className="master-btn master-btn-primary" type="submit">
                <i className="fa-solid fa-check"></i> {recordId ? 'UPDATE' : 'SAVE'}
              </button>
              <button className="master-btn master-btn-clear" type="button" onClick={clearForm}>
                <i className="fa-solid fa-xmark"></i> CANCEL
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Toolbar */}
      <div className="master-table-header-bar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <h3 className="master-table-title">Active Costing Matrices</h3>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {!formOpen && (
                <div className="master-top-actions">
                  <button className="master-btn master-btn-primary" onClick={() => setFormOpen(true)}>
                    <i className="fa-solid fa-plus"></i> Add Costing
                  </button>
                </div>
              )}

              {selectedRow && (
                <div className="master-menu-container" ref={dotsRef}>
                  <button className="master-dots-trigger" onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}>
                    <i className="fa-solid fa-ellipsis-vertical"></i>
                  </button>
                  {menuOpen && (
                    <div className="master-dropdown-menu">
                      <div className="master-menu-item" onClick={handleEdit}>
                        <i className="fa-solid fa-pen"></i> Edit
                      </div>
                      <div className="master-menu-item" onClick={printSelected}>
                        <i className="fa-solid fa-print"></i> Print
                      </div>
                      <div className="master-menu-item" onClick={printSelected}>
                        <i className="fa-solid fa-file-pdf"></i> PDF
                      </div>
                      <div className="master-menu-item" onClick={exportExcel}>
                        <i className="fa-solid fa-file-excel"></i> Excel
                      </div>
                      <div className="master-menu-item danger" onClick={handleDelete}>
                        <i className="fa-solid fa-trash"></i> Delete
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="master-search-bar">
            <input
              type="text"
              placeholder="Search registry records..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Retrieving registry...
        </div>
      ) : sortedData.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--surface-panel)', border: '1px solid var(--border-light)', borderRadius: '12px' }}>
          No costing matrix configurations mapped in the system yet.
        </div>
      ) : (
        <>
          <div className="master-table-wrap">
            <table className="master-table">
              <thead>
                <tr>
                  <th className="master-th" onClick={() => requestSort('id')} style={{ cursor: 'pointer' }}>ID</th>
                  <th className="master-th" onClick={() => requestSort('production_for')} style={{ cursor: 'pointer' }}>Production For</th>
                  <th className="master-th" onClick={() => requestSort('apply_from')} style={{ cursor: 'pointer' }}>Apply From</th>
                  <th className="master-th" onClick={() => requestSort('freezer_name')} style={{ cursor: 'pointer' }}>Freezer Name</th>
                  <th className="master-th" onClick={() => requestSort('glaze_percent')} style={{ cursor: 'pointer' }}>Glaze %</th>
                  <th className="master-th" onClick={() => requestSort('production_cost_per_kg')} style={{ cursor: 'pointer' }}>Prod Cost</th>
                  <th className="master-th" onClick={() => requestSort('repacking_cost_per_kg')} style={{ cursor: 'pointer' }}>Repack ₹</th>
                  <th className="master-th" onClick={() => requestSort('rate_per_mc_day')} style={{ cursor: 'pointer' }}>MC/Day</th>
                  <th className="master-th" onClick={() => requestSort('ice_rate_per_kg')} style={{ cursor: 'pointer' }}>Ice ₹</th>
                  <th className="master-th" onClick={() => requestSort('grading_rate_per_kg')} style={{ cursor: 'pointer' }}>Grade ₹</th>
                  <th className="master-th" onClick={() => requestSort('peeling_rate_per_kg')} style={{ cursor: 'pointer' }}>Peel ₹</th>
                  <th className="master-th" onClick={() => requestSort('deheading_rate_per_kg')} style={{ cursor: 'pointer' }}>DH ₹</th>
                  <th className="master-th" onClick={() => requestSort('status')} style={{ cursor: 'pointer' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedData.map(row => (
                  <tr
                    key={row.id}
                    className={`master-tr ${selectedRow?.id === row.id ? 'selected' : ''}`}
                    onClick={() => setSelectedRow(selectedRow?.id === row.id ? null : row)}
                  >
                    <td className="master-td">#{row.id}</td>
                    <td className="master-td" style={{ fontWeight: '700', color: 'var(--corp-ops)', textAlign: 'left' }}>
                      {row.production_for}
                    </td>
                    <td className="master-td">{row.apply_from}</td>
                    <td className="master-td" style={{ fontWeight: '600' }}>{row.freezer_name || '-'}</td>
                    <td className="master-td" style={{ fontWeight: '600', color: 'var(--corp-dash)' }}>{row.glaze_percent || '-'}</td>
                    <td className="master-td" style={{ fontWeight: '700' }}>
                      {row.production_cost_per_kg ? `₹${row.production_cost_per_kg.toFixed(2)}` : '-'}
                    </td>
                    <td className="master-td">{row.repacking_cost_per_kg ? `₹${row.repacking_cost_per_kg.toFixed(2)}` : '-'}</td>
                    <td className="master-td">{row.rate_per_mc_day ? `₹${row.rate_per_mc_day.toFixed(2)}` : '-'}</td>
                    <td className="master-td">{row.ice_rate_per_kg ? `₹${row.ice_rate_per_kg.toFixed(2)}` : '-'}</td>
                    <td className="master-td">{row.grading_rate_per_kg ? `₹${row.grading_rate_per_kg.toFixed(2)}` : '-'}</td>
                    <td className="master-td">{row.peeling_rate_per_kg ? `₹${row.peeling_rate_per_kg.toFixed(2)}` : '-'}</td>
                    <td className="master-td">{row.deheading_rate_per_kg ? `₹${row.deheading_rate_per_kg.toFixed(2)}` : '-'}</td>
                    <td className="master-td" style={{
                      fontWeight: '800',
                      color: row.status === 'Active' ? 'var(--success)' : '#ef4444'
                    }}>
                      {row.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile View */}
          <div className="master-mobile-card-list">
            {sortedData.map(row => (
              <div
                key={row.id}
                className={`master-data-card ${selectedRow?.id === row.id ? 'selected' : ''}`}
                onClick={() => setSelectedRow(selectedRow?.id === row.id ? null : row)}
              >
                <div className="master-card-row">
                  <span className="master-card-label">ID</span>
                  <span className="master-card-val">#{row.id}</span>
                </div>
                <div className="master-card-row">
                  <span className="master-card-label">Production For</span>
                  <span className="master-card-val" style={{ color: 'var(--corp-ops)' }}>{row.production_for}</span>
                </div>
                <div className="master-card-row">
                  <span className="master-card-label">Freezer / Glaze</span>
                  <span className="master-card-val">{row.freezer_name || '-'} | {row.glaze_percent || '-'}</span>
                </div>
                <div className="master-card-row">
                  <span className="master-card-label">Prod Cost</span>
                  <span className="master-card-val">{row.production_cost_per_kg ? `₹${row.production_cost_per_kg.toFixed(2)}` : '-'}</span>
                </div>
                <div className="master-card-row">
                  <span className="master-card-label">Status</span>
                  <span className="master-card-val" style={{ color: row.status === 'Active' ? 'var(--success)' : '#ef4444' }}>
                    {row.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
