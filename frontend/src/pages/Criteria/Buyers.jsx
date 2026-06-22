import React from 'react';
import MasterBase from './MasterBase';

export default function Buyers(props) {
  return (
    <MasterBase
      {...props}
      title="Buyers Master"
      modelName="buyers"
      fields={[
        { id: 'buyer_name', label: 'Buyer Name', type: 'text', required: true },
        { id: 'address', label: 'Address', type: 'textarea', gridSpan: 4 }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'buyer_name', label: 'Buyer Name' },
        { key: 'address', label: 'Address' },
        { key: 'date', label: 'Date' },
        { key: 'time', label: 'Time' },
        { key: 'email', label: 'Authorized Node' }
      ]}
    />
  );
}
