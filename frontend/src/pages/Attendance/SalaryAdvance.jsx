import React, { useState, useEffect } from 'react';
import { 
  Plus, Ban, X, AlertCircle, CheckCircle 
} from 'lucide-react';
import './Attendance.css';

export default function SalaryAdvance({ theme }) {
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selectedRow, setSelectedRow] = useState(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    employee_id: '',
    employee_name: '',
    department: '',
    current_salary: 0.0,
    advance_amount: '',
    monthly_deduction: '',
    deduct_from: '',
    deduct_to: '',
    reason: ''
  });

  // Notification State
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async (successMsg = null) => {
    try {
      const res = await fetch('/attendance/salary-advance?format=json');
      const data = await res.json();
      if (data.status === 'success') {
        setRecords(data.records || []);
        if (successMsg) showNotification(successMsg, 'success');
      }
    } catch (e) {
      showNotification('❌ Failed to fetch advance records!', 'danger');
    }
  };

  const fetchEmployees = async () => {
    try {
      const res = await fetch('/attendance/api/employees');
      const data = await res.json();
      setEmployees(data || []);
    } catch (e) {
      console.error('Fetch active staff error', e);
    }
  };

  useEffect(() => {
    loadData();
    fetchEmployees();
  }, []);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleEmployeeChange = (e) => {
    const empId = e.target.value;
    const emp = employees.find(x => x.employee_id === empId);
    if (emp) {
      setFormData(prev => ({
        ...prev,
        employee_id: empId,
        employee_name: emp.employee_name,
        department: emp.department || 'GENERAL',
        current_salary: emp.current_salary || 0.0
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        employee_id: '',
        employee_name: '',
        department: '',
        current_salary: 0.0
      }));
    }
  };

  const openForm = () => {
    setFormData({
      employee_id: '',
      employee_name: '',
      department: '',
      current_salary: 0.0,
      advance_amount: '',
      monthly_deduction: '',
      deduct_from: '',
      deduct_to: '',
      reason: ''
    });
    setIsModalOpen(true);
  };

  const closeForm = () => {
    setIsModalOpen(false);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const confirmSave = window.confirm(`Confirm Save?\nAre you sure you want to log this salary advance?`);
    if (!confirmSave) return;

    try {
      const payload = new URLSearchParams();
      Object.keys(formData).forEach(key => {
        if (formData[key] !== null && formData[key] !== undefined) {
          payload.append(key, formData[key]);
        }
      });

      const res = await fetch('/attendance/salary-advance/save?format=json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payload.toString()
      });

      const data = await res.json();
      if (data.status === 'success') {
        closeForm();
        loadData(data.message || '✅ Salary advance successfully created!');
      } else {
        showNotification(data.message || '❌ Failed to save salary advance!', 'danger');
      }
    } catch (err) {
      showNotification('❌ Network error saving salary advance!', 'danger');
    }
  };

  const deleteSelected = async (r) => {
    const confirmDelete = window.confirm(`Cancel advance record for ${r.employee_name}?`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/attendance/salary-advance/delete/${r.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.status === 'ok') {
        showNotification('Salary advance cancelled successfully!', 'success');
        loadData();
      } else {
        showNotification('Failed to cancel advance record!', 'danger');
      }
    } catch (e) {
      showNotification('❌ Network error deleting advance record!', 'danger');
    }
  };

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
          <h1>Salary Advance</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            Log staff loans and monthly advance deductions ledger
          </p>
        </div>
        <div className="attendance-page-header-actions">
          <button className="attendance-btn attendance-btn-primary" onClick={openForm}>
            <Plus size={16} /> ADD ADVANCE
          </button>
        </div>
      </div>

      {/* LEDGER LIST TABLE */}
      <div className="attendance-table-container">
        <div className="attendance-table-wrapper">
          <table className="attendance-table">
            <thead>
              <tr>
                <th style={{ width: '130px' }}>Emp ID</th>
                <th style={{ width: '180px' }}>Name</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Total Advance</th>
                <th style={{ width: '120px', textAlign: 'right' }}>Monthly</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Remaining</th>
                <th style={{ width: '130px' }}>Deduct Range</th>
                <th style={{ width: '120px', textAlign: 'center' }}>Status</th>
                <th style={{ width: '80px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id}>
                  <td style={{ color: 'var(--att-accent)', fontWeight: '800' }}>{r.employee_id}</td>
                  <td style={{ fontWeight: '700' }}>{r.employee_name}</td>
                  <td style={{ textAlign: 'right' }}>₹{parseFloat(r.advance_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right' }}>₹{parseFloat(r.monthly_deduction || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                  <td style={{ textAlign: 'right', fontWeight: '800', color: r.remaining_balance > 0 ? 'var(--att-warning)' : 'var(--att-success)' }}>
                    ₹{parseFloat(r.remaining_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td>{r.deduct_from || '-'} to {r.deduct_to || 'End'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`attendance-badge ${r.remaining_balance === 0 ? 'attendance-badge-success' : 'attendance-badge-warning'}`}>
                      {r.remaining_balance === 0 ? 'PAID' : 'ACTIVE'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <button 
                      className="attendance-btn attendance-btn-danger" 
                      style={{ padding: '4px 8px' }} 
                      onClick={() => deleteSelected(r)}
                      aria-label={`Cancel salary advance for ${r.employee_name}`}
                      title="Cancel advance"
                    >
                      <Ban size={12} />
                    </button>
                  </td>
                </tr>
              ))}
              {!records.length && (
                <tr>
                  <td colSpan="8" className="attendance-empty">
                    No salary advance logs found in index ledger.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ADVANCE ENTRY MODAL */}
      {isModalOpen && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content" style={{ maxWidth: '850px' }}>
            <div className="attendance-modal-header">
              <h2>Salary Advance Entry</h2>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="attendance-modal-body">
                
                {/* Employee Details Section */}
                <div className="section">
                  <div className="attendance-form-section-title">Employee Details</div>
                  <div className="attendance-form-grid">
                    <div className="attendance-form-group">
                      <label htmlFor="adv-emp-select">Employee ID</label>
                      <select 
                        id="adv-emp-select"
                        className="attendance-select" 
                        name="employee_id" 
                        value={formData.employee_id} 
                        onChange={handleEmployeeChange} 
                        required
                      >
                        <option value="">-- Select Employee --</option>
                        {employees.map(emp => (
                          <option key={emp.employee_id} value={emp.employee_id}>
                            {emp.employee_id} - {emp.employee_name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="adv-emp-name">Employee Name</label>
                      <input 
                        id="adv-emp-name"
                        className="attendance-input" 
                        name="employee_name" 
                        value={formData.employee_name} 
                        readOnly 
                        required 
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="adv-emp-dept">Department</label>
                      <input 
                        id="adv-emp-dept"
                        className="attendance-input" 
                        name="department" 
                        value={formData.department} 
                        readOnly 
                        required 
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="adv-emp-salary">Current Salary</label>
                      <input 
                        id="adv-emp-salary"
                        className="attendance-input" 
                        value={formData.current_salary} 
                        readOnly 
                      />
                    </div>
                  </div>
                </div>

                {/* Advance Config Section */}
                <div className="section" style={{ marginTop: '16px' }}>
                  <div className="attendance-form-section-title">Advance Configuration</div>
                  <div className="attendance-form-grid">
                    <div className="attendance-form-group">
                      <label htmlFor="adv-amount">Total Advance</label>
                      <input 
                        id="adv-amount"
                        className="attendance-input" 
                        type="number" 
                        name="advance_amount" 
                        value={formData.advance_amount} 
                        onChange={handleInputChange} 
                        required 
                        placeholder="Enter total advance" 
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="adv-deduction">Monthly Installment</label>
                      <input 
                        id="adv-deduction"
                        className="attendance-input" 
                        type="number" 
                        name="monthly_deduction" 
                        value={formData.monthly_deduction} 
                        onChange={handleInputChange} 
                        required 
                        placeholder="Deduction per month" 
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="adv-from">Deduct From</label>
                      <input 
                        id="adv-from"
                        className="attendance-input" 
                        type="month" 
                        name="deduct_from" 
                        value={formData.deduct_from} 
                        onChange={handleInputChange} 
                        required
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="adv-to">Deduct To</label>
                      <input 
                        id="adv-to"
                        className="attendance-input" 
                        type="month" 
                        name="deduct_to" 
                        value={formData.deduct_to} 
                        onChange={handleInputChange} 
                      />
                    </div>
                    <div className="attendance-form-group full-width">
                      <label htmlFor="adv-reason">Reason</label>
                      <input 
                        id="adv-reason"
                        className="attendance-input" 
                        name="reason" 
                        value={formData.reason} 
                        onChange={handleInputChange} 
                        placeholder="Loan / Festival Advance / Medical advance reason details" 
                      />
                    </div>
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
