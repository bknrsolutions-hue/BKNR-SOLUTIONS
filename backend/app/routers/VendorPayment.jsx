import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-toastify';

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

const VendorPayment = () => {
  const [payments, setPayments] = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const initialFormState = {
    vendor_ledger_id: '',
    vendor_type: 'Raw Material',
    gst_no: '',
    vendor_invoice_no: '',
    bill_no: '',
    bill_date: new Date().toISOString().split('T')[0],
    due_date: new Date().toISOString().split('T')[0],
    total_amount: 0,
    gst_amount: 0,
    tds_amount: 0,
    payment_mode: 'RTGS',
    transaction_no: '',
  };

  const [newPayment, setNewPayment] = useState(initialFormState);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [paymentsRes, ledgersRes] = await Promise.all([
        apiService.get('/finance_accounts/vendor_payments'),
        apiService.get('/finance_accounts/ledgers'),
      ]);

      if (paymentsRes.success) {
        setPayments(paymentsRes.data);
      }

      if (ledgersRes.success) {
        // Filter for Sundry Creditors on the client-side
        const vendorLedgers = ledgersRes.data.filter(
          l => l.group_name === 'Sundry Creditors'
        );
        setLedgers(vendorLedgers);
        if (vendorLedgers.length > 0) {
          setNewPayment(prev => ({ ...prev, vendor_ledger_id: vendorLedgers[0].id }));
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
    setNewPayment(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const result = await apiService.post('/finance_accounts/vendor_payment/save', newPayment);
      toast.success(result.message);
      setNewPayment(initialFormState);
      fetchData();
    } catch (error) {
      toast.error(`Save failed: ${error.message}`);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this payment record?')) {
      try {
        const result = await apiService.post(`/finance_accounts/vendor_payment/delete/${id}`, {});
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
        <h1>Vendor Payments</h1>
        <p>Track all payables, including RM, packing, logistics, and other vendor bills.</p>
      </div>

      <div className="form-card">
        <form onSubmit={handleSubmit}>
          <div className="form-grid-4">
            <div className="form-field">
              <label>Vendor Ledger</label>
              <select name="vendor_ledger_id" value={newPayment.vendor_ledger_id} onChange={handleInputChange} required>
                {ledgers.map(l => <option key={l.id} value={l.id}>{l.ledger_name}</option>)}
              </select>
            </div>
            <div className="form-field">
              <label>Vendor Type</label>
              <select name="vendor_type" value={newPayment.vendor_type} onChange={handleInputChange}>
                <option>Raw Material</option>
                <option>Packing Material</option>
                <option>Logistics</option>
                <option>Contractor</option>
                <option>Utilities</option>
                <option>Other</option>
              </select>
            </div>
            <div className="form-field">
              <label>Bill No (Internal)</label>
              <input type="text" name="bill_no" value={newPayment.bill_no} onChange={handleInputChange} required />
            </div>
            <div className="form-field">
              <label>Bill Date</label>
              <input type="date" name="bill_date" value={newPayment.bill_date} onChange={handleInputChange} required />
            </div>
            <div className="form-field">
              <label>Vendor Invoice No</label>
              <input type="text" name="vendor_invoice_no" value={newPayment.vendor_invoice_no} onChange={handleInputChange} />
            </div>
            <div className="form-field">
              <label>Due Date</label>
              <input type="date" name="due_date" value={newPayment.due_date} onChange={handleInputChange} required />
            </div>
            <div className="form-field">
              <label>Total Amount</label>
              <input type="number" step="0.01" name="total_amount" value={newPayment.total_amount} onChange={handleInputChange} required />
            </div>
            <div className="form-field">
              <label>GST Amount</label>
              <input type="number" step="0.01" name="gst_amount" value={newPayment.gst_amount} onChange={handleInputChange} />
            </div>
            <div className="form-field">
              <label>TDS Amount</label>
              <input type="number" step="0.01" name="tds_amount" value={newPayment.tds_amount} onChange={handleInputChange} />
            </div>
            <div className="form-field">
              <label>GST No</label>
              <input type="text" name="gst_no" value={newPayment.gst_no} onChange={handleInputChange} />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-primary">Save Payable</button>
          </div>
        </form>
      </div>

      <div className="table-card">
        {isLoading ? <p>Loading history...</p> : (
          <div className="table-responsive">
            <table className="bknr-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Type</th>
                  <th>Bill No</th>
                  <th>Bill Date</th>
                  <th>Total Amount</th>
                  <th>GST</th>
                  <th>TDS</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {payments.length === 0 ? (
                  <tr><td colSpan="10" style={{ textAlign: 'center' }}>No payables found.</td></tr>
                ) : (
                  payments.map(row => (
                    <tr key={row.id}>
                      <td>{row.vendor_name}</td>
                      <td>{row.vendor_type}</td>
                      <td>{row.bill_no}</td>
                      <td>{row.bill_date}</td>
                      <td style={{ textAlign: 'right' }}>{row.total_amount?.toFixed(2)}</td>
                      <td style={{ textAlign: 'right' }}>{row.gst_amount?.toFixed(2)}</td>
                      <td style={{ textAlign: 'right' }}>{row.tds_amount?.toFixed(2)}</td>
                      <td style={{ textAlign: 'right' }}>{row.balance?.toFixed(2)}</td>
                      <td>
                        <span className={`status-badge ${row.status?.toLowerCase()}`}>{row.status}</span>
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

export default VendorPayment;