import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, MoreVertical, Ban, X, Landmark, AlertCircle 
} from 'lucide-react';
import '../Attendance/Attendance.css';

export default function BankTransactions({ theme }) {
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
    bank_ledger_id: '',
    transaction_date: new Date().toISOString().split('T')[0],
    voucher_type: 'RECEIPT',
    reference_no: '',
    linked_invoice_no: '',
    linked_vendor_ledger_id: '',
    debit: 0.00,
    credit: 0.00,
    closing_balance: 0.00
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
      const htmlRes = await fetch('/finance_accounts/bank_transaction/entry');
      const htmlText = await htmlRes.text();
      const doc = new DOMParser().parseFromString(htmlText, 'text/html');
      const rows = doc.querySelectorAll('#tableBody tr.data-row');
      
      const parsedHistory = Array.from(rows).map(row => {
        const cells = row.querySelectorAll('td');
        return {
          id: row.getAttribute('data-id'),
          bank_name: cells[1]?.textContent.trim() || '',
          transaction_date: cells[2]?.textContent.trim() || '',
          voucher_type: cells[3]?.textContent.trim() || '',
          reference_no: cells[4]?.textContent.trim() || '',
          linked_invoice_no: cells[5]?.textContent.trim() || '',
          linked_vendor: cells[6]?.textContent.trim() || '',
          debit: parseFloat(cells[7]?.textContent.replace(/[₹,\s]/g, '') || 0),
          credit: parseFloat(cells[8]?.textContent.replace(/[₹,\s]/g, '') || 0),
          closing_balance: parseFloat(cells[9]?.textContent.replace(/[₹,\s]/g, '') || 0),
        };
      });

      setHistory(parsedHistory);
      if (successMsg) showNotification(successMsg, 'success');
    } catch (e) {
      showNotification('❌ Failed to fetch bank transaction logs!', 'danger');
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
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const openForm = () => {
    const bankLedgers = ledgers.filter(l => 
      l.group_name === 'Bank Accounts' || 
      l.group_name === 'Cash-in-hand' || 
      l.ledger_name.toLowerCase().includes('cash')
    );
    setFormData({
      bank_ledger_id: bankLedgers.length > 0 ? bankLedgers[0].id : '',
      transaction_date: new Date().toISOString().split('T')[0],
      voucher_type: 'RECEIPT',
      reference_no: '',
      linked_invoice_no: '',
      linked_vendor_ledger_id: '',
      debit: 0.00,
      credit: 0.00,
      closing_balance: 0.00
    });
    setIsModalOpen(true);
    setMenuOpen(false);
  };

  const closeForm = () => {
    setIsModalOpen(false);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.bank_ledger_id) {
      alert('Select a bank/cash ledger account!');
      return;
    }

    const confirmPost = window.confirm(`Register Transaction?\nAre you sure you want to log this bank transaction?`);
    if (!confirmPost) return;

    try {
      const payload = {
        bank_ledger_id: parseInt(formData.bank_ledger_id),
        transaction_date: formData.transaction_date,
        voucher_type: formData.voucher_type,
        reference_no: formData.reference_no,
        linked_invoice_no: formData.linked_invoice_no || null,
        linked_vendor_ledger_id: parseInt(formData.linked_vendor_ledger_id) || null,
        debit: parseFloat(formData.debit) || 0.0,
        credit: parseFloat(formData.credit) || 0.0,
        closing_balance: parseFloat(formData.closing_balance) || 0.0
      };

      const res = await fetch('/finance_accounts/bank_transaction/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        closeForm();
        loadData(data.message || '✅ Bank transaction trace recorded!');
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to save transaction!', 'danger');
      }
    } catch (err) {
      showNotification('❌ Network error saving bank transaction!', 'danger');
    }
  };

  const cancelSelected = async () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    const confirmDelete = window.confirm(`Cancel Transaction?\nAre you sure you want to cancel this bank transaction trace?`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/finance_accounts/bank_transaction/delete/${selectedRow.id}`, { method: 'POST' });
      if (res.ok) {
        showNotification('🗑️ Transaction traces cancelled successfully!', 'success');
        loadData();
        setSelectedRow(null);
      } else {
        showNotification('❌ Failed to cancel transaction tracing!', 'danger');
      }
    } catch (e) {
      showNotification('❌ Network error cancelling transaction!', 'danger');
    }
  };

  const filteredRecords = history.filter(rec => {
    const query = searchQuery.toLowerCase().trim();
    return (
      (rec.bank_name || '').toLowerCase().includes(query) ||
      (rec.reference_no || '').toLowerCase().includes(query) ||
      (rec.linked_invoice_no || '').toLowerCase().includes(query)
    );
  });

  const bankLedgers = ledgers.filter(l => 
    l.group_name === 'Bank Accounts' || 
    l.group_name === 'Cash-in-hand' || 
    l.ledger_name.toLowerCase().includes('cash')
  );

  const vendorLedgers = ledgers.filter(l => 
    l.group_type === 'LIABILITY'
  );

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
          <h1>Bank Transactions Ledger</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            Log cash flow receipts, bank payments, contra entries, and check clearance balances
          </p>
        </div>
        <div className="attendance-page-header-actions">
          <button className="attendance-btn attendance-btn-primary" onClick={openForm}>
            <Plus size={16} /> NEW TRANSACTION
          </button>
        </div>
      </div>

      {/* SEARCH / FILTERS */}
      <div className="attendance-filters-bar" style={{ maxWidth: '300px' }}>
        <div className="attendance-filter-group">
          <label htmlFor="search-bank">Search Bank / Reference</label>
          <input 
            id="search-bank"
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
                <th style={{ textalign: 'left' }}>Bank Name</th>
                <th style={{ width: '120px' }}>Transaction Date</th>
                <th style={{ width: '120px', textAlign: 'center' }}>Voucher Type</th>
                <th style={{ width: '150px' }}>Reference (UTR) No</th>
                <th style={{ width: '140px' }}>Linked Invoice</th>
                <th style={{ textalign: 'left' }}>Linked Vendor</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Debit (₹)</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Credit (₹)</th>
                <th style={{ width: '150px', textAlign: 'right' }}>Closing Bal (₹)</th>
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
                  <td style={{ fontWeight: '800', color: 'var(--att-accent)', textalign: 'left' }}>{row.bank_name}</td>
                  <td>{row.transaction_date}</td>
                  <td style={{ textAlign: 'center', fontWeight: '800', color: row.voucher_type === 'RECEIPT' ? 'var(--att-success)' : 'var(--att-danger)' }}>
                    {row.voucher_type}
                  </td>
                  <td>{row.reference_no}</td>
                  <td>{row.linked_invoice_no || '-'}</td>
                  <td style={{ textalign: 'left' }}>{row.linked_vendor || '-'}</td>
                  <td style={{ textAlign: 'right', color: 'var(--att-success)', fontWeight: '700' }}>
                    {row.debit > 0 ? `₹${parseFloat(row.debit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--att-danger)', fontWeight: '700' }}>
                    {row.credit > 0 ? `₹${parseFloat(row.credit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: '800' }}>
                    ₹{parseFloat(row.closing_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
              {!filteredRecords.length && (
                <tr>
                  <td colSpan="10" className="attendance-empty">
                    No bank transactions registered yet.
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
              <h2>Register Bank Transaction</h2>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="attendance-modal-body">
                <div className="attendance-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  
                  <div className="attendance-form-group">
                    <label htmlFor="bank_ledger_id">Bank / Cash Ledger</label>
                    <select 
                      id="bank_ledger_id"
                      className="attendance-select" 
                      value={formData.bank_ledger_id} 
                      onChange={handleInputChange} 
                      required
                    >
                      <option value="">-- Select Bank Account --</option>
                      {bankLedgers.map(l => (
                        <option key={l.id} value={l.id}>{l.ledger_name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="transaction_date">Transaction Date</label>
                    <input 
                      id="transaction_date"
                      className="attendance-input" 
                      type="date" 
                      value={formData.transaction_date} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="voucher_type">Voucher Type</label>
                    <select 
                      id="voucher_type"
                      className="attendance-select" 
                      value={formData.voucher_type} 
                      onChange={handleInputChange} 
                      required
                    >
                      <option value="RECEIPT">RECEIPT</option>
                      <option value="PAYMENT">PAYMENT</option>
                      <option value="CONTRA">CONTRA</option>
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="reference_no">Reference No (UTR / Cheque)</label>
                    <input 
                      id="reference_no"
                      className="attendance-input" 
                      value={formData.reference_no} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="linked_invoice_no">Linked Invoice No</label>
                    <input 
                      id="linked_invoice_no"
                      className="attendance-input" 
                      value={formData.linked_invoice_no} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="linked_vendor_ledger_id">Linked Vendor Ledger</label>
                    <select 
                      id="linked_vendor_ledger_id"
                      className="attendance-select" 
                      value={formData.linked_vendor_ledger_id} 
                      onChange={handleInputChange}
                    >
                      <option value="">-- Optional Vendor Account --</option>
                      {vendorLedgers.map(l => (
                        <option key={l.id} value={l.id}>{l.ledger_name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="debit">Debit Amount</label>
                    <input 
                      id="debit"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.debit} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="credit">Credit Amount</label>
                    <input 
                      id="credit"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.credit} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="closing_balance">Closing Balance</label>
                    <input 
                      id="closing_balance"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.closing_balance} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                </div>
              </div>
              <div className="attendance-modal-footer">
                <button type="button" className="attendance-btn attendance-btn-secondary" onClick={closeForm}>
                  Cancel
                </button>
                <button type="submit" className="attendance-btn attendance-btn-primary">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
