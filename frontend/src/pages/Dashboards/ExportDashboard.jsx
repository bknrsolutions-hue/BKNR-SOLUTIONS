import { useCallback } from 'react';
import {
  Bars,
  DashboardState,
  ModuleRail,
  number,
  Panel,
  ProgressList,
  useDashboardData,
} from './DashboardPrimitives';
import './ExportDashboard.css';

const EXPORT_RAIL = [
  {
    label: 'Export Operations',
    items: [
      { id: 'export_shipment_workspace', route: '/export_documents/workspace', icon: 'fa-ship', label: 'Shipment Workspace' },
      { id: 'export_requirement_forms', route: '/export_documents/requirement-pages/entry', icon: 'fa-list-check', label: 'Document Center' },
      { id: 'export_document_approvals', route: '/export_documents/approvals', icon: 'fa-file-circle-check', label: 'Approvals' },
      { id: 'export_registers', route: '/export_documents/registers', icon: 'fa-book-open', label: 'Registers' },
    ],
  },
  {
    label: 'Finance Links',
    items: [
      { id: 'finance_export_incentive_register', route: '/finance/export-incentives', icon: 'fa-hand-holding-dollar', label: 'Export Incentives' },
      { id: 'finance_lc_tracking', route: '/finance/lc-tracking', icon: 'fa-building-columns', label: 'LC Tracking' },
      { id: 'finance_gst_register', route: '/finance/gst-register', icon: 'fa-file-invoice-dollar', label: 'GST Register' },
    ],
  },
];

const KPI_CONFIG = [
  ['Proforma Invoices', 'proforma_invoices', 'fa-file-signature', 'kpi-purple', 'proforma_invoice', 'Export quotations'],
  ['Shipments', 'shipments', 'fa-ship', 'kpi-blue', 'export_shipment', 'Shipment records'],
  ['Commercial Invoices', 'invoices', 'fa-file-invoice-dollar', 'kpi-teal', 'commercial_invoice', 'Commercial documents'],
  ['Packing Documents', 'packing_lists', 'fa-boxes-packing', 'kpi-yellow', 'packing_list', 'packing_lines'],
  ['Container Stuffing', 'stuffing', 'fa-truck-ramp-box', 'kpi-cyan', 'container_stuffing', 'Container records'],
  ['Shipping Bills', 'shipping_bills', 'fa-file-export', 'kpi-green', 'shipping_bill', 'Customs documents'],
  ['Bills of Lading', 'bill_of_lading', 'fa-file-contract', 'kpi-blue', 'bill_of_lading', 'Transport documents'],
  ['Pending Approvals', 'pending_approvals', 'fa-clock-rotate-left', 'kpi-red', 'export_document_approvals', 'Awaiting action'],
];

const PAGE_ROUTES = {
  proforma_invoice: '/export_documents/proforma_invoice',
  export_shipment: '/export_documents/export_shipment',
  commercial_invoice: '/export_documents/commercial_invoice',
  packing_list: '/export_documents/packing_list',
  container_stuffing: '/export_documents/container_stuffing',
  shipping_bill: '/export_documents/shipping_bill',
  bill_of_lading: '/export_documents/bill_of_lading',
  export_document_approvals: '/export_documents/approvals',
};

function formatDate(value) {
  if (!value) return '—';
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(parsed);
}

function formatCurrency(value, currency = 'USD') {
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 2,
    }).format(Number(value || 0));
  } catch {
    return `${currency || ''} ${number(value)}`.trim();
  }
}

function Status({ value }) {
  const normalized = String(value || 'PENDING').toUpperCase();
  const tone = ['APPROVED', 'PAID', 'CLOSED', 'COMPLETED', 'SHIPPED'].includes(normalized)
    ? 'green'
    : ['REJECTED', 'CANCELLED', 'OVERDUE'].includes(normalized)
      ? 'red'
      : ['OPEN', 'DRAFT'].includes(normalized)
        ? 'blue'
        : 'amber';
  return <span className={`export-status ${tone}`}>{normalized.replaceAll('_', ' ')}</span>;
}

export default function ExportDashboard({ setActivePage }) {
  const buildUrl = useCallback(() => '/export_documents/dashboard/data', []);
  const { data, loading, error, reload } = useDashboardData(buildUrl);

  const navigate = useCallback((itemOrId, route) => {
    const item = typeof itemOrId === 'string' ? { id: itemOrId, route } : itemOrId;
    if (item?.id && setActivePage) {
      setActivePage(item.id, item.route);
      return;
    }
    if (item?.route) window.location.assign(item.route);
  }, [setActivePage]);

  const statuses = data?.shipment_status || [];
  const completionRows = (data?.document_completion || []).map(row => ({
    ...row,
    percentage: row.total ? (Number(row.complete || 0) / Number(row.total)) * 100 : 0,
  }));

  return (
    <div className="module-shell export-react-dashboard">
      <ModuleRail title="Export Documents" icon="fa-earth-asia" sections={EXPORT_RAIL} onNavigate={navigate} />
      <main className="module-main export-dashboard-main">
        <div className="export-dashboard-content">
          <div className="export-dashboard-header">
            <h2><i className="fa-solid fa-earth-asia" /> Export Documents Dashboard</h2>
            <button type="button" onClick={reload}><i className="fa-solid fa-rotate-right" /> Refresh</button>
          </div>
          <DashboardState loading={loading} error={error}>
            <div className="kpi-grid export-kpis">
              {KPI_CONFIG.map(([label, key, icon, tone, pageId, note]) => (
                <div
                  className={`kpi-card ${tone}`}
                  key={key}
                  role="button"
                  tabIndex="0"
                  title={`Open ${label}`}
                  onClick={() => navigate(pageId, PAGE_ROUTES[pageId])}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') navigate(pageId, PAGE_ROUTES[pageId]);
                  }}
                >
                  <div className="kpi-header">
                    <h4>{label}</h4>
                    <div className="kpi-icon"><i className={`fa-solid ${icon}`} /></div>
                  </div>
                  <div>
                    <div className="value">{number(data?.stats?.[key])}</div>
                    <div className="amt-sub">
                      {note === 'packing_lines'
                        ? `${number(data?.stats?.packing_lines)} item rows`
                        : note}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="enterprise-grid export-dashboard-grid">
              <Panel title="Shipment Status Distribution">
                {statuses.length ? (
                  <Bars
                    labels={statuses.map(row => String(row.label || 'OPEN').replaceAll('_', ' '))}
                    primary={statuses.map(row => row.value)}
                  />
                ) : <div className="export-empty">No shipment status data</div>}
              </Panel>
              <Panel title="Document Completion">
                {completionRows.length ? (
                  <ProgressList
                    rows={completionRows}
                    labelKey="label"
                    valueKey="percentage"
                    format={value => `${number(value)}%`}
                    color="#16a34a"
                  />
                ) : <div className="export-empty">No compliance records</div>}
              </Panel>

              <Panel title="Recent Shipments" meta={`${number(data?.stats?.shipments)} total`} full>
                <div className="enterprise-table-wrap export-dashboard-table">
                  <table className="enterprise-table">
                    <thead><tr><th>Shipment No</th><th>Invoice No</th><th>Buyer</th><th>Country</th><th>ETD</th><th>ETA</th><th>Status</th><th>Documents</th></tr></thead>
                    <tbody>
                      {(data?.recent_shipments || []).length ? data.recent_shipments.map(row => (
                        <tr key={row.id}>
                          <td><strong>{row.shipment_no}</strong></td><td>{row.invoice_no || '—'}</td>
                          <td>{row.buyer_name || '—'}</td><td>{row.country || '—'}</td>
                          <td>{formatDate(row.etd)}</td><td>{formatDate(row.eta)}</td>
                          <td><Status value={row.status} /></td>
                          <td><a className="export-dossier-link" href={`/export_documents/shipment/${row.id}/dossier.zip`}><i className="fa-solid fa-file-zipper" /> Dossier</a></td>
                        </tr>
                      )) : <tr><td colSpan="8" className="export-empty">No shipments found</td></tr>}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel title="Recent Commercial Invoices" meta={`${number(data?.stats?.invoices)} total`} full>
                <div className="enterprise-table-wrap export-dashboard-table">
                  <table className="enterprise-table">
                    <thead><tr><th>Invoice No</th><th>Date</th><th>Shipment No</th><th>Buyer</th><th>Currency</th><th className="num">Amount</th><th>Payment</th><th>Approval</th></tr></thead>
                    <tbody>
                      {(data?.recent_invoices || []).length ? data.recent_invoices.map(row => (
                        <tr key={row.invoice_no}>
                          <td><strong>{row.invoice_no}</strong></td><td>{formatDate(row.invoice_date)}</td>
                          <td>{row.shipment_no || '—'}</td><td>{row.buyer_name || '—'}</td><td>{row.currency}</td>
                          <td className="num"><strong>{formatCurrency(row.total_amount, row.currency)}</strong></td>
                          <td><Status value={row.payment_status} /></td><td><Status value={row.approval_status} /></td>
                        </tr>
                      )) : <tr><td colSpan="8" className="export-empty">No invoices found</td></tr>}
                    </tbody>
                  </table>
                </div>
              </Panel>

              <Panel title="Invoice Value by Currency" full>
                {(data?.currency_totals || []).length ? (
                  <div className="export-currency-grid">
                    {data.currency_totals.map(row => (
                      <div className="export-currency-card" key={row.label}>
                        <span>{row.label} · {number(row.count)} invoices</span>
                        <strong>{formatCurrency(row.value, row.label)}</strong>
                      </div>
                    ))}
                  </div>
                ) : <div className="export-empty">No invoice values available</div>}
              </Panel>
            </div>
          </DashboardState>
        </div>
      </main>
    </div>
  );
}
