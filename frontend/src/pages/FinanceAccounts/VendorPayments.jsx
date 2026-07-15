import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, MoreVertical, Ban, X, FileMinus, AlertCircle 
} from 'lucide-react';
import '../Attendance/Attendance.css';

export default function VendorPayments({ theme }) {
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
    vendor_ledger_id: '',
    vendor_type: 'Supplier',
    gst_no: '',
    vendor_invoice_no: '',
    bill_no: '',
    bill_date: new Date().toISOString().split('T')[0],
    due_date: new Date().toISOString().split('T')[0],
    total_amount: 0.00,
    gst_amount: 0.00,
    tds_amount: 0.00,
    payment_mode: 'NEFT',
    transaction_no: ''
  });

  // Notification State
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async (successMsg = null) => {
    try {
      const [historyRes, ledgersRes] = await Promise.all([
        fetch('/finance_accounts/vendor_payments'),
        fetch('/finance_accounts/ledgers')
      ]);
      const historyData = await historyRes.json();
      const ledgersData = await ledgersRes.json();

      if (historyData.success) {
        setHistory(historyData.data || []);
      }

      if (ledgersData.success) {
        setLedgers(ledgersData.data || []);
        if (ledgersData.data?.length > 0 && !formData.vendor_ledger_id) {
          setFormData(prev => ({
            ...prev,
            vendor_ledger_id: ledgersData.data[0].id
          }));
        }
      }

      if (successMsg) showNotification(successMsg, 'success');
    } catch (e) {
      showNotification('❌ Failed to fetch vendor payments history!', 'danger');
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
    setFormData({
      vendor_ledger_id: ledgers.length > 0 ? ledgers[0].id : '',
      vendor_type: 'Supplier',
      gst_no: '',
      vendor_invoice_no: '',
      bill_no: '',
      bill_date: new Date().toISOString().split('T')[0],
      due_date: new Date().toISOString().split('T')[0],
      total_amount: 0.00,
      gst_amount: 0.00,
      tds_amount: 0.00,
      payment_mode: 'NEFT',
      transaction_no: ''
    });
    setIsModalOpen(true);
    setMenuOpen(false);
  };

  const closeForm = () => {
    setIsModalOpen(false);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    if (!formData.vendor_ledger_id) {
      alert('Select a vendor ledger account!');
      return;
    }

    const confirmSave = window.confirm(`Record Vendor Bill?\nAre you sure you want to save this vendor bill?`);
    if (!confirmSave) return;

    try {
      const payload = {
        vendor_ledger_id: parseInt(formData.vendor_ledger_id),
        vendor_type: formData.vendor_type,
        gst_no: formData.gst_no || null,
        vendor_invoice_no: formData.vendor_invoice_no || null,
        bill_no: formData.bill_no,
        bill_date: formData.bill_date,
        due_date: formData.due_date,
        total_amount: parseFloat(formData.total_amount) || 0.0,
        gst_amount: parseFloat(formData.gst_amount) || 0.0,
        tds_amount: parseFloat(formData.tds_amount) || 0.0,
        payment_mode: formData.payment_mode,
        transaction_no: formData.transaction_no || null
      };

      const res = await fetch('/finance_accounts/vendor_payment/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        closeForm();
        loadData(data.message || '✅ Vendor bill recorded successfully!');
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to save vendor bill!', 'danger');
      }
    } catch (err) {
      showNotification('❌ Network error saving vendor bill!', 'danger');
    }
  };

  const cancelSelected = async () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    const confirmDelete = window.confirm(`Cancel Bill Entry?\nAre you sure you want to cancel this vendor bill entry?`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/finance_accounts/vendor_payment/delete/${selectedRow.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showNotification('Vendor bill cancelled successfully!', 'success');
        loadData();
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to cancel vendor bill!', 'danger');
      }
    } catch (e) {
      showNotification('❌ Network error cancelling vendor bill!', 'danger');
    }
  };

  const filteredRecords = history.filter(rec => {
    const query = searchQuery.toLowerCase().trim();
    return (
      (rec.bill_no || '').toLowerCase().includes(query) ||
      (rec.vendor_name || '').toLowerCase().includes(query) ||
      (rec.vendor_invoice_no || '').toLowerCase().includes(query)
    );
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
          <h1>Vendor Payments Ledger</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            Log logistics invoices, raw shrimp purchase tickets, packing material supplier bills, and TDS schedules
          </p>
        </div>
        <div className="attendance-page-header-actions">
          <button className="attendance-btn attendance-btn-primary" onClick={openForm}>
            <Plus size={16} /> RECORD BILL
          </button>
        </div>
      </div>

      {/* SEARCH / FILTERS */}
      <div className="attendance-filters-bar" style={{ maxWidth: '300px' }}>
        <div className="attendance-filter-group">
          <label htmlFor="search-vendor">Search Vendor / Voucher</label>
          <input 
            id="search-vendor"
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
                <th style={{ width: '130px' }}>Voucher Bill No</th>
                <th style={{ textalign: 'left' }}>Vendor Name</th>
                <th style={{ width: '120px' }}>Vendor Type</th>
                <th style={{ width: '130px' }}>Vendor Invoice No</th>
                <th style={{ width: '120px' }}>Bill Date</th>
                <th style={{ width: '130px', textAlign: 'right' }}>GST Amount (₹)</th>
                <th style={{ width: '130px', textAlign: 'right' }}>TDS Deduct (₹)</th>
                <th style={{ width: '150px', textAlign: 'right' }}>Total Amount (₹)</th>
                <th style={{ width: '120px' }}>Due Date</th>
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
                  <td style={{ fontWeight: '800', color: 'var(--att-accent)' }}>{row.bill_no}</td>
                  <td style={{ textalign: 'left', fontWeight: '700' }}>{row.vendor_name}</td>
                  <td>{row.vendor_type}</td>
                  <td>{row.vendor_invoice_no || '-'}</td>
                  <td>{row.bill_date}</td>
                  <td style={{ textAlign: 'right' }}>
                    ₹{parseFloat(row.gst_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    ₹{parseFloat(row.tds_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: '800' }}>
                    ₹{parseFloat(row.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td>{row.due_date}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`attendance-badge ${row.status === 'Paid' ? 'attendance-badge-present' : 'attendance-badge-absent'}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!filteredRecords.length && (
                <tr>
                  <td colSpan="11" className="attendance-empty">
                    No vendor payments registered yet.
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
              <h2>Record Vendor Bill</h2>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="attendance-modal-body">
                <div className="attendance-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  
                  <div className="attendance-form-group">
                    <label htmlFor="vendor_ledger_id">Vendor Ledger</label>
                    <select 
                      id="vendor_ledger_id"
                      className="attendance-select" 
                      value={formData.vendor_ledger_id} 
                      onChange={handleInputChange} 
                      required
                    >
                      <option value="" disabled>-- Select Vendor Account --</option>
                      {ledgers.map(l => (
                        <option key={l.id} value={l.id}>
                          {l.ledger_name} {l.group_name ? `(${l.group_name})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="vendor_type">Vendor Type</label>
                    <select 
                      id="vendor_type"
                      className="attendance-select" 
                      value={formData.vendor_type} 
                      onChange={handleInputChange} 
                      required
                    >
                      <option value="Supplier">Supplier</option>
                      <option value="Contractor">Contractor</option>
                      <option value="Logistics">Logistics</option>
                      <option value="Service Provider">Service Provider</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="gst_no">GST No</label>
                    <input 
                      id="gst_no"
                      className="attendance-input" 
                      value={formData.gst_no} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="vendor_invoice_no">Vendor Invoice No</label>
                    <input 
                      id="vendor_invoice_no"
                      className="attendance-input" 
                      value={formData.vendor_invoice_no} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="bill_no">Internal Voucher ID (Bill No)</label>
                    <input 
                      id="bill_no"
                      className="attendance-input" 
                      value={formData.bill_no} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="bill_date">Bill Date</label>
                    <input 
                      id="bill_date"
                      className="attendance-input" 
                      type="date" 
                      value={formData.bill_date} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="due_date">Due Date</label>
                    <input 
                      id="due_date"
                      className="attendance-input" 
                      type="date" 
                      value={formData.due_date} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="total_amount">Base + GST Amt (Total)</label>
                    <input 
                      id="total_amount"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.total_amount} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="gst_amount">GST Component</label>
                    <input 
                      id="gst_amount"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.gst_amount} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="tds_amount">TDS Deduction</label>
                    <input 
                      id="tds_amount"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.tds_amount} 
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
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="transaction_no">Transaction / UTR Ref</label>
                    <input 
                      id="transaction_no"
                      className="attendance-input" 
                      value={formData.transaction_no} 
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
                  Record Payment Voucher
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
