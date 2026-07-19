import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, MoreVertical, Ban, X, FileSpreadsheet, Clock
} from 'lucide-react';
import '../Attendance/Attendance.css';

export default function OtherExpenses({ theme }) {
  const [history, setHistory] = useState([]);
  const [locations, setLocations] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [postingLedgers, setPostingLedgers] = useState([]);
  const [selectedRow, setSelectedRow] = useState(null);
  
  // Filter States
  const [selectedFy, setSelectedFy] = useState(new Date().getMonth() >= 3 ? new Date().getFullYear().toString() : (new Date().getFullYear() - 1).toString());
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Audit Logs State
  const [auditOpen, setAuditOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    production_at_id: '',
    expense_date: new Date().toISOString().split('T')[0],
    category: '',
    paid_to: '',
    voucher_no: '',
    amount: 0,
    gst_per: 18,
    remarks: '',
    grand_total: 0,
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
      const url = `/api/expenses/entry?fy=${selectedFy}`;
      const res = await fetch(url);
      const htmlText = await res.text();
      const doc = new DOMParser().parseFromString(htmlText, 'text/html');

      // Parse locations list
      const locOpts = doc.querySelectorAll('#modalUnitId option');
      const parsedLocs = Array.from(locOpts)
        .map(opt => ({
          id: opt.value,
          name: opt.textContent.trim()
        }))
        .filter(u => u.id !== '');
      setLocations(parsedLocs);

      // Parse vendors list
      const vendorOpts = doc.querySelectorAll('#modalPaidTo option');
      const parsedVendors = Array.from(vendorOpts)
        .map(opt => ({
          name: opt.value
        }))
        .filter(v => v.name !== '');
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

      // Parse history rows
      const rows = doc.querySelectorAll('#tableBody tr.data-row');
      const parsedHistory = Array.from(rows).map(row => {
        const cells = row.querySelectorAll('td');
        return {
          id: row.getAttribute('data-id'),
          location_name: cells[1]?.textContent.trim() || '',
          category: cells[2]?.textContent.trim() || '',
          amount: parseFloat(row.getAttribute('data-total') || cells[3]?.textContent.replace(/[₹,\s]/g, '') || 0),
          remarks: cells[4]?.textContent.trim() || '',
          is_cancelled: row.getAttribute('data-cancelled') === 'true',
          status: cells[5]?.textContent.trim() || ''
        };
      });

      setHistory(parsedHistory);
      if (successMsg) showNotification(successMsg, 'success');
    } catch (e) {
      showNotification('❌ Failed to fetch other expenses ledger!', 'danger');
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
      if (id === 'amount' || id === 'gst_per') {
        const amt = parseFloat(updated.amount) || 0;
        const gst = parseFloat(updated.gst_per) || 0;
        updated.grand_total = (amt + (amt * gst / 100)).toFixed(2);
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
    setFormData({
      production_at_id: locations.length > 0 ? locations[0].id : '',
      expense_date: new Date().toISOString().split('T')[0],
      category: '',
      paid_to: vendors.length > 0 ? vendors[0].name : '',
      voucher_no: '',
      amount: 0,
      gst_per: 18,
      remarks: '',
      grand_total: 0,
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

    if (!formData.production_at_id) {
      alert('Select company unit!');
      return;
    }
    if (!formData.paid_to) {
      alert('Select paid to vendor!');
      return;
    }

    const amt = parseFloat(formData.amount) || 0;
    if (amt <= 0) {
      alert('Base amount must be greater than zero!');
      return;
    }

    const confirmPost = window.confirm(`Post Expense Log?\nAre you sure you want to log these expenditures?`);
    if (!confirmPost) return;

    try {
      const payload = {
        production_at_id: parseInt(formData.production_at_id),
        expense_date: formData.expense_date,
        category: formData.category.toUpperCase().trim(),
        paid_to: formData.paid_to,
        voucher_no: formData.voucher_no.trim(),
        amount: amt,
        gst_per: parseFloat(formData.gst_per) || 0,
        remarks: formData.remarks.trim(),
        grand_total: parseFloat(formData.grand_total) || 0,
        accounting_ledger_id: formData.accounting_ledger_id ? parseInt(formData.accounting_ledger_id) : null
      };

      const res = await fetch('/api/expenses/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (res.ok && (data.success || data.status === 'success')) {
        closeForm();
        loadData(data.message || '✅ Expense log saved successfully!');
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to save expense ledger!', 'danger');
      }
    } catch (err) {
      showNotification('❌ Network error saving expense!', 'danger');
    }
  };

  const cancelSelected = async () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    
    if (selectedRow.is_cancelled) {
      alert('This entry is already marked as cancelled!');
      return;
    }

    const confirmDelete = window.confirm(`Cancel Entry?\nAre you sure you want to mark this expense record statement as cancelled?`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/expenses/delete/${selectedRow.id}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        showNotification('🗑️ Expense entry marked as cancelled!', 'success');
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
      const res = await fetch('/api/expenses/audit_all');
      if (res.ok) {
        const logs = await res.json();
        setAuditLogs(logs || []);
      }
    } catch (err) {
      showNotification('❌ Failed to fetch audit history logs!', 'danger');
    } finally {
      setLoadingAudit(false);
    }
  };

  const executeExcelExport = () => {
    window.location.href = '/api/expenses/export/excel';
  };

  // Filter application
  const filteredRecords = history.filter(rec => {
    const sQuery = searchQuery.toLowerCase().trim();
    if (!sQuery) return true;
    return (
      rec.location_name.toLowerCase().includes(sQuery) ||
      rec.category.toLowerCase().includes(sQuery) ||
      rec.remarks.toLowerCase().includes(sQuery)
    );
  });

  const grandTotalCost = filteredRecords.reduce((sum, item) => {
    return sum + (item.is_cancelled ? 0 : item.amount);
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
          <h1>Other Expenses Ledger</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            Log cash & bank daily expenses, general administrative bills, repairs, and minor consumables
          </p>
        </div>
        <div className="grand-total" style={{ background: 'var(--att-accent)', color: 'white', padding: '10px 24px', borderRadius: '8px', fontWeight: '800', fontSize: '14px' }}>
          TOTAL EXPENSE: ₹{grandTotalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
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
              placeholder="Search Category, Remarks, Location unit..."
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
            <Plus size={16} /> NEW EXPENSE ENTRY
          </button>
        </div>
      </div>

      {/* DATA TABLE */}
      <div className="attendance-table-container">
        <div className="attendance-table-wrapper">
          <table className="attendance-table">
            <thead>
              <tr>
                <th style={{ width: '60px', textAlign: 'center' }}>Sl</th>
                <th style={{ width: '180px' }}>Location Unit</th>
                <th style={{ width: '200px' }}>Expense Category</th>
                <th style={{ width: '150px', textAlign: 'right' }}>Total Amount (₹)</th>
                <th style={{ textalign: 'left' }}>Remarks & Meta Records Log</th>
                <th style={{ width: '120px', textAlign: 'center' }}>Accounts</th>
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
                  <td style={{ fontWeight: '700' }}>{row.location_name}</td>
                  <td>
                    <span className="attendance-badge" style={{ background: 'rgba(67, 56, 202, 0.12)', color: '#4338ca' }}>
                      {row.category}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: '800', color: 'var(--att-heading)' }}>
                    ₹{row.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textalign: 'left', color: 'var(--att-muted)' }}>{row.remarks}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`attendance-badge ${row.is_cancelled ? 'attendance-badge-absent' : 'attendance-badge-present'}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!filteredRecords.length && (
                <tr>
                  <td colSpan="6" className="attendance-empty">
                    No expense record entries found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NEW TRANSACTION MODAL */}
      {isModalOpen && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content" style={{ maxWidth: '850px' }}>
            <div className="attendance-modal-header">
              <h2>New Expense Entry</h2>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="attendance-modal-body">
                <div className="attendance-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
                  
                  <div className="attendance-form-group">
                    <label htmlFor="modalUnitId">Company Unit</label>
                    <select 
                      id="modalUnitId" 
                      className="attendance-select" 
                      value={formData.production_at_id} 
                      onChange={(e) => setFormData(prev => ({ ...prev, production_at_id: e.target.value }))}
                      required
                    >
                      <option value="">-- SELECT UNIT --</option>
                      {locations.map(loc => (
                        <option key={loc.id} value={loc.id}>{loc.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalExpenseDate">Expense Date</label>
                    <input 
                      id="modalExpenseDate"
                      className="attendance-input" 
                      type="date" 
                      value={formData.expense_date} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalPaidTo">Paid To</label>
                    <select 
                      id="modalPaidTo" 
                      className="attendance-select" 
                      value={formData.paid_to} 
                      onChange={(e) => setFormData(prev => ({ ...prev, paid_to: e.target.value }))}
                      required
                    >
                      <option value="">-- SELECT VENDOR --</option>
                      {vendors.map(v => (
                        <option key={v.name} value={v.name}>{v.name}</option>
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
                      <option value="">Auto - Based on Category</option>
                      {postingLedgers.map(ledger => (
                        <option key={ledger.id} value={ledger.id}>{ledger.name}</option>
                      ))}
                      <option value="__add_new_ledger__">+ Add New Ledger</option>
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalVoucherNo">Voucher No</label>
                    <input 
                      id="modalVoucherNo"
                      className="attendance-input" 
                      placeholder="VCH-001" 
                      value={formData.voucher_no} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalCategory">Expense Category</label>
                    <input 
                      id="modalCategory"
                      className="attendance-input" 
                      placeholder="e.g. Refreshments, Repairs..." 
                      style={{ textTransform: 'uppercase' }}
                      value={formData.category} 
                      onChange={handleInputChange} 
                      required
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalAmount">Base Amount (₹)</label>
                    <input 
                      id="modalAmount"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.amount} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="modalGstPer">GST %</label>
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

                  <div className="attendance-form-group" style={{ gridColumn: 'span 4' }}>
                    <label htmlFor="modalRemarks">Remarks / Notes</label>
                    <input 
                      id="modalRemarks"
                      className="attendance-input" 
                      placeholder="Brief details..." 
                      value={formData.remarks} 
                      onChange={handleInputChange} 
                    />
                  </div>

                </div>

                <div style={{ marginTop: '20px', background: 'rgba(16, 185, 129, 0.12)', padding: '12px 18px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <span style={{ fontWeight: '700', color: 'var(--att-success)', fontSize: '13px' }}>Grand Total Value (Inclusive):</span>
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
                  Post Expense Log
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
              <h2>Expense Record History Logs</h2>
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
