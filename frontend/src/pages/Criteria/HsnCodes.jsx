import React from 'react';
import MasterBase from './MasterBase';

export default function HsnCodes(props) {
  return (
    <MasterBase
      {...props}
      title="HSN Codes Master"
      modelName="hsn_codes"
      fields={[
        { id: 'hsn_code', label: 'HSN Code', type: 'text', required: true },
        { id: 'description', label: 'Description', type: 'text', required: true },
        { id: 'gst_percent', label: 'GST Percent (%)', type: 'number', step: '0.01', required: true },
        { id: 'applicable_from', label: 'Applicable From', type: 'date', required: true }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'hsn_code', label: 'HSN Code' },
        { key: 'description', label: 'Description' },
        { key: 'gst_percent', label: 'GST Percent (%)' },
        { key: 'applicable_from', label: 'Applicable From' }
      ]}
    />
  );
}
