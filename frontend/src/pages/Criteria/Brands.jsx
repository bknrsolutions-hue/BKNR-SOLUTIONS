import React from 'react';
import MasterBase from './MasterBase';

export default function Brands(props) {
  return (
    <MasterBase
      {...props}
      title="Brands Master"
      modelName="brands"
      fields={[
        { id: 'brand_name', label: 'Brand Name', type: 'text', required: true }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'brand_name', label: 'Brand Name' },
        { key: 'date', label: 'Date' },
        { key: 'time', label: 'Time' },
        { key: 'email', label: 'User Email' }
      ]}
    />
  );
}
