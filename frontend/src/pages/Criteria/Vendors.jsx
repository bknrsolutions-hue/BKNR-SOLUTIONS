import React from 'react';
import MasterBase from './MasterBase';

export default function Vendors(props) {
  return (
    <MasterBase
      {...props}
      title="Vendors Master"
      modelName="vendors"
      fields={[
        { id: 'name', label: 'Vendor Name', type: 'text', required: true },
        { id: 'email', label: 'Email', type: 'email' },
        { id: 'service_for', label: 'Service For', type: 'select', options: ['Transport', 'Diesel', 'Ice', 'Packing', 'Misc'], required: true },
        { id: 'payment_cycle', label: 'Payment Cycle', type: 'text' },
        { id: 'gst_number', label: 'GST Number', type: 'text' },
        { id: 'bank_name', label: 'Bank Name', type: 'text' },
        { id: 'account_no', label: 'Account Number', type: 'text' },
        { id: 'ifsc', label: 'IFSC Code', type: 'text' },
        { id: 'address', label: 'Address', type: 'textarea', gridSpan: 4 }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'name', label: 'Vendor Name' },
        { key: 'email', label: 'Email' },
        { key: 'service_for', label: 'Service For' },
        { key: 'payment_cycle', label: 'Payment Cycle' },
        { key: 'gst_number', label: 'GST' },
        { key: 'bank_name', label: 'Bank' },
        { key: 'account_no', label: 'Account No' },
        { key: 'ifsc', label: 'IFSC' }
      ]}
    />
  );
}
