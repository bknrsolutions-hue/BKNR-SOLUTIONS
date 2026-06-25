import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';

// A simple API service for making requests
const apiService = {
  get: async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');
    return response.json();
  },
  post: async (url, data) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'An error occurred');
    }
    return response.json();
  },
};

const CustomerReceivable = () => {
  const [receivables, setReceivables] = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const initialFormState = {
    invoice_no: '',
    po_number: '',
    container_no: '',
    buyer_ledger_id: '',
    buyer_type: 'Direct',
    country: '',
    invoice_date: new Date().toISOString().split('T')[0],
    currency: 'USD',
    exchange_rate: 83.50,
    invoice_value_foreign: 0,
    credit_days: 30,
  };

  const [newReceivable, setNewReceivable] = useState(initialFormState);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [receivablesRes, ledgersRes] = await Promise.all([
        apiService.get('/finance_accounts/customer_receivables'),
        apiService.get('/finance_accounts/ledgers'),
      ]);

      if (receivablesRes.success) {
        setReceivables(receivablesRes.data);
      }

      if (ledgersRes.success) {
        // Filter for Sundry Debtors on the client-side
        const customerLedgers = ledgersRes.data.filter(
          l => l.group_name === 'Sundry Debtors'
        );
        setLedgers(customerLedgers);
        if (customerLedgers.length > 0) {
          setNewReceivable(prev => ({ ...prev, buyer_ledger_id: customerLedgers[0].id }));
        }
      }
    } catch (error) {
      toast.error(`Failed to fetch data: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewReceivable(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const result = await apiService.post('/finance_accounts/customer_receivable/save', newReceivable);
      toast.success(result.message);
      setNewReceivable(initialFormState);
      fetchData();
    } catch (error) {
      toast.error(`Save failed: ${error.message}`);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this receivable?')) {
      try {
        const result = await apiService.post(`/finance_accounts/customer_receivable/delete/${id}`, {});
        toast.success(result.message);
        fetchData();
      } catch (error) {
        toast.error(`Delete failed: ${error.message}`);
      }
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Customer Receivables</h1>
        <p>Track all export and domestic sales invoices.</p>
      </div>

      <div className="form-card">
        <form onSubmit={handleSubmit}>
          <div className="form-grid-4">
            <div className="form-field">
              <label>Invoice No</label>
              <input type="text" name="invoice_no" value={newReceivable.invoice_no} onChange={handleInputChange} required />
            </div>
            <div className="form-field">
              <label>Buyer Ledger</label>
              <select name="buyer_ledger_id" value={newReceivable.buyer_ledger_id} onChange={handleInputChange} required>
                {ledgers.map(l => <option key={l.id} value={l.id}>{l.ledger_name}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Invoice Date</label>
              <input type="date" name="invoice_date" value={newReceivable.invoice_date} onChange={handleInputChange} required />
            </div>
            <div className="form-field">
              <label>Country</label>
              <input type="text" name="country" value={newReceivable.country} onChange={handleInputChange} required />
            </div>
            <div className="form-field">
              <label>PO Number</label>
              <input type="text" name="po_number" value={newReceivable.po_number} onChange={handleInputChange} />
            </div>
            <div className="form-field">
              <label>Container No</label>
              <input type="text" name="container_no" value={newReceivable.container_no} onChange={handleInputChange} />
            </div>
            <div className="form-field">
              <label>Buyer Type</label>
              <select name="buyer_type" value={newReceivable.buyer_type} onChange={handleInputChange}>
                <option>Direct</option>
                <option>Broker</option>
                <option>Distributor</option>
              </select>
            </div>
            <div className="form-field">
              <label>Credit Days</label>
              <input type="number" name="credit_days" value={newReceivable.credit_days} onChange={handleInputChange} />
            </div>
            <div className="form-field">
              <label>Currency</label>
              <input type="text" name="currency" value={newReceivable.currency} onChange={handleInputChange} />
            </div>
            <div className="form-field">
              <label>Exchange Rate</label>
              <input type="number" step="0.01" name="exchange_rate" value={newReceivable.exchange_rate} onChange={handleInputChange} />
            </div>
            <div className="form-field">
              <label>Invoice Value (Foreign)</label>
              <input type="number" step="0.01" name="invoice_value_foreign" value={newReceivable.invoice_value_foreign} onChange={handleInputChange} required />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-primary">Save Receivable</button>
          </div>
        </form>
      </div>

      <div className="table-card">
        {isLoading ? <p>Loading history...</p> : (
          <div className="table-responsive">
            <table className="bknr-table">
              <thead>
                <tr>
                  <th>Invoice No</th>
                  <th>PO Number</th>
                  <th>Buyer</th>
                  <th>Country</th>
                  <th>Invoice Date</th>
                  <th>Invoice Value (INR)</th>
                  <th>Balance (INR)</th>
                  <th>Due Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {receivables.length === 0 ? (
                  <tr><td colSpan="10" style={{ textAlign: 'center' }}>No receivables found.</td></tr>
                ) : (
                  receivables.map(row => (
                    <tr key={row.id}>
                      <td>{row.invoice_no}</td>
                      <td>{row.po_number || '-'}</td>
                      <td>{row.buyer_name}</td>
                      <td>{row.country}</td>
                      <td>{row.invoice_date}</td>
                      <td style={{ textAlign: 'right' }}>{row.invoice_value_inr?.toFixed(2)}</td>
                      <td style={{ textAlign: 'right' }}>{row.balance_amount?.toFixed(2)}</td>
                      <td>{row.due_date}</td>
                      <td>
                        <span className={`status-badge ${row.payment_status?.toLowerCase()}`}>{row.payment_status}</span>
                      </td>
                      <td>
                        <button onClick={() => handleDelete(row.id)} className="btn-icon btn-danger">
                          <i className="fa-solid fa-trash-can"></i>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerReceivable;