import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, MoreVertical, Ban, X, FileSpreadsheet, Clock, Fuel, ArrowDownRight, ArrowUpRight
} from 'lucide-react';
import '../Attendance/Attendance.css';

export default function DieselConsumption({ theme }) {
  const [history, setHistory] = useState([]);
  const [locations, setLocations] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [selectedRow, setSelectedRow] = useState(null);
  
  // Filter States
  const [selectedFy, setSelectedFy] = useState(new Date().getMonth() >= 3 ? new Date().getFullYear().toString() : (new Date().getFullYear() - 1).toString());
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [modalMode, setModalMode] = useState(null); // 'IN', 'OUT' or null
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Audit Log State
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Form States
  const [inFormData, setInFormData] = useState({
    entry_date: new Date().toISOString().split('T')[0],
    in_unit_id: '',
    bill_date: new Date().toISOString().split('T')[0],
    grn_no: '',
    bill_no: '',
    vendor: '',
    received_qty: 0,
    rate: 0,
    tax_per: 0,
    net_amount: 0,
    closing_stock: 0,
    opening_stock: 0
  });

  const [outFormData, setOutFormData] = useState({
    out_date: new Date().toISOString().split('T')[0],
    unit_id: '',
    out_qty: 0,
    out_rate: 0,
    out_closing: 0,
    opening_stock: 0
  });

  // Notification State
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async (successMsg = null) => {
    try {
      const url = `/api/diesel/entry?fy=${selectedFy}`;
      const res = await fetch(url);
      const htmlText = await res.text();
      const doc = new DOMParser().parseFromString(htmlText, 'text/html');

      // Parse locations
      const locOptions = doc.querySelectorAll('#in_unit_id option');
      const parsedLocs = Array.from(locOptions)
        .map(opt => ({
          id: opt.value,
          name: opt.textContent.trim()
        }))
        .filter(l => l.id !== '');
      setLocations(parsedLocs);

      // Parse vendors
      const venOptions = doc.querySelectorAll('#in_vendor option');
      const parsedVendors = Array.from(venOptions)
        .map(opt => ({
          name: opt.value
        }))
        .filter(v => v.name !== '');
      setVendors(parsedVendors);

      // Parse history rows
      const rows = doc.querySelectorAll('#tableBody tr.data-row');
      const parsedHistory = Array.from(rows).map(row => {
        const cells = row.querySelectorAll('td');
        return {
          id: row.getAttribute('data-id'),
          log_date: cells[1]?.textContent.trim() || '',
          location_name: cells[2]?.textContent.trim() || '',
          type: row.getAttribute('data-type') || 'IN',
          grn_no: cells[4]?.textContent.trim() || '',
          bill_info: cells[5]?.textContent.trim() || '',
          vendor: cells[6]?.textContent.trim() || '',
          opening_stock: parseFloat(row.getAttribute('data-opening') || 0),
          purchase_qty: parseFloat(row.getAttribute('data-purchase') || 0),
          consumption: parseFloat(row.getAttribute('data-consumption') || 0),
          closing_stock: parseFloat(row.getAttribute('data-closing') || 0),
          avg_rate: parseFloat(cells[11]?.textContent.replace(/[₹,\s]/g, '') || 0),
          net_val: parseFloat(row.getAttribute('data-total') || cells[12]?.textContent.replace(/[₹,\s]/g, '') || 0),
          is_cancelled: row.getAttribute('data-cancelled') === 'true',
          status: cells[13]?.textContent.trim() || ''
        };
      });

      setHistory(parsedHistory);
      if (successMsg) showNotification(successMsg, 'success');
    } catch (e) {
      showNotification('❌ Failed to fetch diesel records!', 'danger');
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

  const handleInLocationChange = async (e) => {
    const unitId = e.target.value;
    if (!unitId) return;

    try {
      const res = await fetch(`/api/diesel/lookup/${unitId}`);
      if (res.ok) {
        const data = await res.json();
        setInFormData(prev => {
          const updated = {
            ...prev,
            in_unit_id: unitId,
            opening_stock: parseFloat(data.last_closing || 0)
          };
          const base = (parseFloat(updated.received_qty) || 0) * (parseFloat(updated.rate) || 0);
          updated.net_amount = (base + (base * (parseFloat(updated.tax_per) || 0) / 100)).toFixed(2);
          updated.closing_stock = (updated.opening_stock + (parseFloat(updated.received_qty) || 0)).toFixed(2);
          return updated;
        });
      }
    } catch (err) {
      showNotification('❌ Failed to lookup last stock balance!', 'danger');
    }
  };

  const handleOutLocationChange = async (e) => {
    const unitId = e.target.value;
    if (!unitId) return;

    try {
      const res = await fetch(`/api/diesel/lookup/${unitId}`);
      if (res.ok) {
        const data = await res.json();
        setOutFormData(prev => {
          const updated = {
            ...prev,
            unit_id: unitId,
            opening_stock: parseFloat(data.last_closing || 0),
            out_rate: parseFloat(data.last_rate || 0)
          };
          const rem = updated.opening_stock - (parseFloat(updated.out_qty) || 0);
          updated.out_closing = Math.max(0, rem).toFixed(2);
          return updated;
        });
      }
    } catch (err) {
      showNotification('❌ Failed to lookup weighted average rates!', 'danger');
    }
  };

  const handleInInputChange = (e) => {
    const { id, value } = e.target;
    const cleanId = id.replace('in_', '');
    setInFormData(prev => {
      const updated = { ...prev, [cleanId]: value };
      const opening = parseFloat(updated.opening_stock) || 0;
      const qty = parseFloat(updated.received_qty) || 0;
      const rate = parseFloat(updated.rate) || 0;
      const tax = parseFloat(updated.tax_per) || 0;

      const base = qty * rate;
      updated.net_amount = (base + (base * tax / 100)).toFixed(2);
      updated.closing_stock = (opening + qty).toFixed(2);
      return updated;
    });
  };

  const handleOutInputChange = (e) => {
    const { id, value } = e.target;
    const cleanId = id.replace('out_', '');
    setOutFormData(prev => {
      const updated = { ...prev, [cleanId]: value };
      const opening = parseFloat(updated.opening_stock) || 0;
      const qty = parseFloat(updated.out_qty) || 0;
      const rem = opening - qty;
      updated.out_closing = (rem >= 0 ? rem : 0).toFixed(2);
      return updated;
    });
  };

  const openForm = (mode) => {
    setModalMode(mode);
    setMenuOpen(false);
    if (mode === 'IN') {
      setInFormData({
        entry_date: new Date().toISOString().split('T')[0],
        in_unit_id: '',
        bill_date: new Date().toISOString().split('T')[0],
        grn_no: '',
        bill_no: '',
        vendor: '',
        received_qty: 0,
        rate: 0,
        tax_per: 0,
        net_amount: 0,
        closing_stock: 0,
        opening_stock: 0
      });
    } else {
      setOutFormData({
        out_date: new Date().toISOString().split('T')[0],
        unit_id: '',
        out_qty: 0,
        out_rate: 0,
        out_closing: 0,
        opening_stock: 0
      });
    }
  };

  const closeForm = () => {
    setModalMode(null);
  };

  const handleInSubmit = async (e) => {
    e.preventDefault();
    if (!inFormData.in_unit_id) {
      alert('Select location unit!');
      return;
    }

    const qty = parseFloat(inFormData.received_qty) || 0;
    const rate = parseFloat(inFormData.rate) || 0;
    if (qty <= 0 || rate <= 0) {
      alert('Qty and Rate must be greater than zero!');
      return;
    }

    const confirmPost = window.confirm(`Post Stock In (GRN)?\nAre you sure you want to log this purchase?`);
    if (!confirmPost) return;

    try {
      const payload = {
        entry_date: inFormData.entry_date,
        in_unit_id: parseInt(inFormData.in_unit_id),
        bill_date: inFormData.bill_date,
        grn_no: inFormData.grn_no.trim(),
        bill_no: inFormData.bill_no.trim(),
        vendor: inFormData.vendor,
        received_qty: qty,
        rate: rate,
        tax_per: parseFloat(inFormData.tax_per) || 0,
        net_amount: parseFloat(inFormData.net_amount) || 0,
        closing_stock: parseFloat(inFormData.closing_stock) || 0
      };

      const res = await fetch('/api/diesel/save_in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        closeForm();
        loadData(data.message || '✅ Diesel Purchase GRN entry logged!');
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to save GRN entry!', 'danger');
      }
    } catch (err) {
      showNotification('❌ Network error saving purchase GRN!', 'danger');
    }
  };

  const handleOutSubmit = async (e) => {
    e.preventDefault();
    if (!outFormData.unit_id) {
      alert('Select location unit!');
      return;
    }

    const qty = parseFloat(outFormData.out_qty) || 0;
    const opening = parseFloat(outFormData.opening_stock) || 0;
    if (qty <= 0) {
      alert('Consumed qty must be greater than zero!');
      return;
    }
    if (qty > opening) {
      alert('Consumption cannot exceed current location available stock balance!');
      return;
    }

    const confirmPost = window.confirm(`Post Fuel Consumption?\nAre you sure you want to log this usage entry?`);
    if (!confirmPost) return;

    try {
      const payload = {
        out_date: outFormData.out_date,
        unit_id: parseInt(outFormData.unit_id),
        out_qty: qty,
        out_closing: parseFloat(outFormData.out_closing) || 0
      };

      const res = await fetch('/api/diesel/save_out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        closeForm();
        loadData(data.message || '✅ Fuel consumption entry posted!');
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to post consumption!', 'danger');
      }
    } catch (err) {
      showNotification('❌ Network error posting consumption log!', 'danger');
    }
  };

  const cancelSelected = async () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    
    if (selectedRow.is_cancelled) {
      alert('This entry is already marked as cancelled!');
      return;
    }

    const confirmDelete = window.confirm(`Cancel Entry?\nAre you sure you want to cancel this diesel log statement?`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/diesel/delete/${selectedRow.id}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification('🗑️ Diesel record cancelled successfully!', 'success');
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
      const res = await fetch('/api/diesel/audit_all');
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
    window.location.href = '/api/diesel/export/excel';
  };

  // Filter application
  const filteredRecords = history.filter(rec => {
    const sQuery = searchQuery.toLowerCase().trim();
    if (!sQuery) return true;
    return (
      rec.grn_no.toLowerCase().includes(sQuery) ||
      rec.bill_info.toLowerCase().includes(sQuery) ||
      rec.vendor.toLowerCase().includes(sQuery) ||
      rec.location_name.toLowerCase().includes(sQuery)
    );
  });

  // Calculate current metrics based on chronological flow
  let recalculatedQty = 0;
  let valueImpact = 0;
  [...filteredRecords].reverse().forEach(rec => {
    const qtyMovement = rec.type === 'IN' ? rec.purchase_qty : -rec.consumption;
    const valueMovement = rec.type === 'IN' ? rec.net_val : -rec.net_val;
    recalculatedQty += rec.is_cancelled ? 0 : qtyMovement;
    valueImpact += rec.is_cancelled ? 0 : valueMovement;
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
          <h1>Diesel Stock Ledger</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            Track generator fuel inventories, GRN inputs, and weighted average daily consumption costs
          </p>
        </div>
        <div className="grand-total" style={{ background: 'var(--att-accent)', color: 'white', padding: '10px 24px', borderRadius: '8px', fontWeight: '800', fontSize: '12px', lineHeight: '1.4', textAlign: 'right' }}>
          AVAILABLE QTY: {recalculatedQty.toLocaleString('en-IN', { minimumFractionDigits: 2 })} Ltr
          <br />
          VALUE: ₹{valueImpact.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </div>
      </div>

      {/* FILTERS BAR */}
      <div className="attendance-filters-bar">
        <div className="attendance-filter-group" style={{ minWidth: '160px', flex: '0 0 160px' }}>
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

        <div className="attendance-filter-group" style={{ minWidth: '260px', flex: '1' }}>
          <label htmlFor="searchBox">Search Bar</label>
          <div style={{ position: 'relative' }}>
            <input 
              id="searchBox" 
              type="text" 
              className="attendance-input" 
              placeholder="Search GRN, Bill, Vendor, Location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '32px' }}
            />
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--att-muted)' }} />
          </div>
        </div>

        <button className="attendance-btn attendance-btn-secondary" onClick={() => setSearchQuery('')} style={{ height: '38px' }}>
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
          <button className="attendance-btn" onClick={() => openForm('IN')} style={{ background: 'var(--att-success)', color: 'white' }}>
            <Plus size={16} /> STOCK IN (GRN)
          </button>
          <button className="attendance-btn" onClick={() => openForm('OUT')} style={{ background: '#f59e0b', color: 'white' }}>
            <Fuel size={16} /> STOCK OUT
          </button>
        </div>
      </div>

      {/* DATA TABLE */}
      <div className="attendance-table-container">
        <div className="attendance-table-wrapper">
          <table className="attendance-table">
            <thead>
              <tr>
                <th style={{ width: '50px', textAlign: 'center' }}>Sl</th>
                <th style={{ width: '110px' }}>Log Date</th>
                <th style={{ textalign: 'left' }}>Location</th>
                <th style={{ width: '110px', textAlign: 'center' }}>Stream Type</th>
                <th style={{ width: '120px' }}>GRN Ref</th>
                <th style={{ width: '140px' }}>Bill No & Date</th>
                <th style={{ textalign: 'left' }}>Vendor Entity</th>
                <th style={{ width: '100px', textAlign: 'right' }}>Opening Ltr</th>
                <th style={{ width: '110px', textAlign: 'right' }}>Stock In (Ltr)</th>
                <th style={{ width: '110px', textAlign: 'right' }}>Consume (Ltr)</th>
                <th style={{ width: '100px', textAlign: 'right' }}>Closing Ltr</th>
                <th style={{ width: '100px', textAlign: 'right' }}>Avg Rate</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Net Value</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Accounts</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((row, idx) => (
                <tr 
                  key={row.id} 
                  data-record-id={row.id}
                  className={`${selectedRow?.id === row.id ? 'selected' : ''} ${row.is_cancelled ? 'cancelled-row' : ''}`}
                  onClick={() => setSelectedRow(row)}
                  style={row.is_cancelled ? { opacity: 0.62, textDecoration: 'line-through' } : {}}
                >
                  <td style={{ textAlign: 'center' }}>{filteredRecords.length - idx}</td>
                  <td>{row.log_date}</td>
                  <td style={{ textalign: 'left', fontWeight: '700' }}>{row.location_name}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span 
                      className="attendance-badge" 
                      style={{ 
                        background: row.type === 'IN' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: row.type === 'IN' ? 'var(--att-success)' : '#d97706'
                      }}
                    >
                      {row.type === 'IN' ? 'STOCK IN' : 'CONSUMPTION'}
                    </span>
                  </td>
                  <td style={{ fontWeight: '600' }}>{row.grn_no || '-'}</td>
                  <td>{row.bill_info || '-'}</td>
                  <td style={{ textalign: 'left' }}>{row.vendor}</td>
                  <td style={{ textAlign: 'right' }}>{row.opening_stock.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right', color: 'var(--att-success)' }}>
                    {row.purchase_qty > 0 ? row.purchase_qty.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '-'}
                  </td>
                  <td style={{ textAlign: 'right', color: '#f59e0b' }}>
                    {row.consumption > 0 ? row.consumption.toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '-'}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: '700' }}>{row.closing_stock.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right' }}>₹{row.avg_rate.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right', fontWeight: '800', color: 'var(--att-heading)' }}>
                    ₹{row.net_val.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`attendance-badge ${row.is_cancelled ? 'attendance-badge-absent' : 'attendance-badge-present'}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!filteredRecords.length && (
                <tr>
                  <td colSpan="14" className="attendance-empty">
                    No fuel stock transactions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* STOCK IN (GRN) MODAL */}
      {modalMode === 'IN' && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content" style={{ maxWidth: '900px' }}>
            <div className="attendance-modal-header" style={{ borderBottomColor: 'var(--att-success)' }}>
              <h2 style={{ color: 'var(--att-success)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ArrowDownRight size={20} /> Diesel Stock In (GRN)
              </h2>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleInSubmit}>
              <div className="attendance-modal-body">
                <div className="attendance-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
                  
                  <div className="attendance-form-group">
                    <label htmlFor="in_entry_date">Entry Log Date</label>
                    <input 
                      id="in_entry_date"
                      className="attendance-input" 
                      type="date" 
                      value={inFormData.entry_date} 
                      onChange={handleInInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="in_unit_id">Location Unit</label>
                    <select 
                      id="in_unit_id"
                      className="attendance-select" 
                      value={inFormData.in_unit_id} 
                      onChange={handleInLocationChange} 
                      required
                    >
                      <option value="">-- Select Location --</option>
                      {locations.map(l => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="in_opening">Opening Stock (Ltr)</label>
                    <input 
                      id="in_opening"
                      className="attendance-input" 
                      value={parseFloat(inFormData.opening_stock || 0).toFixed(2)} 
                      readOnly 
                      style={{ background: 'var(--att-table-row-hover)' }}
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="in_grn_no">GRN Document No</label>
                    <input 
                      id="in_grn_no"
                      className="attendance-input" 
                      placeholder="GRN-001" 
                      style={{ textTransform: 'uppercase' }}
                      value={inFormData.grn_no} 
                      onChange={handleInInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="in_bill_no">Supplier Invoice No</label>
                    <input 
                      id="in_bill_no"
                      className="attendance-input" 
                      placeholder="INV-123" 
                      value={inFormData.bill_no} 
                      onChange={handleInInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="in_bill_date">Invoice Date</label>
                    <input 
                      id="in_bill_date"
                      className="attendance-input" 
                      type="date" 
                      value={inFormData.bill_date} 
                      onChange={handleInInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="in_vendor">Vendor</label>
                    <select 
                      id="in_vendor"
                      className="attendance-select" 
                      value={inFormData.vendor} 
                      onChange={handleInInputChange} 
                      required
                    >
                      <option value="">-- Select Vendor --</option>
                      {vendors.map(v => (
                        <option key={v.name} value={v.name}>{v.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="in_qty">Received Qty (Ltr)</label>
                    <input 
                      id="in_qty"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={inFormData.received_qty} 
                      onChange={handleInInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="in_rate">Base Rate / Ltr</label>
                    <input 
                      id="in_rate"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={inFormData.rate} 
                      onChange={handleInInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="in_tax">Tax/VAT Tier (%)</label>
                    <input 
                      id="in_tax"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={inFormData.tax_per} 
                      onChange={handleInInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="in_net">Net Amount (Incl. Tax)</label>
                    <input 
                      id="in_net"
                      className="attendance-input" 
                      style={{ background: 'var(--att-table-row-hover)', fontWeight: '700' }}
                      value={parseFloat(inFormData.net_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} 
                      readOnly 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="in_closing">Expected Closing (Ltr)</label>
                    <input 
                      id="in_closing"
                      className="attendance-input" 
                      style={{ background: 'var(--att-table-row-hover)', fontWeight: '700' }}
                      value={parseFloat(inFormData.closing_stock || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} 
                      readOnly 
                    />
                  </div>

                </div>
              </div>
              <div className="attendance-modal-footer">
                <button type="button" className="attendance-btn attendance-btn-secondary" onClick={closeForm}>
                  Cancel
                </button>
                <button type="submit" className="attendance-btn" style={{ background: 'var(--att-success)', color: 'white' }}>
                  Submit GRN
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STOCK OUT (CONSUMPTION) MODAL */}
      {modalMode === 'OUT' && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content" style={{ maxWidth: '800px' }}>
            <div className="attendance-modal-header" style={{ borderBottomColor: '#f59e0b' }}>
              <h2 style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ArrowUpRight size={20} /> Fuel Consumption Entry
              </h2>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleOutSubmit}>
              <div className="attendance-modal-body">
                <div className="attendance-form-grid" style={{ gridTemplateColumns: '1.2fr 1fr 1fr' }}>
                  
                  <div className="attendance-form-group">
                    <label htmlFor="out_date">Consumption Date</label>
                    <input 
                      id="out_date"
                      className="attendance-input" 
                      type="date" 
                      value={outFormData.out_date} 
                      onChange={handleOutInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="out_unit_id">Location Unit</label>
                    <select 
                      id="out_unit_id"
                      className="attendance-select" 
                      value={outFormData.unit_id} 
                      onChange={handleOutLocationChange} 
                      required
                    >
                      <option value="">-- Select Location --</option>
                      {locations.map(l => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="out_opening">Available Stock (Ltr)</label>
                    <input 
                      id="out_opening"
                      className="attendance-input" 
                      value={parseFloat(outFormData.opening_stock || 0).toFixed(2)} 
                      readOnly 
                      style={{ background: 'var(--att-table-row-hover)', fontWeight: '700' }}
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="out_qty">Consumed Quantity (Ltr)</label>
                    <input 
                      id="out_qty"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={outFormData.out_qty} 
                      onChange={handleOutInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="out_rate">Current Weighted Rate</label>
                    <input 
                      id="out_rate"
                      className="attendance-input" 
                      value={parseFloat(outFormData.out_rate || 0).toFixed(2)} 
                      readOnly 
                      style={{ background: 'var(--att-table-row-hover)' }}
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="out_closing">Calculated Closing Stock</label>
                    <input 
                      id="out_closing"
                      className="attendance-input" 
                      style={{ background: 'var(--att-table-row-hover)', fontWeight: '700' }}
                      value={parseFloat(outFormData.out_closing || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} 
                      readOnly 
                    />
                  </div>

                </div>
              </div>
              <div className="attendance-modal-footer">
                <button type="button" className="attendance-btn attendance-btn-secondary" onClick={closeForm}>
                  Cancel
                </button>
                <button type="submit" className="attendance-btn" style={{ background: '#f59e0b', color: 'white' }}>
                  Submit Consumption
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
              <h2>Fuel Transaction History Logs</h2>
              <button className="attendance-modal-close-btn" onClick={() => setAuditOpen(false)} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            <div className="attendance-modal-body" style={{ maxHeight: '450px', overflowY: 'auto' }}>
              {loadingAudit ? (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--att-muted)' }}>
                  <Clock className="spin" size={24} style={{ marginBottom: '8px' }} />
                  <p>Loading audit logs...</p>
                </div>
              ) : auditLogs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {auditLogs.map((log, idx) => (
                    <div key={idx} data-audit-record-id={log.record_id} onClick={() => { setAuditOpen(false); window.setTimeout(() => window.openAuditRecord?.(log.record_id), 80); }} style={{ borderLeft: '3px solid var(--att-accent)', background: 'var(--att-table-header-bg)', padding: '10px', fontSize: '12px', borderRadius: '4px', lineHeight: '1.4', cursor: 'pointer' }}>
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
                  No operational records found.
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
