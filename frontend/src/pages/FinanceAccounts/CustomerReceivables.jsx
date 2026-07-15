import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, MoreVertical, Ban, X, FileText, AlertCircle 
} from 'lucide-react';
import '../Attendance/Attendance.css';

export default function CustomerReceivables({ theme }) {
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
    invoice_no: '',
    po_number: '',
    container_no: '',
    buyer_ledger_id: '',
    buyer_type: 'Direct Buyer',
    country: '',
    invoice_date: new Date().toISOString().split('T')[0],
    currency: 'USD',
    exchange_rate: 83.50,
    invoice_value_foreign: 0.00,
    credit_days: 30
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
        fetch('/finance_accounts/customer_receivables'),
        fetch('/finance_accounts/ledgers')
      ]);
      const historyData = await historyRes.json();
      const ledgersData = await ledgersRes.json();

      if (historyData.success) {
        setHistory(historyData.data || []);
      }

      if (ledgersData.success) {
        setLedgers(ledgersData.data || []);
        if (ledgersData.data?.length > 0 && !formData.buyer_ledger_id) {
          setFormData(prev => ({
            ...prev,
            buyer_ledger_id: ledgersData.data[0].id
          }));
        }
      }

      if (successMsg) showNotification(successMsg, 'success');
    } catch (e) {
      showNotification('❌ Failed to fetch customer receivables history!', 'danger');
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
      invoice_no: '',
      po_number: '',
      container_no: '',
      buyer_ledger_id: ledgers.length > 0 ? ledgers[0].id : '',
      buyer_type: 'Direct Buyer',
      country: '',
      invoice_date: new Date().toISOString().split('T')[0],
      currency: 'USD',
      exchange_rate: 83.50,
      invoice_value_foreign: 0.00,
      credit_days: 30
    });
    setIsModalOpen(true);
    setMenuOpen(false);
  };

  const closeForm = () => {
    setIsModalOpen(false);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    if (!formData.buyer_ledger_id) {
      alert('Select a customer ledger account!');
      return;
    }

    const confirmSave = window.confirm(`Record Customer Receivable?\nAre you sure you want to save this invoice?`);
    if (!confirmSave) return;

    try {
      const payload = {
        invoice_no: formData.invoice_no,
        po_number: formData.po_number || null,
        container_no: formData.container_no || null,
        buyer_ledger_id: parseInt(formData.buyer_ledger_id),
        buyer_type: formData.buyer_type,
        country: formData.country,
        invoice_date: formData.invoice_date,
        currency: formData.currency,
        exchange_rate: parseFloat(formData.exchange_rate) || 1.0,
        invoice_value_foreign: parseFloat(formData.invoice_value_foreign) || 0.0,
        credit_days: parseInt(formData.credit_days) || 30
      };

      const res = await fetch('/finance_accounts/customer_receivable/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        closeForm();
        loadData(data.message || '✅ Customer receivable recorded successfully!');
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to save customer receivable!', 'danger');
      }
    } catch (err) {
      showNotification('❌ Network error saving receivable!', 'danger');
    }
  };

  const cancelSelected = async () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    const confirmDelete = window.confirm(`Cancel Receivable?\nAre you sure you want to cancel this customer receivable record?`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/finance_accounts/customer_receivable/delete/${selectedRow.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showNotification('Customer receivable cancelled successfully!', 'success');
        loadData();
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to cancel receivable!', 'danger');
      }
    } catch (e) {
      showNotification('❌ Network error cancelling customer receivable!', 'danger');
    }
  };

  const filteredRecords = history.filter(rec => {
    const query = searchQuery.toLowerCase().trim();
    return (
      (rec.invoice_no || '').toLowerCase().includes(query) ||
      (rec.buyer_name || '').toLowerCase().includes(query) ||
      (rec.po_number || '').toLowerCase().includes(query)
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
          <h1>Customer Receivables Ledger</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            Track and monitor export and domestic customer invoices, currency margins, and age analysis
          </p>
        </div>
        <div className="attendance-page-header-actions">
          <button className="attendance-btn attendance-btn-primary" onClick={openForm}>
            <Plus size={16} /> NEW INVOICE
          </button>
        </div>
      </div>

      {/* SEARCH / FILTERS */}
      <div className="attendance-filters-bar" style={{ maxWidth: '300px' }}>
        <div className="attendance-filter-group">
          <label htmlFor="search-invoice">Search Invoice / Buyer</label>
          <input 
            id="search-invoice"
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
                <th style={{ width: '130px' }}>Invoice No</th>
                <th style={{ width: '120px' }}>PO Number</th>
                <th style={{ textalign: 'left' }}>Buyer Name</th>
                <th style={{ width: '120px' }}>Country</th>
                <th style={{ width: '120px' }}>Invoice Date</th>
                <th style={{ width: '130px', textAlign: 'right' }}>USD Value</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Exchange Rate</th>
                <th style={{ width: '150px', textAlign: 'right' }}>INR Value (₹)</th>
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
                  <td style={{ fontWeight: '800', color: 'var(--att-accent)' }}>{row.invoice_no}</td>
                  <td>{row.po_number || '-'}</td>
                  <td style={{ textalign: 'left', fontWeight: '700' }}>{row.buyer_name}</td>
                  <td>{row.country}</td>
                  <td>{row.invoice_date}</td>
                  <td style={{ textAlign: 'right' }}>
                    ${parseFloat(row.invoice_value_foreign || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    ₹{parseFloat(row.exchange_rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: '800' }}>
                    ₹{parseFloat(row.invoice_value_inr || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td>{row.due_date}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`attendance-badge ${row.payment_status === 'PAID' ? 'attendance-badge-present' : 'attendance-badge-absent'}`}>
                      {row.payment_status}
                    </span>
                  </td>
                </tr>
              ))}
              {!filteredRecords.length && (
                <tr>
                  <td colSpan="11" className="attendance-empty">
                    No customer receivables registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NEW INVOICE MODAL */}
      {isModalOpen && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content" style={{ maxWidth: '800px' }}>
            <div className="attendance-modal-header">
              <h2>Record Customer Invoice</h2>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="attendance-modal-body">
                <div className="attendance-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  
                  <div className="attendance-form-group">
                    <label htmlFor="invoice_no">Invoice No</label>
                    <input 
                      id="invoice_no"
                      className="attendance-input" 
                      value={formData.invoice_no} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="po_number">PO Number</label>
                    <input 
                      id="po_number"
                      className="attendance-input" 
                      value={formData.po_number} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="container_no">Container No</label>
                    <input 
                      id="container_no"
                      className="attendance-input" 
                      value={formData.container_no} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="buyer_ledger_id">Customer Ledger</label>
                    <select 
                      id="buyer_ledger_id"
                      className="attendance-select" 
                      value={formData.buyer_ledger_id} 
                      onChange={handleInputChange} 
                      required
                    >
                      <option value="" disabled>-- Select Customer Account --</option>
                      {ledgers.map(l => (
                        <option key={l.id} value={l.id}>
                          {l.ledger_name} {l.group_name ? `(${l.group_name})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="buyer_type">Buyer Type</label>
                    <select 
                      id="buyer_type"
                      className="attendance-select" 
                      value={formData.buyer_type} 
                      onChange={handleInputChange} 
                      required
                    >
                      <option value="Direct Buyer">Direct Buyer</option>
                      <option value="Broker">Broker</option>
                      <option value="Distributor">Distributor</option>
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="country">Country</label>
                    <input 
                      id="country"
                      className="attendance-input" 
                      value={formData.country} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="invoice_date">Invoice Date</label>
                    <input 
                      id="invoice_date"
                      className="attendance-input" 
                      type="date" 
                      value={formData.invoice_date} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="currency">Currency</label>
                    <input 
                      id="currency"
                      className="attendance-input" 
                      value={formData.currency} 
                      onChange={handleInputChange} 
                      required 
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
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="invoice_value_foreign">Invoice Value (Foreign)</label>
                    <input 
                      id="invoice_value_foreign"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.invoice_value_foreign} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="credit_days">Credit Days</label>
                    <input 
                      id="credit_days"
                      className="attendance-input" 
                      type="number" 
                      value={formData.credit_days} 
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
                  Record Receivable
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
