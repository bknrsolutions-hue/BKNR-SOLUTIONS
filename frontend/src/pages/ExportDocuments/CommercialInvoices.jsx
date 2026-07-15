import { useState, useEffect, useRef } from 'react';
import { 
  Plus, MoreVertical, X, FileText, Printer, Download, Upload, Ban 
} from 'lucide-react';
import '../Attendance/Attendance.css';

export default function CommercialInvoices() {
  const [history, setHistory] = useState([]);
  const [shipments, setShipments] = useState([]);
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
    invoice_no: '',
    po_number: '',
    buyer_name: '',
    country: '',
    container_no: '',
    invoice_date: new Date().toISOString().split('T')[0],
    buyer_address: '',
    consignee_name: '',
    notify_party: '',
    currency: 'USD',
    exchange_rate: 83.50,
    total_amount: 0.00,
    payment_terms: '',
    shipment_terms: ''
  });

  // Notification State
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadData = async (successMsg = null) => {
    try {
      const res = await fetch('/export_documents/commercial_invoice/entry');
      const htmlText = await res.text();
      const doc = new DOMParser().parseFromString(htmlText, 'text/html');
      
      // Parse History Table
      const rows = doc.querySelectorAll('#tableBody tr.data-row');
      const parsedHistory = Array.from(rows).map(row => {
        const cells = row.querySelectorAll('td');
        return {
          id: row.getAttribute('data-id'),
          invoice_no: cells[1]?.textContent.trim() || '',
          shipment_no: cells[2]?.textContent.trim() || '',
          po_number: cells[3]?.textContent.trim() || '',
          buyer_name: cells[4]?.textContent.trim() || '',
          invoice_date: cells[5]?.textContent.trim() || '',
          currency: cells[6]?.textContent.trim() || '',
          total_amount: parseFloat(cells[7]?.textContent.replace(/[$,\s]/g, '') || 0),
          exchange_rate: parseFloat(cells[8]?.textContent.replace(/[₹,\s]/g, '') || 0),
          invoice_value_inr: parseFloat(cells[9]?.textContent.replace(/[₹,\s]/g, '') || 0),
          terms: cells[10]?.textContent.trim() || '',
        };
      });

      setHistory(parsedHistory);

      // Parse Shipments from options
      const optElements = doc.querySelectorAll('#shipment_no option');
      const parsedShipments = Array.from(optElements)
        .filter(opt => opt.value !== '')
        .map(opt => ({
          shipment_no: opt.value,
          po_number: opt.getAttribute('data-po') || '',
          buyer_name: opt.getAttribute('data-buyer') || '',
          country: opt.getAttribute('data-country') || '',
          container_no: opt.getAttribute('data-container') || '',
        }));

      setShipments(parsedShipments);

      if (successMsg) showNotification(successMsg, 'success');
    } catch {
      showNotification('❌ Failed to fetch commercial invoice data!', 'danger');
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

  const handleShipmentChange = (e) => {
    const val = e.target.value;
    const selectedShipment = shipments.find(s => s.shipment_no === val);
    setFormData(prev => ({
      ...prev,
      shipment_no: val,
      po_number: selectedShipment ? selectedShipment.po_number : '',
      buyer_name: selectedShipment ? selectedShipment.buyer_name : '',
      country: selectedShipment ? selectedShipment.country : '',
      container_no: selectedShipment ? selectedShipment.container_no : ''
    }));
  };

  const openForm = () => {
    setFormData({
      shipment_no: '',
      invoice_no: '',
      po_number: '',
      buyer_name: '',
      country: '',
      container_no: '',
      invoice_date: new Date().toISOString().split('T')[0],
      buyer_address: '',
      consignee_name: '',
      notify_party: '',
      currency: 'USD',
      exchange_rate: 83.50,
      total_amount: 0.00,
      payment_terms: '',
      shipment_terms: ''
    });
    setIsModalOpen(true);
    setMenuOpen(false);
  };

  const closeForm = () => {
    setIsModalOpen(false);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();

    if (!formData.shipment_no) {
      alert('Select an export shipment first!');
      return;
    }

    const confirmSave = window.confirm(`Generate Invoice?\nAre you sure you want to generate this commercial invoice?`);
    if (!confirmSave) return;

    try {
      const payload = {
        shipment_no: formData.shipment_no,
        invoice_no: formData.invoice_no,
        po_number: formData.po_number,
        buyer_name: formData.buyer_name,
        country: formData.country,
        container_no: formData.container_no || null,
        invoice_date: formData.invoice_date,
        buyer_address: formData.buyer_address,
        consignee_name: formData.consignee_name || null,
        notify_party: formData.notify_party || null,
        currency: formData.currency,
        exchange_rate: parseFloat(formData.exchange_rate) || 1.0,
        total_amount: parseFloat(formData.total_amount) || 0.0,
        payment_terms: formData.payment_terms,
        shipment_terms: formData.shipment_terms
      };

      const res = await fetch('/export_documents/commercial_invoice/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        closeForm();
        loadData('✅ Commercial invoice generated and posted to accounts!');
        setSelectedRow(null);
        if (data.print_url) {
          window.open(data.print_url, "_blank", "noopener");
        }
      } else {
        showNotification(data.message || '❌ Failed to save commercial invoice!', 'danger');
      }
    } catch {
      showNotification('❌ Network error generating commercial invoice!', 'danger');
    }
  };

  const cancelSelected = async () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    const confirmCancel = window.confirm(`Cancel Invoice?\nAre you sure you want to cancel this commercial invoice?`);
    if (!confirmCancel) return;

    try {
      const res = await fetch(`/export_documents/commercial_invoice/cancel/${selectedRow.id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showNotification('🗑️ Invoice cancelled successfully!', 'success');
        loadData();
        setSelectedRow(null);
      } else {
        showNotification(data.message || '❌ Failed to cancel invoice!', 'danger');
      }
    } catch {
      showNotification('❌ Network error cancelling invoice!', 'danger');
    }
  };

  const printSelected = () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    window.open(`/export_documents/commercial_invoice/print/${selectedRow.id}`, "_blank");
  };

  const pdfSelected = () => {
    if (!selectedRow) return;
    setMenuOpen(false);
    window.open(`/export_documents/commercial_invoice/pdf/${selectedRow.id}`, "_blank");
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
      const res = await fetch(`/export_documents/commercial_invoice/upload_pdf/${selectedRow.id}`, { 
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
      (rec.invoice_no || '').toLowerCase().includes(query) ||
      (rec.buyer_name || '').toLowerCase().includes(query) ||
      (rec.shipment_no || '').toLowerCase().includes(query)
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
          <h1>Commercial Invoice Directory</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            Issue marine commercial invoices, evaluate foreign currencies, and trigger automated sales bookings
          </p>
        </div>
        <div className="attendance-page-header-actions">
          <button className="attendance-btn attendance-btn-primary" onClick={openForm}>
            <Plus size={16} /> NEW CI VOUCHER
          </button>
        </div>
      </div>

      {/* SEARCH / FILTERS */}
      <div className="attendance-filters-bar" style={{ maxWidth: '300px' }}>
        <div className="attendance-filter-group">
          <label htmlFor="search-invoices">Search Invoice / Buyer</label>
          <input 
            id="search-invoices"
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
                <th style={{ width: '130px' }}>Invoice No</th>
                <th style={{ width: '150px' }}>Shipment Reference</th>
                <th style={{ width: '130px' }}>PO Number</th>
                <th style={{ textalign: 'left' }}>Buyer Name</th>
                <th style={{ width: '120px' }}>Invoice Date</th>
                <th style={{ width: '90px' }}>Currency</th>
                <th style={{ width: '140px', textAlign: 'right' }}>Total Amount</th>
                <th style={{ width: '130px', textAlign: 'right' }}>Exchange Rate</th>
                <th style={{ width: '160px', textAlign: 'right' }}>Value in INR (₹)</th>
                <th style={{ width: '160px' }}>Terms</th>
                <th style={{ width: '160px', textAlign: 'center' }}>Prints</th>
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
                  <td style={{ fontWeight: '800', color: 'var(--att-accent)' }}>{row.invoice_no}</td>
                  <td>{row.shipment_no}</td>
                  <td>{row.po_number}</td>
                  <td style={{ textalign: 'left', fontWeight: '700' }}>{row.buyer_name}</td>
                  <td>{row.invoice_date}</td>
                  <td>{row.currency}</td>
                  <td style={{ textAlign: 'right' }}>
                    {parseFloat(row.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    ₹{parseFloat(row.exchange_rate || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: '800' }}>
                    ₹{parseFloat(row.invoice_value_inr || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </td>
                  <td>{row.terms}</td>
                  <td style={{ textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                      <button className="attendance-btn attendance-btn-secondary" style={{ padding: '4px 8px', fontSize: '10px' }} onClick={(e) => { e.stopPropagation(); window.open(`/export_documents/commercial_invoice/print/${row.id}`, '_blank'); }}>
                        Print
                      </button>
                      <button className="attendance-btn attendance-btn-secondary" style={{ padding: '4px 8px', fontSize: '10px' }} onClick={(e) => { e.stopPropagation(); window.open(`/export_documents/commercial_invoice/pdf/${row.id}`, '_blank'); }}>
                        PDF
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!filteredRecords.length && (
                <tr>
                  <td colSpan="12" className="attendance-empty">
                    No commercial invoices registered yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NEW COMMERCIAL INVOICE MODAL */}
      {isModalOpen && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content" style={{ maxWidth: '800px' }}>
            <div className="attendance-modal-header">
              <h2>Create Commercial Invoice</h2>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="attendance-modal-body">
                <div className="attendance-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                  
                  <div className="attendance-form-group">
                    <label htmlFor="shipment_no">Export Shipment</label>
                    <select 
                      id="shipment_no"
                      className="attendance-select" 
                      value={formData.shipment_no} 
                      onChange={handleShipmentChange} 
                      required
                    >
                      <option value="" disabled>-- SELECT SHIPMENT --</option>
                      {shipments.map(s => (
                        <option key={s.shipment_no} value={s.shipment_no} data-po={s.po_number} data-buyer={s.buyer_name} data-country={s.country} data-container={s.container_no}>
                          {s.shipment_no} ({s.buyer_name})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="invoice_no">Invoice No</label>
                    <input 
                      id="invoice_no"
                      className="attendance-input" 
                      value={formData.invoice_no} 
                      onChange={handleInputChange} 
                      placeholder="INV-YYYY-XXXX" 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="po_number">PO Number</label>
                    <input 
                      id="po_number"
                      className="attendance-input" 
                      value={formData.po_number} 
                      readOnly 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="buyer_name">Buyer Name</label>
                    <input 
                      id="buyer_name"
                      className="attendance-input" 
                      value={formData.buyer_name} 
                      readOnly 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="country">Country</label>
                    <input 
                      id="country"
                      className="attendance-input" 
                      value={formData.country} 
                      readOnly 
                      required 
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
                    <label htmlFor="invoice_date">Invoice Date</label>
                    <input 
                      id="invoice_date"
                      className="attendance-input" 
                      type="date" 
                      value={formData.invoice_date} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="buyer_address">Buyer Address</label>
                    <input 
                      id="buyer_address"
                      className="attendance-input" 
                      value={formData.buyer_address} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="consignee_name">Consignee Name</label>
                    <input 
                      id="consignee_name"
                      className="attendance-input" 
                      value={formData.consignee_name} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="notify_party">Notify Party</label>
                    <input 
                      id="notify_party"
                      className="attendance-input" 
                      value={formData.notify_party} 
                      onChange={handleInputChange} 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="currency">Currency</label>
                    <input 
                      id="currency"
                      className="attendance-input" 
                      value={formData.currency} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="exchange_rate">Exchange Rate</label>
                    <input 
                      id="exchange_rate"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.exchange_rate} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="total_amount">Total Amount (FC)</label>
                    <input 
                      id="total_amount"
                      className="attendance-input" 
                      type="number" 
                      step="any" 
                      value={formData.total_amount} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="payment_terms">Payment Terms</label>
                    <input 
                      id="payment_terms"
                      className="attendance-input" 
                      placeholder="e.g. 30 Days LC" 
                      value={formData.payment_terms} 
                      onChange={handleInputChange} 
                      required 
                    />
                  </div>

                  <div className="attendance-form-group">
                    <label htmlFor="shipment_terms">Shipment Terms</label>
                    <input 
                      id="shipment_terms"
                      className="attendance-input" 
                      placeholder="e.g. FOB, CIF" 
                      value={formData.shipment_terms} 
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
                  Generate Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
