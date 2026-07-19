import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, MoreVertical, Ban, X, FileSpreadsheet, Clock, Check
} from 'lucide-react';
import '../Attendance/Attendance.css';

export default function QaTestingCharges({ theme }) {
  const [history, setHistory] = useState([]);
  const [products, setProducts] = useState([]);
  const [productionUnits, setProductionUnits] = useState([]);
  const [labs, setLabs] = useState([]);
  const [postingLedgers, setPostingLedgers] = useState([]);
  const [selectedRow, setSelectedRow] = useState(null);
  
  // Filter States
  const [selectedFy, setSelectedFy] = useState(new Date().getMonth() >= 3 ? new Date().getFullYear().toString() : (new Date().getFullYear() - 1).toString());
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Checkbox multi-select dropdowns states
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [customProduct, setCustomProduct] = useState('');
  const [showCustomProductInput, setShowCustomProductInput] = useState(false);

  const [showParamDropdown, setShowParamDropdown] = useState(false);
  const [selectedParams, setSelectedParams] = useState([]);
  const [customParam, setCustomParam] = useState('');
  const [showCustomParamInput, setShowCustomParamInput] = useState(false);

  // Lab facility search/lookup
  const [showLabDropdown, setShowLabDropdown] = useState(false);
  const [labSearchVal, setLabSearchVal] = useState('Inhouse');
  
  // Audit Logs State
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    product: '',
    production_at_id: '',
    parameters: '',
    batch_no: '',
    lab_id: '0',
    lab_name: 'Inhouse',
    accounting_ledger_id: '',
    report_ref: '',
    base_cost: 0,
    gst_per: 18,
    total: 0
  });

  // Notification State
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async (successMsg = null) => {
    try {
      const url = `/api/qa/entry?fy=${selectedFy}`;
      const res = await fetch(url);
      const htmlText = await res.text();
      const doc = new DOMParser().parseFromString(htmlText, 'text/html');

      // Parse products list
      const productOpts = doc.querySelectorAll('#productMenu .checkbox-option');
      const parsedProds = Array.from(productOpts).map(el => {
        const input = el.querySelector('input');
        return input ? input.value : '';
      }).filter(v => v !== '' && v !== '__add_new_product__');
      setProducts(parsedProds);

      // Parse production units list
      const unitOpts = doc.querySelectorAll('#modalProductionAtId option');
      const parsedUnits = Array.from(unitOpts)
        .map(opt => ({
          id: opt.value,
          name: opt.textContent.trim()
        }))
        .filter(u => u.id !== '');
      setProductionUnits(parsedUnits);

      // Parse labs list
      const labOpts = doc.querySelectorAll('#labLookupMenu .lookup-option');
      const parsedLabs = Array.from(labOpts).map(o => ({
        id: o.getAttribute('data-value'),
        name: o.textContent.trim()
      }));
      setLabs(parsedLabs);

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
          date: cells[1]?.textContent.trim() || '',
          batch_no: cells[2]?.textContent.trim() || '',
          product: cells[3]?.textContent.trim() || '',
          production_at: cells[4]?.textContent.trim() || '',
          parameters: cells[5]?.textContent.trim() || '',
          lab_name: cells[6]?.textContent.trim() || '',
          report_ref: cells[7]?.textContent.trim() || '',
          base_cost: parseFloat(cells[8]?.textContent.replace(/[₹,\s]/g, '') || 0),
          total: parseFloat(row.getAttribute('data-total') || cells[9]?.textContent.replace(/[₹,\s]/g, '') || 0),
          is_cancelled: row.getAttribute('data-cancelled') === 'true',
          status: cells[10]?.textContent.trim() || '',
          accounts_status: cells[11]?.textContent.trim() || ''
        };
      });

      setHistory(parsedHistory);
      if (successMsg) showNotification(successMsg, 'success');
    } catch (e) {
      showNotification('❌ Failed to fetch QA lab charges ledger!', 'danger');
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
      if (id === 'base_cost' || id === 'gst_per') {
        const base = parseFloat(updated.base_cost) || 0;
        const gst = parseFloat(updated.gst_per) || 0;
        updated.total = (base + (base * gst / 100)).toFixed(2);
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

  const toggleProductSelect = (prod) => {
    setSelectedProducts(prev => {
      const isSelected = prev.includes(prod);
      const next = isSelected ? prev.filter(p => p !== prod) : [...prev, prod];
      updateProductsDisplay(next, showCustomProductInput ? customProduct : '');
      return next;
    });
  };

  const handleCustomProductToggle = (checked) => {
    setShowCustomProductInput(checked);
    if (!checked) {
      setCustomProduct('');
      updateProductsDisplay(selectedProducts, '');
    } else {
      updateProductsDisplay(selectedProducts, customProduct);
    }
  };

  const handleCustomProductChange = (val) => {
    setCustomProduct(val);
    updateProductsDisplay(selectedProducts, val);
  };

  const updateProductsDisplay = (selected, custom) => {
    const list = [...selected];
    if (custom) list.push(custom.toUpperCase());
    setFormData(prev => ({ ...prev, product: list.join(', ') }));
  };

  const toggleParamSelect = (param) => {
    setSelectedParams(prev => {
      const isSelected = prev.includes(param);
      const next = isSelected ? prev.filter(p => p !== param) : [...prev, param];
      updateParamsDisplay(next, showCustomParamInput ? customParam : '');
      return next;
    });
  };

  const handleCustomParamToggle = (checked) => {
    setShowCustomParamInput(checked);
    if (!checked) {
      setCustomParam('');
      updateParamsDisplay(selectedParams, '');
    } else {
      updateParamsDisplay(selectedParams, customParam);
    }
  };

  const handleCustomParamChange = (val) => {
    setCustomParam(val);
    updateParamsDisplay(selectedParams, val);
  };

  const updateParamsDisplay = (selected, custom) => {
    const list = [...selected];
    if (custom) list.push(custom);
    setFormData(prev => ({ ...prev, parameters: list.join(', ') }));
  };

  const openForm = () => {
    setSelectedProducts([]);
    setCustomProduct('');
    setShowCustomProductInput(false);
    setSelectedParams([]);
    setCustomParam('');
    setShowCustomParamInput(false);
    setLabSearchVal('Inhouse');

    setFormData({
      date: new Date().toISOString().split('T')[0],
      product: '',
      production_at_id: '',
      parameters: '',
      batch_no: '',
      lab_id: '0',
      lab_name: 'Inhouse',
      accounting_ledger_id: '',
      report_ref: '',
      base_cost: 0,
      gst_per: 18,
      total: 0
    });
    setIsModalOpen(true);
    setMenuOpen(false);
  };

  const closeForm = () => {
    setIsModalOpen(false);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    if (!formData.product) {
      alert('Select productnomenclature descriptions!');
      return;
    }
    if (!formData.production_at_id) {
      alert('Select production unit location!');
      return;
    }
    if (!formData.lab_id) {
      alert('Select external lab facility!');
      return;
    }

    const base = parseFloat(formData.base_cost) || 0;
    if (base <= 0) {
      alert('Base cost must be greater than zero!');
      return;
    }

    const confirmPost = window.confirm(`Post QA Testing Charges?\nAre you sure you want to log these charges?`);
    if (!confirmPost) return;

    try {
      const payload = {
        date: formData.date,
        product: formData.product.toUpperCase(),
        production_at_id: parseInt(formData.production_at_id),
        parameters: formData.parameters,
        batch_no: formData.batch_no.toUpperCase().trim(),
        lab_id: parseInt(formData.lab_id),
        report_ref: formData.report_ref.toUpperCase().trim(),
        base_cost: base,
        gst_per: parseFloat(formData.gst_per) || 0,
        accounting_ledger_id: formData.accounting_ledger_id ? parseInt(formData.accounting_ledger_id) : null
      };

      const res = await fetch('/api/qa/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && (data.success || data.status === 'success')) {
        closeForm();
        loadData(data.message || '✅ QA Lab Charges entry posted successfully!');
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to save testing charges!', 'danger');
      }
    } catch (err) {
      showNotification('❌ Network error saving charges!', 'danger');
    }
  };

  const cancelSelected = async () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    
    if (selectedRow.is_cancelled) {
      alert('This entry is already marked as cancelled!');
      return;
    }

    const confirmDelete = window.confirm(`Cancel entry?\nAre you sure you want to mark this QA record node as cancelled?`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/qa/delete/${selectedRow.id}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification('🗑️ QA Testing Charges record cancelled!', 'success');
        loadData();
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to cancel entry!', 'danger');
      }
    } catch (e) {
      showNotification('❌ Network error cancelling record!', 'danger');
    }
  };

  const openAuditLogs = async () => {
    setAuditOpen(true);
    setLoadingAudit(true);
    try {
      const res = await fetch('/api/qa/audit_all');
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
    window.location.href = '/api/qa/export/excel';
  };

  // Filter application
  const filteredRecords = history.filter(rec => {
    const sQuery = searchQuery.toLowerCase().trim();
    if (!sQuery) return true;
    return (
      rec.batch_no.toLowerCase().includes(sQuery) ||
      rec.product.toLowerCase().includes(sQuery) ||
      rec.lab_name.toLowerCase().includes(sQuery) ||
      rec.production_at.toLowerCase().includes(sQuery)
    );
  });

  const grandTotalCost = filteredRecords.reduce((sum, item) => {
    return sum + (item.is_cancelled ? 0 : item.total);
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
          <h1>QA Lab Charges Ledger</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            Log external laboratory compliance charges, antibiotic residue testings, and microbiological invoice post logs
          </p>
        </div>
        <div className="grand-total" style={{ background: 'var(--att-accent)', color: 'white', padding: '10px 24px', borderRadius: '8px', fontWeight: '800', fontSize: '14px' }}>
          TOTAL TESTING: ₹{grandTotalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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

        <div className="attendance-filter-group" style={{ minWidth: '220px', flex: '1' }}>
          <label htmlFor="searchBox">Search Bar</label>
          <div style={{ position: 'relative' }}>
            <input 
              id="searchBox" 
              type="text" 
              className="attendance-input" 
              placeholder="Search Batch, Product, Lab, Unit..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '32px' }}
            />
            <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--att-muted)' }} />
          </div>
        </div>

        <button className="attendance-btn attendance-btn-secondary" onClick={() => { setSearchQuery(''); }} style={{ height: '38px' }}>
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
            <Plus size={16} /> NEW TESTING ENTRY
          </button>
        </div>
      </div>

      {/* COMPACT DATA TABLE */}
      <div className="attendance-table-container">
        <div className="attendance-table-wrapper">
          <table className="attendance-table">
            <thead>
              <tr>
                <th style={{ width: '50px', textAlign: 'center' }}>Sl</th>
                <th style={{ width: '110px' }}>Testing Date</th>
                <th style={{ width: '130px' }}>Batch / PO No</th>
                <th style={{ textalign: 'left' }}>Product Name</th>
                <th style={{ textalign: 'left' }}>Production At</th>
                <th style={{ textalign: 'left' }}>Parameters</th>
                <th style={{ textalign: 'left' }}>External Lab</th>
                <th style={{ width: '110px' }}>Report Ref</th>
                <th style={{ width: '110px', textAlign: 'right' }}>Base Cost</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Grand Total</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Status</th>
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
                  <td>{row.date}</td>
                  <td style={{ fontWeight: '800' }} title={row.batch_no}>{row.batch_no}</td>
                  <td style={{ textalign: 'left' }} title={row.product}>{row.product}</td>
                  <td style={{ textalign: 'left' }} title={row.production_at}>{row.production_at || '-'}</td>
                  <td style={{ textalign: 'left' }} title={row.parameters}>{row.parameters || '-'}</td>
                  <td style={{ textalign: 'left' }} title={row.lab_name}>{row.lab_name}</td>
                  <td title={row.report_ref}>{row.report_ref}</td>
                  <td style={{ textAlign: 'right' }}>₹{row.base_cost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right', fontWeight: '800', color: 'var(--att-success)' }}>
                    ₹{row.total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`attendance-badge ${row.is_cancelled ? 'attendance-badge-absent' : 'attendance-badge-present'}`}>
                      {row.is_cancelled ? 'CANCELLED' : 'ACTIVE'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`attendance-badge ${row.is_cancelled ? 'attendance-badge-absent' : 'attendance-badge-present'}`}>
                      {row.accounts_status}
                    </span>
                  </td>
                </tr>
              ))}
              {!filteredRecords.length && (
                <tr>
                  <td colSpan="12" className="attendance-empty">
                    No QA laboratory charges logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* FORM OVERLAY MODAL */}
      {isModalOpen && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content" style={{ maxWidth: '950px' }}>
            <div className="attendance-modal-header">
              <h2>New QA Testing Entry</h2>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="attendance-modal-body">
                <div className="attendance-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
                  
                  <div className="attendance-form-group">
                    <label htmlFor="modalTestDate">Testing Date</label>
                    <input 
                      id="modalTestDate"
                      className="attendance-input" 
                      type="date" 
                      value={formData.date} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  {/* Multi-select products checkboxes */}
                  <div className="attendance-form-group" style={{ position: 'relative' }}>
                    <label>Product Nomenclature</label>
                    <input 
                      className="attendance-input" 
                      style={{ cursor: 'pointer', background: 'var(--att-card)' }}
                      readOnly
                      placeholder="Select products..."
                      value={formData.product}
                      onClick={() => { setShowProductDropdown(!showProductDropdown); setShowParamDropdown(false); setShowLabDropdown(false); }}
                    />
                    {showProductDropdown && (
                      <div className="attendance-dropdown-menu" style={{ display: 'block', top: '100%', left: 0, width: '100%', maxHeight: '200px', overflowY: 'auto', zIndex: 10, padding: '8px' }}>
                        {products.map(p => (
                          <label key={p} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>
                            <input 
                              type="checkbox" 
                              checked={selectedProducts.includes(p)}
                              onChange={() => toggleProductSelect(p)}
                            />
                            {p}
                          </label>
                        ))}
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: '600', color: 'var(--att-accent)', borderTop: '1px dashed var(--att-border)', marginTop: '4px' }}>
                          <input 
                            type="checkbox" 
                            checked={showCustomProductInput}
                            onChange={(e) => handleCustomProductToggle(e.target.checked)}
                          />
                          + Add New Product
                        </label>
                      </div>
                    )}
                    {showCustomProductInput && (
                      <input 
                        className="attendance-input"
                        placeholder="Enter custom product..."
                        value={customProduct}
                        onChange={(e) => handleCustomProductChange(e.target.value)}
                        style={{ marginTop: '6px', textTransform: 'uppercase' }}
                      />
                    )}
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalProductionAtId">Production At</label>
                    <select 
                      id="modalProductionAtId" 
                      className="attendance-select" 
                      value={formData.production_at_id} 
                      onChange={(e) => setFormData(prev => ({ ...prev, production_at_id: e.target.value }))}
                      required
                    >
                      <option value="">-- SELECT PRODUCTION AT --</option>
                      {productionUnits.map(unit => (
                        <option key={unit.id} value={unit.id}>{unit.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Test parameters checkboxes */}
                  <div className="attendance-form-group" style={{ position: 'relative' }}>
                    <label>Test Parameters</label>
                    <input 
                      className="attendance-input" 
                      style={{ cursor: 'pointer', background: 'var(--att-card)' }}
                      readOnly
                      placeholder="Select parameters..."
                      value={formData.parameters}
                      onClick={() => { setShowParamDropdown(!showParamDropdown); setShowProductDropdown(false); setShowLabDropdown(false); }}
                    />
                    {showParamDropdown && (
                      <div className="attendance-dropdown-menu" style={{ display: 'block', top: '100%', left: 0, width: '100%', maxHeight: '200px', overflowY: 'auto', zIndex: 10, padding: '8px' }}>
                        {['Microbiology', 'Antibiotic Residue', 'Heavy Metals', 'Sensory Evaluation', 'Histamine', 'TVB-N', 'Salt / Moisture', 'Water Quality', 'Packing Material Migration'].map(param => (
                          <label key={param} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: '600' }}>
                            <input 
                              type="checkbox" 
                              checked={selectedParams.includes(param)}
                              onChange={() => toggleParamSelect(param)}
                            />
                            {param}
                          </label>
                        ))}
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: '600', color: 'var(--att-accent)', borderTop: '1px dashed var(--att-border)', marginTop: '4px' }}>
                          <input 
                            type="checkbox" 
                            checked={showCustomParamInput}
                            onChange={(e) => handleCustomParamToggle(e.target.checked)}
                          />
                          + Add New Parameter
                        </label>
                      </div>
                    )}
                    {showCustomParamInput && (
                      <input 
                        className="attendance-input"
                        placeholder="Enter custom parameter..."
                        value={customParam}
                        onChange={(e) => handleCustomParamChange(e.target.value)}
                        style={{ marginTop: '6px' }}
                      />
                    )}
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalBatchNo">Batch / PO Number</label>
                    <input 
                      id="modalBatchNo"
                      className="attendance-input" 
                      placeholder="B-2026-X9 / PO-001" 
                      style={{ textTransform: 'uppercase' }}
                      value={formData.batch_no} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  {/* External Lab search/lookup */}
                  <div className="attendance-form-group" style={{ position: 'relative' }}>
                    <label htmlFor="modalLabSearch">External Lab Facility</label>
                    <input 
                      id="modalLabSearch"
                      className="attendance-input" 
                      value={labSearchVal}
                      onChange={(e) => {
                        setLabSearchVal(e.target.value);
                        setShowLabDropdown(true);
                      }}
                      onFocus={() => setShowLabDropdown(true)}
                      required
                    />
                    {showLabDropdown && (
                      <div className="attendance-dropdown-menu" style={{ display: 'block', top: '100%', left: 0, width: '100%', maxHeight: '180px', overflowY: 'auto', zIndex: 10 }}>
                        {labs.filter(l => l.name.toLowerCase().includes(labSearchVal.toLowerCase())).map(l => (
                          <button 
                            key={l.id}
                            type="button" 
                            className="attendance-dropdown-item" 
                            onClick={() => {
                              setFormData(prev => ({ ...prev, lab_id: l.id, lab_name: l.name }));
                              setLabSearchVal(l.name);
                              setShowLabDropdown(false);
                            }}
                          >
                            {l.name}
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
                      <option value="">Auto - QA Testing Expense A/c</option>
                      {postingLedgers.map(ledger => (
                        <option key={ledger.id} value={ledger.id}>{ledger.name}</option>
                      ))}
                      <option value="__add_new_ledger__">+ Add New Ledger</option>
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalReportRef">Report Reference ID</label>
                    <input 
                      id="modalReportRef"
                      className="attendance-input" 
                      placeholder="REP-001" 
                      style={{ textTransform: 'uppercase' }}
                      value={formData.report_ref} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalBaseCost">Base Cost (₹)</label>
                    <input 
                      id="modalBaseCost"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.base_cost} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalGstPer">GST Tax Tier (%)</label>
                    <select 
                      id="modalGstPer" 
                      className="attendance-select" 
                      value={formData.gst_per} 
                      onChange={handleInputChange}
                    >
                      <option value="0">0%</option>
                      <option value="5">5%</option>
                      <option value="12">12%</option>
                      <option value="18">18%</option>
                    </select>
                  </div>

                </div>

                <div style={{ marginTop: '20px', background: 'rgba(16, 185, 129, 0.12)', padding: '12px 18px', borderRadius: '8px', display: 'flex', justifycontent: 'space-between', alignItems: 'center', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <span style={{ fontWeight: '700', color: 'var(--att-success)', fontSize: '13px' }}>Grand Total (Inclusive Amount):</span>
                  <span style={{ fontSize: '18px', fontWeight: '800', color: 'var(--att-success)' }}>
                    ₹{parseFloat(formData.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              <div className="attendance-modal-footer">
                <button type="button" className="attendance-btn attendance-btn-secondary" onClick={closeForm}>
                  Cancel
                </button>
                <button type="submit" className="attendance-btn attendance-btn-primary">
                  Post QA Charges
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
              <h2>QA Logs Metadata History</h2>
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
