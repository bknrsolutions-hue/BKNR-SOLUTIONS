import React from 'react';
import MasterBase from './MasterBase';

export default function ShippingVendors(props) {
  return (
    <MasterBase
      {...props}
      title="Shipping Vendors Master"
      modelName="shipping_vendors"
      fields={[
        { id: 'vendor_name', label: 'Vendor Name', type: 'text', required: true },
        { id: 'gst_number', label: 'GST Number', type: 'text' },
        { id: 'payment_cycle', label: 'Payment Cycle', type: 'text' },
        { id: 'bank_name', label: 'Bank Name', type: 'text' },
        { id: 'account_no', label: 'Account Number', type: 'text' },
        { id: 'ifsc', label: 'IFSC Code', type: 'text' },
        { id: 'address', label: 'Address', type: 'textarea', gridSpan: 4 }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'vendor_name', label: 'Vendor Name' },
        { key: 'gst_number', label: 'GST Number' },
        { key: 'payment_cycle', label: 'Payment Cycle' },
        { key: 'bank_name', label: 'Bank Name' },
        { key: 'account_no', label: 'Account No' }
      ]}
    />
  );
}
