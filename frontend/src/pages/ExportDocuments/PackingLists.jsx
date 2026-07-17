import { useState, useEffect, useRef } from 'react';
import { 
  Plus, MoreVertical, X, FileText, Printer, Download, Upload, Ban, Trash2, Copy
} from 'lucide-react';
import '../Attendance/Attendance.css';
import './PackingLists.css';
import ExportSearchPanel from './ExportSearchPanel';

const newPackingLine = () => ({
  product_name: '',
  grade: '',
  batch_no: '',
  lot_no: '',
  glaze: '',
  freezing_type: '',
  hs_code: '',
  manufacturing_date: '',
  expiry_date: '',
  packing_style: '',
  inner_pack: '',
  outer_pack: '',
  master_cartons: 0,
  net_weight: 0,
  gross_weight: 0,
  pallet_count: 0,
  inventory_batch_id: '',
  stock_entry_no: '',
});

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
  });
  const [lineItems, setLineItems] = useState([newPackingLine()]);
  const [saving, setSaving] = useState(false);

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

  const updateLine = (index, field, value) => {
    setLineItems(current => current.map((line, lineIndex) =>
      lineIndex === index ? { ...line, [field]: value } : line
    ));
  };

  const addLine = (source = null) => {
    setLineItems(current => [...current, source ? { ...source } : newPackingLine()]);
  };

  const removeLine = index => {
    setLineItems(current => current.length === 1 ? current : current.filter((_, lineIndex) => lineIndex !== index));
  };

  const openForm = () => {
    setFormData({
      packing_no: '',
      invoice_no: '',
      po_number: '',
      container_no: '',
      buyer_name: '',
    });
    setLineItems([newPackingLine()]);
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

    const invalidLine = lineItems.findIndex(line =>
      !line.product_name.trim()
      || !line.grade.trim()
      || !line.packing_style.trim()
      || Number(line.gross_weight || 0) < Number(line.net_weight || 0)
      || (line.manufacturing_date && line.expiry_date && line.expiry_date < line.manufacturing_date)
    );
    if (invalidLine >= 0) {
      alert(`Complete valid details in packing line ${invalidLine + 1}. Gross weight must be at least net weight and expiry cannot be before manufacturing date.`);
      return;
    }

    const confirmSave = window.confirm(`Save Packing List?\nSave ${lineItems.length} packing line item(s) for ${formData.invoice_no}?`);
    if (!confirmSave) return;

    setSaving(true);
    try {
      const payload = {
        packing_no: formData.packing_no,
        invoice_no: formData.invoice_no,
        po_number: formData.po_number || null,
        container_no: formData.container_no || null,
        buyer_name: formData.buyer_name || null,
        items: lineItems.map(line => ({
          ...line,
          batch_no: line.batch_no || null,
          lot_no: line.lot_no || null,
          glaze: line.glaze || null,
          freezing_type: line.freezing_type || null,
          hs_code: line.hs_code || null,
          manufacturing_date: line.manufacturing_date || null,
          expiry_date: line.expiry_date || null,
          inner_pack: line.inner_pack || null,
          outer_pack: line.outer_pack || null,
          inventory_batch_id: line.inventory_batch_id || null,
          stock_entry_no: line.stock_entry_no || null,
          master_cartons: Number.parseInt(line.master_cartons, 10) || 0,
          pallet_count: Number.parseInt(line.pallet_count, 10) || 0,
          net_weight: Number.parseFloat(line.net_weight) || 0,
          gross_weight: Number.parseFloat(line.gross_weight) || 0,
        })),
      };

      const res = await fetch('/export_documents/packing_list/save-bulk', {
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
        showNotification(data.message || '❌ Failed to save packing list!', 'danger');
      }
    } catch {
      showNotification('❌ Network error saving packing list!', 'danger');
    } finally {
      setSaving(false);
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
            <Plus size={16} /> NEW PACKING LIST
          </button>
        </div>
      </div>

      {/* SEARCH / FILTERS */}
      <ExportSearchPanel id="search-packing" label="Search Packing / Product" value={searchQuery} onChange={setSearchQuery} count={filteredRecords.length} placeholder="Packing list, invoice or product…" />

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
          <div className="attendance-modal-content packing-multi-modal" style={{ maxWidth: '1180px', width: 'calc(100vw - 32px)', maxHeight: '94vh' }}>
            <div className="attendance-modal-header">
              <div>
                <h2>Create Multi-Line Packing List</h2>
                <p>Enter invoice details once, then add every product, grade, batch and packing line.</p>
              </div>
              <button className="attendance-modal-close-btn" onClick={closeForm} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleFormSubmit}>
              <div className="attendance-modal-body" style={{ overflowY: 'auto' }}>
                <div className="attendance-form-grid packing-common-grid" style={{ marginBottom: 14 }}>
                  <div className="attendance-form-group">
                    <label htmlFor="packing_no">Packing Document No</label>
                    <input id="packing_no" className="attendance-input" value={formData.packing_no} onChange={handleInputChange} placeholder="PL-YYYY-XXXX" required />
                  </div>
                  <div className="attendance-form-group">
                    <label htmlFor="invoice_no">Commercial Invoice</label>
                    <select id="invoice_no" className="attendance-select" value={formData.invoice_no} onChange={handleInvoiceChange} required>
                      <option value="" disabled>-- SELECT INVOICE --</option>
                      {invoices.map(i => (
                        <option key={i.invoice_no} value={i.invoice_no}>{i.invoice_no} ({i.buyer_name})</option>
                      ))}
                    </select>
                  </div>
                  <div className="attendance-form-group">
                    <label htmlFor="po_number">PO Number</label>
                    <input id="po_number" className="attendance-input" value={formData.po_number} readOnly />
                  </div>
                  <div className="attendance-form-group">
                    <label htmlFor="container_no">Container No</label>
                    <input id="container_no" className="attendance-input" value={formData.container_no} readOnly />
                  </div>
                  <div className="attendance-form-group">
                    <label htmlFor="buyer_name">Buyer Name</label>
                    <input id="buyer_name" className="attendance-input" value={formData.buyer_name} readOnly />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, margin: '4px 0 10px' }}>
                  <div>
                    <strong style={{ color: 'var(--att-heading)', fontSize: 13 }}>Packing Line Items</strong>
                    <div style={{ color: 'var(--att-muted)', fontSize: 10 }}>{lineItems.length} line(s) · each row is saved under the same packing document number</div>
                  </div>
                  <button type="button" className="attendance-btn attendance-btn-secondary" onClick={() => addLine()}>
                    <Plus size={14} /> Add Row
                  </button>
                </div>

                <div style={{ display: 'grid', gap: 10 }}>
                  {lineItems.map((line, index) => (
                    <section key={index} style={{ border: '1px solid var(--att-border)', borderRadius: 10, background: 'var(--att-card)', overflow: 'hidden' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 10px', background: 'var(--att-table-header-bg)', borderBottom: '1px solid var(--att-border)' }}>
                        <strong style={{ color: 'var(--att-accent)', fontSize: 11 }}>LINE {index + 1}</strong>
                        <div style={{ display: 'flex', gap: 5 }}>
                          <button type="button" className="attendance-action-dots-btn" title="Duplicate row" onClick={() => addLine(line)}><Copy size={13} /></button>
                          <button type="button" className="attendance-action-dots-btn" title="Remove row" disabled={lineItems.length === 1} onClick={() => removeLine(index)}><Trash2 size={13} /></button>
                        </div>
                      </div>
                      <div className="attendance-form-grid packing-line-grid" style={{ padding: 10, gap: 8 }}>
                        <LineField label="Product Name" value={line.product_name} onChange={value => updateLine(index, 'product_name', value)} required />
                        <LineField label="Grade / Size" value={line.grade} onChange={value => updateLine(index, 'grade', value)} required />
                        <LineField label="Batch Number" value={line.batch_no} onChange={value => updateLine(index, 'batch_no', value)} />
                        <LineField label="Lot Number" value={line.lot_no} onChange={value => updateLine(index, 'lot_no', value)} />
                        <LineField label="Glaze %" value={line.glaze} onChange={value => updateLine(index, 'glaze', value)} />
                        <LineField label="Freezing Type" value={line.freezing_type} onChange={value => updateLine(index, 'freezing_type', value)} placeholder="IQF / Block" />
                        <LineField label="HS Code" value={line.hs_code} onChange={value => updateLine(index, 'hs_code', value)} />
                        <LineField label="Manufacturing Date" type="date" value={line.manufacturing_date} onChange={value => updateLine(index, 'manufacturing_date', value)} />
                        <LineField label="Expiry Date" type="date" value={line.expiry_date} onChange={value => updateLine(index, 'expiry_date', value)} />
                        <LineField label="Packing Style" value={line.packing_style} onChange={value => updateLine(index, 'packing_style', value)} required />
                        <LineField label="Inner Pack" value={line.inner_pack} onChange={value => updateLine(index, 'inner_pack', value)} />
                        <LineField label="Outer Pack" value={line.outer_pack} onChange={value => updateLine(index, 'outer_pack', value)} />
                        <LineField label="Master Cartons" type="number" min="0" value={line.master_cartons} onChange={value => updateLine(index, 'master_cartons', value)} required />
                        <LineField label="Pallet Count" type="number" min="0" value={line.pallet_count} onChange={value => updateLine(index, 'pallet_count', value)} />
                        <LineField label="Net Weight (Kg)" type="number" min="0" step="any" value={line.net_weight} onChange={value => updateLine(index, 'net_weight', value)} required />
                        <LineField label="Gross Weight (Kg)" type="number" min="0" step="any" value={line.gross_weight} onChange={value => updateLine(index, 'gross_weight', value)} required />
                        <LineField label="Inventory Batch ID" value={line.inventory_batch_id} onChange={value => updateLine(index, 'inventory_batch_id', value)} />
                        <LineField label="Stock Entry No" value={line.stock_entry_no} onChange={value => updateLine(index, 'stock_entry_no', value)} />
                      </div>
                    </section>
                  ))}
                </div>
              </div>
              <div className="attendance-modal-footer">
                <div style={{ marginRight: 'auto', color: 'var(--att-muted)', fontSize: 10 }}>
                  Total: {lineItems.reduce((sum, line) => sum + (Number(line.master_cartons) || 0), 0)} MC · {lineItems.reduce((sum, line) => sum + (Number(line.net_weight) || 0), 0).toLocaleString()} Kg Net
                </div>
                <button type="button" className="attendance-btn attendance-btn-secondary" onClick={closeForm} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="attendance-btn attendance-btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function LineField({ label, value, onChange, type = 'text', required = false, ...inputProps }) {
  return (
    <div className="attendance-form-group">
      <label>{label}</label>
      <input
        className="attendance-input"
        type={type}
        value={value}
        onChange={event => onChange(event.target.value)}
        required={required}
        {...inputProps}
      />
    </div>
  );
}
