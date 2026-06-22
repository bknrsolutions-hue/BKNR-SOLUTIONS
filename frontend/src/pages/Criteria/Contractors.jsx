import React from 'react';
import MasterBase from './MasterBase';

export default function Contractors(props) {
  return (
    <MasterBase
      {...props}
      title="Contractors Master"
      modelName="contractors"
      fields={[
        { id: 'contractor_name', label: 'Contractor Name', type: 'text', required: true },
        { id: 'phone', label: 'Phone Number', type: 'text' },
        { id: 'contractor_email', label: 'Contractor Email', type: 'email' },
        { id: 'payment_cycle', label: 'Payment Cycle', type: 'text' },
        { id: 'gst_number', label: 'GST Number', type: 'text' },
        { id: 'gst_percent', label: 'GST %', type: 'number', step: '0.01' },
        { id: 'gst_applicable_from', label: 'GST Applicable From', type: 'date' },
        { id: 'bank_name', label: 'Bank Name', type: 'text' },
        { id: 'account_no', label: 'Account Number', type: 'text' },
        { id: 'ifsc', label: 'IFSC Code', type: 'text' },
        { id: 'address', label: 'Address', type: 'textarea', gridSpan: 4 }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'contractor_name', label: 'Contractor Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'contractor_email', label: 'Email' },
        { key: 'payment_cycle', label: 'Payment Cycle' },
        { key: 'gst_number', label: 'GST' },
        { key: 'bank_name', label: 'Bank Name' }
      ]}
    />
  );
}
