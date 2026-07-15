import { useCallback, useEffect, useMemo, useState } from 'react';
import { CreditCard, RefreshCw, X } from 'lucide-react';
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
    title: 'Salary Payments', endpoint: '/api/salaries/data',
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
  const [toast, setToast] = useState(null);
  const [payment, setPayment] = useState({ amount: 0, payment_mode: 'BANK', payment_date: today, utr_reference: '', bank_cash_ledger_id: '' });

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

  const outstandingFor = row => Number(row.total_outstanding ?? row.outstanding ?? 0);
  const beginPayment = row => { const outstanding = outstandingFor(row); setSelected(row); setPayment(current => ({ ...current, amount: outstanding })); };

  const paymentRequest = () => {
    if (type === 'contractor') return { url: `/api/contractor_bills/payment?contractor=${encodeURIComponent(selected.contractor_name)}&month=${encodeURIComponent(month)}`, body: { ...payment, bill_total: Number(selected.grand_total || 0) } };
    if (type === 'salary') return { url: `/api/salaries/payment/${selected.id}`, body: payment };
    return {
      url: `/api/${type}_bills/payment`,
      body: { ...payment, bill_key: selected.bill_key, party_name: selected.party_name, bill_total: Number(selected.total_amount || 0), payment_purpose: 'AGAINST_OUTSTANDING', against_details: selected.bill_no || '' },
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

  return <div className="attendance-container native-finance-page">
    {toast && <div className={`attendance-toast ${toast.tone === 'error' ? 'error' : 'success'}`}>{toast.message}</div>}
    <div className="attendance-page-header"><div><h1>{config.title}</h1><p>Native React accounting view with linked voucher posting.</p></div><button className="attendance-btn attendance-btn-secondary" type="button" onClick={load}><RefreshCw size={14} /> Refresh</button></div>
    <div className="attendance-filters-bar"><div className="attendance-filter-group"><label>Month</label><input className="attendance-input" type="month" value={month} onChange={event => setMonth(event.target.value)} /></div></div>
    <div className="attendance-table-container"><div className="native-finance-table-title"><strong>{config.title}</strong><span>{rows.length} records</span></div><div className="attendance-table-wrapper"><table className="attendance-table"><thead><tr>{config.columns.map(([, label]) => <th key={label}>{label}</th>)}<th>Action</th></tr></thead><tbody>
      {rows.map((row, index) => <tr key={row.id || row.payment_id || row.bill_key || `${index}`}>
        {config.columns.map(([key]) => <td key={key}>{numericKeys.has(key) ? `₹${amount(row[key])}` : (row[key] ?? '—')}</td>)}
        <td>{type === 'logs' ? (!row.is_cancelled && <button className="attendance-btn attendance-btn-danger" type="button" onClick={() => cancelLog(row)}><X size={13} /> Cancel</button>) : (outstandingFor(row) > 0 && <button className="attendance-btn attendance-btn-primary" type="button" onClick={() => beginPayment(row)}><CreditCard size={13} /> Pay</button>)}</td>
      </tr>)}
      {!loading && !rows.length && <tr><td className="attendance-empty" colSpan={config.columns.length + 1}>No records available.</td></tr>}
      {loading && <tr><td className="attendance-empty" colSpan={config.columns.length + 1}>Loading...</td></tr>}
    </tbody></table></div></div>
    {selected && <div className="attendance-modal-overlay"><form className="attendance-modal native-payment-modal" onSubmit={postPayment}><div className="attendance-modal-header"><h3>Post Payment</h3><button type="button" onClick={() => setSelected(null)}><X size={17} /></button></div><div className="native-payment-summary"><span>{selected.contractor_name || selected.employee_name || selected.party_name}</span><strong>Outstanding ₹{amount(outstandingFor(selected))}</strong></div><div className="native-finance-fields">
      <label><span>Amount *</span><input className="attendance-input" required min="0.01" max={outstandingFor(selected)} step="0.01" type="number" value={payment.amount} onChange={event => setPayment(current => ({ ...current, amount: Number(event.target.value) }))} /></label>
      <label><span>Payment Date *</span><input className="attendance-input" required type="date" value={payment.payment_date} onChange={event => setPayment(current => ({ ...current, payment_date: event.target.value }))} /></label>
      <label><span>Mode *</span><select className="attendance-select" value={payment.payment_mode} onChange={event => setPayment(current => ({ ...current, payment_mode: event.target.value }))}><option>BANK</option><option>CASH</option><option>UPI</option><option>NEFT</option><option>RTGS</option></select></label>
      <label><span>Bank/Cash Ledger *</span><select className="attendance-select" required value={payment.bank_cash_ledger_id} onChange={event => setPayment(current => ({ ...current, bank_cash_ledger_id: event.target.value }))}><option value="">Select ledger</option>{ledgers.map(row => <option value={row.id} key={row.id}>{row.ledger_name}</option>)}</select></label>
      <label className="native-finance-wide"><span>UTR / Reference</span><input className="attendance-input" value={payment.utr_reference} onChange={event => setPayment(current => ({ ...current, utr_reference: event.target.value }))} /></label>
    </div><div className="native-finance-form-actions"><button className="attendance-btn attendance-btn-primary" type="submit"><CreditCard size={14} /> Post Payment</button><button className="attendance-btn attendance-btn-secondary" type="button" onClick={() => setSelected(null)}>Close</button></div></form></div>}
  </div>;
}

export const ContractorBillsPage = () => <OperationalPayables type="contractor" />;
export const SalaryBillsPage = () => <OperationalPayables type="salary" />;
export const VendorBillsPage = () => <OperationalPayables type="vendor" />;
export const SupplierBillsPage = () => <OperationalPayables type="supplier" />;
export const PaymentLogsPage = () => <OperationalPayables type="logs" />;
