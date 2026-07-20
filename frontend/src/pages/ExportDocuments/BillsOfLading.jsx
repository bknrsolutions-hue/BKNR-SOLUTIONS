import { useState, useEffect, useRef } from 'react';
import { 
  Plus, MoreVertical, X, Printer, Download, Upload, Ban 
} from 'lucide-react';
import '../Attendance/Attendance.css';
import ExportSearchPanel from './ExportSearchPanel';
import { secureDownload } from '../../utils/secureDownload';

export default function BillsOfLading() {
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
    bl_no: '',
    bl_date: new Date().toISOString().split('T')[0],
    invoice_no: '',
    po_number: '',
    container_no: '',
    buyer_name: '',
    shipping_line: '',
    seal_no: '',
    freight_terms: 'PREPAID',
    no_of_original_bl: 3,
    gross_weight: 0.00,
    net_weight: 0.00
  });

  // Notification State
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async (successMsg = null) => {
    try {
      const res = await fetch('/export_documents/bill_of_lading/entry');
      const htmlText = await res.text();
      const doc = new DOMParser().parseFromString(htmlText, 'text/html');
      
      // Parse History Table
      const rows = doc.querySelectorAll('#tableBody tr.data-row');
      const parsedHistory = Array.from(rows).map(row => {
        const cells = row.querySelectorAll('td');
        return {
          id: row.getAttribute('data-id'),
          bl_no: cells[1]?.textContent.trim() || '',
          bl_date: cells[2]?.textContent.trim() || '',
          invoice_no: cells[3]?.textContent.trim() || '',
          container_no: cells[4]?.textContent.trim() || '',
          shipping_line: cells[5]?.textContent.trim() || '',
          seal_no: cells[6]?.textContent.trim() || '',
          freight_terms: cells[7]?.textContent.trim() || '',
          gross_weight: parseFloat(cells[8]?.textContent.replace(/,/g, '') || 0),
          net_weight: parseFloat(cells[9]?.textContent.replace(/,/g, '') || 0),
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
        }));

      setInvoices(parsedInvoices);

      if (successMsg) showNotification(successMsg, 'success');
    } catch {
      showNotification('❌ Failed to fetch Bill of Ladings ledger!', 'danger');
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
      buyer_name: selectedInvoice ? selectedInvoice.buyer_name : ''
    }));
  };

  const openForm = () => {
    setFormData({
      bl_no: '',
      bl_date: new Date().toISOString().split('T')[0],
      invoice_no: '',
      po_number: '',
      container_no: '',
      buyer_name: '',
      shipping_line: '',
      seal_no: '',
      freight_terms: 'PREPAID',
      no_of_original_bl: 3,
      gross_weight: 0.00,
      net_weight: 0.00
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

    if (parseFloat(formData.gross_weight) < parseFloat(formData.net_weight)) {
      alert('Gross weight cannot be less than Net weight!');
      return;
    }

    const confirmSave = window.confirm(`Log Bill of Lading?\nAre you sure you want to log this cargo bill of lading?`);
    if (!confirmSave) return;

    try {
      const payload = {
        bl_no: formData.bl_no,
        bl_date: formData.bl_date,
        invoice_no: formData.invoice_no,
        container_no: formData.container_no,
        po_number: formData.po_number || null,
        buyer_name: formData.buyer_name || null,
        shipping_line: formData.shipping_line,
        seal_no: formData.seal_no,
        freight_terms: formData.freight_terms,
        no_of_original_bl: parseInt(formData.no_of_original_bl) || 3,
        gross_weight: parseFloat(formData.gross_weight) || 0.0,
        net_weight: parseFloat(formData.net_weight) || 0.0
      };

      const res = await fetch('/export_documents/bill_of_lading/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        closeForm();
        loadData(data.message || '✅ Bill of Lading recorded successfully!');
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to save Bill of Lading!', 'danger');
      }
    } catch {
      showNotification('❌ Network error saving Bill of Lading!', 'danger');
    }
  };

  const cancelSelected = async () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    const confirmCancel = window.confirm(`Cancel Bill of Lading?\nAre you sure you want to cancel this bill of lading ledger entry?`);
    if (!confirmCancel) return;

    try {
      const res = await fetch(`/export_documents/bill_of_lading/delete/${selectedRow.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showNotification('Bill of Lading record cancelled successfully!', 'success');
        loadData();
        setSelectedRow(null);
      } else {
        showNotification(data.message || 'Failed to cancel Bill of Lading!', 'danger');
      }
    } catch {
      showNotification('❌ Network error deleting Bill of Lading!', 'danger');
    }
  };

  const printSelected = () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    window.open(`/export_documents/bill_of_lading/print/${selectedRow.id}`, "_blank");
  };

  const pdfSelected = () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    window.open(`/export_documents/bill_of_lading/pdf/${selectedRow.id}`, "_blank");
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
    formDataUpload.append("remarks", "Uploaded/updated B/L copy");

    try {
      const res = await fetch(`/export_documents/bill_of_lading/upload_pdf/${selectedRow.id}`, { 
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
      (rec.bl_no || '').toLowerCase().includes(query) ||
      (rec.shipping_line || '').toLowerCase().includes(query) ||
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
          <h1>Bill of Ladings Ledger</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            Log final ocean bill of ladings (B/L) issued by carriers, cargo seal validations, and weights
          </p>
        </div>
        <div className="attendance-page-header-actions">
          <button className="attendance-btn attendance-btn-primary" onClick={openForm}>
            <Plus size={16} /> NEW BL ENTRY
          </button>
        </div>
      </div>

      {/* SEARCH / FILTERS */}
      <ExportSearchPanel id="search-bl" label="Search BL Number" value={searchQuery} onChange={setSearchQuery} count={filteredRecords.length} placeholder="BL number, consignee or vessel…" />

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
                  <Upload size={14} /> Upload Updated B/L
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
                <th style={{ width: '140px' }}>BL Number</th>
                <th style={{ width: '110px' }}>BL Date</th>
                <th style={{ width: '130px' }}>Invoice No</th>
                <th style={{ width: '140px' }}>Container No</th>
                <th style={{ textalign: 'left' }}>Shipping Line</th>
                <th style={{ width: '120px' }}>Seal No</th>
                <th style={{ width: '120px' }}>Freight Terms</th>
                <th style={{ width: '150px', textAlign: 'right' }}>Gross Weight (Kg)</th>
                <th style={{ width: '150px', textAlign: 'right' }}>Net Weight (Kg)</th>
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
                  <td style={{ fontWeight: '800', color: 'var(--att-accent)' }}>{row.bl_no}</td>
                  <td>{row.bl_date}</td>
                  <td>{row.invoice_no}</td>
                  <td>{row.container_no}</td>
                  <td style={{ textalign: 'left', fontWeight: '700' }}>{row.shipping_line}</td>
                  <td>{row.seal_no}</td>
                  <td>{row.freight_terms}</td>
                  <td style={{ textAlign: 'right' }}>
                    {parseFloat(row.gross_weight || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: '700', color: 'var(--att-success)' }}>
                    {parseFloat(row.net_weight || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
              {!filteredRecords.length && (
                <tr>
                  <td colSpan="10" className="attendance-empty">
                    No Bill of Ladings recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NEW BL MODAL */}
      {isModalOpen && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content" style={{ maxWidth: '800px' }}>
            <div className="attendance-modal-header">
              <h2>Log Bill of Lading</h2>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="attendance-modal-body">
                <div className="attendance-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  
                  <div className="attendance-form-group">
                    <label htmlFor="bl_no">Bill of Lading No</label>
                    <input 
                      id="bl_no"
                      className="attendance-input" 
                      value={formData.bl_no} 
                      onChange={handleInputChange} 
                      placeholder="BL-YYYY-XXXX" 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="bl_date">BL Release Date</label>
                    <input 
                      id="bl_date"
                      className="attendance-input" 
                      type="date" 
                      value={formData.bl_date} 
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
                        <option key={i.invoice_no} value={i.invoice_no} data-buyer={i.buyer_name} data-po={i.po_number} data-container={i.container_no}>
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
                    <label htmlFor="shipping_line">Shipping Line</label>
                    <input 
                      id="shipping_line"
                      className="attendance-input" 
                      value={formData.shipping_line} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="seal_no">Seal No</label>
                    <input 
                      id="seal_no"
                      className="attendance-input" 
                      value={formData.seal_no} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="freight_terms">Freight Terms</label>
                    <select 
                      id="freight_terms"
                      className="attendance-select" 
                      value={formData.freight_terms} 
                      onChange={handleInputChange} 
                      required
                    >
                      <option value="PREPAID">PREPAID</option>
                      <option value="COLLECT">COLLECT</option>
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="no_of_original_bl">No of Originals BL</label>
                    <input 
                      id="no_of_original_bl"
                      className="attendance-input" 
                      type="number" 
                      value={formData.no_of_original_bl} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="gross_weight">Gross Weight (Kg)</label>
                    <input 
                      id="gross_weight"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.gross_weight} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="net_weight">Net Weight (Kg)</label>
                    <input 
                      id="net_weight"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.net_weight} 
                      onChange={handleInputChange} 
                      required 
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
