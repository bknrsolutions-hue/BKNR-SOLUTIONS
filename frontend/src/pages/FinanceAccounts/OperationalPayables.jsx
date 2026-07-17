import { useCallback, useEffect, useMemo, useState } from 'react';
import { CreditCard, FileText, History, RefreshCw, RotateCcw, X } from 'lucide-react';
import '../Attendance/Attendance.css';
import './NativeFinanceRegisters.css';

const currentMonth = new Date().toISOString().slice(0, 7);
const today = new Date().toISOString().slice(0, 10);

const CONFIG = {
  contractor: {
    title: 'Contractor Bills', endpoint: '/api/contractor_bills/data',
    columns: [['contractor_name', 'Contractor'], ['grand_total', 'Bill Total'], ['paid_amount', 'Paid'], ['total_outstanding', 'Outstanding'], ['overall_payment_status', 'Status']],
  },
  salary: {
    title: 'Salaries', endpoint: '/api/salaries/data',
    columns: [['employee_id', 'Employee ID'], ['employee_name', 'Employee'], ['department', 'Department'], ['net_payable', 'Net Payable'], ['paid_amount', 'Paid'], ['total_outstanding', 'Outstanding'], ['payment_status', 'Status']],
  },
  vendor: {
    title: 'Vendor Bills', endpoint: '/api/vendor_bills/data',
    columns: [['party_name', 'Vendor'], ['bill_no', 'Bill Number'], ['bill_date', 'Bill Date'], ['total_amount', 'Total'], ['paid_amount', 'Paid'], ['outstanding', 'Outstanding'], ['payment_status', 'Status']],
  },
  supplier: {
    title: 'Supplier Bills', endpoint: '/api/supplier_bills/data',
    columns: [['party_name', 'Supplier'], ['bill_no', 'Bill Number'], ['bill_date', 'Bill Date'], ['total_amount', 'Total'], ['paid_amount', 'Paid'], ['outstanding', 'Outstanding'], ['payment_status', 'Status']],
  },
  logs: {
    title: 'Payment Logs', endpoint: '/api/payment_logs/data',
    columns: [['payment_date', 'Date'], ['source_type', 'Source'], ['party_name', 'Party'], ['paid_amount', 'Amount'], ['payment_mode', 'Mode'], ['bank_cash_account', 'Bank/Cash'], ['utr_reference', 'Reference'], ['voucher_no', 'Voucher'], ['payment_status', 'Status']],
  },
};

const amount = value => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function OperationalPayables({ type }) {
  const config = CONFIG[type];
  const [month, setMonth] = useState(type === 'logs' ? '' : currentMonth);
  const [rows, setRows] = useState([]);
  const [ledgers, setLedgers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [historyRow, setHistoryRow] = useState(null);
  const [contractorTab, setContractorTab] = useState('outstanding');
  const [detailsRow, setDetailsRow] = useState(null);
  const [detailRows, setDetailRows] = useState([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [payment, setPayment] = useState({ amount: 0, payment_mode: 'BANK', payment_date: today, utr_reference: '', bank_cash_ledger_id: '', payment_purpose: 'AGAINST_OUTSTANDING', against_details: '' });

  const notify = useCallback((message, tone = 'success') => {
    setToast({ message, tone }); window.setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams();
      if (month) query.set('month', month);
      const [rowsResponse, ledgerResponse] = await Promise.all([
        fetch(`${config.endpoint}?${query}`, { credentials: 'include' }),
        fetch('/finance_accounts/ledgers', { credentials: 'include' }),
      ]);
      const payload = await rowsResponse.json(); const ledgerPayload = await ledgerResponse.json();
      if (!rowsResponse.ok || !payload.success) throw new Error(payload.message || 'Unable to load records.');
      setRows(payload.rows || []);
      if (ledgerPayload.success) setLedgers((ledgerPayload.data || []).filter(row => ['BANK ACCOUNTS', 'CASH-IN-HAND', 'BANK', 'CASH'].some(group => String(row.group_name || '').toUpperCase().includes(group))));
    } catch (error) { notify(error.message, 'error'); }
    finally { setLoading(false); }
  }, [config.endpoint, month, notify]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const outstandingFor = row => Number(type === 'contractor' ? row.current_outstanding : (row.total_outstanding ?? row.outstanding ?? 0));
  const beginPayment = row => { const outstanding = outstandingFor(row); setSelected(row); setPayment(current => ({ ...current, amount: outstanding, payment_purpose: 'AGAINST_OUTSTANDING', against_details: row.bill_no || row.bill_key || '' })); };

  const paymentRequest = () => {
    if (type === 'contractor') return { url: `/api/contractor_bills/payment?contractor=${encodeURIComponent(selected.contractor_name)}&month=${encodeURIComponent(month)}`, body: { ...payment, bill_total: Number(selected.grand_total || 0) } };
    if (type === 'salary') return { url: `/api/salaries/payment/${selected.id}`, body: payment };
    return {
      url: `/api/${type}_bills/payment`,
      body: { ...payment, bill_key: selected.bill_key, party_name: selected.party_name, bill_total: Number(selected.total_amount || 0) },
    };
  };

  const postPayment = async event => {
    event.preventDefault();
    if (!window.confirm(`Post payment of ₹${amount(payment.amount)}?`)) return;
    try {
      const request = paymentRequest();
      const response = await fetch(request.url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...request.body, bank_cash_ledger_id: Number(payment.bank_cash_ledger_id) }) });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || 'Payment posting failed.');
      notify(payload.message || 'Payment posted.'); setSelected(null); await load();
    } catch (error) { notify(error.message, 'error'); }
  };

  const cancelLog = async row => {
    if (!window.confirm(`Cancel payment voucher ${row.voucher_no || ''}?`)) return;
    try {
      const response = await fetch(`/api/payment_logs/cancel/${row.source_type}/${row.payment_id}`, { method: 'POST', credentials: 'include' });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || 'Cancellation failed.');
      notify(payload.message || 'Payment cancelled.'); await load();
    } catch (error) { notify(error.message, 'error'); }
  };

  const numericKeys = useMemo(() => new Set(['grand_total', 'net_payable', 'total_amount', 'paid_amount', 'outstanding', 'total_outstanding']), []);
  const contractorRows = useMemo(() => type !== 'contractor' || contractorTab === 'all' ? rows : rows.filter(row => Number(row.total_outstanding || 0) > 0.01), [contractorTab, rows, type]);
  const contractorTotals = useMemo(() => rows.reduce((totals, row) => ({
    grand: totals.grand + Number(row.grand_total || 0),
    paid: totals.paid + Number(row.paid_amount || 0),
    month: totals.month + Number(row.current_outstanding || 0),
    earlier: totals.earlier + Number(row.previous_outstanding || 0),
    due: totals.due + Number(row.total_outstanding || 0),
  }), { grand: 0, paid: 0, month: 0, earlier: 0, due: 0 }), [rows]);
  const financialYear = month ? (Number(month.slice(5, 7)) >= 4 ? Number(month.slice(0, 4)) : Number(month.slice(0, 4)) - 1) : new Date().getFullYear();
  const setFinancialYear = year => setMonth(`${year}-04`);
  const openContractorBill = (billType, row) => window.open(`/api/contractor_bills/bill/${billType}?month=${encodeURIComponent(month)}&contractor=${encodeURIComponent(row.contractor_name)}`, '_blank', 'noopener,noreferrer');
  const resetContractorFilters = () => { setMonth(currentMonth); setContractorTab('outstanding'); };
  const isBillsTemplate = ['contractor', 'salary', 'vendor', 'supplier'].includes(type);
  const visibleRows = useMemo(() => {
    if (type === 'contractor') return contractorRows;
    if (contractorTab === 'all') return rows;
    if (type === 'salary') return rows.filter(row => Number(row.total_outstanding || 0) > .01);
    if (type === 'vendor' || type === 'supplier') return rows.filter(row => Number(row.outstanding || 0) > .01);
    return rows;
  }, [contractorRows, contractorTab, rows, type]);
  const salaryTotals = useMemo(() => rows.reduce((totals, row) => ({
    net: totals.net + Number(row.net_payable || 0), paid: totals.paid + Number(row.paid_amount || 0),
    month: totals.month + Number(row.outstanding || 0), previous: totals.previous + Number(row.previous_outstanding || 0),
    due: totals.due + Number(row.total_outstanding || 0),
  }), { net: 0, paid: 0, month: 0, previous: 0, due: 0 }), [rows]);
  const payableTotals = useMemo(() => rows.reduce((totals, row) => ({ total: totals.total + Number(row.total_amount || 0), paid: totals.paid + Number(row.paid_amount || 0), due: totals.due + Number(row.outstanding || 0) }), { total: 0, paid: 0, due: 0 }), [rows]);
  const paymentLogsSubtotal = useMemo(() => rows.reduce((sum, row) => sum + Number(row.paid_amount || 0), 0), [rows]);
  const openSalaryPrint = row => window.open(`/api/salaries/print/${row.id}`, '_blank', 'noopener,noreferrer');
  const openPayableDetails = async row => {
    setDetailsRow(row); setDetailRows([]); setDetailsLoading(true);
    try {
      const response = await fetch(`/api/${type}_bills/details?bill_key=${encodeURIComponent(row.bill_key)}`, { credentials: 'include' });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || 'Unable to load bill records.');
      setDetailRows(payload.rows || []);
    } catch (error) { notify(error.message, 'error'); }
    finally { setDetailsLoading(false); }
  };
  const printPayableBill = row => window.open(`/api/${type}_bills/print?bill_key=${encodeURIComponent(row.bill_key)}`, '_blank', 'noopener,noreferrer');

  return <div className="attendance-container native-finance-page">
    {toast && <div className={`attendance-toast ${toast.tone === 'error' ? 'error' : 'success'}`}>{toast.message}</div>}
    <div className="attendance-page-header"><div>{isBillsTemplate && <span className="contractor-page-kicker">{type === 'vendor' || type === 'supplier' ? 'Finance Bills' : 'Operational Bills'}</span>}<h1>{config.title}</h1><p>{isBillsTemplate ? 'Monthly bills, outstanding balances and linked account payments.' : 'Accounting register with linked voucher posting.'}</p></div><button className="attendance-btn attendance-btn-secondary" type="button" onClick={load}><RefreshCw size={14} /> Refresh</button></div>
    {type === 'contractor' && <div className="contractor-total-strip">
      <div><span>Total</span><strong>₹ {amount(contractorTotals.grand)}</strong></div><div><span>Paid</span><strong>₹ {amount(contractorTotals.paid)}</strong></div><div><span>Month Due</span><strong>₹ {amount(contractorTotals.month)}</strong></div><div><span>Earlier Due</span><strong>₹ {amount(contractorTotals.earlier)}</strong></div><div className="is-due"><span>Total Due</span><strong>₹ {amount(contractorTotals.due)}</strong></div>
    </div>}
    {type === 'salary' && <div className="contractor-total-strip">
      <div><span>Net</span><strong>₹ {amount(salaryTotals.net)}</strong></div><div><span>Paid</span><strong>₹ {amount(salaryTotals.paid)}</strong></div><div><span>Month Due</span><strong>₹ {amount(salaryTotals.month)}</strong></div><div><span>Previous Due</span><strong>₹ {amount(salaryTotals.previous)}</strong></div><div className="is-due"><span>Total Due</span><strong>₹ {amount(salaryTotals.due)}</strong></div>
    </div>}
    {(type === 'vendor' || type === 'supplier') && <div className="contractor-total-strip payable-total-strip">
      <div><span>Total</span><strong>₹ {amount(payableTotals.total)}</strong></div><div><span>Paid</span><strong>₹ {amount(payableTotals.paid)}</strong></div><div className="is-due"><span>Due</span><strong>₹ {amount(payableTotals.due)}</strong></div>
    </div>}
    <div className="attendance-filters-bar">
      {isBillsTemplate && <div className="attendance-filter-group"><label>Financial Year</label><select className="attendance-select" value={financialYear} onChange={event => setFinancialYear(Number(event.target.value))}>{[2024, 2025, 2026, 2027, 2028].map(year => <option key={year} value={year}>FY {year}-{year + 1}</option>)}</select></div>}
      <div className="attendance-filter-group"><label>Month</label><input className="attendance-input" type="month" value={month} min={isBillsTemplate ? `${financialYear}-04` : undefined} max={isBillsTemplate ? `${financialYear + 1}-03` : undefined} onChange={event => setMonth(event.target.value)} /></div>
      {isBillsTemplate && <><button className="attendance-btn attendance-btn-primary" type="button" onClick={load}><RefreshCw size={13} /> Filter</button><button className="attendance-btn attendance-btn-secondary" type="button" onClick={resetContractorFilters}><RotateCcw size={13} /> Reset</button></>}
    </div>
    {isBillsTemplate && <div className="contractor-list-meta"><strong>{visibleRows.length} {type === 'contractor' ? 'Contractors Found' : type === 'salary' ? 'Salary Records' : 'Records'}</strong><span>{month}</span></div>}
    {isBillsTemplate && <div className="contractor-tabs"><button type="button" className={contractorTab === 'outstanding' ? 'active' : ''} onClick={() => setContractorTab('outstanding')}>Outstanding</button><button type="button" className={contractorTab === 'all' ? 'active' : ''} onClick={() => setContractorTab('all')}>All Records</button></div>}
    <div className={`attendance-table-container${isBillsTemplate ? ' contractor-table-container' : ''}`}><div className="native-finance-table-title"><strong>{config.title}</strong><span>{isBillsTemplate ? visibleRows.length : rows.length} records</span></div><div className="attendance-table-wrapper">
      {type === 'contractor' ? <table className="attendance-table contractor-bills-table"><thead><tr><th>Contractor Name</th><th>Deheading Bill</th><th>Peeling Bill</th><th>Processing Bill</th><th>Grand Total</th><th>Paid Amount</th><th>Current Month Outstanding</th><th>Earlier Months Outstanding</th><th>Total Outstanding</th><th>Accounts</th></tr></thead><tbody>
        {contractorRows.map((row, index) => <tr key={row.contractor_name || index} className={row.overall_payment_status === 'PAID' ? 'contractor-row-paid' : row.overall_payment_status === 'PARTIAL' ? 'contractor-row-partial' : ''}>
          <td className="contractor-name-cell">{row.contractor_name || '—'}</td>
          {['deheading', 'peeling', 'processing'].map(billType => <td key={billType}><button type="button" disabled={Number(row[billType] || 0) === 0} className="contractor-amount-link" onClick={() => openContractorBill(billType, row)}><FileText size={12} /> ₹ {amount(row[billType])}</button></td>)}
          <td><button type="button" className="contractor-amount-link" onClick={() => beginPayment(row)}>₹ {amount(row.grand_total)}</button></td>
          <td><button type="button" disabled={!row.payment_history?.length} className="contractor-amount-link" onClick={() => setHistoryRow(row)}><History size={12} /> ₹ {amount(row.paid_amount)}</button></td>
          <td>₹ {amount(row.current_outstanding)}</td>
          <td><strong>₹ {amount(row.previous_outstanding)}</strong>{row.previous_pending_months?.map(item => <small key={item.month}>{item.month}: ₹ {amount(item.outstanding)}</small>)}</td>
          <td className="contractor-due-cell">₹ {amount(row.total_outstanding)}</td>
          <td><div className="contractor-account-actions">{Number(row.current_outstanding || 0) > .01 && <button className="attendance-btn attendance-btn-primary" type="button" onClick={() => beginPayment(row)}><CreditCard size={12} /> Pay</button>}<span className={`contractor-status ${String(row.overall_payment_status || '').toLowerCase()}`}>{row.payment_voucher_no || row.overall_payment_status || 'UNPAID'}</span></div></td>
        </tr>)}
        {!loading && !contractorRows.length && <tr><td className="attendance-empty" colSpan="10">No contractor data found for this view.</td></tr>}
        {loading && <tr><td className="attendance-empty" colSpan="10">Loading contractor bills...</td></tr>}
      </tbody></table> : type === 'salary' ? <table className="attendance-table contractor-bills-table salary-bills-table"><thead><tr><th>Employee</th><th>Department</th><th>Location</th><th>Present Days</th><th>Gross Salary</th><th>Deductions</th><th>Net Payable</th><th>Paid</th><th>Balance</th><th>Previous Month Outstanding</th><th>Total Outstanding</th><th>Accounts</th></tr></thead><tbody>
        {visibleRows.map((row, index) => <tr key={row.id || index} className={row.payment_status === 'PAID' ? 'contractor-row-paid' : row.payment_status === 'PARTIAL' ? 'contractor-row-partial' : ''}>
          <td className="contractor-name-cell">{row.employee_name || '—'}<small>{row.employee_id || ''}</small></td><td>{row.department || '—'}</td><td>{row.production_at || '—'}</td><td>{amount(row.present_days)}</td><td>₹ {amount(row.gross_salary)}</td><td>₹ {amount(row.deductions)}</td><td><button type="button" className="contractor-amount-link" onClick={() => openSalaryPrint(row)}><FileText size={12} /> ₹ {amount(row.net_payable)}</button></td><td><button type="button" disabled={!row.payment_history?.length} className="contractor-amount-link" onClick={() => setHistoryRow(row)}><History size={12} /> ₹ {amount(row.paid_amount)}</button></td><td>₹ {amount(row.outstanding)}</td><td>₹ {amount(row.previous_outstanding)}</td><td className="contractor-due-cell">₹ {amount(row.total_outstanding)}</td><td><div className="contractor-account-actions">{Number(row.outstanding || 0) > .01 && <button className="attendance-btn attendance-btn-primary" type="button" onClick={() => beginPayment(row)}><CreditCard size={12} /> Pay</button>}<span className={`contractor-status ${String(row.payment_status || '').toLowerCase()}`}>{row.payment_voucher_no || row.accounts_label || row.payment_status || 'UNPAID'}</span></div></td>
        </tr>)}
        {!loading && !visibleRows.length && <tr><td className="attendance-empty" colSpan="12">No salary records found for this view.</td></tr>}{loading && <tr><td className="attendance-empty" colSpan="12">Loading salaries...</td></tr>}
      </tbody></table> : (type === 'vendor' || type === 'supplier') ? <table className="attendance-table contractor-bills-table payable-bills-table"><thead><tr><th>Party</th><th>Bill No</th><th>Category</th><th>Bill Date</th><th>Total</th><th>Paid</th><th>Outstanding</th><th>Status</th><th>Action</th></tr></thead><tbody>
        {visibleRows.map((row, index) => <tr key={row.bill_key || index} className={row.payment_status === 'PAID' ? 'contractor-row-paid' : row.payment_status === 'PARTIAL' ? 'contractor-row-partial' : ''}>
          <td className="contractor-name-cell">{row.party_name || '—'}</td><td>{row.bill_no || '—'}<small>{row.invoice_no || ''}</small></td><td>{row.category || '—'}</td><td>{row.bill_date || '—'}</td><td>₹ {amount(row.total_amount)}</td><td><button type="button" disabled={!row.payment_history?.length} className="contractor-amount-link" onClick={() => setHistoryRow(row)}><History size={12} /> ₹ {amount(row.paid_amount)}</button></td><td><button type="button" className="contractor-amount-link" onClick={() => openPayableDetails(row)}>₹ {amount(row.outstanding)}</button></td><td><span className={`contractor-status ${String(row.payment_status || '').toLowerCase()}`}>{row.payment_status || 'UNPAID'}</span></td><td><div className="contractor-account-actions"><button className="attendance-btn attendance-btn-secondary" type="button" onClick={() => printPayableBill(row)}><FileText size={12} /> Print</button>{(type === 'supplier' || Number(row.outstanding || 0) > .01) && <button className="attendance-btn attendance-btn-primary" type="button" onClick={() => beginPayment(row)}><CreditCard size={12} /> Pay</button>}</div></td>
        </tr>)}
        {!loading && !visibleRows.length && <tr><td className="attendance-empty" colSpan="9">No records found for this view.</td></tr>}{loading && <tr><td className="attendance-empty" colSpan="9">Loading bills...</td></tr>}
      </tbody></table> : <table className="attendance-table"><thead><tr>{config.columns.map(([, label]) => <th key={label}>{label}</th>)}<th>Action</th></tr></thead><tbody>
        {rows.map((row, index) => <tr key={row.id || row.payment_id || row.bill_key || `${index}`}>{config.columns.map(([key]) => <td key={key}>{numericKeys.has(key) ? `₹${amount(row[key])}` : (row[key] ?? '—')}</td>)}<td>{type === 'logs' ? (!row.is_cancelled && <button className="attendance-btn attendance-btn-danger" type="button" onClick={() => cancelLog(row)}><X size={13} /> Cancel</button>) : (outstandingFor(row) > 0 && <button className="attendance-btn attendance-btn-primary" type="button" onClick={() => beginPayment(row)}><CreditCard size={13} /> Pay</button>)}</td></tr>)}
        {!loading && !rows.length && <tr><td className="attendance-empty" colSpan={config.columns.length + 1}>No records available.</td></tr>}{loading && <tr><td className="attendance-empty" colSpan={config.columns.length + 1}>Loading...</td></tr>}
      </tbody>{type === 'logs' && !loading && rows.length > 0 && <tfoot><tr className="payment-logs-subtotal"><td colSpan="3">Sub Total</td><td>₹{amount(paymentLogsSubtotal)}</td><td colSpan="6" /></tr></tfoot>}</table>}
    </div></div>
    {selected && <div className="attendance-modal-overlay"><form className="attendance-modal native-payment-modal" onSubmit={postPayment}><div className="attendance-modal-header"><h3>Post Payment</h3><button type="button" onClick={() => setSelected(null)}><X size={17} /></button></div><div className="native-payment-summary"><span>{selected.contractor_name || selected.employee_name || selected.party_name}</span><strong>Outstanding ₹{amount(outstandingFor(selected))}</strong></div><div className="native-finance-fields">
      <label><span>Amount *</span><input className="attendance-input" required min="0.01" max={type === 'supplier' ? undefined : outstandingFor(selected)} step="0.01" type="number" value={payment.amount} onChange={event => setPayment(current => ({ ...current, amount: Number(event.target.value) }))} /></label>
      <label><span>Payment Date *</span><input className="attendance-input" required type="date" value={payment.payment_date} onChange={event => setPayment(current => ({ ...current, payment_date: event.target.value }))} /></label>
      <label><span>Mode *</span><select className="attendance-select" value={payment.payment_mode} onChange={event => setPayment(current => ({ ...current, payment_mode: event.target.value }))}><option>BANK</option><option>CASH</option><option>UPI</option><option>NEFT</option><option>RTGS</option></select></label>
      <label><span>Bank/Cash Ledger *</span><select className="attendance-select" required value={payment.bank_cash_ledger_id} onChange={event => setPayment(current => ({ ...current, bank_cash_ledger_id: event.target.value }))}><option value="">Select ledger</option>{ledgers.map(row => <option value={row.id} key={row.id}>{row.ledger_name}</option>)}</select></label>
      {(type === 'vendor' || type === 'supplier') && <label><span>Payment Purpose</span><select className="attendance-select" value={payment.payment_purpose} onChange={event => setPayment(current => ({ ...current, payment_purpose: event.target.value }))}><option value="AGAINST_OUTSTANDING">Against Outstanding</option><option value="AGAINST_BATCH">Against Batch</option><option value="ADVANCE_PAYMENT">Advance Payment</option></select></label>}
      {(type === 'vendor' || type === 'supplier') && <label className="native-finance-wide"><span>Against Details</span><input className="attendance-input" value={payment.against_details} onChange={event => setPayment(current => ({ ...current, against_details: event.target.value }))} /></label>}
      <label className="native-finance-wide"><span>UTR / Reference</span><input className="attendance-input" value={payment.utr_reference} onChange={event => setPayment(current => ({ ...current, utr_reference: event.target.value }))} /></label>
    </div><div className="native-finance-form-actions">{type === 'salary' && <button className="attendance-btn attendance-btn-secondary" type="button" onClick={() => openSalaryPrint(selected)}><FileText size={14} /> Print</button>}<button className="attendance-btn attendance-btn-primary" type="submit"><CreditCard size={14} /> Post Payment</button><button className="attendance-btn attendance-btn-secondary" type="button" onClick={() => setSelected(null)}>Close</button></div></form></div>}
    {historyRow && <div className="attendance-modal-overlay"><div className="attendance-modal native-payment-modal"><div className="attendance-modal-header"><div><h3>{historyRow.contractor_name || historyRow.employee_name || historyRow.party_name || 'Payment History'}</h3><p>Payment History • {historyRow.bill_no || month}</p></div><button type="button" onClick={() => setHistoryRow(null)}><X size={17} /></button></div><div className="attendance-table-wrapper"><table className="attendance-table contractor-history-table"><thead><tr><th>Date</th>{(type === 'vendor' || type === 'supplier') && <><th>Purpose</th><th>Against</th></>}<th>Amount</th><th>Mode</th><th>Account</th><th>UTR / Ref</th>{type !== 'vendor' && type !== 'supplier' && <th>Voucher</th>}<th>Status</th></tr></thead><tbody>{(historyRow.payment_history || []).map((item, index) => <tr key={`${item.voucher_no || item.date}-${index}`}><td>{item.date || '—'}</td>{(type === 'vendor' || type === 'supplier') && <><td>{item.purpose || '—'}</td><td>{item.against || '—'}</td></>}<td>₹ {amount(item.amount)}</td><td>{item.mode || '—'}</td><td>{item.account || '—'}</td><td>{item.utr || '—'}</td>{type !== 'vendor' && type !== 'supplier' && <td>{item.voucher_no || '—'}</td>}<td><span className={`contractor-status ${String(item.status || '').toLowerCase()}`}>{item.status || '—'}</span></td></tr>)}</tbody></table></div></div></div>}
    {detailsRow && <div className="attendance-modal-overlay"><div className="attendance-modal native-payment-modal payable-details-modal"><div className="attendance-modal-header"><div><h3>{detailsRow.party_name} — Bill Wise Records</h3><p>{detailsRow.bill_no} • Outstanding ₹ {amount(detailsRow.outstanding)}</p></div><button type="button" onClick={() => setDetailsRow(null)}><X size={17} /></button></div><div className="attendance-table-wrapper"><table className="attendance-table contractor-history-table payable-details-table"><thead><tr><th>Date</th><th>Bill / Batch</th><th>Invoice</th><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>{detailRows.map((item, index) => <tr key={`${item.bill_no}-${index}`}><td>{item.date || '—'}</td><td>{item.bill_no || '—'}</td><td>{item.invoice_no || '—'}</td><td>{item.description || '—'}</td><td>{amount(item.qty)}</td><td>₹ {amount(item.rate)}</td><td>₹ {amount(item.amount)}</td></tr>)}{!detailsLoading && !detailRows.length && <tr><td className="attendance-empty" colSpan="7">No bill records found.</td></tr>}{detailsLoading && <tr><td className="attendance-empty" colSpan="7">Loading bill records...</td></tr>}</tbody></table></div><div className="native-finance-form-actions"><button className="attendance-btn attendance-btn-secondary" type="button" onClick={() => printPayableBill(detailsRow)}><FileText size={14} /> Print</button>{(type === 'supplier' || Number(detailsRow.outstanding || 0) > .01) && <button className="attendance-btn attendance-btn-primary" type="button" onClick={() => { setDetailsRow(null); beginPayment(detailsRow); }}><CreditCard size={14} /> Pay Payment</button>}</div></div></div>}
  </div>;
}

export const ContractorBillsPage = () => <OperationalPayables type="contractor" />;
export const SalaryBillsPage = () => <OperationalPayables type="salary" />;
export const VendorBillsPage = () => <OperationalPayables type="vendor" />;
export const SupplierBillsPage = () => <OperationalPayables type="supplier" />;
export const PaymentLogsPage = () => <OperationalPayables type="logs" />;
