import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, Building2, Calculator, Download, FileText, Pencil, Plus, Printer, Ship, X, CheckCircle2, Send, Eye, RefreshCw, FileSpreadsheet, Search, Trash2, Layers } from 'lucide-react';
import '../Attendance/Attendance.css';
import './ProformaInvoices.css';
import ExportSearchPanel from './ExportSearchPanel';
import { secureDownload } from '../../utils/secureDownload';

const today = () => new Date().toISOString().slice(0, 10);

function AutoExpandInput({ className = "pi-print-input", style, value, onChange, placeholder, name, required, ...props }) {
  const ref = useRef(null);

  const adjustHeight = () => {
    const el = ref.current;
    if (el) {
      el.style.height = 'auto';
      const minH = style?.minHeight ? (typeof style.minHeight === 'number' ? style.minHeight : parseInt(style.minHeight, 10)) : 28;
      const targetHeight = Math.max(minH, el.scrollHeight || 0);
      el.style.height = `${targetHeight}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
    const t1 = setTimeout(adjustHeight, 40);
    const t2 = setTimeout(adjustHeight, 150);
    const t3 = setTimeout(adjustHeight, 350);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => adjustHeight());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <textarea
      ref={ref}
      className={className}
      name={name}
      value={value || ''}
      onChange={(e) => {
        if (onChange) onChange(e);
        adjustHeight();
      }}
      onFocus={adjustHeight}
      onInput={adjustHeight}
      placeholder={placeholder}
      required={required}
      rows={1}
      style={{
        resize: 'none',
        overflowY: 'hidden',
        lineHeight: 1.4,
        boxSizing: 'border-box',
        width: '100%',
        display: 'block',
        ...style
      }}
      {...props}
    />
  );
}

function EditableTextCell({ value, onChange, placeholder, style, multiline = false }) {
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      const adjust = () => {
        if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
        }
      };
      adjust();
      const timer = setTimeout(adjust, 50);
      return () => clearTimeout(timer);
    }
  }, [editing, value]);

  if (editing) {
    return multiline ? (
      <textarea
        ref={textareaRef}
        autoFocus
        className="pi-print-textarea"
        style={{ padding: '4px 6px', fontSize: 11.5, minHeight: 38, width: '100%', resize: 'vertical', overflowY: 'hidden', ...style }}
        value={value || ''}
        onChange={onChange}
        onInput={e => { e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
        onBlur={() => setEditing(false)}
        placeholder={placeholder}
      />
    ) : (
      <input
        autoFocus
        className="pi-print-input"
        style={{ padding: '4px 6px', fontSize: 11.5, width: '100%', ...style }}
        value={value || ''}
        onChange={onChange}
        onBlur={() => setEditing(false)}
        placeholder={placeholder}
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className="pi-editable-text-cell"
      title="Click to edit field"
      style={{
        padding: '4px 6px',
        fontSize: 11.5,
        fontWeight: style?.fontWeight || 600,
        color: value ? (style?.color || '#0f172a') : '#94a3b8',
        whiteSpace: 'pre-wrap',
        lineHeight: 1.45,
        wordBreak: 'break-word',
        width: '100%',
        boxSizing: 'border-box',
        ...style
      }}
    >
      {value || <span style={{ fontStyle: 'italic', opacity: 0.6 }}>{placeholder || 'Click to edit'}</span>}
    </div>
  );
}

const groupItemsByDescription = (itemsList) => {
  if (!Array.isArray(itemsList) || itemsList.length <= 1) return itemsList;

  const groups = new Map();
  itemsList.forEach(item => {
    const descKey = (item.product_description || item.item_name || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const brandKey = (item.brand || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const packKey = (item.packing_style || '').trim().replace(/\s+/g, ' ').toLowerCase();
    const key = `${descKey}|||${brandKey}|||${packKey}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(item);
  });

  const result = [];
  groups.forEach(groupItems => {
    result.push(...groupItems);
  });
  return result;
};

const getStandardTermsWithDate = (valDate) => {
  const formattedDate = valDate ? new Date(valDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : 'the validity date specified';
  return `1. Shipment Schedule: Expected shipment on or before ${formattedDate}.
2. Quantity Tolerance: Shipped quantity +/- 10% acceptable at final shipment as per actual container loading.
3. Quality & Inspection: Pre-shipment quality, count, glaze & net weight inspection by EIA / MPEDA authorized surveyors.
4. Payment & Documentation: Buyer to provide swift advice within 3 banking days of LC opening.
5. Validity & Force Majeure: Offer valid until ${formattedDate} and subject to vessel space availability.`;
};

const defaultStandardTerms = getStandardTermsWithDate('');

const emptyForm = (piNo = '', bank = {}) => ({
  pi_no: piNo, pi_date: today(), validity_date: '', po_number: '', buyer_name: '',
  buyer_address: '', country: '', currency: 'USD', incoterm: 'FOB', payment_terms: '',
  port_of_loading: '', port_of_discharge: '', product_description: '',
  consignee_name: '', notify_party: '',
  quantity: '', unit: 'KG', unit_price: '', status: 'DRAFT', remarks: defaultStandardTerms,
  brand: '', packing_style: '', freezer: '', count_glaze: '', weight_glaze: '',
  species: '', variety: '', grade: '', no_of_pieces: '', no_of_mc: '', items_json: '',
  bank_name: bank.bank_name || 'HDFC BANK LIMITED',
  account_number: bank.account_number || '50200084920194',
  ifsc_code: bank.ifsc_code || 'HDFC0001234',
  swift_code: bank.swift_code || 'HDFCINBBXXX',
  branch: bank.branch || 'APSEZ VISAKHAPATNAM BRANCH',
});

const createEmptyItem = () => ({
  product_description: '', item_name: '', brand: '', packing_style: '', freezer: '', count_glaze: '', weight_glaze: '',
  species: '', variety: '', grade: '', no_of_pieces: '', no_of_mc: 0,
  quantity: '', unit_price: '', total_amount: 0
});

const normalizeItem = it => {
  const specParts = [it.species, it.variety, it.glaze || it.count_glaze, it.brand, it.freezer].filter(Boolean).join(' ');
  const defaultDesc = it.product_description || it.item_name || (specParts ? `${specParts}` : 'Seafood Export Product');

  return {
    product_description: defaultDesc,
    item_name: it.item_name || defaultDesc,
    brand: it.brand || '',
    packing_style: it.packing_style || '',
    freezer: it.freezer || '',
    count_glaze: it.count_glaze || it.glaze || '',
    weight_glaze: it.weight_glaze || '',
    species: it.species || '',
    variety: it.variety || '',
    grade: it.grade || '',
    no_of_pieces: it.no_of_pieces || '',
    no_of_mc: Number(it.no_of_mc || it.mc || it.master_cartons || 0),
    quantity: (it.quantity !== undefined && it.quantity !== null && it.quantity !== '') 
      ? it.quantity 
      : (it.quantity_kg !== undefined && it.quantity_kg !== null ? it.quantity_kg : ''),
    unit_price: (it.unit_price !== undefined && it.unit_price !== null && it.unit_price !== '') 
      ? it.unit_price 
      : (it.rate_per_kg !== undefined && it.rate_per_kg !== null ? it.rate_per_kg : (it.bidding_price || '')),
    total_amount: Number(it.total_amount || it.amount || ((Number(it.quantity || it.quantity_kg || 0)) * (Number(it.unit_price || it.rate_per_kg || 0))))
  };
};

const statuses = ['DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED'];

export default function ProformaInvoices({ setActivePage }) {
  const navigate = useNavigate();
  const formSectionRef = useRef(null);
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [form, setForm] = useState(emptyForm);
  const [items, setItems] = useState([createEmptyItem()]);
  const [editingId, setEditingId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [canApprove, setCanApprove] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [showAudit, setShowAudit] = useState(false);
  const [companyInfo, setCompanyInfo] = useState({
    name: 'BHAGAVATHI KRISHNA EXPORTS',
    address: 'Survey No 142/2, APSEZ, Atchutapuram, Visakhapatnam - 531011, AP, India',
    email: 'export@bknrexports.com',
    phone: '+91 891 2748899',
    code: 'BKNR-EXP-01',
    bank: {
      bank_name: '',
      account_number: '',
      ifsc_code: '',
      swift_code: '',
      branch: '',
    }
  });
  const [buyerOptions, setBuyerOptions] = useState([]);
  const [countryOptions, setCountryOptions] = useState([]);
  const [brandOptions, setBrandOptions] = useState([]);
  const [packingOptions, setPackingOptions] = useState([]);

  // EMAIL MODAL STATE
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailForm, setEmailForm] = useState({
    row_id: null,
    pi_no: '',
    to_email: '',
    subject: '',
    body: '',
  });
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailFile, setEmailFile] = useState(null);

  // PENDING ORDERS SELECTION MODAL STATE
  const [pendingModalOpen, setPendingModalOpen] = useState(false);
  const [pendingTargetRow, setPendingTargetRow] = useState(null);
  const [pendingForm, setPendingForm] = useState({
    company_name: '',
    production_at: '',
    buyer_name: '',
    agent_name: 'Direct',
    po_number: '',
  });
  const [submittingPending, setSubmittingPending] = useState(false);

  const openSendEmailModal = (row) => {
    const buyerObj = buyerOptions.find(b => b.name === row.buyer_name);
    const toEmail = buyerObj?.email || row.buyer_email || '';
    const piNumber = row.pi_no || form.pi_no || 'PI-2026-0001';
    setEmailForm({
      row_id: row.id || editingId,
      pi_no: piNumber,
      to_email: toEmail,
      subject: `Proforma Invoice ${piNumber} - BHAGAVATHI KRISHNA EXPORTS`,
      body: `Dear ${row.buyer_name || form.buyer_name || 'Customer'},\n\nPlease find attached the official Proforma Invoice (${piNumber}) for your review and records.\n\nBest Regards,\nBHAGAVATHI KRISHNA EXPORTS`,
    });
    setEmailModalOpen(true);
    setEmailFile(null);
  };

  const handleSendEmail = async (e) => {
    e.preventDefault();
    if (!emailForm.to_email) {
      setNotice({ type: 'error', text: 'Please enter a valid recipient email address.' });
      return;
    }
    if (!emailForm.row_id) {
      setNotice({ type: 'error', text: 'Please save the PI first before sending email.' });
      return;
    }
    setSendingEmail(true);
    try {
      const formData = new FormData();
      formData.append('to_email', emailForm.to_email);
      formData.append('subject', emailForm.subject);
      formData.append('body', emailForm.body);
      if (emailFile) {
        formData.append('file', emailFile);
      }
      const res = await fetch(`/export_documents/proforma_invoice/send-email/${emailForm.row_id}`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to send email');
      setNotice({ type: 'success', text: `Email with attached PDF sent successfully! Opening CRM Chat...` });
      setEmailModalOpen(false);

      sessionStorage.setItem('openChatQuery', emailForm.pi_no);
      if (form.po_number) {
        sessionStorage.setItem('openChatPo', form.po_number);
      }

      setTimeout(() => {
        if (typeof setActivePage === 'function') {
          setActivePage('crm_qt', '/crm/quotation/entry');
        } else if (navigate) {
          navigate('/crm/quotation/entry');
        } else {
          window.location.hash = '#crm_qt';
        }
      }, 500);
    } catch (err) {
      setNotice({ type: 'error', text: err.message });
    } finally {
      setSendingEmail(false);
    }
  };
  const [freezerOptions, setFreezerOptions] = useState([]);
  const [glazeOptions, setGlazeOptions] = useState([]);
  const [speciesOptions, setSpeciesOptions] = useState([]);
  const [varietyOptions, setVarietyOptions] = useState([]);
  const [gradeOptions, setGradeOptions] = useState([]);
  const [agentOptions, setAgentOptions] = useState([]);
  const [productionForOptions, setProductionForOptions] = useState([]);
  const [productionAtOptions, setProductionAtOptions] = useState([]);
  const [nextPiNo, setNextPiNo] = useState('');

  useEffect(() => {
    const isAnyModalOpen = modalOpen || emailModalOpen || pendingModalOpen;
    if (isAnyModalOpen) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    if (modalOpen && formSectionRef.current) {
      formSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    return () => document.body.classList.remove('modal-open');
  }, [modalOpen, emailModalOpen, pendingModalOpen]);

  const notify = useCallback((msg, type = 'success') => {
    setNotice({ msg, type });
    window.setTimeout(() => setNotice(null), 4000);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const response = await fetch('/export_documents/proforma_invoice/data', { headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.detail || data.message || 'Unable to load data');
      setRows(data.rows || []);
      setCanApprove(Boolean(data.can_approve));
      if (data.company) {
        setCompanyInfo(curr => ({
          ...curr,
          name: data.company.name || curr.name,
          address: data.company.address || curr.address,
          email: data.company.email || curr.email,
          phone: data.company.phone || curr.phone,
          code: data.company.code || curr.code,
          bank: data.company.bank || curr.bank,
        }));
      }
      setAuditLogs(data.audit_logs || []);
      setBuyerOptions(data.buyers || []);
      setAgentOptions(data.agents || []);
      setCountryOptions(data.countries || []);
      setBrandOptions(data.brands || []);
      setPackingOptions(data.packing_styles || []);
      setFreezerOptions(data.freezers || []);
      setGlazeOptions(data.glazes || []);
      setSpeciesOptions(data.species || []);
      setVarietyOptions(data.varieties || []);
      setGradeOptions(data.grades || []);
      setProductionForOptions(data.production_for_options || []);
      setProductionAtOptions(data.production_at_options || []);
      setNextPiNo(data.next_pi_no || '');

      const highlightQt = sessionStorage.getItem('highlight_quotation_no');
      if (highlightQt) {
        const found = (data.rows || []).find(r => 
          (r.po_number && r.po_number.includes(highlightQt)) || 
          (r.remarks && r.remarks.includes(highlightQt))
        );

        if (found) {
          setQuery(found.pi_no);
          notify(`Auto-loaded Proforma Invoice ${found.pi_no} created for Quotation ${highlightQt}`, 'success');
        } else {
          setQuery('');
        }
        sessionStorage.removeItem('highlight_quotation_no');
      }
    } catch (error) {
      notify(error.message || 'Unable to load proforma invoices', 'error');
    }
  }, [notify]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter(row => {
      const matchesStatus = statusFilter === 'ALL' || row.status === statusFilter;
      const haystack = `${row.pi_no} ${row.po_number || ''} ${row.buyer_name} ${row.country} ${row.species || ''} ${row.variety || ''} ${row.grade || ''}`.toLowerCase();
      return matchesStatus && (!term || haystack.includes(term));
    });
  }, [query, rows, statusFilter]);

  const stats = useMemo(() => {
    const totalCount = rows.length;
    const acceptedCount = rows.filter(r => r.status === 'ACCEPTED').length;
    const sentCount = rows.filter(r => r.status === 'SENT').length;
    const draftCount = rows.filter(r => r.status === 'DRAFT').length;
    const totalVal = rows.reduce((acc, r) => acc + (Number(r.total_amount) || (Number(r.quantity || 0) * Number(r.unit_price || 0))), 0);
    return { totalCount, acceptedCount, sentCount, draftCount, totalVal };
  }, [rows]);

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm(nextPiNo, companyInfo.bank));
    setItems([createEmptyItem()]);
    setModalOpen(true);
  };

  const openEdit = row => {
    setEditingId(row.id);
    let parsedItems = [];
    if (row.items_json) {
      try {
        const raw = JSON.parse(row.items_json);
        if (Array.isArray(raw)) parsedItems = raw.map(normalizeItem);
      } catch (e) {}
    }
    if (!Array.isArray(parsedItems) || parsedItems.length === 0) {
      parsedItems = [normalizeItem(row)];
    }
    setItems(groupItemsByDescription(parsedItems));
    const existingRemarks = (row.remarks || '').trim();
    const isGenericAutoRemarks = !existingRemarks || existingRemarks.startsWith('Auto-created from accepted Quotation') || !existingRemarks.includes('1. Shipment Schedule');
    const finalRemarks = isGenericAutoRemarks ? getStandardTermsWithDate(row.validity_date) : existingRemarks;

    setForm({
      ...emptyForm('', companyInfo.bank), ...row,
      validity_date: row.validity_date || '', po_number: row.po_number || '',
      consignee_name: row.consignee_name || '', notify_party: row.notify_party || '',
      port_of_loading: row.port_of_loading || '', port_of_discharge: row.port_of_discharge || '',
      remarks: finalRemarks,
      bank_name: companyInfo.bank?.bank_name || 'HDFC BANK LIMITED',
      account_number: companyInfo.bank?.account_number || '50200084920194',
      ifsc_code: companyInfo.bank?.ifsc_code || 'HDFC0001234',
      swift_code: companyInfo.bank?.swift_code || 'HDFCINBBXXX',
      branch: companyInfo.bank?.branch || 'APSEZ VISAKHAPATNAM BRANCH',
    });
    setModalOpen(true);
  };

  const change = event => {
    const { name, value } = event.target;
    setForm(current => {
      const updated = { ...current, [name]: value };
      if (name === 'validity_date' && value) {
        if (!current.remarks || current.remarks.includes('Shipment Schedule')) {
          updated.remarks = getStandardTermsWithDate(value);
        }
      }
      return updated;
    });
  };

  const changeBuyer = event => {
    const buyerName = event.target.value;
    const buyer = buyerOptions.find(item => item.name === buyerName);
    setForm(current => ({
      ...current,
      buyer_name: buyerName,
      buyer_address: buyer?.address || '',
      country: buyer?.country || current.country,
      currency: buyer?.currency || current.currency,
      payment_terms: buyer?.payment_terms || current.payment_terms,
    }));
  };

  const updateItem = (index, field, value) => {
    setItems(curr => {
      const copy = [...curr];
      copy[index] = { ...copy[index], [field]: value };
      const q = Number(copy[index].quantity) || 0;
      const p = Number(copy[index].unit_price) || 0;
      copy[index].total_amount = q * p;
      return copy;
    });
  };

  const updateMergedField = (startIdx, span, field, value) => {
    setItems(curr => {
      const copy = [...curr];
      for (let k = startIdx; k < startIdx + span; k++) {
        if (k === startIdx || !copy[k]._isUnmerged) {
          copy[k] = { ...copy[k], [field]: value };
        }
      }
      return copy;
    });
  };

  const toggleRowUnmerge = useCallback((idx) => {
    setItems(currItems => {
      const newItems = [...currItems];
      const target = newItems[idx];
      if (!target) return currItems;

      if (!target._isUnmerged) {
        let parentDesc = target.product_description || '';
        let parentBrand = target.brand || '';
        let parentPack = target.packing_style || '';

        if (!parentDesc) {
          for (let k = idx - 1; k >= 0; k--) {
            const prevDesc = (newItems[k].product_description || '').trim();
            if (prevDesc) {
              parentDesc = newItems[k].product_description || '';
              parentBrand = newItems[k].brand || '';
              parentPack = newItems[k].packing_style || '';
              break;
            }
          }
        }

        newItems[idx] = {
          ...target,
          product_description: parentDesc,
          brand: parentBrand,
          packing_style: parentPack,
          _isUnmerged: true,
        };
        notify(`Row #${idx + 1} description activated for independent editing`, 'info');
      } else {
        newItems[idx] = {
          ...target,
          _isUnmerged: false,
        };
        notify(`Row #${idx + 1} re-merged with group`, 'info');
      }
      return newItems;
    });
  }, [notify]);

  const rowSpans = useMemo(() => {
    const spans = new Array(items.length).fill(1);
    let i = 0;
    while (i < items.length) {
      let span = 1;
      if (items[i]._isUnmerged) {
        spans[i] = 1;
        i++;
        continue;
      }

      const desc = (items[i].product_description || items[i].item_name || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const brand = (items[i].brand || '').trim().replace(/\s+/g, ' ').toLowerCase();
      const pack = (items[i].packing_style || '').trim().replace(/\s+/g, ' ').toLowerCase();

      for (let j = i + 1; j < items.length; j++) {
        if (items[j]._isUnmerged) break;

        const nextDesc = (items[j].product_description || items[j].item_name || '').trim().replace(/\s+/g, ' ').toLowerCase();
        const nextBrand = (items[j].brand || '').trim().replace(/\s+/g, ' ').toLowerCase();
        const nextPack = (items[j].packing_style || '').trim().replace(/\s+/g, ' ').toLowerCase();

        const matchDesc = desc && nextDesc && desc === nextDesc;
        const matchBrand = (!brand && !nextBrand) || (brand === nextBrand);
        const matchPack = (!pack && !nextPack) || (pack === nextPack);

        if (matchDesc && matchBrand && matchPack) {
          span++;
        } else {
          break;
        }
      }
      spans[i] = span;
      for (let k = i + 1; k < i + span; k++) {
        spans[k] = 0;
      }
      i += span;
    }
    return spans;
  }, [items]);

  const autoGroupItems = () => {
    setItems(curr => groupItemsByDescription(curr));
    notify('Items grouped by product description', 'success');
  };

  const addItemRow = () => setItems(curr => [...curr, createEmptyItem()]);
  const removeItemRow = index => setItems(curr => curr.length > 1 ? curr.filter((_, i) => i !== index) : curr);

  const subTotals = useMemo(() => {
    const totalMC = items.reduce((acc, it) => acc + (Number(it.no_of_mc) || 0), 0);
    const totalQty = items.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0);
    const totalAmt = items.reduce((acc, it) => acc + ((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)), 0);
    return { totalMC, totalQty, totalAmt };
  }, [items]);

  const grandTotal = useMemo(() => {
    if (items.length > 0) {
      return subTotals.totalAmt;
    }
    return (Number(form.quantity) || 0) * (Number(form.unit_price) || 0);
  }, [items, subTotals.totalAmt, form.quantity, form.unit_price]);

  const save = async event => {
    event.preventDefault();
    if (form.validity_date && form.validity_date < form.pi_date) {
      notify('Valid Until date cannot be before PI Date.', 'error');
      return;
    }
    if (!form.buyer_name.trim() || !form.buyer_address.trim()) {
      notify('Buyer and buyer address are required.', 'error');
      return;
    }

    const firstItem = items[0] || {};
    const totalQty = subTotals.totalQty || Number(form.quantity) || 0;
    const avgPrice = items.length > 0 && totalQty > 0 ? (grandTotal / totalQty) : (Number(form.unit_price) || 0);
    const totalMC = subTotals.totalMC;

    if (totalQty <= 0 || avgPrice < 0) {
      notify('Quantity must be greater than zero and unit price cannot be negative.', 'error');
      return;
    }

    if (!window.confirm(`Do you want to ${editingId ? 'update' : 'save'} this invoice?`)) return;
    setSaving(true);
    try {
      const payload = {
        ...form,
        brand: firstItem.brand || form.brand || null,
        packing_style: firstItem.packing_style || form.packing_style || null,
        freezer: firstItem.freezer || form.freezer || null,
        count_glaze: firstItem.count_glaze || form.count_glaze || null,
        weight_glaze: firstItem.weight_glaze || form.weight_glaze || null,
        species: firstItem.species || form.species || null,
        variety: firstItem.variety || form.variety || null,
        grade: firstItem.grade || form.grade || null,
        no_of_pieces: firstItem.no_of_pieces || form.no_of_pieces || null,
        no_of_mc: totalMC,
        quantity: totalQty,
        unit_price: avgPrice,
        items_json: JSON.stringify(items),
        validity_date: form.validity_date || null,
        po_number: form.po_number || null,
        port_of_loading: form.port_of_loading || null,
        port_of_discharge: form.port_of_discharge || null,
        remarks: form.remarks || null,
      };

      const response = await fetch(
        editingId ? `/export_documents/proforma_invoice/${editingId}` : '/export_documents/proforma_invoice/save',
        { method: editingId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        let errStr = data.message;
        if (data.detail) {
          if (typeof data.detail === 'string') {
            errStr = data.detail;
          } else if (Array.isArray(data.detail)) {
            errStr = data.detail.map(e => `${e.loc ? e.loc.slice(-1)[0] : 'Field'}: ${e.msg}`).join('; ');
          } else if (typeof data.detail === 'object') {
            errStr = JSON.stringify(data.detail);
          }
        }
        throw new Error(errStr || 'Save failed');
      }
      setModalOpen(false);
      await loadData();
      notify(data.message);
    } catch (error) {
      notify(error.message || 'Unable to save proforma invoice', 'error');
    } finally {
      setSaving(false);
    }
  };

  const cancelRow = async row => {
    if (!window.confirm(`Cancel proforma invoice ${row.pi_no}?`)) return;
    try {
      const response = await fetch(`/export_documents/proforma_invoice/cancel/${row.id}`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Cancel failed');
      await loadData();
      notify(data.message);
    } catch (error) {
      notify(error.message || 'Unable to cancel proforma invoice', 'error');
    }
  };

  const confirmAndPrint = row => {
    const docNo = row.pi_no || row.document_no || `#${row.id}`;
    if (window.confirm(`Do you want to print Proforma Invoice ${docNo}?`)) {
      const win = window.open(`/export_documents/proforma_invoice/print/${row.id}`, '_blank');
      if (win) win.focus();
    }
  };

  const confirmAndDownloadPdf = row => {
    const docNo = row.pi_no || row.document_no || `#${row.id}`;
    if (window.confirm(`Do you want to download PDF for Proforma Invoice ${docNo}?`)) {
      const cleanName = String(docNo).replace(/[^a-zA-Z0-9_-]/g, '_');
      const pdfUrl = `/export_documents/proforma_invoice/pdf/${row.id}?download=true`;
      
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = `${cleanName}.pdf`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        try { document.body.removeChild(link); } catch (e) {}
      }, 300);
    }
  };

  const decideApproval = async (row, decision) => {
    const remarks = decision === 'REJECTED' ? window.prompt('Enter rejection reason:') : '';
    if (decision === 'REJECTED' && !remarks) return;
    if (decision === 'APPROVED' && !window.confirm(`Approve proforma invoice ${row.pi_no}?`)) return;
    try {
      const response = await fetch(`/export_documents/proforma_invoice/${row.id}/approval`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, remarks: remarks || null }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Approval failed');
      await loadData();
      notify(data.message);
    } catch (error) {
      notify(error.message || 'Unable to update approval', 'error');
    }
  };

  const openAddToPendingModal = row => {
    setPendingTargetRow(row);
    const oldInfo = row.pending_order_info;
    setPendingForm({
      company_name: oldInfo?.company_name || companyInfo.name || 'BHAGAVATHI KRISHNA EXPORTS',
      production_at: oldInfo?.production_at || row.port_of_loading || 'APSEZ Plant',
      buyer_name: oldInfo?.buyer_name || row.buyer_name || '',
      agent_name: oldInfo?.agent_name || row.buyer_agent || 'Direct',
      po_number: oldInfo?.po_number || row.po_number || row.pi_no || '',
    });
    setPendingModalOpen(true);
  };

  const submitPendingOrder = async e => {
    if (e) e.preventDefault();
    if (!pendingTargetRow) return;
    try {
      setSubmittingPending(true);
      const response = await fetch(`/export_documents/proforma_invoice/${pendingTargetRow.id}/add-to-pending-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: pendingForm.company_name,
          production_at: pendingForm.production_at,
          buyer_name: pendingForm.buyer_name,
          agent_name: pendingForm.agent_name,
          po_number: pendingForm.po_number,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Failed to add to Pending Orders');
      setPendingModalOpen(false);
      await loadData();
      notify(data.message, 'success');
    } catch (error) {
      notify(error.message || 'Unable to add to Pending Orders', 'error');
    } finally {
      setSubmittingPending(false);
    }
  };

  return (
    <div className="attendance-container export-document-page">
      {notice && <div className={`attendance-toast ${notice.type === 'error' ? 'error' : 'success'}`} style={{ top: 80 }}>{notice.msg}</div>}

      {/* HEADER SECTION */}
      <div className="attendance-page-header">
        <div>
          <h1>Proforma Invoice Register</h1>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--att-muted)' }}>
            Prepare commercial buyer offers, auto-generate PIs from Sales Quotations, and track approval workflows.
          </p>
        </div>
        <div className="attendance-page-header-actions">
          <button className="attendance-btn attendance-btn-secondary" onClick={() => setShowAudit(value => !value)}>
            AUDIT LOGS ({auditLogs.length})
          </button>
          <button className="attendance-btn attendance-btn-secondary" onClick={() => secureDownload('/export_documents/proforma_invoice/register.xlsx', 'Proforma Invoice Register')}>
            <Download size={16} /> EXPORT
          </button>
          <button className="attendance-btn attendance-btn-primary" onClick={() => modalOpen ? setModalOpen(false) : openNew()}>
            <Plus size={16} /> {modalOpen ? 'HIDE FORM' : 'NEW PROFORMA INVOICE'}
          </button>
        </div>
      </div>

      {/* SUMMARY KPI CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 16 }}>
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>Total Invoices</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', marginTop: 4 }}>{stats.totalCount}</div>
        </div>
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', textTransform: 'uppercase' }}>Accepted PIs</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#16a34a', marginTop: 4 }}>{stats.acceptedCount}</div>
        </div>
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#2563eb', textTransform: 'uppercase' }}>Sent Offers</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#2563eb', marginTop: 4 }}>{stats.sentCount}</div>
        </div>
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#d97706', textTransform: 'uppercase' }}>Draft Invoices</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#d97706', marginTop: 4 }}>{stats.draftCount}</div>
        </div>
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: '12px 16px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#1e40af', textTransform: 'uppercase' }}>Total Order Value (USD)</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#1e3a8a', marginTop: 4 }}>
            ${stats.totalVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      {/* AUDIT LOG OVERLAY */}
      {showAudit && (
        <section className="requirement-inline-form" style={{ marginBottom: 16 }}>
          <div className="requirement-inline-form-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Proforma Invoice Audit Trail Logs</h3>
            <button type="button" className="attendance-btn attendance-btn-secondary" onClick={() => setShowAudit(false)}><X size={16} /> CLOSE</button>
          </div>
          <div style={{ padding: 12, maxHeight: 300, overflowY: 'auto' }}>
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>PI Number</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map(log => (
                  <tr key={log.id}>
                    <td style={{ fontSize: 11 }}>{log.edited_at || log.created_at || '—'}</td>
                    <td style={{ fontSize: 11, fontWeight: 600 }}>{log.edited_by || log.user_email || 'System'}</td>
                    <td><strong style={{ color: '#2563eb', fontSize: 11 }}>{log.action}</strong></td>
                    <td style={{ fontSize: 11, fontWeight: 700 }}>{log.record_id || log.target_id ? `PI #${log.record_id || log.target_id}` : '—'}</td>
                    <td style={{ fontSize: 11 }}>
                      {log.old_value || log.new_value ? (
                        <span>
                          {log.old_value && <span style={{ color: '#64748b' }}>From: <strong>{log.old_value}</strong> </span>}
                          {log.new_value && <span style={{ color: '#16a34a' }}>To: <strong>{log.new_value}</strong></span>}
                        </span>
                      ) : (
                        log.details || '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* CREATE / EDIT FORM MODAL POPUP (WYSIWYG PRINT DOCUMENT FORMAT) */}
      {modalOpen && (
        <div className="attendance-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div className="attendance-modal-content" style={{ maxWidth: 1180, width: '96vw' }}>
            <div className="attendance-modal-header">
              <div>
                <h2>{editingId ? 'Edit' : 'Create'} Proforma Invoice</h2>
              </div>
              <button type="button" className="attendance-modal-close-btn" onClick={() => setModalOpen(false)} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={save}>
              <div className="attendance-modal-body" style={{ padding: 18 }}>
                
                {/* DIRECT PRINT DOCUMENT SHEET */}
                <div className="pi-print-document-sheet">
                  <div className="pi-print-brand-bar"></div>

                  {/* DOCUMENT HEADER BANNER */}
                  <div className="pi-print-header-grid" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#1e3a8a', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                        PROFORMA INVOICE
                      </h1>
                    </div>
                    <div className="pi-print-doc-box">
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <small style={{ fontWeight: 800, color: '#64748b' }}>PI #:</small>
                        <input className="pi-print-input" style={{ width: 130, fontWeight: 900, color: '#1e3a8a' }} name="pi_no" value={form.pi_no} onChange={change} required placeholder="PI-2026-0001" />
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                        <small style={{ fontWeight: 800, color: '#64748b' }}>PI Date:</small>
                        <input type="date" className="pi-print-input" style={{ width: 130 }} name="pi_date" value={form.pi_date} onChange={change} required />
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                        <small style={{ fontWeight: 800, color: '#2563eb' }}>Valid Until:</small>
                        <input type="date" className="pi-print-input" style={{ width: 130 }} name="validity_date" min={form.pi_date} value={form.validity_date} onChange={change} />
                      </div>
                    </div>
                  </div>

                  {/* 3-COLUMN PARTIES GRID (RESPONSIVE 2-COL ON MOBILE): Exporter, Buyer, Consignee/Notify */}
                  <div className="pi-print-parties-grid">
                    <div className="pi-print-party-box">
                      <span className="pi-print-party-label">EXPORTER / SELLER</span>
                      <strong style={{ color: '#0f172a', fontSize: 12.5 }}>{companyInfo.name || 'BHAGAVATHI KRISHNA EXPORTS'}</strong>
                      <p style={{ margin: 0, fontSize: 11, color: '#475569' }}>{companyInfo.address || 'APSEZ, Visakhapatnam, AP, India'}</p>
                      {companyInfo.email && <p style={{ margin: 0, fontSize: 10.5, color: '#475569' }}>Email: {companyInfo.email} {companyInfo.phone ? `| Tel: ${companyInfo.phone}` : ''}</p>}
                    </div>

                    <div className="pi-print-party-box">
                      <span className="pi-print-party-label">BUYER / BILL TO *</span>
                      <select className="pi-print-select" name="buyer_name" value={form.buyer_name} onChange={changeBuyer} required>
                        <option value="">Select Buyer Customer</option>
                        {buyerOptions.map(buyer => <option key={buyer.name} value={buyer.name}>{buyer.name}{buyer.country ? ` · ${buyer.country}` : ''}</option>)}
                        {form.buyer_name && !buyerOptions.some(buyer => buyer.name === form.buyer_name) && <option value={form.buyer_name}>{form.buyer_name}</option>}
                      </select>
                      <AutoExpandInput
                        className="pi-print-textarea"
                        name="buyer_address"
                        value={form.buyer_address}
                        onChange={change}
                        required
                        placeholder="Complete Buyer Billing & Shipping Address"
                        style={{ width: '100%', minHeight: 48, resize: 'none', overflowY: 'hidden' }}
                      />
                      <select className="pi-print-select" name="country" value={form.country} onChange={change} required>
                        <option value="">Select Country</option>
                        {countryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                        {form.country && !countryOptions.includes(form.country) && <option value={form.country}>{form.country}</option>}
                      </select>
                    </div>

                    <div className="pi-print-party-box">
                      <span className="pi-print-party-label">CONSIGNEE / NOTIFY PARTY</span>
                      <AutoExpandInput name="consignee_name" value={form.consignee_name || ''} onChange={change} placeholder="Consignee Name (Optional)" style={{ fontWeight: 700 }} />
                      <AutoExpandInput
                        className="pi-print-textarea"
                        name="notify_party"
                        value={form.notify_party || ''}
                        onChange={change}
                        placeholder="Notify Party Name, Address & Contact Details"
                        style={{ width: '100%', minHeight: 52, resize: 'none', overflowY: 'hidden' }}
                      />
                    </div>
                  </div>

                  {/* SECTION 1: COMMERCIAL & SHIPPING TERMS */}
                  <div className="pi-print-section-title">1. Commercial & Shipping Terms</div>
                  <div className="pi-print-facts-grid">
                    <div className="pi-print-fact-item">
                      <small>Trade Incoterm *</small>
                      <select className="pi-print-select" name="incoterm" value={form.incoterm} onChange={change}>
                        {['FOB', 'CFR', 'CIF', 'EXW', 'FCA', 'CPT', 'CIP', 'DDP'].map(inc => <option key={inc} value={inc}>{inc}</option>)}
                      </select>
                    </div>
                    <div className="pi-print-fact-item">
                      <small>Payment Terms *</small>
                      <AutoExpandInput name="payment_terms" value={form.payment_terms} onChange={change} required placeholder="Advance / LC / Documents" style={{ fontWeight: 700 }} />
                    </div>
                    <div className="pi-print-fact-item">
                      <small>Trade Currency *</small>
                      <select className="pi-print-select" name="currency" value={form.currency} onChange={change}>
                        {['USD', 'EUR', 'GBP', 'AED', 'JPY', 'INR'].map(cur => <option key={cur} value={cur}>{cur}</option>)}
                      </select>
                    </div>
                    <div className="pi-print-fact-item">
                      <small>Port of Loading</small>
                      <AutoExpandInput name="port_of_loading" value={form.port_of_loading} onChange={change} placeholder="Loading Port" style={{ fontWeight: 600 }} />
                    </div>
                    <div className="pi-print-fact-item">
                      <small>Port of Discharge</small>
                      <AutoExpandInput name="port_of_discharge" value={form.port_of_discharge} onChange={change} placeholder="Destination Port" style={{ fontWeight: 600 }} />
                    </div>
                  </div>

                  {/* COMPANY BANK DETAILS FOR WIRE TRANSFER (Under Commercial Terms) */}
                  <div style={{ marginTop: 10 }}>
                    <div className="pi-print-section-title">Company Bank Details for Payment Wire Transfer</div>
                    <div className="pi-print-facts-grid" style={{ marginTop: 4 }}>
                      <div className="pi-print-fact-item">
                        <small>Beneficiary Bank *</small>
                        <AutoExpandInput name="bank_name" value={form.bank_name || ''} onChange={change} required placeholder="Bank Name" style={{ fontWeight: 700 }} />
                      </div>
                      <div className="pi-print-fact-item">
                        <small>Account Number *</small>
                        <AutoExpandInput name="account_number" value={form.account_number || ''} onChange={change} required placeholder="Account No" style={{ fontWeight: 700, color: '#1e3a8a' }} />
                      </div>
                      <div className="pi-print-fact-item">
                        <small>IFSC Code *</small>
                        <AutoExpandInput name="ifsc_code" value={form.ifsc_code || ''} onChange={change} required placeholder="IFSC Code" style={{ fontWeight: 700 }} />
                      </div>
                      <div className="pi-print-fact-item">
                        <small>SWIFT / BIC Code</small>
                        <AutoExpandInput name="swift_code" value={form.swift_code || ''} onChange={change} placeholder="SWIFT Code" style={{ fontWeight: 700, color: '#2563eb' }} />
                      </div>
                      <div className="pi-print-fact-item">
                        <small>Bank Branch</small>
                        <AutoExpandInput name="branch" value={form.branch || ''} onChange={change} placeholder="Branch Location" style={{ fontWeight: 700 }} />
                      </div>
                    </div>
                  </div>


                  {/* SECTION 2: PRODUCT SPECIFICATIONS & SCHEDULE */}
                  <div className="pi-print-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>2. Product Specifications & Line Items Schedule</span>
                    <button type="button" className="attendance-btn attendance-btn-secondary" style={{ padding: '2px 8px', fontSize: 10 }} onClick={addItemRow}>
                      <Plus size={13} /> ADD ITEM ROW
                    </button>
                  </div>

                  <div className="pi-mail-format-table-wrap">
                    <table className="pi-print-items-table" style={{ minWidth: 1050 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 28, textAlign: 'center' }}>#</th>
                          <th style={{ minWidth: 200 }}>Product Description</th>
                          <th style={{ minWidth: 90 }}>Brand</th>
                          <th style={{ minWidth: 110 }}>Packing Style</th>
                          <th style={{ width: 90 }}>Grade</th>
                          <th style={{ width: 75, textAlign: 'right' }}>MC</th>
                          <th style={{ width: 95, textAlign: 'right' }}>Qty ({form.unit})</th>
                          <th style={{ width: 95, textAlign: 'right' }}>Rate ({form.currency})</th>
                          <th style={{ width: 115 }} className="num">Total Amount</th>
                          <th style={{ width: 30, textAlign: 'center' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((it, idx) => {
                          const descSpan = rowSpans[idx];
                          return (
                            <tr key={idx}>
                              <td
                                onClick={() => toggleRowUnmerge(idx)}
                                style={{
                                  textAlign: 'center',
                                  fontWeight: 800,
                                  color: it._isUnmerged ? '#2563eb' : '#64748b',
                                  fontSize: 11,
                                  cursor: 'pointer',
                                  userSelect: 'none',
                                  background: it._isUnmerged ? '#eff6ff' : 'transparent',
                                }}
                                title="Click SL# to activate & edit this row's description independently"
                              >
                                <div>{idx + 1}</div>
                                {it._isUnmerged ? (
                                  <small style={{ display: 'block', fontSize: 8, color: '#2563eb', fontWeight: 700, lineHeight: 1 }}>EDIT</small>
                                ) : descSpan === 0 ? (
                                  <small style={{ display: 'block', fontSize: 8, color: '#94a3b8', fontWeight: 600, lineHeight: 1 }}>SPLIT</small>
                                ) : null}
                              </td>
                              
                              {/* PRODUCT DESCRIPTION MERGED CELL */}
                              {descSpan > 0 && (
                                <td rowSpan={descSpan} style={{ verticalAlign: 'top' }}>
                                  <EditableTextCell
                                    multiline
                                    value={it.product_description || ''}
                                    onChange={e => updateMergedField(idx, descSpan, 'product_description', e.target.value)}
                                    placeholder="Full Product Description"
                                    style={{ fontWeight: 600 }}
                                  />
                                </td>
                              )}

                              {/* BRAND MERGED CELL */}
                              {descSpan > 0 && (
                                <td rowSpan={descSpan} style={{ verticalAlign: 'top' }}>
                                  <EditableTextCell
                                    value={it.brand || ''}
                                    onChange={e => updateMergedField(idx, descSpan, 'brand', e.target.value)}
                                    placeholder="Brand (e.g. BKNR)"
                                    style={{ fontWeight: 600 }}
                                  />
                                </td>
                              )}

                              {/* PACKING STYLE MERGED CELL */}
                              {descSpan > 0 && (
                                <td rowSpan={descSpan} style={{ verticalAlign: 'top' }}>
                                  <EditableTextCell
                                    value={it.packing_style || ''}
                                    onChange={e => updateMergedField(idx, descSpan, 'packing_style', e.target.value)}
                                    placeholder="Packing (e.g. 10X1 KG)"
                                    style={{ fontWeight: 600 }}
                                  />
                                </td>
                              )}

                              <td>
                                <select className="pi-print-select" style={{ padding: '3px 6px', fontSize: 11.5 }} value={it.grade || ''} onChange={e => updateItem(idx, 'grade', e.target.value)}>
                                  <option value="">Grade</option>
                                  {gradeOptions.map(o => <option key={o} value={o}>{o}</option>)}
                                  {it.grade && !gradeOptions.includes(it.grade) && <option value={it.grade}>{it.grade}</option>}
                                </select>
                              </td>
                              <td>
                                <input type="number" min="0" className="pi-print-input" style={{ padding: '3px 6px', fontSize: 11.5, textAlign: 'right' }} value={it.no_of_mc || ''} onChange={e => updateItem(idx, 'no_of_mc', e.target.value)} placeholder="0" />
                              </td>
                              <td>
                                <input type="number" min="0" step="0.001" className="pi-print-input" style={{ padding: '3px 6px', fontSize: 11.5, textAlign: 'right' }} value={it.quantity || ''} onChange={e => updateItem(idx, 'quantity', e.target.value)} placeholder="0.000" required />
                              </td>
                              <td>
                                <input type="number" min="0" step="0.0001" className="pi-print-input" style={{ padding: '3px 6px', fontSize: 11.5, textAlign: 'right' }} value={it.unit_price || ''} onChange={e => updateItem(idx, 'unit_price', e.target.value)} placeholder="0.00" required />
                              </td>
                              <td className="num" style={{ fontWeight: 800, color: '#1e3a8a', fontSize: 11.5 }}>
                                {form.currency} {(Number(it.quantity || 0) * Number(it.unit_price || 0)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <button type="button" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#ef4444' }} onClick={() => removeItemRow(idx)} title="Remove item">
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {/* SUB-TOTALS ROW */}
                        <tr className="pi-subtotal-row">
                          <td colSpan="5" style={{ textAlign: 'right', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                            SUB TOTAL:
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 900, color: '#1e3a8a' }}>
                            {subTotals.totalMC.toLocaleString()}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 900, color: '#1e3a8a' }}>
                            {subTotals.totalQty.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {form.unit}
                          </td>
                          <td style={{ textAlign: 'center', color: '#64748b' }}>—</td>
                          <td className="num" style={{ fontWeight: 900, color: '#1e3a8a', fontSize: 12 }}>
                            {form.currency} {subTotals.totalAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                          <td></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* TOTAL MC IMMEDIATELY BELOW LINE ITEMS SCHEDULE TABLE */}
                  <div className="pi-print-totals-row">
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Total MC: </span>
                      <strong style={{ color: '#1e3a8a', fontSize: 13 }}>{subTotals.totalMC.toLocaleString()} MC</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Total Offer Value: </span>
                      <strong style={{ color: '#1e3a8a', fontSize: 18, marginLeft: 6 }}>
                        {form.currency} {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </strong>
                    </div>
                  </div>

                  {/* SECTION 3: TERMS & CONDITIONS */}
                  <div className="pi-print-section-title">3. Terms & Conditions</div>
                  <div style={{ marginTop: 6 }}>
                    <AutoExpandInput
                      className="pi-print-textarea"
                      name="remarks"
                      value={form.remarks}
                      onChange={change}
                      placeholder="Enter terms & conditions..."
                      style={{ width: '100%', minHeight: 95, resize: 'none', lineHeight: 1.45, fontSize: 11.5, overflowY: 'hidden' }}
                    />
                  </div>



                  {/* AUTHORIZED SIGNATURE WITH STAMP BLOCK */}
                  <div className="pi-print-sign-row">
                    <div className="pi-stamp-box">
                      <span>{companyInfo.name || 'BHAGAVATHI KRISHNA EXPORTS'}</span>
                      <strong>OFFICIAL SEAL</strong>
                      <span>VERIFIED & APPROVED</span>
                    </div>
                    <div className="pi-sign-block">
                      <div className="pi-sign-title">For {companyInfo.name || 'BHAGAVATHI KRISHNA EXPORTS'}</div>
                      <div className="pi-sign-line"></div>
                      <div className="pi-sign-sub">Authorised Signatory</div>
                    </div>
                  </div>

                </div>

              </div>
              <div className="attendance-modal-footer">
                <div className="pi-footer-total">
                  <span>Direct Print Document Form:</span>
                  <strong style={{ marginLeft: 6, color: '#1e3a8a', fontSize: 16 }}>
                    {form.currency} {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                </div>
                {editingId && (
                  <button
                    type="button"
                    className="attendance-btn attendance-btn-secondary"
                    style={{ color: '#0284c7', borderColor: '#38bdf8', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={() => openSendEmailModal(form)}
                  >
                    <Send size={14} /> SEND EMAIL
                  </button>
                )}
                <button type="button" className="attendance-btn attendance-btn-secondary" onClick={() => setModalOpen(false)}>CANCEL</button>
                <button type="submit" className="attendance-btn attendance-btn-primary" disabled={saving}>
                  {saving ? 'SAVING...' : editingId ? 'UPDATE PI' : 'CREATE PI'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FILTER TABS & SEARCH BAR */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['ALL', 'DRAFT', 'SENT', 'ACCEPTED', 'EXPIRED'].map(st => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
                border: statusFilter === st ? '1px solid #2563eb' : '1px solid #cbd5e1',
                background: statusFilter === st ? '#2563eb' : '#ffffff',
                color: statusFilter === st ? '#ffffff' : '#475569',
                boxShadow: statusFilter === st ? '0 2px 4px rgba(37,99,235,0.2)' : 'none'
              }}
            >
              {st} {st === 'ALL' ? `(${rows.length})` : `(${rows.filter(r => r.status === st).length})`}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, maxWidth: 450 }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
            <input
              type="text"
              className="attendance-input"
              style={{ paddingLeft: 30, width: '100%' }}
              placeholder="Search by PI #, Buyer PO, Customer Name, Country, Species..."
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* MAIN DATA TABLE */}
      <div className="enterprise-table-wrap">
        <table className="enterprise-table" style={{ minWidth: 1400 }}>
          <thead>
            <tr>
              <th>PI Number</th>
              <th>PI Date</th>
              <th>Valid Until</th>
              <th>Buyer Name</th>
              <th>Country</th>
              <th>Product Specs</th>
              <th className="num">Quantity</th>
              <th className="num">Unit Price</th>
              <th className="num">Total Value</th>
              <th>Status</th>
              <th>Approval</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length > 0 ? (
              filteredRows.map(row => {
                const isAccepted = row.status === 'ACCEPTED';
                const isApproved = row.approval_status === 'APPROVED';
                const specPills = [row.species, row.variety, row.grade, row.packing_style].filter(Boolean).join(' · ');

                return (
                  <tr key={row.id}>
                    <td>
                      <div>
                        <strong style={{ color: '#1e293b', fontSize: 12 }}>{row.pi_no}</strong>
                        {row.po_number && (
                          <div style={{ fontSize: 10, color: '#64748b' }}>
                            Ref: <strong>{row.po_number}</strong>
                          </div>
                        )}
                      </div>
                    </td>
                    <td>{row.pi_date || '—'}</td>
                    <td>{row.validity_date || '—'}</td>
                    <td>
                      <div>
                        <strong style={{ color: '#0f172a' }}>{row.buyer_name}</strong>
                        {row.buyer_address && (
                          <div style={{ fontSize: 10, color: '#64748b', maxWidth: 180, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {row.buyer_address}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>{row.country || '—'}</td>
                    <td style={{ maxWidth: 280 }}>
                      {(() => {
                        let rowItems = null;
                        if (row.items_json) {
                          try {
                            const parsed = JSON.parse(row.items_json);
                            if (Array.isArray(parsed) && parsed.length > 0) rowItems = parsed;
                          } catch (e) {}
                        }
                        if (rowItems && rowItems.length > 0) {
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {rowItems.map((it, i) => (
                                <div key={i} style={{ fontSize: 10, color: '#1e293b', borderBottom: i < rowItems.length - 1 ? '1px dashed #cbd5e1' : 'none', paddingBottom: 3 }}>
                                  <strong>{it.species || row.species} {it.variety || row.variety} {it.grade || row.grade}</strong>
                                  <div style={{ fontSize: 9.5, color: '#64748b' }}>
                                    {it.packing_style || row.packing_style} · <span style={{ color: '#0284c7', fontWeight: 800 }}>{it.no_of_mc || 0} MCs</span> @ <span style={{ color: '#166534', fontWeight: 800 }}>${Number(it.unit_price || row.unit_price || 0).toFixed(2)}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        }
                        return (
                          <>
                            <div style={{ fontSize: 10.5, color: '#334155' }}>
                              {specPills ? <strong>{specPills}</strong> : (row.product_description || 'Seafood Export Offer')}
                            </div>
                            {(row.brand || row.count_glaze || row.weight_glaze) && (
                              <div style={{ fontSize: 9.5, color: '#0284c7', marginTop: 2 }}>
                                {[row.brand, row.count_glaze, row.weight_glaze].filter(Boolean).join(' | ')}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </td>
                    <td className="num">
                      <strong>{Number(row.quantity || 0).toLocaleString()}</strong> <small style={{ color: '#64748b' }}>{row.unit || 'KG'}</small>
                    </td>
                    <td className="num">
                      ${Number(row.unit_price || 0).toFixed(2)}
                    </td>
                    <td className="num">
                      <strong style={{ color: '#1e3a8a', fontSize: 12 }}>
                        {row.currency || 'USD'} {Number(row.total_amount || (Number(row.quantity || 0) * Number(row.unit_price || 0))).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </strong>
                    </td>
                    <td>
                      <span className={`qt-status-badge ${(row.status || 'draft').toLowerCase().replace(/\s+/g, '-')}`}>
                        {row.status}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 10,
                        fontWeight: 900,
                        background: isApproved ? '#dcfce7' : '#fef3c7',
                        color: isApproved ? '#15803d' : '#b45309'
                      }}>
                        {isApproved ? 'APPROVED' : 'PENDING'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        <button type="button" className="attendance-btn attendance-btn-secondary" style={{ padding: '3px 7px', fontSize: 10, color: '#d97706', fontWeight: 800, background: '#fffbeb', borderColor: '#fde68a' }} onClick={() => openAddToPendingModal(row)} title="Auto-fill details into Pending Orders Production List">
                          <Plus size={12} /> PENDING LIST
                        </button>
                        <button type="button" className="attendance-btn attendance-btn-secondary" style={{ padding: '3px 7px', fontSize: 10 }} onClick={() => openEdit(row)} title="Edit Proforma Invoice">
                          <Pencil size={12} /> EDIT
                        </button>
                        <button type="button" className="attendance-btn attendance-btn-secondary" style={{ padding: '3px 7px', fontSize: 10, color: '#2563eb' }} onClick={() => confirmAndPrint(row)} title="Print PI">
                          <Printer size={12} /> PRINT
                        </button>
                        <button type="button" className="attendance-btn attendance-btn-secondary" style={{ padding: '3px 7px', fontSize: 10, color: '#7c3aed' }} onClick={() => confirmAndDownloadPdf(row)} title="Download PDF">
                          <FileText size={12} /> PDF
                        </button>
                        <button type="button" className="attendance-btn attendance-btn-secondary" style={{ padding: '3px 7px', fontSize: 10, color: '#0284c7' }} onClick={() => openSendEmailModal(row)} title="Send PDF via Email">
                          <Send size={12} /> EMAIL
                        </button>
                        {canApprove && !isApproved && (
                          <button type="button" className="attendance-btn attendance-btn-secondary" style={{ padding: '3px 7px', fontSize: 10, color: '#16a34a' }} onClick={() => decideApproval(row, 'APPROVED')} title="Approve PI">
                            <CheckCircle2 size={12} /> APPROVE
                          </button>
                        )}
                        <button type="button" className="attendance-btn attendance-btn-secondary" style={{ padding: '3px 7px', fontSize: 10, color: '#ef4444' }} onClick={() => cancelRow(row)} title="Cancel PI">
                          <Ban size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan="12" style={{ textAlign: 'center', padding: '30px 12px', color: '#64748b' }}>
                  No Proforma Invoices found. Click <strong>"NEW PROFORMA INVOICE"</strong> or accept a <strong>Sales Quotation</strong> to automatically generate a PI.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* SEND PDF VIA EMAIL MODAL (ORGANIZED CORPORATE EMAIL SUITE) */}
      {emailModalOpen && (
        <div className="attendance-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setEmailModalOpen(false); }}>
          <div className="attendance-modal-content" style={{ maxWidth: 780, width: '94vw', borderRadius: 14, overflow: 'hidden' }}>
            {/* MODAL HEADER */}
            <div className="attendance-modal-header" style={{ background: '#1e3a8a', padding: '16px 24px', color: '#ffffff' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.15)', padding: 10, borderRadius: 10, display: 'flex' }}>
                  <Send size={22} color="#ffffff" />
                </div>
                <div>
                  <h2 style={{ margin: 0, color: '#ffffff', fontSize: 18, fontWeight: 800 }}>Send Proforma Invoice PDF via Email</h2>
                  <span style={{ fontSize: 11.5, color: '#93c5fd' }}>
                    Document Ref: <strong>{emailForm.pi_no}</strong> · Auto-sync to CRM Chat Thread
                  </span>
                </div>
              </div>
              <button type="button" className="attendance-modal-close-btn" style={{ color: '#ffffff', opacity: 0.8 }} onClick={() => setEmailModalOpen(false)} aria-label="Close email modal">
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSendEmail} style={{ padding: '22px 26px', background: '#ffffff' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                
                {/* 2-COLUMN GRID: SENDER & RECIPIENT */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 16 }}>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px' }}>
                    <small style={{ display: 'block', fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>
                      SENDER (FROM EMAIL)
                    </small>
                    <strong style={{ fontSize: 13, color: '#1e3a8a' }}>
                      {companyInfo.email || 'export@bknrexports.com'}
                    </strong>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, fontWeight: 600 }}>{companyInfo.name}</div>
                  </div>

                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 14px' }}>
                    <label style={{ display: 'block', fontSize: 10, fontWeight: 800, color: '#2563eb', textTransform: 'uppercase', marginBottom: 4 }}>
                      RECIPIENT EMAIL (TO) *
                    </label>
                    <input
                      type="email"
                      className="attendance-input"
                      style={{ fontSize: 12.5, fontWeight: 700, background: '#ffffff', border: '1px solid #93c5fd', width: '100%' }}
                      value={emailForm.to_email}
                      onChange={e => setEmailForm(curr => ({ ...curr, to_email: e.target.value }))}
                      placeholder="buyer@company.com"
                      required
                    />
                  </div>
                </div>

                {/* EMAIL SUBJECT */}
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#334155', textTransform: 'uppercase', marginBottom: 6 }}>
                    EMAIL SUBJECT *
                  </label>
                  <input
                    type="text"
                    className="attendance-input"
                    style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', width: '100%' }}
                    value={emailForm.subject}
                    onChange={e => setEmailForm(curr => ({ ...curr, subject: e.target.value }))}
                    placeholder="Enter email subject..."
                    required
                  />
                </div>

                {/* DYNAMIC AUTO-EXPANDING EMAIL MESSAGE BODY */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#334155', textTransform: 'uppercase' }}>
                      MESSAGE BODY / COVER NOTE
                    </label>
                    <small style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>↔ Auto-expandable Text Area</small>
                  </div>
                  <textarea
                    className="attendance-input"
                    value={emailForm.body}
                    onChange={e => setEmailForm(curr => ({ ...curr, body: e.target.value }))}
                    onFocus={e => { e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
                    onInput={e => { e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
                    ref={el => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }}
                    placeholder="Write custom email message..."
                    rows={4}
                    style={{
                      width: '100%',
                      minHeight: 110,
                      resize: 'vertical',
                      lineHeight: 1.55,
                      fontSize: 12.5,
                      fontFamily: 'inherit',
                      overflowY: 'hidden',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>

                {/* ATTACHMENT CARD BLOCK */}
                <div style={{ border: '1px solid #cbd5e1', borderRadius: 10, overflow: 'hidden', background: '#f8fafc' }}>
                  {/* Header */}
                  <div style={{ background: '#f1f5f9', padding: '10px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FileText size={16} color="#0284c7" />
                      <span style={{ fontSize: 11.5, fontWeight: 800, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>ATTACHMENT</span>
                    </div>
                    {emailFile && (
                      <button
                        type="button"
                        onClick={() => setEmailFile(null)}
                        style={{ background: 'none', border: 'none', fontSize: 11, color: '#ef4444', cursor: 'pointer', fontWeight: 800 }}
                      >
                        ✕ Remove Custom File
                      </button>
                    )}
                  </div>

                  {/* Auto PDF card */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: emailFile ? '#ffffff' : '#f0f9ff', opacity: emailFile ? 0.6 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ background: emailFile ? '#94a3b8' : '#0284c7', color: '#ffffff', padding: 8, borderRadius: 8, display: 'flex' }}>
                        <FileText size={18} />
                      </div>
                      <div>
                        <strong style={{ fontSize: 13, color: emailFile ? '#64748b' : '#0369a1', display: 'block' }}>
                          {emailForm.pi_no}.pdf
                        </strong>
                        <span style={{ fontSize: 11, color: emailFile ? '#94a3b8' : '#0284c7', fontWeight: 500 }}>
                          {emailFile ? 'Replaced by custom uploaded file below' : 'Auto-generated Official Corporate PDF (Attached & Ready)'}
                        </span>
                      </div>
                    </div>
                    {!emailFile && (
                      <span style={{ fontSize: 10.5, fontWeight: 900, color: '#0369a1', background: '#e0f2fe', padding: '4px 10px', borderRadius: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        READY
                      </span>
                    )}
                  </div>

                  {/* File picker separator */}
                  <div style={{ padding: '10px 16px', background: '#ffffff', borderTop: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <label
                      htmlFor="pi-email-file"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '7px 16px', borderRadius: 8, cursor: 'pointer',
                        background: '#1e3a8a', color: '#ffffff',
                        fontSize: 12, fontWeight: 800, flexShrink: 0
                      }}
                    >
                      <Download size={14} /> Select PDF from Files
                    </label>
                    <input
                      id="pi-email-file"
                      type="file"
                      accept="application/pdf,.pdf"
                      style={{ display: 'none' }}
                      onChange={e => setEmailFile(e.target.files?.[0] || null)}
                    />
                    <span style={{ fontSize: 11.5, color: emailFile ? '#16a34a' : '#64748b', fontWeight: emailFile ? 800 : 500 }}>
                      {emailFile ? `✔ ${emailFile.name}` : 'Optional — leave blank to automatically attach standard PI PDF'}
                    </span>
                  </div>
                </div>

              </div>

              {/* MODAL FOOTER ACTIONS */}
              <div className="attendance-modal-footer" style={{ marginTop: 24, padding: 0, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                <button type="button" className="attendance-btn attendance-btn-secondary" onClick={() => setEmailModalOpen(false)} style={{ padding: '9px 18px', fontSize: 12 }}>
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="attendance-btn attendance-btn-primary"
                  style={{ background: '#1e3a8a', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 22px', fontSize: 12.5, fontWeight: 900 }}
                  disabled={sendingEmail}
                >
                  {sendingEmail ? (
                    <>SENDING EMAIL & REDIRECTING...</>
                  ) : (
                    <>
                      <Send size={15} /> SEND MAIL & OPEN CRM CHAT
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD TO PENDING ORDERS CONFIRMATION & SELECTION MODAL */}
      {pendingModalOpen && pendingTargetRow && (
        <div className="attendance-modal-overlay" onClick={e => { if (e.target === e.currentTarget) setPendingModalOpen(false); }}>
          <div className="attendance-modal-content" style={{ maxWidth: 620, width: '92vw', borderRadius: 12 }}>
            <div className="attendance-modal-header" style={{ background: 'linear-gradient(135deg, #1e3a8a, #0284c7)', color: '#fff', padding: '16px 20px', borderRadius: '12px 12px 0 0' }}>
              <div>
                <h2 style={{ color: '#fff', margin: 0, fontSize: 16, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 8 }}>
                  ⚡ Save to Pending Orders — PI #{pendingTargetRow.pi_no}
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#bae6fd' }}>
                  Select Company, Location & Buyer below. Product specs will be auto-populated from this selected PI.
                </p>
              </div>
              <button type="button" className="attendance-modal-close-btn" onClick={() => setPendingModalOpen(false)} aria-label="Close modal" style={{ color: '#fff' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={submitPendingOrder}>
              <div className="attendance-modal-body" style={{ padding: 20 }}>

                {/* 3 MANDATORY DROPDOWNS */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  
                  {/* 1. COMPANY NAME (PRODUCTION FOR) */}
                  <div className="attendance-form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: 800, color: '#1e293b', fontSize: 12 }}>
                      1. Company Name (Production For) *
                    </label>
                    <select
                      className="attendance-select"
                      value={pendingForm.company_name}
                      onChange={e => setPendingForm(f => ({ ...f, company_name: e.target.value }))}
                      required
                      style={{ fontWeight: 700, borderColor: '#93c5fd', background: '#f8fafc' }}
                    >
                      {Array.from(new Set([
                        companyInfo.name,
                        ...(productionForOptions || [])
                      ].filter(Boolean))).map(comp => (
                        <option key={comp} value={comp}>{comp}</option>
                      ))}
                    </select>
                  </div>

                  {/* 2. PLANT LOCATION (PRODUCTION AT) */}
                  <div className="attendance-form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: 800, color: '#1e293b', fontSize: 12 }}>
                      2. Plant Location (Production At) *
                    </label>
                    <select
                      className="attendance-select"
                      value={pendingForm.production_at}
                      onChange={e => setPendingForm(f => ({ ...f, production_at: e.target.value }))}
                      required
                      style={{ fontWeight: 700, borderColor: '#93c5fd', background: '#f8fafc' }}
                    >
                      {Array.from(new Set([
                        pendingTargetRow.port_of_loading,
                        ...(productionAtOptions || [])
                      ].filter(Boolean))).map(loc => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                    </select>
                  </div>

                  {/* 3. BUYER NAME */}
                  <div className="attendance-form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: 800, color: '#1e293b', fontSize: 12 }}>
                      3. Buyer Name *
                    </label>
                    <select
                      className="attendance-select"
                      value={pendingForm.buyer_name}
                      onChange={e => setPendingForm(f => ({ ...f, buyer_name: e.target.value }))}
                      required
                      style={{ fontWeight: 700, borderColor: '#93c5fd', background: '#f8fafc' }}
                    >
                      {pendingTargetRow.buyer_name && <option value={pendingTargetRow.buyer_name}>{pendingTargetRow.buyer_name}</option>}
                      {buyerOptions.map(b => (
                        <option key={b.name} value={b.name}>{b.name}{b.country ? ` · ${b.country}` : ''}</option>
                      ))}
                    </select>
                  </div>

                  {/* 4. AGENT NAME (BUYER AGENT) */}
                  <div className="attendance-form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: 800, color: '#1e293b', fontSize: 12 }}>
                      4. Agent Name (Buyer Agent) *
                    </label>
                    <select
                      className="attendance-select"
                      value={pendingForm.agent_name}
                      onChange={e => setPendingForm(f => ({ ...f, agent_name: e.target.value }))}
                      required
                      style={{ fontWeight: 700, borderColor: '#93c5fd', background: '#f8fafc' }}
                    >
                      <option value="Direct">Direct (No Agent)</option>
                      {Array.from(new Set(agentOptions)).map(ag => (
                        <option key={ag} value={ag}>{ag}</option>
                      ))}
                    </select>
                  </div>

                  {/* 5. EDITABLE PI / PO NUMBER REFERENCE */}
                  <div className="attendance-form-group" style={{ margin: 0 }}>
                    <label style={{ fontWeight: 800, color: '#1e293b', fontSize: 12 }}>
                      5. PI / PO Number Reference *
                    </label>
                    <input
                      type="text"
                      className="attendance-input"
                      value={pendingForm.po_number}
                      onChange={e => setPendingForm(f => ({ ...f, po_number: e.target.value.toUpperCase() }))}
                      required
                      style={{ fontWeight: 900, borderColor: '#93c5fd', background: '#f8fafc', color: '#1e3a8a', textTransform: 'uppercase' }}
                      placeholder="e.g. PI-2026-0001"
                    />
                  </div>

                </div>

                {/* AUTO-FILLED PI PRODUCT DETAILS SUMMARY CARD */}
                {(() => {
                  let modalItems = [];
                  if (pendingTargetRow.items_json) {
                    try {
                      const parsed = JSON.parse(pendingTargetRow.items_json);
                      if (Array.isArray(parsed) && parsed.length > 0) modalItems = parsed;
                    } catch (e) {}
                  }

                  return (
                    <div style={{ marginTop: 18, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 14 }}>
                      <div style={{ fontSize: 11, fontWeight: 900, color: '#1e40af', textTransform: 'uppercase', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>Product Details</span>
                        <span style={{ background: '#dbeafe', color: '#1e3a8a', padding: '2px 8px', borderRadius: 10, fontSize: 10 }}>PI #{pendingTargetRow.pi_no}</span>
                      </div>

                      {modalItems.length > 1 ? (
                        <div style={{ overflowX: 'auto', background: '#fff', borderRadius: 6, border: '1px solid #cbd5e1', padding: 2 }}>
                          <table style={{ width: '100%', fontSize: 10, borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ background: '#dbeafe', color: '#1e3a8a', fontWeight: 900 }}>
                                <th style={{ padding: '5px 8px', textAlign: 'left' }}>Item / Specs</th>
                                <th style={{ padding: '5px 8px', textAlign: 'center' }}>Grade</th>
                                <th style={{ padding: '5px 8px', textAlign: 'center' }}>Pcs</th>
                                <th style={{ padding: '5px 8px', textAlign: 'center' }}>Packing</th>
                                <th style={{ padding: '5px 8px', textAlign: 'right' }}>MCs</th>
                                <th style={{ padding: '5px 8px', textAlign: 'right' }}>Price</th>
                              </tr>
                            </thead>
                            <tbody>
                              {modalItems.map((it, idx) => (
                                <tr key={idx} style={{ borderBottom: idx < modalItems.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                  <td style={{ padding: '5px 8px', fontWeight: 700, color: '#0f172a' }}>{it.species || pendingTargetRow.species || 'Shrimp'} {it.variety || pendingTargetRow.variety || 'PD'}</td>
                                  <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 800, color: '#1e40af' }}>{it.grade || pendingTargetRow.grade || '21/25'}</td>
                                  <td style={{ padding: '5px 8px', textAlign: 'center' }}>{it.no_of_pieces || (it.grade ? Math.round((parseInt((String(it.grade).match(/\d+/g) || []).pop() || 25)) * 2.2) : 55)}</td>
                                  <td style={{ padding: '5px 8px', textAlign: 'center' }}>{it.packing_style || pendingTargetRow.packing_style || '10x1kg'}</td>
                                  <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 900 }}>{Number(it.no_of_mc || it.quantity || 0).toLocaleString()}</td>
                                  <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 900, color: '#166534' }}>${Number(it.unit_price || pendingTargetRow.unit_price || 0).toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11, color: '#334155' }}>
                          <div>Country: <strong>{pendingTargetRow.country || '—'}</strong></div>
                          <div>Shipment Date: <strong>{pendingTargetRow.validity_date || pendingTargetRow.pi_date || '—'}</strong></div>
                          <div>Species: <strong>{pendingTargetRow.species || 'Shrimp'}</strong></div>
                          <div>Variety: <strong>{pendingTargetRow.variety || 'PD'}</strong></div>
                          <div>Grade: <strong>{pendingTargetRow.grade || '21/25'}</strong></div>
                          <div>Pieces: <strong>{pendingTargetRow.no_of_pieces || (pendingTargetRow.grade ? Math.round((parseInt((String(pendingTargetRow.grade).match(/\d+/g) || []).pop() || 25)) * 2.2) : 55)} Pcs</strong></div>
                          <div>Brand: <strong>{pendingTargetRow.brand || 'BKNR'}</strong></div>
                          <div>Packing: <strong>{pendingTargetRow.packing_style || '10x1kg'}</strong></div>
                          <div>MCs: <strong>{pendingTargetRow.no_of_mc || pendingTargetRow.quantity || '100'} MCs</strong></div>
                          <div style={{ gridColumn: 'span 2' }}>
                            Price: <strong>${Number(pendingTargetRow.unit_price || 0).toFixed(2)} / KG</strong> (Total: <strong>${Number(pendingTargetRow.total_amount || 0).toLocaleString()} USD</strong>)
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

              </div>

              {/* MODAL FOOTER */}
              <div className="attendance-modal-footer" style={{ padding: '14px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="attendance-btn attendance-btn-secondary" onClick={() => setPendingModalOpen(false)} style={{ padding: '8px 18px', fontSize: 12 }}>
                  CANCEL
                </button>
                <button
                  type="submit"
                  className="attendance-btn attendance-btn-primary"
                  style={{ background: '#d97706', borderColor: '#b45309', display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 22px', fontSize: 12.5, fontWeight: 900, color: '#ffffff' }}
                  disabled={submittingPending}
                >
                  {submittingPending ? 'SAVING TO PENDING ORDERS...' : '🚀 CONFIRM & SAVE TO PENDING ORDERS'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, ...props }) {
  return <div className="attendance-form-group"><label>{label}</label><input className="attendance-input" {...props} /></div>;
}

function Select({ label, options, ...props }) {
  return <div className="attendance-form-group"><label>{label}</label><select className="attendance-select" {...props}>{options.map(option => <option key={option}>{option}</option>)}</select></div>;
}
