import { Download, FileSpreadsheet, FolderArchive } from 'lucide-react';
import { secureDownload } from '../../utils/secureDownload';
import '../Attendance/Attendance.css';
import '../ExportDocuments/ExportWorkspace.css';

export const REGISTER_MODULES = {
  exports: {
    title: 'Export Registers',
    description: 'Download controlled export-document and shipment registers.',
    master: ['/export_documents/registers.xlsx', 'Complete export operations workbook', 'GET'],
    entries: [
      ['Proforma Invoice Register', 'proforma-invoice', 'PI values, buyers and approval status', 'proforma_invoice', '/export_documents/proforma_invoice/register.xlsx'],
      ['Export Shipment Register', 'export-shipment', 'Shipment, PO, ETD and ETA details', 'export_shipment', '/export_documents/export_shipment/register.xlsx'],
      ['Commercial Invoice Register', 'commercial-invoice', 'Invoice and foreign-currency values', 'commercial_invoice', '/export_documents/commercial_invoice/register.xlsx'],
      ['Packing List Register', 'packing-list', 'Packing, quantity and weight details', 'packing_list', '/export_documents/packing_list/register.xlsx'],
      ['Container Stuffing Register', 'container-stuffing', 'Container and seal movement details', 'container_stuffing', '/export_documents/container_stuffing/register.xlsx'],
      ['Shipping Bill Register', 'shipping-bill', 'Customs shipping bill records', 'shipping_bill', '/export_documents/shipping_bill/register.xlsx'],
      ['Bill of Lading Register', 'bill-of-lading', 'Vessel and bill of lading records', 'bill_of_lading', '/export_documents/bill_of_lading/register.xlsx'],
      ['Health Certificate Register', 'health-certificate', 'Health certificate records', 'health_certificate', '/export_documents/health_certificate/register.xlsx'],
    ],
  },
  processing: {
    title: 'Processing Registers',
    description: 'Download tenant-controlled processing and production registers.',
    master: ['/export/processing', 'Complete processing operations workbook', 'GET'],
    entries: [
      ['Gate Entry Register', 'gate-entry', 'Gate arrivals and source intake records', 'gate_entry'],
      ['Raw Material Purchasing Register', 'raw-material-purchasing', 'RM purchase batches, quantities and supplier values', 'raw_material_purchasing'],
      ['De-Heading Register', 'de-heading', 'De-heading input, output and yield records', 'de_heading'],
      ['Grading Register', 'grading', 'Grade allocation and batch quantity records', 'grading'],
      ['Peeling Register', 'peeling', 'Peeling process, contractor and yield records', 'peeling'],
      ['Soaking Register', 'soaking', 'Soaking batch, chemical and duration records', 'soaking'],
      ['Production Register', 'production', 'Finished production and packing records', 'production'],
      ['Reprocess Register', 'reprocess', 'Reprocess movement and recovery records', 'reprocess'],
    ],
  },
  inventory: {
    title: 'Inventory Registers',
    description: 'Download stock, orders, dispatch and cold-storage registers.',
    master: ['/export/inventory', 'Complete inventory operations workbook', 'GET'],
    entries: [
      ['Stock Entry Register', 'stock-entry', 'Finished goods stock receipt records', 'stock_entry'],
      ['Pending Orders Register', 'pending-orders', 'PO requirements and pending order records', 'pending_orders'],
      ['Sales Dispatch Register', 'sales-dispatch', 'Dispatch quantities and customer movement records', 'sales_report'],
      ['Cold Storage Holding Register', 'cold-storage-holding', 'Batch-wise cold-store holding records', 'cold_storage_holding'],
      ['Cold Storage Master Register', 'cold-storage-master', 'Cold-store location and master records', 'cold_storage'],
    ],
  },
  accounts: {
    title: 'Accounts Registers',
    description: 'Download ledgers, journals, receivables, payments and voucher registers.',
    master: ['/export/accounts', 'Complete accounts and ledger workbook', 'GET'],
    entries: [
      ['Ledger Master Register', 'ledger-master', 'Chart of accounts and ledger configuration', 'ledger_master'],
      ['Journal Entries Register', 'journal-entries', 'Double-entry journal headers and posting status', 'journal_entry'],
      ['Customer Receivables Register', 'customer-receivables', 'Customer invoice and outstanding balances', 'customer_receivable'],
      ['Vendor Payments Register', 'vendor-payments', 'Vendor payment and settlement records', 'vendor_payment'],
      ['Bank Transactions Register', 'bank-transactions', 'Cash and bank transaction records', 'bank_transaction'],
      ['Expense Vouchers Register', 'expense-vouchers', 'Expense voucher and approval records', 'expense_voucher'],
      ['Payment Receipts Register', 'payment-receipts', 'Remittance and receipt records', 'payment_receipt'],
      ['Purchase Invoices Register', 'purchase-invoices', 'Purchase and packaging invoice records', 'packaging_bills'],
      ['Container & Logistics Register', 'container-costs', 'Container and freight cost records', 'logistics_bills'],
    ],
  },
  hrms: {
    title: 'HRMS Registers',
    description: 'Download employee, attendance, increment and payroll-control registers.',
    master: ['/export/hrms', 'Complete HRMS and payroll workbook', 'GET'],
    entries: [
      ['Employee Registration Register', 'employee-registration', 'Employee profile and work information', 'employee_registration'],
      ['Daily Attendance Register', 'daily-attendance', 'Daily punch, shift and attendance records', 'daily_attendance'],
      ['Employee Increment Register', 'employee-increments', 'Salary increment and effective-date records', 'employee_increment'],
      ['Employee Statutory Register', 'statutory-master', 'PF, ESI, tax and payroll-control records', 'tax_master'],
      ['Salary Advance Register', 'salary-advances', 'Employee advance and recovery records', 'salary_advance'],
    ],
  },
};

function permissionsOf(user) {
  return Array.isArray(user?.permissions)
    ? user.permissions
    : String(user?.permissions || '').split(',').map(item => item.trim()).filter(Boolean);
}

export function RegisterLibrary({ modules = Object.keys(REGISTER_MODULES), user, embedded = false, onDownload }) {
  const permissions = permissionsOf(user);
  const unrestricted = !user || user?.email === 'bknr.solutions@gmail.com' || permissions.includes('ALL');
  const performDownload = onDownload || secureDownload;

  return <div className={`register-library ${embedded ? 'admin-card' : ''}`}>
    {embedded ? <div className="admin-toolbar"><h2>Department Register Library</h2></div> : null}
    {modules.map(moduleKey => {
      const module = REGISTER_MODULES[moduleKey];
      if (!module) return null;
      const entries = module.entries.filter(([, , , permission]) => unrestricted || permissions.includes(permission));
      if (!unrestricted && !entries.length) return null;
      return <section key={moduleKey} style={{ marginBottom: 18 }}>
        {embedded ? <div className="admin-toolbar"><div><h2>{module.title}</h2><small>{module.description}</small></div></div> : null}
        <div className="export-register-grid">
          <button type="button" className="export-register-card" onClick={() => performDownload(module.master[0], `All ${module.title}`, module.master[2] || 'POST')}>
            <span className="export-register-icon"><FolderArchive size={22} /></span>
            <span className="export-register-copy"><small>MASTER REGISTER</small><strong>All {module.title}</strong><span>{module.master[1]}</span></span>
            <Download size={18} />
          </button>
          {entries.map(([label, key, description, , customUrl]) => <button type="button" key={key} className="export-register-card" onClick={() => performDownload(customUrl || `/data-management/register/${moduleKey}/${key}.xlsx`, label, 'GET')}>
            <span className="export-register-icon"><FileSpreadsheet size={22} /></span>
            <span className="export-register-copy"><strong>{label}</strong><span>{description}</span></span>
            <Download size={18} />
          </button>)}
        </div>
      </section>;
    })}
  </div>;
}

function ModuleRegisterPage({ moduleKey, user }) {
  const module = REGISTER_MODULES[moduleKey];
  return <div className="attendance-container export-registers-page">
    <div className="attendance-page-header"><div><h1>{module.title}</h1><p>{module.description}</p></div></div>
    <RegisterLibrary modules={[moduleKey]} user={user} />
  </div>;
}

export function ProcessingRegisters({ user }) { return <ModuleRegisterPage moduleKey="processing" user={user} />; }
export function InventoryRegisters({ user }) { return <ModuleRegisterPage moduleKey="inventory" user={user} />; }
export function AccountsRegisters({ user }) { return <ModuleRegisterPage moduleKey="accounts" user={user} />; }
export function HRMSRegisters({ user }) { return <ModuleRegisterPage moduleKey="hrms" user={user} />; }
