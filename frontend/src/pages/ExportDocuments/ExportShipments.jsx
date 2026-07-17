import { useState, useEffect, useRef } from 'react';
import { 
  Plus, MoreVertical, X, Printer, FileText, Download, Upload, Ban 
} from 'lucide-react';
import '../Attendance/Attendance.css';
import ExportSearchPanel from './ExportSearchPanel';

export default function ExportShipments() {
  const [history, setHistory] = useState([]);
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
    shipment_no: '',
    po_number: '',
    buyer_name: '',
    country: '',
    etd: '',
    eta: ''
  });

  // Notification State
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async (successMsg = null) => {
    try {
      const res = await fetch('/export_documents/export_shipment/entry');
      const htmlText = await res.text();
      const doc = new DOMParser().parseFromString(htmlText, 'text/html');
      const rows = doc.querySelectorAll('#tableBody tr.data-row');
      
      const parsedHistory = Array.from(rows).map(row => {
        const cells = row.querySelectorAll('td');
        return {
          id: row.getAttribute('data-id'),
          shipment_no: cells[1]?.textContent.trim() || '',
          po_number: cells[2]?.textContent.trim() || '',
          invoice_no: cells[3]?.textContent.trim() || '',
          container_no: cells[4]?.textContent.trim() || '',
          buyer_name: cells[5]?.textContent.trim() || '',
          country: cells[6]?.textContent.trim() || '',
          etd: cells[7]?.textContent.trim() || '',
          eta: cells[8]?.textContent.trim() || '',
          status: cells[9]?.textContent.trim() || '',
        };
      });

      setHistory(parsedHistory);
      if (successMsg) showNotification(successMsg, 'success');
    } catch {
      showNotification('❌ Failed to fetch export shipments list!', 'danger');
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

  const openForm = () => {
    setFormData({
      shipment_no: '',
      po_number: '',
      buyer_name: '',
      country: '',
      etd: '',
      eta: ''
    });
    setIsModalOpen(true);
    setMenuOpen(false);
  };

  const closeForm = () => {
    setIsModalOpen(false);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    const confirmSave = window.confirm(`Register Shipment?\nAre you sure you want to register this export shipment?`);
    if (!confirmSave) return;

    try {
      const payload = {
        shipment_no: formData.shipment_no,
        po_number: formData.po_number,
        buyer_name: formData.buyer_name,
        country: formData.country,
        etd: formData.etd || null,
        eta: formData.eta || null
      };

      const res = await fetch('/export_documents/export_shipment/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        closeForm();
        loadData(data.message || '✅ Export shipment registered successfully!');
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to register shipment!', 'danger');
      }
    } catch {
      showNotification('❌ Network error registering shipment!', 'danger');
    }
  };

  const cancelSelected = async () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    const confirmCancel = window.confirm(`Cancel Shipment?\nAre you sure you want to cancel this export shipment?`);
    if (!confirmCancel) return;

    try {
      const res = await fetch(`/export_documents/export_shipment/delete/${selectedRow.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showNotification('🗑️ Export shipment cancelled successfully!', 'success');
        loadData();
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to cancel shipment!', 'danger');
      }
    } catch {
      showNotification('❌ Network error cancelling shipment!', 'danger');
    }
  };

  const printSelected = () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    window.open(`/export_documents/export_shipment/print/${selectedRow.id}`, "_blank");
  };

  const pdfSelected = () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    window.open(`/export_documents/export_shipment/pdf/${selectedRow.id}`, "_blank");
  };

  const downloadDossier = () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    window.location.href = `/export_documents/shipment/${selectedRow.id}/dossier.zip`;
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
      const res = await fetch(`/export_documents/export_shipment/upload_pdf/${selectedRow.id}`, { 
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
      (rec.shipment_no || '').toLowerCase().includes(query) ||
      (rec.buyer_name || '').toLowerCase().includes(query) ||
      (rec.po_number || '').toLowerCase().includes(query)
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
          <h1>Export Shipment Framework</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            Log cargo departure schedules, commercial contracts, and container stuffing links
          </p>
        </div>
        <div className="attendance-page-header-actions">
          <button className="attendance-btn attendance-btn-primary" onClick={openForm}>
            <Plus size={16} /> REGISTER SHIPMENT
          </button>
        </div>
      </div>

      {/* SEARCH / FILTERS */}
      <ExportSearchPanel id="search-shipments" label="Search Shipment / Buyer" value={searchQuery} onChange={setSearchQuery} count={filteredRecords.length} placeholder="Shipment, buyer or vessel…" />

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
                <button className="attendance-dropdown-item" onClick={downloadDossier}>
                  <Download size={14} /> Shipment Dossier
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
                <th style={{ width: '140px' }}>Shipment No</th>
                <th style={{ width: '130px' }}>PO Number</th>
                <th style={{ width: '150px' }}>Commercial Invoice</th>
                <th style={{ width: '150px' }}>Container No</th>
                <th style={{ textalign: 'left' }}>Buyer Name</th>
                <th style={{ width: '120px' }}>Country</th>
                <th style={{ width: '110px' }}>ETD</th>
                <th style={{ width: '110px' }}>ETA</th>
                <th style={{ width: '100px', textAlign: 'center' }}>Status</th>
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
                  <td style={{ fontWeight: '800', color: 'var(--att-accent)' }}>{row.shipment_no}</td>
                  <td>{row.po_number}</td>
                  <td style={{ fontWeight: '700', color: row.invoice_no === 'PENDING' ? 'var(--att-danger)' : 'var(--att-success)' }}>
                    {row.invoice_no}
                  </td>
                  <td>{row.container_no}</td>
                  <td style={{ textalign: 'left', fontWeight: '700' }}>{row.buyer_name}</td>
                  <td>{row.country}</td>
                  <td>{row.etd || '-'}</td>
                  <td>{row.eta || '-'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className={`attendance-badge ${row.status === 'CLOSED' ? 'attendance-badge-present' : 'attendance-badge-info'}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!filteredRecords.length && (
                <tr>
                  <td colSpan="10" className="attendance-empty">
                    No export shipments registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NEW SHIPMENT MODAL */}
      {isModalOpen && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content" style={{ maxWidth: '750px' }}>
            <div className="attendance-modal-header">
              <h2>Register Export Shipment</h2>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="attendance-modal-body">
                <div className="attendance-form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  
                  <div className="attendance-form-group">
                    <label htmlFor="shipment_no">Shipment No</label>
                    <input 
                      id="shipment_no"
                      className="attendance-input" 
                      value={formData.shipment_no} 
                      onChange={handleInputChange} 
                      placeholder="SHP-YYYY-XXXX" 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="po_number">PO Number</label>
                    <input 
                      id="po_number"
                      className="attendance-input" 
                      value={formData.po_number} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="buyer_name">Buyer Name</label>
                    <input 
                      id="buyer_name"
                      className="attendance-input" 
                      value={formData.buyer_name} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="country">Country</label>
                    <input 
                      id="country"
                      className="attendance-input" 
                      value={formData.country} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="etd">ETD (Estimated Depart)</label>
                    <input 
                      id="etd"
                      className="attendance-input" 
                      type="date" 
                      value={formData.etd} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="eta">ETA (Estimated Arrival)</label>
                    <input 
                      id="eta"
                      className="attendance-input" 
                      type="date" 
                      value={formData.eta} 
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
