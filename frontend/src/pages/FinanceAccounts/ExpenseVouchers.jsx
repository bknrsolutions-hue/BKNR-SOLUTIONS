import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, MoreVertical, Ban, X, Receipt, AlertCircle 
} from 'lucide-react';
import '../Attendance/Attendance.css';

export default function ExpenseVouchers({ theme }) {
  const [history, setHistory] = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [selectedRow, setSelectedRow] = useState(null);
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Form State
  const [formData, setFormData] = useState({
    voucher_no: '',
    voucher_date: new Date().toISOString().split('T')[0],
    expense_ledger_id: '',
    department: 'Admin',
    vendor_ledger_id: '',
    amount: 0.00,
    gst_percentage: 0.00,
    gst_amount: 0.00,
    total_amount: 0.00,
    approved_by: '',
    payment_mode: 'Cash',
    remarks: ''
  });

  // Notification State
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async (successMsg = null) => {
    try {
      // 1. Fetch ledgers list
      const ledgersRes = await fetch('/finance_accounts/ledgers');
      const ledgersData = await ledgersRes.json();
      if (ledgersData.success) {
        setLedgers(ledgersData.data || []);
      }

      // 2. Fetch HTML table for history records
      const htmlRes = await fetch('/finance_accounts/expense_voucher/entry');
      const htmlText = await htmlRes.text();
      const doc = new DOMParser().parseFromString(htmlText, 'text/html');
      const rows = doc.querySelectorAll('#tableBody tr.data-row');
      
      const parsedHistory = Array.from(rows).map(row => {
        const cells = row.querySelectorAll('td');
        const baseAmt = parseFloat(cells[6]?.textContent.replace(/[₹,\s]/g, '') || 0);
        
        const rawGst = cells[7]?.textContent || '';
        const gstAmt = parseFloat(rawGst.split(' ')[0].replace(/[₹,\s]/g, '') || 0);
        const gstPctMatch = rawGst.match(/\((.*?)\%\)/);
        const gstPct = gstPctMatch ? parseFloat(gstPctMatch[1]) || 0 : 0;

        return {
          id: row.getAttribute('data-id'),
          voucher_no: cells[1]?.textContent.trim() || '',
          voucher_date: cells[2]?.textContent.trim() || '',
          expense_type: cells[3]?.textContent.trim() || '',
          department: cells[4]?.textContent.trim() || '',
          vendor_name: cells[5]?.textContent.trim() || '',
          amount: baseAmt,
          gst_amount: gstAmt,
          gst_percentage: gstPct,
          total_amount: parseFloat(cells[8]?.textContent.replace(/[₹,\s]/g, '') || 0),
          payment_mode: cells[9]?.textContent.trim() || '',
          status: cells[10]?.textContent.trim() || '',
        };
      });

      setHistory(parsedHistory);
      if (successMsg) showNotification(successMsg, 'success');
    } catch (e) {
      showNotification('❌ Failed to fetch expense voucher list!', 'danger');
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
    const { id, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [id]: value };
      if (id === 'amount' || id === 'gst_percentage') {
        const base = parseFloat(updated.amount) || 0;
        const pct = parseFloat(updated.gst_percentage) || 0;
        const gst = (base * pct) / 100;
        updated.gst_amount = gst.toFixed(2);
        updated.total_amount = (base + gst).toFixed(2);
      }
      return updated;
    });
  };

  const openForm = () => {
    const expenseLedgers = ledgers.filter(l => l.group_type === 'EXPENSE');
    setFormData({
      voucher_no: '',
      voucher_date: new Date().toISOString().split('T')[0],
      expense_ledger_id: expenseLedgers.length > 0 ? expenseLedgers[0].id : '',
      department: 'Admin',
      vendor_ledger_id: '',
      amount: 0.00,
      gst_percentage: 0.00,
      gst_amount: 0.00,
      total_amount: 0.00,
      approved_by: '',
      payment_mode: 'Cash',
      remarks: ''
    });
    setIsModalOpen(true);
    setMenuOpen(false);
  };

  const closeForm = () => {
    setIsModalOpen(false);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    if (!formData.expense_ledger_id) {
      alert('Select an expense ledger account!');
      return;
    }

    if (parseFloat(formData.total_amount) <= 0) {
      alert('Total amount must be greater than zero!');
      return;
    }

    const confirmPost = window.confirm(`Post Expense Voucher?\nAre you sure you want to log this expense payment?`);
    if (!confirmPost) return;

    try {
      const payload = {
        voucher_no: formData.voucher_no,
        voucher_date: formData.voucher_date,
        expense_ledger_id: parseInt(formData.expense_ledger_id),
        department: formData.department,
        vendor_ledger_id: parseInt(formData.vendor_ledger_id) || null,
        amount: parseFloat(formData.amount) || 0.0,
        gst_percentage: parseFloat(formData.gst_percentage) || 0.0,
        gst_amount: parseFloat(formData.gst_amount) || 0.0,
        total_amount: parseFloat(formData.total_amount) || 0.0,
        approved_by: formData.approved_by,
        payment_mode: formData.payment_mode,
        remarks: formData.remarks || null
      };

      const res = await fetch('/finance_accounts/expense_voucher/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        closeForm();
        loadData(data.message || '✅ Expense Voucher saved successfully!');
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to save expense voucher!', 'danger');
      }
    } catch (err) {
      showNotification('❌ Network error saving expense voucher!', 'danger');
    }
  };

  const cancelSelected = async () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    const confirmDelete = window.confirm(`Cancel Expense Voucher?\nAre you sure you want to cancel this expense voucher trace?`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/finance_accounts/expense_voucher/delete/${selectedRow.id}`, { method: 'POST' });
      if (res.ok) {
        showNotification('🗑️ Expense Voucher cancelled successfully!', 'success');
        loadData();
        setSelectedRow(null);
      } else {
        showNotification('❌ Failed to cancel expense voucher!', 'danger');
      }
    } catch (e) {
      showNotification('❌ Network error cancelling expense voucher!', 'danger');
    }
  };

  const filteredRecords = history.filter(rec => {
    const query = searchQuery.toLowerCase().trim();
    return (
      (rec.voucher_no || '').toLowerCase().includes(query) ||
      (rec.expense_type || '').toLowerCase().includes(query) ||
      (rec.vendor_name || '').toLowerCase().includes(query)
    );
  });

  const expenseLedgers = ledgers.filter(l => l.group_type === 'EXPENSE');
  const vendorLedgers = ledgers.filter(l => l.group_type === 'LIABILITY');

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
          <h1>Expense Vouchers Ledger</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            Log cash and bank administrative expenses, facility repairs, and QA testing expenditures
          </p>
        </div>
        <div className="attendance-page-header-actions">
          <button className="attendance-btn attendance-btn-primary" onClick={openForm}>
            <Plus size={16} /> NEW VOUCHER
          </button>
        </div>
      </div>

      {/* SEARCH / FILTERS */}
      <div className="attendance-filters-bar" style={{ maxWidth: '300px' }}>
        <div className="attendance-filter-group">
          <label htmlFor="search-voucher">Search Voucher / Expense</label>
          <input 
            id="search-voucher"
            className="attendance-input" 
            type="text" 
            placeholder="Search..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
          />
        </div>
      </div>

      {/* ACTION BAR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: '800', margin: 0, textTransform: 'uppercase', color: 'var(--att-heading)' }}>
          {filteredRecords.length} Entries Found
        </h3>
        
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
      </div>

      {/* TABLE */}
      <div className="attendance-table-container">
        <div className="attendance-table-wrapper">
          <table className="attendance-table">
            <thead>
              <tr>
                <th style={{ width: '60px', textAlign: 'center' }}>Sl</th>
                <th style={{ width: '130px' }}>Voucher No</th>
                <th style={{ width: '120px' }}>Voucher Date</th>
                <th style={{ textalign: 'left' }}>Expense Type</th>
                <th style={{ width: '120px' }}>Department</th>
                <th style={{ textalign: 'left' }}>Vendor Name</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Base Value (₹)</th>
                <th style={{ width: '150px', textAlign: 'right' }}>GST (₹)</th>
                <th style={{ width: '150px', textAlign: 'right' }}>Total Cost (₹)</th>
                <th style={{ width: '140px' }}>Payment Mode</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((row, idx) => (
                <tr 
                  key={row.id} 
                  className={selectedRow?.id === row.id ? 'selected' : ''}
                  onClick={() => setSelectedRow(row)}
                >
                  <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                  <td style={{ fontWeight: '800', color: 'var(--att-accent)' }}>{row.voucher_no}</td>
                  <td>{row.voucher_date}</td>
                  <td style={{ textalign: 'left', fontWeight: '700' }}>{row.expense_type}</td>
                  <td>{row.department}</td>
                  <td style={{ textalign: 'left' }}>{row.vendor_name || '-'}</td>
                  <td style={{ textAlign: 'right' }}>
                    ₹{parseFloat(row.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    ₹{parseFloat(row.gst_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} ({row.gst_percentage}%)
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: '800' }}>
                    ₹{parseFloat(row.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td>{row.payment_mode}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="attendance-badge attendance-badge-present">
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!filteredRecords.length && (
                <tr>
                  <td colSpan="11" className="attendance-empty">
                    No expense vouchers registered yet.
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
          <div className="attendance-modal-content" style={{ maxWidth: '800px' }}>
            <div className="attendance-modal-header">
              <h2>Create Expense Voucher</h2>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="attendance-modal-body">
                <div className="attendance-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  
                  <div className="attendance-form-group">
                    <label htmlFor="voucher_no">Voucher No</label>
                    <input 
                      id="voucher_no"
                      className="attendance-input" 
                      value={formData.voucher_no} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="voucher_date">Voucher Date</label>
                    <input 
                      id="voucher_date"
                      className="attendance-input" 
                      type="date" 
                      value={formData.voucher_date} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="expense_ledger_id">Expense Ledger</label>
                    <select 
                      id="expense_ledger_id"
                      className="attendance-select" 
                      value={formData.expense_ledger_id} 
                      onChange={handleInputChange} 
                      required
                    >
                      <option value="">-- Select Expense Account --</option>
                      {expenseLedgers.map(l => (
                        <option key={l.id} value={l.id}>{l.ledger_name} ({l.group_name})</option>
                      ))}
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="department">Department</label>
                    <select 
                      id="department"
                      className="attendance-select" 
                      value={formData.department} 
                      onChange={handleInputChange} 
                      required
                    >
                      <option value="Admin">Admin</option>
                      <option value="Production">Production</option>
                      <option value="Processing">Processing</option>
                      <option value="Packing">Packing</option>
                      <option value="QA">QA</option>
                      <option value="Cold Storage">Cold Storage</option>
                      <option value="Export">Export</option>
                      <option value="Maintenance">Maintenance</option>
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="vendor_ledger_id">Vendor Ledger</label>
                    <select 
                      id="vendor_ledger_id"
                      className="attendance-select" 
                      value={formData.vendor_ledger_id} 
                      onChange={handleInputChange}
                    >
                      <option value="">-- Optional Vendor Account --</option>
                      {vendorLedgers.map(l => (
                        <option key={l.id} value={l.id}>{l.ledger_name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="amount">Base Amount (Excl. GST)</label>
                    <input 
                      id="amount"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.amount} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="gst_percentage">GST %</label>
                    <input 
                      id="gst_percentage"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.gst_percentage} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="gst_amount">GST Amount</label>
                    <input 
                      id="gst_amount"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.gst_amount} 
                      readOnly 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="total_amount">Total Amount (Incl. GST)</label>
                    <input 
                      id="total_amount"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.total_amount} 
                      readOnly 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="approved_by">Approved By</label>
                    <input 
                      id="approved_by"
                      className="attendance-input" 
                      value={formData.approved_by} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="payment_mode">Payment Mode</label>
                    <select 
                      id="payment_mode"
                      className="attendance-select" 
                      value={formData.payment_mode} 
                      onChange={handleInputChange} 
                      required
                    >
                      <option value="Cash">Cash</option>
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="Cheque">Cheque</option>
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="remarks">Remarks</label>
                    <input 
                      id="remarks"
                      className="attendance-input" 
                      value={formData.remarks} 
                      onChange={handleInputChange} 
                    />
                  </div>

                </div>
              </div>
              <div className="attendance-modal-footer">
                <button type="button" className="attendance-btn attendance-btn-secondary" onClick={closeForm}>
                  Cancel
                </button>
                <button type="submit" className="attendance-btn attendance-btn-primary">
                  Save Voucher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
