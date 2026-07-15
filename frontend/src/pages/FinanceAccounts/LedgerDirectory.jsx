import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, MoreVertical, Ban, X, FolderOpen 
} from 'lucide-react';
import '../Attendance/Attendance.css';

export default function LedgerDirectory({ theme }) {
  const [records, setRecords] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selectedRow, setSelectedRow] = useState(null);
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Form State
  const [formData, setFormData] = useState({
    ledger_name: '',
    ledger_group: '',
    ledger_type: 'ASSET',
    gst_no: '',
    pan_no: '',
    state: 'INR',
    opening_balance: 0.00,
    balance_type: 'DR',
    phone: '',
    address: ''
  });

  // Notification State
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async (successMsg = null) => {
    try {
      const [ledgersRes, groupsRes] = await Promise.all([
        fetch('/finance_accounts/ledgers'),
        fetch('/finance_accounts/groups')
      ]);
      const ledgersData = await ledgersRes.json();
      const groupsData = await groupsRes.json();

      if (ledgersData.success) {
        setRecords(ledgersData.data || []);
      }
      if (groupsData.success) {
        setGroups(groupsData.flat_list || []);
        if (groupsData.flat_list?.length > 0 && !formData.ledger_group) {
          setFormData(prev => ({
            ...prev,
            ledger_group: groupsData.flat_list[0].name,
            ledger_type: groupsData.flat_list[0].type
          }));
        }
      }

      if (successMsg) showNotification(successMsg, 'success');
    } catch (e) {
      showNotification('❌ Failed to fetch ledger master list!', 'danger');
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

  const handleGroupChange = (e) => {
    const groupName = e.target.value;
    const selectedGroup = groups.find(g => g.name === groupName);
    setFormData(prev => ({
      ...prev,
      ledger_group: groupName,
      ledger_type: selectedGroup ? selectedGroup.type : prev.ledger_type
    }));
  };

  const openForm = () => {
    setFormData({
      ledger_name: '',
      ledger_group: groups.length > 0 ? groups[0].name : '',
      ledger_type: groups.length > 0 ? groups[0].type : 'ASSET',
      gst_no: '',
      pan_no: '',
      state: 'INR',
      opening_balance: 0.00,
      balance_type: 'DR',
      phone: '',
      address: ''
    });
    setIsModalOpen(true);
    setMenuOpen(false);
  };

  const closeForm = () => {
    setIsModalOpen(false);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    const confirmSave = window.confirm(`Confirm Save?\nAre you sure you want to save this ledger account?`);
    if (!confirmSave) return;

    try {
      const payload = {
        ledger_name: formData.ledger_name,
        ledger_group: formData.ledger_group,
        ledger_type: formData.ledger_type,
        gst_no: formData.gst_no || null,
        pan_no: formData.pan_no || null,
        state: formData.state || null,
        opening_balance: parseFloat(formData.opening_balance) || 0.0,
        balance_type: formData.balance_type,
        phone: formData.phone || null,
        address: formData.address || null
      };

      const res = await fetch('/finance_accounts/ledger_master/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        closeForm();
        loadData(data.message || '✅ Ledger account successfully created!');
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to save ledger!', 'danger');
      }
    } catch (err) {
      showNotification('❌ Network error saving ledger master!', 'danger');
    }
  };

  const cancelSelected = async () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    const confirmDelete = window.confirm(`Cancel Ledger?\nAre you sure you want to cancel this ledger?`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/finance_accounts/ledger_master/delete/${selectedRow.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showNotification('🗑️ Ledger deactivated successfully!', 'success');
        loadData();
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to deactivate ledger!', 'danger');
      }
    } catch (e) {
      showNotification('❌ Network error deactivating ledger!', 'danger');
    }
  };

  const filteredRecords = records.filter(rec => {
    const query = searchQuery.toLowerCase().trim();
    return (
      (rec.ledger_name || '').toLowerCase().includes(query) ||
      (rec.group_name || '').toLowerCase().includes(query)
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
          <h1>Ledger Master Directory</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            Configure corporate double-entry accounts, vendor and buyer ledger cards
          </p>
        </div>
        <div className="attendance-page-header-actions">
          <button className="attendance-btn attendance-btn-primary" onClick={openForm}>
            <Plus size={16} /> NEW LEDGER
          </button>
        </div>
      </div>

      {/* SEARCH / FILTERS */}
      <div className="attendance-filters-bar" style={{ maxWidth: '300px' }}>
        <div className="attendance-filter-group">
          <label htmlFor="search-ledger">Search Ledger</label>
          <input 
            id="search-ledger"
            className="attendance-input" 
            type="text" 
            placeholder="Search Ledger Name..." 
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
                  <Ban size={14} /> Cancel Ledger
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
                <th style={{ textalign: 'left' }}>Ledger Name</th>
                <th style={{ textalign: 'left' }}>Group</th>
                <th style={{ textAlign: 'center', width: '120px' }}>Type</th>
                <th style={{ width: '150px' }}>GST No</th>
                <th style={{ width: '150px' }}>PAN No</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Currency</th>
                <th style={{ width: '160px', textAlign: 'right' }}>Opening Bal (₹)</th>
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((row, idx) => (
                <tr 
                  key={row.id} 
                  className={`${selectedRow?.id === row.id ? 'selected' : ''} ${row.status === 'INACTIVE' ? 'attendance-cell-empty' : ''}`}
                  onClick={() => setSelectedRow(row)}
                >
                  <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                  <td style={{ fontWeight: '800', color: 'var(--att-accent)', textalign: 'left' }}>{row.ledger_name}</td>
                  <td style={{ textalign: 'left' }}>{row.group_name || '-'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="attendance-badge attendance-badge-info">{row.group_type || '-'}</span>
                  </td>
                  <td>{row.gstin || '-'}</td>
                  <td>{row.pan || '-'}</td>
                  <td style={{ textAlign: 'center' }}>INR</td>
                  <td style={{ textAlign: 'right', fontWeight: '700' }}>
                    {parseFloat(row.opening_balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} {row.opening_balance_type || 'DR'}
                  </td>
                </tr>
              ))}
              {!filteredRecords.length && (
                <tr>
                  <td colSpan="8" className="attendance-empty">
                    No Ledger Masters registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NEW LEDGER MODAL */}
      {isModalOpen && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content" style={{ maxWidth: '750px' }}>
            <div className="attendance-modal-header">
              <h2>New Ledger Master</h2>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="attendance-modal-body">
                <div className="attendance-form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  
                  <div className="attendance-form-group">
                    <label htmlFor="ledger_name">Ledger Name</label>
                    <input 
                      id="ledger_name"
                      className="attendance-input" 
                      value={formData.ledger_name} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="ledger_group">Ledger Group</label>
                    <select 
                      id="ledger_group"
                      className="attendance-select" 
                      value={formData.ledger_group} 
                      onChange={handleGroupChange} 
                      required
                    >
                      {groups.map(g => (
                        <option key={g.id} value={g.name}>{g.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="ledger_type">Ledger Type</label>
                    <select 
                      id="ledger_type"
                      className="attendance-select" 
                      value={formData.ledger_type} 
                      onChange={handleInputChange} 
                      required
                    >
                      <option value="ASSET">ASSET</option>
                      <option value="LIABILITY">LIABILITY</option>
                      <option value="INCOME">INCOME</option>
                      <option value="EXPENSE">EXPENSE</option>
                      <option value="EQUITY">EQUITY</option>
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
                    <label htmlFor="pan_no">PAN No</label>
                    <input 
                      id="pan_no"
                      className="attendance-input" 
                      value={formData.pan_no} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="state">Currency</label>
                    <input 
                      id="state"
                      className="attendance-input" 
                      value={formData.state} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="opening_balance">Opening Balance</label>
                    <input 
                      id="opening_balance"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.opening_balance} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="balance_type">Balance Type</label>
                    <select 
                      id="balance_type"
                      className="attendance-select" 
                      value={formData.balance_type} 
                      onChange={handleInputChange} 
                      required
                    >
                      <option value="DR">DR (Debit)</option>
                      <option value="CR">CR (Credit)</option>
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="phone">Phone</label>
                    <input 
                      id="phone"
                      className="attendance-input" 
                      value={formData.phone} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="address">Address</label>
                    <input 
                      id="address"
                      className="attendance-input" 
                      value={formData.address} 
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
                  Save Ledger
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
