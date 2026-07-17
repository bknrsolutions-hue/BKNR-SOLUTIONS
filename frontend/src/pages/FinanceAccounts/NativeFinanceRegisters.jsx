import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, RefreshCw, Save, Trash2, Upload, X } from 'lucide-react';
import '../Attendance/Attendance.css';
import './NativeFinanceRegisters.css';

const today = new Date().toISOString().slice(0, 10);
const month = today.slice(0, 7);

const MODULES = {
  bank_master: {
    title: 'Bank Master', description: 'Maintain company bank, cash and export collection accounts.',
    save: '/finance_accounts/bank_master/save', remove: '/finance_accounts/bank_master/delete',
    fields: [
      ['bank_name', 'Bank Name', 'text', '', true], ['account_number', 'Account Number', 'text', '', true],
      ['branch', 'Branch'], ['ifsc_code', 'IFSC Code'], ['swift_code', 'SWIFT Code'],
      ['account_type', 'Account Type', 'select', 'CURRENT', true, ['CURRENT', 'SAVINGS', 'OD', 'CC']],
      ['currency_code', 'Currency', 'select', 'INR', true, ['INR', 'USD', 'EUR', 'GBP', 'JPY', 'AED']],
      ['opening_balance', 'Opening Balance', 'number', 0], ['account_ledger_id', 'Linked Ledger', 'ledger'],
      ['is_export_account', 'Export Account', 'checkbox', false], ['is_eefc_account', 'EEFC Account', 'checkbox', false],
      ['is_default', 'Default Account', 'checkbox', false], ['remarks', 'Remarks', 'textarea'],
    ],
    columns: [['bank_name', 'Bank'], ['account_number', 'Account Number'], ['branch', 'Branch'], ['currency_code', 'Currency'], ['account_type', 'Type'], ['opening_balance', 'Opening Balance']],
  },
  item_accounting_link: {
    title: 'Item Accounting Link', description: 'Map reusable inventory items to purchase, sales, inventory, COGS and WIP ledgers.',
    save: '/finance_accounts/item_accounting_link/save', remove: '/finance_accounts/item_accounting_link/delete',
    fields: [
      ['item_name', 'Item Name', 'text', '', true], ['species', 'Species'],
      ['item_type', 'Item Type', 'select', 'FINISHED_GOOD', true, ['RAW_MATERIAL', 'WIP', 'FINISHED_GOOD', 'PACKING_MATERIAL', 'CHEMICAL', 'SERVICE']],
      ['hsn_code', 'HSN Code'], ['default_gst_percent', 'Default GST %', 'number', 0],
      ['purchase_account_id', 'Purchase Account', 'ledger'], ['sales_account_id', 'Sales Account', 'ledger'],
      ['inventory_account_id', 'Inventory Account', 'ledger'], ['cogs_account_id', 'COGS Account', 'ledger'], ['wip_account_id', 'WIP Account', 'ledger'],
    ],
    columns: [['item_name', 'Item'], ['species', 'Species'], ['item_type', 'Type'], ['hsn_code', 'HSN'], ['default_gst_percent', 'GST %']],
  },
  export_incentive_register: {
    title: 'Export Incentive Register', description: 'Track RoDTEP, duty drawback and other export incentive receivables.',
    save: '/finance_accounts/export_incentive_register/save', remove: '/finance_accounts/export_incentive_register/delete',
    fields: [
      ['incentive_type', 'Incentive Type', 'select', 'RODTEP', true, ['RODTEP', 'DUTY_DRAWBACK', 'MEIS', 'OTHER']],
      ['invoice_no', 'Invoice Number', 'text', '', true], ['shipping_bill_no', 'Shipping Bill Number'],
      ['shipping_bill_date', 'Shipping Bill Date', 'date'], ['port', 'Port'], ['fob_value_inr', 'FOB Value INR', 'number', 0, true],
      ['rate_percent', 'Rate %', 'number', 0, true], ['incentive_amount', 'Incentive Amount', 'number', 0, true],
      ['scrip_no', 'Scrip Number'], ['scrip_value', 'Scrip Value', 'number', 0],
      ['status', 'Status', 'select', 'PENDING', true, ['PENDING', 'APPLIED', 'SANCTIONED', 'RECEIVED', 'UTILIZED', 'EXPIRED']],
      ['sanction_date', 'Sanction Date', 'date'], ['utilization_date', 'Utilization Date', 'date'], ['expiry_date', 'Expiry Date', 'date'],
      ['receivable_ledger_id', 'Receivable Ledger', 'ledger'], ['income_ledger_id', 'Income Ledger', 'ledger'], ['remarks', 'Remarks', 'textarea'],
    ],
    columns: [['invoice_no', 'Invoice'], ['incentive_type', 'Type'], ['shipping_bill_no', 'Shipping Bill'], ['fob_value_inr', 'FOB INR'], ['incentive_amount', 'Incentive'], ['status', 'Status']],
  },
  lc_tracking: {
    title: 'Letter of Credit Tracking', description: 'Maintain LC limits, shipment dates, utilization and reference PDF copies.',
    save: '/finance_accounts/lc_tracking/save', remove: '/finance_accounts/lc_tracking/delete', pdf: true,
    fields: [
      ['lc_number', 'LC Number', 'text', '', true], ['lc_reference', 'LC Reference'], ['issuing_bank', 'Issuing Bank', 'text', '', true],
      ['advising_bank', 'Advising Bank', 'text', '', true], ['negotiating_bank', 'Negotiating Bank'],
      ['lc_amount', 'LC Amount', 'number', 0, true], ['currency_code', 'Currency', 'select', 'USD', true, ['USD', 'EUR', 'GBP', 'JPY', 'AED', 'INR']],
      ['utilized_amount', 'Utilized Amount', 'number', 0], ['balance_amount', 'Balance Amount', 'number', 0],
      ['lc_issue_date', 'Issue Date', 'date'], ['expiry_date', 'Expiry Date', 'date', '', true], ['latest_shipment_date', 'Latest Shipment Date', 'date', '', true],
      ['presentation_period_days', 'Presentation Days', 'number', 21], ['lc_type', 'LC Type', 'select', 'SIGHT', true, ['SIGHT', 'USANCE', 'TRANSFERABLE', 'REVOLVING']],
      ['buyer_name', 'Buyer Name'], ['customer_ledger_id', 'Customer Ledger', 'ledger'], ['linked_invoice_nos', 'Linked Invoice Numbers'],
      ['status', 'Status', 'select', 'OPEN', true, ['OPEN', 'PART_UTILIZED', 'FULLY_UTILIZED', 'EXPIRED', 'CLOSED']],
      ['docs_required', 'Documents Required', 'textarea'], ['remarks', 'Remarks', 'textarea'],
    ],
    columns: [['lc_number', 'LC Number'], ['buyer_name', 'Buyer'], ['issuing_bank', 'Issuing Bank'], ['lc_amount', 'Amount'], ['currency_code', 'Currency'], ['balance_amount', 'Balance'], ['expiry_date', 'Expiry'], ['status', 'Status']],
  },
  gst_register: {
    title: 'GST Register', description: 'Post GST purchase, sales, export and RCM documents into the general ledger.',
    save: '/finance_accounts/gst_register/save', remove: '/finance_accounts/gst_register/delete',
    fields: [
      ['transaction_type', 'Transaction Type', 'select', 'PURCHASE', true, ['PURCHASE', 'SALES', 'EXPORT', 'RCM', 'CREDIT_NOTE', 'DEBIT_NOTE']],
      ['invoice_no', 'Invoice Number', 'text', '', true], ['invoice_date', 'Invoice Date', 'date', today, true], ['party_name', 'Party Name'],
      ['gstin', 'GSTIN'], ['state_code', 'State Code'], ['hsn_code', 'HSN/SAC'], ['description', 'Description'],
      ['taxable_value', 'Taxable Value', 'number', 0, true], ['igst_rate', 'IGST %', 'number', 0], ['cgst_rate', 'CGST %', 'number', 0], ['sgst_rate', 'SGST %', 'number', 0],
      ['period_month', 'Return Period', 'month', month, true], ['is_export', 'Export Supply', 'checkbox', false], ['is_rcm', 'Reverse Charge', 'checkbox', false], ['lut_number', 'LUT Number'],
    ],
    columns: [['invoice_date', 'Date'], ['invoice_no', 'Invoice'], ['transaction_type', 'Type'], ['party_name', 'Party'], ['taxable_value', 'Taxable'], ['total_tax', 'Tax'], ['invoice_total', 'Total']],
  },
  fixed_assets: {
    title: 'Fixed Assets', description: 'Capitalize assets and maintain automatic monthly depreciation journals.',
    save: '/finance_accounts/fixed_assets/save', remove: '/finance_accounts/fixed_assets/delete', depreciation: true,
    fields: [
      ['asset_code', 'Asset Code', 'text', '', true], ['asset_name', 'Asset Name', 'text', '', true],
      ['asset_category', 'Category', 'select', 'PLANT_MACHINERY', true, ['BUILDING', 'PLANT_MACHINERY', 'IQF_FREEZER', 'VEHICLE', 'COMPUTER', 'FURNITURE', 'OTHER']],
      ['purchase_date', 'Purchase Date', 'date', today, true], ['purchase_cost', 'Purchase Cost', 'number', 0, true], ['purchase_invoice_no', 'Purchase Invoice'],
      ['location', 'Location'], ['department', 'Department'], ['depreciation_method', 'Depreciation Method', 'select', 'WDV', true, ['WDV', 'SLM']],
      ['dep_rate_percent', 'Annual Depreciation %', 'number', 0, true], ['useful_life_years', 'Useful Life Years', 'number'], ['salvage_value', 'Salvage Value', 'number', 0],
      ['asset_ledger_id', 'Asset Ledger', 'ledger'], ['acc_dep_ledger_id', 'Accumulated Depreciation Ledger', 'ledger'], ['dep_expense_ledger_id', 'Depreciation Expense Ledger', 'ledger'],
      ['status', 'Status', 'select', 'ACTIVE', true, ['ACTIVE', 'DISPOSED', 'SOLD', 'FULLY_DEPRECIATED']], ['remarks', 'Remarks', 'textarea'],
    ],
    columns: [['asset_code', 'Code'], ['asset_name', 'Asset'], ['asset_category', 'Category'], ['purchase_date', 'Purchase Date'], ['purchase_cost', 'Cost'], ['current_wdv', 'Current WDV'], ['status', 'Status']],
  },
};

const initialForm = config => Object.fromEntries(config.fields.map(([name, , , value = '']) => [name, value]));
const displayValue = value => typeof value === 'number' ? value.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : (value ?? '—');

function FinanceRegister({ moduleKey }) {
  const config = MODULES[moduleKey];
  const [data, setData] = useState({ rows: [], ledgers: [] });
  const [form, setForm] = useState(() => initialForm(config));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const notify = useCallback((message, type = 'success') => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/finance_accounts/native-data/${moduleKey}`, { credentials: 'include' });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || 'Unable to load finance register.');
      setData(payload);
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [moduleKey, notify]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const submit = async event => {
    event.preventDefault();
    if (!window.confirm(`Do you want to save this ${config.title} entry?`)) return;
    setSaving(true);
    try {
      const requestBody = Object.fromEntries(config.fields.map(([name, , type]) => [
        name,
        type === 'date' && !form[name] ? null : form[name],
      ]));
      const response = await fetch(config.save, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || 'Save failed.');
      notify(payload.message || 'Saved successfully.');
      setForm(initialForm(config));
      await load();
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const remove = async row => {
    if (!window.confirm(`Do you want to cancel ${row[config.columns[0][0]] || 'this entry'}?`)) return;
    try {
      const response = await fetch(`${config.remove}/${row.id}`, { method: 'POST', credentials: 'include' });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || 'Unable to cancel entry.');
      notify(payload.message || 'Entry cancelled.');
      await load();
    } catch (error) { notify(error.message, 'error'); }
  };

  const runDepreciation = async () => {
    const period = window.prompt('Depreciation period (YYYY-MM)', month);
    if (!period || !window.confirm(`Run depreciation for ${period}?`)) return;
    try {
      const response = await fetch('/finance_accounts/fixed_assets/run_depreciation', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ period_month: period, run_date: today }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || 'Depreciation run failed.');
      notify(payload.message); await load();
    } catch (error) { notify(error.message, 'error'); }
  };

  const uploadLc = async (row, file) => {
    if (!file || !window.confirm(`Upload ${file.name} for LC ${row.lc_number}?`)) return;
    const body = new FormData(); body.append('file', file); body.append('document_kind', 'LC_COPY');
    try {
      const response = await fetch(`/finance_accounts/lc_tracking/upload_pdf/${row.id}`, { method: 'POST', credentials: 'include', body });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.message || 'PDF upload failed.');
      notify(payload.message || 'LC PDF uploaded.');
    } catch (error) { notify(error.message, 'error'); }
  };

  const ledgerOptions = useMemo(() => data.ledgers || [], [data.ledgers]);

  return (
    <div className="attendance-container native-finance-page">
      {toast && <div className={`attendance-toast ${toast.type === 'error' ? 'error' : 'success'}`}>{toast.message}</div>}
      <div className="attendance-page-header">
        <div><h1>{config.title}</h1><p>{config.description}</p></div>
        <div className="attendance-page-header-actions">
          {config.depreciation && <button className="attendance-btn attendance-btn-secondary" type="button" onClick={runDepreciation}>Run Depreciation</button>}
          <button className="attendance-btn attendance-btn-secondary" type="button" onClick={load}><RefreshCw size={14} /> Refresh</button>
        </div>
      </div>

      <form className="attendance-card native-finance-form" onSubmit={submit}>
        <div className="native-finance-fields">
          {config.fields.map(([name, label, type = 'text', , required, options]) => (
            <label key={name} className={type === 'textarea' ? 'native-finance-wide' : ''}>
              <span>{label}{required ? ' *' : ''}</span>
              {type === 'select' && <select className="attendance-select" value={form[name]} required={required} onChange={event => setForm(current => ({ ...current, [name]: event.target.value }))}><option value="">Select</option>{options.map(option => <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>)}</select>}
              {type === 'ledger' && <select className="attendance-select" value={form[name]} onChange={event => setForm(current => ({ ...current, [name]: event.target.value ? Number(event.target.value) : null }))}><option value="">Select ledger</option>{ledgerOptions.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select>}
              {type === 'textarea' && <textarea className="attendance-input" rows="2" value={form[name] || ''} onChange={event => setForm(current => ({ ...current, [name]: event.target.value }))} />}
              {type === 'checkbox' && <input className="native-finance-checkbox" type="checkbox" checked={Boolean(form[name])} onChange={event => setForm(current => ({ ...current, [name]: event.target.checked }))} />}
              {!['select', 'ledger', 'textarea', 'checkbox'].includes(type) && <input className="attendance-input" type={type} step={type === 'number' ? '0.01' : undefined} required={required} value={form[name] ?? ''} onChange={event => setForm(current => ({ ...current, [name]: type === 'number' ? (event.target.value === '' ? null : Number(event.target.value)) : event.target.value }))} />}
            </label>
          ))}
        </div>
        <div className="native-finance-form-actions"><button className="attendance-btn attendance-btn-primary" disabled={saving} type="submit"><Save size={14} /> {saving ? 'Saving...' : 'Save'}</button><button className="attendance-btn attendance-btn-secondary" type="button" onClick={() => setForm(initialForm(config))}><X size={14} /> Clear</button></div>
      </form>

      <div className="attendance-table-container native-finance-table">
        <div className="native-finance-table-title"><strong>{config.title} Register</strong><span>{data.rows?.length || 0} records</span></div>
        <div className="attendance-table-wrapper"><table className="attendance-table"><thead><tr>{config.columns.map(([, label]) => <th key={label}>{label}</th>)}{config.pdf && <th>Document</th>}<th>Action</th></tr></thead><tbody>
          {(data.rows || []).map(row => <tr key={row.id}>{config.columns.map(([key]) => <td key={key}>{displayValue(row[key])}</td>)}{config.pdf && <td><label className="attendance-btn attendance-btn-secondary native-upload"><Upload size={13} /> PDF<input type="file" accept="application/pdf" onChange={event => uploadLc(row, event.target.files?.[0])} /></label></td>}<td><button className="attendance-btn attendance-btn-danger" type="button" onClick={() => remove(row)}><Trash2 size={13} /> Cancel</button></td></tr>)}
          {!loading && !(data.rows || []).length && <tr><td className="attendance-empty" colSpan={config.columns.length + (config.pdf ? 2 : 1)}>No records available.</td></tr>}
          {loading && <tr><td className="attendance-empty" colSpan={config.columns.length + (config.pdf ? 2 : 1)}>Loading...</td></tr>}
        </tbody></table></div>
      </div>
    </div>
  );
}

export function AccountsFlowGuide() {
  const steps = [
    ['1', 'Source Entry', 'Bills, receipts, payroll, inventory and export documents'],
    ['2', 'Validation', 'Company, financial year, ledger, tax and duplicate checks'],
    ['3', 'Approval & Posting', 'Balanced debit and credit voucher is posted after authorization'],
    ['4', 'Sub-ledger Update', 'Party, bank, GST, asset and bill-wise balances are updated'],
    ['5', 'General Ledger', 'Trial balance, profit and loss, balance sheet and cash flow'],
    ['6', 'Control & Audit', 'Locking, reversal, reconciliation and immutable audit trail'],
  ];
  return <div className="attendance-container native-finance-page"><div className="attendance-page-header"><div><h1>Accounts Flow Guide</h1><p>Integrated accounting lifecycle and controls.</p></div></div><div className="native-flow-grid">{steps.map(([number, title, text], index) => <div className="attendance-card native-flow-card" key={number}><span className="native-flow-number">{number}</span><div><strong>{title}</strong><p>{text}</p></div>{index < steps.length - 1 && <ArrowRight className="native-flow-arrow" size={16} />}</div>)}</div><div className="attendance-card native-flow-status"><CheckCircle2 size={18} /><div><strong>Accounting controls are active</strong><p>Balanced posting, company isolation, financial-year locking, approval, reversal and audit checks are enforced by the backend accounting engine.</p></div></div></div>;
}

export const BankMasterPage = () => <FinanceRegister moduleKey="bank_master" />;
export const ItemAccountingLinkPage = () => <FinanceRegister moduleKey="item_accounting_link" />;
export const ExportIncentivePage = () => <FinanceRegister moduleKey="export_incentive_register" />;
export const LcTrackingPage = () => <FinanceRegister moduleKey="lc_tracking" />;
export const GstRegisterPage = () => <FinanceRegister moduleKey="gst_register" />;
export const FixedAssetsPage = () => <FinanceRegister moduleKey="fixed_assets" />;
