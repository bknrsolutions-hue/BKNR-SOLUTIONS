import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, MoreVertical, Ban, X, BookOpen, AlertCircle 
} from 'lucide-react';
import '../Attendance/Attendance.css';

export default function JournalEntries({ theme }) {
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
  const [entryNo, setEntryNo] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState([
    { ledger_id: '', debit: 0.00, credit: 0.00 },
    { ledger_id: '', debit: 0.00, credit: 0.00 }
  ]);

  // Notification State
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async (successMsg = null) => {
    try {
      // 1. Fetch ledgers list
      const ledgersRes = await fetch('/finance_accounts/ledgers');
      const ledgersData = await ledgersRes.json();
      if (ledgersData.success) {
        setLedgers(ledgersData.data || []);
      }

      // 2. Fetch HTML table for history records
      const htmlRes = await fetch('/finance_accounts/journal_entry/entry');
      const htmlText = await htmlRes.text();
      const doc = new DOMParser().parseFromString(htmlText, 'text/html');
      const rows = doc.querySelectorAll('#tableBody tr.data-row');
      
      const parsedHistory = Array.from(rows).map(row => {
        const cells = row.querySelectorAll('td');
        return {
          id: row.getAttribute('data-id'),
          entry_no: cells[1]?.textContent.trim() || '',
          entry_date: cells[2]?.textContent.trim() || '',
          narration: cells[3]?.textContent.trim() || '',
          total_debit: parseFloat(cells[4]?.textContent.replace(/[₹,\s]/g, '') || 0),
          total_credit: parseFloat(cells[5]?.textContent.replace(/[₹,\s]/g, '') || 0),
        };
      });

      setHistory(parsedHistory);
      if (successMsg) showNotification(successMsg, 'success');
    } catch (e) {
      showNotification('❌ Failed to fetch journal transaction history!', 'danger');
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

  const openForm = () => {
    setEntryNo('');
    setEntryDate(new Date().toISOString().split('T')[0]);
    setNarration('');
    setLines([
      { ledger_id: '', debit: 0.00, credit: 0.00 },
      { ledger_id: '', debit: 0.00, credit: 0.00 }
    ]);
    setIsModalOpen(true);
    setMenuOpen(false);
  };

  const closeForm = () => {
    setIsModalOpen(false);
  };

  const addLine = () => {
    setLines(prev => [...prev, { ledger_id: '', debit: 0.00, credit: 0.00 }]);
  };

  const removeLine = (idx) => {
    if (lines.length > 2) {
      setLines(prev => prev.filter((_, i) => i !== idx));
    } else {
      alert('At least 2 lines are required for a double entry journal!');
    }
  };

  const handleLineChange = (idx, field, value) => {
    setLines(prev => prev.map((l, i) => {
      if (i === idx) {
        return { ...l, [field]: value };
      }
      return l;
    }));
  };

  const totalDebit = lines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
  const totalCredit = lines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    if (lines.some(l => !l.ledger_id)) {
      alert('All lines must have a ledger selected!');
      return;
    }

    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      alert('Imbalance: Total Debit must match Credit!');
      return;
    }

    if (totalDebit <= 0) {
      alert('Total amount must be greater than zero!');
      return;
    }

    const confirmPost = window.confirm(`Post Journal Entry?\nAre you sure you want to commit this journal voucher?`);
    if (!confirmPost) return;

    try {
      const payload = {
        entry_no: entryNo,
        entry_date: entryDate,
        narration: narration,
        total_debit: totalDebit,
        total_credit: totalCredit,
        lines: lines.map(l => ({
          ledger_id: parseInt(l.ledger_id),
          debit: parseFloat(l.debit) || 0.0,
          credit: parseFloat(l.credit) || 0.0
        }))
      };

      const res = await fetch('/finance_accounts/journal_entry/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        closeForm();
        loadData(data.message || '✅ Journal voucher posted successfully!');
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to post journal entry!', 'danger');
      }
    } catch (err) {
      showNotification('❌ Network error posting journal transaction!', 'danger');
    }
  };

  const cancelSelected = async () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    const confirmDelete = window.confirm(`Cancel Journal Entry?\nAre you sure you want to cancel this entry?`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/finance_accounts/journal_entry/delete/${selectedRow.id}`, { method: 'POST' });
      if (res.ok) {
        showNotification('🗑️ Journal Entry cancelled successfully!', 'success');
        loadData();
        setSelectedRow(null);
      } else {
        showNotification('❌ Failed to cancel journal transaction!', 'danger');
      }
    } catch (e) {
      showNotification('❌ Network error cancelling journal entry!', 'danger');
    }
  };

  const filteredRecords = history.filter(rec => {
    const query = searchQuery.toLowerCase().trim();
    return (
      (rec.entry_no || '').toLowerCase().includes(query) ||
      (rec.narration || '').toLowerCase().includes(query)
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
          <h1>Journal Entry Book</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            Post and review compound accounting journal vouchers
          </p>
        </div>
        <div className="attendance-page-header-actions">
          <button className="attendance-btn attendance-btn-primary" onClick={openForm}>
            <Plus size={16} /> NEW JOURNAL ENTRY
          </button>
        </div>
      </div>

      {/* SEARCH / FILTERS */}
      <div className="attendance-filters-bar" style={{ maxWidth: '300px' }}>
        <div className="attendance-filter-group">
          <label htmlFor="search-journal">Search Journal No</label>
          <input 
            id="search-journal"
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

      {/* LEDGER LOG TABLE */}
      <div className="attendance-table-container">
        <div className="attendance-table-wrapper">
          <table className="attendance-table">
            <thead>
              <tr>
                <th style={{ width: '60px', textAlign: 'center' }}>Sl</th>
                <th style={{ width: '180px' }}>Journal No (Voucher)</th>
                <th style={{ width: '130px' }}>Entry Date</th>
                <th style={{ textalign: 'left' }}>Narration</th>
                <th style={{ width: '160px', textAlign: 'right' }}>Total Debit (₹)</th>
                <th style={{ width: '160px', textAlign: 'right' }}>Total Credit (₹)</th>
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
                  <td style={{ fontWeight: '800', color: 'var(--att-accent)' }}>{row.entry_no}</td>
                  <td>{row.entry_date}</td>
                  <td style={{ textalign: 'left' }}>{row.narration}</td>
                  <td style={{ textAlign: 'right', fontWeight: '800', color: 'var(--att-success)' }}>
                    ₹{parseFloat(row.total_debit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: '800', color: 'var(--att-info)' }}>
                    ₹{parseFloat(row.total_credit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
              {!filteredRecords.length && (
                <tr>
                  <td colSpan="6" className="attendance-empty">
                    No journal entries registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ENTRY MODAL */}
      {isModalOpen && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content" style={{ maxWidth: '850px' }}>
            <div className="attendance-modal-header">
              <h2>Post Double Entry Journal</h2>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="attendance-modal-body">
                <div className="attendance-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  <div className="attendance-form-group">
                    <label htmlFor="journal_no">Journal No</label>
                    <input 
                      id="journal_no"
                      className="attendance-input" 
                      value={entryNo} 
                      onChange={e => setEntryNo(e.target.value)} 
                      placeholder="JV-YYYY-XXXX" 
                      required 
                    />
                  </div>
                  <div className="attendance-form-group">
                    <label htmlFor="entry_date">Entry Date</label>
                    <input 
                      id="entry_date"
                      className="attendance-input" 
                      type="date" 
                      value={entryDate} 
                      onChange={e => setEntryDate(e.target.value)} 
                      required 
                    />
                  </div>
                  <div className="attendance-form-group">
                    <label htmlFor="narration">Narration</label>
                    <input 
                      id="narration"
                      className="attendance-input" 
                      value={narration} 
                      onChange={e => setNarration(e.target.value)} 
                      required 
                    />
                  </div>
                </div>

                {/* Journal lines table */}
                <div style={{ marginTop: '16px' }}>
                  <div className="attendance-form-section-title">Journal Lines</div>
                  <div className="attendance-table-wrapper" style={{ maxHeight: '250px', overflowY: 'auto' }}>
                    <table className="attendance-table">
                      <thead>
                        <tr>
                          <th style={{ textalign: 'left' }}>Ledger Account</th>
                          <th style={{ width: '160px', textAlign: 'right' }}>Debit (₹)</th>
                          <th style={{ width: '160px', textAlign: 'right' }}>Credit (₹)</th>
                          <th style={{ width: '60px', textAlign: 'center' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, idx) => (
                          <tr key={idx}>
                            <td>
                              <select 
                                aria-label={`Ledger Account for line ${idx + 1}`}
                                className="attendance-select" 
                                value={line.ledger_id} 
                                onChange={e => handleLineChange(idx, 'ledger_id', e.target.value)} 
                                required
                              >
                                <option value="">-- Select Account Ledger --</option>
                                {ledgers.map(l => (
                                  <option key={l.id} value={l.id}>
                                    {l.ledger_name} ({l.group_name || '-'})
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input 
                                aria-label={`Debit amount for line ${idx + 1}`}
                                className="attendance-input" 
                                type="number" 
                                step="any" 
                                style={{ textAlign: 'right' }} 
                                value={line.debit} 
                                onChange={e => handleLineChange(idx, 'debit', e.target.value)} 
                              />
                            </td>
                            <td>
                              <input 
                                aria-label={`Credit amount for line ${idx + 1}`}
                                className="attendance-input" 
                                type="number" 
                                step="any" 
                                style={{ textAlign: 'right' }} 
                                value={line.credit} 
                                onChange={e => handleLineChange(idx, 'credit', e.target.value)} 
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button 
                                type="button" 
                                className="attendance-btn attendance-btn-danger" 
                                style={{ padding: '4px 8px' }} 
                                onClick={() => removeLine(idx)}
                              >
                                &times;
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button type="button" className="attendance-btn attendance-btn-secondary" onClick={addLine}>
                    <Plus size={14} /> Add Line
                  </button>
                  <div style={{ textAlign: 'right', fontWeight: '800', fontSize: '12px' }}>
                    <div style={{ color: 'var(--att-success)' }}>Total Debit: ₹{totalDebit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                    <div style={{ color: 'var(--att-accent)' }}>Total Credit: ₹{totalCredit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                  </div>
                </div>

              </div>
              <div className="attendance-modal-footer">
                <button type="button" className="attendance-btn attendance-btn-secondary" onClick={closeForm}>
                  Cancel
                </button>
                <button type="submit" className="attendance-btn attendance-btn-primary">
                  Post Journal Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
