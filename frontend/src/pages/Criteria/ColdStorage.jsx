import React, { useState, useEffect, useRef } from 'react';
import './bknr-masters.css';

export default function ColdStorage({ user }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: 'id', direction: 'desc' });
  const [notification, setNotification] = useState(null);

  // Form fields
  const [recordId, setRecordId] = useState('');
  const [storageName, setStorageName] = useState('');
  const [storageType, setStorageType] = useState('Internal');
  const [contactPerson, setContactPerson] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [totalCapacityMc, setTotalCapacityMc] = useState('');
  const [noOfChambers, setNoOfChambers] = useState('');
  const [rentType, setRentType] = useState('Monthly');
  const [ratePerMcPerMonth, setRatePerMcPerMonth] = useState('');
  const [loadingUnloadingCharges, setLoadingUnloadingCharges] = useState('');
  const [handlingCharges, setHandlingCharges] = useState('');
  const [isActive, setIsActive] = useState('ACTIVE');
  const [address, setAddress] = useState('');
  const [remarks, setRemarks] = useState('');

  const dotsRef = useRef(null);

  const showNotification = (type, text) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 3000);
  };

  const loadData = () => {
    setLoading(true);
    fetch('/criteria/api/cold_storage')
      .then(res => res.json())
      .then(resData => {
        if (resData.status === 'success' && Array.isArray(resData.data)) {
          setData(resData.data);
        } else {
          showNotification('error', 'Failed to retrieve cold storage records.');
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
    setStorageName('');
    setStorageType('Internal');
    setContactPerson('');
    setContactNumber('');
    setTotalCapacityMc('');
    setNoOfChambers('');
    setRentType('Monthly');
    setRatePerMcPerMonth('');
    setLoadingUnloadingCharges('');
    setHandlingCharges('');
    setIsActive('ACTIVE');
    setAddress('');
    setRemarks('');
    setSelectedRow(null);
    setFormOpen(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const payload = {
        storage_name: storageName,
        storage_type: storageType,
        contact_person: contactPerson,
        contact_number: contactNumber,
        total_capacity_mc: totalCapacityMc ? parseInt(totalCapacityMc) : null,
        no_of_chambers: noOfChambers ? parseInt(noOfChambers) : null,
        rent_type: rentType,
        rate_per_mc_per_month: ratePerMcPerMonth ? parseFloat(ratePerMcPerMonth) : null,
        loading_unloading_charges: loadingUnloadingCharges ? parseFloat(loadingUnloadingCharges) : null,
        handling_charges: handlingCharges ? parseFloat(handlingCharges) : null,
        is_active: isActive,
        address,
        remarks
      };

      if (recordId) {
        payload.id = recordId;
      }

      const res = await fetch('/criteria/api/cold_storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showNotification('success', recordId ? 'Facility updated successfully!' : 'Facility saved successfully!');
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
    setStorageName(selectedRow.storage_name || '');
    setStorageType(selectedRow.storage_type || 'Internal');
    setContactPerson(selectedRow.contact_person || '');
    setContactNumber(selectedRow.contact_number || '');
    setTotalCapacityMc(selectedRow.total_capacity_mc ?? '');
    setNoOfChambers(selectedRow.no_of_chambers ?? '');
    setRentType(selectedRow.rent_type || 'Monthly');
    setRatePerMcPerMonth(selectedRow.rate_per_mc_per_month ?? '');
    setLoadingUnloadingCharges(selectedRow.loading_unloading_charges ?? '');
    setHandlingCharges(selectedRow.handling_charges ?? '');
    setIsActive(selectedRow.is_active || 'ACTIVE');
    setAddress(selectedRow.address || '');
    setRemarks(selectedRow.remarks || '');
    setFormOpen(true);
    setMenuOpen(false);
  };

  const handleDelete = async () => {
    if (!selectedRow) return;
    if (!window.confirm('Delete this cold storage facility profile?')) return;

    try {
      const res = await fetch(`/criteria/api/cold_storage/delete/${selectedRow.id}`, {
        method: 'POST'
      });

      if (res.ok) {
        showNotification('success', 'Cold storage record deleted.');
        clearForm();
        loadData();
      } else {
        showNotification('error', 'Delete operation failed.');
      }
    } catch (err) {
      console.error(err);
      showNotification('error', 'Network error during delete.');
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
      <html><head><title>Cold Storage Facility - #${selectedRow.id}</title>
      <style>body{font-family:sans-serif;padding:30px;color:#1e293b;}h2{border-bottom:2px solid #e2e8f0;padding-bottom:8px;text-transform:uppercase;font-size:16px;}
      .item{margin-bottom:12px;}.label{font-weight:700;color:#64748b;font-size:11px;text-transform:uppercase;}.value{font-size:13px;font-weight:600;margin-top:2px;}</style>
      </head><body>
      <h2>Cold Storage Facility Profile</h2>
      <div class="item"><div class="label">Facility ID</div><div class="value">#${selectedRow.id}</div></div>
      <div class="item"><div class="label">Facility Name</div><div class="value">${selectedRow.storage_name}</div></div>
      <div class="item"><div class="label">Storage Type</div><div class="value">${selectedRow.storage_type}</div></div>
      <div class="item"><div class="label">Contact Person / Phone</div><div class="value">${selectedRow.contact_person || 'N/A'} (${selectedRow.contact_number || 'N/A'})</div></div>
      <div class="item"><div class="label">Total Capacity</div><div class="value">${selectedRow.total_capacity_mc || 0} MC (${selectedRow.no_of_chambers || 0} Chambers)</div></div>
      <div class="item"><div class="label">Rent Type & Rate</div><div class="value">${selectedRow.rent_type} - ₹${selectedRow.rate_per_mc_per_month || 0}/MC Month</div></div>
      <div class="item"><div class="label">Status</div><div class="value">${selectedRow.is_active}</div></div>
      <div class="item"><div class="label">Address</div><div class="value">${selectedRow.address || 'N/A'}</div></div>
      </body></html>
    `);
    p.document.close();
    setTimeout(() => p.print(), 500);
  };

  const exportExcel = () => {
    if (!selectedRow) return;
    const headers = ['ID', 'Facility Name', 'Type', 'Capacity MC', 'Chambers', 'Rent Type', 'Rate/MC Month', 'Status'];
    const values = [
      selectedRow.id,
      selectedRow.storage_name,
      selectedRow.storage_type,
      selectedRow.total_capacity_mc || 0,
      selectedRow.no_of_chambers || 0,
      selectedRow.rent_type || '',
      selectedRow.rate_per_mc_per_month || 0,
      selectedRow.is_active
    ];
    const blob = new Blob([[headers.join('\t'), values.join('\t')].join('\n')], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cold_storage_${selectedRow.storage_name}_${selectedRow.id}.xls`;
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
          <h2><i className="fa-solid fa-snowflake"></i> Cold Storage Master</h2>
        </div>
      </div>

      {/* Form */}
      {formOpen && (
        <form onSubmit={handleSubmit}>
          <div className="master-form-container">
            <div className="master-form-grid">
              <div className="master-form-title-inner">
                <i className="fa-solid fa-snowflake"></i> Facility Profile & Storage Parameters
              </div>

              <div className="master-field">
                <label>Facility Name *</label>
                <input
                  type="text"
                  required
                  placeholder="Enter Cold Storage Facility Name"
                  value={storageName}
                  onChange={(e) => setStorageName(e.target.value)}
                />
              </div>

              <div className="master-field">
                <label>Storage Type *</label>
                <select
                  required
                  value={storageType}
                  onChange={(e) => setStorageType(e.target.value)}
                >
                  <option value="Internal">Internal</option>
                  <option value="External">External</option>
                  <option value="Third-party">Third-party</option>
                </select>
              </div>

              <div className="master-field">
                <label>Contact Person</label>
                <input
                  type="text"
                  placeholder="Manager / Executive"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                />
              </div>

              <div className="master-field">
                <label>Contact Number</label>
                <input
                  type="text"
                  placeholder="+91 Phone Number"
                  value={contactNumber}
                  onChange={(e) => setContactNumber(e.target.value)}
                />
              </div>

              <div className="master-field">
                <label>Capacity (MC)</label>
                <input
                  type="number"
                  placeholder="Total Master Cartons"
                  value={totalCapacityMc}
                  onChange={(e) => setTotalCapacityMc(e.target.value)}
                />
              </div>

              <div className="master-field">
                <label>No of Chambers</label>
                <input
                  type="number"
                  placeholder="Chambers Count"
                  value={noOfChambers}
                  onChange={(e) => setNoOfChambers(e.target.value)}
                />
              </div>

              <div className="master-field">
                <label>Rent Type</label>
                <select value={rentType} onChange={(e) => setRentType(e.target.value)}>
                  <option value="Daily">Daily</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Flat">Flat</option>
                </select>
              </div>

              <div className="master-field">
                <label>Rate / MC Month (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={ratePerMcPerMonth}
                  onChange={(e) => setRatePerMcPerMonth(e.target.value)}
                />
              </div>

              <div className="master-field">
                <label>Loading/Unloading Charge / MC (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={loadingUnloadingCharges}
                  onChange={(e) => setLoadingUnloadingCharges(e.target.value)}
                />
              </div>

              <div className="master-field">
                <label>Handling Charge / MC (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={handlingCharges}
                  onChange={(e) => setHandlingCharges(e.target.value)}
                />
              </div>

              <div className="master-field">
                <label>Is Active</label>
                <select value={isActive} onChange={(e) => setIsActive(e.target.value)}>
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>
            </div>

            <div className="master-form-grid" style={{ marginTop: '12px' }}>
              <div className="master-field" style={{ gridColumn: '1 / -1' }}>
                <label>Address</label>
                <textarea
                  placeholder="Complete Cold Storage Address..."
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              <div className="master-field" style={{ gridColumn: '1 / -1' }}>
                <label>Remarks</label>
                <textarea
                  placeholder="Special conditions or notes..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
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
            <h3 className="master-table-title">Cold Storage Facilities</h3>

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
              placeholder="Search storage facilities..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Retrieving storage registry...
        </div>
      ) : sortedData.length === 0 ? (
        <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)', background: 'var(--surface-panel)', border: '1px solid var(--border-light)', borderRadius: '12px' }}>
          No cold storage facilities registered yet.
        </div>
      ) : (
        <>
          <div className="master-table-wrap">
            <table className="master-table">
              <thead>
                <tr>
                  <th className="master-th" onClick={() => requestSort('id')} style={{ cursor: 'pointer' }}>ID</th>
                  <th className="master-th" onClick={() => requestSort('storage_name')} style={{ cursor: 'pointer' }}>Facility Name</th>
                  <th className="master-th" onClick={() => requestSort('storage_type')} style={{ cursor: 'pointer' }}>Type</th>
                  <th className="master-th" onClick={() => requestSort('total_capacity_mc')} style={{ cursor: 'pointer' }}>Capacity (MC)</th>
                  <th className="master-th" onClick={() => requestSort('rent_type')} style={{ cursor: 'pointer' }}>Rent Type</th>
                  <th className="master-th" onClick={() => requestSort('rate_per_mc_per_month')} style={{ cursor: 'pointer' }}>Rate/MC Month</th>
                  <th className="master-th" onClick={() => requestSort('is_active')} style={{ cursor: 'pointer' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedData.map(row => (
                  <tr
                    key={row.id}
                    className={`master-tr ${selectedRow?.id === row.id ? 'selected' : ''}`}
                    onClick={() => setSelectedRow(selectedRow?.id === row.id ? null : row)}
                  >
                    <td className="master-td"><b>#{row.id}</b></td>
                    <td className="master-td" style={{ fontWeight: '700', color: 'var(--corp-ops)', textAlign: 'left' }}>
                      {row.storage_name}
                    </td>
                    <td className="master-td">{row.storage_type}</td>
                    <td className="master-td" style={{ fontWeight: '600' }}>
                      {row.total_capacity_mc ? `${row.total_capacity_mc} MC` : '-'}
                    </td>
                    <td className="master-td">{row.rent_type || '-'}</td>
                    <td className="master-td" style={{ fontWeight: '600' }}>
                      {row.rate_per_mc_per_month ? `₹${row.rate_per_mc_per_month.toFixed(2)}` : '-'}
                    </td>
                    <td className="master-td" style={{
                      fontWeight: '800',
                      color: row.is_active === 'ACTIVE' ? 'var(--success)' : '#ef4444'
                    }}>
                      {row.is_active}
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
                  <span className="master-card-label">Facility Name</span>
                  <span className="master-card-val" style={{ color: 'var(--corp-ops)' }}>{row.storage_name}</span>
                </div>
                <div className="master-card-row">
                  <span className="master-card-label">Storage Type</span>
                  <span className="master-card-val">{row.storage_type}</span>
                </div>
                <div className="master-card-row">
                  <span className="master-card-label">Capacity</span>
                  <span className="master-card-val">{row.total_capacity_mc ? `${row.total_capacity_mc} MC` : '-'}</span>
                </div>
                <div className="master-card-row">
                  <span className="master-card-label">Status</span>
                  <span className="master-card-val" style={{ color: row.is_active === 'ACTIVE' ? 'var(--success)' : '#ef4444' }}>
                    {row.is_active}
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
