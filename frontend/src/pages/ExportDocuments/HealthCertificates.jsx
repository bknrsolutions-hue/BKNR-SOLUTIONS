import { useState, useEffect, useRef } from 'react';
import { 
  Plus, MoreVertical, X, Printer, Download, Upload, Ban 
} from 'lucide-react';
import '../Attendance/Attendance.css';
import ExportSearchPanel from './ExportSearchPanel';
import { secureDownload } from '../../utils/secureDownload';

export default function HealthCertificates() {
  const [history, setHistory] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [selectedRow, setSelectedRow] = useState(null);
  
  // Filter States
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const dropdownRef = useRef(null);
  const fileInputRef = useRef(null);

  // Form State
  const [formData, setFormData] = useState({
    certificate_no: '',
    issue_date: new Date().toISOString().split('T')[0],
    authority: 'EIA',
    invoice_no: '',
    po_number: '',
    container_no: '',
    buyer_name: '',
    country: '',
    species: '',
    temperature_verified: true,
    issued_by: ''
  });

  // Notification State
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async (successMsg = null) => {
    try {
      const res = await fetch('/export_documents/health_certificate/entry');
      const htmlText = await res.text();
      const doc = new DOMParser().parseFromString(htmlText, 'text/html');
      
      // Parse History Table
      const rows = doc.querySelectorAll('#tableBody tr.data-row');
      const parsedHistory = Array.from(rows).map(row => {
        const cells = row.querySelectorAll('td');
        const rawVerified = cells[9]?.textContent.trim() || '';
        const tempVerified = rawVerified.toUpperCase().includes('YES');

        return {
          id: row.getAttribute('data-id'),
          certificate_no: cells[1]?.textContent.trim() || '',
          issue_date: cells[2]?.textContent.trim() || '',
          authority: cells[3]?.textContent.trim() || '',
          invoice_no: cells[4]?.textContent.trim() || '',
          container_no: cells[5]?.textContent.trim() || '',
          po_number: cells[6]?.textContent.trim() || '',
          country: cells[7]?.textContent.trim() || '',
          species: cells[8]?.textContent.trim() || '',
          temperature_verified: tempVerified,
          issued_by: cells[10]?.textContent.trim() || '',
        };
      });

      setHistory(parsedHistory);

      // Parse Invoices
      const optElements = doc.querySelectorAll('#invoice_no option');
      const parsedInvoices = Array.from(optElements)
        .filter(opt => opt.value !== '')
        .map(opt => ({
          invoice_no: opt.value,
          buyer_name: opt.getAttribute('data-buyer') || '',
          po_number: opt.getAttribute('data-po') || '',
          container_no: opt.getAttribute('data-container') || '',
          country: opt.getAttribute('data-country') || '',
        }));

      setInvoices(parsedInvoices);

      if (successMsg) showNotification(successMsg, 'success');
    } catch {
      showNotification('❌ Failed to fetch Health Certificates ledger!', 'danger');
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  // loadData intentionally runs once; subsequent refreshes are explicit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleInputChange = (e) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleInvoiceChange = (e) => {
    const val = e.target.value;
    const selectedInvoice = invoices.find(i => i.invoice_no === val);
    setFormData(prev => ({
      ...prev,
      invoice_no: val,
      po_number: selectedInvoice ? selectedInvoice.po_number : '',
      container_no: selectedInvoice ? selectedInvoice.container_no : '',
      buyer_name: selectedInvoice ? selectedInvoice.buyer_name : '',
      country: selectedInvoice ? selectedInvoice.country : ''
    }));
  };

  const openForm = () => {
    setFormData({
      certificate_no: '',
      issue_date: new Date().toISOString().split('T')[0],
      authority: 'EIA',
      invoice_no: '',
      po_number: '',
      container_no: '',
      buyer_name: '',
      country: '',
      species: '',
      temperature_verified: true,
      issued_by: ''
    });
    setIsModalOpen(true);
    setMenuOpen(false);
  };

  const closeForm = () => {
    setIsModalOpen(false);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    if (!formData.invoice_no) {
      alert('Select a commercial invoice first!');
      return;
    }

    const confirmSave = window.confirm(`Log Health Certificate?\nAre you sure you want to log this seafood health certificate?`);
    if (!confirmSave) return;

    try {
      const payload = {
        certificate_no: formData.certificate_no,
        issue_date: formData.issue_date,
        authority: formData.authority,
        invoice_no: formData.invoice_no,
        container_no: formData.container_no,
        po_number: formData.po_number || null,
        buyer_name: formData.buyer_name || null,
        country: formData.country || null,
        species: formData.species || null,
        temperature_verified: formData.temperature_verified === true || formData.temperature_verified === "true",
        issued_by: formData.issued_by || null
      };

      const res = await fetch('/export_documents/health_certificate/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        closeForm();
        loadData(data.message || '✅ Health Certificate logged successfully!');
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to save Health Certificate!', 'danger');
      }
    } catch {
      showNotification('❌ Network error saving Health Certificate!', 'danger');
    }
  };

  const cancelSelected = async () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    const confirmCancel = window.confirm(`Cancel Certificate?\nAre you sure you want to cancel this health certificate registration?`);
    if (!confirmCancel) return;

    try {
      const res = await fetch(`/export_documents/health_certificate/delete/${selectedRow.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showNotification('Health Certificate record cancelled successfully!', 'success');
        loadData();
        setSelectedRow(null);
      } else {
        showNotification(data.message || 'Failed to cancel Health Certificate!', 'danger');
      }
    } catch {
      showNotification('❌ Network error deleting Health Certificate!', 'danger');
    }
  };

  const printSelected = () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    window.open(`/export_documents/health_certificate/print/${selectedRow.id}`, "_blank");
  };

  const pdfSelected = () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    window.open(`/export_documents/health_certificate/pdf/${selectedRow.id}`, "_blank");
  };

  const uploadPdfSelected = () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    fileInputRef.current.click();
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !selectedRow) return;

    const confirmUpload = window.confirm(`Upload PDF Copy?\nAre you sure you want to upload this file as a signed copy?`);
    if (!confirmUpload) return;

    const formDataUpload = new FormData();
    formDataUpload.append("file", file);
    formDataUpload.append("document_kind", "SIGNED_COPY");
    formDataUpload.append("remarks", "Uploaded/updated Health Certificate copy");

    try {
      const res = await fetch(`/export_documents/health_certificate/upload_pdf/${selectedRow.id}`, { 
        method: "POST", 
        body: formDataUpload 
      });
      const out = await res.json();
      if (out.success) {
        showNotification('✅ PDF copy successfully saved in DB!', 'success');
        loadData();
      } else {
        showNotification(out.message || '❌ Upload failed!', 'danger');
      }
    } catch {
      showNotification('❌ Network error uploading file!', 'danger');
    }
  };

  const filteredRecords = history.filter(rec => {
    const query = searchQuery.toLowerCase().trim();
    return (
      (rec.certificate_no || '').toLowerCase().includes(query) ||
      (rec.authority || '').toLowerCase().includes(query) ||
      (rec.invoice_no || '').toLowerCase().includes(query)
    );
  });

  return (
    <div className="attendance-container export-document-page">
      {notification && (
        <div className={`attendance-toast ${notification.type === 'success' ? 'success' : 'error'}`} style={{ top: '80px' }}>
          {notification.msg}
        </div>
      )}

      {/* HEADER SECTION */}
      <div className="attendance-page-header">
        <div>
          <h1>Health Certificates Directory</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            Log sanitation health clearances issued by regulatory authorities, verification inspector signatures, and species codes
          </p>
        </div>
        <div className="attendance-page-header-actions">
          <button className="attendance-btn attendance-btn-primary" onClick={openForm}>
            <Plus size={16} /> NEW HC LOG
          </button>
        </div>
      </div>

      {/* SEARCH / FILTERS */}
      <ExportSearchPanel id="search-hc" label="Search Certificate" value={searchQuery} onChange={setSearchQuery} count={filteredRecords.length} placeholder="Certificate, invoice or authority…" />

      {/* ACTION BAR */}
      <div className="export-records-toolbar">
        
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
              <div className="attendance-dropdown-menu" style={{ right: 0, top: '35px', width: '180px' }}>
                <button className="attendance-dropdown-item" onClick={printSelected}>
                  <Printer size={14} /> Print Format
                </button>
                <button className="attendance-dropdown-item" onClick={pdfSelected}>
                  <Printer size={14} /> Generate PDF
                </button>
                <button className="attendance-dropdown-item" onClick={() => secureDownload('/export_documents/registers.xlsx', 'All Export Registers')}>
                  <Download size={14} /> Export Register
                </button>
                <button className="attendance-dropdown-item" onClick={uploadPdfSelected}>
                  <Upload size={14} /> Upload Updated HC
                </button>
                <button className="attendance-dropdown-item" onClick={cancelSelected} style={{ color: 'var(--att-danger)' }}>
                  <Ban size={14} /> Cancel Entry
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* FILE UPLOAD INPUT */}
      <input 
        type="file" 
        ref={fileInputRef} 
        accept="application/pdf" 
        style={{ display: 'none' }} 
        onChange={handleFileUpload} 
      />

      {/* TABLE */}
      <div className="attendance-table-container">
        <div className="attendance-table-wrapper">
          <table className="attendance-table">
            <thead>
              <tr>
                <th style={{ width: '60px', textAlign: 'center' }}>Sl</th>
                <th style={{ width: '140px' }}>Certificate No</th>
                <th style={{ width: '110px' }}>Issue Date</th>
                <th style={{ width: '110px' }}>Authority</th>
                <th style={{ width: '130px' }}>Invoice No</th>
                <th style={{ width: '140px' }}>Container No</th>
                <th style={{ width: '120px' }}>PO Number</th>
                <th style={{ width: '120px' }}>Country</th>
                <th style={{ textalign: 'left' }}>Species</th>
                <th style={{ width: '130px', textAlign: 'center' }}>Temp Checked</th>
                <th style={{ width: '130px', textalign: 'left' }}>Issued By</th>
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
                  <td style={{ fontWeight: '800', color: 'var(--att-accent)' }}>{row.certificate_no}</td>
                  <td>{row.issue_date}</td>
                  <td>{row.authority}</td>
                  <td>{row.invoice_no}</td>
                  <td>{row.container_no}</td>
                  <td>{row.po_number || '-'}</td>
                  <td>{row.country || '-'}</td>
                  <td style={{ textalign: 'left' }}>{row.species || '-'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`attendance-badge ${row.temperature_verified ? 'attendance-badge-present' : 'attendance-badge-absent'}`}>
                      {row.temperature_verified ? 'YES (OK)' : 'NO'}
                    </span>
                  </td>
                  <td style={{ textalign: 'left' }}>{row.issued_by || '-'}</td>
                </tr>
              ))}
              {!filteredRecords.length && (
                <tr>
                  <td colSpan="11" className="attendance-empty">
                    No Health Certificates recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NEW HC MODAL */}
      {isModalOpen && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content" style={{ maxWidth: '800px' }}>
            <div className="attendance-modal-header">
              <h2>Log Health Certificate</h2>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="attendance-modal-body">
                <div className="attendance-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  
                  <div className="attendance-form-group">
                    <label htmlFor="certificate_no">Certificate No</label>
                    <input 
                      id="certificate_no"
                      className="attendance-input" 
                      value={formData.certificate_no} 
                      onChange={handleInputChange} 
                      placeholder="HC-YYYY-XXXX" 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="issue_date">Issue Date</label>
                    <input 
                      id="issue_date"
                      className="attendance-input" 
                      type="date" 
                      value={formData.issue_date} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="authority">Authority Agency</label>
                    <input 
                      id="authority"
                      className="attendance-input" 
                      value={formData.authority} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="invoice_no">Commercial Invoice</label>
                    <select 
                      id="invoice_no"
                      className="attendance-select" 
                      value={formData.invoice_no} 
                      onChange={handleInvoiceChange} 
                      required
                    >
                      <option value="" disabled>-- SELECT INVOICE --</option>
                      {invoices.map(i => (
                        <option key={i.invoice_no} value={i.invoice_no} data-buyer={i.buyer_name} data-po={i.po_number} data-container={i.container_no} data-country={i.country}>
                          {i.invoice_no} ({i.buyer_name})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="po_number">PO Number</label>
                    <input 
                      id="po_number"
                      className="attendance-input" 
                      value={formData.po_number} 
                      readOnly 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="container_no">Container No</label>
                    <input 
                      id="container_no"
                      className="attendance-input" 
                      value={formData.container_no} 
                      readOnly 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="buyer_name">Buyer Name</label>
                    <input 
                      id="buyer_name"
                      className="attendance-input" 
                      value={formData.buyer_name} 
                      readOnly 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="country">Country</label>
                    <input 
                      id="country"
                      className="attendance-input" 
                      value={formData.country} 
                      readOnly 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="species">Species Product</label>
                    <input 
                      id="species"
                      className="attendance-input" 
                      value={formData.species} 
                      onChange={handleInputChange} 
                      placeholder="e.g. Litopenaeus vannamei" 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="temperature_verified">Temp Verified (-18°C)</label>
                    <select 
                      id="temperature_verified"
                      className="attendance-select" 
                      value={formData.temperature_verified} 
                      onChange={handleInputChange} 
                      required
                    >
                      <option value="true">YES - VERIFIED</option>
                      <option value="false">NO - EXCEPTION</option>
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="issued_by">Issued By inspector</label>
                    <input 
                      id="issued_by"
                      className="attendance-input" 
                      value={formData.issued_by} 
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
