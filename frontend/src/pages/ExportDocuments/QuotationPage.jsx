import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, FileText, Pencil, Plus, Trash2, X, CheckCircle2, Send, DollarSign, BarChart2, AlertTriangle, XCircle, Receipt, ArrowRight } from 'lucide-react';

import '../Attendance/Attendance.css';
import './ProformaInvoices.css';
import './QuotationPage.css';
import { secureDownload } from '../../utils/secureDownload';

const today = () => new Date().toISOString().slice(0, 10);
const future30 = () => {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString().slice(0, 10);
};

const getOptLabel = item => {
  if (item == null) return '';
  if (typeof item === 'string' || typeof item === 'number') return String(item);
  return (
    item.buyer_name ||
    item.agent_name ||
    item.brand_name ||
    item.species_name ||
    item.variety_name ||
    item.grade_name ||
    item.glaze_name ||
    item.freezer_name ||
    item.country_name ||
    item.location_name ||
    item.company_name ||
    item.production_at ||
    item.production_for ||
    item.packing_style ||
    item.name ||
    item.label ||
    String(item)
  );
};

const parsePackingKg = (packingStr) => {
  if (!packingStr) return 0;
  const str = String(packingStr).toUpperCase().trim();

  // Pattern like "10 X 1 KG", "6 X 1.8 KG", "20 X 500 G", "10 X 2 LBS"
  const match = str.match(/(\d+(?:\.\d+)?)\s*X\s*(\d+(?:\.\d+)?)\s*(KG|KGS|G|GM|GMS|LB|LBS|LBS.)?/i);
  if (match) {
    const count = parseFloat(match[1]) || 0;
    const innerWeight = parseFloat(match[2]) || 0;
    const unit = (match[3] || 'KG').toUpperCase();

    if (unit.startsWith('G')) {
      return (count * innerWeight) / 1000;
    } else if (unit.startsWith('LB')) {
      return count * innerWeight * 0.45359237;
    } else {
      return count * innerWeight;
    }
  }

  const singleMatch = str.match(/(\d+(?:\.\d+)?)\s*KG/i);
  if (singleMatch) {
    return parseFloat(singleMatch[1]) || 0;
  }

  return 0;
};

const parseGradeCount = (gradeStr) => {
  if (!gradeStr) return 0;
  const str = String(gradeStr).trim().toUpperCase();

  const matchRange = str.match(/(\d+)\s*[\/\-]\s*(\d+)/);
  if (matchRange) {
    const low = parseFloat(matchRange[1]);
    const high = parseFloat(matchRange[2]);
    return (low + high) / 2;
  }

  const matchU = str.match(/U\s*[\/\-]?\s*(\d+)/i);
  if (matchU) {
    return parseFloat(matchU[1]);
  }

  const matchNum = str.match(/(\d+(?:\.\d+)?)/);
  if (matchNum) {
    return parseFloat(matchNum[1]);
  }

  return 0;
};

const emptyItem = () => ({
  item_name: '',
  brand: '',
  packing_style: '',
  freezer: '',
  count_glaze: '',
  weight_glaze: '',
  species: '',
  variety: '',
  grade: '',
  no_of_pieces: '0',
  no_of_mc: 0,
  quantity_kg: '',
  hoso_count: '',
  target_hoso_rate: '',
  expenses: '',
  target_quotation_price: '',
  rate_per_kg: '', // Bidding Price ($/Kg)
  bidding_price: '',
});


const future15 = () => {
  const d = new Date();
  d.setDate(d.getDate() + 15);
  return d.toISOString().slice(0, 10);
};

const emptyForm = (no = '') => ({
  quotation_no: no,
  po_number: '',
  company_name: '',
  quotation_date: today(),
  valid_until: future30(),
  shipment_date: future15(),
  customer_name: '',
  customer_address: '',
  agent: '',
  country: '',
  production_at: '',
  currency: 'USD',
  exchange_rate: 83.5,
  incoterm: 'FOB',
  payment_terms: '',
  remarks: '',
  status: 'DRAFT',
  items: [emptyItem()],
});

const statuses = ['ALL', 'DRAFT', 'SENT', 'CUSTOMER REPLIED', 'ACCEPTED', 'REJECTED', 'EXPIRED'];

export default function QuotationPage({ setActivePage }) {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [showAudit, setShowAudit] = useState(false);

  // Email Replies Log Modal State
  const [repliesModalOpen, setRepliesModalOpen] = useState(false);
  const [repliesTargetRow, setRepliesTargetRow] = useState(null);
  const [repliesList, setRepliesList] = useState([]);
  const [loadingReplies, setLoadingReplies] = useState(false);
  const [newReplyMsg, setNewReplyMsg] = useState('');
  const [postingReply, setPostingReply] = useState(false);
  const [syncingMail, setSyncingMail] = useState(false);
  const [aiAnalysisData, setAiAnalysisData] = useState(null);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [chatToEmail, setChatToEmail] = useState('');
  const [chatFetchError, setChatFetchError] = useState('');
  const [activeEmailTab, setActiveEmailTab] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [replyFile, setReplyFile] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null);

  // Dropdown options loaded from backend
  const [buyerOptions, setBuyerOptions] = useState([]);
  const [agentsList, setAgentsList] = useState([]);
  const [uniqueCompanies, setUniqueCompanies] = useState([]);
  const [productionLocations, setProductionLocations] = useState([]);
  const [countryOptions, setCountryOptions] = useState([]);
  const [countryDetails, setCountryDetails] = useState([]);
  const [brandsList, setBrandsList] = useState([]);
  const [freezersList, setFreezersList] = useState([]);
  const [glazesList, setGlazesList] = useState([]);
  const [speciesOptions, setSpeciesOptions] = useState([]);
  const [varietyOptions, setVarietyOptions] = useState([]);
  const [gradeOptions, setGradeOptions] = useState([]);
  const [packingOptions, setPackingOptions] = useState([]);
  const [varietyYieldsMap, setVarietyYieldsMap] = useState({});
  const [hosoHlsoYieldsList, setHosoHlsoYieldsList] = useState([]);
  const [gradeToHosoList, setGradeToHosoList] = useState([]);
  const [nextNo, setNextNo] = useState('');
  const [sessionCompany, setSessionCompany] = useState('');
  const [expandedRows, setExpandedRows] = useState({});
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailTargetRow, setEmailTargetRow] = useState(null);
  const [emailForm, setEmailForm] = useState({
    from_email: '',
    to_email: '',
    subject: '',
    header_text: '',
    footer_text: '',
    signoff_text: ''
  });
  const [sendingEmail, setSendingEmail] = useState(false);
  const [editingDescIdx, setEditingDescIdx] = useState(null);

  const toggleExpand = id => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const openSendEmailModal = row => {
    const targetId = (row && row.id) ? row.id : editingId;
    const targetRow = { ...row, id: targetId };
    setEmailTargetRow(targetRow);

    let customerMail = '';
    const foundBuyer = (buyerOptions || []).find(b => getOptLabel(b).toUpperCase() === (targetRow.customer_name || '').toUpperCase());
    if (foundBuyer && foundBuyer.email) {
      customerMail = foundBuyer.email;
    }

    const initialItems = (targetRow.items || []).map((it, idx) => ({
      ...it,
      item_name: it.item_name || [it.species, it.variety, it.grade].filter(Boolean).join(' ') || `Shrimp Item #${idx + 1}`
    }));

    const shipDate = targetRow.shipment_date || targetRow.quotation_date || today();

    setEmailForm({
      from_email: sessionCompany || 'bknr.solutions@gmail.com',
      to_email: customerMail || targetRow.customer_email || '',
      subject: `Price Quotation #${targetRow.quotation_no || ''} - ${targetRow.company_name || 'BKNR ERP'}`,
      header_text: `Dear Customer,\n\nWe are pleased to submit our commercial price quotation for your requirement as detailed below:`,
      footer_text: `Terms & Conditions:\n• Shipment Date: ${shipDate}\n• Quotation Validity: Valid until ${targetRow.valid_until || future30()}\n• Payment Terms: ${targetRow.payment_terms || '100% LC at sight'}\n• Incoterms: ${targetRow.incoterm || 'FOB'}`,
      signoff_text: `Best Regards,\nCommercial & Export Sales Team\n${targetRow.company_name || 'BKNR ERP Solutions'}`,
      items: initialItems
    });
    setEmailModalOpen(true);
  };

  const submitSendEmail = async e => {
    e.preventDefault();
    if (!emailForm.to_email || !emailForm.to_email.includes('@')) {
      notify('Please enter a valid Recipient (To) Email address.', 'error');
      return;
    }
    try {
      setSendingEmail(true);
      const targetId = (emailTargetRow && emailTargetRow.id) ? emailTargetRow.id : (editingId || emailTargetRow?.quotation_no || '0');
      const emailPayload = {
        to_email: emailForm.to_email,
        subject: emailForm.subject,
        header_text: emailForm.header_text,
        footer_text: emailForm.footer_text,
        signoff_text: emailForm.signoff_text,
        items: emailForm.items
      };

      let res = await fetch(`/crm/quotation/${targetId}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(emailPayload)
      });

      if (res.status === 404) {
        res = await fetch(`/export_documents/quotation/${targetId}/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(emailPayload)
        });
      }

      let data = {};
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json().catch(() => ({}));
      } else {
        const rawText = await res.text().catch(() => '');
        data = { success: res.ok, message: rawText.slice(0, 150) };
      }

      if (res.ok && data.success !== false) {
        notify(data.message || 'Quotation email sent successfully!', 'success');
        setEmailModalOpen(false);
        await loadData();
      } else {
        notify(data.detail || data.message || 'Failed to send quotation email.', 'error');
      }
    } catch (err) {
      notify('Error sending email: ' + err.message, 'error');
    } finally {
      setSendingEmail(false);
    }
  };

  const openRepliesModal = async (row) => {
    const targetRow = row || repliesTargetRow || {};
    setRepliesTargetRow(targetRow);
    setRepliesModalOpen(true);
    setLoadingReplies(true);
    setChatFetchError('');
    try {
      const targetId = targetRow.id || editingId || targetRow.quotation_no || '0';
      let res = await fetch(`/crm/quotation/${targetId}/replies`, { credentials: 'include' });
      if (res.status === 404) {
        res = await fetch(`/export_documents/quotation/${targetId}/replies`, { credentials: 'include' });
      }

      let data = {};
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json().catch(() => ({}));
      } else {
        const rawText = await res.text().catch(() => '');
        data = { success: false, message: rawText.slice(0, 150) };
      }

      if (res.ok && data.success !== false) {
        const list = data.replies || [];
        setRepliesList(list);
        const outbound = list.find(m => m.direction === 'OUTBOUND');
        const inbound  = list.find(m => m.direction === 'INBOUND');
        const detected = outbound?.recipient_email || inbound?.sender_email || targetRow.customer_email || '';
        setChatToEmail(detected);
        setActiveEmailTab(detected);
      } else {
        setChatFetchError(data.detail || data.message || 'Failed to load replies');
      }
    } catch (e) {
      setChatFetchError('Network error: ' + e.message);
      console.warn('Failed to load replies:', e);
    } finally {
      setLoadingReplies(false);
    }
  };

  const submitPostReply = async (e) => {
    e.preventDefault();
    if (!newReplyMsg.trim()) return;
    try {
      setPostingReply(true);
      const targetId = repliesTargetRow?.id || editingId || repliesTargetRow?.quotation_no || '0';
      let res = await fetch(`/crm/quotation/${targetId}/post-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message_body: newReplyMsg }),
      });
      if (res.status === 404) {
        res = await fetch(`/export_documents/quotation/${targetId}/post-reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ message_body: newReplyMsg }),
        });
      }

      let data = {};
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json().catch(() => ({}));
      } else {
        const rawText = await res.text().catch(() => '');
        data = { success: res.ok, message: rawText.slice(0, 150) };
      }

      if (!res.ok || data.success === false) throw new Error(data.detail || data.message || 'Failed to log reply');
      setNewReplyMsg('');
      setComposeOpen(false);
      notify('Customer email reply logged successfully!', 'success');
      await openRepliesModal(repliesTargetRow);
      await loadData();
    } catch (err) {
      notify(err.message || 'Error logging reply', 'error');
    } finally {
      setPostingReply(false);
    }
  };

  const sendChatbotReply = async () => {
    if (!newReplyMsg.trim() && !replyFile) return;
    if (!chatToEmail || !chatToEmail.includes('@')) {
      notify('Please enter a valid customer email address in the To field.', 'error');
      return;
    }
    try {
      setPostingReply(true);

      let payloadAttachments = null;
      if (replyFile) {
        const b64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(replyFile);
        });
        payloadAttachments = [{
          filename: replyFile.name,
          mime_type: replyFile.type || 'application/pdf',
          b64_data: b64
        }];
      }

      const targetId = repliesTargetRow?.id || editingId || repliesTargetRow?.quotation_no || '0';
      const chatbotPayload = {
        message_body: newReplyMsg || 'Please see attached document.',
        to_email: chatToEmail.trim(),
        subject: `Re: Price Quotation #${repliesTargetRow?.quotation_no || ''} — ${repliesTargetRow?.customer_name || 'Buyer'}`,
        attachments: payloadAttachments
      };

      let res = await fetch(`/crm/quotation/${targetId}/send-chatbot-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(chatbotPayload),
      });

      if (res.status === 404) {
        res = await fetch(`/export_documents/quotation/${targetId}/send-chatbot-reply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(chatbotPayload),
        });
      }

      let data = {};
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await res.json().catch(() => ({}));
      } else {
        const rawText = await res.text().catch(() => '');
        data = { success: res.ok, message: rawText.slice(0, 150) };
      }

      if (!res.ok || data.success === false) throw new Error(data.detail || data.message || 'Failed to send email');
      setNewReplyMsg('');
      setReplyFile(null);
      setComposeOpen(false);
      notify(`✅ Reply & attachment sent to ${chatToEmail.trim()} successfully!`, 'success');
      await openRepliesModal(repliesTargetRow);
      await loadData();
    } catch (err) {
      notify(err.message || 'Error sending email', 'error');
    } finally {
      setPostingReply(false);
    }
  };

  const syncInboundGmail = async () => {
    setSyncingMail(true);
    try {
      const res = await fetch('/crm/quotation/sync-inbound-emails', {
        method: 'POST',
        credentials: 'include'
      });
      const data = await res.json();
      notify(data.message || 'Gmail Sync completed', data.success ? 'success' : 'error');
      if (repliesTargetRow) {
        await openRepliesModal(repliesTargetRow);
      }
      await loadData();
    } catch (e) {
      notify('Gmail Sync error: ' + e.message, 'error');
    } finally {
      setSyncingMail(false);
    }
  };

  const triggerAiBotProposal = async (msgText = '') => {
    if (!repliesTargetRow) return;
    setGeneratingAi(true);
    try {
      const res = await fetch(`/crm/quotation/${repliesTargetRow.id}/ai-chatbot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message_body: msgText || 'Inquire regarding price discount and shipment schedule' })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAiAnalysisData(data);
        if (data.draft_response) {
          setNewReplyMsg(data.draft_response);
        }
        notify('🤖 AI Email Chatbot proposal generated!', 'success');
      } else {
        notify('Failed to generate AI proposal', 'error');
      }
    } catch (e) {
      notify('AI Bot error: ' + e.message, 'error');
    } finally {
      setGeneratingAi(false);
    }
  };

  const calcInventoryCostingTargetPrice = useCallback((item, exchRate, varietyYields, hosoHlsoYields) => {
    const hosoRate = parseFloat(item.target_hoso_rate || 0);
    const exp = parseFloat(item.expenses || 0);
    const exch = parseFloat(exchRate || 83.5);

    if (hosoRate <= 0 && exp <= 0) return '';

    let glazeFactor = 1.0;
    const glazeStr = getOptLabel(item.weight_glaze || item.count_glaze || '').toUpperCase();
    if (glazeStr && !glazeStr.includes('NWNC') && !glazeStr.includes('NET WEIGHT')) {
      const digits = glazeStr.match(/\d+/);
      if (digits) {
        glazeFactor = (100 - parseInt(digits[0], 10)) / 100;
      }
    }

    const varietyStr = getOptLabel(item.variety || '').toUpperCase().trim();
    const isHoso = varietyStr.includes('HOSO');

    let peelingYield = 1.0;
    let soakingYield = 1.0;
    let hlsoYield = 1.0;

    if (!isHoso && varietyStr && varietyYields && varietyYields[varietyStr]) {
      peelingYield = (parseFloat(varietyYields[varietyStr].peeling_yield || 100)) / 100;
      soakingYield = (parseFloat(varietyYields[varietyStr].soaking_yield || 100)) / 100;
    }

    if (!isHoso && item.grade && hosoHlsoYields && hosoHlsoYields.length) {
      const gradeStr = getOptLabel(item.grade);
      const nums = gradeStr.match(/\d+/g);
      if (nums && nums.length > 0) {
        const rawGradeNum = parseInt(nums[nums.length - 1], 10);
        const adjustedCount = Math.round(rawGradeNum / (glazeFactor > 0 ? glazeFactor : 1.0));
        const matchCount = adjustedCount - 1;
        const speciesStr = getOptLabel(item.species || '').toUpperCase().trim();

        const matchObj = hosoHlsoYields.find(h =>
          (h.species === speciesStr || !h.species) && h.hlso_count === matchCount
        );
        if (matchObj) {
          hlsoYield = (parseFloat(matchObj.hlso_yield_pct || 100)) / 100;
        }
      }
    }

    const denominator = peelingYield * soakingYield * hlsoYield;
    const hosoRmCost = denominator > 0 ? (glazeFactor * hosoRate) / denominator : (glazeFactor * hosoRate);
    const totalCostInr = hosoRmCost + exp;
    const targetPriceUsd = totalCostInr / (exch > 0 ? exch : 83.5);

    return targetPriceUsd.toFixed(2);
  }, []);

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState([]);
  const [analysisModalOpen, setAnalysisModalOpen] = useState(false);
  const [analysisViewMode, setAnalysisViewMode] = useState('table');

  const [stockDetailModalOpen, setStockDetailModalOpen] = useState(false);
  const [stockDetailModalTitle, setStockDetailModalTitle] = useState('');
  const [stockDetailRows, setStockDetailRows] = useState([]);

  const openStockDetailsModal = (title, rows) => {
    setStockDetailModalTitle(title);
    setStockDetailRows(rows || []);
    setStockDetailModalOpen(true);
  };

  const notify = useCallback((msg, type = 'success') => {
    setNotice({ msg, type });
    window.setTimeout(() => setNotice(null), 4000);
  }, []);

  const loadData = useCallback(async () => {
    try {
      let response = await fetch('/crm/quotation/data', {
        headers: { Accept: 'application/json' },
        credentials: 'include',
      });
      if (!response.ok) {
        response = await fetch('/export_documents/quotation/data', {
          headers: { Accept: 'application/json' },
          credentials: 'include',
        });
      }
      const data = await response.json();
      setRows(data.rows || []);
      setAuditLogs(data.audit_logs || []);
      setNextNo(data.next_quotation_no || '');
      setCountryDetails(data.country_details || []);
      setSessionCompany(data.session_company_name || data.session_company_code || '');

      let buyersArr = (data.buyers && data.buyers.length) ? data.buyers : (data.buyer_names || []);
      let agentsArr = data.agents || [];
      let compArr = data.unique_companies || [];
      let locArr = data.production_locations || [];
      let countryArr = data.countries || [];
      let brandArr = data.brands || [];
      let freezerArr = data.freezers || [];
      let glazeArr = data.glazes || [];
      let speciesArr = data.species || [];
      let varietyArr = data.varieties || [];
      let gradeArr = data.grades || [];
      let packingArr = data.packing_styles || data.packing || [];
      setBuyerOptions(buyersArr);
      setAgentsList(agentsArr);
      setUniqueCompanies(compArr);
      setProductionLocations(locArr);
      setCountryOptions(countryArr);
      setBrandsList(brandArr);
      setFreezersList(freezerArr);
      setGlazesList(glazeArr);
      setSpeciesOptions(speciesArr);
      setVarietyOptions(varietyArr);
      setGradeOptions(gradeArr);
      setPackingOptions(packingArr);
      setVarietyYieldsMap(data.variety_yields || {});
      setHosoHlsoYieldsList(data.hoso_hlso_yields || []);
      setGradeToHosoList(data.grade_to_hoso_list || []);

      const openChatQuery = sessionStorage.getItem('openChatQuery');
      const openChatPo = sessionStorage.getItem('openChatPo');
      if (openChatQuery || openChatPo) {
        sessionStorage.removeItem('openChatQuery');
        sessionStorage.removeItem('openChatPo');
        const rowsList = data.rows || [];
        if (rowsList.length > 0) {
          const queryTerm = (openChatPo || openChatQuery || '').toLowerCase();
          const target = rowsList.find(r => 
            (r.quotation_no && r.quotation_no.toLowerCase().includes(queryTerm)) || 
            (r.po_number && r.po_number.toLowerCase().includes(queryTerm)) ||
            (r.customer_name && queryTerm.includes(r.customer_name.toLowerCase()))
          ) || rowsList[0];

          if (target) {
            openRepliesModal(target);
          }
        }
      }

    } catch (error) {
      notify(error.message || 'Unable to load price quotations', 'error');
    }
  }, [notify]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return rows.filter(row => {
      const matchesStatus = statusFilter === 'ALL' || row.status === statusFilter;
      const haystack = `${row.quotation_no} ${row.customer_name} ${row.country || ''} ${row.company_name || ''}`.toLowerCase();
      return matchesStatus && (!term || haystack.includes(term));
    });
  }, [query, rows, statusFilter]);

  const grandTotal = useMemo(() => {
    return form.items.reduce((sum, item) => sum + ((Number(item.quantity_kg) || 0) * (Number(item.rate_per_kg) || 0)), 0);
  }, [form.items]);

  const counts = useMemo(() => Object.fromEntries(
    statuses.map(st => [st, st === 'ALL' ? rows.length : rows.filter(r => r.status === st).length]),
  ), [rows]);

  const totalOfferedValue = useMemo(() => {
    return rows.reduce((sum, r) => sum + (Number(r.total_amount) || 0), 0);
  }, [rows]);

  const openNew = () => {
    setEditingId(null);
    const newForm = emptyForm(nextNo);
    if (sessionCompany) {
      newForm.company_name = sessionCompany;
    } else if (uniqueCompanies && uniqueCompanies.length > 0) {
      newForm.company_name = getOptLabel(uniqueCompanies[0]);
    }
    setForm(newForm);
    setModalOpen(true);
  };

  const openEdit = row => {
    setEditingId(row.id);
    setForm({
      ...emptyForm(),
      ...row,
      po_number: row.po_number || '',
      company_name: row.company_name || '',
      agent: row.agent || '',
      production_at: row.production_at || '',
      exchange_rate: row.exchange_rate || 83.5,
      valid_until: row.valid_until || future30(),
      remarks: row.remarks || '',
      items: row.items && row.items.length ? row.items.map(it => {
        const rateVal = it.bidding_price || it.rate_per_kg || '';
        const hoso = it.target_hoso_rate || '';
        const exp = it.expenses || '';
        const targetPrice = it.target_quotation_price || (hoso && exp ? ((parseFloat(hoso) + parseFloat(exp)) / (parseFloat(row.exchange_rate) || 83.5)).toFixed(2) : '');
        return {
          item_name: it.item_name || '',
          brand: it.brand || '',
          packing_style: it.packing_style || '',
          freezer: it.freezer || '',
          count_glaze: it.count_glaze || '',
          weight_glaze: it.weight_glaze || '',
          species: it.species || '',
          variety: it.variety || '',
          grade: it.grade || '',
          no_of_pieces: it.no_of_pieces || '0',
          no_of_mc: it.no_of_mc || 0,
          quantity_kg: it.quantity_kg || '',
          hoso_count: it.hoso_count || '',
          target_hoso_rate: hoso,
          expenses: exp,
          target_quotation_price: targetPrice,
          rate_per_kg: rateVal,
          bidding_price: rateVal,
        };
      }) : [emptyItem()],
    });
    setModalOpen(true);
  };

  const changeForm = event => {
    const { name, value } = event.target;
    const val = name === 'quotation_no' ? value.toUpperCase() : value;

    setForm(curr => {
      let updatedItems = curr.items;

      // Auto-lookup production cost / expenses by selected country
      if (name === 'country') {
        let costVal = 0;
        if (value) {
          const valClean = String(value).toUpperCase().trim();
          const cObj = countryDetails.find(c => {
            const cName = String(c.country_name || c.country || getOptLabel(c)).toUpperCase().trim();
            return cName === valClean || cName.includes(valClean) || valClean.includes(cName);
          });
          if (cObj && Number(cObj.production_cost_per_kg || cObj.cost_per_kg) > 0) {
            costVal = Number(cObj.production_cost_per_kg || cObj.cost_per_kg);
          }
        }

        if (costVal > 0) {
          updatedItems = curr.items.map(it => {
            const updatedIt = { ...it, expenses: costVal };
            updatedIt.target_quotation_price = calcInventoryCostingTargetPrice(updatedIt, curr.exchange_rate, varietyYieldsMap, hosoHlsoYieldsList);
            return updatedIt;
          });
        }
      }

      // Re-calculate target_quotation_price for all items when exchange rate changes
      if (name === 'exchange_rate' && value) {
        const exch = parseFloat(value || 83.5);
        updatedItems = curr.items.map(it => {
          const updatedIt = { ...it };
          updatedIt.target_quotation_price = calcInventoryCostingTargetPrice(updatedIt, exch, varietyYieldsMap, hosoHlsoYieldsList);
          return updatedIt;
        });
      }

      return {
        ...curr,
        [name]: val,
        items: updatedItems,
      };
    });
  };

  const changeBuyer = event => {
    const val = event.target.value;
    const buyerObj = buyerOptions.find(b => getOptLabel(b) === val);

    let selectedCountry = buyerObj?.country || form.country;
    let countryCost = 0;
    if (selectedCountry) {
      const cObj = countryDetails.find(c => getOptLabel(c.country_name || c.country).toLowerCase() === selectedCountry.toLowerCase());
      if (cObj) countryCost = parseFloat(cObj.production_cost_per_kg || cObj.cost_per_kg || 0);
    }

    setForm(curr => {
      let updatedItems = curr.items;
      if (countryCost > 0) {
        updatedItems = curr.items.map(it => {
          const updatedIt = { ...it, expenses: countryCost };
          updatedIt.target_quotation_price = calcInventoryCostingTargetPrice(updatedIt, curr.exchange_rate, varietyYieldsMap, hosoHlsoYieldsList);
          return updatedIt;
        });
      }

      return {
        ...curr,
        customer_name: val,
        customer_address: buyerObj?.address || buyerObj?.buyer_address || curr.customer_address,
        country: selectedCountry,
        currency: buyerObj?.currency || buyerObj?.currency_code || curr.currency,
        payment_terms: buyerObj?.payment_terms || curr.payment_terms,
        items: updatedItems,
      };
    });
  };

  const handleItemChange = (index, field, value) => {
    setForm(curr => {
      const updated = [...curr.items];
      const item = { ...updated[index], [field]: value };

      // Auto-fill Product Description (item_name) format: species variety freezer (GRADE GLAZE% count_glaze WEIGHT GLAZE% weight_glaze)
      const autoFields = ['species', 'variety', 'freezer', 'count_glaze', 'weight_glaze'];
      if (autoFields.includes(field)) {
        const prefixParts = [
          item.species,
          item.variety,
          item.freezer
        ].map(v => v ? getOptLabel(v).trim() : '').filter(Boolean);

        const glazeParts = [];
        if (item.count_glaze) {
          glazeParts.push(`GRADE GLAZE% ${getOptLabel(item.count_glaze).trim()}`);
        }
        if (item.weight_glaze) {
          glazeParts.push(`WEIGHT GLAZE% ${getOptLabel(item.weight_glaze).trim()}`);
        }

        const desc = [
          prefixParts.join(' '),
          glazeParts.length ? `(${glazeParts.join(' ')})` : ''
        ].filter(Boolean).join(' ');

        item.item_name = desc || item.item_name;
      }

      // Auto-calculate quantity_kg = no_of_mc * mc_weight matching Pending Orders
      if (field === 'no_of_mc' || field === 'packing_style') {
        const mcCount = field === 'no_of_mc' ? (parseInt(value, 10) || 0) : (item.no_of_mc || 0);
        const selectedPackingStr = getOptLabel(item.packing_style);

        let mcKg = 0;
        const packObj = packingOptions.find(p => getOptLabel(p) === selectedPackingStr);
        if (packObj && typeof packObj === 'object' && Number(packObj.mc_weight) > 0) {
          mcKg = Number(packObj.mc_weight);
        } else {
          mcKg = parsePackingKg(selectedPackingStr);
        }

        if (mcCount > 0 && mcKg > 0) {
          item.quantity_kg = (mcCount * mcKg).toFixed(2);
        }
      }

      // Handle no_of_pieces updates & Grade auto-default
      if (field === 'no_of_pieces') {
        item.no_of_pieces = value;
      } else if (field === 'grade') {
        const gradeStr = getOptLabel(item.grade);
        if (gradeStr) {
          const nums = String(gradeStr).match(/\d+/g);
          if (nums && nums.length > 0) {
            const lastNum = parseInt(nums[nums.length - 1], 10);
            if (!isNaN(lastNum)) {
              item.no_of_pieces = String(Math.round(lastNum * 2.2));
            }
          }
        }
      }

      // Exact Pending Orders Report HOSO Count Calculation Algorithm
      if (field === 'grade' || field === 'count_glaze' || field === 'weight_glaze' || field === 'species' || field === 'variety' || field === 'no_of_pieces') {
        const rawGradeStr = getOptLabel(item.grade);
        const normGradeStr = rawGradeStr.toUpperCase().trim();
        let pcs = parseInt(item.no_of_pieces, 10);
        if (isNaN(pcs) || pcs <= 0) {
          const nums = String(rawGradeStr).match(/\d+/g);
          if (nums && nums.length > 0) {
            pcs = Math.round(parseInt(nums[nums.length - 1], 10) * 2.2);
          }
        }

        let glazeFactor = 1.0;
        const rawGlazeText = getOptLabel(item.count_glaze || item.weight_glaze || '').toUpperCase().trim();
        if (rawGlazeText && !rawGlazeText.includes('NWNC') && !rawGlazeText.includes('NET WEIGHT')) {
          const digits = rawGlazeText.match(/\d+/);
          if (digits) {
            glazeFactor = (100 - parseInt(digits[0], 10)) / 100;
          }
        }

        const netCountCalc = pcs > 0 ? (pcs / 2.20462) / (glazeFactor > 0 ? glazeFactor : 1.0) : 0;
        const varietyStr = getOptLabel(item.variety || '').toUpperCase().trim();
        const speciesStr = getOptLabel(item.species || '').toUpperCase().trim();

        // Normalize glaze string for matching grade_to_hoso master
        let targetGlazeStr = 'NWNC';
        if (rawGlazeText && !rawGlazeText.includes('NWNC') && !rawGlazeText.includes('NET WEIGHT')) {
          const glazeDigits = rawGlazeText.match(/\d+/);
          if (glazeDigits) {
            targetGlazeStr = `${glazeDigits[0]}%`;
          }
        }

        // Exact match in grade_to_hoso master: Species + Grade + Variety + Glaze
        const exactMatch = gradeToHosoList.find(g => {
          const matchSpecies = !g.species || g.species.toUpperCase().trim() === speciesStr;
          const matchGrade = g.grade_name === normGradeStr;
          const matchVariety = !g.variety_name || g.variety_name.toUpperCase().trim() === varietyStr;
          const gGlaze = (g.glaze_name || '').toUpperCase().trim();
          const matchGlaze = !g.glaze_name || gGlaze === targetGlazeStr || (targetGlazeStr === 'NWNC' && (gGlaze.includes('NWNC') || gGlaze.includes('NET')));
          return matchSpecies && matchGrade && matchVariety && matchGlaze;
        });

        // Fallback match in grade_to_hoso master: Species + Grade + Variety
        const fallbackMatch = exactMatch || gradeToHosoList.find(g => {
          const matchSpecies = !g.species || g.species.toUpperCase().trim() === speciesStr;
          const matchGrade = g.grade_name === normGradeStr;
          const matchVariety = !g.variety_name || g.variety_name.toUpperCase().trim() === varietyStr;
          return matchSpecies && matchGrade && matchVariety;
        });

        if (varietyStr.includes('HOSO')) {
          if (netCountCalc > 0) {
            item.hoso_count = String(Math.round(netCountCalc));
          } else if (fallbackMatch && (fallbackMatch.hoso_count || fallbackMatch.nw_grade)) {
            item.hoso_count = String(fallbackMatch.hoso_count || fallbackMatch.nw_grade);
          }
        } else {
          let peelingYield = 1.0;
          let soakingYield = 1.0;
          if (varietyYieldsMap && varietyYieldsMap[varietyStr]) {
            peelingYield = (parseFloat(varietyYieldsMap[varietyStr].peeling_yield || 100)) / 100;
            soakingYield = (parseFloat(varietyYieldsMap[varietyStr].soaking_yield || 100)) / 100;
          }
          const hlCountCalc = netCountCalc * peelingYield * soakingYield;

          if (hosoHlsoYieldsList && hosoHlsoYieldsList.length > 0 && hlCountCalc > 0) {
            const spYields = hosoHlsoYieldsList.filter(h => !h.species || h.species === speciesStr);
            const pool = spYields.length > 0 ? spYields : hosoHlsoYieldsList;
            const nearestY = pool.reduce((prev, curr) => {
              const prevDiff = Math.abs((prev.hlso_count || 0) - hlCountCalc);
              const currDiff = Math.abs((curr.hlso_count || 0) - hlCountCalc);
              return currDiff < prevDiff ? curr : prev;
            });
            if (nearestY && nearestY.hoso_count !== undefined) {
              item.hoso_count = String(nearestY.hoso_count);
            }
          } else if (fallbackMatch && (fallbackMatch.hoso_count || fallbackMatch.nw_grade)) {
            item.hoso_count = String(fallbackMatch.hoso_count || fallbackMatch.nw_grade);
          }
        }
      }

      // Auto-calculate Target Quotation Price ($/Kg) matching Inventory Costing formula
      const costingFields = ['target_hoso_rate', 'expenses', 'species', 'variety', 'grade', 'count_glaze', 'weight_glaze', 'hoso_count'];
      if (costingFields.includes(field)) {
        item.target_quotation_price = calcInventoryCostingTargetPrice(item, curr.exchange_rate, varietyYieldsMap, hosoHlsoYieldsList);
      }

      // Keep bidding_price and rate_per_kg in sync
      if (field === 'rate_per_kg' || field === 'bidding_price') {
        item.rate_per_kg = value;
        item.bidding_price = value;
      }

      updated[index] = item;
      return { ...curr, items: updated };
    });
  };







  const addItemRow = () => {
    setForm(curr => {
      const prevItem = curr.items.length > 0 ? curr.items[curr.items.length - 1] : null;
      const newItem = prevItem ? {
        ...emptyItem(),
        brand: prevItem.brand || '',
        packing_style: prevItem.packing_style || '',
        freezer: prevItem.freezer || '',
        count_glaze: prevItem.count_glaze || '',
        weight_glaze: prevItem.weight_glaze || '',
        species: prevItem.species || '',
        variety: prevItem.variety || '',
        grade: prevItem.grade || '',
        expenses: prevItem.expenses || '',
      } : emptyItem();

      if (newItem.grade) {
        const nums = String(newItem.grade).match(/\d+/g);
        if (nums && nums.length > 0) {
          const lastNum = parseInt(nums[nums.length - 1], 10);
          if (!isNaN(lastNum)) {
            newItem.no_of_pieces = String(Math.round(lastNum * 2.2));
          }
        }
      }

      newItem.target_quotation_price = calcInventoryCostingTargetPrice(newItem, curr.exchange_rate, varietyYieldsMap, hosoHlsoYieldsList);
      return { ...curr, items: [...curr.items, newItem] };
    });
  };

  const removeItemRow = index => {
    if (form.items.length <= 1) {
      notify('Quotation must contain at least one item line.', 'error');
      return;
    }
    setForm(curr => ({ ...curr, items: curr.items.filter((_, i) => i !== index) }));
  };

  const save = async event => {
    event.preventDefault();
    if (!form.customer_name.trim()) {
      notify('Customer / Buyer name is required.', 'error');
      return;
    }
    if (form.valid_until && form.valid_until < form.quotation_date) {
      notify('Valid Until date cannot be earlier than Quotation Date.', 'error');
      return;
    }
    if (!form.items.length) {
      notify('Quotation must contain at least one item line.', 'error');
      return;
    }

    if (!window.confirm(`Do you want to ${editingId ? 'update' : 'create'} this quotation?`)) return;

    setSaving(true);
    try {
      const payload = {
        ...form,
        exchange_rate: Number(form.exchange_rate) || 83.5,
        items: form.items.map(it => {
          const prefixParts = [it.species, it.variety, it.freezer].map(v => v ? getOptLabel(v).trim() : '').filter(Boolean);
          const glazeParts = [];
          if (it.count_glaze) glazeParts.push(`GRADE GLAZE% ${getOptLabel(it.count_glaze).trim()}`);
          if (it.weight_glaze) glazeParts.push(`WEIGHT GLAZE% ${getOptLabel(it.weight_glaze).trim()}`);

          let autoName = prefixParts.join(' ');
          if (glazeParts.length > 0) {
            autoName = autoName ? `${autoName} (${glazeParts.join(' ')})` : `(${glazeParts.join(' ')})`;
          }
          const item_name = it.item_name || autoName || 'SEAFOOD OFFER ITEM';

          return {
            ...it,
            item_name,
            no_of_mc: Number(it.no_of_mc) || 0,
            quantity_kg: Number(it.quantity_kg) || 0,
            rate_per_kg: Number(it.rate_per_kg) || 0,
            amount: (Number(it.quantity_kg) || 0) * (Number(it.rate_per_kg) || 0),
          };
        }),
      };


      const method = editingId ? 'PUT' : 'POST';
      const requestOptions = {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      };
      const primaryUrl = editingId ? `/crm/quotation/${editingId}` : '/crm/quotation/save';
      const fallbackUrl = editingId
        ? `/export_documents/quotation/${editingId}`
        : '/export_documents/quotation/save';

      // Some deployed instances expose quotation endpoints under the export
      // documents router. Match the data loader's fallback so saving remains
      // available during a rolling backend upgrade.
      let response = await fetch(primaryUrl, requestOptions);
      if (response.status === 404) {
        response = await fetch(fallbackUrl, requestOptions);
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.detail || data.message || 'Save failed');

      setModalOpen(false);
      await loadData();
      notify(data.message);
    } catch (error) {
      notify(error.message || 'Unable to save price quotation', 'error');
    } finally {
      setSaving(false);
    }
  };

  const analyzeStock = async () => {
    if (!form.items.length) {
      notify('Please add at least one item line to analyze stock availability.', 'error');
      return;
    }

    setAnalyzing(true);
    try {
      const payload = {
        company_name: form.company_name,
        production_at: form.production_at,
        items: form.items.map(it => {
          const prefixParts = [it.species, it.variety, it.freezer].map(v => v ? getOptLabel(v).trim() : '').filter(Boolean);
          const glazeParts = [];
          if (it.count_glaze) glazeParts.push(`GRADE GLAZE% ${getOptLabel(it.count_glaze).trim()}`);
          if (it.weight_glaze) glazeParts.push(`WEIGHT GLAZE% ${getOptLabel(it.weight_glaze).trim()}`);

          let autoName = prefixParts.join(' ');
          if (glazeParts.length > 0) {
            autoName = autoName ? `${autoName} (${glazeParts.join(' ')})` : `(${glazeParts.join(' ')})`;
          }
          const item_name = it.item_name || autoName || 'SEAFOOD OFFER ITEM';

          return {
            ...it,
            species: getOptLabel(it.species),
            variety: getOptLabel(it.variety),
            grade: getOptLabel(it.grade),
            packing_style: getOptLabel(it.packing_style),
            freezer: getOptLabel(it.freezer),
            count_glaze: getOptLabel(it.count_glaze),
            weight_glaze: getOptLabel(it.weight_glaze),
            brand: getOptLabel(it.brand),
            item_name,
            no_of_mc: Number(it.no_of_mc) || 0,
            quantity_kg: Number(it.quantity_kg) || 0,
            rate_per_kg: Number(it.rate_per_kg) || 0,
            amount: (Number(it.quantity_kg) || 0) * (Number(it.rate_per_kg) || 0),
          };
        }),
      };


      let cards = [];
      try {
        let res = await fetch('/crm/quotation/analyze_stock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          res = await fetch('/export_documents/quotation/analyze_stock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload),
          });
        }
        if (res.ok) {
          const data = await res.json();
          if (data && data.success && Array.isArray(data.cards)) {
            cards = data.cards;
          }
        }
      } catch (e) {
        console.warn('API stock analysis fetch warning:', e);
      }

      if (!cards.length) {
        cards = payload.items.map((it, idx) => ({
          line_no: idx + 1,
          item_name: it.item_name,
          brand: getOptLabel(it.brand) || 'N/A',
          packing_style: getOptLabel(it.packing_style) || 'N/A',
          freezer: getOptLabel(it.freezer) || 'N/A',
          count_glaze: getOptLabel(it.count_glaze) || 'N/A',
          weight_glaze: getOptLabel(it.weight_glaze) || 'N/A',
          species: getOptLabel(it.species) || 'N/A',
          variety: getOptLabel(it.variety) || 'N/A',
          grade: getOptLabel(it.grade) || 'N/A',
          no_of_pieces: it.no_of_pieces || '0',
          required_mc: Number(it.no_of_mc) || 0,
          required_kg: Number(it.quantity_kg) || 0,
          available_stock_mc: 0,
          available_stock_kg: 0,
          deficit_mc: Number(it.no_of_mc) || 0,
          status: 'OUT_OF_STOCK',
          is_cross_packing: false,
          exact_match_mc: 0,
          grade_match_mc: 0,
        }));
      }

      setAnalysisResult(cards);
      setAnalysisModalOpen(true);
      notify('Stock Analysis Modal Launched! Details loaded in popup.', 'success');
    } catch (err) {
      notify(err.message || 'Unable to perform stock analysis', 'error');
    } finally {
      setAnalyzing(false);
    }
  };




  const postQuotationApproval = async (quotationId, body) => {
    const requestOptions = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    };
    let response = await fetch(`/crm/quotation/${quotationId}/approval`, requestOptions);
    if (response.status === 404) {
      response = await fetch(`/export_documents/quotation/${quotationId}/approval`, requestOptions);
    }
    return response;
  };

  const handleDirectStatusChange = async (row, newStatus) => {
    if (!newStatus || newStatus === row.status) return;
    try {
      const response = await postQuotationApproval(row.id, {
        decision: newStatus,
        remarks: `Status changed to ${newStatus}`,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) throw new Error(data.message || 'Status update failed');

      await loadData();
      notify(`Quotation ${row.quotation_no} status updated to ${newStatus}`, 'success');
    } catch (error) {
      notify(error.message || 'Unable to update status', 'error');
    }
  };

  const handleMakeOrViewPI = async (row) => {
    sessionStorage.setItem('highlight_quotation_no', row.quotation_no);
    if (row.status !== 'ACCEPTED') {
      if (!window.confirm(`Accept quotation ${row.quotation_no} and automatically create Proforma Invoice (PI)?`)) return;
      try {
        const response = await postQuotationApproval(row.id, {
          decision: 'ACCEPTED',
          remarks: `Auto-created PI for quotation ${row.quotation_no}`,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.message || 'Failed to update quotation status');
        notify(data.message || 'Quotation accepted and PI created! Opening PI page...', 'success');
      } catch (error) {
        notify(error.message || 'Unable to create PI', 'error');
        return;
      }
    } else {
      notify('Opening Proforma Invoices...', 'success');
    }

    if (typeof setActivePage === 'function') {
      setActivePage('exp_pi');
    } else {
      const basePath = window.location.pathname.startsWith('/app') ? '/app' : '';
      window.location.href = `${basePath}/p/exp_pi`;
    }
  };

  const cancelRow = async row => {
    if (!window.confirm(`Cancel quotation ${row.quotation_no}?`)) return;
    try {
      const response = await fetch(`/crm/quotation/cancel/${row.id}`, {
        method: 'POST',
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Cancel failed');

      await loadData();
      notify(data.message);
    } catch (error) {
      notify(error.message || 'Unable to cancel quotation', 'error');
    }
  };

  // ----------------------------------------------------
  // DEDICATED FULL SCREEN FORM VIEW (WHEN FORM IS OPEN)
  // ----------------------------------------------------
  if (modalOpen) {
    return (
      <div className="attendance-container export-document-page page-scrollable" style={{ padding: 16, overflowY: 'auto', flex: 1, minHeight: 0 }}>

        {notice && <div className={`attendance-toast ${notice.type === 'error' ? 'error' : 'success'}`} style={{ top: 20 }}>{notice.msg}</div>}

        <div className="attendance-page-header" style={{ marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: 20 }}>{editingId ? 'Edit' : 'Create'} Price Quotation</h1>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--att-muted)' }}>
              Complete commercial header context, buyer specifications, locations, and line item details.
            </p>
          </div>
          <div className="attendance-page-header-actions">
            <button type="button" className="attendance-btn attendance-btn-secondary" onClick={() => setModalOpen(false)}>
              <X size={16} /> HIDE FORM
            </button>
          </div>
        </div>

        {/* DYNAMIC RESPONSIVE SPLIT SCREEN WORKSPACE LAYOUT */}
        <div className="quotation-split-workspace">

          {/* LEFT PANEL - QUOTATION FORM */}
          <div className="quotation-left-panel">
            <form onSubmit={save} style={{ background: 'var(--att-card, #fff)', borderRadius: 12, border: '1px solid var(--att-border, #e2e8f0)', padding: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.05)' }}>
              <div className="pi-form-body">
                {/* SECTION 1: RESPONSIVE COMMERCIAL HEADER CONTEXT */}
                <section className="pi-form-section" style={{ background: '#ffffff', padding: '10px 12px', borderRadius: 8, border: '1px solid #cbd5e1', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, borderBottom: '1px solid #e2e8f0', paddingBottom: 4 }}>
                    <span style={{ fontWeight: 800, fontSize: 11.5, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FileText size={13} color="#2563eb" /> 1. Commercial Header Context
                    </span>
                    <span style={{ fontSize: 9.5, color: '#64748b', fontWeight: 600 }}>Commercial Terms & Buyer Details</span>
                  </div>

                  <div className="quotation-header-grid">
                    {/* Row 1 */}
                    <div className="attendance-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 9.5, fontWeight: 700, color: '#334155', marginBottom: 1 }}>Quotation No *</label>
                      <input className="attendance-input" style={{ fontSize: 10, padding: '3px 6px', height: 25 }} name="quotation_no" value={form.quotation_no} onChange={changeForm} required placeholder="QT-2026-0001" />
                    </div>

                    <div className="attendance-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 9.5, fontWeight: 700, color: '#334155', marginBottom: 1 }}>Shipment Date *</label>
                      <input className="attendance-input" style={{ fontSize: 10, padding: '3px 6px', height: 25 }} name="shipment_date" type="date" value={form.shipment_date || ''} onChange={changeForm} required />
                    </div>

                    <div className="attendance-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 9.5, fontWeight: 700, color: '#334155', marginBottom: 1 }}>Valid Until *</label>
                      <input className="attendance-input" style={{ fontSize: 10, padding: '3px 6px', height: 25 }} name="valid_until" type="date" min={form.quotation_date} value={form.valid_until} onChange={changeForm} required />
                    </div>

                    <div className="attendance-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 9.5, fontWeight: 700, color: '#334155', marginBottom: 1 }}>Customer Name *</label>
                      <select className="attendance-select" name="customer_name" value={form.customer_name} onChange={changeBuyer} required style={{ fontSize: 10, padding: '3px 6px', height: 25 }}>
                        <option value="">Select Customer</option>
                        {buyerOptions.map(b => {
                          const val = getOptLabel(b);
                          return <option key={val} value={val}>{val}</option>;
                        })}
                      </select>
                    </div>

                    {/* Row 2 */}
                    <div className="attendance-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 9.5, fontWeight: 700, color: '#334155', marginBottom: 1 }}>Company Name</label>
                      <select className="attendance-select" name="company_name" value={form.company_name} onChange={changeForm} style={{ fontSize: 10, padding: '3px 6px', height: 25 }}>
                        <option value="">Select Company</option>
                        {uniqueCompanies.map(c => {
                          const val = getOptLabel(c);
                          return <option key={val} value={val}>{val}</option>;
                        })}
                      </select>
                    </div>

                    <div className="attendance-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 9.5, fontWeight: 700, color: '#334155', marginBottom: 1 }}>Processing Location</label>
                      <select className="attendance-select" name="production_at" value={form.production_at} onChange={changeForm} style={{ fontSize: 10, padding: '3px 6px', height: 25 }}>
                        <option value="">Select Location</option>
                        {productionLocations.map(loc => {
                          const val = getOptLabel(loc);
                          return <option key={val} value={val}>{val}</option>;
                        })}
                      </select>
                    </div>

                    <div className="attendance-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 9.5, fontWeight: 700, color: '#334155', marginBottom: 1 }}>Agent Link</label>
                      <select className="attendance-select" name="agent" value={form.agent} onChange={changeForm} style={{ fontSize: 10, padding: '3px 6px', height: 25 }}>
                        <option value="">Select Agent</option>
                        {agentsList.map(a => {
                          const val = getOptLabel(a);
                          return <option key={val} value={val}>{val}</option>;
                        })}
                      </select>
                    </div>

                    <div className="attendance-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 9.5, fontWeight: 700, color: '#334155', marginBottom: 1 }}>Target Country</label>
                      <select className="attendance-select" name="country" value={form.country} onChange={changeForm} style={{ fontSize: 10, padding: '3px 6px', height: 25 }}>
                        <option value="">Select Country</option>
                        {countryOptions.map(c => {
                          const val = getOptLabel(c);
                          return <option key={val} value={val}>{val}</option>;
                        })}
                      </select>
                    </div>

                    {/* Row 3 */}
                    <div className="attendance-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 9.5, fontWeight: 700, color: '#334155', marginBottom: 1 }}>Currency *</label>
                      <select className="attendance-select" name="currency" value={form.currency} onChange={changeForm} style={{ fontSize: 10, padding: '3px 6px', height: 25 }}>
                        {['USD', 'EUR', 'GBP', 'AED', 'JPY', 'INR'].map(curr => <option key={curr} value={curr}>{curr}</option>)}
                      </select>
                    </div>

                    <div className="attendance-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 9.5, fontWeight: 700, color: '#334155', marginBottom: 1 }}>Exchange Rate (₹)</label>
                      <input className="attendance-input" style={{ fontSize: 10, padding: '3px 6px', height: 25 }} name="exchange_rate" type="number" step="0.01" value={form.exchange_rate} onChange={changeForm} placeholder="83.50" />
                    </div>

                    <div className="attendance-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 9.5, fontWeight: 700, color: '#334155', marginBottom: 1 }}>Incoterm</label>
                      <select className="attendance-select" name="incoterm" value={form.incoterm} onChange={changeForm} style={{ fontSize: 10, padding: '3px 6px', height: 25 }}>
                        {['FOB', 'CFR', 'CIF', 'EXW', 'FCA', 'CPT', 'CIP', 'DDP'].map(inco => <option key={inco} value={inco}>{inco}</option>)}
                      </select>
                    </div>

                    <div className="attendance-form-group" style={{ margin: 0 }}>
                      <label style={{ fontSize: 9.5, fontWeight: 700, color: '#334155', marginBottom: 1 }}>Payment Terms</label>
                      <input className="attendance-input" style={{ fontSize: 10, padding: '3px 6px', height: 25 }} name="payment_terms" value={form.payment_terms} onChange={changeForm} placeholder="30% Advance" />
                    </div>
                  </div>
                </section>

                {/* SECTION 2: DUAL-ROW CARD WORKSTATION (PINA: SPECS / KINDA: COMMERCIALS & COSTING) */}
                <section className="pi-form-section" style={{ marginTop: 10 }}>
                  <div className="pi-form-section-title" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 800 }}>2. Item Specifications & Costing Grid ({form.items.length} Items)</span>
                    <button type="button" className="attendance-btn attendance-btn-secondary" style={{ padding: '2px 8px', fontSize: 9.5 }} onClick={addItemRow}>
                      <Plus size={12} /> ADD ITEM ROW
                    </button>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4, width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                    {form.items.map((item, idx) => {
                      const biddingPriceVal = Number(item.bidding_price || item.rate_per_kg) || 0;
                      const lineAmt = (Number(item.quantity_kg) || 0) * biddingPriceVal;

                      return (
                        <div
                          key={idx}
                          style={{
                            background: '#ffffff',
                            border: '1px solid #cbd5e1',
                            borderRadius: 6,
                            overflow: 'hidden',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                            minWidth: 780
                          }}
                        >
                          {/* PINA (TOP ROW): PRODUCT SPECIFICATIONS (MATCHED 11-COLUMN GRID) */}
                          <div style={{ display: 'grid', gridTemplateColumns: '26px repeat(8, 1fr) 1.2fr 26px', alignItems: 'flex-end', gap: 4, background: '#eff6ff', padding: '5px 6px 4px', borderBottom: '1px solid #bfdbfe' }}>
                            <div style={{ textAlign: 'center', marginBottom: 2 }}>
                              <span style={{ fontWeight: 900, fontSize: 8.5, color: '#ffffff', background: '#2563eb', padding: '2px 4px', borderRadius: 3 }}>
                                #{idx + 1}
                              </span>
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <label style={{ fontSize: 6.8, fontWeight: 900, letterSpacing: '0.1px', color: '#1d4ed8', textTransform: 'uppercase', display: 'block', marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>BRAND</label>
                              <select className="attendance-select" style={{ fontSize: 9.5, padding: '2px 3px', height: 24, width: '100%', minWidth: 0 }} value={item.brand} onChange={e => handleItemChange(idx, 'brand', e.target.value)}>
                                <option value="">Brand</option>
                                {brandsList.map(b => <option key={getOptLabel(b)} value={getOptLabel(b)}>{getOptLabel(b)}</option>)}
                              </select>
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <label style={{ fontSize: 6.8, fontWeight: 900, letterSpacing: '0.1px', color: '#1d4ed8', textTransform: 'uppercase', display: 'block', marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>PACKING</label>
                              <select className="attendance-select" style={{ fontSize: 9.5, padding: '2px 3px', height: 24, width: '100%', minWidth: 0 }} value={item.packing_style} onChange={e => handleItemChange(idx, 'packing_style', e.target.value)}>
                                <option value="">Packing</option>
                                {packingOptions.map(p => <option key={getOptLabel(p)} value={getOptLabel(p)}>{getOptLabel(p)}</option>)}
                              </select>
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <label style={{ fontSize: 6.8, fontWeight: 900, letterSpacing: '0.1px', color: '#1d4ed8', textTransform: 'uppercase', display: 'block', marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>FREEZER</label>
                              <select className="attendance-select" style={{ fontSize: 9.5, padding: '2px 3px', height: 24, width: '100%', minWidth: 0 }} value={item.freezer} onChange={e => handleItemChange(idx, 'freezer', e.target.value)}>
                                <option value="">Freezer</option>
                                {freezersList.map(f => <option key={getOptLabel(f)} value={getOptLabel(f)}>{getOptLabel(f)}</option>)}
                              </select>
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <label style={{ fontSize: 6.8, fontWeight: 900, letterSpacing: '0.1px', color: '#1d4ed8', textTransform: 'uppercase', display: 'block', marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>C.GLAZE</label>
                              <select className="attendance-select" style={{ fontSize: 9.5, padding: '2px 3px', height: 24, width: '100%', minWidth: 0 }} value={item.count_glaze} onChange={e => handleItemChange(idx, 'count_glaze', e.target.value)}>
                                <option value="">C.Glaze</option>
                                {glazesList.map(g => <option key={getOptLabel(g)} value={getOptLabel(g)}>{getOptLabel(g)}</option>)}
                              </select>
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <label style={{ fontSize: 6.8, fontWeight: 900, letterSpacing: '0.1px', color: '#1d4ed8', textTransform: 'uppercase', display: 'block', marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>W.GLAZE</label>
                              <select className="attendance-select" style={{ fontSize: 9.5, padding: '2px 3px', height: 24, width: '100%', minWidth: 0 }} value={item.weight_glaze} onChange={e => handleItemChange(idx, 'weight_glaze', e.target.value)}>
                                <option value="">W.Glaze</option>
                                {glazesList.map(g => <option key={getOptLabel(g)} value={getOptLabel(g)}>{getOptLabel(g)}</option>)}
                              </select>
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <label style={{ fontSize: 6.8, fontWeight: 900, letterSpacing: '0.1px', color: '#1d4ed8', textTransform: 'uppercase', display: 'block', marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>SPECIES</label>
                              <select className="attendance-select" style={{ fontSize: 9.5, padding: '2px 3px', height: 24, width: '100%', minWidth: 0 }} value={item.species} onChange={e => handleItemChange(idx, 'species', e.target.value)}>
                                <option value="">Species</option>
                                {speciesOptions.map(s => <option key={getOptLabel(s)} value={getOptLabel(s)}>{getOptLabel(s)}</option>)}
                              </select>
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <label style={{ fontSize: 6.8, fontWeight: 900, letterSpacing: '0.1px', color: '#1d4ed8', textTransform: 'uppercase', display: 'block', marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>VARIETY</label>
                              <select className="attendance-select" style={{ fontSize: 9.5, padding: '2px 3px', height: 24, width: '100%', minWidth: 0 }} value={item.variety} onChange={e => handleItemChange(idx, 'variety', e.target.value)}>
                                <option value="">Variety</option>
                                {varietyOptions.map(v => <option key={getOptLabel(v)} value={getOptLabel(v)}>{getOptLabel(v)}</option>)}
                              </select>
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <label style={{ fontSize: 6.8, fontWeight: 900, letterSpacing: '0.1px', color: '#1d4ed8', textTransform: 'uppercase', display: 'block', marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>GRADE</label>
                              <select className="attendance-select" style={{ fontSize: 9.5, padding: '2px 3px', height: 24, width: '100%', minWidth: 0 }} value={item.grade} onChange={e => handleItemChange(idx, 'grade', e.target.value)}>
                                <option value="">Grade</option>
                                {gradeOptions.map(g => <option key={getOptLabel(g)} value={getOptLabel(g)}>{getOptLabel(g)}</option>)}
                              </select>
                            </div>

                            <div style={{ minWidth: 0 }}></div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
                              <button
                                type="button"
                                style={{ color: '#ef4444', border: 'none', background: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                onClick={() => removeItemRow(idx)}
                                title="Remove Item Row"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>

                          {/* KINDA (BOTTOM ROW): COMMERCIALS & COSTING (MATCHED 11-COLUMN GRID) */}
                          <div style={{ display: 'grid', gridTemplateColumns: '26px repeat(8, 1fr) 1.2fr 26px', alignItems: 'flex-end', gap: 4, background: '#f8fafc', padding: '4px 6px' }}>
                            <span style={{ fontSize: 8.5, fontWeight: 900, color: '#475569', textAlign: 'center', marginBottom: 4 }}>⚙️</span>

                            <div style={{ minWidth: 0 }}>
                              <label style={{ fontSize: 6.8, fontWeight: 900, letterSpacing: '0.1px', color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>NO. OF PIECES</label>
                              <input
                                type="text"
                                className="attendance-input"
                                style={{ fontSize: 9.5, padding: '2px 3px', height: 24, width: '100%', minWidth: 0, textAlign: 'center' }}
                                value={item.no_of_pieces}
                                onChange={e => handleItemChange(idx, 'no_of_pieces', e.target.value)}
                                placeholder="Pieces"
                              />
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <label style={{ fontSize: 6.8, fontWeight: 900, letterSpacing: '0.1px', color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>NO. OF MC</label>
                              <input
                                type="number"
                                min="0"
                                className="attendance-input"
                                style={{ fontSize: 9.5, padding: '2px 3px', height: 24, width: '100%', minWidth: 0, textAlign: 'center' }}
                                value={item.no_of_mc}
                                onChange={e => handleItemChange(idx, 'no_of_mc', parseInt(e.target.value) || 0)}
                                placeholder="MC"
                              />
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <label style={{ fontSize: 6.8, fontWeight: 900, letterSpacing: '0.1px', color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>QTY (KG)*</label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                className="attendance-input"
                                style={{ fontSize: 9.5, padding: '2px 3px', height: 24, width: '100%', minWidth: 0 }}
                                value={item.quantity_kg}
                                onChange={e => handleItemChange(idx, 'quantity_kg', e.target.value)}
                                placeholder="Qty(KG)*"
                                required
                              />
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <label style={{ fontSize: 6.8, fontWeight: 900, letterSpacing: '0.1px', color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>HOSO COUNT</label>
                              <input
                                type="text"
                                className="attendance-input"
                                style={{ fontSize: 9.5, padding: '2px 3px', height: 24, width: '100%', minWidth: 0, textAlign: 'center' }}
                                value={item.hoso_count || ''}
                                onChange={e => handleItemChange(idx, 'hoso_count', e.target.value)}
                                placeholder="HOSO Count"
                              />
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <label style={{ fontSize: 6.8, fontWeight: 900, letterSpacing: '0.1px', color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>HOSO RATE (₹)</label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                className="attendance-input"
                                style={{ fontSize: 9.5, padding: '2px 3px', height: 24, width: '100%', minWidth: 0 }}
                                value={item.target_hoso_rate || ''}
                                onChange={e => handleItemChange(idx, 'target_hoso_rate', e.target.value)}
                                placeholder="HOSO Rate(₹)"
                              />
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <label style={{ fontSize: 6.8, fontWeight: 900, letterSpacing: '0.1px', color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>EXPENSES (₹)</label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                className="attendance-input"
                                style={{ fontSize: 9.5, padding: '2px 3px', height: 24, width: '100%', minWidth: 0 }}
                                value={item.expenses || ''}
                                onChange={e => handleItemChange(idx, 'expenses', e.target.value)}
                                placeholder="Expenses(₹)"
                              />
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <label style={{ fontSize: 6.8, fontWeight: 900, letterSpacing: '0.1px', color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>TARGET ($)</label>
                              <input
                                type="number"
                                step="0.01"
                                className="attendance-input"
                                style={{ fontSize: 9.5, padding: '2px 3px', height: 24, width: '100%', minWidth: 0, background: '#e2e8f0', color: '#0f172a', fontWeight: 800, cursor: 'not-allowed' }}
                                value={item.target_quotation_price || ''}
                                readOnly
                                placeholder="Target($)"
                              />
                            </div>

                            <div style={{ minWidth: 0 }}>
                              <label style={{ fontSize: 6.8, fontWeight: 900, letterSpacing: '0.1px', color: '#475569', textTransform: 'uppercase', display: 'block', marginBottom: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>BIDDING ($)*</label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                className="attendance-input"
                                style={{ fontSize: 9.5, padding: '2px 3px', height: 24, width: '100%', minWidth: 0, fontWeight: 800, borderColor: '#93c5fd', color: '#1d4ed8' }}
                                value={item.rate_per_kg || item.bidding_price || ''}
                                onChange={e => handleItemChange(idx, 'rate_per_kg', e.target.value)}
                                placeholder="Bidding($)*"
                                required
                              />
                            </div>

                            <div style={{ minWidth: 0, textAlign: 'right' }}>
                              <label style={{ fontSize: 7.5, fontWeight: 900, color: '#16a34a', textTransform: 'uppercase', display: 'block', marginBottom: 1, whiteSpace: 'nowrap' }}>TOTAL ({form.currency})</label>
                              <div style={{ fontSize: 10, fontWeight: 900, color: '#15803d', background: '#dcfce7', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap', height: 24, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', border: '1px solid #bbf7d0' }}>
                                {form.currency} {lineAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </div>

                            <div style={{ width: 26 }}></div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="pi-form-section" style={{ padding: 12, marginTop: 16 }}>
                  <div className="attendance-form-group pi-full-row">
                    <label>Special Terms & Remarks</label>
                    <textarea
                      className="attendance-input"
                      name="remarks"
                      value={form.remarks}
                      onChange={changeForm}
                      onFocus={e => { e.target.style.height = 'auto'; e.target.style.height = `${Math.max(60, e.target.scrollHeight)}px`; }}
                      onInput={e => { e.target.style.height = 'auto'; e.target.style.height = `${Math.max(60, e.target.scrollHeight)}px`; }}
                      ref={el => { if (el) { el.style.height = 'auto'; el.style.height = `${Math.max(60, el.scrollHeight)}px`; } }}
                      style={{ minHeight: 60, resize: 'vertical', lineHeight: 1.45, overflowY: 'hidden' }}
                      placeholder="Delivery schedule, quality standards, or validity notes"
                    />
                  </div>
                </section>
              </div>

              <div className="attendance-modal-footer" style={{ marginTop: 12, padding: '8px 12px', borderTop: '1px solid var(--att-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', background: 'var(--att-table-header-bg, #f8fafc)', borderRadius: 8 }}>
                <div className="pi-footer-total" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Grand Total Offer:</span>
                  <strong style={{ fontSize: 13, fontWeight: 900, color: '#15803d', background: '#dcfce7', padding: '2px 8px', borderRadius: 5, border: '1px solid #bbf7d0', display: 'inline-block', whiteSpace: 'nowrap' }}>{form.currency} {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button type="button" className="attendance-btn attendance-btn-secondary" onClick={() => setModalOpen(false)} style={{ padding: '3px 9px', fontSize: 10.5, height: 28 }}>CANCEL</button>
                  <button
                    type="button"
                    className="attendance-btn attendance-btn-secondary"
                    onClick={analyzeStock}
                    disabled={analyzing}
                    style={{ color: '#2563eb', borderColor: '#93c5fd', background: '#eff6ff', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, padding: '3px 9px', fontSize: 10.5, height: 28 }}
                  >
                    <BarChart2 size={13} /> {analyzing ? 'ANALYZING...' : 'ANALYZE STOCK'}
                  </button>
                  {editingId && (
                    <button
                      type="button"
                      className="attendance-btn attendance-btn-secondary"
                      onClick={() => openSendEmailModal({ ...form, id: editingId })}
                      style={{ color: '#1d4ed8', borderColor: '#bfdbfe', background: '#eff6ff', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 800, padding: '3px 9px', fontSize: 10.5, height: 28 }}
                    >
                      <Send size={13} /> SEND EMAIL ✉️
                    </button>
                  )}
                  <button type="submit" className="attendance-btn attendance-btn-primary" disabled={saving} style={{ padding: '3px 14px', fontSize: 11, height: 28, fontWeight: 800 }}>
                    {saving ? 'SAVING...' : editingId ? 'UPDATE QUOTATION' : 'CREATE QUOTATION'}
                  </button>
                </div>
              </div>
            </form>
          </div>

          {/* RIGHT PANEL - DETAILED & COMPACT STOCK ANALYSIS */}
          <div className="quotation-right-panel">
            <div style={{ background: 'var(--att-card, #ffffff)', borderRadius: 12, border: '1px solid var(--att-border, #e2e8f0)', padding: 14, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--att-border, #e2e8f0)', paddingBottom: 10 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--att-text, #0f172a)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <BarChart2 size={16} color="#2563eb" /> Live Stock Analysis
                  </h3>
                </div>
                {analysisResult.length > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 12, background: '#eff6ff', color: '#2563eb' }}>
                    {analysisResult.length} ITEMS
                  </span>
                )}
              </div>

              {/* Content */}
              {analyzing ? (
                <div style={{ padding: '40px 10px', textAlign: 'center', color: '#64748b', fontSize: 12 }}>
                  <div className="spinner" style={{ margin: '0 auto 10px' }} />
                  Analyzing live finished goods stock availability...
                </div>
              ) : analysisResult.length === 0 ? (
                <div style={{ padding: '40px 16px', textAlign: 'center', background: '#f8fafc', borderRadius: 8, border: '1px dashed #cbd5e1' }}>
                  <BarChart2 size={36} style={{ color: '#94a3b8', marginBottom: 8 }} />
                  <h4 style={{ margin: '4px 0', fontSize: 13, color: '#334155', fontWeight: 700 }}>No Analysis Loaded Yet</h4>
                  <p style={{ margin: 0, fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>
                    Click <strong>"ANALYZE STOCK"</strong> on the form to calculate real-time inventory, exact combo matches, and referral stock side-by-side.
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {/* EXPECTED PROFIT HEADER SUMMARY CARD */}
                  {(() => {
                    const exch = parseFloat(form.exchange_rate) || 83.5;
                    const curr = form.currency || 'USD';
                    const currSymbol = curr === 'EUR' ? '€' : curr === 'GBP' ? '£' : '$';

                    let totalDealProfit = 0;
                    let totalStockGain = 0;

                    form.items.forEach((it, idx) => {
                      const card = analysisResult[idx] || {};
                      const qtyKg = parseFloat(it.quantity_kg) || (card.required_kg || 0);
                      const biddingPrice = parseFloat(it.rate_per_kg || it.bidding_price) || 0;
                      const targetPrice = parseFloat(it.target_quotation_price) || 0;

                      // Component 1: Commercial Deal Margin (Bidding - Target) * Qty
                      const dealMargin = (biddingPrice - targetPrice) * qtyKg;
                      totalDealProfit += dealMargin;

                      // Component 2: Stock Cost Gain (Target - Avail Inr/Exch) * Avail Stock
                      const availKg = parseFloat(card.available_stock_kg) || 0;
                      const availInr = parseFloat(card.avail_stock_avg_rate) || 0;
                      if (availKg > 0 && availInr > 0 && exch > 0) {
                        const availCostInCurr = availInr / exch;
                        const stockCostGain = (targetPrice - availCostInCurr) * availKg;
                        totalStockGain += stockCostGain;
                      }
                    });

                    const grandProfit = totalDealProfit + totalStockGain;

                    return (
                      <div style={{
                        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                        color: '#ffffff',
                        borderRadius: 10,
                        padding: '12px 14px',
                        border: '1px solid #334155',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, fontWeight: 900, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            💰 Expected Profit <span style={{ color: '#94a3b8', fontWeight: 600, fontSize: 10 }}>(without incentives)</span>
                          </span>
                          <span style={{ background: grandProfit >= 0 ? '#15803d' : '#b91c1c', color: '#ffffff', padding: '1px 8px', borderRadius: 10, fontSize: 10, fontWeight: 900 }}>
                            {grandProfit >= 0 ? 'PROFITABLE' : 'LOSS'}
                          </span>
                        </div>

                        <div style={{ fontSize: 17, fontWeight: 900, color: grandProfit >= 0 ? '#4ade80' : '#f87171', letterSpacing: '-0.5px' }}>
                          {currSymbol}{grandProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {curr}
                          <span style={{ fontSize: 11.5, fontWeight: 800, color: grandProfit >= 0 ? '#86efac' : '#fca5a5', marginLeft: 8 }}>
                            (₹{(grandProfit * exch).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} INR)
                          </span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8, paddingTop: 6, borderTop: '1px dashed #334155', fontSize: 9.5 }}>
                          <div>
                            <span style={{ color: '#94a3b8' }}>Commercial Margin:</span><br />
                            <strong style={{ color: totalDealProfit >= 0 ? '#6ee7b7' : '#fca5a5' }}>
                              {currSymbol}{totalDealProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <small style={{ fontWeight: 600, color: '#94a3b8' }}>(₹{(totalDealProfit * exch).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</small>
                            </strong>
                          </div>
                          <div>
                            <span style={{ color: '#94a3b8' }}>Stock Cost Gain:</span><br />
                            <strong style={{ color: totalStockGain >= 0 ? '#6ee7b7' : '#fca5a5' }}>
                              {currSymbol}{totalStockGain.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <small style={{ fontWeight: 600, color: '#94a3b8' }}>(₹{(totalStockGain * exch).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</small>
                            </strong>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {analysisResult.map((card, cidx) => {
                    const isAvail = card.status === 'AVAILABLE';
                    const isPartial = card.status === 'PARTIAL';
                    const statusBg = isAvail ? '#dcfce7' : isPartial ? '#fef9c3' : '#fee2e2';
                    const statusColor = isAvail ? '#15803d' : isPartial ? '#a16207' : '#b91c1c';
                    const statusText = isAvail ? 'AVAILABLE' : isPartial ? 'PARTIAL' : 'OUT OF STOCK';

                    return (
                      <div
                        key={cidx}
                        style={{
                          background: '#ffffff',
                          border: `1px solid ${isAvail ? '#bbf7d0' : isPartial ? '#fef08a' : '#fecaca'}`,
                          borderRadius: 8,
                          padding: 10,
                          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                          fontSize: 11
                        }}
                      >
                        {/* Title & Status Badge */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 6 }}>
                          <div>
                            <span style={{ fontSize: 9, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Line #{card.line_no}</span>
                            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 12, lineHeight: 1.2 }}>{card.item_name}</div>
                          </div>
                          <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: statusBg, color: statusColor, whiteSpace: 'nowrap' }}>
                            {statusText}
                          </span>
                        </div>

                        {/* Grade Mapping Warning Banner */}
                        {card.grade_mapped === false && (
                          <div style={{ background: '#fef2f2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 4, padding: '4px 6px', fontSize: 10, fontWeight: 700, marginBottom: 6 }}>
                            ⚠️ {card.warning_msg || `Grade mapping not configured in Grade to HOSO master.`}
                          </div>
                        )}

                        {/* Compact Metric Breakdown Grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, background: '#f8fafc', padding: 8, borderRadius: 6, marginBottom: 6 }}>
                          <div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>Ordered Qty</div>
                            <div style={{ fontWeight: 700, color: '#0f172a' }}>{card.required_mc} MC ({card.required_kg} Kg)</div>
                          </div>
                          <div>
                            <div style={{ fontSize: 9, color: '#64748b' }}>Stock Coverage</div>
                            <div style={{ fontWeight: 700, color: card.deficit_mc > 0 ? '#dc2626' : '#16a34a' }}>
                              {card.deficit_mc > 0 ? `Deficit: ${card.deficit_mc} MC` : 'Full Coverage'}
                            </div>
                          </div>
                        </div>

                        {/* Available & Referral Stock Clickable Buttons */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {/* Available Stock Row */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f0fdf4', padding: '4px 8px', borderRadius: 4, border: '1px solid #dcfce7' }}>
                            <span style={{ fontWeight: 700, color: '#166534', fontSize: 10 }}>Avl Stk (Exact):</span>
                            <button
                              type="button"
                              onClick={() => openStockDetailsModal(`Available Stock Breakdown · Item #${card.line_no} (${card.item_name})`, card.avail_stock_details)}
                              style={{ background: 'none', border: 'none', color: '#15803d', fontWeight: 800, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, padding: 0 }}
                            >
                              {card.available_stock_mc} MC ({card.available_stock_kg} Kg) 🔍
                            </button>
                          </div>

                          {/* Same-combination active pending orders reserve stock. */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff7ed', padding: '4px 8px', borderRadius: 4, border: '1px solid #fed7aa' }}>
                            <span style={{ fontWeight: 700, color: '#c2410c', fontSize: 10 }}>Pending Orders:</span>
                            <button
                              type="button"
                              onClick={() => openStockDetailsModal(`Pending Orders · Item #${card.line_no} (${card.item_name})`, card.pending_order_details)}
                              style={{ background: 'none', border: 'none', color: '#c2410c', fontWeight: 800, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, padding: 0 }}
                            >
                              {card.pending_order_mc || 0} MC ({card.pending_order_kg || 0} Kg) 🔍
                            </button>
                          </div>

                          {/* Referral Stock Row */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#eff6ff', padding: '4px 8px', borderRadius: 4, border: '1px solid #dbeafe' }}>
                            <span style={{ fontWeight: 700, color: '#1e40af', fontSize: 10 }}>Ref Stk (Cross-Pack):</span>
                            <button
                              type="button"
                              onClick={() => openStockDetailsModal(`Referral Stock Breakdown · Item #${card.line_no} (${card.item_name})`, card.referral_stock_details)}
                              style={{ background: 'none', border: 'none', color: '#1d4ed8', fontWeight: 800, fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3, padding: 0 }}
                            >
                              {card.referral_stock_mc} MC ({card.referral_stock_kg} Kg) 🔍
                            </button>
                          </div>
                        </div>

                        {/* Average Rates & Item Expected Profit Summary */}
                        <div style={{ marginTop: 6, paddingTop: 4, borderTop: '1px dashed #cbd5e1', fontSize: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '4px 8px', borderRadius: 4, marginBottom: 4 }}>
                            <span>Avl Stk Avg: <strong style={{ color: '#16a34a' }}>₹{card.avail_stock_avg_rate ? Number(card.avail_stock_avg_rate).toFixed(2) : '0.00'}/Kg</strong></span>
                            <span>Ref Stk Avg: <strong style={{ color: '#2563eb' }}>₹{card.referral_stock_avg_rate ? Number(card.referral_stock_avg_rate).toFixed(2) : '0.00'}/Kg</strong></span>
                          </div>

                          {/* Item-level Expected Profit calculation */}
                          {(() => {
                            const exch = parseFloat(form.exchange_rate) || 83.5;
                            const curr = form.currency || 'USD';
                            const currSymbol = curr === 'EUR' ? '€' : curr === 'GBP' ? '£' : '$';

                            const formIt = form.items[cidx] || {};
                            const qtyKg = parseFloat(formIt.quantity_kg) || (card.required_kg || 0);
                            const biddingPrice = parseFloat(formIt.rate_per_kg || formIt.bidding_price) || 0;
                            const targetPrice = parseFloat(formIt.target_quotation_price) || 0;

                            const dealMargin = (biddingPrice - targetPrice) * qtyKg;
                            let stockGain = 0;
                            const availKg = parseFloat(card.available_stock_kg) || 0;
                            const availInr = parseFloat(card.avail_stock_avg_rate) || 0;
                            if (availKg > 0 && availInr > 0 && exch > 0) {
                              const availCostInCurr = availInr / exch;
                              stockGain = (targetPrice - availCostInCurr) * availKg;
                            }
                            const itemProfit = dealMargin + stockGain;

                            return (
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: itemProfit >= 0 ? '#f0fdf4' : '#fef2f2', border: `1px solid ${itemProfit >= 0 ? '#bbf7d0' : '#fca5a5'}`, padding: '4px 8px', borderRadius: 4 }}>
                                <span style={{ fontWeight: 700, color: '#334155', fontSize: 9.5 }}>Item Profit <small style={{ color: '#64748b' }}>(w/o incentives)</small>:</span>
                                <strong style={{ color: itemProfit >= 0 ? '#166534' : '#991b1b', fontSize: 10.5 }}>
                                  {currSymbol}{itemProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: 9.5, fontWeight: 700, color: '#475569' }}>(₹{(itemProfit * exch).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                                </strong>
                              </div>
                            );
                          })()}
                        </div>


                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>


        {/* ---------------------------------------------------- */}
        {/* STOCK BREAKDOWN ITEM DETAILS DRILLDOWN MODAL        */}
        {/* ---------------------------------------------------- */}
        {stockDetailModalOpen && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.8)',
              backdropFilter: 'blur(5px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100000,
              padding: 16
            }}
            onClick={() => setStockDetailModalOpen(false)}
          >
            <div
              className="attendance-modal-content"
              style={{
                width: '92%',
                maxWidth: 1200,
                maxHeight: '85vh',
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--att-card, #ffffff)',
                borderRadius: 12,
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.4)',
                overflow: 'hidden'
              }}
              onClick={e => e.stopPropagation()}
            >
              <div className="attendance-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <BarChart2 size={18} color="#2563eb" /> {stockDetailModalTitle}
                  </h3>
                </div>
                <button type="button" className="attendance-btn attendance-btn-secondary" onClick={() => setStockDetailModalOpen(false)} style={{ padding: '4px 10px' }}>
                  <X size={16} /> CLOSE
                </button>
              </div>

              <div style={{ padding: 16, overflowY: 'auto', overflowX: 'auto', flex: 1 }}>
                <table className="bknr-table" style={{ width: '100%', minWidth: 1000, fontSize: 11, margin: 0 }}>

                  <thead>
                    <tr style={{ background: 'var(--att-table-header-bg)', color: 'var(--att-text)', fontWeight: 800 }}>
                      <th style={{ padding: '8px 10px' }}>#</th>
                      <th style={{ padding: '8px 10px' }}>Cold Storage / Location</th>
                      <th style={{ padding: '8px 10px' }}>Batch #</th>
                      <th style={{ padding: '8px 10px' }}>Production For</th>
                      <th style={{ padding: '8px 10px' }}>Brand</th>
                      <th style={{ padding: '8px 10px' }}>Packing Style</th>
                      <th style={{ padding: '8px 10px' }}>Freezer / Glaze</th>
                      <th style={{ padding: '8px 10px' }}>Grade</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Closing MC</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Closing Qty (KG)</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Rate (₹ / KG)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockDetailRows.length > 0 ? (
                      stockDetailRows.map((r, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ fontWeight: 700, color: 'var(--att-muted)' }}>{idx + 1}</td>
                          <td style={{ fontWeight: 800, color: '#1e293b' }}>{r.cold_storage_name}</td>
                          <td style={{ fontWeight: 700, color: '#2563eb' }}>{r.batch_number}</td>
                          <td style={{ fontWeight: 700, color: '#475569' }}>{r.production_for}</td>
                          <td style={{ fontWeight: 700, color: '#334155' }}>{r.brand}</td>
                          <td style={{ fontWeight: 700, color: '#0f172a' }}>{r.packing_style}</td>
                          <td style={{ color: '#475569' }}>{r.freezer} ({r.glaze})</td>
                          <td style={{ fontWeight: 800, color: '#1e293b' }}>{r.grade}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: '#16a34a' }}>{r.no_of_mc} MC</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: '#16a34a' }}>{Number(r.quantity_kg || 0).toFixed(2)} KG</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: '#0369a1' }}>₹{Number(r.rate_per_kg || 0).toFixed(2)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={11} style={{ textAlign: 'center', padding: 20, color: 'var(--att-muted)' }}>
                          No individual batch breakdown records found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  {stockDetailRows.length > 0 && (
                    <tfoot>
                      <tr style={{ background: '#f8fafc', fontWeight: 800 }}>
                        <td colSpan={8} style={{ textAlign: 'right', padding: '8px 10px', color: '#1e293b' }}>TOTAL:</td>
                        <td style={{ textAlign: 'right', padding: '8px 10px', color: '#16a34a' }}>
                          {stockDetailRows.reduce((sum, r) => sum + (Number(r.no_of_mc) || 0), 0)} MC
                        </td>
                        <td style={{ textAlign: 'right', padding: '8px 10px', color: '#16a34a' }}>
                          {stockDetailRows.reduce((sum, r) => sum + (Number(r.quantity_kg) || 0), 0).toFixed(2)} KG
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              <div className="attendance-modal-footer" style={{ padding: '10px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', background: '#f8fafc' }}>
                <button type="button" className="attendance-btn attendance-btn-secondary" onClick={() => setStockDetailModalOpen(false)} style={{ padding: '4px 14px' }}>
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }


  // ----------------------------------------------------
  // MAIN PAGE VIEW (WHEN FORM IS CLOSED)
  // ----------------------------------------------------
  return (
    <div className="attendance-container export-document-page page-scrollable">

      {notice && <div className={`attendance-toast ${notice.type === 'error' ? 'error' : 'success'}`} style={{ top: 80 }}>{notice.msg}</div>}

      <div className="attendance-page-header">
        <div>
          <h1>Sales & Price Quotations</h1>
          <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--att-muted)' }}>
            Prepare, issue, and manage commercial price offers with complete product specification fields.
          </p>
        </div>
        <div className="attendance-page-header-actions">
          <button className="attendance-btn attendance-btn-secondary" onClick={() => setShowAudit(val => !val)}>
            AUDIT LOGS ({auditLogs.length})
          </button>
          <button className="attendance-btn attendance-btn-secondary" onClick={() => secureDownload('/crm/quotation/register.xlsx', 'Quotation Register')}>
            <Download size={16} /> EXPORT XLSX
          </button>
          <button className="attendance-btn attendance-btn-primary" onClick={openNew}>
            <Plus size={16} /> NEW QUOTATION
          </button>
        </div>
      </div>

      {/* KPI Cards Summary */}
      <div className="qt-kpi-grid">
        <div className="qt-kpi-card">
          <div className="qt-kpi-icon"><FileText size={20} /></div>
          <div className="qt-kpi-content">
            <span>Total Quotations</span>
            <strong>{rows.length}</strong>
          </div>
        </div>
        <div className="qt-kpi-card">
          <div className="qt-kpi-icon warning"><Send size={20} /></div>
          <div className="qt-kpi-content">
            <span>Offers Sent</span>
            <strong>{counts['SENT'] || 0}</strong>
          </div>
        </div>
        <div className="qt-kpi-card">
          <div className="qt-kpi-icon success"><CheckCircle2 size={20} /></div>
          <div className="qt-kpi-content">
            <span>Deals Accepted</span>
            <strong>{counts['ACCEPTED'] || 0}</strong>
          </div>
        </div>
        <div className="qt-kpi-card">
          <div className="qt-kpi-icon accent"><DollarSign size={20} /></div>
          <div className="qt-kpi-content">
            <span>Total Offered Value</span>
            <strong>${totalOfferedValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
          </div>
        </div>
      </div>

      {/* Status KPI Filter Pills */}
      <div className="qt-status-pills">
        {statuses.map(st => (
          <button
            key={st}
            className={`qt-pill ${statusFilter === st ? 'active' : ''}`}
            onClick={() => setStatusFilter(st)}
          >
            <span>{st}</span>
            <span className="qt-pill-count">{counts[st] || 0}</span>
          </button>
        ))}
      </div>

      {/* Audit Log Overlay / Table */}
      {showAudit && (
        <section className="requirement-inline-form" style={{ marginBottom: 16 }}>
          <div className="requirement-inline-form-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>Quotation Audit Trail Logs</h3>
            <button type="button" className="attendance-btn attendance-btn-secondary" onClick={() => setShowAudit(false)}><X size={16} /> CLOSE</button>
          </div>
          <div style={{ padding: 12, maxHeight: 300, overflowY: 'auto' }}>
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Quotation No</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map(log => (
                  <tr key={log.id}>
                    <td>{log.created_at}</td>
                    <td>{log.user_email}</td>
                    <td><strong style={{ color: '#2563eb' }}>{log.action}</strong></td>
                    <td>{log.target_id}</td>
                    <td>{log.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Search Bar */}
      <div style={{ marginBottom: 14 }}>
        <input
          type="text"
          className="attendance-input"
          placeholder="Search by Quotation #, Customer Name, Company, or Country..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ maxWidth: 450 }}
        />
      </div>

      {/* Main Quotations Data Table */}
      <div className="enterprise-table-wrap">
        <table className="enterprise-table" style={{ minWidth: 1500 }}>
          <thead>
            <tr>
              <th>Quotation No</th>
              <th>Company</th>
              <th>Location</th>
              <th>Date</th>
              <th>Valid Until</th>
              <th>Customer Name</th>
              <th>Agent</th>
              <th>Country</th>
              <th>Items</th>
              <th>Currency</th>
              <th className="num">Exch Rate (₹)</th>
              <th className="num">Total Amount</th>
              <th>Status</th>
              <th style={{ textAlign: 'center' }}>Proforma Invoice</th>
              <th style={{ textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.length > 0 ? (
              filteredRows.map(row => {
                const isExpanded = !!expandedRows[row.id];
                const itemsCount = row.items ? row.items.length : 0;

                return (
                  <React.Fragment key={row.id}>
                    <tr style={{ background: isExpanded ? '#f0f9ff' : 'transparent' }}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => toggleExpand(row.id)}
                            style={{
                              border: '1px solid #cbd5e1',
                              background: isExpanded ? '#2563eb' : '#ffffff',
                              color: isExpanded ? '#ffffff' : '#334155',
                              borderRadius: 4,
                              width: 20,
                              height: 20,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 12,
                              fontWeight: 900,
                              cursor: 'pointer',
                              padding: 0
                            }}
                            title={isExpanded ? 'Collapse Item Details' : 'Expand Item Details'}
                          >
                            {isExpanded ? '−' : '+'}
                          </button>
                          <strong style={{ color: '#1e293b' }}>{row.quotation_no}</strong>
                        </div>
                      </td>
                      <td>{row.company_name || '—'}</td>
                      <td>{row.production_at || '—'}</td>
                      <td>{row.quotation_date || '—'}</td>
                      <td>{row.valid_until || '—'}</td>
                      <td><strong style={{ color: '#0f172a' }}>{row.customer_name}</strong></td>
                      <td>{row.agent || '—'}</td>
                      <td>{row.country || '—'}</td>
                      <td style={{ maxWidth: 320 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 900, background: '#e0f2fe', color: '#0369a1', padding: '1px 6px', borderRadius: 4 }}>
                              {itemsCount} {itemsCount === 1 ? 'Item' : 'Items'}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleExpand(row.id)}
                              style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 10, fontWeight: 800, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                            >
                              {isExpanded ? 'Hide Specs ▲' : 'View Specs ▼'}
                            </button>
                          </div>

                          {/* Detailed Preview Pills for ALL Items */}
                          {row.items && row.items.map((it, iidx) => {
                            const specText = [it.species, it.variety, it.grade].filter(Boolean).join(' ');
                            const glazeText = it.weight_glaze || it.count_glaze || '';
                            return (
                              <div key={iidx} style={{ fontSize: 9.5, background: '#f8fafc', padding: '3px 6px', borderRadius: 4, border: '1px solid #e2e8f0', color: '#334155' }}>
                                <strong style={{ color: '#1e40af' }}>#{iidx + 1} {specText || 'Item'}</strong>
                                {glazeText && <span style={{ color: '#0284c7', marginLeft: 4 }}>({glazeText})</span>}
                                <span style={{ color: '#16a34a', marginLeft: 4, fontWeight: 800 }}>
                                  {it.quantity_kg ? `${Number(it.quantity_kg).toLocaleString()}Kg` : ''}
                                  {it.rate_per_kg || it.bidding_price ? ` @ $${Number(it.rate_per_kg || it.bidding_price).toFixed(2)}` : ''}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td>{row.currency}</td>
                      <td className="num">₹{row.exchange_rate ? Number(row.exchange_rate).toFixed(2) : '83.50'}</td>
                      <td className="num"><strong style={{ color: '#1e3a8a', fontSize: 12 }}>{row.currency} {row.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></td>
                      <td>
                        <select
                          className="attendance-select"
                          style={{
                            fontSize: 10.5,
                            fontWeight: 800,
                            padding: '2px 6px',
                            height: 26,
                            borderRadius: 5,
                            cursor: 'pointer',
                            outline: 'none',
                            background: (row.status === 'ACCEPTED') ? '#dcfce7' : (row.status === 'REJECTED') ? '#fee2e2' : (row.status === 'SENT') ? '#e0f2fe' : (row.status === 'CUSTOMER REPLIED') ? '#fef3c7' : '#f1f5f9',
                            color: (row.status === 'ACCEPTED') ? '#166534' : (row.status === 'REJECTED') ? '#991b1b' : (row.status === 'SENT') ? '#075985' : (row.status === 'CUSTOMER REPLIED') ? '#92400e' : '#334155',
                            borderColor: (row.status === 'ACCEPTED') ? '#86efac' : (row.status === 'REJECTED') ? '#fca5a5' : (row.status === 'SENT') ? '#7dd3fc' : (row.status === 'CUSTOMER REPLIED') ? '#fcd34d' : '#cbd5e1',
                          }}
                          value={row.status || 'DRAFT'}
                          onChange={e => handleDirectStatusChange(row, e.target.value)}
                        >
                          <option value="DRAFT">DRAFT</option>
                          <option value="SENT">SENT</option>
                          <option value="CUSTOMER REPLIED">CUSTOMER REPLIED</option>
                          <option value="ACCEPTED">ACCEPTED</option>
                          <option value="REJECTED">REJECTED</option>
                          <option value="EXPIRED">EXPIRED</option>
                        </select>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="attendance-btn"
                          style={{
                            padding: '5px 11px',
                            fontSize: 11,
                            fontWeight: 800,
                            background: row.status === 'ACCEPTED' ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)' : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: 5,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            boxShadow: '0 2px 5px rgba(0,0,0,0.12)'
                          }}
                          onClick={() => handleMakeOrViewPI(row)}
                          title={row.status === 'ACCEPTED' ? 'Open Proforma Invoice page' : 'Accept Quotation & Auto-create PI'}
                        >
                          <Receipt size={13} /> {row.status === 'ACCEPTED' ? 'VIEW PI' : 'MAKE PI'} <ArrowRight size={12} />
                        </button>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button type="button" className="attendance-btn attendance-btn-secondary" style={{ padding: '4px 8px', fontSize: 11, opacity: row.sales_dispatched ? 0.55 : 1 }} onClick={() => openEdit(row)} disabled={row.sales_dispatched} title={row.sales_dispatched ? 'Locked after Sales dispatch' : 'Edit Quotation'}>
                            <Pencil size={13} /> EDIT
                          </button>

                          <button type="button" className="attendance-btn attendance-btn-secondary" style={{ padding: '4px 8px', fontSize: 11, color: '#2563eb' }} onClick={() => openSendEmailModal(row)} title="Send Email Quotation">
                            <Send size={13} /> SEND EMAIL
                          </button>

                          <button type="button" className="attendance-btn attendance-btn-secondary" style={{ padding: '4px 8px', fontSize: 11, color: '#7c3aed', fontWeight: 700 }} onClick={() => openRepliesModal(row)} title="View Customer Email Communication Thread">
                            💬 REPLIES / LOG
                          </button>

                          {row.status === 'SENT' && (
                            <>
                              <button type="button" className="attendance-btn attendance-btn-secondary" style={{ padding: '4px 8px', fontSize: 11, color: '#16a34a' }} onClick={() => updateStatus(row, 'ACCEPTED')} title="Accept">
                                <CheckCircle2 size={13} /> ACCEPT
                              </button>
                              <button type="button" className="attendance-btn attendance-btn-secondary" style={{ padding: '4px 8px', fontSize: 11, color: '#dc2626' }} onClick={() => updateStatus(row, 'REJECTED')} title="Reject">
                                <X size={13} /> REJECT
                              </button>
                            </>
                          )}

                          <button type="button" className="attendance-btn attendance-btn-secondary" style={{ padding: '4px 8px', fontSize: 11, color: '#ef4444' }} onClick={() => cancelRow(row)} title="Cancel">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* EXPANDED DETAILED ITEM BREAKDOWN SUB-TABLE */}
                    {isExpanded && (
                      <tr style={{ background: '#f8fafc' }}>
                        <td colSpan="15" style={{ padding: '10px 14px', borderBottom: '2px solid #cbd5e1' }}>
                          <div style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #cbd5e1', padding: 12, boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderBottom: '1px solid #f1f5f9', paddingBottom: 6 }}>
                              <h4 style={{ margin: 0, fontSize: 12, fontWeight: 900, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 6 }}>
                                📦 Full Item Specifications Breakdown for Quotation #{row.quotation_no}
                              </h4>
                              <span style={{ fontSize: 10, color: '#64748b', fontWeight: 700 }}>
                                Customer: <strong style={{ color: '#0f172a' }}>{row.customer_name}</strong> | Destination: <strong style={{ color: '#0f172a' }}>{row.country || 'N/A'}</strong>
                              </span>
                            </div>

                            <table className="bknr-table" style={{ width: '100%', fontSize: 10.5, margin: 0 }}>
                              <thead>
                                <tr style={{ background: '#eff6ff', color: '#1e3a8a', fontWeight: 900 }}>
                                  <th style={{ padding: '6px 8px' }}>#</th>
                                  <th style={{ padding: '6px 8px' }}>BRAND</th>
                                  <th style={{ padding: '6px 8px' }}>PACKING</th>
                                  <th style={{ padding: '6px 8px' }}>FREEZER</th>
                                  <th style={{ padding: '6px 8px' }}>C.GLAZE</th>
                                  <th style={{ padding: '6px 8px' }}>W.GLAZE</th>
                                  <th style={{ padding: '6px 8px' }}>SPECIES</th>
                                  <th style={{ padding: '6px 8px' }}>VARIETY</th>
                                  <th style={{ padding: '6px 8px' }}>GRADE</th>
                                  <th style={{ padding: '6px 8px', textAlign: 'center' }}>PCS</th>
                                  <th style={{ padding: '6px 8px', textAlign: 'center' }}>NO. OF MC</th>
                                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>QTY (KG)</th>
                                  <th style={{ padding: '6px 8px', textAlign: 'center' }}>HOSO COUNT</th>
                                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>HOSO RATE (₹)</th>
                                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>EXPENSES (₹)</th>
                                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>TARGET ($)</th>
                                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>BIDDING ($)</th>
                                  <th style={{ padding: '6px 8px', textAlign: 'right' }}>TOTAL ($)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {row.items && row.items.length > 0 ? (
                                  row.items.map((item, idx) => {
                                    const rate = Number(item.bidding_price || item.rate_per_kg || 0);
                                    const qty = Number(item.quantity_kg || 0);
                                    const lineTotal = item.amount ? Number(item.amount) : (rate * qty);

                                    return (
                                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ fontWeight: 900, color: '#2563eb' }}>#{idx + 1}</td>
                                        <td style={{ fontWeight: 800, color: '#1e293b' }}>{item.brand || '—'}</td>
                                        <td>{item.packing_style || '—'}</td>
                                        <td>{item.freezer || '—'}</td>
                                        <td style={{ color: '#0369a1' }}>{item.count_glaze || '—'}</td>
                                        <td style={{ color: '#0284c7' }}>{item.weight_glaze || '—'}</td>
                                        <td style={{ fontWeight: 800, color: '#0f172a' }}>{item.species || '—'}</td>
                                        <td style={{ fontWeight: 800, color: '#0f172a' }}>{item.variety || '—'}</td>
                                        <td style={{ fontWeight: 900, color: '#1d4ed8' }}>{item.grade || '—'}</td>
                                        <td style={{ textAlign: 'center' }}>{item.no_of_pieces || '—'}</td>
                                        <td style={{ textAlign: 'center', fontWeight: 800 }}>{item.no_of_mc || 0}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 800, color: '#16a34a' }}>{qty.toLocaleString()} Kg</td>
                                        <td style={{ textAlign: 'center', fontWeight: 900, color: '#d97706' }}>{item.hoso_count || '—'}</td>
                                        <td style={{ textAlign: 'right' }}>{item.target_hoso_rate ? `₹${Number(item.target_hoso_rate).toFixed(2)}` : '—'}</td>
                                        <td style={{ textAlign: 'right' }}>{item.expenses ? `₹${Number(item.expenses).toFixed(2)}` : '—'}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 800, color: '#475569' }}>{item.target_quotation_price ? `$${Number(item.target_quotation_price).toFixed(2)}` : '—'}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 900, color: '#2563eb' }}>${rate.toFixed(2)}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 900, color: '#16a34a' }}>${lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                      </tr>
                                    );
                                  })
                                ) : (
                                  <tr>
                                    <td colSpan="18" style={{ textAlign: 'center', padding: 12, color: '#64748b' }}>
                                      No item line specifications recorded.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            ) : (
              <tr>
                <td colSpan="14" style={{ textAlign: 'center', padding: '30px', color: 'var(--att-muted)' }}>
                  No price quotations found matching current filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

        {/* ---------------------------------------------------- */}
        {/* ULTRA-ORGANIZED EMAIL QUOTATION COMPOSITION MODAL    */}
        {/* ---------------------------------------------------- */}
        {emailModalOpen && emailTargetRow && (
          <div className="attendance-modal-backdrop" style={{ zIndex: 1200 }}>
            <div className="attendance-modal" style={{ maxWidth: 1280, width: '96vw', maxHeight: '94vh', display: 'flex', flexDirection: 'column', padding: 0, borderRadius: 12, overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
              
              {/* Executive Header Banner */}
              <div style={{ padding: '14px 20px', background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 50%, #2563eb 100%)', color: '#ffffff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ background: 'rgba(255,255,255,0.15)', padding: 8, borderRadius: 8, display: 'flex' }}>
                    <Send size={20} color="#ffffff" />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: '#ffffff', letterSpacing: '0.2px' }}>
                      Compose Commercial Price Quotation Email
                    </h3>
                    <div style={{ fontSize: 11, color: '#93c5fd', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span>Quotation: <strong style={{ color: '#ffffff' }}>#{emailTargetRow.quotation_no}</strong></span>
                      <span>•</span>
                      <span>Customer: <strong style={{ color: '#ffffff' }}>{emailTargetRow.customer_name}</strong></span>
                      <span>•</span>
                      <span>Offer Value: <strong style={{ color: '#4ade80' }}>${Number(emailTargetRow.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></span>
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => setEmailModalOpen(false)} style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#ffffff', borderRadius: 6, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <X size={16} />
                </button>
              </div>

              {/* Form Content - 4 Clear Organized Sections */}
              <form onSubmit={submitSendEmail} style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16, background: '#f8fafc' }}>
                
                {/* SECTION 1: EMAIL ADDRESSING & ROUTING CONTEXT */}
                <div style={{ background: '#ffffff', borderRadius: 10, border: '1px solid #e2e8f0', padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                  <div style={{ fontSize: 11, fontWeight: 900, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FileText size={14} color="#2563eb" /> 1. Email Addressing & Header Context
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 800, color: '#64748b', display: 'block', marginBottom: 3 }}>SENDER (FROM EMAIL)</label>
                      <input
                        type="text"
                        className="attendance-input"
                        style={{ fontSize: 11, background: '#f1f5f9', color: '#334155', fontWeight: 700, cursor: 'not-allowed', border: '1px solid #cbd5e1' }}
                        value={emailForm.from_email}
                        readOnly
                      />
                    </div>

                    <div>
                      <label style={{ fontSize: 10, fontWeight: 900, color: '#1d4ed8', display: 'block', marginBottom: 3 }}>RECIPIENT (TO EMAIL)*</label>
                      <input
                        type="email"
                        className="attendance-input"
                        style={{ fontSize: 11, fontWeight: 800, borderColor: '#93c5fd', background: '#f0f9ff' }}
                        value={emailForm.to_email}
                        onChange={e => setEmailForm(curr => ({ ...curr, to_email: e.target.value }))}
                        placeholder="Enter recipient email address..."
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: 10, fontWeight: 900, color: '#1e3a8a', display: 'block', marginBottom: 3 }}>SUBJECT LINE*</label>
                    <input
                      type="text"
                      className="attendance-input"
                      style={{ width: '100%', fontSize: 11, fontWeight: 800, borderColor: '#bfdbfe', background: '#ffffff' }}
                      value={emailForm.subject}
                      onChange={e => setEmailForm(curr => ({ ...curr, subject: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                {/* SECTION 2: INTRODUCTORY MESSAGE (TEXT ABOVE SPECIFICATIONS TABLE) */}
                <div style={{ background: '#ffffff', borderRadius: 10, border: '1px solid #e2e8f0', padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                  <label style={{ fontSize: 11, fontWeight: 900, color: '#1e3a8a', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: 6 }}>
                    💬 2. Opening Salutation & Intro Message (Above Table)
                  </label>
                  <textarea
                    rows={3}
                    className="attendance-input"
                    style={{ fontSize: 11, width: '100%', padding: '8px 10px', resize: 'vertical', lineHeight: 1.5 }}
                    value={emailForm.header_text}
                    onChange={e => setEmailForm(curr => ({ ...curr, header_text: e.target.value }))}
                  />
                </div>

                {/* SECTION 3: LIVE SPECIFICATIONS TABLE PREVIEW (FITS SCREEN PERFECTLY) */}
                <div style={{ background: '#ffffff', borderRadius: 10, border: '1px solid #bfdbfe', padding: 14, boxShadow: '0 2px 6px rgba(37,99,235,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderBottom: '1px solid #eff6ff', paddingBottom: 6 }}>
                    <div style={{ fontSize: 11, fontWeight: 900, color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: 6 }}>
                      📊 3. Live Product Specifications Attachment Preview
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 800, background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 4 }}>
                      {emailTargetRow.items ? emailTargetRow.items.length : 0} Item Row(s)
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {(() => {
                      const rawList = emailForm.items || emailTargetRow.items || [];
                      const groupedMap = new Map();

                      rawList.forEach((it, origIdx) => {
                        const desc = (it.item_name || [it.species, it.variety, it.grade].filter(Boolean).join(' ') || 'Shrimp Item').trim();
                        const key = desc.toLowerCase();
                        if (!groupedMap.has(key)) {
                          groupedMap.set(key, { descKey: desc, items: [] });
                        }
                        groupedMap.get(key).items.push({ ...it, origIdx });
                      });

                      let lineCounter = 1;
                      const groupElements = [];

                      groupedMap.forEach((group, gKey) => {
                        const isEditingThisGroup = editingDescIdx === gKey;
                        const firstItem = group.items[0] || {};

                        groupElements.push(
                          <div key={gKey} style={{ border: '1px solid #cbd5e1', borderRadius: 6, overflow: 'hidden', background: '#ffffff', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
                            {/* Product Description Header Card (With BRAND & PACKING STYLE) */}
                            <div style={{ background: '#f8fafc', borderBottom: '1px solid #cbd5e1', padding: '8px 12px' }}>
                              {isEditingThisGroup ? (
                                <textarea
                                  rows={2}
                                  autoFocus
                                  className="attendance-input"
                                  style={{
                                    fontSize: 10.5,
                                    fontWeight: 700,
                                    color: '#0f172a',
                                    width: '100%',
                                    padding: '5px 8px',
                                    resize: 'vertical',
                                    lineHeight: 1.35,
                                    borderColor: '#475569',
                                    background: '#ffffff',
                                    whiteSpace: 'pre-wrap',
                                    wordBreak: 'break-word',
                                    boxShadow: '0 0 0 2px rgba(15,23,42,0.1)'
                                  }}
                                  value={group.descKey}
                                  onBlur={() => setEditingDescIdx(null)}
                                  onChange={e => {
                                    const val = e.target.value;
                                    setEmailForm(prev => {
                                      const updated = [...(prev.items || [])];
                                      (group.items || []).forEach(x => {
                                        if (updated[x.origIdx]) {
                                          updated[x.origIdx] = { ...updated[x.origIdx], item_name: val };
                                        }
                                      });
                                      return { ...prev, items: updated };
                                    });
                                  }}
                                  placeholder="Edit product description..."
                                />
                              ) : (
                                <div>
                                  <div
                                    onClick={() => setEditingDescIdx(gKey)}
                                    title="Click to edit product description for this group"
                                    style={{
                                      cursor: 'pointer',
                                      padding: '4px 6px',
                                      borderRadius: 4,
                                      background: '#ffffff',
                                      border: '1px dashed #cbd5e1',
                                      fontWeight: 800,
                                      fontSize: 11,
                                      color: '#0f172a',
                                      lineHeight: 1.35,
                                      whiteSpace: 'pre-wrap',
                                      wordBreak: 'break-word',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center'
                                    }}
                                  >
                                    <span>{group.descKey}</span>
                                    <span style={{ fontSize: 9.5, color: '#475569', background: '#f1f5f9', padding: '2px 5px', borderRadius: 4, fontWeight: 700 }}>✏️ Edit</span>
                                  </div>
                                  <div style={{ fontSize: 10, color: '#475569', marginTop: 4, fontWeight: 700, display: 'flex', gap: 12 }}>
                                    <span>BRAND: <strong style={{ color: '#0f172a' }}>{firstItem.brand || '—'}</strong></span>
                                    <span>•</span>
                                    <span>PACKING: <strong style={{ color: '#0f172a' }}>{firstItem.packing_style || '—'}</strong></span>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Ultra-Roomy 7-Column Specification Table */}
                            <div style={{ overflowX: 'auto' }}>
                              <table className="bknr-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9.5, margin: 0, border: 'none' }}>
                                <thead>
                                  <tr style={{ background: '#f1f5f9', color: '#0f172a', fontWeight: 800, borderBottom: '1px solid #cbd5e1' }}>
                                    <th style={{ padding: '5px 6px', whiteSpace: 'nowrap', width: '4%' }}>#</th>
                                    <th style={{ padding: '5px 6px', whiteSpace: 'nowrap' }}>GRADE</th>
                                    <th style={{ padding: '5px 6px', textAlign: 'center', whiteSpace: 'nowrap' }}>MC</th>
                                    <th style={{ padding: '5px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>QTY (KG)</th>
                                    <th style={{ padding: '5px 6px', textAlign: 'center', whiteSpace: 'nowrap' }}>NO. OF PCS</th>
                                    <th style={{ padding: '5px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>PRICE ($/KG)</th>
                                    <th style={{ padding: '5px 6px', textAlign: 'right', whiteSpace: 'nowrap' }}>TOTAL ($)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {group.items.map((it) => {
                                    const currNum = lineCounter++;
                                    const rate = Number(it.bidding_price || it.rate_per_kg || 0);
                                    const qty = Number(it.quantity_kg || 0);
                                    const total = it.amount ? Number(it.amount) : (rate * qty);

                                    return (
                                      <tr key={currNum} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ fontWeight: 700, color: '#475569', padding: '5px 6px' }}>#{currNum}</td>
                                        <td style={{ fontWeight: 800, color: '#0f172a', padding: '5px 6px' }}>{it.grade || '—'}</td>
                                        <td style={{ textAlign: 'center', fontWeight: 700, padding: '5px 6px' }}>{it.no_of_mc || 0}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#0f172a', padding: '5px 6px' }}>{qty.toLocaleString()} Kg</td>
                                        <td style={{ textAlign: 'center', fontWeight: 700, color: '#475569', padding: '5px 6px' }}>{it.no_of_pieces || '—'}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 700, color: '#0f172a', padding: '5px 6px' }}>${rate.toFixed(2)}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 800, color: '#0f172a', padding: '5px 6px' }}>${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      });

                      return (
                        <>
                          {groupElements}
                          <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 6, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 11.5 }}>TOTAL OFFERED VALUE ({emailTargetRow.currency || 'USD'}):</span>
                            <span style={{ fontWeight: 900, color: '#0f172a', fontSize: 13.5 }}>
                              ${Number(emailTargetRow.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* SECTION 4: TERMS & CONDITIONS (AUTO EXPAND TEXT) */}
                <div style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #cbd5e1', padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.03)', width: '100%' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                    📝 Terms & Conditions
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>
                    Commercial terms, validity, payment terms, and shipment date.
                  </div>
                  <textarea
                    rows={Math.max(4, (emailForm.footer_text || '').split('\n').length)}
                    className="attendance-input"
                    style={{ fontSize: 11, width: '100%', resize: 'vertical', lineHeight: 1.5, padding: 10, borderColor: '#cbd5e1', color: '#0f172a', background: '#f8fafc', fontWeight: 600, border: '1px solid #cbd5e1', borderRadius: 6, overflowY: 'hidden' }}
                    value={emailForm.footer_text}
                    onChange={e => setEmailForm(curr => ({ ...curr, footer_text: e.target.value }))}
                    onFocus={e => { e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
                    onInput={e => { e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
                    ref={el => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }}
                    placeholder="Enter terms and conditions..."
                  />
                </div>

                {/* SECTION 5: BEST REGARDS SIGN-OFF (AUTO EXPAND TEXT) */}
                <div style={{ background: '#ffffff', borderRadius: 8, border: '1px solid #cbd5e1', padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.03)', width: '100%' }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>
                    ✍️ Best Regards Sign-off
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8 }}>
                    Sender name, designation, and company signature lines.
                  </div>
                  <textarea
                    rows={Math.max(4, (emailForm.signoff_text || '').split('\n').length)}
                    className="attendance-input"
                    style={{ fontSize: 11, width: '100%', resize: 'vertical', lineHeight: 1.5, padding: 10, borderColor: '#cbd5e1', fontWeight: 700, color: '#0f172a', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 6, overflowY: 'hidden' }}
                    value={emailForm.signoff_text}
                    onChange={e => setEmailForm(curr => ({ ...curr, signoff_text: e.target.value }))}
                    onFocus={e => { e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
                    onInput={e => { e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
                    ref={el => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }}
                    placeholder="Enter Best Regards sign-off..."
                  />
                </div>

                {/* Modal Action Bar */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 12, borderTop: '1px solid #e2e8f0', background: '#ffffff', padding: '12px 16px', borderRadius: 10 }}>
                  <button type="button" className="attendance-btn attendance-btn-secondary" onClick={() => setEmailModalOpen(false)} disabled={sendingEmail} style={{ padding: '8px 16px' }}>
                    CANCEL
                  </button>
                  <button type="submit" className="attendance-btn attendance-btn-primary" disabled={sendingEmail} style={{ background: 'linear-gradient(135deg, #1e3a8a, #2563eb)', padding: '8px 24px', fontWeight: 900, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {sendingEmail ? (
                      <>
                        <div className="spinner" style={{ width: 14, height: 14, borderMargin: 0 }} /> SENDING EMAIL...
                      </>
                    ) : (
                      <>
                        <Send size={15} /> SEND EMAIL & MARK SENT ✉️
                      </>
                    )}
                  </button>
                </div>

              </form>
            </div>
          </div>
        )}

        {/* ---------------------------------------------------- */}
        {/* GMAIL-STYLE EMAIL THREAD & AI CHATBOT MODAL         */}
        {/* ---------------------------------------------------- */}
        {repliesModalOpen && repliesTargetRow && (
          <div style={{
            position: 'fixed',
            top: 'calc(var(--header-h, 56px) + 32px)', right: 0, bottom: 0, left: 0,
            zIndex: 990,
            display: 'flex', flexDirection: 'column',
            background: '#f0f4f8'
          }}>

            {/* ════════════════════════════════════════════════ */}
            {/* ════════════════════════════════════════════════ */}
            {/* SCREEN HEADER                                    */}
            {/* ════════════════════════════════════════════════ */}
            <div style={{
              flexShrink: 0,
              background: 'var(--surface-panel, #fff)',
              borderBottom: '1px solid var(--border-light, #e8eaed)',
              padding: '0 20px',
              height: 60,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              boxShadow: '0 2px 6px rgba(0,0,0,0.07)'
            }}>
              {/* Left — close button + avatar + title */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                <button
                  type="button"
                  onClick={() => { setRepliesModalOpen(false); setAiAnalysisData(null); setChatFetchError(''); }}
                  title="Close"
                  style={{
                    width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                    border: '1px solid var(--border-light, #e8eaed)',
                    background: 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--text-secondary, #5f6368)', cursor: 'pointer'
                  }}
                >
                  <X size={17} />
                </button>

                <div style={{
                  width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg,#4285f4,#34a853)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontWeight: 900, fontSize: 17
                }}>
                  {(repliesTargetRow.customer_name || 'C').charAt(0).toUpperCase()}
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'var(--text-primary, #202124)', fontWeight: 800, fontSize: 15 }}>
                      {repliesTargetRow.customer_name || '—'}
                    </span>
                    <span style={{ background: '#e8f0fe', borderRadius: 10, padding: '1px 8px', fontSize: 10.5, fontWeight: 700, color: '#1a73e8' }}>
                      #{repliesTargetRow.quotation_no}
                    </span>
                    {repliesList.length > 0 && (
                      <span style={{ background: '#dcfce7', borderRadius: 10, padding: '1px 8px', fontSize: 10.5, fontWeight: 700, color: '#15803d' }}>
                        {repliesList.length} msg{repliesList.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div style={{ color: 'var(--text-secondary, #5f6368)', fontSize: 11, marginTop: 1 }}>
                    📧 Email Thread · {rows.length} total conversation{rows.length !== 1 ? 's' : ''} in this account
                  </div>
                </div>
              </div>

              {/* Right — action buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button
                  type="button" onClick={syncInboundGmail} disabled={syncingMail}
                  style={{
                    padding: '7px 16px', borderRadius: 20,
                    border: '1px solid var(--border-light, #dadce0)',
                    background: 'var(--surface-panel, #fff)',
                    fontSize: 12.5, fontWeight: 700, color: 'var(--text-secondary, #3c4043)',
                    cursor: syncingMail ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6
                  }}
                >
                  🔄 {syncingMail ? 'Syncing…' : 'Sync Gmail'}
                </button>
              </div>
            </div>
            {/* END SCREEN HEADER */}

            {/* CONTENT AREA — 2 columns: recent sidebar + chat thread */}
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

              {/* ═══════════════════════════════════════ */}
              {/* LEFT: RECENT CONVERSATIONS SIDEBAR       */}
              {/* ═══════════════════════════════════════ */}
              <div style={{
                width: 280, flexShrink: 0,
                borderRight: '1px solid #e8eaed',
                background: '#f8f9fa',
                display: 'flex', flexDirection: 'column',
                overflowY: 'auto'
              }}>
                <div style={{ padding: '10px 14px 6px', fontSize: 10.5, fontWeight: 800, color: '#80868b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Recent Conversations
                </div>
                {rows.slice().reverse().map(row => {
                  const isActive = row.id === repliesTargetRow.id;
                  const msgCount = 0; // count not stored locally per-row; show status badge instead
                  const statusColors = {
                    ACCEPTED: { bg: '#dcfce7', color: '#15803d' },
                    REJECTED: { bg: '#fee2e2', color: '#dc2626' },
                    SENT: { bg: '#dbeafe', color: '#1d4ed8' },
                    DRAFT: { bg: '#f1f5f9', color: '#64748b' },
                    'CUSTOMER REPLIED': { bg: '#fef3c7', color: '#b45309' },
                    EXPIRED: { bg: '#f1f5f9', color: '#94a3b8' },
                  };
                  const sc = statusColors[row.status] || { bg: '#f1f5f9', color: '#64748b' };
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => openRepliesModal(row)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '10px 14px', border: 'none', borderBottom: '1px solid #e8eaed',
                        background: isActive ? '#e8f0fe' : 'transparent',
                        borderLeft: isActive ? '3px solid #1a73e8' : '3px solid transparent',
                        cursor: 'pointer',
                        transition: 'background 0.15s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <div style={{
                          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                          background: isActive ? 'linear-gradient(135deg,#1a73e8,#34a853)' : 'linear-gradient(135deg,#9aa0a6,#5f6368)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: '#fff', fontWeight: 800, fontSize: 12
                        }}>
                          {(row.customer_name || 'C').charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: isActive ? 800 : 600, color: isActive ? '#1a73e8' : '#202124', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.customer_name || '—'}
                          </div>
                          <div style={{ fontSize: 10.5, color: '#5f6368', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {row.quotation_no} · {row.country || ''}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 38 }}>
                        <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 8, background: sc.bg, color: sc.color }}>
                          {row.status}
                        </span>
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>
                          {row.quotation_date || ''}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* ═══════════════════════════════════════ */}
              {/* RIGHT: EMAIL THREAD AREA               */}
              {/* ═══════════════════════════════════════ */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' }}>

              {/* ── EMAIL CONTACT TABS ── */}
              {(() => {
                const tabSet = new Set(
                  repliesList
                    .map(m => m.direction === 'OUTBOUND' ? m.recipient_email : m.sender_email)
                    .filter(Boolean)
                );
                const tabs = [...tabSet];
                if (tabs.length <= 1) return null;
                const current = activeEmailTab || tabs[0];
                return (
                  <div style={{
                    flexShrink: 0,
                    display: 'flex',
                    borderBottom: '2px solid #e8eaed',
                    background: '#fff',
                    overflowX: 'auto',
                    padding: '0 14px'
                  }}>
                    {tabs.map(email => {
                      const isActive = current === email;
                      const count = repliesList.filter(m =>
                        (m.direction === 'OUTBOUND' ? m.recipient_email : m.sender_email) === email
                      ).length;
                      return (
                        <button
                          key={email}
                          type="button"
                          onClick={() => { setActiveEmailTab(email); setChatToEmail(email); }}
                          style={{
                            padding: '9px 14px', border: 'none', background: 'none',
                            borderBottom: isActive ? '2px solid #1a73e8' : '2px solid transparent',
                            marginBottom: -2,
                            color: isActive ? '#1a73e8' : '#5f6368',
                            fontWeight: isActive ? 700 : 400,
                            fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                            display: 'flex', alignItems: 'center', gap: 6
                          }}
                        >
                          <span style={{
                            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                            background: isActive ? '#1a73e8' : '#e8eaed',
                            color: isActive ? '#fff' : '#5f6368',
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 10, fontWeight: 800
                          }}>
                            {email.charAt(0).toUpperCase()}
                          </span>
                          {email}
                          <span style={{
                            background: isActive ? '#e8f0fe' : '#f1f3f4',
                            color: isActive ? '#1a73e8' : '#80868b',
                            borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 700
                          }}>
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                );
              })()}

              {/* ── AI INSIGHT BANNER ── */}
              {aiAnalysisData && (
                <div style={{
                  flexShrink: 0,
                  background: '#e8f0fe', borderBottom: '1px solid #c5d9fb',
                  padding: '10px 18px', display: 'flex', alignItems: 'flex-start', gap: 10
                }}>
                  <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>🤖</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1a73e8', marginBottom: 2 }}>
                      AI Assistant &nbsp;·&nbsp; Intent:&nbsp;
                      <span style={{ background: '#1a73e8', color: '#fff', padding: '1px 8px', borderRadius: 10, fontSize: 10.5, fontWeight: 800 }}>
                        {aiAnalysisData.intent}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#3c4043', lineHeight: 1.5 }}>
                      {aiAnalysisData.ai_analysis}
                    </div>
                  </div>
                  <button
                    type="button" onClick={() => setAiAnalysisData(null)}
                    style={{ background: 'none', border: 'none', color: '#5f6368', cursor: 'pointer', fontSize: 16, flexShrink: 0, padding: '0 2px' }}
                  >✕</button>
                </div>
              )}

              {/* ── ERROR BANNER ── */}
              {chatFetchError && (
                <div style={{
                  flexShrink: 0, background: '#fce8e6', borderBottom: '1px solid #f5c6c2',
                  padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 8
                }}>
                  <span>⚠️</span>
                  <span style={{ fontSize: 12, color: '#c5221f', flex: 1 }}>{chatFetchError}</span>
                  <button
                    type="button"
                    onClick={() => openRepliesModal(repliesTargetRow)}
                    style={{ background: '#d93025', border: 'none', color: '#fff', borderRadius: 16, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* ── EMAIL THREAD ── */}
              <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
                {(() => {
                  const parsed = (activeEmailTab
                    ? repliesList.filter(m => {
                        const addr = m.direction === 'OUTBOUND' ? m.recipient_email : m.sender_email;
                        return addr === activeEmailTab;
                      })
                    : repliesList
                  ).map(m => ({
                    ...m,
                    _ts: new Date((m.received_at || '').replace(' ', 'T')).getTime()
                  }));

                  // Old INBOUND records were stored as UTC; OUTBOUND stored as IST (+5:30).
                  // Heuristic: if an INBOUND timestamp is >4h before the earliest OUTBOUND,
                  // it is likely UTC — shift it +5:30h (19800000ms) so sort is correct.
                  const minOutboundTs = Math.min(
                    ...parsed.filter(m => m.direction === 'OUTBOUND' && !isNaN(m._ts)).map(m => m._ts),
                    Infinity
                  );
                  const IST_OFFSET_MS = 5.5 * 3600 * 1000; // 5h30m in ms
                  const UTC_THRESHOLD_MS = 4 * 3600 * 1000;  // 4h gap signals UTC storage

                  const threadMsgs = parsed
                    .map(m => ({
                      ...m,
                      _sortTs: (
                        m.direction === 'INBOUND' &&
                        !isNaN(m._ts) &&
                        isFinite(minOutboundTs) &&
                        m._ts < minOutboundTs - UTC_THRESHOLD_MS
                      ) ? m._ts + IST_OFFSET_MS : m._ts
                    }))
                    .sort((a, b) => {
                      if (isNaN(a._sortTs) || isNaN(b._sortTs)) return 0;
                      return b._sortTs - a._sortTs; // newest first → top
                    });
                  return loadingReplies ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#5f6368', gap: 12 }}>
                    <div style={{ fontSize: 32 }}>⏳</div>
                    <div style={{ fontSize: 13 }}>Loading messages…</div>
                  </div>
                ) : threadMsgs.length === 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#5f6368', gap: 8, textAlign: 'center', padding: '0 24px' }}>
                    <div style={{ fontSize: 52 }}>📭</div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#202124' }}>No messages yet</div>
                    <div style={{ fontSize: 12, color: '#80868b', maxWidth: 300, lineHeight: 1.6 }}>
                      Send a quotation email first, or click <strong>Sync Gmail</strong> to fetch customer replies.
                    </div>
                    <button
                      type="button"
                      onClick={() => openRepliesModal(repliesTargetRow)}
                      style={{ marginTop: 8, padding: '7px 18px', borderRadius: 20, border: '1px solid #dadce0', background: '#fff', fontSize: 12, fontWeight: 600, color: '#1a73e8', cursor: 'pointer' }}
                    >
                      🔃 Reload
                    </button>
                  </div>
                ) : (
                  <div style={{ padding: '16px 12px', background: '#f0f4f8', display: 'flex', flexDirection: 'column', gap: 10 }}>

                    {threadMsgs.map((msg, idx) => {
                      const isOut = msg.direction === 'OUTBOUND';

                      // Date separator between messages from different days
                      const prevMsg = threadMsgs[idx - 1];
                      const msgDate = new Date((msg.received_at || '').replace(' ', 'T'));
                      const prevDate = prevMsg ? new Date((prevMsg.received_at || '').replace(' ', 'T')) : null;
                      const showDateSep = prevDate && msgDate.toDateString() !== prevDate.toDateString();
                      const today = new Date();
                      const yesterday = new Date(); yesterday.setDate(today.getDate() - 1);
                      const dateLabel = isNaN(msgDate) ? '' : (
                        msgDate.toDateString() === today.toDateString() ? 'Today' :
                        msgDate.toDateString() === yesterday.toDateString() ? 'Yesterday' :
                        msgDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
                      );

                      // Strip quoted reply chains — show only the actual typed reply
                      const rawBody = msg.message_body || '';
                      const cleanBody = (() => {
                        const lines = rawBody.split('\n');
                        for (let i = 0; i < lines.length; i++) {
                          const line = lines[i].trim();
                          // Single-line "On ... wrote:"
                          if (/^On .+ wrote:$/i.test(line)) return lines.slice(0, i).join('\n').trim();
                          // Multi-line "On ...\n...\nwrote:"
                          if (/^On .+/i.test(line)) {
                            for (let j = i + 1; j <= Math.min(i + 4, lines.length - 1); j++) {
                              if (/wrote:\s*$/i.test(lines[j].trim())) return lines.slice(0, i).join('\n').trim();
                            }
                          }
                          // Dashes separator / forwarded message
                          if (/^-{4,}/.test(line) || /^_{4,}/.test(line)) return lines.slice(0, i).join('\n').trim();
                          // Quoted line block starting with >
                          if (/^>/.test(line) && i > 0) return lines.slice(0, i).join('\n').trim();
                        }
                        return rawBody.trim();
                      })();
                      return (
                        <div key={msg.id}>
                          {/* DATE SEPARATOR between day groups */}
                          {showDateSep && (
                            <div style={{ textAlign: 'center', margin: '8px 0 4px' }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#80868b', background: '#e8eaed', padding: '2px 12px', borderRadius: 10 }}>
                                ── {dateLabel} ──
                              </span>
                            </div>
                          )}

                          <div style={{
                            display: 'flex',
                            flexDirection: isOut ? 'row-reverse' : 'row',
                            alignItems: 'flex-end',
                            gap: 8
                          }}>
                          {/* Avatar */}
                          <div style={{
                            width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                            background: isOut
                              ? 'linear-gradient(135deg,#1a73e8,#34a853)'
                              : 'linear-gradient(135deg,#ea4335,#fbbc04)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: '#fff', fontWeight: 800, fontSize: 12
                          }}>
                            {isOut ? 'Me' : (repliesTargetRow.customer_name || 'C').charAt(0).toUpperCase()}
                          </div>

                          {/* Bubble column */}
                          <div style={{
                            maxWidth: '72%',
                            display: 'flex', flexDirection: 'column',
                            alignItems: isOut ? 'flex-end' : 'flex-start',
                            gap: 3
                          }}>
                            {/* Name + time row */}
                            <div style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              fontSize: 11, color: '#80868b',
                              flexDirection: isOut ? 'row-reverse' : 'row'
                            }}>
                              <span style={{ fontWeight: 700, color: isOut ? '#1a73e8' : '#d93025' }}>
                                {isOut ? 'Me (BKNR)' : (repliesTargetRow.customer_name || msg.sender_email)}
                              </span>
                              <span>{(() => {
                                const d = new Date((msg.received_at || '').replace(' ', 'T'));
                                if (isNaN(d)) return msg.received_at;
                                const today = new Date();
                                const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
                                if (d.toDateString() === today.toDateString()) return timeStr;
                                return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ', ' + timeStr;
                              })()}</span>
                            </div>

                            {/* Bubble */}
                            <div style={{
                              background: isOut ? '#1a73e8' : '#fff',
                              color: isOut ? '#fff' : '#202124',
                              padding: '12px 16px',
                              borderRadius: isOut ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                              fontSize: 13.5, lineHeight: 1.65, whiteSpace: 'pre-wrap',
                              boxShadow: '0 1px 4px rgba(0,0,0,0.10)',
                              border: isOut ? 'none' : '1px solid #e8eaed',
                              wordBreak: 'break-word'
                            }}>
                              {cleanBody || rawBody}

                              {/* ── ATTACHMENT CARDS ── */}
                              {(() => {
                                let dbAttachments = [];
                                if (msg.attachments_json) {
                                  try {
                                    dbAttachments = typeof msg.attachments_json === 'string' ? JSON.parse(msg.attachments_json) : msg.attachments_json;
                                  } catch (e) {
                                    console.error('Failed to parse attachments_json', e);
                                  }
                                }

                                // Extract image URLs from body
                                const imgUrls = [...rawBody.matchAll(/https?:\/\/\S+?\.(jpg|jpeg|png|gif|webp)(\?\S*)?/gi)].map(m => m[0]);
                                // Extract PDF URLs from body
                                const pdfUrls = [...rawBody.matchAll(/https?:\/\/\S+?\.pdf(\?\S*)?/gi)].map(m => m[0]);
                                // Check if body references PI/PDF doc (show linked PI PDF card)
                                const hasPiRef = rawBody.includes('Proforma Invoice') || rawBody.includes('PI-') || rawBody.includes('.pdf') || rawBody.includes('PDF');
                                return (
                                  <>
                                    {/* DB Attachments (Files sent via email) */}
                                    {dbAttachments && dbAttachments.map((att, i) => {
                                      const isImg = att.mime_type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp)$/i.test(att.filename || '');
                                      const isPdf = att.mime_type === 'application/pdf' || /\.pdf$/i.test(att.filename || '');

                                      if (isImg) {
                                        return (
                                          <div key={`db-att-${i}`} style={{ marginTop: 10 }}>
                                            <div
                                              onClick={() => setPreviewDoc({ url: att.data_url, name: att.filename || 'Photo', type: 'image' })}
                                              style={{ cursor: 'pointer' }}
                                            >
                                              <img
                                                src={att.data_url} alt={att.filename || 'Email photo'}
                                                style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 8, display: 'block', border: '1px solid rgba(0,0,0,0.1)' }}
                                              />
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
                                              <span style={{ fontSize: 10, color: isOut ? '#e0e7ff' : '#80868b' }}>
                                                🖼 {att.filename || 'Photo Attachment'}
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() => setPreviewDoc({ url: att.data_url, name: att.filename || 'Photo', type: 'image' })}
                                                style={{ background: isOut ? '#fff' : '#0284c7', color: isOut ? '#1a73e8' : '#fff', border: 'none', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 800, cursor: 'pointer' }}
                                              >
                                                VIEW
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      }

                                      return (
                                        <div key={`db-att-${i}`} style={{
                                          display: 'flex', alignItems: 'center', gap: 10,
                                          padding: '8px 12px', marginTop: 10,
                                          background: isOut ? 'rgba(255,255,255,0.15)' : '#f0f9ff',
                                          border: isOut ? '1px solid rgba(255,255,255,0.3)' : '1px solid #bae6fd',
                                          borderRadius: 8
                                        }}>
                                          <FileText size={18} color={isOut ? '#fff' : '#0284c7'} />
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                            <strong style={{ fontSize: 11.5, color: isOut ? '#fff' : '#0369a1', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                              {att.filename || 'Attachment'}
                                            </strong>
                                            <span style={{ fontSize: 10, color: isOut ? '#e0e7ff' : '#0284c7' }}>{isPdf ? 'PDF Document' : 'File Attachment'}</span>
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => setPreviewDoc({ url: att.data_url, name: att.filename || 'Document', type: isPdf ? 'pdf' : 'other' })}
                                            style={{ background: isOut ? '#fff' : '#0284c7', color: isOut ? '#1a73e8' : '#fff', border: 'none', padding: '4px 10px', borderRadius: 6, fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}
                                          >
                                            VIEW
                                          </button>
                                        </div>
                                      );
                                    })}
                                    {/* Image attachments */}
                                    {imgUrls.map((url, i) => (
                                      <div key={`img-${i}`} style={{ marginTop: 10 }}>
                                        <img
                                          src={url} alt="Attachment"
                                          style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 8, display: 'block', cursor: 'pointer' }}
                                          onClick={() => setPreviewDoc({ url, name: `Image_${i+1}`, type: 'image' })}
                                        />
                                        <button type="button" onClick={() => setPreviewDoc({ url, name: `Image_${i+1}`, type: 'image' })} style={{ marginTop: 4, background: isOut ? '#fff' : '#0284c7', color: isOut ? '#1a73e8' : '#fff', border: 'none', padding: '3px 8px', borderRadius: 4, fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>
                                          VIEW IMAGE
                                        </button>
                                      </div>
                                    ))}
                                    {/* PDF URL attachments */}
                                    {pdfUrls.map((url, i) => (
                                      <div key={`pdf-${i}`} style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '8px 12px', marginTop: 10,
                                        background: isOut ? 'rgba(255,255,255,0.15)' : '#f0f9ff',
                                        border: isOut ? '1px solid rgba(255,255,255,0.3)' : '1px solid #bae6fd',
                                        borderRadius: 8
                                      }}>
                                        <FileText size={18} color={isOut ? '#fff' : '#0284c7'} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <strong style={{ fontSize: 11.5, color: isOut ? '#fff' : '#0369a1', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {url.split('/').pop().split('?')[0]}
                                          </strong>
                                          <span style={{ fontSize: 10, color: isOut ? '#e0e7ff' : '#0284c7' }}>PDF Document</span>
                                        </div>
                                        <button type="button" onClick={() => setPreviewDoc({ url, name: url.split('/').pop(), type: 'pdf' })}
                                          style={{ background: isOut ? '#fff' : '#0284c7', color: isOut ? '#1a73e8' : '#fff', border: 'none', padding: '4px 10px', borderRadius: 6, fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}>
                                          VIEW
                                        </button>
                                      </div>
                                    ))}
                                    {/* PI PDF reference card (no inline URL, but body mentions PI/PDF) */}
                                    {hasPiRef && pdfUrls.length === 0 && (
                                      <div style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '8px 12px', marginTop: 10,
                                        background: isOut ? 'rgba(255,255,255,0.15)' : '#f0f9ff',
                                        border: isOut ? '1px solid rgba(255,255,255,0.3)' : '1px solid #bae6fd',
                                        borderRadius: 8
                                      }}>
                                        <FileText size={18} color={isOut ? '#ffffff' : '#0284c7'} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <strong style={{ fontSize: 11.5, color: isOut ? '#ffffff' : '#0369a1', display: 'block' }}>
                                            Proforma Invoice (PI) PDF
                                          </strong>
                                          <span style={{ fontSize: 10, color: isOut ? '#e0e7ff' : '#0284c7' }}>
                                            Official Corporate Document Attachment
                                          </span>
                                        </div>
                                        <button type="button"
                                          onClick={() => { const piId = repliesTargetRow.pi_id || repliesTargetRow.id; setPreviewDoc({ url: `/export_documents/proforma_invoice/pdf/${piId}`, name: `PI-${repliesTargetRow.quotation_no}.pdf`, type: 'pdf' }); }}
                                          style={{ background: isOut ? '#ffffff' : '#0284c7', color: isOut ? '#1a73e8' : '#ffffff', border: 'none', padding: '4px 10px', borderRadius: 6, fontSize: 10.5, fontWeight: 800, cursor: 'pointer' }}>
                                          VIEW PDF
                                        </button>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </div>{/* end bubble column */}
                          </div>{/* end message flex row */}
                        </div>
                      );
                    })}
                  </div>
                );
                })()}
              </div>

              {/* ── EMAIL REPLY COMPOSER BAR ── */}
              <div style={{
                flexShrink: 0,
                borderTop: '1px solid #e8eaed',
                background: '#f8f9fa',
                padding: '12px 18px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#5f6368', textTransform: 'uppercase' }}>To:</span>
                  <input
                    type="email"
                    value={chatToEmail}
                    onChange={e => setChatToEmail(e.target.value)}
                    placeholder="recipient@buyer.com"
                    style={{
                      fontSize: 12, fontWeight: 700, color: '#1a73e8',
                      padding: '4px 10px', borderRadius: 6,
                      border: '1px solid #dadce0', background: '#fff',
                      flex: 1, maxWidth: 340
                    }}
                  />
                  {replyFile && (
                    <span style={{ fontSize: 11, color: '#16a34a', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      📎 {replyFile.name}
                      <button type="button" onClick={() => setReplyFile(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontWeight: 800 }}>✕</button>
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <textarea
                    value={newReplyMsg}
                    onChange={e => setNewReplyMsg(e.target.value)}
                    onFocus={e => { e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
                    onInput={e => { e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px`; }}
                    ref={el => { if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }}
                    placeholder="Type your email reply to customer..."
                    rows={2}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #dadce0',
                      fontSize: 12.5,
                      fontFamily: 'inherit',
                      lineHeight: 1.5,
                      resize: 'vertical',
                      minHeight: 48,
                      overflowY: 'hidden',
                      outline: 'none',
                      background: '#ffffff'
                    }}
                  />

                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <label
                      htmlFor="chat-reply-file"
                      style={{
                        padding: '8px 12px', borderRadius: 8,
                        background: '#ffffff', border: '1px solid #dadce0',
                        fontSize: 12, fontWeight: 700, color: '#3c4043',
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6
                      }}
                      title="Attach PDF or document"
                    >
                      📎 Attach
                    </label>
                    <input
                      id="chat-reply-file"
                      type="file"
                      style={{ display: 'none' }}
                      onChange={e => setReplyFile(e.target.files?.[0] || null)}
                    />

                    <button
                      type="button"
                      onClick={sendChatbotReply}
                      disabled={postingReply || !newReplyMsg.trim()}
                      style={{
                        padding: '8px 18px', borderRadius: 8,
                        border: 'none',
                        background: postingReply || !newReplyMsg.trim() ? '#93c5fd' : '#1a73e8',
                        color: '#ffffff',
                        fontSize: 12.5, fontWeight: 800,
                        cursor: postingReply || !newReplyMsg.trim() ? 'not-allowed' : 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 6
                      }}
                    >
                      {postingReply ? 'Sending…' : '🚀 Send Reply'}
                    </button>
                  </div>
                </div>
              </div>{/* end composer bar */}

              </div>{/* end RIGHT email thread col */}
            </div>{/* end 2-col content area */}
          </div>
        )}

      {/* DOCUMENT & IMAGE LIGHTBOX PREVIEW MODAL */}
      {previewDoc && (
        <div className="attendance-modal-overlay" style={{ zIndex: 100005 }} onClick={() => setPreviewDoc(null)}>
          <div className="attendance-modal-content" style={{ maxWidth: 940, width: '92vw', height: '88vh', borderRadius: 14, overflow: 'hidden', background: '#0f172a', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ background: '#1e293b', padding: '12px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#fff', borderBottom: '1px solid #334155' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <FileText size={20} color="#38bdf8" />
                <strong style={{ fontSize: 14, color: '#f8fafc' }}>{previewDoc.name || 'Document Viewer'}</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {previewDoc.url && (
                  <a href={previewDoc.url} download={previewDoc.name || 'download'} style={{ color: '#38bdf8', fontSize: 12, fontWeight: 800, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Download size={14} /> DOWNLOAD COPY
                  </a>
                )}
                <button type="button" onClick={() => setPreviewDoc(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer', fontWeight: 800 }}>✕</button>
              </div>
            </div>
            <div style={{ flex: 1, height: 'calc(100% - 50px)', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
              {previewDoc.type === 'image' ? (
                <img src={previewDoc.url} alt={previewDoc.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 6, boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }} />
              ) : (
                <iframe src={previewDoc.url} title={previewDoc.name} style={{ width: '100%', height: '100%', border: 'none', borderRadius: 6, background: '#ffffff' }} />
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function Field({ label, ...props }) {
  const isQuotationNo = props.name === 'quotation_no';
  return (
    <div className="attendance-form-group">
      <label>{label}</label>
      <input
        className="attendance-input"
        {...props}
        onChange={e => {
          if (isQuotationNo) {
            e.target.value = e.target.value.toUpperCase();
          }
          if (props.onChange) props.onChange(e);
        }}
        style={{
          textTransform: isQuotationNo ? 'uppercase' : 'none',
          ...(props.style || {}),
        }}
      />
    </div>
  );
}


function Select({ label, options, ...props }) {
  return <div className="attendance-form-group"><label>{label}</label><select className="attendance-select" {...props}>{options.map(o => <option key={o} value={o}>{o}</option>)}</select></div>;
}
