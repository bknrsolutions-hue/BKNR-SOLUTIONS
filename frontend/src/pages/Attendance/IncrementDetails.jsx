import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, MoreVertical, Edit2, Printer, Ban, X, FileText 
} from 'lucide-react';
import './Attendance.css';

export default function IncrementDetails({ theme }) {
  const [records, setRecords] = useState([]);
  const [selectedRow, setSelectedRow] = useState(null);
  
  // Filter States
  const [searchEmpID, setSearchEmpID] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Form State
  const [formData, setFormData] = useState({
    id: '',
    employee_id: '',
    increment_type: 'FIXED',
    increment_value: 0.0,
    effective_from: '',
    reason: '',
    approved_by: ''
  });

  // Notification State
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async (successMsg = null) => {
    try {
      const res = await fetch('/attendance/employee-increment?format=json');
      const data = await res.json();
      if (data.status === 'success') {
        setRecords(data.records || []);
        if (successMsg) showNotification(successMsg, 'success');
        else if (data.message) showNotification(data.message, 'info');
      }
    } catch (e) {
      showNotification('❌ Failed to fetch transaction history!', 'danger');
    }
  };

  useEffect(() => {
    loadData();
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const openForm = (editMode = false) => {
    if (editMode && selectedRow) {
      setIsEditMode(true);
      fetch(`/attendance/employee-increment/edit/${selectedRow.id}`)
        .then(res => res.json())
        .then(data => {
          setFormData({
            id: data.id,
            employee_id: data.employee_id,
            increment_type: data.increment_type,
            increment_value: data.increment_value,
            effective_from: data.effective_from,
            reason: data.reason || '',
            approved_by: data.approved_by || ''
          });
          setIsModalOpen(true);
        })
        .catch(() => showNotification('❌ Failed to load voucher data!', 'danger'));
    } else {
      setIsEditMode(false);
      setFormData({
        id: '',
        employee_id: '',
        increment_type: 'FIXED',
        increment_value: 0.0,
        effective_from: '',
        reason: '',
        approved_by: ''
      });
      setIsModalOpen(true);
    }
    setMenuOpen(false);
  };

  const closeForm = () => {
    setIsModalOpen(false);
    setIsEditMode(false);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const confirmPost = window.confirm(`Confirm Post?\nAre you sure you want to save this salary increment record?`);
    if (!confirmPost) return;

    try {
      const url = isEditMode 
        ? `/attendance/employee-increment/save-update/${formData.id}?format=json` 
        : `/attendance/employee-increment?format=json`;

      const payload = new URLSearchParams();
      Object.keys(formData).forEach(key => {
        if (formData[key] !== null && formData[key] !== undefined) {
          payload.append(key, formData[key]);
        }
      });

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payload.toString()
      });

      const data = await res.json();
      if (data.status === 'success') {
        closeForm();
        loadData(data.message || '✅ Salary Increment Voucher Logged Successfully!');
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to save transaction!', 'danger');
      }
    } catch (err) {
      showNotification('❌ Network error saving increment voucher!', 'danger');
    }
  };

  const editSelected = () => {
    if (selectedRow) openForm(true);
  };

  const printSelected = () => {
    if (selectedRow) {
      window.open(`/attendance/employee-increment/print/${selectedRow.id}`, '_blank');
      setMenuOpen(false);
    }
  };

  const deleteSelected = async () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    const confirmDelete = window.confirm(`Cancel increment record?`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/attendance/employee-increment/delete/${selectedRow.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.status === 'ok') {
        loadData('🗑️ Increment transaction rolled back & purged!');
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to purge record!', 'danger');
      }
    } catch (e) {
      showNotification('❌ Network Error deleting transaction!', 'danger');
    }
  };

  const filteredRecords = records.filter(rec => {
    return (rec.employee_id || '').toUpperCase().includes(searchEmpID.toUpperCase());
  });

  return (
    <div className="attendance-container">
      {notification && (
        <div className={`attendance-toast ${notification.type === 'success' ? 'success' : 'error'}`} style={{ top: '80px' }}>
          {notification.msg}
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="attendance-page-header">
        <div>
          <h1>Employee Salary Increment</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            Appraisal logs & incremental salary sheets master
          </p>
        </div>
        <div className="attendance-page-header-actions">
          <button className="attendance-btn attendance-btn-primary" onClick={() => openForm(false)}>
            <Plus size={16} /> NEW ENTRY
          </button>
        </div>
      </div>

      {/* SEARCH / FILTERS */}
      <div className="attendance-filters-bar" style={{ maxWidth: '300px' }}>
        <div className="attendance-filter-group">
          <label htmlFor="search-emp-id">Search Employee ID</label>
          <input 
            id="search-emp-id"
            className="attendance-input" 
            type="text" 
            placeholder="Type ID to filter..." 
            value={searchEmpID} 
            onChange={(e) => setSearchEmpID(e.target.value)} 
          />
        </div>
      </div>

      {/* ACTION BAR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: '800', margin: 0, textTransform: 'uppercase', color: 'var(--att-heading)' }}>
          Transaction History Ledger Log
        </h3>
        
        {selectedRow && (
          <div className="attendance-actions-cell" ref={dropdownRef}>
            <button 
              className="attendance-action-dots-btn" 
              onClick={() => setMenuOpen(!menuOpen)}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid var(--att-border)', padding: '6px 12px', borderRadius: '6px' }}
            >
              <MoreVertical size={16} /> Row Actions
            </button>
            {menuOpen && (
              <div className="attendance-dropdown-menu" style={{ right: 0, top: '35px', width: '160px' }}>
                <button className="attendance-dropdown-item" onClick={editSelected}><Edit2 size={14} /> Edit</button>
                <button className="attendance-dropdown-item" onClick={printSelected}><Printer size={14} /> Print View</button>
                <button 
                  className="attendance-dropdown-item" 
                  onClick={deleteSelected}
                  style={{ color: 'var(--att-danger)', borderTop: '1px solid var(--att-border)' }}
                >
                  <Ban size={14} /> Cancel Record
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* LEDGER LOG TABLE */}
      <div className="attendance-table-container">
        <div className="attendance-table-wrapper">
          <table className="attendance-table">
            <thead>
              <tr>
                <th style={{ width: '60px', textAlign: 'center' }}>#</th>
                <th style={{ width: '130px' }}>Emp ID</th>
                <th style={{ width: '120px', textAlign: 'center' }}>Type</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Inc Value</th>
                <th style={{ width: '140px', textAlign: 'right' }}>Old Salary</th>
                <th style={{ width: '140px', textAlign: 'right' }}>New Salary</th>
                <th style={{ width: '130px' }}>Effective From</th>
                <th style={{ width: '220px' }}>Reason</th>
                <th style={{ width: '160px' }}>Approved By</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((r, idx) => (
                <tr 
                  key={r.id} 
                  className={selectedRow?.id === r.id ? 'selected' : ''}
                  onClick={() => setSelectedRow(r)}
                  onDoubleClick={() => { setSelectedRow(r); openForm(true); }}
                >
                  <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                  <td style={{ fontWeight: '800', color: 'var(--att-accent)' }}>{r.employee_id}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`attendance-badge ${r.increment_type === 'FIXED' ? 'attendance-badge-info' : 'attendance-badge-warning'}`}>
                      {r.increment_type}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: '700' }}>
                    ₹{parseFloat(r.increment_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--att-muted)' }}>
                    ₹{parseFloat(r.old_salary || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: '800', color: 'var(--att-success)' }}>
                    ₹{parseFloat(r.new_salary || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td>{r.effective_from || '-'}</td>
                  <td>{r.reason || '-'}</td>
                  <td>{r.approved_by || '-'}</td>
                </tr>
              ))}
              {!filteredRecords.length && (
                <tr>
                  <td colSpan="9" className="attendance-empty">
                    No salary increment ledger transactions logged.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* FORM DRAWER MODAL */}
      {isModalOpen && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content" style={{ maxWidth: '600px' }}>
            <div className="attendance-modal-header">
              <h2>{isEditMode ? `Modify Increment Voucher (ID: ${formData.id})` : 'Increment Entry Voucher'}</h2>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleFormSubmit}>
              <div className="attendance-modal-body">
                <div className="attendance-form-grid" style={{ gridTemplateColumns: '1fr' }}>
                  <div className="attendance-form-group">
                    <label htmlFor="inc-emp-id">Employee ID</label>
                    <input 
                      id="inc-emp-id"
                      className="attendance-input" 
                      name="employee_id" 
                      value={formData.employee_id} 
                      onChange={handleInputChange} 
                      required 
                      placeholder="e.g., BKNR00001" 
                    />
                  </div>
                  <div className="attendance-form-group">
                    <label htmlFor="inc-type">Increment Type</label>
                    <select 
                      id="inc-type"
                      className="attendance-select" 
                      name="increment_type" 
                      value={formData.increment_type} 
                      onChange={handleInputChange} 
                      required
                    >
                      <option value="FIXED">Fixed Amount (₹)</option>
                      <option value="PERCENTAGE">Percentage (%)</option>
                    </select>
                  </div>
                  <div className="attendance-form-group">
                    <label htmlFor="inc-val">Increment Value</label>
                    <input 
                      id="inc-val"
                      className="attendance-input" 
                      type="number" 
                      name="increment_value" 
                      step="0.01" 
                      value={formData.increment_value} 
                      onChange={handleInputChange} 
                      required 
                      placeholder="0.00" 
                    />
                  </div>
                  <div className="attendance-form-group">
                    <label htmlFor="inc-effective">Effective From</label>
                    <input 
                      id="inc-effective"
                      className="attendance-input" 
                      type="date" 
                      name="effective_from" 
                      value={formData.effective_from} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>
                  <div className="attendance-form-group">
                    <label htmlFor="inc-reason">Reason / Remarks</label>
                    <input 
                      id="inc-reason"
                      className="attendance-input" 
                      name="reason" 
                      value={formData.reason} 
                      onChange={handleInputChange} 
                      placeholder="Performance Appraisal / Promotion" 
                    />
                  </div>
                  <div className="attendance-form-group">
                    <label htmlFor="inc-approved">Approved By</label>
                    <input 
                      id="inc-approved"
                      className="attendance-input" 
                      name="approved_by" 
                      value={formData.approved_by} 
                      onChange={handleInputChange} 
                      placeholder="Authority / Manager Name" 
                    />
                  </div>
                </div>
              </div>
              <div className="attendance-modal-footer">
                <button type="button" className="attendance-btn attendance-btn-secondary" onClick={closeForm}>
                  Cancel
                </button>
                <button type="submit" className="attendance-btn attendance-btn-primary">
                  {isEditMode ? 'Update Voucher' : 'Post Voucher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
