import React, { useState, useEffect, useRef } from 'react';
import './bknr-masters.css';

export default function MasterBase({
  title,
  modelName,
  fields,
  columns,
  customValidate,
  user
}) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [formData, setFormData] = useState({});
  const [selectedRow, setSelectedRow] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'id', direction: 'desc' });
  const [lookups, setLookups] = useState({});
  const [notification, setNotification] = useState(null);

  const dotsRef = useRef(null);

  // Load lookup options for select fields
  useEffect(() => {
    fields.forEach(field => {
      if (field.type === 'select' && field.lookupModel) {
        fetch(`/criteria/api/${field.lookupModel}`)
          .then(res => res.json())
          .then(resData => {
            if (resData.status === 'success' && Array.isArray(resData.data)) {
              setLookups(prev => ({
                ...prev,
                [field.id]: resData.data
              }));
            }
          })
          .catch(err => console.error(`Failed to fetch lookup: ${field.lookupModel}`, err));
      }
    });
  }, [fields]);

  // Load master data
  const loadData = () => {
    setLoading(true);
    fetch(`/criteria/api/${modelName}`)
      .then(res => res.json())
      .then(resData => {
        if (resData.status === 'success' && Array.isArray(resData.data)) {
          setData(resData.data);
        } else {
          showNotification('error', 'Failed to retrieve data log.');
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
    // Close dropdown menu when clicking elsewhere
    const handleOutsideClick = (e) => {
      if (dotsRef.current && !dotsRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [modelName]);

  const showNotification = (type, text) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleInputChange = (fieldId, val) => {
    setFormData(prev => ({ ...prev, [fieldId]: val }));
  };

  const clearForm = () => {
    setFormData({});
    setSelectedRow(null);
    setFormOpen(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (customValidate) {
      const error = customValidate(formData, data);
      if (error) {
        showNotification('error', error);
        return;
      }
    }

    try {
      const bodyPayload = { ...formData };
      if (user) {
        bodyPayload.email = user.email;
        bodyPayload.company_id = user.company_code;
      }

      const res = await fetch(`/criteria/api/${modelName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload)
      });

      if (res.ok) {
        showNotification('success', 'Profile entry saved successfully!');
        clearForm();
        loadData();
      } else {
        const text = await res.text();
        showNotification('error', `Save failed: ${text}`);
      }
    } catch (err) {
      showNotification('error', 'Network failure during save.');
    }
  };

  const handleEdit = () => {
    if (!selectedRow) return;
    setFormData(selectedRow);
    setFormOpen(true);
    setMenuOpen(false);
  };

  const handleDelete = async () => {
    if (!selectedRow) return;
    if (!window.confirm('Are you sure you want to delete this profile record?')) return;

    try {
      const res = await fetch(`/criteria/api/${modelName}/delete/${selectedRow.id}`, {
        method: 'POST'
      });

      if (res.ok) {
        showNotification('success', 'Record deleted successfully.');
        clearForm();
        loadData();
      } else {
        showNotification('error', 'Database deletion request failed.');
      }
    } catch (err) {
      showNotification('error', 'Network failure during delete.');
    }
  };

  // Sort & Search Data
  const sortedData = React.useMemo(() => {
    let result = [...data];

    // Filter
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      result = result.filter(row => {
        return Object.values(row).some(val => 
          val !== null && val !== undefined && String(val).toLowerCase().includes(q)
        );
      });
    }

    // Sort
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

  // Print selected record
  const printSelected = () => {
    if (!selectedRow) return;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
      <head>
        <title>${title} - Record #${selectedRow.id}</title>
        <style>
          body { font-family: 'Inter', sans-serif; padding: 30px; color: #1e293b; line-height: 1.5; }
          h2 { border-bottom: 2px solid #e2e8f0; padding-bottom: 8px; text-transform: uppercase; font-size: 16px; letter-spacing: 0.5px; }
          .item { margin-bottom: 12px; }
          .label { font-weight: 700; color: #64748b; font-size: 11px; text-transform: uppercase; }
          .value { font-size: 13px; font-weight: 600; margin-top: 2px; }
        </style>
      </head>
      <body>
        <h2>${title} Details Overview</h2>
        <div class="item">
          <div class="label">System ID</div>
          <div class="value">#${selectedRow.id}</div>
        </div>
        ${fields.map(f => `
          <div class="item">
            <div class="label">${f.label}</div>
            <div class="value">${selectedRow[f.id] || 'N/A'}</div>
          </div>
        `).join('')}
        <div class="item" style="margin-top: 30px; border-top: 1px dashed #cbd5e1; padding-top: 15px;">
          <div class="label">Created Date / Time</div>
          <div class="value">${selectedRow.date || 'N/A'} ${selectedRow.time || 'N/A'}</div>
        </div>
        <div class="item">
          <div class="label">User Agent</div>
          <div class="value">${selectedRow.email || 'N/A'}</div>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  // Export selected to Excel
  const exportExcel = () => {
    if (!selectedRow) return;
    const headerRow = ['ID', ...fields.map(f => f.label), 'Date', 'Time', 'User'].join('\t');
    const dataRow = [
      selectedRow.id,
      ...fields.map(f => selectedRow[f.id] || ''),
      selectedRow.date || '',
      selectedRow.time || '',
      selectedRow.email || ''
    ].join('\t');

    const blob = new Blob([[headerRow, dataRow].join('\n')], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${modelName}_record_${selectedRow.id}.xls`;
    link.click();
  };

  return (
    <div style={{ flex: 1, padding: '8px', overflowY: 'auto', display: 'flex', flexDirection: 'column', height: '100%' }}>
      
      {/* Dynamic Alert Banner */}
      {notification && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          padding: '12px 24px',
          borderRadius: '8px',
          color: '#ffffff',
          fontWeight: 700,
          fontSize: '12px',
          zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          background: notification.type === 'success' ? 'var(--corp-fin)' : '#ef4444',
          transition: 'all 0.3s ease'
        }}>
          {notification.text}
        </div>
      )}

      {/* Header */}
      <div className="master-header">
        <div className="master-header-titles">
          <h2><i className="fa-solid fa-layer-group"></i> {title}</h2>
        </div>
        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)' }}>SVBK IT Solutions</div>
      </div>

      {/* Dynamic Form Area */}
      {formOpen && (
        <form onSubmit={handleSubmit}>
          <div className="master-form-container">
            <div className="master-form-grid">
              <div className="master-form-title-inner">
                <i className="fa-solid fa-pen-to-square"></i> Record Parameters
              </div>

              {fields.map(field => {
                const isRequired = field.required;
                const type = field.type || 'text';

                return (
                  <div key={field.id} className="master-field" style={{ gridColumn: field.gridSpan ? `span ${field.gridSpan}` : undefined }}>
                    <label>{field.label} {isRequired && '*'}</label>
                    
                    {type === 'select' ? (
                      <select
                        id={field.id}
                        value={formData[field.id] || ''}
                        required={isRequired}
                        onChange={(e) => handleInputChange(field.id, e.target.value)}
                      >
                        <option value="">Select {field.label}</option>
                        {field.options ? (
                          field.options.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))
                        ) : (
                          lookups[field.id]?.map(item => {
                            // Dynamically identify lookup field display value
                            const displayVal = item[field.lookupLabelKey] || item[`${field.lookupModel}_name`] || item.name || item.brand_name || item.species_name || item.variety_name || item.contractor_name || item.storage_name || item.location_name || item.peeling_at || item.production_at || item.production_for;
                            return (
                              <option key={item.id} value={displayVal}>{displayVal}</option>
                            );
                          })
                        )}
                      </select>
                    ) : type === 'textarea' ? (
                      <textarea
                        id={field.id}
                        placeholder={field.placeholder || `Enter ${field.label}...`}
                        value={formData[field.id] || ''}
                        required={isRequired}
                        onChange={(e) => handleInputChange(field.id, e.target.value)}
                      />
                    ) : (
                      <input
                        type={type}
                        step={field.step}
                        placeholder={field.placeholder || `Enter ${field.label}...`}
                        value={formData[field.id] || ''}
                        required={isRequired}
                        onChange={(e) => handleInputChange(field.id, e.target.value)}
                      />
                    )}
                  </div>
                );
              })}

              <div className="master-actions">
                <button className="master-btn master-btn-primary" type="submit">
                  <i className="fa-solid fa-check"></i> {formData.id ? 'UPDATE DATA' : 'SAVE DATA'}
                </button>
                <button className="master-btn master-btn-clear" type="button" onClick={clearForm}>
                  <i className="fa-solid fa-xmark"></i> CANCEL
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Table Toolbar & Search */}
      <div className="master-table-header-bar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <h3 className="master-table-title">{title} Matrix Registry</h3>
            
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {!formOpen && (
                <div className="master-top-actions">
                  <button className="master-btn master-btn-primary" onClick={() => setFormOpen(true)}>
                    <i className="fa-solid fa-plus"></i> Add Profile
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
                        <i className="fa-solid fa-pen"></i> Edit Profile
                      </div>
                      <div className="master-menu-item" onClick={printSelected}>
                        <i className="fa-solid fa-print"></i> Print Sheet
                      </div>
                      <div className="master-menu-item" onClick={printSelected}>
                        <i className="fa-solid fa-file-pdf"></i> Export PDF
                      </div>
                      <div className="master-menu-item" onClick={exportExcel}>
                        <i className="fa-solid fa-file-excel"></i> Export Excel
                      </div>
                      <div className="master-menu-item danger" onClick={handleDelete}>
                        <i className="fa-solid fa-trash"></i> Delete Record
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

      {/* Data Table */}
      {loading ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Retrieving registry...
        </div>
      ) : sortedData.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--surface-panel)', border: '1px solid var(--border-light)', borderRadius: '12px' }}>
          No records configured in the registry yet.
        </div>
      ) : (
        <>
          {/* Desktop Table Wrap */}
          <div className="master-table-wrap">
            <table className="master-table">
              <thead>
                <tr>
                  {columns.map(col => (
                    <th key={col.key} className="master-th" onClick={() => requestSort(col.key)} style={{ cursor: 'pointer' }}>
                      {col.label} {sortConfig.key === col.key && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedData.map(row => (
                  <tr
                    key={row.id}
                    className={`master-tr ${selectedRow?.id === row.id ? 'selected' : ''}`}
                    onClick={() => setSelectedRow(selectedRow?.id === row.id ? null : row)}
                  >
                    {columns.map(col => (
                      <td key={col.key} className="master-td">
                        {col.key === 'id' ? `#${row[col.key]}` : row[col.key] ?? '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card List View */}
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
                {fields.slice(0, 3).map(f => (
                  <div key={f.id} className="master-card-row">
                    <span className="master-card-label">{f.label}</span>
                    <span className="master-card-val">{row[f.id] ?? '-'}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </>
      )}

    </div>
  );
}
