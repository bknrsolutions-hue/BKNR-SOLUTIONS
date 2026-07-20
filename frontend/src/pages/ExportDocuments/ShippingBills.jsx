import { useState, useEffect, useRef } from 'react';
import { 
  Plus, MoreVertical, X, File, Printer, Download, Upload, Ban 
} from 'lucide-react';
import '../Attendance/Attendance.css';
import ExportSearchPanel from './ExportSearchPanel';
import { secureDownload } from '../../utils/secureDownload';

export default function ShippingBills() {
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
    shipping_bill_no: '',
    shipping_bill_date: new Date().toISOString().split('T')[0],
    invoice_no: '',
    po_number: '',
    container_no: '',
    buyer_name: '',
    shipping_bill_value: 0.00,
    drawback_amount: 0.00,
    scheme: 'DBK',
    customs_status: 'LEO',
    port: '',
    cha_name: '',
    vessel_name: '',
    voyage_no: '',
    etd: new Date().toISOString().split('T')[0],
    eta: new Date().toISOString().split('T')[0]
  });

  // Notification State
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async (successMsg = null) => {
    try {
      const res = await fetch('/export_documents/shipping_bill/entry');
      const htmlText = await res.text();
      const doc = new DOMParser().parseFromString(htmlText, 'text/html');
      
      // Parse History Table
      const rows = doc.querySelectorAll('#tableBody tr.data-row');
      const parsedHistory = Array.from(rows).map(row => {
        const cells = row.querySelectorAll('td');

        const rawDrawback = cells[9]?.textContent.trim() || '';
        const schemeMatch = rawDrawback.match(/\(([^)]+)\)/);
        const scheme = schemeMatch ? schemeMatch[1] : '';
        const drawbackVal = parseFloat(rawDrawback.replace(/[₹,(\w)]/g, '').trim()) || 0;

        return {
          id: row.getAttribute('data-id'),
          shipping_bill_no: cells[1]?.textContent.trim() || '',
          shipping_bill_date: cells[2]?.textContent.trim() || '',
          invoice_no: cells[3]?.textContent.trim() || '',
          buyer_name: cells[4]?.textContent.trim() || '',
          port: cells[5]?.textContent.trim() || '',
          cha_name: cells[6]?.textContent.trim() || '',
          vessel_voyage: cells[7]?.textContent.trim() || '',
          shipping_bill_value: parseFloat(cells[8]?.textContent.replace(/[₹,\s]/g, '') || 0),
          drawback_amount: drawbackVal,
          scheme: scheme,
          customs_status: cells[10]?.textContent.trim() || '',
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
      showNotification('❌ Failed to fetch shipping bills registry!', 'danger');
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
      shipping_bill_no: '',
      shipping_bill_date: new Date().toISOString().split('T')[0],
      invoice_no: '',
      po_number: '',
      container_no: '',
      buyer_name: '',
      shipping_bill_value: 0.00,
      drawback_amount: 0.00,
      scheme: 'DBK',
      customs_status: 'LEO',
      port: '',
      cha_name: '',
      vessel_name: '',
      voyage_no: '',
      etd: new Date().toISOString().split('T')[0],
      eta: new Date().toISOString().split('T')[0]
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

    const confirmSave = window.confirm(`Register Shipping Bill?\nAre you sure you want to log this customs shipping bill?`);
    if (!confirmSave) return;

    try {
      const payload = {
        shipping_bill_no: formData.shipping_bill_no,
        shipping_bill_date: formData.shipping_bill_date,
        invoice_no: formData.invoice_no,
        container_no: formData.container_no || null,
        po_number: formData.po_number || null,
        buyer_name: formData.buyer_name || null,
        shipping_bill_value: parseFloat(formData.shipping_bill_value) || 0.0,
        drawback_amount: parseFloat(formData.drawback_amount) || 0.0,
        scheme: formData.scheme,
        customs_status: formData.customs_status,
        port: formData.port,
        cha_name: formData.cha_name,
        vessel_name: formData.vessel_name,
        voyage_no: formData.voyage_no,
        etd: formData.etd,
        eta: formData.eta
      };

      const res = await fetch('/export_documents/shipping_bill/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        closeForm();
        loadData(data.message || '✅ Shipping bill registered and saved to incentives register!');
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to save shipping bill!', 'danger');
      }
    } catch {
      showNotification('❌ Network error saving shipping bill!', 'danger');
    }
  };

  const cancelSelected = async () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    const confirmCancel = window.confirm(`Cancel Shipping Bill?\nAre you sure you want to cancel this shipping bill registration?`);
    if (!confirmCancel) return;

    try {
      const res = await fetch(`/export_documents/shipping_bill/delete/${selectedRow.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showNotification('Shipping bill record cancelled successfully!', 'success');
        loadData();
        setSelectedRow(null);
      } else {
        showNotification(data.message || 'Failed to cancel shipping bill!', 'danger');
      }
    } catch {
      showNotification('❌ Network error deleting shipping bill!', 'danger');
    }
  };

  const printSelected = () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    window.open(`/export_documents/shipping_bill/print/${selectedRow.id}`, "_blank");
  };

  const pdfSelected = () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    window.open(`/export_documents/shipping_bill/pdf/${selectedRow.id}`, "_blank");
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
    formDataUpload.append("remarks", "Uploaded/updated export document copy");

    try {
      const res = await fetch(`/export_documents/shipping_bill/upload_pdf/${selectedRow.id}`, { 
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
      (rec.shipping_bill_no || '').toLowerCase().includes(query) ||
      (rec.buyer_name || '').toLowerCase().includes(query) ||
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
          <h1>Shipping Bills Registry</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            Track customs port clearance logs, drawback declarations, and vessel booking numbers
          </p>
        </div>
        <div className="attendance-page-header-actions">
          <button className="attendance-btn attendance-btn-primary" onClick={openForm}>
            <Plus size={16} /> NEW SHIPPING BILL
          </button>
        </div>
      </div>

      {/* SEARCH / FILTERS */}
      <ExportSearchPanel id="search-shipping-bill" label="Search Shipping Bill" value={searchQuery} onChange={setSearchQuery} count={filteredRecords.length} placeholder="Shipping bill, invoice or port…" />

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
                  <File size={14} /> Generate PDF
                </button>
                <button className="attendance-dropdown-item" onClick={() => secureDownload('/export_documents/registers.xlsx', 'All Export Registers')}>
                  <Download size={14} /> Export Register
                </button>
                <button className="attendance-dropdown-item" onClick={uploadPdfSelected}>
                  <Upload size={14} /> Upload PDF Copy
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
                <th style={{ width: '140px' }}>Shipping Bill No</th>
                <th style={{ width: '110px' }}>Bill Date</th>
                <th style={{ width: '130px' }}>Invoice No</th>
                <th style={{ textalign: 'left' }}>Buyer Name</th>
                <th style={{ width: '140px' }}>Port of Export</th>
                <th style={{ width: '140px' }}>CHA Name</th>
                <th style={{ width: '180px' }}>Vessel / Voyage</th>
                <th style={{ width: '150px', textAlign: 'right' }}>FOB Value (₹)</th>
                <th style={{ width: '180px', textAlign: 'right' }}>Drawback (₹)</th>
                <th style={{ width: '110px', textAlign: 'center' }}>Status</th>
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
                  <td style={{ fontWeight: '800', color: 'var(--att-accent)' }}>{row.shipping_bill_no}</td>
                  <td>{row.shipping_bill_date}</td>
                  <td>{row.invoice_no}</td>
                  <td style={{ textalign: 'left', fontWeight: '700' }}>{row.buyer_name || '-'}</td>
                  <td>{row.port}</td>
                  <td>{row.cha_name}</td>
                  <td>{row.vessel_voyage}</td>
                  <td style={{ textAlign: 'right' }}>
                    ₹{parseFloat(row.shipping_bill_value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: '700', color: 'var(--att-success)' }}>
                    ₹{parseFloat(row.drawback_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} ({row.scheme})
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="attendance-badge attendance-badge-present">
                      {row.customs_status}
                    </span>
                  </td>
                </tr>
              ))}
              {!filteredRecords.length && (
                <tr>
                  <td colSpan="11" className="attendance-empty">
                    No shipping bills recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NEW SHIPPING BILL MODAL */}
      {isModalOpen && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content" style={{ maxWidth: '800px' }}>
            <div className="attendance-modal-header">
              <h2>Register Shipping Bill</h2>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="attendance-modal-body">
                <div className="attendance-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  
                  <div className="attendance-form-group">
                    <label htmlFor="shipping_bill_no">Shipping Bill No</label>
                    <input 
                      id="shipping_bill_no"
                      className="attendance-input" 
                      value={formData.shipping_bill_no} 
                      onChange={handleInputChange} 
                      placeholder="SB-YYYY-XXXX" 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="shipping_bill_date">Shipping Bill Date</label>
                    <input 
                      id="shipping_bill_date"
                      className="attendance-input" 
                      type="date" 
                      value={formData.shipping_bill_date} 
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
                    <label htmlFor="shipping_bill_value">FOB Shipping Bill Value (₹)</label>
                    <input 
                      id="shipping_bill_value"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.shipping_bill_value} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="drawback_amount">Duty Drawback Receivable (₹)</label>
                    <input 
                      id="drawback_amount"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.drawback_amount} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="scheme">Incentive Scheme</label>
                    <select 
                      id="scheme"
                      className="attendance-select" 
                      value={formData.scheme} 
                      onChange={handleInputChange} 
                      required
                    >
                      <option value="DBK">DBK Only</option>
                      <option value="RoSCTL">RoSCTL Only</option>
                      <option value="BOTH">RoSCTL + DBK</option>
                      <option value="NONE">NONE</option>
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="customs_status">Customs Status (LEO)</label>
                    <input 
                      id="customs_status"
                      className="attendance-input" 
                      value={formData.customs_status} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="port">Port of Export</label>
                    <input 
                      id="port"
                      className="attendance-input" 
                      value={formData.port} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="cha_name">CHA Agency Name</label>
                    <input 
                      id="cha_name"
                      className="attendance-input" 
                      value={formData.cha_name} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="vessel_name">Vessel Name</label>
                    <input 
                      id="vessel_name"
                      className="attendance-input" 
                      value={formData.vessel_name} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="voyage_no">Voyage No</label>
                    <input 
                      id="voyage_no"
                      className="attendance-input" 
                      value={formData.voyage_no} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="etd">ETD</label>
                    <input 
                      id="etd"
                      className="attendance-input" 
                      type="date" 
                      value={formData.etd} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="eta">ETA</label>
                    <input 
                      id="eta"
                      className="attendance-input" 
                      type="date" 
                      value={formData.eta} 
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
