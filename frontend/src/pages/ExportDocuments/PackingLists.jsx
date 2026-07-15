import { useState, useEffect, useRef } from 'react';
import { 
  Plus, MoreVertical, X, FileText, Printer, Download, Upload, Ban 
} from 'lucide-react';
import '../Attendance/Attendance.css';

export default function PackingLists() {
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
    packing_no: '',
    invoice_no: '',
    po_number: '',
    container_no: '',
    buyer_name: '',
    product_name: '',
    grade: '',
    batch_no: '',
    lot_no: '',
    glaze: '',
    freezing_type: '',
    packing_style: '',
    inner_pack: '',
    outer_pack: '',
    master_cartons: 0,
    net_weight: 0.00,
    gross_weight: 0.00
  });

  // Notification State
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async (successMsg = null) => {
    try {
      const res = await fetch('/export_documents/packing_list/entry');
      const htmlText = await res.text();
      const doc = new DOMParser().parseFromString(htmlText, 'text/html');
      
      // Parse History Table
      const rows = doc.querySelectorAll('#tableBody tr.data-row');
      const parsedHistory = Array.from(rows).map(row => {
        const cells = row.querySelectorAll('td');
        const rawCartons = cells[8]?.textContent.trim() || '';
        const cartons = parseInt(rawCartons.replace(/[MC\s]/g, '')) || 0;

        return {
          id: row.getAttribute('data-id'),
          packing_no: cells[1]?.textContent.trim() || '',
          invoice_no: cells[2]?.textContent.trim() || '',
          product_name: cells[3]?.textContent.trim() || '',
          grade: cells[4]?.textContent.trim() || '',
          batch_lot: cells[5]?.textContent.trim() || '',
          glaze: cells[6]?.textContent.trim() || '',
          packing_style: cells[7]?.textContent.trim() || '',
          master_cartons: cartons,
          net_weight: parseFloat(cells[9]?.textContent.replace(/,/g, '') || 0),
          gross_weight: parseFloat(cells[10]?.textContent.replace(/,/g, '') || 0),
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
      showNotification('❌ Failed to fetch packing lists data!', 'danger');
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
      packing_no: '',
      invoice_no: '',
      po_number: '',
      container_no: '',
      buyer_name: '',
      product_name: '',
      grade: '',
      batch_no: '',
      lot_no: '',
      glaze: '',
      freezing_type: '',
      packing_style: '',
      inner_pack: '',
      outer_pack: '',
      master_cartons: 0,
      net_weight: 0.00,
      gross_weight: 0.00
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

    const confirmSave = window.confirm(`Save Packing Item?\nAre you sure you want to add this line item?`);
    if (!confirmSave) return;

    try {
      const payload = {
        packing_no: formData.packing_no,
        invoice_no: formData.invoice_no,
        po_number: formData.po_number || null,
        container_no: formData.container_no || null,
        buyer_name: formData.buyer_name || null,
        product_name: formData.product_name,
        grade: formData.grade,
        batch_no: formData.batch_no || null,
        lot_no: formData.lot_no || null,
        glaze: formData.glaze || null,
        freezing_type: formData.freezing_type || null,
        packing_style: formData.packing_style,
        inner_pack: formData.inner_pack || null,
        outer_pack: formData.outer_pack || null,
        master_cartons: parseInt(formData.master_cartons) || 0,
        net_weight: parseFloat(formData.net_weight) || 0.0,
        gross_weight: parseFloat(formData.gross_weight) || 0.0
      };

      const res = await fetch('/export_documents/packing_list/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        closeForm();
        loadData(data.message || '✅ Packing list item successfully saved!');
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to save packing list item!', 'danger');
      }
    } catch {
      showNotification('❌ Network error saving packing line item!', 'danger');
    }
  };

  const cancelSelected = async () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    const confirmCancel = window.confirm(`Cancel Item?\nAre you sure you want to cancel this packing list line item?`);
    if (!confirmCancel) return;

    try {
      const res = await fetch(`/export_documents/packing_list/delete/${selectedRow.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showNotification('Packing item cancelled successfully!', 'success');
        loadData();
        setSelectedRow(null);
      } else {
        showNotification(data.message || 'Failed to cancel item!', 'danger');
      }
    } catch {
      showNotification('❌ Network error deleting packing item!', 'danger');
    }
  };

  const printSelected = () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    window.open(`/export_documents/packing_list/print/${selectedRow.id}`, "_blank");
  };

  const pdfSelected = () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    window.open(`/export_documents/packing_list/pdf/${selectedRow.id}`, "_blank");
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
      const res = await fetch(`/export_documents/packing_list/upload_pdf/${selectedRow.id}`, { 
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
      (rec.packing_no || '').toLowerCase().includes(query) ||
      (rec.product_name || '').toLowerCase().includes(query) ||
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
          <h1>Export Packing Lists</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            Log gross and net weight breakdowns, outer carton counts, size grades, and freezer styles
          </p>
        </div>
        <div className="attendance-page-header-actions">
          <button className="attendance-btn attendance-btn-primary" onClick={openForm}>
            <Plus size={16} /> NEW LINE ITEM
          </button>
        </div>
      </div>

      {/* SEARCH / FILTERS */}
      <div className="attendance-filters-bar" style={{ maxWidth: '300px' }}>
        <div className="attendance-filter-group">
          <label htmlFor="search-packing">Search Packing / Product</label>
          <input 
            id="search-packing"
            className="attendance-input" 
            type="text" 
            placeholder="Search..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)} 
          />
        </div>
      </div>

      {/* ACTION BAR */}
      <div style={{ display: 'flex', justifycontent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
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
                <th style={{ width: '140px' }}>Packing No</th>
                <th style={{ width: '130px' }}>Invoice No</th>
                <th style={{ textalign: 'left' }}>Product Name</th>
                <th style={{ width: '120px' }}>Grade</th>
                <th style={{ width: '160px' }}>Batch / Lot No</th>
                <th style={{ width: '100px' }}>Glaze</th>
                <th style={{ width: '130px' }}>Packing Style</th>
                <th style={{ width: '140px', textAlign: 'right' }}>Master Cartons</th>
                <th style={{ width: '140px', textAlign: 'right' }}>Net Weight (Kg)</th>
                <th style={{ width: '140px', textAlign: 'right' }}>Gross Weight (Kg)</th>
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
                  <td style={{ fontWeight: '800', color: 'var(--att-accent)' }}>{row.packing_no}</td>
                  <td>{row.invoice_no}</td>
                  <td style={{ textalign: 'left', fontWeight: '700' }}>{row.product_name}</td>
                  <td>{row.grade}</td>
                  <td>{row.batch_lot}</td>
                  <td>{row.glaze}</td>
                  <td>{row.packing_style}</td>
                  <td style={{ textAlign: 'right' }}>{row.master_cartons} MC</td>
                  <td style={{ textAlign: 'right', fontWeight: '700', color: 'var(--att-success)' }}>
                    {parseFloat(row.net_weight || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {parseFloat(row.gross_weight || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
              {!filteredRecords.length && (
                <tr>
                  <td colSpan="11" className="attendance-empty">
                    No packing list items recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NEW PACKING MODAL */}
      {isModalOpen && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content" style={{ maxWidth: '800px' }}>
            <div className="attendance-modal-header">
              <h2>Add Packing List Item</h2>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="attendance-modal-body">
                <div className="attendance-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  
                  <div className="attendance-form-group">
                    <label htmlFor="packing_no">Packing Document No</label>
                    <input 
                      id="packing_no"
                      className="attendance-input" 
                      value={formData.packing_no} 
                      onChange={handleInputChange} 
                      placeholder="PL-YYYY-XXXX" 
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
                    <label htmlFor="product_name">Product Name</label>
                    <input 
                      id="product_name"
                      className="attendance-input" 
                      value={formData.product_name} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="grade">Grade / Size</label>
                    <input 
                      id="grade"
                      className="attendance-input" 
                      value={formData.grade} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="batch_no">Batch Number</label>
                    <input 
                      id="batch_no"
                      className="attendance-input" 
                      value={formData.batch_no} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="lot_no">Lot Number</label>
                    <input 
                      id="lot_no"
                      className="attendance-input" 
                      value={formData.lot_no} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="glaze">Glaze %</label>
                    <input 
                      id="glaze"
                      className="attendance-input" 
                      value={formData.glaze} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="freezing_type">Freezing Type</label>
                    <input 
                      id="freezing_type"
                      className="attendance-input" 
                      placeholder="e.g. IQF, Block" 
                      value={formData.freezing_type} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="packing_style">Packing Style</label>
                    <input 
                      id="packing_style"
                      className="attendance-input" 
                      value={formData.packing_style} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="inner_pack">Inner Pouch Pack</label>
                    <input 
                      id="inner_pack"
                      className="attendance-input" 
                      value={formData.inner_pack} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="outer_pack">Outer Carton Pack</label>
                    <input 
                      id="outer_pack"
                      className="attendance-input" 
                      value={formData.outer_pack} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="master_cartons">Master Cartons Count</label>
                    <input 
                      id="master_cartons"
                      className="attendance-input" 
                      type="number" 
                      value={formData.master_cartons} 
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

                </div>
              </div>
              <div className="attendance-modal-footer">
                <button type="button" className="attendance-btn attendance-btn-secondary" onClick={closeForm}>
                  Cancel
                </button>
                <button type="submit" className="attendance-btn attendance-btn-primary">
                  Add Line Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
