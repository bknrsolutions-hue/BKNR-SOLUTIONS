import { Download, FileSpreadsheet, FolderArchive } from 'lucide-react';
import '../Attendance/Attendance.css';
import './ExportWorkspace.css';

const REGISTERS = [
  ['All Export Registers', '/export_documents/registers.xlsx', 'Complete export operations workbook', FolderArchive, 'export_documents_dashboard'],
  ['Proforma Invoice Register', '/export_documents/proforma_invoice/register.xlsx', 'PI values, buyers and approval status', FileSpreadsheet, 'proforma_invoice'],
  ['Export Shipment Register', '/export_documents/export_shipment/register.xlsx', 'Shipment, PO, ETD and ETA details', FileSpreadsheet, 'export_shipment'],
  ['Commercial Invoice Register', '/export_documents/commercial_invoice/register.xlsx', 'Invoice and foreign-currency values', FileSpreadsheet, 'commercial_invoice'],
  ['Packing List Register', '/export_documents/packing_list/register.xlsx', 'Packing, quantity and weight details', FileSpreadsheet, 'packing_list'],
  ['Container Stuffing Register', '/export_documents/container_stuffing/register.xlsx', 'Container and seal movement details', FileSpreadsheet, 'container_stuffing'],
  ['Shipping Bill Register', '/export_documents/shipping_bill/register.xlsx', 'Customs shipping bill records', FileSpreadsheet, 'shipping_bill'],
  ['Bill of Lading Register', '/export_documents/bill_of_lading/register.xlsx', 'Vessel and bill of lading records', FileSpreadsheet, 'bill_of_lading'],
  ['Health Certificate Register', '/export_documents/health_certificate/register.xlsx', 'Health certificate records', FileSpreadsheet, 'health_certificate'],
];

export default function ExportRegisters({ user }) {
  const userPermissions = Array.isArray(user?.permissions)
    ? user.permissions
    : String(user?.permissions || '').split(',').filter(Boolean);
  const unrestricted = user?.email === 'bknr.solutions@gmail.com' || userPermissions.includes('ALL');
  const visibleRegisters = REGISTERS.filter(([, , , , permission]) =>
    unrestricted || userPermissions.includes(permission)
  );
  const openRegister = (url, label) => {
    if (!window.confirm(`Do you want to download ${label}?`)) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="attendance-container export-registers-page">
      <div className="attendance-page-header">
        <div>
          <h1>Export Registers</h1>
          <p>Download controlled Excel registers without opening each document screen.</p>
        </div>
      </div>
      <div className="export-register-grid">
        {visibleRegisters.map(([label, url, description, Icon]) => (
          <button type="button" key={url} className="export-register-card" onClick={() => openRegister(url, label)}>
            <span className="export-register-icon"><Icon size={22} /></span>
            <span className="export-register-copy">
              <small>{url === '/export_documents/registers.xlsx' ? 'MASTER REGISTER' : 'DOCUMENT REGISTER'}</small>
              <strong>{label}</strong>
              <span>{description}</span>
            </span>
            <Download size={18} />
          </button>
        ))}
      </div>
    </div>
  );
}
