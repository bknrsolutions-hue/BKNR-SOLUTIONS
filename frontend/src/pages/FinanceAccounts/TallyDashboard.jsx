/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useState, useEffect } from 'react';
import { 
  BarChart2, FolderTree, Receipt, FileText, ShieldCheck,
  RefreshCw, Settings, Plus, X, Lock, Unlock, Landmark,
  TrendingUp, HandCoins, CircleDollarSign, Download
} from 'lucide-react';
import '../Attendance/Attendance.css';
import './TallyDashboard.css';

export default function TallyDashboard() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [kpis, setKpis] = useState({
    cash_bank: 0,
    net_profit: 0,
    receivables: 0,
    payables: 0,
    day_vouchers: 0,
    income: 0,
    expense: 0,
    assets: 0,
    liabilities: 0,
    equity: 0
  });
  
  const [coaTree, setCoaTree] = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [voucherTypes, setVoucherTypes] = useState([]);
  const [balanceSheetBalanced, setBalanceSheetBalanced] = useState(true);
  const [controlAudit, setControlAudit] = useState(null);
  const [financialYears, setFinancialYears] = useState([]);
  const [workflowVouchers, setWorkflowVouchers] = useState([]);
  const [yearForm, setYearForm] = useState({ year_name: '', start_date: '', end_date: '' });
  const [bankLedgerId, setBankLedgerId] = useState('');
  const [bankFile, setBankFile] = useState(null);
  const [bankStatements, setBankStatements] = useState([]);
  const [bankMatchFilter, setBankMatchFilter] = useState('ALL');
  const [forexDate, setForexDate] = useState(new Date().toISOString().split('T')[0]);
  const [forexRates, setForexRates] = useState('USD: 83.50');

  // New Voucher Entry State
  const [voucherDate, setVoucherDate] = useState(new Date().toISOString().split('T')[0]);
  const [voucherTypeId, setVoucherTypeId] = useState('');
  const [vRef, setVRef] = useState('');
  const [vNarration, setVNarration] = useState('');
  const [vLines, setVLines] = useState([
    { ledger_id: '', debit_amount: 0.00, credit_amount: 0.00, remarks: '' },
    { ledger_id: '', debit_amount: 0.00, credit_amount: 0.00, remarks: '' }
  ]);

  // Financial Reports State
  const [activeReport, setActiveReport] = useState('');
  const [reportData, setReportData] = useState(null);

  // Drilldown Modal State
  const [isDrillOpen, setIsDrillOpen] = useState(false);
  const [drillTitle, setDrillTitle] = useState('');
  const [drillMeta, setDrillMeta] = useState('');
  const [drillData, setDrillData] = useState({ ledger_summary: [], transactions: [] });
  const [isDrillLoading, setIsDrillLoading] = useState(false);
  const [drillTab, setDrillTab] = useState('ledger');

  // Toast Notification State
  const [notification, setNotification] = useState(null);

  const showNotification = (msg, type = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadDashboardData = async () => {
    try {
      const res = await fetch('/finance_accounts/dashboard/summary');
      const data = await res.json();
      if (data.success) {
        setKpis({
          cash_bank: data.kpis.cash_bank,
          net_profit: data.kpis.net_profit,
          receivables: data.kpis.receivables,
          payables: data.kpis.payables,
          day_vouchers: data.kpis.day_vouchers,
          income: data.kpis.income,
          expense: data.kpis.expense,
          assets: data.kpis.assets,
          liabilities: data.kpis.liabilities,
          equity: data.kpis.equity
        });
        setBalanceSheetBalanced(data.balance_sheet_balanced);
      }
    } catch {
      showNotification('❌ Failed to fetch dashboard summary KPIs!', 'danger');
    }
  };

  const loadCoaTree = async () => {
    try {
      const res = await fetch('/finance_accounts/groups');
      const data = await res.json();
      if (data.success) {
        setCoaTree(data.tree || []);
      }
    } catch {
      showNotification('❌ Failed to fetch Chart of Accounts tree!', 'danger');
    }
  };

  const loadLedgersAndVoucherTypes = async () => {
    try {
      const [ledgersRes, typesRes] = await Promise.all([
        fetch('/finance_accounts/ledgers'),
        fetch('/finance_accounts/voucher-types')
      ]);
      const ledgersData = await ledgersRes.json();
      const typesData = await typesRes.json();

      if (ledgersData.success) {
        setLedgers(ledgersData.data || []);
      }
      if (typesData.success) {
        setVoucherTypes(typesData.data || []);
        if (typesData.data?.length > 0 && !voucherTypeId) {
          setVoucherTypeId(typesData.data[0].id);
        }
      }
    } catch {
      showNotification('❌ Failed to fetch configurations!', 'danger');
    }
  };

  const loadControlCenter = async () => {
    try {
      const [auditRes, yearsRes, vouchersRes] = await Promise.all([
        fetch('/finance_accounts/controls/audit'),
        fetch('/finance_accounts/financial-years'),
        fetch('/finance_accounts/reports/voucher-register'),
      ]);
      const [audit, years, vouchers] = await Promise.all([auditRes.json(), yearsRes.json(), vouchersRes.json()]);
      if (audit.success) setControlAudit(audit.data);
      if (years.success) setFinancialYears(years.data || []);
      if (vouchers.success) setWorkflowVouchers(vouchers.data || []);
    } catch {
      showNotification('Unable to load accounting controls.', 'danger');
    }
  };

  useEffect(() => {
    loadDashboardData();
    loadCoaTree();
    loadLedgersAndVoucherTypes();
    loadControlCenter();
  }, []);

  const refreshAll = () => {
    loadDashboardData();
    loadCoaTree();
    loadLedgersAndVoucherTypes();
    loadControlCenter();
    showNotification('🔄 Dashboard values refreshed successfully!', 'success');
  };

  const setupDefaults = async () => {
    const confirmSetup = window.confirm(`Setup Accounting Masters?\nAre you sure you want to load the default Tally-style accounting configuration?`);
    if (!confirmSetup) return;

    try {
      const res = await fetch('/finance_accounts/setup/defaults', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showNotification('✅ Default accounting masters configured!', 'success');
        refreshAll();
      } else {
        showNotification(data.message || '❌ Setup failed!', 'danger');
      }
    } catch {
      showNotification('❌ Network error starting defaults setup!', 'danger');
    }
  };

  // Drills details logic
  const handleDrilldown = async (metric) => {
    setIsDrillOpen(true);
    setIsDrillLoading(true);
    setDrillTab('ledger');
    
    // Set placeholder title
    const labels = {
      income: 'Total Income',
      expense: 'Total Expense',
      assets: 'Assets',
      liabilities_equity: 'Liabilities + Equity',
      cash_bank: 'Cash & Bank',
      receivables: 'Receivables',
      payables: 'Payables',
      net_profit: 'Net Profit',
    };
    setDrillTitle(labels[metric] || 'Financial Details');
    setDrillMeta('Loading details...');
    setDrillData({ ledger_summary: [], transactions: [] });

    try {
      const res = await fetch(`/finance_accounts/dashboard/summary/details?metric=${metric}`);
      const data = await res.json();
      if (data.success) {
        setDrillTitle(data.title);
        setDrillMeta(`${data.period} | Total Amount: ₹${parseFloat(data.total_amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
        setDrillData({
          ledger_summary: data.ledger_summary || [],
          transactions: data.transactions || []
        });
      } else {
        showNotification(data.message || 'Failed to load details', 'danger');
      }
    } catch {
      showNotification('Error fetching drilldown details', 'danger');
    } finally {
      setIsDrillLoading(false);
    }
  };

  // Financial Reports loader
  const loadReport = async (reportType) => {
    setActiveReport(reportType);
    setReportData(null);
    try {
      const res = await fetch(`/finance_accounts/reports/${reportType}`);
      const data = await res.json();
      if (data.success) {
        setReportData(data.data || []);
      }
    } catch {
      showNotification(`❌ Failed to calculate ${reportType} statement!`, 'danger');
    }
  };

  // New balanced voucher entry logic
  const addVLine = () => {
    setVLines(prev => [...prev, { ledger_id: '', debit_amount: 0.00, credit_amount: 0.00, remarks: '' }]);
  };

  const removeVLine = (idx) => {
    if (vLines.length > 2) {
      setVLines(prev => prev.filter((_, i) => i !== idx));
    } else {
      alert('A voucher requires at least two ledger lines!');
    }
  };

  const handleVLineChange = (idx, field, value) => {
    setVLines(prev => prev.map((line, i) => {
      if (i === idx) {
        return { ...line, [field]: value };
      }
      return line;
    }));
  };

  const totalDr = vLines.reduce((sum, l) => sum + (parseFloat(l.debit_amount) || 0), 0);
  const totalCr = vLines.reduce((sum, l) => sum + (parseFloat(l.credit_amount) || 0), 0);
  const isBalanced = Math.abs(totalDr - totalCr) < 0.01 && totalDr > 0;

  const formatCurrency = (value) => `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

  const handleVoucherSubmit = async (e) => {
    e.preventDefault();

    if (vLines.some(l => !l.ledger_id)) {
      alert('All lines must have a ledger selected!');
      return;
    }

    if (!isBalanced) {
      alert('Voucher is unbalanced! Total Debit must equal Credit.');
      return;
    }

    const confirmPost = window.confirm('Do you want to submit this voucher for approval?');
    if (!confirmPost) return;

    try {
      const payload = {
        voucher_date: voucherDate,
        voucher_type_id: parseInt(voucherTypeId),
        reference_no: vRef || null,
        narration: vNarration || null,
        details: vLines.map(l => ({
          ledger_id: parseInt(l.ledger_id),
          debit_amount: parseFloat(l.debit_amount) || 0.0,
          credit_amount: parseFloat(l.credit_amount) || 0.0,
          remarks: l.remarks || null
        }))
      };

      const res = await fetch('/finance_accounts/vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (data.success) {
        showNotification(data.message || 'Voucher submitted successfully.', 'success');
        setVRef('');
        setVNarration('');
        setVLines([
          { ledger_id: '', debit_amount: 0.00, credit_amount: 0.00, remarks: '' },
          { ledger_id: '', debit_amount: 0.00, credit_amount: 0.00, remarks: '' }
        ]);
        loadDashboardData();
        loadControlCenter();
      } else {
        showNotification(data.message || '❌ Posting failed!', 'danger');
      }
    } catch {
      showNotification('❌ Network error posting voucher!', 'danger');
    }
  };

  const decideVoucher = async (voucher, decision) => {
    const remarks = decision === 'reject' ? window.prompt('Enter rejection reason:') : '';
    if (decision === 'reject' && !remarks?.trim()) return;
    if (!window.confirm(`Do you want to ${decision} voucher ${voucher.voucher_no}?`)) return;
    try {
      const response = await fetch(`/finance_accounts/vouchers/${voucher.id}/${decision}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ remarks: remarks || null }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.detail || data.message || 'Action failed');
      showNotification(data.message, 'success');
      await Promise.all([loadControlCenter(), loadDashboardData()]);
    } catch (error) {
      showNotification(error.message, 'danger');
    }
  };

  const reverseVoucher = async voucher => {
    const reason = window.prompt(`Enter reversal reason for ${voucher.voucher_no}:`);
    if (!reason?.trim()) return;
    if (!window.confirm('Do you want to post the reversal voucher?')) return;
    try {
      const response = await fetch(`/finance_accounts/vouchers/${voucher.id}/reverse`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ remarks: reason }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.detail || data.message || 'Reversal failed');
      showNotification(data.message, 'success');
      await Promise.all([loadControlCenter(), loadDashboardData()]);
    } catch (error) {
      showNotification(error.message, 'danger');
    }
  };

  const createFinancialYear = async event => {
    event.preventDefault();
    if (!window.confirm('Do you want to create this financial year?')) return;
    try {
      const response = await fetch('/finance_accounts/financial-years', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(yearForm),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.detail || data.message || 'Unable to create financial year');
      setYearForm({ year_name: '', start_date: '', end_date: '' });
      showNotification(data.message, 'success');
      loadControlCenter();
    } catch (error) {
      showNotification(error.message, 'danger');
    }
  };

  const toggleYearLock = async year => {
    const next = !year.is_locked;
    if (!window.confirm(`Do you want to ${next ? 'lock' : 'unlock'} ${year.year_name}?`)) return;
    try {
      const response = await fetch(`/finance_accounts/financial-years/${year.id}/lock?locked=${next}`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.detail || data.message || 'Unable to update financial year');
      showNotification(data.message, 'success');
      loadControlCenter();
    } catch (error) {
      showNotification(error.message, 'danger');
    }
  };

  const loadBankStatements = async (ledgerId = bankLedgerId, matchFilter = bankMatchFilter) => {
    if (!ledgerId) return;
    try {
      const matchedQuery = matchFilter === 'ALL' ? '' : `&matched=${matchFilter === 'MATCHED'}`;
      const response = await fetch(`/finance_accounts/bank/statements?bank_ledger_id=${ledgerId}${matchedQuery}`);
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.detail || data.message || 'Unable to load bank statement');
      setBankStatements(data.data || []);
    } catch (error) {
      showNotification(error.message, 'danger');
    }
  };

  const exportBankReconciliationPdf = () => {
    if (!bankLedgerId) return showNotification('Select a bank ledger before exporting PDF.', 'danger');
    const matchedQuery = bankMatchFilter === 'ALL' ? '' : `&matched=${bankMatchFilter === 'MATCHED'}`;
    window.open(`/finance_accounts/bank/statements/export/pdf?bank_ledger_id=${bankLedgerId}${matchedQuery}`, '_blank', 'noopener');
  };

  const importBankStatement = async event => {
    event.preventDefault();
    if (!bankLedgerId || !bankFile) return showNotification('Select a bank ledger and statement file.', 'danger');
    if (!window.confirm('Do you want to import this bank statement?')) return;
    const body = new FormData();
    body.append('file', bankFile);
    try {
      const response = await fetch(`/finance_accounts/bank/statements/import?bank_ledger_id=${bankLedgerId}`, { method: 'POST', body });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.detail || data.message || 'Import failed');
      showNotification(data.message, 'success');
      await loadBankStatements();
    } catch (error) {
      showNotification(error.message, 'danger');
    }
  };

  const rollbackLastBankPdf = async () => {
    if (!bankLedgerId) return showNotification('Select the bank ledger used for the PDF import.', 'danger');
    if (!window.confirm('Rollback the latest imported PDF statement for this bank ledger?')) return;
    try {
      const response = await fetch(`/finance_accounts/bank/statements/rollback-last-pdf-import?bank_ledger_id=${bankLedgerId}`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.detail || data.message || 'Rollback failed');
      showNotification(data.message, 'success');
      setBankFile(null);
      await loadBankStatements();
    } catch (error) {
      showNotification(error.message, 'danger');
    }
  };

  const autoMatchBank = async () => {
    if (!bankLedgerId || !window.confirm('Do you want to auto-match statement entries with posted vouchers?')) return;
    try {
      const response = await fetch(`/finance_accounts/bank/auto-match?bank_ledger_id=${bankLedgerId}`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.detail || data.message || 'Auto-match failed');
      showNotification(data.message, 'success');
      await loadBankStatements();
    } catch (error) {
      showNotification(error.message, 'danger');
    }
  };

  const runForexRevaluation = async event => {
    event.preventDefault();
    const rates = {};
    forexRates.split(',').forEach(pair => {
      const [currency, value] = pair.split(':');
      if (currency?.trim() && Number(value) > 0) rates[currency.trim().toUpperCase()] = Number(value);
    });
    if (!Object.keys(rates).length) return showNotification('Enter rates like USD: 83.50, EUR: 90.25.', 'danger');
    if (!window.confirm(`Do you want to post unrealised forex revaluation as of ${forexDate}?`)) return;
    try {
      const response = await fetch('/finance_accounts/customer_receivables/forex-revaluation', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ as_of_date: forexDate, closing_rates: rates }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.detail || data.message || 'Forex revaluation failed');
      showNotification(data.message, 'success');
      await Promise.all([loadDashboardData(), loadControlCenter()]);
    } catch (error) {
      showNotification(error.message, 'danger');
    }
  };

  // Render Coa Node
  const renderCoaNode = (node) => {
    return (
      <div className="tree-node" key={node.id} style={{ marginLeft: '20px', borderLeft: '1px dashed var(--att-border)', paddingLeft: '10px', marginTop: '5px' }}>
        <span className="tree-label" style={{ fontSize: '12px', fontWeight: '600', padding: '4px 8px', borderRadius: '4px', display: 'inline-block' }}>
          🏷️ {node.name} <span style={{ fontSize: '10px', color: 'var(--att-muted)' }}>({node.type})</span>
        </span>
        {node.children && node.children.map(child => renderCoaNode(child))}
      </div>
    );
  };

  return (
    <div className="attendance-container tally-dashboard" style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0, padding: 0, overflow: 'hidden' }}>
      {notification && (
        <div className={`attendance-toast ${notification.type === 'success' ? 'success' : 'error'}`} style={{ top: '80px' }}>
          {notification.msg}
        </div>
      )}

      {/* DASHBOARD HEADER */}
      <div className="attendance-page-header" style={{ flex: '0 0 auto', padding: '16px 24px', borderBottom: '1px solid var(--att-border)', background: 'var(--att-card)' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '800' }}>Enterprise Finance & Tally Control</h1>
          <p style={{ margin: '4px 0 0', fontSize: '11px', color: 'var(--att-muted)' }}>
            Financial accounting suite, voucher postings, audits, and real-time ledger statements
          </p>
        </div>
        <div className="attendance-page-header-actions" style={{ display: 'flex', gap: '8px' }}>
          <button className="attendance-btn attendance-btn-secondary" onClick={setupDefaults}>
            <Settings size={14} /> Setup Masters
          </button>
          <button className="attendance-btn attendance-btn-primary" onClick={refreshAll}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: '1 1 0', minHeight: 0, overflow: 'hidden' }}>
        {/* SIDEBAR TABS */}
        <div className="tally-sidebar-nav" style={{ flex: '0 0 220px', minHeight: 0, overflowY: 'auto', background: 'var(--att-card)', borderRight: '1px solid var(--att-border)', padding: '16px 8px' }}>
          <button className={`attendance-btn ${activeTab === 'dashboard' ? 'attendance-btn-primary' : 'attendance-btn-secondary'}`} style={{ width: '100%', justifyContent: 'flex-start', gap: '8px', marginBottom: '8px', textAlign: 'left' }} onClick={() => setActiveTab('dashboard')}>
            <BarChart2 size={16} /> Dashboard
          </button>
          <button className={`attendance-btn ${activeTab === 'coa' ? 'attendance-btn-primary' : 'attendance-btn-secondary'}`} style={{ width: '100%', justifyContent: 'flex-start', gap: '8px', marginBottom: '8px', textAlign: 'left' }} onClick={() => setActiveTab('coa')}>
            <FolderTree size={16} /> Chart of Accounts
          </button>
          <button className={`attendance-btn ${activeTab === 'voucher' ? 'attendance-btn-primary' : 'attendance-btn-secondary'}`} style={{ width: '100%', justifyContent: 'flex-start', gap: '8px', marginBottom: '8px', textAlign: 'left' }} onClick={() => setActiveTab('voucher')}>
            <Receipt size={16} /> Voucher Entry
          </button>
          <button className={`attendance-btn ${activeTab === 'reports' ? 'attendance-btn-primary' : 'attendance-btn-secondary'}`} style={{ width: '100%', justifyContent: 'flex-start', gap: '8px', marginBottom: '8px', textAlign: 'left' }} onClick={() => setActiveTab('reports')}>
            <FileText size={16} /> Financial Reports
          </button>
          <button className={`attendance-btn ${activeTab === 'controls' ? 'attendance-btn-primary' : 'attendance-btn-secondary'}`} style={{ width: '100%', justifyContent: 'flex-start', gap: '8px', marginBottom: '8px', textAlign: 'left' }} onClick={() => { setActiveTab('controls'); loadControlCenter(); }}>
            <ShieldCheck size={16} /> Accounting Controls
          </button>
          <button className={`attendance-btn ${activeTab === 'integration' ? 'attendance-btn-primary' : 'attendance-btn-secondary'}`} style={{ width: '100%', justifyContent: 'flex-start', gap: '8px', marginBottom: '8px', textAlign: 'left' }} onClick={() => setActiveTab('integration')}>
            <RefreshCw size={16} /> Reconciliation & FX
          </button>
        </div>

        {/* TAB WORKSPACE */}
        <div style={{ flex: '1 1 0', minWidth: 0, minHeight: 0, height: '100%', padding: '24px', paddingBottom: '48px', overflowY: 'auto', overscrollBehavior: 'contain' }}>
          
          {/* TAB 1: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div>
              <div className="tally-kpi-grid">
                <button className="tally-kpi-card tally-kpi-blue" type="button" onClick={() => handleDrilldown('cash_bank')} aria-label="Open Cash and Bank details">
                  <span className="tally-kpi-icon"><Landmark size={17} /></span>
                  <span className="tally-kpi-content">
                    <span className="tally-kpi-label">Cash &amp; Bank</span>
                    <span className="tally-kpi-value">{formatCurrency(kpis.cash_bank)}</span>
                  </span>
                  <span className="tally-kpi-side">DR</span>
                </button>
                <button className={`tally-kpi-card ${Number(kpis.net_profit || 0) < 0 ? 'tally-kpi-red' : 'tally-kpi-green'}`} type="button" onClick={() => handleDrilldown('net_profit')} aria-label="Open Net Profit details">
                  <span className="tally-kpi-icon"><TrendingUp size={17} /></span>
                  <span className="tally-kpi-content">
                    <span className="tally-kpi-label">Net Profit</span>
                    <span className="tally-kpi-value">{formatCurrency(kpis.net_profit)}</span>
                  </span>
                </button>
                <button className="tally-kpi-card tally-kpi-cyan" type="button" onClick={() => handleDrilldown('receivables')} aria-label="Open Aged Receivables details">
                  <span className="tally-kpi-icon"><HandCoins size={17} /></span>
                  <span className="tally-kpi-content">
                    <span className="tally-kpi-label">Aged Receivables</span>
                    <span className="tally-kpi-value">{formatCurrency(kpis.receivables)}</span>
                  </span>
                  <span className="tally-kpi-side">DR</span>
                </button>
                <button className="tally-kpi-card tally-kpi-orange" type="button" onClick={() => handleDrilldown('payables')} aria-label="Open Aged Payables details">
                  <span className="tally-kpi-icon"><CircleDollarSign size={17} /></span>
                  <span className="tally-kpi-content">
                    <span className="tally-kpi-label">Aged Payables</span>
                    <span className="tally-kpi-value">{formatCurrency(kpis.payables)}</span>
                  </span>
                  <span className="tally-kpi-side">CR</span>
                </button>
              </div>

              <div className="attendance-card" style={{ padding: '24px', border: '1px solid var(--att-border)', borderRadius: '8px' }}>
                <h2 style={{ fontSize: '14px', fontWeight: '800', margin: '0 0 16px 0', borderBottom: '1px solid var(--att-border)', paddingBottom: '12px', color: 'var(--att-heading)' }}>
                  Financial Summary (Click metrics to drill down)
                </h2>
                <div className="attendance-table-wrapper">
                  <table className="attendance-table">
                    <thead>
                      <tr>
                        <th style={{ textalign: 'left' }}>Metric</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                        <th style={{ textAlign: 'center' }}>Book Side</th>
                        <th style={{ textAlign: 'center' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ fontWeight: '700', textalign: 'left' }}>Total Income</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="attendance-btn attendance-btn-secondary" style={{ padding: '4px 8px' }} onClick={() => handleDrilldown('income')}>
                            ₹{parseFloat(kpis.income || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </button>
                        </td>
                        <td style={{ textAlign: 'center' }}>Credit</td>
                        <td style={{ textAlign: 'center' }}><span className="attendance-badge attendance-badge-present">LIVE</span></td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: '700', textalign: 'left' }}>Total Expense</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="attendance-btn attendance-btn-secondary" style={{ padding: '4px 8px' }} onClick={() => handleDrilldown('expense')}>
                            ₹{parseFloat(kpis.expense || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </button>
                        </td>
                        <td style={{ textAlign: 'center' }}>Debit</td>
                        <td style={{ textAlign: 'center' }}><span className="attendance-badge attendance-badge-present">LIVE</span></td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: '700', textalign: 'left' }}>Assets</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="attendance-btn attendance-btn-secondary" style={{ padding: '4px 8px' }} onClick={() => handleDrilldown('assets')}>
                            ₹{parseFloat(kpis.assets || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </button>
                        </td>
                        <td style={{ textAlign: 'center' }}>Debit</td>
                        <td style={{ textAlign: 'center' }}><span className="attendance-badge attendance-badge-present">LIVE</span></td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: '700', textalign: 'left' }}>Liabilities + Equity</td>
                        <td style={{ textAlign: 'right' }}>
                          <button className="attendance-btn attendance-btn-secondary" style={{ padding: '4px 8px' }} onClick={() => handleDrilldown('liabilities_equity')}>
                            ₹{parseFloat((kpis.liabilities || 0) + (kpis.equity || 0)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </button>
                        </td>
                        <td style={{ textAlign: 'center' }}>Credit</td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`attendance-badge ${balanceSheetBalanced ? 'attendance-badge-present' : 'attendance-badge-absent'}`}>
                            {balanceSheetBalanced ? 'BALANCED' : 'CHECK'}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CHART OF ACCOUNTS */}
          {activeTab === 'coa' && (
            <div className="attendance-card" style={{ padding: '24px', border: '1px solid var(--att-border)', borderRadius: '8px' }}>
              <h2 style={{ fontSize: '14px', fontWeight: '800', margin: '0 0 16px 0', borderBottom: '1px solid var(--att-border)', paddingBottom: '12px', color: 'var(--att-heading)' }}>
                Chart of Accounts Tree View
              </h2>
              <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                {coaTree.map(rootNode => renderCoaNode(rootNode))}
                {!coaTree.length && <div className="attendance-empty">No account groups loaded.</div>}
              </div>
            </div>
          )}

          {/* TAB 3: VOUCHER ENTRY */}
          {activeTab === 'voucher' && (
            <div className="attendance-card" style={{ padding: '24px', border: '1px solid var(--att-border)', borderRadius: '8px' }}>
              <h2 style={{ fontSize: '14px', fontWeight: '800', margin: '0 0 16px 0', borderBottom: '1px solid var(--att-border)', paddingBottom: '12px', color: 'var(--att-heading)' }}>
                New Balanced Voucher Entry
              </h2>
              <form onSubmit={handleVoucherSubmit}>
                <div className="attendance-form-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: '16px' }}>
                  <div className="attendance-form-group">
                    <label htmlFor="voucher_date">Voucher Date</label>
                    <input 
                      id="voucher_date"
                      className="attendance-input" 
                      type="date" 
                      value={voucherDate} 
                      onChange={e => setVoucherDate(e.target.value)} 
                      required 
                    />
                  </div>
                  <div className="attendance-form-group">
                    <label htmlFor="voucher_type">Voucher Type</label>
                    <select 
                      id="voucher_type"
                      className="attendance-select" 
                      value={voucherTypeId} 
                      onChange={e => setVoucherTypeId(e.target.value)} 
                      required
                    >
                      {voucherTypes.map(vt => (
                        <option key={vt.id} value={vt.id}>{vt.name} ({vt.prefix})</option>
                      ))}
                    </select>
                  </div>
                  <div className="attendance-form-group">
                    <label htmlFor="v_ref">Reference No</label>
                    <input 
                      id="v_ref"
                      className="attendance-input" 
                      placeholder="Challan / Bill No..." 
                      value={vRef} 
                      onChange={e => setVRef(e.target.value)} 
                    />
                  </div>
                  <div className="attendance-form-group">
                    <label htmlFor="v_narration">Narration</label>
                    <input 
                      id="v_narration"
                      className="attendance-input" 
                      placeholder="Voucher details..." 
                      value={vNarration} 
                      onChange={e => setVNarration(e.target.value)} 
                    />
                  </div>
                </div>

                <div className="attendance-table-wrapper" style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '16px' }}>
                  <table className="attendance-table">
                    <thead>
                      <tr>
                        <th style={{ textalign: 'left' }}>Ledger Account</th>
                        <th style={{ width: '150px', textAlign: 'right' }}>Debit Amount (₹)</th>
                        <th style={{ width: '150px', textAlign: 'right' }}>Credit Amount (₹)</th>
                        <th style={{ width: '220px', textalign: 'left' }}>Cost Center / Remarks</th>
                        <th style={{ width: '50px', textAlign: 'center' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {vLines.map((line, idx) => (
                        <tr key={idx}>
                          <td>
                            <select 
                              aria-label={`Ledger account for line ${idx + 1}`}
                              className="attendance-select" 
                              value={line.ledger_id} 
                              onChange={e => handleVLineChange(idx, 'ledger_id', e.target.value)} 
                              required
                            >
                              <option value="">-- Select Ledger --</option>
                              {ledgers.map(l => (
                                <option key={l.id} value={l.id}>
                                  {l.ledger_name} ({l.group_name || l.group_type})
                                </option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <input 
                              aria-label={`Debit amount for line ${idx + 1}`}
                              className="attendance-input" 
                              type="number" 
                              step="any" 
                              style={{ textAlign: 'right' }} 
                              value={line.debit_amount} 
                              onChange={e => handleVLineChange(idx, 'debit_amount', e.target.value)} 
                            />
                          </td>
                          <td>
                            <input 
                              aria-label={`Credit amount for line ${idx + 1}`}
                              className="attendance-input" 
                              type="number" 
                              step="any" 
                              style={{ textAlign: 'right' }} 
                              value={line.credit_amount} 
                              onChange={e => handleVLineChange(idx, 'credit_amount', e.target.value)} 
                            />
                          </td>
                          <td>
                            <input 
                              aria-label={`Remarks for line ${idx + 1}`}
                              className="attendance-input" 
                              value={line.remarks} 
                              onChange={e => handleVLineChange(idx, 'remarks', e.target.value)} 
                            />
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button type="button" className="attendance-btn attendance-btn-danger" style={{ padding: '4px 8px' }} onClick={() => removeVLine(idx)}>
                              &times;
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button type="button" className="attendance-btn attendance-btn-secondary" onClick={addVLine}>
                    <Plus size={14} /> Add Line
                  </button>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    <div style={{ textAlign: 'right', fontSize: '12px', fontWeight: '800' }}>
                      <div style={{ color: 'var(--att-success)' }}>Total Dr: ₹{totalDr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                      <div style={{ color: 'var(--att-accent)' }}>Total Cr: ₹{totalCr.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
                    </div>
                    <button type="submit" className="attendance-btn attendance-btn-primary" disabled={!isBalanced}>
                      Submit Voucher
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* TAB 4: FINANCIAL REPORTS */}
          {activeTab === 'reports' && (
            <div className="attendance-card" style={{ padding: '24px', border: '1px solid var(--att-border)', borderRadius: '8px' }}>
              <h2 style={{ fontSize: '14px', fontWeight: '800', margin: '0 0 16px 0', borderBottom: '1px solid var(--att-border)', paddingBottom: '12px', color: 'var(--att-heading)' }}>
                Financial Statements Reports
              </h2>
              <div className="tally-report-nav" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <button className={`attendance-btn ${activeReport === 'trial-balance' ? 'attendance-btn-primary' : 'attendance-btn-secondary'}`} onClick={() => loadReport('trial-balance')}>
                  Trial Balance
                </button>
                <button className={`attendance-btn ${activeReport === 'profit-loss' ? 'attendance-btn-primary' : 'attendance-btn-secondary'}`} onClick={() => loadReport('profit-loss')}>
                  Profit & Loss
                </button>
                <button className={`attendance-btn ${activeReport === 'balance-sheet' ? 'attendance-btn-primary' : 'attendance-btn-secondary'}`} onClick={() => loadReport('balance-sheet')}>
                  Balance Sheet
                </button>
                <button className={`attendance-btn ${activeReport === 'cash-flow' ? 'attendance-btn-primary' : 'attendance-btn-secondary'}`} onClick={() => loadReport('cash-flow')}>
                  Cash Flow
                </button>
                <button className={`attendance-btn ${activeReport === 'voucher-register' ? 'attendance-btn-primary' : 'attendance-btn-secondary'}`} onClick={() => loadReport('voucher-register')}>
                  Voucher Register
                </button>
                <button className={`attendance-btn ${activeReport === 'gst-summary' ? 'attendance-btn-primary' : 'attendance-btn-secondary'}`} onClick={() => loadReport('gst-summary')}>
                  GST Summary
                </button>
                <button className={`attendance-btn ${activeReport === 'aging' ? 'attendance-btn-primary' : 'attendance-btn-secondary'}`} onClick={() => loadReport('aging')}>
                  Bill Ageing
                </button>
              </div>

              <div className="attendance-table-wrapper" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {reportData && activeReport === 'cash-flow' ? (
                  <div style={{ padding: 12 }}>
                    <div className="attendance-form-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 12 }}>
                      {['operating', 'investing', 'financing', 'net_change'].map(key => <div className="attendance-card" style={{ padding: 12 }} key={key}><small>{key.replace('_', ' ').toUpperCase()}</small><strong style={{ display: 'block', marginTop: 5 }}>₹{Number(reportData[key] || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>)}
                    </div>
                    <table className="attendance-table"><thead><tr><th>Date</th><th>Voucher</th><th>Category</th><th>Narration</th><th style={{ textAlign: 'right' }}>Cash Movement</th></tr></thead><tbody>
                      {(reportData.transactions || []).map((row, index) => <tr key={index}><td>{row.date}</td><td>{row.voucher_no}</td><td>{row.category}</td><td>{row.narration || '—'}</td><td style={{ textAlign: 'right' }}>₹{Number(row.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>)}
                    </tbody></table>
                  </div>
                ) : reportData && activeReport === 'voucher-register' ? (
                  <table className="attendance-table"><thead><tr><th>Date</th><th>Voucher</th><th>Type</th><th>Status</th><th>Reference</th><th style={{ textAlign: 'right' }}>Debit</th><th style={{ textAlign: 'right' }}>Credit</th></tr></thead><tbody>
                    {reportData.map(row => <tr key={row.id}><td>{row.voucher_date}</td><td>{row.voucher_no}</td><td>{row.voucher_type}</td><td>{row.status}</td><td>{row.reference_no || '—'}</td><td style={{ textAlign: 'right' }}>₹{Number(row.total_debit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td style={{ textAlign: 'right' }}>₹{Number(row.total_credit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>)}
                  </tbody></table>
                ) : reportData && activeReport === 'aging' ? (
                  <div style={{ padding: 12 }}>
                    {['receivables', 'payables'].map(section => <div key={section} style={{ marginBottom: 18 }}><h3 style={{ textTransform: 'capitalize' }}>{section}</h3><div className="attendance-form-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', marginBottom: 10 }}>{Object.entries(reportData[section] || {}).map(([bucket, amount]) => <div className="attendance-card" style={{ padding: 10 }} key={bucket}><small>{bucket}</small><strong style={{ display: 'block' }}>₹{Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</strong></div>)}</div><table className="attendance-table"><thead><tr><th>Party</th><th>Document</th><th>Due Date</th><th>Overdue Days</th><th>Bucket</th><th style={{ textAlign: 'right' }}>Outstanding</th></tr></thead><tbody>{(reportData[section === 'receivables' ? 'receivable_items' : 'payable_items'] || []).map((row, index) => <tr key={index}><td>{row.party}</td><td>{row.document_no}</td><td>{row.due_date}</td><td>{row.overdue_days}</td><td>{row.bucket}</td><td style={{ textAlign: 'right' }}>₹{Number(row.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td></tr>)}</tbody></table></div>)}
                  </div>
                ) : reportData && activeReport === 'gst-summary' ? (
                  <table className="attendance-table"><thead><tr><th>GST Ledger</th><th style={{ textAlign: 'right' }}>Opening</th><th style={{ textAlign: 'right' }}>Closing</th><th style={{ textAlign: 'center' }}>Transactions</th></tr></thead><tbody>
                    {Object.entries(reportData).map(([name, row]) => <tr key={name}><td>{name}</td><td style={{ textAlign: 'right' }}>₹{Number(row.opening || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td style={{ textAlign: 'right' }}>₹{Number(row.closing || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td style={{ textAlign: 'center' }}>{row.transactions}</td></tr>)}
                  </tbody></table>
                ) : reportData ? (
                  <table className="attendance-table">
                    <thead>
                      {activeReport === 'trial-balance' ? (
                        <tr>
                          <th style={{ textalign: 'left' }}>Ledger Account</th>
                          <th style={{ textalign: 'left' }}>Group Name</th>
                          <th style={{ width: '150px', textAlign: 'right' }}>Debit (₹)</th>
                          <th style={{ width: '150px', textAlign: 'right' }}>Credit (₹)</th>
                        </tr>
                      ) : activeReport === 'profit-loss' ? (
                        <tr>
                          <th style={{ textalign: 'left' }}>Particulars</th>
                          <th style={{ width: '200px', textAlign: 'right' }}>Expense (₹)</th>
                          <th style={{ width: '200px', textAlign: 'right' }}>Income (₹)</th>
                        </tr>
                      ) : (
                        <tr>
                          <th style={{ textalign: 'left' }}>Particulars</th>
                          <th style={{ width: '200px', textAlign: 'right' }}>Liabilities/Equity (₹)</th>
                          <th style={{ width: '200px', textAlign: 'right' }}>Assets (₹)</th>
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {activeReport === 'trial-balance' && reportData.map((row, i) => (
                        <tr key={i}>
                          <td style={{ textalign: 'left', fontWeight: row.type === 'GROUP' ? '800' : '600' }}>{row.name}</td>
                          <td style={{ textalign: 'left' }}>{row.group_name || '-'}</td>
                          <td style={{ textAlign: 'right', color: 'var(--att-success)', fontWeight: '700' }}>
                            {row.balance > 0 ? `₹${parseFloat(row.balance).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                          </td>
                          <td style={{ textAlign: 'right', color: 'var(--att-danger)', fontWeight: '700' }}>
                            {row.balance < 0 ? `₹${parseFloat(Math.abs(row.balance)).toLocaleString('en-IN', { minimumFractionDigits: 2 })}` : '-'}
                          </td>
                        </tr>
                      ))}
                      
                      {activeReport === 'profit-loss' && (
                        <>
                          <tr>
                            <td style={{ textalign: 'left', fontWeight: '800' }}>Direct Operations</td>
                            <td style={{ textAlign: 'right', color: 'var(--att-danger)' }}>₹{(reportData.direct_expense || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td style={{ textAlign: 'right', color: 'var(--att-success)' }}>₹{(reportData.direct_income || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          </tr>
                          <tr>
                            <td style={{ textalign: 'left', fontWeight: '800' }}>Indirect Operations</td>
                            <td style={{ textAlign: 'right', color: 'var(--att-danger)' }}>₹{(reportData.indirect_expense || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td style={{ textAlign: 'right', color: 'var(--att-success)' }}>₹{(reportData.indirect_income || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          </tr>
                          <tr style={{ background: 'var(--att-card)' }}>
                            <td style={{ textalign: 'left', fontWeight: '800', color: 'var(--att-accent)' }}>Net Operating Result (Profit)</td>
                            <td colSpan="2" style={{ textAlign: 'right', fontWeight: '800', color: 'var(--att-success)' }}>
                              ₹{(reportData.net_profit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        </>
                      )}

                      {activeReport === 'balance-sheet' && (
                        <>
                          <tr>
                            <td style={{ textalign: 'left', fontWeight: '800' }}>Capital & Reserves (Equity)</td>
                            <td style={{ textAlign: 'right' }}>₹{(reportData.total_equity || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td>-</td>
                          </tr>
                          <tr>
                            <td style={{ textalign: 'left', fontWeight: '800' }}>Current & Term Liabilities</td>
                            <td style={{ textAlign: 'right' }}>₹{(reportData.total_liabilities || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            <td>-</td>
                          </tr>
                          <tr>
                            <td style={{ textalign: 'left', fontWeight: '800' }}>Total Assets (Fixed + Current)</td>
                            <td>-</td>
                            <td style={{ textAlign: 'right', color: 'var(--att-success)' }}>₹{(reportData.total_assets || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>
                ) : (
                  <div className="attendance-empty">
                    Select a statement button to compute live general ledger accounts balances.
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'controls' && (
            <div style={{ display: 'grid', gap: 16 }}>
              <div className="attendance-card" style={{ padding: 18, border: '1px solid var(--att-border)', borderRadius: 8 }}>
                <h2 style={{ fontSize: 14, marginTop: 0 }}>Book Integrity Audit</h2>
                <div className="attendance-form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  <div><small>CONTROL STATUS</small><strong style={{ display: 'block', color: controlAudit?.status === 'PASS' ? 'var(--att-success)' : 'var(--att-danger)' }}>{controlAudit?.status || 'LOADING'}</strong></div>
                  <div><small>POSTED VOUCHERS CHECKED</small><strong style={{ display: 'block' }}>{controlAudit?.posted_vouchers_checked || 0}</strong></div>
                  <div><small>ISSUES</small><strong style={{ display: 'block' }}>{controlAudit?.issue_count || 0}</strong></div>
                </div>
                {controlAudit?.unbalanced_vouchers?.length > 0 && <div className="attendance-empty" style={{ color: 'var(--att-danger)', marginTop: 12 }}>{controlAudit.unbalanced_vouchers.length} unbalanced posted vouchers require investigation.</div>}
              </div>

              <div className="attendance-card" style={{ padding: 18, border: '1px solid var(--att-border)', borderRadius: 8 }}>
                <h2 style={{ fontSize: 14, marginTop: 0 }}>Maker–Checker Voucher Queue</h2>
                <div className="attendance-table-wrapper"><table className="attendance-table"><thead><tr><th>Date</th><th>Voucher</th><th>Maker</th><th style={{ textAlign: 'right' }}>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>
                  {workflowVouchers.filter(row => ['SUBMITTED', 'POSTED'].includes(row.status)).map(row => <tr key={row.id}><td>{row.voucher_date}</td><td>{row.voucher_no}</td><td>{row.created_by}</td><td style={{ textAlign: 'right' }}>₹{Number(row.total_debit).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td>{row.status}</td><td style={{ display: 'flex', gap: 5 }}>{row.status === 'SUBMITTED' ? <><button className="attendance-btn attendance-btn-primary" onClick={() => decideVoucher(row, 'approve')}>Approve</button><button className="attendance-btn attendance-btn-secondary" onClick={() => decideVoucher(row, 'reject')}>Reject</button></> : <button className="attendance-btn attendance-btn-secondary" onClick={() => reverseVoucher(row)}>Reverse</button>}</td></tr>)}
                  {!workflowVouchers.length && <tr><td colSpan="6" className="attendance-empty">No vouchers found.</td></tr>}
                </tbody></table></div>
              </div>

              <div className="attendance-card" style={{ padding: 18, border: '1px solid var(--att-border)', borderRadius: 8 }}>
                <h2 style={{ fontSize: 14, marginTop: 0 }}>Financial Year Locking</h2>
                <form onSubmit={createFinancialYear} className="attendance-form-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr auto', alignItems: 'end', marginBottom: 12 }}>
                  <div className="attendance-form-group"><label>Year Name</label><input className="attendance-input" value={yearForm.year_name} onChange={event => setYearForm(current => ({ ...current, year_name: event.target.value }))} placeholder="FY-2026-27" required /></div>
                  <div className="attendance-form-group"><label>Start Date</label><input type="date" className="attendance-input" value={yearForm.start_date} onChange={event => setYearForm(current => ({ ...current, start_date: event.target.value }))} required /></div>
                  <div className="attendance-form-group"><label>End Date</label><input type="date" className="attendance-input" value={yearForm.end_date} onChange={event => setYearForm(current => ({ ...current, end_date: event.target.value }))} required /></div>
                  <button className="attendance-btn attendance-btn-primary"><Plus size={14} /> Create</button>
                </form>
                <div className="attendance-table-wrapper"><table className="attendance-table"><thead><tr><th>Financial Year</th><th>Start</th><th>End</th><th>Status</th><th>Action</th></tr></thead><tbody>
                  {financialYears.map(year => <tr key={year.id}><td>{year.year_name}</td><td>{year.start_date}</td><td>{year.end_date}</td><td>{year.is_locked ? 'LOCKED' : 'OPEN'}</td><td><button className="attendance-btn attendance-btn-secondary" onClick={() => toggleYearLock(year)}>{year.is_locked ? <Unlock size={14} /> : <Lock size={14} />} {year.is_locked ? 'Unlock' : 'Lock'}</button></td></tr>)}
                  {!financialYears.length && <tr><td colSpan="5" className="attendance-empty">No financial years configured.</td></tr>}
                </tbody></table></div>
              </div>
            </div>
          )}

          {activeTab === 'integration' && (
            <div style={{ display: 'grid', gap: 16 }}>
              <div className="attendance-card" style={{ padding: 18, border: '1px solid var(--att-border)', borderRadius: 8 }}>
                <h2 style={{ fontSize: 14, marginTop: 0 }}>Bank Statement Reconciliation</h2>
                <form onSubmit={importBankStatement} className="attendance-form-grid" style={{ gridTemplateColumns: '1fr 150px 1fr auto auto auto auto', alignItems: 'end', marginBottom: 14 }}>
                  <div className="attendance-form-group"><label>Bank Ledger</label><select className="attendance-select" value={bankLedgerId} onChange={event => { setBankLedgerId(event.target.value); loadBankStatements(event.target.value); }} required><option value="">Select bank account</option>{ledgers.filter(row => row.group_name === 'Bank Accounts').map(row => <option key={row.id} value={row.id}>{row.ledger_name}</option>)}</select></div>
                  <div className="attendance-form-group"><label>Status</label><select className="attendance-select" value={bankMatchFilter} onChange={event => { setBankMatchFilter(event.target.value); loadBankStatements(bankLedgerId, event.target.value); }}><option value="ALL">All Entries</option><option value="MATCHED">Matched</option><option value="UNMATCHED">Unmatched</option></select></div>
                  <div className="attendance-form-group"><label>PDF / CSV / Excel Statement</label><input className="attendance-input" type="file" accept=".pdf,.csv,.xlsx,.xls" onChange={event => setBankFile(event.target.files?.[0] || null)} required /></div>
                  <button className="attendance-btn attendance-btn-primary" type="submit">Import</button>
                  <button className="attendance-btn attendance-btn-secondary" type="button" onClick={autoMatchBank}>Auto Match</button>
                  <button className="attendance-btn attendance-btn-secondary" type="button" onClick={exportBankReconciliationPdf}><Download size={14} /> Export PDF</button>
                  <button className="attendance-btn attendance-btn-danger" type="button" onClick={rollbackLastBankPdf}>Rollback Last PDF</button>
                </form>
                <div className="attendance-table-wrapper"><table className="attendance-table"><thead><tr><th>Date</th><th>Reference</th><th style={{ textAlign: 'right' }}>Debit</th><th style={{ textAlign: 'right' }}>Credit</th><th>Status</th><th>Remarks</th></tr></thead><tbody>
                  {bankStatements.map(row => <tr key={row.id}><td>{row.statement_date}</td><td>{row.reference_no || '—'}</td><td style={{ textAlign: 'right' }}>₹{Number(row.debit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td style={{ textAlign: 'right' }}>₹{Number(row.credit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td><td>{row.is_matched ? 'MATCHED' : 'UNMATCHED'}</td><td>{row.remarks || '—'}</td></tr>)}
                  {!bankStatements.length && <tr><td colSpan="6" className="attendance-empty">Select a bank ledger to view statement entries.</td></tr>}
                </tbody></table></div>
              </div>

              <div className="attendance-card" style={{ padding: 18, border: '1px solid var(--att-border)', borderRadius: 8 }}>
                <h2 style={{ fontSize: 14, marginTop: 0 }}>Period-end Forex Revaluation</h2>
                <form onSubmit={runForexRevaluation} className="attendance-form-grid" style={{ gridTemplateColumns: '220px 1fr auto', alignItems: 'end' }}>
                  <div className="attendance-form-group"><label>As-of Date</label><input className="attendance-input" type="date" value={forexDate} onChange={event => setForexDate(event.target.value)} required /></div>
                  <div className="attendance-form-group"><label>Closing Rates</label><input className="attendance-input" value={forexRates} onChange={event => setForexRates(event.target.value)} placeholder="USD: 83.50, EUR: 90.25" required /></div>
                  <button className="attendance-btn attendance-btn-primary">Post Revaluation</button>
                </form>
                <p style={{ marginBottom: 0, color: 'var(--att-muted)', fontSize: 11 }}>The previous active revaluation is reversed automatically before the new period entry is posted.</p>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* DRILLDOWN MODAL */}
      {isDrillOpen && (
        <div className="attendance-modal-overlay">
          <div className="attendance-modal-content" style={{ maxWidth: '1100px', width: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="attendance-modal-header" style={{ padding: '16px 24px', borderBottom: '1px solid var(--att-border)' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '800' }}>{drillTitle}</h2>
                <div style={{ fontSize: '10px', color: 'var(--att-muted)', marginTop: '4px' }}>{drillMeta}</div>
              </div>
              <button className="attendance-modal-close-btn" onClick={() => setIsDrillOpen(false)} aria-label="Close modal">
                <X size={20} />
              </button>
            </div>

            <div className="attendance-modal-body" style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              {isDrillLoading ? (
                <div className="attendance-empty">Loading ledger balances and transaction lines...</div>
              ) : (
                <div>
                  <div className="tally-drill-tabs" role="tablist" aria-label={`${drillTitle} details`}>
                    <button
                      type="button"
                      className={`tally-drill-tab${drillTab === 'ledger' ? ' active' : ''}`}
                      role="tab"
                      aria-selected={drillTab === 'ledger'}
                      aria-controls="tally-ledger-panel"
                      onClick={() => setDrillTab('ledger')}
                    >
                      Ledger Summary <span>{drillData.ledger_summary.length}</span>
                    </button>
                    <button
                      type="button"
                      className={`tally-drill-tab${drillTab === 'vouchers' ? ' active' : ''}`}
                      role="tab"
                      aria-selected={drillTab === 'vouchers'}
                      aria-controls="tally-vouchers-panel"
                      onClick={() => setDrillTab('vouchers')}
                    >
                      Posted Voucher Details <span>{drillData.transactions.length}</span>
                    </button>
                  </div>

                  {drillTab === 'ledger' && (
                    <div id="tally-ledger-panel" role="tabpanel" className="attendance-table-wrapper tally-drill-panel">
                      <table className="attendance-table">
                        <thead>
                          <tr>
                            <th style={{ textAlign: 'left' }}>Ledger</th>
                            <th style={{ textAlign: 'left' }}>Group</th>
                            <th style={{ textAlign: 'right' }}>Opening</th>
                            <th style={{ textAlign: 'right' }}>Debit</th>
                            <th style={{ textAlign: 'right' }}>Credit</th>
                            <th style={{ textAlign: 'right' }}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {drillData.ledger_summary.map((row, i) => (
                            <tr key={i}>
                              <td style={{ textAlign: 'left', fontWeight: '700' }}>{row.ledger_name}</td>
                              <td style={{ textAlign: 'left' }}>{row.group_name}</td>
                              <td style={{ textAlign: 'right' }}>₹{parseFloat(row.opening || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td style={{ textAlign: 'right', color: 'var(--att-success)' }}>₹{parseFloat(row.debit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td style={{ textAlign: 'right', color: 'var(--att-danger)' }}>₹{parseFloat(row.credit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td style={{ textAlign: 'right', fontWeight: '800' }}>₹{parseFloat(row.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                            </tr>
                          ))}
                          {!drillData.ledger_summary.length && <tr><td colSpan="6" className="attendance-empty">No ledger summary available.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {drillTab === 'vouchers' && (
                    <div id="tally-vouchers-panel" role="tabpanel" className="attendance-table-wrapper tally-drill-panel">
                      <table className="attendance-table">
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th style={{ textAlign: 'left' }}>Voucher No</th>
                            <th>Type</th>
                            <th style={{ textAlign: 'left' }}>Ledger</th>
                            <th style={{ textAlign: 'left' }}>Group</th>
                            <th style={{ textAlign: 'right' }}>Debit</th>
                            <th style={{ textAlign: 'right' }}>Credit</th>
                            <th style={{ textAlign: 'right' }}>Impact</th>
                            <th style={{ textAlign: 'left' }}>Remarks</th>
                          </tr>
                        </thead>
                        <tbody>
                          {drillData.transactions.map((row, i) => (
                            <tr key={i}>
                              <td>{row.date}</td>
                              <td style={{ textAlign: 'left', fontWeight: '700' }}>{row.voucher_no}</td>
                              <td>{row.voucher_type}</td>
                              <td style={{ textAlign: 'left' }}>{row.ledger_name}</td>
                              <td style={{ textAlign: 'left' }}>{row.group_name}</td>
                              <td style={{ textAlign: 'right' }}>₹{parseFloat(row.debit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td style={{ textAlign: 'right' }}>₹{parseFloat(row.credit || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td style={{ textAlign: 'right', fontWeight: '800' }}>₹{parseFloat(row.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                              <td style={{ textAlign: 'left' }}>{row.remarks}</td>
                            </tr>
                          ))}
                          {!drillData.transactions.length && <tr><td colSpan="9" className="attendance-empty">No posted voucher details available.</td></tr>}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="attendance-modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid var(--att-border)' }}>
              <button type="button" className="attendance-btn attendance-btn-secondary" onClick={() => setIsDrillOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
