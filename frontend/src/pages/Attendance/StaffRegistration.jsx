import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, UserCheck, MoreVertical, Edit2, Printer, 
  FileText, FileSpreadsheet, Ban, CheckCircle, AlertCircle, X 
} from 'lucide-react';
import { sessionFetch } from '../../utils/sessionFetch';
import './Attendance.css';

const getRejoinDate = (employee) => {
  const isRejoined = String(employee.status || '').toUpperCase() === 'ACTIVE' && employee.resignation_date;
  return isRejoined ? (employee.rejoin_date || employee.date || '-') : '-';
};

export default function StaffRegistration({ theme }) {
  const [employees, setEmployees] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [sites, setSites] = useState([]);
  const [nextEmployeeId, setNextEmployeeId] = useState('');
  const [selectedRow, setSelectedRow] = useState(null);
  
  // Filter States
  const [searchID, setSearchID] = useState('');
  const [searchName, setSearchName] = useState('');
  const [searchLocation, setSearchLocation] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeTab, setActiveTab] = useState('personal');
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Form State
  const [formData, setFormData] = useState({
    id: '',
    employee_id: '',
    employee_name: '',
    gender: 'Male',
    dob: '',
    blood_group: '',
    marital_status: 'Single',
    production_at: '',
    designation: '',
    department: '',
    employee_type: 'PERMANENT',
    contractor_name: '',
    joining_date: '',
    reporting_to: '',
    status: 'ACTIVE',
    resignation_date: '',
    current_salary: 0.0,
    basic_salary: 0.0,
    hra: 0.0,
    conveyance_allowance: 0.0,
    other_expenses: 0.0,
    tds: 0.0,
    bank_name: '',
    branch_name: '',
    account_holder_name: '',
    account_number: '',
    ifsc_code: '',
    pan_number: '',
    aadhar_number: '',
    uan_number: '',
    mobile: '',
    official_email: '',
    personal_email: '',
    emergency_name: '',
    emergency_mobile: '',
    present_address: '',
    permanent_address: '',
    skills: '',
    about: '',
    location: ''
  });

  // Validation States
  const [panValid, setPanValid] = useState(null);
  const [ifscValid, setIfscValid] = useState(null);
  
  // Notification State
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async () => {
    try {
      const res = await sessionFetch('/attendance/employee/register?format=json');
      const data = await res.json();
      if (data.status === 'success') {
        setEmployees(data.employees || []);
        setContractors(data.contractors || []);
        setSites(data.sites || []);
        setNextEmployeeId(data.next_employee_id || '');
      }
    } catch (e) {
      showNotification('❌ Failed to fetch database index!', 'danger');
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

  // Update Gross Salary automatically on sub-salaries changes
  useEffect(() => {
    const total = 
      parseFloat(formData.basic_salary || 0) + 
      parseFloat(formData.hra || 0) + 
      parseFloat(formData.conveyance_allowance || 0) + 
      parseFloat(formData.other_expenses || 0);
    setFormData(prev => ({ ...prev, current_salary: total.toFixed(2) }));
  }, [formData.basic_salary, formData.hra, formData.conveyance_allowance, formData.other_expenses]);

  // Validation Regex
  const validatePan = (val) => {
    const upper = val.toUpperCase().trim();
    if (upper === '') return null;
    return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(upper);
  };

  const validateIfsc = (val) => {
    const upper = val.toUpperCase().trim();
    if (upper === '') return null;
    return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(upper);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    let computedVal = value;
    
    if (name === 'pan_number') {
      computedVal = value.toUpperCase();
      setPanValid(validatePan(computedVal));
    }
    if (name === 'ifsc_code') {
      computedVal = value.toUpperCase();
      setIfscValid(validateIfsc(computedVal));
    }

    setFormData(prev => ({ ...prev, [name]: computedVal }));
  };

  const openForm = (editMode = false) => {
    if (editMode && selectedRow) {
      setIsEditMode(true);
      setFormData({ ...selectedRow });
      setPanValid(validatePan(selectedRow.pan_number || ''));
      setIfscValid(validateIfsc(selectedRow.ifsc_code || ''));
    } else {
      setIsEditMode(false);
      setFormData({
        id: '',
        employee_id: nextEmployeeId,
        employee_name: '',
        gender: 'Male',
        dob: '',
        blood_group: '',
        marital_status: 'Single',
        production_at: '',
        designation: '',
        department: '',
        employee_type: 'PERMANENT',
        contractor_name: '',
        joining_date: '',
        reporting_to: '',
        status: 'ACTIVE',
        resignation_date: '',
        current_salary: 0.0,
        basic_salary: 0.0,
        hra: 0.0,
        conveyance_allowance: 0.0,
        other_expenses: 0.0,
        tds: 0.0,
        bank_name: '',
        branch_name: '',
        account_holder_name: '',
        account_number: '',
        ifsc_code: '',
        pan_number: '',
        aadhar_number: '',
        uan_number: '',
        mobile: '',
        official_email: '',
        personal_email: '',
        emergency_name: '',
        emergency_mobile: '',
        present_address: '',
        permanent_address: '',
        skills: '',
        about: '',
        location: ''
      });
      setPanValid(null);
      setIfscValid(null);
    }
    setActiveTab('personal');
    setIsModalOpen(true);
  };

  const closeForm = () => {
    setIsModalOpen(false);
    setIsEditMode(false);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (panValid === false) {
      showNotification('❌ Invalid PAN Card Format!', 'danger');
      return;
    }
    if (ifscValid === false) {
      showNotification('❌ Invalid IFSC Code Format!', 'danger');
      return;
    }

    const confirmSave = window.confirm(`Confirm Save?\nAre you sure you want to save this employee record?`);
    if (!confirmSave) return;

    try {
      const url = isEditMode ? `/attendance/employee/update/${formData.id}?format=json` : `/attendance/employee/save?format=json`;
      
      const payload = new URLSearchParams();
      Object.keys(formData).forEach(key => {
        if (formData[key] !== null && formData[key] !== undefined) {
          payload.append(key, formData[key]);
        }
      });

      const res = await sessionFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: payload.toString()
      });

      const data = await res.json();
      if (data.status === 'success') {
        showNotification(data.message || '✅ Record saved successfully!', 'success');
        closeForm();
        loadData();
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to save record!', 'danger');
      }
    } catch (err) {
      showNotification('❌ API Network Error occurred!', 'danger');
    }
  };

  const editSelected = () => {
    if (selectedRow) {
      openForm(true);
      setMenuOpen(false);
    }
  };

  const printSelected = () => {
    if (selectedRow) {
      window.open(`/attendance/employee/print/${selectedRow.employee_id}`, '_blank');
      setMenuOpen(false);
    }
  };

  const exportPDF = () => {
    if (selectedRow) {
      window.open(`/attendance/employee/export/pdf/${selectedRow.employee_id}`, '_blank');
      setMenuOpen(false);
    }
  };

  const exportExcel = () => {
    window.location.assign('/attendance/employee/export/excel');
    setMenuOpen(false);
  };

  const deleteSelected = async () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    const confirmDelete = window.confirm(`Cancel this employee record?`);
    if (!confirmDelete) return;

    try {
      const res = await sessionFetch(`/attendance/employee/delete/${selectedRow.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.status === 'ok') {
        showNotification('🗑️ Employee Purged Successfully!', 'success');
        loadData();
        setSelectedRow(null);
      } else {
        showNotification(data.message || 'Failed to cancel record!', 'danger');
      }
    } catch (e) {
      showNotification('Network error occurred during cancellation!', 'danger');
    }
  };

  const filteredEmployees = employees.filter(emp => {
    const matchID = (emp.employee_id || '').toUpperCase().includes(searchID.toUpperCase());
    const matchName = (emp.employee_name || '').toUpperCase().includes(searchName.toUpperCase());
    const matchLoc = (emp.production_at || '').toUpperCase().includes(searchLocation.toUpperCase());
    return matchID && matchName && matchLoc;
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
          <h1>Employee Register Master</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            Employee Profile & statutory records database
          </p>
        </div>
        <div className="attendance-page-header-actions">
          <button className="attendance-btn attendance-btn-primary" onClick={() => openForm(false)}>
            <Plus size={16} /> NEW REGISTRATION
          </button>
        </div>
      </div>

      {/* FILTER CONTROLS */}
      <div className="attendance-filters-bar">
        <div className="attendance-filter-group">
          <label htmlFor="search-id">Search Employee ID</label>
          <input 
            id="search-id"
            className="attendance-input" 
            type="text" 
            placeholder="Type ID..." 
            value={searchID} 
            onChange={(e) => setSearchID(e.target.value)} 
          />
        </div>
        <div className="attendance-filter-group">
          <label htmlFor="search-name">Search Full Name</label>
          <input 
            id="search-name"
            className="attendance-input" 
            type="text" 
            placeholder="Type Name..." 
            value={searchName} 
            onChange={(e) => setSearchName(e.target.value)} 
          />
        </div>
        <div className="attendance-filter-group">
          <label htmlFor="search-loc">Search Location</label>
          <input 
            id="search-loc"
            className="attendance-input" 
            type="text" 
            placeholder="Type Location..." 
            value={searchLocation} 
            onChange={(e) => setSearchLocation(e.target.value)} 
          />
        </div>
      </div>

      {/* INDEX TABLE TITLE / THREE DOTS ACTION BAR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '13px', fontWeight: '800', margin: 0, textTransform: 'uppercase', color: 'var(--att-heading)' }}>
          Database Index ({filteredEmployees.length} Records)
        </h3>
        
        {selectedRow && (
          <div className="attendance-actions-cell" ref={dropdownRef}>
            <button 
              className="attendance-action-dots-btn" 
              onClick={() => setMenuOpen(!menuOpen)}
              style={{ display: 'flex', alignItems: 'center', gap: '4px', border: '1px solid var(--att-border)', padding: '6px 12px', borderRadius: '6px' }}
            >
              <MoreVertical size={16} /> Row Actions
            </button>
            {menuOpen && (
              <div className="attendance-dropdown-menu" style={{ right: 0, top: '35px', width: '185px' }}>
                <button className="attendance-dropdown-item" onClick={editSelected}><Edit2 size={14} /> Edit</button>
                <button className="attendance-dropdown-item" onClick={printSelected}><Printer size={14} /> Print View</button>
                <button className="attendance-dropdown-item" onClick={exportPDF}><FileText size={14} style={{ color: 'var(--att-danger)' }} /> Download PDF</button>
                <button className="attendance-dropdown-item" onClick={exportExcel}><FileSpreadsheet size={14} style={{ color: 'var(--att-success)' }} /> Export Excel</button>
                <button 
                  className="attendance-dropdown-item" 
                  onClick={deleteSelected}
                  style={{ color: 'var(--att-danger)', borderTop: '1px solid var(--att-border)' }}
                >
                  <Ban size={14} /> Cancel Record
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* EMPLOYEE LIST TABLE */}
      <div className="attendance-table-container">
        <div className="attendance-table-wrapper">
          <table className="attendance-table">
            <thead>
              <tr>
                <th className="sticky-col" style={{ width: '110px' }}>Emp ID</th>
                <th style={{ width: '160px' }}>Full Name</th>
                <th style={{ width: '90px', textalign: 'center' }}>Status</th>
                <th style={{ width: '150px' }}>Prod At (Plant)</th>
                <th style={{ width: '150px' }}>Designation</th>
                <th style={{ width: '150px' }}>Department</th>
                <th style={{ width: '120px' }}>Mobile</th>
                <th style={{ width: '180px' }}>Official Email</th>
                <th style={{ width: '110px' }}>Emp Type</th>
                <th style={{ width: '110px' }}>Joining Date</th>
                <th style={{ width: '150px' }}>Reporting To</th>
                <th style={{ width: '110px', textAlign: 'right' }}>Gross Total</th>
                <th style={{ width: '100px', textAlign: 'right' }}>Basic</th>
                <th style={{ width: '100px', textAlign: 'right' }}>HRA</th>
                <th style={{ width: '100px', textAlign: 'right' }}>Conveyance</th>
                <th style={{ width: '100px', textAlign: 'right' }}>Other Exp.</th>
                <th style={{ width: '90px', textAlign: 'right' }}>TDS (%)</th>
                <th style={{ width: '160px' }}>Bank Name</th>
                <th style={{ width: '160px' }}>Account No</th>
                <th style={{ width: '120px' }}>IFSC Code</th>
                <th style={{ width: '120px' }}>PAN No</th>
                <th style={{ width: '130px' }}>Aadhar No</th>
                <th style={{ width: '130px' }}>UAN Number</th>
                <th style={{ width: '90px' }}>Gender</th>
                <th style={{ width: '110px' }}>DOB</th>
                <th style={{ width: '90px' }}>Blood Group</th>
                <th style={{ width: '110px' }}>Marital Status</th>
                <th style={{ width: '130px' }}>Emergency Contact</th>
                <th style={{ width: '110px' }}>Resign Date</th>
                <th style={{ width: '110px' }}>Rejoin Date</th>
                <th style={{ width: '160px' }}>Contractor</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map(emp => (
                <tr 
                  key={emp.employee_id} 
                  className={selectedRow?.employee_id === emp.employee_id ? 'selected' : ''}
                  onClick={() => setSelectedRow(emp)}
                  onDoubleClick={() => { setSelectedRow(emp); openForm(true); }}
                >
                  <td className="sticky-col" style={{ fontWeight: '800', color: 'var(--att-accent)' }}>{emp.employee_id}</td>
                  <td style={{ fontWeight: '700' }}>{emp.employee_name}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`attendance-badge ${emp.status === 'ACTIVE' ? 'attendance-badge-success' : 'attendance-badge-danger'}`}>
                      {emp.status}
                    </span>
                  </td>
                  <td style={{ fontWeight: '700' }}>{emp.production_at || '-'}</td>
                  <td>{emp.designation || '-'}</td>
                  <td>{emp.department || '-'}</td>
                  <td>{emp.mobile || '-'}</td>
                  <td style={{ color: 'var(--att-accent)' }}>{emp.official_email || '-'}</td>
                  <td>{emp.employee_type || '-'}</td>
                  <td>{emp.joining_date || '-'}</td>
                  <td>{emp.reporting_to || '-'}</td>
                  <td style={{ fontWeight: '800', color: 'var(--att-success)', textAlign: 'right' }}>{emp.current_salary}</td>
                  <td style={{ textAlign: 'right' }}>{emp.basic_salary}</td>
                  <td style={{ textAlign: 'right' }}>{emp.hra}</td>
                  <td style={{ textAlign: 'right' }}>{emp.conveyance_allowance}</td>
                  <td style={{ textAlign: 'right' }}>{emp.other_expenses}</td>
                  <td style={{ textAlign: 'right' }}>{emp.tds}</td>
                  <td>{emp.bank_name || '-'}</td>
                  <td style={{ fontWeight: '700' }}>{emp.account_number || '-'}</td>
                  <td>{emp.ifsc_code || '-'}</td>
                  <td>{emp.pan_number || '-'}</td>
                  <td>{emp.aadhar_number || '-'}</td>
                  <td>{emp.uan_number || '-'}</td>
                  <td>{emp.gender || '-'}</td>
                  <td>{emp.dob || '-'}</td>
                  <td>{emp.blood_group || '-'}</td>
                  <td>{emp.marital_status || '-'}</td>
                  <td>{emp.emergency_mobile || '-'}</td>
                  <td style={{ color: 'var(--att-danger)' }}>{emp.resignation_date || '-'}</td>
                  <td style={{ color: 'var(--att-accent)', fontWeight: 700 }}>{getRejoinDate(emp)}</td>
                  <td>{emp.contractor_name || '-'}</td>
                </tr>
              ))}
              {!filteredEmployees.length && (
                <tr>
                  <td colSpan="31" className="attendance-empty">
                    No employee records match your search criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* REGISTRATION & EDIT MODAL */}
      {isModalOpen && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content" style={{ maxWidth: '1000px' }}>
            <div className="attendance-modal-header">
              <h2>
                {isEditMode ? `Edit Employee Record: ${formData.employee_name} (${formData.employee_id})` : 'New Employee Master Entry'}
              </h2>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            {/* Form tab header navigation */}
            <div className="attendance-tabs" style={{ padding: '0 24px', background: 'var(--att-card)' }}>
              <button 
                type="button" 
                className={`attendance-tab-btn ${activeTab === 'personal' ? 'active' : ''}`}
                onClick={() => setActiveTab('personal')}
              >
                1. Personal & Contact
              </button>
              <button 
                type="button" 
                className={`attendance-tab-btn ${activeTab === 'work' ? 'active' : ''}`}
                onClick={() => setActiveTab('work')}
              >
                2. Employment settings
              </button>
              <button 
                type="button" 
                className={`attendance-tab-btn ${activeTab === 'salary' ? 'active' : ''}`}
                onClick={() => setActiveTab('salary')}
              >
                3. Compensation Structure
              </button>
              <button 
                type="button" 
                className={`attendance-tab-btn ${activeTab === 'bank' ? 'active' : ''}`}
                onClick={() => setActiveTab('bank')}
              >
                4. Bank & statutory IDs
              </button>
            </div>

            <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div className="attendance-modal-body">
                {activeTab === 'personal' && (
                  <div className="attendance-form-grid">
                    <div className="attendance-form-section-title">Primary Info</div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-emp-id">Employee ID</label>
                      <input 
                        id="reg-emp-id"
                        className="attendance-input" 
                        name="employee_id" 
                        value={formData.employee_id} 
                        readOnly 
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-emp-name">Full Name *</label>
                      <input 
                        id="reg-emp-name"
                        className="attendance-input" 
                        name="employee_name" 
                        value={formData.employee_name} 
                        onChange={handleInputChange} 
                        required 
                        maxLength={100}
                        placeholder="Enter full name"
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-gender">Gender</label>
                      <select 
                        id="reg-gender"
                        className="attendance-select" 
                        name="gender" 
                        value={formData.gender} 
                        onChange={handleInputChange}
                      >
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                      </select>
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-dob">Date of Birth</label>
                      <input 
                        id="reg-dob"
                        className="attendance-input" 
                        name="dob" 
                        type="date" 
                        value={formData.dob || ''} 
                        onChange={handleInputChange} 
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-blood">Blood Group</label>
                      <select 
                        id="reg-blood"
                        className="attendance-select" 
                        name="blood_group" 
                        value={formData.blood_group || ''} 
                        onChange={handleInputChange}
                      >
                        <option value="">Select</option>
                        {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => (
                          <option key={bg} value={bg}>{bg}</option>
                        ))}
                      </select>
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-marital">Marital Status</label>
                      <select 
                        id="reg-marital"
                        className="attendance-select" 
                        name="marital_status" 
                        value={formData.marital_status} 
                        onChange={handleInputChange}
                      >
                        <option value="Single">Single</option>
                        <option value="Married">Married</option>
                      </select>
                    </div>

                    <div className="attendance-form-section-title">Contact & Addresses</div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-mobile">Mobile No *</label>
                      <input 
                        id="reg-mobile"
                        className="attendance-input" 
                        name="mobile" 
                        value={formData.mobile || ''} 
                        onChange={handleInputChange} 
                        required 
                        pattern="[0-9]{10}" 
                        maxLength={10} 
                        placeholder="10 digit number"
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-off-email">Official Email</label>
                      <input 
                        id="reg-off-email"
                        className="attendance-input" 
                        name="official_email" 
                        type="email" 
                        value={formData.official_email || ''} 
                        onChange={handleInputChange} 
                        placeholder="name@company.com"
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-per-email">Personal Email</label>
                      <input 
                        id="reg-per-email"
                        className="attendance-input" 
                        name="personal_email" 
                        type="email" 
                        value={formData.personal_email || ''} 
                        onChange={handleInputChange} 
                        placeholder="personal@email.com"
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-emergency-name">Emergency Contact Name</label>
                      <input 
                        id="reg-emergency-name"
                        className="attendance-input" 
                        name="emergency_name" 
                        value={formData.emergency_name || ''} 
                        onChange={handleInputChange} 
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-emergency-mobile">Emergency Mobile</label>
                      <input 
                        id="reg-emergency-mobile"
                        className="attendance-input" 
                        name="emergency_mobile" 
                        value={formData.emergency_mobile || ''} 
                        onChange={handleInputChange} 
                        pattern="[0-9]{10}" 
                        maxLength={10}
                      />
                    </div>
                    <div className="attendance-form-group full-width">
                      <label htmlFor="reg-present-addr">Present Address</label>
                      <textarea 
                        id="reg-present-addr"
                        className="attendance-input" 
                        name="present_address" 
                        value={formData.present_address || ''} 
                        onChange={handleInputChange} 
                        style={{ minHeight: '60px' }}
                      />
                    </div>
                    <div className="attendance-form-group full-width">
                      <label htmlFor="reg-permanent-addr">Permanent Address</label>
                      <textarea 
                        id="reg-permanent-addr"
                        className="attendance-input" 
                        name="permanent_address" 
                        value={formData.permanent_address || ''} 
                        onChange={handleInputChange} 
                        style={{ minHeight: '60px' }}
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'work' && (
                  <div className="attendance-form-grid">
                    <div className="attendance-form-section-title">Employment & Plant Assignment</div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-prod-at">Production At (Plant) *</label>
                      <select 
                        id="reg-prod-at"
                        className="attendance-select" 
                        name="production_at" 
                        value={formData.production_at} 
                        onChange={handleInputChange} 
                        required
                      >
                        <option value="">-- Select Plant Location --</option>
                        {sites.map(s => (
                          <option key={s.production_at} value={s.production_at}>{s.production_at}</option>
                        ))}
                      </select>
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-desig">Designation</label>
                      <input 
                        id="reg-desig"
                        className="attendance-input" 
                        name="designation" 
                        value={formData.designation || ''} 
                        onChange={handleInputChange} 
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-dept">Department</label>
                      <input 
                        id="reg-dept"
                        className="attendance-input" 
                        name="department" 
                        value={formData.department || ''} 
                        onChange={handleInputChange} 
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-emp-type">Employee Type</label>
                      <select 
                        id="reg-emp-type"
                        className="attendance-select" 
                        name="employee_type" 
                        value={formData.employee_type} 
                        onChange={handleInputChange}
                      >
                        <option value="PERMANENT">PERMANENT</option>
                        <option value="TEMPORARY">TEMPORARY</option>
                        <option value="CONTRACT">CONTRACT</option>
                      </select>
                    </div>

                    {formData.employee_type === 'CONTRACT' && (
                      <div className="attendance-form-group">
                        <label htmlFor="reg-contractor">Contractor Name</label>
                        <select 
                          id="reg-contractor"
                          className="attendance-select" 
                          name="contractor_name" 
                          value={formData.contractor_name || ''} 
                          onChange={handleInputChange}
                        >
                          <option value="">-- Select Contractor --</option>
                          {contractors.map(c => (
                            <option key={c.contractor_name} value={c.contractor_name}>{c.contractor_name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="attendance-form-group">
                      <label htmlFor="reg-join">Joining Date</label>
                      <input 
                        id="reg-join"
                        className="attendance-input" 
                        name="joining_date" 
                        type="date" 
                        value={formData.joining_date || ''} 
                        onChange={handleInputChange} 
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-report-to">Reporting To</label>
                      <input 
                        id="reg-report-to"
                        className="attendance-input" 
                        name="reporting_to" 
                        value={formData.reporting_to || ''} 
                        onChange={handleInputChange} 
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-status">Current Status</label>
                      <select 
                        id="reg-status"
                        className="attendance-select" 
                        name="status" 
                        value={formData.status} 
                        onChange={handleInputChange}
                      >
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="RESIGNED">RESIGNED</option>
                      </select>
                    </div>

                    {formData.status === 'RESIGNED' && (
                      <div className="attendance-form-group">
                        <label htmlFor="reg-resign">Resignation Date</label>
                        <input 
                          id="reg-resign"
                          className="attendance-input" 
                          name="resignation_date" 
                          type="date" 
                          value={formData.resignation_date || ''} 
                          onChange={handleInputChange} 
                        />
                      </div>
                    )}

                    <div className="attendance-form-section-title">Extra Skills & Notes</div>
                    <div className="attendance-form-group full-width">
                      <label htmlFor="reg-skills">Skills</label>
                      <textarea 
                        id="reg-skills"
                        className="attendance-input" 
                        name="skills" 
                        value={formData.skills || ''} 
                        onChange={handleInputChange} 
                        placeholder="e.g. Accounting, Machine Operation, etc."
                        style={{ minHeight: '60px' }}
                      />
                    </div>
                    <div className="attendance-form-group full-width">
                      <label htmlFor="reg-about">About Employee</label>
                      <textarea 
                        id="reg-about"
                        className="attendance-input" 
                        name="about" 
                        value={formData.about || ''} 
                        onChange={handleInputChange} 
                        style={{ minHeight: '60px' }}
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'salary' && (
                  <div className="attendance-form-grid">
                    <div className="attendance-form-section-title">Salary splits & deductions</div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-current-sal">Gross Salary (Total sum of basic+hra+conveyance+other)</label>
                      <input 
                        id="reg-current-sal"
                        className="attendance-input" 
                        name="current_salary" 
                        value={formData.current_salary} 
                        readOnly 
                        style={{ background: 'var(--att-table-header-bg)', fontWeight: '800', color: 'var(--att-success)' }}
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-basic-sal">Basic Salary *</label>
                      <input 
                        id="reg-basic-sal"
                        className="attendance-input" 
                        name="basic_salary" 
                        type="number" 
                        step="0.01" 
                        min="0"
                        value={formData.basic_salary} 
                        onChange={handleInputChange} 
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-hra">H.R.A *</label>
                      <input 
                        id="reg-hra"
                        className="attendance-input" 
                        name="hra" 
                        type="number" 
                        step="0.01" 
                        min="0"
                        value={formData.hra} 
                        onChange={handleInputChange} 
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-conveyance">Conveyance *</label>
                      <input 
                        id="reg-conveyance"
                        className="attendance-input" 
                        name="conveyance_allowance" 
                        type="number" 
                        step="0.01" 
                        min="0"
                        value={formData.conveyance_allowance} 
                        onChange={handleInputChange} 
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-other-exp">Other Allowance *</label>
                      <input 
                        id="reg-other-exp"
                        className="attendance-input" 
                        name="other_expenses" 
                        type="number" 
                        step="0.01" 
                        min="0"
                        value={formData.other_expenses} 
                        onChange={handleInputChange} 
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-tds">TDS Deduction (%)</label>
                      <input 
                        id="reg-tds"
                        className="attendance-input" 
                        name="tds" 
                        type="number" 
                        step="0.01" 
                        min="0" 
                        max="100"
                        value={formData.tds} 
                        onChange={handleInputChange} 
                      />
                    </div>
                  </div>
                )}

                {activeTab === 'bank' && (
                  <div className="attendance-form-grid">
                    <div className="attendance-form-section-title">Corporate Bank details</div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-bank-name">Bank Name</label>
                      <input 
                        id="reg-bank-name"
                        className="attendance-input" 
                        name="bank_name" 
                        value={formData.bank_name || ''} 
                        onChange={handleInputChange} 
                        placeholder="e.g. State Bank of India"
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-branch-name">Branch Name</label>
                      <input 
                        id="reg-branch-name"
                        className="attendance-input" 
                        name="branch_name" 
                        value={formData.branch_name || ''} 
                        onChange={handleInputChange} 
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-acc-holder">Account Holder Name</label>
                      <input 
                        id="reg-acc-holder"
                        className="attendance-input" 
                        name="account_holder_name" 
                        value={formData.account_holder_name || ''} 
                        onChange={handleInputChange} 
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-acc-num">Account Number</label>
                      <input 
                        id="reg-acc-num"
                        className="attendance-input" 
                        name="account_number" 
                        value={formData.account_number || ''} 
                        onChange={handleInputChange} 
                        pattern="[0-9]{9,18}" 
                        placeholder="9 to 18 digits"
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-ifsc">IFSC Code</label>
                      <input 
                        id="reg-ifsc"
                        className={`attendance-input ${ifscValid === true ? 'valid-format' : ifscValid === false ? 'invalid-format' : ''}`}
                        name="ifsc_code" 
                        value={formData.ifsc_code || ''} 
                        onChange={handleInputChange} 
                        placeholder="e.g. SBIN0001234" 
                        maxLength={11}
                      />
                      {ifscValid === false && <span style={{ color: 'var(--att-danger)', fontSize: '10px' }}>Invalid IFSC Format!</span>}
                    </div>

                    <div className="attendance-form-section-title">Government IDs</div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-pan">PAN Card No</label>
                      <input 
                        id="reg-pan"
                        className={`attendance-input ${panValid === true ? 'valid-format' : panValid === false ? 'invalid-format' : ''}`}
                        name="pan_number" 
                        value={formData.pan_number || ''} 
                        onChange={handleInputChange} 
                        placeholder="e.g. ABCDE1234F" 
                        maxLength={10}
                      />
                      {panValid === false && <span style={{ color: 'var(--att-danger)', fontSize: '10px' }}>Invalid PAN Card Format!</span>}
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-aadhar">Aadhar Number</label>
                      <input 
                        id="reg-aadhar"
                        className="attendance-input" 
                        name="aadhar_number" 
                        value={formData.aadhar_number || ''} 
                        onChange={handleInputChange} 
                        pattern="[0-9]{12}" 
                        maxLength={12} 
                        placeholder="12 digits"
                      />
                    </div>
                    <div className="attendance-form-group">
                      <label htmlFor="reg-uan">UAN Number</label>
                      <input 
                        id="reg-uan"
                        className="attendance-input" 
                        name="uan_number" 
                        value={formData.uan_number || ''} 
                        onChange={handleInputChange} 
                        pattern="[0-9]{12}" 
                        maxLength={12} 
                        placeholder="12 digits"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="attendance-modal-footer">
                <button type="button" className="attendance-btn attendance-btn-secondary" onClick={closeForm}>
                  CANCEL
                </button>
                <button type="submit" className="attendance-btn attendance-btn-primary">
                  {isEditMode ? 'UPDATE RECORD' : 'SAVE'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
