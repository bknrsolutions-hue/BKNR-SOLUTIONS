import { useState, useEffect, useRef } from 'react';
import { 
  Plus, MoreVertical, X, FileText, Printer, Download, Upload, Ban 
} from 'lucide-react';
import '../Attendance/Attendance.css';
import ExportSearchPanel from './ExportSearchPanel';

export default function ContainerStuffing() {
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
    container_no: '',
    invoice_no: '',
    po_number: '',
    buyer_name: '',
    seal_no: '',
    shipping_line: '',
    stuffing_date: new Date().toISOString().split('T')[0],
    stuffing_location: '',
    container_type: 'Reefer',
    container_size: '40FT',
    temperature: -18.0,
    vehicle_no: '',
    loading_supervisor: ''
  });

  // Notification State
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async (successMsg = null) => {
    try {
      const res = await fetch('/export_documents/container_stuffing/entry');
      const htmlText = await res.text();
      const doc = new DOMParser().parseFromString(htmlText, 'text/html');
      
      // Parse History Table
      const rows = doc.querySelectorAll('#tableBody tr.data-row');
      const parsedHistory = Array.from(rows).map(row => {
        const cells = row.querySelectorAll('td');
        const rawTemp = cells[8]?.textContent.trim() || '';
        const temp = parseFloat(rawTemp.replace(/[°C\s]/g, '')) || -18.0;

        return {
          id: row.getAttribute('data-id'),
          container_no: cells[1]?.textContent.trim() || '',
          invoice_no: cells[2]?.textContent.trim() || '',
          seal_no: cells[3]?.textContent.trim() || '',
          shipping_line: cells[4]?.textContent.trim() || '',
          stuffing_date: cells[5]?.textContent.trim() || '',
          container_type: cells[6]?.textContent.trim() || '',
          container_size: cells[7]?.textContent.trim() || '',
          temperature: temp,
          vehicle_no: cells[9]?.textContent.trim() || '',
          loading_supervisor: cells[10]?.textContent.trim() || '',
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
      showNotification('❌ Failed to fetch container stuffing logs!', 'danger');
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
      buyer_name: selectedInvoice ? selectedInvoice.buyer_name : '',
      container_no: selectedInvoice ? selectedInvoice.container_no : prev.container_no
    }));
  };

  const openForm = () => {
    setFormData({
      container_no: '',
      invoice_no: '',
      po_number: '',
      buyer_name: '',
      seal_no: '',
      shipping_line: '',
      stuffing_date: new Date().toISOString().split('T')[0],
      stuffing_location: '',
      container_type: 'Reefer',
      container_size: '40FT',
      temperature: -18.0,
      vehicle_no: '',
      loading_supervisor: ''
    });
    setIsModalOpen(true);
    setMenuOpen(false);
  };

  const closeForm = () => {
    setIsModalOpen(false);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    const confirmSave = window.confirm(`Log Stuffing Operation?\nAre you sure you want to log this stuffing details?`);
    if (!confirmSave) return;

    try {
      const payload = {
        container_no: formData.container_no,
        invoice_no: formData.invoice_no || null,
        po_number: formData.po_number || null,
        buyer_name: formData.buyer_name || null,
        seal_no: formData.seal_no,
        shipping_line: formData.shipping_line || null,
        stuffing_date: formData.stuffing_date,
        stuffing_location: formData.stuffing_location || null,
        container_type: formData.container_type,
        container_size: formData.container_size,
        temperature: parseFloat(formData.temperature) || -18.0,
        vehicle_no: formData.vehicle_no,
        loading_supervisor: formData.loading_supervisor
      };

      const res = await fetch('/export_documents/container_stuffing/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        closeForm();
        loadData(data.message || '✅ Container stuffing log successfully recorded!');
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to save stuffing log!', 'danger');
      }
    } catch {
      showNotification('❌ Network error saving stuffing log!', 'danger');
    }
  };

  const cancelSelected = async () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    const confirmCancel = window.confirm(`Cancel Stuffing?\nAre you sure you want to cancel this container stuffing log?`);
    if (!confirmCancel) return;

    try {
      const res = await fetch(`/export_documents/container_stuffing/delete/${selectedRow.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showNotification('Stuffing record cancelled successfully!', 'success');
        loadData();
        setSelectedRow(null);
      } else {
        showNotification(data.message || 'Failed to cancel stuffing log!', 'danger');
      }
    } catch {
      showNotification('❌ Network error deleting stuffing log!', 'danger');
    }
  };

  const printSelected = () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    window.open(`/export_documents/container_stuffing/print/${selectedRow.id}`, "_blank");
  };

  const pdfSelected = () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    window.open(`/export_documents/container_stuffing/pdf/${selectedRow.id}`, "_blank");
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
      const res = await fetch(`/export_documents/container_stuffing/upload_pdf/${selectedRow.id}`, { 
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
      (rec.container_no || '').toLowerCase().includes(query) ||
      (rec.seal_no || '').toLowerCase().includes(query) ||
      (rec.invoice_no || '').toLowerCase().includes(query)
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
          <h1>Container Stuffing Directory</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            Log container numbers, shipping lines, vehicle plates, thermal ranges, and supervisor verifications
          </p>
        </div>
        <div className="attendance-page-header-actions">
          <button className="attendance-btn attendance-btn-primary" onClick={openForm}>
            <Plus size={16} /> NEW LOADING LOG
          </button>
        </div>
      </div>

      {/* SEARCH / FILTERS */}
      <ExportSearchPanel id="search-container" label="Search Container" value={searchQuery} onChange={setSearchQuery} count={filteredRecords.length} placeholder="Container, seal or invoice…" />

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
                  <FileText size={14} /> Generate PDF
                </button>
                <button className="attendance-dropdown-item" onClick={() => window.open('/export_documents/registers.xlsx', '_blank')}>
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
                <th style={{ width: '140px' }}>Container No</th>
                <th style={{ width: '130px' }}>Linked Invoice</th>
                <th style={{ width: '120px' }}>Seal No</th>
                <th style={{ textalign: 'left' }}>Shipping Line</th>
                <th style={{ width: '120px' }}>Stuffing Date</th>
                <th style={{ width: '100px' }}>Type</th>
                <th style={{ width: '90px' }}>Size</th>
                <th style={{ width: '150px', textAlign: 'right' }}>Temperature (°C)</th>
                <th style={{ width: '130px' }}>Vehicle No</th>
                <th style={{ textalign: 'left' }}>Supervisor</th>
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
                  <td style={{ fontWeight: '800', color: 'var(--att-accent)' }}>{row.container_no}</td>
                  <td>{row.invoice_no || '-'}</td>
                  <td>{row.seal_no}</td>
                  <td style={{ textalign: 'left', fontWeight: '700' }}>{row.shipping_line}</td>
                  <td>{row.stuffing_date}</td>
                  <td>{row.container_type}</td>
                  <td>{row.container_size}</td>
                  <td style={{ textAlign: 'right', fontWeight: '800', color: 'var(--att-danger)' }}>{row.temperature} °C</td>
                  <td>{row.vehicle_no}</td>
                  <td style={{ textalign: 'left' }}>{row.loading_supervisor}</td>
                </tr>
              ))}
              {!filteredRecords.length && (
                <tr>
                  <td colSpan="11" className="attendance-empty">
                    No stuffing operations recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NEW STUFFING MODAL */}
      {isModalOpen && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content" style={{ maxWidth: '800px' }}>
            <div className="attendance-modal-header">
              <h2>Log Stuffing Operation</h2>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="attendance-modal-body">
                <div className="attendance-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  
                  <div className="attendance-form-group">
                    <label htmlFor="container_no">Container No</label>
                    <input 
                      id="container_no"
                      className="attendance-input" 
                      value={formData.container_no} 
                      onChange={handleInputChange} 
                      placeholder="e.g. MSKU9876543" 
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
                    >
                      <option value="">-- UNLINKED / PENDING --</option>
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
                    <label htmlFor="buyer_name">Buyer Name</label>
                    <input 
                      id="buyer_name"
                      className="attendance-input" 
                      value={formData.buyer_name} 
                      readOnly 
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
                    <label htmlFor="shipping_line">Shipping Line</label>
                    <input 
                      id="shipping_line"
                      className="attendance-input" 
                      value={formData.shipping_line} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="stuffing_date">Stuffing Date</label>
                    <input 
                      id="stuffing_date"
                      className="attendance-input" 
                      type="date" 
                      value={formData.stuffing_date} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="stuffing_location">Stuffing Location</label>
                    <input 
                      id="stuffing_location"
                      className="attendance-input" 
                      value={formData.stuffing_location} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="container_type">Container Type</label>
                    <select 
                      id="container_type"
                      className="attendance-select" 
                      value={formData.container_type} 
                      onChange={handleInputChange} 
                      required
                    >
                      <option value="Reefer">Reefer</option>
                      <option value="Dry">Dry</option>
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="container_size">Container Size</label>
                    <select 
                      id="container_size"
                      className="attendance-select" 
                      value={formData.container_size} 
                      onChange={handleInputChange} 
                      required
                    >
                      <option value="40FT">40FT</option>
                      <option value="20FT">20FT</option>
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="temperature">Core Temperature Set (°C)</label>
                    <input 
                      id="temperature"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.temperature} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="vehicle_no">Vehicle No</label>
                    <input 
                      id="vehicle_no"
                      className="attendance-input" 
                      value={formData.vehicle_no} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="loading_supervisor">Supervisor</label>
                    <input 
                      id="loading_supervisor"
                      className="attendance-input" 
                      value={formData.loading_supervisor} 
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
