import React from 'react';
import MasterBase from './MasterBase';

export default function Chemicals(props) {
  return (
    <MasterBase
      {...props}
      title="Chemicals Master"
      modelName="chemicals"
      fields={[
        { id: 'chemical_name', label: 'Chemical Name', type: 'text', required: true }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'chemical_name', label: 'Chemical Name' },
        { key: 'date', label: 'Date' },
        { key: 'time', label: 'Time' },
        { key: 'email', label: 'User Email' }
      ]}
    />
  );
}
