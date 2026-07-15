import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, MoreVertical, Ban, X, FileSpreadsheet, Clock, Edit3, Printer, FileText
} from 'lucide-react';
import '../Attendance/Attendance.css';

export default function LogisticsFreight({ theme }) {
  const [history, setHistory] = useState([]);
  const [poList, setPoList] = useState([]);
  const [locations, setLocations] = useState([]);
  const [shippingVendors, setShippingVendors] = useState([]);
  const [postingLedgers, setPostingLedgers] = useState([]);
  const [selectedRow, setSelectedRow] = useState(null);
  
  // Filter States
  const [selectedFy, setSelectedFy] = useState(new Date().getMonth() >= 3 ? new Date().getFullYear().toString() : (new Date().getFullYear() - 1).toString());
  const [locationFilter, setLocationFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Audit Logs State
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    po_number: 'N/A',
    production_at: '',
    container_no: '',
    size: '40FT',
    shipping_line_id: '',
    accounting_ledger_id: '',
    ocean_cost: 0,
    local_cost: 0,
    handling: 0,
    detention: 0,
    gst_percent: 18,
    tax_amount: 0,
    lended_total: 0
  });

  // Notification State
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async (successMsg = null) => {
    try {
      const url = `/api/container/entry?fy=${selectedFy}${locationFilter ? `&location=${locationFilter}` : ''}`;
      const res = await fetch(url);
      const htmlText = await res.text();
      const doc = new DOMParser().parseFromString(htmlText, 'text/html');

      // Parse PO references
      const poOpts = doc.querySelectorAll('#modalPoNumber option');
      const parsedPo = Array.from(poOpts).map(o => o.value).filter(val => val !== 'N/A');
      setPoList(parsedPo);

      // Parse locations
      const locOpts = doc.querySelectorAll('#modalLocation option');
      const parsedLocs = Array.from(locOpts).map(o => o.value).filter(val => val !== '');
      setLocations(parsedLocs);

      // Parse shipping vendors
      const vendorOpts = doc.querySelectorAll('#modalVendorId option');
      const parsedVendors = Array.from(vendorOpts).map(o => ({
        id: o.value,
        name: o.textContent.trim()
      })).filter(v => v.id !== '');
      setShippingVendors(parsedVendors);

      // Parse posting ledgers
      const ledgerOpts = doc.querySelectorAll('#modalAccountingLedgerId option');
      const parsedLedgers = Array.from(ledgerOpts)
        .map(opt => ({
          id: opt.value,
          name: opt.textContent.trim()
        }))
        .filter(l => l.id !== '' && l.id !== '__add_new_ledger__');
      setPostingLedgers(parsedLedgers);

      // Parse history rows
      const rows = doc.querySelectorAll('#tableBody tr.data-row');
      const parsedHistory = Array.from(rows).map(row => {
        const cells = row.querySelectorAll('td');
        return {
          id: row.getAttribute('data-id'),
          po_number: row.getAttribute('data-po') || '',
          production_at: row.getAttribute('data-location') || '',
          container_no: cells[3]?.textContent.trim() || '',
          size: cells[4]?.textContent.trim() || '',
          vendor_name: cells[5]?.textContent.trim() || '',
          ocean_cost: parseFloat(cells[6]?.textContent.replace(/[₹,\s]/g, '') || 0),
          local_cost: parseFloat(cells[7]?.textContent.replace(/[₹,\s]/g, '') || 0),
          handling: parseFloat(cells[8]?.textContent.replace(/[₹,\s]/g, '') || 0),
          detention: parseFloat(cells[9]?.textContent.replace(/[₹,\s]/g, '') || 0),
          gst_percent: parseFloat(cells[10]?.textContent.replace(/[%\s]/g, '') || 18),
          lended_total: parseFloat(row.getAttribute('data-total') || cells[11]?.textContent.replace(/[₹,\s]/g, '') || 0),
          is_cancelled: row.getAttribute('data-cancelled') === 'true',
          status: cells[12]?.textContent.trim() || '',
          vendor_id: row.getAttribute('data-vendor-id') || ''
        };
      });

      setHistory(parsedHistory);
      if (successMsg) showNotification(successMsg, 'success');
    } catch (e) {
      showNotification('❌ Failed to fetch logistics freight ledger!', 'danger');
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
  }, [selectedFy, locationFilter]);

  const handleInputChange = (e) => {
    const { id, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [id]: value };
      if (['ocean_cost', 'local_cost', 'handling', 'detention', 'gst_percent'].includes(id)) {
        const ocean = parseFloat(updated.ocean_cost) || 0;
        const local = parseFloat(updated.local_cost) || 0;
        const handling = parseFloat(updated.handling) || 0;
        const detention = parseFloat(updated.detention) || 0;
        const gst = parseFloat(updated.gst_percent) || 0;

        const subtotal = ocean + local + handling + detention;
        const tax = (subtotal * gst) / 100;
        updated.tax_amount = tax.toFixed(2);
        updated.lended_total = (subtotal + tax).toFixed(2);
      }
      return updated;
    });
  };

  const handleLedgerChange = (e) => {
    const val = e.target.value;
    if (val === '__add_new_ledger__') {
      alert('Redirecting to Ledger directory to create ledger master.');
      window.location.href = '/finance_accounts/ledger_master/entry';
      return;
    }
    setFormData(prev => ({ ...prev, accounting_ledger_id: val }));
  };

  const openForm = () => {
    setEditId(null);
    setFormData({
      po_number: 'N/A',
      production_at: locations.length > 0 ? locations[0] : '',
      container_no: '',
      size: '40FT',
      shipping_line_id: shippingVendors.length > 0 ? shippingVendors[0].id : '',
      accounting_ledger_id: '',
      ocean_cost: 0,
      local_cost: 0,
      handling: 0,
      detention: 0,
      gst_percent: 18,
      tax_amount: 0,
      lended_total: 0
    });
    setIsModalOpen(true);
    setMenuOpen(false);
  };

  const openEditForm = () => {
    if (!selectedRow) return;
    setEditId(selectedRow.id);

    const subtotal = selectedRow.ocean_cost + selectedRow.local_cost + selectedRow.handling + selectedRow.detention;
    const taxVal = (subtotal * selectedRow.gst_percent) / 100;

    setFormData({
      po_number: selectedRow.po_number,
      production_at: selectedRow.production_at,
      container_no: selectedRow.container_no,
      size: selectedRow.size,
      shipping_line_id: selectedRow.vendor_id,
      accounting_ledger_id: '',
      ocean_cost: selectedRow.ocean_cost,
      local_cost: selectedRow.local_cost,
      handling: selectedRow.handling,
      detention: selectedRow.detention,
      gst_percent: selectedRow.gst_percent,
      tax_amount: taxVal.toFixed(2),
      lended_total: selectedRow.lended_total.toFixed(2)
    });

    setIsModalOpen(true);
    setMenuOpen(false);
  };

  const closeForm = () => {
    setIsModalOpen(false);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    if (!formData.production_at) {
      alert('Select location production unit!');
      return;
    }
    if (!formData.shipping_line_id) {
      alert('Select shipping line vendor!');
      return;
    }

    const confirmPost = window.confirm(`Post Logistics Entry?\nAre you sure you want to save these freight records?`);
    if (!confirmPost) return;

    try {
      const payload = {
        po_number: formData.po_number,
        production_at: formData.production_at,
        container_no: formData.container_no.trim().toUpperCase(),
        size: formData.size,
        shipping_line_id: parseInt(formData.shipping_line_id),
        ocean_cost: parseFloat(formData.ocean_cost) || 0,
        local_cost: parseFloat(formData.local_cost) || 0,
        handling: parseFloat(formData.handling) || 0,
        detention: parseFloat(formData.detention) || 0,
        gst_percent: parseFloat(formData.gst_percent) || 0,
        accounting_ledger_id: formData.accounting_ledger_id ? parseInt(formData.accounting_ledger_id) : null
      };

      const apiPath = editId ? `/api/container/update/${editId}` : `/api/container/save`;
      const methodType = editId ? 'PUT' : 'POST';

      const res = await fetch(apiPath, {
        method: methodType,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && (data.success || data.status === 'success')) {
        closeForm();
        loadData(data.message || '✅ Logistics transaction saved successfully!');
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to save logistics details!', 'danger');
      }
    } catch (err) {
      showNotification('❌ Network error saving logistics freight!', 'danger');
    }
  };

  const cancelSelected = async () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    
    if (selectedRow.is_cancelled) {
      alert('This entry is already marked as cancelled!');
      return;
    }

    const confirmDelete = window.confirm(`Cancel Entry?\nAre you sure you want to mark this container logistics entry as cancelled?`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/container/delete/${selectedRow.id}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && (data.success || data.status === 'success')) {
        showNotification('🗑️ Logistics entry cancelled successfully!', 'success');
        loadData();
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to cancel entry!', 'danger');
      }
    } catch (e) {
      showNotification('❌ Network error cancelling logistics entry!', 'danger');
    }
  };

  const openAuditLogs = async () => {
    setAuditOpen(true);
    setLoadingAudit(true);
    try {
      const res = await fetch('/api/container/audit_all');
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
    window.location.href = '/api/container/export/excel';
  };

  const executePdfExport = () => {
    if (selectedRow) {
      window.location.href = `/api/container/export/pdf/${selectedRow.id}`;
    }
  };

  const executePrint = () => {
    if (selectedRow) {
      window.open(`/api/container/print/${selectedRow.id}`, '_blank');
    }
  };

  // Filter application
  const filteredRecords = history.filter(rec => {
    const sQuery = searchQuery.toLowerCase().trim();
    if (!sQuery) return true;
    return (
      rec.po_number.toLowerCase().includes(sQuery) ||
      rec.container_no.toLowerCase().includes(sQuery) ||
      rec.vendor_name.toLowerCase().includes(sQuery) ||
      rec.production_at.toLowerCase().includes(sQuery)
    );
  });

  const grandTotalCost = filteredRecords.reduce((sum, item) => {
    return sum + (item.is_cancelled ? 0 : item.lended_total);
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
          <h1>Container Logistics Dashboard</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            Monitor marine export shipments, freight calculations, local cartage, and terminal detention parameters
          </p>
        </div>
        <div className="grand-total" style={{ background: 'var(--att-accent)', color: 'white', padding: '10px 24px', borderRadius: '8px', fontWeight: '800', fontSize: '14px' }}>
          TOTAL FREIGHT: ₹{grandTotalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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

        <div className="attendance-filter-group" style={{ minWidth: '180px', flex: '0 0 180px' }}>
          <label htmlFor="locationFilter">Production At</label>
          <select 
            id="locationFilter" 
            className="attendance-select" 
            value={locationFilter} 
            onChange={(e) => setLocationFilter(e.target.value)}
          >
            <option value="">-- ALL LOCATIONS --</option>
            {locations.map(loc => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
        </div>

        <div className="attendance-filter-group" style={{ minWidth: '220px', flex: '1' }}>
          <label htmlFor="searchBox">Search Bar</label>
          <div style={{ position: 'relative' }}>
            <input 
              id="searchBox" 
              type="text" 
              className="attendance-input" 
              placeholder="Search PO, Container, Vendor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '32px' }}
            />
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--att-muted)' }} />
          </div>
        </div>

        <button className="attendance-btn attendance-btn-secondary" onClick={() => { setSearchQuery(''); setLocationFilter(''); }} style={{ height: '38px' }}>
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
            <Clock size={14} /> Audit History
          </button>
          <button className="attendance-btn attendance-btn-secondary" onClick={executeExcelExport}>
            <FileSpreadsheet size={14} /> Export Excel
          </button>
          {selectedRow && (
            <React.Fragment>
              <button className="attendance-btn attendance-btn-secondary" onClick={executePdfExport}>
                <FileText size={14} /> PDF
              </button>
              <button className="attendance-btn attendance-btn-secondary" onClick={executePrint}>
                <Printer size={14} /> Print Report
              </button>
              <div className="attendance-actions-cell" ref={dropdownRef}>
                <button 
                  className="attendance-action-dots-btn" 
                  onClick={() => setMenuOpen(!menuOpen)}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid var(--att-border)', padding: '6px 12px', borderRadius: '6px' }}
                >
                  <MoreVertical size={16} /> Actions
                </button>
                {menuOpen && (
                  <div className="attendance-dropdown-menu" style={{ right: 0, top: '35px', width: '160px', zIndex: 20 }}>
                    <button className="attendance-dropdown-item" onClick={openEditForm}>
                      <Edit3 size={14} /> Edit Entry
                    </button>
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
            </React.Fragment>
          )}
          <button className="attendance-btn attendance-btn-primary" onClick={openForm}>
            <Plus size={16} /> NEW LOGISTICS ENTRY
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
                <th style={{ width: '120px' }}>PO Number</th>
                <th style={{ width: '140px' }}>Production At</th>
                <th>Container No</th>
                <th style={{ width: '100px' }}>Size</th>
                <th style={{ textalign: 'left' }}>Vendor (Shipping Line)</th>
                <th style={{ width: '120px', textAlign: 'right' }}>Ocean Freight</th>
                <th style={{ width: '120px', textAlign: 'right' }}>Local Transport</th>
                <th style={{ width: '110px', textAlign: 'right' }}>Handling</th>
                <th style={{ width: '110px', textAlign: 'right' }}>Detention</th>
                <th style={{ width: '90px' }}>GST %</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Grand Total</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Status</th>
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
                  <td style={{ fontWeight: '800' }}>{row.po_number}</td>
                  <td style={{ fontWeight: '700', color: 'var(--att-accent)' }}>{row.production_at || 'N/A'}</td>
                  <td>{row.container_no}</td>
                  <td>{row.size}</td>
                  <td style={{ textalign: 'left' }}>{row.vendor_name}</td>
                  <td style={{ textAlign: 'right' }}>{row.ocean_cost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right' }}>{row.local_cost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right' }}>{row.handling.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right' }}>{row.detention.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td>{row.gst_percent}%</td>
                  <td style={{ textAlign: 'right', fontWeight: '800', color: 'var(--att-success)' }}>
                    ₹{row.lended_total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
                  <td colSpan="13" className="attendance-empty">
                    No logistics records loaded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ENTRY MODAL */}
      {isModalOpen && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content" style={{ maxWidth: '950px' }}>
            <div className="attendance-modal-header">
              <h2>{editId ? 'Edit Logistics Entry' : 'New Logistics Entry'}</h2>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="attendance-modal-body">
                <div className="attendance-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
                  
                  <div className="attendance-form-group">
                    <label htmlFor="modalPoNumber">PO Number</label>
                    <select 
                      id="modalPoNumber" 
                      className="attendance-select" 
                      value={formData.po_number} 
                      onChange={handleInputChange} 
                      required
                    >
                      <option value="N/A">N/A</option>
                      {poList.map(po => (
                        <option key={po} value={po}>{po}</option>
                      ))}
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalLocation">Location (Production At)</label>
                    <select 
                      id="modalLocation" 
                      className="attendance-select" 
                      value={formData.production_at} 
                      onChange={(e) => setFormData(prev => ({ ...prev, production_at: e.target.value }))}
                      required
                    >
                      <option value="">-- Select Location --</option>
                      {locations.map(loc => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalContainerNo">Container Number</label>
                    <input 
                      id="modalContainerNo"
                      className="attendance-input" 
                      placeholder="MSKU1234567" 
                      style={{ textTransform: 'uppercase' }}
                      value={formData.container_no} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalSize">Container Size</label>
                    <select 
                      id="modalSize" 
                      className="attendance-select" 
                      value={formData.size} 
                      onChange={handleInputChange}
                    >
                      <option value="20FT">20 FT</option>
                      <option value="40FT">40 FT HC</option>
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalVendorId">Shipping Line Vendor</label>
                    <select 
                      id="modalVendorId" 
                      className="attendance-select" 
                      value={formData.shipping_line_id} 
                      onChange={handleInputChange} 
                      required
                    >
                      <option value="">-- Select Shipping Line --</option>
                      {shippingVendors.map(v => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalAccountingLedgerId">Accounting Ledger</label>
                    <select 
                      id="modalAccountingLedgerId" 
                      className="attendance-select" 
                      value={formData.accounting_ledger_id} 
                      onChange={handleLedgerChange}
                    >
                      <option value="">Auto - Freight & Logistics Expense A/c</option>
                      {postingLedgers.map(ledger => (
                        <option key={ledger.id} value={ledger.id}>{ledger.name}</option>
                      ))}
                      <option value="__add_new_ledger__">+ Add New Ledger</option>
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalOceanCost">Ocean Freight</label>
                    <input 
                      id="modalOceanCost"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.ocean_cost} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalLocalCost">Local Transport</label>
                    <input 
                      id="modalLocalCost"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.local_cost} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalHandling">Handling Charges</label>
                    <input 
                      id="modalHandling"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.handling} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalDetention">Detention Charges</label>
                    <input 
                      id="modalDetention"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.detention} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalGstPercent">GST Tax Tier (%)</label>
                    <select 
                      id="modalGstPercent" 
                      className="attendance-select" 
                      value={formData.gst_percent} 
                      onChange={handleInputChange}
                    >
                      <option value="0">0%</option>
                      <option value="5">5%</option>
                      <option value="12">12%</option>
                      <option value="18">18%</option>
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalTaxAmount">Tax Calculated</label>
                    <input 
                      id="modalTaxAmount"
                      className="attendance-input" 
                      style={{ background: 'var(--att-table-row-hover)' }}
                      value={formData.tax_amount} 
                      readOnly 
                    />
                  </div>

                </div>

                <div style={{ marginTop: '20px', background: 'rgba(16, 185, 129, 0.12)', padding: '12px 18px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <span style={{ fontWeight: '700', color: 'var(--att-success)', fontSize: '13px' }}>Lended Total Amount:</span>
                  <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--att-success)' }}>
                    ₹{parseFloat(formData.lended_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              <div className="attendance-modal-footer">
                <button type="button" className="attendance-btn attendance-btn-secondary" onClick={closeForm}>
                  Cancel
                </button>
                <button type="submit" className="attendance-btn attendance-btn-primary">
                  Save Logistics
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
              <h2>Logistics History Logs</h2>
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
                  No historical record logs found.
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
