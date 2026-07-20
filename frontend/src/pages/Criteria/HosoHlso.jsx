import React, { useState, useEffect, useRef } from 'react';
import './bknr-masters.css';

export default function HosoHlso({ user }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'id', direction: 'desc' });
  const [notification, setNotification] = useState(null);

  // Lookups
  const [speciesList, setSpeciesList] = useState([]);

  // Form fields
  const [recordId, setRecordId] = useState('');
  const [speciesVal, setSpeciesVal] = useState('');
  const [hosoCount, setHosoCount] = useState('');
  const [hlsoYieldPct, setHlsoYieldPct] = useState('');

  const dotsRef = useRef(null);

  const showNotification = (type, text) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 3000);
  };

  const loadData = () => {
    setLoading(true);
    fetch('/criteria/api/hoso_hlso')
      .then(res => res.json())
      .then(resData => {
        if (resData.status === 'success' && Array.isArray(resData.data)) {
          setData(resData.data);
        } else {
          showNotification('error', 'Failed to retrieve yield records.');
        }
      })
      .catch(err => {
        console.error(err);
        showNotification('error', 'Connection to database failed.');
      })
      .finally(() => setLoading(false));
  };

  // Load species lookup
  const loadSpecies = () => {
    fetch('/criteria/api/species')
      .then(res => res.json())
      .then(resData => {
        if (resData.status === 'success' && Array.isArray(resData.data)) {
          // Extract unique species names
          const names = resData.data.map(item => item.species_name).filter(Boolean);
          setSpeciesList([...new Set(names)].sort());
        }
      })
      .catch(err => console.error('Failed to load species:', err));
  };

  useEffect(() => {
    loadData();
    loadSpecies();

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
    setSpeciesVal('');
    setHosoCount('');
    setHlsoYieldPct('');
    setSelectedRow(null);
    setFormOpen(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      if (recordId) {
        // Edit mode: Update single row via JSON API
        const parsedHoso = parseInt(hosoCount);
        const parsedYield = parseFloat(hlsoYieldPct);
        const calculatedHlso = Math.floor(parsedHoso / 2.2 / (parsedYield / 100));

        const payload = {
          id: recordId,
          species: speciesVal,
          hoso_count: parsedHoso,
          hlso_yield_pct: parsedYield,
          hlso_count: calculatedHlso
        };

        const res = await fetch('/criteria/api/hoso_hlso', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          showNotification('success', 'Yield mapping updated successfully!');
          clearForm();
          loadData();
        } else {
          const text = await res.text();
          showNotification('error', `Update failed: ${text}`);
        }
      } else {
        // Add mode: Post FormData to /criteria/hoso_hlso to support multi-count range insertion
        const formData = new FormData();
        formData.append('species', speciesVal);
        formData.append('hoso_count', hosoCount.trim());
        formData.append('hlso_yield_pct', hlsoYieldPct);

        const res = await fetch('/criteria/hoso_hlso', {
          method: 'POST',
          body: formData
        });

        const result = await res.json();
        if (result.success) {
          showNotification('success', 'Yield configurations saved successfully!');
          clearForm();
          loadData();
        } else {
          showNotification('error', 'Failed to save configurations.');
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
    setSpeciesVal(selectedRow.species || '');
    setHosoCount(selectedRow.hoso_count ?? '');
    setHlsoYieldPct(selectedRow.hlso_yield_pct ?? '');
    setFormOpen(true);
    setMenuOpen(false);
  };

  const handleDelete = async () => {
    if (!selectedRow) return;
    if (!window.confirm('Completely drop this HOSO → HLSO metrics configuration?')) return;

    try {
      const res = await fetch(`/criteria/hoso_hlso/delete/${selectedRow.id}`, {
        method: 'POST'
      });

      if (res.ok) {
        showNotification('success', 'Yield configuration deleted successfully.');
        clearForm();
        loadData();
      } else {
        showNotification('error', 'Database deletion request failed.');
      }
    } catch (err) {
      console.error(err);
      showNotification('error', 'Network failure during deletion.');
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
        <title>Yield Config - #${selectedRow.id}</title>
        <style>
          body { font-family: 'Inter', sans-serif; padding: 30px; color: #1e293b; line-height: 1.5; }
          h2 { border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; text-transform: uppercase; font-size: 16px; letter-spacing: 0.5px; }
          .item { margin-bottom: 12px; }
          .label { font-weight: 700; color: #64748b; font-size: 11px; text-transform: uppercase; }
          .value { font-size: 13px; font-weight: 600; margin-top: 2px; }
        </style>
      </head>
      <body>
        <h2>HOSO &rarr; HLSO Yield Details</h2>
        <div class="item"><div class="label">System ID</div><div class="value">#${selectedRow.id}</div></div>
        <div class="item"><div class="label">Species Classification</div><div class="value">${selectedRow.species}</div></div>
        <div class="item"><div class="label">HOSO Count</div><div class="value">${selectedRow.hoso_count}</div></div>
        <div class="item"><div class="label">Yield (%)</div><div class="value">${selectedRow.hlso_yield_pct}%</div></div>
        <div class="item"><div class="label">Calculated HLSO Count</div><div class="value"><strong>${selectedRow.hlso_count}</strong></div></div>
        <div class="item" style="margin-top: 30px; border-top: 1px dashed #cbd5e1; padding-top: 15px;">
          <div class="label">Logged Date / Time</div>
          <div class="value">${selectedRow.date || ''} ${selectedRow.time || ''}</div>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  const exportExcel = () => {
    if (!selectedRow) return;
    const headers = ['ID', 'Species Classification', 'HOSO Count', 'Yield (%)', 'Calculated HLSO Count', 'Date', 'Time'];
    const fieldsVal = [
      selectedRow.id,
      selectedRow.species,
      selectedRow.hoso_count,
      selectedRow.hlso_yield_pct,
      selectedRow.hlso_count,
      selectedRow.date || '',
      selectedRow.time || ''
    ];

    const blob = new Blob([[headers.join('\t'), fieldsVal.join('\t')].join('\n')], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `yield_config_${selectedRow.species}_${selectedRow.id}.xls`;
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
          <h2><i className="fa-solid fa-calculator"></i> HOSO &rarr; HLSO Yields Master</h2>
        </div>
      </div>

      {/* Form */}
      {formOpen && (
        <form onSubmit={handleSubmit}>
          <div className="master-form-container">
            <div className="master-form-grid">
              <div className="master-form-title-inner">
                <i className="fa-solid fa-calculator"></i> Species Yield Configuration Mapping
              </div>

              <div className="master-field">
                <label>Species *</label>
                <select
                  required
                  value={speciesVal}
                  onChange={(e) => setSpeciesVal(e.target.value)}
                >
                  <option value="" disabled>Select Species...</option>
                  {speciesList.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div className="master-field">
                <label>HOSO Count * (e.g. 10 or 10 to 20)</label>
                <input
                  type="text"
                  required
                  placeholder="Enter HOSO Count"
                  value={hosoCount}
                  onChange={(e) => setHosoCount(e.target.value)}
                />
              </div>

              <div className="master-field">
                <label>HLSO Yield (%) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={hlsoYieldPct}
                  onChange={(e) => setHlsoYieldPct(e.target.value)}
                />
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
            <h3 className="master-table-title">Yield Metric Configurations</h3>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {!formOpen && (
                <div className="master-top-actions">
                  <button className="master-btn master-btn-primary" onClick={() => setFormOpen(true)}>
                    <i className="fa-solid fa-plus"></i> Add
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
          No yield configurations mapped in the system yet.
        </div>
      ) : (
        <>
          <div className="master-table-wrap">
            <table className="master-table">
              <thead>
                <tr>
                  <th className="master-th" onClick={() => requestSort('id')} style={{ cursor: 'pointer' }}>ID</th>
                  <th className="master-th" onClick={() => requestSort('species')} style={{ cursor: 'pointer' }}>Species Classification</th>
                  <th className="master-th" onClick={() => requestSort('hoso_count')} style={{ cursor: 'pointer' }}>HOSO Count</th>
                  <th className="master-th" onClick={() => requestSort('hlso_yield_pct')} style={{ cursor: 'pointer' }}>Yield (%)</th>
                  <th className="master-th" onClick={() => requestSort('hlso_count')} style={{ cursor: 'pointer' }}>Calculated HLSO Count</th>
                  <th className="master-th" onClick={() => requestSort('date')} style={{ cursor: 'pointer' }}>Log Timestamp</th>
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
                    <td className="master-td text-left" style={{ fontWeight: '700', color: 'var(--corp-ops)' }}>
                      {row.species}
                    </td>
                    <td className="master-td" style={{ fontWeight: '600' }}>{row.hoso_count}</td>
                    <td className="master-td" style={{ fontWeight: '700', color: 'var(--success)' }}>
                      {row.hlso_yield_pct ? `${row.hlso_yield_pct.toFixed(2)}%` : '-'}
                    </td>
                    <td className="master-td"><strong>{row.hlso_count}</strong></td>
                    <td className="master-td" style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                      {row.date || ''} | {row.time || ''}
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
                  <span className="master-card-label">Species Classification</span>
                  <span className="master-card-val" style={{ color: 'var(--corp-ops)' }}>{row.species}</span>
                </div>
                <div className="master-card-row">
                  <span className="master-card-label">HOSO Count</span>
                  <span className="master-card-val">{row.hoso_count}</span>
                </div>
                <div className="master-card-row">
                  <span className="master-card-label">Yield (%)</span>
                  <span className="master-card-val" style={{ color: 'var(--success)' }}>
                    {row.hlso_yield_pct ? `${row.hlso_yield_pct.toFixed(2)}%` : '-'}
                  </span>
                </div>
                <div className="master-card-row">
                  <span className="master-card-label">Calculated HLSO</span>
                  <span className="master-card-val"><strong>{row.hlso_count}</strong></span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
