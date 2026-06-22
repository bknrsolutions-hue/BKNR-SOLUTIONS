import React from 'react';
import MasterBase from './MasterBase';

export default function Species(props) {
  return (
    <MasterBase
      {...props}
      title="Species Master"
      modelName="species"
      fields={[
        { id: 'species_name', label: 'Species Name', type: 'text', required: true }
      ]}
      columns={[
        { key: 'id', label: 'ID' },
        { key: 'species_name', label: 'Species Name' },
        { key: 'date', label: 'Date' },
        { key: 'time', label: 'Time' },
        { key: 'email', label: 'User Email' }
      ]}
    />
  );
}
