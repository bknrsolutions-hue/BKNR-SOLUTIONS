import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, MoreVertical, Ban, X, FileSpreadsheet, Clock, Edit3, Printer, FileText
} from 'lucide-react';
import '../Attendance/Attendance.css';

export default function PurchasePackaging({ theme }) {
  const [history, setHistory] = useState([]);
  const [locations, setLocations] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [postingLedgers, setPostingLedgers] = useState([]);
  const [poList, setPoList] = useState([]);
  const [hsnList, setHsnList] = useState([]);
  
  const [selectedRow, setSelectedRow] = useState(null);
  
  // Filter States
  const [selectedFy, setSelectedFy] = useState(new Date().getMonth() >= 3 ? new Date().getFullYear().toString() : (new Date().getFullYear() - 1).toString());
  const [monthFilter, setMonthFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [vendorFilter, setVendorFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Searchable drop lists states inside modal
  const [showLocDropdown, setShowLocDropdown] = useState(false);
  const [locSearchVal, setLocSearchVal] = useState('');
  
  const [showVendorDropdown, setShowVendorDropdown] = useState(false);
  const [vendorSearchVal, setVendorSearchVal] = useState('');

  const [showPoDropdown, setShowPoDropdown] = useState(false);
  const [poSearchVal, setPoSearchVal] = useState('');

  const [showHsnDropdown, setShowHsnDropdown] = useState(false);
  const [hsnSearchVal, setHsnSearchVal] = useState('');

  // Audit History state
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    invoice_date: new Date().toISOString().split('T')[0],
    invoice_no: '',
    unit_id: '',
    unit_name: '',
    vendor_id: '',
    vendor_name: '',
    po_number: 'N/A',
    hsn_code: '',
    qty: 0,
    base_price: 0,
    gst_percent: 18,
    tax_amount: 0,
    grand_total: 0,
    product_name: '',
    accounting_ledger_id: ''
  });

  // Notification State
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async (successMsg = null) => {
    try {
      const url = `/api/purchase/entry?fy=${selectedFy}`;
      const res = await fetch(url);
      const htmlText = await res.text();
      const doc = new DOMParser().parseFromString(htmlText, 'text/html');

      // Parse locations
      const locItems = doc.querySelectorAll('#modalLocationDropdown .dropdown-item');
      const parsedLocs = Array.from(locItems).map(item => {
        // extract label & onclick parameter
        const onclickText = item.getAttribute('onclick') || '';
        const match = onclickText.match(/'([^']*)'/g);
        const id = match && match[3] ? match[3].replace(/'/g, '') : '';
        const label = match && match[4] ? match[4].replace(/'/g, '') : item.textContent.trim();
        return { id, label };
      }).filter(l => l.id !== '');
      setLocations(parsedLocs);

      // Parse vendors
      const venItems = doc.querySelectorAll('#modalVendorDropdown .dropdown-item');
      const parsedVendors = Array.from(venItems).map(item => {
        const onclickText = item.getAttribute('onclick') || '';
        const match = onclickText.match(/'([^']*)'/g);
        const id = match && match[3] ? match[3].replace(/'/g, '') : '';
        const label = match && match[4] ? match[4].replace(/'/g, '') : item.textContent.trim();
        return { id, label };
      }).filter(v => v.id !== '');
      setVendors(parsedVendors);

      // Parse posting ledgers
      const ledgerOpts = doc.querySelectorAll('#modalAccountingLedgerId option');
      const parsedLedgers = Array.from(ledgerOpts)
        .map(opt => ({
          id: opt.value,
          name: opt.textContent.trim()
        }))
        .filter(l => l.id !== '' && l.id !== '__add_new_ledger__');
      setPostingLedgers(parsedLedgers);

      // Parse PO reference list
      const poItems = doc.querySelectorAll('#modalPoDropdown .dropdown-item');
      const parsedPo = Array.from(poItems).map(item => item.textContent.trim());
      setPoList(parsedPo);

      // Parse HSN list
      const hsnItems = doc.querySelectorAll('#modalHsnDropdown .dropdown-item');
      const parsedHsn = Array.from(hsnItems).map(item => {
        const onclickText = item.getAttribute('onclick') || '';
        const match = onclickText.match(/'([^']*)'/g);
        const hsn = match && match[0] ? match[0].replace(/'/g, '') : '';
        const gst = match && match[1] ? match[1].replace(/'/g, '') : '18';
        return { hsn, gst };
      });
      setHsnList(parsedHsn);

      // Parse history table rows
      const rows = doc.querySelectorAll('#tableBody tr.data-row');
      const parsedHistory = Array.from(rows).map(row => {
        const cells = row.querySelectorAll('td');
        return {
          id: row.getAttribute('data-id'),
          invoice_date: row.getAttribute('data-date') || '',
          invoice_no: row.getAttribute('data-invno') || '',
          unit_id: row.getAttribute('data-company') || '',
          unit_name: cells[3]?.textContent.trim() || '',
          po_number: row.getAttribute('data-ponumber') || 'N/A',
          vendor_id: row.getAttribute('data-vendor') || '',
          vendor_name: cells[5]?.textContent.trim() || '',
          product_name: row.getAttribute('data-product') || '',
          hsn_code: row.getAttribute('data-hsn') || '',
          qty: parseFloat(row.getAttribute('data-qty') || 0),
          base_price: parseFloat(row.getAttribute('data-rate') || 0),
          gst_percent: parseFloat(row.getAttribute('data-gst') || 0),
          grand_total: parseFloat(row.getAttribute('data-total') || 0),
          is_cancelled: row.getAttribute('data-cancelled') === 'true',
          status: cells[11]?.textContent.trim() || ''
        };
      });

      setHistory(parsedHistory);
      if (successMsg) showNotification(successMsg, 'success');
    } catch (e) {
      showNotification('❌ Failed to fetch purchase invoice data!', 'danger');
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

  const handleInputChange = (e) => {
    const { id, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [id]: value };
      if (id === 'qty' || id === 'base_price' || id === 'gst_percent') {
        const q = parseFloat(updated.qty) || 0;
        const r = parseFloat(updated.base_price) || 0;
        const taxPercent = parseFloat(updated.gst_percent) || 0;
        
        const taxable = q * r;
        const taxVal = (taxable * taxPercent) / 100;
        updated.tax_amount = taxVal.toFixed(2);
        updated.grand_total = (taxable + taxVal).toFixed(2);
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
    setLocSearchVal('');
    setVendorSearchVal('');
    setPoSearchVal('');
    setHsnSearchVal('');
    setFormData({
      invoice_date: new Date().toISOString().split('T')[0],
      invoice_no: '',
      unit_id: '',
      unit_name: '',
      vendor_id: '',
      vendor_name: '',
      po_number: 'N/A',
      hsn_code: '',
      qty: 0,
      base_price: 0,
      gst_percent: 18,
      tax_amount: 0,
      grand_total: 0,
      product_name: '',
      accounting_ledger_id: ''
    });
    setIsModalOpen(true);
    setMenuOpen(false);
  };

  const openEditForm = () => {
    if (!selectedRow) return;
    setEditId(selectedRow.id);
    setLocSearchVal(selectedRow.unit_name);
    setVendorSearchVal(selectedRow.vendor_name);
    setPoSearchVal(selectedRow.po_number);
    setHsnSearchVal(selectedRow.hsn_code);

    const q = selectedRow.qty;
    const r = selectedRow.base_price;
    const taxable = q * r;
    const taxVal = (taxable * selectedRow.gst_percent) / 100;

    setFormData({
      invoice_date: selectedRow.invoice_date,
      invoice_no: selectedRow.invoice_no,
      unit_id: selectedRow.unit_id,
      unit_name: selectedRow.unit_name,
      vendor_id: selectedRow.vendor_id,
      vendor_name: selectedRow.vendor_name,
      po_number: selectedRow.po_number,
      hsn_code: selectedRow.hsn_code,
      qty: q,
      base_price: r,
      gst_percent: selectedRow.gst_percent,
      tax_amount: taxVal.toFixed(2),
      grand_total: selectedRow.grand_total.toFixed(2),
      product_name: selectedRow.product_name,
      accounting_ledger_id: ''
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
    if (!formData.vendor_id) {
      alert('Select vendor entity!');
      return;
    }

    const q = parseFloat(formData.qty) || 0;
    const r = parseFloat(formData.base_price) || 0;
    if (q <= 0 || r <= 0) {
      alert('Quantity and base price rate must be greater than zero!');
      return;
    }

    const confirmPost = window.confirm(`Post Purchase Invoice?\nAre you sure you want to save this invoice statement?`);
    if (!confirmPost) return;

    try {
      const payload = {
        invoice_date: formData.invoice_date,
        invoice_no: formData.invoice_no,
        unit_id: parseInt(formData.unit_id),
        vendor_id: parseInt(formData.vendor_id),
        po_number: formData.po_number || 'N/A',
        hsn_code: formData.hsn_code,
        qty: q,
        base_price: r,
        gst_percent: parseFloat(formData.gst_percent) || 0,
        product_name: formData.product_name.toUpperCase(),
        accounting_ledger_id: formData.accounting_ledger_id ? parseInt(formData.accounting_ledger_id) : null
      };

      let url = '/api/purchase/save';
      if (editId) {
        url += `?invoice_id=${editId}`;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && data.success) {
        closeForm();
        loadData(data.message || '✅ Purchase Invoice saved successfully!');
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to save invoice!', 'danger');
      }
    } catch (err) {
      showNotification('❌ Network error saving purchase invoice!', 'danger');
    }
  };

  const cancelSelected = async () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    
    if (selectedRow.is_cancelled) {
      alert('This entry is already marked as cancelled!');
      return;
    }

    const confirmDelete = window.confirm(`Cancel Invoice?\nAre you sure you want to mark this invoice statement as cancelled?`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/purchase/delete/${selectedRow.id}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification('🗑️ Invoice entry marked as cancelled!', 'success');
        loadData();
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to cancel invoice!', 'danger');
      }
    } catch (e) {
      showNotification('❌ Network error cancelling invoice entry!', 'danger');
    }
  };

  const openAuditLogs = async () => {
    setAuditOpen(true);
    setLoadingAudit(true);
    try {
      const res = await fetch('/api/purchase/audit_all');
      if (res.ok) {
        const logs = await res.json();
        setAuditLogs(logs || []);
      }
    } catch (err) {
      showNotification('❌ Failed to fetch audit logs!', 'danger');
    } finally {
      setLoadingAudit(false);
    }
  };

  const executeExcelExport = () => {
    window.location.href = '/api/purchase/export/excel';
  };

  const executePdfExport = () => {
    if (selectedRow) {
      window.location.href = `/api/purchase/export/pdf/${selectedRow.id}`;
    }
  };

  const executePrint = () => {
    if (selectedRow) {
      window.open(`/api/purchase/print/${selectedRow.id}`, '_blank');
    }
  };

  // Filters application
  const filteredRecords = history.filter(rec => {
    const matchesMonth = monthFilter ? rec.invoice_date.startsWith(monthFilter) : true;
    const matchesLocation = locationFilter ? rec.unit_id.toString() === locationFilter.toString() : true;
    const matchesVendor = vendorFilter ? rec.vendor_id.toString() === vendorFilter.toString() : true;
    
    const sQuery = searchQuery.toLowerCase().trim();
    const matchesSearch = sQuery ? (
      rec.invoice_no.toLowerCase().includes(sQuery) ||
      rec.po_number.toLowerCase().includes(sQuery) ||
      rec.vendor_name.toLowerCase().includes(sQuery) ||
      rec.product_name.toLowerCase().includes(sQuery)
    ) : true;

    return matchesMonth && matchesLocation && matchesVendor && matchesSearch;
  });

  const grandTotalCost = filteredRecords.reduce((sum, item) => {
    return sum + (item.is_cancelled ? 0 : item.grand_total);
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
          <h1>Purchase Invoice Ledger</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            Record supplier raw material inputs, packaging boxes, master label invoices, and audit ledger balances
          </p>
        </div>
        <div className="grand-total" style={{ background: 'var(--att-accent)', color: 'white', padding: '10px 24px', borderRadius: '8px', fontWeight: '800', fontSize: '14px' }}>
          TOTAL AMOUNT: ₹{grandTotalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </div>
      </div>

      {/* FILTERS BAR */}
      <div className="attendance-filters-bar">
        <div className="attendance-filter-group" style={{ minWidth: '130px', flex: '0 0 130px' }}>
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

        <div className="attendance-filter-group" style={{ minWidth: '150px', flex: '0 0 150px' }}>
          <label htmlFor="monthFilter">Period (Month)</label>
          <input 
            id="monthFilter" 
            type="month" 
            className="attendance-input" 
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
          />
        </div>

        <div className="attendance-filter-group" style={{ minWidth: '180px', flex: '0 0 180px' }}>
          <label htmlFor="locationFilter">Location Unit</label>
          <select 
            id="locationFilter" 
            className="attendance-select" 
            value={locationFilter} 
            onChange={(e) => setLocationFilter(e.target.value)}
          >
            <option value="">All Locations</option>
            {locations.map(l => (
              <option key={l.id} value={l.id}>{l.label}</option>
            ))}
          </select>
        </div>

        <div className="attendance-filter-group" style={{ minWidth: '180px', flex: '0 0 180px' }}>
          <label htmlFor="vendorFilter">Vendor Entity</label>
          <select 
            id="vendorFilter" 
            className="attendance-select" 
            value={vendorFilter} 
            onChange={(e) => setVendorFilter(e.target.value)}
          >
            <option value="">All Vendors</option>
            {vendors.map(v => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </select>
        </div>

        <div className="attendance-filter-group" style={{ minWidth: '200px', flex: '1' }}>
          <label htmlFor="searchBox">Search Bar</label>
          <div style={{ position: 'relative' }}>
            <input 
              id="searchBox" 
              type="text" 
              className="attendance-input" 
              placeholder="Search Invoice, PO, Vendor, Product..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '32px' }}
            />
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--att-muted)' }} />
          </div>
        </div>

        <button className="attendance-btn attendance-btn-secondary" onClick={() => { setSearchQuery(''); setMonthFilter(''); setLocationFilter(''); setVendorFilter(''); }} style={{ height: '38px' }}>
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
                <Printer size={14} /> Print Invoice
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
            <Plus size={16} /> NEW INVOICE
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
                <th style={{ width: '110px' }}>Date</th>
                <th style={{ width: '130px' }}>Invoice No</th>
                <th>Location</th>
                <th style={{ width: '120px' }}>PO Number</th>
                <th style={{ textalign: 'left' }}>Vendor Name</th>
                <th style={{ textalign: 'left' }}>Product Description</th>
                <th style={{ width: '100px' }}>HSN Code</th>
                <th style={{ width: '100px', textAlign: 'right' }}>Qty</th>
                <th style={{ width: '110px', textAlign: 'right' }}>Rate</th>
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
                  <td>{row.invoice_date}</td>
                  <td style={{ fontWeight: '800', color: 'var(--att-accent)' }}>{row.invoice_no}</td>
                  <td>{row.unit_name}</td>
                  <td style={{ color: 'var(--att-muted)' }}>{row.po_number || 'N/A'}</td>
                  <td style={{ textalign: 'left' }}>{row.vendor_name}</td>
                  <td style={{ textalign: 'left' }}>{row.product_name}</td>
                  <td>{row.hsn_code}</td>
                  <td style={{ textAlign: 'right' }}>{row.qty.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right' }}>₹{row.base_price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right', fontWeight: '800', color: 'var(--att-success)' }}>
                    ₹{row.grand_total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
                  <td colSpan="12" className="attendance-empty">
                    No purchase records registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NEW/EDIT MODAL */}
      {isModalOpen && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content" style={{ maxWidth: '950px' }}>
            <div className="attendance-modal-header">
              <h2>{editId ? 'Edit Purchase Entry' : 'New Purchase Entry'}</h2>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="attendance-modal-body">
                <div className="attendance-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
                  
                  <div className="attendance-form-group">
                    <label htmlFor="modalInvoiceDate">Invoice Date</label>
                    <input 
                      id="modalInvoiceDate"
                      className="attendance-input" 
                      type="date" 
                      value={formData.invoice_date} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalInvoiceNo">Invoice Number</label>
                    <input 
                      id="modalInvoiceNo"
                      className="attendance-input" 
                      placeholder="PUR-2026-001" 
                      style={{ textTransform: 'uppercase' }}
                      value={formData.invoice_no} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  {/* Location Unit dropdown */}
                  <div className="attendance-form-group" style={{ position: 'relative' }}>
                    <label htmlFor="modalLocationSearch">Location Unit</label>
                    <input 
                      id="modalLocationSearch"
                      className="attendance-input" 
                      placeholder="Select unit..."
                      value={locSearchVal}
                      onChange={(e) => {
                        setLocSearchVal(e.target.value);
                        setShowLocDropdown(true);
                      }}
                      onFocus={() => setShowLocDropdown(true)}
                    />
                    {showLocDropdown && (
                      <div className="attendance-dropdown-menu" style={{ display: 'block', top: '100%', left: 0, width: '100%', maxHeight: '180px', overflowY: 'auto', zIndex: 10 }}>
                        {locations.filter(l => l.label.toLowerCase().includes(locSearchVal.toLowerCase())).map(l => (
                          <button 
                            key={l.id}
                            type="button" 
                            className="attendance-dropdown-item" 
                            onClick={() => {
                              setFormData(prev => ({ ...prev, unit_id: l.id, unit_name: l.label }));
                              setLocSearchVal(l.label);
                              setShowLocDropdown(false);
                            }}
                          >
                            {l.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Vendor Dropdown */}
                  <div className="attendance-form-group" style={{ position: 'relative' }}>
                    <label htmlFor="modalVendorSearch">Vendor Entity</label>
                    <input 
                      id="modalVendorSearch"
                      className="attendance-input" 
                      placeholder="Search vendor..."
                      value={vendorSearchVal}
                      onChange={(e) => {
                        setVendorSearchVal(e.target.value);
                        setShowVendorDropdown(true);
                      }}
                      onFocus={() => setShowVendorDropdown(true)}
                    />
                    {showVendorDropdown && (
                      <div className="attendance-dropdown-menu" style={{ display: 'block', top: '100%', left: 0, width: '100%', maxHeight: '180px', overflowY: 'auto', zIndex: 10 }}>
                        {vendors.filter(v => v.label.toLowerCase().includes(vendorSearchVal.toLowerCase())).map(v => (
                          <button 
                            key={v.id}
                            type="button" 
                            className="attendance-dropdown-item" 
                            onClick={() => {
                              setFormData(prev => ({ ...prev, vendor_id: v.id, vendor_name: v.label }));
                              setVendorSearchVal(v.label);
                              setShowVendorDropdown(false);
                            }}
                          >
                            {v.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalAccountingLedgerId">Accounting Ledger</label>
                    <select 
                      id="modalAccountingLedgerId" 
                      className="attendance-select" 
                      value={formData.accounting_ledger_id} 
                      onChange={handleLedgerChange}
                    >
                      <option value="">Auto - Stock Asset / Sticker Expense</option>
                      {postingLedgers.map(ledger => (
                        <option key={ledger.id} value={ledger.id}>{ledger.name}</option>
                      ))}
                      <option value="__add_new_ledger__">+ Add New Ledger</option>
                    </select>
                  </div>

                  {/* PO number Dropdown */}
                  <div className="attendance-form-group" style={{ position: 'relative' }}>
                    <label htmlFor="modalPoSearch">PO Number</label>
                    <input 
                      id="modalPoSearch"
                      className="attendance-input" 
                      placeholder="PO reference..."
                      value={poSearchVal}
                      onChange={(e) => {
                        setPoSearchVal(e.target.value);
                        setFormData(prev => ({ ...prev, po_number: e.target.value }));
                        setShowPoDropdown(true);
                      }}
                      onFocus={() => setShowPoDropdown(true)}
                    />
                    {showPoDropdown && (
                      <div className="attendance-dropdown-menu" style={{ display: 'block', top: '100%', left: 0, width: '100%', maxHeight: '180px', overflowY: 'auto', zIndex: 10 }}>
                        <button type="button" className="attendance-dropdown-item" onClick={() => { setFormData(prev => ({ ...prev, po_number: 'N/A' })); setPoSearchVal('N/A'); setShowPoDropdown(false); }}>N/A</button>
                        {poList.filter(po => po.toLowerCase().includes(poSearchVal.toLowerCase())).map(po => (
                          <button 
                            key={po}
                            type="button" 
                            className="attendance-dropdown-item" 
                            onClick={() => {
                              setFormData(prev => ({ ...prev, po_number: po }));
                              setPoSearchVal(po);
                              setShowPoDropdown(false);
                            }}
                          >
                            {po}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* HSN Code dropdown */}
                  <div className="attendance-form-group" style={{ position: 'relative' }}>
                    <label htmlFor="modalHsnSearch">HSN System Code</label>
                    <input 
                      id="modalHsnSearch"
                      className="attendance-input" 
                      placeholder="Select HSN..."
                      value={hsnSearchVal}
                      onChange={(e) => {
                        setHsnSearchVal(e.target.value);
                        setFormData(prev => ({ ...prev, hsn_code: e.target.value }));
                        setShowHsnDropdown(true);
                      }}
                      onFocus={() => setShowHsnDropdown(true)}
                    />
                    {showHsnDropdown && (
                      <div className="attendance-dropdown-menu" style={{ display: 'block', top: '100%', left: 0, width: '100%', maxHeight: '180px', overflowY: 'auto', zIndex: 10 }}>
                        {hsnList.filter(h => h.hsn.includes(hsnSearchVal)).map(h => (
                          <button 
                            key={h.hsn}
                            type="button" 
                            className="attendance-dropdown-item" 
                            onClick={() => {
                              setFormData(prev => {
                                const q = parseFloat(prev.qty) || 0;
                                const r = parseFloat(prev.base_price) || 0;
                                const base = q * r;
                                const tax = (base * parseFloat(h.gst)) / 100;
                                return {
                                  ...prev,
                                  hsn_code: h.hsn,
                                  gst_percent: h.gst,
                                  tax_amount: tax.toFixed(2),
                                  grand_total: (base + tax).toFixed(2)
                                };
                              });
                              setHsnSearchVal(h.hsn);
                              setShowHsnDropdown(false);
                            }}
                          >
                            <b>{h.hsn}</b> - ({h.gst}%)
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalQty">Quantity</label>
                    <input 
                      id="modalQty"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.qty} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalBasePrice">Base Price</label>
                    <input 
                      id="modalBasePrice"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.base_price} 
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData(prev => {
                          const q = parseFloat(prev.qty) || 0;
                          const r = parseFloat(val) || 0;
                          const base = q * r;
                          const taxVal = (base * parseFloat(prev.gst_percent)) / 100;
                          return {
                            ...prev,
                            base_price: val,
                            tax_amount: taxVal.toFixed(2),
                            grand_total: (base + taxVal).toFixed(2)
                          };
                        });
                      }} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalGstPercent">GST Tax Tier (%)</label>
                    <select 
                      id="modalGstPercent" 
                      className="attendance-select" 
                      value={formData.gst_percent} 
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData(prev => {
                          const q = parseFloat(prev.qty) || 0;
                          const r = parseFloat(prev.base_price) || 0;
                          const base = q * r;
                          const taxVal = (base * parseFloat(val)) / 100;
                          return {
                            ...prev,
                            gst_percent: val,
                            tax_amount: taxVal.toFixed(2),
                            grand_total: (base + taxVal).toFixed(2)
                          };
                        });
                      }}
                    >
                      <option value="0">0%</option>
                      <option value="5">5%</option>
                      <option value="12">12%</option>
                      <option value="18">18%</option>
                      <option value="28">28%</option>
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalTaxAmount">Tax Value</label>
                    <input 
                      id="modalTaxAmount"
                      className="attendance-input" 
                      style={{ background: 'var(--att-table-row-hover)' }}
                      value={formData.tax_amount} 
                      readOnly 
                    />
                  </div>

                  <div className="attendance-form-group" style={{ gridColumn: 'span 2' }}>
                    <label htmlFor="modalProductName">Product Description</label>
                    <input 
                      id="modalProductName"
                      className="attendance-input" 
                      placeholder="FULL ITEM Nomenclature..." 
                      style={{ textTransform: 'uppercase' }}
                      value={formData.product_name} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                </div>

                <div style={{ marginTop: '20px', background: 'rgba(16, 185, 129, 0.12)', padding: '12px 18px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <span style={{ fontWeight: '700', color: 'var(--att-success)', fontSize: '13px' }}>Grand Total:</span>
                  <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--att-success)' }}>
                    ₹{parseFloat(formData.grand_total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              <div className="attendance-modal-footer">
                <button type="button" className="attendance-btn attendance-btn-secondary" onClick={closeForm}>
                  Cancel
                </button>
                <button type="submit" className="attendance-btn attendance-btn-primary">
                  Save Invoice
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
              <h2>Master History Logs</h2>
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
