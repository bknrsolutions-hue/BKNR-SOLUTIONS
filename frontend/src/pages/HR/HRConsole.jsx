import React, { useState } from 'react';
import { Users, Plus, Trash2, Check, X } from 'lucide-react';

export default function HRConsole({ activePage }) {
  const getInitialTab = () => {
    if (!activePage) return 'attendance';
    const tabName = activePage.replace('attendance_', '').replace('admin_', '');
    
    if (tabName === 'employee_register' || tabName === 'employee_registration' || tabName === 'employee_increment' || tabName === 'daily' || tabName === 'daily_attendance' || tabName === 'shifts' || tabName === 'add_user' || tabName === 'data_management' || tabName === 'manage_support' || tabName === 'support_team' || tabName === 'user_activity' || tabName === 'activities') {
      return 'attendance';
    }
    if (tabName === 'salary_advance' || tabName === 'salary-advance') {
      return 'advance';
    }
    if (tabName === 'salary' || tabName === 'salary_report' || tabName === 'tax_master' || tabName === 'tax-master') {
      return 'salary';
    }
    return 'attendance';
  };

  const [activeTab, setActiveTab] = useState(getInitialTab());

  const [employees, setEmployees] = useState([
    { id: 1, name: 'Nagaraju', role: 'Supervisor', present: true },
    { id: 2, name: 'Srinivas', role: 'Driver', present: true },
    { id: 3, name: 'Ramanayya', role: 'Operator', present: false }
  ]);

  const [advances, setAdvances] = useState([
    { id: 1, employee: 'Ramanayya', amount: 5000, date: '2026-06-20', status: 'APPROVED' }
  ]);

  const [salarySheets, setSalarySheets] = useState([
    { id: 1, employee: 'Nagaraju', basic: 25000, allowance: 3000, advanceDeduct: 0, netSalary: 28000 }
  ]);

  // Form inputs
  const [newAdvanceEmp, setNewAdvanceEmp] = useState('');
  const [newAdvanceAmt, setNewAdvanceAmt] = useState('');

  const [newSalEmp, setNewSalEmp] = useState('');
  const [newSalBasic, setNewSalBasic] = useState('');
  const [newSalAllow, setNewSalAllow] = useState('');
  const [newSalDeduct, setNewSalDeduct] = useState('');

  const toggleAttendance = (id) => {
    setEmployees(employees.map(emp => {
      if (emp.id === id) {
        return { ...emp, present: !emp.present };
      }
      return emp;
    }));
  };

  const handleAddAdvance = (e) => {
    e.preventDefault();
    if (!newAdvanceEmp || !newAdvanceAmt) return;
    const item = {
      id: Date.now(),
      employee: newAdvanceEmp,
      amount: parseFloat(newAdvanceAmt),
      date: new Date().toISOString().split('T')[0],
      status: 'APPROVED'
    };
    setAdvances([...advances, item]);
    setNewAdvanceEmp('');
    setNewAdvanceAmt('');
  };

  const handleAddSalary = (e) => {
    e.preventDefault();
    if (!newSalEmp || !newSalBasic) return;
    const basicVal = parseFloat(newSalBasic) || 0;
    const allowVal = parseFloat(newSalAllow) || 0;
    const deductVal = parseFloat(newSalDeduct) || 0;
    const item = {
      id: Date.now(),
      employee: newSalEmp,
      basic: basicVal,
      allowance: allowVal,
      advanceDeduct: deductVal,
      netSalary: basicVal + allowVal - deductVal
    };
    setSalarySheets([...salarySheets, item]);
    setNewSalEmp('');
    setNewSalBasic('');
    setNewSalAllow('');
    setNewSalDeduct('');
  };

  return (
    <div>
      <h2 style={{ marginBottom: '20px', color: 'var(--corp-hr)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Users /> HR & Attendance Operations
      </h2>

      {/* Tabs */}
      <div style={tabsWrapperStyle}>
        <button onClick={() => setActiveTab('attendance')} style={{...tabItemStyle, background: activeTab === 'attendance' ? 'var(--corp-hr)' : 'transparent', color: activeTab === 'attendance' ? '#fff' : 'var(--text-secondary)', borderColor: activeTab === 'attendance' ? 'var(--corp-hr)' : 'var(--border-light)'}}>Daily Attendance</button>
        <button onClick={() => setActiveTab('advance')} style={{...tabItemStyle, background: activeTab === 'advance' ? 'var(--corp-hr)' : 'transparent', color: activeTab === 'advance' ? '#fff' : 'var(--text-secondary)', borderColor: activeTab === 'advance' ? 'var(--corp-hr)' : 'var(--border-light)'}}>Salary Advance</button>
        <button onClick={() => setActiveTab('salary')} style={{...tabItemStyle, background: activeTab === 'salary' ? 'var(--corp-hr)' : 'transparent', color: activeTab === 'salary' ? '#fff' : 'var(--text-secondary)', borderColor: activeTab === 'salary' ? 'var(--corp-hr)' : 'var(--border-light)'}}>Salary Sheets</button>
      </div>

      <div className="card" style={{ marginTop: '20px' }}>

        {/* Daily Attendance */}
        {activeTab === 'attendance' && (
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: '800', marginBottom: '16px', color: 'var(--text-secondary)' }}>
              SHIFT ATTENDANCE ROSTER
            </h3>
            <div className="table-responsive">
              <table className="bknr-table">
                <thead>
                  <tr>
                    <th className="text-left">Employee Name</th>
                    <th className="text-center">Designation / Role</th>
                    <th className="text-center">Status</th>
                    <th className="text-center">Toggle Action</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map(row => (
                    <tr key={row.id}>
                      <td className="text-left" style={{ fontWeight: '700' }}>{row.name}</td>
                      <td className="text-center">{row.role}</td>
                      <td className="text-center">
                        <span className={`badge ${row.present ? 'badge-success' : 'badge-danger'}`}>
                          {row.present ? 'Present' : 'Absent'}
                        </span>
                      </td>
                      <td className="text-center">
                        <button 
                          onClick={() => toggleAttendance(row.id)} 
                          style={{
                            padding: '4px 10px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-light)',
                            background: 'var(--input-bg)',
                            color: row.present ? '#ef4444' : '#10b981',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: '800'
                          }}
                        >
                          {row.present ? 'Mark Absent' : 'Mark Present'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Salary Advance */}
        {activeTab === 'advance' && (
          <div>
            <form onSubmit={handleAddAdvance} style={{ marginBottom: '20px' }}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Select Employee *</label>
                  <select className="form-control" value={newAdvanceEmp} onChange={e => setNewAdvanceEmp(e.target.value)} required>
                    <option value="" disabled>Select Employee</option>
                    {employees.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Advance Amount (₹) *</label>
                  <input type="number" className="form-control" value={newAdvanceAmt} onChange={e => setNewAdvanceAmt(e.target.value)} required />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" style={{ background: 'var(--corp-hr)' }}><Plus size={14} /> Record Advance Request</button>
            </form>

            <div className="table-responsive">
              <table className="bknr-table">
                <thead>
                  <tr>
                    <th className="text-center">Log Date</th>
                    <th className="text-left">Employee Name</th>
                    <th className="text-right">Advance Disbursed</th>
                    <th className="text-center">Status</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {advances.map(row => (
                    <tr key={row.id}>
                      <td className="text-center">{row.date}</td>
                      <td className="text-left" style={{ fontWeight: '700' }}>{row.employee}</td>
                      <td className="text-right">₹{row.amount.toLocaleString()}</td>
                      <td className="text-center"><span className="badge badge-success">{row.status}</span></td>
                      <td className="text-center">
                        <button onClick={() => setAdvances(advances.filter(a => a.id !== row.id))} style={removeBtnStyle}><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Salary Sheet */}
        {activeTab === 'salary' && (
          <div>
            <form onSubmit={handleAddSalary} style={{ marginBottom: '20px' }}>
              <div className="form-grid">
                <div className="form-group">
                  <label>Employee Name *</label>
                  <select className="form-control" value={newSalEmp} onChange={e => setNewSalEmp(e.target.value)} required>
                    <option value="" disabled>Select Employee</option>
                    {employees.map(e => <option key={e.id} value={e.name}>{e.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Basic Salary (₹) *</label>
                  <input type="number" className="form-control" value={newSalBasic} onChange={e => setNewSalBasic(e.target.value)} required />
                </div>
                <div className="form-group">
                  <label>Allowances / Bonus (₹)</label>
                  <input type="number" className="form-control" value={newSalAllow} onChange={e => setNewSalAllow(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Advance Deductions (₹)</label>
                  <input type="number" className="form-control" value={newSalDeduct} onChange={e => setNewSalDeduct(e.target.value)} />
                </div>
              </div>
              <button type="submit" className="btn btn-primary" style={{ background: 'var(--corp-hr)' }}><Plus size={14} /> Calculate Wages</button>
            </form>

            <div className="table-responsive">
              <table className="bknr-table">
                <thead>
                  <tr>
                    <th className="text-left">Employee Name</th>
                    <th className="text-right">Basic Salary</th>
                    <th className="text-right">Allowance</th>
                    <th className="text-right">Advance Deductions</th>
                    <th className="text-right">Net Wages Payout</th>
                    <th className="text-center">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {salarySheets.map(row => (
                    <tr key={row.id}>
                      <td className="text-left" style={{ fontWeight: '700' }}>{row.employee}</td>
                      <td className="text-right">₹{row.basic.toLocaleString()}</td>
                      <td className="text-right">₹{row.allowance.toLocaleString()}</td>
                      <td className="text-right">₹{row.advanceDeduct.toLocaleString()}</td>
                      <td className="text-right" style={{ fontWeight: '800', color: 'var(--corp-fin)' }}>₹{row.netSalary.toLocaleString()}</td>
                      <td className="text-center">
                        <button onClick={() => setSalarySheets(salarySheets.filter(s => s.id !== row.id))} style={removeBtnStyle}><Trash2 size={14} /></button>
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
