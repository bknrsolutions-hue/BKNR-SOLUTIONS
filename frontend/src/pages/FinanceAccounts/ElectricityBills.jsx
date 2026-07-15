import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, MoreVertical, Ban, X, FileSpreadsheet, Clock, AlertCircle, Bolt
} from 'lucide-react';
import '../Attendance/Attendance.css';

export default function ElectricityBills({ theme }) {
  const [history, setHistory] = useState([]);
  const [units, setUnits] = useState([]);
  const [selectedRow, setSelectedRow] = useState(null);
  
  // Filter States
  const [selectedFy, setSelectedFy] = useState(new Date().getMonth() >= 3 ? new Date().getFullYear().toString() : (new Date().getFullYear() - 1).toString());
  const [monthFilter, setMonthFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Audit Log State
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    unit_id: '',
    reading_date: new Date().toISOString().split('T')[0],
    opening_kwh: 0,
    closing_kwh: 0,
    unit_rate: 0,
    consumed_units: 0,
    total_cost: 0
  });

  // Notification State
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async (successMsg = null) => {
    try {
      const url = `/api/electricity/entry?fy=${selectedFy}`;
      const res = await fetch(url);
      const htmlText = await res.text();
      const doc = new DOMParser().parseFromString(htmlText, 'text/html');

      // Parse units
      const unitOptions = doc.querySelectorAll('#modalUnitId option');
      const parsedUnits = Array.from(unitOptions)
        .map(opt => ({
          id: opt.value,
          name: opt.textContent.trim()
        }))
        .filter(u => u.id !== '');
      setUnits(parsedUnits);

      // Parse history rows
      const rows = doc.querySelectorAll('#tableBody tr.data-row');
      const parsedHistory = Array.from(rows).map(row => {
        const cells = row.querySelectorAll('td');
        return {
          id: row.getAttribute('data-id'),
          reading_date: row.getAttribute('data-date') || '',
          location_name: cells[2]?.textContent.trim() || '',
          opening_kwh: parseFloat(cells[3]?.textContent.replace(/[₹,\s]/g, '') || 0),
          closing_kwh: parseFloat(cells[4]?.textContent.replace(/[₹,\s]/g, '') || 0),
          consumed_units: parseFloat(cells[5]?.textContent.replace(/[₹,\s]/g, '') || 0),
          unit_rate: parseFloat(cells[6]?.textContent.replace(/[₹,\s]/g, '') || 0),
          total_cost: parseFloat(row.getAttribute('data-total') || cells[7]?.textContent.replace(/[₹,\s]/g, '') || 0),
          is_cancelled: row.getAttribute('data-cancelled') === 'true',
          status: cells[8]?.textContent.trim() || ''
        };
      });

      setHistory(parsedHistory);
      if (successMsg) showNotification(successMsg, 'success');
    } catch (e) {
      showNotification('❌ Failed to fetch electricity data!', 'danger');
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
  }, [selectedFy]);

  const handleLocationChange = async (e) => {
    const unitId = e.target.value;
    if (!unitId) return;

    try {
      const res = await fetch(`/api/electricity/lookup/${unitId}`);
      if (res.ok) {
        const data = await res.json();
        setFormData(prev => {
          const updated = {
            ...prev,
            unit_id: unitId,
            opening_kwh: parseFloat(data.last_closing || 0).toFixed(2),
            unit_rate: parseFloat(data.unit_rate || 0).toFixed(2)
          };
          const consumed = Math.max(0, parseFloat(updated.closing_kwh || 0) - parseFloat(updated.opening_kwh || 0));
          updated.consumed_units = consumed.toFixed(2);
          updated.total_cost = (consumed * parseFloat(updated.unit_rate || 0)).toFixed(2);
          return updated;
        });
      }
    } catch (err) {
      showNotification('❌ Failed to lookup last reading for location!', 'danger');
    }
  };

  const handleInputChange = (e) => {
    const { id, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [id]: value };
      if (id === 'opening_kwh' || id === 'closing_kwh' || id === 'unit_rate') {
        const op = parseFloat(updated.opening_kwh) || 0;
        const cl = parseFloat(updated.closing_kwh) || 0;
        const rate = parseFloat(updated.unit_rate) || 0;
        const consumed = Math.max(0, cl - op);
        updated.consumed_units = consumed.toFixed(2);
        updated.total_cost = (consumed * rate).toFixed(2);
      }
      return updated;
    });
  };

  const openForm = () => {
    setFormData({
      unit_id: '',
      reading_date: new Date().toISOString().split('T')[0],
      opening_kwh: 0,
      closing_kwh: 0,
      unit_rate: 0,
      consumed_units: 0,
      total_cost: 0
    });
    setIsModalOpen(true);
    setMenuOpen(false);
  };

  const closeForm = () => {
    setIsModalOpen(false);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    if (!formData.unit_id) {
      alert('Select location unit!');
      return;
    }

    const op = parseFloat(formData.opening_kwh) || 0;
    const cl = parseFloat(formData.closing_kwh) || 0;
    if (cl < op) {
      alert('Closing KWH reading values cannot drop lower than opening balance criteria!');
      return;
    }

    const confirmPost = window.confirm(`Post Electricity Log?\nAre you sure you want to log this reading entry?`);
    if (!confirmPost) return;

    try {
      const payload = {
        unit_id: parseInt(formData.unit_id),
        reading_date: formData.reading_date,
        opening_kwh: op,
        closing_kwh: cl,
        unit_rate: parseFloat(formData.unit_rate) || 0
      };

      const res = await fetch('/api/electricity/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success || data.status === 'success') {
        closeForm();
        loadData(data.message || '✅ Electricity log saved successfully!');
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to save electricity entry!', 'danger');
      }
    } catch (err) {
      showNotification('❌ Network error saving electricity log!', 'danger');
    }
  };

  const cancelSelected = async () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    
    if (selectedRow.is_cancelled) {
      alert('This entry is already marked as cancelled!');
      return;
    }

    const confirmDelete = window.confirm(`Cancel Entry?\nAre you sure you want to cancel this electricity bill entry?`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/electricity/delete/${selectedRow.id}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification('🗑️ Electricity log entry cancelled successfully!', 'success');
        loadData();
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to cancel entry!', 'danger');
      }
    } catch (e) {
      showNotification('❌ Network error cancelling entry!', 'danger');
    }
  };

  const openAuditLogs = async () => {
    setAuditOpen(true);
    setLoadingAudit(true);
    try {
      const res = await fetch('/api/electricity/audit_all');
      if (res.ok) {
        const logs = await res.json();
        setAuditLogs(logs || []);
      }
    } catch (err) {
      showNotification('❌ Failed to fetch audit history!', 'danger');
    } finally {
      setLoadingAudit(false);
    }
  };

  const executeExcelExport = () => {
    window.location.href = '/api/electricity/export/excel';
  };

  // Filters application
  const filteredRecords = history.filter(rec => {
    const sQuery = searchQuery.toLowerCase().trim();
    const matchesMonth = monthFilter ? rec.reading_date.startsWith(monthFilter) : true;
    const matchesSearch = sQuery ? (
      rec.location_name.toLowerCase().includes(sQuery) ||
      rec.reading_date.includes(sQuery)
    ) : true;
    return matchesMonth && matchesSearch;
  });

  const grandTotalCost = filteredRecords.reduce((sum, item) => {
    return sum + (item.is_cancelled ? 0 : item.total_cost);
  }, 0);

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
          <h1>Electricity Consumption Ledger</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            Log meter readings and track power consumption rates across processing blocks
          </p>
        </div>
        <div className="grand-total" style={{ background: 'var(--att-accent)', color: 'white', padding: '10px 24px', borderRadius: '8px', fontWeight: '800', fontSize: '14px' }}>
          TOTAL COST: ₹{grandTotalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </div>
      </div>

      {/* FILTERS BAR */}
      <div className="attendance-filters-bar">
        <div className="attendance-filter-group" style={{ minWidth: '140px', flex: '0 0 140px' }}>
          <label htmlFor="f_fy">Financial Year</label>
          <select 
            id="f_fy" 
            className="attendance-select" 
            value={selectedFy} 
            onChange={(e) => setSelectedFy(e.target.value)}
          >
            <option value="2024">FY 2024-2025</option>
            <option value="2025">FY 2025-2026</option>
            <option value="2026">FY 2026-2027</option>
          </select>
        </div>

        <div className="attendance-filter-group" style={{ minWidth: '160px', flex: '0 0 160px' }}>
          <label htmlFor="monthFilter">Period (Month)</label>
          <input 
            id="monthFilter" 
            type="month" 
            className="attendance-input" 
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
          />
        </div>

        <div className="attendance-filter-group" style={{ minWidth: '220px', flex: '1' }}>
          <label htmlFor="searchBox">Search Bar</label>
          <div style={{ position: 'relative' }}>
            <input 
              id="searchBox" 
              type="text" 
              className="attendance-input" 
              placeholder="Search location unit or date..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '32px' }}
            />
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--att-muted)' }} />
          </div>
        </div>

        <button className="attendance-btn attendance-btn-secondary" onClick={() => { setSearchQuery(''); setMonthFilter(''); }} style={{ height: '38px' }}>
          Clear
        </button>
      </div>

      {/* ACTION BAR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: '800', margin: 0, textTransform: 'uppercase', color: 'var(--att-heading)' }}>
          {filteredRecords.length} Entries Found
        </h3>
        
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="attendance-btn attendance-btn-secondary" onClick={openAuditLogs}>
            <Clock size={14} /> Audit Logs
          </button>
          <button className="attendance-btn attendance-btn-secondary" onClick={executeExcelExport}>
            <FileSpreadsheet size={14} /> Export Excel
          </button>
          {selectedRow && (
            <div className="attendance-actions-cell" ref={dropdownRef}>
              <button 
                className="attendance-action-dots-btn" 
                onClick={() => setMenuOpen(!menuOpen)}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid var(--att-border)', padding: '6px 12px', borderRadius: '6px' }}
              >
                <MoreVertical size={16} /> Actions
              </button>
              {menuOpen && (
                <div className="attendance-dropdown-menu" style={{ right: 0, top: '35px', width: '160px' }}>
                  <button 
                    className="attendance-dropdown-item" 
                    onClick={cancelSelected}
                    style={{ color: 'var(--att-danger)' }}
                  >
                    <Ban size={14} /> Cancel Entry
                  </button>
                </div>
              )}
            </div>
          )}
          <button className="attendance-btn attendance-btn-primary" onClick={openForm}>
            <Plus size={16} /> NEW LOG ENTRY
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="attendance-table-container">
        <div className="attendance-table-wrapper">
          <table className="attendance-table">
            <thead>
              <tr>
                <th style={{ width: '60px', textAlign: 'center' }}>Sl</th>
                <th style={{ width: '140px' }}>Reading Date</th>
                <th style={{ textalign: 'left' }}>Location Unit</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Opening KWH</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Closing KWH</th>
                <th style={{ width: '140px', textAlign: 'right' }}>Consumed Units</th>
                <th style={{ width: '120px', textAlign: 'right' }}>Unit Rate</th>
                <th style={{ width: '150px', textAlign: 'right' }}>Total Cost</th>
                <th style={{ width: '110px', textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((row, idx) => (
                <tr 
                  key={row.id} 
                  className={`${selectedRow?.id === row.id ? 'selected' : ''} ${row.is_cancelled ? 'cancelled-row' : ''}`}
                  onClick={() => setSelectedRow(row)}
                  style={row.is_cancelled ? { opacity: 0.62, textDecoration: 'line-through' } : {}}
                >
                  <td style={{ textAlign: 'center' }}>{filteredRecords.length - idx}</td>
                  <td>{row.reading_date}</td>
                  <td style={{ textalign: 'left', fontWeight: '700' }}>{row.location_name}</td>
                  <td style={{ textAlign: 'right' }}>{parseFloat(row.opening_kwh).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right' }}>{parseFloat(row.closing_kwh).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right', color: 'var(--att-success)', fontWeight: '700' }}>
                    {parseFloat(row.consumed_units).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'right' }}>₹{parseFloat(row.unit_rate).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right', fontWeight: '800', color: 'var(--att-heading)' }}>
                    ₹{parseFloat(row.total_cost).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`attendance-badge ${row.is_cancelled ? 'attendance-badge-absent' : 'attendance-badge-present'}`}>
                      {row.is_cancelled ? 'CANCELLED' : 'ACTIVE'}
                    </span>
                  </td>
                </tr>
              ))}
              {!filteredRecords.length && (
                <tr>
                  <td colSpan="9" className="attendance-empty">
                    No electricity log entries found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NEW ENTRY MODAL */}
      {isModalOpen && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content" style={{ maxWidth: '750px' }}>
            <div className="attendance-modal-header">
              <h2>New Electricity Entry</h2>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="attendance-modal-body">
                <div className="attendance-form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  
                  <div className="attendance-form-group">
                    <label htmlFor="unit_id">Location Unit</label>
                    <select 
                      id="unit_id"
                      className="attendance-select" 
                      value={formData.unit_id} 
                      onChange={handleLocationChange} 
                      required
                    >
                      <option value="">-- Select Location --</option>
                      {units.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="reading_date">Reading Log Date</label>
                    <input 
                      id="reading_date"
                      className="attendance-input" 
                      type="date" 
                      value={formData.reading_date} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="opening_kwh">Opening KWH</label>
                    <input 
                      id="opening_kwh"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.opening_kwh} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="closing_kwh">Closing KWH</label>
                    <input 
                      id="closing_kwh"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.closing_kwh} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="unit_rate">Unit Rate / KWH</label>
                    <input 
                      id="unit_rate"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.unit_rate} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="consumed_units">Consumed Units</label>
                    <input 
                      id="consumed_units"
                      className="attendance-input" 
                      style={{ background: 'var(--att-table-row-hover)', fontWeight: '700' }}
                      value={formData.consumed_units} 
                      readOnly 
                    />
                  </div>

                </div>

                <div style={{ marginTop: '20px', background: 'rgba(16, 185, 129, 0.12)', padding: '12px 18px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <span style={{ fontWeight: '700', color: 'var(--att-success)', fontSize: '13px' }}>Calculated Total Cost:</span>
                  <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--att-success)' }}>
                    ₹{parseFloat(formData.total_cost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              <div className="attendance-modal-footer">
                <button type="button" className="attendance-btn attendance-btn-secondary" onClick={closeForm}>
                  Cancel
                </button>
                <button type="submit" className="attendance-btn attendance-btn-primary">
                  Post Log Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AUDIT LOGS MODAL */}
      {auditOpen && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content" style={{ maxWidth: '650px' }}>
            <div className="attendance-modal-header">
              <h2>Electricity Record History Logs</h2>
              <button className="attendance-modal-close-btn" onClick={() => setAuditOpen(false)} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            <div className="attendance-modal-body" style={{ maxHeight: '450px', overflowY: 'auto' }}>
              {loadingAudit ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--att-muted)' }}>
                  <Clock className="spin" size={24} style={{ marginBottom: '8px' }} />
                  <p>Loading audit archive logs...</p>
                </div>
              ) : auditLogs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {auditLogs.map((log, idx) => (
                    <div key={idx} style={{ borderLeft: '3px solid var(--att-accent)', background: 'var(--att-table-header-bg)', padding: '10px', fontSize: '12px', borderRadius: '4px', lineHeight: '1.4' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '700', color: 'var(--att-heading)', marginBottom: '4px' }}>
                        <span>{log.timestamp}</span>
                        <span>{log.batch}</span>
                      </div>
                      <div style={{ color: 'var(--att-text)' }}>
                        <strong>{log.action}</strong>: {log.details}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--att-muted)', marginTop: '4px', fontWeight: '600' }}>
                        By: {log.user} ({log.email})
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--att-muted)' }}>
                  No operational audit logs found.
                </div>
              )}
            </div>
            <div className="attendance-modal-footer">
              <button className="attendance-btn attendance-btn-secondary" onClick={() => setAuditOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
