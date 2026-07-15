import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, MoreVertical, Ban, X, FileCheck, AlertCircle 
} from 'lucide-react';
import '../Attendance/Attendance.css';

export default function PaymentReceipts({ theme }) {
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
    receipt_no: '',
    entry_date: new Date().toISOString().split('T')[0],
    transaction_type: 'CUSTOMER_RECEIPT',
    party_ledger_id: '',
    bank_cash_ledger_id: '',
    invoice_no: '',
    vendor_bill_no: '',
    amount: 0.00,
    exchange_rate: 1.00,
    amount_inr: 0.00,
    bank_charges: 0.00,
    adjustment_amount: 0.00,
    reference_no: '',
    payment_mode: 'NEFT',
    narration: ''
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
      const htmlRes = await fetch('/finance_accounts/payment_receipt/entry');
      const htmlText = await htmlRes.text();
      const doc = new DOMParser().parseFromString(htmlText, 'text/html');
      const rows = doc.querySelectorAll('#tableBody tr.data-row');
      
      const parsedHistory = Array.from(rows).map(row => {
        const cells = row.querySelectorAll('td');
        const rawForeignAmt = cells[8]?.textContent.trim();
        const foreignAmt = rawForeignAmt && rawForeignAmt !== '-'
          ? parseFloat(rawForeignAmt.replace(/[$,\s]/g, '')) || 0.0
          : 0.0;

        return {
          id: row.getAttribute('data-id'),
          receipt_no: cells[1]?.textContent.trim() || '',
          entry_date: cells[2]?.textContent.trim() || '',
          transaction_type: cells[3]?.textContent.trim() || '',
          party_ledger: cells[4]?.textContent.trim() || '',
          bank_cash_ledger: cells[5]?.textContent.trim() || '',
          reference_no: cells[6]?.textContent.trim() || '',
          payment_mode: cells[7]?.textContent.trim() || '',
          amount: foreignAmt,
          amount_inr: parseFloat(cells[9]?.textContent.replace(/[₹,\s]/g, '') || 0),
        };
      });

      setHistory(parsedHistory);
      if (successMsg) showNotification(successMsg, 'success');
    } catch (e) {
      showNotification('❌ Failed to fetch payment/receipt records!', 'danger');
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
      if (id === 'amount' || id === 'exchange_rate') {
        const amt = parseFloat(updated.amount) || 0;
        const rate = parseFloat(updated.exchange_rate) || 1.00;
        if (amt > 0) {
          updated.amount_inr = (amt * rate).toFixed(2);
        }
      }
      return updated;
    });
  };

  const openForm = () => {
    const bankCashAccounts = ledgers.filter(l => 
      l.group_name === 'Bank Accounts' || 
      l.group_name === 'Cash-in-hand' || 
      l.ledger_name.toLowerCase().includes('cash')
    );
    setFormData({
      receipt_no: '',
      entry_date: new Date().toISOString().split('T')[0],
      transaction_type: 'CUSTOMER_RECEIPT',
      party_ledger_id: ledgers.length > 0 ? ledgers[0].id : '',
      bank_cash_ledger_id: bankCashAccounts.length > 0 ? bankCashAccounts[0].id : '',
      invoice_no: '',
      vendor_bill_no: '',
      amount: 0.00,
      exchange_rate: 1.00,
      amount_inr: 0.00,
      bank_charges: 0.00,
      adjustment_amount: 0.00,
      reference_no: '',
      payment_mode: 'NEFT',
      narration: ''
    });
    setIsModalOpen(true);
    setMenuOpen(false);
  };

  const closeForm = () => {
    setIsModalOpen(false);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    if (!formData.party_ledger_id || !formData.bank_cash_ledger_id) {
      alert('Select party and contra bank/cash accounts!');
      return;
    }

    if (parseFloat(formData.amount_inr) <= 0) {
      alert('INR amount must be greater than zero!');
      return;
    }

    const confirmPost = window.confirm(`Record Receipt?\nAre you sure you want to log this payment receipt entry?`);
    if (!confirmPost) return;

    try {
      const payload = {
        receipt_no: formData.receipt_no,
        entry_date: formData.entry_date,
        transaction_type: formData.transaction_type,
        party_ledger_id: parseInt(formData.party_ledger_id),
        bank_cash_ledger_id: parseInt(formData.bank_cash_ledger_id),
        invoice_no: formData.invoice_no || null,
        vendor_bill_no: formData.vendor_bill_no || null,
        amount: parseFloat(formData.amount) || 0.0,
        exchange_rate: parseFloat(formData.exchange_rate) || 1.0,
        amount_inr: parseFloat(formData.amount_inr) || 0.0,
        bank_charges: parseFloat(formData.bank_charges) || 0.0,
        adjustment_amount: parseFloat(formData.adjustment_amount) || 0.0,
        reference_no: formData.reference_no || null,
        payment_mode: formData.payment_mode,
        narration: formData.narration || null
      };

      const res = await fetch('/finance_accounts/payment_receipt/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        closeForm();
        loadData(data.message || '✅ Payment receipt posted successfully!');
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to save receipt!', 'danger');
      }
    } catch (err) {
      showNotification('❌ Network error saving payment receipt!', 'danger');
    }
  };

  const cancelSelected = async () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    const confirmDelete = window.confirm(`Cancel Receipt?\nAre you sure you want to cancel this receipt voucher?`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/finance_accounts/payment_receipt/delete/${selectedRow.id}`, { method: 'POST' });
      if (res.ok) {
        showNotification('🗑️ Receipt voucher cancelled successfully!', 'success');
        loadData();
        setSelectedRow(null);
      } else {
        showNotification('❌ Failed to cancel receipt voucher!', 'danger');
      }
    } catch (e) {
      showNotification('❌ Network error cancelling receipt!', 'danger');
    }
  };

  const filteredRecords = history.filter(rec => {
    const query = searchQuery.toLowerCase().trim();
    return (
      (rec.receipt_no || '').toLowerCase().includes(query) ||
      (rec.party_ledger || '').toLowerCase().includes(query) ||
      (rec.reference_no || '').toLowerCase().includes(query)
    );
  });

  const bankCashAccounts = ledgers.filter(l => 
    l.group_name === 'Bank Accounts' || 
    l.group_name === 'Cash-in-hand' || 
    l.ledger_name.toLowerCase().includes('cash')
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
          <h1>Payment Receipts Ledger</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            Log incoming customer wire clearances, vendor disbursements, and settlement adjustments
          </p>
        </div>
        <div className="attendance-page-header-actions">
          <button className="attendance-btn attendance-btn-primary" onClick={openForm}>
            <Plus size={16} /> NEW RECEIPT
          </button>
        </div>
      </div>

      {/* SEARCH / FILTERS */}
      <div className="attendance-filters-bar" style={{ maxWidth: '300px' }}>
        <div className="attendance-filter-group">
          <label htmlFor="search-receipts">Search Receipts / Parties</label>
          <input 
            id="search-receipts"
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

      {/* LEDGER LOG TABLE */}
      <div className="attendance-table-container">
        <div className="attendance-table-wrapper">
          <table className="attendance-table">
            <thead>
              <tr>
                <th style={{ width: '60px', textAlign: 'center' }}>Sl</th>
                <th style={{ width: '140px' }}>Receipt No</th>
                <th style={{ width: '120px' }}>Entry Date</th>
                <th style={{ width: '150px' }}>Remittance Type</th>
                <th style={{ textalign: 'left' }}>Party Account Ledger</th>
                <th style={{ textalign: 'left' }}>Contra Asset Ledger</th>
                <th style={{ width: '150px' }}>Reference No</th>
                <th style={{ width: '120px' }}>Payment Mode</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Foreign Amount</th>
                <th style={{ width: '150px', textAlign: 'right' }}>INR Value (₹)</th>
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
                  <td style={{ fontWeight: '800', color: 'var(--att-accent)' }}>{row.receipt_no}</td>
                  <td>{row.entry_date}</td>
                  <td style={{ fontWeight: '800' }}>{row.transaction_type}</td>
                  <td style={{ textalign: 'left', fontWeight: '700' }}>{row.party_ledger}</td>
                  <td style={{ textalign: 'left' }}>{row.bank_cash_ledger}</td>
                  <td>{row.reference_no || '-'}</td>
                  <td>{row.payment_mode}</td>
                  <td style={{ textAlign: 'right' }}>
                    {row.amount > 0 ? `$${parseFloat(row.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '-'}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: '800' }}>
                    ₹{parseFloat(row.amount_inr || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
              {!filteredRecords.length && (
                <tr>
                  <td colSpan="10" className="attendance-empty">
                    No payment receipts registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NEW RECEIPT MODAL */}
      {isModalOpen && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content" style={{ maxWidth: '850px' }}>
            <div className="attendance-modal-header">
              <h2>Record Payment / Receipt</h2>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="attendance-modal-body">
                <div className="attendance-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  
                  <div className="attendance-form-group">
                    <label htmlFor="receipt_no">Receipt / Voucher No</label>
                    <input 
                      id="receipt_no"
                      className="attendance-input" 
                      value={formData.receipt_no} 
                      onChange={handleInputChange} 
                      placeholder="RCT-YYYY-XXXX" 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="entry_date">Entry Date</label>
                    <input 
                      id="entry_date"
                      className="attendance-input" 
                      type="date" 
                      value={formData.entry_date} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="transaction_type">Transaction Type</label>
                    <select 
                      id="transaction_type"
                      className="attendance-select" 
                      value={formData.transaction_type} 
                      onChange={handleInputChange} 
                      required
                    >
                      <option value="CUSTOMER_RECEIPT">CUSTOMER RECEIPT</option>
                      <option value="VENDOR_PAYMENT">VENDOR PAYMENT</option>
                      <option value="ADVANCE">ADVANCE REMITTANCE</option>
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="party_ledger_id">Party Ledger Name</label>
                    <select 
                      id="party_ledger_id"
                      className="attendance-select" 
                      value={formData.party_ledger_id} 
                      onChange={handleInputChange} 
                      required
                    >
                      <option value="" disabled>-- SELECT PARTY --</option>
                      {ledgers.map(l => (
                        <option key={l.id} value={l.id}>
                          {l.ledger_name} {l.group_name ? `(${l.group_name})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="bank_cash_ledger_id">Bank / Cash Ledger</label>
                    <select 
                      id="bank_cash_ledger_id"
                      className="attendance-select" 
                      value={formData.bank_cash_ledger_id} 
                      onChange={handleInputChange} 
                      required
                    >
                      <option value="" disabled>-- SELECT CONTRA ACCOUNT --</option>
                      {bankCashAccounts.map(l => (
                        <option key={l.id} value={l.id}>{l.ledger_name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="invoice_no">Linked Invoice No</label>
                    <input 
                      id="invoice_no"
                      className="attendance-input" 
                      value={formData.invoice_no} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="vendor_bill_no">Linked Vendor Bill No</label>
                    <input 
                      id="vendor_bill_no"
                      className="attendance-input" 
                      value={formData.vendor_bill_no} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="amount">Foreign Amount</label>
                    <input 
                      id="amount"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.amount} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="exchange_rate">Exchange Rate</label>
                    <input 
                      id="exchange_rate"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.exchange_rate} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="amount_inr">INR Amount (₹)</label>
                    <input 
                      id="amount_inr"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.amount_inr} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="bank_charges">Bank Charges (₹)</label>
                    <input 
                      id="bank_charges"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.bank_charges} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="adjustment_amount">Adjustment Amount (Roundoff)</label>
                    <input 
                      id="adjustment_amount"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.adjustment_amount} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="reference_no">Reference No (UTR / Cheque)</label>
                    <input 
                      id="reference_no"
                      className="attendance-input" 
                      value={formData.reference_no} 
                      onChange={handleInputChange} 
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
                      <option value="NEFT">NEFT</option>
                      <option value="RTGS">RTGS</option>
                      <option value="Cheque">Cheque</option>
                      <option value="Cash">Cash</option>
                      <option value="Swift Transfer">Swift Transfer</option>
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="narration">Narration</label>
                    <input 
                      id="narration"
                      className="attendance-input" 
                      value={formData.narration} 
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
                  Save Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
