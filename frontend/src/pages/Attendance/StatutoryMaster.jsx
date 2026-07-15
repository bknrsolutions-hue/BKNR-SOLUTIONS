import React, { useState, useEffect } from 'react';
import { 
  Plus, Edit2, X, CheckCircle, AlertCircle, ShieldAlert 
} from 'lucide-react';
import './Attendance.css';

export default function StatutoryMaster({ theme }) {
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selectedRow, setSelectedRow] = useState(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    id: '',
    employee_id: '',
    employee_name: '',
    department: '',
    applicable_from: '',
    pf_applicable: 'YES',
    uan_number: '',
    pf_employee_percent: 12.0,
    pf_employer_percent: 12.0,
    esi_applicable: 'NO',
    esi_number: '',
    esi_employee_percent: 0.75,
    esi_employer_percent: 3.25,
    pt_applicable: 'NO',
    pt_amount: 0.0,
    lwf_applicable: 'NO',
    lwf_amount: 0.0
  });

  // Notification State
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async (successMsg = null) => {
    try {
      const res = await fetch('/attendance/tax-master?format=json');
      const data = await res.json();
      if (data.status === 'success') {
        setRecords(data.records || []);
        if (successMsg) showNotification(successMsg, 'success');
      }
    } catch (e) {
      showNotification('❌ Failed to fetch statutory logs!', 'danger');
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
        uan_number: emp.uan_number || ''
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        employee_id: '',
        employee_name: '',
        department: '',
        uan_number: ''
      }));
    }
  };

  const openForm = (editMode = false, rowData = null) => {
    if (editMode && rowData) {
      setIsEditMode(true);
      fetch(`/attendance/tax-master/edit/${rowData.id}?format=json`)
        .then(res => res.json())
        .then(data => {
          const editItem = data.edit_data;
          if (editItem) {
            setFormData({
              id: editItem.id,
              employee_id: editItem.employee_id,
              employee_name: editItem.employee_name,
              department: editItem.department || '',
              applicable_from: editItem.applicable_from ? editItem.applicable_from.substring(0, 7) : '',
              pf_applicable: editItem.pf_applicable ? 'YES' : 'NO',
              uan_number: editItem.uan_number || '',
              pf_employee_percent: editItem.pf_employee_percent,
              pf_employer_percent: editItem.pf_employer_percent,
              esi_applicable: editItem.esi_applicable ? 'YES' : 'NO',
              esi_number: editItem.esi_number || '',
              esi_employee_percent: editItem.esi_employee_percent,
              esi_employer_percent: editItem.esi_employer_percent,
              pt_applicable: editItem.pt_applicable ? 'YES' : 'NO',
              pt_amount: editItem.pt_amount,
              lwf_applicable: editItem.lwf_applicable ? 'YES' : 'NO',
              lwf_amount: editItem.lwf_employee_amount
            });
            setIsModalOpen(true);
          }
        })
        .catch(() => showNotification('❌ Failed to fetch statutory config details!', 'danger'));
    } else {
      setIsEditMode(false);
      setFormData({
        id: '',
        employee_id: '',
        employee_name: '',
        department: '',
        applicable_from: '',
        pf_applicable: 'YES',
        uan_number: '',
        pf_employee_percent: 12.0,
        pf_employer_percent: 12.0,
        esi_applicable: 'NO',
        esi_number: '',
        esi_employee_percent: 0.75,
        esi_employer_percent: 3.25,
        pt_applicable: 'NO',
        pt_amount: 0.0,
        lwf_applicable: 'NO',
        lwf_amount: 0.0
      });
      setIsModalOpen(true);
    }
  };

  const closeForm = () => {
    setIsModalOpen(false);
    setIsEditMode(false);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const confirmSave = window.confirm(`Confirm Setup?\nAre you sure you want to save statutory configurations?`);
    if (!confirmSave) return;

    try {
      const url = isEditMode 
        ? `/attendance/payroll/statutory/update/${formData.id}?format=json` 
        : `/attendance/payroll/statutory/save?format=json`;

      const payload = new URLSearchParams();
      Object.keys(formData).forEach(key => {
        if (formData[key] !== null && formData[key] !== undefined) {
          payload.append(key, formData[key]);
        }
      });

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payload.toString()
      });

      const data = await res.json();
      if (data.status === 'success') {
        closeForm();
        loadData(data.message || '✅ Statutory master configured successfully!');
      } else {
        showNotification(data.message || '❌ Failed to save statutory config!', 'danger');
      }
    } catch (err) {
      showNotification('❌ Network error saving statutory configuration!', 'danger');
    }
  };

  // Format month to short display e.g. Jul-2026
  const formatApplicableMonth = (val) => {
    if (!val) return '-';
    try {
      const d = new Date(val);
      return d.toLocaleString('default', { month: 'short', year: 'numeric' });
    } catch (e) {
      return val;
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
          <h1>Statutory Master</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            Configure and audit employee PF, ESI, and other corporate statutory deductions
          </p>
        </div>
        <div className="attendance-page-header-actions">
          <button className="attendance-btn attendance-btn-primary" onClick={() => openForm(false)}>
            <Plus size={16} /> CONFIGURE
          </button>
        </div>
      </div>

      {/* STATUTORY RECORDS TABLE */}
      <div className="attendance-table-container">
        <div className="attendance-table-wrapper">
          <table className="attendance-table">
            <thead>
              <tr>
                <th style={{ width: '110px' }}>Emp ID</th>
                <th style={{ width: '180px' }}>Name</th>
                <th style={{ width: '150px' }}>Dept</th>
                <th style={{ width: '110px' }}>From</th>
                <th style={{ width: '90px' }}>PF</th>
                <th style={{ width: '150px' }}>UAN</th>
                <th style={{ width: '90px' }}>ESI</th>
                <th style={{ width: '100px', textAlign: 'right' }}>PT</th>
                <th style={{ width: '100px', textAlign: 'right' }}>LWF</th>
                <th style={{ width: '80px', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id}>
                  <td style={{ color: 'var(--att-accent)', fontWeight: '800' }}>{r.employee_id}</td>
                  <td style={{ fontWeight: '700' }}>{r.employee_name}</td>
                  <td>{r.department || '-'}</td>
                  <td>{formatApplicableMonth(r.applicable_from)}</td>
                  <td>
                    <span className={`attendance-badge ${r.pf_applicable ? 'attendance-badge-success' : 'attendance-badge-danger'}`}>
                      {r.pf_applicable ? 'YES' : 'NO'}
                    </span>
                  </td>
                  <td style={{ fontWeight: '700' }}>{r.uan_number || '-'}</td>
                  <td>
                    <span className={`attendance-badge ${r.esi_applicable ? 'attendance-badge-success' : 'attendance-badge-danger'}`}>
                      {r.esi_applicable ? 'YES' : 'NO'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>₹{parseFloat(r.pt_amount || 0).toFixed(2)}</td>
                  <td style={{ textAlign: 'right' }}>₹{parseFloat(r.lwf_employee_amount || 0).toFixed(2)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button 
                      className="attendance-btn attendance-btn-secondary" 
                      style={{ padding: '4px 8px' }} 
                      onClick={() => openForm(true, r)}
                      aria-label={`Configure statutory setting for ${r.employee_name}`}
                    >
                      <Edit2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
              {!records.length && (
                <tr>
                  <td colSpan="10" className="attendance-empty">
                    No statutory configurations found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* STATUTORY SETUP MODAL */}
      {isModalOpen && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content" style={{ maxWidth: '1000px' }}>
            <div className="attendance-modal-header">
              <h2>{isEditMode ? 'Edit Statutory Configuration' : 'Employee Statutory Setup'}</h2>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="attendance-modal-body">
                
                {/* section: Employee Info */}
                <div className="section-block">
                  <div className="attendance-form-section-title">Employee Information</div>
                  <div className="attendance-form-grid">
                    <div className="attendance-form-group">
                      <label htmlFor="stat-emp-select">Employee ID</label>
                      {isEditMode ? (
                        <input 
                          id="stat-emp-select"
                          className="attendance-input" 
                          name="employee_id" 
                          value={formData.employee_id} 
                          readOnly 
                        />
                      ) : (
                        <select 
                          id="stat-emp-select"
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
                      )}
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="stat-emp-name">Name</label>
                      <input 
                        id="stat-emp-name"
                        className="attendance-input" 
                        name="employee_name" 
                        value={formData.employee_name} 
                        readOnly 
                        required 
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="stat-emp-dept">Department</label>
                      <input 
                        id="stat-emp-dept"
                        className="attendance-input" 
                        name="department" 
                        value={formData.department} 
                        readOnly 
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="stat-applicable">Applicable From</label>
                      <input 
                        id="stat-applicable"
                        className="attendance-input" 
                        type="month" 
                        name="applicable_from" 
                        value={formData.applicable_from} 
                        onChange={handleInputChange} 
                        required 
                      />
                    </div>
                  </div>
                </div>

                {/* section: PF Configuration */}
                <div className="section-block">
                  <div className="attendance-form-section-title">PF Configuration</div>
                  <div className="attendance-form-grid">
                    <div className="attendance-form-group">
                      <label htmlFor="stat-pf-app">PF Applicable</label>
                      <select 
                        id="stat-pf-app"
                        className="attendance-select" 
                        name="pf_applicable" 
                        value={formData.pf_applicable} 
                        onChange={handleInputChange}
                      >
                        <option value="YES">YES</option>
                        <option value="NO">NO</option>
                      </select>
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="stat-uan">UAN Number</label>
                      <input 
                        id="stat-uan"
                        className="attendance-input" 
                        name="uan_number" 
                        value={formData.uan_number} 
                        onChange={handleInputChange} 
                        placeholder="Enter UAN"
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="stat-pf-employee">Employee PF %</label>
                      <input 
                        id="stat-pf-employee"
                        className="attendance-input" 
                        type="number" 
                        step="0.01" 
                        name="pf_employee_percent" 
                        value={formData.pf_employee_percent} 
                        onChange={handleInputChange} 
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="stat-pf-employer">Employer PF %</label>
                      <input 
                        id="stat-pf-employer"
                        className="attendance-input" 
                        type="number" 
                        step="0.01" 
                        name="pf_employer_percent" 
                        value={formData.pf_employer_percent} 
                        onChange={handleInputChange} 
                      />
                    </div>
                  </div>
                </div>

                {/* section: ESI Configuration */}
                <div className="section-block">
                  <div className="attendance-form-section-title">ESI Configuration</div>
                  <div className="attendance-form-grid">
                    <div className="attendance-form-group">
                      <label htmlFor="stat-esi-app">ESI Applicable</label>
                      <select 
                        id="stat-esi-app"
                        className="attendance-select" 
                        name="esi_applicable" 
                        value={formData.esi_applicable} 
                        onChange={handleInputChange}
                      >
                        <option value="YES">YES</option>
                        <option value="NO">NO</option>
                      </select>
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="stat-esi-num">ESI Number</label>
                      <input 
                        id="stat-esi-num"
                        className="attendance-input" 
                        name="esi_number" 
                        value={formData.esi_number} 
                        onChange={handleInputChange} 
                        placeholder="Enter ESI ID"
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="stat-esi-employee">Employee ESI %</label>
                      <input 
                        id="stat-esi-employee"
                        className="attendance-input" 
                        type="number" 
                        step="0.01" 
                        name="esi_employee_percent" 
                        value={formData.esi_employee_percent} 
                        onChange={handleInputChange} 
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="stat-esi-employer">Employer ESI %</label>
                      <input 
                        id="stat-esi-employer"
                        className="attendance-input" 
                        type="number" 
                        step="0.01" 
                        name="esi_employer_percent" 
                        value={formData.esi_employer_percent} 
                        onChange={handleInputChange} 
                      />
                    </div>
                  </div>
                </div>

                {/* section: PT / LWF */}
                <div className="section-block">
                  <div className="attendance-form-section-title">PT / LWF</div>
                  <div className="attendance-form-grid">
                    <div className="attendance-form-group">
                      <label htmlFor="stat-pt-app">PT Applicable</label>
                      <select 
                        id="stat-pt-app"
                        className="attendance-select" 
                        name="pt_applicable" 
                        value={formData.pt_applicable} 
                        onChange={handleInputChange}
                      >
                        <option value="YES">YES</option>
                        <option value="NO">NO</option>
                      </select>
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="stat-pt-amt">PT Amount (Monthly)</label>
                      <input 
                        id="stat-pt-amt"
                        className="attendance-input" 
                        type="number" 
                        name="pt_amount" 
                        value={formData.pt_amount} 
                        onChange={handleInputChange} 
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="stat-lwf-app">LWF Applicable</label>
                      <select 
                        id="stat-lwf-app"
                        className="attendance-select" 
                        name="lwf_applicable" 
                        value={formData.lwf_applicable} 
                        onChange={handleInputChange}
                      >
                        <option value="YES">YES</option>
                        <option value="NO">NO</option>
                      </select>
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="stat-lwf-amt">LWF Employee Amount</label>
                      <input 
                        id="stat-lwf-amt"
                        className="attendance-input" 
                        type="number" 
                        name="lwf_amount" 
                        value={formData.lwf_amount} 
                        onChange={handleInputChange} 
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
                  {isEditMode ? 'Update' : 'Save Configuration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
