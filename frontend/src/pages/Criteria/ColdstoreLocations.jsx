import React, { useState, useEffect, useRef } from 'react';
import './bknr-masters.css';

export default function ColdstoreLocations({ user }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'id', direction: 'desc' });
  const [notification, setNotification] = useState(null);

  // Lookups
  const [productionForList, setProductionForList] = useState([]);
  const [productionAtList, setProductionAtList] = useState([]);

  // Form fields
  const [recordId, setRecordId] = useState('');
  const [locationName, setLocationName] = useState('');
  const [productionFor, setProductionFor] = useState('');
  const [productionAt, setProductionAt] = useState('');

  const dotsRef = useRef(null);

  const showNotification = (type, text) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 3000);
  };

  const loadData = () => {
    setLoading(true);
    fetch('/criteria/api/coldstore_locations')
      .then(res => res.json())
      .then(resData => {
        if (resData.status === 'success' && Array.isArray(resData.data)) {
          setData(resData.data);
        } else {
          showNotification('error', 'Failed to retrieve location records.');
        }
      })
      .catch(err => {
        console.error(err);
        showNotification('error', 'Connection to database failed.');
      })
      .finally(() => setLoading(false));
  };

  const loadLookups = () => {
    // Load production_for options
    fetch('/criteria/api/production_for')
      .then(res => res.json())
      .then(resData => {
        if (resData.status === 'success' && Array.isArray(resData.data)) {
          const names = [...new Set(resData.data.map(item => item.production_for).filter(Boolean))].sort();
          setProductionForList(names);
        }
      })
      .catch(err => console.error('Failed to load production_for:', err));

    // Load production_at options
    fetch('/criteria/api/production_at')
      .then(res => res.json())
      .then(resData => {
        if (resData.status === 'success' && Array.isArray(resData.data)) {
          const names = [...new Set(resData.data.map(item => item.production_at).filter(Boolean))].sort();
          setProductionAtList(names);
        }
      })
      .catch(err => console.error('Failed to load production_at:', err));
  };

  useEffect(() => {
    loadData();
    loadLookups();

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
    setLocationName('');
    setProductionFor('');
    setProductionAt('');
    setSelectedRow(null);
    setFormOpen(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const now = new Date();
      const date = now.toISOString().slice(0, 10);
      const time = now.toTimeString().slice(0, 8);

      const formData = new FormData();
      if (recordId) formData.append('id', recordId);
      formData.append('location_name', locationName);
      formData.append('production_for', productionFor);
      formData.append('production_at', productionAt);
      formData.append('date', date);
      formData.append('time', time);

      const res = await fetch('/criteria/coldstore_locations', {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        showNotification('success', recordId ? 'Location updated successfully!' : 'Location saved successfully!');
        clearForm();
        loadData();
      } else {
        const errData = await res.json();
        showNotification('error', errData.error || 'Save failed.');
      }
    } catch (err) {
      console.error(err);
      showNotification('error', 'Network failure during save operation.');
    }
  };

  const handleEdit = () => {
    if (!selectedRow) return;
    setRecordId(selectedRow.id);
    setLocationName(selectedRow.coldstore_location || '');
    setProductionFor(selectedRow.production_for || '');
    setProductionAt(selectedRow.production_at || '');
    setFormOpen(true);
    setMenuOpen(false);
  };

  const handleDelete = async () => {
    if (!selectedRow) return;
    if (!window.confirm('Delete this location?')) return;

    try {
      const res = await fetch(`/criteria/coldstore_locations/delete/${selectedRow.id}`, {
        method: 'POST'
      });

      if (res.ok) {
        showNotification('success', 'Location deleted successfully.');
        clearForm();
        loadData();
      } else {
        showNotification('error', 'Delete failed.');
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
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const printSelected = () => {
    if (!selectedRow) return;
    const p = window.open('', '_blank');
    p.document.write(`
      <html><head><title>Cold Store Location - #${selectedRow.id}</title>
      <style>body{font-family:sans-serif;padding:30px;color:#1e293b;}h2{border-bottom:2px solid #e2e8f0;padding-bottom:8px;text-transform:uppercase;font-size:16px;}
      .item{margin-bottom:12px;}.label{font-weight:700;color:#64748b;font-size:11px;text-transform:uppercase;}.value{font-size:13px;font-weight:600;margin-top:2px;}</style>
      </head><body>
      <h2>Cold Store Location Details</h2>
      <div class="item"><div class="label">System ID</div><div class="value">#${selectedRow.id}</div></div>
      <div class="item"><div class="label">Location Name</div><div class="value">${selectedRow.coldstore_location}</div></div>
      <div class="item"><div class="label">Production For</div><div class="value">${selectedRow.production_for || 'N/A'}</div></div>
      <div class="item"><div class="label">Production At</div><div class="value">${selectedRow.production_at || 'N/A'}</div></div>
      <div class="item"><div class="label">Date / Time</div><div class="value">${selectedRow.date || ''} ${selectedRow.time || ''}</div></div>
      <div class="item"><div class="label">Email</div><div class="value">${selectedRow.email || ''}</div></div>
      </body></html>
    `);
    p.document.close();
    setTimeout(() => p.print(), 500);
  };

  const exportExcel = () => {
    if (!selectedRow) return;
    const headers = ['ID', 'Location Name', 'Production For', 'Production At', 'Date', 'Time', 'Email'];
    const values = [
      selectedRow.id,
      selectedRow.coldstore_location,
      selectedRow.production_for || '',
      selectedRow.production_at || '',
      selectedRow.date || '',
      selectedRow.time || '',
      selectedRow.email || ''
    ];
    const blob = new Blob([[headers.join('\t'), values.join('\t')].join('\n')], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `location_${selectedRow.coldstore_location}_${selectedRow.id}.xls`;
    a.click();
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
          <h2><i className="fa-solid fa-warehouse"></i> Cold Store Locations</h2>
        </div>
      </div>

      {/* Form */}
      {formOpen && (
        <form onSubmit={handleSubmit}>
          <div className="master-form-container">
            <div className="master-form-grid">
              <div className="master-form-title-inner">
                <i className="fa-solid fa-warehouse"></i> Location Profile
              </div>

              <div className="master-field">
                <label>Location Name *</label>
                <input
                  type="text"
                  required
                  placeholder="Enter Location Name"
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                />
              </div>

              <div className="master-field">
                <label>Production For *</label>
                <select
                  required
                  value={productionFor}
                  onChange={(e) => setProductionFor(e.target.value)}
                >
                  <option value="">Select Corporate Entity</option>
                  {productionForList.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              <div className="master-field">
                <label>Plant Location (Production At) *</label>
                <select
                  required
                  value={productionAt}
                  onChange={(e) => setProductionAt(e.target.value)}
                >
                  <option value="">Select Active Plant</option>
                  {productionAtList.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
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
            <h3 className="master-table-title">Location Data Logs</h3>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {!formOpen && (
                <button className="master-btn master-btn-primary" onClick={() => setFormOpen(true)}>
                  <i className="fa-solid fa-plus"></i> Add
                </button>
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
              placeholder="Search locations..."
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
          No cold store locations configured yet.
        </div>
      ) : (
        <>
          <div className="master-table-wrap">
            <table className="master-table">
              <thead>
                <tr>
                  <th className="master-th" onClick={() => requestSort('id')} style={{ cursor: 'pointer' }}>ID</th>
                  <th className="master-th" onClick={() => requestSort('coldstore_location')} style={{ cursor: 'pointer' }}>Location Name</th>
                  <th className="master-th" onClick={() => requestSort('production_for')} style={{ cursor: 'pointer' }}>Production For</th>
                  <th className="master-th" onClick={() => requestSort('production_at')} style={{ cursor: 'pointer' }}>Production At</th>
                  <th className="master-th" onClick={() => requestSort('date')} style={{ cursor: 'pointer' }}>Date</th>
                  <th className="master-th" onClick={() => requestSort('time')} style={{ cursor: 'pointer' }}>Time</th>
                  <th className="master-th" onClick={() => requestSort('email')} style={{ cursor: 'pointer' }}>Email</th>
                  <th className="master-th">Company ID</th>
                </tr>
              </thead>
              <tbody>
                {sortedData.map(row => (
                  <tr
                    key={row.id}
                    className={`master-tr ${selectedRow?.id === row.id ? 'selected' : ''}`}
                    onClick={() => setSelectedRow(selectedRow?.id === row.id ? null : row)}
                  >
                    <td className="master-td"><b>{row.id}</b></td>
                    <td className="master-td" style={{ fontWeight: '700', color: 'var(--corp-ops)', textAlign: 'left' }}>
                      {row.coldstore_location}
                    </td>
                    <td className="master-td">{row.production_for || ''}</td>
                    <td className="master-td">
                      {row.production_at ? (
                        <span style={{ fontSize: '10px', fontWeight: 800, background: 'var(--border-light)', padding: '3px 8px', borderRadius: '4px', color: 'var(--corp-dash)' }}>
                          {row.production_at}
                        </span>
                      ) : ''}
                    </td>
                    <td className="master-td" style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>{row.date || ''}</td>
                    <td className="master-td" style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>{row.time || ''}</td>
                    <td className="master-td" style={{ color: 'var(--corp-dash)', fontSize: '11px', textAlign: 'left', textTransform: 'none' }}>{row.email || ''}</td>
                    <td className="master-td">{row.company_id}</td>
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
                  <span className="master-card-label">Location Name</span>
                  <span className="master-card-val" style={{ color: 'var(--corp-ops)' }}>{row.coldstore_location}</span>
                </div>
                <div className="master-card-row">
                  <span className="master-card-label">Production For</span>
                  <span className="master-card-val">{row.production_for || 'N/A'}</span>
                </div>
                <div className="master-card-row">
                  <span className="master-card-label">Production At</span>
                  <span className="master-card-val" style={{ color: 'var(--corp-dash)' }}>{row.production_at || 'N/A'}</span>
                </div>
                <div className="master-card-row">
                  <span className="master-card-label">Created At</span>
                  <span className="master-card-val" style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                    {row.date} {row.time}
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
