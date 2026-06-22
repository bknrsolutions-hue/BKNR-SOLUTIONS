import React, { useState } from 'react';
import { CreditCard, Plus, Trash2 } from 'lucide-react';

export default function FinanceConsole({ activePage }) {
  const getInitialTab = () => {
    if (!activePage) return 'vendor_payment';
    const tabName = activePage.replace('finance_', '').replace('export_documents_', '').replace('export_', '');
    
    if (tabName === 'ledger_master' || tabName === 'journal_entry' || tabName === 'bank_transaction' || tabName === 'payment_receipt') {
      return 'ledger';
    }
    if (tabName === 'customer_receivable' || tabName === 'commercial_invoice' || tabName === 'packing_list' || tabName === 'container_stuffing' || tabName === 'shipping_bill' || tabName === 'bill_of_lading' || tabName === 'health_certificate' || tabName === 'shipment') {
      return 'receivable';
    }
    if (tabName === 'vendor_payment' || tabName === 'expense_voucher') {
      return 'vendor_payment';
    }
    return 'vendor_payment';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab());

  const [vendorPayments, setVendorPayments] = useState([
    { id: 1, vendor: 'Oceanic Feeds Inc', amount: 45000, method: 'Bank Transfer', status: 'PAID' },
    { id: 2, vendor: 'Snowman Cold Storage', amount: 22000, method: 'Cheque', status: 'PENDING' }
  ]);

  const [receivables, setReceivables] = useState([
    { id: 1, buyer: 'Apex Seafoods Co', invoice: 'INV-2026-001', amount: 125000, status: 'UNPAID' }
  ]);

  const [ledgers, setLedgers] = useState([
    { id: 1, accountName: 'Cash Account', group: 'Current Assets', balance: 450000 },
    { id: 2, accountName: 'Wages Payout Account', group: 'Direct Expenses', balance: -164500 }
  ]);

  // Inputs
  const [newVendor, setNewVendor] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newMethod, setNewMethod] = useState('Bank Transfer');

  const [newBuyer, setNewBuyer] = useState('');
  const [newInvoice, setNewInvoice] = useState('');
  const [newRecAmount, setNewRecAmount] = useState('');

  const [newLedgerName, setNewLedgerName] = useState('');
  const [newLedgerGroup, setNewLedgerGroup] = useState('Current Assets');
  const [newLedgerBal, setNewLedgerBal] = useState('');

  const handleAddPayment = (e) => {
    e.preventDefault();
    if (!newVendor || !newAmount) return;
    const item = {
      id: Date.now(),
      vendor: newVendor,
      amount: parseFloat(newAmount),
      method: newMethod,
      status: 'PAID'
    };
    setVendorPayments([...vendorPayments, item]);
    setNewVendor('');
    setNewAmount('');
  };

  const handleAddReceivable = (e) => {
    e.preventDefault();
    if (!newBuyer || !newInvoice || !newRecAmount) return;
    const item = {
      id: Date.now(),
      buyer: newBuyer,
      invoice: newInvoice,
      amount: parseFloat(newRecAmount),
      status: 'UNPAID'
    };
    setReceivables([...receivables, item]);
    setNewBuyer('');
    setNewInvoice('');
    setNewRecAmount('');
  };

  const handleAddLedger = (e) => {
    e.preventDefault();
    if (!newLedgerName || !newLedgerBal) return;
    const item = {
      id: Date.now(),
      accountName: newLedgerName,
      group: newLedgerGroup,
      balance: parseFloat(newLedgerBal)
    };
    setLedgers([...ledgers, item]);
    setNewLedgerName('');
    setNewLedgerBal('');
  };

  return (
    <div>
      <h2 style={{ marginBottom: '20px', color: 'var(--corp-fin)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <CreditCard /> Finance & Accounts Ledger
      </h2>

      {/* Tabs */}
      <div style={tabsWrapperStyle}>
        <button onClick={() => setActiveTab('vendor_payment')} style={{...tabItemStyle, background: activeTab === 'vendor_payment' ? 'var(--corp-fin)' : 'transparent', color: activeTab === 'vendor_payment' ? '#fff' : 'var(--text-secondary)', borderColor: activeTab === 'vendor_payment' ? 'var(--corp-fin)' : 'var(--border-light)'}}>Vendor Payment</button>
        <button onClick={() => setActiveTab('receivable')} style={{...tabItemStyle, background: activeTab === 'receivable' ? 'var(--corp-fin)' : 'transparent', color: activeTab === 'receivable' ? '#fff' : 'var(--text-secondary)', borderColor: activeTab === 'receivable' ? 'var(--corp-fin)' : 'var(--border-light)'}}>Receivables</button>
        <button onClick={() => setActiveTab('ledger')} style={{...tabItemStyle, background: activeTab === 'ledger' ? 'var(--corp-fin)' : 'transparent', color: activeTab === 'ledger' ? '#fff' : 'var(--text-secondary)', borderColor: activeTab === 'ledger' ? 'var(--corp-fin)' : 'var(--border-light)'}}>Ledgers</button>
      </div>

      <div className="card" style={{ marginTop: '20px' }}>
        
        {/* Vendor Payments */}
        {activeTab === 'vendor_payment' && (
          <div>
            <form onSubmit={handleAddPayment} style={{ marginBottom: '20px' }}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Vendor Name *</label>
                  <input type="text" className="form-control" value={newVendor} onChange={e => setNewVendor(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Disbursement Amount (₹) *</label>
                  <input type="number" className="form-control" value={newAmount} onChange={e => setNewAmount(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Payment Method</label>
                  <select className="form-control" value={newMethod} onChange={e => setNewMethod(e.target.value)}>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Cash">Cash</option>
                  </select>
                </div>
              </div>
              <button type="submit" className="btn btn-primary" style={{ background: 'var(--corp-fin)' }}><Plus size={14} /> Record Payment</button>
            </form>

            <div className="table-responsive">
              <table className="bknr-table">
                <thead>
                  <tr>
                    <th className="text-left">Vendor</th>
                    <th className="text-right">Amount (₹)</th>
                    <th className="text-left">Method</th>
                    <th className="text-center">Status</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorPayments.map(row => (
                    <tr key={row.id}>
                      <td className="text-left" style={{ fontWeight: '700' }}>{row.vendor}</td>
                      <td className="text-right">₹{row.amount.toLocaleString()}</td>
                      <td className="text-left">{row.method}</td>
                      <td className="text-center">
                        <span className={`badge ${row.status === 'PAID' ? 'badge-success' : 'badge-warning'}`}>{row.status}</span>
                      </td>
                      <td className="text-center">
                        <button onClick={() => setVendorPayments(vendorPayments.filter(p => p.id !== row.id))} style={removeBtnStyle}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Receivables */}
        {activeTab === 'receivable' && (
          <div>
            <form onSubmit={handleAddReceivable} style={{ marginBottom: '20px' }}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Customer Name *</label>
                  <input type="text" className="form-control" value={newBuyer} onChange={e => setNewBuyer(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Invoice Code *</label>
                  <input type="text" className="form-control" value={newInvoice} onChange={e => setNewInvoice(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Receivable Value (₹) *</label>
                  <input type="number" className="form-control" value={newRecAmount} onChange={e => setNewRecAmount(e.target.value)} required />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" style={{ background: 'var(--corp-fin)' }}><Plus size={14} /> Record Receivable</button>
            </form>

            <div className="table-responsive">
              <table className="bknr-table">
                <thead>
                  <tr>
                    <th className="text-left">Customer Name</th>
                    <th className="text-left">Invoice No</th>
                    <th className="text-right">Amount (₹)</th>
                    <th className="text-center">Status</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {receivables.map(row => (
                    <tr key={row.id}>
                      <td className="text-left" style={{ fontWeight: '700' }}>{row.buyer}</td>
                      <td className="text-left">{row.invoice}</td>
                      <td className="text-right">₹{row.amount.toLocaleString()}</td>
                      <td className="text-center">
                        <span className={`badge ${row.status === 'PAID' ? 'badge-success' : 'badge-warning'}`}>{row.status}</span>
                      </td>
                      <td className="text-center">
                        <button onClick={() => setReceivables(receivables.filter(r => r.id !== row.id))} style={removeBtnStyle}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Ledgers */}
        {activeTab === 'ledger' && (
          <div>
            <form onSubmit={handleAddLedger} style={{ marginBottom: '20px' }}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Account Name *</label>
                  <input type="text" className="form-control" value={newLedgerName} onChange={e => setNewLedgerName(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Ledger Group</label>
                  <select className="form-control" value={newLedgerGroup} onChange={e => setNewLedgerGroup(e.target.value)}>
                    <option value="Current Assets">Current Assets</option>
                    <option value="Current Liabilities">Current Liabilities</option>
                    <option value="Direct Expenses">Direct Expenses</option>
                    <option value="Direct Incomes">Direct Incomes</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Opening Balance (₹) *</label>
                  <input type="number" className="form-control" value={newLedgerBal} onChange={e => setNewLedgerBal(e.target.value)} required />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" style={{ background: 'var(--corp-fin)' }}><Plus size={14} /> Add Ledger Account</button>
            </form>

            <div className="table-responsive">
              <table className="bknr-table">
                <thead>
                  <tr>
                    <th className="text-left">Account Name</th>
                    <th className="text-left">Group Class</th>
                    <th className="text-right">Closing Balance</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgers.map(row => (
                    <tr key={row.id}>
                      <td className="text-left" style={{ fontWeight: '700' }}>{row.accountName}</td>
                      <td className="text-left">{row.group}</td>
                      <td className="text-right" style={{ fontWeight: '750', color: row.balance < 0 ? '#ef4444' : 'var(--text-primary)' }}>
                        {row.balance < 0 ? `-₹${Math.abs(row.balance).toLocaleString()}` : `₹${row.balance.toLocaleString()}`}
                      </td>
                      <td className="text-center">
                        <button onClick={() => setLedgers(ledgers.filter(l => l.id !== row.id))} style={removeBtnStyle}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const tabsWrapperStyle = {
  display: 'flex',
  gap: '8px',
  borderBottom: '1px solid var(--border-light)',
  paddingBottom: '12px'
};

const tabItemStyle = {
  padding: '8px 16px',
  fontSize: '12px',
  fontWeight: '700',
  borderRadius: '20px',
  border: '1px solid',
  cursor: 'pointer',
  transition: 'background 0.15s, color 0.15s'
};

const removeBtnStyle = {
  background: 'none',
  border: 'none',
  color: '#ef4444',
  cursor: 'pointer'
};
