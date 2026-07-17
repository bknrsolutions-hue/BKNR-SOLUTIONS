import { lazy, Suspense, useState } from 'react';
import {
  BadgeCheck,
  Boxes,
  FileCheck2,
  FileText,
  FolderKanban,
  ReceiptText,
  Ship,
} from 'lucide-react';
import '../Attendance/Attendance.css';
import './ExportWorkspace.css';

const ProformaInvoices = lazy(() => import('./ProformaInvoices'));
const ExportShipments = lazy(() => import('./ExportShipments'));
const CommercialInvoices = lazy(() => import('./CommercialInvoices'));
const PackingLists = lazy(() => import('./PackingLists'));
const ContainerStuffing = lazy(() => import('./ContainerStuffing'));
const ShippingBills = lazy(() => import('./ShippingBills'));
const BillsOfLading = lazy(() => import('./BillsOfLading'));
const HealthCertificates = lazy(() => import('./HealthCertificates'));
const SupportingDocuments = lazy(() => import('./SupportingDocuments'));

const WORKSPACE_VIEWS = [
  { id: 'overview', label: 'Overview', icon: FolderKanban, component: SupportingDocuments, permissions: ['export_documents_dashboard', 'export_supporting_documents'] },
  { id: 'proforma', label: 'Order & Contract', shortLabel: 'PI', icon: ReceiptText, component: ProformaInvoices, permissions: ['proforma_invoice'] },
  { id: 'shipment', label: 'Shipment', icon: Ship, component: ExportShipments, permissions: ['export_shipment'] },
  { id: 'invoice', label: 'Commercial Invoice', shortLabel: 'Invoice', icon: FileText, component: CommercialInvoices, permissions: ['commercial_invoice'] },
  { id: 'packing', label: 'Packing List', shortLabel: 'Packing', icon: Boxes, component: PackingLists, permissions: ['packing_list'] },
  { id: 'stuffing', label: 'Container Stuffing', shortLabel: 'Stuffing', icon: Boxes, component: ContainerStuffing, permissions: ['container_stuffing'] },
  { id: 'shipping_bill', label: 'Shipping Bill', shortLabel: 'S/Bill', icon: FileCheck2, component: ShippingBills, permissions: ['shipping_bill'] },
  { id: 'lading', label: 'Bill of Lading', shortLabel: 'B/L', icon: Ship, component: BillsOfLading, permissions: ['bill_of_lading'] },
  { id: 'health', label: 'Health Certificate', shortLabel: 'Health', icon: BadgeCheck, component: HealthCertificates, permissions: ['health_certificate'] },
];

export default function ExportWorkspace({ user }) {
  const [activeView, setActiveView] = useState('overview');
  const userPermissions = Array.isArray(user?.permissions)
    ? user.permissions
    : String(user?.permissions || '').split(',').filter(Boolean);
  const unrestricted = user?.email === 'bknr.solutions@gmail.com' || userPermissions.includes('ALL');
  const visibleViews = WORKSPACE_VIEWS.filter(item =>
    unrestricted || item.permissions.some(permission => userPermissions.includes(permission))
  );
  const selected = visibleViews.find(item => item.id === activeView) || visibleViews[0];
  if (!selected) return <div className="attendance-container"><div className="attendance-empty">You do not have access to export operations.</div></div>;
  const ActiveComponent = selected.component;

  return (
    <div className="export-workspace">
      <nav className="export-workspace-tabs" aria-label="Export shipment workflow">
        {visibleViews.map((item, index) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.id}
              className={selected.id === item.id ? 'active' : ''}
              onClick={() => setActiveView(item.id)}
              title={item.label}
            >
              <span className="export-workspace-step">{index + 1}</span>
              <Icon size={17} />
              <span>{item.shortLabel || item.label}</span>
            </button>
          );
        })}
      </nav>

      <main className="export-workspace-content">
        <Suspense fallback={<div className="export-workspace-loading">Loading {selected.label}…</div>}>
          <ActiveComponent
            embedded={activeView === 'overview'}
            pageTitle={activeView === 'overview' ? 'Shipment Overview' : undefined}
          />
        </Suspense>
      </main>
    </div>
  );
}
