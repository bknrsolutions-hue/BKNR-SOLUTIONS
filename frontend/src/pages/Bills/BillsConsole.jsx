import React, { useState } from 'react';
import { Ban, FileText, Plus } from 'lucide-react';

export default function BillsConsole({ activePage }) {
  const getInitialTab = () => {
    if (!activePage) return 'purchase';
    const tabName = activePage.replace('finance_', '');
    
    if (tabName === 'electricity_bills' || tabName === 'electricity') {
      return 'electricity';
    }
    if (tabName === 'diesel_bills' || tabName === 'diesel') {
      return 'diesel';
    }
    return 'purchase';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab());

  const [purchaseBills, setPurchaseBills] = useState([
    { id: 1, invoice: 'P-101', date: '2026-06-21', supplier: 'ABC Seafoods Pvt Ltd', value: 227500 },
    { id: 2, invoice: 'P-102', date: '2026-06-21', supplier: 'Blue Ocean Traders', value: 178500 }
  ]);

  const [dieselEntries, setDieselEntries] = useState([
    { id: 1, date: '2026-06-21', vehicle: 'AP-39-XX-1234', liters: 120, rate: 94.5, total: 11340 }
  ]);

  const [electricityEntries, setElectricityEntries] = useState([
    { id: 1, month: 'May 2026', meterNo: 'M-5678', units: 4500, total: 36000 }
  ]);

  // Form Inputs
  const [newInvoice, setNewInvoice] = useState('');
  const [newSupplier, setNewSupplier] = useState('');
  const [newValue, setNewValue] = useState('');

  const [newVehicle, setNewVehicle] = useState('');
  const [newLiters, setNewLiters] = useState('');
  const [newDieselRate, setNewDieselRate] = useState('');

  const [newMonth, setNewMonth] = useState('June 2026');
  const [newMeter, setNewMeter] = useState('');
  const [newUnits, setNewUnits] = useState('');

  const handleAddPurchase = (e) => {
    e.preventDefault();
    if (!newInvoice || !newSupplier || !newValue) return;
    const item = {
      id: Date.now(),
      invoice: newInvoice,
      date: new Date().toISOString().split('T')[0],
      supplier: newSupplier,
      value: parseFloat(newValue)
    };
    setPurchaseBills([...purchaseBills, item]);
    setNewInvoice('');
    setNewSupplier('');
    setNewValue('');
  };

  const handleAddDiesel = (e) => {
    e.preventDefault();
    if (!newVehicle || !newLiters || !newDieselRate) return;
    const litersVal = parseFloat(newLiters);
    const rateVal = parseFloat(newDieselRate);
    const item = {
      id: Date.now(),
      date: new Date().toISOString().split('T')[0],
      vehicle: newVehicle,
      liters: litersVal,
      rate: rateVal,
      total: litersVal * rateVal
    };
    setDieselEntries([...dieselEntries, item]);
    setNewVehicle('');
    setNewLiters('');
    setNewDieselRate('');
  };

  const handleAddElectricity = (e) => {
    e.preventDefault();
    if (!newMeter || !newUnits) return;
    const unitsVal = parseFloat(newUnits);
    const item = {
      id: Date.now(),
      month: newMonth,
      meterNo: newMeter,
      units: unitsVal,
      total: unitsVal * 8 // Assume standard commercial rate ₹8/unit
    };
    setElectricityEntries([...electricityEntries, item]);
    setNewMeter('');
    setNewUnits('');
  };

  return (
    <div className="report-viewer-card bills-console-page">
      <h2 style={{ marginBottom: '20px', color: 'var(--corp-ops)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <FileText /> Utilities & Material Bills
      </h2>

      {/* Tabs */}
      <div style={tabsWrapperStyle}>
        <button onClick={() => setActiveTab('purchase')} style={{...tabItemStyle, background: activeTab === 'purchase' ? 'var(--corp-ops)' : 'transparent', color: activeTab === 'purchase' ? '#fff' : 'var(--text-secondary)', borderColor: activeTab === 'purchase' ? 'var(--corp-ops)' : 'var(--border-light)'}}>Material Purchases</button>
        <button onClick={() => setActiveTab('diesel')} style={{...tabItemStyle, background: activeTab === 'diesel' ? 'var(--corp-ops)' : 'transparent', color: activeTab === 'diesel' ? '#fff' : 'var(--text-secondary)', borderColor: activeTab === 'diesel' ? 'var(--corp-ops)' : 'var(--border-light)'}}>Diesel Logs</button>
        <button onClick={() => setActiveTab('electricity')} style={{...tabItemStyle, background: activeTab === 'electricity' ? 'var(--corp-ops)' : 'transparent', color: activeTab === 'electricity' ? '#fff' : 'var(--text-secondary)', borderColor: activeTab === 'electricity' ? 'var(--corp-ops)' : 'var(--border-light)'}}>Electricity Bills</button>
      </div>

      <div className="card" style={{ marginTop: '20px' }}>

        {/* Material Purchases */}
        {activeTab === 'purchase' && (
          <div>
            <form onSubmit={handleAddPurchase} style={{ marginBottom: '20px' }}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Invoice Number *</label>
                  <input type="text" className="form-control" value={newInvoice} onChange={e => setNewInvoice(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Supplier *</label>
                  <input type="text" className="form-control" value={newSupplier} onChange={e => setNewSupplier(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Invoice Value (₹) *</label>
                  <input type="number" className="form-control" value={newValue} onChange={e => setNewValue(e.target.value)} required />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" style={{ background: 'var(--corp-ops)' }}><Plus size={14} /> Add Purchase Bill</button>
            </form>

            <div className="table-responsive">
              <table className="bknr-table">
                <thead>
                  <tr>
                    <th className="text-center">Invoice No</th>
                    <th className="text-center">Date</th>
                    <th className="text-left">Supplier</th>
                    <th className="text-right">Total Value</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {purchaseBills.map(row => (
                    <tr key={row.id}>
                      <td className="text-center" style={{ fontWeight: '700' }}>{row.invoice}</td>
                      <td className="text-center">{row.date}</td>
                      <td className="text-left">{row.supplier}</td>
                      <td className="text-right" style={{ fontWeight: '750' }}>₹{row.value.toLocaleString()}</td>
                      <td className="text-center">
                        <button onClick={() => setPurchaseBills(purchaseBills.filter(p => p.id !== row.id))} style={removeBtnStyle} title="Cancel bill" aria-label="Cancel purchase bill"><Ban size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Diesel Log */}
        {activeTab === 'diesel' && (
          <div>
            <form onSubmit={handleAddDiesel} style={{ marginBottom: '20px' }}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Vehicle Number *</label>
                  <input type="text" className="form-control" value={newVehicle} onChange={e => setNewVehicle(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Liters Refuelled *</label>
                  <input type="number" step="0.01" className="form-control" value={newLiters} onChange={e => setNewLiters(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Fuel Rate (₹ / Liter) *</label>
                  <input type="number" step="0.01" className="form-control" value={newDieselRate} onChange={e => setNewDieselRate(e.target.value)} required />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" style={{ background: 'var(--corp-ops)' }}><Plus size={14} /> Log Diesel Fuel</button>
            </form>

            <div className="table-responsive">
              <table className="bknr-table">
                <thead>
                  <tr>
                    <th className="text-center">Date</th>
                    <th className="text-left">Vehicle No</th>
                    <th className="text-right">Liters</th>
                    <th className="text-right">Rate</th>
                    <th className="text-right">Total Cost</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {dieselEntries.map(row => (
                    <tr key={row.id}>
                      <td className="text-center">{row.date}</td>
                      <td className="text-left" style={{ fontWeight: '700' }}>{row.vehicle}</td>
                      <td className="text-right">{row.liters.toFixed(2)}</td>
                      <td className="text-right">₹{row.rate.toFixed(2)}</td>
                      <td className="text-right" style={{ fontWeight: '750' }}>₹{row.total.toLocaleString()}</td>
                      <td className="text-center">
                        <button onClick={() => setDieselEntries(dieselEntries.filter(d => d.id !== row.id))} style={removeBtnStyle} title="Cancel entry" aria-label="Cancel diesel entry"><Ban size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Electricity Bills */}
        {activeTab === 'electricity' && (
          <div>
            <form onSubmit={handleAddElectricity} style={{ marginBottom: '20px' }}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Billing Month</label>
                  <input type="text" className="form-control" value={newMonth} onChange={e => setNewMonth(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Meter Serial No *</label>
                  <input type="text" className="form-control" value={newMeter} onChange={e => setNewMeter(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Consumed Units (KWh) *</label>
                  <input type="number" className="form-control" value={newUnits} onChange={e => setNewUnits(e.target.value)} required />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" style={{ background: 'var(--corp-ops)' }}><Plus size={14} /> Record Bill</button>
            </form>

            <div className="table-responsive">
              <table className="bknr-table">
                <thead>
                  <tr>
                    <th className="text-center">Billing Month</th>
                    <th className="text-left">Meter Serial No</th>
                    <th className="text-right">Consumed Units</th>
                    <th className="text-right">Bill Payout (₹)</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {electricityEntries.map(row => (
                    <tr key={row.id}>
                      <td className="text-center">{row.month}</td>
                      <td className="text-left" style={{ fontWeight: '700' }}>{row.meterNo}</td>
                      <td className="text-right">{row.units.toLocaleString()} Units</td>
                      <td className="text-right" style={{ fontWeight: '750', color: 'var(--corp-ops)' }}>₹{row.total.toLocaleString()}</td>
                      <td className="text-center">
                        <button onClick={() => setElectricityEntries(electricityEntries.filter(e => e.id !== row.id))} style={removeBtnStyle} title="Cancel bill" aria-label="Cancel electricity bill"><Ban size={14} /></button>
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
